/**
 * Killer tests for defects planted while `upsertEntitlement`, `getEntitlement`
 * and `noteReversal` were split under the complexity ceiling (chore(lint)).
 *
 * Each test here is one that the rest of the worker suite did not have: the
 * defect named in its title was planted in store.js, every other suite stayed
 * green, and this test turned red. Each was then checked green on the correct
 * code. Goal and wrong behaviour are stated per test; where an access outcome
 * cannot tell the two apart (the defect only costs a KV operation, or only
 * changes what the record reports), the test says so and asserts on what can.
 *
 * The defects are registered in qa/mutate.mjs (set "splits") as WS1 to WS6, in
 * the order of the tests below, so CI keeps proving these tests still kill them.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { getEntitlement, toPublicEntitlement, upsertEntitlement } from "../src/store.js";
import { isTokenIssuable } from "../src/license.js";
import { createFakeKv } from "./fixtures.mjs";

const NOW = 1770000000;
const DAY = 86400;

function idSequence(prefix) {
  let n = 0;
  return () => `${prefix}${++n}`;
}

/** A fake KV that also counts reads and writes per key prefix (the part before the first colon). */
function countingKv() {
  const kv = createFakeKv();
  const reads = {};
  const writes = {};
  const get = kv.get.bind(kv);
  const put = kv.put.bind(kv);
  kv.get = async (key) => {
    const prefix = String(key).split(":")[0];
    reads[prefix] = (reads[prefix] || 0) + 1;
    return get(key);
  };
  kv.put = async (key, value, options) => {
    const prefix = String(key).split(":")[0];
    writes[prefix] = (writes[prefix] || 0) + 1;
    return put(key, value, options);
  };
  return { kv, reads, writes };
}

// Planted defect: the stale path's floor rule without `update.paid === true`.
// Goal: an event that is out of date and confirms no payment cannot lengthen
// access, even when it names a later period as a floor. Stripe maps
// invoice.payment_failed with `periodEndIsFloor: true` and no `paid`, and every
// Creem subscription event is a floor, so the floor flag alone is not evidence
// that money arrived. Wrong behaviour: a renewal whose payment FAILED, delivered
// after a newer subscription snapshot, hands out the month nobody paid for.
// Positive control: the same invoice, PAID and just as late, does lengthen
// access (QA round 5's rule, which this must not undo).
test("an out-of-date renewal invoice lengthens access only when it was paid", async () => {
  const p1 = NOW + 30 * DAY;
  const p2 = NOW + 60 * DAY;
  const base = { provider: "stripe", claimId: null, subscriptionId: "sub_floor", customerId: "cus_floor", plan: "pro_monthly", planSource: "price_id" };
  const renewal = (paid) => ({
    ...base,
    status: paid ? "active" : "past_due",
    paid: paid ? true : undefined,
    paymentId: paid ? "pi_month2" : null,
    periodEnd: p2,
    periodEndIsFloor: true,
    occurredAt: p1
  });
  const run = async (paid) => {
    const kv = createFakeKv();
    const generateId = idSequence("lic_");
    // Month one, paid.
    await upsertEntitlement(kv, { ...base, status: "active", paid: true, paymentId: "pi_month1", periodEnd: p1, periodEndIsFloor: true, occurredAt: NOW }, { now: NOW, generateId });
    // A subscription snapshot serialised just before the period rolled over,
    // created a few seconds after the renewal attempt, processed first.
    await upsertEntitlement(kv, { ...base, status: "active", periodEnd: p1, occurredAt: p1 + 30 }, { now: p1 + 40, generateId });
    // Then the renewal invoice, older than the snapshot, so out of date.
    const late = await upsertEntitlement(kv, renewal(paid), { now: p1 + 60, generateId });
    assert.equal(late.stale, true, "precondition: the renewal really is processed as out of date");
    return getEntitlement(kv, late.record.licenseId);
  };

  const failed = await run(false);
  assert.equal(failed.periodEnd, p1, "a failed renewal must not buy month two");
  assert.equal(isTokenIssuable(failed, p1 + 5 * DAY), false, "no Pro on day 35 of a month-one subscriber whose renewal failed");

  const paid = await run(true);
  assert.equal(paid.periodEnd, p2, "control: a paid renewal, just as late, does buy month two");
  assert.equal(isTokenIssuable(paid, p1 + 5 * DAY), true);
});

