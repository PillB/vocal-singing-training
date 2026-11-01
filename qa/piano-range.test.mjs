/** All user-selectable octave shifts must map their displayed notes to audio. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL("../js/piano.js", import.meta.url), "utf8"), context);
const { VT_PROGRESSIONS: progressions, VT_NOTE_FREQ: frequencies, VTTransposeProgression: transpose } = context.window;

test("every chord note resolves under each selectable octave shift", () => {
  for (const shift of [-2, -1, 0, 1, 2]) {
    for (const [id, progression] of Object.entries(progressions)) {
      for (const chord of transpose(progression, shift).chords) {
        for (const note of chord.notes) {
          assert.ok(Number.isFinite(frequencies[note]) && frequencies[note] > 0,
            `${id}/${chord.name}: ${note} has no audio frequency at shift ${shift}`);
        }
      }
    }
  }
});

test("transposed notes must sound at exactly the indicated octave, not silently revert", () => {
  const base = frequencies.C2;
  const low = frequencies.C0;
  const high = frequencies.C4;
  assert.ok(Math.abs(low * 4 / base - 1) < 0.002, "C0 must sound two octaves below C2");
  assert.ok(Math.abs(high / base / 4 - 1) < 0.002, "C4 must sound two octaves above C2");
  // A regression that drops C0 or maps C0 to C2 must fail this test.
});
