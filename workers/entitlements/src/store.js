/**
 * KV helpers for entitlement storage.
 *
 * Every function takes the KV namespace as its first argument (never a global),
 * so the whole module is testable against a small in-memory fake.
 *
 * Key space:
 *   event:<provider>:<eventId>            -> "1"        (idempotency, 30d TTL)
 *   lic:<licenseId>                       -> record JSON
 *   claim:<provider>:<sessionOrPaymentId> -> licenseId   (90d TTL)
 *   pay:<provider>:<paymentId>            -> licenseId   (400d TTL)
 *   sub:<provider>:<subscriptionId>       -> licenseId
 *   paid:<licenseId>                      -> {paidAt?, periodEnd?} (a payment was confirmed: the latest one)
 *   ended:<licenseId>                     -> {endedAt, periodEnd, periodEndIfPaid?, paidAtWhenEnded?} (subscription deleted)
 *   reversed:<licenseId>                  -> {reversedChargeAt, reversedAt} (money given back)
 *   charged:<licenseId>                   -> chargedAt  (latest charge that went through)
 *   refused:<provider>:<eventId>          -> unix secs  (API first refused its resource, 30d TTL)
 *
 * KV has no compare-and-swap, so two webhooks for one license processed at the
 * same time can each read the record, and the later write wins with the other's
 * change lost. A fact that never changes back once true (a confirmed payment, a
 * deletion, a charge that went through or money given back, the last two
 * meant only to move on to a later charge) is therefore also kept in a key of
 * its own that only that fact ever writes, and is read back over the record, so
 * a concurrent write of an older copy cannot lose it. KV is also eventually
 * consistent, so another edge location may not see such a key for up to about
 * a minute: the fact is then late, not lost. Changes that are not one-way (an
 * ordinary status or period update, a charge that was turned down) can still
 * be lost that way. The charge's key is read again just before it is written
 * and is written only for a later charge than the one read, so an earlier
 * charge processed alongside a later one can set it back, but only when the
 * later one's write lands in the instant between that read and that write, or
 * at an edge location that has not seen the later one yet. The payment's key
 * works the same way, and says when the latest payment was made and the period
 * it named, so a payment made before a Stripe deletion still restores the
 * period the deletion ended when the two are processed at once, whichever
 * record wins (the deletion's key says which payment it already knew of).
 * The refund's key is written from the record as it was read, so the refund
 * of a later charge processed at the same moment as the refund of an earlier
 * one can still be lost.
 *
 * What it can no longer do is split one customer into two licenses. The first
 * events for a new license (a checkout and its subscription's first event)
 * processed at once each find no license, neither being able to see the
 * other's write, and each used to mint a random id — leaving the claim index
 * pointing at one record and the subscription index, which every later event
 * follows, at the other, so the claimed copy never heard of a renewal or a
 * cancellation. A new license's id is now derived from the subscription (or
 * the one-off payment) it belongs to, so writers who cannot see each other
 * still agree: see `deriveLicenseId`.
 *
 * Closing the rest of that needs a single writer per license (a Durable
 * Object, or a D1 row updated conditionally), which this store does not have.
 */

"use strict";

import { deriveLicenseId, generateLicenseId, periodEndForPlan } from "./license.js";

/** Idempotency markers live 30 days — well past any provider retry window. */
export const EVENT_TTL_SECONDS = 2592000;

/** Checkout-session -> license lookups live 90 days. */
export const CLAIM_TTL_SECONDS = 7776000;

/**
 * Payment -> license lookups live 400 days.
 *
 * This index exists so that money going back can find the access it bought:
 * a refunded or disputed charge names its payment and nothing else we know.
 * It therefore has to outlive the longest thing a single payment can buy — a
 * year — plus the card networks' dispute windows, which run to 120 days from
 * the transaction and can be opened near the end of the term. 400 days covers
 * both with room, and is still a bound, so the store does not grow for ever.
 */
export const PAYMENT_TTL_SECONDS = 34560000;

/**
 * A refunded charge is still what paid for the current period when that period
 * ends up to a week past the charge's own plan interval. A subscription's
 * period runs to its next scheduled charge, which is not counted from the
 * moment the charge went through; the next charge's period ends weeks later.
 */
export const REVERSAL_SLACK_SECONDS = 604800;

/**
 * Key for an event idempotency marker.
 * @param {string} provider "stripe" | "mercadopago".
 * @param {string} eventId Provider event id.
 * @returns {string} KV key.
 */
export function eventKey(provider, eventId) {
  return `event:${provider}:${eventId}`;
}

/**
 * Key for an entitlement record.
 * @param {string} licenseId Opaque license id.
 * @returns {string} KV key.
 */
export function licenseKey(licenseId) {
  return `lic:${licenseId}`;
}

/**
 * Key for a checkout-session / payment claim lookup.
 * @param {string} provider "stripe" | "mercadopago".
 * @param {string} claimId Checkout session id or payment id.
 * @returns {string} KV key.
 */
export function claimKey(provider, claimId) {
  return `claim:${provider}:${claimId}`;
}

/**
 * Key for the subscription -> license index.
 * @param {string} provider "stripe" | "mercadopago".
 * @param {string} subscriptionId Subscription / preapproval id.
 * @returns {string} KV key.
 */
export function subscriptionKey(provider, subscriptionId) {
  return `sub:${provider}:${subscriptionId}`;
}

/**
 * Key for the payment -> license index.
 * @param {string} provider "stripe" | "mercadopago".
 * @param {string} paymentId Payment intent / payment id.
 * @returns {string} KV key.
 */
export function paymentKey(provider, paymentId) {
  return `pay:${provider}:${paymentId}`;
}

/**
 * Key for the marker that a payment was confirmed for a license.
 * @param {string} licenseId Opaque license id.
 * @returns {string} KV key.
 */
export function paidKey(licenseId) {
  return `paid:${licenseId}`;
}

/**
 * Key for the marker a deleted subscription leaves on its license.
 * @param {string} licenseId Opaque license id.
 * @returns {string} KV key.
 */
export function endedKey(licenseId) {
  return `ended:${licenseId}`;
}

/**
 * Key for the latest charge whose money went back on a license.
 * @param {string} licenseId Opaque license id.
 * @returns {string} KV key.
 */
export function reversedKey(licenseId) {
  return `reversed:${licenseId}`;
}

/**
 * Key for when the latest charge that went through on a license was made.
 * @param {string} licenseId Opaque license id.
 * @returns {string} KV key.
 */
export function chargedKey(licenseId) {
  return `charged:${licenseId}`;
}

/**
 * Check-then-set the idempotency marker for a webhook event.
 * @param {Object} kv KV namespace.
 * @param {string} provider "stripe" | "mercadopago".
 * @param {string} eventId Provider event id.
 * @returns {Promise<boolean>} True when this is the first time we saw the event.
 */
