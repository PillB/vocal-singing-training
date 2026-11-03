/**
 * The trial-length test (`trial_len_2026_11`), which is the one experiment
 * whose treatment is money.
 *
 * Three properties are worth a test, and only the third is about statistics:
 *
 *   1. **The browser cannot choose how long a free trial is.** The length comes
 *      from the account id through a worker secret; a request asking for more
 *      days gets the same answer as a request asking for none.
 *   2. **What an account was given is recorded, not recomputed.** The arm is
 *      written on the grant row it produced, so rotating the secret or adding
 *      an arm cannot retroactively move an account into a column it was never
 *      in, and an account that trialled before the test was switched on reports
 *      no arm at all rather than the one a hash would give it now.
 *   3. **Off means exactly today's behaviour.** Every account gets `TRIAL_DAYS`
 *      and the row says `trial`, so turning the test on is the only thing that
 *      changes anything.
 *
 * The honest caveat, recorded here because this file is where somebody will
 * come looking: the only large randomised test of trial length (337,724 users,
 * six markets — docs/35-PRICING.md) found the 14-day arm **not significant**
 * against 30 days while 7 days won. So the prior on seven-versus-fourteen is
 * "no difference", and the 432 accounts per arm this test is sized for can see
 * nothing short of conversion doubling. The mechanism is built so the question
 * can be asked; docs/38-AB-TESTING.md says plainly when it is worth asking.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { ensureAccount } from "../src/accounts.js";
import { ensureSchema, resetSchemaMemo } from "../src/db.js";
import {
  TRIAL_ARMS,
  TRIAL_EXPERIMENT,
  listGrants,
  startTrial,
  trialArmFor,
  trialArmFromSource,
  trialExperimentOn,
  trialPlanFor,
  trialSourceFor
} from "../src/grants.js";
import { authMethods } from "../src/api.js";
import { handleRequest } from "../src/index.js";
import { createAccountEnv } from "./fixtures.mjs";

const DAY = 86400;
const NOW = 1762000000;
const BASE = "https://worker.test";

/** The experiment on, with the secret it needs. */
const ON = { TRIAL_LEN_EXPERIMENT: "on", LICENSE_ID_KEY: "trial-arm-test-key" };

/**
 * Fresh env plus one account.
 * @param {Object} [overrides] Env overrides.
 * @param {string} [email] Address, so several accounts can be made.
 * @returns {Promise<{env: Object, account: Object}>} Context.
 */
async function withAccount(overrides, email) {
  resetSchemaMemo();
  const env = createAccountEnv(overrides);
  await ensureSchema(env.DB);
  const { account } = await ensureAccount(env.DB, email || "p@example.test", {}, NOW);
  return { env, account };
}

/**
 * Call the worker.
 * @param {string} method HTTP method.
 * @param {string} path Path.
 * @param {Object} opts `{env, token, body, now}`.
 * @returns {Promise<{status: number, body: Object}>} Result.
 */
async function call(method, path, opts) {
  const headers = {
    ...(opts.body === undefined ? {} : { "content-type": "application/json" }),
    ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {})
  };
  const response = await handleRequest(
    new Request(`${BASE}${path}`, {
      method,
      headers,
      ...(opts.body === undefined ? {} : { body: JSON.stringify(opts.body) })
    }),
    opts.env,
    { now: opts.now }
  );
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return { status: response.status, body };
}

/**
 * Sign in by emailed code.
 * @param {Object} env Env bindings.
 * @param {string} email Address.
 * @returns {Promise<string>} Session token.
 */
