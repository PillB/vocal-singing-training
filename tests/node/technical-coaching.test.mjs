// A falsifiable learner-safety contract: old/mutated breathing and SOVT copy
// must fail, while both public language packs and the installed profile pass.
// These checks validate instructions; they cannot validate vocal physiology.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const window = {};
for (const path of ["js/exercises-data.js", "js/exercises-locale-es.js", "js/practice-profiles.js"]) {
  runInNewContext(read(path), { window, console });
}

const catalog = [...window.VT_EXERCISES.vocal, ...window.VT_EXERCISES.singing];
const get = (id) => catalog.find((ex) => ex.id === id);
const es = window.VT_EXERCISE_LOCALE_ES;
const profiles = window.VT_PRACTICE_PROFILES;

function fieldText(ex, lang) {
  const e = lang === "es" ? es[ex.id] : ex;
  return [e.original, e.research, ...(e.steps || []), ...(e.tips || [])].join(" ");
}

// Separate small contracts make each task's risk independently auditable;
// one large branch-heavy test hid its own logic and broke the complexity gate.
const CHECKS = {
  "s18-costal-breath": (copy, profile) => {
    const faults = [];
    if (profile.pattern.hold !== 0) faults.push("breath retention was reintroduced");
    if (!/no hold|without.*hold|do not hold|sin retener|no retengas|sin pausa|no retener/i.test(copy)) faults.push("no safe transition to exhale");
    if (!/cannot measure|not a measurement|no mide|no es una medición|no es una prueba/i.test(copy)) faults.push("pacer claims physiological measurement");
    return faults;
  },
  "s15-sh-air-ladder": (copy) => {
    const faults = [];
    if (!/optional|skip longer|opcionales|puedes saltarte/i.test(copy)) faults.push("30-second rung becomes mandatory");
    if (!/dizzy|mareo/i.test(copy)) faults.push("no dizziness stop rule");
    if (!/transfer|transfiere/i.test(copy)) faults.push("no sung-voice transfer");
    return faults;
  },
  "s8-breath-support": (copy) => {
    const faults = [];
    if (!/4.?6/i.test(copy)) faults.push("no short comfortable S-to-vowel dose");
    if (!/not actual airflow|not.*measure.*support|no.*flujo real|no mide el apoyo/i.test(copy)) faults.push("timer confused with breath physiology");
    if (/aiming \+1|buscando \+1|as long as (?:even|possible)|el mayor tiempo posible/i.test(copy)) faults.push("max-duration chase");
    return faults;
  },
  "s6-straw": (copy) => {
    const faults = [];
    if (/coffee stirrer for more resistance|agitador de café para más resistencia/i.test(copy)) faults.push("narrow straw prescribed first");
    if (/hum through (?:a|the) straw|zumba por la cañita/i.test(copy)) faults.push("nasal humming bypasses the straw");
    if (!/pressure|presión/i.test(copy)) faults.push("no resistance warning");
    if (!/transfer|transfiere/i.test(copy)) faults.push("no vowel transfer");
    return faults;
  },
  "s9-pitch-match": (copy) => {
    const faults = [];
    if (!/vibrato/i.test(copy)) faults.push("natural vibrato omitted");
    if (!/approximate|estimad|aproximad|not.*diagnos|no diagnostica/i.test(copy)) faults.push("mic graph assumed ground truth");
    return faults;
  }
};

// Test principles, not exact wording: a mutation removing a safety caveat
// must be rejected even if the exercise's title still looks correct.
function coachingFaults(id, ex, lang, profile) {
  return CHECKS[id](fieldText(ex, lang), profile);
}

const IDS = ["s18-costal-breath", "s15-sh-air-ladder", "s8-breath-support", "s6-straw", "s9-pitch-match"];

test("five technical exercises: both language packs and profiles preserve the coaching safety contract", () => {
  assert.equal(catalog.length, 52, "no exercise was silently removed");
  for (const id of IDS) {
    const exercise = get(id);
    assert.ok(exercise, `${id} exists`);
    assert.ok(es[id], `${id} has Spanish guidance`);
    for (const lang of ["en", "es"]) {
      assert.deepEqual(coachingFaults(id, exercise, lang, profiles[id]), [], `${id} ${lang}`);
    }
  }
});

test("negative controls: a fixed breath-hold, 30-second obligation, and maximizing S are all caught", () => {
  const breath = get("s18-costal-breath");
  assert.match(coachingFaults(breath.id, breath, "es", { pattern: { in: 4, hold: 2, out: 8 } }).join(" "), /retention/);
  const oldLadder = { ...get("s15-sh-air-ladder"), tips: ["Keep pushing toward 30 seconds"], steps: ["Hold SH for 5, then 10, 20, 25 and 30 seconds."] };
  assert.match(coachingFaults(oldLadder.id, oldLadder, "en", profiles[oldLadder.id]).join(" "), /mandatory|dizziness|transfer/);
  const oldSupport = { ...get("s8-breath-support"), steps: ["Exhale S as long as possible, aiming +1–2 seconds every attempt."] };
  assert.match(coachingFaults(oldSupport.id, oldSupport, "en", profiles[oldSupport.id]).join(" "), /max-duration chase/);
});

test("negative controls: high-resistance straw and unqualified vibrato scoring are caught", () => {
  const straw = { ...get("s6-straw"), steps: ["Use a coffee stirrer for more resistance."], research: "Always try the smallest straw." };
  assert.match(coachingFaults(straw.id, straw, "en", profiles[straw.id]).join(" "), /narrow straw|warning|transfer/);
  const match = { ...get("s9-pitch-match"), research: "Match the piano note exactly.", tips: ["Precision means zero wobble."] };
  assert.match(coachingFaults(match.id, match, "en", profiles[match.id]).join(" "), /natural vibrato|ground truth/);
});

function ladderScoreFaults(ex) {
  const target = (id) => ex.metrics.find((m) => m.id === id)?.target;
  return [target("rungs") > 1 ? "too many rungs for a passing baseline" : null,
    target("maxSH") > 5 ? "maximum-hold chase is still scored" : null].filter(Boolean);
}

test("a single easy 5s rung suffices for the self-rated exercise target", () => {
  const ladder = get("s15-sh-air-ladder");
  assert.deepEqual(ladderScoreFaults(ladder), []);
  const old = { ...ladder, metrics: ladder.metrics.map((m) => ({ ...m, target: m.id === "maxSH" ? 30 : m.id === "rungs" ? 5 : m.target })) };
  assert.match(ladderScoreFaults(old).join(" "), /too many rungs/);
  assert.match(ladderScoreFaults(old).join(" "), /maximum-hold chase/);
});

test("straw dose and unconfigured breath pacer have safe defaults", () => {
  const straw = get("s6-straw");
  assert.equal(straw.metrics.find((m) => m.id === "minutes")?.target, 2);
  const mode = read("js/practice-modes.js");
  const match = mode.match(/this\.state\.holdSec = p\.hold != null \? p\.hold : (\d+);/);
  assert.ok(match, "breath pacer explicitly handles an omitted hold value");
  assert.match(mode, /this\.state\.outSec = p\.out \|\| 6;/);
  // An omitted field is a supported edge case: the default must not hold.
  const effectiveHold = (p) => (p.hold != null ? p.hold : Number(match[1]));
  assert.equal(effectiveHold({}), 0);
  assert.equal(effectiveHold({ hold: 2 }), 2);
});
