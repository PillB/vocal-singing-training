import test from "node:test";
import assert from "node:assert/strict";

import {
  CLAIM_TTL_SECONDS,
  clearEventSeen,
  EVENT_TTL_SECONDS,
  claimKey,
  deleteEntitlement,
  getEntitlement,
  getLicenseIdForClaim,
  getLicenseIdForSubscription,
  isStaleUpdate,
  licenseKey,
  markEventSeen,
  resolveExistingLicenseId,
  subscriptionKey,
  toPublicEntitlement,
  upsertEntitlement
} from "../src/store.js";
import { isAwaitingPayment, isTokenIssuable } from "../src/license.js";
import { createFakeKv } from "./fixtures.mjs";

const NOW = 1770000000;

/**
 * Deterministic id generator for assertions.
 * @param {string} prefix Prefix for the generated ids.
 * @returns {function(): string} Generator.
 */
function idSequence(prefix) {
  let n = 0;
  return () => {
    n += 1;
    return `${prefix}${n}`;
  };
}

/**
 * A view of a fake KV whose reads answer from an older snapshot, the way a
 * webhook processed at the same time as another (or at an edge location that
 * has not seen the latest write yet) reads the record. Writes go through.
 * @param {Object} kv Fake KV namespace.
 * @param {Map} snapshot Copy of `kv.store` taken earlier.
 * @returns {Object} KV-shaped view.
 */
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

test("an event is processed once and then recognised as a replay", async () => {
  const kv = createFakeKv();
  assert.equal(await markEventSeen(kv, "stripe", "evt_1"), true);
  assert.equal(await markEventSeen(kv, "stripe", "evt_1"), false);
  assert.equal(await markEventSeen(kv, "stripe", "evt_2"), true);
  // Same id from the other provider is a different event.
  assert.equal(await markEventSeen(kv, "mercadopago", "evt_1"), true);
  assert.equal(kv.ttlOf("event:stripe:evt_1"), EVENT_TTL_SECONDS);
  assert.equal(await markEventSeen(kv, "stripe", null), true, "an id-less event is never deduped");
});

test("clearing a marker lets a failed event be retried", async () => {
  const kv = createFakeKv();
  assert.equal(await markEventSeen(kv, "mercadopago", "evt_retry"), true);
  assert.equal(await markEventSeen(kv, "mercadopago", "evt_retry"), false);
  await clearEventSeen(kv, "mercadopago", "evt_retry");
  assert.equal(await markEventSeen(kv, "mercadopago", "evt_retry"), true);
  await clearEventSeen(kv, "mercadopago", null);
});

test("a first upsert mints a license and writes both indices", async () => {
  const kv = createFakeKv();
  const { record, created } = await upsertEntitlement(kv, {
    provider: "stripe",
    claimId: "cs_1",
    subscriptionId: "sub_1",
    customerId: "cus_1",
    plan: "pro_yearly",
    status: "active",
    periodEnd: NOW + 86400
  }, { now: NOW, generateId: idSequence("lic_") });

  assert.equal(created, true);
  assert.equal(record.licenseId, "lic_1");
  assert.equal(record.plan, "pro_yearly");
  assert.equal(record.status, "active");
  assert.equal(record.createdAt, NOW);
  assert.equal(record.updatedAt, NOW);
  assert.equal(await getLicenseIdForClaim(kv, "stripe", "cs_1"), "lic_1");
  assert.equal(await getLicenseIdForSubscription(kv, "stripe", "sub_1"), "lic_1");
  assert.equal(kv.ttlOf(claimKey("stripe", "cs_1")), CLAIM_TTL_SECONDS);
  assert.equal(kv.ttlOf(subscriptionKey("stripe", "sub_1")), null, "the sub index must not expire");
  assert.deepEqual(JSON.parse(kv.store.get(licenseKey("lic_1")).value), record);
});

test("replaying the same update is idempotent", async () => {
  const kv = createFakeKv();
  const update = {
    provider: "stripe",
    claimId: "cs_2",
    subscriptionId: "sub_2",
    plan: "pro_monthly",
    status: "active",
    periodEnd: NOW + 100
  };
  const first = await upsertEntitlement(kv, update, { now: NOW, generateId: idSequence("lic_") });
  const second = await upsertEntitlement(kv, update, { now: NOW + 5, generateId: idSequence("other_") });

  assert.equal(second.created, false);
  assert.equal(second.record.licenseId, first.record.licenseId);
  assert.equal(second.record.createdAt, NOW);
  assert.equal(second.record.updatedAt, NOW + 5);
  const licenses = [...kv.store.keys()].filter((key) => key.startsWith("lic:"));
  assert.equal(licenses.length, 1, "no second license may be minted");
});

