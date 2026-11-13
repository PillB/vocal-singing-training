/**
 * Creem, the merchant-of-record rail.
 *
 * Creem is what the international side is actually to be sold on: it sells to
 * the customer in its own name and pays us, so it needs no company in the
 * customer's country, and a Peru-registered seller cannot be a Stripe merchant
 * at all. That makes this handler the one that will see real money, and the
 * Stripe one the fallback for a seller who can hold a Stripe account.
 *
 * What these tests pin, and why each one is a way to lose money or to take
 * access from somebody who paid:
 *   - the signature: over the raw bytes, and no timestamp to lean on, so the
 *     event marker is the whole of the replay defence;
 *   - the two time formats in one payload, which a thousand-fold unit error
 *     would turn into a period ending in 1970 or in the year 56000;
 *   - the transaction id as the payment identity, which is what lets a refund
 *     say whether it is the payment that bought the period held;
 *   - a dispute, which carries no status at all, so there is no inquiry to
 *     mistake for a chargeback and none to invent;
 *   - a partial refund, which must not end access;
 *   - a product that is not ours, which must not entitle;
 *   - and a checkout whose subscription events never arrive, which must sell a
 *     month rather than a lifetime.
 *
 * Everything runs through the real router and the real signature check.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { handleRequest } from "../src/index.js";
import {
  HANDLED_CREEM_EVENT_TYPES,
  epochSeconds,
  isFullCreemRefund,
  isoSeconds,
  mapCreemEvent,
  mapCreemStatus,
  planForProduct,
  planFromBillingPeriod,
  verifyCreemSignature
} from "../src/creem.js";
import { getEntitlement, getLicenseIdForClaim } from "../src/store.js";
import { createFakeKv, createTestEnv } from "./fixtures.mjs";

const DAY = 86400;
const T = Math.floor(Date.now() / 1000);

const hmacHex = (secret, message) => createHmac("sha256", secret).update(message).digest("hex");

/** A fresh env with its own KV, so no test can see another's keys. */
const freshEnv = (extra) => createTestEnv({ ENTITLEMENTS: createFakeKv(), ...(extra || {}) });

/** The ISO 8601 string Creem writes a subscription's dates as. */
const iso = (days) => new Date((T + days * DAY) * 1000).toISOString();

/** The epoch milliseconds Creem writes an envelope's date as. */
const ms = (days) => (T + days * DAY) * 1000;

/**
 * Deliver one signed Creem event to the real webhook route.
 * @param {Object} env Worker env.
 * @param {string} id Event id.
 * @param {string} eventType Creem event type.
 * @param {number} atDays Days after T the event was emitted.
 * @param {Object} object The event's object.
 * @param {{signature?: string, now?: number}} [options] Overrides.
 * @returns {Promise<Response>} The worker's answer.
 */
function deliver(env, id, eventType, atDays, object, options) {
  const raw = JSON.stringify({ id, eventType, created_at: ms(atDays), object });
  const signature = (options && options.signature) !== undefined
    ? options.signature
    : hmacHex(env.CREEM_WEBHOOK_SECRET, raw);
  const request = new Request("https://w.test/v1/webhooks/creem", {
    method: "POST",
    body: raw,
    headers: { "creem-signature": signature }
  });
  return handleRequest(request, env, options);
}

/**
 * Ask /v1/claim for a checkout, as the browser does on the way back.
 * @param {Object} env Worker env.
 * @param {string} checkoutId Creem checkout id.
 * @param {number} atDays Days after T to pretend it is.
 * @returns {Promise<number>} The status.
 */
async function claim(env, checkoutId, atDays) {
  const real = Date.now;
  Date.now = () => (T + atDays * DAY) * 1000;
  try {
    const response = await handleRequest(
      new Request("https://w.test/v1/claim", {
        method: "POST",
        body: JSON.stringify({ provider: "creem", sessionId: checkoutId }),
        headers: { "content-type": "application/json" }
      }),
      env
    );
    return response.status;
  } finally {
    Date.now = real;
  }
}

/** A completed subscription checkout, as Creem sends it. */
const checkout = (id, subscriptionId, over) => ({
  id,
  object: "checkout",
  status: "completed",
  mode: "prod",
  request_id: null,
  order: {
    id: "ord_1",
    amount: 1000,
    currency: "USD",
    status: "paid",
    type: "recurring",
    // The same transaction the first subscription.paid names. Creem's checkout
    // order and that first invoice ARE one payment, and a fixture that gave
    // them two ids was what made an inferred claim look like it had to be
    // transferable between payments (QA round 8, CR12).
    transaction: "tran_1"
  },
  product: { id: "prod_monthly", name: "Pro Monthly", billing_type: "recurring", billing_period: "every-month" },
  customer: { id: "cust_1", email: "singer@example.com" },
  subscription: { id: subscriptionId, object: "subscription", status: "active" },
  metadata: {},
  ...(over || {})
});

