/**
 * Checkouts the worker opens itself, bound to the account that asked, and the
 * billing portal a subscriber cancels from.
 *
 * Why this exists (VG-83). With a static payment link nothing ties the
 * purchase to the person who was signed in when they paid: the page has to
 * link it on the way back, and when the provider's webhook lands after the
 * buyer is back — which Creem and Stripe both document as ordinary — the one
 * link attempt answered "pending", nothing retried it, and the next page load
 * dropped the Pro the buyer had just paid for. What every serious
 * subscription integration does instead is bind the purchase at checkout:
 * the server creates the checkout for an authenticated user, puts its own
 * reference on it, and links the purchase inside the webhook, so the order in
 * which the browser and the webhook arrive stops mattering.
 *
 * Here that reference is `request_id`, which Creem's create-checkout call
 * takes and its `checkout.completed` event carries back on the checkout
 * object (docs.creem.io, API reference, CreateCheckoutRequest / CheckoutEntity,
 * read 21 November 2026). Three rules keep it from becoming a way to take
 * somebody else's purchase:
 *
 * - The reference is minted here, 128 random bits, never by the browser.
 * - It is only honoured for the one checkout the worker created with it: the
 *   row stores Creem's checkout id, and a webhook whose checkout id differs is
 *   not bound. A payment link can carry buyer-written metadata (Creem docs,
 *   Checkout Links), so nothing a buyer can type into a URL is trusted.
 * - Binding never moves a licence that already belongs to another account
 *   (`linkLicense` refuses), so a replayed or duplicated event changes nothing.
 *
 * What it does not defend against, stated rather than hidden: a checkout URL
 * the worker created for account A, forwarded to somebody else who then pays
 * through it, makes A Pro. That is true of every hosted checkout that is
 * created for a signed-in user (Stripe's `client_reference_id` included) and
 * is the price of binding at all; the page shows the address the checkout was
 * opened for, prefilled, which is the cue a payer has.
 *
 * Everything here takes injectables (`fetchImpl`, `now`, `timeoutMs`) so the
 * tests drive it with no network and no Workers runtime.
 */

"use strict";

import { deadlineMs } from "./deadline.js";
import { CHECKOUT_REF_TTL_SECONDS, ensureSchema, hitRateLimit, mintId, nowSec } from "./db.js";
import { findOpenSubscription, linkLicense, listLinkedLicenses } from "./grants.js";
import { ledgerReader } from "./ledger.js";
import { getEntitlement } from "./store.js";

/** Creem's two API hosts. Test keys only work on the test host, and live keys only on the live one. */
export const CREEM_LIVE_API = "https://api.creem.io";
export const CREEM_TEST_API = "https://test-api.creem.io";

/** Creem test-mode API keys start with this; live keys do not (docs.creem.io, Test Mode). */
export const CREEM_TEST_KEY_PREFIX = "creem_test_";

/** How long one call to Creem may take before the buyer is told to try again. */
export const CREEM_API_TIMEOUT_MS = 8000;

/** A reference this worker minted: `vtr_` and 22 base64url characters (16 random bytes). */
export const CHECKOUT_REF_PATTERN = /^vtr_[A-Za-z0-9_-]{22}$/;

/** How long a checkout reference is kept; the nightly sweep removes older rows (db.js). */
export { CHECKOUT_REF_TTL_SECONDS };

/**
 * Per account, `[limit, windowSeconds]`. A checkout costs one Creem call and
 * one D1 row; twelve an hour is far above anybody deciding between two plans
 * and far below what would matter to either budget.
 */
export const CHECKOUT_RATE_LIMIT = [12, 3600];
export const PORTAL_RATE_LIMIT = [30, 3600];

/** The plans a checkout can be opened for, and the variable naming each one's Creem product. */
const PLAN_PRODUCT_VARS = new Map([
  ["pro_monthly", "CREEM_PRODUCT_PRO_MONTHLY"],
  ["pro_yearly", "CREEM_PRODUCT_PRO_YEARLY"]
]);

