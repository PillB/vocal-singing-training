/**
 * The plan cards are the contract, and this asks `can()` whether it agrees.
 *
 * `qa/check-tiers.mjs` compares the three hand-maintained lists of NAMES and
 * cannot do more: `can()` lives in the page and needs a browser. So a `map` that
 * stops overriding a key the Pro card sells, or overrides it with `false`, keeps
 * every name in place and passes that check while the subscriber who paid for it
 * is refused. Found by QA round 10 as QA-67, and measured here before this file
 * was written: three such defects planted in `js/billing.js` all passed
 * `check-tiers.mjs`.
 *
 * What this file asserts is the contract a buyer can read off the pricing panel:
 * every capability the Free card lists answers yes for a free visitor AND for a
 * subscriber, and every capability only a Pro card lists answers no for a free
 * visitor and yes for a subscriber. The two failures it is written against are
 * the two that cost something real — a feature somebody paid for and did not
 * get, and a Pro feature everybody gets for nothing. The aggregates `all_free`
 * and `all_pro_monthly` name another card's list rather than a capability, so
 * they are skipped here exactly as they are there.
 *
 * Four mutants, all of which fail this file and pass `check-tiers.mjs`: a `map`
 * that loses `extra_freezes`, one that answers `false` for `extra_reminders`,
 * one that loses `achievements_export`, and one that hands `export_progress` to
 * everybody.
 *
 * Worth knowing when reading a failure here: two call sites ask
 * `can("extra_freezes") || isPro()` (js/practice-days.js) and
 * `can("extra_reminders") || isPro()` (js/app.js), so for those two keys a
 * regression in `can()` is invisible at those call sites and visible only here.
 *
 * Adopted from QA round 10 with its expectations unchanged. VG-58.
 */
const { test, expect } = require("@playwright/test");
const { enableQaPro, patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function answers(page) {
  await enableQaPro(page);
  await page.addInitScript(() => {
    try { localStorage.setItem("vt_tour_v1", "1"); sessionStorage.setItem("vt_e2e", "1"); } catch { /* ignore */ }
  });
  // No automatic trial, set as the config is assigned: the page freezes it
  // straight after (QA-05), so assigning it once loaded did nothing.
  await patchBillingConfig(page, { freeTrialDays: 0 });
  await page.goto(BASE + "/?e2e=1&t=" + Date.now(), { waitUntil: "domcontentloaded" });
  expect(await page.evaluate(() => window.VT_BILLING_CONFIG.freeTrialDays), "the patch landed").toBe(0);
  return page.evaluate(() => {
    try {
      localStorage.removeItem("vt_billing_v1");
      localStorage.removeItem("vt_billing_trial_started_v1");
    } catch { /* ignore */ }
    const AGG = new Set(["all_free", "all_pro_monthly"]);
    const card = (id) => (window.VT_BILLING_CONFIG.plans.find((p) => p.id === id) || { features: [] }).features.filter((k) => !AGG.has(k));
    const free = card("free"), monthly = card("pro_monthly"), yearly = card("pro_yearly");
    const ask = (keys) => Object.fromEntries(keys.map((k) => [k, window.VTBilling.can(k)]));
    const proOnly = [...new Set([...monthly, ...yearly])].filter((k) => !free.includes(k));
    const out = { free, monthly, yearly, proOnly, freeIsPro: window.VTBilling.isPro(), asFreeFreeKeys: ask(free), asFreeProKeys: ask(proOnly) };
    window.VTBilling.activateDemo("pro_yearly");
    out.proIsPro = window.VTBilling.isPro();
    out.asProFreeKeys = ask(free);
    out.asProProKeys = ask(proOnly);
    return out;
  });
}

test("controls: the cards name the capabilities the product is known by", async ({ page }) => {
  const r = await answers(page);
  expect(r.freeIsPro, "the browser starts free").toBe(false);
  expect(r.proIsPro, "the demo plan makes it Pro").toBe(true);
  expect(r.free).toEqual(expect.arrayContaining(["all_exercises"]));
  expect(r.proOnly).toEqual(expect.arrayContaining(["export_progress", "ad_free", "multi_profile"]));
  expect(r.proOnly.length).toBeGreaterThanOrEqual(10);
});

test("every capability on the Free card is yes for a free browser and for Pro", async ({ page }) => {
  const r = await answers(page);
  const refusedFree = r.free.filter((k) => r.asFreeFreeKeys[k] !== true);
  const refusedPro = r.free.filter((k) => r.asProFreeKeys[k] !== true);
  expect(refusedFree, "Free card promises, free browser refused").toEqual([]);
  expect(refusedPro, "Free card promises, Pro browser refused").toEqual([]);
});

test("every capability only a Pro card lists is no for a free browser and yes for Pro", async ({ page }) => {
  const r = await answers(page);
  const givenAway = r.proOnly.filter((k) => r.asFreeProKeys[k] !== false);
  const refused = r.proOnly.filter((k) => r.asProProKeys[k] !== true);
  expect(givenAway, "Pro-only on the cards, but a free browser gets it").toEqual([]);
  expect(refused, "promised by a Pro card, but a Pro subscriber is refused").toEqual([]);
});