test("later subscription events keep updating the same license", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  await upsertEntitlement(kv, {
    provider: "stripe",
    claimId: "cs_3",
    subscriptionId: "sub_3",
    plan: "pro_monthly",
    status: "active",
    periodEnd: NOW + 100
  }, { now: NOW, generateId });

  const renewed = await upsertEntitlement(kv, {
    provider: "stripe",
    claimId: null,
    subscriptionId: "sub_3",
    status: "active",
    periodEnd: NOW + 200
  }, { now: NOW + 10, generateId });
  assert.equal(renewed.record.licenseId, "lic_1");
  assert.equal(renewed.record.plan, "pro_monthly", "an update without a plan keeps the stored plan");
  assert.equal(renewed.record.periodEnd, NOW + 200);

  const canceled = await upsertEntitlement(kv, {
    provider: "stripe",
    subscriptionId: "sub_3",
    status: "canceled"
  }, { now: NOW + 20, generateId });
  assert.equal(canceled.record.licenseId, "lic_1");
  assert.equal(canceled.record.status, "canceled");
  assert.equal(canceled.record.periodEnd, NOW + 200, "an update without a period keeps the stored one");
  assert.equal([...kv.store.keys()].filter((key) => key.startsWith("lic:")).length, 1);
});

test("a webhook that arrives before the subscription id is known is later merged by claim id", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pre_1",
    subscriptionId: null,
    plan: "pro_monthly",
    status: "past_due"
  }, { now: NOW, generateId });

  const confirmed = await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pre_1",
    subscriptionId: "pre_1",
    status: "active",
    periodEnd: NOW + 3600
  }, { now: NOW + 1, generateId });

  assert.equal(confirmed.record.licenseId, "lic_1");
  assert.equal(confirmed.record.status, "active");
  assert.equal(await getLicenseIdForSubscription(kv, "mercadopago", "pre_1"), "lic_1");
});

test("the subscription index wins over the claim index", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  await upsertEntitlement(kv, { provider: "stripe", subscriptionId: "sub_a", status: "active" }, { now: NOW, generateId });
  await upsertEntitlement(kv, { provider: "stripe", claimId: "cs_b", status: "active" }, { now: NOW, generateId });
  const resolved = await resolveExistingLicenseId(kv, {
    provider: "stripe",
    subscriptionId: "sub_a",
    claimId: "cs_b"
  });
  assert.equal(resolved, "lic_1");
});

test("providers share no key space", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  await upsertEntitlement(kv, { provider: "stripe", claimId: "shared_id", status: "active" }, { now: NOW, generateId });
  const mp = await upsertEntitlement(kv, { provider: "mercadopago", claimId: "shared_id", status: "active" }, { now: NOW, generateId });
  assert.equal(mp.record.licenseId, "lic_2");
});

test("a deleted license reads back as missing", async () => {
  const kv = createFakeKv();
  const { record } = await upsertEntitlement(kv, {
    provider: "stripe",
    claimId: "cs_del",
    status: "active"
  }, { now: NOW, generateId: idSequence("lic_") });

  assert.deepEqual(await getEntitlement(kv, record.licenseId), record);
  await deleteEntitlement(kv, record.licenseId);
  assert.equal(await getEntitlement(kv, record.licenseId), null);
  assert.equal(await getEntitlement(kv, "nope"), null);
  assert.equal(await getEntitlement(kv, null), null);
  assert.equal(await getLicenseIdForClaim(kv, "stripe", null), null);
});

test("corrupt stored JSON reads back as missing rather than throwing", async () => {
  const kv = createFakeKv();
  await kv.put(licenseKey("lic_bad"), "{not json");
  assert.equal(await getEntitlement(kv, "lic_bad"), null);
});

