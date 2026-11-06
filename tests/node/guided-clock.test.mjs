// A guided drill's steps run on wall time, as the app's step timer does.
// Ported from PR #24 (qa/guided-clock.test.mjs: "guided phases use real
// elapsed time") and extended to this engine and to the drill's Vad.
// Wrong behaviours rejected:
// - Steps paced on the engine's dtMs, which it caps at 50 ms a frame for the
//   signal features: under 20 fps the guide fell behind (10 fps: 30 s of wall
//   time was 15 s of guide) while the step timer, anchored to its end time,
//   ended the step with the guide half-way.
// - A frame after a hidden tab moving the guide on by the whole time it was
//   hidden, skipping steps nobody did.
// - The drill's Vad left on the capped time: a step's chapter compares its
//   span (steps' clock) with speech dated on the Vad's clock, so at 10 fps
//   the third step of a 30 s take said "talking 0%" over 10 s of talk.
// - A zero, negative or non-finite delta inventing practice time.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** guided.js alone, as PR #24's oracle loads it. */
function loadRun() {
  const host = { window: { VTViz: { scenes: {}, clamp } } };
  runInNewContext(read("js/scenes/guided.js"), host);
  return host.window.VTViz.guided.Run;
}

/** voice-features.js and guided.js in one page, with a canvas-free VTViz. */
function loadDrills() {
  class Surface {
    constructor() {
      this.canvas = { addEventListener() {} };
    }
    draw() {}
    caption() {}
    destroy() {}
  }
  const V = {
    scenes: {},
    clamp,
    C: {},
    L: (es, en) => en,
    isEs: () => false,
    font: () => "",
    fmtSec: (s, d = 0) => `${s.toFixed(d)} s`,
    fmtNum: (n) => String(n),
    Surface
  };
  const win = { VTViz: V };
  const ctx = { window: win, Math, Float32Array, console };
  runInNewContext(read("js/voice-features.js"), ctx);
  runInNewContext(read("js/scenes/guided.js"), ctx);
  return { G: V.guided, F: win.VTFeatures };
}

/** A drill with the mic on, as practice-modes.js makes one (no listen-back here). */
function micDrill(G, phases) {
  const hud = { classList: { add() {}, remove() {} }, innerHTML: "", querySelector: () => null };
  return new G.Drill({ hud }, { kind: "drill", title: "t", phases, mic: true });
}

/** An engine frame `wallMs` after the one before: dtMs capped as the engine caps it. */
function voiceFrame(wallMs, elapsedMs, i) {
  // Syllables: the level swings ~10 dB at about 4 Hz, a pitched voice throughout
  const rms = 0.05 * (0.55 + 0.45 * Math.sin(i * 1.7));
  return { dtMs: Math.min(50, wallMs), wallDtMs: wallMs, elapsedMs, rms, sounding: true, voiced: true, rawFreq: 200, voiceFreq: 200, clarity: 0.9 };
}

const talkPct = (sub) => Number((/talking (\d+)%/.exec(sub) || [])[1]);

/* —— PR #24's oracle: ideal frames and throttled frames must agree —— */

const phases = [{ label: "Prepare", sec: 6 }, { label: "Relax", sec: 21 }, { label: "Review", sec: 3 }];

test("guided phases follow actual 6s, even at 1 callback per second", () => {
  const Run = loadRun();
  const run = new Run(phases);
  for (let s = 1; s <= 6; s++) run.tick({ dtMs: 1000, wallDtMs: 1000, elapsedMs: s * 1000 });
  assert.equal(run.index, 1, "six seconds must complete the six-second preparation");
  assert.ok(Math.abs(run.clock - 6) < 0.01, `clock=${run.clock} rather than 6`);
  assert.ok(run.remaining > 20 && run.remaining <= 21);
  // A capped 100ms tick would accumulate 0.6 seconds and FAIL this assertion.
});

test("timed and throttled paths yield the same completed phases", () => {
  const Run = loadRun();
  const fast = new Run(phases);
  const slow = new Run(phases);
  for (let i = 1; i <= 600; i++) fast.tick({ dtMs: 50, elapsedMs: i * 50 });
  for (let i = 1; i <= 30; i++) slow.tick({ dtMs: 1000, wallDtMs: 1000, elapsedMs: i * 1000 });
  assert.equal(fast.done, true);
  assert.equal(slow.done, true);
  assert.equal(slow.completed, fast.completed);
  assert.ok(Math.abs(slow.clock - fast.clock) < 0.01);
});

test("invalid and zero deltas never invent practice time", () => {
  const Run = loadRun();
  const run = new Run(phases);
  for (const dt of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) run.tick({ dtMs: dt });
  for (const dt of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) run.tick({ dtMs: 50, wallDtMs: dt });
  assert.equal(run.clock, 0);
  assert.equal(run.index, 0);
});

/* —— This engine: frames carry wall time, and the steps keep to it —— */

