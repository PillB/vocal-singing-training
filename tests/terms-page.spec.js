/**
 * terms.html: the page a recurring charge needs before it can exist.
 *
 * Mercado Pago's seller onboarding and every merchant of record ask for a live
 * terms URL, so this page is a prerequisite rather than paperwork. The tests
 * that matter here are the two that can go stale on their own: the page claims
 * nothing is on sale, which stops being true the moment a checkout link is
 * filled in, and the footer link has to exist in both languages or the page is
 * unreachable from the app.
 */
const fs = require("fs");
const path = require("path");
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const ROOT = path.join(__dirname, "..");

test.describe("terms of use", () => {
  test("both languages are there, with the sections a subscription needs", async ({ page }) => {
    await page.goto(BASE + "/terms.html", { waitUntil: "domcontentloaded" });
    // The page's first h1 is the header brand, as on privacy.html, so scope to main.
    await expect(page.locator("main h1").first()).toHaveText(/Términos de uso/);
    await expect(page.locator("#en")).toHaveText(/Terms of use/);

    for (const heading of [
      "Quién presta el servicio",
      "Precios",
      "Prueba gratis de 7 días",
      "Meses de regalo",
      "Cobro automático",
      "Cancelar",
      "Devoluciones",
      "Responsabilidad",
      "Ley aplicable"
    ]) {
      await expect(
        page.locator("h2", { hasText: heading }),
        `the Spanish page is missing "${heading}"`
      ).toHaveCount(1);
    }

    // The English block mirrors it; these are the ones a reader goes looking for.
    for (const heading of ["Prices", "Refunds", "Cancelling", "Gifted months"]) {
      await expect(
        page.locator("h2", { hasText: new RegExp(`^${heading}$`) }),
        `the English page is missing "${heading}"`
      ).toHaveCount(1);
    }
  });

  // Found by the copy pass on the merge of #26: "Haces falta tener 13 años"
  // says "you are needed", and the free plan was "the body of the exercises"
  // where the offer it describes says every exercise is free.
  test("the age line is grammatical and the free plan is every exercise, as the offer says", async ({ page }) => {
    await page.goto(BASE + "/terms.html", { waitUntil: "domcontentloaded" });
    const text = (await page.locator("main").textContent()).replace(/\s+/g, " ");
    expect(text).toContain("Hace falta tener 13 años");
    expect(text).not.toContain("Haces falta");
    expect(text).toContain("da acceso a todos los ejercicios");
    expect(text).toContain("gives you every exercise");
    expect(text).not.toMatch(/cuerpo de los ejercicios|body of the exercises/);
  });

  test("the prices on the page are the prices in the config", async ({ page }) => {
    await page.goto(BASE + "/terms.html", { waitUntil: "domcontentloaded" });
    const body = await page.locator("main").textContent();
    const config = fs.readFileSync(path.join(ROOT, "js", "billing-config.js"), "utf8");
    for (const [label, amount] of [
      ["monthly soles", "19.9"],
      ["yearly soles", "119.9"],
      ["monthly dollars", "7.99"],
      ["yearly dollars", "49"]
    ]) {
      expect(config, `billing-config no longer carries the ${label} price`).toContain(amount);
    }
    // \s: each sign is joined to its amount by a no-break space, so a price
    // never splits across lines (tests/node/terms-price-nowrap.test.mjs).
    expect(body).toMatch(/S\/\s19\.90 al mes/);
    expect(body).toMatch(/S\/\s119\.90 al año/);
    // Written US$ outside Peru: a bare "$" is the peso in Mexico, Argentina,
    // Chile and Colombia.
    expect(body).toMatch(/US\$\s7\.99 al mes/);
    expect(body).toMatch(/US\$\s49 al año/);
    // And the Union's price, in euros, the way Spanish writes it (VG-85).
    expect(body).toMatch(/7,99\s€ al mes/);
    expect(body).toMatch(/49\s€ al año/);
  });

  test("it only claims nothing is on sale while no checkout link exists", async ({ page }) => {
    const config = fs.readFileSync(path.join(ROOT, "js", "billing-config.js"), "utf8");
    // The links live as `pro_monthly: ""` / `pro_yearly: ""` under each provider.
    const links = [...config.matchAll(/pro_(?:monthly|yearly):\s*"([^"]*)"/g)].map((m) => m[1]);
    // A rail whose checkouts the worker opens is on sale with no link at all.
    const apiCheckout = /apiCheckout:\s*true/.test(config);
    const anyLink = apiCheckout || links.some((value) => value.trim() !== "");

    await page.goto(BASE + "/terms.html", { waitUntil: "domcontentloaded" });
    const body = await page.locator("main").textContent();
    if (anyLink) {
      expect(
        body,
        "a checkout link is configured, so the page must stop saying nothing is on sale"
      ).not.toMatch(/Hoy no hay nada en venta|Nothing is on sale today/);
    } else {
      expect(body).toMatch(/Hoy no hay nada en venta/);
      expect(body).toMatch(/Nothing is on sale today/);
    }
  });

  // Peru's Code art. 24.4 (added by DL 1729) wants complaint routes that are
  // accessible and work at no needless cost, and art. 47.c the right to leave
  // by the means used to sign up; a public GitHub repository is neither, once
  // money is taken (deploy-readiness legal check D3-11, 2026-11-21). The page
  // may keep it while nothing is sold; the commit that puts Pro on sale (gate
  // step 5) turns this red until step 2's address is in.
  test("once anything is on sale, cancelling, refunds and complaints go to an address, not the public repository", async ({ page }) => {
    const config = fs.readFileSync(path.join(ROOT, "js", "billing-config.js"), "utf8");
    const links = [...config.matchAll(/pro_(?:monthly|yearly):\s*"([^"]*)"/g)].map((m) => m[1]);
    const onSale = /apiCheckout:\s*true/.test(config) || links.some((value) => value.trim() !== "");
    await page.goto(BASE + "/terms.html", { waitUntil: "domcontentloaded" });
    const body = (await page.locator("main").textContent()).replace(/\s+/g, " ");
    const viaRepository = /(?:escribir|escríbenos|Escribiéndonos) por (?:ese|el) repositorio|through (?:that|the) repository/;
    if (!onSale) {
      // Nothing sold yet: the repository route is still on the page, which is
      // what makes the branch above a check of the commit that changes that.
      expect(body).toMatch(viaRepository);
      return;
    }
    expect(body, "on sale, and a canceller is still sent to a public repository").not.toMatch(viaRepository);
    expect(await page.locator('main a[href^="mailto:"]').count(), "and an address to write to is given").toBeGreaterThan(0);
  });

  // VG-86 and Creem's merchant terms (3.7). The cancel section promised "the
  // management link that will appear in the Pro window", a link that could not
  // appear on any live rail, and nothing said who sells the subscription. The
  // button's name is read from js/i18n.js, so renaming the button without the
  // terms (or the other way round) turns this red.
  test("both halves name who sells the subscription and send a canceller to the button that exists", async ({ page }) => {
    const i18n = fs.readFileSync(path.join(ROOT, "js", "i18n.js"), "utf8");
    const manage = [...i18n.matchAll(/"pricing\.manage": "([^"]+)"/g)].map((m) => m[1]);
    expect(manage, "pricing.manage in both languages").toHaveLength(2);
    await page.goto(BASE + "/terms.html", { waitUntil: "domcontentloaded" });
    const halves = {
      es: (await page.locator("main").evaluate((m) => [...m.children].filter((c) => c.tagName !== "SECTION").map((c) => c.textContent).join(" "))).replace(/\s+/g, " "),
      en: (await page.locator("main section[lang=en]").textContent()).replace(/\s+/g, " ")
    };
    const [manageEs, manageEn] = manage;
    for (const [lang, text, button] of [["es", halves.es, manageEs], ["en", halves.en, manageEn]]) {
      expect(text, `${lang}: the merchant of record is named`).toMatch(/Creem.{0,4}\(Armitage Labs OÜ, Estonia\)/);
      expect(text, `${lang}: the cancel route is the button the app shows`).toContain(button);
      expect(text, `${lang}: the old promise of a link that never appears`).not.toMatch(/que aparecerá en la ventana|that will appear in the Pro window/);
    }
    await expect(page.locator('main a[href="https://www.creem.io/buyer-terms"]')).toHaveCount(2);
  });

  test("the app and the privacy page both reach it, in both languages", async ({ page }) => {
    await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
    const footerLink = page.locator('.app-footer a[href="terms.html"]');
    await expect(footerLink).toHaveCount(1);
    await expect(footerLink).toHaveText(/Términos/);

    const i18n = fs.readFileSync(path.join(ROOT, "js", "i18n.js"), "utf8");
    expect(i18n, "footer.terms is missing a translation").toContain('"footer.terms": "Términos"');
    expect(i18n, "footer.terms is missing a translation").toContain('"footer.terms": "Terms"');

    await page.goto(BASE + "/privacy.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator('a[href="terms.html"]')).toHaveCount(1);
    await expect(page.locator('a[href="terms.html#en"]')).toHaveCount(1);
  });

  test("it points back at the privacy page and the app", async ({ page }) => {
    await page.goto(BASE + "/terms.html", { waitUntil: "domcontentloaded" });
    await expect(page.locator('a[href="privacy.html"]')).toHaveCount(1);
    await expect(page.locator('a[href="privacy.html#en"]')).toHaveCount(1);
    // The header's "← App", and each half's own way back, to its language's address (index.html's hreflang)
    await expect(page.locator('header a[href="./"]')).toHaveCount(1);
    await expect(page.locator('main a[href="./?lang=es"]:not(section[lang="en"] *)')).toHaveCount(1);
    await expect(page.locator('section[lang="en"] a[href="./?lang=en"]')).toHaveCount(1);
  });
});
