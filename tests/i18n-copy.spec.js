/**
 * End-user copy / i18n: folded guide Spanish, lang toggle, no meta footer.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function bootEs(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
}

test.describe("Copy & i18n (learner-facing)", () => {
  test("Spanish folded guide shows Spanish steps (not English-only)", async ({ page }) => {
    await bootEs(page);
    // Open first vocal exercise card
    await page.locator("#exercise-list .card-ex").first().click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    // Expand folded guide
    await page.locator("#btn-toggle-guide").click();
    await expect(page.locator("#guide-body")).toBeVisible();
    const stepText = await page.locator("#ex-steps li").first().textContent();
    expect(stepText).toBeTruthy();
    // Known ES from locale pack for v1-diction (first basic)
    expect(stepText).toMatch(/Elige|página|libro|artículo|Inhala|Cuenta|Saca|Coloca/i);
    // Should not be the English first step of diction exercise
    expect(stepText).not.toMatch(/^Pick a short page/i);
    // Original label learner-facing
    const orig = await page.locator("#ex-original").textContent();
    expect(orig).toMatch(/En pocas palabras|In short/i);
  });

  test("English lang shows English guide steps", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", "en");
        sessionStorage.setItem("vt_e2e", "1");
      } catch {
        /* ignore */
      }
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.locator("#exercise-list .card-ex").first().click();
    await page.locator("#btn-toggle-guide").click();
    const stepText = await page.locator("#ex-steps li").first().textContent();
    expect(stepText).toMatch(/Pick a short page|Inhale|Gently stick|Place a clean/i);
  });

  test("footer has no homework filename meta", async ({ page }) => {
    await bootEs(page);
    const foot = await page.locator(".app-footer").textContent();
    expect(foot).not.toMatch(/Homework\.md/i);
    expect(foot).toMatch(/Privacidad|Privacy|dispositivo|device/i);
  });

  test("locale pack and exField exist", async ({ page }) => {
    await bootEs(page);
    const r = await page.evaluate(() => {
      const pack = window.VT_EXERCISE_LOCALE_ES;
      const ex = window.VT_EXERCISES?.vocal?.[0];
      const step0 = window.VTI18n?.exField?.(ex, "steps")?.[0];
      return {
        packN: pack ? Object.keys(pack).length : 0,
        step0,
        lang: window.VTI18n?.lang
      };
    });
    expect(r.packN).toBeGreaterThanOrEqual(30);
    expect(r.lang).toBe("es");
    expect(r.step0).toMatch(/Elige|Inhala|Saca|Coloca|Escribe|Practica/i);
  });
});
