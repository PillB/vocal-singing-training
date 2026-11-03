/**
 * Every octave shift the − / + buttons allow (±2) must give each displayed
 * chord note a frequency. At −2 the table used to stop at C1, so 79 of 212
 * chord notes (C0, A0, B0…) had none and playChord skipped them in silence.
 * Ported from PR #24's qa/piano-range.test.mjs.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL("../../js/piano.js", import.meta.url), "utf8"), context);
const { VT_PROGRESSIONS: progressions, VT_NOTE_FREQ: frequencies, VTTransposeProgression: transpose } = context.window;

test("every chord note resolves under each selectable octave shift", () => {
  let checked = 0;
  for (const shift of [-2, -1, 0, 1, 2]) {
    for (const [id, progression] of Object.entries(progressions)) {
      for (const chord of transpose(progression, shift).chords) {
        for (const note of chord.notes) {
          assert.ok(Number.isFinite(frequencies[note]) && frequencies[note] > 0,
            `${id}/${chord.name}: ${note} has no audio frequency at shift ${shift}`);
          checked++;
        }
      }
    }
  }
  assert.ok(checked >= 1000, `only ${checked} chord notes checked`);
});

test("a shifted note sounds at the octave it shows, not back at its original one", () => {
  const near = (a, b) => Math.abs(a / b - 1) < 0.002;
  assert.ok(near(frequencies.C0 * 4, frequencies.C2), "C0 must sound two octaves below C2");
  assert.ok(near(frequencies.C4, frequencies.C2 * 4), "C4 must sound two octaves above C2");
  assert.ok(near(frequencies.A0, 27.5), "A0 is 27.5 Hz");
  assert.ok(near(frequencies.B8, 7902.13), "B8 is the top of the table");
});

test("octave −2 draws no lane below C1: the highway keeps the notes a voice can reach", () => {
  const win = { addEventListener() {}, removeEventListener() {}, devicePixelRatio: 1 };
  const ctx = { window: win, console, Float32Array, performance, setTimeout, clearTimeout, requestAnimationFrame: () => 1, cancelAnimationFrame() {} };
  vm.runInNewContext(fs.readFileSync(new URL("../../js/piano.js", import.meta.url), "utf8"), ctx);
  vm.runInNewContext(fs.readFileSync(new URL("../../js/pitch-visualizer.js", import.meta.url), "utf8"), ctx);
  const canvas = {
    style: {}, width: 300, height: 200,
    getContext: () => ({ setTransform() {}, scale() {} }),
    getBoundingClientRect: () => ({ width: 300, height: 200 })
  };
  const viz = new win.VTPitchVisualizer(canvas);
  const C1 = win.VT_NOTE_FREQ.C1;
  for (const [id, progression] of Object.entries(win.VT_PROGRESSIONS)) {
    const low = win.VTTransposeProgression(progression, -2);
    viz.setProgressionRange(low);
    const ghosts = viz.progressionLanes.filter((l) => l.freq < C1 - 0.01).map((l) => l.name);
    assert.equal(ghosts.length, 0, `${id}: ghost lanes below C1: ${ghosts}`);
    assert.ok(viz.rangeMinMidi >= 24 - 3, `${id}: the highway reaches down to ${viz.rangeMinMidi}, below C1`);
    for (const chord of low.chords) {
      viz.setTargetFromChord(chord, {});
      const sub = viz.chordLanes.filter((l) => l.freq < C1 - 0.01).map((l) => l.name);
      assert.equal(sub.length, 0, `${id}/${chord.name}: chord lanes below C1: ${sub}`);
    }
  }
});
