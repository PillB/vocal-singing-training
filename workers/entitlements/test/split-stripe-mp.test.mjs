/**
 * Killers for the defects the existing suites let through, found while
 * splitting mapCheckoutSession, mapInvoice, mapStripeEvent (stripe.js) and
 * planForPreapproval (mercadopago.js) under the complexity ceiling.
 *
 * Each defect below was planted in the moved logic, the five suites that guard
 * these mappers (stripe, mercadopago, price-table, refunds, own-period-end)
 * and then the whole worker suite were run, and the defect survived. Each one
 * survived the same way against the code before the split, so these are gaps
 * that came with the code, not ones the split opened. Every test here was
 * checked red on its mutant and green without it.
 *
 *   WT1  planSource precedence swapped (metadata named as the source when the
 *        price decided)
 *   WT2  the second line item read instead of the first
 *   WT3  the line-item price never consulted
 *   WT4  the 2025+ `pricing.price_details` price shape ignored
 *   WT5  an invoice that names its subscription only on its line dropped
 *   WT6  a paid checkout whose event has no `created` bought Pro for ever
 *   WT7  a refund dated by when its webhook arrived instead of when it happened
 *   WT8  the operator's monthly Mercado Pago plan id mapped to a year
 *
 * The ids are the ones these defects carry in qa/mutate.mjs (set "splits"),
 * so CI keeps proving these tests still kill them.
 *
 * Expected values are written out (31-day month, the event's own timestamps),
 * never recomputed with the code under test.
 */
import assert from "node:assert/strict";
import test from "node:test";

import { mapStripeEvent } from "../src/stripe.js";
import { planForPreapproval } from "../src/mercadopago.js";
import { upsertEntitlement } from "../src/store.js";
import { createFakeKv } from "./fixtures.mjs";

const DAY = 86400;
/** The worker's monthly interval, written out rather than imported. */
const MONTH = 31 * DAY;
const NOW = 1770000000;
/** A price table as an operator who filled it in has it. */
const PRICED = { STRIPE_PRICE_PRO_MONTHLY: "price_m", STRIPE_PRICE_PRO_YEARLY: "price_y" };
/** The price table as the repository ships it: empty. */
const OPEN = { STRIPE_PRICE_PRO_MONTHLY: "", STRIPE_PRICE_PRO_YEARLY: "" };

/** A paid one-time checkout session, with overrides. */
const session = (extra) => ({
  id: "cs_split",
  mode: "payment",
  customer: "cus_split",
  payment_intent: "pi_split",
  payment_status: "paid",
  metadata: {},
  ...extra
});

/** Map one checkout.session.completed event. */
const checkout = (object, env, created = NOW) => mapStripeEvent(
  { id: "evt_cs", type: "checkout.session.completed", created, data: { object } },
  env
);

/** Map one invoice event of the 2025+ ("basil") shape, with one subscription line. */
const basilInvoice = (price, type = "invoice.paid") => mapStripeEvent({
  id: "evt_in",
  type,
  created: NOW,
  data: {
    object: {
      id: "in_basil",
      customer: "cus_basil",
      parent: { type: "subscription_details", subscription_details: { subscription: "sub_basil" } },
      lines: {
        data: [{
          id: "il_1",
          period: { start: NOW, end: NOW + 365 * DAY },
          pricing: { type: "price_details", price_details: { price, product: "prod_1" } },
          parent: {
            type: "subscription_item_details",
            subscription_item_details: { subscription: "sub_basil", proration: false }
          }
        }]
      }
    }
  }
}, PRICED);

test("WT2/WT3: a checkout that carries its line items is priced by the first one", () => {
  // Correct: the first line item's price is in the table as yearly, so this is a
  // year. Wrong (WT3, price never read): it falls through to the one-time
  // default and a yearly pass is recorded as a month. Wrong (WT2, second item
  // read): the monthly add-on decides.
  const mapped = checkout(session({
    line_items: { data: [{ price: { id: "price_y" } }, { price: { id: "price_m" } }] }
  }), PRICED);
  assert.equal(mapped.handled, true);
  assert.deepEqual([mapped.update.plan, mapped.update.planSource], ["pro_yearly", "price_id"]);

  // Control: a first line item whose price is not in the table names nothing,
  // and a one-time payment with nothing else to go by is a month.
  const unknown = checkout(session({ line_items: { data: [{ price: { id: "price_other" } }] } }), PRICED);
  assert.deepEqual([unknown.update.plan, unknown.update.planSource], ["pro_monthly", "default"]);
});

test("WT1: when a checkout's price and its metadata both name a plan, the price is recorded as the source", () => {
  // The price outranks metadata for the plan itself already; the source has to
  // say the same thing, or an operator reading the record is told the metadata
  // decided and goes to fix the wrong field.
  const both = checkout(session({
    line_items: { data: [{ price: { id: "price_y" } }] },
    metadata: { plan: "pro_monthly" }
  }), PRICED);
  assert.deepEqual([both.update.plan, both.update.planSource], ["pro_yearly", "price_id"]);

  // Control: with no line items the metadata is all there is, and says so.
  const metadataOnly = checkout(session({ metadata: { plan: "pro_monthly" } }), PRICED);
  assert.deepEqual([metadataOnly.update.plan, metadataOnly.update.planSource], ["pro_monthly", "metadata"]);
});

