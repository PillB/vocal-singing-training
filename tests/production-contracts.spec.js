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

test("a take 1 ms short of 15 seconds is rejected; one more millisecond saves, and re-rates once", async ({ page }) => {
  await page.clock.install();
  await boot(page, { mic: "silent" });
  await openExercise(page, "s4-lip-trills");
  // The clock is the test's from here: install() leaves real time running, and the real seconds between Start and
  // the fast-forward were added to the take (on a busy machine 2 runs in 10 saved a "14-second" take). Paused, a take
  // lasts exactly what it is fast-forwarded, so both sides of the 15 s line can be pinned.
  // (a margin far longer than the round trip: pauseAt refuses a time the page's clock has already passed)
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 10000));
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => VTApp.getState().practiceLive)).toBe(true);
  // The app's real practice clock (performance.now), not a mocked persisted progress row.
  await page.clock.fastForward(14999);
  await page.locator("#btn-practice-stop").click();
  await page.locator('.rate-btn[data-feel="ok"]').click();
  const premature = await progress(page, "s4-lip-trills");
  expect(premature.progress?.completedCount || 0).toBe(0);
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => VTApp.getState().practiceLive)).toBe(true);
  await page.clock.fastForward(1);
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

/**
 * Where everything stuck above the open piano ends, and whether each of its
 * controls is the topmost thing at its own centre, without any scrolling by
 * the test: the panel must open where the learner can see and press it.
 * Wrong behaviours these reject: the sticky stage painting over the panel
 * (PR #22's finding, WCAG 2.2 SC 2.4.11); the panel opening below the fold so
 * the Piano button seems to do nothing; and a long song list putting "Detener
 * piano" in a scroll box of its own (both 360x740, before 2026-11-01).
 */
function pianoView() {
  const stage = document.getElementById("highway-stage");
  const block = document.getElementById("piano-block");
  const root = getComputedStyle(document.documentElement);
  const chrome = (parseFloat(root.getPropertyValue("--header-h")) || 0) + (parseFloat(root.getPropertyValue("--ex-chrome-h")) || 0);
  const sticky = getComputedStyle(stage).position === "sticky";
  const s = stage.getBoundingClientRect();
  const p = block.getBoundingClientRect();
  const covered = [];
  const controls = [...block.querySelectorAll("button, select, input")].filter((el) => {
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
  });
  for (const el of controls) {
    const r = el.getBoundingClientRect();
    if (r.top + r.height / 2 > innerHeight) continue; // below the fold: the page scrolls to it
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    const label = el.id || el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20);
    if (!(el === top || el.contains(top))) covered.push(`${label} under ${top?.id || top?.className || "nothing"}`);
  }
  const nestedScroll = block.scrollHeight > block.clientHeight + 1;
  const rails = (parseFloat(stage.style.getPropertyValue("--rail-t")) || 0) + (parseFloat(stage.style.getPropertyValue("--rail-h")) || 0);
  return { sticky, stageH: Math.round(s.height), lanes: Math.round(s.height - rails), stageBottom: s.bottom, chrome, top: p.top, bottom: p.bottom, vh: innerHeight, controls: controls.length, nestedScroll, covered };
}

// `longList`: the song list is longer than the 420 px the panel opens to, so
// a cap left on the opened panel makes it a scroll box of its own (S4). On
// main that was s2 at 360 px wide (451 px); #21's panel is 90 px shorter
// there (361 px), which left no case to judge S4 until 320 px was added.
for (const [exercise, viewport, staysSticky, longList] of [
  ["s4-lip-trills", { width: 1280, height: 800 }, true],
  ["s4-lip-trills", { width: 1366, height: 768 }, true],
  ["s9-pitch-match", { width: 1280, height: 800 }, true],
  ["s9-pitch-match", { width: 390, height: 844 }, false],
  ["s4-lip-trills", { width: 390, height: 844 }, false],
  ["s2-solfege-chords", { width: 360, height: 740 }, false],
  ["s2-solfege-chords", { width: 320, height: 568 }, false, true],
  ["s4-lip-trills", { width: 844, height: 390 }, false]
]) {
  test(`expanded piano opens in view, above the stage, clickable: ${exercise} ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    await boot(page);
    await openExercise(page, exercise);
    const closedH = (await page.evaluate(pianoView)).stageH;
    // A finger on the button: locator.click() would first scroll it into
    // view, and inside a sticky stage Chromium scrolls the page to do so.
    const box = await page.locator("#btn-toggle-piano").boundingBox();
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
    // Opened and settled: the stage is fitted beside it once it stops growing.
    await expect(page.locator("#piano-block")).toHaveClass(/is-open.*is-settled|is-settled.*is-open/);
    await expect.poll(async () => {
      const v = await page.evaluate(pianoView);
      const cover = v.chrome + (v.sticky ? v.stageH : 0);
      // Whole when it fits below what is stuck; else its top, and the page scrolls on.
      const fits = v.bottom - v.top <= v.vh - cover - 8;
      const placed = v.top >= cover - 1 && (!fits || v.bottom <= v.vh + 1);
      return v.covered.length === 0 && placed && !v.nestedScroll ? "shown" : JSON.stringify(v);
    }, { timeout: 4000 }).toBe("shown");
    const open = await page.evaluate(pianoView);
    expect(open.controls, "control: the panel has controls to check").toBeGreaterThanOrEqual(3);
    if (longList) expect(open.bottom - open.top, "control: the song list is longer than the panel's opening cap").toBeGreaterThan(420);
    // Where the screen has room the stage stays in sight beside the piano
    // (VG-30); where it has not, it scrolls away rather than cover the panel.
    if (staysSticky !== null) expect(open.sticky, "stage sticky beside the piano").toBe(staysSticky);
    if (open.sticky) {
      // Between its rails the shrunk stage still shows a band of lanes (or
      // the mode panel): a fixed share of the screen left 64px on a phone.
      expect(open.lanes, "room between the rails beside the piano").toBeGreaterThanOrEqual(180);
      // Keyboard focus that reaches the panel after the page was scrolled
      // past it must not stay under the stuck stage.
      await page.evaluate(() => window.scrollBy({ top: 220, behavior: "instant" }));
      const under = await page.evaluate(pianoView);
      expect(under.covered.length, "control: scrolled on, the stage does cover the panel").toBeGreaterThan(0);
      await page.locator("#btn-play-prog").focus();
      const focused = await page.evaluate(pianoView);
      expect(focused.covered.filter((c) => c.startsWith("btn-play-prog")), "focused control uncovered").toEqual([]);
    }
    await page.locator("#btn-toggle-piano").click();
    await expect(page.locator("#piano-block")).toBeHidden();
    await expect(page.locator("#highway-stage")).toHaveCSS("position", "sticky");
    await expect.poll(async () => (await page.evaluate(pianoView)).stageH, { timeout: 2000 }).toBeGreaterThanOrEqual(closedH - 2);
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
