// Every mutation set runs in CI. The light Node sets run as one step of the contracts job, the two that take
// minutes (audio, guards) as jobs of their own in node-mutation (QA-75), and each browser set is a job of its
// own in the mutation matrix of .github/workflows/quality.yml, so that none outgrows the time a job may take.
// A set split off (as boot left regress, PR #42) and not added to a job would never run, and its mutants
// would prove nothing.
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

/** A job's list in brackets under its matrix (`set: [a, b]`). */
function listIn(job) {
  const list = job.match(/\n\s+set: \[([^\]]*)\]/);
  return list ? list[1].split(",").map((s) => s.trim()).filter(Boolean) : [];
}

/**
 * Each run of a Node mutation job: the sets it runs and its job's limit in minutes. The contracts step's
 * `node qa/mutate.mjs` with no set named runs DEFAULT_SETS; node-mutation runs once per matrix entry.
 */
export function nodeRuns(yaml, defaults) {
  return ["contracts", "node-mutation"].flatMap((name) => {
    const job = jobText(yaml, name);
    const run = job.match(/\n\s+(?:- )?run: node qa\/mutate\.mjs([^\n]*)/);
    if (!run) return [];
    const limit = Number(job.match(/\n\s+timeout-minutes: (\d+)/)?.[1] || 0);
    const args = run[1].trim();
    if (args === "${{ matrix.set }}") return listIn(job).map((s) => ({ job: name, sets: [s], limit }));
    return [{ job: name, sets: args ? args.split(/\s+/) : [...defaults], limit }];
  });
}

test("every mutation set runs in CI: the Node sets in contracts and node-mutation, each browser set as a job of its own", () => {
  const browser = [...matrixSets(workflow), ...dedicatedSets(workflow)];
  const node = nodeRuns(workflow, DEFAULT_SETS).flatMap((r) => r.sets);
  assert.ok(browser.includes("regress") && browser.includes("boot"), `control: the matrix is read (${browser.join(", ")})`);
  assert.ok(node.includes("lint") && node.includes("audio"), `control: both Node jobs are read (${node.join(", ")})`);
  const all = [...node, ...browser];
  assert.deepEqual(unrun(Object.keys(MUTANTS), [], all), { missing: [], unknown: [] });
  assert.equal(new Set(all).size, all.length, "no set runs twice");
  assert.deepEqual([...node].sort(), [...DEFAULT_SETS].sort(), "CI's Node jobs run what node qa/mutate.mjs runs locally");
});

// Seconds per mutant in CI's contracts job, the slower of its two runs on 2026-11-25/26 (b9e30d2, job 139557670886,
// and 331e83b, job 139594679565), rounded up: each KILLED line's time less the one before it, so a set's first
// mutant carries its start. A set with no rate fails the budget below until one CI run of it is timed.
export const SECONDS_PER_MUTANT = { audio: 5.6, pitch: 1.2, lint: 2.2, coaching: 0.2, sets: 0.2, ledger: 0.6, claims: 0.2, path: 0.6, curriculum: 0.2, guards: 4.8 };

/** A run's expected minutes from its mutants and the measured rates, and the sets it runs that have no rate. */
export function estimate(sets, counts, rates) {
  const minutes = sets.reduce((t, s) => t + (counts[s] || 0) * (rates[s] || 0), 0) / 60;
  return { minutes, unmeasured: sets.filter((s) => !(s in rates)) };
}

const COUNTS = Object.fromEntries(Object.entries(MUTANTS).map(([s, list]) => [s, list.length]));

test("every Node mutation job is estimated at under half its time limit, so a growing set turns red here before CI cancels it", () => {
  // Half: the same ten sets took 19 minutes on three runs and 22.8 and over 23.9 on two others the same hour,
  // and checkout, install and test:core come on top. On 331e83b one step held all ten (25 minutes by this
  // estimate) and ran out.
  const runs = nodeRuns(workflow, DEFAULT_SETS);
  assert.ok(runs.some((r) => r.job === "contracts"), `control: the contracts step is read (${runs.map((r) => r.job).join(", ")})`);
  for (const r of runs) {
    const { minutes, unmeasured } = estimate(r.sets, COUNTS, SECONDS_PER_MUTANT);
    assert.deepEqual(unmeasured, [], `${r.job} runs sets with no measured rate: time one CI run and add them to SECONDS_PER_MUTANT`);
    assert.ok(r.limit > 0, `${r.job} has no timeout-minutes, so a hung mutant holds its runner six hours`);
    assert.ok(minutes <= r.limit / 2, `${r.job} (${r.sets.join(" ")}) is estimated at ${minutes.toFixed(1)} of its ${r.limit} minutes: give a set a node-mutation entry, or split it as the time limit's set was`);
  }
});

test("the budget reads the old shape as the one that ran out, and a set with no rate as unmeasured", () => {
  const old = "\n  contracts:\n    timeout-minutes: 25\n    steps:\n      - run: node qa/mutate.mjs\n  next:\n    steps: []\n";
  assert.deepEqual(nodeRuns(old, ["a", "b"]), [{ job: "contracts", sets: ["a", "b"], limit: 25 }], "a bare command runs DEFAULT_SETS");
  assert.ok(estimate(DEFAULT_SETS, COUNTS, SECONDS_PER_MUTANT).minutes > 25 / 2, "all ten sets in one 25-minute job fail");
  const split = "\n  node-mutation:\n    timeout-minutes: 20\n    strategy:\n      matrix:\n        set: [x, y]\n    steps:\n      - run: node qa/mutate.mjs ${{ matrix.set }}\n";
  assert.deepEqual(nodeRuns(split, []), [{ job: "node-mutation", sets: ["x"], limit: 20 }, { job: "node-mutation", sets: ["y"], limit: 20 }], "a matrix job is one run per entry");
  assert.deepEqual(estimate(["x"], { x: 3 }, {}), { minutes: 0, unmeasured: ["x"] });
  assert.equal(estimate(["x", "y"], { x: 60, y: 30 }, { x: 2, y: 4 }).minutes, 4, "control: two sets add up");
});

/** The browser sets the harness's own usage line names, the command a developer copies to check a change locally. */
export function usageSets(source) {
  const line = source.split("\n").find((l) => /^\s*\*\s+node qa\/mutate\.mjs \S.*# browser sets/.test(l)) || "";
  return line.replace(/#.*$/, "").replace(/^\s*\*\s+node qa\/mutate\.mjs/, "").trim().split(/\s+/).filter(Boolean);
}

test("the harness's usage line names every browser set CI runs, so the documented command skips none", () => {
  // The fifth red team found the line a round behind: copied, it skipped five sets CI runs (syncing, inject, learner,
  // authwall and the time limit's second half), 99 mutants at the time.
  const usage = usageSets(fs.readFileSync(new URL("../../qa/mutate.mjs", import.meta.url), "utf8"));
  assert.ok(usage.includes("stage"), `control: the usage line is read (${usage.join(" ")})`);
  assert.deepEqual([...usage].sort(), [...matrixSets(workflow)].sort());
  assert.deepEqual(usageSets(" *   node qa/mutate.mjs a b  # browser sets: x\n"), ["a", "b"], "control: a line that names two sets reads as two");
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
