/**
 * QA round 4, r9/toast: on the home view a toast stands under the sticky header, not on the navigation inside it.
 *
 * Goal (styles.css: "Under the sticky header, never on top of Practicar / Plan / Historial"): the header carries the
 * way to the other views; a toast that covers it, however briefly, hides the buttons the person wants after Start/Stop.
 * It is non-interactive (pointer-events: none) so it does not block the click, but it hides what is being clicked.
 *
 * Why this file: delete the `.toast.show { top: max(calc(var(--header-h) + .35rem), ...) }` rule and all 46 toast specs
 * pass. The base rule puts the toast at `top: .75rem`, i.e. over the header's nav (measured at 360 px: toast y=12..61,
 * nav y=6..56). The placement specs only measure toasts in an exercise, where JS writes `top` inline, and the
 * home-view toasts for their centre (x), never their y.
 *
 * Oracle: the rectangles of the page's own header and its navigation, measured, against the toast's. Controls: the
 * navigation really has size and the toast really is shown.
 */
const { test, expect } = require("@playwright/test");
const { boot } = require("./helpers/e2e");

for (const lang of ["es", "en"]) {
  for (const vp of [
    { width: 360, height: 780 },
    { width: 1280, height: 800 }
  ]) {
    test(`${lang} ${vp.width}px: a toast on the home view does not cover the header or its navigation`, async ({ page }) => {
      await page.setViewportSize(vp);
      await boot(page, { lang });
      await page.waitForTimeout(500);
      await page.evaluate(() => {
        sessionStorage.removeItem("vt_e2e");
        window.VTToast(document.documentElement.lang === "es" ? "Mensaje de prueba" : "Test message", { durationMs: 600000 });
      });
      await expect(page.locator("#toast")).toHaveClass(/show/);
      const m = await page.evaluate(() => {
        document.getAnimations().forEach((a) => a.finish());
        const R = (s) => document.querySelector(s).getBoundingClientRect();
        const t = R("#toast");
        const h = R("header.app-header");
        const n = R("header.app-header nav");
        const over = (b) => Math.min(t.right, b.right) - Math.max(t.left, b.left) > 1 && Math.min(t.bottom, b.bottom) - Math.max(t.top, b.top) > 1;
        return {
          shown: document.getElementById("toast").classList.contains("show"),
          navW: Math.round(n.width),
          navH: Math.round(n.height),
          toast: [t.left, t.top, t.right, t.bottom].map(Math.round),
          header: [h.left, h.top, h.right, h.bottom].map(Math.round),
          overNav: over(n),
          overHeader: over(h),
          gap: Math.round(t.top - h.bottom)
        };
      });
      expect(m.shown).toBe(true);
      expect(m.navW * m.navH, "control: the header's navigation has a size").toBeGreaterThan(0);
      expect(m.overNav, `toast ${m.toast} covers the navigation`).toBe(false);
      expect(m.overHeader, `toast ${m.toast} covers the header ${m.header}`).toBe(false);
      expect(m.gap, "starts just under the header, not far below it").toBeLessThanOrEqual(16);
    });
  }
}
