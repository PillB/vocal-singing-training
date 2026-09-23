/**
 * Anonymous usage events and A/B results.
 *
 * The site already records events on the visitor's own device
 * (js/analytics.js) and assigns experiment arms there (js/experiments.js). This
 * is the other half: a place those events can land, so that a switched-on
 * experiment produces a result somebody can read.
 *
 * What is stored, and what deliberately is not:
 * - An event is a name from a fixed list, a few flat properties (exercise ids,
 *   tiers, counts — never free text), the random browser id js/experiments.js
 *   keeps, the visitor's local day and timezone offset, and the time it
 *   arrived. No account id, no email, no IP address, no user agent.
 * - The IP is used only to rate-limit, and only as a salted hash that changes
 *   every day (the bucket key), which the sweep deletes after a day.
 * - A browser that sends Global Privacy Control or Do Not Track is not
 *   recorded at all — the site does not send in that case, and if something
 *   sends anyway the worker drops it.
 * - Automated browsers (headless Chrome, Playwright, crawlers) are dropped, so
 *   test runs against the live site cannot pollute a result.
 *
 * Exposure is its own table: the first `experiment_expose` a browser sends for
 * an experiment is the arm it is counted in, for good. Results are computed
 * from exposures joined to later events, so an arm is judged only on people
 * who actually saw it (js/experiments.js fires the exposure at the point of
 * exposure, not at assignment).
 */

"use strict";

import { callerIp, ensureSchema, hitRateLimit, nowSec, sha256Hex } from "./db.js";
import { compareMeans, compareRates, meanFromSums, sampleRatioMismatch, wilson } from "./stats.js";

/** Largest body the ingest route reads. A full batch is ~6 KB. */
export const MAX_EVENTS_BODY_BYTES = 16384;

/** Most events one request may carry; the client batches up to this. */
export const MAX_EVENTS_PER_REQUEST = 25;

/** Requests per hashed IP per hour. A busy real session sends a few dozen. */
export const EVENTS_RATE_LIMIT = [240, 3600];

/**
 * Every event name the site emits. Anything else is dropped, so the table
 * cannot be filled with arbitrary strings by somebody posting at the route.
 * Keep in step with the `track(...)` calls in js/.
 */
export const EVENT_NAMES = new Set([
  "ad_click",
  "ad_dismiss",
  "ad_impression",
  "ad_suppressed_practice",
  "ad_suppressed_pro",
  "app_open",
  "audio_compare",
  "basics_complete",
  "basics_incomplete",
  "basics_start",
  "comeback",
  "experiment_expose",
  "experiment_forced_view",
  "first_win",
  "first_win_micro",
  "loop_cards_open",
  "loop_goal_set",
  "loop_remind_click",
  "loop_tier_pick",
  "mic_blocked",
  "mic_primer_accept",
  "mic_primer_decline",
  "mic_primer_dismiss",
  "mic_primer_show",
  "milestone",
  "practice_day",
  "practice_recorded",
  "practice_start",
  "remind_due_shown",
  "reminder_enable",
  "rest_used",
  "session_save",
  "surprise_shown",
  "tour_complete",
  "tour_dismiss",
  "tour_guide_open",
  "tour_invite_accept",
  "tour_invite_dismiss",
  "tour_skip",
  "tour_start",
  "tour_step"
]);

/**
 * What each shipped experiment is judged on, so the results route can answer
 * with no parameters. Mirrors the comments in js/experiments-config.js.
 *
 * A metric is `{event, kind, from, to}`: for `share`, the share of exposed
 * people with at least one `event` in days [from, to) after their exposure;
 * for `days`, the mean number of distinct local days with that event in the
 * same window. Only people exposed at least `to` days ago are counted, or a
 * late arm would look worse simply for being younger.
 */
