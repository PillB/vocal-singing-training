// RES-1. A sync cycle reads and writes as the account it started for. On a
// shared browser one person signs out while their cycle's read is still out
// (Salir waits at most 3 s for it) and the next person signs in. Wrong
// behaviour rejected: the cycle carries on with whichever session is current
// when each request is sent, so the first account's practice is merged into
// the second account and written there, the second account's own copy is
// overwritten when the revisions happen to match, and the browser is recorded
// as the second account's, so nobody is ever asked.
// Controls: the same slow cycle with nobody switching lands both takes in the
// first account; the same for "use my saved progress" (pullOverwrite).
import test from "node:test";
import assert from "node:assert/strict";
import { createWorker, createBrowser, takes } from "./sync-env.mjs";

const B_DOC = (n) => ({
  v: 1,
  profileId: "default",
  progress: { "ex-9": { completedCount: 1, history: [{ id: "b1", at: "2026-11-10T10:00:00.000Z", notes: "B-own-1", score: 5 }], lastScore: 5, lastAt: "2026-11-10T10:00:00.000Z" } },
  goals: { weeklySessionsTarget: 3 + n, updatedAt: "2026-11-10T10:00:00.000Z" }
});

/** Bruno's phone has written his copy `revs` times; Ana practises on the shared laptop. */
async function sharedLaptop(revs) {
  const worker = createWorker();
  const bruno = await worker.signIn("bruno@example.test");
  for (let i = 0; i < revs; i += 1) await worker.writeProgress(bruno.token, B_DOC(i));
  const laptop = createBrowser(worker);
  await laptop.signIn("ana@example.test");
  const ana = { token: laptop.win.VTAccount.getSessionToken() };
  laptop.take("A-1");
  assert.equal((await laptop.win.VTSync.syncNow()).ok, true, "precondition: Ana's first take reached her account");
  // Ana's phone adds a take this laptop has never had.
  const phone = await worker.signIn("ana@example.test");
  const copy = await worker.progress(phone.token);
  copy.doc.progress["ex-phone"] = { completedCount: 1, history: [{ id: "p1", at: "2026-11-11T10:00:00.000Z", notes: "A-phone-1", score: 6 }], lastScore: 6, lastAt: "2026-11-11T10:00:00.000Z" };
  await worker.writeProgress(phone.token, copy.doc);
  laptop.take("A-2");
  return { worker, bruno, ana, laptop };
}

/** Ana's next request matching `match` is held; she signs out, Bruno signs in, then it is answered. */
async function switchWhileOut(laptop, match, start) {
  const gate = laptop.gate(match);
  const pending = start();
  await gate.held;
  await laptop.win.VTAccount.signOut();
  await laptop.signIn("bruno@example.test");
  gate.release();
  const result = await pending;
  await laptop.settle();
  return result;
}

const isProgressGet = (e) => e.method === "GET" && e.path.startsWith("/v1/me/progress");

for (const revs of [1, 3]) {
  test(`a cycle still out when the account changes writes nothing into the next account (its copy at rev ${revs})`, async () => {
    const { worker, bruno, laptop } = await sharedLaptop(revs);
    const result = await switchWhileOut(laptop, isProgressGet, () => laptop.win.VTSync.syncNow());
    const copy = await worker.progress(bruno.token);
    assert.deepEqual(takes(copy.doc), ["B-own-1"], "Bruno's account holds his own take and none of Ana's");
    assert.equal(copy.rev, revs, "nothing was written to Bruno's account");
    // Nor was an answer that landed after Salir read into this browser's record: not Bruno's
    // account before he chose, nor Ana's (her phone's take is not shown to whoever is here now).
    assert.deepEqual(takes(laptop.win.VTStorage.readSyncBag("default")), ["A-1", "A-2"]);
    assert.equal(result.ok, false);
    assert.equal(result.reason, "signed_out", "the cycle stops when its session is gone");
    assert.equal(laptop.win.VTSync.getStatus().otherOwner, true, "Bruno is still asked about the practice on this browser");
    // Every request after the switch that carried Ana's practice went out as Ana, or not at all.
    const writes = laptop.log.filter((e) => e.method === "PUT" && e.path === "/v1/me/progress");
    assert.ok(writes.every((e) => e.token !== laptop.win.VTAccount.getSessionToken()), "no write went out with Bruno's session");
  });
}

