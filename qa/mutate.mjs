/**
 * Mutation check: does the test suite notice a planted defect?
 *
 * Each mutant replaces one exact snippet of shipped code with a plausible bug,
 * runs the tests that are supposed to guard it, and restores the file. A test
 * suite that stays green on a mutant is not testing that behaviour, however
 * high its coverage. Ported from the QA thread's mutate.py (2026-11-01).
 *
 *   node qa/mutate.mjs            # all sets
 *   node qa/mutate.mjs audio      # one set
 *
 * Exit code 1 when any mutant survives or an anchor no longer matches (so a
 * refactor that moves the code cannot silently retire its mutant).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const AUDIO_TESTS = ["tests/node/audio-contract.test.mjs", "tests/node/audio-mutant-killers.test.mjs"];
const LINT_TESTS = ["qa/lint-gate.test.mjs"];

export const MUTANTS = {
  audio: [
    ["M1 YIN voicing threshold 0.18 -> 0.60 (noise accepted as pitch)", "js/pitch-visualizer.js", "if (cmnd[lag] < 0.18) {", "if (cmnd[lag] < 0.60) {"],
    ["M2 above-band alias guard dropped (1500 Hz read as 750)", "js/pitch-visualizer.js", "for (let shortLag = 2; shortLag < minLag; shortLag++) {", "for (let shortLag = 2; shortLag < 2; shortLag++) {"],
    ["M4 parabolic interpolation removed", "js/pitch-visualizer.js", "const freq = rate / (lag + offset);", "const freq = rate / lag;"],
    ["M5 silence gate removed", "js/pitch-visualizer.js", "if (Math.sqrt(power / n) < 0.01) return null;", ""],
    ["M6 +150c (adjacent semitone) accepted as in tune", "js/practice-modes.js", "const hi = this.profile.centsHi == null ? 50 : this.profile.centsHi;", "const hi = this.profile.centsHi == null ? 150 : this.profile.centsHi;"],
    ["M7 -140c accepted as in tune", "js/practice-modes.js", "const lo = this.profile.centsLo == null ? -40 : this.profile.centsLo;", "const lo = this.profile.centsLo == null ? -140 : this.profile.centsLo;"],
    ["M8 stale take may publish after a newer take", "js/practice-engine.js", "if (epoch !== this._recordingEpoch) return;", ""],
    ["M9 stale callback instead of take-bound callback", "js/practice-engine.js", "onReady?.({", "this.onRecordingReady?.({"],
    ["M10 mic tracks released while the recorder flushes", "js/practice-engine.js", "if (this.stream && !recorderStopping) {", "if (this.stream) {"],
    ["M11 empty take published", "js/practice-engine.js", "if (!chunks.length) return;", ""]
  ].map(([name, file, from, to]) => ({ name, file, from, to, tests: AUDIO_TESTS })),
  lint: [
    ["L1 folders skipped by name again", "qa/lint-complexity.mjs", "if (!EXCLUDED_PATHS.has(name)) visit(name);", "if (!EXCLUDED_PATHS.has(name) && !/^(?:fixtures|geometry)$/.test(item.name)) visit(name);"],
    ["L2 .cjs not scanned", "qa/lint-complexity.mjs", "export const SCANNED = /\\.(?:js|mjs|cjs)$/;", "export const SCANNED = /\\.(?:js|mjs)$/;"],
    ["L3 prune blesses current debt", "qa/lint-complexity.mjs", "return baseline.filter((v) => active.has(signature(v)));", "return current;"],
    ["L4 baseline growth not checked", "qa/lint-complexity.mjs", "return next.filter((v) => !known.has(signature(v)));", "return [];"],
    ["L5 edited exemption kept", "qa/lint-complexity.mjs", "newDebt: current.filter((v) => !exceptions.has(signature(v))),", "newDebt: current.filter((v) => !baseline.some((b) => b.file === v.file && b.name === v.name) && !exceptions.has(signature(v))),"],
    ["L6 misplaced wait options not flagged", "qa/lint-playwright-waits.mjs", "if (node.arguments.length !== 2) return false;", "if (node.arguments.length !== 99) return false;"],
    ["L7 empty wait-may-fail reason accepted", "qa/lint-playwright-waits.mjs", "/wait-may-fail:\\s*\\S/", "/wait-may-fail:/"]
  ].map(([name, file, from, to]) => ({ name, file, from, to, tests: LINT_TESTS }))
};

function runTests(tests, root) {
  try {
    execFileSync(process.execPath, ["--test", ...tests], { cwd: root, stdio: "ignore", timeout: 180000 });
    return true;
  } catch {
    return false;
  }
}

/** @returns {"KILLED"|"SURVIVED"|"ANCHOR"} */
export function tryMutant(m, root = process.cwd()) {
  const file = path.join(root, m.file);
  const src = readFileSync(file, "utf8");
  if (src.split(m.from).length !== 2) return "ANCHOR";
  writeFileSync(file, src.replace(m.from, m.to));
  try {
    return runTests(m.tests, root) ? "SURVIVED" : "KILLED";
  } finally {
    writeFileSync(file, src);
  }
}

function main(sets) {
  let bad = 0;
  for (const set of sets) {
    for (const m of MUTANTS[set]) {
      const r = tryMutant(m);
      if (r !== "KILLED") bad++;
      console.log(`${r.padEnd(8)} [${set}] ${m.name}`);
    }
  }
  console.log(bad ? `FAIL: ${bad} mutant(s) survived or lost their anchor.` : "PASS: every mutant was killed.");
  process.exitCode = bad ? 1 : 0;
}

if (process.argv[1] && path.resolve(process.argv[1]).endsWith(path.join("qa", "mutate.mjs"))) {
  const want = process.argv.slice(2);
  main(want.length ? want : Object.keys(MUTANTS));
}
