/**
 * User-visible production regressions found on LIVE Pages, 2026-11-01.
 * These are negative AND positive oracles, not click-only smoke tests.
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise } = require("./helpers/e2e");

async function progress(page, id) {
  return page.evaluate((x) => ({
    progress: VTStorage.getProgress()?.[x] || null,
    days: VTDays?.get?.() || null,
    saved: VTApp.getState().sessionPractice.saved,
    scoreVisible: !document.querySelector("#score-result")?.hidden
  }), id);
}

test("no-start one-tap and detailed Save cannot create a perfect score, achievement or day", async ({ page }) => {
  await boot(page, { mic: "silent" });
  await openExercise(page, "s4-lip-trills");
  await page.locator("#btn-toggle-metrics").click();
  const initial = await page.locator('#metrics-form input[type="range"]').evaluateAll(
    (inputs) => inputs.map((i) => i.value));
  await page.locator('.rate-btn[data-feel="easy"]').click();
  await expect(page.locator("#rate-note")).toContainText(/Empieza|practica/i);
  const after = await page.locator('#metrics-form input[type="range"]').evaluateAll(
    (inputs) => inputs.map((i) => i.value));
  expect(after, "rejected rating cannot pre-fill perfect self-scores").toEqual(initial);
  await page.locator("#rate-more").evaluate((el) => (el.open = true));
  await page.locator("#btn-complete").click();
  const status = await progress(page, "s4-lip-trills");
  expect(status.progress?.completedCount || 0).toBe(0);
  expect(status.saved).toBe(false);
  expect(status.scoreVisible).toBe(false);
  expect(await page.locator("#first-win-card").count()).toBe(0);
});

test("a 14-second take is rejected; resumed practice beyond 15 seconds saves and re-rates once", async ({ page }) => {
  await page.clock.install();
  await boot(page, { mic: "silent" });
  await openExercise(page, "s4-lip-trills");
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => VTApp.getState().practiceLive)).toBe(true);
  // The app's real practice clock, not a mocked persisted progress row.
  await page.clock.fastForward(14000);
  await page.locator("#btn-practice-stop").click();
  await page.locator('.rate-btn[data-feel="ok"]').click();
  const premature = await progress(page, "s4-lip-trills");
  expect(premature.progress?.completedCount || 0).toBe(0);
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => VTApp.getState().practiceLive)).toBe(true);
  await page.clock.fastForward(3000);
  await page.locator("#btn-practice-stop").click();
  await page.locator('.rate-btn[data-feel="ok"]').click();
  const first = await progress(page, "s4-lip-trills");
  expect(first.progress?.completedCount).toBe(1);
  expect(first.progress.history[0].durationSec).toBeGreaterThanOrEqual(15);
  const id = first.progress.history[0].id;
  await page.locator('.rate-btn[data-feel="hard"]').click();
  const second = await progress(page, "s4-lip-trills");
  expect(second.progress?.completedCount).toBe(1);
  expect(second.progress.history[0].id).toBe(id);
  expect(second.progress.history[0].score).not.toBe(first.progress.history[0].score);
});

for (const [exercise, viewport] of [
  ["s4-lip-trills", { width: 1280, height: 800 }],
  ["s9-pitch-match", { width: 390, height: 844 }],
  ["s2-solfege-chords", { width: 360, height: 740 }]
]) {
  test(`expanded piano controls are visibly topmost and physically clickable: ${exercise} ${viewport.width}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await boot(page);
    await openExercise(page, exercise);
    await page.locator("#btn-toggle-piano").click();
    await expect(page.locator("#piano-block")).toBeVisible();
    await expect(page.locator("#piano-block")).toHaveClass(/is-open/);
    const stagePosition = await page.locator("#highway-stage").evaluate(
      (e) => getComputedStyle(e).position);
    expect(stagePosition, "sticky stage occludes piano while expanded").toBe("relative");
    for (const id of ["btn-play-prog", "btn-loop-prog", "btn-stop-piano"]) {
      const button = page.locator("#" + id);
      await button.scrollIntoViewIfNeeded();
      await page.waitForTimeout(90);
      const hit = await button.evaluate((el) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2;
        const cy = r.top + r.height / 2;
        const top = document.elementFromPoint(cx, cy);
        return {
          visible: cx >= 0 && cx <= innerWidth && cy >= 0 && cy <= innerHeight,
          topmost: el === top || el.contains(top)
        };
      });
      expect(hit.visible, `${id} lies outside viewport`).toBe(true);
      expect(hit.topmost, `${id} is occluded by stage/HUD`).toBe(true);
    }
    await page.locator("#btn-toggle-piano").click();
    await expect(page.locator("#highway-stage")).toHaveCSS("position", "sticky");
  });
}

test("placement A/B cannot invent two recorded takes from two empty clicks", async ({ page }) => {
  await boot(page, { mic: "silent" });
  await openExercise(page, "s26-placement-compare");
  await page.locator("#mode-focus [data-take]").click();
  await page.locator("#mode-focus [data-take]").click();
  const state = await page.evaluate(() => {
    const s = VTApp.getState().modeInstance.state;
    return { takes: s.takes, stage: s.stage, A: s.A, B: s.B };
  });
  expect(state).toEqual({ takes: 0, stage: "A", A: null, B: null });
  await expect(page.locator("#mode-focus [data-status]")).toContainText(/audio|Empezar/i);
  await expect(page.locator('#mode-focus [data-play="A"]')).toBeHidden();
});

test("language switch re-renders the already visible success moment", async ({ page }) => {
  await boot(page, { lang: "es" });
  await page.evaluate(() => {
    const b = document.querySelector("#value-banner");
    b.hidden = false;
    b.dataset.momentId = "first_save";
    document.querySelector("#value-banner-text").textContent =
      VTI18n.t("value.moment.first_save");
  });
  await expect(page.locator("#value-banner-text")).toContainText("Primera sesión");
  await page.evaluate(() => VTI18n.setLang("en"));
  await expect(page.locator("#value-banner-text")).toContainText("First session saved");
  await expect(page.locator("#value-banner-text")).not.toContainText("¡Primera");
});