export async function markEventSeen(kv, provider, eventId) {
  if (!eventId) {
    return true;
  }
  const key = eventKey(provider, eventId);
  const existing = await kv.get(key);
  if (existing) {
    return false;
  }
  await kv.put(key, "1", { expirationTtl: EVENT_TTL_SECONDS });
  return true;
}

/**
 * Key for when a notification's resource was first refused by the provider's
 * API (not found, forbidden).
 * @param {string} provider "mercadopago".
 * @param {string} eventId Notification id.
 * @returns {string} KV key.
 */
export function refusedKey(provider, eventId) {
  return `refused:${provider}:${eventId}`;
}

/**
 * Remember when a notification's resource was first refused, and say how
 * long ago that was. The first refusal is now.
 * @param {Object} kv KV namespace.
 * @param {string} provider "mercadopago".
 * @param {string} eventId Notification id.
 * @param {number} now Unix seconds.
 * @returns {Promise<number>} Seconds since the first refusal.
 */
export async function noteRefusal(kv, provider, eventId, now) {
  if (!eventId) {
    return 0;
  }
  const key = refusedKey(provider, eventId);
  const first = Number(await kv.get(key));
  if (Number.isFinite(first) && first > 0) {
    return now - first;
  }
  await kv.put(key, String(now), { expirationTtl: EVENT_TTL_SECONDS });
  return 0;
}

/**
 * Drop an event idempotency marker.
 *
 * Called when processing failed after the marker was set, so the provider's
 * retry is processed instead of being dismissed as a replay.
 *
 * @param {Object} kv KV namespace.
 * @param {string} provider "stripe" | "mercadopago".
 * @param {string} eventId Provider event id.
 * @returns {Promise<void>} Resolves when cleared.
 */
export async function clearEventSeen(kv, provider, eventId) {
  if (!eventId) {
    return;
  }
  await kv.delete(eventKey(provider, eventId));
}

/**
 * Read an entitlement record, with the facts kept in their own keys applied.
 * @param {Object} kv KV namespace.
 * @param {string} licenseId Opaque license id.
 * @returns {Promise<Object|null>} Record or null.
 */
export async function getEntitlement(kv, licenseId) {
  if (!licenseId) {
    return null;
  }
  const raw = await kv.get(licenseKey(licenseId));
  if (!raw) {
    return null;
  }
  let record;
  try {
    record = JSON.parse(raw);
  } catch {
    return null;
  }
  // A record still saying "unpaid" may have lost a confirmation to a
  // concurrent write; the confirmation's own key settles it.
  let payment;
  const readPayment = async () => {
    if (payment === undefined) {
      payment = await readPaid(kv, licenseId);
    }
    return payment;
  };
  if (record && record.paid === false && (await readPayment())) {
    record.paid = true;
  }
  // Likewise a subscription's record that does not show its deletion.
  if (record && record.subscriptionId && !Number.isFinite(record.endedAt)) {
    const ended = await readEnded(kv, licenseId);
    if (ended) {
      record.status = "canceled";
      record.endedAt = ended.endedAt;
      capPeriodEnd(record, ended.periodEnd);
      if (Number.isFinite(ended.periodEndIfPaid)) {
        record.periodEndIfPaid = ended.periodEndIfPaid;
      }
      if (Number.isFinite(ended.paidAtWhenEnded)) {
        record.paidAtWhenEnded = ended.paidAtWhenEnded;
      }
    }
  }
  // A payment made before a Stripe deletion that ended a period it did not
  // know to be paid restores that period (see upsertEntitlement), also when
  // the payment was processed at the same moment as the deletion and one of
  // the two records lost the other's write: the payment's own key says when
  // it was made and what it paid for. Only a payment later than any the
  // deletion knew of: one it knew of did not make it paid up.
  if (record && Number.isFinite(record.endedAt) && Number.isFinite(record.periodEndIfPaid)) {
    const paid = await readPayment();
    if (paid && Number.isFinite(paid.paidAt) && !(record.paidAtWhenEnded >= paid.paidAt)) {
      const paidThrough = periodRestoredBy(record, { occurredAt: paid.paidAt, periodEnd: paid.periodEnd });
      if (paidThrough !== null && !(record.periodEnd >= paidThrough)) {
        record.periodEnd = paidThrough;
        record.paid = true;
      }
    }
  }
  // And the latest charge that went through, which still buys its interval
  // unless the subscription was deleted. Before the refund below, so money
  // given back still ends the period it paid for.
  if (record && !Number.isFinite(record.endedAt)) {
    const chargedAt = await readCharged(kv, licenseId);
    if (chargedAt !== null && !(record.chargedAt >= chargedAt)) {
      record.chargedAt = chargedAt;
      extendForCharge(record, chargedAt);
    }
  }
  // And money given back. Both providers report it: Mercado Pago on the
  // payment itself, Stripe as a refunded charge or a dispute. The key is read
  // over the record because a refund processed alongside another event can
  // lose its write, and money that went back must not come back with it.
  if (record) {
    const reversal = await readReversal(kv, licenseId);
    if (reversal) {
      noteReversal(record, reversal, reversal.reversedAt);
      endReversedPeriod(record);
    }
  }
  return record;
}

/**
 * Read the marker a deleted subscription left on its license: when it ended,
 * the period it left, the period a payment made before it would restore, and
 * when the latest payment it knew of was made.
 * @param {Object} kv KV namespace.
 * @param {string} licenseId Opaque license id.
 * @returns {Promise<{endedAt: number, periodEnd: number, periodEndIfPaid?: number, paidAtWhenEnded?: number}|null>} Marker or null.
 */
async function readEnded(kv, licenseId) {
  const raw = await kv.get(endedKey(licenseId));
  if (!raw) {
    return null;
  }
  try {
    const ended = JSON.parse(raw);
    return ended && Number.isFinite(ended.endedAt) && Number.isFinite(ended.periodEnd) ? ended : null;
  } catch {
    return null;
  }
}

/**
 * Read the payment confirmed on a license: when the latest one was made and
 * the period end it named. A key that holds "1" (written before the key held
 * more) or an undated payment says only that one was confirmed.
 * @param {Object} kv KV namespace.
 * @param {string} licenseId Opaque license id.
 * @returns {Promise<{paidAt?: number, periodEnd?: number}|null>} Payment, or null when none was confirmed.
 */
async function readPaid(kv, licenseId) {
  const raw = await kv.get(paidKey(licenseId));
  if (!raw) {
    return null;
  }
  let paid = null;
  try {
    paid = JSON.parse(raw);
  } catch {
    paid = null;
  }
  return paid && typeof paid === "object" ? paid : {};
}

