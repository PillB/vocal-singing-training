/**
 * Stripe webhook support: signature verification and event -> entitlement mapping.
 *
 * No npm `stripe` package: the signature check below is the documented
 * scheme from https://docs.stripe.com/webhooks/signature implemented with
 * WebCrypto HMAC-SHA256.
 *
 * Everything here is a pure function over (rawBody, headers, env) so the
 * test-suite can exercise it without a Workers runtime.
 */

"use strict";

import { hmacSha256Hex, timingSafeEqual } from "./license.js";

/** Replay window for the `t=` timestamp, in seconds. */
export const SIGNATURE_TOLERANCE_SECONDS = 300;

/** Event types this worker acts on. Anything else is acknowledged and ignored. */
export const HANDLED_EVENT_TYPES = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "checkout.session.async_payment_failed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.paid",
  "invoice.payment_failed"
];

/** Stripe subscription status -> our entitlement status. */
const STATUS_MAP = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  unpaid: "past_due",
  // "incomplete" is a subscription whose FIRST payment never succeeded: the
  // same "money has not arrived" case as an unpaid checkout session, so it must
  // not fall into the entitling "past_due" grace state.
  incomplete: "pending",
  canceled: "canceled",
  incomplete_expired: "canceled",
  paused: "past_due"
};

/**
 * Parse a `Stripe-Signature` header into its timestamp and v1 signatures.
 * @param {string} header Raw header value.
 * @returns {{timestamp: number|null, signatures: string[]}} Parsed parts.
 */
export function parseStripeSignatureHeader(header) {
  const result = { timestamp: null, signatures: [] };
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
    if (key === "t") {
      const parsed = Number.parseInt(value, 10);
      result.timestamp = Number.isFinite(parsed) ? parsed : null;
    } else if (key === "v1" && value) {
      result.signatures.push(value.toLowerCase());
    }
  }
  return result;
}

/**
 * Verify a Stripe webhook signature against the raw request body.
 *
 * The body must be the exact bytes Stripe sent (request.text()), never
 * re-serialized JSON.
 *
 * @param {{rawBody: string, header: string, secret: string, now?: number, toleranceSeconds?: number}} input Verification input.
 * @returns {Promise<{ok: boolean, reason?: string}>} Result; `reason` is a safe, secret-free code.
 */
export async function verifyStripeSignature(input) {
  const { rawBody, header, secret } = input;
  const now = Number.isFinite(input.now) ? input.now : Math.floor(Date.now() / 1000);
  const tolerance = Number.isFinite(input.toleranceSeconds)
    ? input.toleranceSeconds
    : SIGNATURE_TOLERANCE_SECONDS;

  if (typeof secret !== "string" || secret.length === 0) {
    return { ok: false, reason: "secret_not_configured" };
  }
  if (typeof rawBody !== "string") {
    return { ok: false, reason: "missing_body" };
  }
  const parsed = parseStripeSignatureHeader(header);
  if (parsed.timestamp === null) {
    return { ok: false, reason: "missing_timestamp" };
  }
  if (parsed.signatures.length === 0) {
    return { ok: false, reason: "missing_signature" };
  }
  if (Math.abs(now - parsed.timestamp) > tolerance) {
    return { ok: false, reason: "timestamp_out_of_tolerance" };
  }
  const expected = await hmacSha256Hex(secret, `${parsed.timestamp}.${rawBody}`);
  let matched = false;
  for (const candidate of parsed.signatures) {
    // No early break: every candidate is compared so the work is constant.
    matched = timingSafeEqual(expected, candidate) || matched;
  }
  return matched ? { ok: true } : { ok: false, reason: "signature_mismatch" };
}

/**
 * Accept only plan ids this worker issues.
 * @param {unknown} value Candidate plan id.
 * @returns {string|null} Normalized plan id or null.
 */
export function normalizePlanId(value) {
  if (value === "pro_monthly" || value === "pro_yearly") {
    return value;
  }
  return null;
}

/**
 * Map a Stripe price id to a plan id using the configured env bindings.
 * @param {unknown} priceId Stripe price id.
 * @param {Object} env Worker env bindings.
 * @returns {string|null} Plan id or null.
 */
export function planFromPriceId(priceId, env) {
  if (typeof priceId !== "string" || !priceId) {
    return null;
  }
  if (env && priceId === env.STRIPE_PRICE_PRO_MONTHLY) {
    return "pro_monthly";
  }
  if (env && priceId === env.STRIPE_PRICE_PRO_YEARLY) {
    return "pro_yearly";
  }
  return null;
}

