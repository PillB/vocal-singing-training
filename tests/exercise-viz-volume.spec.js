/**
 * Volume pictures (js/scenes/volume.js): the steady count (v2), the volume
 * ladder (v13) and the energy triad (v20), fed by the synthetic voices in
 * qa/voices/volume.js. Levels are dB against the learner's own voice.
 */
const { test, expect } = require("@playwright/test");
const { useVoice, playVoice, stopVoice } = require("./helpers/voice");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page, lang = "es") {
  const warnings = [];
  page.on("console", (m) => {
    const t = m.text();
    if (m.type() === "error" || t.startsWith("[viz]")) warnings.push(t.slice(0, 300));
  });
  page.on("pageerror", (e) => warnings.push(String(e.message || e)));
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
  return warnings;
}

/** Shorter steps keep a ladder test short; the profile is the shared object the mode reads. */
async function setProfile(page, id, patch) {
  await page.evaluate(
    ([x, p]) => {
      const ex = [...window.VT_EXERCISES.vocal, ...window.VT_EXERCISES.singing].find((e) => e.id === x);
      Object.assign(ex.practice, p);
    },
    [id, patch]
  );
}

async function openAndStart(page, id, voice) {
  await page.evaluate((x) => window.VTApp.openExercise(x), id);
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  await page.locator("#btn-practice-start").click();
  await page.waitForTimeout(250);
  if (voice) await playVoice(page, voice);
}

