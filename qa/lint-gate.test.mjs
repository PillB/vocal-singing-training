// chore(lint) gate tests. Each test names the wrong behaviour it rejects and
// pairs it with a valid case, so the gate cannot pass by accepting everything
// or by rejecting everything. Loopholes covered here were found by the QA
// thread executing the gate on PR #22 (fixtures/ folder name, .cjs, baseline
// growth) and are red against the PR #22 version of qa/lint-complexity.mjs.
import test from "node:test";
import assert from "node:assert/strict";
import { ESLint } from "eslint";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  classify,
  pruneBaseline,
  grownExemptions,
  projectFiles,
  violations,
  main
} from "./lint-complexity.mjs";
import { findMisplacedWaits, fixMisplacedWaits, findSwallowedWaits } from "./lint-playwright-waits.mjs";

const REPO = process.cwd();

/** A function with `branches` if-statements: modified complexity = branches + 1. */
function branchy(name, branches) {
  const ifs = Array.from({ length: branches }, (_, i) => `  if (n === ${i}) return ${i};`).join("\n");
  return `export function ${name}(n) {\n${ifs}\n  return -1;\n}\n`;
}

function tempProject(files) {
  const root = mkdtempSync(path.join(tmpdir(), "vt-lint-"));
  copyFileSync(path.join(REPO, "eslint.config.mjs"), path.join(root, "eslint.config.mjs"));
  mkdirSync(path.join(root, "qa"), { recursive: true });
  writeFileSync(path.join(root, "qa/complexity-baseline.json"), JSON.stringify({ ceiling: 15, entries: [] }));
  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    writeFileSync(path.join(root, rel), body);
  }
  return root;
}

const quiet = async (fn) => {
  const { error, log } = console;
  console.error = () => {};
  console.log = () => {};
  try {
    return await fn();
  } finally {
    console.error = error;
    console.log = log;
  }
};

test("ESLint's complexity rule accepts the low-branch positive control", async () => {
  const lint = new ESLint({ overrideConfigFile: "eslint.config.mjs" });
  const [result] = await lint.lintFiles(["qa/fixtures/complexity-good.mjs"]);
  assert.equal(result.errorCount, 0);
});

test("ESLint's complexity rule rejects the over-ceiling negative control", async () => {
  const lint = new ESLint({ overrideConfigFile: "eslint.config.mjs" });
  const [result] = await lint.lintFiles(["qa/fixtures/complexity-bad.mjs"]);
  const violationsFound = result.messages.filter((m) => m.ruleId === "complexity");
  assert.ok(violationsFound.length > 0, "an intentionally over-complex function was accepted");
  assert.match(violationsFound[0].message, /complexity of 16\. Maximum allowed is 15/);
});

test("the ceiling is exactly 15: 15 passes, 16 fails", async () => {
  const root = tempProject({ "js/at.js": branchy("at", 14), "js/over.js": branchy("over", 15) });
  const found = await violations(["js/at.js", "js/over.js"], root);
  assert.deepEqual(found.map((v) => [v.file, v.complexity]), [["js/over.js", 16]]);
});

test("editing an exempt function removes its exemption (new debt + stale entry)", () => {
  const before = { file: "js/a.js", sha: "aaa", complexity: 20, name: "f" };
  const edited = { ...before, sha: "bbb" };
  const r = classify([edited], [before]);
  assert.deepEqual(r.newDebt, [edited], "an edited legacy function kept its exemption");
  assert.deepEqual(r.stale, [before]);
  const unchanged = classify([before], [before]);
  assert.deepEqual(unchanged, { newDebt: [], stale: [] }, "an untouched exemption must still pass");
});

test("a brand-new over-ceiling function is new debt even with a large baseline", () => {
  const legacy = Array.from({ length: 50 }, (_, i) => ({ file: "js/l.js", sha: "s" + i, complexity: 30, name: "l" + i }));
  const fresh = { file: "js/new.js", sha: "zzz", complexity: 16, name: "fresh" };
  assert.deepEqual(classify([...legacy, fresh], legacy).newDebt, [fresh]);
});

test("pruning only removes: it never adds the current violations to the baseline", () => {
  const kept = { file: "js/a.js", sha: "k", complexity: 20, name: "k" };
  const fixed = { file: "js/a.js", sha: "f", complexity: 20, name: "f" };
  const fresh = { file: "js/b.js", sha: "n", complexity: 22, name: "n" };
  assert.deepEqual(pruneBaseline([kept, fixed], [kept, fresh]), [kept]);
});

