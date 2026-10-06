import test from "node:test";
import assert from "node:assert/strict";

import { hmacSha256Hex, verifyLicenseToken } from "../src/license.js";
import { buildMercadoPagoManifest } from "../src/mercadopago.js";
import { MAX_BODY_BYTES, handleRequest } from "../src/index.js";
import { getEntitlement } from "../src/store.js";
import { createTestEnv, TEST_ORIGIN } from "./fixtures.mjs";

const BASE = "https://entitlements.test";

/**
 * POST a JSON body to the worker.
 * @param {string} path Request path.
 * @param {unknown} body JSON body.
 * @param {{headers?: Object, origin?: string}} [options] Request options.
 * @returns {Request} Request object.
 */
function postJson(path, body, options) {
  const opts = options || {};
  return new Request(`${BASE}${path}`, {
    method: "POST",
    body: typeof body === "string" ? body : JSON.stringify(body),
    headers: {
      "content-type": "application/json",
      ...(opts.origin ? { Origin: opts.origin } : {}),
      ...(opts.headers || {})
    }
  });
}

/**
 * Build a signed Stripe webhook request.
 * @param {Object} event Stripe event.
 * @param {Object} env Env bindings.
 * @returns {Promise<Request>} Signed request.
 */
async function signedStripeRequest(event, env) {
  const raw = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await hmacSha256Hex(env.STRIPE_WEBHOOK_SECRET, `${timestamp}.${raw}`);
  return postJson("/v1/webhooks/stripe", raw, {
    headers: { "Stripe-Signature": `t=${timestamp},v1=${signature}` }
  });
}

/**
 * A completed Stripe checkout event for a session id.
 * @param {string} sessionId Checkout session id.
 * @param {string} eventId Event id.
 * @param {Object} [overrides] Session/event overrides.
 * @returns {Object} Stripe event.
 */
function checkoutEvent(sessionId, eventId, overrides) {
  const opts = overrides || {};
  return {
    id: eventId,
    type: opts.type || "checkout.session.completed",
    created: opts.created,
    data: {
      object: {
        id: sessionId,
        mode: opts.mode,
        customer: "cus_router",
        subscription: opts.subscription === undefined ? "sub_router" : opts.subscription,
        payment_status: opts.paymentStatus || "paid",
        metadata: { plan: opts.plan || "pro_yearly" }
      }
    }
  };
}

/**
 * Deliver a signed Stripe event through the router.
 * @param {Object} env Env bindings.
 * @param {Object} event Stripe event.
 * @returns {Promise<Response>} Webhook response.
 */
async function deliverStripe(env, event) {
  return handleRequest(await signedStripeRequest(event, env), env);
}

/**
 * Claim a checkout session, payment or preapproval id and read the answer.
 * @param {Object} env Env bindings.
 * @param {string} provider "stripe" | "mercadopago".
 * @param {string} sessionId Session, payment or preapproval id.
 * @returns {Promise<{status: number, body: Object}>} HTTP status and parsed body.
 */
async function claimFor(env, provider, sessionId) {
  const response = await handleRequest(postJson("/v1/claim", { provider, sessionId }), env);
  return { status: response.status, body: await response.json() };
}

let mpNotificationSeq = 0;

/**
 * Deliver a signed Mercado Pago notification whose API read answers `resource`.
 * @param {Object} env Env bindings.
 * @param {string} kind Notification kind ("payment", "subscription_preapproval", …).
 * @param {Object} resource What the Mercado Pago API returns for it.
 * @returns {Promise<Response>} Webhook response.
 */
async function deliverMercadoPago(env, kind, resource) {
  mpNotificationSeq += 1;
  const dataId = String(resource.id);
  const notification = { id: 7000 + mpNotificationSeq, type: kind, action: `${kind}.updated`, data: { id: dataId } };
  const ts = String(Math.floor(Date.now() / 1000));
  const requestId = `req-mp-${mpNotificationSeq}`;
  const v1 = await hmacSha256Hex(env.MP_WEBHOOK_SECRET, buildMercadoPagoManifest({ dataId, requestId, ts }));
  return handleRequest(
    postJson("/v1/webhooks/mercadopago", JSON.stringify(notification), {
      headers: { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId }
    }),
    env,
    { fetchImpl: async () => ({ ok: true, status: 200, async json() { return resource; } }) }
  );
}

/**
 * An ISO date some seconds away from now (negative is the past).
 * @param {number} seconds Offset from now.
 * @returns {string} ISO-8601 date.
 */
function isoIn(seconds) {
  return new Date((Math.floor(Date.now() / 1000) + seconds) * 1000).toISOString();
}

const DAY = 86400;

