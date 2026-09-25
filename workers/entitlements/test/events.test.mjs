/**
 * Anonymous events and A/B results, driven through the worker's real router
 * against a real SQLite database (d1-fake.mjs).
 */

import assert from "node:assert/strict";
import test from "node:test";

import { readFileSync } from "node:fs";
import vm from "node:vm";

import worker, { handleRequest } from "../src/index.js";
import { ensureSchema, EVENT_RETENTION_SECONDS, hitRateLimit, resetSchemaMemo, sweepExpired } from "../src/db.js";
import { clearGoogleJwksCache } from "../src/google.js";
import {
  EVENTS_IP_RATE_LIMIT,
  EVENTS_RATE_LIMIT,
  EXPERIMENT_PRESETS,
  EXPOSURE_IP_CAP,
  INGEST_REASONS,
  MAX_EVENTS_PER_REQUEST,
  ipBucketKey,
  presetProblems,
  sanitizeEvent,
  sanitizeProps
} from "../src/events.js";
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

test("Global Privacy Control is honoured: nothing is stored", async () => {
  const env = freshEnv();
  const res = await call(
    beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }, { headers: { "sec-gpc": "1" } }),
    env,
    { now: NOW }
  );
  assert.equal(res.status, 202);
  assert.equal(res.body.reason, "opted_out");
  // Nothing stored but the day's count of refusals, which holds no id.
  await ensureSchema(env.DB);
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM events"))[0].n, 0);
  assert.deepEqual(await rows(env, "SELECT reason, n FROM ingest_daily"), [{ reason: "opted_out", n: 1 }]);
});

test("Do Not Track is not read any more, on this side either", async () => {
  // Dropped 2026-09-24. No law requires honouring DNT, the W3C discontinued the
  // specification in 2019 and Safari removed the header the same year because it
  // narrowed a fingerprint rather than protecting anybody. The client stopped
  // reading it too (js/analytics.js), which is what keeps the two halves from
  // disagreeing: the client sending while the worker discards would be the worst
  // of both. GPC above still stops everything, and so does the guide's switch.
  const env = freshEnv();
  const res = await call(
    beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }, { headers: { dnt: "1" } }),
    env,
    { now: NOW }
  );
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.accepted, 1);
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM events"))[0].n, 1);
});

test("a country that asks first is turned away unless the batch says the visitor said yes", async () => {
  // The site holds those events until somebody answers (js/region-gate.js). This
  // is the backstop for anything that posts anyway, and it reads the country from
  // the edge rather than from the page.
  const env = freshEnv();
  const res = await call(
    beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }, { headers: { "cf-ipcountry": "ES" } }),
    env,
    { now: NOW }
  );
  assert.equal(res.status, 202);
  assert.equal(res.body.reason, "eu_no_consent");
  assert.equal(res.body.accepted, 0);
  await ensureSchema(env.DB);
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM events"))[0].n, 0);
  assert.deepEqual(await rows(env, "SELECT reason, n FROM ingest_daily"), [{ reason: "eu_no_consent", n: 1 }]);
  assert.ok(INGEST_REASONS.request.includes("eu_no_consent"));

  // The same batch, with the answer in it.
  const yes = await call(
    beacon(
      { consent: "granted", events: [ev("app_open", "a1b2c3d4e5f60718")] },
      { headers: { "cf-ipcountry": "ES" } }
    ),
    env,
    { now: NOW }
  );
  assert.equal(yes.status, 200, JSON.stringify(yes.body));
  assert.equal(yes.body.accepted, 1);
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM events"))[0].n, 1);

  // An outermost region reports its own code, not its member state's, and
  // cf.isEUCountry cannot be relied on to cover it — so without its own entry
  // Réunion would be let through although EU law applies there in full.
  const re = await call(
    beacon({ events: [ev("app_open", "b1b2c3d4e5f60718")] }, { headers: { "cf-ipcountry": "RE" } }),
    freshEnv(),
    { now: NOW }
  );
  assert.equal(re.body.reason, "eu_no_consent");

  // And the EU itself, by the edge's own flag rather than the list.
  const flagged = new Request(`${BASE}/v1/events`, {
    method: "POST",
    headers: { "content-type": "text/plain", "user-agent": CHROME_UA, Origin: TEST_ORIGIN },
    body: JSON.stringify({ events: [ev("app_open", "c1b2c3d4e5f60718")] })
  });
  Object.defineProperty(flagged, "cf", { value: { country: "DE", isEUCountry: "1" }, configurable: true });
  assert.equal((await call(flagged, freshEnv(), { now: NOW })).body.reason, "eu_no_consent");

  // French Polynesia is in no EU instrument at all (TFEU art. 198 leaves the
  // overseas collectivities out), and cf.isEUCountry will never flag it — but
  // art. 82 of loi 78-17 has applied there in full since 1 June 2019, so the
  // list has to carry it or a Tahitian visitor is recorded without being asked.
  const pf = await call(
    beacon({ events: [ev("app_open", "d1b2c3d4e5f60718")] }, { headers: { "cf-ipcountry": "PF" } }),
    freshEnv(),
    { now: NOW }
  );
  assert.equal(pf.body.reason, "eu_no_consent");
});

