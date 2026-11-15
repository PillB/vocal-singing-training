/**
 * Which Stripe prices are ours.
 *
 * `STRIPE_PRICE_PRO_MONTHLY` and `_YEARLY` began as labels — a way to know
 * whether a subscription was monthly or yearly — and were never a gate, so
 * anything else sold from the same Stripe account entitled: a donation, a
 * one-off lesson, a subscription at any price at all (QA round 4, QA-W-03).
 * Where they are filled in they are now read as an allow-list as well.
 *
 * The reason this file exists rather than two more lines in stripe.test.mjs is
 * that the dangerous direction is the other one. A gate on a list the operator
 * maintains by hand can refuse somebody who really did pay, and a yearly
 * subscriber hears nothing until their next renewal. So what is pinned here is
 * as much the two ways back as the gate itself:
 *   - naming the plan in the subscription's metadata, which needs no deploy and
 *     takes effect on the event that edit emits;
 *   - adding the price id and redeploying, after which the next subscription
 *     event entitles it.
 * And, because the repository ships with both ids empty, that an unconfigured
 * worker behaves exactly as it did before.
 */

import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";

import { handleRequest } from "../src/index.js";
import { priceVerdict, stripePriceTableConfigured } from "../src/stripe.js";
import { createFakeKv, createTestEnv } from "./fixtures.mjs";

const DAY = 86400;
const T = Math.floor(Date.now() / 1000);
const hmacHex = (secret, message) => createHmac("sha256", secret).update(message).digest("hex");

/** An env whose price table names two prices, as a selling deployment's does. */
const listedEnv = () =>
  createTestEnv({
    ENTITLEMENTS: createFakeKv(),
    STRIPE_PRICE_PRO_MONTHLY: "price_mine_m",
    STRIPE_PRICE_PRO_YEARLY: "price_mine_y"
  });

/**
 * Deliver one signed Stripe event to the real webhook route.
 * @param {Object} env Worker env.
 * @param {string} id Event id.
 * @param {string} type Event type.
 * @param {number} atDays Days after T the event was emitted.
 * @param {Object} object The event's data object.
 * @returns {Promise<Response>} The worker's answer.
 */
function deliver(env, id, type, atDays, object) {
  const raw = JSON.stringify({ id, type, created: T + atDays * DAY, data: { object } });
  const ts = Math.floor(Date.now() / 1000);
  return handleRequest(
    new Request("https://w.test/v1/webhooks/stripe", {
      method: "POST",
      body: raw,
      headers: { "Stripe-Signature": `t=${ts},v1=${hmacHex(env.STRIPE_WEBHOOK_SECRET, `${ts}.${raw}`)}` }
    }),
    env
  );
}

/**
 * Whether /v1/claim would hand this session a licence, on a given day.
 * @param {Object} env Worker env.
 * @param {string} sessionId Checkout session id.
 * @param {number} atDays Days after T to pretend it is.
 * @returns {Promise<number>} The claim's status.
 */
async function claimStatus(env, sessionId, atDays) {
  const real = Date.now;
  Date.now = () => (T + atDays * DAY) * 1000;
  try {
    const response = await handleRequest(
      new Request("https://w.test/v1/claim", {
        method: "POST",
        body: JSON.stringify({ provider: "stripe", sessionId }),
        headers: { "content-type": "application/json" }
      }),
      env
    );
    return response.status;
  } finally {
    Date.now = real;
  }
}

/** A paid subscription checkout, which says nothing about the price. */
const checkout = (sessionId, subscriptionId) => ({
  id: sessionId,
  mode: "subscription",
  customer: "cus_p",
  subscription: subscriptionId,
  payment_status: "paid"
});

/**
 * A Stripe subscription on one price.
 * @param {string} id Subscription id.
 * @param {string} priceId Price id.
 * @param {Object} [extra] Extra fields (metadata, status).
 * @returns {Object} Subscription object.
 */
const subscription = (id, priceId, extra) => ({
  id,
  customer: "cus_p",
  status: "active",
  items: {
    data: [
      {
        price: { id: priceId, recurring: { interval: "year", interval_count: 1 } },
        current_period_end: T + 365 * DAY
      }
    ]
  },
  ...(extra || {})
});

test("the table is a gate only where the operator filled it in", () => {
  assert.equal(stripePriceTableConfigured({}), false, "how the repository ships");
  assert.equal(stripePriceTableConfigured({ STRIPE_PRICE_PRO_MONTHLY: "   " }), false, "blank is not filled in");
  assert.equal(stripePriceTableConfigured({ STRIPE_PRICE_PRO_YEARLY: "price_y" }), true, "one is enough");

  const env = { STRIPE_PRICE_PRO_MONTHLY: "price_m" };
  assert.equal(priceVerdict("price_m", env), "ours");
  assert.equal(priceVerdict("price_donation", env), "unlisted");
  assert.equal(priceVerdict("", env), "no_table", "no price id is nothing to check");
  assert.equal(priceVerdict("price_donation", {}), "no_table", "and no table is nothing to check against");
});