test("health reports booleans and the site origin, never key material", async () => {
  const env = createTestEnv();
  const response = await handleRequest(new Request(`${BASE}/v1/health`), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.deepEqual(body, {
    ok: true,
    stripeConfigured: true,
    mercadopagoConfigured: true,
    signingKeyConfigured: true,
    // The account layer reports itself here too. `createTestEnv` has no D1
    // binding and no auth configuration, which is exactly the shape a
    // payments-only deployment has.
    accountsConfigured: false,
    // Events need the same D1 binding, so a payments-only deployment has none.
    eventsEnabled: false,
    authMethods: { email: false, google: false, googleClientId: null, trialDays: 7 },
    siteOrigin: TEST_ORIGIN
  });
  const text = JSON.stringify(body);
  assert.equal(text.includes(env.LICENSE_PRIVATE_KEY_PKCS8_B64), false);
  assert.equal(text.includes(env.STRIPE_WEBHOOK_SECRET), false);

  const unconfigured = await handleRequest(
    new Request(`${BASE}/v1/health`),
    createTestEnv({ STRIPE_WEBHOOK_SECRET: "", MP_ACCESS_TOKEN: "" })
  );
  const unconfiguredBody = await unconfigured.json();
  assert.equal(unconfiguredBody.stripeConfigured, false);
  assert.equal(unconfiguredBody.mercadopagoConfigured, false);
});

test("unknown routes 404 and wrong methods 405", async () => {
  const env = createTestEnv();
  const missing = await handleRequest(new Request(`${BASE}/nope`), env);
  assert.equal(missing.status, 404);
  assert.deepEqual(await missing.json(), { ok: false, reason: "not_found" });

  const webhookGet = await handleRequest(new Request(`${BASE}/v1/webhooks/stripe`), env);
  assert.equal(webhookGet.status, 405);
  assert.equal(webhookGet.headers.get("allow"), "POST");

  const mpGet = await handleRequest(new Request(`${BASE}/v1/webhooks/mercadopago`), env);
  assert.equal(mpGet.status, 405);

  const jwksPost = await handleRequest(postJson("/v1/jwks", {}), env);
  assert.equal(jwksPost.status, 405);

  const claimGet = await handleRequest(new Request(`${BASE}/v1/claim`), env);
  assert.equal(claimGet.status, 405);
});

test("CORS is restricted to the configured site origin", async () => {
  const env = createTestEnv();
  const preflight = await handleRequest(
    new Request(`${BASE}/v1/license`, { method: "OPTIONS", headers: { Origin: TEST_ORIGIN } }),
    env
  );
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get("access-control-allow-origin"), TEST_ORIGIN);
  assert.equal(preflight.headers.get("vary"), "Origin");

  const foreign = await handleRequest(
    new Request(`${BASE}/v1/license`, { method: "OPTIONS", headers: { Origin: "https://evil.test" } }),
    env
  );
  assert.equal(foreign.headers.get("access-control-allow-origin"), null);

  const allowed = await handleRequest(
    new Request(`${BASE}/v1/health`, { headers: { Origin: TEST_ORIGIN } }),
    env
  );
  assert.equal(allowed.headers.get("access-control-allow-origin"), TEST_ORIGIN);
});

test("jwks serves the public key with a kid", async () => {
  const env = createTestEnv();
  const response = await handleRequest(new Request(`${BASE}/v1/jwks`), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.keys[0].kid, "k-test");
  assert.equal("d" in body.keys[0], false);
});

test("a webhook with a bad signature is refused and stores nothing", async () => {
  const env = createTestEnv();
  const request = postJson("/v1/webhooks/stripe", checkoutEvent("cs_bad", "evt_bad"), {
    headers: { "Stripe-Signature": `t=${Math.floor(Date.now() / 1000)},v1=${"a".repeat(64)}` }
  });
  const response = await handleRequest(request, env);
  assert.equal(response.status, 400);
  assert.equal(env.ENTITLEMENTS.store.size, 0);
});

test("webhook -> claim -> verifiable token, and the claim is idempotent", async () => {
  const env = createTestEnv();
  const webhook = await handleRequest(await signedStripeRequest(checkoutEvent("cs_flow", "evt_flow"), env), env);
  assert.equal(webhook.status, 200);

  const claim = await handleRequest(
    postJson("/v1/claim", { provider: "stripe", sessionId: "cs_flow" }, { origin: TEST_ORIGIN }),
    env
  );
  assert.equal(claim.status, 200);
  assert.equal(claim.headers.get("access-control-allow-origin"), TEST_ORIGIN);
  const body = await claim.json();
  assert.equal(body.ok, true);
  assert.equal(body.entitlement.plan, "pro_yearly");
  assert.equal(body.entitlement.status, "active");
  assert.equal("customerId" in body.entitlement, false);

  const verified = await verifyLicenseToken(body.token, env);
  assert.equal(verified.valid, true);
  assert.equal(verified.payload.sub, body.licenseId);
  assert.equal(verified.payload.aud, TEST_ORIGIN);

  // A replayed webhook must not mint a second license.
  const replay = await handleRequest(await signedStripeRequest(checkoutEvent("cs_flow", "evt_flow"), env), env);
  assert.equal(replay.status, 200);
  assert.deepEqual(await replay.json(), { ok: true, reason: "duplicate" });
  assert.equal([...env.ENTITLEMENTS.store.keys()].filter((key) => key.startsWith("lic:")).length, 1);

  // A fresh token for the same license, re-read live from KV.
  const license = await handleRequest(postJson("/v1/license", { licenseId: body.licenseId }), env);
  assert.equal(license.status, 200);
  const licenseBody = await license.json();
  assert.equal(licenseBody.licenseId, body.licenseId);
  assert.equal((await verifyLicenseToken(licenseBody.token, env)).valid, true);
});

test("a cancellation propagates to the next /v1/license call", async () => {
  const env = createTestEnv();
  await handleRequest(await signedStripeRequest(checkoutEvent("cs_cancel", "evt_c1"), env), env);
  const claim = await handleRequest(postJson("/v1/claim", { provider: "stripe", sessionId: "cs_cancel" }), env);
  const { licenseId } = await claim.json();

  const now = Math.floor(Date.now() / 1000);
  await handleRequest(await signedStripeRequest({
    id: "evt_c2",
    type: "customer.subscription.deleted",
    data: { object: { id: "sub_router", status: "canceled", current_period_end: now - 10 } }
  }, env), env);

  const stored = await getEntitlement(env.ENTITLEMENTS, licenseId);
  assert.equal(stored.status, "canceled");

  const refused = await handleRequest(postJson("/v1/license", { licenseId }), env);
  assert.equal(refused.status, 403);
  const body = await refused.json();
  assert.equal(body.ok, false);
  assert.equal(body.reason, "inactive");
  assert.equal(body.token, undefined);
});

test("a cancellation mid-period still serves a token until the period ends", async () => {
  const env = createTestEnv();
  await handleRequest(await signedStripeRequest(checkoutEvent("cs_grace", "evt_g1"), env), env);
  const { licenseId } = await (await handleRequest(
    postJson("/v1/claim", { provider: "stripe", sessionId: "cs_grace" }),
    env
  )).json();

  const periodEnd = Math.floor(Date.now() / 1000) + 600;
  await handleRequest(await signedStripeRequest({
    id: "evt_g2",
    type: "customer.subscription.deleted",
    data: { object: { id: "sub_router", status: "canceled", current_period_end: periodEnd } }
  }, env), env);

  const response = await handleRequest(postJson("/v1/license", { licenseId }), env);
  assert.equal(response.status, 200);
  const body = await response.json();
  const verified = await verifyLicenseToken(body.token, env);
  assert.equal(verified.valid, true);
  assert.equal(verified.payload.status, "canceled");
  assert.equal(verified.payload.exp, periodEnd, "the token must not outlive the paid period");
});

