/**
 * Every payment rail on the D1 ledger, end to end, and every route that reads
 * what the rails wrote.
 *
 * The ledger's own tests drive Stripe. Creem and Mercado Pago ran only against
 * the KV-only environment, and the read routes were only ever asked about
 * licenses KV also held, so a sweep of planted defects on PR #38 found that a
 * rail could bypass the ledger, or split an event's marker from its effect,
 * and a route could read KV instead of the ledger, with every test green.
 *
 * Two facts make that visible here:
 * - With D1 bound, nothing writes KV any more, so a license sold now exists in
 *   D1 alone. A route that reads KV does not find it.
 * - KV is made to refuse every write, as it does past the free plan's 1,000
 *   writes a day. A rail that writes KV instead of the ledger fails the sale.
 *
 * The health flag a failing webhook leaves, and the KV fallback for it when D1
 * refuses the row, are pinned after that: its key, its TTL and the edge of the
 * hour the probe reports it for. Last, a rotated license-id key.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import {
  HEALTH_FLAG_WINDOW_SECONDS,
  SWEEP_FAILED_FLAG,
  WEBHOOK_FAILED_FLAG,
  healthFlagKey,
  noteHealthFlag
} from "../src/db.js";
import { handleRequest } from "../src/index.js";
import { ledgerReader } from "../src/ledger.js";
import { hmacSha256Hex } from "../src/license.js";
import { buildMercadoPagoManifest } from "../src/mercadopago.js";
import { getEntitlement } from "../src/store.js";
import { createAccountEnv, createFakeKv, createTestEnv } from "./fixtures.mjs";

const BASE = "https://entitlements.test";
const DAY = 86400;
const T = Math.floor(Date.now() / 1000);
const NO_WAIT = { sleep: async () => {}, random: () => 0 };

const hmacHex = (secret, message) => createHmac("sha256", secret).update(message).digest("hex");

// ------------------------------------------------------------------ helpers

/** KV that answers reads and refuses every write, as it does past its daily write limit. */
function refuseKvWrites(env) {
  const refuse = async () => {
    throw new Error("KV PUT failed: 429 Too Many Requests");
  };
  env.ENTITLEMENTS.put = refuse;
  env.ENTITLEMENTS.delete = refuse;
  return env;
}

/** Call the router and read the JSON answer. A throw (the 500 a provider sees) comes back as `{thrown}`. */
async function call(env, request, options) {
  try {
    const res = await handleRequest(request, env, { ledger: NO_WAIT, ...(options || {}) });
    return { status: res.status, body: await res.json() };
  } catch (error) {
    return { status: 500, thrown: error };
  }
}

