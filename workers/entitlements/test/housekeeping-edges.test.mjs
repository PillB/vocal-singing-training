/**
 * Housekeeping: what the daily sweep keeps and what it deletes, how much one
 * run may do, the schema check a warm isolate skips, and the deadline each
 * call out of the worker really gets.
 *
 * A sweep of planted defects on PR #38 found that every one of these could
 * change with all the worker's tests green, because:
 * - the deadline tests all set a short `timeoutMs`, while the routes never
 *   pass one, so the default every real sign-in gets was never looked at;
 * - the sweep tests planted only rows that any condition deletes (a session
 *   created and expired in the same second, a report closed ten seconds after
 *   it arrived), and never used a live row after a sweep;
 * - the backlog test sized its backlog from the constants it was checking.
 *
 * So here the sweep runs between real requests: a person signs in, asks for a
 * code, is rate limited or files a report, the sweep runs as the 09:17 cron or
 * an admin would, and the next request must still see what it saw before.
 * Each test that could pass because the sweep did nothing also shows a row
 * the sweep did delete. Sizes and limits are written out by hand, with where
 * they come from: D1's 50 queries an invocation and 100,000 rows written a
 * day, and the 10,000 events a day the events route admits.
 *
 * The deadline is read off `AbortSignal.timeout` by a spy that passes it on to
 * the real one, so a provider that takes a tenth of a second still sees the
 * deadline fire if it is shorter than that.
 */

import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import test from "node:test";

import { SWEEP_CHUNK_ROWS, ensureSchema, resetSchemaMemo, schemaFingerprint, sweepExpired } from "../src/db.js";
import { sendLoginCode } from "../src/email.js";
import { EVENTS_DAILY_CAP } from "../src/events.js";
import { clearGoogleJwksCache, fetchGoogleJwks } from "../src/google.js";
import worker, { handleRequest } from "../src/index.js";
import { SCHEMA_STATEMENTS, SCHEMA_VERSION } from "../src/schema.js";
import { TEST_ORIGIN, createAccountEnv } from "./fixtures.mjs";

const BASE = "https://entitlements.test";
const DAY = 86400;
/**
 * A fixed clock, on the hour (T % 3600 === 0), so an hourly bucket opens at T:
 * 08:00 UTC on 15 January 2027, so the UTC day it is in began eight hours before.
 */
const T = 1800000000;
const MIDNIGHT = T - 8 * 3600;
const CHROME_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";

// ------------------------------------------------------------------ helpers

/** A request to the worker, with a JSON body when one is given. */
function jsonRequest(method, path, body, headers) {
  const all = { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(headers || {}) };
  return new Request(`${BASE}${path}`, { method, headers: all, body: body === undefined ? undefined : JSON.stringify(body) });
}

/** The header a signed-in page sends. */
const bearer = (token) => ({ authorization: `Bearer ${token}` });

/** Call the router and read the JSON answer. */
async function call(env, request, options) {
  const res = await handleRequest(request, env, options || {});
  return { status: res.status, body: await res.json() };
}

/** Fresh env, as a new isolate sees it. */
function fresh(overrides) {
  resetSchemaMemo();
  return createAccountEnv(overrides);
}

/** One number from one row. */
async function count(db, sql, ...values) {
  const row = await db.prepare(sql).bind(...values).first();
  return Number(Object.values(row)[0]);
}

/** Ask for a sign-in code and read it out of the email the fake transport was given. */
async function askForCode(env, email, now, headers) {
  let code = null;
  const fetchImpl = async (url, init) => {
    code = (/\b(\d{6})\b/.exec(JSON.parse(init.body).text || "") || [])[1];
    return { ok: true, status: 200 };
  };
  const res = await call(env, jsonRequest("POST", "/v1/auth/email/start", { email }, headers), { now, fetchImpl });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(code, "a code was emailed");
  return code;
}

