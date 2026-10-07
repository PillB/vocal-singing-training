/**
 * The pause detector's floor (VTFeatures.Vad, js/voice-features.js), fed
 * synthetic engine frames (tests/helpers/vad-sim.js) instead of a microphone:
 * the same seed gives the same frames, so each case can say how long a pause
 * measured. The floor is the room; the cases are the sounds that must and
 * must not become it — speech from the first frame, a word's own dips, a
 * fan, a hiss at sensitivity 10, a hum, a sung hold, a soft held vowel the
 * pitch detector cannot hear, a whisper, the Space assist, a room that
 * changes mid-take.
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
  test("a voice or a hum reads periodic and a fan does not, at any level or sample rate", async ({ page }) => {
    await page.setContent("<!doctype html><title>clarity</title>");
    await page.addScriptTag({ url: BASE + "/js/pitch-visualizer.js" });
    await page.addScriptTag({ url: BASE + "/js/practice-engine.js" });
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
      // Noise through `order` one-pole low-passes at `hz`
      const lowNoise = (n, sr, hz, order) => {
        const lp = new Array(order).fill(0);
        return norm(
          Array.from({ length: n }, () => {
            let v = gauss();
            for (let j = 0; j < order; j++) v = lp[j] += (v - lp[j]) * ((2 * Math.PI * hz) / sr);
            return v;
          })
        );
      };
      const sounds = {
        white: (n) => norm(Array.from({ length: n }, gauss)),
        // A fan's low rumble: noise under 150 Hz, the closest noise comes to a
        // period; and one with steeper skirts, under 200 or 250 Hz
        rumble: (n, sr) => lowNoise(n, sr, 150, 1),
        "rumble2-200": (n, sr) => lowNoise(n, sr, 200, 2),
        "rumble2-250": (n, sr) => lowNoise(n, sr, 250, 2),
        // A vowel at 135 Hz with ±15 cents of vibrato and three formants
        vowel: (n, sr, f0 = 135) => {
          let ph = 0;
          return norm(
            Array.from({ length: n }, (_, i) => {
              ph += (2 * Math.PI * f0 * Math.pow(2, (15 * Math.sin((2 * Math.PI * 5.5 * i) / sr)) / 1200)) / sr;
              let v = 0;
              for (let k = 1; k * f0 < 5000; k++) {
                let a = 1 / k;
                [700, 1200, 2600].forEach((f) => (a *= 1 + 3 / (1 + Math.pow((k * f0 - f) / 150, 2))));
                v += a * Math.sin(k * ph);
              }
              return v;
            })
          );
        },
        // Mains hum through a cheap supply: 120 Hz and its octave
        hum: (n, sr) => norm(Array.from({ length: n }, (_, i) => Math.sin((2 * Math.PI * 120 * i) / sr) + 0.5 * Math.sin((2 * Math.PI * 240 * i) / sr)))
      };
      const res = { size: {} };
      // On the frames the engine hands over: about 43 ms at any rate (a 96 kHz
      // interface's 2048 samples last 21 ms, under two periods of a low male
      // voice), read 30 times a second as the Vad does
      for (const sr of [48000, 44100, 96000, 192000]) {
        const size = window.VTPracticeEngine.frameSize(sr);
        res.size[sr] = size;
        const n = 2 * sr;
        const src = {};
        Object.keys(sounds).forEach((k) => (src[k] = sounds[k](n, sr)));
        // The same vowel from a low male voice, at 75 Hz
        src.vowel75 = sounds.vowel(n, sr, 75);
        // A voice or a hum under a fan as loud as itself
        src["vowel+white"] = src.vowel.map((v, i) => v + src.white[i]);
        src["hum+white"] = src.hum.map((v, i) => v + src.white[i]);
        for (const db of [-60, -43, -20]) {
          const g = Math.pow(10, db / 20);
          Object.keys(src).forEach((k) => {
            const vals = [];
            for (let end = size; end <= n; end += Math.round(sr / 30)) {
              const buf = Float32Array.from(src[k].slice(end - size, end), (v) => v * g);
              vals.push(window.VTPitchUtils.clarity(buf, sr));
            }
            const med = (a) => {
              const s = a.slice().sort((x, y) => x - y);
              return (s[(s.length - 1) >> 1] + s[s.length >> 1]) / 2;
            };
            // The Vad's test: the median of a steady 0.6 s stretch (18 steps)
            let top = 0;
            for (let i = 0; i + 18 <= vals.length; i++) top = Math.max(top, med(vals.slice(i, i + 18)));
            res[`${k} ${db} dB ${sr}`] = { med: Math.round(med(vals) * 100) / 100, top: Math.round(top * 100) / 100 };
          });
        }
      }
      res.silence = window.VTPitchUtils.clarity(new Float32Array(2048), 48000);
      return res;
    });
    expect(out.size).toEqual({ 44100: 2048, 48000: 2048, 96000: 4096, 192000: 8192 });
    Object.keys(out).forEach((k) => {
      if (/^(white|rumble)/.test(k)) expect(out[k].top, `${k}: the most periodic 0.6 s stretch`).toBeLessThan(0.5);
      else if (/^(vowel|vowel75|hum) /.test(k)) expect(out[k].med, k).toBeGreaterThan(0.9);
      else if (/\+white/.test(k)) expect(out[k].med, k).toBeGreaterThanOrEqual(0.7);
    });
    expect(out.silence).toBe(0);
  });

  test("how high a sound sits, and how still its high part holds, tells a fan's low rumble from a whisper, at any sample rate", async ({ page }) => {
    // The Vad's measure: the engine's hfRms over rms, scaled to 48 kHz, as
    // the median of 0.6 s. Under 0.1 (LOW_HF) a noise may wobble like a low
    // rumble, so a rumble must read under half of that and a whisper over
    // one and a half times it, or a whisper's flat syllables are learned as
    // the room and erased. That holds for a whisper through a narrowband
    // headset's low-pass and for a whisper's back vowels too (0.17–0.3; a
    // threshold of 0.3 let those through). A rumble with the mic's own hiss
    // under it reads as high as they do; what tells it apart is that its
    // high part (the hiss) holds within 1 dB over 0.6 s while its level
    // wobbles, where a whisper's follows its syllables.
    await page.setContent("<!doctype html><title>hf</title>");
    await page.addScriptTag({ url: BASE + "/js/practice-engine.js" });
    const out = await page.evaluate(() => {
      let seed = 11;
      const rnd = () => {
        seed = (seed * 1664525 + 1013904223) >>> 0;
        return seed / 4294967296;
      };
      const gauss = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
      const white = (n) => Array.from({ length: n }, gauss);
      const lowNoise = (n, sr, hz, order) => {
        const lp = new Array(order).fill(0);
        return white(n).map((v) => {
          for (let j = 0; j < order; j++) v = lp[j] += (v - lp[j]) * ((2 * Math.PI * hz) / sr);
          return v;
        });
      };
      // Two-pole filters as the Web Audio API's
      const biquad = (x, [b0, b1, b2, a0, a1, a2]) => {
        let [x1, x2, y1, y2] = [0, 0, 0, 0];
        return x.map((v) => {
          const y = (b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
          [x2, x1, y2, y1] = [x1, v, y1, y];
          return y;
        });
      };
      const bandPass = (x, sr, f, q) => {
        const w = (2 * Math.PI * f) / sr;
        const al = Math.sin(w) / (2 * q);
        return biquad(x, [al, 0, -al, 1 + al, -2 * Math.cos(w), 1 - al]);
      };
      const lowPass = (x, sr, f) => {
        const w = (2 * Math.PI * f) / sr;
        const al = Math.sin(w) / Math.SQRT2;
        const c = Math.cos(w);
        return biquad(x, [(1 - c) / 2, 1 - c, (1 - c) / 2, 1 + al, -2 * c, 1 - al]);
      };
      const level = (x, db) => {
        let s = 0;
        x.forEach((v) => (s += v * v));
        const k = Math.pow(10, db / 20) / Math.sqrt(s / x.length);
        return x.map((v) => v * k);
      };
      // Breath through the mouth's band-passes, 4.5 syllables a second that
      // swing 6 dB; `lp`: then through a headset's steep low-pass at that
      // many Hz
      const whisper = (bands, lp) => (n, sr) => {
        const w = white(n);
        const parts = bands.map((f) => bandPass(w, sr, f, 1.2));
        let x = w.map((_, i) => parts.reduce((t, p) => t + p[i], 0));
        if (lp) x = lowPass(lowPass(x, sr, lp), sr, lp);
        const syl = sr / 4.5;
        return x.map((v, i) => ((i % syl) / syl < 0.62 ? v : v / 2));
      };
      const sounds = {
        "rumble2-100": (n, sr) => lowNoise(n, sr, 100, 2),
        "rumble2-250": (n, sr) => lowNoise(n, sr, 250, 2),
        // The mic's own hiss 14 and 18 dB under a 100 Hz rumble
        "hissUnder14-100": (n, sr) => {
          const h = level(white(n), -14);
          return level(lowNoise(n, sr, 100, 2), 0).map((v, i) => v + h[i]);
        },
        "hissUnder18-100": (n, sr) => {
          const h = level(white(n), -18);
          return level(lowNoise(n, sr, 100, 2), 0).map((v, i) => v + h[i]);
        },
        whisper: whisper([900, 2400]),
        "whisper-headset": whisper([900, 2400], 3000),
        "whisper-back": whisper([500, 1100]),
        "whisper-back-headset": whisper([500, 1100], 3000),
        white
      };
      const proto = window.VTPracticeEngine.prototype;
      const res = {};
      const pct = (a, p) => a.slice().sort((x, y) => x - y)[Math.round((a.length - 1) * p)];
      for (const sr of [44100, 48000, 96000]) {
        const size = window.VTPracticeEngine.frameSize(sr);
        Object.keys(sounds).forEach((k) => {
          const x = sounds[k](2 * sr, sr);
          const vals = [];
          const hfDb = [];
          for (let end = size; end + Math.round(sr / 30) <= x.length && vals.length < 18; end += Math.round(sr / 30)) {
            const buf = Float32Array.from(x.slice(end - size, end));
            let s = 0;
            buf.forEach((v) => (s += v * v));
            const hf = proto._hfRms(buf);
            vals.push((hf / Math.sqrt(s / buf.length)) * (sr / 48000));
            hfDb.push(20 * Math.log10(hf));
          }
          res[`${k} ${sr}`] = { hf: Math.round(pct(vals, 0.5) * 1000) / 1000, still: Math.round((pct(hfDb, 0.9) - pct(hfDb, 0.1)) * 100) / 100 };
        });
      }
      return res;
    });
    Object.keys(out).forEach((k) => {
      if (/^rumble/.test(k)) expect(out[k].hf, k).toBeLessThan(0.05);
      else if (/^hissUnder/.test(k)) expect(out[k].still, `${k}: its high part holds still`).toBeLessThan(1);
      else if (/^whisper/.test(k)) {
        expect(out[k].hf, k).toBeGreaterThan(0.15);
        expect(out[k].still, `${k}: its high part follows the syllables`).toBeGreaterThan(4);
      } else expect(out[k].hf, k).toBeGreaterThan(1);
    });
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

  test("a fan's low rumble that wobbles from frame to frame is still the room", async ({ page }) => {
    // A fan whose noise sits under ~100 Hz: its level swings ~1.5 dB from one
    // frame to the next and 6–7 dB from its lowest to its highest over 0.6 s
    // (wobble 7 and hf 0.015 match 100 Hz two-pole noise in the engine's
    // frames). It never held within 4.5 dB that long, so it was never
    // learned: the pauses read as speech, with a 2 s lead-in or talking from
    // Start.
    const fan = { db: -40, wobble: 7, hf: 0.015 };
    for (const lead of [2, 0]) {
      for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
        const parts = [...(lead ? [QUIET(lead)] : []), ...turns(3, SPEECH(3, OVER_FAN), QUIET(1.2))];
        const r = await sim(page, { parts, fan, seed });
        const label = `${lead} s lead-in, seed ${seed}`;
        expect(r.falsePauses, `${label} · ${r.segs}`).toBe(0);
        expect(Math.abs(r.floor - fan.db), `${label}: the fan is the room · ${r.segs}`).toBeLessThan(3);
        eachPauseMeasured(r, label);
        if (lead) {
          expect(r.ghost, `${label} · ${r.segs}`).toBeLessThan(0.15);
          expect(r.ended.filter((e) => e.start < lead - 0.2), `${label} · ${r.segs}`).toEqual([]);
        }
      }
    }
  });

  test("a fan's low rumble with the quiet room's hiss 14–16 dB under it is still the room", async ({ page }) => {
    // A real mic always adds its own hiss. Under a rumble 14–16 dB above it
    // the hiss is weak, but it lifts how high the sound sits (0.18–0.3
    // where the rumble alone reads 0.015, as high as some whispers): the
    // rumble was refused the looser test, never held within 4.5 dB, and was
    // never learned. The take read as one stretch of speech and no pause was
    // measured. The hiss holds still while the rumble wobbles; a whisper's
    // high part follows its syllables.
    for (const db of [-46, -48]) {
      const fan = { db, wobble: 7, hf: 0.015 };
      for (const lead of [2, 0]) {
        for (const seed of [1, 2, 3, 4, 5, 6, 7, 8]) {
          const parts = [...(lead ? [QUIET(lead)] : []), ...turns(3, SPEECH(3, OVER_FAN), QUIET(1.2))];
          const r = await sim(page, { parts, fan, seed });
          const label = `rumble at ${db} dB, ${lead} s lead-in, seed ${seed}`;
          expect(r.falsePauses, `${label} · ${r.segs}`).toBe(0);
          expect(Math.abs(r.floor - db), `${label}: the rumble is the room · ${r.segs}`).toBeLessThan(3);
          eachPauseMeasured(r, label);
        }
      }
    }
  });

  test("whispered or breathy talk keeps its words", async ({ page }) => {
    // Talk with no period (a whisper, or a voice that is mostly breath) whose
    // syllables swing only 6–10 dB, after a lead-in in a quiet room. Clarity
    // reads it as a fan, and its 10th to 90th percentiles hold within 6 dB
    // like a low rumble's: it was learned as the room, the floor jumped to
    // it and the take was erased or read as pauses. Only a sound that sits
    // low (a rumble) gets that looser test; a whisper sits high.
    for (const [label, parts, room] of [
      ["whisper at −30/−38 dB, 1 s lead-in", [QUIET(1), ...turns(3, SPEECH(4, { peak: -30, dip: -38, whisper: true }), QUIET(1.2))]],
      ["whisper at −30/−38 dB, 3 s lead-in", [QUIET(3), ...turns(3, SPEECH(4, { peak: -30, dip: -38, whisper: true }), QUIET(1.2))]],
      ["whisper at −30/−40 dB, 1 s lead-in", [QUIET(1), ...turns(3, SPEECH(4, { peak: -30, dip: -40, whisper: true }), QUIET(1.2))]],
      ["a voice 12 % periodic at −30/−38 dB, 1 s lead-in", [QUIET(1), ...turns(3, SPEECH(4, { peak: -30, dip: -38, breathy: 0.12 }), QUIET(1.2))]],
      ["whisper at −28/−36 dB over a fan, 2 s lead-in", [QUIET(2), ...turns(3, SPEECH(4, { peak: -28, dip: -36, whisper: true }), QUIET(1.2))], { fan: { db: -40 } }]
    ]) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const r = await sim(page, Object.assign({ parts, seed }, room));
        const msg = `${label}, seed ${seed} · ${r.segs}`;
        expect(r.falsePauses, msg).toBe(0);
        expect(r.talk, msg).toBeGreaterThan(r.truthTalk - 0.5);
        expect(r.ghost, msg).toBeLessThan(0.15);
        eachPauseMeasured(r, `${label}, seed ${seed}`);
      }
    }
  });

  test("whispered phrases of 6 s or more keep their words", async ({ page }) => {
    // Once the floor has heard the quiet room, a new room must hold still
    // for 1.2 s. From 3 s after the last quiet step it used to need only
    // 0.6 s, so deep into a long whispered phrase (no period, syllables that
    // swing 6 dB) a stretch passed: the floor jumped to the whisper, and the
    // phrase was taken back or the next one read as a pause.
    for (const [label, sec, peak, dip, lead] of [
      ["6 s phrases at −30/−36 dB, 1 s lead-in", 6, -30, -36, 1],
      ["6 s phrases at −35/−41 dB, 2 s lead-in", 6, -35, -41, 2],
      ["8 s phrases at −30/−36 dB, 1 s lead-in", 8, -30, -36, 1],
      ["8 s phrases at −35/−41 dB, 2 s lead-in", 8, -35, -41, 2]
    ]) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const parts = [QUIET(lead), ...turns(3, SPEECH(sec, { peak, dip, whisper: true }), QUIET(1.2))];
        const r = await sim(page, { parts, seed });
        const msg = `${label}, seed ${seed} · ${r.segs}`;
        expect(r.falsePauses, msg).toBe(0);
        expect(r.talk, msg).toBeGreaterThan(r.truthTalk - 0.5);
        eachPauseMeasured(r, `${label}, seed ${seed}`);
      }
    }
  });

  test("a whisper that sits lower (back vowels, a headset's low-pass) keeps its words", async ({ page }) => {
    // How high a whisper sits depends on the mouth and the mic: the qa
    // whisper reads 0.58, but whispered /o/ and /u/, or any whisper through
    // a narrowband headset, read 0.15–0.3. Anything under 0.3 used to get
    // the rumble's loose test (10th to 90th percentile within 6 dB), which a
    // whisper's 6 dB syllables pass: after the lead-in it was learned as the
    // room and the take erased, with no talk and no pause measured. Only a
    // sound whose high part holds still (a rumble with the mic's hiss under
    // it) gets that test now.
    for (const [label, sec, peak, dip, lead, n] of [
      ["3 s phrases at −30/−36 dB, 1 s lead-in", 3, -30, -36, 1, 4],
      ["4 s phrases at −30/−38 dB, 1 s lead-in", 4, -30, -38, 1, 3],
      ["6 s phrases at −35/−41 dB, 2 s lead-in", 6, -35, -41, 2, 3]
    ]) {
      for (const hf of [0.15, 0.22, 0.29]) {
        for (const seed of [1, 2, 3]) {
          const parts = [QUIET(lead), ...turns(n, SPEECH(sec, { peak, dip, whisper: true, hf }), QUIET(1.2))];
          const r = await sim(page, { parts, seed });
          const msg = `${label}, hf ${hf}, seed ${seed} · ${r.segs}`;
          expect(r.falsePauses, msg).toBe(0);
          expect(r.talk, msg).toBeGreaterThan(r.truthTalk - 0.5);
          expect(r.floor, `${msg}: the quiet room is the floor`).toBeLessThan(-60);
          eachPauseMeasured(r, `${label}, hf ${hf}, seed ${seed}`);
        }
      }
    }
  });

  test("a held 'sss' is a voice, not the room", async ({ page }) => {
    // Hisses held 1.5–5 s with 1.2 s breaths, after a lead-in in a quiet
    // room: no period, and flatter than any word. Early in each one it
    // passed for a fan switched on: the floor jumped to it, the hiss was
    // taken back as the room, and the breaths after it were never measured.
    // A new room that sits high must now hold still for 5 s. (A hiss said
    // between two words, with no breath around it, read the same way.)
    const sss = (sec, peak = -30, o = {}) => SPEECH(sec, Object.assign({ peak, dip: peak - 1.5, whisper: true }, o));
    const held = (part, n) => [QUIET(2), ...turns(n, part, QUIET(1.2)), QUIET(1)];
    for (const [label, parts] of [
      ["four 3 s hisses", held(sss(3), 4)],
      ["three 5 s hisses", held(sss(5), 3)],
      ["four 2 s hisses", held(sss(2), 4)],
      ["four 1.5 s hisses", held(sss(1.5), 4)],
      ["four soft 3 s hisses at −40 dB", held(sss(3, -40), 4)],
      ["four 3 s 'shhh' that sit lower (hf 0.3)", held(sss(3, -30, { hf: 0.3 }), 4)],
      ["a 2 s hiss between two words", [QUIET(1), SPEECH(3), sss(2), SPEECH(3), QUIET(1.2), SPEECH(3)]]
    ]) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const r = await sim(page, { parts, seed });
        const msg = `${label}, seed ${seed} · ${r.segs}`;
        expect(r.falsePauses, msg).toBe(0);
        expect(r.talk, msg).toBeGreaterThan(r.truthTalk - 0.5);
        expect(r.floor, `${label}, seed ${seed}: the quiet room is the floor · ${r.segs}`).toBeLessThan(-60);
        eachPauseMeasured(r, `${label}, seed ${seed}`);
      }
    }
  });

  test("a hiss, a whisper or an inhale said between words, with no silence around it, is talk", async ({ page }) => {
    // A still stretch that comes back at one level after a voice is a fan
    // switched on under the talk, learned 0.4 s into the next pause. A
    // hiss, a whisper or an audible inhale said between words came back
    // too: 0.4 s into the second one the floor jumped to it, it was cut out
    // of the talk and told as a pause the learner never made. The talk
    // between them falls under the hiss, or its high part under the hiss's
    // (a voice sits low), and a fan never does. An inhale is talk, as it
    // always was: nothing tells it from a whispered syllable, so one taken
    // inside a silence splits it in two.
    const sss = (sec, peak = -30, o = {}) => SPEECH(sec, Object.assign({ peak, dip: peak - 1.5, whisper: true }, o));
    const whisper = (sec) => SPEECH(sec, { peak: -30, dip: -36, whisper: true });
    // Breath noise: flat, and it sits higher than a whisper
    const breath = (sec, peak) => sss(sec, peak, { hf: 0.8 });
    const talk = (sec, o = {}) => SPEECH(sec, Object.assign({}, OVER_FAN, o));
    // Four 3 s phrases with an inhale between each two, then a pause
    const phrases = (b, o) => [QUIET(1), ...turns(4, talk(3, o), b), QUIET(1.2), talk(3, o)];
    for (const [label, parts] of [
      ["two 1.5 s hisses at −35 dB inside talk", [QUIET(1), SPEECH(3), sss(1.5, -35), SPEECH(2), sss(1.5, -35), SPEECH(3), QUIET(1.2), SPEECH(3)]],
      ["three 1 s hisses inside talk", [QUIET(1), SPEECH(3), sss(1), SPEECH(2), sss(1), SPEECH(2), sss(1), SPEECH(3), QUIET(1.2), SPEECH(3)]],
      ["two 1.5 s hisses 10 dB under louder talk", [QUIET(1), talk(3), sss(1.5), talk(2), sss(1.5), talk(3), QUIET(1.2), talk(3)]],
      ["sss-word-sss-word", [QUIET(1), sss(1.2), talk(1), sss(1.2), talk(1), QUIET(1.2), sss(1.2), talk(1), sss(1.2), talk(1), QUIET(1.2), talk(2)]],
      ["a whisper alternating with voice", [QUIET(1), whisper(2), talk(2), whisper(2), talk(2), QUIET(1.2), whisper(2), talk(2)]],
      ["a 0.6 s inhale at −44 dB between phrases", phrases(breath(0.6, -44))],
      ["a 0.6 s inhale at −40 dB between phrases with stop consonants", phrases(breath(0.6, -40), { stops: 0.2 })],
      ["a loud 0.6 s inhale at −35 dB between phrases", phrases(breath(0.6, -35))],
      ["an inhale inside a silence", [QUIET(1), ...turns(3, talk(3), [QUIET(0.4), breath(0.6, -44), QUIET(0.5)]).flat(), QUIET(1.2), talk(3)]]
    ]) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const r = await sim(page, { parts, seed });
        const msg = `${label}, seed ${seed} · ${r.segs}`;
        expect(r.falsePauses, msg).toBe(0);
        expect(r.talk, msg).toBeGreaterThan(r.truthTalk - 0.5);
        expect(r.floor, `${label}, seed ${seed}: the quiet room is the floor · ${r.segs}`).toBeLessThan(-60);
        eachPauseMeasured(r, `${label}, seed ${seed}`);
      }
    }
  });

  test("a whisper far under the talk, or a longer inhale between phrases, is talk", async ({ page }) => {
    // A whisper 15–20 dB under the voice, or an inhale of 1–1.5 s, is under
    // every word, as a fan switched on under the talk would be: the second
    // whispered phrase or inhale came back and was learned as the room, cut
    // out of the talk and told as a pause, in talk with a few stop
    // consonants too. A fan's high part holds still; a whisper's follows its
    // syllables, even when they swing only 3 dB, and this inhale's its swell.
    const whisper = (sec, peak, swing, o = {}) => SPEECH(sec, Object.assign({ peak, dip: peak - swing, whisper: true }, o));
    const breath = (sec, peak) => SPEECH(sec, { peak, dip: peak - 1.5, whisper: true, hf: 0.8 });
    const talk = (sec, o = {}) => SPEECH(sec, Object.assign({}, OVER_FAN, o));
    // Three whispered phrases, each followed by a voiced one, then a pause
    const alternate = (w, o) => [QUIET(1), ...[0, 1, 2].flatMap(() => [w, talk(2, o)]), QUIET(1.2), talk(2, o)];
    const phrases = (b, o) => [QUIET(1), ...turns(4, talk(3, o), b), QUIET(1.2), talk(3, o)];
    for (const [label, parts] of [
      ["a whisper at −38 dB (3 dB swing) alternating with voice, 10% stops", alternate(whisper(2, -38, 3), { stops: 0.1 })],
      ["a whisper at −40 dB (3 dB swing) alternating with voice", alternate(whisper(2, -40, 3))],
      ["a whisper at −42 dB (3 dB swing) alternating with voice, 20% stops", alternate(whisper(2, -42, 3), { stops: 0.2 })],
      ["a whisper that sits lower (hf 0.25) alternating with voice", alternate(whisper(2, -30, 4, { hf: 0.25 }))],
      ["a 1.2 s inhale at −42 dB between phrases, 10% stops", phrases(breath(1.2, -42), { stops: 0.1 })],
      ["a 1.5 s inhale at −40 dB between phrases, 10% stops", phrases(breath(1.5, -40), { stops: 0.1 })]
    ]) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const r = await sim(page, { parts, seed });
        const msg = `${label}, seed ${seed} · ${r.segs}`;
        expect(r.falsePauses, msg).toBe(0);
        expect(r.talk, msg).toBeGreaterThan(r.truthTalk - 0.5);
        expect(r.floor, `${label}, seed ${seed}: the quiet room is the floor · ${r.segs}`).toBeLessThan(-60);
        eachPauseMeasured(r, `${label}, seed ${seed}`);
      }
    }
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

  test("a white fan switched on in a pause: the pause runs on, and the room is the fan", async ({ page }) => {
    // A broadband fan sits as high as a held "sss" and holds as still, so a
    // new room that sits high must hold still for 5 s, longer than the
    // pause it came on in. It comes back in the next pause, at the level it
    // held before a voice came over it, and that tells it from a hiss: the
    // floor learned it there but left the speech the fan had opened in
    // place, and the 4 s pause read as 0.5 s.
    for (const db of [-40, -45]) {
      for (const seed of [1, 2, 3, 4, 5, 6]) {
        const parts = [QUIET(1), SPEECH(3), QUIET(4), ...turns(3, SPEECH(3, OVER_FAN), QUIET(1.2))];
        const r = await sim(page, { parts, seed, fan: { db, from: 4.5, wobble: 1, hf: 1.41 } });
        const label = `white fan at ${db} dB, seed ${seed}`;
        expect(r.falsePauses, `${label} · ${r.segs}`).toBe(0);
        // Its end was told when the fan came on, and only then; the segments
        // have it whole
        expect(r.ended.filter((e) => e.start < 4.2), `${label} · ${r.segs}`).toHaveLength(1);
        const first = r.segs.match(/ p4\.0\d-(\d+\.\d\d) /);
        expect(first && Number(first[1]), `${label}: the 4 s pause · ${r.segs}`).toBeGreaterThan(7.9);
        expect(first && Number(first[1]), `${label}: the 4 s pause · ${r.segs}`).toBeLessThan(8.15);
        expect(Math.abs(r.floor - db), `${label}: the fan is the room · ${r.segs}`).toBeLessThan(3);
        r.silences.slice(1).forEach((x, i) => {
          expect(x.measured, `${label}: silence ${i + 2} · ${r.segs}`).not.toBeNull();
          expect(Math.abs(x.measured - x.sec), `${label}: silence ${i + 2} · ${r.segs}`).toBeLessThan(0.15);
        });
      }
    }
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

  test("a hum the learner talks over from Start is learned from the pauses", async ({ page }) => {
    // Talk from the first frame, or after a lead-in too short for the take
    // to open with a second of the hum alone. Nothing told the hum from the
    // voice, and the floor stayed at −70 all take: no pause was measured.
    // Now a pause at the level the take opened with, or the third pause at
    // the level of the first two, is the room; those two are then told late.
    for (const lead of [0, 0.3, 0.5]) {
      for (const [label, room] of [
        ["hum at −36 dB", { hum: { db: -36, hz: 120 } }],
        ["hum at −36 dB with a fan at −38", { hum: { db: -36, hz: 120 }, fan: { db: -38 } }],
        ["hum at −42 dB, under the pitch detector", { hum: { db: -42, hz: 100 } }]
      ]) {
        const parts = [...(lead ? [QUIET(lead)] : []), ...turns(5, SPEECH(3, OVER_FAN), QUIET(1.2))];
        const r = await sim(page, Object.assign({ parts }, room));
        const msg = `${label}, ${lead} s lead-in · ${r.segs}`;
        expect(r.falsePauses, msg).toBe(0);
        expect(Math.abs(r.floor - room.hum.db), msg).toBeLessThan(3);
        eachPauseMeasured(r, `${label}, ${lead} s lead-in`);
      }
    }
    // Longer pauses, and a short 0.8 s one
    for (const sec of [2, 0.8]) {
      const r = await sim(page, { parts: turns(4, SPEECH(3, OVER_FAN), QUIET(sec)), hum: { db: -36, hz: 120 } });
      eachPauseMeasured(r, `${sec} s pauses`);
    }
    // A hum under a fan, together just over the gate, so the gate shuts for
    // a few frames on the room's own dips. Any 40 ms shut used to mean a
    // quiet room and switched the pauses off as a way to learn it, so about
    // one long take in four never learned this room: no pause measured in
    // eight turns. A pause stretch at the level the gate shut at is still
    // the room; one well over it (a filler) is not.
    for (const seed of [2, 10, 22, 26]) {
      const parts = turns(8, SPEECH(3, { peak: -25, dip: -40, stops: 0.2 }), QUIET(1.2));
      const r = await sim(page, { parts, seed, hum: { db: -48, hz: 120 }, fan: { db: -50 } });
      const label = `hum at −48 dB with a fan at −50, seed ${seed}`;
      expect(r.falsePauses, `${label} · ${r.segs}`).toBe(0);
      expect(r.floor, `${label}: the room is the floor · ${r.segs}`).toBeGreaterThan(-50);
      // The first pauses may go before the room is learned (told late)
      r.silences.slice(3).forEach((x, i) => {
        expect(x.measured, `${label}: silence ${i + 4} · ${r.segs}`).not.toBeNull();
        expect(Math.abs(x.measured - x.sec), `${label}: silence ${i + 4} · ${r.segs}`).toBeLessThan(0.2);
      });
    }
  });

  test("sensitivity 10: a hum about as loud as the room's hiss", async ({ page }) => {
    // The hiss alone is noise and is learned in 0.6 s. A hum 0–3 dB under it
    // gives the room a period, so the fan test reads it as a voice.
    const loud = { peak: -15, dip: -32 };
    for (const rel of [0, -2, -3]) {
      for (const lead of [0, 0.4]) {
        const parts = [...(lead ? [QUIET(lead)] : []), ...turns(5, SPEECH(3, loud), QUIET(1.2))];
        const r = await sim(page, { parts, room: -56, sens: 10, hum: { db: -56 + rel, hz: 120 } });
        const label = `hum ${rel} dB against the hiss, ${lead} s lead-in`;
        expect(r.falsePauses, `${label} · ${r.segs}`).toBe(0);
        eachPauseMeasured(r, label);
      }
    }
  });

  test("two soft 'mmm's at one level in a quiet room are not a hum", async ({ page }) => {
    // Talk from the first frame with no pause, so no quiet room has been
    // heard, and two 1 s fillers at one level, under every dip of the talk:
    // the shape of a hum in two pauses. A stop consonant's closure falls to
    // the quiet room, far under the fillers; nothing is quieter than a hum
    // in a room that has one.
    const mmm = (level, vibDb = 0.5) => NOTE(1, { level, vibDb, vibCents: 5 });
    for (const [peak, dip] of [
      [-25, -35],
      [-20, -36]
    ]) {
      for (const level of [-37, -43]) {
        const talk = SPEECH(3, { peak, dip, stops: 0.3 });
        for (const seed of [1000, 8919, 16838]) {
          const r = await sim(page, { seed, parts: [talk, mmm(level), talk, mmm(level + 1), talk] });
          const label = `speech ${peak}/${dip} dB, 'mmm' at ${level} dB, seed ${seed} · ${r.segs}`;
          expect(r.falsePauses, label).toBe(0);
          expect(r.ended, label).toEqual([]);
        }
      }
      // A closure that falls only to just under the gate (−46.3 dB), only
      // 2.5 dB under the fillers (a voiced stop's murmur), still shuts the
      // gate for a few frames, which a room that holds it open never does
      const murmur = NOTE(0.12, { level: -48, vibDb: 0 });
      const talk = SPEECH(3, { peak, dip });
      for (const seed of [1000, 8919, 16838]) {
        const parts = [SPEECH(1.5, { peak, dip }), murmur, SPEECH(1.5, { peak, dip }), mmm(-45.5, 0.3), talk, mmm(-45.5, 0.3), talk];
        const r = await sim(page, { seed, parts });
        const label = `speech ${peak}/${dip} dB, a murmur at −48 dB, 'mmm' at −45.5 dB, seed ${seed} · ${r.segs}`;
        expect(r.falsePauses, label).toBe(0);
        expect(r.ended, label).toEqual([]);
      }
    }
    // Talk with few stops or none never falls to the quiet room, so the two
    // fillers were the hum's shape after all: the second was learned as the
    // room, both read as pauses, and 2 s of talk as soft as them was lost.
    // A hum now has to come back a third time.
    for (const stops of [0.1, 0.05, 0]) {
      const talk = SPEECH(3, { peak: -25, dip: -38, stops });
      for (const seed of [1000, 8919, 16838]) {
        const r = await sim(page, { seed, parts: [talk, mmm(-40), talk, mmm(-40), talk] });
        const label = `${stops * 100} % stops, 'mmm' at −40 dB, seed ${seed} · ${r.segs}`;
        expect(r.falsePauses, label).toBe(0);
        expect(r.ended, label).toEqual([]);
        expect(r.talk, label).toBeGreaterThan(r.truthTalk - 0.5);
      }
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
