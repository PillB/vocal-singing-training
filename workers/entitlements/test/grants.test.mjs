/**
 * Grants: the trial, gifted months, comps, revocation, and how all of that
 * resolves against a paid subscription.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { ensureAccount } from "../src/accounts.js";
import { ensureSchema, resetSchemaMemo } from "../src/db.js";
import {
  GIFT_CODE_ALPHABET,
  MAX_GRANT_DAYS,
  createGiftCode,
  createGrant,
  grantIsActive,
  linkLicense,
  listGrants,
  listLinkedLicenses,
  mintGiftCode,
  normalizeGiftCode,
  redeemGiftCode,
  resolveEntitlement,
  revokeGiftCode,
  revokeGrant,
  safePlan,
  startTrial,
  toPublicGrant,
  trialSeconds
} from "../src/grants.js";
import { putEntitlement } from "../src/store.js";
import { createAccountEnv, createEntitlement } from "./fixtures.mjs";

const DAY = 86400;

/**
 * Fresh env plus one account.
 * @param {number} [at] Creation time.
 * @returns {Promise<{env: Object, account: Object}>} Test context.
 */
async function withAccount(at) {
  resetSchemaMemo();
  const env = createAccountEnv();
  await ensureSchema(env.DB);
  const { account } = await ensureAccount(env.DB, "p@example.test", {}, at || 1000);
  return { env, account };
}

test("safePlan only lets through plans we actually sell", () => {
  assert.equal(safePlan("pro_yearly"), "pro_yearly");
  assert.equal(safePlan("pro_monthly"), "pro_monthly");
  assert.equal(safePlan("free"), "pro_monthly");
  assert.equal(safePlan("lifetime"), "pro_monthly");
  assert.equal(safePlan(undefined), "pro_monthly");
});

test("trialSeconds follows TRIAL_DAYS and stays sane", () => {
  // The default is 7 days as of 2026-09-24 (docs/35-PRICING.md): the only
  // randomised experiment on trial length favoured 7 over 30, and the owner
  // took it. An explicit TRIAL_DAYS still wins over the default.
  assert.equal(trialSeconds({ TRIAL_DAYS: "30" }), 30 * DAY);
  assert.equal(trialSeconds({ TRIAL_DAYS: "7" }), 7 * DAY);
  assert.equal(trialSeconds({}), 7 * DAY);
  assert.equal(trialSeconds({ TRIAL_DAYS: "0" }), 7 * DAY);
  assert.equal(trialSeconds({ TRIAL_DAYS: "-5" }), 7 * DAY);
  assert.equal(trialSeconds({ TRIAL_DAYS: "nonsense" }), 7 * DAY);
  assert.equal(trialSeconds({ TRIAL_DAYS: "999999" }), MAX_GRANT_DAYS * DAY);
});

