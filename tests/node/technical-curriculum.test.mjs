// Structured coaching-curriculum contract. This checks specification integrity,
 // not physiological efficacy; voice and iPhone validation remain manual gates.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const curriculum = JSON.parse(read("data/technical-coaching-protocol.v1.json"));
const window = {};
runInNewContext(read("js/exercises-data.js"), { window, console });
const existingIds = new Set([...window.VT_EXERCISES.vocal, ...window.VT_EXERCISES.singing].map((ex) => ex.id));

function validate(protocol) {
  const errors = [];
  if (!protocol.stopRule?.es || !protocol.stopRule?.en || !protocol.stopRule?.medical) {
    errors.push("missing bilingual safety/clinical escalation guidance");
  }
  if (!/not clinical therapy|not a diagnosis|not clinical/i.test(protocol.purpose || "")) {
    errors.push("missing non-clinical scope");
  }
  const seen = new Set();
  for (const [i, ex] of (protocol.exercises || []).entries()) {
    const context = ex.id || "exercise " + i;
    if (!ex.id || seen.has(ex.id)) errors.push(context + ": duplicate/missing id");
    seen.add(ex.id);
    if (!existingIds.has(ex.catalogId)) errors.push(context + ": missing catalog reference");
    if (!["in-app", "manual-pilot"].includes(ex.delivery)) errors.push(context + ": delivery status unclear");
    if (!ex.titleEs || !ex.titleEn || !ex.goal) errors.push(context + ": missing learning goal or titles");
    if (!Array.isArray(ex.stepsEs) || !Array.isArray(ex.stepsEn) ||
        ex.stepsEs.length < 2 || ex.stepsEs.length !== ex.stepsEn.length) {
      errors.push(context + ": incomplete bilingual instructions");
    }
    if (!ex.transferEs || !ex.assessment || !ex.fallback) {
      errors.push(context + ": no transfer/assessment/mic fallback");
    }
    const dose = ex.dose || {};
    for (const key of ["repetitions", "phonationSeconds", "maxTrialSeconds", "restSeconds"]) {
      if (!Number.isFinite(dose[key]) || dose[key] < 0) errors.push(context + ": invalid dose " + key);
    }
    if (dose.repetitions < 1 || dose.maxTrialSeconds < dose.phonationSeconds ||
        dose.maxTrialSeconds > 30 || dose.repetitions > 10) {
      errors.push(context + ": overload/inconsistent dose needs teacher review");
    }
    if (!Array.isArray(ex.evidence) || !ex.evidence.length ||
        ex.evidence.some((id) => !protocol.references?.[id])) {
      errors.push(context + ": untraceable evidence");
    }
    if (/diagnos(?:e|is) healthy|diagnostica.*sana|measure.*subglottal pressure/i.test(ex.assessment || "")) {
      errors.push(context + ": diagnostic claim");
    }
  }
  for (const [id, source] of Object.entries(protocol.references || {})) {
    if (!/^https:\/\//.test(source.url || "") || !source.type || !source.population) {
      errors.push(id + ": insufficient source and generalizability metadata");
    }
  }
  return errors;
}

test("eight bilingual curriculum cards are traceable, bounded and linked to live catalog IDs", () => {
  assert.equal(curriculum.exercises.length, 8);
  assert.deepEqual(validate(curriculum), []);
  assert.equal(curriculum.exercises.filter((x) => x.delivery === "manual-pilot").length, 4);
});

test("clinical stop rule and microphone-free fallbacks are explicit", () => {
  assert.match(curriculum.stopRule.es, /dolor.*mareo/i);
  assert.match(curriculum.stopRule.en, /pain.*dizziness/i);
  assert.match(curriculum.stopRule.medical, /ENT\/voice specialist/i);
  for (const x of curriculum.exercises) assert.ok(x.fallback.length > 18, x.id);
});

test("straight tone/vibrato is voluntary and never an automatic pathology score", () => {
  const v = curriculum.exercises.find((x) => x.id === "VIBRATO-CHOICE");
  assert.equal(v.delivery, "manual-pilot", "do not claim a live graded mode exists");
  assert.match(v.stepsEs.join(" "), /sin bloquear la garganta.*vibrato.*sin consigna/i);
  assert.match(v.assessment, /never automatically grade vibrato/i);
});

test("negative controls detect missing references, unbounded load and missing transfer", () => {
  const clone = () => JSON.parse(JSON.stringify(curriculum));
  const missingSource = clone();
  missingSource.exercises[0].evidence = ["DOES_NOT_EXIST"];
  assert.match(validate(missingSource).join(" "), /untraceable evidence/);
  const overload = clone();
  overload.exercises[1].dose.maxTrialSeconds = 120;
  assert.match(validate(overload).join(" "), /overload/);
  const noTransfer = clone();
  noTransfer.exercises[2].transferEs = "";
  assert.match(validate(noTransfer).join(" "), /no transfer/);
  const notBilingual = clone();
  notBilingual.exercises[3].stepsEn = [];
  assert.match(validate(notBilingual).join(" "), /bilingual/);
  const noStop = clone();
  noStop.stopRule.medical = "";
  assert.match(validate(noStop).join(" "), /safety/);
  const duplicate = clone();
  duplicate.exercises[1].id = duplicate.exercises[0].id;
  assert.match(validate(duplicate).join(" "), /duplicate/);
});
