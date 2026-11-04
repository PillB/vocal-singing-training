/**
 * QA round 4, r9/toast: a toast never takes a click away from the control it stands over.
 *
 * Goal (styles.css, on `.toast`: "Non-interactive: must never steal elementFromPoint / clicks"; the file's other
 * comments say the toast stands just under the row, over the stage's strip, over the home page's first lines): the toast is
 * information, not a target. Under the row of an exercise it stands over the page for seconds; a click on what is
 * under it must reach what is under it.
 *
 * Why this file: delete `pointer-events: none` from `.toast` and all 46 toast specs pass; the suites that hit-test
 * (click-ui-*, fullscreen-all-clicks, hit-targets) remove or never raise the toast (the e2e flag mutes it, and they clear
 * `show` before measuring), so no spec ever clicks under a toast that is up.
 *
 * Oracle: a real mouse click at the toast's centre, with a capture listener recording what the click was aimed at.
 * Expected: not the toast. Controls: the toast has a size (the point is inside it) and exactly one click was recorded
 * (so the listener sees clicks and "not the toast" is a statement about a target that exists).
 */
const { test, expect } = require("@playwright/test");
const { boot } = require("./helpers/e2e");

for (const vp of [
  { width: 360, height: 780 },
  { width: 1280, height: 800 }
]) {
  test(`${vp.width}px: a click on the toast's place reaches the page under it, not the toast`, async ({ page }) => {
    await page.setViewportSize(vp);
    await boot(page, { lang: "es" });
    await page.waitForTimeout(500);
    await page.evaluate(() => {
      window.__hit = [];
      // Record what every click is aimed at; the page's own handlers run as usual
      document.addEventListener("click", (e) => window.__hit.push(e.target.closest("#toast") ? "TOAST" : e.target.tagName), true);
      sessionStorage.removeItem("vt_e2e");
      window.VTToast("Mensaje de prueba", { durationMs: 600000 });
    });
    await expect(page.locator("#toast")).toHaveClass(/show/);
    const c = await page.evaluate(() => {
      document.getAnimations().forEach((a) => a.finish());
      const r = document.getElementById("toast").getBoundingClientRect();
      return { x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, w: r.width, h: r.height };
    });
    expect(c.w * c.h, "control: the toast has a size").toBeGreaterThan(0);
    await page.mouse.click(c.x, c.y);
    const hit = await page.evaluate(() => window.__hit);
    expect(hit.length, "control: the click was recorded").toBe(1);
    expect(hit[0], "the click reached the page under the toast").not.toBe("TOAST");
  });
}
