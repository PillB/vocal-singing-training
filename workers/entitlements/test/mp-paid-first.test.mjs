/**
 * VG-84: Mercado Pago grants Pro for money that arrived, not for a mandate.
 *
 * The defect: a preapproval in `authorized` mapped to `active` with its
 * `next_payment_date` as the period end and never said whether anything was
 * paid, so the licence signed at sign-up, and kept signing at day 20 and day
 * 50 with every instalment turned down, until Mercado Pago itself cancelled
 * the subscription after three rejected instalments.
 *
 * What Mercado Pago documents (Subscriptions, "authorized payments", and the
 * authorized-payment and preapproval API references, read 2026-11-21):
 *   - "The first installment is charged after approximately one hour since
 *     the subscription";
 *   - a declined one "enters a reattempt scheme with a maximum of 4
 *     possibilities", "within a 10-day window";
 *   - "After 3 installments with rejected payments, the subscription is
 *     automatically canceled", and "the result of one installment does not
 *     affect the generation and processing of the remaining installments";
 *   - an invoice is `scheduled`, `recycling` ("in attempt to collect"),
 *     `processed` ("collected or exceeded retries") or `canceled`, and its
 *     `payment.status` is what says whether money came (`approved`,
 *     `rejected`, ...).
 *
 * What the terms promise: "Si un cargo no entra, Pro se mantiene durante el
 * periodo ya pagado y después se detiene; cuando el pago entra, Pro vuelve."
 * No grace period is added. "The period already paid" is what the store
 * counts a charge as buying everywhere: 31 days for a month, to the same date
 * next year for a year (PLAN_INTERVAL_SECONDS in src/license.js).
 *
 * Every test drives the real router (webhook in, claim or refresh out), names
 * the wrong behaviour it fails on, and has a control beside it, so a fix that
 * simply refuses every Mercado Pago licence fails too. Mutants MP1 to MP10
 * (returned with the change) each turn one of these red.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { handleRequest } from "../src/index.js";
import { hmacSha256Hex, verifyLicenseToken } from "../src/license.js";
import { buildMercadoPagoManifest } from "../src/mercadopago.js";
import { createAccountEnv, createTestEnv } from "./fixtures.mjs";

const DAY = 86400;
/** One month as the store counts a monthly charge (src/license.js PLAN_INTERVAL_SECONDS.pro_monthly). */
const MONTH = 31 * DAY;
const NO_WAIT = { sleep: async () => {}, random: () => 0 };
const nowSec = () => Math.floor(Date.now() / 1000);
const iso = (seconds) => new Date(seconds * 1000).toISOString();

/** Both stores: KV alone, and the D1 ledger in front of it. */
const STORES = [["KV", () => createTestEnv()], ["D1 ledger", () => createAccountEnv()]];

let seq = 0;

/**
 * Deliver one signed Mercado Pago notification whose API read answers `resource`.
 * @param {Object} env Env bindings.
 * @param {string} kind "payment" | "subscription_preapproval" | "subscription_authorized_payment".
 * @param {Object} resource What the API returns.
 * @param {number} [notificationId] The notification's own id; a fresh one when omitted.
 * @returns {Promise<{status: number, body: Object}>} The webhook's answer.
 */