test("an unpaid checkout session yields no token until the async payment lands", async () => {
  const env = createTestEnv();
  await handleRequest(
    await signedStripeRequest(checkoutEvent("cs_async", "evt_a1", { paymentStatus: "unpaid" }), env),
    env
  );

  // Recorded, findable, but not entitling: the browser keeps polling.
  const pending = await handleRequest(
    postJson("/v1/claim", { provider: "stripe", sessionId: "cs_async" }),
    env
  );
  assert.equal(pending.status, 202);
  const pendingBody = await pending.json();
  assert.equal(pendingBody.ok, false);
  assert.equal(pendingBody.reason, "pending");
  assert.equal(pendingBody.token, undefined);
  assert.equal(pendingBody.entitlement.status, "pending");

  const licenseId = await env.ENTITLEMENTS.get("claim:stripe:cs_async");
  const direct = await handleRequest(postJson("/v1/license", { licenseId }), env);
  assert.equal(direct.status, 202, "a pending license is not a 403 either");

  // The money arrives.
  await handleRequest(
    await signedStripeRequest(
      checkoutEvent("cs_async", "evt_a2", { type: "checkout.session.async_payment_succeeded" }),
      env
    ),
    env
  );
  const settled = await handleRequest(
    postJson("/v1/claim", { provider: "stripe", sessionId: "cs_async" }),
    env
  );
  assert.equal(settled.status, 200);
  const body = await settled.json();
  assert.equal(body.entitlement.status, "active");
  assert.equal(body.licenseId, licenseId, "the same license, not a second one");
  assert.equal((await verifyLicenseToken(body.token, env)).valid, true);
});

test("an async payment failure leaves the session unentitled", async () => {
  const env = createTestEnv();
  await handleRequest(
    await signedStripeRequest(checkoutEvent("cs_fail", "evt_f1", { paymentStatus: "unpaid" }), env),
    env
  );
  await handleRequest(
    await signedStripeRequest(
      checkoutEvent("cs_fail", "evt_f2", {
        type: "checkout.session.async_payment_failed",
        paymentStatus: "unpaid"
      }),
      env
    ),
    env
  );
  const response = await handleRequest(
    postJson("/v1/claim", { provider: "stripe", sessionId: "cs_fail" }),
    env
  );
  assert.equal(response.status, 403);
  assert.equal((await response.json()).reason, "inactive");
});

test("a subscription whose first payment failed issues no token", async () => {
  const env = createTestEnv();
  const now = Math.floor(Date.now() / 1000);
  await handleRequest(
    await signedStripeRequest(checkoutEvent("cs_inc", "evt_i1", { paymentStatus: "unpaid" }), env),
    env
  );
  await handleRequest(await signedStripeRequest({
    id: "evt_i2",
    type: "customer.subscription.created",
    created: now,
    data: { object: { id: "sub_router", status: "incomplete", current_period_end: now + 99999 } }
  }, env), env);

  const response = await handleRequest(
    postJson("/v1/claim", { provider: "stripe", sessionId: "cs_inc" }),
    env
  );
  assert.equal(response.status, 202, "an incomplete subscription must not fall into the past_due grace");
  assert.equal((await response.json()).entitlement.status, "pending");
});

test("a late event delivered after a cancellation cannot bring Pro back", async () => {
  const env = createTestEnv();
  const now = Math.floor(Date.now() / 1000);

  await handleRequest(
    await signedStripeRequest(checkoutEvent("cs_order", "evt_o1", { created: now - 100 }), env),
    env
  );
  const { licenseId } = await (await handleRequest(
    postJson("/v1/claim", { provider: "stripe", sessionId: "cs_order" }),
    env
  )).json();

  await handleRequest(await signedStripeRequest({
    id: "evt_o2",
    type: "customer.subscription.deleted",
    created: now - 10,
    data: { object: { id: "sub_router", status: "canceled", current_period_end: now - 5 } }
  }, env), env);
  assert.equal((await handleRequest(postJson("/v1/license", { licenseId }), env)).status, 403);

  // Stripe retries an invoice.paid that was emitted before the cancellation.
  const late = await handleRequest(await signedStripeRequest({
    id: "evt_o3",
    type: "invoice.paid",
    created: now - 50,
    data: {
      object: {
        id: "in_late",
        subscription: "sub_router",
        lines: { data: [{ period: { end: now + 999999 } }] }
      }
    }
  }, env), env);
  assert.equal(late.status, 200);

  const stored = await getEntitlement(env.ENTITLEMENTS, licenseId);
  assert.equal(stored.status, "canceled");
  assert.equal(stored.periodEnd, now - 5);
  const refused = await handleRequest(postJson("/v1/license", { licenseId }), env);
  assert.equal(refused.status, 403, "a stale event must not renew a dead license");
});

test("a one-time Mercado Pago payment expires at the end of its interval", async () => {
  const env = createTestEnv();
  // Approved a minute ago, so the one-month period is genuinely live.
  const approvedUnix = Math.floor(Date.now() / 1000) - 60;
  const approved = new Date(approvedUnix * 1000).toISOString();
  const notification = { id: 950, type: "payment", action: "payment.created", data: { id: "PAY-1" } };
  const raw = JSON.stringify(notification);
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = await hmacSha256Hex(
    env.MP_WEBHOOK_SECRET,
    buildMercadoPagoManifest({ dataId: "pay-1", requestId: "req-p", ts })
  );
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    async json() {
      return {
        id: "PAY-1",
        status: "approved",
        date_approved: approved,
        date_last_updated: approved,
        payer: { id: 3 }
      };
    }
  });

  const response = await handleRequest(
    postJson("/v1/webhooks/mercadopago", raw, {
      headers: { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": "req-p" }
    }),
    env,
    { fetchImpl }
  );
  assert.equal(response.status, 200);

  const claim = await handleRequest(
    postJson("/v1/claim", { provider: "mercadopago", sessionId: "PAY-1" }),
    env
  );
  assert.equal(claim.status, 200);
  const body = await claim.json();
  assert.equal(body.entitlement.status, "active");
  assert.equal(body.entitlement.periodEnd, approvedUnix + 2678400, "one month from approval, not forever");

  const verified = await verifyLicenseToken(body.token, env);
  assert.equal(verified.valid, true);
  assert.equal(verified.payload.periodEnd, approvedUnix + 2678400);

  // Once that interval is over, no further token is issued.
  const expired = { ...(await getEntitlement(env.ENTITLEMENTS, body.licenseId)), periodEnd: 1 };
  await env.ENTITLEMENTS.put(`lic:${body.licenseId}`, JSON.stringify(expired));
  const refused = await handleRequest(postJson("/v1/license", { licenseId: body.licenseId }), env);
  assert.equal(refused.status, 403);
  assert.equal((await refused.json()).reason, "inactive");
});

