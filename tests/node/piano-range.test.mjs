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
