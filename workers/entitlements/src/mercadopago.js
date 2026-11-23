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

import { deadlineMs } from "./deadline.js";
import { hmacSha256Hex, timingSafeEqual } from "./license.js";
import { normalizePlanId } from "./stripe.js";

/** Replay window for the `ts=` value, in seconds. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Mercado Pago API base. */
export const MP_API_BASE = "https://api.mercadopago.com";

/** Deadline for one API read, well inside Mercado Pago's ~22 s webhook timeout. */
export const MP_API_TIMEOUT_MS = 8000;

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
 * A resource id as a notification may carry it: a non-empty string, or a
 * finite number. Anything else JSON can hold is no id. An object in particular
 * is refused rather than converted, because `{"toString":1}` has no string
 * value and `String()` throws on it, before the signature is checked.
 * @param {unknown} value Candidate id.
 * @returns {string|null} The id as a string, or null.
 */
function idValue(value) {
  if (typeof value === "string") {
    return value ? value : null;
  }
  return typeof value === "number" && Number.isFinite(value) ? String(value) : null;
}

/**
 * The `data.id` of a notification body, read only from an object: a falsy
 * `data` (`{"data":0}`) is no container, and must not stand in as the id
 * itself, as `body.data && body.data.id` let it.
 * @param {Object} body Parsed notification body.
 * @returns {string|null} The id, or null.
 */
function bodyDataId(body) {
  const data = body && body.data;
  return data && typeof data === "object" ? idValue(data.id) : null;
}

/**
 * The resource id a notification names, which is also the id its signature
 * covers. Mercado Pago signs `id:[data.id_url]`, and "los parámetros con el
 * sufijo _url provienen de query params" (Webhooks, "Validar origen de la
 * notificación"), so the query string's `data.id` comes first and the body's
 * only stands in when the query has none. The legacy IPN shape names the
 * resource as a bare `id`, in the query or the body.
 * @param {Object} body Parsed notification body.
 * @param {URLSearchParams|null} query Request query.
 * @returns {string|null} Resource id.
 */
function notificationResourceId(body, query) {
  return idValue(query && query.get("data.id"))
    || bodyDataId(body)
    || idValue(query && query.get("id"))
    || idValue(body && body.id);
}

/**
 * The kind of resource a notification names: its `type` (or legacy `topic`),
 * in the body or else the query.
 * @param {Object} body Parsed notification body.
 * @param {URLSearchParams|null} query Request query.
 * @returns {string|null} Kind.
 */
function notificationKind(body, query) {
  const raw = (body && (body.type || body.topic))
    || (query && (query.get("type") || query.get("topic")))
    || null;
  return typeof raw === "string" ? raw.trim() : null;
}

/**
 * Work out which API resource a notification points at.
 * @param {Object} body Parsed notification body.
 * @param {URL} [url] Request URL (Mercado Pago also passes topic/id as query params).
 * @returns {{kind: string|null, id: string|null, eventId: string|null}} Pointer.
 */
export function resolveNotificationTarget(body, url) {
  const query = url && url.searchParams ? url.searchParams : null;
  const kind = notificationKind(body, query);
  const id = notificationResourceId(body, query);
  // The notification's own id when it has one, else the resource's: both
  // checked like the id itself, since a template literal throws on the same
  // values `String()` does.
  const eventIdSource = idValue(body && body.id) || bodyDataId(body) || id;
  const action = body && typeof body.action === "string" ? body.action : kind;
  const eventId = eventIdSource ? `${action || "event"}:${eventIdSource}` : null;
  return { kind, id, eventId };
}

/**
 * Why an API read failed, by its HTTP status. "api_error" (429, 5xx) is the
 * API's own trouble and passes. "not_found" (404, 410) and "api_refused" (any
 * other 4xx) are about the resource or the access token: a notification the
 * dashboard simulates, a resource of another application, an access token
 * from the wrong account. Retrying those cannot help unless someone fixes
 * the configuration (see RETRY_REFUSED_SECONDS in index.js).
 * @param {number} status HTTP status of a failed read.
 * @returns {string} "api_error" | "not_found" | "api_refused".
 */
