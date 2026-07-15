const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

test.describe("Vocal & Singing Training — expanded validation", () => {
  test("home has two tabs, tiers, and expanded catalogs", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator('.tab[data-tab="vocal"]')).toBeVisible();
    await expect(page.locator('.tab[data-tab="singing"]')).toBeVisible();
    // all vocal: 9 basic + 11 advanced = 20
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(20);

    await page.click('.tier-chip[data-tier="basic"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(9);

    await page.click('.tier-chip[data-tier="advanced"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(11);

    await page.click('.tier-chip[data-tier="all"]');
    await page.click('.tab[data-tab="singing"]');
    // 3 basic + 11 advanced = 14
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(14);
  });

  test("open vocal exercise shows steps tips metrics", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").first().click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await expect(page.locator("#ex-title")).toContainText("Diction");
    await expect(page.locator("#ex-steps li").first()).toBeVisible();
    await expect(page.locator("#ex-tips li").first()).toBeVisible();
    await expect(page.locator("#metrics-form .field").first()).toBeVisible();
  });

  test("advanced vocal exercise loads with research note", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tier-chip[data-tier="advanced"]');
    await page.locator("#exercise-list .card-ex").first().click();
    await expect(page.locator("#ex-title")).toContainText("Pause");
    await expect(page.locator("#ex-research")).toBeVisible();
  });

  test("structured session basic path start pause resume", async ({ page }) => {
    await page.goto(BASE);
    await page.selectOption("#session-path", "basic");
    await page.click("#btn-structured");
    await expect(page.locator("#session-banner")).toHaveClass(/visible/);
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await page.click("#btn-session-pause");
    await expect(page.locator("#btn-session-resume")).toBeVisible();
    await page.click("#btn-session-resume");
    await page.click("#btn-session-end");
    await expect(page.locator("#session-banner")).not.toHaveClass(/visible/);
  });

  test("singing solfege has piano sustain option", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").nth(1).click();
    await expect(page.locator("#piano-block")).toBeVisible();
    await expect(page.locator("#chk-arpeggio")).toBeVisible();
    await expect(page.locator("#chk-sustain")).toBeVisible();
    await expect(page.locator("#sustain-sec")).toBeVisible();
    await expect(page.locator("#pitch-block")).toBeVisible();
    await page.check("#chk-sustain");
    await page.selectOption("#sustain-sec", "5");
    await page.click("#btn-play-prog");
    await page.waitForTimeout(400);
    await page.click("#btn-stop-piano");
  });

  test("pitch match advanced exercise shows visualizer", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="advanced"]');
    // s9 pitch match - find by title
    await page.locator("#exercise-list .card-ex", { hasText: "Single-Note Pitch Match" }).click();
    await expect(page.locator("#pitch-block")).toBeVisible();
    await expect(page.locator("#pitch-canvas")).toBeVisible();
    await expect(page.locator("#btn-pitch-start")).toBeVisible();
  });

  test("record and review workflow UI", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").nth(6).click();
    await expect(page.locator("#ex-title")).toContainText("Record & Review");
    await expect(page.locator("#review-block .review-step")).toHaveCount(3);
  });

  test("save metrics produces score", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").first().click();
    await page.fill('#metrics-form [name="duration"]', "5");
    await page.click("#btn-complete");
    await expect(page.locator("#score-result")).toBeVisible();
    await expect(page.locator("#score-result .score-big")).toContainText("/ 10");
  });

  test("12-week plan flow", async ({ page }) => {
    await page.goto(BASE);
    await page.click("#btn-plan");
    await expect(page.locator("#view-plan")).toHaveClass(/active/);
    await page.locator("#element-chips .chip").first().click();
    await page.click("#btn-plan-start");
    await page.click("#btn-plan-checkin");
    await page.fill("#plan-review-notes", "Volume felt more consistent.");
    await page.click("#btn-plan-improved");
    await expect(page.locator("#plan-week-num")).toContainText("Week");
  });

  test("homework file is linked", async ({ page }) => {
    await page.goto(BASE);
    const res = await page.request.get(
      BASE + "/Vocal%20training%20and%20Singing%20training%20Homework.md"
    );
    expect(res.ok()).toBeTruthy();
  });
});
