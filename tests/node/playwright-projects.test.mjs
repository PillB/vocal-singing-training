// The PR gate (`chromium` project) must stay deterministic and bounded; the
// headed watch sweeps live in the `sweep` project. Wrong behaviour these tests
// reject: a new spec that forces a visible window (headless: false) quietly
// landing in the PR gate, which is how PR #22's shard 4 ran out of time; or a
// sweep name in the config that matches no file, so the list rots unnoticed.
import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const config = require("../../playwright.config.js");
const sweep = new RegExp(config.metadata.sweepSpecs);
const specs = readdirSync("tests").filter((f) => f.endsWith(".spec.js"));
const forcesHeaded = (f) => /headless:\s*false/.test(readFileSync(`tests/${f}`, "utf8"));
const project = (name) => config.projects.find((p) => p.name === name);

test("every spec that forces a visible browser is a sweep, never a PR gate test", () => {
  const headed = specs.filter(forcesHeaded);
  assert.ok(headed.length >= 5, "control: the repo does have headed sweeps to classify");
  const leaked = headed.filter((f) => !sweep.test(f));
  assert.deepEqual(leaked, [], `headed specs in the PR gate: ${leaked.join(", ")}`);
});

test("each sweep pattern names a spec that exists", () => {
  const names = config.metadata.sweepSpecs.match(/\(\?:([^)]+)\)/)[1].split("|");
  const missing = names.filter((n) => !specs.includes(`${n}.spec.js`));
  assert.deepEqual(missing, []);
});

test("the gate ignores exactly the sweeps and the sweep project runs only them", () => {
  assert.equal(project("chromium").testIgnore.source, sweep.source);
  assert.equal(project("sweep").testMatch.source, sweep.source);
  const gate = specs.filter((f) => !sweep.test(f));
  assert.ok(gate.length > 50, "control: most specs remain in the PR gate");
  assert.ok(gate.includes("all-flows-robust.spec.js"), "the per-exercise flow matrix gates PRs");
});

test("CI never retries: a retry hides flakiness and re-runs timeouts at full cost", () => {
  assert.equal(config.retries, 0);
});
