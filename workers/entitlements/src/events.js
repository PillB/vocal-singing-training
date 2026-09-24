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
 * - The IP is used only to rate-limit, and only as an HMAC under a secret key
 *   with the UTC day in it (the bucket key), which the sweep deletes within two
 *   days. Without the key nobody can go from a bucket back to an address.
 * - A browser that sends Global Privacy Control is not recorded at all — the
 *   site does not send in that case, and if something sends anyway the worker
 *   drops it. Do Not Track is no longer read, on either side (2026-09-24): no
 *   law requires it and the specification was discontinued in 2019.
 * - Automated browsers (headless Chrome, Playwright, crawlers) are dropped, so
 *   test runs against the live site cannot pollute a result.
 * - Events, exposures and the daily ingest counters are deleted at 180 days
 *   (db.js sweepExpired), and POST /v1/events/forget deletes one browser's
 *   rows at once.
 *
 * Exposure is its own table: the first exposure the worker receives for a
 * browser and an experiment is the arm it is counted in, for good. Results are
 * computed from exposures joined to later events, so an arm is judged only on
 * people who actually saw it (js/experiments.js fires the exposure at the point
 * of exposure, not at assignment). Only experiments and arms in
 * EXPERIMENT_PRESETS can be exposures; anything else is kept as an event only.
 */

"use strict";

import { callerIp, ensureSchema, hitRateLimit, hmacSha256Hex, nowSec } from "./db.js";
import { compareMeans, compareRates, homogeneity, meanFromSums, sampleRatioMismatch, wilson } from "./stats.js";

const DAY = 86400;

/** Largest body the ingest route reads. A full batch is ~6 KB. */
export const MAX_EVENTS_BODY_BYTES = 16384;

/** Most events one request may carry; the client batches up to this. */
export const MAX_EVENTS_PER_REQUEST = 25;

/**
 * Requests per browser id per hour. The real client sends about 65 in an hour
 * of practice, so this only stops one browser stuck in a loop.
 */
export const EVENTS_RATE_LIMIT = [180, 3600];

/**
 * Requests per hashed IP per hour: a backstop, not the throttle. A class of
 * twelve on one school wifi (or a carrier NAT) sends about 780 an hour, which
 * the old 240 refused two thirds of.
 */
export const EVENTS_IP_RATE_LIMIT = [3000, 3600];

/**
 * New exposure rows per hashed IP per UTC day. A fabricated exposure is what
 * could move a result, so it has its own tight cap; a real browser adds one row
 * per experiment it sees, once. Events over the cap are still kept.
 */
export const EXPOSURE_IP_CAP = [100, 86400];

/** Forget requests per hashed IP per hour. */
export const FORGET_RATE_LIMIT = [30, 3600];

/**
 * Every event name the site emits. Anything else is dropped, so the table
 * cannot be filled with arbitrary strings by somebody posting at the route.
 * Keep in step with the `track(...)` calls in js/.
 */
export const EVENT_NAMES = new Set([
  "account_panel_open",
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
  "first_track_pick",
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
  "signin_fail",
  "signin_start",
  "signin_success",
  "step_done_choice",
  "step_done_shown",
  "surprise_shown",
  "tour_complete",
  "tour_dismiss",
  "tour_guide_open",
  "tour_invite_accept",
  "tour_invite_dismiss",
  "tour_skip",
  "tour_start",
  "tour_step",
  // The account, sign-in and trial funnel, added 2026-09-24. None of these is an
  // arm event for any preset below: they fire from the same code in js/app.js in
  // every arm, which is what a metric has to be. account_panel_open carries
  // accountSignIn()'s own state, which is the one signal no A/B test would give —
  // a browser where Google's script will not load is a count, not a hypothesis.
  "trial_click",
  "trial_cta_view",
  "trial_first_practice",
  "trial_result"
]);

/**
 * The tour's own events: both tour arms send them, at a rate the arm itself
 * sets (the auto arm opens the tour, the invite arm only when asked).
 */
const TOUR_EVENTS = ["tour_start", "tour_step", "tour_complete", "tour_skip", "tour_dismiss", "tour_guide_open"];

/** The loop's own screens (js/daily-loop.js): sent only where the loop is on. */
const LOOP_EVENTS = [
  "basics_start",
  "basics_complete",
  "basics_incomplete",
  "loop_tier_pick",
  "loop_goal_set",
  "loop_cards_open",
  "loop_remind_click",
  "milestone",
  "rest_used",
  "surprise_shown"
];

/**
 * The registry: every experiment the worker will count, its arms, and what it
 * is judged on, so the results route answers with no parameters. Keep it in
 * step with js/experiments-config.js (same keys, same arm ids in the same
 * order, same weights); an exposure for anything not here is not recorded.
 *
 * - `armEvents` lists, per arm, the events that come from the screens the arms
 *   differ in. A metric must be an event every arm sends through the same code,
 *   so none of these may be one: the loop arm alone sent `basics_complete`, and
 *   a readout on it crowned "loop" at p ≈ 1e-39 with both arms behaving the
 *   same. test/events.test.mjs checks every preset against this, and
 *   tests/ab-events.spec.js checks the claim against the real client.
 * - `plan` is fixed before the test starts: `nPerArm` people per arm whose
 *   windows have closed, and at least `minDays` days since the first exposure.
 *   Until both hold the route shows counts but no comparison (readMe
 *   "too_early"); looking every day and stopping at the first p < 0.05 turns a
 *   5% false-positive rate into about 20%. `mde` is the effect `nPerArm` was
 *   sized for (a share difference, or days), two-sided alpha 0.05, 80% power.
 * - A metric is `{event, kind, from, to}`: for `share`, the share of exposed
 *   people with at least one `event` in days [from, to) after their exposure;
 *   for `days`, the mean number of distinct local days with that event in the
 *   same window. Only people exposed at least `to` days ago are counted, or a
 *   late arm would look worse simply for being younger.
 */