/** A subscription event's object. */
const subscription = (id, status, endDays, over) => ({
  id,
  object: "subscription",
  status,
  mode: "prod",
  collection_method: "charge_automatically",
  product: { id: "prod_monthly", name: "Pro Monthly", billing_period: "every-month" },
  customer: { id: "cust_1", email: "singer@example.com" },
  items: [{ id: "sitem_1", product_id: "prod_monthly", units: 1 }],
  current_period_start_date: iso(endDays - 31),
  current_period_end_date: iso(endDays),
  canceled_at: null,
  ...(over || {})
});

/** A paid subscription event, which is the one that names the money. */
const paid = (id, transactionId, endDays, atDays, over) => subscription(id, "active", endDays, {
  last_transaction_id: transactionId,
  last_transaction: { id: transactionId, amount: 1000, amount_paid: 1000, status: "paid" },
  last_transaction_date: iso(atDays),
  next_transaction_date: iso(endDays),
  ...(over || {})
});

/** A refund, in full unless told otherwise. */
const refund = (id, transactionId, subscriptionId, atDays, over) => ({
  id,
  object: "refund",
  status: "succeeded",
  mode: "prod",
  refund_amount: 1000,
  refund_currency: "USD",
  reason: "requested_by_customer",
  transaction: { id: transactionId, amount: 1000, amount_paid: 1000, status: "refunded" },
  subscription: { id: subscriptionId, status: "canceled" },
  checkout: { id: "ch_1" },
  order: { id: "ord_1", transaction: transactionId },
  customer: { id: "cust_1" },
  created_at: ms(atDays),
  ...(over || {})
});

/** A dispute. It carries no status and no reason; that is the point. */
const dispute = (id, transactionId, subscriptionId, atDays) => ({
  id,
  object: "dispute",
  mode: "prod",
  amount: 1000,
  currency: "USD",
  transaction: { id: transactionId, status: "chargeback" },
  subscription: { id: subscriptionId, status: "active" },
  checkout: { id: "ch_1" },
  order: { id: "ord_1", transaction: transactionId },
  customer: { id: "cust_1" },
  created_at: ms(atDays)
});

/* ---------------------------------------------------------------- signature */

test("the signature is over the raw bytes, and a re-serialized body does not match", async () => {
  const secret = "creem_test_secret";
  const raw = '{"id":"evt_1","eventType":"checkout.completed","created_at":1728734325927}';
  assert.deepEqual(
    await verifyCreemSignature({ rawBody: raw, header: hmacHex(secret, raw), secret }),
    { ok: true }
  );
  // The same object, serialized again: the keys are in the same order and one
  // space differs. A body re-built from the parsed JSON is a different message.
  const reserialized = JSON.stringify(JSON.parse(raw), null, 1);
  assert.equal(
    (await verifyCreemSignature({ rawBody: reserialized, header: hmacHex(secret, raw), secret })).ok,
    false
  );
});

test("a missing secret refuses the webhook rather than trusting the body", async () => {
  for (const [input, reason] of [
    [{ rawBody: "{}", header: "a".repeat(64), secret: "" }, "secret_not_configured"],
    [{ rawBody: "{}", header: "a".repeat(64) }, "secret_not_configured"],
    [{ rawBody: undefined, header: "a", secret: "s" }, "missing_body"],
    [{ rawBody: "{}", header: "", secret: "s" }, "missing_signature"],
    [{ rawBody: "{}", header: "  ", secret: "s" }, "missing_signature"],
    [{ rawBody: "{}", header: "b".repeat(64), secret: "s" }, "signature_mismatch"]
  ]) {
    assert.deepEqual(await verifyCreemSignature(input), { ok: false, reason });
  }
});

test("the signature is read case-insensitively and with whitespace around it", async () => {
  const secret = "s";
  const raw = '{"a":1}';
  const expected = hmacHex(secret, raw);
  for (const header of [expected, expected.toUpperCase(), ` ${expected} `]) {
    assert.deepEqual(await verifyCreemSignature({ rawBody: raw, header, secret }), { ok: true });
  }
});

test("the route refuses a body signed with the wrong secret and writes nothing", async () => {
  const env = freshEnv();
  const response = await deliver(env, "evt_x", "checkout.completed", 0, checkout("ch_x", "sub_x"), {
    signature: hmacHex("not_the_secret", "{}")
  });
  assert.equal(response.status, 400);
  assert.equal([...env.ENTITLEMENTS.store.keys()].length, 0, "nothing was stored");
});

test("a replayed event is acknowledged once and applied once", async () => {
  // Creem's signature carries no timestamp, so a captured body verifies for
  // ever and this marker is the whole of the replay defence. An automatic
  // retry keeps the event id, which is exactly what it wants.
  const env = freshEnv();
  assert.equal((await deliver(env, "evt_r", "checkout.completed", 0, checkout("ch_r", "sub_r"))).status, 200);
  const again = await deliver(env, "evt_r", "checkout.completed", 0, checkout("ch_r", "sub_r"));
  assert.equal(again.status, 200);
  assert.equal((await again.json()).reason, "duplicate");
});

