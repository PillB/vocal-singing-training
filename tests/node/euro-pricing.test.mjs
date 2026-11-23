// Euros for the European Union, US dollars everywhere else (VG-85, decided 2026-11-22), read from the page's own
// js/billing-config.js and js/billing.js run in a sandbox: which visitor is in the Union, what money their card shows,
// how it is written, and which money a press asks to be charged in.
//
// The defects this file exists for:
// - a member state the page does not know (Austria, Poland, the 23 beyond ES DE FR IT) is shown dollars while the
//   decision is euros, or a European outside the Union (GB, CH, NO, IS) is shown euros the decision does not give them;
// - the language outranks the time zone, so an "en-US" browser in Warsaw is American, or a "de-AT" one in Lima Austrian;
// - a European is shown "7,99 €" while the checkout that will charge them can only charge dollars (the worker has no
//   euro products yet, or the pasted links are the dollar ones), against the Price Indication Directive 98/6/EC art. 2(a)
//   and Peru's Ley 29571 art. 6: the price shown is the price charged;
// - the press asks for dollars under a card in euros, or for euros under a card in dollars;
// - the euro written the English way on the Spanish page ("€7,99", "7.99 €") or the Spanish way on the English one.
//
// Every oracle is written out here by hand (the zones, the states, the strings), never read from the code's own tables.
// Mutants B280 to B299 (the billing set) plant each defect back.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const CONFIG_SRC = readFileSync("js/billing-config.js", "utf8");
const BILLING_SRC = readFileSync("js/billing.js", "utf8");
const NBSP = " ";

/** The 27 member states, written out here rather than read from js/billing.js. */
const EU = "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" ");

/** A Storage stand-in. */
function memoryStorage() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k)
  };
}

/**
 * The page's billing scripts in a sandbox.
 * @param {{lang?: string, tz?: string, pageLang?: string, patch?: (cfg: object) => void, rails?: object|null,
 *          account?: object|null, ask?: Function}} [o] The browser's language and time zone, the page's language, a
 *   change to the config made as the page assigns it, what /v1/health said (null: not yet), the account layer's
 *   state (null: no account layer), and the stand-in for VTAccount.openCheckout.
 * @returns {object} The sandbox's window.
 */
function load(o = {}) {
  const win = { console, URL, URLSearchParams, setTimeout, clearTimeout, Promise };
  win.window = win;
  win.navigator = { language: o.lang || "es-ES" };
  const tz = o.tz === undefined ? "Europe/Madrid" : o.tz;
  win.Intl = { DateTimeFormat: () => ({ resolvedOptions: () => ({ timeZone: tz }) }) };
  win.localStorage = memoryStorage();
  win.sessionStorage = memoryStorage();
  win.location = { pathname: "/index.html", assign() {}, href: "http://127.0.0.1/index.html" };
  win.VTI18n = { lang: o.pageLang || "es" };
  win.VTLicense = { isConfigured: () => true };
  const account = o.account === undefined ? { configured: true, signedIn: true, methods: { ok: true, email: true } } : o.account;
  if (account) {
    win.VTAccount = { getState: () => account, knownRails: () => o.rails || null, openCheckout: o.ask };
  }
  let held;
  Object.defineProperty(win, "VT_BILLING_CONFIG", {
    configurable: true,
    get: () => held,
    set: (value) => {
      if (o.patch) o.patch(value);
      held = value;
    }
  });
  vm.createContext(win);
  vm.runInContext(CONFIG_SRC, win);
  vm.runInContext(BILLING_SRC, win);
  return win;
}

/** A value from the sandbox, as a plain object of this realm, so deepEqual compares content, not prototypes. */
function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

/** A paid plan from the sandbox's config. */
function plan(win, id) {
  return win.VT_BILLING_CONFIG.plans.find((p) => p.id === id);
}

/** What the Creem rail's cards show a visitor of `region`: the three prices and the money. */
function cards(win, region) {
  const B = win.VTBilling;
  const at = region || B.priceRegion("creem");
  return {
    free: B.formatPrice(plan(win, "free"), at).text,
    monthly: B.formatPrice(plan(win, "pro_monthly"), at).text,
    yearly: B.formatPrice(plan(win, "pro_yearly"), at).text,
    currency: B.formatPrice(plan(win, "pro_monthly"), at).currency
  };
}

