// What Start and a live take do when the phone takes the microphone or the
// audio context away, on a virtual clock so each delay is pinned: a test that
// flushes every timer whatever its delay cannot tell 1.2 s from 2 minutes.
// From QA round 5 on PR #27 (qa/round4/pr27/micrace), rewritten on this
// suite's engine harness.
import test from "node:test";
import assert from "node:assert/strict";

import { engineEnv, settle, vclock, toneWhile, framesFor } from "./engine-env.mjs";

const live = (env) => env.prompts.filter((p) => p.track.readyState === "live").length;
async function liveEngine(opts = {}) {
  const clock = vclock();
  const env = engineEnv({ clock, timers: clock, ...opts });
  const s = env.engine.start();
  await settle();
  env.prompts[0].grant();
  await s;
  env.statuses.length = 0;
  return { ...env, clock };
}

test("a microphone that ends while Start builds the audio graph fails the Start; it never says listening", async () => {
  const clock = vclock();
  const env = engineEnv({ clock, timers: clock, slowResume: true });
  const starting = env.engine.start();
  await settle();
  env.prompts[0].grant();
  await settle();
  env.prompts[0].track.end(); // a call, or the headset unplugged, during the resume
  env.resumes.forEach((r) => r());
  await assert.rejects(starting, /ended/, "the Start reports the lost microphone");
  assert.equal(env.engine.running, false);
  assert.ok(env.engine.lastCaptureError, "the app can offer Retry");
  assert.equal(env.statuses.includes("listening"), false, "nothing says it is listening");
  assert.equal(env.frames(), 0, "no frame from a dead microphone");
});

test("the same microphone ending once the take is live ends the take as mic-ended", async () => {
  const env = await liveEngine();
  env.prompts[0].track.end();
  assert.deepEqual(env.statuses, ["mic-ended"]);
});

test("a context resume that never settles fails the Start after 8 s and gives the microphone back", async () => {
  const clock = vclock();
  const env = engineEnv({ clock, timers: clock, slowResume: true }); // resumes are never answered
  let outcome = "pending";
  env.engine.start().then(() => { outcome = "resolved"; }, (e) => { outcome = e.name; });
  await settle();
  env.prompts[0].grant();
  await clock.advance(0); // the grant reaches the graph's resume
  await clock.advance(7900);
  assert.equal(outcome, "pending", "a slow iPhone resume still has its 8 s");
  assert.equal(env.engine.starting, true);
  await clock.advance(200);
  assert.equal(outcome, "AudioResumeTimeout", "then Start fails, so the app shows Retry");
  assert.equal(live(env), 0, "the granted microphone is released");
  assert.equal(env.engine.starting, false, "Start and Stop come back");
  assert.equal(env.engine.running, false);
});

test("a piano whose resume never settles fails the Start after 8 s too", async () => {
  const clock = vclock();
  const env = engineEnv({ clock, timers: clock, piano: { resume: () => new Promise(() => {}) } });
  let outcome = "pending";
  env.engine.start().then(() => { outcome = "resolved"; }, (e) => { outcome = e.name; });
  await settle();
  env.prompts[0].grant();
  await clock.advance(0);
  await clock.advance(7900);
  assert.equal(outcome, "pending", "the piano's own slow resume still has its 8 s");
  await clock.advance(200);
  assert.equal(outcome, "AudioResumeTimeout", "then Start fails, so the app shows Retry");
  assert.equal(live(env), 0, "the granted microphone is released");
  assert.equal(env.engine.starting, false);
});

test("a resume that settles in time goes live with one microphone", async () => {
  const clock = vclock();
  const env = engineEnv({ clock, timers: clock, slowResume: true });
  const starting = env.engine.start();
  await settle();
  env.prompts[0].grant();
  await clock.advance(0); // the grant reaches the graph's resume, so its 8 s start now
  assert.ok(env.resumes.length > 0, "Start is waiting on a resume");
  await clock.advance(3000);
  env.resumes.forEach((r) => r());
  await starting;
  assert.equal(env.engine.running, true);
  assert.equal(live(env), 1);
  env.engine.stop();
});

test("a sustained mute ends the take at 1.2 s, not before and not two minutes later", async () => {
  const env = await liveEngine();
  env.prompts[0].track.mute();
  await env.clock.advance(1190);
  assert.deepEqual(env.statuses, [], "a brief iOS route-switch mute is not a lost microphone");
  await env.clock.advance(20);
  assert.deepEqual(env.statuses, ["mic-muted"]);
});

