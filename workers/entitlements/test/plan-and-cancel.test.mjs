/**
 * Which plan is this, and when does the month end?
 *
 * Two questions a payment event answers badly and a state event answers well,
 * and the faults here are both of the first kind:
 *
 *   - PL1: a proration line's price is the plan the customer is LEAVING as
 *     often as the one they are joining, because Stripe lists the credit for
 *     unused time before the debit for the new plan. So an immediate upgrade,
 *     invoiced at once, relabelled a yearly licence as monthly. Access was
 *     never affected (the period is named), only what the licence says it is,
 *     and the next subscription event corrected it. Now only the
 *     subscription's own line may name a plan.
 *   - CU3: `subscriptionPeriodEnd` fell back to `canceled_at` when no period
 *     end was given. Creem's own API reference marks `current_period_end_date`
 *     optional and describes `canceled_at` as "The date and time when the
 *     subscription was canceled, if applicable" (read 3 November 2026), and
 *     `scheduled_cancel` is a documented status, so for a subscription that
 *     will not renew the cancel date is when the customer clicked and is
 *     always in the past. Used as a period end it replaced a month that had
 *     been paid for with the moment they changed their mind. The fallback is
 *     gone: an absent period end is no statement, not a guess.
 *
 * CU1 is the policy that came out of the same pass, and it is a judgement
 * rather than a fact: a Creem subscription event's period can now only lengthen
 * access. The reasoning is at `periodEndIsFloor` in src/creem.js, and the test
 * that used to assert the opposite is in creem.test.mjs with its own note.
 *
 * Adopted from QA round 8d with its expectations unchanged, except that CU1
 * asserts the decision instead of printing what it observed. VG-55 and VG-56.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { handleRequest } from "../src/index.js";
import { createFakeKv, createTestEnv } from "./fixtures.mjs";

const DAY = 86400;
const T = Math.floor(Date.now() / 1000);
const hmacHex = (secret, message) => createHmac("sha256", secret).update(message).digest("hex");
const prices = { STRIPE_PRICE_PRO_MONTHLY: "price_m", STRIPE_PRICE_PRO_YEARLY: "price_y" };
const freshEnv = (extra) => createTestEnv({ ENTITLEMENTS: createFakeKv(), ...(extra || {}) });
const iso = (days) => new Date((T + days * DAY) * 1000).toISOString();
const ms = (days) => (T + Math.round(days * DAY)) * 1000;

async function at(atDays, fn) {
  const real = Date.now;
  Date.now = () => (T + Math.round(atDays * DAY)) * 1000;
  try { return await fn(); } finally { Date.now = real; }
}
function stripe(env, id, type, atDays, object) {
  const raw = JSON.stringify({ id, type, created: T + Math.round(atDays * DAY), data: { object } });
  const ts = Math.floor(Date.now() / 1000);
  return handleRequest(new Request("https://w.test/v1/webhooks/stripe", {
    method: "POST", body: raw, headers: { "Stripe-Signature": `t=${ts},v1=${hmacHex(env.STRIPE_WEBHOOK_SECRET, `${ts}.${raw}`)}` }
  }), env);
}
async function claim(env, provider, sessionId, atDays) {
  return at(atDays, async () => {
    const r = await handleRequest(new Request("https://w.test/v1/claim", { method: "POST", body: JSON.stringify({ provider, sessionId }), headers: { "content-type": "application/json" } }), env);
    return { status: r.status, body: r.status === 200 ? await r.json() : null };
  });
}
const line = (s, e, over) => ({ period: { start: T + s * DAY, end: T + e * DAY }, ...(over || {}) });
const invoice = (id, lines) => ({ id, customer: "cus", subscription: "sub", payment_intent: "pi_" + id, lines: { data: lines } });
const stripeSub = (priceId, endDays) => ({ id: "sub", customer: "cus", status: "active", current_period_end: T + endDays * DAY, items: { data: [{ price: { id: priceId } }] } });
const co = { id: "cs", mode: "subscription", customer: "cus", subscription: "sub", payment_intent: null, payment_status: "paid" };

const credit = line(15, 31, { proration: true, amount: -500, price: { id: "price_m" } });
const debit = line(15, 31, { proration: true, amount: 1500, price: { id: "price_y" } });

test("PL1b control: yearly learned from the subscription's event, then the immediate-proration invoice with the DEBIT line first: still yearly", async () => {
  const env = freshEnv(prices);
  await stripe(env, "e1", "checkout.session.completed", 0, co);
  await stripe(env, "e2", "invoice.paid", 0, invoice("in1", [line(0, 31, { price: { id: "price_m" } })]));
  await stripe(env, "e3", "customer.subscription.updated", 15, stripeSub("price_y", 31));
  await stripe(env, "e4", "invoice.paid", 15, invoice("in2", [debit, credit]));
  const c = await claim(env, "stripe", "cs", 16);
  assert.equal(c.status, 200);
  assert.equal(c.body.entitlement.plan, "pro_yearly");
});

test("PL1 the same invoice with the CREDIT line first (the plan the customer left): the plan the subscription's own event taught stays", async () => {
  const env = freshEnv(prices);
  await stripe(env, "e1", "checkout.session.completed", 0, co);
  await stripe(env, "e2", "invoice.paid", 0, invoice("in1", [line(0, 31, { price: { id: "price_m" } })]));
  await stripe(env, "e3", "customer.subscription.updated", 15, stripeSub("price_y", 31));
  await stripe(env, "e4", "invoice.paid", 15, invoice("in2", [credit, debit]));
  const c = await claim(env, "stripe", "cs", 16);
  assert.equal(c.status, 200);
  assert.equal(c.body.entitlement.plan, "pro_yearly", "a credit for time on the old plan is not a statement of the plan the subscription is on");
});

// ---------------- Creem: what a state event does to a period a paid event set ----------------
function creem(env, id, eventType, atDays, object) {
  const raw = JSON.stringify({ id, eventType, created_at: ms(atDays), object });
  return handleRequest(new Request("https://w.test/v1/webhooks/creem", { method: "POST", body: raw, headers: { "creem-signature": hmacHex(env.CREEM_WEBHOOK_SECRET, raw) } }), env);
}
const csub = (status, startDays, endDays, over) => ({
  id: "sub_1", object: "subscription", status, collection_method: "charge_automatically",
  product: { id: "prod_monthly", billing_period: "every-month" }, customer: { id: "cust_1" },
  items: [{ id: "si", product_id: "prod_monthly", units: 1 }],
  current_period_start_date: iso(startDays), current_period_end_date: iso(endDays), canceled_at: null, ...(over || {})
});
const cpaid = (tran, startDays, endDays, chargedDays) => csub("active", startDays, endDays, {
  last_transaction_id: tran, last_transaction: { id: tran, amount: 1000, amount_paid: 1000, status: "paid" }, last_transaction_date: iso(chargedDays)
});
const cco = { id: "ch_1", object: "checkout", status: "completed", mode: "prod", order: { id: "ord_1", status: "paid", transaction: "tran_1" }, product: { id: "prod_monthly", billing_period: "every-month" }, customer: { id: "cust_1" }, subscription: { id: "sub_1" }, metadata: {} };

async function creemTwoMonths(env) {
  await creem(env, "c1", "checkout.completed", 0, cco);
  await creem(env, "c2", "subscription.paid", 0, cpaid("tran_1", 0, 31, 0));
  await creem(env, "c3", "subscription.paid", 31, cpaid("tran_2", 31, 62, 31));
}

test("CU0 control: two paid months, and a state event that names the same period leaves access to day 62", async () => {
  const env = freshEnv(); await creemTwoMonths(env);
  await creem(env, "c4", "subscription.update", 31.5, csub("active", 31, 62));
  assert.equal((await claim(env, "creem", "ch_1", 50)).status, 200);
  assert.equal((await claim(env, "creem", "ch_1", 63)).status, 403);
});

test("CU1 a state event whose snapshot names the PREVIOUS period cannot take month two away", async () => {
  const env = freshEnv(); await creemTwoMonths(env);
  await creem(env, "c4", "subscription.update", 31.5, csub("active", 0, 31));
  assert.equal((await claim(env, "creem", "ch_1", 40)).status, 200, "month two was paid for at day 31");
  assert.equal((await claim(env, "creem", "ch_1", 63)).status, 403, "and a month is still all it bought");
});

test("CU2 a canceled-at-period-end subscription (status active, canceled_at set to the period end) keeps access to the end of the paid month", async () => {
  const env = freshEnv(); await creemTwoMonths(env);
  await creem(env, "c4", "subscription.update", 40, csub("active", 31, 62, { canceled_at: iso(62) }));
  assert.equal((await claim(env, "creem", "ch_1", 50)).status, 200, "paid through day 62");
  assert.equal((await claim(env, "creem", "ch_1", 61)).status, 200);
  assert.equal((await claim(env, "creem", "ch_1", 63)).status, 403);
});

test("CU3 an active subscription whose update names no period end and a canceled_at in the PAST (when the customer clicked cancel) does not end a month that was paid for", async () => {
  const env = freshEnv(); await creemTwoMonths(env);
  await creem(env, "c4", "subscription.update", 35, csub("active", 31, 62, { current_period_end_date: null, canceled_at: iso(20) }));
  assert.equal((await claim(env, "creem", "ch_1", 40)).status, 200, "paid through day 62; a cancel date is not a period end");
});

test("CU3b a subscription.canceled with no period end and canceled_at at day 35: a paid one cancelled early keeps the period it paid for (the repo's own stated policy)", async () => {
  const env = freshEnv(); await creemTwoMonths(env);
  await creem(env, "c4", "subscription.canceled", 35, csub("canceled", 31, 62, { current_period_end_date: null, canceled_at: iso(35) }));
  assert.equal((await claim(env, "creem", "ch_1", 40)).status, 200, "money for month two was taken at day 31");
  assert.equal((await claim(env, "creem", "ch_1", 63)).status, 403);
});

test("CU3d the FIRST paid event of a subscription names no period end and carries a cancel date: the month the money bought is counted from the charge, not from the click", async () => {
  const env = freshEnv();
  await creem(env, "c1", "checkout.completed", 0, cco);
  // Cancelled during the first period, with the paid event delivered after it.
  // What this pins is the rule rather than one of its two implementations: a
  // cancel date never becomes a period end, so the month is counted from the
  // charge. Both the floor rule and the removed `canceled_at` fallback give
  // that answer here, and src/creem.js records which of the two is actually
  // doing the work.
  await creem(env, "c2", "subscription.paid", 5, csub("active", 0, 31, {
    current_period_end_date: null,
    canceled_at: iso(5),
    last_transaction_id: "tran_1",
    last_transaction: { id: "tran_1", amount: 1000, amount_paid: 1000, status: "paid" },
    last_transaction_date: iso(0)
  }));
  assert.equal((await claim(env, "creem", "ch_1", 20)).status, 200, "a month was paid for on day 0");
  assert.equal((await claim(env, "creem", "ch_1", 32)).status, 403, "and a month is all it bought");
});

test("CU3c control: the same two events WITH current_period_end_date named keep access to day 62", async () => {
  const env = freshEnv(); await creemTwoMonths(env);
  await creem(env, "c4", "subscription.canceled", 35, csub("canceled", 31, 62, { canceled_at: iso(35) }));
  assert.equal((await claim(env, "creem", "ch_1", 40)).status, 200);
  assert.equal((await claim(env, "creem", "ch_1", 63)).status, 403);
});
