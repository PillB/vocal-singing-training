/**
 * Time a take spends with the page hidden is not practice (QA-77). The state-machine inventory of 2026-11-26
 * found two clocks with two policies: the engine counts no time it could not hear, while the take's own clock
 * ran from Start to Stop, so a learner who sang a minute and spent half an hour in another app was told
 * "31:00 de 5:00 ✓", and the day, History and the score were credited 31 minutes. Each case models the wrong
 * behaviour; its mutant in the "learner" set of qa/mutate.mjs puts it back.
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise } = require("./helpers/e2e");

/** The page's clock, paused a moment ahead, so a take lasts exactly what the test fast-forwards. */
async function ownClock(page) {
  await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 10000));
}

/** The page is hidden (another tab or app) or shown again, as the browser tells it. */
async function setHidden(page, hidden) {
  await page.evaluate((h) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
    Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
    document.dispatchEvent(new Event("visibilitychange"));
  }, hidden);
}

async function startTake(page) {
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => VTApp.getState().practiceLive)).toBe(true);
}

/** What the take was credited: the clock, the card's line, today's seconds on the day ledger. */
const credit = (page) =>
  page.evaluate(() => ({
    clock: Math.round(VTApp.getPracticedSec()),
    card: document.querySelector("#rate-time")?.textContent.replace(/\s+/g, " ").trim() || "",
    day: VTDays.read().days[VTDays.dayKey()]?.sec || 0
  }));

test.describe("QA-77 a hidden page is not practice", () => {
  // The rating card opens at the end of a take, as it does for a learner (muted under automation otherwise).
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("vt_rate_e2e", "1"));
  });

  test("a minute sung, half an hour in another app: the card, the clock and the day say a minute", async ({ page }) => {
    await page.clock.install();
    await boot(page, { lang: "es", mic: "silent" });
    await openExercise(page, "s4-lip-trills");
    const total = await page.evaluate(() => VTApp.getState().timer.total);
    expect(total, "control: the take has a timer shorter than the time away").toBeLessThan(1800);
    await ownClock(page);
    await startTake(page);
    await page.clock.fastForward(60000);
    await setHidden(page, true);
    // The step's timer runs out while away: the take ends there, as before, with the microphone closed.
    await page.clock.fastForward(30 * 60000);
    await setHidden(page, false);
    await page.clock.runFor(500);
    await expect.poll(() => page.evaluate(() => VTApp.getState().practiceLive)).toBe(false);
    await expect(page.locator("#rate-time"), "control: the take ended into its rating card").toBeVisible();
    const c = await credit(page);
    expect(c.clock).toBe(60);
    expect(c.day, "the day is credited the minute sung, not 31").toBeLessThanOrEqual(61);
    expect(c.card).toContain("1:00");
    expect(c.card).not.toContain("✓");
  });

  test("hidden for a while and shown again mid-take: the clock runs on from the return", async ({ page }) => {
    await page.clock.install();
    await boot(page, { lang: "es", mic: "silent" });
    await openExercise(page, "s4-lip-trills");
    await ownClock(page);
    await startTake(page);
    await page.clock.fastForward(20000);
    await setHidden(page, true);
    await page.clock.fastForward(15000);
    await setHidden(page, false);
    expect(await page.evaluate(() => VTApp.getState().practiceLive), "control: the take is still live").toBe(true);
    await page.clock.fastForward(25000);
    await page.locator("#btn-practice-stop").click();
    await expect.poll(() => page.evaluate(() => VTApp.getState().practiceLive)).toBe(false);
    const c = await credit(page);
    expect(c.clock, "20 s before, 25 s after, none of the 15 s away").toBe(45);
    expect(c.card).toContain("0:45");
  });

  test("control: a take never hidden is credited all of it", async ({ page }) => {
    await page.clock.install();
    await boot(page, { lang: "es", mic: "silent" });
    await openExercise(page, "s4-lip-trills");
    await ownClock(page);
    await startTake(page);
    await page.clock.fastForward(60000);
    await page.locator("#btn-practice-stop").click();
    await expect.poll(() => page.evaluate(() => VTApp.getState().practiceLive)).toBe(false);
    const c = await credit(page);
    expect(c.clock).toBe(60);
    expect(c.card).toContain("1:00");
  });
});

