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

import { ensureSchema, releaseRateLimits, reserveRateLimits, sweepExpired } from "../src/db.js";
import { handleRequest } from "../src/index.js";
import { hmacSha256Hex } from "../src/license.js";
import { buildMercadoPagoManifest, resolveNotificationTarget } from "../src/mercadopago.js";
import { mapCreemEvent, planForProduct } from "../src/creem.js";
import { MP_CLAIM_DEPLOYMENT_LIMIT, MP_CLAIM_IP_LIMIT } from "../src/limits.js";
import { EVENTS_DAILY_CAP } from "../src/events.js";
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
  // A falsy `data` is no container: it must not stand in as the id itself.
  assert.equal(resolveNotificationTarget({ type: "payment", id: "123456", data: 0 }, url).id, "123456", "data: 0 names nothing");
  assert.equal(resolveNotificationTarget({ data: 0 }, new URL(`${BASE}/x?data.id=123456`)).eventId, "event:123456",
    "nor does it name the event");
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

// The throttle's own shape, on a clock that starts a UTC day: windows are
// aligned to the epoch, so H + 3600 starts a new window for an hour-long
// window and stays inside the same one for any longer window that divides a
// day. On the next hour after Date.now, a two-hour window passed half the runs.
const HOUR = 3600;
const H = T - (T % DAY) + DAY;
const claimAt = (env, id, ip, now) => call(env, jsonRequest("/v1/claim", { provider: "mercadopago", sessionId: id }, { ip }), { now });
const linkAt = (env, token, id, ip, now) => call(env, jsonRequest("/v1/me/link", { provider: "mercadopago", sessionId: id }, { token, ip }), { now });

/** `count` claims by numbers that name nothing, from `ipFor(n)`, at `now`; their statuses. */
async function misses(env, count, ipFor, now, from = 7000) {
  const statuses = [];
  for (let n = 0; n < count; n += 1) {
    statuses.push((await claimAt(env, String(from + n), ipFor(n), now)).status);
  }
  return statuses;
}

/** A one-off Mercado Pago payment 4400, delivered `status`, through an API whose answer the test can change. */
async function oneOff(env, status, api) {
  const resources = api ? api.resources : {};
  resources["/v1/payments/4400"] = {
    id: 4400, status, date_approved: status === "approved" ? iso(T) : null, date_created: iso(T), payer: { id: 5 },
    payment_type_id: "ticket"
  };
  const live = api || { resources, ...mpApi(resources) };
  const answer = await mercadoPago(env, { kind: "payment", notificationId: `4400-${status}`, signedId: "4400", bodyId: "4400", api: live.fetchImpl });
  assert.equal(answer.status, 200, `${status} delivered: ${JSON.stringify(answer.body)}`);
  return live;
}

test("a buyer polling their own unpaid Mercado Pago voucher is never held back, and claims it the moment it is paid", async () => {
  // The site POSTs a claim up to five times per page load while it gets 202,
  // so a voucher waiting to be paid used to spend the hour's tries in four
  // loads, and its payer got 429 once they had paid.
  const env = createAccountEnv();
  const api = await oneOff(env, "pending");
  for (let n = 0; n < MP_CLAIM_IP_LIMIT[0] * 2; n += 1) {
    const polled = await claimAt(env, "4400", "192.0.2.40", H + n);
    assert.equal(polled.status, 202, `poll ${n + 1}: still waiting for the voucher, not held back`);
  }
  await oneOff(env, "approved", api);
  const paid = await claimAt(env, "4400", "192.0.2.40", H + 100);
  assert.equal(paid.status, 200, `paid, and claimed: ${JSON.stringify(paid.body)}`);
  assert.equal(paid.body.entitlement.status, "active");
});

test("one address gets exactly its twenty misses an hour, and the next hour twenty more", async () => {
  const env = createAccountEnv();
  const [limit, window] = MP_CLAIM_IP_LIMIT;
  assert.equal(window, HOUR, "an hour, as documented");
  const ip = () => "192.0.2.50";
  const first = await misses(env, limit + 1, ip, H + 10);
  assert.deepEqual(first, [...new Array(limit).fill(202), 429], "the twentieth try passes and the twenty-first does not");
  for (const later of [H + 11, H + 600, H + window - 1]) {
    assert.equal((await claimAt(env, "7999", ip(), later)).status, 429, `still held back ${later - H} s into the hour`);
  }
  assert.equal((await claimAt(env, "7999", ip(), H + window)).status, 202, "the next hour starts again");
});

test("a signed-in walker linking by payment numbers alone is held to the same twenty misses", async () => {
  const env = createAccountEnv();
  const token = await signIn(env, "linkwalker@example.test");
  const [limit] = MP_CLAIM_IP_LIMIT;
  const answers = [];
  for (let n = 0; n < limit + 3; n += 1) {
    answers.push((await linkAt(env, token, String(8000 + n), "192.0.2.60", H + 10)).status);
  }
  assert.deepEqual(answers, [...new Array(limit).fill(202), 429, 429, 429], "links spend tries of their own");
  assert.equal((await linkAt(env, token, "8999", "192.0.2.61", H + 10)).status, 202, "control: another address");
});

test("moving to the next IPv6 address, or to an IPv4-mapped spelling, does not reset an address's tries", async () => {
  const env = createAccountEnv();
  const [limit] = MP_CLAIM_IP_LIMIT;
  // Twenty misses from twenty addresses inside one /56 (the fourth group's low byte and the interface id vary).
  const inBlock = (n) => `2001:db8:aa:11${(n % 256).toString(16).padStart(2, "0")}::${(n + 1).toString(16)}`;
  assert.deepEqual(await misses(env, limit, inBlock, H + 10), new Array(limit).fill(202));
  assert.equal((await claimAt(env, "7990", "2001:DB8:AA:11FF:abcd::9", H + 10)).status, 429, "the same /56, written another way");
  assert.equal((await claimAt(env, "7990", "2001:db8:aa:1200::1", H + 10)).status, 202, "control: the next /56 is somebody else");
  // An IPv4 address and its IPv4-mapped spelling are one caller...
  assert.deepEqual(await misses(env, limit, () => "192.0.2.70", H + 10, 7100), new Array(limit).fill(202));
  assert.equal((await claimAt(env, "7991", "::ffff:192.0.2.70", H + 10)).status, 429, "::ffff:192.0.2.70 is 192.0.2.70");
  // ...but two IPv4 clients never share a bucket because both look like IPv6 (CVE-2026-30827).
  assert.equal((await claimAt(env, "7991", "::ffff:192.0.2.71", H + 10)).status, 202, "::ffff:192.0.2.71 is somebody else");
});

