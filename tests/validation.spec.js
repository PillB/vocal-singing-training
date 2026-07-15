const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

test.describe("Vocal & Singing Training — Phase 6 validation", () => {
  test("home has two main tabs and exercises", async ({ page }) => {
    await page.goto(BASE);
    await expect(page.locator("h1")).toContainText("Vocal");
    await expect(page.locator('.tab[data-tab="vocal"]')).toBeVisible();
    await expect(page.locator('.tab[data-tab="singing"]')).toBeVisible();
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(9);

    await page.click('.tab[data-tab="singing"]');
    await expect(page.locator("#home-track-title")).toContainText("Singing");
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(3);
  });

  test("open vocal exercise shows steps tips metrics", async ({ page }) => {
    await page.goto(BASE);
    await page.locator("#exercise-list .card-ex").first().click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await expect(page.locator("#ex-title")).toContainText("Diction");
    await expect(page.locator("#ex-steps li").first()).toBeVisible();
    await expect(page.locator("#ex-tips li").first()).toBeVisible();
    await expect(page.locator("#metrics-form .field").first()).toBeVisible();
    await expect(page.locator("#timer-block")).toBeVisible();
  });

  test("structured session start pause resume", async ({ page }) => {
    await page.goto(BASE);
    await page.click("#btn-structured");
    await expect(page.locator("#session-banner")).toHaveClass(/visible/);
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await page.click("#btn-session-pause");
    await expect(page.locator("#btn-session-resume")).toBeVisible();
    await page.click("#btn-session-resume");
    await expect(page.locator("#btn-session-pause")).toBeVisible();
    await page.click("#btn-session-end");
    await expect(page.locator("#session-banner")).not.toHaveClass(/visible/);
  });

  test("singing exercise shows piano controls", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tab[data-tab="singing"]');
    await page.locator("#exercise-list .card-ex").nth(1).click();
    await expect(page.locator("#ex-title")).toContainText("Solfège");
    await expect(page.locator("#piano-block")).toBeVisible();
    await expect(page.locator("#prog-buttons .prog-btn").first()).toBeVisible();
    await page.click("#btn-play-prog");
    await page.waitForTimeout(500);
    await page.click("#btn-stop-piano");
  });

  test("vocal fry has hold logger and ref pitch", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tab[data-tab="singing"]');
    await page.locator("#exercise-list .card-ex").first().click();
    await expect(page.locator("#hold-block")).toBeVisible();
    await expect(page.locator("#ref-pitch-row")).toBeVisible();
    await page.click("#btn-ref-pitch");
    await page.waitForTimeout(300);
  });

  test("record and review workflow UI", async ({ page }) => {
    await page.goto(BASE);
    // exercise 7 is index 6
    await page.locator("#exercise-list .card-ex").nth(6).click();
    await expect(page.locator("#ex-title")).toContainText("Record & Review");
    await expect(page.locator("#review-block")).toBeVisible();
    await expect(page.locator("#review-block .review-step")).toHaveCount(3);
  });

  test("save metrics produces score", async ({ page }) => {
    await page.goto(BASE);
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
    await expect(page.locator("#plan-week-num")).toContainText("Week 2");
  });

  test("history view loads", async ({ page }) => {
    await page.goto(BASE);
    await page.click("#btn-history");
    await expect(page.locator("#view-history")).toHaveClass(/active/);
    await expect(page.locator("#history-list")).toBeVisible();
  });

  test("homework file is linked", async ({ page }) => {
    await page.goto(BASE);
    const link = page.locator('footer a[href*="Homework"]');
    await expect(link).toBeVisible();
    const res = await page.request.get(BASE + "/Vocal%20training%20and%20Singing%20training%20Homework.md");
    expect(res.ok()).toBeTruthy();
  });
});
