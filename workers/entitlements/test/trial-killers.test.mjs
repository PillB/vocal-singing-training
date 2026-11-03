/**
 * Killers for the mutants that test/trial-arm.test.mjs (and the other worker test
 * files) let survive: M02 M03 M04 (arm derivation), M05 (days lookup), M15
 * (signing-key fallback), M19 (primary metric), M25 (?days= on the query string).
 * From an independent QA pass, adopted rather than rewritten.
 *
 * The golden vectors were re-derived here before adopting, with
 * `printf 'trial-arm:v1:trial_len_2026_11:%s' ID | openssl dgst -sha256 -hmac KEY -hex`,
 * and all twenty-two of them matched. The five mechanically reproducible mutants
 * above were then each applied to `src/` and each turned this file red.
 *
 * Why they survived: every assertion in trial-arm.test.mjs compares the worker with
 * the worker (`owed = trialPlanFor(...)`, `TRIAL_ARMS.find(...)`), so a function that
 * returns a *consistent* wrong answer passes. The expected values below are written
 * by hand: the arm vectors were computed with `openssl dgst -sha256 -hmac KEY` (see
 * trial-qa-kit.mjs), the days are the 7 and 14 of docs/38-AB-TESTING.md.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { TRIAL_ARMS, trialArmFor, trialPlanFor } from "../src/grants.js";
import { EXPERIMENT_PRESETS } from "../src/events.js";
import { call, DAY, FOURTEEN_IDS, freshEnv, KEY2, NOW, ON, seedAccount, SEVEN_IDS, SIGNKEY_GOLDEN, trialRows } from "./trial-qa-kit.mjs";

test("K1 golden arm vectors under the test key (kills: no domain prefix, other MAC bits, inverted mapping)", async () => {
  const env = await freshEnv(ON);
  for (const id of SEVEN_IDS) assert.equal((await trialArmFor(env, id)).id, "seven", id);
  for (const id of FOURTEEN_IDS) assert.equal((await trialArmFor(env, id)).id, "fourteen", id);
});

test("K1b golden arm vectors under a second key: only acct_fourteen1 flips, the others do not", async () => {
  const env = await freshEnv({ TRIAL_LEN_EXPERIMENT: "on", LICENSE_ID_KEY: KEY2 });
  assert.equal((await trialArmFor(env, "acct_fourteen1")).id, "fourteen"); // seven under the first key
  assert.equal((await trialArmFor(env, "acct_seven1")).id, "seven");
  assert.equal((await trialArmFor(env, "acc_0")).id, "fourteen");
  assert.equal((await trialArmFor(env, "acc_3")).id, "seven");
});

test("K2 days are 7 and 14, written by hand, end to end (kills: fourteen -> 13)", async () => {
  assert.deepEqual(TRIAL_ARMS, [{ id: "seven", days: 7 }, { id: "fourteen", days: 14 }]);
  const env = await freshEnv(ON);
  assert.deepEqual(await trialPlanFor(env, "acc_0"), { days: 14, arm: "fourteen" });
  assert.deepEqual(await trialPlanFor(env, "acc_3"), { days: 7, arm: "seven" });
  const token = await seedAccount(env, "acc_0");
  const r = await call("POST", "/v1/me/trial", { env, token });
  assert.equal(r.body.entitlement.periodEnd, NOW + 10 + 14 * DAY);
  assert.equal((await trialRows(env, "acc_0"))[0].ends_at - (await trialRows(env, "acc_0"))[0].starts_at, 1209600);
});

test("K3 the signing key is a valid secret when LICENSE_ID_KEY is unset (kills: fallback ignored)", async () => {
  const env = await freshEnv({ TRIAL_LEN_EXPERIMENT: "on", LICENSE_ID_KEY: "", LICENSE_PRIVATE_KEY_PKCS8_B64: "SIGNKEY" });
  for (const [id, arm] of Object.entries(SIGNKEY_GOLDEN)) {
    const got = await trialArmFor(env, id);
    assert.ok(got, `no arm for ${id}: the test went silently off`);
    assert.equal(got.id, arm, id);
  }
});

test("K4 ?days= on the query string cannot set the length (kills: query channel)", async () => {
  const env = await freshEnv(ON);
  const token = await seedAccount(env, "acc_3");
  const r = await call("POST", "/v1/me/trial?days=3650", { env, token });
  assert.equal(r.body.entitlement.periodEnd, NOW + 10 + 7 * DAY);
  assert.equal(r.body.trialArm, "seven");
});

test("K5 the registry says what docs/38 says: primary, guardrails, plan (kills: primary metric swapped)", () => {
  const p = EXPERIMENT_PRESETS.trial_len_2026_11;
  assert.deepEqual(p.primary, { event: "pro_paid_first", kind: "share", from: 0, to: 28 });
  assert.deepEqual(p.guardrails, [
    { event: "trial_started", kind: "share", from: 0, to: 7 },
    { event: "practice_day", kind: "days", from: 0, to: 28 }
  ]);
  assert.deepEqual(p.plan, { nPerArm: 432, minDays: 28, mde: 0.05 });
  assert.equal(p.control, "seven");
  assert.deepEqual(p.armEvents, { seven: [], fourteen: [] });
});
