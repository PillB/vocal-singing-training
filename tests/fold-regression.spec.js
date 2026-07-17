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
      await page.evaluate(() => {
        window.VTApp?.fitHighwayToViewport?.();
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
        document.body.scrollTop = 0;
      });
      await page.waitForTimeout(80);
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        document.documentElement.scrollTop = 0;
      });
      const fold = await page.evaluate(() => {
        const start = document.querySelector("#btn-practice-start")?.getBoundingClientRect();
        const stage = document.querySelector("#highway-stage")?.getBoundingClientRect();
        const tl = document.querySelector(".hud-tl")?.getBoundingClientRect();
        const bl = document.querySelector(".hud-bl")?.getBoundingClientRect();
        const bc = document.querySelector(".hud-bc")?.getBoundingClientRect();
        const vh = innerHeight;
        // Controls must be usable in the first screen (primary product rule)
        const boxIn = (b) => !!(b && b.top >= -8 && b.bottom <= vh + 14);
        return {
          vh,
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
      expect(fold.startIn, JSON.stringify(fold)).toBe(true);
      expect(fold.tlIn, JSON.stringify(fold)).toBe(true);
      expect(fold.blIn, JSON.stringify(fold)).toBe(true);
      expect(fold.bcIn, JSON.stringify(fold)).toBe(true);
      expect(fold.guideCollapsed).toBe(true);
      expect(fold.metricsCollapsed).toBe(true);
      // Game stage should claim a large share of the first viewport
      expect(fold.stageH / fold.vh).toBeGreaterThanOrEqual(0.45);
      expect(fold.stageBottom).toBeLessThanOrEqual(fold.vh + 24);
    });
  }

  test("home keeps primary chrome in first screen", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      // Prefer always-visible first-screen anchors (continue may be lower when pulse is tall)
      const cands = [
        document.querySelector(".tabs"),
        document.querySelector("#exercise-list"),
        document.querySelector(".hero"),
        document.querySelector("#value-pulse"),
        document.querySelector("#btn-continue")
      ].filter(Boolean);
      const boxes = cands.map((el) => {
        const b = el.getBoundingClientRect();
        return { id: el.id || el.className?.toString?.().slice(0, 24), top: b.top, bottom: b.bottom };
      });
      const first = boxes.find((b) => b.top >= 0 && b.top < innerHeight);
      return { boxes, firstTop: first?.top ?? null, vh: innerHeight };
    });
    expect(r.firstTop).not.toBeNull();
    expect(r.firstTop).toBeLessThan(r.vh * 0.55);
  });
});
