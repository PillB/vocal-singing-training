/**
 * Two devices saving progress at the same moment.
 *
 * `putProgress` answers two questions when it stores a profile for the first
 * time: is this profile already there, and is the account already at its cap.
 * It used to ask both with a read and then act on the answer, which is a race
 * on both counts, and both halves were reproduced on a322c30 before the fix:
 *
 *   - RG1, two devices writing the same brand-new profile: both reads said "no
 *     row", both reached the INSERT, and the loser threw `UNIQUE constraint
 *     failed: progress.account_id, progress.profile_id`. The learner whose
 *     phone and laptop both woke up got a 500 where the documented answer is a
 *     409 with the winner's copy to merge against (api.js maps the `conflict`
 *     reason to 409).
 *   - RG2, an account one short of the cap opening two profiles at once: both
 *     passed the same COUNT and the account ended holding four profiles with a
 *     cap of three.
 *
 * The three controls (RS1, RS2, RC1) were green throughout, which is what says
 * these are races and not a broken cap.
 *
 * Method: `Promise.all` over the real functions against the fake D1, which is
 * an async adapter over a synchronous engine, so each `await` is a yield and
 * two overlapping callers interleave at exactly the points a Worker's isolate
 * would between D1 round trips. What it does not model is two isolates on
 * different machines; for that the guarantee rests on the fix being one SQL
 * statement, which D1's single writer executes atomically, rather than on
 * anything this file can run.
 *
 * Adopted from QA round 10 with its expectations unchanged. VG-57.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { ensureAccount } from "../src/accounts.js";
import { ensureSchema, resetSchemaMemo } from "../src/db.js";
import { MAX_PROFILES, listProgress, putProgress } from "../src/progress.js";
import { createAccountEnv } from "./fixtures.mjs";

async function withAccount() {
  resetSchemaMemo();
  const env = createAccountEnv();
  await ensureSchema(env.DB);
  const { account } = await ensureAccount(env.DB, "race@example.test", {}, 1000);
  return { env, account };
}
const settle = (p) => p.then((value) => ({ value }), (error) => ({ error: String(error && error.message || error) }));
const rows = async (env, account) => (await env.DB.prepare("SELECT profile_id FROM progress WHERE account_id = ?1").bind(account.id).all()).results.length;

test("RS1 (control) one after the other: first wins, second is a conflict that carries the winner's copy", async () => {
  const { env, account } = await withAccount();
  const a = await putProgress(env.DB, account.id, "default", { by: "phone" }, 0, 5000);
  const b = await putProgress(env.DB, account.id, "default", { by: "laptop" }, 0, 5001);
  assert.equal(a.ok, true);
  assert.equal(b.ok, false);
  assert.equal(b.reason, "conflict");
  assert.deepEqual(b.server.doc, { by: "phone" });
});

test("RS2 (control) one after the other: the cap holds", async () => {
  const { env, account } = await withAccount();
  for (let i = 0; i < MAX_PROFILES; i += 1) assert.equal((await putProgress(env.DB, account.id, `p${i}`, { i }, 0, 5000)).ok, true);
  assert.equal((await putProgress(env.DB, account.id, "extra", {}, 0, 5000)).reason, "profile_limit");
  assert.equal(await rows(env, account), MAX_PROFILES);
});

test("RC1 (control) two NEW profiles at once below the cap: both are stored", async () => {
  const { env, account } = await withAccount();
  const [a, b] = await Promise.all([putProgress(env.DB, account.id, "a", { a: 1 }, 0, 5000), putProgress(env.DB, account.id, "b", { b: 1 }, 0, 5000)].map(settle));
  assert.equal(a.value && a.value.ok, true, JSON.stringify(a));
  assert.equal(b.value && b.value.ok, true, JSON.stringify(b));
  assert.equal(await rows(env, account), 2);
});

test("RG1 two devices write the same brand-new profile at once: one wins, the other gets a conflict, nobody throws", async () => {
  const { env, account } = await withAccount();
  const [a, b] = await Promise.all([putProgress(env.DB, account.id, "default", { by: "phone" }, 0, 5000), putProgress(env.DB, account.id, "default", { by: "laptop" }, 0, 5000)].map(settle));
  assert.equal(a.error, undefined, `first caller threw: ${a.error}`);
  assert.equal(b.error, undefined, `second caller threw: ${b.error}`);
  const oks = [a, b].filter((r) => r.value.ok);
  const conflicts = [a, b].filter((r) => !r.value.ok && r.value.reason === "conflict");
  assert.equal(oks.length, 1, JSON.stringify([a, b]));
  assert.equal(conflicts.length, 1, JSON.stringify([a, b]));
  assert.ok(conflicts[0].value.server && conflicts[0].value.server.doc, "the loser must be handed the winner's copy to merge against");
});

test("RG2 an account with the cap minus one profile opens two new profiles at once: it never holds more than the cap", async () => {
  const { env, account } = await withAccount();
  for (let i = 0; i < MAX_PROFILES - 1; i += 1) await putProgress(env.DB, account.id, `p${i}`, { i }, 0, 5000);
  await Promise.all([putProgress(env.DB, account.id, "x", { x: 1 }, 0, 5001), putProgress(env.DB, account.id, "y", { y: 1 }, 0, 5001)].map(settle));
  assert.ok(await rows(env, account) <= MAX_PROFILES, `account holds ${await rows(env, account)} profiles, cap is ${MAX_PROFILES}`);
  const listed = await listProgress(env.DB, account.id);
  assert.ok(listed.length <= MAX_PROFILES, `listProgress shows ${listed.length}`);
});

// RG3 (in qa/mutate.mjs, set "splits") guards the update path the way RG1 guards the first write. Both devices
// read revision 1 before either writes, so the early revision check in
// `updateProgress` passes for both and only the `rev = ?5` guard on the UPDATE
// stands between them and a lost update: without it both writes report
// success at revision 2 and the phone's copy is silently overwritten. Run
// against a copy with that guard removed, this test fails on the second
// assertion; the sequential stale-write test in progress.test.mjs cannot see
// the loss because the early check catches it first.
//
// The reverse probe, removing the early check and keeping the guard, is an
// equivalent mutant: the guarded UPDATE then changes no row and the caller gets
// the same conflict with the same server copy, one round trip later. That
// early check is kept for the round trip it saves, not for correctness, so no
// test here claims to pin it.
test("RG3 two devices update the same profile from the same revision at once: one wins, the other gets the winner's copy", async () => {
  const { env, account } = await withAccount();
  assert.equal((await putProgress(env.DB, account.id, "default", { by: "start" }, 0, 5000)).ok, true);
  const [a, b] = await Promise.all([putProgress(env.DB, account.id, "default", { by: "phone" }, 1, 5001), putProgress(env.DB, account.id, "default", { by: "laptop" }, 1, 5001)].map(settle));
  assert.equal(a.error || b.error, undefined, JSON.stringify([a, b]));
  const oks = [a, b].filter((r) => r.value.ok);
  const conflicts = [a, b].filter((r) => !r.value.ok && r.value.reason === "conflict");
  assert.equal(oks.length, 1, `exactly one write may win: ${JSON.stringify([a, b])}`);
  assert.equal(conflicts.length, 1, JSON.stringify([a, b]));
  assert.equal(oks[0].value.rev, 2);
  const stored = await env.DB.prepare("SELECT rev, doc FROM progress WHERE account_id = ?1 AND profile_id = 'default'").bind(account.id).first();
  assert.equal(Number(stored.rev), 2);
  assert.deepEqual(conflicts[0].value.server.doc, JSON.parse(stored.doc), "the loser must be handed the copy that is actually stored");
});