test("a replay cannot buy time, because no period is ever counted from now", async () => {
  // The marker lives 30 days. What makes that enough is that every instant in
  // an update comes out of the body: a replay sets the period it set the first
  // time, however long afterwards it arrives.
  const env = freshEnv();
  await deliver(env, "evt_p1", "checkout.completed", 0, checkout("ch_p", "sub_p"));
  await deliver(env, "evt_p2", "subscription.paid", 0, paid("sub_p", "tran_1", 31, 0));
  const licenseId = await getLicenseIdForClaim(env.ENTITLEMENTS, "creem", "ch_p");
  const before = (await getEntitlement(env.ENTITLEMENTS, licenseId)).periodEnd;
  // The same body, a year later, with the marker long gone: a new event id,
  // because that is what a manual resend from the dashboard gets.
  await deliver(env, "evt_p3", "subscription.paid", 0, paid("sub_p", "tran_1", 31, 0));
  assert.equal((await getEntitlement(env.ENTITLEMENTS, licenseId)).periodEnd, before);
});

/* ------------------------------------------------------------------- clocks */

test("milliseconds and seconds are told apart by magnitude, not by a field name", () => {
  // Creem sends epoch milliseconds on an envelope and ISO strings on a
  // subscription. Reading one as the other is a thousand-fold error in a date
  // that decides access: 1970, or the year 56000.
  assert.equal(epochSeconds(1728734325927), 1728734325);
  assert.equal(epochSeconds(1728734325), 1728734325, "seconds, if Creem ever sends them");
  assert.equal(epochSeconds("1728734325927"), 1728734325, "a string of digits is a number");
  for (const value of [0, -1, 1000, 999999999, null, undefined, "", "soon", NaN, {}]) {
    assert.equal(epochSeconds(value), null, `${JSON.stringify(value)} is not a date`);
  }
});

test("a subscription's ISO dates are parsed, and nothing else is", () => {
  assert.equal(isoSeconds("2024-10-12T11:58:38.000Z"), 1728734318);
  for (const value of [null, undefined, "", 1728734325927, "not a date", {}]) {
    assert.equal(isoSeconds(value), null);
  }
});

/* -------------------------------------------------------------------- plans */

test("a product id names the plan, then metadata, then the billing period", () => {
  const env = { CREEM_PRODUCT_PRO_MONTHLY: "prod_m", CREEM_PRODUCT_PRO_YEARLY: "prod_y" };
  assert.deepEqual(planForProduct({ id: "prod_y" }, null, env), { plan: "pro_yearly", planSource: "product_id" });
  assert.deepEqual(
    planForProduct({ id: "prod_other" }, { plan: "pro_yearly" }, env),
    { plan: undefined, planSource: "unlisted_product", unlisted: true },
    "the allow-list outranks metadata: a buyer can write metadata into a Creem payment link"
  );
  assert.deepEqual(
    planForProduct({ id: "prod_other" }, { plan: "pro_yearly" }, {}),
    { plan: "pro_yearly", planSource: "metadata" },
    "control: with no table to check against, metadata names the plan"
  );
  assert.deepEqual(
    planForProduct({ id: "prod_other" }, null, env),
    { plan: undefined, planSource: "unlisted_product", unlisted: true },
    "a product that is not ours names no plan"
  );
  assert.deepEqual(
    planForProduct({ id: "prod_other", billing_period: "every-year" }, null, {}),
    { plan: "pro_yearly", planSource: "billing_period" },
    "with no table written down, the product's own period answers"
  );
  assert.deepEqual(planForProduct(null, null, {}), { plan: "pro_monthly", planSource: "default" });
});

test("a billing period nobody recognised reads as monthly, which is the short answer", () => {
  assert.equal(planFromBillingPeriod("every-year"), "pro_yearly");
  assert.equal(planFromBillingPeriod("annual"), "pro_yearly");
  assert.equal(planFromBillingPeriod("every-month"), "pro_monthly");
  assert.equal(planFromBillingPeriod("every-3-months"), "pro_monthly", "a quarter counted as a month");
  assert.equal(planFromBillingPeriod("every-14-days"), "pro_monthly");
  assert.equal(planFromBillingPeriod("forever"), null);
  assert.equal(planFromBillingPeriod(""), null);
});

test("a status Creem adds later never entitles until we know what it means", () => {
  assert.equal(mapCreemStatus("active"), "active");
  assert.equal(mapCreemStatus("trialing"), "active");
  assert.equal(mapCreemStatus("scheduled_cancel"), "active", "paid through the period it is in");
  assert.equal(mapCreemStatus("past_due"), "past_due");
  assert.equal(mapCreemStatus("unpaid"), "suspended");
  assert.equal(mapCreemStatus("paused"), "suspended");
  assert.equal(mapCreemStatus("canceled"), "canceled");
  assert.equal(mapCreemStatus("expired"), "canceled");
  assert.equal(mapCreemStatus("something_new"), "suspended");
  assert.equal(mapCreemStatus(undefined), "suspended");
});

/* ------------------------------------------------------------- the happy way */

test("a checkout and its paid event give Pro for the period Creem named", async () => {
  const env = freshEnv();
  assert.equal(await claim(env, "ch_1", 0), 202, "nothing has arrived yet");
  await deliver(env, "evt_1", "checkout.completed", 0, checkout("ch_1", "sub_1"));
  assert.equal(await claim(env, "ch_1", 1), 200);
  await deliver(env, "evt_2", "subscription.paid", 0, paid("sub_1", "tran_1", 31, 0));
  assert.equal(await claim(env, "ch_1", 30), 200);
  assert.equal(await claim(env, "ch_1", 32), 403, "and it ends when the period does");
});

