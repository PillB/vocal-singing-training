/**
 * Learner flows found by the 2026-11-18 red team (FLOW-1 to FLOW-10, stream "flows"): what the learner was
 * told, kept and able to reach at the moments a flow changes hands. Each test models the wrong behaviour it
 * was written against, and its mutant in the "learner" set of qa/mutate.mjs puts that behaviour back.
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise } = require("./helpers/e2e");

/** The page's clock, paused a moment ahead, so a take lasts exactly what the test fast-forwards. */
async function ownClock(page) {
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 10000));
}

/** A started take of `ms` on the test's clock, then Stop. */
async function takeOf(page, ms) {
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => VTApp.getState().practiceLive)).toBe(true);
  await page.clock.fastForward(ms);
  await page.locator("#btn-practice-stop").click();
  await expect.poll(() => page.evaluate(() => VTApp.getState().practiceLive)).toBe(false);
}

/* —— FLOW-10: the short-take hint —— */

test.describe("FLOW-10 the short-take hint", () => {
  test("after a started 14 s take it asks for 1 more second, without telling the learner to press Start", async ({ page }) => {
    await page.clock.install();
    await boot(page, { lang: "en", mic: "silent" });
    await openExercise(page, "s4-lip-trills");
    // Control: before any Start the hint does tell the learner to press Start (that is the case it is for).
    await page.locator("#btn-toggle-metrics").click();
    await expect(page.locator("#rate-note")).toContainText("Press Start");
    await ownClock(page);
    await takeOf(page, 14000);
    await page.locator('.rate-btn[data-feel="ok"]').click();
    const note = page.locator("#rate-note");
    await expect(note).toHaveText(/\b1 more second\b(?!s)/);
    await expect(note).not.toContainText("Press Start");
  });

  test("in Spanish a started take is not told to press Empezar first, and a short one still says how long", async ({ page }) => {
    await page.clock.install();
    await boot(page, { lang: "es", mic: "silent" });
    await openExercise(page, "s4-lip-trills");
    await ownClock(page);
    await takeOf(page, 10000);
    await page.locator('.rate-btn[data-feel="ok"]').click();
    const note = page.locator("#rate-note");
    await expect(note).toContainText("5 s");
    await expect(note).not.toContainText("pulsa Empezar");
  });

  test("in English five seconds short reads in the plural", async ({ page }) => {
    await page.clock.install();
    await boot(page, { lang: "en", mic: "silent" });
    await openExercise(page, "s4-lip-trills");
    await ownClock(page);
    await takeOf(page, 10000);
    await page.locator('.rate-btn[data-feel="hard"]').click();
    await expect(page.locator("#rate-note")).toContainText("5 more seconds");
  });
});
