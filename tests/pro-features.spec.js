/**
 * Pro feature expansion: multi-profile, goals, insights, progressions.
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
      localStorage.removeItem("vt_profiles_v1");
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE + "/?e2e=1&t=" + Date.now(), { waitUntil: "networkidle" });
}

test.describe("Pro features", () => {
  test("home shows pro studio chrome", async ({ page }) => {
    await boot(page);
    await expect(page.locator("#pro-studio")).toBeVisible();
    await expect(page.locator("#sel-profile")).toBeVisible();
    await expect(page.locator("#pro-spark")).toBeVisible();
    await expect(page.locator("#pro-ach-grid")).toBeVisible();
  });

  test("free cannot create second profile without Pro", async ({ page }) => {
    await boot(page);
    // Ensure free (not trial) for this test
    await page.evaluate(() => {
      localStorage.setItem(
        "vt_billing_trial_started_v1",
        new Date(Date.now() - 20 * 86400000).toISOString()
      );
      localStorage.removeItem("vt_billing_v1");
    });
    await page.reload({ waitUntil: "networkidle" });
    page.once("dialog", async (d) => d.dismiss());
    await page.click("#btn-profile-add");
    await page.waitForTimeout(200);
    const count = await page.evaluate(() => VTStorage.getProfiles().list.length);
    expect(count).toBe(1);
  });

  test("Pro can create second profile", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      VTBilling.activateDemo("pro_monthly");
    });
    await page.reload({ waitUntil: "networkidle" });
    // Re-activate after reload (demo persists)
    await page.evaluate(() => {
      if (!VTBilling.isPro()) VTBilling.activateDemo("pro_monthly");
    });
    page.once("dialog", async (d) => d.accept("Coach"));
    await page.click("#btn-profile-add");
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const p = VTStorage.getProfiles();
      return { n: p.list.length, names: p.list.map((x) => x.name) };
    });
    expect(r.n).toBeGreaterThanOrEqual(2);
    expect(r.names.some((n) => /Coach/i.test(n))).toBe(true);
  });

  test("insights and pulse expose spark + coachFocus", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const s = VTValuePulse.compute();
      return {
        sparkLen: (s.spark || []).length,
        hasFocus: typeof VTValuePulse.coachFocus === "function",
        ach: VTValuePulse.achievements(s).length
      };
    });
    expect(r.sparkLen).toBe(28);
    expect(r.hasFocus).toBe(true);
    expect(r.ach).toBeGreaterThanOrEqual(5);
  });

  test("Pro progressions exist and gated by can()", async ({ page }) => {
    await boot(page);
    const free = await page.evaluate(() => {
      // Force free
      localStorage.setItem(
        "vt_billing_trial_started_v1",
        new Date(Date.now() - 30 * 86400000).toISOString()
      );
      localStorage.removeItem("vt_billing_v1");
      return {
        proOnly: !!VT_PROGRESSIONS.progPro1?.proOnly,
        can: VTBilling.can("pro_progressions"),
        has: !!VT_PROGRESSIONS.progPro1
      };
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    const free2 = await page.evaluate(() => ({
      can: VTBilling.can("pro_progressions"),
      has: !!VT_PROGRESSIONS.progPro1
    }));
    expect(free.has || free2.has).toBe(true);
    // After expired trial should not have pro_progressions
    expect(free2.can).toBe(false);

    await page.evaluate(() => VTBilling.activateDemo("pro_monthly"));
    const pro = await page.evaluate(() => VTBilling.can("pro_progressions"));
    expect(pro).toBe(true);
  });

  test("pricing lists multi_profile and studio_goals", async ({ page }) => {
    await boot(page);
    await page.click("#btn-pricing");
    const html = await page.locator("#pricing-grid").innerHTML();
    expect(html.length).toBeGreaterThan(50);
    // Feature keys rendered via i18n — check config
    const feats = await page.evaluate(
      () => VT_BILLING_CONFIG.plans.find((p) => p.id === "pro_monthly").features
    );
    expect(feats).toEqual(
      expect.arrayContaining([
        "multi_profile",
        "studio_goals",
        "pro_progressions",
        "pro_insights"
      ])
    );
  });
});
