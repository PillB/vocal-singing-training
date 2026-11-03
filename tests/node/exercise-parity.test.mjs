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
runInNewContext(read("js/practice-profiles.js"), { window: win, console });

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

// The steps are what the learner prepares; the mode is what scores them. v14 told the learner to pick ONE key idea and
// mark 2 brakes while the mode counts "Anclas 0 / 3" and asks for a brake before EACH key idea: with one idea a
// take can never reach 3. The steps now name the number of key ideas the profile scores, in both languages.
const KEY_IDEAS = { en: /\b(\d+) key ideas\b/, es: /\b(\d+) ideas clave\b/ };
const BRAKE_FOR_EACH = { en: /before each key idea/, es: /antes de cada idea clave/ };

/** Where the steps of the pace exercise disagree with what its mode scores, as readable lines. */
export function stepsVsMode(ex, es, profile) {
  const out = [];
  for (const [lang, steps] of [["en", ex.steps], ["es", es.steps]]) {
    const named = steps[0].match(KEY_IDEAS[lang]);
    if (!named || Number(named[1]) !== profile.keyPoints) out.push(`${lang}: step 1 names ${named ? named[1] : "no number of"} key ideas, the mode scores ${profile.keyPoints}`);
    if (!steps.some((t) => BRAKE_FOR_EACH[lang].test(t))) out.push(`${lang}: no step asks for a brake before each key idea`);
  }
  return out;
}

test("v14: the steps ask for as many key ideas as the mode scores, and a brake before each (QA red-team 4e)", () => {
  const ex = exercises.find((e) => e.id === "v14-pace-variation");
  const profile = win.VT_PRACTICE_PROFILES["v14-pace-variation"];
  assert.equal(profile.mode, "keyPointPace", "control: the profile read is the pace mode's");
  assert.ok(profile.keyPoints >= 2, "control: the mode scores more than one anchor, so one key idea cannot satisfy it");
  assert.deepEqual(stepsVsMode(ex, PACK[ex.id], profile), []);
});

test("control: the check sees one key idea against three anchors, and a brake for the idea instead of for each", () => {
  const ex = exercises.find((e) => e.id === "v14-pace-variation");
  const profile = win.VT_PRACTICE_PROFILES["v14-pace-variation"];
  const old = { steps: ["Pick a message of about 90 s with one key idea.", ...ex.steps.slice(1, 3), "Third pass: mark 2 intentional “brakes” before the key idea."] };
  assert.match(stepsVsMode(old, old, profile).join("\n"), /en: step 1 names no number of key ideas, the mode scores 3/);
  assert.match(stepsVsMode(old, old, profile).join("\n"), /es: no step asks for a brake before each key idea/);
  assert.match(stepsVsMode(ex, PACK[ex.id], { ...profile, keyPoints: 4 }).join("\n"), /step 1 names 3 key ideas, the mode scores 4/);
});
