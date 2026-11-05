/**
 * QA round 8c (PR #23 at 59ea565): CI `mutation (a11y)` is red because A18 ("a shown toast ignores the view changing
 * under it": the MutationObserver on <body class> in watchToastPlace) SURVIVES its killer, tests/toast-and-h1-gaps.spec.js "B".
 *
 * Why B cannot kill it: B asserts the toast does not cover Back or Help. A toast raised on the HOME view and never moved
 * stands under the header, which at 320 and 360 px is clear of both buttons anyway, so the assertion holds whether or not
 * the toast follows the view. Reduced motion (no animationend) and measuring without `getAnimations().finish()` were tried first
 * (this file's earlier V1/V2) and the mutant survived both too: the fault was the oracle, not the other triggers.
 *
 * Goal: a toast that is up when the view changes stands where a toast raised on the NEW view stands (in the row's title
 * place on the exercise view at 360 px: under the row for this long message since c657bdf, in it for a short one). The expected position comes from raising
 * the same toast fresh on the new view; nothing is computed by app.js.
 *   V3  default motion.   V4  reduced motion.   V5  every CSS animation and transition off, so `animationend` never fires.
 * Positive control: the unmutated tree passes both. Mutant A18 (delete the observer line) must fail both.
 */
const { test, expect } = require("@playwright/test");
const { boot } = require("./helpers/e2e");

const PAUSED = "Tienes una sesión en pausa — reanuda desde el aviso superior";

const where = (page) =>
  page.evaluate(() => {
    document.getAnimations().forEach((a) => a.finish());
    const el = document.getElementById("toast");
    const r = el.getBoundingClientRect();
    return { shown: el.classList.contains("show"), inRow: el.classList.contains("in-row"), box: [r.left, r.top, r.right, r.bottom].map(Math.round) };
  });

async function raisedOnHomeThenOpen(page, width, reduced) {
  const home = {};
  if (reduced) await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width, height: 800 });
  await boot(page, { lang: "es" });
  // V5: no CSS animation anywhere, so `animationend` never fires and only the body-class observer can re-place the toast
  if (reduced === "none") await page.addStyleTag({ content: "*,*::before,*::after{animation:none !important;transition:none !important}" });
  await page.evaluate(() => sessionStorage.removeItem("vt_e2e"));
  await page.waitForTimeout(400);
  await page.evaluate((t) => window.VTToast(t, { durationMs: 20000 }), PAUSED);
  await page.waitForTimeout(300);
  home.box = (await where(page)).box;
  await page.locator("#exercise-list .card-ex").first().click();
  await page.waitForSelector("#view-exercise.active");
  await page.waitForTimeout(900);
  return home;
}

for (const [name, reduced] of [["V3", false], ["V4 (reduced motion)", true], ["V5 (no CSS animation at all)", "none"]]) {
  test(`${name} 360px: a toast up when an exercise opens stands where a toast raised there stands`, async ({ page }) => {
    const home = await raisedOnHomeThenOpen(page, 360, reduced);
    const followed = await where(page);
    expect(followed.shown, "control: the toast is still up").toBe(true);
    // the reference: the very same toast raised afresh on this view
    await page.evaluate((t) => window.VTToast(t, { durationMs: 20000 }), PAUSED);
    await page.waitForTimeout(300);
    const fresh = await where(page);
    // control: the new view puts the toast somewhere else than the home view did, or this test could not tell following from staying
    const moved = fresh.box.some((v, i) => Math.abs(v - home.box[i]) > 2);
    expect(moved, `control: home ${home.box} and exercise ${fresh.box} differ`).toBe(true);
    expect(followed.inRow, "the toast raised on the home view is placed as a fresh one is after the view changed").toBe(fresh.inRow);
    for (let i = 0; i < 4; i += 1) {
      expect(Math.abs(followed.box[i] - fresh.box[i]), `box edge ${i}: followed ${followed.box} fresh ${fresh.box}`).toBeLessThanOrEqual(2);
    }
  });
}
