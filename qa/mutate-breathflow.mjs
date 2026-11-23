/**
 * BreathFlow mutation verifier. Strong oracles must fail on a realistic
 * defect in the *shipped source*, not on a mock echo or a string search.
 *
 * Run after the green focused suite: node qa/mutate-breathflow.mjs
 * Each mutant runs ONE independent Playwright case. In a finally block the
 * original source is restored; a mutation that survives, stops with a tool
 * error, or is missing its anchor fails the gate.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { behaviorDetected } from "./breathflow-oracle.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const cases = [
  {
    id: "BF-M1 readiness bypass",
    path: "js/breathflow.js",
    anchor: '    $("flow-start").disabled = !global.VTBreathTeach?.isReady?.();',
    broken: '    $("flow-start").disabled = false;',
    name: "first-use lesson teaches body and mouth before enabling Start"
  },
  {
    id: "BF-M2 wrong jaw shape shown",
    path: "js/breathflow-teach.js",
    anchor: '    box.dataset.sound = state.sound;',
    broken: '    box.dataset.sound = "hiss";',
    name: "first-use lesson teaches body and mouth before enabling Start"
  },
  {
    id: "BF-M3 speaker leaks into microphone",
    path: "js/breathflow-teach.js",
    anchor: '    if (global.VTBreathFlow?.state?.()?.mic !== "off") {',
    broken: '    if (false) {',
    name: "instructional sound abstains while a microphone is active or pending"
  },
  {
    id: "BF-M4 unearned completion after unsafe choice",
    path: "js/breathflow-teach.js",
    anchor: '    el("coach-finish").disabled = !(state.stage === 3 && checksComplete() && state.decision === "adapt");',
    broken: '    el("coach-finish").disabled = !(state.stage === 3 && checksComplete());',
    name: "first-use lesson teaches body and mouth before enabling Start"
  },
  {
    id: "BF-M5 profile crossover",
    path: "js/breathflow.js",
    anchor: '    if (current !== state.owner) {',
    broken: '    if (false) {',
    name: "profile switch before save fails closed rather than crediting a different profile"
  },
  {
    id: "BF-M6 duplicate ledger write",
    path: "js/breathflow.js",
    anchor: '      const rec = global.VTDays.record({ exerciseId: EXERCISE_ID, sec, saved: true, source: "breathflow" });',
    broken: '      const rec = global.VTDays.record({ exerciseId: EXERCISE_ID, sec, saved: true, source: "breathflow" });\n      global.VTDays.record({ exerciseId: EXERCISE_ID, sec, saved: true, source: "breathflow" });',
    name: "one manual round updates the same day, week and month ledger used by main"
  },
  {
    id: "BF-M7 unsaved browser falsely reports success",
    path: "js/breathflow.js",
    anchor: '      if (global.VTStorage?.isUnsaved?.()) {',
    broken: '      if (false) {',
    name: "refused browser storage never confirms a day was saved across a reload"
  },
  {
    id: "BF-M8 returning profile forgets completion",
    path: "js/breathflow-teach.js",
    anchor: '    state.ready = !!state.completion;',
    broken: '    state.ready = false;',
    name: "returning learner remembers an explicit skip and can reopen the full animated guide"
  },
  {
    id: "BF-M10 history UI drops a saved practice day",
    path: "js/app.js",
    anchor: '      const daysHtml = historyDaysHtml(track);',
    broken: '      const daysHtml = "";',
    name: "day/week/month and every main navigation view share a single calendar authority"
  },
  {
    id: "BF-M11 plan UI shows zero despite saved practice",
    path: "js/app.js",
    anchor: '    days.textContent = idle ? "" : tt(weekOver ? "plan.daysPast" : "plan.days", { n: planWeekDays(plan) });',
    broken: '    days.textContent = idle ? "" : tt(weekOver ? "plan.daysPast" : "plan.days", { n: 0 });',
    name: "day/week/month and every main navigation view share a single calendar authority"
  },
  {
    id: "BF-M9 WebKit selector silently drops teaching tests",
    path: "playwright.config.js",
    anchor: '      name: "webkit",\n      use: { browserName: "webkit" },\n      testMatch: /(cross-browser-audio|safari-mobile-recovery|exercise-start-visibility|piano-dropped-call|breathflow)\\.spec\\.js/',
    broken: '      name: "webkit",\n      use: { browserName: "webkit" },\n      testMatch: /(cross-browser-audio|safari-mobile-recovery|exercise-start-visibility|piano-dropped-call)\\.spec\\.js/',
    name: "WebKit and emulated iPhone execute the BreathFlow lesson",
    node: true
  }
];

function replaceOnlyOnce(original, anchor, broken, id) {
  const first = original.indexOf(anchor);
  if (first < 0 || original.indexOf(anchor, first + anchor.length) >= 0) {
    throw new Error(id + ": missing or ambiguous source-drift anchor");
  }
  return original.slice(0, first) + broken + original.slice(first + anchor.length);
}

function runMutant(item) {
  const command = item.node ? process.execPath : "npx";
  const args = item.node ? ["--test", "tests/node/playwright-projects.test.mjs"] : [
    "--no-install", "playwright", "test", "tests/breathflow.spec.js",
    "--project=chromium", "--workers=1", "--reporter=line", "-g", item.name
  ];
  const result = spawnSync(command, args, { cwd: root, encoding: "utf8",
    timeout: 90000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, CI: "1" } });
  return { result, log: (result.stdout || "") + "\n" + (result.stderr || "") };
}

function evaluateMutant(item) {
  const file = resolve(root, item.path);
  const original = readFileSync(file, "utf8");
  const modified = replaceOnlyOnce(original, item.anchor, item.broken, item.id);
  try {
    writeFileSync(file, modified);
    const { result, log } = runMutant(item);
    const diedForBehavior = behaviorDetected(item, result, log);
    if (result.error || !diedForBehavior) {
      throw new Error(item.id + ": mutant not killed by behavioral oracle. " +
        "status=" + result.status + " signal=" + result.signal + " error=" +
        (result.error?.message || "none") + "\n" + log.slice(-5500));
    }
    process.stdout.write("KILLED " + item.id + " by: " + item.name + "\n");
  } finally {
    writeFileSync(file, original);
    if (readFileSync(file, "utf8") !== original) {
      throw new Error(item.id + ": rollback mismatch, stop immediately");
    }
  }
}

for (const item of cases) evaluateMutant(item);
process.stdout.write("PASS: all eleven BreathFlow behavioral mutants killed and restored\n");