/**
 * Keep a confirmed payment in its own key: when it was made, and the period
 * end it named (an invoice's; a checkout names none). Read again first, as
 * for a charge: only a later payment moves the key on, and never one made
 * after the subscription's deletion past one made before it, which is the
 * one that can restore the period the deletion ended.
 * @param {Object} kv KV namespace.
 * @param {string} licenseId Opaque license id.
 * @param {Object} record Record being written.
 * @param {Object} update The paid update.
 * @returns {Promise<void>} Resolves when written, or at once when the key
 *   already holds as late a payment.
 */
async function putPaid(kv, licenseId, record, update) {
  const paidAt = Number.isFinite(update.occurredAt) ? Math.floor(update.occurredAt) : undefined;
  const stored = await readPaid(kv, licenseId);
  if (stored) {
    const later = paidAt !== undefined && !(stored.paidAt >= paidAt);
    const pastDeletion = Number.isFinite(record.endedAt) && paidAt > record.endedAt && stored.paidAt <= record.endedAt;
    if (!later || pastDeletion) {
      return;
    }
  }
  await kv.put(paidKey(licenseId), JSON.stringify({
    paidAt,
    periodEnd: Number.isFinite(update.periodEnd) ? Math.floor(update.periodEnd) : undefined
  }));
}

/**
 * Read the latest charge whose money went back on a license.
 * @param {Object} kv KV namespace.
 * @param {string} licenseId Opaque license id.
 * @returns {Promise<{reversedChargeAt: number, reversedAt: number}|null>} Reversal or null.
 */
async function readReversal(kv, licenseId) {
  const raw = await kv.get(reversedKey(licenseId));
  if (!raw) {
    return null;
  }
  try {
    const reversal = JSON.parse(raw);
    // `reversedPaymentId` is newer than this key and absent from reversals
    // stored before it, which is why `endReversedPeriod` still has its
    // arithmetic fallback.
    return reversal && Number.isFinite(reversal.reversedChargeAt) && Number.isFinite(reversal.reversedAt)
      ? reversal
      : null;
  } catch {
    return null;
  }
}

/**
 * Read when the latest charge that went through on a license was made.
 * @param {Object} kv KV namespace.
 * @param {string} licenseId Opaque license id.
 * @returns {Promise<number|null>} Unix seconds or null.
 */
async function readCharged(kv, licenseId) {
  const raw = await kv.get(chargedKey(licenseId));
  const chargedAt = raw ? Number(raw) : NaN;
  return Number.isFinite(chargedAt) ? chargedAt : null;
}

/**
 * Write an entitlement record verbatim.
 * @param {Object} kv KV namespace.
 * @param {Object} record Entitlement record.
 * @returns {Promise<Object>} The same record.
 */
export async function putEntitlement(kv, record) {
  await kv.put(licenseKey(record.licenseId), JSON.stringify(record));
  return record;
}

/**
 * Delete an entitlement record (does not clear the indices that point at it;
 * a dangling index resolves to null and is treated as not_found).
 * @param {Object} kv KV namespace.
 * @param {string} licenseId Opaque license id.
 * @returns {Promise<void>} Resolves when deleted.
 */
export async function deleteEntitlement(kv, licenseId) {
  await kv.delete(licenseKey(licenseId));
}

/**
 * Resolve the license id recorded for a checkout session / payment id.
 * @param {Object} kv KV namespace.
 * @param {string} provider "stripe" | "mercadopago".
 * @param {string} claimId Checkout session id or payment id.
 * @returns {Promise<string|null>} License id or null.
 */
export async function getLicenseIdForClaim(kv, provider, claimId) {
  if (!claimId) {
    return null;
  }
  return (await kv.get(claimKey(provider, claimId))) || null;
}

/**
 * Resolve the license id recorded for a subscription / preapproval id.
 * @param {Object} kv KV namespace.
 * @param {string} provider "stripe" | "mercadopago".
 * @param {string} subscriptionId Subscription / preapproval id.
 * @returns {Promise<string|null>} License id or null.
 */
export async function getLicenseIdForSubscription(kv, provider, subscriptionId) {
  if (!subscriptionId) {
    return null;
  }
  return (await kv.get(subscriptionKey(provider, subscriptionId))) || null;
}

/**
 * Point a claim id at a license (idempotent; never repoints an existing claim).
 * @param {Object} kv KV namespace.
 * @param {string} provider "stripe" | "mercadopago".
 * @param {string} claimId Checkout session id or payment id.
 * @param {string} licenseId Opaque license id.
 * @returns {Promise<void>} Resolves when written.
 */
export async function putClaimIndex(kv, provider, claimId, licenseId) {
  if (!claimId || !licenseId) {
    return;
  }
  await kv.put(claimKey(provider, claimId), licenseId, { expirationTtl: CLAIM_TTL_SECONDS });
}

/**
 * Resolve the license id recorded for a payment id.
 * @param {Object} kv KV namespace.
 * @param {string} provider "stripe" | "mercadopago".
 * @param {string} paymentId Payment intent / payment id.
 * @returns {Promise<string|null>} License id or null.
 */
export async function getLicenseIdForPayment(kv, provider, paymentId) {
  if (!paymentId) {
    return null;
  }
  return (await kv.get(paymentKey(provider, paymentId))) || null;
}

/**
 * Point a payment id at a license, so a refund or a dispute of that payment
 * can find what it paid for. Written whenever a payment is first heard of
 * alongside something that identifies the license; the money going back names
 * only the payment.
 * @param {Object} kv KV namespace.
 * @param {string} provider "stripe" | "mercadopago".
 * @param {string} paymentId Payment intent / payment id.
 * @param {string} licenseId Opaque license id.
 * @returns {Promise<void>} Resolves when written.
 */
export async function putPaymentIndex(kv, provider, paymentId, licenseId) {
  if (!paymentId || !licenseId) {
    return;
  }
  await kv.put(paymentKey(provider, paymentId), licenseId, { expirationTtl: PAYMENT_TTL_SECONDS });
}

/**
 * Point a subscription id at a license.
 * @param {Object} kv KV namespace.
 * @param {string} provider "stripe" | "mercadopago".
 * @param {string} subscriptionId Subscription / preapproval id.
 * @param {string} licenseId Opaque license id.
 * @returns {Promise<void>} Resolves when written.
 */
export async function putSubscriptionIndex(kv, provider, subscriptionId, licenseId) {
  if (!subscriptionId || !licenseId) {
    return;
  }
  await kv.put(subscriptionKey(provider, subscriptionId), licenseId);
}

/**
 * Find the license an update belongs to, preferring the subscription index so
 * later subscription events keep updating the same license.
 * @param {Object} kv KV namespace.
 * @param {Object} update Entitlement update descriptor.
 * @returns {Promise<string|null>} Existing license id or null.
 */
