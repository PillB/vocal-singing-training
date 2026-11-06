/**
 * Mobile and desktop entry controls must have a real hit target.
 * A non-hidden button inside a display:none ancestor is not a valid Start.
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise, centerHitsSelf } = require("./helpers/e2e");

for (const viewport of [
  { width: 390, height: 844 },
  { width: 844, height: 390 },
  { width: 1280, height: 800 }
]) {
  test(`Start remains visible and clickable across exercises at ${viewport.width}×${viewport.height}`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize(viewport);
    await boot(page, { lang: "es", tourDone: true, mic: "silent" });
    for (const id of ["v1-diction", "s15-sh-air-ladder", "s9-pitch-match", "s2-solfege-chords"]) {
      await openExercise(page, id);
      // Reproduce the exact regression: an overlay cleaner ends an inactive
      // tour. Before the fix, VTTour.end() silently navigated to Home.
      await page.evaluate(() => window.VTTour.end());
      await expect(page.locator("#view-exercise"), `${id} must survive idle tour dismissal`)
        .toHaveClass(/active/);
      const start = page.locator("#btn-practice-start");
      await expect(start, `${id} must offer a rendered Start`).toBeVisible();
      await expect(start, `${id} Start must be enabled`).toBeEnabled();
      const hit = await centerHitsSelf(page, "#btn-practice-start");
      expect(hit.ok, `${id} Start hit target: ${JSON.stringify(hit)}`).toBe(true);
      if (id === "v1-diction") {
        await start.click();
        await page.waitForTimeout(1200);
        const state = await page.evaluate(() => ({
          live: window.VTApp.getState().practiceLive,
          running: window.VTApp.getState().practice.running,
          starting: window.VTApp.getState().practiceStarting,
          status: document.querySelector("#mic-blocked-text")?.textContent,
          micBlocked: !document.querySelector("#mic-blocked")?.hidden,
          context: window.VTPiano.ctx?.state,
          primer: document.querySelector("#mic-primer")?.hidden === false
        }));
        expect(state.live, `${id} cannot start: ${JSON.stringify(state)}`).toBe(true);
        await page.locator("#btn-practice-stop").click();
      }
      await page.evaluate(() => window.VTApp.setView("home"));
    }
  });
}
