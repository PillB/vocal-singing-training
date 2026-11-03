// A Start that Stop cancelled must not go live when the permission prompt is
// answered later, and a hold may not bridge time the page did not hear.
// Ported from PR #24 (qa/microphone-race.test.mjs, P24-FLOW-ENG-LATE and
// P24-FLOW-HIDDEN-HOLD), rewritten for this engine: complete fake streams, so
// the test reaches the cancellation and not the live-track check, and one
// prompt per Start (PR #22's policy: no fan-out of permission prompts).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const engineSource = readFileSync(new URL("../../js/practice-engine.js", import.meta.url), "utf8");
const pitchSource = readFileSync(new URL("../../js/pitch-visualizer.js", import.meta.url), "utf8");

function track() {
  return { readyState: "live", muted: false, stops: 0, addEventListener() {}, stop() { this.stops++; this.readyState = "ended"; } };
}
const streamOf = (t) => ({ getTracks: () => [t], getAudioTracks: () => [t] });

/** An engine whose getUserMedia waits until the test answers each prompt. */
function raceEnv({ clock = performance, signal = null, onResume = null } = {}) {
  const win = {};
  const prompts = [];
  class FakeContext {
    state = onResume ? "suspended" : "running";
    async resume() { onResume?.(); this.state = "running"; }
    sampleRate = 48000;
    get currentTime() { return clock.now() / 1000; } // the audio clock runs with the page's
    addEventListener() {}
    removeEventListener() {}
    createGain() { return { gain: { value: 1 }, connect() {}, disconnect() {} }; }
    createAnalyser() {
      return { fftSize: 2048, frequencyBinCount: 1024, getFloatTimeDomainData: (buf) => signal?.(buf) };
    }
    createMediaStreamSource() { return { connect() {}, disconnect() {} }; }
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
  return { engine, prompts, statuses, frames: () => frames };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

test("Stop while the permission prompt is up: the late microphone is released, nothing goes live", async () => {
  const { engine, prompts, statuses, frames } = raceEnv();
  const starting = engine.start();
  await settle();
  assert.equal(prompts.length, 1, "one Start asks once");
  assert.equal(engine.starting, true, "the app can see a Start is pending, so its Stop can cancel it");
  engine.stop();
  assert.equal(engine.starting, false);
  prompts[0].grant();
  await assert.doesNotReject(starting);
  assert.equal(prompts[0].track.stops, 1, "the late-granted track is closed exactly once");
  assert.equal(prompts[0].track.readyState, "ended");
  assert.equal(engine.stream, null, "a closed stream is not kept");
  assert.equal(engine.running, false, "a cancelled Start never runs");
  assert.equal(frames(), 0, "no frame reaches a drill that never started");
  assert.equal(statuses.includes("listening"), false, "nothing says it is listening");
});

test("Stop while the audio graph resumes: the Start ends quietly and does not go live", async () => {
  let env = null;
  env = raceEnv({ onResume: () => env.engine.stop() });
  const { engine, prompts, statuses, frames } = env;
  const starting = engine.start();
  await settle();
  prompts[0].grant();
  await assert.doesNotReject(starting, "a graph Stop interrupted is not a microphone failure");
  assert.equal(engine.lastCaptureError, null, "no Retry message for a Stop the learner chose");
  assert.equal(engine.running, false, "the stopped Start stays stopped");
  assert.equal(prompts[0].track.readyState, "ended", "its track is released");
  assert.equal(statuses.includes("listening"), false);
  assert.equal(frames(), 0);
});

test("a Start that a newer Start replaced cannot leave its microphone open", async () => {
  for (const order of [[0, 1], [1, 0]]) {
    const { engine, prompts } = raceEnv();
    const first = engine.start();
    await settle();
    engine.stop();
    const second = engine.start();
    await settle();
    assert.equal(prompts.length, 2);
    for (const i of order) prompts[i].grant();
    await Promise.all([first, second]);
    assert.equal(engine.running, true, `order ${order}: the newer Start goes live`);
    assert.equal(prompts[0].track.readyState, "ended", `order ${order}: the cancelled Start's track is released`);
    assert.equal(engine.stream.getTracks()[0], prompts[1].track, `order ${order}: the live stream is the newer one`);
    engine.stop();
    assert.ok(prompts.every((p) => p.track.readyState === "ended"), `order ${order}: every granted track ends with the final Stop`);
  }
});

test("a hold does not bridge a minute of hidden tab: 3 s, 60 s with no frames, 0.5 s logs 3 s, not 63.5 s", async () => {
  let now = 10_000;
  let voiced = true;
  const signal = (buf) => {
    for (let i = 0; i < buf.length; i++) buf[i] = voiced ? 0.3 * Math.sin((2 * Math.PI * 220 * i) / 48000) : 0;
  };
  const { engine, prompts } = raceEnv({ clock: { now: () => now }, signal });
  const starting = engine.start();
  await settle();
  prompts[0].grant();
  await starting;
  const run = (ms) => { for (let t = 0; t < ms; t += 16) { now += 16; engine._loop(); } };
  run(3000);
  now += 60_000; // rAF stops while the tab is hidden; the mic keeps going
  run(500);
  voiced = false;
  run(1500);
  engine.stop();
  const holds = engine.getHolds().map((h) => h.seconds);
  assert.ok(holds.length >= 1, `a 3 s hold was logged: ${holds}`);
  assert.ok(Math.max(...holds) < 4, `no hold spans the hidden minute: ${holds}`);
  assert.ok(holds.some((s) => s >= 2.5 && s < 4), `the 3 s before the gap is kept: ${holds}`);
});