/** Sign in by emailed code at `now`; the session token and when it ends. */
async function signIn(env, email, now) {
  const code = await askForCode(env, email, now);
  const res = await call(env, jsonRequest("POST", "/v1/auth/email/verify", { email, code }), { now: now + 1 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return { token: res.body.sessionToken, expiresAt: res.body.expiresAt };
}

/** GET /v1/me as a signed-in page asks it. */
function me(env, token, now) {
  return call(env, jsonRequest("GET", "/v1/me", undefined, bearer(token)), { now });
}

/** Type an emailed code into the sign-in form at `now`. */
function verifyCode(env, email, code, now) {
  return call(env, jsonRequest("POST", "/v1/auth/email/verify", { email, code }), { now });
}

/**
 * POST `n` events from one browser, the way the site's beacon sends them:
 * text/plain, from the site's origin, from a real browser.
 * @param {Object} env Worker env.
 * @param {number} n Events in the batch.
 * @param {string} cid Browser id.
 * @param {string} ip The caller's address.
 * @param {number} now Clock.
 * @returns {Promise<{status: number, body: Object}>} The route's answer.
 */
function postEvents(env, n, cid, ip, now) {
  const event = { name: "app_open", cid, props: {}, t: "2027-01-15T15:00:00.000Z", day: "2027-01-15", tz: -300 };
  const headers = { "content-type": "text/plain;charset=UTF-8", "user-agent": CHROME_UA, Origin: TEST_ORIGIN, "cf-connecting-ip": ip };
  const body = JSON.stringify({ events: Array.from({ length: n }, () => event) });
  return call(env, new Request(`${BASE}/v1/events`, { method: "POST", headers, body }), { now });
}

/**
 * Run `go` with `AbortSignal.timeout` watched: every deadline asked for is
 * recorded, then handed to the real one, so it still fires.
 * @param {function(): Promise<unknown>} go The call to watch.
 * @returns {Promise<{value: unknown, asked: number[]}>} Its answer, and the deadlines in ms.
 */
async function deadlinesDuring(go) {
  const real = AbortSignal.timeout;
  const asked = [];
  AbortSignal.timeout = (ms) => {
    asked.push(ms);
    return real.call(AbortSignal, ms);
  };
  try {
    return { value: await go(), asked };
  } finally {
    AbortSignal.timeout = real;
  }
}

/**
 * A provider that answers after `ms`, as a real one does over the network,
 * unless the request's signal aborts first: then it fails as fetch does.
 * @param {number} ms How long it takes.
 * @param {function(Object): Object} answer Builds the response from the request.
 * @returns {function(string, Object): Promise<Object>} fetch-shaped.
 */
function answersAfter(ms, answer) {
  return (url, init) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => resolve(answer(init)), ms);
      const signal = init && init.signal;
      if (signal) {
        signal.addEventListener("abort", () => {
          clearTimeout(timer);
          reject(signal.reason);
        });
      }
    });
}

/** Google's key endpoint answering with a key set. */
const keySet = (jwks) => ({ ok: true, status: 200, json: async () => jwks });

const b64url = (value) => Buffer.from(value).toString("base64url");

/**
 * A Google ID token for `email`, signed with a throwaway RSA key, and the key
 * set that verifies it.
 * @param {string} email Verified address in the token.
 * @param {number} now Issued at.
 * @returns {Promise<{idToken: string, jwks: Object}>} Token and keys.
 */
async function googleToken(email, now) {
  const pair = await webcrypto.subtle.generateKey(
    { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" },
    true,
    ["sign", "verify"]
  );
  const { n, e } = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT", kid: "hk" }));
  const claims = b64url(JSON.stringify({
    iss: "https://accounts.google.com",
    aud: "test-client-id.apps.googleusercontent.com",
    sub: "google-sub-housekeeping",
    email,
    email_verified: true,
    iat: now,
    exp: now + 3600
  }));
  const signature = await webcrypto.subtle.sign("RSASSA-PKCS1-v1_5", pair.privateKey, Buffer.from(`${header}.${claims}`));
  return {
    idToken: `${header}.${claims}.${b64url(new Uint8Array(signature))}`,
    jwks: { keys: [{ kty: "RSA", n, e, alg: "RS256", use: "sig", kid: "hk" }] }
  };
}

/** File a report from the site at T; its reference. */
async function fileReport(env, summary, ip) {
  const headers = { Origin: TEST_ORIGIN, "cf-connecting-ip": ip };
  const res = await call(env, jsonRequest("POST", "/v1/reports", { kind: "bug", summary }, headers), { now: T });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.reference;
}

/** An admin signs in at `now` and closes a report with `status`. */
async function closeReport(env, reference, status, now) {
  const admin = await signIn(env, "admin@example.test", now);
  const res = await call(env, jsonRequest("POST", "/v1/admin/reports/update", { reference, status }, bearer(admin.token)), {
    now: now + 2
  });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.report.status, status);
}