test("a stale event cannot resurrect a deleted subscription", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  await upsertEntitlement(kv, {
    provider: "stripe",
    claimId: "cs_s",
    subscriptionId: "sub_s",
    plan: "pro_monthly",
    status: "active",
    periodEnd: NOW + 1000,
    occurredAt: NOW
  }, { now: NOW, generateId });

  const deleted = await upsertEntitlement(kv, {
    provider: "stripe",
    subscriptionId: "sub_s",
    status: "canceled",
    periodEnd: NOW + 20,
    occurredAt: NOW + 100
  }, { now: NOW + 100, generateId });
  assert.equal(deleted.record.status, "canceled");
  assert.equal(deleted.stale, false);

  // A late invoice.paid, emitted BEFORE the deletion but delivered after it.
  const late = await upsertEntitlement(kv, {
    provider: "stripe",
    subscriptionId: "sub_s",
    status: "active",
    plan: "pro_yearly",
    periodEnd: NOW + 99999,
    occurredAt: NOW + 50
  }, { now: NOW + 200, generateId });

  assert.equal(late.stale, true);
  assert.equal(late.record.status, "canceled", "a stale event must not reactivate");
  assert.equal(late.record.plan, "pro_monthly");
  assert.equal(late.record.periodEnd, NOW + 20);
  assert.equal(late.record.occurredAt, NOW + 100, "the newest event still owns the state");
  assert.equal(late.record.updatedAt, NOW + 100, "a refused update does not touch updatedAt");
  assert.deepEqual(await getEntitlement(kv, late.record.licenseId), late.record);
});

test("a stale event still records identity and indexes", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  await upsertEntitlement(kv, {
    provider: "stripe",
    subscriptionId: "sub_i",
    status: "canceled",
    occurredAt: NOW + 100
  }, { now: NOW, generateId });

  const late = await upsertEntitlement(kv, {
    provider: "stripe",
    claimId: "cs_i",
    subscriptionId: "sub_i",
    customerId: "cus_i",
    status: "active",
    occurredAt: NOW
  }, { now: NOW + 1, generateId });

  assert.equal(late.stale, true);
  assert.equal(late.record.status, "canceled");
  assert.equal(late.record.customerId, "cus_i", "identity is order-independent");
  assert.equal(await getLicenseIdForClaim(kv, "stripe", "cs_i"), "lic_1");
});

test("updates without timestamps are never treated as stale", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  await upsertEntitlement(kv, {
    provider: "stripe",
    subscriptionId: "sub_n",
    status: "canceled",
    occurredAt: NOW + 100
  }, { now: NOW, generateId });
  const undated = await upsertEntitlement(kv, {
    provider: "stripe",
    subscriptionId: "sub_n",
    status: "active"
  }, { now: NOW + 1, generateId });
  assert.equal(undated.stale, false);
  assert.equal(undated.record.status, "active");
  assert.equal(undated.record.occurredAt, NOW + 100, "an undated event cannot rewind the clock");

  assert.equal(isStaleUpdate({ occurredAt: 10 }, { occurredAt: 9 }), true);
  assert.equal(isStaleUpdate({ occurredAt: 10 }, { occurredAt: 10 }), false);
  assert.equal(isStaleUpdate({ occurredAt: null }, { occurredAt: 9 }), false);
  assert.equal(isStaleUpdate({ occurredAt: 10 }, {}), false);
});

test("two events from the same second: the one that ends access wins, in either order", () => {
  for (const ended of ["canceled", "suspended"]) {
    for (const live of ["active", "past_due"]) {
      assert.equal(
        isStaleUpdate({ occurredAt: 10, status: ended }, { occurredAt: 10, status: live }),
        true,
        `${live} after ${ended}`
      );
      assert.equal(
        isStaleUpdate({ occurredAt: 10, status: live }, { occurredAt: 10, status: ended }),
        false,
        `${ended} after ${live}`
      );
    }
  }
  // Nothing from the same second goes back to where a purchase starts.
  for (const settled of ["active", "past_due", "canceled", "suspended"]) {
    assert.equal(
      isStaleUpdate({ occurredAt: 10, status: settled }, { occurredAt: 10, status: "pending" }),
      true,
      `pending after ${settled}`
    );
  }
  assert.equal(isStaleUpdate({ occurredAt: 10, status: "pending" }, { occurredAt: 10, status: "pending" }), false);
  assert.equal(isStaleUpdate({ occurredAt: 10, status: "active" }, { occurredAt: 11, status: "pending" }), false);
  // Other same-second events still apply as they arrive: a checkout and its
  // subscription's first events often share a second.
  assert.equal(isStaleUpdate({ occurredAt: 10, status: "pending" }, { occurredAt: 10, status: "active" }), false);
  assert.equal(isStaleUpdate({ occurredAt: 10, status: "active" }, { occurredAt: 10, status: "past_due" }), false);
  assert.equal(isStaleUpdate({ occurredAt: 10, status: "canceled" }, { occurredAt: 10, status: "canceled" }), false);
  assert.equal(isStaleUpdate({ occurredAt: 10, status: "canceled" }, { occurredAt: 11, status: "active" }), false);
});

