/**
 * Anonymous events and A/B results, driven through the worker's real router
 * against a real SQLite database (d1-fake.mjs).
 */

import assert from "node:assert/strict";
import test from "node:test";

import worker, { handleRequest } from "../src/index.js";
import { ensureSchema, resetSchemaMemo, sweepExpired } from "../src/db.js";
import { clearGoogleJwksCache } from "../src/google.js";
import { EVENTS_RATE_LIMIT, MAX_EVENTS_PER_REQUEST, sanitizeEvent, sanitizeProps } from "../src/events.js";
import { createAccountEnv, TEST_ORIGIN } from "./fixtures.mjs";

const BASE = "https://entitlements.test";
const CHROME_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";
const NOW = 1800000000;
const DAY = 86400;

/** A fresh env with the account layer on and the schema memo cleared. */
function freshEnv(overrides) {
  resetSchemaMemo();
  clearGoogleJwksCache();
  return createAccountEnv(overrides);
}

/**
 * POST events the way the site's beacon does: text/plain, from the site origin.
 * @param {unknown} body Body (object is JSON-encoded).
 * @param {{headers?: Object, origin?: string|null}} [options] Overrides.
 * @returns {Request} Request.
 */
function beacon(body, options) {
  const opts = options || {};
  const origin = opts.origin === undefined ? TEST_ORIGIN : opts.origin;
  return new Request(`${BASE}/v1/events`, {
    method: "POST",
    headers: {
      "content-type": "text/plain;charset=UTF-8",
      "user-agent": CHROME_UA,
      ...(origin ? { Origin: origin } : {}),
      ...(opts.headers || {})
    },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

/**
 * Call the worker and parse the JSON body.
 * @param {Request} request Request.
 * @param {Object} env Env.
 * @param {Object} [deps] Router options.
 * @returns {Promise<{status: number, body: Object}>} Result.
 */
async function call(request, env, deps) {
  const response = await handleRequest(request, env, deps);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

/**
 * One event shaped like js/analytics.js sends it.
 * @param {string} name Event name.
 * @param {string} cid Browser id.
 * @param {Object} [props] Props.
 * @param {string} [day] Local day.
 * @returns {Object} Event.
 */
function ev(name, cid, props, day) {
  return { name, cid, props: props || {}, t: "2027-01-15T15:00:00.000Z", day: day || "2027-01-15", tz: -300 };
}

/**
 * An exposure event.
 * @param {string} experiment Key.
 * @param {string} variant Arm.
 * @param {string} cid Browser id.
 * @returns {Object} Event.
 */
function expose(experiment, variant, cid) {
  return ev("experiment_expose", cid, { experiment, variant, forced: false, enabled: true });
}

/**
 * Rows in a table.
 * @param {Object} env Env.
 * @param {string} sql Query.
 * @returns {Promise<Object[]>} Rows.
 */
async function rows(env, sql) {
  return (await env.DB.prepare(sql).all()).results;
}

/**
 * Sign in by emailed code, returning the session token (same path as
 * api.test.mjs: the code is read out of the email the fake transport sends).
 * @param {Object} env Env.
 * @param {string} email Address.
 * @param {number} now Unix seconds.
 * @returns {Promise<string>} Session token.
 */
async function signIn(env, email, now) {
  let code = null;
  const fetchImpl = async (url, init) => {
    const match = /\b(\d{6})\b/.exec(JSON.parse(init.body).text || "");
    code = match && match[1];
    return { ok: true, status: 200 };
  };
  const post = (path, body) =>
    new Request(`${BASE}${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  await call(post("/v1/auth/email/start", { email }), env, { now, fetchImpl });
  const verified = await call(post("/v1/auth/email/verify", { email, code }), env, { now: now + 1 });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return verified.body.sessionToken;
}

/**
 * GET an admin route.
 * @param {string} path Path with query.
 * @param {string} token Session token.
 * @returns {Request} Request.
 */
function adminGet(path, token) {
  return new Request(`${BASE}${path}`, {
    method: "GET",
    headers: token ? { authorization: `Bearer ${token}` } : {}
  });
}

/** Browser ids that pass validation: 16 hex characters, like the site mints. */
function cid(i, prefix) {
  return `${prefix || "c"}${String(i).padStart(15, "0")}`;
}

test("a beacon batch is stored with only the fields that were promised", async () => {
  const env = freshEnv();
  const res = await call(
    beacon({
      events: [
        ev("app_open", "a1b2c3d4e5f60718", { day: "2027-01-15", loop: true }),
        ev("practice_start", "a1b2c3d4e5f60718", { exerciseId: "s4-lip-trills", mode: "sustain", micro: false }),
        ev("basics_complete", "a1b2c3d4e5f60718", { tier: "min", steps: 2, practiceDays: 3 })
      ]
    }),
    env,
    { now: NOW }
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, { ok: true, accepted: 3, dropped: 0 });
  const stored = await rows(env, "SELECT * FROM events ORDER BY id");
  assert.equal(stored.length, 3);
  assert.deepEqual(Object.keys(stored[0]).sort(), ["cid", "day", "id", "name", "props", "received_at", "tz"]);
  assert.equal(stored[1].name, "practice_start");
  assert.equal(stored[1].received_at, NOW);
  assert.equal(stored[1].tz, -300);
  assert.deepEqual(JSON.parse(stored[1].props), { exerciseId: "s4-lip-trills", mode: "sustain", micro: false });
  // Nothing about the caller is kept: no IP, no user agent, no raw bucket key.
  const text = JSON.stringify(await rows(env, "SELECT * FROM rate_limits"));
  assert.equal(text.includes("unknown"), false);
  assert.equal(JSON.stringify(stored).includes("Chrome"), false);
});

test("a single event without a batch wrapper is accepted too", async () => {
  const env = freshEnv();
  const res = await call(beacon(ev("first_win", "a1b2c3d4e5f60718", { exerciseId: "v1-diction" })), env, { now: NOW });
  assert.equal(res.status, 200);
  assert.equal(res.body.accepted, 1);
});

test("unknown events, bad ids and free-text props are dropped", async () => {
  const env = freshEnv();
  const res = await call(
    beacon({
      events: [
        ev("not_a_real_event", "a1b2c3d4e5f60718"),
        ev("app_open", "short"),
        ev("app_open", "UPPERCASE0000000"),
        ev("app_open", "a1b2c3d4e5f60718", {
          email: "someone@example.com",
          note: "free text with spaces",
          path: "/home/user",
          nested: { a: 1 },
          list: [1, 2],
          "bad key": 1,
          ok: "s4-lip-trills",
          n: 3.14159
        })
      ]
    }),
    env,
    { now: NOW }
  );
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true, accepted: 1, dropped: 3 });
  const [row] = await rows(env, "SELECT props FROM events");
  assert.deepEqual(JSON.parse(row.props), { ok: "s4-lip-trills", n: 3.142 });
});

test("props are capped at twelve keys and a bad day or tz becomes null", () => {
  const many = {};
  for (let i = 0; i < 20; i += 1) many[`k${i}`] = i;
  assert.equal(Object.keys(sanitizeProps(many)).length, 12);
  const clean = sanitizeEvent({ name: "app_open", cid: "a1b2c3d4e5f60718", day: "15/01/2027", tz: 9999 });
  assert.equal(clean.ok, true);
  assert.equal(clean.event.day, null);
  assert.equal(clean.event.tz, null);
});

test("Global Privacy Control and Do Not Track are honoured: nothing is stored", async () => {
  const env = freshEnv();
  for (const headers of [{ "sec-gpc": "1" }, { dnt: "1" }]) {
    const res = await call(beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }, { headers }), env, { now: NOW });
    assert.equal(res.status, 202);
    assert.equal(res.body.reason, "opted_out");
  }
  // Refused before the schema was touched; create it only to count.
  await ensureSchema(env.DB);
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM events"))[0].n, 0);
});

test("automated browsers are not counted", async () => {
  const env = freshEnv();
  for (const ua of [
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/129.0.0.0 Safari/537.36",
    "Googlebot/2.1 (+http://www.google.com/bot.html)",
    "curl/8.5.0",
    ""
  ]) {
    const res = await call(
      beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }, { headers: { "user-agent": ua } }),
      env,
      { now: NOW }
    );
    assert.equal(res.status, 202, ua);
    assert.equal(res.body.reason, "automated");
  }
});

test("only the site's own origin may write, and the switch turns recording off", async () => {
  const env = freshEnv();
  const foreign = await call(beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }, { origin: "https://evil.test" }), env, {
    now: NOW
  });
  assert.equal(foreign.status, 403);
  const none = await call(beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }, { origin: null }), env, { now: NOW });
  assert.equal(none.status, 403);

  const off = freshEnv({ EVENTS_ENABLED: "false" });
  const res = await call(beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }), off, { now: NOW });
  assert.equal(res.status, 202);
  assert.equal(res.body.reason, "events_disabled");

  const noDb = freshEnv({ DB: undefined });
  const missing = await call(beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }), noDb, { now: NOW });
  assert.equal(missing.status, 503);
});

test("malformed, oversized and overlong batches are refused", async () => {
  const env = freshEnv();
  assert.equal((await call(beacon("not json"), env, { now: NOW })).status, 400);
  assert.equal((await call(beacon({ events: [] }), env, { now: NOW })).status, 400);
  const tooMany = Array.from({ length: MAX_EVENTS_PER_REQUEST + 1 }, () => ev("app_open", "a1b2c3d4e5f60718"));
  assert.equal((await call(beacon({ events: tooMany }), env, { now: NOW })).status, 400);
  const huge = JSON.stringify({ events: [ev("app_open", "a1b2c3d4e5f60718", { x: "a".repeat(20000) })] });
  assert.equal((await call(beacon(huge), env, { now: NOW })).status, 413);
  const get = await call(new Request(`${BASE}/v1/events`), env, { now: NOW });
  assert.equal(get.status, 405);
});

test("one address is rate-limited per hour, keyed by a hash that changes daily", async () => {
  const env = freshEnv();
  const [limit] = EVENTS_RATE_LIMIT;
  const headers = { "cf-connecting-ip": "203.0.113.9" };
  let last;
  for (let i = 0; i <= limit; i += 1) {
    last = await call(beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }, { headers }), env, { now: NOW });
  }
  assert.equal(last.status, 429);
  const buckets = await rows(env, "SELECT bucket FROM rate_limits");
  assert.equal(buckets.length, 1);
  assert.equal(buckets[0].bucket.includes("203.0.113.9"), false);
  // Another address is unaffected.
  const other = await call(
    beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }, { headers: { "cf-connecting-ip": "198.51.100.4" } }),
    env,
    { now: NOW }
  );
  assert.equal(other.status, 200);
});

test("the first exposure is the arm for good; forced and switched-off views are not exposures", async () => {
  const env = freshEnv();
  await call(
    beacon({
      events: [
        expose("loop_home_2026_10", "loop", "a1b2c3d4e5f60718"),
        expose("loop_home_2026_10", "classic", "a1b2c3d4e5f60718"),
        ev("experiment_expose", "b1b2c3d4e5f60718", { experiment: "loop_home_2026_10", variant: "classic", forced: true, enabled: true }),
        ev("experiment_expose", "c1b2c3d4e5f60718", { experiment: "loop_home_2026_10", variant: "classic", forced: false, enabled: false }),
        ev("experiment_expose", "d1b2c3d4e5f60718", { experiment: "Bad Key!", variant: "classic", forced: false, enabled: true })
      ]
    }),
    env,
    { now: NOW }
  );
  const exposures = await rows(env, "SELECT experiment, cid, variant, first_at FROM exposures");
  assert.deepEqual(exposures, [
    { experiment: "loop_home_2026_10", cid: "a1b2c3d4e5f60718", variant: "loop", first_at: NOW }
  ]);
  // The events themselves are still kept (they are real views), only not as exposures.
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM events WHERE name = 'experiment_expose'"))[0].n, 5);
});

test("results are admin-only", async () => {
  const env = freshEnv();
  const anon = await call(adminGet("/v1/admin/experiments"), env, { now: NOW });
  assert.equal(anon.status, 401);
  const member = await signIn(env, "someone@example.test", NOW);
  const forbidden = await call(adminGet("/v1/admin/experiments/results?experiment=aa_2026_10", member), env, { now: NOW });
  assert.equal(forbidden.status, 403);
  const post = await call(
    new Request(`${BASE}/v1/admin/experiments`, { method: "POST", headers: { authorization: `Bearer ${member}` } }),
    env,
    { now: NOW }
  );
  assert.equal(post.status, 405);
});

/**
 * Seed an experiment: `nc` control and `nt` treatment browsers exposed at
 * `at`, with `kc` and `kt` of them sending `event` on `dayOffset` after.
 */
async function seedArms(env, opts) {
  const { experiment, control, treatment, nc, nt, kc, kt, event, dayOffset, at } = opts;
  const send = async (events, when) => {
    for (let i = 0; i < events.length; i += MAX_EVENTS_PER_REQUEST) {
      const res = await call(beacon({ events: events.slice(i, i + MAX_EVENTS_PER_REQUEST) }), env, { now: when });
      assert.equal(res.status, 200, JSON.stringify(res.body));
    }
  };
  const exposures = [];
  const later = [];
  for (let i = 0; i < nc; i += 1) {
    exposures.push(expose(experiment, control, cid(i, "c")));
    if (i < kc) later.push(ev(event, cid(i, "c"), { n: 1 }, `2027-02-${String(1 + (i % 9)).padStart(2, "0")}`));
  }
  for (let i = 0; i < nt; i += 1) {
    exposures.push(expose(experiment, treatment, cid(i, "t")));
    if (i < kt) later.push(ev(event, cid(i, "t"), { n: 1 }, `2027-02-${String(1 + (i % 9)).padStart(2, "0")}`));
  }
  await send(exposures, at);
  await send(later, at + dayOffset * DAY + 3600);
}

test("the preset answers the primary metric and guardrails with intervals and an SRM check", async () => {
  const env = freshEnv();
  const t0 = NOW - 40 * DAY;
  await seedArms(env, {
    experiment: "tour_shape_2026_10",
    control: "invite",
    treatment: "auto",
    nc: 80,
    nt: 70,
    kc: 48,
    kt: 56,
    event: "first_win",
    dayOffset: 2,
    at: t0
  });
  // Outside the 7-day window: must not count.
  await call(beacon({ events: [ev("first_win", cid(79, "c"))] }), env, { now: t0 + 9 * DAY });

  const admin = await signIn(env, "admin@example.test", NOW);
  const res = await call(adminGet("/v1/admin/experiments/results?experiment=tour_shape_2026_10", admin), env, { now: NOW });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const body = res.body;
  assert.equal(body.control, "invite");
  assert.deepEqual(
    body.exposed.map((a) => [a.variant, a.n]),
    [
      ["invite", 80],
      ["auto", 70]
    ]
  );
  assert.equal(body.srm.flagged, false);
  const primary = body.metrics.find((m) => m.role === "primary");
  assert.equal(primary.event, "first_win");
  assert.deepEqual(
    primary.arms.map((a) => [a.variant, a.n, a.k]),
    [
      ["invite", 80, 48],
      ["auto", 70, 56]
    ]
  );
  // Newcombe's worked example, reproduced end to end through SQL.
  const cmp = primary.comparisons[0];
  assert.equal(cmp.variant, "auto");
  assert.ok(Math.abs(cmp.diff - 0.2) < 1e-9);
  assert.ok(Math.abs(cmp.lo - 0.0524) < 1e-4);
  assert.ok(Math.abs(cmp.hi - 0.3339) < 1e-4);
  assert.equal(body.metrics.filter((m) => m.role === "guardrail").length, 2);
  assert.equal(body.readMe, "ok");
});

test("people exposed too recently are left out until their window has passed", async () => {
  const env = freshEnv();
  await seedArms(env, {
    experiment: "aa_2026_10",
    control: "a",
    treatment: "b",
    nc: 40,
    nt: 40,
    kc: 10,
    kt: 10,
    event: "practice_day",
    dayOffset: 1,
    at: NOW - 3 * DAY
  });
  const admin = await signIn(env, "admin@example.test", NOW);
  const young = await call(adminGet("/v1/admin/experiments/results?experiment=aa_2026_10", admin), env, { now: NOW });
  const primary = young.body.metrics[0];
  // The preset window is 7 days and everybody was exposed 3 days ago.
  assert.deepEqual(primary.arms, []);
  assert.equal(young.body.exposed.length, 2);

  const later = await call(adminGet("/v1/admin/experiments/results?experiment=aa_2026_10", admin), env, {
    now: NOW + 5 * DAY
  });
  const arms = later.body.metrics[0].arms;
  assert.deepEqual(
    arms.map((a) => [a.variant, a.n, a.k]),
    [
      ["a", 40, 10],
      ["b", 40, 10]
    ]
  );
  assert.equal(later.body.metrics[0].comparisons[0].p, 1);
});

test("a days metric counts distinct local days, and a lopsided split raises SRM", async () => {
  const env = freshEnv();
  const t0 = NOW - 30 * DAY;
  // 120 exposed to the control and 60 to the treatment of a 1:1 design.
  await seedArms(env, {
    experiment: "loop_minimo_len_2026_10",
    control: "three",
    treatment: "five",
    nc: 120,
    nt: 60,
    kc: 0,
    kt: 0,
    event: "practice_day",
    dayOffset: 1,
    at: t0
  });
  // One control browser practises on three distinct days, twice on one of them.
  const who = cid(0, "c");
  for (const [offset, day] of [
    [1, "2027-02-01"],
    [1, "2027-02-01"],
    [2, "2027-02-02"],
    [5, "2027-02-05"]
  ]) {
    await call(beacon({ events: [ev("practice_day", who, {}, day)] }), env, { now: t0 + offset * DAY });
  }
  const admin = await signIn(env, "admin@example.test", NOW);
  const res = await call(adminGet("/v1/admin/experiments/results?experiment=loop_minimo_len_2026_10", admin), env, {
    now: NOW
  });
  assert.equal(res.body.srm.flagged, true);
  assert.equal(res.body.readMe, "srm");
  const primary = res.body.metrics[0];
  assert.equal(primary.kind, "days");
  const control = primary.arms.find((a) => a.variant === "three");
  assert.equal(control.n, 120);
  assert.ok(Math.abs(control.mean - 3 / 120) < 1e-12);

  // Explicit metric parameters override the preset, and weights change the SRM test.
  const custom = await call(
    adminGet(
      "/v1/admin/experiments/results?experiment=loop_minimo_len_2026_10&event=practice_day&kind=share&from=0&to=28&weights=2,1",
      admin
    ),
    env,
    { now: NOW }
  );
  assert.equal(custom.body.metrics.length, 1);
  assert.equal(custom.body.metrics[0].kind, "share");
  assert.equal(custom.body.srm.flagged, false);
  const bad = await call(
    adminGet("/v1/admin/experiments/results?experiment=loop_minimo_len_2026_10&event=nope", admin),
    env,
    { now: NOW }
  );
  assert.equal(bad.status, 400);
});

test("the experiment list shows exposures per arm and every preset still waiting", async () => {
  const env = freshEnv();
  await call(beacon({ events: [expose("loop_home_2026_10", "loop", "a1b2c3d4e5f60718")] }), env, { now: NOW });
  const admin = await signIn(env, "admin@example.test", NOW);
  const res = await call(adminGet("/v1/admin/experiments", admin), env, { now: NOW });
  assert.equal(res.status, 200);
  const byKey = Object.fromEntries(res.body.experiments.map((e) => [e.experiment, e]));
  assert.deepEqual(byKey.loop_home_2026_10.arms.map((a) => [a.variant, a.exposed]), [["loop", 1]]);
  assert.deepEqual(byKey.tour_shape_2026_10.arms, []);
  assert.ok(byKey.aa_2026_10);
});

test("the sweep deletes events past retention and keeps exposures", async () => {
  const env = freshEnv();
  const old = NOW - 200 * DAY;
  await call(beacon({ events: [expose("aa_2026_10", "a", "a1b2c3d4e5f60718"), ev("app_open", "a1b2c3d4e5f60718")] }), env, {
    now: old
  });
  await call(beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }), env, { now: NOW });
  await sweepExpired(env.DB, NOW);
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM events"))[0].n, 1);
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM exposures"))[0].n, 1);
});

test("the daily cron runs the same sweep, so retention does not wait for an admin", async () => {
  const env = freshEnv();
  const real = Math.floor(Date.now() / 1000);
  await call(beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }), env, { now: real - 200 * DAY });
  await call(beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }), env, { now: real });
  await worker.scheduled({ cron: "17 9 * * *" }, env);
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM events"))[0].n, 1);
  // Without a database the cron is a no-op rather than an error.
  await worker.scheduled({}, freshEnv({ DB: undefined }));
});