test("claim answers 202 while the webhook is still in flight and 400 on garbage", async () => {
  const env = createTestEnv();
  const pending = await handleRequest(postJson("/v1/claim", { provider: "stripe", sessionId: "cs_unknown" }), env);
  assert.equal(pending.status, 202);
  assert.deepEqual(await pending.json(), { ok: false, reason: "pending" });

  for (const body of [
    { provider: "paypal", sessionId: "x" },
    { provider: "stripe" },
    { provider: "stripe", sessionId: 12345 },
    { provider: "stripe", sessionId: "" },
    { provider: "stripe", sessionId: "x".repeat(201) },
    "not json at all"
  ]) {
    const response = await handleRequest(postJson("/v1/claim", body), env);
    assert.equal(response.status, 400, `expected 400 for ${JSON.stringify(body)}`);
  }
});

test("claim 404s when the index points at a license that is gone", async () => {
  const env = createTestEnv();
  await env.ENTITLEMENTS.put("claim:stripe:cs_orphan", "lic_missing");
  const response = await handleRequest(postJson("/v1/claim", { provider: "stripe", sessionId: "cs_orphan" }), env);
  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { ok: false, reason: "not_found" });
});

test("license 404s for unknown, malformed and deleted ids", async () => {
  const env = createTestEnv();
  for (const body of [{ licenseId: "nope" }, { licenseId: 1 }, {}, { licenseId: "A".repeat(43) }]) {
    const response = await handleRequest(postJson("/v1/license", body), env);
    assert.equal(response.status, 404);
    assert.deepEqual(await response.json(), { ok: false, reason: "not_found" });
  }
});

test("oversized bodies are refused before any parsing", async () => {
  const env = createTestEnv();
  const huge = "x".repeat(MAX_BODY_BYTES + 1);
  const response = await handleRequest(postJson("/v1/claim", huge), env);
  assert.equal(response.status, 413);
  assert.deepEqual(await response.json(), { ok: false, reason: "body_too_large" });

  const webhook = await handleRequest(
    postJson("/v1/webhooks/stripe", huge, { headers: { "Stripe-Signature": "t=1,v1=aa" } }),
    env
  );
  assert.equal(webhook.status, 413);
});

test("a Mercado Pago notification is confirmed against the API before it is stored", async () => {
  const env = createTestEnv();
  const notification = { id: 900, type: "subscription_preapproval", action: "updated", data: { id: "pre_router" } };
  const raw = JSON.stringify(notification);
  const ts = String(Math.floor(Date.now() / 1000));
  const manifest = buildMercadoPagoManifest({ dataId: "pre_router", requestId: "req-router", ts });
  const v1 = await hmacSha256Hex(env.MP_WEBHOOK_SECRET, manifest);

  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(url);
    return {
      ok: true,
      status: 200,
      async json() {
        return {
          id: "pre_router",
          status: "authorized",
          payer_id: 12,
          reason: "Vocal Studio Pro anual",
          next_payment_date: "2026-12-01T00:00:00.000-05:00"
        };
      }
    };
  };

  const request = postJson("/v1/webhooks/mercadopago", raw, {
    headers: { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": "req-router" }
  });
  const response = await handleRequest(request, env, { fetchImpl });
  assert.equal(response.status, 200);
  assert.deepEqual(calls, ["https://api.mercadopago.com/preapproval/pre_router"]);

  const claim = await handleRequest(
    postJson("/v1/claim", { provider: "mercadopago", sessionId: "pre_router" }),
    env
  );
  assert.equal(claim.status, 200);
  const body = await claim.json();
  assert.equal(body.entitlement.status, "active");
  assert.equal(body.entitlement.plan, "pro_yearly");
  assert.equal((await verifyLicenseToken(body.token, env)).valid, true);
});

test("a Mercado Pago notification with a bad signature never reaches the API", async () => {
  const env = createTestEnv();
  let called = false;
  const fetchImpl = async () => {
    called = true;
    throw new Error("must not be called");
  };
  const request = postJson("/v1/webhooks/mercadopago", { type: "payment", data: { id: "1" } }, {
    headers: { "x-signature": `ts=${Math.floor(Date.now() / 1000)},v1=${"a".repeat(64)}` }
  });
  const response = await handleRequest(request, env, { fetchImpl });
  assert.equal(response.status, 400);
  assert.equal(called, false);
  assert.equal(env.ENTITLEMENTS.store.size, 0);
});

test("an API failure answers 500 so Mercado Pago retries", async () => {
  const env = createTestEnv();
  const notification = { id: 901, type: "payment", action: "payment.updated", data: { id: "77" } };
  const raw = JSON.stringify(notification);
  const ts = String(Math.floor(Date.now() / 1000));
  const v1 = await hmacSha256Hex(
    env.MP_WEBHOOK_SECRET,
    buildMercadoPagoManifest({ dataId: "77", ts })
  );
  const fetchImpl = async () => ({ ok: false, status: 503, async json() { return {}; } });
  const response = await handleRequest(
    postJson("/v1/webhooks/mercadopago", raw, { headers: { "x-signature": `ts=${ts},v1=${v1}` } }),
    env,
    { fetchImpl }
  );
  assert.equal(response.status, 500);
  assert.equal((await response.json()).reason, "api_error");

  // The retry must be processed, not dismissed as a replay.
  const retried = await handleRequest(
    postJson("/v1/webhooks/mercadopago", raw, { headers: { "x-signature": `ts=${ts},v1=${v1}` } }),
    env,
    {
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        async json() {
          return { id: 77, status: "approved", external_reference: "pro_monthly" };
        }
      })
    }
  );
  assert.equal(retried.status, 200);
  assert.deepEqual(await retried.json(), { ok: true });
  const claim = await handleRequest(
    postJson("/v1/claim", { provider: "mercadopago", sessionId: "77" }),
    env
  );
  assert.equal(claim.status, 200);
});

