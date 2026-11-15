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

function seededNoise(seed, gain = 0.2, length = 2048) {
  let x = seed >>> 0;
  return Float32Array.from({ length }, () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    return gain * ((x >>> 0) / 0xffffffff * 2 - 1);
  });
}

function errorCents(measured, actual) {
  return 1200 * Math.log2(measured / actual);
}

test("real pitch estimator resolves fundamentals, never their octave subharmonics", () => {
  const { detectPitch } = pitchUtils();
  // 60 Hz left this list with the NSDF detector (PR #21): a frame within 1 % of
  // 50 or 60 Hz is a mains hum, tested on its own below. A♯1 and B1 either side stay.
  for (const hz of [55, 58.27, 61.74, 65.41, 82.41, 110, 146.83, 220, 329.63, 392, 440, 493.88, 523.25, 659.25, 880, 987.77, 1046.5, 1174.66, 1396.91]) {
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
  // The band is about 51–1520 Hz (a bass's A1 sung flat to a soprano's F♯6):
  // under it and over it the answer is "no pitch", never an octave of the tone.
  for (const hz of [30, 35, 45, 1600, 2000, 3000]) {
    const got = detectPitch(sine(hz), 48000);
    // On an unsupported frequency, returning a confident but unrelated note
    // is more harmful than showing '—' and asking for a range adjustment.
    assert.equal(got, null, `unsupported ${hz} Hz aliased to ${got}`);
  }
});

// The engine's frame: 2048 samples at 44.1/48 kHz, 4096 at 96 kHz.
const PITCH_RATES = [44100, 48000, 96000];
const frameLength = (sampleRate) => 2048 * Math.max(1, Math.round(sampleRate / 48000));

/** Partials h = 1..20 below `cap` Hz, partial h at amp(h), fixed phases. */
function partials(hz, sampleRate, amp, cap = 0.45 * sampleRate) {
  return Float32Array.from({ length: frameLength(sampleRate) }, (_, i) => {
    let v = 0;
    for (let h = 1; h <= 20 && h * hz < cap; h++) {
      v += amp(h) * Math.sin(2 * Math.PI * hz * h * i / sampleRate + (h - 1) * 0.9);
    }
    return v;
  });
}

test("weak fundamentals still resolve harmonic pitch (PR #24)", () => {
  const { detectPitch } = pitchUtils();
  for (const sampleRate of PITCH_RATES) {
    for (const hz of [110, 220, 440]) {
      // A dominant 3rd partial is realistic under vocal formants/filtering;
      // its period dips under the YIN threshold first (110 Hz read as 330).
      const frame = Float32Array.from({ length: frameLength(sampleRate) }, (_, i) => {
        const t = 2 * Math.PI * hz * i / sampleRate;
        return 0.01 * Math.sin(t) + 0.2 * Math.sin(2 * t) + 0.7 * Math.sin(3 * t);
      });
      const got = detectPitch(frame, sampleRate);
      assert.ok(Number.isFinite(got) && Math.abs(errorCents(got, hz)) < 30,
        `${sampleRate} Hz: weak F0 ${hz} Hz -> ${got} Hz`);
    }
  }
});

const noteHz = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

test("a weak fundamental under a loud 2nd partial is not read an octave low", () => {
  // Two periods are as periodic as one. On the 12 kHz grid the pair often
  // lands nearer a sample and looked deeper, so the deepest multiple read
  // 880 Hz as 440 Hz and 116.5 Hz as 58.3 Hz.
  const { detectPitch } = pitchUtils();
  for (const sampleRate of PITCH_RATES) {
    for (let midi = 40; midi <= 84; midi++) {
      const hz = noteHz(midi);
      for (const a1 of [0.01, 0.05, 0.1, 0.2]) {
        const got = detectPitch(partials(hz, sampleRate, (h) => [a1, 0.22, 0.03][h - 1] || 0), sampleRate);
        const label = `${sampleRate} Hz: ${hz.toFixed(2)} Hz with a1 ${a1} under 0.22 -> ${got} Hz`;
        assert.ok(got == null || errorCents(got, hz) > -600, label);
        if (a1 === 0.05) assert.ok(Number.isFinite(got) && Math.abs(errorCents(got, hz)) <= 50, label);
      }
    }
  }
});

test("a weak fundamental under a loud 3rd partial is not read an octave low", () => {
  // The first dip can be two periods of the 3rd partial, so 3x of it is two
  // periods (493.9 Hz read as 246.9, C6 above the band as C5).
  const { detectPitch } = pitchUtils();
  for (const sampleRate of PITCH_RATES) {
    for (let midi = 40; midi <= 84; midi++) {
      for (const a1 of [0.01, 0.05]) {
        const hz = noteHz(midi);
        const got = detectPitch(partials(hz, sampleRate, (h) => [a1, 0.2, 0.7][h - 1] || 0), sampleRate);
        assert.ok(got == null || errorCents(got, hz) > -600,
          `${sampleRate} Hz: ${hz.toFixed(2)} Hz with a1 ${a1} under a loud 3rd partial -> ${got} Hz`);
      }
    }
  }
});

test("a weak fundamental under a loud 4th or 6th partial keeps its own period", () => {
  // Half the period is not periodic under a loud 4th partial. Under a loud
  // 6th with quiet odd partials it is nearly as periodic, and nearly is not
  // enough: an octave high is still a wrong note.
  const { detectPitch } = pitchUtils();
  const fourth = [0.05, 0.05, 0.03, 0.22];
  const sixth = [0.02, 0.03, 0.06, 0.08, 0.004, 0.28, 0.03, 0.03, 0.06];
  for (const sampleRate of PITCH_RATES) {
    for (let midi = 40; midi <= 69; midi++) {
      for (const amps of midi >= 50 && midi <= 55 ? [fourth, sixth] : [fourth]) {
        const hz = noteHz(midi);
        const got = detectPitch(partials(hz, sampleRate, (h) => amps[h - 1] || 0), sampleRate);
        assert.ok(Number.isFinite(got) && Math.abs(errorCents(got, hz)) <= 50,
          `${sampleRate} Hz: ${hz.toFixed(2)} Hz under a loud partial ${amps.indexOf(Math.max(...amps)) + 1} -> ${got} Hz`);
      }
    }
  }
});

test("without decimation half a period is not taken for the period", () => {
  // At 8 and 16 kHz the full-rate frame is the decimated one, and a window
  // between troughs can read as deep (261.6 Hz with a loud 3rd partial was
  // read as 523 Hz).
  const { detectPitch } = pitchUtils();
  for (const sampleRate of [8000, 16000]) {
    for (let midi = 40; midi <= 84; midi++) {
      const hz = noteHz(midi);
      const got = detectPitch(partials(hz, sampleRate, (h) => [0.01, 0.2, 0.7][h - 1] || 0), sampleRate);
      assert.ok(got == null || Math.abs(errorCents(got, hz) - 1200) > 100,
        `${sampleRate} Hz: ${hz.toFixed(2)} Hz under a loud 3rd partial read an octave high: ${got} Hz`);
    }
  }
});

test("a bright voice's own period is not traded for a multiple of it", () => {
  // A high, bright voice's period falls between the decimated samples and
  // looks shallow there; only the full-rate frame shows it is periodic.
  const { detectPitch } = pitchUtils();
  for (const sampleRate of PITCH_RATES) {
    for (let midi = 55; midi <= 84; midi++) {
      const hz = 440 * Math.pow(2, (midi - 69) / 12);
      const got = detectPitch(partials(hz, sampleRate, (h) => 0.12 / Math.sqrt(h), 5000), sampleRate);
      assert.ok(Number.isFinite(got) && Math.abs(errorCents(got, hz)) <= 50,
        `${sampleRate} Hz: bright ${hz.toFixed(2)} Hz -> ${got} Hz`);
    }
  }
});

test("a 50 or 60 Hz mains hum is not named as a bass note; the notes either side are", () => {
  // Correct: a steady 50/60 Hz buzz (a transformer, a ground loop) gives no
  // pitch, so it cannot score as the learner's low note. Wrong: the hum named
  // as G1/A♯1, or the rule widened until a bass's real A♯1 (58.27 Hz) or B1
  // (61.74 Hz) reads nothing. The cost, stated: a note sung within 17 cents of
  // 50 or 60 Hz (between the semitones) reads nothing.
  const { detectPitch } = pitchUtils();
  for (const hz of [50, 60]) {
    for (const signal of [sine(hz), harmonic(hz)]) assert.equal(detectPitch(signal, 48000), null, `${hz} Hz hum named a pitch`);
  }
  for (const hz of [51.91, 58.27, 61.74]) {
    const got = detectPitch(harmonic(hz), 48000);
    assert.ok(got && Math.abs(errorCents(got, hz)) <= 50, `bass ${hz} Hz -> ${got}`);
  }
});

test("a tone at the top of the band reads its note, not an octave below", () => {
  // The other side of the next test: 1360–1500 Hz (F6 to F♯6) is inside the
  // band since PR #21 (it was "above the band" for the YIN detector, which
  // stopped at 1060 Hz and read a soprano's C6+ as nothing).
  const { detectPitch } = pitchUtils();
  for (const sampleRate of PITCH_RATES) {
    for (let hz = 1360; hz <= 1500; hz += 20) {
      const got = detectPitch(partials(hz, sampleRate, (h) => (h === 1 ? 0.3 : 0)), sampleRate);
      assert.ok(got && Math.abs(errorCents(got, hz)) <= 50, `${sampleRate} Hz: a ${hz} Hz tone -> ${got}`);
    }
  }
});

test("beeps and whistles above the band are never named as a note", () => {
  const { detectPitch } = pitchUtils();
  for (const sampleRate of PITCH_RATES) {
    // Above the shortest lag (1500 Hz at 48 kHz, 1521 Hz at 44.1 kHz)
    for (let hz = 1540; hz <= 4000; hz += 40) {
      const got = detectPitch(partials(hz, sampleRate, (h) => (h === 1 ? 0.3 : 0)), sampleRate);
      assert.equal(got, null, `${sampleRate} Hz: a ${hz} Hz tone named ${got} Hz`);
    }
  }
});

test("a noisy voice at 10 dB SNR is withheld or right, never a wrong octave", () => {
  const { detectPitch } = pitchUtils();
  for (const sampleRate of PITCH_RATES) {
    for (const tilt of [1, 1.5]) {
      for (const hz of [82.41, 110, 146.83, 220, 329.63, 392, 440, 523.25, 659.25, 783.99, 880]) {
        const voiced = partials(hz, sampleRate, (h) => 0.15 / Math.pow(h, tilt));
        const voiceRms = Math.sqrt(voiced.reduce((sum, v) => sum + v * v, 0) / voiced.length);
        for (let seed = 1; seed <= 8; seed++) {
          const noise = seededNoise(seed * 2654435761, 1, voiced.length);
          const noiseRms = Math.sqrt(noise.reduce((sum, v) => sum + v * v, 0) / noise.length);
          const gain = voiceRms / (Math.pow(10, 10 / 20) * noiseRms);
          const got = detectPitch(voiced.map((v, i) => v + gain * noise[i]), sampleRate);
          assert.ok(got == null || Math.abs(errorCents(got, hz)) <= 100,
            `${sampleRate} Hz, 1/h^${tilt}, seed ${seed}: ${hz} Hz misread as ${got} Hz`);
        }
      }
    }
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
