// Every page carries a Content Security Policy, and every inline script on it
// is allowed by its hash. Wrong behaviours rejected: a page shipped without a
// policy (QA-06: none had one); an inline script edited without updating its
// hash, which the browser then silently refuses to run (for the region flag,
// that would turn analytics consent fail-open); an inline event handler,
// which a policy without 'unsafe-inline' never runs; and a policy loosened to
// 'unsafe-inline' or 'unsafe-eval' for scripts.
import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

// Every page the site serves (the cache gate's list, which tests/node/csp-pins.test.mjs checks against git).
import { PAGES } from "../../qa/asset-versions.mjs";
const read = (f) => readFileSync(new URL(`../../${f}`, import.meta.url), "utf8");

export function policyOf(html) {
  const m = html.match(/<meta\s+http-equiv="Content-Security-Policy"\s+content="([^"]+)"/i);
  if (!m) return null;
  const directives = {};
  for (const part of m[1].split(";")) {
    const [name, ...values] = part.trim().split(/\s+/);
    if (name) directives[name] = values;
  }
  return directives;
}

export function inlineScripts(html) {
  return [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1]);
}

export const sha256 = (text) => `'sha256-${createHash("sha256").update(text).digest("base64")}'`;

export function inlineHandlers(html) {
  return [...html.matchAll(/<[a-z][^>]*\s(on[a-z]+)\s*=/gi)].map((m) => m[1]);
}

/** What is wrong with a page's policy, as a list (empty when it is sound). */
export function cspProblems(html) {
  const csp = policyOf(html);
  if (!csp) return ["no Content-Security-Policy meta"];
  const problems = [];
  const scripts = csp["script-src"] || csp["default-src"] || [];
  for (const bad of ["'unsafe-inline'", "'unsafe-eval'", "*", "https:", "data:"]) {
    if (scripts.includes(bad)) problems.push(`script-src allows ${bad}`);
  }
  if (!(csp["object-src"] || []).includes("'none'")) problems.push("object-src is not 'none'");
  if (!csp["base-uri"]) problems.push("no base-uri");
  for (const body of inlineScripts(html)) {
    if (!scripts.includes(sha256(body))) problems.push(`inline script not allowed by hash: ${body.trim().slice(0, 40)}`);
  }
  for (const h of inlineHandlers(html)) problems.push(`inline ${h} handler (never runs under this policy)`);
  return problems;
}

for (const page of PAGES) {
  test(`${page}: a sound policy that allows exactly its own inline scripts`, () => {
    assert.deepEqual(cspProblems(read(page)), []);
  });
}

test("the checker itself rejects each wrong page (controls)", () => {
  const ok = read("index.html");
  assert.deepEqual(cspProblems(ok.replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/, "")), ["no Content-Security-Policy meta"]);
  const edited = ok.replace("window.VT_REGION_REQUIRED = true;", "window.VT_REGION_REQUIRED = false;");
  assert.match(cspProblems(edited).join(), /inline script not allowed by hash/);
  assert.match(cspProblems(ok.replace("<form id=\"metrics-form\"", "<form onsubmit=\"return false;\" id=\"metrics-form\"")).join(), /inline onsubmit handler/);
  assert.match(cspProblems(ok.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")).join(), /allows 'unsafe-inline'/);
});

test("every page sends the same policy, so a fix on one is not missing on another", () => {
  const policies = PAGES.map((p) => JSON.stringify(policyOf(read(p))));
  assert.equal(new Set(policies).size, 1);
});

test("every host the shipped config reaches is allowed, and nothing else is", () => {
  // Wrong behaviour rejected: moving the account worker (billing-config's
  // apiBaseUrl, which analytics and the region check also use) without
  // updating the policy, so sign-in, licences and consent calls all fail;
  // and the reverse, a policy that still allows a host nobody calls.
  const cfg = read("js/billing-config.js");
  const api = new URL(/apiBaseUrl:\s*"([^"]+)"/.exec(cfg)[1]).origin;
  const connect = policyOf(read("index.html"))["connect-src"];
  assert.ok(connect.includes(api), `${api} missing from connect-src`);
  assert.ok(connect.includes("https://accounts.google.com/gsi/"), "Google sign-in's own calls (per Google's CSP guide)");
  const extra = connect.filter((h) => h !== "'self'" && h !== api && h !== "https://accounts.google.com/gsi/");
  assert.deepEqual(extra, [], "hosts allowed that the app never calls");
  const gis = /GIS_SRC\s*=\s*"([^"]+)"/.exec(read("js/account.js"))[1];
  assert.ok(policyOf(read("index.html"))["script-src"].includes(gis), "the sign-in script the app loads");
});
