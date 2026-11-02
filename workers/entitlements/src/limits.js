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
