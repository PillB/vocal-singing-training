/**
 * The one push alert docs/43 §4.1 relies on, run as written.
 *
 * Goal. When the probe step says the worker is not working, a GitHub issue is opened (which emails the owner); when it
 * says it is working again, the issue is closed; and a run in which the issue could not be opened is RED, so the run
 * history shows it. Wrong behaviour: a job that is green, prints "Opened a new alert issue." and opened nothing.
 *
 * `gh` resolves the repository from `GH_REPO` or from a git checkout. The job has no `actions/checkout`, so without
 * GH_REPO every gh call fails ("failed to run git: fatal: not a git repository", reproduced with gh 2.89.0 with
 * GITHUB_REPOSITORY set and no .git). The script has no `set -e` and swallows `gh issue list`'s stderr, so the failure
 * is invisible. The fake `gh` below fails exactly that way.
 *
 * Confirmed against the real tool rather than taken on trust: gh 2.89.0, in a
 * directory with no `.git`, answers `gh issue list` with exactly "failed to run
 * git: fatal: not a git repository", and `GITHUB_REPOSITORY` — which Actions
 * always sets — does not help, because gh reads only `GH_REPO` or `--repo`.
 *
 * Found by QA round 10 (OPS-6) and adopted here with its five cases unchanged;
 * the only edit is that WORKFLOW now defaults to this repository's own copy, so
 * the suite can run it from any directory. VG-75.
 *
 * usage: node --test qa/health-ping.test.mjs   (WORKFLOW=<path> to override)
 */
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL(".", import.meta.url)), "..");
const WORKFLOW = process.env.WORKFLOW || join(ROOT, ".github/workflows/health-ping.yml");
const text = readFileSync(WORKFLOW, "utf8");

/** The `run: |` block and the `env:` map of the step whose name starts with `name`. */
function step(name) {
  const at = text.indexOf(`- name: ${name}`);
  assert.ok(at >= 0, `no step called ${name}`);
  const rest = text.slice(at + 1);
  const next = rest.search(/\n {6}- name: /);
  const body = next === -1 ? rest : rest.slice(0, next);
  const run = /\n {8}run: \|\n([\s\S]*)$/.exec(body);
  assert.ok(run, "the step has a run block");
  const script = run[1].split("\n").map((l) => l.replace(/^ {10}/, "")).join("\n");
  const envBlock = /\n {8}env:\n((?: {10}.*\n)+)/.exec(body);
  const env = {};
  for (const line of (envBlock ? envBlock[1] : "").split("\n")) {
    const m = /^ {10}(\w+): (.*)$/.exec(line);
    if (m) env[m[1]] = m[2];
  }
  return { script, env };
}

/** Evaluate the few `${{ }}` expressions the step uses. */
function evalExpr(value, outputs) {
  return value.replace(/\$\{\{\s*([^}]+?)\s*\}\}/g, (_, e) => {
    if (e === "secrets.GITHUB_TOKEN") return "token";
    if (e === "github.repository") return "PillB/vocal-singing-training";
    if (e === "github.server_url") return "https://github.com";
    if (e === "github.run_id") return "1";
    const o = /^steps\.probe\.outputs\.(\w+)$/.exec(e);
    if (o) return outputs[o[1]] ?? "";
    throw new Error(`the test does not know ${e}`);
  });
}

/** A `gh` that behaves like the real one about repository resolution, and logs what it was asked to do. */
function fakeGh(dir, { existing = "", createFails = false } = {}) {
  const log = join(dir, "gh.log");
  writeFileSync(join(dir, "gh"), `#!/bin/bash
echo "$*" >> "${log}"
if [ -z "\${GH_REPO:-}" ] && [ ! -d .git ]; then echo "failed to run git: fatal: not a git repository (or any of the parent directories): .git" >&2; exit 1; fi
case "$1 $2" in
  "issue list") [ -n "${existing}" ] && echo "${existing}"; exit 0 ;;
  "issue create") ${createFails ? "echo 'HTTP 500' >&2; exit 1" : "echo https://github.com/PillB/vocal-singing-training/issues/99; exit 0"} ;;
  *) exit 0 ;;
esac
`);
  chmodSync(join(dir, "gh"), 0o755);
  return log;
}