/** `n` events received at `at`, written straight into the table. */
async function plantEvents(db, n, at) {
  await db.exec(`WITH RECURSIVE k(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM k WHERE i < ${n})
    INSERT INTO events (cid, name, props, received_at) SELECT 'c' || i, 'x', '{}', ${at} FROM k`);
}

/** The statements the sweep runs, as [sql, values], read off a sweep at `at`. */
async function sweepStatements(db, at) {
  const seen = [];
  const recording = {
    prepare: (sql) => {
      const statement = db.prepare(sql);
      return { bind: (...values) => (seen.push([sql, values]), statement.bind(...values)) };
    },
    batch: (list) => db.batch(list)
  };
  await sweepExpired(recording, at);
  return seen;
}

/** SQLite's plan for one statement, a step a line. */
async function planOf(db, [sql, values]) {
  const rows = (await db.prepare(`EXPLAIN QUERY PLAN ${sql}`).bind(...values).all()).results;
  return rows.map((row) => row.detail).join("\n");
}

/** A plan step that finds `table`'s rows by a range on `column` through an index. */
const searchedBy = (table, column) => new RegExp(`SEARCH ${table} USING (?:COVERING )?INDEX \\w+ \\([^)]*\\b${column}<\\?\\)`);

/**
 * A D1 on which every table is as backlogged as it gets: each DELETE reports
 * a full chunk and leaves the rows where they are. Counts every query that
 * reaches the database (each run, first, all and batch is one), and the
 * DELETEs by table.
 * @param {Object} db D1 fake.
 * @returns {{seen: {queries: number, deletes: Object<string, number>}, db: Object}} Counts and wrapper.
 */
function backloggedEverywhere(db) {
  const seen = { queries: 0, deletes: {} };
  const counted = (go) => {
    seen.queries += 1;
    return go();
  };
  const fullChunk = (table) => {
    seen.deletes[table] = (seen.deletes[table] || 0) + 1;
    return { success: true, meta: { changes: SWEEP_CHUNK_ROWS, last_row_id: 0 } };
  };
  const wrap = (sql, statement) => {
    const table = (/^DELETE FROM (\w+)/.exec(sql) || [])[1];
    return {
      raw: statement,
      bind: (...values) => wrap(sql, statement.bind(...values)),
      first: (column) => counted(() => statement.first(column)),
      all: () => counted(() => statement.all()),
      run: () => counted(() => (table ? fullChunk(table) : statement.run()))
    };
  };
  return {
    seen,
    db: { prepare: (sql) => wrap(sql, db.prepare(sql)), batch: (list) => counted(() => db.batch(list.map((s) => s.raw))) }
  };
}

// ------------------------------------------------- deadlines at the call site

test("a sign-in email whose provider takes a tenth of a second is sent, under a deadline a person would wait for", async () => {
  // The route passes no deadline of its own, so the default in email.js is the
  // one every real sign-in gets. Cut to 10 ms, no real provider (a TLS
  // handshake and an API call) ever answered in time: every "Send code" was a
  // 502 and nobody could sign in by email. Raised to a minute, a provider that
  // hung held the person's button spinning a minute before saying anything.
  const env = fresh();
  const sentTo = [];
  const provider = answersAfter(100, (init) => {
    sentTo.push(JSON.parse(init.body).to);
    return { ok: true, status: 200 };
  });
  const { value, asked } = await deadlinesDuring(() =>
    call(env, jsonRequest("POST", "/v1/auth/email/start", { email: "slow@example.test" }), { now: T, fetchImpl: provider })
  );
  assert.deepEqual([value.status, value.body.sent], [200, true], JSON.stringify(value.body));
  assert.deepEqual(sentTo, [["slow@example.test"]], "the email went out");
  // One call out, given EMAIL_SEND_TIMEOUT_MS from email.js, written out here
  // by hand: change both together. Exact and not a range, because what this
  // checks is that the call site hands on the module's default and not a
  // number of its own, and a 15-second deadline typed into the call site sits
  // inside any range wide enough to let the default be retuned.
  // outbound-deadlines.test.mjs bounds the default itself (long enough for a
  // slow but working provider, short enough that a person does not give up).
  assert.deepEqual(asked, [10000], "the send was given email.js's own deadline");
});