export async function resolveExistingLicenseId(kv, update) {
  const bySubscription = await getLicenseIdForSubscription(kv, update.provider, update.subscriptionId);
  if (bySubscription) {
    return bySubscription;
  }
  const byClaim = await getLicenseIdForClaim(kv, update.provider, update.claimId);
  if (byClaim) {
    return byClaim;
  }
  // Last, because only money going back arrives with nothing else to go by.
  return getLicenseIdForPayment(kv, update.provider, update.paymentId);
}

/**
 * Apply a defined value only (never overwrite known state with undefined/null).
 * @param {Object} target Record being built.
 * @param {string} field Field name.
 * @param {unknown} value Incoming value.
 * @returns {void}
 */
function applyIfPresent(target, field, value) {
  if (value !== undefined && value !== null && value !== "") {
    target[field] = value;
  }
}

/**
 * End a record's period no later than `at`. Only ever shortens it.
 * @param {Object} record Record being built.
 * @param {unknown} at Unix seconds, or anything else to leave the period alone.
 * @returns {void}
 */
function capPeriodEnd(record, at) {
  if (!Number.isFinite(at)) {
    return;
  }
  const end = Math.floor(at);
  if (!Number.isFinite(record.periodEnd) || end < record.periodEnd) {
    record.periodEnd = end;
  }
}

/**
 * Remember a charge whose money went back (a refund, a chargeback): when the
 * money left, and when the charge had gone through. Of several, the latest
 * charge is kept, since it paid for the latest period. Applied whatever order
 * the notifications arrive in.
 * @param {Object} record Record being built.
 * @param {Object} update Entitlement update descriptor.
 * A dispute names the payment it is about but not when that payment was taken,
 * so it asks for the latest charge this license counted (`reverseLatestCharge`)
 * instead of naming an instant. Failing even that — a license that heard of a
 * period but never of a charge — the reversal's own moment stands in, which
 * ends access when the money went back rather than leaving it open. That is
 * the direction a chargeback calls for.
 *
 * @param {number} now Unix seconds, for a reversal that does not say when.
 * @returns {void}
 */
function noteReversal(record, update, now) {
  const at = Number.isFinite(update.reversedAt) ? Math.floor(update.reversedAt) : now;
  const named = Number.isFinite(update.reversedChargeAt)
    ? Math.floor(update.reversedChargeAt)
    : (update.reverseLatestCharge === true ? (Number.isFinite(record.chargedAt) ? record.chargedAt : at) : null);
  if (named === null) {
    return;
  }
  const chargedAt = named;
  const paymentId = typeof update.paymentId === "string" && update.paymentId ? update.paymentId : null;
  // A reversal that names the payment the period was bought with outranks one
  // that does not, whatever the two charge dates say.
  //
  // The dates cannot separate them on a rail where a refund names its
  // transaction but not when that transaction was taken: every such reversal
  // falls back to the record's own latest charge, so they all carry the same
  // instant and the first one seen would keep the slot for ever. The refund of
  // month one, then the refund of month two, left month two running — the
  // second refund could not displace the first.
  const namesPeriod = paymentId !== null
    && typeof record.periodPaymentId === "string"
    && paymentId === record.periodPaymentId
    && record.reversedPaymentId !== record.periodPaymentId;
  if (!Number.isFinite(record.reversedChargeAt) || chargedAt > record.reversedChargeAt
    || (chargedAt === record.reversedChargeAt && at < record.reversedAt)
    || namesPeriod) {
    record.reversedChargeAt = chargedAt;
    record.reversedAt = at;
    // WHICH payment went back, when the provider names one. A refunded charge
    // and a dispute both name their payment intent, and that is a far better
    // answer than any arithmetic about when the charge was taken: see
    // `endReversedPeriod`. Overwritten together with the instant above, so the
    // pair always describes the same reversal.
    if (paymentId) {
      record.reversedPaymentId = paymentId;
    } else {
      delete record.reversedPaymentId;
    }
  }
}

/**
 * Remember when the latest charge that went through was made, so its interval
 * can be counted again once the record learns its plan: a subscription's
 * charge does not say the plan, and is often processed before the
 * subscription's own notification. Applied whatever order the notifications
 * arrive in.
 * @param {Object} record Record being built.
 * @param {Object} update Entitlement update descriptor.
 * @returns {void}
 */
function noteCharge(record, update) {
  if (!Number.isFinite(update.periodEndFromCharge)) {
    return;
  }
  const chargedAt = Math.floor(update.periodEndFromCharge);
  if (!Number.isFinite(record.chargedAt) || chargedAt > record.chargedAt) {
    record.chargedAt = chargedAt;
  }
}

/**
 * Remember when the latest charge that was turned down was due. Applied
 * whatever order the notifications arrive in. Records stored before this
 * existed have none.
 * @param {Object} record Record being built.
 * @param {Object} update Entitlement update descriptor.
 * @returns {void}
 */
function noteDecline(record, update) {
  if (!Number.isFinite(update.declinedAt)) {
    return;
  }
  const declinedAt = Math.floor(update.declinedAt);
  if (!Number.isFinite(record.declinedAt) || declinedAt > record.declinedAt) {
    record.declinedAt = declinedAt;
  }
}

/**
 * End a stopped subscription's period when it stopped, if a charge was turned
 * down before it stopped and none has gone through since. The period its
 * authorization set (the next charge date) was never paid for. It keeps
 * whatever an earlier charge paid for, and a charge that goes through later
 * still buys its own interval.
 * @param {Object} record Record being built.
 * @param {unknown} stoppedAt Unix seconds it stopped, or anything else to
 *   leave the period alone.
 * @returns {void}
 */
function endDeclinedPeriod(record, stoppedAt) {
  if (!Number.isFinite(record.declinedAt) || !Number.isFinite(stoppedAt)
    || record.chargedAt >= record.declinedAt || record.declinedAt > stoppedAt) {
    return;
  }
  const paidThrough = periodEndForPlan(record.plan, record.chargedAt);
  capPeriodEnd(record, paidThrough !== null && paidThrough > stoppedAt ? paidThrough : stoppedAt);
}

/**
 * Entitle a charge that went through for one plan interval of the plan the
 * record holds, from when it went through. Never shortens the period.
 * @param {Object} record Record being built.
 * @param {unknown} chargedAt Unix seconds the charge went through, or
 *   anything else to leave the period alone.
 * @returns {void}
 */
function extendForCharge(record, chargedAt) {
  const charged = periodEndForPlan(record.plan, chargedAt);
  if (charged !== null && (!Number.isFinite(record.periodEnd) || charged > record.periodEnd)) {
    record.periodEnd = charged;
  }
}

