/** User-facing bilingual scientific claims must match separately tested limits. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const guide = fs.readFileSync(new URL("../guide.html", import.meta.url), "utf8");
const engine = fs.readFileSync(new URL("../js/practice-engine.js", import.meta.url), "utf8");

test("guide states the same empirically exercised pitch domain in both languages", () => {
  // Frozen acceptance domain is independent of the app's implementation.
  const expectedLow = 65;
  const expectedHigh = 1350;
  assert.match(engine, /const PITCH_MIN = 65;/);
  assert.match(engine, /const PITCH_MAX = 1350;/);
  assert.equal(guide.split(`${expectedLow}–${expectedHigh} Hz`).length - 1, 2,
    "Spanish and English instructions must both identify the valid pitch range");
  assert.doesNotMatch(guide, /65–400 Hz|high G \(65|Sol agudo \(65/,
    "old narrower guidance would wrongly ask high singers to transpose");
});

test("keyboard assist directions must not contradict the visible SH ladder cue", () => {
  assert.doesNotMatch(guide, /No está escrito en la pantalla|It is not written\s+anywhere on screen/,
    "the live SH screen explicitly tells the learner to hold Space");
});
