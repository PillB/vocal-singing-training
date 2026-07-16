/**
 * Playwright: highway stage must not overflow viewport on multiple formats.
 */
const { test, expect, devices } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "phone", width: 390, height: 844 },
  { name: "phone-narrow", width: 360, height: 740 },
  { name: "phone-land", width: 844, height: 390 },
  { name: "narrow", width: 320, height: 640 }
];

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

async function openPitchExercise(page) {
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
  await page.waitForTimeout(280);
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    window.VTApp?.syncHeaderHeightVar?.();
    window.VTApp?.fitHighwayToViewport?.();
  });
  await page.waitForTimeout(60);
  await page.evaluate(() => window.VTApp?.fitHighwayToViewport?.());
  await page.waitForTimeout(40);
}

async function measure(page) {
  return page.evaluate(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const stage = document.getElementById("highway-stage");
    const canvas = document.getElementById("pitch-canvas");
    const start = document.getElementById("btn-practice-start");
    const sr = document.documentElement.scrollWidth;
    const cw = document.documentElement.clientWidth;
    function box(el) {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      const visible =
        st.display !== "none" &&
        st.visibility !== "hidden" &&
        !el.hasAttribute("hidden") &&
        r.width > 0 &&
        r.height > 0;
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        x2: r.x + r.width,
        y2: r.y + r.height,
        visible
      };
    }
    return {
      vw,
      vh,
      scrollW: sr,
      clientW: cw,
      stage: box(stage),
      canvas: box(canvas),
      start: box(start)
    };
  });
}

for (const vp of VIEWPORTS) {
  test.describe(`viewport ${vp.name} ${vp.width}x${vp.height}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("home has no horizontal page scroll", async ({ page }) => {
      await boot(page);
      const m = await measure(page);
      expect(m.scrollW).toBeLessThanOrEqual(m.clientW + 2);
    });

    test("pitch exercise: stage + start stay inside viewport", async ({ page }) => {
      await boot(page);
      await openPitchExercise(page);
      await expect(page.locator("#view-exercise")).toHaveClass(/active/);
      const m = await measure(page);
      expect(m.stage?.visible).toBe(true);
      // Explicit geometry: stage bottom ≤ viewport bottom
      expect(m.stage.y2).toBeLessThanOrEqual(m.vh + 2);
      expect(m.stage.x).toBeGreaterThanOrEqual(-2);
      expect(m.stage.x2).toBeLessThanOrEqual(m.vw + 2);
      // Stage has usable height
      expect(m.stage.h).toBeGreaterThanOrEqual(vp.height < 500 ? 140 : 200);
      if (m.canvas?.visible) {
        expect(m.canvas.y2).toBeLessThanOrEqual(m.vh + 2);
        expect(m.canvas.y).toBeGreaterThanOrEqual(m.stage.y - 2);
        expect(m.canvas.y2).toBeLessThanOrEqual(m.stage.y2 + 2);
      }
      if (m.start?.visible) {
        expect(m.start.y2).toBeLessThanOrEqual(m.vh + 3);
      }
    });
  });
}