const EURO_ES = { free: `0${NBSP}€`, monthly: `7,99${NBSP}€`, yearly: `49${NBSP}€`, currency: "EUR" };
const EURO_EN = { free: "€0", monthly: "€7.99", yearly: "€49", currency: "EUR" };
const DOLLARS = { free: "US$ 0", monthly: "US$ 7.99", yearly: "US$ 49", currency: "USD" };

/** Creem sold through the worker (go-live gate step 5). */
const API_CHECKOUT = (c) => {
  c.providers.creem.apiCheckout = true;
};
const LINK = (n) => `https://www.creem.io/payment/prod_${n}`;
/** Creem sold by pasted links: the dollar products', and the euro products' where given. */
function pastedLinks(eur) {
  return (c) => {
    c.providers.creem.links = { pro_monthly: LINK("usd_m"), pro_yearly: LINK("usd_y") };
    c.providers.creem.linksEur = { pro_monthly: "", pro_yearly: "", ...(eur || {}) };
  };
}

test("every member state is recognised by its time zone, whatever the browser's language", () => {
  // Written out by hand from the IANA zone table (zone1970.tab and backward), one or more zones per state.
  const zones = [
    ["Europe/Vienna", "AT"], ["Europe/Brussels", "BE"], ["Europe/Sofia", "BG"], ["Europe/Zagreb", "HR"],
    ["Europe/Nicosia", "CY"], ["Asia/Nicosia", "CY"], ["Asia/Famagusta", "CY"], ["Europe/Prague", "CZ"],
    ["Europe/Copenhagen", "DK"], ["Europe/Tallinn", "EE"], ["Europe/Helsinki", "FI"], ["Europe/Mariehamn", "FI"],
    ["Europe/Paris", "FR"], ["Europe/Berlin", "DE"], ["Europe/Busingen", "DE"], ["Europe/Athens", "GR"],
    ["Europe/Budapest", "HU"], ["Europe/Dublin", "IE"], ["Europe/Rome", "IT"], ["Europe/Riga", "LV"],
    ["Europe/Vilnius", "LT"], ["Europe/Luxembourg", "LU"], ["Europe/Malta", "MT"], ["Europe/Amsterdam", "NL"],
    ["Europe/Warsaw", "PL"], ["Europe/Lisbon", "PT"], ["Atlantic/Azores", "PT"], ["Atlantic/Madeira", "PT"],
    ["Europe/Bucharest", "RO"], ["Europe/Bratislava", "SK"], ["Europe/Ljubljana", "SI"], ["Europe/Madrid", "ES"],
    ["Atlantic/Canary", "ES"], ["Africa/Ceuta", "ES"], ["Europe/Stockholm", "SE"],
    // The old link names (tzdata's backward file) a browser may still report: they name a place with no "/".
    ["Poland", "PL"], ["Portugal", "PT"], ["Eire", "IE"]
  ];
  assert.deepEqual([...new Set(zones.map(([, s]) => s))].sort(), [...EU].sort(), "the table above covers all 27");
  for (const [tz, state] of zones) {
    // "en-US" is the hard case: the old code read its "-us" before any European zone.
    const win = load({ lang: "en-US", tz });
    assert.equal(win.VTBilling.detectRegion(), state, tz);
    assert.equal(win.VTBilling.marketFor(state).code, state, `${state} is a market of its own, not Worldwide`);
    assert.deepEqual(cards(win), EURO_ES, `${tz}: nothing is on sale yet, so the planned euro price`);
  }
});

test("Europe outside the Union stays in US dollars, whatever the language", () => {
  // Wrong: euros for a country the decision does not name, or a European language taken over a non-EU zone.
  const outside = [
    ["en-GB", "Europe/London", "GB"], ["de-CH", "Europe/Zurich", "WW"], ["de-DE", "Europe/Zurich", "WW"],
    ["nb-NO", "Europe/Oslo", "WW"], ["is-IS", "Atlantic/Reykjavik", "WW"], ["fr-FR", "Europe/Monaco", "WW"],
    ["de-AT", "Europe/Vaduz", "WW"], ["sr-RS", "Europe/Belgrade", "WW"], ["en-GB", "Europe/Gibraltar", "GB"],
    ["nb-NO", "Arctic/Longyearbyen", "WW"], ["de-DE", "Europe/London", "GB"],
    // Link names outside the Union are no member state either.
    ["en-GB", "GB-Eire", "GB"], ["is-IS", "Iceland", "WW"]
  ];
  for (const [lang, tz, region] of outside) {
    const win = load({ lang, tz });
    assert.equal(win.VTBilling.detectRegion(), region, `${lang} in ${tz}`);
    assert.deepEqual(cards(win), DOLLARS, `${lang} in ${tz}`);
  }
});

