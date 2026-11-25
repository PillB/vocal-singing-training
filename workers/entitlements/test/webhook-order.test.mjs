/**
 * Webhooks that arrive together or out of order must leave the state the
 * provider sent last, on every rail.
 *
 * The defect this pins was found in another project (November 2026): two
 * subscription webhooks arrive almost together, the handler reads
 * the record, both compute a new state, and the later write wins, so a late
 * "past_due" overwrites "canceled" and a cancelled subscription comes back.
 * The cure is two things together, and the race tests below need both:
 *
 *   1. a version check on every read-modify-write, retried on a conflict
 *      (src/ledger.js: one optimistic transaction per webhook in D1);
 *   2. an event older than the one the record holds may not change its state
 *      (`isStaleUpdate` in src/store.js).
 *
 * Without (1) the older write lands last, and the D1 rows of every rail turn
 * red. Without (2) its retry re-reads the cancellation and overwrites it
 * anyway, which turns the Creem and Mercado Pago D1 rows red; on Stripe the
 * deletion's own `ended:` key already refuses the late event, so (2) is
 * pinned by the other two rails.
 *
 * The race is forced, not hoped for: a gate holds each writer at its first
 * write of the license's state until both have read it, then lets them write
 * one at a time in a fixed order. The gate holds a D1 commit and a KV write of any of the license's
 * keys, in every arm, so a worker that silently stopped using D1 still meets
 * the race; and each raced case is run with each writer reading first, so
 * which one gets ahead is not left to the crypto thread pool. The KV-only arm of
 * "older commits last" is the control: on Creem and Mercado Pago it must
 * reproduce the defect, or the gate did not force anything and the D1 pass
 * would mean nothing. (On Stripe the cancellation is a deletion, whose own
 * `ended:` key is read over the record, so KV still reads cancelled there;
 * its record row shows the race happened.)
 *
 * The rest are two ways the stale check was handed the wrong time, found by
 * the review of that check (2026-11-25), both with no concurrency at all:
 *
 *   - a refund or dispute on Stripe or Creem moved the record's clock though
 *     it carries no status, so a pause made before it and delivered after it
 *     was refused and the subscription kept Pro (or a resume was refused and
 *     a payer stayed shut out);
 *   - Mercado Pago dated a subscription's approved charge by the charge's
 *     last edit, so a charge made before a cancellation, edited after it (a
 *     partial refund), brought the cancelled subscription back to "active".
 *
 * Every expected value is written by hand from the providers' payloads.
 */

import test from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac } from "node:crypto";

import { handleRequest } from "../src/index.js";
import { ledgerEnabled, ledgerReader } from "../src/ledger.js";
import { hmacSha256Hex, isTokenIssuable } from "../src/license.js";
import { buildMercadoPagoManifest, mapAuthorizedPaymentResource, mapPaymentResource } from "../src/mercadopago.js";
import { getEntitlement, getLicenseIdForSubscription } from "../src/store.js";
import { createAccountEnv, createTestEnv } from "./fixtures.mjs";

const NO_WAIT = { sleep: async () => {}, random: () => 0 };
const DAY = 86400;
const NOW = Math.floor(Date.now() / 1000);
const T0 = NOW - 10 * DAY;
const OLD_AT = T0 + 100;
const NEW_AT = T0 + 200;

const iso = (s) => new Date(s * 1000).toISOString();

// ------------------------------------------------------------------ delivery

function post(pathname, raw, headers) {
  return new Request(`https://entitlements.test${pathname}`, {
    method: "POST",
    body: raw,
    headers: { "content-type": "application/json", ...headers }
  });
}

async function answer(res) {
  return { status: res.status, body: await res.json() };
}

async function deliverStripe(env, event) {
  const raw = JSON.stringify(event);
  const ts = Math.floor(Date.now() / 1000);
  const sig = await hmacSha256Hex(env.STRIPE_WEBHOOK_SECRET, `${ts}.${raw}`);
  return answer(await handleRequest(post("/v1/webhooks/stripe", raw, { "Stripe-Signature": `t=${ts},v1=${sig}` }), env, { ledger: NO_WAIT }));
}

async function deliverCreem(env, event) {
  const raw = JSON.stringify(event);
  const sig = createHmac("sha256", env.CREEM_WEBHOOK_SECRET).update(raw).digest("hex");
  return answer(await handleRequest(post("/v1/webhooks/creem", raw, { "creem-signature": sig }), env, { ledger: NO_WAIT }));
}

