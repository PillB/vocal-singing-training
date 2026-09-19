import test from "node:test";
import assert from "node:assert/strict";

import { hmacSha256Hex } from "../src/license.js";
import {
  HANDLED_EVENT_TYPES,
  isCheckoutSessionPaid,
  mapStripeEvent,
  mapStripeStatus,
  normalizePlanId,
  parseStripeSignatureHeader,
  planForSubscription,
  planFromInterval,
  planFromPriceId,
  verifyStripeSignature
} from "../src/stripe.js";

const SECRET = "whsec_unit_test_secret";
const NOW = 1770000000;

/**
 * Build a valid Stripe-Signature header for a body.
 * @param {string} rawBody Raw request body.
 * @param {{timestamp?: number, secret?: string, extra?: string[]}} [options] Options.
 * @returns {Promise<string>} Header value.
 */
async function signHeader(rawBody, options) {
  const opts = options || {};
  const timestamp = Number.isFinite(opts.timestamp) ? opts.timestamp : NOW;
  const signature = await hmacSha256Hex(opts.secret || SECRET, `${timestamp}.${rawBody}`);
  const parts = [`t=${timestamp}`, ...(opts.extra || []).map((v) => `v1=${v}`), `v1=${signature}`];
  return parts.join(",");
}

test("parseStripeSignatureHeader reads the timestamp and every v1", () => {
  const parsed = parseStripeSignatureHeader("t=123,v1=aa,v0=zz,v1=BB");
  assert.equal(parsed.timestamp, 123);
  assert.deepEqual(parsed.signatures, ["aa", "bb"]);
  assert.deepEqual(parseStripeSignatureHeader(""), { timestamp: null, signatures: [] });
  assert.deepEqual(parseStripeSignatureHeader("garbage"), { timestamp: null, signatures: [] });
});

test("a correctly signed body is accepted", async () => {
  const body = JSON.stringify({ id: "evt_1", type: "invoice.paid" });
  const header = await signHeader(body);
  const result = await verifyStripeSignature({ rawBody: body, header, secret: SECRET, now: NOW });
  assert.deepEqual(result, { ok: true });
});

test("a body accompanied by several v1 signatures is accepted when one matches", async () => {
  const body = JSON.stringify({ id: "evt_2" });
  const header = await signHeader(body, { extra: ["0".repeat(64), "f".repeat(64)] });
  const result = await verifyStripeSignature({ rawBody: body, header, secret: SECRET, now: NOW });
  assert.equal(result.ok, true);
});

test("a body with only wrong v1 signatures is rejected", async () => {
  const body = JSON.stringify({ id: "evt_3" });
  const header = `t=${NOW},v1=${"0".repeat(64)},v1=${"f".repeat(64)}`;
  const result = await verifyStripeSignature({ rawBody: body, header, secret: SECRET, now: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "signature_mismatch");
});

test("a mutated body no longer matches its signature", async () => {
  const body = JSON.stringify({ id: "evt_4", amount: 100 });
  const header = await signHeader(body);
  const result = await verifyStripeSignature({
    rawBody: JSON.stringify({ id: "evt_4", amount: 999 }),
    header,
    secret: SECRET,
    now: NOW
  });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "signature_mismatch");
});

test("a signature made with another secret is rejected", async () => {
  const body = JSON.stringify({ id: "evt_5" });
  const header = await signHeader(body, { secret: "whsec_other" });
  const result = await verifyStripeSignature({ rawBody: body, header, secret: SECRET, now: NOW });
  assert.equal(result.ok, false);
  assert.equal(result.reason, "signature_mismatch");
});

test("a stale or future timestamp is rejected even when the digest matches", async () => {
  const body = JSON.stringify({ id: "evt_6" });
  const stale = await signHeader(body, { timestamp: NOW - 301 });
  const staleResult = await verifyStripeSignature({ rawBody: body, header: stale, secret: SECRET, now: NOW });
  assert.equal(staleResult.ok, false);
  assert.equal(staleResult.reason, "timestamp_out_of_tolerance");

  const future = await signHeader(body, { timestamp: NOW + 301 });
  const futureResult = await verifyStripeSignature({ rawBody: body, header: future, secret: SECRET, now: NOW });
  assert.equal(futureResult.reason, "timestamp_out_of_tolerance");

  const edge = await signHeader(body, { timestamp: NOW - 300 });
  assert.equal((await verifyStripeSignature({ rawBody: body, header: edge, secret: SECRET, now: NOW })).ok, true);
});