test("a Google sign-in on a cold isolate waits for keys that take a tenth of a second, and no longer than a person would", async () => {
  // verifyGoogleIdToken passes no deadline either, so the key fetch always runs
  // on google.js's own. Cut to 5 ms, every sign-in that missed the key cache
  // (each new isolate, and each hour after) was refused as jwks_unavailable:
  // Google sign-in was down. Raised to a minute, a key server that hung held
  // the sign-in open a minute instead of five seconds.
  const env = fresh();
  const { idToken, jwks } = await googleToken("keys@example.test", T);
  clearGoogleJwksCache();
  try {
    const { value, asked } = await deadlinesDuring(() =>
      call(env, jsonRequest("POST", "/v1/auth/google", { idToken }), { now: T, fetchImpl: answersAfter(100, () => keySet(jwks)) })
    );
    assert.equal(value.status, 200, JSON.stringify(value.body));
    assert.ok(value.body.sessionToken, "signed in");
    // One key fetch, given GOOGLE_JWKS_TIMEOUT_MS from google.js, written out
    // by hand as above (change both together): twice it, typed in at the call
    // site, would hold a sign-in ten seconds on a key server that hung.
    assert.deepEqual(asked, [5000], "the key fetch was given google.js's own deadline");
  } finally {
    clearGoogleJwksCache();
  }
});

test("control: a provider that takes a tenth of a second is cut off by a shorter deadline, and the spy reports that deadline", async () => {
  // Without this, a provider that ignored its signal, or a spy that did not
  // hand the deadline on, would let the two tests above pass whatever deadline
  // the code asked for.
  const env = fresh();
  const mail = await deadlinesDuring(() =>
    sendLoginCode(env, "p@example.test", "123456", 15, { fetchImpl: answersAfter(100, () => ({ ok: true, status: 200 })), timeoutMs: 20 })
  );
  assert.deepEqual(mail.value, { ok: false, reason: "email_transport_error", provider: "resend" });
  assert.deepEqual(mail.asked, [20]);
  clearGoogleJwksCache();
  const keys = await deadlinesDuring(() =>
    fetchGoogleJwks({ fetchImpl: answersAfter(100, () => keySet({ keys: [{ kty: "RSA", kid: "k" }] })), now: T, timeoutMs: 20 }).catch(
      (error) => error
    )
  );
  clearGoogleJwksCache();
  assert.equal(keys.value && keys.value.name, "TimeoutError");
  assert.deepEqual(keys.asked, [20]);
});

// ------------------------------------------------------ what the sweep keeps

test("a session stays signed in through every daily sweep of its life, and is cleared a day after it ends", async () => {
  // Sessions last 90 days and nothing extends them. A sweep that went by
  // `created_at` deleted every session more than a day old, so the 09:17 cron
  // signed everybody out every day; one that cut a day ahead of `expires_at`
  // instead of a day behind ended each session up to 24 hours early. The last
  // sweep here runs a minute before the session ends, so a cutoff even a
  // minute ahead of `expires_at` (an hour, say) signs this person out early.
  const env = fresh();
  const { token, expiresAt } = await signIn(env, "keeps@example.test", T);
  assert.ok(expiresAt > T + 2 * DAY, "precondition: the session outlives the first sweeps");
  for (const at of [T + 2 * DAY, expiresAt - DAY / 2, expiresAt - 60]) {
    const swept = await sweepExpired(env.DB, at);
    const res = await me(env, token, at + 1);
    assert.equal(res.status, 200, `${at + 1 - T} s after signing in: ${JSON.stringify(res.body)}`);
    assert.equal(swept.deleted.sessions, 0, `swept ${at - T} s after signing in: no session was due`);
  }
  // Control: the sweep does reach sessions; a day after this one ended, it goes.
  const late = await sweepExpired(env.DB, expiresAt + DAY + 1);
  assert.equal(late.deleted.sessions, 1);
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM sessions"), 0);
});