export const EXPERIMENT_PRESETS = {
  aa_2026_10: {
    arms: ["a", "b"],
    weights: [1, 1],
    control: "a",
    armEvents: { a: [], b: [] },
    // Two identical arms: 150 each is enough to see an uneven split or a
    // pipeline that counts one arm differently. Two weeks covers both weekends.
    plan: { nPerArm: 150, minDays: 14, mde: null },
    primary: { event: "practice_day", kind: "share", from: 0, to: 7 },
    guardrails: [{ event: "app_open", kind: "days", from: 0, to: 7 }]
  },
  tour_shape_2026_10: {
    arms: ["invite", "auto"],
    weights: [1, 1],
    control: "invite",
    armEvents: { invite: ["tour_invite_accept", "tour_invite_dismiss", ...TOUR_EVENTS], auto: TOUR_EVENTS },
    // 30% -> 45% first wins in the first week.
    plan: { nPerArm: 160, minDays: 14, mde: 0.15 },
    primary: { event: "first_win", kind: "share", from: 0, to: 7 },
    guardrails: [
      { event: "practice_day", kind: "share", from: 0, to: 7 },
      // Practised on the first day: a tour that opens itself must not get in
      // the way of the first practice.
      { event: "practice_day", kind: "share", from: 0, to: 1 }
    ]
  },
  loop_home_2026_10: {
    arms: ["loop", "classic"],
    weights: [1, 1],
    control: "loop",
    armEvents: { loop: LOOP_EVENTS, classic: [] },
    // 30% -> 40% still practising in the fourth week.
    plan: { nPerArm: 355, minDays: 28, mde: 0.1 },
    primary: { event: "practice_day", kind: "share", from: 21, to: 28 },
    guardrails: [
      { event: "practice_day", kind: "days", from: 0, to: 28 },
      { event: "mic_blocked", kind: "share", from: 0, to: 28 }
    ]
  },
  loop_surprise_2026_10: {
    arms: ["surprises", "none"],
    weights: [1, 1],
    control: "surprises",
    // Exposed inside the loop, on a finished routine, so both arms send the
    // loop's events; only the surprise itself differs.
    armEvents: { surprises: ["surprise_shown", "loop_cards_open"], none: [] },
    // +1.5 practice days in 28 (mean 6, SD 6).
    plan: { nPerArm: 250, minDays: 28, mde: 1.5 },
    primary: { event: "practice_day", kind: "days", from: 0, to: 28 },
    guardrails: [{ event: "basics_complete", kind: "days", from: 0, to: 28 }]
  },
  loop_minimo_len_2026_10: {
    arms: ["three", "five"],
    weights: [1, 1],
    control: "three",
    // Exposed on starting the Mínimo, inside the loop: both arms run the same
    // code with longer steps in one.
    armEvents: { three: [], five: [] },
    // +1 practice day in 28 (mean 6, SD 6).
    plan: { nPerArm: 565, minDays: 28, mde: 1 },
    primary: { event: "practice_day", kind: "days", from: 0, to: 28 },
    guardrails: [{ event: "basics_incomplete", kind: "share", from: 0, to: 28 }]
  }
};

/**
 * Checked on every result besides the metrics' own events: sent through the
 * same code in every arm of every experiment. `app_open` is also tested for a
 * difference between arms, because around the moment of exposure everybody
 * has the app open, whatever the arm.
 */
export const MIX_CHECK_EVENTS = ["app_open", "practice_start", "practice_recorded"];

/**
 * What the ingest counters count, per UTC day (table ingest_daily): events
 * kept, events dropped one by one, exposures, and whole requests turned away.
 * The reason is always one of these strings, never anything from a request.
 */