test("the time zone outranks the language; the language's region decides only where the zone names no place", () => {
  const cases = [
    // The zone names a member state: that state, whatever the language.
    ["en-US", "Europe/Warsaw", "PL"], ["de-DE", "Europe/Vienna", "AT"], ["es-CO", "Europe/Madrid", "ES"],
    ["pt-BR", "Europe/Lisbon", "PT"],
    // The one exception: a Peruvian locale is Peru wherever the device is (the market shown soles by law).
    ["es-PE", "Europe/Madrid", "PE"], ["qu-PE", "Europe/Berlin", "PE"],
    // The zone names no place (a hardened browser's UTC, "CET", none): the language's region subtag.
    ["pl-PL", "UTC", "PL"], ["de-AT", "", "AT"], ["en-IE", "Etc/UTC", "IE"], ["fr-BE", "CET", "BE"],
    ["sr-Latn-HR", "Etc/GMT-1", "HR"], ["sv_SE", "UTC", "SE"],
    // Controls: a zone outside the Union is not overruled by a European language, and a bare language or a
    // non-member region is no member state.
    ["pl-PL", "America/New_York", "US"], ["de-AT", "America/Lima", "PE"], ["es-ES", "America/Lima", "PE"],
    ["fr-FR", "America/Toronto", "CA"], ["pl", "UTC", "WW"], ["de-CH", "UTC", "WW"], ["en-u-ca-gregory", "UTC", "WW"],
    // A subtag after an extension or private-use singleton is not a region: "fr" here is no France.
    ["en-x-fr", "UTC", "WW"], ["de-u-co-phonebk", "UTC", "WW"],
    ["es-PE", "America/Lima", "PE"], ["es-CO", "America/Bogota", "CO"]
  ];
  for (const [lang, tz, region] of cases) {
    assert.equal(load({ lang, tz }).VTBilling.detectRegion(), region, `${lang} in "${tz}"`);
  }
});

test("the euro is written as the page's language writes it, and soles and dollars as before", () => {
  const es = load({ lang: "es-ES", tz: "Europe/Madrid", pageLang: "es" });
  assert.deepEqual(cards(es), EURO_ES);
  const en = load({ lang: "en-IE", tz: "Europe/Dublin", pageLang: "en" });
  assert.deepEqual(cards(en), EURO_EN);
  // Prices that are not the dollar numerals, so a euro card showing the dollar or soles amount fails here.
  const own = { priceUsd: 9, priceEur: 8.5, pricePen: 30 };
  assert.equal(es.VTBilling.formatPrice(own, "AT").text, `8,50${NBSP}€`);
  assert.equal(en.VTBilling.formatPrice(own, "AT").text, "€8.50");
  assert.equal(es.VTBilling.formatPrice(own, "AT").amount, 8.5);
  // Controls: soles and dollars are written the same on both pages.
  for (const win of [es, en]) {
    assert.equal(win.VTBilling.formatPrice(plan(win, "pro_monthly"), "PE").text, "S/ 19.90");
    assert.equal(win.VTBilling.formatPrice(plan(win, "pro_monthly"), "US").text, "$7.99");
    assert.equal(win.VTBilling.formatPrice(plan(win, "pro_yearly"), "GB").text, "US$ 49");
    assert.equal(win.VTBilling.formatPrice(own, "MX").text, "US$ 9");
  }
});

test("the yearly saving is worked out in the money on screen", () => {
  const win = load({ patch: (c) => {
    // A euro yearly that saves a different share from the dollar one, so a saving read in dollars shows.
    c.plans.find((p) => p.id === "pro_yearly").priceEur = 59.88;
  } });
  const plans = win.VT_BILLING_CONFIG.plans;
  assert.equal(win.VTBilling.annualSavingPct(plans, "DE"), 38, "1 - 59.88 / (7.99 * 12)");
  assert.equal(win.VTBilling.annualSavingPct(plans, "US"), 49, "1 - 49 / (7.99 * 12)");
});

