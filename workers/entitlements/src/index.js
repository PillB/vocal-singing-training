/**
 * Vocal Studio entitlements worker.
 *
 * Receives Stripe and Mercado Pago webhooks, stores entitlements in KV and
 * issues short-lived ECDSA-signed license tokens the browser can verify against
 * the published JWKS.
 *
 * Accounts, saved progress and granted months live alongside it in D1 (see
 * api.js). Both halves issue the same signed token, so the browser has one
 * thing to verify whether the access was bought or given.
 *
 * Anonymous usage events and A/B results share the same D1 (see events.js):
 * POST /v1/events and /v1/events/forget from the site,
 * GET /v1/admin/experiments[/results] and GET /v1/admin/funnel for an admin.
 *
 * GET /v1/geo answers where the edge thinks a request came from, so the page can
 * tell whether it is in a country that requires asking before anything is kept.
 * It reads nothing and stores nothing, and only browsers that already look
 * European ask for it.
 *
 * Bindings (see wrangler.toml and README.md):
 *   KV   ENTITLEMENTS
 *   D1   DB                (optional: without it the account routes answer 503
 *                           and the paid-only flow keeps working untouched)
 *   vars SITE_ORIGIN, LICENSE_KEY_ID, LICENSE_TTL_SECONDS,
 *        STRIPE_PRICE_PRO_MONTHLY, STRIPE_PRICE_PRO_YEARLY,
 *        MP_PLAN_PRO_MONTHLY, MP_PLAN_PRO_YEARLY,
 *        ADMIN_EMAILS, TRIAL_DAYS, GOOGLE_CLIENT_ID,
 *        EMAIL_PROVIDER, EMAIL_FROM, EMAIL_FROM_NAME, EVENTS_ENABLED
 *   secrets STRIPE_WEBHOOK_SECRET, MP_WEBHOOK_SECRET, MP_ACCESS_TOKEN,
 *        LICENSE_PRIVATE_KEY_PKCS8_B64, EVENTS_IP_KEY (optional),
 *        RESEND_API_KEY | BREVO_API_KEY | MAILERSEND_API_KEY
 *
 * Nothing in this file logs a secret, a token or a raw webhook body.
 */

"use strict";

import { routeAccountApi, authMethods, requireAdmin } from "./api.js";
import { asksFirst, callerCountry, routeEventsApi } from "./events.js";
import { ensureSchema, sweepExpired } from "./db.js";
import { buildJwks, createLicenseToken, isLicenseIdShape, isTokenIssuable } from "./license.js";
import { mapStripeEvent, verifyStripeSignature } from "./stripe.js";
import { confirmAndMapNotification, resolveNotificationTarget, verifyMercadoPagoSignature } from "./mercadopago.js";
import {
  clearEventSeen,
  getEntitlement,
  getLicenseIdForClaim,
  markEventSeen,
  toPublicEntitlement,
  upsertEntitlement
} from "./store.js";

/** Reject anything larger than 1 MiB; real webhooks are a few KB. */
export const MAX_BODY_BYTES = 1048576;

/** Longest checkout-session / payment id we will look up. */
export const MAX_SESSION_ID_LENGTH = 200;

/**
 * CORS headers for a request, restricted to the configured site origin.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @returns {Object} Header map (possibly empty).
 */
export function corsHeaders(request, env) {
  const allowed = env && typeof env.SITE_ORIGIN === "string" ? env.SITE_ORIGIN.trim() : "";
  const origin = request.headers.get("Origin");
  const headers = { vary: "Origin" };
  if (!allowed || !origin || origin !== allowed) {
    return headers;
  }
  return {
    ...headers,
    "access-control-allow-origin": allowed,
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-headers": "content-type, authorization",
    "access-control-max-age": "86400"
  };
}

/**
 * Build a JSON response with CORS and no-store caching.
 * @param {unknown} body Serializable body.
 * @param {number} status HTTP status.
 * @param {Object} [headers] Extra headers.
 * @returns {Response} JSON response.
 */
export function json(body, status, headers) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(headers || {})
    }
  });
}

/**
 * Read the request body as raw text, enforcing the size cap.
 * Stripe signatures are computed over these exact bytes, so the body is never
 * re-serialized.
 * @param {Request} request Incoming request.
 * @returns {Promise<{ok: boolean, text?: string, reason?: string}>} Body or refusal.
 */
