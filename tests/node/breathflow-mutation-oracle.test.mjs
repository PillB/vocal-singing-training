import test from "node:test";
import assert from "node:assert/strict";
import { behaviorDetected, diagnosticTail } from "../../qa/breathflow-oracle.mjs";

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
test("BF-M13 recognizes a genuine 320px overflow while rejecting unrelated CI errors", () => {
  const mutant = { id: "BF-M13 phrase comparison ignores narrow viewports",
    name: "phrase contrast fits narrow mobile and enlarged type without clipping" };
  const actual = [
    "1) [chromium] › tests/breathflow.spec.js:95:1 › " + mutant.name,
    'Error: {"width":320,"layout":{"overflow":true,"cardWidths":[550,550],"buttonHeights":[68.625,68.625]}}',
    "expect(received).toBe(expected) // Object.is equality",
    "Expected: false",
    "Received: true",
    "at tests/breathflow.spec.js:110:64"
  ].join("\n");
  assert.equal(behaviorDetected(mutant, { status: 1 }, actual), true);
  assert.equal(behaviorDetected(mutant, { status: 1 }, actual.replace('"overflow":true', '"overflow":false')), false);
  assert.equal(behaviorDetected(mutant, { status: 1 }, actual.replace(mutant.name, "unrelated test")), false);
  assert.equal(behaviorDetected({ ...mutant, id: "BF-M0 unrelated" }, { status: 1 }, actual), false);
  assert.equal(behaviorDetected(mutant, { status: 1 }, actual + "\nNo tests found"), false);
  assert.equal(behaviorDetected(mutant, { status: 1 }, actual + "\nSyntaxError"), false);
  assert.equal(behaviorDetected(mutant, { status: 124 }, actual), false);
  assert.equal(behaviorDetected(mutant, { status: null, signal: "SIGTERM" }, actual), false);
});

test("browser source mutants require a named Playwright assertion, not just an exit", () => {
  assert.equal(behaviorDetected(browser, { status: 1 },
    browser.name + "\nError: expect(received).toBe(expected)"), true);
  assert.equal(behaviorDetected(browser, { status: 1 },
    browser.name + "\nError: No tests found\nError: expect(received)"), false);
  assert.equal(behaviorDetected(browser, { status: 1 }, "Error: expect(received)"), false);
});

test("asset request noise cannot hide the failing assertion and server errors remain visible", () => {
  const assertion = "Error: expect(received).toBe(expected)\nExpected: 70\nReceived: undefined";
  const noise = Array(150).fill('[WebServer] 127.0.0.1 - "GET /js/app.js HTTP/1.1" 200 -').join("\n");
  const result = diagnosticTail(assertion + "\n" + noise + '\n[WebServer] "GET /bad.js HTTP/1.1" 500 -');
  assert.match(result, /Expected: 70/);
  assert.match(result, /Received: undefined/);
  assert.match(result, /500 -/);
  assert.doesNotMatch(result, /200 -/);
});