test("an unpaid Mercado Pago cash voucher waits, and one that expires unpaid never entitles", async () => {
  const env = createTestEnv();
  const voucher = {
    id: "PAY-VOUCHER",
    status: "pending",
    status_detail: "pending_waiting_payment",
    external_reference: "pro_yearly",
    date_created: isoIn(-3600),
    date_last_updated: isoIn(-3600),
    date_approved: null,
    // The voucher's own deadline, not a paid-through date.
    date_of_expiration: isoIn(3 * DAY),
    payer: { id: 7 }
  };
  assert.equal((await deliverMercadoPago(env, "payment", voucher)).status, 200);

  const waiting = await claimFor(env, "mercadopago", "PAY-VOUCHER");
  assert.equal(waiting.status, 202, "nobody has paid the voucher yet");
  assert.equal(waiting.body.reason, "pending");
  assert.equal(waiting.body.token, undefined);

  // The voucher runs out unpaid and Mercado Pago cancels the payment.
  await deliverMercadoPago(env, "payment", { ...voucher, status: "cancelled", status_detail: "expired", date_last_updated: isoIn(-60) });
  const expired = await claimFor(env, "mercadopago", "PAY-VOUCHER");
  assert.equal(expired.status, 403);
  assert.equal(expired.body.reason, "inactive");
  assert.equal(expired.body.token, undefined);
});

test("a Mercado Pago payment still under review, only authorized, or turned down buys no time", async () => {
  for (const [status, plan, expected] of [
    ["in_process", "pro_yearly", 202],
    ["authorized", "pro_monthly", 202],
    ["rejected", "pro_monthly", 403]
  ]) {
    const env = createTestEnv();
    const id = `PAY-${status}`;
    await deliverMercadoPago(env, "payment", {
      id,
      status,
      external_reference: plan,
      date_created: isoIn(-3600),
      date_last_updated: isoIn(-3600),
      payer: { id: 7 }
    });
    const claim = await claimFor(env, "mercadopago", id);
    assert.equal(claim.status, expected, status);
    assert.equal(claim.body.token, undefined, `${status} must not be signed`);
  }
});

test("a Mercado Pago renewal charge that has not gone through leaves the subscription as it was", async () => {
  const env = createTestEnv();
  const paidThrough = Math.floor(Date.now() / 1000) + DAY;
  await deliverMercadoPago(env, "subscription_preapproval", {
    id: "PRE-RENEW",
    status: "authorized",
    reason: "Vocal Studio Pro anual",
    next_payment_date: new Date(paidThrough * 1000).toISOString(),
    date_last_updated: isoIn(-20 * DAY),
    payer_id: 5
  });
  const before = await claimFor(env, "mercadopago", "PRE-RENEW");
  assert.equal(before.status, 200);
  assert.equal(before.body.entitlement.plan, "pro_yearly");

  for (const status of ["rejected", "in_process"]) {
    await deliverMercadoPago(env, "payment", {
      id: `PAY-REN-${status}`,
      status,
      metadata: { preapproval_id: "PRE-RENEW" },
      description: "Pro mensual",
      date_created: isoIn(-60),
      date_last_updated: isoIn(-60),
      payer: { id: 5 }
    });
    const after = await claimFor(env, "mercadopago", "PRE-RENEW");
    assert.equal(after.status, 200, `${status}: the period already paid for still holds`);
    assert.equal(after.body.entitlement.status, "active", `${status}: Mercado Pago retries; the charge is not a cancellation`);
    assert.equal(after.body.entitlement.periodEnd, paidThrough, `${status}: a charge that did not go through buys no time`);
    assert.equal(after.body.entitlement.plan, "pro_yearly", `${status}: the charge's text cannot change the plan`);
  }
});

test("a Mercado Pago renewal charge that is not approved opens nothing on its own", async () => {
  // The charge's notification can land before its subscription's: the payment
  // id is then recorded against a license that knows nothing else yet.
  const env = createTestEnv();
  await deliverMercadoPago(env, "payment", {
    id: "PAY-ORPHAN",
    status: "rejected",
    metadata: { preapproval_id: "PRE-LATER" },
    date_created: isoIn(-60),
    date_last_updated: isoIn(-60),
    payer: { id: 5 }
  });
  const claim = await claimFor(env, "mercadopago", "PAY-ORPHAN");
  assert.notEqual(claim.status, 200);
  assert.equal(claim.body.token, undefined);
});

test("a Mercado Pago subscription that was never authorized never entitles", async () => {
  const env = createTestEnv();
  const preapproval = {
    id: "PRE-PENDING",
    status: "pending",
    reason: "Vocal Studio Pro anual",
    // When Mercado Pago would charge, if the card were ever authorized.
    next_payment_date: isoIn(365 * DAY),
    date_last_updated: isoIn(-120),
    payer_id: 5
  };
  await deliverMercadoPago(env, "subscription_preapproval", preapproval);
  const waiting = await claimFor(env, "mercadopago", "PRE-PENDING");
  assert.equal(waiting.status, 202);
  assert.equal(waiting.body.token, undefined);

  await deliverMercadoPago(env, "subscription_preapproval", { ...preapproval, status: "cancelled", date_last_updated: isoIn(-60) });
  const cancelled = await claimFor(env, "mercadopago", "PRE-PENDING");
  assert.equal(cancelled.status, 403, "a subscription nobody paid for keeps no period");
  assert.equal(cancelled.body.token, undefined);
});