/**
 * True when a plan was read from something the provider said (a price or
 * plan id, metadata, the recurrence), not assumed. Assumed plans are recorded
 * as "default" or "default(...)", and records heard of only through a charge
 * have none.
 * @param {unknown} planSource How an update or a record got its plan.
 * @returns {boolean} Whether the plan is known.
 */
function isKnownPlanSource(planSource) {
  return typeof planSource === "string" && planSource !== "" && !planSource.startsWith("default");
}

/**
 * End the period when the money went back, if the reversed payment is what
 * paid for it.
 *
 * **Identity first.** When the provider named the payment that went back and
 * the record knows which payment bought the period it is in, the two ids
 * answer the question outright and nothing has to be computed. That is the
 * whole of it for a refund or a dispute on either rail that names a payment
 * intent: the same id means the money for *this* period went back, and a
 * different id means an earlier month's did and this period stands.
 *
 * The arithmetic below is the fallback, for a reversal or a record that names
 * no payment — a Mercado Pago charge, a dispute on a license that only ever
 * heard of a period, a record written before `periodPaymentId` existed. It
 * asks whether the period runs further than one plan interval past the
 * reversed charge, plus a week, and leaves it alone if it does, on the
 * reasoning that a later charge must have paid for it.
 *
 * Three findings came out of trusting that arithmetic when an id was available
 * (QA round 5 re-attack):
 *
 *   - a dispute of the LATEST renewal's charge left access on, because
 *     `reverseLatestCharge` reads `chargedAt`, which a paid invoice does not
 *     set — so the sum was done against the first charge's interval and the
 *     renewal's period looked like somebody else's;
 *   - a yearly pass whose delayed payment settled eight days after the charge
 *     was created survived a full refund, because the period is counted from
 *     the money arriving and eight days is one day past the week of slack;
 *   - and the refund of a subscription RENEWAL was documented as not covered
 *     at all, which identity closes wherever the invoice carries a payment
 *     intent.
 *
 * None of those is a slack value that wanted tuning. They are all the same
 * mistake: inferring which payment bought the period when the provider had
 * already said.
 *
 * @param {Object} record Record being built.
 * @returns {void}
 */
function endReversedPeriod(record) {
  if (!Number.isFinite(record.reversedChargeAt) || !Number.isFinite(record.reversedAt)) {
    return;
  }
  const reversedId = typeof record.reversedPaymentId === "string" ? record.reversedPaymentId : "";
  const periodId = typeof record.periodPaymentId === "string" ? record.periodPaymentId : "";
  if (reversedId && periodId) {
    if (reversedId === periodId) {
      capPeriodEnd(record, record.reversedAt);
    }
    return;
  }
  const paidThrough = periodEndForPlan(record.plan, record.reversedChargeAt);
  if (paidThrough === null || !Number.isFinite(record.periodEnd)
    || record.periodEnd <= paidThrough + REVERSAL_SLACK_SECONDS) {
    capPeriodEnd(record, record.reversedAt);
  }
}

/**
 * Remember which payment bought the period the license is in.
 *
 * Recorded when an update both confirms money arrived and moved the period end
 * out: that is what "this payment bought the period" means, and it is the one
 * fact a refund later needs. A payment that confirms money without lengthening
 * anything (a renewal of a period already known, a retry) leaves it alone, so
 * the id always names the payment behind the period actually held.
 *
 * Two things that are not an id arriving with a longer period matter as much,
 * because the id is read as proof and a wrong one takes paid access away:
 *
 *   - money that lengthens the period and names NO payment clears the id.
 *     Stripe omits the payment intent on an invoice settled from the
 *     customer's credit balance or marked paid out of band, and on an account
 *     whose API version stopped carrying the field. Keeping month one's id on
 *     a period month two bought made the refund of month one end a month two
 *     that had been paid for (QA round 7), in the one direction that costs a
 *     customer access they own. Cleared, the arithmetic below answers, and it
 *     answers that case right.
 *   - a paid invoice for the very period the record ALREADY holds names that
 *     period's money even though it lengthens nothing, because a subscription
 *     event can announce the new period end before the invoice behind it
 *     arrives. Without this the id would stay on the previous month, and a
 *     refund of the previous month would end a prorated month two whose own
 *     length the arithmetic cannot guess. Only when no payment has claimed
 *     THIS period yet, which is what `periodPaymentEnd` is for: a second
 *     invoice ending with the period — a proration charged at once mid-cycle —
 *     would otherwise take the period over from the payment that bought it,
 *     and then the refund of the proration would end a month it did not buy
 *     while the refund of the real payment would leave it running (QA round 7
 *     again, falsifying the rule as first written). When two payments end the
 *     same period, the first one is the one that bought it and the later one
 *     only topped it up. A record stored before `periodPaymentEnd` existed
 *     holds an id and no end: that id is left alone, which is how this behaved
 *     before the clause was added at all.
 *
 * @param {Object} record Record being built.
 * @param {Object} update Entitlement update descriptor.
 * @param {number|null} before The period end before this update was applied.
 * @returns {void}
 */
function notePeriodPayment(record, update, before) {
  if (update.paid !== true || !Number.isFinite(record.periodEnd)) {
    return;
  }
  const paymentId = typeof update.paymentId === "string" && update.paymentId ? update.paymentId : null;
  if (Number.isFinite(before) && record.periodEnd <= before) {
    if (paymentId && update.periodEndIsFloor === true && Number.isFinite(update.periodEnd)
      && Math.floor(update.periodEnd) === record.periodEnd && !claimsPeriod(record)) {
      record.periodPaymentId = paymentId;
      record.periodPaymentEnd = record.periodEnd;
    }
    return;
  }
  if (paymentId) {
    record.periodPaymentId = paymentId;
    record.periodPaymentEnd = record.periodEnd;
    return;
  }
  delete record.periodPaymentId;
  delete record.periodPaymentEnd;
}

/**
 * Whether the id the record holds already names the period it is in.
 *
 * An id with no period beside it is one stored before this was recorded, and
 * counts as claiming the period: leaving it is what the store did before the
 * equal-end rule existed, and overwriting it on a guess is the direction that
 * costs a customer access.
 *
 * There used to be a third rule here: a claim made from an INFERRED period
 * (a checkout bounded to one plan interval from when the money arrived) yielded
 * to a payment that named the same period. It was wrong, and it was only ever
 * needed because a test fixture gave one payment two ids. A checkout's order
 * and the first invoice of its subscription are one transaction with one id, so
 * nothing legitimate needs to transfer a claim between two payments — while a
 * mid-cycle upgrade or a proration DOES name the period the month's own payment
 * bought, and under that rule it took the claim, so refunding the real payment
 * ended nothing. First payment for a period keeps it, with no exceptions.
 * @param {Object} record Record being built.
 * @returns {boolean} Whether a payment has claimed the period now held.
 */
