/**
 * Which worker answers the page follows to a Creem page (red team round two,
 * truth-6): the customer portal from "Manage or cancel subscription" and the
 * bound checkout from Subscribe.
 *
 * The defect: both answers were checked with VTBilling.validateCheckoutUrl,
 * the allowlist for pasted checkout links, which also holds every Stripe and
 * Mercado Pago checkout host. A worker answer naming one of those pages was
 * followed, so a "Manage" press or a Creem Subscribe could end on another
 * rail's payment page. The rule is the worker's own (isCreemPageUrl,
 * workers/entitlements/src/checkout.js): https, creem.io or a subdomain, no
 * user name or password.
 *
 * The real js/billing-config.js and js/billing.js run in a vm; only the
 * platform is stood in for. The
 * expected answers are written out by hand, never computed by the code under
 * test.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const ROOT = new URL("../../", import.meta.url);
const SOURCES = ["js/billing-config.js", "js/billing.js"].map((f) => readFileSync(new URL(f, ROOT), "utf8"));

/** A storage that holds nothing and refuses nothing. */
function emptyStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) };
}

/** VTBilling as an American browser builds it. */
function billingHere() {
  const win = {
    console: { ...console, warn() {} },
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    JSON,
    Date,
    Math,
    Promise,
    Intl,
    navigator: { language: "en-US", languages: ["en-US"] },
    localStorage: emptyStorage(),
    sessionStorage: emptyStorage(),
    location: { href: "https://example.test/", pathname: "/", search: "", hash: "" },
    history: { replaceState() {} },
    addEventListener() {},
    document: { documentElement: { lang: "en" } }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const src of SOURCES) vm.runInContext(src, ctx);
  return win.VTBilling;
}

const billing = billingHere();

// [address the worker named, followed?]
const CASES = [
  // Controls: Creem's own pages, as the worker names them.
  ["https://creem.io/my-orders/login/cust_1", true],
  ["https://checkout.creem.io/ch_1", true],
  ["https://www.creem.io/payment/prod_1", true],
  // Another rail's payment page: on the pasted-link list, not Creem's.
  ["https://buy.stripe.com/test_not_a_portal", false],
  ["https://checkout.stripe.com/c/pay/cs_1", false],
  ["https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=1", false],
  // Creem's name in the wrong place, plain http, credentials.
  ["https://creem.io.evil.example/portal", false],
  ["https://evilcreem.io/portal", false],
  ["http://creem.io/my-orders/login/cust_1", false],
  ["https://user:pass@creem.io/my-orders/login/cust_1", false],
  ["", false]
];

for (const [url, followed] of CASES) {
  test(`truth-6: a worker answer naming ${url || "nothing"} is ${followed ? "" : "not "}followed as a Creem page`, () => {
    assert.equal(billing.validateCreemPageUrl(url).ok, followed);
  });
}

test("truth-6: the pasted-link check still takes Stripe and Mercado Pago, so the Creem check is the narrower one on purpose", () => {
  // Control for the cases above: a pasted Mercado Pago or Stripe link is
  // still a valid checkout link; only a worker answer is held to Creem.
  assert.equal(billing.validateCheckoutUrl("https://buy.stripe.com/test_not_a_portal").ok, true);
  assert.equal(billing.validateCheckoutUrl("https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=1").ok, true);
});
