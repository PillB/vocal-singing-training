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
 * Bug reports and ideas are in the same D1 again (see reports.js):
 * POST /v1/reports from the site and GET /v1/reports/mine for the person who
 * sent them, GET /v1/admin/reports and POST /v1/admin/reports/update for us.
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
 *        EMAIL_PROVIDER, EMAIL_FROM, EMAIL_FROM_NAME, EVENTS_ENABLED,
 *        REPORTS_ENABLED
 *   secrets STRIPE_WEBHOOK_SECRET, MP_WEBHOOK_SECRET, MP_ACCESS_TOKEN,
 *        LICENSE_PRIVATE_KEY_PKCS8_B64, EVENTS_IP_KEY (optional),
 *        RESEND_API_KEY | BREVO_API_KEY | MAILERSEND_API_KEY
 *
 * Nothing in this file logs a secret, a token or a raw webhook body.
 *
 * Every named export of this module must be a function: the Workers runtime
 * takes the entry module's named exports for handlers and refuses to start
 * on anything else. Constants live in limits.js.
 */

"use strict";

import { readJsonBody, requireSession, routeAccountApi, authMethods, requireAdmin } from "./api.js";
import { asksFirst, callerCountry, routeEventsApi } from "./events.js";
import {
  ensureSchema,
  noteHealthFlag,
  readHealthFlag,
  sweepExpired,
  WEBHOOK_FAILED_FLAG
} from "./db.js";
import {
  buildJwks,
  createLicenseToken,
  isAwaitingPayment,
  isLicenseIdShape,
  isSuspended,
  isTokenIssuable,
  licenseIdSecret
} from "./license.js";
import { reportsEnabled, routeReportsApi } from "./reports.js";
import { mapStripeEvent, verifyStripeSignature } from "./stripe.js";
import { CREEM_SIGNATURE_HEADER, mapCreemEvent, verifyCreemSignature } from "./creem.js";
import { CLAIMABLE_PROVIDERS, MAX_BODY_BYTES, MAX_SESSION_ID_LENGTH } from "./limits.js";
import { confirmAndMapNotification, resolveNotificationTarget, verifyMercadoPagoSignature } from "./mercadopago.js";
import {
  clearEventSeen,
  getEntitlement,
  getLicenseIdForClaim,
  markEventSeen,
  noteRefusal,
  toPublicEntitlement,
  upsertEntitlement
} from "./store.js";

/**
 * Mercado Pago API failures retried for as long as Mercado Pago keeps trying:
 * the API's own trouble (429, 5xx), a body that is not JSON, no answer at all.
 */
const RETRY_ALWAYS = new Set(["api_error", "api_bad_json", "api_unreachable"]);

/** How long a resource the API refuses (404, 403, …) is retried: one day. */
const RETRY_REFUSED_SECONDS = 86400;

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
 * 202 while an async payment is still settling, 402 while it is refused but a
 * later payment on its subscription can bring it back, 403 once nothing can.
 *
 * The 402 is for the site's client as it is deployed: js/license.js forgets
 * the license on a 403 and keeps it on any other refusal, and js/billing.js
 * stops retrying a checkout's claim on reason "inactive" and keeps retrying on
 * any other. A browser that forgot its license never gets Pro back from it.
 * @param {Object} record Stored entitlement record.
 * @param {Object} env Worker env bindings.
 * @param {Object} cors CORS headers.
 * @returns {Promise<Response>} Response.
 */
async function respondWithToken(record, env, cors) {
  const now = Math.floor(Date.now() / 1000);
  if (isAwaitingPayment(record)) {
    // A delayed payment method has not settled yet; the browser keeps polling.
    return json({ ok: false, reason: "pending", entitlement: toPublicEntitlement(record) }, 202, cors);
  }
  if (!isTokenIssuable(record, now)) {
    return isSuspended(record, now)
      ? json({ ok: false, reason: "suspended", entitlement: toPublicEntitlement(record) }, 402, cors)
      : json({ ok: false, reason: "inactive", entitlement: toPublicEntitlement(record) }, 403, cors);
  }
  const { token } = await createLicenseToken(record, env, now);
  return json(
    { ok: true, licenseId: record.licenseId, token, entitlement: toPublicEntitlement(record) },
    200,
    cors
  );
}

/**
 * The clock these handlers run on: injected in tests, the real one otherwise.
 * @param {{now?: number}} [options] Router options.
 * @returns {number} Unix seconds.
 */
