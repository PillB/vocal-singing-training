/**
 * Saved practice progress.
 *
 * One row per (account, profile). The document is the browser's own progress
 * bag, stored verbatim as JSON text — the server never interprets a score or an
 * exercise id, so adding an exercise or a metric needs no migration here.
 *
 * Conflicts are resolved by revision, not by clock. The browser sends the `rev`
 * it last saw; if the stored row has moved on, the write is refused and the
 * server's copy comes back so the browser can merge and retry. Two devices
 * practising the same evening therefore cannot silently erase each other, which
 * a last-write-wins timestamp would do the moment one device's clock was off.
 *
 * Audio recordings stay in the browser's IndexedDB. They are megabytes each and
 * belong to a storage tier this one is not.
 */

"use strict";

import { nowSec } from "./db.js";

/**
 * Largest document we will store per profile.
 * The browser caps each exercise's history at 50 entries, so a heavy user's bag
 * lands in the low hundreds of KB; 512 KB leaves room without letting a bug
 * fill the free tier.
 */
export const MAX_DOC_BYTES = 524288;

/** Profiles a single account may sync. Matches the client's Pro profile cap. */
export const MAX_PROFILES = 3;

/**
 * True when a profile id is one we are willing to store.
 * @param {unknown} value Candidate id.
 * @returns {boolean} Whether it is acceptable.
 */
export function isProfileIdShape(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,40}$/.test(value);
}

/**
 * Read one profile's saved progress.
 * @param {Object} db D1 binding.
 * @param {string} accountId Account id.
 * @param {string} profileId Profile id.
 * @returns {Promise<{rev: number, doc: unknown, updatedAt: number}|null>} Stored progress or null.
 */
export async function getProgress(db, accountId, profileId) {
  const row = await db
    .prepare("SELECT rev, doc, updated_at FROM progress WHERE account_id = ?1 AND profile_id = ?2")
    .bind(accountId, profileId)
    .first();
  if (!row) {
    return null;
  }
  let doc = null;
  try {
    doc = JSON.parse(row.doc);
  } catch {
    doc = null;
  }
  return { rev: Number(row.rev), doc, updatedAt: Number(row.updated_at) };
}

/**
 * Every profile an account has synced.
 * @param {Object} db D1 binding.
 * @param {string} accountId Account id.
 * @returns {Promise<Array<{profileId: string, rev: number, updatedAt: number, sizeBytes: number}>>} Summaries.
 */
export async function listProgress(db, accountId) {
  const res = await db
    .prepare(
      `SELECT profile_id, rev, updated_at, size_bytes FROM progress
       WHERE account_id = ?1 ORDER BY updated_at DESC LIMIT ?2`
    )
    .bind(accountId, MAX_PROFILES + 1)
    .all();
  return ((res && res.results) || []).map((row) => ({
    profileId: row.profile_id,
    rev: Number(row.rev),
    updatedAt: Number(row.updated_at),
    sizeBytes: Number(row.size_bytes)
  }));
}

/**
 * Store a profile's progress if the caller is writing on top of what it read.
 *
 * `baseRev` semantics:
 *   0 or missing  -> "I believe nothing is stored yet"; refused if a row exists
 *   n             -> "I read revision n"; refused unless the stored row is at n
 *
 * @param {Object} db D1 binding.
 * @param {string} accountId Account id.
 * @param {string} profileId Profile id.
 * @param {unknown} doc Progress document.
 * @param {number} baseRev Revision the client last saw.
 * @param {number} [now] Injected clock.
 * @returns {Promise<{ok: boolean, reason?: string, rev?: number, updatedAt?: number,
 *                    server?: {rev: number, doc: unknown, updatedAt: number}}>} Result.
 */
export async function putProgress(db, accountId, profileId, doc, baseRev, now) {
  const at = nowSec(now);
  if (!isProfileIdShape(profileId)) {
    return { ok: false, reason: "bad_profile" };
  }
  if (doc === undefined || doc === null || typeof doc !== "object") {
    return { ok: false, reason: "bad_document" };
  }
  let text;
  try {
    text = JSON.stringify(doc);
  } catch {
    return { ok: false, reason: "bad_document" };
  }
  const sizeBytes = new TextEncoder().encode(text).length;
  if (sizeBytes > MAX_DOC_BYTES) {
    return { ok: false, reason: "too_large" };
  }

  const existing = await db
    .prepare("SELECT rev, doc, updated_at FROM progress WHERE account_id = ?1 AND profile_id = ?2")
    .bind(accountId, profileId)
    .first();
  const base = Math.max(0, Math.floor(Number(baseRev) || 0));

  if (!existing) {
    if (base !== 0) {
      // The client thinks it is updating a row we do not have — most likely the
      // account was reset. Send it back an empty server state to merge against.
      return { ok: false, reason: "conflict", server: { rev: 0, doc: null, updatedAt: 0 } };
    }
    const count = await db
      .prepare("SELECT COUNT(*) AS n FROM progress WHERE account_id = ?1")
      .bind(accountId)
      .first();
    if (Number(count && count.n) >= MAX_PROFILES) {
      return { ok: false, reason: "profile_limit" };
    }
    await db
      .prepare(
        `INSERT INTO progress (account_id, profile_id, rev, doc, size_bytes, updated_at)
         VALUES (?1, ?2, 1, ?3, ?4, ?5)`
      )
      .bind(accountId, profileId, text, sizeBytes, at)
      .run();
    return { ok: true, rev: 1, updatedAt: at };
  }

  if (Number(existing.rev) !== base) {
    let serverDoc = null;
    try {
      serverDoc = JSON.parse(existing.doc);
    } catch {
      serverDoc = null;
    }
    return {
      ok: false,
      reason: "conflict",
      server: { rev: Number(existing.rev), doc: serverDoc, updatedAt: Number(existing.updated_at) }
    };
  }

  const nextRev = Number(existing.rev) + 1;
  // The `rev = ?5` guard makes the update itself the compare-and-swap, so two
  // requests that both passed the read above cannot both win.
  const res = await db
    .prepare(
      `UPDATE progress SET rev = ?3, doc = ?4, size_bytes = ?6, updated_at = ?7
       WHERE account_id = ?1 AND profile_id = ?2 AND rev = ?5`
    )
    .bind(accountId, profileId, nextRev, text, base, sizeBytes, at)
    .run();
  const changes = res && res.meta ? Number(res.meta.changes) : 1;
  if (!changes) {
    const fresh = await getProgress(db, accountId, profileId);
    return { ok: false, reason: "conflict", server: fresh || { rev: 0, doc: null, updatedAt: 0 } };
  }
  return { ok: true, rev: nextRev, updatedAt: at };
}

/**
 * Delete one profile's stored progress.
 * @param {Object} db D1 binding.
 * @param {string} accountId Account id.
 * @param {string} profileId Profile id.
 * @returns {Promise<{ok: boolean}>} Result.
 */
export async function deleteProgress(db, accountId, profileId) {
  await db
    .prepare("DELETE FROM progress WHERE account_id = ?1 AND profile_id = ?2")
    .bind(accountId, profileId)
    .run();
  return { ok: true };
}