test("a subscription on a price that is not ours does not entitle, and its renewals do not either", async () => {
  const env = listedEnv();
  await deliver(env, "e1", "checkout.session.completed", 0, checkout("cs_don", "sub_don"));
  await deliver(env, "e2", "customer.subscription.created", 0, subscription("sub_don", "price_donation_1usd"));
  assert.notEqual(await claimStatus(env, "cs_don", 10), 200, "a dollar donation is not Pro");

  // A paid invoice would otherwise lift the suspension straight back off, and
  // `paid` is one-way, so it must not be recorded for a price we do not sell.
  await deliver(env, "e3", "invoice.paid", 1, {
    id: "in_don",
    customer: "cus_p",
    subscription: "sub_don",
    payment_intent: "pi_don",
    lines: { data: [{ period: { start: T, end: T + 365 * DAY }, price: "price_donation_1usd" }] }
  });
  assert.notEqual(await claimStatus(env, "cs_don", 20), 200, "nor after it renews");
});

test("naming the plan in the subscription's metadata is the way back that needs no deploy", async () => {
  const env = listedEnv();
  await deliver(env, "e1", "checkout.session.completed", 0, checkout("cs_meta", "sub_meta"));
  await deliver(env, "e2", "customer.subscription.created", 0, subscription("sub_meta", "price_new_m"));
  assert.notEqual(await claimStatus(env, "cs_meta", 1), 200, "a price the table has not heard of");

  // The operator edits the subscription in the Stripe dashboard, which emits
  // customer.subscription.updated.
  await deliver(
    env,
    "e3",
    "customer.subscription.updated",
    1,
    subscription("sub_meta", "price_new_m", { metadata: { plan: "pro_yearly" } })
  );
  assert.equal(await claimStatus(env, "cs_meta", 2), 200, "and it entitles at once");
});

test("adding the price id and redeploying puts the next event right", async () => {
  const env = listedEnv();
  await deliver(env, "e1", "checkout.session.completed", 0, checkout("cs_fix", "sub_fix"));
  await deliver(env, "e2", "customer.subscription.created", 0, subscription("sub_fix", "price_forgotten_y"));
  assert.notEqual(await claimStatus(env, "cs_fix", 1), 200);

  // The operator adds the id to wrangler.toml and redeploys. Same KV, same
  // licence, new binding — which is what a redeploy is.
  const fixed = { ...env, STRIPE_PRICE_PRO_YEARLY: "price_forgotten_y" };
  await deliver(fixed, "e3", "customer.subscription.updated", 2, subscription("sub_fix", "price_forgotten_y"));
  assert.equal(await claimStatus(fixed, "cs_fix", 3), 200, "the next subscription event entitles it");
});

test("a worker with no price table behaves exactly as it did before", async () => {
  // This is how the repository ships, so this test is the promise that the
  // gate above changes nothing until somebody sells something.
  const env = createTestEnv({ ENTITLEMENTS: createFakeKv() });
  await deliver(env, "e1", "checkout.session.completed", 0, checkout("cs_open", "sub_open"));
  await deliver(env, "e2", "customer.subscription.created", 0, subscription("sub_open", "price_whatever"));
  assert.equal(await claimStatus(env, "cs_open", 10), 200);
});

test("a subscription on a price that IS ours still entitles", async () => {
  const env = listedEnv();
  await deliver(env, "e1", "checkout.session.completed", 0, checkout("cs_ok", "sub_ok"));
  await deliver(env, "e2", "customer.subscription.created", 0, subscription("sub_ok", "price_mine_y"));
  assert.equal(await claimStatus(env, "cs_ok", 10), 200);
  assert.notEqual(await claimStatus(env, "cs_ok", 400), 200, "and still ends when the year does");
});

test(
  "a payment far below the price does not buy Pro",
  { todo: "QA-W-03's other half: the smallest acceptable amount is the operator's to name (docs/33)" },
  async () => {
    // Mercado Pago reports the amount on the payment itself, so this is where a
    // floor would go. Until there is a number, an approved payment of one sol
    // entitles, and this test says so out loud rather than leaving the gap
    // silent. The price table above closes the Stripe half.
    const env = createTestEnv({ ENTITLEMENTS: createFakeKv() });
    const payment = {
      id: 991,
      status: "approved",
      transaction_amount: 1,
      currency_id: "PEN",
      description: "Vocal Studio Pro anual",
      date_approved: new Date(T * 1000).toISOString()
    };
    const ts = String(Math.floor(Date.now() / 1000));
    const v1 = hmacHex(env.MP_WEBHOOK_SECRET, `id:991;request-id:r;ts:${ts};`);
    await handleRequest(
      new Request("https://w.test/v1/webhooks/mercadopago?data.id=991&type=payment", {
        method: "POST",
        body: JSON.stringify({ id: 1, type: "payment", action: "payment.updated", data: { id: "991" } }),
        headers: { "x-signature": `ts=${ts},v1=${v1}`, "x-request-id": "r", "content-type": "application/json" }
      }),
      env,
      { fetchImpl: async () => ({ ok: true, status: 200, async json() { return payment; } }) }
    );
    const real = Date.now;
    Date.now = () => (T + 5 * DAY) * 1000;
    let status;
    try {
      status = (
        await handleRequest(
          new Request("https://w.test/v1/claim", {
            method: "POST",
            body: JSON.stringify({ provider: "mercadopago", sessionId: "991" }),
            headers: { "content-type": "application/json" }
          }),
          env
        )
      ).status;
    } finally {
      Date.now = real;
    }
    assert.notEqual(status, 200, "one sol is not a year of Pro");
  }
);