function clockSeconds(options) {
  return options && Number.isFinite(options.now) ? Math.floor(options.now) : Math.floor(Date.now() / 1000);
}

/**
 * Run a webhook and, if it fails for any reason, leave a row saying so.
 *
 * The row is in D1, which is a different service and a different daily budget
 * from KV, and that is the whole point: KV meters writes separately from reads,
 * so past the free plan's 1,000 writes a day `kv.put` throws while `kv.get`
 * keeps answering, and `/v1/health?probe=1` — which reads and must only read —
 * went on saying 200 through the one failure that costs money. `noteHealthFlag`
 * never throws, and the error is rethrown unchanged so the provider still
 * retries.
 *
 * @param {Object} env Worker env bindings.
 * @param {string} rail Provider name, a fixed string from this module.
 * @param {{now?: number}} [options] Router options.
 * @param {Function} run The handler.
 * @returns {Promise<Response>} Whatever the handler returned.
 */
async function recordingFailure(env, rail, options, run) {
  try {
    return await run();
  } catch (error) {
    await noteHealthFlag(env.DB, WEBHOOK_FAILED_FLAG, `${rail}: ${error && error.message}`, clockSeconds(options));
    throw error;
  }
}

/**
 * Handle POST /v1/webhooks/stripe.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {{now?: number}} [options] Injectable clock, for tests.
 * @returns {Promise<Response>} Response.
 */
async function handleStripeWebhook(request, env, options) {
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
    const { record, missing } = await upsertEntitlement(env.ENTITLEMENTS, mapped.update, { idSecret: licenseIdSecret(env) });
    if (missing) {
      // Money went back on a payment this worker has never heard of. Usually
      // that is a payment taken outside this product, on the same Stripe
      // account, which will never match and must not be retried for ever.
      // But it is also what an out-of-order delivery looks like — a refund
      // ahead of the checkout that paid — so it is retried for a day from the
      // first attempt, the same window a resource Mercado Pago's API has not
      // caught up on gets, and then acknowledged.
      const now = options && Number.isFinite(options.now) ? Math.floor(options.now) : Math.floor(Date.now() / 1000);
      const waitedFor = await noteRefusal(env.ENTITLEMENTS, "stripe", event.id, now);
      console.warn("stripe event names a license we do not know", event.type, waitedFor);
      if (waitedFor < RETRY_REFUSED_SECONDS) {
        await clearEventSeen(env.ENTITLEMENTS, "stripe", event.id);
        return json({ ok: false, reason: "unknown_license" }, 500);
      }
      return json({ ok: true, reason: "unknown_license" }, 200);
    }
    console.log("stripe entitlement updated", event.type, record.status, record.plan);
  } catch (error) {
    // The marker is already set; drop it so Stripe's retry is not dismissed.
    await clearEventSeen(env.ENTITLEMENTS, "stripe", event.id);
    throw error;
  }
  return json({ ok: true }, 200);
}

/**
 * Handle POST /v1/webhooks/creem.
 *
 * The same shape as the Stripe handler, and for the same reasons: the raw body
 * is read once (the signature is over those exact bytes), the event id is
 * marked seen before anything is applied, and the marker is dropped again if
 * the apply throws so Creem's retry is not dismissed as a duplicate.
 *
 * Creem's signature carries no timestamp, so a replay of a captured body
 * verifies for ever and this marker is the whole of the defence. Creem retries
 * an automatic delivery with the same event id, and a manual resend from the
 * dashboard gets a new one, which is exactly the behaviour the marker wants.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {{now?: number}} [options] Injectable clock, for tests.
 * @returns {Promise<Response>} Response.
 */