/** A JSON request, signed in when given a session token. */
function jsonRequest(method, path, body, token) {
  const headers = { "content-type": "application/json" };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return new Request(`${BASE}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

/** A signed Stripe event. */
function stripe(env, id, type, object, options) {
  const raw = JSON.stringify({ id, type, created: T, data: { object } });
  const ts = Math.floor(Date.now() / 1000);
  const signature = `t=${ts},v1=${hmacHex(env.STRIPE_WEBHOOK_SECRET, `${ts}.${raw}`)}`;
  return call(env, new Request(`${BASE}/v1/webhooks/stripe`, { method: "POST", body: raw, headers: { "Stripe-Signature": signature } }), options);
}

/** A signed Creem event. */
function creem(env, id, eventType, object, options) {
  const raw = JSON.stringify({ id, eventType, created_at: T * 1000, object });
  const headers = { "creem-signature": hmacHex(env.CREEM_WEBHOOK_SECRET, raw) };
  return call(env, new Request(`${BASE}/v1/webhooks/creem`, { method: "POST", body: raw, headers }), options);
}

/** A signed Mercado Pago notification for a payment, with the API answering `api`. */
async function mercadoPago(env, notificationId, paymentId, api, options) {
  const dataId = String(paymentId);
  const notification = { id: notificationId, type: "payment", action: "payment.updated", data: { id: dataId } };
  const ts = String(Math.floor(Date.now() / 1000));
  const requestId = `req-rails-${notificationId}`;
  const v1 = await hmacSha256Hex(env.MP_WEBHOOK_SECRET, buildMercadoPagoManifest({ dataId, requestId, ts }));
  const request = new Request(`${BASE}/v1/webhooks/mercadopago`, {
    method: "POST",
    body: JSON.stringify(notification),
    headers: { "content-type": "application/json", "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId }
  });
  return call(env, request, { fetchImpl: api, ...(options || {}) });
}

/** Mercado Pago's API answering with a resource, or with an HTTP status. */
const mpAnswers = (resource) => async () => ({ ok: true, status: 200, async json() { return resource; } });
const mpRefuses = (status) => async () => ({ ok: false, status, async json() { return { message: "not found" }; } });

/** The browser's claim on the way back from checkout. */
function claim(env, provider, sessionId) {
  return call(env, jsonRequest("POST", "/v1/claim", { provider, sessionId }));
}

/** Sign in by email code; returns the session token. */
async function signIn(env, email) {
  let code = null;
  const fetchImpl = async (url, init) => {
    code = (/\b(\d{6})\b/.exec(JSON.parse(init.body).text || "") || [])[1];
    return { ok: true, status: 200 };
  };
  assert.equal((await call(env, jsonRequest("POST", "/v1/auth/email/start", { email }), { now: T, fetchImpl })).status, 200);
  const verified = await call(env, jsonRequest("POST", "/v1/auth/email/verify", { email, code }), { now: T + 1 });
  assert.equal(verified.status, 200, `${email} signed in`);
  return verified.body.sessionToken;
}

/** The health probe's answer at `now`. */
function probe(env, now) {
  return call(env, new Request(`${BASE}/v1/health?probe=1`), { now });
}

// Stripe: a one-off yearly pass. Creem: a monthly subscription's checkout and
// its first payment, which are one transaction. Mercado Pago: an approved
// payment for the monthly plan.
const stripePass = (sessionId, paymentIntent) => ({
  id: sessionId, mode: "payment", customer: "cus_d1", payment_intent: paymentIntent, payment_status: "paid", metadata: { plan: "pro_yearly" }
});
const creemCheckout = (checkoutId, subscriptionId, transactionId) => ({
  id: checkoutId, object: "checkout", status: "completed", mode: "prod",
  order: { id: `ord_${checkoutId}`, amount: 1000, currency: "USD", status: "paid", type: "recurring", transaction: transactionId },
  product: { id: "prod_monthly", name: "Pro Monthly", billing_type: "recurring", billing_period: "every-month" },
  customer: { id: "cust_d1", email: "singer@example.com" },
  subscription: { id: subscriptionId, object: "subscription", status: "active" },
  metadata: {}
});
const creemPaid = (subscriptionId, transactionId) => ({
  id: subscriptionId, object: "subscription", status: "active", mode: "prod", collection_method: "charge_automatically",
  product: { id: "prod_monthly", name: "Pro Monthly", billing_period: "every-month" },
  customer: { id: "cust_d1", email: "singer@example.com" },
  items: [{ id: "sitem_1", product_id: "prod_monthly", units: 1 }],
  current_period_start_date: new Date(T * 1000).toISOString(),
  current_period_end_date: new Date((T + 31 * DAY) * 1000).toISOString(),
  canceled_at: null,
  last_transaction_id: transactionId,
  last_transaction: { id: transactionId, amount: 1000, amount_paid: 1000, status: "paid" },
  last_transaction_date: new Date(T * 1000).toISOString(),
  next_transaction_date: new Date((T + 31 * DAY) * 1000).toISOString()
});
const creemRefund = (refundId, transactionId, subscriptionId, checkoutId) => ({
  id: refundId, object: "refund", status: "succeeded", mode: "prod", refund_amount: 1000, refund_currency: "USD",
  reason: "requested_by_customer",
  transaction: { id: transactionId, amount: 1000, amount_paid: 1000, status: "refunded" },
  subscription: { id: subscriptionId, status: "canceled" },
  checkout: { id: checkoutId }, order: { id: `ord_${checkoutId}`, transaction: transactionId }, customer: { id: "cust_d1" },
  created_at: T * 1000
});
const mpPayment = (id) => ({
  id, status: "approved", date_approved: new Date(T * 1000).toISOString(), transaction_amount: 10, description: "Vocal Studio Pro mensual"
});

// ------------------------------------------------------------ the rails

test("on D1 every rail records its sale in the ledger alone, while KV refuses every write", async () => {
  // A rail that bypassed the ledger, or wrote its record to KV while its
  // marker went to D1, failed here with a 500 and recorded nothing.
  const env = refuseKvWrites(createAccountEnv({ ENTITLEMENTS: createFakeKv() }));
  assert.equal((await stripe(env, "evt_rails_s", "checkout.session.completed", stripePass("cs_rails", "pi_rails"))).status, 200, "Stripe");
  assert.equal((await creem(env, "evt_rails_c1", "checkout.completed", creemCheckout("ch_rails", "sub_rails", "tran_rails"))).status, 200, "Creem checkout");
  assert.equal((await creem(env, "evt_rails_c2", "subscription.paid", creemPaid("sub_rails", "tran_rails"))).status, 200, "Creem payment");
  assert.equal((await mercadoPago(env, 9301, 4301, mpAnswers(mpPayment(4301)))).status, 200, "Mercado Pago");

  for (const [provider, sessionId] of [["stripe", "cs_rails"], ["creem", "ch_rails"], ["mercadopago", "4301"]]) {
    const claimed = await claim(env, provider, sessionId);
    assert.equal(claimed.status, 200, `${provider}: the buyer's browser can claim it`);
    assert.equal(claimed.body.entitlement.status, "active");
  }
});