/**
 * Map a recurring interval to a plan id.
 * @param {unknown} interval Stripe interval ("month" | "year").
 * @param {number} [intervalCount] Interval count (12 months counts as yearly).
 * @returns {string|null} Plan id or null.
 */
export function planFromInterval(interval, intervalCount) {
  const count = Number.isFinite(intervalCount) ? intervalCount : 1;
  if (interval === "year") {
    return "pro_yearly";
  }
  if (interval === "month") {
    return count >= 12 ? "pro_yearly" : "pro_monthly";
  }
  return null;
}

/**
 * Map a Stripe subscription status to our entitlement status.
 * @param {unknown} status Stripe subscription status.
 * @returns {string} "active" | "past_due" | "canceled".
 */
export function mapStripeStatus(status) {
  return STATUS_MAP[String(status)] || "past_due";
}

/**
 * Read an id from a field that Stripe sends either expanded or as a string.
 * @param {unknown} value Field value.
 * @returns {string|null} Id or null.
 */
function idOf(value) {
  if (typeof value === "string" && value) {
    return value;
  }
  if (value && typeof value === "object" && typeof value.id === "string") {
    return value.id;
  }
  return null;
}

/**
 * Coerce a Stripe unix timestamp to a finite number.
 * @param {unknown} value Candidate timestamp.
 * @returns {number|null} Unix seconds or null.
 */
function unixOrNull(value) {
  return Number.isFinite(value) ? Math.floor(value) : null;
}

/**
 * Pick the first subscription item of a subscription object.
 * @param {Object} subscription Stripe subscription.
 * @returns {Object|null} First item or null.
 */
function firstItem(subscription) {
  const items = subscription && subscription.items && Array.isArray(subscription.items.data)
    ? subscription.items.data
    : [];
  return items.length > 0 ? items[0] : null;
}

/**
 * Derive the plan for a Stripe subscription: price id, then metadata, then interval.
 * @param {Object} subscription Stripe subscription object.
 * @param {Object} env Worker env bindings.
 * @returns {{plan: string, planSource: string}} Plan id and how we got it.
 */
export function planForSubscription(subscription, env) {
  const item = firstItem(subscription);
  const price = item && item.price ? item.price : null;
  const byPrice = planFromPriceId(price && price.id, env);
  if (byPrice) {
    return { plan: byPrice, planSource: "price_id" };
  }
  const byMetadata = normalizePlanId(subscription && subscription.metadata && subscription.metadata.plan);
  if (byMetadata) {
    return { plan: byMetadata, planSource: "metadata" };
  }
  const recurring = price && price.recurring ? price.recurring : null;
  const byInterval = planFromInterval(
    recurring && recurring.interval,
    recurring && recurring.interval_count
  );
  if (byInterval) {
    return { plan: byInterval, planSource: "interval" };
  }
  return { plan: "pro_monthly", planSource: "default" };
}

/**
 * Period end for a subscription across old and new Stripe API shapes.
 * @param {Object} subscription Stripe subscription object.
 * @returns {number|null} Unix seconds or null.
 */
function subscriptionPeriodEnd(subscription) {
  const item = firstItem(subscription);
  return (
    unixOrNull(subscription && subscription.current_period_end) ||
    unixOrNull(item && item.current_period_end) ||
    unixOrNull(subscription && subscription.cancel_at) ||
    unixOrNull(subscription && subscription.ended_at)
  );
}

/**
 * True when a checkout session's money has actually arrived.
 * `status: "complete"` is NOT enough: with a delayed payment method (bank
 * debit, boleto, OXXO, …) `checkout.session.completed` fires while
 * `payment_status` is still "unpaid", and the funds may never arrive.
 * @param {Object} session Stripe checkout session.
 * @returns {boolean} Whether the session entitles.
 */
export function isCheckoutSessionPaid(session) {
  const status = session && session.payment_status;
  return status === "paid" || status === "no_payment_required";
}

/**
 * Map a checkout.session.* event to an entitlement update.
 * @param {Object} session Stripe checkout session.
 * @param {Object} env Worker env bindings.
 * @param {string} [statusOverride] Status to force (async payment outcomes).
 * @returns {Object} Entitlement update descriptor.
 */
function mapCheckoutSession(session, env, statusOverride) {
  const lineItem = session && session.line_items && Array.isArray(session.line_items.data)
    ? session.line_items.data[0]
    : null;
  const byPrice = planFromPriceId(lineItem && lineItem.price && lineItem.price.id, env);
  const byMetadata = normalizePlanId(session && session.metadata && session.metadata.plan);
  const plan = byPrice || byMetadata || "pro_monthly";
  const planSource = byPrice ? "price_id" : (byMetadata ? "metadata" : "default");
  const status = statusOverride || (isCheckoutSessionPaid(session) ? "active" : "pending");
  return {
    provider: "stripe",
    claimId: idOf(session && session.id),
    subscriptionId: idOf(session && session.subscription),
    customerId: idOf(session && session.customer),
    plan,
    planSource,
    status,
    // A checkout session carries no period end; leave whatever the
    // subscription events recorded untouched.
    periodEnd: undefined
  };
}

