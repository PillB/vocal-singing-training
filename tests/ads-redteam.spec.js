/**
 * The ad scaffold, attacked rather than read.
 *
 * Every case here is a defect that was reproduced on 4 November 2026 against
 * `js/ads.js` as it then stood, by changing the one value the go-live gate tells
 * the operator to change. The findings, in the order they cost something:
 *
 *   1. `adsEnabled: true` and nothing else rendered "Micrófono USB de estudio"
 *      in the home slot with a "Ver opciones" button that called nothing —
 *      `window.open` 0 times, no pricing panel — because both cards naming the
 *      home slot ship with `href: ""`. `pickNativeCard` filtered for usable
 *      cards and then undid the filter with `usable.length ? usable : cards`.
 *      It also recorded an `ad_click` for the press.
 *   2. The AdSense slot was the only slot that is actually an advertisement and
 *      the only one that did not say so: `aria-label="Advertisement"`,
 *      hard-coded English in a Spanish-first product, no `role`, no visible
 *      label, no disclosure, while the native card carried all three.
 *   3. `ad_impression` was recorded when the request was made, so it counted an
 *      ad that came back empty and an ad an extension blocked before the script
 *      ran. Google sets `data-ad-status` once the unit "has finished requesting
 *      an ad" and that is the signal this now uses.
 *   4. There was no way to look at any of this without an approved AdSense
 *      account and real ad requests from the live site.
 *
 * And one that is recorded rather than fixed, because it cannot be: once
 * `adsbygoogle.js` has loaded it stays for the life of the page. The last case
 * asserts both halves of that — the unit is removed, the script is not — so the
 * limitation is a measurement rather than a worry.
 *
 * Nothing here reaches Google: every request to pagead2.googlesyndication.com is
 * fulfilled locally with a stub, and the test fails if one is made in a mode that
 * should not make one.
 */
const { test, expect } = require("@playwright/test");
const { enableQaPro, patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

/** Boots the page as a free Spanish-speaking visitor, with Google stubbed. */
async function boot(page, { lang = "es" } = {}) {
  const googleAsked = [];
  await page.route("**://pagead2.googlesyndication.com/**", (route) => {
    googleAsked.push(route.request().url());
    return route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: "window.adsbygoogle=window.adsbygoogle||[];"
    });
  });
  await enableQaPro(page);
  await page.addInitScript((l) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", l);
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
    window.__tracked = [];
  }, lang);
  // No automatic trial, set as the config is assigned: the page freezes it
  // straight after (QA-05), so assigning it once loaded did nothing.
  await patchBillingConfig(page, { freeTrialDays: 0 });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  expect(await page.evaluate(() => window.VT_BILLING_CONFIG.freeTrialDays), "the patch landed").toBe(0);
  await page.evaluate(() => {
    try {
      localStorage.removeItem("vt_billing_v1");
      localStorage.removeItem("vt_billing_trial_started_v1");
      localStorage.removeItem("vt_ads_last_home_v1");
      localStorage.removeItem("vt_ads_last_post_v1");
    } catch {
      /* ignore */
    }
    // Capture our own analytics instead of sending it.
    if (window.VTAnalytics) {
      window.VTAnalytics.track = (name, props) => window.__tracked.push({ name, props });
    }
  });
  return googleAsked;
}

