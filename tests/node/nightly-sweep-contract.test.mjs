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

test("headed sweep output directory exists before the first JSON write", () => {
  assert.match(reportSpec, /fs\.mkdirSync\(path\.dirname\(REPORT\),\s*\{\s*recursive:\s*true\s*\}\)/);
  const mutant = reportSpec.replace(/fs\.mkdirSync\(path\.dirname\(REPORT\),\s*\{\s*recursive:\s*true\s*\}\);/, "");
  assert.doesNotMatch(mutant, /fs\.mkdirSync\(path\.dirname\(REPORT\),\s*\{\s*recursive:\s*true\s*\}\)/);
});

test("PR smoke watches the report writer and fullscreen without running all 47 routes", () => {
  assert.match(workflow, /sweep-smoke:/);
  assert.match(workflow, /CLICK_UI_IDS: 'v1-diction'/);
  assert.match(workflow, /SLOWMO: '5'/);
  assert.match(workflow, /Six-format real-mouse report smoke/);
  assert.match(workflow, /Fullscreen mouse and control smoke/);
});