export const INGEST_REASONS = {
  event: ["accepted", "unknown_event", "bad_cid", "not_an_object"],
  exposure: ["exposure_new", "exposure_recovered", "exposure_unregistered", "exposure_capped"],
  request: ["origin_not_allowed", "rate_limited", "opted_out", "automated", "body_too_large", "bad_request", "forget"]
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
// An app_open prop that re-asserts an arm: `x_<experiment key>: <arm>`.
const REASSERT_RE = /^x_([a-z0-9_]{3,30})$/;

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
 * Is this an experiment and arm the registry knows?
 * @param {Object} presets Registry.
 * @param {string} experiment Key.
 * @param {unknown} variant Arm id.
 * @returns {boolean} True when both are registered.
 */
function isRegisteredArm(presets, experiment, variant) {
  const preset = Object.prototype.hasOwnProperty.call(presets, experiment) ? presets[experiment] : null;
  return !!preset && typeof variant === "string" && preset.arms.includes(variant);
}

/**
 * Validate one event from the client.
 *
 * An exposure comes from `experiment_expose`, or from an `app_open` that
 * re-asserts the arms this browser was already exposed to (`x_<key>: <arm>`,
 * js/daily-loop.js): the first exposure beacon can be lost to a dropped
 * connection, or never sent because the endpoint was not set yet, and the
 * device has already marked it as spent. Either way it counts only when the
 * experiment and arm are in the registry.
 *
 * @param {unknown} raw Event object.
 * @param {Object} [registry] Experiment registry (default EXPERIMENT_PRESETS).
 * @returns {{ok: boolean, reason?: string, event?: Object}} Clean event or why not.
 */
export function sanitizeEvent(raw, registry) {
  const presets = registry || EXPERIMENT_PRESETS;
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
  const event = { name, cid, day, tz, props, exposures: [], unregistered: 0 };

  if (name === "experiment_expose") {
    const experiment = typeof props.experiment === "string" ? props.experiment : "";
    const variant = typeof props.variant === "string" ? props.variant : "";
    // A forced `?ab_` view is somebody looking on purpose, and a switched-off
    // experiment splits nobody: neither is an exposure. The site does not send
    // either as one; this is the belt to that brace.
    if (KEY_RE.test(experiment) && VARIANT_RE.test(variant) && props.forced !== true && props.enabled === true) {
      if (isRegisteredArm(presets, experiment, variant)) {
        event.exposures.push({ experiment, variant, via: "expose" });
      } else {
        event.unregistered += 1;
      }
    }
  } else if (name === "app_open") {
    Object.keys(props).forEach((key) => {
      const match = REASSERT_RE.exec(key);
      if (!match) {
        return;
      }
      if (isRegisteredArm(presets, match[1], props[key])) {
        event.exposures.push({ experiment: match[1], variant: props[key], via: "app_open" });
      } else {
        event.unregistered += 1;
      }
    });
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
  if (request.headers.get("sec-gpc") === "1") {
    return "opted_out";
  }
  const ua = request.headers.get("user-agent") || "";
  if (!ua || BOT_UA_RE.test(ua)) {
    return "automated";
  }
  return "";
}

/**
 * Browsers always send Origin on a cross-site POST, no-cors included. This
 * does not stop a determined script, but it keeps other sites' pages from
 * writing here, and the limits and the registry handle the rest.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @returns {boolean} True when the request comes from the site.
 */
function fromSite(request, env) {
  const allowed = typeof env.SITE_ORIGIN === "string" ? env.SITE_ORIGIN.trim() : "";
  return !!allowed && request.headers.get("Origin") === allowed;
}

/**
 * The key the IP bucket is an HMAC under: EVENTS_IP_KEY when it is set,
 * otherwise one derived from the license signing key, so any deploy that can
 * sell Pro can also count without a salt anybody could read in this repo.
 * @param {Object} env Worker env bindings.
 * @returns {string} Key, or "" when neither secret exists.
 */
function ipSecret(env) {
  const own = typeof env.EVENTS_IP_KEY === "string" ? env.EVENTS_IP_KEY.trim() : "";
  if (own) {
    return own;
  }
  const signing = typeof env.LICENSE_PRIVATE_KEY_PKCS8_B64 === "string" ? env.LICENSE_PRIVATE_KEY_PKCS8_B64.trim() : "";
  return signing ? `events-ip:${signing}` : "";
}

/**
 * The rate-limit bucket for the caller's address: an HMAC with the UTC day in
 * the message, so two days' buckets cannot be joined, cut to 96 bits because it
 * only has to spread load, not identify anybody.
 * @param {Object} env Worker env bindings.
 * @param {Request} request Incoming request.
 * @param {number} at Unix seconds.
 * @returns {Promise<string>} 24 hex characters.
 */
export async function ipBucketKey(env, request, at) {
  return (await hmacSha256Hex(ipSecret(env), `events:${callerIp(request)}:${Math.floor(at / DAY)}`)).slice(0, 24);
}

/**
 * Add to today's ingest counters. Best effort: counting must never be the
 * reason a request fails.
 * @param {Object|undefined} db D1 binding.
 * @param {number} at Unix seconds.
 * @param {Object<string, number>} counts Reason -> how many.
 * @returns {Promise<void>} Resolves when written (or skipped).
 */
export async function countIngest(db, at, counts) {
  const entries = Object.entries(counts || {}).filter(([, n]) => n > 0);
  if (!db || !entries.length) {
    return;
  }
  const day = new Date(at * 1000).toISOString().slice(0, 10);
  try {
    await ensureSchema(db);
    await db.batch(
      entries.map(([reason, n]) =>
        db
          .prepare(
            `INSERT INTO ingest_daily (day, reason, n) VALUES (?1, ?2, ?3)
             ON CONFLICT(day, reason) DO UPDATE SET n = n + ?3`
          )
          .bind(day, reason, n)
      )
    );
  } catch (error) {
    console.error("ingest counter", error && error.message);
  }
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
 * The exposures in a batch that are not stored yet: one per (experiment,
 * browser), the first in the batch winning.
 * @param {Object} db D1 binding.
 * @param {Object[]} events Clean events.
 * @returns {Promise<Object[]>} `{experiment, variant, via, cid, day}` rows to insert.
 */
async function newExposures(db, events) {
  const wanted = new Map();
  events.forEach((e) => {
    e.exposures.forEach((x) => {
      const id = `${x.experiment}\n${e.cid}`;
      if (!wanted.has(id)) {
        wanted.set(id, { ...x, cid: e.cid, day: e.day });
      }
    });
  });
  if (!wanted.size) {
    return [];
  }
  const cids = [...new Set([...wanted.values()].map((x) => x.cid))];
  const result = await db
    .prepare(`SELECT experiment, cid FROM exposures WHERE cid IN (${cids.map((_, i) => `?${i + 1}`).join(", ")})`)
    .bind(...cids)
    .all();
  const have = new Set((result.results || []).map((r) => `${r.experiment}\n${r.cid}`));
  return [...wanted.entries()].filter(([id]) => !have.has(id)).map(([, x]) => x);
}

/**
 * POST /v1/events — record a batch of anonymous events.
 *
 * Answers 200 with counts on success. Refusals that are the visitor's choice
 * (GPC) or not ours to count (bots, switched off) answer 202 and store
 * nothing, so nothing on the client ever retries them. Every outcome adds to
 * the day's ingest counters (except the kill switch, which records nothing),
 * because the client posts no-cors and can never see a refusal itself.
 *
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables `{json, cors, now, presets}`.
 * @returns {Promise<Response>} Response.
 */
export async function handleIngest(request, env, deps) {
  const { json, cors } = deps;
  const presets = deps.presets || EXPERIMENT_PRESETS;
  const at = nowSec(deps.now);
  const refusal = ingestRefusal(request, env);
  if (refusal) {
    if (refusal !== "events_disabled") {
      await countIngest(env.DB, at, { [refusal]: 1 });
    }
    return json({ ok: true, accepted: 0, reason: refusal }, 202, cors);
  }
  if (!fromSite(request, env)) {
    await countIngest(env.DB, at, { origin_not_allowed: 1 });
    return json({ ok: false, reason: "origin_not_allowed" }, 403, cors);
  }
  if (!env.DB || !ipSecret(env)) {
    return json({ ok: false, reason: "events_not_configured" }, 503, cors);
  }
  const parsed = await readEventsBody(request);
  if (!parsed.ok) {
    await countIngest(env.DB, at, { [parsed.reason]: 1 });
    return json({ ok: false, reason: parsed.reason }, parsed.reason === "body_too_large" ? 413 : 400, cors);
  }
  const body = parsed.body;
  const list = Array.isArray(body && body.events) ? body.events : body && typeof body === "object" ? [body] : [];
  if (!list.length || list.length > MAX_EVENTS_PER_REQUEST) {
    await countIngest(env.DB, at, { bad_request: 1 });
    return json({ ok: false, reason: "bad_request" }, 400, cors);
  }

  await ensureSchema(env.DB);
  const ipKey = await ipBucketKey(env, request, at);
  const limited = (gate) => {
    return json({ ok: false, reason: "rate_limited", retryAfter: gate.retryAfter }, 429, {
      ...cors,
      "retry-after": String(gate.retryAfter)
    });
  };
  const ipGate = await hitRateLimit(env.DB, `ev:${ipKey}`, EVENTS_IP_RATE_LIMIT[0], EVENTS_IP_RATE_LIMIT[1], at);
  if (!ipGate.ok) {
    await countIngest(env.DB, at, { rate_limited: 1 });
    return limited(ipGate);
  }

  const counts = { accepted: 0, unknown_event: 0, bad_cid: 0, not_an_object: 0, exposure_unregistered: 0 };
  const clean = [];
  for (const raw of list) {
    const result = sanitizeEvent(raw, presets);
    if (!result.ok) {
      counts[result.reason] += 1;
      continue;
    }
    clean.push(result.event);
    counts.exposure_unregistered += result.event.unregistered;
  }
  // Per browser, so one browser stuck in a loop cannot spend a classroom's
  // shared address. The site sends one browser's events per request.
  if (clean.length) {
    const gate = await hitRateLimit(env.DB, `evc:${clean[0].cid}`, EVENTS_RATE_LIMIT[0], EVENTS_RATE_LIMIT[1], at);
    if (!gate.ok) {
      await countIngest(env.DB, at, { rate_limited: 1 });
      return limited(gate);
    }
  }

  let fresh = await newExposures(env.DB, clean);
  if (fresh.length) {
    const cap = await hitRateLimit(env.DB, `exn:${ipKey}`, EXPOSURE_IP_CAP[0], EXPOSURE_IP_CAP[1], at, fresh.length);
    if (!cap.ok) {
      counts.exposure_capped = fresh.length;
      fresh = [];
    }
  }

  const statements = clean.map((e) =>
    env.DB
      .prepare(
        `INSERT INTO events (received_at, cid, name, day, tz, props)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)`
      )
      .bind(at, e.cid, e.name, e.day, e.tz, JSON.stringify(e.props))
  );
  fresh.forEach((x) => {
    statements.push(
      env.DB
        .prepare(
          `INSERT OR IGNORE INTO exposures (experiment, cid, variant, first_at, day)
           VALUES (?1, ?2, ?3, ?4, ?5)`
        )
        .bind(x.experiment, x.cid, x.variant, at, x.day)
    );
  });
  if (statements.length) {
    await env.DB.batch(statements);
  }
  counts.accepted = clean.length;
  counts.exposure_new = fresh.length;
  counts.exposure_recovered = fresh.filter((x) => x.via === "app_open").length;
  await countIngest(env.DB, at, counts);
  return json({ ok: true, accepted: clean.length, dropped: list.length - clean.length }, 200, cors);
}

/**
 * POST /v1/events/forget — delete everything stored under one browser id.
 *
 * The body is `{cid}`, sent by the guide's switch as it stops sending
 * (js/privacy-switch.js). Holding the random id is what entitles a caller to
 * delete its rows: it is not tied to a person, and nobody else has it.
 * Deleting is always allowed: neither the kill switch nor a privacy signal
 * stops it.
 *
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables `{json, cors, now}`.
 * @returns {Promise<Response>} Response.
 */
export async function handleForget(request, env, deps) {
  const { json, cors } = deps;
  const at = nowSec(deps.now);
  if (!fromSite(request, env)) {
    await countIngest(env.DB, at, { origin_not_allowed: 1 });
    return json({ ok: false, reason: "origin_not_allowed" }, 403, cors);
  }
  if (!env.DB || !ipSecret(env)) {
    return json({ ok: false, reason: "events_not_configured" }, 503, cors);
  }
  const parsed = await readEventsBody(request);
  if (!parsed.ok) {
    return json({ ok: false, reason: parsed.reason }, parsed.reason === "body_too_large" ? 413 : 400, cors);
  }
  const cid = parsed.body && typeof parsed.body.cid === "string" ? parsed.body.cid : "";
  if (!CID_RE.test(cid)) {
    return json({ ok: false, reason: "bad_cid" }, 400, cors);
  }
  await ensureSchema(env.DB);
  const ipKey = await ipBucketKey(env, request, at);
  const gate = await hitRateLimit(env.DB, `evf:${ipKey}`, FORGET_RATE_LIMIT[0], FORGET_RATE_LIMIT[1], at);
  if (!gate.ok) {
    return json({ ok: false, reason: "rate_limited", retryAfter: gate.retryAfter }, 429, {
      ...cors,
      "retry-after": String(gate.retryAfter)
    });
  }
  const [events, exposures] = await env.DB.batch([
    env.DB.prepare("DELETE FROM events WHERE cid = ?1").bind(cid),
    env.DB.prepare("DELETE FROM exposures WHERE cid = ?1").bind(cid),
    env.DB.prepare("DELETE FROM rate_limits WHERE bucket = ?1").bind(`evc:${cid}`)
  ]);
  await countIngest(env.DB, at, { forget: 1 });
  const changes = (r) => Number(r && r.meta && r.meta.changes) || 0;
  return json({ ok: true, deleted: { events: changes(events), exposures: changes(exposures) } }, 200, cors);
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
 * The events some arm of this experiment sends and another may not.
 * @param {Object} preset Registry entry.
 * @returns {Set<string>} Event names no metric may use.
 */
export function armDependentEvents(preset) {
  const out = new Set();
  Object.values((preset && preset.armEvents) || {}).forEach((list) => list.forEach((name) => out.add(name)));
  return out;
}

/**
 * What is wrong with a registry entry, one sentence each; empty when nothing.
 * test/events.test.mjs runs this over every preset, so a metric one arm cannot
 * send fails the build rather than a beta.
 * @param {string} key Experiment key.
 * @param {Object} preset Registry entry.
 * @returns {string[]} Problems.
 */
export function presetProblems(key, preset) {
  const out = [];
  if (!REASSERT_RE.test(`x_${key}`)) {
    out.push(`${key}: the key must be 3-30 of a-z, 0-9 and _, so x_<key> fits an app_open prop`);
  }
  const arms = Array.isArray(preset.arms) ? preset.arms : [];
  if (arms.length < 2 || new Set(arms).size !== arms.length || !arms.every((a) => VARIANT_RE.test(a))) {
    out.push(`${key}: needs two or more distinct arm ids`);
  }
  if (!Array.isArray(preset.weights) || preset.weights.length !== arms.length || !preset.weights.every((w) => w > 0)) {
    out.push(`${key}: needs one positive weight per arm`);
  }
  if (!arms.includes(preset.control)) {
    out.push(`${key}: the control must be one of its arms`);
  }
  arms.forEach((arm) => {
    const list = preset.armEvents && preset.armEvents[arm];
    if (!Array.isArray(list)) {
      out.push(`${key}: armEvents has no list for "${arm}"`);
    } else {
      list.filter((name) => !EVENT_NAMES.has(name)).forEach((name) => out.push(`${key}: "${name}" is not an event the site sends`));
    }
  });
  const plan = preset.plan || {};
  if (!(Number.isInteger(plan.nPerArm) && plan.nPerArm >= 30) || !(Number.isInteger(plan.minDays) && plan.minDays >= 1)) {
    out.push(`${key}: needs a plan with nPerArm >= 30 and minDays >= 1`);
  }
  const dependent = armDependentEvents(preset);
  [preset.primary, ...(preset.guardrails || [])].forEach((raw) => {
    const m = normalizeMetric(raw || {});
    if (!m.ok) {
      out.push(`${key}: "${raw && raw.event}" is not an event the site sends`);
      return;
    }
    if (m.metric.from !== raw.from || m.metric.to !== raw.to || m.metric.kind !== raw.kind) {
      out.push(`${key}: ${raw.event} ${raw.kind} ${raw.from}-${raw.to} is not a valid window`);
    }
    if (dependent.has(raw.event)) {
      out.push(`${key}: "${raw.event}" is sent only by some arms, so it cannot be a metric`);
    }
  });
  return out;
}

/**
 * Compute one metric per arm for an experiment.
 * @param {Object} db D1 binding.
 * @param {string} experiment Experiment key.
 * @param {Object} metric Normalized metric.
 * @param {string} control Control arm id.
 * @param {number} at Unix seconds, "now".
 * @param {number|null} [cohortEnd] Count only people exposed by then (the
 *   planned sample, once it is complete).
 * @returns {Promise<Object>} Per-arm values and comparisons against control.
 */
export async function computeMetric(db, experiment, metric, control, at, cohortEnd) {
  const fromSec = metric.from * DAY;
  const toSec = metric.to * DAY;
  const matureBefore = Number.isFinite(cohortEnd) ? Math.min(at - toSec, cohortEnd) : at - toSec;
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
 * Parse `weights=1,1` into numbers, or the registry's weights.
 * @param {string|null} raw Query value.
 * @param {number[]} fallback The registry's weights, one per arm.
 * @returns {number[]} Weights.
 */
function parseWeights(raw, fallback) {
  const parsed = String(raw || "")
    .split(",")
    .map((w) => Number(w))
    .filter((w) => Number.isFinite(w) && w > 0);
  return parsed.length === fallback.length ? parsed : fallback.slice();
}

/**
 * Where an experiment stands against its plan.
 *
 * The result is read on a fixed sample: the people exposed up to the moment
 * the last arm reached `nPerArm` (`cohortEnd`). It opens once all of them are
 * past their longest window and `minDays` have passed since the first
 * exposure (`readyAt`), and from then on it no longer changes, so looking
 * again cannot move it. Before that, `readyAt` is an estimate from the rate
 * people have been arriving at, or null when an arm has nobody yet.
 *
 * @param {Object} db D1 binding.
 * @param {string} experiment Key.
 * @param {Object} preset Registry entry.
 * @param {Object[]} arms Exposure counts per registered arm.
 * @param {Object[]} metrics Normalized preset metrics.
 * @param {number} at Unix seconds.
 * @returns {Promise<Object>} Horizon.
 */
export async function computeHorizon(db, experiment, preset, arms, metrics, at) {
  const { nPerArm, minDays } = preset.plan;
  const maxTo = metrics.reduce((m, x) => Math.max(m, x.to), 1);
  const firsts = arms.filter((a) => a.n > 0 && a.first).map((a) => a.first);
  const startedAt = firsts.length ? Math.min(...firsts) : null;
  let cohortEnd = null;
  if (arms.length && arms.every((a) => a.n >= nPerArm)) {
    cohortEnd = 0;
    for (const a of arms) {
      const row = await db
        .prepare(
          `SELECT first_at FROM exposures WHERE experiment = ?1 AND variant = ?2
            ORDER BY first_at LIMIT 1 OFFSET ?3`
        )
        .bind(experiment, a.variant, nPerArm - 1)
        .first();
      cohortEnd = Math.max(cohortEnd, Number(row && row.first_at) || 0);
    }
  }
  const earliest = startedAt === null ? null : startedAt + minDays * DAY;
  let readyAt = null;
  let estimated = false;
  if (cohortEnd !== null) {
    readyAt = Math.max(cohortEnd + maxTo * DAY, earliest);
  } else if (startedAt !== null && arms.every((a) => a.n > 0)) {
    const elapsed = Math.max(DAY, at - startedAt);
    const filled = arms.reduce((m, a) => Math.max(m, at + Math.ceil(((nPerArm - Math.min(a.n, nPerArm)) * elapsed) / a.n)), at);
    readyAt = Math.max(filled + maxTo * DAY, earliest);
    estimated = true;
  }
  const cutoff = cohortEnd === null ? at - maxTo * DAY : Math.min(at - maxTo * DAY, cohortEnd);
  const matured = await db
    .prepare(`SELECT variant, COUNT(*) AS n FROM exposures WHERE experiment = ?1 AND first_at <= ?2 GROUP BY variant`)
    .bind(experiment, cutoff)
    .all();
  const maturedBy = Object.fromEntries((matured.results || []).map((r) => [r.variant, Number(r.n) || 0]));
  return {
    nPerArm,
    minDays,
    mde: preset.plan.mde === undefined ? null : preset.plan.mde,
    maxTo,
    startedAt,
    cohortEnd,
    readyAt,
    estimated,
    reached: readyAt !== null && !estimated && at >= readyAt,
    // People per arm counted so far: the smallest arm, since it is the one
    // the plan waits for.
    counted: arms.length ? Math.min(...arms.map((a) => maturedBy[a.variant] || 0)) : 0
  };
}

/**
 * The instrumentation check: for each event the result leans on, the share of
 * each arm's exposed people who sent it around their exposure. The fault this
 * is for is an event one arm does not send at all (the loop arm alone sent
 * practice_day), which neither the sample-ratio check nor an A/A test can see.
 *
 * Flags an event when an arm has none of it although, at the rate the arms
 * share, it should have had at least seven (p < 0.001 of that by chance); and
 * flags `app_open` when its rate differs between arms beyond chance
 * (chi-square p < 0.001), because at the moment of exposure everybody has the
 * app open. Other events are not tested for a plain difference: a treatment
 * may move them for real.
 *
 * @param {Object} db D1 binding.
 * @param {string} experiment Key.
 * @param {Object} preset Registry entry.
 * @param {string[]} metricEvents Events the metrics use.
 * @param {number} at Unix seconds.
 * @param {number|null} cohortEnd Planned sample's last exposure, when known.
 * @returns {Promise<Object>} `{events: [...], flagged}`.
 */
export async function computeEventMix(db, experiment, preset, metricEvents, at, cohortEnd) {
  const names = [...new Set([...metricEvents, ...MIX_CHECK_EVENTS])];
  // Only people whose first day since exposure is over.
  const cutoff = cohortEnd === null ? at - DAY : Math.min(at - DAY, cohortEnd);
  const events = [];
  for (const event of names) {
    // app_open is looked for on either side of the exposure: the first open
    // of a visit often reaches the worker in the batch before the exposure.
    const from = event === "app_open" ? -1 : 0;
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
      .bind(experiment, event, from * DAY, DAY, cutoff)
      .all();
    const byArm = Object.fromEntries((result.results || []).map((r) => [r.variant, r]));
    const arms = preset.arms.map((variant) => {
      const n = Number(byArm[variant] && byArm[variant].n) || 0;
      const k = Number(byArm[variant] && byArm[variant].k) || 0;
      return { variant, n, k, share: n > 0 ? k / n : null };
    });
    const test = homogeneity(
      arms.map((a) => a.k),
      arms.map((a) => a.n)
    );
    let reason = null;
    if (arms.every((a) => a.n >= 30)) {
      const n = arms.reduce((s, a) => s + a.n, 0);
      const pooled = arms.reduce((s, a) => s + a.k, 0) / n;
      if (arms.some((a) => a.k === 0 && a.n * pooled >= 7)) {
        reason = "missing";
      } else if (event === "app_open" && test.p !== null && test.p < 0.001) {
        reason = "differs";
      }
    }
    events.push({ event, from, to: 1, arms, p: test.p, flagged: reason !== null, reason });
  }
  return { events, flagged: events.some((e) => e.flagged) };
}

/**
 * The last week of ingest counters, and when the last event arrived.
 * @param {Object} db D1 binding.
 * @param {number} at Unix seconds.
 * @returns {Promise<Object>} `{since, days, totals, lastAcceptedAt}`.
 */
export async function ingestSummary(db, at) {
  const since = new Date((at - 6 * DAY) * 1000).toISOString().slice(0, 10);
  const result = await db
    .prepare("SELECT day, reason, n FROM ingest_daily WHERE day >= ?1 ORDER BY day, reason")
    .bind(since)
    .all();
  const days = {};
  const totals = {};
  (result.results || []).forEach((r) => {
    const n = Number(r.n) || 0;
    (days[r.day] = days[r.day] || {})[r.reason] = n;
    totals[r.reason] = (totals[r.reason] || 0) + n;
  });
  const last = await db.prepare("SELECT MAX(received_at) AS t FROM events").first();
  return {
    since,
    days: Object.keys(days)
      .sort()
      .map((day) => ({ day, counts: days[day] })),
    totals,
    lastAcceptedAt: Number(last && last.t) || null
  };
}

/**
 * The account and trial funnel, as one proportion per step.
 *
 * Deliberately NOT an A/B comparison. At this site's traffic a between-arm
 * comparison on a 2% funnel needs about 21,000 browsers per arm to detect a 20%
 * relative lift; a single proportion with a Wilson bound finds a BROKEN step
 * with about thirty visitors. Nought of twenty people passing a step bounds its
 * true rate below 16%; twenty of twenty bounds it above 84%. What this readout
 * cannot do is detect an improvement of a few points, and it says so in
 * `readMe` rather than letting a reader assume otherwise.
 *
 * Each step's denominator is the browsers that reached the PREVIOUS step, so the
 * rate is conditional and the chain multiplies out. One row per browser comes
 * back from D1, which at this traffic is hundreds of rows, not millions.
 */
export const FUNNEL_STEPS = [
  { key: "app_open", label: "opened the site" },
  { key: "account_panel_open", label: "opened the account panel" },
  { key: "signin_start", label: "started signing in" },
  { key: "signin_success", label: "signed in" },
  { key: "trial_cta_view", label: "saw the trial offer" },
  { key: "trial_click", label: "pressed it" },
  { key: "trial_result", label: "got an answer" },
  { key: "trial_first_practice", label: "practised on the trial" }
];

/** The states account_panel_open reports, so a zero is visible as a zero. */
export const PANEL_STATES = [
  "signed_in",
  "not_configured",
  "checking",
  "unreachable",
  "blocked",
  "offered",
  "no_method"
];

/**
 * Count distinct browsers per value of one prop of one event.
 *
 * `props` is stored as the JSON text it arrived as, so grouping happens on that
 * text and identical values written in a different key order land in different
 * rows; summing per parsed value here is what makes the count right. A browser
 * that sent two different values is counted in each, so these buckets can add
 * up to more than the browsers that sent the event at all.
 * @param {Object} env Worker env bindings.
 * @param {string} name Event name.
 * @param {string} prop Prop to group by.
 * @param {number} since Unix seconds.
 * @returns {Promise<Map<string, number>>} Value to distinct-browser count.
 */
async function countByProp(env, name, prop, since) {
  const res = await env.DB.prepare(
    `SELECT props, COUNT(DISTINCT cid) AS n
       FROM events WHERE name = ?1 AND received_at >= ?2
       GROUP BY props`
  )
    .bind(name, since)
    .all();
  const out = new Map();
  for (const row of res.results || []) {
    let value = null;
    try {
      const parsed = JSON.parse(row.props || "{}");
      value = typeof parsed[prop] === "string" ? parsed[prop] : null;
    } catch {
      value = null;
    }
    if (!value) continue;
    out.set(value, (out.get(value) || 0) + (Number(row.n) || 0));
  }
  return out;
}

/**
 * GET /v1/admin/funnel?days=N
 * @param {Object} env Worker env bindings.
 * @param {URL} url Request URL.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handleFunnel(env, url, deps) {
  const { json, cors } = deps;
  const raw = Number.parseInt(url.searchParams.get("days") || "", 10);
  const days = Number.isFinite(raw) && raw > 0 ? Math.min(raw, 180) : 28;
  const since = nowSec(deps.now) - days * 86400;

  // One row per browser, with a flag per step. MAX(name = ?) is SQLite's idiom
  // for "any row matched", and it keeps this to a single pass over the window.
  const flags = FUNNEL_STEPS.map((step, i) => `MAX(name = '${step.key}') AS s${i}`).join(",\n         ");
  const result = await env.DB.prepare(
    `SELECT cid,
         ${flags}
       FROM events WHERE received_at >= ?1 GROUP BY cid`
  )
    .bind(since)
    .all();
  const rows = result.results || [];

  const steps = [];
  for (let i = 0; i < FUNNEL_STEPS.length; i++) {
    const reached = rows.filter((r) => Number(r[`s${i}`]) === 1).length;
    if (i === 0) {
      steps.push({
        step: FUNNEL_STEPS[i].key,
        label: FUNNEL_STEPS[i].label,
        browsers: reached,
        of: null,
        rate: null,
        lo: null,
        hi: null
      });
      continue;
    }
    // Conditional on the previous step, which is what makes the chain honest: a
    // step cannot look good merely because few people reached the one before it.
    const prior = rows.filter((r) => Number(r[`s${i - 1}`]) === 1);
    const both = prior.filter((r) => Number(r[`s${i}`]) === 1).length;
    const w = wilson(both, prior.length);
    steps.push({
      step: FUNNEL_STEPS[i].key,
      label: FUNNEL_STEPS[i].label,
      browsers: both,
      of: prior.length,
      rate: w.rate,
      lo: w.lo,
      hi: w.hi
    });
  }

  // The panel's own states, counted per browser. This is the signal no A/B test
  // at any sample size would report: a browser where Google's script will not
  // load is a count here, not a hypothesis.
  const states = {};
  for (const key of PANEL_STATES) states[key] = 0;
  for (const [value, n] of await countByProp(env, "account_panel_open", "state", since)) {
    if (Object.prototype.hasOwnProperty.call(states, value)) states[value] += n;
  }

  // Every branch of both trial buttons ends in a trial_result, so the step's own
  // rate is ~100% by construction and the whole signal lives in this prop. The
  // one that matters is "needs_account": the press worked and sent the person to
  // sign in, which is a leak the step rate cannot show. Open-ended, so it comes
  // back sorted rather than as a fixed set.
  const outcomes = [...(await countByProp(env, "trial_result", "outcome", since))]
    .map(([outcome, browsers]) => ({ outcome, browsers }))
    .sort((a, b) => b.browsers - a.browsers || a.outcome.localeCompare(b.outcome));

  return json(
    {
      ok: true,
      window: { days, since },
      browsers: rows.length,
      steps,
      panelStates: states,
      trialOutcomes: outcomes,
      readMe:
        "Each rate is one proportion with a 95% Wilson interval, conditional on the step before it. " +
        "This finds a step nobody gets through; it cannot detect an improvement of a few points. " +
        "trial_result has a rate near 1 by construction, because every branch of both buttons ends " +
        "in one; read trialOutcomes instead, where needs_account is a press that worked and still " +
        "started no trial. panelStates and trialOutcomes count browsers per value, so a browser that " +
        "sent two values is in both buckets and they can add up to more than the step's own count. " +
        "It is not an A/B comparison and must not be read as one."
    },
    200,
    cors
  );
}

/**
 * GET /v1/admin/experiments — every registered experiment with its exposures
 * per arm and the sample-ratio check, plus the last week of ingest counters.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handleListExperiments(env, deps) {
  const { json, cors } = deps;
  const presets = deps.presets || EXPERIMENT_PRESETS;
  const rows = await exposureCounts(env.DB);
  // Registered experiments only, in registry order: presets with no exposures
  // are listed too, so the panel shows what is waiting to be switched on.
  const experiments = Object.keys(presets).map((key) => {
    const preset = presets[key];
    const arms = rows.filter((r) => r.experiment === key && preset.arms.includes(r.variant));
    const srm = arms.length
      ? sampleRatioMismatch(
          preset.arms.map((v) => (arms.find((a) => a.variant === v) || { n: 0 }).n),
          preset.weights
        )
      : { p: null, flagged: false };
    return {
      experiment: key,
      arms: arms.map((a) => ({ variant: a.variant, exposed: a.n, first: a.first, last: a.last })),
      srm: { p: srm.p, flagged: srm.flagged },
      preset
    };
  });
  const ingest = await ingestSummary(env.DB, nowSec(deps.now));
  return json({ ok: true, experiments, ingest }, 200, cors);
}

/**
 * GET /v1/admin/experiments/results?experiment=KEY
 *   [&event=NAME&kind=share|days&from=0&to=28] [&control=ID] [&weights=1,1]
 *
 * With no metric parameters it answers the experiment's preset: its primary
 * metric and every guardrail. Explicit parameters are exploratory; they get
 * the same horizon as the preset, and say so.
 *
 * `readMe` is the one-word verdict, most serious first: "srm" (the split is
 * wrong), "instrumentation" (an arm does not send something the result reads),
 * "too_early" (the plan is not met: counts only, no comparisons),
 * "small_sample", or "ok". The sample-ratio and instrumentation checks are
 * always in the answer, whatever the verdict.
 *
 * @param {Object} env Worker env bindings.
 * @param {URL} url Parsed URL.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>} Response.
 */
export async function handleExperimentResults(env, url, deps) {
  const { json, cors } = deps;
  const presets = deps.presets || EXPERIMENT_PRESETS;
  const at = nowSec(deps.now);
  const experiment = url.searchParams.get("experiment") || "";
  if (!KEY_RE.test(experiment)) {
    return json({ ok: false, reason: "bad_request" }, 400, cors);
  }
  const preset = Object.prototype.hasOwnProperty.call(presets, experiment) ? presets[experiment] : null;
  if (!preset) {
    return json({ ok: false, reason: "unknown_experiment" }, 404, cors);
  }
  const armsRows = await exposureCounts(env.DB, experiment);
  const controlParam = url.searchParams.get("control");
  const control = (controlParam && preset.arms.includes(controlParam) && controlParam) || preset.control;

  const presetMetrics = [
    { role: "primary", metric: normalizeMetric(preset.primary).metric },
    ...(preset.guardrails || []).map((g) => ({ role: "guardrail", metric: normalizeMetric(g).metric }))
  ];
  let metrics = presetMetrics;
  const exploratory = !!url.searchParams.get("event");
  if (exploratory) {
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
  }

  // Every registered arm, control first, with zero for an arm nobody reached:
  // an arm with no exposures is the loudest sample-ratio mismatch there is.
  const ordered = preset.arms
    .map((variant, i) => ({ ...(armsRows.find((r) => r.variant === variant) || { variant, n: 0, first: null, last: null }), weight: preset.weights[i] }))
    .sort((a, b) => (a.variant === control ? -1 : b.variant === control ? 1 : 0));
  const weights = parseWeights(url.searchParams.get("weights"), ordered.map((a) => a.weight));
  const srm = sampleRatioMismatch(
    ordered.map((a) => a.n),
    weights
  );

  const horizon = await computeHorizon(
    env.DB,
    experiment,
    preset,
    ordered,
    presetMetrics.map((m) => m.metric),
    at
  );
  const dependent = armDependentEvents(preset);
  const computed = [];
  for (const entry of metrics) {
    const m = await computeMetric(env.DB, experiment, entry.metric, control, at, horizon.cohortEnd);
    // Before the plan is met there is nothing to compare: each arm's own
    // numbers stay, the differences and p-values do not.
    const withheld = !horizon.reached;
    computed.push({
      role: entry.role,
      ...m,
      comparisons: withheld ? [] : m.comparisons,
      withheld,
      ...(dependent.has(entry.metric.event) ? { armDependent: true } : {})
    });
  }
  const eventMix = await computeEventMix(
    env.DB,
    experiment,
    preset,
    metrics.map((m) => m.metric.event),
    at,
    horizon.cohortEnd
  );

  return json(
    {
      ok: true,
      experiment,
      control,
      asOf: at,
      exploratory,
      exposed: ordered.map((a) => ({ variant: a.variant, n: a.n, first: a.first, last: a.last })),
      srm: {
        chi2: srm.chi2,
        df: srm.df,
        p: srm.p,
        weights,
        flagged: srm.flagged
      },
      horizon,
      eventMix,
      metrics: computed,
      readMe: srm.flagged
        ? "srm"
        : eventMix.flagged
          ? "instrumentation"
          : !horizon.reached
            ? "too_early"
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
 * @param {Object} deps Injectables `{json, cors, now, requireAdmin, presets}`.
 * @returns {Promise<Response|null>} Response, or null when the path is not ours.
 */
export async function routeEventsApi(request, env, url, path, deps) {
  const { json, cors } = deps;
  if (path === "/v1/events" || path === "/v1/events/forget") {
    if (request.method !== "POST") {
      return json({ ok: false, reason: "method_not_allowed" }, 405, { ...cors, allow: "POST" });
    }
    return path === "/v1/events" ? handleIngest(request, env, deps) : handleForget(request, env, deps);
  }
  if (
    path !== "/v1/admin/experiments" &&
    path !== "/v1/admin/experiments/results" &&
    path !== "/v1/admin/funnel"
  ) {
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
  if (path === "/v1/admin/funnel") return handleFunnel(env, url, deps);
  return path === "/v1/admin/experiments"
    ? handleListExperiments(env, deps)
    : handleExperimentResults(env, url, deps);
}
