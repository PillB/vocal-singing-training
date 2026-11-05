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
  errors: [
    "console: Access to fetch at 'https://vocal-studio-entitlements.vocalstudio-pe.workers.dev/v1/auth/methods' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' <http://127.0.0.1:8765/index.html>",
    "console: Failed to load resource: net::ERR_FAILED <https://vocal-studio-entitlements.vocalstudio-pe.workers.dev/v1/auth/methods>"
  ],
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

test("the worker's genuine failures and the app's own missing files are findings, not environment noise (QA-14)", () => {
  const bad = structuredClone(clean);
  bad.errors.push("console: Failed to load resource: the server responded with a status of 500 () <https://vocal-studio-entitlements.vocalstudio-pe.workers.dev/v1/events>");
  bad.errors.push("console: Failed to load resource: the server responded with a status of 404 (File not found) <http://127.0.0.1:8765/js/app.js>");
  const got = findings(bad).filter(([k]) => k === "errors");
  assert.equal(got.length, 2, JSON.stringify(got));
});

test("a run that threw is a finding in every mode, including the two with an exemption (red-team 5, 11)", () => {
  const week = { mode: "weekPlan", iterations: { 1: { failure: "page crashed", started: false, stopped: false } } };
  assert.deepEqual(findings(week), [["start/stop", "iteration 1 (mouse) threw: page crashed"]], "the plan has no Start to miss, but a crash is still one");
  const gate = { mode: "concisionGate", iterations: { 3: { failure: "page crashed" } } };
  assert.deepEqual(findings(gate), [["quiet", "boundary run threw: page crashed"]]);
  // The exemption itself is unchanged: its count may rise on silence, and no missing Start is reported for the plan
  const rising = { mode: "concisionGate", iterations: { 3: { silent: { scenario: "silent", ticks: [tick("Reps 0"), tick("Reps 3")] } } } };
  assert.deepEqual(findings(rising), []);
});

test("against a deployed page the worker's refusal is a broken sign-in, not the test server's origin (red-team 9)", () => {
  const refusal = [
    "console: Access to fetch at 'https://vocal-studio-entitlements.vocalstudio-pe.workers.dev/v1/auth/methods' from origin 'https://pillb.github.io' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' <https://pillb.github.io/vocal-singing-training/>",
    "console: Failed to load resource: net::ERR_FAILED <https://vocal-studio-entitlements.vocalstudio-pe.workers.dev/v1/auth/methods>"
  ];
  const rec = (local) => ({ ...structuredClone(clean), errors: refusal, ...(local === undefined ? {} : { local }) });
  assert.deepEqual(findings(rec(undefined)), [], "control: the same lines from a local page are noise");
  assert.equal(findings(rec(false)).filter(([k]) => k === "errors").length, 2);
});