test("a walk spread over many addresses meets the deployment's ceiling, which holds every number back until the hour turns", async () => {
  const env = createAccountEnv();
  await oneOff(env, "approved");
  const [ceiling, window] = MP_CLAIM_DEPLOYMENT_LIMIT;
  assert.equal(window, HOUR, "an hour, as documented");
  const spread = (n) => `10.${(n >> 8) & 255}.${n & 255}.1`;
  const walked = await misses(env, ceiling, spread, H + 10);
  assert.ok(walked.every((s) => s === 202), "each address is well inside its own twenty");
  assert.equal((await claimAt(env, "7998", "203.0.113.200", H + 11)).status, 429, "a fresh address: the ceiling is spent");
  assert.equal((await claimAt(env, "4400", "203.0.113.201", H + 11)).status, 429, "a real number too, or a 429 would mean miss");
  assert.equal((await claimAt(env, PRE, "203.0.113.202", H + 11)).status, 202, "a preapproval id is never held back");
  assert.equal((await claimAt(env, "7997", "203.0.113.203", H + HOUR - 1)).status, 429, "a fresh address in the hour's last second: still spent");
  assert.equal((await claimAt(env, "4400", "203.0.113.201", H + HOUR)).status, 200, "the next hour, the payer claims");
});

test("a number's record lasts the hour and belongs to the whole block", async () => {
  // A record that outlived its hour would make every number a block looked up
  // today free all day; one shorter than the hour, or kept per address, would
  // charge a payer again for their own number once a neighbour spent the block.
  const env = createAccountEnv();
  const [limit] = MP_CLAIM_IP_LIMIT;
  const payer = "2001:db8:ab:1100::1";
  const sameBlock = "2001:db8:ab:11ff::9";
  assert.equal((await claimAt(env, "4402", payer, H + 10)).status, 202, "before the webhook: recorded, one try");
  assert.deepEqual(await misses(env, limit - 1, () => sameBlock, H + 20, 77000), new Array(limit - 1).fill(202), "a neighbour spends the rest");
  assert.equal((await claimAt(env, "7994", sameBlock, H + 25)).status, 429, "control: the block is spent");
  assert.equal((await claimAt(env, "4402", sameBlock, H + 30)).status, 202, "another address in the /56 finds the record");
  assert.equal((await claimAt(env, "4402", payer, H + HOUR - 1)).status, 202, "still recorded in the hour's last second");
  assert.deepEqual(await misses(env, limit, () => sameBlock, H + HOUR + 10, 78000), new Array(limit).fill(202), "the next hour's twenty, spent again");
  assert.equal((await claimAt(env, "4402", payer, H + HOUR + 20)).status, 429, "the record went with its hour");
});

test("a payer whose webhook is late polls their own number as often as the site retries, and claims it once it lands", async () => {
  // Four page views of five POSTs each, all misses until the webhook lands:
  // counted per request, that was the whole hour's budget, and the payer got
  // 429 until the hour turned although nobody else had touched their number.
  const env = createAccountEnv();
  for (let n = 0; n < MP_CLAIM_IP_LIMIT[0] + 5; n += 1) {
    assert.equal((await claimAt(env, "4402", "192.0.2.90", H + 10 + n)).status, 202, `poll ${n + 1} before the webhook`);
  }
  // Control: the number costs one try, not none. Nineteen other numbers (a
  // neighbour behind the same address) fill the block...
  assert.deepEqual(await misses(env, MP_CLAIM_IP_LIMIT[0], () => "192.0.2.90", H + 300), [...new Array(MP_CLAIM_IP_LIMIT[0] - 1).fill(202), 429]);
  // ...and the payer's own number, already looked up this hour, is still asked about for free.
  assert.equal((await claimAt(env, "4402", "192.0.2.90", H + 400)).status, 202, "the payer polls on with the block full");
  const api = mpApi({ "/v1/payments/4402": { id: 4402, status: "approved", date_approved: iso(T), date_created: iso(T), payer: { id: 5 } } });
  assert.equal((await mercadoPago(env, { kind: "payment", notificationId: "n4402", signedId: "4402", bodyId: "4402", api: api.fetchImpl })).status, 200);
  const claimed = await claimAt(env, "4402", "192.0.2.90", H + 900);
  assert.equal(claimed.status, 200, `claimed once the webhook landed: ${JSON.stringify(claimed.body)}`);
});

test("a hit gives back exactly the block's one try, and the deployment's ceiling keeps it", async () => {
  // Every earlier assertion on the give-back started from a count of one, so
  // "minus one", "reset to zero" and "the wrong budget" all passed. The block:
  // nineteen misses, the block's own paid number, then exactly one more miss.
  const env = createAccountEnv();
  await oneOff(env, "approved");
  const [limit] = MP_CLAIM_IP_LIMIT;
  const ip = "192.0.2.140";
  assert.deepEqual(await misses(env, limit - 1, () => ip, H + 10, 70000), new Array(limit - 1).fill(202));
  assert.equal((await claimAt(env, "4400", ip, H + 11)).status, 200, "the block's own paid number");
  assert.deepEqual(await misses(env, 2, () => ip, H + 12, 71000), [202, 429], "one try left after the hit, not none and not twenty");
  // The ceiling counts every number looked up, hits included, so the rows the
  // throttle writes are capped by it: one short, a buyer's hit, then nothing.
  const [ceiling] = MP_CLAIM_DEPLOYMENT_LIMIT;
  const busy = createAccountEnv();
  await oneOff(busy, "approved");
  await misses(busy, ceiling - 1, (n) => `10.40.${n >> 8}.${n & 255}`, H + 10, 72000);
  assert.equal((await claimAt(busy, "4400", "10.41.0.1", H + 11)).status, 200, "the buyer's own number, with the last try");
  assert.equal((await claimAt(busy, "7996", "10.42.0.1", H + 12)).status, 429, "the hit kept the ceiling's try");
  assert.equal((await claimAt(busy, "4400", "10.41.0.1", H + 13)).status, 200, "and the buyer's block polls its number on for free");
});

