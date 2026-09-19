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
