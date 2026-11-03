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
