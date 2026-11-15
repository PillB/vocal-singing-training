/**
 * The pitch detector on synthetic voices, in Node: the cases of
 * tests/pitch-range.spec.js that decide each stage of
 * VTPitchUtils.detectPitch (js/pitch-visualizer.js), run on the frames the
 * practice engine reads and through the engine's own gate on them
 * (PITCH_MIN–PITCH_MAX, read back as `_latestRawPitch`).
 *
 * Why here as well as in the browser: `node qa/mutate.mjs pitch` plants a
 * defect in one stage of the detector at a time and needs a test that turns
 * red on it in seconds, not a browser run per mutant. Each block below names
 * the stage it holds.
 *
 * The voices are tests/helpers/pitch-sim.js (Rosenberg pulses through five
 * formants for a man, a woman or a child). A case reads its steady frames,
 * those whose samples are all voiced (95 %), and asks the share within
 * 50 cents of the true pitch, an octave above it, more than a semitone off,
 * or with any pitch at all.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";

const require = createRequire(import.meta.url);
const Sim = require("../helpers/pitch-sim.js");
const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

/** The engine with the real detector: `_detectPitch` and the gate it applies. */
function engine() {
  const win = { addEventListener() {}, removeEventListener() {} };
  const ctx = { window: win, Float32Array, Math, performance, console, setTimeout, clearTimeout };
  runInNewContext(read("js/pitch-visualizer.js"), ctx);
  runInNewContext(read("js/practice-engine.js"), ctx);
  return new win.VTPracticeEngine();
}

const eng = engine();

function measure(spec, sr) {
  const sig = Sim.render(spec, sr);
  const rows = [];
  for (const f of Sim.frames(sig, sr)) {
    if (spec.kind !== "noise" && f.voiced < 0.95) continue;
    eng._detectPitch(f.buf, sr);
    rows.push({ truth: f.truth, est: eng._latestRawPitch });
  }
  const n = rows.length;
  const cents = (r) => 1200 * Math.log2(r.est / r.truth);
  const est = rows.filter((r) => r.est != null);
  const sorted = est.map((r) => r.est).sort((a, b) => a - b);
  return {
    frames: n,
    pitched: est.length / n,
    within: est.filter((r) => Math.abs(cents(r)) <= 50).length / n,
    w3c: est.filter((r) => Math.abs(cents(r)) <= 3).length / n,
    up: est.filter((r) => Math.abs(cents(r) - 1200) <= 100).length / n,
    off: est.filter((r) => r.truth > 0 && Math.abs(cents(r)) > 100).length / n,
    median: sorted.length ? Math.round(sorted[sorted.length >> 1] * 10) / 10 : null
  };
}

const RATES = [48000, 44100];
const pct = (x) => `${Math.round(x * 100)}%`;

/** Every case at both rates; the ones `fails` names, with what they read. */
function failing(cases, fails) {
  const bad = [];
  for (const sr of RATES) {
    for (const [label, spec] of cases) {
      const r = measure(spec, sr);
      const why = fails(r);
      if (why) bad.push(`${label} at ${sr / 1000} kHz: ${why} (${r.frames} frames, median ${r.median ?? "nothing"} Hz)`);
    }
  }
  return bad;
}

const within = (share) => (r) => (r.within < share ? `${pct(r.within)} within 50 c` : null);

test("a woman's and a child's C5 to C6 read within 50 cents on open, front and back vowels (the search band and MPM's K)", () => {
  const cases = [];
  for (const voice of ["female", "child"])
    for (const [note, f0] of [["C5", 523.25], ["A5", 880], ["C6", 1046.5]])
      for (const vowel of "aiu") cases.push([`${voice} /${vowel}/ ${note}`, { kind: "vowel", voice, vowel, f0, sec: 0.7 }]);
  assert.deepEqual(failing(cases, within(0.9)), []);
});

test("a man's E2 to C3 with his second harmonic 12 dB over the first never reads the octave up (the octave-down rule)", () => {
  const cases = [];
  for (const [note, f0] of [["E2", 82.41], ["A2", 110], ["C3", 130.81]])
    for (const vowel of "ao") cases.push([`male /${vowel}/ ${note}, H2 +12 dB`, { kind: "vowel", voice: "male", vowel, f0, h2Db: 12, sec: 0.8 }]);
  assert.deepEqual(failing(cases, (r) => (r.up > 0 ? `${pct(r.up)} an octave up` : within(0.95)(r))), []);
});