export async function readRawBody(request) {
  const declared = Number.parseInt(request.headers.get("content-length") || "", 10);
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) {
    return { ok: false, reason: "body_too_large" };
  }
  const buffer = await request.arrayBuffer();
  if (buffer.byteLength > MAX_BODY_BYTES) {
    return { ok: false, reason: "body_too_large" };
  }
  return { ok: true, text: new TextDecoder().decode(buffer) };
}

/**
 * Parse JSON text, returning null instead of throwing.
 * @param {string} text JSON text.
 * @returns {Object|null} Parsed object or null.
 */
function parseJsonObject(text) {
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Issue a fresh token for an entitlement, or explain why we will not:
 * 202 while an async payment is still settling, 403 once it is not entitled.
 * @param {Object} record Stored entitlement record.
 * @param {Object} env Worker env bindings.
 * @param {Object} cors CORS headers.
 * @returns {Promise<Response>} Response.
 */
async function respondWithToken(record, env, cors) {
  const now = Math.floor(Date.now() / 1000);
  if (record.status === "pending") {
    // A delayed payment method has not settled yet; the browser keeps polling.
    return json({ ok: false, reason: "pending", entitlement: toPublicEntitlement(record) }, 202, cors);
  }
  if (!isTokenIssuable(record, now)) {
    return json({ ok: false, reason: "inactive", entitlement: toPublicEntitlement(record) }, 403, cors);
  }
  const { token } = await createLicenseToken(record, env, now);
  return json(
    { ok: true, licenseId: record.licenseId, token, entitlement: toPublicEntitlement(record) },
    200,
    cors
  );
}

/**
 * Handle POST /v1/webhooks/stripe.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @returns {Promise<Response>} Response.
 */
async function handleStripeWebhook(request, env) {
  const body = await readRawBody(request);
  if (!body.ok) {
    return json({ ok: false, reason: body.reason }, 413);
  }
  const verified = await verifyStripeSignature({
    rawBody: body.text,
    header: request.headers.get("Stripe-Signature") || "",
    secret: env.STRIPE_WEBHOOK_SECRET
  });
  if (!verified.ok) {
    console.warn("stripe webhook rejected", verified.reason);
    return json({ ok: false, reason: verified.reason }, 400);
  }
  const event = parseJsonObject(body.text);
  if (!event || typeof event.id !== "string") {
    return json({ ok: false, reason: "malformed_event" }, 400);
  }
  const fresh = await markEventSeen(env.ENTITLEMENTS, "stripe", event.id);
  if (!fresh) {
    return json({ ok: true, reason: "duplicate" }, 200);
  }
  const mapped = mapStripeEvent(event, env);
  if (!mapped.handled) {
    return json({ ok: true, reason: mapped.reason }, 200);
  }
  try {
    const { record } = await upsertEntitlement(env.ENTITLEMENTS, mapped.update);
    console.log("stripe entitlement updated", event.type, record.status, record.plan);
  } catch (error) {
    // The marker is already set; drop it so Stripe's retry is not dismissed.
    await clearEventSeen(env.ENTITLEMENTS, "stripe", event.id);
    throw error;
  }
  return json({ ok: true }, 200);
}

/**
 * Handle POST /v1/webhooks/mercadopago.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {URL} url Parsed request URL.
 * @param {{fetchImpl?: function}} [options] Injectable fetch, for tests.
 * @returns {Promise<Response>} Response.
 */
async function handleMercadoPagoWebhook(request, env, url, options) {
  const body = await readRawBody(request);
  if (!body.ok) {
    return json({ ok: false, reason: body.reason }, 413);
  }
  const notification = parseJsonObject(body.text) || {};
  const target = resolveNotificationTarget(notification, url);
  const verified = await verifyMercadoPagoSignature({
    header: request.headers.get("x-signature") || "",
    dataId: target.id,
    requestId: request.headers.get("x-request-id"),
    secret: env.MP_WEBHOOK_SECRET
  });
  if (!verified.ok) {
    console.warn("mercadopago webhook rejected", verified.reason);
    return json({ ok: false, reason: verified.reason }, 400);
  }
  if (!target.kind || !target.id) {
    return json({ ok: true, reason: "missing_target" }, 200);
  }
  const fresh = await markEventSeen(env.ENTITLEMENTS, "mercadopago", target.eventId);
  if (!fresh) {
    return json({ ok: true, reason: "duplicate" }, 200);
  }
  try {
    const mapped = await confirmAndMapNotification(target, env, options || {});
    if (!mapped.handled) {
      console.warn("mercadopago notification not applied", target.kind, mapped.reason);
      // 500 on an API failure so Mercado Pago retries; 200 when we simply do
      // not care about this notification kind.
      const retryable = mapped.reason === "api_error" || mapped.reason === "api_bad_json";
      if (retryable) {
        await clearEventSeen(env.ENTITLEMENTS, "mercadopago", target.eventId);
        return json({ ok: false, reason: mapped.reason }, 500);
      }
      return json({ ok: true, reason: mapped.reason }, 200);
    }
    const { record } = await upsertEntitlement(env.ENTITLEMENTS, mapped.update);
    console.log("mercadopago entitlement updated", target.kind, record.status, record.plan);
  } catch (error) {
    await clearEventSeen(env.ENTITLEMENTS, "mercadopago", target.eventId);
    throw error;
  }
  return json({ ok: true }, 200);
}

/**
 * Handle POST /v1/claim.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} cors CORS headers.
 * @returns {Promise<Response>} Response.
 */
async function handleClaim(request, env, cors) {
  const body = await readRawBody(request);
  if (!body.ok) {
    return json({ ok: false, reason: body.reason }, 413, cors);
  }
  const payload = parseJsonObject(body.text);
  const provider = payload && payload.provider;
  const sessionId = payload && payload.sessionId;
  if (provider !== "stripe" && provider !== "mercadopago") {
    return json({ ok: false, reason: "bad_request" }, 400, cors);
  }
  if (typeof sessionId !== "string" || !sessionId || sessionId.length > MAX_SESSION_ID_LENGTH) {
    return json({ ok: false, reason: "bad_request" }, 400, cors);
  }
  const licenseId = await getLicenseIdForClaim(env.ENTITLEMENTS, provider, sessionId);
  if (!licenseId) {
    // The webhook may simply not have landed yet; the client retries on 202.
    return json({ ok: false, reason: "pending" }, 202, cors);
  }
  const record = await getEntitlement(env.ENTITLEMENTS, licenseId);
  if (!record) {
    return json({ ok: false, reason: "not_found" }, 404, cors);
  }
  return respondWithToken(record, env, cors);
}

/**
 * Handle POST /v1/license.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} cors CORS headers.
 * @returns {Promise<Response>} Response.
 */
async function handleLicense(request, env, cors) {
  const body = await readRawBody(request);
  if (!body.ok) {
    return json({ ok: false, reason: body.reason }, 413, cors);
  }
  const payload = parseJsonObject(body.text);
  const licenseId = payload && payload.licenseId;
  if (!isLicenseIdShape(licenseId)) {
    return json({ ok: false, reason: "not_found" }, 404, cors);
  }
  const record = await getEntitlement(env.ENTITLEMENTS, licenseId);
  if (!record) {
    return json({ ok: false, reason: "not_found" }, 404, cors);
  }
  return respondWithToken(record, env, cors);
}

/**
 * Handle GET /v1/health.
 * @param {Object} env Worker env bindings.
 * @param {Object} cors CORS headers.
 * @returns {Response} Response with booleans only.
 */
function handleHealth(env, cors) {
  return json(
    {
      ok: true,
      stripeConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET),
      mercadopagoConfigured: Boolean(env.MP_WEBHOOK_SECRET && env.MP_ACCESS_TOKEN),
      signingKeyConfigured: Boolean(env.LICENSE_PRIVATE_KEY_PKCS8_B64),
      accountsConfigured: Boolean(env.DB),
      eventsEnabled: Boolean(env.DB) && String(env.EVENTS_ENABLED || "").trim().toLowerCase() !== "false",
      authMethods: authMethods(env),
      siteOrigin: env.SITE_ORIGIN || ""
    },
    200,
    cors
  );
}

