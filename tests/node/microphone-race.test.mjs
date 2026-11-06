// A Start that Stop cancelled must not go live when the permission prompt is
// answered later, and a hold may not bridge time the page did not hear.
// Ported from PR #24 (qa/microphone-race.test.mjs, P24-FLOW-ENG-LATE and
// P24-FLOW-HIDDEN-HOLD), rewritten for this engine: complete fake streams, so
// the test reaches the cancellation and not the live-track check, and one
// prompt per Start (PR #22's policy: no fan-out of permission prompts).
import test from "node:test";
import assert from "node:assert/strict";

import { engineEnv as raceEnv, settle, toneWhile, framesFor, started } from "./engine-env.mjs";

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

/**
 * Sing `before` ms of 220 Hz, draw no frames for `gap` ms (a hidden tab, a
 * blocked main thread), sing `after` ms more, then `tail` ms of silence; the
 * holds the engine logged, in seconds.
 */
async function holdsAcross({ before = 3000, gap, after = 500, tail = 1500, sensitivity = null }) {
  const clock = { t: 10_000, now() { return this.t; } };
  let voiced = true;
  const env = raceEnv({ clock, signal: toneWhile(() => voiced) });
  await started(env);
  if (sensitivity != null) env.engine.sensitivity = sensitivity;
  const run = framesFor(env.engine, clock);
  run(before);
  clock.t += gap; // rAF stops while the tab is hidden; the mic keeps going
  run(after);
  voiced = false;
  run(tail);
  env.engine.stop();
  return env.engine.getHolds().map((h) => h.seconds);
}

test("a hold does not bridge a minute of hidden tab: 3 s, 60 s with no frames, 0.5 s logs 3 s, not 63.5 s", async () => {
  const holds = await holdsAcross({ gap: 60_000 });
  assert.ok(holds.length >= 1, `a 3 s hold was logged: ${holds}`);
  assert.ok(Math.max(...holds) < 4, `no hold spans the hidden minute: ${holds}`);
  assert.ok(holds.some((s) => s >= 2.5 && s < 4), `the 3 s before the gap is kept: ${holds}`);
});

test("a gap just past the silence window already ends the hold, not only a long one", async () => {
  for (const gap of [1500, 2000, 5000, 20_000]) {
    const holds = await holdsAcross({ gap });
    assert.ok(Math.max(...holds) < 4, `${gap} ms with no frames is not part of a hold: ${holds}`);
  }
});

test("a stall shorter than the engine's own silence window keeps one hold, at every sensitivity", async () => {
  // At sensitivity 7 the engine bridges 1.2 s of heard silence; a 1.15 s
  // stall it did not hear is no reason to split the note in two.
  for (const sensitivity of [5, 7, 10]) {
    const holds = await holdsAcross({ gap: 1050 + Math.max(0, sensitivity - 5) * 50, after: 3000, sensitivity });
    assert.equal(holds.length, 1, `sensitivity ${sensitivity}: one held note, not split: ${holds}`);
    assert.ok(holds[0] > 6, `sensitivity ${sensitivity}: the whole note is one hold: ${holds}`);
  }
});

test("a hold opened by one frame just before a hidden minute is not logged as that minute", async () => {
  // The hold opens on the last frame before the tab hides, so lastVoiceAt and
  // holdStart are the same instant; the gap must not be credited as singing.
  for (const afterVoiced of [false, true]) {
    const clock = { t: 10_000, now() { return this.t; } };
    let voiced = false;
    const env = raceEnv({ clock, signal: toneWhile(() => voiced) });
    await started(env);
    const run = framesFor(env.engine, clock);
    run(30 * 16); // settle on silence
    voiced = true;
    run(16); // one voiced frame opens a hold
    clock.t += 60_000; // the tab is hidden for a minute
    voiced = afterVoiced;
    run(120 * 16);
    voiced = false;
    run(1500);
    env.engine.stop();
    const holds = env.engine.getHolds().map((h) => h.seconds);
    assert.ok(holds.every((s) => s < 3), `after ${afterVoiced ? "singing" : "silence"}: the hidden minute is not a hold: ${holds}`);
  }
});

test("a cancelled Start's late grant does not hide the newer Start that is still waiting", async () => {
  const { engine, prompts } = raceEnv();
  const first = engine.start();
  await settle();
  engine.stop();
  const second = engine.start();
  await settle();
  prompts[0].grant();
  await first;
  assert.equal(engine.starting, true, "the second prompt is still up, so leaving must still cancel it");
  prompts[1].grant();
  await second;
  assert.equal(engine.running, true);
  engine.stop();
});

test("a stale Start whose resume ends late leaves the newer live session alone, in either order", async () => {
  for (const order of [[1, 0], [0, 1]]) {
    const env = raceEnv({ slowResume: true });
    const { engine, prompts, resumes, nodes } = env;
    const first = engine.start();
    await settle();
    prompts[0].grant();
    await settle();
    engine.stop(); // the learner leaves while the iPhone resumes the context
    const second = engine.start();
    await settle();
    prompts[1].grant();
    await settle();
    for (const i of order) {
      resumes[i]?.();
      await settle();
    }
    await assert.doesNotReject(first, `order ${order}`);
    await assert.doesNotReject(second, `order ${order}`);
    assert.equal(engine.running, true, `order ${order}: the newer Start is live`);
    assert.equal(prompts[1].track.readyState, "live", `order ${order}: its microphone is untouched`);
    assert.equal(prompts[0].track.readyState, "ended", `order ${order}: the stale Start's microphone is released`);
    const sources = nodes.filter((n) => n.kind === "source");
    assert.equal(sources.length, 1, `order ${order}: only the live session built a graph`);
    assert.equal(engine.source, sources[0]);
    engine.stop();
    assert.ok(nodes.every((n) => !n.connected), `order ${order}: the final Stop leaves nothing connected`);
  }
});

test("a newer Start (no Stop) during the first one's resume: the first gives its microphone back", async () => {
  const { engine, prompts, resumes } = raceEnv({ slowResume: true });
  const first = engine.start();
  await settle();
  prompts[0].grant();
  await settle();
  const second = engine.start();
  await settle();
  prompts[1].grant();
  await settle();
  resumes.forEach((r) => r());
  await Promise.all([first, second]);
  assert.equal(prompts[0].track.readyState, "ended", "the replaced Start's track does not stay live");
  assert.equal(engine.running, true);
  engine.stop();
  assert.ok(prompts.every((p) => p.track.readyState === "ended"));
});
