import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = (name) => readFileSync(new URL(`../../js/${name}.js`, import.meta.url), "utf8");

function audioTrack() {
  const listeners = new Map();
  return {
    muted: false, readyState: "live", stops: 0,
    addEventListener(name, callback) { listeners.set(name, callback); },
    emit(name) { listeners.get(name)?.(); },
    stop() { this.stops++; this.readyState = "ended"; }
  };
}

function streamFor(track) {
  return { getTracks: () => [track], getAudioTracks: () => [track] };
}

class DeferredRecorder {
  static mimeTypes = [];
  static isTypeSupported(type) { return DeferredRecorder.mimeTypes.includes(type); }
  constructor(stream, opts = {}) {
    this.stream = stream;
    this.mimeType = opts.mimeType || "audio/mp4";
    this.state = "inactive";
  }
  start() { this.state = "recording"; }
  stop() {
    this.state = "inactive";
    queueMicrotask(() => {
      this.ondataavailable?.({ data: new Blob(["LAST-CHUNK"], { type: this.mimeType }) });
      this.onstop?.();
    });
  }
}

function recorderEnv(track = audioTrack()) {
  const win = {};
  let prompts = 0;
  const stream = streamFor(track);
  const navigator = { mediaDevices: { async getUserMedia() { prompts++; return stream; } } };
  runInNewContext(source("recorder"), {
    window: win, navigator, MediaRecorder: DeferredRecorder, Blob, performance,
    URL: { createObjectURL: () => "blob:take", revokeObjectURL() {} },
    cancelAnimationFrame() {}, requestAnimationFrame() {}
  });
  const rec = new win.VTRecorder();
  rec._startMeter = () => {}; // Meter quality is independent of format/stream ownership.
  return { rec, track, stream, prompts: () => prompts };
}

test("Safari-only MP4 recorder preserves the asynchronous final chunk with truthful MIME", async () => {
  DeferredRecorder.mimeTypes = ["audio/mp4"];
  const { rec, track, prompts } = recorderEnv();
  await rec.start();
  assert.equal(prompts(), 1);
  assert.equal(rec.mediaRecorder.mimeType, "audio/mp4");
  const result = await rec.stop();
  assert.equal(result.blob.type, "audio/mp4");
  assert.equal(await result.blob.text(), "LAST-CHUNK");
  assert.equal(track.stops, 1, "owned microphone must stop after recording");
});

test("recording during practice reuses its capture and never stops the borrowed track", async () => {
  DeferredRecorder.mimeTypes = ["audio/webm;codecs=opus", "audio/mp4"];
  const { rec, track, stream, prompts } = recorderEnv();
  await rec.start({ stream });
  assert.equal(prompts(), 0, "second getUserMedia prompt would disrupt iOS practice");
  assert.equal(rec.mediaRecorder.mimeType, "audio/webm;codecs=opus");
  const stopping = rec.stop();
  assert.equal(stopping, rec.stop(), "double Stop must share one final-chunk promise");
  const result = await stopping;
  assert.equal(await result.blob.text(), "LAST-CHUNK");
  assert.equal(track.stops, 0, "standalone recorder cannot kill the practice mic");
  assert.equal(track.readyState, "live");
});

test("cleared late recorder callback cannot consume or discard the next take", async () => {
  DeferredRecorder.mimeTypes = ["audio/mp4"];
  const { rec, track } = recorderEnv();
  await rec.start({ stream: streamFor(audioTrack()) });
  rec.clear();
  await rec.start({ stream: streamFor(track) });
  await new Promise((r) => setImmediate(r));
  assert.equal(rec.recording, true, "old onstop must not end the new recorder");
  const result = await rec.stop();
  assert.equal(await result.blob.text(), "LAST-CHUNK");
  assert.equal(track.stops, 0, "new borrowed practice track must survive both callbacks");
});

function practiceEnv({ graphFails = false, firstError = null } = {}) {
  const win = {};
  const track = audioTrack();
  const stream = streamFor(track);
  const timers = new Map();
  let nextTimer = 0, prompts = 0;
  class FakeContext {
    state = "running";
    sampleRate = 48000;
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    createAnalyser() { return { fftSize: 2048, frequencyBinCount: 1024, getFloatTimeDomainData() {} }; }
    createMediaStreamSource() {
      if (graphFails) throw new Error("WebKit audio route disconnected");
      return { connect() {}, disconnect() {} };
    }
  }
  win.AudioContext = FakeContext;
  const navigator = {
    mediaDevices: {
      async getUserMedia() {
        prompts++;
        if (firstError && prompts === 1) throw Object.assign(new Error("device error"), { name: firstError });
        return stream;
      }
    }
  };
  const setTimeout = (fn) => { const id = ++nextTimer; timers.set(id, fn); return id; };
  const clearTimeout = (id) => timers.delete(id);
  runInNewContext(source("practice-engine"), {
    window: win, navigator, AudioContext: FakeContext, performance, Float32Array, Uint8Array,
    setTimeout, clearTimeout, console, requestAnimationFrame: () => 1, cancelAnimationFrame() {}
  });
  const engine = new win.VTPracticeEngine();
  return { engine, track, prompts: () => prompts, flushTimers: () => {
    const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((fn) => fn());
  } };
}