test("missing pieces are refused with safe reasons", async () => {
  const body = "{}";
  assert.equal(
    (await verifyStripeSignature({ rawBody: body, header: "t=1", secret: SECRET, now: 1 })).reason,
    "missing_signature"
  );
  assert.equal(
    (await verifyStripeSignature({ rawBody: body, header: `v1=${"a".repeat(64)}`, secret: SECRET, now: NOW })).reason,
    "missing_timestamp"
  );
  assert.equal(
    (await verifyStripeSignature({ rawBody: body, header: "t=1,v1=aa", secret: "", now: 1 })).reason,
    "secret_not_configured"
  );
  assert.equal(
    (await verifyStripeSignature({ rawBody: undefined, header: "t=1,v1=aa", secret: SECRET, now: 1 })).reason,
    "missing_body"
  );
});

test("status mapping covers every Stripe subscription status we expect", () => {
  assert.equal(mapStripeStatus("active"), "active");
  assert.equal(mapStripeStatus("trialing"), "active");
  assert.equal(mapStripeStatus("past_due"), "past_due");
  assert.equal(mapStripeStatus("unpaid"), "past_due");
  // A subscription whose first payment never succeeded gets no grace.
  assert.equal(mapStripeStatus("incomplete"), "pending");
  assert.equal(mapStripeStatus("canceled"), "canceled");
  assert.equal(mapStripeStatus("incomplete_expired"), "canceled");
  assert.equal(mapStripeStatus("something_new"), "past_due");
});

test("plan mapping prefers price ids, then metadata, then the interval", () => {
  const env = { STRIPE_PRICE_PRO_MONTHLY: "price_m", STRIPE_PRICE_PRO_YEARLY: "price_y" };
  assert.equal(planFromPriceId("price_m", env), "pro_monthly");
  assert.equal(planFromPriceId("price_y", env), "pro_yearly");
  assert.equal(planFromPriceId("price_other", env), null);
  assert.equal(planFromInterval("month"), "pro_monthly");
  assert.equal(planFromInterval("month", 12), "pro_yearly");
  assert.equal(planFromInterval("year"), "pro_yearly");
  assert.equal(planFromInterval("week"), null);
  assert.equal(normalizePlanId("pro_yearly"), "pro_yearly");
  assert.equal(normalizePlanId("enterprise"), null);

  const byPrice = planForSubscription({ items: { data: [{ price: { id: "price_y" } }] } }, env);
  assert.deepEqual(byPrice, { plan: "pro_yearly", planSource: "price_id" });

  const byMetadata = planForSubscription(
    { metadata: { plan: "pro_yearly" }, items: { data: [{ price: { id: "price_unknown" } }] } },
    env
  );
  assert.deepEqual(byMetadata, { plan: "pro_yearly", planSource: "metadata" });

  const byInterval = planForSubscription(
    { items: { data: [{ price: { id: "price_x", recurring: { interval: "year" } } }] } },
    env
  );
  assert.deepEqual(byInterval, { plan: "pro_yearly", planSource: "interval" });

  assert.deepEqual(planForSubscription({}, env), { plan: "pro_monthly", planSource: "default" });
});

test("checkout.session.completed maps to an active entitlement keyed on the session", () => {
  const env = { STRIPE_PRICE_PRO_MONTHLY: "price_m" };
  const mapped = mapStripeEvent({
    id: "evt_10",
    type: "checkout.session.completed",
    data: {
      object: {
        id: "cs_test_123",
        customer: "cus_1",
        subscription: "sub_1",
        payment_status: "paid",
        metadata: { plan: "pro_yearly" }
      }
    }
  }, env);
  assert.equal(mapped.handled, true);
  assert.equal(mapped.update.claimId, "cs_test_123");
  assert.equal(mapped.update.subscriptionId, "sub_1");
  assert.equal(mapped.update.customerId, "cus_1");
  assert.equal(mapped.update.plan, "pro_yearly");
  assert.equal(mapped.update.status, "active");
  assert.equal(mapped.update.periodEnd, undefined);
});

test("a completed-but-unpaid session is pending, not active", () => {
  // Delayed payment methods complete the session before the money arrives.
  for (const object of [
    { id: "cs_2", payment_status: "unpaid", status: "complete" },
    { id: "cs_2", payment_status: "unpaid", status: "open" },
    { id: "cs_2", status: "complete" }
  ]) {
    const mapped = mapStripeEvent({ id: "evt_11", type: "checkout.session.completed", data: { object } }, {});
    assert.equal(mapped.update.status, "pending", JSON.stringify(object));
  }
  assert.equal(isCheckoutSessionPaid({ payment_status: "paid" }), true);
  assert.equal(isCheckoutSessionPaid({ payment_status: "no_payment_required" }), true);
  assert.equal(isCheckoutSessionPaid({ status: "complete" }), false);
  assert.equal(isCheckoutSessionPaid(null), false);
});

