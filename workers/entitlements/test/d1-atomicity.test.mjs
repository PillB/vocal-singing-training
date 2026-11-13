/**
 * The account layer's writes against a worker that stops half way and against
 * a second request that lands in between (audit D1-1 to D1-5, D1-8, SW-1,
 * SC-1).
 *
 * Every test here is written against a failure that happened, or can happen,
 * on D1: a worker is stopped or a statement refused between two writes, or
 * another request runs between this request's read and its write. Each was
 * run against the code before this change and turned red there; the comment
 * on each says what the old code did.
 *
 * Two tools model the failures without timing tricks:
 * - `stopsAfter(db, n)`: the worker is gone after its n-th write round trip
 *   (a `run` or a `batch`); every call after that throws. A batch is one round
 *   trip, which is what D1 gives: it commits whole or not at all.
 * - `interposed(db, others, when)`: another request runs to completion just
 *   before (or just after) this one's first write.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { checkLoginCode, ensureAccount, issueLoginCode, startSessionWithCode } from "../src/accounts.js";
import {
  SWEEP_CHUNK_ROWS,
  SWEEP_FAILED_FLAG,
  SWEEP_MAX_CHUNKS,
  ensureSchema,
  readHealthFlag,
  resetSchemaMemo,
  sweepExpired
} from "../src/db.js";
import { createGiftCode, createGrant, linkLicense, redeemGiftCode, revokeGiftCode, revokeGrant, startTrial } from "../src/grants.js";
import worker, { handleRequest } from "../src/index.js";
import { SCHEMA_VERSION } from "../src/schema.js";
import { TEST_ORIGIN, createAccountEnv } from "./fixtures.mjs";

const STOPPED = /worker stopped/;

/**
 * The database as a worker sees it that stops after `writes` write round
 * trips: the next write, and every call after it, throws.
 * @param {Object} db D1 fake.
 * @param {number} writes Round trips allowed.
 * @returns {Object} D1-shaped wrapper.
 */
function stopsAfter(db, writes) {
  let left = writes;
  let dead = false;
  const stop = () => {
    dead = true;
    return Promise.reject(new Error("worker stopped"));
  };
  const write = (go) => {
    if (dead || left === 0) {
      return stop();
    }
    left -= 1;
    return go();
  };
  const read = (go) => (dead ? stop() : go());
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
 * The database with another request run to completion once, just before this
 * request's first write ("before") or just after it ("after").
 * @param {Object} db D1 fake.
 * @param {function(): Promise<unknown>} others The other request.
 * @param {"before"|"after"} [when] Where it lands.
 * @returns {Object} D1-shaped wrapper.
 */
function interposed(db, others, when) {
  let done = false;
  const write = async (go) => {
    const due = !done;
    done = true;
    if (due && when !== "after") {
      await others();
    }
    const result = await go();
    if (due && when === "after") {
      await others();
    }
    return result;
  };
  const wrap = (statement) => ({
    raw: statement,
    bind: (...values) => wrap(statement.bind(...values)),
    first: (column) => statement.first(column),
    all: () => statement.all(),
    run: () => write(() => statement.run())
  });
  return {
    prepare: (sql) => wrap(db.prepare(sql)),
    batch: (list) => write(() => db.batch(list.map((s) => s.raw)))
  };
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

/** Fresh env, schema and one account. */
async function withAccount(email) {
  resetSchemaMemo();
  const env = createAccountEnv();
  await ensureSchema(env.DB);
  const { account } = await ensureAccount(env.DB, email || "p@example.test", {}, 1000);
  return { env, account };
}

const BASE = "https://entitlements.test";

/** A JSON request to the worker. */
function post(path, body, headers) {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(headers || {}) },
    body: JSON.stringify(body)
  });
}

/** Ask for a sign-in code and read it out of the email the fake transport was given. */
async function emailedCode(env, email, now) {
  let code = null;
  const fetchImpl = async (url, init) => {
    code = (/\b(\d{6})\b/.exec(JSON.parse(init.body).text || "") || [])[1];
    return { ok: true, status: 200 };
  };
  const res = await handleRequest(post("/v1/auth/email/start", { email }), env, { now, fetchImpl });
  assert.equal(res.status, 200);
  assert.ok(code, "a code was emailed");
  return code;
}

