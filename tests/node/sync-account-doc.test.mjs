// The account's copy is data from outside this browser: the worker stores any
// object under 512 KB, so a copy written by an old or broken client, or by
// whoever holds a session token, can carry any shape. These follow such a copy
// through a real sync (the real storage, account and sync modules against the
// real worker router, tests/node/sync-env.mjs).
//
// RES-4. Wrong behaviour rejected: one row whose history is not a list makes
// every device's merge throw on every sync, the rejection escapes syncNow, and
// the panel goes on saying "Progreso guardado en tu cuenta". Controls: a
// cycle that throws for any reason reports an error and arms the retry; a
// well-formed copy syncs as before.
//
// CXSS-1 (the trust boundary; the HTML sinks are fixed elsewhere). Wrong
// behaviour rejected: markup in completedCount, a hold's seconds and the plan's
// element is kept as text and written back to every device; a hold dated 2099
// stays first for ever; a plan at week 99 beats a real week-7 plan. Controls:
// numbers written as text are coerced, not dropped; a plan past week 12 (the
// app keeps counting after the twelfth review) is kept.
//
// RES-5. Wrong behaviour rejected: two devices that each did three takes since
// they last met hold six and count three. Control: a count above the takes
// kept (the history is capped at 50) still wins.
import test from "node:test";
import assert from "node:assert/strict";
import { createWorker, createBrowser, takes } from "./sync-env.mjs";

const ELEMENTS = ["Volume", "Diction", "Breath support", "Resonance / soft palate"];
const MARKUP = '<meta http-equiv="refresh" content="0;url=https://evil.example/"><b class="vtmk">';
const plain = (x) => JSON.parse(JSON.stringify(x));

/** A signed-in browser whose account's copy is `doc` (written by another session of the same account). */
async function deviceWithAccountCopy(doc, opts = {}) {
  const worker = createWorker();
  const other = await worker.signIn("one@example.test");
  // Stored the way an older worker stored any object: the route itself now
  // refuses these shapes (bad_document), but copies written before that are
  // still served to every device.
  if (doc) await worker.storeOldCopy(other.accountId, doc);
  const device = createBrowser(worker, { extra: { VT_WEEK_ELEMENTS: ELEMENTS, ...(opts.extra || {}) } });
  await device.signIn("one@example.test");
  return { worker, other, device };
}

const row = (n, ...notes) => ({
  completedCount: n,
  history: notes.map((note, i) => ({ id: `${note}-id`, at: `2026-11-1${i}T10:00:00.000Z`, notes: note, score: 5 })),
  lastScore: 5,
  lastAt: "2026-11-10T10:00:00.000Z"
});

test("a row whose history is not a list neither stops the sync nor is kept as it is", async () => {
  const doc = { v: 1, profileId: "default", progress: { "ex-1": { ...row(1, "good-1"), history: { a: { id: "g1", at: "2026-11-10T10:00:00.000Z", notes: "good-1" } } } } };
  const { worker, other, device } = await deviceWithAccountCopy(doc);
  device.take("good-2");
  const res = await device.win.VTSync.syncNow();
  assert.deepEqual(plain(res).ok, true, `the sync went through: ${JSON.stringify(res)}`);
  const copy = await worker.progress(other.token);
  assert.deepEqual(takes(copy.doc), ["good-1", "good-2"], "the new take reached the account, and the one inside the malformed row survived");
  assert.ok(Array.isArray(copy.doc.progress["ex-1"].history), "the account's copy is repaired by the write");
  assert.equal(device.win.VTSync.getStatus().lastError, null);
});

for (const [name, patch] of [
  ["history is a number", { progress: { "ex-1": { ...row(1), history: 5 } } }],
  ["history is a string", { progress: { "ex-1": { ...row(1), history: "x" } } }],
  ["reviews is an object", { reviews: { a: 1 } }],
  ["holdLogs is a number", { holdLogs: 7 }],
  ["a row is a string", { progress: { "ex-1": "nope" } }],
  ["completedElements is an object", { weekPlan: { weekNumber: 2, element: "Volume", status: "active", completedElements: { a: "Diction" }, checkIns: 3 } }]
]) {
  test(`a copy where ${name} still syncs`, async () => {
    const { worker, other, device } = await deviceWithAccountCopy({ v: 1, profileId: "default", ...patch });
    device.take("fresh-1");
    const res = await device.win.VTSync.syncNow();
    assert.equal(res.ok, true, `${JSON.stringify(res)}`);
    assert.ok(takes((await worker.progress(other.token)).doc).includes("fresh-1"));
  });
}