test("a sign-in code still inside its fifteen minutes signs the person in after a sweep", async () => {
  // Codes live 15 minutes and the sweep keeps an expired one for an hour. A
  // cutoff an hour ahead of now instead of behind deleted every code not yet
  // used: whoever pressed "Send code" just before 09:17, or before an admin's
  // sweep, typed the right code and was told there was none. One code here is
  // typed a minute after the sweep; the other was asked for almost fifteen
  // minutes before it, so a cutoff only ten seconds ahead of now (ten minutes,
  // say) takes that one, and its owner, typing it in time, is refused.
  const env = fresh();
  await askForCode(env, "earlier@example.test", T - 2 * 3600, { "cf-connecting-ip": "198.51.100.1" });
  const soon = await askForCode(env, "now@example.test", T, { "cf-connecting-ip": "198.51.100.4" });
  const late = await askForCode(env, "late@example.test", T, { "cf-connecting-ip": "198.51.100.5" });
  const swept = await sweepExpired(env.DB, T + 60);
  const first = await verifyCode(env, "now@example.test", soon, T + 120);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.ok(first.body.sessionToken);
  await sweepExpired(env.DB, T + 890);
  const last = await verifyCode(env, "late@example.test", late, T + 895);
  assert.equal(last.status, 200, `typed five seconds before it ran out: ${JSON.stringify(last.body)}`);
  assert.ok(last.body.sessionToken);
  // Control: the sweep reached the codes, and took the one that ended long ago.
  assert.equal(swept.deleted.login_codes, 1, "only the code that expired more than an hour ago");
});

test("a used-up sign-in allowance stays used up after a sweep in the same hour", async () => {
  // An address gets five code emails an hour. A sweep that deleted every
  // bucket whose window had begun, which is all of them, handed the allowance
  // straight back: five more emails to an inbox being bombed after every sweep.
  const env = fresh();
  const sent = [];
  const fetchImpl = async (url, init) => {
    sent.push(JSON.parse(init.body).to[0]);
    return { ok: true, status: 200 };
  };
  const start = (email, now, ip) =>
    call(env, jsonRequest("POST", "/v1/auth/email/start", { email }, { "cf-connecting-ip": ip }), { now, fetchImpl });
  const toTarget = () => sent.filter((to) => to === "target@example.test").length;
  assert.equal((await start("stale@example.test", T - 2 * DAY, "198.51.100.2")).status, 200);
  for (let i = 0; i < 6; i += 1) {
    assert.equal((await start("target@example.test", T + i, "198.51.100.3")).status, 200);
  }
  assert.equal(toTarget(), 5, "precondition: the sixth in the hour was not sent");
  const swept = await sweepExpired(env.DB, T + 10);
  assert.equal((await start("target@example.test", T + 20, "198.51.100.3")).status, 200);
  assert.equal(toTarget(), 5, "still five this hour");
  // Control: the sweep reached the buckets, and took the two from two days ago.
  assert.equal(swept.deleted.rate_limits, 2);
});

test("a day's event cap filled by morning stays filled through the 09:17 cron and a sweep just before midnight", async () => {
  // The events route stores at most so many events a UTC day: the guard on
  // D1's 100,000 rows written a day, past which the free plan refuses every
  // query, sign-in and the payment ledger included, until 00:00 UTC. Its
  // bucket opens at midnight and has to live the whole day. A sweep that
  // cleared buckets more than an hour old deleted it at 09:17 on any day it
  // had filled by then, and the day took a second cap's worth: at 10,000
  // events, 30,000 more rows written. The sweeps here run at 09:17 and ten
  // seconds before midnight, so any cutoff more than ten seconds short of a
  // day (twelve hours, say, which the 09:17 run alone would let through)
  // turns this red.
  // The cap is turned down to two so the behaviour, not the number, is checked.
  const env = fresh({ EVENTS_DAILY_CAP: "2" });
  // A browser two days ago: its hourly buckets are the ones the sweep must take.
  assert.equal((await postEvents(env, 1, "stalebrowser", "198.51.100.20", T - 2 * DAY)).body.accepted, 1);
  assert.equal((await postEvents(env, 2, "morningbrowser", "198.51.100.21", T)).body.accepted, 2, "the day's two, by 08:00");
  const sweeps = [MIDNIGHT + 9 * 3600 + 17 * 60, MIDNIGHT + DAY - 10];
  const swept = [];
  for (const [i, at] of sweeps.entries()) {
    swept.push(await sweepExpired(env.DB, at));
    const res = await postEvents(env, 1, `laterbrowser${i}`, `198.51.100.${30 + i}`, at + 5);
    assert.deepEqual([res.status, res.body.reason], [202, "daily_capped"], `swept ${at - MIDNIGHT} s into the day: ${JSON.stringify(res.body)}`);
  }
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM events WHERE received_at >= ?1", MIDNIGHT), 2, "two stored that day, the cap");
  // Control: the sweep reached the buckets, and took the stale browser's two.
  assert.equal(swept[0].deleted.rate_limits, 2);
  // Control: the refusals were the cap's, not the request's: after midnight the same request is stored.
  assert.equal((await postEvents(env, 1, "laterbrowser9", "198.51.100.39", MIDNIGHT + DAY + 5)).body.accepted, 1);
});

