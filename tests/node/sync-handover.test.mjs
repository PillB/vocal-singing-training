// RES-2. On a shared browser Ana's practice is here when Bruno signs in, and
// Bruno is asked whose it is. The question lives in the account panel, so he
// can close it and practise first. Wrong behaviour rejected: when he then
// answers "Usar solo la de mi cuenta", his own takes are put aside with Ana's,
// vanish from his record and his account, and reach Ana's account when she
// signs in here again. The same when he leaves without answering: Ana's next
// sync sent his takes to her account. Controls: what Ana did, and what was
// done here while nobody was signed in, still goes aside for Ana and comes back
// to her; the takes Bruno saved survive a reload before he answers.
import test from "node:test";
import assert from "node:assert/strict";
import { createWorker, createBrowser, takes } from "./sync-env.mjs";

const plain = (x) => JSON.parse(JSON.stringify(x));

/**
 * Let the clock move on by a millisecond. The split is by time, and nobody
 * saves a take in the millisecond they signed in; a test running at machine
 * speed could.
 */
async function nextMs() {
  const t = Date.now();
  while (Date.now() === t) await new Promise((r) => setImmediate(r));
}

/** Ana practises and syncs on the shared laptop, signs out; optional practice while signed out; Bruno signs in. */
async function brunoAfterAna(opts = {}) {
  const worker = createWorker();
  const store = new Map();
  let laptop = createBrowser(worker, { store, days: opts.days });
  await laptop.signIn("ana@example.test");
  laptop.take("A-1");
  assert.equal((await laptop.win.VTSync.syncNow()).ok, true);
  await laptop.win.VTAccount.signOut();
  if (opts.signedOut) laptop.take("nobody-1", "ex-3");
  await nextMs();
  await laptop.signIn("bruno@example.test");
  await laptop.fire([0]);
  assert.equal(laptop.win.VTSync.getStatus().otherOwner, true, "precondition: Bruno is asked");
  // He closes the panel and practises before answering.
  await nextMs();
  laptop.take("B-own-1", "ex-2");
  laptop.win.VTStorage.addHoldLog(6);
  if (opts.reload) {
    laptop = createBrowser(worker, { store, days: opts.days });
    await laptop.win.VTAccount.refresh();
    await laptop.settle();
  }
  const bruno = laptop.win.VTAccount.getSessionToken();
  return { worker, store, laptop, bruno };
}

/**
 * Somebody comes back to the laptop and syncs. If somebody else's practice is
 * on it now, they are asked in turn, and keep only their own account's.
 * @returns {Promise<{token: string, asked: boolean}>} Their session, and whether they were asked.
 */
async function signsBackIn(laptop, email) {
  await laptop.win.VTAccount.signOut();
  await laptop.signIn(email);
  await laptop.fire([0]);
  const asked = laptop.win.VTSync.getStatus().otherOwner;
  if (asked) assert.equal((await laptop.win.VTSync.useAccountOnly()).ok, true);
  await laptop.fire([8000]);
  return { token: laptop.win.VTAccount.getSessionToken(), asked };
}

for (const reload of [false, true]) {
  test(`what Bruno saved before answering stays his${reload ? ", across a reload" : ""}`, async () => {
    const { worker, laptop, bruno } = await brunoAfterAna({ reload });
    const res = await laptop.win.VTSync.useAccountOnly();
    assert.equal(res.ok, true, JSON.stringify(res));
    const S = laptop.win.VTStorage;
    assert.deepEqual(takes(S.readSyncBag("default")), ["B-own-1"], "Bruno's record keeps his take and none of Ana's");
    assert.deepEqual(plain(S.getHoldLogs()).map((h) => h.seconds), [6], "and his held note");
    assert.deepEqual(takes((await worker.progress(bruno)).doc), ["B-own-1"], "and it reached his account");
    assert.equal(plain(S.getProgress())["ex-2"].completedCount, 1, "counted once");

    const ana = await signsBackIn(laptop, "ana@example.test");
    assert.equal(ana.asked, true, "Bruno's practice is on the laptop now, so Ana is asked in turn");
    assert.deepEqual(takes((await worker.progress(ana.token)).doc), ["A-1"], "nothing of Bruno's went to Ana's account");
    assert.deepEqual(takes(S.readSyncBag("default")), ["A-1"], "control: Ana's practice came back to her");
    const rows = plain(S.getProgress());
    assert.equal(rows["ex-2"], undefined, "no count of Bruno's take is left on Ana's record");
    assert.equal(rows["ex-1"].completedCount, 1);
  });
}