async function handleCreemWebhook(request, env, options) {
  const body = await readRawBody(request);
  if (!body.ok) {
    return json({ ok: false, reason: body.reason }, 413);
  }
  const verified = await verifyCreemSignature({
    rawBody: body.text,
    header: request.headers.get(CREEM_SIGNATURE_HEADER) || "",
    secret: env.CREEM_WEBHOOK_SECRET
  });
  if (!verified.ok) {
    console.warn("creem webhook rejected", verified.reason);
    return json({ ok: false, reason: verified.reason }, 400);
  }
  const event = parseJsonObject(body.text);
  if (!event || typeof event.id !== "string") {
    return json({ ok: false, reason: "malformed_event" }, 400);
  }
  const fresh = await markEventSeen(env.ENTITLEMENTS, "creem", event.id);
  if (!fresh) {
    return json({ ok: true, reason: "duplicate" }, 200);
  }
  const mapped = mapCreemEvent(event, env);
  if (!mapped.handled) {
    return json({ ok: true, reason: mapped.reason }, 200);
  }
  try {
    const { record, missing } = await upsertEntitlement(env.ENTITLEMENTS, mapped.update, { idSecret: licenseIdSecret(env) });
    if (missing) {
      // Money went back on a transaction this worker has never heard of:
      // usually something else sold from the same Creem account, which will
      // never match and must not be retried for ever. It is also what an
      // out-of-order delivery looks like, so it is retried for a day from the
      // first attempt — the same window the other rails get, and the whole of
      // Creem's own 24 hours of retries — and then acknowledged.
      const now = options && Number.isFinite(options.now) ? Math.floor(options.now) : Math.floor(Date.now() / 1000);
      const waitedFor = await noteRefusal(env.ENTITLEMENTS, "creem", event.id, now);
      console.warn("creem event names a license we do not know", event.eventType, waitedFor);
      if (waitedFor < RETRY_REFUSED_SECONDS) {
        await clearEventSeen(env.ENTITLEMENTS, "creem", event.id);
        return json({ ok: false, reason: "unknown_license" }, 500);
      }
      return json({ ok: true, reason: "unknown_license" }, 200);
    }
    console.log("creem entitlement updated", event.eventType, record.status, record.plan);
  } catch (error) {
    await clearEventSeen(env.ENTITLEMENTS, "creem", event.id);
    throw error;
  }
  return json({ ok: true }, 200);
}