// ---------------------------------------------------------------- trial (D1-5)

test("a trial is all or nothing wherever the worker stops: never a burned trial, never an unclaimed grant", async () => {
  // The old code claimed the trial in one write and wrote the grant in a
  // second, undoing the claim if the grant failed. A worker stopped after the
  // claim never ran the undo, and the person lost the one trial they get.
  // Written the other way round, the same stop leaves a grant with the trial
  // still unclaimed: a second trial on the next try.
  for (let writes = 0; writes <= 2; writes += 1) {
    const { env, account } = await withAccount();
    const outcome = await settle(startTrial(stopsAfter(env.DB, writes), account, env, 5000));
    const grants = await count(env.DB, "SELECT COUNT(*) FROM grants WHERE account_id = ?1 AND kind = 'trial'", account.id);
    const row = await env.DB.prepare("SELECT trial_used_at FROM accounts WHERE id = ?1").bind(account.id).first();
    if (outcome.error) {
      assert.match(String(outcome.error.message), STOPPED);
      assert.deepEqual([grants, row.trial_used_at], [0, null], `stopped after ${writes} writes: nothing kept`);
      const retry = await startTrial(env.DB, { ...account, trial_used_at: null }, env, 5100);
      assert.equal(retry.ok, true, `stopped after ${writes} writes: the trial still works`);
    } else {
      assert.equal(outcome.value.ok, true);
      assert.equal(grants, 1, `${writes} writes: one grant`);
      assert.notEqual(row.trial_used_at, null, `${writes} writes: and the trial is spent`);
    }
  }
});

// ---------------------------------------------------------------- gift codes (D1-1)

/** Redemptions, uses counted and gift grants, in that order. */
async function giftState(db) {
  return [
    await count(db, "SELECT COUNT(*) FROM gift_redemptions"),
    await count(db, "SELECT COALESCE(SUM(redeemed_count), 0) FROM gift_codes"),
    await count(db, "SELECT COUNT(*) FROM grants WHERE kind = 'gift'")
  ];
}

test("a gift redemption is all or nothing wherever the worker stops, and a failure is not 'already redeemed'", async () => {
  // The old code wrote the grant, then the redemption, then the count, and
  // deleted what it could on the way out. Stopped after the grant, the
  // account kept a grant with no redemption row, so the same code could be
  // redeemed again; and any error on the redemption insert was answered
  // "already redeemed", sending a person whose redemption never happened away.
  for (let writes = 0; writes <= 3; writes += 1) {
    const { env, account } = await withAccount();
    const code = await createGiftCode(env.DB, { days: 30, maxRedemptions: 2 }, 5000);
    const outcome = await settle(redeemGiftCode(stopsAfter(env.DB, writes), account.id, code.code, 5100));
    const state = await giftState(env.DB);
    if (outcome.error) {
      assert.match(String(outcome.error.message), STOPPED, `${writes} writes: the failure is thrown, not answered`);
      assert.deepEqual(state, [0, 0, 0], `stopped after ${writes} writes: nothing kept`);
      const retry = await redeemGiftCode(env.DB, account.id, code.code, 5200);
      assert.equal(retry.ok, true, `stopped after ${writes} writes: the code still works for this person`);
    } else {
      assert.equal(outcome.value.ok, true, `${writes} writes: ${JSON.stringify(outcome.value)}`);
      assert.deepEqual(state, [1, 1, 1], `${writes} writes: one redemption, one use, one grant`);
    }
  }
});

test("a code revoked between the redemption's read and its write pays nothing out", async () => {
  // The old code checked `revoked_at` in its first read and never again, so
  // a code revoked by the admin a moment later still gave a month away.
  const { env, account } = await withAccount();
  const code = await createGiftCode(env.DB, { days: 30, maxRedemptions: 5 }, 5000);
  const db = interposed(env.DB, () => revokeGiftCode(env.DB, code.code, 5050));
  const answer = await redeemGiftCode(db, account.id, code.code, 5100);
  assert.deepEqual(answer, { ok: false, reason: "revoked" });
  assert.deepEqual(await giftState(env.DB), [0, 0, 0]);
});

