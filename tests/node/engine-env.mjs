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

/** A microphone track; end() and mute() play what the OS does to it. */
export function track() {
  return {
    readyState: "live", muted: false, stops: 0, L: {},
    addEventListener(type, fn) { (this.L[type] ||= []).push(fn); },
    stop() { this.stops++; this.readyState = "ended"; },
    fire(type) { (this.L[type] || []).slice().forEach((fn) => fn()); },
    end() { this.readyState = "ended"; this.fire("ended"); },
    mute() { this.muted = true; this.fire("mute"); }
  };
}
export const streamOf = (t) => ({ getTracks: () => [t], getAudioTracks: () => [t] });

/** A 220 Hz tone at 0.3 while `voiced()` is true, else silence. */
export const toneWhile = (voiced) => (buf) => {
  for (let i = 0; i < buf.length; i++) buf[i] = voiced() ? 0.3 * Math.sin((2 * Math.PI * 220 * i) / 48000) : 0;
};

/**
 * onResume: called inside a suspended context's resume(). slowResume: each
 * resume() waits until the test calls resumes[i](). piano: the page's
 * window.VTPiano (the engine resumes it as Start builds the graph).
 */
export function engineEnv({ clock = performance, timers = null, signal = null, onResume = null, slowResume = false, piano = null } = {}) {
  const win = piano ? { VTPiano: piano } : {};
  const prompts = [];
  const resumes = [];
  const nodes = [];
  const node = (kind, extra = {}) => {
    const n = { kind, connected: false, connect() { this.connected = true; }, disconnect() { this.connected = false; }, ...extra };
    nodes.push(n);
    return n;
  };
  const stateListeners = [];
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
    addEventListener(type, fn) { if (type === "statechange") stateListeners.push({ ctx: this, fn }); }
    removeEventListener(type, fn) {
      const i = stateListeners.findIndex((l) => l.fn === fn);
      if (i >= 0) stateListeners.splice(i, 1);
    }
    createGain() { return node("gain", { gain: { value: 1 } }); }
    createAnalyser() {
      return node("analyser", { fftSize: 2048, frequencyBinCount: 1024, getFloatTimeDomainData: (buf) => signal?.(buf) });
    }
    createMediaStreamSource(stream) { return node("source", { stream }); }
  }
  win.AudioContext = FakeContext;
  let asked = 0;
  const navigator = {
    mediaDevices: {
      getUserMedia() {
        asked++;
        return new Promise((resolve) => {
          const t = track();
          prompts.push({ track: t, grant: () => resolve(streamOf(t)) });
        });
      }
    }
  };
  const ctx = {
    window: win, navigator, AudioContext: FakeContext, performance: clock, Float32Array, Uint8Array,
    setTimeout: timers?.setTimeout || setTimeout, clearTimeout: timers?.clearTimeout || clearTimeout,
    console: { ...console, warn() {} }, requestAnimationFrame: () => 1, cancelAnimationFrame() {}
  };
  runInNewContext(pitchSource, ctx);
  runInNewContext(engineSource, ctx);
  const engine = new win.VTPracticeEngine();
  const statuses = [];
  let frames = 0;
  engine.onStatus = (s) => statuses.push(s);
  engine.onFrame = () => { frames++; };
  /** The audio context's state changes, as the OS changes it. */
  const setContextState = (state) => stateListeners.slice().forEach(({ ctx, fn }) => { ctx.state = state; fn(); });
  return { engine, prompts, resumes, nodes, statuses, frames: () => frames, asked: () => asked, setContextState };
}

export const settle = () => new Promise((r) => setTimeout(r, 0));

/**
 * A page clock with its own timers, so a test can pin a delay: advance(ms)
 * runs every timer due by then, in order, letting promises settle between.
 * Pass it as both `clock` and `timers` to engineEnv.
 */
export function vclock(t = 10_000) {
  const c = { t, q: [], id: 0, now() { return this.t; } };
  c.setTimeout = (fn, ms) => {
    const id = ++c.id;
    c.q.push({ id, due: c.t + (Number(ms) || 0), fn });
    return id;
  };
  c.clearTimeout = (id) => { c.q = c.q.filter((x) => x.id !== id); };
  c.advance = async (ms) => {
    const end = c.t + ms;
    for (;;) {
      c.q.sort((a, b) => a.due - b.due);
      const next = c.q[0];
      if (!next || next.due > end) break;
      c.q.shift();
      c.t = Math.max(c.t, next.due);
      next.fn();
      for (let i = 0; i < 4; i++) await settle();
    }
    c.t = end;
    for (let i = 0; i < 4; i++) await settle();
  };
  return c;
}

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