async function deliver(env, kind, resource, notificationId) {
  seq += 1;
  const dataId = String(resource.id);
  const id = notificationId || 84000 + seq;
  const raw = JSON.stringify({ id, type: kind, action: `${kind}.updated`, data: { id: dataId } });
  const ts = String(nowSec());
  const requestId = `req-vg84-${seq}`;
  const v1 = await hmacSha256Hex(env.MP_WEBHOOK_SECRET, buildMercadoPagoManifest({ dataId, requestId, ts }));
  const response = await handleRequest(new Request("https://worker.test/v1/webhooks/mercadopago", {
    method: "POST",
    headers: { "content-type": "application/json", "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId },
    body: raw
  }), env, { ledger: NO_WAIT, fetchImpl: async () => ({ ok: true, status: 200, async json() { return resource; } }) });
  const body = await response.json();
  assert.equal(response.status, 200, `${kind} ${dataId} applied: ${JSON.stringify(body)}`);
  return { status: response.status, body };
}

/** POST a JSON body to a public route and read the answer. */
async function post(env, path, payload) {
  const response = await handleRequest(new Request(`https://worker.test${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.84" },
    body: JSON.stringify(payload)
  }), env, { ledger: NO_WAIT });
  return { status: response.status, body: await response.json() };
}

/** The browser's claim on the way back from Mercado Pago, by preapproval id. */
const claim = (env, id) => post(env, "/v1/claim", { provider: "mercadopago", sessionId: id });

/** The browser's refresh of a licence it holds. */
const refresh = (env, licenseId) => post(env, "/v1/license", { licenseId });

/**
 * A monthly preapproval as the API reports it.
 * @param {string} id Preapproval id.
 * @param {string} status "authorized" | "paused" | "cancelled" | "pending".
 * @param {number} start When it was created, unix seconds.
 * @param {number} updated When it last changed, unix seconds.
 * @param {number|null} nextPayment Its next charge date, unix seconds.
 * @param {Object} [extra] Fields to add (a yearly recurrence, say).
 * @returns {[string, Object]} Kind and resource.
 */
function preapproval(id, status, start, updated, nextPayment, extra) {
  return ["subscription_preapproval", {
    id,
    status,
    reason: "Vocal Studio Pro mensual",
    auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 19.9, currency_id: "PEN" },
    payer_id: 84,
    date_created: iso(start),
    last_modified: iso(updated),
    next_payment_date: nextPayment === null ? null : iso(nextPayment),
    ...(extra || {})
  }];
}

/**
 * One instalment on the authorized-payment topic.
 * @param {string} preapprovalId Preapproval id.
 * @param {number} invoice Invoice id.
 * @param {number} due Its debit date, unix seconds.
 * @param {number} updated When it last changed, unix seconds.
 * @param {string} invoiceStatus "scheduled" | "recycling" | "processed" | "canceled".
 * @param {Object|null} payment Its payment (status, date_approved), or null for none.
 * @returns {[string, Object]} Kind and resource.
 */
function instalment(preapprovalId, invoice, due, updated, invoiceStatus, payment) {
  return ["subscription_authorized_payment", {
    id: invoice,
    type: "scheduled",
    preapproval_id: preapprovalId,
    status: invoiceStatus,
    date_created: iso(due - 2 * DAY),
    debit_date: iso(due),
    last_modified: iso(updated),
    retry_attempt: invoiceStatus === "processed" && payment && payment.status === "rejected" ? 4 : 1,
    ...(payment ? { payment } : {})
  }];
}

/** An approved charge on the authorized-payment topic, `approvedAt` seconds. */
const approvedInstalment = (pre, invoice, approvedAt) =>
  instalment(pre, invoice, approvedAt - 60, approvedAt + 5, "processed",
    { id: invoice + 1000, status: "approved", status_detail: "accredited", date_approved: iso(approvedAt) });

/** A charge turned down on the authorized-payment topic: still retrying, or retries over. */
const declinedInstalment = (pre, invoice, due, retriesOver) =>
  instalment(pre, invoice, due, due + (retriesOver ? 10 * DAY : 30), retriesOver ? "processed" : "recycling",
    { id: invoice + 2000, status: "rejected", status_detail: "cc_rejected_insufficient_amount" });

/**
 * One instalment exactly as GET /authorized_payments/{id} documents it: its
 * `payment` has `id`, `status` and `status_detail` and nothing else (no
 * `date_approved`), and `debit_date` is "the date on which we will try to make
 * the payment". The fixtures above add a `date_approved` Mercado Pago does not
 * document, which let the debit-date fallback go untested (VG-84 review, X1).
 * @param {string} pre Preapproval id.
 * @param {number} invoice Invoice id.
 * @param {number} debit Its debit date, unix seconds.
 * @param {number} updated Its `last_modified`, unix seconds.
 * @param {string} invoiceStatus "scheduled" | "recycling" | "processed" | "canceled".
 * @param {string|null} paymentStatus Its payment's status, or null for no payment yet.
 * @param {Object} [extra] Fields to add (`retry_attempt`, say).
 * @returns {[string, Object]} Kind and resource.
 */
function docInstalment(pre, invoice, debit, updated, invoiceStatus, paymentStatus, extra) {
  return ["subscription_authorized_payment", {
    id: invoice,
    type: "scheduled",
    preapproval_id: pre,
    status: invoiceStatus,
    date_created: iso(debit - 2 * DAY),
    debit_date: iso(debit),
    last_modified: iso(updated),
    retry_attempt: paymentStatus ? 1 : 0,
    summarized: "done",
    ...(paymentStatus ? { payment: { id: invoice + 5000, status: paymentStatus, status_detail: paymentStatus === "approved" ? "accredited" : "cc_rejected_other_reason" } } : {}),
    ...(extra || {})
  }];
}

/** A charge of the subscription on the payment topic. */
function payment(pre, id, status, at) {
  return ["payment", {
    id,
    status,
    preapproval_id: pre,
    transaction_amount: 19.9,
    currency_id: "PEN",
    date_created: iso(at),
    ...(status === "approved" ? { date_approved: iso(at) } : {}),
    date_last_updated: iso(at + 5),
    payer: { id: 84 }
  }];
}

/** Deliver steps in order. */
async function deliverAll(env, steps) {
  for (const step of steps) {
    await deliver(env, ...step);
  }
}

/** Assert an answer is a signed, valid licence whose end is `periodEnd`. */
async function assertSigned(env, answer, periodEnd, label) {
  assert.equal(answer.status, 200, `${label}: ${JSON.stringify(answer.body)}`);
  const verified = await verifyLicenseToken(answer.body.token, env);
  assert.equal(verified.valid, true, label);
  assert.equal(verified.payload.periodEnd, periodEnd, `${label}: the token carries the period`);
  assert.ok(verified.payload.exp <= periodEnd, `${label}: the token ends with the period`);
}

test("MP1 an authorised mandate with no approved charge signs nothing: at sign-up, at day 20, at day 50", async () => {
  for (const [store, makeEnv] of STORES) {
    // Wrong behaviour: 200 and a token running to the next charge date, at
    // every one of these ages, because `authorized` alone meant active.
    const cases = [
      // Thirty seconds in: the first charge is still about an hour away.
      ["sign-up", 30, (pre, s) => [preapproval(pre, "authorized", s, s + 20, s + 30 * DAY)]],
      // The first instalment and all four retries turned down; Mercado Pago
      // goes on generating the next instalment, so the subscription stays authorized.
      ["day 20", 20 * DAY, (pre, s) => [
        preapproval(pre, "authorized", s, s + 11 * DAY, s + 30 * DAY),
        declinedInstalment(pre, 1, s + 3600, true)
      ]],
      // Two instalments turned down, the next charge date a month and more away.
      ["day 50", 50 * DAY, (pre, s) => [
        preapproval(pre, "authorized", s, s + 41 * DAY, s + 60 * DAY),
        declinedInstalment(pre, 1, s + 3600, true),
        payment(pre, 5101, "rejected", s + 30 * DAY),
        declinedInstalment(pre, 2, s + 30 * DAY, true)
      ]]
    ];
    for (const [age, ago, steps] of cases) {
      const label = `${store}, ${age}`;
      const env = makeEnv();
      const pre = `pre-mp1-${store}-${age}`.replace(/\s/g, "");
      const start = nowSec() - ago;
      await deliverAll(env, steps(pre, start));
      const answer = await claim(env, pre);
      // At sign-up the first charge is on its way: 202, keep polling. Once it
      // has been turned down it is not (VG-84 review): 402 "declined", so the
      // page says to check the card rather than to wait "about an hour", and
      // the browser still keeps asking, because Mercado Pago retries it.
      const [status, reason] = age === "sign-up" ? [202, "pending"] : [402, "declined"];
      assert.equal(answer.status, status, `${label}: ${JSON.stringify(answer.body)}`);
      assert.equal(answer.body.reason, reason, label);
      assert.equal(answer.body.token, undefined, `${label}: no token on a mandate alone`);
      assert.equal(answer.body.entitlement.status, "active", `${label}: the mandate itself is recorded`);
      const again = await refresh(env, answer.body.entitlement.licenseId);
      assert.equal(again.status, status, `${label}: the refresh route agrees`);
      assert.equal(again.body.reason, reason, label);
      assert.equal(again.body.token, undefined, label);
    }

    // First heard of with its charge already refunded: money came and went
    // back, nothing is on its way, and Mercado Pago charges again. It used to
    // answer 202 "pending" (the registry's old trade-off 6).
    const env = makeEnv();
    const start = nowSec() - 3 * DAY;
    await deliverAll(env, [
      preapproval(`pre-mp1-refunded-${store}`, "authorized", start, start + 20, start + 30 * DAY),
      instalment(`pre-mp1-refunded-${store}`, 11, start + 3600, nowSec() - 60, "processed",
        { id: 1011, status: "refunded", status_detail: "refunded" })
    ]);
    const refunded = await claim(env, `pre-mp1-refunded-${store}`);
    assert.equal(refunded.status, 402, `${store}, refunded first: ${JSON.stringify(refunded.body)}`);
    assert.equal(refunded.body.reason, "suspended", store);
    assert.equal(refunded.body.token, undefined, store);
  }
});

test("MP2 an approved charge on the authorized-payment topic signs for the period it paid, in either order", async () => {
  for (const chargeFirst of [false, true]) {
    const label = chargeFirst ? "charge first" : "subscription first";
    const env = createTestEnv();
    const pre = `pre-mp2-${chargeFirst}`;
    const start = nowSec() - 10 * DAY;
    const approvedAt = start + 3600;
    const sub = preapproval(pre, "authorized", start, approvedAt + 60, start + 30 * DAY);
    const charge = approvedInstalment(pre, 21, approvedAt);
    await deliverAll(env, chargeFirst ? [charge, sub] : [sub, charge]);
    const answer = await claim(env, pre);
    // One month from the money, in either order. Wrong behaviour (VG-84
    // review): with the subscription's notice processed after the charge, its
    // next charge date (start + 30 days) replaced the month the charge bought,
    // so the period ran out at the instant the renewal was due.
    await assertSigned(env, answer, approvedAt + MONTH, label);
  }

  // Control: the same charge forty-five days ago, nothing since, has run out.
  // Still authorized, Mercado Pago charges it again: 402, never 403.
  const env = createTestEnv();
  const start = nowSec() - 45 * DAY;
  await deliverAll(env, [
    preapproval("pre-mp2-old", "authorized", start, start + 3660, start + 30 * DAY),
    approvedInstalment("pre-mp2-old", 22, start + 3600)
  ]);
  const old = await claim(env, "pre-mp2-old");
  assert.equal(old.status, 402, "a month paid for 45 days ago is over");
  assert.equal(old.body.reason, "suspended");
  assert.equal(old.body.token, undefined);
});

test("MP3 an approved charge on the payment topic signs for the period it paid, in either order", async () => {
  for (const chargeFirst of [false, true]) {
    const label = chargeFirst ? "payment first" : "subscription first";
    const env = createTestEnv();
    const pre = `pre-mp3-${chargeFirst}`;
    const start = nowSec() - 10 * DAY;
    const approvedAt = start + 3600;
    const sub = preapproval(pre, "authorized", start, approvedAt + 60, start + 30 * DAY);
    const charge = payment(pre, 3301, "approved", approvedAt);
    await deliverAll(env, chargeFirst ? [charge, sub] : [sub, charge]);
    const answer = await claim(env, pre);
    await assertSigned(env, answer, approvedAt + MONTH, label);
  }
});

/**
 * A month paid, then the next instalment turned down, at `daysIn` days.
 * @param {string} pre Preapproval id.
 * @param {number} start When it was created, unix seconds.
 * @param {string} topic Which topic brings the decline.
 * @param {string} order "decline last" | "subscription last" | "first charge last".
 * @param {boolean} retriesOver Whether all four retries are over.
 * @returns {[string, Object][]} Steps.
 */
function paidThenDeclined(pre, start, topic, order, retriesOver) {
  // Mercado Pago has moved the next charge date on to the instalment after.
  const sub = preapproval(pre, "authorized", start, start + 30 * DAY + 60, start + 60 * DAY);
  const paid = approvedInstalment(pre, 41, start + 3600);
  const declined = topic === "payment"
    ? payment(pre, 4402, "rejected", start + 30 * DAY)
    : declinedInstalment(pre, 42, start + 30 * DAY, retriesOver);
  if (order === "subscription last") {
    return [paid, declined, sub];
  }
  if (order === "first charge last") {
    return [sub, declined, paid];
  }
  return [sub, paid, declined];
}

test("MP4 a turned-down instalment after a paid month ends Pro when the month ends, not at the next charge date", async () => {
  for (const [store, makeEnv] of STORES) {
    for (const topic of ["subscription_authorized_payment", "payment"]) {
      for (const order of ["decline last", "subscription last", "first charge last"]) {
        for (const daysIn of [40, 50]) {
          const label = `${store}, ${topic}, ${order}, day ${daysIn}`;
          const env = makeEnv();
          const pre = `pre-mp4-${seq}`;
          const start = nowSec() - daysIn * DAY;
          await deliverAll(env, paidThenDeclined(pre, start, topic, order, daysIn === 50));
          const answer = await claim(env, pre);
          // Wrong behaviour: 200 with a period to start + 60 days, the next
          // charge date, on a card that has not paid since day 0.
          assert.notEqual(answer.status, 200, `${label}: ${JSON.stringify(answer.body)}`);
          assert.equal(answer.body.token, undefined, label);
          assert.equal(answer.body.entitlement.periodEnd, start + 3600 + MONTH, `${label}: the month the charge paid for, and no more`);
          assert.equal(answer.body.entitlement.status, "active", `${label}: Mercado Pago is still retrying, not cancelled`);
          assert.equal(answer.status, 402, label);
          assert.equal(answer.body.reason, "declined", `${label}: the page can say the card was turned down`);
        }
      }
    }
  }
});

test("MP5 a turned-down instalment inside the paid month takes none of that month", async () => {
  // Half a day into the decline, half a day of the paid month left.
  for (const topic of ["subscription_authorized_payment", "payment"]) {
    const env = createTestEnv();
    const pre = `pre-mp5-${topic}`;
    const start = nowSec() - 30 * DAY - 12 * 3600;
    await deliverAll(env, paidThenDeclined(pre, start, topic, "decline last", false));
    const answer = await claim(env, pre);
    // Wrong both ways: the next charge date (start + 60 days), or nothing at
    // all from the moment of the decline.
    await assertSigned(env, answer, start + 3600 + MONTH, `${topic}: the rest of the month paid for`);
  }
});

test("MP6 turned down, then approved on a retry or on the next instalment: Pro comes back", async () => {
  for (const [store, makeEnv] of STORES) {
    for (const topic of ["subscription_authorized_payment", "payment"]) {
      const label = `${store}, retry on ${topic}`;
      const env = makeEnv();
      const pre = `pre-mp6-${seq}`;
      const start = nowSec() - 40 * DAY;
      await deliverAll(env, paidThenDeclined(pre, start, "subscription_authorized_payment", "decline last", false));
      assert.notEqual((await claim(env, pre)).status, 200, `${label}: off while unpaid`);
      // The third retry goes through on day 33: the same invoice, processed.
      const retriedAt = start + 33 * DAY;
      await deliver(env, ...(topic === "payment"
        ? payment(pre, 4403, "approved", retriedAt)
        : instalment(pre, 42, start + 30 * DAY, retriedAt + 5, "processed", { id: 2042, status: "approved", date_approved: iso(retriedAt) })));
      const back = await claim(env, pre);
      const end = back.body.entitlement && back.body.entitlement.periodEnd;
      assert.ok(end >= start + 60 * DAY, `${label}: through the next charge date, ${JSON.stringify(back.body)}`);
      await assertSigned(env, back, end, label);
    }
  }

  // An instalment left unpaid, and the next one paid: Pro for the month paid.
  const env = createTestEnv();
  const start = nowSec() - 70 * DAY;
  await deliverAll(env, [
    preapproval("pre-mp6-next", "authorized", start, start + 60 * DAY + 60, start + 90 * DAY),
    approvedInstalment("pre-mp6-next", 61, start + 3600),
    declinedInstalment("pre-mp6-next", 62, start + 30 * DAY, true),
    approvedInstalment("pre-mp6-next", 63, start + 60 * DAY + 3600)
  ]);
  const next = await claim(env, "pre-mp6-next");
  const end = next.body.entitlement && next.body.entitlement.periodEnd;
  assert.ok(end >= start + 90 * DAY, `the month paid on day 60, ${JSON.stringify(next.body)}`);
  await assertSigned(env, next, end, "next instalment paid");
});

test("MP7 a subscription Mercado Pago will charge again answers 402, so the browser keeps its licence; a stopped one answers 403", async () => {
  for (const [store, makeEnv] of STORES) {
    // Turned down after a paid month: 402 "declined".
    const env = makeEnv();
    const start = nowSec() - 40 * DAY;
    await deliverAll(env, paidThenDeclined(`pre-mp7-${store}`, start, "subscription_authorized_payment", "decline last", false));
    const answer = await claim(env, `pre-mp7-${store}`);
    // Wrong behaviour: 403 "inactive", which the site's client answers by
    // forgetting the licence, so a browser with no account never hears that
    // the retry went through.
    assert.equal(answer.status, 402, `${store}: ${JSON.stringify(answer.body)}`);
    assert.equal(answer.body.reason, "declined", store);
    const again = await refresh(env, answer.body.entitlement.licenseId);
    assert.equal(again.status, 402, `${store}: the refresh route agrees`);
    assert.equal(again.body.reason, "declined", store);

    // The renewal boundary, nothing turned down (VG-84 review, G1/R4). A
    // 31-day month: the next charge is due when the 31 days the last charge
    // bought run out, and its approval has not been processed two hours on.
    // Wrong behaviour: 403 "inactive" at every renewal, and the browser
    // forgets the licence a paying subscriber holds.
    const renewing = makeEnv();
    const pre = `pre-mp7-renewing-${store}`;
    const paidAt = nowSec() - MONTH - 2 * 3600;
    const due = paidAt + MONTH;
    await deliverAll(renewing, [
      preapproval(pre, "authorized", paidAt - 3600, paidAt - 3590, paidAt),
      docInstalment(pre, 71, paidAt, paidAt + 30, "processed", "approved"),
      preapproval(pre, "authorized", paidAt - 3600, paidAt + 60, due),
      docInstalment(pre, 72, due, paidAt + 120, "scheduled", null)
    ]);
    const gap = await claim(renewing, pre);
    assert.equal(gap.status, 402, `${store}, renewal not processed yet: ${JSON.stringify(gap.body)}`);
    assert.equal(gap.body.reason, "suspended", `${store}: waiting on the renewal, nothing was turned down`);
    assert.equal(gap.body.entitlement.periodEnd, paidAt + MONTH, store);
    const held = await refresh(renewing, gap.body.entitlement.licenseId);
    assert.equal(held.status, 402, `${store}: the refresh route agrees, so the browser keeps the licence`);
    // ...and the renewal landing brings Pro back on that same licence.
    await deliver(renewing, ...docInstalment(pre, 72, due, nowSec() - 30, "processed", "approved"));
    const back = await refresh(renewing, gap.body.entitlement.licenseId);
    await assertSigned(renewing, back, due + MONTH, `${store}: renewed`);

    // Controls: stopped, nothing will charge it again, so 403 once its paid month is over.
    for (const stopped of ["cancelled", "paused"]) {
      const off = makeEnv();
      const id = `pre-mp7-${stopped}-${store}`;
      const old = nowSec() - 45 * DAY;
      await deliverAll(off, [
        preapproval(id, "authorized", old, old + 3660, old + 30 * DAY),
        approvedInstalment(id, 73, old + 3600),
        preapproval(id, stopped, old, old + 10 * DAY, stopped === "paused" ? old + 30 * DAY : null)
      ]);
      const ran = await claim(off, id);
      assert.equal(ran.status, 403, `${store}, ${stopped}: ${JSON.stringify(ran.body)}`);
      assert.equal(ran.body.reason, "inactive", `${store}, ${stopped}`);
    }
  }
});

test("MP8 an invoice marked processed that names no payment is not money", async () => {
  // "processed" is documented as "collected or exceeded retries".
  const env = createTestEnv();
  const start = nowSec() - 12 * DAY;
  await deliverAll(env, [
    preapproval("pre-mp8", "authorized", start, start + 11 * DAY, start + 30 * DAY),
    instalment("pre-mp8", 81, start + 3600, start + 11 * DAY, "processed", null)
  ]);
  const answer = await claim(env, "pre-mp8");
  // Wrong behaviour: 200, the invoice's own status read as an approval.
  assert.equal(answer.status, 202, JSON.stringify(answer.body));
  assert.equal(answer.body.token, undefined);

  // Control: the same invoice naming its approved payment signs.
  await deliver(env, ...instalment("pre-mp8", 81, start + 3600, start + 11 * DAY + 5, "processed",
    { id: 1081, status: "approved", date_approved: iso(start + 3600) }));
  const paid = await claim(env, "pre-mp8");
  await assertSigned(env, paid, paid.body.entitlement && paid.body.entitlement.periodEnd, "approved payment named");
});

test("MP9 one-off Mercado Pago payments are unchanged: approved signs a month, a voucher waits, a refund ends it", async () => {
  const env = createTestEnv();
  const approvedAt = nowSec() - 2 * DAY;
  const oneOff = {
    id: 9901,
    status: "approved",
    external_reference: "pro_monthly",
    date_created: iso(approvedAt),
    date_approved: iso(approvedAt),
    date_last_updated: iso(approvedAt),
    payer: { id: 7 }
  };
  await deliver(env, "payment", oneOff);
  // Wrong behaviour of an over-reaching fix: 202, a one-off payment held as unpaid.
  await assertSigned(env, await claim(env, "9901"), approvedAt + MONTH, "approved one-off");

  await deliver(env, "payment", { id: 9902, status: "pending", external_reference: "pro_monthly",
    date_created: iso(approvedAt), date_last_updated: iso(approvedAt), payer: { id: 7 } });
  const voucher = await claim(env, "9902");
  assert.equal(voucher.status, 202, "an unpaid voucher waits");
  assert.equal(voucher.body.token, undefined);

  await deliver(env, "payment", { ...oneOff, status: "refunded", date_last_updated: iso(nowSec() - 60) });
  const refunded = await claim(env, "9901");
  assert.equal(refunded.status, 403, "the money went back, so does the access");
  assert.equal(refunded.body.token, undefined);
});

test("MP10 a confirmed charge stays confirmed: the subscription's later notices, its cancellation, a refund and a replay", async () => {
  const env = createTestEnv();
  const start = nowSec() - 5 * DAY;
  const approvedAt = start + 3600;
  const pre = "pre-mp10";
  const charge = approvedInstalment(pre, 101, approvedAt);
  await deliver(env, ...charge, 910001);
  // The subscription's own notice, newer than the charge, says nothing of
  // money. Wrong behaviour: it sets the paid subscription back to unpaid (202).
  await deliver(env, ...preapproval(pre, "authorized", start, approvedAt + 600, start + 30 * DAY));
  // Its next charge date (start + 30 days) is not the end of what was paid:
  // the month the charge bought is (VG-84 review; this used to assert the
  // next charge date, which ran out before the renewal could be processed).
  const paid = await claim(env, pre);
  await assertSigned(env, paid, approvedAt + MONTH, "paid, then the subscription's notice");

  // A replay of the charge's notification changes nothing.
  const replay = await deliver(env, ...charge, 910001);
  assert.equal(replay.body.reason, "duplicate");
  assert.equal((await claim(env, pre)).body.entitlement.periodEnd, approvedAt + MONTH, "a replay buys no time");

  // The subscriber cancels: the month paid for stays.
  await deliver(env, ...preapproval(pre, "cancelled", start, approvedAt + DAY, null));
  const cancelled = await claim(env, pre);
  assert.equal(cancelled.body.entitlement.status, "canceled");
  await assertSigned(env, cancelled, approvedAt + MONTH, "cancelled after paying");

  // A refund of that charge ends it.
  await deliver(env, ...instalment(pre, 101, approvedAt - 60, nowSec() - 60, "processed",
    { id: 1101, status: "refunded", date_approved: iso(approvedAt) }));
  const refunded = await claim(env, pre);
  assert.equal(refunded.status, 403, JSON.stringify(refunded.body));
  assert.equal(refunded.body.token, undefined);

  // A yearly subscription paid once is a year, not the default month.
  const yearly = createTestEnv();
  const nextYear = new Date(approvedAt * 1000);
  nextYear.setUTCMonth(nextYear.getUTCMonth() + 12);
  const yearEnd = Math.floor(nextYear.getTime() / 1000);
  await deliverAll(yearly, [
    preapproval("pre-mp10-y", "authorized", start, approvedAt + 60, yearEnd - 60,
      { reason: "Vocal Studio Pro anual", auto_recurring: { frequency: 12, frequency_type: "months" } }),
    approvedInstalment("pre-mp10-y", 102, approvedAt)
  ]);
  const year = await claim(yearly, "pre-mp10-y");
  assert.equal(year.body.entitlement.plan, "pro_yearly");
  await assertSigned(yearly, year, Math.max(yearEnd, approvedAt + 365 * DAY), "a year from the charge");
});

test("MP11 a next charge date moved with no money behind it buys no time: paused then reactivated, cancelled before a debit called off", async () => {
  // VG-84 review, issue 1 (repros D2 and K1). `paid` never expires, and every
  // authorized notice set the period to its next charge date, so after one
  // paid month that date alone ran Pro on.
  for (const [store, makeEnv] of STORES) {
    // Paid on day 0, paused on day 29, reactivated on day 44 with the next
    // charge on day 60. Nothing has been charged since day 0.
    const pauseSteps = (pre, start, upTo) => [
      preapproval(pre, "authorized", start, start + 20, start + 3600),
      approvedInstalment(pre, 111, start + 3600),
      preapproval(pre, "authorized", start, start + 3700, start + 30 * DAY),
      preapproval(pre, "paused", start, start + 29 * DAY, start + 30 * DAY),
      ...(upTo === "reactivated" ? [preapproval(pre, "authorized", start, start + 44 * DAY, start + 60 * DAY)] : [])
    ];
    {
      const env = makeEnv();
      const start = nowSec() - 45 * DAY;
      await deliverAll(env, pauseSteps(`pre-mp11-resumed-${store}`, start, "reactivated"));
      const answer = await claim(env, `pre-mp11-resumed-${store}`);
      // Wrong behaviour: 200 with the period at day 60.
      assert.equal(answer.body.token, undefined, `${store}, reactivated: ${JSON.stringify(answer.body)}`);
      assert.equal(answer.status, 402, `${store}: authorized again, so Mercado Pago will charge it`);
      assert.equal(answer.body.reason, "suspended", store);
      assert.equal(answer.body.entitlement.periodEnd, start + 3600 + MONTH, `${store}: the month day 0 paid for, no more`);
    }
    {
      // Control: paused inside the paid month keeps the rest of that month.
      const env = makeEnv();
      const start = nowSec() - 29 * DAY - 12 * 3600;
      await deliverAll(env, pauseSteps(`pre-mp11-paused-${store}`, start, "paused"));
      const answer = await claim(env, `pre-mp11-paused-${store}`);
      assert.equal(answer.body.entitlement.status, "canceled", store);
      await assertSigned(env, answer, start + 3600 + MONTH, `${store}, paused inside the paid month`);
    }

    // The next charge date moved on to day 60 before instalment 2 was
    // debited, the buyer cancelled an hour after it was due, and Mercado Pago
    // called the instalment off without a payment.
    const cancelSteps = (pre, start) => [
      preapproval(pre, "authorized", start, start + 20, start + 3600),
      approvedInstalment(pre, 112, start + 3600),
      preapproval(pre, "authorized", start, start + 3700, start + 30 * DAY),
      preapproval(pre, "authorized", start, start + 30 * DAY + 10, start + 60 * DAY),
      preapproval(pre, "cancelled", start, start + 30 * DAY + 3600, null),
      instalment(pre, 113, start + 30 * DAY, start + 30 * DAY + 3600, "canceled", null)
    ];
    {
      const env = makeEnv();
      const start = nowSec() - 35 * DAY;
      await deliverAll(env, cancelSteps(`pre-mp11-cancel-${store}`, start));
      const answer = await claim(env, `pre-mp11-cancel-${store}`);
      // Wrong behaviour: 200 "canceled" with the period at day 60, for one paid month.
      assert.equal(answer.status, 403, `${store}, cancelled: ${JSON.stringify(answer.body)}`);
      assert.equal(answer.body.token, undefined, store);
      assert.equal(answer.body.entitlement.periodEnd, start + 3600 + MONTH, store);
    }
    {
      // Control: the same, read on day 30 and a half, still in the paid month.
      const env = makeEnv();
      const start = nowSec() - 30 * DAY - 12 * 3600;
      await deliverAll(env, cancelSteps(`pre-mp11-cancel-early-${store}`, start).slice(0, 5));
      await assertSigned(env, await claim(env, `pre-mp11-cancel-early-${store}`), start + 3600 + MONTH,
        `${store}, cancelled inside the paid month`);
    }
  }
});

test("MP12 an instalment turned down on the authorized-payment topic alone counts, also once its debit date moved to the next retry", async () => {
  // VG-84 review, issue 3. Mercado Pago moves a turned-down instalment "to a
  // new collection date". The mapper read a decline only when the debit date
  // was not after the invoice's last update, so that shape recorded nothing.
  for (const [store, makeEnv] of STORES) {
    for (const moved of [true, false]) {
      const label = `${store}, debit date ${moved ? "moved to the next retry" : "left on the due date"}`;
      const env = makeEnv();
      const pre = `pre-mp12-${store}-${moved}`;
      const start = nowSec() - 33 * DAY;
      const due = start + 30 * DAY;
      await deliverAll(env, [
        preapproval(pre, "authorized", start, start + 20, start + 3600),
        docInstalment(pre, 121, start + 3600, start + 3630, "processed", "approved"),
        preapproval(pre, "authorized", start, start + 3700, due),
        preapproval(pre, "authorized", start, due + 60, start + 60 * DAY),
        // Last tried on day 32; the next try is on day 35.
        docInstalment(pre, 122, moved ? start + 35 * DAY : due, start + 32 * DAY, "recycling", "rejected", { retry_attempt: 2 })
      ]);
      const answer = await claim(env, pre);
      // Wrong behaviour (moved): 402 "suspended", the decline never recorded,
      // so the page could not say the card was turned down.
      assert.equal(answer.status, 402, `${label}: ${JSON.stringify(answer.body)}`);
      assert.equal(answer.body.reason, "declined", label);
      assert.equal(answer.body.entitlement.periodEnd, start + 3600 + MONTH, `${label}: the paid month, no more`);
    }

    // A first charge turned down in that shape: no money ever, card declined.
    // Wrong behaviour: 202 "pending", the buyer told to wait about an hour.
    const env = makeEnv();
    const pre = `pre-mp12-first-${store}`;
    const start = nowSec() - 2 * DAY;
    await deliverAll(env, [
      preapproval(pre, "authorized", start, start + 20, start + 3600),
      docInstalment(pre, 123, start + 3 * DAY, start + DAY, "recycling", "rejected", { retry_attempt: 1 })
    ]);
    const first = await claim(env, pre);
    assert.equal(first.status, 402, `${store}, first charge: ${JSON.stringify(first.body)}`);
    assert.equal(first.body.reason, "declined", store);
    assert.equal(first.body.token, undefined, store);
  }
});

test("MP13 Mercado Pago's documented invoice shape, with no date_approved: a first charge, and a renewal turned down then collected on a retry", async () => {
  // VG-84 review, issue 8: every other fixture gives the invoice's payment a
  // `date_approved` the reference does not list, so dropping the debit-date
  // fallback (X1) survived the whole suite.
  for (const [store, makeEnv] of STORES) {
    {
      const env = makeEnv();
      const pre = `pre-mp13-first-${store}`;
      const start = nowSec() - 2 * DAY;
      const debit = start + 3600;
      await deliverAll(env, [
        preapproval(pre, "authorized", start, start + 20, debit),
        docInstalment(pre, 131, debit, debit + 30, "processed", "approved"),
        preapproval(pre, "authorized", start, debit + 60, debit + 30 * DAY)
      ]);
      // The month from its debit date, not the next charge date a day short of it.
      await assertSigned(env, await claim(env, pre), debit + MONTH, `${store}: first charge on the authorized topic alone`);
    }

    // Renewal on day 30 turned down, then collected on day 33 by a retry of the
    // same invoice, its debit date left where it was. Decline and approval are
    // then dated the same instant, which must count as paid since.
    const env = makeEnv();
    const pre = `pre-mp13-retry-${store}`;
    const start = nowSec() - 70 * DAY;
    const first = start + 3600;
    const due = first + 30 * DAY;
    await deliverAll(env, [
      preapproval(pre, "authorized", start, start + 20, first),
      docInstalment(pre, 132, first, first + 30, "processed", "approved"),
      preapproval(pre, "authorized", start, first + 60, due),
      docInstalment(pre, 133, due, due + 300, "recycling", "rejected"),
      preapproval(pre, "authorized", start, due + 400, due + 30 * DAY)
    ]);
    const off = await claim(env, pre);
    assert.equal(off.status, 402, `${store}, turned down: ${JSON.stringify(off.body)}`);
    assert.equal(off.body.reason, "declined", store);
    await deliver(env, ...docInstalment(pre, 133, due, due + 3 * DAY, "processed", "approved"));
    // Day 70: the month the retry paid for (from its debit date) ran out on
    // day 61, and no later instalment has been reported. Wrong behaviour of
    // the same-instant boundary (X2): "declined", the page telling a payer
    // whose retry went through that the card was turned down.
    const lapsed = await claim(env, pre);
    assert.equal(lapsed.status, 402, `${store}, retried then lapsed: ${JSON.stringify(lapsed.body)}`);
    assert.equal(lapsed.body.reason, "suspended", `${store}: the retry cleared the decline`);
    assert.equal(lapsed.body.entitlement.periodEnd, due + MONTH, `${store}: the month the retry paid for`);

    // Control, same shape, read inside that month: signed.
    const recent = makeEnv();
    const s2 = nowSec() - 35 * DAY;
    const f2 = s2 + 3600;
    const d2 = f2 + 30 * DAY;
    await deliverAll(recent, [
      preapproval(`${pre}-recent`, "authorized", s2, s2 + 20, f2),
      docInstalment(`${pre}-recent`, 134, f2, f2 + 30, "processed", "approved"),
      preapproval(`${pre}-recent`, "authorized", s2, f2 + 60, d2),
      docInstalment(`${pre}-recent`, 135, d2, d2 + 300, "recycling", "rejected"),
      docInstalment(`${pre}-recent`, 135, d2, d2 + 3 * DAY, "processed", "approved")
    ]);
    await assertSigned(recent, await claim(recent, `${pre}-recent`), d2 + MONTH, `${store}: renewed on a retry`);
  }
});

test("MP14 an invoice whose payment is 'canceled' (the authorized-payments spelling) is a charge that did not go through", async () => {
  // VG-84 review, issue 11: only "cancelled" (the payments API's spelling) was read.
  const env = createTestEnv();
  const start = nowSec() - 2 * DAY;
  await deliverAll(env, [
    preapproval("pre-mp14", "authorized", start, start + 20, start + 3600),
    docInstalment("pre-mp14", 141, start + 3600, start + 3700, "recycling", "canceled")
  ]);
  const answer = await claim(env, "pre-mp14");
  // Wrong behaviour: 202 "pending", nothing recorded as turned down.
  assert.equal(answer.status, 402, JSON.stringify(answer.body));
  assert.equal(answer.body.reason, "declined");

  // Control: an invoice that is itself cancelled (the subscription stopped
  // and called its next charge off) is not a decline.
  const calledOff = createTestEnv();
  await deliverAll(calledOff, [
    preapproval("pre-mp14-off", "authorized", start, start + 20, start + 3600),
    docInstalment("pre-mp14-off", 142, start + 3600, start + 3700, "canceled", "canceled")
  ]);
  const waiting = await claim(calledOff, "pre-mp14-off");
  assert.equal(waiting.status, 202, JSON.stringify(waiting.body));
  assert.equal(waiting.body.reason, "pending");
});

test("MP15 a subscription charge's own text never sets the plan: 'anual' on a monthly charge buys a month", async () => {
  // VG-84 review, issue 5 (repro H2): the payment topic read planFromText for
  // a subscription's charge, which QA-W-04 had stopped trusting for the
  // preapproval itself.
  for (const chargeLast of [true, false]) {
    const env = createTestEnv();
    const pre = `pre-mp15-${chargeLast}`;
    const start = nowSec() - 5 * DAY;
    const approvedAt = start + 3600;
    const charge = ["payment", { ...payment(pre, 1501 + Number(chargeLast), "approved", approvedAt)[1], description: "Vocal Studio Pro anual" }];
    const sub = preapproval(pre, "authorized", start, approvedAt - 100, start + 30 * DAY);
    await deliverAll(env, chargeLast ? [sub, charge] : [charge, sub]);
    const answer = await claim(env, pre);
    // Wrong behaviour: plan pro_yearly and a period a year out, for S/ 19.90.
    assert.equal(answer.body.entitlement.plan, "pro_monthly", JSON.stringify(answer.body));
    await assertSigned(env, answer, approvedAt + MONTH, `charge ${chargeLast ? "last" : "first"}`);
  }
  // Control: a one-off payment's text still names its plan.
  const env = createTestEnv();
  const at = nowSec() - DAY;
  await deliver(env, "payment", { id: 1599, status: "approved", description: "Vocal Studio Pro anual",
    date_created: iso(at), date_approved: iso(at), date_last_updated: iso(at), payer: { id: 7 } });
  const oneOff = await claim(env, "1599");
  assert.equal(oneOff.body.entitlement.plan, "pro_yearly", JSON.stringify(oneOff.body));
});

test("MP16 on the payment topic, a subscription charge that names no subscription is not filed as a one-off purchase", async () => {
  // VG-84 review, issue 10. The payments API documents no `preapproval_id`;
  // its marker for a subscription's charge is operation_type
  // "recurring_payment". Filed under its operation number, such a charge
  // became a one-off month claimable from the receipt, and never reached the
  // subscription.
  const env = createTestEnv();
  const start = nowSec() - 2 * DAY;
  const approvedAt = start + 3600;
  await deliver(env, ...preapproval("pre-mp16", "authorized", start, start + 20, start + 30 * DAY));
  const unlinked = await deliver(env, "payment", { id: 1601, status: "approved", operation_type: "recurring_payment",
    transaction_amount: 19.9, date_created: iso(approvedAt), date_approved: iso(approvedAt),
    date_last_updated: iso(approvedAt + 5), payer: { id: 84 } });
  assert.equal(unlinked.body.reason, "no_license_identity", "acknowledged, not applied");
  const byReceipt = await claim(env, "1601");
  // Wrong behaviour: 200 and a month's licence for the receipt's number.
  assert.equal(byReceipt.body.token, undefined, JSON.stringify(byReceipt.body));
  assert.equal(byReceipt.status, 202);
  assert.equal((await claim(env, "pre-mp16")).status, 202, "the subscription still waits for a charge it can name");

  // The same charge naming its subscription where recurring-charge messaging
  // puts it entitles the subscription (unconfirmed against a sandbox charge).
  await deliver(env, "payment", { id: 1602, status: "approved", operation_type: "recurring_payment",
    point_of_interaction: { type: "SUBSCRIPTIONS", transaction_data: { subscription_id: "pre-mp16" } },
    date_created: iso(approvedAt), date_approved: iso(approvedAt), date_last_updated: iso(approvedAt + 6), payer: { id: 84 } });
  await assertSigned(env, await claim(env, "pre-mp16"), approvedAt + MONTH, "linked through point_of_interaction");

  // Control: a one-off Checkout Pro payment is still filed under its number.
  const oneOff = createTestEnv();
  await deliver(oneOff, "payment", { id: 1603, status: "approved", operation_type: "regular_payment",
    date_created: iso(approvedAt), date_approved: iso(approvedAt), date_last_updated: iso(approvedAt), payer: { id: 7 } });
  await assertSigned(oneOff, await claim(oneOff, "1603"), approvedAt + MONTH, "one-off");
});
