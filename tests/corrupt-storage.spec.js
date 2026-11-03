// QA-35. A localStorage key that holds valid JSON of the wrong type (null, a number, an array)
// must not stop the app from booting. Correct: the home screen renders its exercise cards and an
// exercise opens. Wrong: an uncaught TypeError at init leaves a blank page until site data is cleared.
// Sources of such a value in the wild: a sync write from the server, an import, another build's schema.
// Adopted from the QA thread (round 4 part C, QA-35). Control: a clean boot passes. Currently red for: vt_settings_v1 (null, 42), vt_progress_v1 (null),
// vt_hold_logs_v1 (42 at boot; null when the first exercise opens), vt_session_v1 (array, 42: usable but throws).
const { test, expect } = require("@playwright/test");

const CASES = [
  ["vt_settings_v1", "null"],
  ["vt_settings_v1", "42"],
  ["vt_progress_v1", "null"],
  ["vt_hold_logs_v1", "42"],
  ["vt_hold_logs_v1", "null"],
  ["vt_session_v1", "[1,2,3]"],
  ["vt_session_v1", "42"],
  // Added with the fix: the same class in the event log (js/analytics.js reads it on every tracked event)
  ["vt_analytics_v1", "null"],
  ["vt_analytics_v1", "42"],
  ["vt_analytics_v1", '{"events":5}']
];

async function boot(page, seed) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  await page.addInitScript((s) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      sessionStorage.setItem("vt_e2e", "1");
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    } catch {
      /* storage blocked */
    }
  }, seed);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp, null, { timeout: 10000 });
  return errors;
}

test("control: a clean boot renders the exercise cards and throws nothing", async ({ page }) => {
  const errors = await boot(page, {});
  await expect.poll(() => page.locator("[data-ex-id], .ex-card, .exercise-card, button.card").count(), { timeout: 8000 }).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});

for (const [key, value] of CASES) {
  test(`${key} = ${value}: the app still boots and throws nothing`, async ({ page }) => {
    const errors = await boot(page, { [key]: value });
    await expect.poll(() => page.locator("[data-ex-id], .ex-card, .exercise-card, button.card").count(), { timeout: 8000 }).toBeGreaterThan(3);
    // open the first exercise: some readers (hold history) only run there
    await page.evaluate(() => document.querySelector("[data-ex-id], .ex-card, .exercise-card, button.card").click());
    await page.waitForTimeout(600);
    expect(errors).toEqual([]);
  });
}
