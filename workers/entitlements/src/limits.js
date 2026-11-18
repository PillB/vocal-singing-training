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

/**
 * Claims and links by a Mercado Pago payment number that name no payment of
 * ours, per block of addresses: `[limit, windowSeconds]`.
 *
 * A one-off Checkout Pro payment comes back to the site with nothing but its
 * `payment_id`, which is Mercado Pago's sequential operation number, the one
 * printed on the payer's receipt. It stays that payment's claim key, because
 * there is nothing else the browser holds, so the walk is what is limited.
 *
 * Only distinct misses are counted: a number that names a payment gives the
 * block's try back, and a number the block has already looked up this hour is
 * looked up again for free (lookUpClaimId). A walk over the sequence is
 * distinct numbers that are almost all misses, while a buyer polls one
 * number, before its webhook lands and while its voucher is unpaid: counting
 * requests let the site's own retries (five POSTs per claim) lock the payer
 * out for the hour (two reviews of the WH-1 throttle, 18 November 2026). The
 * block is the IPv4 address or the IPv6 /56 (`addressBlock`).
 *
 * A subscription is never claimed by such a number (its charges are filed
 * under the 32-hex preapproval id), and the other rails' ids are random, so
 * neither is counted here.
 */
export const MP_CLAIM_IP_LIMIT = [20, 3600];

/**
 * Distinct payment numbers looked up across the whole deployment, hits
 * included: `[limit, windowSeconds]`.
 *
 * Per-block limits stop one caller; a walk spread over many blocks (a
 * tunnel broker hands anybody a /48, which is 256 /56s) is stopped only by a
 * ceiling, as the report route's is (QA-40). It also caps what the throttle
 * itself writes, because every row it writes belongs to one of these tries:
 * the number's record and the block's count (two rows each in D1's billing
 * when new, the table and its primary-key index), the ceiling's count, a
 * hit's give-back, and the sweep's deletes of the record and the block a day
 * later: at most eight billed rows a try, so 50 an hour is at most 9,600
 * rows a day, a quarter of the roughly 40,000 the events cap leaves the
 * account layer on D1's free 100,000 (README, EVENTS_DAILY_CAP). A hit keeps
 * its try here for that reason, unlike the block's; giving it back let
 * copies of one paid number, or of an unpaid voucher, from many blocks write
 * rows no budget capped, and 200 an hour would have let a walk spend 38,400
 * rows a day (fifth and sixth reviews, 18 November 2026).
 *
 * Fifty an hour is still far above what legitimate traffic spends: a buyer
 * spends one, for the hour, from each block they poll from. It holds a walk
 * to 1,200 numbers a day, out of a sequence that every Mercado Pago
 * merchant's payments share. The price: somebody who spends the fifty holds
 * every claim and link by a number not yet looked up back until the hour
 * turns, the payer's own included, and above fifty buyers an hour the
 * ceiling would hold real buyers back. A held-back claim waits and is
 * claimed later; a held-back account link is not retried by the site, which
 * is VG-83. A subscription is claimed by its preapproval id and is never held
 * back. On the Workers Paid plan, where D1 allows 500 times the writes,
 * raise it.
 */
export const MP_CLAIM_DEPLOYMENT_LIMIT = [50, 3600];