test("baseline growth against the base branch is detected; shrinking is fine", () => {
  const a = { file: "js/a.js", sha: "a", complexity: 20, name: "a" };
  const b = { file: "js/b.js", sha: "b", complexity: 21, name: "b" };
  assert.deepEqual(grownExemptions([a], [a, b]), [b], "a blessed new exemption went unnoticed");
  assert.deepEqual(grownExemptions([a, b], [a]), []);
});

test("a folder merely named fixtures/ is scanned; only the exact excluded paths are skipped", () => {
  const root = tempProject({
    "js/fixtures/hidden.js": branchy("hidden", 20),
    "js/geometry/also.js": branchy("also", 20),
    "qa/fixtures/control.mjs": branchy("control", 20)
  });
  const { files } = projectFiles(root);
  assert.ok(files.includes("js/fixtures/hidden.js"), "a function dodged the gate via a folder name");
  assert.ok(files.includes("js/geometry/also.js"));
  assert.ok(!files.includes("qa/fixtures/control.mjs"), "the deliberate control must stay excluded");
});

test(".cjs is linted and .ts/.jsx cannot slip past unparsed", async () => {
  const root = tempProject({ "js/legacy.cjs": branchy("cjsFn", 20).replace("export ", ""), "js/x.ts": "let a = 1;\n" });
  const { files, unscannable } = projectFiles(root);
  assert.ok(files.includes("js/legacy.cjs"), ".cjs was not scanned");
  assert.deepEqual(unscannable, ["js/x.ts"]);
  const found = await violations(["js/legacy.cjs"], root);
  assert.equal(found.length, 1, "an over-ceiling .cjs function passed");
  assert.equal(await quiet(() => main([], root)), 1, "a .ts file in the tree must fail the gate");
});

test("end to end: the gate fails on new debt, prune keeps failing it, and the ref check catches a hand-grown baseline", async () => {
  const root = tempProject({ "js/ok.js": branchy("ok", 3), "js/bad.js": branchy("bad", 20) });
  assert.equal(await quiet(() => main([], root)), 1, "new debt passed the gate");
  assert.equal(await quiet(() => main(["--prune-baseline"], root)), 1, "prune blessed new debt");
  const base = JSON.parse(readFileSync(path.join(root, "qa/complexity-baseline.json"), "utf8"));
  assert.equal(base.entries.length, 0, "prune added an entry");

  // Simulate `git checkout main` having an empty baseline, then a PR that
  // hand-adds bad.js's exemption: the plain gate passes, the ref check must not.
  const git = (...a) => execFileSync("git", a, { cwd: root, stdio: "ignore" });
  git("init", "-q");
  git("-c", "user.email=t@t", "-c", "user.name=t", "add", "qa/complexity-baseline.json");
  git("-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "base");
  const current = await violations(["js/bad.js"], root);
  writeFileSync(path.join(root, "qa/complexity-baseline.json"), JSON.stringify({ ceiling: 15, entries: current }));
  assert.equal(await quiet(() => main([], root)), 0, "control: the exemption itself is well-formed");
  assert.equal(await quiet(() => main(["--baseline-ref", "HEAD"], root)), 1, "a grown baseline passed CI");
});

test("waitForFunction options in the arg slot are flagged and fixed; the bound form is not", () => {
  const wrong = `await page.waitForFunction(() => ok(), { timeout: 8000 });`;
  const right = `await page.waitForFunction(() => ok(), null, { timeout: 8000 });`;
  const realArg = `await page.waitForFunction((n) => n > 1, { count: 2 });`;
  assert.equal(findMisplacedWaits(wrong).length, 1);
  assert.equal(findMisplacedWaits(right).length, 0);
  assert.equal(findMisplacedWaits(realArg).length, 0, "a genuine page argument is not an options bag");
  assert.equal(fixMisplacedWaits(wrong), right);
});

test("a swallowed waitFor*().catch(() => {}) needs a stated reason", () => {
  const bare = `await page.waitForSelector("#x").catch(() => {});`;
  const reasoned = `// wait-may-fail: the next assertion checks #x\nawait page.waitForSelector("#x").catch(() => {});`;
  const handled = `await page.waitForSelector("#x").catch((e) => { throw e; });`;
  const emptyReason = `// wait-may-fail:\nawait page.waitForSelector("#x").catch(() => {});`;
  assert.equal(findSwallowedWaits(bare).length, 1);
  assert.equal(findSwallowedWaits(reasoned).length, 0);
  assert.equal(findSwallowedWaits(handled).length, 0);
  assert.equal(findSwallowedWaits(emptyReason).length, 1, "an empty reason is not a reason");
});
