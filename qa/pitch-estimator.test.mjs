/**
 * Independent signal oracle: mathematical input frequencies, not app-selected
 * targets or the production pitch/scoring predicates. Run with `node --test`.
 * A detector that reports a harmonic/subharmonic is objectively incorrect.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const context = { window: {} };
vm.runInNewContext(fs.readFileSync(new URL("../js/pitch-visualizer.js", import.meta.url), "utf8"), context);
const detect = context.window.VTPitchUtils.detectPitch;

function samples(freq, sampleRate, harmonics = [1], amplitude = 0.5) {
  // Match the engine's ~43ms frame, including the longer high-rate buffer.
  const count = 2048 * Math.max(1, Math.round(sampleRate / 48000));
  return Float32Array.from({ length: count }, (_, i) =>
    harmonics.reduce((sum, harmonic, h) =>
      sum + (amplitude / (h + 1)) * Math.sin(2 * Math.PI * freq * harmonic * i / sampleRate), 0)
  );
}

function cents(actual, expected) {
  return 1200 * Math.log2(actual / expected);
}

// These frequencies are declared here, independent of the app's pitch range.
// In particular, 440Hz MUST NOT pass as 220Hz (the original regression).
for (const sampleRate of [44100, 48000, 96000]) {
  test(`sample rate ${sampleRate}: correctly identify notes across voice range`, () => {
    for (const freq of [65.41, 82.41, 110, 220, 329.63, 392, 400, 440, 523.25, 659.25, 880, 1046.5, 1318.51]) {
      const measured = detect(samples(freq, sampleRate), sampleRate);
      assert.ok(Number.isFinite(measured), `${freq}Hz returned ${measured}`);
      assert.ok(Math.abs(cents(measured, freq)) < 15,
        `${freq}Hz -> ${measured?.toFixed(2)}Hz (${cents(measured, freq).toFixed(1)} cents)`);
    }
  });

  test(`sample rate ${sampleRate}: harmonic voice does not jump an octave`, () => {
    for (const freq of [110, 220, 440, 659.25]) {
      const measured = detect(samples(freq, sampleRate, [1, 2, 3, 4]), sampleRate);
      assert.ok(Number.isFinite(measured) && Math.abs(cents(measured, freq)) < 20,
        `voiced ${freq}Hz -> ${measured}Hz`);
    }
  });

  test(`sample rate ${sampleRate}: weak fundamentals still resolve harmonic pitch`, () => {
    // Dominant 3rd harmonic is realistic under vocal formants/filtering.
    for (const freq of [110, 220, 440]) {
      const count = 2048 * Math.max(1, Math.round(sampleRate / 48000));
      const frame = Float32Array.from({ length: count }, (_, i) => {
        const t = 2 * Math.PI * freq * i / sampleRate;
        return 0.01 * Math.sin(t) + 0.2 * Math.sin(2 * t) + 0.7 * Math.sin(3 * t);
      });
      const measured = detect(frame, sampleRate);
      assert.ok(Number.isFinite(measured) && Math.abs(cents(measured, freq)) < 30,
        `weak F0 ${freq}Hz -> ${measured}Hz`);
    }
  });

  test(`sample rate ${sampleRate}: dominant fourth partial is not a false earned note`, () => {
    for (const freq of [110, 220, 659.25]) {
      const count = 2048 * Math.max(1, Math.round(sampleRate / 48000));
      const frame = Float32Array.from({ length: count }, (_, i) => {
        const t = 2 * Math.PI * freq * i / sampleRate;
        return 0.1 * Math.sin(t) + 0.8 * Math.sin(4 * t);
      });
      const measured = detect(frame, sampleRate);
      assert.ok(measured === null || Math.abs(cents(measured, freq)) < 30,
        `do not mis-score ambiguous ${freq}Hz as ${measured}Hz`);
    }
  });
}

test("silence and non-periodic loud noise are never awarded a note", () => {
  const silence = new Float32Array(2048);
  assert.equal(detect(silence, 48000), null);
  let seed = 0x156723;
  const noise = Float32Array.from({ length: 2048 }, () => {
    seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5;
    return ((seed >>> 0) / 0xffffffff - 0.5) * 0.7;
  });
  assert.equal(detect(noise, 48000), null, "noise must not earn pitch points");
});

test("empty or invalid audio does not report a pitch", () => {
  assert.equal(detect(new Float32Array(0), 48000), null);
  assert.equal(detect(new Float32Array(2048), 0), null);
});