test("a report closed months after it arrived is kept 180 days from closing, and every closed status goes after that", async () => {
  // privacy.html promises that a report that is fixed, declined or a
  // duplicate is deleted 180 days after it was closed. A sweep that counted
  // from `created_at` deleted a bug fixed after four months two months later;
  // one that left 'duplicate' out of the closed statuses kept duplicates for
  // ever. The late fix is looked at again 179 days after it was closed, so a
  // retention cut short by more than a day breaks the promise here too.
  const env = fresh();
  const lateFix = await fileReport(env, "arreglado tarde", "203.0.113.61");
  const duplicate = await fileReport(env, "repetido", "203.0.113.62");
  const declined = await fileReport(env, "descartado", "203.0.113.63");
  const open = await fileReport(env, "sigue abierto", "203.0.113.64");
  await closeReport(env, duplicate, "duplicate", T + 10);
  await closeReport(env, declined, "wontfix", T + 20);
  await closeReport(env, lateFix, "fixed", T + 120 * DAY);
  const left = async () => (await env.DB.prepare("SELECT id FROM reports ORDER BY id").all()).results.map((r) => r.id);

  const first = await sweepExpired(env.DB, T + 181 * DAY);
  assert.deepEqual(await left(), [lateFix, open].sort(), "181 days on: the late fix stays, the duplicate and the declined one go");
  assert.equal(first.deleted.reports, 2);
  // Closed at T + 120 days + 2 s (closeReport writes two seconds after signing in).
  await sweepExpired(env.DB, T + 120 * DAY + 179 * DAY);
  assert.deepEqual(await left(), [lateFix, open].sort(), "179 days after it was fixed the late fix is still kept");
  await sweepExpired(env.DB, T + 301 * DAY);
  assert.deepEqual(await left(), [open], "181 days after it was fixed the late fix goes too; the open one stays");
});

// ------------------------------------------------------------ the schema

test("older code rebuilding its tables leaves a newer two-digit schema version alone", async () => {
  // The version row is TEXT. Compared as text, '10' sorts before '6', so code
  // at version 6 that reran its batch (its own record missing, as during a
  // rollout) wrote 6 over 10: the downgrade the guard exists to stop, told to
  // whoever reads the database. Code at 10 meeting a stored '9' would never
  // have raised it either.
  assert.ok(SCHEMA_VERSION < 10, "precondition: the stored number below must be newer than this code's; raise it");
  const env = fresh();
  await ensureSchema(env.DB);
  const own = schemaFingerprint(SCHEMA_STATEMENTS);
  await env.DB.prepare("UPDATE schema_meta SET value = '10' WHERE key = 'version'").run();
  await env.DB.prepare("DELETE FROM schema_meta WHERE key = ?1").bind(own).run();
  resetSchemaMemo();
  await ensureSchema(env.DB);
  // Control: this code's record is back, so the batch that carries the guarded write ran.
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM schema_meta WHERE key = ?1", own), 1);
  assert.equal((await env.DB.prepare("SELECT value FROM schema_meta WHERE key = 'version'").first()).value, "10");
});