test("a payer who polled their pending voucher polls it on after a neighbour spends the block, and claims it once paid", async () => {
  // A pending voucher already names its license, so its lookup is a hit and
  // gives the block's try back. What keeps the payer's next poll free once a
  // neighbour behind the same address spends the block is the record of the
  // number, and a test without the neighbour passes without the record.
  const env = createAccountEnv();
  const api = await oneOff(env, "pending");
  const ip = "192.0.2.141";
  assert.equal((await claimAt(env, "4400", ip, H + 10)).status, 202, "pending voucher");
  assert.deepEqual(await misses(env, MP_CLAIM_IP_LIMIT[0], () => ip, H + 20, 74000), new Array(MP_CLAIM_IP_LIMIT[0]).fill(202),
    "the neighbour spends the block's twenty");
  assert.equal((await claimAt(env, "7995", ip, H + 25)).status, 429, "control: the block is spent");
  assert.equal((await claimAt(env, "4400", ip, H + 30)).status, 202, "the payer polls on");
  await oneOff(env, "approved", api);
  assert.equal((await claimAt(env, "4400", ip, H + 40)).status, 200, "and claims once paid");
});

/**
 * The rows D1 bills for what the claim throttle writes to rate_limits,
 * however it is written (one statement for several rows, or one each),
 * counted by SQLite triggers with D1's rule: a new row is two (the table and
 * its primary-key index), a changed row one, a deleted row one (the sweep).
 * Counting changed rows only, as this did, said four a try where D1 bills up
 * to eight (sixth review). Call before remoteDatabase wraps the binding.
 * @returns {Promise<() => Promise<number>>} Reads the count so far.
 */
async function throttleRows(env, prefix = "mpclaim") {
  await ensureSchema(env.DB);
  const tag = prefix.replace(/\W/g, "_");
  await env.DB.exec(`CREATE TABLE IF NOT EXISTS rows_${tag} (n INTEGER NOT NULL);
    INSERT INTO rows_${tag} VALUES (0);
    CREATE TRIGGER rows_${tag}_i AFTER INSERT ON rate_limits WHEN NEW.bucket LIKE '${prefix}%' BEGIN UPDATE rows_${tag} SET n = n + 2; END;
    CREATE TRIGGER rows_${tag}_u AFTER UPDATE ON rate_limits WHEN NEW.bucket LIKE '${prefix}%' BEGIN UPDATE rows_${tag} SET n = n + 1; END;
    CREATE TRIGGER rows_${tag}_d AFTER DELETE ON rate_limits WHEN OLD.bucket LIKE '${prefix}%' BEGIN UPDATE rows_${tag} SET n = n + 1; END;`);
  const db = env.DB;
  return async () => Number((await db.prepare(`SELECT n FROM rows_${tag}`).first()).n);
}

/**
 * D1 as it is in production, a round trip away: every statement waits `ms`
 * (one timer tick by default), so requests sent together interleave as they
 * do on the edge (the in-memory database otherwise answers each request in
 * one go). Counts the claim-index lookups of Mercado Pago numbers.
 */
function remoteDatabase(env, ms = 1) {
  const db = env.DB;
  const seen = { lookups: 0, numbers: new Set() };
  const tick = () => new Promise((resolve) => setTimeout(resolve, ms));
  const wrap = (statement, sql) => ({
    inner: statement,
    bind: (...values) => {
      for (const v of values) {
        if (typeof v === "string" && v.startsWith("claim:mercadopago:")) {
          seen.lookups += 1;
          seen.numbers.add(v);
        }
      }
      return wrap(statement.bind(...values), sql);
    },
    first: async (column) => { await tick(); return statement.first(column); },
    all: async () => { await tick(); return statement.all(); },
    run: async () => { await tick(); return statement.run(); }
  });
  env.DB = {
    prepare: (sql) => wrap(db.prepare(sql), sql),
    batch: async (statements) => { await tick(); return db.batch(statements.map((st) => st.inner || st)); },
    exec: async (sql) => { await tick(); return db.exec(sql); }
  };
  return seen;
}

/** Requests sent all at once, or one every millisecond (as they arrive on the edge). */
const ARRIVALS = [
  ["together", (send) => (n) => send(n)],
  ["one per millisecond", (send) => (n) => new Promise((resolve) => setTimeout(resolve, n)).then(() => send(n))]
];

