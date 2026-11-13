// QA round 4 (csp). Node-side gaps in tests/node/csp.test.mjs and tests/node/asset-versions.test.mjs.
// The expected values are written out here, not read from the policy or computed by the checker under test
// (the inline script's hash is computed from the page's own bytes with node:crypto).
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { references, PAGES as GATE_PAGES } from "../../qa/asset-versions.mjs";

const ROOT = new URL("../../", import.meta.url);
const read = (f) => readFileSync(new URL(f, ROOT), "utf8");
// Every html file GitHub Pages would serve, read from git here rather than from the gate under test. It was the
// root folder only until #26 added qa/index.html, the one page in a folder, which a root listing cannot see.
const HTML = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "*.html"], {
  cwd: ROOT,
  encoding: "utf8"
})
  .split("\0")
  .filter(Boolean)
  .sort();
const WORKER = new URL(/apiBaseUrl:\s*"([^"]+)"/.exec(read("js/billing-config.js"))[1]).origin;

const policy = (html) => {
  const m = /<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i.exec(html);
  return Object.fromEntries(m[1].split(";").map((p) => p.trim().split(/\s+/)).filter((p) => p[0]).map(([n, ...v]) => [n, v]));
};
// The one inline script the site ships, written out here (not taken from any page).
const REGION_FLAG = "window.VT_REGION_REQUIRED = true;";
const FLAG_HASH = `'sha256-${createHash("sha256").update(REGION_FLAG).digest("base64")}'`;
const inlineBodies = (html) => [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);

// Why each source is there (observed by driving the app; see qa/round4/csp). Anything else is a widening.
const EXPECTED = {
  "default-src": ["'self'"],
  "script-src": ["'self'", "https://accounts.google.com/gsi/client"], // + each inline script's hash
  "style-src": ["'self'", "'unsafe-inline'", "https://accounts.google.com/gsi/style"],
  "img-src": ["'self'", "data:", "blob:"],
  "media-src": ["'self'", "blob:"],
  "font-src": ["'self'", "data:"],
  "connect-src": ["'self'", WORKER, "https://accounts.google.com/gsi/"],
  "frame-src": ["https://accounts.google.com/gsi/"],
  "worker-src": ["'self'", "blob:"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"]
};

test("every html file the site serves is covered by both gates' page lists", () => {
  // Wrong behaviour rejected: a fifth page (GitHub Pages serves any .html, in any folder) with no policy and
  // unversioned scripts.
  assert.ok(HTML.includes("qa/index.html"), "control: the page in a folder is in the list");
  assert.deepEqual([...GATE_PAGES].sort(), HTML);
});

for (const page of HTML) {
  test(`${page}: each directive allows exactly what the app needs, nothing wider`, () => {
    const html = read(page);
    const got = policy(html);
    const want = { ...EXPECTED, "script-src": [...EXPECTED["script-src"], FLAG_HASH] };
    // and no page ships an inline script other than the flag (a second one would need a second, reviewed hash)
    assert.deepEqual(inlineBodies(html).filter((b) => b !== REGION_FLAG), []);
    const norm = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [...v].sort()]));
    assert.deepEqual(norm(got), norm(want));
  });

  test(`${page}: the policy meta is in <head> before any script, stylesheet or style (a meta only governs what follows it)`, () => {
    const html = read(page);
    const head = /<head[^>]*>([\s\S]*?)<\/head>/i.exec(html)[1];
    const at = head.search(/<meta\s+http-equiv="Content-Security-Policy"/i);
    assert.ok(at >= 0, "policy meta not inside <head>");
    const first = head.search(/<(script|link|style|img|iframe)\b/i);
    assert.ok(first === -1 || at < first, "a resource tag comes before the policy meta");
  });
}

test("the cache gate sees every local script and stylesheet a page loads, however it is spelled", () => {
  // Wrong behaviour rejected: src='js/x.js', src=./js/x.js, an unquoted src, or a tag spread over lines:
  // the gate then skips the file, and an edit to it never asks for a new ?v=.
  for (const page of HTML) {
    const tags = [...read(page).matchAll(/<(?:script|link)\b[^>]*>/gi)].map((m) => m[0]);
    // local: a path with no scheme and no leading //, ending in .js or .css (`../js/app.js` and `qa.js` from qa/)
    const local = tags.filter((t) => /(?:src|href)\s*=\s*["']?(?![a-z][a-z0-9+.-]*:|\/\/)[^"'\s>?#]+\.(?:js|css)\b/i.test(t));
    const seen = references(read(page), page).length;
    assert.equal(seen, local.length, `${page}: ${local.length} local script/style tags, the gate sees ${seen}`);
  }
});