test("a warm isolate checks the schema on its first request only", async () => {
  // Every account, event, report and webhook request calls ensureSchema, and
  // the memo is what makes that free after the first. Without it on the usual
  // path (the schema already created by an earlier isolate), every request
  // paid one more D1 read and round trip, for the isolate's whole life.
  const env = fresh();
  const { token } = await signIn(env, "warm@example.test", T);
  resetSchemaMemo(); // a new isolate, on a database an earlier one set up
  const seen = { checks: 0, batches: 0 };
  const db = {
    prepare: (sql) => {
      seen.checks += /FROM schema_meta/.test(sql) ? 1 : 0;
      return env.DB.prepare(sql);
    },
    batch: (list) => {
      seen.batches += 1;
      return env.DB.batch(list);
    }
  };
  const isolate = { ...env, DB: db };
  for (const at of [T + 10, T + 20, T + 30]) {
    assert.equal((await me(isolate, token, at)).status, 200);
  }
  // One check, not none: the counter does see the first request's read.
  assert.deepEqual(seen, { checks: 1, batches: 0 }, "one read on the first request, then nothing");
});

test("each sweep chunk finds what it deletes through an index, on every table that grows with traffic", async () => {
  // D1 bills rows read, and every chunk runs its SELECT again. Through an
  // index on the swept column it reads the expired rows; without one it reads
  // the whole table, so the daily sweep's cost grows with every exposure ever
  // recorded instead of with what it deletes. An exposures index led by `cid`
  // did exactly that. (login_codes and rate_limits are scanned on purpose:
  // the sweep keeps each to about a day of rows.) Reports are found by status
  // and not by age: the sweep reads every closed report, which stays small
  // because report intake is capped per address, per account and overall,
  // but only while an index leads with `status`; without it, every open one
  // is read too, every day.
  const env = fresh();
  await ensureSchema(env.DB);
  const statements = await sweepStatements(env.DB, T);
  const byTable = new Map(statements.map((s) => [(/^DELETE FROM (\w+)/.exec(s[0]) || [])[1], s]));
  const columns = { sessions: "expires_at", events: "received_at", exposures: "first_at", ingest_daily: "day", ledger_kv: "expires_at" };
  for (const [table, column] of Object.entries(columns)) {
    assert.ok(byTable.has(table), `the sweep deletes from ${table}`);
    assert.match(await planOf(env.DB, byTable.get(table)), searchedBy(table, column), table);
  }
  assert.match(await planOf(env.DB, byTable.get("reports")), /SEARCH reports USING (?:COVERING )?INDEX \w+ \(status=\?/, "reports");
  // Control: the same exposures statement without its index is a scan, and the check says so.
  await env.DB.exec("DROP INDEX idx_exposures_first");
  const bare = await planOf(env.DB, byTable.get("exposures"));
  assert.match(bare, /\bSCAN exposures\b/);
  assert.doesNotMatch(bare, searchedBy("exposures", "first_at"));
});

// ------------------------------------------------------- how much one run does

test("one daily run clears more than a day of events at the intake cap, and the admin's sweep says the table is done", async () => {
  // The events route admits up to 10,000 a day, and 180 days later the same
  // 10,000 come due each day. A run allowed one 5,000-row chunk fell 5,000
  // further behind every day, so events outlived the 180 days privacy.html
  // promises. A run has to clear more than one day's cap, not exactly one:
  // the cap counts from 00:00 UTC, so the 24 hours between two 09:17 crons
  // hold parts of two capped days (up to 20,000 events), and a missed cron
  // adds a whole day more; a run held to exactly 10,000 (two chunks) never
  // catches up. The seven over 10,000 are also what makes the run's last
  // chunk short but not empty: a run that took only an empty chunk as the end
  // told the admin "unfinished: events" with none left, and spent a second
  // statement on every table that had anything to delete.
  assert.ok(EVENTS_DAILY_CAP[0] <= 10000, "the intake cap was raised past the day planted here: plant the new cap");
  const env = fresh();
  await ensureSchema(env.DB);
  await plantEvents(env.DB, 10007, 1);
  await plantEvents(env.DB, 1, T); // a fresh one, which stays
  const admin = await signIn(env, "admin@example.test", T);
  const res = await call(env, jsonRequest("POST", "/v1/admin/sweep", {}, bearer(admin.token)), { now: T + 10 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.deleted.events, 10007);
  assert.deepEqual(res.body.unfinished, []);
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM events"), 1, "the fresh event stays");

  // A quiet day: seven come due, and the table costs one statement.
  await plantEvents(env.DB, 7, 2);
  let deletes = 0;
  const counting = {
    prepare: (sql) => {
      deletes += /^DELETE FROM events\b/.test(sql) ? 1 : 0;
      return env.DB.prepare(sql);
    },
    batch: (list) => env.DB.batch(list)
  };
  const quiet = await sweepExpired(counting, T + DAY);
  assert.equal(quiet.deleted.events, 7);
  assert.equal(deletes, 1, "a short chunk is the last one");
});

test("a run after days without one deletes no more events than D1's daily write allowance can carry", async () => {
  // Four days without a cron at the intake cap leave 40,000 events due. Each
  // deleted event is three rows written on D1, the row and its two indexes
  // ("Indexes will add an additional written row when writes include the
  // indexed column", quoted in events.js), and the same UTC day still takes
  // its own intake: a day of intake at the 10,000 cap is 30,000 rows written
  // that same UTC day (events.js). Past 100,000 rows written the free plan
  // refuses every query until the UTC day ends. A run of five chunks deleted
  // 25,000 events, 75,000 rows, 105,000 with the day's intake, and took
  // sign-in and the payment ledger down with it until midnight. The rest
  // waits for the next run.
  //
  // The trade-off this accepts: on a catch-up day the three chunks db.js
  // chose (15,000 events, 45,000 rows) leave the account layer about 25,000
  // rows, not the 40,000 events.js plans for a steady day. The bound below
  // is the platform's, so four chunks (90,000 rows) would still pass it.
  const env = fresh();
  await ensureSchema(env.DB);
  await plantEvents(env.DB, 40000, 1);
  const first = await sweepExpired(env.DB, T);
  assert.ok(first.deleted.events * 3 + 10000 * 3 <= 100000, `${first.deleted.events} events deleted in one run, on a day of capped intake`);
  // And more than a day's intake, or a backlog that size never shrinks.
  assert.ok(first.deleted.events > 10000, `${first.deleted.events} events deleted in one run: no faster than they arrive`);
  // Control: the run was cut short by its own bound, not by a small backlog, and says so.
  assert.deepEqual(first.unfinished, ["events"]);
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM events"), 40000 - first.deleted.events);
});

test("a sweep with every table backlogged stays inside D1's 50 queries an invocation, from the cron and from the admin's route", async () => {
  // Cloudflare's D1 limits table, row "Queries per Worker invocation (read
  // subrequest limits)": "1000 (Workers Paid) / 50 (Free)". db.js plans for
  // it, eight tables at three statements each. The cron adds one query of its
  // own (the schema check); POST /v1/admin/sweep adds three (the session
  // lookup, its last_seen write, the schema check). At seven chunks a table
  // the cron asked for 57; D1 refuses everything past the fiftieth, so
  // ledger_kv, the last table, was never swept and the sweep_failed flag
  // could only reach KV. At six the cron fit (49) but the admin's sweep, at
  // 51, had its last table refused.
  const env = fresh();
  await ensureSchema(env.DB);
  const admin = await signIn(env, "admin@example.test", T);
  const cron = backloggedEverywhere(env.DB);
  await worker.scheduled({ cron: "17 9 * * *" }, { ...env, DB: cron.db });
  resetSchemaMemo();
  const byAdmin = backloggedEverywhere(env.DB);
  const res = await call({ ...env, DB: byAdmin.db }, jsonRequest("POST", "/v1/admin/sweep", {}, bearer(admin.token)), { now: T + 10 });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.ok(cron.seen.queries <= 50, `${cron.seen.queries} queries in one cron run`);
  assert.ok(byAdmin.seen.queries <= 50, `${byAdmin.seen.queries} queries in one admin sweep`);
  // Control: the backlog reached both sweeps: every table went past its first chunk.
  for (const { seen } of [cron, byAdmin]) {
    assert.deepEqual(Object.keys(seen.deletes).sort(), [
      "events", "exposures", "ingest_daily", "ledger_kv", "login_codes", "rate_limits", "reports", "sessions"
    ]);
    assert.ok(Object.values(seen.deletes).every((n) => n > 1), JSON.stringify(seen.deletes));
  }
});