test("a cycle that throws reports an error and arms the retry, instead of leaving 'saved'", async () => {
  // Any step of a merge that throws: here the day ledger's own merge.
  const VTDays = { merge() { throw new TypeError("days.merge failed"); } };
  const warn = console.warn;
  console.warn = () => {};
  try {
    const { device } = await deviceWithAccountCopy({ v: 1, profileId: "default", progress: {}, days: { v: 1, days: {} } }, { extra: { VTDays } });
    // The sync the sign-in asked for runs into it.
    await device.fire([0, 8000]);
    assert.equal(device.win.VTSync.getStatus().lastError, "error", "the panel says it could not save");
    assert.ok([...device.timers.values()].some((t) => t.ms === 30000), "and the promised retry is armed");
    // "Guardar ahora" gets the same answer, not a rejection nobody handles.
    assert.deepEqual(plain(await device.win.VTSync.syncNow()), { ok: false, reason: "error" });
  } finally {
    console.warn = warn;
  }
});

test("control: the same account copy without the fault syncs and clears the error", async () => {
  const { device } = await deviceWithAccountCopy({ v: 1, profileId: "default", progress: {}, days: { v: 1, days: {} } });
  device.take("t-1");
  assert.equal((await device.win.VTSync.syncNow()).ok, true);
  assert.equal(device.win.VTSync.getStatus().lastError, null);
});

test("markup in the account's numbers and plan never reaches this browser's record, nor goes back up", async () => {
  const doc = {
    v: 1,
    profileId: "default",
    progress: { "s4-lip-trills": { ...row(1, "real-1"), completedCount: MARKUP } },
    holdLogs: [
      { at: "2026-11-10T10:00:00.000Z", seconds: MARKUP },
      { at: "2099-01-01T00:00:00.000Z", seconds: 3 },
      { at: "2026-11-09T10:00:00.000Z", seconds: "4.5" }
    ],
    weekPlan: { weekNumber: 3, element: MARKUP, status: MARKUP, completedElements: ["Volume", MARKUP], checkIns: [], startedAt: "2026-11-01T10:00:00.000Z" },
    reviews: [{ week: MARKUP, element: MARKUP, verdict: MARKUP, notes: "kept as text", at: "2026-11-02T10:00:00.000Z", checkInCount: "2" }]
  };
  const { worker, other, device } = await deviceWithAccountCopy(doc);
  device.take("mine-1", "v1-diction");
  assert.equal((await device.win.VTSync.syncNow()).ok, true);
  const S = device.win.VTStorage;
  const progress = plain(S.getProgress());
  assert.equal(progress["s4-lip-trills"].completedCount, 1, "a count that is not a number counts the takes listed");
  assert.deepEqual(plain(S.getHoldLogs()), [{ at: "2026-11-09T10:00:00.000Z", seconds: 4.5 }], "markup and a hold dated 2099 are dropped; '4.5' is the number 4.5");
  const plan = plain(S.getWeekPlan());
  assert.equal(plan.element, null);
  assert.equal(plan.status, "idle");
  assert.deepEqual(plan.completedElements, ["Volume"]);
  assert.equal(plan.weekNumber, 3, "control: the plan itself is kept");
  const review = plain(S.getReviews())[0];
  assert.deepEqual([review.week, review.element, review.verdict, review.checkInCount, review.notes], [null, null, null, 2, "kept as text"]);
  // The repaired copy is what goes back to the account, so the next device pulls it clean.
  const back = JSON.stringify((await worker.progress(other.token)).doc);
  assert.equal(back.includes("vtmk"), false, "no markup left in the account's copy");
  assert.equal(back.includes("2099"), false);
});