test("a visitor anywhere else is recorded exactly as before", async () => {
  // The whole point of the region gate: outside the ask-first list nothing
  // changes, and a batch with no consent field is the normal case.
  // GB is in this list on purpose: since 5 February 2026 PECR Schedule A1 para 5
  // exempts first-party statistics from consent where the visitor is told and
  // has a simple free way to object, which the app's footer switch and the
  // guide's are. docs/38-AB-TESTING.md carries the reasoning and the risk in it.
  // JE, GG and IM are here because the ePrivacy Directive never applied to the
  // Crown dependencies and PECR was never extended to them; each legislates its
  // own data protection, and none of them requires prior consent for this.
  // CH is here because art. 45c FMG wants information and a way to refuse, not
  // an opt-in — which the same footer switch gives.
  const env = freshEnv();
  for (const cc of ["PE", "US", "MX", "CO", "CL", "AR", "BR", "CH", "GB", "JE", "GG", "IM", "XX", "T1"]) {
    const res = await call(
      beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }, { headers: { "cf-ipcountry": cc } }),
      env,
      { now: NOW }
    );
    assert.equal(res.status, 200, `${cc}: ${JSON.stringify(res.body)}`);
    assert.equal(res.body.accepted, 1, cc);
  }
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM events"))[0].n, 14);
});

test("GET /v1/geo says where the edge places a request, and nothing else", async () => {
  const env = freshEnv();
  /**
   * @param {string|null} cc Country header, or null for none.
   * @returns {Promise<{status: number, body: Object}>} Result.
   */
  const geo = (cc) =>
    call(
      new Request(`${BASE}/v1/geo`, {
        headers: { "user-agent": CHROME_UA, Origin: TEST_ORIGIN, ...(cc ? { "cf-ipcountry": cc } : {}) }
      }),
      env,
      { now: NOW }
    );

  const es = await geo("ES");
  assert.equal(es.status, 200);
  assert.deepEqual(es.body, { ok: true, country: "ES", placed: true, askFirst: true });
  assert.deepEqual(Object.keys(es.body).sort(), ["askFirst", "country", "ok", "placed"]);

  assert.deepEqual((await geo("RE")).body, { ok: true, country: "RE", placed: true, askFirst: true });
  assert.deepEqual((await geo("PF")).body, { ok: true, country: "PF", placed: true, askFirst: true });
  assert.deepEqual((await geo("GI")).body, { ok: true, country: "GI", placed: true, askFirst: true });
  assert.deepEqual((await geo("GB")).body, { ok: true, country: "GB", placed: true, askFirst: false });
  assert.deepEqual((await geo("JE")).body, { ok: true, country: "JE", placed: true, askFirst: false });
  assert.deepEqual((await geo("PE")).body, { ok: true, country: "PE", placed: true, askFirst: false });
  assert.deepEqual((await geo("CH")).body, { ok: true, country: "CH", placed: true, askFirst: false });
  // Unplaceable: Tor, an address the edge cannot map, or a request with no
  // header at all. `placed: false` is how the page tells "no country" apart from
  // "not in Europe" — it keeps whatever its own clock said.
  assert.deepEqual((await geo("T1")).body, { ok: true, country: null, placed: false, askFirst: false });
  assert.deepEqual((await geo("XX")).body, { ok: true, country: null, placed: false, askFirst: false });
  assert.deepEqual((await geo(null)).body, { ok: true, country: null, placed: false, askFirst: false });

  // Reading it stores nothing at all, not even a counter.
  await ensureSchema(env.DB);
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM ingest_daily"))[0].n, 0);
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM events"))[0].n, 0);

  const posted = await call(
    new Request(`${BASE}/v1/geo`, { method: "POST", headers: { Origin: TEST_ORIGIN } }),
    env,
    { now: NOW }
  );
  assert.equal(posted.status, 405);
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

test("one browser is limited per hour; its classmates on the same address are not", async () => {
  const env = freshEnv();
  const [limit] = EVENTS_RATE_LIMIT;
  const headers = { "cf-connecting-ip": "203.0.113.9" };
  let last;
  for (let i = 0; i <= limit; i += 1) {
    last = await call(beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }, { headers }), env, { now: NOW });
  }
  assert.equal(last.status, 429);
  // Another browser behind the same address is unaffected.
  const classmate = await call(beacon({ events: [ev("app_open", "b1b2c3d4e5f60718")] }, { headers }), env, { now: NOW });
  assert.equal(classmate.status, 200);
  const buckets = (await rows(env, "SELECT bucket FROM rate_limits")).map((r) => r.bucket);
  assert.equal(buckets.some((b) => b.includes("203.0.113.9")), false);
});

test("a class of twelve behind one address, 65 requests each in an hour, is never refused", async () => {
  const env = freshEnv();
  const headers = { "cf-connecting-ip": "198.51.100.20" };
  const statuses = new Set();
  for (let round = 0; round < 65; round += 1) {
    for (let who = 0; who < 12; who += 1) {
      const res = await call(beacon({ events: [ev("practice_start", cid(who, "k"))] }, { headers }), env, {
        now: NOW + round * 50
      });
      statuses.add(res.status);
    }
  }
  assert.deepEqual([...statuses], [200]);
});