test("a checkout whose subscription events never arrive sells a month, not a lifetime", async () => {
  // The bound that exists because a webhook endpoint configured for one event
  // type, or a secret rotated between two, sold one month and gave Pro for
  // life on the Stripe side (QA round 4, QA-W-05).
  const env = freshEnv();
  await deliver(env, "evt_1", "checkout.completed", 0, {
    ...checkout("ch_2", "sub_2"),
    subscription: "sub_2"
  });
  assert.equal(await claim(env, "ch_2", 10), 200);
  assert.equal(await claim(env, "ch_2", 40), 403, "a month after the checkout, and no further");
});

test("a yearly product's checkout is bounded to a year, not to a month", async () => {
  const env = freshEnv({ CREEM_PRODUCT_PRO_YEARLY: "prod_yearly" });
  await deliver(env, "evt_1", "checkout.completed", 0, {
    ...checkout("ch_3", "sub_3"),
    subscription: "sub_3",
    product: { id: "prod_yearly", billing_period: "every-year" }
  });
  assert.equal(await claim(env, "ch_3", 200), 200);
  assert.equal(await claim(env, "ch_3", 400), 403);
});

test("a paid event's period only ever lengthens, so a late renewal cannot lose a month", async () => {
  // The fault this prevents cost a Stripe customer a month they had paid for
  // (QA round 5, D2): a reversal capped the period, and the renewal that
  // should have carried access past it arrived stamped earlier and was thrown
  // away as an older world.
  const env = freshEnv();
  await deliver(env, "evt_1", "checkout.completed", 0, checkout("ch_4", "sub_4"));
  await deliver(env, "evt_2", "subscription.paid", 31, paid("sub_4", "tran_2", 62, 31));
  // Month one's paid event, delivered after month two's: older, and still a
  // statement that a period was paid for.
  await deliver(env, "evt_3", "subscription.paid", 0, paid("sub_4", "tran_1", 31, 0));
  assert.equal(await claim(env, "ch_4", 50), 200, "month two stands");
});

// Reversed on 2026-11-03, and the old expectation is worth stating so nobody
// restores it by accident: this used to assert 403, on the ground that a state
// event is the subscription's own current answer and a downgrade should shorten
// the period. Nothing Creem documents makes an active subscription's period end
// move backwards, while a snapshot serialised before the period rolled over
// does exactly that (the silence behind VG-53), so the old rule was a way for a
// stale snapshot to take a month somebody had paid for. The reasoning is at
// `periodEndIsFloor` in src/creem.js; the shortening paths that remain are
// below.
test("a state event cannot shorten a month that was paid for, whatever period its snapshot names", async () => {
  const env = freshEnv();
  await deliver(env, "evt_1", "checkout.completed", 0, checkout("ch_5", "sub_5"));
  await deliver(env, "evt_2", "subscription.paid", 0, paid("sub_5", "tran_1", 62, 0));
  assert.equal(await claim(env, "ch_5", 50), 200);
  await deliver(env, "evt_3", "subscription.update", 1, subscription("sub_5", "active", 40));
  assert.equal(await claim(env, "ch_5", 50), 200, "they paid through day 62");
  assert.equal(await claim(env, "ch_5", 63), 403, "and no further than that");
});

test("a state event still lengthens a period, which is the whole point of listening to it", async () => {
  const env = freshEnv();
  await deliver(env, "evt_1", "checkout.completed", 0, checkout("ch_5b", "sub_5b"));
  await deliver(env, "evt_2", "subscription.paid", 0, paid("sub_5b", "tran_1", 31, 0));
  assert.equal(await claim(env, "ch_5b", 40), 403);
  await deliver(env, "evt_3", "subscription.update", 1, subscription("sub_5b", "active", 62));
  assert.equal(await claim(env, "ch_5b", 40), 200, "the subscription now runs to day 62");
});

test("a trialing subscription entitles and a paused one does not", async () => {
  const env = freshEnv();
  await deliver(env, "evt_1", "checkout.completed", 0, checkout("ch_6", "sub_6"));
  await deliver(env, "evt_2", "subscription.trialing", 0, subscription("sub_6", "trialing", 14));
  assert.equal(await claim(env, "ch_6", 5), 200);
  await deliver(env, "evt_3", "subscription.paused", 1, subscription("sub_6", "paused", 14));
  assert.equal(await claim(env, "ch_6", 5), 402, "suspended: a payment could still bring it back");
});

test("a cancelled subscription keeps the period it paid for, and an expired one does not come back", async () => {
  const env = freshEnv();
  await deliver(env, "evt_1", "checkout.completed", 0, checkout("ch_7", "sub_7"));
  await deliver(env, "evt_2", "subscription.paid", 0, paid("sub_7", "tran_1", 31, 0));
  await deliver(env, "evt_3", "subscription.canceled", 5, subscription("sub_7", "canceled", 31, {
    canceled_at: iso(31)
  }));
  assert.equal(await claim(env, "ch_7", 20), 200, "they paid for this month");
  await deliver(env, "evt_4", "subscription.expired", 32, subscription("sub_7", "expired", 31, {
    canceled_at: iso(31)
  }));
  assert.equal(await claim(env, "ch_7", 33), 403);
  // Creem does not revive an expired subscription: a new purchase is a new
  // subscription with a new id, so nothing after this may lift it.
  await deliver(env, "evt_5", "subscription.paid", 33, paid("sub_7", "tran_2", 62, 33));
  assert.equal(await claim(env, "ch_7", 40), 403, "an expired subscription stays expired");
});

