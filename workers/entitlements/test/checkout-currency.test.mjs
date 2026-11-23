/**
 * Euros for the European Union, US dollars everywhere else (VG-85, decided
 * 2026-11-22): what the worker charges, and what a euro purchase becomes.
 *
 * The defects these tests exist for, each a way a European is charged a price
 * they were not shown, or pays and gets nothing:
 * - the page shows "7,99 €" and the worker opens the dollar product anyway
 *   (it never read a currency, so every checkout was the US$ product);
 * - a euro request for a plan with no euro product quietly becomes a dollar
 *   checkout instead of a refusal;
 * - a paid euro purchase is "a product that is not ours" to the allow-list,
 *   so the webhook suspends it and the buyer is never Pro;
 * - a table holding only the euro products reads as no table at all, so any
 *   product sold from the same Creem account (a donation) entitles;
 * - /v1/health says euros can be sold when one euro product, or the checkout
 *   itself, is missing, so the page shows € for a checkout that will fail.
 *
 * The oracle is what leaves the worker (the product id Creem is asked for,
 * and that Creem is not called at all on a refusal) and what the buyer's
 * account holds afterwards (GET /v1/me), through the real router, D1 fake and
 * signature check. Mutants CK40 to CK49 (the ledger set) plant each defect.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { handleRequest } from "../src/index.js";
import { resetSchemaMemo } from "../src/db.js";
import { planForProduct, productVerdict } from "../src/creem.js";
import { createAccountEnv } from "./fixtures.mjs";

const BASE = "https://entitlements.test";
const NOW = 1800000000;
const DAY = 86400;

/** The four products, as the go-live gate creates them (docs/40 step 3). */
const PRODUCTS = {
  CREEM_PRODUCT_PRO_MONTHLY: "prod_monthly_usd",
  CREEM_PRODUCT_PRO_YEARLY: "prod_yearly_usd",
  CREEM_PRODUCT_PRO_MONTHLY_EUR: "prod_monthly_eur",
  CREEM_PRODUCT_PRO_YEARLY_EUR: "prod_yearly_eur"
};

/** Build a request against the worker. */
function req(method, path, options) {
  const opts = options || {};
  const headers = {
    ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
    ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {})
  };
  return new Request(`${BASE}${path}`, {
    method,
    headers,
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) })
  });
}

