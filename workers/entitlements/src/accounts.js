/**
 * Accounts, identities and sessions.
 *
 * An account is one row keyed by a normalized email. How somebody proves they
 * own that email is a separate concern — an emailed code, a Google ID token,
 * anything added later — and each proof records an `identities` row. That is
 * why signing in with Google and then with an emailed code lands on the same
 * account rather than creating a second one.
 *
 * Sessions are opaque bearer tokens, not cookies. The site is served from
 * `github.io` while this API lives on a different origin, so a cookie set here
 * is a third-party cookie, and browsers no longer keep those. The browser
 * stores the token and sends it as `Authorization: Bearer`.
 */

"use strict";

import { changedRows, mintId, mintToken, normalizeEmail, nowSec, sha256Hex } from "./db.js";

/** How long a session lasts before the browser must sign in again (90 days). */
export const SESSION_TTL_SECONDS = 7776000;

/** How long an emailed login code is valid (15 minutes). */
export const LOGIN_CODE_TTL_SECONDS = 900;

/** Wrong-code attempts allowed per issued code before it is burned. */
export const LOGIN_CODE_MAX_ATTEMPTS = 5;

/** Digits in an emailed login code. */
export const LOGIN_CODE_DIGITS = 6;

/** Identity providers we accept proof from. */
export const IDENTITY_PROVIDERS = ["email", "google"];

/**
 * Mint a numeric login code.
 *
 * Rejection sampling rather than `% 10`, so every digit is equally likely — a
 * modulo bias on a 6-digit code is small but free to avoid.
 *
 * @returns {string} Zero-padded numeric code.
 */
export function mintLoginCode() {
  let out = "";
  const buf = new Uint8Array(1);
  while (out.length < LOGIN_CODE_DIGITS) {
    crypto.getRandomValues(buf);
    if (buf[0] < 250) {
      out += String(buf[0] % 10);
    }
  }
  return out;
}

/**
 * Client-safe view of an account.
 * @param {Object} row Account row.
 * @returns {Object} Public account.
 */
export function toPublicAccount(row) {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name || null,
    locale: row.locale || null,
    role: row.role || "member",
    trialUsed: row.trial_used_at !== null && row.trial_used_at !== undefined,
    createdAt: Number(row.created_at)
  };
}

/**
 * Read an account by id.
 * @param {Object} db D1 binding.
 * @param {string} accountId Account id.
 * @returns {Promise<Object|null>} Account row or null.
 */
export async function getAccountById(db, accountId) {
  if (!accountId) {
    return null;
  }
  return (await db.prepare("SELECT * FROM accounts WHERE id = ?1").bind(accountId).first()) || null;
}

/**
 * Read an account by email.
 * @param {Object} db D1 binding.
 * @param {string} email Email in any case.
 * @returns {Promise<Object|null>} Account row or null.
 */
export async function getAccountByEmail(db, email) {
  const normalized = normalizeEmail(email);
  if (!normalized) {
    return null;
  }
  return (
    (await db.prepare("SELECT * FROM accounts WHERE email_normalized = ?1").bind(normalized).first()) || null
  );
}

/**
 * Find or create the account for an email.
 *
 * The insert uses `ON CONFLICT DO NOTHING` and then re-reads, so two sign-ins
 * racing on a brand new email end on the same account instead of one of them
 * failing on the unique index.
 *
 * @param {Object} db D1 binding.
 * @param {string} email Email in any case.
 * @param {{displayName?: string, locale?: string, adminEmails?: string[]}} [options] Extras.
 * @param {number} [now] Injected clock.
 * @returns {Promise<{account: Object, created: boolean}>} Account row.
 */
