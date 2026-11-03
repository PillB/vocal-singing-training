// Red team r9 (trust). Two gaps in the CSP gates (tests/node/csp.test.mjs, csp-pins.test.mjs):
//
//  1. They read a policy the way no browser does. Both parsers keep the LAST occurrence of a repeated directive; a
//     browser keeps the FIRST and ignores the rest. A page that says `connect-src *; ...; connect-src 'self' <worker>`
//     reads as exactly the expected policy to both gates (and keeps the key order, so the same-policy-everywhere test
//     agrees) while the browser lets the page talk to any origin. The browser specs only drive script-src, so
//     connect-src / img-src / frame-src / form-action / style-src loosened this way is seen by nobody.
//  2. They look at the html files in the repo root only. GitHub Pages serves every .html in the tree, so a page in
//     docs/ or qa/ ships without a policy (csp-pins' own comment says so) and no gate reads it.
//
// GOAL: the policy a browser ENFORCES on every html file the site can serve is exactly the one the app needs, and
// no directive is written twice. Expected values are written out below, not read from any page or from the checkers.
// Wrong behaviours rejected: P1 a repeated directive whose first occurrence is wider; P2 an html file anywhere in the
// tree that is not covered by the policy (or whose enforced policy differs from the root pages').
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";

const ROOT = new URL("../../", import.meta.url);
const WORKER = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev";
const GSI = "https://accounts.google.com/gsi/";
// the one inline script the site ships, written out here and hashed here (not read from any page)
const FLAG_HASH = `'sha256-${createHash("sha256").update("window.VT_REGION_REQUIRED = true;").digest("base64")}'`;
const EXPECTED = {
  "default-src": ["'self'"],
  "script-src": ["'self'", FLAG_HASH, `${GSI}client`],
  "style-src": ["'self'", "'unsafe-inline'", `${GSI}style`],
  "img-src": ["'self'", "data:", "blob:"],
  "media-src": ["'self'", "blob:"],
  "font-src": ["'self'", "data:"],
  "connect-src": ["'self'", WORKER, GSI],
  "frame-src": [GSI],
  "worker-src": ["'self'", "blob:"],
  "object-src": ["'none'"],
  "base-uri": ["'self'"],
  "form-action": ["'self'"]
};

/** The policy as a browser enforces it: names are case-insensitive, the first occurrence of a name wins, later ones are ignored. */
export function enforced(content) {
  const out = {};
  const seen = [];
  for (const part of content.split(";")) {
    const [name, ...values] = part.trim().split(/[ \t\n\f\r]+/);
    if (!name) continue;
    const key = name.toLowerCase();
    seen.push(key);
    if (!(key in out)) out[key] = values;
  }
  return { out, seen };
}
const norm = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, [...v].sort()]));

/** Every policy meta the browser would apply, in a document with comments removed (a commented-out meta applies nothing). */
export function metas(html) {
  const live = html.replace(/<!--[\s\S]*?-->/g, "");
  return [...live.matchAll(/<meta\b[^>]*>/gi)]
    .map((m) => m[0])
    .filter((t) => /http-equiv\s*=\s*["']?content-security-policy["'\s>]/i.test(t))
    .map((t) => /content\s*=\s*"([^"]*)"/i.exec(t)?.[1] ?? "");
}

const pages = () =>
  execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "*.html"], { cwd: ROOT, encoding: "utf8" })
    .split("\0")
    .filter(Boolean)
    .sort();

test("control: the checker reads the first occurrence, not the last, and ignores a commented-out meta", () => {
  const dup = enforced("connect-src *; script-src 'self'; connect-src 'self'");
  assert.deepEqual(dup.out["connect-src"], ["*"]);
  assert.deepEqual(dup.seen.filter((n) => n === "connect-src").length, 2);
  assert.deepEqual(metas('<!-- <meta http-equiv="Content-Security-Policy" content="default-src \'self\'"> -->'), []);
  assert.deepEqual(metas('<meta http-equiv="Content-Security-Policy" content="default-src \'self\'">'), ["default-src 'self'"]);
});

test("every html file the site can serve: exactly one policy meta, no directive twice, and what the browser enforces is what the app needs", () => {
  const files = pages();
  assert.ok(files.includes("index.html") && files.includes("privacy.html"), "control: the root pages are in the list");
  const bad = [];
  for (const f of files) {
    const found = metas(readFileSync(new URL(f, ROOT), "utf8"));
    if (found.length !== 1) {
      bad.push(`${f}: ${found.length} policy meta tag(s) outside comments (exactly 1 expected)`);
      continue;
    }
    const { out, seen } = enforced(found[0]);
    const twice = seen.filter((n, i) => seen.indexOf(n) !== i);
    if (twice.length) bad.push(`${f}: directive written twice (a browser keeps the first): ${[...new Set(twice)].join(", ")}`);
    try {
      assert.deepEqual(norm(out), norm(EXPECTED));
    } catch (e) {
      bad.push(`${f}: enforced policy differs from the app's needs\n${String(e.message).split("\n").slice(0, 14).join("\n")}`);
    }
  }
  assert.deepEqual(bad, []);
});
