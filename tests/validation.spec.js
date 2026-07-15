const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

test.describe("Integrated practice cockpit validation", () => {
  test("home has continue CTA and dual tabs", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator("#btn-continue")).toBeVisible();
    await expect(page.locator('.tab[data-tab="vocal"]')).toBeVisible();
    await expect(page.locator('.tab[data-tab="singing"]')).toBeVisible();
    await expect(page.locator("#exercise-list .card-ex").first()).toBeVisible();
  });

  test("exercise has single Start practice primary control", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").first().click();
    await expect(page.locator("#practice-cockpit")).toBeVisible();
    await expect(page.locator("#btn-practice-start")).toBeVisible();
    await expect(page.locator("#btn-practice-start")).toContainText("Start practice");
    // Fragmented peer starts should not be user-visible primary UI
    await expect(page.locator("#btn-pitch-start")).toBeHidden();
    await expect(page.locator("#btn-hold-start")).toBeHidden();
    await expect(page.locator("#btn-timer-start")).toBeHidden();
  });

  test("singing vocal fry shows integrated pitch + hold in cockpit", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").first().click();
    await expect(page.locator("#ex-title")).toContainText("Vocal Fry");
    await expect(page.locator("#pitch-block")).toBeVisible();
    await expect(page.locator("#hold-block")).toBeVisible();
    await expect(page.locator("#hold-display")).toBeVisible();
    await expect(page.locator("#piano-block")).toBeVisible();
    await expect(page.locator("#chk-sustain")).toBeVisible();
    await expect(page.locator("#btn-practice-start")).toBeVisible();
  });

  test("solfege has sustain + auto piano option in cockpit", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").nth(1).click();
    await expect(page.locator("#chk-sustain")).toBeChecked();
    await expect(page.locator("#chk-auto-piano")).toBeVisible();
    await expect(page.locator("#pitch-canvas")).toBeVisible();
  });

  test("structured session works with practice cockpit", async ({ page }) => {
    await page.goto(BASE);
    await page.selectOption("#session-path", "basic");
    await page.click("#btn-structured");
    await expect(page.locator("#session-banner")).toHaveClass(/visible/);
    await expect(page.locator("#btn-practice-start")).toBeVisible();
    await page.click("#btn-session-pause");
    await expect(page.locator("#btn-session-resume")).toBeVisible();
    await page.click("#btn-session-end");
  });

  test("continue opens an exercise", async ({ page }) => {
    await page.goto(BASE);
    await page.click("#btn-continue");
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await expect(page.locator("#btn-practice-start")).toBeVisible();
  });

  test("guide is collapsed by default; can expand", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").first().click();
    await expect(page.locator(".guide-card")).toHaveClass(/collapsed/);
    await page.click("#btn-toggle-guide");
    await expect(page.locator(".guide-card")).not.toHaveClass(/collapsed/);
    await expect(page.locator("#ex-steps li").first()).toBeVisible();
  });

  test("save metrics produces score", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").first().click();
    await page.click("#btn-toggle-guide");
    await page.fill('#metrics-form [name="duration"]', "5");
    await page.click("#btn-complete");
    await expect(page.locator("#score-result")).toBeVisible();
    await expect(page.locator("#score-result .score-big")).toContainText("/ 10");
  });

  test("tiers still filter catalogs", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tier-chip[data-tier="basic"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(9);
    await page.click('.tier-chip[data-tier="advanced"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(11);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="all"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(14);
  });

  test("VTPracticeEngine and pitch utils load", async ({ page }) => {
    await page.goto(BASE);
    const ok = await page.evaluate(() => {
      return (
        typeof window.VTPracticeEngine === "function" &&
        typeof window.VTPitchVisualizer === "function" &&
        typeof window.VTPitchUtils?.detectPitch === "function"
      );
    });
    expect(ok).toBeTruthy();
  });
});