test("control: practice done here while nobody was signed in still goes aside for the previous owner", async () => {
  const { worker, laptop, bruno } = await brunoAfterAna({ signedOut: true });
  assert.equal((await laptop.win.VTSync.useAccountOnly()).ok, true);
  const S = laptop.win.VTStorage;
  assert.deepEqual(takes(S.readSyncBag("default")), ["B-own-1"]);
  assert.deepEqual(takes((await worker.progress(bruno)).doc), ["B-own-1"]);
  await signsBackIn(laptop, "ana@example.test");
  assert.deepEqual(takes(S.readSyncBag("default")), ["A-1", "nobody-1"], "the signed-out take is back with Ana's practice");
});

test("the day ledger goes with the takes: Bruno keeps his day, Ana's has none of his time", async () => {
  const { worker, laptop, bruno } = await brunoAfterAna({ days: true });
  const D = laptop.win.VTDays;
  const today = D.dayKey();
  // Today's row of a day ledger: this browser's (VTDays.read()), or an account copy's (doc.days).
  const day = (ledger) => {
    const row = ledger && ledger.days && ledger.days[today];
    return row ? { sec: row.sec, n: row.n } : null;
  };
  assert.deepEqual(day(D.read()), { sec: 120, n: 2 }, "precondition: one shared row holds both takes");
  assert.equal((await laptop.win.VTSync.useAccountOnly()).ok, true);
  assert.deepEqual(day(D.read()), { sec: 60, n: 1 }, "Bruno's ledger counts his take today");
  assert.equal(D.read().days[today].ex.includes("ex-1"), false, "and not Ana's exercise");
  assert.deepEqual(day((await worker.progress(bruno)).doc.days), { sec: 60, n: 1 }, "so does his account's");

  const ana = await signsBackIn(laptop, "ana@example.test");
  assert.deepEqual(day(D.read()), { sec: 60, n: 1 }, "Ana's day has her minute and not Bruno's");
  assert.deepEqual(day((await worker.progress(ana.token)).doc.days), { sec: 60, n: 1 });
});

test("Bruno leaves without answering: his takes do not reach Ana's account, and come back to him", async () => {
  const { worker, laptop } = await brunoAfterAna();
  const S = laptop.win.VTStorage;
  const ana = await signsBackIn(laptop, "ana@example.test");
  assert.equal(ana.asked, false, "control: the laptop is still Ana's, so she is not asked");
  assert.deepEqual(takes((await worker.progress(ana.token)).doc), ["A-1"], "Ana's account has none of Bruno's takes");
  assert.deepEqual(takes(S.readSyncBag("default")), ["A-1"], "nor has her record here");
  assert.deepEqual(plain(S.getHoldLogs()), [], "nor his held note");

  const bruno = await signsBackIn(laptop, "bruno@example.test");
  assert.equal(bruno.asked, true);
  assert.deepEqual(takes(S.readSyncBag("default")), ["B-own-1"], "Bruno's take came back to him");
  assert.deepEqual(plain(S.getHoldLogs()).map((h) => h.seconds), [6]);
  assert.deepEqual(takes((await worker.progress(bruno.token)).doc), ["B-own-1"], "and reached his account");
});

