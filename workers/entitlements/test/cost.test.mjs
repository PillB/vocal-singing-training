/**
 * What each thing a learner does costs, against the ceilings that refuse.
 *
 * Cloudflare's free plans do not degrade, they refuse, and the two that matter
 * here are not the ones anybody watches. Read on 3 November 2026:
 *
 *   - **Workers KV: 1,000 writes a day**, 1,000 deletes, 1,000 lists, 100,000
 *     reads, 1 GB stored. Past a limit, "further operations of that type will
 *     fail with an error", and the day resets at 00:00 UTC
 *     (developers.cloudflare.com/kv/platform/pricing).
 *   - **D1: 100,000 rows written and 5,000,000 rows read a day**, 5 GB. Past
 *     either, "D1 API will return errors to your client indicating that your
 *     daily limits have been exceeded" until 00:00 UTC
 *     (developers.cloudflare.com/d1/platform/pricing). A row written counts
 *     twice when an index covers the column, and a row read counts every row
 *     scanned, not every row returned.
 *   - **Workers: 100,000 requests a day** and 10 ms CPU per request.
 *
 * KV is the tight one, and it is tight around the thing that must not fail. A
 * new paid subscriber costs ten or eleven KV writes and a renewal five or six,
 * so the free plan buys about ninety new subscribers in a day. What happens at
 * the ninety-first is not a slow page: `kv.put` throws, the webhook answers 500,
 * and whether the sale survives depends on how patient the provider is. Mercado
 * Pago retries every fifteen minutes until it gets an answer and Stripe for up
 * to three days, so both come back after midnight UTC. Creem makes five attempts
 * — the delivery, then 30 s, 5 min, 30 min and 6 h — and retries nothing after
 * twenty-four hours, so a purchase made before about 17:25 UTC gets an attempt
 * after the reset and a later one waits for a manual resend that nothing asks
 * anybody for. (This comment said 30 s, 1 min, 5 min and 1 hour until
 * 2026-11-04, from a Creem page that now 404s; re-read from
 * docs.creem.io/code/webhooks.) `docs/43-WHEN-IT-BREAKS.md` has the whole of
 * that reasoning and what to do about it; this file is the half that can be
 * measured, so that it stays measured.
 *
 * The budgets below are the numbers this tree actually spends, each a little
 * above what was measured so that an ordinary change does not fail the build and
 * a doubling does. They are a ratchet, not a target: when one of them has to go
 * up, the daily ceiling it implies goes down, and that belongs in the commit
 * message rather than in a quiet edit.
 *
 * What this cannot measure: D1's own row counts. `rows_read` depends on the
 * query plan and `rows_written` on the indexes, and only real D1 reports them.
 * Statements are the proxy here, and a statement that scans is the thing a
 * statement count hides — so the last test asks SQLite for the query plan of
 * every statement a hot path runs and fails on a SCAN of a table that grows with
 * use. VG-60.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import worker, { handleRequest } from "../src/index.js";
import { resetSchemaMemo } from "../src/db.js";
import { createAccountEnv, createFakeKv, createTestEnv } from "./fixtures.mjs";

const DAY = 86400;
// `ingestRefusal` refuses a request with no user-agent, so every case that is
// meant to be accepted has to carry one.
const BROWSER_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/605.1.15";
const T = Math.floor(Date.now() / 1000);
const hmacHex = (secret, message) => createHmac("sha256", secret).update(message).digest("hex");
const iso = (days) => new Date((T + days * DAY) * 1000).toISOString();
const msAt = (days) => (T + Math.round(days * DAY)) * 1000;

/**
 * Wrap an env's bindings so every KV operation and D1 statement is counted.
 *
 * Also records the query plan of each statement, because a statement count is
 * blind to the cost that grows: one `SELECT` that scans a million rows is one
 * statement and a million rows read.
 * @param {Object} env Env bindings to instrument in place.
 * @returns {{kvWrites: number, kvReads: number, statements: number, batches: number,
 *            scans: string[], reset: Function}} The meter.
 */
