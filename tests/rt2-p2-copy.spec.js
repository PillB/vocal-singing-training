/**
 * Two promises the pages make about paying, checked against what the Pro
 * window really does.
 *
 * Red team round two on the subscription branch:
 * - truth-3: once Creem is on sale (gate step 5) and before Mercado Pago is
 *   (step 6), a visitor from Peru can only buy on Creem, and the Pro window
 *   shows US$ 7.99. The terms priced Peru in soles ("En Perú: S/ 19.90 ...
 *   Fuera de Perú: US$ 7.99") and said "En Perú el cargo lo hace Mercado Pago";
 *   the privacy page said the same about who charges. The price follows the
 *   rail, not the country: Mercado Pago charges soles wherever the buyer is,
 *   Creem charges US$ wherever the buyer is, Peru included.
 * - truth-4: the offer to pay without an account said "as soon as you can sign
 *   in we move it to your account". The move happens only when the buyer signs
 *   in from this same browser (only adopt() in the browser holding the licence
 *   sends it; tests/checkout-bound.spec.js holds that it does), so the offer
 *   must say so.
 *
 * The price oracle is the Pro window itself: it is opened in Peru with both
 * rails on sale and each rail's prices are read off the cards, then each half
 * of the terms must state those prices against that rail's name. The checks
 * are pure functions with negative fixtures (round one's text) beside them.
 */
