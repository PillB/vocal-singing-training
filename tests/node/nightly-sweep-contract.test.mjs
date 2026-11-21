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
const formatsHelper = require("../helpers/forensics-formats.js");
const MOUSE = "tests/headed-exercise-forensics.spec.js";

/** The sweeps job's matrix: each entry's group, specs and, for a spec split by screen format, its formats. */
export function matrixEntries(yaml) {
  const job = yaml.slice(yaml.indexOf("\n  sweeps:"), yaml.indexOf("\n  sweep-smoke:"));
  return [...job.matchAll(/- group: (\S+)\n\s+specs: "([^"]+)"(?:\n\s+formats: "([^"]+)")?/g)].map((m) => ({
    group: m[1],
    specs: m[2].split(/\s+/).filter(Boolean),
    formats: m[3] ? m[3].split(",").map((f) => f.trim()) : null
  }));
}

/** The screen formats a sweep spec knows (its own ALL_FORMATS, or the forensics helper's), or null for none. */
function specFormats(file) {
  const source = read(file);
  const list = source.match(/const ALL_FORMATS = \[([\s\S]*?)\n\];/);
  if (list) return [...list[1].matchAll(/name: "([^"]+)"/g)].map((m) => m[1]);
  return /require\("\.\/helpers\/forensics-formats"\)/.test(source) ? formatsHelper.ALL_FORMATS.map((f) => f.name) : null;
}

/** The mouse sweep runs in two or more jobs, alone in each: all six formats in one job took about 87 of 80 min. */
export function mouseSweepAlone(entries) {
  const mouse = entries.filter((e) => e.specs.includes(MOUSE));
  return mouse.length >= 2 && mouse.every((e) => e.specs.length === 1);
}

/**
 * What is wrong with the matrix, as a list (empty when right): every registered sweep runs, a spec in one
 * entry runs whole (no formats), and a spec split over several entries runs each of its formats exactly once.
 */
export function partitionFaults(entries, specs, formatsOf) {
  const faults = [];
  const listed = entries.flatMap((e) => e.specs);
  for (const file of listed) if (!specs.includes(file)) faults.push(`${file} is not a registered sweep`);
  for (const file of specs) {
    const runs = entries.flatMap((e) => e.specs.filter((f) => f === file).map(() => e));
    if (runs.length === 0) faults.push(`${file} never runs`);
    if (runs.length === 1 && runs[0].formats) faults.push(`${file} runs only ${runs[0].formats}`);
    if (runs.length < 2) continue;
    if (runs.some((e) => !e.formats || e.specs.length !== 1)) faults.push(`${file} runs whole more than once`);
    const shards = runs.flatMap((e) => e.formats || []).sort();
    const all = (formatsOf(file) || []).slice().sort();
    if (all.length === 0 || shards.join() !== all.join()) faults.push(`${file} runs ${shards} of ${all}`);
  }
  return faults;
}

test("nightly partitions execute every registered headed sweep, and every format of a split one, exactly once", () => {
  const entries = matrixEntries(workflow);
  assert.deepEqual(partitionFaults(entries, expected, specFormats), []);
  assert.match(workflow, /name: sweep-reports-\$\{\{ matrix\.group \}\}/);
  // A split is real only if the job hands the formats to the spec
  assert.match(workflow, /env:\n\s+FORENSICS_FORMATS: \$\{\{ matrix\.formats \}\}\n\s+run: xvfb-run -a npx playwright test \$\{\{ matrix\.specs \}\}/);
  assert.deepEqual(specFormats(MOUSE), ["desktop", "mobile", "mobile-land", "tablet", "short", "fullscreen"]);
  // About 87 min for six formats does not fit the 80 min suite timeout (red every night from Nov 9 to 17).
  assert.ok(mouseSweepAlone(entries), JSON.stringify(entries));
});

test("negative control: a sweep dropped or run twice, or a format dropped, doubled or misspelt, is caught", () => {
  const faults = (yaml) => partitionFaults(matrixEntries(yaml), expected, specFormats);
  assert.notDeepEqual(faults(workflow.replace("tests/live-mouse-demo.spec.js", "")), []);
  assert.notDeepEqual(faults(workflow.replace("tests/fullscreen-all-clicks.spec.js", "tests/fullscreen-all-clicks.spec.js tests/fullscreen-all-clicks.spec.js")), []);
  assert.notDeepEqual(faults(workflow.replace('formats: "tablet,short,fullscreen"', 'formats: "tablet,short"')), []);
  assert.notDeepEqual(faults(workflow.replace('formats: "tablet,short,fullscreen"', 'formats: "tablet,short,fullscreen,desktop"')), []);
  assert.notDeepEqual(faults(workflow.replace('formats: "tablet,short,fullscreen"', 'formats: "tablet,shrot,fullscreen"')), []);
  assert.notDeepEqual(faults(workflow.replace('\n            formats: "desktop,mobile,mobile-land"', "")), []);
});

test("negative control: the mouse sweep back in one job, beside the live forensics or alone, is caught", () => {
  // The old matrix, both specs in one job, and all six formats in a job of their own, are valid partitions:
  // partitionFaults does not see them, mouseSweepAlone does (the 80 min timeout).
  const old = workflow
    .replace('specs: "tests/exercise-live-forensics.spec.js"', `specs: "tests/exercise-live-forensics.spec.js ${MOUSE}"`)
    .replace(/\n\s+- group: formats-1-of-2\n[^\n]+\n[^\n]+/, "")
    .replace(/\n\s+- group: formats-2-of-2\n[^\n]+\n[^\n]+/, "");
  const alone = workflow
    .replace(/\n\s+formats: "desktop,mobile,mobile-land"/, "")
    .replace(/\n\s+- group: formats-2-of-2\n[^\n]+\n[^\n]+/, "");
  for (const yaml of [old, alone]) {
    assert.notEqual(yaml, workflow);
    assert.deepEqual(partitionFaults(matrixEntries(yaml), expected, specFormats), []);
    assert.equal(mouseSweepAlone(matrixEntries(yaml)), false);
  }
});

