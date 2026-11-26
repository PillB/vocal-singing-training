/**
 * One test of "this account already has an open subscription", read by two
 * answers (red team rt2: money-3, states-1 worker half, money-7):
 *
 * - POST /v1/me/checkout refuses with 409 {ok:false, reason:"subscription_open",
 *   provider} while one is open on any rail, because a second subscription
 *   would charge every month beside the first. Before this, the worker opened
 *   a second and a third Creem checkout for a subscriber whose renewal Creem
 *   was still retrying.
 * - GET /v1/me names the rail in `billingRails`, which the page reads, while
 *   Pro is off, as "your subscription is still open, but Pro is off". Before
 *   this, any linked record not marked "canceled" counted, so a one-off
 *   Mercado Pago month, or a preapproval nobody authorized, was told its
 *   subscription was still open for ever.
 *
 * The one difference between the two, on purpose: a subscription whose first
 * charge is on its way (`paid: false`, which VG-84 gives a new Mercado Pago
 * subscription for about an hour) is open, so a second checkout is refused,
 * but it has not lapsed, so it is not offered as a payment that did not go
 * through.
 *
 * Each record below is built by the real mapping functions and the real store,
 * linked with the real `linkLicense`, and read back through the real router.
 * Every expected value is a literal, and each wrong reading named in a case is
 * one a mutant in the ledger set (CK17 to CK39) puts back.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { linkLicense } from "../src/grants.js";
import { isManagedSubscription, isOpenSubscription } from "../src/license.js";
import { mapAuthorizedPaymentResource, mapPaymentResource, mapPreapprovalResource } from "../src/mercadopago.js";
import { upsertEntitlement } from "../src/store.js";
import {
  DAY,
  NOW,
  creemSubscriber,
  deliver,
  fakeServices,
  freshEnv,
  iso,
  me,
  openCheckout,
  signIn,
  subscriptionObject
} from "./rt2-kit.mjs";

const PREAPPROVAL = "2c9380848f0a4b3b018f0e1c2d3e4f50";

/** A Mercado Pago preapproval resource, as the API answers it. */
function preapproval(status, at, nextPaymentDate, id) {
  return {
    id: id || PREAPPROVAL,
    status,
    payer_id: 42,
    reason: "Pro mensual",
    external_reference: "pro_monthly",
    auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 19.9, currency_id: "PEN" },
    next_payment_date: iso(nextPaymentDate),
    date_created: iso(at),
    last_modified: iso(at)
  };
}

/** A one-off Mercado Pago payment (Checkout Pro, a payment link): no preapproval behind it. */
function oneOffPayment(at) {
  return {
    id: 9876543210,
    status: "approved",
    date_created: iso(at),
    date_approved: iso(at),
    date_last_updated: iso(at),
    transaction_amount: 19.9,
    currency_id: "PEN",
    external_reference: "pro_monthly",
    payer: { id: 42 }
  };
}

/** A signed-in account with nothing bought yet. */
async function account() {
  const env = freshEnv();
  const services = fakeServices();
  const token = await signIn(env, services, "buyer@example.test", NOW);
  const id = (await me(env, token, NOW + 2)).body.account.id;
  return { env, services, token, id };
}

/**
 * The subscription's first instalment, collected (the documented shape of
 * GET /authorized_payments/{id}). Since VG-84 a Mercado Pago subscription
 * entitles, and can lapse, only once a charge like this has arrived.
 */
async function firstChargeCollected(who, at, preapprovalId) {
  const { record } = await upsertEntitlement(who.env.ENTITLEMENTS, mapAuthorizedPaymentResource({
    id: 7000001,
    preapproval_id: preapprovalId || PREAPPROVAL,
    status: "processed",
    debit_date: iso(at),
    last_modified: iso(at),
    payment: { id: 5550001, status: "approved", status_detail: "accredited" }
  }, {}), { now: at });
  assert.equal(record.paid, true, "precondition: the first charge is collected");
  return record;
}

/** Store an update through the real store and link the licence to the account. */
async function linked(who, update, at) {
  const { record } = await upsertEntitlement(who.env.ENTITLEMENTS, update, { now: at });
  const link = await linkLicense(who.env.DB, who.id, record.licenseId, update.provider, at);
  assert.equal(link.ok, true, JSON.stringify(link));
  return record;
}

/** What the page and a press of Subscribe would get, at `at`. */
async function answers(who, at) {
  const view = await me(who.env, who.token, at);
  const before = who.services.checkouts();
  const press = await openCheckout(who.env, who.services, who.token, "pro_yearly", at);
  return {
    pro: view.body.entitlement.pro,
    rails: view.body.billingRails,
    status: press.status,
    body: press.body,
    creemCalls: who.services.checkouts() - before
  };
}

/** The refusal, exactly: nothing reached Creem. */
function assertRefused(got, provider, label) {
  assert.equal(got.status, 409, `${label}: ${JSON.stringify(got.body)}`);
  assert.deepEqual(got.body, { ok: false, reason: "subscription_open", provider }, label);
  assert.equal(got.creemCalls, 0, `${label}: a refusal costs Creem nothing`);
}

