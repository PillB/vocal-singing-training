/**
 * Checkouts the worker opens itself, bound to the signed-in account (VG-83),
 * and the billing portal a Creem subscriber cancels from (VG-86).
 *
 * The defect these tests exist for: with a static payment link the purchase
 * belongs to nobody until the page links it on the way back, and when Creem's
 * webhook lands after the buyer is back (the ordinary order, per Creem's and
 * Stripe's own docs) the page's one link attempt answered 202 and the paid
 * Pro was dropped on the next load. The oracle is therefore what the person
 * sees on another device: GET /v1/me must hand the buyer a Pro token after
 * the webhook alone, with no link call from any browser. On `main` before
 * this change that answer was `token: null` (the route did not exist), and
 * mutants CK1 to CK13 in qa/mutate.mjs (the ledger set) plant each half of
 * the binding back out, each named for the test here that kills it.
 *
 * Everything goes through the real router, the real D1 fake and the real
 * signature check; only Creem's API is faked, and the fake records what it
 * was asked so the tests can check what left the worker.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { handleRequest } from "../src/index.js";
import { resetSchemaMemo, sweepExpired } from "../src/db.js";
import { CHECKOUT_REF_PATTERN, CREEM_LIVE_API, CREEM_TEST_API, returnUrlFor } from "../src/checkout.js";
import { createAccountEnv } from "./fixtures.mjs";

const BASE = "https://entitlements.test";
const NOW = 1800000000;
const DAY = 86400;

/** Build a request against the worker. */
function req(method, path, options) {
  const opts = options || {};
  const headers = {
    ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
    ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {})
  };
  return new Request(`${BASE}${path}`, {
    method,
    headers,
    ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) })
  });
}

