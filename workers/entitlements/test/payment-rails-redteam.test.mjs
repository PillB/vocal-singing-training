/**
 * Five faults the red-team round of 18 November 2026 found in the payment
 * rails, each reproduced on main 09dd270 through the worker's real router:
 *
 * - INPUT-1: an unsigned request to a webhook route could trip the "payment
 *   webhook writes failing" alarm for an hour, because the failure recorder
 *   wrapped code that runs before the signature is checked, and the Mercado
 *   Pago pointer converted an unchecked JSON value to a string.
 * - WH-1: Mercado Pago's numeric payment and authorized-payment ids, which
 *   are sequential and printed on the payer's receipt, were claim keys for a
 *   subscription: anybody holding one got its token, or linked it to their
 *   own account first and left the payer with 409.
 * - WH-2: on Creem with no product table, buyer-written `metadata[plan]`
 *   outranked the product's own billing period.
 * - WH-3: with the Stripe price table filled in, a checkout session (which
 *   carries no price in a webhook) still entitled: a one-time payment for any
 *   other product, or a later checkout lifting an unlisted price's suspension.
 * - WH-4: the Mercado Pago signature was checked over the body's `data.id`,
 *   while the documented manifest signs the query string's.
 *
 * Every test here was run against the code before its fix and failed there,
 * and each fault has a control beside it, so a fix that simply removes the
 * behaviour (no alarm at all, no claim at all) fails too.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { ensureSchema } from "../src/db.js";
import { handleRequest } from "../src/index.js";
import { hmacSha256Hex } from "../src/license.js";
import { buildMercadoPagoManifest, resolveNotificationTarget } from "../src/mercadopago.js";
import { mapCreemEvent, planForProduct } from "../src/creem.js";
import { MP_CLAIM_IP_LIMIT } from "../src/limits.js";
import { createAccountEnv } from "./fixtures.mjs";

const BASE = "https://entitlements.test";
const DAY = 86400;
const T = Math.floor(Date.now() / 1000);
const NO_WAIT = { sleep: async () => {}, random: () => 0 };
const iso = (seconds) => new Date(seconds * 1000).toISOString();
const hmacHex = (secret, message) => createHmac("sha256", secret).update(message).digest("hex");

// ------------------------------------------------------------------ helpers

/** Call the router and read the JSON answer. A throw (the 500 a provider sees) comes back as `{thrown}`. */
async function call(env, request, options) {
  try {
    const res = await handleRequest(request, env, { ledger: NO_WAIT, ...(options || {}) });
    return { status: res.status, body: await res.json() };
  } catch (error) {
    return { status: 500, thrown: error };
  }
}

/** A JSON request from `ip`, signed in when given a session token. */
function jsonRequest(path, body, { token, ip } = {}) {
  const headers = { "content-type": "application/json", "cf-connecting-ip": ip || "203.0.113.7" };
  if (token) {
    headers.authorization = `Bearer ${token}`;
  }
  return new Request(`${BASE}${path}`, { method: "POST", headers, body: JSON.stringify(body) });
}

/** The browser's claim on the way back from checkout. */
function claim(env, provider, sessionId, ip) {
  return call(env, jsonRequest("/v1/claim", { provider, sessionId }, { ip }), { now: T + 2 });
}

/** A signed-in browser's link of a checkout to its account. */
function link(env, token, provider, sessionId, ip) {
  return call(env, jsonRequest("/v1/me/link", { provider, sessionId }, { token, ip }), { now: T + 2 });
}

/** Sign in by email code; returns the session token. */
async function signIn(env, email) {
  let code = null;
  const fetchImpl = async (url, init) => {
    code = (/\b(\d{6})\b/.exec(JSON.parse(init.body).text || "") || [])[1];
    return { ok: true, status: 200 };
  };
  const ip = `198.51.100.${email.length}`;
  assert.equal((await call(env, jsonRequest("/v1/auth/email/start", { email }, { ip }), { now: T, fetchImpl })).status, 200);
  const verified = await call(env, jsonRequest("/v1/auth/email/verify", { email, code }, { ip }), { now: T + 1 });
  assert.equal(verified.status, 200, `${email} signed in`);
  return verified.body.sessionToken;
}