function claimsPeriod(record) {
  if (typeof record.periodPaymentId !== "string" || !record.periodPaymentId) {
    return false;
  }
  if (!Number.isFinite(record.periodPaymentEnd)) {
    return true;
  }
  return record.periodPaymentEnd === record.periodEnd;
}

/**
 * The period end a payment restores to a Stripe subscription deleted while it
 * was not known to be paid, or null when it restores nothing. Only a payment
 * made before the deletion restores anything: up to the deletion's own period
 * end (`periodEndIfPaid`), and no further than the period the payment paid
 * for. A payment that names no period of its own (a checkout) paid for the
 * period it was made in, so it restores the deletion's period only when one
 * plan interval from then, with the same week's slack as a refund, reaches
 * it: a first month's checkout delivered after a later month's deletion paid
 * for the first month, not the one the deletion ended.
 * @param {Object} record Deleted subscription's record.
 * @param {{occurredAt?: number, periodEnd?: number}} payment When the payment
 *   was made, and the period end it names, if any.
 * @returns {number|null} Restored period end, or null.
 */
function periodRestoredBy(record, payment) {
  if (!Number.isFinite(record.periodEndIfPaid) || !Number.isFinite(record.endedAt)
    || !Number.isFinite(payment.occurredAt) || payment.occurredAt > record.endedAt) {
    return null;
  }
  if (Number.isFinite(payment.periodEnd)) {
    return Math.min(Math.floor(payment.periodEnd), record.periodEndIfPaid);
  }
  const paidThrough = periodEndForPlan(record.plan, payment.occurredAt);
  return paidThrough !== null && paidThrough + REVERSAL_SLACK_SECONDS >= record.periodEndIfPaid
    ? record.periodEndIfPaid
    : null;
}

/**
 * True when an update describes an older world than the record already holds.
 *
 * Stripe stamps events to the second, so two events from the same second
 * cannot be ordered by time. They then resolve the same way in either order:
 *   - the one that ends access wins: Stripe sends the last failed invoice and
 *     the cancellation after it in the same second, and the invoice must not
 *     bring Pro back;
 *   - nothing goes back to "pending", where every purchase starts: a card
 *     checkout's subscription is created incomplete in the same second it is
 *     paid for, and must not leave the paid license waiting.
 * Other same-second events still apply as they arrive, since a checkout and
 * its subscription's first events often share a second.
 *
 * @param {Object} record Stored entitlement record.
 * @param {Object} update Entitlement update descriptor.
 * @returns {boolean} Whether the update must not change state.
 */
export function isStaleUpdate(record, update) {
  if (!Number.isFinite(update.occurredAt) || !Number.isFinite(record.occurredAt)) {
    return false;
  }
  if (update.occurredAt !== record.occurredAt) {
    return update.occurredAt < record.occurredAt;
  }
  if (update.status === "pending") {
    return record.status !== "pending";
  }
  return (record.status === "canceled" || record.status === "suspended")
    && (update.status === "active" || update.status === "past_due");
}

/**
 * Idempotently create or update the entitlement an update descriptor refers to.
 *
 * Reuses the license id already indexed for the subscription (or for the
 * checkout session) instead of minting a new one, so a subscription keeps one
 * stable license across its whole lifetime.
 *
 * Providers deliver out of order and retry, so an update whose `occurredAt` is
 * older than the stored one may not touch plan/status/periodEnd — otherwise a
 * late `invoice.paid` resurrects a subscription that was already deleted.
 * Identity fields, whether a payment was confirmed or failed, the interval a
 * charge that went through paid for (unless the subscription was deleted),
 * money given back, and the claim/subscription indexes are order-independent
 * and are still applied. The latest such charge is kept on the record
 * (`chargedAt`, and in `charged:` against a concurrent write) and counted
 * again on the plan an update brings, since a subscription's charge does not
 * say its plan. The latest Mercado Pago charge that was turned down is kept
 * too (`declinedAt`, in the record only): a subscription that stopped after
 * it, with no charge gone through since, keeps none of the period its
 * authorization set. A Stripe deletion that ended a period it did not know to
 * be paid keeps that period's end (`periodEndIfPaid`, also in `ended:`), and a
 * payment made before the deletion but processed after it restores it. So
 * does one processed at the same moment as the deletion: `paid:` keeps when
 * the latest payment was made (`paidAt` on the record), and the deletion when
 * the latest one it knew of was (`paidAtWhenEnded`, also in `ended:`), which
 * restores nothing.
 *
 * @param {Object} kv KV namespace.
 * @param {Object} update Descriptor: provider, plan, status, customerId,
 *   subscriptionId, periodEnd, periodEndFromCharge, endsAt, endedAt, paid,
 *   paymentFailed, reversedAt, reversedChargeAt, reverseLatestCharge,
 *   declinedAt, terminal, claimId, paymentId, requireExisting, planSource,
 *   occurredAt.
 * @param {{now?: number, generateId?: function(): string, idSecret?: string}} [options]
 *   `now` and `generateId` are injectables for tests. `idSecret` is the key
 *   license ids are derived under (see `licenseIdSecret`); without it a new
 *   license gets a random id, as it always did.
 * @returns {Promise<{record: Object, created: boolean, stale: boolean}>} Stored
 *   record, whether it was new, and whether state was refused (out of order,
 *   after a deletion, or a failed payment that nothing has paid since).
 */
