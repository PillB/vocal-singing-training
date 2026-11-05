/**
 * Cache-busting gate for the static site. GitHub Pages serves every file with
 * a 10-minute cache, and the pages load their scripts and styles as
 * `js/app.js?v=20261101a`. Change app.js without changing `?v=` and a visitor
 * can run the new index.html against the cached old app.js (or the reverse)
 * for up to ten minutes: the "coherent deployed reloads" PR #22 fixed by hand.
 *
 * qa/asset-manifest.json records, per versioned file, the version the pages
 * use and the content hash it was given for. The check fails when a file's
 * content no longer matches its hash while the version is unchanged, when two
 * pages disagree on a file's version, or when a page loads a local script or
 * stylesheet with no version at all.
 *
 *   node qa/asset-versions.mjs           # check (part of npm run lint)
 *   node qa/asset-versions.mjs --bump    # new ?v= for changed files, in every page
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const PAGES = ["index.html", "guide.html", "privacy.html", "admin.html"];
const MANIFEST = "qa/asset-manifest.json";
const REF = /\b(?:src|href)="((?:js|css)\/[^"?#]+)(?:\?v=([^"#]*))?"/g;

/** [{ file, v }] for every local script/stylesheet reference in a page. */
export function references(html) {
  return [...html.matchAll(REF)].map((m) => ({ file: m[1], v: m[2] ?? null }));
}

export const hashOf = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/** Versions the pages use: { file: { v, pages } }, plus the problems found. */
export function collect(pages) {
  const used = {};
  const problems = [];
  for (const [page, html] of Object.entries(pages)) {
    for (const { file, v } of references(html)) {
      if (v == null) {
        problems.push(`${page} loads ${file} with no ?v= (a stale cached copy can run)`);
        continue;
      }
      const seen = used[file];
      if (seen && seen.v !== v) problems.push(`${file} is ?v=${seen.v} in ${seen.page} but ?v=${v} in ${page}`);
      if (!seen) used[file] = { v, page };
    }
  }
  return { used, problems };
}

/** Problems with the current tree against the manifest. `read(file)` gives a file's text or null. */
export function check(pages, manifest, read) {
  const { used, problems } = collect(pages);
  for (const [file, { v }] of Object.entries(used)) {
    const text = read(file);
    if (text == null) {
      problems.push(`${file} is loaded but does not exist`);
      continue;
    }
    const rec = manifest[file];
    if (!rec) problems.push(`${file} is not in ${MANIFEST} (run: npm run assets:bump)`);
    else if (rec.sha !== hashOf(text) && rec.v === v) {
      problems.push(`${file} changed but is still ?v=${v} (run: npm run assets:bump)`);
    } else if (rec.v !== v) problems.push(`${file} is ?v=${v} in the pages but ${rec.v} in ${MANIFEST} (run: npm run assets:bump)`);
  }
  return problems;
}

/** Next version string for today: 20261101a, then b, c ... after today's last. */
export function nextVersion(prev, today) {
  if (prev && prev.startsWith(today)) {
    const letter = prev.slice(today.length) || "a";
    return today + String.fromCharCode(letter.charCodeAt(0) + 1);
  }
  return today + "a";
}

function bump(root, pages, manifest, today) {
  const read = (f) => (existsSync(path.join(root, f)) ? readFileSync(path.join(root, f), "utf8") : null);
  const { used } = collect(pages);
  const next = { ...manifest };
  const changed = [];
  for (const [file, { v }] of Object.entries(used)) {
    const text = read(file);
    if (text == null) continue;
    const sha = hashOf(text);
    const rec = manifest[file];
    if (rec && rec.sha === sha) {
      next[file] = { v, sha };
      continue;
    }
    const nv = rec ? nextVersion(v, today) : v;
    next[file] = { v: nv, sha };
    if (nv !== v) changed.push([file, v, nv]);
  }
  for (const page of PAGES) {
    let html = pages[page];
    for (const [file, v, nv] of changed) html = html.split(`${file}?v=${v}"`).join(`${file}?v=${nv}"`);
    writeFileSync(path.join(root, page), html);
  }
  const sorted = Object.fromEntries(Object.keys(next).sort().map((k) => [k, next[k]]));
  writeFileSync(path.join(root, MANIFEST), JSON.stringify(sorted, null, 2) + "\n");
  return changed;
}

export function main(args, root = process.cwd()) {
  const pages = Object.fromEntries(PAGES.map((p) => [p, readFileSync(path.join(root, p), "utf8")]));
  const manifestPath = path.join(root, MANIFEST);
  const manifest = existsSync(manifestPath) ? JSON.parse(readFileSync(manifestPath, "utf8")) : {};
  if (args.includes("--bump")) {
    const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const changed = bump(root, pages, manifest, today);
    for (const [file, v, nv] of changed) console.log(`${file}: ?v=${v} -> ?v=${nv}`);
    console.log(`Bumped ${changed.length} asset version(s).`);
    return 0;
  }
  const read = (f) => (existsSync(path.join(root, f)) ? readFileSync(path.join(root, f), "utf8") : null);
  const problems = check(pages, manifest, read);
  for (const p of problems) console.error(`ASSET ${p}`);
  if (problems.length) return 1;
  console.log(`PASS: ${Object.keys(collect(pages).used).length} versioned assets match their content.`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = main(process.argv.slice(2));
}