/** The health probe's answer at `now`. */
function probe(env, now) {
  return call(env, new Request(`${BASE}/v1/health?probe=1`), { now: now || T + 60 });
}

/** The webhook-failure rows in D1 (the table exists once anything has used the schema). */
async function flags(env) {
  await ensureSchema(env.DB);
  return (await env.DB.prepare("SELECT name, detail FROM health_flags").all()).results;
}

/** A signed Stripe event created at `created`. */
function stripe(env, id, type, object, created) {
  const raw = JSON.stringify({ id, type, created: created || T, data: { object } });
  const ts = Math.floor(Date.now() / 1000);
  const signature = `t=${ts},v1=${hmacHex(env.STRIPE_WEBHOOK_SECRET, `${ts}.${raw}`)}`;
  return call(env, new Request(`${BASE}/v1/webhooks/stripe`, { method: "POST", body: raw, headers: { "Stripe-Signature": signature } }));
}

/** A signed Creem event at `at` (unix seconds). */
function creem(env, id, eventType, object, at) {
  const raw = JSON.stringify({ id, eventType, created_at: at * 1000, object });
  const headers = { "creem-signature": hmacHex(env.CREEM_WEBHOOK_SECRET, raw) };
  return call(env, new Request(`${BASE}/v1/webhooks/creem`, { method: "POST", body: raw, headers }), { now: at });
}

/**
 * A Mercado Pago notification. `signedId` is what the signature covers;
 * `queryId` and `bodyId` are where the request carries the resource's id.
 */
async function mercadoPago(env, { kind, notificationId, signedId, queryId, bodyId, api }) {
  const ts = String(Math.floor(Date.now() / 1000));
  const requestId = `req-rt-${notificationId}`;
  const v1 = await hmacSha256Hex(env.MP_WEBHOOK_SECRET, buildMercadoPagoManifest({ dataId: signedId, requestId, ts }));
  const query = queryId === undefined ? "" : `?data.id=${encodeURIComponent(queryId)}&type=${kind}`;
  const body = { id: notificationId, type: kind, action: `${kind}.updated`, data: { id: bodyId } };
  const request = new Request(`${BASE}/v1/webhooks/mercadopago${query}`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId }
  });
  return call(env, request, { fetchImpl: api });
}

/** Mercado Pago's API answering by path, recording every path it was asked for. */
function mpApi(resources) {
  const asked = [];
  const fetchImpl = async (url) => {
    const path = new URL(url).pathname;
    asked.push(path);
    const body = resources[path];
    return body
      ? { ok: true, status: 200, async json() { return body; } }
      : { ok: false, status: 404, async json() { return { message: "not found" }; } };
  };
  return { fetchImpl, asked };
}

// ------------------------------------------------- INPUT-1: the alarm's gate

/** An unsigned Mercado Pago POST whose body is `raw`. */
function unsignedMercadoPago(env, raw) {
  return call(env, new Request(`${BASE}/v1/webhooks/mercadopago`, { method: "POST", body: raw, headers: { "content-type": "application/json" } }));
}

for (const [label, overrides] of [["configured", {}], ["not configured, as in production", { MP_WEBHOOK_SECRET: undefined, MP_ACCESS_TOKEN: undefined }]]) {
  test(`an unsigned Mercado Pago body that cannot be turned into an id is refused and raises no alarm (Mercado Pago ${label})`, async () => {
    const env = createAccountEnv(overrides);
    for (const raw of [
      '{"type":"payment","data":{"id":{"toString":1}}}',
      '{"type":"payment","id":{"toString":1}}',
      '{"type":"payment","id":{"valueOf":1,"toString":1},"data":{"id":"123"}}',
      '{"type":"payment","data":{"id":["1"]}}'
    ]) {
      const answer = await unsignedMercadoPago(env, raw);
      assert.ok(answer.status >= 400 && answer.status < 500, `${raw}: refused as the caller's fault, got ${answer.status}`);
      assert.equal(answer.thrown, undefined, `${raw}: nothing thrown`);
    }
    assert.deepEqual(await flags(env), [], "no failure recorded");
    const seen = await probe(env);
    assert.equal(seen.status, 200, "the probe stays green");
    assert.notEqual(seen.body.probe.writes, "failing");
  });
}

