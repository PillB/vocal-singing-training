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
 */

"use strict";

import { generateLicenseId } from "./license.js";

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
 * Read an entitlement record.
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
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
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
 * Idempotently create or update the entitlement an update descriptor refers to.
 *
 * Reuses the license id already indexed for the subscription (or for the
 * checkout session) instead of minting a new one, so a subscription keeps one
 * stable license across its whole lifetime.
 *
 * @param {Object} kv KV namespace.
 * @param {Object} update Descriptor: provider, plan, status, customerId,
 *   subscriptionId, periodEnd, claimId, planSource.
 * @param {{now?: number, generateId?: function(): string}} [options] Injectables for tests.
 * @returns {Promise<{record: Object, created: boolean}>} Stored record and whether it was new.
 */
export async function upsertEntitlement(kv, update, options) {
  const opts = options || {};
  const now = Number.isFinite(opts.now) ? Math.floor(opts.now) : Math.floor(Date.now() / 1000);
  const mintId = typeof opts.generateId === "function" ? opts.generateId : generateLicenseId;

  const existingId = await resolveExistingLicenseId(kv, update);
  const existing = existingId ? await getEntitlement(kv, existingId) : null;
  const licenseId = (existing && existing.licenseId) || existingId || mintId();

  const record = existing
    ? { ...existing, licenseId }
    : {
      licenseId,
      plan: "pro_monthly",
      status: "past_due",
      provider: update.provider,
      customerId: null,
      subscriptionId: null,
      periodEnd: null,
      createdAt: now,
      updatedAt: now
    };

  applyIfPresent(record, "provider", update.provider);
  applyIfPresent(record, "plan", update.plan);
  applyIfPresent(record, "status", update.status);
  applyIfPresent(record, "customerId", update.customerId);
  applyIfPresent(record, "subscriptionId", update.subscriptionId);
  applyIfPresent(record, "planSource", update.planSource);
  if (update.periodEnd !== undefined) {
    record.periodEnd = Number.isFinite(update.periodEnd) ? Math.floor(update.periodEnd) : record.periodEnd;
  }
  if (!Number.isFinite(record.createdAt)) {
    record.createdAt = now;
  }
  record.updatedAt = now;

  await putEntitlement(kv, record);
  await putClaimIndex(kv, update.provider, update.claimId, licenseId);
  await putSubscriptionIndex(kv, update.provider, record.subscriptionId, licenseId);

  return { record, created: !existing };
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
