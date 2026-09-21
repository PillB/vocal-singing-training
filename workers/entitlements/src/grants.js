/**
 * Grants: the single mechanism behind the free trial, gifted months, manual
 * comps and their cancellation.
 *
 * A grant is one row that says "this account has this plan from `starts_at`
 * until `ends_at`". It entitles while `revoked_at IS NULL` and now falls inside
 * that window. Nothing else is stored:
 *
 *   trial month    -> one grant, kind "trial", capped at one per account
 *   gifted month   -> one grant, kind "gift"; giving another month is another row
 *   cancel a gift  -> set `revoked_at`; that is the whole cancellation path
 *   a manual comp  -> one grant, kind "comp"
 *
 * Paid subscriptions deliberately do NOT live here. Their state is whatever the
 * provider last told the webhook, and it already lives in KV (`store.js`),
 * keyed by license id. `license_links` says which account a paid license
 * belongs to, and `resolveEntitlement` below reads both sides and answers with
 * the best access the account holds. So there is one resolver, one token, and
 * one place to revoke the things an operator hands out by hand.
 */

"use strict";

import { getEntitlement } from "./store.js";
import { isTokenIssuable, PLAN_IDS } from "./license.js";
import { mintId, nowSec } from "./db.js";

/** Grant kinds an operator (or the trial flow) can create. */
export const GRANT_KINDS = ["trial", "gift", "comp"];

/** How long the free trial runs, in days, unless env overrides it. */
export const DEFAULT_TRIAL_DAYS = 30;

/** Upper bound on any single grant, so a typo cannot comp somebody for a decade. */
export const MAX_GRANT_DAYS = 3650;

/** Gift codes use an unambiguous alphabet: no O/0, no I/1, no U (reads as V). */
export const GIFT_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTVWXYZ23456789";

/** Characters per gift-code group, and how many groups. `VOCAL-XXXX-XXXX`. */
const GIFT_GROUP_SIZE = 4;
const GIFT_GROUPS = 2;

/**
 * Trial length in seconds, from env when set.
 * @param {Object} env Worker env bindings.
 * @returns {number} Seconds.
 */
export function trialSeconds(env) {
  const raw = Number.parseInt(String(env && env.TRIAL_DAYS), 10);
  const days = Number.isFinite(raw) && raw > 0 ? Math.min(raw, MAX_GRANT_DAYS) : DEFAULT_TRIAL_DAYS;
  return days * 86400;
}

/**
 * Coerce a plan id to one we are willing to grant.
 * @param {unknown} value Candidate plan.
 * @returns {string} A valid plan id, defaulting to "pro_monthly".
 */
export function safePlan(value) {
  return PLAN_IDS.includes(value) ? String(value) : "pro_monthly";
}

/**
 * Normalize a gift code for lookup: strip everything that is not an alphabet
 * character, uppercase the rest. So `vocal-ab2c d3e4` and `VOCALAB2CD3E4`
 * are the same code, which is what someone retyping from a message needs.
 * @param {unknown} value Raw code.
 * @returns {string} Normalized code, or "" when unusable.
 */
export function normalizeGiftCode(value) {
  const raw = String(value === undefined || value === null ? "" : value).toUpperCase();
  const stripped = raw.replace(/[^A-Z0-9]/g, "");
  if (stripped.length < 8 || stripped.length > 32) {
    return "";
  }
  return stripped;
}

/**
 * Mint a fresh gift code in display form (`VOCAL-XXXX-XXXX`).
 * @returns {string} Display code.
 */
export function mintGiftCode() {
  const bytes = new Uint8Array(GIFT_GROUP_SIZE * GIFT_GROUPS);
  crypto.getRandomValues(bytes);
  const chars = Array.from(bytes, (b) => GIFT_CODE_ALPHABET[b % GIFT_CODE_ALPHABET.length]);
  const groups = [];
  for (let i = 0; i < GIFT_GROUPS; i += 1) {
    groups.push(chars.slice(i * GIFT_GROUP_SIZE, (i + 1) * GIFT_GROUP_SIZE).join(""));
  }
  return `VOCAL-${groups.join("-")}`;
}

