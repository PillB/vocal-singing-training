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
        customer: "cus_router",
        subscription: "sub_router",
        payment_status: opts.paymentStatus || "paid",
        metadata: { plan: "pro_yearly" }
      }
    }
  };
}

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
    authMethods: { email: false, google: false, googleClientId: null },
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
