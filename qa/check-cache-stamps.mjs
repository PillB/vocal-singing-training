/**
 * Every local script and stylesheet is served from GitHub Pages with a `?v=`
 * stamp, and the stamp is a date: `js/app.js?v=20261104a`. Pages sets a long
 * cache lifetime on the asset itself, so the stamp is the only thing that tells
 * a returning browser to fetch the new file. A file changed without its stamp
 * bumped reaches nobody who has been here before.
 *
 * That is not hypothetical. On 2026-11-04 six files on this branch were stale,
 * including the whole ad red-team (`js/ads.js`, `js/ads-config.js`), the bug
 * report form (`js/reports.js`) and `css/styles.css`. Two earlier commits on
 * the same branch had done the bump by hand and the habit then lapsed, which is
 * what a habit does.
 *
 * The first version of this file read `readdirSync(ROOT)`, which is the top
 * level and nothing else, so `qa/index.html` was invisible to it — and that is
 * the one page that loads its scripts through `../`, which is to say the one
 * page a top-level scan cannot see. It was two stamps behind the app at the
 * moment this check was written and reported a pass. `tests/reports.spec.js`
 * caught it; a node gate that needs a browser run to cover its own blind spot
 * is not a gate. Pages are now found recursively and every reference is
 * resolved against the directory of the page that makes it, so one file loaded
 * as `js/app.js` from the root and `../js/app.js` from a folder is one key.
 *
 * So: three things are asserted, in rising strength.
 *   1. Every local js/css reference carries a `?v=` stamp at all.
 *   2. All references to one file, across every page, carry the same stamp.
 *   3. No file has been changed since the date in its own stamp.
 *
 * (3) reads the date out of git, so it needs history. A shallow clone answers
 * nothing for a path, and that is reported as skipped rather than failed: a
 * check that fails for want of history teaches people to ignore it. An
 * uncommitted change counts as today, which is the point — bump the stamp in
 * the commit that changes the file, not afterwards.
 */
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const REF = /(?:src|href)="((?:\.{0,2}\/)*(?:js|css)\/[A-Za-z0-9_.-]+)(\?v=([0-9]{8})([a-z]*))?"/g;
const IGNORED = new Set(["node_modules", "test-results", "playwright-report", ".git"]);

/** Every page in the repository, as a repo-relative path with forward slashes. */
const findPages = (dir = ROOT) =>
  fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return IGNORED.has(e.name) ? [] : findPages(full);
      return e.isFile() && e.name.endsWith(".html") ? [path.relative(ROOT, full).split(path.sep).join("/")] : [];
    })
    .sort();

const pages = findPages();
const failures = [];
const expectNone = (what, offenders) => {
  if (offenders.length) failures.push(`${what}: ${offenders.join(", ")}`);
};

/** The date git last changed this path, as YYYYMMDD, or "" when unknown. */
const lastChanged = (rel) => {
  try {
    const dirty = execFileSync("git", ["status", "--porcelain", "--", rel], { cwd: ROOT, encoding: "utf8" }).trim();
    if (dirty) {
      const now = new Date();
      return `${now.getUTCFullYear()}${String(now.getUTCMonth() + 1).padStart(2, "0")}${String(now.getUTCDate()).padStart(2, "0")}`;
    }
    return execFileSync("git", ["log", "-1", "--format=%cd", "--date=format:%Y%m%d", "--", rel], {
      cwd: ROOT,
      encoding: "utf8"
    }).trim();
  } catch {
    return "";
  }
};

const seen = new Map();
const unstamped = [];
for (const page of pages) {
  const html = fs.readFileSync(path.join(ROOT, page), "utf8");
  for (const m of html.matchAll(REF)) {
    const [, link, stamped, date] = m;
    // `../js/app.js` on qa/index.html and `js/app.js` on index.html are the
    // same file; keyed by the link they would be two, and agree trivially.
    const rel = path
      .relative(ROOT, path.resolve(path.dirname(path.join(ROOT, page)), link))
      .split(path.sep)
      .join("/");
    if (!stamped) {
      unstamped.push(`${link} in ${page}`);
      continue;
    }
    if (!seen.has(rel)) seen.set(rel, new Map());
    const stamp = stamped.slice(3);
    const where = seen.get(rel);
    if (!where.has(stamp)) where.set(stamp, []);
    where.get(stamp).push(page);
    where.get(stamp).date = date;
  }
}

expectNone("a local script or stylesheet is served with no cache stamp", unstamped);
expectNone(
  "one file is served under two different cache stamps, so some pages get the old one",
  [...seen].filter(([, m]) => m.size > 1).map(([rel, m]) => `${rel} (${[...m.keys()].join(" / ")})`)
);
expectNone(
  "a page references a file that is not in the repository",
  [...seen.keys()].filter((rel) => !fs.existsSync(path.join(ROOT, rel)))
);

const skipped = [];
const stale = [];
for (const [rel, stamps] of seen) {
  if (stamps.size !== 1 || !fs.existsSync(path.join(ROOT, rel))) continue;
  const stamp = [...stamps.keys()][0];
  const date = stamp.slice(0, 8);
  const changed = lastChanged(rel);
  if (!changed) {
    skipped.push(rel);
    continue;
  }
  if (changed > date) stale.push(`${rel} (stamp ${stamp}, changed ${changed})`);
}
expectNone("a file has changed since its cache stamp, so returning visitors keep the old one", stale);

if (failures.length) {
  for (const f of failures) console.error(`FAIL  ${f}`);
  console.error(`\nCACHE_STAMP_CHECK_FAIL ${failures.length} of 4 checks`);
  process.exit(1);
}
console.log(
  `CACHE_STAMP_CHECK_PASS 4 checks · ${seen.size} files · ${pages.length} pages` +
    (skipped.length ? ` · ${skipped.length} skipped for want of git history` : "")
);
