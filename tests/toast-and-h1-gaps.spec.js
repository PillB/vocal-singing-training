/**
 * QA round 4, ui-a: falsifiable checks for the toast placement and the page's h1.
 * Each test names the wrong behaviour and carries a control, so "covers nothing"
 * is never vacuous. Copy to tests/ of a checkout and run with the repo config.
 *
 * Wrong behaviours (all observed on 0bd8b32):
 *  A. placeToast floors the toast's width at 120 px (Math.max(120, ...)); where
 *     the gap between Back and Help is under 132 px (280 px wide, or 320 px with
 *     text at 125%) the toast stands on top of Help for its whole life.
 *  B. placeToast runs once, when the toast is fired. A toast fired on the home
 *     view (the "session paused" toast fires on every load) and still up when an
 *     exercise opens stays centred under the header, over Back and Help.
 *  C. The same stale position after the language changes (Help gets wider).
 *  D. The only h1 sits in the site header, which a short landscape exercise hides
 *     with display: none: the page has no level-1 heading there (QA-04's class).
 *  E. QA-04 samples 320, 360 and 375; the cut at 374 is never run.
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise } = require("./helpers/e2e");

const PAUSED = {
  es: "Tienes una sesión en pausa — reanuda desde el aviso superior",
  en: "You have a paused session — resume from the banner above"
};

/** The toast against the controls of the exercise row, measured here, with nothing taken from app.js. */
const overlap = (page) =>
  page.evaluate(() => {
    document.getAnimations().forEach((a) => a.finish());
    const R = (e) => e.getBoundingClientRect();
    const t = R(document.getElementById("toast"));
    const hit = (e) => {
      const b = R(e);
      return b.width > 0 && Math.min(t.right, b.right) - Math.max(t.left, b.left) > 1 && Math.min(t.bottom, b.bottom) - Math.max(t.top, b.top) > 1;
    };
    return {
      shown: document.getElementById("toast").classList.contains("show"),
      back: hit(document.getElementById("btn-back-home")),
      help: hit(document.querySelector(".ex-header-actions")),
      toast: [t.left, t.top, t.right, t.bottom].map(Math.round),
      helpLeft: Math.round(R(document.querySelector(".ex-header-actions")).left)
    };
  });

async function openWithToastsOn(page, vp, lang, rootPct) {
  await page.setViewportSize(vp);
  await boot(page, { lang });
  if (rootPct && rootPct !== 100) await page.addStyleTag({ content: `html{font-size:${rootPct}% !important}` });
  await openExercise(page, "v1-diction");
  await page.waitForTimeout(600); // the view's entrance animation moves the row ~2 px for ~150 ms
  await page.evaluate(() => sessionStorage.removeItem("vt_e2e"));
}

for (const lang of ["es", "en"]) {
  for (const c of [
    { vp: { width: 360, height: 780 }, pct: 100, control: true },
    { vp: { width: 280, height: 640 }, pct: 100 },
    { vp: { width: 320, height: 640 }, pct: 125 }
  ]) {
    test(`A ${lang} ${c.vp.width}px at ${c.pct}% text: the toast leaves Help alone${c.control ? " (control: it is in the row)" : ""}`, async ({ page }) => {
      await openWithToastsOn(page, c.vp, lang, c.pct);
      await page.evaluate((t) => window.VTToast(t, { durationMs: 20000 }), PAUSED[lang]);
      await page.waitForTimeout(100);
      const m = await overlap(page);
      expect(m.shown, "the toast showed").toBe(true);
      expect(m.back, `toast ${m.toast} covers Back`).toBe(false);
      expect(m.help, `toast ${m.toast} covers Help, which starts at x=${m.helpLeft}`).toBe(false);
    });
  }
}

