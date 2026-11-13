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
  "invoice.payment_failed",
  // Money going back. Mercado Pago has always ended the access its refunds
  // paid for; these are the Stripe side of the same rule.
  "charge.refunded",
  "charge.dispute.created",
  "charge.dispute.updated",
  "charge.dispute.closed",
  "charge.dispute.funds_withdrawn"
];

/**
 * Dispute statuses that mean a formal chargeback: the money is on its way out
 * of our balance, or already gone.
 *
 * The ones that are NOT here are the point. `warning_needs_response`,
 * `warning_under_review` and `warning_closed` are **inquiries** — the issuer
 * asking about a charge, which Stripe's own enum describes as "an inquiry
 * closed without becoming a formal dispute". No money moves, most never become
 * a chargeback, and the cardholder often does not know one was raised. Ending
 * a subscriber's access on one takes Pro away from somebody who paid and whose
 * payment was never reversed (QA round 5 re-attack, D1). `prevented` is a
 * dispute stopped before becoming a chargeback, and `won` is one resolved in
 * our favour; neither leaves us short.
 *
 * Checked against Stripe's Dispute object documentation on 2026-11-03 rather
 * than from memory, because this list decides whether a paying customer keeps
 * what they bought.
 */
const CHARGEBACK_STATUSES = new Set([
  "needs_response",
  "under_review",
  "appeal_needs_response",
  "appeal_under_review",
  "lost"
]);