test("a webhook whose body stream breaks before it is signed raises no alarm, on any rail", async () => {
  for (const rail of ["stripe", "creem", "mercadopago"]) {
    const env = createAccountEnv();
    let sent = 0;
    const body = new ReadableStream({
      pull(controller) {
        if (sent++ === 0) {
          controller.enqueue(new TextEncoder().encode('{"id":"evt_'));
        } else {
          controller.error(new Error("client disconnected"));
        }
      }
    });
    const answer = await call(env, new Request(`${BASE}/v1/webhooks/${rail}`, { method: "POST", body, duplex: "half" }));
    assert.notEqual(answer.status, 200, `${rail}: not accepted`);
    assert.deepEqual(await flags(env), [], `${rail}: no failure recorded`);
    assert.notEqual((await probe(env)).body.probe.writes, "failing", `${rail}: the probe stays green`);
  }
});

test("control: a signed delivery whose write fails still raises the alarm, on every rail", async () => {
  // Without this, removing the recorder altogether would pass the tests above.
  // The ledger commits in one D1 batch; once the schema exists, every batch is refused.
  const refuseBatches = async (env) => {
    await probe(env);
    env.DB.batch = async () => {
      throw new Error("D1_ERROR: database is locked");
    };
    return env;
  };
  const stripeEnv = await refuseBatches(createAccountEnv());
  const stripeAnswer = await stripe(stripeEnv, "evt_alarm", "checkout.session.completed", {
    id: "cs_alarm", mode: "payment", payment_status: "paid", metadata: { plan: "pro_yearly" }
  });
  assert.equal(stripeAnswer.status, 500, "stripe: the delivery failed");
  const creemEnv = await refuseBatches(createAccountEnv());
  const creemAnswer = await creem(creemEnv, "evt_alarm", "checkout.completed", {
    id: "ch_alarm", object: "checkout", status: "completed", order: { status: "paid", transaction: "tran_alarm" },
    product: { id: "prod_monthly", billing_period: "every-month" }, subscription: { id: "sub_alarm", status: "active" }, metadata: {}
  }, T);
  assert.equal(creemAnswer.status, 500, "creem: the delivery failed");
  // Mercado Pago's own operator fault, signed: no access token to confirm with.
  const mpEnv = createAccountEnv({ MP_ACCESS_TOKEN: "" });
  const mpAnswer = await mercadoPago(mpEnv, { kind: "payment", notificationId: 1, signedId: "77", bodyId: "77", api: mpApi({}).fetchImpl });
  assert.equal(mpAnswer.status, 500, "mercadopago: the delivery failed");
  for (const [rail, env] of [["stripe", stripeEnv], ["creem", creemEnv], ["mercadopago", mpEnv]]) {
    delete env.DB.batch;
    const seen = await probe(env);
    assert.equal(seen.status, 503, `${rail}: the probe says so`);
    assert.equal(seen.body.probe.writes, "failing", rail);
  }
});

test("the Mercado Pago pointer takes only a string or a number as an id", () => {
  const url = new URL(`${BASE}/v1/webhooks/mercadopago`);
  for (const bad of [{ toString: 1 }, ["1"], { id: "1" }, true]) {
    const target = resolveNotificationTarget({ type: "payment", id: bad, data: { id: bad } }, url);
    assert.equal(target.id, null, `${JSON.stringify(bad)} is no id`);
    assert.equal(target.eventId, null, `${JSON.stringify(bad)} names no event`);
  }
  // Controls: the shapes Mercado Pago really sends.
  assert.deepEqual(resolveNotificationTarget({ type: "payment", id: 991, action: "payment.updated", data: { id: "77" } }, url),
    { kind: "payment", id: "77", eventId: "payment.updated:991" });
  assert.deepEqual(resolveNotificationTarget({ type: "payment", data: { id: 77 } }, url),
    { kind: "payment", id: "77", eventId: "payment:77" });
  assert.equal(resolveNotificationTarget({}, new URL(`${BASE}/x?topic=payment&id=55`)).id, "55", "the legacy query shape");
});

