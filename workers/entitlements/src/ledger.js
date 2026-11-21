/**
 * The payment ledger in D1, behind the same get/put/delete surface as KV.
 *
 * Why this exists. The entitlement store (store.js) was written against
 * Workers KV, which has no transaction, no compare-and-swap and a limit of
 * about one write per second per key, and which is eventually consistent
 * between locations. Every webhook reads a license's record, changes it and
 * writes it back, so two events for one license processed at the same time
 * could each read the old copy and the later write erased the other's change
 * (a lost update). The first events of every new subscription arrive in the
 * same second, so that was the normal case, not a corner one. The event's
 * idempotency marker was also a separate KV write made before the work, so a
 * request that died half way left the marker and lost the event.
 *
 * What it does instead. Each webhook runs as one unit of work against D1
 * (single primary, serializable, `batch()` is one transaction):
 *
 * 1. Reads go to D1 and are remembered with the version they had. A key D1
 *    has never held is read from KV once, so records written before this
 *    change are still found (a lazy migration; nothing writes to KV any more).
 * 2. Writes are buffered in memory, and the transaction reads its own writes.
 * 3. Commit is one `batch()`: the first statement inserts a commit row only if
 *    every key read still has the version it was read at (optimistic
 *    concurrency control, read-set validation); every write is conditional on
 *    that row existing; the last statement removes the row, and its changed
 *    count says whether the transaction committed.
 * 4. On a conflict nothing was written, and the whole unit of work runs again
 *    on fresh reads, a bounded number of times with jittered backoff. Past
 *    that, it throws, and the webhook answers 500 so the provider retries.
 *
 * Because the event marker is one of the writes, it commits with the effect
 * or not at all: a retried event is either already applied (and dismissed as
 * a duplicate) or not applied (and processed). That is the inbox pattern, or
 * idempotent consumer, with the inbox in the same transaction as the state.
 *
 * Versions are a fresh random token per write, not a counter, so a key that
 * is deleted and written again can never be mistaken for the copy that was
 * read (no ABA). A delete is stored as a tombstone (a row with no value), so
 * a deleted key is not found again in the legacy KV namespace.
 *
 * Without a D1 binding nothing here is used: the worker keeps the KV store
 * exactly as before (see `runLedgerTransaction`).
 */

"use strict";

import { ensureSchema } from "./db.js";

/** How many times a unit of work runs before a conflict is given up as a 500. */
export const LEDGER_MAX_ATTEMPTS = 4;

/** Backoff before attempt n+1 is a random wait up to min(cap, base * 2^n) ms ("full jitter"). */
export const LEDGER_BACKOFF_BASE_MS = 25;
export const LEDGER_BACKOFF_CAP_MS = 400;

/**
 * Keys checked by one validation statement. Each costs two bound values and
 * D1 allows 100 per statement, with three more for the transaction id and the
 * clock.
 */
export const LEDGER_VALIDATE_CHUNK = 40;

/** The prefixes store.js keeps a license's own keys under (see its header). */
const LICENSE_FAMILY = ["lic:", "paid:", "ended:", "reversed:", "charged:"];

/** Thrown when a unit of work kept conflicting with other writers. */
export class LedgerConflictError extends Error {
  constructor(attempts) {
    super(`ledger transaction conflicted ${attempts} times`);
    this.name = "LedgerConflictError";
    this.attempts = attempts;
  }
}

/**
 * Whether the D1 ledger is in use for this environment.
 * @param {Object} env Worker env bindings.
 * @returns {boolean} True when a D1 binding is present.
 */
export function ledgerEnabled(env) {
  return Boolean(env && env.DB && typeof env.DB.prepare === "function" && typeof env.DB.batch === "function");
}

/**
 * Unix seconds from an injected clock or the real one.
 * @param {number} [now] Injected clock.
 * @returns {number} Unix seconds.
 */
function clock(now) {
  return Number.isFinite(now) ? Math.floor(now) : Math.floor(Date.now() / 1000);
}

/**
 * A fresh random token, used as a transaction id and as a write's version.
 * @returns {string} 32 hex characters.
 */
function token() {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) {
    hex += b.toString(16).padStart(2, "0");
  }
  return hex;
}

/**
 * Whether a stored row is still live at `at`.
 * @param {{expires_at: number|null}} row Ledger row.
 * @param {number} at Unix seconds.
 * @returns {boolean} True when it has no expiry or expires later.
 */
function isLive(row, at) {
  return row.expires_at === null || row.expires_at === undefined || Number(row.expires_at) > at;
}

/**
 * Turn a stored row into what a reader sees and what validation compares.
 * An expired row reads as absent and validates as absent (version null); a
 * tombstone reads as absent but keeps its version, so a write over it is seen.
 * @param {Object} row Ledger row.
 * @param {number} at Unix seconds.
 * @returns {{value: string|null, version: string|null}} Entry.
 */
function entryOf(row, at) {
  if (!isLive(row, at)) {
    return { value: null, version: null };
  }
  return { value: row.value === null || row.value === undefined ? null : String(row.value), version: String(row.version) };
}

