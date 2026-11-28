// Two tabs of one browser share the stored session and the practice record, and each holds the session in
// memory (QA-76). The state-machine inventory of 2026-11-26 found a tab that never followed a sign-in made in
// another: Ana's tab went on as Ana over the record the browser now kept for Bruno, and her closing write
// sent his practice to her account (and the next sync hers to his). These run the real storage, account and
// sync modules against the real worker router, two tabs over one storage, as tests/node/sync-env.mjs builds.
import test from "node:test";
import assert from "node:assert/strict";
import { createWorker, createBrowser, takes } from "./sync-env.mjs";

const BRUNO_OWN = {
  v: 1,
  profileId: "default",
  progress: { "ex-9": { completedCount: 1, history: [{ id: "b1", at: "2026-11-10T10:00:00.000Z", notes: "B-own-1", score: 5 }], lastScore: 5, lastAt: "2026-11-10T10:00:00.000Z" } }
};

/**
 * Tab A opened first, nobody signed in; Ana signs in in tab B and syncs a take; then Bruno signs in in tab A
 * and keeps only his account's copy. `hear` is whether the tabs hear each other's storage writes.
 */
async function sharedBrowser(hear) {
  const worker = createWorker();
  const bruno = await worker.signIn("bruno@example.test");
  await worker.writeProgress(bruno.token, BRUNO_OWN);
  const store = new Map();
  const tabA = createBrowser(worker, { store, storageEvents: hear });
  const tabB = createBrowser(worker, { store, storageEvents: hear });
  await tabB.signIn("ana@example.test");
  await tabB.fire([0]);
  tabB.take("A-1");
  assert.equal((await tabB.win.VTSync.syncNow()).ok, true, "control: Ana's take reached her account");
  const ana = tabB.win.VTAccount.getSessionToken();
  await tabA.signIn("bruno@example.test");
  await tabA.fire([0]);
  await tabB.settle();
  return { worker, tabA, tabB, ana, bruno: tabA.win.VTAccount.getSessionToken() };
}

/** Bruno chooses his account's copy in tab A, if tab A is still asking whose the practice is. */
async function brunoKeepsHis(tabA) {
  if (tabA.win.VTSync.getStatus().otherOwner) assert.equal((await tabA.win.VTSync.useAccountOnly()).ok, true);
  await tabA.settle();
}

test("a sign-in in another tab is followed: Ana's tab becomes Bruno's, and neither account gets the other's practice", async () => {
  const { worker, tabA, tabB, ana, bruno } = await sharedBrowser(true);
  // The wrong behaviour: tab B still held Ana's session in memory after Bruno signed in beside it.
  assert.equal(tabB.win.VTAccount.getSessionToken(), bruno, "tab B holds the session the browser stores");
  await brunoKeepsHis(tabA);
  tabB.take("B-2");
  tabB.win.VTSync.flush({ unloading: true });
  await tabB.settle();
  tabA.take("B-laptop-1");
  await tabA.win.VTSync.syncNow();
  await tabA.settle();
  assert.deepEqual(takes((await worker.progress(ana)).doc), ["A-1"], "Ana's account holds only what Ana sang");
  const brunos = takes((await worker.progress(bruno)).doc);
  assert.ok(!brunos.includes("A-1"), `Bruno's account holds none of Ana's (${brunos.join(", ")})`);
  assert.ok(brunos.includes("B-own-1") && brunos.includes("B-laptop-1"), `control: Bruno's own practice is there (${brunos.join(", ")})`);
});

