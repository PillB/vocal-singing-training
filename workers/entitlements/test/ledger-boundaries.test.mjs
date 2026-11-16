/**
 * The ledger's edges: where its read set is cut into statements, where a key's
 * TTL starts and ends, what a tombstone and an expired row validate as, and how
 * long it waits between attempts.
 *
 * Each test here answers a planted defect that the ledger's own tests let
 * through (a sweep of subtle mutants on PR #38): a chunk boundary off by one,
 * a clock in milliseconds, an expired row that conflicts for ever, a TTL that
 * a second write does not restart, a backoff that is not awaited. Each says
 * what the defect would cost in production.
 *
 * Expected values are written by hand, never computed by the code under test.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { sweepExpired } from "../src/db.js";
import { LEDGER_VALIDATE_CHUNK, LedgerConflictError, ledgerReader, runLedgerTransaction } from "../src/ledger.js";
import { createAccountEnv } from "./fixtures.mjs";

const NO_WAIT = { sleep: async () => {}, random: () => 0 };

/** Run one write in its own transaction at `now`, with a TTL when given one. */
function putAt(env, key, value, ttl, now) {
  return runLedgerTransaction(env, (kv) => kv.put(key, value, ttl ? { expirationTtl: ttl } : undefined), { ...NO_WAIT, now });
}

/** The stored row for a key, straight from D1. */
function rowOf(env, key) {
  return env.DB.prepare("SELECT value, version, expires_at FROM ledger_kv WHERE key = ?1").bind(key).first();
}

// ------------------------------------------------------------------ the clock

test("a TTL is counted in seconds of the real clock, so a marker lasts its days and not minutes", async () => {
  // A clock in milliseconds read against a TTL in seconds made the 30-day
  // event marker last about 43 minutes and the 90-day claim index about two
  // hours: Stripe's redelivery was processed again, and /v1/claim answered
  // "pending" to a buyer who had paid. Only tests with an injected clock in
  // seconds ran before, so nothing saw it.
  const env = createAccountEnv();
  const before = Math.floor(Date.now() / 1000);
  await runLedgerTransaction(env, (kv) => kv.put("claim:stripe:cs", "L1", { expirationTtl: 60 }), NO_WAIT);
  const after = Math.floor(Date.now() / 1000);
  const row = await rowOf(env, "claim:stripe:cs");
  assert.ok(
    row.expires_at >= before + 60 && row.expires_at <= after + 60,
    `stored to expire 60 s from now in Unix seconds (got ${row.expires_at}, now is ${before})`
  );
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(await ledgerReader(env).get("claim:stripe:cs"), "L1", "and still there a moment later");
});

// ------------------------------------------------------ validation statements

test("a change to any one key of a read set that spans several statements is caught, wherever the key sits", async () => {
  // The read set is validated in chunks, one statement each. A defect at a
  // chunk's edge (a key left out of every chunk, the commit row inserted by
  // the wrong chunk, writes sent between two chunks) lets one position commit
  // over a stale read, which is the lost update the ledger is there to stop.
  // So every position is tried, not only the last one.
  const size = 2 * LEDGER_VALIDATE_CHUNK + 5;
  const keys = Array.from({ length: size }, (_, i) => `k${i}`);
  const env = createAccountEnv();
  for (let changed = 0; changed < size; changed += 1) {
    let attempts = 0;
    await runLedgerTransaction(env, async (kv) => {
      attempts += 1;
      for (const key of keys) {
        await kv.get(key);
      }
      if (attempts === 1) {
        // Another writer changes one key after this attempt read it.
        await runLedgerTransaction(env, (other) => other.put(keys[changed], `theirs-${changed}`), NO_WAIT);
      }
      await kv.put(`p${changed}-attempt-${attempts}`, "written");
    }, NO_WAIT);
    const store = ledgerReader(env);
    assert.equal(attempts, 2, `key ${changed} of ${size}: the change was seen and the work ran again`);
    assert.equal(await store.get(`p${changed}-attempt-1`), null, `key ${changed} of ${size}: the stale attempt wrote nothing`);
    assert.equal(await store.get(`p${changed}-attempt-2`), "written");
    assert.equal(await store.get(keys[changed]), `theirs-${changed}`, "and the other writer's change stands");
  }
});

test("a transaction that reads more keys than one D1 statement can bind still commits", async () => {
  // D1 refuses a statement with more than 100 bound parameters, and the D1
  // fake now does too. Each key read costs two in a validation statement, so a
  // chunk of more than 48 keys would fail every attempt on real D1, and its
  // webhook would answer 500 for good.
  const env = createAccountEnv();
  const keys = Array.from({ length: 150 }, (_, i) => `wide${i}`);
  const result = await runLedgerTransaction(env, async (kv) => {
    for (const key of keys) {
      await kv.get(key);
    }
    await kv.put("wide-total", "150");
    return "done";
  }, NO_WAIT);
  assert.equal(result, "done");
  assert.equal(await ledgerReader(env).get("wide-total"), "150");
});

