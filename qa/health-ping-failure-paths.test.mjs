/**
 * Whichever `gh` call fails, the run has to be RED, because the wrong outcome is
 * a green run that left the alert open.
 *
 * `qa/health-ping.test.mjs` proves the step can open, close and not duplicate an
 * issue, and that a failed `create` fails the run. It does not prove the other
 * three guards, and that is not a quibble: planted back, two of them pass all
 * five of its cases while leaving the alarm broken in a way nobody would see.
 * Mutants it does NOT kill (each reproduced here before this file was adopted):
 *   M2  `gh issue list ... 2>/dev/null || true` put back (a failed list reads as "no alert open")
 *   M4  `gh issue close "$existing"` without `|| exit 1`
 * Goal: whichever gh call fails, the run is RED. Wrong: a green run that left the alert open.
 *   - probe recovered, `issue list` fails: the script prints "Healthy." and never closes the open alert. Green.
 *   - probe recovered, comment ok, `issue close` fails: "Recovered; closed #7." printed, issue still open. Green.
 *   - probe failing, `issue list` fails: the script cannot know an alert exists and may open a second one.
 * A third, `gh issue comment` unguarded, was checked the same way: also survives
 * the five, also dies here.
 *
 * Found by QA round 11 (OPS-8) and adopted with its five cases unchanged; the
 * only edit is that WORKFLOW defaults to this repository's own copy, so the
 * suite can run it from any directory. VG-81.
 *
 * usage: node --test qa/health-ping-failure-paths.test.mjs   (WORKFLOW=<yml> to override)
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
// `failOn` names the one subcommand that answers HTTP 502; everything else behaves.
function run({ ok, existing = "", failOn = "" }) {
  const { script, env } = step("Open or close the alert issue");
  const dir = mkdtempSync(join(tmpdir(), "hpf-"));
  const work = mkdtempSync(join(tmpdir(), "hpfw-"));
  const log = join(dir, "gh.log");
  writeFileSync(join(dir, "gh"), `#!/bin/bash
echo "$*" >> "${log}"
sub="$1 $2"
[ "$sub" = "issue ${failOn}" ] && { echo "HTTP 502" >&2; exit 1; }
case "$sub" in
  "issue list") [ -n "${existing}" ] && echo "${existing}"; exit 0 ;;
  "issue create") echo https://github.com/PillB/vocal-singing-training/issues/99; exit 0 ;;
  *) exit 0 ;;
esac
`);
  chmodSync(join(dir, "gh"), 0o755);
  const e = { PATH: `${dir}:${process.env.PATH}`, HOME: work, GH_REPO: "PillB/vocal-singing-training" };
  for (const [k, v] of Object.entries(env)) e[k] ??= evalExpr(v, { ok: String(ok), detail: "HTTP 503" });
  const r = spawnSync("bash", ["-c", script], { cwd: work, env: e, encoding: "utf8" });
  let calls = "";
  try { calls = readFileSync(log, "utf8"); } catch { /* none */ }
  return { status: r.status, out: (r.stdout + r.stderr).trim(), calls };
}

test("CONTROL: with every gh call answering, a recovery closes #7 and the run is green", () => {
  const r = run({ ok: true, existing: "7" });
  assert.equal(r.status, 0, r.out);
  assert.ok(r.calls.includes("issue close 7"));
});
test("recovered, but `gh issue list` fails: the run is red (an open alert may never be closed)", () => {
  const r = run({ ok: true, failOn: "list" });
  assert.notEqual(r.status, 0, `green run, said: ${r.out.split("\n").pop()}`);
});
test("failing probe, but `gh issue list` fails: the run is red and no second alert is opened blind", () => {
  const r = run({ ok: false, failOn: "list" });
  assert.notEqual(r.status, 0, `green run, said: ${r.out.split("\n").pop()}`);
  assert.ok(!r.calls.split("\n").some((l) => l.startsWith("issue create")), "opened an alert without knowing whether one exists");
});
test("recovered, comment ok, `gh issue close` fails: the run is red (the issue is still open)", () => {
  const r = run({ ok: true, existing: "7", failOn: "close" });
  assert.notEqual(r.status, 0, `green run, said: ${r.out.split("\n").pop()}`);
});
test("recovered, `gh issue comment` fails: the run is red", () => {
  const r = run({ ok: true, existing: "7", failOn: "comment" });
  assert.notEqual(r.status, 0, `green run, said: ${r.out.split("\n").pop()}`);
});
