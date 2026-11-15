/**
 * Request limits the router enforces.
 *
 * Kept out of src/index.js on purpose: the Workers runtime reads every named
 * export of the entry module as a handler or a class, and refuses to start on
 * a number ("Incorrect type for map entry 'MAX_BODY_BYTES'"), which is what
 * stopped `wrangler dev` from running the worker.
 */

"use strict";

/** Reject anything larger than 1 MiB; real webhooks are a few KB. */
export const MAX_BODY_BYTES = 1048576;

/** Longest checkout-session / payment id we will look up. */
export const MAX_SESSION_ID_LENGTH = 200;

/**
 * Providers a browser may ask /v1/claim and /v1/license about.
 *
 * One list, because it was two copies of the same two-way comparison, one in
 * each of the two routes that take a provider, and adding a rail meant
 * finding both. A
 * provider missing from here is refused with `bad_request`, so a rail whose
 * webhook is wired but whose claim is not reads as a programming mistake
 * rather than as a license that never arrives.
 */
export const CLAIMABLE_PROVIDERS = new Set(["stripe", "mercadopago", "creem"]);