test.describe("Ads, red-teamed", () => {
  test("control: ads are off in the file that ships, and the mode is the one that loads nothing", async ({ page }) => {
    await boot(page);
    const c = await page.evaluate(() => ({
      adsEnabled: window.VT_ADS_CONFIG.adsEnabled,
      mode: window.VT_ADS_CONFIG.mode,
      suppressForPro: window.VT_ADS_CONFIG.suppressForPro,
      client: window.VT_ADS_CONFIG.adsense.client,
      hrefs: window.VT_ADS_CONFIG.nativeCards.map((x) => x.href)
    }));
    expect(c.adsEnabled, "the master switch ships off").toBe(false);
    expect(c.mode).toBe("native");
    expect(c.suppressForPro).toBe(true);
    expect(c.client, "no publisher id in a public repository").toBe("");
    expect(c.hrefs.filter((h) => h), "only the pricing nudge has a destination").toEqual(["#pricing"]);
  });

  test("throwing the one switch the gate names shows no slot, rather than a button that does nothing", async ({ page }) => {
    const googleAsked = await boot(page);
    const r = await page.evaluate(() => {
      window.VT_ADS_CONFIG.adsEnabled = true; // the ONLY change, as in the gate
      const out = window.VTAds.renderSlot("home");
      const el = document.getElementById("ad-slot-home");
      return {
        out,
        hidden: !!el.hidden,
        html: el.innerHTML.trim(),
        tracked: window.__tracked.map((t) => t.name)
      };
    });
    expect(r.out.ok, "nothing is usable, so nothing renders").toBe(false);
    expect(r.out.reason).toBe("no_fill");
    expect(r.hidden).toBe(true);
    expect(r.html).toBe("");
    expect(r.tracked, "and no impression is claimed for it").toEqual([]);
    expect(googleAsked, "native mode never touches Google").toEqual([]);
  });

  test("a card that does have a destination still renders, and its button still opens it", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(async () => {
      const c = window.VT_ADS_CONFIG;
      c.adsEnabled = true;
      c.nativeCards[0].href = "https://example.test/mic";
      const out = window.VTAds.renderSlot("home");
      const el = document.getElementById("ad-slot-home");
      let opened = null;
      const real = window.open;
      window.open = (url) => {
        opened = url;
        return null;
      };
      el.querySelector("[data-ad-cta]").click();
      window.open = real;
      return {
        out,
        opened,
        title: el.querySelector(".ad-native-title").textContent.trim(),
        tracked: window.__tracked.map((t) => t.name)
      };
    });
    expect(r.out.ok).toBe(true);
    expect(r.out.id).toBe("mic-starter");
    expect(r.opened, "the press goes where the card says").toBe("https://example.test/mic");
    expect(r.tracked).toContain("ad_impression");
    expect(r.tracked).toContain("ad_click");
  });

  test("preview mode shows the empty card on purpose, inert and labelled, and loads nothing from anybody", async ({ page }) => {
    const googleAsked = await boot(page);
    const r = await page.evaluate(() => {
      const c = window.VT_ADS_CONFIG;
      c.adsEnabled = true;
      c.mode = "preview";
      c.adsense.client = "ca-pub-0000000000000000"; // even configured, it must not load
      c.adsense.slots.home = "1234567890";
      const out = window.VTAds.renderSlot("home");
      const el = document.getElementById("ad-slot-home");
      const cta = el.querySelector("[data-ad-preview-cta]");
      return {
        out,
        hidden: !!el.hidden,
        chip: el.querySelector(".ad-preview-chip")?.textContent.trim() || null,
        title: el.querySelector(".ad-native-title")?.textContent.trim() || null,
        ctaText: cta ? cta.textContent.trim() : null,
        ctaDisabled: cta ? cta.disabled : null,
        hasUnitStandIn: !!el.querySelector(".ad-preview-unit"),
        hasRealIns: !!el.querySelector("ins.adsbygoogle"),
        scriptPresent: !!document.getElementById("vt-adsense-script"),
        disclosure: el.querySelector(".ad-native-disc")?.textContent.trim() || null,
        tracked: window.__tracked.map((t) => t.name)
      };
    });
    expect(r.out).toEqual({ ok: true, mode: "preview" });
    expect(r.hidden).toBe(false);
    expect(r.chip, "the card says what it is").toBe("Vista previa");
    // Which of the two home cards appears is a coin toss by design (rotation),
    // so the claim is that it is one of them and that it is one with no link.
    expect(
      ["Micrófono USB de estudio", "Auriculares cerrados"],
      "a card with no partner link is exactly what you want to see here"
    ).toContain(r.title);
    expect(r.ctaDisabled, "and its button cannot be pressed").toBe(true);
    expect(r.ctaText).toContain("sin destino todavía");
    expect(r.hasUnitStandIn, "with the AdSense block's footprint under it").toBe(true);
    expect(r.hasRealIns, "but no real ad unit").toBe(false);
    expect(r.scriptPresent, "and no third-party script").toBe(false);
    expect(r.disclosure).toContain("Pro");
    expect(r.tracked, "a preview is not an impression").toEqual([]);
    expect(googleAsked, "nothing was asked of Google").toEqual([]);
  });

  test("the AdSense slot says what it is, in the language the page is in", async ({ page }) => {
    await boot(page, { lang: "es" });
    const es = await page.evaluate(() => {
      const c = window.VT_ADS_CONFIG;
      c.adsEnabled = true;
      c.mode = "adsense";
      c.adsense.client = "ca-pub-0000000000000000";
      c.adsense.slots.home = "1234567890";
      window.VTAds.renderSlot("home");
      const el = document.getElementById("ad-slot-home");
      return {
        aria: el.getAttribute("aria-label"),
        role: el.getAttribute("role"),
        visibleLabel: el.querySelector(".ad-native-label")?.textContent.trim() || null,
        disclosure: el.querySelector(".ad-native-disc")?.textContent.trim() || null,
        insPresent: !!el.querySelector("ins.adsbygoogle")
      };
    });
    expect(es.insPresent).toBe(true);
    expect(es.role, "a slot a screen reader can skip").toBe("complementary");
    expect(es.aria, "not the English string, in the Spanish UI").toBe("Consejo de estudio");
    expect(es.visibleLabel, "and a label a sighted reader can see").toBe("Consejo de estudio");
    expect(es.disclosure).toContain("Pro");
  });

  test("an impression is counted when AdSense says it filled, and not when it says it did not", async ({ page }) => {
    await boot(page);
    const filled = await page.evaluate(async () => {
      const c = window.VT_ADS_CONFIG;
      c.adsEnabled = true;
      c.mode = "adsense";
      c.adsense.client = "ca-pub-0000000000000000";
      c.adsense.slots.home = "1234567890";
      window.VTAds.renderSlot("home");
      const atRequestTime = window.__tracked.map((t) => t.name);
      // What AdSense does once the unit "has finished requesting an ad".
      document.querySelector("ins.adsbygoogle").setAttribute("data-ad-status", "filled");
      await new Promise((r) => setTimeout(r, 30));
      return { atRequestTime, afterFill: window.__tracked.map((t) => t.name) };
    });
    expect(filled.atRequestTime, "asking is not an impression").toEqual([]);
    expect(filled.afterFill).toEqual(["ad_impression"]);

    const unfilled = await page.evaluate(async () => {
      window.__tracked = [];
      localStorage.removeItem("vt_ads_last_home_v1");
      window.VTAds.clearSlot(document.getElementById("ad-slot-home"));
      window.VTAds.renderSlot("home");
      document.querySelector("ins.adsbygoogle").setAttribute("data-ad-status", "unfilled");
      await new Promise((r) => setTimeout(r, 30));
      return window.__tracked.map((t) => ({ name: t.name, status: t.props.status }));
    });
    expect(unfilled, "an empty unit is a measurement, not an impression").toEqual([
      { name: "ad_unfilled", status: "unfilled" }
    ]);
  });

  test("known and not fixed: buying Pro removes the unit but not Google's script", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const c = window.VT_ADS_CONFIG;
      c.adsEnabled = true;
      c.mode = "adsense";
      c.adsense.client = "ca-pub-0000000000000000";
      c.adsense.slots.home = "1234567890";
      window.VTAds.renderSlot("home");
      const before = { ins: !!document.querySelector("ins.adsbygoogle"), script: !!document.getElementById("vt-adsense-script") };
      window.VTBilling.activateDemo("pro_monthly");
      window.VTAds.refreshAllSafe();
      const el = document.getElementById("ad-slot-home");
      return {
        before,
        isPro: window.VTBilling.isPro(),
        slotHidden: !!el.hidden,
        insRemoved: !document.querySelector("ins.adsbygoogle"),
        scriptStillThere: !!document.getElementById("vt-adsense-script"),
        globalStillThere: typeof window.adsbygoogle !== "undefined"
      };
    });
    expect(r.before).toEqual({ ins: true, script: true });
    expect(r.isPro).toBe(true);
    expect(r.slotHidden, "the slot goes").toBe(true);
    expect(r.insRemoved, "and the unit is removed, not hidden, which is what AdSense requires").toBe(true);
    // The half that is not fixable: removing a <script> tag does not unload it.
    // Asserted so that it is a known measurement rather than a surprise, and so
    // that a future fix (a reload on the state change) has a test to flip.
    expect(r.scriptStillThere, "recorded, not approved of: see js/ads.js").toBe(true);
    expect(r.globalStillThere).toBe(true);
  });
});
