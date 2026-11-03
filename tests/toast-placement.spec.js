/**
 * Where a toast lands while an exercise is open, how long it stays, and
 * where the take's summary can still be read once it has gone.
 *
 * Wrong behaviours rejected (found by the forensic audit's phone run):
 * - The toast sat centred under the header, which in an exercise is the row
 *   with ← Back and Help. At phone widths it covered both (the audit's
 *   screenshot read "← Pra[⏹ Ladder approx.: 100% · 1 min]Help"), right after
 *   Stop, when going back is the likeliest next step.
 * - Let to wrap freely in the narrow space between them, a long summary ran
 *   five lines down over the stage's strip (320 px, Spanish).
 * - Placed over the title but shorter than it, it left the title's top line
 *   peeking out above it: the title now steps back while the toast is up.
 * - The summary existed only in a toast that left after 2,8 s whatever its
 *   length: 58 characters of numbers cannot be read in that time, and once
 *   it had gone it could not be read at all.
 * Controls: the toast really showed (so "covers nothing" is not vacuous), and
 * a short message still leaves at 2,8 s.
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise, startPractice } = require("./helpers/e2e");

const VIEWPORTS = [
  { width: 320, height: 640 },
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 1280, height: 800 }
];

/** Stop the take with toasts on (the e2e flag mutes them) and read the toast against its neighbours. */
async function stopAndMeasure(page) {
  await page.evaluate(() => sessionStorage.removeItem("vt_e2e"));
  await page.locator("#btn-practice-stop").click();
  await expect(page.locator("#toast")).toHaveClass(/show/);
  return measureToast(page);
}

/** Where the shown toast sits against ← Back, Help, the header row and the window. */
function measureToast(page) {
  return page.evaluate(() => {
    const t = document.getElementById("toast");
    // CSS transitions run on the wall clock, not the test's: end them
    document.getAnimations().forEach((a) => a.finish());
    const R = (el) => el.getBoundingClientRect();
    const tr = R(t);
    const hit = (b) => b.width > 0 && tr.left < b.right && tr.right > b.left && tr.top < b.bottom && tr.bottom > b.top;
    const row = R(document.querySelector(".exercise-header-compact"));
    const sum = document.getElementById("rate-sum");
    return {
      text: t.textContent,
      back: hit(R(document.getElementById("btn-back-home"))),
      help: hit(R(document.querySelector(".ex-header-actions"))),
      height: Math.round(tr.height),
      inRow: tr.top >= row.top - 1 && tr.bottom <= row.bottom + 1,
      inView: tr.left >= 0 && tr.right <= innerWidth,
      kept: sum && !sum.hidden ? sum.textContent : null,
      titleOpacity: getComputedStyle(document.querySelector(".ex-title-row")).opacity,
      keptWhole: !!sum && sum.scrollWidth <= sum.clientWidth + 1 && getComputedStyle(sum).textOverflow !== "ellipsis"
    };
  });
}

async function takeAndStop(page, vp, lang) {
  await page.clock.install();
  await page.setViewportSize(vp);
  await boot(page, { lang });
  await openExercise(page, "v1-diction");
  await startPractice(page);
  await page.clock.runFor(1500);
  return stopAndMeasure(page);
}

for (const lang of ["es", "en"]) {
  for (const vp of VIEWPORTS) {
    test(`${lang} ${vp.width}x${vp.height}: the Stop toast stays in the row between ← Back and Help; the summary stays readable`, async ({ page }) => {
      const m = await takeAndStop(page, vp, lang);
      expect(m.text, "the toast showed the take's summary").toMatch(/^⏹ \S/);
      expect(m.back, `"${m.text}" covers ← Back`).toBe(false);
      expect(m.help, `"${m.text}" covers Help`).toBe(false);
      expect(m.inRow, "inside the row, off the stage's strip").toBe(true);
      // The title steps back under it, not half-hidden beside it
      expect(m.titleOpacity).toBe("0");
      expect(m.inView).toBe(true);
      // Whatever the toast had to cut, the card keeps whole
      expect(m.kept, "the summary is kept in the rating card").toContain(m.text.replace(/^⏹ /, ""));
      expect(m.keptWhole).toBe(true);
    });
  }
}

// Found by CI, not by the audit: the runner draws "Segoe UI, system-ui" in DejaVu Sans,
// which is wider than the font this was written in, so the summary wrapped to two
// lines and the toast (42 px) stood out of the 39 px desktop row by 1.5 px each side.
// A text that needs two lines at any font makes that the case being tested.
const TWO_LINES =
  "Esta toma: una frase larga que no cabe en una sola linea de la fila, con numeros 100% 12 s 3 reps 2 min, para que se parta en dos lineas";

for (const vp of [VIEWPORTS[0], VIEWPORTS[2], VIEWPORTS[3]]) {
  test(`${vp.width}x${vp.height}: a toast that wraps to two lines still fits inside the header row`, async ({ page }) => {
    await page.setViewportSize(vp);
    await boot(page, { lang: "es" });
    await openExercise(page, "v1-diction");
    await page.evaluate((t) => {
      sessionStorage.removeItem("vt_e2e");
      window.VTToast(t);
    }, TWO_LINES);
    await expect(page.locator("#toast")).toHaveClass(/show/);
    const m = await measureToast(page);
    expect(m.height, "control: the toast really wrapped (a one-line toast would pass anything)").toBeGreaterThan(30);
    expect(m.inRow, `${m.height} px tall, inside the row`).toBe(true);
    expect(m.back).toBe(false);
    expect(m.help).toBe(false);
  });
}

test("a long summary stays long enough to read; a short message still leaves at 2,8 s", async ({ page }) => {
  const m = await takeAndStop(page, { width: 360, height: 780 }, "es");
  expect(m.text.length, "the summary is a long one").toBeGreaterThan(40);
  await page.clock.runFor(3300);
  await expect(page.locator("#toast"), "still up at 3,3 s, past the old 2,8").toHaveClass(/show/);
  await page.clock.runFor(5000);
  await expect(page.locator("#toast"), "gone by 8 s").not.toHaveClass(/show/);
  // ...and the title comes back with it
  await expect(page.locator(".exercise-header-compact")).not.toHaveClass(/toast-over/);
  // Control: a short message keeps the old 2,8 s
  await openExercise(page, "s9-pitch-match");
  const shown = await page.evaluate(() => {
    window.VTApp.getState().pitchGame.onLock?.("A2", "C3");
    const t = document.getElementById("toast");
    return t.classList.contains("show") ? t.textContent : null;
  });
  expect(shown, "the lock toast showed").not.toBeNull();
  expect(shown.length).toBeLessThan(30);
  await page.clock.runFor(2900);
  await expect(page.locator("#toast"), `"${shown}" gone after 2,8 s`).not.toHaveClass(/show/);
});