/**
 * QA-78: every way out of an exercise stops the take, and stopping asked the mode to end it again each time.
 * The rate ladder measures its minutes when asked, so a learner who read for 3 minutes, pressed Detener, read
 * the review for 4 and then left through "Puntuar ahora" had 7 minutes saved and scored against the target.
 */
test.describe("QA-78 a take is ended once", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => sessionStorage.setItem("vt_rate_e2e", "1"));
  });

  test("the rate ladder's minutes stay what the take measured when the learner leaves through Puntuar ahora", async ({ page }) => {
    await page.clock.install();
    await boot(page, { lang: "es", mic: "silent" });
    await openExercise(page, "v1-diction");
    await ownClock(page);
    await startTake(page);
    await page.clock.fastForward(3 * 60000);
    await page.locator("#btn-practice-stop").click();
    await expect.poll(() => page.evaluate(() => VTApp.getState().practiceLive)).toBe(false);
    const minutes = page.locator('#metrics-form [name="duration"]');
    await expect(minutes, "control: the take filled in its own minutes").toHaveValue("3");
    const summary = await page.evaluate(() => VTApp.getState().rate.summary);
    // Reading the review for 4 minutes, then Inicio: the leave question, and "Puntuar ahora".
    await page.clock.fastForward(4 * 60000);
    await page.locator('[data-view="home"]').first().click();
    await page.locator("#leave-save").click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await expect(minutes).toHaveValue("3");
    expect(await page.evaluate(() => VTApp.getState().rate.summary), "the take's own words stay on the card").toBe(summary);
  });
});

/**
 * QA-79: the last take, left playing in the rating card, played on through the next take. The microphone opens
 * without echo cancellation, so the old take was heard as the learner's voice, its holds were logged and the new
 * recording held it. Start now stops every take player.
 */
test.describe("QA-79 the next take does not hear the last one", () => {
  test("a take playing in the rating card stops when Empezar is pressed", async ({ page }) => {
    await page.clock.install();
    await boot(page, { lang: "es", mic: "silent" });
    await openExercise(page, "s4-lip-trills");
    await ownClock(page);
    await startTake(page);
    await page.clock.fastForward(20000);
    await page.locator("#btn-practice-stop").click();
    await expect.poll(() => page.evaluate(() => VTApp.getState().practiceLive)).toBe(false);
    // The take's player, as the rating card draws it, playing five seconds of silence.
    const playing = await page.evaluate(async () => {
      const rate = 8000;
      const n = rate * 5;
      const buf = new ArrayBuffer(44 + n);
      const v = new DataView(buf);
      const w = (o, t) => [...t].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
      w(0, "RIFF"); v.setUint32(4, 36 + n, true); w(8, "WAVE"); w(12, "fmt "); v.setUint32(16, 16, true);
      v.setUint16(20, 1, true); v.setUint16(22, 1, true); v.setUint32(24, rate, true); v.setUint32(28, rate, true);
      v.setUint16(32, 1, true); v.setUint16(34, 8, true); w(36, "data"); v.setUint32(40, n, true);
      for (let i = 0; i < n; i++) v.setUint8(44 + i, 128);
      const a = document.createElement("audio");
      a.className = "audio-player";
      a.controls = true;
      a.src = URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
      document.getElementById("playback-area").appendChild(a);
      await a.play();
      return !a.paused;
    });
    expect(playing, "control: the old take is playing").toBe(true);
    await startTake(page);
    expect(await page.evaluate(() => document.querySelector("#playback-area audio.audio-player")?.paused)).toBe(true);
  });
});
