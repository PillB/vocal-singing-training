/**
 * End-user copy / i18n: folded guides Spanish, de-meta, metrics, inventory.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function bootEs(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
}

test.describe("Copy & i18n (learner-facing)", () => {
  test("Spanish folded guide shows Spanish steps (not English-only)", async ({ page }) => {
    await bootEs(page);
    await page.locator("#exercise-list .card-ex").first().click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await page.locator("#btn-toggle-guide").click();
    await expect(page.locator("#guide-body")).toBeVisible();
    const stepText = await page.locator("#ex-steps li").first().textContent();
    expect(stepText).toBeTruthy();
    expect(stepText).toMatch(/Elige|página|libro|artículo|Inhala|Cuenta|Saca|Coloca/i);
    expect(stepText).not.toMatch(/^Pick a short page/i);
    const orig = await page.locator("#ex-original").textContent();
    expect(orig).toMatch(/En pocas palabras|In short/i);
  });

  test("English lang shows English guide steps", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", "en");
        sessionStorage.setItem("vt_e2e", "1");
      } catch {
        /* ignore */
      }
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await page.locator("#exercise-list .card-ex").first().click();
    await page.locator("#btn-toggle-guide").click();
    const stepText = await page.locator("#ex-steps li").first().textContent();
    expect(stepText).toMatch(/Pick a short page|Inhale|Gently stick|Place a clean/i);
  });

  test("footer has no homework filename meta", async ({ page }) => {
    await bootEs(page);
    const foot = await page.locator(".app-footer").textContent();
    expect(foot).not.toMatch(/Homework\.md/i);
    expect(foot).toMatch(/Privacidad|Privacy|dispositivo|device/i);
  });

  test("locale pack covers all exercises with matching array lengths", async ({ page }) => {
    await bootEs(page);
    const r = await page.evaluate(() => {
      const pack = window.VT_EXERCISE_LOCALE_ES || {};
      const all = [
        ...(window.VT_EXERCISES?.vocal || []),
        ...(window.VT_EXERCISES?.singing || [])
      ];
      const missing = [];
      const short = [];
      const class1 = [];
      for (const ex of all) {
        if (!pack[ex.id]) missing.push(ex.id);
        else {
          for (const f of ["steps", "tips", "mistakes"]) {
            const en = ex[f] || [];
            const es = pack[ex.id][f] || [];
            if (Array.isArray(en) && es.length < en.length) {
              short.push(`${ex.id}.${f}:${es.length}/${en.length}`);
            }
          }
        }
        const blob = `${ex.original || ""} ${ex.research || ""}`;
        if (/Class-1|homework spine|comply with/i.test(blob)) class1.push(ex.id);
        if (pack[ex.id] && /Class-1|clase 1|homework/i.test(JSON.stringify(pack[ex.id]))) {
          class1.push(ex.id + ":es");
        }
      }
      return {
        n: all.length,
        packN: Object.keys(pack).length,
        missing,
        short,
        class1,
        lang: window.VTI18n?.lang
      };
    });
    expect(r.lang).toBe("es");
    expect(r.packN).toBe(r.n);
    expect(r.missing).toEqual([]);
    expect(r.short).toEqual([]);
    expect(r.class1).toEqual([]);
  });

  test("no developer meta in pricing/auth learner strings", async ({ page }) => {
    await bootEs(page);
    const r = await page.evaluate(() => {
      const t = (k) => window.VTI18n?.t?.(k) || "";
      const keys = [
        "pricing.toast.portalUnconfigured",
        "pricing.toast.checkoutError",
        "pricing.feat.all_exercises",
        "pricing.feat.no_limits",
        "auth.sub",
        "auth.adminUsers"
      ];
      const bad = [];
      for (const k of keys) {
        const v = t(k);
        if (/session_id|Stripe →|Customer portal|paywall|soft limits|internal test account|Cuentas internas/i.test(v)) {
          bad.push({ k, v });
        }
      }
      return { bad, portal: t("pricing.toast.portalUnconfigured") };
    });
    expect(r.bad).toEqual([]);
    expect(r.portal).toMatch(/suscripción|practicando|available|practicing/i);
  });

  test("SH ladder ES guide is complete Spanish (not truncated EN)", async ({ page }) => {
    await bootEs(page);
    await page.locator('.tab[data-tab="singing"]').click();
    await page.waitForTimeout(150);
    const opened = await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#exercise-list .card-ex")];
      const c = cards.find((el) => /SH|aire|Escalera/i.test(el.textContent || ""));
      if (c) {
        c.click();
        return true;
      }
      return false;
    });
    expect(opened).toBe(true);
    await page.locator("#btn-toggle-guide").click();
    const steps = await page.locator("#ex-steps li").allTextContents();
    expect(steps.length).toBeGreaterThanOrEqual(5);
    expect(steps.join(" ")).toMatch(/Inhala|nariz|SH/i);
    expect(steps.join(" ")).not.toMatch(/Class-1|Inhale calmly through the nose/i);
    const tips = await page.locator("#ex-tips li").allTextContents();
    expect(tips.length).toBeGreaterThanOrEqual(4);
  });

  test("metric labels resolve to Spanish for common singing ids", async ({ page }) => {
    await bootEs(page);
    const r = await page.evaluate(() => {
      // open singing exercise with metrics
      const list = window.VT_EXERCISES?.singing || [];
      const ex = list.find((e) => e.id === "s15-sh-air-ladder") || list[0];
      // use app metricLabel via render path if available
      const labels = (ex.metrics || []).map((m) => {
        // reimplement same byId check using DOM after render is heavy; call through VTApp if any
        return { id: m.id, en: m.label };
      });
      return { ids: labels.map((x) => x.id), n: labels.length };
    });
    expect(r.n).toBeGreaterThan(0);
    // Open exercise and check form labels after metrics render
    await page.locator('.tab[data-tab="singing"]').click();
    await page.waitForTimeout(100);
    await page.evaluate(() => {
      const cards = [...document.querySelectorAll("#exercise-list .card-ex")];
      const c = cards.find((el) => /SH|Escalera|aire/i.test(el.textContent || ""));
      c?.click();
    });
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    const formText = await page.locator("#metrics-form").textContent();
    expect(formText).toMatch(/Peldaños|SH pareja|Uniformidad|Mejor|Claridad|sostenido/i);
    expect(formText).not.toMatch(/Ladder rungs cleared|Longest even SH/i);
  });

  test("breathS mode HUD uses localized phase labels", async ({ page }) => {
    await bootEs(page);
    const r = await page.evaluate(() => {
      const Modes = window.VTPracticeModes;
      if (!Modes?.get) return { skip: true };
      const mode = Modes.get("breathS");
      const host = document.createElement("div");
      document.body.appendChild(host);
      mode.mount(host, { mode: "breathS" });
      const phase = host.querySelector("[data-phase]")?.textContent || "";
      const btn = host.querySelector("[data-sw]")?.textContent || "";
      mode.unmount?.();
      host.remove();
      return { phase, btn, skip: false };
    });
    if (r.skip) {
      test.skip();
      return;
    }
    expect(r.phase).toMatch(/Paso 1|Step 1/i);
    expect(r.phase).not.toMatch(/^Phase 1/i);
    expect(r.btn).toMatch(/Pasar|Switch|\/A\//i);
  });
});
