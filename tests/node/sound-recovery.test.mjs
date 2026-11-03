// The "sound blocked" banner and the piano's resume, on a virtual clock so
// each delay is pinned. From QA round 5 on PR #27 (qa/round4/pr27/micrace).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

import { vclock } from "./engine-env.mjs";

const source = (name) => readFileSync(new URL(`../../js/${name}.js`, import.meta.url), "utf8");

/**
 * audio-recovery.js over a live take whose output can be interrupted; a test
 * may hand it a banner laid out on a stage of its own.
 */
function recovery({ banner, innerHeight } = {}) {
  const clock = vclock(0);
  const nodes = new Map();
  for (const id of ["mic-blocked", "sound-blocked", "btn-sound-resume", "btn-practice-start", "btn-practice-stop"]) {
    nodes.set(id, { hidden: true, addEventListener() {} });
  }
  if (banner) nodes.set("sound-blocked", banner);
  const appState = { view: "exercise", practiceLive: true, exercise: { id: "s2-solfege-chords" }, practice: { running: true } };
  const app = {
    getState: () => appState, wantsSound: () => true, getProfile: () => ({ mode: "pitchChord" }),
    stopPractice() {}, showMicBlocked() {}, async startExerciseSound() {}
  };
  const piano = { ctx: { state: "running" }, onStateChange: null, async unlock() { return true; } };
  const session = { state: "active", addEventListener(name, fn) { this.onChange = fn; } };
  const document = {
    readyState: "complete", visibilityState: "visible", hidden: false,
    getElementById: (id) => nodes.get(id) || null, addEventListener() {}
  };
  runInNewContext(source("audio-recovery"), {
    window: { VTApp: app, VTPiano: piano, navigator: { audioSession: session }, innerHeight }, document, console,
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout
  });
  return {
    clock, piano, session, appState,
    shown: () => !nodes.get("sound-blocked").hidden,
    endTake() {
      appState.practiceLive = false;
      appState.practice.running = false;
      nodes.get("sound-blocked").hidden = true; // Stop's own hideSound
    }
  };
}

test("an audio session interrupted for half a second leaves no banner once it is active again", async () => {
  const r = recovery();
  r.session.state = "interrupted";
  r.session.onChange();
  await r.clock.advance(500);
  r.session.state = "active";
  r.session.onChange();
  await r.clock.advance(3000);
  assert.equal(r.shown(), false, "a call that never came, or a short Siri, shows nothing");
});

test("an audio session that stays interrupted shows the banner at 1.2 s, not before", async () => {
  const r = recovery();
  r.session.state = "interrupted";
  r.session.onChange();
  await r.clock.advance(1100);
  assert.equal(r.shown(), false);
  await r.clock.advance(200);
  assert.equal(r.shown(), true);
});

test("an interrupted piano context shows the banner at 1.2 s, not before", async () => {
  const r = recovery();
  r.piano.ctx.state = "interrupted";
  r.piano.onStateChange("interrupted");
  await r.clock.advance(1100);
  assert.equal(r.shown(), false);
  await r.clock.advance(200);
  assert.equal(r.shown(), true);
});

test("a take that ends while the banner waits leaves no banner on the stopped exercise", async () => {
  const r = recovery();
  r.piano.ctx.state = "interrupted";
  r.piano.onStateChange("interrupted");
  await r.clock.advance(400);
  r.endTake();
  await r.clock.advance(2000);
  assert.equal(r.shown(), false);
});

test("with no free band to hold it, the banner covers a row of two controls before it covers Stop", async () => {
  const rect = (top, bottom) => ({ top, bottom, left: 0, right: 300, width: 300, height: bottom - top });
  const control = (id, top, bottom) => ({ id, getBoundingClientRect: () => rect(top, bottom) });
  // Rows 10 px apart: the selects and their labels, Stop alone, two more rows.
  const controls = [
    control("sel-a", 100, 160), control("label-a", 100, 160),
    control("btn-practice-stop", 170, 230),
    control("sel-b", 240, 300), control("label-b", 240, 300),
    control("sel-c", 310, 400), control("label-c", 310, 400)
  ];
  const stage = { getBoundingClientRect: () => rect(100, 400), querySelectorAll: () => controls, children: [] };
  const classes = new Set();
  const banner = {
    hidden: true, addEventListener() {}, offsetParent: stage, parentElement: stage, offsetHeight: 60,
    style: { removeProperty(key) { delete this[key]; } },
    classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) },
    contains: (node) => node === banner, getBoundingClientRect: () => rect(0, 60)
  };
  const r = recovery({ banner, innerHeight: 800 });
  r.piano.ctx.state = "interrupted";
  r.piano.onStateChange("interrupted");
  await r.clock.advance(1300);
  assert.equal(r.shown(), true);
  assert.ok(classes.has("is-compact"), "it tried its one-line form first");
  const top = 100 + parseFloat(banner.style.top);
  assert.ok(top + 60 <= 170 || top >= 230, `the banner (${top}-${top + 60}) leaves Stop (170-230) free`);
});

/**
 * piano.js with an audio context whose resume() never settles, unless the
 * test hands it another: resume(ctx, clock) returns the promise.
 */
