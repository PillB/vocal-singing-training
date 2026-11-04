/**
 * QA round 4, r9/toast: in the row, the toast is as wide as the free span between ← Back and Help, up to 560 px.
 *
 * Goal (placeInRow's comment: "In the title's own place (from its left edge, up to 560 px)"): on a phone the span
 * is the whole gap; on a desktop, where the row is 1 000 px of nothing, the toast is a 560 px pill and not a bar
 * across the page. `.toast.in-row` is `width: 100%` under that max-width, so the toast IS that width, short message
 * or not, and the width is therefore a plain, exact thing to measure.
 *
 * Why this file: the cap is only asserted by accident. Removing it (`Math.min(560, ...)` -> the span) fails
 * toast-placement's "wraps to two lines" control at 1280 px (the long text stops wrapping, 22 px tall, expected > 30),
 * and no spec states the number: with the cap at 800 all 46 toast specs pass.
 *
 * Oracle: min(560, the gap between ← Back and Help as their rectangles say it, with the 6 px the design leaves each
 * side), measured on the page, within 2 px. Controls: the toast is in the row, and at 1280 px the gap really exceeds
 * 560 (so the cap is what is being measured), at 360 px it really is under it (so the span is).
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise } = require("./helpers/e2e");

for (const lang of ["es", "en"]) {
  for (const [vp, capped] of [
    [{ width: 1280, height: 800 }, true],
    [{ width: 360, height: 780 }, false]
  ]) {
    test(`${lang} ${vp.width}px: the toast in the row is min(560 px, the span between ← Back and Help) wide`, async ({ page }) => {
      await page.setViewportSize(vp);
      await boot(page, { lang });
      await openExercise(page, "v1-diction");
      await page.waitForTimeout(600); // the entrance animation moves the row for ~150 ms
      await page.evaluate(() => {
        sessionStorage.removeItem("vt_e2e");
        window.VTToast(document.documentElement.lang === "es" ? "Guardado" : "Saved", { durationMs: 600000 });
      });
      await expect(page.locator("#toast")).toHaveClass(/show/);
      const m = await page.evaluate(() => {
        document.getAnimations().forEach((a) => a.finish());
        const R = (s) => document.querySelector(s).getBoundingClientRect();
        const t = document.getElementById("toast");
        return {
          inRow: t.classList.contains("in-row"),
          width: t.getBoundingClientRect().width,
          span: R(".ex-header-actions").left - 6 - (R("#btn-back-home").right + 6)
        };
      });
      expect(m.inRow, "control: in the row").toBe(true);
      if (capped) expect(m.span, "control: the gap is wider than the cap, so the cap decides").toBeGreaterThan(600);
      else expect(m.span, "control: the gap is narrower than the cap, so the gap decides").toBeLessThan(540);
      const want = Math.min(560, m.span);
      expect(Math.abs(m.width - want), `toast ${Math.round(m.width)} px wide, expected ${Math.round(want)} (span ${Math.round(m.span)})`).toBeLessThanOrEqual(2);
    });
  }
}
