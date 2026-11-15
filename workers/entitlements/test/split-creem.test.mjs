/**
 * Killer tests for the Creem mapping, written when its four over-ceiling
 * functions (isFullCreemRefund, mapCheckout, mapSubscription, mapCreemEvent)
 * were split under the complexity gate.
 *
 * Each case below is the oracle for a defect that was planted in the logic the
 * split moved and that the existing suites (creem.test.mjs, refunds.test.mjs
 * and the rest of the worker suite) let through: the code was right, but
 * nothing would have noticed it going wrong. Every expected value is a literal
 * written down by hand, never one computed by the code under test, and every
 * case carries a nearby control that the same defect does not change, so a
 * test can only pass by telling the right reading from the wrong one. The
 * defects are registered in qa/mutate.mjs (set "splits") as WC1 to WC17, so
 * CI keeps proving these cases still kill them.
 *
 * Times: the envelope's `created_at` and an object's own `created_at` are epoch
 * milliseconds; a subscription's dates are ISO 8601 strings.
 *   2026-11-01T08:30:00Z = 1793521800
 *   2026-11-03T00:00:00Z = 1793664000
 *   2026-11-05T12:00:00Z = 1793880000
 *   2026-11-06T00:00:00Z = 1793923200
 */

import assert from "node:assert/strict";
import test from "node:test";

import { isFullCreemRefund, mapCreemEvent } from "../src/creem.js";

/** Map one event at the envelope time given (epoch ms, or undefined for none). */
const map = (eventType, object, env, createdAtMs) => mapCreemEvent(
  createdAtMs === undefined
    ? { id: "evt_k", eventType, object }
    : { id: "evt_k", eventType, created_at: createdAtMs, object },
  env || {}
);

/** A completed checkout with a paid order, overridable field by field. */
const checkout = (over) => ({
  id: "ch_k",
  object: "checkout",
  status: "completed",
  mode: "prod",
  order: { id: "ord_k", status: "paid", transaction: "tran_k" },
  product: { id: "prod_k", billing_period: "every-month" },
  customer: { id: "cust_k" },
  subscription: { id: "sub_k", object: "subscription", status: "active" },
  ...(over || {})
});

/** A subscription event's object, overridable field by field. */
const subscription = (over) => ({
  id: "sub_k",
  object: "subscription",
  status: "active",
  mode: "prod",
  product: { id: "prod_k", billing_period: "every-month" },
  customer: { id: "cust_k" },
  current_period_end_date: "2026-12-03T00:00:00.000Z",
  canceled_at: null,
  ...(over || {})
});

/* --------------------------------------------------- what was paid (WC1) */

test("a transaction whose amount_paid is null is read by its amount, so a full refund of it ends access", () => {
  // Wrong behaviour: Number(null) is 0, and "paid nothing" makes every refund
  // of the charge read as partial, so a customer who got all of their money
  // back keeps Pro.
  const t = { id: "tran_k", amount_paid: null, amount: 1000 };
  assert.equal(isFullCreemRefund({ refund_amount: 1000, transaction: t }), true, "the whole amount went back");
  assert.equal(isFullCreemRefund({ refund_amount: 10, transaction: { ...t, refunded_amount: 1000 } }), true,
    "and the running total of it is read against the same amount");
  // Control: the fallback does not make a part refund into a full one.
  assert.equal(isFullCreemRefund({ refund_amount: 999, transaction: t }), false);
});

/* ---------------------------------- when a checkout is paid (WC2-WC7) */

test("a checkout is paid only when it completed and its order is paid or names no status", () => {
  const verdict = (over) => {
    const { update } = map("checkout.completed", checkout(over), {}, 1793664000000);
    return { status: update.status, paid: update.paid, paymentId: update.paymentId };
  };
  const paidUpdate = { status: "active", paid: true, paymentId: "tran_k" };
  const unpaidUpdate = { status: "pending", paid: undefined, paymentId: null };

  assert.deepEqual(verdict(), paidUpdate, "control: completed, order paid");
  // An order that names no status is the documented shape of a paid checkout
  // (Creem only sends this event once the order is paid).
  assert.deepEqual(verdict({ order: { id: "ord_k", transaction: "tran_k" } }), paidUpdate,
    "an order with no status of its own");
  // An order status this worker does not recognise must not read as money.
  assert.deepEqual(verdict({ order: { id: "ord_k", status: "refunded", transaction: "tran_k" } }), unpaidUpdate,
    "an order that is not paid");
  assert.deepEqual(verdict({ order: { id: "ord_k", status: "pending", transaction: "tran_k" } }), unpaidUpdate);
  // The checkout's own status is read, whatever the order says.
  assert.deepEqual(verdict({ status: undefined }), unpaidUpdate, "a checkout with no status");
  assert.deepEqual(verdict({ status: "pending" }), unpaidUpdate, "a checkout that has not completed");
});

test("a checkout's plan comes from its own metadata first, then from its nested subscription's", () => {
  const plan = (over) => {
    const { update } = map("checkout.completed", checkout(over), {}, 1793664000000);
    return [update.plan, update.planSource];
  };
  // No metadata on the checkout: the subscription nested in it is the only
  // place the owner's plan is written. Wrong: the monthly billing period wins.
  assert.deepEqual(
    plan({ subscription: { id: "sub_k", object: "subscription", metadata: { plan: "pro_yearly" } } }),
    ["pro_yearly", "metadata"]
  );
  // Both written: the checkout's own outranks the subscription's.
  assert.deepEqual(
    plan({
      metadata: { plan: "pro_monthly" },
      product: { id: "prod_k", billing_period: "every-year" },
      subscription: { id: "sub_k", object: "subscription", metadata: { plan: "pro_yearly" } }
    }),
    ["pro_monthly", "metadata"]
  );
  // Control: neither written, so the product's billing period decides.
  assert.deepEqual(plan({ product: { id: "prod_k", billing_period: "every-year" } }), ["pro_yearly", "billing_period"]);
});