export const EXPERIMENT_PRESETS = {
  tour_shape_2026_10: {
    control: "invite",
    primary: { event: "first_win", kind: "share", from: 0, to: 7 },
    guardrails: [
      { event: "practice_day", kind: "share", from: 0, to: 7 },
      { event: "tour_dismiss", kind: "share", from: 0, to: 1 }
    ]
  },
  loop_home_2026_10: {
    control: "loop",
    primary: { event: "practice_day", kind: "share", from: 21, to: 28 },
    guardrails: [
      { event: "basics_complete", kind: "days", from: 0, to: 28 },
      { event: "practice_day", kind: "days", from: 0, to: 28 }
    ]
  },
  loop_surprise_2026_10: {
    control: "surprises",
    primary: { event: "practice_day", kind: "days", from: 0, to: 28 },
    guardrails: [{ event: "basics_complete", kind: "days", from: 0, to: 28 }]
  },
  loop_minimo_len_2026_10: {
    control: "three",
    primary: { event: "practice_day", kind: "days", from: 0, to: 28 },
    guardrails: [{ event: "basics_incomplete", kind: "share", from: 0, to: 28 }]
  },
  aa_2026_10: {
    control: "a",
    primary: { event: "practice_day", kind: "share", from: 0, to: 7 },
    guardrails: [{ event: "app_open", kind: "days", from: 0, to: 7 }]
  }
};

const CID_RE = /^[0-9a-z]{8,32}$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEY_RE = /^[a-z0-9_]{3,48}$/;
const VARIANT_RE = /^[a-z0-9_-]{1,24}$/;
const PROP_KEY_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
// Ids, tiers, pack names: letters, digits and a little punctuation. Anything
// with a space, an @ or a slash is not something the site sends, so it is not
// kept — that is what stops a prop from carrying free text.
const PROP_STRING_RE = /^[A-Za-z0-9_.:-]{0,64}$/;
const MAX_PROPS = 12;
const BOT_UA_RE = /bot|crawl|spider|slurp|headless|playwright|puppeteer|phantomjs|lighthouse|pagespeed|wget|curl|python-requests|node-fetch|undici/i;

/**
 * Keep only flat, short, id-like properties.
 * @param {unknown} raw Props from the client.
 * @returns {Object} Clean props.
 */
export function sanitizeProps(raw) {
  const out = {};
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return out;
  }
  let kept = 0;
  for (const key of Object.keys(raw)) {
    if (kept >= MAX_PROPS) {
      break;
    }
    if (!PROP_KEY_RE.test(key)) {
      continue;
    }
    const value = raw[key];
    if (value === null || typeof value === "boolean") {
      out[key] = value;
    } else if (typeof value === "number") {
      if (!Number.isFinite(value)) {
        continue;
      }
      out[key] = Math.round(value * 1000) / 1000;
    } else if (typeof value === "string") {
      if (!PROP_STRING_RE.test(value)) {
        continue;
      }
      out[key] = value;
    } else {
      continue;
    }
    kept += 1;
  }
  return out;
}

/**
 * Validate one event from the client.
 * @param {unknown} raw Event object.
 * @returns {{ok: boolean, reason?: string, event?: Object}} Clean event or why not.
 */
export function sanitizeEvent(raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ok: false, reason: "not_an_object" };
  }
  const name = typeof raw.name === "string" ? raw.name : "";
  if (!EVENT_NAMES.has(name)) {
    return { ok: false, reason: "unknown_event" };
  }
  const cid = typeof raw.cid === "string" ? raw.cid : "";
  if (!CID_RE.test(cid)) {
    return { ok: false, reason: "bad_cid" };
  }
  const day = typeof raw.day === "string" && DAY_RE.test(raw.day) ? raw.day : null;
  const tzNum = Number(raw.tz);
  const tz = Number.isInteger(tzNum) && tzNum >= -840 && tzNum <= 840 ? tzNum : null;
  const props = sanitizeProps(raw.props);
  const event = { name, cid, day, tz, props };

  if (name === "experiment_expose") {
    const experiment = typeof props.experiment === "string" ? props.experiment : "";
    const variant = typeof props.variant === "string" ? props.variant : "";
    // A forced `?ab_` view is somebody looking on purpose, and a switched-off
    // experiment splits nobody: neither is an exposure. The site does not send
    // either as one; this is the belt to that brace.
    if (KEY_RE.test(experiment) && VARIANT_RE.test(variant) && props.forced !== true && props.enabled === true) {
      event.exposure = { experiment, variant };
    }
  }
  return { ok: true, event };
}

