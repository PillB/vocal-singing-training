// The cache-busting gate (qa/asset-versions.mjs). Wrong behaviours rejected:
// a script edited without a new ?v= (visitors run new HTML on a cached old
// script for up to ten minutes); two pages loading one file at two versions;
// a local script with no version at all. Each has a passing control beside it.
import test from "node:test";
import assert from "node:assert/strict";
import { check, collect, hashOf, nextVersion, main } from "../../qa/asset-versions.mjs";

const page = (v) => `<link rel="stylesheet" href="css/a.css?v=${v}" /><script src="js/b.js?v=1"></script>`;
const files = { "css/a.css": "a{}", "js/b.js": "b()" };
const read = (f) => files[f] ?? null;
const manifest = { "css/a.css": { v: "1", sha: hashOf("a{}") }, "js/b.js": { v: "1", sha: hashOf("b()") } };

test("an unchanged tree passes; a file edited without a new version fails", () => {
  assert.deepEqual(check({ "index.html": page("1") }, manifest, read), []);
  const edited = (f) => (f === "css/a.css" ? "a{color:red}" : read(f));
  assert.deepEqual(check({ "index.html": page("1") }, manifest, edited), ["css/a.css changed but is still ?v=1 (run: npm run assets:bump)"]);
});

test("a bumped version with a manifest that was not updated still fails, so the hash is always recorded", () => {
  const edited = (f) => (f === "css/a.css" ? "a{color:red}" : read(f));
  assert.match(check({ "index.html": page("2") }, manifest, edited).join(), /is \?v=2 in the pages but 1/);
  const updated = { ...manifest, "css/a.css": { v: "2", sha: hashOf("a{color:red}") } };
  assert.deepEqual(check({ "index.html": page("2") }, updated, edited), []);
});

test("pages that disagree on a version, and unversioned local assets, fail", () => {
  const { problems } = collect({ "index.html": page("1"), "guide.html": page("2") });
  assert.match(problems.join(), /css\/a\.css is \?v=1 in index\.html but \?v=2 in guide\.html/);
  const bare = collect({ "index.html": '<script src="js/b.js"></script>' });
  assert.match(bare.problems.join(), /loads js\/b\.js with no \?v=/);
  assert.deepEqual(collect({ "index.html": page("1"), "guide.html": page("1") }).problems, []);
});

test("next version: a new letter the same day, a fresh 'a' on a new day", () => {
  assert.equal(nextVersion("20261101a", "20261101"), "20261101b");
  assert.equal(nextVersion("20261101b", "20261101"), "20261101c");
  assert.equal(nextVersion("20260924e", "20261101"), "20261101a");
});

test("the repository itself is coherent: every versioned asset matches its recorded content", () => {
  const { error, log } = console;
  console.error = () => {};
  console.log = () => {};
  try {
    assert.equal(main([]), 0);
  } finally {
    console.error = error;
    console.log = log;
  }
});

