/**
 * QA round 4 ("worker"): tests that kill the mutants the existing suite let survive.
 *
 * Every test names the behaviour it protects AND the wrong behaviour it must tell apart from it.
 * Expected values are written by hand (or signed with node:crypto), never computed by the code
 * under test. Run each against the mutant it targets with qa/round4/worker/mutate.py.
 *
 *   QS1 verifyMercadoPagoSignature accepts a timestamp from the FUTURE   (mutant M23)
 *   QS2 planFromAutoRecurring day-based / yearly recurrence is untested   (mutant M30)
 *   QS3 Stripe: a failed processing attempt must not swallow the retry    (mutant N11)
 *   QS4 a retried charge after a decline must keep its period when the
 *       subscription stops (record must keep the LATEST charge)           (mutant N24)
 *   QS5 Mercado Pago refused-resource retry window: 86399 s retry, 86400 s acknowledge (mutant N08)
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { handleRequest } from "../src/index.js";
import { planFromAutoRecurring, verifyMercadoPagoSignature } from "../src/mercadopago.js";
import { getEntitlement, upsertEntitlement } from "../src/store.js";
import { createFakeKv, createTestEnv } from "./fixtures.mjs";

const DAY = 86400;
const hmacHex = (secret, message) => createHmac("sha256", secret).update(message).digest("hex");

// --------------------------------------------------------------- QS1
test("QS1 MP signature: a timestamp is accepted within 300 s of now in BOTH directions, refused beyond", async () => {
  const NOW = 1_800_000_000;
  const secret = "mp_s1";
  // Hand-built manifest per the Mercado Pago docs; the signature never goes through the code under test.
  const verdict = async (ts) => {
    const v1 = hmacHex(secret, `id:1;request-id:r;ts:${ts};`);
    return verifyMercadoPagoSignature({ header: `ts=${ts},v1=${v1}`, dataId: "1", requestId: "r", secret, now: NOW });
  };
  assert.equal((await verdict(NOW)).ok, true, "control: a fresh timestamp passes");
  assert.equal((await verdict(NOW - 300)).ok, true, "300 s old is the last accepted second");
  assert.equal((await verdict(NOW + 300)).ok, true, "300 s ahead is the last accepted second (clock skew)");
  const old = await verdict(NOW - 301);
  assert.deepEqual([old.ok, old.reason], [false, "timestamp_out_of_tolerance"]);
  const future = await verdict(NOW + 301);
  assert.deepEqual([future.ok, future.reason], [false, "timestamp_out_of_tolerance"], "a signature dated in the future must not be replayable for ever");
  assert.equal((await verdict(NOW + 3600)).ok, false);
  // Mercado Pago may send milliseconds: same window.
  const ms = NOW * 1000;
  const v1 = hmacHex(secret, `id:1;request-id:r;ts:${ms + 3_600_000};`);
  const msFuture = await verifyMercadoPagoSignature({ header: `ts=${ms + 3_600_000},v1=${v1}`, dataId: "1", requestId: "r", secret, now: NOW });
  assert.equal(msFuture.ok, false);
});

// --------------------------------------------------------------- QS2
test("QS2 MP recurrence -> plan: days, months and years map to the plan that is billed", () => {
  const plan = (frequency, frequency_type) => planFromAutoRecurring({ frequency, frequency_type });
  assert.equal(plan(1, "months"), "pro_monthly");
  assert.equal(plan(12, "months"), "pro_yearly");
  assert.equal(plan(1, "years"), "pro_yearly");
  assert.equal(plan(7, "days"), "pro_monthly", "a weekly charge is not a year");
  assert.equal(plan(30, "days"), "pro_monthly");
  assert.equal(plan(365, "days"), "pro_yearly", "a 365-day charge is the yearly plan");
  assert.equal(plan(366, "days"), "pro_yearly");
  assert.equal(plan(1, "weeks"), null, "an unknown unit says nothing");
  assert.equal(planFromAutoRecurring(null), null);
});

// --------------------------------------------------------------- QS3
test("QS3 Stripe: processing that fails after the idempotency marker is set does not swallow Stripe's retry", async () => {
  const env = createTestEnv();
  const kv = env.ENTITLEMENTS;
  const put = kv.put.bind(kv);
  let outage = true;
  kv.put = async (key, value, options) => {
    if (outage && key.startsWith("lic:")) {
      outage = false; // one KV failure while writing the license, healthy afterwards
      throw new Error("KV put failed");
    }
    return put(key, value, options);
  };
  const raw = JSON.stringify({
    id: "evt_s3", type: "checkout.session.completed", created: 1_800_000_000,
    data: { object: { id: "cs_s3", mode: "payment", customer: "cus_s3", payment_status: "paid", metadata: { plan: "pro_monthly" } } }
  });
  const deliver = () => {
    const ts = Math.floor(Date.now() / 1000);
    return handleRequest(new Request("https://w.test/v1/webhooks/stripe", {
      method: "POST", body: raw,
      headers: { "Stripe-Signature": `t=${ts},v1=${hmacHex(env.STRIPE_WEBHOOK_SECRET, `${ts}.${raw}`)}` }
    }), env);
  };
  await assert.rejects(deliver(), /KV put failed/, "first delivery hits the outage");
  const keysAfterFailure = [...kv.store.keys()].filter((k) => k.startsWith("lic:")).length;
  assert.equal(keysAfterFailure, 0, "nothing was stored by the failed attempt");
  const retry = await deliver();
  assert.equal(retry.status, 200);
  const retryBody = await retry.json();
  assert.notEqual(retryBody.reason, "duplicate", "the retry must be processed, not dismissed as a replay");
  assert.equal([...kv.store.keys()].filter((k) => k.startsWith("lic:")).length, 1, "the retry created the license");
  const third = await (await deliver()).json();
  assert.equal(third.reason, "duplicate", "control: once it succeeded, a further delivery IS a duplicate");
});

// --------------------------------------------------------------- QS4
test("QS4 MP: a declined charge, then a retry that goes through, then a stop keeps the RETRY's period", async () => {
  const kv = createFakeKv();
  const T = 1_800_000_000;
  const base = { provider: "mercadopago", subscriptionId: "pa_s4", customerId: "9" };
  // charge 1 at day 0 (monthly)
  await upsertEntitlement(kv, { ...base, claimId: "p1", plan: "pro_monthly", planSource: "auto_recurring", status: "active", periodEndFromCharge: T, occurredAt: T });
  // the day-10 renewal is turned down
  await upsertEntitlement(kv, { ...base, claimId: "p2", declinedAt: T + 10 * DAY });
  // Mercado Pago retries on day 12 and it goes through
  const second = await upsertEntitlement(kv, { ...base, claimId: "p3", status: "active", periodEndFromCharge: T + 12 * DAY, occurredAt: T + 12 * DAY });
  // the customer cancels on day 15
  await upsertEntitlement(kv, { ...base, status: "canceled", occurredAt: T + 15 * DAY });
  const record = await getEntitlement(kv, second.record.licenseId);
  const MONTH = 31 * DAY; // the worker's documented monthly interval
  assert.equal(record.periodEnd, T + 12 * DAY + MONTH, "paid on day 12, keeps day 12 + 31 days");
  assert.notEqual(record.periodEnd, T + MONTH, "wrong behaviour: the period shrinks back to the first charge's (day 31)");
});

// --------------------------------------------------------------- QS5
test("QS5 MP: a resource the API refuses is retried (500) for 86399 s and acknowledged (200) at 86400 s", async () => {
  const env = createTestEnv();
  const secret = env.MP_WEBHOOK_SECRET;
  const answers = [];
  const N0 = 1_800_000_000;
  for (const at of [N0, N0 + 86399, N0 + 86400]) {
    const ts = String(Math.floor(Date.now() / 1000));
    const v1 = hmacHex(secret, `id:123456;request-id:r5;ts:${ts};`);
    const request = new Request("https://w.test/v1/webhooks/mercadopago?data.id=123456&type=payment", {
      method: "POST",
      body: JSON.stringify({ id: 42, type: "payment", action: "payment.updated", data: { id: "123456" } }),
      headers: { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": "r5" }
    });
    const response = await handleRequest(request, env, { now: at, fetchImpl: async () => ({ ok: false, status: 404 }) });
    answers.push(response.status);
  }
  assert.deepEqual(answers, [500, 500, 200]);
});