for (const [arrival, pace] of ARRIVALS) {
  test(`a burst of claims from one address, ${arrival}, looks up no more numbers than its twenty`, async () => {
    // Checking the budget, looking up, and spending only on a miss let every
    // request that checked before the first spend landed do its lookup: 2000
    // at once looked up all 2000 numbers and took the real payments' tokens.
    const env = createAccountEnv();
    const real = ["7150", "7180", "7290"];
    const api = mpApi(Object.fromEntries(real.map((id) => [`/v1/payments/${id}`,
      { id: Number(id), status: "approved", date_approved: iso(T), date_created: iso(T), payer: { id: 5 } }])));
    for (const id of real) {
      assert.equal((await mercadoPago(env, { kind: "payment", notificationId: `n${id}`, signedId: id, bodyId: id, api: api.fetchImpl })).status, 200);
    }
    const seen = remoteDatabase(env);
    const [limit] = MP_CLAIM_IP_LIMIT;
    const send = pace((n) => claimAt(env, String(7000 + n), "192.0.2.80", H + 10));
    const statuses = (await Promise.all(Array.from({ length: 300 }, (_, n) => send(n)))).map((answer) => answer.status);
    assert.equal(statuses.filter((s) => s === 200).length, 0, "no real payment found by the walk");
    assert.ok(seen.lookups <= limit, `${seen.lookups} numbers looked up, at most ${limit}`);
    assert.equal(statuses.filter((s) => s === 202).length, limit, "the twenty misses are answered as usual");
    // Control: the payer, from their own address, still claims.
    assert.equal((await claimAt(env, "7180", "192.0.2.81", H + 11)).status, 200);
  });

  test(`a burst of links from one account, ${arrival}, takes nobody's payment`, async () => {
    const env = createAccountEnv();
    const api = mpApi({ "/v1/payments/8150": { id: 8150, status: "approved", date_approved: iso(T), date_created: iso(T), payer: { id: 5 } } });
    assert.equal((await mercadoPago(env, { kind: "payment", notificationId: "n8150", signedId: "8150", bodyId: "8150", api: api.fetchImpl })).status, 200);
    const token = await signIn(env, "burstlinker@example.test");
    const seen = remoteDatabase(env);
    const send = pace((n) => linkAt(env, token, String(8000 + n), "192.0.2.82", H + 10));
    const burst = await Promise.all(Array.from({ length: 200 }, (_, n) => send(n)));
    assert.equal(burst.filter((answer) => answer.status === 200).length, 0, "nothing linked to the walker");
    assert.ok(seen.lookups <= MP_CLAIM_IP_LIMIT[0], `${seen.lookups} numbers looked up`);
  });

  test(`a walk that sends every number twice, ${arrival}, by claim and by link, looks up no more numbers than its twenty`, async () => {
    // Recording the number for the block BEFORE its tries were held let the
    // twin of a request that then lost its try look the number up for free:
    // every number sent twice was looked up, and every real payment taken.
    const env = createAccountEnv();
    const real = ["7150", "7180", "7290"];
    const api = mpApi(Object.fromEntries(real.map((id) => [`/v1/payments/${id}`,
      { id: Number(id), status: "approved", date_approved: iso(T), date_created: iso(T), payer: { id: 5 } }])));
    for (const id of real) {
      assert.equal((await mercadoPago(env, { kind: "payment", notificationId: `t${id}`, signedId: id, bodyId: id, api: api.fetchImpl })).status, 200);
    }
    const token = await signIn(env, "twinwalker@example.test");
    const written = await throttleRows(env);
    const seen = remoteDatabase(env);
    const ask = (n) => (n % 2
      ? linkAt(env, token, String(7000 + (n >> 1)), "192.0.2.83", H + 10)
      : claimAt(env, String(7000 + (n >> 1)), "192.0.2.83", H + 10));
    const send = pace(ask);
    const burst = await Promise.all(Array.from({ length: 600 }, (_, n) => send(n)));
    assert.equal(burst.filter((answer) => answer.status === 200).length, 0, "no real payment found, by claim or by link");
    assert.ok(seen.numbers.size <= MP_CLAIM_IP_LIMIT[0], `${seen.numbers.size} distinct numbers looked up, at most ${MP_CLAIM_IP_LIMIT[0]}`);
    // And the rows written are bounded by the budget, not by what arrived: a
    // refusal writes nothing, and each try the walk was allowed is its
    // number's new record and the two budgets' counts, six billed rows at most.
    const rows = await written();
    assert.ok(rows <= 6 * MP_CLAIM_IP_LIMIT[0], `${rows} billed rows written for a 600-request walk`);
  });
}

test("a walk that sends every number twice from many addresses looks up no more numbers than the deployment's ceiling", async () => {
  const env = createAccountEnv();
  const seen = remoteDatabase(env);
  const [ceiling] = MP_CLAIM_DEPLOYMENT_LIMIT;
  // 25 addresses, 16 numbers each (inside each address's twenty), every number twice.
  const burst = await Promise.all(Array.from({ length: 800 }, (_, n) => {
    const k = n >> 1;
    return claimAt(env, String(30000 + k), `10.11.${k >> 4}.1`, H + 10);
  }));
  assert.ok(seen.numbers.size <= ceiling, `${seen.numbers.size} distinct numbers looked up, at most ${ceiling}`);
  assert.ok(burst.some((answer) => answer.status === 429), "the ceiling refused the rest");
});

test("the deployment ceiling bounds lookups, not only spends, under a burst from many addresses", async () => {
  const env = createAccountEnv();
  const seen = remoteDatabase(env);
  const [ceiling] = MP_CLAIM_DEPLOYMENT_LIMIT;
  const burst = await Promise.all(Array.from({ length: ceiling + 100 }, (_, n) =>
    claimAt(env, String(20000 + n), `10.9.${(n >> 4) & 255}.${n & 15}`, H + 10)));
  assert.ok(seen.lookups <= ceiling, `${seen.lookups} numbers looked up, at most ${ceiling}`);
  assert.equal(burst.filter((answer) => answer.status === 202).length, ceiling);
});

test("a payer's link and claim sent together for their paid number both succeed with one try left", async () => {
  // The first request holds the block's last try while it looks; the second
  // used to find the budget full and refuse the payer's own number, and the
  // site sends the link only once.
  for (let run = 0; run < 10; run += 1) {
    const env = createAccountEnv();
    const token = await signIn(env, `pair${run}@example.test`);
    const api = mpApi({ "/v1/payments/4500": { id: 4500, status: "approved", date_approved: iso(T), date_created: iso(T), payer: { id: 5 } } });
    assert.equal((await mercadoPago(env, { kind: "payment", notificationId: `n4500-${run}`, signedId: "4500", bodyId: "4500", api: api.fetchImpl })).status, 200);
    await misses(env, MP_CLAIM_IP_LIMIT[0] - 1, () => "192.0.2.95", H + 10, 9000);
    remoteDatabase(env);
    const [linked, claimed] = await Promise.all([linkAt(env, token, "4500", "192.0.2.95", H + 20), claimAt(env, "4500", "192.0.2.95", H + 20)]);
    assert.equal(linked.status, 200, `run ${run}: the link, ${JSON.stringify(linked.body)}`);
    assert.equal(claimed.status, 200, `run ${run}: the claim`);
  }
});

/** A payer's link and claim of `number` sent together with the block one try short, D1 `ms` away; the claim sent `claimAfter` ms later. */
async function returnPair(tag, { number, paid, ms, claimAfter = 0 }) {
  const env = createAccountEnv();
  const token = await signIn(env, `${tag}@example.test`);
  if (paid) {
    const api = mpApi({ [`/v1/payments/${number}`]: { id: Number(number), status: "approved", date_approved: iso(T), date_created: iso(T), payer: { id: 5 } } });
    assert.equal((await mercadoPago(env, { kind: "payment", notificationId: `n-${tag}`, signedId: number, bodyId: number, api: api.fetchImpl })).status, 200);
  }
  await misses(env, MP_CLAIM_IP_LIMIT[0] - 1, () => "192.0.2.96", H + 10, 9100);
  remoteDatabase(env, ms);
  const later = new Promise((resolve) => setTimeout(resolve, claimAfter)).then(() => claimAt(env, number, "192.0.2.96", H + 20));
  const [linked, claimed] = await Promise.all([linkAt(env, token, number, "192.0.2.96", H + 20), later]);
  return [linked.status, claimed.status];
}

