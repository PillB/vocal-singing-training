/**
 * Saved progress: revisions, conflicts and limits.
 */

import assert from "node:assert/strict";
import test from "node:test";

import { ensureAccount } from "../src/accounts.js";
import { ensureSchema, resetSchemaMemo } from "../src/db.js";
import {
  MAX_DOC_BYTES,
  MAX_PROFILES,
  deleteProgress,
  getProgress,
  isProfileIdShape,
  listProgress,
  putProgress
} from "../src/progress.js";
import { createAccountEnv } from "./fixtures.mjs";

/**
 * Fresh env plus one account.
 * @returns {Promise<{env: Object, account: Object}>} Test context.
 */
async function withAccount() {
  resetSchemaMemo();
  const env = createAccountEnv();
  await ensureSchema(env.DB);
  const { account } = await ensureAccount(env.DB, "p@example.test", {}, 1000);
  return { env, account };
}

test("profile ids are constrained", () => {
  assert.equal(isProfileIdShape("default"), true);
  assert.equal(isProfileIdShape("p_1a2b3c4d"), true);
  assert.equal(isProfileIdShape(""), false);
  assert.equal(isProfileIdShape("has space"), false);
  assert.equal(isProfileIdShape("../etc/passwd"), false);
  assert.equal(isProfileIdShape("x".repeat(41)), false);
  assert.equal(isProfileIdShape(null), false);
});

test("the first write starts at revision 1", async () => {
  const { env, account } = await withAccount();
  const result = await putProgress(env.DB, account.id, "default", { a: 1 }, 0, 5000);
  assert.equal(result.ok, true);
  assert.equal(result.rev, 1);

  const stored = await getProgress(env.DB, account.id, "default");
  assert.deepEqual(stored.doc, { a: 1 });
  assert.equal(stored.rev, 1);
  assert.equal(stored.updatedAt, 5000);
});

test("reading a profile that was never synced is not an error", async () => {
  const { env, account } = await withAccount();
  assert.equal(await getProgress(env.DB, account.id, "default"), null);
});

test("each accepted write moves the revision on by one", async () => {
  const { env, account } = await withAccount();
  assert.equal((await putProgress(env.DB, account.id, "default", { n: 1 }, 0, 5000)).rev, 1);
  assert.equal((await putProgress(env.DB, account.id, "default", { n: 2 }, 1, 5100)).rev, 2);
  assert.equal((await putProgress(env.DB, account.id, "default", { n: 3 }, 2, 5200)).rev, 3);
  assert.deepEqual((await getProgress(env.DB, account.id, "default")).doc, { n: 3 });
});

test("a stale write is refused and hands back the server's copy", async () => {
  const { env, account } = await withAccount();
  await putProgress(env.DB, account.id, "default", { device: "phone" }, 0, 5000);
  await putProgress(env.DB, account.id, "default", { device: "laptop" }, 1, 5100);

  // The phone still thinks it is at revision 1.
  const stale = await putProgress(env.DB, account.id, "default", { device: "phone again" }, 1, 5200);
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, "conflict");
  assert.equal(stale.server.rev, 2);
  assert.deepEqual(stale.server.doc, { device: "laptop" });

  // The laptop's evening is still there: nothing was overwritten.
  assert.deepEqual((await getProgress(env.DB, account.id, "default")).doc, { device: "laptop" });
});

test("claiming rev 0 against an existing row is a conflict, not an overwrite", async () => {
  const { env, account } = await withAccount();
  await putProgress(env.DB, account.id, "default", { keep: true }, 0, 5000);
  const clobber = await putProgress(env.DB, account.id, "default", { keep: false }, 0, 5100);
  assert.equal(clobber.reason, "conflict");
  assert.deepEqual((await getProgress(env.DB, account.id, "default")).doc, { keep: true });
});

test("writing rev n against an empty account reports an empty server state", async () => {
  const { env, account } = await withAccount();
  const result = await putProgress(env.DB, account.id, "default", { a: 1 }, 7, 5000);
  assert.equal(result.reason, "conflict");
  assert.deepEqual(result.server, { rev: 0, doc: null, updatedAt: 0 });
});

test("a document larger than the cap is refused", async () => {
  const { env, account } = await withAccount();
  const huge = { blob: "x".repeat(MAX_DOC_BYTES + 100) };
  const result = await putProgress(env.DB, account.id, "default", huge, 0, 5000);
  assert.equal(result.reason, "too_large");
  assert.equal(await getProgress(env.DB, account.id, "default"), null);
});

