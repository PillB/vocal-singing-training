// GitHub Pages serves this repository's root as the site, and without a .nojekyll file it builds that root with
// Jekyll first (red team SEC-3; production's pages carry generator "Jekyll v3.10.0"). Jekyll renders every .md file
// as a Liquid template: docs/43's `${{ github.repository }}` already reads `$` on the live site, and one stray
// `{%` in any doc makes the build fail, so every later merge, security fixes included, stops reaching the site
// until somebody reads the failed Pages run. With .nojekyll, Pages copies the files as they are.
// Wrong behaviour rejected: a site root with no .nojekyll. Control: the docs really do hold text Liquid rewrites,
// so the opt-out is load-bearing, not decoration.
import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const root = new URL("../../", import.meta.url);

test("the site root opts out of Jekyll, so Pages copies files verbatim", () => {
  assert.ok(existsSync(new URL(".nojekyll", root)), "a .nojekyll file at the repository root");
});

test("control: a doc holds Liquid syntax that a Jekyll build would rewrite", () => {
  const doc = readFileSync(new URL("docs/43-WHEN-IT-BREAKS.md", root), "utf8");
  assert.match(doc, /\$\{\{ github\.repository \}\}/);
});
