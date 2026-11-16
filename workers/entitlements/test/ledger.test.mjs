/**
 * The payment ledger in D1 (src/ledger.js): one transaction per webhook, with
 * optimistic concurrency, and the event's marker committed with its effect.
 *
 * Every race here is forced, not hoped for: a barrier holds each writer until
 * all of them have read, so they all read the same state, which is the
 * interleaving that loses an update. Each oracle is checked twice, once on the
 * D1 ledger (the correct outcome) and once on the KV store the worker used
 * before (the defect, reproduced), so a test that could not tell the two apart
 * would show it here.
 *
 * Expected values are written by hand from the providers' payloads, never
 * computed by the code under test.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { hmacSha256Hex, isTokenIssuable } from "../src/license.js";
import { buildMercadoPagoManifest } from "../src/mercadopago.js";
import worker, { handleRequest } from "../src/index.js";
import {
  LEDGER_MAX_ATTEMPTS,
  LEDGER_VALIDATE_CHUNK,
  LedgerConflictError,
  ledgerEnabled,
  ledgerReader,
  runLedgerTransaction
} from "../src/ledger.js";
import { getEntitlement, getLicenseIdForClaim, upsertEntitlement } from "../src/store.js";
import { createAccountEnv, createFakeKv, createTestEnv } from "./fixtures.mjs";

const BASE = "https://entitlements.test";
const DAY = 86400;
const T = Math.floor(Date.now() / 1000);
const NO_WAIT = { sleep: async () => {}, random: () => 0 };

// ------------------------------------------------------------------ helpers

/** Whether a batch statement is a ledger commit's (the schema's CREATE TABLE ledger_tx is not). */
function isCommitStatement(statement) {
  return /DELETE FROM ledger_tx WHERE tx_id/.test(String(statement.sql || ""));
}

/** D1-backed env with no waiting between ledger attempts. */
function d1Env() {
  return createAccountEnv();
}

/**
 * Hold every ledger commit (a batch that names ledger_tx) until `n` of them
 * are waiting, then let them all go in arrival order. Later commits (the
 * retries) pass straight through. So all `n` writers have read before any of
 * them writes.
 */
function holdCommits(env, n) {
  const db = env.DB;
  const real = db.batch.bind(db);
  let waiting = [];
  let released = false;
  db.batch = async (statements) => {
    const isCommit = statements.some((s) => isCommitStatement(s));
    if (isCommit && !released) {
      await new Promise((resolve) => {
        waiting.push(resolve);
        if (waiting.length >= n) {
          released = true;
          waiting.forEach((go) => go());
          waiting = [];
        }
      });
    }
    return real(statements);
  };
}

/**
 * The KV counterpart: hold the writes of keys matching `only` until `n` of them
 * are waiting. Held at the record's own write (`lic:`), every writer has done
 * all of its reads by then.
 */
function holdKvWrites(kv, n, only) {
  const real = kv.put.bind(kv);
  const match = only || (() => true);
  let waiting = [];
  let released = false;
  kv.put = async (key, value, options) => {
    if (!released && match(key)) {
      await new Promise((resolve) => {
        waiting.push(resolve);
        if (waiting.length >= n) {
          released = true;
          waiting.forEach((go) => go());
          waiting = [];
        }
      });
    }
    return real(key, value, options);
  };
}

/** A unit of work that adds one to a counter, through whatever store it is given. */
async function increment(kv) {
  const n = Number((await kv.get("counter")) || 0);
  await kv.put("counter", String(n + 1));
  return n + 1;
}

