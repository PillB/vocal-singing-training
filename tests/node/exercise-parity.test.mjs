// QA-34. The Spanish pack of an exercise is read in place of the English one (VTI18n.exField), so a drill
// that has 4 steps in English and 5 in Spanish is two different drills: the guided stage divides the timer
// by the number of steps, and the practice mode (volumeLadder, keyPointPace) was written for the Spanish
// version. v13 and v14 had drifted. This pins the shape of every pack against its English source.
// The control plants a Spanish pack with one step fewer and shows the check fails on it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const win = {};
runInNewContext(read("js/exercises-data.js"), { window: win, console });
runInNewContext(read("js/exercises-locale-es.js"), { window: win, console });

const exercises = [...win.VT_EXERCISES.vocal, ...win.VT_EXERCISES.singing];
const PACK = win.VT_EXERCISE_LOCALE_ES;
const LISTS = ["steps", "tips", "mistakes"];

/** Where a pack's lists differ in length from the English exercise's, as readable lines. */
export function drift(english, packs) {
  const out = [];
  for (const ex of english) {
    const es = packs[ex.id];
    if (!es) {
      out.push(`${ex.id}: no Spanish pack`);
      continue;
    }
    for (const k of LISTS) {
      if (!Array.isArray(es[k])) continue;
      if ((ex[k] || []).length !== es[k].length) out.push(`${ex.id}: ${k} ${ex[k].length} in English, ${es[k].length} in Spanish`);
    }
  }
  return out;
}

test("every exercise has a Spanish pack, with as many steps, tips and mistakes as the English one", () => {
  assert.ok(exercises.length >= 47, `control: the whole catalogue was read (${exercises.length})`);
  assert.deepEqual(drift(exercises, PACK), []);
});

test("no Spanish pack belongs to an exercise that is not there", () => {
  const ids = new Set(exercises.map((e) => e.id));
  assert.deepEqual(Object.keys(PACK).filter((id) => !ids.has(id)), []);
});

test("control: the check sees a pack with one step fewer, and a missing pack", () => {
  const ex = exercises.find((e) => e.id === "v13-volume-ladder");
  const short = { [ex.id]: { ...PACK[ex.id], steps: PACK[ex.id].steps.slice(1) } };
  assert.match(drift([ex], short).join("\n"), /v13-volume-ladder: steps 5 in English, 4 in Spanish/);
  assert.match(drift([ex], {}).join("\n"), /no Spanish pack/);
});