/** Call the worker and return status plus parsed body. */
async function call(request, env, deps) {
  const response = await handleRequest(request, env, deps);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

/** Creem's checkout API and the sign-in mail, faked; `calls` is every request that reached Creem. */
function fakeServices() {
  const calls = [];
  let lastCode = null;
  const fetchImpl = async (url, init) => {
    const u = String(url);
    if (!u.includes("creem.io")) {
      const match = /\b(\d{6})\b/.exec(JSON.parse(init.body).text || "");
      lastCode = match && match[1];
      return { ok: true, status: 200, json: async () => ({}) };
    }
    const body = JSON.parse(init.body);
    calls.push({ url: u, body });
    const n = calls.length;
    return { ok: true, status: 200, json: async () => ({ id: `ch_${n}`, checkout_url: `https://checkout.creem.io/ch_${n}`, request_id: body.request_id }) };
  };
  return { fetchImpl, calls, code: () => lastCode };
}

/** An account env with Creem's checkout API and the given products. */
function freshEnv(overrides) {
  resetSchemaMemo();
  return createAccountEnv({ CREEM_API_KEY: "creem_live_unit_key", ...PRODUCTS, ...(overrides || {}) });
}

/** Sign in by emailed code; returns the session token. */
async function signIn(env, services, email, now) {
  await call(req("POST", "/v1/auth/email/start", { body: { email } }), env, { now, fetchImpl: services.fetchImpl });
  const verified = await call(req("POST", "/v1/auth/email/verify", { body: { email, code: services.code() } }), env, { now: now + 1 });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return verified.body.sessionToken;
}

/** POST /v1/me/checkout as the page does. */
function openCheckout(env, services, token, body, now) {
  return call(req("POST", "/v1/me/checkout", { token, body }), env, { now, fetchImpl: services.fetchImpl });
}

/** Deliver one signed Creem event. */
function deliver(env, id, eventType, object, now) {
  const raw = JSON.stringify({ id, eventType, created_at: now * 1000, object });
  const signature = createHmac("sha256", env.CREEM_WEBHOOK_SECRET).update(raw).digest("hex");
  return handleRequest(new Request(`${BASE}/v1/webhooks/creem`, {
    method: "POST",
    body: raw,
    headers: { "creem-signature": signature }
  }), env, { now });
}

/** A completed subscription checkout of `product`, charged in `currency`, as Creem sends it. */
function paidCheckout(checkoutId, requestId, now, product, currency) {
  return {
    id: checkoutId,
    object: "checkout",
    status: "completed",
    mode: "prod",
    request_id: requestId,
    order: { id: `ord_${checkoutId}`, amount: 799, currency, status: "paid", type: "recurring", transaction: `tran_${checkoutId}` },
    product,
    customer: { id: `cust_${checkoutId}`, email: "buyer@example.test" },
    subscription: {
      id: `sub_${checkoutId}`,
      object: "subscription",
      status: "active",
      current_period_end_date: new Date((now + 30 * DAY) * 1000).toISOString()
    },
    metadata: {}
  };
}

/** GET /v1/me for the account. */
function me(env, token, now) {
  return call(req("GET", "/v1/me", { token }), env, { now });
}

test("CK40 a euro checkout opens the euro product; a dollar one, or one that names no currency, the dollar product", async () => {
  const env = freshEnv();
  const services = fakeServices();
  const token = await signIn(env, services, "buyer@example.test", NOW);
  const cases = [
    [{ plan: "pro_monthly", currency: "EUR" }, "prod_monthly_eur"],
    [{ plan: "pro_yearly", currency: "EUR" }, "prod_yearly_eur"],
    [{ plan: "pro_monthly", currency: "USD" }, "prod_monthly_usd"],
    [{ plan: "pro_yearly", currency: "USD" }, "prod_yearly_usd"],
    // A page cached from before euros sends no currency, and showed dollars.
    [{ plan: "pro_monthly" }, "prod_monthly_usd"]
  ];
  for (const [i, [body, product]] of cases.entries()) {
    const opened = await openCheckout(env, services, token, body, NOW + 10 + i);
    assert.equal(opened.status, 200, `${JSON.stringify(body)}: ${JSON.stringify(opened.body)}`);
    assert.equal(services.calls.at(-1).body.product_id, product, JSON.stringify(body));
  }
  assert.equal(services.calls.length, cases.length);
});

test("CK41 a euro checkout for a plan with no euro product is refused with 409, and Creem is never asked for dollars instead", async () => {
  const env = freshEnv({ CREEM_PRODUCT_PRO_YEARLY_EUR: "" });
  const services = fakeServices();
  const token = await signIn(env, services, "buyer@example.test", NOW);
  const refused = await openCheckout(env, services, token, { plan: "pro_yearly", currency: "EUR" }, NOW + 5);
  assert.deepEqual([refused.status, refused.body], [409, { ok: false, reason: "currency_unavailable" }]);
  assert.equal(services.calls.length, 0, "no checkout of any currency was opened");
  const kept = await env.DB.prepare("SELECT COUNT(*) AS n FROM checkout_refs").first();
  assert.equal(Number(kept.n), 0, "and no reference is kept for it");
  // Controls: the same plan in dollars, and the other plan in euros, open.
  assert.equal((await openCheckout(env, services, token, { plan: "pro_yearly", currency: "USD" }, NOW + 6)).status, 200);
  assert.equal(services.calls.at(-1).body.product_id, "prod_yearly_usd");
  assert.equal((await openCheckout(env, services, token, { plan: "pro_monthly", currency: "EUR" }, NOW + 7)).status, 200);
  assert.equal(services.calls.at(-1).body.product_id, "prod_monthly_eur");
});

test("CK42 a currency the worker does not sell is a 400 invalid_currency, never a dollar checkout", async () => {
  const env = freshEnv();
  const services = fakeServices();
  const token = await signIn(env, services, "buyer@example.test", NOW);
  for (const [i, currency] of ["GBP", "eur", "", null, 7, ["EUR"], { code: "EUR" }].entries()) {
    const res = await openCheckout(env, services, token, { plan: "pro_monthly", currency }, NOW + 10 + i);
    assert.deepEqual([res.status, res.body.reason], [400, "invalid_currency"], JSON.stringify(currency));
  }
  assert.equal(services.calls.length, 0, "Creem was never called");
  // Control: the same request in a currency it sells opens.
  assert.equal((await openCheckout(env, services, token, { plan: "pro_monthly", currency: "EUR" }, NOW + 30)).status, 200);
});

test("CK43 a paid euro purchase is Pro on its own plan, through the allow-list; a product not in it is not", async () => {
  const env = freshEnv();
  const services = fakeServices();
  const buyers = [
    ["monthly@example.test", "pro_monthly", { id: "prod_monthly_eur", billing_type: "recurring", billing_period: "every-month" }, "pro_monthly"],
    ["yearly@example.test", "pro_yearly", { id: "prod_yearly_eur", billing_type: "recurring", billing_period: "every-year" }, "pro_yearly"]
  ];
  for (const [i, [email, plan, product, expected]] of buyers.entries()) {
    const at = NOW + i * 1000;
    const token = await signIn(env, services, email, at);
    await openCheckout(env, services, token, { plan, currency: "EUR" }, at + 5);
    const sent = services.calls.at(-1).body;
    assert.equal(sent.product_id, product.id);
    const checkoutId = `ch_${services.calls.length}`;
    assert.equal((await deliver(env, `evt_${checkoutId}`, "checkout.completed", paidCheckout(checkoutId, sent.request_id, at + 20, product, "EUR"), at + 20)).status, 200);
    const after = await me(env, token, at + 30);
    assert.equal(after.body.entitlement.pro, true, `${email}: ${JSON.stringify(after.body.entitlement)}`);
    assert.equal(after.body.entitlement.plan, expected, email);
    assert.ok(after.body.token, `${email} is handed a licence token`);
  }
  // Control: a checkout we opened, paid for with a product of the same Creem
  // account that is in no table (say a donation), is not Pro.
  const other = await signIn(env, services, "donor@example.test", NOW + 5000);
  await openCheckout(env, services, other, { plan: "pro_monthly", currency: "EUR" }, NOW + 5005);
  const ref = services.calls.at(-1).body.request_id;
  const donation = { id: "prod_donation", billing_type: "recurring", billing_period: "every-month" };
  await deliver(env, "evt_donation", "checkout.completed", paidCheckout(`ch_${services.calls.length}`, ref, NOW + 5020, donation, "EUR"), NOW + 5020);
  const donor = await me(env, other, NOW + 5030);
  assert.equal(donor.body.entitlement.pro, false, JSON.stringify(donor.body.entitlement));
  assert.equal(donor.body.token, null);
});

test("CK44 a table holding only the euro products is still an allow-list", () => {
  const euroOnly = { CREEM_PRODUCT_PRO_MONTHLY_EUR: "prod_monthly_eur", CREEM_PRODUCT_PRO_YEARLY_EUR: "prod_yearly_eur" };
  const donation = { id: "prod_donation", billing_period: "every-month" };
  assert.equal(productVerdict("prod_donation", euroOnly), "unlisted");
  assert.deepEqual(planForProduct(donation, euroOnly), { plan: undefined, planSource: "unlisted_product", unlisted: true });
  assert.deepEqual(planForProduct({ id: "prod_monthly_eur" }, euroOnly), { plan: "pro_monthly", planSource: "product_id" });
  // Control: with no table at all the same product says what it says.
  assert.deepEqual(planForProduct(donation, {}), { plan: "pro_monthly", planSource: "billing_period" });
  assert.equal(productVerdict("prod_donation", { CREEM_PRODUCT_PRO_MONTHLY_EUR: "  " }), "no_table", "a blank id is no table");
});

test("CK45 health says euros can be sold only with both euro products and everything a checkout needs", async () => {
  const health = async (overrides) => (await call(req("GET", "/v1/health"), freshEnv(overrides), { now: NOW })).body;
  const all = await health();
  assert.deepEqual([all.creemCheckoutConfigured, all.creemEurConfigured], [true, true]);
  for (const [what, overrides] of [
    ["no euro yearly", { CREEM_PRODUCT_PRO_YEARLY_EUR: "" }],
    ["no euro monthly", { CREEM_PRODUCT_PRO_MONTHLY_EUR: "   " }],
    ["no euro products", { CREEM_PRODUCT_PRO_MONTHLY_EUR: "", CREEM_PRODUCT_PRO_YEARLY_EUR: "" }]
  ]) {
    const h = await health(overrides);
    // The control: dollars still sell, so the false is about euros alone.
    assert.deepEqual([h.creemCheckoutConfigured, h.creemEurConfigured], [true, false], what);
  }
  for (const [what, overrides] of [
    ["no API key", { CREEM_API_KEY: "" }],
    ["no webhook secret", { CREEM_WEBHOOK_SECRET: "" }],
    ["no dollar products", { CREEM_PRODUCT_PRO_MONTHLY: "", CREEM_PRODUCT_PRO_YEARLY: "" }]
  ]) {
    const h = await health(overrides);
    assert.deepEqual([h.creemCheckoutConfigured, h.creemEurConfigured], [false, false], what);
  }
});

test("CK46 a product id written with a stray space opens its checkout and is still ours when its webhook comes back", async () => {
  // The checkout route reads the id trimmed; the webhook used to compare it
  // untrimmed, so the purchase it opened was refused as somebody else's.
  const env = freshEnv({ CREEM_PRODUCT_PRO_MONTHLY_EUR: " prod_monthly_eur\n", CREEM_PRODUCT_PRO_YEARLY: "prod_yearly_usd " });
  const services = fakeServices();
  const token = await signIn(env, services, "buyer@example.test", NOW);
  await openCheckout(env, services, token, { plan: "pro_monthly", currency: "EUR" }, NOW + 5);
  const sent = services.calls.at(-1).body;
  assert.equal(sent.product_id, "prod_monthly_eur", "Creem is asked for the id itself");
  const product = { id: "prod_monthly_eur", billing_type: "recurring", billing_period: "every-month" };
  await deliver(env, "evt_1", "checkout.completed", paidCheckout("ch_1", sent.request_id, NOW + 20, product, "EUR"), NOW + 20);
  const after = await me(env, token, NOW + 30);
  assert.equal(after.body.entitlement.pro, true, JSON.stringify(after.body.entitlement));
  assert.equal(after.body.entitlement.plan, "pro_monthly");
  // The same for the dollar yearly, read straight from the mapping.
  assert.deepEqual(planForProduct({ id: "prod_yearly_usd" }, env), { plan: "pro_yearly", planSource: "product_id" });
  // Control: an id that only shares a prefix is not ours.
  assert.equal(productVerdict("prod_monthly_eu", env), "unlisted");
});
