/**
 * The nightly mouse sweep (tests/headed-exercise-forensics.spec.js) presses
 * Start where clickablePoint (tests/helpers/ui-forensics.js) says a person can.
 * It used to press Start's centre wherever it was: in a 1280x560 window, with
 * the rating card open (the sweep opens it a step earlier, and the app scrolls
 * to it), v12-melodic-speech's Start sits under the sticky Back button. The
 * click went back to the plan and the report said "Start did not go live".
 * These run on every pull request, since the sweep itself runs only at night.
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise } = require("./helpers/e2e");
const { clickablePoint, practiceProbe } = require("./helpers/ui-forensics");

test.use({ viewport: { width: 1280, height: 560 } });

/** v12-melodic-speech as the sweep meets it before Start: rating open, page scrolled to it. */
async function startUnderTheHeader(page) {
  await boot(page, { lang: "es", tourDone: true, mic: "silent" });
  await openExercise(page, "v12-melodic-speech");
  await page.evaluate(() => document.getElementById("btn-toggle-metrics").click());
  // The app scrolls to the rating smoothly; wait until Start is where that leaves it, under the Back button.
  await expect
    .poll(() =>
      page.evaluate(() => {
        const s = document.getElementById("btn-practice-start").getBoundingClientRect();
        return document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2)?.id;
      })
    )
    .toBe("btn-back-home");
}

test.describe("The mouse sweep's Start", () => {
  test("a Start under the sticky header is scrolled to and pressed, not the Back button over it", async ({ page }) => {
    await startUnderTheHeader(page);

    const p = await clickablePoint(page, "#btn-practice-start");

    expect(p?.covered, JSON.stringify(p)).toBeUndefined();
    await page.mouse.click(p.x, p.y);
    await expect.poll(async () => (await practiceProbe(page)).live, { timeout: 7000 }).toBe(true);
    await expect(page.locator("#view-exercise")).toHaveClass(/\bactive\b/);
  });

  test("negative control: a Start still covered once scrolled to is not pressed, and says what covers it", async ({ page }) => {
    await startUnderTheHeader(page);
    await page.evaluate(() => {
      const cover = document.createElement("div");
      cover.id = "sweep-cover";
      cover.style.cssText = "position:fixed;inset:0;z-index:2147483646";
      document.body.appendChild(cover);
    });

    const p = await clickablePoint(page, "#btn-practice-start");

    expect(p).toEqual({ covered: { id: "sweep-cover", tag: "DIV", cls: "" } });
  });
});
