// Every planted defect must find its place. A mutant whose anchor no longer occurs exactly once in its file
// fails its set as ANCHOR, but only when that set's CI job reaches it: for a browser set, up to half an hour
// in, and a fix that reshapes the code its mutants point at learns it only then (PR #54: three Mercado Pago
// toast mutants still pointed at the claim toast a fix had rewritten). This reads every anchor through the
// runner's own rule (qa/mutate.mjs mutatedTexts), in a second, in the contracts job.
import test from "node:test";
import assert from "node:assert/strict";

const { MUTANTS, mutatedTexts } = await import("../../qa/mutate.mjs");

test("every mutant's anchor occurs exactly once in the text it edits", () => {
  const lost = [];
  let read = 0;
  for (const [set, rows] of Object.entries(MUTANTS)) {
    for (const m of rows) {
      if (!m.file) continue;
      read += 1;
      if (!mutatedTexts(m)) lost.push(`${set}: ${m.name}`);
    }
  }
  assert.ok(read > 1000, `control: the mutants are read (${read})`);
  assert.deepEqual(lost, [], "these mutants point at text that is gone or repeated: anchor them on the code as it is now");
});

test("control: an anchor that is gone, or found twice, is reported, and one found once is applied", () => {
  assert.equal(mutatedTexts({ file: "js/license.js", from: "a text no file has, \u0000", to: "" }), null, "gone");
  assert.equal(mutatedTexts({ file: "js/license.js", from: "function ", to: "" }), null, "found many times");
  const once = mutatedTexts({ file: "js/license.js", from: "const APPLY = Reflect.apply;", to: "const APPLY = null;" });
  assert.ok(once, "found once");
  assert.ok([...once.values()][0].includes("const APPLY = null;"), "and applied");
  // A second edit to the same file is looked for in what the first one left.
  const chained = { file: "js/license.js", from: "const APPLY = Reflect.apply;", to: "const APPLY = Reflect.apply; // one", also: [{ file: "js/license.js", from: "Reflect.apply; // one", to: "null;" }] };
  assert.ok(mutatedTexts(chained), "an `also` edit anchored on the first edit's text applies");
});