/**
 * True when a grant row entitles right now.
 * @param {Object} row Grant row.
 * @param {number} at Unix seconds.
 * @returns {boolean} Whether it entitles.
 */
export function grantIsActive(row, at) {
  if (!row || row.revoked_at !== null && row.revoked_at !== undefined) {
    return false;
  }
  return Number(row.starts_at) <= at && Number(row.ends_at) > at;
}

/**
 * Client-safe view of a grant.
 * @param {Object} row Grant row.
 * @param {number} at Unix seconds.
 * @returns {Object} Public grant.
 */
export function toPublicGrant(row, at) {
  const revoked = row.revoked_at !== null && row.revoked_at !== undefined;
  const active = grantIsActive(row, at);
  return {
    id: row.id,
    kind: row.kind,
    plan: row.plan,
    startsAt: Number(row.starts_at),
    endsAt: Number(row.ends_at),
    note: row.note || null,
    source: row.source || null,
    revokedAt: revoked ? Number(row.revoked_at) : null,
    status: revoked ? "revoked" : active ? "active" : Number(row.ends_at) <= at ? "expired" : "scheduled"
  };
}

/**
 * Write a grant row.
 *
 * `days` is clamped, and `startsAt` defaults to now, so a gift always begins
 * the moment it is handed over rather than back-dating itself into nothing.
 *
 * @param {Object} db D1 binding.
 * @param {{accountId: string, kind: string, plan?: string, days: number,
 *          startsAt?: number, source?: string, note?: string, issuedBy?: string}} input Grant to create.
 * @param {number} [now] Injected clock.
 * @returns {Promise<Object>} The stored grant row.
 */
export async function createGrant(db, input, now) {
  const at = nowSec(now);
  const kind = GRANT_KINDS.includes(input.kind) ? input.kind : "comp";
  const plan = safePlan(input.plan);
  const days = Math.min(MAX_GRANT_DAYS, Math.max(1, Math.floor(Number(input.days) || 0)));
  const startsAt = Number.isFinite(input.startsAt) ? Math.floor(input.startsAt) : at;
  const endsAt = startsAt + days * 86400;
  const id = mintId("grant");
  await db
    .prepare(
      `INSERT INTO grants (id, account_id, kind, plan, starts_at, ends_at, source, note,
                           issued_by, revoked_at, revoked_by, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, NULL, NULL, ?10, ?10)`
    )
    .bind(
      id,
      input.accountId,
      kind,
      plan,
      startsAt,
      endsAt,
      input.source || kind,
      input.note ? String(input.note).slice(0, 200) : null,
      input.issuedBy || null,
      at
    )
    .run();
  return {
    id,
    account_id: input.accountId,
    kind,
    plan,
    starts_at: startsAt,
    ends_at: endsAt,
    source: input.source || kind,
    note: input.note || null,
    issued_by: input.issuedBy || null,
    revoked_at: null,
    revoked_by: null,
    created_at: at,
    updated_at: at
  };
}

/**
 * Revoke a grant. Idempotent: revoking an already-revoked grant reports the
 * original revocation rather than moving it.
 * @param {Object} db D1 binding.
 * @param {string} grantId Grant id.
 * @param {string} [revokedBy] Account id of the operator.
 * @param {number} [now] Injected clock.
 * @returns {Promise<{ok: boolean, reason?: string, grant?: Object}>} Result.
 */
export async function revokeGrant(db, grantId, revokedBy, now) {
  const at = nowSec(now);
  const row = await db.prepare("SELECT * FROM grants WHERE id = ?1").bind(grantId).first();
  if (!row) {
    return { ok: false, reason: "not_found" };
  }
  if (row.revoked_at !== null && row.revoked_at !== undefined) {
    return { ok: true, reason: "already_revoked", grant: row };
  }
  await db
    .prepare("UPDATE grants SET revoked_at = ?2, revoked_by = ?3, updated_at = ?2 WHERE id = ?1")
    .bind(grantId, at, revokedBy || null)
    .run();
  return { ok: true, grant: { ...row, revoked_at: at, revoked_by: revokedBy || null, updated_at: at } };
}

