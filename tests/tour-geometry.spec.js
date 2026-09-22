/**
 * Tour geometry: the popover must never cover what it is explaining, never
 * leave the viewport, and never collapse on a phone.
 *
 * None of this was visible to the existing suite — qa/capture-mobile.mjs only
 * checks horizontal overflow, and viewport-overflow.spec.js hides the tour
 * before it measures anything.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "phone", width: 390, height: 844 },
  { name: "narrow", width: 320, height: 640 }
];

const MIN_TAP_PX = 44;
const MIN_FONT_PX = 12;

async function boot(page, { tourDone = false } = {}) {
  await page.addInitScript((done) => {
    try {
      localStorage.clear();
      localStorage.setItem("vt_lang", "es");
      localStorage.setItem("vt_mic_primed_v1", "1");
      if (done) localStorage.setItem("vt_tour_v1", "finished");
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
  }, tourDone);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(350);
}

/** One round trip per step: everything the assertions need, measured together. */
async function measure(page) {
  return page.evaluate(() => {
    const card = document.querySelector(".tour-card");
    const spot = document.querySelector("[data-tour-spot]");
    const hl = document.querySelector(".tour-highlight");
    const cr = card.getBoundingClientRect();
    const sr = spot.getBoundingClientRect();
    const tr = hl ? hl.getBoundingClientRect() : null;
    const spotOn = Number(getComputedStyle(spot).opacity) > 0;

    const overlap = tr
      ? Math.max(0, Math.min(cr.right, tr.right) - Math.max(cr.left, tr.left)) *
        Math.max(0, Math.min(cr.bottom, tr.bottom) - Math.max(cr.top, tr.top))
      : 0;
    const visible = tr
      ? Math.max(0, Math.min(tr.right, innerWidth) - Math.max(tr.left, 0)) *
        Math.max(0, Math.min(tr.bottom, innerHeight) - Math.max(tr.top, 0))
      : 0;

    const leaves = [...card.querySelectorAll("*")].filter(
      (el) => !el.children.length && el.textContent.trim()
    );
    const taps = [...card.querySelectorAll("button, a[href]")].map((el) => {
      const r = el.getBoundingClientRect();
      return { label: el.textContent.trim().slice(0, 16), w: r.width, h: r.height };
    });

    return {
      progress: document.querySelector("[data-tour-progress]").textContent,
      title: document.querySelector("[data-tour-title]").textContent,
      body: document.querySelector("[data-tour-body]").textContent,
      target: hl ? hl.id || String(hl.className).split(" ")[0] : null,
      // Some targets genuinely cannot be cleared: the stage canvas fills the
      // screen, so no popover position both stays in the viewport and misses
      // it. Rather than exempt by a guessed size, work out whether ANY
      // placement would have fitted. If one would have, the tour had no
      // excuse for covering its target.
      unclearable: (() => {
        if (!tr) return false;
        const M = 12;
        const GAP = 12;
        const w = cr.width;
        const h = cr.height;
        const sheet = innerWidth <= 520;
        const boxes = sheet
          ? [
              { left: M, top: innerHeight - M - h },
              { left: M, top: M }
            ]
          : [
              { left: tr.left + tr.width / 2 - w / 2, top: tr.bottom + GAP },
              { left: tr.left + tr.width / 2 - w / 2, top: tr.top - GAP - h },
              { left: tr.right + GAP, top: tr.top + tr.height / 2 - h / 2 },
              { left: tr.left - GAP - w, top: tr.top + tr.height / 2 - h / 2 }
            ];
        return !boxes.some((b) => {
          const left = Math.max(M, Math.min(b.left, innerWidth - w - M));
          const top = Math.max(M, Math.min(b.top, innerHeight - h - M));
          const box = { left, top, right: left + w, bottom: top + h };
          const fits =
            box.left >= M - 0.5 &&
            box.top >= M - 0.5 &&
            box.right <= innerWidth - M + 0.5 &&
            box.bottom <= innerHeight - M + 0.5;
          const hits = !(
            box.left >= tr.right ||
            box.right <= tr.left ||
            box.top >= tr.bottom ||
            box.bottom <= tr.top
          );
          return fits && !hits;
        });
      })(),
      coverPct: visible > 0 ? (overlap / visible) * 100 : 0,
      cardInViewport:
        cr.left >= -0.5 &&
        cr.top >= -0.5 &&
        cr.right <= innerWidth + 0.5 &&
        cr.bottom <= innerHeight + 0.5,
      cardWidth: cr.width,
      spotOn,
      spotInViewport: !spotOn || (sr.top >= -0.5 && sr.bottom <= innerHeight + 0.5),
      spotFraction: spotOn ? sr.height / innerHeight : 0,
      // With the ring drawn the dim must come off the backdrop, or the element
      // being pointed at is painted over by it.
      backdropClear:
        !spotOn ||
        getComputedStyle(document.querySelector(".tour-backdrop")).backgroundColor ===
          "rgba(0, 0, 0, 0)",
      minFontPx: Math.min(...leaves.map((el) => parseFloat(getComputedStyle(el).fontSize))),
      smallTaps: taps.filter((t) => t.w < 44 || t.h < 44),
      isLast: (() => {
        const m = document.querySelector("[data-tour-progress]").textContent.match(/(\d+)\D+(\d+)/);
        return !!m && m[1] === m[2];
      })()
    };
  });
}