function meter(env) {
  const m = {
    kvWrites: 0,
    kvReads: 0,
    statements: 0,
    // Counted separately because D1's free plan limits *queries* per invocation
    // and bills a `batch()` as one of them, while this file's `statements` is a
    // count of `prepare` calls. Both are true and they are not the same number.
    batches: 0,
    // And the size of each, because `countIngest` batches its own counters: a
    // bare count of two cannot tell one batch of 25 from 25 batches of one.
    batchSizes: [],
    scans: [],
    reset() {
      this.kvWrites = 0;
      this.kvReads = 0;
      this.statements = 0;
      this.batches = 0;
      this.batchSizes = [];
      this.scans = [];
    }
  };
  if (env.ENTITLEMENTS) {
    const kv = env.ENTITLEMENTS;
    const put = kv.put.bind(kv);
    const get = kv.get.bind(kv);
    kv.put = async (...args) => {
      m.kvWrites += 1;
      return put(...args);
    };
    kv.get = async (...args) => {
      m.kvReads += 1;
      return get(...args);
    };
  }
  if (env.DB) {
    const db = env.DB;
    const prepare = db.prepare.bind(db);
    db.prepare = (sql) => {
      m.statements += 1;
      try {
        // `?1` style parameters are D1's; SQLite's planner takes a bare `?`.
        const plan = db.db.prepare(`EXPLAIN QUERY PLAN ${sql.replace(/\?\d+/g, "?")}`).all();
        for (const row of plan) {
          const detail = String((row && row.detail) || "");
          const hit = /^SCAN (\S+)/.exec(detail);
          // A scan of CONSTANT or of a subquery is a scan of nothing that grows;
          // only a named table matters here.
          if (hit && hit[1] !== "CONSTANT" && !hit[1].startsWith("(")) {
            m.scans.push(`${detail} :: ${sql.replace(/\s+/g, " ").trim().slice(0, 80)}`);
          }
        }
      } catch {
        // DDL and a few pragmas have no plan; nothing to record.
      }
      return prepare(sql);
    };
    const batch = db.batch.bind(db);
    db.batch = async (statements) => {
      m.batches += 1;
      m.batchSizes.push(Array.isArray(statements) ? statements.length : 1);
      return batch(statements);
    };
  }
  return m;
}

// ---------------------------------------------------------------- the paid rails

const checkoutSession = {
  id: "cs", mode: "subscription", customer: "cus", subscription: "sub",
  payment_intent: null, payment_status: "paid"
};
const line = (startDays, endDays) => ({ period: { start: T + startDays * DAY, end: T + endDays * DAY } });
const invoice = (id, lines) => ({
  id, customer: "cus", subscription: "sub", payment_intent: `pi_${id}`, lines: { data: lines }
});

function stripeEvent(env, id, type, atDays, object) {
  const raw = JSON.stringify({ id, type, created: T + Math.round(atDays * DAY), data: { object } });
  const ts = Math.floor(Date.now() / 1000);
  return handleRequest(new Request("https://w.test/v1/webhooks/stripe", {
    method: "POST",
    body: raw,
    headers: { "Stripe-Signature": `t=${ts},v1=${hmacHex(env.STRIPE_WEBHOOK_SECRET, `${ts}.${raw}`)}` }
  }), env);
}
function creemEvent(env, id, eventType, atDays, object) {
  const raw = JSON.stringify({ id, eventType, created_at: msAt(atDays), object });
  return handleRequest(new Request("https://w.test/v1/webhooks/creem", {
    method: "POST", body: raw, headers: { "creem-signature": hmacHex(env.CREEM_WEBHOOK_SECRET, raw) }
  }), env);
}
const creemSub = (status, startDays, endDays, over) => ({
  id: "sub_1", object: "subscription", status, collection_method: "charge_automatically",
  product: { id: "prod_monthly", billing_period: "every-month" }, customer: { id: "cust_1" },
  items: [{ id: "si", product_id: "prod_monthly", units: 1 }],
  current_period_start_date: iso(startDays), current_period_end_date: iso(endDays), canceled_at: null,
  ...(over || {})
});
const creemPaid = (tran, startDays, endDays, chargedDays) => creemSub("active", startDays, endDays, {
  last_transaction_id: tran,
  last_transaction: { id: tran, amount: 1000, amount_paid: 1000, status: "paid" },
  last_transaction_date: iso(chargedDays)
});
const creemCheckout = {
  id: "ch_1", object: "checkout", status: "completed", mode: "prod",
  order: { id: "ord_1", status: "paid", transaction: "tran_1" },
  product: { id: "prod_monthly", billing_period: "every-month" },
  customer: { id: "cust_1" }, subscription: { id: "sub_1" }, metadata: {}
};

