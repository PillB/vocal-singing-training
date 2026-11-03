// QA-37. Five behavioural mutants of VTFeatures.Envelope survive tests/node/*.test.mjs (qa/mutate.mjs AUDIO set):
//   E2/E3  lostSince's bounds shifted by one block
//   E6     a frame whose tail is nowhere in the buffer, with a normal frame time, no longer counts as lost audio
//   E10    only the most recent loss is remembered (ring of 16 -> 1)
//   E11    reset() keeps the losses of the take before, so the next take's first attack is "unmeasured"
// Expectations come from first principles (what audio was dropped), not from the code under test.
// Correct: every dropped stretch is remembered until reset(); the bounds are [idx, to). Wrong: any of the above.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const win = { VTPitchUtils: { freqToMidi: (hz) => 69 + 12 * Math.log2(hz / 440) } };
runInNewContext(read("js/voice-features.js"), { window: win, document: { documentElement: { lang: "en" } }, Math, console, Float32Array, Array });
const { Envelope } = win.VTFeatures;

const SR = 48000;
const BUF = 2048;
let seed = 12345;
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647 - 0.5);
// aperiodic on purpose: an exactly periodic tone repeats its tail and hides a stall
const x = Float32Array.from({ length: SR * 2 }, (_, i) => 0.2 * Math.sin((2 * Math.PI * 221.3 * i) / SR) + 0.004 * rnd());

/** Feeds frames; `end` is the index one past the newest sample the frame holds. */
function player() {
  const e = new Envelope();
  let end = BUF;
  const feed = (advance, dtMs) => {
    end += advance;
    e.feed({ buf: x.slice(end - BUF, end), sampleRate: SR, dtMs });
  };
  feed(0, 21);
  return { e, feed };
}

test("control: with no stall nothing is lost", () => {
  const { e, feed } = player();
  for (let i = 0; i < 10; i++) feed(1024, 21.3);
  assert.equal(e.lostSince(0), false);
});

test("two stalls: the first is still remembered after the second (E10)", () => {
  const { e, feed } = player();
  feed(1024, 21.3);
  const a = e.total;
  feed(6144, 128); // 6144 new samples > the 2048 buffer: 4096 never seen
  feed(1024, 21.3);
  feed(1024, 21.3);
  const b = e.total;
  feed(6144, 128);
  feed(1024, 21.3);
  assert.equal(e.lostSince(a), true);
  assert.equal(e.lostSince(a, b), true, "the first stall sits before b");
  assert.equal(e.lostSince(b), true);
});

test("reset() starts a take with no inherited loss (E11)", () => {
  const { e, feed } = player();
  feed(1024, 21.3);
  feed(6144, 128);
  assert.equal(e.lostSince(0), true, "control: the stall was recorded");
  e.reset();
  feed(0, 21);
  feed(1024, 21.3);
  feed(1024, 21.3);
  assert.equal(e.lostSince(0), false);
});

test("audio that jumps ahead under a normal frame time is lost audio, not 'a frame of 1024' (E6)", () => {
  const { e, feed } = player();
  feed(1024, 21.3);
  const t = e.total;
  feed(3000, 21.3); // the clock says 21 ms, the samples say 62 ms: 976 samples vanished
  assert.equal(e.lostSince(t), true);
});

test("lostSince reads 'from idx on, before to' with the mark itself inside (E2, E3)", () => {
  const { e, feed } = player();
  feed(1024, 21.3);
  const m = e.total; // the loss is recorded at the envelope index the lost frame starts at
  feed(6144, 128);
  assert.equal(e.lostSince(m), true, "from m on includes m");
  assert.equal(e.lostSince(m + 1), false, "after m excludes it");
  assert.equal(e.lostSince(0, m), false, "before m excludes it");
  assert.equal(e.lostSince(0, m + 1), true, "before m+1 includes it");
});