/** Walk a running tour to the end, asserting every step as it goes. */
async function walk(page, label) {
  for (let i = 0; i < 20; i += 1) {
    await page.waitForTimeout(450);
    const s = await measure(page);
    const where = `${label} — ${s.progress} "${s.title.slice(0, 40)}" target=${s.target}`;

    expect(s.title.length, `${where}: step has a title`).toBeGreaterThan(3);
    expect(s.body.length, `${where}: step has a body`).toBeGreaterThan(10);
    expect(s.cardInViewport, `${where}: card fully inside the viewport`).toBe(true);
    expect(s.spotInViewport, `${where}: spotlight inside the viewport`).toBe(true);
    expect(s.spotFraction, `${where}: spotlight covers at most 60% of the screen`).toBeLessThanOrEqual(0.61);
    expect(s.backdropClear, `${where}: highlighted element is not dimmed by the backdrop`).toBe(true);
    expect(s.minFontPx, `${where}: no text below ${MIN_FONT_PX}px`).toBeGreaterThanOrEqual(MIN_FONT_PX);
    expect(s.smallTaps, `${where}: every control at least ${MIN_TAP_PX}px`).toEqual([]);
    if (!s.unclearable) {
      expect(s.coverPct, `${where}: card must not cover its target`).toBeLessThan(1);
    }
    if (s.isLast) return i + 1;
    await page.locator("[data-tour-next]").click();
  }
  throw new Error(`${label}: tour never reached its last step`);
}

for (const vp of VIEWPORTS) {
  test.describe(`Tour geometry @ ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("home tour: every step is readable and clear of its target", async ({ page }) => {
      await boot(page);
      await page.evaluate(() => window.VTTour.start(true));
      const steps = await walk(page, `home @${vp.name}`);
      expect(steps, "home tour is short on purpose").toBeLessThanOrEqual(6);
    });

    test("highway pack: every step is readable and clear of its target", async ({ page }) => {
      await boot(page, { tourDone: true });
      await page.evaluate(() => window.VTApp.openExercise("s2-solfege-chords", false));
      await page.waitForTimeout(700);
      await page.evaluate(() => window.VTTour.startUiPack("highway", { force: true }));
      await walk(page, `highway @${vp.name}`);
    });

    test("speech pack: every step is readable and clear of its target", async ({ page }) => {
      await boot(page, { tourDone: true });
      await page.evaluate(() => window.VTApp.openExercise("v1-diction", false));
      await page.waitForTimeout(700);
      await page.evaluate(() => window.VTTour.startUiPack("speech", { force: true }));
      await walk(page, `speech @${vp.name}`);
    });
  });
}

test.describe("Tour card width on phones", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("the centred first step spans the screen, it does not shrink-wrap", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.VTTour.start(true));
    await page.waitForTimeout(600);
    const s = await measure(page);
    // It collapsed to 209px before: `width: auto` with only one edge pinned.
    expect(s.cardWidth, "centred card spans the viewport minus its gutters").toBeGreaterThan(
      390 - 40
    );
  });
});
