// The rise of a sung attack, as s14 (staccato ▲ "hammer") and s12 (onset)
// measure it. Wrong behaviours rejected:
// - Measuring the rise against the loudest moment of the next 120 ms. Vibrato
//   through the vowel's formants swings the level, and when the attack lands
//   in a trough the 90 % mark waits for the next crest: a 4 ms glottal attack
//   read as 25–65 ms, so s14 marked only 2 of 13 hard attacks (CI went red
//   when load took it to 1). The fix measures against the level the note holds.
// - The opposite error, calling a 30 ms balanced attack a hammer.
// - Rounding the crossings to 2,5 ms samples, which moves a 13 ms rise to 15.
// The voice is a real waveform cut into engine-sized frames and fed through
// the real fast envelope (12,5 ms smoothing), so the numbers are the app's own.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

function load() {
  const win = { VTPitchUtils: { freqToMidi: (hz) => 69 + 12 * Math.log2(hz / 440) } };
  const ctx = { window: win, document: { documentElement: { lang: "en" } }, Math, console, Float32Array, Array };
  runInNewContext(read("js/voice-features.js"), ctx);
  runInNewContext(read("js/practice-modes.js"), ctx);
  return win;
}
const W = load();
const F = W.VTFeatures;

const SR = 48000;
const BUF = 2048;
const HOP = 1024; // new samples per frame: 21,3 ms, as at 48 kHz and 47 fps

/**
 * A 220 Hz voice that starts at 0.3 s with a linear `rampMs` attack and a
 * 5 Hz level swing of ±`am` whose trough falls on the attack.
 */
function voice(rampMs, am, sec = 0.7) {
  const x = new Float32Array(Math.round(sec * SR));
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5) * 0.002;
  const on = 0.3;
  for (let i = 0; i < x.length; i++) {
    const t = i / SR;
    const g = t < on ? 0 : Math.min(1, (t - on) / (rampMs / 1000));
    const swing = 1 - am * Math.cos(2 * Math.PI * 5 * (t - on));
    x[i] = 0.3 * g * swing * Math.sin(2 * Math.PI * 220 * t) + rnd();
  }
  return { x, onSample: Math.round(on * SR) };
}

/**
 * Frames as Chromium hands them over: every `frameMs` of wall time the latest
 * BUF samples, of which only the audio rendered so far, in `chunk`-sample
 * pieces on the device's own clock. `stallAt` (seconds) freezes the tab for
 * 120 ms there; the engine reports such a frame as 50 ms.
 */
function* frames(x, { frameMs = (HOP / SR) * 1000, chunk = 1, phaseMs = 0, stallAt = null } = {}) {
  let wall = 0.05 + phaseMs / 1000;
  let last = wall;
  let stalled = false;
  while (wall < x.length / SR) {
    const avail = Math.floor((wall * SR) / chunk) * chunk;
    if (avail >= BUF) yield { buf: x.subarray(avail - BUF, avail), sampleRate: SR, dtMs: Math.min(50, (wall - last) * 1000), t: wall, end: avail };
    last = wall;
    wall += frameMs / 1000;
    if (stallAt != null && !stalled && wall >= stallAt) {
      stalled = true;
      wall += 0.12;
    }
  }
}

/** Feed the voice in frames; open the run where the app would, measure at 0.13 s. */
function measureS14(rampMs, am, schedule = {}) {
  const m = W.VTPracticeModes.get("staccatoLegato");
  const env = new F.Envelope({ keepSec: 3 });
  m.state = { env, bufMs: (BUF / SR) * 1000, t: 0 };
  const { x, onSample } = voice(rampMs, am);
  let run = null;
  for (const f of frames(x, schedule)) {
    env.feed(f);
    m.state.t = f.t;
    // The engine's sound edge sees the note in the frame it starts in
    if (!run && f.end > onSample + 0.005 * SR) {
      run = { t0: f.t, startTotal: env.total, maxDt: 0, attackDone: false, hammer: null };
    }
    if (run && f.t - run.t0 < 0.2) run.maxDt = Math.max(run.maxDt, f.dtMs);
    if (run && !run.attackDone && f.t - run.t0 >= 0.13) m._attack(run);
  }
  return run;
}