let mpSeq = 0;
/** A Mercado Pago notification of `topic` whose API read answers `resource`, on every attempt. */
async function deliverMercadoPago(env, topic, resource, notificationId) {
  mpSeq += 1;
  const dataId = String(resource.id);
  const id = notificationId || 7700 + mpSeq;
  const notification = { id, type: topic, action: "updated", data: { id: dataId } };
  const ts = String(Math.floor(Date.now() / 1000));
  const requestId = `req-order-${mpSeq}`;
  const v1 = await hmacSha256Hex(env.MP_WEBHOOK_SECRET, buildMercadoPagoManifest({ dataId, requestId, ts }));
  const fetchImpl = async () => ({ ok: true, status: 200, async json() { return resource; } });
  const req = post("/v1/webhooks/mercadopago", JSON.stringify(notification), { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": requestId });
  return answer(await handleRequest(req, env, { ledger: NO_WAIT, fetchImpl }));
}

async function recordFor(env, provider, subscriptionId) {
  const store = ledgerReader(env);
  const id = await getLicenseIdForSubscription(store, provider, subscriptionId);
  return { id, record: id ? await getEntitlement(store, id) : null };
}

const ENVS = [["D1", () => createAccountEnv()], ["KV", () => createTestEnv()]];

// ------------------------------------------------------------------ the race

/** Which of the two writers, "older" or "newer", the code running now belongs to. */
const writer = new AsyncLocalStorage();

/**
 * The prefixes of the KV keys a license's state is kept under (`src/store.js`;
 * `LICENSE_FAMILY` in src/ledger.js). The first write of any of them is where
 * a writer on KV is held: the record is not the only one, and a Stripe
 * deletion writes its `ended:` key before the record.
 */
const LICENSE_KEYS = ["lic:", "paid:", "ended:", "reversed:", "charged:"];

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

/**
 * Hold each writer in `order` at its first write of the license's state (a
 * D1 commit, or a KV write of one of `LICENSE_KEYS`; its own event marker on
 * KV is not one and passes) until every one has reached its own, so each has
 * read that state before any has written to it; then let them go one at a
 * time in `order`, each writer's whole delivery finishing before the next is
 * let go. A writer's later writes (a
 * ledger retry, the record after its `ended:` key) follow it straight through.
 *
 * Which writer is which comes from `writer`, never from what is written. The
 * first version of this gate told them apart by the event time in the record
 * it held, and on KV held nothing else: a Stripe deletion that got ahead
 * wrote its `ended:` key, the past-due writer read it and wrote a record
 * carrying another time, which passed the gate unrecognised, and the gate
 * waited for that writer until the test timed out (CI, 2026-11-25).
 *
 * A writer whose delivery ends without writing lets the others through, so
 * nothing can hang; `heldAt` then shows the race was not forced. `arrivals`
 * is the order the writers reached the gate in (or ended without reaching
 * it), so a test can check that the writer it named really read first.
 */
function orderedGate(order) {
  const turns = Object.fromEntries(order.map((label) => [label, { at: null, reached: deferred(), go: deferred(), done: deferred(), ended: false }]));
  const arrivals = [];
  let started = false;
  async function letThemGo() {
    for (const label of order) {
      turns[label].go.resolve();
      await turns[label].done.promise;
    }
  }
  function startOnceAllAreIn() {
    if (!started && order.every((label) => turns[label].at || turns[label].ended)) {
      started = true;
      letThemGo();
    }
  }
  async function hold(point, run) {
    const turn = turns[writer.getStore()];
    if (!turn) {
      return run();
    }
    if (!turn.at) {
      turn.at = point;
      arrivals.push(writer.getStore());
      turn.reached.resolve();
      startOnceAllAreIn();
    }
    await turn.go.promise;
    return run();
  }
  function finished(label) {
    const turn = turns[label];
    if (!turn.at && !turn.ended) {
      arrivals.push(label);
    }
    turn.ended = true;
    turn.reached.resolve();
    turn.done.resolve();
    startOnceAllAreIn();
  }
  return {
    hold,
    finished,
    /** Resolves once `label` is held at the gate, or its delivery has ended. */
    reached: (label) => turns[label].reached.promise,
    /** Where each writer was first held: "D1 commit", "KV write", or null if it never was. */
    heldAt: () => Object.fromEntries(order.map((label) => [label, turns[label].at])),
    arrivals: () => arrivals.slice()
  };
}

/** Whether a D1 batch is a ledger commit (it settles its transaction's row). */
function isCommit(statements) {
  return statements.some((s) => /DELETE FROM ledger_tx WHERE tx_id/.test(String(s.sql || "")));
}

/**
 * Put one gate on both stores of an env: its D1 commits (when it has D1) and
 * its KV writes of a license's keys. `conflicts` counts each writer's commits
 * that the ledger refused (its last statement, settling the transaction's
 * row, changed nothing: src/ledger.js `commit`), so a check that a writer ran
 * again is a check that it really conflicted, not only that it committed twice.
 */
function installGate(env, order, keys = LICENSE_KEYS) {
  const gate = orderedGate(order);
  const conflicts = Object.fromEntries(order.map((label) => [label, 0]));
  if (env.DB) {
    const batch = env.DB.batch.bind(env.DB);
    env.DB.batch = (statements) => {
      if (!isCommit(statements)) {
        return batch(statements);
      }
      const label = writer.getStore();
      return gate.hold("D1 commit", async () => {
        const results = await batch(statements);
        const last = results && results[results.length - 1];
        if (label in conflicts && Number(last && last.meta && last.meta.changes) !== 1) {
          conflicts[label] += 1;
        }
        return results;
      });
    };
  }
  const ns = env.ENTITLEMENTS;
  for (const method of ["put", "delete"]) {
    const write = ns[method].bind(ns);
    ns[method] = (key, ...rest) => (keys.some((prefix) => String(key).startsWith(prefix))
      ? gate.hold("KV write", () => write(key, ...rest))
      : write(key, ...rest));
  }
  return { ...gate, conflicts };
}

/**
 * Run each of `writers` ({label: () => promise}) as that writer: `first` on
 * its own until it is held at the gate (or done), then the rest. So the order
 * the two read in is fixed by the test, not by which HMAC came back first.
 * Answers come back by label.
 */
async function runWriters(gate, writers, first) {
  const running = {};
  const start = (label) => {
    running[label] = writer.run(label, writers[label]).finally(() => gate.finished(label));
  };
  start(first);
  await gate.reached(first);
  for (const label of Object.keys(writers).filter((l) => l !== first)) {
    start(label);
  }
  const labels = Object.keys(running);
  const answers = await Promise.all(labels.map((label) => running[label]));
  return Object.fromEntries(labels.map((label, i) => [label, answers[i]]));
}

const stripeItem = { price: { id: "price_m", recurring: { interval: "month", interval_count: 1 } }, current_period_end: T0 + 30 * DAY };
const stripeSub = (status, extra) => ({ id: "sub_race", customer: "cus_race", status, items: { data: [stripeItem] }, ...(extra || {}) });

const creemSub = (status, extra) => ({
  id: "csub_race", object: "subscription", status, mode: "prod", collection_method: "charge_automatically",
  product: { id: "prod_monthly", name: "Pro Monthly", billing_period: "every-month" },
  customer: { id: "cust_1", email: "singer@example.com" },
  items: [{ id: "sitem_1", product_id: "prod_monthly", units: 1 }],
  current_period_start_date: iso(T0), current_period_end_date: iso(T0 + 31 * DAY), canceled_at: null, ...(extra || {})
});
const creemEvent = (id, eventType, at, object) => ({ id, eventType, created_at: at * 1000, object });

const preapproval = (id, status, at) => ({
  id, status, payer_id: 77, reason: "Vocal Studio Pro mensual",
  next_payment_date: iso(T0 + 30 * DAY), date_created: iso(T0), last_modified: iso(at)
});

/**
 * Per rail: how a subscription is set up active, then the OLDER event (a grace
 * or entitling state) and the NEWER cancellation that race.
 */
const RAILS = {
  stripe: {
    provider: "stripe",
    subscriptionId: "sub_race",
    deliver: deliverStripe,
    setUp: [
      { id: "evt_created", type: "customer.subscription.created", created: T0, data: { object: stripeSub("active") } },
      { id: "evt_paid", type: "invoice.paid", created: T0, data: { object: { subscription: "sub_race", customer: "cus_race", payment_intent: "pi_1", lines: { data: [{ period: { end: T0 + 30 * DAY }, price: { id: "price_m" } }] } } } },
      { id: "evt_cs", type: "checkout.session.completed", created: T0, data: { object: { id: "cs_race", mode: "subscription", customer: "cus_race", subscription: "sub_race", payment_status: "paid" } } }
    ],
    older: { id: "evt_old_pastdue", type: "customer.subscription.updated", created: OLD_AT, data: { object: stripeSub("past_due") } },
    newer: { id: "evt_new_deleted", type: "customer.subscription.deleted", created: NEW_AT, data: { object: stripeSub("canceled", { ended_at: NEW_AT, cancellation_details: { reason: "cancellation_requested" } }) } },
    olderStatus: "past_due",
    kvOlderLast: "canceled"
  },
  creem: {
    provider: "creem",
    subscriptionId: "csub_race",
    deliver: deliverCreem,
    setUp: [
      creemEvent("cevt_co", "checkout.completed", T0, {
        id: "ch_race", object: "checkout", status: "completed", mode: "prod",
        order: { id: "ord_1", amount: 1000, currency: "USD", status: "paid", type: "recurring", transaction: "tran_1" },
        product: { id: "prod_monthly", name: "Pro Monthly", billing_type: "recurring", billing_period: "every-month" },
        customer: { id: "cust_1", email: "singer@example.com" },
        subscription: { id: "csub_race", object: "subscription", status: "active" }, metadata: {}
      }),
      creemEvent("cevt_sp", "subscription.paid", T0, creemSub("active", {
        last_transaction_id: "tran_1", last_transaction: { id: "tran_1", amount: 1000, amount_paid: 1000, status: "paid" },
        last_transaction_date: iso(T0), next_transaction_date: iso(T0 + 31 * DAY)
      }))
    ],
    older: creemEvent("cevt_old_pastdue", "subscription.update", OLD_AT, creemSub("past_due")),
    newer: creemEvent("cevt_new_canceled", "subscription.canceled", NEW_AT, creemSub("canceled", { canceled_at: iso(NEW_AT) })),
    olderStatus: "past_due",
    kvOlderLast: "past_due"
  },
  mercadopago: {
    provider: "mercadopago",
    subscriptionId: "pre_race",
    deliver: (env, n) => deliverMercadoPago(env, "subscription_preapproval", n.resource, n.notificationId),
    setUp: [{ notificationId: 7000, resource: preapproval("pre_race", "authorized", T0) }],
    older: { notificationId: 7001, resource: preapproval("pre_race", "authorized", OLD_AT) },
    newer: { notificationId: 7002, resource: preapproval("pre_race", "cancelled", NEW_AT) },
    olderStatus: "active",
    kvOlderLast: "active"
  }
};

/**
 * Set the rail up, then deliver its two events: in sequence (newer first), or
 * raced in `arm`'s commit order with the `first` writer reading first.
 */
async function race(railName, makeEnv, arm, first = "older") {
  const rail = RAILS[railName];
  const env = makeEnv();
  for (const event of rail.setUp) {
    const a = await rail.deliver(env, event);
    assert.equal(a.status, 200, `set-up event answered ${a.status} ${JSON.stringify(a.body)}`);
  }
  const before = (await recordFor(env, rail.provider, rail.subscriptionId)).record;
  assert.equal(before && before.status, "active", "set-up leaves an active subscription");
  let gate = null;
  let answers;
  if (arm === "in sequence") {
    answers = [await rail.deliver(env, rail.newer), await rail.deliver(env, rail.older)];
  } else {
    gate = installGate(env, arm === "older commits last" ? ["newer", "older"] : ["older", "newer"]);
    const byLabel = await runWriters(gate, { older: () => rail.deliver(env, rail.older), newer: () => rail.deliver(env, rail.newer) }, first);
    answers = [byLabel.older, byLabel.newer];
  }
  const { id, record } = await recordFor(env, rail.provider, rail.subscriptionId);
  const raw = JSON.parse((await ledgerReader(env).get(`lic:${id}`)) || "null");
  return { rail, answers, record, raw, gate, first, usedD1: ledgerEnabled(env) };
}

/**
 * What the forced race must show: the writer named first reached the gate
 * first, both were held before either wrote the license's state, and on D1
 * the one let go last really conflicted (and the one let go first did not).
 */
function assertForced(outcome, store, arm) {
  const { gate, first, usedD1 } = outcome;
  const point = usedD1 ? "D1 commit" : "KV write";
  assert.equal(gate.arrivals()[0], first, `the ${first} writer read first, as the case names it (${JSON.stringify(gate.arrivals())})`);
  assert.deepEqual(gate.heldAt(), { older: point, newer: point }, `both writers were held at their first ${point}, before either wrote (${first} read first)`);
  if (store === "D1") {
    const [goesFirst, goesLast] = arm === "older commits last" ? ["newer", "older"] : ["older", "newer"];
    const seen = `${JSON.stringify(gate.conflicts)}, ${first} read first`;
    assert.ok(gate.conflicts[goesLast] >= 1, `on D1 the writer let go last conflicted and ran again (${seen})`);
    assert.equal(gate.conflicts[goesFirst], 0, `on D1 the writer let go first committed at once (${seen})`);
  }
}

/**
 * A deadline of its own for each case that goes through the gate, so a gate
 * that leaves a writer waiting fails here, by name, in seconds, whatever
 * timeout the runner was started with (test:core sets none).
 */
const DEADLINE = 10000;

/** Raced arms run once with each writer reading first; "in sequence" once. */
const firstReaders = (arm) => (arm === "in sequence" ? ["older"] : ["older", "newer"]);

for (const railName of Object.keys(RAILS)) {
  for (const [store, makeEnv] of ENVS) {
    for (const arm of ["in sequence", "older commits last", "newer commits last"]) {
      const control = store === "KV" && arm === "older commits last";
      const title = `${railName}, ${store}, ${arm}: ${control
        ? `CONTROL, without the ledger the older write wins the record (${RAILS[railName].kvOlderLast} is read)`
        : "the newer cancellation is what stays"}`;
      test(title, { timeout: DEADLINE }, async () => {
        for (const first of firstReaders(arm)) {
          const outcome = await race(railName, makeEnv, arm, first);
          const { rail, answers, record, raw } = outcome;
          const how = arm === "in sequence" ? arm : `${first} read first`;
          assert.deepEqual(answers.map((a) => a.status), [200, 200], `both deliveries acknowledged (${how})`);
          assert.equal(outcome.usedD1, store === "D1", "the env runs the store it is named for");
          if (arm !== "in sequence") {
            assertForced(outcome, store, arm);
          }
          if (control) {
            assert.equal(raw.status, rail.olderStatus, `KV control: the record row itself was overwritten by the older event (${how})`);
            assert.equal(record.status, rail.kvOlderLast, `KV control: what the worker reads without the ledger (${how})`);
            continue;
          }
          assert.equal(record.status, "canceled", `the newer cancellation is what the worker reads (${how})`);
          assert.equal(record.occurredAt, NEW_AT, `the record's clock is the cancellation's, not the older event's (${how})`);
        }
      });
    }
  }
}

// The gate itself, on two writers made up to show what it must prevent: one
// changes a license's side key (writes it, or deletes it) and then its
// record, the other reads that side key before writing. Held at its record
// write alone (the first version of the gate), or at puts alone, the first
// writer's change to the side key is already out when the second reads.
async function sideKeyRace(change, keys) {
  const env = createTestEnv();
  const kv = env.ENTITLEMENTS;
  await kv.put("ended:L", "as set up");
  const gate = installGate(env, ["older", "newer"], keys);
  let seen;
  await runWriters(gate, {
    older: async () => {
      await (change === "delete" ? kv.delete("ended:L") : kv.put("ended:L", "changed"));
      await kv.put("lic:L", "older");
    },
    newer: async () => {
      seen = await kv.get("ended:L");
      await kv.put("lic:L", "newer");
    }
  }, "older");
  return { seen, heldAt: gate.heldAt(), record: await kv.get("lic:L") };
}

for (const change of ["put", "delete"]) {
  test(`race gate: a writer is held at its first write of a license's keys (a ${change}), so the other reads none of it`, { timeout: DEADLINE }, async () => {
    const held = await sideKeyRace(change);
    assert.equal(held.seen, "as set up", "the second writer read before the first changed anything");
    assert.deepEqual(held.heldAt, { older: "KV write", newer: "KV write" });
    assert.equal(held.record, "newer", "then they wrote in the gate's order");
    // The wrong gate, held at the record alone: the side key is read changed.
    const recordOnly = await sideKeyRace(change, ["lic:"]);
    assert.equal(recordOnly.seen, change === "delete" ? null : "changed", "control: held at the record alone, the first writer's change was already read");
  });
}

test("race gate: the writer named first is the first to reach the gate, either way round", { timeout: DEADLINE }, async () => {
  for (const first of ["older", "newer"]) {
    const env = createTestEnv();
    const kv = env.ENTITLEMENTS;
    const gate = installGate(env, ["older", "newer"]);
    await runWriters(gate, {
      older: () => kv.put("lic:L", "older"),
      newer: () => kv.put("lic:L", "newer")
    }, first);
    assert.deepEqual(gate.arrivals(), first === "older" ? ["older", "newer"] : ["newer", "older"], `${first} named first`);
    assert.equal(await kv.get("lic:L"), "newer", "and they still wrote in the gate's order");
  }
});

test("race gate: a writer that ends without writing lets the other through, and the race reads as not forced", { timeout: DEADLINE }, async () => {
  const env = createTestEnv();
  const kv = env.ENTITLEMENTS;
  const gate = installGate(env, ["older", "newer"]);
  const answers = await runWriters(gate, {
    older: async () => { await kv.put("lic:L", "older"); return "wrote"; },
    newer: async () => "wrote nothing"
  }, "older");
  assert.deepEqual(answers, { older: "wrote", newer: "wrote nothing" }, "both finished, neither was left waiting");
  assert.deepEqual(gate.heldAt(), { older: "KV write", newer: null }, "the gate says the newer writer was never held");
  assert.deepEqual(gate.arrivals(), ["older", "newer"], "the newer writer counts as in once it ended");
  assert.equal(await kv.get("lic:L"), "older");
});

// What D1 does not settle (VG-100): the race now ends as SOME serial order,
// not as the provider's. Here the subscription was past due when it was
// cancelled, so in the provider's order the cancellation keeps none of the
// unpaid period (no token). When the cancellation is applied first it cannot
// know that, and the late past_due is refused, so the unpaid period stays
// open. The status is right in every arm above; access is not yet.
for (const railName of ["stripe", "creem"]) {
  test(`${railName}: a subscription cancelled while past due gets no token in any order`, { timeout: DEADLINE, todo: "VG-100 the cancellation learns the dunning from the record's status at the time, so the order decides access" }, async () => {
    for (const arm of ["in sequence", "older commits last", "newer commits last"]) {
      const { record } = await race(railName, () => createAccountEnv(), arm);
      assert.equal(record.status, "canceled");
      assert.equal(isTokenIssuable(record, NOW), false, `${arm}: periodEnd ${record.periodEnd - NOW}s from now`);
    }
  });
}

// ------------------------------------------- refunds stay off the clock

/**
 * Stripe: two paid months, a failed renewal (past_due), then dunning gives up
 * and marks the subscription `unpaid` (suspended: no token). A day later the
 * merchant refunds MONTH ONE's charge, which is not the period's payment and
 * so ends nothing. Delivered in that order the subscription is suspended.
 */
async function stripeUnpaidThenRefund(makeEnv, order) {
  const env = makeEnv();
  const B = NOW - 80 * DAY;
  const sub = (status, end) => ({ id: "sub_rf", customer: "cus_rf", status, current_period_end: end, items: { data: [{ price: { id: "price_m", recurring: { interval: "month", interval_count: 1 } } }] } });
  const invoice = (id, type, at, pi, end) => ({ id, type, created: at, data: { object: { subscription: "sub_rf", customer: "cus_rf", ...(pi ? { payment_intent: pi } : {}), lines: { data: [{ period: { end }, price: { id: "price_m" } }] } } } });
  const setUp = [
    { id: "rf1", type: "customer.subscription.created", created: B, data: { object: sub("active", B + 30 * DAY) } },
    invoice("rf2", "invoice.paid", B, "pi_1", B + 30 * DAY),
    invoice("rf3", "invoice.paid", B + 30 * DAY, "pi_2", B + 60 * DAY),
    { id: "rf4", type: "customer.subscription.updated", created: B + 30 * DAY, data: { object: sub("active", B + 60 * DAY) } },
    invoice("rf5", "invoice.payment_failed", B + 60 * DAY, null, B + 90 * DAY),
    { id: "rf6", type: "customer.subscription.updated", created: B + 60 * DAY, data: { object: sub("past_due", B + 90 * DAY) } }
  ];
  const unpaid = { id: "rf7", type: "customer.subscription.updated", created: B + 75 * DAY, data: { object: sub("unpaid", B + 90 * DAY) } };
  const refund = { id: "rf8", type: "charge.refunded", created: B + 76 * DAY, data: { object: { id: "ch_1", payment_intent: "pi_1", customer: "cus_rf", created: B, amount: 1000, amount_refunded: 1000, refunded: true } } };
  const late = { "provider order": [unpaid, refund], "refund first": [refund, unpaid], "no refund": [unpaid] }[order];
  for (const event of [...setUp, ...late]) {
    const a = await deliverStripe(env, event);
    assert.equal(a.status, 200, `${event.type} answered ${a.status} ${JSON.stringify(a.body)}`);
  }
  return (await recordFor(env, "stripe", "sub_rf")).record;
}

/**
 * Creem: two paid months, then paused (suspended: no token), optionally
 * resumed two days later, and a day after that a full refund of MONTH ONE's
 * transaction (not the period's: it ends nothing).
 */
async function creemPauseThenRefund(makeEnv, order, resumed) {
  const env = makeEnv();
  const B = NOW - 45 * DAY;
  const sub = (status, tran, tranAt) => ({
    id: "csub_rf", customer: "cust_rf", product: { id: "prod_m", billing_period: "every-month" }, status,
    current_period_end_date: iso(B + 60 * DAY), last_transaction_id: tran, last_transaction_date: iso(tranAt)
  });
  const at = (d) => (B + d * DAY) * 1000;
  const setUp = [
    { id: "crf1", eventType: "subscription.paid", created_at: at(0), object: { ...sub("active", "tran_1", B), current_period_end_date: iso(B + 30 * DAY) } },
    { id: "crf2", eventType: "subscription.paid", created_at: at(30), object: sub("active", "tran_2", B + 30 * DAY) }
  ];
  const paused = { id: "crf3", eventType: "subscription.paused", created_at: at(40), object: sub("paused", "tran_2", B + 30 * DAY) };
  const active = { id: "crf4", eventType: "subscription.active", created_at: at(42), object: sub("active", "tran_2", B + 30 * DAY) };
  const refund = { id: "crf5", eventType: "refund.created", created_at: at(43), object: { id: "ref_1", refund_amount: 1000, created_at: at(43), subscription: "csub_rf", transaction: { id: "tran_1", status: "refunded", amount_paid: 1000 } } };
  // "refund first" means the refund is processed before the status change it
  // follows: before the pause, or (when resumed) between the pause and the resume.
  const late = resumed
    ? { "provider order": [paused, active, refund], "refund first": [paused, refund, active], "no refund": [paused, active] }[order]
    : { "provider order": [paused, refund], "refund first": [refund, paused], "no refund": [paused] }[order];
  for (const event of [...setUp, ...late]) {
    const a = await deliverCreem(env, event);
    assert.equal(a.status, 200, `${event.eventType} answered ${a.status} ${JSON.stringify(a.body)}`);
  }
  return (await recordFor(env, "creem", "csub_rf")).record;
}

for (const [store, makeEnv] of ENVS) {
  for (const order of ["provider order", "refund first", "no refund"]) {
    test(`Stripe, ${store}, ${order}: a subscription marked unpaid stays suspended, whenever an older charge's refund is processed`, async () => {
      const record = await stripeUnpaidThenRefund(makeEnv, order);
      // Wrong (before): with the refund first, "unpaid" was refused as stale
      // and the subscription stayed past_due, with a token until its period end.
      assert.equal(record.status, "suspended");
      assert.equal(isTokenIssuable(record, NOW), false, "no token for a suspended subscription");
    });
    test(`Creem, ${store}, ${order}: a paused subscription stays paused, whenever an older charge's refund is processed`, async () => {
      const record = await creemPauseThenRefund(makeEnv, order, false);
      // Wrong (before): with the refund first, the pause was refused and the
      // subscription stayed active with a token.
      assert.equal(record.status, "suspended");
      assert.equal(isTokenIssuable(record, NOW), false, "no token for a paused subscription");
    });
    test(`Creem, ${store}, ${order}: a resumed subscription is active again, whenever an older charge's refund is processed`, async () => {
      const record = await creemPauseThenRefund(makeEnv, order, true);
      // Wrong (before), the other direction: with the refund first, the resume
      // was refused and a subscriber who had paid for the month stayed shut out.
      assert.equal(record.status, "active");
      assert.equal(isTokenIssuable(record, NOW), true, "the month paid for is open again");
    });
  }
}

test("Stripe and Creem: money going back keeps its own date but leaves the record's clock where it was", async () => {
  for (const [, makeEnv] of ENVS) {
    const stripe = await stripeUnpaidThenRefund(makeEnv, "provider order");
    assert.equal(stripe.occurredAt, NOW - 80 * DAY + 75 * DAY, "Stripe: the clock is the unpaid event's");
    assert.equal(stripe.reversedAt, NOW - 80 * DAY + 76 * DAY, "Stripe: the refund is still dated");
    const creem = await creemPauseThenRefund(makeEnv, "provider order", false);
    assert.equal(creem.occurredAt, NOW - 45 * DAY + 40 * DAY, "Creem: the clock is the pause's");
    assert.equal(creem.reversedAt, NOW - 45 * DAY + 43 * DAY, "Creem: the refund is still dated");
  }
});

// ------------------------------- a Mercado Pago charge is dated by its money

const MP_B = NOW - 20 * DAY;
const MP_CANCEL = MP_B + 10 * DAY;
const MP_EDIT = MP_B + 12 * DAY;

/** An approved charge of the subscription, made at MP_B, last edited at `editedAt` (a partial refund keeps it approved). */
const mpPayment = (editedAt) => ({
  id: 5003, status: "approved", status_detail: editedAt > MP_B ? "partially_refunded" : "accredited",
  preapproval_id: "pre_ch", payer: { id: 77 }, transaction_amount: 10,
  date_created: iso(MP_B), date_approved: iso(MP_B), date_last_updated: iso(editedAt)
});
/** The same charge on the authorized-payment topic. */
const mpAuthorized = (editedAt) => ({
  id: 9003, preapproval_id: "pre_ch", status: "processed", debit_date: iso(MP_B), date_created: iso(MP_B),
  last_modified: iso(editedAt), payment: { id: 5003, status: "approved", status_detail: "partially_refunded", date_approved: iso(MP_B) }
});
const mpPre = (status, at) => ({
  ...preapproval("pre_ch", status, at),
  auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount: 10, currency_id: "PEN" },
  next_payment_date: iso(MP_B + 30 * DAY), date_created: iso(MP_B)
});

/** Authorize, charge (notified at once), cancel, and the charge notified again after an edit, in `order`. */
async function mercadoPagoChargeEditedAfterCancel(makeEnv, topic, editedAt, order) {
  const env = makeEnv();
  const charge = topic === "payment" ? mpPayment : mpAuthorized;
  const steps = [
    ["subscription_preapproval", mpPre("authorized", MP_B)],
    [topic, charge(MP_B)]
  ];
  const cancel = ["subscription_preapproval", mpPre("cancelled", MP_CANCEL)];
  const edited = [topic, charge(editedAt)];
  steps.push(...(order === "provider order" ? [cancel, edited] : [edited, cancel]));
  for (const [t, resource] of steps) {
    const a = await deliverMercadoPago(env, t, resource);
    assert.equal(a.status, 200, `${t} answered ${a.status} ${JSON.stringify(a.body)}`);
  }
  return (await recordFor(env, "mercadopago", "pre_ch")).record;
}

for (const [store, makeEnv] of ENVS) {
  for (const topic of ["payment", "subscription_authorized_payment"]) {
    for (const order of ["provider order", "edit notified before the cancellation"]) {
      test(`Mercado Pago, ${store}, ${topic}, ${order}: a charge made before a cancellation and edited after it does not undo the cancellation`, async () => {
        const record = await mercadoPagoChargeEditedAfterCancel(makeEnv, topic, MP_EDIT, order);
        // Wrong (before): dated by its last edit (MP_EDIT, after the cancel),
        // the charge's "active" overwrote "canceled", and the cancellation's
        // own redelivery was then refused as stale.
        assert.equal(record.status, "canceled");
        assert.equal(record.occurredAt, MP_CANCEL, "the clock is the cancellation's");
      });
    }
    test(`Mercado Pago, ${store}, ${topic}, control: the same charge re-notified unedited leaves the cancellation`, async () => {
      const record = await mercadoPagoChargeEditedAfterCancel(makeEnv, topic, MP_B, "provider order");
      assert.equal(record.status, "canceled");
    });
  }
}

test("Mercado Pago: a charge approved after a cancellation is still newer than it", async () => {
  // The positive case next to the fix: dating a charge by its money must not
  // make a charge that really went through later look old.
  for (const [, makeEnv] of ENVS) {
    const env = makeEnv();
    const later = MP_CANCEL + 3600;
    await deliverMercadoPago(env, "subscription_preapproval", mpPre("authorized", MP_B));
    await deliverMercadoPago(env, "subscription_preapproval", mpPre("cancelled", MP_CANCEL));
    await deliverMercadoPago(env, "payment", { ...mpPayment(later), status_detail: "accredited", date_created: iso(later), date_approved: iso(later) });
    const { record } = await recordFor(env, "mercadopago", "pre_ch");
    assert.equal(record.status, "active", "money that arrived after the cancellation brings access back, as the README says");
    assert.equal(record.occurredAt, later);
  }
});

test("Mercado Pago: a subscription charge's clock is its stated approval, never later than its last edit, else its last edit", () => {
  const at = (v) => Math.floor(new Date(v).getTime() / 1000);
  const charge = { id: 1, status: "approved", preapproval_id: "pre_u", date_created: "2026-11-01T10:00:00.000Z", date_approved: "2026-11-01T10:00:05.000Z", date_last_updated: "2026-11-09T00:00:00.000Z" };
  // Edited a week after it went through: dated by the approval.
  assert.equal(mapPaymentResource(charge, {}).occurredAt, at("2026-11-01T10:00:05.000Z"));
  // No approval date: its last edit, as before. Not its creation date, which
  // a charge approved later has passed (a voucher, a retried card).
  assert.equal(mapPaymentResource({ ...charge, date_approved: undefined }, {}).occurredAt, at("2026-11-09T00:00:00.000Z"));
  // A malformed approval dated after the last edit: the last edit, so a
  // future-dated charge cannot make every later state change look old.
  assert.equal(mapPaymentResource({ ...charge, date_approved: "2027-01-01T00:00:00.000Z" }, {}).occurredAt, at("2026-11-09T00:00:00.000Z"));
  // A one-off payment is its own lifecycle (approved, then refunded on the
  // same resource): its clock stays its last edit.
  assert.equal(mapPaymentResource({ ...charge, preapproval_id: undefined }, {}).occurredAt, at("2026-11-09T00:00:00.000Z"));
  // The authorized-payment topic: by the payment's approval when it states one...
  const authorized = { id: 2, preapproval_id: "pre_u", status: "processed", debit_date: "2026-11-01T09:00:00.000Z", date_created: "2026-10-31T00:00:00.000Z", last_modified: "2026-11-09T00:00:00.000Z", payment: { id: 1, status: "approved", date_approved: "2026-11-01T10:00:05.000Z" } };
  assert.equal(mapAuthorizedPaymentResource(authorized, {}).occurredAt, at("2026-11-01T10:00:05.000Z"));
  // ...and as documented it states none: then its last edit, not its debit date.
  assert.equal(mapAuthorizedPaymentResource({ ...authorized, payment: { id: 1, status: "approved" } }, {}).occurredAt, at("2026-11-09T00:00:00.000Z"));
  assert.equal(mapAuthorizedPaymentResource({ ...authorized, payment: { id: 1, status: "approved", date_approved: "2027-01-01T00:00:00.000Z" } }, {}).occurredAt, at("2026-11-09T00:00:00.000Z"));
  // No readable date of its own: no clock at all, even with a (future) approval date to hand.
  const undated = { id: 3, preapproval_id: "pre_u", status: "processed", debit_date: "2027-01-01T00:00:00.000Z", payment: { id: 1, status: "approved", date_approved: "2027-01-01T00:00:00.000Z" } };
  assert.equal(mapAuthorizedPaymentResource(undated, {}).occurredAt, null);
});

test("Mercado Pago: an installment approved on a retry keeps the month it paid for, whichever of it and an older preapproval snapshot is processed last", async () => {
  // The documented authorized-payment shape: the payment has no approval
  // date. Due at M0, turned down, approved on a retry four days later; the
  // payer updated the card on the preapproval in between (still authorized,
  // its next charge date still the unpaid one).
  const M0 = NOW - 20 * DAY;
  const pre = (at, next) => ({ ...mpPre("authorized", at), id: "pre_rt", next_payment_date: iso(next), date_created: iso(M0 - 40 * DAY) });
  const inst = (id, status, payStatus, debitAt, modifiedAt, payId) => ({
    id, preapproval_id: "pre_rt", status, debit_date: iso(debitAt), date_created: iso(M0 - 3600), last_modified: iso(modifiedAt),
    payment: { id: payId, status: payStatus, status_detail: payStatus === "approved" ? "accredited" : "cc_rejected_insufficient_amount" }
  });
  const setUp = [
    ["subscription_preapproval", pre(M0 - 31 * DAY, M0)],
    ["subscription_authorized_payment", inst(9200, "processed", "approved", M0 - 30 * DAY, M0 - 30 * DAY, 7300)],
    ["subscription_authorized_payment", inst(9201, "recycling", "rejected", M0, M0, 7301)]
  ];
  const retry = ["subscription_authorized_payment", inst(9201, "processed", "approved", M0, M0 + 4 * DAY, 7302)];
  const snapshot = ["subscription_preapproval", pre(M0 + 2 * DAY, M0)];
  for (const [, makeEnv] of ENVS) {
    for (const late of [[retry, snapshot], [snapshot, retry]]) {
      const env = makeEnv();
      for (const [t, resource] of [...setUp, ...late]) {
        const a = await deliverMercadoPago(env, t, resource);
        assert.equal(a.status, 200, `${t} answered ${a.status}`);
      }
      const { record } = await recordFor(env, "mercadopago", "pre_rt");
      // Wrong (the first version of this fix, dated by the debit date): the
      // snapshot counted as newer than the money and put the unpaid due date
      // back as the period end, so a payer lost the month the retry bought.
      assert.ok(record.periodEnd > NOW, `the retry's month is kept (periodEnd ${record.periodEnd - NOW}s from now)`);
      assert.equal(isTokenIssuable(record, NOW), true);
    }
  }
});
