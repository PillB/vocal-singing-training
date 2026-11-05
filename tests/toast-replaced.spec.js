/**
 * QA round 4, r9/toast: a toast raised while another is up gets its OWN time, not what is left of the first one's.
 *
 * Goal (toast(): "Long enough to read"; tests/toast-placement.spec.js pins the 2,8 s floor for a message raised on
 * its own): every message stays up for its full read time from the moment it is raised. The case that matters in
 * the app: "Live: pitch" is raised at Start, the take's summary at Stop a second or two later. toast() restarts the
 * timer with `clearTimeout(toast._t)` before arming a new one. Mutant M5 deletes that line: the first message's timer
 * is still armed and hides the second one early (a 54-character summary that needs 4,2 s is cut after 1,3 s).
 * The whole toast suite stayed green (46 passed): every spec raises one toast, or raises the next after the first
 * has already faded.
 *
 * Time is the page's fake clock, paused, so the margins are exact: first "Uno" at 0 (floor 2 800 ms), second at
 * 1 500 ms with a 54-character text (read time 1 500 + 54 * 50 = 4 200 ms, so due at 5 700 ms). Measured at 3 000 ms
 * (past the first's timer, which fires at 2 800 ms with the mutant), at 5 600 ms (still inside) and at 5 900 ms
 * (past it). Control: with a single toast the same text is up at 4 100 ms and gone at 4 400 ms, so the read-time
 * formula the expected values rest on is the page's, measured, not assumed.
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise } = require("./helpers/e2e");

const SECOND = "Toma 2: ritmo parejo, seis frases, ninguna se corta ya"; // 54 characters, asserted below

async function setup(page) {
  await page.clock.install();
  await boot(page, { lang: "es" });
  await openExercise(page, "v1-diction");
  // Paused: fake time moves by runFor() alone
  await page.clock.pauseAt(new Date(Date.now() + 60000));
  await page.evaluate(() => sessionStorage.removeItem("vt_e2e"));
}

const shown = (page) => page.locator("#toast").evaluate((t) => t.classList.contains("show"));

test("control: one long message is up for its own read time (1,5 s + 50 ms a letter)", async ({ page }) => {
  expect(SECOND.length).toBe(54);
  await setup(page);
  await page.evaluate((t) => window.VTToast(t), SECOND);
  expect(await shown(page)).toBe(true);
  await page.clock.runFor(4100); // 1 500 + 54 * 50 = 4 200
  expect(await shown(page), "up at 4,1 s").toBe(true);
  await page.clock.runFor(300);
  expect(await shown(page), "gone at 4,4 s").toBe(false);
});

test("a message raised while another is up stays for its own read time, not for what is left of the first one's", async ({ page }) => {
  await setup(page);
  await page.evaluate(() => window.VTToast("Uno"));
  expect(await shown(page)).toBe(true);
  await page.clock.runFor(1500);
  await page.evaluate((t) => window.VTToast(t), SECOND);
  await expect(page.locator("#toast")).toHaveText(SECOND);
  await page.clock.runFor(1500); // 3,0 s: the first message's 2,8 s are over
  expect(await shown(page), "at 3,0 s the second message (raised at 1,5 s) is up, whatever the first one's timer says").toBe(true);
  await page.clock.runFor(2600); // 4,1 s after the second was raised, 4 200 are its read time
  expect(await shown(page), "still up 4,1 s after it was raised").toBe(true);
  await page.clock.runFor(300);
  expect(await shown(page), "control: and gone after its read time").toBe(false);
});