test("past the per-address backstop the address is refused, and the key needs the secret", async () => {
  const env = freshEnv();
  const headers = { "cf-connecting-ip": "203.0.113.50" };
  const request = beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }, { headers });
  const key = await ipBucketKey(env, request, NOW);
  assert.match(key, /^[0-9a-f]{24}$/);
  // Fill the address's hour as if 3000 requests had come from it.
  await ensureSchema(env.DB);
  const [limit, windowSeconds] = EVENTS_IP_RATE_LIMIT;
  await env.DB
    .prepare("INSERT INTO rate_limits (bucket, count, window_start) VALUES (?1, ?2, ?3)")
    .bind(`ev:${key}`, limit, NOW - (NOW % windowSeconds))
    .run();
  const res = await call(request, env, { now: NOW });
  assert.equal(res.status, 429);

  // The bucket changes with the day and with the secret, and never holds the address.
  assert.notEqual(await ipBucketKey(env, request, NOW + DAY), key);
  assert.notEqual(await ipBucketKey({ ...env, EVENTS_IP_KEY: "another-secret" }, request, NOW), key);
  assert.equal(key.includes("203.0.113.50"), false);
  // With no secret at all there is nothing safe to key it with: refuse.
  const bare = freshEnv({ LICENSE_PRIVATE_KEY_PKCS8_B64: "", EVENTS_IP_KEY: "" });
  const refused = await call(beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }), bare, { now: NOW });
  assert.equal(refused.status, 503);
  assert.equal(refused.body.reason, "events_not_configured");
});