test("a deletion survives a concurrent write of an older copy of the record", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  await upsertEntitlement(kv, {
    provider: "stripe",
    claimId: "cs_race",
    subscriptionId: "sub_race",
    status: "active",
    periodEnd: NOW + 20 * 86400,
    occurredAt: NOW - 1000
  }, { now: NOW - 1000, generateId });

  // The deletion and an older invoice.paid are processed at once: the second
  // read the record before the deletion was written, and wrote last.
  const before = new Map(kv.store);
  await upsertEntitlement(kv, {
    provider: "stripe",
    subscriptionId: "sub_race",
    status: "canceled",
    periodEnd: NOW - 5,
    endedAt: NOW - 10,
    terminal: true,
    occurredAt: NOW - 10
  }, { now: NOW, generateId });
  await upsertEntitlement(staleView(kv, before), {
    provider: "stripe",
    subscriptionId: "sub_race",
    status: "active",
    periodEnd: NOW + 30 * 86400,
    occurredAt: NOW - 50
  }, { now: NOW, generateId });

  const written = JSON.parse(kv.store.get(licenseKey("lic_1")).value);
  assert.equal(written.status, "active", "the record itself lost the deletion");
  const read = await getEntitlement(kv, "lic_1");
  assert.equal(read.status, "canceled");
  assert.equal(read.periodEnd, NOW - 5);
  assert.equal(isTokenIssuable(read, NOW), false);

  // Further events are refused against the deletion, not the lost write.
  const next = await upsertEntitlement(kv, {
    provider: "stripe",
    subscriptionId: "sub_race",
    status: "active",
    periodEnd: NOW + 30 * 86400,
    occurredAt: NOW + 100
  }, { now: NOW + 100, generateId });
  assert.equal(next.stale, true);
  assert.equal(next.record.status, "canceled");
  assert.equal(isTokenIssuable(await getEntitlement(kv, "lic_1"), NOW + 100), false);
});

test("a deletion processed at the same moment as an older event still wins", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  await upsertEntitlement(kv, {
    provider: "stripe",
    claimId: "cs_both",
    subscriptionId: "sub_both",
    status: "active",
    plan: "pro_monthly",
    periodEnd: NOW + 20 * 86400,
    occurredAt: NOW - 1000
  }, { now: NOW, generateId });
  await Promise.all([
    upsertEntitlement(kv, {
      provider: "stripe",
      subscriptionId: "sub_both",
      status: "canceled",
      periodEnd: NOW - 5,
      endedAt: NOW - 10,
      terminal: true,
      occurredAt: NOW - 10
    }, { now: NOW, generateId }),
    upsertEntitlement(kv, {
      provider: "stripe",
      subscriptionId: "sub_both",
      status: "active",
      periodEnd: NOW + 30 * 86400,
      occurredAt: NOW - 50
    }, { now: NOW, generateId })
  ]);
  const read = await getEntitlement(kv, await getLicenseIdForSubscription(kv, "stripe", "sub_both"));
  assert.equal(read.status, "canceled");
  assert.equal(isTokenIssuable(read, NOW), false);
});

test("a charge without a subscription behind it entitles for exactly one interval", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  const monthly = await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pay_1",
    plan: "pro_monthly",
    status: "active",
    periodEndFromCharge: NOW,
    occurredAt: NOW
  }, { now: NOW, generateId });
  assert.equal(monthly.record.periodEnd, NOW + 2678400);

  const yearly = await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pay_2",
    plan: "pro_yearly",
    status: "active",
    periodEndFromCharge: NOW,
    occurredAt: NOW
  }, { now: NOW, generateId });
  assert.equal(yearly.record.periodEnd, NOW + 31536000);

  // A renewal charge extends the period; an older one never shortens it.
  const renewed = await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pay_1",
    status: "active",
    periodEndFromCharge: NOW + 2678400,
    occurredAt: NOW + 2678400
  }, { now: NOW + 2678400, generateId });
  assert.equal(renewed.record.licenseId, monthly.record.licenseId);
  assert.equal(renewed.record.periodEnd, NOW + 2678400 * 2);

  const shorter = await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pay_1",
    status: "active",
    periodEndFromCharge: NOW + 10,
    occurredAt: NOW + 2678401
  }, { now: NOW + 2678401, generateId });
  assert.equal(shorter.record.periodEnd, NOW + 2678400 * 2, "a charge never shortens the period");
});

test("money given back ends the period at once and never lengthens it", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pay_r",
    plan: "pro_yearly",
    status: "active",
    periodEndFromCharge: NOW,
    occurredAt: NOW
  }, { now: NOW, generateId });

  const refunded = await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pay_r",
    status: "canceled",
    endsAt: NOW + 100,
    occurredAt: NOW + 100
  }, { now: NOW + 100, generateId });
  assert.equal(refunded.record.status, "canceled");
  assert.equal(refunded.record.periodEnd, NOW + 100, "not the rest of the year");

  // An end later than the period already recorded does not lengthen it.
  const later = await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pay_r",
    status: "canceled",
    endsAt: NOW + 999999,
    occurredAt: NOW + 200
  }, { now: NOW + 200, generateId });
  assert.equal(later.record.periodEnd, NOW + 100);
});

