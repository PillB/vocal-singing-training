/**
 * Button hit targets: center of Start must hit the button; mode-focus must not cover rail.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

const VIEWPORTS = [
  { name: "iphone", width: 390, height: 844 },
  { name: "desktop-short", width: 1280, height: 720 },
  { name: "tablet-land", width: 1024, height: 600 }
];

async function openShLadder(page) {
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
  await page.locator('.tab[data-tab="singing"]').click();
  await page.waitForTimeout(150);
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll("#exercise-list .card-ex")];
    const c = cards.find((el) => /SH|Escalera|aire/i.test(el.textContent || ""));
    c?.click();
  });
  await page.waitForSelector("#btn-practice-start");
  await page.evaluate(() => {
    window.VTApp?.syncHeaderHeightVar?.();
    window.VTApp?.fitHighwayToViewport?.();
  });
  await page.waitForTimeout(120);
}

function aabbOverlap(a, b) {
  return !(a.bottom <= b.top || a.top >= b.bottom || a.right <= b.left || a.left >= b.right);
}

for (const vp of VIEWPORTS) {
  test.describe(`Hit targets (${vp.name})`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("Start button center is hit-testable; mode-focus does not cover rail", async ({
      page
    }) => {
      await openShLadder(page);
      const r = await page.evaluate(() => {
        const btn = document.querySelector("#btn-practice-start");
        const rail = document.querySelector("#hud-bottom-rail");
        const mf = document.querySelector("#mode-focus");
        const br = btn.getBoundingClientRect();
        const rr = rail.getBoundingClientRect();
        const mr = mf?.getBoundingClientRect();
        const cx = br.left + br.width / 2;
        const cy = br.top + br.height / 2;
        const top = document.elementFromPoint(cx, cy);
        const hitsBtn = !!(top && (top === btn || btn.contains(top)));
        // sample grid
        let miss = 0;
        const samples = [];
        for (const py of [0.25, 0.5, 0.75]) {
          for (const px of [0.35, 0.5, 0.65]) {
            const x = br.left + br.width * px;
            const y = br.top + br.height * py;
            const el = document.elementFromPoint(x, y);
            const ok = el && (el === btn || btn.contains(el));
            if (!ok) {
              miss++;
              samples.push({
                px,
                py,
                tag: el?.tagName,
                id: el?.id,
                cls: String(el?.className || "").slice(0, 40)
              });
            }
          }
        }
        return {
          hitsBtn,
          miss,
          samples,
          btn: { top: br.top, bottom: br.bottom, left: br.left, right: br.right },
          rail: { top: rr.top, bottom: rr.bottom, left: rr.left, right: rr.right },
          mode: mr
            ? { top: mr.top, bottom: mr.bottom, left: mr.left, right: mr.right }
            : null,
          modeLive: mf?.classList.contains("mode-focus-live"),
          peMf: mf ? getComputedStyle(mf).pointerEvents : null,
          zRail: getComputedStyle(rail).zIndex
        };
      });

      expect(r.hitsBtn, `center must hit Start (${vp.name})`).toBe(true);
      expect(r.miss, `inner grid misses: ${JSON.stringify(r.samples)}`).toBe(0);
      expect(Number(r.zRail)).toBeGreaterThanOrEqual(30);
      expect(r.modeLive).toBe(true);
      expect(r.peMf).toBe("none");
      if (r.mode) {
        expect(
          aabbOverlap(r.mode, r.rail),
          `mode-focus overlaps bottom rail on ${vp.name}`
        ).toBe(false);
      }

      // Real mouse click on center must land on the button (event target)
      const box = await page.locator("#btn-practice-start").boundingBox();
      expect(box).toBeTruthy();
      await page.evaluate(() => {
        window.__hitClicks = [];
        document.querySelector("#btn-practice-start")?.addEventListener(
          "click",
          (e) => {
            window.__hitClicks.push(e.currentTarget?.id || e.target?.id);
          },
          { once: true }
        );
      });
      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForTimeout(80);
      const clicks = await page.evaluate(() => window.__hitClicks || []);
      expect(clicks).toContain("btn-practice-start");
    });

    test("guide toggle center is hit-testable", async ({ page }) => {
      await openShLadder(page);
      const guide = page.locator("#btn-toggle-guide");
      if (!(await guide.count())) {
        test.skip();
        return;
      }
      await guide.scrollIntoViewIfNeeded();
      await page.waitForTimeout(80);
      const r = await page.evaluate(() => {
        const btn = document.querySelector("#btn-toggle-guide");
        if (!btn) return { skip: true };
        const br = btn.getBoundingClientRect();
        const vh = window.innerHeight;
        // If still below fold after scroll, skip (layout extreme)
        if (br.top < 0 || br.bottom > vh + 2) {
          return { skip: true, offscreen: true };
        }
        const top = document.elementFromPoint(
          br.left + br.width / 2,
          br.top + br.height / 2
        );
        return {
          skip: false,
          hits: !!(top && (top === btn || btn.contains(top))),
          top: top && { id: top.id, tag: top.tagName }
        };
      });
      if (r.skip) {
        test.skip();
        return;
      }
      expect(r.hits).toBe(true);
    });
  });
}
