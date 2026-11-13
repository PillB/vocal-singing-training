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
 * a cold call reads one row and stops there unless this exact schema was never
 * created here, when it runs the `IF NOT EXISTS` statements in one batch.
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
  if (await schemaIsCurrent(db)) {
    schemaReady.add(db);
    return;
  }
  const statements = SCHEMA_STATEMENTS.map((sql) => db.prepare(sql));
  statements.push(
    db.prepare("INSERT INTO schema_meta (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO NOTHING").bind(SCHEMA_KEY, String(SCHEMA_VERSION)),
    // The number is for people reading the database. Only ever raised: while
    // a deploy rolls out, an isolate on the older code must not mark the
    // newer schema as old.
    db
      .prepare(
        `INSERT INTO schema_meta (key, value) VALUES ('version', ?1)
         ON CONFLICT(key) DO UPDATE SET value = ?1 WHERE CAST(schema_meta.value AS INTEGER) < CAST(?1 AS INTEGER)`
      )
      .bind(String(SCHEMA_VERSION))
  );
  await db.batch(statements);
  schemaReady.add(db);
}

/**
 * The `schema_meta` key that records this code's schema as created: a hash of
 * its statements. Keyed by content rather than by SCHEMA_VERSION, because
 * once the batch is skipped on a match the match has to be exact: two
 * branches that each raised the version to the same number, or a statement
 * added without raising it, would otherwise skip a table that was never
 * created, and the first payment to need it would fail. One row per schema
 * ever deployed, so an older and a newer isolate during a rollout each find
 * their own and neither reruns the batch. (FNV-1a, 32 bits: this guards
 * against accident, not an adversary.)
 * @param {string[]} statements Schema statements.
 * @returns {string} Key.
 */
export function schemaFingerprint(statements) {
  const text = statements.join("\n");
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash = Math.imul(hash ^ text.charCodeAt(i), 0x01000193) >>> 0;
  }
  return `schema:${statements.length}:${hash.toString(16).padStart(8, "0")}`;
}

const SCHEMA_KEY = schemaFingerprint(SCHEMA_STATEMENTS);

/**
 * Whether this code's schema has already been created here, so the batch can
 * be skipped: one row read on a cold isolate, where it used to be the
 * 35-statement batch with a row written every time (audit SC-1).
 * @param {Object} db D1 database binding.
 * @returns {Promise<boolean>} True when nothing needs creating.
 */
