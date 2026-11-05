// A string table written as an object literal keeps the LAST of two equal keys and says nothing. That is how
// rate.take came to name two different things in one file (found by the round-4 red team): the later value
// won in every language, and the earlier one's wording was never shown.
//
// This test parses js/i18n.js and fails on any key written twice inside one table. It does so with the
// parser, not a regex, so a key inside a template string or a comment cannot count and a key on a continuation
// line cannot hide. The control plants a duplicate and a clean table and checks that the detector tells them apart
// (a detector that finds nothing anywhere would also pass the first test).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as espree from "espree";

const SRC = readFileSync(new URL("../../js/i18n.js", import.meta.url), "utf8");

const keyName = (p) => {
  if (p.type !== "Property" || p.computed) return null;
  return p.key.type === "Identifier" ? p.key.name : String(p.key.value);
};

/** Every [table path, key, line] where an object literal writes the same key twice. */
export function duplicateKeys(source) {
  const ast = espree.parse(source, { ecmaVersion: "latest", loc: true, sourceType: "script" });
  const found = [];
  const walk = (node, trail) => {
    if (!node || typeof node.type !== "string") return;
    if (node.type === "ObjectExpression") {
      const seen = new Map();
      for (const p of node.properties) {
        const k = keyName(p);
        if (k == null) continue;
        if (seen.has(k)) found.push({ trail: trail.join("."), key: k, lines: [seen.get(k), p.loc.start.line] });
        else seen.set(k, p.loc.start.line);
      }
    }
    for (const [name, child] of Object.entries(node)) {
      if (name === "loc" || name === "range") continue;
      const label = node.type === "Property" && name === "value" ? [keyName(node)] : [];
      if (Array.isArray(child)) child.forEach((c) => walk(c, trail.concat(label)));
      else if (child && typeof child === "object") walk(child, trail.concat(label));
    }
  };
  walk(ast, []);
  return found;
}

test("js/i18n.js writes no key twice inside one table", () => {
  const dups = duplicateKeys(SRC);
  assert.deepEqual(
    dups.map((d) => `${d.trail}: "${d.key}" at lines ${d.lines.join(" and ")}`),
    []
  );
});

test("control: the detector sees a planted duplicate, per table, and not a clean pair of tables", () => {
  const planted = `const T = { es: { "a.b": "uno", "c": "dos", "a.b": "tres" }, en: { "a.b": "one" } };`;
  assert.deepEqual(duplicateKeys(planted).map((d) => [d.trail, d.key]), [["es", "a.b"]]);
  const clean = `const T = { es: { "a.b": "uno" }, en: { "a.b": "one" } };`;
  assert.deepEqual(duplicateKeys(clean), []);
  // The same words in a comment or a template string are not keys
  const prose = "const T = { es: { 'a': `'a': 1, 'a': 2` /* 'a': 3 */ } };";
  assert.deepEqual(duplicateKeys(prose), []);
});

test("control: the shipped file is read whole (the tables have the keys this test is about)", () => {
  const ast = espree.parse(SRC, { ecmaVersion: "latest", sourceType: "script" });
  assert.ok(ast.body.length > 0);
  assert.match(SRC, /"rate\.takeSum"/);
  assert.match(SRC, /"rate\.take"/);
});
