/**
 * Ad / native monetization scaffold — off by default, Pro suppresses, never mid-practice rules.
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
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
}

test.describe("Ads scaffold", () => {
  test("globals exist and ads disabled by default", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const c = window.VT_ADS_CONFIG;
      const A = window.VTAds;
      return {
        hasConfig: !!c,
        hasAds: !!A,
        enabled: !!c?.adsEnabled,
        should: A?.shouldShowAds?.(),
        homeHidden: document.getElementById("ad-slot-home")?.hidden
      };
    });
    expect(r.hasConfig).toBe(true);
    expect(r.hasAds).toBe(true);
    expect(r.enabled).toBe(false);
    expect(r.should).toBe(false);
    expect(r.homeHidden).toBe(true);
  });

  test("when enabled, free user sees home native card; Pro suppresses", async ({ page }) => {
    await boot(page);
    const free = await page.evaluate(() => {
      const c = window.VT_ADS_CONFIG;
      c.adsEnabled = true;
      c.mode = "native";
      // ensure at least one card with open-pricing so CTA works without affiliate URL
      if (c.nativeCards?.[0]) {
        c.nativeCards[0].href = "#pricing";
        c.nativeCards[0].action = "open-pricing";
        c.nativeCards[0].slots = ["home", "post-session", "history"];
      }
      // Auto trial makes isPro() true — force pure free for ad visibility
      try {
        localStorage.removeItem("vt_billing_v1");
        localStorage.removeItem("vt_billing_trial_started_v1");
        window.VT_BILLING_CONFIG.freeTrialDays = 0;
      } catch {
        /* ignore */
      }
      localStorage.removeItem("vt_ads_last_home_v1");
      const out = VTAds.renderSlot("home");
      const el = document.getElementById("ad-slot-home");
      return {
        out,
        hidden: el?.hidden,
        hasCard: !!el?.querySelector(".ad-native-card"),
        should: VTAds.shouldShowAds(),
        ent: VTBilling.getEntitlement()
      };
    });
    expect(free.ent.pro).toBe(false);
    expect(free.should).toBe(true);
    expect(free.out.ok).toBe(true);
    expect(free.hidden).toBe(false);
    expect(free.hasCard).toBe(true);

    const pro = await page.evaluate(() => {
      VTBilling.activateDemo("pro_monthly");
      const out = VTAds.renderSlot("home");
      const el = document.getElementById("ad-slot-home");
      return {
        should: VTAds.shouldShowAds(),
        out,
        hidden: el?.hidden,
        isPro: VTBilling.isPro()
      };
    });
    expect(pro.isPro).toBe(true);
    expect(pro.should).toBe(false);
    expect(pro.hidden).toBe(true);
  });

  test("slots exist in DOM for home, history, post-session", async ({ page }) => {
    await boot(page);
    await expect(page.locator("#ad-slot-home")).toHaveCount(1);
    await expect(page.locator("#ad-slot-history")).toHaveCount(1);
    await expect(page.locator("#ad-slot-post-session")).toHaveCount(1);
  });
});
