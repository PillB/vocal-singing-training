/**
 * Mercado Pago webhook support: signature verification, API confirmation and
 * event -> entitlement mapping.
 *
 * Two rules drive this module:
 *   1. The `x-signature` header is verified against the documented manifest
 *      before anything else happens.
 *   2. The notification body is treated as a *pointer only*. State always comes
 *      from a fresh authenticated read of the Mercado Pago API.
 *
 * Docs: https://www.mercadopago.com.pe/developers/en/docs/your-integrations/notifications/webhooks
 */

"use strict";

import { hmacSha256Hex, timingSafeEqual } from "./license.js";
import { normalizePlanId } from "./stripe.js";

/** Replay window for the `ts=` value, in seconds. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Mercado Pago API base. */
export const MP_API_BASE = "https://api.mercadopago.com";

/** Notification kinds we know how to confirm. */
export const RESOURCE_ENDPOINTS = {
  payment: "/v1/payments/",
  subscription_preapproval: "/preapproval/",
  subscription_authorized_payment: "/authorized_payments/"
};

/**
 * Parse an `x-signature` header (`ts=<ts>,v1=<hex>`).
 * @param {string} header Raw header value.
 * @returns {{ts: string|null, v1: string|null}} Parsed parts.
 */
export function parseMercadoPagoSignatureHeader(header) {
  const result = { ts: null, v1: null };
  if (typeof header !== "string" || header.length === 0) {
    return result;
  }
  for (const part of header.split(",")) {
    const index = part.indexOf("=");
    if (index <= 0) {
      continue;
    }
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key === "ts" && value) {
      result.ts = value;
    } else if (key === "v1" && value) {
      result.v1 = value.toLowerCase();
    }
  }
  return result;
}

/**
 * Build the documented signature manifest.
 * Segments whose value is absent are omitted entirely, as the docs require.
 * @param {{dataId?: string|null, requestId?: string|null, ts?: string|null}} parts Manifest parts.
 * @returns {string} Manifest string.
 */
export function buildMercadoPagoManifest(parts) {
  let manifest = "";
  if (parts.dataId !== undefined && parts.dataId !== null && parts.dataId !== "") {
    manifest += `id:${String(parts.dataId).toLowerCase()};`;
  }
  if (parts.requestId !== undefined && parts.requestId !== null && parts.requestId !== "") {
    manifest += `request-id:${parts.requestId};`;
  }
  if (parts.ts !== undefined && parts.ts !== null && parts.ts !== "") {
    manifest += `ts:${parts.ts};`;
  }
  return manifest;
}

/**
 * Verify a Mercado Pago webhook signature.
 * @param {{header: string, dataId?: string|null, requestId?: string|null, secret: string, now?: number, toleranceSeconds?: number}} input Verification input.
 * @returns {Promise<{ok: boolean, reason?: string}>} Result; `reason` is a safe, secret-free code.
 */
export async function verifyMercadoPagoSignature(input) {
  const { header, secret } = input;
  const now = Number.isFinite(input.now) ? input.now : Math.floor(Date.now() / 1000);
  const tolerance = Number.isFinite(input.toleranceSeconds)
    ? input.toleranceSeconds
    : SIGNATURE_TOLERANCE_SECONDS;

  if (typeof secret !== "string" || secret.length === 0) {
    return { ok: false, reason: "secret_not_configured" };
  }
  const parsed = parseMercadoPagoSignatureHeader(header);
  if (!parsed.ts) {
    return { ok: false, reason: "missing_timestamp" };
  }
  if (!parsed.v1) {
    return { ok: false, reason: "missing_signature" };
  }
  const tsSeconds = normalizeTimestampSeconds(parsed.ts);
  if (tsSeconds === null) {
    return { ok: false, reason: "malformed_timestamp" };
  }
  if (Math.abs(now - tsSeconds) > tolerance) {
    return { ok: false, reason: "timestamp_out_of_tolerance" };
  }
  const manifest = buildMercadoPagoManifest({
    dataId: input.dataId,
    requestId: input.requestId,
    ts: parsed.ts
  });
  const expected = await hmacSha256Hex(secret, manifest);
  return timingSafeEqual(expected, parsed.v1)
    ? { ok: true }
    : { ok: false, reason: "signature_mismatch" };
}

