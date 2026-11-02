import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

function pitchUtils() {
  const win = {};
  runInNewContext(read("js/pitch-visualizer.js"), {
    window: win, Float32Array, Math, performance, console
  });
  return win.VTPitchUtils;
}

function sine(freq, sampleRate = 48000, amplitude = 0.2, phase = 0) {
  return Float32Array.from({ length: 2048 }, (_, i) =>
    amplitude * Math.sin(2 * Math.PI * freq * i / sampleRate + phase));
}

function harmonic(freq) {
  return Float32Array.from({ length: 2048 }, (_, i) => {
    const t = 2 * Math.PI * freq * i / 48000;
    return 0.14 * Math.sin(t) + 0.06 * Math.sin(2 * t) + 0.035 * Math.sin(3 * t);
  });
}

function seededNoise(seed, gain = 0.2) {
  let x = seed >>> 0;
  return Float32Array.from({ length: 2048 }, () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return gain * ((x >>> 0) / 0xffffffff * 2 - 1);
  });
}

function errorCents(measured, actual) {
  return 1200 * Math.log2(measured / actual);
}

test("real pitch estimator resolves fundamentals, never their octave subharmonics", () => {
  const { detectPitch } = pitchUtils();
  for (const hz of [55, 60, 65.41, 82.41, 110, 146.83, 220, 329.63, 392, 440, 493.88, 523.25, 659.25, 880, 987.77, 1046.5]) {
    for (const signal of [sine(hz), harmonic(hz)]) {
      const got = detectPitch(signal, 48000);
      assert.ok(got, `missing fundamental ${hz} Hz`);
      assert.ok(Math.abs(errorCents(got, hz)) <= 50,
        `expected ${hz} Hz, got ${got} Hz (${errorCents(got, hz).toFixed(1)} cents)`);
    }
  }
});

test("noise and silence cannot masquerade as a scored pitched note", () => {
  const { detectPitch } = pitchUtils();
  assert.equal(detectPitch(new Float32Array(2048), 48000), null);
  for (let seed = 1; seed <= 40; seed++) {
    assert.equal(detectPitch(seededNoise(seed), 48000), null, `noise seed ${seed} scored`);
  }
});

test("uncertain pitch is withheld rather than displayed as a wrong octave", () => {
  const { detectPitch } = pitchUtils();
  for (const hz of [30, 35, 1500]) {
    const got = detectPitch(sine(hz), 48000);
    // On an unsupported frequency, returning a confident but unrelated note
    // is more harmful than showing '—' and asking for a range adjustment.
    assert.equal(got, null, `unsupported ${hz} Hz aliased to ${got}`);
  }
});

test("noisy harmonic frames may be uncertain but must not claim a different octave", () => {
  const { detectPitch } = pitchUtils();
  const freqs = [82.41, 110, 146.83, 220, 329.63, 440, 523.25, 659.25];
  for (let seed = 1; seed <= 240; seed++) {
    const hz = freqs[seed % freqs.length];
    const voiced = harmonic(hz);
    const speechRms = Math.sqrt(voiced.reduce((sum, v) => sum + v * v, 0) / voiced.length);
    const noise = seededNoise(seed * 73939133, 1);
    const noiseRms = Math.sqrt(noise.reduce((sum, v) => sum + v * v, 0) / noise.length);
    // −3 dB input SNR is intentionally challenging: a valid refusal to
    // assign pitch is preferred to a false, seemingly confident note.
    const noiseGain = speechRms / (Math.pow(10, -3 / 20) * noiseRms);
    const mixed = Float32Array.from(voiced, (v, i) => v + noise[i] * noiseGain);
    const measured = detectPitch(mixed, 48000);
    if (measured != null) {
      assert.ok(Math.abs(errorCents(measured, hz)) <= 100,
        `noise seed ${seed}: ${hz} Hz misread as ${measured} Hz`);
    }
  }
});

test("lip-trill solfege cannot award the next semitone as the current note", () => {
  const win = { VTPitchUtils: { freqToMidi: (hz) => 69 + 12 * Math.log2(hz / 440) } };
  runInNewContext(read("js/practice-modes.js"), { window: win, document: { documentElement: { lang: "en" } }, Math, console });
  const makeMode = () => {
    const mode = win.VTPracticeModes.get("trillSolfege");
    mode.profile = { holdMs: 600 };
    mode.state = { wantFreq: 220, acc: 0, hist: [], refBlank: 0, lastFreq: null };
    let advances = 0;
    mode._advance = () => { advances++; };
    return { mode, advances: () => advances };
  };
  const feed = (mode, cents) => {
    for (let i = 0; i < 9; i++) {
      const hz = 220 * Math.pow(2, (cents + i * 0.01) / 1200);
      mode._frameGate({ voiceFreq: hz, voiced: true, rms: 0.1, airRmsThreshold: 0.006, dtMs: 100 });
    }
  };
  const bad = makeMode();
  feed(bad.mode, 100);
  assert.equal(bad.advances(), 0, "a sung adjacent semitone must not complete the current step");
  const good = makeMode();
  feed(good.mode, 30);
  assert.ok(good.advances() > 0, "a near-target trill note should advance after sufficient hold");
});