/** KV writes a new paid subscriber may cost, on either rail. */
const NEW_SUBSCRIBER_KV_WRITES = 12;
/** KV writes a renewal may cost. */
const RENEWAL_KV_WRITES = 7;

test("a new Stripe subscriber, from checkout to a minted licence, stays inside its KV write budget", async () => {
  const env = createTestEnv({ ENTITLEMENTS: createFakeKv() });
  const m = meter(env);
  await stripeEvent(env, "e1", "checkout.session.completed", 0, checkoutSession);
  await stripeEvent(env, "e2", "invoice.paid", 0, invoice("in1", [line(0, 31)]));
  const claim = await handleRequest(new Request("https://w.test/v1/claim", {
    method: "POST", body: JSON.stringify({ provider: "stripe", sessionId: "cs" }),
    headers: { "content-type": "application/json" }
  }), env);
  assert.equal(claim.status, 200, "the flow has to succeed or the count means nothing");
  assert.ok(
    m.kvWrites <= NEW_SUBSCRIBER_KV_WRITES,
    `a new Stripe subscriber cost ${m.kvWrites} KV writes, budget ${NEW_SUBSCRIBER_KV_WRITES}; `
    + `at ${m.kvWrites} the free plan's 1,000 a day is ${Math.floor(1000 / Math.max(1, m.kvWrites))} subscribers`
  );
});

test("a Stripe renewal stays inside its KV write budget", async () => {
  const env = createTestEnv({ ENTITLEMENTS: createFakeKv() });
  await stripeEvent(env, "e1", "checkout.session.completed", 0, checkoutSession);
  await stripeEvent(env, "e2", "invoice.paid", 0, invoice("in1", [line(0, 31)]));
  const m = meter(env);
  await stripeEvent(env, "e3", "invoice.paid", 31, invoice("in2", [line(31, 62)]));
  assert.ok(m.kvWrites <= RENEWAL_KV_WRITES, `a Stripe renewal cost ${m.kvWrites} KV writes, budget ${RENEWAL_KV_WRITES}`);
});

test("a new Creem subscriber stays inside its KV write budget", async () => {
  const env = createTestEnv({ ENTITLEMENTS: createFakeKv() });
  const m = meter(env);
  await creemEvent(env, "c1", "checkout.completed", 0, creemCheckout);
  await creemEvent(env, "c2", "subscription.paid", 0, creemPaid("tran_1", 0, 31, 0));
  assert.ok(
    m.kvWrites <= NEW_SUBSCRIBER_KV_WRITES,
    `a new Creem subscriber cost ${m.kvWrites} KV writes, budget ${NEW_SUBSCRIBER_KV_WRITES}. `
    + "Creem retries a failed webhook for about an hour, so a day that runs out of KV writes loses the sale rather than deferring it"
  );
});

test("a Creem renewal stays inside its KV write budget", async () => {
  const env = createTestEnv({ ENTITLEMENTS: createFakeKv() });
  await creemEvent(env, "c1", "checkout.completed", 0, creemCheckout);
  await creemEvent(env, "c2", "subscription.paid", 0, creemPaid("tran_1", 0, 31, 0));
  const m = meter(env);
  await creemEvent(env, "c3", "subscription.paid", 31, creemPaid("tran_2", 31, 62, 31));
  assert.ok(m.kvWrites <= RENEWAL_KV_WRITES, `a Creem renewal cost ${m.kvWrites} KV writes, budget ${RENEWAL_KV_WRITES}`);
});

