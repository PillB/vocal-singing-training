/**
 * QA round 4 ("worker"): GOAL-behaviour tests for defects found in the current build.
 * They FAIL today. Each is marked `todo` so the suite stays green and the runner lists them;
 * remove `todo` when the defect is fixed. Expected values are hand-written, not computed.
 *
 *   W1  new-customer race: checkout + subscription.created + invoice.paid together must mint ONE license
 *   W2  a Stripe refund / dispute must end the period it paid for (charge.refunded)
 *   W3  a Stripe price outside STRIPE_PRICE_PRO_* must not entitle when the table is configured
 *   W4  the billed recurrence beats free text when naming the plan (MP preapproval)
 *   W5  a paid checkout with no subscription event must not be open-ended
 *   W6  a single-use gift code redeemed by two accounts at once yields ONE grant
 *   W7  a failed renewal invoice with nothing after it must not hand out the whole unpaid period
 *
 * Adopted from an independent QA pass ("round 4"), which wrote them against
 * this tree and confirmed each one fails for the stated reason. They arrived with every test marked `todo` so the suite stayed
 * green while the findings were still open; a `todo` here is therefore a known
 * open defect, not a test that does not matter, and the marker comes off as
 * each one is fixed. W2, W4, W5 and W6 are fixed and running. W1, W3 and W7 are
 * still open: W7 and the amount floor in W3 are decisions for the operator
 * rather than faults, and are named as such in docs/33-ACCOUNTS-AND-PAYMENTS.md.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { ensureAccount } from "../src/accounts.js";
import { ensureSchema, resetSchemaMemo } from "../src/db.js";
import { createGiftCode, redeemGiftCode } from "../src/grants.js";
import { handleRequest } from "../src/index.js";
import { createAccountEnv, createFakeKv, createTestEnv } from "./fixtures.mjs";

const DAY = 86400;
const T = Math.floor(Date.now() / 1000);
const hmacHex = (secret, message) => createHmac("sha256", secret).update(message).digest("hex");
const post = (path, body, headers) => new Request(`https://w.test${path}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body), headers: { "content-type": "application/json", ...(headers || {}) } });

async function stripe(env, event) {
  const raw = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  return handleRequest(post("/v1/webhooks/stripe", raw, { "Stripe-Signature": `t=${ts},v1=${hmacHex(env.STRIPE_WEBHOOK_SECRET, `${ts}.${raw}`)}` }), env);
}
async function claimAt(env, provider, sessionId, days) {
  const real = Date.now;
  Date.now = () => (T + days * DAY) * 1000;
  try { return (await handleRequest(post("/v1/claim", { provider, sessionId }), env)).status; } finally { Date.now = real; }
}
const ev = (id, type, created, object) => ({ id, type, created: T + created, data: { object } });

test("W1 new-customer race: the three events Stripe sends together mint ONE license", { todo: "QA-W-01 split licenses: claim and subscription index point at different records" }, async () => {
  const env = createTestEnv({ ENTITLEMENTS: createFakeKv(), STRIPE_PRICE_PRO_MONTHLY: "price_m" });
  const kv = env.ENTITLEMENTS;
  const get = kv.get.bind(kv), put = kv.put.bind(kv);
  // network latency: every KV call yields to the event loop, so the three requests really interleave
  kv.get = async (k) => { await new Promise((r) => setImmediate(r)); return get(k); };
  kv.put = async (k, v, o) => { await new Promise((r) => setImmediate(r)); return put(k, v, o); };
  const sub = { id: "sub_w1", customer: "cus_w1", status: "active", items: { data: [{ price: { id: "price_m", recurring: { interval: "month", interval_count: 1 } }, current_period_end: T + 30 * DAY }] } };
  const invoice = { id: "in_w1", customer: "cus_w1", parent: { type: "subscription_details", subscription_details: { subscription: "sub_w1" } }, lines: { data: [{ period: { start: T, end: T + 30 * DAY }, pricing: { price_details: { price: "price_m" } } }] } };
  await Promise.all([
    stripe(env, ev("e1", "checkout.session.completed", 0, { id: "cs_w1", mode: "subscription", customer: "cus_w1", subscription: "sub_w1", payment_status: "paid" })),
    stripe(env, ev("e2", "customer.subscription.created", 0, sub)),
    stripe(env, ev("e3", "invoice.paid", 0, invoice))
  ]);
  const licenses = [...kv.store.keys()].filter((k) => k.startsWith("lic:")).length;
  assert.equal(licenses, 1, "one customer, one license");
  // and the license the customer holds hears of the cancellation
  await stripe(env, ev("e4", "customer.subscription.deleted", 40 * DAY, { ...sub, status: "canceled", ended_at: T + 40 * DAY, cancellation_details: { reason: "payment_failed" } }));
  assert.notEqual(await claimAt(env, "stripe", "cs_w1", 200), 200, "an unpaid-cancelled customer is not Pro 160 days later");
});

test("W2 Stripe: charge.refunded ends the access the refunded payment bought", async () => {
  const env = createTestEnv({ ENTITLEMENTS: createFakeKv() });
  await stripe(env, ev("e1", "checkout.session.completed", 0, { id: "cs_w2", mode: "payment", customer: "cus_w2", payment_intent: "pi_w2", payment_status: "paid", metadata: { plan: "pro_yearly" } }));
  assert.equal(await claimAt(env, "stripe", "cs_w2", 1), 200, "control: paid, so entitled");
  await stripe(env, ev("e2", "charge.refunded", 2 * DAY, { id: "ch_w2", customer: "cus_w2", payment_intent: "pi_w2", refunded: true, amount_refunded: 5000, amount: 5000 }));
  assert.notEqual(await claimAt(env, "stripe", "cs_w2", 3), 200, "refunded on day 2, so not Pro on day 3");
});

test("W3 Stripe: a price that is not in the configured table does not entitle", { todo: "QA-W-03 STRIPE_PRICE_* is a label table, never an allowlist" }, async () => {
  const env = createTestEnv({ ENTITLEMENTS: createFakeKv(), STRIPE_PRICE_PRO_MONTHLY: "price_m", STRIPE_PRICE_PRO_YEARLY: "price_y" });
  await stripe(env, ev("e1", "checkout.session.completed", 0, { id: "cs_w3", mode: "subscription", customer: "cus_w3", subscription: "sub_w3", payment_status: "paid" }));
  await stripe(env, ev("e2", "customer.subscription.created", 0, { id: "sub_w3", customer: "cus_w3", status: "active", items: { data: [{ price: { id: "price_donation_1usd", recurring: { interval: "year", interval_count: 1 } }, current_period_end: T + 365 * DAY }] } }));
  assert.notEqual(await claimAt(env, "stripe", "cs_w3", 10), 200, "a $1 donation subscription is not Pro");
});

test("W4 MP preapproval: the billed recurrence decides the plan, not a word in the reason text", async () => {
  const env = createTestEnv({ ENTITLEMENTS: createFakeKv() });
  const iso = (d) => new Date((T + d * DAY) * 1000).toISOString();
  const resource = { id: "pa_w4", status: "authorized", payer_id: 1, reason: "Vocal Studio Pro monthly (yearly also available)", auto_recurring: { frequency: 1, frequency_type: "months" }, next_payment_date: iso(31), date_last_updated: iso(0) };
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = hmacHex(env.MP_WEBHOOK_SECRET, `id:pa_w4;request-id:r;ts:${ts};`);
  await handleRequest(post("/v1/webhooks/mercadopago?data.id=pa_w4&type=subscription_preapproval", { id: 1, type: "subscription_preapproval", data: { id: "pa_w4" } }, { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": "r" }), env, { fetchImpl: async () => ({ ok: true, status: 200, async json() { return resource; } }) });
  const real = Date.now; Date.now = () => (T + 5 * DAY) * 1000;
  let body;
  try { body = await (await handleRequest(post("/v1/claim", { provider: "mercadopago", sessionId: "pa_w4" }), env)).json(); } finally { Date.now = real; }
  assert.equal(body.entitlement.plan, "pro_monthly");
});

test("W5 Stripe: a paid checkout whose subscription events never arrive is bounded, not open-ended", async () => {
  const env = createTestEnv({ ENTITLEMENTS: createFakeKv() });
  await stripe(env, ev("e1", "checkout.session.completed", 0, { id: "cs_w5", mode: "subscription", customer: "cus_w5", subscription: "sub_w5", payment_status: "paid" }));
  assert.equal(await claimAt(env, "stripe", "cs_w5", 10), 200, "control: paid, entitled now");
  assert.notEqual(await claimAt(env, "stripe", "cs_w5", 400), 200, "400 days later, with nothing renewing it, it must have run out");
});

test("W6 gift codes: a single-use code redeemed by two accounts at once yields exactly one grant", async () => {
  resetSchemaMemo();
  const env = createAccountEnv();
  await ensureSchema(env.DB);
  const a = (await ensureAccount(env.DB, "a@example.test", {}, 1000)).account;
  const b = (await ensureAccount(env.DB, "b@example.test", {}, 1000)).account;
  const code = await createGiftCode(env.DB, { days: 30, maxRedemptions: 1 }, 5000);
  const results = await Promise.all([redeemGiftCode(env.DB, a.id, code.code, 6000), redeemGiftCode(env.DB, b.id, code.code, 6000)]);
  assert.equal(results.filter((r) => r.ok).length, 1, "exactly one account gets the single-use code");
  const n = (await env.DB.prepare("SELECT COUNT(*) AS n FROM grants WHERE kind = 'gift'").first()).n;
  assert.equal(n, 1);
});

test("W7 Stripe: a failed yearly renewal with no later event does not give the whole unpaid year", { todo: "QA-W-07 invoice.payment_failed moves periodEnd to the unpaid period's end" }, async () => {
  const env = createTestEnv({ ENTITLEMENTS: createFakeKv(), STRIPE_PRICE_PRO_YEARLY: "price_y" });
  const inv = (id, end, created, type) => ev(id, type, created, { id: `in_${id}`, customer: "cus_w7", parent: { type: "subscription_details", subscription_details: { subscription: "sub_w7" } }, lines: { data: [{ period: { start: T + end - 365 * DAY, end: T + end }, pricing: { price_details: { price: "price_y" } } }] } });
  await stripe(env, ev("c", "checkout.session.completed", 0, { id: "cs_w7", mode: "subscription", customer: "cus_w7", subscription: "sub_w7", payment_status: "paid" }));
  await stripe(env, inv("i1", 365 * DAY, 0, "invoice.paid"));
  await stripe(env, inv("i2", 730 * DAY, 365 * DAY, "invoice.payment_failed"));
  // allow a generous 14-day dunning grace after the paid year, not the whole next year
  assert.equal(await claimAt(env, "stripe", "cs_w7", 365 + 7), 200, "inside the grace");
  assert.notEqual(await claimAt(env, "stripe", "cs_w7", 365 + 60), 200, "two months after the paid year ended with the card failing, no Pro");
});
