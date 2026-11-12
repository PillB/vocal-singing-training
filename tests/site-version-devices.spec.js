/**
 * Both designs across the screens people actually hold: phones from the last
 * six years (small iPhones, current iPhones, Pixels, Samsungs, a folding
 * cover screen), tablets in both orientations, and common laptops.
 *
 * Sizes are CSS viewports as the browser reports them, which is what layout
 * depends on. Each case asserts what a person would call broken: sideways
 * scrolling, a control too small to tap, the header row wrapping, the design
 * control or the Progreso tabs cut off by the edge. One generated test per
 * device and design, so a failure names both.
 */
const { test, expect } = require("@playwright/test");
const { tapFloorLimit } = require("./helpers/tap-floor");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

const DEVICES = [
  // Phones, portrait
  { name: "iPhone SE 1st gen (320x568)", w: 320, h: 568, touch: true },
  { name: "Galaxy Z Fold cover (344x882)", w: 344, h: 882, touch: true },
  { name: "Galaxy S8-S22 (360x740)", w: 360, h: 740, touch: true },
  { name: "Galaxy A-series (360x800)", w: 360, h: 800, touch: true },
  { name: "iPhone SE 2nd-3rd gen (375x667)", w: 375, h: 667, touch: true },
  { name: "iPhone 12-13 mini, X-11 Pro (375x812)", w: 375, h: 812, touch: true },
  { name: "Galaxy S23-S24 (384x832)", w: 384, h: 832, touch: true },
  { name: "iPhone 12-16 (390x844)", w: 390, h: 844, touch: true },
  { name: "Pixel 5 (393x851)", w: 393, h: 851, touch: true },
  { name: "iPhone 15-16 Pro (402x874)", w: 402, h: 874, touch: true },
  { name: "Pixel 6-9, Galaxy S Ultra (412x915)", w: 412, h: 915, touch: true },
  { name: "iPhone XR, 11, Plus (414x896)", w: 414, h: 896, touch: true },
  { name: "iPhone Pro Max (430x932)", w: 430, h: 932, touch: true },
  { name: "iPhone 16 Pro Max (440x956)", w: 440, h: 956, touch: true },
  // Phones, landscape
  { name: "iPhone SE landscape (667x375)", w: 667, h: 375, touch: true },
  { name: "iPhone landscape (844x390)", w: 844, h: 390, touch: true },
  { name: "Pixel landscape (915x412)", w: 915, h: 412, touch: true },
  // Tablets
  { name: "Galaxy Tab A (600x960)", w: 600, h: 960, touch: true },
  { name: "iPad mini (744x1133)", w: 744, h: 1133, touch: true },
  { name: "iPad 9th gen (768x1024)", w: 768, h: 1024, touch: true },
  { name: "iPad Air (820x1180)", w: 820, h: 1180, touch: true },
  { name: "iPad Pro 11 (834x1194)", w: 834, h: 1194, touch: true },
  { name: "iPad landscape (1024x768)", w: 1024, h: 768, touch: true },
  { name: "iPad Pro 12.9 (1024x1366)", w: 1024, h: 1366, touch: true },
  { name: "iPad Air landscape (1180x820)", w: 1180, h: 820, touch: true },
  // Laptops and desktops
  { name: "small laptop (1280x720)", w: 1280, h: 720 },
  { name: "laptop (1366x768)", w: 1366, h: 768 },
  { name: "MacBook Air (1440x900)", w: 1440, h: 900 },
  { name: "laptop at 125% (1536x864)", w: 1536, h: 864 },
  { name: "full HD (1920x1080)", w: 1920, h: 1080 }
];

/**
 * What a person would see wrong on this screen, as a list of sentences.
 * @param {import('@playwright/test').Page} page
 * @param {number} floor Smallest acceptable tap size in px.
 * @returns {Promise<string[]>} Problems; empty when the screen is right.
 */
