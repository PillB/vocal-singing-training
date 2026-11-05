// QA-57. Playwright reports a skipped test as a success, and six specs ended in `test.skip()` when the page API they
// drive was missing, so a rename of that API (with its callers updated) turned their tests into skips: green, checking
// nothing, for ever. qa/no-skips-reporter.cjs fails the run on a skip that no reviewer accepted.
//
// Wrong behaviours rejected here:
//   - a skipped test outside the reviewed list passes the run (the reporter does nothing);
//   - the reporter rejects everything, including the skips that are by design (it would be turned off the first time CI
//     went red on it);
//   - the reviewed list grows or rots unseen (an entry for a spec that no longer skips, or a new entry nobody read);
//   - the reporter is written and never registered (the config's reporter list is what CI runs).
// The last test runs the real Playwright runner on a throwaway project: a spec that skips must fail the run and be named,
// a spec that passes must not, and a skip in an allow-listed spec must not.
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const Reporter = require("../../qa/no-skips-reporter.cjs");
const config = require("../../playwright.config.js");
const reporterPath = require.resolve("../../qa/no-skips-reporter.cjs");

const fake = (file, title, status = "skipped") => [
  { title, location: { file: `/repo/tests/${file}` }, outcome: () => status },
  { status }
];
const run = (...cases) => {
  const r = new Reporter();
  for (const [t, res] of cases) r.onTestEnd(t, res);
  const out = [];
  const real = process.stderr.write;
  process.stderr.write = (s) => (out.push(String(s)), true);
  try {
    return { result: r.onEnd(), said: out.join("") };
  } finally {
    process.stderr.write = real;
  }
};

test("a skipped test outside the reviewed list fails the run and is named", () => {
  const { result, said } = run(fake("i18n-copy.spec.js", "breathS mode HUD uses localized phase labels"));
  assert.deepEqual(result, { status: "failed" });
  assert.match(said, /i18n-copy\.spec\.js: breathS mode HUD uses localized phase labels/);
});

test("control: passed and failed tests, and no tests at all, do not trip it", () => {
  assert.equal(run(fake("a.spec.js", "ok", "passed")).result, undefined);
  assert.equal(run(fake("a.spec.js", "bad", "failed")).result, undefined);
  assert.equal(run().result, undefined);
});

test("control: the skips that are by design do not trip it, and a neighbour in the same file does", () => {
  assert.equal(run(fake("live-pages.spec.js", "home loads")).result, undefined);
  assert.equal(run(fake("auth.spec.js", "login success with secrets file (if present) as admin")).result, undefined);
  assert.equal(run(fake("auth.spec.js", "tester account gets Pro without admin panel")).result, undefined);
  assert.deepEqual(run(fake("auth.spec.js", "login UI opens and rejects bad password")).result, { status: "failed" });
});

test("a skip is recognised from the test's outcome as well as the attempt's status", () => {
  const t = fake("x.spec.js", "outcome only", "skipped");
  t[1] = { status: "passed" };
  assert.deepEqual(run(t).result, { status: "failed" });
});

test("the reviewed list is exactly the one a reviewer read, and each entry still names a spec that skips", () => {
  assert.deepEqual(
    Reporter.ALLOWED.map((a) => `${a.file} ${a.title.source}`),
    ["live-pages.spec.js .", "auth.spec.js login success with secrets file", "auth.spec.js tester account gets Pro without admin panel"]
  );
  for (const a of Reporter.ALLOWED) {
    assert.ok(a.why.length > 20, `${a.file}: a reason is written`);
    assert.match(readFileSync(new URL(`../${a.file}`, import.meta.url), "utf8"), /\.skip\b/, `${a.file} still skips, or its entry is stale`);
  }
});

test("the reporter is registered where CI reads it (playwright.config.js)", () => {
  const names = config.reporter.map((r) => String(Array.isArray(r) ? r[0] : r));
  assert.ok(names.some((n) => /no-skips-reporter\.cjs$/.test(n)), `reporters: ${names.join(", ")}`);
});

test("the real runner: a spec that skips fails the run and is named; one that passes, or skips by design, does not", () => {
  const dir = mkdtempSync(join(tmpdir(), "no-skips-"));
  try {
    const pw = JSON.stringify(require.resolve("@playwright/test"));
    const spec = (body) => `const { test } = require(${pw});\n${body}\n`;
    writeFileSync(join(dir, "guarded.spec.js"), spec('test("guard that gives up", async () => { test.skip(); });'));
    writeFileSync(join(dir, "fine.spec.js"), spec('test("passes", async () => {});'));
    writeFileSync(join(dir, "live-pages.spec.js"), spec('test.describe.skip("live", () => { test("by design", async () => {}); });'));
    writeFileSync(join(dir, "playwright.config.js"), `module.exports = { testDir: ${JSON.stringify(dir)}, reporter: [[${JSON.stringify(reporterPath)}]], projects: [{ name: "x" }] };\n`);
    const go = (...files) => spawnSync(process.execPath, [require.resolve("@playwright/test/cli"), "test", "-c", join(dir, "playwright.config.js"), ...files], { cwd: dir, encoding: "utf8", env: { ...process.env, CI: "" } });

    const skipped = go("guarded.spec.js");
    assert.notEqual(skipped.status, 0, `a skipped test must fail the run\n${skipped.stdout}${skipped.stderr}`);
    assert.match(skipped.stderr, /guarded\.spec\.js: guard that gives up/);

    const fine = go("fine.spec.js");
    assert.equal(fine.status, 0, `control: a passing spec passes\n${fine.stdout}${fine.stderr}`);

    const byDesign = go("live-pages.spec.js");
    assert.equal(byDesign.status, 0, `control: live-pages is skipped by design\n${byDesign.stdout}${byDesign.stderr}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