test("a context that stays suspended ends the take at 1.2 s", async () => {
  const env = await liveEngine();
  env.setContextState("suspended");
  await env.clock.advance(1190);
  assert.deepEqual(env.statuses, []);
  await env.clock.advance(20);
  assert.deepEqual(env.statuses, ["input-interrupted"]);
});

test("a mute on the last take's microphone never ends the new take", async () => {
  const env = await liveEngine();
  const old = env.prompts[0].track;
  env.engine.stop();
  const s = env.engine.start();
  await settle();
  env.prompts[1].grant();
  await s;
  env.statuses.length = 0;
  old.mute();
  old.fire("ended");
  await env.clock.advance(3000);
  assert.deepEqual(env.statuses, [], "a retired track's events do not reach the live take");
  assert.equal(env.engine.running, true);
  env.engine.stop();
});

// Codex review on PR #32. The last take's track keeps its listeners, and while its recorder flushes it is not even
// stopped, so an iOS route switch mutes and unmutes it beside the new one. Its listeners shared the engine's one
// mute timer: an unmute (or a later mute) of the old track cancelled the new take's check, and a sustained mute
// on the new microphone was never reported, so the app never offered recovery.
async function secondTake() {
  const env = await liveEngine();
  const old = env.prompts[0].track;
  env.engine.stop();
  const s = env.engine.start();
  await settle();
  env.prompts[1].grant();
  await s;
  env.statuses.length = 0;
  return { env, old, track: env.prompts[1].track };
}

test("an unmute on the last take's microphone does not cancel the new take's mute check", async () => {
  const { env, old, track } = await secondTake();
  track.mute();
  old.muted = false;
  old.fire("unmute");
  await env.clock.advance(1190);
  assert.deepEqual(env.statuses, [], "still the 1.2 s grace for a route switch");
  await env.clock.advance(20);
  assert.deepEqual(env.statuses, ["mic-muted"], "the new microphone's sustained mute is reported");
  env.engine.stop();
});

test("a mute on the last take's microphone after the new one's does not replace the new take's check", async () => {
  const { env, old, track } = await secondTake();
  track.mute();
  await env.clock.advance(600);
  old.mute(); // the same route switch reaches the old track a moment later
  await env.clock.advance(610);
  assert.deepEqual(env.statuses, ["mic-muted"], "reported 1.2 s after the new track muted, not pushed back by the old one");
  env.engine.stop();
});

test("the new microphone's own unmute still cancels its mute check", async () => {
  const { env, track } = await secondTake();
  track.mute();
  await env.clock.advance(600);
  track.muted = false;
  track.fire("unmute");
  await env.clock.advance(2000);
  assert.deepEqual(env.statuses, [], "a brief route-switch mute is not a lost microphone");
  assert.equal(env.engine.running, true);
  env.engine.stop();
});

test("Start on a running engine asks for no second microphone", async () => {
  const env = await liveEngine();
  await env.engine.start().catch(() => {});
  await settle();
  assert.equal(env.asked(), 1);
  assert.equal(live(env), 1);
  assert.equal(env.nodes.filter((n) => n.kind === "source" && n.connected).length, 1);
  env.engine.stop();
});

test("a stall inside a silence the engine was bridging does not join two notes into one hold", async () => {
  // Sensitivity 5: the engine bridges up to 1.1 s without voice. 0.6 s of
  // heard silence and then 0.7 s with no frames is 1.3 s without voice.
  const clock = { t: 10_000, now() { return this.t; } };
  let voiced = true;
  const env = engineEnv({ clock, signal: toneWhile(() => voiced) });
  const s = env.engine.start();
  await settle();
  env.prompts[0].grant();
  await s;
  env.engine.sensitivity = 5;
  const run = framesFor(env.engine, clock);
  run(3000);
  voiced = false;
  run(600);
  clock.t += 700;
  voiced = true;
  run(3000);
  voiced = false;
  run(1500);
  env.engine.stop();
  const holds = env.engine.getHolds().map((h) => h.seconds);
  assert.equal(holds.length, 2, `two notes, two holds: ${holds}`);
  assert.ok(holds.every((h) => h < 3.5), `neither spans the gap: ${holds}`);
});
