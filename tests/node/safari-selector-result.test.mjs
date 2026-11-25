import test from "node:test";
import assert from "node:assert/strict";
import { selectorSizeFailure } from "../../qa/safari-selector-result.mjs";

const result = (message, status = "failed") => ({ results: [{ status, errors: message ? [{ message }] : [] }] });
const report = (...tests) => ({ suites: [{ suites: [{ specs: [{ tests }] }] }] });
const size = "Error: Practicar: the design choice is 119x22, under 43.95px";

test("both designs must fail on their measured selector size", () => {
  assert.equal(selectorSizeFailure(report(result(size), result(size))), true);
  assert.equal(selectorSizeFailure(report(result(size))), false);
  assert.equal(selectorSizeFailure(report(result(size), result(null, "passed"))), false);
});

test("infrastructure failures, empty reports and unrelated assertions never count as a kill", () => {
  for (const error of ["Timed out waiting 30000ms from config.webServer", "browser closed", "the header wraps", "Test timeout exceeded"]) {
    assert.equal(selectorSizeFailure(report(result(error), result(error))), false);
    assert.equal(selectorSizeFailure(report(result(size), result(error))), false);
  }
  assert.equal(selectorSizeFailure({ ...report(result(size), result(size)), errors: [{ message: "server failed" }] }), false);
  assert.equal(selectorSizeFailure({}), false);
  assert.equal(selectorSizeFailure(report()), false);
});