/**
 * Mercado Pago sends `ts` either as unix seconds or unix milliseconds.
 * @param {string} value Raw ts value.
 * @returns {number|null} Unix seconds or null when unparseable.
 */
export function normalizeTimestampSeconds(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed > 1e11 ? Math.floor(parsed / 1000) : parsed;
}

/**
 * Work out which API resource a notification points at.
 * @param {Object} body Parsed notification body.
 * @param {URL} [url] Request URL (Mercado Pago also passes topic/id as query params).
 * @returns {{kind: string|null, id: string|null, eventId: string|null}} Pointer.
 */
export function resolveNotificationTarget(body, url) {
  const query = url && url.searchParams ? url.searchParams : null;
  const rawKind = (body && (body.type || body.topic))
    || (query && (query.get("type") || query.get("topic")))
    || null;
  const kind = typeof rawKind === "string" ? rawKind.trim() : null;
  const rawId = (body && body.data && body.data.id)
    || (query && (query.get("data.id") || query.get("id")))
    || (body && body.id)
    || null;
  const id = rawId === null || rawId === undefined ? null : String(rawId);
  const eventIdSource = (body && (body.id || (body.data && body.data.id))) || id;
  const action = body && typeof body.action === "string" ? body.action : kind;
  const eventId = eventIdSource ? `${action || "event"}:${eventIdSource}` : null;
  return { kind, id, eventId };
}

/**
 * Fetch a Mercado Pago resource with the configured access token.
 * @param {string} kind Notification kind (key of RESOURCE_ENDPOINTS).
 * @param {string} id Resource id.
 * @param {Object} env Worker env bindings (needs MP_ACCESS_TOKEN).
 * @param {{fetchImpl?: function}} [options] Injectable fetch for tests.
 * @returns {Promise<{ok: boolean, status: number, body?: Object, reason?: string}>} API result.
 */
export async function fetchMercadoPagoResource(kind, id, env, options) {
  const path = RESOURCE_ENDPOINTS[kind];
  if (!path) {
    return { ok: false, status: 0, reason: "unsupported_kind" };
  }
  const token = env && typeof env.MP_ACCESS_TOKEN === "string" ? env.MP_ACCESS_TOKEN : "";
  if (!token) {
    return { ok: false, status: 0, reason: "access_token_not_configured" };
  }
  const doFetch = (options && options.fetchImpl) || fetch;
  const response = await doFetch(`${MP_API_BASE}${path}${encodeURIComponent(id)}`, {
    method: "GET",
    headers: {
      authorization: `Bearer ${token}`,
      accept: "application/json"
    }
  });
  if (!response.ok) {
    return { ok: false, status: response.status, reason: "api_error" };
  }
  let body = null;
  try {
    body = await response.json();
  } catch {
    return { ok: false, status: response.status, reason: "api_bad_json" };
  }
  return { ok: true, status: response.status, body };
}

/**
 * Map a Mercado Pago payment status to our entitlement status.
 * @param {unknown} status Payment status.
 * @returns {string} "active" | "past_due" | "canceled".
 */
export function mapPaymentStatus(status) {
  const value = String(status);
  if (value === "approved" || value === "authorized") {
    return "active";
  }
  if (value === "cancelled" || value === "canceled" || value === "refunded" || value === "charged_back") {
    return "canceled";
  }
  return "past_due";
}

/**
 * Map a Mercado Pago preapproval status to our entitlement status.
 * @param {unknown} status Preapproval status.
 * @returns {string} "active" | "past_due" | "canceled".
 */
export function mapPreapprovalStatus(status) {
  const value = String(status);
  if (value === "authorized") {
    return "active";
  }
  if (value === "paused" || value === "cancelled" || value === "canceled") {
    return "canceled";
  }
  return "past_due";
}

/**
 * Parse a Mercado Pago ISO date into unix seconds.
 * @param {unknown} value ISO-8601 date string.
 * @returns {number|null} Unix seconds or null.
 */
