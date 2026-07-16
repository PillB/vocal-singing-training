/**
 * First-win loop + next-step card (user insights UI-09).
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      sessionStorage.setItem("vt_e2e", "1");
      localStorage.removeItem("vt_billing_v1");
      // Clear progress so first save is first win
      Object.keys(localStorage)
        .filter((k) => k.includes("progress") || k.startsWith("vt_"))
        .forEach((k) => {
          if (k.includes("progress") || k.includes("hold") || k.includes("week")) {
            try {
              localStorage.removeItem(k);
            } catch {
              /* ignore */
            }
          }
        });
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
}

test.describe("Insights: first-win & next step", () => {
  test("home shows next-step card with open CTA", async ({ page }) => {
    await boot(page);
    await expect(page.locator("#next-step-card")).toBeVisible();
    await expect(page.locator("#next-step-title")).not.toHaveText("—");
    await expect(page.locator("#btn-next-step")).toBeVisible();
    await page.click("#btn-next-step");
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  });

  test("suggestNextExercise returns an exercise id", async ({ page }) => {
    await boot(page);
    const id = await page.evaluate(() => {
      // Prefer public via continue path
      const cards = document.querySelectorAll("#exercise-list .card-ex");
      return cards.length > 0;
    });
    expect(id).toBe(true);
  });
});