// Planted defect: `ended:` written for any terminal update, not only one that
// was applied (`update.terminal && !stale` loosened to `update.terminal`).
// Goal: a deletion delivered again (a manual resend carries a new event id, so
// the idempotency marker cannot stop it; see resend-idempotent.test.mjs) costs
// no second write of the deletion's own key. KV writes are the free plan's
// tight ceiling, 1,000 a day (cost.test.mjs). Access cannot tell the two apart:
// the marker rewritten describes the same deletion. Wrong behaviour: every
// resent deletion spends one more KV write.
test("a deletion delivered again does not write its marker a second time", async () => {
  const { kv, writes } = countingKv();
  const generateId = idSequence("lic_");
  const base = { provider: "stripe", subscriptionId: "sub_twice", customerId: "cus_twice" };
  await upsertEntitlement(kv, { ...base, claimId: "cs_twice", status: "active", plan: "pro_monthly", planSource: "price_id", paid: true, periodEnd: NOW + 30 * DAY, periodEndIsFloor: true, occurredAt: NOW }, { now: NOW, generateId });
  const deletion = { ...base, status: "canceled", terminal: true, endedAt: NOW + 5 * DAY, periodEnd: NOW + 30 * DAY, occurredAt: NOW + 5 * DAY };
  const first = await upsertEntitlement(kv, deletion, { now: NOW + 5 * DAY, generateId });
  assert.equal(first.stale, false);
  assert.equal(writes.ended, 1, "control: the deletion itself writes its marker");

  const again = await upsertEntitlement(kv, { ...deletion }, { now: NOW + 6 * DAY, generateId });
  assert.equal(again.stale, true, "precondition: the second delivery is refused as already applied");
  assert.equal(writes.ended, 1, "the resent deletion must not write ended: again");
  assert.equal((await getEntitlement(kv, first.record.licenseId)).status, "canceled");
});

// Planted defect: `getEntitlement` reads `paid:` once per question instead of
// once per call (the memo around `readPaid` dropped).
// Goal: reading a deleted subscription that never paid asks the KV for its
// payment once, although two checks need it (is it still "unpaid"? does a
// payment restore the period the deletion ended?). Access is the same either
// way; the cost is a KV read on every claim poll and token request for that
// license. Wrong behaviour: two reads of the same key in one call.
test("reading a deleted, never-paid subscription reads its payment key once", async () => {
  const { kv, reads } = countingKv();
  const generateId = idSequence("lic_");
  const base = { provider: "stripe", subscriptionId: "sub_unpaid", customerId: "cus_unpaid" };
  // A delayed-payment checkout that never settled, then the subscription deleted.
  const opened = await upsertEntitlement(kv, { ...base, claimId: "cs_unpaid", status: "pending", plan: "pro_monthly", planSource: "price_id", paid: false, periodEnd: NOW + 30 * DAY, occurredAt: NOW }, { now: NOW, generateId });
  await upsertEntitlement(kv, { ...base, status: "canceled", terminal: true, endedAt: NOW + 60, periodEnd: NOW + 30 * DAY, occurredAt: NOW + 60 }, { now: NOW + 60, generateId });
  const stored = JSON.parse(kv.store.get(`lic:${opened.record.licenseId}`).value);
  assert.equal(stored.paid, false, "precondition: the record says unpaid, so the first check reads paid:");
  assert.ok(Number.isFinite(stored.periodEndIfPaid) && Number.isFinite(stored.endedAt),
    "precondition: the deletion left a period a payment could restore, so the second check needs paid: too");

  for (const key of Object.keys(reads)) delete reads[key];
  const read = await getEntitlement(kv, opened.record.licenseId);
  assert.equal(reads.paid, 1, "one read of paid: answers both questions");
  assert.equal(read.paid, false);
  assert.equal(isTokenIssuable(read, NOW + DAY), false, "control: nothing was paid, nothing is entitled");
});

