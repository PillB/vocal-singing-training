// Every gap in docs/VALUE-GAP-REGISTRY.md has one id, and no id names two gaps.
//
// Each branch takes the next free VG number on its own base, and nothing caught two branches taking the same one:
// on 2026-11-25 VG-98 named three different gaps across main and two open PRs, and VG-99 two (state-machine
// inventory, 2026-11-26). Rows with the same id in different places of the table merge without a textual conflict,
// so the duplicate lands silently, and every "see VG-99" in a test title, a mutant, a commit or a README is then
// ambiguous. Wrong behaviours rejected here: a second row with an id already used; a row whose id is not VG- and a
// number (it would escape the check). The check is shown to fail on a simulated duplicate, so it is not vacuous.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const REGISTRY = readFileSync(new URL("../../docs/VALUE-GAP-REGISTRY.md", import.meta.url), "utf8");

/** The id and title of every row of the registry's gap table (`| VG-n | title | ...`). */
function gapRows(markdown) {
  return [...markdown.matchAll(/^\| (VG-[^ |]*) \| ([^|]*) \|/gm)].map((m) => ({ id: m[1], title: m[2].trim() }));
}

/** Ids used by more than one row, each with the titles that share it. */
function duplicateIds(rows) {
  const byId = new Map();
  for (const row of rows) {
    byId.set(row.id, [...(byId.get(row.id) || []), row.title]);
  }
  return [...byId].filter(([, titles]) => titles.length > 1).map(([id, titles]) => ({ id, titles }));
}

test("value-gap registry: no id names two gaps", () => {
  const rows = gapRows(REGISTRY);
  assert.ok(rows.length > 100, `the table was found (${rows.length} rows)`);
  assert.deepEqual(duplicateIds(rows), [],
    "two rows share an id: give the one added later the next free VG number, and move every reference to it (tests, mutants, README)");
});

test("value-gap registry: every row's id is VG- and a number", () => {
  const malformed = gapRows(REGISTRY).filter((row) => !/^VG-\d+$/.test(row.id));
  assert.deepEqual(malformed, [], "a row id the duplicate check cannot compare");
});

test("value-gap registry: a duplicate id is caught and named, a new id is not", () => {
  const rows = gapRows(REGISTRY);
  const last = rows[rows.length - 1];
  const next = `VG-${Math.max(...rows.map((row) => Number(row.id.slice(3)))) + 1}`;
  const duplicated = `${REGISTRY}\n| ${last.id} | Another gap given the same number on another branch | P2 | Open | x | y |\n`;
  assert.deepEqual(duplicateIds(gapRows(duplicated)), [{ id: last.id, titles: [last.title, "Another gap given the same number on another branch"] }]);
  const added = `${REGISTRY}\n| ${next} | A gap given the next free number | P2 | Open | x | y |\n`;
  assert.deepEqual(duplicateIds(gapRows(added)), [], `${next} is free`);
});
