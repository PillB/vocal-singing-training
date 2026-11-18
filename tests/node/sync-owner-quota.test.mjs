// RES-6. On a shared browser whose origin is full (pillb.github.io is one
// origin for every project page of the account, so its quota is shared), the
// owner of this browser's practice could not be stored. "No owner" reads as
// "practice from before anyone signed in", which merges into whoever signs in
// next, so the next account was handed the last one's practice unasked.
// Wrong behaviour rejected: Bruno, signing in after Ana on the same page with
// storage full, gets Ana's takes in his account. Control: with room left he is
// asked, and the owner is on file.
import test from "node:test";
import assert from "node:assert/strict";
import { createWorker, createBrowser, takes } from "./sync-env.mjs";

const QUOTA = 40000;

/** Ana practises and syncs, signs out, and Bruno signs in, on one page; `full` fills the origin first. */
async function anaThenBruno(full) {
  const worker = createWorker();
  const store = new Map();
  const laptop = createBrowser(worker, { store, quota: QUOTA });
  laptop.win.VTStorage.getProfiles();
  if (full) {
    // Another project on the same origin has used up what is left.
    const used = [...store].reduce((n, [k, v]) => n + k.length + v.length, 0);
    store.set("other-project", "x".repeat(QUOTA - used - "other-project".length));
  }
  await laptop.signIn("ana@example.test");
  laptop.take("A-1");
  assert.equal((await laptop.win.VTSync.syncNow()).ok, true, "precondition: Ana's sync went through");
  const ownerStored = store.has("vt_sync_owner_v1");
  await laptop.win.VTAccount.signOut();
  await laptop.signIn("bruno@example.test");
  const bruno = laptop.win.VTAccount.getSessionToken();
  const res = await laptop.win.VTSync.syncNow();
  return { worker, laptop, bruno, res, ownerStored };
}

test("with storage full, the next account on this page is still asked before anything goes to it", async () => {
  const { worker, laptop, bruno, res, ownerStored } = await anaThenBruno(true);
  assert.equal(ownerStored, false, "precondition: storage refused to keep the owner");
  assert.deepEqual(takes((await worker.progress(bruno)).doc), [], "Bruno's account received nothing of Ana's");
  assert.equal(res.reason, "other_owner");
  assert.equal(laptop.win.VTSync.getStatus().otherOwner, true, "the panel asks Bruno");
});

test("control: with room left, the owner is on file and Bruno is asked", async () => {
  const { worker, laptop, bruno, res, ownerStored } = await anaThenBruno(false);
  assert.equal(ownerStored, true);
  assert.deepEqual(takes((await worker.progress(bruno)).doc), []);
  assert.equal(res.reason, "other_owner");
  assert.equal(laptop.win.VTSync.getStatus().otherOwner, true);
});

test("control: with storage full, Ana coming back on the same page is not asked about her own practice", async () => {
  const { laptop } = await anaThenBruno(true);
  await laptop.win.VTAccount.signOut();
  await laptop.signIn("ana@example.test");
  assert.equal(laptop.win.VTSync.getStatus().otherOwner, false);
  assert.equal((await laptop.win.VTSync.syncNow()).ok, true);
});