test("minting a licence from a claim writes nothing to KV, because the record is already there", async () => {
  const env = createTestEnv({ ENTITLEMENTS: createFakeKv() });
  await stripeEvent(env, "e1", "checkout.session.completed", 0, checkoutSession);
  await stripeEvent(env, "e2", "invoice.paid", 0, invoice("in1", [line(0, 31)]));
  const m = meter(env);
  for (let i = 0; i < 5; i += 1) {
    await handleRequest(new Request("https://w.test/v1/claim", {
      method: "POST", body: JSON.stringify({ provider: "stripe", sessionId: "cs" }),
      headers: { "content-type": "application/json" }
    }), env);
  }
  assert.equal(m.kvWrites, 0, "a browser re-checking its licence must not spend the day's write budget");
});

// ------------------------------------------------------- the account layer, on D1

const BASE = "https://entitlements.test";
const NOW = 1800000000;
function req(method, path, options) {
  const opts = options || {};
  return new Request(`${BASE}${path}`, {
    method,
    headers: {
      ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
      ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}),
      ...(opts.headers || {})
    },
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) })
  });
}
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
 * Sign in by email, returning the session token and the meter, warmed so that
 * `ensureSchema`'s thirty-odd statements are not counted against a request.
 * @returns {Promise<{env: Object, meter: Object, token: string}>} The signed-in fixture.
 */
async function signedIn() {
  resetSchemaMemo();
  const env = createAccountEnv();
  let sentCode = null;
  const fetchImpl = async (url, init) => {
    const payload = JSON.parse(init.body);
    const match = /\b(\d{6})\b/.exec(payload.text || "");
    sentCode = match && match[1];
    return { ok: true, status: 200 };
  };
  // One throwaway sign-in start creates the schema, which is a one-off per
  // isolate and would otherwise be charged to whichever request came first.
  await call(req("POST", "/v1/auth/email/start", { body: { email: "warm@example.test" } }), env, { now: NOW, fetchImpl });
  const m = meter(env);
  await call(req("POST", "/v1/auth/email/start", { body: { email: "a@example.test" } }), env, { now: NOW, fetchImpl });
  const verified = await call(
    req("POST", "/v1/auth/email/verify", { body: { email: "a@example.test", code: sentCode } }),
    env, { now: NOW + 1 }
  );
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return { env, meter: m, token: verified.body.sessionToken };
}

test("signing in by email costs a bounded number of statements, schema aside", async () => {
  const { meter: m } = await signedIn();
  // Measured on 3 November 2026: 7 for the code, 12 for the verification.
  assert.ok(m.statements <= 24, `a whole email sign-in ran ${m.statements} statements, budget 24`);
});

test("a day of practice syncing is a handful of statements and no KV at all", async () => {
  const { env, meter: m, token } = await signedIn();
  m.reset();
  const first = await call(req("PUT", "/v1/me/progress", {
    token, body: { profileId: "default", doc: { a: 1 }, baseRev: 0 }
  }), env, { now: NOW + 2 });
  assert.equal(first.status, 200, JSON.stringify(first.body));
  const firstWrite = m.statements;
  m.reset();
  // Twelve pushes is a heavy evening: the browser waits 8 s of quiet before each.
  for (let i = 0; i < 12; i += 1) {
    const r = await call(req("PUT", "/v1/me/progress", {
      token, body: { profileId: "default", doc: { a: i + 2 }, baseRev: i + 1 }
    }), env, { now: NOW + 3 + i });
    assert.equal(r.status, 200, JSON.stringify(r.body));
  }
  assert.ok(firstWrite <= 8, `a first write ran ${firstWrite} statements, budget 8`);
  assert.ok(m.statements <= 12 * 9, `twelve pushes ran ${m.statements} statements, budget ${12 * 9}`);
  assert.equal(m.kvWrites, 0, "saved progress lives in D1; it must not touch the KV write budget");
});