test("what Bruno left here in a second profile survives his answer when he also practised before answering", async () => {
  const worker = createWorker();
  const laptop = createBrowser(worker);
  const S = laptop.win.VTStorage;
  // The laptop has a second profile, which Bruno's account already holds a copy of from his phone.
  const p2 = S.createProfile("Bruno", { maxSlots: 3 }).id;
  S.setActiveProfile("default");
  const phone = await worker.signIn("bruno@example.test");
  const at = "2026-11-10T10:00:00.000Z";
  const p2Doc = {
    v: 1,
    profileId: p2,
    progress: { "ex-9": { completedCount: 1, history: [{ id: "ph1", at, notes: "B-phone-p2", score: 5 }], lastScore: 5, lastAt: at } }
  };
  assert.equal((await worker.writeProgress(phone.token, p2Doc, p2)).status, 200);

  await laptop.signIn("ana@example.test");
  laptop.take("A-1");
  assert.equal((await laptop.win.VTSync.syncNow()).ok, true);
  await laptop.win.VTAccount.signOut();

  // Bruno practises in his profile and leaves without answering: that take goes aside for him.
  await nextMs();
  await laptop.signIn("bruno@example.test");
  await laptop.fire([0]);
  await nextMs();
  S.setActiveProfile(p2);
  laptop.take("B-p2-1", "ex-9");
  S.setActiveProfile("default");
  const ana = await signsBackIn(laptop, "ana@example.test");
  assert.equal(ana.asked, false, "precondition: the laptop is still Ana's");

  // He comes back, practises in the main profile, and answers.
  await laptop.win.VTAccount.signOut();
  await nextMs();
  await laptop.signIn("bruno@example.test");
  await laptop.fire([0]);
  assert.equal(laptop.win.VTSync.getStatus().otherOwner, true, "precondition: Bruno is asked");
  await nextMs();
  laptop.take("B-def-1");
  assert.equal((await laptop.win.VTSync.useAccountOnly()).ok, true);
  assert.deepEqual(takes(S.readSyncBag(p2)), ["B-p2-1", "B-phone-p2"], "his take in the second profile is back, with his phone's");
  assert.deepEqual(takes(S.readSyncBag("default")), ["B-def-1"], "control: his main profile has his new take and none of Ana's");
  await laptop.fire([8000]);
  const bruno = laptop.win.VTAccount.getSessionToken();
  assert.deepEqual(takes((await worker.progress(bruno, p2)).doc), ["B-p2-1", "B-phone-p2"], "and it reached his account");
  assert.deepEqual(takes((await worker.progress(bruno)).doc), ["B-def-1"]);
});

test("control: Ana signing out of her own laptop leaves her practice there", async () => {
  const worker = createWorker();
  const laptop = createBrowser(worker);
  await laptop.signIn("ana@example.test");
  laptop.take("A-1");
  assert.equal((await laptop.win.VTSync.syncNow()).ok, true);
  await laptop.win.VTAccount.signOut();
  await nextMs();
  await laptop.signIn("ana@example.test");
  await laptop.fire([0]);
  await nextMs();
  laptop.take("A-2");
  await laptop.win.VTAccount.signOut();
  assert.deepEqual(takes(laptop.win.VTStorage.readSyncBag("default")), ["A-1", "A-2"], "nothing of hers is put aside");
});

test("control: answering at once keeps nothing of Ana's and sends Bruno nothing", async () => {
  const worker = createWorker();
  const laptop = createBrowser(worker);
  await laptop.signIn("ana@example.test");
  laptop.take("A-1");
  await laptop.win.VTSync.syncNow();
  await laptop.win.VTAccount.signOut();
  await laptop.signIn("bruno@example.test");
  const bruno = laptop.win.VTAccount.getSessionToken();
  assert.equal((await laptop.win.VTSync.useAccountOnly()).ok, true);
  assert.deepEqual(takes(laptop.win.VTStorage.readSyncBag("default")), []);
  assert.deepEqual(takes((await worker.progress(bruno)).doc), []);
});
