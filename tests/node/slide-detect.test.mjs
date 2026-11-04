// How s14 (staccato / legato) tells a slide from a step: the way from the old pitch to within a third of a semitone of
// the new one takes more than a quarter second. This is the detector the browser test "s14 sloppy" leans on, and until
// now only that test pinned it, with a synthetic voice whose 0,4 s slide MEASURES 0,26 s: a hair over the line, so the
// sampling clock (26 ms a frame, a different phase every run) decided it. One run in twelve waited 20 s for a slide
// that never counted and failed CI.
//
// The detector is run here on the real thing (VTPracticeModes "staccatoLegato", _segment) with a pitch track cut at
// every phase of the sampling clock, because the phase is what moved the result. Wrong behaviours rejected:
//   - a clear slide (0,7 s) that counts at one clock phase and not at another;
//   - a step (0,05 s), or an easy 0,15 s change of note, counted as a slide (the line moved down);
//   - the line moved up so that a real slide is missed (a portamento of 0,7 s is the lesson's whole point);
//   - the synthetic voice's slide drifting back onto the line (its length is read from qa/voices/dynamics.js).
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

const FRAME = 0.026; // the analysis frame the browser delivers: ~26 ms
const HOLD_BEFORE = 0.5;
const HOLD_AFTER = 0.5;

/**
 * One legato line: a note at 50, a change to 52 that takes `rampSec` (linear in semitones, as the voice's exponential
 * ramp is), a note at 52. Sampled every FRAME starting `phase` seconds in. The audio behind a frame is not on the
 * frame's clock: it arrives in the device's chunks, so a frame reads audio up to a frame old and sometimes the same
 * audio as the one before (`_newSince` in js/voice-features.js says so; the real tracks hold a pitch for two frames
 * about every other time). `seed` picks that lag per frame, the same every run, never going backwards.
 */
function line(rampSec, phase, seed) {
  const total = HOLD_BEFORE + rampSec + HOLD_AFTER;
  const samples = [];
  let rnd = seed * 2654435761 + 12345;
  const next = () => ((rnd = (rnd * 1103515245 + 12345) % 2147483648) / 2147483648);
  let heard = -1;
  let i = 0;
  for (let t = phase; t < total; t += FRAME, i++) {
    heard = Math.max(heard, t - Math.floor(next() * 3) * 0.5 * FRAME);
    const u = Math.min(1, Math.max(0, (heard - HOLD_BEFORE) / rampSec));
    const jitter = ((i * 7) % 5) * 0.02 - 0.04;
    samples.push({ t, midi: 50 + 2 * u + jitter, db: -20 });
  }
  return { t0: 0, t1: total, samples };
}

function notesOf(rampSec, phase, seed) {
  const mode = W.VTPracticeModes.get("staccatoLegato");
  mode.state = { t: HOLD_BEFORE + rampSec + HOLD_AFTER };
  return mode._segment(line(rampSec, phase, seed));
}
const slidesOf = (rampSec, phase, seed) => notesOf(rampSec, phase, seed).filter((n) => n.slide).length;
/** Every sampling-clock phase (27 of them across one frame) against 40 lag patterns. */
const runs = [];
for (let k = 0; k < 27; k++) for (let seed = 1; seed <= 40; seed++) runs.push([(k * FRAME) / 27, seed]);
/** How many of the runs see exactly `want` slides. */
const agreeing = (rampSec, want) => runs.filter(([p, seed]) => slidesOf(rampSec, p, seed) === want).length;

test("a clear slide counts once, however the sampling clock and the audio chunks fall", () => {
  assert.equal(agreeing(0.7, 1), runs.length);
});

test("the slide is drawn between two pitched notes, the way it took", () => {
  const out = notesOf(0.7, 0.01, 1);
  const slide = out.find((n) => n.slide);
  assert.ok(slide && slide.glide && slide.midi == null, "the way is a glide without a pitch of its own");
  const pitched = out.filter((n) => n.midi != null);
  assert.equal(pitched.length, 2);
  assert.ok(Math.abs(pitched[0].midi - 50) < 0.3 && Math.abs(pitched[1].midi - 52) < 0.3, `${pitched.map((n) => n.midi)}`);
  assert.ok(pitched[0].t1 <= slide.t0 + 1e-9 && slide.t1 <= pitched[1].t0 + 1e-9, "the notes stop where the slide starts and start where it ends");
  assert.ok(slide.t1 - slide.t0 > 0.35, `a 0,7 s slide is drawn as ${(slide.t1 - slide.t0).toFixed(2)} s`);
});

test("a step between two notes (0,05 s) and an easy change (0,15 s) are never slides", () => {
  assert.equal(agreeing(0.05, 0), runs.length);
  assert.equal(agreeing(0.15, 0), runs.length);
});

test("a note held on one pitch has no slide", () => {
  assert.equal(slidesOf(0.001, 0.01, 1), 0);
});

test("the old 0,4 s slide was on the line: it counted in some runs and not in others (why it is 0,7 s now)", () => {
  const seen = agreeing(0.4, 1);
  assert.ok(seen > 0 && seen < runs.length, `${seen} of ${runs.length} runs saw the 0,4 s slide`);
});

test("the sloppy voice's slide is clear of the line (its length is read from qa/voices/dynamics.js)", () => {
  const sec = Number(/const SLIDE_SEC = ([\d.]+);/.exec(read("qa/voices/dynamics.js"))?.[1]);
  assert.ok(sec > 0, "qa/voices/dynamics.js names the slide length");
  assert.equal(agreeing(sec, 1), runs.length, `${sec} s`);
});
