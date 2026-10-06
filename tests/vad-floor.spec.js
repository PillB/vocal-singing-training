/**
 * The pause detector's floor (VTFeatures.Vad, js/voice-features.js), fed
 * synthetic engine frames (tests/helpers/vad-sim.js) instead of a microphone:
 * the same seed gives the same frames, so each case can say how long a pause
 * measured. The floor is the room; the cases are the sounds that must and
 * must not become it — speech from the first frame, a word's own dips, a
 * fan, a hiss at sensitivity 10, a sung hold, the Space assist, a room that
 * changes mid-take.
 *
 * Levels are after the MIC gain, as the Vad sees them. The engine's gate is
 * −46.3 dBFS at sensitivity 7; the quiet room is −62.
 */
const { test, expect } = require("@playwright/test");
const path = require("path");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

const SPEECH = (sec, o = {}) => Object.assign({ kind: "speech", sec }, o);
const QUIET = (sec) => ({ kind: "silence", sec });
const NOTE = (sec, o = {}) => Object.assign({ kind: "tone", sec }, o);
const SPACE = (sec) => ({ kind: "space", sec });
// Speech over a fan: peaks 20 dB above it
const OVER_FAN = { peak: -20, dip: -36 };
/** n parts of `a` with `b` between them */
const turns = (n, a, b) => Array.from({ length: n * 2 - 1 }, (_, i) => (i % 2 ? b : a));

async function sim(page, spec) {
  return page.evaluate((s) => window.VTVadSim.run(s), spec);
}

test.describe("pause floor (Vad)", () => {
  test.beforeEach(async ({ page }) => {
    await page.setContent("<!doctype html><title>vad</title>");
    await page.addScriptTag({ url: BASE + "/js/voice-features.js" });
    await page.addScriptTag({ path: path.join(__dirname, "helpers", "vad-sim.js") });
  });

  test("speech from the first frame never becomes the floor", async ({ page }) => {
    // 6 s with no pause is 6 s of talk
    let r = await sim(page, { parts: [SPEECH(6)] });
    expect(r.segs).toMatch(/^s0\.0\d-5\.99$/);
    expect(r.talk).toBeGreaterThan(5.9);
    // 20 s with syllable dips: 10 dB ones, ones that close the gate
    for (const dip of [-35, -42, -58]) {
      r = await sim(page, { parts: [SPEECH(20, { dip, voicedCons: dip === -35 })] });
      expect(r.segs, `dips at ${dip} dB`).not.toContain("p");
      expect(r.talk).toBeGreaterThan(19.8);
    }
  });

  test("a soft speaker's consonant dips do not become the floor", async ({ page }) => {
    // Peaks 4 dB over the gate and consonants 6 dB under it, so every
    // consonant closes the gate for 40–100 ms; talking from the first frame
    // with one real 1 s pause. The dips used to become the floor, and every
    // weak syllable after that read as a pause.
    const soft = { peak: -42, dip: -52 };
    for (const seed of [1000, 8919, 16838, 24757]) {
      const r = await sim(page, { seed, parts: [SPEECH(8, soft), QUIET(1), SPEECH(8, soft)] });
      expect(r.falsePauses, `seed ${seed}: ${r.segs}`).toBe(0);
      expect(r.silences[0].measured, `seed ${seed}: ${r.segs}`).toBeGreaterThan(0.9);
      expect(r.talk).toBeGreaterThan(15.5);
    }
  });

  test("a sung hold is a voice, not the room", async ({ page }) => {
    // The soft-palate drill's sung step: two 9 s holds with a 1 s breath.
    // Each hold used to become the floor and end in a pause ~1 s early.
    let r = await sim(page, { parts: [QUIET(3), NOTE(9), QUIET(1), NOTE(9), QUIET(2)] });
    expect(r.falsePauses, r.segs).toBe(0);
    expect(r.talk, r.segs).toBeGreaterThan(17.5);
    expect(r.silences[0].measured).toBeGreaterThan(0.85);
    // A straight tone, no vibrato, held 20 s
    r = await sim(page, { parts: [QUIET(1), NOTE(20, { vibDb: 0, vibCents: 0 })] });
    expect(r.segs).toMatch(/^s1\.0\d-20\.99$/);
  });

  test("the Space assist is never the room", async ({ page }) => {
    // Held 12 s, then pressed again 1.2 s after release
    const r = await sim(page, { parts: [QUIET(2), SPACE(12), QUIET(1.2), SPACE(1.5), QUIET(1)] });
    expect(r.falsePauses, r.segs).toBe(0);
    expect(r.segs.match(/s/g), r.segs).toHaveLength(2);
    expect(r.silences[0].measured).toBeGreaterThan(1.1);
    expect(r.silences[0].measured).toBeLessThan(1.3);
  });

  test("a flat 'mmm' or monotone speech is not the room", async ({ page }) => {
    // A 2.5 s filler between two runs of speech, no silence anywhere
    let r = await sim(page, { parts: [SPEECH(4), NOTE(2.5, { level: -30, vibDb: 0.5, vibCents: 5 }), SPEECH(6)] });
    expect(r.segs, "no pause inside the filler").toMatch(/^s0\.0\d-12\.50$/);
    // Sonorant speech whose syllables dip only 4–6 dB, from the first frame
    for (const dip of [-29, -31]) {
      r = await sim(page, { parts: [SPEECH(20, { dip, voicedCons: true })] });
      expect(r.segs, `dips at ${dip} dB`).not.toContain("p");
    }
  });

  test("silence, then speech: a 1.2 s pause measures 1.2 s", async ({ page }) => {
    const r = await sim(page, { parts: [QUIET(2), SPEECH(10), QUIET(1.2), SPEECH(4)] });
    expect(r.falsePauses).toBe(0);
    expect(r.silences).toHaveLength(1);
    expect(r.silences[0].measured).toBeGreaterThan(1.1);
    expect(r.silences[0].measured).toBeLessThan(1.3);
    expect(r.floor).toBeLessThan(-60);
  });
});