test("only an object is accepted as a document", async () => {
  const { env, account } = await withAccount();
  for (const bad of [null, undefined, "text", 42, true]) {
    assert.equal((await putProgress(env.DB, account.id, "default", bad, 0, 5000)).reason, "bad_document");
  }
});

test("a document that cannot be serialized is refused, not thrown", async () => {
  const { env, account } = await withAccount();
  const cyclic = {};
  cyclic.self = cyclic;
  assert.equal((await putProgress(env.DB, account.id, "default", cyclic, 0, 5000)).reason, "bad_document");
});

test("a bad profile id is refused before anything is stored", async () => {
  const { env, account } = await withAccount();
  assert.equal((await putProgress(env.DB, account.id, "bad id", { a: 1 }, 0, 5000)).reason, "bad_profile");
});

test("profiles are capped, and the cap counts only this account", async () => {
  const { env, account } = await withAccount();
  const other = (await ensureAccount(env.DB, "other@example.test", {}, 1000)).account;
  for (let i = 0; i < MAX_PROFILES; i += 1) {
    assert.equal((await putProgress(env.DB, account.id, `p${i}`, { i }, 0, 5000)).ok, true);
  }
  assert.equal((await putProgress(env.DB, account.id, "one-too-many", { i: 9 }, 0, 5000)).reason, "profile_limit");
  // Another account is unaffected by the first one filling its slots.
  assert.equal((await putProgress(env.DB, other.id, "p0", { i: 0 }, 0, 5000)).ok, true);
});

test("updating an existing profile at the cap still works", async () => {
  const { env, account } = await withAccount();
  for (let i = 0; i < MAX_PROFILES; i += 1) {
    await putProgress(env.DB, account.id, `p${i}`, { i }, 0, 5000);
  }
  assert.equal((await putProgress(env.DB, account.id, "p0", { i: 99 }, 1, 5100)).ok, true);
});

test("listProgress summarizes without shipping the documents", async () => {
  const { env, account } = await withAccount();
  await putProgress(env.DB, account.id, "default", { a: 1 }, 0, 5000);
  await putProgress(env.DB, account.id, "p_two", { b: 2 }, 0, 5100);

  const rows = await listProgress(env.DB, account.id);
  assert.equal(rows.length, 2);
  assert.deepEqual(Object.keys(rows[0]).sort(), ["profileId", "rev", "sizeBytes", "updatedAt"]);
  assert.equal(rows[0].profileId, "p_two", "newest first");
  assert.ok(rows[0].sizeBytes > 0);
});

test("deleting one profile leaves the others alone", async () => {
  const { env, account } = await withAccount();
  await putProgress(env.DB, account.id, "default", { a: 1 }, 0, 5000);
  await putProgress(env.DB, account.id, "p_two", { b: 2 }, 0, 5000);

  await deleteProgress(env.DB, account.id, "default");
  assert.equal(await getProgress(env.DB, account.id, "default"), null);
  assert.deepEqual((await getProgress(env.DB, account.id, "p_two")).doc, { b: 2 });
});

test("progress is scoped to its account", async () => {
  const { env, account } = await withAccount();
  const other = (await ensureAccount(env.DB, "other@example.test", {}, 1000)).account;
  await putProgress(env.DB, account.id, "default", { mine: true }, 0, 5000);
  assert.equal(await getProgress(env.DB, other.id, "default"), null);
});

test("a real-shaped practice bag round-trips intact", async () => {
  const { env, account } = await withAccount();
  const doc = {
    progress: {
      "v1-diction": {
        completedCount: 12,
        lastScore: 87,
        lastAt: "2026-09-20T18:00:00.000Z",
        history: Array.from({ length: 50 }, (_, i) => ({
          id: `e${i}`,
          at: "2026-09-20T18:00:00.000Z",
          metrics: { pitchAccuracy: 0.91, holdSeconds: 12.5 },
          score: 80 + (i % 20),
          notes: "buena resonancia",
          durationSec: 180
        }))
      }
    },
    weekPlan: { weekNumber: 4, element: "resonance", status: "active", checkIns: [1, 2, 3] },
    goals: { weeklySessionsTarget: 3 },
    achievements: { firstWin: true }
  };
  assert.equal((await putProgress(env.DB, account.id, "default", doc, 0, 5000)).ok, true);
  assert.deepEqual((await getProgress(env.DB, account.id, "default")).doc, doc);
});
