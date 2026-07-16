/**
 * Fold / game-HUD regression: Start + stage stay in first viewport
 * for a representative sample of exercise modes (pitch, speech, ladder).
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

async function openById(page, id) {
  const ex = snap.catalog.find((c) => c.id === id);
  expect(ex, id).toBeTruthy();
  await page.click(`.tab[data-tab="${ex.track}"]`);
  await page.click(`.tier-chip[data-tier="${ex.tier}"]`);
  await page.waitForTimeout(80);
  const ok = await page.evaluate((eid) => {
    const all = [...VT_EXERCISES.vocal, ...VT_EXERCISES.singing];
    const found = all.find((e) => e.id === eid);
    if (!found) return false;
    for (const c of document.querySelectorAll("#exercise-list .card-ex")) {
      if (c.querySelector(".num")?.textContent?.trim() === String(found.number)) {
        c.click();
        return true;
      }
    }
    return false;
  }, id);
  expect(ok).toBeTruthy();
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
}

const SAMPLE_IDS = [
  "s15-sh-air-ladder",
  "s1-vocal-fry",
  "s2-solfege-chords",
  "s16-major-scale-coord",
  "v1-diction",
  "v2-volume",
  "v10-power-pause",
  "s9-pitch-match"
];

test.describe("First-viewport game stage (fold)", () => {
  for (const id of SAMPLE_IDS) {
    test(`fold OK: ${id}`, async ({ page }) => {
      await boot(page);
      await openById(page, id);
      await page.evaluate(() => window.scrollTo(0, 0));
      const fold = await page.evaluate(() => {
        const start = document.querySelector("#btn-practice-start")?.getBoundingClientRect();
        const stage = document.querySelector("#highway-stage")?.getBoundingClientRect();
        const tl = document.querySelector(".hud-tl")?.getBoundingClientRect();
        const bl = document.querySelector(".hud-bl")?.getBoundingClientRect();
        const bc = document.querySelector(".hud-bc")?.getBoundingClientRect();
        const vh = innerHeight;
        const boxIn = (b) => !!(b && b.top >= -6 && b.bottom <= vh + 10);
        return {
          vh,
          scrollY,
          startIn: boxIn(start),
          stageTop: stage?.top ?? null,
          stageH: stage?.height ?? null,
          stageBottom: stage?.bottom ?? null,
          tlIn: boxIn(tl),
          blIn: boxIn(bl),
          bcIn: boxIn(bc),
          guideCollapsed: document.querySelector(".guide-card")?.classList.contains("collapsed"),
          metricsCollapsed: document.querySelector("#metrics-card")?.classList.contains("collapsed")
        };
      });
      expect(fold.scrollY).toBe(0);
      expect(fold.startIn).toBe(true);
      expect(fold.tlIn).toBe(true);
      expect(fold.blIn).toBe(true);
      expect(fold.bcIn).toBe(true);
      expect(fold.guideCollapsed).toBe(true);
      expect(fold.metricsCollapsed).toBe(true);
      // Game stage should dominate the first viewport (less-scroll product goal)
      expect(fold.stageH / fold.vh).toBeGreaterThanOrEqual(0.55);
      expect(fold.stageBottom).toBeLessThanOrEqual(fold.vh + 16);
    });
  }

  test("home keeps continue CTA in first screen", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const c = document.querySelector("#btn-continue")?.getBoundingClientRect();
      return { y: c?.top, y2: c?.bottom, vh: innerHeight };
    });
    expect(r.y).toBeLessThan(r.vh * 0.55);
  });
});