test("failed Safari mic graph refuses fake live status and releases hardware", async () => {
  const { engine, track } = practiceEnv({ graphFails: true });
  await assert.rejects(engine.start(), /audio route disconnected/);
  assert.equal(engine.running, false);
  assert.equal(engine.stream, null);
  assert.equal(track.stops, 1);
});

test("a brief iOS mute recovers; sustained mute and ended track ask for explicit retry", async () => {
  const { engine, track, flushTimers } = practiceEnv();
  const states = [];
  engine.onStatus = (state) => states.push(state);
  await engine.start();
  assert.equal(engine.running, true);
  track.muted = true; track.emit("mute");
  track.muted = false; track.emit("unmute");
  flushTimers();
  assert.equal(states.includes("mic-muted"), false, "short switch must not eject singer");
  track.muted = true; track.emit("mute");
  flushTimers();
  assert.equal(states.includes("mic-muted"), true, "stalled input needs a visible retry");
  track.emit("ended");
  assert.equal(states.includes("mic-ended"), true);
  engine.stop();
});

test("busy iOS microphone is attempted once; unsupported constraints may be relaxed", async () => {
  const busy = practiceEnv({ firstError: "NotReadableError" });
  await assert.rejects(busy.engine.start(), /device error/);
  assert.equal(busy.prompts(), 1);
  const legacy = practiceEnv({ firstError: "OverconstrainedError" });
  await legacy.engine.start();
  assert.equal(legacy.prompts(), 2);
  legacy.engine.stop();
});

test("piano schedules its Safari unlock sounds before its first async resume yields", async () => {
  const win = {};
  runInNewContext(source("piano"), { window: win, Math, console });
  const calls = [];
  let finishResume;
  const ctx = {
    state: "interrupted", sampleRate: 48000, currentTime: 0, destination: {},
    resume() { calls.push("resume"); return new Promise((resolve) => { finishResume = () => { this.state = "running"; resolve(); }; }); },
    createBuffer() { return { getChannelData: () => new Float32Array(960) }; },
    createBufferSource() { return { connect() {}, start() { calls.push("buffer-start"); }, stop() {} }; },
    createOscillator() { return { frequency: { setValueAtTime() {} }, connect() {}, start() { calls.push("osc-start"); }, stop() {} }; },
    createGain() { return { gain: { setValueAtTime() {} }, connect() {} }; }
  };
  const piano = win.VTPiano;
  piano.ctx = ctx;
  piano.master = {};
  piano.comp = {};
  const unlocked = piano.unlock();
  assert.deepEqual(calls, ["resume", "buffer-start", "osc-start"], "waiting before sources loses iOS user activation");
  finishResume();
  assert.equal(await unlocked, true);
});

test("interrupted mobile sound exposes a real tap recovery; lost microphone ends the stale take", async () => {
  const nodes = new Map();
  for (const id of ["mic-blocked", "sound-blocked", "btn-sound-resume", "btn-practice-start", "btn-practice-stop"]) {
    nodes.set(id, { hidden: true, listeners: {}, addEventListener(name, fn) { this.listeners[name] = fn; } });
  }
  let stopped = 0, micBlocked = null, replayed = 0, unlocked = 0;
  const exercise = { id: "s2-solfege-chords" };
  const practice = { running: true, onStatus: null };
  const appState = { view: "exercise", practiceLive: true, exercise, practice };
  const app = {
    getState: () => appState, wantsSound: () => true, getProfile: () => ({ mode: "pitchChord" }),
    stopPractice(silent) { assert.equal(silent, true); stopped++; practice.running = false; appState.practiceLive = false; },
    showMicBlocked(canRun, reason) { micBlocked = { canRun, reason }; },
    async startExerciseSound() { replayed++; }
  };
  const piano = {
    ctx: { state: "interrupted" }, onStateChange: null,
    async unlock() { unlocked++; this.ctx.state = "running"; return true; }
  };
  const listeners = new Map();
  const session = { state: "active", addEventListener(name, fn) { this.onChange = fn; } };
  const document = {
    readyState: "complete", visibilityState: "visible", hidden: false,
    getElementById: (id) => nodes.get(id) || null,
    addEventListener(name, fn, capture) { listeners.set(`${name}:${!!capture}`, fn); }
  };
  runInNewContext(source("audio-recovery"), {
    window: { VTApp: app, VTPiano: piano, navigator: { audioSession: session } }, document, console,
    setTimeout: (fn) => { fn(); return 1; }
  });
  listeners.get("click:true")({
    target: { closest(selector) { assert.match(selector, /mic-primer/); return {}; } }
  });
  assert.equal(unlocked, 1, "initial Start/primer confirmation must unlock before permission await");
  piano.ctx.state = "interrupted";
  piano.onStateChange("interrupted");
  assert.equal(nodes.get("sound-blocked").hidden, false, "silent context needs a visible tap target");
  await nodes.get("btn-sound-resume").listeners.click();
  assert.equal(unlocked, 2);
  assert.equal(replayed, 1);
  assert.equal(nodes.get("sound-blocked").hidden, true);
  session.state = "interrupted";
  session.onChange();
  assert.equal(nodes.get("sound-blocked").hidden, false, "AudioSession interruption matters even when context looked running");
  session.state = "active";
  session.onChange();
  assert.equal(nodes.get("sound-blocked").hidden, true);
  practice.onStatus("mic-ended");
  assert.equal(stopped, 1);
  assert.deepEqual(micBlocked, { canRun: false, reason: "interrupted" });
});