test("every route that reads a license finds one that exists in D1 alone", async () => {
  // /v1/license, /v1/me/link (by checkout and by license id), /v1/me and the
  // admin lookup each read KV in a planted defect, and saw a paying customer
  // as free: 404 on a token refresh, "pending" for ever on a link, no Pro on a
  // new device, and "free" in front of support staff.
  const env = createAccountEnv();
  assert.equal((await stripe(env, "evt_reads_s", "checkout.session.completed", stripePass("cs_reads", "pi_reads"))).status, 200);
  assert.equal((await creem(env, "evt_reads_c1", "checkout.completed", creemCheckout("ch_reads", "sub_reads", "tran_reads"))).status, 200);
  assert.equal((await creem(env, "evt_reads_c2", "subscription.paid", creemPaid("sub_reads", "tran_reads"))).status, 200);
  assert.equal(env.ENTITLEMENTS.writes, 0, "nothing was written to KV: these licenses are in D1 alone");

  const stripeLicense = (await claim(env, "stripe", "cs_reads")).body.licenseId;
  const creemLicense = (await claim(env, "creem", "ch_reads")).body.licenseId;
  assert.ok(stripeLicense && creemLicense);
  const refreshed = await call(env, jsonRequest("POST", "/v1/license", { licenseId: stripeLicense }));
  assert.equal(refreshed.status, 200, "/v1/license refreshes the token");
  assert.ok(refreshed.body.token);

  const buyer = await signIn(env, "buyer@example.test");
  const bySession = await call(env, jsonRequest("POST", "/v1/me/link", { provider: "stripe", sessionId: "cs_reads" }, buyer), { now: T + 2 });
  assert.equal(bySession.status, 200, "/v1/me/link by checkout session");
  assert.equal(bySession.body.entitlement.pro, true);
  const byLicense = await call(env, jsonRequest("POST", "/v1/me/link", { licenseId: creemLicense }, buyer), { now: T + 3 });
  assert.equal(byLicense.status, 200, "/v1/me/link by license id");

  const me = await call(env, jsonRequest("GET", "/v1/me", undefined, buyer), { now: T + 4 });
  assert.equal(me.status, 200);
  assert.equal(me.body.entitlement.status, "active", "/v1/me shows Pro on a new device");
  assert.ok(me.body.token, "and mints the license token for it");

  const admin = await signIn(env, "admin@example.test");
  const lookup = await call(env, jsonRequest("GET", "/v1/admin/account?email=buyer%40example.test", undefined, admin), { now: T + 5 });
  assert.equal(lookup.status, 200);
  assert.equal(lookup.body.entitlement.pro, true, "support staff see the customer as paying");
});