/**
 * Every grant an account holds, newest first.
 * @param {Object} db D1 binding.
 * @param {string} accountId Account id.
 * @param {{includeRevoked?: boolean, limit?: number}} [options] Filters.
 * @returns {Promise<Object[]>} Grant rows.
 */
export async function listGrants(db, accountId, options) {
  const opts = options || {};
  const limit = Math.min(200, Math.max(1, Math.floor(Number(opts.limit) || 50)));
  const sql = opts.includeRevoked
    ? "SELECT * FROM grants WHERE account_id = ?1 ORDER BY created_at DESC LIMIT ?2"
    : "SELECT * FROM grants WHERE account_id = ?1 AND revoked_at IS NULL ORDER BY created_at DESC LIMIT ?2";
  const res = await db.prepare(sql).bind(accountId, limit).all();
  return (res && res.results) || [];
}

/**
 * Start the free trial for an account.
 *
 * One per account, enforced by `accounts.trial_used_at` rather than by counting
 * grant rows, so revoking a trial grant (say, for abuse) does not silently hand
 * the account a fresh one.
 *
 * @param {Object} db D1 binding.
 * @param {Object} account Account row.
 * @param {Object} env Worker env bindings.
 * @param {number} [now] Injected clock.
 * @returns {Promise<{ok: boolean, reason?: string, grant?: Object}>} Result.
 */
export async function startTrial(db, account, env, now) {
  const at = nowSec(now);
  if (account.trial_used_at !== null && account.trial_used_at !== undefined) {
    return { ok: false, reason: "trial_used" };
  }
  const days = Math.floor(trialSeconds(env) / 86400);
  const grant = await createGrant(
    db,
    { accountId: account.id, kind: "trial", plan: "pro_monthly", days, source: "trial", note: null },
    at
  );
  await db
    .prepare("UPDATE accounts SET trial_used_at = ?2, updated_at = ?2 WHERE id = ?1")
    .bind(account.id, at)
    .run();
  return { ok: true, grant };
}

/**
 * Create a gift code an operator can hand out by message.
 * @param {Object} db D1 binding.
 * @param {{plan?: string, days: number, maxRedemptions?: number, note?: string,
 *          createdBy?: string, expiresAt?: number}} input Code to create.
 * @param {number} [now] Injected clock.
 * @returns {Promise<Object>} `{code, plan, days, maxRedemptions, ...}`.
 */
export async function createGiftCode(db, input, now) {
  const at = nowSec(now);
  const display = mintGiftCode();
  const normalized = normalizeGiftCode(display);
  const plan = safePlan(input.plan);
  const days = Math.min(MAX_GRANT_DAYS, Math.max(1, Math.floor(Number(input.days) || 30)));
  const maxRedemptions = Math.min(1000, Math.max(1, Math.floor(Number(input.maxRedemptions) || 1)));
  await db
    .prepare(
      `INSERT INTO gift_codes (code_normalized, code_display, plan, days, max_redemptions,
                               redeemed_count, note, created_by, expires_at, revoked_at, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5, 0, ?6, ?7, ?8, NULL, ?9)`
    )
    .bind(
      normalized,
      display,
      plan,
      days,
      maxRedemptions,
      input.note ? String(input.note).slice(0, 200) : null,
      input.createdBy || null,
      Number.isFinite(input.expiresAt) ? Math.floor(input.expiresAt) : null,
      at
    )
    .run();
  return {
    code: display,
    plan,
    days,
    maxRedemptions,
    redeemedCount: 0,
    note: input.note || null,
    expiresAt: Number.isFinite(input.expiresAt) ? Math.floor(input.expiresAt) : null,
    createdAt: at
  };
}

/**
 * Revoke a gift code so it stops being redeemable.
 *
 * Grants already created from it are left alone on purpose: taking back a month
 * somebody is already practising on is a separate, deliberate act
 * (`revokeGrant`), not a side effect of retiring a code.
 *
 * @param {Object} db D1 binding.
 * @param {string} code Code in any form.
 * @param {number} [now] Injected clock.
 * @returns {Promise<{ok: boolean, reason?: string}>} Result.
 */