test("gift codes avoid characters people misread", () => {
  for (const banned of ["O", "0", "I", "1", "U"]) {
    assert.equal(GIFT_CODE_ALPHABET.includes(banned), false, `alphabet contains ${banned}`);
  }
  for (let i = 0; i < 40; i += 1) {
    assert.match(mintGiftCode(), /^VOCAL-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  }
});

test("normalizeGiftCode survives however somebody retypes it", () => {
  assert.equal(normalizeGiftCode("VOCAL-AB2C-D3E4"), "VOCALAB2CD3E4");
  assert.equal(normalizeGiftCode("vocal ab2c d3e4"), "VOCALAB2CD3E4");
  assert.equal(normalizeGiftCode("  vocal_ab2c/d3e4 "), "VOCALAB2CD3E4");
  assert.equal(normalizeGiftCode("short"), "");
  assert.equal(normalizeGiftCode("x".repeat(40)), "");
  assert.equal(normalizeGiftCode(null), "");
});

test("a grant entitles only inside its window", () => {
  const row = { starts_at: 100, ends_at: 200, revoked_at: null };
  assert.equal(grantIsActive(row, 99), false);
  assert.equal(grantIsActive(row, 100), true);
  assert.equal(grantIsActive(row, 199), true);
  assert.equal(grantIsActive(row, 200), false);
  assert.equal(grantIsActive({ ...row, revoked_at: 150 }, 150), false);
});

test("createGrant clamps the length and dates from now", async () => {
  const { env, account } = await withAccount();
  const grant = await createGrant(env.DB, { accountId: account.id, kind: "gift", days: 30 }, 5000);
  assert.equal(grant.starts_at, 5000);
  assert.equal(grant.ends_at, 5000 + 30 * DAY);

  const huge = await createGrant(env.DB, { accountId: account.id, kind: "gift", days: 99999 }, 5000);
  assert.equal(huge.ends_at, 5000 + MAX_GRANT_DAYS * DAY);

  const zero = await createGrant(env.DB, { accountId: account.id, kind: "gift", days: 0 }, 5000);
  assert.equal(zero.ends_at, 5000 + DAY);
});

test("an unknown grant kind becomes a comp rather than being stored as-is", async () => {
  const { env, account } = await withAccount();
  const grant = await createGrant(env.DB, { accountId: account.id, kind: "freebie", days: 10 }, 5000);
  assert.equal(grant.kind, "comp");
});

test("the trial runs once per account, even after its grant is revoked", async () => {
  const { env, account } = await withAccount();
  const first = await startTrial(env.DB, account, env, 5000);
  assert.equal(first.ok, true);
  assert.equal(first.grant.ends_at - first.grant.starts_at, 30 * DAY);

  const fresh = await env.DB.prepare("SELECT * FROM accounts WHERE id = ?1").bind(account.id).first();
  assert.equal(Number(fresh.trial_used_at), 5000);
  assert.equal((await startTrial(env.DB, fresh, env, 5100)).reason, "trial_used");

  // Revoking the grant must not hand the account a second trial.
  await revokeGrant(env.DB, first.grant.id, "admin", 5200);
  const afterRevoke = await env.DB.prepare("SELECT * FROM accounts WHERE id = ?1").bind(account.id).first();
  assert.equal((await startTrial(env.DB, afterRevoke, env, 5300)).reason, "trial_used");
});

test("gifting is repeatable: each gift is one more row", async () => {
  const { env, account } = await withAccount();
  await createGrant(env.DB, { accountId: account.id, kind: "gift", days: 30, note: "round 1" }, 5000);
  await createGrant(env.DB, { accountId: account.id, kind: "gift", days: 30, note: "round 2" }, 6000);
  await createGrant(env.DB, { accountId: account.id, kind: "gift", days: 30, note: "round 3" }, 7000);
  const rows = await listGrants(env.DB, account.id, {});
  assert.equal(rows.length, 3);
});

test("revoking is one column, and idempotent", async () => {
  const { env, account } = await withAccount();
  const grant = await createGrant(env.DB, { accountId: account.id, kind: "gift", days: 30 }, 5000);

  const first = await revokeGrant(env.DB, grant.id, "admin-1", 5500);
  assert.equal(first.ok, true);
  assert.equal(first.grant.revoked_at, 5500);

  const second = await revokeGrant(env.DB, grant.id, "admin-2", 6000);
  assert.equal(second.ok, true);
  assert.equal(second.reason, "already_revoked");
  assert.equal(Number(second.grant.revoked_at), 5500, "revocation time must not move");

  assert.equal((await revokeGrant(env.DB, "grant_nope", "admin", 6000)).reason, "not_found");
});

test("a revoked grant stops entitling immediately", async () => {
  const { env, account } = await withAccount();
  const grant = await createGrant(env.DB, { accountId: account.id, kind: "gift", days: 30 }, 5000);
  assert.equal((await resolveEntitlement(env.DB, env.ENTITLEMENTS, account.id, 5100)).pro, true);
  await revokeGrant(env.DB, grant.id, "admin", 5200);
  const after = await resolveEntitlement(env.DB, env.ENTITLEMENTS, account.id, 5300);
  assert.equal(after.pro, false);
  assert.equal(after.plan, null);
});

test("listGrants hides revoked rows by default and shows them on request", async () => {
  const { env, account } = await withAccount();
  const kept = await createGrant(env.DB, { accountId: account.id, kind: "gift", days: 30 }, 5000);
  const gone = await createGrant(env.DB, { accountId: account.id, kind: "gift", days: 30 }, 5001);
  await revokeGrant(env.DB, gone.id, "admin", 5100);

  const visible = await listGrants(env.DB, account.id, {});
  assert.deepEqual(visible.map((r) => r.id), [kept.id]);
  const all = await listGrants(env.DB, account.id, { includeRevoked: true });
  assert.equal(all.length, 2);
});

test("toPublicGrant reports the right status for each phase", async () => {
  const { env, account } = await withAccount();
  const grant = await createGrant(env.DB, { accountId: account.id, kind: "gift", days: 30 }, 5000);
  assert.equal(toPublicGrant(grant, 5100).status, "active");
  assert.equal(toPublicGrant(grant, 5000 + 31 * DAY).status, "expired");
  assert.equal(toPublicGrant({ ...grant, starts_at: 9000, ends_at: 9000 + DAY }, 5000).status, "scheduled");
  assert.equal(toPublicGrant({ ...grant, revoked_at: 5050 }, 5100).status, "revoked");
});

test("a gift code redeems once per account and counts its uses", async () => {
  const { env, account } = await withAccount();
  const code = await createGiftCode(env.DB, { days: 30, maxRedemptions: 2, note: "F&F" }, 5000);

  const redeemed = await redeemGiftCode(env.DB, account.id, code.code, 5100);
  assert.equal(redeemed.ok, true);
  assert.equal(redeemed.days, 30);

  const again = await redeemGiftCode(env.DB, account.id, code.code, 5200);
  assert.equal(again.reason, "already_redeemed");

  // The rejected duplicate must not have burned a use or left a stray grant.
  const row = await env.DB.prepare("SELECT redeemed_count FROM gift_codes").first();
  assert.equal(Number(row.redeemed_count), 1);
  assert.equal((await listGrants(env.DB, account.id, {})).length, 1);
});

test("a second person can redeem a multi-use code until it is exhausted", async () => {
  const { env, account } = await withAccount();
  const other = (await ensureAccount(env.DB, "friend@example.test", {}, 1000)).account;
  const third = (await ensureAccount(env.DB, "third@example.test", {}, 1000)).account;
  const code = await createGiftCode(env.DB, { days: 30, maxRedemptions: 2 }, 5000);

  assert.equal((await redeemGiftCode(env.DB, account.id, code.code, 5100)).ok, true);
  assert.equal((await redeemGiftCode(env.DB, other.id, code.code, 5200)).ok, true);
  assert.equal((await redeemGiftCode(env.DB, third.id, code.code, 5300)).reason, "exhausted");
});

test("a revoked or expired gift code cannot be redeemed", async () => {
  const { env, account } = await withAccount();
  const revoked = await createGiftCode(env.DB, { days: 30 }, 5000);
  await revokeGiftCode(env.DB, revoked.code, 5100);
  assert.equal((await redeemGiftCode(env.DB, account.id, revoked.code, 5200)).reason, "revoked");

  const dated = await createGiftCode(env.DB, { days: 30, expiresAt: 6000 }, 5000);
  assert.equal((await redeemGiftCode(env.DB, account.id, dated.code, 6001)).reason, "expired");
  assert.equal((await redeemGiftCode(env.DB, account.id, "VOCAL-ZZZZ-ZZZZ", 5200)).reason, "not_found");
  assert.equal((await redeemGiftCode(env.DB, account.id, "nope", 5200)).reason, "bad_code");
});

test("revoking a code leaves months already given alone", async () => {
  const { env, account } = await withAccount();
  const code = await createGiftCode(env.DB, { days: 30 }, 5000);
  await redeemGiftCode(env.DB, account.id, code.code, 5100);
  await revokeGiftCode(env.DB, code.code, 5200);
  // Retiring a code is not the same act as taking somebody's month back.
  assert.equal((await resolveEntitlement(env.DB, env.ENTITLEMENTS, account.id, 5300)).pro, true);
});

test("revokeGiftCode is idempotent and reports unknown codes", async () => {
  const { env } = await withAccount();
  const code = await createGiftCode(env.DB, { days: 30 }, 5000);
  assert.equal((await revokeGiftCode(env.DB, code.code, 5100)).ok, true);
  assert.equal((await revokeGiftCode(env.DB, code.code, 5200)).reason, "already_revoked");
  assert.equal((await revokeGiftCode(env.DB, "VOCAL-ZZZZ-ZZZZ", 5200)).reason, "not_found");
  assert.equal((await revokeGiftCode(env.DB, "junk", 5200)).reason, "bad_code");
});

test("a paid license follows the account it is linked to", async () => {
  const { env, account } = await withAccount();
  const record = createEntitlement({ periodEnd: 9000 });
  await putEntitlement(env.ENTITLEMENTS, record);

  assert.equal((await resolveEntitlement(env.DB, env.ENTITLEMENTS, account.id, 5000)).pro, false);
  assert.equal((await linkLicense(env.DB, account.id, record.licenseId, "stripe", 5000)).ok, true);

  const resolved = await resolveEntitlement(env.DB, env.ENTITLEMENTS, account.id, 5000);
  assert.equal(resolved.pro, true);
  assert.equal(resolved.source, "paid");
  assert.equal(resolved.licenseId, record.licenseId);
  assert.deepEqual(await listLinkedLicenses(env.DB, account.id), [record.licenseId]);
});

test("a license already linked elsewhere is refused, not moved", async () => {
  const { env, account } = await withAccount();
  const other = (await ensureAccount(env.DB, "someone@example.test", {}, 1000)).account;
  const record = createEntitlement();
  await putEntitlement(env.ENTITLEMENTS, record);

  assert.equal((await linkLicense(env.DB, account.id, record.licenseId, "stripe", 5000)).ok, true);
  const stolen = await linkLicense(env.DB, other.id, record.licenseId, "stripe", 5100);
  assert.equal(stolen.ok, false);
  assert.equal(stolen.reason, "already_linked");

  const relink = await linkLicense(env.DB, account.id, record.licenseId, "stripe", 5200);
  assert.equal(relink.ok, true);
  assert.equal(relink.reason, "already_linked_here");
});

test("an expired paid license stops counting without any cleanup", async () => {
  const { env, account } = await withAccount();
  const record = createEntitlement({ periodEnd: 6000 });
  await putEntitlement(env.ENTITLEMENTS, record);
  await linkLicense(env.DB, account.id, record.licenseId, "stripe", 5000);

  assert.equal((await resolveEntitlement(env.DB, env.ENTITLEMENTS, account.id, 5900)).pro, true);
  assert.equal((await resolveEntitlement(env.DB, env.ENTITLEMENTS, account.id, 6001)).pro, false);
});

test("the longest access wins when a gift and a subscription overlap", async () => {
  const { env, account } = await withAccount();
  const record = createEntitlement({ periodEnd: 5000 + 10 * DAY, plan: "pro_monthly" });
  await putEntitlement(env.ENTITLEMENTS, record);
  await linkLicense(env.DB, account.id, record.licenseId, "stripe", 5000);

  const shortGift = await resolveEntitlement(env.DB, env.ENTITLEMENTS, account.id, 5001);
  assert.equal(shortGift.source, "paid");

  await createGrant(env.DB, { accountId: account.id, kind: "gift", plan: "pro_yearly", days: 60 }, 5000);
  const longGift = await resolveEntitlement(env.DB, env.ENTITLEMENTS, account.id, 5001);
  assert.equal(longGift.source, "gift");
  assert.equal(longGift.plan, "pro_yearly");
  assert.equal(longGift.periodEnd, 5000 + 60 * DAY);
});

test("an open-ended subscription outranks any dated grant", async () => {
  const { env, account } = await withAccount();
  const record = createEntitlement({ periodEnd: null });
  await putEntitlement(env.ENTITLEMENTS, record);
  await linkLicense(env.DB, account.id, record.licenseId, "stripe", 5000);
  await createGrant(env.DB, { accountId: account.id, kind: "gift", days: 3650 }, 5000);

  const resolved = await resolveEntitlement(env.DB, env.ENTITLEMENTS, account.id, 5001);
  assert.equal(resolved.source, "paid");
  assert.equal(resolved.periodEnd, null);
});

test("a canceled subscription keeps the period it paid for, and reads as canceled", async () => {
  const { env, account } = await withAccount();
  const record = createEntitlement({ status: "canceled", periodEnd: 5000 + 5 * DAY });
  await putEntitlement(env.ENTITLEMENTS, record);
  await linkLicense(env.DB, account.id, record.licenseId, "stripe", 5000);

  const during = await resolveEntitlement(env.DB, env.ENTITLEMENTS, account.id, 5001);
  assert.equal(during.pro, true);
  assert.equal(during.status, "canceled");

  const after = await resolveEntitlement(env.DB, env.ENTITLEMENTS, account.id, 5000 + 6 * DAY);
  assert.equal(after.pro, false);
});

test("a gift covers the gap while a subscription is past its period", async () => {
  const { env, account } = await withAccount();
  const record = createEntitlement({ status: "canceled", periodEnd: 5000 + DAY });
  await putEntitlement(env.ENTITLEMENTS, record);
  await linkLicense(env.DB, account.id, record.licenseId, "stripe", 5000);
  await createGrant(env.DB, { accountId: account.id, kind: "gift", days: 30 }, 5000);

  const after = await resolveEntitlement(env.DB, env.ENTITLEMENTS, account.id, 5000 + 2 * DAY);
  assert.equal(after.pro, true);
  assert.equal(after.source, "gift");
  assert.equal(after.status, "active");
});

test("resolveEntitlement reports every grant, including the dead ones", async () => {
  const { env, account } = await withAccount();
  const live = await createGrant(env.DB, { accountId: account.id, kind: "gift", days: 30 }, 5000);
  const dead = await createGrant(env.DB, { accountId: account.id, kind: "gift", days: 30 }, 5001);
  await revokeGrant(env.DB, dead.id, "admin", 5100);

  const resolved = await resolveEntitlement(env.DB, env.ENTITLEMENTS, account.id, 5200);
  assert.equal(resolved.grants.length, 2);
  const byId = Object.fromEntries(resolved.grants.map((g) => [g.id, g.status]));
  assert.equal(byId[live.id], "active");
  assert.equal(byId[dead.id], "revoked");
});

test("one account's grants never reach another account", async () => {
  const { env, account } = await withAccount();
  const other = (await ensureAccount(env.DB, "other@example.test", {}, 1000)).account;
  await createGrant(env.DB, { accountId: account.id, kind: "gift", days: 30 }, 5000);
  assert.equal((await resolveEntitlement(env.DB, env.ENTITLEMENTS, other.id, 5100)).pro, false);
});