export function apiFailureReason(status) {
  if (status === 404 || status === 410) {
    return "not_found";
  }
  if (status >= 400 && status < 500 && status !== 429) {
    return "api_refused";
  }
  return "api_error";
}

/**
 * Fetch a Mercado Pago resource with the configured access token.
 * @param {string} kind Notification kind (key of RESOURCE_ENDPOINTS).
 * @param {string} id Resource id.
 * @param {Object} env Worker env bindings (needs MP_ACCESS_TOKEN).
 * @param {{fetchImpl?: function, timeoutMs?: number}} [options] Injectable fetch and deadline, for tests.
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
  let response;
  try {
    response = await doFetch(`${MP_API_BASE}${path}${encodeURIComponent(id)}`, {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        accept: "application/json"
      },
      // Mercado Pago waits about 22 s for our answer and then counts the
      // delivery as failed; a read with no deadline could outlive that and
      // leave the outcome to whatever the runtime does with a request whose
      // caller has gone. Past this, the read is "api_unreachable", which is
      // answered 500 inside Mercado Pago's window so it retries cleanly.
      signal: AbortSignal.timeout(deadlineMs(options, MP_API_TIMEOUT_MS))
    });
  } catch {
    return { ok: false, status: 0, reason: "api_unreachable" };
  }
  if (!response.ok) {
    return { ok: false, status: response.status, reason: apiFailureReason(response.status) };
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
 * True for a payment whose money went back to the payer.
 * @param {unknown} status Payment status.
 * @returns {boolean} Whether it was refunded or charged back.
 */
function isReversedPayment(status) {
  const value = String(status);
  return value === "refunded" || value === "charged_back";
}

/**
 * True for "cancelled" in either spelling. The payments API writes `cancelled`;
 * the authorized-payments reference writes `canceled`, for the invoice and for
 * its payment alike, so a check for one spelling misses the other topic.
 * @param {unknown} status A status.
 * @returns {boolean} Whether it says cancelled.
 */
function isCancelledStatus(status) {
  const value = String(status);
  return value === "cancelled" || value === "canceled";
}

/**
 * True for a payment that was turned down or called off, so no money came in.
 * @param {unknown} status Payment status.
 * @returns {boolean} Whether it was rejected or cancelled.
 */
function isDeclinedPayment(status) {
  return String(status) === "rejected" || isCancelledStatus(status);
}

/**
 * Map the status of a one-off payment (Checkout Pro, a payment link) to our
 * entitlement status. Nothing retries it, so there is no grace state: an
 * approved payment entitles, one still on its way (an unpaid cash voucher, a
 * card under review, a hold not yet captured, a dispute) is "pending", which
 * never entitles, and anything else did not bring money in.
 * @param {unknown} status Payment status.
 * @returns {string} "active" | "pending" | "canceled".
 */
export function mapOneOffPaymentStatus(status) {
  const value = String(status);
  if (value === "approved") {
    return "active";
  }
  if (value === "pending" || value === "in_process" || value === "authorized" || value === "in_mediation") {
    return "pending";
  }
  return "canceled";
}

/**
 * Map a Mercado Pago preapproval status to our entitlement status.
 * A preapproval still "pending" has no authorized card behind it yet.
 * @param {unknown} status Preapproval status.
 * @returns {string} "active" | "pending" | "canceled".
 */