test("a payer whose webhook is late gets 202 for both the link and the claim sent together with one try left", async () => {
  // The request refused at the block's last try reads the number's record
  // again: its twin wrote it in the same statement as that try.
  for (let run = 0; run < 5; run += 1) {
    assert.deepEqual(await returnPair(`late${run}`, { number: "4402", paid: false, ms: 1 }), [202, 202], `run ${run}`);
  }
});

test("the payer's link and claim sent together both succeed at the D1 latency a payer in Peru sees", async () => {
  // D1 has no South American location, and nothing places this worker near
  // its database, so a statement is 100 ms or more from Lima. A wait of a
  // fixed 200 ms for the twin was shorter than the twin's own round trips,
  // and the link, which the site sends once, was refused.
  const cases = [
    ["paid, together", { number: "4501", paid: true, ms: 120 }, [200, 200]],
    ["paid, link first", { number: "4502", paid: true, ms: 120, claimAfter: 600 }, [200, 200]],
    ["late webhook, together", { number: "4503", paid: false, ms: 120 }, [202, 202]],
    ["late webhook, link first", { number: "4504", paid: false, ms: 120, claimAfter: 600 }, [202, 202]]
  ];
  const answers = await Promise.all(cases.map(([label, pair], i) => returnPair(`peru${i}`, pair)));
  cases.forEach(([label, , want], i) => assert.deepEqual(answers[i], want, label));
});

test("a payer's link and claim of their paid number sent together leave the block its whole twenty", async () => {
  // Only one of the two pays; the other finds the record, and the hit gives the block's try back.
  const env = createAccountEnv();
  await oneOff(env, "approved");
  const token = await signIn(env, "wholeblock@example.test");
  const ip = "192.0.2.143";
  remoteDatabase(env);
  const [linked, claimed] = await Promise.all([linkAt(env, token, "4400", ip, H + 10), claimAt(env, "4400", ip, H + 10)]);
  assert.deepEqual([linked.status, claimed.status], [200, 200]);
  assert.deepEqual(await misses(env, MP_CLAIM_IP_LIMIT[0] + 1, () => ip, H + 20, 76000), [...new Array(MP_CLAIM_IP_LIMIT[0]).fill(202), 429]);
});

test("the throttle writes at most eight billed rows for each of the deployment ceiling's tries, whatever arrives", async () => {
  // Eight: the number's record and the block's count, new (two each), the
  // ceiling's count, a hit's give-back, and the sweep's two deletes a day
  // later; plus three a day for the ceiling's own row.
  const [ceiling] = MP_CLAIM_DEPLOYMENT_LIMIT;
  const cap = 8 * ceiling + 3;
  const swept = async (env, rows) => {
    await sweepExpired(env.DB, H + 2 * DAY);
    return rows();
  };
  // Misses from 64 blocks, twenty each, all at once: the losers of the
  // ceiling's last tries used to take their block's try, lose the ceiling's,
  // and give the block's back, two rows each for a 429.
  const walked = createAccountEnv();
  const walkRows = await throttleRows(walked);
  remoteDatabase(walked);
  const walk = await Promise.all(Array.from({ length: 64 * 20 }, (_, n) =>
    claimAt(walked, String(40000 + n), `2001:db8:77:${(n % 64).toString(16)}00::1`, H + 10)));
  assert.equal(walk.filter((answer) => answer.status === 202).length, ceiling);
  const walkTotal = await swept(walked, walkRows);
  assert.ok(walkTotal <= cap, `${walkTotal} billed rows for a walk that the ceiling stopped at ${ceiling}`);
  // Copies of one paid number from 300 blocks, four each, all at once: each
  // copy used to take both tries and give both back, and nothing capped it.
  const copied = createAccountEnv();
  await oneOff(copied, "approved");
  const copyRows = await throttleRows(copied);
  remoteDatabase(copied);
  const copies = await Promise.all(Array.from({ length: 300 * 4 }, (_, n) =>
    claimAt(copied, "4400", `2001:db8:${(0x7800 + (n % 300)).toString(16)}:100::1`, H + 10)));
  assert.equal(copies.filter((answer) => answer.status === 200).length, ceiling * 4, "every copy from the blocks the ceiling let in claimed it");
  const copyTotal = await swept(copied, copyRows);
  assert.ok(copyTotal <= cap, `${copyTotal} billed rows for copies of one paid number`);
  // Control: the sweep did run, or the cap would hold for nothing.
  assert.equal((await walked.DB.prepare("SELECT COUNT(*) AS n FROM rate_limits WHERE bucket LIKE 'mpclaim%'").first()).n, 0);
});

test("the shipped deployment ceiling keeps the throttle's day inside what limits.js budgets for it", () => {
  // Not a behaviour test: a guard on the number, as the events cap has one.
  // The test above holds the throttle to eight billed rows a try; this holds
  // the tries a day to the budget: 9,600 rows and the ceiling row's three, a
  // quarter of what EVENTS_DAILY_CAP leaves the account layer of D1's free
  // 100,000. At 200 an hour (the fifth cut) it was 38,400.
  const [ceiling, windowSeconds] = MP_CLAIM_DEPLOYMENT_LIMIT;
  const perDay = 8 * ceiling * (DAY / windowSeconds) + 3;
  assert.ok(perDay <= 9600 + 3, `${ceiling} tries per ${windowSeconds} s is up to ${perDay} billed rows a day: re-budget D1's writes before raising it`);
  const [events] = EVENTS_DAILY_CAP;
  assert.ok(perDay <= (100000 - 6 * events) / 4, `${perDay} rows a day is more than a quarter of what ${events} events a day leave the account layer`);
  // And above one block's budget, or one block could hold every buyer back.
  assert.ok(ceiling > MP_CLAIM_IP_LIMIT[0], `a ceiling of ${ceiling} is spent by one block's ${MP_CLAIM_IP_LIMIT[0]} misses`);
});

