/**
 * Rebuild tests/fixtures/catalog-snapshot.json from current app data.
 * Run only when intentionally changing catalog content, then commit.
 */
import fs from "fs";
import path from "path";
import vm from "vm";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");

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

const V = ctx.window.VT_EXERCISES;
const P = ctx.window.VT_PRACTICE_PROFILES || {};
const I = ctx.window.VTI18n;
const modes = ctx.window.VTPracticeModes;
const modeIds = typeof modes.ids === "function" ? modes.ids() : [];
const all = [...V.vocal, ...V.singing];

const catalog = all.map((e) => {
  const prof = e.practice || P[e.id] || {};
  I.lang = "es";
  const titleEs = I.exTitle(e);
  I.lang = "en";
  const titleEn = I.exTitle(e);
  return {
    id: e.id,
    track: e.track,
    tier: e.tier,
    number: e.number,
    titleEn,
    titleEs,
    mode: prof.mode || null,
    showPitch: !!prof.showPitch,
    showHold: !!prof.showHold,
    pitchChallenge: !!prof.pitchChallenge,
    steps: (e.steps || []).length,
    tips: (e.tips || []).length,
    mistakes: (e.mistakes || []).length,
    metrics: (e.metrics || []).map((m) => m.id),
    hasOriginal: !!(e.original && String(e.original).trim()),
    hasPiano: !!e.audio?.piano,
    hasPitchViz: !!(e.audio?.pitchViz || prof.showPitch),
    hasRecord: !!e.audio?.record,
    durationMin: e.durationMin || null
  };
});

const snap = {
  version: 2,
  generatedNote:
    "Frozen catalog for regression — update intentionally when content is added/removed",
  totals: {
    exercises: all.length,
    vocal: V.vocal.length,
    singing: V.singing.length,
    practiceModes: modeIds.length
  },
  tiers: {
    vocal_basic: V.vocal.filter((e) => e.tier === "basic").length,
    vocal_advanced: V.vocal.filter((e) => e.tier === "advanced").length,
    singing_basic: V.singing.filter((e) => e.tier === "basic").length,
    singing_advanced: V.singing.filter((e) => e.tier === "advanced").length
  },
  exerciseIds: all.map((e) => e.id).sort(),
  modeIds: [...modeIds].sort(),
  progressions: Object.keys(ctx.window.VT_PROGRESSIONS || {}).sort(),
  catalog,
  minContent: {
    stepsPerExercise: 1,
    tipsPerExercise: 1,
    mistakesPerExercise: 1,
    metricsPerExercise: 1,
    practiceModes: 20
  },
  requiredDom: [
    "#view-home",
    "#view-exercise",
    "#view-history",
    "#view-plan",
    "#exercise-list",
    ".tabs",
    ".tier-filters",
    "#btn-continue",
    "#btn-structured",
    "#practice-cockpit",
    "#highway-stage",
    ".hud-tl",
    ".hud-tr",
    ".hud-bl",
    ".hud-br",
    ".hud-bc",
    "#btn-practice-start",
    "#btn-practice-stop",
    "#mic-sensitivity",
    "#pitch-canvas",
    "#mode-hud",
    "#mode-focus",
    "#piano-block",
    "#metrics-form",
    "#btn-complete",
    ".guide-card",
    "#metrics-card",
    "#btn-tour",
    "#btn-lang",
    "#btn-history",
    "#btn-plan",
    "#leave-modal",
    "#btn-back-home",
    "#session-banner"
  ],
  requiredI18nKeys: [
    "brand.title",
    "tab.vocal",
    "tab.singing",
    "practice.start",
    "practice.stop",
    "nav.tour",
    "nav.history",
    "nav.plan",
    "metrics.save",
    "metrics.show",
    "ex.guide",
    "mic.sens",
    "leave.title",
    "leave.save",
    "leave.discard",
    "piano.more"
  ],
  requiredGlobals: [
    "VT_EXERCISES",
    "VTPracticeEngine",
    "VTPiano",
    "VTPitchVisualizer",
    "VTApp",
    "VTTour",
    "VTI18n",
    "VTPracticeModes",
    "VT_PROGRESSIONS"
  ]
};

const out = path.join(ROOT, "tests/fixtures/catalog-snapshot.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(snap, null, 2) + "\n");
console.log("Wrote", out, snap.totals);