/** The control: a checkout opens. */
function assertOpened(got, label) {
  assert.equal(got.status, 200, `${label}: ${JSON.stringify(got.body)}`);
  assert.equal(got.body.ok, true, label);
  assert.equal(got.creemCalls, 1, `${label}: one Creem checkout`);
}

/* ------------------------------------------------------- money-7: the rails */

test("a one-off Mercado Pago month names no subscription and blocks no checkout, during its month or after it", async () => {
  // Wrong (money-7): `status !== "canceled"` counted it, so after its month the
  // page said "your subscription is still open" to somebody who bought one month.
  const who = await account();
  const record = await linked(who, mapPaymentResource(oneOffPayment(NOW + 10), {}), NOW + 10);
  assert.equal(record.subscriptionId, null, "precondition: nothing charges it again");
  const during = await answers(who, NOW + 5 * DAY);
  assert.equal(during.pro, true, "precondition: the month it paid for gives Pro");
  assert.deepEqual(during.rails, []);
  assertOpened(during, "during the month");
  const after = await answers(who, NOW + 45 * DAY);
  assert.equal(after.pro, false);
  assert.deepEqual(after.rails, [], "after its month: no 'subscription still open'");
  assertOpened(after, "after the month");
});

test("a preapproval nobody authorized is not an open subscription", async () => {
  // Wrong: a "pending" preapproval (created, never authorized: no card behind
  // it) was offered as an open subscription and would block a checkout.
  const who = await account();
  const record = await linked(who, mapPreapprovalResource(preapproval("pending", NOW + 10, NOW + 30 * DAY), {}), NOW + 10);
  assert.equal(record.status, "pending", "precondition");
  const got = await answers(who, NOW + 5 * DAY);
  assert.deepEqual(got.rails, []);
  assertOpened(got, "pending preapproval");
});

test("a cancelled Mercado Pago subscription is not open either", async () => {
  const who = await account();
  await linked(who, mapPreapprovalResource(preapproval("authorized", NOW + 10, NOW + 30 * DAY), {}), NOW + 10);
  const record = await linked(who, mapPreapprovalResource(preapproval("cancelled", NOW + 2 * DAY, NOW + 30 * DAY), {}), NOW + 2 * DAY);
  assert.equal(record.status, "canceled", "precondition");
  assert.equal(record.endedAt, undefined, "precondition: only its status says it is over");
  const got = await answers(who, NOW + 40 * DAY);
  assert.deepEqual(got.rails, []);
  assertOpened(got, "cancelled preapproval");
});

test("an authorized Mercado Pago subscription past its period end is open: rail named, second checkout refused", async () => {
  // The charge is being retried (Mercado Pago: up to four tries in ten days,
  // and it cancels only after three instalments are turned down).
  const who = await account();
  const record = await linked(who, mapPreapprovalResource(preapproval("authorized", NOW + 10, NOW + 30 * DAY), {}), NOW + 10);
  assert.equal(record.status, "active", "precondition");
  await firstChargeCollected(who, NOW + 3600);
  const got = await answers(who, NOW + 40 * DAY);
  assert.equal(got.pro, false, "precondition: its period is over");
  assert.deepEqual(got.rails, ["mercadopago"]);
  // Wrong: the guard reads only Creem's records, or names Creem for every rail.
  assertRefused(got, "mercadopago", "Mercado Pago subscription being retried");
});

/* ----------------------------------- paid:false (VG-84): open, not lapsed */

test("a subscription waiting for its first charge blocks a second checkout and is not offered as lapsed", async () => {
  // VG-84 starts a Mercado Pago subscription with paid:false until its first
  // charge lands, about an hour after it is authorized. Two wrong readings:
  // counting it in billingRails tells a new subscriber "a payment didn't go
  // through"; leaving it out of the guard lets them buy a second subscription
  // whose charge is taken beside the first.
  const who = await account();
  const record = await linked(who, { ...mapPreapprovalResource(preapproval("authorized", NOW + 10, NOW + 30 * DAY), {}), paid: false }, NOW + 10);
  assert.equal(record.paid, false, "precondition");
  const got = await answers(who, NOW + 600);
  assert.equal(got.pro, false, "precondition: no Pro before the money");
  assert.deepEqual(got.rails, [], "waiting, not lapsed");
  assertRefused(got, "mercadopago", "first charge on its way");
});