// ------------------------------------------ WH-4: the manifest's own data.id

test("Mercado Pago's signature is checked over the query string's data.id, and that id is the one fetched", async () => {
  const env = createAccountEnv();
  const api = mpApi({
    "/v1/payments/555": { id: 555, status: "approved", date_approved: iso(T), date_created: iso(T), payer: { id: 9 } }
  });
  const answer = await mercadoPago(env, { kind: "payment", notificationId: 41, signedId: "555", queryId: "555", bodyId: "556", api: api.fetchImpl });
  assert.equal(answer.status, 200, `signed as documented: ${JSON.stringify(answer.body)}`);
  assert.deepEqual(api.asked, ["/v1/payments/555"], "the verified id is the one read, never the body's");
  // Control: a signature over the body's id, with the query naming another, is refused.
  const forged = await mercadoPago(env, { kind: "payment", notificationId: 42, signedId: "556", queryId: "555", bodyId: "556", api: api.fetchImpl });
  assert.deepEqual([forged.status, forged.body.reason], [400, "signature_mismatch"]);
  // Control: with no query id (the shape the d1-rails tests send) the body's is signed and fetched.
  const bodyOnly = await mercadoPago(env, { kind: "payment", notificationId: 43, signedId: "555", bodyId: "555", api: api.fetchImpl });
  assert.equal(bodyOnly.status, 200);
});

// -------------------------------------- WH-1: receipt numbers are not keys

const PRE = "2c938084726fca480172750000000abc";
const PAY = "1325467890";
const AUTH_PAY = "7012345678";

/** A Mercado Pago subscription, its first charge and its authorized payment, all delivered. */
async function mpSubscription(env) {
  const api = mpApi({
    [`/preapproval/${PRE}`]: {
      id: PRE, status: "authorized", payer_id: 77, reason: "Vocal Studio Pro mensual",
      auto_recurring: { frequency: 1, frequency_type: "months" },
      next_payment_date: iso(T + 30 * DAY), date_created: iso(T - 5), last_modified: iso(T - 4)
    },
    [`/v1/payments/${PAY}`]: {
      id: Number(PAY), status: "approved", preapproval_id: PRE, transaction_amount: 29.9, currency_id: "PEN",
      date_approved: iso(T - 3), date_created: iso(T - 3), date_last_updated: iso(T - 3), payer: { id: 77 }
    },
    [`/authorized_payments/${AUTH_PAY}`]: {
      id: Number(AUTH_PAY), preapproval_id: PRE, status: "processed", debit_date: iso(T - 3), date_created: iso(T - 3),
      last_modified: iso(T - 2), payment: { id: Number(PAY), status: "approved", date_approved: iso(T - 3) }
    }
  });
  for (const [kind, id, n] of [["subscription_preapproval", PRE, 9001], ["payment", PAY, 9002], ["subscription_authorized_payment", AUTH_PAY, 9003]]) {
    const answer = await mercadoPago(env, { kind, notificationId: n, signedId: id, queryId: id, bodyId: id, api: api.fetchImpl });
    assert.equal(answer.status, 200, `${kind} applied: ${JSON.stringify(answer.body)}`);
  }
}

test("a Mercado Pago subscription is claimed by its preapproval id, never by a charge's receipt number", async () => {
  const env = createAccountEnv();
  await mpSubscription(env);
  for (const id of [PAY, AUTH_PAY]) {
    const guessed = await claim(env, "mercadopago", id);
    assert.notEqual(guessed.status, 200, `a charge's number (${id}) hands out no token`);
    assert.equal(guessed.body.token, undefined);
  }
  // Control: the buyer's own return id still works.
  const own = await claim(env, "mercadopago", PRE);
  assert.equal(own.status, 200, "the preapproval id claims the subscription");
  assert.equal(own.body.entitlement.status, "active");
});

