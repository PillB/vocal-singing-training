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
import { isTokenIssuable, licenseIdSecret, PLAN_IDS } from "./license.js";
import { changedRows, hmacSha256Hex, mintId, nowSec } from "./db.js";

/** Grant kinds an operator (or the trial flow) can create. */
export const GRANT_KINDS = ["trial", "gift", "comp"];

/** How long the free trial runs, in days, unless env overrides it. */
export const DEFAULT_TRIAL_DAYS = 7;

/** Upper bound on any single grant, so a typo cannot comp somebody for a decade. */
export const MAX_GRANT_DAYS = 3650;

/**
 * What the admin page means by "no end date".
 *
 * A grant is always a row with an `ends_at`, and that is on purpose: one shape,
 * one resolver, and revoking is one column whatever the length. So "open-ended"
 * is the longest grant we allow rather than a null end, which would need a
 * second path through `grantIsActive`, `toPublicGrant` and `resolveEntitlement`
 * — three places where a bug grants Pro forever instead of ending it.
 *
 * Ten years is indistinguishable from forever for a tester, and it is still one
 * tap to take back. `grantIsOpenEnded` is what the page reads to say so rather
 * than printing a date in 2036.
 */
export const OPEN_ENDED_DAYS = MAX_GRANT_DAYS;

/**
 * Whether a grant was handed over with no end date in mind.
 *
 * Read from its length, not from a flag: a flag would be a second source of
 * truth that an older row could not have, and the length is the thing the page
 * is really asking about.
 *
 * @param {Object} row Grant row.
 * @returns {boolean} True when it runs to the maximum we allow.
 */
export function grantIsOpenEnded(row) {
  if (!row) {
    return false;
  }
  const days = (Number(row.ends_at) - Number(row.starts_at)) / 86400;
  return Number.isFinite(days) && days >= OPEN_ENDED_DAYS;
}

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
 * The arms of the trial-length test, and how many days each one gives.
 *
 * The day counts live here and nowhere else, because this is the one
 * experiment whose treatment is money: the arm decides how much Pro an account
 * is given away. js/experiments-config.js and EXPERIMENT_PRESETS carry the same
 * key and the same arm ids so the statistics can be read, and neither carries a
 * day count — a day count in a file the browser loads is a day count somebody
 * can edit.
 *
 * The ids are words rather than numbers so that a stored result cannot be
 * misread as a length if the lengths are ever changed.
 *
 * Equal weights are assumed by `trialArmFor` below, which picks with a modulo.
 * Giving an arm a different share would need a weighted walk here and a
 * matching weight in the two registries, which test/events.test.mjs pins.
 */
export const TRIAL_ARMS = [
  { id: "seven", days: 7 },
  { id: "fourteen", days: 14 }
];

/** The experiment key. The same string appears in both registries. */
export const TRIAL_EXPERIMENT = "trial_len_2026_11";

/** How an applied arm is written on the grant row it produced. */
const TRIAL_SOURCE_PREFIX = "trial:arm:";

/**
 * Is the trial-length test running?
 *
 * Two conditions, both deliberate:
 *
 *  - `TRIAL_LEN_EXPERIMENT` is on. It is a worker setting rather than the
 *    `enabled` flag in js/experiments-config.js, because a browser must not be
 *    able to decide how long a free trial is. The client flag governs what the
 *    statistics record; this one governs what is given away.
 *  - there is a secret to key the assignment with. Without one the arm could
 *    only come from a plain hash of the account id, which anybody can compute
 *    in advance: they would grind addresses until one landed in the longer arm
 *    before ever signing up. No secret therefore means no test rather than a
 *    predictable one.
 *
 * @param {Object} env Worker env bindings.
 * @returns {boolean} True when arms are assigned.
 */
export function trialExperimentOn(env) {
  const flag = String((env && env.TRIAL_LEN_EXPERIMENT) || "").trim().toLowerCase();
  if (flag !== "1" && flag !== "on" && flag !== "true" && flag !== "yes") {
    return false;
  }
  return !!licenseIdSecret(env);
}

/**
 * Which arm an account's trial goes in.
 *
 * Keyed on the account id and not the browser id: the trial is one per account
 * (`accounts.trial_used_at`), so an arm per browser would offer one person two
 * different lengths in two browsers and `startTrial` would have to pick one
 * anyway.
 *
 * HMAC and not a bare hash, domain-separated from the licence-id derivation
 * that shares the same secret, so that neither use can be made to reveal the
 * other.
 *
 * @param {Object} env Worker env bindings.
 * @param {string} accountId Account id.
 * @returns {Promise<{id: string, days: number}|null>} The arm, or null when one
 *   cannot be derived.
 */
export async function trialArmFor(env, accountId) {
  const secret = licenseIdSecret(env);
  const id = String(accountId === undefined || accountId === null ? "" : accountId);
  if (!secret || !id) {
    return null;
  }
  const mac = await hmacSha256Hex(secret, `trial-arm:v1:${TRIAL_EXPERIMENT}:${id}`);
  const point = Number.parseInt(mac.slice(0, 8), 16);
  if (!Number.isFinite(point)) {
    return null;
  }
  return TRIAL_ARMS[point % TRIAL_ARMS.length];
}