export async function ensureAccount(db, email, options, now) {
  const opts = options || {};
  const at = nowSec(now);
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new Error("invalid_email");
  }
  const existing = await getAccountByEmail(db, normalized);
  if (existing) {
    // A later sign-in can fill in a display name we did not have before, but it
    // never overwrites one the person already has.
    if (opts.displayName && !existing.display_name) {
      await db
        .prepare("UPDATE accounts SET display_name = ?2, updated_at = ?3 WHERE id = ?1")
        .bind(existing.id, String(opts.displayName).slice(0, 80), at)
        .run();
      existing.display_name = String(opts.displayName).slice(0, 80);
    }
    return { account: existing, created: false };
  }
  const admins = Array.isArray(opts.adminEmails) ? opts.adminEmails : [];
  const role = admins.includes(normalized) ? "admin" : "member";
  const id = mintId("acct");
  await db
    .prepare(
      `INSERT INTO accounts (id, email, email_normalized, display_name, locale, role,
                             trial_used_at, disabled_at, created_at, updated_at)
       VALUES (?1, ?2, ?3, ?4, ?5, ?6, NULL, NULL, ?7, ?7)
       ON CONFLICT(email_normalized) DO NOTHING`
    )
    .bind(
      id,
      normalized,
      normalized,
      opts.displayName ? String(opts.displayName).slice(0, 80) : null,
      opts.locale ? String(opts.locale).slice(0, 16) : null,
      role,
      at
    )
    .run();
  const account = await getAccountByEmail(db, normalized);
  if (!account) {
    throw new Error("account_insert_failed");
  }
  return { account, created: account.id === id };
}

/**
 * Record how an account proved itself, so the same person signing in a
 * different way lands on the same account.
 * @param {Object} db D1 binding.
 * @param {string} accountId Account id.
 * @param {string} provider One of IDENTITY_PROVIDERS.
 * @param {string} subject Provider-side subject (email, or Google `sub`).
 * @param {number} [now] Injected clock.
 * @returns {Promise<void>} Resolves when recorded.
 */
export async function recordIdentity(db, accountId, provider, subject, now) {
  if (!IDENTITY_PROVIDERS.includes(provider) || !subject) {
    return;
  }
  await db
    .prepare(
      `INSERT INTO identities (id, account_id, provider, subject, created_at)
       VALUES (?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(provider, subject) DO NOTHING`
    )
    .bind(mintId("idty"), accountId, provider, String(subject).slice(0, 255), nowSec(now))
    .run();
}

/**
 * Issue a session for an account.
 * @param {Object} db D1 binding.
 * @param {string} accountId Account id.
 * @param {number} [now] Injected clock.
 * @returns {Promise<{token: string, sessionId: string, expiresAt: number}>} The token, once.
 */
export async function createSession(db, accountId, now) {
  const session = await newSession(nowSec(now));
  await insertSession(db, session, accountId).run();
  return { token: session.token, sessionId: session.sessionId, expiresAt: session.expiresAt };
}

/**
 * A fresh session's token, its hash, its id and when it ends; nothing stored.
 * @param {number} at Unix seconds.
 * @returns {Promise<{token: string, tokenHash: string, sessionId: string, at: number, expiresAt: number}>} Session.
 */
async function newSession(at) {
  const token = mintToken();
  return { token, tokenHash: await sha256Hex(token), sessionId: mintId("sess"), at, expiresAt: at + SESSION_TTL_SECONDS };
}

/**
 * The statement that stores a session, optionally only when `when` holds as
 * it runs; `when` may use ?6 onwards from `extra`.
 * @param {Object} db D1 binding.
 * @param {Object} session From `newSession`.
 * @param {string} accountId Account id.
 * @param {string} [when] SQL condition.
 * @param {unknown[]} [extra] Values for the condition.
 * @returns {Object} Prepared statement.
 */
function insertSession(db, session, accountId, when, extra) {
  return db
    .prepare(
      `INSERT INTO sessions (id, account_id, token_hash, created_at, expires_at, last_seen_at, revoked_at)
       SELECT ?1, ?2, ?3, ?4, ?5, ?4, NULL WHERE ${when || "1"}`
    )
    .bind(session.sessionId, accountId, session.tokenHash, session.at, session.expiresAt, ...(extra || []));
}