test("a confirmed payment stays confirmed, whatever order the events arrive in", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  const unpaid = await upsertEntitlement(kv, {
    provider: "stripe",
    claimId: "cs_p",
    subscriptionId: "sub_p",
    status: "pending",
    paid: false,
    occurredAt: NOW
  }, { now: NOW, generateId });
  assert.equal(unpaid.record.paid, false);

  // The subscription turns active before the money arrives: still not paid.
  const active = await upsertEntitlement(kv, {
    provider: "stripe",
    subscriptionId: "sub_p",
    status: "active",
    periodEnd: NOW + 1000,
    occurredAt: NOW + 1
  }, { now: NOW + 1, generateId });
  assert.equal(active.record.status, "active");
  assert.equal(active.record.paid, false);
  assert.equal(isTokenIssuable(active.record, NOW + 2), false);

  const paid = await upsertEntitlement(kv, {
    provider: "stripe",
    subscriptionId: "sub_p",
    status: "active",
    paid: true,
    occurredAt: NOW + 2
  }, { now: NOW + 2, generateId });
  assert.equal(paid.record.paid, true);
  assert.equal(isTokenIssuable(paid.record, NOW + 3), true);

  // A late "unpaid" (the checkout, delivered last) cannot undo it.
  const late = await upsertEntitlement(kv, {
    provider: "stripe",
    claimId: "cs_p",
    status: "pending",
    paid: false,
    occurredAt: NOW
  }, { now: NOW + 3, generateId });
  assert.equal(late.record.paid, true);
  assert.equal(late.record.status, "active");

  // An "unpaid" that is itself out of order still counts while nothing has
  // been confirmed: the money had not arrived when it was sent.
  const other = createFakeKv();
  await upsertEntitlement(other, {
    provider: "stripe",
    subscriptionId: "sub_q",
    status: "active",
    occurredAt: NOW + 5
  }, { now: NOW, generateId });
  const reordered = await upsertEntitlement(other, {
    provider: "stripe",
    claimId: "cs_q",
    subscriptionId: "sub_q",
    status: "pending",
    paid: false,
    occurredAt: NOW + 4
  }, { now: NOW, generateId });
  assert.equal(reordered.stale, true);
  assert.equal(reordered.record.paid, false);
  assert.equal(isTokenIssuable(reordered.record, NOW + 6), false);
});

test("a confirmed payment survives a concurrent write of an older copy of the record", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  await upsertEntitlement(kv, {
    provider: "stripe",
    claimId: "cs_c",
    subscriptionId: "sub_c",
    status: "pending",
    paid: false,
    occurredAt: NOW
  }, { now: NOW, generateId });

  // The payment settles. The confirmation and the subscription's own update
  // are processed at once: the second read the record before the first wrote.
  const before = new Map(kv.store);
  await upsertEntitlement(kv, {
    provider: "stripe",
    subscriptionId: "sub_c",
    status: "active",
    paid: true,
    periodEnd: NOW + 1000,
    occurredAt: NOW + 10
  }, { now: NOW + 10, generateId });
  await upsertEntitlement(staleView(kv, before), {
    provider: "stripe",
    subscriptionId: "sub_c",
    status: "active",
    periodEnd: NOW + 1000,
    occurredAt: NOW + 10
  }, { now: NOW + 10, generateId });

  const written = JSON.parse(kv.store.get(licenseKey("lic_1")).value);
  assert.equal(written.paid, false, "the record itself lost the confirmation");
  const read = await getEntitlement(kv, "lic_1");
  assert.equal(read.paid, true, "the confirmation's own key restores it");
  assert.equal(isTokenIssuable(read, NOW + 20), true);
});