export async function revokeGiftCode(db, code, now) {
  const at = nowSec(now);
  const normalized = normalizeGiftCode(code);
  if (!normalized) {
    return { ok: false, reason: "bad_code" };
  }
  const row = await db
    .prepare("SELECT code_normalized, revoked_at FROM gift_codes WHERE code_normalized = ?1")
    .bind(normalized)
    .first();
  if (!row) {
    return { ok: false, reason: "not_found" };
  }
  if (row.revoked_at !== null && row.revoked_at !== undefined) {
    return { ok: true, reason: "already_revoked" };
  }
  await db.prepare("UPDATE gift_codes SET revoked_at = ?2 WHERE code_normalized = ?1").bind(normalized, at).run();
  return { ok: true };
}

/**
 * Redeem a gift code onto an account.
 *
 * The `UNIQUE (code_normalized, account_id)` index on `gift_redemptions` is
 * what stops the same person redeeming one code twice, including two requests
 * racing each other: the second insert fails and we report `already_redeemed`
 * rather than minting a second grant.
 *
 * @param {Object} db D1 binding.
 * @param {string} accountId Account id.
 * @param {string} code Code in any form.
 * @param {number} [now] Injected clock.
 * @returns {Promise<{ok: boolean, reason?: string, grant?: Object, days?: number}>} Result.
 */
export async function redeemGiftCode(db, accountId, code, now) {
  const at = nowSec(now);
  const normalized = normalizeGiftCode(code);
  if (!normalized) {
    return { ok: false, reason: "bad_code" };
  }
  const row = await db.prepare("SELECT * FROM gift_codes WHERE code_normalized = ?1").bind(normalized).first();
  if (!row) {
    return { ok: false, reason: "not_found" };
  }
  if (row.revoked_at !== null && row.revoked_at !== undefined) {
    return { ok: false, reason: "revoked" };
  }
  if (Number.isFinite(row.expires_at) && row.expires_at !== null && Number(row.expires_at) <= at) {
    return { ok: false, reason: "expired" };
  }
  if (Number(row.redeemed_count) >= Number(row.max_redemptions)) {
    return { ok: false, reason: "exhausted" };
  }

  const grant = await createGrant(
    db,
    {
      accountId,
      kind: "gift",
      plan: row.plan,
      days: Number(row.days),
      source: `gift_code:${normalized}`,
      note: row.note,
      issuedBy: row.created_by
    },
    at
  );

  try {
    await db
      .prepare(
        `INSERT INTO gift_redemptions (id, code_normalized, account_id, grant_id, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5)`
      )
      .bind(mintId("redeem"), normalized, accountId, grant.id, at)
      .run();
  } catch {
    // The unique index rejected it: this account already redeemed this code.
    // Roll the speculative grant back so the duplicate attempt grants nothing.
    await db.prepare("DELETE FROM grants WHERE id = ?1").bind(grant.id).run();
    return { ok: false, reason: "already_redeemed" };
  }

  // Counted only after the redemption row exists, so a rejected duplicate never
  // burns one of the code's uses.
  await db
    .prepare(
      `UPDATE gift_codes SET redeemed_count = redeemed_count + 1
       WHERE code_normalized = ?1 AND redeemed_count < max_redemptions`
    )
    .bind(normalized)
    .run();

  return { ok: true, grant, days: Number(row.days) };
}

/**
 * Link a paid license to an account, so a subscription bought in one browser
 * follows the person to every other one.
 * @param {Object} db D1 binding.
 * @param {string} accountId Account id.
 * @param {string} licenseId License id from the KV store.
 * @param {string} [provider] Provider that issued it.
 * @param {number} [now] Injected clock.
 * @returns {Promise<{ok: boolean, reason?: string}>} Result.
 */
