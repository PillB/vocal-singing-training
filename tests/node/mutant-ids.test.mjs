// A mutant is run and reported by its id, the first word of its name: the single-mutant runner picks it with
// /^(ID) /, and a CI line "SURVIVED [set] C3 ..." is how a reader finds the test that should have caught it.
// The coaching set (PR #28) and the storage regressions (PR #23) both used C1 to C5, so a run of "C3" judged two
// unrelated defects and a report of one could be read as the other. This test fails on any id used twice across
// every set. The control plants a duplicate and checks that the detector sees it (a detector that never finds
// anything would also pass the first test).
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
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

// The same id has a second reader: a test whose title opens with it. "SURVIVED [billing] B3" sends a reader to the
// test titled "B3 ...", so that test must be one the mutant's command runs. Three merged branches each titled their
// own tests C1, A5, R1 ..., ids the registry had already given to other mutants in other files, and a reader chasing
// a survivor landed on a test that never ran against it. This fails on a title that borrows a registered id from a
// file the mutant does not run. A title id the registry does not know is left alone: it names a case, not a mutant.

const TITLE_ID = /\b(?:test|it)\(\s*["`']([A-Z]{1,4}\d+[a-z]?)\b/g;

/** Every [file, id, set] where a test title opens with a registered id whose command never runs that file. */
export function strayTitleIds(registry, sources) {
  const owner = new Map();
  for (const [set, list] of Object.entries(registry)) {
    for (const m of list) owner.set(m.name.split(" ")[0], { set, cmd: m.cmd });
  }
  const runs = (cmd, file) => cmd.some((a) => a === file || file.startsWith(a.replace(/\/?$/, "/")));
  const stray = [];
  for (const [file, text] of Object.entries(sources)) {
    for (const [, id] of text.matchAll(TITLE_ID)) {
      const o = owner.get(id);
      if (o && !runs(o.cmd, file)) stray.push([file, id, o.set]);
    }
  }
  return stray;
}

function testSources() {
  const dirs = [
    ["tests", ".spec.js"],
    ["tests/node", ".mjs"],
    ["workers/entitlements/test", ".mjs"],
    ["qa", ".test.mjs"]
  ];
  const out = {};
  for (const [dir, ext] of dirs) {
    for (const f of readdirSync(dir)) if (f.endsWith(ext)) out[`${dir}/${f}`] = readFileSync(`${dir}/${f}`, "utf8");
  }
  return out;
}

test("no test title borrows a mutant id from a file that mutant never runs", () => {
  const sources = testSources();
  assert.ok(Object.keys(sources).length > 50, "the scan reads the suite, not an empty folder");
  assert.deepEqual(strayTitleIds(MUTANTS, sources), []);
});

test("control: a title borrowing an id is caught; the mutant's own file, a directory it runs, and unknown ids are not", () => {
  const reg = { s: [{ name: "Q1 a", cmd: ["node", "--test", "w/a.test.mjs"] }, { name: "Q2 b", cmd: ["node", "--test", "w/dir"] }] };
  const title = (id) => `test("${id} something", () => {});`;
  assert.deepEqual(strayTitleIds(reg, { "w/b.test.mjs": title("Q1") }), [["w/b.test.mjs", "Q1", "s"]]);
  assert.deepEqual(strayTitleIds(reg, { "w/a.test.mjs": title("Q1") }), []);
  assert.deepEqual(strayTitleIds(reg, { "w/dir/x.test.mjs": title("Q2"), "w/directory.mjs": title("Q2") }), [["w/directory.mjs", "Q2", "s"]]);
  assert.deepEqual(strayTitleIds(reg, { "w/b.test.mjs": title("Q3") + title("Q10") }), []);
});
