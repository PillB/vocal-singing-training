// The audit ledger (qa/audit/analyze-audit.mjs) flags what a learner would
// hit and stays quiet on a clean run. Wrong behaviours rejected: a ledger that
// reports nothing (every check silently skipped) and one that reports noise
// (a clean record, or the account worker refusing localhost, as a finding).
import test from "node:test";
import assert from "node:assert/strict";
import { findings, QUIET_COUNTS_BY_DESIGN } from "../../qa/audit/analyze-audit.mjs";

const tick = (focus) => ({ focus, hud: "", status: "", pitch: "", cue: "" });
const clean = {
  id: "x",
  mode: "pitchMatch",
  errors: ["console: Access to fetch at 'https://vocal-studio-entitlements.vocalstudio-pe.workers.dev' blocked by CORS policy"],
  focus: [{ id: "btn-practice-start", text: "Start", inView: true, obscured: false, outline: true }],
  inventory: { overlaps: { controls: [], clipped: [] }, rows: [[{ kind: "control", inView: true, hit: "self", small: false, text: "Start" }]] },
  iterations: {
    1: { started: true, stopped: true, ticks: [tick("A 1"), tick("A 2")], gum: { live: 0 } },
    3: { silent: { scenario: "silent", ticks: [tick("Reps 0"), tick("Reps 0")] } },
    4: { afterDouble: { gum: { live: 1 } }, afterHidden: { live: true }, leavePrompt: true, afterStay: { view: "view-exercise" }, final: { gum: { live: 0 } } }
  }
};

test("a clean record yields no findings, and the worker's CORS refusal is the environment", () => {
  assert.deepEqual(findings(clean), []);
});

test("each defect is named once, under its check", () => {
  const bad = structuredClone(clean);
  bad.errors.push("pageerror: TypeError: x is undefined");
  bad.focus[0].outline = false;
  bad.inventory.rows[0][0].hit = "#highway-stage.highway";
  bad.iterations[1] = { started: false, stopped: true, ticks: [tick("A"), tick("A")], gum: { live: 0 } };
  bad.iterations[3].silent.ticks = [tick("Reps 0"), tick("Reps 3")];
  bad.iterations[4].afterDouble.gum.live = 2;
  bad.iterations[4].leavePrompt = false;
  const got = findings(bad).map(([k]) => k);
  for (const k of ["errors", "focus", "layout", "start/stop", "feedback", "quiet", "mic", "leave"]) {
    assert.ok(got.includes(k), `missing ${k} in ${JSON.stringify(findings(bad))}`);
  }
});

test("the plan has no take, and a count accepted on silence says why; other modes still flag both", () => {
  const plan = structuredClone(clean);
  plan.mode = "weekPlan";
  plan.iterations[1] = { started: false, stopped: false };
  assert.deepEqual(findings(plan), [], "the 12-week plan has no Start");
  const gate = structuredClone(clean);
  gate.mode = "concisionGate";
  gate.iterations[3].silent.ticks = [tick("Puertas abiertas 0/5"), tick("Puertas abiertas 1/5")];
  assert.deepEqual(findings(gate), []);
  assert.match(QUIET_COUNTS_BY_DESIGN.concisionGate, /pause/, "the exemption carries its reason");
  // Controls: the same records under an ordinary mode are findings
  plan.mode = gate.mode = "pitchMatch";
  assert.ok(findings(plan).some(([k]) => k === "start/stop"));
  assert.ok(findings(gate).some(([k]) => k === "quiet"));
});

test("timers are not counts: a clock that runs on silence is not progress", () => {
  const rec = structuredClone(clean);
  rec.iterations[3].silent.ticks = [tick("Reps 0 · 0:05 · 12 s"), tick("Reps 0 · 0:09 · 16 s")];
  assert.deepEqual(findings(rec), []);
});