/**
 * Handle GET /v1/geo.
 *
 * The country the edge already knows, and whether that country's law wants the
 * visitor asked before statistics are kept (events.js ASK_FIRST_COUNTRIES). No
 * database, no rate limit and nothing stored: it is cheaper than the 404 it
 * replaces, and js/region-gate.js only asks when a browser's own time zone or
 * language already looks European, so nobody else pays a request for it.
 *
 * `placed` is false when the edge cannot say where the request came from (a unit
 * test, Tor's "T1", Cloudflare's "XX", `wrangler dev` without --remote), and the
 * page treats that as no answer at all rather than as "not in Europe": it keeps
 * whatever its own clock said, which is the safe direction. `askFirst` is false
 * in that case because the ingest route must not turn away events from every
 * unplaceable address in the world.
 * @param {Request} request Incoming request.
 * @param {Object} cors CORS headers.
 * @returns {Response} Response.
 */
function handleGeo(request, cors) {
  const country = callerCountry(request);
  return json({ ok: true, country: country || null, placed: !!country, askFirst: asksFirst(request) }, 200, cors);
}

/**
 * Route one request. Exported so tests can drive the router directly.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {{fetchImpl?: function, now?: number, presets?: Object}} [options]
 *   Injectables for tests: fetch, the clock, and the experiment registry.
 * @returns {Promise<Response>} Response.
 */
