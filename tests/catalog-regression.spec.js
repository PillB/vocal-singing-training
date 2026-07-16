/**
 * Content / structure / functionality regression suite.
 * Protects against accidental removal of exercises, sections, topics,
 * game-HUD chrome, progressions, modes, and bilingual titles.
 */
const { test, expect } = require("@playwright/test");
const snap = require("./fixtures/catalog-snapshot.json");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page) {
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

async function openExercise(page, ex) {
  await page.click(`.tab[data-tab="${ex.track}"]`);
  await page.click(`.tier-chip[data-tier="${ex.tier}"]`);
  await page.waitForTimeout(80);
  const ok = await page.evaluate((id) => {
    const all = [...VT_EXERCISES.vocal, ...VT_EXERCISES.singing];
    const found = all.find((e) => e.id === id);
    if (!found) return false;
    for (const c of document.querySelectorAll("#exercise-list .card-ex")) {
      const num = c.querySelector(".num")?.textContent?.trim();
      if (num === String(found.number)) {
        c.click();
        return true;
      }
    }
    return false;
  }, ex.id);
  expect(ok, `open ${ex.id}`).toBeTruthy();
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
}

test.describe("Catalog & structure regression", () => {
  test("frozen inventory: counts, ids, modes, progressions", async ({ page }) => {
    await boot(page);
    const live = await page.evaluate(() => {
      const all = [...VT_EXERCISES.vocal, ...VT_EXERCISES.singing];
      return {
        total: all.length,
        vocal: VT_EXERCISES.vocal.length,
        singing: VT_EXERCISES.singing.length,
        ids: all.map((e) => e.id).sort(),
        modes: VTPracticeModes.ids().sort(),
        progs: Object.keys(VT_PROGRESSIONS || {}).sort(),
        globals: [
          "VT_EXERCISES",
          "VTPracticeEngine",
          "VTPiano",
          "VTPitchVisualizer",
          "VTApp",
          "VTTour",
          "VTI18n",
          "VTPracticeModes",
          "VT_PROGRESSIONS",
          "VTBilling",
          "VT_BILLING_CONFIG",
          "VTAuth",
          "VT_AUTH_USERS"
        ].map((k) => [k, typeof window[k] !== "undefined"])
      };
    });

    expect(live.total).toBeGreaterThanOrEqual(snap.totals.exercises);
    expect(live.vocal).toBeGreaterThanOrEqual(snap.totals.vocal);
    expect(live.singing).toBeGreaterThanOrEqual(snap.totals.singing);
    expect(live.total).toBeGreaterThanOrEqual(snap.totals.exercises);
    expect(live.ids).toEqual([...snap.exerciseIds].sort());

    for (const id of snap.exerciseIds) {
      expect(live.ids, `missing exercise ${id}`).toContain(id);
    }
    for (const m of snap.modeIds) {
      expect(live.modes, `missing mode ${m}`).toContain(m);
    }
    for (const p of snap.progressions) {
      expect(live.progs, `missing progression ${p}`).toContain(p);
    }
    for (const [k, ok] of live.globals) {
      expect(ok, `global ${k}`).toBe(true);
    }
  });

  test("every exercise has mode, steps, tips, mistakes, metrics", async ({ page }) => {
    await boot(page);
    const report = await page.evaluate((frozenCatalog) => {
      const byId = Object.fromEntries(frozenCatalog.map((c) => [c.id, c]));
      const all = [...VT_EXERCISES.vocal, ...VT_EXERCISES.singing];
      const issues = [];
      for (const e of all) {
        const mode = e.practice?.mode;
        if (!mode) issues.push(`${e.id}: no mode`);
        if (!(e.steps?.length >= 1)) issues.push(`${e.id}: no steps`);
        if (!(e.tips?.length >= 1)) issues.push(`${e.id}: no tips`);
        if (!(e.mistakes?.length >= 1)) issues.push(`${e.id}: no mistakes`);
        if (!(e.metrics?.length >= 1)) issues.push(`${e.id}: no metrics`);
        const f = byId[e.id];
        if (f) {
          if (mode !== f.mode) issues.push(`${e.id}: mode ${mode}≠${f.mode}`);
          if ((e.steps?.length || 0) < f.steps) issues.push(`${e.id}: steps shrunk`);
          if ((e.tips?.length || 0) < f.tips) issues.push(`${e.id}: tips shrunk`);
          if ((e.mistakes?.length || 0) < f.mistakes) issues.push(`${e.id}: mistakes shrunk`);
          const mids = (e.metrics || []).map((m) => m.id);
          for (const mid of f.metrics || []) {
            if (!mids.includes(mid)) issues.push(`${e.id}: metric ${mid} missing`);
          }
        }
      }
      return { n: all.length, issues };
    }, snap.catalog);

    expect(report.n).toBe(snap.totals.exercises);
    expect(report.issues, report.issues.join("\n")).toEqual([]);
  });

  test("bilingual titles for every exercise id", async ({ page }) => {
    await boot(page);
    const miss = await page.evaluate((ids) => {
      const out = { es: [], en: [] };
      const prev = VTI18n.lang;
      VTI18n.lang = "es";
      for (const id of ids) {
        const k = "ex." + id;
        if (!VTI18n.strings.es[k]) out.es.push(k);
      }
      VTI18n.lang = "en";
      for (const id of ids) {
        const k = "ex." + id;
        if (!VTI18n.strings.en[k]) out.en.push(k);
      }
      VTI18n.lang = prev;
      return out;
    }, snap.exerciseIds);
    expect(miss.es).toEqual([]);
    expect(miss.en).toEqual([]);
  });

  test("required DOM sections and game HUD chrome exist", async ({ page }) => {
    await boot(page);
    for (const sel of snap.requiredDom) {
      const n = await page.locator(sel).count();
      expect(n, `DOM ${sel}`).toBeGreaterThan(0);
    }
    // Home main screen sections
    await expect(page.locator("#view-home")).toBeVisible();
    await expect(page.locator(".tabs")).toBeVisible();
    await expect(page.locator(".tier-filters")).toBeVisible();
    await expect(page.locator("#btn-continue")).toBeVisible();
    await expect(page.locator("#exercise-list .card-ex").first()).toBeVisible();
  });

  test("history and plan sections still present and navigable", async ({ page }) => {
    await boot(page);
    await page.click("#btn-history");
    await expect(page.locator("#view-history")).toHaveClass(/active/);
    await expect(page.locator("#history-list")).toBeVisible();
    await page.click("#btn-history-back");
    await page.click("#btn-plan");
    await expect(page.locator("#view-plan")).toHaveClass(/active/);
    // Scope to plan view (btn-open-plan also exists hidden on exercise shell)
    await expect(page.locator("#view-plan .plan-grid")).toBeVisible();
    await expect(page.locator("#view-plan #btn-plan-start")).toBeVisible();
    await expect(page.locator("#view-plan #element-chips")).toBeAttached();
    await page.click("#btn-plan-back");
    await expect(page.locator("#view-home")).toHaveClass(/active/);
  });

  test("tier filters match frozen counts", async ({ page }) => {
    await boot(page);
    await page.click('.tab[data-tab="vocal"]');
    await page.click('.tier-chip[data-tier="basic"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(snap.tiers.vocal_basic);
    await page.click('.tier-chip[data-tier="advanced"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(snap.tiers.vocal_advanced);
    await page.click('.tier-chip[data-tier="all"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(snap.totals.vocal);

    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="basic"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(snap.tiers.singing_basic);
    await page.click('.tier-chip[data-tier="advanced"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(snap.tiers.singing_advanced);
    await page.click('.tier-chip[data-tier="all"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(snap.totals.singing);
  });
});

test.describe("Per-exercise open + HUD regression", () => {
  // Spot-check every exercise opens with Start CTA and collapsed secondary chrome
  for (const ex of snap.catalog) {
    test(`open ${ex.id} (${ex.mode}) keeps main stage + no lost chrome`, async ({ page }) => {
      await boot(page);
      await openExercise(page, ex);

      await expect(page.locator("#practice-cockpit")).toBeVisible();
      await expect(page.locator("#highway-stage")).toBeVisible();
      await expect(page.locator(".hud-tl")).toBeVisible();
      await expect(page.locator(".hud-bl #btn-practice-start")).toBeVisible();
      await expect(page.locator(".hud-bc #mic-sensitivity")).toBeVisible();
      await expect(page.locator("#btn-back-home")).toBeVisible();
      await expect(page.locator(".guide-card")).toHaveClass(/collapsed/);
      await expect(page.locator("#metrics-card")).toHaveClass(/collapsed/);

      // Title present (ES)
      const title = page.locator("#ex-title");
      await expect(title).toBeVisible();
      const text = (await title.textContent()) || "";
      expect(text.trim().length).toBeGreaterThan(2);

      // Pitch exercises show canvas; speech modes use mode-focus or mode-hud
      if (ex.showPitch) {
        await expect(page.locator("#pitch-block")).toBeVisible();
        await expect(page.locator("#pitch-canvas")).toBeVisible();
      } else if (ex.mode === "weekPlan") {
        await expect(page.locator("#week-plan-cta, #mode-hud, #mode-focus").first()).toBeAttached();
      } else {
        const hasMode = await page.evaluate(() => {
          const focus = document.getElementById("mode-focus");
          const hud = document.getElementById("mode-hud");
          return !!(
            (focus && !focus.hidden && focus.children.length) ||
            (hud && hud.children.length)
          );
        });
        expect(hasMode, `${ex.id} mode UI`).toBeTruthy();
      }

      // Fold check BEFORE expanding below-fold chrome
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      });
      await page.waitForTimeout(50);
      await page.evaluate(() => window.scrollTo(0, 0));
      const fold = await page.evaluate(() => {
        const b = document.querySelector("#btn-practice-start")?.getBoundingClientRect();
        const stage = document.querySelector("#highway-stage")?.getBoundingClientRect();
        const y = b ? b.top + b.height / 2 : null;
        return {
          y,
          startTop: b?.top ?? null,
          startBottom: b?.bottom ?? null,
          stageBottom: stage ? stage.bottom : null,
          stageTop: stage ? stage.top : null,
          vh: innerHeight,
          scrollY: window.scrollY || document.documentElement.scrollTop || 0,
          startInView: !!(b && b.top >= -4 && b.bottom <= innerHeight + 8)
        };
      });
      // Primary product rule: Start is usable without scrolling the game stage away
      expect(fold.y, JSON.stringify(fold)).not.toBeNull();
      expect(fold.startInView, JSON.stringify(fold)).toBe(true);
      expect(fold.stageTop, JSON.stringify(fold)).toBeLessThan(fold.vh * 0.45);

      // Expand guide → steps/tips/mistakes still rendered (content regression)
      await page.click("#btn-toggle-guide");
      await expect(page.locator("#ex-steps li")).toHaveCount(ex.steps, { timeout: 5000 });
      const tipCount = await page.locator("#ex-tips li").count();
      const mistCount = await page.locator("#ex-mistakes li").count();
      expect(tipCount).toBeGreaterThanOrEqual(ex.tips);
      expect(mistCount).toBeGreaterThanOrEqual(ex.mistakes);

      // Metrics fields still present when expanded (avoid CSS [name=matches] quirks)
      await page.click("#btn-toggle-metrics");
      const metricOk = await page.evaluate((ids) => {
        const missing = [];
        for (const id of ids) {
          const el = document.querySelector(`#metrics-form [name="${id}"]`);
          if (!el) missing.push(id);
        }
        return missing;
      }, ex.metrics);
      expect(metricOk, `${ex.id} missing metrics: ${metricOk.join(",")}`).toEqual([]);
    });
  }
});

test.describe("Game HUD less-scroll smoke", () => {
  test("solfege: corner HUDs + progressions still available", async ({ page }) => {
    await boot(page);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").nth(1).click();
    await expect(page.locator(".hud-tl")).toBeVisible();
    await expect(page.locator(".hud-tr")).toBeVisible();
    await expect(page.locator(".hud-bl")).toBeVisible();
    await expect(page.locator(".hud-br")).toBeVisible();
    await expect(page.locator(".hud-bc")).toBeVisible();
    await page.locator("#btn-toggle-piano").click();
    await expect(page.locator("#prog-buttons")).toContainText(/I – vi|Wide jumps|C – Am/i);
  });

  test("leave modal chrome still present", async ({ page }) => {
    await boot(page);
    await expect(page.locator("#leave-modal")).toBeAttached();
    await expect(page.locator("#leave-save")).toBeAttached();
    await expect(page.locator("#leave-discard")).toBeAttached();
    await expect(page.locator("#leave-cancel")).toBeAttached();
  });
});
