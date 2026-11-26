/**
 * A Creem refund or chargeback that embeds a subscription Creem already
 * cancelled ends that subscription here too (red team rt2, verification of
 * money-3).
 *
 * Creem's own example of `refund.created` embeds the subscription with
 * `status: "canceled"` and its `canceled_at` (docs.creem.io/code/webhooks,
 * read 23 November 2026). The defect: the worker read only the transaction
 * from it. The refunded customer's record stayed an open subscription, so
 * when no separate `subscription.canceled` came (lost, or never sent),
 * `/v1/me` offered a subscription to manage that Creem had ended, and the
 * checkout guard refused them a new one with 409 `subscription_open`.
 *
 * The oracle is what the person sees, GET /v1/me and a press of Subscribe,
 * through the real router, D1 fake and Creem signature check. The controls
 * are the same money going back while the subscription it names is still
 * active: it may still charge, so it stays open and a second checkout is
 * still refused. Mutants CK39b and CK39c put the defect back.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { DAY, NOW, creemSubscriber, deliver, iso, me, openCheckout, subscriptionObject } from "./rt2-kit.mjs";

/** `sub_1` as a refund or a dispute embeds it. */
function embedded(status, periodEnd, at) {
  return subscriptionObject(status, periodEnd, status === "canceled" ? { canceled_at: iso(at) } : {});
}

/** A full refund of the first charge (tran_1), as Creem sends it. */
function fullRefund(subscription) {
  return {
    id: "ref_1",
    object: "refund",
    status: "succeeded",
    refund_amount: 799,
    refund_currency: "USD",
    transaction: { id: "tran_1", object: "transaction", amount: 799, amount_paid: 799, status: "refunded" },
    subscription,
    customer: { id: "cust_1" }
  };
}

/** A chargeback of the first charge (tran_1), as Creem sends it. */
function chargeback(subscription) {
  return {
    id: "dis_1",
    object: "dispute",
    amount: 799,
    currency: "USD",
    transaction: { id: "tran_1", object: "transaction", amount: 799, status: "chargeback" },
    subscription,
    customer: { id: "cust_1" }
  };
}

/** What the person sees two days in, and what a press of Subscribe answers. */
async function afterwards(env, services, token) {
  const view = await me(env, token, NOW + 3 * DAY);
  const press = await openCheckout(env, services, token, "pro_yearly", NOW + 3 * DAY);
  return { pro: view.body.entitlement.pro, rails: view.body.billingRails, press };
}

for (const [label, eventType, money] of [
  ["a full refund", "refund.created", fullRefund],
  ["a chargeback", "dispute.created", chargeback]
]) {
  test(`${label} whose subscription Creem already cancelled ends it: no rail, and a new checkout opens`, async () => {
    const { env, services, token, periodEnd } = await creemSubscriber();
    const at = NOW + 2 * DAY;
    assert.equal(await deliver(env, "evt_money_back", eventType, money(embedded("canceled", periodEnd, at)), at), 200);
    const got = await afterwards(env, services, token);
    assert.equal(got.pro, false, "the money went back");
    // Wrong: ["creem"] and 409, a subscription Creem ended still offered for
    // managing and still blocking a new one.
    assert.deepEqual(got.rails, [], "nothing left to manage");
    assert.equal(got.press.status, 200, JSON.stringify(got.press.body));
    assert.equal(services.checkouts(), 2);

    // Terminal, as any Creem cancellation: a later snapshot serialised
    // before it (still active) does not reopen the subscription.
    const late = NOW + 4 * DAY;
    assert.equal(await deliver(env, "evt_update_late", "subscription.update", subscriptionObject("active", periodEnd), late), 200);
    const view = await me(env, token, late + 60);
    assert.equal(view.body.entitlement.pro, false);
    assert.deepEqual(view.body.billingRails, []);
  });

  test(`control: ${label} whose subscription is still active leaves it open, so a second checkout is still refused`, async () => {
    // Creem's own example of dispute.created embeds an active subscription.
    // The money for this month went back, but the subscription may charge
    // again, and a second one would charge beside it.
    const { env, services, token, periodEnd } = await creemSubscriber();
    const at = NOW + 2 * DAY;
    assert.equal(await deliver(env, "evt_money_back", eventType, money(embedded("active", periodEnd, at)), at), 200);
    const got = await afterwards(env, services, token);
    assert.equal(got.pro, false, "the money went back");
    assert.deepEqual(got.rails, ["creem"]);
    assert.equal(got.press.status, 409, JSON.stringify(got.press.body));
    assert.deepEqual(got.press.body, { ok: false, reason: "subscription_open", provider: "creem" });
    assert.equal(services.checkouts(), 1);
  });
}