test("s14: a 4 ms attack landing in a vibrato trough is a hammer (red on the peak-referenced rise)", () => {
  const run = measureS14(4, 0.15);
  assert.ok(run.riseMs < 14, `rise ${run.riseMs?.toFixed(1)} ms`);
  assert.equal(run.hammer, true);
});

test("s14: a 30 ms attack with the same vibrato is not a hammer", () => {
  const run = measureS14(30, 0.15);
  assert.ok(run.riseMs > 18, `rise ${run.riseMs?.toFixed(1)} ms`);
  assert.equal(run.hammer, false);
});

test("s14 controls: a steady 4 ms attack is a hammer, a steady 30 ms one is not", () => {
  assert.equal(measureS14(4, 0).hammer, true);
  assert.equal(measureS14(30, 0).hammer, false);
});

test("s14: audio lost inside an attack leaves it unmeasured (null), never 'not a hammer'", () => {
  assert.equal(measureS14(4, 0.15, { stallAt: 0.31 }).hammer, null);
  // Control: the same stall well after the attack is measured
  assert.equal(measureS14(4, 0.15, { stallAt: 0.6 }).hammer, true);
});

test("envelope: audio that arrives in chunks out of step with the frames is read once, and only once", () => {
  // Chromium handed over 0, 384, 768 or 1280 new samples per 16,7 ms frame
  // (three frames in four were off); counting the frame's time re-read old
  // audio or skipped new, which put steps inside a slow rise
  const { x } = voice(30, 0.15);
  for (const chunk of [384, 512, 1280]) {
    for (const phaseMs of [0, 3, 7, 11]) {
      const env = new F.Envelope({ keepSec: 3 });
      const ends = [];
      for (const f of frames(x, { frameMs: 16.67, chunk, phaseMs })) {
        env.feed(f);
        ends.push(f.end);
      }
      // The same audio read as a steady trickle, from the same first frame
      // (128-sample steps, each exactly its frame's time, so the old count was right there)
      const ref = new F.Envelope({ keepSec: 3 });
      for (let e = ends[0]; e <= ends.at(-1); e += 128) ref.feed({ buf: x.subarray(e - BUF, e), sampleRate: SR, dtMs: (128 / SR) * 1000 });
      const a = Array.from(env.window(0.5));
      const b = Array.from(ref.window(0.5));
      assert.equal(env.total, ref.total, `chunk ${chunk}, phase ${phaseMs} ms: ${env.total} envelope samples, ${ref.total} in the audio`);
      const worst = Math.max(...a.map((v, i) => Math.abs(v - b[i])));
      assert.ok(worst < 1e-6, `chunk ${chunk}, phase ${phaseMs} ms: envelope off by ${worst.toFixed(4)}`);
    }
  }
});

test("s14 under chunked audio: 4 ms attacks always hammers, 30 ms ones never", () => {
  for (const chunk of [480, 1280]) {
    for (const phaseMs of [0, 2, 5, 8, 11, 14]) {
      assert.equal(measureS14(4, 0.15, { frameMs: 16.67, chunk, phaseMs }).hammer, true, `4 ms, chunk ${chunk}, phase ${phaseMs}`);
      assert.equal(measureS14(30, 0.15, { frameMs: 16.67, chunk, phaseMs }).hammer, false, `30 ms, chunk ${chunk}, phase ${phaseMs}`);
    }
  }
});