/**
 * Map a customer.subscription.* event to an entitlement update.
 * @param {Object} subscription Stripe subscription.
 * @param {Object} env Worker env bindings.
 * @param {boolean} deleted Whether this is the deleted event.
 * @returns {Object} Entitlement update descriptor.
 */
function mapSubscription(subscription, env, deleted) {
  const { plan, planSource } = planForSubscription(subscription, env);
  return {
    provider: "stripe",
    claimId: null,
    subscriptionId: idOf(subscription && subscription.id),
    customerId: idOf(subscription && subscription.customer),
    plan,
    planSource,
    status: deleted ? "canceled" : mapStripeStatus(subscription && subscription.status),
    periodEnd: subscriptionPeriodEnd(subscription)
  };
}

/**
 * Map an invoice.paid / invoice.payment_failed event to an entitlement update.
 * @param {Object} invoice Stripe invoice.
 * @param {Object} env Worker env bindings.
 * @param {boolean} paid Whether the invoice was paid.
 * @returns {Object} Entitlement update descriptor.
 */
function mapInvoice(invoice, env, paid) {
  const line = invoice && invoice.lines && Array.isArray(invoice.lines.data) ? invoice.lines.data[0] : null;
  const priceId = idOf(line && line.price)
    || idOf(line && line.pricing && line.pricing.price_details && line.pricing.price_details.price);
  const byPrice = planFromPriceId(priceId, env);
  const subscriptionId = idOf(invoice && invoice.subscription)
    || idOf(line && line.subscription)
    || idOf(
      invoice && invoice.parent && invoice.parent.subscription_details
        && invoice.parent.subscription_details.subscription
    );
  return {
    provider: "stripe",
    claimId: null,
    subscriptionId,
    customerId: idOf(invoice && invoice.customer),
    plan: byPrice || undefined,
    planSource: byPrice ? "price_id" : undefined,
    status: paid ? "active" : "past_due",
    periodEnd: unixOrNull(line && line.period && line.period.end)
  };
}

/**
 * Map a verified Stripe event onto an entitlement update descriptor.
 *
 * The descriptor carries `occurredAt` (the event's own `created` timestamp) so
 * the store can refuse to apply state that is older than what it already has.
 *
 * Returns `handled: false` (with a safe reason) for event types we subscribe to
 * but cannot key onto a license; the caller still answers 200 so Stripe stops
 * retrying.
 *
 * @param {Object} event Parsed Stripe event.
 * @param {Object} env Worker env bindings.
 * @returns {{handled: boolean, reason?: string, update?: Object}} Mapping result.
 */
export function mapStripeEvent(event, env) {
  if (!event || typeof event !== "object" || typeof event.type !== "string") {
    return { handled: false, reason: "malformed_event" };
  }
  const object = event.data && event.data.object ? event.data.object : null;
  if (!object) {
    return { handled: false, reason: "missing_object" };
  }
  let update = null;
  switch (event.type) {
    case "checkout.session.completed":
      update = mapCheckoutSession(object, env);
      break;
    case "checkout.session.async_payment_succeeded":
      update = mapCheckoutSession(object, env, "active");
      break;
    case "checkout.session.async_payment_failed":
      // The money never arrived: the record stays on file (so /v1/claim can
      // explain itself) but never entitles.
      update = mapCheckoutSession(object, env, "canceled");
      break;
    case "customer.subscription.created":
    case "customer.subscription.updated":
      update = mapSubscription(object, env, false);
      break;
    case "customer.subscription.deleted":
      update = mapSubscription(object, env, true);
      break;
    case "invoice.paid":
      update = mapInvoice(object, env, true);
      break;
    case "invoice.payment_failed":
      update = mapInvoice(object, env, false);
      break;
    default:
      return { handled: false, reason: "unhandled_event_type" };
  }
  if (!update.subscriptionId && !update.claimId) {
    return { handled: false, reason: "no_license_identity" };
  }
  // When the event was emitted, so a delayed or retried delivery cannot undo a
  // newer one. Stripe guarantees neither ordering nor exactly-once delivery.
  update.occurredAt = unixOrNull(event.created);
  return { handled: true, update };
}