test("asking again about a number the block has recorded reads the throttle once", async () => {
  // Polling is the hot path (every page load for a week, link and claim
  // together), and from Lima each D1 statement is 100 ms or more: the record
  // read that refuses the reservation is the answer, not a reason to read it
  // again.
  const env = createAccountEnv();
  assert.equal((await claimAt(env, "4402", "192.0.2.147", H + 10)).status, 202);
  const db = env.DB;
  let throttleStatements = 0;
  const counted = (statement) => ({
    inner: statement,
    bind: (...v) => counted(statement.bind(...v)),
    first: (c) => { throttleStatements += 1; return statement.first(c); },
    all: () => { throttleStatements += 1; return statement.all(); },
    run: () => { throttleStatements += 1; return statement.run(); }
  });
  env.DB = {
    prepare: (sql) => (/rate_limits/.test(sql) ? counted(db.prepare(sql)) : db.prepare(sql)),
    batch: (statements) => db.batch(statements.map((st) => st.inner || st)),
    exec: (sql) => db.exec(sql)
  };
  assert.equal((await claimAt(env, "4402", "192.0.2.147", H + 20)).status, 202);
  assert.equal(throttleStatements, 1, "one read of the record");
});

test("when D1 refuses the throttle's writes, a claim or link by a number fails closed and looks nothing up", async () => {
  // A write error while reads still answer: the throttle must not step aside
  // for a walker because it cannot count. (D1's free daily cap is not this
  // case: past it every query is refused, reads included, and sign-in fails
  // with the claim.)
  const env = createAccountEnv();
  await oneOff(env, "approved");
  const token = await signIn(env, "writesrefused@example.test");
  const seen = remoteDatabase(env);
  const db = env.DB;
  env.DB = {
    ...db,
    prepare: (sql) => (/^\s*(INSERT|UPDATE|DELETE)\b[\s\S]*rate_limits/i.test(sql)
      ? { bind: () => ({ run: async () => { throw new Error("D1_ERROR: writes refused"); } }) }
      : db.prepare(sql))
  };
  const claimed = await claimAt(env, "4400", "192.0.2.148", H + 10);
  const linked = await linkAt(env, token, "4400", "192.0.2.148", H + 10);
  assert.deepEqual([claimed.status, linked.status], [500, 500]);
  assert.equal(claimed.body && claimed.body.token, undefined, "no token");
  assert.equal(seen.lookups, 0, "nothing looked up without a try held");
  // Control: Stripe's random ids are not throttled, so they still answer.
  assert.notEqual((await claimAt(env, "cs_test_unknown", "192.0.2.148", H + 10)).status, 500);
});

for (const [route, who, ip] of [["/v1/me/link", "link", "192.0.2.149"], ["/v1/claim", "claim", "192.0.2.150"]]) {
  test(`a ${who} that holds its body back is counted in the hour it is read, not the hour it began`, async () => {
    // The link read its clock before its body, so links that sent their
    // headers in one hour and their bodies in the next spent the earlier
    // hour's budget, and each hour held back opened a budget of its own. The
    // claim reads its clock late too, and nothing held it there.
    const env = createAccountEnv();
    const token = who === "link" ? await signIn(env, "heldbody@example.test") : undefined;
    const [limit] = MP_CLAIM_IP_LIMIT;
    const realNow = Date.now;
    let clock = (H + HOUR - 30) * 1000;
    Date.now = () => clock;
    try {
      const held = Array.from({ length: limit }, (_, n) => {
        let release;
        const gate = new Promise((resolve) => { release = resolve; });
        const body = new ReadableStream({
          async pull(controller) {
            await gate;
            controller.enqueue(new TextEncoder().encode(JSON.stringify({ provider: "mercadopago", sessionId: String(62000 + n) })));
            controller.close();
          }
        });
        const headers = { "content-type": "application/json", "cf-connecting-ip": ip };
        if (token) {
          headers.authorization = `Bearer ${token}`;
        }
        const request = new Request(`${BASE}${route}`, { method: "POST", body, duplex: "half", headers });
        return { release, answer: call(env, request) };
      });
      await new Promise((resolve) => setTimeout(resolve, 50));
      clock = (H + HOUR + 30) * 1000;
      held.forEach((h) => h.release());
      const late = (await Promise.all(held.map((h) => h.answer))).map((answer) => answer.status);
      assert.deepEqual(late, new Array(limit).fill(202), `the held ${who}s spend this hour's twenty`);
      const fresh = await call(env, jsonRequest(route, { provider: "mercadopago", sessionId: "62999" }, { token, ip }));
      assert.equal(fresh.status, 429, "and nothing of this hour is left");
    } finally {
      Date.now = realNow;
    }
  });
}

test("a payment found is answered even when giving the block's try back fails", async () => {
  // The payment was found, so the claim and the link answer it; the failed
  // write costs the block one try and nobody a payment.
  const env = createAccountEnv();
  await oneOff(env, "approved");
  const token = await signIn(env, "giveback@example.test");
  const db = env.DB;
  env.DB = {
    prepare: (sql) => {
      if (/^UPDATE rate_limits SET count = count - 1/.test(sql)) {
        return { bind: () => ({ run: async () => { throw new Error("D1 is overloaded"); } }) };
      }
      return db.prepare(sql);
    },
    batch: (statements) => db.batch(statements),
    exec: (sql) => db.exec(sql)
  };
  const claimed = await claimAt(env, "4400", "192.0.2.144", H + 10);
  assert.equal(claimed.status, 200, JSON.stringify(claimed.body));
  const linked = await linkAt(env, token, "4400", "192.0.2.145", H + 10);
  assert.equal(linked.status, 200, JSON.stringify(linked.body));
});

/**
 * Stop a request (a D1 error, or the Worker cancelled) right after its
 * `stopAfter`-th write to the throttle: every statement after it throws.
 */
function cutAfterThrottleWrites(env, stopAfter) {
  const db = env.DB;
  let writes = 0;
  const live = () => {
    if (writes >= stopAfter) {
      throw new Error("the request was stopped");
    }
  };
  const wrap = (statement, sql) => ({
    inner: statement,
    bind: (...values) => wrap(statement.bind(...values), sql),
    first: async (column) => { live(); return statement.first(column); },
    all: async () => { live(); return statement.all(); },
    run: async () => {
      live();
      const result = await statement.run();
      if (/^\s*(INSERT INTO|UPDATE) rate_limits/.test(sql) && result && result.meta && result.meta.changes > 0) {
        writes += 1;
      }
      return result;
    }
  });
  env.DB = {
    prepare: (sql) => wrap(db.prepare(sql), sql),
    batch: async (statements) => { live(); return db.batch(statements.map((st) => st.inner || st)); },
    exec: async (sql) => { live(); return db.exec(sql); }
  };
  return () => { env.DB = db; };
}