test("on D1 a refund that overtook its sale is retried, then applied once the sale lands (Stripe and Creem)", async () => {
  // The refund names a payment the worker has not seen yet, so it is answered
  // 500 for a day. A planted defect cleared its marker and noted the refusal
  // in KV while the ledger committed the marker: the retry an hour later was
  // a "duplicate", the refund was never applied, and the license kept Pro.
  const env = createAccountEnv();
  const stripeRefund = { id: "ch_ovt", created: T, customer: "cus_d1", payment_intent: "pi_ovt", refunded: true, amount: 5000, amount_refunded: 5000 };
  const early = await stripe(env, "evt_ovt_r", "charge.refunded", stripeRefund, { now: T });
  assert.deepEqual([early.status, early.body.reason], [500, "unknown_license"], "Stripe: the refund is early");
  assert.equal((await creem(env, "evt_ovt_cr", "refund.created", creemRefund("ref_ovt", "tran_ovt", "sub_ovt", "ch_ovt"), { now: T })).status, 500, "Creem: so is this one");

  assert.equal((await stripe(env, "evt_ovt_s", "checkout.session.completed", stripePass("cs_ovt", "pi_ovt"))).status, 200);
  assert.equal((await creem(env, "evt_ovt_c1", "checkout.completed", creemCheckout("ch_ovt", "sub_ovt", "tran_ovt"))).status, 200);
  assert.equal((await creem(env, "evt_ovt_c2", "subscription.paid", creemPaid("sub_ovt", "tran_ovt"))).status, 200);
  assert.equal((await claim(env, "stripe", "cs_ovt")).status, 200, "both sales landed");
  assert.equal((await claim(env, "creem", "ch_ovt")).status, 200);

  const stripeRetry = await stripe(env, "evt_ovt_r", "charge.refunded", stripeRefund, { now: T + 3600 });
  assert.deepEqual([stripeRetry.status, stripeRetry.body.reason], [200, undefined], "Stripe: the retry is applied, not dismissed");
  const creemRetry = await creem(env, "evt_ovt_cr", "refund.created", creemRefund("ref_ovt", "tran_ovt", "sub_ovt", "ch_ovt"), { now: T + 3600 });
  assert.deepEqual([creemRetry.status, creemRetry.body.reason], [200, undefined], "Creem: the same");
  assert.notEqual((await claim(env, "stripe", "cs_ovt")).status, 200, "Stripe: the money went back, so Pro did too");
  assert.notEqual((await claim(env, "creem", "ch_ovt")).status, 200, "Creem: the same");
});

test("on D1 a refund for a payment never seen is retried for a day and then acknowledged (Stripe and Creem)", async () => {
  // Control for the test above, and the other half of the window: an hour in
  // it is still retried (not dismissed as a duplicate), a day on it stops.
  const env = createAccountEnv();
  const ghost = { id: "ch_gh", created: T, customer: "cus_gh", payment_intent: "pi_gh", refunded: true, amount: 5000, amount_refunded: 5000 };
  const creemGhost = creemRefund("ref_gh", "tran_gh", "sub_gh", "ch_gh");
  for (const [at, status, label] of [[T, 500, "at first"], [T + 3600, 500, "an hour in"], [T + DAY + 1, 200, "a day on"]]) {
    const s = await stripe(env, "evt_gh_s", "charge.refunded", ghost, { now: at });
    assert.deepEqual([s.status, s.body.reason], [status, "unknown_license"], `Stripe, ${label}`);
    const c = await creem(env, "evt_gh_c", "refund.created", creemGhost, { now: at });
    assert.deepEqual([c.status, c.body.reason], [status, "unknown_license"], `Creem, ${label}`);
  }
});

