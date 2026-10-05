/**
 * Every view has an address (js/app.js, "Addresses"): #plan, #historial and
 * #ejercicio/<id>, with Practicar at the bare page. The browser's Back and
 * Forward move between views without leaving the site, and a reload or a
 * shared link opens the view it names.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page, hash = "") {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
  });
  await page.goto(`${BASE}/index.html${hash}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
}

const active = (page) => page.evaluate(() => document.querySelector(".view.active")?.id);
const hash = (page) => page.evaluate(() => location.hash);

test("Plan and Historial get addresses; Back and Forward move between them inside the site", async ({ page }) => {
  await boot(page);
  expect(await active(page)).toBe("view-home");
  expect(await hash(page)).toBe("");
  await page.click("#btn-history");
  await expect(page.locator("#view-history")).toHaveClass(/active/);
  expect(await hash(page)).toBe("#historial");
  await page.click("#btn-plan");
  await expect(page.locator("#view-plan")).toHaveClass(/active/);
  expect(await hash(page)).toBe("#plan");
  await page.goBack();
  await expect(page.locator("#view-history")).toHaveClass(/active/);
  expect(await hash(page)).toBe("#historial");
  await page.goBack();
  await expect(page.locator("#view-home")).toHaveClass(/active/);
  expect(await hash(page)).toBe("");
  expect(page.url()).toContain("/index.html");
  await page.goForward();
  await expect(page.locator("#view-history")).toHaveClass(/active/);
});

test("a reload or a shared link opens the view the address names", async ({ page }) => {
  await boot(page, "#plan");
  await expect(page.locator("#view-plan")).toHaveClass(/active/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
  await expect(page.locator("#view-plan")).toHaveClass(/active/);
  await page.goto(`${BASE}/index.html#ejercicio/s4-lip-trills`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  // An address this file does not own is left alone.
  await page.goto(`${BASE}/index.html#nada`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
  await expect(page.locator("#view-home")).toHaveClass(/active/);
});

test("an exercise has its own address, and Back from it returns to where it was opened", async ({ page }) => {
  await boot(page);
  await page.click("#btn-history");
  await expect(page.locator("#view-history")).toHaveClass(/active/);
  await page.evaluate(() => VTApp.openExercise("s4-lip-trills"));
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  expect(await hash(page)).toBe("#ejercicio/s4-lip-trills");
  await page.goBack();
  await expect(page.locator("#view-history")).toHaveClass(/active/);
  expect(await hash(page)).toBe("#historial");
});
