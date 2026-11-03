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

test("one-note mode at octave −2 draws no lane below C1 either: a lone low tone is shown in the C1 octave", () => {
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
  const F = win.VT_NOTE_FREQ;
  const C1 = F.C1;
  const pitchClass = (name) => String(name).replace(/-?\d+$/, "");
  let lone = 0;
  for (const [id, progression] of Object.entries(win.VT_PROGRESSIONS)) {
    const low = win.VTTransposeProgression(progression, -2);
    viz.setProgressionRange(low);
    for (const chord of low.chords) {
      for (const note of chord.notes) {
        // What the piano hands the highway in one-note mode (piano.js onChordChange)
        viz.setTargetFromChord({ name: chord.name, notes: [note], oneNote: true }, { oneNote: true, noteName: note });
        const lanes = Array.from(viz.chordLanes, (l) => l.name); // a local array: the vm's fails deepEqual
        assert.equal(viz.chordLanes.filter((l) => l.freq < C1 - 0.01).length, 0, `${id}/${chord.name}/${note}: lanes ${lanes}`);
        assert.ok(viz.targetFreq >= C1 - 0.01, `${id}/${chord.name}/${note}: target ${viz.targetFreq} Hz`);
        // pzChord.observe matches lanes[0].name to the note the piano plays
        assert.deepEqual(lanes, [note], `${id}/${chord.name}/${note}: the lane keeps the played note's name: ${lanes}`);
        const shown = viz.chordLanes[0].shown || note;
        assert.equal(pitchClass(shown), pitchClass(note), `${id}/${chord.name}/${note}: drawn as ${shown}`);
        assert.ok(Math.abs(viz.chordLanes[0].freq - F[shown]) < 0.01, `${id}/${chord.name}/${note}: drawn where ${shown} is`);
        if (F[note] < C1 - 0.01) lone++;
      }
    }
  }
  assert.ok(lone >= 50, `control: ${lone} one-note events below C1 were checked`);
});

test("a chord with every tone under C1 is shown an octave up, each tone by its own name", () => {
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
  // A one-note chord with no note named (the first tone is the pick), and a whole triad at 16-25 Hz
  const F = win.VT_NOTE_FREQ;
  const shown = () => Array.from(viz.chordLanes, (l) => l.shown);
  const names = () => Array.from(viz.chordLanes, (l) => l.name);
  viz.setTargetFromChord({ name: "C", notes: ["C0"], oneNote: true }, { oneNote: true });
  assert.deepEqual(shown(), ["C1"], "the lone tone gets a lane where a lane may be");
  assert.deepEqual(names(), ["C0"], "named for the note the piano plays");
  viz.setTargetFromChord({ name: "C", notes: ["C0", "E0", "G0"] }, {});
  assert.deepEqual(shown(), ["C1", "E1", "G1"]);
  assert.deepEqual(names(), ["C0", "E0", "G0"]);
  assert.deepEqual(Array.from(viz.chordLanes, (l) => l.freq), [F.C1, F.E1, F.G1]);
  assert.equal(viz.chordLanes.filter((l) => l.freq < C1 - 0.01).length, 0);
  // Feedback names the lane the singer sees
  assert.equal(viz.nearestActiveLane(F.E1).name, "E1");
  // A chord with tones above the floor keeps them as they are: nothing lifted, nothing renamed
  viz.setTargetFromChord({ name: "C", notes: ["C1", "E1", "G1"] }, {});
  assert.deepEqual(names(), ["C1", "E1", "G1"]);
  assert.deepEqual(shown(), [undefined, undefined, undefined]);
});
