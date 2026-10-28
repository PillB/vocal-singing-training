/**
 * The pitch detector over the whole singing range, not only a man's.
 *
 * VTPitchUtils.detectPitch (js/pitch-visualizer.js) and the practice
 * engine's gate on it (PITCH_MIN–PITCH_MAX in js/practice-engine.js) are
 * fed the frames the engine reads from a microphone. The engine itself
 * runs: its _loop() reads each frame from a stand-in analyser, and the
 * cases check the `rawFreq` it hands every exercise. The voices come from
 * tests/helpers/pitch-sim.js: a glottal source (Rosenberg pulses with a
 * little jitter and shimmer) through five vowel formants for a man, a
 * woman or a child. Frames are 2048 samples at 48 and 44.1 kHz, 60 a
 * second, after the MIC gain at sensitivity 7.
 *
 * - High voices: C5, E5, A5 and C6 sung by a woman or a child, on each of
 *   the five vowels, read within 50 cents. The autocorrelation detector
 *   this replaced read everything above ~400 Hz an octave low, and from
 *   ~800 Hz a twelfth low.
 * - Low voices stay as they are. A bass's E2 and a baritone's G2–C3 with a
 *   strong second harmonic (10–13 dB over the fundamental) read their own
 *   note, never the octave above.
 * - Silence and noise (white, pink, a fan, a breath, an "sss") give no
 *   pitch.
 * - In the app, an A5 sung into an exercise shows "A5" as your note, and a
 *   man's A2 still shows "A2". In the sirens the A5 is drawn inside the
 *   window (it used to stop at G5) and not marked "aprox.".
 * - A chord's tone to sing moves with the octave control: the singing
 *   register (120–280 Hz) is shifted with the material, so at +2 the target
 *   is C5, not the chord's bass note C4.
 */
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const SIM = path.join(__dirname, "helpers", "pitch-sim.js");

const NOTES = { E2: 82.41, G2: 98.0, A2: 110.0, B2: 123.47, C3: 130.81, C5: 523.25, E5: 659.26, A5: 880.0, C6: 1046.5 };

async function detectorPage(page) {
  await page.setContent("<!doctype html><title>pitch range</title>");
  await page.addScriptTag({ url: BASE + "/js/pitch-visualizer.js" });
  await page.addScriptTag({ url: BASE + "/js/practice-engine.js" });
  await page.addScriptTag({ path: SIM });
}

/**
 * Each case's steady frames through the engine: { label, frames, within
 * (share of frames within 50 cents of the truth), up (share an octave
 * above), none (share with no pitch), median (Hz), h2 (H2 − H1 in dB) }.
 */
