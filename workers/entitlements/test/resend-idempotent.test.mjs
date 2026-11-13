/**
 * A webhook that a human resends from the provider's dashboard carries a NEW
 * event id: Creem's docs say automatic retries reuse the id but a manual resend
 * does not, so the idempotency marker (`event:<provider>:<id>`) cannot dedupe
 * it. docs/43 2.1 claims the entitlement write is idempotent on its own key.
 * That claim was an argument, not a test, until this file.
 *
 * I believed it because no period is ever counted from `now` — every date comes
 * out of the payload — but believing is not proving, and the thing that would
 * break it is exactly the kind of edit nobody notices: one `Date.now()` in a
 * period calculation. Written by QA round 10 at my request and adopted here
 * unchanged. VG-76.
 *
 * Goal. Everything the worker stores about a purchase, other than the markers named after event ids, is byte-identical
 * after the same payload is delivered again under a new id; and a stale payload resent AFTER a newer one does not take
 * access back. Wrong behaviour: a resend that moves a period (counted from "now"), adds a second payment, or shortens
 * what a later renewal granted.
 */
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test, { mock } from "node:test";

import { handleRequest } from "../src/index.js";
import { createFakeKv, createTestEnv } from "./fixtures.mjs";

const DAY = 86400;
const T = Math.floor(Date.now() / 1000);
const hmacHex = (secret, message) => createHmac("sha256", secret).update(message).digest("hex");
const iso = (days) => new Date((T + days * DAY) * 1000).toISOString();
const msAt = (days) => (T + Math.round(days * DAY)) * 1000;

function creem(env, id, eventType, atDays, object) {
  const raw = JSON.stringify({ id, eventType, created_at: msAt(atDays), object });
  return handleRequest(new Request("https://w.test/v1/webhooks/creem", { method: "POST", body: raw, headers: { "creem-signature": hmacHex(env.CREEM_WEBHOOK_SECRET, raw) } }), env);
}
function stripe(env, id, type, atDays, object) {
  const raw = JSON.stringify({ id, type, created: T + Math.round(atDays * DAY), data: { object } });
  const ts = Math.floor(Date.now() / 1000);
  return handleRequest(new Request("https://w.test/v1/webhooks/stripe", { method: "POST", body: raw, headers: { "Stripe-Signature": `t=${ts},v1=${hmacHex(env.STRIPE_WEBHOOK_SECRET, `${ts}.${raw}`)}` } }), env);
}
const sub = (status, s, e, over) => ({
  id: "sub_1", object: "subscription", status, collection_method: "charge_automatically",
  product: { id: "prod_monthly", billing_period: "every-month" }, customer: { id: "cust_1" },
  items: [{ id: "si", product_id: "prod_monthly", units: 1 }],
  current_period_start_date: iso(s), current_period_end_date: iso(e), canceled_at: null, ...(over || {})
});
const paid = (tran, s, e, charged) => sub("active", s, e, { last_transaction_id: tran, last_transaction: { id: tran, amount: 1000, amount_paid: 1000, status: "paid" }, last_transaction_date: iso(charged) });
const checkout = { id: "ch_1", object: "checkout", status: "completed", mode: "prod", order: { id: "ord_1", status: "paid", transaction: "tran_1" }, product: { id: "prod_monthly", billing_period: "every-month" }, customer: { id: "cust_1" }, subscription: { id: "sub_1" }, metadata: {} };

/** Everything stored, except the idempotency markers (named after event ids, expected to differ) and `updatedAt`. */
function state(kv) {
  const out = {};
  for (const [k, v] of [...kv.store.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    if (k.startsWith("event:") || k.includes(":event:")) continue;
    // `updatedAt` is when the record was last written (bookkeeping; a resend writes it again). Nothing that grants access.
    let value = v.value;
    try { const o = JSON.parse(value); if (o && typeof o === "object" && "updatedAt" in o) { delete o.updatedAt; value = JSON.stringify(o); } } catch { /* not JSON */ }
    out[k] = value;
  }
  return JSON.stringify(out);
}
const markers = (kv) => [...kv.store.keys()].filter((k) => k.startsWith("event:") || k.includes(":event:"));

test("Creem: the same renewal resent under a new event id, an hour later, changes nothing that is stored", async (t) => {
  // A resend by hand comes minutes or days after the original. The clock moves an hour, so a period counted from "now" shows.
  mock.timers.enable({ apis: ["Date"], now: Date.now() });
  t.after(() => mock.timers.reset());
  const kv = createFakeKv();
  const env = createTestEnv({ ENTITLEMENTS: kv });
  assert.equal((await creem(env, "c1", "checkout.completed", 0, checkout)).status, 200);
  assert.equal((await creem(env, "c2", "subscription.paid", 0, paid("tran_1", 0, 31, 0))).status, 200);
  assert.equal((await creem(env, "c3", "subscription.paid", 31, paid("tran_2", 31, 62, 31))).status, 200);
  const before = state(kv);
  assert.ok(before.length > 50, "control: something was stored");
  const nMarkers = markers(kv).length;
  mock.timers.tick(3600 * 1000);
  const resent = await creem(env, "c3-resent-by-hand", "subscription.paid", 31, paid("tran_2", 31, 62, 31));
  assert.equal(resent.status, 200);
  assert.ok(markers(kv).length > nMarkers, "control: the new id was NOT deduped as a duplicate (it is a new marker), so the write really ran");
  assert.equal(state(kv), before, "the resend changed the stored entitlement");
});

test("Creem: an OLD renewal resent under a new id after a newer one does not take access back", async () => {
  const kv = createFakeKv();
  const env = createTestEnv({ ENTITLEMENTS: kv });
  await creem(env, "c1", "checkout.completed", 0, checkout);
  await creem(env, "c2", "subscription.paid", 0, paid("tran_1", 0, 31, 0));
  await creem(env, "c3", "subscription.paid", 31, paid("tran_2", 31, 62, 31));
  const before = state(kv);
  const resent = await creem(env, "c2-resent-by-hand", "subscription.paid", 0, paid("tran_1", 0, 31, 0));
  assert.equal(resent.status, 200);
  assert.equal(state(kv), before, "an earlier period, resent later, moved what the later renewal granted");
});

test("Stripe: the same invoice.paid resent under a new event id changes nothing that is stored", async () => {
  const kv = createFakeKv();
  const env = createTestEnv({ ENTITLEMENTS: kv });
  const session = { id: "cs", mode: "subscription", customer: "cus", subscription: "sub", payment_intent: null, payment_status: "paid" };
  const line = (s, e) => ({ period: { start: T + s * DAY, end: T + e * DAY } });
  const invoice = (id, lines) => ({ id, customer: "cus", subscription: "sub", payment_intent: `pi_${id}`, lines: { data: lines } });
  await stripe(env, "e1", "checkout.session.completed", 0, session);
  await stripe(env, "e2", "invoice.paid", 0, invoice("in1", [line(0, 31)]));
  await stripe(env, "e3", "invoice.paid", 31, invoice("in2", [line(31, 62)]));
  const before = state(kv);
  const r = await stripe(env, "e3-resent-by-hand", "invoice.paid", 31, invoice("in2", [line(31, 62)]));
  assert.equal(r.status, 200);
  assert.equal(state(kv), before, "the resend changed the stored entitlement");
  const r2 = await stripe(env, "e2-resent-by-hand", "invoice.paid", 0, invoice("in1", [line(0, 31)]));
  assert.equal(r2.status, 200);
  assert.equal(state(kv), before, "an earlier invoice, resent later, moved what the later one granted");
});