test("through the worker, a European is shown euros only once /v1/health says the euro products are there", () => {
  const states = [
    // Health not answered yet: the dollars a press now would be charged.
    [null, DOLLARS],
    [{ creemCheckout: true, creemEur: false }, DOLLARS],
    // A worker too old to report the field is a no (js/account.js reads a missing field as false).
    [{ creemCheckout: true }, DOLLARS],
    [{ creemCheckout: true, creemEur: true }, EURO_ES]
  ];
  for (const [rails, shown] of states) {
    const win = load({ lang: "de-AT", tz: "Europe/Vienna", patch: API_CHECKOUT, rails });
    assert.deepEqual(cards(win), shown, JSON.stringify(rails));
    // Control: an American on the same worker is shown dollars whatever it says.
    const us = load({ lang: "en-US", tz: "America/New_York", patch: API_CHECKOUT, rails, pageLang: "en" });
    assert.equal(cards(us).monthly, "$7.99", JSON.stringify(rails));
  }
});

test("by pasted links, a European is shown euros only with a valid euro link for every paid plan", () => {
  const states = [
    [{ pro_monthly: LINK("eur_m"), pro_yearly: LINK("eur_y") }, EURO_ES],
    // One plan without one: one dialog never shows two currencies, so both cards are in dollars.
    [{ pro_monthly: LINK("eur_m") }, DOLLARS],
    [{ pro_monthly: LINK("eur_m"), pro_yearly: "https://evil.example/pay" }, DOLLARS],
    [{}, DOLLARS]
  ];
  for (const [eur, shown] of states) {
    const win = load({ lang: "pl-PL", tz: "Europe/Warsaw", patch: pastedLinks(eur) });
    assert.deepEqual(cards(win), shown, JSON.stringify(eur));
  }
  // Without an account layer the worker opens nothing, so the links are the path even with apiCheckout on.
  const both = { pro_monthly: LINK("eur_m"), pro_yearly: LINK("eur_y") };
  const noAccount = (eur) => load({ lang: "pl-PL", tz: "Europe/Warsaw", account: null, patch: (c) => {
    API_CHECKOUT(c);
    pastedLinks(eur)(c);
  }, rails: { creemEur: true } });
  assert.deepEqual(cards(noAccount(both)), EURO_ES);
  assert.deepEqual(cards(noAccount({})), DOLLARS, "health's euros are not the links' euros");
});

test("a pasted link is the one in the money the card shows, and a euro card with no euro link has none", () => {
  const both = { pro_monthly: LINK("eur_m"), pro_yearly: LINK("eur_y") };
  const es = load({ lang: "es-ES", tz: "Europe/Madrid", patch: pastedLinks(both) });
  assert.equal(es.VTBilling.checkoutUrl("pro_monthly", "creem"), LINK("eur_m"));
  assert.equal(es.VTBilling.checkoutUrl("pro_yearly", "creem"), LINK("eur_y"));
  // Controls: the same links, an American and a Peruvian on the card rail: the dollar products.
  const us = load({ lang: "en-US", tz: "America/New_York", patch: pastedLinks(both) });
  assert.equal(us.VTBilling.checkoutUrl("pro_monthly", "creem"), LINK("usd_m"));
  const pe = load({ lang: "es-PE", tz: "America/Lima", patch: pastedLinks(both) });
  assert.equal(pe.VTBilling.checkoutUrl("pro_yearly", "creem"), LINK("usd_y"));
  // Euro links for one plan only: the cards show dollars, so the dollar links.
  const half = load({ lang: "es-ES", tz: "Europe/Madrid", patch: pastedLinks({ pro_monthly: LINK("eur_m") }) });
  assert.equal(half.VTBilling.checkoutUrl("pro_monthly", "creem"), LINK("usd_m"));
  // Through the worker with euros on, and only the dollar links pasted (VG-88's fallback): the card shows €, and
  // there is no link in euros, so none at all rather than a dollar charge under a euro price.
  const worker = load({ lang: "es-ES", tz: "Europe/Madrid", rails: { creemCheckout: true, creemEur: true }, patch: (c) => {
    API_CHECKOUT(c);
    pastedLinks({})(c);
  } });
  assert.equal(cards(worker).currency, "EUR");
  assert.equal(worker.VTBilling.checkoutUrl("pro_monthly", "creem"), null);
});

