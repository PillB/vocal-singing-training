/**
 * QA round 4, r9/toast: three timers of toast() / hideToast() that tests/toast-placement.spec.js leaves open.
 * Each test names the wrong behaviour; time is the page's fake clock, paused, so the margins are exact.
 *
 *  M6  The faded toast's text is emptied 400 ms after it hides ("once the fade (0,25 s) is over", hideToast's own
 *      comment). Emptied after 200 ms, the text vanishes while the pill is still 20% visible and shrinking: an empty
 *      pill flashes. tests/toast-placement.spec.js "a faded toast leaves no message behind" only looks at 3,7 s and at
 *      the instants after a new message, never inside the fade (it passed with 200).
 *      Oracle: the fade is read from the page's computed transition-duration, not from app.js.
 *  M7  A message never stays more than 8 s on its own (the cap in `Math.min(8000, ...)`; the long-summary test says
 *      "gone by 8 s"). With the cap raised to 80 s a 133-character message (the two-line text the placement specs use)
 *      stays 8 s; a 400-character one for 21,5 s, over the content it covers. The placement specs pass with the cap
 *      at 80 000 because no message in them is long enough to reach it (the summary is ~58 characters, 4,4 s).
 *  M8  `durationMs` is the caller's choice and it wins both ways: the pricing toasts ask for 5,2 s, the profile switch
 *      for 1,6 s (under the 2,8 s floor, deliberately). Ignored, the first is cut at 2,8 s and the second is held
 *      to 2,8 s. No spec outside the toast ones passes durationMs, and the toast ones pass it only to keep a toast
 *      UP (600 000), where ignoring it is hidden by their short waits.
 * Controls: the same messages without the option follow the page's formula (1,5 s + 50 ms a character, floor 2,8 s),
 * so "up at X, gone at Y" is measured on this page and not assumed.
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise } = require("./helpers/e2e");

async function setup(page) {
  await page.clock.install();
  await boot(page, { lang: "es" });
  await openExercise(page, "v1-diction");
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.evaluate(() => sessionStorage.removeItem("vt_e2e"));
}

const shown = (page) => page.locator("#toast").evaluate((t) => t.classList.contains("show"));
const text = (page) => page.locator("#toast").evaluate((t) => t.textContent);

test("the text stays while the toast fades (0,25 s) and is gone once the fade is over", async ({ page }) => {
  await setup(page);
  const fadeMs = await page.locator("#toast").evaluate((t) => parseFloat(getComputedStyle(t).transitionDuration) * 1000);
  expect(fadeMs, "control: the page's fade is the 0,25 s the comment names").toBe(250);
  await page.evaluate(() => window.VTToast("Listo"));
  await page.clock.runFor(2800); // the floor: hidden now
  expect(await shown(page), "control: hidden").toBe(false);
  await page.clock.runFor(fadeMs - 10);
  expect(await text(page), "10 ms before the end of the fade the message is still readable").toBe("Listo");
  await page.clock.runFor(fadeMs + 150);
  expect(await text(page), "well after the fade it is emptied").toBe("");
});

test("a very long message does not outstay 8 s", async ({ page }) => {
  await setup(page);
  const longText = "Esta toma: " + "una frase larga que se queda en pantalla ".repeat(10); // ~420 characters
  expect(longText.length).toBeGreaterThan(300);
  await page.evaluate((t) => window.VTToast(t), longText);
  await page.clock.runFor(7500);
  expect(await shown(page), "control: still up at 7,5 s (formula: 21 s, capped)").toBe(true);
  await page.clock.runFor(1000);
  expect(await shown(page), "gone by 8,5 s").toBe(false);
});

test("the caller's durationMs wins: longer than the formula and shorter than the floor", async ({ page }) => {
  await setup(page);
  // Longer: 6 s asked, the formula says 2,8 s for five letters
  await page.evaluate(() => window.VTToast("Listo", { durationMs: 6000 }));
  await page.clock.runFor(5900);
  expect(await shown(page), "asked for 6 s: up at 5,9 s").toBe(true);
  await page.clock.runFor(200);
  expect(await shown(page), "and gone at 6,1 s").toBe(false);
  await page.clock.runFor(1000); // let the first one empty and fade completely
  // Shorter: 1,6 s asked (the profile switch), the floor says 2,8 s
  await page.evaluate(() => window.VTToast("Hecho", { durationMs: 1600 }));
  await page.clock.runFor(1500);
  expect(await shown(page), "asked for 1,6 s: still up at 1,5 s").toBe(true);
  await page.clock.runFor(200);
  expect(await shown(page), "gone at 1,7 s, not held to the 2,8 s floor").toBe(false);
  // Control: without the option the same message follows the formula
  await page.evaluate(() => window.VTToast("Hecho"));
  await page.clock.runFor(2700);
  expect(await shown(page), "control: no option, up at 2,7 s").toBe(true);
  await page.clock.runFor(200);
  expect(await shown(page), "control: gone at 2,9 s").toBe(false);
});
