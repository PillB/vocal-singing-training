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
 *   (sign-in, fonts), never a local file and never a host that only looks like
 *   the worker.
 *
 * Not allowed, and the reason this is narrow (QA-14, QA-16): the first version
 * let through any error from the worker's host, so a genuine 500 from
 * /v1/events passed, and the ledger's `Failed to load resource` pattern hid a
 * 404 on one of the app's own scripts. The worker is matched by its whole host,
 * read from js/billing-config.js, not by a prefix: a look-alike such as
 * vocal-studio-entitlements.evil.example is a different host.
 */
const fs = require("node:fs");
const path = require("node:path");

const WORKER_HOST = workerHost();
const CORS_REFUSAL = /Access to fetch at '([^']*)' from origin '[^']*' has been blocked by CORS policy/;
const OFFLINE = /Failed to load resource: net::ERR_(?:NAME_NOT_RESOLVED|INTERNET_DISCONNECTED)\b/;
const LOCAL_HOSTS = new Set(["127.0.0.1", "localhost"]);

/** The account worker's host, from the one place the app takes it from. Fails loudly if that changes shape. */
function workerHost() {
  const src = fs.readFileSync(path.join(__dirname, "..", "js", "billing-config.js"), "utf8");
  const m = /apiBaseUrl:\s*"([^"]+)"/.exec(src);
  if (!m) throw new Error("qa/env-noise.cjs: no apiBaseUrl in js/billing-config.js");
  return new URL(m[1]).hostname;
}

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** The URL the browser attached to a line (see errorLine), or "". */
function urlOf(line) {
  return (line.match(/ <([^<>]*)>$/) || [])[1] || "";
}

/**
 * @param {string} line see errorLine
 * @param {{local?: boolean}} [where] `local: false` when the page under test is a deployed one
 *   (BASE_URL=https://pillb.github.io/...): the worker refuses only pages it does not know, so
 *   against the real site a refusal or failed call to it is a broken sign-in, not noise.
 */
function isEnvNoise(line, { local = true } = {}) {
  const refused = CORS_REFUSAL.exec(line);
  if (refused) return local && hostOf(refused[1]) === WORKER_HOST;
  const host = hostOf(urlOf(line));
  if (/Failed to load resource: net::ERR_FAILED\b/.test(line)) return local && host === WORKER_HOST;
  if (OFFLINE.test(line)) {
    // Offline: any host that is not ours, and not one dressed up as the worker
    return host !== "" && !LOCAL_HOSTS.has(host) && (host === WORKER_HOST || !host.includes("vocal-studio-entitlements"));
  }
  return false;
}

/** The line the flow test and the audit driver record for a console message. */
function errorLine(text, url) {
  return url ? `${text} <${url}>` : text;
}

module.exports = { isEnvNoise, errorLine, WORKER_HOST };