/**
 * One browser's batch of 25 events, accepted.
 *
 * This case used to send no `user-agent` and put `cid` on the body instead of
 * on each event, and then assert `status === 202`. Every one of those is the
 * refusal path: `ingestRefusal` answers "automated" for a missing UA, and
 * `sanitizeEvent` reads `cid` off each event and rejects it as `bad_cid`
 * otherwise. So it stored nothing, spent one statement on the ingest counter,
 * and its "<= 3 statements" budget would have passed for any implementation at
 * all — including one that wrote a row per event with no batching, which is
 * the single thing it claimed to be about. The accepted path answers **200**.
 * Found by QA on 2026-11-04 (round 10 ops), reproduced here before this was
 * rewritten, and `docs/43-WHEN-IT-BREAKS.md` §3.1 and §3.3 were wrong by the
 * same amount.
 *
 * Measured accepted: 30 prepares and a single `batch()`. Rows written is the
 * number that matters and no fake can report it: `events` carries two indexes
 * (`idx_events_cid_name`, `idx_events_received`), so D1 counts three rows per
 * event — 75 for this batch — plus the ingest counter and the rate-limit rows.
 * Call it about 80 against a ceiling of 100,000 a day.
 */
test("a batch of 25 accepted events is one D1 batch, and it is not free", async () => {
  const { env, meter: m } = await signedIn();
  m.reset();
  const sent = await call(req("POST", "/v1/events", {
    headers: { Origin: "https://example.test", "user-agent": BROWSER_UA },
    body: {
      events: Array.from({ length: 25 }, () => ({
        name: "app_open",
        cid: "c".repeat(22),
        day: "2026-11-03",
        tz: -300,
        props: {}
      }))
    }
  }), env, { now: NOW + 20 });
  assert.equal(sent.status, 200, `the accepted path answers 200: ${JSON.stringify(sent.body)}`);
  assert.equal(sent.body.accepted, 25, "all 25 were stored, which is what makes this a cost");
  assert.equal(sent.body.dropped, 0);
  // Two batches: the 25 inserts, and `countIngest`'s own tally of what it took.
  assert.equal(m.batches, 2, `batches: ${JSON.stringify(m.batchSizes)}`);
  assert.ok(
    m.batchSizes.includes(25),
    `25 inserts go out as one batch, which is the point of batching; sizes were ${JSON.stringify(m.batchSizes)}`
  );
  assert.ok(m.statements <= 40, `25 accepted events ran ${m.statements} prepares, budget 40`);
  assert.ok(m.statements >= 26, `only ${m.statements} prepares: an insert per event is no longer happening?`);
  assert.equal(m.kvWrites, 0, "counting must never touch the KV write budget that sells Pro");
});

test("a refused batch is cheap, which is the only thing the old version of the case above proved", async () => {
  const { env, meter: m } = await signedIn();
  m.reset();
  const refused = await call(req("POST", "/v1/events", {
    // No user-agent: `ingestRefusal` calls this automated.
    headers: { Origin: "https://example.test" },
    body: {
      events: Array.from({ length: 25 }, () => ({ name: "app_open", cid: "c".repeat(22), day: "2026-11-03", tz: -300, props: {} }))
    }
  }), env, { now: NOW + 21 });
  assert.equal(refused.status, 202, JSON.stringify(refused.body));
  assert.equal(refused.body.accepted, 0);
  assert.equal(refused.body.reason, "automated");
  assert.ok(m.statements <= 3, `a refusal ran ${m.statements} statements, budget 3`);
  // One batch, and it is `countIngest` writing down that it refused one request:
  // nothing is stored in `events`, which is what the budget above is about.
  assert.deepEqual(m.batchSizes, [1], "a refusal stores nothing but its own tally");

  // And the other half of the same mistake: a cid on the body entitles nothing.
  m.reset();
  const misplaced = await call(req("POST", "/v1/events", {
    headers: { Origin: "https://example.test", "user-agent": BROWSER_UA },
    body: {
      cid: "c".repeat(22),
      events: Array.from({ length: 25 }, () => ({ name: "app_open", day: "2026-11-03", tz: -300, props: {} }))
    }
  }), env, { now: NOW + 22 });
  assert.equal(misplaced.body.accepted, 0, "cid belongs to the event, not to the envelope");
  assert.equal(misplaced.body.dropped, 25);
  assert.deepEqual(m.batchSizes, [1], "25 rejections store nothing but the tally of them");
});