test("control: a live code redeemed with nobody in between still pays out", async () => {
  // Without this, a redemption that refused everything would pass the test above.
  const { env, account } = await withAccount();
  const code = await createGiftCode(env.DB, { days: 30, maxRedemptions: 5 }, 5000);
  const db = interposed(env.DB, async () => {});
  assert.equal((await redeemGiftCode(db, account.id, code.code, 5100)).ok, true);
  assert.deepEqual(await giftState(env.DB), [1, 1, 1]);
});

// ---------------------------------------------------------------- revokes

test("two admins revoking one grant: the record names the one who was told they did it", async () => {
  // The old UPDATE had no `revoked_at IS NULL`: both admins were told "done",
  // and the second overwrote who and when, so the audit trail named someone
  // other than the admin the first answer went to.
  const { env, account } = await withAccount();
  const grant = await createGrant(env.DB, { accountId: account.id, kind: "comp", days: 30 }, 5000);
  const answers = {};
  const db = interposed(env.DB, async () => {
    answers.b = await revokeGrant(env.DB, grant.id, "admin-b", 5050);
  });
  answers.a = await revokeGrant(db, grant.id, "admin-a", 5100);
  const stored = await env.DB.prepare("SELECT revoked_at, revoked_by FROM grants WHERE id = ?1").bind(grant.id).first();
  assert.equal(answers.b.reason, undefined, "admin-b revoked it");
  assert.equal(answers.a.reason, "already_revoked", "admin-a is told it was already done");
  assert.deepEqual({ ...stored }, { revoked_at: 5050, revoked_by: "admin-b" });
  assert.equal(answers.a.grant.revoked_by, "admin-b", "and is shown by whom");
});

test("two admins revoking one gift code: the first time stands and the second is told", async () => {
  const { env } = await withAccount();
  const code = await createGiftCode(env.DB, { days: 30 }, 5000);
  let first = null;
  const db = interposed(env.DB, async () => {
    first = await revokeGiftCode(env.DB, code.code, 5050);
  });
  const second = await revokeGiftCode(db, code.code, 5100);
  assert.deepEqual(first, { ok: true });
  assert.deepEqual(second, { ok: true, reason: "already_revoked" });
  assert.equal(await count(env.DB, "SELECT revoked_at FROM gift_codes"), 5050);
});

// ---------------------------------------------------------------- license links (D1-3)

test("two tabs linking one license at once: no 500, and the second account is refused", async () => {
  // The old code read "not linked" in both requests, then both inserted; the
  // second hit the primary key and the person saw a server error.
  const { env, account } = await withAccount();
  const other = (await ensureAccount(env.DB, "friend@example.test", {}, 1000)).account;
  let first = null;
  const db = interposed(env.DB, async () => {
    first = await linkLicense(env.DB, other.id, "lic_shared", "stripe", 5050);
  });
  const second = await settle(linkLicense(db, account.id, "lic_shared", "stripe", 5100));
  assert.equal(second.error, undefined, String(second.error));
  assert.deepEqual(first, { ok: true });
  assert.deepEqual(second.value, { ok: false, reason: "already_linked" });
  const owner = await env.DB.prepare("SELECT account_id FROM license_links WHERE license_id = 'lic_shared'").first();
  assert.equal(owner.account_id, other.id, "the license stays with the first account");
});

test("the same account linking twice at once is told it is already linked here", async () => {
  const { env, account } = await withAccount();
  const db = interposed(env.DB, () => linkLicense(env.DB, account.id, "lic_mine", "stripe", 5050));
  assert.deepEqual(await linkLicense(db, account.id, "lic_mine", "stripe", 5100), { ok: true, reason: "already_linked_here" });
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM license_links"), 1);
});

// ---------------------------------------------------------------- sign-in codes (D1-2, D1-4)

