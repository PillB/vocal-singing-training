/**
 * Which money, and which seller, each market is shown in the Pro dialog, and
 * what the terms and the privacy notice say about it (red team round one:
 * truth-3, truth-4 and truth-6).
 *
 * The defects behind this file:
 * - truth-3: Argentina, Chile and Colombia named Mercado Pago as their rail.
 *   The Mercado Pago seller account is Peruvian and its plans charge soles, so
 *   once its links were live an Argentine was put on it by default, under
 *   "US$ 7.99" and a line saying the prices were US dollars, while the terms
 *   said everyone outside Peru buys from Creem. Its button said "Perú / LATAM".
 * - truth-4: Spain and the other euro markets were shown "€7.99 · precios en
 *   euros (€)" for a Creem product priced in US dollars, beside terms that say
 *   US$ outside Peru. One of the two was wrong in every configuration. Since
 *   VG-85 was decided (2026-11-22: euros in the European Union) the rule is
 *   the same one the other way round: Spain is shown € when, and only when,
 *   the worker can charge euros, and the checkout asks for the money shown
 *   (tests/pricing-euro.spec.js has the rest of the Union).
 * - truth-6: the busy toast for the worker's hourly checkout limit said to wait
 *   "a few minutes", where the clock-aligned window can have 59 of them left.
 * - money-6 (round two): every Spanish locale with no market of its own
 *   (Uruguay, Ecuador, ...) was put in Peru by a catch-all and told
 *   "Tu región: Perú" in soles, and the Mercado Pago button was drawn for every
 *   market, one press from a Peruvian plan a buyer elsewhere cannot pay.
 * - And the privacy notice said the account's email is never shared, a few
 *   paragraphs above one saying the worker passes it to Creem to open a card
 *   checkout.
 *
 * The oracle is what the buyer sees and where a press sends them: the rail
 * marked as chosen, the price on each card, the region line, the page a press
 * on Subscribe navigates to, and the toast. Each market's case reads the
 * region line whole, so it proves the locale really put the page in that
 * market: a fallback to "Worldwide", which is Creem in dollars too, would
 * otherwise pass every dollar check while testing nothing.
 *
 * The worker is stood in for at the shipped worker's own host, which the
 * page's Content Security Policy allows, so these run under the real policy
 * with every request answered here. Mercado Pago's and Creem's pages are
 * stood in for too, and every navigation to them is recorded.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev";
const SESSION = "sess-markets-1";
const ACCOUNT = { id: "acct_markets_1", email: "buyer@example.test", trialUsed: true };
const CHECKOUT_PAGE = "https://checkout.creem.io/ch_markets_1";
const MP_HOST = "www.mercadopago.com.pe";
const MP_MONTHLY = `https://${MP_HOST}/subscriptions/checkout?preapproval_plan_id=markets_monthly`;
const MP_YEARLY = `https://${MP_HOST}/subscriptions/checkout?preapproval_plan_id=markets_yearly`;
const DOLLARS_ES = "precios en dólares de EE. UU. (US$)";
const EUROS_ES = "precios en euros (€), IVA incluido";
const NBSP = "\u00a0";
const SOLES_ES = "precios en soles (S/)";
const CARD_ES = { rail: "creem", text: "Tarjeta internacional" };
const MP_ES = { rail: "mercadopago", text: "Mercado Pago (Perú)" };

/** Creem sold through the worker, as at go-live (docs/40 step 5). */
const CREEM_ON_SALE = { rails: { creem: { apiCheckout: true } } };
/** And Mercado Pago's links live as well (gate step 6): the configuration truth-3 is about. */
const BOTH_ON_SALE = { ...CREEM_ON_SALE, links: { mercadopago: { pro_monthly: MP_MONTHLY, pro_yearly: MP_YEARLY } } };