/**
 * The currencies a checkout can be charged in, and the suffix of the variable
 * naming each one's product: US dollars everywhere, euros in the European
 * Union (VG-85, decided 2026-11-22), e.g. CREEM_PRODUCT_PRO_MONTHLY_EUR.
 */
const CURRENCY_SUFFIX = new Map([
  ["USD", ""],
  ["EUR", "_EUR"]
]);

/** Query parameters the return address must not carry in from the caller. */
const RETURN_PARAMS = ["billing", "plan", "provider", "checkout_id", "request_id", "signature"];

/** Longest return path accepted from the page. */
const MAX_RETURN_PATH = 512;

/**
 * A trimmed string variable, or "".
 * @param {Object} env Worker env bindings.
 * @param {string} key Variable name.
 * @returns {string} Value.
 */
function readVar(env, key) {
  return env && typeof env[key] === "string" ? env[key].trim() : "";
}

/**
 * The Creem API host this deployment's key works on. Chosen by the key rather
 * than by a second setting, because a second setting can disagree with the
 * key, and a test key sent to the live host is refused outright.
 * @param {Object} env Worker env bindings.
 * @returns {string} Base URL.
 */
export function creemApiBase(env) {
  return readVar(env, "CREEM_API_KEY").startsWith(CREEM_TEST_KEY_PREFIX) ? CREEM_TEST_API : CREEM_LIVE_API;
}

/**
 * The Creem product a plan is sold as in a currency, or "" when that plan has
 * none in it.
 * @param {string} plan Plan id.
 * @param {Object} env Worker env bindings.
 * @param {string} [currency] "USD" (the default) or "EUR".
 * @returns {string} Product id.
 */
export function creemProductFor(plan, env, currency) {
  const key = PLAN_PRODUCT_VARS.get(plan);
  const suffix = CURRENCY_SUFFIX.get(currency || "USD");
  return key && suffix !== undefined ? readVar(env, key + suffix) : "";
}

/**
 * Whether a European can be sold Pro in euros through the worker: everything
 * `creemCheckoutConfigured` needs, and a euro product for both plans. The page
 * shows € on its cards only when `/v1/health` says this, so a price is never
 * shown in a money the worker would then refuse to charge.
 * @param {Object} env Worker env bindings.
 * @returns {boolean}
 */
export function creemEurCheckoutConfigured(env) {
  return creemCheckoutConfigured(env)
    && Boolean(creemProductFor("pro_monthly", env, "EUR") && creemProductFor("pro_yearly", env, "EUR"));
}

/**
 * Whether the worker can open a Creem checkout and turn it into a licence:
 * an API key to open it with, a webhook secret to hear it was paid, a
 * database to remember whose it is, and at least one product to sell.
 * @param {Object} env Worker env bindings.
 * @returns {boolean} Whether `/v1/me/checkout` can answer.
 */
export function creemCheckoutConfigured(env) {
  return Boolean(
    readVar(env, "CREEM_API_KEY")
      && readVar(env, "CREEM_WEBHOOK_SECRET")
      && env && env.DB
      && (creemProductFor("pro_monthly", env) || creemProductFor("pro_yearly", env))
  );
}

/**
 * "test" for a creem_test_ key, "live" for any other, null with none.
 * @param {Object} env Worker env bindings.
 * @returns {"test"|"live"|null}
 */
export function creemKeyMode(env) {
  const key = readVar(env, "CREEM_API_KEY");
  if (!key) return null;
  return key.startsWith(CREEM_TEST_KEY_PREFIX) ? "test" : "live";
}

/**
 * Whether the worker can hand a Creem subscriber their billing portal.
 * @param {Object} env Worker env bindings.
 * @returns {boolean} Whether `/v1/me/billing-portal` can answer for Creem.
 */
export function creemPortalConfigured(env) {
  return Boolean(readVar(env, "CREEM_API_KEY") && env && env.DB);
}

/**
 * Whether a string is a reference this worker could have minted.
 * @param {unknown} value Candidate.
 * @returns {boolean} Whether it has the shape.
 */
export function isCheckoutRef(value) {
  return typeof value === "string" && CHECKOUT_REF_PATTERN.test(value);
}

