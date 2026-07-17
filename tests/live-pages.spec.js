/**
 * Live GitHub Pages validation — production URL, not localhost.
 * Skip unless LIVE_URL is set or LIVE_PAGES=1.
 */
const { test, expect } = require("@playwright/test");

const LIVE =
  process.env.LIVE_URL ||
  (process.env.LIVE_PAGES === "1"
    ? "https://pillb.github.io/vocal-singing-training/"
    : null);

const describeLive = LIVE ? test.describe : test.describe.skip;

describeLive("Live Pages validation", () => {
  test.use({ baseURL: LIVE });

  async function bootLive(page) {
    await page.context().grantPermissions(["microphone"]).catch(() => {});
    await page.addInitScript(() => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", "es");
        sessionStorage.setItem("vt_e2e", "1");
      } catch {
        /* ignore */
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (navigator.mediaDevices && AC) {
        navigator.mediaDevices.getUserMedia = async () => {
          const ctx = new AC();
          const dest = ctx.createMediaStreamDestination();
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          g.gain.value = 0.00001;
          osc.connect(g);
          g.connect(dest);
          osc.start();
          return dest.stream;
        };
      }
    });
    await page.goto(LIVE, { waitUntil: "domcontentloaded", timeout: 60000 });
  }

  test("home loads: brand, tabs, exercise cards", async ({ page }) => {
    await bootLive(page);
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator(".tabs, .tab").first()).toBeVisible();
    await expect(page.locator("#exercise-list .card-ex").first()).toBeVisible({
      timeout: 15000
    });
    // Shipped cache-busted scripts include openMetricsPanel / engine
    const shipped = await page.evaluate(() => ({
      hasEngine: typeof window.VTPracticeEngine === "function",
      hasBilling: !!window.VTBilling,
      hasI18n: !!window.VTI18n,
      hasManualGrace: typeof window.VT_MANUAL_GRACE_MS === "number",
      hasAirGrace: typeof window.VT_AIR_GRACE_MS === "number",
      openMetrics: typeof window.VTApp?.getState === "function"
    }));
    expect(shipped.hasEngine).toBe(true);
    expect(shipped.hasBilling).toBe(true);
    expect(shipped.hasI18n).toBe(true);
    expect(shipped.hasManualGrace).toBe(true);
  });

  test("open SH ladder, Start, silence count 0, Space counts", async ({ page }) => {
    await bootLive(page);
    await page.locator('.tab[data-tab="singing"]').click();
    await page.waitForTimeout(200);
    const opened = await page.evaluate(() => {
      if (window.VTApp?.openExercise) {
        window.VTApp.openExercise("s15-sh-air-ladder");
        return true;
      }
      const cards = [...document.querySelectorAll("#exercise-list .card-ex")];
      const c = cards.find((el) => /SH|Escalera|aire/i.test(el.textContent || ""));
      c?.click();
      return !!c;
    });
    expect(opened).toBe(true);
    await expect(page.locator("#view-exercise")).toHaveClass(/active/, { timeout: 10000 });
    await page.locator("#btn-practice-start").click();
    await page.waitForFunction(
      () => !document.querySelector("#btn-practice-stop")?.hidden,
      { timeout: 20000 }
    );
    await page.waitForTimeout(900);
    const silent = parseFloat(await page.locator("[data-h]").first().textContent());
    expect(silent).toBe(0);
    await page.evaluate(() => document.querySelector("#btn-practice-stop")?.focus());
    await page.keyboard.down("Space");
    await page.waitForTimeout(700);
    const mid = await page.evaluate(() => ({
      cur: parseFloat(document.querySelector("[data-h]")?.textContent || "0"),
      stopH: document.querySelector("#btn-practice-stop")?.hidden,
      chip: document.querySelector("#mic-sens-hud")?.className || ""
    }));
    expect(mid.stopH).toBe(false);
    expect(mid.cur).toBeGreaterThan(0.25);
    expect(mid.chip).toMatch(/is-manual/);
    await page.keyboard.up("Space");
    await page.locator("#btn-practice-stop").click();
    // Metrics should open after stop on live
    await page.waitForTimeout(400);
    const metricsOpen = await page.evaluate(
      () => !document.querySelector("#metrics-card")?.classList.contains("collapsed")
    );
    expect(metricsOpen).toBe(true);
  });

  test("Start center is hit-testable on live desktop", async ({ page }) => {
    await bootLive(page);
    await page.evaluate(() => {
      if (window.VTApp?.openExercise) window.VTApp.openExercise("v1-diction");
    });
    await expect(page.locator("#btn-practice-start")).toBeVisible({ timeout: 10000 });
    await page.evaluate(() => window.VTApp?.fitHighwayToViewport?.());
    await page.waitForTimeout(100);
    const hit = await page.evaluate(() => {
      const el = document.querySelector("#btn-practice-start");
      const r = el.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return !!(top && (top === el || el.contains(top)));
    });
    expect(hit).toBe(true);
  });

  test("pricing modal + no sk_live in page scripts", async ({ page }) => {
    await bootLive(page);
    await page.locator("#btn-pricing").click();
    await expect(page.locator("#pricing-modal")).toBeVisible();
    await page.locator("#pricing-close").click();
    const secrets = await page.evaluate(async () => {
      const scripts = [...document.querySelectorAll("script[src]")].map((s) => s.src);
      const bad = [];
      for (const src of scripts) {
        if (!src.includes("pillb.github.io") && !src.includes("vocal-singing")) continue;
        try {
          const t = await fetch(src).then((r) => r.text());
          if (/(?:sk_live_|rk_live_)[a-zA-Z0-9]{16,}|whsec_[A-Za-z0-9]{16,}/.test(t)) {
            bad.push(src);
          }
        } catch {
          /* ignore cors */
        }
      }
      return bad;
    });
    expect(secrets).toEqual([]);
  });

  test("privacy page live", async ({ page }) => {
    const base = LIVE.replace(/\/?$/, "/");
    await page.goto(base + "privacy.html", { waitUntil: "domcontentloaded", timeout: 30000 });
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });

  test("lang toggle + singing tab on production", async ({ page }) => {
    await bootLive(page);
    await page.locator("#btn-lang").click();
    await page.waitForTimeout(150);
    await page.locator('.tab[data-tab="singing"]').click();
    await expect(page.locator("#exercise-list .card-ex").first()).toBeVisible();
    // Toggle back
    await page.locator("#btn-lang").click();
    await page.waitForTimeout(100);
    await expect(page.locator("body")).toBeVisible();
  });

  test("history view opens on production", async ({ page }) => {
    await bootLive(page);
    await page.locator("#btn-history").click();
    await expect(page.locator("#view-history")).toHaveClass(/active/, { timeout: 8000 });
  });
});
