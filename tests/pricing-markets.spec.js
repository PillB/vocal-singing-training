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
 *   US$ outside Peru. One of the two was wrong in every configuration.
 * - truth-6: the busy toast for the worker's hourly checkout limit said to wait
 *   "a few minutes", where the clock-aligned window can have 59 of them left.
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
 * tests/helpers/billing.js and trimmed to the two keys this file uses, each set
 * on rails that exist: `links: { rail: { plan: url } }` and
 * `rails: { rail: { key: value } }`. A rail the config does not have throws,
 * so a typo fails the page's config rather than testing nothing.
 * @param {import('@playwright/test').Page} page Page.
 * @param {{links?: object, rails?: object}} patch What to set.
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
      }
    });
  }, patch || {});
}

/** Mutable state of the stand-in worker: the checkouts asked for, and how to answer the next. */
function freshState(over) {
  return { checkouts: [], checkoutAnswer: null, ...(over || {}) };
}

/** The worker's health: Creem's checkout and Mercado Pago both able to take money. */
function health() {
  return {
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
  "/v1/health": () => [200, health()],
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
  if (OPEN_ROUTES[path]) return OPEN_ROUTES[path]();
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

// truth-3: the three Latin American markets that used to name Mercado Pago.
for (const market of [
  { code: "AR", name: "Argentina", locale: "es-AR", timezoneId: "America/Argentina/Buenos_Aires" },
  { code: "CL", name: "Chile", locale: "es-CL", timezoneId: "America/Santiago" },
  { code: "CO", name: "Colombia", locale: "es-CO", timezoneId: "America/Bogota" }
]) {
  test.describe(`truth-3: ${market.name} buys on Creem, in US dollars`, () => {
    test.use({ locale: market.locale, timezoneId: market.timezoneId });

    test(`${market.name} is put on the card rail with Mercado Pago live, shown US$ in US dollars, and Subscribe opens a Creem checkout`, async ({ page }) => {
      const state = freshState();
      const { navigations } = await install(page, state, { config: BOTH_ON_SALE });
      await open(page);
      const cta = await openPricing(page);
      // Mercado Pago is live and drawn (the control beside the claim: there was
      // a choice to make, so the card rail being chosen is the market's, not the
      // only rail there was), and its button says whose it is. Wrong (before):
      // the market named Mercado Pago, so the dialog chose it first, under a
      // dollar price, for a Peruvian plan that charges soles; and the button
      // said "Perú / LATAM".
      await expect.poll(() => dialogReads(page)).toEqual({
        region: `Tu región: ${market.name} · ${DOLLARS_ES}`,
        rails: [railShown(CARD_ES, true), railShown(MP_ES, false)],
        monthly: "US$ 7.99",
        yearly: "US$ 49"
      });
      // Creem sells on the rail chosen, so the dialog says so before paying.
      await expect(page.locator("#pricing-mor-note")).toBeVisible();
      await cta.click();
      await page.waitForURL(CHECKOUT_PAGE);
      expect(state.checkouts).toEqual([{ plan: "pro_monthly", provider: "creem", returnPath: "/index.html" }]);
      expect(navigations, "nothing went to the Peruvian Mercado Pago plan").toEqual([CHECKOUT_PAGE]);
    });

    test(`${market.name}, picking the Mercado Pago (Perú) rail, is shown the soles its Peruvian plan charges`, async ({ page }) => {
      // Second round: the card rail above was right, but one press on the
      // other button showed "US$ 7.99" over a Peruvian plan that charges
      // S/ 19.90, because any rail but the market's own was priced in dollars.
      const state = freshState();
      const { navigations } = await install(page, state, { config: BOTH_ON_SALE });
      await open(page);
      const cta = await openPricing(page);
      await page.locator('#pricing-rails [data-rail="mercadopago"]').click();
      await expect.poll(() => dialogReads(page)).toEqual({
        region: `Tu región: ${market.name} · ${SOLES_ES}`,
        rails: [railShown(CARD_ES, false), railShown(MP_ES, true)],
        monthly: "S/ 19.90",
        yearly: "S/ 119.90"
      });
      // What the press charges is what was shown: the Peruvian plan.
      await cta.click();
      await expect.poll(() => navigations.map((u) => new URL(u).host)).toEqual([MP_HOST]);
      expect(state.checkouts, "and no Creem checkout was opened").toEqual([]);
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

test.describe("truth-4: Spain is shown the US dollars Creem charges, never euros", () => {
  test.use({ locale: "es-ES", timezoneId: "Europe/Madrid" });

  test("Spain is shown US$ 7.99 and US$ 49, the region line names US dollars, and no euro sign appears", async ({ page }) => {
    await install(page, freshState(), { config: CREEM_ON_SALE });
    await open(page);
    await openPricing(page);
    // Wrong (before): "€7.99" and "precios en euros (€)", for a product Creem
    // charges in dollars, beside terms saying US$ outside Peru.
    await expect.poll(() => dialogReads(page)).toEqual({
      region: `Tu región: España · ${DOLLARS_ES}`,
      rails: [railShown(CARD_ES, true)],
      monthly: "US$ 7.99",
      yearly: "US$ 49"
    });
    const modal = flat(await page.locator("#pricing-modal").textContent());
    expect(modal).not.toContain("€");
    expect(modal).not.toMatch(/euro/i);
  });

  test("the terms' price outside Peru is the price the dialog shows in Spain", async ({ page }) => {
    await install(page, freshState(), { config: CREEM_ON_SALE });
    const terms = await termsPrices(page);
    // Wrong (before): "$7.99", a bare dollar sign, which is the peso in
    // Mexico, Argentina, Chile and Colombia.
    expect(terms.es.elsewhere).toEqual({ monthly: "US$ 7.99", yearly: "US$ 49" });
    expect(terms.en.elsewhere, "the English half states the same").toEqual(terms.es.elsewhere);
    await open(page);
    await openPricing(page);
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