export async function upsertEntitlement(kv, update, options) {
  const opts = options || {};
  const now = Number.isFinite(opts.now) ? Math.floor(opts.now) : Math.floor(Date.now() / 1000);
  const mintId = typeof opts.generateId === "function" ? opts.generateId : generateLicenseId;

  const existingId = await resolveExistingLicenseId(kv, update);
  // Money going back, and nothing else, says "only if you already know this
  // one". A refund or a dispute carries no plan, no period and no status, so a
  // license minted from one would be an empty record that entitles nothing and
  // that the real checkout, arriving afterwards, would never find. The caller
  // decides what to do about not knowing it yet: Stripe's are retried for a
  // day, as a resource Mercado Pago's API has not caught up on is.
  if (!existingId && update.requireExisting === true) {
    return { record: null, created: false, stale: true, missing: true };
  }
  const existing = existingId ? await getEntitlement(kv, existingId) : null;
  // Found through an index when there is one. Otherwise derived from the thing
  // the provider will keep naming — the subscription, or the one-off payment —
  // so two webhooks for a brand-new customer that cannot see each other's
  // writes still agree on one license instead of minting two. Random only when
  // nothing can be derived: no secret, or an update that names neither.
  const derived = opts.idSecret
    ? await deriveLicenseId(opts.idSecret, update.provider, update.subscriptionId || update.claimId || "")
    : null;
  const licenseId = (existing && existing.licenseId) || existingId || derived || mintId();

  // A license first heard of through an update that carries no status (a
  // subscription's charge that has not gone through) starts as "pending": we
  // know nothing that entitles it yet.
  const record = existing
    ? { ...existing, licenseId }
    : {
      licenseId,
      plan: "pro_monthly",
      status: "pending",
      provider: update.provider,
      customerId: null,
      subscriptionId: null,
      periodEnd: null,
      occurredAt: null,
      createdAt: now,
      updatedAt: now
    };

  // What the period was before this update touched anything, so
  // `notePeriodPayment` below can tell a payment that bought the period from
  // one that merely confirmed money for a period already held.
  const periodEndBefore = Number.isFinite(record.periodEnd) ? record.periodEnd : null;

  // Identity is order-independent: a late event may still teach us which
  // customer or subscription a license belongs to.
  applyIfPresent(record, "provider", update.provider);
  applyIfPresent(record, "customerId", update.customerId);
  applyIfPresent(record, "subscriptionId", update.subscriptionId);

  // So is money: once a payment is confirmed it stays confirmed, whatever order
  // the events arrive in. "Not paid" only holds while no confirmation has been
  // seen. Records stored before this field existed have none.
  if (update.paid === true) {
    record.paid = true;
    // When the latest payment it heard of was made, so a deletion can say
    // which payments it knew of.
    if (Number.isFinite(update.occurredAt) && !(record.paidAt >= update.occurredAt)) {
      record.paidAt = Math.floor(update.occurredAt);
    }
  } else if (update.paid === false && record.paid !== true) {
    record.paid = false;
  }
  // A payment that failed stays failed until money arrives, so the license
  // answers 403 rather than waiting for it, whatever comes in between.
  if (record.paid === true) {
    if (record.paymentFailed) {
      record.paymentFailed = false;
    }
  } else if (update.paymentFailed === true) {
    record.paymentFailed = true;
  }
  noteReversal(record, update, now);
  noteDecline(record, update);

  // A license whose payment failed stays down until money actually arrives:
  // Stripe keeps a subscription active after its delayed payment fails, and
  // those later events must not lift it back, nor set it waiting again.
  const held = record.paymentFailed === true
    && update.status !== undefined
    && update.status !== "canceled";
  // A deleted Stripe subscription never comes back, so once its deletion is on
  // record no later event changes its state, whatever its timestamp. The
  // deletion itself applies even when it arrives after a newer event.
  const ended = Number.isFinite(record.endedAt);
  if (!ended) {
    noteCharge(record, update);
  }
  const stale = ended || (!update.terminal && (held || isStaleUpdate(record, update)));
  if (!stale) {
    const before = existing ? record.status : null;
    const planBefore = record.plan;
    applyIfPresent(record, "plan", update.plan);
    applyIfPresent(record, "status", update.status);
    applyIfPresent(record, "planSource", update.planSource);
    const ownPeriodEnd = update.periodEnd !== undefined && Number.isFinite(update.periodEnd);
    // A named period only stands in for the charge when it can be the period
    // that charge bought: one that had already ended at the moment of the
    // charge cannot be. A subscription snapshot serialised before the period
    // rolled over, or an invoice line for the period that just closed, both
    // name a period that is already over, and counting an interval from the
    // charge is then the only account there is of what the money bought. A
    // period still running when it was charged (an upgrade, a proration, an
    // invoice retried after dunning) is named precisely because the charge is
    // NOT a new month.
    //
    // Both ways of getting this wrong have been live in this file, and they
    // are not equally bad. Counting an interval from every charge gave a free
    // month on every payment taken mid-cycle (CR12, fixed in ee862ce).
    // Trusting every named period took a month away from somebody who had
    // just renewed (QA round 8c, OPC2; VG-53). So the boundary goes the
    // generous way: a period ending at the very moment of the charge counts as
    // over, and may hand out a month that was already paid for, because
    // locking out a payer is the worse failure. `<` in place of `<=` there is
    // caught by OPC2.
    //
    // `Number.isFinite` on the charge time is a guard for the reader, not a
    // decision: `Math.floor(undefined)` is NaN and every comparison with NaN
    // is false, so dropping it changes no outcome and no mutant of it dies.
    // What is load-bearing is reading the period the EVENT named rather than
    // the one the record already held (OPC3 is the case that separates them: a
    // renewal collected after access had lapsed).
    const namedPeriodIsCurrent = ownPeriodEnd
      && !(Number.isFinite(update.periodEndFromCharge) && Math.floor(update.periodEnd) <= Math.floor(update.periodEndFromCharge));
    if (ownPeriodEnd) {
      const end = Math.floor(update.periodEnd);
      // `periodEndIsFloor` is set by an event that reports one billing period
      // rather than the subscription's current state: a paid invoice is
      // evidence that a period WAS paid for, so it may lengthen access and
      // must never shorten it. Everything else (a subscription event carrying
      // `current_period_end`, a preapproval's next charge date) is the
      // provider's current answer and replaces what we hold.
      if (!update.periodEndIsFloor || !Number.isFinite(record.periodEnd) || end > record.periodEnd) {
        record.periodEnd = end;
      }
    }
    // A single charge with no subscription lifecycle behind it: entitle for one
    // plan interval from the charge. Never shortens an existing period. An
    // update that changes the plan counts the latest charge again on it: a
    // charge processed before its subscription's notification was counted on
    // the default plan. Not past a period end the update sets itself (an
    // authorized subscription's next charge date).
    // ...and only when the update did NOT name one. A period the provider
    // stated is at least as good as one plan interval counted from the charge,
    // and on any payment taken mid-cycle it is far better: an upgrade, a
    // proration or a renewal retried after dunning all name the period they
    // belong to and are charged inside it, so counting an interval from the
    // charge handed out up to a whole extra month every time (QA round 8,
    // found while narrowing CR12). This is what the sentence above always
    // said and the code did not do.
    if (!namedPeriodIsCurrent) {
      const recount = record.plan !== planBefore;
      extendForCharge(record, recount ? record.chargedAt : update.periodEndFromCharge);
    }
    // The provider says access ended at a given time: it ended a subscription
    // because its money never came. Applied after the charge above so nothing
    // re-extends it. (Money given back is handled below, in any order.)
    capPeriodEnd(record, update.endsAt);
    // A subscription that ended while it was not paid up (in dunning, stopped
    // or paused, or never paid at all) keeps none of the period it was in:
    // access ends when it ended. A paid one cancelled early keeps the period it
    // paid for.
    if (record.status === "canceled"
      && (before === "past_due" || before === "suspended" || before === "pending" || record.paid === false)) {
      // A deletion is final, but what it knew of the money may not be: a
      // payment made before it can be processed after it. Keep the period it
      // would have left a paid-up subscription, for such a payment to restore.
      if (update.terminal && Number.isFinite(update.endedAt) && record.periodEnd > update.endedAt) {
        record.periodEndIfPaid = record.periodEnd;
        if (Number.isFinite(record.paidAt)) {
          record.paidAtWhenEnded = record.paidAt;
        }
      }
      capPeriodEnd(record, update.endedAt);
    }
    if (update.terminal) {
      record.endedAt = Number.isFinite(update.endedAt)
        ? Math.floor(update.endedAt)
        : (Number.isFinite(update.occurredAt) ? Math.floor(update.occurredAt) : now);
    }
    if (Number.isFinite(update.occurredAt)) {
      record.occurredAt = Math.floor(update.occurredAt);
    }
    record.updatedAt = now;
  } else if (!ended) {
    // Which plan a subscription is on does not go out of date the way its
    // state does: a subscription's charge does not say it, and is often
    // processed before the subscription's own notification, which is then
    // older than the charge. A record that holds only the default plan learns
    // it from such an update all the same, and counts its latest charge again
    // on it, or a yearly subscriber would get a month. A plan the record
    // already learned from the provider is left alone: an older update may
    // name the plan it was on before a change.
    if (update.plan && isKnownPlanSource(update.planSource) && !isKnownPlanSource(record.planSource)) {
      const planBefore = record.plan;
      record.plan = update.plan;
      record.planSource = update.planSource;
      if (record.plan !== planBefore) {
        extendForCharge(record, record.chargedAt);
      }
    }
    // Money that arrived is order-independent too: a charge still buys its
    // interval when a newer event (a pause or cancellation processed first)
    // was heard of before it. A paid subscription stopped early keeps the
    // period it paid for. Not after a deletion, which stays as it left the
    // license; a refund of the charge still ends it, below.
    extendForCharge(record, update.periodEndFromCharge);
    // And so is a paid invoice's own period. `periodEndIsFloor` means the
    // event reports a period that WAS paid for rather than the subscription's
    // current state, so it can only ever lengthen access — which is exactly
    // what makes it safe to apply out of order.
    //
    // Dropping it as stale lost a month somebody had paid for (QA round 5
    // re-attack). A refund of month one, delivered while month two's renewal
    // invoice was still in flight, ended access; the renewal that should have
    // carried it past the refund then arrived stamped a day earlier than the
    // refund, was judged an older world, and was discarded. The customer was
    // left at 403 on a month they had paid for, which is the opposite of the
    // fault the floor rule was introduced to fix.
    //
    // Never on an ended record: a deleted subscription must not be resurrected
    // by a late invoice, and the restore path below is what decides whether a
    // payment made before a deletion gives its period back.
    if (update.periodEndIsFloor === true && update.paid === true && Number.isFinite(update.periodEnd)) {
      const end = Math.floor(update.periodEnd);
      if (!Number.isFinite(record.periodEnd) || end > record.periodEnd) {
        record.periodEnd = end;
        record.updatedAt = now;
      }
    }
  }
  // A Stripe subscription deleted while no payment had been seen (or while in
  // dunning) kept none of its period. A payment confirmed afterwards but made
  // before the deletion shows it was paid up when it was cancelled, so it
  // keeps the period it paid for after all, as it would have in the order the
  // events happened: up to the deletion's own period end, and no further than
  // the period the payment paid for (an invoice's own period; a checkout's
  // plan interval from when it was paid). A payment made after the deletion
  // buys nothing.
  let restored = false;
  if (ended && update.paid === true) {
    const paidThrough = periodRestoredBy(record, update);
    if (paidThrough !== null && (!Number.isFinite(record.periodEnd) || paidThrough > record.periodEnd)) {
      record.periodEnd = paidThrough;
      record.updatedAt = now;
      restored = true;
    }
  }
  // A Mercado Pago subscription that stopped after a charge was turned down,
  // with none gone through since, keeps none of the period its authorization
  // set (Mercado Pago may leave the next charge date on it), whichever of the
  // decline and the stop is processed first. A stopped record's clock is the
  // stopped subscription's own: a charge that does not go through never moves
  // it.
  if (!ended && record.provider === "mercadopago" && record.status === "canceled") {
    endDeclinedPeriod(record, record.occurredAt);
  }
  // Which payment bought the period now held, judged against what the period
  // was before this update. Before the reversal below, which reads it.
  notePeriodPayment(record, update, periodEndBefore);
  // After everything else, so neither a late refund nor a later update (a
  // subscription's next charge date) leaves open a period whose money went
  // back.
  endReversedPeriod(record);
  if (!Number.isFinite(record.createdAt)) {
    record.createdAt = now;
  }

  if (update.paid === true) {
    await putPaid(kv, licenseId, record, update);
  }
  if (!ended && Number.isFinite(update.periodEndFromCharge)) {
    // Read again first: a later charge processed alongside this one may have
    // written its own since this record was read, and the key only moves on.
    const storedChargedAt = await readCharged(kv, licenseId);
    if (storedChargedAt === null || record.chargedAt > storedChargedAt) {
      await kv.put(chargedKey(licenseId), String(record.chargedAt));
    }
  }
  if (Number.isFinite(update.reversedChargeAt) || update.reverseLatestCharge === true) {
    await kv.put(reversedKey(licenseId), JSON.stringify({
      reversedChargeAt: record.reversedChargeAt,
      reversedAt: record.reversedAt,
      ...(typeof record.reversedPaymentId === "string" && record.reversedPaymentId
        ? { reversedPaymentId: record.reversedPaymentId }
        : {})
    }));
  }
  if ((update.terminal && !stale) || restored) {
    await kv.put(endedKey(licenseId), JSON.stringify({
      endedAt: record.endedAt,
      periodEnd: Number.isFinite(record.periodEnd) ? record.periodEnd : record.endedAt,
      ...(Number.isFinite(record.periodEndIfPaid) ? { periodEndIfPaid: record.periodEndIfPaid } : {}),
      ...(Number.isFinite(record.paidAtWhenEnded) ? { paidAtWhenEnded: record.paidAtWhenEnded } : {})
    }));
  }
  await putEntitlement(kv, record);
  await putClaimIndex(kv, update.provider, update.claimId, licenseId);
  await putPaymentIndex(kv, update.provider, update.paymentId, licenseId);
  await putSubscriptionIndex(kv, update.provider, record.subscriptionId, licenseId);

  return { record, created: !existing, stale };
}

/**
 * Strip provider-internal ids before handing an entitlement to the browser.
 * @param {Object} record Stored entitlement record.
 * @returns {Object} Client-safe view.
 */
export function toPublicEntitlement(record) {
  return {
    licenseId: record.licenseId,
    plan: record.plan,
    status: record.status,
    provider: record.provider,
    periodEnd: Number.isFinite(record.periodEnd) ? record.periodEnd : null,
    updatedAt: record.updatedAt
  };
}