test("a sign-in stopped at any write leaves a code that still works", async () => {
  // The old route spent the code first and then wrote the account, the
  // identity and the session. Stopped anywhere after the spend, the person
  // had no session and their code was gone: the retry said "no_code" and they
  // had to ask for another email.
  const email = "stop@example.test";
  let succeeded = false;
  for (let writes = 0; !succeeded; writes += 1) {
    assert.ok(writes < 12, "the sign-in finishes within a dozen writes");
    resetSchemaMemo();
    const env = createAccountEnv();
    const code = await emailedCode(env, email, 1000);
    const first = await settle(handleRequest(post("/v1/auth/email/verify", { email, code }), { ...env, DB: stopsAfter(env.DB, writes) }, { now: 1001 }));
    if (first.value && first.value.status === 200) {
      succeeded = true;
      assert.equal(await count(env.DB, "SELECT COUNT(*) FROM sessions"), 1, `${writes} writes: one session`);
      assert.equal(await count(env.DB, "SELECT COUNT(*) FROM login_codes WHERE consumed_at IS NULL"), 0, "and the code is spent");
      continue;
    }
    assert.match(String(first.error && first.error.message), STOPPED, `${writes} writes: ${first.value && first.value.status}`);
    assert.equal(await count(env.DB, "SELECT COUNT(*) FROM sessions"), 0, `stopped after ${writes} writes: no session`);
    const retry = await handleRequest(post("/v1/auth/email/verify", { email, code }), env, { now: 1002 });
    const body = await retry.json();
    assert.equal(retry.status, 200, `stopped after ${writes} writes, the retry: ${JSON.stringify(body)}`);
    assert.ok(body.sessionToken);
  }
});

test("one right code checked by two requests opens one session, not two", async () => {
  // Both requests pass the check before either opens a session (two tabs, a
  // double tap). The session is written only while the code is unspent, in
  // the same transaction that spends it.
  const { env, account } = await withAccount("two@example.test");
  const issued = await issueLoginCode(env.DB, "two@example.test", 1000);
  const a = await checkLoginCode(env.DB, "two@example.test", issued.code, 1001);
  const b = await checkLoginCode(env.DB, "two@example.test", issued.code, 1001);
  assert.equal(a.ok && b.ok, true, "both checks pass: the code is right and unspent");
  const first = await startSessionWithCode(env.DB, a.codeId, account.id, 1002);
  const second = await startSessionWithCode(env.DB, b.codeId, account.id, 1002);
  assert.ok(first && first.token, "the first opens a session");
  assert.equal(second, null, "the second is refused");
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM sessions"), 1);
});

test("two code requests for one address at once leave only the newer code alive", async () => {
  // The old code retired the address's live codes in one write and stored
  // the new code in another. A second request landing in between stored its
  // code, then the first stored its own, and both emailed codes worked.
  const { env } = await withAccount("pair@example.test");
  let later = null;
  const db = interposed(env.DB, async () => {
    later = await issueLoginCode(env.DB, "pair@example.test", 1000);
  }, "after");
  const earlier = await issueLoginCode(db, "pair@example.test", 1000);
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM login_codes WHERE consumed_at IS NULL"), 1, "one live code");
  assert.equal((await checkLoginCode(env.DB, "pair@example.test", later.code, 1001)).ok, true, "the one sent last works");
  if (earlier.code !== later.code) {
    assert.equal((await checkLoginCode(env.DB, "pair@example.test", earlier.code, 1001)).ok, false, "the one before it does not");
  }
});

// ---------------------------------------------------------------- the top-level 500 (D1-8)

test("an unhandled error answers 500 with the site's CORS headers, so the page can read it", async () => {
  // Without them the browser hides the response, and the page can only say
  // "network error" for what is a server error worth retrying.
  const env = createAccountEnv({
    DB: { prepare: () => { throw new Error("D1 is down"); }, batch: async () => { throw new Error("D1 is down"); } }
  });
  const res = await worker.fetch(new Request(`${BASE}/v1/me`, { headers: { Origin: TEST_ORIGIN, authorization: "Bearer x" } }), env);
  assert.equal(res.status, 500);
  assert.deepEqual(await res.json(), { ok: false, reason: "internal_error" });
  assert.equal(res.headers.get("access-control-allow-origin"), TEST_ORIGIN);
  // Control: another site's page gets no permission to read it.
  const foreign = await worker.fetch(new Request(`${BASE}/v1/me`, { headers: { Origin: "https://elsewhere.test", authorization: "Bearer x" } }), env);
  assert.equal(foreign.status, 500);
  assert.equal(foreign.headers.get("access-control-allow-origin"), null);
});

