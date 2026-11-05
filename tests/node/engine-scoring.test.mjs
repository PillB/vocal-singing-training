// What the engine may credit: a hold ends at its last real sample when the
// audio render clock stops, and a pitch frame scores only the detector's own
// fresh reading (never the grace-held display value, never the SH/S assist).
import test from "node:test";
import assert from "node:assert/strict";

import { engineEnv, started, toneWhile, framesFor } from "./engine-env.mjs";

const tone = (hz, amp = 0.3) => {
  const buf = new Float32Array(2048);
  for (let i = 0; i < buf.length; i++) buf[i] = amp * Math.sin((2 * Math.PI * hz * i) / 48000);
  return buf;
};

test("a frozen audio clock closes the open hold at its last real sample", async () => {
  const clock = { t: 10_000, now() { return this.t; } };
  const env = engineEnv({ clock, signal: toneWhile(() => true) });
  await started(env);
  let frozenAt = null;
  Object.defineProperty(env.engine.audioCtx, "currentTime", { get: () => frozenAt ?? clock.now() / 1000 });
  const run = framesFor(env.engine, clock);
  run(3000);
  frozenAt = clock.now() / 1000; // frames keep coming, the render clock does not move
  run(800);
  frozenAt = null; // it recovers before Retry would show
  run(300);
  env.engine.stop();
  const holds = env.engine.getHolds().map((h) => h.seconds);
  assert.ok(holds.length >= 1, `the 3 s before the freeze is kept: ${holds}`);
  assert.ok(Math.max(...holds) < 3.5, `the frozen 0.8 s is not credited: ${holds}`);
});

test("scoringPitch: a fresh tone scores; the grace-held label, the SH/S air assist and silence do not", async () => {
  const { engine } = await started(engineEnv());
  const fresh = () => {
    const buf = tone(220);
    engine._rms(buf);
    engine._detectPitch(buf, 48000);
  };
  fresh();
  assert.ok(Math.abs(engine.scoringPitch() / 220 - 1) < 0.02, `a fresh tone scores: ${engine.scoringPitch()}`);
  engine.voiceFreq = 330;
  assert.ok(Math.abs(engine.scoringPitch() / 220 - 1) < 0.02, "the grace-held display value never replaces the measured pitch");
  engine.setManualSound(true, "voice");
  assert.ok(Math.abs(engine.scoringPitch() / 220 - 1) < 0.02, "the voice assist still scores the measured pitch");
  engine.setManualSound(false, "voice", { forceClear: true });
  engine.setManualSound(true, "air");
  assert.equal(engine.scoringPitch(), null, "the SH/S air assist never scores a pitch");
  engine.setManualSound(false, "air", { forceClear: true });
  assert.ok(engine.scoringPitch() > 0, "with the assist released the tone scores again");
  const quiet = new Float32Array(2048);
  engine._rms(quiet);
  engine._detectPitch(quiet, 48000);
  assert.equal(engine.scoringPitch(), null, "silence scores nothing");
  engine._rms(tone(220, 0.001));
  engine._detectPitch(tone(220), 48000);
  assert.equal(engine.scoringPitch(), null, "a pitch with no energy behind it scores nothing");
  engine.stop();
});