test("a first charge that was turned down is a payment that did not go through: rail named, checkout refused", async () => {
  // Control for the case above: paid:false alone is waiting; paid:false with
  // the payment failed is not waiting any more (license.js isAwaitingPayment),
  // and the page's "a payment that didn't go through" is then true. No rail
  // writes this pair on an open subscription today (Stripe's failed checkout
  // is also "canceled"); it is the contract for VG-84's failed first charge,
  // written through the real store as a second, later update.
  const who = await account();
  const record = await linked(who, { ...mapPreapprovalResource(preapproval("authorized", NOW + 10, NOW + 30 * DAY), {}), paid: false }, NOW + 10);
  const { record: failed } = await upsertEntitlement(who.env.ENTITLEMENTS, {
    provider: "mercadopago",
    subscriptionId: record.subscriptionId,
    paymentFailed: true,
    occurredAt: NOW + DAY
  }, { now: NOW + DAY });
  assert.equal(failed.status, "active", "precondition: still an open subscription");
  assert.equal(failed.paid, false, "precondition");
  assert.equal(failed.paymentFailed, true, "precondition");
  const got = await answers(who, NOW + 2 * DAY);
  assert.deepEqual(got.rails, ["mercadopago"]);
  assertRefused(got, "mercadopago", "first charge turned down");
});

/* ------------------------------------------- money-3 / states-1: Creem */

test("a Creem renewal that failed at the period end refuses a second subscription and still names its rail", async () => {
  // Between the failed renewal and Creem's daily expiry check the record is
  // still "active" with its period over (this worker does not subscribe to
  // subscription.past_due). Wrong (money-3): the worker opened a second Creem
  // checkout here, and a third.
  const { env, services, token, periodEnd } = await creemSubscriber();
  const who = { env, services, token };
  const got = await answers(who, periodEnd + 12 * 3600);
  assert.equal(got.pro, false, "precondition: the period is over");
  assert.deepEqual(got.rails, ["creem"]);
  assertRefused(got, "creem", "renewal failed");
  const monthly = await openCheckout(env, services, token, "pro_monthly", periodEnd + 13 * 3600);
  assert.equal(monthly.status, 409, "the other plan too");
  assert.equal(services.checkouts(), 1, "Creem was asked for one checkout in all");
});

test("a Creem subscription in dunning (past_due) or paused is open; a cancelled one is not", async () => {
  for (const [label, eventType, status, open] of [
    ["past_due", "subscription.update", "past_due", true],
    ["paused", "subscription.paused", "paused", true],
    ["canceled", "subscription.canceled", "canceled", false]
  ]) {
    const { env, services, token, periodEnd } = await creemSubscriber();
    const extra = status === "canceled" ? { canceled_at: iso(periodEnd) } : {};
    assert.equal(await deliver(env, `evt_${label}`, eventType, subscriptionObject(status, periodEnd, extra), periodEnd), 200);
    const got = await answers({ env, services, token }, periodEnd + 2 * DAY);
    assert.equal(got.pro, false, `${label}: precondition`);
    if (open) {
      assert.deepEqual(got.rails, ["creem"], label);
      assertRefused(got, "creem", label);
    } else {
      assert.deepEqual(got.rails, [], label);
      assertOpened(got, label);
    }
  }
});

test("an active Creem subscriber with Pro is refused a second checkout for the other plan", async () => {
  // The stated price of the rule: a monthly subscriber who wants yearly
  // changes plan on Creem's pages, not by buying a second subscription.
  const { env, services, token } = await creemSubscriber();
  const got = await answers({ env, services, token }, NOW + 10 * DAY);
  assert.equal(got.pro, true, "precondition");
  assertRefused(got, "creem", "Pro is active");
});

test("an older open subscription behind a newer closed licence still refuses", async () => {
  // Wrong: only the newest linked licence is looked at, so a one-off month
  // linked after a subscription hides the subscription from the guard.
  const who = await account();
  await linked(who, mapPreapprovalResource(preapproval("authorized", NOW + 10, NOW + 30 * DAY), {}), NOW + 10);
  await firstChargeCollected(who, NOW + 3600);
  await linked(who, mapPaymentResource(oneOffPayment(NOW + 20 * DAY), {}), NOW + 20 * DAY);
  const got = await answers(who, NOW + 60 * DAY);
  assert.deepEqual(got.rails, ["mercadopago"]);
  assertRefused(got, "mercadopago", "older subscription, newer one-off");
});

test("an account with nothing bought opens a checkout", async () => {
  const who = await account();
  const got = await answers(who, NOW + 60);
  assert.deepEqual(got.rails, []);
  assertOpened(got, "nothing bought");
});

/* ------------------------------------------------- the predicate itself */

test("a record with a deletion on it is not open, whatever its status still says", () => {
  // No path in this worker writes an ending without "canceled" today; the
  // clause is what keeps a future one (or a record read before its status
  // caught up) from being offered as open. Control: the same record without
  // the ending is open.
  const base = { provider: "creem", subscriptionId: "sub_1", status: "active", paid: true, periodEnd: NOW };
  assert.equal(isOpenSubscription(base), true);
  assert.equal(isOpenSubscription({ ...base, endedAt: NOW - DAY }), false);
  assert.equal(isManagedSubscription({ ...base, endedAt: NOW - DAY }), false);
  // And the two predicates differ only on money still on its way.
  assert.equal(isOpenSubscription({ ...base, paid: false }), true);
  assert.equal(isManagedSubscription({ ...base, paid: false }), false);
  assert.equal(isManagedSubscription(base), true);
  // A record with no provider names no rail.
  assert.equal(isOpenSubscription({ ...base, provider: null }), false);
});