/**
 * Spend a checked login code and open a session with it, as one transaction
 * (a D1 batch, with nothing run in between): the session is written only
 * while the code is unspent, and the code is spent in the same breath. Of two
 * requests holding the same right code, one gets a session and the other
 * gets null.
 *
 * Spending the code used to come first, in a write of its own, before the
 * account, identity and session writes; any failure after it (a D1 error, the
 * worker stopped) left the person with a spent code and no session, and the
 * retry was told the code was gone (audit D1-2).
 *
 * @param {Object} db D1 binding.
 * @param {string} codeId The code's row id, from `checkLoginCode`.
 * @param {string} accountId Account id.
 * @param {number} [now] Injected clock.
 * @returns {Promise<{token: string, sessionId: string, expiresAt: number}|null>} The session, or null.
 */
export async function startSessionWithCode(db, codeId, accountId, now) {
  const session = await newSession(nowSec(now));
  const [opened] = await db.batch([
    insertSession(db, session, accountId, "EXISTS (SELECT 1 FROM login_codes WHERE id = ?6 AND consumed_at IS NULL)", [codeId]),
    db
      .prepare(
        `UPDATE login_codes SET consumed_at = ?2
         WHERE id = ?1 AND consumed_at IS NULL`
      )
      .bind(codeId, session.at)
  ]);
  if (changedRows(opened) === 0) {
    return null;
  }
  return { token: session.token, sessionId: session.sessionId, expiresAt: session.expiresAt };
}

/**
 * Resolve a bearer token to its session and account.
 *
 * `last_seen_at` is only rewritten once an hour has passed. On the free tier a
 * write per request would be the single biggest consumer of the daily write
 * budget, and nothing here needs minute-accurate activity.
 *
 * @param {Object} db D1 binding.
 * @param {string} token Bearer token.
 * @param {number} [now] Injected clock.
 * @returns {Promise<{ok: boolean, reason?: string, account?: Object, session?: Object}>} Result.
 */
export async function resolveSession(db, token, now) {
  const at = nowSec(now);
  const raw = String(token || "").trim();
  if (!raw || raw.length > 200) {
    return { ok: false, reason: "no_session" };
  }
  const tokenHash = await sha256Hex(raw);
  const session = await db.prepare("SELECT * FROM sessions WHERE token_hash = ?1").bind(tokenHash).first();
  if (!session) {
    return { ok: false, reason: "no_session" };
  }
  if (session.revoked_at !== null && session.revoked_at !== undefined) {
    return { ok: false, reason: "revoked" };
  }
  if (Number(session.expires_at) <= at) {
    return { ok: false, reason: "expired" };
  }
  const account = await getAccountById(db, session.account_id);
  if (!account) {
    return { ok: false, reason: "no_account" };
  }
  if (account.disabled_at !== null && account.disabled_at !== undefined) {
    return { ok: false, reason: "disabled" };
  }
  if (at - Number(session.last_seen_at) > 3600) {
    await db.prepare("UPDATE sessions SET last_seen_at = ?2 WHERE id = ?1").bind(session.id, at).run();
  }
  return { ok: true, account, session };
}

/**
 * Revoke one session (sign out on this device).
 * @param {Object} db D1 binding.
 * @param {string} sessionId Session id.
 * @param {number} [now] Injected clock.
 * @returns {Promise<void>} Resolves when revoked.
 */
export async function revokeSession(db, sessionId, now) {
  await db
    .prepare("UPDATE sessions SET revoked_at = ?2 WHERE id = ?1 AND revoked_at IS NULL")
    .bind(sessionId, nowSec(now))
    .run();
}

/**
 * Revoke every session an account holds (sign out everywhere).
 * @param {Object} db D1 binding.
 * @param {string} accountId Account id.
 * @param {number} [now] Injected clock.
 * @returns {Promise<void>} Resolves when revoked.
 */