test("a baritone's G2 and A2 through a microphone that cuts his fundamental, with ±60 cents of vibrato, never reads the octave up (the odd-harmonic test under 320 Hz)", () => {
  // A phone's or a laptop's low cut leaves H2 some 20 dB over H1: the half
  // period passes K, and the vibrato keeps 2L from being five times as
  // periodic as L, so only the odd-harmonic test takes the octave down
  const cases = [["G2", 98], ["A2", 110]].map(([note, f0]) => [`male /a/ ${note}, H2 +24 dB, ±60 c`, { kind: "vowel", voice: "male", vowel: "a", f0, h2Db: 24, vibCents: 60, sec: 0.8 }]);
  assert.deepEqual(failing(cases, (r) => (r.up > 0 ? `${pct(r.up)} an octave up` : within(0.95)(r))), []);
});

test("a breathy high voice whose first formant sits near half her pitch is not read an octave down (the spectrum's say on an octave down)", () => {
  // Breath filtered by F1 differs from itself one period later and not two,
  // like an odd harmonic; in the spectrum it is a band, not a line
  const cases = [
    ["female breathy /e/ 1064 Hz (F1 536 Hz)", { kind: "vowel", voice: "female", vowel: "e", f0: 1064, tilt: "breathy", sec: 0.8 }],
    ["female breathy /i/ 605 Hz (F1 310 Hz)", { kind: "vowel", voice: "female", vowel: "i", f0: 605, tilt: "breathy", sec: 0.8 }]
  ];
  assert.deepEqual(failing(cases, within(0.85)), []);
});

test("a steady tone reads within 3 cents of its pitch (the fractional lag between samples)", () => {
  // A tuner's job: a lag rounded to the sample is up to 7 cents off at
  // 300–380 Hz, enough to move a note across a ±40 c scoring edge
  const cases = [155.56, 293.66, 365].map((f0) => [`a tone at ${f0} Hz`, { kind: "tone", f0, partials: 8, tiltDb: -6, sec: 0.8 }]);
  assert.deepEqual(failing(cases, (r) => (r.w3c < 1 ? `${pct(r.w3c)} within 3 c` : null)), []);
});

test("a pressed /a/ at C5 and E5 with ±80 or ±100 cents of vibrato never reads the octave above (odd harmonics against vibrato)", () => {
  const cases = [];
  for (const voice of ["child", "female"])
    for (const [note, f0] of [["C5", 523.25], ["E5", 659.26]])
      for (const vib of [80, 100]) cases.push([`${voice} pressed /a/ ${note} ±${vib} c`, { kind: "vowel", voice, vowel: "a", f0, tilt: "pressed", vibCents: vib, sec: 1.0 }]);
  assert.deepEqual(failing(cases, (r) => (r.up > 0 ? `${pct(r.up)} an octave up` : within(0.9)(r))), []);
});

test("a dark bass at B1 and C2 and a bass's A1, even 47 cents flat, read their note (the bottom of the band)", () => {
  const cases = [
    ["dark male /o/ B1", { kind: "vowel", voice: "male", vowel: "o", f0: 61.74, dark: 150, sec: 0.8 }],
    ["dark male /u/ C2", { kind: "vowel", voice: "male", vowel: "u", f0: 65.41, dark: 150, sec: 0.8 }],
    ["soft dark male /u/ C2 at −45 dBFS", { kind: "vowel", voice: "male", vowel: "u", f0: 65.41, dark: 200, levelDb: -45, sec: 0.8 }],
    ["male /o/ A1", { kind: "vowel", voice: "male", vowel: "o", f0: 55, sec: 0.8 }],
    ["male /o/ A1 47 c flat", { kind: "vowel", voice: "male", vowel: "o", f0: 53.5, sec: 0.8 }]
  ];
  assert.deepEqual(failing(cases, within(0.9)), []);
});

test("a whistle over the top reads nothing, not an octave of it; a bright tone at the top reads its note (lags under the search)", () => {
  const whistles = [[1568, 0], [1700, 40], [2000, 0], [2637, 40], [3136, 0]].map(([f0, vib]) => [
    `a whistle at ${f0} Hz${vib ? ` ±${vib} c` : ""}`,
    { kind: "tone", f0, partials: 1, vibCents: vib, sec: 0.8 }
  ]);
  assert.deepEqual(failing(whistles, (r) => (r.pitched > 0.05 ? `a pitch on ${pct(r.pitched)}` : null)), []);
  const tones = [1175, 1397, 1480].map((f0) => [`a bright tone at ${f0} Hz`, { kind: "tone", f0, partials: 30, tiltDb: -6, sec: 0.8 }]);
  assert.deepEqual(failing(tones, within(0.9)), []);
});

test("a man's voice over a 50 or 60 Hz sine 12 dB under him reads his note, not a period they share (the hum rules)", () => {
  const cases = [["o", "A2", 110, "sine60"], ["a", "C3", 130.81, "sine60"], ["o", "A2", 110, "sine50"]].map(([vowel, note, f0, hum]) => [
    `male /${vowel}/ ${note} over a ${hum.slice(4)} Hz sine`,
    { kind: "vowel", voice: "male", vowel, f0, humDb: 12, humKind: hum, sec: 0.8 }
  ]);
  assert.deepEqual(failing(cases, within(0.9)), []);
});