async function signIn(env, email) {
  let code = null;
  const fetchImpl = async (url, init) => {
    const payload = JSON.parse(init.body);
    const match = /\b(\d{6})\b/.exec(payload.text || "");
    code = match && match[1];
    return { ok: true, status: 200 };
  };
  const started = await handleRequest(
    new Request(`${BASE}/v1/auth/email/start`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email })
    }),
    env,
    { now: NOW, fetchImpl }
  );
  assert.equal(started.status, 200);
  assert.ok(code, "a code should have been emailed");
  const verified = await call("POST", "/v1/auth/email/verify", {
    env,
    body: { email, code },
    now: NOW + 1
  });
  assert.equal(verified.status, 200, JSON.stringify(verified.body));
  return verified.body.sessionToken;
}

test("off is today's behaviour: TRIAL_DAYS for everybody, and no arm on the row", async () => {
  const { env, account } = await withAccount();
  assert.equal(trialExperimentOn(env), false);

  const plan = await trialPlanFor(env, account.id);
  // The fixture sets TRIAL_DAYS to 30 precisely so this cannot pass by
  // accidentally agreeing with DEFAULT_TRIAL_DAYS.
  assert.deepEqual(plan, { days: 30, arm: null });

  const started = await startTrial(env.DB, account, env, NOW);
  assert.equal(started.ok, true);
  assert.equal(started.days, 30);
  assert.equal(started.arm, null);
  const rows = await listGrants(env.DB, account.id, NOW);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].source, "trial");
  assert.equal(trialArmFromSource(rows[0].source), null);
});

test("the flag alone is not enough: with no secret the test stays off", async () => {
  // Without a key the arm could only be a plain hash of the account id, which
  // anybody can compute in advance — they would grind addresses until one
  // landed in the longer arm before signing up at all. Refusing to run is the
  // safe failure; quietly running a predictable test is not.
  const { env, account } = await withAccount({
    TRIAL_LEN_EXPERIMENT: "on",
    LICENSE_ID_KEY: "",
    LICENSE_PRIVATE_KEY_PKCS8_B64: ""
  });
  assert.equal(trialExperimentOn(env), false);
  assert.deepEqual(await trialPlanFor(env, account.id), { days: 30, arm: null });
  assert.equal(await trialArmFor(env, account.id), null);
});

test("on, an account gets one of the two arms and its length, and TRIAL_DAYS loses", async () => {
  const { env, account } = await withAccount(ON);
  assert.equal(trialExperimentOn(env), true);

  const plan = await trialPlanFor(env, account.id);
  assert.ok(plan.arm === "seven" || plan.arm === "fourteen", `unexpected arm ${plan.arm}`);
  const arm = TRIAL_ARMS.find((a) => a.id === plan.arm);
  assert.equal(plan.days, arm.days);
  // TRIAL_DAYS is 30 in the fixture, so this also pins which setting wins.
  assert.notEqual(plan.days, 30);

  const started = await startTrial(env.DB, account, env, NOW);
  assert.equal(started.days, arm.days);
  assert.equal(started.arm, plan.arm);
  const rows = await listGrants(env.DB, account.id, NOW);
  assert.equal(rows[0].source, `trial:arm:${plan.arm}`);
  assert.equal(rows[0].ends_at - rows[0].starts_at, arm.days * DAY);
});

test("the arm is the same every time it is asked, and both arms are used", async () => {
  const { env } = await withAccount(ON);
  const counts = { seven: 0, fourteen: 0 };
  for (let i = 0; i < 200; i += 1) {
    const id = `acc_${i}`;
    const first = await trialArmFor(env, id);
    const second = await trialArmFor(env, id);
    assert.equal(first.id, second.id, `arm for ${id} moved between calls`);
    counts[first.id] += 1;
  }
  // Not a fairness test — HMAC's output is not the thing under test — just that
  // neither arm is unreachable, which a broken modulo or a constant key would
  // make true while every other assertion here still passed.
  assert.ok(counts.seven > 50, `too few in seven: ${counts.seven}`);
  assert.ok(counts.fourteen > 50, `too few in fourteen: ${counts.fourteen}`);
});