test("the closing write asks whose the practice is: a tab that missed another's sign-in sends nothing", async () => {
  // Tabs that do not hear each other: a page in the back-forward cache, or a browser slow to tell.
  const { worker, tabA, tabB, ana } = await sharedBrowser(false);
  assert.notEqual(tabB.win.VTAccount.getSessionToken(), tabA.win.VTAccount.getSessionToken(), "control: tab B missed the sign-in");
  await brunoKeepsHis(tabA);
  tabB.take("A-2");
  const before = tabB.log.length;
  tabB.win.VTSync.flush({ unloading: true });
  await tabB.settle();
  const puts = tabB.log.slice(before).filter((e) => e.method === "PUT");
  assert.deepEqual(puts, [], "no closing write in Ana's name over Bruno's record");
  assert.deepEqual(takes((await worker.progress(ana)).doc), ["A-1"], "Ana's account did not get Bruno's practice");
});

test("control: one tab's own closing write still goes, and lands", async () => {
  const worker = createWorker();
  const tab = createBrowser(worker, { storageEvents: true });
  await tab.signIn("ana@example.test");
  await tab.fire([0]);
  tab.take("A-1");
  await tab.win.VTSync.syncNow();
  tab.take("A-2");
  const ana = tab.win.VTAccount.getSessionToken();
  tab.win.VTSync.flush({ unloading: true });
  await tab.settle();
  assert.deepEqual(takes((await worker.progress(ana)).doc), ["A-1", "A-2"]);
});

test("a sign-out in another tab is followed: the other tab is signed out and sends nothing more", async () => {
  const worker = createWorker();
  const store = new Map();
  const tabA = createBrowser(worker, { store, storageEvents: true });
  const tabB = createBrowser(worker, { store, storageEvents: true });
  await tabB.signIn("ana@example.test");
  await tabB.fire([0]);
  await tabA.settle();
  assert.equal(tabA.win.VTAccount.getState().signedIn, true, "control: tab A followed the sign-in too");
  await tabA.win.VTAccount.signOut();
  await tabB.settle();
  assert.equal(tabB.win.VTAccount.getState().signedIn, false, "tab B is signed out");
  assert.equal(tabB.win.VTAccount.getSessionToken(), null);
  const before = tabB.log.length;
  tabB.take("after-sign-out");
  await tabB.fire([8000, 0]);
  tabB.win.VTSync.flush({ unloading: true });
  await tabB.settle();
  assert.deepEqual(tabB.log.slice(before).filter((e) => e.path.startsWith("/v1/me")), [], "nothing is sent for a session that is gone");
});

test("a stale tab's refused session does not delete the one another tab has just stored", async () => {
  const worker = createWorker();
  const store = new Map();
  // Tab B does not hear; tab A signs Ana out everywhere and Bruno in.
  const tabA = createBrowser(worker, { store });
  const tabB = createBrowser(worker, { store });
  await tabB.signIn("ana@example.test");
  await tabB.settle();
  await tabA.win.VTAccount.init();
  await tabA.win.VTAccount.signOut({ everywhere: true });
  await tabA.signIn("bruno@example.test");
  await tabA.settle();
  const bruno = tabA.win.VTAccount.getSessionToken();
  // Tab B asks about Ana's session: the worker no longer knows it (401).
  const r = await tabB.win.VTAccount.refresh();
  await tabB.settle();
  assert.equal(r.ok, false, "control: Ana's session was refused");
  assert.equal(JSON.parse(store.get(tabA.win.VTAccount.LS_KEY) || "null")?.token, bruno, "Bruno's stored session is still there");
  assert.equal(tabB.win.VTAccount.getSessionToken(), bruno, "and tab B took it up");
});

test("a page brought back from the back-forward cache follows the session stored while it was away", async () => {
  const worker = createWorker();
  const store = new Map();
  const tabB = createBrowser(worker, { store, storageEvents: true });
  await tabB.signIn("ana@example.test");
  await tabB.settle();
  // Away: tab A (which tab B cannot hear, as a stored page hears nothing) signs Bruno in.
  const tabA = createBrowser(worker, { store });
  await tabA.signIn("bruno@example.test");
  await tabA.settle();
  assert.notEqual(tabB.win.VTAccount.getSessionToken(), tabA.win.VTAccount.getSessionToken(), "control: tab B missed it");
  tabB.event("pageshow", { persisted: false });
  assert.notEqual(tabB.win.VTAccount.getSessionToken(), tabA.win.VTAccount.getSessionToken(), "control: a first show is not a return");
  tabB.event("pageshow", { persisted: true });
  await tabB.settle();
  assert.equal(tabB.win.VTAccount.getSessionToken(), tabA.win.VTAccount.getSessionToken());
});