/**
 * How long this account's trial would run, and the arm that decided it.
 *
 * With the test off this is `TRIAL_DAYS` (default seven) for everybody, which
 * is exactly today's behaviour. With it on the arm's length wins and
 * `TRIAL_DAYS` is ignored — stated in the README, because an operator who sets
 * both deserves to know which one loses.
 *
 * @param {Object} env Worker env bindings.
 * @param {string} accountId Account id.
 * @returns {Promise<{days: number, arm: string|null}>} Length and arm.
 */
export async function trialPlanFor(env, accountId) {
  const configured = Math.floor(trialSeconds(env) / 86400);
  if (!trialExperimentOn(env)) {
    return { days: configured, arm: null };
  }
  const arm = await trialArmFor(env, accountId);
  if (!arm) {
    return { days: configured, arm: null };
  }
  return { days: Math.min(Math.max(1, arm.days), MAX_GRANT_DAYS), arm: arm.id };
}

/**
 * The arm a trial grant was actually created under, read back off the row.
 *
 * The arm is written down when it is applied rather than recomputed later, and
 * this is the only reader. A recomputed arm would change its answer when the
 * secret is rotated or an arm is added, and the account would then be counted
 * in an arm it was never given; it would also invent an arm for every account
 * that trialled before the test was switched on, whose trial was the
 * configured length whatever a hash says now.
 *
 * @param {unknown} source A grant row's `source`.
 * @returns {string|null} The arm id, or null when the row names none.
 */
export function trialArmFromSource(source) {
  const raw = String(source === undefined || source === null ? "" : source);
  if (!raw.startsWith(TRIAL_SOURCE_PREFIX)) {
    return null;
  }
  const arm = raw.slice(TRIAL_SOURCE_PREFIX.length);
  return TRIAL_ARMS.some((a) => a.id === arm) ? arm : null;
}

/**
 * The `source` to store on a trial grant for an arm.
 * @param {string|null} arm Arm id, or null when the test is off.
 * @returns {string} Row value.
 */