test("a plan at week 99 does not beat a real week-7 plan; one at week 13 does (the app counts past the twelfth review)", async () => {
  const bogus = { weekNumber: 99, element: "Volume", status: "active", completedElements: [], checkIns: [], startedAt: "2026-11-01T10:00:00.000Z" };
  const real = { weekNumber: 7, element: "Diction", status: "active", completedElements: ["Volume"], checkIns: [], startedAt: "2026-11-02T10:00:00.000Z" };
  const { device } = await deviceWithAccountCopy({ v: 1, profileId: "default", weekPlan: bogus });
  device.win.VTStorage.setWeekPlan(real);
  assert.equal((await device.win.VTSync.syncNow()).ok, true);
  assert.equal(plain(device.win.VTStorage.getWeekPlan()).weekNumber, 7);

  const later = { ...bogus, weekNumber: 13, element: "Breath support" };
  const merged = plain(device.win.VTSync.mergeBag({ v: 1, profileId: "default", weekPlan: real }, { weekPlan: later }));
  assert.equal(merged.weekPlan.weekNumber, 13, "control: a plan past the twelfth week is a real plan");
  assert.equal(merged.weekPlan.element, "Breath support");
});

test("numbers the account wrote as text are coerced, not dropped", () => {
  const device = createBrowser(createWorker(), { extra: { VT_WEEK_ELEMENTS: ELEMENTS } });
  const merged = plain(
    device.win.VTSync.mergeBag(
      { v: 1, profileId: "default", progress: {} },
      { progress: { "ex-1": { ...row("4", "a", "b"), completedCount: "4" } }, goals: { weeklySessionsTarget: "5", updatedAt: "2026-11-10T10:00:00.000Z" } }
    )
  );
  assert.equal(merged.progress["ex-1"].completedCount, 4);
  assert.equal(merged.goals.weeklySessionsTarget, 5);
  const junk = plain(device.win.VTSync.mergeBag({ v: 1, profileId: "default", goals: { weeklySessionsTarget: 5, updatedAt: "2026-11-01T10:00:00.000Z" } }, { goals: { weeklySessionsTarget: MARKUP, updatedAt: "2099-01-01T00:00:00.000Z" } }));
  assert.equal(junk.goals.weeklySessionsTarget, 5, "a goal that is not a number does not replace the one set here");
  const ahead = plain(device.win.VTSync.mergeBag({ v: 1, profileId: "default", goals: { weeklySessionsTarget: 5, updatedAt: "2026-11-01T10:00:00.000Z" } }, { goals: { weeklySessionsTarget: 7, updatedAt: "2099-01-01T00:00:00.000Z" } }));
  assert.equal(ahead.goals.weeklySessionsTarget, 5, "a goal dated 2099 does not win every later merge");
});

test("two devices that each did three takes since they last met count six sessions, not three", async () => {
  const worker = createWorker();
  const phone = createBrowser(worker);
  const laptop = createBrowser(worker);
  await phone.signIn("one@example.test");
  await laptop.signIn("one@example.test");
  for (let i = 0; i < 3; i += 1) phone.take(`phone-${i}`);
  for (let i = 0; i < 3; i += 1) laptop.take(`laptop-${i}`);
  assert.equal((await phone.win.VTSync.syncNow()).ok, true);
  assert.equal((await laptop.win.VTSync.syncNow()).ok, true);
  assert.equal((await phone.win.VTSync.syncNow()).ok, true);
  for (const device of [phone, laptop]) {
    const r = plain(device.win.VTStorage.getProgress())["ex-1"];
    assert.equal(r.history.length, 6);
    assert.equal(r.completedCount, 6, "the count is never lower than the takes listed");
  }
});

test("control: a count above the takes kept still wins (the history is capped)", () => {
  const device = createBrowser(createWorker());
  const merged = plain(device.win.VTSync.mergeProgress({ ex: row(9, "a", "b") }, { ex: row(2, "a") }));
  assert.equal(merged.ex.completedCount, 9);
  assert.equal(merged.ex.history.length, 2);
});

test("the exported merges take a list stored as an object or a number without throwing", () => {
  const device = createBrowser(createWorker());
  const { mergeLog, mergeProgress } = device.win.VTSync;
  assert.deepEqual(plain(mergeLog({ a: { at: "2026-11-10T10:00:00.000Z", seconds: 2 } }, 5, 10)), [{ at: "2026-11-10T10:00:00.000Z", seconds: 2 }]);
  const merged = plain(mergeProgress({ ex: { ...row(1), history: {} } }, { ex: row(1, "kept") }));
  assert.deepEqual(merged.ex.history.map((h) => h.notes), ["kept"]);
});
