/**
 * Creem webhook support: signature verification and event -> entitlement mapping.
 *
 * Creem is a merchant of record: it sells to the customer in its own name,
 * handles the tax, and pays us. That is why it is the international rail here
 * and Stripe is not. A Peru-registered seller cannot be a Stripe merchant
 * (checked against stripe.com/global on 2026-11-03: Peru is not a supported
 * country), and a merchant of record needs no company in the customer's
 * country. Mercado Pago stays the Peruvian and Latin American rail, where it
 * takes the local methods Creem does not.
 *
 * No npm package: the signature check below is the documented scheme from
 * docs.creem.io implemented with WebCrypto HMAC-SHA256, and every field name
 * was read off docs.creem.io/code/webhooks on 2026-11-03 rather than
 * remembered, because each one decides whether somebody keeps what they paid
 * for.
 *
 * Everything here is a pure function over (rawBody, headers, env) so the test
 * suite can exercise it without a Workers runtime, as with stripe.js.
 *
 * Three things differ from Stripe enough to be worth stating:
 *
 * - **The signature carries no timestamp.** It is the HMAC-SHA256 of the raw
 *   body with the webhook secret, hex, in `creem-signature`, and nothing else.
 *   There is no replay window to enforce, so a captured body stays valid for
 *   ever and the `event:` marker is the whole of the replay defence. What
 *   makes that enough is that nothing here lengthens a period from *now*:
 *   every instant an update carries is read out of the body, so a replay sets
 *   the same period it set the first time, however long afterwards it arrives.
 *   The marker lives 30 days; a replay after that is not a way to buy time.
 *
 * - **A dispute carries no status and no reason.** Stripe's does, and treating
 *   every one of them as a chargeback took Pro from people whose money was
 *   never reversed (QA round 5, D3). Creem sends `dispute.created` with an
 *   amount, a transaction whose status is "chargeback", and no status of its
 *   own: there is no inquiry to tell apart, so there is no status check here.
 *   Inventing one would be inventing a field.
 *
 * - **Two time formats in one payload.** The envelope's `created_at`, and a
 *   refund's and a dispute's own `created_at`, are epoch milliseconds. A
 *   subscription's `current_period_start_date`, `current_period_end_date`,
 *   `last_transaction_date` and `canceled_at` are ISO 8601 strings. Reading
 *   either as the other is a thousand-fold error in a date that decides access,
 *   so the two are parsed by separate functions and `epochSeconds` refuses a
 *   number that is not plausibly a date in either unit.
 */

"use strict";

import { hmacSha256Hex, timingSafeEqual } from "./license.js";

/** The header Creem puts its signature in. */
export const CREEM_SIGNATURE_HEADER = "creem-signature";

/**
 * Event types this worker acts on. Anything else is acknowledged and ignored.
 *
 * `subscription.active` is deliberately not treated as money arriving: Creem's
 * own documentation says to use it for synchronization and `subscription.paid`
 * for activating access, and a status and a period end are all it is read for.
 */
export const HANDLED_CREEM_EVENT_TYPES = [
  "checkout.completed",
  "subscription.active",
  "subscription.paid",
  "subscription.trialing",
  "subscription.update",
  "subscription.paused",
  "subscription.canceled",
  "subscription.expired",
  "refund.created",
  "dispute.created"
];

/**
 * Creem subscription status -> our entitlement status. A status Creem adds
 * later is "suspended": it never entitles until we know what it means.
 *
 * `scheduled_cancel` is a subscription that will not renew and has not ended:
 * the customer paid for the period they are in and keeps it, which is what
 * "active" means here.
 */
const STATUS_MAP = {
  active: "active",
  trialing: "active",
  scheduled_cancel: "active",
  past_due: "past_due",
  // Nothing is being charged and nothing is being retried. Revoke, as with
  // Stripe's "unpaid" and "paused"; a payment brings it back.
  unpaid: "suspended",
  paused: "suspended",
  canceled: "canceled",
  expired: "canceled"
};

/**
 * Verify a Creem webhook signature against the raw request body.
 *
 * The body must be the exact bytes Creem sent (request.text()), never
 * re-serialized JSON: a reordered key or a changed space is a different
 * message and will not match.
 *
 * @param {{rawBody: string, header: string, secret: string}} input Verification input.
 * @returns {Promise<{ok: boolean, reason?: string}>} Result; `reason` is a safe, secret-free code.
 */