for (const w of [320, 360]) {
  test(`B ${w}px: a toast fired on the home view and still up when an exercise opens does not cover Back or Help`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 800 });
    await boot(page, { lang: "es" });
    await page.evaluate(() => sessionStorage.removeItem("vt_e2e"));
    await page.waitForTimeout(400);
    await page.evaluate((t) => window.VTToast(t, { durationMs: 20000 }), PAUSED.es);
    await page.locator("#exercise-list .card-ex").first().click();
    await page.waitForSelector("#view-exercise.active");
    await page.waitForTimeout(700);
    const m = await overlap(page);
    expect(m.shown, "control: the toast is still up").toBe(true);
    expect(m.back, `toast ${m.toast} covers Back`).toBe(false);
    expect(m.help, `toast ${m.toast} covers Help (x=${m.helpLeft})`).toBe(false);
  });
}

test("C 320px: switching to Spanish while a toast is up does not leave it over Help", async ({ page }) => {
  await openWithToastsOn(page, { width: 320, height: 640 }, "en", 100);
  await page.evaluate((t) => window.VTToast(t, { durationMs: 20000 }), "⏹ No pace measured yet — read aloud for a few seconds");
  await page.waitForTimeout(100);
  expect((await overlap(page)).help, "control: clear of Help before the switch").toBe(false);
  await page.evaluate(() => document.getElementById("btn-lang").click());
  await page.waitForTimeout(400);
  const m = await overlap(page);
  expect(m.help, `after the switch the toast ${m.toast} covers Help (x=${m.helpLeft})`).toBe(false);
});

for (const vp of [
  { width: 844, height: 390 },
  { width: 667, height: 375 }
]) {
  test(`D ${vp.width}x${vp.height}: an open exercise still has one level-1 heading in the accessibility tree`, async ({ page }) => {
    await page.setViewportSize(vp);
    await boot(page, { lang: "es" });
    // control: the home view at this size has its h1
    await expect(page.getByRole("heading", { level: 1 })).toHaveCount(1);
    await openExercise(page, "v1-diction");
    await expect(page.getByRole("heading", { level: 1 }), "the site header is display: none here").toHaveCount(1);
  });
}

for (const w of [373, 374, 375]) {
  test(`E ${w}px: brand hidden up to 374 and shown from 375, h1 named either way`, async ({ page }) => {
    await page.setViewportSize({ width: w, height: 740 });
    await boot(page);
    await expect(page.getByRole("heading", { level: 1 })).toHaveAccessibleName("Entrenamiento vocal y de canto");
    const shown = await page.locator(".app-header .brand").evaluate((b) => b.getBoundingClientRect().width > 2);
    expect(shown).toBe(w >= 375);
  });
}

// ---- Added with the fixes (QA round 4 part B) ----

// UIA-01: standing under the row must not make the message unreadable or leave it on the row
for (const c of [
  { vp: { width: 280, height: 640 }, pct: 100 },
  { vp: { width: 320, height: 640 }, pct: 125 }
]) {
  test(`A ${c.vp.width}px at ${c.pct}% text: where the row has no room the toast stands just under it, whole`, async ({ page }) => {
    await openWithToastsOn(page, c.vp, "es", c.pct);
    await page.evaluate((t) => window.VTToast(t, { durationMs: 20000 }), PAUSED.es);
    await page.waitForTimeout(100);
    const m = await page.evaluate(() => {
      document.getAnimations().forEach((a) => a.finish());
      const t = document.getElementById("toast").getBoundingClientRect();
      const row = document.querySelector(".exercise-header-compact").getBoundingClientRect();
      return { width: Math.round(t.width), below: Math.round(t.top - row.bottom), inView: t.left >= 0 && t.right <= innerWidth };
    });
    expect(m.width, "wide enough to read, not squeezed into the gap").toBeGreaterThanOrEqual(120);
    expect(m.below, "starts below the row").toBeGreaterThanOrEqual(0);
    expect(m.inView).toBe(true);
  });
}

