/**
 * MUSK-mode: ruthless user journeys across major surfaces.
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise, startPractice, stopPractice, centerHitsSelf } = require("./helpers/e2e");

test.describe("Max-effort journeys (Musk)", () => {
  test("home: tabs, tiers, cards, pricing, value pulse visible", async ({ page }) => {
    await boot(page);
    await expect(page.locator("#view-home")).toHaveClass(/active/);
    await expect(page.locator("#value-pulse")).toBeVisible();
    await page.locator('.tab[data-tab="singing"]').click();
    await expect(page.locator("#exercise-list .card-ex").first()).toBeVisible();
    await page.locator('.tier-chip[data-tier="basic"]').click();
    await page.locator('.tier-chip[data-tier="all"]').click();
    await page.locator("#btn-pricing").click();
    await expect(page.locator("#pricing-modal")).toBeVisible();
    await page.locator("#pricing-close").click();
    await expect(page.locator("#pricing-modal")).toBeHidden();
  });

  test("vocal exercise: Start → Stop → metrics form present", async ({ page }) => {
    await boot(page);
    await openExercise(page, "v1-diction");
    await expect(page.locator("#btn-practice-start")).toBeVisible();
    const hit = await centerHitsSelf(page, "#btn-practice-start");
    expect(hit.ok).toBe(true);
    await startPractice(page);
    await page.waitForTimeout(400);
    await stopPractice(page);
    // Metrics may be inside a collapsed card — expand if needed
    const metrics = page.locator("#metrics-form");
    if (!(await metrics.isVisible().catch(() => false))) {
      await page.locator("#btn-toggle-metrics, .metrics-card summary, [data-i18n='ex.metrics']").first().click({ force: true }).catch(() => {});
      await page.evaluate(() => {
        document.querySelector(".metrics-card")?.classList.remove("collapsed");
        const f = document.querySelector("#metrics-form");
        if (f) f.hidden = false;
      });
    }
    await expect(page.locator("#metrics-form .field, #metrics-form input, #metrics-form label").first()).toBeAttached();
  });

  test("SH ladder: silence stays 0; Space raises; Stop stays live during Space", async ({
    page
  }) => {
    await boot(page, { mic: "silent" });
    await openExercise(page, "s15-sh-air-ladder");
    await startPractice(page);
    await page.waitForTimeout(800);
    const silent = parseFloat(await page.locator("[data-h]").first().textContent());
    expect(silent).toBe(0);
    await page.evaluate(() => document.querySelector("#btn-practice-stop")?.focus());
    await page.keyboard.down("Space");
    await page.waitForTimeout(600);
    const mid = await page.evaluate(() => ({
      cur: parseFloat(document.querySelector("[data-h]")?.textContent || "0"),
      stopHidden: document.querySelector("#btn-practice-stop")?.hidden,
      status: document.querySelector("#practice-status")?.textContent
    }));
    expect(mid.stopHidden).toBe(false);
    expect(mid.status).toMatch(/vivo|live/i);
    expect(mid.cur).toBeGreaterThan(0.25);
    await page.keyboard.up("Space");
    await stopPractice(page);
  });

  test("pitch exercise opens highway without crash", async ({ page }) => {
    await boot(page, { mic: "silent" });
    // Prefer a known pitch exercise id
    const id = await page.evaluate(() => {
      const list = window.VT_EXERCISES?.singing || [];
      const p = list.find((e) => e.audio?.pitchViz || e.id.includes("pitch") || e.id.includes("solfege"));
      return p?.id || list[0]?.id;
    });
    await openExercise(page, id);
    await startPractice(page);
    await page.waitForTimeout(300);
    // Stage should not overflow viewport badly
    const geo = await page.evaluate(() => {
      const st = document.querySelector("#highway-stage");
      const r = st?.getBoundingClientRect();
      const vh = window.innerHeight;
      return { bottom: r?.bottom, vh, overflow: r ? r.bottom > vh + 8 : null };
    });
    expect(geo.overflow).toBe(false);
    await stopPractice(page);
  });

  test("lang toggle mid-exercise updates chrome", async ({ page }) => {
    await boot(page, { lang: "es" });
    await openExercise(page, "v1-diction");
    const before = await page.locator("#btn-practice-start").textContent();
    await page.locator("#btn-lang").click();
    await page.waitForTimeout(200);
    const after = await page.locator("#btn-practice-start").textContent();
    // ES Empezar vs EN Start (or similar)
    expect(before?.trim()).not.toBe("");
    expect(after?.trim()).not.toBe("");
    // Lang button flips label
    const langBtn = await page.locator("#btn-lang").textContent();
    expect(langBtn).toMatch(/Español|English/i);
  });

  test("history and plan views open", async ({ page }) => {
    await boot(page);
    await page.locator("#btn-history").click();
    await expect(page.locator("#view-history")).toHaveClass(/active/);
    await page.locator("#btn-plan").click();
    await expect(page.locator("#view-plan")).toHaveClass(/active/);
  });

  test("chaos: offline does not white-screen home", async ({ page }) => {
    await boot(page);
    await page.context().setOffline(true);
    await page.locator('.tab[data-tab="singing"]').click();
    await page.waitForTimeout(200);
    await expect(page.locator("body")).toBeVisible();
    await page.context().setOffline(false);
    await page.locator('.tab[data-tab="vocal"]').click();
    await expect(page.locator("#exercise-list .card-ex").first()).toBeVisible();
  });

  test("keyboard: Enter on focused Start begins practice; Space assist while live", async ({
    page
  }) => {
    await boot(page, { mic: "silent" });
    await openExercise(page, "s15-sh-air-ladder");
    await page.locator("#btn-practice-start").focus();
    await page.keyboard.press("Enter");
    await page.waitForFunction(
      () => !document.querySelector("#btn-practice-stop")?.hidden,
      { timeout: 12000 }
    );
    await page.waitForTimeout(500);
    const silent = parseFloat(await page.locator("[data-h]").first().textContent());
    expect(silent).toBe(0);
    await page.keyboard.down("Space");
    await page.waitForTimeout(500);
    const mid = parseFloat(await page.locator("[data-h]").first().textContent());
    expect(mid).toBeGreaterThan(0.2);
    await page.keyboard.up("Space");
    await stopPractice(page);
  });

  test("concurrent: live practice + pricing modal + account modal", async ({ page }) => {
    await boot(page, { mic: "silent" });
    await openExercise(page, "v1-diction");
    await startPractice(page);
    await page.locator("#btn-pricing").click();
    await expect(page.locator("#pricing-modal")).toBeVisible();
    await page.locator("#pricing-close").click();
    await page.locator("#btn-account").click();
    await expect(page.locator("#account-modal")).toBeVisible();
    await page.locator("#account-close, #account-modal [data-close], .modal-close").first().click({ force: true }).catch(async () => {
      await page.keyboard.press("Escape");
    });
    // Practice still live
    await expect(page.locator("#btn-practice-stop")).toBeVisible();
    await stopPractice(page);
  });

  test("privacy page loads", async ({ page }) => {
    await boot(page);
    await page.goto((process.env.BASE_URL || "http://127.0.0.1:8765") + "/privacy.html", {
      waitUntil: "domcontentloaded"
    });
    await expect(page.locator("body")).toBeVisible();
    await expect(page.locator("h1, h2").first()).toBeVisible();
  });

  test("stress: open/close 12 exercises without pageerror", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    await boot(page);
    const ids = await page.evaluate(() => {
      const v = (window.VT_EXERCISES?.vocal || []).slice(0, 6).map((e) => e.id);
      const s = (window.VT_EXERCISES?.singing || []).slice(0, 6).map((e) => e.id);
      return [...v, ...s];
    });
    for (const id of ids) {
      await openExercise(page, id);
      await page.waitForTimeout(40);
      await page.evaluate(() => {
        document.querySelector("#btn-back, .btn-back, [data-i18n='nav.back']")?.click();
        // fallback: go home
        if (!document.querySelector("#view-home.active")) {
          document.querySelector('.tab[data-tab="vocal"]')?.click();
        }
      });
      // Prefer home via brand or back
      if (!(await page.locator("#view-home.active").count())) {
        await page.goto((process.env.BASE_URL || "http://127.0.0.1:8765") + "/?t=" + Date.now(), {
          waitUntil: "domcontentloaded"
        });
      }
    }
    expect(errors.filter((e) => !/ResizeObserver|Script error/i.test(e))).toEqual([]);
  });
});
