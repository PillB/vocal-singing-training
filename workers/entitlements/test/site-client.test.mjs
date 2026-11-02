/**
 * What the site's deployed browser code (js/license.js, js/billing.js) does
 * with this worker's answers, for a customer with no account: a refusal that
 * a later payment can undo must leave the browser holding its license (or its
 * checkout) so that Pro comes back once the payment arrives, and a refusal
 * that nothing can undo must still make it let go.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { hmacSha256Hex } from "../src/license.js";
import { buildMercadoPagoManifest } from "../src/mercadopago.js";
import { handleRequest } from "../src/index.js";
import { createTestEnv } from "./fixtures.mjs";
import { loadPage } from "./site-client.mjs";

const DAY = 86400;
const BILLING_KEY = "vt_billing_v1";

let seq = 0;

/**
 * Deliver a signed Stripe event.
 * @param {Object} env Env bindings.
 * @param {string} type Event type.
 * @param {Object} object The event's data.object.
 * @param {number} created Event timestamp.
 * @returns {Promise<void>} Resolves once the worker answered 200.
 */
async function stripe(env, type, object, created) {
  seq += 1;
  const raw = JSON.stringify({ id: `evt_site_${seq}`, type, created, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const v1 = await hmacSha256Hex(env.STRIPE_WEBHOOK_SECRET, `${t}.${raw}`);
  const res = await handleRequest(new Request("https://entitlements.test/v1/webhooks/stripe", {
    method: "POST",
    body: raw,
    headers: { "content-type": "application/json", "Stripe-Signature": `t=${t},v1=${v1}` }
  }), env);
  assert.equal(res.status, 200, type);
}

/**
 * Deliver a signed Mercado Pago notification whose API read answers `resource`.
 * @param {Object} env Env bindings.
 * @param {string} kind Notification kind.
 * @param {Object} resource What the API returns.
 * @returns {Promise<void>} Resolves once the worker answered 200.
 */
async function mercadoPago(env, kind, resource) {
  seq += 1;
  const dataId = String(resource.id);
  const ts = String(Math.floor(Date.now() / 1000));
  const requestId = `req-site-${seq}`;
  const v1 = await hmacSha256Hex(env.MP_WEBHOOK_SECRET, buildMercadoPagoManifest({ dataId, requestId, ts }));
  const res = await handleRequest(new Request("https://entitlements.test/v1/webhooks/mercadopago", {
    method: "POST",
    body: JSON.stringify({ id: 8000 + seq, type: kind, action: `${kind}.updated`, data: { id: dataId } }),
    headers: { "content-type": "application/json", "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId }
  }), env, { fetchImpl: async () => ({ ok: true, status: 200, async json() { return resource; } }) });
  assert.equal(res.status, 200, kind);
}

/**
 * Come back from a checkout and let the page claim it, as the site does.
 * @param {Object} env Env bindings.
 * @param {Map<string, string>} storage The browser's localStorage.
 * @param {string} search The return URL's query string.
 * @returns {Promise<Object>} The page.
 */
async function returnFromCheckout(env, storage, search) {
  const page = await loadPage(env, { storage, search });
  const back = page.billing.handleReturnFromCheckout();
  assert.equal(back.event, "success");
  await back.claiming;
  await page.settle();
  return page;
}

/**
 * The checkout the browser is still waiting on, as billing.js keeps it.
 * @param {Map<string, string>} storage The browser's localStorage.
 * @returns {string|null} Its status ("pending", "unclaimed", "active", …).
 */
function checkoutStatus(storage) {
  const raw = storage.get(BILLING_KEY);
  return raw ? JSON.parse(raw).status : null;
}

const iso = (seconds) => new Date(seconds * 1000).toISOString();

test("the site keeps a Stripe license that went unpaid, and Pro comes back once it is paid", async () => {
  const env = createTestEnv();
  const storage = new Map();
  const now = Math.floor(Date.now() / 1000);
  const T = now - 10 * DAY;
  const sub = (status, periodEnd) => ({
    id: "sub_site",
    status,
    customer: "cus_site",
    metadata: { plan: "pro_monthly" },
    items: { data: [{ current_period_end: periodEnd }] }
  });
  await stripe(env, "customer.subscription.created", sub("active", T + 30 * DAY), T);
  await stripe(env, "invoice.paid", { id: "in_1", subscription: "sub_site", lines: { data: [{ period: { end: T + 30 * DAY } }] } }, T);
  await stripe(env, "checkout.session.completed", {
    id: "cs_site", mode: "subscription", subscription: "sub_site", customer: "cus_site", payment_status: "paid", metadata: { plan: "pro_monthly" }
  }, T + 1);
  const bought = await returnFromCheckout(env, storage, "?billing=success&plan=pro_monthly&provider=stripe&session_id=cs_site");
  assert.equal(bought.license.getStatus().pro, true);

  // The renewal fails for good and Stripe marks the subscription unpaid.
  await stripe(env, "customer.subscription.updated", sub("unpaid", now + 20 * DAY), now - 3 * DAY);
  const unpaid = await loadPage(env, { storage });
  const refused = await unpaid.license.refresh();
  assert.equal(refused.ok, false);
  assert.equal(refused.reason, "suspended");
  assert.equal(unpaid.license.hasStoredLicense(), true, "the browser still holds the license");

  // The customer pays the open invoice.
  await stripe(env, "invoice.paid", { id: "in_2", subscription: "sub_site", lines: { data: [{ period: { end: now + 27 * DAY } }] } }, now - DAY);
  await stripe(env, "customer.subscription.updated", sub("active", now + 27 * DAY), now - DAY);
  const paid = await loadPage(env, { storage });
  const back = await paid.license.refresh();
  assert.equal(back.ok, true, "the stored license gets a token again");
  assert.equal(paid.license.getStatus().pro, true);
  assert.equal(paid.billing.isPro(), true);
  assert.equal(paid.license.getClaims().periodEnd, now + 27 * DAY);
});

test("the site still lets go of a Stripe license whose subscription was deleted", async () => {
  const env = createTestEnv();
  const storage = new Map();
  const now = Math.floor(Date.now() / 1000);
  const T = now - 10 * DAY;
  const sub = (status, extra) => ({
    id: "sub_gone", status, customer: "cus_gone", metadata: { plan: "pro_monthly" },
    items: { data: [{ current_period_end: now + 20 * DAY }] }, ...extra
  });
  await stripe(env, "customer.subscription.created", sub("active"), T);
  await stripe(env, "invoice.paid", { id: "in_g", subscription: "sub_gone", lines: { data: [{ period: { end: T + 30 * DAY } }] } }, T);
  await stripe(env, "checkout.session.completed", {
    id: "cs_gone", mode: "subscription", subscription: "sub_gone", payment_status: "paid", metadata: { plan: "pro_monthly" }
  }, T + 1);
  await returnFromCheckout(env, storage, "?billing=success&plan=pro_monthly&provider=stripe&session_id=cs_gone");
  await stripe(env, "customer.subscription.updated", sub("unpaid"), now - 3 * DAY);
  // Unpaid, then cancelled: it never comes back, and kept none of the unpaid period.
  await stripe(env, "customer.subscription.deleted", sub("canceled", {
    ended_at: now - 2 * DAY, cancellation_details: { reason: "cancellation_requested" }
  }), now - 2 * DAY);
  const page = await loadPage(env, { storage });
  const refused = await page.license.refresh();
  assert.equal(refused.reason, "inactive");
  assert.equal(page.license.hasStoredLicense(), false, "a deleted subscription's license is forgotten");
  assert.equal(page.billing.isPro(), false);
});

test("the site keeps a Mercado Pago license whose charge was refunded, and Pro comes back with the next charge", async () => {
  const env = createTestEnv();
  const storage = new Map();
  const now = Math.floor(Date.now() / 1000);
  const T = now - 20 * DAY;
  const preapproval = (at, next) => ({
    id: "PRE-SITE", status: "authorized", reason: "Pro mensual", payer_id: 3,
    auto_recurring: { frequency: 1, frequency_type: "months" },
    next_payment_date: iso(next), last_modified: iso(at)
  });
  const payment = (id, status, at, updated) => ({
    id, status, metadata: { preapproval_id: "PRE-SITE" }, date_created: iso(at), date_approved: iso(at), date_last_updated: iso(updated)
  });
  await mercadoPago(env, "subscription_preapproval", preapproval(T, T + 30 * DAY));
  await mercadoPago(env, "payment", payment(1, "approved", T + 2, T + 3));
  const bought = await returnFromCheckout(env, storage, "?billing=success&plan=pro_monthly&provider=mercadopago&preapproval_id=PRE-SITE");
  assert.equal(bought.license.getStatus().pro, true);

  await mercadoPago(env, "payment", payment(1, "refunded", T + 2, now - 2 * DAY));
  const refunded = await loadPage(env, { storage });
  assert.equal((await refunded.license.refresh()).reason, "suspended");
  assert.equal(refunded.license.hasStoredLicense(), true, "the subscription is still authorized");

  // A month on, the still-authorized subscription charges again.
  await mercadoPago(env, "payment", payment(2, "approved", now - 3600, now - 3500));
  await mercadoPago(env, "subscription_preapproval", preapproval(now - 3400, now + 30 * DAY));
  const charged = await loadPage(env, { storage });
  assert.equal((await charged.license.refresh()).ok, true);
  assert.equal(charged.license.getStatus().pro, true);
  assert.equal(charged.billing.isPro(), true);
});

test("the site still lets go of a refunded Mercado Pago one-off payment and of a cancelled subscription", async () => {
  const now = Math.floor(Date.now() / 1000);

  // A one-off payment: nothing will ever charge it again.
  const env = createTestEnv();
  const storage = new Map();
  const paid = { id: 77, status: "approved", external_reference: "pro_monthly", date_created: iso(now - 2 * DAY), date_approved: iso(now - 2 * DAY), date_last_updated: iso(now - 2 * DAY) };
  await mercadoPago(env, "payment", paid);
  await returnFromCheckout(env, storage, "?billing=success&plan=pro_monthly&provider=mercadopago&payment_id=77");
  await mercadoPago(env, "payment", { ...paid, status: "refunded", date_last_updated: iso(now - 60) });
  const page = await loadPage(env, { storage });
  assert.equal((await page.license.refresh()).reason, "inactive");
  assert.equal(page.license.hasStoredLicense(), false);

  // A subscription refunded and then cancelled.
  const env2 = createTestEnv();
  const storage2 = new Map();
  const T = now - 20 * DAY;
  const pre = (status, at) => ({
    id: "PRE-END", status, reason: "Pro mensual", auto_recurring: { frequency: 1, frequency_type: "months" },
    next_payment_date: iso(T + 30 * DAY), last_modified: iso(at)
  });
  await mercadoPago(env2, "subscription_preapproval", pre("authorized", T));
  const charge = { id: 5, status: "approved", metadata: { preapproval_id: "PRE-END" }, date_created: iso(T + 2), date_approved: iso(T + 2), date_last_updated: iso(T + 3) };
  await mercadoPago(env2, "payment", charge);
  await returnFromCheckout(env2, storage2, "?billing=success&plan=pro_monthly&provider=mercadopago&preapproval_id=PRE-END");
  await mercadoPago(env2, "payment", { ...charge, status: "refunded", date_last_updated: iso(now - 2 * DAY) });
  await mercadoPago(env2, "subscription_preapproval", pre("cancelled", now - DAY));
  const ended = await loadPage(env2, { storage: storage2 });
  assert.equal((await ended.license.refresh()).reason, "inactive");
  assert.equal(ended.license.hasStoredLicense(), false);
});

test("the site keeps claiming a Stripe checkout whose delayed payment failed, and gets Pro once the invoice is paid", async () => {
  const env = createTestEnv();
  const storage = new Map();
  const now = Math.floor(Date.now() / 1000);
  const S0 = now - 4 * DAY;
  const session = (paymentStatus) => ({
    id: "cs_sepa", mode: "subscription", subscription: "sub_sepa", customer: "cus_sepa", payment_status: paymentStatus, metadata: { plan: "pro_monthly" }
  });
  const sub = (status, periodEnd) => ({ id: "sub_sepa", status, customer: "cus_sepa", metadata: { plan: "pro_monthly" }, items: { data: [{ current_period_end: periodEnd }] } });
  await stripe(env, "checkout.session.completed", session("unpaid"), S0);
  await stripe(env, "customer.subscription.created", sub("active", S0 + 30 * DAY), S0);
  const waiting = await returnFromCheckout(env, storage, "?billing=success&plan=pro_monthly&provider=stripe&session_id=cs_sepa");
  assert.equal(waiting.billing.isPro(), false);
  assert.equal(checkoutStatus(storage), "pending", "the bank debit is still settling");

  // The debit bounces; Stripe keeps the subscription and retries its invoice.
  await stripe(env, "invoice.payment_failed", { id: "in_sepa", subscription: "sub_sepa", lines: { data: [{ period: { end: S0 + 30 * DAY } }] } }, S0 + 3 * DAY);
  await stripe(env, "checkout.session.async_payment_failed", session("unpaid"), S0 + 3 * DAY);
  await stripe(env, "customer.subscription.updated", sub("past_due", S0 + 30 * DAY), S0 + 3 * DAY);
  const failed = await loadPage(env, { storage });
  await failed.settle();
  assert.equal(failed.billing.isPro(), false);
  assert.equal(checkoutStatus(storage), "pending", "the checkout is kept, to be claimed again on the next visit");

  // The customer pays the invoice another way.
  await stripe(env, "invoice.paid", { id: "in_sepa", subscription: "sub_sepa", lines: { data: [{ period: { end: S0 + 30 * DAY } }] } }, now - 3600);
  await stripe(env, "customer.subscription.updated", sub("active", S0 + 30 * DAY), now - 3600);
  const paid = await loadPage(env, { storage });
  await paid.settle();
  assert.equal(paid.billing.isPro(), true, "the next visit claims it");
  assert.equal(checkoutStatus(storage), "active");
});

test("the site still gives up on a one-time Stripe checkout whose delayed payment failed", async () => {
  const env = createTestEnv();
  const storage = new Map();
  const now = Math.floor(Date.now() / 1000);
  const session = { id: "cs_once", mode: "payment", subscription: null, payment_status: "unpaid", metadata: { plan: "pro_monthly" } };
  await stripe(env, "checkout.session.completed", session, now - 3 * DAY);
  await returnFromCheckout(env, storage, "?billing=success&plan=pro_monthly&provider=stripe&session_id=cs_once");
  assert.equal(checkoutStatus(storage), "pending");
  await stripe(env, "checkout.session.async_payment_failed", session, now - 60);
  const page = await loadPage(env, { storage });
  await page.settle();
  assert.equal(page.billing.isPro(), false);
  assert.equal(checkoutStatus(storage), "unclaimed", "nothing can pay that session any more");
});