test("nothing a learner can do makes the database scan a table that grows with use", async () => {
  const { env, meter: m, token } = await signedIn();
  m.reset();
  await call(req("GET", "/v1/me", { token }), env, { now: NOW + 2 });
  await call(req("POST", "/v1/me/trial", { token }), env, { now: NOW + 3 });
  await call(req("PUT", "/v1/me/progress", { token, body: { profileId: "default", doc: { a: 1 }, baseRev: 0 } }), env, { now: NOW + 4 });
  await call(req("GET", "/v1/me/progress?profileId=default", { token }), env, { now: NOW + 5 });
  // Accepted, not refused: this used to send no user-agent and a `cid` on the
  // envelope, so the insert never ran and the one statement this guard most
  // needs to see a plan for was the one it never saw.
  const counted = await call(req("POST", "/v1/events", {
    headers: { Origin: "https://example.test", "user-agent": BROWSER_UA },
    body: { events: [{ name: "app_open", cid: "c".repeat(22), day: "2026-11-03", tz: -300, props: {} }] }
  }), env, { now: NOW + 6 });
  assert.equal(counted.body.accepted, 1, `the event has to be stored for its plan to be read: ${JSON.stringify(counted.body)}`);
  // D1 charges every row a query scans, not every row it returns, so a scan of
  // `events` or `progress` is a bill that grows with the product's success.
  assert.deepEqual(m.scans, [], `these statements scan a whole table:\n${m.scans.join("\n")}`);
});

test("/v1/health answers without touching either binding, and ?probe=1 reads one of each", async () => {
  const { env, meter: m } = await signedIn();
  m.reset();
  const plain = await call(req("GET", "/v1/health"), env, { now: NOW + 30 });
  assert.equal(plain.status, 200);
  assert.equal(m.statements, 0, "the plain health route must stay free to call");
  assert.equal(m.kvReads, 0);
  assert.equal(plain.body.probe, undefined);

  m.reset();
  const probed = await call(req("GET", "/v1/health?probe=1"), env, { now: NOW + 31 });
  assert.equal(probed.status, 200);
  assert.deepEqual(probed.body.probe, { db: "ok", kv: "ok", writes: "ok" });
  // Two: `SELECT 1` for liveness, which needs no schema, and the write flag.
  assert.equal(m.statements, 2, "two rows read, so a probe a minute is 2,880 a day of D1's 5,000,000");
  assert.equal(m.kvReads, 1, "and one of KV's 100,000");
  assert.equal(m.kvWrites, 0, "a probe a minute would be 144% of KV's daily write allowance");
});

/** A signed Stripe checkout, posted through `worker.fetch` as Cloudflare calls it. */
async function postSale(env, id) {
  const raw = JSON.stringify({
    id,
    type: "checkout.session.completed",
    created: T,
    data: { object: checkoutSession }
  });
  const ts = Math.floor(Date.now() / 1000);
  return worker.fetch(new Request("https://w.test/v1/webhooks/stripe", {
    method: "POST",
    body: raw,
    headers: { "Stripe-Signature": `t=${ts},v1=${hmacHex(env.STRIPE_WEBHOOK_SECRET, `${ts}.${raw}`)}` }
  }), env);
}

