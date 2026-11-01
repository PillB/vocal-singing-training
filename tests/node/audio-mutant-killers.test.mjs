// Mutation killers for the audio contract, written by the QA thread
// (2026-11-01) for defects tests/node/audio-contract.test.mjs let survive.
// Each states the correct behaviour AND the wrong behaviour it rejects.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
function pitchUtils() {
  const win = {};
  runInNewContext(read("js/pitch-visualizer.js"), { window: win, Float32Array, Math, performance, console });
  return win.VTPitchUtils;
}
const sine = (hz, amp, sr = 48000) =>
  Float32Array.from({ length: 2048 }, (_, i) => amp * Math.sin(2 * Math.PI * hz * i / sr));

// Kills M5 (silence gate removed). Wrong behaviour: a faint periodic hum
// (RMS ~0.0035, about -49 dBFS: a fan or mains hum) is named as a sung note.
test("a faint periodic hum below the level gate is not scored as a note", () => {
  const { detectPitch } = pitchUtils();
  assert.equal(detectPitch(sine(220, 0.005), 48000), null, "faint hum was named as a pitch");
  // Positive twin: the same tone, loud enough to be a voice, IS measured.
  const got = detectPitch(sine(220, 0.2), 48000);
  assert.ok(got && Math.abs(1200 * Math.log2(got / 220)) < 25, `loud tone not measured: ${got}`);
});

function trillMode(wantFreq) {
  const win = { VTPitchUtils: { freqToMidi: (hz) => 69 + 12 * Math.log2(hz / 440) } };
  runInNewContext(read("js/practice-modes.js"), { window: win, document: { documentElement: { lang: "en" } }, Math, console });
  const mode = win.VTPracticeModes.get("trillSolfege");
  mode.profile = { holdMs: 600 };
  mode.state = { wantFreq, acc: 0, hist: [], refBlank: 0, lastFreq: null };
  let advances = 0;
  mode._advance = () => { advances++; };
  return { mode, advances: () => advances };
}
const feed = (mode, want, cents) => {
  for (let i = 0; i < 9; i++) {
    mode._frameGate({ voiceFreq: want * Math.pow(2, (cents + i * 0.01) / 1200), voiced: true, rms: 0.1, airRmsThreshold: 0.006, dtMs: 100 });
  }
};
// Kills M7 (lower bound loosened to -140c). Wrong behaviour: singing a full
// semitone FLAT completes the step. The existing test only probes the sharp side.
test("a note a semitone flat does not complete the step; a near-flat one does", () => {
  const flat = trillMode(220); feed(flat.mode, 220, -100);
  assert.equal(flat.advances(), 0, "a sung semitone-flat note completed the step");
  const near = trillMode(220); feed(near.mode, 220, -30);
  assert.ok(near.advances() > 0, "a slightly flat (-30c) note should still count");
});

// Kills M11 (empty-take guard removed). Wrong behaviour: a recorder that produced
// no data (permission revoked mid-take, instant stop) publishes a 0-byte "recording"
// into the learner's history. Correct behaviour: nothing is published.
class EmptyRecorder {
  static isTypeSupported() { return true; }
  constructor(stream) { this.stream = stream; this.mimeType = "audio/webm"; this.state = "inactive"; }
  start() { this.state = "recording"; }
  stop() { this.state = "inactive"; queueMicrotask(() => this.onstop?.()); } // no dataavailable at all
}
test("a take that captured no audio publishes no recording", async () => {
  const win = {};
  runInNewContext(read("js/practice-engine.js"), {
    window: win, MediaRecorder: EmptyRecorder, URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    Float32Array, Uint8Array, Blob, performance, queueMicrotask, cancelAnimationFrame() {}, Math, console
  });
  const e = new win.VTPracticeEngine();
  e.stream = { getTracks: () => [{ stop() {} }] };
  e.startedAt = performance.now() - 500;
  const got = [];
  e.onRecordingReady = (r) => got.push(r);
  await e._startRecorder();
  e.stop();
  await new Promise((r) => setImmediate(r));
  assert.equal(got.length, 0, `an empty take was published (${got[0]?.blob?.size} bytes)`);
});