// #26 added the one page in a folder (qa/index.html, the testers' page). It loads `../js/app.js` and its own
// `qa.js`. Wrong behaviours rejected below: the gate reads only a fixed list of root pages, so the folder page
// keeps an old version of a file every other page has moved past (VG-78 in #26, where its own date-based check
// was blind for the same reason); a reference is read as if the page were at the root, so `../js/b.js` is
// either missed or taken for a different file; and a bump that rewrites only the spelling the first page
// used, which leaves the folder page on the old version.
import { mkdtempSync, mkdirSync, readFileSync as readFs, writeFileSync as writeFs, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { references, sitePages, targetVersion } from "../../qa/asset-versions.mjs";

/** A throwaway site: index.html at the root, qa/index.html one folder down, and node_modules with a page in it. */
function site(rootV, qaV, qaJsV = "1") {
  const dir = mkdtempSync(path.join(tmpdir(), "vt-assets-"));
  const put = (f, text) => {
    mkdirSync(path.dirname(path.join(dir, f)), { recursive: true });
    writeFs(path.join(dir, f), text);
  };
  put("js/b.js", "b()");
  put("qa/qa.js", "q()");
  put("index.html", `<script src="js/b.js?v=${rootV}"></script>`);
  put("qa/index.html", `<script src="../js/b.js?v=${qaV}"></script><script src="qa.js?v=${qaJsV}"></script>`);
  put("node_modules/pkg/index.html", `<script src="x.js"></script>`);
  put("qa/asset-manifest.json", JSON.stringify({ "js/b.js": { v: rootV, sha: hashOf("b()") }, "qa/qa.js": { v: qaJsV, sha: hashOf("q()") } }));
  return dir;
}
const quiet = (fn) => {
  const { error, log } = console;
  console.error = () => {};
  console.log = () => {};
  try {
    return fn();
  } finally {
    console.error = error;
    console.log = log;
  }
};

test("a page in a folder: its `../` references name the root file, and its own files are versioned too", () => {
  const refs = references('<script src="../js/b.js?v=2"></script><link rel="stylesheet" href="qa.css?v=1" />', "qa/index.html");
  assert.deepEqual(refs.map((r) => [r.file, r.v]), [["js/b.js", "2"], ["qa/qa.css", "1"]]);
  // control: the same spelling from a root page is the root file, and remote or data URLs are not local files
  assert.deepEqual(references('<script src="js/b.js?v=2"></script>').map((r) => r.file), ["js/b.js"]);
  assert.deepEqual(references('<script src="https://accounts.google.com/gsi/client"></script><link href="data:text/css,a.css" />'), []);
});

test("every page the site serves is read, the folder page included, and nothing under node_modules", () => {
  const dir = site("1", "1");
  try {
    assert.deepEqual(sitePages(dir), ["index.html", "qa/index.html"]);
    assert.equal(quiet(() => main([], dir)), 0, "control: agreeing pages and an unchanged file pass");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the folder page on an older version of a file than the root page fails the check", () => {
  const dir = site("2", "1");
  try {
    assert.equal(quiet(() => main([], dir)), 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a bump moves every page to one new version, however each spells the path, and the check then passes", () => {
  const dir = site("20261101a", "20261101a");
  try {
    writeFs(path.join(dir, "js/b.js"), "b(2)");
    writeFs(path.join(dir, "qa/qa.js"), "q(2)");
    assert.equal(quiet(() => main([], dir)), 1, "control: both edits are seen before the bump");
    quiet(() => main(["--bump"], dir));
    const today = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const want = today === "20261101" ? "20261101b" : `${today}a`;
    assert.equal(readFs(path.join(dir, "index.html"), "utf8"), `<script src="js/b.js?v=${want}"></script>`);
    assert.equal(
      readFs(path.join(dir, "qa/index.html"), "utf8"),
      `<script src="../js/b.js?v=${want}"></script><script src="qa.js?v=${today}a"></script>`
    );
    assert.equal(quiet(() => main([], dir)), 0);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("pages that disagree get one version newer than any of them, even when the file did not change", () => {
  assert.equal(targetVersion(new Set(["20261104a", "20261111c"]), { v: "20261111c", sha: "s" }, "s", "20261112"), "20261112a");
  assert.equal(targetVersion(new Set(["20261112a", "20261104a"]), undefined, "s", "20261112"), "20261112b");
  // controls: agreement and an unchanged file keep the version; a changed file gets the next one
  assert.equal(targetVersion(new Set(["20261104a"]), { v: "20261104a", sha: "s" }, "s", "20261112"), "20261104a");
  assert.equal(targetVersion(new Set(["20261104a"]), { v: "20261104a", sha: "old" }, "s", "20261112"), "20261112a");
  assert.equal(targetVersion(new Set(["20261104a"]), undefined, "s", "20261112"), "20261104a");
});

test("in a git checkout the page list comes from git: a folder page is in it, an ignored one is not", async () => {
  const { execFileSync } = await import("node:child_process");
  const dir = site("1", "1");
  try {
    execFileSync("git", ["init", "-q"], { cwd: dir });
    writeFs(path.join(dir, ".gitignore"), "node_modules/\nplaywright-report/\n");
    mkdirSync(path.join(dir, "playwright-report"));
    writeFs(path.join(dir, "playwright-report/index.html"), '<script src="trace.js"></script>');
    assert.deepEqual(sitePages(dir), ["index.html", "qa/index.html"]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  // and this repository's own list holds the pages #26 added, the one in a folder included
  assert.ok(sitePages().includes("qa/index.html") && sitePages().includes("terms.html"));
});

// RT4 on PR #39: four stamps in the merged tree had once served other content. js/app.js was ?v=20261113c,
// main's live stamp for main's app.js, over the merge's split app.js, and billing.js, ads-config.js and
// session.js had taken #21's older stamps, each recorded on main for an older file. The tree was coherent,
// so the check passed; a browser holding main's cached copy would have kept it. Wrong behaviours rejected
// below: a version that once named other content passes; only the first parent of a merge is read, so the
// side a stamp came from is never seen; a bump keeps the reused stamp; a shallow CI clone passes unverified.
import { freeVersion, reuseProblems, stampHistory } from "../../qa/asset-versions.mjs";
import { execFileSync as run } from "node:child_process";

/** A git repo of one page and js/b.js; `commit(text, v)` writes b.js and records it at `v` with its true hash. */
function gitSite() {
  const dir = mkdtempSync(path.join(tmpdir(), "vt-stamps-"));
  const git = (...args) => run("git", ["-c", "user.name=t", "-c", "user.email=t@example.invalid", ...args], { cwd: dir, stdio: "pipe" }).toString();
  git("init", "-q", "-b", "main");
  const write = (text, v, sha = hashOf(text)) => {
    mkdirSync(path.join(dir, "js"), { recursive: true });
    writeFs(path.join(dir, "js/b.js"), text);
    writeFs(path.join(dir, "index.html"), `<script src="js/b.js?v=${v}"></script>`);
    mkdirSync(path.join(dir, "qa"), { recursive: true });
    writeFs(path.join(dir, "qa/asset-manifest.json"), JSON.stringify({ "js/b.js": { v, sha } }));
  };
  const commit = (text, v, msg = v) => {
    write(text, v);
    git("add", "-A");
    git("commit", "-q", "-m", msg);
  };
  return { dir, git, write, commit };
}

test("a version that once named other content fails, though the tree alone is coherent", () => {
  const s = gitSite();
  try {
    s.commit("b(1)", "20261101a");
    s.commit("b(2)", "20261101b");
    assert.equal(quiet(() => main([], s.dir)), 0, "control: each version names one content");
    // the merge-style mistake: b(2) given b(1)'s stamp, with b(2)'s hash written beside it
    s.commit("b(2)", "20261101a", "reuse");
    const problems = reuseProblems(JSON.parse(readFs(path.join(s.dir, "qa/asset-manifest.json"), "utf8")), stampHistory(s.dir), {});
    assert.deepEqual(problems, [`js/b.js is ?v=20261101a, which once served other content (${hashOf("b(1)")}); a browser that cached it keeps it (run: npm run assets:bump)`]);
    assert.equal(quiet(() => main([], s.dir)), 1);
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});

test("both sides of a merge are history: a stamp the second parent used for other content is caught", () => {
  const s = gitSite();
  try {
    s.commit("b(0)", "20261101a");
    s.git("checkout", "-q", "-b", "side");
    s.commit("b(side)", "20261102a");
    s.git("checkout", "-q", "main");
    s.commit("b(main)", "20261102b");
    s.git("merge", "-q", "-s", "ours", "--no-edit", "side");
    assert.equal(quiet(() => main([], s.dir)), 0, "control: main's 20261102b was never used for anything else");
    // the merge resolution takes the side's stamp for main's file
    s.commit("b(main)", "20261102a", "resolve");
    const history = stampHistory(s.dir);
    assert.ok(history.seen.get("js/b.js").get("20261102a").has(hashOf("b(side)")), "the side branch's manifest is read");
    assert.equal(quiet(() => main([], s.dir)), 1);
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});

test("a bump moves a reused stamp to one no manifest ever gave other content, and keeps one that names this content", () => {
  const sha = "s";
  const history = { seen: new Map([["js/b.js", new Map([["20261113c", new Set(["main"])], ["20261113d", new Set(["pr21"])], ["20261113a", new Set([sha])]])]]) };
  assert.equal(freeVersion("20261113c", history, "js/b.js", sha, "20261113"), "20261113e");
  assert.equal(freeVersion("20261103a", { seen: new Map([["js/b.js", new Map([["20261103a", new Set(["old"])]])]]) }, "js/b.js", sha, "20261113"), "20261113a");
  // controls: a version that only ever named this content stays, and so does one history never saw
  assert.equal(freeVersion("20261113a", history, "js/b.js", sha, "20261113"), "20261113a");
  assert.equal(freeVersion("20261113b", history, "js/b.js", sha, "20261113"), "20261113b");
  // and end to end: the reused stamp from the first test is bumped off, and the check then passes
  const s = gitSite();
  try {
    s.commit("b(1)", "20261101a");
    s.commit("b(2)", "20261101a", "reuse");
    quiet(() => main(["--bump"], s.dir));
    const v = JSON.parse(readFs(path.join(s.dir, "qa/asset-manifest.json"), "utf8"))["js/b.js"].v;
    assert.notEqual(v, "20261101a");
    assert.equal(readFs(path.join(s.dir, "index.html"), "utf8"), `<script src="js/b.js?v=${v}"></script>`);
    assert.equal(quiet(() => main([], s.dir)), 0);
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});

test("a shallow clone cannot rule a reused stamp out: CI fails, a local run passes and says how much it read", () => {
  const shallow = { seen: new Map(), commits: 1, shallow: true };
  assert.match(reuseProblems({}, shallow, { CI: "true" }).join(), /clone is shallow/);
  assert.deepEqual(reuseProblems({}, shallow, {}), []);
  assert.deepEqual(reuseProblems({}, { ...shallow, shallow: false }, { CI: "true" }), [], "control: full history in CI");
  const s = gitSite();
  try {
    s.commit("b(1)", "20261101a");
    s.commit("b(2)", "20261101b");
    const clone = mkdtempSync(path.join(tmpdir(), "vt-shallow-"));
    run("git", ["clone", "-q", "--depth", "1", `file://${s.dir}`, clone], { stdio: "pipe" });
    try {
      assert.equal(stampHistory(clone).shallow, true);
      assert.equal(stampHistory(s.dir).shallow, false, "control: the full repository is not shallow");
    } finally {
      rmSync(clone, { recursive: true, force: true });
    }
  } finally {
    rmSync(s.dir, { recursive: true, force: true });
  }
});