/**
 * Why this request must not be recorded, or "" when it may be.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @returns {string} Reason code, or "".
 */
export function ingestRefusal(request, env) {
  if (String(env.EVENTS_ENABLED || "").trim().toLowerCase() === "false") {
    return "events_disabled";
  }
  if (request.headers.get("sec-gpc") === "1" || request.headers.get("dnt") === "1") {
    return "opted_out";
  }
  const ua = request.headers.get("user-agent") || "";
  if (!ua || BOT_UA_RE.test(ua)) {
    return "automated";
  }
  return "";
}

/**
 * Read the body with the ingest cap. The site posts `text/plain` (the only
 * content type a no-cors beacon may carry), so the header is not checked.
 * @param {Request} request Incoming request.
 * @returns {Promise<{ok: boolean, reason?: string, body?: unknown}>} Parsed body.
 */
async function readEventsBody(request) {
  const declared = Number.parseInt(request.headers.get("content-length") || "", 10);
  if (Number.isFinite(declared) && declared > MAX_EVENTS_BODY_BYTES) {
    return { ok: false, reason: "body_too_large" };
  }
  let buffer;
  try {
    buffer = await request.arrayBuffer();
  } catch {
    return { ok: false, reason: "bad_request" };
  }
  if (buffer.byteLength > MAX_EVENTS_BODY_BYTES) {
    return { ok: false, reason: "body_too_large" };
  }
  try {
    return { ok: true, body: JSON.parse(new TextDecoder().decode(buffer)) };
  } catch {
    return { ok: false, reason: "bad_request" };
  }
}

/**
 * POST /v1/events — record a batch of anonymous events.
 *
 * Answers 200 with counts on success. Refusals that are the visitor's choice
 * (GPC, DNT) or not ours to count (bots, switched off) answer 202 and store
 * nothing, so nothing on the client ever retries them.
 *
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables `{json, cors, now}`.
 * @returns {Promise<Response>} Response.
 */