export async function revokeAllSessions(db, accountId, now) {
  await db
    .prepare("UPDATE sessions SET revoked_at = ?2 WHERE account_id = ?1 AND revoked_at IS NULL")
    .bind(accountId, nowSec(now))
    .run();
}

/**
 * Issue a login code for an email and store only its hash.
 *
 * Any code still outstanding for that email is consumed first, so asking for a
 * second code invalidates the first rather than leaving two live at once.
 *
 * @param {Object} db D1 binding.
 * @param {string} email Email in any case.
 * @param {number} [now] Injected clock.
 * @returns {Promise<{code: string, expiresAt: number}>} The code, once.
 */
export async function issueLoginCode(db, email, now) {
  const at = nowSec(now);
  const normalized = normalizeEmail(email);
  if (!normalized) {
    throw new Error("invalid_email");
  }
  const code = mintLoginCode();
  const expiresAt = at + LOGIN_CODE_TTL_SECONDS;
  // One batch, so the older code is retired and the new one stored in one
  // transaction: two requests for one address used to interleave the two
  // writes and leave both codes live (audit D1-4).
  await db.batch([
    db
      .prepare("UPDATE login_codes SET consumed_at = ?2 WHERE email_normalized = ?1 AND consumed_at IS NULL")
      .bind(normalized, at),
    db
      .prepare(
        `INSERT INTO login_codes (id, email_normalized, code_hash, created_at, expires_at, consumed_at, attempts)
         VALUES (?1, ?2, ?3, ?4, ?5, NULL, 0)`
      )
      .bind(mintId("code"), normalized, await sha256Hex(`${normalized}:${code}`), at, expiresAt)
  ]);
  return { code, expiresAt };
}

/**
 * Check an emailed login code and consume it.
 *
 * A wrong guess increments `attempts`; once it reaches the limit the code is
 * consumed, so brute-forcing six digits costs a fresh email every five tries.
 *
 * @param {Object} db D1 binding.
 * @param {string} email Email in any case.
 * @param {string} code Submitted code.
 * @param {number} [now] Injected clock.
 * @returns {Promise<{ok: boolean, reason?: string}>} Result.
 */
export async function consumeLoginCode(db, email, code, now) {
  const at = nowSec(now);
  const checked = await checkLoginCode(db, email, code, at);
  if (!checked.ok) {
    return checked;
  }
  // Right, and once: whoever flips this row is the one who signs in. Without
  // the guard, five parallel submissions of the same right code signed in five
  // times, which is not what "single use" means. The sign-in route spends it
  // together with the session instead (`startSessionWithCode`).
  const consumed = await db
    .prepare("UPDATE login_codes SET consumed_at = ?2 WHERE id = ?1 AND consumed_at IS NULL")
    .bind(checked.codeId, at)
    .run();
  return changedRows(consumed) > 0 ? { ok: true } : { ok: false, reason: "no_code" };
}

/**
 * Judge an emailed login code without spending it: the newest live code for
 * the address, with one guess taken off its allowance first.
 *
 * @param {Object} db D1 binding.
 * @param {string} email Email in any case.
 * @param {string} code Submitted code.
 * @param {number} [now] Injected clock.
 * @returns {Promise<{ok: boolean, reason?: string, codeId?: string}>} Result,
 *   with the code's row id when it is right.
 */