export async function handleRequest(request, env, options) {
  const url = new URL(request.url);
  const path = url.pathname.replace(/\/+$/, "") || "/";
  const cors = corsHeaders(request, env);

  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: cors });
  }

  if (path === "/v1/webhooks/stripe" || path === "/v1/webhooks/mercadopago") {
    if (request.method !== "POST") {
      return json({ ok: false, reason: "method_not_allowed" }, 405, { allow: "POST" });
    }
    return path === "/v1/webhooks/stripe"
      ? handleStripeWebhook(request, env)
      : handleMercadoPagoWebhook(request, env, url, options);
  }

  if (path === "/v1/claim" || path === "/v1/license") {
    if (request.method !== "POST") {
      return json({ ok: false, reason: "method_not_allowed" }, 405, { ...cors, allow: "POST" });
    }
    return path === "/v1/claim" ? handleClaim(request, env, cors) : handleLicense(request, env, cors);
  }

  if (path === "/v1/jwks") {
    if (request.method !== "GET") {
      return json({ ok: false, reason: "method_not_allowed" }, 405, { ...cors, allow: "GET" });
    }
    const jwks = await buildJwks(env);
    // The public key is public: let browsers and CDNs cache it.
    return json(jwks, 200, { ...cors, "cache-control": "public, max-age=600" });
  }

  if (path === "/v1/geo") {
    if (request.method !== "GET") {
      return json({ ok: false, reason: "method_not_allowed" }, 405, { ...cors, allow: "GET" });
    }
    return handleGeo(request, cors);
  }

  // Before the account router: it claims every /v1/admin/ path and would
  // answer the experiment routes with a 404.
  const eventsResponse = await routeEventsApi(request, env, url, path, {
    json,
    cors,
    now: options && options.now,
    presets: options && options.presets,
    requireAdmin
  });
  if (eventsResponse) {
    return eventsResponse;
  }

  const accountResponse = await routeAccountApi(request, env, url, path, {
    json,
    cors,
    now: options && options.now,
    fetchImpl: options && options.fetchImpl
  });
  if (accountResponse) {
    return accountResponse;
  }

  if (path === "/v1/health") {
    if (request.method !== "GET") {
      return json({ ok: false, reason: "method_not_allowed" }, 405, { ...cors, allow: "GET" });
    }
    return handleHealth(env, cors);
  }

  return json({ ok: false, reason: "not_found" }, 404, cors);
}

export default {
  /**
   * Daily housekeeping (the cron in wrangler.toml): expired sign-in codes and
   * sessions, stale rate-limit buckets, and usage events, exposures and ingest
   * counters past retention. The privacy page promises the 180 days, so this
   * runs on its own rather than waiting for an admin to press sweep.
   * @param {Object} event Scheduled event.
   * @param {Object} env Worker env bindings.
   * @returns {Promise<void>} Resolves when done.
   */
  async scheduled(event, env) {
    if (!env.DB) {
      return;
    }
    await ensureSchema(env.DB);
    await sweepExpired(env.DB);
  },

  /**
   * Worker entry point.
   * @param {Request} request Incoming request.
   * @param {Object} env Worker env bindings.
   * @returns {Promise<Response>} Response.
   */
  async fetch(request, env) {
    try {
      return await handleRequest(request, env);
    } catch (error) {
      // Message only — never the request body, headers or any secret.
      console.error("unhandled error", error && error.message);
      return json({ ok: false, reason: "internal_error" }, 500);
    }
  }
};