test("a claim stopped part way never leaves its number free without a try spent for it", async () => {
  // The third cut recorded the number for the block before taking its tries,
  // so a request stopped between the two left the number free to look up for
  // the rest of the hour, and the block looked up one number past its twenty.
  const ip = "192.0.2.90";
  for (let stopAfter = 1; stopAfter <= 3; stopAfter += 1) {
    const env = createAccountEnv();
    await ensureSchema(env.DB);
    const restore = cutAfterThrottleWrites(env, stopAfter);
    await claimAt(env, "123456", ip, H + 10);
    restore();
    const others = await misses(env, MP_CLAIM_IP_LIMIT[0], () => ip, H + 20, 9100);
    const again = await claimAt(env, "123456", ip, H + 30);
    const looked = others.filter((status) => status === 202).length + (again.status === 202 ? 1 : 0);
    assert.ok(looked <= MP_CLAIM_IP_LIMIT[0], `stopped after write ${stopAfter}: ${looked} numbers looked up, at most ${MP_CLAIM_IP_LIMIT[0]}`);
    // Control: the block still gets its misses, so a stopped request costs at most its own try.
    assert.ok(looked >= MP_CLAIM_IP_LIMIT[0] - 1, `stopped after write ${stopAfter}: only ${looked} numbers looked up`);
  }
});