test("envelope: a test tone that repeats sample for sample still keeps time", () => {
  // 375 Hz at 48 kHz is exactly 128 samples a period, as a wavetable
  // oscillator plays it: the tail matches every 128 samples, and the match
  // nearest the frame's own time is taken, not the first (no new audio)
  const period = Float32Array.from({ length: 128 }, (_, i) => 0.3 * Math.sin((2 * Math.PI * i) / 128));
  const x = new Float32Array(SR);
  for (let i = 0; i < x.length; i++) x[i] = period[i % 128];
  const env = new F.Envelope({ keepSec: 3 });
  let first = null;
  let last = null;
  for (const f of frames(x, { frameMs: 16.67, chunk: 128 })) {
    env.feed(f);
    first = first ?? f.end - 0.02 * SR;
    last = f.end;
  }
  const want = (last - first) / Math.round((SR * 2.5) / 1000);
  assert.ok(Math.abs(env.total - want) <= 0.05 * want, `${env.total} envelope samples for ${want.toFixed(0)} of audio`);
});

test("envelope: a flat tail (digital silence) cannot be placed, so the frame's time is used", () => {
  const env = new F.Envelope();
  const zeros = new Float32Array(BUF);
  env.feed({ buf: zeros, sampleRate: SR, dtMs: 20 });
  const before = env.total;
  env.feed({ buf: zeros, sampleRate: SR, dtMs: 20 });
  assert.equal(env.total - before, Math.round((0.02 * SR) / Math.round((SR * 2.5) / 1000)), "20 ms of silence still moves the clock");
});

test("riseTime finds where between samples each mark was crossed", () => {
  // A ramp of 1/7 per 2,5 ms sample: 10 % at sample 0.7, 90 % at 6.3, so 14 ms
  const seg = Array.from({ length: 12 }, (_, i) => Math.min(1, i / 7));
  const r = F.riseTime(seg, 0, 1, 400);
  assert.ok(Math.abs(r.ms - 14) < 0.01, `rise ${r.ms} ms (rounded samples give 15)`);
  assert.equal(F.riseTime([0, 0, 0], 0, 1, 400), null);
  assert.equal(F.riseTime([0, 0.5, 0.5], 0, 1, 400).ms, null);
});

test("attackLevel: where the fast rise ends, not a later crest, not the breath before it", () => {
  // Rise 0 → 0.8 in four steps, then a slow swing up to 1.0 (a crest)
  const swing = [0, 0, 0.2, 0.4, 0.6, 0.8, 0.82, 0.85, 0.9, 0.95, 1.0, 0.98];
  assert.equal(F.attackLevel(swing, 1), 0.8);
  // Breath at 0.1 first (its own small step), then the voice's steep rise
  const breath = [0, 0.1, 0.1, 0.1, 0.1, 0.5, 0.9, 0.92, 0.93, 0.93];
  assert.equal(F.attackLevel(breath, 1), 0.9);
  // Still rising at the end of what was seen: no level yet
  assert.equal(F.attackLevel([0, 0.2, 0.4, 0.6, 0.8], 1), null);
});

test("s12 cuts its rise the same way: a 4 ms attack in a vibrato trough stays under its 22 ms 'abrupt' bound, a 30 ms one over it", () => {
  // s12 measures against the level the note settles at (190–340 ms in), where
  // a 300 ms window holds a whole vibrato cycle, so a crest cannot pull it up
  const rise = (rampMs) => {
    let got = null;
    const cap = new F.OnsetCapture({ onOnset: (r) => (got = r) });
    const { x, onSample } = voice(rampMs, 0.15, 1);
    for (let end = BUF; end <= x.length; end += HOP) {
      const on = end > onSample + 0.005 * SR;
      cap.feed({ buf: x.subarray(end - BUF, end), sampleRate: SR, dtMs: (HOP / SR) * 1000, sounding: on, rawFreq: on ? 220 : 0 });
    }
    return got.riseMs;
  };
  const bound = new F.OnsetCapture().thresholds.abruptRiseMs;
  assert.equal(bound, 22);
  assert.ok(rise(4) < bound, `4 ms attack read as ${rise(4).toFixed(1)} ms`);
  assert.ok(rise(30) > bound, `30 ms attack read as ${rise(30).toFixed(1)} ms`);
});
