/**
 * D1 access helpers: schema bootstrap, id minting, hashing and rate limiting.
 *
 * Everything takes the D1 binding as its first argument (never a global), the
 * same rule `store.js` follows for KV, so the whole module is testable against
 * a small `node:sqlite` adapter.
 */

"use strict";

import { bytesToBase64Url } from "./license.js";
import { SCHEMA_STATEMENTS, SCHEMA_VERSION } from "./schema.js";

/** Isolate-local memo so a warm worker does not re-check the schema per request. */
let schemaReady = new WeakSet();

/** Usage events older than this are deleted by `sweepExpired` (180 days). */
export const EVENT_RETENTION_SECONDS = 180 * 86400;

/**
 * Current time in unix seconds.
 * @param {number} [nowSeconds] Injected clock, for tests.
 * @returns {number} Unix seconds.
 */
export function nowSec(nowSeconds) {
  return Number.isFinite(nowSeconds) ? Math.floor(nowSeconds) : Math.floor(Date.now() / 1000);
}

/**
 * Mint a random, URL-safe id with a readable prefix.
 * @param {string} prefix Short prefix, e.g. "acct".
 * @param {number} [bytes] Entropy in bytes (default 16 = 128 bits).
 * @returns {string} `prefix_<base64url>`.
 */
export function mintId(prefix, bytes) {
  const size = Number.isFinite(bytes) && bytes > 0 ? Math.floor(bytes) : 16;
  const raw = new Uint8Array(size);
  crypto.getRandomValues(raw);
  return `${prefix}_${bytesToBase64Url(raw)}`;
}

/**
 * Mint an opaque bearer token: 32 random bytes as base64url.
 * Shown to the browser once; only its hash is stored.
 * @returns {string} 43-character token.
 */
export function mintToken() {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  return bytesToBase64Url(raw);
}

/**
 * SHA-256 a string into lowercase hex.
 * Used for session tokens and login codes so the database never holds the
 * value a caller could replay.
 * @param {string} value Text to hash.
 * @returns {Promise<string>} Lowercase hex digest.
 */
export async function sha256Hex(value) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(value)));
  const bytes = new Uint8Array(digest);
  let hex = "";
  for (let i = 0; i < bytes.length; i += 1) {
    hex += bytes[i].toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Create every table and index if they are missing.
 *
 * Cheap to call: after the first success in this isolate it is a no-op, and
 * even a cold call is a handful of `IF NOT EXISTS` statements in one batch.
 *
 * @param {Object} db D1 database binding.
 * @returns {Promise<void>} Resolves once the schema exists.
 */
export async function ensureSchema(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new Error("D1 binding DB is not configured");
  }
  if (schemaReady.has(db)) {
    return;
  }
  const statements = SCHEMA_STATEMENTS.map((sql) => db.prepare(sql));
  statements.push(
    db
      .prepare("INSERT INTO schema_meta (key, value) VALUES ('version', ?1)\n         ON CONFLICT(key) DO UPDATE SET value = ?1")
      .bind(String(SCHEMA_VERSION))
  );
  await db.batch(statements);
  schemaReady.add(db);
}

/**
 * Forget the isolate-local "schema is ready" memo. Test-only helper.
 * @returns {void}
 */
export function resetSchemaMemo() {
  schemaReady = new WeakSet();
}

/**
 * Normalize an email for lookup and uniqueness.
 *
 * Lowercased and trimmed only. Deliberately does NOT strip dots or `+tags`:
 * treating `a.b@gmail.com` and `ab@gmail.com` as one account is a Gmail-only
 * rule that quietly breaks every other provider.
 *
 * @param {unknown} value Raw email.
 * @returns {string} Normalized email, or "" when unusable.
 */
export function normalizeEmail(value) {
  const raw = String(value === undefined || value === null ? "" : value).trim().toLowerCase();
  if (!raw || raw.length > 254) {
    return "";
  }
  // Deliberately permissive: one @, something either side, a dot in the domain,
  // no whitespace. Real validation is "the code we emailed arrived".
  if (!/^[^\s@]+@[^\s@.]+(\.[^\s@.]+)+$/.test(raw)) {
    return "";
  }
  return raw;
}

/**
 * Fixed-window rate limit backed by the `rate_limits` table.
 *
 * Fixed windows can let through up to 2x the limit across a window boundary.
 * That is fine here: these limits exist to stop email-bombing and code
 * guessing, not to meter a paid API.
 *
 * @param {Object} db D1 database binding.
 * @param {string} bucket Caller-scoped key, e.g. `login:ip:1.2.3.4`.
 * @param {number} limit Maximum hits per window.
 * @param {number} windowSeconds Window length.
 * @param {number} [now] Injected clock.
 * @returns {Promise<{ok: boolean, count: number, retryAfter: number}>} Decision.
 */
export async function hitRateLimit(db, bucket, limit, windowSeconds, now) {
  const at = nowSec(now);
  const windowStart = at - (at % Math.max(1, Math.floor(windowSeconds)));
  const row = await db
    .prepare("SELECT count, window_start FROM rate_limits WHERE bucket = ?1")
    .bind(bucket)
    .first();
  if (!row || Number(row.window_start) !== windowStart) {
    await db
      .prepare(
        `INSERT INTO rate_limits (bucket, count, window_start) VALUES (?1, 1, ?2)
         ON CONFLICT(bucket) DO UPDATE SET count = 1, window_start = ?2`
      )
      .bind(bucket, windowStart)
      .run();
    return { ok: true, count: 1, retryAfter: 0 };
  }
  const count = Number(row.count) + 1;
  if (count > limit) {
    return { ok: false, count: Number(row.count), retryAfter: windowStart + windowSeconds - at };
  }
  await db
    .prepare("UPDATE rate_limits SET count = ?2 WHERE bucket = ?1")
    .bind(bucket, count)
    .run();
  return { ok: true, count, retryAfter: 0 };
}

/**
 * Best-effort caller identity for rate limiting.
 * Cloudflare sets `cf-connecting-ip` itself, so it cannot be spoofed by the
 * client the way `x-forwarded-for` can.
 * @param {Request} request Incoming request.
 * @returns {string} An ip-ish string, or "unknown".
 */
export function callerIp(request) {
  try {
    return request.headers.get("cf-connecting-ip") || "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * Delete rows that have aged out: consumed or expired login codes, dead
 * sessions, stale rate-limit buckets and usage events past their retention.
 *
 * Called opportunistically (never on the hot path of a login) so the free tier
 * is not slowly filled with garbage.
 *
 * @param {Object} db D1 database binding.
 * @param {number} [now] Injected clock.
 * @returns {Promise<void>} Resolves when done.
 */
export async function sweepExpired(db, now) {
  const at = nowSec(now);
  await db.batch([
    db.prepare("DELETE FROM login_codes WHERE expires_at < ?1 OR consumed_at IS NOT NULL").bind(at - 3600),
    db.prepare("DELETE FROM sessions WHERE expires_at < ?1").bind(at - 86400),
    db.prepare("DELETE FROM rate_limits WHERE window_start < ?1").bind(at - 86400),
    // Usage events are only worth keeping as long as an experiment reads
    // them; exposures are one small row per browser and stay.
    db.prepare("DELETE FROM events WHERE received_at < ?1").bind(at - EVENT_RETENTION_SECONDS)
  ]);
}
