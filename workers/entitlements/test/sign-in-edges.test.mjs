/**
 * Sign-in's edges, through the router: what a refused code leaves behind, a
 * code typed right on the fifth try, two tabs spending one code, a read that
 * fails while the answer is built, how long a session lasts, how many rows a
 * new code writes, and what an admin's sweep answers when a table fails.
 *
 * A sweep of planted defects on PR #38 changed each of these and every worker
 * test stayed green: the suite reached them only through unit calls that skip
 * the route's order of steps, stopped the worker at writes but never at reads,
 * or never looked at the number at all. Each test here was run against its
 * defect and turned red there; the comment on each says what the defect cost.
 *
 * Five tools, modelled on the ones in d1-atomicity.test.mjs:
 * - `stopsAtRead(db, n)`: the worker is gone at its n-th read; that read and
 *   every call after it throws. The writes before it have landed, as on D1.
 * - `failsFirstRead(db, pattern)`: one read error that hands control back to
 *   the code: the first read matching the pattern rejects, everything else
 *   (later calls in the same request included) runs normally.
 * - `meetAtSessionWrite(db, parties)`: requests are held at the batch that
 *   opens a session until all of them have reached it (or one of them has
 *   answered without reaching it), so every one has passed the code check
 *   before any session is written. No clock is involved.
 * - `refusing(db, pattern)`: statements matching the pattern throw, as D1
 *   does when a statement fails or a limit is reached.
 * - `recordingRetires(db, changes)`: notes how many rows each new code's
 *   "retire the older codes" statement changed, which D1 bills as rows written.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { ensureAccount, recordIdentity } from "../src/accounts.js";
import { resetSchemaMemo } from "../src/db.js";
import { handleRequest } from "../src/index.js";
import { createAccountEnv } from "./fixtures.mjs";

const BASE = "https://entitlements.test";
const T = 1800000000;
/** Ninety days in seconds, written out: 90 × 86,400 = 7,776,000. */
const NINETY_DAYS = 7776000;
const STOPPED = /worker stopped/;

// ------------------------------------------------------------------ helpers

/** A worker env with its own empty database. */
function freshEnv() {
  resetSchemaMemo();
  return createAccountEnv();
}