test("nobody can link a Mercado Pago subscription by a charge's number, so its payer can still link it", async () => {
  const env = createAccountEnv();
  await mpSubscription(env);
  const attacker = await signIn(env, "attacker@example.test");
  for (const id of [PAY, AUTH_PAY]) {
    const taken = await link(env, attacker, "mercadopago", id, "192.0.2.66");
    assert.notEqual(taken.status, 200, `a charge's number (${id}) links nothing`);
  }
  const buyer = await signIn(env, "buyer@example.test");
  const own = await link(env, buyer, "mercadopago", PRE, "192.0.2.10");
  assert.equal(own.status, 200, `the payer links their own subscription: ${JSON.stringify(own.body)}`);
});

test("a one-off Mercado Pago payment's number claims it, but one address cannot walk the sequence", async () => {
  // A one-off Checkout Pro payment comes back with nothing but its number, so
  // the number stays its claim key. What stops a walk is the throttle.
  const env = createAccountEnv();
  const api = mpApi({
    "/v1/payments/4400": { id: 4400, status: "approved", date_approved: iso(T), date_created: iso(T), payer: { id: 5 } }
  });
  const sold = await mercadoPago(env, { kind: "payment", notificationId: 5, signedId: "4400", bodyId: "4400", api: api.fetchImpl });
  assert.equal(sold.status, 200);
  assert.equal((await claim(env, "mercadopago", "4400", "192.0.2.1")).status, 200, "the payer's own claim works");
  const [limit] = MP_CLAIM_IP_LIMIT;
  const answers = [];
  for (let n = 0; n < limit + 5; n += 1) {
    answers.push((await claim(env, "mercadopago", String(5000 + n), "192.0.2.99")).status);
  }
  assert.ok(answers.slice(0, limit - 1).every((s) => s === 202), "the first tries are answered as usual");
  assert.ok(answers.slice(limit).every((s) => s === 429), `then the address is held back: ${answers.join(",")}`);
  assert.equal((await claim(env, "mercadopago", "4400", "192.0.2.99")).status, 429, "even the real number, from that address");
  // Controls: another address, and the unguessable ids of the other rails, are not held back.
  assert.equal((await claim(env, "mercadopago", "4400", "192.0.2.2")).status, 200, "another address is not affected");
  for (let n = 0; n < limit + 5; n += 1) {
    assert.equal((await claim(env, "stripe", `cs_test_${n}`, "192.0.2.99")).status, 202, "a Stripe session id is not throttled");
  }
  assert.equal((await claim(env, "mercadopago", PRE, "192.0.2.99")).status, 202, "nor is a preapproval id");
  // And the address is not what the bucket is named after.
  const buckets = (await env.DB.prepare("SELECT bucket FROM rate_limits").all()).results.map((r) => r.bucket);
  assert.ok(buckets.length > 0, "the throttle wrote its bucket");
  assert.ok(buckets.every((b) => !b.includes("192.0.2")), `no raw address stored: ${buckets.join(", ")}`);
});

test("linking by a one-off Mercado Pago payment's number is throttled with the claim", async () => {
  const env = createAccountEnv();
  const token = await signIn(env, "walker@example.test");
  const [limit] = MP_CLAIM_IP_LIMIT;
  for (let n = 0; n < limit; n += 1) {
    await claim(env, "mercadopago", String(6000 + n), "192.0.2.77");
  }
  assert.equal((await link(env, token, "mercadopago", "6999", "192.0.2.77")).status, 429, "the same bucket");
  assert.equal((await link(env, token, "mercadopago", "6999", "192.0.2.78")).status, 202, "control: another address");
});

// ------------------------------------- WH-2: Creem never reads metadata.plan

