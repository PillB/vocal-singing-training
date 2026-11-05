/**
 * QA round 4, r9/toast: outside the row a toast is as wide as its message (up to 90% of the window, 420 px), not as wide as
 * the half of the screen right of `left: 50%`.
 *
 * Goal (styles.css, `.toast { width: max-content }`: "Size to the message, not to the half of the screen right of
 * left:50%: without this a long toast on a phone wrapped into a narrow oval."): a toast on the home view, or under the
 * row, is one line when the message fits one line, and otherwise as wide as the cap allows.
 *
 * Why this file: delete that one declaration and all 46 toast specs pass (the wrapped-text spec only asks that the
 * under-row toast be TALLER than 45 px, which a narrow oval is more than ever; the home-view toast is only checked for
 * its centre). At 360 px the "available width" is 180 px, so a 35-character message wraps to two lines on the home view.
 *
 * Oracle: the natural width of the message is measured on the page with a probe span in the toast's own font, plus the
 * toast's own padding and border as computed; nothing is taken from app.js. Controls: the natural width really exceeds
 * the half-window (so "a narrow oval" and "one line" differ here) yet fits the cap, and for the long message exceeds
 * the cap (so the cap is what is measured).
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise } = require("./helpers/e2e");

// 28 characters: on one line wider than the half window (180 px) and narrower than the cap (324 px) in any font. The first
// version (37 characters, ~270 px bold in the font it was written in) measured 349 px in DejaVu Sans, the CI runner's font,
// past the cap, so the control "narrower than the cap" failed there.
const MEDIUM = "Mensaje de longitud media ok";
const LONG = "Toma 2: lento en cada idea clave (toca «Punto clave» al llegar) y un poco más vivo en los puentes.";

/** Raise a message and say how wide it stands against how wide it would on one line. */
async function wide(page, msg) {
  await page.evaluate((t) => {
    sessionStorage.removeItem("vt_e2e");
    window.VTToast(t, { durationMs: 600000 });
  }, msg);
  await expect(page.locator("#toast")).toHaveClass(/show/);
  return page.evaluate((t) => {
    document.getAnimations().forEach((a) => a.finish());
    const el = document.getElementById("toast");
    const cs = getComputedStyle(el);
    const probe = document.createElement("span");
    probe.textContent = t;
    probe.style.cssText = `position:absolute;visibility:hidden;white-space:nowrap;font:${cs.font};letter-spacing:${cs.letterSpacing}`;
    document.body.appendChild(probe);
    const natural = probe.getBoundingClientRect().width;
    probe.remove();
    const chrome = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight) + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    return {
      inRow: el.classList.contains("in-row"),
      width: el.getBoundingClientRect().width,
      oneLine: natural + chrome,
      cap: Math.min(innerWidth * 0.9, 420),
      half: innerWidth / 2
    };
  }, msg);
}

test("360px, home view: a message that fits one line stands on one line", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await boot(page, { lang: "es" });
  await page.waitForTimeout(400);
  const m = await wide(page, MEDIUM);
  expect(m.inRow, "control: the home view has no row").toBe(false);
  expect(m.oneLine, "control: one line is wider than the half window (what the narrow oval gets)").toBeGreaterThan(m.half);
  expect(m.oneLine, "control: and narrower than the cap").toBeLessThan(m.cap);
  expect(Math.abs(m.width - m.oneLine), `${Math.round(m.width)} px wide, the message needs ${Math.round(m.oneLine)} on one line`).toBeLessThanOrEqual(3);
});

test("360px, under the row: a message too long for one line is as wide as the cap, not a narrow oval", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 });
  await boot(page, { lang: "es" });
  await openExercise(page, "v1-diction");
  await page.waitForTimeout(600);
  const m = await wide(page, LONG);
  expect(m.inRow, "control: too long for two lines in the row, so it stands under it").toBe(false);
  expect(m.oneLine, "control: it needs more than the cap on one line").toBeGreaterThan(m.cap);
  expect(Math.abs(m.width - m.cap), `${Math.round(m.width)} px wide, the cap is ${Math.round(m.cap)}`).toBeLessThanOrEqual(3);
});
