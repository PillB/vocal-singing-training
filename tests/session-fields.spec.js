// r9/storage killer for S4 (usable() repairs completedIds only when it is falsy). Drop-in for tests/.
// Goal (QA-44): a stored session is handed to its callers only with the fields they dereference, and `completedIds` is the one
// the module repairs because markCurrentComplete does `.includes` and `.push` on it. Repaired means "is a list", not "is truthy":
// a string, a number, `true` or an object are all truthy and all break `.push` / `.includes`.
// corrupt-storage.spec.js only ever DELETES completedIds, so a truthiness check passes it.
// Right: whatever is stored under completedIds, get() returns a list and a step can be completed.
// Wrong: `completedIds: "v1-breath-flow"` -> "s.completedIds.push is not a function"; `{}` or 5 -> "includes is not a function".
const { test, expect } = require("@playwright/test");

const GOOD = { mode: "structured", track: "vocal", path: "basic", order: ["v1-breath-flow", "v2-lip-trill"], index: 1, status: "active" };

async function boot(page, session) {
  await page.addInitScript((s) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      sessionStorage.setItem("vt_e2e", "1");
      localStorage.setItem("vt_session_v1", JSON.stringify(s));
    } catch { /* blocked */ }
  }, session);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTSession, null, { timeout: 10000 });
}

test("control: a stored list of completed steps is kept and extended", async ({ page }) => {
  await boot(page, { ...GOOD, completedIds: ["v1-breath-flow"] });
  const r = await page.evaluate(() => {
    const next = window.VTSession.markCurrentComplete();
    return { completedIds: next.completedIds, index: next.index };
  });
  expect(r).toEqual({ completedIds: ["v1-breath-flow", "v2-lip-trill"], index: 2 });
});

for (const bad of ["v1-breath-flow", 5, true, {}, { "0": "v1-breath-flow" }]) {
  test(`a stored session whose completedIds is ${JSON.stringify(bad)} reads as a list and a step can be completed`, async ({ page }) => {
    await boot(page, { ...GOOD, completedIds: bad });
    const r = await page.evaluate(() => {
      try {
        const got = window.VTSession.get();
        const isList = Array.isArray(got && got.completedIds);
        const next = window.VTSession.markCurrentComplete();
        return { ok: true, isList, completedIds: next.completedIds, index: next.index };
      } catch (e) { return { ok: false, err: String(e.message) }; }
    });
    expect(r).toEqual({ ok: true, isList: true, completedIds: ["v2-lip-trill"], index: 2 });
  });
}