// Planted defect: a new license's placeholder status counted as the status the
// subscription had before (`existing ? record.status : null` -> `record.status`).
// Goal: "never paid at all" is something the store has been told (`paid:
// false`, or a license already waiting for its money), not something it
// presumes of a license it has only just heard of. Creem's cancellation is not
// terminal and names the period still paid for; heard of first, before the
// purchase it ends, it keeps that period until something says the money did not
// arrive. Every webhook order through the router converges anyway once the
// purchase is processed (router.test.mjs, "pays and cancels at once"), so this
// is the store's contract with its mappers, asserted on the record the
// cancellation leaves. Wrong behaviour: the record's own "pending" default is
// read as "unpaid" and the paid-for month is cut to the moment of the click.
// Negative control: a license already waiting for its money is cut.
test("a cancellation heard of first does not presume the subscription was never paid", async () => {
  const periodEnd = NOW + 30 * DAY;
  const clicked = NOW + 60;
  const cancellation = {
    provider: "creem",
    claimId: null,
    subscriptionId: "sub_first",
    customerId: "cus_first",
    plan: "pro_monthly",
    planSource: "price_id",
    status: "canceled",
    paid: undefined,
    paymentId: null,
    periodEnd,
    periodEndIsFloor: true,
    endedAt: clicked,
    terminal: false,
    occurredAt: clicked
  };
  const fresh = await upsertEntitlement(createFakeKv(), cancellation, { now: clicked, generateId: idSequence("lic_") });
  assert.equal(fresh.created, true, "precondition: the cancellation is the first the store hears of this license");
  assert.equal(fresh.record.periodEnd, periodEnd, "nothing said it was unpaid, so the period it names stands");

  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  await upsertEntitlement(kv, { ...cancellation, status: "pending", endedAt: undefined, occurredAt: NOW }, { now: NOW, generateId });
  const waiting = await upsertEntitlement(kv, cancellation, { now: clicked, generateId });
  assert.equal(waiting.created, false);
  assert.equal(waiting.record.periodEnd, clicked, "control: a license known to be waiting for its money is cut when it is cancelled");
});

// Planted defect: a reversal of the payment that bought the period outranks the
// slot even when that same payment's reversal already holds it (the last
// clause of `namesPeriodPayment` dropped).
// Goal: of two reversals of the same charge, the earlier moment the money went
// back is the one the license keeps (`noteReversal`'s date rule), so the
// license goes on reporting that access ended at the refund, not at a dispute
// filed on the already-refunded charge a week later. Access is the same either
// way, because the later moment is already past when it is recorded; what
// differs is the period end the license reports (`toPublicEntitlement`) once
// anything re-extends it, here a checkout delivered again. Wrong behaviour: the
// dispute moves the reported end of access from day 2 to day 10.
test("a dispute of an already-refunded payment does not move when access ended", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  const checkout = { provider: "stripe", claimId: "cs_pass", paymentId: "pi_pass", customerId: "cus_pass", plan: "pro_yearly", planSource: "metadata", status: "active", paid: true, periodEndFromCharge: NOW, occurredAt: NOW };
  const bought = await upsertEntitlement(kv, checkout, { now: NOW, generateId });
  assert.equal(bought.record.periodPaymentId, "pi_pass", "precondition: the pass names the payment that bought it");
  // Refunded on day 2.
  await upsertEntitlement(kv, { provider: "stripe", paymentId: "pi_pass", reversedChargeAt: NOW, reversedAt: NOW + 2 * DAY, requireExisting: true, occurredAt: NOW + 2 * DAY }, { now: NOW + 2 * DAY, generateId });
  // The refunded charge disputed on day 10: a dispute names its payment but not
  // when the charge was taken, so it asks for the latest charge counted.
  await upsertEntitlement(kv, { provider: "stripe", paymentId: "pi_pass", reverseLatestCharge: true, reversedAt: NOW + 10 * DAY, requireExisting: true, occurredAt: NOW + 10 * DAY }, { now: NOW + 10 * DAY, generateId });
  // The checkout delivered again.
  const resent = await upsertEntitlement(kv, checkout, { now: NOW + 11 * DAY, generateId });
  assert.equal(resent.stale, true, "precondition: the resend is out of date");

  const read = await getEntitlement(kv, bought.record.licenseId);
  assert.equal(toPublicEntitlement(read).periodEnd, NOW + 2 * DAY, "access ended when the money first went back");
  assert.equal(isTokenIssuable(read, NOW + 11 * DAY), false, "control: and there is no Pro after it");
});