/** Stripe subscription status -> our entitlement status. */
const STATUS_MAP = {
  active: "active",
  trialing: "active",
  past_due: "past_due",
  // "unpaid" means Stripe has stopped retrying, and "paused" that nothing is
  // being charged. Stripe says to revoke access for both, and an unpaid
  // subscription's period keeps rolling forward, so the "past_due" grace would
  // never end. "suspended" never entitles until a payment brings it back.
  unpaid: "suspended",
  // "incomplete" is a subscription whose FIRST payment never succeeded: the
  // same "money has not arrived" case as an unpaid checkout session, so it must
  // not fall into the entitling "past_due" grace state.
  incomplete: "pending",
  canceled: "canceled",
  incomplete_expired: "canceled",
  paused: "suspended"
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
 * Whether the operator has written down which Stripe prices are theirs.
 *
 * `STRIPE_PRICE_PRO_MONTHLY` / `_YEARLY` started as labels: a way to know
 * whether a subscription was monthly or yearly. They are also the only
 * statement anywhere of what this product actually sells, so where they are
 * filled in they are read as an allow-list too. Where they are empty — which
 * is how the repository ships — nothing changes and a price says only what it
 * says.
 * @param {Object} env Worker env bindings.
 * @returns {boolean} Whether at least one price id is configured.
 */
export function stripePriceTableConfigured(env) {
  const read = (key) => (env && typeof env[key] === "string" ? env[key].trim() : "");
  return Boolean(read("STRIPE_PRICE_PRO_MONTHLY") || read("STRIPE_PRICE_PRO_YEARLY"));
}

/**
 * What a price id is, as far as this worker is concerned.
 *
 * Anything else sold from the same Stripe account — a donation, a one-off
 * lesson, a different product — arrives through the same webhook and used to
 * entitle, because the price table was a label table and never a gate
 * (QA round 4, QA-W-03).
 * @param {unknown} priceId Stripe price id.
 * @param {Object} env Worker env bindings.
 * @returns {"ours"|"unlisted"|"no_table"} Verdict.
 */
export function priceVerdict(priceId, env) {
  if (planFromPriceId(priceId, env)) {
    return "ours";
  }
  if (typeof priceId !== "string" || !priceId || !stripePriceTableConfigured(env)) {
    return "no_table";
  }
  return "unlisted";
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
 * Map a Stripe subscription status to our entitlement status. A status Stripe
 * adds later is "suspended": it never entitles until we know what it means.
 * @param {unknown} status Stripe subscription status.
 * @returns {string} "active" | "past_due" | "pending" | "suspended" | "canceled".
 */
export function mapStripeStatus(status) {
  return STATUS_MAP[String(status)] || "suspended";
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
    // Metadata outranks the allow-list below on purpose: it is set by the
    // account's owner and nobody else, so it is the same kind of statement as
    // the price table, and it is the one remedy that needs no redeploy. Editing
    // a subscription's metadata in the Stripe dashboard emits
    // customer.subscription.updated, so the fix lands at once.
    return { plan: byMetadata, planSource: "metadata" };
  }
  if (priceVerdict(price && price.id, env) === "unlisted") {
    // Not ours. The plan stays unnamed and the caller suspends the record: an
    // interval or a default would turn somebody else's subscription into Pro.
    return { plan: undefined, planSource: `unlisted_price`, unlisted: true };
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
  const byPrice = planFromPriceId(checkoutPriceId(session), env);
  const byMetadata = normalizePlanId(session && session.metadata && session.metadata.plan);
  const subscriptionId = idOf(session && session.subscription);
  const { plan, planSource } = checkoutPlan(byPrice, byMetadata, subscriptionId);
  const status = checkoutStatus(session, subscriptionId, statusOverride);
  return {
    provider: "stripe",
    claimId: idOf(session && session.id),
    subscriptionId,
    customerId: idOf(session && session.customer),
    plan,
    planSource,
    status,
    // Whether the money for this checkout arrived. The store keeps an unpaid
    // license from entitling until a payment is confirmed, whatever the
    // subscription's own events say in the meantime.
    paid: status === "active",
    // The payment behind this checkout, so money going back can find the
    // access it bought: a refunded charge and a dispute name their payment
    // intent and nothing else this worker knows. A subscription's checkout
    // carries none (its money is on an invoice), so this is how a one-time
    // pass — the case a refund leaves entitled for up to a year — is matched.
    paymentId: idOf(session && session.payment_intent),
    // A checkout session carries no period end; leave whatever the
    // subscription events recorded untouched.
    periodEnd: undefined
  };
}

/** The price id of a checkout session's first line item, when the session carries its line items. */
function checkoutPriceId(session) {
  const lineItem = session && session.line_items && Array.isArray(session.line_items.data)
    ? session.line_items.data[0]
    : null;
  return lineItem && lineItem.price && lineItem.price.id;
}

/** The plan a checkout names and how: its price, then its metadata, then a month for a one-time payment only. */
function checkoutPlan(byPrice, byMetadata, subscriptionId) {
  // A subscription's checkout that names no plan says nothing about it: the
  // subscription's own events carry its price and interval, and a default
  // here, applied after them, would turn a yearly subscriber monthly. Only a
  // one-time payment, with nothing else to go by, falls back to a month.
  const named = byPrice || byMetadata;
  const plan = named || (subscriptionId ? undefined : "pro_monthly");
  const planSource = byPrice ? "price_id" : (byMetadata ? "metadata" : (subscriptionId ? undefined : "default"));
  return { plan, planSource };
}

/** A checkout's status: the async outcome if given, else whether its money arrived; a setup session never entitles. */
function checkoutStatus(session, subscriptionId, statusOverride) {
  const status = statusOverride || (isCheckoutSessionPaid(session) ? "active" : "pending");
  // Only a subscription or a one-time payment is a purchase. A setup session
  // saves a card for later and charges nothing, though Stripe reports it as
  // needing no payment, so it entitles to nothing.
  if (status === "active" && !subscriptionId && !(session && session.mode === "payment")) {
    return "canceled";
  }
  return status;
}

/**
 * The payment intent behind an invoice, in whichever shape the account's API
 * version sends.
 *
 * Stripe's 2025 "basil" version removed `invoice.payment_intent` and put the
 * payments on `invoice.payments` instead — which a webhook does NOT carry,
 * because that field is only returned when it is expanded, and a webhook
 * expands nothing. So on a current API version a renewal's charge cannot be
 * matched to its subscription from the webhook alone, and a refund of one is
 * not handled: the operator cancels the subscription in Stripe, which does end
 * access, or revokes by hand. Both shapes are read anyway, because an account
 * on an older version still sends the first, and reading a field that is not
 * there costs nothing.
 * @param {Object} invoice Stripe invoice.
 * @returns {string|null} Payment intent id or null.
 */
function paymentIdForInvoice(invoice) {
  const direct = idOf(invoice && invoice.payment_intent);
  if (direct) {
    return direct;
  }
  const payments = invoice && invoice.payments && Array.isArray(invoice.payments.data)
    ? invoice.payments.data
    : [];
  for (const entry of payments) {
    const id = idOf(entry && entry.payment && entry.payment.payment_intent);
    if (id) {
      return id;
    }
  }
  return null;
}

/**
 * Map a charge whose money went back onto an entitlement update.
 *
 * Only a charge refunded in full. A partial refund is a goodwill gesture or a
 * proration, not the end of what was bought, and taking access away for one
 * would punish the customer for being given something.
 *
 * The charge says exactly when it was taken, so the store can tell whether it
 * is the charge that paid for the period the license is in: the refund of an
 * earlier month leaves a later month's access alone.
 * @param {Object} charge Stripe charge.
 * @returns {Object} Entitlement update descriptor.
 */
function mapRefundedCharge(charge) {
  return {
    provider: "stripe",
    claimId: null,
    subscriptionId: null,
    paymentId: idOf(charge && charge.payment_intent),
    customerId: idOf(charge && charge.customer),
    // Never mint a license from money going back: see upsertEntitlement.
    requireExisting: true,
    isReversal: true,
    reversedChargeAt: unixOrNull(charge && charge.created)
  };
}

/**
 * Whether a charge has been refunded in full.
 * @param {Object} charge Stripe charge.
 * @returns {boolean} Whether all of the money went back.
 */
function isFullyRefunded(charge) {
  if (charge && charge.refunded === true) {
    return true;
  }
  const amount = Number(charge && charge.amount);
  const back = Number(charge && charge.amount_refunded);
  return Number.isFinite(amount) && Number.isFinite(back) && amount > 0 && back >= amount;
}

/**
 * Map a dispute onto an entitlement update.
 *
 * A dispute is money on its way back, and the card networks give it to the
 * cardholder by default unless it is contested and won. Access ends when it is
 * opened rather than when it is lost, which is also what Stripe's own guidance
 * says to do. A dispute that is later won restores nothing by itself: there is
 * no "un-refund" in this store, so the operator gifts the access back from the
 * admin page, which `docs/33-ACCOUNTS-AND-PAYMENTS.md` says.
 *
 * Unlike a refund, a dispute names its payment but not when that payment was
 * taken, so it reverses whichever charge this license last counted.
 *
 * `charge.dispute.funds_withdrawn` is self-describing and always ends access.
 * For the other three, the status decides: see `CHARGEBACK_STATUSES` for why an
 * inquiry must not.
 * @param {Object} dispute Stripe dispute.
 * @param {boolean} fundsWithdrawn Whether the event itself says the money went.
 * @returns {Object|null} Entitlement update descriptor, or null when this
 *   dispute has taken no money and must change nothing.
 */
function mapDispute(dispute, fundsWithdrawn) {
  const status = String((dispute && dispute.status) || "");
  if (!fundsWithdrawn && !CHARGEBACK_STATUSES.has(status)) {
    return null;
  }
  return {
    provider: "stripe",
    claimId: null,
    subscriptionId: null,
    paymentId: idOf(dispute && dispute.payment_intent),
    requireExisting: true,
    isReversal: true,
    reverseLatestCharge: true
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
  const { plan, planSource, unlisted } = planForSubscription(subscription, env);
  const stripeStatus = String(subscription && subscription.status);
  const endedAt = unixOrNull(subscription && subscription.ended_at);
  const reason = subscription && subscription.cancellation_details && subscription.cancellation_details.reason;
  // Stripe ended it because the money never came: the first payment expired,
  // or it gave up on a renewal or the charge was disputed. No part of the
  // current period was paid for, so its period end is not a paid-through date.
  const unpaid = stripeStatus === "incomplete_expired" || reason === "payment_failed" || reason === "payment_disputed";
  return {
    provider: "stripe",
    claimId: null,
    subscriptionId: idOf(subscription && subscription.id),
    customerId: idOf(subscription && subscription.customer),
    plan,
    planSource,
    // A subscription on a price that is not ours is suspended rather than
    // active: suspended issues no token and says a payment could still bring
    // it back, which is exactly the situation — adding the price id and
    // redeploying, or naming the plan in the subscription's metadata, makes
    // the next event entitle it.
    status: deleted
      ? "canceled"
      : (unlisted ? "suspended" : mapStripeStatus(subscription && subscription.status)),
    periodEnd: subscriptionPeriodEnd(subscription),
    endedAt,
    endsAt: unpaid && endedAt !== null ? endedAt : undefined,
    // Stripe never reactivates a deleted subscription: nothing after this may
    // change the license's state.
    terminal: deleted
  };
}

/**
 * Whether an invoice line is something other than the subscription's own
 * charge: a proration, or an invoice item (an add-on billed on the same
 * invoice). Both API shapes are read, because which one arrives follows the
 * API version the Stripe account is pinned to and that is not ours to choose:
 * before 2025-03-31 a line carried `proration` and `type: "invoiceitem"`; since
 * then the same two facts live at `parent.subscription_item_details.proration`
 * and `parent.type === "invoice_item_details"` (both verbatim from
 * docs.stripe.com/api/invoice-line-item/object, read 3 November 2026).
 *
 * The invoice-item clauses are what carry the weight: an invoice item's period
 * is arbitrary, so a year-long add-on on a monthly renewal invoice reads as a
 * year of Pro unless it is excluded (OPS5, OPS5d in own-period-end.test.mjs,
 * which is what killed that mutant). The two proration clauses are belt and
 * braces: a proration's period "ends at the period end of the subscription",
 * so a proration can never end after the subscription's own line on the same
 * invoice, and dropping either clause alone changes no documented outcome
 * because `periodLineOf` then picks the same line by period end anyway. They
 * stay because they say what the rule means, not because a test needs them.
 *
 * `parent.type` names which hash holds the details, so a line with
 * `invoice_item_details` is already excluded by the type check and reading a
 * proration flag out of that hash would be unreachable.
 * @param {Object} line Invoice line.
 * @returns {boolean} True when the line is not the subscription's own period.
 */
function isSideLine(line) {
  if (!line || typeof line !== "object") {
    return true;
  }
  const parent = line.parent && typeof line.parent === "object" ? line.parent : {};
  const subscriptionItem = parent.subscription_item_details || {};
  return line.proration === true || subscriptionItem.proration === true
    || line.type === "invoiceitem" || parent.type === "invoice_item_details";
}

/**
 * The line that says what period a paid invoice bought.
 *
 * Not `lines.data[0]`, which is what this used to read. An invoice's lines are
 * "sorted as follows: (1) pending invoice items (including prorations) in
 * reverse chronological order, (2) subscription items in reverse chronological
 * order, and (3) invoice items added after invoice creation in chronological
 * order" (docs.stripe.com/api/invoices/object, read 3 November 2026). So after
 * any plan change the renewal invoice's FIRST line is a proration for the
 * period that just closed, and reading it took a month from somebody who had
 * just paid for one, and recorded a yearly upgrade as monthly (QA round 8c,
 * OPS2/OPS2d/OPS3; VG-54).
 *
 * The rule: among the lines that are the subscription's own, the one whose
 * period ends last. Taking the FIRST non-side line would give the same answer
 * for every payload Stripe documents, since subscription items come in reverse
 * chronological order, but that ordering is exactly what this function was
 * burned trusting once, so the period end decides and not the position. The
 * two halves back each other up, and the mutants say exactly how far:
 *   - Dropping both, back to `lines.data[0]`, is caught three times (OPS2,
 *     OPS2d, OPS3).
 *   - Dropping the side-line filter is caught by the year-long add-on (OPS5,
 *     OPS5d), which is the case the period end alone gets wrong.
 *   - Reversing the period-end comparison is caught by nothing, because with
 *     the filter in place a documented payload leaves only one subscription
 *     line to choose from. It stays so that the answer does not rest on
 *     Stripe's ordering.
 *
 * The fallbacks are for invoices that have no subscription line at all, where
 * nothing on the invoice says what subscription period was bought: an invoice
 * billed entirely of add-ons, or of the prorations of an immediate upgrade.
 * The period an invoice names is a floor on paid-through and never a ceiling
 * (`periodEndIsFloor` below), so the last-ending line is the one answer there
 * that cannot shorten access, and the subscription's own next event replaces
 * it outright. No test separates that from `lines[0]`: every payload the docs
 * describe puts the same line first either way, so it is a choice of which way
 * to be wrong on an undocumented shape, not a tested decision.
 * @param {Object} invoice Stripe invoice.
 * @returns {Object|null} The line, or null.
 */
function periodLineOf(invoice) {
  const lines = invoice && invoice.lines && Array.isArray(invoice.lines.data) ? invoice.lines.data : [];
  const ending = (line) => (line && line.period ? unixOrNull(line.period.end) : null);
  const latest = (list) => list.reduce((best, line) => (
    ending(line) !== null && (best === null || ending(line) > ending(best)) ? line : best
  ), null);
  return latest(lines.filter((line) => !isSideLine(line))) || latest(lines) || lines[0] || null;
}

/**
 * Map an invoice.paid / invoice.payment_failed event to an entitlement update.
 * @param {Object} invoice Stripe invoice.
 * @param {Object} env Worker env bindings.
 * @param {boolean} paid Whether the invoice was paid.
 * @returns {Object} Entitlement update descriptor.
 */
function mapInvoice(invoice, env, paid) {
  const line = periodLineOf(invoice);
  const priceId = invoiceLinePriceId(line);
  const byPrice = planOfOwnLine(line, priceId, env);
  // The same gate as a subscription's own event, or a renewal of something
  // that is not ours would lift the suspension it just received — and `paid`
  // is one-way, so it must not be recorded for a price we do not sell.
  const unlisted = !byPrice && priceVerdict(priceId, env) === "unlisted";
  const subscriptionId = invoiceSubscriptionId(invoice, line);
  return {
    provider: "stripe",
    claimId: null,
    subscriptionId,
    customerId: idOf(invoice && invoice.customer),
    plan: byPrice || undefined,
    planSource: byPrice ? "price_id" : undefined,
    status: unlisted ? "suspended" : (paid ? "active" : "past_due"),
    // A paid invoice confirms money arrived; a failed one says nothing about
    // whether an earlier payment did.
    paid: paid && !unlisted ? true : undefined,
    paymentId: paid && !unlisted ? paymentIdForInvoice(invoice) : null,
    periodEnd: unixOrNull(line && line.period && line.period.end),
    // An invoice is about one billing period, not the subscription's current
    // state, so the period it names is a floor on paid-through and never a
    // ceiling. A subscription event carries `current_period_end` and does
    // replace it; an invoice must not. Stripe can emit a paid invoice for an
    // EARLIER period after a later one — a redelivery, or collection
    // re-attempted on an older invoice — and that used to drag the period end
    // backwards, so a subscriber who had paid two months lost the second one
    // (QA round 5 re-attack, D2).
    periodEndIsFloor: true
  };
}

/** The price id of an invoice line, in the pre-2025 `price` shape or the newer `pricing.price_details` one. */
function invoiceLinePriceId(line) {
  return idOf(line && line.price)
    || idOf(line && line.pricing && line.pricing.price_details && line.pricing.price_details.price);
}

/** The plan an invoice line's price names, read only from the subscription's own line. */
function planOfOwnLine(line, priceId, env) {
  // A proration line's price is the plan the customer is leaving as often as the
  // one they are joining (Stripe lists the credit for unused time, then the
  // debit for the new plan), so it says nothing about the plan the subscription
  // is on. The subscription's own event does. Only the subscription's own line
  // may name a plan.
  return line && !isSideLine(line) ? planFromPriceId(priceId, env) : null;
}

/** The subscription an invoice bills: on the invoice, on its line, or under `parent.subscription_details`. */
function invoiceSubscriptionId(invoice, line) {
  return idOf(invoice && invoice.subscription)
    || idOf(line && line.subscription)
    || idOf(
      invoice && invoice.parent && invoice.parent.subscription_details
        && invoice.parent.subscription_details.subscription
    );
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
  const mapped = updateForEvent(event, object, env);
  if (!mapped.update) {
    return mapped;
  }
  const { update } = mapped;
  if (!update.subscriptionId && !update.claimId && !update.paymentId) {
    return { handled: false, reason: "no_license_identity" };
  }
  stampEventTimes(update, event, object);
  return { handled: true, update };
}

/** The update an event's object maps to by the event's type, or the not-handled result that says why there is none. */
function updateForEvent(event, object, env) {
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
      // explain itself) but never entitles, and until a payment does arrive
      // no later event lifts it or sets it waiting again.
      update = mapCheckoutSession(object, env, "canceled");
      update.paymentFailed = true;
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
    case "charge.refunded":
      // Mercado Pago has always ended access when its money went back; Stripe
      // did not, so a refunded yearly pass kept up to 366 days of Pro and the
      // two providers disagreed (QA round 4, QA-W-02).
      if (!isFullyRefunded(object)) {
        return { handled: false, reason: "partial_refund" };
      }
      update = mapRefundedCharge(object);
      break;
    case "charge.dispute.created":
    case "charge.dispute.updated":
    case "charge.dispute.closed":
    case "charge.dispute.funds_withdrawn":
      update = mapDispute(object, event.type === "charge.dispute.funds_withdrawn");
      // An inquiry, a prevented dispute, or one we won. Acknowledged, so
      // Stripe stops, and nothing is taken from a customer who still paid.
      if (!update) {
        return { handled: false, reason: "dispute_took_no_money" };
      }
      break;
    default:
      return { handled: false, reason: "unhandled_event_type" };
  }
  return { update };
}

/** Date an update by its event: when it happened, when money went back or a cancellation took effect, a paid checkout's start. */
function stampEventTimes(update, event, object) {
  // When the event was emitted, so a delayed or retried delivery cannot undo a
  // newer one. Stripe guarantees neither ordering nor exactly-once delivery.
  update.occurredAt = unixOrNull(event.created);
  // Money went back when its event says it did. A charge that does not say
  // when it was taken (and a dispute never does) reverses whichever charge the
  // license last counted instead, so the store can still tell whether what
  // went back is what paid for the period the license is in.
  // `isReversal` and not the event name: a dispute that took no money reads as
  // `charge.dispute.*` too, and must leave the license exactly as it was.
  if (update.isReversal) {
    update.reversedAt = update.occurredAt;
    if (!Number.isFinite(update.reversedChargeAt)) {
      update.reverseLatestCharge = true;
    }
  }
  // When a cancellation took effect (a failed async payment has no `ended_at`
  // of its own). The store ends a period that was never paid for there.
  if (update.status === "canceled" && !Number.isFinite(update.endedAt)) {
    update.endedAt = update.occurredAt;
  }
  // A checkout whose money arrived buys one plan interval from the moment it
  // arrived. This is a floor, never a ceiling: `extendForCharge` only ever
  // lengthens a period, and a subscription event that carries the real
  // `current_period_end` replaces it outright.
  //
  // It has to apply to a subscription's checkout too, and used to not. A
  // one-time price (mode "payment") has no later event to end it, which is why
  // this was here; but a subscription's checkout was left with `periodEnd`
  // null, and null is for ever. The three events Stripe sends for a new
  // subscription normally fix that within seconds — and then this bound is
  // invisible, because every one of them sets a longer period. The case it
  // closes is the one where they never arrive at all: a webhook endpoint
  // configured for `checkout.session.completed` alone, a signing secret
  // rotated between events, or a subscription event dropped. Before this, that
  // sold one month and gave Pro for life (QA round 4, QA-W-05).
  //
  // A webhook's session carries no line items, so a checkout that is not
  // monthly needs `metadata.plan` on its Payment Link to be counted as what it
  // is — the same requirement a yearly one-time pass already has. Without it a
  // yearly subscriber whose subscription events all go missing is bounded to a
  // month rather than to a year, which is the safe direction to be wrong in,
  // and any one of those events puts the year back.
  if (event.type.startsWith("checkout.session.") && update.status === "active") {
    update.periodEndFromCharge = update.occurredAt ?? unixOrNull(object.created);
  }
}