export async function verifyCreemSignature(input) {
  const { rawBody, header, secret } = input;
  if (typeof secret !== "string" || secret.length === 0) {
    return { ok: false, reason: "secret_not_configured" };
  }
  if (typeof rawBody !== "string") {
    return { ok: false, reason: "missing_body" };
  }
  const candidate = typeof header === "string" ? header.trim().toLowerCase() : "";
  if (!candidate) {
    return { ok: false, reason: "missing_signature" };
  }
  const expected = await hmacSha256Hex(secret, rawBody);
  return timingSafeEqual(expected, candidate)
    ? { ok: true }
    : { ok: false, reason: "signature_mismatch" };
}

/**
 * Read an id from a field Creem sends either expanded or as a string.
 * `checkout.completed` nests the whole subscription; `subscription.paid` sends
 * the same field as an id.
 * @param {unknown} value Field value.
 * @returns {string|null} Id or null.
 */
function idOf(value) {
  if (typeof value === "string" && value) {
    return value;
  }
  if (value && typeof value === "object" && typeof value.id === "string" && value.id) {
    return value.id;
  }
  return null;
}

/**
 * Seconds from a numeric Creem timestamp, in either unit it sends.
 *
 * Milliseconds is what the documented payloads carry, and milliseconds read as
 * seconds would put a 2026 event in the year 56000 — a period end nothing
 * would ever end. Seconds read as milliseconds would put it in 1970 and end
 * access at once. Neither is a mistake worth leaving to a field name, so the
 * magnitude decides: from 1e11 up it can only be milliseconds (seconds that
 * large is the year 5138), and below it can only be seconds (milliseconds that
 * small is 1973). Anything outside both ranges is no date at all.
 * @param {unknown} value Candidate timestamp.
 * @returns {number|null} Unix seconds or null.
 */
export function epochSeconds(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) {
    return null;
  }
  if (n >= 1e11) {
    return Math.floor(n / 1000);
  }
  return n >= 1e9 ? Math.floor(n) : null;
}

/**
 * Seconds from an ISO 8601 date string, which is what every date on a Creem
 * subscription is.
 * @param {unknown} value Candidate date string.
 * @returns {number|null} Unix seconds or null.
 */
