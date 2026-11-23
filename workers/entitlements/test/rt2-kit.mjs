/**
 * Shared harness for the red-team round 2 worker tests (rt2-*.test.mjs): the
 * real router, the real D1 fake and the real Creem signature check, with only
 * Creem's API and the email transport faked. The fake records every call that
 * left the worker, so a test can say a refusal cost Creem nothing.
 *
 * No `test()` in here: it is a helper, not a suite.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

import { handleRequest } from "../src/index.js";
import { resetSchemaMemo } from "../src/db.js";
import { createAccountEnv } from "./fixtures.mjs";

export const BASE = "https://entitlements.test";
export const NOW = 1800000000;
export const DAY = 86400;

/** ISO 8601 for unix seconds, as Creem writes a subscription's dates. */
export const iso = (seconds) => new Date(seconds * 1000).toISOString();

/** Build a request against the worker. */
export function req(method, path, options) {
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
export async function call(request, env, deps) {
  const response = await handleRequest(request, env, deps);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

/** Fake Creem (checkouts) and the sign-in email; `calls` records what reached Creem. */
export function fakeServices() {
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
    const answer = new URL(u).pathname === "/v1/checkouts"
      ? { id: `ch_${n}`, checkout_url: `https://checkout.creem.io/ch_${n}`, request_id: body.request_id }
      : { customer_portal_link: `https://creem.io/my-orders/login/${body.customer_id}` };
    return { ok: true, status: 200, json: async () => answer };
  };
  const checkouts = () => calls.filter((c) => new URL(c.url).pathname === "/v1/checkouts").length;
  return { fetchImpl, calls, checkouts, code: () => lastCode };
}

/** An account env with Creem's checkout API configured. */
export function freshEnv() {
  resetSchemaMemo();
  return createAccountEnv({
    CREEM_API_KEY: "creem_live_unit_key",
    CREEM_PRODUCT_PRO_MONTHLY: "prod_monthly",
    CREEM_PRODUCT_PRO_YEARLY: "prod_yearly"
  });
}

/** Sign in by emailed code; the session token. */
export async function signIn(env, services, email, now) {
  const started = await call(req("POST", "/v1/auth/email/start", { body: { email } }), env, { now, fetchImpl: services.fetchImpl });
  assert.equal(started.status, 200);
  const verified = await call(req("POST", "/v1/auth/email/verify", { body: { email, code: services.code() } }), env, { now: now + 1 });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return verified.body.sessionToken;
}

/** POST /v1/me/checkout as the page does. */
export function openCheckout(env, services, token, plan, now) {
  return call(req("POST", "/v1/me/checkout", { token, body: { plan } }), env, { now, fetchImpl: services.fetchImpl });
}

/** GET /v1/me as another device would. */
export function me(env, token, now) {
  return call(req("GET", "/v1/me", { token }), env, { now });
}

/** Deliver one signed Creem event; the worker's status code. */
export async function deliver(env, id, eventType, object, now) {
  const raw = JSON.stringify({ id, eventType, created_at: now * 1000, object });
  const signature = createHmac("sha256", env.CREEM_WEBHOOK_SECRET).update(raw).digest("hex");
  const response = await handleRequest(new Request(`${BASE}/v1/webhooks/creem`, {
    method: "POST",
    body: raw,
    headers: { "creem-signature": signature }
  }), env, { now });
  return response.status;
}

/** A completed monthly checkout for `sub_1`, as Creem sends it, bound by `requestId`. */
export function completedCheckout(checkoutId, requestId, now) {
  return {
    id: checkoutId,
    object: "checkout",
    status: "completed",
    mode: "prod",
    request_id: requestId,
    order: { id: "ord_1", amount: 799, currency: "USD", status: "paid", type: "recurring", transaction: "tran_1" },
    product: { id: "prod_monthly", billing_type: "recurring", billing_period: "every-month" },
    customer: { id: "cust_1", email: "buyer@example.test" },
    subscription: { id: "sub_1", object: "subscription", status: "active", current_period_end_date: iso(now + 30 * DAY) },
    metadata: {}
  };
}

/** `sub_1` as a subscription event carries it, for the period ending `periodEnd`. */
export function subscriptionObject(status, periodEnd, over) {
  return {
    id: "sub_1",
    object: "subscription",
    status,
    mode: "prod",
    product: { id: "prod_monthly", billing_period: "every-month" },
    customer: { id: "cust_1" },
    last_transaction_id: "tran_1",
    current_period_start_date: iso(periodEnd - 30 * DAY),
    current_period_end_date: iso(periodEnd),
    canceled_at: null,
    ...(over || {})
  };
}

/**
 * A signed-in buyer whose worker-opened Creem checkout went through: Pro until
 * `periodEnd`, linked to the account by the webhook alone.
 * @returns {Promise<{env: Object, services: Object, token: string, periodEnd: number}>} The setup.
 */
export async function creemSubscriber() {
  const env = freshEnv();
  const services = fakeServices();
  const token = await signIn(env, services, "buyer@example.test", NOW);
  const opened = await openCheckout(env, services, token, "pro_monthly", NOW + 5);
  assert.equal(opened.status, 200, JSON.stringify(opened.body));
  const ref = services.calls[0].body.request_id;
  assert.equal(await deliver(env, "evt_checkout", "checkout.completed", completedCheckout("ch_1", ref, NOW + 20), NOW + 20), 200);
  const periodEnd = NOW + 20 + 30 * DAY;
  const during = await me(env, token, NOW + 60);
  // Precondition, so nothing below can pass on a purchase that never landed.
  assert.equal(during.body.entitlement.pro, true, "the checkout gave Pro");
  return { env, services, token, periodEnd };
}
