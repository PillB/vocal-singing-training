/**
 * Retention: reminders, ICS, rest days, micro-session, welcome-back.
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

  test("rest day covers one missed day, once, and never a gap it cannot cover", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const D = window.VTDays;
      const today = D.dayKey();
      const seed = (lastPractice, bank) =>
        VTStorage.setDays({
          v: 1,
          days: { [lastPractice]: { sec: 120, n: 1, ex: ["v1-diction"] } },
          rest: { bank, earnedAt: 0, used: [] },
          backfilled: true
        });
      // Sang two days ago, missed yesterday, one rest day in the bank.
      seed(D.addDays(today, -2), 1);
      const a1 = VTReminders.tryApplyFreeze(false);
      const a2 = VTReminders.tryApplyFreeze(false);
      const left = VTReminders.freezesLeft(false);
      const s1 = D.summary();
      // Sang four days ago: three missed days, one rest day. Nothing is spent.
      seed(D.addDays(today, -4), 1);
      const b1 = VTReminders.tryApplyFreeze(false);
      const s2 = D.summary();
      return { a1, a2, left, s1, b1, s2 };
    });
    expect(r.a1.applied).toBe(true);
    expect(r.a1.days.length).toBe(1);
    expect(r.a2.applied).toBe(false);
    expect(r.left).toBe(0);
    // The rest day bridges the run without lengthening it.
    expect(r.s1.streak).toBe(1);
    expect(r.b1.applied).toBe(false);
    expect(r.s2.rest.bank).toBe(1);
    expect(r.s2.streak).toBe(0);
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

  test("coming back after days away opens on the short welcome-back routine", async ({ page }) => {
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
      localStorage.removeItem("vt_days_v1");
      sessionStorage.removeItem("vt_wb_dismiss");
    });
    await page.reload({ waitUntil: "networkidle" });
    // The loop's start panel carries the welcome back now; the old banner
    // would say it twice.
    const card = page.locator("#next-step-card");
    await expect(card).toHaveAttribute("data-loop", "back");
    await expect(page.locator("#start-kicker")).toContainText(/Qué bueno verte|Good to see you/);
    await expect(page.locator("#welcome-back")).toBeHidden();
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
