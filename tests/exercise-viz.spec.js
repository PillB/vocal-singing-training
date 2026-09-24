/**
 * Exercise pictures (docs/39-EXERCISE-VISUALS.md): each exercise draws the
 * picture of its own skill, fed by a synthetic voice, in the first screen.
 * Pattern for the per-group specs (tests/exercise-viz-*.spec.js).
 */
const { test, expect } = require("@playwright/test");
const { useVoice, playVoice } = require("./helpers/voice");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page, lang = "es") {
  await page.addInitScript((l) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", l);
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
  }, lang);
  await useVoice(page);
  await page.goto(BASE + "/?e2e", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
}

async function openAndStart(page, id, voice) {
  await page.evaluate((x) => window.VTApp.openExercise(x), id);
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  await page.locator("#btn-practice-start").click();
  await page.waitForTimeout(250);
  if (voice) await playVoice(page, voice);
}

/** The picture's canvas, drawn (not blank) and fully inside the first screen. */
async function pictureInView(page) {
  return page.evaluate(() => {
    const c = document.querySelector("#mode-focus .vz-canvas, #mode-hud .vz-canvas");
    if (!c) return { found: false };
    const r = c.getBoundingClientRect();
    const g = c.getContext("2d");
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < px.length; i += 4 * 97) if (px[i] + px[i + 1] + px[i + 2] > 120) lit++;
    return { found: true, top: r.top, bottom: r.bottom, h: r.height, vh: innerHeight, lit };
  });
}

test.describe("exercise pictures", () => {
  test("costal breath paces without asking for the mic", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window.__gumCalls = 0;
      const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (c) => {
        window.__gumCalls++;
        return orig(c);
      };
    });
    await openAndStart(page, "s18-costal-breath");
    await page.waitForTimeout(1500);
    const pic = await pictureInView(page);
    expect(pic.found).toBe(true);
    expect(pic.bottom).toBeLessThanOrEqual(pic.vh);
    expect(pic.h).toBeGreaterThan(150);
    expect(pic.lit, "the wave is drawn").toBeGreaterThan(20);
    expect(await page.evaluate(() => window.__gumCalls)).toBe(0);
    const stage = await page.locator("#mode-focus [data-stage]").textContent();
    expect(stage).toMatch(/Inhala|Suspende|Exhala/);
  });

  test("power pause counts a 1.2 s pause and compares takes after Stop", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "v10-power-pause", "speech");
    // The synthetic speaker talks 3 s, pauses 1.2 s
    await page.waitForTimeout(9500);
    const n = Number(await page.locator("#mode-focus [data-p]").textContent());
    expect(n, "1.2 s pauses count (the old grace window hid them)").toBeGreaterThanOrEqual(1);
    const pic = await pictureInView(page);
    expect(pic.found && pic.bottom <= pic.vh).toBe(true);
    await page.locator("#mode-focus [data-next-take]").click();
    await page.waitForTimeout(300);
    await page.locator("#btn-practice-stop").click();
    await expect(page.locator("#mode-focus .mode-panel")).toHaveClass(/is-replay/);
    const toast = await page.evaluate(() => window.VTApp.getState().modeInstance?.state?.review);
    expect(toast).toBe(true);
  });

  test("English labels on the pause drill", async ({ page }) => {
    await boot(page, "en");
    await openAndStart(page, "v10-power-pause");
    await expect(page.locator("#mode-focus [data-next-take]")).toHaveText(/Next take/);
  });
});