async function measure(page, cases) {
  return page.evaluate((cases) => {
    const S = window.VTPitchSim;
    function harmDb(x, f, sr) {
      const n0 = Math.floor(x.length * 0.2);
      const N = Math.floor(x.length * 0.6);
      let re = 0;
      let im = 0;
      for (let i = 0; i < N; i++) {
        const v = x[n0 + i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
        re += v * Math.cos((2 * Math.PI * f * i) / sr);
        im -= v * Math.sin((2 * Math.PI * f * i) / sr);
      }
      return 20 * Math.log10(Math.hypot(re, im) + 1e-12);
    }
    return cases.map((c) => {
      const sr = c.sr;
      const sig = S.render(c.spec, sr);
      const frames = S.frames(sig, sr);
      const eng = new window.VTPracticeEngine();
      eng.sensitivity = 7;
      eng.running = true;
      eng.audioCtx = { sampleRate: sr };
      eng.buf = new Float32Array(frames[0].buf.length);
      let cur = null;
      eng.analyser = {
        getFloatTimeDomainData(b) {
          b.set(cur);
        }
      };
      let got = null;
      eng.onFrame = (f) => (got = f.rawFreq);
      const steady = c.spec.kind === "noise";
      const rows = [];
      for (const f of frames) {
        cur = f.buf;
        got = null;
        eng._loop();
        if (eng.raf) cancelAnimationFrame(eng.raf);
        if (steady || f.voiced >= 0.95) rows.push({ truth: f.truth, est: got });
      }
      eng.running = false;
      const n = rows.length;
      const cents = (r) => 1200 * Math.log2(r.est / r.truth);
      const est = rows.filter((r) => r.est != null);
      const sorted = est.map((r) => r.est).sort((a, b) => a - b);
      return {
        label: c.label,
        frames: n,
        pitched: est.length / n,
        within: rows.filter((r) => r.est != null && Math.abs(cents(r)) <= 50).length / n,
        up: rows.filter((r) => r.est != null && Math.abs(cents(r) - 1200) <= 100).length / n,
        median: sorted.length ? Math.round(sorted[sorted.length >> 1] * 10) / 10 : null,
        h2: c.spec.kind === "noise" ? null : Math.round((harmDb(sig.x, 2 * c.spec.f0, sr) - harmDb(sig.x, c.spec.f0, sr)) * 10) / 10
      };
    });
  }, cases);
}

const pct = (x) => `${Math.round(x * 100)}%`;

test.describe("detectPitch through the engine, on synthetic voices", () => {
  for (const voice of ["female", "child"]) {
    test(`a ${voice}'s C5, E5, A5 and C6 read within 50 cents on every vowel`, async ({ page }) => {
      await detectorPage(page);
      const cases = [];
      for (const sr of [48000, 44100])
        for (const note of ["C5", "E5", "A5", "C6"])
          for (const vowel of "aeiou") cases.push({ sr, label: `${voice} /${vowel}/ ${note} (${NOTES[note]} Hz) at ${sr / 1000} kHz`, spec: { kind: "vowel", voice, vowel, f0: NOTES[note], sec: 0.7 } });
      // and a classical vibrato on A5 (±50 cents at 5.5 Hz)
      for (const sr of [48000, 44100]) cases.push({ sr, label: `${voice} /a/ A5 with ±50 c vibrato at ${sr / 1000} kHz`, spec: { kind: "vowel", voice, vowel: "a", f0: NOTES.A5, vibCents: 50, sec: 0.8 } });
      const res = await measure(page, cases);
      const bad = res.filter((r) => r.within < 0.9).map((r) => `${r.label}: ${pct(r.within)} of ${r.frames} frames within 50 c, reads ${r.median ?? "nothing"} Hz`);
      expect(bad, "cases where under 90 % of the steady frames read within 50 cents").toEqual([]);
    });
  }

  test("a bass's E2 and a baritone's G2–C3 with a strong second harmonic read their own note, not the octave up", async ({ page }) => {
    await detectorPage(page);
    const cases = [];
    for (const sr of [48000, 44100])
      for (const note of ["E2", "G2", "A2", "B2", "C3"])
        for (const vowel of "aeo") cases.push({ sr, label: `male /${vowel}/ ${note} (${NOTES[note]} Hz), H2 peak +12 dB, at ${sr / 1000} kHz`, spec: { kind: "vowel", voice: "male", vowel, f0: NOTES[note], h2Db: 12, sec: 0.8 } });
    // the bass also on /i/ and /u/, where his H2 is stronger still
    for (const sr of [48000, 44100]) for (const vowel of "iu") cases.push({ sr, label: `male /${vowel}/ E2, H2 peak +12 dB, at ${sr / 1000} kHz`, spec: { kind: "vowel", voice: "male", vowel, f0: NOTES.E2, h2Db: 12, sec: 0.8 } });
    const res = await measure(page, cases);
    // The signals are what they say: H2 well over H1
    res.forEach((r) => expect(r.h2, `${r.label}: H2 − H1 (dB)`).toBeGreaterThanOrEqual(9.5));
    const up = res.filter((r) => r.up > 0).map((r) => `${r.label} (H2 − H1 ${r.h2} dB): ${pct(r.up)} of frames an octave up, reads ${r.median} Hz`);
    expect(up, "cases with any frame an octave up").toEqual([]);
    const off = res.filter((r) => r.within < 0.95).map((r) => `${r.label}: ${pct(r.within)} within 50 c, reads ${r.median ?? "nothing"} Hz`);
    expect(off, "cases where under 95 % of the frames read within 50 cents").toEqual([]);
  });

  test("silence and noise give no pitch", async ({ page }) => {
    await detectorPage(page);
    const sounds = [
      ["silence", -100],
      ["white", -50],
      ["white", -40],
      ["white", -30],
      ["pink", -40],
      ["fan", -35],
      ["breath", -35],
      ["sss", -30]
    ];
    const cases = [];
    for (const sr of [48000, 44100])
      for (const [noise, db] of sounds) cases.push({ sr, label: `${noise}${noise === "silence" ? "" : ` at ${db} dBFS`} at ${sr / 1000} kHz`, spec: { kind: "noise", noise, levelDb: db, sec: 1.5, seed: 5 } });
    const res = await measure(page, cases);
    const bad = res.filter((r) => r.pitched > 0.05).map((r) => `${r.label}: a pitch on ${pct(r.pitched)} of ${r.frames} frames (median ${r.median} Hz)`);
    expect(bad, "sounds with a pitch on over 5 % of their frames").toEqual([]);
  });
});

test.describe("the note the app shows", () => {
  /**
   * The microphone is the synthetic voice, looping, from its own audio
   * context (rendered at that context's rate). Before goto().
   */
  async function singInto(page, spec) {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", "en");
        sessionStorage.setItem("vt_e2e", "1");
        localStorage.setItem("vt_octave_shift", "0");
        localStorage.setItem("vt_range_auto", "0");
      } catch {
        /* ignore */
      }
    });
    await page.addInitScript({ content: fs.readFileSync(SIM, "utf8") });
    await page.addInitScript((sp) => {
      navigator.mediaDevices.getUserMedia = async () => {
        const ac = new (window.AudioContext || window.webkitAudioContext)();
        if (ac.state !== "running") await ac.resume().catch(() => {});
        const sig = window.VTPitchSim.render(Object.assign({ kind: "vowel", sec: 8 }, sp), ac.sampleRate);
        const buf = ac.createBuffer(1, sig.x.length, ac.sampleRate);
        buf.getChannelData(0).set(sig.x);
        const src = ac.createBufferSource();
        src.buffer = buf;
        src.loop = true;
        const dest = ac.createMediaStreamDestination();
        src.connect(dest);
        src.start();
        window.__micOn = true;
        return dest.stream;
      };
    }, spec);
  }

  /** The "You" reading of #pitch-stats, every 100 ms for 2.5 s: the one shown most. */
  async function shownNote(page, exercise) {
    await page.goto(BASE + "/?e2e", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTApp?.openExercise);
    await page.evaluate((x) => window.VTApp.openExercise(x), exercise);
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await page.waitForTimeout(300);
    await page.evaluate(() => {
      const a = document.getElementById("chk-auto-piano");
      if (a && a.checked) a.click();
    });
    await page.locator("#btn-practice-start").click();
    await page.waitForFunction(() => !!window.__micOn, null, { timeout: 15000 });
    await page.waitForTimeout(1000);
    const seen = {};
    for (let i = 0; i < 25; i++) {
      const you = await page.evaluate(() => {
        const s = [...document.querySelectorAll("#pitch-stats span")].find((el) => /^You\b/.test(el.textContent.trim()));
        return s ? s.textContent.trim().replace(/^You\s*/, "") : "";
      });
      seen[you] = (seen[you] || 0) + 1;
      await page.waitForTimeout(100);
    }
    return { shown: Object.keys(seen).sort((a, b) => seen[b] - seen[a])[0], seen };
  }

  test("an A5 sung into the fry → /A/ hold shows A5", async ({ page }) => {
    await singInto(page, { voice: "female", vowel: "a", f0: NOTES.A5 });
    const r = await shownNote(page, "s1-vocal-fry");
    expect(r.shown, `the "You" readings: ${JSON.stringify(r.seen)}`).toBe("A5");
  });

  test("a man's A2 still shows A2", async ({ page }) => {
    await singInto(page, { voice: "male", vowel: "a", f0: NOTES.A2 });
    const r = await shownNote(page, "s1-vocal-fry");
    expect(r.shown, `the "You" readings: ${JSON.stringify(r.seen)}`).toBe("A2");
  });

  test("an A5 sung into the sirens is drawn inside the window and not marked approximate", async ({ page }) => {
    await singInto(page, { voice: "female", vowel: "a", f0: NOTES.A5 });
    const r = await shownNote(page, "s5-sirens");
    expect(r.shown, `the "You" readings: ${JSON.stringify(r.seen)}`).toBe("A5");
    const st = await page.evaluate(() => {
      const s = window.VTApp.getState().modeInstance.state;
      return { max: s.range.max, approx: !!(s.viz.extent && s.viz.extent.approx) };
    });
    // A5 is MIDI 81: the window grows past it instead of stopping at G5 (79)
    expect(st.max, "the top of the siren window (MIDI)").toBeGreaterThanOrEqual(83);
    expect(st.approx, "an A5 is measured, not estimated").toBe(false);
  });
});

test.describe("material moved by the octave control", () => {
  test("a chord's sung tone moves with the octave: C3 at 0, C4 at +1, C5 at +2", async ({ page }) => {
    await page.setContent("<!doctype html><title>chord target</title><canvas width=300 height=200></canvas>");
    await page.addScriptTag({ url: BASE + "/js/piano.js" });
    await page.addScriptTag({ url: BASE + "/js/pitch-visualizer.js" });
    const got = await page.evaluate(() => {
      const pv = new window.VTPitchVisualizer(document.querySelector("canvas"));
      const out = [];
      for (const shift of [0, 1, 2]) {
        window.VTGetOctaveShift = () => shift;
        // prog1's first chord, C (C2 C3 E3 G3 at 0), as the app hands it over: already shifted
        pv.setTargetFromChord(window.VTTransposeProgression(window.VT_PROGRESSIONS.prog1, shift).chords[0]);
        out.push(Math.round(pv.targetFreq * 100) / 100);
      }
      return out;
    });
    expect(got).toEqual([130.81, 261.63, 523.25]);
  });
});
