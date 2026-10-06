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
 *   sub:<provider>:<subscriptionId>       -> licenseId
 *   paid:<licenseId>                      -> "1"        (a payment was confirmed)
 *   ended:<licenseId>                     -> {endedAt, periodEnd} (subscription deleted)
 *   reversed:<licenseId>                  -> {reversedChargeAt, reversedAt} (money given back)
 *   charged:<licenseId>                   -> chargedAt  (latest charge that went through)
 *
 * KV has no compare-and-swap, so two webhooks for one license processed at the
 * same time can each read the record, and the later write wins with the other's
 * change lost. A fact that never changes back once true (a confirmed payment, a
 * deletion, a charge that went through or money given back, the last two only
 * ever moving on to a later charge) is therefore also kept in a key of its own
 * that only that fact ever writes, and is read back over the record, so a
 * concurrent write of an older copy cannot lose it. KV is also eventually
 * consistent, so another edge location may not see such a key for up to about
 * a minute: the fact is then late, not lost. Changes that are not one-way (an
 * ordinary status or period update) can still be lost that way. The charge's
 * key is read again just before it is written and only ever moves on to a
 * later charge, so an earlier charge processed alongside a later one sets it
 * back only when the later one's write lands in the instant between that read
 * and that write, or at an edge location that has not seen the later one yet.
 * The refund's key is written from the record as it was read, so the refund
 * of a later charge processed at the same moment as the refund of an earlier
 * one can still be lost. Worse, the first two events for a new license
 * processed at once (a checkout and its subscription's first event) can each
 * find no license and mint one: the claim then points at one record and the
 * subscription index, which every later event follows, at the other, so the
 * claimed copy never hears of a renewal or a cancellation.
 * Closing all of that needs a single writer per license (a Durable Object, or a
 * D1 row updated conditionally), which this store does not have.
 */

"use strict";

import { generateLicenseId, periodEndForPlan } from "./license.js";

/** Idempotency markers live 30 days — well past any provider retry window. */
export const EVENT_TTL_SECONDS = 2592000;

/** Checkout-session -> license lookups live 90 days. */
export const CLAIM_TTL_SECONDS = 7776000;

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
  if (record && record.paid === false && (await kv.get(paidKey(licenseId)))) {
    record.paid = true;
  }
  // Likewise a subscription's record that does not show its deletion.
  if (record && record.subscriptionId && !Number.isFinite(record.endedAt)) {
    const ended = await readEnded(kv, licenseId);
    if (ended) {
      record.status = "canceled";
      record.endedAt = ended.endedAt;
      capPeriodEnd(record, ended.periodEnd);
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
  // And money given back: only Mercado Pago reports it.
  if (record && record.provider === "mercadopago") {
    const reversal = await readReversal(kv, licenseId);
    if (reversal) {
      noteReversal(record, reversal, reversal.reversedAt);
      endReversedPeriod(record);
    }
  }
  return record;
}

/**
 * Read the marker a deleted subscription left on its license.
 * @param {Object} kv KV namespace.
 * @param {string} licenseId Opaque license id.
 * @returns {Promise<{endedAt: number, periodEnd: number}|null>} Marker or null.
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
  return getLicenseIdForClaim(kv, update.provider, update.claimId);
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
 * @param {number} now Unix seconds, for a reversal that does not say when.
 * @returns {void}
 */
function noteReversal(record, update, now) {
  if (!Number.isFinite(update.reversedChargeAt)) {
    return;
  }
  const chargedAt = Math.floor(update.reversedChargeAt);
  const at = Number.isFinite(update.reversedAt) ? Math.floor(update.reversedAt) : now;
  if (!Number.isFinite(record.reversedChargeAt) || chargedAt > record.reversedChargeAt
    || (chargedAt === record.reversedChargeAt && at < record.reversedAt)) {
    record.reversedChargeAt = chargedAt;
    record.reversedAt = at;
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
 * End the period when the money went back, if the reversed charge is what
 * paid for it. A period running well past that charge's interval was paid for
 * by a later charge, so the refund of an earlier month leaves it alone. The
 * interval is counted on the plan the record holds now, which a subscription's
 * own notification may only have taught it after the refund arrived.
 * @param {Object} record Record being built.
 * @returns {void}
 */
function endReversedPeriod(record) {
  if (!Number.isFinite(record.reversedChargeAt) || !Number.isFinite(record.reversedAt)) {
    return;
  }
  const paidThrough = periodEndForPlan(record.plan, record.reversedChargeAt);
  if (paidThrough === null || !Number.isFinite(record.periodEnd)
    || record.periodEnd <= paidThrough + REVERSAL_SLACK_SECONDS) {
    capPeriodEnd(record, record.reversedAt);
  }
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
 * say its plan.
 *
 * @param {Object} kv KV namespace.
 * @param {Object} update Descriptor: provider, plan, status, customerId,
 *   subscriptionId, periodEnd, periodEndFromCharge, endsAt, endedAt, paid,
 *   paymentFailed, reversedAt, reversedChargeAt, terminal, claimId, planSource,
 *   occurredAt.
 * @param {{now?: number, generateId?: function(): string}} [options] Injectables for tests.
 * @returns {Promise<{record: Object, created: boolean, stale: boolean}>} Stored
 *   record, whether it was new, and whether state was refused (out of order,
 *   after a deletion, or a failed payment that nothing has paid since).
 */
export async function upsertEntitlement(kv, update, options) {
  const opts = options || {};
  const now = Number.isFinite(opts.now) ? Math.floor(opts.now) : Math.floor(Date.now() / 1000);
  const mintId = typeof opts.generateId === "function" ? opts.generateId : generateLicenseId;

  const existingId = await resolveExistingLicenseId(kv, update);
  const existing = existingId ? await getEntitlement(kv, existingId) : null;
  const licenseId = (existing && existing.licenseId) || existingId || mintId();

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
    if (ownPeriodEnd) {
      record.periodEnd = Math.floor(update.periodEnd);
    }
    // A single charge with no subscription lifecycle behind it: entitle for one
    // plan interval from the charge. Never shortens an existing period. An
    // update that changes the plan counts the latest charge again on it: a
    // charge processed before its subscription's notification was counted on
    // the default plan. Not past a period end the update sets itself (an
    // authorized subscription's next charge date).
    const recount = record.plan !== planBefore && !ownPeriodEnd;
    extendForCharge(record, recount ? record.chargedAt : update.periodEndFromCharge);
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
    // Money that arrived is order-independent too: a charge still buys its
    // interval when a newer event (a pause or cancellation processed first)
    // was heard of before it. A paid subscription stopped early keeps the
    // period it paid for. Not after a deletion, which stays as it left the
    // license; a refund of the charge still ends it, below.
    extendForCharge(record, update.periodEndFromCharge);
  }
  // After everything else, so neither a late refund nor a later update (a
  // subscription's next charge date) leaves open a period whose money went
  // back.
  endReversedPeriod(record);
  if (!Number.isFinite(record.createdAt)) {
    record.createdAt = now;
  }

  if (update.paid === true) {
    await kv.put(paidKey(licenseId), "1");
  }
  if (!ended && Number.isFinite(update.periodEndFromCharge)) {
    // Read again first: a later charge processed alongside this one may have
    // written its own since this record was read, and the key only moves on.
    const storedChargedAt = await readCharged(kv, licenseId);
    if (storedChargedAt === null || record.chargedAt > storedChargedAt) {
      await kv.put(chargedKey(licenseId), String(record.chargedAt));
    }
  }
  if (Number.isFinite(update.reversedChargeAt)) {
    await kv.put(reversedKey(licenseId), JSON.stringify({
      reversedChargeAt: record.reversedChargeAt,
      reversedAt: record.reversedAt
    }));
  }
  if (update.terminal && !stale) {
    await kv.put(endedKey(licenseId), JSON.stringify({
      endedAt: record.endedAt,
      periodEnd: Number.isFinite(record.periodEnd) ? record.periodEnd : record.endedAt
    }));
  }
  await putEntitlement(kv, record);
  await putClaimIndex(kv, update.provider, update.claimId, licenseId);
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