test("on D1 a Mercado Pago payment its API has not caught up on is applied on the retry", async () => {
  // The API answers 404 for a payment the notification already names, so the
  // notification gets 500 and Mercado Pago retries. A planted defect cleared
  // the marker in KV while the ledger committed it: the retry was a
  // "duplicate", no license was written and the claim stayed pending for ever.
  const env = createAccountEnv();
  const first = await mercadoPago(env, 9302, 4302, mpRefuses(404));
  assert.deepEqual([first.status, first.body.reason], [500, "not_found"]);
  assert.equal((await claim(env, "mercadopago", "4302")).status, 202, "nothing to claim yet");
  const retry = await mercadoPago(env, 9302, 4302, mpAnswers(mpPayment(4302)));
  assert.deepEqual([retry.status, retry.body.reason], [200, undefined], "the retry is applied, not dismissed");
  assert.equal((await claim(env, "mercadopago", "4302")).status, 200);
});

// ------------------------------------------------------------ health flags

test("a Mercado Pago notification that cannot be confirmed for want of a token shows on the probe, with and without D1", async () => {
  // The token missing is the operator's fault: it is thrown, so the probe
  // hears of it. A planted defect answered 500 without throwing, and the
  // probe went on saying "ok"; another skipped the KV fallback on a
  // deployment without D1.
  for (const [label, make] of [["D1", () => createAccountEnv()], ["KV only", () => createTestEnv()]]) {
    const env = make();
    env.MP_ACCESS_TOKEN = "";
    const failed = await mercadoPago(env, 9303, 4303, mpAnswers(mpPayment(4303)), { now: T });
    assert.equal(failed.status, 500, `${label}: retried`);
    assert.match(String(failed.thrown && failed.thrown.message), /MP_ACCESS_TOKEN/, `${label}: thrown, so it is recorded`);
    const seen = await probe(env, T + 60);
    assert.equal(seen.status, 503, `${label}: the probe says so`);
    assert.equal(seen.body.probe.writes, "failing");
  }
});

/** KV whose keys expire on the test's clock, which the fake KV never does. */
function expiringKv(clock) {
  const kv = createFakeKv();
  const put = kv.put.bind(kv);
  const get = kv.get.bind(kv);
  const born = new Map();
  kv.put = async (key, value, options) => {
    born.set(key, clock.now);
    return put(key, value, options);
  };
  kv.get = async (key) => {
    const ttl = kv.ttlOf(key);
    return ttl && clock.now >= born.get(key) + ttl ? null : get(key);
  };
  return kv;
}

test("a failure flagged in KV is reported for the whole hour, and not a second more, as the D1 row is", async () => {
  // The KV copy is what is left when D1 refused the flag's row. A TTL shorter
  // than the hour lost it early: a pinger every five minutes read "ok" for a
  // failure it should have seen. And the two copies must agree on the hour's
  // last second.
  const clock = { now: T };
  const kvOnly = createTestEnv({ ENTITLEMENTS: expiringKv(clock) });
  await noteHealthFlag(undefined, WEBHOOK_FAILED_FLAG, "stripe: test", T, kvOnly.ENTITLEMENTS);
  const withDb = createAccountEnv();
  await noteHealthFlag(withDb.DB, WEBHOOK_FAILED_FLAG, "stripe: test", T, withDb.ENTITLEMENTS);
  for (const [offset, writes] of [[300, "failing"], [HEALTH_FLAG_WINDOW_SECONDS - 1, "failing"], [HEALTH_FLAG_WINDOW_SECONDS, null]]) {
    clock.now = T + offset;
    const fromKv = await probe(kvOnly, T + offset);
    const fromDb = await probe(withDb, T + offset);
    if (writes) {
      assert.equal(fromKv.body.probe.writes, writes, `KV copy, ${offset} s on`);
      assert.equal(fromDb.body.probe.writes, writes, `D1 row, ${offset} s on`);
    } else {
      assert.notEqual(fromKv.body.probe.writes, "failing", `KV copy, ${offset} s on: the hour is over`);
      assert.notEqual(fromDb.body.probe.writes, "failing", `D1 row, ${offset} s on: the hour is over`);
    }
  }
});

