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

test("no metadata names a checkout's plan, the checkout's own or its nested subscription's: the buyer can write both", () => {
  // WC5 and WC6 pinned which of the two metadata came first. Neither is read
  // any more (red-team WH-2, 18 November 2026): a Creem payment link takes
  // `?metadata[plan]=` from whoever opens it, so the product decides.
  const plan = (over) => {
    const { update } = map("checkout.completed", checkout(over), {}, 1793664000000);
    return [update.plan, update.planSource];
  };
  assert.deepEqual(
    plan({ subscription: { id: "sub_k", object: "subscription", metadata: { plan: "pro_yearly" } } }),
    ["pro_monthly", "billing_period"],
    "the nested subscription's metadata says yearly; the monthly product decides"
  );
  assert.deepEqual(
    plan({
      metadata: { plan: "pro_monthly" },
      product: { id: "prod_k", billing_period: "every-year" },
      subscription: { id: "sub_k", object: "subscription", metadata: { plan: "pro_monthly" } }
    }),
    ["pro_yearly", "billing_period"],
    "both say monthly; the yearly product decides"
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

test("a canceled event ends the subscription for good even when its snapshot still says active", () => {
  // A snapshot serialised before the status changed still says "active".
  // Wrong: reading only the object's status keeps a cancelled subscription
  // active for as long as nothing else arrives; or the cancellation is not
  // terminal, so a later event reopens it. Creem: "the subscription status
  // will be terminal only when status is changed to `canceled`".
  const canceled = map("subscription.canceled", subscription(), {}, 1793664000000).update;
  assert.equal(canceled.status, "canceled");
  assert.equal(canceled.terminal, true, "a cancellation is terminal");
  // Control: any other subscription event reads the object's own status.
  assert.equal(map("subscription.update", subscription(), {}, 1793664000000).update.status, "active");
  assert.equal(map("subscription.update", subscription({ status: "paused" }), {}, 1793664000000).update.status,
    "suspended");
});

test("an expired event is a renewal being retried, not an ending, unless its snapshot says the subscription was cancelled", () => {
  // Creem: subscription.expired fires once current_period_end_date "has been
  // reached without a new payment. Payment retries can happen at this stage",
  // and "The event doesn't change the subscription, and `status` shows its
  // current value" (docs.creem.io/code/webhooks, read 23 November 2026).
  // Wrong (what this worker did until red team rt2, truth-1): the expiry is
  // "canceled" and terminal, so the subscriber in dunning loses the Manage
  // button and a retry that charges the card gives no Pro back.
  const retried = map("subscription.expired", subscription(), {}, 1793664000000).update;
  assert.equal(retried.status, "past_due", "an expiry whose snapshot says active is a retry in progress");
  assert.equal(retried.terminal, false, "and it is not the end");
  assert.equal(retried.endedAt, undefined, "so it records no ending either");
  // Controls: an expiry keeps what any other snapshot says. A cancelled one
  // stays cancelled and terminal; a paused one stays suspended and open.
  const over = map("subscription.expired", subscription({ status: "canceled", canceled_at: "2026-11-01T08:30:00.000Z" }), {}, 1793664000000).update;
  assert.equal(over.status, "canceled");
  assert.equal(over.terminal, true);
  assert.equal(over.endedAt, 1793521800, "ended when it was cancelled");
  const paused = map("subscription.expired", subscription({ status: "paused" }), {}, 1793664000000).update;
  assert.equal(paused.status, "suspended");
  assert.equal(paused.terminal, false);
  // And a state event that says active is still active: past_due is the
  // expiry's own reading, not every event's.
  assert.equal(map("subscription.update", subscription(), {}, 1793664000000).update.status, "active");
});

test("an expired event whose snapshot says scheduled_cancel is the cancellation the customer asked for, and terminal", () => {
  // Creem: a scheduled_cancel subscription "remains active until
  // `current_period_end_date`, after which it transitions to `canceled`", and
  // nothing retries it. Wrong: the mapped status (scheduled_cancel reads as
  // active) made the expiry dunning, past_due and open.
  const scheduled = map("subscription.expired",
    subscription({ status: "scheduled_cancel", canceled_at: "2026-11-01T08:30:00.000Z" }), {}, 1793664000000).update;
  assert.equal(scheduled.status, "canceled");
  assert.equal(scheduled.terminal, true);
  assert.equal(scheduled.endedAt, 1793521800, "ended when the customer cancelled");
  // Controls: the same snapshot on any other event is a subscription still
  // in its paid period, and an expiry with an active snapshot is dunning.
  const running = map("subscription.update", subscription({ status: "scheduled_cancel" }), {}, 1793664000000).update;
  assert.equal(running.status, "active");
  assert.equal(running.terminal, false);
  assert.equal(map("subscription.expired", subscription(), {}, 1793664000000).update.status, "past_due");
});

test("money going back that embeds a cancelled subscription carries the cancellation; one that embeds an active subscription does not", () => {
  // Creem's example of refund.created embeds the subscription with status
  // "canceled" and its canceled_at; its example of dispute.created embeds an
  // active one. Wrong: the embedded status is not read, so the refunded
  // customer's subscription stays open here after Creem ended it.
  const refund = (sub) => ({
    id: "ref_k",
    object: "refund",
    mode: "prod",
    refund_amount: 1000,
    transaction: { id: "tran_k", amount: 1000, amount_paid: 1000, status: "refunded" },
    subscription: sub,
    customer: { id: "cust_k" }
  });
  const dispute = (sub) => ({ id: "dis_k", object: "dispute", amount: 1000, transaction: { id: "tran_k" }, subscription: sub });
  const ended = subscription({ status: "canceled", canceled_at: "2026-11-01T08:30:00.000Z" });
  for (const [label, eventType, money] of [["refund", "refund.created", refund], ["dispute", "dispute.created", dispute]]) {
    const over = map(eventType, money(ended), {}, 1793664000000).update;
    assert.equal(over.status, "canceled", label);
    assert.equal(over.terminal, true, label);
    assert.equal(over.endedAt, 1793521800, `${label}: ended when Creem cancelled it`);
    assert.equal(over.isReversal, true, `${label}: still money going back`);
    assert.equal(over.paymentId, "tran_k", label);
    // A raw "expired" status is Creem's other word for over (STATUS_MAP).
    assert.equal(map(eventType, money(subscription({ status: "expired" })), {}, 1793664000000).update.status, "canceled", label);
    // Controls: an active subscription, or one named only by its id, says
    // nothing about the subscription's state.
    for (const sub of [subscription(), subscription({ status: "scheduled_cancel" }), "sub_k"]) {
      const open = map(eventType, money(sub), {}, 1793664000000).update;
      assert.equal(open.status, undefined, `${label}: ${JSON.stringify(sub)}`);
      assert.equal(open.terminal, undefined, label);
      assert.equal(open.endedAt, undefined, label);
      assert.equal(open.subscriptionId, "sub_k", label);
    }
  }
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