export function mapPreapprovalStatus(status) {
  const value = String(status);
  if (value === "authorized") {
    return "active";
  }
  if (value === "pending") {
    return "pending";
  }
  return "canceled";
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
 * Derive the plan for a preapproval: configured plan ids, then what is actually
 * being billed, then reason / external_reference text.
 *
 * The order matters and used to be wrong. Free text came before the recurrence,
 * so a plan whose label happened to contain "anual" — or "year", or "año" —
 * while billing once a month bought a whole year of Pro for one monthly charge
 * (QA round 4, QA-W-04). A label is what somebody typed into the Mercado Pago
 * panel; `auto_recurring` is what the card is charged. When they disagree, the
 * charge is the fact and the label is a guess, so the charge decides. Text is
 * still read, because a preapproval can arrive with no recurrence block at all,
 * but only then.
 *
 * `preapproval_plan_id` stays first: it is the operator's own mapping, set in
 * wrangler.toml against the ids in their Mercado Pago account, and the only
 * source here that is neither free text nor inference.
 * @param {Object} preapproval Preapproval resource.
 * @param {Object} env Worker env bindings.
 * @returns {{plan: string, planSource: string}} Plan id and how we got it.
 */
export function planForPreapproval(preapproval, env) {
  const planId = preapproval && preapproval.preapproval_plan_id;
  const byPlanId = planFromConfiguredPlanId(planId, env);
  if (byPlanId) {
    return byPlanId;
  }
  const byReason = planFromText(preapproval && preapproval.reason);
  const byReference = planFromText(preapproval && preapproval.external_reference);
  const byRecurrence = planFromAutoRecurring(preapproval && preapproval.auto_recurring);
  if (byRecurrence) {
    // Say so when a label claimed something else, so an operator who meant the
    // label can see why it was ignored rather than wondering.
    const byText = byReason || byReference;
    const source = byText && byText !== byRecurrence ? "auto_recurring_over_text" : "auto_recurring";
    return { plan: byRecurrence, planSource: source };
  }
  if (byReason) {
    return { plan: byReason, planSource: "reason" };
  }
  if (byReference) {
    return { plan: byReference, planSource: "external_reference" };
  }
  return defaultPreapprovalPlan(preapproval, planId);
}

/** The plan the operator mapped a `preapproval_plan_id` to in wrangler.toml, or null. */
function planFromConfiguredPlanId(planId, env) {
  if (planId && env && planId === env.MP_PLAN_PRO_MONTHLY) {
    return { plan: "pro_monthly", planSource: "preapproval_plan_id" };
  }
  if (planId && env && planId === env.MP_PLAN_PRO_YEARLY) {
    return { plan: "pro_yearly", planSource: "preapproval_plan_id" };
  }
  return null;
}

/** Monthly when nothing names the plan, with the hints that were present recorded in its source. */
function defaultPreapprovalPlan(preapproval, planId) {
  // Unknowable: default to monthly (the cheaper grant) and record what we saw.
  const seen = [
    planId ? `plan_id=${planId}` : null,
    preapproval && preapproval.reason ? "reason_present" : null,
    preapproval && preapproval.external_reference ? "external_reference_present" : null
  ].filter(Boolean).join(",");
  return { plan: "pro_monthly", planSource: `default(${seen || "no_hints"})` };
}

/**
 * When a resource last changed, as unix seconds.
 * Two notifications about the same resource can still land out of order, so the
 * store needs a timestamp even though the API read is authoritative for state.
 * @param {Object} resource API resource.
 * @returns {number|null} Unix seconds or null.
 */
export function resourceOccurredAt(resource) {
  if (!resource || typeof resource !== "object") {
    return null;
  }
  return isoToUnixSeconds(resource.date_last_updated)
    || isoToUnixSeconds(resource.last_modified)
    || isoToUnixSeconds(resource.date_approved)
    || isoToUnixSeconds(resource.date_created);
}

/**
 * Map a confirmed payment resource to an entitlement update.
 * @param {Object} payment Payment resource from the API.
 * @param {Object} env Worker env bindings.
 * @returns {Object} Entitlement update descriptor.
 */
export function mapPaymentResource(payment, env) {
  const p = payment || {};
  const subscriptionId = paymentSubscriptionId(p);
  // A subscription's charge whose subscription it cannot name is not a one-off
  // purchase, so it is not filed as one (see `claimId`). The authorized-payment
  // topic carries the same charge with its `preapproval_id`, which is the
  // documented link; this topic's is not (VG-84).
  const unlinkedRecurring = !subscriptionId && String(p.operation_type) === "recurring_payment";
  const approved = String(p.status) === "approved";
  const occurredAt = resourceOccurredAt(payment);
  // A subscription's charge that has not gone through says nothing new about
  // the subscription: Mercado Pago retries it, and the preapproval and
  // authorized-payment notifications carry the subscription's own state. It
  // only records which license its payment id belongs to. One whose money went
  // back says nothing about the subscription's state either: the reversal
  // below ends the period it paid for, without moving the subscription's clock.
  const silent = Boolean(subscriptionId) && !approved;
  const named = silent ? {} : paymentPlan(p, subscriptionId);
  return {
    provider: "mercadopago",
    // A payment's id is Mercado Pago's operation number: sequential, and
    // printed on the payer's receipt. A subscription's charge is never filed
    // under it, or holding a receipt (or walking the numbers near one) claimed
    // the subscription, and linking by it took the subscription from its payer
    // for good. A subscription is claimed by its preapproval id, the 32-hex id
    // the payer's browser comes back with. Only a one-off payment, which comes
    // back with nothing but its number, is filed under it, and claims by such
    // a number are throttled (MP_CLAIM_IP_LIMIT).
    claimId: subscriptionId || unlinkedRecurring ? null : idValue(p.id),
    subscriptionId: subscriptionId ? String(subscriptionId) : null,
    customerId: p.payer && p.payer.id ? String(p.payer.id) : null,
    plan: named.plan,
    planSource: named.planSource,
    status: silent ? undefined : mapOneOffPaymentStatus(p.status),
    // Money arrived. A subscription is recorded unpaid until a charge says so
    // (see mapPreapprovalResource); this is what says so on the payment topic.
    paid: approved || undefined,
    // `date_of_expiration` is the voucher's or payment's deadline, not a
    // paid-through date, so it never becomes the period end.
    periodEnd: undefined,
    // Checkout Pro / payment links have no subscription lifecycle behind them,
    // so nothing would ever expire this record. Entitle for one plan interval
    // from the approval instead; a renewal payment extends it. Only money that
    // arrived buys time: an unpaid voucher or a turned-down card gets none.
    periodEndFromCharge: approved ? chargeTime(p, null) : null,
    ...paymentReversal(p, subscriptionId, occurredAt),
    occurredAt: silent ? null : occurredAt
  };
}

/**
 * The preapproval a payment belongs to, or null. None of these is in the
 * payments API reference: `preapproval_id` (top level, or in `metadata`) is
 * what this worker has always read, and `point_of_interaction.transaction_data
 * .subscription_id` is where Mercado Pago's recurring-charges messaging puts a
 * subscription's id. Unconfirmed against a sandbox subscription charge; the
 * authorized-payment topic, whose `preapproval_id` is documented, does not
 * depend on any of them.
 * @param {Object} p Payment resource.
 * @returns {string|null} Preapproval id.
 */
function paymentSubscriptionId(p) {
  const poi = p.point_of_interaction && p.point_of_interaction.transaction_data;
  return idValue(p.preapproval_id)
    || idValue(p.metadata && p.metadata.preapproval_id)
    || idValue(poi && poi.subscription_id);
}

/**
 * The plan a payment names, and how. A subscription's charge never sets it:
 * which plan a subscription is on is what its preapproval bills
 * (`auto_recurring`, or the configured plan id), and the charge's text is
 * whatever somebody typed, which QA-W-04 already stopped trusting over the
 * recurrence. Read here, a "Pro anual" description on a monthly charge
 * bought a year (VG-84 review). The monthly default would also downgrade a
 * yearly subscription, so it gets nothing. A one-off payment is a month
 * unless its text says a year.
 * @param {Object} payment Payment resource.
 * @param {string|null} subscriptionId The preapproval it belongs to, if any.
 * @returns {{plan: string|undefined, planSource: string|undefined}} Plan and source.
 */
function paymentPlan(payment, subscriptionId) {
  if (subscriptionId) {
    return { plan: undefined, planSource: undefined };
  }
  const byText = planFromText(payment.external_reference)
    || planFromText(payment.metadata && payment.metadata.plan)
    || planFromText(payment.description);
  return { plan: byText || "pro_monthly", planSource: byText ? "payment_text" : "default(payment)" };
}

/**
 * What a payment says about money going back, or a subscription's charge
 * turned down.
 * @param {Object} payment Payment resource.
 * @param {string|null} subscriptionId The preapproval it belongs to, if any.
 * @param {number|null} occurredAt When the payment was last updated.
 * @returns {{reversedAt: number|undefined, reversedChargeAt: number|undefined, declinedAt: number|undefined}} Fields.
 */
function paymentReversal(payment, subscriptionId, occurredAt) {
  const reversed = isReversedPayment(payment.status);
  return {
    // Money given back (a refund, a chargeback) takes the access it paid for
    // with it, from the moment it left, whether the payment stood alone or was
    // a subscription's charge. When the charge went through tells the store
    // which period that was. A later approved charge brings access back.
    reversedAt: reversed ? occurredAt : undefined,
    reversedChargeAt: reversed ? chargeTime(payment, occurredAt) : undefined,
    // A subscription's charge that was turned down. It takes no time away (a
    // subscription's period is what its last approved charge bought, see
    // `holdToPaidPeriod` in the store); it tells the buyer why Pro is off
    // (402 "declined") until a charge goes through.
    declinedAt: subscriptionId && isDeclinedPayment(payment.status) ? chargeTime(payment, occurredAt) : undefined
  };
}

/**
 * When a reversed charge had gone through. A charge is never reversed before
 * it was made, so without a date of its own the reversal's time stands in,
 * which counts its period no shorter than it was.
 * @param {Object} payment Payment (or an authorized payment's `payment`).
 * @param {number|null} fallback Unix seconds to use when the payment says nothing.
 * @returns {number|null} Unix seconds or null.
 */
function chargeTime(payment, fallback) {
  return isoToUnixSeconds(payment && payment.date_approved)
    || isoToUnixSeconds(payment && payment.date_created)
    || fallback;
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
  const status = mapPreapprovalStatus(preapproval && preapproval.status);
  return {
    provider: "mercadopago",
    claimId: id,
    subscriptionId: id,
    customerId: preapproval && preapproval.payer_id ? String(preapproval.payer_id) : null,
    plan,
    planSource,
    status,
    // An authorized mandate is a card Mercado Pago may charge, not money: the
    // first instalment is charged "approximately one hour" after subscribing,
    // and it can be turned down. So a subscription starts unpaid, answers 202
    // while it waits, and entitles only once an approved charge for it is
    // confirmed (on the payment or the authorized-payment topic). Never taken
    // back once a charge is confirmed: the store keeps `paid` one-way (VG-84).
    paid: false,
    // The next charge date is when Mercado Pago will try to charge again, not
    // what anybody paid for: it moves with no money behind it (a pause and a
    // reactivation, a charge called off). So once a charge has gone through,
    // the store holds the period to what that charge bought and ignores this
    // (`holdToPaidPeriod`, VG-84 review). It stands only while no charge is
    // known, when nothing entitles anyway (`paid: false`). On a subscription
    // never authorized it is a charge that may never happen, and a paused or
    // cancelled one keeps the period end it already had.
    periodEnd: status === "active" ? isoToUnixSeconds(preapproval && preapproval.next_payment_date) : undefined,
    occurredAt: resourceOccurredAt(preapproval)
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
  const a = authorized || {};
  const payment = a.payment || {};
  // Only a charge whose money arrived says anything new. One still in flight
  // or turned down (an uncaptured "authorized" hold included) leaves the
  // subscription as it was, as on the payment topic: Mercado Pago retries it,
  // and the preapproval notifications carry the subscription's state and
  // period. It does not move the clock either, or the subscription's own,
  // older notification would be refused as stale.
  //
  // Only the payment's own status says money arrived. The invoice's
  // `processed` is documented as "collected or exceeded retries", so on an
  // invoice that names no payment it is as likely to mean the instalment was
  // given up on as that it was paid, and it used to be read as paid.
  const approved = String(payment.status) === "approved";
  const occurredAt = resourceOccurredAt(authorized);
  // A refunded or charged-back charge ends the period it paid for, as on the
  // payment topic, and likewise leaves the subscription's state and clock to
  // the subscription's own notifications.
  const reversed = isReversedPayment(payment.status);
  const dueAt = chargeDueAt(a, occurredAt);
  return {
    provider: "mercadopago",
    // A recurring charge's id is a number like a payment's (see
    // mapPaymentResource), and the charge belongs to the subscription: it is
    // found through `subscriptionId`, and claimed by the preapproval id alone.
    claimId: null,
    subscriptionId: a.preapproval_id ? String(a.preapproval_id) : null,
    customerId: null,
    plan: undefined,
    planSource: undefined,
    status: approved ? "active" : undefined,
    // Money arrived, which is what lets the subscription entitle (VG-84).
    paid: approved || undefined,
    // `next_retry_date` is a dunning date, not a paid-through date: never let it
    // become the period end.
    periodEnd: undefined,
    // A recurring charge extends the period by one interval of whatever plan the
    // license already holds (the store knows it; this resource does not).
    periodEndFromCharge: approved ? (isoToUnixSeconds(payment.date_approved) || chargeDueAt(a, null)) : null,
    reversedAt: reversed ? occurredAt : undefined,
    reversedChargeAt: reversed ? chargeTime(payment, dueAt) : undefined,
    declinedAt: instalmentDeclinedAt(a, payment, dueAt, occurredAt),
    occurredAt: approved ? occurredAt : null
  };
}

/**
 * When an instalment's charge was turned down, or undefined when it was not.
 *
 * Dated by when it was due, so a retry that goes through later is the newer
 * of the two, as long as the invoice still says when that was. Mercado Pago
 * moves a turned-down instalment "to a new collection date" for its next
 * retry, so `debit_date` can be ahead of the invoice's last update by the time
 * it is read; the attempt that failed is then dated by that update ("an
 * invoice is modified when an update occurs in collection attempts"). Only an
 * invoice Mercado Pago is still collecting (`recycling`), gave up on
 * (`processed`) or has already tried (`retry_attempt` above 0) is read that
 * way. One not yet due and never tried was called off (stopping the
 * subscription does that to its next charge), not turned down, and so is any
 * invoice that is itself cancelled.
 * @param {Object} authorized Authorized payment resource.
 * @param {Object} payment Its `payment`.
 * @param {number|null} dueAt When it was due.
 * @param {number|null} occurredAt When it was last updated.
 * @returns {number|undefined} Unix seconds.
 */
function instalmentDeclinedAt(authorized, payment, dueAt, occurredAt) {
  if (!isDeclinedPayment(payment.status) || isCancelledStatus(authorized.status)) {
    return undefined;
  }
  if (!(dueAt > occurredAt)) {
    return dueAt;
  }
  const status = String(authorized.status);
  const tried = status === "recycling" || status === "processed" || Number(authorized.retry_attempt) > 0;
  return tried ? occurredAt : undefined;
}

/**
 * When a recurring charge was due: its debit date, else when it was created,
 * else `fallback`.
 * @param {Object} authorized Authorized payment resource.
 * @param {number|null} fallback Unix seconds to use when it says nothing.
 * @returns {number|null} Unix seconds or null.
 */
function chargeDueAt(authorized, fallback) {
  return isoToUnixSeconds(authorized.debit_date) || isoToUnixSeconds(authorized.date_created) || fallback;
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
