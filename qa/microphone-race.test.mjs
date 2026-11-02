/**
 * Deferred permission oracle: Stop must invalidate a pending Start and dispose
 * the late MediaStream. A UI-disabled button does not protect the engine API.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

function makeEngine(getUserMedia) {
  const host = {
    window: {},
    navigator: { mediaDevices: { getUserMedia } },
    performance,
    setTimeout,
    clearTimeout,
    cancelAnimationFrame: () => {}
  };
  vm.runInNewContext(fs.readFileSync(new URL("../js/practice-engine.js", import.meta.url), "utf8"), host);
  return new host.window.VTPracticeEngine();
}

test("Stop during pending microphone permission releases a late-granted track", async () => {
  let grant;
  let asked = 0;
  const pending = new Promise((resolve) => { grant = resolve; });
  const engine = makeEngine(() => { asked++; return pending; });
  const starting = engine.start();
  assert.equal(asked, 1, "a single Start asks permission once");
  engine.stop();
  let stops = 0;
  grant({ getTracks: () => [{ stop: () => { stops++; } }] });
  await assert.doesNotReject(starting);
  assert.equal(stops, 1, "the late-granted track must be closed exactly once");
  assert.equal(engine.stream, null, "closed stream must not remain owned");
  assert.equal(engine.running, false, "a cancelled session must never start drawing frames");
});

test("two simultaneous Start calls cannot create parallel mic permission prompts", async () => {
  let grant;
  let asked = 0;
  const pending = new Promise((resolve) => { grant = resolve; });
  const engine = makeEngine(() => { asked++; return pending; });
  const first = engine.start();
  const second = engine.start();
  assert.equal(asked, 1, "one pending capture request per engine");
  engine.stop();
  grant({ getTracks: () => [{ stop: () => {} }] });
  await Promise.all([first, second]);
});