/**
 * The keys of one license that store.js reads together, so they are fetched
 * in one query rather than five.
 * @param {string} key A key that was asked for.
 * @returns {string[]} The family, or just the key.
 */
function familyOf(key) {
  const prefix = LICENSE_FAMILY.find((p) => key.startsWith(p));
  if (!prefix) {
    return [key];
  }
  const licenseId = key.slice(prefix.length);
  return LICENSE_FAMILY.map((p) => `${p}${licenseId}`);
}

/**
 * Read keys from D1, falling back to KV for keys D1 has never held.
 * @param {Object} db D1 binding.
 * @param {Object|null} legacy KV namespace, or null.
 * @param {string[]} keys Keys to read.
 * @param {number} at Unix seconds.
 * @returns {Promise<Map<string, {value: string|null, version: string|null}>>} Entries.
 */
async function readEntries(db, legacy, keys, at) {
  const marks = keys.map((_, i) => `?${i + 1}`).join(", ");
  const result = await db
    .prepare(`SELECT key, value, version, expires_at FROM ledger_kv WHERE key IN (${marks})`)
    .bind(...keys)
    .all();
  const rows = new Map(((result && result.results) || []).map((row) => [row.key, row]));
  // Any row, even an expired one or a tombstone, means D1 owns the key: only
  // a key D1 has never held is looked for in KV.
  const missing = keys.filter((key) => !rows.has(key));
  const old = legacy ? await Promise.all(missing.map((key) => legacy.get(key))) : [];
  const fromKv = new Map(missing.map((key, i) => [key, old[i] === undefined ? null : old[i]]));
  const out = new Map();
  for (const key of keys) {
    const row = rows.get(key);
    out.set(key, row ? entryOf(row, at) : { value: fromKv.get(key) || null, version: null });
  }
  return out;
}

/**
 * A read-only view of the ledger with the KV namespace's `get`, for routes
 * that only read (claim, license, /v1/me). Strongly consistent: D1 serves
 * every read from its primary unless the Sessions API is used, and it is not.
 * @param {Object} env Worker env bindings.
 * @param {{now?: number}} [options] Injectable clock.
 * @returns {{get: function(string): Promise<string|null>}} Reader.
 */
export function ledgerReader(env, options) {
  if (!ledgerEnabled(env)) {
    return env.ENTITLEMENTS;
  }
  const at = clock(options && options.now);
  const cache = new Map();
  return {
    async get(key) {
      if (!cache.has(key)) {
        await ensureSchema(env.DB);
        const keys = familyOf(key).filter((k) => !cache.has(k));
        const read = await readEntries(env.DB, env.ENTITLEMENTS || null, keys, at);
        read.forEach((entry, k) => cache.set(k, entry));
      }
      return cache.get(key).value;
    },
    async put() {
      throw new Error("ledger writes go through runLedgerTransaction");
    },
    async delete() {
      throw new Error("ledger writes go through runLedgerTransaction");
    }
  };
}

/** One attempt of a unit of work: buffered writes over versioned reads. */
class LedgerTransaction {
  /**
   * @param {Object} db D1 binding.
   * @param {Object|null} legacy KV namespace read for keys D1 never held.
   * @param {number} at Unix seconds, for expiry.
   */
  constructor(db, legacy, at) {
    this.db = db;
    this.legacy = legacy;
    this.at = at;
    this.id = token();
    this.reads = new Map();
    this.writes = new Map();
  }

  /**
   * Read a key: this transaction's own write if it made one, else D1 (or KV
   * for a key D1 never held), remembered with its version for validation.
   * @param {string} key Key.
   * @returns {Promise<string|null>} Value or null.
   */
  async get(key) {
    if (this.writes.has(key)) {
      return this.writes.get(key).value;
    }
    if (!this.reads.has(key)) {
      const keys = familyOf(key).filter((k) => !this.reads.has(k) && !this.writes.has(k));
      const read = await readEntries(this.db, this.legacy, keys, this.at);
      read.forEach((entry, k) => this.reads.set(k, entry));
    }
    return this.reads.get(key).value;
  }

  /**
   * Buffer a write. Same options as KV: `expirationTtl` in seconds.
   * @param {string} key Key.
   * @param {string} value Value.
   * @param {{expirationTtl?: number}} [options] Options.
   * @returns {Promise<void>} Resolves at once.
   */
  async put(key, value, options) {
    const ttl = options && Number.isFinite(options.expirationTtl) ? Math.floor(options.expirationTtl) : null;
    this.writes.set(key, { value: String(value), expiresAt: ttl ? this.at + ttl : null });
  }

  /**
   * Buffer a delete (a tombstone, so the legacy KV copy stays hidden).
   * @param {string} key Key.
   * @returns {Promise<void>} Resolves at once.
   */
  async delete(key) {
    this.writes.set(key, { value: null, expiresAt: null });
  }

  /**
   * The writes worth sending: a delete of a key that was absent everywhere
   * changes nothing and is dropped (a marker set and cleared in one attempt).
   * @returns {Array<[string, {value: string|null, expiresAt: number|null}]>} Writes.
   */
  effectiveWrites() {
    return [...this.writes].filter(([key, write]) => {
      if (write.value !== null) {
        return true;
      }
      const seen = this.reads.get(key);
      return !(seen && seen.version === null && seen.value === null);
    });
  }

