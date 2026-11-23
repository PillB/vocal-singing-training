import test from "node:test";
import assert from "node:assert/strict";
import { behaviorDetected } from "../../qa/breathflow-oracle.mjs";

const node = { node: true, name: "WebKit and emulated iPhone execute the BreathFlow lesson" };
const browser = { name: "first-use lesson teaches body and mouth before enabling Start" };
const failure = `✖ WebKit and emulated iPhone execute the BreathFlow lesson
test at tests/node/playwright-projects.test.mjs:69:1
AssertionError [ERR_ASSERTION]: webkit must run BreathFlow learning and two-tab storage tests, not report 'No tests found'
false !== true`;

test("BF-M9: a real Node 24 WebKit-selection assertion kills the mutant", () => {
  assert.equal(behaviorDetected(node, { status: 1 }, failure), true);
});
test("runner failures, syntax, mismatched assertions and signals do not kill a mutant", () => {
  assert.equal(behaviorDetected(node, { status: 1 }, "Error: No tests found"), false);
  assert.equal(behaviorDetected(node, { status: 1 }, failure + "\nSyntaxError"), false);
  assert.equal(behaviorDetected(node, { status: 1 },
    "✖ WebKit and emulated iPhone execute the BreathFlow lesson\nAssertionError [ERR_ASSERTION]: unrelated\ntests/node/playwright-projects.test.mjs"), false);
  assert.equal(behaviorDetected(node, { status: null, signal: "SIGTERM" }, failure), false);
});
test("browser source mutants require a named Playwright assertion, not just an exit", () => {
  assert.equal(behaviorDetected(browser, { status: 1 },
    browser.name + "\nError: expect(received).toBe(expected)"), true);
  assert.equal(behaviorDetected(browser, { status: 1 },
    browser.name + "\nError: No tests found\nError: expect(received)"), false);
  assert.equal(behaviorDetected(browser, { status: 1 }, "Error: expect(received)"), false);
});
