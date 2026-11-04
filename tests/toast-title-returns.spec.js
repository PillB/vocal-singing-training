/**
 * QA round 4, r9/toast: the exercise's title is hidden ONLY while a toast is up. Anything that happens after the
 * toast has gone (the window turning, the language switch, an animation ending) must leave the title alone.
 *
 * Goal (placeToast's comment: "the title steps back while the toast holds its place"; tests/toast-placement.spec.js
 * "...and the title comes back with it"): `toast-over` on the row, which makes the title transparent, exists exactly
 * as long as a toast is in the row. The follow-the-page handler (`again` in watchToastPlace) is installed with the
 * first toast and runs on every resize, every animationend and every change of the body's class for the rest of the
 * session. It re-places the toast only if it is up. Mutant M4 drops that `show` test: after the first toast of the
 * session has faded, the next resize / language switch / view change re-places the HIDDEN toast, placeInRow
 * puts `toast-over` on the row again, and the exercise's name is invisible with no toast anywhere. Every toast spec
 * stayed green (46 passed) because each of them either measures a toast that is up or reads `toast-over` once, before
 * anything else can happen.
 *
 * Expected values come from the goal and the DOM: the title's computed opacity is 1 when the toast is not shown.
 * Controls: the row really carried `toast-over` while the toast was up (so "gone" is a change), and the toast
 * really is gone (not shown) when it is measured.
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise } = require("./helpers/e2e");

const titleOpacity = (page) => page.evaluate(() => getComputedStyle(document.querySelector(".ex-title-row")).opacity);

async function upThenGone(page, lang) {
  await page.setViewportSize({ width: 360, height: 780 });
  await boot(page, { lang });
  await openExercise(page, "v1-diction");
  await page.waitForTimeout(500); // the entrance animation moves the row for ~150 ms
  // 400 ms is all the toast lasts: read the row in the same task that raises it
  const steppedBack = await page.evaluate(() => {
    sessionStorage.removeItem("vt_e2e");
    window.VTToast("Guardado", { durationMs: 400 });
    return document.querySelector(".exercise-header-compact").classList.contains("toast-over");
  });
  expect(steppedBack, "control: the title steps back while the toast is up").toBe(true);
  // gone: hidden after 400 ms, its title back (the transition is 0,2 s)
  await expect(page.locator("#toast")).not.toHaveClass(/show/);
  await expect.poll(() => titleOpacity(page), { message: "control: and comes back when the toast has gone" }).toBe("1");
}

test("the window turning after a toast has gone does not hide the title again", async ({ page }) => {
  await upThenGone(page, "es");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(500);
  expect(await page.locator("#toast").evaluate((t) => t.classList.contains("show")), "control: still no toast").toBe(false);
  await expect(page.locator(".exercise-header-compact"), "no toast is up, the title is not stepped back").not.toHaveClass(/toast-over/);
  expect(await titleOpacity(page)).toBe("1");
});

test("switching the language after a toast has gone does not hide the title again", async ({ page }) => {
  await upThenGone(page, "en");
  await page.evaluate(() => document.getElementById("btn-lang").click());
  await page.waitForTimeout(600);
  expect(await page.locator("#toast").evaluate((t) => t.classList.contains("show")), "control: still no toast").toBe(false);
  await expect(page.locator(".exercise-header-compact")).not.toHaveClass(/toast-over/);
  expect(await titleOpacity(page)).toBe("1");
});