function runAlert({ ok, existing, createFails }) {
  const { script, env } = step("Open or close the alert issue");
  const dir = mkdtempSync(join(tmpdir(), "hp-"));
  const work = mkdtempSync(join(tmpdir(), "hpw-"));
  const log = fakeGh(dir, { existing, createFails });
  const outputs = { ok: String(ok), detail: "HTTP 503 from /v1/health?probe=1." };
  const e = { PATH: `${dir}:${process.env.PATH}`, HOME: work };
  for (const [k, v] of Object.entries(env)) e[k] = evalExpr(v, outputs);
  const r = spawnSync("bash", ["-c", script], { cwd: work, env: e, encoding: "utf8" });
  let calls = "";
  try { calls = readFileSync(log, "utf8"); } catch { /* none */ }
  return { status: r.status, out: r.stdout + r.stderr, calls };
}

test("a failing probe opens an alert issue", () => {
  const r = runAlert({ ok: false, existing: "" });
  const created = r.calls.split("\n").some((l) => l.startsWith("issue create")) && !/not a git repository/.test(r.calls);
  assert.equal(r.status, 0, r.out);
  // the fake logs every call; success is a create call that the fake did not refuse
  assert.ok(created && !/failed to run git/.test(r.out), `no issue was opened; the step said: ${r.out.trim().split("\n").pop()} (gh calls: ${r.calls.trim().replace(/\n/g, " | ")})`);
});

test("a probe that recovers closes the open alert issue", () => {
  const r = runAlert({ ok: true, existing: "7" });
  assert.ok(r.calls.split("\n").some((l) => l.startsWith("issue close 7")), `#7 was not closed; the step said: ${r.out.trim()}`);
});

test("a failing probe with an alert already open does not open a second one", () => {
  const r = runAlert({ ok: false, existing: "7" });
  assert.ok(!r.calls.split("\n").some((l) => l.startsWith("issue create")), "a second alert was opened");
  assert.match(r.out, /already open/, `the step did not find #7: ${r.out.trim()}`);
});

test("a run in which the issue could not be opened is red, not green", () => {
  // GH_REPO is supplied here so that this isolates the exit status from the repository question
  const { script, env } = step("Open or close the alert issue");
  const dir = mkdtempSync(join(tmpdir(), "hp-"));
  const work = mkdtempSync(join(tmpdir(), "hpw-"));
  fakeGh(dir, { createFails: true });
  const e = { PATH: `${dir}:${process.env.PATH}`, HOME: work, GH_REPO: "PillB/vocal-singing-training" };
  for (const [k, v] of Object.entries(env)) e[k] ??= evalExpr(v, { ok: "false", detail: "x" });
  const r = spawnSync("bash", ["-c", script], { cwd: work, env: e, encoding: "utf8" });
  assert.notEqual(r.status, 0, `gh issue create failed and the job still passed: ${(r.stdout + r.stderr).trim().split("\n").pop()}`);
});

test("CONTROL: with the repository named (GH_REPO), the same script opens the issue, so the fake is not rigged", () => {
  const { script, env } = step("Open or close the alert issue");
  const dir = mkdtempSync(join(tmpdir(), "hp-"));
  const work = mkdtempSync(join(tmpdir(), "hpw-"));
  const log = fakeGh(dir);
  const e = { PATH: `${dir}:${process.env.PATH}`, HOME: work, GH_REPO: "PillB/vocal-singing-training" };
  for (const [k, v] of Object.entries(env)) e[k] ??= evalExpr(v, { ok: "false", detail: "x" });
  const r = spawnSync("bash", ["-c", script], { cwd: work, env: e, encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  assert.ok(readFileSync(log, "utf8").split("\n").some((l) => l.startsWith("issue create")));
});
