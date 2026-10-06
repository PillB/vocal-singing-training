/**
 * Exercises whose mode picks its own notes (profile.ownsTarget: the zone
 * drills s21–s25, the five vowels s20, the lip-trill solfège s27, the hummed
 * targets s7…). The mode is the one source of the note: what the piano
 * sounds, what the highway and the readout name and what the mode waits for
 * must stay the same note when the octave moves during a take.
 *
 * Live runs use the synthetic singer (qa/synthetic-voice.js), which sings
 * whatever note the app is targeting, as a learner following the piano would.
 */
const { test, expect } = require("@playwright/test");
const { useVoice, playVoice, stopVoice } = require("./helpers/voice");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page, { auto = false } = {}) {
  await page.addInitScript((a) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      sessionStorage.setItem("vt_e2e", "1");
      // Every take starts at the written octave
      localStorage.setItem("vt_octave_shift", "0");
      localStorage.setItem("vt_range_auto", a ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, auto);
  await useVoice(page);
  await page.goto(BASE + "/?e2e", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
}

/** Open an exercise, press Start, and wait until the mode has its first note. */
async function openAndStart(page, id) {
  await page.evaluate((x) => window.VTApp.openExercise(x), id);
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  await page.locator("#btn-practice-start").click();
  await page.waitForFunction(() => {
    const st = window.VTApp.getState();
    return st.practiceLive && !!st.modeInstance?.state?.wantName;
  });
}

/** The note the mode waits for against the one the engine and highway target. */
function targets(page) {
  return page.evaluate(() => {
    const st = window.VTApp.getState();
    const ms = st.modeInstance.state;
    const midi = (f) => (f ? Math.round(69 + 12 * Math.log2(f / 440)) : null);
    return {
      shift: st.octaveShift,
      mode: midi(ms.wantFreq),
      engine: midi(st.practice.targetFreq),
      viz: midi(st.pitchViz?.targetFreq),
      held: ms.held,
      step: (ms.i || 0) + (ms.patterns || 0) * (ms.pattern?.length || 0)
    };
  });
}

test.describe("modes that own their target", () => {
  test("zone drill: an octave change mid-take moves the mode's note with the piano and the engine", async ({ page }) => {
    test.setTimeout(60_000);
    await boot(page);
    await openAndStart(page, "s21-chest-resonance");
    const before = await targets(page);
    expect(before.mode, "the first zone note is C3").toBe(48);
    // The learner presses the octave + in the bottom rail during the take
    await page.locator("#btn-oct-up").click();
    await expect.poll(async () => (await targets(page)).shift).toBe(1);
    // …and sings the note the piano now plays
    await playVoice(page, "follow");
    await page.waitForTimeout(400);
    const after = await targets(page);
    expect(after.mode, "the mode waits for the note an octave up").toBe(60);
    expect(after.engine, "the same note the engine targets").toBe(after.mode);
    await page.waitForFunction(() => (window.VTApp.getState().modeInstance.state.held || 0) >= 1, null, { timeout: 15_000 });
    await stopVoice(page);
    await page.locator("#btn-practice-stop").click();
  });

  test("lip-trill solfège: an octave change mid-take moves the step, the lanes and the readout", async ({ page }) => {
    test.setTimeout(60_000);
    await boot(page);
    await openAndStart(page, "s27-lip-trill-solfege");
    expect((await targets(page)).mode).toBe(48);
    await page.locator("#btn-oct-up").click();
    await expect.poll(async () => (await targets(page)).shift).toBe(1);
    await playVoice(page, "trill");
    await page.waitForTimeout(400);
    const after = await targets(page);
    expect(after.mode, "step 1 is C4 now").toBe(60);
    expect(after.engine).toBe(60);
    expect(after.viz, "the highway's target too").toBe(60);
    const shown = await page.evaluate(() => ({
      note: document.querySelector("#mode-hud [data-note]")?.textContent,
      lanes: (window.VTGetPitchViz?.()?.progressionLanes || []).map((l) => l.name)
    }));
    expect(shown.note).toBe("C4");
    expect(shown.lanes, "the lanes move with the octave").toEqual(["C4", "D4", "E4", "F4", "G4"]);
    // Singing the note the piano plays walks the scale
    await page.waitForFunction(() => (window.VTApp.getState().modeInstance.state.i || 0) >= 2, null, { timeout: 15_000 });
    await stopVoice(page);
    await page.locator("#btn-practice-stop").click();
  });

  test("lip-trill solfège with 'A mi voz': the automatic octave change keeps the scale walking", async ({ page }) => {
    test.setTimeout(60_000);
    await boot(page, { auto: true });
    await page.evaluate(() => {
      // A voice that lives an octave above the written C3: a short glide down,
      // then a steady C4
      window.__VTVoice.define("highVoice", (h) => {
        h.vibrato(8);
        h.trillOn(0.85);
        h.setPitch(370, 0.01);
        h.voiceOn(0.3, 0.08);
        h.at(100, () => h.setPitch(261.63, 1.2));
        // Once the octave has moved, follow the target like the learner would
        const wait = h.every(50, () => {
          if (window.VTApp.getState().octaveShift !== 1) return;
          clearInterval(wait);
          h.startFollow(15);
        });
      });
    });
    await openAndStart(page, "s27-lip-trill-solfege");
    await playVoice(page, "highVoice");
    await expect.poll(async () => (await targets(page)).shift, { timeout: 15_000 }).toBe(1);
    await page.waitForTimeout(300);
    const after = await targets(page);
    expect(after.mode, "the mode moved with the octave").toBe(after.engine);
    await page.waitForFunction(() => (window.VTApp.getState().modeInstance.state.i || 0) >= 2, null, { timeout: 15_000 });
    await stopVoice(page);
    await page.locator("#btn-practice-stop").click();
  });

  test("five vowels: an octave change mid-take moves the note the vowels are read against", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s20-five-vowels");
    const midi = () =>
      page.evaluate(() => {
        const ms = window.VTApp.getState().modeInstance.state;
        return Math.round(ms.targetMidi);
      });
    expect(await midi()).toBe(50); // D3
    await page.locator("#btn-oct-up").click();
    await expect.poll(midi, { message: "the vowels are read against D4 now" }).toBe(62);
    await page.locator("#btn-practice-stop").click();
  });
});
