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

/**
 * Usage events, exposures and ingest counters older than this are deleted by
 * `sweepExpired` (180 days). privacy.html and the guide promise this number.
 */
export const EVENT_RETENTION_SECONDS = 180 * 86400;

/**
 * A report we are done with — fixed, declined or a duplicate — is deleted by
 * `sweepExpired` this long after it was last touched (180 days, the same
 * number privacy.html gives for everything else here). An open report is kept
 * for as long as it is open: losing a bug nobody has fixed yet would be worse
 * than keeping it, and the reporter's own words are the whole value of it.
 */
export const CLOSED_REPORT_RETENTION_SECONDS = 180 * 86400;

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
 * HMAC-SHA256 a string under a secret key, as lowercase hex. Unlike a salted
 * hash with the salt in this repo, nobody can reverse it by trying every
 * input without also holding the key.
 * @param {string} key Secret key.
 * @param {string} value Text to authenticate.
 * @returns {Promise<string>} Lowercase hex digest.
 */
export async function hmacSha256Hex(key, value) {
  const encoder = new TextEncoder();
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    encoder.encode(String(key)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(String(value))));
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
 * How many rows a write actually changed.
 *
 * A guarded write — one carrying the condition the caller is really asking
 * about in its WHERE clause — is the only atomic way to ask "is this still
 * true?", and this reads its answer. An unreadable count is 0, which refuses
 * rather than allows: the safe direction when the database will not say.
 * @param {Object} result The result of a D1 `run()`.
 * @returns {number} Rows changed.
 */
export function changedRows(result) {
  const n = Number(result && result.meta && result.meta.changes);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/**
 * Whether a bucket has room, without writing anything.
 *
 * Reads are cheap and writes are the scarce thing (D1's free plan allows
 * 100,000 rows written a day and 5,000,000 read), so a caller that wants to
 * refuse a flood for free asks this first. It is also the first half of
 * `hitRateLimit` below.
 *
 * @param {Object} db D1 database binding.
 * @param {string} bucket Caller-scoped key, e.g. `login:ip:1.2.3.4`.
 * @param {number} limit Maximum hits per window.
 * @param {number} windowSeconds Window length.
 * @param {number} [now] Injected clock.
 * @param {number} [cost] How many hits the caller means to spend (default 1).
 * @returns {Promise<{ok: boolean, count: number, retryAfter: number, windowStart: number}>}
 *   Whether there is room, the count already stored, when the window turns
 *   over, and which window that is.
 */
export async function peekRateLimit(db, bucket, limit, windowSeconds, now, cost) {
  const at = nowSec(now);
  const step = Number.isFinite(cost) && cost >= 1 ? Math.floor(cost) : 1;
  const window = Math.max(1, Math.floor(windowSeconds));
  const windowStart = at - (at % window);
  const retryAfter = windowStart + window - at;
  if (step > limit) {
    return { ok: false, count: 0, retryAfter, windowStart };
  }
  const row = await db
    .prepare("SELECT count, window_start FROM rate_limits WHERE bucket = ?1")
    .bind(bucket)
    .first();
  const current = row && Number(row.window_start) === windowStart ? Number(row.count) : 0;
  const held = Number.isFinite(current) ? current : 0;
  return { ok: held + step <= limit, count: held, retryAfter, windowStart };
}

/**
 * Fixed-window rate limit backed by the `rate_limits` table.
 *
 * Fixed windows can let through up to 2x the limit across a window boundary.
 * That is fine for every limit here: they exist to stop email-bombing, code
 * guessing and a flood of reports, not to meter a paid API.
 *
 * What is NOT fine, and was the bug, is a lost update. This read the count,
 * decided, and wrote the new count back, so a hundred requests arriving
 * together each read 0 and each wrote 1, and all hundred passed a limit of ten
 * (QA round 5, QA-39). The deciding write is now a single guarded statement
 * that carries both the window and the limit in its WHERE clause, so the
 * database does the comparison and only one of two racing callers can take the
 * last slot. The read that comes first is no longer the decision: it is there
 * to refuse an already-full bucket without writing at all, and to report the
 * count.
 *
 * A refused call writes nothing. That matters beyond tidiness: the report
 * route's ceiling exists to stop a public POST spending the day's writes, and
 * a ceiling that itself wrote a row per refusal would be no ceiling.
 *
 * @param {Object} db D1 database binding.
 * @param {string} bucket Caller-scoped key, e.g. `login:ip:1.2.3.4`.
 * @param {number} limit Maximum hits per window.
 * @param {number} windowSeconds Window length.
 * @param {number} [now] Injected clock.
 * @param {number} [cost] How many hits this call spends (default 1); a call
 *   that would take the count past the limit spends nothing and is refused.
 * @returns {Promise<{ok: boolean, count: number, retryAfter: number}>} Decision.
 *   `count` is what this call believes the bucket reached; with callers racing,
 *   the stored count may be higher. Nothing decides anything on it.
 */
export async function hitRateLimit(db, bucket, limit, windowSeconds, now, cost) {
  const step = Number.isFinite(cost) && cost >= 1 ? Math.floor(cost) : 1;
  const room = await peekRateLimit(db, bucket, limit, windowSeconds, now, cost);
  if (!room.ok) {
    return { ok: false, count: room.count, retryAfter: room.retryAfter };
  }
  // A window that has turned over (or a bucket never seen) starts again at this
  // call's cost. The WHERE makes it a no-op for a row already in this window,
  // so two callers cannot both "start" it and lose each other's count.
  const started = await db
    .prepare(
      `INSERT INTO rate_limits (bucket, count, window_start) VALUES (?1, ?3, ?2)
       ON CONFLICT(bucket) DO UPDATE SET count = ?3, window_start = ?2
       WHERE rate_limits.window_start <> ?2`
    )
    .bind(bucket, room.windowStart, step)
    .run();
  if (changedRows(started) > 0) {
    return { ok: true, count: step, retryAfter: 0 };
  }
  // Already in this window: the increment carries the limit, so the row moves
  // only while there is room for this call's cost.
  const counted = await db
    .prepare(
      `UPDATE rate_limits SET count = count + ?3
       WHERE bucket = ?1 AND window_start = ?2 AND count + ?3 <= ?4`
    )
    .bind(bucket, room.windowStart, step, limit)
    .run();
  if (changedRows(counted) < 1) {
    // Somebody else took the room between the read above and this write.
    return { ok: false, count: limit, retryAfter: room.retryAfter };
  }
  return { ok: true, count: room.count + step, retryAfter: 0 };
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
 * sessions, stale rate-limit buckets, usage events, exposures and ingest
 * counters past their retention, and reports we have closed and kept long
 * enough.
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
    // Everything the statistics keep goes at the same age, exposures too:
    // the privacy page says 180 days, and an exposure holds the browser id.
    db.prepare("DELETE FROM events WHERE received_at < ?1").bind(at - EVENT_RETENTION_SECONDS),
    db.prepare("DELETE FROM exposures WHERE first_at < ?1").bind(at - EVENT_RETENTION_SECONDS),
    db
      .prepare("DELETE FROM ingest_daily WHERE day < ?1")
      .bind(new Date((at - EVENT_RETENTION_SECONDS) * 1000).toISOString().slice(0, 10)),
    // Closed reports only, by `updated_at`: the clock starts when we finished
    // with it, not when it arrived, so a bug that took four months to fix is
    // not deleted two months later.
    db
      .prepare("DELETE FROM reports WHERE status IN ('fixed', 'wontfix', 'duplicate') AND updated_at < ?1")
      .bind(at - CLOSED_REPORT_RETENTION_SECONDS)
  ]);
}
