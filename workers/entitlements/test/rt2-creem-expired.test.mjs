/**
 * Creem's `subscription.expired` is a renewal being retried, not an ending
 * (red team rt2, truth-1).
 *
 * Creem's own words (read 23 November 2026):
 * - docs.creem.io/code/webhooks: "The subscription was expired, given that the
 *   `current_period_end_date` has been reached without a new payment. Payment
 *   retries can happen at this stage", "the subscription status will be
 *   terminal only when status is changed to `canceled`", and "The event
 *   doesn't change the subscription, and `status` shows its current value".
 * - the creem-api skill's WEBHOOKS page: "Status remains 'active' during retry
 *   period. Only act on subscription.canceled for terminal state."
 *
 * The defect: the worker read the expiry as "canceled" and terminal. A
 * subscriber whose renewal Creem was still retrying lost the page's Manage
 * button and its "your subscription is still open" line (billingRails []),
 * and when the retry charged the card, `subscription.paid` landed on a closed
 * record: the money was taken and Pro stayed off. The terms promise the
 * opposite ("cuando el pago entra, Pro vuelve").
 *
 * The oracle is what the person sees on any device, GET /v1/me, through the
 * real router, D1 fake and Creem signature check. For a buyer who paid
 * without an account it is POST /v1/license, the only thing their browser
 * can ask. Each test names the wrong reading it fails on; the ledger-set
 * mutants CK17 to CK20, CK38, CK39 and VW1a put them back.
 */

import assert from "node:assert/strict";
import test from "node:test";

import {
  DAY,
  NOW,
  call,
  completedCheckout,
  creemSubscriber,
  deliver,
  freshEnv,
  iso,
  me,
  openCheckout,
  req,
  subscriptionObject
} from "./rt2-kit.mjs";

/** `subscription.paid` for the retry that went through: tran_2, the next month. */
function retryPaid(periodEnd, at) {
  return subscriptionObject("active", periodEnd + 30 * DAY, {
    last_transaction_id: "tran_2",
    last_transaction_date: iso(at)
  });
}

test("an expired renewal Creem is retrying gives no Pro, keeps its rail, refuses a second subscription, and the retry's payment brings Pro back", async () => {
  const { env, services, token, periodEnd } = await creemSubscriber();

  // Creem checks once a day for periods that ended the day before, and its
  // example payload still says "active".
  assert.equal(await deliver(env, "evt_expired", "subscription.expired", subscriptionObject("active", periodEnd), periodEnd + DAY), 200);
  const lapsed = await me(env, token, periodEnd + 2 * DAY);
  assert.equal(lapsed.body.entitlement.pro, false, "the paid month is over: no Pro");
  assert.equal(lapsed.body.token, null);
  // Wrong: [] (the expiry read as a cancellation), so no Manage button and no
  // "your subscription is still open" line while Creem retries the card.
  assert.deepEqual(lapsed.body.billingRails, ["creem"], "the subscription is still there to manage");

  // A second subscription now would be charged beside this one once a retry
  // goes through.
  const second = await openCheckout(env, services, token, "pro_monthly", periodEnd + 2 * DAY);
  assert.equal(second.status, 409, JSON.stringify(second.body));
  assert.deepEqual(second.body, { ok: false, reason: "subscription_open", provider: "creem" });
  assert.equal(services.checkouts(), 1, "Creem was asked for the first checkout only");

  // The retry charges the card.
  const paidAt = periodEnd + 3 * DAY;
  assert.equal(await deliver(env, "evt_paid_2", "subscription.paid", retryPaid(periodEnd, paidAt), paidAt), 200);
  const back = await me(env, token, paidAt + 60);
  // Wrong: false, the money taken and Pro kept off for good.
  assert.equal(back.body.entitlement.pro, true, "when the money arrives, Pro comes back");
  assert.equal(typeof back.body.token, "string", "with a licence token");
  assert.equal(back.body.entitlement.periodEnd, periodEnd + 30 * DAY, "through the month the retry paid for");
});

test("an expiry delivered after the retry's payment, with an older stamp, takes nothing away", async () => {
  // Creem guarantees neither order nor exactly-once delivery. The expiry is
  // older than the payment, so it must not move the record back to dunning.
  const { env, token, periodEnd } = await creemSubscriber();
  const paidAt = periodEnd + 3 * DAY;
  assert.equal(await deliver(env, "evt_paid_2", "subscription.paid", retryPaid(periodEnd, paidAt), paidAt), 200);
  assert.equal(await deliver(env, "evt_expired", "subscription.expired", subscriptionObject("active", periodEnd), periodEnd + DAY), 200);
  const view = await me(env, token, paidAt + 60);
  assert.equal(view.body.entitlement.pro, true);
  assert.equal(view.body.entitlement.periodEnd, periodEnd + 30 * DAY);
  assert.deepEqual(view.body.billingRails, ["creem"]);
});

