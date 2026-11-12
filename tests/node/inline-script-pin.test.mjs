// QA-15. An inline script that grows is invisible to the complexity gate (it
// parses .js/.mjs/.cjs only) and tests/node/csp.test.mjs accepts ANY inline
// script whose hash is listed, so a 30-branch function plus its hash passes
// both. This pins the inline scripts to an explicit list: a new or longer one
// needs this file edited on purpose.
// Correct behaviour: the one-line region flag on index.html and guide.html passes.
// Wrong behaviour: any other inline script body (even with its CSP hash) fails.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Every page the site serves (the cache gate's list, which tests/node/csp-pins.test.mjs checks against git).
import { PAGES } from "../../qa/asset-versions.mjs";
const ALLOWED_INLINE = new Set(["window.VT_REGION_REQUIRED = true;"]);
const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");
const inlineScripts = (html) => [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim());
const unlisted = (html) => inlineScripts(html).filter((b) => !ALLOWED_INLINE.has(b));

for (const page of PAGES) {
  test(`${page}: only the listed inline scripts`, () => assert.deepEqual(unlisted(read(page)), []));
}

test("controls: the pin sees a long inline script, a changed flag, and accepts the real one", () => {
  const page = read("index.html");
  const planted = page.replace("</body>", "<script>" + "function f(a){" + "if(a){return 1;}".repeat(30) + "}</script></body>");
  assert.equal(unlisted(planted).length, 1);
  assert.equal(unlisted(page.replace("VT_REGION_REQUIRED = true", "VT_REGION_REQUIRED = false")).length, 1);
  assert.equal(unlisted(page).length, 0);
});