export function isoSeconds(value) {
  if (typeof value !== "string" || !value) {
    return null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : null;
}

/**
 * Accept only plan ids this worker issues.
 * @param {unknown} value Candidate plan id.
 * @returns {string|null} Normalized plan id or null.
 */
function normalizePlanId(value) {
  return value === "pro_monthly" || value === "pro_yearly" ? value : null;
}

/**
 * Map a Creem product id to a plan id using the configured env bindings.
 * @param {unknown} productId Creem product id.
 * @param {Object} env Worker env bindings.
 * @returns {string|null} Plan id or null.
 */
export function planFromProductId(productId, env) {
  if (typeof productId !== "string" || !productId) {
    return null;
  }
  if (env && productId === env.CREEM_PRODUCT_PRO_MONTHLY) {
    return "pro_monthly";
  }
  if (env && productId === env.CREEM_PRODUCT_PRO_YEARLY) {
    return "pro_yearly";
  }
  return null;
}

/**
 * Whether the operator has written down which Creem products are theirs.
 *
 * The same rule as the Stripe price table: where these are filled in they are
 * an allow-list as well as a label, so a donation or a one-off lesson sold
 * from the same Creem account cannot entitle; where they are empty — which is
 * how the repository ships — a product says only what it says.
 * @param {Object} env Worker env bindings.
 * @returns {boolean} Whether at least one product id is configured.
 */
export function creemProductTableConfigured(env) {
  const read = (key) => (env && typeof env[key] === "string" ? env[key].trim() : "");
  return Boolean(read("CREEM_PRODUCT_PRO_MONTHLY") || read("CREEM_PRODUCT_PRO_YEARLY"));
}

/**
 * What a product id is, as far as this worker is concerned.
 * @param {unknown} productId Creem product id.
 * @param {Object} env Worker env bindings.
 * @returns {"ours"|"unlisted"|"no_table"} Verdict.
 */
export function productVerdict(productId, env) {
  if (planFromProductId(productId, env)) {
    return "ours";
  }
  if (typeof productId !== "string" || !productId || !creemProductTableConfigured(env)) {
    return "no_table";
  }
  return "unlisted";
}

/**
 * Map a Creem billing period to a plan id.
 *
 * Creem writes these as "every-month", "every-year", "every-3-months". A
 * period this does not recognise, and a multi-month one, read as monthly: the
 * plan is only used to bound a period when the subscription's own
 * `current_period_end_date` is missing, and a month is the short, safe
 * direction to be wrong in.
 * @param {unknown} period Creem `billing_period`.
 * @returns {string|null} Plan id or null.
 */
export function planFromBillingPeriod(period) {
  const value = String(period === undefined || period === null ? "" : period).toLowerCase();
  if (!value) {
    return null;
  }
  if (value.includes("year") || value.includes("annual")) {
    return "pro_yearly";
  }
  return value.includes("month") || value.includes("day") || value.includes("week")
    ? "pro_monthly"
    : null;
}

/**
 * Derive the plan for a Creem product: product id, then metadata, then the
 * product's own billing period.
 * @param {Object} product Creem product object (or its id).
 * @param {Object} metadata The subscription's or checkout's metadata.
 * @param {Object} env Worker env bindings.
 * @returns {{plan: string|undefined, planSource: string, unlisted?: boolean}} Plan and how we got it.
 */
export function planForProduct(product, metadata, env) {
  const productId = idOf(product);
  const byProduct = planFromProductId(productId, env);
  if (byProduct) {
    return { plan: byProduct, planSource: "product_id" };
  }
  const byMetadata = normalizePlanId(metadata && metadata.plan);
  if (byMetadata) {
    // Metadata outranks the allow-list below for the same reason it does on
    // Stripe: it is set by the account's owner and nobody else, and it is the
    // one remedy that needs no redeploy.
    return { plan: byMetadata, planSource: "metadata" };
  }
  if (productVerdict(productId, env) === "unlisted") {
    // Not ours. The plan stays unnamed and the caller suspends the record,
    // rather than turning somebody else's purchase into Pro.
    return { plan: undefined, planSource: "unlisted_product", unlisted: true };
  }
  const byPeriod = planFromBillingPeriod(product && product.billing_period);
  if (byPeriod) {
    return { plan: byPeriod, planSource: "billing_period" };
  }
  return { plan: "pro_monthly", planSource: "default" };
}

/**
 * Map a Creem subscription status to our entitlement status.
 * @param {unknown} status Creem subscription status.
 * @returns {string} "active" | "past_due" | "suspended" | "canceled".
 */
export function mapCreemStatus(status) {
  return STATUS_MAP[String(status)] || "suspended";
}

/**
 * The period end a Creem subscription names, in seconds.
 * @param {Object} subscription Creem subscription object.
 * @returns {number|null} Unix seconds or null.
 */
function subscriptionPeriodEnd(subscription) {
  // `current_period_end_date` and nothing else. `canceled_at` is when the
  // customer or the merchant cancelled: Creem's API reference describes it as
  // "The date and time when the subscription was canceled, if applicable" and
  // marks it nullable, while `current_period_end_date` is merely optional and
  // `scheduled_cancel` is a documented status (read 3 November 2026). So for a
  // subscription that will not renew, the cancel date is the click and is
  // always in the past, and reading it as a period end replaced the end of a
  // month that had been paid for with the moment somebody changed their mind.
  // An absent period end is no statement, not a guess.
  //
  // Measured honesty: with `periodEndIsFloor` now true for every subscription
  // event (see below), restoring this fallback changes no outcome that can be
  // constructed — a cancel date is always at or before the period the record
  // already holds, so the floor discards it, and no mutant of this line dies.
  // It is removed because it is the wrong reading of the field, and because the
  // floor above it is a judgement that may be revisited, at which point this
  // line would be load-bearing and wrong again.
  return isoSeconds(subscription && subscription.current_period_end_date) || null;
}

/**
 * The transaction id a Creem object names, which is this rail's payment
 * identity: money going back names the same `tran_...` the money arriving
 * did, so a refund can say whether it is the payment that bought the period
 * the license is in without working it out from dates.
 * @param {Object} object The event's object.
 * @returns {string|null} Transaction id or null.
 */
function transactionIdOf(object) {
  return (
    idOf(object && object.last_transaction_id) ||
    idOf(object && object.last_transaction) ||
    idOf(object && object.transaction) ||
    idOf(object && object.order && object.order.transaction) ||
    null
  );
}

/**
 * Map `checkout.completed` onto an entitlement update.
 *
 * The checkout's own id is the claim id: Creem sends the browser back to the
 * site with `checkout_id` in the query, and that is what /v1/claim is asked
 * with. The subscription arrives nested here and as a bare id later, so both
 * shapes are read through `idOf`.
 * @param {Object} checkout Creem checkout object.
 * @param {Object} env Worker env bindings.
 * @returns {Object} Entitlement update descriptor.
 */
function mapCheckout(checkout, env) {
  const subscription = checkout && checkout.subscription;
  const metadata = (checkout && checkout.metadata)
    || (subscription && typeof subscription === "object" && subscription.metadata)
    || null;
  const { plan, planSource, unlisted } = planForProduct(checkout && checkout.product, metadata, env);
  // Creem sends this event when the checkout is finished and the order is
  // paid; an unfinished one is not sent at all. The order's own status is
  // still checked, because a status this worker does not recognise must not
  // read as money having arrived.
  const orderStatus = String((checkout && checkout.order && checkout.order.status) || "");
  const paid = String((checkout && checkout.status) || "") === "completed"
    && (orderStatus === "" || orderStatus === "paid");
  return {
    provider: "creem",
    claimId: idOf(checkout && checkout.id),
    subscriptionId: idOf(subscription),
    customerId: idOf(checkout && checkout.customer),
    plan,
    planSource,
    status: unlisted ? "suspended" : (paid ? "active" : "pending"),
    paid: paid && !unlisted ? true : undefined,
    // The transaction behind this checkout, so money going back can find the
    // access it bought. A one-time pass has no later event at all, so this is
    // the only name its refund will ever have to match.
    paymentId: paid && !unlisted ? transactionIdOf(checkout) : null,
    // A nested subscription may already carry its period; when it does not,
    // `periodEndFromCharge` below bounds this to one plan interval from the
    // checkout, so a subscription whose own events never arrive sells a month
    // rather than a lifetime.
    periodEnd: subscriptionPeriodEnd(subscription && typeof subscription === "object" ? subscription : null)
  };
}

/**
 * Map a `subscription.*` event onto an entitlement update.
 *
 * `paid` is set only by `subscription.paid`, which is the event Creem's own
 * documentation says to activate access on. The others carry a status and a
 * period and say nothing about money.
 *
 * The period a paid event names is a floor, never a ceiling, for the same
 * reason a Stripe invoice's is: it reports a period that WAS paid for rather
 * than the subscription's current state, so applying it out of order can only
 * ever lengthen access. Dropping it as stale is what lost a customer a month
 * they had paid for on the Stripe side (QA round 5, D2) — a refund capped the
 * period, and the renewal that should have carried it past the refund arrived
 * stamped a second earlier and was discarded.
 * @param {Object} subscription Creem subscription object.
 * @param {Object} env Worker env bindings.
 * @param {string} eventType The event's type.
 * @returns {Object} Entitlement update descriptor.
 */
function mapSubscription(subscription, env, eventType) {
  const paid = eventType === "subscription.paid";
  const expired = eventType === "subscription.expired";
  const canceled = eventType === "subscription.canceled";
  const metadata = (subscription && subscription.metadata) || null;
  const item = subscription && Array.isArray(subscription.items) ? subscription.items[0] : null;
  const { plan, planSource, unlisted } = planForProduct(
    (subscription && subscription.product) || (item && item.product_id),
    metadata,
    env
  );
  const endedAt = isoSeconds(subscription && subscription.canceled_at);
  const status = expired || canceled ? "canceled" : mapCreemStatus(subscription && subscription.status);
  return {
    provider: "creem",
    claimId: null,
    subscriptionId: idOf(subscription && subscription.id),
    customerId: idOf(subscription && subscription.customer),
    plan,
    planSource,
    status: unlisted && status !== "canceled" ? "suspended" : status,
    paid: paid && !unlisted ? true : undefined,
    paymentId: paid && !unlisted ? transactionIdOf(subscription) : null,
    periodEnd: subscriptionPeriodEnd(subscription),
    // On this rail a subscription event's period can only ever LENGTHEN access,
    // paid or not. That is a change of policy, made on 2026-11-03, and the
    // reasoning is worth keeping because it is a judgement rather than a fact.
    //
    // It used to be only `subscription.paid` that was a floor, on the ground
    // that a state event is the subscription's own current answer and a
    // downward correction should be applied. The trouble is that no Creem event
    // can be shown to make one. A plan change produces a NEW period end, which
    // is later, not earlier. Ending a subscription early is `canceled`,
    // `expired` or `scheduled_cancel` with a `canceled_at`, none of which needs
    // `current_period_end_date` to move backwards. What demonstrably does
    // produce an earlier end is a snapshot serialised before the period rolled
    // over, which is the same documented silence that let a paid renewal buy
    // nothing (VG-53): the docs do not say what a renewal's period dates hold.
    //
    // So the two readings are both guesses, and the tie-break is the direction
    // of the error. Treating the answer as current risks locking a paying
    // subscriber out of a month they paid for. Treating it as a floor risks
    // leaving a provider-side downward correction unapplied for at most one
    // period, after which a cancellation, an expiry or a refund ends access
    // through its own path, none of which reads this field. Everywhere else in
    // this worker the same tie-break goes the same way.
    periodEndIsFloor: true,
    endedAt: status === "canceled" ? endedAt : undefined,
    // Creem does not bring an expired subscription back: a new purchase is a
    // new subscription with a new id. A cancellation is not terminal, because
    // the expiry that follows it still has something to say.
    terminal: expired
  };
}

/**
 * Whether a Creem refund put back everything the customer paid.
 *
 * Three signals, each sufficient on its own, because each one alone has been
 * seen to miss money that had in fact gone back:
 *
 * 1. The transaction's own status. `refunded` against `partialRefund` is
 *    Creem's verdict, and it is the only signal that sees a refund quoted net
 *    of a tax the customer paid: the docs' own example pays 1210 for a 1000
 *    product, so a 1000 refund of one looks partial by every amount rule and
 *    is not. (The documented statuses are pending, paid, refunded,
 *    partialRefund, chargedBack, uncollectible, declined, canceled, void.)
 * 2. The transaction's cumulative `refunded_amount` — "the amount that has
 *    been refunded", a property of the transaction and not of this refund —
 *    which is the only signal that sees money returned in two halves.
 * 3. This refund's own `refund_amount` against what was paid, which is what
 *    this function had at first and is still right for the ordinary case of
 *    one refund for the whole charge.
 *
 * A genuine partial refund trips none of the three, so the direction of being
 * wrong is unchanged: a goodwill gesture does not end a month somebody paid
 * for. What the three cost together is a refund of everything whose
 * transaction reports no status and no cumulative total and quotes less than
 * `amount_paid`; that reads as partial, which is the safe way round.
 * @param {Object} refund Creem refund object (the `object` of a refund.created).
 * @returns {boolean} Whether all of the money went back.
 */
export function isFullCreemRefund(refund) {
  const transaction = (refund && refund.transaction) || null;
  if (transaction && transaction.status === "refunded") {
    return true;
  }
  const paid = Number(
    transaction && transaction.amount_paid !== undefined && transaction.amount_paid !== null
      ? transaction.amount_paid
      : transaction && transaction.amount
  );
  if (!Number.isFinite(paid) || paid <= 0) {
    return false;
  }
  const cumulative = Number(transaction && transaction.refunded_amount);
  if (Number.isFinite(cumulative) && cumulative >= paid) {
    return true;
  }
  const back = Number(refund && refund.refund_amount);
  return Number.isFinite(back) && back >= paid;
}

/**
 * Map a refund or a dispute onto an entitlement update.
 *
 * Both name the transaction whose money went back, which is the whole of what
 * the store needs: the same id means the money for *this* period went back,
 * and a different id means an earlier period's did and this one stands.
 * `reverseLatestCharge` is the fallback for a record that never recorded a
 * transaction id, and never mints anything — `requireExisting` is what keeps
 * money going back from creating a license.
 * @param {Object} object Creem refund or dispute object.
 * @returns {Object} Entitlement update descriptor.
 */
function mapReversal(object) {
  return {
    provider: "creem",
    claimId: null,
    // So the reversal can still be matched to a license that only ever heard
    // of its subscription. It writes no entitlement of its own: with
    // `requireExisting` an unknown subscription is a miss, not a new license.
    subscriptionId: idOf(object && object.subscription),
    customerId: idOf(object && object.customer),
    paymentId: transactionIdOf(object),
    requireExisting: true,
    isReversal: true,
    reverseLatestCharge: true
  };
}

/**
 * Creem's own names for an environment that is not production. Its API
 * documentation gives `mode` as test, prod or sandbox; its webhook examples
 * also show `local`. Only the three that are certainly not production are
 * listed, so an unrecognised value — a live one Creem renames, or one it adds
 * — still entitles. Refusing an unknown mode would mean a renamed production
 * value silently stops every real sale, which is a worse way to be wrong than
 * honouring a mode we have not heard of.
 */
const NON_PRODUCTION_MODES = new Set(["test", "sandbox", "local"]);

/**
 * Whether an event from this environment may change an entitlement.
 *
 * A Creem test-mode purchase moves no money. If a test event can reach the
 * live endpoint with a valid signature, honouring it hands out the paid tier
 * for nothing, so by default it does not. `CREEM_ALLOW_TEST_MODE = "true"`
 * lets it through, which is what you want while proving the rail works and is
 * the one setting to put back before the first real sale.
 * @param {Object} object The event's own object.
 * @param {Object} env Worker env bindings.
 * @returns {boolean} Whether the event may entitle.
 */
export function creemModeAllowed(object, env) {
  const mode = typeof (object && object.mode) === "string" ? object.mode.trim().toLowerCase() : "";
  if (!NON_PRODUCTION_MODES.has(mode)) {
    return true;
  }
  return String((env && env.CREEM_ALLOW_TEST_MODE) || "").trim().toLowerCase() === "true";
}

/**
 * Map a verified Creem event onto an entitlement update descriptor.
 *
 * Returns `handled: false` with a safe reason for an event we subscribe to but
 * cannot key onto a license; the caller still answers 200 so Creem stops
 * retrying.
 * @param {Object} event Parsed Creem event.
 * @param {Object} env Worker env bindings.
 * @returns {{handled: boolean, reason?: string, update?: Object}} Mapping result.
 */
export function mapCreemEvent(event, env) {
  if (!event || typeof event !== "object" || typeof event.eventType !== "string") {
    return { handled: false, reason: "malformed_event" };
  }
  const object = event.object && typeof event.object === "object" ? event.object : null;
  if (!object) {
    return { handled: false, reason: "missing_object" };
  }
  if (!creemModeAllowed(object, env)) {
    return { handled: false, reason: "test_mode" };
  }
  let update = null;
  switch (event.eventType) {
    case "checkout.completed":
      update = mapCheckout(object, env);
      break;
    case "subscription.active":
    case "subscription.paid":
    case "subscription.trialing":
    case "subscription.update":
    case "subscription.paused":
    case "subscription.canceled":
    case "subscription.expired":
      update = mapSubscription(object, env, event.eventType);
      break;
    case "refund.created":
      if (!isFullCreemRefund(object)) {
        return { handled: false, reason: "partial_refund" };
      }
      update = mapReversal(object);
      break;
    case "dispute.created":
      update = mapReversal(object);
      break;
    default:
      return { handled: false, reason: "unhandled_event_type" };
  }
  if (!update.subscriptionId && !update.claimId && !update.paymentId) {
    return { handled: false, reason: "no_license_identity" };
  }
  // When the event was emitted, so a retried or delayed delivery cannot undo a
  // newer one. Creem guarantees neither ordering nor exactly-once delivery: it
  // makes five attempts over 24 hours and a manual resend gets a new id.
  update.occurredAt = epochSeconds(event.created_at);
  if (update.isReversal) {
    update.reversedAt = update.occurredAt ?? epochSeconds(object.created_at);
  }
  if (update.status === "canceled" && !Number.isFinite(update.endedAt)) {
    update.endedAt = update.occurredAt;
  }
  // Money arriving buys one plan interval from the moment it arrived. A floor,
  // never a ceiling: it only ever lengthens a period, and the subscription's
  // own period end replaces it. It is also what records when the latest charge
  // went through, which is what a reversal naming no transaction falls back to.
  //
  // The case it closes is a webhook endpoint that hears `checkout.completed`
  // and nothing else — a secret rotated between events, a subscription event
  // dropped — which before the same bound on the Stripe side sold one month
  // and gave Pro for life (QA round 4, QA-W-05).
  if (update.paid === true) {
    update.periodEndFromCharge = isoSeconds(object.last_transaction_date)
      ?? update.occurredAt
      ?? epochSeconds(object.created_at);
  }
  return { handled: true, update };
}
