// Which console errors the flow test and the audit ledger may ignore (QA-14).
// Wrong behaviours rejected: allowing every error from the account worker's
// host (a genuine 500 from /v1/events passed), and a ledger pattern that hid
// any "Failed to load resource" (a 404 on the app's own script went unseen).
// Controls: the two lines Chrome really logs for the worker refusing the test
// server's origin are ignored, so the filter is not simply rejecting everything.
import test from "node:test";
import assert from "node:assert/strict";
import envNoise from "../../qa/env-noise.cjs";

const { isEnvNoise, errorLine } = envNoise;
const WORKER = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev";
const CORS = `Access to fetch at '${WORKER}/v1/auth/methods' from origin 'http://127.0.0.1:8765' has been blocked by CORS policy: No 'Access-Control-Allow-Origin' header is present on the requested resource.`;

test("control: the two lines Chrome logs for the worker's CORS refusal are environment noise", () => {
  assert.equal(isEnvNoise(errorLine(CORS, "http://127.0.0.1:8765/index.html")), true);
  assert.equal(isEnvNoise(errorLine("Failed to load resource: net::ERR_FAILED", `${WORKER}/v1/auth/methods`)), true);
});

test("a genuine server error from the worker is the app's problem", () => {
  const line = errorLine("Failed to load resource: the server responded with a status of 500 ()", `${WORKER}/v1/events`);
  assert.equal(isEnvNoise(line), false);
  assert.equal(isEnvNoise(errorLine("Failed to load resource: the server responded with a status of 404 ()", `${WORKER}/v1/claim`)), false);
});

test("a CORS refusal from any other host is not the known one", () => {
  const other = CORS.replace("vocal-studio-entitlements.vocalstudio-pe.workers.dev", "api.example.com");
  assert.equal(isEnvNoise(errorLine(other, "http://127.0.0.1:8765/index.html")), false);
});

test("a network failure on the app's own files is the app's problem", () => {
  assert.equal(isEnvNoise(errorLine("Failed to load resource: net::ERR_FAILED", "http://127.0.0.1:8765/js/app.js")), false);
  assert.equal(isEnvNoise(errorLine("Failed to load resource: the server responded with a status of 404 (File not found)", "http://127.0.0.1:8765/js/app.js")), false);
  assert.equal(isEnvNoise(errorLine("Failed to load resource: net::ERR_NAME_NOT_RESOLVED", "http://localhost:8765/js/app.js")), false);
});

test("an offline third party (fonts, sign-in) is environment noise; an unknown url is not", () => {
  assert.equal(isEnvNoise(errorLine("Failed to load resource: net::ERR_NAME_NOT_RESOLVED", "https://fonts.googleapis.com/css2?family=Inter")), true);
  assert.equal(isEnvNoise("Failed to load resource: net::ERR_NAME_NOT_RESOLVED"), false);
});

test("script errors are never noise", () => {
  assert.equal(isEnvNoise("TypeError: x is undefined"), false);
  assert.equal(isEnvNoise(`TypeError: x is undefined at ${WORKER}/v1/auth/methods`), false);
});