/* ---------------------------------------------------------- money going back */

test("a full refund of the transaction that bought the period ends it", async () => {
  const env = freshEnv();
  await deliver(env, "evt_1", "checkout.completed", 0, checkout("ch_8", "sub_8"));
  await deliver(env, "evt_2", "subscription.paid", 0, paid("sub_8", "tran_1", 31, 0));
  assert.equal(await claim(env, "ch_8", 10), 200);
  await deliver(env, "evt_3", "refund.created", 12, refund("ref_1", "tran_1", "sub_8", 12));
  assert.equal(await claim(env, "ch_8", 13), 403);
});

test("the refund of an earlier month leaves a later paid month alone", async () => {
  // The whole reason the transaction id is carried: identity answers this
  // without working out from dates which payment bought the period.
  const env = freshEnv();
  await deliver(env, "evt_1", "checkout.completed", 0, checkout("ch_9", "sub_9"));
  await deliver(env, "evt_2", "subscription.paid", 0, paid("sub_9", "tran_1", 31, 0));
  await deliver(env, "evt_3", "subscription.paid", 31, paid("sub_9", "tran_2", 62, 31));
  await deliver(env, "evt_4", "refund.created", 40, refund("ref_1", "tran_1", "sub_9", 40));
  assert.equal(await claim(env, "ch_9", 41), 200, "month two was bought by a different transaction");
  await deliver(env, "evt_5", "refund.created", 42, refund("ref_2", "tran_2", "sub_9", 42));
  assert.equal(await claim(env, "ch_9", 43), 403, "and its own refund ends it");
});

test("a partial refund is a goodwill gesture and does not end access", async () => {
  const env = freshEnv();
  await deliver(env, "evt_1", "checkout.completed", 0, checkout("ch_10", "sub_10"));
  await deliver(env, "evt_2", "subscription.paid", 0, paid("sub_10", "tran_1", 31, 0));
  const response = await deliver(env, "evt_3", "refund.created", 5, refund("ref_1", "tran_1", "sub_10", 5, {
    refund_amount: 400,
    transaction: { id: "tran_1", amount: 1000, amount_paid: 1000, status: "partially_refunded" }
  }));
  assert.equal(response.status, 200);
  assert.equal((await response.json()).reason, "partial_refund");
  assert.equal(await claim(env, "ch_10", 10), 200);
});

test("an amount nobody can read is not a full refund", () => {
  // Taking paid access away on an unreadable number is the wrong direction to
  // be wrong in, so the answer is no.
  assert.equal(isFullCreemRefund({ refund_amount: 1000, transaction: { amount_paid: 1000 } }), true);
  assert.equal(isFullCreemRefund({ refund_amount: 1200, transaction: { amount_paid: 1000 } }), true);
  assert.equal(isFullCreemRefund({ refund_amount: 999, transaction: { amount_paid: 1000 } }), false);
  assert.equal(isFullCreemRefund({ refund_amount: 1000, transaction: { amount: 1000 } }), true);
  assert.equal(isFullCreemRefund({ refund_amount: 1000 }), false, "no transaction at all");
  assert.equal(isFullCreemRefund({ refund_amount: 1000, transaction: {} }), false);
  assert.equal(isFullCreemRefund({ transaction: { amount_paid: 1000 } }), false);
  assert.equal(isFullCreemRefund({ refund_amount: 1000, transaction: { amount_paid: 0 } }), false);
});

test("money that went back in two halves is money that went back", async () => {
  // Each refund alone is partial, so comparing THIS refund's amount with what
  // was paid says "goodwill gesture" twice and leaves a fully refunded month
  // running. The transaction's own running total is what sees it.
  const env = freshEnv();
  await deliver(env, "evt_1", "checkout.completed", 0, checkout("ch_h1", "sub_h1"));
  await deliver(env, "evt_2", "subscription.paid", 0, paid("sub_h1", "tran_1", 31, 0));
  const first = await deliver(env, "evt_3", "refund.created", 5, refund("ref_1", "tran_1", "sub_h1", 5, {
    refund_amount: 500,
    transaction: { id: "tran_1", amount: 1000, amount_paid: 1000, status: "partialRefund", refunded_amount: 500 }
  }));
  assert.equal((await first.json()).reason, "partial_refund", "half the money is half the money");
  assert.equal(await claim(env, "ch_h1", 6), 200);
  await deliver(env, "evt_4", "refund.created", 6, refund("ref_2", "tran_1", "sub_h1", 6, {
    refund_amount: 500,
    transaction: { id: "tran_1", amount: 1000, amount_paid: 1000, status: "partialRefund", refunded_amount: 1000 }
  }));
  assert.equal(await claim(env, "ch_h1", 7), 403, "and two halves are the whole of it");
});