test("euro links sell on their own: the rail is on sale with them, for the visitor they are for", () => {
  const euroOnly = (c) => {
    c.providers.creem.linksEur = { pro_monthly: LINK("eur_m"), pro_yearly: LINK("eur_y") };
  };
  const es = load({ lang: "es-ES", tz: "Europe/Madrid", patch: euroOnly });
  assert.equal(es.VTBilling.linksConfigured("creem"), true);
  assert.equal(es.VTBilling.getBillingHealth().ok, true, "something is on sale, so the terms must say so");
  assert.deepEqual(plain(es.VTBilling.checkoutRails("ES").find((r) => r.rail === "creem")), { rail: "creem", sellable: true });
  // Control: an American has no dollar link to buy with, and nothing is sellable to them on that rail.
  const us = load({ lang: "en-US", tz: "America/New_York", patch: euroOnly });
  assert.deepEqual(plain(us.VTBilling.checkoutRails("US").find((r) => r.rail === "creem")), { rail: "creem", sellable: false });
  // Control: the shipped config sells nothing at all.
  assert.equal(load().VTBilling.linksConfigured(), false);
});

test("a press asks the worker for the money its card shows, and a 409 currency_unavailable is 'not available'", async () => {
  const press = async (lang, tz, rails, rail) => {
    const asked = [];
    const win = load({ lang, tz, patch: API_CHECKOUT, rails, ask: async (input) => {
      asked.push(input);
      return { ok: false, reason: "currency_unavailable" };
    } });
    const res = win.VTBilling.startCheckout("pro_yearly", rail);
    assert.equal(res.mode, "opening", `${lang} ${tz}`);
    const out = await res.done;
    return { asked, out, shown: cards(win, win.VTBilling.priceRegion(rail || "creem")).currency };
  };
  const euroOn = { creemCheckout: true, creemEur: true };
  const at = await press("es-ES", "Europe/Madrid", euroOn);
  assert.equal(at.shown, "EUR");
  assert.deepEqual(at.asked.map((a) => [a.plan, a.provider, a.currency]), [["pro_yearly", "creem", "EUR"]]);
  assert.equal(at.out.mode, "provider_unavailable", "the worker's refusal reads as the rail being unavailable");
  // Controls: a European while the worker has no euro products, an American, and a Peruvian who picked the
  // card rail are shown dollars, and ask for dollars.
  for (const [lang, tz, rails, rail] of [
    ["es-ES", "Europe/Madrid", { creemCheckout: true, creemEur: false }],
    ["en-US", "America/New_York", euroOn],
    ["es-PE", "America/Lima", euroOn, "creem"]
  ]) {
    const r = await press(lang, tz, rails, rail);
    assert.equal(r.shown, "USD", `${lang} ${tz}`);
    assert.deepEqual(r.asked.map((a) => a.currency), ["USD"], `${lang} ${tz}`);
  }
});

test("the exported member-state list is the Union's 27 and nothing else", () => {
  const listed = plain(load().VTBilling.EU_REGIONS);
  assert.deepEqual([...listed].sort(), [...EU].sort());
  assert.equal(Object.isFrozen(load().VTBilling.EU_REGIONS), true);
  // Each one is a euro market on Creem in the config, which is what puts it on the euro price.
  const markets = load().VT_BILLING_CONFIG.markets;
  for (const state of EU) {
    assert.deepEqual(plain(markets.filter((m) => m.code === state).map((m) => [m.currency, m.rail])), [["EUR", "creem"]], state);
  }
  for (const outside of ["GB", "CH", "NO", "IS"]) {
    assert.notEqual(markets.find((m) => m.code === outside)?.currency, "EUR", outside);
  }
});

test("the euro price waits for every plan: one plan without priceEur puts the whole dialog in dollars", () => {
  // Wrong: chargedCurrency decided per plan, so a config that lost one priceEur showed "US$ 7.99" beside "49 €", and
  // the region line named only the first paid plan's money.
  const without = (id) => load({ lang: "es-ES", tz: "Europe/Madrid", patch: (c) => {
    delete c.plans.find((p) => p.id === id).priceEur;
  } });
  assert.deepEqual(cards(without("pro_monthly")), DOLLARS, "monthly without one");
  assert.deepEqual(cards(without("pro_yearly")), DOLLARS, "yearly without one");
  assert.deepEqual(cards(without("free")), DOLLARS, "free without one");
  // Control: every plan priced, the same visitor is shown euros.
  assert.deepEqual(cards(load({ lang: "es-ES", tz: "Europe/Madrid" })), EURO_ES);
  // A plan from outside the config with no euro price is never written in euros ("undefined €").
  const es = load({ lang: "es-ES", tz: "Europe/Madrid" });
  assert.equal(es.VTBilling.formatPrice({ priceUsd: 9, pricePen: 30 }, "AT").text, "US$ 9");
  assert.equal(es.VTBilling.formatPrice({ priceUsd: 9, pricePen: 30, priceEur: 8 }, "AT").text, `8${NBSP}€`);
});

