// What the sync says about itself, which the account panel's line is drawn from.
//
// FLOW-6. Wrong behaviour rejected: right after a take the status reads as
// saved (a revision on file, no error) while the account does not hold it, so
// the panel says "Progreso guardado en tu cuenta". Controls: once the push
// lands it is saved again; a page that changed nothing is not pending.
//
// FLOW-7. Wrong behaviour rejected: signing in on a device waits out the 8 s
// quiet period meant to batch writes before its first read, and meanwhile
// the status reads as "never saved" over an empty record. Controls: a take
// saved while signed in still waits the quiet period; a sign-in already in
// place when the page loads keeps it (tests/node/sync-late-signin.test.mjs);
// a later /v1/me answer does not push the first read back.
import test from "node:test";
import assert from "node:assert/strict";
import { createWorker, createBrowser, takes } from "./sync-env.mjs";

const isProgress = (e) => e.path.startsWith("/v1/me/progress");

test("a take not yet in the account reads as pending, and as saved once it is", async () => {
  const worker = createWorker();
  const device = createBrowser(worker);
  await device.signIn("one@example.test");
  const token = device.win.VTAccount.getSessionToken();
  device.take("first");
  assert.equal((await device.win.VTSync.syncNow()).ok, true);
  assert.equal(device.win.VTSync.getStatus().pending, false, "control: nothing waiting right after a sync");

  device.take("second");
  const status = device.win.VTSync.getStatus();
  assert.deepEqual(takes((await worker.progress(token)).doc), ["first"], "precondition: the account does not have it yet");
  assert.equal(status.pending, true, "the newest take is waiting to be sent");
  assert.equal(status.lastError, null);

  await device.fire([8000]);
  assert.deepEqual(takes((await worker.progress(token)).doc), ["first", "second"]);
  assert.equal(device.win.VTSync.getStatus().pending, false, "saved once the push landed");
});

test("a take tells the panel at once, so an open panel stops saying saved", async () => {
  const device = createBrowser(createWorker());
  await device.signIn("one@example.test");
  assert.equal((await device.win.VTSync.syncNow()).ok, true);
  const seen = [];
  device.win.VTSync.onChange((s) => seen.push(s.pending));
  device.take("t");
  assert.deepEqual(seen, [true]);
});

/** The account holds one take from another device; a fresh browser is about to sign in. */
async function secondDevice() {
  const worker = createWorker();
  const phone = await worker.signIn("one@example.test");
  await worker.writeProgress(phone.token, {
    v: 1,
    profileId: "default",
    progress: { "ex-1": { completedCount: 1, history: [{ id: "p1", at: "2026-11-10T10:00:00.000Z", notes: "from-phone", score: 5 }], lastScore: 5, lastAt: "2026-11-10T10:00:00.000Z" } }
  });
  return { worker, laptop: createBrowser(worker) };
}

test("signing in reads the account at once, and says it is fetching until then", async () => {
  const { laptop } = await secondDevice();
  const seen = [];
  laptop.win.VTSync.onChange((s) => seen.push(s.fetching));
  await laptop.signIn("one@example.test");
  assert.equal(laptop.win.VTSync.getStatus().fetching, true, "fetching, not 'never saved', before the first read lands");
  assert.equal(laptop.log.filter(isProgress).length, 0, "precondition: nothing read yet");
  // Only what is due now runs: not the quiet period meant for writes.
  await laptop.fire([0]);
  assert.ok(laptop.log.some((e) => e.method === "GET" && isProgress(e)), "the account was read without waiting");
  assert.deepEqual(takes(laptop.win.VTStorage.readSyncBag("default")), ["from-phone"], "the other device's take is here");
  assert.equal(laptop.win.VTSync.getStatus().fetching, false);
  assert.ok(seen.includes(true) && seen.at(-1) === false, "the panel was told both ways");
});

test("control: a /v1/me answer after the sign-in does not push the first read back", async () => {
  const { laptop } = await secondDevice();
  await laptop.signIn("one@example.test");
  await laptop.win.VTAccount.refresh();
  await laptop.fire([0]);
  assert.deepEqual(takes(laptop.win.VTStorage.readSyncBag("default")), ["from-phone"]);
});

test("control: a take saved while signed in still waits the quiet period", async () => {
  const { worker, laptop } = await secondDevice();
  await laptop.signIn("one@example.test");
  await laptop.fire([0]);
  const reads = laptop.log.filter(isProgress).length;
  laptop.take("laptop-1");
  await laptop.fire([0]);
  assert.equal(laptop.log.filter(isProgress).length, reads, "nothing sent before the quiet period");
  await laptop.fire([8000]);
  const phone = await worker.signIn("one@example.test");
  assert.deepEqual(takes((await worker.progress(phone.token)).doc), ["from-phone", "laptop-1"]);
});

test("control: signing out ends the fetching state", async () => {
  const { laptop } = await secondDevice();
  await laptop.signIn("one@example.test");
  await laptop.win.VTAccount.signOut();
  assert.equal(laptop.win.VTSync.getStatus().fetching, false);
});
