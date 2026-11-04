/**
 * QA round 4, r9/toast: a toast is painted above every dialog, the Pro dialog included.
 *
 * Goal (styles.css, on `.toast`'s z-index: "Above every overlay: the dialogs (.modal-overlay 100, pricing 120, account
 * 125) and the tour (10000-10002). At 100 the pricing toasts drew under the pricing overlay, so Suscribirse and the trial
 * looked dead."): the answer to a click in a dialog is a toast, and it must be seen.
 *
 * Why this file: put the z-index back to 100 (the documented bug) and every toast spec, and pricing-prelaunch, pass:
 * the toast is non-interactive (pointer-events: none), so no hit-test in any suite can see which one is on top, and no
 * spec raises a toast while a dialog is open.
 *
 * Oracle: what is painted on top at the toast's centre. The toast is made hit-testable for the probe alone
 * (pointer-events: auto, set by the test), then elementFromPoint at its centre must be the toast itself. Control: with
 * the toast not raised, the same point belongs to the dialog (so the dialog really covers it and "on top" means above it).
 */
const { test, expect } = require("@playwright/test");
const { boot } = require("./helpers/e2e");

async function openPricing(page) {
  // On a phone, Pro is in the header's "Más" menu
  if (await page.locator("#btn-more").isVisible()) await page.click("#btn-more");
  await page.click("#btn-pricing");
  await expect(page.locator("#pricing-modal")).toBeVisible();
}

for (const vp of [
  { width: 360, height: 780 },
  { width: 1280, height: 800 }
]) {
  test(`${vp.width}px: a toast raised while the Pro dialog is open is painted above it`, async ({ page }) => {
    await page.setViewportSize(vp);
    await boot(page, { lang: "es" });
    await openPricing(page);
    await page.waitForTimeout(400);
    // Where the toast will stand: raise it, note the centre, and drop it again for the control
    const point = await page.evaluate(() => {
      sessionStorage.removeItem("vt_e2e");
      window.VTToast("Aún no disponible", { durationMs: 600000 });
      document.getAnimations().forEach((a) => a.finish());
      const r = document.getElementById("toast").getBoundingClientRect();
      return { x: Math.round((r.left + r.right) / 2), y: Math.round((r.top + r.bottom) / 2) };
    });
    await expect(page.locator("#toast")).toHaveClass(/show/);
    const top = await page.evaluate(({ x, y }) => {
      const t = document.getElementById("toast");
      // The toast is non-interactive by design; the probe alone makes it testable
      t.style.pointerEvents = "auto";
      const el = document.elementFromPoint(x, y);
      t.style.pointerEvents = "";
      return { isToast: el === t || t.contains(el), tag: el ? `${el.tagName}#${el.id}.${el.className}` : null };
    }, point);
    expect(top.isToast, `at (${point.x}, ${point.y}) the top element is ${top.tag}, not the toast`).toBe(true);

    // Control: the dialog does cover that point once the toast is gone
    await page.evaluate(() => {
      document.getElementById("toast").classList.remove("show");
    });
    const under = await page.evaluate(({ x, y }) => {
      const t = document.getElementById("toast");
      t.style.pointerEvents = "none";
      const el = document.elementFromPoint(x, y);
      return !!el && !!el.closest("#pricing-modal");
    }, point);
    expect(under, "control: the Pro dialog covers the toast's place").toBe(true);
  });
}
