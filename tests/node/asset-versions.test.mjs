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