export function isoToUnixSeconds(value) {
  if (typeof value !== "string" || !value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/**
 * Derive a plan id from free-text Mercado Pago fields.
 * @param {unknown} value Candidate text (reason / external_reference).
 * @returns {string|null} Plan id or null.
 */
export function planFromText(value) {
  if (typeof value !== "string" || !value) {
    return null;
  }
  const normalized = value.toLowerCase();
  const direct = normalizePlanId(normalized.includes("pro_yearly")
    ? "pro_yearly"
    : (normalized.includes("pro_monthly") ? "pro_monthly" : null));
  if (direct) {
    return direct;
  }
  if (/\b(year|yearly|anual|annual|año|ano)\b/.test(normalized)) {
    return "pro_yearly";
  }
  if (/\b(month|monthly|mensual|mes)\b/.test(normalized)) {
    return "pro_monthly";
  }
  return null;
}

/**
 * Derive a plan id from a preapproval's recurrence settings.
 * @param {Object} autoRecurring The `auto_recurring` object.
 * @returns {string|null} Plan id or null.
 */
export function planFromAutoRecurring(autoRecurring) {
  if (!autoRecurring || typeof autoRecurring !== "object") {
    return null;
  }
  const frequency = Number(autoRecurring.frequency);
  const type = String(autoRecurring.frequency_type || "");
  if (type === "years" || type === "year") {
    return "pro_yearly";
  }
  if ((type === "months" || type === "month") && Number.isFinite(frequency)) {
    return frequency >= 12 ? "pro_yearly" : "pro_monthly";
  }
  if ((type === "days" || type === "day") && Number.isFinite(frequency)) {
    return frequency >= 300 ? "pro_yearly" : "pro_monthly";
  }
  return null;
}

/**
 * Derive the plan for a preapproval: configured plan ids, then reason /
 * external_reference text, then the recurrence settings.
 * @param {Object} preapproval Preapproval resource.
 * @param {Object} env Worker env bindings.
 * @returns {{plan: string, planSource: string}} Plan id and how we got it.
 */
export function planForPreapproval(preapproval, env) {
  const planId = preapproval && preapproval.preapproval_plan_id;
  if (planId && env && planId === env.MP_PLAN_PRO_MONTHLY) {
    return { plan: "pro_monthly", planSource: "preapproval_plan_id" };
  }
  if (planId && env && planId === env.MP_PLAN_PRO_YEARLY) {
    return { plan: "pro_yearly", planSource: "preapproval_plan_id" };
  }
  const byReason = planFromText(preapproval && preapproval.reason);
  if (byReason) {
    return { plan: byReason, planSource: "reason" };
  }
  const byReference = planFromText(preapproval && preapproval.external_reference);
  if (byReference) {
    return { plan: byReference, planSource: "external_reference" };
  }
  const byRecurrence = planFromAutoRecurring(preapproval && preapproval.auto_recurring);
  if (byRecurrence) {
    return { plan: byRecurrence, planSource: "auto_recurring" };
  }
  // Unknowable: default to monthly (the cheaper grant) and record what we saw.
  const seen = [
    planId ? `plan_id=${planId}` : null,
    preapproval && preapproval.reason ? "reason_present" : null,
    preapproval && preapproval.external_reference ? "external_reference_present" : null
  ].filter(Boolean).join(",");
  return { plan: "pro_monthly", planSource: `default(${seen || "no_hints"})` };
}

/**
 * Map a confirmed payment resource to an entitlement update.
 * @param {Object} payment Payment resource from the API.
 * @param {Object} env Worker env bindings.
 * @returns {Object} Entitlement update descriptor.
 */
export function mapPaymentResource(payment, env) {
  const metadata = (payment && payment.metadata) || {};
  const byText = planFromText(payment && payment.external_reference)
    || planFromText(metadata.plan)
    || planFromText(payment && payment.description);
  const subscriptionId = (payment && (payment.preapproval_id || metadata.preapproval_id)) || null;
  return {
    provider: "mercadopago",
    claimId: payment && payment.id !== undefined && payment.id !== null ? String(payment.id) : null,
    subscriptionId: subscriptionId ? String(subscriptionId) : null,
    customerId: payment && payment.payer && payment.payer.id ? String(payment.payer.id) : null,
    plan: byText || "pro_monthly",
    planSource: byText ? "payment_text" : "default(payment)",
    status: mapPaymentStatus(payment && payment.status),
    periodEnd: isoToUnixSeconds(payment && payment.date_of_expiration)
  };
}

/**
 * Map a confirmed preapproval resource to an entitlement update.
 * @param {Object} preapproval Preapproval resource from the API.
 * @param {Object} env Worker env bindings.
 * @returns {Object} Entitlement update descriptor.
 */
export function mapPreapprovalResource(preapproval, env) {
  const { plan, planSource } = planForPreapproval(preapproval, env);
  const id = preapproval && preapproval.id !== undefined && preapproval.id !== null
    ? String(preapproval.id)
    : null;
  return {
    provider: "mercadopago",
    claimId: id,
    subscriptionId: id,
    customerId: preapproval && preapproval.payer_id ? String(preapproval.payer_id) : null,
    plan,
    planSource,
    status: mapPreapprovalStatus(preapproval && preapproval.status),
    periodEnd: isoToUnixSeconds(preapproval && preapproval.next_payment_date)
  };
}

/**
 * Map a confirmed authorized-payment resource to an entitlement update.
 * The authorized payment carries the recurring charge for a preapproval, so the
 * license is keyed on `preapproval_id`.
 * @param {Object} authorized Authorized payment resource from the API.
 * @param {Object} env Worker env bindings.
 * @returns {Object} Entitlement update descriptor.
 */
export function mapAuthorizedPaymentResource(authorized, env) {
  const paymentStatus = authorized && authorized.payment && authorized.payment.status;
  const status = paymentStatus
    ? mapPaymentStatus(paymentStatus)
    : (String(authorized && authorized.status) === "processed" ? "active" : "past_due");
  const subscriptionId = authorized && authorized.preapproval_id ? String(authorized.preapproval_id) : null;
  return {
    provider: "mercadopago",
    claimId: authorized && authorized.id !== undefined && authorized.id !== null
      ? String(authorized.id)
      : null,
    subscriptionId,
    customerId: null,
    plan: undefined,
    planSource: undefined,
    status,
    periodEnd: isoToUnixSeconds(authorized && authorized.next_retry_date)
  };
}

/**
 * Map a confirmed API resource onto an entitlement update descriptor.
 * @param {string} kind Notification kind.
 * @param {Object} resource API resource.
 * @param {Object} env Worker env bindings.
 * @returns {{handled: boolean, reason?: string, update?: Object}} Mapping result.
 */
export function mapMercadoPagoResource(kind, resource, env) {
  if (!resource || typeof resource !== "object") {
    return { handled: false, reason: "missing_resource" };
  }
  let update = null;
  if (kind === "payment") {
    update = mapPaymentResource(resource, env);
  } else if (kind === "subscription_preapproval") {
    update = mapPreapprovalResource(resource, env);
  } else if (kind === "subscription_authorized_payment") {
    update = mapAuthorizedPaymentResource(resource, env);
  } else {
    return { handled: false, reason: "unhandled_kind" };
  }
  if (!update.subscriptionId && !update.claimId) {
    return { handled: false, reason: "no_license_identity" };
  }
  return { handled: true, update };
}

/**
 * Confirm a notification against the Mercado Pago API and map it.
 * Never derives state from the notification body.
 * @param {{kind: string, id: string}} target Notification pointer.
 * @param {Object} env Worker env bindings.
 * @param {{fetchImpl?: function}} [options] Injectable fetch for tests.
 * @returns {Promise<{handled: boolean, reason?: string, update?: Object, status?: number}>} Result.
 */
export async function confirmAndMapNotification(target, env, options) {
  if (!target || !target.kind || !target.id) {
    return { handled: false, reason: "missing_target" };
  }
  const fetched = await fetchMercadoPagoResource(target.kind, target.id, env, options);
  if (!fetched.ok) {
    return { handled: false, reason: fetched.reason, status: fetched.status };
  }
  return mapMercadoPagoResource(target.kind, fetched.body, env);
}