// ---------------------------------------------------------------- the sweep (SW-1)

/** A D1 whose statements matching `pattern` throw. */
function refusing(db, pattern) {
  return {
    prepare: (sql) => (pattern.test(sql) ? { bind: () => ({ run: async () => { throw new Error("D1 refused"); } }) } : db.prepare(sql)),
    batch: (list) => db.batch(list)
  };
}

/** A dead session and an expired ledger key, both due for the sweep. */
async function plantExpired(env, at) {
  const { account } = await ensureAccount(env.DB, "old@example.test", {}, 1000);
  await env.DB.prepare("INSERT INTO sessions (id, account_id, token_hash, created_at, expires_at, last_seen_at) VALUES ('s1', ?1, 'h', 1, 2, 1)")
    .bind(account.id)
    .run();
  await env.DB.prepare("INSERT INTO ledger_kv (key, value, version, expires_at, updated_at) VALUES ('seen:old', '1', 'v', ?1, 1)").bind(at - 1).run();
}

test("one table that cannot be swept no longer keeps the others from being swept", async () => {
  // The old sweep was one batch, one transaction: a table that failed rolled
  // every table back, every day, and the backlog behind it only grew.
  resetSchemaMemo();
  const env = createAccountEnv();
  await ensureSchema(env.DB);
  const at = 1800000000;
  await plantExpired(env, at);
  const report = await sweepExpired(refusing(env.DB, /DELETE FROM events/), at, env.ENTITLEMENTS);
  assert.deepEqual(report.failed, ["events"]);
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM sessions"), 0, "the dead session went anyway");
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM ledger_kv"), 0, "and the expired ledger key");
  assert.equal((await readHealthFlag(env.DB, SWEEP_FAILED_FLAG, at + 1)).current, true, "and the failure is flagged for the probe");
});

test("the cron run fails visibly when a table could not be swept, after sweeping the rest", async () => {
  resetSchemaMemo();
  const env = createAccountEnv();
  await ensureSchema(env.DB);
  const now = Math.floor(Date.now() / 1000);
  await plantExpired(env, now);
  const db = refusing(env.DB, /DELETE FROM exposures/);
  await assert.rejects(() => worker.scheduled({}, { ...env, DB: db }), /sweep failed: exposures/);
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM sessions"), 0);
  // Control: with nothing refused, the same run passes.
  await worker.scheduled({}, env);
});

test("a backlog is swept a bounded chunk at a time and finished by the next run", async () => {
  resetSchemaMemo();
  const env = createAccountEnv();
  await ensureSchema(env.DB);
  const at = 1800000000;
  const backlog = SWEEP_CHUNK_ROWS * SWEEP_MAX_CHUNKS + 7;
  await env.DB.exec(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < ${backlog})
    INSERT INTO events (cid, name, props, received_at) SELECT 'c' || i, 'x', '{}', 1 FROM n`);
  await env.DB.exec(`INSERT INTO events (cid, name, props, received_at) VALUES ('fresh', 'x', '{}', ${at})`);
  let statements = 0;
  const counting = { prepare: (sql) => ((statements += 1), env.DB.prepare(sql)), batch: (l) => env.DB.batch(l) };
  const first = await sweepExpired(counting, at);
  assert.equal(first.deleted.events, SWEEP_CHUNK_ROWS * SWEEP_MAX_CHUNKS, "a full run's worth");
  assert.deepEqual(first.unfinished, ["events"]);
  assert.ok(statements <= 8 * SWEEP_MAX_CHUNKS, `${statements} statements, inside the free plan's 50 a run`);
  const second = await sweepExpired(env.DB, at);
  assert.equal(second.deleted.events, 7);
  assert.deepEqual(second.unfinished, []);
  assert.equal(await count(env.DB, "SELECT COUNT(*) FROM events"), 1, "the fresh event stays");
});