test("control: the same slow cycle with nobody switching lands both takes in the account that made them", async () => {
  const { worker, ana, laptop } = await sharedLaptop(1);
  const gate = laptop.gate(isProgressGet);
  const pending = laptop.win.VTSync.syncNow();
  await gate.held;
  gate.release();
  assert.equal((await pending).ok, true);
  assert.deepEqual(takes((await worker.progress(ana.token)).doc), ["A-1", "A-2", "A-phone-1"]);
  assert.deepEqual(takes(laptop.win.VTStorage.readSyncBag("default")), ["A-1", "A-2", "A-phone-1"], "the account's copy came down");
});

test("a write answered after the switch is not recorded for the next account", async () => {
  const { worker, bruno, laptop } = await sharedLaptop(1);
  const result = await switchWhileOut(
    laptop,
    (e) => e.method === "PUT" && e.path === "/v1/me/progress",
    () => laptop.win.VTSync.syncNow()
  );
  assert.equal(result.reason, "signed_out");
  // The write went to Ana, who made the takes (read from her phone: the laptop's session ended at Salir).
  const anaPhone = await worker.signIn("ana@example.test");
  assert.deepEqual(takes((await worker.progress(anaPhone.token)).doc), ["A-1", "A-2", "A-phone-1"]);
  // And the browser is not recorded as Bruno's: he is asked before anything of Ana's goes to him.
  assert.equal(laptop.win.VTSync.getStatus().otherOwner, true, "the owner on file is still Ana");
  const next = await laptop.win.VTSync.syncNow();
  assert.equal(next.reason, "other_owner");
  assert.deepEqual(takes((await worker.progress(bruno.token)).doc), ["B-own-1"]);
});

test("'use my saved progress' answered after the switch neither overwrites the record nor arms a write for the next account", async () => {
  const { worker, bruno, laptop } = await sharedLaptop(1);
  const result = await switchWhileOut(laptop, isProgressGet, () => laptop.win.VTSync.pullOverwrite());
  assert.equal(result.ok, false);
  assert.equal(result.reason, "signed_out");
  // Bruno saves a take and closes the tab: the one write a closing page gets
  // must not be built on Ana's revision and copy with Bruno's session.
  laptop.take("B-laptop-1");
  laptop.win.VTSync.flush({ unloading: true });
  await laptop.settle();
  assert.deepEqual(takes((await worker.progress(bruno.token)).doc), ["B-own-1"]);
});

test("control: 'use my saved progress' with nobody switching brings the account's copy down", async () => {
  const { worker, ana, laptop } = await sharedLaptop(1);
  const gate = laptop.gate(isProgressGet);
  const pending = laptop.win.VTSync.pullOverwrite();
  await gate.held;
  gate.release();
  assert.equal((await pending).ok, true);
  assert.deepEqual(takes(laptop.win.VTStorage.readSyncBag("default")), takes((await worker.progress(ana.token)).doc));
});

test("a sync the next account asks for while the last one's cycle is out runs as the next account", async () => {
  const { worker, bruno, laptop } = await sharedLaptop(1);
  const gate = laptop.gate(isProgressGet);
  const anas = laptop.win.VTSync.syncNow();
  await gate.held;
  await laptop.win.VTAccount.signOut();
  await laptop.signIn("bruno@example.test");
  // Bruno's sign-in asks for a sync while Ana's cycle is still out.
  const brunos = laptop.win.VTSync.syncNow();
  gate.release();
  assert.equal((await anas).reason, "signed_out");
  const mine = await brunos;
  // Not Ana's result handed on: Bruno's own cycle ran, and stopped at the question.
  assert.equal(mine.reason, "other_owner");
  assert.deepEqual(takes((await worker.progress(bruno.token)).doc), ["B-own-1"]);
});