test("a failed payment holds the license down until money arrives", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  await upsertEntitlement(kv, {
    provider: "stripe",
    claimId: "cs_h",
    subscriptionId: "sub_h",
    status: "canceled",
    paid: false,
    paymentFailed: true,
    endedAt: NOW,
    occurredAt: NOW
  }, { now: NOW, generateId });

  // Whatever the subscription says next, in whatever order: neither entitled
  // nor waiting for a payment that failed.
  let at = NOW;
  for (const status of ["suspended", "active", "pending", "past_due", "active"]) {
    at += 10;
    const lifted = await upsertEntitlement(kv, {
      provider: "stripe",
      subscriptionId: "sub_h",
      status,
      periodEnd: NOW + 99999,
      occurredAt: at
    }, { now: at, generateId });
    assert.equal(lifted.stale, true, status);
    assert.equal(lifted.record.status, "canceled", status);
    assert.equal(lifted.record.periodEnd, NOW, status);
    assert.equal(isAwaitingPayment(lifted.record), false, status);
  }

  // The customer pays the open invoice after all.
  const paid = await upsertEntitlement(kv, {
    provider: "stripe",
    subscriptionId: "sub_h",
    status: "active",
    paid: true,
    periodEnd: NOW + 99999,
    occurredAt: NOW + 100
  }, { now: NOW + 100, generateId });
  assert.equal(paid.record.status, "active");
  assert.equal(paid.record.periodEnd, NOW + 99999);
  assert.equal(paid.record.paymentFailed, false);
  assert.equal(isTokenIssuable(paid.record, NOW + 101), true);
});

test("a failure delivered after a newer event still stops the license from waiting", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  await upsertEntitlement(kv, {
    provider: "stripe",
    claimId: "cs_f",
    subscriptionId: "sub_f",
    status: "pending",
    paid: false,
    occurredAt: NOW
  }, { now: NOW, generateId });
  await upsertEntitlement(kv, {
    provider: "stripe",
    subscriptionId: "sub_f",
    status: "active",
    periodEnd: NOW + 99999,
    occurredAt: NOW + 20
  }, { now: NOW + 20, generateId });
  const failed = await upsertEntitlement(kv, {
    provider: "stripe",
    claimId: "cs_f",
    status: "canceled",
    paid: false,
    paymentFailed: true,
    occurredAt: NOW + 10
  }, { now: NOW + 30, generateId });
  assert.equal(failed.stale, true, "older than the subscription's update");
  assert.equal(failed.record.paymentFailed, true, "the failure is kept all the same");
  assert.equal(isAwaitingPayment(failed.record), false);
  assert.equal(isTokenIssuable(failed.record, NOW + 30), false);
});

test("a cancellation ends a period that was never paid for when it took effect", async () => {
  for (const [before, capped] of [["past_due", true], ["suspended", true], ["pending", true], ["active", false]]) {
    const kv = createFakeKv();
    const generateId = idSequence("lic_");
    await upsertEntitlement(kv, {
      provider: "stripe",
      subscriptionId: "sub_e",
      status: before,
      periodEnd: NOW + 2000,
      occurredAt: NOW
    }, { now: NOW, generateId });
    const ended = await upsertEntitlement(kv, {
      provider: "stripe",
      subscriptionId: "sub_e",
      status: "canceled",
      periodEnd: NOW + 2000,
      endedAt: NOW + 100,
      occurredAt: NOW + 100
    }, { now: NOW + 100, generateId });
    assert.equal(ended.record.periodEnd, capped ? NOW + 100 : NOW + 2000, before);
  }
});

test("a refund ends the period its charge paid for, whatever order it arrives in", async () => {
  const YEAR = 31536000;
  for (const order of ["refund first", "cancellation first"]) {
    const kv = createFakeKv();
    const generateId = idSequence("lic_");
    await upsertEntitlement(kv, {
      provider: "mercadopago",
      claimId: "pre_y",
      subscriptionId: "pre_y",
      plan: "pro_yearly",
      status: "active",
      periodEnd: NOW + YEAR - 5 * 86400,
      occurredAt: NOW - 5 * 86400
    }, { now: NOW, generateId });
    const refund = {
      provider: "mercadopago",
      claimId: "pay_y",
      subscriptionId: "pre_y",
      reversedAt: NOW - 120,
      reversedChargeAt: NOW - 5 * 86400,
      occurredAt: null
    };
    const cancellation = {
      provider: "mercadopago",
      claimId: "pre_y",
      subscriptionId: "pre_y",
      status: "canceled",
      occurredAt: NOW - 60
    };
    for (const update of order === "refund first" ? [refund, cancellation] : [cancellation, refund]) {
      await upsertEntitlement(kv, update, { now: NOW, generateId });
    }
    const read = await getEntitlement(kv, "lic_1");
    assert.equal(read.status, "canceled", order);
    assert.equal(read.periodEnd, NOW - 120, `${order}: not the rest of the year`);
    assert.equal(isTokenIssuable(read, NOW), false, order);
  }

  // A one-off payment's refund delivered after a newer notification still
  // ends its interval.
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pay_once",
    plan: "pro_monthly",
    status: "active",
    periodEndFromCharge: NOW - 86400,
    occurredAt: NOW
  }, { now: NOW, generateId });
  const late = await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pay_once",
    status: "canceled",
    reversedAt: NOW - 100,
    reversedChargeAt: NOW - 86400,
    occurredAt: NOW - 100
  }, { now: NOW, generateId });
  assert.equal(late.stale, true);
  assert.equal(late.record.periodEnd, NOW - 100);
});

