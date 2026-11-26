/**
 * Which market a visitor is put in, from the locale and time zone their
 * browser reports (red team round two: money-6).
 *
 * The defect: after every named market had been tried, js/billing.js sent
 * any other Spanish locale to Peru (`if (lang.startsWith("es")) return "PE"`).
 * Uruguay, Ecuador, Bolivia, Central America and a bare "es" were all told
 * "Tu región: Perú · precios en soles" and sold the Peruvian Mercado Pago plan
 * by default, while the terms say everyone outside Peru buys from Creem in US
 * dollars. Peru is the Lima time zone or a Peruvian locale; anything not
 * named is the worldwide market.
 *
 * The real js/billing-config.js and js/billing.js run in a vm; only the
 * platform is stood in for: navigator.language and the time zone Intl reports.
 * The expected regions are written out by hand, never computed by the code
 * under test.
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

/** VTBilling as a browser reporting `language` and `timeZone` builds it. */
function billingIn(language, timeZone) {
  const intl = {
    ...Intl,
    DateTimeFormat: function DateTimeFormat() {
      return { resolvedOptions: () => ({ timeZone }) };
    }
  };
  const win = {
    console,
    setTimeout,
    clearTimeout,
    URL,
    URLSearchParams,
    JSON,
    Date,
    Math,
    Promise,
    Intl: intl,
    navigator: { language, languages: [language] },
    localStorage: emptyStorage(),
    sessionStorage: emptyStorage(),
    location: { href: "https://example.test/", pathname: "/", search: "", hash: "" },
    history: { replaceState() {} },
    addEventListener() {},
    document: { documentElement: { lang: "es" } }
  };
  win.window = win;
  const ctx = vm.createContext(win);
  for (const src of SOURCES) vm.runInContext(src, ctx);
  return win.VTBilling;
}

// [locale, time zone, the market a person there buys in]
const CASES = [
  // money-6: Spanish-speaking places with no market of their own are worldwide, not Peru.
  ["es-UY", "America/Montevideo", "WW"],
  ["es-EC", "America/Guayaquil", "WW"],
  ["es-BO", "America/La_Paz", "WW"],
  ["es-419", "America/Panama", "WW"],
  ["es-US", "America/Phoenix", "US"],
  ["es", "UTC", "WW"],
  // Controls: Peru by its locale or its time zone, whatever else the browser says.
  ["es-PE", "America/Lima", "PE"],
  ["es-PE", "Europe/Madrid", "PE"],
  ["es", "America/Lima", "PE"],
  ["en-US", "America/Lima", "PE"],
  ["qu-PE", "UTC", "PE"],
  // And the markets that are named keep theirs.
  ["es-AR", "America/Argentina/Buenos_Aires", "AR"],
  ["es-MX", "America/Mexico_City", "MX"],
  ["es-CL", "America/Santiago", "CL"],
  ["es-CO", "America/Bogota", "CO"],
  ["es-ES", "Europe/Madrid", "ES"],
  ["pt-BR", "America/Sao_Paulo", "BR"],
  ["en-US", "America/New_York", "US"],
  ["en-GB", "Europe/London", "GB"],
  ["fr-CA", "America/Toronto", "CA"],
  ["en-IN", "Asia/Kolkata", "IN"],
  ["ja-JP", "Asia/Tokyo", "WW"]
];

for (const [language, timeZone, region] of CASES) {
  test(`money-6: ${language} in ${timeZone} is the ${region} market`, () => {
    assert.equal(billingIn(language, timeZone).detectRegion(), region);
  });
}

/** The rails the Pro dialog offers in `region`, as an array of this realm. */
const railsIn = (billing, region) => Array.from(billing.checkoutRails(region), (r) => r.rail);

test("money-6: outside Peru the dialog is not offered the Peruvian Mercado Pago rail; in Peru it is, first", () => {
  // Mercado Pago's plans are a Peruvian seller account's (its config names
  // only PE). Wrong (before): every market's rail was drawn for everybody.
  assert.deepEqual(railsIn(billingIn("es-AR", "America/Argentina/Buenos_Aires"), "AR"), ["creem"]);
  assert.deepEqual(railsIn(billingIn("es-UY", "America/Montevideo"), "WW"), ["creem"]);
  assert.deepEqual(railsIn(billingIn("en-US", "America/New_York"), "US"), ["creem"]);
  assert.deepEqual(railsIn(billingIn("es-PE", "America/Lima"), "PE"), ["mercadopago", "creem"]);
});