/** A view of a fake KV as it was at `snapshot`, for reads; writes go through (as in store.test.mjs). */
function staleView(kv, snapshot) {
  return {
    async get(key) {
      const entry = snapshot.get(key);
      return entry === undefined ? null : entry.value;
    },
    put: (key, value, options) => kv.put(key, value, options),
    delete: (key) => kv.delete(key)
  };
}

// Planted defect: a payment that restores the period a deletion ended is not
// written to the deletion's own key (`restored` dropped, so `ended:` keeps the
// period the deletion cut).
// Goal: the restored period is a one-way fact like the deletion itself, so it
// survives a concurrent write of an older copy of the record. Usually the
// payment's own key restores it again on read, which is why nothing else
// caught this; it cannot when that key holds a LATER payment, made after the
// deletion, which buys nothing ("A payment made after the deletion buys
// nothing") and which the earlier payment, processed after it, does not
// displace. Wrong behaviour: the race leaves the period the deletion cut, and
// the subscriber who had paid before the deletion loses the rest of the month.
test("a period restored after a deletion survives a concurrent write of an older copy", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  const periodEnd = NOW + 30 * DAY;
  const endedAt = NOW + 2 * DAY;
  const base = { provider: "stripe", subscriptionId: "sub_kept", customerId: "cus_kept", plan: "pro_monthly", planSource: "price_id" };
  // A subscription whose money had not been confirmed when it was deleted.
  const opened = await upsertEntitlement(kv, { ...base, claimId: "cs_kept", status: "pending", paid: false, periodEnd, occurredAt: NOW }, { now: NOW, generateId });
  const beforeDeletion = new Map(kv.store);
  await upsertEntitlement(kv, { ...base, status: "canceled", terminal: true, endedAt, periodEnd, occurredAt: endedAt }, { now: endedAt, generateId });
  // An open invoice paid the day after the deletion: it buys nothing, but it is
  // the latest payment, so the payment key keeps it.
  const after = await upsertEntitlement(kv, { ...base, status: "active", paid: true, paymentId: "pi_after", periodEnd, periodEndIsFloor: true, occurredAt: endedAt + DAY }, { now: endedAt + DAY, generateId });
  assert.equal(after.record.periodEnd, endedAt, "control: a payment made after the deletion restores nothing");
  // The payment made a minute after the purchase, delivered late.
  const restored = await upsertEntitlement(kv, { ...base, status: "active", paid: true, paymentId: "pi_before", periodEnd, periodEndIsFloor: true, occurredAt: NOW + 60 }, { now: endedAt + 2 * DAY, generateId });
  assert.equal(restored.record.periodEnd, periodEnd, "precondition: the payment made before the deletion restored the month");

  // An older subscription event, processed alongside all of that, read the
  // record before the deletion and wrote last.
  await upsertEntitlement(staleView(kv, beforeDeletion), { ...base, status: "active", periodEnd, occurredAt: NOW + 30 }, { now: endedAt + 2 * DAY, generateId });
  const written = JSON.parse(kv.store.get(`lic:${opened.record.licenseId}`).value);
  assert.equal(Number.isFinite(written.endedAt), false, "precondition: the record itself lost the deletion and the restore");

  const read = await getEntitlement(kv, opened.record.licenseId);
  assert.equal(read.status, "canceled", "the deletion still stands");
  assert.equal(read.periodEnd, periodEnd, "and so does the month the earlier payment restored");
  assert.equal(isTokenIssuable(read, endedAt + 3 * DAY), true);
});