/**
 * Whether a URL is one of Creem's own pages over https: what the worker will
 * hand back to the browser to navigate to. Anything else a compromised or
 * misbehaving answer names is refused rather than followed.
 * @param {unknown} value Candidate URL.
 * @returns {boolean} Whether it is a Creem page.
 */
export function isCreemPageUrl(value) {
  let url;
  try {
    url = new URL(String(value));
  } catch {
    return false;
  }
  const host = url.hostname.toLowerCase();
  return url.protocol === "https:" && !url.username && !url.password
    && (host === "creem.io" || host.endsWith(".creem.io"));
}

/**
 * The address Creem sends the buyer back to: a path on this site's own
 * origin, carrying `billing=success`, the rail and the plan. The page names
 * the path (the site may live under a sub-path, or move to a domain); the
 * origin is always `SITE_ORIGIN`, so the worker can never be made to send a
 * paying customer somewhere else.
 * @param {Object} env Worker env bindings.
 * @param {unknown} returnPath Path the page asked for.
 * @param {string} plan Plan id.
 * @returns {string|null} Absolute URL, or null when the path is not ours.
 */
export function returnUrlFor(env, returnPath, plan) {
  const origin = readVar(env, "SITE_ORIGIN");
  const path = typeof returnPath === "string" && returnPath ? returnPath : "/";
  if (!origin || path.length > MAX_RETURN_PATH || !path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return null;
  }
  let url;
  try {
    url = new URL(path, origin);
  } catch {
    return null;
  }
  if (url.origin !== new URL(origin).origin) {
    return null;
  }
  RETURN_PARAMS.forEach((name) => url.searchParams.delete(name));
  url.hash = "";
  url.searchParams.set("billing", "success");
  url.searchParams.set("provider", "creem");
  url.searchParams.set("plan", plan);
  return url.toString();
}

/**
 * One JSON call to Creem's API. Never throws: a network failure or a deadline
 * is an answer, so the caller can tell the buyer to try again.
 * @param {Object} env Worker env bindings.
 * @param {string} path API path, e.g. "/v1/checkouts".
 * @param {Object} body JSON body.
 * @param {{fetchImpl?: function, timeoutMs?: number}} [options] Injectables.
 * @returns {Promise<{ok: boolean, status: number, body: Object|null, reason?: string}>} Answer.
 */