/**
 * The failure the probe could not see, which is the failure this whole file is
 * about.
 *
 * KV meters writes separately from reads. Past the free plan's 1,000 writes a
 * day `kv.put` throws while `kv.get` keeps answering, so a purchase that cannot
 * be recorded left `?probe=1` answering a cheerful 200 — and `docs/43` §4.1
 * claimed the free pinger catches "KV refusing" when what it caught was KV
 * *reads* refusing. QA found it on 2026-11-04.
 *
 * With D1 bound the payment ledger is in D1 (ledger.js), so KV refusing writes
 * no longer stops a sale at all. The same blindness moved with it: D1's free
 * plan refuses writes past 100,000 rows a day while `SELECT 1` keeps working.
 * Both halves are pinned here.
 */
test("a sale is recorded while KV refuses writes, once the ledger is in D1", async () => {
  const env = createAccountEnv({ ENTITLEMENTS: createFakeKv() });
  env.ENTITLEMENTS.put = async () => {
    throw new Error("KV PUT failed: 429 Too Many Requests");
  };
  const sale = await postSale(env, "e1");
  assert.equal(sale.status, 200, "KV's write ceiling is no longer on the path of a purchase");
  const claim = await call(req("POST", "/v1/claim", { body: { provider: "stripe", sessionId: "cs" } }), env, { now: NOW });
  assert.equal(claim.status, 200, "and the buyer's browser can claim it");
  assert.equal(claim.body.entitlement.status, "active");
});

test("a webhook that cannot write is visible to the read-only probe", async () => {
  const env = createAccountEnv({ ENTITLEMENTS: createFakeKv() });
  const m = meter(env);

  // Deliberately a worker whose schema has never been created, which is the
  // harder case for the flag.
  const before = await call(req("GET", "/v1/health?probe=1"), env, { now: NOW });
  assert.equal(before.status, 200, "a deployment nobody has used yet is not broken");
  assert.equal(before.body.probe.writes, "unknown", "and it does not claim to know about writes");

  // Reads work, writes do not: exactly what D1's daily write ceiling looks
  // like. Every batch (the ledger's commit, the schema's CREATEs) and every
  // single write (the flag's row) is refused; SELECTs still answer.
  const db = env.DB;
  const refuse = () => {
    throw new Error("D1_ERROR: daily rows written limit exceeded");
  };
  db.batch = async () => refuse();
  const prepare = db.prepare;
  db.prepare = (sql) => {
    const statement = prepare(sql);
    if (/^\s*(INSERT|UPDATE|DELETE|CREATE)/i.test(sql)) {
      return { bind: () => ({ run: async () => refuse(), first: async () => refuse(), all: async () => refuse() }), run: async () => refuse() };
    }
    return statement;
  };

  // Through `worker.fetch`, which is what Cloudflare calls: the handlers rethrow
  // on purpose and the entry point is what turns that into the 500 the provider
  // needs in order to retry.
  const sale = await postSale(env, "e1");
  assert.equal(sale.status, 500, "the webhook has to fail, or there is nothing to see");

  // No injected clock from here on: `worker.fetch` takes none, so the flag was
  // stamped with the real one and the probe has to be read against the same.
  m.reset();
  const after = await call(req("GET", "/v1/health?probe=1"), env);
  assert.equal(after.status, 503, "and now the probe says so");
  assert.equal(after.body.ok, false);
  assert.equal(after.body.probe.writes, "failing");
  assert.equal(after.body.probe.db, "ok", "D1 reads are fine, which is why this needed its own signal");
  assert.equal(after.body.probe.kv, "ok");
  assert.equal(m.kvReads, 1, "the one KV read the probe always spent, now on the flag D1 refused");
  assert.equal(m.kvWrites, 0);
  assert.ok(
    !JSON.stringify(after.body).includes("rows written") && !JSON.stringify(after.body).includes("D1_ERROR"),
    "this route is public; the provider's error text is not ours to publish"
  );

  // It clears itself, so one bad minute does not hold the alarm red for a day.
  const later = await call(req("GET", "/v1/health?probe=1"), env, {
    now: Math.floor(Date.now() / 1000) + 3700
  });
  assert.equal(later.status, 200);
  assert.notEqual(later.body.probe.writes, "failing");
});

