// Every mutation set runs in CI. The Node sets run as one step (node qa/mutate.mjs, DEFAULT_SETS); each
// browser set is a job of its own in the mutation matrix of .github/workflows/quality.yml, so that none
// outgrows the 30 minutes a job may take. A set split off (as boot left regress, PR #42) and not added to
// the matrix would never run, and its mutants would prove nothing.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const { MUTANTS, DEFAULT_SETS } = await import("../../qa/mutate.mjs");
const workflow = fs.readFileSync(new URL("../../.github/workflows/quality.yml", import.meta.url), "utf8");

/** The browser sets the mutation job's matrix runs. */
export function matrixSets(yaml) {
  const job = yaml.slice(yaml.indexOf("\n  mutation:"));
  const list = job.match(/\n\s+set: \[([^\]]*)\]/);
  return list ? list[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
}

/** macOS-only oracle must run on its supported OS, not the Linux matrix. */
export function dedicatedSets(yaml) {
  const job = jobText(yaml, "safari-layout");
  return /runs-on: macos-latest/.test(job) && /run: bash qa\/check-safari-selector\.sh/.test(job) ? ["safari-layout"] : [];
}

/** The sets that run nowhere, and the matrix entries that name no set. */
export function unrun(sets, defaults, matrix) {
  return {
    missing: sets.filter((s) => !defaults.includes(s) && !matrix.includes(s)),
    unknown: matrix.filter((s) => !sets.includes(s))
  };
}

test("every mutation set runs in CI: the Node sets in one step, each browser set as a job of its own", () => {
  const matrix = [...matrixSets(workflow), ...dedicatedSets(workflow)];
  assert.ok(matrix.includes("regress") && matrix.includes("boot"), `control: the matrix is read (${matrix.join(", ")})`);
  assert.deepEqual(unrun(Object.keys(MUTANTS), DEFAULT_SETS, matrix), { missing: [], unknown: [] });
  assert.equal(new Set(matrix).size, matrix.length, "no set runs twice");
});

test("the check finds a set left out of the matrix, and a matrix entry that names no set", () => {
  const sets = ["audio", "regress", "boot"];
  assert.deepEqual(unrun(sets, ["audio"], ["regress", "boot"]), { missing: [], unknown: [] }, "control: a matrix that is right passes");
  assert.deepEqual(unrun(sets, ["audio"], ["regress"]), { missing: ["boot"], unknown: [] });
  assert.deepEqual(unrun(sets, ["audio"], ["regress", "boot", "bot"]), { missing: [], unknown: ["bot"] });
  assert.deepEqual(matrixSets("jobs:\n  mutation:\n    strategy:\n      matrix:\n        set: [a, b]\n"), ["a", "b"]);
});

/** One job of the workflow: its text from its own header to the next job's. */
export function jobText(yaml, name) {
  const start = yaml.indexOf(`\n  ${name}:\n`);
  if (start === -1) return "";
  const next = yaml.slice(start + 1).search(/\n  [A-Za-z0-9_-]+:\n/);
  return next === -1 ? yaml.slice(start) : yaml.slice(start, start + 1 + next);
}

/**
 * Whether a matrix job uploads test-results/ when it fails, under a name of
 * its own per matrix entry (upload-artifact v4 refuses a second artifact of
 * the same name in one run, so a shared name keeps only the first job's).
 */
export function keepsTraces(job, matrixKey) {
  const steps = job.split(/\n {6}- /).slice(1);
  return steps.some((s) =>
    /\n\s+if: failure\(\)/.test(s) &&
    /\buses: actions\/upload-artifact@v\d+/.test(s) &&
    new RegExp(`\\n\\s+name: [^\\n]*\\$\\{\\{ matrix\\.${matrixKey} \\}\\}`).test(s) &&
    /\n\s+path: (?:\|[\s\S]*?\n\s+)?test-results\//.test(s)
  );
}

test("a red mutation job keeps its traces, under a name of its own: a set whose unmutated tests fail in CI can be read, not only re-run", () => {
  assert.equal(keepsTraces(jobText(workflow, "browser"), "shard"), true, "control: the browser shards keep theirs, and the check reads them");
  assert.equal(keepsTraces(jobText(workflow, "mutation"), "set"), true);
});

test("the check tells a job that keeps its traces from one that keeps none, or one name for every job", () => {
  const job = (step) => `\n  mutation:\n    steps:\n      - run: node qa/mutate.mjs \${{ matrix.set }}\n${step}\n  next:\n    steps: []\n`;
  const kept = "      - name: Keep\n        if: failure()\n        uses: actions/upload-artifact@v4\n        with:\n          name: m-${{ matrix.set }}\n          path: test-results/\n";
  assert.equal(keepsTraces(jobText(job(kept), "mutation"), "set"), true, "control: a step that keeps them passes");
  assert.equal(keepsTraces(jobText(job(""), "mutation"), "set"), false, "no upload");
  assert.equal(keepsTraces(jobText(job(kept.replace("        if: failure()\n", "")), "mutation"), "set"), false, "an upload that runs only when the job is green");
  assert.equal(keepsTraces(jobText(job(kept.replace("m-${{ matrix.set }}", "mutation-failures")), "mutation"), "set"), false, "one name for every job of the matrix");
  assert.equal(keepsTraces(jobText(job(kept.replace("test-results/", "playwright-report/")), "mutation"), "set"), false, "not where the traces are");
  assert.equal(keepsTraces(jobText(job("") + "  other:\n    steps:\n" + kept, "mutation"), "set"), false, "another job's step is not this one's");
  assert.equal(keepsTraces(jobText(job(kept.replace("path: test-results/", "path: |\n            playwright-report/\n            test-results/")), "mutation"), "set"), true, "control: a list of paths with test-results/ in it");
});

test("a macOS-only mutation cannot silently lose its runner or invocation", () => {
  assert.deepEqual(dedicatedSets(workflow), ["safari-layout"]);
  assert.deepEqual(dedicatedSets(workflow.replace("runs-on: macos-latest", "runs-on: ubuntu-latest")), []);
  assert.deepEqual(dedicatedSets(workflow.replace("run: bash qa/check-safari-selector.sh", "run: true")), []);
});