test("the sweep drops expired ledger keys and keeps live ones and tombstones", async () => {
  resetSchemaMemo();
  const env = createAccountEnv();
  await ensureSchema(env.DB);
  const at = 1800000000;
  await env.DB.exec(`INSERT INTO ledger_kv (key, value, version, expires_at, updated_at) VALUES
    ('seen:old', '1', 'a', ${at - 1}, 1), ('seen:now', '1', 'b', ${at}, 1),
    ('seen:new', '1', 'c', ${at + 1}, 1), ('lic:x', '{}', 'd', NULL, 1), ('lic:gone', NULL, 'e', NULL, 1)`);
  await sweepExpired(env.DB, at);
  const left = (await env.DB.prepare("SELECT key FROM ledger_kv ORDER BY key").all()).results.map((r) => r.key);
  assert.deepEqual(left, ["lic:gone", "lic:x", "seen:new"]);
});

// ---------------------------------------------------------------- the schema check (SC-1)

/** Count the batches a D1 is asked to run. */
function countingBatches(db) {
  const seen = { batches: 0 };
  return { seen, db: { prepare: (sql) => db.prepare(sql), batch: (l) => ((seen.batches += 1), db.batch(l)) } };
}

test("a cold isolate reads the schema version instead of rerunning every CREATE", async () => {
  resetSchemaMemo();
  const env = createAccountEnv();
  await ensureSchema(env.DB);
  resetSchemaMemo();
  const warm = countingBatches(env.DB);
  await ensureSchema(warm.db);
  assert.equal(warm.seen.batches, 0, "the stored version is current: nothing to run");

  // Control: an older stored version runs the batch and raises it.
  await env.DB.prepare("UPDATE schema_meta SET value = ?1 WHERE key = 'version'").bind(String(SCHEMA_VERSION - 1)).run();
  resetSchemaMemo();
  const stale = countingBatches(env.DB);
  await ensureSchema(stale.db);
  assert.equal(stale.seen.batches, 1);
  assert.equal(await count(env.DB, "SELECT value FROM schema_meta WHERE key = 'version'"), SCHEMA_VERSION);
});

test("older code never lowers a newer schema's version, even when it runs the batch", async () => {
  // While a deploy rolls out, an isolate on the old code whose version read
  // failed runs the batch; writing its own number would make the new code
  // rerun the batch on every cold start until the next one.
  resetSchemaMemo();
  const env = createAccountEnv();
  await ensureSchema(env.DB);
  await env.DB.prepare("UPDATE schema_meta SET value = ?1 WHERE key = 'version'").bind(String(SCHEMA_VERSION + 1)).run();
  resetSchemaMemo();
  const flaky = {
    prepare: (sql) => (/SELECT value FROM schema_meta/.test(sql) ? { first: async () => { throw new Error("read failed"); } } : env.DB.prepare(sql)),
    batch: (l) => env.DB.batch(l)
  };
  await ensureSchema(flaky);
  assert.equal(await count(env.DB, "SELECT value FROM schema_meta WHERE key = 'version'"), SCHEMA_VERSION + 1);
  resetSchemaMemo();
  const newer = countingBatches(env.DB);
  await ensureSchema(newer.db);
  assert.equal(newer.seen.batches, 0, "and a newer schema serves older code without a batch");
});

test("a sign-in through the whole worker still works end to end", async () => {
  // Control for the sign-in tests above: nothing stopped, one code, one session.
  resetSchemaMemo();
  const env = createAccountEnv();
  const email = "whole@example.test";
  const code = await emailedCode(env, email, 1000);
  const res = await handleRequest(post("/v1/auth/email/verify", { email, code }), env, { now: 1001 });
  assert.equal(res.status, 200);
  const again = await handleRequest(post("/v1/auth/email/verify", { email, code }), env, { now: 1002 });
  assert.equal(again.status, 401, "and the code is single use");
});