test("a probe that cannot reach the database does not claim writes are fine", async () => {
  const env = createAccountEnv();
  await call(req("GET", "/v1/health?probe=1"), env, { now: NOW });
  const broken = { ...env, DB: { prepare() { throw new Error("D1_ERROR: daily limit exceeded"); } } };
  const probed = await call(req("GET", "/v1/health?probe=1"), broken, { now: NOW + 1 });
  assert.equal(probed.status, 503);
  assert.equal(probed.body.probe.db, "error");
  // "unknown" and not "ok": the row that would have said so is in the database
  // that just refused. A probe that reports what it cannot know is worse than
  // one that reports nothing.
  assert.equal(probed.body.probe.writes, "unknown");
});

test("?probe=1 answers 503 when a binding refuses, which is the whole reason it exists", async () => {
  const env = createAccountEnv();
  await call(req("GET", "/v1/health?probe=1"), env, { now: NOW });
  const broken = {
    ...env,
    DB: { prepare() { throw new Error("D1_ERROR: daily limit exceeded"); } }
  };
  const probed = await call(req("GET", "/v1/health?probe=1"), broken, { now: NOW + 1 });
  assert.equal(probed.status, 503, "a worker whose database refuses every query is not healthy");
  assert.equal(probed.body.ok, false);
  assert.equal(probed.body.probe.db, "error");
  assert.equal(probed.body.accountsConfigured, true, "configured and working are different questions");
  assert.ok(
    !JSON.stringify(probed.body).includes("daily limit"),
    "this route is public; a database error message is not ours to publish"
  );
});

test("the admin funnel reads the whole events table, which is a known cost with a known threshold", async () => {
  // Not a defect, and not left silent either. The funnel groups by browser, and
  // SQLite serves that from the covering index on (cid, name, received_at) by
  // scanning it, which is the cheapest plan in I/O and the most expensive one in
  // D1's accounting: D1 charges every row a query scans. So one press of the
  // funnel reads the whole table, whatever window it was asked for.
  //
  // Measured attempts to avoid it, 3 November 2026: an index on
  // (received_at, cid, name) and one on (cid, received_at, name) both leave the
  // plan a scan, because using a range index would cost a sort for the GROUP BY
  // and the planner prefers the scan. Forcing it with INDEXED BY would read only
  // the window and would also break hard the day that index is renamed.
  //
  // So it is recorded rather than contorted. D1's free plan allows 5,000,000 rows
  // read a day, events are kept 180 days, and the number worth knowing is that
  // the table has to reach about half a million rows before one press of the
  // funnel costs a tenth of the day's reads. At this site's traffic that is years
  // away, and `docs/43-WHEN-IT-BREAKS.md` says what to do when it is not.
  //
  // What this test is for: one known scan, named. A second one is somebody's new
  // query, and it should be looked at rather than discovered on a bill.
  const { env, meter: m } = await signedIn();
  let sentCode = null;
  const fetchImpl = async (url, init) => {
    const match = /\b(\d{6})\b/.exec(JSON.parse(init.body).text || "");
    sentCode = match && match[1];
    return { ok: true, status: 200 };
  };
  await call(req("POST", "/v1/auth/email/start", { body: { email: "admin@example.test" } }), env, { now: NOW, fetchImpl });
  const admin = await call(
    req("POST", "/v1/auth/email/verify", { body: { email: "admin@example.test", code: sentCode } }),
    env, { now: NOW + 1 }
  );
  assert.equal(admin.status, 200, JSON.stringify(admin.body));

  m.reset();
  const funnel = await call(req("GET", "/v1/admin/funnel?days=28", { token: admin.body.sessionToken }), env, { now: NOW + 2 });
  assert.equal(funnel.status, 200, JSON.stringify(funnel.body));
  assert.equal(
    m.scans.length, 1,
    `the admin funnel now scans ${m.scans.length} tables, not the one known scan:\n${m.scans.join("\n")}`
  );
  assert.match(m.scans[0], /SCAN events/, m.scans[0]);
});