/**
 * Patch VT_BILLING_CONFIG as billing-config.js assigns it, before any other
 * script reads it; the page freezes it straight after (QA-05). Copied from
 * tests/helpers/billing.js and trimmed to the keys this file uses, each set
 * on rails that exist: `links: { rail: { plan: url } }` and
 * `rails: { rail: { key: value } }`; and `marketsFirst: [market]`, markets
 * put before the shipped list (the first market for a region is its own).
 * A rail the config does not have throws, so a typo fails the page's config
 * rather than testing nothing.
 * @param {import('@playwright/test').Page} page Page.
 * @param {{links?: object, rails?: object, marketsFirst?: object[]}} patch What to set.
 */
async function patchBillingConfig(page, patch) {
  await page.addInitScript((p) => {
    let held;
    const earlier = Object.getOwnPropertyDescriptor(window, "VT_BILLING_CONFIG");
    Object.defineProperty(window, "VT_BILLING_CONFIG", {
      configurable: true,
      get: () => held,
      set: (value) => {
        if (earlier && earlier.set) earlier.set(value);
        held = value;
        if (!value) return;
        const railOf = (rail) => {
          const provider = value.providers && value.providers[rail];
          if (!provider) throw new Error(`patchBillingConfig: no rail "${rail}" in VT_BILLING_CONFIG.providers`);
          return provider;
        };
        for (const [rail, byPlan] of Object.entries(p.links || {})) {
          const provider = railOf(rail);
          provider.links = Object.assign({}, provider.links, byPlan);
        }
        for (const [rail, keys] of Object.entries(p.rails || {})) Object.assign(railOf(rail), keys);
        if (p.marketsFirst) value.markets = [...p.marketsFirst, ...(value.markets || [])];
      }
    });
  }, patch || {});
}

/** Mutable state of the stand-in worker: the checkouts asked for, and how to answer the next. */
function freshState(over) {
  return { checkouts: [], checkoutAnswer: null, ...(over || {}) };
}

/** The worker's health: Creem's checkout and Mercado Pago both able to take money, and euros when `state.eur`. */
function health(state) {
  return {
    creemEurConfigured: !!(state && state.eur),
    ok: true,
    signingKeyConfigured: true,
    accountsConfigured: true,
    creemConfigured: true,
    creemCheckoutConfigured: true,
    creemPortalConfigured: true,
    mercadopagoConfigured: true,
    authMethods: { email: true, google: false, googleClientId: null, trialDays: 7 },
    siteOrigin: BASE
  };
}

/** Answers that need no session, by path. */
const OPEN_ROUTES = {
  "/v1/events": () => [200, { ok: true }],
  "/v1/health": (state) => [200, health(state)],
  "/v1/auth/methods": () => [200, { ok: true, email: true, google: false, googleClientId: null, trialDays: 7 }]
};

/** Answers for the signed-in account, by path. */
const ACCOUNT_ROUTES = {
  "/v1/me": () => [200, {
    ok: true,
    account: ACCOUNT,
    entitlement: { pro: false, plan: null, status: "free", source: null, periodEnd: null },
    grants: [],
    paid: [],
    licenseId: null,
    token: null
  }],
  "/v1/me/progress": () => [200, { ok: true, profiles: [], rev: 0, doc: null, updatedAt: 1 }],
  "/v1/me/checkout": (state, body) => {
    state.checkouts.push(body);
    return state.checkoutAnswer || [200, { ok: true, url: CHECKOUT_PAGE, plan: body.plan, provider: "creem" }];
  }
};

/** The request's JSON body, or {} when it has none. */
function bodyOf(request) {
  try {
    return request.postDataJSON() || {};
  } catch {
    return {};
  }
}

/** What the stand-in worker answers, as `[status, body]`. */
function answer(state, request) {
  const path = new URL(request.url()).pathname;
  if (OPEN_ROUTES[path]) return OPEN_ROUTES[path](state);
  const signedIn = (request.headers().authorization || "") === `Bearer ${SESSION}`;
  if (path.startsWith("/v1/me") && !signedIn) return [401, { ok: false, reason: "no_session" }];
  if (ACCOUNT_ROUTES[path]) return ACCOUNT_ROUTES[path](state, bodyOf(request));
  return [404, { ok: false, reason: "not_found" }];
}

