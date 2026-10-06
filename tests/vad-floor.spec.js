/**
 * The pause detector's floor (VTFeatures.Vad, js/voice-features.js), fed
 * synthetic engine frames (tests/helpers/vad-sim.js) instead of a microphone:
 * the same seed gives the same frames, so each case can say how long a pause
 * measured. The floor is the room; the cases are the sounds that must and
 * must not become it — speech from the first frame, a word's own dips, a
 * fan, a hiss at sensitivity 10, a hum, a sung hold, a soft held vowel the
 * pitch detector cannot hear, the Space assist, a room that changes
 * mid-take.
 *
 * Levels are after the MIC gain, as the Vad sees them. The engine's gate is
 * −46.3 dBFS at sensitivity 7; the quiet room is −62. The pitch detector
 * reads nothing under −40 dBFS, so between the gate and −40 a voice and a
 * fan differ only in the engine's `clarity` (VTPitchUtils.clarity), which
 * the first cases check on real samples.
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

test.describe("clarity (VTPitchUtils.clarity)", () => {
  test("a voice or a hum reads periodic and a fan does not, at any level", async ({ page }) => {
    await page.setContent("<!doctype html><title>clarity</title>");
    await page.addScriptTag({ url: BASE + "/js/pitch-visualizer.js" });
    const out = await page.evaluate(() => {
      let seed = 7;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
      const norm = (x) => {
        let s = 0;
        x.forEach((v) => (s += v * v));
        const r = Math.sqrt(s / x.length);
        return x.map((v) => v / r);
      };
      const sounds = {
        white: (n) => norm(Array.from({ length: n }, gauss)),
        // A fan's low rumble: noise under 150 Hz, the closest noise comes to a period
        rumble: (n, sr) => {
          let lp = 0;
          return norm(Array.from({ length: n }, () => (lp += (gauss() - lp) * ((2 * Math.PI * 150) / sr))));
        },
        // A vowel at 135 Hz with ±15 cents of vibrato and three formants
        vowel: (n, sr) => {
          let ph = 0;
          return norm(
            Array.from({ length: n }, (_, i) => {
              ph += (2 * Math.PI * 135 * Math.pow(2, (15 * Math.sin((2 * Math.PI * 5.5 * i) / sr)) / 1200)) / sr;
              let v = 0;
              for (let k = 1; k * 135 < 5000; k++) {
                let a = 1 / k;
                [700, 1200, 2600].forEach((f) => (a *= 1 + 3 / (1 + Math.pow((k * 135 - f) / 150, 2))));
                v += a * Math.sin(k * ph);
              }
              return v;
            })
          );
        },
        // Mains hum through a cheap supply: 120 Hz and its octave
        hum: (n, sr) => norm(Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 120 * i) / sr) + 0.5 * Math.sin((2 * Math.PI * 240 * i) / sr)))
      };
      const res = {};
      for (const sr of [48000, 44100]) {
        const n = sr;
        const src = {};
        Object.keys(sounds).forEach((k) => (src[k] = sounds[k](n, sr)));
        // A voice or a hum under a fan as loud as itself
        src["vowel+white"] = src.vowel.map((v, i) => v + src.white[i]);
        src["hum+white"] = src.hum.map((v, i) => v + src.white[i]);
        for (const db of [-60, -43, -20]) {
          const g = Math.pow(10, db / 20);
          Object.keys(src).forEach((k) => {
            const vals = [];
            for (let end = 2048; end <= n; end += 1600) {
              const buf = Float32Array.from(src[k].slice(end - 2048, end), (v) => v * g);
              vals.push(window.VTPitchUtils.clarity(buf, sr));
            }
            vals.sort((a, b) => a - b);
            res[`${k} ${db} dB ${sr}`] = Math.round(vals[vals.length >> 1] * 100) / 100;
          });
        }
      }
      res.silence = window.VTPitchUtils.clarity(new Float32Array(2048), 48000);
      return res;
    });
    Object.keys(out).forEach((k) => {
      if (/^(white|rumble)/.test(k)) expect(out[k], k).toBeLessThan(0.5);
      else if (/^(vowel|hum) /.test(k)) expect(out[k], k).toBeGreaterThan(0.9);
      else if (/\+white/.test(k)) expect(out[k], k).toBeGreaterThanOrEqual(0.7);
    });
    expect(out.silence).toBe(0);
  });
});

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

  test("a soft held vowel the pitch detector cannot hear is a voice", async ({ page }) => {
    // Four 3 s holds with 1.2 s breaths, between the engine's gate and the
    // detector's −40 dBFS, so most frames have no pitch. Holding still with
    // no pitch used to read as a room after 0.6 s, and every hold was erased.
    const holds = (level) => [QUIET(2), ...turns(4, NOTE(3, { level }), QUIET(1.2)), QUIET(1)];
    for (const [sens, room, levels] of [
      [7, -62, [-41, -44]],
      [10, -66, [-45, -50, -55]]
    ]) {
      for (const level of levels) {
        const r = await sim(page, { parts: holds(level), sens, room });
        const label = `sensitivity ${sens}, holds at ${level} dB`;
        expect(r.falsePauses, `${label} · ${r.segs}`).toBe(0);
        expect(r.talk, `${label} · ${r.segs}`).toBeGreaterThan(11.5);
        eachPauseMeasured(r, label);
      }
    }
  });

  test("soft speech with a soft 'mmm' or 'eeeh' in it keeps its words", async ({ page }) => {
    const soft = { peak: -38, dip: -48 };
    const mmm = (sec, level) => NOTE(sec, { level, vibDb: 0.5, vibCents: 5 });
    for (const [label, parts] of [
      ["a 2.5 s 'mmm' at −43 dB", [QUIET(1), SPEECH(4, soft), mmm(2.5, -43), SPEECH(4, soft), QUIET(1)]],
      ["the same from the first frame", [SPEECH(4, soft), mmm(2.5, -43), SPEECH(4, soft)]],
      ["a 1.5 s 'eeeh' at −42 dB", [QUIET(1), SPEECH(5, { peak: -36, dip: -48 }), mmm(1.5, -42), SPEECH(5, { peak: -36, dip: -48 }), QUIET(1)]]
    ]) {
      const r = await sim(page, { parts });
      expect(r.falsePauses, `${label} · ${r.segs}`).toBe(0);
      expect(r.talk, `${label} · ${r.segs}`).toBeGreaterThan(r.truthTalk - 0.3);
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
      at: [8.5]
    });
    // (the room the floor already knows gives way after 1.2 s of the new one)
    expect(Math.abs(r.floorAt[8.5] - -40), r.segs).toBeLessThan(2);
    expect(r.silences[1].measured, r.segs).toBeGreaterThan(1.1);
    expect(r.silences[2].measured, r.segs).toBeGreaterThan(1.1);
    // Off after the second pause: the quiet room comes back as the floor
    r = await sim(page, {
      parts: [SPEECH(3, OVER_FAN), QUIET(1.2), SPEECH(3, OVER_FAN), QUIET(2), SPEECH(3), QUIET(1.2), SPEECH(3)],
      fan: { db: -40, until: 7.5 }
    });
    eachPauseMeasured(r, "fan off");
    expect(r.floor).toBeLessThan(-60);
    // On mid-sentence, 5 s after the room was last heard quiet: the next
    // 1.2 s pause is enough to learn it
    r = await sim(page, { parts: [QUIET(1), SPEECH(5, OVER_FAN), ...turns(5, SPEECH(3, OVER_FAN), QUIET(1.2))], fan: { db: -40, from: 6.5 } });
    eachPauseMeasured(r, "fan on mid-sentence");
  });

  test("a fan before the first word: no speech, no pause", async ({ page }) => {
    // The fan alone: nothing said yet. It used to read as ~1.8 s of speech,
    // then a pause.
    let r = await sim(page, { parts: [QUIET(6)], fan: { db: -40 } });
    expect(r.segs, "the fan alone").toBe("");
    expect(r.state).toBe("idle");
    expect(r.talk).toBe(0);
    // The speech it opened is taken back, and whoever drew it is told
    expect(r.takenBack).toHaveLength(1);
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
    expect(r.takenBack, r.segs).toHaveLength(1);
    expect(r.takenBack[0]).toBeGreaterThan(6.9);
  });

  test("a hum in the room from the first frame becomes the floor", async ({ page }) => {
    // A steady tone (mains hum, a fridge) from Start, a lead-in, then talk
    // with 1.2 s pauses. It has a pitch like a voice, so only a sound the
    // take opened with and heard nothing else of for a second is a hum. The
    // pitched-means-voice rule kept it as speech all take: no pause counted.
    for (const [label, spec] of [
      ["hum at −36 dB, 3 s lead-in", { hum: { db: -36, hz: 120 }, lead: 3 }],
      ["hum at −36 dB with a fan at −38", { hum: { db: -36, hz: 120 }, fan: { db: -38 }, lead: 3 }],
      ["hum at −42 dB, under the pitch detector", { hum: { db: -42, hz: 100 }, lead: 3 }],
      ["hum at −36 dB, 1.5 s lead-in", { hum: { db: -36, hz: 120 }, lead: 1.5 }]
    ]) {
      const r = await sim(page, Object.assign({ parts: [QUIET(spec.lead), ...turns(3, SPEECH(3, OVER_FAN), QUIET(1.2))] }, spec));
      const msg = `${label} · ${r.segs}`;
      expect(r.ghost, msg).toBeLessThan(0.15);
      expect(r.ended.filter((e) => e.start < spec.lead - 0.2), msg).toEqual([]);
      eachPauseMeasured(r, label);
    }
  });

  test("speech misread as a room for a moment does not replace the room", async ({ page }) => {
    // Syllables that swing only 8 dB with unvoiced consonants, after a 1 s
    // lead-in, 40 s with no pause. A stretch of it can hold still for 0.6 s;
    // starting the floor over from such a stretch threw away the lead-in's
    // room and read 8–25 s of the talk as pauses.
    const seeds = Array.from({ length: 20 }, (_, i) => (i + 1) * 7919);
    for (const [peak, dip] of [
      [-25, -33],
      [-30, -38]
    ]) {
      for (const seed of seeds) {
        const r = await sim(page, { seed, parts: [QUIET(1), SPEECH(40, { peak, dip })] });
        expect(r.falsePauses, `${peak}/${dip} dB, seed ${seed} · ${r.segs.slice(0, 160)}`).toBe(0);
        expect(r.talk, `${peak}/${dip} dB, seed ${seed}`).toBeGreaterThan(r.truthTalk - 0.3);
      }
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