test("the rate limiter can spend several hits at once and refuses what would overflow", async () => {
  const env = freshEnv();
  await ensureSchema(env.DB);
  assert.equal((await hitRateLimit(env.DB, "t:1", 10, 3600, NOW, 6)).ok, true);
  assert.equal((await hitRateLimit(env.DB, "t:1", 10, 3600, NOW, 5)).ok, false);
  const four = await hitRateLimit(env.DB, "t:1", 10, 3600, NOW, 4);
  assert.deepEqual([four.ok, four.count], [true, 10]);
  assert.equal((await hitRateLimit(env.DB, "t:2", 10, 3600, NOW, 11)).ok, false);
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

let seedAddress = 0;

/**
 * Send events in full batches, each from its own address, the way many
 * browsers on many connections would (one address would hit the exposure cap).
 * @param {Object} env Env.
 * @param {Object[]} events Events.
 * @param {number} when Unix seconds.
 * @param {Object} [deps] Router options.
 * @returns {Promise<void>} Resolves when all are accepted.
 */
async function sendAll(env, events, when, deps) {
  for (let i = 0; i < events.length; i += MAX_EVENTS_PER_REQUEST) {
    seedAddress += 1;
    const headers = { "cf-connecting-ip": `10.${(seedAddress >> 16) & 255}.${(seedAddress >> 8) & 255}.${seedAddress & 255}` };
    const res = await call(beacon({ events: events.slice(i, i + MAX_EVENTS_PER_REQUEST) }, { headers }), env, {
      now: when,
      ...(deps || {})
    });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  }
}

/**
 * The registry with one experiment's plan replaced, for tests whose seeded
 * sample is smaller than the real plan.
 * @param {string} key Experiment key.
 * @param {Object} plan Plan.
 * @returns {Object} Registry.
 */
function withPlan(key, plan) {
  return { ...EXPERIMENT_PRESETS, [key]: { ...EXPERIMENT_PRESETS[key], plan } };
}

/**
 * Seed an experiment: `nc` control and `nt` treatment browsers exposed at
 * `at`, with `kc` and `kt` of them sending `event` on `dayOffset` after.
 */
async function seedArms(env, opts) {
  const { experiment, control, treatment, nc, nt, kc, kt, event, dayOffset, at } = opts;
  const send = (events, when) => sendAll(env, events, when);
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
  // A plan the seeded arms meet, so the comparison is open.
  const presets = withPlan("tour_shape_2026_10", { nPerArm: 70, minDays: 14, mde: 0.15 });
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
  const res = await call(adminGet("/v1/admin/experiments/results?experiment=tour_shape_2026_10", admin), env, {
    now: NOW,
    presets
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const body = res.body;
  assert.equal(body.control, "invite");
  assert.equal(body.horizon.reached, true);
  assert.equal(body.horizon.readyAt, t0 + 14 * DAY);
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
  const presets = withPlan("aa_2026_10", { nPerArm: 40, minDays: 7, mde: null });
  const young = await call(adminGet("/v1/admin/experiments/results?experiment=aa_2026_10", admin), env, {
    now: NOW,
    presets
  });
  const primary = young.body.metrics[0];
  // The preset window is 7 days and everybody was exposed 3 days ago.
  assert.deepEqual(primary.arms, []);
  assert.equal(young.body.exposed.length, 2);

  const later = await call(adminGet("/v1/admin/experiments/results?experiment=aa_2026_10", admin), env, {
    now: NOW + 5 * DAY,
    presets
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

test("the sweep deletes events, exposures and counters past retention, and nothing younger", async () => {
  const env = freshEnv();
  const old = NOW - 200 * DAY;
  await call(beacon({ events: [expose("aa_2026_10", "a", "a1b2c3d4e5f60718"), ev("app_open", "a1b2c3d4e5f60718")] }), env, {
    now: old
  });
  await call(beacon({ events: [expose("aa_2026_10", "b", "b1b2c3d4e5f60718"), ev("app_open", "a1b2c3d4e5f60718")] }), env, {
    now: NOW
  });
  await sweepExpired(env.DB, NOW);
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM events"))[0].n, 2);
  // The privacy page says 180 days for everything; an exposure holds the id too.
  assert.deepEqual(await rows(env, "SELECT cid FROM exposures"), [{ cid: "b1b2c3d4e5f60718" }]);
  const days = (await rows(env, "SELECT DISTINCT day FROM ingest_daily")).map((r) => r.day);
  assert.deepEqual(days, [new Date(NOW * 1000).toISOString().slice(0, 10)]);
  assert.equal(EVENT_RETENTION_SECONDS, 180 * DAY);
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

/* —— The registry and its metrics (audit AB-1, AB-8) —— */

/**
 * js/experiments-config.js as the browser sees it.
 * @returns {Object} window.VT_EXPERIMENTS.
 */
function clientExperiments() {
  const src = readFileSync(new URL("../../../js/experiments-config.js", import.meta.url), "utf8");
  const window = {};
  vm.runInNewContext(src, { window });
  // Out of the other realm, so deep equality compares values, not prototypes.
  return JSON.parse(JSON.stringify(window.VT_EXPERIMENTS));
}

test("every preset is judged only on events all of its arms send, and has a plan", () => {
  for (const [key, preset] of Object.entries(EXPERIMENT_PRESETS)) {
    assert.deepEqual(presetProblems(key, preset), [], key);
    // Spelled out: each metric's event is sent by every arm.
    const arms = Object.keys(preset.armEvents);
    for (const m of [preset.primary, ...preset.guardrails]) {
      for (const arm of arms) {
        assert.equal(preset.armEvents[arm].includes(m.event), false, `${key}: ${m.event} is ${arm}-only`);
      }
    }
  }
  // The preset loop_home shipped with would have failed here.
  const before = {
    ...EXPERIMENT_PRESETS.loop_home_2026_10,
    guardrails: [{ event: "basics_complete", kind: "days", from: 0, to: 28 }]
  };
  assert.deepEqual(presetProblems("loop_home_2026_10", before), [
    'loop_home_2026_10: "basics_complete" is sent only by some arms, so it cannot be a metric'
  ]);
  const tourBefore = {
    ...EXPERIMENT_PRESETS.tour_shape_2026_10,
    guardrails: [{ event: "tour_dismiss", kind: "share", from: 0, to: 1 }]
  };
  assert.equal(presetProblems("tour_shape_2026_10", tourBefore).length, 1);
});

test("the worker's registry and js/experiments-config.js name the same experiments, arms and weights", () => {
  const client = clientExperiments();
  assert.deepEqual(Object.keys(client).sort(), Object.keys(EXPERIMENT_PRESETS).sort());
  for (const [key, def] of Object.entries(client)) {
    const preset = EXPERIMENT_PRESETS[key];
    assert.deepEqual(def.variants.map((v) => v.id), preset.arms, key);
    assert.deepEqual(def.variants.map((v) => v.weight), preset.weights, key);
    // variants[0] is what ships while an experiment is off: the control.
    assert.equal(def.variants[0].id, preset.control, key);
  }
});

test("exposures count only for registered experiments and arms; the rest stay plain events", async () => {
  const env = freshEnv();
  const spam = [];
  for (let i = 0; i < 24; i += 1) spam.push(expose(`spam_${String(i).padStart(3, "0")}`, "a", "a1b2c3d4e5f60718"));
  spam.push(expose("loop_home_2026_10", "evil", "a1b2c3d4e5f60718"));
  const res = await call(beacon({ events: spam }), env, { now: NOW });
  assert.equal(res.status, 200);
  assert.equal(res.body.accepted, 25);
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM exposures"))[0].n, 0);
  assert.deepEqual(await rows(env, "SELECT n FROM ingest_daily WHERE reason = 'exposure_unregistered'"), [{ n: 25 }]);
  // The admin list shows the registry, and only the registry.
  const admin = await signIn(env, "admin@example.test", NOW);
  const list = await call(adminGet("/v1/admin/experiments", admin), env, { now: NOW });
  assert.deepEqual(
    list.body.experiments.map((e) => e.experiment),
    Object.keys(EXPERIMENT_PRESETS)
  );
  const unknown = await call(adminGet("/v1/admin/experiments/results?experiment=spam_000", admin), env, { now: NOW });
  assert.equal(unknown.status, 404);
});

test("one address can add at most the daily cap of new exposures; its events are still kept", async () => {
  const env = freshEnv();
  const [cap] = EXPOSURE_IP_CAP;
  const headers = { "cf-connecting-ip": "203.0.113.77" };
  const total = cap + 25;
  for (let i = 0; i < total; i += MAX_EVENTS_PER_REQUEST) {
    const batch = [];
    for (let j = i; j < Math.min(total, i + MAX_EVENTS_PER_REQUEST); j += 1) batch.push(expose("aa_2026_10", "a", cid(j, "f")));
    const res = await call(beacon({ events: batch }, { headers }), env, { now: NOW });
    assert.equal(res.status, 200);
  }
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM exposures"))[0].n, cap);
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM events"))[0].n, total);
  assert.deepEqual(await rows(env, "SELECT n FROM ingest_daily WHERE reason = 'exposure_capped'"), [{ n: 25 }]);
  // Re-asserting an arm already stored costs nothing against the cap.
  const again = await call(beacon({ events: [ev("app_open", cid(0, "f"), { x_aa_2026_10: "a" })] }, { headers }), env, {
    now: NOW
  });
  assert.equal(again.status, 200);
  // A new day, a new allowance.
  const tomorrow = await call(beacon({ events: [expose("aa_2026_10", "b", cid(999, "f"))] }, { headers }), env, {
    now: NOW + DAY
  });
  assert.equal(tomorrow.status, 200);
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM exposures"))[0].n, cap + 1);
});

/* —— Exposures that never arrived (audit AB-3) —— */

test("an app_open re-asserting an arm creates a missing exposure and never changes a stored one", async () => {
  const env = freshEnv();
  const who = "a1b2c3d4e5f60718";
  // The first exposure beacon was lost; the next visit's app_open says the arm.
  await call(beacon({ events: [ev("app_open", who, { day: "2027-01-15", loop: false, x_loop_home_2026_10: "classic" })] }), env, {
    now: NOW
  });
  assert.deepEqual(await rows(env, "SELECT experiment, cid, variant, first_at FROM exposures"), [
    { experiment: "loop_home_2026_10", cid: who, variant: "classic", first_at: NOW }
  ]);
  // Saying something else later changes nothing: the first delivered arm stays.
  await call(
    beacon({
      events: [
        ev("app_open", who, { x_loop_home_2026_10: "loop", x_spam_000: "a", x_aa_2026_10: "evil" }),
        expose("loop_home_2026_10", "loop", who)
      ]
    }),
    env,
    { now: NOW + DAY }
  );
  assert.deepEqual(await rows(env, "SELECT experiment, variant, first_at FROM exposures"), [
    { experiment: "loop_home_2026_10", variant: "classic", first_at: NOW }
  ]);
  const counts = Object.fromEntries((await rows(env, "SELECT reason, SUM(n) AS n FROM ingest_daily GROUP BY reason")).map((r) => [r.reason, r.n]));
  assert.equal(counts.exposure_recovered, 1);
  assert.equal(counts.exposure_new, 1);
  assert.equal(counts.exposure_unregistered, 2);
});

test("ingest counters count every outcome per day, hold no id or address, and reach the admin list", async () => {
  const env = freshEnv();
  const headers = { "cf-connecting-ip": "203.0.113.5" };
  await call(beacon({ events: [ev("app_open", "a1b2c3d4e5f60718"), ev("nope", "a1b2c3d4e5f60718")] }, { headers }), env, { now: NOW });
  await call(beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }, { headers, origin: "https://moved.example" }), env, { now: NOW });
  await call(beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }, { headers: { ...headers, "sec-gpc": "1" } }), env, { now: NOW });
  await call(beacon("not json", { headers }), env, { now: NOW });
  const stored = await rows(env, "SELECT * FROM ingest_daily ORDER BY reason");
  assert.deepEqual(Object.keys(stored[0]).sort(), ["day", "n", "reason"]);
  assert.deepEqual(
    stored.map((r) => [r.reason, r.n]),
    [
      ["accepted", 1],
      ["bad_request", 1],
      ["opted_out", 1],
      ["origin_not_allowed", 1],
      ["unknown_event", 1]
    ]
  );
  const text = JSON.stringify(stored);
  assert.equal(text.includes("a1b2c3d4e5f60718") || text.includes("203.0.113.5"), false);
  const all = [...INGEST_REASONS.event, ...INGEST_REASONS.exposure, ...INGEST_REASONS.request];
  assert.ok(stored.every((r) => all.includes(r.reason)));

  const admin = await signIn(env, "admin@example.test", NOW);
  const list = await call(adminGet("/v1/admin/experiments", admin), env, { now: NOW + 3600 });
  assert.equal(list.body.ingest.totals.accepted, 1);
  assert.equal(list.body.ingest.totals.origin_not_allowed, 1);
  assert.equal(list.body.ingest.lastAcceptedAt, NOW);
  assert.equal(list.body.ingest.days.length, 1);
  // The switch means "record nothing", counters included.
  const off = freshEnv({ EVENTS_ENABLED: "false" });
  await call(beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }), off, { now: NOW });
  await ensureSchema(off.DB);
  assert.equal((await rows(off, "SELECT COUNT(*) AS n FROM ingest_daily"))[0].n, 0);
});

/* —— Taking data back (audit AB-6) —— */

/**
 * POST /v1/events/forget the way js/privacy-switch.js does.
 * @param {unknown} body Body.
 * @param {{headers?: Object, origin?: string|null}} [options] Overrides.
 * @returns {Request} Request.
 */
function forget(body, options) {
  const opts = options || {};
  const origin = opts.origin === undefined ? TEST_ORIGIN : opts.origin;
  return new Request(`${BASE}/v1/events/forget`, {
    method: "POST",
    headers: { "content-type": "text/plain;charset=UTF-8", ...(origin ? { Origin: origin } : {}), ...(opts.headers || {}) },
    body: JSON.stringify(body)
  });
}

test("forget deletes one browser's events and exposures, and nobody else's", async () => {
  const env = freshEnv();
  const me = "a1b2c3d4e5f60718";
  const other = "b1b2c3d4e5f60718";
  await call(beacon({ events: [expose("aa_2026_10", "a", me), ev("app_open", me), ev("practice_day", me)] }), env, { now: NOW });
  await call(beacon({ events: [expose("aa_2026_10", "b", other), ev("app_open", other)] }), env, { now: NOW });
  const res = await call(forget({ cid: me }), env, { now: NOW + 60 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.deepEqual(res.body, { ok: true, deleted: { events: 3, exposures: 1 } });
  assert.deepEqual((await rows(env, "SELECT DISTINCT cid FROM events")).map((r) => r.cid), [other]);
  assert.deepEqual((await rows(env, "SELECT cid FROM exposures")).map((r) => r.cid), [other]);
  // Its per-browser counter goes too, so the id is nowhere.
  assert.equal(JSON.stringify(await rows(env, "SELECT bucket FROM rate_limits")).includes(me), false);
  assert.deepEqual(await rows(env, "SELECT n FROM ingest_daily WHERE reason = 'forget'"), [{ n: 1 }]);

  // Only from the site, only a real id, only by POST.
  assert.equal((await call(forget({ cid: other }, { origin: "https://evil.test" }), env, { now: NOW })).status, 403);
  assert.equal((await call(forget({ cid: "x" }), env, { now: NOW })).status, 400);
  assert.equal((await call(new Request(`${BASE}/v1/events/forget`), env, { now: NOW })).status, 405);
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM exposures"))[0].n, 1);
});

test("forget works with recording switched off and from a browser that asks not to be tracked", async () => {
  const env = freshEnv();
  await call(beacon({ events: [ev("app_open", "a1b2c3d4e5f60718")] }), env, { now: NOW });
  const off = { ...env, EVENTS_ENABLED: "false" };
  const res = await call(forget({ cid: "a1b2c3d4e5f60718" }, { headers: { "sec-gpc": "1" } }), off, { now: NOW });
  assert.equal(res.status, 200);
  assert.equal((await rows(env, "SELECT COUNT(*) AS n FROM events"))[0].n, 0);
});

/* —— Reading a result: horizon and instrumentation (audit AB-2, AB-5) —— */

/**
 * Deterministic generator, so simulated results are reproducible.
 * @param {number} seed Seed.
 * @returns {function(): number} Uniform [0, 1).
 */
function rng(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The audit's loop_home simulation: 200 browsers per arm behaving the same
 * (half drift away, half keep practising), exposed on opening the app.
 * @param {Object} env Env.
 * @param {{classicSendsPracticeDay: boolean}} opts How the classic arm is instrumented.
 * @returns {Promise<{truth: Object, t0: number}>} True shares practising in days 21-27.
 */
async function simulateLoopHome(env, opts) {
  const r = rng(42);
  const t0 = NOW - 40 * DAY;
  const truth = { loop: 0, classic: 0 };
  const dayOf = (at) => new Date((at - 5 * 3600) * 1000).toISOString().slice(0, 10);
  for (const arm of ["loop", "classic"]) {
    const exposures = [];
    const later = new Map();
    for (let i = 0; i < 200; i += 1) {
      const who = cid(i, arm.charAt(0));
      exposures.push(ev("app_open", who, {}, dayOf(t0)), expose("loop_home_2026_10", arm, who));
      const q = r() < 0.5 ? 0.03 : 0.3;
      let late = false;
      for (let d = 0; d < 28; d += 1) {
        if (r() >= q) continue;
        if (d >= 21) late = true;
        const at = t0 + d * DAY + 3600;
        const list = later.get(at) || [];
        list.push(ev("practice_recorded", who, { firstOfDay: true }, dayOf(at)));
        if (arm === "loop" || opts.classicSendsPracticeDay) list.push(ev("practice_day", who, {}, dayOf(at)));
        if (arm === "loop") list.push(ev("basics_complete", who, { tier: "min" }, dayOf(at)));
        later.set(at, list);
      }
      if (late) truth[arm] += 1;
    }
    await sendAll(env, exposures, t0);
    for (const [at, list] of later) await sendAll(env, list, at);
  }
  return { truth: { loop: truth.loop / 200, classic: truth.classic / 200 }, t0 };
}

test("one arm not sending a metric's event is caught as an instrumentation fault, not crowned", async () => {
  const env = freshEnv();
  await simulateLoopHome(env, { classicSendsPracticeDay: false });
  const admin = await signIn(env, "admin@example.test", NOW);
  const presets = withPlan("loop_home_2026_10", { nPerArm: 200, minDays: 28, mde: 0.1 });
  const res = await call(adminGet("/v1/admin/experiments/results?experiment=loop_home_2026_10", admin), env, {
    now: NOW,
    presets
  });
  assert.equal(res.body.srm.flagged, false);
  assert.equal(res.body.readMe, "instrumentation");
  const mix = Object.fromEntries(res.body.eventMix.events.map((e) => [e.event, e]));
  assert.equal(mix.practice_day.flagged, true);
  assert.equal(mix.practice_day.reason, "missing");
  assert.equal(mix.app_open.flagged, false);
  assert.equal(mix.practice_recorded.flagged, false);
});

test("with every arm sending the same events, the loop_home readout finds what is true: no difference", async () => {
  const env = freshEnv();
  const { truth } = await simulateLoopHome(env, { classicSendsPracticeDay: true });
  const admin = await signIn(env, "admin@example.test", NOW);
  const presets = withPlan("loop_home_2026_10", { nPerArm: 200, minDays: 28, mde: 0.1 });
  const res = await call(adminGet("/v1/admin/experiments/results?experiment=loop_home_2026_10", admin), env, {
    now: NOW,
    presets
  });
  assert.equal(res.body.readMe, "ok", JSON.stringify(res.body.eventMix));
  const primary = res.body.metrics.find((m) => m.role === "primary");
  const classic = primary.arms.find((a) => a.variant === "classic");
  assert.ok(Math.abs(classic.rate - truth.classic) < 0.03, `${classic.rate} vs ${truth.classic}`);
  assert.ok(primary.comparisons[0].p > 0.05, String(primary.comparisons[0].p));
  assert.equal(res.body.metrics.some((m) => m.event === "basics_complete"), false);
});

test("app_open at different rates between arms is flagged: every exposed browser had the app open", async () => {
  const env = freshEnv();
  const t0 = NOW - 10 * DAY;
  const events = [];
  for (let i = 0; i < 60; i += 1) {
    events.push(expose("aa_2026_10", "a", cid(i, "a")), ev("app_open", cid(i, "a")));
    events.push(expose("aa_2026_10", "b", cid(i, "b")));
    if (i % 2 === 0) events.push(ev("app_open", cid(i, "b")));
  }
  await sendAll(env, events, t0);
  const admin = await signIn(env, "admin@example.test", NOW);
  const res = await call(adminGet("/v1/admin/experiments/results?experiment=aa_2026_10", admin), env, { now: NOW });
  const open = res.body.eventMix.events.find((e) => e.event === "app_open");
  assert.deepEqual(
    open.arms.map((a) => [a.variant, a.n, a.k]),
    [
      ["a", 60, 60],
      ["b", 60, 30]
    ]
  );
  assert.equal(open.reason, "differs");
  assert.equal(res.body.readMe, "instrumentation");
});

test("a result stays too early, with counts and no comparison, until the plan is met; then it is fixed", async () => {
  const env = freshEnv();
  const t0 = NOW - 60 * DAY;
  const presets = withPlan("aa_2026_10", { nPerArm: 40, minDays: 10, mde: null });
  const wave = (from, count, practising) => {
    const events = [];
    for (let i = from; i < from + count; i += 1) {
      for (const arm of ["a", "b"]) {
        events.push(expose("aa_2026_10", arm, cid(i, arm)));
      }
    }
    const later = [];
    for (let i = from; i < from + practising; i += 1) {
      for (const arm of ["a", "b"]) later.push(ev("practice_day", cid(i, arm)));
    }
    return { events, later };
  };
  const admin = await signIn(env, "admin@example.test", NOW);
  const read = async (at) =>
    (await call(adminGet("/v1/admin/experiments/results?experiment=aa_2026_10", admin), env, { now: at, presets })).body;

  const first = wave(0, 25, 10);
  await sendAll(env, first.events, t0);
  await sendAll(env, first.later, t0 + 2 * DAY);

  // Day 2: 25 a side; the date is an estimate from the arrival rate.
  const early = await read(t0 + 2 * DAY);
  assert.equal(early.readMe, "too_early");
  assert.equal(early.horizon.estimated, true);
  assert.equal(early.horizon.reached, false);
  assert.ok(early.horizon.readyAt >= t0 + 10 * DAY);
  assert.equal(typeof early.srm.p, "number");
  assert.ok(early.eventMix.events.length > 0);

  const second = wave(25, 25, 10);
  await sendAll(env, second.events, t0 + 3 * DAY);
  await sendAll(env, second.later, t0 + 5 * DAY);

  // Day 9: 40 a side are in (the second wave closed it at day 3), but their
  // week is not over and ten days have not passed. Counts, no comparison.
  const waiting = await read(t0 + 9 * DAY);
  assert.equal(waiting.readMe, "too_early");
  assert.equal(waiting.horizon.estimated, false);
  assert.equal(waiting.horizon.cohortEnd, t0 + 3 * DAY);
  assert.equal(waiting.horizon.readyAt, t0 + 10 * DAY);
  const primaryWaiting = waiting.metrics[0];
  assert.deepEqual(
    primaryWaiting.arms.map((a) => [a.variant, a.n, a.k]),
    [
      ["a", 25, 10],
      ["b", 25, 10]
    ]
  );
  assert.deepEqual(primaryWaiting.comparisons, []);
  assert.equal(primaryWaiting.withheld, true);
  assert.equal(waiting.horizon.counted, 25);

  // Day 10: open, on the planned sample.
  const ready = await read(t0 + 10 * DAY);
  assert.equal(ready.readMe, "ok");
  assert.equal(ready.horizon.reached, true);
  assert.deepEqual(
    ready.metrics[0].arms.map((a) => [a.variant, a.n, a.k]),
    [
      ["a", 50, 20],
      ["b", 50, 20]
    ]
  );
  assert.equal(ready.metrics[0].comparisons[0].p, 1);

  // People who arrive afterwards, and looking again weeks later, change nothing.
  const third = wave(50, 30, 30);
  await sendAll(env, third.events, t0 + 12 * DAY);
  await sendAll(env, third.later, t0 + 13 * DAY);
  const again = await read(t0 + 40 * DAY);
  assert.deepEqual(again.metrics, ready.metrics);
  assert.deepEqual(again.horizon.cohortEnd, ready.horizon.cohortEnd);
});

test("the funnel readout gives one conditional proportion per step, never a comparison", async () => {
  const env = freshEnv();
  // Ten browsers open the site. Five open the account panel. Two of those start
  // a sign-in and both succeed. One sees the trial offer and presses it.
  const events = [];
  for (let i = 0; i < 10; i++) events.push(ev("app_open", cid(i, "f")));
  for (let i = 0; i < 5; i++) events.push(ev("account_panel_open", cid(i, "f"), { state: "offered" }));
  for (let i = 0; i < 2; i++) {
    events.push(ev("signin_start", cid(i, "f"), { method: "google" }));
    events.push(ev("signin_success", cid(i, "f"), { method: "google" }));
  }
  events.push(ev("trial_cta_view", cid(0, "f"), { where: "panel" }));
  events.push(ev("trial_click", cid(0, "f"), { where: "panel" }));
  events.push(ev("trial_result", cid(0, "f"), { outcome: "started", where: "panel" }));
  await sendAll(env, events, NOW);

  const admin = await signIn(env, "admin@example.test", NOW);
  const res = await call(adminGet("/v1/admin/funnel", admin), env, { now: NOW });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const byStep = Object.fromEntries(res.body.steps.map((s) => [s.step, s]));

  assert.equal(res.body.browsers, 10);
  // The first step is the denominator and carries no rate: there is nothing
  // before it to be conditional on.
  assert.equal(byStep.app_open.browsers, 10);
  assert.equal(byStep.app_open.rate, null);
  // Conditional on the step before it, which is the whole point: 5 of the 10 who
  // opened the site, then 2 of those 5, not 2 of 10.
  assert.equal(byStep.account_panel_open.browsers, 5);
  assert.equal(byStep.account_panel_open.of, 10);
  assert.equal(byStep.account_panel_open.rate, 0.5);
  assert.equal(byStep.signin_start.browsers, 2);
  assert.equal(byStep.signin_start.of, 5);
  assert.equal(byStep.signin_success.of, 2);
  assert.equal(byStep.signin_success.rate, 1);
  // A rate of 1 still carries a bound below 1: two of two is not proof.
  assert.ok(byStep.signin_success.lo < 1 && byStep.signin_success.lo > 0.2);
  assert.equal(byStep.signin_success.hi, 1);
  // A step nobody reached reports zero of its denominator, not a null.
  assert.equal(byStep.trial_first_practice.browsers, 0);
  assert.equal(byStep.trial_first_practice.rate, 0);
  assert.ok(byStep.trial_first_practice.hi > 0);
  // The panel's own states are counted per browser, with the zeros visible.
  assert.equal(res.body.panelStates.offered, 5);
  assert.equal(res.body.panelStates.blocked, 0);
  // And the readout says what it is, so nobody reads it as an A/B result.
  assert.match(res.body.readMe, /not an A\/B comparison/);
});

test("the funnel breaks out what the trial press actually did, since its rate cannot", async () => {
  // Every branch of both trial buttons ends in a trial_result, so the step rate
  // is ~1 whatever happens and the leak lives in the outcome. Six browsers press:
  // three start a trial, two are sent off to sign in first, one is told the trial
  // is spent.
  const env = freshEnv();
  const events = [];
  for (let i = 0; i < 6; i++) {
    events.push(ev("app_open", cid(i, "o")));
    events.push(ev("trial_click", cid(i, "o"), { where: "pricing" }));
  }
  for (let i = 0; i < 3; i++) {
    events.push(ev("trial_result", cid(i, "o"), { outcome: "started", where: "pricing", kind: "account" }));
  }
  for (let i = 3; i < 5; i++) {
    events.push(
      ev("trial_result", cid(i, "o"), { outcome: "needs_account", where: "pricing", kind: "account" })
    );
  }
  events.push(ev("trial_result", cid(5, "o"), { outcome: "trial_used", where: "panel", kind: "account" }));
  await sendAll(env, events, NOW);

  const admin = await signIn(env, "admin@example.test", NOW);
  const res = await call(adminGet("/v1/admin/funnel", admin), env, { now: NOW });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const byStep = Object.fromEntries(res.body.steps.map((s) => [s.step, s]));
  // The step itself says everything went fine, which is the trap.
  assert.equal(byStep.trial_result.rate, 1);
  // The breakout says half of them did not get a trial. Sorted by size, so the
  // biggest bucket is readable first, and a differing `where` or `kind` does not
  // split an outcome into two rows.
  const outcomes = Object.fromEntries(res.body.trialOutcomes.map((o) => [o.outcome, o.browsers]));
  assert.deepEqual(outcomes, { started: 3, needs_account: 2, trial_used: 1 });
  assert.deepEqual(
    res.body.trialOutcomes.map((o) => o.outcome),
    ["started", "needs_account", "trial_used"]
  );
  // And the readout warns about the two things a reader would otherwise assume.
  assert.match(res.body.readMe, /needs_account/);
  assert.match(res.body.readMe, /add up to more/);
});

test("the funnel counts a blocked Google script, which no experiment would report", async () => {
  const env = freshEnv();
  const events = [];
  for (let i = 0; i < 6; i++) {
    events.push(ev("app_open", cid(i, "g")));
    events.push(ev("account_panel_open", cid(i, "g"), { state: i < 4 ? "blocked" : "offered" }));
  }
  await sendAll(env, events, NOW);
  const admin = await signIn(env, "admin@example.test", NOW);
  const res = await call(adminGet("/v1/admin/funnel?days=7", admin), env, { now: NOW });
  assert.equal(res.status, 200);
  assert.equal(res.body.window.days, 7);
  assert.equal(res.body.panelStates.blocked, 4);
  assert.equal(res.body.panelStates.offered, 2);
});

test("the funnel window excludes older events, and it is admin-only", async () => {
  const env = freshEnv();
  await sendAll(env, [ev("app_open", cid(1, "h"))], NOW - 30 * DAY);
  await sendAll(env, [ev("app_open", cid(2, "h")), ev("account_panel_open", cid(2, "h"), { state: "offered" })], NOW);

  const anon = await call(adminGet("/v1/admin/funnel"), env, { now: NOW });
  assert.equal(anon.status, 401);
  const member = await signIn(env, "someone@example.test", NOW);
  const forbidden = await call(adminGet("/v1/admin/funnel", member), env, { now: NOW });
  assert.equal(forbidden.status, 403);

  const admin = await signIn(env, "admin@example.test", NOW);
  const res = await call(adminGet("/v1/admin/funnel?days=7", admin), env, { now: NOW });
  assert.equal(res.status, 200);
  // The 30-day-old browser is outside a 7-day window.
  assert.equal(res.body.browsers, 1);
  const wide = await call(adminGet("/v1/admin/funnel?days=90", admin), env, { now: NOW });
  assert.equal(wide.body.browsers, 2);
  // A nonsense or oversized window falls back to the default rather than erroring.
  const junk = await call(adminGet("/v1/admin/funnel?days=nonsense", admin), env, { now: NOW });
  assert.equal(junk.body.window.days, 28);
  const huge = await call(adminGet("/v1/admin/funnel?days=100000", admin), env, { now: NOW });
  assert.equal(huge.body.window.days, 180);
});
