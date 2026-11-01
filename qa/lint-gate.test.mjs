import test from "node:test";
import assert from "node:assert/strict";
import { ESLint } from "eslint";

test("parser-backed complexity gate accepts the low-branch positive control", async () => {
  const lint = new ESLint({ overrideConfigFile: "eslint.config.mjs" });
  const [result] = await lint.lintFiles(["qa/fixtures/complexity-good.mjs"]);
  assert.equal(result.errorCount, 0);
});

test("parser-backed complexity gate rejects the over-ceiling negative control", async () => {
  const lint = new ESLint({ overrideConfigFile: "eslint.config.mjs" });
  const [result] = await lint.lintFiles(["qa/fixtures/complexity-bad.mjs"]);
  const violations = result.messages.filter((m) => m.ruleId === "complexity");
  assert.ok(violations.length > 0, "an intentionally over-complex function was accepted");
  assert.match(violations[0].message, /complexity of 16\. Maximum allowed is 15/);
});
