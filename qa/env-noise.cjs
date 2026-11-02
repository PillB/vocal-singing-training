/**
 * Which browser-console errors are the test environment's doing and not the
 * app's. Shared by the flow test (tests/all-flows-robust.spec.js) and the
 * forensic audit ledger (qa/audit/analyze-audit.mjs), so both ignore the same
 * two things and nothing else.
 *
 * A line is `<console text> <<url the browser attached>>`, e.g.
 *   Failed to load resource: net::ERR_FAILED <https://vocal-studio-entitlements.x.workers.dev/v1/auth/methods>
 *
 * Allowed:
 * - The account worker refusing a page served from 127.0.0.1 (checked
 *   2026-11-01: it answers Access-Control-Allow-Origin: https://pillb.github.io
 *   only). Chrome logs two lines for it: the CORS message naming the worker, and
 *   "Failed to load resource: net::ERR_FAILED" with the worker's URL.
 * - A third-party host that cannot be resolved because the machine is offline
 *   (fonts, Google sign-in), never a local file.
 *
 * Not allowed, and the reason this is narrow (QA-14): the first version let
 * through any error from the worker's host, so a genuine 500 from /v1/events
 * passed, and the ledger's `Failed to load resource` pattern hid a 404 on one
 * of the app's own scripts.
 */
const WORKER = "https://vocal-studio-entitlements.";
const CORS_REFUSAL = /Access to fetch at 'https:\/\/vocal-studio-entitlements\.[^']*' from origin '[^']*' has been blocked by CORS policy/;
const LOCAL = /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::|\/|$)/;

function urlOf(line) {
  return (line.match(/ <([^<>]*)>$/) || [])[1] || "";
}

function isEnvNoise(line) {
  if (CORS_REFUSAL.test(line)) return true;
  const url = urlOf(line);
  if (/Failed to load resource: net::ERR_FAILED\b/.test(line)) return url.startsWith(WORKER);
  if (/Failed to load resource: net::ERR_(?:NAME_NOT_RESOLVED|INTERNET_DISCONNECTED)\b/.test(line)) {
    return url !== "" && !LOCAL.test(url);
  }
  return false;
}

/** The line the flow test and the audit driver record for a console message. */
function errorLine(text, url) {
  return url ? `${text} <${url}>` : text;
}

module.exports = { isEnvNoise, errorLine };