function hungPiano({ resume } = {}) {
  const clock = vclock(0);
  const param = () => ({ value: 1, setValueAtTime() {}, linearRampToValueAtTime() {}, exponentialRampToValueAtTime() {}, cancelScheduledValues() {}, setTargetAtTime() {} });
  const node = () => ({ connect() {}, disconnect() {}, start() {}, stop() {}, gain: param(), frequency: param(), threshold: param(), knee: param(), ratio: param(), attack: param(), release: param(), getFloatTimeDomainData() {}, getByteTimeDomainData() {} });
  class HungContext {
    state = "suspended";
    sampleRate = 48000;
    currentTime = 0;
    destination = node();
    resume() { return resume ? resume(this, clock) : new Promise(() => {}); }
    addEventListener(name, fn) { if (name === "statechange") listeners.push(fn); }
    removeEventListener() {}
    createBuffer(ch, n) { return { getChannelData: () => new Float32Array(n) }; }
  }
  const listeners = [];
  const ctx = new Proxy(new HungContext(), {
    get(target, key) {
      if (key in target) return target[key];
      return typeof key === "string" && key.startsWith("create") ? () => node() : undefined;
    }
  });
  const win = { AudioContext: function AudioContext() { return ctx; }, addEventListener() {}, document: { addEventListener() {} } };
  runInNewContext(source("piano"), {
    window: win, document: win.document, console: { ...console, warn() {} }, Float32Array, performance: { now: () => clock.t },
    setTimeout: clock.setTimeout, clearTimeout: clock.clearTimeout
  });
  const setState = (state) => { ctx.state = state; listeners.forEach((fn) => fn()); };
  return { clock, piano: win.VTPiano, setState };
}

test("the piano's unlock gives up on a resume that never settles after 8 s, so Start can go on", async () => {
  const { clock, piano } = hungPiano();
  let unlocked = "pending";
  piano.unlock().then((ok) => { unlocked = ok; });
  await clock.advance(7900);
  assert.equal(unlocked, "pending", "a slow resume still has its 8 s");
  await clock.advance(200);
  assert.equal(unlocked, false, "then unlock says the sound is not running");
});

test("the piano's resume gives up on a resume that never settles after 8 s", async () => {
  const { clock, piano } = hungPiano();
  piano.ctx || piano.ensure?.();
  let done = false;
  piano.resume().then(() => { done = true; }, () => { done = true; });
  await clock.advance(7900);
  assert.equal(done, false);
  await clock.advance(200);
  assert.equal(done, true);
});

test("the piano's ensure gives up on a resume that never settles after 8 s", async () => {
  const { clock, piano } = hungPiano();
  let done = false;
  piano.ensure().then(() => { done = true; }, () => { done = true; });
  await clock.advance(7900);
  assert.equal(done, false, "a slow resume still has its 8 s");
  await clock.advance(200);
  assert.equal(done, true, "then the Start that awaits ensure goes on");
});

test("unlock then ensure on a held session costs Start one 8 s wait, not two", async () => {
  const { clock, piano } = hungPiano();
  let done = false;
  piano.unlock().then(() => piano.ensure()).then(() => { done = true; });
  await clock.advance(8100);
  assert.equal(done, false, "ensure still gives the held resume a last 250 ms");
  await clock.advance(300);
  assert.equal(done, true, "every resume of the context shares the first one's 8 s");
});

test("a resume asked for after the shared 8 s still gets 250 ms: the interruption may just have ended", async () => {
  let calls = 0;
  const { clock, piano } = hungPiano({
    resume(ctx, c) {
      calls += 1;
      if (calls === 1) return new Promise(() => {});
      return new Promise((resolve) => c.setTimeout(() => { ctx.state = "running"; resolve(); }, 100));
    }
  });
  assert.equal(await (async () => { const p = piano.unlock(); await clock.advance(8100); return p; })(), false);
  let unlocked = "pending";
  piano.unlock().then((ok) => { unlocked = ok; });
  await clock.advance(200);
  assert.equal(unlocked, true, "the call ended: the second tap gets its sound");
});

test("a progression on a held session starts within 9 s instead of never", async () => {
  const { clock, piano } = hungPiano();
  let started = false;
  piano.playProgression("prog1").then(() => { started = true; }, () => { started = true; });
  await clock.advance(7900);
  assert.equal(started, false);
  await clock.advance(1100);
  assert.equal(started, true, "ensure 8 s, then 250 ms for each later resume");
});

test("a session that came back and is held again gets its full 8 s again", async () => {
  let calls = 0;
  const { clock, piano, setState } = hungPiano({
    resume(ctx, c) {
      calls += 1;
      if (calls === 1) return new Promise(() => {});
      return new Promise((resolve) => c.setTimeout(() => { ctx.state = "running"; resolve(); }, 2000));
    }
  });
  const first = piano.unlock();
  await clock.advance(8100);
  assert.equal(await first, false);
  setState("running"); // the call ended; iOS ran the context without settling the old resume
  await clock.advance(10_000);
  setState("suspended"); // the next call
  let done = false;
  piano.ensure().then(() => { done = true; });
  await clock.advance(1000);
  assert.equal(done, false, "this resume is a new wait, not the tail of the old one");
  await clock.advance(1100);
  assert.equal(done, true);
  assert.equal(piano.ctx.state, "running");
});