test("a refund quoted without the tax the customer paid is still the whole of it", async () => {
  // Creem's own documented example pays 1210 for a 1000 product: 1000 of tax
  // exclusive price and 210 of tax. A refund quoted at 1000 of that is the
  // entire sale, and every amount rule reads it as 83% of one.
  const env = freshEnv();
  await deliver(env, "evt_1", "checkout.completed", 0, checkout("ch_h2", "sub_h2"));
  await deliver(env, "evt_2", "subscription.paid", 0, paid("sub_h2", "tran_1", 31, 0));
  await deliver(env, "evt_3", "refund.created", 5, refund("ref_1", "tran_1", "sub_h2", 5, {
    refund_amount: 1000,
    transaction: {
      id: "tran_1", amount: 1000, amount_paid: 1210, tax_amount: 210,
      status: "refunded", refunded_amount: 1000
    }
  }));
  assert.equal(await claim(env, "ch_h2", 6), 403, "Creem said refunded; the arithmetic did not");
});

test("the status Creem documents for a part refund is read as one", () => {
  // The enum is partialRefund. An earlier fixture here said
  // "partially_refunded", which is nobody's spelling, so the test passed for
  // the wrong reason: no status matched, and the amounts carried it.
  const paidSoFar = (status, refunded) => isFullCreemRefund({
    refund_amount: 400,
    transaction: { id: "t", amount: 1000, amount_paid: 1000, status, refunded_amount: refunded }
  });
  assert.equal(paidSoFar("partialRefund", 400), false);
  assert.equal(paidSoFar("partialRefund", 1000), true, "the total outranks the label");
  assert.equal(paidSoFar("refunded", 400), true, "and the label outranks the amounts");
  assert.equal(paidSoFar("paid", 400), false);
  assert.equal(paidSoFar("chargedBack", 400), false, "a chargeback arrives as a dispute, not a refund");
});

test("the transaction's running total is read, not only this refund's amount", () => {
  const t = (over) => isFullCreemRefund({ refund_amount: 10, transaction: { amount_paid: 1000, ...over } });
  assert.equal(t({ refunded_amount: 1000 }), true);
  assert.equal(t({ refunded_amount: 1001 }), true, "rounding up is still all of it");
  assert.equal(t({ refunded_amount: 999 }), false);
  assert.equal(t({}), false, "no total and a small refund is a small refund");
  assert.equal(t({ refunded_amount: "many" }), false, "an unreadable total is not a full refund");
  assert.equal(t({ refunded_amount: null }), false);
});

test("a test-mode purchase buys nothing, because no money moved", async () => {
  // Creem test mode charges nobody. If a test event can reach the live
  // endpoint with a valid signature, honouring it is Pro for free.
  const env = freshEnv();
  const response = await deliver(env, "evt_1", "checkout.completed", 0,
    checkout("ch_m1", "sub_m1", { mode: "test" }));
  assert.equal(response.status, 200, "acknowledged, so Creem stops retrying");
  assert.equal((await response.json()).reason, "test_mode");
  // 202 is "no license for this checkout yet", which is what the browser gets
  // while it waits — and here it never stops being true.
  assert.equal(await claim(env, "ch_m1", 1), 202, "and nothing was written");
  assert.equal(env.ENTITLEMENTS.writes, 1, "only the event id was recorded");
  for (const mode of ["sandbox", "local", "TEST", " Sandbox "]) {
    const r = await deliver(env, `evt_${mode.trim()}`, "checkout.completed", 0,
      checkout(`ch_${mode.trim()}`, "sub_m1", { mode }));
    assert.equal((await r.json()).reason, "test_mode", mode);
  }
});

test("and the operator can switch test mode on to prove the rail works", async () => {
  const env = freshEnv({ CREEM_ALLOW_TEST_MODE: "true" });
  await deliver(env, "evt_1", "checkout.completed", 0, checkout("ch_m2", "sub_m2", { mode: "test" }));
  await deliver(env, "evt_2", "subscription.paid", 0, paid("sub_m2", "tran_1", 31, 0, { mode: "test" }));
  assert.equal(await claim(env, "ch_m2", 1), 200);
});

test("a mode this worker has never heard of still entitles", async () => {
  // Refusing an unknown mode would mean a production value Creem renames stops
  // every real payment, silently, until somebody notices no licences are being
  // issued. Only the three documented non-production names are refused.
  const env = freshEnv();
  await deliver(env, "evt_1", "checkout.completed", 0, checkout("ch_m3", "sub_m3", { mode: "live" }));
  assert.equal(await claim(env, "ch_m3", 1), 200, "a renamed live mode");
  await deliver(env, "evt_2", "checkout.completed", 0, checkout("ch_m4", "sub_m4", { mode: undefined }));
  assert.equal(await claim(env, "ch_m4", 1), 200, "and an event that does not say");
});

