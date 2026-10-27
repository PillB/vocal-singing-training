/**
 * The site's own browser code (js/license.js and js/billing.js), loaded into a
 * fresh sandbox per page load and talking to this worker's router.
 *
 * The worker deploys on its own, so the client in front of it is whatever the
 * site last shipped: these files as they stand in the repository. Driving
 * them, rather than a model of them, is what shows what a customer's browser
 * does with an answer: which refusals it forgets a license over, and which
 * checkouts it keeps trying to claim.
 *
 * Each `loadPage` call is one page load: new scripts, new in-memory state, the
 * same localStorage. No network, no DOM.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

import { buildJwks } from "../src/license.js";
import { handleRequest } from "../src/index.js";

const SITE_JS = new URL("../../../js/", import.meta.url);
const LICENSE_JS = readFileSync(fileURLToPath(new URL("license.js", SITE_JS)), "utf8");
const BILLING_JS = readFileSync(fileURLToPath(new URL("billing.js", SITE_JS)), "utf8");

/** Where the sandboxed site is served from (must equal env.SITE_ORIGIN). */
const API_BASE = "https://entitlements.test";

/**
 * A Storage-shaped object over a Map.
 * @param {Map<string, string>} map Backing store, shared across page loads.
 * @returns {Object} getItem/setItem/removeItem.
 */
function storageOver(map) {
  return {
    getItem: (key) => (map.has(key) ? map.get(key) : null),
    setItem: (key, value) => map.set(key, String(value)),
    removeItem: (key) => map.delete(key)
  };
}

/**
 * Load the site's license and billing scripts once, as one page load would.
 * @param {Object} env Worker env bindings the page's requests reach.
 * @param {{storage: Map<string, string>, search?: string}} browser The
 *   browser's localStorage (kept between loads) and the page's query string.
 * @returns {Promise<{license: Object, billing: Object, settle: function(): Promise<void>}>}
 *   The page's VTLicense and VTBilling, and a wait for its requests to finish.
 */
export async function loadPage(env, browser) {
  const jwks = await buildJwks(env);
  let inFlight = 0;
  /**
   * Count an asynchronous call the page makes, so settle() can wait for it.
   * @param {function(...*): Promise<*>} fn The call.
   * @returns {function(...*): Promise<*>} The same call, counted.
   */
  const tracked = (fn) => async (...args) => {
    inFlight += 1;
    try {
      return await fn(...args);
    } finally {
      inFlight -= 1;
    }
  };
  const subtle = globalThis.crypto.subtle;
  const search = browser.search || "";
  const sandbox = {
    console: { log() {}, warn() {}, error() {}, info() {} },
    Date,
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    atob,
    btoa,
    crypto: {
      getRandomValues: (array) => globalThis.crypto.getRandomValues(array),
      subtle: {
        importKey: tracked((...args) => subtle.importKey(...args)),
        verify: tracked((...args) => subtle.verify(...args))
      }
    },
    Intl,
    // The claim's retry delays run at once: what matters is how many tries
    // the page makes and what it does with the answers, not the wall clock.
    setTimeout: (fn) => {
      queueMicrotask(fn);
      return 0;
    },
    clearTimeout() {},
    navigator: { language: "en-US" },
    localStorage: storageOver(browser.storage),
    sessionStorage: storageOver(new Map()),
    location: { search, href: `${env.SITE_ORIGIN}/${search}`, pathname: "/", hash: "", origin: env.SITE_ORIGIN },
    history: { replaceState() {} },
    VT_BILLING_CONFIG: {
      demoUnlockEnabled: false,
      verification: {
        apiBaseUrl: API_BASE,
        publicKeyJwk: jwks.keys[0],
        audience: env.SITE_ORIGIN,
        required: true
      }
    },
    fetch: tracked((url, init) => handleRequest(
      new Request(url, { method: init.method, headers: init.headers, body: init.body }),
      env
    ))
  };
  sandbox.window = sandbox;
  const context = vm.createContext(sandbox);
  vm.runInContext(LICENSE_JS, context, { filename: "js/license.js" });
  vm.runInContext(BILLING_JS, context, { filename: "js/billing.js" });

  /**
   * Wait until the page has no request in flight and nothing left queued.
   * @returns {Promise<void>} Resolves once quiet.
   */
  async function settle() {
    for (let quiet = 0; quiet < 5;) {
      await new Promise((resolve) => setTimeout(resolve, 1));
      quiet = inFlight === 0 ? quiet + 1 : 0;
    }
  }
  await settle();
  return { license: sandbox.VTLicense, billing: sandbox.VTBilling, settle };
}
