/**
 * Euros for the European Union, US dollars everywhere else (VG-85, decided
 * 2026-11-22), in the Pro dialog a buyer actually sees, under the shipped
 * Content Security Policy.
 *
 * The rule: the price shown is the price charged (the Price Indication
 * Directive 98/6/EC art. 2(a) for a buyer in the Union, Peru's Ley 29571
 * art. 6 for a Peruvian). So a visitor in the Union is shown "7,99 €" (or
 * "€7.99" on the English page) only where the path that will charge them can
 * charge euros, and the checkout asks the worker for the money shown.
 *
 * The defects behind this file:
 * - an Austrian, a Pole, or an "en-US" browser in Warsaw shown dollars while
 *   the decision is euros (the page knew four member states, and read the
 *   language's "-us" before any European zone);
 * - a European shown "7,99 €" by a worker that has no euro products, so the
 *   checkout charges US$ 7.99 under a euro price;
 * - the press asking for dollars under a euro card (the worker was never told
 *   a currency);
 * - the British or the Swiss shown euros the decision does not give them;
 * - the dialog opened before /v1/health answered keeping its dollar cards
 *   after the answer said euros (it repainted the chrome and not the prices);
 *   then, fixed by drawing the dialog again, the answer taking the keyboard
 *   off the "N more" fold it was on and closing the fold, for every visitor;
 * - a European shown US$ on every page load's first opening, turning to € in
 *   front of them a round trip later (the worker was asked only then);
 * - a euro price with no word that it includes VAT (Germany's PAngV § 6(1)
 *   asks a distance seller to say so beside the price);
 * - VG-88's "continue to payment" (a browser that cannot sign in) sending a
 *   euro card to the dollar product's link.
 *
 * The oracle is what the buyer sees (the region line, both prices, the rail),
 * the body the page sends to POST /v1/me/checkout, and where a press
 * navigates. Every market's case reads the region line whole, so it proves
 * the browser's locale really put the page in that market.
 */
