/**
 * A practice engine in a vm, with fakes complete enough to reach its logic.
 * getUserMedia waits until the test answers each prompt (prompts[i].grant()),
 * the audio clock runs with the page clock, and every node records whether it
 * is still connected. Shared by the engine's node tests; not a test itself.
 */
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const engineSource = readFileSync(new URL("../../js/practice-engine.js", import.meta.url), "utf8");
const pitchSource = readFileSync(new URL("../../js/pitch-visualizer.js", import.meta.url), "utf8");

export function track() {
  return { readyState: "live", muted: false, stops: 0, addEventListener() {}, stop() { this.stops++; this.readyState = "ended"; } };
}
export const streamOf = (t) => ({ getTracks: () => [t], getAudioTracks: () => [t] });

/** A 220 Hz tone at 0.3 while `voiced()` is true, else silence. */
export const toneWhile = (voiced) => (buf) => {
  for (let i = 0; i < buf.length; i++) buf[i] = voiced() ? 0.3 * Math.sin((2 * Math.PI * 220 * i) / 48000) : 0;
};

/**
 * onResume: called inside a suspended context's resume(). slowResume: each
 * resume() waits until the test calls resumes[i]().
 */
export function engineEnv({ clock = performance, signal = null, onResume = null, slowResume = false } = {}) {
  const win = {};
  const prompts = [];
  const resumes = [];
  const nodes = [];
  const node = (kind, extra = {}) => {
    const n = { kind, connected: false, connect() { this.connected = true; }, disconnect() { this.connected = false; }, ...extra };
    nodes.push(n);
    return n;
  };
  class FakeContext {
    state = onResume || slowResume ? "suspended" : "running";
    resume() {
      if (!slowResume) {
        onResume?.();
        this.state = "running";
        return Promise.resolve();
      }
      return new Promise((resolve) => resumes.push(() => { this.state = "running"; resolve(); }));
    }
    sampleRate = 48000;
    get currentTime() { return clock.now() / 1000; } // the audio clock runs with the page's
    addEventListener() {}
    removeEventListener() {}
    createGain() { return node("gain", { gain: { value: 1 } }); }
    createAnalyser() {
      return node("analyser", { fftSize: 2048, frequencyBinCount: 1024, getFloatTimeDomainData: (buf) => signal?.(buf) });
    }
    createMediaStreamSource(stream) { return node("source", { stream }); }
  }
  win.AudioContext = FakeContext;
  const navigator = {
    mediaDevices: {
      getUserMedia() {
        return new Promise((resolve) => {
          const t = track();
          prompts.push({ track: t, grant: () => resolve(streamOf(t)) });
        });
      }
    }
  };
  const ctx = {
    window: win, navigator, AudioContext: FakeContext, performance: clock, Float32Array, Uint8Array,
    setTimeout, clearTimeout, console, requestAnimationFrame: () => 1, cancelAnimationFrame() {}
  };
  runInNewContext(pitchSource, ctx);
  runInNewContext(engineSource, ctx);
  const engine = new win.VTPracticeEngine();
  const statuses = [];
  let frames = 0;
  engine.onStatus = (s) => statuses.push(s);
  engine.onFrame = () => { frames++; };
  return { engine, prompts, resumes, nodes, statuses, frames: () => frames };
}

export const settle = () => new Promise((r) => setTimeout(r, 0));

/** Start the engine and answer its prompt. */
export async function started(env) {
  const s = env.engine.start();
  await settle();
  env.prompts[env.prompts.length - 1].grant();
  await s;
  return env;
}

/** Run `ms` of 16 ms frames on a fake clock object { now } that the env was built with. */
export const framesFor = (engine, clock) => (ms) => {
  for (let t = 0; t < ms; t += 16) {
    clock.t += 16;
    engine._loop();
  }
};