test("a refunded or charged-back Mercado Pago payment ends access at once", async () => {
  for (const [finalStatus, plan] of [["refunded", "pro_yearly"], ["charged_back", "pro_monthly"]]) {
    const env = createTestEnv();
    const id = `PAY-${finalStatus}`;
    const approved = isoIn(-2 * DAY);
    const payment = {
      id,
      status: "approved",
      external_reference: plan,
      date_created: approved,
      date_approved: approved,
      date_last_updated: approved,
      payer: { id: 7 }
    };
    await deliverMercadoPago(env, "payment", payment);
    const paid = await claimFor(env, "mercadopago", id);
    assert.equal(paid.status, 200, `${finalStatus}: paid first`);

    await deliverMercadoPago(env, "payment", { ...payment, status: finalStatus, date_last_updated: isoIn(-60) });
    const after = await handleRequest(postJson("/v1/license", { licenseId: paid.body.licenseId }), env);
    assert.equal(after.status, 403, `${finalStatus}: the money went back, so does the access`);
    const body = await after.json();
    assert.equal(body.reason, "inactive");
    assert.equal(body.token, undefined);
  }
});

test("a refunded Mercado Pago subscription charge ends access until a charge goes through again", async () => {
  const env = createTestEnv();
  await deliverMercadoPago(env, "subscription_preapproval", {
    id: "PRE-REFUND",
    status: "authorized",
    reason: "Vocal Studio Pro mensual",
    next_payment_date: isoIn(20 * DAY),
    date_last_updated: isoIn(-10 * DAY),
    payer_id: 5
  });
  const { body } = await claimFor(env, "mercadopago", "PRE-REFUND");
  const licenseId = body.licenseId;
  assert.equal(typeof licenseId, "string");

  const charge = {
    id: "AP-REFUND",
    preapproval_id: "PRE-REFUND",
    status: "processed",
    date_created: isoIn(-10 * DAY),
    date_last_updated: isoIn(-120),
    payment: { id: 991, status: "refunded", date_approved: isoIn(-10 * DAY) }
  };
  await deliverMercadoPago(env, "subscription_authorized_payment", charge);
  const refused = await handleRequest(postJson("/v1/license", { licenseId }), env);
  assert.equal(refused.status, 403, "a refunded charge keeps none of the period it paid for");

  // Next month's charge goes through.
  await deliverMercadoPago(env, "subscription_authorized_payment", {
    ...charge,
    id: "AP-NEXT",
    date_created: isoIn(-60),
    date_last_updated: isoIn(-60),
    payment: { id: 992, status: "approved", date_approved: isoIn(-60) }
  });
  const restored = await handleRequest(postJson("/v1/license", { licenseId }), env);
  assert.equal(restored.status, 200);
});

test("a one-time Stripe checkout entitles for one plan interval, not forever", async () => {
  const env = createTestEnv();
  const paidAt = Math.floor(Date.now() / 1000) - 60;
  await deliverStripe(env, checkoutEvent("cs_once", "evt_once", {
    mode: "payment",
    subscription: null,
    plan: "pro_monthly",
    created: paidAt
  }));
  const claim = await claimFor(env, "stripe", "cs_once");
  assert.equal(claim.status, 200);
  assert.equal(claim.body.entitlement.periodEnd, paidAt + 2678400, "one month from the payment");
  const verified = await verifyLicenseToken(claim.body.token, env);
  assert.equal(verified.payload.periodEnd, paidAt + 2678400);

  // The same purchase made 400 days ago has run out.
  const old = createTestEnv();
  await deliverStripe(old, checkoutEvent("cs_old", "evt_old", {
    mode: "payment",
    subscription: null,
    plan: "pro_yearly",
    created: paidAt - 400 * DAY
  }));
  const expired = await claimFor(old, "stripe", "cs_old");
  assert.equal(expired.status, 403);
  assert.equal(expired.body.reason, "inactive");
  assert.equal(expired.body.token, undefined);
});

test("a one-time Stripe checkout paid by a delayed method counts from when the money arrived", async () => {
  const env = createTestEnv();
  const now = Math.floor(Date.now() / 1000);
  const once = { mode: "payment", subscription: null, plan: "pro_monthly" };
  await deliverStripe(env, checkoutEvent("cs_once_async", "evt_oa1", { ...once, paymentStatus: "unpaid", created: now - 3 * DAY }));
  assert.equal((await claimFor(env, "stripe", "cs_once_async")).status, 202);
  await deliverStripe(env, checkoutEvent("cs_once_async", "evt_oa2", {
    ...once,
    type: "checkout.session.async_payment_succeeded",
    created: now - 60
  }));
  const settled = await claimFor(env, "stripe", "cs_once_async");
  assert.equal(settled.status, 200);
  assert.equal(settled.body.entitlement.periodEnd, now - 60 + 2678400);

  const failed = createTestEnv();
  await deliverStripe(failed, checkoutEvent("cs_once_fail", "evt_of1", { ...once, paymentStatus: "unpaid", created: now - 3 * DAY }));
  await deliverStripe(failed, checkoutEvent("cs_once_fail", "evt_of2", {
    ...once,
    type: "checkout.session.async_payment_failed",
    paymentStatus: "unpaid",
    created: now - 60
  }));
  const refused = await claimFor(failed, "stripe", "cs_once_fail");
  assert.equal(refused.status, 403, "a failed payment gets no interval");
  const periodEnd = refused.body.entitlement.periodEnd;
  assert.ok(periodEnd === null || periodEnd <= now, `no period ahead of now, got ${periodEnd}`);
});