/** A started engine on a fake clock; `frame(ms)` runs one analysis frame `ms` later. */
async function engineOnClock() {
  let now = 10_000;
  const win = {};
  const track = { readyState: "live", muted: false, addEventListener() {}, stop() {} };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  class FakeContext {
    state = "running";
    sampleRate = 48000;
    get currentTime() {
      return now / 1000;
    }
    async resume() {}
    addEventListener() {}
    removeEventListener() {}
    createGain() {
      return { gain: { value: 1 }, connect() {}, disconnect() {} };
    }
    createAnalyser() {
      return {
        fftSize: 2048,
        frequencyBinCount: 1024,
        getFloatTimeDomainData(buf) {
          for (let i = 0; i < buf.length; i++) buf[i] = 0.3 * Math.sin((2 * Math.PI * 220 * i) / 48000);
        }
      };
    }
    createMediaStreamSource() {
      return { connect() {}, disconnect() {} };
    }
  }
  win.AudioContext = FakeContext;
  const ctx = {
    window: win,
    navigator: { mediaDevices: { getUserMedia: async () => stream } },
    AudioContext: FakeContext,
    performance: { now: () => now },
    Float32Array,
    Uint8Array,
    setTimeout,
    clearTimeout,
    console,
    requestAnimationFrame: () => 1,
    cancelAnimationFrame() {}
  };
  runInNewContext(read("js/pitch-visualizer.js"), ctx);
  runInNewContext(read("js/practice-engine.js"), ctx);
  const engine = new win.VTPracticeEngine();
  await engine.start();
  return {
    engine,
    frame(ms) {
      now += ms;
      engine._loop();
    }
  };
}

test("the engine's frame carries the uncapped wall time beside the capped dtMs", async () => {
  const { engine, frame } = await engineOnClock();
  const got = [];
  const handler = (f) => got.push({ dtMs: f.dtMs, wallDtMs: f.wallDtMs });
  engine.onFrame = handler;
  frame(100);
  frame(100);
  frame(16);
  frame(60_000); // rAF stops while the tab is hidden
  assert.deepEqual(got.slice(1), [
    { dtMs: 50, wallDtMs: 100 },
    { dtMs: 16, wallDtMs: 16 },
    { dtMs: 50, wallDtMs: 60_000 }
  ]);
  assert.equal(engine.onFrame, handler, "the app's onFrame is the one it set, between frames");
  // A frame whose handler replaces onFrame (a Stop, another mode) keeps the replacement
  const next = () => {};
  engine.onFrame = () => {
    engine.onFrame = next;
  };
  frame(16);
  assert.equal(engine.onFrame, next, "a handler set during a frame is not overwritten");
  engine.stop();
});

test("at 10 fps the engine's frames pace 30 s of steps in 30 s, not 15", async () => {
  const Run = loadRun();
  const { engine, frame } = await engineOnClock();
  const run = new Run([{ label: "a", sec: 10 }, { label: "b", sec: 10 }, { label: "c", sec: 10 }]);
  engine.onFrame = (f) => run.tick(f);
  for (let i = 0; i < 300; i++) frame(100);
  assert.ok(Math.abs(run.clock - 30) < 0.05, `clock=${run.clock} after 30 s of wall time`);
  assert.ok(run.index === 2 && run.remaining < 0.05, `step ${run.index + 1}, ${run.remaining} s left when the step timer ends`);
  frame(100);
  engine.stop();
  assert.equal(run.done, true, "the guide ends with the step timer");
});

/* —— The drill: steps and its Vad on one clock —— */

test("at 10 fps the drill's Vad and its steps keep one clock: every step's chapter reads its talk", () => {
  const { G } = loadDrills();
  const drill = micDrill(G, [{ label: "a", sec: 10 }, { label: "b", sec: 10 }, { label: "c", sec: 10 }]);
  for (let i = 1; i <= 300; i++) drill.frame(voiceFrame(100, i * 100, i));
  const { run, vad } = drill;
  assert.ok(Math.abs(run.clock - 30) < 0.05, `steps' clock=${run.clock} after 30 s of wall time`);
  assert.ok(Math.abs(vad.t - run.clock) < 0.1, `Vad t=${vad.t} vs steps' clock=${run.clock}`);
  const chapters = drill.stepChapters();
  assert.deepEqual(Array.from(chapters, (c) => c.label), ["a", "b", "c"], "every step ran and is a chapter");
  for (const c of chapters) {
    assert.ok(talkPct(c.sub) >= 90, `${c.label} (${c.t0.toFixed(1)}–${c.t1.toFixed(1)} s): "${c.sub}" over 10 s of talk`);
  }
});

test("a frame after a hidden minute moves the guide on a second, not three steps", () => {
  const { G } = loadDrills();
  const drill = micDrill(G, [{ label: "a", sec: 10 }, { label: "b", sec: 10 }, { label: "c", sec: 10 }]);
  drill.frame(voiceFrame(60_000, 60_000, 1));
  const { run, vad } = drill;
  assert.equal(run.done, false, "a minute nobody saw did not finish the drill");
  assert.equal(run.index, 0);
  assert.ok(run.clock > 0.5 && run.clock <= 1, `clock=${run.clock}: one frame stands for up to a second`);
  assert.ok(Math.abs(vad.t - run.clock) < 0.01, `Vad t=${vad.t} vs steps' clock=${run.clock}`);
});

test("every other Vad keeps the capped frame time", () => {
  const { F } = loadDrills();
  const vad = new F.Vad({});
  for (let i = 1; i <= 300; i++) vad.feed(voiceFrame(100, i * 100, i));
  assert.ok(Math.abs(vad.t - 15) < 0.05, `t=${vad.t}: a Vad made without maxDt counts 50 ms a frame, as the engine caps it`);
});
