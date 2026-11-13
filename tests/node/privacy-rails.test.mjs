// The privacy page names who receives a buyer's data, and the config decides who does: every market names the
// rail it sells on. #26 moved every international market from Stripe to Creem, a merchant of record that receives
// the buyer's details as a controller in its own right, and the page went on saying "Stripe or Mercado Pago ...
// Nobody else receives anything" in both languages. Peru's Ley 29733 (art. 18) and, for the EU buyers Creem's
// markets include, GDPR art. 13(1)(e) ask the notice to name its recipients, so a rail swap that leaves the page
// behind makes it false on the first sale. This fails when a rail a market sells on is not named in either half
// of the page, and when a rail no market sells on is still named as one that takes payments.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

/** The company a buyer meets on each rail, as the privacy page must name it. */
export const RAIL_NAMES = { creem: "Creem", mercadopago: "Mercado Pago", stripe: "Stripe" };

/** The config as the page sees it. */
function loadConfig() {
  const win = {};
  win.window = win;
  vm.runInNewContext(readFileSync("js/billing-config.js", "utf8"), win);
  return win.VT_BILLING_CONFIG;
}

/** The page's two halves: the Spanish one before `<section lang="en"`, the English one from it. */
export function halves(html) {
  const at = html.indexOf('<section lang="en"');
  if (at < 0) throw new Error('privacy.html has no <section lang="en">; this check needs updating');
  return { es: html.slice(0, at), en: html.slice(at) };
}

/**
 * Every [half, rail, problem] where the page and the markets disagree: a rail sold on that a half does not name
 * ("missing"), or a rail nobody sells on that a half still names ("stale").
 * @param {{rail: string}[]} markets
 * @param {string} html privacy.html
 */
export function recipientGaps(markets, html) {
  const used = new Set(markets.map((m) => m.rail).filter((r) => r in RAIL_NAMES));
  const gaps = [];
  for (const [half, text] of Object.entries(halves(html))) {
    const plain = text.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    for (const [rail, name] of Object.entries(RAIL_NAMES)) {
      const named = plain.includes(name);
      if (used.has(rail) && !named) gaps.push([half, rail, "missing"]);
      if (!used.has(rail) && named) gaps.push([half, rail, "stale"]);
    }
  }
  return gaps;
}

test("the privacy page names every rail a market sells on, in both languages, and no other", () => {
  const cfg = loadConfig();
  assert.ok(cfg.markets.some((m) => m.rail === "creem"), "the config sells on Creem, which is what makes this case bite");
  assert.deepEqual(recipientGaps(cfg.markets, readFileSync("privacy.html", "utf8")), []);
});

test("control: a page missing a rail in one half, or naming a rail nobody sells on, is caught", () => {
  const page = (es, en) => `<main>${es}</main><section lang="en">${en}</section>`;
  const markets = [{ rail: "creem" }, { rail: "mercadopago" }];
  assert.deepEqual(recipientGaps(markets, page("<b>Creem</b> y Mercado Pago", "Creem and Mercado Pago")), []);
  assert.deepEqual(recipientGaps(markets, page("Stripe o Mercado Pago", "Creem and Mercado Pago")), [
    ["es", "creem", "missing"],
    ["es", "stripe", "stale"]
  ]);
  assert.deepEqual(recipientGaps([...markets, { rail: "stripe" }], page("Creem, Stripe, Mercado Pago", "Creem and Mercado Pago")), [
    ["en", "stripe", "missing"]
  ]);
});
