// Falsifiable guard for the nightly headed watch sweeps. Previous scheduled runs
// (42046874468 and 42232297791) exhausted the serial suite budget and lost
// the remaining specs; click-ui-formats also failed ENOENT on first report write.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const read = (name) => readFileSync(new URL("../../" + name, import.meta.url), "utf8");
const workflow = read(".github/workflows/quality.yml");
const reportSpec = read("tests/click-ui-formats.spec.js");
const require = createRequire(import.meta.url);
const config = require("../../playwright.config.js");
const names = config.metadata.sweepSpecs.match(/\(\?:([^)]+)\)/)[1].split("|");
const expected = names.map((name) => "tests/" + name + ".spec.js").sort();

function matrixFiles(yaml) {
  return [...yaml.matchAll(/^\s+specs: "([^"]+)"$/gm)]
    .flatMap((match) => match[1].split(/\s+/).filter(Boolean))
    .sort();
}

test("nightly partitions execute every registered headed sweep exactly once", () => {
  assert.deepEqual(matrixFiles(workflow), expected);
  assert.equal(new Set(matrixFiles(workflow)).size, expected.length);
  assert.match(workflow, /name: sweep-reports-\$\{\{ matrix\.group \}\}/);
});

test("negative control: dropping or duplicating a sweep becomes a test failure", () => {
  const minus = workflow.replace("tests/live-mouse-demo.spec.js", "");
  assert.notDeepEqual(matrixFiles(minus), expected);
  const doubled = workflow.replace("tests/fullscreen-all-clicks.spec.js", "tests/fullscreen-all-clicks.spec.js tests/fullscreen-all-clicks.spec.js");
  assert.notDeepEqual(matrixFiles(doubled), expected);
});

// qa/geometry is gitignored, so CI starts without it, and a report written before its folder is made fails ENOENT
// (click-ui-formats did, nightly; headed-exercise-forensics did once the split left it without a spec that made
// the folder first). Every sweep spec must make a report's folder, earlier in the file, than it first writes it.
// The control used to delete the mkdir and check that the same regex no longer matched, which cannot fail; it now
// moves, removes and comments out the mkdir and expects the detector to flag each.
const code = (source) => source.split("\n").filter((l) => !/^\s*(\/\/|\/\*|\*)/.test(l)).join("\n");

/** Each file variable written with fs.writeFileSync before an mkdirSync/ensureDir of its folder appears above it. */
export function writtenBeforeItsFolder(source) {
  const src = code(source);
  const bad = new Set();
  for (const w of src.matchAll(/fs\.writeFileSync\(([A-Za-z_$][\w$]*),/g)) {
    const made = new RegExp(`(?:fs\\.mkdirSync|ensureDir)\\(path\\.dirname\\(${w[1].replace(/\$/g, "\\$")}\\)`).exec(src);
    if (!made || made.index > w.index) bad.add(w[1]);
  }
  return [...bad];
}

test("headed sweep output directory exists before the first JSON write", () => {
  for (const file of expected) assert.deepEqual(writtenBeforeItsFolder(read(file)), [], file);
  // The detector is not looking at nothing: these specs do write reports
  assert.ok(expected.filter((file) => /fs\.writeFileSync\(/.test(read(file))).length >= 3);
});

test("negative control: a report folder made after the first write, or not at all, is caught", () => {
  const mkdir = "fs.mkdirSync(path.dirname(REPORT), { recursive: true });\n";
  assert.equal(reportSpec.split(mkdir).length, 2);
  const firstWrite = reportSpec.indexOf("fs.writeFileSync(REPORT,");
  const moved = reportSpec.replace(mkdir, "");
  const at = moved.indexOf("fs.writeFileSync(REPORT,") + 1;
  const after = moved.slice(0, moved.indexOf("\n", at) + 1) + mkdir + moved.slice(moved.indexOf("\n", at) + 1);
  assert.ok(firstWrite > 0);
  assert.deepEqual(writtenBeforeItsFolder(after), ["REPORT"]);
  assert.deepEqual(writtenBeforeItsFolder(moved), ["REPORT"]);
  assert.deepEqual(writtenBeforeItsFolder(reportSpec.replace(mkdir, "// " + mkdir)), ["REPORT"]);
  const forensics = read("tests/headed-exercise-forensics.spec.js");
  assert.deepEqual(writtenBeforeItsFolder(forensics.replace("ensureDir(path.dirname(REPORT_JSON));\n", "")), ["REPORT_JSON"]);
});

test("PR smoke watches the report writer and fullscreen without running all 47 routes", () => {
  assert.match(workflow, /sweep-smoke:/);
  assert.match(workflow, /CLICK_UI_IDS: 'v1-diction'/);
  assert.match(workflow, /SLOWMO: '5'/);
  assert.match(workflow, /Six-format real-mouse report smoke/);
  assert.match(workflow, /Fullscreen mouse and control smoke/);
});

// The fullscreen group runs one exercise per process, in a shell loop under bash -e. A loop line without
// "|| rc=1" ends the step at the first red exercise and the rest never run; a list that differs from the
// spec's ALL_EXERCISES leaves an exercise out of every nightly run.
function fullscreenStep(yaml) {
  const at = yaml.indexOf("name: Fullscreen mouse controls isolated per exercise");
  return yaml.slice(at, yaml.indexOf("- name:", at + 1));
}
const fullscreenSpec = read("tests/fullscreen-all-clicks.spec.js");
const specIds = [...fullscreenSpec.match(/const ALL_EXERCISES = \[([^\]]+)\]/)[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);

export function loopRunsEverything(step, ids) {
  const loop = step.match(/for id in ([^;]+); do/);
  const runs = step.split("\n").filter((l) => /npx playwright test/.test(l));
  return !!loop && loop[1].trim().split(/\s+/).join() === ids.join() && runs.length === 2 && runs.every((l) => /\|\| rc=1\s*$/.test(l)) && /exit \$rc/.test(step);
}

test("the nightly fullscreen loop runs every exercise of the spec, and a red one does not stop the rest", () => {
  assert.equal(specIds.length, 4);
  assert.ok(loopRunsEverything(fullscreenStep(workflow), specIds));
});

test("negative control: a loop that stops at the first failure, or skips an exercise, is caught", () => {
  const step = fullscreenStep(workflow);
  assert.equal(loopRunsEverything(step.replace(' --output="test-results/fullscreen-$id" || rc=1', ' --output="test-results/fullscreen-$id"'), specIds), false);
  assert.equal(loopRunsEverything(step.replace("exit $rc", ""), specIds), false);
  assert.equal(loopRunsEverything(step.replace(" s9-pitch-match", ""), specIds), false);
});
