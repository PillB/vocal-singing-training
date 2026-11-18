/**
 * Deadlines for calls out of the worker.
 *
 * Every call to another service (the login-code email, Google's signing keys,
 * Mercado Pago's API) carries an `AbortSignal.timeout`, so a provider that
 * never answers cannot hold a request open. Each caller keeps its own default;
 * this only lets a test shorten it.
 */

"use strict";

/**
 * The deadline for one call out: the caller's `timeoutMs` when a test sets
 * one (so a test can watch a real deadline fire without waiting seconds),
 * else the default.
 * @param {{timeoutMs?: number}|undefined} options Injectables.
 * @param {number} fallback Default milliseconds.
 * @returns {number} Milliseconds.
 */
export function deadlineMs(options, fallback) {
  const ms = Number(options && options.timeoutMs);
  return Number.isFinite(ms) && ms > 0 ? ms : fallback;
}