/** A JSON request to the worker, signed in when given a session token. */
function request(method, path, body, token) {
  const headers = { "content-type": "application/json" };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return new Request(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

/** POST /v1/auth/email/verify with an address and a code. */
function verify(email, code) {
  return request("POST", "/v1/auth/email/verify", { email, code });
}

/** Call the router at `now` and read the JSON answer. */
async function call(env, req, now) {
  const res = await handleRequest(req, env, { now });
  return { status: res.status, body: await res.json() };
}

/** A promise's value or its error, never a rejection. */
function settle(promise) {
  return promise.then((value) => ({ value }), (error) => ({ error }));
}

/** One number from one row. */
async function count(db, sql, ...values) {
  const row = await db.prepare(sql).bind(...values).first();
  return Number(Object.values(row)[0]);
}

/** Every identity, as "provider:subject", in order. */
async function identities(db) {
  const rows = (await db.prepare("SELECT provider, subject FROM identities ORDER BY provider, subject").all()).results;
  return rows.map((row) => `${row.provider}:${row.subject}`);
}

/** Ask for a sign-in code at `now` and read it out of the email the fake transport was given. */
async function emailedCode(env, email, now) {
  let code = null;
  const fetchImpl = async (url, init) => {
    code = (/\b(\d{6})\b/.exec(JSON.parse(init.body).text || "") || [])[1];
    return { ok: true, status: 200 };
  };
  const res = await handleRequest(request("POST", "/v1/auth/email/start", { email }), env, { now, fetchImpl });
  assert.equal(res.status, 200);
  assert.ok(code, "a code was emailed");
  return code;
}

/** A six-digit code that is not `code`: every digit moved on by one. */
function wrongCode(code) {
  return code.replace(/\d/g, (digit) => String((Number(digit) + 1) % 10));
}

/** Sign in by emailed code (asked for at `now`, typed at `now + 1`); returns the verify answer. */
async function signIn(env, email, now) {
  const code = await emailedCode(env, email, now);
  const verified = await call(env, verify(email, code), now + 1);
  assert.equal(verified.status, 200, `${email} signed in`);
  return verified.body;
}

/**
 * The database as a worker sees it that stops at its `reads`-th read (counted
 * from 0): that read, and every call after it, throws.
 * @param {Object} db D1 fake.
 * @param {number} reads Reads allowed.
 * @returns {Object} D1-shaped wrapper.
 */
function stopsAtRead(db, reads) {
  let left = reads;
  let dead = false;
  const stop = () => {
    dead = true;
    return Promise.reject(new Error("worker stopped"));
  };
  const read = (go) => {
    if (dead || left === 0) {
      return stop();
    }
    left -= 1;
    return go();
  };
  const write = (go) => (dead ? stop() : go());
  const wrap = (statement) => ({
    raw: statement,
    bind: (...values) => wrap(statement.bind(...values)),
    first: (column) => read(() => statement.first(column)),
    all: () => read(() => statement.all()),
    run: () => write(() => statement.run())
  });
  return {
    prepare: (sql) => wrap(db.prepare(sql)),
    batch: (list) => write(() => db.batch(list.map((s) => s.raw))),
    exec: (sql) => write(() => db.exec(sql))
  };
}

/**
 * The database with one read error, as D1 gives when a query fails: the first
 * read whose SQL matches `pattern` rejects and the code gets control back.
 * Every other call, a later read of the same table included, runs normally.
 * @param {Object} db D1 fake.
 * @param {RegExp} pattern SQL of the read that fails.
 * @returns {Object} D1-shaped wrapper.
 */
function failsFirstRead(db, pattern) {
  let failed = false;
  const once = (go) => {
    if (failed) {
      return go();
    }
    failed = true;
    return Promise.reject(new Error("D1 read error"));
  };
  const wrap = (statement) => ({
    bind: (...values) => wrap(statement.bind(...values)),
    first: (column) => once(() => statement.first(column)),
    all: () => once(() => statement.all()),
    run: () => statement.run()
  });
  return {
    prepare: (sql) => (pattern.test(sql) ? wrap(db.prepare(sql)) : db.prepare(sql)),
    batch: (list) => db.batch(list),
    exec: (sql) => db.exec(sql)
  };
}

/**
 * The database with every batch that opens a session held until `parties`
 * of them are waiting, or until the test calls `release` (it does when any
 * request answers, so a request that answers without reaching the batch frees
 * the one held there and the test sees `arrived()` short, never a hang).
 * @param {Object} db D1 fake.
 * @param {number} parties Requests to wait for.
 * @returns {{db: Object, arrived: function(): number, release: function(): void}} Wrapper, count, release.
 */
function meetAtSessionWrite(db, parties) {
  let arrived = 0;
  let open = null;
  const gate = new Promise((resolve) => {
    open = resolve;
  });
  const batch = async (list) => {
    if (list.some((statement) => /INSERT INTO sessions/.test(statement.sql))) {
      arrived += 1;
      if (arrived >= parties) {
        open();
      }
      await gate;
    }
    return db.batch(list);
  };
  return {
    arrived: () => arrived,
    release: () => open(),
    db: { prepare: (sql) => db.prepare(sql), batch, exec: (sql) => db.exec(sql) }
  };
}

/** A D1 whose statements matching `pattern` throw. */
function refusing(db, pattern) {
  return {
    prepare: (sql) => (pattern.test(sql) ? { bind: () => ({ run: async () => { throw new Error("D1 refused"); } }) } : db.prepare(sql)),
    batch: (list) => db.batch(list),
    exec: (sql) => db.exec(sql)
  };
}

/** A D1 that notes how many rows each new code's retire statement changed. */
function recordingRetires(db, changes) {
  const batch = async (list) => {
    const results = await db.batch(list);
    if (/UPDATE login_codes SET consumed_at = \?2 WHERE email_normalized/.test(list[0].sql)) {
      changes.push(results[0].meta.changes);
    }
    return results;
  };
  return { prepare: (sql) => db.prepare(sql), batch, exec: (sql) => db.exec(sql) };
}

/** A dead session and an expired ledger key, both due for the sweep at `at`. */
async function plantExpired(env, at) {
  const { account } = await ensureAccount(env.DB, "old@example.test", {}, 1000);
  await env.DB.prepare("INSERT INTO sessions (id, account_id, token_hash, created_at, expires_at, last_seen_at) VALUES ('s1', ?1, 'h', 1, 2, 1)")
    .bind(account.id)
    .run();
  await env.DB.prepare("INSERT INTO ledger_kv (key, value, version, expires_at, updated_at) VALUES ('seen:old', '1', 'v', ?1, 1)").bind(at - 1).run();
}

/**
 * More expired rate-limit rows than one sweep may delete: 5,000 rows a chunk
 * × 3 chunks a table (what keeps a run inside D1's 50 queries an invocation),
 * plus 7 left for the next run. Written out by hand, so a change to either
 * chunk constant turns the backlog tests red and sends someone back to that
 * budget.
 */
async function plantBacklog(env) {
  const backlog = 15007;
  await env.DB.exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${backlog})
    INSERT INTO rate_limits (bucket, count, window_start) SELECT 'old:' || i, 1, 1 FROM n`);
}

/** An admin's GET /v1/admin/account for one address. */
function lookup(token, email) {
  return request("GET", `/v1/admin/account?email=${encodeURIComponent(email)}`, undefined, token);
}

/** An admin's POST /v1/admin/sweep. */
function sweep(token) {
  return request("POST", "/v1/admin/sweep", {}, token);
}

/** The parts of a sweep answer the admin page and the operator act on. */
function sweepVerdict(answer) {
  return [answer.status, answer.body.ok, answer.body.reason || null, answer.body.failed, answer.body.unfinished];
}

// ------------------------------------------------------------------ the code check comes first

test("a refused sign-in code creates no account and records no sign-in method", async () => {
  // The account and the identity are written only after the code is checked.
  // Written before, a stranger with no code at all could make support's
  // lookup lie. GET /v1/admin/account would find an account for an address
  // nobody ever signed in as, and list an "email" sign-in that nobody made
  // for somebody who has only ever used Google. That list is how support
  // answers "I signed in and don't see Pro", so the answer would be wrong.
  // The guesser could also seed an admin address's account, in whatever
  // language they sent. And each refused guess at a new address would write
  // two more rows (an account and an identity) out of D1's 100,000 a day, at
  // 30 guesses an hour from every IP the guesser sends from.
  const env = freshEnv();
  const stranger = await call(env, verify("stranger@example.test", "123456"), T);
  assert.deepEqual([stranger.status, stranger.body.reason], [401, "no_code"], "no code was ever sent to this address");

  const code = await emailedCode(env, "new@example.test", T);
  const guessed = await call(env, verify("new@example.test", wrongCode(code)), T + 1);
  assert.deepEqual([guessed.status, guessed.body.reason], [401, "bad_code"], "a wrong guess at a code that was sent");

  const { account: googleOnly } = await ensureAccount(env.DB, "g@example.test", {}, T);
  await recordIdentity(env.DB, googleOnly.id, "google", "google-sub-1", T);
  const unproven = await call(env, verify("g@example.test", "654321"), T + 2);
  assert.deepEqual([unproven.status, unproven.body.reason], [401, "no_code"], "a code for a Google account that never asked for one");
  const asAdmin = await call(env, verify("admin@example.test", "123456"), T + 2);
  assert.deepEqual([asAdmin.status, asAdmin.body.reason], [401, "no_code"], "a code for the admin address, never sent");

  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM accounts"), 1, "only the Google account set up above, and no admin's");
  assert.deepEqual(await identities(env.DB), ["google:google-sub-1"], "and only its Google sign-in");

  // Control: the right code does create the account and record the method,
  // so the two reads above can see a row when there is one.
  const right = await call(env, verify("new@example.test", code), T + 3);
  assert.equal(right.status, 200, JSON.stringify(right.body));
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM accounts WHERE email_normalized = 'new@example.test'"), 1);
  assert.deepEqual(await identities(env.DB), ["email:new@example.test", "google:google-sub-1"]);

  // What support sees: nobody is found for the stranger's address, and the
  // Google-only person has signed in with Google and nothing else.
  const admin = (await signIn(env, "admin@example.test", T + 4)).sessionToken;
  const stranger404 = await call(env, lookup(admin, "stranger@example.test"), T + 6);
  assert.deepEqual([stranger404.status, stranger404.body.reason], [404, "not_found"], "no account for the stranger's address");
  const google = await call(env, lookup(admin, "g@example.test"), T + 6);
  assert.equal(google.status, 200, JSON.stringify(google.body));
  assert.deepEqual(google.body.signIns.methods, ["google"], "signed in with Google only");
  // Control: the same lookup does list an email sign-in that happened.
  const proven = await call(env, lookup(admin, "new@example.test"), T + 6);
  assert.deepEqual([proven.status, proven.body.signIns.methods], [200, ["email"]]);
});

test("a code typed right on the fifth try signs in", async () => {
  // Four typos and then the right code is inside the allowance of five
  // guesses. A session written only while the code had guesses left refused
  // that fifth guess (the check had just used the last one up), and spent
  // the code anyway: a 401 "no_code", and a new email to wait for.
  const env = freshEnv();
  const email = "typo@example.test";
  const code = await emailedCode(env, email, T);
  for (let guess = 1; guess <= 4; guess += 1) {
    const wrong = await call(env, verify(email, wrongCode(code)), T + guess);
    assert.deepEqual([wrong.status, wrong.body.reason], [401, "bad_code"], `wrong guess ${guess}`);
  }
  const fifth = await call(env, verify(email, code), T + 5);
  assert.equal(fifth.status, 200, `the fifth guess, right: ${JSON.stringify(fifth.body)}`);
  assert.ok(fifth.body.sessionToken, "and it carries a session");
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM sessions"), 1);
});

test("control: a fifth wrong guess burns the code, and the right code after it is refused", async () => {
  // Without this, a check that never counted guesses would pass the test above.
  // A code that never burned could be guessed at for its whole fifteen
  // minutes, 30 tries an hour from every IP the guesser sends from, until one
  // of the million six-digit codes lands and signs them in to somebody else's
  // account.
  const env = freshEnv();
  const email = "guesser@example.test";
  const code = await emailedCode(env, email, T);
  const reasons = [];
  for (let guess = 1; guess <= 5; guess += 1) {
    reasons.push((await call(env, verify(email, wrongCode(code)), T + guess)).body.reason);
  }
  assert.deepEqual(reasons, ["bad_code", "bad_code", "bad_code", "bad_code", "too_many_attempts"]);
  const late = await call(env, verify(email, code), T + 6);
  assert.deepEqual([late.status, late.body.reason], [401, "no_code"]);
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM sessions"), 0);
});

// ------------------------------------------------------------------ one code, two tabs

test("two tabs sending one right code at once: one signs in, the other is told the code is spent", async () => {
  // A double tap, or two tabs, both pass the code check before either opens a
  // session. The loser's session comes back empty. Read as if it were there,
  // it threw, and the page got a 500 "internal_error" (shown as "something
  // went wrong", and logged as a server fault) instead of the 401 "no_code"
  // it can explain.
  const env = freshEnv();
  const email = "twice@example.test";
  const code = await emailedCode(env, email, T);
  const held = meetAtSessionWrite(env.DB, 2);
  const answered = (outcome) => {
    held.release();
    return outcome;
  };
  const both = await Promise.all([0, 1].map(() => settle(call({ ...env, DB: held.db }, verify(email, code), T + 1)).then(answered)));
  assert.equal(held.arrived(), 2, "both passed the check and reached the session write: the race happened");
  for (const outcome of both) {
    assert.equal(outcome.error, undefined, String(outcome.error && outcome.error.stack));
  }
  const answers = both.map(({ value }) => [value.status, value.body.reason || null]).sort((a, b) => a[0] - b[0]);
  assert.deepEqual(answers, [[200, null], [401, "no_code"]]);
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM sessions"), 1, "one session");
});

// ------------------------------------------------------------------ the answer is built before the code is spent

test("a read error while the answer is built fails the sign-in and leaves the code working", async () => {
  // The answer (account, entitlement, license token) is built before the
  // session is opened, because building it reads D1 and a read can fail. One
  // D1 read error there must fail the request before the code is spent.
  // Opened first, the session was written and the code spent, and then the
  // error came: a session nobody was given, and the retry told "no_code", so
  // the person had to ask for another email (audit D1-2, back by another
  // door). Swallowed instead, the request answered 200 with a session but no
  // account or entitlement, and the page had nothing to show.
  const env = freshEnv();
  const email = "reads@example.test";
  const code = await emailedCode(env, email, T);
  const failed = await settle(call({ ...env, DB: failsFirstRead(env.DB, /FROM grants/) }, verify(email, code), T + 1));
  assert.equal(failed.error && failed.error.message, "D1 read error", `the request fails: ${JSON.stringify(failed.value)}`);
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM sessions"), 0, "no session was opened");
  // Control: the error came while the answer was built, after the account
  // and its email sign-in were written, not at the code check.
  assert.deepEqual(await identities(env.DB), [`email:${email}`]);
  const retry = await call(env, verify(email, code), T + 2);
  assert.equal(retry.status, 200, `the retry with the same code: ${JSON.stringify(retry.body)}`);
  assert.ok(retry.body.sessionToken, "and it carries a session");
  assert.equal(retry.body.account.email, email);
});

test("a sign-in stopped at any read leaves no session and a code that still works", async () => {
  // The same promise when the worker stopped (for CPU while it signs the
  // license token, say) at any one of its reads: the code still works and
  // no session was opened. d1-atomicity.test.mjs stops the worker at writes
  // only, and building the answer writes nothing.
  const email = "reads@example.test";
  let stoppedWhileBuilding = 0;
  let finished = false;
  for (let reads = 0; !finished; reads += 1) {
    assert.ok(reads < 40, "the sign-in finishes within forty reads");
    const env = freshEnv();
    const code = await emailedCode(env, email, T);
    const first = await settle(call({ ...env, DB: stopsAtRead(env.DB, reads) }, verify(email, code), T + 1));
    finished = Boolean(first.value);
    if (finished) {
      assert.equal(first.value.status, 200, `${reads} reads: ${JSON.stringify(first.value.body)}`);
      assert.equal(await count(env.DB, "SELECT COUNT(*) FROM sessions"), 1, `${reads} reads: one session`);
      continue;
    }
    assert.match(String(first.error.message), STOPPED, `stopped at read ${reads}`);
    assert.equal(await count(env.DB, "SELECT COUNT(*) FROM sessions"), 0, `stopped at read ${reads}: no session`);
    stoppedWhileBuilding += await count(env.DB, "SELECT COUNT(*) FROM identities");
    const retry = await call(env, verify(email, code), T + 2);
    assert.equal(retry.status, 200, `stopped at read ${reads}, the retry: ${JSON.stringify(retry.body)}`);
    assert.ok(retry.body.sessionToken);
  }
  // Control: some of those stops came after the identity was written, that
  // is while the answer was being built, so the loop did reach that step.
  assert.ok(stoppedWhileBuilding > 0, `${stoppedWhileBuilding} stops while the answer was built`);
});

// ------------------------------------------------------------------ how long a session lasts

test("an emailed sign-in lasts ninety days to the second, and the answer says when it ends", async () => {
  // The browser keeps `expiresAt` from this answer and drops a session whose
  // time has passed (js/account.js). An answer that named the moment of
  // sign-in signed everybody out on the next page load while the server still
  // honoured the token; an end a thousand times too far away (about 246
  // years) meant a leaked token never aged out.
  const env = freshEnv();
  const signedIn = await signIn(env, "ninety@example.test", T);
  const end = T + 1 + NINETY_DAYS;
  assert.equal(signedIn.expiresAt, end, "the answer names the end, ninety days after the sign-in");
  const stored = (await env.DB.prepare("SELECT expires_at FROM sessions").all()).results.map((row) => row.expires_at);
  assert.deepEqual(stored, [end], "one stored session, and it ends then too");
  const lastSecond = await call(env, request("GET", "/v1/me", undefined, signedIn.sessionToken), end - 1);
  assert.equal(lastSecond.status, 200, "the token works to the last second");
  const over = await call(env, request("GET", "/v1/me", undefined, signedIn.sessionToken), end);
  assert.deepEqual([over.status, over.body.reason], [401, "expired"], "and not a second more");
});

// ------------------------------------------------------------------ what a new code costs

test("a new code retires only the code still live, so asking again writes the same rows every time", async () => {
  // Without `consumed_at IS NULL`, every new code re-stamped every earlier
  // code the daily sweep had not deleted yet. At the five-an-hour cap that is
  // 120 codes a day for one address and 7,140 rows written instead of 119.
  // D1's free plan writes 100,000 rows a day and then refuses every write,
  // the payment ledger's included, so a few addresses cycled from a few IPs
  // stopped payments for the rest of the day. Nobody signing in sees a
  // difference, and the number of statements stays two.
  const env = freshEnv();
  const retired = [];
  const recorded = { ...env, DB: recordingRetires(env.DB, retired) };
  const email = "again@example.test";
  for (const at of [T, T + 720, T + 1440, T + 2160]) {
    await emailedCode(recorded, email, at);
  }
  assert.deepEqual(retired, [0, 1, 1, 1], "each new code retires the one before it, and only that one");
  const stamps = (await env.DB.prepare("SELECT consumed_at FROM login_codes ORDER BY created_at").all()).results.map((row) => row.consumed_at);
  assert.deepEqual(stamps, [T + 720, T + 1440, T + 2160, null], "each code keeps the time it was retired, and the newest is live");
});

// ------------------------------------------------------------------ the admin's sweep

test("an admin's sweep that could not clear a table answers 500 and names it, after clearing the rest", async () => {
  // The admin page reads the HTTP status: a 200 shows "Clean-up done." in
  // green. Answered 200 (with or without `ok: false`), or with the check
  // looking at the unfinished tables instead of the failed ones, the admin
  // was told the clean-up worked while a table, events here, kept what the
  // privacy page promises to delete after 180 days.
  const env = freshEnv();
  const admin = (await signIn(env, "admin@example.test", T)).sessionToken;
  await plantExpired(env, T + 10);
  const failed = await call({ ...env, DB: refusing(env.DB, /DELETE FROM events/) }, sweep(admin), T + 10);
  assert.deepEqual(sweepVerdict(failed), [500, false, "sweep_failed", ["events"], []]);
  // Control: the sweep did run, and swept the tables it could.
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM sessions WHERE id = 's1'"), 0, "the dead session went anyway");
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM ledger_kv WHERE key = 'seen:old'"), 0, "and the expired ledger key");
  // Control: with nothing refused, the same sweep answers 200.
  const clean = await call(env, sweep(admin), T + 11);
  assert.deepEqual(sweepVerdict(clean), [200, true, null, [], []]);
});

test("an admin's sweep with more to delete than one run allows answers 200 and names the table left unfinished", async () => {
  // A backlog is not a failure: the next run finishes it. Treating an
  // unfinished table as a failed one showed the admin an error for a healthy
  // sweep, and sent them looking for a fault that was not there.
  const env = freshEnv();
  const admin = (await signIn(env, "admin@example.test", T)).sessionToken;
  await plantBacklog(env);
  const first = await call(env, sweep(admin), T + 10);
  assert.deepEqual(sweepVerdict(first), [200, true, null, [], ["rate_limits"]]);
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM rate_limits WHERE bucket LIKE 'old:%'"), 7, "seven left for the next run");
  // Control: the next run finishes it, and says so.
  const second = await call(env, sweep(admin), T + 11);
  assert.deepEqual(sweepVerdict(second), [200, true, null, [], []]);
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM rate_limits WHERE bucket LIKE 'old:%'"), 0);
});

test("an admin's sweep that failed a table during a backlog answers 500, naming both the failed and the unfinished", async () => {
  // A backlog is when a DELETE is most likely to run into one of D1's limits.
  // A check that let a backlog excuse a failure answered 200 here, and the
  // admin page showed "Clean-up done." while events kept rows the privacy
  // page promises to delete.
  const env = freshEnv();
  const admin = (await signIn(env, "admin@example.test", T)).sessionToken;
  await plantBacklog(env);
  const both = await call({ ...env, DB: refusing(env.DB, /DELETE FROM events/) }, sweep(admin), T + 10);
  assert.deepEqual(sweepVerdict(both), [500, false, "sweep_failed", ["events"], ["rate_limits"]]);
});