const { test, expect } = require("@playwright/test");
const { patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev";
const MP_MONTHLY = "https://www.mercadopago.com.pe/subscriptions/checkout?preapproval_plan_id=rt2p2_monthly";
const MP_YEARLY = "https://www.mercadopago.com.pe/subscriptions/checkout?preapproval_plan_id=rt2p2_yearly";
const CREEM_LINK = "https://www.creem.io/payment/prod_rt2p2_monthly";
/** Mercado Pago's short link, which the page allows as one of its hosts (DEFAULT_CHECKOUT_HOSTS). */
const MP_SHORT = "https://mpago.la/2AbCdEf";
/** Both rails on sale: Creem through the worker, Mercado Pago by its links. */
const BOTH_ON_SALE = { rails: { creem: { apiCheckout: true } }, links: { mercadopago: { pro_monthly: MP_MONTHLY, pro_yearly: MP_YEARLY } } };
/** The name each rail goes by on the pages. */
const RAIL_NAMES = { mercadopago: "Mercado Pago", creem: "Creem" };

const flat = (t) => String(t || "").replace(/\s+/g, " ").trim();

/** Sentences of a paragraph. A price's decimal point has no space after it, so it never ends one. */
function sentences(text) {
  return flat(text).split(/(?<=\.)\s+(?=[A-ZÁÉÍÓÚÑ¿])/);
}

/**
 * Every [rail, problem] where a terms price paragraph and the Pro window
 * disagree. "unpriced": no sentence names the rail together with both of its
 * prices. "country": a sentence binds a price to Peru or to outside it, when
 * the window shows that rail's price in Peru (the money follows the rail).
 * @param {string} paragraph The "Precios" / "Prices" paragraph.
 * @param {{[rail: string]: {monthly: string, yearly: string}}} shown Prices the window shows in Peru, per rail.
 */
function priceGaps(paragraph, shown) {
  const gaps = [];
  const all = sentences(paragraph);
  for (const [rail, price] of Object.entries(shown)) {
    const priced = all.filter((s) => s.includes(price.monthly) && s.includes(price.yearly));
    if (!priced.some((s) => s.includes(RAIL_NAMES[rail]))) gaps.push([rail, "unpriced"]);
    if (priced.some((s) => /^En Perú:|^In Peru:|Fuera de Perú|Elsewhere|outside Peru/.test(s))) gaps.push([rail, "country"]);
  }
  return gaps;
}

/** The sentences of a paragraph that say who charges or sells, binding Creem to outside Peru. */
function sellerByCountry(paragraph) {
  return sentences(paragraph).filter((s) => /Creem/.test(s) && /fuera de Perú|outside Peru|En Perú el cargo|In Peru the charge/i.test(s));
}

/** Stand the worker in: accounts on, and how this browser can sign in. */
async function standIn(page, authMethods) {
  await page.route(`${API}/**`, (route) => {
    const req = route.request();
    if (req.method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    }
    const p = new URL(req.url()).pathname;
    const body =
      p === "/v1/health"
        ? { ok: true, signingKeyConfigured: true, accountsConfigured: true, creemConfigured: true, creemCheckoutConfigured: true, creemPortalConfigured: true, mercadopagoConfigured: true, authMethods, siteOrigin: BASE }
        : p === "/v1/auth/methods"
          ? { ok: true, ...authMethods }
          : { ok: true };
    return route.fulfill({ status: 200, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  });
}

async function seed(page, lang) {
  await page.addInitScript((l) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", l);
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
  }, lang);
}

/** The monthly and yearly prices on the cards, for each rail the Peruvian Pro window offers. */
async function windowPricesInPeru(page) {
  await patchBillingConfig(page, BOTH_ON_SALE);
  await standIn(page, { email: true, google: false, googleClientId: null, trialDays: 7 });
  await seed(page, "es");
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTBilling, null, { timeout: 10000 });
  await page.locator("#btn-pricing").click();
  await expect(page.locator("#pricing-rails")).toBeVisible();
  const out = {};
  for (const rail of ["mercadopago", "creem"]) {
    const btn = page.locator(`#pricing-rails .rail-btn[data-rail="${rail}"]`);
    await btn.click();
    await expect(btn).toHaveAttribute("aria-pressed", "true");
    out[rail] = await page.evaluate(() => {
      const price = (id) => {
        const el = document.querySelector(`#pricing-grid .plan-card[data-plan="${id}"] .plan-price`);
        return el ? el.firstChild.textContent.trim() : null;
      };
      return { monthly: price("pro_monthly"), yearly: price("pro_yearly") };
    });
  }
  return out;
}

/** A paragraph of the terms by its heading, in each half. */
async function termsParagraph(page, headings) {
  await page.goto(`${BASE}/terms.html`, { waitUntil: "domcontentloaded" });
  const read = async (h) => flat(await page.locator("main h2", { hasText: h }).locator("xpath=following-sibling::p[1]").textContent());
  return { es: await read(headings.es), en: await read(headings.en) };
}

test.describe("truth-3: the terms and the privacy page price and name the seller by rail, not by country", () => {
  test.use({ locale: "es-PE", timezoneId: "America/Lima" });

  test("each rail the Peruvian Pro window sells on is priced in both halves of the terms as the window prices it", async ({ page }) => {
    const shown = await windowPricesInPeru(page);
    // Precondition, from the window itself: Peru is offered both rails, and
    // Creem's price there is in dollars (it cannot charge soles).
    expect(shown).toEqual({
      mercadopago: { monthly: "S/ 19.90", yearly: "S/ 119.90" },
      creem: { monthly: "US$ 7.99", yearly: "US$ 49" }
    });
    const prices = await termsParagraph(page, { es: /^Precios$/, en: /^Prices$/ });
    // Wrong (before): "En Perú: S/ 19.90 ... Fuera de Perú: US$ 7.99".
    expect(priceGaps(prices.es, shown), "es").toEqual([]);
    expect(priceGaps(prices.en, shown), "en").toEqual([]);
  });

  test("the sentences that say who charges do not bind Creem to outside Peru, on the terms or the privacy page", async ({ page }) => {
    const charge = await termsParagraph(page, { es: /^Cobro automático/, en: /^Automatic charging/ });
    expect(charge.es).toMatch(/Creem/);
    expect(charge.en).toMatch(/Creem/);
    // Wrong (before): "En Perú el cargo lo hace Mercado Pago. Con tarjeta, y fuera de Perú, ... Creem".
    expect(sellerByCountry(charge.es)).toEqual([]);
    expect(sellerByCountry(charge.en)).toEqual([]);
    await page.goto(`${BASE}/privacy.html`, { waitUntil: "domcontentloaded" });
    const list = {
      es: flat(await page.locator("#quien-recibe + p").textContent()),
      en: flat(await page.locator("#who-receives").textContent())
    };
    expect(list.es).toMatch(/Mercado Pago/);
    expect(sellerByCountry(list.es)).toEqual([]);
    expect(sellerByCountry(list.en)).toEqual([]);
  });

  test("control: round one's text is caught, and the rule by rail passes", () => {
    const shown = { mercadopago: { monthly: "S/ 19.90", yearly: "S/ 119.90" }, creem: { monthly: "US$ 7.99", yearly: "US$ 49" } };
    const roundOne = "En Perú: S/ 19.90 al mes o S/ 119.90 al año. Fuera de Perú: US$ 7.99 al mes o US$ 49 al año, en dólares de EE. UU. Los precios se muestran con los impuestos.";
    expect(priceGaps(roundOne, shown)).toEqual([
      ["mercadopago", "unpriced"],
      ["mercadopago", "country"],
      ["creem", "unpriced"],
      ["creem", "country"]
    ]);
    const byRail = "Con Mercado Pago: S/ 19.90 al mes o S/ 119.90 al año, en soles. Con tarjeta a través de Creem, también en Perú: US$ 7.99 al mes o US$ 49 al año.";
    expect(priceGaps(byRail, shown)).toEqual([]);
    expect(sellerByCountry("En Perú el cargo lo hace Mercado Pago. Con tarjeta, y fuera de Perú, la suscripción te la vende Creem (Armitage Labs OÜ, Estonia).")).toHaveLength(1);
    expect(sellerByCountry("Si pagas con tarjeta a través de Creem, estés en Perú o en otro país, la suscripción te la vende Creem.")).toEqual([]);
  });
});

/**
 * The offer's claims about where the purchase goes and how it ends: [problem]
 * for each way it is wrong. "promise": it says the move follows any sign-in.
 * "where": it does not say the purchase stays only in this browser, or that it
 * moves only from this same browser. "cancel": it does not say how to cancel
 * on the rail the link pays on, where the panel's Manage button, which needs
 * an account, will never be theirs.
 * @param {string} text The offer as shown.
 * @param {"es"|"en"} lang
 * @param {"creem"|"mercadopago"} rail The rail the plan's link pays on.
 */
function offerGaps(text, lang, rail) {
  const t = flat(text);
  const gaps = [];
  if (/en cuanto puedas entrar|as soon as you can sign in/i.test(t)) gaps.push("promise");
  const only = lang === "es" ? /solo en él/ : /only in it/;
  const same = lang === "es" ? /desde este mismo navegador/ : /from this same browser/;
  if (!only.test(t) || !same.test(t)) gaps.push("where");
  if (!CANCEL_ROUTE[lang][rail].test(t)) gaps.push("cancel");
  return gaps;
}

/** How each rail is cancelled without an account here, as the terms list it. */
const CANCEL_ROUTE = {
  es: { creem: /Para cancelar, usa el enlace que Creem te manda por correo/, mercadopago: /Para cancelar, entra a tu cuenta de Mercado Pago/ },
  en: { creem: /To cancel, use the link Creem emails you/, mercadopago: /To cancel, go to your Mercado Pago account/ }
};

test.describe("truth-4: the offer to pay without an account says where the purchase stays, when it moves, and how to cancel", () => {
  const ON_LINKS = {
    creem: { rails: { creem: { apiCheckout: true } }, links: { creem: { pro_monthly: CREEM_LINK } } },
    mercadopago: { links: { mercadopago: { pro_monthly: MP_MONTHLY, pro_yearly: MP_YEARLY } } },
    // The same rail by its short link: the offer follows the rail, not the
    // link's host (the www.mercadopago.com.pe case is its control).
    mpagoShort: { links: { mercadopago: { pro_monthly: MP_SHORT, pro_yearly: MP_SHORT } } }
  };
  const GOOGLE_ONLY = { email: false, google: true, googleClientId: "test-client.apps.googleusercontent.com", trialDays: 7 };

  for (const [lang, locale] of [["es", "es-PE"], ["en", "en-US"]]) {
    for (const [rail, links] of [["creem", "creem"], ["mercadopago", "mercadopago"], ["mercadopago", "mpagoShort"]]) {
      const by = links === "mpagoShort" ? " (its mpago.la short link)" : "";
      test(`${lang}, ${rail}${by}: the offer shown to a buyer whose browser cannot sign in says this browser only, this same browser to move it, and how to cancel there`, async ({ browser }) => {
        const context = await browser.newContext({ locale, timezoneId: "America/Lima" });
        const page = await context.newPage();
        try {
          // A content blocker refusing Google's script, as the real one does.
          await page.route("https://accounts.google.com/**", (route) => route.abort());
          await patchBillingConfig(page, ON_LINKS[links]);
          await standIn(page, GOOGLE_ONLY);
          await seed(page, lang);
          await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
          await page.waitForFunction(() => !!window.VTBilling && !!window.VTAccount, null, { timeout: 10000 });
          await page.locator("#btn-pricing").click();
          const railBtn = page.locator(`#pricing-rails .rail-btn[data-rail="${rail}"]`);
          if (await railBtn.isVisible()) await railBtn.click();
          await page.locator('#pricing-grid .plan-cta[data-plan="pro_monthly"]').click();
          const offer = page.locator("#account-pay-anyway");
          // Precondition: the VG-88 offer is what is on screen, for this rail's link.
          await expect(offer).toBeVisible({ timeout: 8000 });
          await expect(page.locator("#account-pay-anyway-btn")).toBeVisible();
          // Precondition: the plan's link is the one this case is about.
          expect(await page.evaluate((r) => window.VTBilling.checkoutUrl("pro_monthly", r), rail)).toBe(ON_LINKS[links].links[rail].pro_monthly);
          // Wrong (before): "as soon as you can sign in we move it to your account", and no way to cancel;
          // and, by the link's host, no way to cancel for a Mercado Pago short link.
          expect(offerGaps(await offer.locator("p").textContent(), lang, rail)).toEqual([]);
        } finally {
          await context.close();
        }
      });
    }
  }

  test("control: round one's offer is caught in both languages, and the corrected one passes", () => {
    expect(offerGaps("Puedes pagar igual desde este navegador. Tu Pro quedará en él, y en cuanto puedas entrar lo pasamos a tu cuenta.", "es", "creem")).toEqual(["promise", "where", "cancel"]);
    expect(offerGaps("You can still pay from this browser. Your Pro stays in it, and as soon as you can sign in we move it to your account.", "en", "creem")).toEqual(["promise", "where", "cancel"]);
    // Where and when, but not how to cancel: still a gap.
    expect(offerGaps("Tu Pro quedará guardado solo en él: para pasarlo a tu cuenta, entra más adelante desde este mismo navegador.", "es", "creem")).toEqual(["cancel"]);
    // Creem's route said for a Mercado Pago link: wrong rail.
    expect(offerGaps("Tu Pro quedará guardado solo en él: para pasarlo a tu cuenta, entra desde este mismo navegador. Para cancelar, usa el enlace que Creem te manda por correo.", "es", "mercadopago")).toEqual(["cancel"]);
    expect(offerGaps("Tu Pro quedará guardado solo en él: para pasarlo a tu cuenta, entra más adelante desde este mismo navegador. Para cancelar, usa el enlace que Creem te manda por correo después de cada pago, o escríbenos.", "es", "creem")).toEqual([]);
    expect(offerGaps("Your Pro will be kept only in it: to move it to your account, sign in later from this same browser. To cancel, go to your Mercado Pago account, under subscriptions, or write to us.", "en", "mercadopago")).toEqual([]);
  });

  test("the terms say how to cancel a subscription paid without an account, on each rail, in both halves", async ({ page }) => {
    await page.goto(`${BASE}/terms.html`, { waitUntil: "domcontentloaded" });
    const es = flat(await page.locator("#cancelar-sin-cuenta").textContent());
    const en = flat(await page.locator("#cancel-without-account").textContent());
    expect(es).toMatch(/sin entrar a una cuenta.*correo de Creem.*escríbenos.*cuenta de Mercado Pago/);
    expect(en).toMatch(/without signing in to an account.*Creem's email.*write to us.*Mercado Pago account/);
    // Each sentence is in its own half: the Spanish one outside the English section.
    expect(await page.locator("#cancelar-sin-cuenta").evaluate((p) => p.closest('section[lang="en"]') === null)).toBe(true);
    expect(await page.locator("#cancel-without-account").evaluate((p) => !!p.closest('section[lang="en"]'))).toBe(true);
  });
});
