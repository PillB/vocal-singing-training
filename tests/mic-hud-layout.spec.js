/**
 * Highway mic chip: single-row layout, inside stage, no wrap.
 */
const { test, expect } = require("@playwright/test");

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
  await page.evaluate(() => {
    const root = document.getElementById("tour-root");
    if (root) root.hidden = true;
    document.body.classList.remove("tour-active");
  });
}

async function openSingingExercise(page) {
  await page.click('.tab[data-tab="singing"]');
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const list = window.VT_EXERCISES?.singing || [];
    const pitch =
      list.find((e) => e.id === "s9-pitch-match") ||
      list.find((e) => e.practice?.showPitch) ||
      list[0];
    const cards = [...document.querySelectorAll("#exercise-list .card-ex")];
    for (const c of cards) {
      if (c.querySelector(".num")?.textContent?.trim() === String(pitch?.number)) {
        c.click();
        return;
      }
    }
    cards[0]?.click();
  });
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    window.VTApp?.fitHighwayToViewport?.();
  });
  await page.waitForTimeout(80);
}

async function micGeom(page) {
  return page.evaluate(() => {
    const stage = document.getElementById("highway-stage")?.getBoundingClientRect();
    const bc = document.getElementById("mic-sens-hud")?.getBoundingClientRect();
    const slider = document.getElementById("mic-sensitivity")?.getBoundingClientRect();
    const val = document.getElementById("mic-sens-val")?.getBoundingClientRect();
    const meter = document.getElementById("level-meter-wrap")?.getBoundingClientRect();
    const bl = document.querySelector(".hud-bl")?.getBoundingClientRect();
    const br = document.querySelector(".hud-br")?.getBoundingClientRect();
    function area(a, b) {
      if (!a || !b) return 0;
      const ix1 = Math.max(a.x, b.x);
      const iy1 = Math.max(a.y, b.y);
      const ix2 = Math.min(a.right, b.right);
      const iy2 = Math.min(a.bottom, b.bottom);
      const w = ix2 - ix1;
      const h = iy2 - iy1;
      return w > 1 && h > 1 ? w * h : 0;
    }
    return {
      vh: window.innerHeight,
      stage: stage && {
        y: stage.y,
        y2: stage.bottom,
        h: stage.height
      },
      bc: bc && {
        x: bc.x,
        y: bc.y,
        y2: bc.bottom,
        h: bc.height,
        w: bc.width
      },
      slider: slider && { y: slider.y, y2: slider.bottom, h: slider.height },
      val: val && { y: val.y, y2: val.bottom, h: val.height },
      meter: meter && { h: meter.height, w: meter.width },
      overlapBl: area(bl, bc),
      overlapBr: area(br, bc)
    };
  });
}

test.describe("Mic HUD on highway", () => {
  test("desktop: single-row mic inside stage", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await boot(page);
    await openSingingExercise(page);
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await expect(page.locator("#mic-sens-hud")).toBeVisible();
    const g = await micGeom(page);
    expect(g.bc.h).toBeLessThanOrEqual(52);
    expect(g.bc.y2).toBeLessThanOrEqual(g.stage.y2 + 1.5);
    // Value on same row as slider (centers within 14px)
    const dy = Math.abs(g.val.y + g.val.h / 2 - (g.slider.y + g.slider.h / 2));
    expect(dy).toBeLessThan(14);
    expect(g.meter.h).toBeGreaterThanOrEqual(9);
    expect(g.overlapBl).toBe(0);
    expect(g.overlapBr).toBe(0);
  });

  test("phone: mic chip compact and inside stage", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await openSingingExercise(page);
    await page.evaluate(() => window.VTApp?.fitHighwayToViewport?.());
    await page.waitForTimeout(50);
    const g = await micGeom(page);
    expect(g.bc.h).toBeLessThanOrEqual(52);
    expect(g.bc.y2).toBeLessThanOrEqual(g.stage.y2 + 2);
    const dy = Math.abs(g.val.y + g.val.h / 2 - (g.slider.y + g.slider.h / 2));
    expect(dy).toBeLessThan(14);
  });

  test("landscape phone: mic inside viewport and stage", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await boot(page);
    await openSingingExercise(page);
    await page.evaluate(() => window.VTApp?.fitHighwayToViewport?.());
    await page.waitForTimeout(60);
    const g = await micGeom(page);
    expect(g.bc.y2).toBeLessThanOrEqual(g.vh + 2);
    expect(g.bc.y2).toBeLessThanOrEqual(g.stage.y2 + 2);
    expect(g.bc.h).toBeLessThanOrEqual(52);
  });
});
