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
 * Only distinct misses are counted: a number that names a payment gives its
 * try back, and a number the block has already looked up this hour is looked
 * up again for free (lookUpClaimId). A walk over the sequence is distinct
 * numbers that are almost all misses, while a buyer polls one number, before
 * its webhook lands and while its voucher is unpaid: counting requests let
 * the site's own retries (five POSTs per claim) lock the payer out for the
 * hour (two reviews of the WH-1 throttle, 18 November 2026). The block is the
 * IPv4 address or the IPv6 /56 (`addressBlock`).
 *
 * A subscription is never claimed by such a number (its charges are filed
 * under the 32-hex preapproval id), and the other rails' ids are random, so
 * neither is counted here.
 */
export const MP_CLAIM_IP_LIMIT = [20, 3600];

/**
 * The same misses across the whole deployment: `[limit, windowSeconds]`.
 *
 * Per-block limits stop one caller; a walk spread over many blocks (a
 * tunnel broker hands anybody a /48, which is 256 /56s) is stopped only by a
 * ceiling, as the report route's is (QA-40). Two hundred misses an hour is
 * far above what legitimate traffic spends, since a buyer only misses before
 * their webhook lands, and holds a walk to a few thousand numbers a day, out of
 * a sequence that every Mercado Pago merchant's payments share. The price: somebody who spends the two hundred holds every claim and link by
 * payment number back until the hour turns, the payer's own included (their
 * payment waits; nothing is lost). A subscription is claimed by its
 * preapproval id and is never held back.
 */
export const MP_CLAIM_DEPLOYMENT_LIMIT = [200, 3600];

/**
 * How long a claim or link refused by those budgets waits before asking again,
 * in milliseconds, one entry per retry. The request holding the block's last
 * try may be the payer's own twin (the return page sends a link and a claim
 * together), and its hit gives the try back within a few round trips to D1.
 * A walker refused for good only waits the sum, and reads; nothing is written.
 */
export const MP_CLAIM_PATIENCE_MS = [50, 150];