// ------------------------------------------------- expired rows and tombstones

test("a key that expired, or was deleted, can be read and written again on the first attempt", async () => {
  // This is what markEventSeen, noteRefusal and the index writes do to a key
  // whose old copy has expired but has not been swept yet. If validation
  // disagreed with the read about such a row (the read saw it absent, the
  // check saw a version), every attempt conflicted and the webhook answered
  // 500 until the daily sweep removed the row.
  for (const [label, at] of [["long after it expired", 5000], ["in the second it expired", 1060]]) {
    const env = createAccountEnv();
    await putAt(env, "event:stripe:e1", "1", 60, 1000);
    let attempts = 0;
    const seen = await runLedgerTransaction(env, async (kv) => {
      attempts += 1;
      const before = await kv.get("event:stripe:e1");
      await kv.put("event:stripe:e1", "2", { expirationTtl: 60 });
      return before;
    }, { ...NO_WAIT, now: at });
    assert.equal(seen, null, `${label}: it reads as absent`);
    assert.equal(attempts, 1, `${label}: and nobody holds it, so nothing conflicts`);
    assert.equal(await ledgerReader(env, { now: at }).get("event:stripe:e1"), "2");
  }

  // A tombstone: deleted by one transaction, then read by a later one.
  const env = createAccountEnv();
  await putAt(env, "lic:z", "{}", null, 1000);
  await runLedgerTransaction(env, async (kv) => {
    await kv.get("lic:z");
    await kv.delete("lic:z");
  }, { ...NO_WAIT, now: 1001 });
  let attempts = 0;
  const seen = await runLedgerTransaction(env, async (kv) => {
    attempts += 1;
    const value = await kv.get("lic:z");
    await kv.put("other", "x");
    return value;
  }, { ...NO_WAIT, now: 1002 });
  assert.deepEqual([seen, attempts], [null, 1], "a deleted key reads as absent and does not conflict with itself");
});

test("writing a key again restarts its TTL, and a write without one keeps the key for good", async () => {
  // An index or marker written a second time used to keep the first write's
  // expiry, so it vanished early; a key written for good over one that had a
  // TTL vanished too.
  const env = createAccountEnv();
  await putAt(env, "claim:stripe:cs", "L1", 60, 1000);
  await putAt(env, "claim:stripe:cs", "L1", 60, 1050);
  assert.equal(await ledgerReader(env, { now: 1070 }).get("claim:stripe:cs"), "L1", "60 s from the second write, not the first");
  assert.equal(await ledgerReader(env, { now: 1110 }).get("claim:stripe:cs"), null, "and gone after those");

  await putAt(env, "lic:keep", "{}", 60, 1000);
  await putAt(env, "lic:keep", "{\"kept\":true}", null, 1010);
  assert.equal(await ledgerReader(env, { now: 999999 }).get("lic:keep"), "{\"kept\":true}");
});

test("a deleted key stays deleted after the expiry sweep, though KV still holds its copy from before", async () => {
  // The tombstone is what hides KV's copy. A tombstone given an expiry, or one
  // that kept the expiry of the value it replaced, is swept away, and the
  // deleted key comes back from KV.
  const env = createAccountEnv();
  await env.ENTITLEMENTS.put("event:stripe:old", "1");
  await runLedgerTransaction(env, async (kv) => {
    assert.equal(await kv.get("event:stripe:old"), "1");
    await kv.delete("event:stripe:old");
  }, { ...NO_WAIT, now: 1000 });

  await env.ENTITLEMENTS.put("claim:stripe:cs_x", "LEGACY");
  await putAt(env, "claim:stripe:cs_x", "NEW", 60, 1000);
  await runLedgerTransaction(env, async (kv) => {
    assert.equal(await kv.get("claim:stripe:cs_x"), "NEW");
    await kv.delete("claim:stripe:cs_x");
  }, { ...NO_WAIT, now: 1010 });

  // Control: the sweep does remove a row past its TTL, so it ran over the ledger.
  await putAt(env, "claim:stripe:gone", "L", 60, 1000);
  const report = await sweepExpired(env.DB, 5000, env.ENTITLEMENTS);
  assert.deepEqual(report.failed, []);
  assert.equal(await rowOf(env, "claim:stripe:gone"), null, "the expired row was swept");

  const store = ledgerReader(env, { now: 5000 });
  assert.equal(await store.get("event:stripe:old"), null, "still deleted");
  assert.equal(await store.get("claim:stripe:cs_x"), null, "also when the value it replaced had a TTL");
});