export async function handleIngest(request, env, deps) {
  const { json, cors } = deps;
  const refusal = ingestRefusal(request, env);
  if (refusal) {
    return json({ ok: true, accepted: 0, reason: refusal }, 202, cors);
  }
  // Browsers always send Origin on a cross-site POST, no-cors included. This
  // does not stop a determined script, but it keeps other sites' pages from
  // writing here, and the rate limit and name list handle the rest.
  const allowed = typeof env.SITE_ORIGIN === "string" ? env.SITE_ORIGIN.trim() : "";
  if (!allowed || request.headers.get("Origin") !== allowed) {
    return json({ ok: false, reason: "origin_not_allowed" }, 403, cors);
  }
  if (!env.DB) {
    return json({ ok: false, reason: "events_not_configured" }, 503, cors);
  }
  const parsed = await readEventsBody(request);
  if (!parsed.ok) {
    return json({ ok: false, reason: parsed.reason }, parsed.reason === "body_too_large" ? 413 : 400, cors);
  }
  const body = parsed.body;
  const list = Array.isArray(body && body.events) ? body.events : body && typeof body === "object" ? [body] : [];
  if (!list.length || list.length > MAX_EVENTS_PER_REQUEST) {
    return json({ ok: false, reason: "bad_request" }, 400, cors);
  }

  await ensureSchema(env.DB);
  const at = nowSec(deps.now);
  // Salted with the UTC day so the bucket name cannot be joined across days,
  // and truncated because it only has to spread load, not identify anybody.
  const ipKey = (await sha256Hex(`events:${callerIp(request)}:${Math.floor(at / 86400)}`)).slice(0, 24);
  const [limit, windowSeconds] = EVENTS_RATE_LIMIT;
  const gate = await hitRateLimit(env.DB, `ev:${ipKey}`, limit, windowSeconds, at);
  if (!gate.ok) {
    return json({ ok: false, reason: "rate_limited", retryAfter: gate.retryAfter }, 429, {
      ...cors,
      "retry-after": String(gate.retryAfter)
    });
  }

  const statements = [];
  let dropped = 0;
  for (const raw of list) {
    const clean = sanitizeEvent(raw);
    if (!clean.ok) {
      dropped += 1;
      continue;
    }
    const e = clean.event;
    statements.push(
      env.DB
        .prepare(
          `INSERT INTO events (received_at, cid, name, day, tz, props)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
        )
        .bind(at, e.cid, e.name, e.day, e.tz, JSON.stringify(e.props))
    );
    if (e.exposure) {
      statements.push(
        env.DB
          .prepare(
            `INSERT OR IGNORE INTO exposures (experiment, cid, variant, first_at, day)
             VALUES (?1, ?2, ?3, ?4, ?5)`
          )
          .bind(e.exposure.experiment, e.cid, e.exposure.variant, at, e.day)
      );
    }
  }
  if (statements.length) {
    await env.DB.batch(statements);
  }
  return json({ ok: true, accepted: list.length - dropped, dropped }, 200, cors);
}

/**
 * Clamp a metric definition from query parameters or a preset.
 * @param {Object} raw `{event, kind, from, to}`.
 * @returns {{ok: boolean, reason?: string, metric?: Object}} Metric.
 */
export function normalizeMetric(raw) {
  const event = raw && typeof raw.event === "string" ? raw.event : "";
  if (!EVENT_NAMES.has(event)) {
    return { ok: false, reason: "unknown_metric" };
  }
  const kind = raw.kind === "days" ? "days" : "share";
  const from = Math.max(0, Math.min(365, Math.floor(Number(raw.from) || 0)));
  const toRaw = Math.floor(Number(raw.to));
  const to = Math.max(from + 1, Math.min(366, Number.isFinite(toRaw) && toRaw > 0 ? toRaw : 28));
  return { ok: true, metric: { event, kind, from, to } };
}

/**
 * Compute one metric per arm for an experiment.
 * @param {Object} db D1 binding.
 * @param {string} experiment Experiment key.
 * @param {Object} metric Normalized metric.
 * @param {string} control Control arm id.
 * @param {number} at Unix seconds, "now".
 * @returns {Promise<Object>} Per-arm values and comparisons against control.
 */
export async function computeMetric(db, experiment, metric, control, at) {
  const fromSec = metric.from * 86400;
  const toSec = metric.to * 86400;
  const matureBefore = at - toSec;
  let rows;
  if (metric.kind === "share") {
    const result = await db
      .prepare(
        `SELECT x.variant AS variant,
                COUNT(*) AS n,
                SUM(CASE WHEN EXISTS (
                  SELECT 1 FROM events e
                   WHERE e.cid = x.cid AND e.name = ?2
                     AND e.received_at >= x.first_at + ?3
                     AND e.received_at < x.first_at + ?4
                ) THEN 1 ELSE 0 END) AS k
           FROM exposures x
          WHERE x.experiment = ?1 AND x.first_at <= ?5
          GROUP BY x.variant`
      )
      .bind(experiment, metric.event, fromSec, toSec, matureBefore)
      .all();
    rows = result.results || [];
  } else {
    const result = await db
      .prepare(
        `SELECT variant, COUNT(*) AS n, SUM(d) AS s, SUM(d * d) AS ss FROM (
           SELECT x.variant AS variant,
                  (SELECT COUNT(DISTINCT COALESCE(e.day, date(e.received_at, 'unixepoch')))
                     FROM events e
                    WHERE e.cid = x.cid AND e.name = ?2
                      AND e.received_at >= x.first_at + ?3
                      AND e.received_at < x.first_at + ?4) AS d
             FROM exposures x
            WHERE x.experiment = ?1 AND x.first_at <= ?5
         ) GROUP BY variant`
      )
      .bind(experiment, metric.event, fromSec, toSec, matureBefore)
      .all();
    rows = result.results || [];
  }

  const arms = rows
    .map((r) => {
      const n = Number(r.n) || 0;
      if (metric.kind === "share") {
        const k = Number(r.k) || 0;
        const w = wilson(k, n);
        return { variant: r.variant, n, k, rate: w.rate, lo: w.lo, hi: w.hi };
      }
      const m = meanFromSums(n, Number(r.s) || 0, Number(r.ss) || 0);
      return { variant: r.variant, n, mean: m.mean, sd: m.sd, lo: m.lo, hi: m.hi };
    })
    .sort((a, b) => (a.variant === control ? -1 : b.variant === control ? 1 : a.variant < b.variant ? -1 : 1));

  const base = arms.find((a) => a.variant === control) || null;
  const comparisons = base
    ? arms
        .filter((a) => a !== base)
        .map((a) => ({
          variant: a.variant,
          vs: control,
          ...(metric.kind === "share"
            ? compareRates(base.k, base.n, a.k, a.n)
            : compareMeans(base, a))
        }))
    : [];
  const smallest = arms.reduce((m, a) => Math.min(m, a.n), arms.length ? Infinity : 0);
  return {
    ...metric,
    arms,
    comparisons,
    // Below ~30 an arm, the normal approximation behind the p-values is
    // shaky and an interval is the only honest summary.
    smallSample: smallest < 30
  };
}

/**
 * Exposure counts per arm for one experiment, or for all of them.
 * @param {Object} db D1 binding.
 * @param {string} [experiment] Experiment key.
 * @returns {Promise<Object[]>} Rows `{experiment, variant, n, first, last}`.
 */
export async function exposureCounts(db, experiment) {
  const statement = experiment
    ? db
        .prepare(
          `SELECT experiment, variant, COUNT(*) AS n, MIN(first_at) AS first, MAX(first_at) AS last
             FROM exposures WHERE experiment = ?1 GROUP BY experiment, variant ORDER BY experiment, variant`
        )
        .bind(experiment)
    : db.prepare(
        `SELECT experiment, variant, COUNT(*) AS n, MIN(first_at) AS first, MAX(first_at) AS last
           FROM exposures GROUP BY experiment, variant ORDER BY experiment, variant`
      );
  const result = await statement.all();
  return (result.results || []).map((r) => ({
    experiment: r.experiment,
    variant: r.variant,
    n: Number(r.n) || 0,
    first: Number(r.first) || null,
    last: Number(r.last) || null
  }));
}

/**
 * Parse `weights=1,1` into numbers, or equal weights for the arms seen.
 * @param {string|null} raw Query value.
 * @param {number} arms Number of arms.
 * @returns {number[]} Weights.
 */
function parseWeights(raw, arms) {
  const parsed = String(raw || "")
    .split(",")
    .map((w) => Number(w))
    .filter((w) => Number.isFinite(w) && w > 0);
  return parsed.length === arms ? parsed : Array.from({ length: arms }, () => 1);
}

/**
 * GET /v1/admin/experiments — every experiment with exposures, per arm, plus
 * the sample-ratio check.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handleListExperiments(env, deps) {
  const { json, cors } = deps;
  const rows = await exposureCounts(env.DB);
  const byKey = {};
  rows.forEach((r) => {
    (byKey[r.experiment] = byKey[r.experiment] || []).push(r);
  });
  const experiments = Object.keys(byKey).map((key) => {
    const arms = byKey[key];
    const srm = sampleRatioMismatch(
      arms.map((a) => a.n),
      arms.map(() => 1)
    );
    return {
      experiment: key,
      arms: arms.map((a) => ({ variant: a.variant, exposed: a.n, first: a.first, last: a.last })),
      srm: { p: srm.p, flagged: srm.flagged },
      preset: EXPERIMENT_PRESETS[key] || null
    };
  });
  // Presets with no exposures yet are listed too, so the panel shows what is
  // waiting to be switched on rather than an empty list.
  Object.keys(EXPERIMENT_PRESETS).forEach((key) => {
    if (!byKey[key]) {
      experiments.push({ experiment: key, arms: [], srm: { p: null, flagged: false }, preset: EXPERIMENT_PRESETS[key] });
    }
  });
  return json({ ok: true, experiments }, 200, cors);
}

/**
 * GET /v1/admin/experiments/results?experiment=KEY
 *   [&event=NAME&kind=share|days&from=0&to=28] [&control=ID] [&weights=1,1]
 *
 * With no metric parameters it answers the experiment's preset: its primary
 * metric and every guardrail.
 *
 * @param {Object} env Worker env bindings.
 * @param {URL} url Parsed URL.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handleExperimentResults(env, url, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  const experiment = url.searchParams.get("experiment") || "";
  if (!KEY_RE.test(experiment)) {
    return json({ ok: false, reason: "bad_request" }, 400, cors);
  }
  const preset = EXPERIMENT_PRESETS[experiment] || null;
  const armsRows = await exposureCounts(env.DB, experiment);
  const controlParam = url.searchParams.get("control");
  const control =
    (controlParam && VARIANT_RE.test(controlParam) && controlParam) ||
    (preset && preset.control) ||
    (armsRows[0] && armsRows[0].variant) ||
    "";

  let metrics;
  if (url.searchParams.get("event")) {
    const m = normalizeMetric({
      event: url.searchParams.get("event"),
      kind: url.searchParams.get("kind"),
      from: url.searchParams.get("from"),
      to: url.searchParams.get("to")
    });
    if (!m.ok) {
      return json({ ok: false, reason: m.reason }, 400, cors);
    }
    metrics = [{ role: "primary", metric: m.metric }];
  } else if (preset) {
    metrics = [
      { role: "primary", metric: normalizeMetric(preset.primary).metric },
      ...(preset.guardrails || []).map((g) => ({ role: "guardrail", metric: normalizeMetric(g).metric }))
    ];
  } else {
    return json({ ok: false, reason: "no_metric" }, 400, cors);
  }

  const ordered = armsRows
    .slice()
    .sort((a, b) => (a.variant === control ? -1 : b.variant === control ? 1 : a.variant < b.variant ? -1 : 1));
  const weights = parseWeights(url.searchParams.get("weights"), ordered.length);
  const srm = sampleRatioMismatch(
    ordered.map((a) => a.n),
    weights
  );

  const computed = [];
  for (const entry of metrics) {
    computed.push({ role: entry.role, ...(await computeMetric(env.DB, experiment, entry.metric, control, at)) });
  }

  return json(
    {
      ok: true,
      experiment,
      control,
      asOf: at,
      exposed: ordered.map((a) => ({ variant: a.variant, n: a.n, first: a.first, last: a.last })),
      srm: {
        chi2: srm.chi2,
        df: srm.df,
        p: srm.p,
        weights,
        flagged: srm.flagged
      },
      metrics: computed,
      readMe: srm.flagged
        ? "srm"
        : computed.some((m) => m.smallSample)
          ? "small_sample"
          : "ok"
    },
    200,
    cors
  );
}

/**
 * Route the events and experiment-results paths.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {URL} url Parsed URL.
 * @param {string} path Normalized path.
 * @param {Object} deps Injectables `{json, cors, now, requireAdmin}`.
 * @returns {Promise<Response|null>} Response, or null when the path is not ours.
 */
export async function routeEventsApi(request, env, url, path, deps) {
  const { json, cors } = deps;
  if (path === "/v1/events") {
    if (request.method !== "POST") {
      return json({ ok: false, reason: "method_not_allowed" }, 405, { ...cors, allow: "POST" });
    }
    return handleIngest(request, env, deps);
  }
  if (path !== "/v1/admin/experiments" && path !== "/v1/admin/experiments/results") {
    return null;
  }
  if (request.method !== "GET") {
    return json({ ok: false, reason: "method_not_allowed" }, 405, { ...cors, allow: "GET" });
  }
  if (!env.DB) {
    return json({ ok: false, reason: "accounts_not_configured" }, 503, cors);
  }
  await ensureSchema(env.DB);
  const admin = await deps.requireAdmin(env, request, nowSec(deps.now));
  if (!admin.ok) {
    return json({ ok: false, reason: admin.reason }, admin.status, cors);
  }
  return path === "/v1/admin/experiments"
    ? handleListExperiments(env, deps)
    : handleExperimentResults(env, url, deps);
}