export function trialSourceFor(arm) {
  return arm ? `${TRIAL_SOURCE_PREFIX}${arm}` : "trial";
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
    // So the page can say "no end date" instead of a date ten years out.
    openEnded: grantIsOpenEnded(row),
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

/** The states a grant can be in, as the admin list filters on them. */
export const GRANT_STATES = ["active", "scheduled", "expired", "revoked"];

/**
 * Every grant this deployment has handed out, newest first, with the address it
 * was handed to — "who holds Pro, and which kind".
 *
 * The per-account lookup answers "what does this person hold". This answers the
 * other question, the one that has no answer today: which of our testers are
 * still comped, which gifts are about to run out, who did we give something to
 * and forget. It joins `accounts` for the address because a list of account ids
 * is not something anybody can act on.
 *
 * `before`/`beforeId` page by key rather than OFFSET, with the id breaking ties
 * on the same second so a page boundary cannot repeat or skip a row.
 *
 * @param {Object} db D1 binding.
 * @param {{kind?: string, state?: string, limit?: number, before?: number,
 *          beforeId?: string, at?: number}} [options] Filters.
 * @returns {Promise<{grants: Object[], more: boolean}>} A page of grant rows,
 *   each with `email`.
 */
export async function listAllGrants(db, options) {
  const opts = options || {};
  const at = nowSec(opts.at);
  const limit = Math.min(200, Math.max(1, Math.floor(Number(opts.limit) || 50)));
  const where = [];
  const binds = [];
  if (GRANT_KINDS.includes(opts.kind)) {
    binds.push(opts.kind);
    where.push(`g.kind = ?${binds.length}`);
  }
  if (opts.state === "revoked") {
    where.push("g.revoked_at IS NOT NULL");
  } else if (opts.state === "active") {
    binds.push(at);
    where.push(`g.revoked_at IS NULL AND g.starts_at <= ?${binds.length} AND g.ends_at > ?${binds.length}`);
  } else if (opts.state === "scheduled") {
    binds.push(at);
    where.push(`g.revoked_at IS NULL AND g.starts_at > ?${binds.length}`);
  } else if (opts.state === "expired") {
    binds.push(at);
    where.push(`g.revoked_at IS NULL AND g.ends_at <= ?${binds.length}`);
  }
  if (Number.isFinite(Number(opts.before)) && Number(opts.before) > 0) {
    binds.push(Math.floor(Number(opts.before)));
    const cursor = binds.length;
    if (typeof opts.beforeId === "string" && opts.beforeId) {
      binds.push(opts.beforeId);
      where.push(`(g.created_at < ?${cursor} OR (g.created_at = ?${cursor} AND g.id < ?${binds.length}))`);
    } else {
      where.push(`g.created_at < ?${cursor}`);
    }
  }
  binds.push(limit + 1);
  const res = await db
    .prepare(
      `SELECT g.id, g.account_id, g.kind, g.plan, g.starts_at, g.ends_at, g.note, g.source,
              g.revoked_at, g.created_at, a.email AS email
       FROM grants g JOIN accounts a ON a.id = g.account_id
       ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
       ORDER BY g.created_at DESC, g.id DESC
       LIMIT ?${binds.length}`
    )
    .bind(...binds)
    .all();
  const rows = (res && res.results) || [];
  return { grants: rows.slice(0, limit), more: rows.length > limit };
}

/**
 * How many grants are in each state, by kind — the one line that says "four
 * testers comped, two gifts running out".
 * @param {Object} db D1 binding.
 * @param {number} [now] Injected clock.
 * @returns {Promise<Object<string, Object<string, number>>>} kind -> state -> count.
 */
export async function countGrants(db, now) {
  const at = nowSec(now);
  const res = await db
    .prepare(
      `SELECT kind,
              CASE WHEN revoked_at IS NOT NULL THEN 'revoked'
                   WHEN starts_at > ?1 THEN 'scheduled'
                   WHEN ends_at <= ?1 THEN 'expired'
                   ELSE 'active' END AS state,
              COUNT(*) AS n
       FROM grants GROUP BY kind, state`
    )
    .bind(at)
    .all();
  const out = {};
  for (const kind of GRANT_KINDS) {
    out[kind] = {};
    for (const state of GRANT_STATES) {
      out[kind][state] = 0;
    }
  }
  for (const row of (res && res.results) || []) {
    if (!out[row.kind]) {
      out[row.kind] = {};
    }
    out[row.kind][row.state] = Number(row.n) || 0;
  }
  return out;
}

/**
 * Start the free trial for an account.
 *
 * One per account, enforced by `accounts.trial_used_at` rather than by counting
 * grant rows, so revoking a trial grant (say, for abuse) does not silently hand
 * the account a fresh one.
 *
 * The length comes from `trialPlanFor`, so it is the configured `TRIAL_DAYS`
 * normally and the account's arm while the trial-length test runs. The arm is
 * recorded on the row it produced, which is what makes "what was this account
 * actually given" answerable later without recomputing anything.
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
  // Claim the one trial this account will ever get BEFORE writing the grant it
  // buys. `account.trial_used_at` was read before any of this, and the marker
  // used to be written after the grant, so two requests arriving together both
  // read null, both wrote a grant, and the account held two trials; five at
  // once held five (QA round 7). The part that costs money is what happens
  // next: revoking "the trial" leaves the duplicate entitling, so the account
  // still answers pro.
  //
  // A guarded UPDATE and its changed-row count is the only condition test D1
  // has that two requests cannot both pass.
  const claimed = await db
    .prepare(
      `UPDATE accounts SET trial_used_at = ?2, updated_at = ?2
       WHERE id = ?1 AND trial_used_at IS NULL`
    )
    .bind(account.id, at)
    .run();
  if (changedRows(claimed) === 0) {
    return { ok: false, reason: "trial_used" };
  }
  const plan = await trialPlanFor(env, account.id);
  try {
    const grant = await createGrant(
      db,
      {
        accountId: account.id,
        kind: "trial",
        plan: "pro_monthly",
        days: plan.days,
        source: trialSourceFor(plan.arm),
        note: null
      },
      at
    );
    return { ok: true, grant, days: plan.days, arm: plan.arm };
  } catch (error) {
    // A claim is only worth holding if it bought something, so put it back.
    // Guarded on the instant this request wrote, so a trial somebody else has
    // since started is not taken off them.
    //
    // What this does not cover is the worker being killed between the two
    // writes, which burns the trial without a grant. That is the cost of this
    // order, and it is the right way round: the old order failed by giving a
    // trial away twice, and the remedy for this one is a gift from the admin
    // page.
    await db
      .prepare("UPDATE accounts SET trial_used_at = NULL WHERE id = ?1 AND trial_used_at = ?2")
      .bind(account.id, at)
      .run();
    throw error;
  }
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
  //
  // This UPDATE is the only atomic test of "is there a use left": the SELECT
  // above is a fast path that two accounts redeeming the last use of a code at
  // the same moment both pass, because each reads the count before either
  // writes it. Its changed-row count is therefore the real answer, and ignoring
  // it is what granted a one-use code twice. The unique index on
  // (code, account) catches the same account twice; nothing but this catches
  // two different ones.
  const counted = await db
    .prepare(
      `UPDATE gift_codes SET redeemed_count = redeemed_count + 1
       WHERE code_normalized = ?1 AND redeemed_count < max_redemptions`
    )
    .bind(normalized)
    .run();
  if (changedRows(counted) < 1) {
    // Somebody else took the last use between our read and this write. Undo
    // both speculative writes, in the order that cannot leave a redemption row
    // pointing at a grant that is gone.
    await db
      .prepare("DELETE FROM gift_redemptions WHERE code_normalized = ?1 AND account_id = ?2")
      .bind(normalized, accountId)
      .run();
    await db.prepare("DELETE FROM grants WHERE id = ?1").bind(grant.id).run();
    return { ok: false, reason: "exhausted" };
  }

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
