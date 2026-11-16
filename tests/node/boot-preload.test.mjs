// index.html asks for every script at the end of its body from <head>, all at
// once. Chromium's preload scanner stops at the page's CSP <meta>, so without
// that it found each script only when the one before it had run: 53 round
// trips in a row, and the app started after 11 s on a 4G phone (3.3 s on a
// desktop line) against about 2.9 s (1.2 s) asked for together.
//
// A preload is used only by a <script> at exactly its address (?v= included)
// and with the same CORS mode; any other is a second download of the same file
// and leaves the first unused. So the two lists must be the same, in the same
// order, and nothing preloaded may go unused.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");

/** What a page preloads as a script from <head>, and the external scripts its body runs, in order. */
export function scriptLists(page) {
  const head = page.slice(0, page.indexOf("</head>"));
  const body = page.slice(page.indexOf("<body"));
  const preloads = [...head.matchAll(/<link\b([^>]*)>/g)]
    .map((m) => m[1])
    .filter((a) => /\brel="preload"/.test(a) && /\bas="script"/.test(a))
    .map((a) => ({ href: a.match(/\bhref="([^"]*)"/)?.[1], cors: /\bcrossorigin\b/.test(a) }));
  const scripts = [...body.matchAll(/<script\b([^>]*)>/g)]
    .map((m) => m[1])
    .filter((a) => /\bsrc="/.test(a))
    .map((a) => ({ href: a.match(/\bsrc="([^"]*)"/)[1], cors: /\bcrossorigin\b/.test(a) }));
  return { preloads, scripts };
}

/** What is wrong with a page's preloads: a body script not asked for early, one asked for at another address, or in another order. */
export function preloadProblems(page) {
  const { preloads, scripts } = scriptLists(page);
  const problems = [];
  const asked = new Set(preloads.map((p) => p.href));
  const run = new Set(scripts.map((s) => s.href));
  for (const s of scripts) if (!asked.has(s.href)) problems.push(`${s.href} is not preloaded`);
  for (const p of preloads) if (!run.has(p.href)) problems.push(`${p.href} is preloaded and never run`);
  for (const p of preloads) if (p.cors) problems.push(`${p.href} is preloaded with crossorigin, which the <script> is not`);
  const order = (list) => list.map((x) => x.href).filter((h) => asked.has(h) && run.has(h)).join("\n");
  if (order(preloads) !== order(scripts)) problems.push("the preloads are not in the order the scripts run");
  return problems;
}

test("every script the body runs is asked for from <head>, at its own address, in order, and nothing else", () => {
  const { preloads, scripts } = scriptLists(html);
  assert.ok(scripts.length >= 50, `control: the body runs its scripts (${scripts.length})`);
  assert.ok(scripts.some((s) => s.href.startsWith("js/app.js?v=")), "control: app.js is among them");
  assert.deepEqual(preloadProblems(html), []);
  assert.equal(preloads.length, scripts.length);
});

test("the preloads come after the stylesheets and site-version.js, so the first paint does not wait on them", () => {
  const head = html.slice(0, html.indexOf("</head>"));
  const first = head.search(/<link\b[^>]*\brel="preload"[^>]*\bas="script"/);
  const lastSheet = [...head.matchAll(/<link\b[^>]*\brel="stylesheet"/g)].at(-1).index;
  const siteVersion = head.indexOf('<script src="js/site-version.js');
  assert.ok(first > 0, "control: there are preloads in <head>");
  assert.ok(first > lastSheet, "after the last stylesheet");
  assert.ok(first > siteVersion, "after site-version.js, which paints the design before the first frame");
});

// The check itself, on pages that are wrong: it must say so for each.
test("the check finds a script not preloaded, one preloaded at an old ?v=, one out of order, and one with another CORS mode", () => {
  const page = (head, body) => `<html><head>${head}</head><body>${body}</body></html>`;
  const s = (src) => `<script src="${src}"></script>`;
  const l = (href, extra = "") => `<link rel="preload" href="${href}" as="script"${extra} />`;
  const right = page(l("js/a.js?v=1") + l("js/b.js?v=1"), s("js/a.js?v=1") + s("js/b.js?v=1"));
  assert.deepEqual(preloadProblems(right), [], "control: a page that is right passes");
  assert.deepEqual(preloadProblems(page(l("js/a.js?v=1"), s("js/a.js?v=1") + s("js/b.js?v=1"))), ["js/b.js?v=1 is not preloaded"]);
  assert.deepEqual(preloadProblems(page(l("js/a.js?v=1") + l("js/b.js?v=0"), s("js/a.js?v=1") + s("js/b.js?v=1"))), [
    "js/b.js?v=1 is not preloaded",
    "js/b.js?v=0 is preloaded and never run"
  ]);
  assert.deepEqual(preloadProblems(page(l("js/b.js?v=1") + l("js/a.js?v=1"), s("js/a.js?v=1") + s("js/b.js?v=1"))), ["the preloads are not in the order the scripts run"]);
  assert.deepEqual(preloadProblems(page(l("js/a.js?v=1", " crossorigin") + l("js/b.js?v=1"), s("js/a.js?v=1") + s("js/b.js?v=1"))), [
    "js/a.js?v=1 is preloaded with crossorigin, which the <script> is not"
  ]);
});
