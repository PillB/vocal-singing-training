// A held note must really last its hold time. Wrong behaviour rejected: the
// hold timer accruing faster than the clock (QA-09: `acc += dt * 2` let 300 ms
// of in-tune singing finish a 600 ms hold, and the whole audio suite stayed
// green). Each test pairs a just-too-short hold that must not count with a
// long-enough one that must, so neither "never counts" nor "always counts"
// passes. Adopted from the QA thread's qa-round2-hold-duration.test.mjs and
// widened to the NoteGate every pitch-hold mode shares (js/scenes/pitch.js).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

function trillMode() {
  const win = { VTPitchUtils: { freqToMidi: (hz) => 69 + 12 * Math.log2(hz / 440) } };
  runInNewContext(read("js/practice-modes.js"), { window: win, document: { documentElement: { lang: "en" } }, Math, console });
  const m = win.VTPracticeModes.get("trillSolfege");
  m.profile = { holdMs: 600 };
  m.state = { wantFreq: 220, acc: 0, hist: [], refBlank: 0, lastFreq: null };
  let advanced = 0;
  m._advance = () => {
    advanced++;
  };
  return { m, advanced: () => advanced };
}

/** n frames of 100 ms, in tune within a cent or two of 220 Hz. */
function sing(m, n) {
  for (let i = 0; i < n; i++) {
    m._frameGate({ voiceFreq: 220 * Math.pow(2, (i * 0.01) / 1200), voiced: true, rms: 0.1, airRmsThreshold: 0.006, dtMs: 100 });
  }
}

test("trill solfège: 500 ms in tune does not finish a 600 ms hold; 700 ms does", () => {
  const short = trillMode();
  sing(short.m, 5);
  assert.equal(short.advanced(), 0, "advanced after only 500 ms of a 600 ms hold");
  const full = trillMode();
  sing(full.m, 7);
  assert.ok(full.advanced() > 0, "did not advance after 700 ms of a 600 ms hold");
});

/** The shipped kit: exercise-viz.js (VTViz, median, clamp) then scenes/pitch.js. */
function pitchKit() {
  const win = {};
  const ctx = { window: win, document: { documentElement: { lang: "en" } }, Math, console };
  runInNewContext(read("js/exercise-viz.js"), ctx);
  runInNewContext(read("js/scenes/pitch.js"), ctx);
  return win.VTViz.scenes.pitchKit;
}

/** Feed `ms` of a steady note `cents` off A3 (MIDI 57), in 100 ms frames. */
function feed(gate, ms, cents = 0) {
  const hz = 220 * Math.pow(2, cents / 1200);
  let locked = false;
  for (let t = 0; t < ms; t += 100) locked = gate.feed({ rawFreq: hz, dtMs: 100 }) || locked;
  return locked;
}

test("NoteGate (every pitch-hold mode): 600 ms does not lock a 700 ms hold; 700 ms does", () => {
  const { NoteGate } = pitchKit();
  const short = new NoteGate({ tol: 40, holdMs: 700, blankMs: 0 });
  short.setTarget(57);
  assert.equal(feed(short, 600), false, "locked after 600 ms of a 700 ms hold");
  assert.ok(short.frac > 0.8 && short.frac < 1, `control: the hold is filling (${short.frac})`);
  const full = new NoteGate({ tol: 40, holdMs: 700, blankMs: 0 });
  full.setTarget(57);
  assert.equal(feed(full, 700), true, "did not lock after 700 ms of a 700 ms hold");
});

test("NoteGate: the reference note's blank does not count toward the hold", () => {
  const { NoteGate } = pitchKit();
  const gate = new NoteGate({ tol: 40, holdMs: 700, blankMs: 300 });
  gate.setTarget(57);
  assert.equal(feed(gate, 900), false, "the 300 ms blank counted as singing");
  assert.equal(feed(gate, 100), true, "control: 700 ms after the blank locks");
});

test("NoteGate: a note outside the band never fills the hold, one inside does", () => {
  const { NoteGate } = pitchKit();
  const off = new NoteGate({ tol: 40, holdMs: 700, blankMs: 0 });
  off.setTarget(57);
  assert.equal(feed(off, 3000, 60), false, "60 cents off a ±40 band locked");
  assert.equal(off.frac, 0);
  const on = new NoteGate({ tol: 40, holdMs: 700, blankMs: 0 });
  on.setTarget(57);
  assert.equal(feed(on, 800, 30), true, "control: 30 cents off a ±40 band locks");
});