test("a key D1 held and let expire is gone, though KV still holds an older copy", async () => {
  // Any row, even an expired one, means D1 owns the key. Before the sweep
  // removes the row, the expired key must not be looked for in KV again.
  const env = createAccountEnv();
  await env.ENTITLEMENTS.put("claim:stripe:cs_old", "LEGACY");
  await putAt(env, "claim:stripe:cs_old", "NEW", 60, 1000);
  assert.equal(await ledgerReader(env, { now: 1059 }).get("claim:stripe:cs_old"), "NEW");
  assert.equal(await ledgerReader(env, { now: 1100 }).get("claim:stripe:cs_old"), null, "the reader does not fall back to KV");
  const seen = await runLedgerTransaction(env, (kv) => kv.get("claim:stripe:cs_old"), { ...NO_WAIT, now: 1100 });
  assert.equal(seen, null, "and neither does a transaction");
});

// --------------------------------------------------------- the read-only view

test("the read-only view refuses a write instead of dropping it", async () => {
  // A route that wrote through the reader by mistake would otherwise lose the
  // write with no error.
  const env = createAccountEnv();
  const reader = ledgerReader(env);
  await assert.rejects(reader.put("k", "v"), /runLedgerTransaction/);
  await assert.rejects(reader.delete("k"), /runLedgerTransaction/);
});

// ----------------------------------------------------------------- the reads

test("a key written without being read is not validated, so another writer changing it is no conflict", async () => {
  // A blind write commits in either serial order. Validating it anyway adds
  // conflicts that are not real, which use up the attempts and answer 500.
  const env = createAccountEnv();
  let attempts = 0;
  await runLedgerTransaction(env, async (kv) => {
    attempts += 1;
    await kv.put("lic:L", "mine");
    await kv.get("paid:L");
    if (attempts === 1) {
      await runLedgerTransaction(env, (other) => other.put("lic:L", "theirs"), NO_WAIT);
    }
  }, NO_WAIT);
  assert.equal(attempts, 1, "committed at once");
  assert.equal(await ledgerReader(env).get("lic:L"), "mine", "the later commit wins, which is a valid serial order");
});

test("a license's five keys are read in one query, in a transaction and in the read-only view", async () => {
  // store.js reads these together for every webhook and every claim; five
  // round trips instead of one cost latency and D1 rows read.
  const family = ["lic:", "paid:", "ended:", "reversed:", "charged:"];
  const env = createAccountEnv();
  const db = env.DB;
  const prepare = db.prepare.bind(db);
  let reads = 0;
  db.prepare = (sql) => {
    if (/^SELECT key, value, version, expires_at FROM ledger_kv/.test(sql)) {
      reads += 1;
    }
    return prepare(sql);
  };
  await runLedgerTransaction(env, async (kv) => {
    for (const prefix of family) {
      await kv.get(`${prefix}L`);
    }
  }, NO_WAIT);
  assert.equal(reads, 1, "one query in a transaction");
  reads = 0;
  const reader = ledgerReader(env);
  for (const prefix of family) {
    await reader.get(`${prefix}L`);
  }
  assert.equal(reads, 1, "and one in the read-only view");
});

// ------------------------------------------------------------------- backoff

/**
 * Run a transaction that conflicts on every attempt, with a recording sleep
 * that takes a few real milliseconds.
 * @returns {Promise<{sleeps: number[], tries: number, overlapped: boolean}>}
 *   The waits asked for, the attempts made, and whether an attempt started
 *   while a wait was still running.
 */
async function conflictingSchedule(random, maxAttempts) {
  const env = createAccountEnv();
  const sleeps = [];
  let sleeping = false;
  let overlapped = false;
  let tries = 0;
  const work = async (kv) => {
    tries += 1;
    overlapped = overlapped || sleeping;
    await kv.get("hot");
    await runLedgerTransaction(env, (other) => other.put("hot", String(tries)), NO_WAIT);
    await kv.put("hot", "mine");
  };
  const sleep = (ms) => {
    sleeps.push(ms);
    sleeping = true;
    return new Promise((resolve) => setTimeout(() => {
      sleeping = false;
      resolve();
    }, 5));
  };
  await assert.rejects(runLedgerTransaction(env, work, { sleep, random: () => random, maxAttempts }), LedgerConflictError);
  return { sleeps, tries, overlapped };
}

test("retries wait a random time under a doubling ceiling, capped, between attempts and never during one", async () => {
  // "Full jitter": before attempt n+1, a random wait up to min(400, 25 * 2^n)
  // ms. The ceilings are 50, 100, 200, 400, 400 ms; the waits below are those
  // times the injected random number, rounded down, worked out by hand.
  // Without the wait, or without its randomness, writers that collided retry
  // in step and collide again.
  const half = await conflictingSchedule(0.5, 4);
  assert.deepEqual(half.sleeps, [25, 50, 100], "half of each ceiling, and no wait after the last attempt");
  assert.equal(half.tries, 4);
  assert.equal(half.overlapped, false, "each attempt starts after its wait is over");

  const high = await conflictingSchedule(0.999, 6);
  assert.deepEqual(high.sleeps, [49, 99, 199, 399, 399], "the ceiling stops doubling at 400 ms");

  const once = await conflictingSchedule(0.5, 1);
  assert.deepEqual([once.tries, once.sleeps], [1, []], "one attempt when one is asked for, and no wait");
});