test("the planned euro price is shown only while no press can take money, as the dialog's own pre-launch reads it", () => {
  // Demo mode with the dollar links pasted: the plan buttons can be pressed (js/app.js isCheckoutPrelaunch is false),
  // so a European is shown the dollars the link charges. Wrong (before): "7,99 €" from `!health.ok`, and a press then
  // fell to the demo unlock while an American in the same build was sent to the dollar link.
  const demo = (lang, tz) => load({ lang, tz, patch: (c) => {
    c.demoUnlockEnabled = true;
    pastedLinks({})(c);
  } });
  const es = demo("es-ES", "Europe/Madrid");
  assert.deepEqual(cards(es), DOLLARS);
  assert.equal(es.VTBilling.checkoutUrl("pro_monthly", "creem"), LINK("usd_m"));
  assert.equal(demo("en-US", "America/New_York").VTBilling.checkoutUrl("pro_monthly", "creem"), LINK("usd_m"));
  // Control: entitlements unverified (verification.required false), no demo: the dialog is in pre-launch, its plan
  // buttons say "not available yet", so the planned euro price stands.
  const unverified = load({ lang: "es-ES", tz: "Europe/Madrid", patch: (c) => {
    c.verification.required = false;
    pastedLinks({})(c);
  } });
  assert.deepEqual(cards(unverified), EURO_ES);
  // Control: the shipped config sells nothing, so the planned euro price.
  assert.deepEqual(cards(load({ lang: "es-ES", tz: "Europe/Madrid" })), EURO_ES);
});

test("the page asks /v1/health early only for a visitor whose prices wait on it", () => {
  const waits = (o) => load({ rails: null, ...o }).VTBilling.pricesWaitOnRails();
  // A European while Creem is sold through the worker: the euro price waits on creemEurConfigured.
  assert.equal(waits({ lang: "de-AT", tz: "Europe/Vienna", patch: API_CHECKOUT }), true);
  assert.equal(waits({ lang: "en-US", tz: "Europe/Warsaw", patch: API_CHECKOUT }), true);
  // Controls: nothing the answer would change on their cards, so nobody else is asked before they open the dialog.
  assert.equal(waits({ lang: "en-US", tz: "America/New_York", patch: API_CHECKOUT }), false, "an American");
  assert.equal(waits({ lang: "en-GB", tz: "Europe/London", patch: API_CHECKOUT }), false, "the British");
  assert.equal(waits({ lang: "es-PE", tz: "America/Lima", patch: API_CHECKOUT }), false, "a Peruvian");
  assert.equal(waits({ lang: "de-AT", tz: "Europe/Vienna", patch: pastedLinks({}) }), false, "pasted links, no worker");
  assert.equal(waits({ lang: "de-AT", tz: "Europe/Vienna", patch: API_CHECKOUT, account: null }), false, "no account layer");
  assert.equal(waits({ lang: "de-AT", tz: "Europe/Vienna", patch: (c) => {
    API_CHECKOUT(c);
    c.verification.required = false;
  } }), false, "pre-launch: the planned price needs no answer");
});

test("a Spanish browser in a zone outside the Union is not in Spain, and its card rail is in dollars", () => {
  // The zone outranks the language (the rule above), so es-ES in Tokyo, Andorra or Denver is not Spain. Before
  // group P1 removes the `es -> PE` shortcut these read as Peru (whose card rail is still the dollar one); after it,
  // Worldwide. Either way, never Spain and never euros on the card rail.
  for (const tz of ["Asia/Tokyo", "Europe/Andorra", "America/Denver"]) {
    const win = load({ lang: "es-ES", tz });
    assert.notEqual(win.VTBilling.detectRegion(), "ES", tz);
    assert.deepEqual(cards(win), DOLLARS, tz);
  }
});
