/**
 * Node-side catalog regression (no browser).
 * Fails if exercises, modes, progressions, i18n titles, or content depth
 * are removed/reduced vs tests/fixtures/catalog-snapshot.json.
 *
 * When you intentionally add/remove content:
 *   node qa/rebuild-catalog-snapshot.mjs
 * then commit the updated fixture with your content change.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const SNAP_PATH = path.join(ROOT, "tests/fixtures/catalog-snapshot.json");

function loadAppGlobals() {
  const ctx = {
    window: {},
    console,
    document: {
      documentElement: { lang: "es" },
      querySelectorAll: () => [],
      querySelector: () => null
    },
    localStorage: { getItem: () => null, setItem: () => {} }
  };
  ctx.global = ctx.window;
  ctx.window.document = ctx.document;
  ctx.window.localStorage = ctx.localStorage;
  vm.createContext(ctx);
  for (const f of [
    "js/exercises-data.js",
    "js/practice-profiles.js",
    "js/piano.js",
    "js/practice-modes.js",
    "js/i18n.js"
  ]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, f), "utf8"), ctx);
  }
  return ctx.window;
}

function fail(msg) {
  console.error("CATALOG_REGRESSION:", msg);
  process.exitCode = 1;
}

function main() {
  if (!fs.existsSync(SNAP_PATH)) {
    fail(`missing snapshot ${SNAP_PATH}`);
    return;
  }
  const snap = JSON.parse(fs.readFileSync(SNAP_PATH, "utf8"));
  const w = loadAppGlobals();
  const V = w.VT_EXERCISES;
  const P = w.VT_PRACTICE_PROFILES || {};
  const I = w.VTI18n;
  const modes = w.VTPracticeModes;
  const modeIds = typeof modes.ids === "function" ? modes.ids() : [];
  const all = [...V.vocal, ...V.singing];
  const liveIds = all.map((e) => e.id).sort();
  const snapIds = [...snap.exerciseIds].sort();

  // Totals — never silently shrink
  if (all.length < snap.totals.exercises) {
    fail(`exercise count ${all.length} < frozen ${snap.totals.exercises}`);
  }
  if (V.vocal.length < snap.totals.vocal) {
    fail(`vocal count ${V.vocal.length} < frozen ${snap.totals.vocal}`);
  }
  if (V.singing.length < snap.totals.singing) {
    fail(`singing count ${V.singing.length} < frozen ${snap.totals.singing}`);
  }
  if (modeIds.length < (snap.minContent?.practiceModes || snap.totals.practiceModes)) {
    fail(`practice modes ${modeIds.length} < min ${snap.minContent?.practiceModes}`);
  }

  // IDs: no removals
  const missingIds = snapIds.filter((id) => !liveIds.includes(id));
  if (missingIds.length) fail(`removed exercise ids: ${missingIds.join(", ")}`);

  // New IDs are OK (growth) but warn
  const newIds = liveIds.filter((id) => !snapIds.includes(id));
  if (newIds.length) {
    console.warn(
      "CATALOG_NOTE: new exercise ids not yet in snapshot (update fixture):",
      newIds.join(", ")
    );
  }

  // Tiers
  const tiers = {
    vocal_basic: V.vocal.filter((e) => e.tier === "basic").length,
    vocal_advanced: V.vocal.filter((e) => e.tier === "advanced").length,
    singing_basic: V.singing.filter((e) => e.tier === "basic").length,
    singing_advanced: V.singing.filter((e) => e.tier === "advanced").length
  };
  for (const [k, v] of Object.entries(snap.tiers)) {
    if ((tiers[k] || 0) < v) fail(`tier ${k}: ${tiers[k]} < frozen ${v}`);
  }

  // Progressions
  const progs = Object.keys(w.VT_PROGRESSIONS || {});
  for (const id of snap.progressions || []) {
    if (!progs.includes(id)) fail(`missing progression ${id}`);
  }

  // Practice modes registry
  for (const id of snap.modeIds || []) {
    if (!modeIds.includes(id)) fail(`missing practice mode ${id}`);
  }

  // Per-exercise content depth + mode + metrics
  const byId = Object.fromEntries((snap.catalog || []).map((c) => [c.id, c]));
  const minS = snap.minContent?.stepsPerExercise ?? 1;
  const minT = snap.minContent?.tipsPerExercise ?? 1;
  const minM = snap.minContent?.mistakesPerExercise ?? 1;
  const minMet = snap.minContent?.metricsPerExercise ?? 1;

  for (const e of all) {
    const frozen = byId[e.id];
    const prof = e.practice || P[e.id] || {};
    const mode = prof.mode || e.practice?.mode;
    if (!mode) fail(`${e.id}: missing practice.mode`);
    if ((e.steps || []).length < minS) fail(`${e.id}: steps < ${minS}`);
    if ((e.tips || []).length < minT) fail(`${e.id}: tips < ${minT}`);
    if ((e.mistakes || []).length < minM) fail(`${e.id}: mistakes < ${minM}`);
    if ((e.metrics || []).length < minMet) fail(`${e.id}: metrics < ${minMet}`);

    if (frozen) {
      if (mode !== frozen.mode) {
        fail(`${e.id}: mode changed ${frozen.mode} → ${mode} (update snapshot if intentional)`);
      }
      if ((e.steps || []).length < frozen.steps) {
        fail(`${e.id}: steps shrunk ${e.steps?.length} < ${frozen.steps}`);
      }
      if ((e.tips || []).length < frozen.tips) {
        fail(`${e.id}: tips shrunk ${e.tips?.length} < ${frozen.tips}`);
      }
      if ((e.mistakes || []).length < frozen.mistakes) {
        fail(`${e.id}: mistakes shrunk ${e.mistakes?.length} < ${frozen.mistakes}`);
      }
      const metricIds = (e.metrics || []).map((m) => m.id);
      for (const mid of frozen.metrics || []) {
        if (!metricIds.includes(mid)) fail(`${e.id}: missing metric field ${mid}`);
      }
      // i18n titles
      if (I?.exTitle) {
        I.lang = "es";
        const es = I.exTitle(e);
        I.lang = "en";
        const en = I.exTitle(e);
        if (!es || es === "ex." + e.id) fail(`${e.id}: missing Spanish title`);
        if (!en || en === "ex." + e.id) fail(`${e.id}: missing English title`);
      }
    }
  }

  // i18n keys
  for (const key of snap.requiredI18nKeys || []) {
    if (!I.strings.es[key] && !I.strings.en[key]) fail(`missing i18n key ${key}`);
  }
  for (const id of snapIds) {
    const k = "ex." + id;
    if (!I.strings.es[k]) fail(`missing es title key ${k}`);
    if (!I.strings.en[k]) fail(`missing en title key ${k}`);
  }

  if (process.exitCode) {
    console.error("CATALOG_REGRESSION_FAIL");
    process.exit(1);
  }
  console.log(
    "CATALOG_REGRESSION_PASS",
    `${all.length} exercises · ${modeIds.length} modes · ${progs.length} progressions`
  );
}

main();
