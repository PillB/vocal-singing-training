/**
 * Saved progress: revisions, conflicts and limits.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createContext, runInContext } from "node:vm";

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

/*
 * CXSS-1 (red team, Nov 2026), defence in depth. The worker stored any object,
 * so a session holder could store markup where the browser keeps numbers and
 * lists, and every device on the account pulled it back. The browser escapes
 * what it shows now; the worker also refuses a document whose structure is
 * wrong, with the reason the client already treats as a standing refusal
 * (bad_document, 400). Wrong behaviour rejected: such a document is stored.
 * Control: every document the current client builds (its own storage.js and
 * sync.js, run below) is still accepted, as is a document that leaves the
 * checked sections out.
 */
const MARKUP = '<meta http-equiv="refresh" content="0;url=https://evil.example/">';

/** A document the way the browser would send it, with one part replaced. */
function withPart(part) {
  return {
    v: 1,
    profileId: "default",
    progress: { "v1-diction": { completedCount: 2, history: [], lastScore: 4, lastAt: "2026-11-17T10:00:00.000Z" } },
    weekPlan: null,
    reviews: [],
    holdLogs: [{ at: "2026-11-17T10:00:00.000Z", seconds: 6.5 }],
    goals: null,
    achievements: {},
    days: null,
    loop: null,
    ...part
  };
}

const row = (fields) => ({ progress: { "s4-lip-trills": { completedCount: 1, history: [], lastScore: null, lastAt: null, ...fields } } });

const BAD_DOCUMENTS = [
  ["a list where the document belongs", []],
  ["markup as a session count", withPart(row({ completedCount: MARKUP }))],
  ["a session count written as text", withPart(row({ completedCount: "3" }))],
  ["a negative session count", withPart(row({ completedCount: -1 }))],
  ["an endless session count", withPart(row({ completedCount: Infinity }))],
  ["a null session count", withPart(row({ completedCount: null }))],
  ["a history that is not a list", withPart(row({ history: MARKUP }))],
  ["a null history", withPart(row({ history: null }))],
  ["an exercise row that is text", withPart({ progress: { "s4-lip-trills": MARKUP } })],
  ["progress that is a list", withPart({ progress: [] })],
  ["progress that is text", withPart({ progress: MARKUP })],
  ["reviews that are not a list", withPart({ reviews: { 0: MARKUP } })],
  ["null reviews", withPart({ reviews: null })],
  ["hold logs that are not a list", withPart({ holdLogs: MARKUP })],
  ["null hold logs", withPart({ holdLogs: null })],
  ["markup as a hold's seconds", withPart({ holdLogs: [{ at: "2026-11-17T10:00:00.000Z", seconds: MARKUP }] })],
  ["a hold entry that is text", withPart({ holdLogs: [MARKUP] })],
  ["a week plan that is text", withPart({ weekPlan: MARKUP })]
];

for (const [what, doc] of BAD_DOCUMENTS) {
  test(`IJ6 a document with ${what} is refused as bad_document and nothing is stored`, async () => {
    const { env, account } = await withAccount();
    const result = await putProgress(env.DB, account.id, "default", doc, 0, 5000);
    assert.deepEqual(result, { ok: false, reason: "bad_document" });
    assert.equal(await getProgress(env.DB, account.id, "default"), null);
  });
}

test("IJ6 control: the document the bad ones are built from, and one that leaves the checked sections out, are stored", async () => {
  const { env, account } = await withAccount();
  assert.equal((await putProgress(env.DB, account.id, "default", withPart({}), 0, 5000)).ok, true);
  assert.equal((await putProgress(env.DB, account.id, "p_two", { v: 1, profileId: "p_two" }, 0, 5000)).ok, true);
  // A row whose count and history are absent, a null row, and a hold with no seconds: nothing to refuse
  const sparse = withPart({ progress: { a: {}, b: null }, holdLogs: [{ at: "2026-11-17T10:00:00.000Z" }], weekPlan: { weekNumber: 2 } });
  assert.equal((await putProgress(env.DB, account.id, "p_three", sparse, 0, 5000)).ok, true);
});

/**
 * The browser's own code, run in Node: js/storage.js on a localStorage held in
 * a Map, and js/sync.js for its merge. What it builds is what a PUT carries.
 * @returns {{S: Object, mergeBag: Function}} The storage API and the merge.
 */
function browserCode() {
  const store = new Map();
  const win = {
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    crypto: globalThis.crypto,
    console
  };
  win.window = win;
  const context = createContext(win);
  for (const file of ["../../../js/storage.js", "../../../js/sync.js"]) {
    runInContext(readFileSync(new URL(file, import.meta.url), "utf8"), context);
  }
  return { S: win.VTStorage, mergeBag: win.VTSync.mergeBag };
}

/** One device's practice, written through the browser's storage API. */
function practise(S, n) {
  S.saveExerciseResult("v1-diction", { score: 4, metrics: { clarity: 4, pace: 3 }, notes: `take ${n}`, durationSec: 62 });
  // A take recorded without a rating, then rated: the same id updated in place
  const auto = S.saveExerciseResult("s4-lip-trills", { auto: true, durationSec: 30 });
  S.saveExerciseResult("s4-lip-trills", { replaceId: auto.id, score: 5, metrics: {}, durationSec: 30 });
  S.addHoldLog(6.5 + n);
  S.saveReview({ week: n, element: "Diction", verdict: "improved", notes: "más clara", at: new Date().toISOString() });
  S.setWeekPlan({ weekNumber: n + 1, status: "active", element: "Volume", startedAt: new Date().toISOString(), completedElements: ["Diction"], checkIns: [], reviews: [] });
  S.setGoals({ weeklySessionsTarget: 5 });
  S.setAchievementFlags({ firstWin: true });
  return JSON.parse(JSON.stringify(S.readSyncBag("default")));
}

test("IJ6 control: every document the current client builds is accepted, fresh, practised and merged", async () => {
  const { env, account } = await withAccount();
  const fresh = browserCode();
  const empty = JSON.parse(JSON.stringify(fresh.S.readSyncBag("default")));
  assert.deepEqual(empty.reviews, [], "control: the browser's code ran (a fresh bag holds empty lists)");
  assert.equal((await putProgress(env.DB, account.id, "default", empty, 0, 5000)).ok, true, "a fresh browser's bag");

  const phone = practise(browserCode().S, 1);
  const laptop = browserCode();
  const own = practise(laptop.S, 2);
  assert.equal(own.progress["v1-diction"].completedCount, 1, "control: the practice was saved");
  assert.equal((await putProgress(env.DB, account.id, "default", own, 1, 5100)).ok, true, "a practised bag");
  const merged = JSON.parse(JSON.stringify(laptop.mergeBag(own, phone)));
  assert.equal(merged.holdLogs.length, 2, "control: the merge holds both devices' holds");
  assert.equal((await putProgress(env.DB, account.id, "default", merged, 2, 5200)).ok, true, "two devices' bags merged");
  assert.deepEqual((await getProgress(env.DB, account.id, "default")).doc, merged);
});
