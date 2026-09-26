/**
 * Exercise pictures — dynamics, onset and articulation (s11, s12, s14).
 * Each exercise draws the picture of its own skill (js/scenes/dynamics.js),
 * fed by a synthetic voice (qa/voices/dynamics.js), in the first screen.
 */
const { test, expect } = require("@playwright/test");
const { useVoice, playVoice, stopVoice } = require("./helpers/voice");

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
    // Words the pictures draw, so a spec can read a canvas
    window.__drawn = [];
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (s, ...rest) {
      try {
        if (window.__drawn.length > 6000) window.__drawn.splice(0, 3000);
        window.__drawn.push(String(s));
      } catch {
        /* ignore */
      }
      return fill.call(this, s, ...rest);
    };
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
const drawn = (page) => page.evaluate(() => window.__drawn.slice(-3000).join(" | "));
const clearDrawn = (page) => page.evaluate(() => (window.__drawn.length = 0));

test.describe("dynamics pictures", () => {
  test("s11 swell: +12 dB up and back is counted, level in dB against your start", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s11-dynamics", "swellCoach");
    await page.waitForFunction(() => (window.VTApp.getState().modeInstance?.state?.swells || 0) >= 1, null, { timeout: 30000 });
    const pic = await pictureInView(page);
    expect(pic.found).toBe(true);
    expect(pic.top).toBeGreaterThanOrEqual(0);
    expect(pic.bottom).toBeLessThanOrEqual(pic.vh);
    expect(pic.lit, "the level line and the guide are drawn").toBeGreaterThan(40);
    const s = await modeState(page, () => window.VTApp.getState().modeInstance.state.done[0]);
    expect(s.counted).toBe(true);
    // The synthetic singer swells by 12 dB and comes back
    expect(s.rise).toBeGreaterThan(9);
    expect(s.rise).toBeLessThan(16);
    expect(s.fall).toBeGreaterThan(8);
    expect(s.peakFrac).toBeGreaterThan(0.3);
    expect(s.peakFrac).toBeLessThan(0.7);
    expect(Math.abs(s.peakCents)).toBeLessThan(15);
    expect(await drawn(page)).toContain("dB");
    // No pitch highway: the picture is the stage
    await expect(page.locator("#pitch-block")).toBeHidden();
    await clearDrawn(page);
    await stop(page);
    await page.waitForTimeout(200);
    // Where the peak came, said in words, not a bare "pico 51 %"
    expect(await drawn(page)).toMatch(/pico al \d+ % de la duración/);
    await expect(page.locator('#metrics-form [name="swells"]')).toHaveValue(/^[1-9]/);
  });

  test("s11 swell: pitch that rides up with the volume is shown, not counted against the swell", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s11-dynamics", "swellSharp");
    await page.waitForFunction(() => (window.VTApp.getState().modeInstance?.state?.done || []).length >= 1, null, { timeout: 30000 });
    const s = await modeState(page, () => window.VTApp.getState().modeInstance.state.done[0]);
    expect(s.peakCents, "about +38 cents at the peak").toBeGreaterThan(20);
    expect(s.counted).toBe(true);
    await clearDrawn(page);
    await stop(page);
    await page.waitForTimeout(200);
    expect(await drawn(page)).toContain("subió con el volumen");
  });

  test("s11 swell: a swell of 3 dB is not counted", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s11-dynamics", "swellFlat");
    await page.waitForFunction(() => (window.VTApp.getState().modeInstance?.state?.done || []).length >= 1, null, { timeout: 30000 });
    const st = await modeState(page, () => {
      const s = window.VTApp.getState().modeInstance.state;
      return { swells: s.swells, rise: s.done[0].rise };
    });
    expect(st.rise).toBeLessThan(6);
    expect(st.swells).toBe(0);
  });

  test("s11 swell: an auto-gain microphone is named in the picture", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s11-dynamics", "swellCoach");
    await page.evaluate(() => (window.VTApp.getState().practice.processedInput = true));
    await clearDrawn(page);
    await page.waitForTimeout(1500);
    expect(await drawn(page)).toContain("Tu micrófono iguala el volumen");
  });

  test("s12 onsets: your six examples first, then easy onsets named against them", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s12-easy-onset", "onsetContrast");
    const pic = await pictureInView(page);
    expect(pic.found && pic.bottom <= pic.vh).toBe(true);
    // During the examples nothing is counted
    await page.waitForFunction(() => (window.VTApp.getState().modeInstance?.state?.step || 0) >= 3, null, { timeout: 20000 });
    let st = await modeState(page, () => window.VTApp.getState().modeInstance.state);
    expect(st.phase).toBe("contrast");
    expect(st.counts.balanced + st.counts.breathy + st.counts.abrupt).toBe(0);
    await page.waitForFunction(() => (window.VTApp.getState().modeInstance?.state?.counts?.balanced || 0) >= 3, null, { timeout: 40000 });
    st = await modeState(page, () => {
      const s = window.VTApp.getState().modeInstance.state;
      const pick = (r) => ({ riseMs: r.riseMs, leadMs: r.leadMs, overshoot: r.overshoot });
      return {
        phase: s.phase,
        calibrated: !!s.refs,
        ex: { abrupt: s.examples.abrupt.map(pick), breathy: s.examples.breathy.map(pick), balanced: s.examples.balanced.map(pick) },
        counts: s.counts
      };
    });
    expect(st.phase).toBe("reps");
    expect(st.calibrated, "the examples came out different enough to be the references").toBe(true);
    // The breathy examples have air before the tone; the abrupt ones rise fast with a spike
    // (frame timing on a shared machine moves these by a frame or two)
    const mean = (a) => a.reduce((s, r) => s + r.leadMs, 0) / a.length;
    for (const b of st.ex.breathy) expect(b.leadMs).toBeGreaterThan(50);
    expect(mean(st.ex.breathy) - mean(st.ex.balanced), "air first: breathy against easy").toBeGreaterThan(40);
    for (const a of st.ex.abrupt) {
      expect(a.riseMs).toBeLessThan(20);
      expect(a.overshoot).toBeGreaterThan(1.3);
    }
    expect(await page.locator("#mode-focus .mode-big[data-e]").textContent()).toMatch(/^[3-9] \/ 10$/);
    await stop(page);
    await expect(page.locator('#metrics-form [name="easyOnsets"]')).toHaveValue(/^[3-9]/);
    // The next take keeps your examples (the app mounts a fresh mode on Start)
    await page.locator("#btn-practice-start").click();
    await page.waitForTimeout(300);
    const again = await modeState(page, () => {
      const s = window.VTApp.getState().modeInstance.state;
      return { phase: s.phase, refs: !!s.refs, n: s.examplesSeq.length, reps: s.onsets.length };
    });
    expect(again).toEqual({ phase: "reps", refs: true, n: 6, reps: 0 });
  });

  test("s12 onsets: without examples, breathy starts are named breathy, never easy", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s12-easy-onset", "onsetBreathy");
    await page.locator("#mode-focus [data-skip]").click();
    await page.waitForFunction(() => (window.VTApp.getState().modeInstance?.state?.onsets || []).length >= 3, null, { timeout: 30000 });
    const c = await modeState(page, () => window.VTApp.getState().modeInstance.state.counts);
    expect(c.breathy).toBeGreaterThanOrEqual(2);
    expect(c.balanced).toBe(0);
    // Breathy is information: the word and a hatched square, not an error colour
    expect(await drawn(page)).toMatch(/Soplado/);
  });

  test("s14 staccato counts short notes across real gaps; legato draws one line", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s14-staccato-legato", "articulation");
    await page.waitForTimeout(7000);
    const pic = await pictureInView(page);
    expect(pic.found && pic.bottom <= pic.vh).toBe(true);
    expect(pic.lit).toBeGreaterThan(30);
    const sh = Number(await page.locator("#mode-focus [data-sh]").textContent());
    expect(sh, "each 0.18 s note is its own note (voiced bridged them into one)").toBeGreaterThanOrEqual(8);
    const s0 = await modeState(page, () => window.VTApp.getState().modeInstance.state.stats(0));
    expect(s0.medLen).toBeGreaterThan(0.12);
    expect(s0.medLen).toBeLessThan(0.3);
    expect(s0.medGap).toBeGreaterThan(0.15);
    expect(s0.hammers).toBe(0);
    // Note lengths keep their leading zero: "0,21 s", never ",21"
    const w14 = await drawn(page);
    expect(w14).toMatch(/(^| )0,\d\d s( |$)/);
    expect(w14).not.toMatch(/(^|[^\d]),\d/);
    await page.locator("#mode-focus [data-next-phase]").click();
    await expect(page.locator("#mode-focus [data-phase]")).toHaveText(/Legato/);
    await page.waitForFunction(() => (window.VTApp.getState().modeInstance?.state?.stats(1)?.lines || 0) >= 2, null, { timeout: 20000 });
    const s1 = await modeState(page, () => window.VTApp.getState().modeInstance.state.stats(1));
    expect(s1.breaks).toBe(0);
    expect(s1.longest).toBeGreaterThan(2.2);
    expect(Number(await page.locator("#mode-focus [data-lg]").textContent())).toBeGreaterThanOrEqual(1);
    await stop(page);
    await expect(page.locator('#metrics-form [name="rounds"]')).toHaveValue("2");
  });

  test("s14 sloppy: long staccato with hammered starts; a broken, sliding legato", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s14-staccato-legato", "articulationSloppy");
    await page.waitForTimeout(6500);
    const s0 = await modeState(page, () => window.VTApp.getState().modeInstance.state.stats(0));
    expect(s0.hammers, "4 ms attacks are marked ▲").toBeGreaterThanOrEqual(2);
    expect(s0.medGap).toBeLessThan(0.15);
    await page.locator("#mode-focus [data-next-phase]").click();
    await page.waitForFunction(() => (window.VTApp.getState().modeInstance?.state?.stats(1)?.breaks || 0) >= 2, null, { timeout: 20000 });
    await page.waitForFunction(() => (window.VTApp.getState().modeInstance?.state?.stats(1)?.slides || 0) >= 1, null, { timeout: 20000 });
    await clearDrawn(page);
    await page.waitForTimeout(300);
    const words = await drawn(page);
    expect(words).toContain("corte");
    expect(words).toContain("deslizado");
  });

  test("choices made before Start survive it: swell length, starting phase", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.VTApp.openExercise("s11-dynamics"));
    await page.locator("#mode-focus [data-len]").click();
    await expect(page.locator("#mode-focus [data-len]")).toHaveText(/8\ss/);
    await page.locator("#btn-practice-start").click();
    await page.waitForTimeout(300);
    expect(await modeState(page, () => window.VTApp.getState().modeInstance.state.D)).toBe(8);
    await page.locator("#btn-practice-stop").click();
    await page.evaluate(() => window.VTApp.openExercise("s14-staccato-legato"));
    await page.locator("#mode-focus [data-next-phase]").click();
    await expect(page.locator("#mode-focus [data-phase]")).toHaveText(/Legato/);
    await page.locator("#btn-practice-start").click();
    await page.waitForTimeout(300);
    expect(await modeState(page, () => window.VTApp.getState().modeInstance.state.phaseIdx)).toBe(1);
    await expect(page.locator("#mode-focus [data-phase]")).toHaveText(/Legato/);
  });

  test("English labels on the three pictures", async ({ page }) => {
    await boot(page, "en");
    await openAndStart(page, "s14-staccato-legato", "articulation");
    await expect(page.locator("#mode-focus [data-next-phase]")).toHaveText(/Next phase/);
    await page.waitForTimeout(2500);
    const words = await drawn(page);
    expect(words).toContain("Staccato: short notes, silence between");
    expect(words).not.toMatch(/notas cortas/);
    await page.locator("#btn-practice-stop").click();
    await page.evaluate(() => window.VTApp.openExercise("s12-easy-onset"));
    await expect(page.locator("#mode-focus [data-skip]")).toHaveText(/Skip examples/);
    await page.evaluate(() => window.VTApp.openExercise("s11-dynamics"));
    await expect(page.locator("#mode-focus [data-len]")).toHaveText(/Length 7\ss/);
  });

  test("phone: each picture sits in the first screen", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
    const page = await ctx.newPage();
    await boot(page);
    for (const [id, voice] of [
      ["s11-dynamics", "swellCoach"],
      ["s12-easy-onset", "onsetContrast"],
      ["s14-staccato-legato", "articulation"]
    ]) {
      await openAndStart(page, id, voice);
      await clearDrawn(page);
      await page.waitForTimeout(2500);
      // On a phone the phase tabs still carry their words
      if (id === "s14-staccato-legato") expect(await drawn(page)).toMatch(/(^| )Legato( |$)/);
      const pic = await pictureInView(page);
      expect(pic.found, id).toBe(true);
      expect(pic.bottom, id).toBeLessThanOrEqual(pic.vh);
      expect(pic.h, id).toBeGreaterThan(200);
      await stopVoice(page);
      await page.locator("#btn-practice-stop").click();
      await page.waitForTimeout(300);
    }
    await ctx.close();
  });
});