test("the arm depends on the secret, so it cannot be worked out from the account id", async () => {
  const a = await withAccount({ TRIAL_LEN_EXPERIMENT: "on", LICENSE_ID_KEY: "key-one" });
  const b = await withAccount({ TRIAL_LEN_EXPERIMENT: "on", LICENSE_ID_KEY: "key-two" });
  let moved = 0;
  for (let i = 0; i < 60; i += 1) {
    const id = `acc_${i}`;
    const one = await trialArmFor(a.env, id);
    const two = await trialArmFor(b.env, id);
    if (one.id !== two.id) moved += 1;
  }
  // Two independent keys disagree about half the time. A hash that ignored the
  // key would disagree never, which is the mutant this catches.
  assert.ok(moved > 10, `two different keys gave the same arm ${60 - moved}/60 times`);
});

test("the arm is domain-separated from the licence-id derivation it shares a key with", async () => {
  // Both uses HMAC the same secret. The prefixes differ, so neither can be
  // used as an oracle for the other; this pins that the trial-arm input really
  // does carry its own prefix and the experiment key.
  const { env } = await withAccount(ON);
  const { deriveLicenseId, licenseIdSecret } = await import("../src/license.js");
  const { hmacSha256Hex } = await import("../src/db.js");
  const secret = licenseIdSecret(env);
  const asLicense = await deriveLicenseId(secret, "stripe", "acc_7");
  const asArm = await hmacSha256Hex(secret, `trial-arm:v1:${TRIAL_EXPERIMENT}:acc_7`);
  assert.notEqual(asArm.slice(0, 16), Buffer.from(asLicense, "base64url").toString("hex").slice(0, 16));
});

test("a mangled arm name on a row is not an arm", () => {
  assert.equal(trialArmFromSource("trial:arm:seven"), "seven");
  assert.equal(trialArmFromSource("trial:arm:fourteen"), "fourteen");
  // A row written by a future build, a truncated value, or anything else: no
  // arm, rather than a column in the results nobody can explain.
  assert.equal(trialArmFromSource("trial:arm:thirty"), null);
  assert.equal(trialArmFromSource("trial:arm:"), null);
  assert.equal(trialArmFromSource("trial"), null);
  assert.equal(trialArmFromSource("gift_code:VOCALAB2C"), null);
  assert.equal(trialArmFromSource(null), null);
  assert.equal(trialSourceFor(null), "trial");
  assert.equal(trialSourceFor("fourteen"), "trial:arm:fourteen");
});

test("asking the worker for a longer trial changes nothing", async () => {
  // The whole reason the arm is assigned here rather than in the browser. The
  // route reads no length at all, so the body is ignored whatever it says.
  //
  // Compared against this account's own arm rather than against a second
  // account: an account id is minted at random, so the same address in two
  // deployments is two different accounts and lands in two different arms.
  // That is worth knowing in its own right — an arm follows the account row,
  // not the person's address.
  const env = createAccountEnv(ON);
  resetSchemaMemo();
  const token = await signIn(env, "greedy@example.test");

  const greedy = await call("POST", "/v1/me/trial", {
    env,
    token,
    body: { days: 3650, trialDays: 3650, arm: "fourteen", plan: "pro_yearly" },
    now: NOW + 10
  });
  assert.equal(greedy.status, 200);
  const accountId = greedy.body.account.id;
  const owed = await trialPlanFor(env, accountId);
  assert.equal(greedy.body.entitlement.periodEnd, NOW + 10 + owed.days * DAY);
  assert.equal(greedy.body.trialArm, owed.arm);
  assert.equal(greedy.body.entitlement.plan, "pro_monthly");
  // The upper bound the arms allow, so a future arm cannot quietly make the
  // body's 3,650 days reachable by another route.
  assert.ok(greedy.body.entitlement.periodEnd - (NOW + 10) <= 14 * DAY);
});