test("a cancellation is the ending: no rail, a new checkout opens, and neither a later expiry nor a stray payment reopens it", async () => {
  // Control for the first test, and the case the old rule was written for:
  // an expiry after a cancellation. Creem fires subscription.canceled "when a
  // scheduled cancellation takes effect at the end of the period".
  const { env, services, token, periodEnd } = await creemSubscriber();
  const canceled = subscriptionObject("canceled", periodEnd, { canceled_at: iso(periodEnd) });
  assert.equal(await deliver(env, "evt_canceled", "subscription.canceled", canceled, periodEnd), 200);
  const over = await me(env, token, periodEnd + 60);
  assert.equal(over.body.entitlement.pro, false);
  assert.deepEqual(over.body.billingRails, [], "nothing left to manage");

  assert.equal(await deliver(env, "evt_expired", "subscription.expired", subscriptionObject("canceled", periodEnd, { canceled_at: iso(periodEnd) }), periodEnd + DAY), 200);
  const stray = periodEnd + 2 * DAY;
  assert.equal(await deliver(env, "evt_paid_2", "subscription.paid", retryPaid(periodEnd, stray), stray), 200);
  const after = await me(env, token, stray + 60);
  // Wrong: true, a cancelled subscription reopened by an event after it.
  assert.equal(after.body.entitlement.pro, false, "a cancelled subscription stays cancelled");
  assert.deepEqual(after.body.billingRails, []);

  // And they can subscribe again.
  const again = await openCheckout(env, services, token, "pro_yearly", stray + 120);
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.equal(services.checkouts(), 2);
});

/**
 * POST /v1/license as js/license.js asks it, with the worker's clock at `at`.
 * The route reads `Date.now()`, so the clock is moved for the call and put
 * back after it (the same way creem.test.mjs asks /v1/claim).
 */
async function refreshLicense(env, licenseId, at) {
  const real = Date.now;
  Date.now = () => at * 1000;
  try {
    return await call(req("POST", "/v1/license", { body: { licenseId } }), env, { now: at });
  } finally {
    Date.now = real;
  }
}

/**
 * A buyer who paid through a Creem link without signing in: the browser came
 * back with the checkout id and claimed it, and holds only the licence id.
 * @returns {Promise<{env: Object, licenseId: string, periodEnd: number}>} The setup.
 */
async function anonymousBuyer() {
  const env = freshEnv();
  const paidAt = NOW + 20;
  assert.equal(await deliver(env, "evt_checkout", "checkout.completed", completedCheckout("ch_anon", null, paidAt), paidAt), 200);
  const claimedAt = paidAt + 60;
  const real = Date.now;
  Date.now = () => claimedAt * 1000;
  let claimed;
  try {
    claimed = await call(req("POST", "/v1/claim", { body: { provider: "creem", sessionId: "ch_anon" } }), env, { now: claimedAt });
  } finally {
    Date.now = real;
  }
  assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
  assert.equal(typeof claimed.body.licenseId, "string", "precondition: the browser holds a licence id");
  return { env, licenseId: claimed.body.licenseId, periodEnd: paidAt + 30 * DAY };
}

test("a buyer without an account keeps their licence (402) while Creem retries the renewal, so the retry's payment gives Pro back in that browser", async () => {
  const { env, licenseId, periodEnd } = await anonymousBuyer();
  const during = await refreshLicense(env, licenseId, NOW + 5 * DAY);
  assert.equal(during.status, 200, "precondition: Pro during the paid month");

  assert.equal(await deliver(env, "evt_expired", "subscription.expired", subscriptionObject("active", periodEnd), periodEnd + DAY), 200);
  const retrying = await refreshLicense(env, licenseId, periodEnd + 2 * DAY);
  // Wrong: 403 inactive. js/license.js forgets the licence on a 403, and a
  // browser with no account has nothing else to find it again with, so the
  // retry's payment below would never reach it.
  assert.equal(retrying.status, 402, JSON.stringify(retrying.body));
  assert.equal(retrying.body.reason, "suspended");
  assert.equal(retrying.body.token, undefined, "no Pro while the renewal is unpaid");

  const paidAt = periodEnd + 3 * DAY;
  assert.equal(await deliver(env, "evt_paid_2", "subscription.paid", retryPaid(periodEnd, paidAt), paidAt), 200);
  const back = await refreshLicense(env, licenseId, paidAt + 60);
  assert.equal(back.status, 200, JSON.stringify(back.body));
  assert.equal(typeof back.body.token, "string", "the same browser gets Pro back");
});