test("taking tries from several budgets is all or none, and a refusal writes nothing", async () => {
  const env = createAccountEnv();
  const written = await throttleRows(env, "t:");
  const at = H + 10;
  const rows = async () => (await env.DB.prepare("SELECT bucket, count, window_start FROM rate_limits WHERE bucket LIKE 't:%' ORDER BY bucket").all()).results;
  const row = async (bucket) => (await rows()).find((r) => r.bucket === bucket);
  // The deployment budget is already spent; the caller's own is empty.
  await env.DB.prepare("INSERT INTO rate_limits (bucket, count, window_start) VALUES ('t:all', 2, ?1)").bind(H).run();
  let before = await written();
  const refused = await reserveRateLimits(env.DB, [["t:mine", 5, HOUR], ["t:all", 2, HOUR]], at);
  assert.equal(refused.ok, false);
  assert.equal(await written(), before, "nothing written for a refused request");
  // Lost to a race: a budget fills after this caller read it and before it
  // took it. Taking the budgets one by one and giving back what was taken
  // wrote two rows for this 429; one statement writes none.
  // `fills[k]` runs right after this caller's (k+1)th read of `bucket`, with ?1 and ?2 bound to `binds[k]`.
  const racing = (bucket, fills, binds = fills.map(() => [H, H + HOUR])) => {
    let reads = 0;
    return {
      ...env.DB,
      prepare: (sql) => {
        const statement = env.DB.prepare(sql);
        if (!/^SELECT count, window_start FROM rate_limits/.test(sql)) {
          return statement;
        }
        return { bind: (...v) => ({ first: async (c) => {
          const found = await statement.bind(...v).first(c);
          if (v[0] === bucket && reads < fills.length) {
            reads += 1;
            await env.DB.prepare(fills[reads - 1]).bind(...binds[reads - 1]).run();
          }
          return found;
        } }) };
      }
    };
  };
  await env.DB.prepare("INSERT INTO rate_limits (bucket, count, window_start) VALUES ('t:all2', 1, ?1)").bind(H).run();
  before = await written();
  const lost = await reserveRateLimits(racing("t:all2", ["UPDATE rate_limits SET count = 2 WHERE bucket = 't:all2' AND window_start = ?1 AND ?2 > 0"]),
    [["t:mine", 5, HOUR], ["t:all2", 2, HOUR]], at);
  assert.equal(lost.ok, false, "the second budget filled first");
  assert.equal(await written(), before + 1, "the only row written is the racing caller's");
  assert.equal(await row("t:mine"), undefined, "the caller's own budget was never touched");
  assert.equal(lost.retryAfter, H + HOUR - at, "come back when the hour turns");
  // Lost to the hour turning: another caller opened the next window after
  // this one read the bucket. The bucket is not dragged back to the old
  // hour, and the caller, who has room in the new one, is not refused for it:
  // it reads again and takes its try there.
  const opens = "INSERT INTO rate_limits (bucket, count, window_start) VALUES ('t:all3', 1, ?2) ON CONFLICT(bucket) DO UPDATE SET count = 1, window_start = ?2 WHERE ?1 > 0";
  before = await written();
  const turned = await reserveRateLimits(racing("t:all3", [opens]), [["t:mine3", 5, HOUR], ["t:all3", 2, HOUR]], at);
  assert.equal(turned.ok, true, "taken in the hour that has just begun");
  assert.deepEqual(turned.held, [["t:mine3", H], ["t:all3", H + HOUR]]);
  const next = await row("t:all3");
  assert.deepEqual([next.count, next.window_start], [2, H + HOUR], "the newer window stands, with this caller's try in it");
  // Lost twice (the hour turned again before the second write): refused,
  // told to ask again at once rather than in an hour, and nothing written.
  before = await written();
  const twice = await reserveRateLimits(racing("t:all4", [opens.replaceAll("t:all3", "t:all4"), opens.replaceAll("t:all3", "t:all4")], [[H, H + HOUR], [H, H + 2 * HOUR]]),
    [["t:mine4", 5, HOUR], ["t:all4", 2, HOUR]], at);
  assert.deepEqual([twice.ok, twice.retryAfter], [false, 1]);
  assert.equal(await written(), before + 3, "the only rows written are the racing callers' (a new row is two)");
  assert.equal(await row("t:mine4"), undefined);
  // Control: with room in all, all are taken, by one statement that reads the
  // rows before it writes any: three budgets of one each are all taken.
  const taken = await reserveRateLimits(env.DB, [["t:mine", 5, HOUR], ["t:other", 2, HOUR]], at);
  assert.equal(taken.ok, true);
  assert.deepEqual(taken.held, [["t:mine", H], ["t:other", H]]);
  const ones = await reserveRateLimits(env.DB, [["t:a", 1, HOUR], ["t:b", 1, HOUR], ["t:c", 1, HOUR]], at);
  assert.equal(ones.ok, true, "a budget of one is not full before the statement takes it");
  assert.deepEqual((await rows()).filter((r) => ["t:a", "t:b", "t:c"].includes(r.bucket)).map((r) => r.count), [1, 1, 1]);
  const count = async (bucket) => (await row(bucket)).count;
  // A try goes back once, and never below zero: given back twice, it is not an extra try.
  await releaseRateLimits(env.DB, taken.held);
  await releaseRateLimits(env.DB, taken.held);
  assert.equal(await count("t:mine"), 0);
  // A try given back is one try: from five, four, not none.
  for (let n = 0; n < 4; n += 1) {
    await reserveRateLimits(env.DB, [["t:five", 5, HOUR]], at);
  }
  const fifth = await reserveRateLimits(env.DB, [["t:five", 5, HOUR]], at);
  await releaseRateLimits(env.DB, fifth.held);
  assert.equal(await count("t:five"), 4);
  // A try goes back to the window it was taken in, not to the next one.
  const late = await reserveRateLimits(env.DB, [["t:late", 5, HOUR]], at);
  await reserveRateLimits(env.DB, [["t:late", 5, HOUR]], H + HOUR + 5);
  await releaseRateLimits(env.DB, late.held);
  assert.equal(await count("t:late"), 1, "the next hour's try stands");
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

test("with the Stripe price table filled in, a checkout Stripe created last but delivered first does not leave a paid subscription pending", async () => {
  // A gated checkout says nothing about the license's state, so it must not
  // move the license's clock: stamped, it made the subscription's own older
  // events stale, and the subscriber had paid but got 202 until their renewal.
  const sub = (id, status) => ({
    id, object: "subscription", status, customer: `cus_${id}`, current_period_end: T + 30 * DAY, metadata: {},
    items: { data: [{ price: { id: "price_pro_monthly", recurring: { interval: "month", interval_count: 1 } } }] }
  });
  const session = (id, subId, type) => ({
    id, object: "checkout.session", mode: "subscription", status: "complete",
    payment_status: type === "checkout.session.completed" ? "paid" : "unpaid", customer: `cus_${subId}`, subscription: subId, metadata: {}
  });
  const invoice = (subId) => ({
    id: `in_${subId}`, customer: `cus_${subId}`, subscription: subId, status: "paid",
    lines: { data: [{ price: { id: "price_pro_monthly" }, period: { start: T, end: T + 30 * DAY } }] }
  });
  for (const checkoutType of ["checkout.session.completed", "checkout.session.async_payment_succeeded"]) {
    for (const gap of [1, 3, 60]) {
      for (const order of [["cs", "sc", "ip"], ["cs", "ip", "sc"], ["sc", "cs", "ip"]]) {
        const env = createAccountEnv(LISTED);
        const subId = `sub_${gap}_${order.join("")}`;
        const csId = `cs_${subId}`;
        const events = {
          sc: () => stripe(env, `sc_${subId}`, "customer.subscription.created", sub(subId, "active"), T),
          ip: () => stripe(env, `ip_${subId}`, "invoice.paid", invoice(subId), T + 1),
          cs: () => stripe(env, `cs_${subId}`, checkoutType, session(csId, subId, checkoutType), T + 1 + gap)
        };
        for (const name of order) {
          assert.equal((await events[name]()).status, 200, `${name} delivered`);
        }
        const claimed = await claim(env, "stripe", csId);
        const label = `${checkoutType}, created ${gap} s after the invoice, delivered ${order.join(" > ")}`;
        assert.equal(claimed.status, 200, `${label}: ${JSON.stringify(claimed.body)}`);
        assert.equal(claimed.body.entitlement.status, "active", label);
      }
    }
  }
  // Control: the gate still keeps an unlisted price suspended in the same order.
  const env = createAccountEnv(LISTED);
  const other = { ...sub("sub_other", "active"), items: { data: [{ price: { id: "price_other", recurring: { interval: "month", interval_count: 1 } } }] } };
  await stripe(env, "o_cs", "checkout.session.completed", session("cs_other", "sub_other", "checkout.session.completed"), T + 60);
  await stripe(env, "o_sc", "customer.subscription.created", other, T);
  assert.notEqual((await claim(env, "stripe", "cs_other")).status, 200, "an unlisted price stays suspended");
});

test("with the Stripe price table filled in, an unlisted subscription whose deletion is processed first gets no Pro for its period", async () => {
  // Deleted, a subscription is "canceled", never "suspended", and processed
  // before any other event of its license it kept its whole period.
  const at = T - 10 * DAY;
  const run = async (priceId) => {
    const env = createAccountEnv(LISTED);
    const id = `sub_del_${priceId}`;
    const sub = (status, extra) => ({
      id, object: "subscription", status, customer: `cus_${id}`, current_period_end: at + 30 * DAY, metadata: {},
      items: { data: [{ price: { id: priceId, recurring: { interval: "month", interval_count: 1 } } }] }, ...extra
    });
    await stripe(env, `d_${id}`, "customer.subscription.deleted", sub("canceled", { ended_at: at + DAY, canceled_at: at + DAY }), at + DAY);
    await stripe(env, `c_${id}`, "customer.subscription.created", sub("active"), at);
    await stripe(env, `i_${id}`, "invoice.paid", {
      id: `in_${id}`, customer: `cus_${id}`, subscription: id, status: "paid",
      lines: { data: [{ price: { id: priceId }, period: { start: at, end: at + 30 * DAY } }] }
    }, at + 1);
    await stripe(env, `s_${id}`, "checkout.session.completed", {
      id: `cs_${id}`, object: "checkout.session", mode: "subscription", status: "complete", payment_status: "paid",
      customer: `cus_${id}`, subscription: id, metadata: {}
    }, at + 2);
    return call(env, jsonRequest("/v1/claim", { provider: "stripe", sessionId: `cs_${id}` }));
  };
  const unlisted = await run("price_donation");
  assert.notEqual(unlisted.status, 200, `a price that is not ours: ${JSON.stringify(unlisted.body)}`);
  assert.equal(unlisted.body.token, undefined);
  // Control: a listed price cancelled the same way keeps the month that was paid for.
  const listed = await run("price_pro_monthly");
  assert.equal(listed.status, 200, `a listed price keeps its paid period: ${JSON.stringify(listed.body)}`);
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