test("until the worker says whose the new session is, the tab names nobody, not the account it held", async () => {
  const worker = createWorker();
  const store = new Map();
  const tabA = createBrowser(worker, { store, storageEvents: true });
  const tabB = createBrowser(worker, { store, storageEvents: true });
  await tabB.signIn("ana@example.test");
  await tabB.settle();
  assert.equal(tabB.win.VTAccount.getState().account?.email, "ana@example.test", "control: tab B is Ana's");
  const held = tabB.gate((e) => e.method === "GET" && e.path === "/v1/me");
  await tabA.signIn("bruno@example.test");
  await held.held;
  const meanwhile = tabB.win.VTAccount.getState();
  assert.equal(meanwhile.signedIn, true);
  assert.equal(meanwhile.account, null, "Ana's account is not shown over Bruno's session");
  held.release();
  await tabB.settle();
  assert.equal(tabB.win.VTAccount.getState().account?.email, "bruno@example.test");
});

/** Ana's practice synced on the laptop; Bruno (B-phone-1 in his account) signs in in window A and opens window C. */
async function askedTwice(hear) {
  const worker = createWorker();
  const store = new Map();
  const phone = await worker.signIn("bruno@example.test");
  await worker.writeProgress(phone.token, { ...BRUNO_OWN, progress: { "ex-9": { ...BRUNO_OWN.progress["ex-9"], history: [{ id: "b1", at: "2026-11-10T10:00:00.000Z", notes: "B-phone-1", score: 5 }] } } });
  const winA = createBrowser(worker, { store, storageEvents: hear });
  await winA.signIn("ana@example.test");
  winA.take("A-1");
  assert.equal((await winA.win.VTSync.syncNow()).ok, true);
  await winA.win.VTAccount.signOut();
  await winA.signIn("bruno@example.test");
  await winA.fire([0]);
  const winC = createBrowser(worker, { store, storageEvents: hear });
  await winC.win.VTAccount.refresh();
  await winC.settle();
  await winC.fire([8000]);
  assert.equal(winC.win.VTSync.getStatus().otherOwner, true, "control: window C asks too");
  return { worker, winA, winC };
}

test("the owner question answered in one window and pressed again in another loses nothing practised since", async () => {
  const { worker, winA, winC } = await askedTwice(false);
  assert.equal((await winA.win.VTSync.useAccountOnly()).ok, true);
  assert.ok(takes(winA.win.VTStorage.readSyncBag("default")).includes("B-phone-1"), "control: the first answer brings the account's copy down");
  winA.take("B-new");
  const again = await winC.win.VTSync.useAccountOnly();
  // The page's objects are another realm's: compared by value.
  assert.deepEqual({ ...again }, { ok: true, reason: "answered" }, "the second press is told the question was answered");
  assert.ok(takes(winA.win.VTStorage.readSyncBag("default")).includes("B-new"), "the take made since is still on the browser");
  await winA.fire([8000]);
  const brunos = takes((await worker.progress(winA.win.VTAccount.getSessionToken())).doc);
  assert.deepEqual(brunos, ["B-new", "B-phone-1"]);
});

test("a window still asking hears the answer given in another and stops asking", async () => {
  const { winA, winC } = await askedTwice(true);
  const told = [];
  winC.win.VTSync.onChange((st) => told.push(st.otherOwner));
  assert.equal((await winA.win.VTSync.useAccountOnly()).ok, true);
  await winC.settle();
  assert.equal(winC.win.VTSync.getStatus().otherOwner, false);
  assert.equal(told.at(-1), false, "its panel was told, so it can stop showing the question");
});