test("a period the subscription moved before its invoice arrived is claimed by the invoice that paid for it", async () => {
  // A state event replaces the period end and says nothing about money, so it
  // leaves month one's payment id in place over a period month one did not buy.
  // The paid event that follows lengthens nothing, and has to be able to take
  // the claim — or the refund of month one ends month two. (This is the shape
  // the first version of the identity rule got wrong, reached through a state
  // event rather than through a missing payment id.)
  const env = freshEnv();
  await deliver(env, "evt_1", "checkout.completed", 0, checkout("ch_s1", "sub_s1"));
  await deliver(env, "evt_2", "subscription.paid", 0, paid("sub_s1", "tran_1", 31, 0));
  await deliver(env, "evt_3", "subscription.update", 30, subscription("sub_s1", "active", 62));
  await deliver(env, "evt_4", "subscription.paid", 31, paid("sub_s1", "tran_2", 62, 31));
  await deliver(env, "evt_5", "refund.created", 40, refund("ref_1", "tran_1", "sub_s1", 40));
  assert.equal(await claim(env, "ch_s1", 41), 200, "month one's refund does not end month two");
  await deliver(env, "evt_6", "refund.created", 42, refund("ref_2", "tran_2", "sub_s1", 42));
  assert.equal(await claim(env, "ch_s1", 43), 403, "month two's own refund does");
});

test("an upgrade charge does not take the month from the payment that bought it", async () => {
  // A proration or an upgrade ends with the same period the month's own
  // payment bought, and names its own transaction. Letting the later one claim
  // the period meant refunding the small charge ended a month it had not
  // bought, and refunding the real one ended nothing.
  const env = freshEnv();
  await deliver(env, "evt_1", "checkout.completed", 0, checkout("ch_u1", "sub_u1"));
  await deliver(env, "evt_2", "subscription.paid", 0, paid("sub_u1", "tran_1", 31, 0));
  await deliver(env, "evt_3", "subscription.paid", 10, paid("sub_u1", "tran_upgrade", 31, 10, {
    last_transaction: { id: "tran_upgrade", amount: 200, amount_paid: 200, status: "paid" }
  }));
  await deliver(env, "evt_4", "refund.created", 12, refund("ref_1", "tran_upgrade", "sub_u1", 12, {
    refund_amount: 200,
    transaction: { id: "tran_upgrade", amount: 200, amount_paid: 200, status: "refunded" }
  }));
  assert.equal(await claim(env, "ch_u1", 13), 200, "the upgrade's refund ends nothing it bought");
  await deliver(env, "evt_5", "refund.created", 14, refund("ref_2", "tran_1", "sub_u1", 14));
  assert.equal(await claim(env, "ch_u1", 15), 403, "the month's own payment still ends it");
});

test("a dispute carries no status, so every one of them is a chargeback", async () => {
  // The opposite of Stripe, where treating every dispute as a chargeback took
  // Pro from people whose money was never reversed (QA round 5, D3). Creem's
  // dispute has an amount, a transaction whose status is "chargeback", and no
  // status of its own: there is no inquiry to tell apart, and inventing one
  // would be inventing a field.
  const env = freshEnv();
  await deliver(env, "evt_1", "checkout.completed", 0, checkout("ch_11", "sub_11"));
  await deliver(env, "evt_2", "subscription.paid", 0, paid("sub_11", "tran_1", 31, 0));
  await deliver(env, "evt_3", "dispute.created", 10, dispute("disp_1", "tran_1", "sub_11", 10));
  assert.equal(await claim(env, "ch_11", 11), 403);
});

test("money going back on a transaction we never saw mints nothing, and is retried for a day", async () => {
  const env = freshEnv();
  const early = await deliver(env, "evt_1", "refund.created", 0, refund("ref_1", "tran_ghost", "sub_ghost", 0), { now: T });
  assert.equal(early.status, 500, "it may simply have arrived before the checkout");
  assert.equal([...env.ENTITLEMENTS.store.keys()].filter((k) => k.startsWith("lic:")).length, 0);
  const late = await deliver(env, "evt_1", "refund.created", 0, refund("ref_1", "tran_ghost", "sub_ghost", 0), {
    now: T + DAY
  });
  assert.equal(late.status, 200, "and after a day it is somebody else's payment");
  assert.equal((await late.json()).reason, "unknown_license");
});

/* ------------------------------------------------------- what is not ours */

test("a product that is not ours is suspended rather than made Pro", async () => {
  // A donation or a one-off lesson sold from the same Creem account arrives
  // through the same webhook. The product table is an allow-list wherever it
  // is filled in, which is what stopped the Stripe price table being a label
  // table and nothing else (QA round 4, QA-W-03).
  const env = freshEnv({ CREEM_PRODUCT_PRO_MONTHLY: "prod_mine" });
  await deliver(env, "evt_1", "checkout.completed", 0, {
    ...checkout("ch_12", "sub_12"),
    product: { id: "prod_donation", billing_period: "every-month" }
  });
  assert.equal(await claim(env, "ch_12", 1), 402, "suspended: adding the id and redeploying entitles it");
  // Naming the plan in the checkout's metadata does not make it ours: a buyer
  // writes that by adding `?metadata[plan]=pro_yearly` to the donation's
  // payment link, and Creem passes it to this webhook (Creem docs, Checkout
  // Links). Wrong: metadata read before the allow-list makes the donation Pro.
  await deliver(env, "evt_2", "checkout.completed", 1, {
    ...checkout("ch_13", "sub_13"),
    product: { id: "prod_donation", billing_period: "every-month" },
    metadata: { plan: "pro_yearly" }
  });
  assert.equal(await claim(env, "ch_13", 2), 402, "a buyer's metadata is no way past the allow-list");
  // Control: the same metadata on a product that is ours entitles it.
  await deliver(env, "evt_3", "checkout.completed", 2, {
    ...checkout("ch_14", "sub_14"),
    product: { id: "prod_mine", billing_period: "every-month" },
    metadata: { plan: "pro_yearly" }
  });
  assert.equal(await claim(env, "ch_14", 3), 200);
});