test("Creem with no product table takes the plan from the product's billing period, whatever the buyer wrote in metadata", () => {
  const plan = (eventType, object) => {
    const { update } = mapCreemEvent({ id: `evt_${eventType}`, eventType, created_at: T * 1000, object }, {});
    return [update.plan, update.planSource];
  };
  const monthly = { id: "prod_m", billing_period: "every-month" };
  for (const metadata of [{ plan: "pro_yearly" }, { plan: "pro_monthly" }, null]) {
    const checkout = {
      id: "ch_m", object: "checkout", status: "completed", order: { status: "paid", transaction: "tran_m" },
      product: monthly, subscription: { id: "sub_m", object: "subscription", status: "active", metadata }, metadata
    };
    assert.deepEqual(plan("checkout.completed", checkout), ["pro_monthly", "billing_period"],
      `checkout: metadata ${JSON.stringify(metadata)} decides nothing`);
    const subscription = { id: "sub_m", object: "subscription", status: "active", product: monthly, metadata };
    assert.deepEqual(plan("subscription.active", subscription), ["pro_monthly", "billing_period"],
      `subscription: metadata ${JSON.stringify(metadata)} decides nothing`);
  }
  assert.deepEqual(planForProduct({ id: "prod_y", billing_period: "every-year" }, {}),
    { plan: "pro_yearly", planSource: "billing_period" }, "control: a yearly product is a year");
  assert.deepEqual(planForProduct({ id: "prod_x" }, {}),
    { plan: "pro_monthly", planSource: "default" }, "with no billing period the default is the short one");
});

test("Creem: ?metadata[plan]=pro_yearly on the monthly link buys one month, not a year", async () => {
  for (const [label, metadata] of [["control", {}], ["buyer metadata", { plan: "pro_yearly" }]]) {
    const env = createAccountEnv();
    const product = { id: "prod_monthly", billing_type: "recurring", billing_period: "every-month" };
    const sid = `sub_${label.replace(/\W/g, "")}`;
    const checkoutId = `ch_${label.replace(/\W/g, "")}`;
    await creem(env, `a_${sid}`, "checkout.completed", {
      id: checkoutId, object: "checkout", status: "completed", mode: "prod",
      order: { status: "paid", amount: 799, currency: "USD", transaction: "tran_1" }, product, customer: { id: "c" },
      subscription: { id: sid, object: "subscription", status: "active" }, metadata
    }, T);
    const subscription = (status, extra) => ({
      id: sid, object: "subscription", status, mode: "prod", product, customer: { id: "c" }, metadata,
      current_period_start_date: iso(T), current_period_end_date: iso(T + 30 * DAY), canceled_at: null, ...extra
    });
    await creem(env, `b_${sid}`, "subscription.paid", subscription("active", {
      last_transaction_id: "tran_1", last_transaction: { id: "tran_1", amount: 799, amount_paid: 799, status: "paid" },
      last_transaction_date: iso(T), next_transaction_date: iso(T + 30 * DAY)
    }), T + 1);
    await creem(env, `c_${sid}`, "subscription.canceled", subscription("canceled", { canceled_at: iso(T + DAY) }), T + DAY);
    const claimed = await claim(env, "creem", checkoutId);
    assert.equal(claimed.status, 200, label);
    assert.equal(claimed.body.entitlement.plan, "pro_monthly", `${label}: the product is monthly`);
    assert.ok(claimed.body.entitlement.periodEnd <= T + 31 * DAY, `${label}: one month paid for, not ${(claimed.body.entitlement.periodEnd - T) / DAY} days`);
  }
});

// ------------------------- WH-3: a Stripe checkout cannot vouch for a price

const LISTED = { STRIPE_PRICE_PRO_MONTHLY: "price_pro_monthly", STRIPE_PRICE_PRO_YEARLY: "price_pro_yearly" };
const oneTime = (id, metadata) => ({
  id, object: "checkout.session", mode: "payment", status: "complete", payment_status: "paid",
  amount_total: 100, currency: "usd", customer: "cus_x", payment_intent: `pi_${id}`, subscription: null, metadata
});