test("/v1/me tells the page this account's own length and arm", async () => {
  const env = createAccountEnv(ON);
  resetSchemaMemo();
  const token = await signIn(env, "p@example.test");

  // Before the trial: the length the offer should name, and the arm it will be
  // recorded under. The page needs the arm here, because the offer names the
  // number of days and is therefore already the treatment.
  const before = await call("GET", "/v1/me", { env, token, now: NOW + 5 });
  assert.equal(before.status, 200);
  const arm = before.body.trialArm;
  assert.ok(arm === "seven" || arm === "fourteen", `unexpected arm ${arm}`);
  assert.equal(before.body.trialDays, TRIAL_ARMS.find((a) => a.id === arm).days);

  const started = await call("POST", "/v1/me/trial", { env, token, body: {}, now: NOW + 10 });
  assert.equal(started.body.trialArm, arm);
  assert.equal(started.body.trialDays, before.body.trialDays);
  assert.equal(started.body.entitlement.periodEnd, NOW + 10 + before.body.trialDays * DAY);
});

test("an account that trialled before the test was switched on reports no arm", async () => {
  // The case that would quietly ruin a result: its trial was the configured
  // length, and a recomputed arm would file it in the fourteen-day column half
  // the time. The row is the record, so it reports nothing.
  const env = createAccountEnv();
  resetSchemaMemo();
  const token = await signIn(env, "early@example.test");
  const started = await call("POST", "/v1/me/trial", { env, token, body: {}, now: NOW + 10 });
  assert.equal(started.body.trialArm, null);
  assert.equal(started.body.trialDays, 30);

  // Now the operator switches the test on. The length already given stands, and
  // it is still not in an arm.
  env.TRIAL_LEN_EXPERIMENT = "on";
  env.LICENSE_ID_KEY = ON.LICENSE_ID_KEY;
  const after = await call("GET", "/v1/me", { env, token, now: NOW + 20 });
  assert.equal(after.body.trialArm, null);
  assert.equal(after.body.trialDays, 30, "the trial it was actually given, not the arm's length");
});

test("the flag is read the way an operator would write it", () => {
  const env = (value) => ({ LICENSE_ID_KEY: "k", TRIAL_LEN_EXPERIMENT: value });
  for (const yes of ["on", "ON", "1", "true", "yes", " on "]) {
    assert.equal(trialExperimentOn(env(yes)), true, `${JSON.stringify(yes)} should mean on`);
  }
  for (const no of ["off", "0", "false", "no", "", undefined, null, "maybe"]) {
    assert.equal(trialExperimentOn(env(no)), false, `${JSON.stringify(no)} should mean off`);
  }
});

test("the length named before sign-in is one an arm actually gives", async () => {
  // `/v1/auth/methods` is the only public route that answers before a session
  // exists, so it is where the pricing panel reads the trial length. With the
  // test running, `TRIAL_DAYS` is ignored and the length follows the account —
  // which this route has none of — so reporting `TRIAL_DAYS` was reporting a
  // number no arm gives.
  const off = createAccountEnv({ TRIAL_DAYS: "30" });
  assert.equal(authMethods(off).trialDays, 30, "with the test off, the setting is the answer");

  const on = createAccountEnv({ TRIAL_DAYS: "30", TRIAL_LEN_EXPERIMENT: "on" });
  const named = authMethods(on).trialDays;
  assert.equal(
    TRIAL_ARMS.some((arm) => arm.days === named),
    true,
    `named ${named} days, which is not an arm`
  );
  assert.equal(named, Math.min(...TRIAL_ARMS.map((a) => a.days)), "the shortest, so nothing is over-promised");
  assert.notEqual(named, 30, "and not the setting the test overrides");

  // Without a key to assign with, the test cannot run, so the setting stands.
  const unkeyed = createAccountEnv({
    TRIAL_DAYS: "30",
    TRIAL_LEN_EXPERIMENT: "on",
    LICENSE_ID_KEY: "",
    LICENSE_PRIVATE_KEY_PKCS8_B64: ""
  });
  assert.equal(authMethods(unkeyed).trialDays, 30);
});
