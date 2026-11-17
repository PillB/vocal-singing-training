// index.html asks for every script at the end of its body all at once, as soon
// as the header and the hero have been read. Chromium's preload scanner stops
// at the page's CSP <meta>, so without that it found each script only when the
// one before it had run: 53 round trips in a row, and the app started after
// 11 s on a 4G phone (3.3 s on a desktop line) against about 2.9 s (1.2 s)
// asked for together. Asked for from <head>, the first paint came 0.1 s later.
//
// A preload is used only by a <script> at exactly its address (?v= included)
// and with the same CORS mode; any other is a second download of the same file
// and leaves the first unused. So the two lists must be the same, in the same
// order, and nothing preloaded may go unused.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync(new URL("../../index.html", import.meta.url), "utf8");

/**
 * The markup as the parser reads it: no comments, and nothing inside
 * <noscript> or <template>, which never runs while scripts do. Matched on the
 * raw text, a script tag commented out, or a preload, passed for a live one
 * (review of PR #42, rt4).
 */
export function live(page) {
  return page.replace(/<!--[\s\S]*?-->/g, "").replace(/<(noscript|template)\b[\s\S]*?<\/\1>/g, "");
}

/** What a page preloads as a script, and the external scripts its body runs, in order. */
export function scriptLists(page) {
  const read = live(page);
  const body = read.slice(read.indexOf("<body"));
  const preloads = [...read.matchAll(/<link\b([^>]*)>/g)]
    .map((m) => m[1])
    .filter((a) => /\brel="preload"/.test(a) && /\bas="script"/.test(a))
    .map((a) => ({ href: a.match(/\bhref="([^"]*)"/)?.[1], cors: /\bcrossorigin\b/.test(a) }));
  // A module is fetched in CORS mode, as if it had crossorigin; one of another type never runs
  const scripts = [...body.matchAll(/<script\b([^>]*)>/g)]
    .map((m) => m[1])
    .filter((a) => /\bsrc="/.test(a))
    .map((a) => ({
      href: a.match(/\bsrc="([^"]*)"/)[1],
      cors: /\bcrossorigin\b/.test(a) || /\btype="module"/.test(a),
      runs: !/\bnomodule\b/.test(a) && !/\btype="(?!module"|text\/javascript")/.test(a)
    }));
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
  for (const s of scripts) if (!s.runs) problems.push(`${s.href} is preloaded and never runs here`);
  // The request mode of each preload must be its own script's, both ways
  const mode = new Map(scripts.map((s) => [s.href, s.cors]));
  for (const p of preloads) if (mode.has(p.href) && p.cors !== mode.get(p.href)) problems.push(`${p.href} is preloaded ${p.cors ? "with" : "without"} crossorigin, which the <script> is not`);
  const order = (list) => list.map((x) => x.href).filter((h) => asked.has(h) && run.has(h)).join("\n");
  if (order(preloads) !== order(scripts)) problems.push("the preloads are not in the order the scripts run");
  return problems;
}

test("every script the body runs is asked for early, at its own address, in order, and nothing else", () => {
  const { preloads, scripts } = scriptLists(html);
  assert.ok(scripts.length >= 50, `control: the body runs its scripts (${scripts.length})`);
  assert.ok(scripts.some((s) => s.href.startsWith("js/app.js?v=")), "control: app.js is among them");
  assert.deepEqual(preloadProblems(html), []);
  assert.equal(preloads.length, scripts.length);
});

/**
 * Where a page's preloads stand: after the hero's markup, so the parser has
 * read what the first paint shows before it sets up 53 requests (from <head>
 * that paint came 0.1 s later on a 4G phone, first load and later), and before
 * the first script the body runs, so each is asked for early.
 */
export function preloadPlace(page) {
  const read = live(page);
  const preloads = [...read.matchAll(/<link\b[^>]*\brel="preload"[^>]*\bas="script"[^>]*>/g)].map((m) => m.index);
  const hero = read.indexOf('id="start-panel"');
  const heroEnd = hero < 0 ? -1 : read.indexOf("</section>", hero);
  const firstScript = read.slice(read.indexOf("<body")).search(/<script\b[^>]*\bsrc="/) + read.indexOf("<body");
  return { first: preloads.length ? Math.min(...preloads) : -1, last: preloads.length ? Math.max(...preloads) : -1, hero, heroEnd, firstScript };
}

test("the preloads come once the header and the hero have been read, and before the body's first script", () => {
  const at = preloadPlace(html);
  assert.ok(at.first > 0 && at.hero > 0 && at.heroEnd > at.hero, `control: the preloads and the hero are found (${JSON.stringify(at)})`);
  assert.ok(at.first > at.heroEnd, "after the hero's markup, which the first paint shows");
  assert.ok(at.last < at.firstScript, "before the first script the body runs");
});

test("site-version.js stays in <head> and runs before the first frame, not deferred", () => {
  const head = html.slice(0, html.indexOf("</head>"));
  const tag = head.match(/<script\b[^>]*\bsrc="js\/site-version\.js[^>]*>/);
  assert.ok(tag, "control: site-version.js is in <head>");
  assert.doesNotMatch(tag[0], /\b(defer|async)\b/, "it paints the design before the first frame");
});

test("the place check finds preloads in <head>, inside the hero, and after the first script", () => {
  const hero = `<section id="start-panel"><h2>Hi</h2></section>`;
  const l = `<link rel="preload" href="js/a.js?v=1" as="script" />`;
  const s = `<script src="js/a.js?v=1"></script>`;
  const page = (head, body) => `<html><head>${head}</head><body>${body}</body></html>`;
  const ok = preloadPlace(page("", hero + l + s));
  assert.ok(ok.first > ok.heroEnd && ok.last < ok.firstScript, "control: a page that is right passes");
  const inHead = preloadPlace(page(l, hero + s));
  assert.ok(!(inHead.first > inHead.heroEnd), "in <head>: before the hero");
  const inHero = preloadPlace(page("", `<section id="start-panel"><h2>Hi</h2>${l}</section>` + s));
  assert.ok(!(inHero.first > inHero.heroEnd), "inside the hero: before its end");
  const late = preloadPlace(page("", hero + s + l));
  assert.ok(!(late.last < late.firstScript), "after the first script");
  const commented = preloadPlace(page(`<!-- ${l} -->`, hero + l + s));
  assert.ok(commented.first > commented.heroEnd, "a preload commented out in <head> is not read as one");
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

// What the parser never runs, or fetches in another mode, read as the parser reads it (review of PR #42, rt4)
test("the check reads the markup as the parser does: a tag commented out, a module, a script with crossorigin, one inside a template", () => {
  const page = (head, body) => `<html><head>${head}</head><body>${body}</body></html>`;
  const s = (src, extra = "") => `<script src="${src}"${extra}></script>`;
  const l = (href, extra = "") => `<link rel="preload" href="${href}" as="script"${extra} />`;
  const both = l("js/a.js?v=1") + l("js/b.js?v=1");
  assert.deepEqual(preloadProblems(page(both, s("js/a.js?v=1") + `<!-- ${s("js/b.js?v=1")} -->`)), ["js/b.js?v=1 is preloaded and never run"]);
  assert.deepEqual(preloadProblems(page(l("js/a.js?v=1") + `<!-- ${l("js/b.js?v=1")} -->`, s("js/a.js?v=1") + s("js/b.js?v=1"))), ["js/b.js?v=1 is not preloaded"]);
  assert.deepEqual(preloadProblems(page(both, s("js/a.js?v=1") + `<template>${s("js/b.js?v=1")}</template>`)), ["js/b.js?v=1 is preloaded and never run"]);
  assert.deepEqual(preloadProblems(page(both, s("js/a.js?v=1") + s("js/b.js?v=1", ' type="module"'))), ["js/b.js?v=1 is preloaded without crossorigin, which the <script> is not"]);
  assert.deepEqual(preloadProblems(page(both, s("js/a.js?v=1") + s("js/b.js?v=1", " crossorigin"))), ["js/b.js?v=1 is preloaded without crossorigin, which the <script> is not"]);
  assert.deepEqual(preloadProblems(page(both, s("js/a.js?v=1") + s("js/b.js?v=1", ' type="text/plain"'))), ["js/b.js?v=1 is preloaded and never runs here"]);
  assert.deepEqual(preloadProblems(page(both, s("js/a.js?v=1") + s("js/b.js?v=1", " defer"))), [], "control: a deferred script uses its preload");
});
