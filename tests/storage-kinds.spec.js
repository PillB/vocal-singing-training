// r9/storage killer for S1 (kindOf stops telling an array from an object). Drop-in for tests/.
// Goal (QA-35): a stored value of another KIND than the one a reader's callers use is treated as missing. "Array" and "object"
// are different kinds: hold logs / reviews are lists, progress / settings / achievements are keyed bags. corrupt-storage.spec.js
// seeds null, 42 and (for the session only, which usable() shields) an array, but never an array where a bag belongs or a bag where
// a list belongs, so a kindOf that says "object" for both passes all of it.
// Wrong: a bag where a list belongs reaches `all.unshift(...)` and addHoldLog throws; a list where the progress bag belongs takes
// the new take as an array property, JSON.stringify drops it, and the take that was just saved is gone.
// Expected values come from the goal (what the callers dereference), not from the reader.
const { test, expect } = require("@playwright/test");

async function boot(page, seed) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  await page.addInitScript((s) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      sessionStorage.setItem("vt_e2e", "1");
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    } catch { /* storage blocked */ }
  }, seed);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && !!window.VTStorage, null, { timeout: 10000 });
  return errors;
}

test("control: a list stored as a list and a bag stored as a bag are read as they are", async ({ page }) => {
  await boot(page, {
    vt_hold_logs_v1: JSON.stringify([{ at: "2026-01-01T00:00:00.000Z", seconds: 7 }]),
    vt_progress_v1: JSON.stringify({ "v1-breath-flow": { completedCount: 3, history: [], lastScore: null, lastAt: null } })
  });
  const r = await page.evaluate(() => ({ holds: window.VTStorage.getHoldLogs(), progress: window.VTStorage.getProgress() }));
  expect(r.holds).toEqual([{ at: "2026-01-01T00:00:00.000Z", seconds: 7 }]);
  expect(r.progress["v1-breath-flow"].completedCount).toBe(3);
});

for (const [key, getter, wants, stored] of [
  ["vt_hold_logs_v1", "getHoldLogs", "list", '{"a":1}'],
  ["vt_reviews_v1", "getReviews", "list", '{"a":1}'],
  ["vt_progress_v1", "getProgress", "bag", "[1,2]"],
  ["vt_achievements_v1", "getAchievementFlags", "bag", "[1,2]"],
  ["vt_settings_v1", "getSettings", "bag", "[1,2]"]
]) {
  test(`${key} = ${stored}: ${getter}() hands back ${wants === "list" ? "a list" : "a keyed bag"}, not what is stored`, async ({ page }) => {
    await boot(page, { [key]: stored });
    const r = await page.evaluate((g) => {
      const v = window.VTStorage[g]();
      return { isArray: Array.isArray(v), isObject: v !== null && typeof v === "object" };
    }, getter);
    if (wants === "list") expect(r.isArray).toBe(true);
    else expect(r).toEqual({ isArray: false, isObject: true });
  });
}

test("a hold saved over a stored bag (not a list) is kept, and does not throw", async ({ page }) => {
  await boot(page, { vt_hold_logs_v1: '{"a":1}' });
  const r = await page.evaluate(() => {
    try {
      window.VTStorage.addHoldLog(9);
      return { ok: true, seconds: window.VTStorage.getHoldLogs().map((h) => h.seconds) };
    } catch (e) { return { ok: false, err: String(e.message) }; }
  });
  expect(r).toEqual({ ok: true, seconds: [9] });
});

test("a take saved over a stored list (not the progress bag) is still there afterwards", async ({ page }) => {
  await boot(page, { vt_progress_v1: "[1,2]" });
  const r = await page.evaluate(() => {
    window.VTStorage.saveExerciseResult("v1-breath-flow", { score: 4, durationSec: 30 });
    const row = window.VTStorage.getProgress()["v1-breath-flow"];
    return row && { completedCount: row.completedCount, n: row.history.length };
  });
  expect(r).toEqual({ completedCount: 1, n: 1 });
});