test("a voice at three or four times the mains frequency over a hum 9 dB under it reads its own note, not the hum (the mains rule's way back to the voice)", () => {
  // Voice and hum then share the hum's period, the most periodic lag in the
  // frame: the pick lands on 50 or 60 Hz, and only the mains rule's search for
  // a shorter period brings the voice back
  const cases = [["male", 150, "sine50"], ["female", 200, "sine50"], ["male", 180, "sine60"], ["female", 240, "sine60"]].map(([voice, f0, hum]) => [
    `${voice} /a/ ${f0} Hz over a ${hum.slice(4)} Hz sine 9 dB under`,
    { kind: "vowel", voice, vowel: "a", f0, humDb: 9, humKind: hum, sec: 0.8 }
  ]);
  assert.deepEqual(failing(cases, within(0.9)), []);
});

test("a woman's /i/ with a harmonic on her second formant reads her note, not a whole tone, a fourth or a fifth above (aperiodicity and the line under the candidate)", () => {
  const cases = [
    ["bright pressed female /i/ D♯4", { kind: "vowel", voice: "female", vowel: "i", f0: 311.13, tilt: "pressed", bright: true, bwScale: 0.6, sec: 0.8 }],
    ["bright pressed female /i/ F4", { kind: "vowel", voice: "female", vowel: "i", f0: 349.23, tilt: "pressed", bright: true, bwScale: 0.6, sec: 0.8 }],
    ["female modal /i/ 940 Hz ±60 c", { kind: "vowel", voice: "female", vowel: "i", f0: 940, tilt: "modal", vibCents: 60, sec: 0.8 }],
    ["female pressed /i/ 720 Hz ±60 c", { kind: "vowel", voice: "female", vowel: "i", f0: 720, tilt: "pressed", vibCents: 60, sec: 0.8 }],
    ["child pressed /i/ 800 Hz ±60 c", { kind: "vowel", voice: "child", vowel: "i", f0: 800, tilt: "pressed", vibCents: 60, sec: 0.8 }]
  ];
  assert.deepEqual(failing(cases, within(0.9)), []);
});

test("speech gliding up to 9 semitones a syllable rarely reads its first formant (the caps on a fast-moving frame)", () => {
  // tests/pitch-range.spec.js: five syllables a second, each gliding to the
  // next offset from the speaker's base, falling 2 semitones every 3 s
  const offs = [-5, -3.9, 4, 2.1, 1.6, -0.1, -4.4, -3.2, -1.3, -4.2, 4, -3.5, -0.7, 0.4, -1.2, 3.2, 2.3, 3.9, -0.5, -1.1, -3.8, 0.4, 4.2, 2.8];
  const speech = (base) => {
    const p = [];
    for (let k = 0; k + 1 < offs.length; k++) {
      const t0 = 0.1 + k / 5;
      const st = (u) => offs[k] + (offs[k + 1] - offs[k]) * u * u * (3 - 2 * u) - (2 * (t0 + (0.72 * u) / 5)) / 3;
      for (let j = 0; j < 8; j++) p.push([t0 + (0.72 * j) / 8 / 5, t0 + (0.72 * (j + 1)) / 8 / 5, base * 2 ** (st(j / 8) / 12), base * 2 ** (st((j + 1) / 8) / 12)]);
    }
    return p;
  };
  const cases = [["male", 120, "o", 0.02], ["female", 210, "a", 0.02], ["child", 300, "a", 0.05]].map(([voice, base, vowel, max]) => [
    `${voice} /${vowel}/ around ${base} Hz`,
    { kind: "path", voice, vowel, path: speech(base), sec: 5, max }
  ]);
  const bad = [];
  for (const sr of RATES)
    for (const [label, spec] of cases) {
      const r = measure(spec, sr);
      if (r.off > spec.max) bad.push(`${label} at ${sr / 1000} kHz: ${pct(r.off)} of ${r.frames} frames more than a semitone off`);
    }
  assert.deepEqual(bad, []);
});

test("noise, a hiss and a 50 or 60 Hz buzz give no pitch (clarity and the mains rule)", () => {
  const cases = [["white", -40], ["white", -30], ["pink", -40], ["fan", -35], ["breath", -35], ["sss", -30], ["buzz60", -34], ["buzz50", -34], ["square60", -30]].map(([noise, levelDb]) => [
    `${noise} at ${levelDb} dBFS`,
    { kind: "noise", noise, levelDb, sec: 1.5, seed: 5 }
  ]);
  assert.deepEqual(failing(cases, (r) => (r.pitched > 0.05 ? `a pitch on ${pct(r.pitched)}` : null)), []);
});