const { test, expect } = require("@playwright/test");
const { patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev";
const SESSION = "sess-euro-1";
const ACCOUNT = { id: "acct_euro_1", email: "buyer@example.test", trialUsed: true };
const CHECKOUT_PAGE = "https://checkout.creem.io/ch_euro_1";
const NBSP = " ";
const MP_MONTHLY = "https://www.mercadopago.com.pe/subscriptions/checkout?preapproval_plan_id=euro_monthly";
const MP_YEARLY = "https://www.mercadopago.com.pe/subscriptions/checkout?preapproval_plan_id=euro_yearly";
const USD_LINK = "https://www.creem.io/payment/prod_usd_monthly";
const EUR_LINK = "https://www.creem.io/payment/prod_eur_monthly";

/** Creem sold through the worker (docs/40 step 5), and Mercado Pago's links live too. */
const ON_SALE = {
  rails: { creem: { apiCheckout: true } },
  links: { mercadopago: { pro_monthly: MP_MONTHLY, pro_yearly: MP_YEARLY } }
};

const ES = { dollars: "precios en dólares de EE. UU. (US$)", euros: "precios en euros (€), IVA incluido", soles: "precios en soles (S/)", region: "Tu región" };
const EN = { dollars: "prices in US dollars (US$)", euros: "prices in euros (€), VAT included", region: "Your region" };

/** Mutable state of the stand-in worker. */
function freshState(over) {
  return { eur: true, checkouts: [], healthGate: null, healthAsked: 0, authMethods: null, googleRefused: 0, ...(over || {}) };
}

/** The worker's health: Creem's checkout open, and its euro products when `state.eur`. */
function health(state) {
  const out = {
    ok: true,
    signingKeyConfigured: true,
    accountsConfigured: true,
    creemConfigured: true,
    creemCheckoutConfigured: true,
    creemPortalConfigured: true,
    mercadopagoConfigured: true,
    authMethods: authMethods(state),
    siteOrigin: BASE
  };
  // Absent, not false, when off: a worker from before euros has no such field.
  if (state.eur) out.creemEurConfigured = true;
  return out;
}

/** How the stand-in signs people in: emailed codes unless the case says otherwise. */
function authMethods(state) {
  return state.authMethods || { email: true, google: false, googleClientId: null, trialDays: 7 };
}

/** The `/v1/me` answer for the signed-in, free account. */
function meBody() {
  return {
    ok: true,
    account: ACCOUNT,
    entitlement: { pro: false, plan: null, status: "free", source: null, periodEnd: null },
    grants: [],
    paid: [],
    licenseId: null,
    token: null
  };
}

/** What the stand-in worker answers, as `[status, body]`. */
async function answer(state, request) {
  const path = new URL(request.url()).pathname;
  if (path === "/v1/health") {
    state.healthAsked += 1;
    if (state.healthGate) await state.healthGate.promise;
    return [200, health(state)];
  }
  if (path === "/v1/events") return [200, { ok: true }];
  if (path === "/v1/auth/methods") return [200, { ok: true, ...authMethods(state) }];
  const signedIn = (request.headers().authorization || "") === `Bearer ${SESSION}`;
  if (path.startsWith("/v1/me") && !signedIn) return [401, { ok: false, reason: "no_session" }];
  if (path === "/v1/me") return [200, meBody()];
  if (path === "/v1/me/progress") return [200, { ok: true, profiles: [], rev: 0, doc: null, updatedAt: 1 }];
  if (path === "/v1/me/checkout") {
    let body = {};
    try {
      body = request.postDataJSON() || {};
    } catch {
      body = {};
    }
    state.checkouts.push(body);
    return [200, { ok: true, url: CHECKOUT_PAGE, plan: body.plan, provider: "creem" }];
  }
  return [404, { ok: false, reason: "not_found" }];
}

/** A promise that resolves when `open()` is called. */
function gate() {
  let open;
  const promise = new Promise((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/**
 * Stand the worker and the payment pages in, and seed the browser.
 * @param {import('@playwright/test').Page} page Page.
 * @param {object} state From `freshState`.
 * @param {{config?: object, lang?: string, signedOut?: boolean}} [opts] Config patch, page language, signed out.
 * @returns {Promise<{navigations: string[]}>} Every payment page the page went to.
 */
async function install(page, state, opts) {
  const o = opts || {};
  const navigations = [];
  await patchBillingConfig(page, o.config || ON_SALE);
  await page.route(`${API}/**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    }
    const [status, body] = await answer(state, route.request());
    return route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  });
  for (const glob of ["https://checkout.creem.io/**", "https://www.creem.io/**", "https://www.mercadopago.com.pe/**"]) {
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
      sessionStorage.setItem("vt_debug", "1");
      if (seed.session) localStorage.setItem("vt_account_session_v1", JSON.stringify({ token: seed.session, expiresAt: 4102444800 }));
    } catch {
      /* ignore */
    }
  }, { session: o.signedOut ? null : SESSION, lang: o.lang || "es" });
  return { navigations };
}

/** Load the app; signed in unless `signedOut`, in which case only wait for the scripts. */
async function open(page, signedOut) {
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTBilling && !!window.VTAccount && !!window.VTLicense, null, { timeout: 10000 });
  if (!signedOut) {
    await expect.poll(() => page.evaluate(() => window.VTAccount.getState()?.account?.email || null)).toBe(ACCOUNT.email);
  }
}

/** Open the Pro dialog and return a plan's Subscribe button. */
async function openPricing(page, planId) {
  await page.locator("#btn-pro, #btn-pricing, [data-open-pricing]").first().click();
  await expect(page.locator("#pricing-modal")).toBeVisible();
  return page.locator(`#pricing-modal .plan-cta[data-plan="${planId || "pro_monthly"}"]`);
}

/**
 * The region line, the rail marked chosen, and the three prices without their interval. With `openFirst`, the dialog
 * is opened in the same task, so what is read is its first paint, before any answer can land.
 */
function dialogReads(page, openFirst) {
  return page.evaluate((opening) => {
    if (opening) document.querySelector("#btn-pro, #btn-pricing, [data-open-pricing]").click();
    const price = (plan) => {
      const el = document.querySelector(`#pricing-grid .plan-card[data-plan="${plan}"] .plan-price`);
      return el && el.firstChild ? el.firstChild.textContent.trim() : null;
    };
    const chosen = document.querySelector('#pricing-rails .rail-btn[aria-pressed="true"]');
    const region = document.querySelector("#pricing-region-label");
    return {
      region: region ? region.textContent.trim() : null,
      rail: chosen ? chosen.dataset.rail : null,
      free: price("free"),
      monthly: price("pro_monthly"),
      yearly: price("pro_yearly")
    };
  }, !!openFirst);
}

/** What a European in each language is shown when euros can be charged, and when they cannot. */
function euroCards(name, lang) {
  const words = lang === "en" ? EN : ES;
  return {
    euros: lang === "en"
      ? { region: `${words.region}: ${name} · ${words.euros}`, rail: "creem", free: "€0", monthly: "€7.99", yearly: "€49" }
      : { region: `${words.region}: ${name} · ${words.euros}`, rail: "creem", free: `0${NBSP}€`, monthly: `7,99${NBSP}€`, yearly: `49${NBSP}€` },
    dollars: { region: `${words.region}: ${name} · ${words.dollars}`, rail: "creem", free: "US$ 0", monthly: "US$ 7.99", yearly: "US$ 49" }
  };
}

// Four visitors in the Union, as the decision's own examples: a Spanish browser in Madrid, an Austrian German one in
// Vienna, an American English one in Warsaw (the zone outranks the "-US"), and a Polish one, on a Spanish and an
// English page.
const UNION = [
  { locale: "es-ES", timezoneId: "Europe/Madrid", lang: "es", name: "España" },
  { locale: "de-AT", timezoneId: "Europe/Vienna", lang: "es", name: "Austria" },
  { locale: "en-US", timezoneId: "Europe/Warsaw", lang: "en", name: "Poland" },
  { locale: "pl-PL", timezoneId: "Europe/Warsaw", lang: "es", name: "Polonia" }
];

for (const v of UNION) {
  test.describe(`a ${v.locale} browser in ${v.timezoneId}`, () => {
    test.use({ locale: v.locale, timezoneId: v.timezoneId });
    const shown = euroCards(v.name, v.lang);

    test(`is shown the euro price on the card rail once the worker sells in euros, and Subscribe asks for euros`, async ({ page }) => {
      const state = freshState({ eur: true });
      const { navigations } = await install(page, state, { lang: v.lang });
      await open(page);
      const cta = await openPricing(page, "pro_yearly");
      // Wrong: dollars for a buyer in the Union whose euro product is there.
      await expect.poll(() => dialogReads(page)).toEqual(shown.euros);
      await expect(page.locator("#pricing-modal")).not.toContainText("US$");
      await cta.click();
      await page.waitForURL(CHECKOUT_PAGE);
      expect(state.checkouts).toEqual([{ plan: "pro_yearly", provider: "creem", returnPath: "/index.html", currency: "EUR" }]);
      expect(navigations).toEqual([CHECKOUT_PAGE]);
    });

    test(`control: with a worker that has no euro products, is shown and charged US dollars`, async ({ page }) => {
      const state = freshState({ eur: false });
      await install(page, state, { lang: v.lang });
      await open(page);
      const cta = await openPricing(page, "pro_yearly");
      // Wrong: a euro price over a checkout that can only charge dollars.
      await expect.poll(() => dialogReads(page)).toEqual(shown.dollars);
      await expect(page.locator("#pricing-modal")).not.toContainText("€");
      await cta.click();
      await page.waitForURL(CHECKOUT_PAGE);
      expect(state.checkouts).toEqual([{ plan: "pro_yearly", provider: "creem", returnPath: "/index.html", currency: "USD" }]);
    });
  });
}

// Europe outside the Union, and Peru: the same worker selling euros changes nothing for them.
for (const v of [
  { locale: "en-GB", timezoneId: "Europe/London", name: "Reino Unido", rail: "creem", monthly: "US$ 7.99", yearly: "US$ 49", words: ES.dollars, currency: "USD" },
  { locale: "de-CH", timezoneId: "Europe/Zurich", name: "resto del mundo", rail: "creem", monthly: "US$ 7.99", yearly: "US$ 49", words: ES.dollars, currency: "USD" },
  { locale: "es-PE", timezoneId: "America/Lima", name: "Perú", rail: "mercadopago", monthly: "S/ 19.90", yearly: "S/ 119.90", words: ES.soles, currency: null }
]) {
  test.describe(`control: a ${v.locale} browser in ${v.timezoneId}`, () => {
    test.use({ locale: v.locale, timezoneId: v.timezoneId });

    test(`is shown ${v.monthly} on its own rail, with the worker selling euros`, async ({ page }) => {
      const state = freshState({ eur: true });
      const { navigations } = await install(page, state);
      await open(page);
      const cta = await openPricing(page);
      await expect.poll(() => dialogReads(page).then(({ free, ...d }) => d)).toEqual({
        region: `${ES.region}: ${v.name} · ${v.words}`,
        rail: v.rail,
        monthly: v.monthly,
        yearly: v.yearly
      });
      await expect(page.locator("#pricing-grid")).not.toContainText("€");
      await cta.click();
      if (v.currency) {
        await page.waitForURL(CHECKOUT_PAGE);
        expect(state.checkouts.map((c) => c.currency)).toEqual([v.currency]);
      } else {
        // Peru's own rail is Mercado Pago's pasted plan, in soles; no worker checkout at all.
        await expect.poll(() => navigations).toEqual([MP_MONTHLY]);
        expect(state.checkouts).toEqual([]);
      }
    });
  });
}

/** Where the keyboard is, read through the handle of the element it should be on. */
function keyboardOn(handle) {
  return handle.evaluate((el) => ({
    connected: el.isConnected,
    focused: el === document.activeElement,
    open: el.closest("details") ? el.closest("details").open : null
  }));
}

/** Put the keyboard on a card's "N more" fold and open it with Enter; returns the summary's handle. */
async function openFold(page, planId) {
  const summary = page.locator(`#pricing-grid .plan-card[data-plan="${planId}"] details.plan-more > summary`);
  await summary.focus();
  await page.keyboard.press("Enter");
  await expect(summary.locator("xpath=..")).toHaveAttribute("open", "");
  return summary.elementHandle();
}

test.describe("the dialog open before the worker has said whether it sells in euros", () => {
  test.describe("in Madrid", () => {
    test.use({ locale: "es-ES", timezoneId: "Europe/Madrid" });

    test("turns the prices from US$ to € in place, and the keyboard stays on the fold it opened", async ({ page }) => {
      const state = freshState({ eur: true, healthGate: gate() });
      await install(page, state);
      await open(page);
      const cta = await openPricing(page);
      // Precondition: no answer yet, so the price a press would now be charged.
      await expect.poll(() => dialogReads(page).then((d) => d.monthly)).toBe("US$ 7.99");
      const fold = await openFold(page, "pro_monthly");
      const button = await cta.elementHandle();
      state.healthGate.open();
      // Wrong (first): the answer repainted the chrome and left the dollar cards.
      await expect.poll(() => dialogReads(page)).toEqual(euroCards("España", "es").euros);
      // Wrong (then): the cards drawn again, so the keyboard fell to <body> and the fold closed.
      expect(await keyboardOn(fold)).toEqual({ connected: true, focused: true, open: true });
      expect(await button.evaluate((b) => b.isConnected), "the plan's button is the one drawn first").toBe(true);
    });

    test("repaints the yearly saving in the money now on screen, when the euro price saves a different share", async ({ page }) => {
      const state = freshState({ eur: true, healthGate: gate() });
      await install(page, state);
      // A euro yearly of 59,88 € saves 38% against 7,99 € a month; the dollar one, 49%.
      await page.addInitScript(() => {
        const earlier = Object.getOwnPropertyDescriptor(window, "VT_BILLING_CONFIG");
        let held;
        Object.defineProperty(window, "VT_BILLING_CONFIG", {
          configurable: true,
          get: () => held,
          set: (value) => {
            if (earlier && earlier.set) earlier.set(value);
            held = value;
            const yearly = value && (value.plans || []).find((p) => p.id === "pro_yearly");
            if (yearly) yearly.priceEur = 59.88;
          }
        });
      });
      await open(page);
      await openPricing(page);
      const badge = () => page.locator('#pricing-grid .plan-card[data-plan="pro_yearly"] .plan-badge').textContent();
      await expect.poll(() => dialogReads(page).then((d) => d.yearly)).toBe("US$ 49");
      expect(await badge()).toBe("Ahorra 49%");
      state.healthGate.open();
      await expect.poll(() => dialogReads(page).then((d) => d.yearly)).toBe(`59,88${NBSP}€`);
      // Wrong: the badge worked out in dollars beside a price in euros.
      expect(await badge()).toBe("Ahorra 38%");
    });

    test("keeps the keyboard on the payment-method button it was on", async ({ page }) => {
      const state = freshState({ eur: true, healthGate: gate() });
      await install(page, state);
      await open(page);
      await openPricing(page);
      await expect.poll(() => dialogReads(page).then((d) => [d.rail, d.monthly])).toEqual(["creem", "US$ 7.99"]);
      const rail = page.locator('#pricing-rails .rail-btn[data-rail="creem"]');
      await rail.focus();
      const handle = await rail.elementHandle();
      state.healthGate.open();
      await expect.poll(() => dialogReads(page).then((d) => d.monthly)).toBe(`7,99${NBSP}€`);
      // Wrong: the rail buttons drawn again, and the keyboard left on the one removed.
      expect(await keyboardOn(handle)).toEqual({ connected: true, focused: true, open: null });
    });
  });

  test.describe("control: in New York, where the answer changes no price", () => {
    test.use({ locale: "en-US", timezoneId: "America/New_York" });

    test("the answer leaves the keyboard, and the fold, where they were", async ({ page }) => {
      const state = freshState({ eur: true, healthGate: gate() });
      await install(page, state, { lang: "en" });
      await open(page);
      await openPricing(page);
      await expect.poll(() => dialogReads(page).then((d) => d.monthly)).toBe("$7.99");
      const fold = await openFold(page, "pro_monthly");
      state.healthGate.open();
      await expect.poll(() => page.evaluate(() => !!window.VTAccount.knownRails())).toBe(true);
      // The answer's own repaint has run by the next task; it changed no price.
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => resolve())));
      expect((await dialogReads(page)).monthly).toBe("$7.99");
      // Wrong: the whole dialog drawn again for an answer that changed nothing on it.
      expect(await keyboardOn(fold)).toEqual({ connected: true, focused: true, open: true });
    });
  });
});

/** Let the page go idle, and a little past it: long enough for a call it queued for idle time to have gone out. */
function pastIdle(page) {
  return page.evaluate(() => new Promise((resolve) => {
    requestIdleCallback(() => setTimeout(resolve, 400), { timeout: 3000 });
  }));
}

test.describe("a European whose page has been open a moment", () => {
  test.use({ locale: "es-ES", timezoneId: "Europe/Madrid" });

  test("opens the dialog on the euro price: the worker was asked when the page went idle, not when the dialog opened", async ({ page }) => {
    const state = freshState({ eur: true });
    await install(page, state);
    await open(page);
    await pastIdle(page);
    // Wrong (before): /v1/health was asked only by opening the dialog, so its first paint was US$, then €.
    await expect.poll(() => page.evaluate(() => window.VTAccount.knownRails()?.creemEur ?? null)).toBe(true);
    expect(await dialogReads(page, true)).toEqual(euroCards("España", "es").euros);
    expect(state.healthAsked, "asked once, at idle; the dialog used that answer").toBe(1);
  });
});

test.describe("control: an American's page asks the worker nothing before the dialog opens", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  test("no /v1/health until the dialog opens, and then one", async ({ page }) => {
    const state = freshState({ eur: true });
    await install(page, state, { lang: "en" });
    await open(page);
    await pastIdle(page);
    // Wrong: everyone asked at load, for an answer that changes nothing on an American's cards.
    expect(state.healthAsked).toBe(0);
    expect(await dialogReads(page, true)).toEqual({
      region: `${EN.region}: United States · ${EN.dollars}`,
      rail: "creem",
      free: "$0",
      monthly: "$7.99",
      yearly: "$49"
    });
    await expect.poll(() => state.healthAsked).toBe(1);
  });
});

test.describe("VG-88: a browser that cannot sign in pays by the link in the money its card shows", () => {
  const GOOGLE_ONLY = { email: false, google: true, googleClientId: "test-client.apps.googleusercontent.com", trialDays: 7 };

  /** Press Subscribe signed out with Google's script refused; the press lands on the account panel. */
  async function pressSignedOut(page, state, creem) {
    await page.route("https://accounts.google.com/**", (route) => {
      state.googleRefused += 1;
      return route.abort();
    });
    const { navigations } = await install(page, state, { signedOut: true, lang: "en", config: { rails: { creem: { apiCheckout: true, ...creem } } } });
    await open(page, true);
    const cta = await openPricing(page);
    await cta.click();
    await expect(page.locator("#account-modal")).toBeVisible();
    return navigations;
  }

  test.describe("in Madrid, on a worker that sells in euros", () => {
    test.use({ locale: "es-ES", timezoneId: "Europe/Madrid" });

    test("with the euro product's link, the offer shows and pays by that link", async ({ page }) => {
      const state = freshState({ eur: true, authMethods: GOOGLE_ONLY });
      const navigations = await pressSignedOut(page, state, { links: { pro_monthly: USD_LINK, pro_yearly: "" }, linksEur: { pro_monthly: EUR_LINK, pro_yearly: "" } });
      await expect(page.locator("#account-pay-anyway")).toBeVisible({ timeout: 8000 });
      await page.locator("#account-pay-anyway-btn").click();
      // Wrong: the dollar product's link under a card that said €7.99.
      await expect.poll(() => navigations).toEqual([EUR_LINK]);
    });

    test("with only the dollar product's link, there is no offer: it would charge a price the card does not show", async ({ page }) => {
      const state = freshState({ eur: true, authMethods: GOOGLE_ONLY });
      const navigations = await pressSignedOut(page, state, { links: { pro_monthly: USD_LINK, pro_yearly: "" } });
      // The precondition the offer waits for: Google was refused, so this browser cannot sign in.
      await expect.poll(() => state.googleRefused, { timeout: 8000 }).toBeGreaterThan(0);
      await expect(page.locator("#account-signin-blocked")).toBeVisible({ timeout: 8000 });
      await expect(page.locator("#account-pay-anyway")).toBeHidden();
      expect(navigations).toEqual([]);
    });
  });

  test.describe("control: in New York, the same configuration", () => {
    test.use({ locale: "en-US", timezoneId: "America/New_York" });

    test("the offer shows and pays by the dollar product's link", async ({ page }) => {
      const state = freshState({ eur: true, authMethods: GOOGLE_ONLY });
      const navigations = await pressSignedOut(page, state, { links: { pro_monthly: USD_LINK, pro_yearly: "" }, linksEur: { pro_monthly: EUR_LINK, pro_yearly: "" } });
      await expect(page.locator("#account-pay-anyway")).toBeVisible({ timeout: 8000 });
      await page.locator("#account-pay-anyway-btn").click();
      await expect.poll(() => navigations).toEqual([USD_LINK]);
    });
  });
});