/**
 * Stand the worker and both payment pages in, and sign somebody in.
 * @param {import('@playwright/test').Page} page Page.
 * @param {object} state From `freshState`.
 * @param {{config?: object, lang?: string}} [opts] Config patch, and the page's language.
 * @returns {Promise<{navigations: string[]}>} Every payment page the page went to.
 */
async function install(page, state, opts) {
  const o = opts || {};
  const navigations = [];
  await patchBillingConfig(page, o.config);
  await page.route(`${API}/**`, (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    }
    const [status, body] = answer(state, route.request());
    return route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  });
  for (const glob of ["https://checkout.creem.io/**", `https://${MP_HOST}/**`]) {
    await page.route(glob, (route) => {
      navigations.push(route.request().url());
      return route.fulfill({ status: 200, contentType: "text/html", body: "<p>payment page</p>" });
    });
  }
  await page.addInitScript((seed) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", seed.lang);
      sessionStorage.setItem("vt_e2e", "1");
      // app.js hides toasts under vt_e2e; one of these cases is about what the buyer is told.
      sessionStorage.setItem("vt_debug", "1");
      localStorage.setItem("vt_account_session_v1", JSON.stringify({ token: seed.session, expiresAt: 4102444800 }));
    } catch {
      /* ignore */
    }
  }, { session: SESSION, lang: o.lang || "es" });
  return { navigations };
}

/** Load the app and wait until the account is signed in, so a Subscribe press goes to the worker. */
async function open(page) {
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTBilling && !!window.VTAccount && !!window.VTLicense, null, { timeout: 10000 });
  await expect.poll(() => page.evaluate(() => window.VTAccount.getState()?.account?.email || null)).toBe(ACCOUNT.email);
}

/** Open the Pro dialog and return a plan's Subscribe button. */
async function openPricing(page, planId) {
  await page.locator("#btn-pro, #btn-pricing, [data-open-pricing]").first().click();
  await expect(page.locator("#pricing-modal")).toBeVisible();
  return page.locator(`#pricing-modal .plan-cta[data-plan="${planId || "pro_monthly"}"]`);
}

/**
 * What the Pro dialog shows: the region line, the rail buttons in order (with
 * which is marked chosen), and the two paid prices without their interval.
 */
function dialogReads(page) {
  return page.evaluate(() => {
    const price = (plan) => {
      const el = document.querySelector(`#pricing-grid .plan-card[data-plan="${plan}"] .plan-price`);
      return el && el.firstChild ? el.firstChild.textContent.trim() : null;
    };
    const rails = [...document.querySelectorAll("#pricing-rails .rail-btn")].map((b) => ({
      rail: b.dataset.rail,
      text: b.textContent.trim(),
      pressed: b.getAttribute("aria-pressed") === "true"
    }));
    const region = document.querySelector("#pricing-region-label");
    return { region: region ? region.textContent.trim() : null, rails, monthly: price("pro_monthly"), yearly: price("pro_yearly") };
  });
}

/** A rail button as `dialogReads` reports it. */
function railShown(rail, pressed) {
  return { ...rail, pressed };
}