test("a Stripe subscription that stopped paying or is paused gives no token, even as its period rolls on", async () => {
  for (const stripeStatus of ["unpaid", "paused", "a_status_stripe_adds_later"]) {
    const env = createTestEnv();
    const now = Math.floor(Date.now() / 1000);
    await deliverStripe(env, checkoutEvent("cs_stop", "evt_s1", { plan: "pro_monthly", created: now - 100 * DAY }));
    // Stripe keeps rolling an unpaid subscription's period forward.
    await deliverStripe(env, {
      id: "evt_s2",
      type: "customer.subscription.updated",
      created: now - 1,
      data: { object: { id: "sub_router", status: stripeStatus, current_period_end: now + 29 * DAY } }
    });
    const claim = await claimFor(env, "stripe", "cs_stop");
    assert.equal(claim.status, 403, `${stripeStatus}: retries are over, so is access`);
    assert.equal(claim.body.reason, "inactive", `${stripeStatus}: refused, not left polling`);
    assert.equal(claim.body.token, undefined);

    // Paying the open invoice brings it back.
    await deliverStripe(env, {
      id: "evt_s3",
      type: "invoice.paid",
      created: now,
      data: { object: { id: "in_back", subscription: "sub_router", lines: { data: [{ period: { end: now + 29 * DAY } }] } } }
    });
    assert.equal((await claimFor(env, "stripe", "cs_stop")).status, 200, `${stripeStatus}: paid again`);
  }
});

test("a Stripe subscription that turns active before a delayed payment settles gives no token yet", async () => {
  const env = createTestEnv();
  const now = Math.floor(Date.now() / 1000);
  await deliverStripe(env, checkoutEvent("cs_delay", "evt_d1", { paymentStatus: "unpaid", created: now - 5 }));
  // Stripe documents that a subscription paid by a delayed method can go
  // straight to active while the payment is still processing.
  await deliverStripe(env, {
    id: "evt_d2",
    type: "customer.subscription.created",
    created: now - 5,
    data: { object: { id: "sub_router", status: "active", current_period_end: now + 365 * DAY } }
  });
  const waiting = await claimFor(env, "stripe", "cs_delay");
  assert.equal(waiting.status, 202, "the money has not arrived");
  assert.equal(waiting.body.reason, "pending");
  assert.equal(waiting.body.token, undefined);

  // The payment settles.
  await deliverStripe(env, {
    id: "evt_d3",
    type: "invoice.paid",
    created: now - 1,
    data: { object: { id: "in_settled", subscription: "sub_router", lines: { data: [{ period: { end: now + 365 * DAY } }] } } }
  });
  const settled = await claimFor(env, "stripe", "cs_delay");
  assert.equal(settled.status, 200);
  assert.equal((await verifyLicenseToken(settled.body.token, env)).valid, true);
});

test("the unpaid checkout counts even when it is delivered after the subscription's events", async () => {
  const env = createTestEnv();
  const now = Math.floor(Date.now() / 1000);
  await deliverStripe(env, {
    id: "evt_r1",
    type: "customer.subscription.created",
    created: now - 4,
    data: { object: { id: "sub_router", status: "active", current_period_end: now + 365 * DAY } }
  });
  // Emitted a second earlier, delivered later.
  await deliverStripe(env, checkoutEvent("cs_late_unpaid", "evt_r2", { paymentStatus: "unpaid", created: now - 5 }));
  const claim = await claimFor(env, "stripe", "cs_late_unpaid");
  assert.equal(claim.status, 202);
  assert.equal(claim.body.token, undefined);
});

test("a first invoice that failed gives no grace to a checkout that was never paid", async () => {
  const env = createTestEnv();
  const now = Math.floor(Date.now() / 1000);
  await deliverStripe(env, checkoutEvent("cs_first_fail", "evt_ff1", { paymentStatus: "unpaid", created: now - 10 }));
  await deliverStripe(env, {
    id: "evt_ff2",
    type: "invoice.payment_failed",
    created: now - 5,
    data: {
      object: {
        id: "in_first",
        subscription: "sub_router",
        billing_reason: "subscription_create",
        lines: { data: [{ period: { end: now + 30 * DAY } }] }
      }
    }
  });
  const claim = await claimFor(env, "stripe", "cs_first_fail");
  assert.notEqual(claim.status, 200);
  assert.equal(claim.body.token, undefined, "no month of Pro for a payment that failed");
});

test("a delayed payment that failed stays refused, whatever the subscription says next", async () => {
  const env = createTestEnv();
  const now = Math.floor(Date.now() / 1000);
  await deliverStripe(env, {
    id: "evt_x1",
    type: "customer.subscription.created",
    created: now - 10,
    data: { object: { id: "sub_router", status: "incomplete", current_period_end: now + 365 * DAY } }
  });
  await deliverStripe(env, checkoutEvent("cs_failed", "evt_x2", { paymentStatus: "unpaid", created: now - 9 }));
  await deliverStripe(env, checkoutEvent("cs_failed", "evt_x3", {
    type: "checkout.session.async_payment_failed",
    paymentStatus: "unpaid",
    created: now - 8
  }));
  const failed = await claimFor(env, "stripe", "cs_failed");
  assert.equal(failed.status, 403, "the subscription's year was never paid for");
  assert.equal(failed.body.token, undefined);

  // Stripe documents that the subscription can stay active after a delayed
  // payment fails, and its invoice events keep coming.
  await deliverStripe(env, {
    id: "evt_x4",
    type: "invoice.payment_failed",
    created: now - 6,
    data: { object: { id: "in_x", subscription: "sub_router", lines: { data: [{ period: { end: now + 30 * DAY } }] } } }
  });
  await deliverStripe(env, {
    id: "evt_x5",
    type: "customer.subscription.updated",
    created: now - 4,
    data: { object: { id: "sub_router", status: "active", current_period_end: now + 365 * DAY } }
  });
  const still = await claimFor(env, "stripe", "cs_failed");
  assert.equal(still.status, 403);
  assert.equal(still.body.token, undefined);
});

test("a subscription cancelled after its renewal kept failing keeps none of the unpaid period", async () => {
  const env = createTestEnv();
  const now = Math.floor(Date.now() / 1000);
  const start = now - 51 * DAY;
  await deliverStripe(env, checkoutEvent("cs_dunning", "evt_n1", { plan: "pro_monthly", created: start }));
  await deliverStripe(env, {
    id: "evt_n2",
    type: "invoice.paid",
    created: start,
    data: { object: { id: "in_paid", subscription: "sub_router", lines: { data: [{ period: { end: start + 30 * DAY } }] } } }
  });
  await deliverStripe(env, {
    id: "evt_n3",
    type: "invoice.payment_failed",
    created: start + 30 * DAY,
    data: { object: { id: "in_unpaid", subscription: "sub_router", lines: { data: [{ period: { end: start + 60 * DAY } }] } } }
  });
  // Retries are exhausted and Stripe cancels the subscription. Its period end
  // is still the end of the month nobody paid for.
  await deliverStripe(env, {
    id: "evt_n4",
    type: "customer.subscription.deleted",
    created: now,
    data: { object: { id: "sub_router", status: "canceled", current_period_end: start + 60 * DAY, ended_at: now, canceled_at: now } }
  });
  const claim = await claimFor(env, "stripe", "cs_dunning");
  assert.equal(claim.status, 403, "the last paid period ended three weeks ago");
  assert.equal(claim.body.token, undefined);
});