export async function checkLoginCode(db, email, code, now) {
  const at = nowSec(now);
  const normalized = normalizeEmail(email);
  const submitted = String(code || "").replace(/\D/g, "");
  if (!normalized || submitted.length !== LOGIN_CODE_DIGITS) {
    return { ok: false, reason: "bad_code" };
  }
  const row = await db
    .prepare(
      `SELECT * FROM login_codes
       WHERE email_normalized = ?1 AND consumed_at IS NULL
       ORDER BY created_at DESC LIMIT 1`
    )
    .bind(normalized)
    .first();
  if (!row) {
    return { ok: false, reason: "no_code" };
  }
  if (Number(row.expires_at) <= at) {
    await db
      .prepare("UPDATE login_codes SET consumed_at = ?2 WHERE id = ?1 AND consumed_at IS NULL")
      .bind(row.id, at)
      .run();
    return { ok: false, reason: "expired" };
  }
  // Take a guess off the code's allowance BEFORE judging it.
  //
  // The count used to be read in the SELECT above and written back after the
  // hash was compared, so guesses arriving together all read the same number
  // and every one of them was judged: a hundred parallel wrong guesses were a
  // hundred one-in-a-million shots at somebody else's account, and the code
  // was never burned (QA round 7). Six digits is a million values, and the
  // sign-in that a lucky guess buys carries whatever that account holds. The
  // per-IP limit held in that test, so the exposure is any source with more
  // than one address.
  //
  // A guarded UPDATE and its changed-row count is the only condition test D1
  // has that two requests cannot both pass. `RETURNING` would read the new
  // count in the same statement, but it is not documented for D1, and
  // `meta.changes` is what the rest of this worker already relies on.
  const reserved = await db
    .prepare(
      `UPDATE login_codes SET attempts = attempts + 1
       WHERE id = ?1 AND consumed_at IS NULL AND attempts < ?2`
    )
    .bind(row.id, LOGIN_CODE_MAX_ATTEMPTS)
    .run();
  if (changedRows(reserved) === 0) {
    // Nothing left to spend, or the code was consumed between the read above
    // and here. One extra read, on the refused path only, so the answer says
    // which: a code somebody else already signed in with is gone, not
    // over-guessed.
    const after = await db
      .prepare("SELECT attempts, consumed_at FROM login_codes WHERE id = ?1")
      .bind(row.id)
      .first();
    const spent = !after || Number(after.attempts) >= LOGIN_CODE_MAX_ATTEMPTS;
    return { ok: false, reason: spent ? "too_many_attempts" : "no_code" };
  }
  const expected = await sha256Hex(`${normalized}:${submitted}`);
  if (expected !== row.code_hash) {
    // Wrong. If that was the last of the allowance, burn the code so no later
    // guess is judged at all, whoever sends it and however many arrive at
    // once. Guarded on the count rather than on what this request read, so the
    // guess that happens to be the fifth is the one that burns it.
    const burned = await db
      .prepare(
        `UPDATE login_codes SET consumed_at = ?2
         WHERE id = ?1 AND consumed_at IS NULL AND attempts >= ?3`
      )
      .bind(row.id, at, LOGIN_CODE_MAX_ATTEMPTS)
      .run();
    return { ok: false, reason: changedRows(burned) > 0 ? "too_many_attempts" : "bad_code" };
  }
  return { ok: true, codeId: row.id };
}

/**
 * Emails that get the admin role on first sign-in, from `ADMIN_EMAILS`.
 * @param {Object} env Worker env bindings.
 * @returns {string[]} Normalized emails.
 */
export function adminEmails(env) {
  const raw = env && typeof env.ADMIN_EMAILS === "string" ? env.ADMIN_EMAILS : "";
  return raw
    .split(",")
    .map((part) => normalizeEmail(part))
    .filter(Boolean);
}

/**
 * True when an account may use the admin routes.
 *
 * Checks the stored role AND the current `ADMIN_EMAILS`, so removing an email
 * from the worker's configuration takes admin away immediately rather than
 * waiting for a row to be edited by hand.
 *
 * @param {Object} account Account row.
 * @param {Object} env Worker env bindings.
 * @returns {boolean} Whether the account is an admin.
 */
export function isAdmin(account, env) {
  if (!account) {
    return false;
  }
  const allowed = adminEmails(env);
  if (!allowed.length) {
    return false;
  }
  return allowed.includes(String(account.email_normalized || account.email || "").toLowerCase());
}