async function schemaIsCurrent(db) {
  try {
    const row = await db.prepare("SELECT 1 AS ok FROM schema_meta WHERE key = ?1").bind(SCHEMA_KEY).first();
    return Boolean(row);
  } catch {
    // No schema_meta yet, a fresh database: the batch creates it. A database
    // that is down fails the batch too, and that error is the one reported.
    return false;
  }
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
  // A caller can read a clock that is OLDER than the window already stored:
  // its request began before the boundary and reached this write after it,
  // while another request had already opened the new window. Such a caller
  // belongs to the window it finds, not to the one it would have opened —
  // counting it in its own older window would hand it an empty bucket, which
  // is a full fresh allowance every time the hour or the day turns over
  // (QA round 5 re-attack). So the stored window wins whenever it is newer,
  // and this function reports it as the window the caller is in.
  const stored = row ? Number(row.window_start) : Number.NaN;
  const effective = Number.isFinite(stored) && stored > windowStart ? stored : windowStart;
  const current = Number.isFinite(stored) && stored === effective ? Number(row.count) : 0;
  const held = Number.isFinite(current) ? current : 0;
  return {
    ok: held + step <= limit,
    count: held,
    retryAfter: effective === windowStart ? retryAfter : effective + window - at,
    windowStart: effective
  };
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
  //
  // `<` and not `<>`, so a bucket can only ever move forward in time. This is
  // belt and braces rather than the fix: the peek above adopts a newer stored
  // window, so `room.windowStart` is never behind the row by the time we get
  // here, and a mutation of this line alone fails no test. It is written as
  // the invariant anyway, because with `<>` the bug came back the moment the
  // peek was wrong — a caller reading an older clock reset the count AND
  // dragged `window_start` backwards, so the next caller with a current clock
  // saw a mismatch again and reset it once more, and one such request per
  // boundary reopened the whole allowance. With `<`, the same mistake refuses
  // the straggler instead of reopening the bucket: still wrong, but wrong in
  // the direction that costs a request rather than the write budget.
  const started = await db
    .prepare(
      `INSERT INTO rate_limits (bucket, count, window_start) VALUES (?1, ?3, ?2)
       ON CONFLICT(bucket) DO UPDATE SET count = ?3, window_start = ?2
       WHERE rate_limits.window_start < ?2`
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

/** Rows one sweep statement deletes at most. */
export const SWEEP_CHUNK_ROWS = 5000;

/**
 * Statements one table gets per sweep. Three of 5,000 rows is 15,000 a day,
 * above the events table's 10,000-a-day intake cap (events.js
 * EVENTS_DAILY_CAP), so the daily cron keeps up with the busiest table, and
 * eight tables at three each stay inside the free plan's 50 queries an
 * invocation.
 */
export const SWEEP_MAX_CHUNKS = 3;

/** The flag a sweep sets when a table could not be swept. */
export const SWEEP_FAILED_FLAG = "sweep_failed";

/**
 * What the sweep deletes, table by table: the condition and its one value.
 * @param {number} at Unix seconds.
 * @returns {Array<[string, string, number|string]>} [table, condition, ?1].
 */
function sweepTargets(at) {
  return [
    ["login_codes", "expires_at < ?1 OR consumed_at IS NOT NULL", at - 3600],
    ["sessions", "expires_at < ?1", at - 86400],
    ["rate_limits", "window_start < ?1", at - 86400],
    // Everything the statistics keep goes at the same age, exposures too:
    // the privacy page says 180 days, and an exposure holds the browser id.
    ["events", "received_at < ?1", at - EVENT_RETENTION_SECONDS],
    ["exposures", "first_at < ?1", at - EVENT_RETENTION_SECONDS],
    ["ingest_daily", "day < ?1", new Date((at - EVENT_RETENTION_SECONDS) * 1000).toISOString().slice(0, 10)],
    // Closed reports only, by `updated_at`: the clock starts when we finished
    // with it, not when it arrived, so a bug that took four months to fix is
    // not deleted two months later.
    ["reports", "status IN ('fixed', 'wontfix', 'duplicate') AND updated_at < ?1", at - CLOSED_REPORT_RETENTION_SECONDS],
    // Payment-ledger keys past their time to live (event markers, claim and
    // payment indexes); reads already treat them as gone. Tombstones and
    // license records have no expiry and are never swept. A KV copy of the
    // same key, from before the ledger moved, was written earlier with the
    // same TTL, so it has expired too and cannot show through.
    ["ledger_kv", "expires_at IS NOT NULL AND expires_at <= ?1", at]
  ];
}

/**
 * Delete one table's expired rows, a chunk at a time.
 * @param {Object} db D1 database binding.
 * @param {[string, string, number|string]} target From `sweepTargets`.
 * @returns {Promise<{deleted: number, done: boolean}>} Rows deleted, and
 *   whether the table has none left to delete.
 */
async function sweepTable(db, [table, where, bound]) {
  let deleted = 0;
  for (let chunk = 0; chunk < SWEEP_MAX_CHUNKS; chunk += 1) {
    const result = await db
      .prepare(
        `DELETE FROM ${table} WHERE rowid IN (SELECT rowid FROM ${table} WHERE ${where} LIMIT ${SWEEP_CHUNK_ROWS})`
      )
      .bind(bound)
      .run();
    const n = changedRows(result);
    deleted += n;
    if (n < SWEEP_CHUNK_ROWS) {
      return { deleted, done: true };
    }
  }
  return { deleted, done: false };
}

/**
 * Delete rows that have aged out: consumed or expired login codes, dead
 * sessions, stale rate-limit buckets, usage events, exposures and ingest
 * counters past their retention, reports we have closed and kept long
 * enough, and payment-ledger keys past their time to live.
 *
 * Each table is swept on its own, in chunks of `SWEEP_CHUNK_ROWS`. It used to
 * be one batch, which D1 runs as one transaction: one table that failed or ran
 * past the 30-second limit rolled every table back, every day, and the backlog
 * that caused it only grew (audit SW-1). A table that fails now leaves the
 * others swept and raises the `sweep_failed` health flag, and a backlog bigger
 * than one run's chunks is finished by the next runs.
 *
 * @param {Object} db D1 database binding.
 * @param {number} [now] Injected clock.
 * @param {Object} [kv] KV namespace, for the flag when D1 refuses it.
 * @returns {Promise<{deleted: Object<string, number>, failed: string[], unfinished: string[]}>}
 *   Rows deleted by table, the tables that failed, and those with rows left.
 */
export async function sweepExpired(db, now, kv) {
  const at = nowSec(now);
  const report = { deleted: {}, failed: [], unfinished: [] };
  for (const target of sweepTargets(at)) {
    try {
      const { deleted, done } = await sweepTable(db, target);
      report.deleted[target[0]] = deleted;
      if (!done) {
        report.unfinished.push(target[0]);
      }
    } catch (error) {
      console.error("sweep failed", target[0], error && error.message);
      report.failed.push(target[0]);
    }
  }
  if (report.failed.length) {
    await noteHealthFlag(db, SWEEP_FAILED_FLAG, report.failed.join(","), at, kv);
  }
  return report;
}

/**
 * How long a recorded failure is reported as current.
 *
 * Long enough that a pinger on a few-minute schedule sees it and opens its
 * issue, short enough that one transient failure does not hold the probe red
 * for a day — a probe that is always red teaches people to stop reading it.
 * The row itself is not deleted when the window passes; it is the operator's
 * record of when this last happened, and the 180-day sweep clears it.
 */
export const HEALTH_FLAG_WINDOW_SECONDS = 3600;

/** The flag a webhook sets when it could not finish. */
export const WEBHOOK_FAILED_FLAG = "webhook_failed";

/**
 * Write down that something that must not fail did.
 *
 * Never throws. It is called from a catch block on the path that is already
 * failing, so an error here would replace the real one with a worse one, and
 * the caller's own `throw` is what makes the provider retry. D1 may itself be
 * refusing — that is the case where the flag cannot be written and the probe
 * sees the D1 failure directly instead.
 *
 * @param {Object} db D1 database binding.
 * @param {string} name Flag name, a fixed string from the code.
 * @param {string} detail Short operator-facing note; never published.
 * @param {number} [now] Injected clock.
 * @param {Object} [kv] KV namespace, written instead when D1 refuses.
 * @returns {Promise<void>} Resolves whether or not it was recorded.
 */
export async function noteHealthFlag(db, name, detail, now, kv) {
  if (!name) {
    return;
  }
  const at = Number.isFinite(now) ? Math.floor(now) : Math.floor(Date.now() / 1000);
  if (db && (await writeFlagRow(db, name, detail, at))) {
    return;
  }
  // D1 itself refused, which is now the failure that matters most: the payment
  // ledger lives there, and D1's free plan refuses writes past 100,000 rows a
  // day while it keeps answering reads, so the probe's `SELECT 1` says "ok".
  // KV is a different service with a different budget, and the probe already
  // spends one KV read; the flag goes there instead, and the probe reads it.
  await writeFlagKey(kv, name, at);
}

/** KV key a health flag is kept under when D1 would not take it. */
export function healthFlagKey(name) {
  return `health:flag:${name}`;
}

/**
 * Write a flag row in D1. Never throws.
 * @returns {Promise<boolean>} Whether it was written.
 */
async function writeFlagRow(db, name, detail, at) {
  try {
    // The schema may never have been created: a deployment whose first webhook
    // is also its first use of D1 is exactly the deployment most likely to have
    // something misconfigured, so this is the last place to be fussy about the
    // cost of a CREATE TABLE IF NOT EXISTS batch. It runs only on a failure.
    await ensureSchema(db);
    await db
      .prepare(
        `INSERT INTO health_flags (name, at, detail) VALUES (?1, ?2, ?3)
         ON CONFLICT(name) DO UPDATE SET at = ?2, detail = ?3`
      )
      .bind(name, at, String(detail || "").slice(0, 200))
      .run();
    return true;
  } catch {
    return false;
  }
}

/**
 * Write a flag's time in KV, for when D1 refused it. Never throws. A day's
 * TTL: the probe reports it for an hour, and the row is no record to keep.
 * @returns {Promise<void>} Resolves whether or not it was written.
 */
async function writeFlagKey(kv, name, at) {
  if (!kv || typeof kv.put !== "function") {
    return;
  }
  try {
    await kv.put(healthFlagKey(name), String(at), { expirationTtl: 86400 });
  } catch {
    // Both stores refusing: the probe sees D1 or KV failing directly instead.
  }
}

/**
 * Read a flag, and say whether it is recent enough to still mean something.
 *
 * This is the statement the health probe already spends proving D1 answers, so
 * it must behave like one: a missing table or a refusing database throws, and
 * the probe reports that as the D1 failure it is.
 *
 * @param {Object} db D1 database binding.
 * @param {string} name Flag name.
 * @param {number} [now] Injected clock.
 * @param {number} [windowSeconds] Override the window.
 * @returns {Promise<{current: boolean, at: number|null}>} Decision.
 */
export async function readHealthFlag(db, name, now, windowSeconds) {
  const at = Number.isFinite(now) ? Math.floor(now) : Math.floor(Date.now() / 1000);
  const window = Number.isFinite(windowSeconds) && windowSeconds > 0 ? windowSeconds : HEALTH_FLAG_WINDOW_SECONDS;
  const row = await db.prepare("SELECT at FROM health_flags WHERE name = ?1").bind(name).first();
  const stamp = row && Number.isFinite(Number(row.at)) ? Number(row.at) : null;
  return { current: stamp !== null && at - stamp < window, at: stamp };
}
