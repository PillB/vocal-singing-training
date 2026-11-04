/**
 * QA round 4, r9/toast: a toast that leaves the exercise row must leave EVERY coordinate it was given there.
 *
 * Goal (placeToast's own comment and tests/toast-placement.spec.js "follows the page home"): a toast that is up when
 * the view changes under it "must not be left at the exercise row's old coordinates". The existing test only checks
 * the class (not in-row) and the horizontal centre. placeInRow writes four inline styles (left, top, max-width,
 * and the in-row class); placeUnderRow gives three of them back. Two mutants of placeUnderRow gave one back less and
 * every toast spec stayed green:
 *   M2  `el.style.removeProperty("max-width")` deleted: a message that follows you home keeps the width of the gap
 *       between ← Back and Help (a long message squeezed into the "narrow oval" the CSS comment calls a bug).
 *   M3  the `else el.style.removeProperty("top")` deleted: it keeps the row's vertical centre as its `top`
 *       (inline style beats the .toast.show rule) instead of standing just under the site header.
 *
 * The expected place is measured on a SECOND page that never had an exercise open, raising the same text on the home
 * view: nothing the first page's inline styles could have touched. Controls: the toast is really in the row before
 * it leaves, the row's coordinates really differ from the home ones (so "left behind" is a difference), and the
 * reference page's toast is really a single wrapped-free line (so the width comparison is not 0 = 0).
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise } = require("./helpers/e2e");

// 29 characters: one line under the header on a 360 px phone, two in the ~170 px gap of the exercise row, in any font. The
// first version (38 characters) needed three lines in DejaVu Sans, the CI runner's font, and the page rightly put it under
// the row, so the control "the toast stands in the row" failed on CI's font and passed on the font it was written in.
const TEXT = "Mensaje que sigue a la pagina";

const box = (page) =>
  page.evaluate(() => {
    document.getAnimations().forEach((a) => a.finish());
    const el = document.getElementById("toast");
    const r = el.getBoundingClientRect();
    return {
      shown: el.classList.contains("show"),
      inRow: el.classList.contains("in-row"),
      left: Math.round(r.left),
      top: Math.round(r.top),
      // the `top` the page wrote on the element itself (NaN when none): the coordinate that could be left behind
      styleTop: parseFloat(el.style.top),
      width: Math.round(r.width),
      height: Math.round(r.height)
    };
  });

async function raise(page, text) {
  await page.evaluate((t) => {
    sessionStorage.removeItem("vt_e2e");
    window.VTToast(t, { durationMs: 600000 });
  }, text);
  await expect(page.locator("#toast")).toHaveClass(/show/);
}

for (const vp of [
  { width: 360, height: 780 },
  { width: 390, height: 844 }
]) {
  test(`${vp.width}x${vp.height}: a toast followed home stands exactly where one raised on the home view stands`, async ({ page, context }) => {
    // Reference: the same message raised on the home view of a page that never opened an exercise
    const ref = await context.newPage();
    await ref.setViewportSize(vp);
    await boot(ref, { lang: "es" });
    await ref.waitForTimeout(600);
    await raise(ref, TEXT);
    const fresh = await box(ref);
    await ref.close();
    expect(fresh.inRow, "control: the reference is a home-view toast").toBe(false);

    await page.setViewportSize(vp);
    await boot(page, { lang: "es" });
    await openExercise(page, "v1-diction");
    await page.waitForTimeout(600); // the entrance animation moves the row for ~150 ms
    await raise(page, TEXT);
    const inRow = await box(page);
    expect(inRow.inRow, "control: in the exercise the toast stands in the row").toBe(true);
    expect(Math.abs(inRow.styleTop - fresh.top), "control: the row's y is not the home toast's y, or 'left behind' proves nothing").toBeGreaterThan(8);

    await page.locator("#btn-back-home").click();
    await expect(page.locator("#view-home")).toHaveClass(/active/);
    await expect(page.locator("#toast")).toHaveClass(/show/);
    await page.waitForTimeout(400);
    const home = await box(page);

    expect(home.inRow, "no longer in the row").toBe(false);
    expect(home.left, `centred as on the reference (x=${fresh.left})`).toBeGreaterThanOrEqual(fresh.left - 2);
    expect(home.left).toBeLessThanOrEqual(fresh.left + 2);
    expect(home.top, `just under the header as on the reference (y=${fresh.top}), not at the row's y=${inRow.styleTop}`).toBeGreaterThanOrEqual(fresh.top - 2);
    expect(home.top).toBeLessThanOrEqual(fresh.top + 2);
    expect(home.width, `as wide as the message needs (${fresh.width}), not as the gap between ← Back and Help (${inRow.width})`).toBeGreaterThanOrEqual(fresh.width - 2);
    expect(home.width).toBeLessThanOrEqual(fresh.width + 2);
    expect(home.height, `${fresh.height} px tall (the same lines)`).toBeGreaterThanOrEqual(fresh.height - 2);
    expect(home.height).toBeLessThanOrEqual(fresh.height + 2);
  });
}