// UIA-01 at its edge. Where the row's free span ends and the toast moves under it depends on the font (Help is wider in
// Spanish, the runner draws DejaVu), so the widths are not named: the page is swept 280 to 340 px in 5 px steps, the span
// is measured at each, and the rule is checked against what was measured: a span of 120 px or more holds the toast between
// ← Back and Help, a smaller one puts it 4 px under the row, whole. A threshold moved either way, or an offset that grew,
// breaks it at the widths that fall between; and both placements must really occur, or the sweep proves nothing.
for (const lang of ["es", "en"]) {
  test(`A ${lang}: the toast stands in the row from a 120 px span and 4 px under it below that, at every width from 280 to 340`, async ({ page }) => {
    await openWithToastsOn(page, { width: 280, height: 640 }, lang, 100);
    await page.evaluate((t) => window.VTToast(t, { durationMs: 600000 }), PAUSED[lang]);
    const seen = { row: 0, under: 0 };
    for (let width = 280; width <= 340; width += 5) {
      await page.setViewportSize({ width, height: 640 });
      await page.waitForTimeout(250); // the resize handler places the toast again; its transition runs on the wall clock
      const m = await page.evaluate(() => {
        document.getAnimations().forEach((a) => a.finish());
        const R = (s) => document.querySelector(s).getBoundingClientRect();
        const t = R("#toast");
        const row = R(".exercise-header-compact");
        return {
          span: Math.round(R(".ex-header-actions").left - 6 - (R("#btn-back-home").right + 6)),
          inRow: document.getElementById("toast").classList.contains("in-row"),
          below: Math.round(t.top - row.bottom),
          width: Math.round(t.width),
          overBack: t.left < R("#btn-back-home").right && t.right > R("#btn-back-home").left && t.top < R("#btn-back-home").bottom && t.bottom > R("#btn-back-home").top,
          overHelp: t.left < R(".ex-header-actions").right && t.right > R(".ex-header-actions").left && t.top < R(".ex-header-actions").bottom && t.bottom > R(".ex-header-actions").top
        };
      });
      const at = `${lang} ${width}px (span ${m.span}px)`;
      expect(m.inRow, `${at}: in the row exactly when the span is 120 px or more`).toBe(m.span >= 120);
      expect(m.overBack, `${at}: covers ← Back`).toBe(false);
      expect(m.overHelp, `${at}: covers Help`).toBe(false);
      if (m.inRow) {
        seen.row++;
      } else {
        seen.under++;
        expect(m.below, `${at}: just under the row, not further down`).toBeGreaterThanOrEqual(0);
        expect(m.below, `${at}: just under the row, not further down`).toBeLessThanOrEqual(12);
        expect(m.width, `${at}: wide enough to read`).toBeGreaterThanOrEqual(120);
      }
    }
    expect(seen.row, "control: the sweep reached widths where the row holds the toast").toBeGreaterThan(2);
    expect(seen.under, "control: and widths where it stands under the row").toBeGreaterThan(2);
  });
}

// UIA-04: taking the header out of the layout must also take its height out of the sticky offsets
test("D 844x390: with the site header out of the layout the exercise row sticks to the top", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await boot(page, { lang: "es" });
  await openExercise(page, "v1-diction");
  // Scrolled: the row is stuck, so its top is the sticky offset itself
  await page.evaluate(() => window.scrollTo(0, 400));
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const m = await page.evaluate(() => ({
    scrolled: window.scrollY,
    headerH: getComputedStyle(document.documentElement).getPropertyValue("--header-h").trim(),
    rowTop: Math.round(document.querySelector(".exercise-header-compact").getBoundingClientRect().top),
    header: getComputedStyle(document.querySelector("header.app-header")).visibility,
    h1: getComputedStyle(document.querySelector("header.app-header h1")).visibility,
    tabbable: [...document.querySelectorAll("header.app-header a, header.app-header button")].filter((e) => getComputedStyle(e).visibility !== "hidden").length
  }));
  expect(m.scrolled, "control: the page scrolled, so the row is stuck").toBeGreaterThan(100);
  expect(m.headerH, "the sticky offset is zero, not the 40 px floor").toBe("0px");
  expect(m.rowTop).toBe(0);
  expect(m.header, "control: the header's controls are not shown").toBe("hidden");
  expect(m.h1, "its h1 is").toBe("visible");
  expect(m.tabbable, "no hidden control can take focus").toBe(0);
});