test("WT4: an invoice on the 2025+ API names its price under pricing.price_details, and the gate reads it there", () => {
  // Correct: the yearly price, read from the newer shape, names the plan.
  const ours = basilInvoice("price_y");
  assert.equal(ours.handled, true);
  assert.equal(ours.update.subscriptionId, "sub_basil");
  assert.deepEqual([ours.update.plan, ours.update.planSource], ["pro_yearly", "price_id"]);
  assert.deepEqual([ours.update.status, ours.update.paid], ["active", true]);

  // The case that costs money: with a price table filled in, a renewal of a
  // price that is not ours is suspended and never marked paid. Wrong (WT4): the
  // price is not found at all, so nothing is checked against the table and the
  // renewal lifts the suspension its subscription received.
  const notOurs = basilInvoice("price_someone_elses");
  assert.equal(notOurs.handled, true);
  assert.equal(notOurs.update.status, "suspended");
  assert.equal(notOurs.update.paid, undefined);
  assert.equal(notOurs.update.plan, undefined);
});

test("WT5: an invoice that names its subscription only on its line is still keyed on it", () => {
  // Pre-2025 line items carried `subscription` themselves. Wrong (WT5): the
  // invoice has no other identity, so the renewal is acknowledged and dropped
  // ("no_license_identity") and the paid period never reaches the license.
  const mapped = mapStripeEvent({
    id: "evt_line_sub",
    type: "invoice.paid",
    created: NOW,
    data: {
      object: {
        id: "in_line_sub",
        customer: "cus_line",
        lines: { data: [{ id: "il_ls", subscription: "sub_on_line", period: { end: NOW + MONTH } }] }
      }
    }
  }, OPEN);
  assert.equal(mapped.handled, true, mapped.reason);
  assert.equal(mapped.update.subscriptionId, "sub_on_line");
  assert.equal(mapped.update.periodEnd, NOW + MONTH);

  // Control: with no subscription anywhere and no payment to key on, nothing
  // can be found, which is the reason the mutant produced above.
  const nothing = mapStripeEvent({
    id: "evt_no_sub",
    type: "invoice.paid",
    created: NOW,
    data: { object: { id: "in_none", lines: { data: [{ id: "il_n", period: { end: NOW + MONTH } }] } } }
  }, OPEN);
  assert.deepEqual(nothing, { handled: false, reason: "no_license_identity" });
});

test("WT6: a paid checkout whose event carries no time counts its month from the session's own", async () => {
  // `periodEnd` null is for ever, so a paid checkout must always be bounded.
  // Correct: the session's own `created` stands in when the event has none.
  // Wrong (WT6): nothing stands in, and one month sold is Pro for life.
  const created = NOW - 100;
  const mapped = mapStripeEvent({
    id: "evt_untimed",
    type: "checkout.session.completed",
    data: { object: session({ id: "cs_untimed", payment_intent: "pi_untimed", created }) }
  }, OPEN);
  assert.equal(mapped.handled, true);
  assert.equal(mapped.update.occurredAt, null);
  assert.equal(mapped.update.periodEndFromCharge, created);

  const { record } = await upsertEntitlement(createFakeKv(), mapped.update, { now: NOW });
  assert.equal(record.periodEnd, created + MONTH, "one month from the payment, not open-ended");

  // Control: a timed event counts from the event, as it always did.
  const timed = checkout(session({ created }), OPEN, NOW);
  assert.equal(timed.update.periodEndFromCharge, NOW);
});

test("WT7: money going back is dated by its event, not by when the webhook arrived", async () => {
  const kv = createFakeKv();
  // A yearly pass bought on day 0.
  const bought = checkout(session({ id: "cs_late", payment_intent: "pi_late", metadata: { plan: "pro_yearly" } }), OPEN, NOW);
  const first = await upsertEntitlement(kv, bought.update, { now: NOW });
  assert.ok(first.record.periodEnd > NOW + 300 * DAY, "control: the pass bought a year");

  // Refunded in full on day 2; Stripe retries a failed delivery for days, so
  // the worker only hears of it on day 9.
  const refundedAt = NOW + 2 * DAY;
  const refund = mapStripeEvent({
    id: "evt_refund_late",
    type: "charge.refunded",
    created: refundedAt,
    data: {
      object: {
        id: "ch_late",
        created: NOW,
        customer: "cus_split",
        payment_intent: "pi_late",
        refunded: true,
        amount: 5000,
        amount_refunded: 5000
      }
    }
  }, OPEN);
  assert.equal(refund.handled, true);
  assert.equal(refund.update.reversedAt, refundedAt);

  // Correct: access ends on day 2, when the money left. Wrong (WT7): with no
  // `reversedAt` the store falls back to its own clock and the refunded pass
  // keeps a week of Pro it no longer paid for.
  const late = await upsertEntitlement(kv, refund.update, { now: NOW + 9 * DAY });
  assert.equal(late.missing, undefined, "the refund found the license by its payment");
  assert.equal(late.record.periodEnd, refundedAt);
});

test("WT8: the operator's monthly Mercado Pago plan id buys a month, whatever the label says", () => {
  const env = { MP_PLAN_PRO_MONTHLY: "2c93_m", MP_PLAN_PRO_YEARLY: "2c93_y" };
  // Correct: the configured id is the operator's own mapping and outranks a
  // label. Wrong (WT8): the monthly id maps to a year, and every monthly
  // subscriber is granted twelve months per charge.
  assert.deepEqual(
    planForPreapproval({ preapproval_plan_id: "2c93_m" }, env),
    { plan: "pro_monthly", planSource: "preapproval_plan_id" }
  );
  assert.deepEqual(
    planForPreapproval({ preapproval_plan_id: "2c93_m", reason: "Pro anual (promo)" }, env),
    { plan: "pro_monthly", planSource: "preapproval_plan_id" }
  );
  // Control: the yearly id is a year.
  assert.deepEqual(
    planForPreapproval({ preapproval_plan_id: "2c93_y", reason: "Pro mensual" }, env),
    { plan: "pro_yearly", planSource: "preapproval_plan_id" }
  );
});
