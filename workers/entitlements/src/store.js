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
 *
 * KV has no compare-and-swap, so two webhooks for one license processed at the
 * same time can each read the record, and the later write wins with the other's
 * change lost. A fact that never changes back once true is therefore also kept
 * in a key of its own that only that fact ever writes, and is read back over
 * the record, so a concurrent write of an older copy cannot lose it.
 */

"use strict";

import { generateLicenseId, periodEndForPlan } from "./license.js";

/** Idempotency markers live 30 days — well past any provider retry window. */
export const EVENT_TTL_SECONDS = 2592000;

/** Checkout-session -> license lookups live 90 days. */
export const CLAIM_TTL_SECONDS = 7776000;

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
  return record;
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
 * True when an update describes an older world than the record already holds.
 * @param {Object} record Stored entitlement record.
 * @param {Object} update Entitlement update descriptor.
 * @returns {boolean} Whether the update must not change state.
 */
export function isStaleUpdate(record, update) {
  return Number.isFinite(update.occurredAt)
    && Number.isFinite(record.occurredAt)
    && update.occurredAt < record.occurredAt;
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
 * Identity fields, whether a payment was confirmed, and the claim/subscription
 * indexes are order-independent and are still applied.
 *
 * @param {Object} kv KV namespace.
 * @param {Object} update Descriptor: provider, plan, status, customerId,
 *   subscriptionId, periodEnd, periodEndFromCharge, endsAt, endedAt, paid,
 *   claimId, planSource, occurredAt.
 * @param {{now?: number, generateId?: function(): string}} [options] Injectables for tests.
 * @returns {Promise<{record: Object, created: boolean, stale: boolean}>} Stored
 *   record, whether it was new, and whether state was refused (out of order,
 *   or a failed payment that nothing has paid since).
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

  // A license whose payment failed (recorded unpaid, then canceled) stays down
  // until money actually arrives: Stripe keeps a subscription active after its
  // delayed payment fails, and those later events must not lift it back.
  const held = record.paid === false
    && record.status === "canceled"
    && (update.status === "active" || update.status === "past_due");
  const stale = held || isStaleUpdate(record, update);
  if (!stale) {
    const before = existing ? record.status : null;
    applyIfPresent(record, "plan", update.plan);
    applyIfPresent(record, "status", update.status);
    applyIfPresent(record, "planSource", update.planSource);
    if (update.periodEnd !== undefined && Number.isFinite(update.periodEnd)) {
      record.periodEnd = Math.floor(update.periodEnd);
    }
    // A single charge with no subscription lifecycle behind it: entitle for one
    // plan interval from the charge. Never shortens an existing period.
    const charged = periodEndForPlan(record.plan, update.periodEndFromCharge);
    if (charged !== null && (!Number.isFinite(record.periodEnd) || charged > record.periodEnd)) {
      record.periodEnd = charged;
    }
    // The provider says access ended at a given time: it took the money back
    // (a refund, a chargeback), or ended a subscription that was never paid.
    // Applied after the charge above so nothing re-extends it.
    capPeriodEnd(record, update.endsAt);
    // A subscription that ended while it was not paid up (in dunning, or never
    // paid at all) keeps none of the period it was in: access ends when it
    // ended. A paid one cancelled early keeps the period it paid for.
    if (record.status === "canceled" && (before === "past_due" || before === "pending" || record.paid === false)) {
      capPeriodEnd(record, update.endedAt);
    }
    if (Number.isFinite(update.occurredAt)) {
      record.occurredAt = Math.floor(update.occurredAt);
    }
    record.updatedAt = now;
  }
  if (!Number.isFinite(record.createdAt)) {
    record.createdAt = now;
  }

  if (update.paid === true) {
    await kv.put(paidKey(licenseId), "1");
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