/** Call the worker and return status plus parsed body. */
async function call(request, env, deps) {
  const response = await handleRequest(request, env, deps);
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

/**
 * A fake of the two Creem calls the worker makes, plus the email transport the
 * sign-in uses. `answers` decides what Creem says; `calls` records each request.
 */
function fakeServices(answers) {
  const calls = [];
  let lastCode = null;
  const fetchImpl = async (url, init) => {
    const u = String(url);
    if (!u.includes("creem.io")) {
      const match = /\b(\d{6})\b/.exec(JSON.parse(init.body).text || "");
      lastCode = match && match[1];
      return { ok: true, status: 200, json: async () => ({}) };
    }
    const body = JSON.parse(init.body);
    calls.push({ url: u, headers: init.headers, body });
    const path = new URL(u).pathname;
    const answer = (answers && answers[path]) || defaultAnswer(path, body, calls.length);
    if (answer instanceof Error) {
      throw answer;
    }
    return {
      ok: answer.status >= 200 && answer.status < 300,
      status: answer.status,
      json: async () => answer.body
    };
  };
  return { fetchImpl, calls, code: () => lastCode };
}

/** What Creem answers when a test does not say otherwise. */
function defaultAnswer(path, body, n) {
  if (path === "/v1/checkouts") {
    return { status: 200, body: { id: `ch_${n}`, checkout_url: `https://checkout.creem.io/ch_${n}`, request_id: body.request_id } };
  }
  return { status: 200, body: { customer_portal_link: `https://creem.io/my-orders/login/${body.customer_id}` } };
}

/** An account env with Creem's checkout API configured. */
function freshEnv(overrides) {
  resetSchemaMemo();
  return createAccountEnv({
    CREEM_API_KEY: "creem_live_unit_key",
    CREEM_PRODUCT_PRO_MONTHLY: "prod_monthly",
    CREEM_PRODUCT_PRO_YEARLY: "prod_yearly",
    ...(overrides || {})
  });
}

/** Sign in by emailed code. */
async function signIn(env, services, email, now) {
  const started = await call(req("POST", "/v1/auth/email/start", { body: { email } }), env, { now, fetchImpl: services.fetchImpl });
  assert.equal(started.status, 200);
  const verified = await call(req("POST", "/v1/auth/email/verify", { body: { email, code: services.code() } }), env, { now: now + 1 });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return verified.body.sessionToken;
}

/** Open a checkout as the page does. */
function openCheckout(env, services, token, body, now) {
  return call(req("POST", "/v1/me/checkout", { token, body }), env, { now, fetchImpl: services.fetchImpl });
}

/** Deliver one signed Creem event. */
function deliver(env, id, eventType, object, now) {
  const raw = JSON.stringify({ id, eventType, created_at: now * 1000, object });
  const signature = createHmac("sha256", env.CREEM_WEBHOOK_SECRET).update(raw).digest("hex");
  return handleRequest(new Request(`${BASE}/v1/webhooks/creem`, {
    method: "POST",
    body: raw,
    headers: { "creem-signature": signature }
  }), env, { now });
}

/** A completed subscription checkout, as Creem sends it. */
function completedCheckout(checkoutId, requestId, now, over) {
  return {
    id: checkoutId,
    object: "checkout",
    status: "completed",
    mode: "prod",
    request_id: requestId,
    order: { id: "ord_1", amount: 799, currency: "USD", status: "paid", type: "recurring", transaction: "tran_1" },
    product: { id: "prod_monthly", billing_type: "recurring", billing_period: "every-month" },
    customer: { id: "cust_1", email: "buyer@example.test" },
    subscription: {
      id: "sub_1",
      object: "subscription",
      status: "active",
      current_period_end_date: new Date((now + 30 * DAY) * 1000).toISOString()
    },
    metadata: {},
    ...(over || {})
  };
}

/** GET /v1/me as another device would: the account's own answer. */
function me(env, token, now) {
  return call(req("GET", "/v1/me", { token }), env, { now });
}

test("CK1 a checkout opened while signed in is Pro on every device from the webhook alone, with no link from the page", async () => {
  const env = freshEnv();
  const services = fakeServices();
  const token = await signIn(env, services, "buyer@example.test", NOW);
  const opened = await openCheckout(env, services, token, { plan: "pro_monthly", returnPath: "/vocal-singing-training/" }, NOW + 5);
  assert.equal(opened.status, 200, JSON.stringify(opened.body));
  assert.equal(opened.body.url, "https://checkout.creem.io/ch_1");

  const sent = services.calls[0];
  assert.equal(sent.url, `${CREEM_LIVE_API}/v1/checkouts`);
  assert.equal(sent.headers["x-api-key"], "creem_live_unit_key");
  assert.equal(sent.body.product_id, "prod_monthly");
  assert.match(sent.body.request_id, CHECKOUT_REF_PATTERN);
  assert.equal(sent.body.customer.email, "buyer@example.test");
  const back = new URL(sent.body.success_url);
  assert.equal(back.origin, "https://example.test");
  assert.equal(back.pathname, "/vocal-singing-training/");
  assert.equal(back.searchParams.get("billing"), "success");
  assert.equal(back.searchParams.get("provider"), "creem");
  assert.equal(back.searchParams.get("plan"), "pro_monthly");

  // Before the webhook: free. This is the state the page used to keep.
  assert.equal((await me(env, token, NOW + 10)).body.token, null);

  const hook = await deliver(env, "evt_1", "checkout.completed", completedCheckout("ch_1", sent.body.request_id, NOW + 20), NOW + 20);
  assert.equal(hook.status, 200);

  const after = await me(env, token, NOW + 30);
  assert.equal(after.status, 200);
  assert.equal(after.body.entitlement.pro, true, JSON.stringify(after.body.entitlement));
  assert.equal(after.body.entitlement.provider, "creem");
  assert.ok(after.body.token, "the account is handed a licence token");
});

test("CK2 a checkout naming our reference that is not the checkout we opened is not bound (a buyer-written request_id)", async () => {
  const env = freshEnv();
  const services = fakeServices();
  const victim = await signIn(env, services, "victim@example.test", NOW);
  const opened = await openCheckout(env, services, victim, { plan: "pro_monthly" }, NOW + 5);
  assert.equal(opened.status, 200);
  const ref = services.calls[0].body.request_id;

  // Somebody else's checkout carrying the victim's reference.
  await deliver(env, "evt_x", "checkout.completed", completedCheckout("ch_payment_link", ref, NOW + 20), NOW + 20);
  assert.equal((await me(env, victim, NOW + 30)).body.token, null, "a checkout we did not open must not bind");

  // Control: the checkout we did open, with the same reference, binds.
  await deliver(env, "evt_y", "checkout.completed",
    completedCheckout("ch_1", ref, NOW + 40, { order: { id: "ord_2", amount: 799, currency: "USD", status: "paid", transaction: "tran_2" }, subscription: { id: "sub_2", status: "active", current_period_end_date: new Date((NOW + 30 * DAY) * 1000).toISOString() } }),
    NOW + 40);
  assert.equal((await me(env, victim, NOW + 50)).body.entitlement.pro, true);
});

test("CK3 a binding that failed is made by Creem's retry of the same event, which the ledger sees as a duplicate", async () => {
  const env = freshEnv();
  const services = fakeServices();
  const token = await signIn(env, services, "buyer@example.test", NOW);
  await openCheckout(env, services, token, { plan: "pro_monthly" }, NOW + 5);
  const ref = services.calls[0].body.request_id;

  // The first delivery records the licence, then D1 refuses the link.
  const prepare = env.DB.prepare.bind(env.DB);
  let refused = 0;
  env.DB.prepare = (sql) => {
    if (/INSERT INTO license_links/.test(sql) && refused === 0) {
      refused += 1;
      throw new Error("D1_ERROR: simulated");
    }
    return prepare(sql);
  };
  const object = completedCheckout("ch_1", ref, NOW + 20);
  await assert.rejects(() => deliver(env, "evt_1", "checkout.completed", object, NOW + 20), /simulated/);
  env.DB.prepare = prepare;
  assert.equal(refused, 1, "the link was attempted and refused");
  assert.equal((await me(env, token, NOW + 25)).body.token, null);

  const retry = await deliver(env, "evt_1", "checkout.completed", object, NOW + 60);
  assert.equal(retry.status, 200);
  assert.equal((await retry.json()).reason, "duplicate", "the ledger already holds this event");
  assert.equal((await me(env, token, NOW + 70)).body.entitlement.pro, true, "the duplicate made the link");
});

test("CK4 binding never moves a licence another account already holds", async () => {
  const env = freshEnv();
  const services = fakeServices();
  const owner = await signIn(env, services, "owner@example.test", NOW);
  const other = await signIn(env, services, "other@example.test", NOW + 2);
  await openCheckout(env, services, owner, { plan: "pro_monthly" }, NOW + 5);
  const ref = services.calls[0].body.request_id;
  // The webhook lands without a reference first (say, the reference was lost),
  // and the other account links the checkout by its id.
  await deliver(env, "evt_1", "checkout.completed", completedCheckout("ch_1", null, NOW + 20), NOW + 20);
  const linked = await call(req("POST", "/v1/me/link", { token: other, body: { provider: "creem", sessionId: "ch_1" } }), env, { now: NOW + 25 });
  assert.equal(linked.status, 200);
  // Then a delivery that does carry the owner's reference.
  await deliver(env, "evt_2", "checkout.completed", completedCheckout("ch_1", ref, NOW + 30), NOW + 30);
  assert.equal((await me(env, other, NOW + 40)).body.entitlement.pro, true, "the first link stands");
  assert.equal((await me(env, owner, NOW + 40)).body.token, null, "and is not moved");
});

test("CK5 the route refuses before calling Creem: no session, no key, a plan that is not for sale, another rail", async () => {
  const services = fakeServices();
  const unconfigured = freshEnv({ CREEM_API_KEY: "" });
  const noKey = await call(req("POST", "/v1/me/checkout", { token: "x", body: { plan: "pro_monthly" } }), unconfigured, { now: NOW, fetchImpl: services.fetchImpl });
  assert.deepEqual([noKey.status, noKey.body.reason], [503, "checkout_unconfigured"]);

  const env = freshEnv({ CREEM_PRODUCT_PRO_YEARLY: "" });
  const anon = await call(req("POST", "/v1/me/checkout", { body: { plan: "pro_monthly" } }), env, { now: NOW, fetchImpl: services.fetchImpl });
  assert.equal(anon.status, 401);
  const token = await signIn(env, services, "buyer@example.test", NOW);
  assert.deepEqual((await openCheckout(env, services, token, { plan: "trial" }, NOW + 5)).status, 400);
  assert.deepEqual((await openCheckout(env, services, token, { plan: "pro_monthly", provider: "stripe" }, NOW + 6)).status, 400);
  const yearly = await openCheckout(env, services, token, { plan: "pro_yearly" }, NOW + 7);
  assert.deepEqual([yearly.status, yearly.body.reason], [503, "plan_unavailable"]);
  assert.equal(services.calls.length, 0, "Creem was never called");
  // Control: the monthly plan, which has a product, is opened.
  assert.equal((await openCheckout(env, services, token, { plan: "pro_monthly" }, NOW + 8)).status, 200);
  assert.equal(services.calls.length, 1);
});

test("CK6 the return address is always this site's origin; a path elsewhere is refused", () => {
  const env = { SITE_ORIGIN: "https://pillb.github.io" };
  for (const bad of ["//evil.example/x", "https://evil.example/", "evil", "/\\evil.example", "/a".repeat(300)]) {
    assert.equal(returnUrlFor(env, bad, "pro_monthly"), null, bad);
  }
  const kept = new URL(returnUrlFor(env, "/vocal-singing-training/?billing=cancel&lang=es&checkout_id=ch_forged#top", "pro_yearly"));
  assert.equal(kept.origin, "https://pillb.github.io");
  assert.equal(kept.pathname, "/vocal-singing-training/");
  assert.equal(kept.searchParams.get("billing"), "success");
  assert.equal(kept.searchParams.get("plan"), "pro_yearly");
  assert.equal(kept.searchParams.get("lang"), "es", "the page's own parameters survive");
  assert.equal(kept.searchParams.get("checkout_id"), null, "a forged return id does not");
  assert.equal(kept.hash, "");
  assert.equal(new URL(returnUrlFor(env, undefined, "pro_monthly")).pathname, "/");
});

test("CK7 a test key opens checkouts on Creem's test host; a live key on the live host", async () => {
  for (const [key, host] of [["creem_test_abc", CREEM_TEST_API], ["creem_live_abc", CREEM_LIVE_API]]) {
    const env = freshEnv({ CREEM_API_KEY: key });
    const services = fakeServices();
    const token = await signIn(env, services, "buyer@example.test", NOW);
    await openCheckout(env, services, token, { plan: "pro_monthly" }, NOW + 5);
    assert.equal(new URL(services.calls[0].url).origin, host, key);
  }
});

test("CK8 an answer from Creem that is not a Creem page, an error, or a timeout opens nothing and keeps Creem's words to the log", async () => {
  const cases = [
    [{ "/v1/checkouts": { status: 200, body: { id: "ch_1", checkout_url: "https://evil.example/pay" } } }, 502, "provider_error"],
    [{ "/v1/checkouts": { status: 200, body: { checkout_url: "https://checkout.creem.io/ch_1" } } }, 502, "provider_error"],
    [{ "/v1/checkouts": { status: 403, body: { message: "Forbidden: test key on live host" } } }, 502, "provider_error"],
    [{ "/v1/checkouts": Object.assign(new Error("timed out"), { name: "TimeoutError" }) }, 504, "provider_timeout"],
    [{ "/v1/checkouts": new TypeError("fetch failed") }, 502, "provider_unreachable"]
  ];
  for (const [answers, status, reason] of cases) {
    const env = freshEnv();
    const services = fakeServices(answers);
    const token = await signIn(env, services, "buyer@example.test", NOW);
    const opened = await openCheckout(env, services, token, { plan: "pro_monthly" }, NOW + 5);
    assert.deepEqual([opened.status, opened.body.reason], [status, reason]);
    assert.equal(opened.body.url, undefined);
    assert.ok(!JSON.stringify(opened.body).includes("Forbidden"), "Creem's message is not forwarded");
    const rows = await env.DB.prepare("SELECT COUNT(*) AS n FROM checkout_refs").first();
    assert.equal(Number(rows.n), 0, "no reference is kept for a checkout that was not opened");
  }
});

test("CK9 twelve checkouts an hour per account, then 429; another account is not held back", async () => {
  const env = freshEnv();
  const services = fakeServices();
  const token = await signIn(env, services, "buyer@example.test", NOW);
  for (let i = 0; i < 12; i += 1) {
    assert.equal((await openCheckout(env, services, token, { plan: "pro_monthly" }, NOW + 10 + i)).status, 200, `try ${i + 1}`);
  }
  const thirteenth = await openCheckout(env, services, token, { plan: "pro_monthly" }, NOW + 30);
  assert.equal(thirteenth.status, 429);
  const other = await signIn(env, services, "other@example.test", NOW + 31);
  assert.equal((await openCheckout(env, services, other, { plan: "pro_monthly" }, NOW + 40)).status, 200);
});

test("CK10 the billing portal is the Creem customer behind the account's own licence, and nobody else's", async () => {
  const env = freshEnv();
  const services = fakeServices();
  const token = await signIn(env, services, "buyer@example.test", NOW);
  const none = await call(req("POST", "/v1/me/billing-portal", { token }), env, { now: NOW + 2, fetchImpl: services.fetchImpl });
  assert.deepEqual([none.status, none.body.reason], [404, "no_portal"]);

  await openCheckout(env, services, token, { plan: "pro_monthly" }, NOW + 5);
  const ref = services.calls[0].body.request_id;
  await deliver(env, "evt_1", "checkout.completed", completedCheckout("ch_1", ref, NOW + 20), NOW + 20);
  const portal = await call(req("POST", "/v1/me/billing-portal", { token }), env, { now: NOW + 30, fetchImpl: services.fetchImpl });
  assert.equal(portal.status, 200, JSON.stringify(portal.body));
  assert.equal(portal.body.url, "https://creem.io/my-orders/login/cust_1");
  const asked = services.calls.at(-1);
  assert.equal(asked.url, `${CREEM_LIVE_API}/v1/customers/billing`);
  assert.deepEqual(asked.body, { customer_id: "cust_1" });

  // Another signed-in account gets no portal for that customer.
  const stranger = await signIn(env, services, "stranger@example.test", NOW + 40);
  const theirs = await call(req("POST", "/v1/me/billing-portal", { token: stranger }), env, { now: NOW + 45, fetchImpl: services.fetchImpl });
  assert.equal(theirs.status, 404);

  // A link to somewhere that is not Creem is refused, not forwarded.
  const bad = fakeServices({ "/v1/customers/billing": { status: 200, body: { customer_portal_link: "https://evil.example/" } } });
  const refused = await call(req("POST", "/v1/me/billing-portal", { token }), env, { now: NOW + 50, fetchImpl: bad.fetchImpl });
  assert.deepEqual([refused.status, refused.body.url], [502, undefined]);
});

test("CK11 health says whether checkouts and the portal can be opened, from configuration alone", async () => {
  const health = async (env) => (await call(req("GET", "/v1/health"), env, { now: NOW })).body;
  const on = await health(freshEnv());
  assert.equal(on.creemCheckoutConfigured, true);
  assert.equal(on.creemPortalConfigured, true);
  const noKey = await health(freshEnv({ CREEM_API_KEY: "" }));
  assert.deepEqual([noKey.creemCheckoutConfigured, noKey.creemPortalConfigured], [false, false]);
  const noProducts = await health(freshEnv({ CREEM_PRODUCT_PRO_MONTHLY: "", CREEM_PRODUCT_PRO_YEARLY: "" }));
  assert.deepEqual([noProducts.creemCheckoutConfigured, noProducts.creemPortalConfigured], [false, true]);
  const noSecret = await health(freshEnv({ CREEM_WEBHOOK_SECRET: "" }));
  assert.equal(noSecret.creemCheckoutConfigured, false, "a checkout whose webhook is refused can never become a licence");
  assert.ok(!JSON.stringify(on).includes("creem_live_unit_key"), "the key itself is never reported");
});

test("CK12 references are swept 30 days after the checkout opened; the link they made is not", async () => {
  const env = freshEnv();
  const services = fakeServices();
  const token = await signIn(env, services, "buyer@example.test", NOW);
  await openCheckout(env, services, token, { plan: "pro_monthly" }, NOW + 5);
  const ref = services.calls[0].body.request_id;
  await deliver(env, "evt_1", "checkout.completed", completedCheckout("ch_1", ref, NOW + 20), NOW + 20);
  // The later checkouts are another account's: this one now has an open
  // subscription, and a second checkout for it is refused (409
  // subscription_open, rt2-open-subscription.test.mjs).
  const other = await signIn(env, services, "other@example.test", NOW + 10);
  const younger = await openCheckout(env, services, other, { plan: "pro_yearly" }, NOW + 20 * DAY);
  assert.equal(younger.status, 200, JSON.stringify(younger.body));
  const report = await sweepExpired(env.DB, NOW + 31 * DAY);
  assert.equal(report.deleted.checkout_refs, 1, "only the one older than 30 days");
  const left = await env.DB.prepare("SELECT plan FROM checkout_refs").all();
  assert.deepEqual(left.results.map((r) => r.plan), ["pro_yearly"]);
  const links = await env.DB.prepare("SELECT COUNT(*) AS n FROM license_links").first();
  assert.equal(Number(links.n), 1, "the bound licence stays linked");

  // The boundary itself: a second short of 30 days stays, a second past goes.
  // Rows one well inside and one well outside passed with any TTL from 11 to
  // 31 days.
  const at = NOW + 60 * DAY;
  await openCheckout(env, services, other, { plan: "pro_monthly" }, at - 30 * DAY + 1);
  await openCheckout(env, services, other, { plan: "pro_yearly" }, at - 30 * DAY - 1);
  const edge = await sweepExpired(env.DB, at);
  const kept = await env.DB.prepare("SELECT created_at FROM checkout_refs").all();
  assert.deepEqual(kept.results.map((r) => Number(r.created_at)), [at - 30 * DAY + 1], JSON.stringify(edge.deleted));
});

/** A subscription event as Creem sends it, for the renewal that follows a checkout. */
function subscriptionEvent(status, periodStart, over) {
  return {
    id: "sub_1",
    object: "subscription",
    status,
    mode: "prod",
    product: { id: "prod_monthly", billing_period: "every-month" },
    customer: { id: "cust_1" },
    last_transaction_id: "tran_1",
    current_period_start_date: new Date(periodStart * 1000).toISOString(),
    current_period_end_date: new Date((periodStart + 30 * DAY) * 1000).toISOString(),
    ...(over || {})
  };
}

test("CK15 a renewal still being retried after the paid period ends is no Pro, and still a subscription the page can manage", async () => {
  const env = freshEnv();
  const services = fakeServices();
  const token = await signIn(env, services, "buyer@example.test", NOW);
  await openCheckout(env, services, token, { plan: "pro_monthly" }, NOW + 5);
  const ref = services.calls[0].body.request_id;
  await deliver(env, "evt_1", "checkout.completed", completedCheckout("ch_1", ref, NOW + 20), NOW + 20);
  assert.deepEqual((await me(env, token, NOW + 30)).body.billingRails, ["creem"]);

  // The renewal fails and Creem keeps retrying the card: the period is over,
  // so no Pro, but the card is still being charged.
  const end = NOW + 20 + 30 * DAY;
  for (const [i, status] of ["past_due", "unpaid"].entries()) {
    const when = end + (i + 1) * DAY;
    await deliver(env, `evt_${status}`, "subscription.update", subscriptionEvent(status, NOW + 20), when);
    const after = await me(env, token, when + 60);
    assert.equal(after.body.token, null, `${status}: no Pro after the paid period`);
    assert.deepEqual(after.body.billingRails, ["creem"], `${status}: the subscription is still there to manage`);
  }

  // Cancelled: nothing left to manage.
  await deliver(env, "evt_cancel", "subscription.canceled", subscriptionEvent("canceled", NOW + 20, { canceled_at: new Date((end + 4 * DAY) * 1000).toISOString() }), end + 4 * DAY);
  assert.deepEqual((await me(env, token, end + 5 * DAY)).body.billingRails, []);

  // And an account with nothing linked has none.
  const other = await signIn(env, services, "other@example.test", NOW + 40);
  assert.deepEqual((await me(env, other, NOW + 50)).body.billingRails, []);
});

test("CK13 methods other than POST are refused on both routes", async () => {
  const env = freshEnv();
  for (const path of ["/v1/me/checkout", "/v1/me/billing-portal"]) {
    const res = await call(req("GET", path), env, { now: NOW });
    assert.equal(res.status, 405, path);
  }
});
