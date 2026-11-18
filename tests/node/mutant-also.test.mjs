// A mutant's `also` edits (qa/mutate.mjs tryMutant) put a defect back in two places at once, for a test that
// can only go red when both layers of one defence are gone (IJ5: the catalogue sink and the sync normalisation).
// Wrong behaviours rejected: an `also` edit that is silently not applied (the mutant would then judge only half of
// the defect and "survive" for the wrong reason), a missing `also` anchor that is not reported, and a file left
// mutated after the run. The command here is a tiny Node script that exits 0 only when it sees both edits, so
// SURVIVED proves both were applied while it ran.
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { tryMutant } from "../../qa/mutate.mjs";

function tree() {
  const root = mkdtempSync(path.join(tmpdir(), "mutant-also-"));
  writeFileSync(path.join(root, "a.js"), "const a = 'safe-a';\n");
  writeFileSync(path.join(root, "b.js"), "const b = 'safe-b';\n");
  return root;
}

const seesBoth = [
  process.execPath,
  "-e",
  "const fs = require('fs'); const ok = fs.readFileSync('a.js', 'utf8').includes('bad-a') && fs.readFileSync('b.js', 'utf8').includes('bad-b'); process.exit(ok ? 0 : 1);"
];

test("an also edit is applied together with the mutant's own edit, and both files are restored", () => {
  const root = tree();
  const m = { file: "a.js", from: "safe-a", to: "bad-a", also: [{ file: "b.js", from: "safe-b", to: "bad-b" }], cmd: seesBoth };
  assert.equal(tryMutant(m, root), "SURVIVED", "the command saw both edits at once");
  assert.equal(readFileSync(path.join(root, "a.js"), "utf8"), "const a = 'safe-a';\n");
  assert.equal(readFileSync(path.join(root, "b.js"), "utf8"), "const b = 'safe-b';\n");
});

test("control: without the also edit the same command sees only one edit and the mutant is killed", () => {
  const root = tree();
  assert.equal(tryMutant({ file: "a.js", from: "safe-a", to: "bad-a", cmd: seesBoth }, root), "KILLED");
});

test("an also anchor that is not in its file is reported as ANCHOR, and nothing is written", () => {
  const root = tree();
  const m = { file: "a.js", from: "safe-a", to: "bad-a", also: [{ file: "b.js", from: "not-there", to: "x" }], cmd: seesBoth };
  assert.equal(tryMutant(m, root), "ANCHOR");
  assert.equal(readFileSync(path.join(root, "a.js"), "utf8"), "const a = 'safe-a';\n", "the first edit was not left behind");
});
