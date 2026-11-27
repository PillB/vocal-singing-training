// A handover GET is a snapshot, not permission to erase practice saved while its response is in flight.
// Real account/storage/sync modules and worker routes; only transport completion is held by sync-env.
import test from "node:test";
import assert from "node:assert/strict";
import { createWorker, createBrowser, takes } from "./sync-env.mjs";

async function handover() {
  const worker = createWorker();
  const remote = await worker.signIn("bruno@example.test");
  await worker.writeProgress(remote.token, {
    v: 1, profileId: "default",
    progress: { "ex-9": { completedCount: 1, history: [{ id: "b-own", at: "2026-11-10T10:00:00.000Z", notes: "B-own", score: 5 }], lastScore: 5, lastAt: "2026-11-10T10:00:00.000Z" } }
  });
  const store = new Map();
  const a = createBrowser(worker, { store, storageEvents: true });
  const b = createBrowser(worker, { store, storageEvents: true });
  await a.signIn("ana@example.test");
  await a.fire([0]);
  a.take("A-own");
  assert.equal((await a.win.VTSync.syncNow()).ok, true, "control: Ana saved her own take");
  await a.win.VTAccount.signOut();
  await a.signIn("bruno@example.test");
  await a.fire([0]);
  await b.settle();
  assert.equal(a.win.VTSync.getStatus().otherOwner, true, "control: the ownership choice is pending");
  assert.equal(b.win.VTAccount.getSessionToken(), a.win.VTAccount.getSessionToken(), "control: both tabs now belong to Bruno");
  return { worker, a, b };
}

async function anaStillOwnsHerTake(worker) {
  // Signing out revoked the old token: verify with a fresh authenticated session, not a refused request.
  const ana = await worker.signIn("ana@example.test");
  assert.deepEqual(takes((await worker.progress(ana.token)).doc), ["A-own"], "Ana's account stays separate");
}

test("account handover preserves and syncs another tab's take saved while the account GET is pending", { timeout: 20000 }, async () => {
  const { worker, a, b } = await handover();
  const held = a.gate((e) => e.method === "GET" && e.path.startsWith("/v1/me/progress"));
  const choice = a.win.VTSync.useAccountOnly();
  try {
    await held.held;
    b.take("B-new-during-pull");
    assert.ok(takes(b.win.VTStorage.readSyncBag("default")).includes("B-new-during-pull"), "control: the new take was saved before the old response arrived");
  } finally {
    held.release();
  }
  assert.equal((await choice).ok, true);
  await a.settle();
  assert.deepEqual(takes(b.win.VTStorage.readSyncBag("default")), ["B-new-during-pull", "B-own"], "the old GET must not erase the new take");
  await a.fire([8000]);
  await b.fire([8000]);
  assert.deepEqual(takes((await worker.progress(a.win.VTAccount.getSessionToken())).doc), ["B-new-during-pull", "B-own"], "both of Bruno's takes reach his account");
  await anaStillOwnsHerTake(worker);
});

test("control: without concurrent work, account-only handover replaces the old local owner's practice", { timeout: 20000 }, async () => {
  const { worker, a, b } = await handover();
  assert.equal((await a.win.VTSync.useAccountOnly()).ok, true);
  await a.settle();
  assert.deepEqual(takes(b.win.VTStorage.readSyncBag("default")), ["B-own"]);
  await a.fire([8000]);
  await b.fire([8000]);
  assert.deepEqual(takes((await worker.progress(a.win.VTAccount.getSessionToken())).doc), ["B-own"], "Ana's previous local take is not added to Bruno's account");
  await anaStillOwnsHerTake(worker);
  b.take("B-after-choice");
  assert.equal((await b.win.VTSync.syncNow()).ok, true);
  assert.deepEqual(takes((await worker.progress(a.win.VTAccount.getSessionToken())).doc), ["B-after-choice", "B-own"], "control: normal new practice still syncs after the choice");
});