class DeferredMediaRecorder {
  static instances = [];
  static isTypeSupported() { return true; }
  constructor(stream) {
    this.stream = stream;
    this.mimeType = "audio/webm";
    this.state = "inactive";
    DeferredMediaRecorder.instances.push(this);
  }
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(["TAIL"]) });
      this.onstop?.();
    });
  }
}

function engine(extraGlobals = {}) {
  DeferredMediaRecorder.instances.length = 0;
  const win = {};
  const url = {
    createObjectURL: () => "blob:recording",
    revokeObjectURL: () => {}
  };
  runInNewContext(read("js/practice-engine.js"), {
    window: win, MediaRecorder: DeferredMediaRecorder, URL: url,
    Float32Array, Uint8Array, Blob, performance, queueMicrotask,
    cancelAnimationFrame() {}, clearTimeout, Math, console, ...extraGlobals
  });
  const tracks = [];
  const instance = new win.VTPracticeEngine();
  instance.stream = { getTracks: () => [{ stop: () => tracks.push("stopped") }] };
  instance.startedAt = performance.now() - 1000;
  return { instance, tracks };
}

test("a short take includes the final asynchronous MediaRecorder chunk", async () => {
  const { instance, tracks } = engine();
  const results = [];
  instance.onRecordingReady = (r) => results.push(r);
  await instance._startRecorder();
  assert.equal(instance.stop(), null);
  assert.equal(results.length, 0, "stop() must not publish an incomplete blob");
  assert.equal(tracks.length, 0, "stream must remain until final dataavailable");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(results.length, 1);
  assert.equal(await results[0].blob.text(), "TAIL");
  assert.equal(tracks.length, 1);
});

test("preliminary timeslice and final chunk both survive, once", async () => {
  const { instance } = engine();
  const results = [];
  instance.onRecordingReady = (r) => results.push(r);
  await instance._startRecorder();
  DeferredMediaRecorder.instances[0].ondataavailable({ data: new Blob(["HEAD"]) });
  instance.stop();
  instance.stop();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(results.length, 1);
  assert.equal(await results[0].blob.text(), "HEADTAIL");
});

test("late stop from an earlier take cannot contaminate a newer take", async () => {
  const { instance } = engine();
  const results = [];
  instance.onRecordingReady = (r) => results.push(r);
  await instance._startRecorder();
  instance.stop();
  instance.stream = { getTracks: () => [{ stop() {} }] };
  instance.startedAt = performance.now();
  await instance._startRecorder();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(results.length, 0, "old take published after new take started");
  instance.stop();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(results.length, 1);
  assert.equal(await results[0].blob.text(), "TAIL");
});

test("late recording from A cannot use the newly installed callback for nonrecorded B", async () => {
  const { instance } = engine();
  const aResults = [];
  const bResults = [];
  instance.onRecordingReady = (r) => aResults.push(r);
  await instance._startRecorder();
  instance.stop();
  // B starts microphone-only practice, with no MediaRecorder and thus no new
  // recording epoch. Its newly installed callback must not receive A's blob.
  instance.onRecordingReady = (r) => bResults.push(r);
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(aResults.length, 1, "A's final data must reach A");
  assert.equal(await aResults[0].blob.text(), "TAIL");
  assert.equal(bResults.length, 0, "B incorrectly received A's recording");
});

test("human-paced microphone approval does not launch simultaneous permission requests", async () => {
  let calls = 0;
  let grant;
  const mic = new Promise((resolve) => { grant = resolve; });
  const stream = { getTracks: () => [{ stop() {} }] };
  const { instance } = engine({
    navigator: { mediaDevices: { getUserMedia: () => { calls++; return mic; } } },
    setTimeout: (fn) => setTimeout(fn, 30000), clearTimeout
  });
  const pending = instance._acquireMic();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  grant(stream);
  assert.equal(await pending, stream);
  assert.equal(calls, 1);
});

test("timed-out microphone prompt does not retry and cleans a late-granted stream", async () => {
  let calls = 0;
  let grant;
  let released = 0;
  const mic = new Promise((resolve) => { grant = resolve; });
  const { instance } = engine({
    navigator: { mediaDevices: { getUserMedia: () => { calls++; return mic; } } },
    setTimeout: (fn) => { queueMicrotask(fn); return 1; }, clearTimeout() {}
  });
  await assert.rejects(instance._acquireMic(), { name: "TimeoutError" });
  assert.equal(calls, 1, "a timed-out permission request must not prompt twice more");
  grant({ getTracks: () => [{ stop: () => { released++; } }] });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(released, 1, "late-granted stream must be immediately released");
});
