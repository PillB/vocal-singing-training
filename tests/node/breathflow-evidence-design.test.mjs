import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { auditEvidenceMatrix, repositoryHasPath } from "../../qa/audit-breathflow-evidence.mjs";

const matrix = JSON.parse(readFileSync("data/breathflow-evidence-design.v1.json", "utf8"));
const doc = readFileSync("docs/56-BREATHFLOW-EVIDENCE-BASED-DESIGN.md", "utf8");
const clone = () => JSON.parse(JSON.stringify(matrix));
const errorsOf = (input, text = doc, hasPath = repositoryHasPath) =>
  auditEvidenceMatrix(input, text, hasPath);

test("current main/draft/proposed boundaries have sources and independent counterexamples", () => {
  assert.deepEqual(errorsOf(matrix), []);
});

test("negative control: promoting draft BreathFlow to main without source must fail", () => {
  const changed = clone();
  const feature = changed.features.find(x => x.id === "BF-F01");
  feature.status = "main";
  assert.match(errorsOf(changed).join("; "), /BF-F01: claims main but path is missing/);
});

test("negative control: absent evidence and missing independent oracle fail precisely", () => {
  const changed = clone();
  const feature = changed.features.find(x => x.id === "BF-F06");
  feature.evidence = ["E99"];
  feature.counterexample = "";
  const failures = errorsOf(changed).join("; ");
  assert.match(failures, /BF-F06: missing or unknown evidence/);
  assert.match(failures, /BF-F06: no independent observable success\/failure oracle/);
});

test("negative control: copied feature or unlinked source does not pass provenance", () => {
  const changed = clone();
  changed.features.push({ ...changed.features[0] });
  let failures = errorsOf(changed).join("; ");
  assert.match(failures, /duplicate feature: BF-F01/);
  changed.features.pop();
  failures = errorsOf(changed, doc.replace("[BF-F11]", "[unknown]")).join("; ");
  assert.match(failures, /BF-F11: not linked from design document/);
});

test("negative control: merged draft forces explicit documentation review", () => {
  const allPaths = path => path === "breathflow.html" || repositoryHasPath(path);
  const failures = errorsOf(matrix, doc, allPaths).join("; ");
  assert.match(failures, /BF-F01: draft\/source drift/);
});

test("negative control: malformed sources and unintended relative file paths fail", () => {
  const changed = clone();
  changed.sources[0].url = "file:///tmp/not-science";
  changed.features.find(x => x.id === "BF-F07").path = "js/imaginary-badges.js";
  const failures = errorsOf(changed).join("; ");
  assert.match(failures, /E01: reference must be HTTPS/);
  assert.match(failures, /BF-F07: proposed exercise must not claim a shipped source path/);
});