test("control: a subscription that is over answers 403, so the browser stops asking for it", async () => {
  // A cancellation, an expiry whose snapshot says cancelled, and an expiry
  // of a cancellation the customer scheduled: no payment brings any of them
  // back. Wrong (the 402 widened past dunning): the browser keeps asking for
  // a licence that can never entitle again.
  for (const [label, eventType, status] of [
    ["canceled", "subscription.canceled", "canceled"],
    ["expired, snapshot canceled", "subscription.expired", "canceled"],
    ["expired, snapshot scheduled_cancel", "subscription.expired", "scheduled_cancel"]
  ]) {
    const { env, licenseId, periodEnd } = await anonymousBuyer();
    const snapshot = subscriptionObject(status, periodEnd, { canceled_at: iso(periodEnd - 10 * DAY) });
    assert.equal(await deliver(env, "evt_end", eventType, snapshot, periodEnd + DAY), 200, label);
    const over = await refreshLicense(env, licenseId, periodEnd + 2 * DAY);
    assert.equal(over.status, 403, `${label}: ${JSON.stringify(over.body)}`);
    assert.equal(over.body.reason, "inactive", label);
  }
});

test("merge review: between the period end and Creem's daily expiry, a buyer without an account keeps their licence (402), not 403", async () => {
  // Creem sends subscription.expired up to a day after the period ends; until
  // then the record still reads "active". Wrong (before): 403 inactive in that
  // window, js/license.js forgot the licence, and the retry's payment never
  // reached that browser.
  const { env, licenseId, periodEnd } = await anonymousBuyer();
  const window = await refreshLicense(env, licenseId, periodEnd + 3600);
  assert.equal(window.status, 402, JSON.stringify(window.body));
  assert.equal(window.body.reason, "suspended");
  assert.equal(window.body.token, undefined, "no Pro for a renewal not paid");
  const paidAt = periodEnd + 2 * DAY;
  assert.equal(await deliver(env, "evt_paid_2", "subscription.paid", retryPaid(periodEnd, paidAt), paidAt), 200);
  const back = await refreshLicense(env, licenseId, paidAt + 60);
  assert.equal(back.status, 200, "the same browser gets Pro back");
});

test("merge review: another event during the retry (an update still saying active) does not turn the licence into a 403", async () => {
  // Creem: "Status remains 'active' during retry period". Wrong (before): the
  // update put the record back to plain "active" with its period over, and
  // the next ask answered 403.
  const { env, licenseId, periodEnd } = await anonymousBuyer();
  assert.equal(await deliver(env, "evt_expired", "subscription.expired", subscriptionObject("active", periodEnd), periodEnd + DAY), 200);
  assert.equal(await deliver(env, "evt_update", "subscription.update", subscriptionObject("active", periodEnd), periodEnd + DAY + 3600), 200);
  const after = await refreshLicense(env, licenseId, periodEnd + 2 * DAY);
  assert.equal(after.status, 402, JSON.stringify(after.body));
  assert.equal(after.body.reason, "suspended");
});

test("control: a subscription set to cancel answers 403 once its period is over, before Creem's own cancellation arrives", async () => {
  // Both read "active" until subscription.canceled; only Creem's
  // scheduled_cancel (or a canceled_at on an active snapshot) tells a
  // cancellation from a renewal not paid yet. Wrong (402 for every active
  // record): the browser of somebody who chose to cancel keeps asking.
  for (const [label, snapshot] of [
    ["scheduled_cancel", (periodEnd) => subscriptionObject("scheduled_cancel", periodEnd, { canceled_at: iso(periodEnd - 10 * DAY) })],
    ["active with canceled_at", (periodEnd) => subscriptionObject("active", periodEnd, { canceled_at: iso(periodEnd) })]
  ]) {
    const { env, licenseId, periodEnd } = await anonymousBuyer();
    assert.equal(await deliver(env, "evt_sched", "subscription.update", snapshot(periodEnd), periodEnd - 10 * DAY), 200, label);
    const during = await refreshLicense(env, licenseId, periodEnd - DAY);
    assert.equal(during.status, 200, `${label}: the paid month is kept`);
    const over = await refreshLicense(env, licenseId, periodEnd + 3600);
    assert.equal(over.status, 403, `${label}: ${JSON.stringify(over.body)}`);
  }
});