test("Stripe saying it cancelled for a failed payment ends access when it ended", async () => {
  const env = createTestEnv();
  const now = Math.floor(Date.now() / 1000);
  await deliverStripe(env, checkoutEvent("cs_reason", "evt_q1", { plan: "pro_monthly", created: now - 40 * DAY }));
  // The dunning events were never seen here; the cancellation says why.
  await deliverStripe(env, {
    id: "evt_q2",
    type: "customer.subscription.deleted",
    created: now,
    data: {
      object: {
        id: "sub_router",
        status: "canceled",
        current_period_end: now + 20 * DAY,
        ended_at: now,
        cancellation_details: { reason: "payment_failed" }
      }
    }
  });
  const claim = await claimFor(env, "stripe", "cs_reason");
  assert.equal(claim.status, 403);
  assert.equal(claim.body.token, undefined);
});

test("a paid subscription cancelled at once still keeps the period it paid for", async () => {
  const env = createTestEnv();
  const now = Math.floor(Date.now() / 1000);
  const periodEnd = now + 20 * DAY;
  await deliverStripe(env, checkoutEvent("cs_paid_cancel", "evt_p1", { plan: "pro_monthly", created: now - 10 * DAY }));
  await deliverStripe(env, {
    id: "evt_p2",
    type: "invoice.paid",
    created: now - 10 * DAY,
    data: { object: { id: "in_p", subscription: "sub_router", lines: { data: [{ period: { end: periodEnd } }] } } }
  });
  await deliverStripe(env, {
    id: "evt_p3",
    type: "customer.subscription.deleted",
    created: now,
    data: {
      object: {
        id: "sub_router",
        status: "canceled",
        current_period_end: periodEnd,
        ended_at: now,
        cancellation_details: { reason: "cancellation_requested" }
      }
    }
  });
  const claim = await claimFor(env, "stripe", "cs_paid_cancel");
  assert.equal(claim.status, 200);
  const verified = await verifyLicenseToken(claim.body.token, env);
  assert.equal(verified.payload.status, "canceled");
  assert.equal(verified.payload.periodEnd, periodEnd);
});

test("an event from the same second as a cancellation cannot bring Pro back", async () => {
  const env = createTestEnv();
  const now = Math.floor(Date.now() / 1000);
  await deliverStripe(env, checkoutEvent("cs_tie", "evt_t1", { plan: "pro_monthly", created: now - 40 * DAY }));
  // Dunning ends: Stripe emits the last failed invoice and the cancellation
  // in the same second, and delivers them in either order.
  await deliverStripe(env, {
    id: "evt_t2",
    type: "customer.subscription.deleted",
    created: now - 5,
    data: { object: { id: "sub_router", status: "canceled", current_period_end: now - 5, ended_at: now - 5 } }
  });
  assert.equal((await claimFor(env, "stripe", "cs_tie")).status, 403);

  await deliverStripe(env, {
    id: "evt_t3",
    type: "invoice.payment_failed",
    created: now - 5,
    data: { object: { id: "in_tie", subscription: "sub_router", lines: { data: [{ period: { end: now + 25 * DAY } }] } } }
  });
  const tie = await claimFor(env, "stripe", "cs_tie");
  assert.equal(tie.status, 403, "a same-second event must not undo the cancellation");
  assert.equal(tie.body.token, undefined);
});

test("nothing that arrives after a Stripe subscription was deleted reopens it", async () => {
  const env = createTestEnv();
  const now = Math.floor(Date.now() / 1000);
  await deliverStripe(env, checkoutEvent("cs_gone", "evt_g1", { plan: "pro_monthly", created: now - 40 * DAY }));
  await deliverStripe(env, {
    id: "evt_g2",
    type: "customer.subscription.deleted",
    created: now - 50,
    data: { object: { id: "sub_router", status: "canceled", current_period_end: now - 60, ended_at: now - 50 } }
  });
  // Stripe never reactivates a deleted subscription, so a newer event for it
  // (an old invoice paid late, say) does not bring the license back.
  await deliverStripe(env, {
    id: "evt_g3",
    type: "invoice.paid",
    created: now - 10,
    data: { object: { id: "in_late_paid", subscription: "sub_router", lines: { data: [{ period: { end: now + 25 * DAY } }] } } }
  });
  const claim = await claimFor(env, "stripe", "cs_gone");
  assert.equal(claim.status, 403);
  assert.equal(claim.body.token, undefined);
});

test("a failed invoice from the same second as the subscription going unpaid does not reopen it", async () => {
  const env = createTestEnv();
  const now = Math.floor(Date.now() / 1000);
  await deliverStripe(env, checkoutEvent("cs_last_retry", "evt_l1", { plan: "pro_monthly", created: now - 60 * DAY }));
  // The last retry fails: Stripe marks the subscription unpaid and reports
  // the failed invoice in the same second.
  await deliverStripe(env, {
    id: "evt_l2",
    type: "customer.subscription.updated",
    created: now - 5,
    data: { object: { id: "sub_router", status: "unpaid", current_period_end: now + 20 * DAY } }
  });
  await deliverStripe(env, {
    id: "evt_l3",
    type: "invoice.payment_failed",
    created: now - 5,
    data: { object: { id: "in_last", subscription: "sub_router", lines: { data: [{ period: { end: now + 20 * DAY } }] } } }
  });
  const claim = await claimFor(env, "stripe", "cs_last_retry");
  assert.equal(claim.status, 403);
  assert.equal(claim.body.token, undefined);
});
