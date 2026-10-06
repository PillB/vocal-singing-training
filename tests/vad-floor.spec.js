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

  /** Every real silence was closed as a pause of about its own length. */
  function eachPauseMeasured(r, label) {
    expect(r.silences.length, label).toBeGreaterThan(0);
    r.silences.forEach((s, i) => {
      expect(s.measured, `${label}: silence ${i + 1} (${s.sec} s) · ${r.segs}`).not.toBeNull();
      expect(s.measured, `${label}: silence ${i + 1} · ${r.segs}`).toBeGreaterThan(s.sec - 0.1);
      expect(s.measured, `${label}: silence ${i + 1} · ${r.segs}`).toBeLessThan(s.sec + 0.15);
    });
  }

  test("a fan that opens the gate: every pause counts, the first one too", async ({ page }) => {
    // The learner talks from the first frame over a fan 22 dB above the
    // quiet room. The fan used to be learned only after ~1.5–1.9 s of it
    // alone, so 1–1.2 s pauses read as speech.
    for (const sec of [1.2, 1.0]) {
      const r = await sim(page, { parts: turns(5, SPEECH(3, OVER_FAN), QUIET(sec)), fan: { db: -40 } });
      eachPauseMeasured(r, `fan, ${sec} s pauses`);
      expect(r.falsePauses).toBe(0);
    }
    // Ten seconds of talk, then the first pause
    const r = await sim(page, { parts: [SPEECH(10, OVER_FAN), QUIET(1.5), SPEECH(5, OVER_FAN)], fan: { db: -40 } });
    eachPauseMeasured(r, "fan, 10 s then 1.5 s");
  });

  test("sensitivity 10: the quiet room's own hiss opens the gate, pauses still count", async ({ page }) => {
    const r = await sim(page, { parts: turns(5, SPEECH(3, { peak: -15, dip: -32 }), QUIET(1)), room: -55, sens: 10 });
    eachPauseMeasured(r, "sensitivity 10");
  });

  test("a steady fan becomes the floor within a second, at 60 or 30 frames a second", async ({ page }) => {
    for (const fps of [60, 30]) {
      const r = await sim(page, { parts: [QUIET(3)], fan: { db: -40 }, fps, at: [1] });
      expect(Math.abs(r.floorAt[1] - -40), `${fps} fps: floor at 1 s`).toBeLessThan(2);
    }
    // At 30 fps (a phone in low-power mode) the floor learned at ~20 steps a
    // second and a talker's 1.2 s pauses never taught it
    const r = await sim(page, { parts: turns(4, SPEECH(3, OVER_FAN), QUIET(1.2)), fan: { db: -40 }, fps: 30 });
    eachPauseMeasured(r, "30 fps");
  });

  test("a fan switched on or off mid-take: the floor follows the room", async ({ page }) => {
    // On during a 4 s pause: the room is the fan within a second, and the
    // pauses after it count
    let r = await sim(page, {
      parts: [QUIET(1), SPEECH(5), QUIET(4), SPEECH(3), QUIET(1.2), SPEECH(3), QUIET(1.2), SPEECH(3)],
      fan: { db: -40, from: 7 },
      at: [8]
    });
    expect(Math.abs(r.floorAt[8] - -40), r.segs).toBeLessThan(2);
    expect(r.silences[1].measured, r.segs).toBeGreaterThan(1.1);
    expect(r.silences[2].measured, r.segs).toBeGreaterThan(1.1);
    // Off after the second pause: the quiet room comes back as the floor
    r = await sim(page, {
      parts: [SPEECH(3, OVER_FAN), QUIET(1.2), SPEECH(3, OVER_FAN), QUIET(2), SPEECH(3), QUIET(1.2), SPEECH(3)],
      fan: { db: -40, until: 7.5 }
    });
    eachPauseMeasured(r, "fan off");
    expect(r.floor).toBeLessThan(-60);
  });

  test("a fan before the first word: no speech, no pause", async ({ page }) => {
    // The fan alone: nothing said yet. It used to read as ~1.8 s of speech,
    // then a pause.
    let r = await sim(page, { parts: [QUIET(6)], fan: { db: -40 } });
    expect(r.segs, "the fan alone").toBe("");
    expect(r.state).toBe("idle");
    expect(r.talk).toBe(0);
    // The learner gathers their thoughts, then talks with 1.2 s pauses: the
    // lead-in is not talk and no pause is reported for it (a 1.5–3 s one
    // landed in the power-pause drill's count before a word was said)
    for (const lead of [1.5, 3, 4]) {
      r = await sim(page, { parts: [QUIET(lead), ...turns(3, SPEECH(3, OVER_FAN), QUIET(1.2))], fan: { db: -40 } });
      const label = `${lead} s lead-in · ${r.segs}`;
      expect(r.ghost, label).toBeLessThan(0.15);
      expect(r.ended.filter((e) => e.start < lead - 0.2), label).toEqual([]);
      eachPauseMeasured(r, `${lead} s lead-in`);
    }
    // Sensitivity 10, where the quiet room's own hiss opens the gate
    const loud = { peak: -15, dip: -32 };
    r = await sim(page, { parts: [QUIET(3), SPEECH(3, loud), QUIET(1), SPEECH(3, loud)], room: -55, sens: 10 });
    expect(r.ghost, r.segs).toBeLessThan(0.15);
    expect(r.ended, r.segs).toHaveLength(1);
    eachPauseMeasured(r, "sensitivity 10, 3 s lead-in");
  });

  test("a fan switched on mid-pause: one pause, reported once", async ({ page }) => {
    // The fan comes on 1 s into a 4 s pause. It read as speech from then
    // on; now it is taken back and the pause runs on to the next word.
    const r = await sim(page, { parts: [QUIET(1), SPEECH(5), QUIET(4), SPEECH(3)], fan: { db: -40, from: 7 } });
    expect(r.segs).toMatch(/^s1\.0\d-6\.0\d p6\.0\d-10\.\d\d s10\.\d\d-1[23]\.\d\d$/);
    expect(r.ghost, r.segs).toBeLessThan(0.15);
    // Its end was told when the fan came on (the Vad could not know yet);
    // it is not told a second time, so no drill counts it twice
    expect(r.ended, r.segs).toHaveLength(1);
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