/** Answer a Mercado Pago notification that was not applied: 500 and the marker dropped while it is worth retrying, 200 once it is not. */
async function answerUnappliedNotification(env, target, mapped, options) {
  console.warn("mercadopago notification not applied", target.kind, mapped.reason, mapped.status || "");
  // 500 so Mercado Pago retries when the API itself failed; 200 when we
  // simply do not care about this notification kind. A resource the API
  // refuses (not found, forbidden) is retried for a day from the first
  // refusal, which covers a read that lags the notification and gives an
  // operator time to fix an access token, and then acknowledged: Mercado
  // Pago otherwise retries a simulated or foreign notification forever.
  let retry = RETRY_ALWAYS.has(mapped.reason);
  if (!retry && (mapped.reason === "not_found" || mapped.reason === "api_refused")) {
    const now = options && Number.isFinite(options.now) ? Math.floor(options.now) : Math.floor(Date.now() / 1000);
    const refusedFor = await noteRefusal(env.ENTITLEMENTS, "mercadopago", target.eventId, now);
    retry = refusedFor < RETRY_REFUSED_SECONDS;
  }
  if (retry) {
    await clearEventSeen(env.ENTITLEMENTS, "mercadopago", target.eventId);
    return json({ ok: false, reason: mapped.reason }, 500);
  }
  return json({ ok: true, reason: mapped.reason }, 200);
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
      // Awaited here, not returned bare: a KV call that throws in there must
      // still reach the catch below and drop the marker.
      return await answerUnappliedNotification(env, target, mapped, options);
    }
    const { record } = await upsertEntitlement(env.ENTITLEMENTS, mapped.update, { idSecret: licenseIdSecret(env) });
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
  if (typeof provider !== "string" || !CLAIMABLE_PROVIDERS.has(provider)) {
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

/** D1 liveness (`SELECT 1`, which needs no schema) and, once that answers, the webhook-failure flag. */
async function probeDatabase(env, deps, checks) {
  try {
    await env.DB.prepare("SELECT 1 AS ok").first();
    checks.db = "ok";
  } catch {
    checks.db = "error";
  }
  if (checks.db === "ok") {
    try {
      const flag = await readHealthFlag(env.DB, WEBHOOK_FAILED_FLAG, clockSeconds(deps));
      checks.writes = flag.current ? "failing" : "ok";
    } catch {
      // No schema yet, which is a deployment nobody has used rather than a
      // deployment that is broken.
      checks.writes = "unknown";
    }
  }
}

/** One KV read, recorded in `checks.kv` as "ok" or "error". */
async function probeKv(env, checks) {
  try {
    await env.ENTITLEMENTS.get("health:probe");
    checks.kv = "ok";
  } catch {
    checks.kv = "error";
  }
}

/** What `?probe=1` reports: one read of each bound binding, "skipped" for one that is not bound. */
async function runHealthProbe(env, deps) {
  const checks = { db: "skipped", kv: "skipped", writes: "unknown" };
  if (env.DB) {
    await probeDatabase(env, deps, checks);
  }
  if (env.ENTITLEMENTS) {
    await probeKv(env, checks);
  }
  return checks;
}

/** The health route's configuration booleans, read out of `env` and never out of a binding. */
function healthConfiguration(env) {
  return {
    stripeConfigured: Boolean(env.STRIPE_WEBHOOK_SECRET),
    mercadopagoConfigured: Boolean(env.MP_WEBHOOK_SECRET && env.MP_ACCESS_TOKEN),
    // The merchant-of-record rail. One secret, because Creem needs no
    // server-side read to decide an entitlement: its webhook carries the
    // whole of what the store needs, unlike Mercado Pago.
    creemConfigured: Boolean(env.CREEM_WEBHOOK_SECRET),
    signingKeyConfigured: Boolean(env.LICENSE_PRIVATE_KEY_PKCS8_B64),
    accountsConfigured: Boolean(env.DB),
    eventsEnabled: Boolean(env.DB) && String(env.EVENTS_ENABLED || "").trim().toLowerCase() !== "false",
    reportsEnabled: reportsEnabled(env),
    authMethods: authMethods(env),
    siteOrigin: env.SITE_ORIGIN || ""
  };
}

/**
 * Handle GET /v1/health.
 *
 * Without `?probe=1`, booleans read out of the configuration and nothing else:
 * no database, no KV, no way to fail. With it, one read of each binding as well,
 * and a 503 if either refuses — see the comment in the body for what that costs
 * and why it reads rather than writes.
 * @param {Object} env Worker env bindings.
 * @param {Object} cors CORS headers.
 * @param {URL} [url] Parsed request URL, for `?probe=1`.
 * @returns {Promise<Response>} Response with booleans only.
 */
async function handleHealth(env, cors, url, deps) {
  // `?probe=1` is the only part of this route that can fail, and the reason it
  // exists is that the rest of it cannot. Everything below is read out of the
  // configuration, so this route answered `ok: true` with
  // `accountsConfigured: true` while D1 was past its daily row limit and every
  // account route was answering 500. "Configured" and "working" are different
  // questions and only one of them was being asked.
  //
  // Reads only, deliberately. A write probe would spend the scarce thing: the
  // KV free tier allows 1,000 writes a day against 100,000 reads
  // (developers.cloudflare.com/kv/platform/pricing, read 3 November 2026), so a
  // probe once a minute would eat the day's writes before noon. One D1 row read
  // and one KV read per call, 1,440 a day at a probe a minute, which is 0.03% of
  // D1's 5,000,000 daily row reads and 1.4% of KV's 100,000 reads.
  //
  // It is unauthenticated, like the rest of the route, so the honest statement of
  // the exposure is this: at the Workers free plan's ceiling of 100,000 requests
  // a day, probes alone would also reach KV's read ceiling — but a flood that
  // large has already stopped the worker by the request limit, so this cannot be
  // the thing that breaks first.
  //
  // Nothing about the failure is reported but that it failed. This route is
  // public, and a database error message is not ours to publish.
  // One more thing the reads above cannot see, and it is the failure this whole
  // document ranks first. KV meters writes separately from reads: past the free
  // plan's 1,000 writes a day, `kv.put` throws while `kv.get` keeps answering.
  // So a purchase that cannot be recorded left this probe entirely green, and
  // §4.1 of docs/43 claimed the free alarm caught "KV refusing" when it caught
  // KV *reads* refusing. QA found that on 2026-11-04.
  //
  // A failing webhook now writes one row into D1 — a different service and a
  // different budget — and this reads it. That is a second D1 statement per
  // probe, so two row reads a call: 2,880 a day at a probe a minute, against
  // D1's 5,000,000. It was written as one statement first, by having the flag
  // read double as the liveness check, and that was wrong in a way worth
  // recording: `health_flags` does not exist until `ensureSchema` has run, so a
  // freshly deployed worker that nobody had signed into yet reported its
  // database broken. A probe whose first answer on a good deploy is a false
  // alarm is worse than a probe that spends one more row read. So liveness is
  // still `SELECT 1`, which needs no schema, and a flag read that cannot find
  // its table says `unknown` rather than condemning anything.
  const probe = url && url.searchParams.get("probe") === "1";
  const checks = probe ? await runHealthProbe(env, deps) : undefined;
  const working =
    !probe || (checks.db !== "error" && checks.kv !== "error" && checks.writes !== "failing");
  return json(
    {
      ok: working,
      ...(probe ? { probe: checks } : {}),
      ...healthConfiguration(env)
    },
    working ? 200 : 503,
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

/** POST /v1/webhooks/*: refuse any other method, then run the rail's handler inside `recordingFailure`. */
function routeWebhook(request, env, url, path, options) {
  if (request.method !== "POST") {
    return json({ ok: false, reason: "method_not_allowed" }, 405, { allow: "POST" });
  }
  // Wrapped here rather than inside each handler, because the first thing
  // every one of them does is a KV write — `markEventSeen`, the idempotency
  // marker — and that one is outside their own try blocks. Which makes it the
  // single most likely place for the day's 1,000th KV write to throw, and the
  // place whose failure the read-only health probe could not see at all. At
  // this level nothing can escape: a refused write, a refused read, a bug.
  if (path === "/v1/webhooks/stripe") {
    return recordingFailure(env, "stripe", options, () => handleStripeWebhook(request, env, options));
  }
  return path === "/v1/webhooks/creem"
    ? recordingFailure(env, "creem", options, () => handleCreemWebhook(request, env, options))
    : recordingFailure(env, "mercadopago", options, () => handleMercadoPagoWebhook(request, env, url, options));
}

/** GET /v1/jwks: the published signing key, cacheable because it is public. */
async function handleJwks(request, env, cors) {
  if (request.method !== "GET") {
    return json({ ok: false, reason: "method_not_allowed" }, 405, { ...cors, allow: "GET" });
  }
  const jwks = await buildJwks(env);
  // The public key is public: let browsers and CDNs cache it.
  return json(jwks, 200, { ...cors, "cache-control": "public, max-age=600" });
}

/** The paths this module answers itself, ahead of the sub-routers (webhooks, claim, license, JWKS, geo); null for any other. */
function routeOwnPaths(request, env, url, path, cors, options) {
  if (path === "/v1/webhooks/stripe"
    || path === "/v1/webhooks/mercadopago"
    || path === "/v1/webhooks/creem") {
    return routeWebhook(request, env, url, path, options);
  }

  if (path === "/v1/claim" || path === "/v1/license") {
    if (request.method !== "POST") {
      return json({ ok: false, reason: "method_not_allowed" }, 405, { ...cors, allow: "POST" });
    }
    return path === "/v1/claim" ? handleClaim(request, env, cors) : handleLicense(request, env, cors);
  }

  if (path === "/v1/jwks") {
    return handleJwks(request, env, cors);
  }

  if (path === "/v1/geo") {
    if (request.method !== "GET") {
      return json({ ok: false, reason: "method_not_allowed" }, 405, { ...cors, allow: "GET" });
    }
    return handleGeo(request, cors);
  }
  return null;
}

/** The events, reports and account routers, tried in that order; the first answer wins, null if none claims the path. */
async function routeSubRouters(request, env, url, path, cors, options) {
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

  // Before the account router too, for the same reason: `/v1/admin/reports`
  // is inside the prefix it claims.
  const reportsResponse = await routeReportsApi(request, env, url, path, {
    json,
    cors,
    now: options && options.now,
    requireAdmin,
    requireSession,
    readJsonBody
  });
  if (reportsResponse) {
    return reportsResponse;
  }

  return routeAccountApi(request, env, url, path, {
    json,
    cors,
    now: options && options.now,
    fetchImpl: options && options.fetchImpl
  });
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

  const ownResponse = routeOwnPaths(request, env, url, path, cors, options);
  if (ownResponse) {
    return ownResponse;
  }

  const routedResponse = await routeSubRouters(request, env, url, path, cors, options);
  if (routedResponse) {
    return routedResponse;
  }

  if (path === "/v1/health") {
    if (request.method !== "GET") {
      return json({ ok: false, reason: "method_not_allowed" }, 405, { ...cors, allow: "GET" });
    }
    return handleHealth(env, cors, url, options);
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
