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
 * Every page the site serves is read, not a fixed list: GitHub Pages serves
 * any .html in the tree, and the one page in a folder (qa/index.html, the
 * testers' page, from #26) loads `../js/app.js` and its own `qa.js`. Each
 * reference is resolved against the page that makes it, so `js/app.js` from
 * the root and `../js/app.js` from qa/ are one file with one version. #26
 * guarded the same thing with qa/check-cache-stamps.mjs, which compared a
 * stamp's date with git's last-change date; that proxy flags a file ported
 * or cherry-picked after the day it was stamped (js/piano.js on main: stamped
 * 20261104d for exactly this content, committed 2026-11-06) and passes one
 * changed twice on the same day, so it was retired for the content hash.
 *
 *   node qa/asset-versions.mjs           # check (part of npm run lint)
 *   node qa/asset-versions.mjs --bump    # new ?v= for changed files, in every page
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SKIP_DIRS = new Set(["node_modules", ".git", ".claude", "test-results", "playwright-report"]);

/** Every .html under `dir` by walking it, for a tree with no git (a copied folder). */
function walkPages(root, dir = root) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return SKIP_DIRS.has(e.name) ? [] : walkPages(root, full);
    return e.isFile() && e.name.endsWith(".html") ? [path.relative(root, full).split(path.sep).join("/")] : [];
  });
}

/**
 * Every page the site can serve: each .html git tracks or would track (ignored
 * output such as playwright-report/ is left out), repo-relative, sorted.
 */
export function sitePages(root = HERE_ROOT) {
  try {
    const out = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z", "--", "*.html"], {
      cwd: root,
      encoding: "utf8"
    });
    return out.split("\0").filter(Boolean).filter((f) => existsSync(path.join(root, f))).sort();
  } catch {
    return walkPages(root).sort();
  }
}

export const PAGES = sitePages();
const MANIFEST = "qa/asset-manifest.json";
// A local script or stylesheet: a relative path (no scheme, no //) ending in .js or .css.
const REF = /\b(src|href)="((?![a-z][a-z0-9+.-]*:|\/\/)[^"?#]+\.(?:js|css))(?:\?v=([^"#]*))?"/g;

/** The repo path a page's reference names: `../js/a.js` from qa/index.html is `js/a.js`. */
export function resolveRef(page, raw) {
  return path.posix.normalize(path.posix.join(path.posix.dirname(page), raw));
}

/** [{ file, raw, v }] for every local script/stylesheet reference in a page (a root page by default). */
export function references(html, page = "index.html") {
  return [...html.matchAll(REF)].map((m) => ({ file: resolveRef(page, m[2]), raw: m[2], v: m[3] ?? null }));
}

export const hashOf = (text) => createHash("sha256").update(text).digest("hex").slice(0, 16);

/** Versions the pages use: { file: { v, pages } }, plus the problems found. */
export function collect(pages) {
  const used = {};
  const problems = [];
  for (const [page, html] of Object.entries(pages)) {
    for (const { file, v } of references(html, page)) {
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

/** Every version each file is loaded at, across all pages: { file: Set<v> }. */
function versionsByFile(pages) {
  const out = new Map();
  for (const [page, html] of Object.entries(pages)) {
    for (const { file, v } of references(html, page)) {
      if (v == null) continue;
      if (!out.has(file)) out.set(file, new Set());
      out.get(file).add(v);
    }
  }
  return out;
}

/**
 * The version a file should be loaded at after a bump. Pages that disagree get
 * one new version past the newest they use, so every browser refetches whatever
 * copy it held; otherwise an unchanged file keeps its version, a changed one
 * gets the next, and a file new to the manifest keeps the one it was given.
 */
export function targetVersion(seen, rec, sha, today) {
  const newest = [...seen].sort().at(-1);
  if (seen.size > 1) return nextVersion(newest, today);
  if (!rec || rec.sha === sha) return newest;
  return nextVersion(newest, today);
}

/** Rewrite every reference whose version differs from its file's target; returns the pages that changed. */
function rewritePages(pages, targets) {
  const out = {};
  for (const [page, html] of Object.entries(pages)) {
    const next = html.replace(REF, (whole, attr, raw, v) => {
      const nv = targets.get(resolveRef(page, raw));
      return nv && v != null && v !== nv ? `${attr}="${raw}?v=${nv}"` : whole;
    });
    if (next !== html) out[page] = next;
  }
  return out;
}

function bump(root, pages, manifest, today) {
  const read = (f) => (existsSync(path.join(root, f)) ? readFileSync(path.join(root, f), "utf8") : null);
  const next = { ...manifest };
  const targets = new Map();
  const changed = [];
  for (const [file, seen] of versionsByFile(pages)) {
    const text = read(file);
    if (text == null) continue;
    const sha = hashOf(text);
    const nv = targetVersion(seen, manifest[file], sha, today);
    next[file] = { v: nv, sha };
    targets.set(file, nv);
    for (const v of seen) if (v !== nv) changed.push([file, v, nv]);
  }
  for (const [page, html] of Object.entries(rewritePages(pages, targets))) writeFileSync(path.join(root, page), html);
  const sorted = Object.fromEntries(Object.keys(next).sort().map((k) => [k, next[k]]));
  writeFileSync(path.join(root, MANIFEST), JSON.stringify(sorted, null, 2) + "\n");
  return changed;
}

export function main(args, root = process.cwd()) {
  const pages = Object.fromEntries(sitePages(root).map((p) => [p, readFileSync(path.join(root, p), "utf8")]));
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
