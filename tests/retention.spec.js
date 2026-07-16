/**
 * Retention: reminders, ICS, freeze, micro-session, welcome-back.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      sessionStorage.setItem("vt_e2e", "1");
      localStorage.removeItem("vt_reminders_v1");
      localStorage.removeItem("vt_streak_freeze_v1");
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE + "/?e2e=1&t=" + Date.now(), { waitUntil: "networkidle" });
}

test.describe("Retention features", () => {
  test("retain panel and ICS helpers exist", async ({ page }) => {
    await boot(page);
    await expect(page.locator("#retain-panel")).toBeVisible();
    await expect(page.locator("#btn-ics-daily")).toBeVisible();
    await expect(page.locator("#btn-micro-5")).toBeVisible();
    const ics = await page.evaluate(() => window.VTReminders.buildIcs({ isEs: true }));
    expect(ics).toContain("BEGIN:VCALENDAR");
    expect(ics).toContain("RRULE:FREQ=DAILY");
  });

  test("reminder config persists", async ({ page }) => {
    await boot(page);
    await page.check("#chk-reminders");
    await page.fill("#rem-time-1", "19:30");
    await page.waitForTimeout(100);
    const cfg = await page.evaluate(() => VTReminders.getConfig());
    expect(cfg.enabled).toBe(true);
    expect(cfg.times[0]).toBe("19:30");
  });

  test("freeze only once per day and respects allowance", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      // Fake last practice yesterday
      const yesterday = new Date(Date.now() - 86400000).toISOString();
      const prog = {
        "v1-diction": {
          completedCount: 1,
          lastScore: 3,
          lastAt: yesterday,
          history: [{ at: yesterday, score: 3, durationSec: 60, metrics: {} }]
        }
      };
      localStorage.setItem("vt_progress_v1", JSON.stringify(prog));
      localStorage.removeItem("vt_streak_freeze_v1");
      const a1 = VTReminders.tryApplyFreeze(false);
      const a2 = VTReminders.tryApplyFreeze(false);
      return { a1, a2, left: VTReminders.freezesLeft(false) };
    });
    expect(r.a1.applied).toBe(true);
    expect(r.a2.applied).toBe(false);
    expect(r.left).toBe(0);
  });

  test("micro-session opens exercise with 5 min timer", async ({ page }) => {
    await boot(page);
    await page.click("#btn-micro-5");
    await page.waitForTimeout(400);
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    const t = await page.locator("#timer-display").textContent();
    // 05:00-ish
    expect(t).toMatch(/05:0|5:0/);
  });

  test("welcome-back shows when last practice old", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const old = new Date(Date.now() - 5 * 86400000).toISOString();
      localStorage.setItem(
        "vt_progress_v1",
        JSON.stringify({
          "v1-diction": {
            completedCount: 1,
            lastAt: old,
            history: [{ at: old, score: 3, durationSec: 30, metrics: {} }]
          }
        })
      );
      sessionStorage.removeItem("vt_wb_dismiss");
    });
    await page.reload({ waitUntil: "networkidle" });
    await expect(page.locator("#welcome-back")).toBeVisible();
  });

  test("practice heatmap and analytics exist", async ({ page }) => {
    await boot(page);
    await expect(page.locator("#practice-heatmap")).toBeVisible();
    const r = await page.evaluate(() => {
      const hm = VTValuePulse.heatmap(4);
      VTAnalytics.track("test_event", { x: 1 });
      return {
        cells: hm.cells.length,
        weeks: hm.weeks,
        total: VTAnalytics.summary().total
      };
    });
    expect(r.cells).toBeGreaterThanOrEqual(28);
    expect(r.total).toBeGreaterThanOrEqual(1);
  });

  test("due evaluation kind messages only", async ({ page }) => {
    await boot(page);
    const msg = await page.evaluate(() => {
      VTReminders.setConfig({
        enabled: true,
        times: ["00:00"],
        days: [0, 1, 2, 3, 4, 5, 6],
        lastNotifiedDay: null,
        browserNotify: false
      });
      localStorage.removeItem("vt_progress_v1");
      return VTReminders.pickMessage(false);
    });
    expect(msg.toLowerCase()).not.toMatch(/fail|failing|shame|stupid|lazy/);
    expect(msg.length).toBeGreaterThan(10);
  });
});