test("control: a period ended by a refund answers 403, not 402", async () => {
  const { env, licenseId, periodEnd } = await anonymousBuyer();
  const at = NOW + 5 * DAY;
  const refund = {
    id: "ref_1",
    object: "refund",
    status: "succeeded",
    refund_amount: 799,
    transaction: { id: "tran_1", amount: 799, amount_paid: 799, status: "refunded", subscription: "sub_1" },
    subscription: subscriptionObject("active", periodEnd),
    created_at: at * 1000
  };
  assert.equal(await deliver(env, "evt_refund", "refund.created", refund, at), 200);
  const after = await refreshLicense(env, licenseId, at + 60);
  assert.equal(after.status, 403, JSON.stringify(after.body));
});

test("a cancellation on its own is the ending: a later-stamped payment (a manual resend gets a new created_at) does not reopen it", async () => {
  // The third test above sends an expiry after the cancellation, and an
  // expiry whose snapshot says cancelled closes the record by itself. This
  // one sends nothing between them, so only the cancellation can keep it
  // closed. Wrong (the worker before red team rt2): the cancellation was not
  // terminal, and the stray payment reopened the subscription.
  const { env, token, periodEnd } = await creemSubscriber();
  assert.equal(await deliver(env, "evt_canceled", "subscription.canceled", subscriptionObject("canceled", periodEnd, { canceled_at: iso(periodEnd) }), periodEnd), 200);
  const stray = periodEnd + 2 * DAY;
  assert.equal(await deliver(env, "evt_paid_resent", "subscription.paid", retryPaid(periodEnd, stray), stray), 200);
  const after = await me(env, token, stray + 60);
  assert.equal(after.body.entitlement.pro, false, "a cancelled subscription stays cancelled");
  assert.deepEqual(after.body.billingRails, []);
});

test("control: the same later payment with no cancellation before it gives Pro", async () => {
  const { env, token, periodEnd } = await creemSubscriber();
  const paidAt = periodEnd + 2 * DAY;
  assert.equal(await deliver(env, "evt_paid_2", "subscription.paid", retryPaid(periodEnd, paidAt), paidAt), 200);
  const view = await me(env, token, paidAt + 60);
  assert.equal(view.body.entitlement.pro, true);
  assert.equal(view.body.entitlement.periodEnd, periodEnd + 30 * DAY);
});

test("an expiry whose snapshot says scheduled_cancel is the cancellation the customer asked for: no rail, a new checkout opens, and nothing reopens it", async () => {
  // Creem: a scheduled_cancel subscription "remains active until
  // `current_period_end_date`, after which it transitions to `canceled`",
  // and nothing retries it. Wrong: the expiry read as dunning (past_due), so
  // the page told a customer who chose to cancel that a payment had failed
  // (billingRails ["creem"]) and the worker refused them a new checkout
  // (409) until subscription.canceled arrived. The first test in this file
  // is the control: the same expiry with an active snapshot is dunning.
  const { env, services, token, periodEnd } = await creemSubscriber();
  const scheduled = subscriptionObject("scheduled_cancel", periodEnd, { canceled_at: iso(periodEnd - 10 * DAY) });
  assert.equal(await deliver(env, "evt_expired", "subscription.expired", scheduled, periodEnd + DAY), 200);
  const over = await me(env, token, periodEnd + 2 * DAY);
  assert.equal(over.body.entitlement.pro, false);
  assert.deepEqual(over.body.billingRails, [], "nothing left to manage, and no failed payment to report");
  const again = await openCheckout(env, services, token, "pro_yearly", periodEnd + 2 * DAY);
  assert.equal(again.status, 200, JSON.stringify(again.body));
  assert.equal(services.checkouts(), 2);

  // Terminal: a stray payment after it does not reopen the old subscription.
  const stray = periodEnd + 3 * DAY;
  assert.equal(await deliver(env, "evt_paid_stray", "subscription.paid", retryPaid(periodEnd, stray), stray), 200);
  assert.equal((await me(env, token, stray + 60)).body.entitlement.pro, false);
});
