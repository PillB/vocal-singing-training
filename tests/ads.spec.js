/**
 * Ad / native monetization scaffold — off by default, Pro suppresses, never mid-practice rules.
 */
const { test, expect } = require("@playwright/test");
const { enableQaPro, patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page) {
  // Ad suppression is checked against Pro; use the QA unlock to get there.
  // No trial clock either: a free visitor here is purely free.
  await enableQaPro(page);
  await patchBillingConfig(page, { freeTrialDays: 0 });
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
      // A card needs a destination to render at all, since 4 November 2026: see
      // `pickNativeCard` in js/ads.js and tests/ads-redteam.spec.js. This line
      // used to be a workaround for the opposite behaviour and is now the rule.
      if (c.nativeCards?.[0]) {
        c.nativeCards[0].href = "#pricing";
        c.nativeCards[0].action = "open-pricing";
        c.nativeCards[0].slots = ["home", "post-session", "history"];
      }
      // Belt and braces: no trial clock, no entitlement — pure free
      try {
        localStorage.removeItem("vt_billing_v1");
        localStorage.removeItem("vt_billing_trial_started_v1");
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

  test("practiceLive blocks home slot even when ads enabled", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      window.VT_ADS_CONFIG.adsEnabled = true;
      localStorage.removeItem("vt_billing_v1");
      localStorage.removeItem("vt_billing_trial_started_v1");
      localStorage.removeItem("vt_ads_last_home_v1");
      // Simulate live practice state
      const st = VTApp.getState();
      st.practiceLive = true;
      document.body.classList.add("view-exercise");
      document.getElementById("view-exercise")?.classList.add("active");
      document.getElementById("view-home")?.classList.remove("active");
      const out = VTAds.renderSlot("home");
      const practice = VTAds.isPracticeActive();
      st.practiceLive = false;
      return { out, practice };
    });
    expect(r.practice).toBe(true);
    expect(r.out.ok).toBe(false);
    expect(r.out.reason).toBe("practice_active");
  });
});

// js/ads.js renderSlot and renderPreview were split under the complexity
// ceiling (merging #26 into main). Six mutants were planted in the split and
// three lived; each of these tests dies on one of them (C2, C5, C6) and passes
// on the code before the split as well.
test.describe("What the split of the ad slots must keep", () => {
  /** Ads on for a purely free visitor, in `mode`, with the throttle clocks cleared. */
  async function adsOn(page, mode, extra) {
    await boot(page);
    await page.route("https://pagead2.googlesyndication.com/**", (route) => route.abort("blockedbyclient"));
    await page.evaluate(({ mode, extra }) => {
      const c = window.VT_ADS_CONFIG;
      c.adsEnabled = true;
      c.mode = mode;
      Object.assign(c, extra || {});
      for (const key of ["vt_billing_v1", "vt_billing_trial_started_v1", "vt_ads_last_home_v1", "vt_ads_last_post_v1"]) {
        localStorage.removeItem(key);
      }
    }, { mode, extra });
  }

  test("C2 the home slot does not show again within its minimum interval; history is not rate-limited", async ({ page }) => {
    await adsOn(page, "native");
    const r = await page.evaluate(() => {
      const card = window.VT_ADS_CONFIG.nativeCards[0];
      card.href = "#pricing";
      card.action = "open-pricing";
      card.slots = ["home", "post-session", "history"];
      return {
        first: VTAds.renderSlot("home"),
        again: VTAds.renderSlot("home"),
        history: [VTAds.renderSlot("history"), VTAds.renderSlot("history")]
      };
    });
    expect(r.first.ok, JSON.stringify(r.first)).toBe(true);
    expect(r.again).toEqual({ ok: false, reason: "throttled" });
    expect(r.history.map((x) => x.ok)).toEqual([true, true]);
  });

  test("C5 in preview, a slot no card names says so in the page's language", async ({ page }) => {
    await adsOn(page, "preview");
    const text = await page.evaluate(() => {
      window.VT_ADS_CONFIG.nativeCards.forEach((card) => {
        card.slots = [];
      });
      const out = VTAds.renderSlot("home");
      return { out, body: document.querySelector("#ad-slot-home .ad-native-body")?.textContent };
    });
    expect(text.out).toEqual({ ok: true, mode: "preview" });
    expect(text.body).toBe("Ninguna tarjeta nombra este espacio.");
  });

  test("C6 the post-session slot borrows the home AdSense unit, since it has none of its own", async ({ page }) => {
    await adsOn(page, "adsense", { adsense: { client: "ca-pub-0000000000000000", slots: { home: "1111111111" } } });
    const r = await page.evaluate(() => {
      const out = VTAds.renderSlot("post-session");
      return { out, unit: document.querySelector("#ad-slot-post-session ins.adsbygoogle")?.getAttribute("data-ad-slot") };
    });
    expect(r.out).toEqual({ ok: true, mode: "adsense" });
    expect(r.unit).toBe("1111111111");
  });
});
