const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

test.describe("Exercise-specific practice modes", () => {
  test("profiles and modes load for all exercises", async ({ page }) => {
    await page.goto(BASE);
    const report = await page.evaluate(() => {
      const all = [...VT_EXERCISES.vocal, ...VT_EXERCISES.singing];
      const missing = all.filter((e) => !e.practice?.mode).map((e) => e.id);
      const modes = typeof VTPracticeModes !== "undefined" ? VTPracticeModes.ids() : [];
      return { total: all.length, missing, modeCount: modes.length };
    });
    expect(report.total).toBe(34);
    expect(report.missing).toEqual([]);
    expect(report.modeCount).toBeGreaterThan(10);
  });

  test("v2 volume shows volume lane not pitch challenge", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").nth(1).click();
    await expect(page.locator("#ex-title")).toContainText("Maintain Volume");
    await expect(page.locator(".mode-panel.mode-volumeSteady")).toBeVisible();
    await expect(page.locator(".volume-lane")).toBeVisible();
    await expect(page.locator("#pitch-block")).toBeHidden();
    await expect(page.locator("#mode-cue")).toContainText("volume");
  });

  test("v10 pause detect UI not pitch game", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tier-chip[data-tier="advanced"]');
    await page.locator("#exercise-list .card-ex").first().click();
    await expect(page.locator("#ex-title")).toContainText("Pause");
    await expect(page.locator(".mode-panel.mode-pauseDetect")).toBeVisible();
    await expect(page.locator("#pitch-block")).toBeHidden();
  });

  test("s1 fry is pitchHold without forcing challenge game hud", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").first().click();
    await expect(page.locator(".mode-panel.mode-pitchHold")).toBeVisible();
    await expect(page.locator("#pitch-block")).toBeVisible();
    await expect(page.locator("#hold-display")).toBeVisible();
    // challenge HUD hidden when pitchChallenge false
    await expect(page.locator("#pitch-game-hud")).toBeHidden();
  });

  test("s9 pitch match enables game HUD", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="advanced"]');
    await page.locator("#exercise-list .card-ex", { hasText: "Single-Note Pitch Match" }).click();
    await expect(page.locator(".mode-panel.mode-pitchMatch")).toBeVisible();
    await expect(page.locator("#pitch-game-hud")).toBeVisible();
    await expect(page.locator("#chk-pitch-challenge")).toBeChecked();
  });

  test("s5 sirens use range mode not pitchMatch", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="advanced"]');
    await page.locator("#exercise-list .card-ex", { hasText: "Sirens" }).click();
    await expect(page.locator(".mode-panel.mode-sirenRange")).toBeVisible();
    await expect(page.locator("#pitch-game-hud")).toBeHidden();
  });

  test("single Start practice CTA still primary", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").first().click();
    await expect(page.locator("#btn-practice-start")).toBeVisible();
    await expect(page.locator("#btn-pitch-start")).toBeHidden();
    await expect(page.locator("#mode-hud")).not.toBeEmpty();
  });

  test("structured session + continue still work", async ({ page }) => {
    await page.goto(BASE);
    await page.selectOption("#session-path", "basic");
    await page.click("#btn-structured");
    await expect(page.locator("#session-banner")).toHaveClass(/visible/);
    await expect(page.locator("#mode-hud .mode-panel")).toBeVisible();
    await page.click("#btn-session-end");
    await page.click("#btn-continue");
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  });

  test("tier counts unchanged", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tier-chip[data-tier="basic"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(9);
    await page.click('.tier-chip[data-tier="advanced"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(11);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="all"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(14);
  });

  test("save metrics still works", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").first().click();
    await page.click("#btn-toggle-guide");
    await page.fill('#metrics-form [name="duration"]', "5");
    await page.click("#btn-complete");
    await expect(page.locator("#score-result .score-big")).toContainText("/ 10");
  });
});
