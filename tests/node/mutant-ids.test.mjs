// A mutant is run and reported by its id, the first word of its name: the single-mutant runner picks it with
// /^(ID) /, and a CI line "SURVIVED [set] C3 ..." is how a reader finds the test that should have caught it.
// The coaching set (PR #28) and the storage regressions (PR #23) both used C1 to C5, so a run of "C3" judged two
// unrelated defects and a report of one could be read as the other. This test fails on any id used twice across
// every set. The control plants a duplicate and checks that the detector sees it (a detector that never finds
// anything would also pass the first test).
import test from "node:test";
import assert from "node:assert/strict";
import { MUTANTS } from "../../qa/mutate.mjs";

/** Every [id, first set, second set] where two mutants share an id. */
export function duplicateIds(registry) {
  const seen = new Map();
  const dups = [];
  for (const [set, list] of Object.entries(registry)) {
    for (const m of list) {
      const id = m.name.split(" ")[0];
      if (seen.has(id)) dups.push([id, seen.get(id), set]);
      else seen.set(id, set);
    }
  }
  return dups;
}

test("every mutant id is used once across all sets", () => {
  assert.deepEqual(duplicateIds(MUTANTS), []);
});

test("control: the detector sees an id used twice, in one set or across two, and not distinct ids", () => {
  const m = (name) => ({ name });
  assert.deepEqual(duplicateIds({ a: [m("C1 x"), m("C2 y")], b: [m("C1 z")] }), [["C1", "a", "b"]]);
  assert.deepEqual(duplicateIds({ a: [m("C1 x"), m("C1 y")] }), [["C1", "a", "a"]]);
  assert.deepEqual(duplicateIds({ a: [m("C1 x")], b: [m("VC1 x"), m("C10 y")] }), []);
});
