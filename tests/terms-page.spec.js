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
    expect(body).toMatch(/S\/ 19\.90 al mes/);
    expect(body).toMatch(/S\/ 119\.90 al año/);
    expect(body).toMatch(/\$7\.99 al mes/);
    expect(body).toMatch(/\$49 al año/);
  });

  test("it only claims nothing is on sale while no checkout link exists", async ({ page }) => {
    const config = fs.readFileSync(path.join(ROOT, "js", "billing-config.js"), "utf8");
    // The links live as `pro_monthly: ""` / `pro_yearly: ""` under each provider.
    const links = [...config.matchAll(/pro_(?:monthly|yearly):\s*"([^"]*)"/g)].map((m) => m[1]);
    const anyLink = links.some((value) => value.trim() !== "");

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
    await expect(page.locator('a[href="./"]')).toHaveCount(2);
  });
});