test("a refund keeps the period closed until a charge pays past it", async () => {
  const MONTH = 2678400;
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pre_m",
    subscriptionId: "pre_m",
    plan: "pro_monthly",
    status: "active",
    periodEnd: NOW + 20 * 86400,
    occurredAt: NOW - 10 * 86400
  }, { now: NOW, generateId });
  await upsertEntitlement(kv, {
    provider: "mercadopago",
    subscriptionId: "pre_m",
    reversedAt: NOW - 60,
    reversedChargeAt: NOW - 10 * 86400,
    occurredAt: null
  }, { now: NOW, generateId });

  // The subscription's next charge date comes round again: still closed.
  const again = await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pre_m",
    subscriptionId: "pre_m",
    status: "active",
    periodEnd: NOW + 20 * 86400,
    occurredAt: NOW
  }, { now: NOW, generateId });
  assert.equal(again.record.periodEnd, NOW - 60);
  assert.equal(isTokenIssuable(again.record, NOW), false);

  // The next charge goes through and pays for a period of its own.
  const charged = await upsertEntitlement(kv, {
    provider: "mercadopago",
    subscriptionId: "pre_m",
    status: "active",
    periodEndFromCharge: NOW + 20 * 86400,
    occurredAt: NOW + 20 * 86400
  }, { now: NOW + 20 * 86400, generateId });
  assert.equal(charged.record.periodEnd, NOW + 20 * 86400 + MONTH);
  assert.equal(isTokenIssuable(charged.record, NOW + 20 * 86400), true);
});

test("a refund of an earlier charge leaves a period a later charge paid for", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pre_o",
    subscriptionId: "pre_o",
    plan: "pro_monthly",
    status: "active",
    periodEnd: NOW + 21 * 86400,
    occurredAt: NOW - 10 * 86400
  }, { now: NOW, generateId });
  const refunded = await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pay_old",
    subscriptionId: "pre_o",
    reversedAt: NOW - 60,
    reversedChargeAt: NOW - 40 * 86400,
    occurredAt: null
  }, { now: NOW, generateId });
  assert.equal(refunded.record.status, "active");
  assert.equal(refunded.record.periodEnd, NOW + 21 * 86400);
  assert.equal(isTokenIssuable(refunded.record, NOW), true);

  // The refund of the charge that paid for this month does end it, and an
  // earlier refund noted after it does not undo that.
  await upsertEntitlement(kv, {
    provider: "mercadopago",
    subscriptionId: "pre_o",
    reversedAt: NOW - 30,
    reversedChargeAt: NOW - 10 * 86400,
    occurredAt: null
  }, { now: NOW, generateId });
  const earlier = await upsertEntitlement(kv, {
    provider: "mercadopago",
    subscriptionId: "pre_o",
    reversedAt: NOW - 20,
    reversedChargeAt: NOW - 70 * 86400,
    occurredAt: null
  }, { now: NOW, generateId });
  assert.equal(earlier.record.periodEnd, NOW - 30);
  assert.equal(earlier.record.reversedChargeAt, NOW - 10 * 86400);
});

test("a yearly charge's refund ends a period that runs a leap day past its interval", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pre_l",
    subscriptionId: "pre_l",
    plan: "pro_yearly",
    status: "active",
    periodEnd: NOW - 86400 + 366 * 86400,
    occurredAt: NOW - 86400
  }, { now: NOW, generateId });
  const refunded = await upsertEntitlement(kv, {
    provider: "mercadopago",
    subscriptionId: "pre_l",
    reversedAt: NOW - 60,
    reversedChargeAt: NOW - 86400,
    occurredAt: null
  }, { now: NOW, generateId });
  assert.equal(refunded.record.periodEnd, NOW - 60);
});

test("a refund that arrives before the subscription is counted on its plan once known", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  // The refund is the first thing heard of this license: no plan yet.
  await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pay_first",
    subscriptionId: "pre_first",
    reversedAt: NOW - 60,
    reversedChargeAt: NOW - 5 * 86400,
    occurredAt: null
  }, { now: NOW, generateId });
  // Then the yearly subscription itself, still authorized.
  const yearly = await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pre_first",
    subscriptionId: "pre_first",
    plan: "pro_yearly",
    status: "active",
    periodEnd: NOW + 360 * 86400,
    occurredAt: NOW - 5 * 86400
  }, { now: NOW, generateId });
  assert.equal(yearly.record.periodEnd, NOW - 60, "the refunded year stays closed");
  assert.equal(isTokenIssuable(yearly.record, NOW), false);
});

