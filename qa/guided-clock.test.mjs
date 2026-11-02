/** Independent time oracle: ideal 50ms frames and throttled frames must agree. */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";

const host = { window: { VTViz: { scenes: {}, clamp: (v, lo, hi) => Math.max(lo, Math.min(hi, v)) } } };
vm.runInNewContext(fs.readFileSync(new URL("../js/scenes/guided.js", import.meta.url), "utf8"), host);
const Run = host.window.VTViz.guided.Run;

const phases = [{ label: "Prepare", sec: 6 }, { label: "Relax", sec: 21 }, { label: "Review", sec: 3 }];

test("guided phases follow actual 6s, even at 1 callback per second", () => {
  const run = new Run(phases);
  for (let s = 1; s <= 6; s++) run.tick({ dtMs: 1000, wallDtMs: 1000, elapsedMs: s * 1000 });
  assert.equal(run.index, 1, "six seconds must complete the six-second preparation");
  assert.ok(Math.abs(run.clock - 6) < 0.01, `clock=${run.clock} rather than 6`);
  assert.ok(run.remaining > 20 && run.remaining <= 21);
  // A capped 100ms tick would accumulate 0.6 seconds and FAIL this assertion.
});

test("timed and throttled paths yield the same completed phases", () => {
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
  const run = new Run(phases);
  for (const dt of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) run.tick({ dtMs: dt });
  assert.equal(run.clock, 0);
  assert.equal(run.index, 0);
});
