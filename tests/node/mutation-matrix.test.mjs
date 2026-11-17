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

/** The sets that run nowhere, and the matrix entries that name no set. */
export function unrun(sets, defaults, matrix) {
  return {
    missing: sets.filter((s) => !defaults.includes(s) && !matrix.includes(s)),
    unknown: matrix.filter((s) => !sets.includes(s))
  };
}

test("every mutation set runs in CI: the Node sets in one step, each browser set as a job of its own", () => {
  const matrix = matrixSets(workflow);
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