export async function callCreem(env, path, body, options) {
  const doFetch = (options && options.fetchImpl) || fetch;
  let response;
  try {
    response = await doFetch(`${creemApiBase(env)}${path}`, {
      method: "POST",
      headers: { "x-api-key": readVar(env, "CREEM_API_KEY"), "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(deadlineMs(options, CREEM_API_TIMEOUT_MS))
    });
  } catch (error) {
    const timedOut = error && (error.name === "TimeoutError" || error.name === "AbortError");
    return { ok: false, status: 0, body: null, reason: timedOut ? "provider_timeout" : "provider_unreachable" };
  }
  let parsed = null;
  try {
    parsed = await response.json();
  } catch {
    parsed = null;
  }
  const ok = response.ok && parsed !== null && typeof parsed === "object";
  return { ok, status: response.status, body: parsed, reason: ok ? undefined : "provider_error" };
}

/**
 * Answer a refused or failed call to Creem with a status the page can act on.
 * Creem's own message is logged for the operator and never forwarded: it can
 * name the API key's environment, a product id or an internal error.
 * @param {Object} deps `{json, cors}`.
 * @param {{status: number, reason?: string, body?: Object|null}} answer Creem's answer.
 * @param {string} label Which call, for the log.
 * @returns {Response} 502 or 504.
 */
function providerFailure(deps, answer, label) {
  const detail = answer.body && typeof answer.body.message !== "undefined" ? String(answer.body.message).slice(0, 200) : "";
  console.warn(`creem ${label} failed`, answer.status, answer.reason || "", detail);
  const status = answer.reason === "provider_timeout" ? 504 : 502;
  return deps.json({ ok: false, reason: answer.reason || "provider_error" }, status, deps.cors);
}

/**
 * Session first, then the account's budget for this route. A refusal is the
 * Response to send; otherwise the signed-in account.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps Injectables, with `requireSession`.
 * @param {string} bucket Rate-limit bucket prefix.
 * @param {[number, number]} limit `[limit, windowSeconds]`.
 * @returns {Promise<{account?: Object, refusal?: Response}>} The account, or the refusal.
 */
async function signedInWithinBudget(request, env, deps, bucket, limit) {
  const at = nowSec(deps.now);
  const auth = await deps.requireSession(env, request, at);
  if (!auth.ok) {
    return { refusal: deps.json({ ok: false, reason: auth.reason }, 401, deps.cors) };
  }
  const limited = await hitRateLimit(env.DB, `${bucket}:acct:${auth.account.id}`, ...limit, at);
  if (!limited.ok) {
    return { refusal: deps.json({ ok: false, reason: "rate_limited", retryAfter: limited.retryAfter }, 429, deps.cors) };
  }
  return { account: auth.account };
}

/**
 * The currency a checkout asks to be charged in, or null for one not sold.
 * A body that names none is a page cached from before euros, which showed
 * dollars, so it is charged dollars.
 * @param {Object} body Parsed request body.
 * @returns {string|null} "USD", "EUR" or null.
 */
function askedCurrency(body) {
  const currency = body.currency === undefined ? "USD" : body.currency;
  return CURRENCY_SUFFIX.has(currency) ? currency : null;
}

/**
 * What a checkout request asks for, checked: the plan, its product in the
 * currency asked for, and the address to come back to. A refusal reason, or
 * the values. A currency with no product for the plan is refused, never
 * charged in another: the page showed that money (VG-85).
 * @param {Object} body Parsed request body.
 * @param {Object} env Worker env bindings.
 * @returns {{reason?: string, status?: number, plan?: string, currency?: string, productId?: string, successUrl?: string}} Result.
 */
function checkoutRequest(body, env) {
  const plan = body && body.plan;
  const provider = body && body.provider !== undefined ? body.provider : "creem";
  if (provider !== "creem" || !PLAN_PRODUCT_VARS.has(plan)) {
    return { reason: "bad_request", status: 400 };
  }
  const currency = askedCurrency(body);
  if (!currency) {
    return { reason: "invalid_currency", status: 400 };
  }
  const productId = creemProductFor(plan, env, currency);
  if (!productId && currency !== "USD") {
    return { reason: "currency_unavailable", status: 409 };
  }
  if (!productId) {
    return { reason: "plan_unavailable", status: 503 };
  }
  const successUrl = returnUrlFor(env, body.returnPath, plan);
  if (!successUrl) {
    return { reason: "bad_return_path", status: 400 };
  }
  return { plan, currency, productId, successUrl };
}

/**
 * Remember a checkout the worker opened: which account, which plan, and
 * Creem's own id for it, under the reference sent as `request_id`.
 * @param {Object} db D1 binding.
 * @param {{ref: string, accountId: string, plan: string, checkoutId: string}} row Values.
 * @param {number} at Unix seconds.
 * @returns {Promise<void>} Resolves when written.
 */
async function recordCheckoutRef(db, row, at) {
  await db
    .prepare(
      `INSERT INTO checkout_refs (ref, account_id, plan, provider, checkout_id, created_at)
       VALUES (?1, ?2, ?3, 'creem', ?4, ?5)`
    )
    .bind(row.ref, row.accountId, row.plan, row.checkoutId, at)
    .run();
}

/**
 * POST /v1/me/checkout — open a Creem checkout for the signed-in account.
 *
 * Body: `{plan: "pro_monthly"|"pro_yearly", provider?: "creem", returnPath?: "/path/",
 * currency?: "USD"|"EUR"}` (no currency is "USD"). Answers `{ok: true, url}`
 * with the Creem page to send the buyer to; 409 `currency_unavailable` for a
 * currency with no product for that plan, 400 `invalid_currency` for any other.
 *
 * Refuses with 409 `{ok: false, reason: "subscription_open", provider}` while
 * the account already has an open subscription on any rail (license.js
 * `isOpenSubscription`, the same test `/v1/me`'s `billingRails` reads), and
 * names that rail so the page can send them to its Manage route instead. A
 * second subscription would charge every month beside the first: a renewal
 * being retried after the paid period charges again the day the card
 * recovers, and a first charge on its way is taken all the same (red team
 * rt2, money-3 and states-1). Creem's own route back from a failed renewal is
 * the old subscription: "If a retry succeeds, the subscription transitions
 * back to `active`", and "Customers can update their payment method through
 * the Customer Portal" (docs.creem.io, webhooks and Managing Subscriptions,
 * read 23 November 2026).
 * The price of the rule, stated: a subscriber who wants to change plan does it
 * on the provider's own pages (Creem's portal, or the upgrade Creem's API
 * offers the operator), not here.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps `{json, cors, now, fetchImpl, timeoutMs, requireSession, readJsonBody}`.
 * @returns {Promise<Response>} Response.
 */
export async function handleCreateCheckout(request, env, deps) {
  if (!creemCheckoutConfigured(env)) {
    return deps.json({ ok: false, reason: "checkout_unconfigured" }, 503, deps.cors);
  }
  const gate = await signedInWithinBudget(request, env, deps, "checkout", CHECKOUT_RATE_LIMIT);
  if (gate.refusal) {
    return gate.refusal;
  }
  const parsed = await deps.readJsonBody(request);
  const asked = parsed.ok ? checkoutRequest(parsed.body, env) : { reason: parsed.reason, status: 400 };
  if (asked.reason) {
    return deps.json({ ok: false, reason: asked.reason }, asked.status, deps.cors);
  }
  const open = await findOpenSubscription(env.DB, ledgerReader(env), gate.account.id);
  if (open) {
    return deps.json({ ok: false, reason: "subscription_open", provider: open.provider }, 409, deps.cors);
  }
  const ref = mintId("vtr", 16);
  const answer = await callCreem(env, "/v1/checkouts", {
    product_id: asked.productId,
    request_id: ref,
    success_url: asked.successUrl,
    // Prefilled so the receipt, the portal and the account share one address,
    // and so the payer sees whose checkout this is.
    customer: { email: gate.account.email }
  }, deps);
  if (!answer.ok) {
    return providerFailure(deps, answer, "checkout");
  }
  const url = answer.body.checkout_url;
  const checkoutId = typeof answer.body.id === "string" ? answer.body.id : "";
  if (!isCreemPageUrl(url) || !checkoutId) {
    return providerFailure(deps, { status: answer.status, reason: "provider_error", body: null }, "checkout answer");
  }
  await recordCheckoutRef(env.DB, { ref, accountId: gate.account.id, plan: asked.plan, checkoutId }, nowSec(deps.now));
  return deps.json({ ok: true, url, plan: asked.plan, provider: "creem" }, 200, deps.cors);
}

/**
 * The Creem customer behind this account's newest Creem licence, or null.
 * @param {Object} env Worker env bindings.
 * @param {string} accountId Account id.
 * @returns {Promise<{customerId: string|null, providers: string[]}>} The customer, and every rail the account pays on.
 */
async function creemCustomerFor(env, accountId) {
  const ids = await listLinkedLicenses(env.DB, accountId);
  const providers = [];
  let customerId = null;
  for (const licenseId of ids) {
    const record = await getEntitlement(ledgerReader(env), licenseId);
    if (!record || !record.provider) {
      continue;
    }
    providers.push(record.provider);
    if (!customerId && record.provider === "creem" && typeof record.customerId === "string" && record.customerId) {
      customerId = record.customerId;
    }
  }
  return { customerId, providers: [...new Set(providers)] };
}

/**
 * POST /v1/me/billing-portal — the page a Creem subscriber cancels, changes
 * card or downloads invoices from.
 *
 * Peru's consumer code wants cancelling to be as easy as subscribing, and the
 * terms promise a management link in the Pro window; this is that link. A
 * subscriber on another rail is told which one (`provider`), because their
 * cancel route is on that rail's own pages and the page says where.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {Object} deps `{json, cors, now, fetchImpl, timeoutMs, requireSession}`.
 * @returns {Promise<Response>} Response.
 */
export async function handleBillingPortal(request, env, deps) {
  const gate = await signedInWithinBudget(request, env, deps, "portal", PORTAL_RATE_LIMIT);
  if (gate.refusal) {
    return gate.refusal;
  }
  const { customerId, providers } = await creemCustomerFor(env, gate.account.id);
  if (!customerId) {
    return deps.json({ ok: false, reason: "no_portal", providers }, 404, deps.cors);
  }
  if (!creemPortalConfigured(env)) {
    return deps.json({ ok: false, reason: "portal_unconfigured", providers }, 503, deps.cors);
  }
  const answer = await callCreem(env, "/v1/customers/billing", { customer_id: customerId }, deps);
  if (!answer.ok) {
    return providerFailure(deps, answer, "portal");
  }
  const url = answer.body.customer_portal_link;
  if (!isCreemPageUrl(url)) {
    return providerFailure(deps, { status: answer.status, reason: "provider_error", body: null }, "portal answer");
  }
  return deps.json({ ok: true, url, provider: "creem" }, 200, deps.cors);
}

/**
 * Link a paid licence to the account that opened its checkout. Called from
 * the Creem webhook once the licence is recorded, and again for a duplicate
 * delivery, so a link that failed the first time is retried by Creem's own
 * retries.
 * @param {Object} env Worker env bindings.
 * @param {{ref: string, checkoutId: string, licenseId: string}} input What the webhook carried.
 * @param {number} at Unix seconds.
 * @returns {Promise<{bound: boolean, reason?: string}>} Outcome; throws only when D1 does.
 */
export async function bindCheckoutRef(env, input, at) {
  if (!env.DB || !isCheckoutRef(input.ref) || !input.licenseId) {
    return { bound: false, reason: "nothing_to_bind" };
  }
  await ensureSchema(env.DB);
  const row = await env.DB
    .prepare("SELECT account_id, checkout_id FROM checkout_refs WHERE ref = ?1")
    .bind(input.ref)
    .first();
  if (!row) {
    return { bound: false, reason: "unknown_ref" };
  }
  if (!input.checkoutId || row.checkout_id !== input.checkoutId) {
    // Somebody else's checkout naming our reference: a payment link a buyer
    // wrote it into, or a copy. Not ours to bind.
    console.warn("creem checkout reference names another checkout; not bound");
    return { bound: false, reason: "checkout_mismatch" };
  }
  const linked = await linkLicense(env.DB, row.account_id, input.licenseId, "creem", at);
  await env.DB
    .prepare("UPDATE checkout_refs SET license_id = ?2, bound_at = COALESCE(bound_at, ?3) WHERE ref = ?1")
    .bind(input.ref, input.licenseId, at)
    .run();
  return linked.ok ? { bound: true } : { bound: false, reason: linked.reason };
}

/**
 * Route the two paths this module answers, or null for any other. Tried
 * before the account router, which claims every `/v1/me` path.
 * @param {Request} request Incoming request.
 * @param {Object} env Worker env bindings.
 * @param {string} path Normalized path.
 * @param {Object} deps Injectables.
 * @returns {Promise<Response>|null} Response, or null when the path is not ours.
 */
export function routeCheckoutApi(request, env, path, deps) {
  const handler = path === "/v1/me/checkout" ? handleCreateCheckout
    : path === "/v1/me/billing-portal" ? handleBillingPortal
      : null;
  if (!handler) {
    return null;
  }
  if (request.method !== "POST") {
    return Promise.resolve(deps.json({ ok: false, reason: "method_not_allowed" }, 405, { ...deps.cors, allow: "POST" }));
  }
  if (!env.DB) {
    return Promise.resolve(deps.json({ ok: false, reason: "accounts_not_configured" }, 503, deps.cors));
  }
  return ensureSchema(env.DB).then(() => handler(request, env, deps));
}
