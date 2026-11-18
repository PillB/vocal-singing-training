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
 * ceiling, as the report route's is (QA-40). A hit keeps its try here, unlike
 * the block's: every row the throttle writes then belongs to one of these
 * tries (the record, the two counts, and a hit's give-back), so there are at
 * most four times this an hour whatever arrives. Giving this try back too
 * let copies of one paid number, or of an unpaid voucher, from many blocks
 * write rows no budget capped (fifth review, 18 November 2026), and the
 * repository's own arithmetic is that D1's free plan stops every query for
 * the day at 100,000 rows written.
 *
 * Two hundred an hour is far above what legitimate traffic spends: a buyer
 * spends one, for the hour, from each block they poll from. It holds a walk
 * to a few thousand numbers a day, out of a sequence that every Mercado Pago
 * merchant's payments share. The price: somebody who spends the two hundred
 * holds every claim and link by a number not yet looked up back until the
 * hour turns, the payer's own included (their payment waits; nothing is
 * lost), and above two hundred buyers an hour the ceiling would hold real
 * buyers back. A subscription is claimed by its preapproval id and is never
 * held back.
 */
export const MP_CLAIM_DEPLOYMENT_LIMIT = [200, 3600];