/** Text with its runs of white space made one space. */
function flat(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

/**
 * The prices the terms state, read from both languages' "Precios" / "Prices"
 * paragraph: `{ es: { peru, elsewhere }, en: { peru, elsewhere } }`, each
 * `{ monthly, yearly }` as written (symbol and amount), or null when the
 * sentence is not there in that shape.
 * @param {import('@playwright/test').Page} page Page.
 */
async function termsPrices(page) {
  await page.goto(`${BASE}/terms.html`, { waitUntil: "domcontentloaded" });
  const para = async (heading) =>
    flat(await page.locator("main h2", { hasText: heading }).locator("xpath=following-sibling::p[1]").textContent());
  const es = /En Perú: (.+?) al mes o (.+?) al año\. Fuera de Perú: (.+?) al mes o (.+?) al año/.exec(await para(/^Precios$/));
  const en = /In Peru: (.+?) a month or (.+?) a year\. Elsewhere: (.+?) a month or (.+?) a year/.exec(await para(/^Prices$/));
  const pair = (m, i) => (m ? { monthly: m[i], yearly: m[i + 1] } : null);
  return { es: { peru: pair(es, 1), elsewhere: pair(es, 3) }, en: { peru: pair(en, 1), elsewhere: pair(en, 3) } };
}

// truth-3: the three Latin American markets that used to name Mercado Pago;
// money-6: and the Spanish-speaking ones with no market of their own, which a
// catch-all used to put in Peru. Every one buys on Creem, in US dollars, and
// is not offered the Peruvian Mercado Pago plan at all.
for (const market of [
  { label: "Argentina", code: "AR", name: "Argentina", locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" },
  { label: "Chile", code: "CL", name: "Chile", locale: "es-CL", timezoneId: "America/Santiago" },
  { label: "Colombia", code: "CO", name: "Colombia", locale: "es-CO", timezoneId: "America/Bogota" },
  // No market of their own: the worldwide market, by the name the config
  // gives it in Spanish (its `nameEs`, where it has one), read rather than
  // written here so this case does not hold its English name in place.
  { label: "Uruguay", name: null, locale: "es-UY", timezoneId: "America/Montevideo" },
  { label: "Ecuador", name: null, locale: "es-EC", timezoneId: "America/Guayaquil" }
]) {
  test.describe(`truth-3, money-6: ${market.label} buys on Creem, in US dollars`, () => {
    test.use({ locale: market.locale, timezoneId: market.timezoneId });

    test(`${market.label} is put on the card rail with Mercado Pago live, shown US$ in US dollars, no Peruvian plan to pick, and Subscribe opens a Creem checkout`, async ({ page }) => {
      const state = freshState();
      const { navigations } = await install(page, state, { config: BOTH_ON_SALE });
      await open(page);
      const cta = await openPricing(page);
      // Mercado Pago is live (the Peru control below, in this configuration,
      // draws it and puts Peru on it), but its plans are a Peruvian seller
      // account's: they charge soles to a Peruvian Mercado Pago account or
      // card, so it is not offered here. Wrong (before): truth-3, the market
      // named Mercado Pago, so the dialog chose it first under a dollar
      // price; money-6, its button stayed one press away for every market,
      // and Uruguay and Ecuador were told "Tu región: Perú" in soles, on it.
      const name = market.name || (await page.evaluate(() => {
        const ww = window.VTBilling.marketFor("WW");
        return ww.nameEs || ww.name;
      }));
      expect(await page.evaluate(() => window.VTBilling.detectRegion()), "the market the locale puts the page in").toBe(market.name ? market.code : "WW");
      await expect.poll(() => dialogReads(page)).toEqual({
        region: `Tu región: ${name} · ${DOLLARS_ES}`,
        rails: [railShown(CARD_ES, true)],
        monthly: "US$ 7.99",
        yearly: "US$ 49"
      });
      // Creem sells on the rail chosen, so the dialog says so before paying.
      await expect(page.locator("#pricing-mor-note")).toBeVisible();
      await cta.click();
      await page.waitForURL(CHECKOUT_PAGE);
      expect(state.checkouts).toEqual([{ plan: "pro_monthly", provider: "creem", returnPath: "/index.html", currency: "USD" }]);
      expect(navigations, "nothing went to the Peruvian Mercado Pago plan").toEqual([CHECKOUT_PAGE]);
    });
  });
}

test.describe("truth-3 control: Peru buys on Mercado Pago, in soles", () => {
  test.use({ locale: "es-PE", timezoneId: "America/Lima" });

  test("Peru on its own rail is shown S/ in soles, the card rail US$, and Subscribe on Mercado Pago goes to its plan", async ({ page }) => {
    const state = freshState();
    const { navigations } = await install(page, state, { config: BOTH_ON_SALE });
    await open(page);
    const cta = await openPricing(page);
    // The same dialog, in the same configuration, does show a market its own
    // money: so the dollars above are the markets' prices, not the only
    // currency the dialog can print.
    await expect.poll(() => dialogReads(page)).toEqual({
      region: `Tu región: Perú · ${SOLES_ES}`,
      rails: [railShown(MP_ES, true), railShown(CARD_ES, false)],
      monthly: "S/ 19.90",
      yearly: "S/ 119.90"
    });
    // The money follows the rail: Creem cannot charge soles.
    await page.locator('#pricing-rails [data-rail="creem"]').click();
    await expect.poll(() => dialogReads(page)).toEqual({
      region: `Tu región: Perú · ${DOLLARS_ES}`,
      rails: [railShown(MP_ES, false), railShown(CARD_ES, true)],
      monthly: "US$ 7.99",
      yearly: "US$ 49"
    });
    await page.locator('#pricing-rails [data-rail="mercadopago"]').click();
    await expect.poll(() => dialogReads(page).then((d) => d.monthly)).toBe("S/ 19.90");
    // And a press on Mercado Pago does reach Mercado Pago, which is what makes
    // "nothing went to Mercado Pago" above a statement about the market.
    await cta.click();
    await expect.poll(() => navigations.map((u) => new URL(u).host)).toEqual([MP_HOST]);
    expect(new URL(navigations[0]).searchParams.get("preapproval_plan_id")).toBe("markets_monthly");
    expect(state.checkouts, "Mercado Pago is a pasted link, not a worker checkout").toEqual([]);
  });

  test("truth-3, second round: with Peru's own rail set to the card and Mercado Pago kept beside it, picking Mercado Pago shows the soles its plan charges", async ({ page }) => {
    // An operator's list that sells Peru on Creem first and keeps Mercado
    // Pago as Peru's second rail: two rows for Peru, the first its own. Here
    // Mercado Pago is not the region's own rail, so its price comes from the
    // rail's own country (its config `regions`, ["PE"]), not from the region.
    const state = freshState();
    const config = { ...BOTH_ON_SALE, marketsFirst: [{ code: "PE", name: "Perú", currency: "PEN", rail: "creem", priority: 1 }] };
    const { navigations } = await install(page, state, { config });
    await open(page);
    const cta = await openPricing(page);
    expect((await dialogReads(page)).rails, "precondition: the card rail is Peru's own, Mercado Pago the second").toEqual([railShown(CARD_ES, true), railShown(MP_ES, false)]);
    await page.locator('#pricing-rails [data-rail="mercadopago"]').click();
    // Wrong: "US$ 7.99" over a Peruvian plan that charges S/ 19.90, because
    // any rail but the region's own was priced at the worldwide dollar price.
    await expect.poll(() => dialogReads(page)).toEqual({
      region: `Tu región: Perú · ${SOLES_ES}`,
      rails: [railShown(CARD_ES, false), railShown(MP_ES, true)],
      monthly: "S/ 19.90",
      yearly: "S/ 119.90"
    });
    // What the press charges is what was shown: the Peruvian plan.
    await cta.click();
    await expect.poll(() => navigations.map((u) => new URL(u).host)).toEqual([MP_HOST]);
    expect(state.checkouts, "and no Creem checkout was opened").toEqual([]);
  });

  test("the terms' Peru price is the price the Peruvian dialog shows", async ({ page }) => {
    await install(page, freshState(), { config: BOTH_ON_SALE });
    const terms = await termsPrices(page);
    expect(terms.es.peru).toEqual({ monthly: "S/ 19.90", yearly: "S/ 119.90" });
    expect(terms.en.peru, "the English half states the same").toEqual(terms.es.peru);
    await open(page);
    await openPricing(page);
    await expect.poll(() => dialogReads(page).then((d) => ({ monthly: d.monthly, yearly: d.yearly }))).toEqual(terms.es.peru);
  });
});

test.describe("truth-4 under VG-85: Spain is shown the money the worker will charge, euros once it can", () => {
  test.use({ locale: "es-ES", timezoneId: "Europe/Madrid" });

  test("with the euro products on the worker, Spain is shown 7,99 € and 49 €, the region line names euros, and Subscribe asks for euros", async ({ page }) => {
    const state = freshState({ eur: true });
    await install(page, state, { config: CREEM_ON_SALE });
    await open(page);
    const cta = await openPricing(page);
    // Wrong (the old decision): "US$ 7.99" and dollars in the region line for
    // a buyer in the Union, whose euro product is there to be charged.
    await expect.poll(() => dialogReads(page)).toEqual({
      region: `Tu región: España · ${EUROS_ES}`,
      rails: [railShown(CARD_ES, true)],
      monthly: `7,99${NBSP}€`,
      yearly: `49${NBSP}€`
    });
    expect(flat(await page.locator("#pricing-modal").textContent())).not.toContain("US$");
    await cta.click();
    await page.waitForURL(CHECKOUT_PAGE);
    // The price shown is the price charged: the worker is asked for euros.
    expect(state.checkouts).toEqual([{ plan: "pro_monthly", provider: "creem", returnPath: "/index.html", currency: "EUR" }]);
  });

  test("control: a worker without the euro products shows Spain the US dollars it would charge, and the checkout asks for dollars", async ({ page }) => {
    const state = freshState({ eur: false });
    await install(page, state, { config: CREEM_ON_SALE });
    await open(page);
    const cta = await openPricing(page);
    // Wrong: "7,99 €" over a checkout that can only charge US$ 7.99.
    await expect.poll(() => dialogReads(page)).toEqual({
      region: `Tu región: España · ${DOLLARS_ES}`,
      rails: [railShown(CARD_ES, true)],
      monthly: "US$ 7.99",
      yearly: "US$ 49"
    });
    const modal = flat(await page.locator("#pricing-modal").textContent());
    expect(modal).not.toContain("€");
    expect(modal).not.toMatch(/euro/i);
    await cta.click();
    await page.waitForURL(CHECKOUT_PAGE);
    expect(state.checkouts).toEqual([{ plan: "pro_monthly", provider: "creem", returnPath: "/index.html", currency: "USD" }]);
  });
});

test.describe("truth-4: outside Peru and the Union, the terms' price is the dialog's", () => {
  test.use({ locale: "en-GB", timezoneId: "Europe/London" });

  test("the terms' price outside Peru is the price the dialog shows in the United Kingdom", async ({ page }) => {
    // Euros were decided for the Union only, so the United Kingdom, in Europe
    // and outside it, is where the terms' dollar price is checked now.
    await install(page, freshState({ eur: true }), { config: CREEM_ON_SALE });
    const terms = await termsPrices(page);
    // Wrong (before): "$7.99", a bare dollar sign, which is the peso in
    // Mexico, Argentina, Chile and Colombia.
    expect(terms.es.elsewhere).toEqual({ monthly: "US$ 7.99", yearly: "US$ 49" });
    expect(terms.en.elsewhere, "the English half states the same").toEqual(terms.es.elsewhere);
    await open(page);
    await openPricing(page);
    await expect.poll(() => dialogReads(page).then((d) => d.region)).toBe(`Tu región: Reino Unido · ${DOLLARS_ES}`);
    await expect.poll(() => dialogReads(page).then((d) => ({ monthly: d.monthly, yearly: d.yearly }))).toEqual(terms.es.elsewhere);
  });
});

/** Press Subscribe with the worker answering `reply`, and return the toast and where the page went. */
async function pressAgainst(page, reply, lang) {
  const state = freshState({ checkoutAnswer: reply });
  const { navigations } = await install(page, state, { config: CREEM_ON_SALE, lang });
  await open(page);
  const cta = await openPricing(page);
  await cta.click();
  return { state, navigations, toast: page.locator("#toast"), cta };
}

/** The worker's answer to the 13th checkout in a clock hour (rt/ratelimit.mjs). */
const RATE_LIMITED = [429, { ok: false, reason: "rate_limited", retryAfter: 3556 }];

test.describe("truth-6: a checkout refused for too many tries says when to come back", () => {
  test.use({ locale: "es-ES", timezoneId: "Europe/Madrid" });

  test("a 429 from the worker says to try again within an hour at most, not in a few minutes", async ({ page }) => {
    const { state, navigations, toast, cta } = await pressAgainst(page, RATE_LIMITED, "es");
    await expect(toast).toContainText("Demasiados intentos seguidos");
    // Wrong (before): "Espera unos minutos", where the worker's window, aligned
    // to the clock, can have 59 of them left.
    await expect(toast).toContainText(/una hora/);
    await expect(toast).not.toContainText(/minutos/);
    await expect(toast).toContainText("no se cobró nada");
    await expect(cta).toBeEnabled();
    expect(state.checkouts).toHaveLength(1);
    expect(navigations).toEqual([]);
  });

  test("control: a checkout that failed for another reason says to try again in a moment, with no hour in it", async ({ page }) => {
    const { toast } = await pressAgainst(page, [502, { ok: false, reason: "provider_error" }], "es");
    await expect(toast).toContainText("No pudimos abrir el pago y no se cobró nada");
    await expect(toast).not.toContainText(/hora/);
  });
});

test.describe("truth-6, in English", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  test("a 429 from the worker says to try again within the hour, not in a few minutes", async ({ page }) => {
    const { toast } = await pressAgainst(page, RATE_LIMITED, "en");
    await expect(toast).toContainText("Too many tries in a row");
    await expect(toast).toContainText(/within the hour/);
    await expect(toast).not.toContainText(/minutes/);
    await expect(toast).toContainText("nothing was charged");
  });

  test("control: a checkout that failed for another reason says to try again in a moment, with no hour in it", async ({ page }) => {
    const { toast } = await pressAgainst(page, [502, { ok: false, reason: "provider_error" }], "en");
    await expect(toast).toContainText("couldn't open the checkout, and nothing was charged");
    await expect(toast).not.toContainText(/hour/);
  });
});

/**
 * The privacy notice's paragraphs, flattened: the Spanish ones (outside the
 * English section) or the English ones.
 * @param {import('@playwright/test').Page} page Page.
 * @param {"es"|"en"} lang Which half.
 * @returns {Promise<string[]>}
 */
async function privacyParagraphs(page, lang) {
  await page.goto(`${BASE}/privacy.html`, { waitUntil: "domcontentloaded" });
  const texts = await page.evaluate((half) => {
    const inEnglish = (p) => !!p.closest('section[lang="en"]');
    return [...document.querySelectorAll("main p")].filter((p) => inEnglish(p) === (half === "en")).map((p) => p.textContent);
  }, lang);
  return texts.map(flat);
}

test.describe("the privacy notice says where the account's email goes", () => {
  test.use({ locale: "es-PE", timezoneId: "America/Lima" });

  test("in Spanish: the account paragraph says the email goes to Creem on a card checkout, and nothing says it is never shared", async ({ page }) => {
    const paras = await privacyParagraphs(page, "es");
    // The premise, read from the page: the recipients paragraph says the worker
    // hands Creem the account's email. That is what made the old sentence false.
    expect(paras.some((p) => /Creem/.test(p) && /le pasa el correo de tu cuenta/.test(p)), "the recipients paragraph names the email passed to Creem").toBe(true);
    const account = paras.filter((p) => p.includes("Guardamos tu correo"));
    expect(account, "exactly one paragraph says what an account keeps").toHaveLength(1);
    // Wrong (before): "No vendemos ni compartimos nada de eso".
    expect(account[0]).toMatch(/al abrir un pago con tarjeta, tu correo va a Creem/);
    expect(paras.filter((p) => /\b(ni|no) compartimos\b/.test(p)), "no paragraph says it is never shared").toEqual([]);
  });

  test("in English: the account paragraph says the email goes to Creem on a card checkout, and nothing says it is never shared", async ({ page }) => {
    const paras = await privacyParagraphs(page, "en");
    expect(paras.some((p) => /Creem/.test(p) && /passes it your account's email/.test(p)), "the recipients paragraph names the email passed to Creem").toBe(true);
    const account = paras.filter((p) => p.includes("Once signed in, we keep your email address"));
    expect(account, "exactly one paragraph says what an account keeps").toHaveLength(1);
    // Wrong (before): "We do not sell or share any of it".
    expect(account[0]).toMatch(/when you open a card checkout, your email address goes to Creem/);
    expect(paras.filter((p) => /\b(sell or share|never share|do not share)\b/.test(p)), "no paragraph says it is never shared").toEqual([]);
  });
});

// Markers for a launch blocker this branch may not fix: terms.html (another change's file) still says "Fuera de Perú:
// US$ 7.99 al mes o US$ 49 al año" / "Elsewhere: US$ 7.99 a month or US$ 49 a year" and states no euro price, while a
// European's dialog shows 7,99 € and 49 € (€7.99 and €49 in English). Each is green while its half of the terms
// disagrees, and turns red ("expected to fail, but passed") the day that half states the Union's price, e.g. "En la
// Unión Europea: 7,99 € al mes o 49 € al año, IVA incluido." / "In the European Union: €7.99 a month or €49 a year,
// VAT included.": then delete `.fail` and the comparison keeps the two equal for good. docs/40-GO-LIVE-GATE.md step 5
// lists it as a launch blocker. The dialog half is proved green on its own by the truth-4 tests above, so a failure
// there cannot hide behind `.fail`.
for (const half of [
  { lang: "es", heading: /^Precios$/, monthly: `7,99${NBSP}€`, yearly: `49${NBSP}€`, read: /(\d+(?:,\d{2})?) €[^.]*? (\d+(?:,\d{2})?) €/ },
  { lang: "en", heading: /^Prices$/, monthly: "€7.99", yearly: "€49", read: /(€\d+(?:\.\d{2})?)[^.]*?(€\d+(?:\.\d{2})?)/ }
]) {
  test.describe(`truth-4 under VG-85: the terms' price for the Union is the dialog's (${half.lang})`, () => {
    test.use({ locale: "es-ES", timezoneId: "Europe/Madrid" });

    test.fail(`the ${half.lang === "es" ? "Spanish" : "English"} terms state the euro price the dialog shows in Spain`, async ({ page }) => {
      await install(page, freshState({ eur: true }), { config: CREEM_ON_SALE, lang: half.lang });
      await open(page);
      await openPricing(page);
      await expect.poll(() => dialogReads(page).then((d) => ({ monthly: d.monthly, yearly: d.yearly }))).toEqual({
        monthly: half.monthly,
        yearly: half.yearly
      });
      await page.goto(`${BASE}/terms.html`, { waitUntil: "domcontentloaded" });
      const para = flat(await page.locator("main h2", { hasText: half.heading }).locator("xpath=following-sibling::p[1]").textContent());
      const euro = half.read.exec(para);
      // Wrong (today): no euro price in the terms, so a European is shown 7,99 € beside terms that say US$ 7.99.
      expect(euro && { monthly: euro[1] + (half.lang === "es" ? " €" : ""), yearly: euro[2] + (half.lang === "es" ? " €" : "") })
        .toEqual({ monthly: flat(half.monthly), yearly: flat(half.yearly) });
    });
  });
}