// The spec runs only at night, so what it does with the matrix's formats is checked here, through the helper
// it reads them with: tests/helpers/forensics-formats.js.
const { ALL_FORMATS, START_FAIL_BUDGET, selectFormats, startFailBudget } = formatsHelper;
const formatNames = (env) => selectFormats(env).map((f) => f.name);

/** Every way to cut the six formats, in order, into runs: the run lengths of each. */
function splits(total) {
  const out = [];
  for (let mask = 0; mask < 2 ** (total - 1); mask++) {
    const parts = [1];
    for (let i = 0; i < total - 1; i++) {
      if (mask & (1 << i)) parts.push(1);
      else parts[parts.length - 1]++;
    }
    out.push(parts);
  }
  return out;
}

test("each half of the mouse sweep runs the formats its job names, and its Start gate is its share of four", () => {
  assert.deepEqual(formatNames({}), ALL_FORMATS.map((f) => f.name));
  assert.deepEqual(formatNames({ FORENSICS_FORMATS: "  " }), ALL_FORMATS.map((f) => f.name));
  assert.deepEqual(formatNames({ FORENSICS_FORMATS: "tablet, short ,fullscreen" }), ["tablet", "short", "fullscreen"]);
  const mouse = matrixEntries(workflow).filter((e) => e.specs.includes(MOUSE));
  for (const e of mouse) assert.deepEqual(formatNames({ FORENSICS_FORMATS: e.formats.join(",") }), e.formats);
  // Four across the six, as before the split; the nightly's halves get two each
  assert.equal(startFailBudget(ALL_FORMATS.length), START_FAIL_BUDGET);
  assert.deepEqual(mouse.map((e) => startFailBudget(e.formats.length)), [2, 2]);
  // No split of the six, however cut, tolerates more failed Starts in total than one run of all six did
  const all = splits(ALL_FORMATS.length);
  assert.equal(all.length, 32);
  for (const parts of all) {
    const total = parts.reduce((n, p) => n + startFailBudget(p), 0);
    assert.ok(total <= START_FAIL_BUDGET, `${parts.join("+")} tolerates ${total}`);
  }
  // The spec reads its formats and its gate from the helper, and has no list of its own
  const spec = code(read(MOUSE));
  assert.match(spec, /const formats = selectFormats\(process\.env\);/);
  assert.match(spec, /const p0Budget = startFailBudget\(formats\.length\);/);
  assert.match(spec, /toBeLessThanOrEqual\(p0Budget\)/);
  assert.doesNotMatch(spec, /ALL_FORMATS|FORENSICS_FORMATS/);
});

// tests/sweep-start-point.spec.js holds clickablePoint to finding Start under the sticky header; this holds the
// spec to pressing Start through it, and not pressing it when it says Start is covered.
test("the mouse sweep presses Start where a person can, and not where something covers it", () => {
  const spec = code(read(MOUSE));
  const start = spec.slice(spec.indexOf("async function startByMouse"), spec.indexOf("const liveProbe = await pollLive", spec.indexOf("async function startByMouse")));
  assert.match(start, /const startPt = await clickablePoint\(page, "#btn-practice-start"\);/);
  assert.match(start, /if \(startPt && !startPt\.covered\) \{\n\s+await mouseClick\(page, startPt\.x, startPt\.y/);
  assert.equal(start.match(/mouseClick\(/g).length, 1);
});

test("negative control: a misspelt format throws, naming it", () => {
  assert.throws(() => selectFormats({ FORENSICS_FORMATS: "tablet,shrot,fullscreen" }), /unknown FORENSICS_FORMATS: shrot/);
  assert.throws(() => selectFormats({ FORENSICS_FORMATS: "Desktop" }), /Desktop/);
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

// Playwright empties the output folder a run starts with. The live Pages smoke runs after the fullscreen step
// even when that step is red (if: always()), and with the default test-results/ it emptied the folder the
// fullscreen traces were in before the upload: every nightly from Nov 12 said "No files were found".
function stepNamed(yaml, name) {
  const at = yaml.indexOf("name: " + name);
  return at < 0 ? "" : yaml.slice(at, yaml.indexOf("- name:", at + 1));
}

/** Every Playwright run in the step writes to a folder of its own under test-results/. */
export function ownOutputs(step) {
  const runs = step.split("\n").filter((l) => /npx playwright test/.test(l));
  return runs.length > 0 && runs.every((l) => /--output="?test-results\/[^\s"]+/.test(l));
}

test("a run after the fullscreen step does not empty the folder that step's traces are in", () => {
  assert.ok(ownOutputs(stepNamed(workflow, "Fullscreen mouse controls isolated per exercise")));
  assert.ok(ownOutputs(stepNamed(workflow, "Live GitHub Pages smoke")));
  assert.match(stepNamed(workflow, "Live GitHub Pages smoke"), /if: always\(\)/);
});

test("negative control: a run with the default output folder, or no run at all, is caught", () => {
  const step = stepNamed(workflow, "Live GitHub Pages smoke");
  assert.equal(ownOutputs(step.replace(' --output="test-results/live-pages"', "")), false);
  assert.equal(ownOutputs(step.replace('--output="test-results/live-pages"', '--output="test-results"')), false);
  assert.equal(ownOutputs(""), false);
});