/* -------------------------------------------------------------- the mapping */

test("an event with nothing to key a license onto is acknowledged and ignored", () => {
  for (const [event, reason] of [
    [null, "malformed_event"],
    [{ eventType: 1 }, "malformed_event"],
    [{ eventType: "checkout.completed" }, "missing_object"],
    [{ eventType: "checkout.completed", object: "no" }, "missing_object"],
    [{ eventType: "customer.something", object: {} }, "unhandled_event_type"],
    [{ eventType: "subscription.paid", object: { status: "active" } }, "no_license_identity"]
  ]) {
    assert.deepEqual(mapCreemEvent(event, {}), { handled: false, reason });
  }
});

test("every event type this worker subscribes to is one it maps", () => {
  // A type in the list that falls through to "unhandled_event_type" is a
  // subscription in the Creem dashboard that does nothing, which is a silent
  // way to lose a sale.
  const objects = {
    "checkout.completed": checkout("ch_m", "sub_m"),
    "refund.created": refund("ref_m", "tran_m", "sub_m", 0),
    "dispute.created": dispute("disp_m", "tran_m", "sub_m", 0)
  };
  for (const eventType of HANDLED_CREEM_EVENT_TYPES) {
    const object = objects[eventType] || subscription("sub_m", "active", 31);
    const mapped = mapCreemEvent({ id: "evt_m", eventType, created_at: ms(0), object }, {});
    assert.equal(mapped.handled, true, `${eventType} was not mapped`);
    assert.equal(mapped.update.provider, "creem");
  }
});

test("only a paid event says money arrived", () => {
  const moneyEvents = new Set(["checkout.completed", "subscription.paid"]);
  for (const eventType of HANDLED_CREEM_EVENT_TYPES) {
    if (eventType === "refund.created" || eventType === "dispute.created") {
      continue;
    }
    const object = eventType === "checkout.completed"
      ? checkout("ch_n", "sub_n")
      : subscription("sub_n", "active", 31);
    const mapped = mapCreemEvent({ id: "evt_n", eventType, created_at: ms(0), object }, {});
    assert.equal(
      mapped.update.paid === true,
      moneyEvents.has(eventType),
      `${eventType} should ${moneyEvents.has(eventType) ? "" : "not "}say money arrived`
    );
  }
});

test("the transaction id is read wherever Creem puts it", () => {
  const monthly = (object) => mapCreemEvent({ id: "e", eventType: "checkout.completed", created_at: ms(0), object }, {});
  assert.equal(monthly(checkout("ch_t", "sub_t")).update.paymentId, "tran_1", "a checkout's order names it");
  const fromPaid = mapCreemEvent(
    { id: "e", eventType: "subscription.paid", created_at: ms(0), object: paid("sub_t", "tran_p", 31, 0) },
    {}
  );
  assert.equal(fromPaid.update.paymentId, "tran_p", "a paid subscription names it twice over");
  const fromRefund = mapCreemEvent(
    { id: "e", eventType: "refund.created", created_at: ms(0), object: refund("ref_t", "tran_r", "sub_t", 0) },
    {}
  );
  assert.equal(fromRefund.update.paymentId, "tran_r");
});

test("the webhook route takes POST and nothing else", async () => {
  for (const method of ["GET", "PUT", "DELETE"]) {
    const response = await handleRequest(
      new Request("https://w.test/v1/webhooks/creem", { method }),
      freshEnv()
    );
    assert.equal(response.status, 405);
    assert.equal(response.headers.get("allow"), "POST");
  }
});

test("/v1/claim takes creem, and still refuses a provider nobody sells on", async () => {
  const env = freshEnv();
  for (const [provider, status] of [["creem", 202], ["stripe", 202], ["mercadopago", 202], ["demo", 400], ["", 400]]) {
    const response = await handleRequest(
      new Request("https://w.test/v1/claim", {
        method: "POST",
        body: JSON.stringify({ provider, sessionId: "ch_unknown" }),
        headers: { "content-type": "application/json" }
      }),
      env
    );
    assert.equal(response.status, status, `provider ${JSON.stringify(provider)}`);
  }
});

test("/v1/health says whether the Creem rail can be honoured at all", async () => {
  const withSecret = await handleRequest(new Request("https://w.test/v1/health"), freshEnv());
  assert.equal((await withSecret.json()).creemConfigured, true);
  const without = await handleRequest(
    new Request("https://w.test/v1/health"),
    freshEnv({ CREEM_WEBHOOK_SECRET: "" })
  );
  assert.equal((await without.json()).creemConfigured, false, "the client must be able to stop a sale");
});