/** POST a JSON body. */
function postJson(path, body, headers) {
  return new Request(`${BASE}${path}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: { "content-type": "application/json", ...(headers || {}) }
  });
}

/** Deliver a signed Stripe event through the router. */
async function deliver(env, event, options) {
  const raw = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const sig = await hmacSha256Hex(env.STRIPE_WEBHOOK_SECRET, `${ts}.${raw}`);
  const res = await handleRequest(postJson("/v1/webhooks/stripe", raw, { "Stripe-Signature": `t=${ts},v1=${sig}` }), env, {
    ledger: NO_WAIT,
    ...(options || {})
  });
  return { status: res.status, body: await res.json() };
}

/** The same, through `worker.fetch` (what Cloudflare calls), so a throw becomes the 500 a provider sees. */
async function deliverRaw(env, event) {
  const raw = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const sig = await hmacSha256Hex(env.STRIPE_WEBHOOK_SECRET, `${ts}.${raw}`);
  const res = await worker.fetch(postJson("/v1/webhooks/stripe", raw, { "Stripe-Signature": `t=${ts},v1=${sig}` }), env);
  return { status: res.status, body: await res.json() };
}

/** The license a checkout session bought, read the way the worker reads it. */
async function recordFor(env, sessionId) {
  const store = ledgerReader(env);
  const id = await getLicenseIdForClaim(store, "stripe", sessionId);
  return id ? getEntitlement(store, id) : null;
}

// Stripe payloads for one new YEARLY subscription bought through Checkout. No
// price ids are configured and the Payment Link carries no metadata.plan, so
// only the subscription's own events say "year".
const yearlyItem = { price: { id: "price_y", recurring: { interval: "year", interval_count: 1 } }, current_period_end: T + 365 * DAY };
const subCreated = {
  id: "evt_sub_created", type: "customer.subscription.created", created: T,
  data: { object: { id: "sub_1", customer: "cus_1", status: "active", items: { data: [yearlyItem] } } }
};
const invoicePaid = {
  id: "evt_inv_paid", type: "invoice.paid", created: T,
  data: { object: { subscription: "sub_1", customer: "cus_1", payment_intent: "pi_1",
    lines: { data: [{ period: { end: T + 365 * DAY }, price: { id: "price_y" } }] } } }
};
const checkoutDone = {
  id: "evt_cs_done", type: "checkout.session.completed", created: T,
  data: { object: { id: "cs_1", mode: "subscription", customer: "cus_1", subscription: "sub_1", payment_status: "paid" } }
};
const BURST = [subCreated, invoicePaid, checkoutDone];

// ------------------------------------------------------------ the protocol

test("concurrent increments are all kept by the ledger, and lost by plain KV (the defect, reproduced)", async () => {
  const env = d1Env();
  holdCommits(env, 5);
  // Five writers in lock step: each round, one commits and the rest conflict
  // and read again, so five attempts is exactly enough for the last of them.
  const results = await Promise.all(Array.from({ length: 5 }, () => runLedgerTransaction(env, increment, { ...NO_WAIT, maxAttempts: 5 })));
  assert.equal(await ledgerReader(env).get("counter"), "5", "five increments, five counted");
  assert.deepEqual([...results].sort(), ["1", "2", "3", "4", "5"].map(Number), "each writer saw the one before it");

  // Control: the same five on KV with the same interleaving lose four.
  const kvEnv = createTestEnv();
  holdKvWrites(kvEnv.ENTITLEMENTS, 5);
  await Promise.all(Array.from({ length: 5 }, () => runLedgerTransaction(kvEnv, increment)));
  assert.equal(await kvEnv.ENTITLEMENTS.get("counter"), "1", "without a transaction every writer read 0");
});

test("a unit of work that throws leaves nothing behind", async () => {
  const env = d1Env();
  await assert.rejects(
    runLedgerTransaction(env, async (kv) => {
      await kv.put("event:stripe:e1", "1");
      await kv.put("lic:x", "{}");
      throw new Error("the apply failed");
    }, NO_WAIT),
    /the apply failed/
  );
  const store = ledgerReader(env);
  assert.equal(await store.get("event:stripe:e1"), null, "the marker did not outlive the failed work");
  assert.equal(await store.get("lic:x"), null);
});

test("a transaction reads its own writes, and a delete inside it reads as gone", async () => {
  const env = d1Env();
  const seen = await runLedgerTransaction(env, async (kv) => {
    await kv.put("a", "1");
    const first = await kv.get("a");
    await kv.delete("a");
    return [first, await kv.get("a")];
  }, NO_WAIT);
  assert.deepEqual(seen, ["1", null]);
});

test("a key that exists only in KV is still found, and D1 takes over once it is written", async () => {
  const env = d1Env();
  await env.ENTITLEMENTS.put("lic:old", JSON.stringify({ licenseId: "old", plan: "pro_yearly" }));
  assert.equal(JSON.parse(await ledgerReader(env).get("lic:old")).plan, "pro_yearly", "a record from before the ledger");
  await runLedgerTransaction(env, async (kv) => {
    const rec = JSON.parse(await kv.get("lic:old"));
    await kv.put("lic:old", JSON.stringify({ ...rec, status: "canceled" }));
  }, NO_WAIT);
  assert.equal(JSON.parse(await ledgerReader(env).get("lic:old")).status, "canceled");
  assert.equal(JSON.parse(await env.ENTITLEMENTS.get("lic:old")).status, undefined, "KV is no longer written");
});

test("a deleted key stays deleted even though KV still holds the old copy", async () => {
  const env = d1Env();
  await env.ENTITLEMENTS.put("event:stripe:old", "1");
  await runLedgerTransaction(env, async (kv) => {
    assert.equal(await kv.get("event:stripe:old"), "1");
    await kv.delete("event:stripe:old");
  }, NO_WAIT);
  assert.equal(await ledgerReader(env).get("event:stripe:old"), null, "the tombstone hides KV's copy");
});

test("a key past its TTL reads as absent", async () => {
  const env = d1Env();
  await runLedgerTransaction(env, (kv) => kv.put("claim:stripe:cs", "L1", { expirationTtl: 60 }), { ...NO_WAIT, now: 1000 });
  assert.equal(await ledgerReader(env, { now: 1059 }).get("claim:stripe:cs"), "L1", "inside its 60 seconds");
  assert.equal(await ledgerReader(env, { now: 1060 }).get("claim:stripe:cs"), null, "and gone at the 60th");
});

test("a change to any key read is seen, also past the first validation chunk", async () => {
  const env = d1Env();
  const keys = Array.from({ length: LEDGER_VALIDATE_CHUNK + 5 }, (_, i) => `k${i}`);
  // The last key read sits in the second chunk of the validation.
  const last = keys[keys.length - 1];
  let attempts = 0;
  holdCommits(env, 2);
  await Promise.all([
    runLedgerTransaction(env, async (kv) => {
      attempts += 1;
      for (const k of keys) {
        await kv.get(k);
      }
      await kv.put("total", String(attempts));
    }, NO_WAIT),
    runLedgerTransaction(env, (kv) => kv.put(last, "changed"), NO_WAIT)
  ]);
  assert.equal(attempts, 2, "the reader ran again because a key in its second chunk changed under it");
});

test("a transaction that keeps conflicting gives up with an error, so the provider retries later", async () => {
  const env = d1Env();
  let tries = 0;
  // Every attempt reads, then someone else writes the key before it commits.
  const work = async (kv) => {
    tries += 1;
    await kv.get("hot");
    await runLedgerTransaction(env, (other) => other.put("hot", String(tries)), NO_WAIT);
    await kv.put("hot", "mine");
  };
  await assert.rejects(runLedgerTransaction(env, work, NO_WAIT), LedgerConflictError);
  assert.equal(tries, LEDGER_MAX_ATTEMPTS);
  assert.equal(await ledgerReader(env).get("hot"), String(LEDGER_MAX_ATTEMPTS), "none of its writes landed");
});

test("without D1 the worker keeps using KV directly", () => {
  assert.equal(ledgerEnabled(createTestEnv()), false);
  assert.equal(ledgerEnabled(createAccountEnv()), true);
  const env = createTestEnv();
  assert.equal(ledgerReader(env), env.ENTITLEMENTS);
});

// ------------------------------------------------- webhooks through the router

test("a new subscription's three events processed at once give one yearly license (KV loses the plan)", async () => {
  const env = d1Env();
  holdCommits(env, 3);
  const answers = await Promise.all(BURST.map((e) => deliver(env, e)));
  assert.deepEqual(answers.map((a) => a.status), [200, 200, 200]);
  const rec = await recordFor(env, "cs_1");
  assert.equal(rec.plan, "pro_yearly", "the plan subscription.created wrote survives the checkout");
  assert.equal(rec.status, "active");
  assert.equal(rec.periodEnd, T + 365 * DAY);
  assert.equal(rec.periodPaymentId, "pi_1", "and the payment that bought the year is known, for a refund");
  assert.equal(isTokenIssuable(rec, T + 40 * DAY), true, "so the subscriber still has Pro on day 40");

  // Control: the same burst, same interleaving, on the KV store.
  const kvEnv = createTestEnv();
  holdKvWrites(kvEnv.ENTITLEMENTS, 3, (key) => key.startsWith("lic:"));
  await Promise.all(BURST.map((e) => deliver(kvEnv, e)));
  const kvRec = await recordFor(kvEnv, "cs_1");
  assert.notDeepEqual(
    { plan: kvRec.plan, periodPaymentId: kvRec.periodPaymentId },
    { plan: "pro_yearly", periodPaymentId: "pi_1" },
    "on KV the writer that read first erased what the others wrote"
  );
});

test("the same burst one after the other gives the same record as at once (the ledger is serializable)", async () => {
  const env = d1Env();
  for (const e of BURST) {
    assert.equal((await deliver(env, e)).status, 200);
  }
  const rec = await recordFor(env, "cs_1");
  assert.equal(rec.plan, "pro_yearly");
  assert.equal(rec.periodEnd, T + 365 * DAY);
  assert.equal(rec.periodPaymentId, "pi_1");
});

test("an event whose commit failed is processed on the retry, not dismissed as a duplicate", async () => {
  const env = d1Env();
  const real = env.DB.batch.bind(env.DB);
  let failed = false;
  env.DB.batch = async (statements) => {
    if (!failed && statements.some((s) => isCommitStatement(s))) {
      failed = true;
      throw new Error("D1_ERROR: Network connection lost.");
    }
    return real(statements);
  };
  const first = await deliverRaw(env, checkoutDone);
  assert.equal(first.status, 500, "the provider is told to retry");
  assert.equal(await recordFor(env, "cs_1"), null, "nothing was applied");
  const retry = await deliver(env, checkoutDone);
  assert.equal(retry.status, 200);
  assert.equal(retry.body.reason, undefined, "the retry is applied, not answered 'duplicate'");
  assert.equal((await recordFor(env, "cs_1")).status, "active");
  const again = await deliver(env, checkoutDone);
  assert.equal(again.body.reason, "duplicate", "and only once it is applied is the next delivery a duplicate");
});

test("a duplicate delivered while the first is failing is never acknowledged for work that did not happen", async () => {
  // Stripe redelivers while the first attempt is still running; the first
  // then fails. On KV the redelivery read the first attempt's marker and was
  // answered 200 "duplicate", so Stripe stopped retrying an event nothing had
  // applied (WH-2). On the ledger the marker is not visible until it commits
  // with its effect, so any 2xx means the effect is there.
  for (const store of ["d1", "kv"]) {
    const env = store === "d1" ? d1Env() : createTestEnv();
    let failFirst = true;
    if (store === "d1") {
      const real = env.DB.batch.bind(env.DB);
      env.DB.batch = async (statements) => {
        if (failFirst && statements.some((s) => isCommitStatement(s))) {
          failFirst = false;
          // The redelivery runs to completion while this commit is in flight.
          const second = await deliver(env, checkoutDone);
          env.secondAnswer = second;
          throw new Error("D1_ERROR: Network connection lost.");
        }
        return real(statements);
      };
    } else {
      const kv = env.ENTITLEMENTS;
      const real = kv.put.bind(kv);
      kv.put = async (key, value, options) => {
        if (failFirst && key.startsWith("lic:")) {
          failFirst = false;
          env.secondAnswer = await deliver(env, checkoutDone);
          throw new Error("KV PUT failed: 429 Too Many Requests");
        }
        return real(key, value, options);
      };
    }
    await deliverRaw(env, checkoutDone);
    const acknowledged = env.secondAnswer.status === 200;
    const applied = Boolean(await recordFor(env, "cs_1"));
    if (store === "d1") {
      assert.ok(!acknowledged || applied, "a 2xx for the event means its effect is in the ledger");
      assert.equal(applied, true, "the redelivery itself applied it");
    } else {
      assert.equal(acknowledged && !applied, true, "KV: acknowledged as a duplicate, never applied (the defect)");
    }
  }
});

/**
 * A store whose first read of `key` returns what was there, and then lets
 * `others` run to completion before the caller carries on: the caller read
 * before them and writes after them. `state.done` is shared across attempts,
 * so a ledger retry is not overtaken a second time.
 */
function overtaken(store, key, state, others) {
  return {
    async get(name) {
      const value = await store.get(name);
      if (name === key && !state.done) {
        state.done = true;
        await others();
      }
      return value;
    },
    put: (k, v, o) => store.put(k, v, o),
    delete: (k) => store.delete(k)
  };
}

test("a renewal paid while the previous month is refunded keeps the month just paid (KV ends it)", async () => {
  // Month 1 was paid with pi_1 and has just ended; the subscription has moved
  // on to month 2, whose invoice (pi_2) is paid at the moment an operator
  // refunds month 1. The refund reads the record first and writes last.
  const o = (now) => ({ now, idSecret: "s" });
  const base = { provider: "stripe", subscriptionId: "sub_q", customerId: "cus_q" };
  const P1 = T - 60;
  const P2 = P1 + 30 * DAY;
  const setUp = async (store) => {
    await upsertEntitlement(store, { ...base, claimId: "cs_q", status: "active", paid: true, plan: "pro_monthly", planSource: "price_id", periodEnd: P1, occurredAt: P1 - 30 * DAY }, o(P1 - 30 * DAY));
    await upsertEntitlement(store, { ...base, status: "active", paid: true, paymentId: "pi_1", periodEnd: P1, periodEndIsFloor: true, occurredAt: P1 - 30 * DAY }, o(P1 - 30 * DAY));
    await upsertEntitlement(store, { ...base, status: "active", periodEnd: P2, occurredAt: P1 }, o(P1));
  };
  const invoice = { ...base, status: "active", paid: true, paymentId: "pi_2", periodEnd: P2, periodEndIsFloor: true, occurredAt: T };
  const refund1 = { provider: "stripe", claimId: null, subscriptionId: null, paymentId: "pi_1", requireExisting: true, isReversal: true, reversedChargeAt: P1 - 30 * DAY, reversedAt: T, occurredAt: T };

  const env = d1Env();
  for (const step of [setUp]) {
    await runLedgerTransaction(env, step, NO_WAIT);
  }
  const reader = () => ledgerReader(env);
  const id = await getLicenseIdForClaim(reader(), "stripe", "cs_q");
  const state = { done: false };
  await runLedgerTransaction(env, (kv) => upsertEntitlement(
    overtaken(kv, `lic:${id}`, state, () => runLedgerTransaction(env, (other) => upsertEntitlement(other, invoice, o(T)), NO_WAIT)),
    refund1,
    o(T)
  ), NO_WAIT);
  const rec = await getEntitlement(reader(), id);
  assert.equal(rec.periodEnd, P2, "month 2 was paid; refunding month 1 does not end it");
  assert.equal(isTokenIssuable(rec, T + 60), true);

  const kv = createFakeKv();
  await setUp(kv);
  const kvId = await getLicenseIdForClaim(kv, "stripe", "cs_q");
  await upsertEntitlement(overtaken(kv, `lic:${kvId}`, { done: false }, () => upsertEntitlement(kv, invoice, o(T))), refund1, o(T));
  const kvRec = await getEntitlement(kv, kvId);
  assert.equal(isTokenIssuable(kvRec, T + 60), false, "KV: the paying customer is cut off (the defect)");
});

// --------------------------------------------------------- Mercado Pago token

let mpSeq = 0;
async function deliverMercadoPago(env, resource) {
  mpSeq += 1;
  const dataId = String(resource.id);
  const notification = { id: 9100 + mpSeq, type: "payment", action: "payment.updated", data: { id: dataId } };
  const ts = String(Math.floor(Date.now() / 1000));
  const requestId = `req-ledger-${mpSeq}`;
  const v1 = await hmacSha256Hex(env.MP_WEBHOOK_SECRET, buildMercadoPagoManifest({ dataId, requestId, ts }));
  const request = postJson("/v1/webhooks/mercadopago", JSON.stringify(notification), {
    "x-signature": `ts=${ts},v1=${v1}`,
    "x-request-id": requestId
  });
  const res = await worker.fetch(request, env);
  return { status: res.status, body: await res.json(), notification, requestId, ts, v1 };
}

test("a Mercado Pago notification that arrives before the access token is set is applied once it is", async () => {
  for (const make of [d1Env, createTestEnv]) {
    const env = make();
    const token = env.MP_ACCESS_TOKEN;
    env.MP_ACCESS_TOKEN = "";
    const payment = { id: 4242, status: "approved", date_approved: new Date(T * 1000).toISOString(), transaction_amount: 10, description: "Vocal Studio Pro mensual" };
    const first = await deliverMercadoPago(env, payment);
    assert.equal(first.status, 500, "an operator fault is retried, not acknowledged and dropped");

    env.MP_ACCESS_TOKEN = token;
    // Mercado Pago retries the same notification (same id, same request id).
    const raw = JSON.stringify(first.notification);
    const retry = await handleRequest(
      postJson("/v1/webhooks/mercadopago", raw, { "x-signature": `ts=${first.ts},v1=${first.v1}`, "x-request-id": first.requestId }),
      env,
      { ledger: NO_WAIT, fetchImpl: async () => ({ ok: true, status: 200, async json() { return payment; } }) }
    );
    const body = await retry.json();
    assert.notEqual(body.reason, "duplicate", "the retry is not dismissed");
    assert.equal(retry.status, 200);
    const id = await getLicenseIdForClaim(ledgerReader(env), "mercadopago", "4242");
    assert.ok(id, "and the payment is on the ledger");
  }
});

test("without D1 the KV path still handles a failed apply by dropping the marker", async () => {
  const env = createTestEnv({ ENTITLEMENTS: createFakeKv() });
  const kv = env.ENTITLEMENTS;
  const real = kv.put.bind(kv);
  let once = true;
  kv.put = async (key, value, options) => {
    if (once && key.startsWith("lic:")) {
      once = false;
      throw new Error("KV PUT failed: 500");
    }
    return real(key, value, options);
  };
  assert.equal((await deliverRaw(env, checkoutDone)).status, 500);
  assert.equal((await deliver(env, checkoutDone)).body.reason, undefined, "the retry is applied");
});

test("KV path too: a checkout overtaken after its index lookup merges into the record the others wrote", async () => {
  // The checkout looks up the subscription's index (absent), then the
  // subscription's own events are processed in full, then the checkout goes
  // on. It used to build a fresh record under the derived id and overwrite
  // theirs, turning a yearly subscriber into a monthly one; it now reads the
  // record under the derived id first.
  const env = createTestEnv();
  const kv = env.ENTITLEMENTS;
  const state = { done: false };
  const view = { ...env, ENTITLEMENTS: overtaken(kv, "sub:stripe:sub_1", state, async () => {
    assert.equal((await deliver(env, subCreated)).status, 200);
    assert.equal((await deliver(env, invoicePaid)).status, 200);
  }) };
  assert.equal((await deliver(view, checkoutDone)).status, 200);
  const rec = await recordFor(env, "cs_1");
  assert.equal(rec.plan, "pro_yearly");
  assert.equal(rec.periodPaymentId, "pi_1");
  assert.equal([...kv.store.keys()].filter((k) => k.startsWith("lic:")).length, 1, "still one license");
});