test("with the Stripe price table filled in, a one-time checkout that names no plan is not Pro", async () => {
  const env = createAccountEnv(LISTED);
  assert.equal((await stripe(env, "evt_donation", "checkout.session.completed", oneTime("cs_live_donation", {}))).status, 200);
  const donation = await claim(env, "stripe", "cs_live_donation");
  assert.notEqual(donation.status, 200, "a donation on the same account buys nothing");
  assert.equal(donation.body.token, undefined);
  // Controls: the owner's own pass names its plan, and with no table nothing is gated (how the repository ships).
  assert.equal((await stripe(env, "evt_pass", "checkout.session.completed", oneTime("cs_live_pass", { plan: "pro_yearly" }))).status, 200);
  assert.equal((await claim(env, "stripe", "cs_live_pass")).status, 200, "a pass with metadata.plan is Pro");
  const open = createAccountEnv();
  assert.equal((await stripe(open, "evt_open", "checkout.session.completed", oneTime("cs_live_open", {}))).status, 200);
  assert.equal((await claim(open, "stripe", "cs_live_open")).status, 200, "no table: a one-time checkout is a month, as before");
});

/** Stripe's order for a Checkout subscription: the subscription and its invoice, then the session `gap` seconds later. */
async function stripeSubscription(env, priceId, gap) {
  const sub = {
    id: `sub_${priceId}`, object: "subscription", status: "active", customer: "cus_y", current_period_end: T + 30 * DAY, metadata: {},
    items: { data: [{ price: { id: priceId, recurring: { interval: "month", interval_count: 1 } } }] }
  };
  await stripe(env, `e1_${priceId}`, "customer.subscription.created", sub, T);
  await stripe(env, `e2_${priceId}`, "invoice.paid", {
    id: `in_${priceId}`, customer: "cus_y", subscription: sub.id, status: "paid",
    lines: { data: [{ price: { id: priceId }, period: { start: T, end: T + 30 * DAY } }] }
  }, T);
  await stripe(env, `e3_${priceId}`, "checkout.session.completed", {
    id: `cs_${priceId}`, object: "checkout.session", mode: "subscription", status: "complete", payment_status: "paid",
    customer: "cus_y", subscription: sub.id, metadata: {}, created: T
  }, T + gap);
  return claim(env, "stripe", `cs_${priceId}`);
}

test("with the Stripe price table filled in, a checkout that lands after the subscription does not lift an unlisted price's suspension", async () => {
  for (const gap of [0, 3, 60]) {
    const env = createAccountEnv(LISTED);
    const other = await stripeSubscription(env, "price_other_cheap", gap);
    assert.notEqual(other.status, 200, `checkout ${gap} s later: still suspended`);
    assert.equal(other.body.token, undefined);
    // Control: the same order on a listed price is Pro.
    const ours = await stripeSubscription(env, "price_pro_monthly", gap);
    assert.equal(ours.status, 200, `checkout ${gap} s later on a listed price: ${JSON.stringify(ours.body)}`);
  }
});

test("with the Stripe price table filled in, a listed subscription whose checkout lands first still becomes Pro", async () => {
  const env = createAccountEnv(LISTED);
  const sub = {
    id: "sub_first", object: "subscription", status: "active", customer: "cus_z", current_period_end: T + 30 * DAY, metadata: {},
    items: { data: [{ price: { id: "price_pro_yearly", recurring: { interval: "year", interval_count: 1 } } }] }
  };
  await stripe(env, "f1", "checkout.session.completed", {
    id: "cs_first", object: "checkout.session", mode: "subscription", status: "complete", payment_status: "paid",
    customer: "cus_z", subscription: sub.id, metadata: {}
  }, T);
  assert.notEqual((await claim(env, "stripe", "cs_first")).status, 200, "nothing has named the price yet");
  await stripe(env, "f2", "customer.subscription.created", sub, T + 1);
  await stripe(env, "f3", "invoice.paid", {
    id: "in_first", customer: "cus_z", subscription: sub.id, status: "paid",
    lines: { data: [{ price: { id: "price_pro_yearly" }, period: { start: T, end: T + 365 * DAY } }] }
  }, T + 1);
  const claimed = await claim(env, "stripe", "cs_first");
  assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
  assert.equal(claimed.body.entitlement.plan, "pro_yearly");
});