test("an async payment outcome settles a pending session either way", () => {
  const session = { id: "cs_async", subscription: "sub_async", payment_status: "paid" };
  const succeeded = mapStripeEvent({
    id: "evt_ok",
    type: "checkout.session.async_payment_succeeded",
    data: { object: session }
  }, {});
  assert.equal(succeeded.handled, true);
  assert.equal(succeeded.update.status, "active");
  assert.equal(succeeded.update.claimId, "cs_async");

  const failed = mapStripeEvent({
    id: "evt_no",
    type: "checkout.session.async_payment_failed",
    data: { object: { ...session, payment_status: "unpaid" } }
  }, {});
  assert.equal(failed.handled, true);
  assert.equal(failed.update.status, "canceled");
  assert.equal(HANDLED_EVENT_TYPES.includes("checkout.session.async_payment_succeeded"), true);
  assert.equal(HANDLED_EVENT_TYPES.includes("checkout.session.async_payment_failed"), true);
});

test("every mapped event carries the time it happened", () => {
  const mapped = mapStripeEvent({
    id: "evt_t",
    type: "customer.subscription.updated",
    created: 1770000123,
    data: { object: { id: "sub_t", status: "active" } }
  }, {});
  assert.equal(mapped.update.occurredAt, 1770000123);

  const undated = mapStripeEvent({
    id: "evt_u",
    type: "customer.subscription.updated",
    data: { object: { id: "sub_u", status: "active" } }
  }, {});
  assert.equal(undated.update.occurredAt, null);
});

test("subscription events map status, plan and period end", () => {
  const env = { STRIPE_PRICE_PRO_YEARLY: "price_y" };
  const subscription = {
    id: "sub_2",
    customer: "cus_2",
    status: "past_due",
    current_period_end: 1780000000,
    items: { data: [{ price: { id: "price_y", recurring: { interval: "year" } } }] }
  };
  const updated = mapStripeEvent({
    id: "evt_12",
    type: "customer.subscription.updated",
    data: { object: subscription }
  }, env);
  assert.equal(updated.update.status, "past_due");
  assert.equal(updated.update.plan, "pro_yearly");
  assert.equal(updated.update.subscriptionId, "sub_2");
  assert.equal(updated.update.periodEnd, 1780000000);

  const deleted = mapStripeEvent({
    id: "evt_13",
    type: "customer.subscription.deleted",
    data: { object: { ...subscription, status: "active" } }
  }, env);
  assert.equal(deleted.update.status, "canceled");
});

test("subscription period end is read from the item on the newer API shape", () => {
  const mapped = mapStripeEvent({
    id: "evt_14",
    type: "customer.subscription.updated",
    data: {
      object: {
        id: "sub_3",
        status: "active",
        items: { data: [{ current_period_end: 1781111111, price: { recurring: { interval: "month" } } }] }
      }
    }
  }, {});
  assert.equal(mapped.update.periodEnd, 1781111111);
  assert.equal(mapped.update.plan, "pro_monthly");
});

test("invoice.paid renews and invoice.payment_failed dunning-flags the same subscription", () => {
  const paid = mapStripeEvent({
    id: "evt_15",
    type: "invoice.paid",
    data: {
      object: {
        id: "in_1",
        customer: "cus_3",
        subscription: "sub_4",
        lines: { data: [{ price: { id: "price_m" }, period: { end: 1790000000 } }] }
      }
    }
  }, { STRIPE_PRICE_PRO_MONTHLY: "price_m" });
  assert.equal(paid.update.status, "active");
  assert.equal(paid.update.subscriptionId, "sub_4");
  assert.equal(paid.update.plan, "pro_monthly");
  assert.equal(paid.update.periodEnd, 1790000000);

  const failed = mapStripeEvent({
    id: "evt_16",
    type: "invoice.payment_failed",
    data: {
      object: {
        id: "in_2",
        parent: { subscription_details: { subscription: "sub_4" } },
        lines: { data: [{}] }
      }
    }
  }, {});
  assert.equal(failed.update.status, "past_due");
  assert.equal(failed.update.subscriptionId, "sub_4");
  assert.equal(failed.update.plan, undefined, "unknown plan must not clobber the stored one");
});

test("events we cannot key onto a license are acknowledged but not applied", () => {
  assert.equal(mapStripeEvent({ id: "e", type: "customer.created", data: { object: {} } }, {}).handled, false);
  assert.equal(mapStripeEvent({ id: "e", type: "invoice.paid", data: { object: { lines: { data: [] } } } }, {}).reason, "no_license_identity");
  assert.equal(mapStripeEvent(null, {}).reason, "malformed_event");
  assert.equal(mapStripeEvent({ id: "e", type: "invoice.paid" }, {}).reason, "missing_object");
});