test("each flag's KV copy is kept under its own name, so a failed sweep is not reported as a failed webhook", async () => {
  const env = createTestEnv();
  await noteHealthFlag(undefined, SWEEP_FAILED_FLAG, "sessions", T, env.ENTITLEMENTS);
  assert.equal(await env.ENTITLEMENTS.get(healthFlagKey(SWEEP_FAILED_FLAG)), String(T));
  assert.equal(await env.ENTITLEMENTS.get(healthFlagKey(WEBHOOK_FAILED_FLAG)), null);
  const seen = await probe(env, T + 60);
  assert.notEqual(seen.body.probe.writes, "failing", "no webhook failed");
});

// ------------------------------------------------------- license id key rotation

test("rotating the license-id key leaves a license found through its index whole, on D1 and on KV", async () => {
  // license.js promises that rotating LICENSE_ID_KEY cannot orphan an existing
  // license. A planted defect read the record under the id the new key
  // derives (where nothing is) before the one the index names, and rebuilt
  // the license from the one event: a yearly subscriber's paid period and the
  // payment that bought it were gone.
  const yearly = { price: { id: "price_y", recurring: { interval: "year", interval_count: 1 } }, current_period_end: T + 365 * DAY };
  const subscription = (status, extra) => ({ id: "sub_rot", customer: "cus_rot", status, items: { data: [yearly] }, ...(extra || {}) });
  for (const [label, make] of [["D1", () => createAccountEnv()], ["KV", () => createTestEnv()]]) {
    const env = make();
    env.LICENSE_ID_KEY = "old-key";
    assert.equal((await stripe(env, "evt_rot_1", "customer.subscription.created", subscription("active"))).status, 200);
    assert.equal((await stripe(env, "evt_rot_2", "invoice.paid", {
      subscription: "sub_rot", customer: "cus_rot", payment_intent: "pi_rot",
      lines: { data: [{ period: { end: T + 365 * DAY }, price: { id: "price_y" } }] }
    })).status, 200);
    assert.equal((await stripe(env, "evt_rot_3", "checkout.session.completed", {
      id: "cs_rot", mode: "subscription", customer: "cus_rot", subscription: "sub_rot", payment_status: "paid"
    })).status, 200);
    const before = await claim(env, "stripe", "cs_rot");
    assert.equal(before.status, 200, `${label}: sold`);

    env.LICENSE_ID_KEY = "new-key";
    assert.equal((await stripe(env, "evt_rot_4", "customer.subscription.updated", subscription("active", { cancel_at_period_end: true }))).status, 200);
    const reader = ledgerReader(env);
    const record = await getEntitlement(reader, before.body.licenseId);
    assert.equal(record.plan, "pro_yearly", `${label}: still yearly`);
    assert.equal(record.periodPaymentId, "pi_rot", `${label}: and the payment that bought the year is still on it`);
    assert.equal(record.periodEnd, T + 365 * DAY);
    const after = await claim(env, "stripe", "cs_rot");
    assert.deepEqual([after.status, after.body.licenseId], [200, before.body.licenseId], `${label}: the same license`);
  }
});