/* ----------------------------------- a subscription's product (WC8, WC9) */

test("a subscription that names its product only in its items is read by the first item", () => {
  const env = { CREEM_PRODUCT_PRO_MONTHLY: "prod_m", CREEM_PRODUCT_PRO_YEARLY: "prod_y" };
  const { update } = map("subscription.update", subscription({
    product: undefined,
    items: [{ id: "sitem_1", product_id: "prod_y" }, { id: "sitem_2", product_id: "prod_m" }]
  }), env, 1793664000000);
  // Wrong: no product read at all falls to the monthly default; the second
  // item reads monthly. Either sells a year as a month.
  assert.equal(update.plan, "pro_yearly");
  assert.equal(update.planSource, "product_id");
  assert.equal(update.status, "active", "and it is ours, so it is not suspended");
  // Control: a `product` of its own outranks the items.
  const own = map("subscription.update", subscription({
    product: { id: "prod_m" },
    items: [{ id: "sitem_1", product_id: "prod_y" }]
  }), env, 1793664000000);
  assert.equal(own.update.plan, "pro_monthly");
});

/* -------------------------------------- the event decides (WC10, WC11) */

test("a canceled or expired event ends the subscription even when its snapshot still says active", () => {
  // A snapshot serialised before the status changed still says "active".
  // Wrong: reading only the object's status keeps a cancelled or expired
  // subscription active for as long as nothing else arrives.
  const canceled = map("subscription.canceled", subscription(), {}, 1793664000000).update;
  assert.equal(canceled.status, "canceled");
  assert.equal(canceled.terminal, false, "a cancellation is not terminal");
  const expired = map("subscription.expired", subscription(), {}, 1793664000000).update;
  assert.equal(expired.status, "canceled");
  assert.equal(expired.terminal, true, "an expiry is");
  // Control: any other subscription event reads the object's own status.
  assert.equal(map("subscription.update", subscription(), {}, 1793664000000).update.status, "active");
  assert.equal(map("subscription.update", subscription({ status: "paused" }), {}, 1793664000000).update.status,
    "suspended");
});

/* ---------------------------------------- the stamped times (WC12-WC17) */

test("money going back is dated by the envelope, else by the refund's own created_at, and nothing else is", () => {
  const refund = {
    id: "ref_k",
    object: "refund",
    mode: "prod",
    refund_amount: 1000,
    transaction: { id: "tran_k", amount: 1000, amount_paid: 1000, status: "refunded" },
    subscription: { id: "sub_k" },
    customer: { id: "cust_k" },
    created_at: 1793521800000
  };
  // Wrong: the refund's own date outranks the envelope's.
  const stamped = map("refund.created", refund, {}, 1793880000000).update;
  assert.equal(stamped.occurredAt, 1793880000);
  assert.equal(stamped.reversedAt, 1793880000);
  // Wrong: with no envelope date there is no reversal date at all, and the
  // store would date it "now", which a delayed delivery makes arbitrarily late.
  const unstamped = map("refund.created", refund, {}, undefined).update;
  assert.equal(unstamped.occurredAt, null);
  assert.equal(unstamped.reversedAt, 1793521800);
  // Control: an update that is not money going back carries no reversal date.
  const bought = map("checkout.completed", checkout(), {}, 1793880000000).update;
  assert.equal(Object.hasOwn(bought, "reversedAt"), false);
});

test("a cancellation keeps the date it names, and one that names none is dated by its envelope", () => {
  // Wrong: the envelope date overwrites the cancellation's own `canceled_at`.
  const named = map("subscription.canceled", subscription({ canceled_at: "2026-11-03T00:00:00.000Z" }),
    {}, 1793923200000).update;
  assert.equal(named.endedAt, 1793664000);
  // Wrong: a cancellation with no `canceled_at` is left with no end at all.
  const unnamed = map("subscription.canceled", subscription({ canceled_at: null }), {}, 1793923200000).update;
  assert.equal(unnamed.endedAt, 1793923200);
  // Control: a subscription that is not canceled carries no end date.
  assert.equal(map("subscription.update", subscription(), {}, 1793923200000).update.endedAt, undefined);
});

test("a paid checkout with no envelope date counts its month from the checkout's own created_at", () => {
  // Wrong: with neither a transaction date nor an envelope date, the charge is
  // dated nowhere, so the one-interval bound on a checkout whose subscription
  // events never arrive has nothing to count from.
  const object = checkout({ created_at: 1793521800000 });
  assert.equal(map("checkout.completed", object, {}, undefined).update.periodEndFromCharge, 1793521800);
  // Control: the envelope date, when there is one, outranks the object's.
  assert.equal(map("checkout.completed", object, {}, 1793880000000).update.periodEndFromCharge, 1793880000);
  // Control: money that did not arrive dates no charge.
  const unpaid = map("checkout.completed", checkout({ status: "pending", created_at: 1793521800000 }), {}, undefined);
  assert.equal(Object.hasOwn(unpaid.update, "periodEndFromCharge"), false);
});