  /**
   * Statements that validate the read set: the first inserts the commit row
   * only if its chunk of keys is unchanged, each later one removes the row if
   * its chunk changed.
   * @returns {Object[]} Prepared statements.
   */
  validationStatements() {
    const reads = [...this.reads];
    const chunks = [];
    for (let i = 0; i < reads.length; i += LEDGER_VALIDATE_CHUNK) {
      chunks.push(reads.slice(i, i + LEDGER_VALIDATE_CHUNK));
    }
    if (!chunks.length) {
      return [this.db.prepare("INSERT INTO ledger_tx (tx_id, created_at) VALUES (?1, ?2)").bind(this.id, this.at)];
    }
    return chunks.map((chunk, index) => {
      const values = chunk.map((_, i) => `(?${i * 2 + 4}, ?${i * 2 + 5})`).join(", ");
      const changed = `SELECT 1 FROM r LEFT JOIN ledger_kv k ON k.key = r.key AND (k.expires_at IS NULL OR k.expires_at > ?2)
        WHERE k.version IS NOT r.version`;
      const sql = index === 0
        ? `INSERT INTO ledger_tx (tx_id, created_at) WITH r(key, version) AS (VALUES ${values})
           SELECT ?1, ?3 WHERE NOT EXISTS (${changed})`
        : `WITH r(key, version) AS (VALUES ${values})
           DELETE FROM ledger_tx WHERE tx_id = ?1 AND ?3 = ?3 AND EXISTS (${changed})`;
      const bound = chunk.flatMap(([key, entry]) => [key, entry.version]);
      return this.db.prepare(sql).bind(this.id, this.at, this.at, ...bound);
    });
  }

  /**
   * Try to commit. Writes nothing and returns false when another writer
   * changed a key this attempt read.
   * @returns {Promise<boolean>} True when committed (or nothing to write).
   */
  async commit() {
    const writes = this.effectiveWrites();
    if (!writes.length) {
      return true;
    }
    const statements = this.validationStatements();
    for (const [key, write] of writes) {
      statements.push(
        this.db
          .prepare(
            `INSERT INTO ledger_kv (key, value, version, expires_at, updated_at)
             SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM ledger_tx WHERE tx_id = ?3)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, version = excluded.version,
               expires_at = excluded.expires_at, updated_at = excluded.updated_at`
          )
          .bind(key, write.value, this.id, write.expiresAt, this.at)
      );
    }
    statements.push(this.db.prepare("DELETE FROM ledger_tx WHERE tx_id = ?1").bind(this.id));
    const results = await this.db.batch(statements);
    const last = results && results[results.length - 1];
    return Number(last && last.meta && last.meta.changes) === 1;
  }
}

/**
 * Wait before another attempt: a random time up to an exponentially growing
 * cap ("full jitter"), so writers that collided do not collide again in step.
 * @param {number} attempt Attempts made so far (1-based).
 * @param {{sleep?: function(number): Promise<void>, random?: function(): number}} options Injectables.
 * @returns {Promise<void>} Resolves after the wait.
 */
function backoff(attempt, options) {
  const ceiling = Math.min(LEDGER_BACKOFF_CAP_MS, LEDGER_BACKOFF_BASE_MS * 2 ** attempt);
  const random = typeof options.random === "function" ? options.random : Math.random;
  const ms = Math.floor(random() * ceiling);
  if (typeof options.sleep === "function") {
    return options.sleep(ms);
  }
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Run a unit of work against the ledger as one serializable transaction.
 *
 * `work` gets a KV-shaped object (get, put, delete) and must do all of its
 * ledger reads and writes through it. It may run more than once, so anything
 * it does besides ledger reads and writes must be safe to repeat (a read of a
 * provider's API is; sending an email would not be). If it throws, nothing it
 * wrote is kept and the error propagates.
 *
 * Without D1 the work runs once against the KV namespace itself, as before.
 *
 * @template T
 * @param {Object} env Worker env bindings.
 * @param {function(Object): Promise<T>} work The unit of work.
 * @param {{now?: number, sleep?: function(number): Promise<void>, random?: function(): number, maxAttempts?: number}} [options]
 *   Injectable clock, sleep and randomness, for tests.
 * @returns {Promise<T>} What the work returned on the attempt that committed.
 */
export async function runLedgerTransaction(env, work, options) {
  if (!ledgerEnabled(env)) {
    return work(env.ENTITLEMENTS);
  }
  const opts = options || {};
  const attempts = Number.isFinite(opts.maxAttempts) && opts.maxAttempts >= 1 ? Math.floor(opts.maxAttempts) : LEDGER_MAX_ATTEMPTS;
  await ensureSchema(env.DB);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const tx = new LedgerTransaction(env.DB, env.ENTITLEMENTS || null, clock(opts.now));
    const result = await work(tx);
    if (await tx.commit()) {
      return result;
    }
    if (attempt < attempts) {
      await backoff(attempt, opts);
    }
  }
  throw new LedgerConflictError(attempts);
}
