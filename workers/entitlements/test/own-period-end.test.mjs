/**
 * What period did this money buy?
 *
 * Both rails answer that question twice over and the two answers disagree. An
 * event names a period, and the charge inside it implies one (a plan interval
 * counted from when the money moved). `upsertEntitlement` has to pick, and
 * both ways of picking it wrongly cost somebody something:
 *
 *   - Counting an interval from every charge hands out a free month on any
 *     payment taken mid-cycle: an upgrade, a proration, an invoice retried
 *     after dunning. That was CR12, fixed in `ee862ce`.
 *   - Trusting every named period takes a paid month AWAY when the name is
 *     not the period that was bought: a snapshot serialised before the period
 *     rolled over, or an invoice line for the period that just closed. That
 *     was the regression `ee862ce` introduced, found here.
 *
 * The rule these tests pin is the narrow one that is right both times: a named
 * period stands in for the charge only when it was still running at the moment
 * of the charge. A period that had already ended cannot be what the charge
 * bought, so the interval is counted instead. The errors are not symmetric and
 * the tie-break follows that: at the exact boundary we count the interval and
 * may give a month away, because taking access from somebody who paid is the
 * worse failure.
 *
 * Facts these tests are built on, read from the providers on 3 November 2026
 * rather than remembered:
 *
 *   - An invoice's `lines` are "sorted as follows: (1) pending invoice items
 *     (including prorations) in reverse chronological order, (2) subscription
 *     items in reverse chronological order, and (3) invoice items added after
 *     invoice creation in chronological order" (docs.stripe.com/api/invoices/object).
 *     So after any plan change the renewal invoice's FIRST line is a proration,
 *     and `lines.data[0]` is the period that just ended. That is OPS2 and OPS3.
 *   - A line's `period` "For subscription line items ... is the subscription
 *     period. For prorations, this starts when the proration was calculated,
 *     and ends at the period end of the subscription"
 *     (docs.stripe.com/api/invoice-line-item/object).
 *   - A proration is flagged at `parent.subscription_item_details.proration`
 *     or `parent.invoice_item_details.proration`, both documented as "Whether
 *     this is a proration", with `parent.type` one of `subscription_item_details`
 *     or `invoice_item_details` (same page). Before 2025-03-31 the same facts
 *     were a top-level `proration` boolean and `type: "invoiceitem"`. Both
 *     shapes are tested because the shape we get follows the API version the
 *     account is pinned to, which is not ours to choose.
 *   - Creem's `subscription.paid` "Fires for the first payment and every
 *     renewal" (docs.creem.io/code/webhooks), and the only sample payload is a
 *     first payment. The docs do not say whether `current_period_end_date` on
 *     a renewal is the new period or the one just paid off, and do not promise
 *     a `subscription.update` at renewal. OPC2 is that silence: if the snapshot
 *     names the previous period, the renewal must still buy its month.
 *
 * Adopted from QA round 8c with its expectations unchanged. The four that were
 * red (OPS2, OPS2d, OPS3, OPC2) and the eight controls that were green are
 * recorded in VG-53 and VG-54.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { handleRequest } from "../src/index.js";
import { createFakeKv, createTestEnv } from "./fixtures.mjs";

const DAY = 86400;
const T = Math.floor(Date.now() / 1000);
const hmacHex = (secret, message) => createHmac("sha256", secret).update(message).digest("hex");
const freshEnv = (extra) => createTestEnv({ ENTITLEMENTS: createFakeKv(), ...(extra || {}) });
const iso = (days) => new Date((T + days * DAY) * 1000).toISOString();
const ms = (days) => (T + days * DAY) * 1000;

async function at(atDays, fn) {
  const real = Date.now;
  Date.now = () => (T + Math.round(atDays * DAY)) * 1000;
  try { return await fn(); } finally { Date.now = real; }
}

// ---------------- Stripe ----------------
function stripe(env, id, type, atDays, object) {
  const raw = JSON.stringify({ id, type, created: T + Math.round(atDays * DAY), data: { object } });
  const ts = Math.floor(Date.now() / 1000);
  return handleRequest(new Request("https://w.test/v1/webhooks/stripe", {
    method: "POST", body: raw,
    headers: { "Stripe-Signature": `t=${ts},v1=${hmacHex(env.STRIPE_WEBHOOK_SECRET, `${ts}.${raw}`)}` }
  }), env);
}
async function stripeClaim(env, sessionId, atDays) {
  return at(atDays, async () => (await handleRequest(new Request("https://w.test/v1/claim", {
    method: "POST", body: JSON.stringify({ provider: "stripe", sessionId }), headers: { "content-type": "application/json" }
  }), env)).status);
}
const subCheckout = (sid, sub, cus) => ({ id: sid, mode: "subscription", customer: cus, subscription: sub, payment_intent: null, payment_status: "paid" });
const line = (s, e, over) => ({ period: { start: T + s * DAY, end: T + e * DAY }, ...(over || {}) });
const invoice = (id, cus, sub, pi, lines) => ({ id, customer: cus, subscription: sub, payment_intent: pi, lines: { data: lines } });
const stripeSub = (id, cus, endDays) => ({ id, customer: cus, status: "active", current_period_end: T + endDays * DAY });

async function stripeMonthOne(env) {
  await stripe(env, "e1", "checkout.session.completed", 0, subCheckout("cs", "sub", "cus"));
  await stripe(env, "e2", "invoice.paid", 0, invoice("in1", "cus", "sub", "pi_1", [line(0, 31)]));
  assert.equal(await stripeClaim(env, "cs", 1), 200, "setup: month one is live");
}

test("OPS0 control: two months, one subscription line each: access to day 62 and not a day more", async () => {
  const env = freshEnv(); await stripeMonthOne(env);
  await stripe(env, "e3", "invoice.paid", 31, invoice("in2", "cus", "sub", "pi_2", [line(31, 62)]));
  assert.equal(await stripeClaim(env, "cs", 40), 200);
  assert.equal(await stripeClaim(env, "cs", 61), 200);
  assert.equal(await stripeClaim(env, "cs", 63), 403, "month two is over");
});

test("OPS1 control: a proration invoice taken mid-cycle (period day 15 to the period end, day 31) gives no extra month (G2)", async () => {
  const env = freshEnv(); await stripeMonthOne(env);
  await stripe(env, "e3", "invoice.paid", 15, invoice("in2", "cus", "sub", "pi_2", [line(15, 31, { proration: true })]));
  assert.equal(await stripeClaim(env, "cs", 20), 200);
  assert.equal(await stripeClaim(env, "cs", 33), 403, "nothing paid for after day 31");
});

test("OPS2b control: the renewal after an upgrade, subscription line listed BEFORE the proration: month two is honoured", async () => {
  const env = freshEnv(); await stripeMonthOne(env);
  await stripe(env, "e3", "invoice.paid", 31, invoice("in2", "cus", "sub", "pi_2", [line(31, 62), line(15, 31, { proration: true })]));
  assert.equal(await stripeClaim(env, "cs", 40), 200);
});

test("OPS2 the renewal after an upgrade, lines in the order Stripe documents (prorations first): month two must still be honoured (G1)", async () => {
  const env = freshEnv(); await stripeMonthOne(env);
  // The customer upgraded on day 15; its proration is a pending item, so it is the invoice's first line.
  await stripe(env, "e3", "invoice.paid", 31, invoice("in2", "cus", "sub", "pi_2", [line(15, 31, { proration: true }), line(31, 62)]));
  assert.equal(await stripeClaim(env, "cs", 40), 200, "the invoice was paid; its subscription line says day 62");
  assert.equal(await stripeClaim(env, "cs", 63), 403, "and not a day beyond");
});

test("OPS2d the same renewal in the 2025-03-31 API shape (proration flagged under parent.subscription_item_details): month two is honoured", async () => {
  const env = freshEnv(); await stripeMonthOne(env);
  const proration = line(15, 31, { parent: { type: "subscription_item_details", subscription_item_details: { proration: true } } });
  const own = line(31, 62, { parent: { type: "subscription_item_details", subscription_item_details: { proration: false } } });
  await stripe(env, "e3", "invoice.paid", 31, invoice("in2", "cus", "sub", "pi_2", [proration, own]));
  assert.equal(await stripeClaim(env, "cs", 40), 200);
});

test("OPS3 an upgrade from monthly to yearly: the credit for the unused monthly time is the first line, the yearly line is the renewal: the plan is yearly and the year is honoured (G1)", async () => {
  const env = freshEnv({ STRIPE_PRICE_PRO_MONTHLY: "price_m", STRIPE_PRICE_PRO_YEARLY: "price_y" });
  await stripe(env, "e1", "checkout.session.completed", 0, subCheckout("cs", "sub", "cus"));
  await stripe(env, "e2", "invoice.paid", 0, invoice("in1", "cus", "sub", "pi_1", [line(0, 31, { price: { id: "price_m" } })]));
  const credit = line(15, 31, { proration: true, price: { id: "price_m" } });
  const remaining = line(15, 31, { proration: true, price: { id: "price_y" } });
  const yearly = line(31, 31 + 365, { price: { id: "price_y" } });
  await stripe(env, "e3", "invoice.paid", 31, invoice("in2", "cus", "sub", "pi_2", [credit, remaining, yearly]));
  assert.equal(await stripeClaim(env, "cs", 200), 200, "a year was paid for at day 31");
  assert.equal(await stripeClaim(env, "cs", 31 + 366), 403, "and not a day more");
});

test("OPS5 control: a one-off invoice item with a long period on the renewal invoice is not a year of Pro (only the subscription's own line says what was bought)", async () => {
  const env = freshEnv(); await stripeMonthOne(env);
  await stripe(env, "e3", "invoice.paid", 31, invoice("in2", "cus", "sub", "pi_2", [line(31, 62), line(31, 31 + 365, { type: "invoiceitem" })]));
  assert.equal(await stripeClaim(env, "cs", 40), 200);
  assert.equal(await stripeClaim(env, "cs", 63), 403, "an add-on is not a longer subscription");
});

test("OPS5d the same add-on in the 2025-03-31 API shape (its parent is an invoice item, and it claims no proration): still not a year of Pro", async () => {
  const env = freshEnv(); await stripeMonthOne(env);
  const own = line(31, 62, { parent: { type: "subscription_item_details", subscription_item_details: { subscription_item: "si_1", proration: false } } });
  const addOn = line(31, 31 + 365, { parent: { type: "invoice_item_details", invoice_item_details: { invoice_item: "ii_1", proration: false } } });
  await stripe(env, "e3", "invoice.paid", 31, invoice("in2", "cus", "sub", "pi_2", [own, addOn]));
  assert.equal(await stripeClaim(env, "cs", 40), 200);
  assert.equal(await stripeClaim(env, "cs", 63), 403, "an add-on is not a longer subscription, in either API shape");
});

test("OPS2c the same renewal, and the subscription's own event arrives afterwards: it heals (shows the exposure is the gap, not the end state)", async () => {
  const env = freshEnv(); await stripeMonthOne(env);
  await stripe(env, "e3", "invoice.paid", 31, invoice("in2", "cus", "sub", "pi_2", [line(15, 31, { proration: true }), line(31, 62)]));
  await stripe(env, "e4", "customer.subscription.updated", 31.001, stripeSub("sub", "cus", 62));
  assert.equal(await stripeClaim(env, "cs", 40), 200);
});

// ---------------- Creem ----------------
function creem(env, id, eventType, atDays, object, options) {
  const raw = JSON.stringify({ id, eventType, created_at: ms(atDays), object });
  return handleRequest(new Request("https://w.test/v1/webhooks/creem", {
    method: "POST", body: raw, headers: { "creem-signature": hmacHex(env.CREEM_WEBHOOK_SECRET, raw) }
  }), env, options);
}
async function creemClaim(env, checkoutId, atDays) {
  return at(atDays, async () => (await handleRequest(new Request("https://w.test/v1/claim", {
    method: "POST", body: JSON.stringify({ provider: "creem", sessionId: checkoutId }), headers: { "content-type": "application/json" }
  }), env)).status);
}
const checkout = (id, subscriptionId, over) => ({
  id, object: "checkout", status: "completed", mode: "prod", request_id: null,
  order: { id: "ord_1", amount: 1000, currency: "USD", status: "paid", type: "recurring", transaction: "tran_1" },
  product: { id: "prod_monthly", name: "Pro Monthly", billing_type: "recurring", billing_period: "every-month" },
  customer: { id: "cust_1", email: "singer@example.com" },
  subscription: subscriptionId ? { id: subscriptionId, object: "subscription", status: "active" } : null,
  metadata: {}, ...(over || {})
});
const csub = (id, status, startDays, endDays, over) => ({
  id, object: "subscription", status, collection_method: "charge_automatically",
  product: { id: "prod_monthly", name: "Pro Monthly", billing_period: "every-month" },
  customer: { id: "cust_1", email: "singer@example.com" },
  items: [{ id: "sitem_1", product_id: "prod_monthly", units: 1 }],
  current_period_start_date: iso(startDays), current_period_end_date: iso(endDays), canceled_at: null, ...(over || {})
});
const cpaid = (id, tran, startDays, endDays, chargedDays, over) => csub(id, "active", startDays, endDays, {
  last_transaction_id: tran, last_transaction: { id: tran, amount: 1000, amount_paid: 1000, status: "paid" },
  last_transaction_date: iso(chargedDays), next_transaction_date: iso(endDays), ...(over || {})
});
async function creemMonthOne(env) {
  await creem(env, "c1", "checkout.completed", 0, checkout("ch_1", "sub_1"));
  await creem(env, "c2", "subscription.paid", 0, cpaid("sub_1", "tran_1", 0, 31, 0));
  assert.equal(await creemClaim(env, "ch_1", 1), 200, "setup: month one is live");
}

test("OPC0 control: a renewal that names the NEW period (the docs sample's shape): access to day 62, not a day beyond", async () => {
  const env = freshEnv(); await creemMonthOne(env);
  await creem(env, "c3", "subscription.paid", 31, cpaid("sub_1", "tran_2", 31, 62, 31));
  assert.equal(await creemClaim(env, "ch_1", 40), 200);
  assert.equal(await creemClaim(env, "ch_1", 61), 200);
  assert.equal(await creemClaim(env, "ch_1", 63), 403);
});

test("OPC1 control: a charge taken mid-period that names the current period gives no extra month (G2; the fix of CR12)", async () => {
  const env = freshEnv(); await creemMonthOne(env);
  await creem(env, "c3", "subscription.paid", 15, cpaid("sub_1", "tran_2", 0, 31, 15));
  assert.equal(await creemClaim(env, "ch_1", 20), 200);
  assert.equal(await creemClaim(env, "ch_1", 33), 403, "the period ended at day 31 and nothing later was paid for");
});

test("OPC2 a renewal whose subscription snapshot still names the PREVIOUS period (the docs do not say which a renewal carries): the charge still buys its month (G1)", async () => {
  const env = freshEnv(); await creemMonthOne(env);
  // charged on day 31, but the object was serialised before the period rolled: period 0..31
  await creem(env, "c3", "subscription.paid", 31, cpaid("sub_1", "tran_2", 0, 31, 31));
  assert.equal(await creemClaim(env, "ch_1", 40), 200, "tran_2 is new money charged at day 31");
  assert.equal(await creemClaim(env, "ch_1", 63), 403, "and a month is all it bought");
});

test("OPC3 a renewal collected nine days late, after access had already lapsed: it buys the period it was for, not a month from the day it cleared (G2)", async () => {
  const env = freshEnv(); await creemMonthOne(env);
  // Month two's charge was turned down and retried; it cleared on day 40, and
  // says what it was for: period 31..62. Access lapsed at day 31 in between.
  assert.equal(await creemClaim(env, "ch_1", 35), 403, "setup: month one had run out");
  await creem(env, "c3", "subscription.paid", 40, cpaid("sub_1", "tran_2", 31, 62, 40));
  assert.equal(await creemClaim(env, "ch_1", 50), 200, "the month it paid for is live again");
  assert.equal(await creemClaim(env, "ch_1", 63), 403, "and it bought that month, not a month from the day it cleared");
});

// ---------------- the test-mode gate ----------------
const modeEnv = (extra) => freshEnv(extra);
async function firstPurchase(env, mode) {
  const body = checkout("ch_1", "sub_1", mode === undefined ? { mode: undefined } : { mode });
  await creem(env, "m1", "checkout.completed", 0, body);
  await creem(env, "m2", "subscription.paid", 0, cpaid("sub_1", "tran_1", 0, 31, 0, mode === undefined ? {} : { mode }));
  return creemClaim(env, "ch_1", 1);
}

test("MG1 control: a production event entitles", async () => {
  assert.equal(await firstPurchase(modeEnv(), "prod"), 200);
});
for (const mode of ["test", "sandbox", "local"]) {
  test(`MG2 mode "${mode}" entitles nobody by default (G3)`, async () => {
    const status = await firstPurchase(modeEnv(), mode);
    assert.notEqual(status, 200, `a ${mode}-mode purchase must not give Pro`);
  });
  test(`MG3 mode "${mode}" entitles when the operator set CREEM_ALLOW_TEST_MODE=true (the way to test the rail end to end)`, async () => {
    assert.equal(await firstPurchase(modeEnv({ CREEM_ALLOW_TEST_MODE: "true" }), mode), 200);
  });
}
test("MG4 an event that names no mode is a real customer's, not a test (G3: the dangerous direction is refusing money)", async () => {
  assert.equal(await firstPurchase(modeEnv(), undefined), 200);
});
test("MG5 an unrecognised mode word is a real customer's too", async () => {
  assert.equal(await firstPurchase(modeEnv(), "live"), 200);
});
test("MG6 the allow flag must be exactly the word true: 'false', '0', '' and 'TRUE ' do not open the gate", async () => {
  for (const flag of ["false", "0", "", "no", "1"]) {
    const status = await firstPurchase(modeEnv({ CREEM_ALLOW_TEST_MODE: flag }), "test");
    assert.notEqual(status, 200, `CREEM_ALLOW_TEST_MODE=${JSON.stringify(flag)} must not let test-mode money in`);
  }
});