function problems(page, floor) {
  return page.evaluate((floor) => {
    const out = [];
    const vw = document.documentElement.clientWidth;
    const shown = (el) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      const cs = getComputedStyle(el);
      return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.display !== "none";
    };
    if (document.documentElement.scrollWidth > vw + 1) {
      out.push(`the page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
    }
    const inside = (el, label) => {
      const r = el.getBoundingClientRect();
      if (r.left < -0.5 || r.right > vw + 0.5) out.push(`${label} is cut off by the edge (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`);
    };
    const tappable = (el, label) => {
      const r = el.getBoundingClientRect();
      if (r.height < floor || r.width < floor) out.push(`${label} is ${Math.round(r.width)}x${Math.round(r.height)}, under ${floor}px`);
    };
    // The design control
    const bar = document.getElementById("site-version-bar");
    const select = document.getElementById("site-version");
    if (!shown(bar) || !shown(select)) out.push("the design control is not showing");
    else {
      inside(bar, "the design control");
      inside(select, "the design choice");
      tappable(select, "the design choice");
      const label = bar.querySelector(".site-version-label");
      if (!shown(label)) out.push("the design control has no visible label");
    }
    // The header: one row, pinned, every destination whole
    const header = document.querySelector(".app-header");
    const hr = header.getBoundingClientRect();
    if (Math.round(hr.top) !== 0) out.push(`the header is not pinned to the top (${hr.top})`);
    const tops = [];
    header.querySelectorAll("#header-nav button, #btn-account, #btn-more").forEach((el) => {
      if (!shown(el)) return;
      const r = el.getBoundingClientRect();
      tops.push(Math.round(r.top));
      inside(el, `header "${el.textContent.trim()}"`);
      // The header draws short buttons where height is scarce and pays the
      // difference with a ::after that widens the hit area, so the area a
      // finger gets is the drawn box plus that reach.
      const after = getComputedStyle(el, "::after");
      const reach = after.position === "absolute" && after.content !== "none"
        ? Math.max(0, -parseFloat(after.top) || 0) + Math.max(0, -parseFloat(after.bottom) || 0)
        : 0;
      if (r.height + reach < floor || r.width < floor) {
        out.push(`header "${el.textContent.trim()}" gives a finger ${Math.round(r.width)}x${Math.round(r.height + reach)}, under ${floor}px`);
      }
      if (el.scrollWidth > el.clientWidth + 1) out.push(`header "${el.textContent.trim()}" is clipped`);
    });
    if (new Set(tops).size > 1) out.push(`the header's row wraps (tops ${[...new Set(tops)].join(", ")})`);
    // Progreso tabs, when they show
    const strip = document.getElementById("progress-tabs");
    if (shown(strip)) {
      inside(strip, "the Progreso tabs");
      if (vw <= 480 && strip.scrollWidth > strip.clientWidth + 1) {
        out.push(`a phone hides a Progreso tab behind a swipe (${strip.scrollWidth} in ${strip.clientWidth})`);
      }
      strip.querySelectorAll("button").forEach((tab) => {
        tappable(tab, `tab "${tab.textContent.trim()}"`);
        if (tab.scrollWidth > tab.clientWidth + 1) out.push(`tab "${tab.textContent.trim()}" is clipped`);
      });
      const current = strip.querySelector("[aria-current='true']");
      if (!current) out.push("no Progreso tab is marked as the current one");
      else {
        const r = current.getBoundingClientRect();
        const s = strip.getBoundingClientRect();
        if (r.left < s.left - 1 || r.right > s.right + 1) out.push("the current Progreso tab is scrolled out of the strip");
      }
    }
    // Catalogue fold controls
    document.querySelectorAll("#exercise-list .group-fold").forEach((fold) => {
      if (shown(fold)) tappable(fold, `group "${fold.textContent.trim().slice(0, 20)}"`);
    });
    // Nothing that should be read is under 12px
    document.querySelectorAll("#site-version-bar *, #progress-tabs *").forEach((el) => {
      if (shown(el) && el.textContent.trim() && parseFloat(getComputedStyle(el).fontSize) < 12) {
        out.push(`"${el.textContent.trim().slice(0, 20)}" is under 12px`);
      }
    });
    return out;
  }, floor);
}

for (const device of DEVICES) {
  for (const design of ["a", "b"]) {
    test(`${device.name}, design ${design.toUpperCase()}: nothing cut off, nothing too small, no sideways scroll`, async ({ browser }) => {
      const context = await browser.newContext({
        viewport: { width: device.w, height: device.h },
        hasTouch: !!device.touch,
        isMobile: !!device.touch && device.w < 600,
        locale: "es-PE",
        timezoneId: "America/Lima"
      });
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await page.addInitScript((design) => {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", "es");
        if (design === "b") localStorage.setItem("vt_site_version_v1", JSON.stringify({ ver: "b", src: "chosen" }));
      }, design);
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !!window.VTSiteVersion && !!window.VTApp && document.querySelectorAll("#exercise-list .card-ex").length > 0);
      // A finger gets 44px; a mouse pointer gets the WCAG 2.5.8 floor of 24px.
      const floor = tapFloorLimit(device.touch ? 44 : 24);
      expect(await page.evaluate(() => document.documentElement.getAttribute("data-site-version"))).toBe(design);
      expect(await problems(page, floor), "Practicar").toEqual([]);

      // The longer language: English labels are wider in places.
      await page.evaluate(() => window.VTI18n.setLang("en"));
      expect(await problems(page, floor), "Practicar, English").toEqual([]);
      await page.evaluate(() => window.VTI18n.setLang("es"));

      if (design === "b") {
        await page.evaluate(() => window.VTSiteLayout.openProgress("history"));
        await expect(page.locator("#view-history")).toBeVisible();
        expect(await problems(page, floor), "Progreso · Historial").toEqual([]);
        for (const tab of ["plan", "stats", "profiles"]) {
          await page.evaluate((t) => window.VTSiteLayout.openProgress(t), tab);
          await expect(page.locator(`[data-progress="${tab}"]`)).toHaveAttribute("aria-current", "true");
          expect(await problems(page, floor), `Progreso · ${tab}`).toEqual([]);
        }
        await page.evaluate(() => window.VTI18n.setLang("en"));
        expect(await problems(page, floor), "Progreso, English").toEqual([]);
      } else {
        await page.evaluate(() => document.getElementById("btn-history").click());
        await expect(page.locator("#view-history")).toBeVisible();
        expect(await problems(page, floor), "Historial").toEqual([]);
        await page.evaluate(() => document.getElementById("btn-plan").click());
        await expect(page.locator("#view-plan")).toBeVisible();
        expect(await problems(page, floor), "Plan").toEqual([]);
      }
      expect(errors).toEqual([]);
      await context.close();
    });
  }
}