async function stop(page) {
  await stopVoice(page);
  await page.locator("#btn-practice-stop").click();
  await expect(page.locator("#mode-focus .mode-panel")).toHaveClass(/is-replay/);
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

const modeState = (page, fn) => page.evaluate(fn);
const breathDiffs = (page) => modeState(page, () => window.VTApp.getState().modeInstance.state.breaths.map((b) => b.stats.diff));

test.describe("volume pictures", () => {
  test("steady count: breaths counted against your own level, a fading end is flagged", async ({ page }) => {
    const warnings = await boot(page);
    await openAndStart(page, "v2-volume", "countFade");
    // Two counts of 5 s with a 1.4 s breath between; a busy machine stretches them
    await expect
      .poll(async () => (await breathDiffs(page)).some((d) => d != null && d <= -3), { timeout: 30000, intervals: [500] })
      .toBe(true);
    const pic = await pictureInView(page);
    expect(pic.found).toBe(true);
    expect(pic.top).toBeGreaterThanOrEqual(0);
    expect(pic.bottom).toBeLessThanOrEqual(pic.vh);
    expect(pic.h).toBeGreaterThan(150);
    expect(pic.lit, "the ribbon is drawn").toBeGreaterThan(20);
    const n = Number(await page.locator("#mode-focus [data-cyc]").textContent());
    expect(n, "each 5 s count on one breath is a breath").toBeGreaterThanOrEqual(1);
    await expect(page.locator("#mode-focus [data-fade]")).toContainText(/por debajo del inicio/);
    const before = await page.locator('#metrics-form [name="consistency"]').inputValue().catch(() => null);
    await stop(page);
    // Measured: full counts. Consistency stays the learner's to rate
    expect(Number(await page.locator('#metrics-form [name="cycles"]').inputValue())).toBeGreaterThanOrEqual(1);
    if (before != null) expect(await page.locator('#metrics-form [name="consistency"]').inputValue()).toBe(before);
    await expect(page.locator("#mode-focus .vz-cap")).toContainText(/respiraci/);
    expect(warnings).toEqual([]);
  });

  test("steady count on a phone: an even count reads even, the blind round hides the ribbon", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await ctx.newPage();
    const warnings = await boot(page);
    await openAndStart(page, "v2-volume", "count");
    // An even voice stays within ±3 dB from start to end
    await expect
      .poll(async () => (await breathDiffs(page)).some((d) => d != null && Math.abs(d) < 3), { timeout: 30000, intervals: [500] })
      .toBe(true);
    const pic = await pictureInView(page);
    expect(pic.found && pic.top >= 0 && pic.bottom <= pic.vh, JSON.stringify(pic)).toBe(true);
    const blind = page.locator("#mode-focus [data-blind]");
    const box = await blind.boundingBox();
    expect(box.height, "tap target").toBeGreaterThanOrEqual(44);
    await blind.click();
    await expect(blind).toHaveAttribute("aria-pressed", "true");
    // The breath under way (and the next ones) keep their ribbon hidden until they end
    expect(await modeState(page, () => window.VTApp.getState().modeInstance.state.blind)).toBe(true);
    await expect(page.locator("#mode-focus .vz-cap")).toContainText(/a ciegas/i);
    await ctx.close();
    expect(warnings).toEqual([]);
  });

  test("volume ladder: each tread sets at its level, ≥3 dB up is a distinct step", async ({ page }) => {
    const warnings = await boot(page);
    await setProfile(page, "v13-volume-ladder", { stepSec: 4 });
    await openAndStart(page, "v13-volume-ladder", "ladderSteps");
    await page.waitForTimeout(4 * 4000 + 1500);
    const pic = await pictureInView(page);
    expect(pic.found && pic.top >= 0 && pic.bottom <= pic.vh).toBe(true);
    expect(pic.lit).toBeGreaterThan(20);
    const treads = await modeState(page, () => window.VTApp.getState().modeInstance.state.reps[0].treads);
    expect(treads.length).toBeGreaterThanOrEqual(4);
    expect(treads[0].verdict).toBe("first");
    for (const td of treads.slice(1, 4)) {
      expect(td.verdict, JSON.stringify(td)).toBe("distinct");
      expect(td.delta).toBeGreaterThanOrEqual(3);
    }
    expect(Number(await page.locator("#mode-focus [data-cr]").textContent())).toBeGreaterThanOrEqual(3);
    await stop(page);
    await expect(page.locator("#mode-focus [data-phase]")).toHaveText("Repaso");
    await expect(page.locator("#mode-focus .vz-cap")).toContainText(/pasos distintos/);
    expect(warnings).toEqual([]);
  });

  test("volume ladder: a step that did not move reads as about the same", async ({ page }) => {
    const warnings = await boot(page);
    await setProfile(page, "v13-volume-ladder", { stepSec: 4 });
    await openAndStart(page, "v13-volume-ladder", "ladderFlat");
    await page.waitForTimeout(4 * 4000 + 1500);
    const treads = await modeState(page, () => window.VTApp.getState().modeInstance.state.reps[0].treads);
    expect(treads.length).toBeGreaterThanOrEqual(4);
    // Levels 3 and 4 come out the same in this voice
    expect(treads[3].verdict, JSON.stringify(treads[3])).toBe("same");
    expect(Math.abs(treads[3].delta)).toBeLessThan(3);
    expect(treads[1].verdict).toBe("distinct");
    expect(warnings).toEqual([]);
  });

  test("volume ladder: the story uses your levels, then the ladder comes back", async ({ page }) => {
    const warnings = await boot(page);
    await openAndStart(page, "v13-volume-ladder", "ladderSteps");
    await page.waitForTimeout(1200);
    const btn = page.locator("#mode-focus [data-phase-btn]");
    await btn.click();
    await expect(btn).toHaveText(/Escalera/);
    const readStory = () =>
      modeState(page, () => {
        const s = window.VTApp.getState().modeInstance.state;
        return { phase: s.phase, used: s.story && s.story.usedCount, approx: s.story && s.story.approx, phrases: s.story && s.story.phrases.length };
      });
    // Phrases of about 2 s at changing levels; a busy machine stretches them, so wait on the count
    await expect.poll(async () => (await readStory()).used, { timeout: 25000, intervals: [500] }).toBeGreaterThanOrEqual(2);
    const story = await readStory();
    expect(story.phase).toBe("story");
    // No ladder yet: the zones are placed around the story's own level, and say "aprox."
    expect(story.approx).toBe(true);
    expect(story.phrases).toBeGreaterThanOrEqual(2);
    const pic = await pictureInView(page);
    expect(pic.found && pic.lit > 20).toBe(true);
    await btn.click();
    await expect(btn).toHaveText(/Historia/);
    expect(await modeState(page, () => window.VTApp.getState().modeInstance.state.phase)).toBe("ladder");
    await stop(page);
    await expect(page.locator("#mode-focus .vz-cap")).toContainText(/historia: \d de 5 niveles/);
    expect(warnings).toEqual([]);
  });

  test("energy triad: each take leaves volume, pace and melody; Stop patches nothing", async ({ page }) => {
    const warnings = await boot(page);
    await openAndStart(page, "v20-energy-match", "energyTakes");
    const next = page.locator("#mode-focus [data-next-take]");
    for (let k = 0; k < 3; k++) {
      await page.waitForTimeout(6500);
      await next.click();
    }
    await page.waitForTimeout(600);
    const pic = await pictureInView(page);
    expect(pic.found && pic.top >= 0 && pic.bottom <= pic.vh).toBe(true);
    expect(pic.lit).toBeGreaterThan(20);
    const cyc = await modeState(page, () => window.VTApp.getState().modeInstance.state.cycles[0]);
    const [low, med, high] = cyc;
    expect(low.done && med.done && high.done, JSON.stringify(cyc)).toBe(true);
    expect(med.db - low.db, "medium louder than low").toBeGreaterThanOrEqual(3);
    expect(high.db - med.db, "high louder than medium").toBeGreaterThanOrEqual(3);
    expect(high.rate, "pace rises with energy").toBeGreaterThan(low.rate);
    expect(high.range, "melody widens with energy").toBeGreaterThan(low.range);
    const ratings = await page.evaluate(() =>
      ["flexibility", "calibration", "authenticity"].map((k) => document.querySelector(`#metrics-form [name="${k}"]`)?.value ?? null)
    );
    await stop(page);
    const after = await page.evaluate(() =>
      ["flexibility", "calibration", "authenticity"].map((k) => document.querySelector(`#metrics-form [name="${k}"]`)?.value ?? null)
    );
    expect(after, "self-ratings are never filled in").toEqual(ratings);
    await expect(page.locator("#mode-focus .vz-cap")).toContainText(/ritmo .* síl\/s/);
    expect(warnings).toEqual([]);
  });

  test("processed input: the picture says the browser evens out volume", async ({ page }) => {
    const warnings = await boot(page);
    await page.evaluate(() => {
      const md = navigator.mediaDevices;
      const orig = md.getUserMedia.bind(md);
      md.getUserMedia = async (c) => {
        const s = await orig(c);
        const t = s.getAudioTracks()[0];
        if (t) {
          const g = t.getSettings ? t.getSettings.bind(t) : () => ({});
          t.getSettings = () => Object.assign({}, g(), { autoGainControl: true });
        }
        return s;
      };
    });
    await openAndStart(page, "v13-volume-ladder", "ladderSteps");
    await page.waitForTimeout(1500);
    expect(await modeState(page, () => window.VTApp.getState().modeInstance.state.processed)).toBe(true);
    await expect(page.locator("#mode-focus .vz-cap")).toContainText(/iguala el volumen/);
    expect(warnings).toEqual([]);
  });

  test("English labels on the volume pictures", async ({ page }) => {
    const warnings = await boot(page, "en");
    await openAndStart(page, "v2-volume");
    await expect(page.locator("#mode-focus [data-blind]")).toHaveText(/Blind/);
    await expect(page.locator("#mode-focus .vz-canvas")).toHaveAttribute("aria-label", /dB/);
    await page.locator("#btn-practice-stop").click();
    await openAndStart(page, "v13-volume-ladder");
    await expect(page.locator("#mode-focus [data-phase-btn]")).toHaveText(/Story/);
    await expect(page.locator("#mode-focus [data-phase]")).toHaveText(/Whisper/);
    await page.locator("#btn-practice-stop").click();
    await openAndStart(page, "v20-energy-match");
    await expect(page.locator("#mode-focus [data-next-take]")).toHaveText(/Next take/);
    await expect(page.locator("#mode-focus [data-phase]")).toHaveText(/Low energy/);
    expect(warnings).toEqual([]);
  });
});