test("records stored before refunds were remembered keep their period", async () => {
  const kv = createFakeKv();
  await kv.put(licenseKey("lic_old"), JSON.stringify({
    licenseId: "lic_old",
    plan: "pro_monthly",
    status: "active",
    provider: "mercadopago",
    customerId: null,
    subscriptionId: "pre_old",
    periodEnd: NOW + 20 * 86400,
    occurredAt: NOW - 10 * 86400,
    createdAt: NOW - 10 * 86400,
    updatedAt: NOW - 10 * 86400
  }));
  await kv.put("sub:mercadopago:pre_old", "lic_old");
  const renewed = await upsertEntitlement(kv, {
    provider: "mercadopago",
    subscriptionId: "pre_old",
    status: "active",
    periodEnd: NOW + 21 * 86400,
    occurredAt: NOW
  }, { now: NOW });
  assert.equal(renewed.record.periodEnd, NOW + 21 * 86400);
  assert.equal(renewed.record.reversedChargeAt, undefined);
  assert.equal(isTokenIssuable(renewed.record, NOW), true);
  assert.equal(isAwaitingPayment(renewed.record), false);
});

test("a refund survives a concurrent write of an older copy of the record", async () => {
  const kv = createFakeKv();
  const generateId = idSequence("lic_");
  await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pre_rc",
    subscriptionId: "pre_rc",
    plan: "pro_monthly",
    status: "active",
    periodEnd: NOW + 20 * 86400,
    occurredAt: NOW - 10 * 86400
  }, { now: NOW, generateId });

  // The charge is refunded and the subscription cancelled together: the
  // cancellation read the record before the refund was written, and wrote last.
  const before = new Map(kv.store);
  await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pay_rc",
    subscriptionId: "pre_rc",
    reversedAt: NOW - 60,
    reversedChargeAt: NOW - 10 * 86400,
    occurredAt: null
  }, { now: NOW, generateId });
  await upsertEntitlement(staleView(kv, before), {
    provider: "mercadopago",
    claimId: "pre_rc",
    subscriptionId: "pre_rc",
    status: "canceled",
    occurredAt: NOW - 30
  }, { now: NOW, generateId });

  const written = JSON.parse(kv.store.get(licenseKey("lic_1")).value);
  assert.equal(written.reversedChargeAt, undefined, "the record itself lost the refund");
  assert.equal(written.periodEnd, NOW + 20 * 86400);
  const read = await getEntitlement(kv, "lic_1");
  assert.equal(read.status, "canceled");
  assert.equal(read.periodEnd, NOW - 60, "the refund's own key ends the period it paid for");
  assert.equal(isTokenIssuable(read, NOW), false);

  // The next notification writes the refund back into the record.
  const next = await upsertEntitlement(kv, {
    provider: "mercadopago",
    claimId: "pre_rc",
    subscriptionId: "pre_rc",
    status: "canceled",
    occurredAt: NOW
  }, { now: NOW, generateId });
  assert.equal(next.record.reversedChargeAt, NOW - 10 * 86400);
  assert.equal(next.record.periodEnd, NOW - 60);

  // A later charge that goes through still pays for a period of its own.
  const charged = await upsertEntitlement(kv, {
    provider: "mercadopago",
    subscriptionId: "pre_rc",
    status: "active",
    periodEndFromCharge: NOW + 20 * 86400,
    occurredAt: NOW + 20 * 86400
  }, { now: NOW + 20 * 86400, generateId });
  assert.equal(charged.record.periodEnd, NOW + 20 * 86400 + 2678400);
  assert.equal(isTokenIssuable(await getEntitlement(kv, "lic_1"), NOW + 20 * 86400), true);
});

test("the client view carries no provider-internal ids", () => {
  const view = toPublicEntitlement({
    licenseId: "lic_1",
    plan: "pro_monthly",
    status: "active",
    provider: "stripe",
    customerId: "cus_secret",
    subscriptionId: "sub_secret",
    periodEnd: NOW,
    createdAt: NOW,
    updatedAt: NOW
  });
  assert.deepEqual(view, {
    licenseId: "lic_1",
    plan: "pro_monthly",
    status: "active",
    provider: "stripe",
    periodEnd: NOW,
    updatedAt: NOW
  });
});