export async function linkLicense(db, accountId, licenseId, provider, now) {
  const at = nowSec(now);
  const existing = await db
    .prepare("SELECT account_id FROM license_links WHERE license_id = ?1")
    .bind(licenseId)
    .first();
  if (existing && existing.account_id !== accountId) {
    // Somebody else already claimed this subscription. Refusing is the safe
    // answer: re-pointing it would silently move a paid plan between accounts.
    return { ok: false, reason: "already_linked" };
  }
  if (existing) {
    return { ok: true, reason: "already_linked_here" };
  }
  await db
    .prepare(
      `INSERT INTO license_links (license_id, account_id, provider, created_at) VALUES (?1, ?2, ?3, ?4)`
    )
    .bind(licenseId, accountId, provider || null, at)
    .run();
  return { ok: true };
}

/**
 * License ids linked to an account.
 * @param {Object} db D1 binding.
 * @param {string} accountId Account id.
 * @returns {Promise<string[]>} License ids.
 */
export async function listLinkedLicenses(db, accountId) {
  const res = await db
    .prepare("SELECT license_id FROM license_links WHERE account_id = ?1 ORDER BY created_at DESC LIMIT 20")
    .bind(accountId)
    .all();
  return ((res && res.results) || []).map((r) => r.license_id);
}

/**
 * Resolve everything an account is entitled to into one answer.
 *
 * Reads both sides — grants in D1, paid entitlements in KV — and returns the
 * access that runs longest. A yearly plan beats a gifted month; a gifted month
 * covers the gap while a card is failing. Exactly one of these becomes the
 * license token the browser is handed.
 *
 * @param {Object} db D1 binding.
 * @param {Object} kv KV namespace.
 * @param {string} accountId Account id.
 * @param {number} [now] Injected clock.
 * @returns {Promise<{pro: boolean, plan: string|null, status: string, source: string|null,
 *                    periodEnd: number|null, provider: string|null, licenseId: string|null,
 *                    grantId: string|null, grants: Object[], paid: Object[]}>} Resolution.
 */
export async function resolveEntitlement(db, kv, accountId, now) {
  const at = nowSec(now);

  const grantRows = await listGrants(db, accountId, { includeRevoked: true, limit: 200 });
  const activeGrants = grantRows.filter((row) => grantIsActive(row, at));

  const licenseIds = await listLinkedLicenses(db, accountId);
  const paid = [];
  for (const licenseId of licenseIds) {
    const record = kv ? await getEntitlement(kv, licenseId) : null;
    if (record && isTokenIssuable(record, at)) {
      paid.push(record);
    }
  }

  /** @type {{pro: boolean, plan: string|null, status: string, source: string|null,
   *          periodEnd: number|null, provider: string|null, licenseId: string|null,
   *          grantId: string|null}} */
  let best = {
    pro: false,
    plan: null,
    status: "free",
    source: null,
    periodEnd: null,
    provider: null,
    licenseId: null,
    grantId: null
  };

  /**
   * A paid record with no period end (an open-ended subscription the provider
   * keeps renewing) outranks any dated grant, so treat it as furthest away.
   * @param {number|null} periodEnd Period end in unix seconds.
   * @returns {number} Comparable value.
   */
  const rank = (periodEnd) => (periodEnd === null ? Number.MAX_SAFE_INTEGER : periodEnd);

  for (const record of paid) {
    const periodEnd = Number.isFinite(record.periodEnd) ? record.periodEnd : null;
    if (!best.pro || rank(periodEnd) > rank(best.periodEnd)) {
      best = {
        pro: true,
        plan: record.plan,
        status: record.status,
        source: "paid",
        periodEnd,
        provider: record.provider || null,
        licenseId: record.licenseId,
        grantId: null
      };
    }
  }

  for (const row of activeGrants) {
    const endsAt = Number(row.ends_at);
    if (!best.pro || rank(endsAt) > rank(best.periodEnd)) {
      best = {
        pro: true,
        plan: row.plan,
        status: "active",
        source: row.kind,
        periodEnd: endsAt,
        provider: null,
        licenseId: null,
        grantId: row.id
      };
    }
  }

  return {
    ...best,
    grants: grantRows.map((row) => toPublicGrant(row, at)),
    paid: paid.map((record) => ({
      licenseId: record.licenseId,
      plan: record.plan,
      status: record.status,
      provider: record.provider || null,
      periodEnd: Number.isFinite(record.periodEnd) ? record.periodEnd : null
    }))
  };
}
