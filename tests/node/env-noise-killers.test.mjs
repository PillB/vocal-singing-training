// QA-16. tests/node/env-noise.test.mjs left three mutants of qa/env-noise.cjs alive:
//   N1  "Failed to load resource: net::ERR_FAILED" ignored for ANY https host
//   N5  the worker prefix widened to a bare "https://"
//   N3  ERR_INTERNET_DISCONNECTED no longer counted as offline noise
// and one real hole: the worker is matched by string prefix, so a look-alike host
// ("https://vocal-studio-entitlements.evil.example") is treated as the worker.
// Correct: only the worker's own host (and offline third parties) are noise.
// Wrong: a failed load from any other host hides behind the worker's allowance.
import test from "node:test";
import assert from "node:assert/strict";
import envNoise from "../../qa/env-noise.cjs";

const { isEnvNoise, errorLine } = envNoise;
const FAILED = "Failed to load resource: net::ERR_FAILED";

test("control: the worker's own failed load is noise", () => {
  assert.equal(isEnvNoise(errorLine(FAILED, "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev/v1/events")), true);
});
test("a failed load from another https host is the app's problem (kills N1, N5)", () => {
  assert.equal(isEnvNoise(errorLine(FAILED, "https://cdn.other.example/lib.js")), false);
});
test("a look-alike host is not the worker", () => {
  assert.equal(isEnvNoise(errorLine(FAILED, "https://vocal-studio-entitlements.evil.example/v1/events")), false);
});
test("an offline third party reported as disconnected is noise (kills N3)", () => {
  assert.equal(isEnvNoise(errorLine("Failed to load resource: net::ERR_INTERNET_DISCONNECTED", "https://fonts.googleapis.com/css2")), true);
});
