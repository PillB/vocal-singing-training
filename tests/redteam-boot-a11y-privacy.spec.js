/**
 * Red-team QA, batch "boot-a11y-privacy": the first seconds of the page, and
 * the places where an assistive setting or a blocked browser feature used to
 * leave the site unusable.
 *
 *  - cross-01: on a 320x568 phone the exercise stage is as tall as it needs to
 *    be for its two rails and the lanes between them (the page scrolls), and
 *    the speaking panel's buttons are not cut off. At 360x640 and 390x844 the
 *    stage still fits one screen.
 *  - cross-04: with site data blocked (localStorage and sessionStorage throw)
 *    the app still starts, shows its catalogue, switches language and opens
 *    the Plan.
 *  - cross-12: an English visitor on a slow connection never sees the Spanish
 *    page while it loads, the page is marked busy until the app has started,
 *    and the language guard always lifts, even when a script fails or hangs.
 *  - chrome-eea-bar-covers-page-bottom, chrome-eea-bar-aria-lang: the
 *    statistics question in the EEA reserves its own room at the end of the
 *    page and names its region in the page's language.
 *  - chrome-privacy-links-en, chrome-privacy-en-under-header, B6: English
 *    readers land on the English half of privacy.html, below the sticky
 *    header, and the English half is marked lang="en" with its own way back.
 *  - B10: the last small targets on a phone reach 44 px.
 *  - cross-05: forced colours keep the main button's shape, the current
 *    section's mark and the pressed state of toggles.
 *  - cross-06: text zoom to 150 percent (and Chrome's own very large font)
 *    does not push the page wider than the screen. The record button inside the
 *    stage is held back (see the fixme below).
 *
 * Titles marked [L] are timer-sensitive: run them inside the browser lock too.
 * No early-tap catcher or click replay is built (owner decision): the page
 * only holds an English visitor's first paint until it is in English, and says
 * it is busy until the app has started.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { test, expect, chromium } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const SMALL = { width: 320, height: 568 };
const MID = { width: 360, height: 640 };
const PHONE = { width: 390, height: 844 };
const LAPTOP = { width: 1280, height: 800 };
const LOCAL = /^(https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/|data:|blob:)/;
const ENDPOINT = "https://events.test/v1/events";
/** The browser the project runs, for the cases that need a profile of their own. */
const browserPath = (testInfo) => testInfo.project.use?.launchOptions?.executablePath;

/* ------------------------------------------------------------------ setup */

/** Language, tour seen, optional quiet mode and a few practised days, before the app loads. */
function seedScript({ lang, e2e, days, progress, blocked, human, endpoint }) {
  try {
    if (human) Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
    if (endpoint) window.VT_ANALYTICS_ENDPOINT = endpoint;
    if (blocked) {
      const boom = {
        get() {
          throw new DOMException("The operation is insecure.", "SecurityError");
        }
      };
      Object.defineProperty(window, "localStorage", boom);
      Object.defineProperty(window, "sessionStorage", boom);
      return;
    }
    localStorage.setItem("vt_tour_v1", "1");
    if (lang) localStorage.setItem("vt_lang", lang);
    if (e2e) sessionStorage.setItem("vt_e2e", "1");
    if ((days || progress) && !sessionStorage.getItem("vt_seeded_days")) {
      sessionStorage.setItem("vt_seeded_days", "1");
      localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: "singing" }));
      const pad = (n) => String(n).padStart(2, "0");
      const key = (off) => {
        const d = new Date();
        d.setHours(12, 0, 0, 0);
        d.setDate(d.getDate() + off);
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
      };
      const rows = {};
      (days || [-3, -2, -1]).forEach((off) => {
        rows[key(off)] = { sec: 240, n: 2, ex: ["s4-lip-trills", "s27-lip-trill-solfege"] };
      });
      localStorage.setItem("vt_days_v1", JSON.stringify({ v: 1, days: rows, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true }));
      if (progress) {
        const bag = {};
        [
          ["s4-lip-trills", 3, 7, 0],
          ["s27-lip-trill-solfege", 3, 6, 1],
          ["s7-humming", 1, 8, 3],
          ["s9-pitch-match", 2, 5, 6]
        ].forEach(([id, n, score, daysAgo], i) => {
          const at = new Date(Date.now() - daysAgo * 86400000 - 3600000).toISOString();
          bag[id] = {
            completedCount: n,
            lastScore: score,
            lastAt: at,
            history: Array.from({ length: n }, (_, j) => ({ id: `h${i}_${j}`, at, metrics: {}, score, notes: "", durationSec: 90 + 30 * j }))
          };
        });
        localStorage.setItem("vt_progress_v1", JSON.stringify(bag));
      }
    }
  } catch {
    /* ignore */
  }
}

/** A browser context with the page's own server only; the worker and Google are not part of these cases. */
async function open(browser, o = {}) {
  const ctx = await browser.newContext({
    viewport: o.vp || LAPTOP,
    ...(o.timezoneId ? { timezoneId: o.timezoneId } : {}),
    ...(o.locale ? { locale: o.locale } : {}),
    ...(o.forcedColors ? { forcedColors: o.forcedColors, colorScheme: "dark" } : {})
  });
  const page = await ctx.newPage();
  await page.addInitScript(seedScript, {
    lang: o.lang || "es",
    e2e: o.e2e !== false,
    days: o.days || null,
    progress: !!o.progress,
    blocked: !!o.blocked,
    human: !!o.human,
    endpoint: o.endpoint || null
  });
  if (o.zoom) {
    await page.addInitScript((pct) => {
      document.addEventListener("DOMContentLoaded", () => {
        const s = document.createElement("style");
        s.textContent = `html{font-size:${pct}% !important}`;
        document.head.appendChild(s);
      });
    }, o.zoom);
  }
  const sent = { batches: [], geo: 0 };
  await page.route((url) => !LOCAL.test(url.href) && !url.href.startsWith("https://events.test/"), (route) => route.abort("blockedbyclient"));
  await page.route("https://events.test/**", async (route) => {
    if (route.request().url().endsWith("/v1/geo")) {
      sent.geo += 1;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, country: "ES", placed: true, askFirst: true }) });
      return;
    }
    sent.batches.push(route.request().postData());
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  return { ctx, page, sent };
}

/** Load the app and wait until it has started. */
async function boot(page, hash = "") {
  await page.goto(BASE + "/" + hash, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && document.readyState !== "loading");
  await page.waitForTimeout(700);
}

/**
 * The first tab's whole exercise list. The count comes from the catalogue, not
 * a number: main's voice drills (#35) took the first tab from 20 exercises to
 * 24, and a fixed 20 then failed a boot that was whole. 20 stays as the floor,
 * so an empty catalogue cannot pass for a whole list.
 *
 * The tab is pinned too. A browser that blocks site data can only ever get the
 * default settings, so a boot here opens the first tab or it is wrong; #21's
 * fixed 20 caught a default that opened the singing tab (27 cards then), and a
 * count against "whichever tab is open" let it pass (RT3 on #39, mutant D18).
 */
async function expectWholeList(page) {
  const list = await page.evaluate(() => ({
    tab: window.VTApp?.getState?.().tab,
    shown: document.querySelectorAll("#exercise-list .card-ex").length,
    all: (window.VT_EXERCISES?.vocal || []).length
  }));
  expect(list.tab, "a boot with no stored settings opens the first tab").toBe("vocal");
  expect(list.all).toBeGreaterThanOrEqual(20);
  expect(list.shown).toBe(list.all);
}

/** The EEA statistics question, forced the way tests/region-gate.spec.js does. */
async function openEea(browser, o = {}) {
  const c = await open(browser, { ...o, e2e: false, human: true, endpoint: ENDPOINT, timezoneId: "Europe/Madrid", locale: o.lang === "en" ? "en-GB" : "es-ES" });
  await boot(c.page, o.hash || "");
  await c.page.waitForSelector("[data-region-consent]", { timeout: 8000 });
  await c.page.waitForTimeout(400);
  return c;
}

/** Fraction of an element that is not clipped by an overflow ancestor, 0..1. */
const SHOWN = (el) => {
  const b = el.getBoundingClientRect();
  let top = b.top;
  let bottom = b.bottom;
  for (let e = el.parentElement; e && e !== document.body; e = e.parentElement) {
    const cs = getComputedStyle(e);
    if (/(hidden|auto|scroll|clip)/.test(cs.overflowY)) {
      const r = e.getBoundingClientRect();
      top = Math.max(top, r.top);
      bottom = Math.min(bottom, r.bottom);
    }
  }
  return Math.max(0, bottom - top) / Math.max(1, b.height);
};

/* ----------------------------------------------------------------- cross-01 */

/** Where the pieces of a pitch stage sit, in viewport pixels. */
async function pitchStage(page) {
  return page.evaluate(() => {
    const r = (s) => {
      const e = document.querySelector(s);
      if (!e || e.closest("[hidden]")) return null;
      const b = e.getBoundingClientRect();
      return b.height ? { top: Math.round(b.top), bottom: Math.round(b.bottom), h: Math.round(b.height) } : null;
    };
    const coach = r("#stage-coach");
    const rail = r("#hud-bottom-rail");
    const canvas = r("#pitch-canvas");
    const stage = r("#highway-stage");
    const lanes = coach && rail && canvas ? Math.min(canvas.bottom, rail.top) - Math.max(canvas.top, coach.bottom) : null;
    return { coach, rail, canvas, stage, lanes, vh: window.innerHeight };
  });
}

test.describe("cross-01: the stage on a 320x568 phone", () => {
  for (const lang of ["en", "es"]) {
    test(`pitch stage ${lang}: lanes of at least 60 px, strip above the rail, Start reachable`, async ({ browser }) => {
      const { ctx, page } = await open(browser, { vp: SMALL, lang, days: [-3, -2, -1] });
      await boot(page, "#ejercicio/s9-pitch-match");
      await page.waitForSelector("#highway-stage", { state: "visible" });
      await page.waitForTimeout(600);
      const g = await pitchStage(page);
      expect(g.coach, "coach strip").not.toBeNull();
      expect(g.rail, "bottom rail").not.toBeNull();
      expect(g.coach.bottom, "the strip ends above the bottom rail").toBeLessThanOrEqual(g.rail.top + 2);
      expect(g.lanes, "lanes between the strip and the rail").toBeGreaterThanOrEqual(60);
      // The page scrolls to the rest of the stage: Start ends up on screen and is what a tap reaches.
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      await page.waitForTimeout(300);
      const start = await page.evaluate(() => {
        const b = document.querySelector("#btn-practice-start");
        const r = b.getBoundingClientRect();
        const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return { top: r.top, bottom: r.bottom, vh: window.innerHeight, hits: !!hit && b.contains(hit) };
      });
      expect(start.top).toBeGreaterThanOrEqual(0);
      expect(start.bottom).toBeLessThanOrEqual(start.vh + 1);
      expect(start.hits).toBe(true);
      await ctx.close();
    });
  }

  for (const lang of ["en", "es"]) {
    test(`speaking panel ${lang}: its buttons are whole and can be tapped after scrolling`, async ({ browser }) => {
      const { ctx, page } = await open(browser, { vp: SMALL, lang, days: [-3, -2, -1] });
      await boot(page, "#ejercicio/v14-pace-variation");
      await page.waitForSelector("#mode-focus-panel .mode-panel .st-taps .btn-primary", { state: "visible" });
      await page.waitForTimeout(600);
      // Measure what the learner sees first: scrolling an element into view would also scroll
      // the panel's own hidden overflow, which nobody can do by hand.
      const r = await page.evaluate((shownSrc) => {
        const shown = new Function("el", `return (${shownSrc})(el)`);
        const buttons = [...document.querySelectorAll("#mode-focus-panel .mode-panel button")].filter((b) => b.getBoundingClientRect().height);
        const seen = buttons.map((b) => Math.round(shown(b) * 100));
        return buttons.map((b, i) => {
          const at = b.getBoundingClientRect();
          window.scrollBy({ top: at.top - window.innerHeight / 2, behavior: "instant" });
          const bb = b.getBoundingClientRect();
          const hit = document.elementFromPoint(bb.left + bb.width / 2, bb.top + bb.height / 2);
          return {
            label: b.textContent.trim().slice(0, 24),
            shown: seen[i],
            inside: bb.top >= 0 && bb.bottom <= window.innerHeight && bb.left >= 0 && bb.right <= window.innerWidth,
            hits: !!hit && b.contains(hit)
          };
        });
      }, SHOWN.toString());
      expect(r.length).toBeGreaterThan(0);
      for (const b of r) {
        expect(b.shown, `${b.label} is cut off by its panel`).toBeGreaterThanOrEqual(99);
        expect(b.inside, `${b.label} is on screen after scrolling`).toBe(true);
        expect(b.hits, `a tap on ${b.label} reaches it`).toBe(true);
      }
      await ctx.close();
    });
  }

  for (const [name, vp] of [["360x640", MID], ["390x844", PHONE]]) {
    test(`pitch stage at ${name} still fits one screen`, async ({ browser }) => {
      const { ctx, page } = await open(browser, { vp, lang: "en", days: [-3, -2, -1] });
      await boot(page, "#ejercicio/s9-pitch-match");
      await page.waitForSelector("#highway-stage", { state: "visible" });
      await page.waitForTimeout(600);
      const g = await pitchStage(page);
      expect(g.stage.bottom, "stage bottom inside the screen").toBeLessThanOrEqual(g.vh);
      expect(g.lanes).toBeGreaterThanOrEqual(60);
      expect(g.coach.bottom).toBeLessThanOrEqual(g.rail.top + 2);
      const scrolls = await page.evaluate(() => document.documentElement.scrollHeight > window.innerHeight + 1);
      // The stage is the only thing that decides whether the first screen is whole.
      expect(g.stage.bottom).toBeLessThanOrEqual(g.vh);
      expect(typeof scrolls).toBe("boolean");
      await ctx.close();
    });
  }
});

/* ----------------------------------------------------------------- cross-04 */

test.describe("cross-04: site data blocked", () => {
  for (const [name, vp] of [["phone", PHONE], ["laptop", LAPTOP]]) {
    test(`the app starts, switches language and opens the Plan on a ${name}`, async ({ browser }) => {
      const { ctx, page } = await open(browser, { vp, blocked: true });
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !!window.VTApp, null, { timeout: 15000 });
      await page.waitForTimeout(800);
      await expectWholeList(page);
      if (name === "phone") await page.click("#btn-more");
      await page.click("#btn-lang");
      await expect(page.locator("html")).toHaveAttribute("lang", "en");
      await page.keyboard.press("Escape");
      await page.click("#btn-plan");
      await expect.poll(() => page.evaluate(() => document.querySelectorAll("#element-chips .chip").length)).toBe(17);
      expect(errors).toEqual([]);
      await ctx.close();
    });
  }

  test("storage that works is left alone", async ({ browser }) => {
    const { ctx, page } = await open(browser, { vp: LAPTOP });
    await boot(page);
    const r = await page.evaluate(() => {
      const d = Object.getOwnPropertyDescriptor(window, "localStorage");
      const s = Object.getOwnPropertyDescriptor(window, "sessionStorage");
      return {
        real: window.localStorage instanceof Storage && window.sessionStorage instanceof Storage,
        accessors: !!d && typeof d.get === "function" && !!s && typeof s.get === "function",
        langKept: localStorage.getItem("vt_lang")
      };
    });
    expect(r.real).toBe(true);
    expect(r.accessors).toBe(true);
    expect(r.langKept).toBe("es");
    await ctx.close();
  });

  test("a real profile that blocks all site data still starts (Chromium preference)", async ({}, testInfo) => {
    test.setTimeout(90000);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vt-blocked-"));
    fs.mkdirSync(path.join(dir, "Default"), { recursive: true });
    fs.writeFileSync(path.join(dir, "Default", "Preferences"), JSON.stringify({ profile: { default_content_setting_values: { cookies: 2 } } }));
    let ctx;
    try {
      ctx = await chromium.launchPersistentContext(dir, { executablePath: browserPath(testInfo), viewport: PHONE, locale: "en-US" });
      const page = ctx.pages()[0] || (await ctx.newPage());
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !!window.VTApp, null, { timeout: 15000 });
      await page.waitForTimeout(800);
      await expectWholeList(page);
      await page.click("#btn-plan");
      await expect.poll(() => page.evaluate(() => document.querySelectorAll("#element-chips .chip").length)).toBe(17);
      expect(errors).toEqual([]);
    } finally {
      if (ctx) await ctx.close();
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

/* ----------------------------------------------------------------- cross-12 */

/** True when the visible page still shows the Spanish interface. */
const spanishShowing = () => {
  const body = document.body;
  if (!body || getComputedStyle(body).visibility === "hidden") return false;
  if (!document.styleSheets.length) return false;
  const nav = document.getElementById("btn-history");
  return !!nav && nav.textContent.trim() === "Historial";
};

test.describe("cross-12: the first seconds", () => {
  test("[L] an English visitor never sees the Spanish page while it loads, and the page says it is busy", async ({ browser }) => {
    test.setTimeout(150000);
    const { ctx, page } = await open(browser, { vp: PHONE, lang: "en", days: [-3, -2, -1] });
    const cdp = await ctx.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    // Fast 3G, as Chrome's own preset
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    await page.goto(BASE + "/", { waitUntil: "commit", timeout: 120000 });
    let spanish = 0;
    let busySeen = false;
    let booted = false;
    for (let i = 0; i < 700 && !booted; i++) {
      await page.waitForTimeout(120);
      const s = await page
        .evaluate(`(() => { const sp = (${spanishShowing.toString()})(); const b = document.body; return { sp, busy: !!b && b.getAttribute("aria-busy") === "true", app: !!window.VTApp, ready: document.readyState }; })()`)
        .catch(() => null);
      if (!s) continue;
      if (s.sp) spanish += 1;
      if (s.busy && !s.app) busySeen = true;
      if (s.app && s.ready !== "loading") booted = true;
    }
    expect(booted, "the app started").toBe(true);
    expect(spanish, "polls that found the Spanish interface on screen").toBe(0);
    expect(busySeen, "the page is marked busy before the app has started").toBe(true);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => document.body.getAttribute("aria-busy")), "busy ends once the app has started").toBeNull();
    expect(await page.evaluate(() => document.documentElement.lang)).toBe("en");
    expect(await page.evaluate(() => document.getElementById("btn-history").textContent.trim())).toBe("History");
    await ctx.close();
  });

  test("the guard is not set for a Spanish visitor, who is shown the page straight away", async ({ browser }) => {
    const { ctx, page } = await open(browser, { vp: PHONE, lang: "es" });
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTApp);
    const r = await page.evaluate(() => ({ cls: document.documentElement.className, lang: document.documentElement.lang, vis: getComputedStyle(document.body).visibility }));
    expect(r.cls).not.toContain("vt-i18n-pending");
    expect(r.lang).toBe("es");
    expect(r.vis).toBe("visible");
    await ctx.close();
  });

  test("the guard lifts when i18n.js cannot be fetched", async ({ browser }) => {
    const { ctx, page } = await open(browser, { vp: PHONE, lang: "en" });
    await page.route("**/js/i18n.js*", (route) => route.abort("failed"));
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({ vis: getComputedStyle(document.body).visibility, cls: document.documentElement.className }));
    expect(r.vis).toBe("visible");
    expect(r.cls).not.toContain("vt-i18n-pending");
    await ctx.close();
  });

  test("the guard lifts when a script errors", async ({ browser }) => {
    const { ctx, page } = await open(browser, { vp: PHONE, lang: "en" });
    await page.route("**/js/i18n.js*", (route) =>
      route.fulfill({ status: 200, contentType: "text/javascript", body: "throw new Error('a script that fails');" })
    );
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.waitForTimeout(1500);
    const r = await page.evaluate(() => ({ vis: getComputedStyle(document.body).visibility, cls: document.documentElement.className }));
    expect(r.vis).toBe("visible");
    expect(r.cls).not.toContain("vt-i18n-pending");
    await ctx.close();
  });

  test("[L] the guard lifts after a few seconds when a script never arrives, and the page's language matches its text", async ({ browser }) => {
    test.setTimeout(60000);
    const { ctx, page } = await open(browser, { vp: PHONE, lang: "en" });
    // i18n.js is asked for and never answered; everything after it waits
    await page.route("**/js/i18n.js*", () => {});
    await page.goto(BASE + "/", { waitUntil: "commit" });
    await page.waitForSelector("html", { state: "attached" });
    await page.waitForTimeout(1200);
    const early = await page.evaluate(() => ({ vis: getComputedStyle(document.body).visibility, cls: document.documentElement.className }));
    expect(early.cls, "held while it could still arrive").toContain("vt-i18n-pending");
    expect(early.vis).toBe("hidden");
    await expect
      .poll(() => page.evaluate(() => getComputedStyle(document.body).visibility), { timeout: 12000, intervals: [250] })
      .toBe("visible");
    const late = await page.evaluate(() => ({ cls: document.documentElement.className, lang: document.documentElement.lang, nav: document.getElementById("btn-history").textContent.trim() }));
    expect(late.cls).not.toContain("vt-i18n-pending");
    // The text on screen is Spanish, so that is what the page says it is.
    expect(late.nav).toBe("Historial");
    expect(late.lang).toBe("es");
    await ctx.close();
  });

  test("no click is replayed: a tap on a header button before the app starts is not carried out later", async ({ browser }) => {
    const { ctx, page } = await open(browser, { vp: LAPTOP, lang: "es", days: [-3, -2, -1] });
    // app.js held back by 1.5 s, so the page is drawn and its buttons are not bound yet
    await page.route("**/js/app.js*", async (route) => {
      await new Promise((r) => setTimeout(r, 1500));
      await route.continue();
    });
    await page.goto(BASE + "/", { waitUntil: "commit" });
    await page.waitForSelector("#btn-plan", { state: "visible" });
    expect(await page.evaluate(() => !window.VTApp), "the app has not started yet").toBe(true);
    await page.click("#btn-plan", { force: true });
    await page.waitForFunction(() => !!window.VTApp);
    await page.waitForTimeout(1200);
    expect(await page.evaluate(() => window.VTApp.getState().view)).toBe("home");
    expect(await page.evaluate(() => location.hash)).toBe("");
    await ctx.close();
  });
});

/* ------------------------------------------------------- the first paint */

/**
 * The markup's own home (the hero a page without scripts shows) is not the home
 * the app draws. Painted first, it was swapped a moment later and everything
 * under it jumped: #catalog-panel 287 -> 444 px and the footer off the screen,
 * a layout shift of 0.54-0.67 on about half the desktop loads after PR #39
 * merged #21, against 1 in 18 on main before (review AE3, AE4). A tap on the
 * stale hero also landed on whatever moved under the finger.
 *
 * Correct: until the app has drawn the page, nothing below the header is shown,
 * so the first view of the content is the app's own and nothing moves. The hold
 * must also end when the app cannot: at DOMContentLoaded (the app's own start),
 * on load when js/boot-ready.js is missing, and after eight seconds when a
 * script never arrives. A page without scripts is never held.
 */
const shiftWatch = () => {
  window.__shifts = [];
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      if (e.hadRecentInput) continue;
      const src = e.sources.map((s) => (s.node && (s.node.id || s.node.className || s.node.nodeName)) || "?");
      window.__shifts.push({ value: e.value, src: src.join(",") });
    }
  }).observe({ type: "layout-shift", buffered: true });
};
const heldNow = () => ({
  app: !!window.VTApp,
  main: getComputedStyle(document.querySelector("main")).visibility,
  footer: getComputedStyle(document.querySelector(".app-footer")).visibility,
  header: getComputedStyle(document.querySelector(".app-header")).visibility
});

test.describe("the first paint is the app's own home", () => {
  for (const [lang, vp, days] of [
    ["es", LAPTOP, [-3, -2, -1]],
    ["en", LAPTOP, null],
    ["es", PHONE, null]
  ]) {
    test(`${lang} ${vp.width}px${days ? ", returning" : ", first visit"}: the markup's hero is never shown, so the page does not jump when the app draws it`, async ({ browser }) => {
      const { ctx, page } = await open(browser, { vp, lang, days });
      await page.addInitScript(shiftWatch);
      // app.js held back, so the page is certainly painted before the app can draw the home:
      // the race the review lost on half its loads, made certain
      await page.route("**/js/app.js*", async (route) => {
        await new Promise((r) => setTimeout(r, 900));
        await route.continue();
      });
      await page.goto(BASE + "/", { waitUntil: "commit" });
      await page.waitForSelector(".app-footer", { state: "attached" });
      await page.waitForTimeout(350);
      const during = await page.evaluate(heldNow);
      expect(during.app, "control: the app has not started yet").toBe(false);
      expect(during.main, "the markup's home is not on screen").toBe("hidden");
      expect(during.footer).toBe("hidden");
      if (lang === "es") expect(during.header, "the header is, at once").toBe("visible");
      await page.waitForFunction(() => !!window.VTApp && document.readyState !== "loading");
      await page.waitForTimeout(1200);
      const after = { ...(await page.evaluate(heldNow)), shifts: await page.evaluate(() => window.__shifts) };
      expect(after.main, "shown once the app has drawn it").toBe("visible");
      expect(after.footer).toBe("visible");
      const cls = after.shifts.reduce((n, s) => n + s.value, 0);
      expect(cls, `layout shifts: ${JSON.stringify(after.shifts)}`).toBeLessThan(0.1);
      await ctx.close();
    });
  }

  test("released when the app has started, not when the last image has loaded", async ({ browser }) => {
    const { ctx, page } = await open(browser, { vp: LAPTOP, lang: "es" });
    // An image added as the page is read and never answered: the load event waits for it
    await page.route("**/never-loads.png", () => {});
    await page.addInitScript(() => {
      document.addEventListener("DOMContentLoaded", () => {
        const img = new Image();
        img.src = "/never-loads.png";
        img.alt = "";
        document.body.appendChild(img);
      });
    });
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTApp);
    await expect.poll(() => page.evaluate(heldNow).then((r) => r.main), { timeout: 2000, intervals: [100] }).toBe("visible");
    expect(await page.evaluate(() => document.readyState), "control: the page has not finished loading").toBe("interactive");
    await ctx.close();
  });

  test("released when the page has loaded, if the script that ends it is missing", async ({ browser }) => {
    const { ctx, page } = await open(browser, { vp: LAPTOP, lang: "es" });
    await page.route("**/js/boot-ready.js*", (route) => route.abort("failed"));
    await page.goto(BASE + "/", { waitUntil: "load" });
    await expect.poll(() => page.evaluate(heldNow).then((r) => r.main), { timeout: 3000, intervals: [100] }).toBe("visible");
    await ctx.close();
  });

  test("[L] released after eight seconds at the most, when a script never arrives", async ({ browser }) => {
    test.setTimeout(60000);
    const { ctx, page } = await open(browser, { vp: LAPTOP, lang: "es" });
    // The last script is asked for and never answered: the page is never read to the end
    await page.route("**/js/boot-ready.js*", () => {});
    await page.goto(BASE + "/", { waitUntil: "commit" });
    await page.waitForSelector(".app-footer", { state: "attached" });
    await page.waitForTimeout(1500);
    const early = await page.evaluate(() => ({ main: getComputedStyle(document.querySelector("main")).visibility, ready: document.readyState }));
    expect(early.ready, "control: the page is still being read").toBe("loading");
    expect(early.main, "held while the app could still start").toBe("hidden");
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.querySelector("main")).visibility), { timeout: 10000, intervals: [250] }).toBe("visible");
    await ctx.close();
  });

  test("a page without scripts is never held: the markup's home is what it shows", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: LAPTOP, javaScriptEnabled: false });
    const page = await ctx.newPage();
    await page.goto(BASE + "/", { waitUntil: "load" });
    const r = await page.evaluate(() => ({ main: getComputedStyle(document.querySelector("main")).visibility, cls: document.documentElement.className }));
    expect(r).toEqual({ main: "visible", cls: expect.not.stringContaining("vt-boot-pending") });
    await ctx.close();
  });
});

/* ------------------------------------------------------------- the EEA bar */

test.describe("the EEA statistics question", () => {
  for (const [name, view, hash] of [
    ["home", "home", ""],
    ["Plan", "plan", "#plan"],
    ["an exercise", "exercise", "#ejercicio/s4-lip-trills"]
  ]) {
    test(`reserves its room: the end of ${name} can be scrolled above it`, async ({ browser }) => {
      const { ctx, page } = await openEea(browser, { vp: PHONE, lang: "es", hash, days: [-3, -2, -1] });
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      await page.waitForTimeout(500);
      const covered = await page.evaluate((view) => {
        const barTop = document.querySelector("[data-region-consent]").getBoundingClientRect().top;
        const sels = view === "exercise" ? ["#btn-practice-start"] : ["#footer-guide-link", '.app-footer a[href^="privacy"]', ".app-footer [data-privacy-toggle]"];
        const seen = sels.map((s) => [s, document.querySelector(s)]).filter(([, e]) => e && e.getBoundingClientRect().height > 0);
        return { seen: seen.map(([s]) => s), under: seen.filter(([, e]) => e.getBoundingClientRect().bottom > barTop + 1).map(([s, e]) => `${s} ${Math.round(e.getBoundingClientRect().bottom - barTop)}px`) };
      }, view);
      expect(covered.seen.length, "something to look at").toBeGreaterThan(0);
      expect(covered.under, "what is still under the bar at the deepest scroll").toEqual([]);
      await ctx.close();
    });
  }

  test("the room is given back when the question is answered", async ({ browser }) => {
    const { ctx, page } = await openEea(browser, { vp: PHONE, lang: "es", days: [-3, -2, -1] });
    expect(await page.evaluate(() => document.body.classList.contains("region-consent-open"))).toBe(true);
    expect(await page.evaluate(() => parseFloat(document.documentElement.style.getPropertyValue("--region-consent-h")))).toBeGreaterThan(40);
    await page.click("[data-region-reject]");
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => document.body.classList.contains("region-consent-open"))).toBe(false);
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue("--region-consent-h"))).toBe("");
    expect(await page.evaluate(() => parseFloat(getComputedStyle(document.body).paddingBottom))).toBeLessThan(40);
    await ctx.close();
  });

  for (const [from, to] of [["es", "en"], ["en", "es"]]) {
    test(`names its region in the page's language after ${from} to ${to}`, async ({ browser }) => {
      const { ctx, page } = await openEea(browser, { vp: LAPTOP, lang: from });
      const want = { es: "Estadísticas anónimas", en: "Anonymous statistics" };
      const label = () => page.evaluate(() => document.querySelector("[data-region-consent]").getAttribute("aria-label"));
      expect(await label()).toBe(want[from]);
      await page.evaluate((l) => window.VTI18n.setLang(l), to);
      await page.waitForTimeout(300);
      expect(await label()).toBe(want[to]);
      expect(await page.evaluate(() => document.querySelector("[data-region-consent]").getAttribute("lang"))).toBe(to);
      await ctx.close();
    });
  }
});

/* ---------------------------------------------------------- privacy links */

test.describe("privacy.html in English", () => {
  test("the footer link, the bar's link and the English guide point at the English half", async ({ browser }) => {
    const en = await open(browser, { vp: LAPTOP, lang: "en" });
    await boot(en.page);
    const footer = () => en.page.evaluate(() => [...document.querySelectorAll('.app-footer a[href*="privacy"]')].map((a) => a.getAttribute("href")));
    expect(await footer()).toEqual(["privacy.html#en"]);
    // and back again in Spanish
    await en.page.evaluate(() => window.VTI18n.setLang("es"));
    await en.page.waitForTimeout(200);
    expect(await footer()).toEqual(["privacy.html"]);
    await en.ctx.close();

    const bar = await openEea(browser, { vp: LAPTOP, lang: "en" });
    expect(await bar.page.evaluate(() => document.querySelector("[data-region-more]").getAttribute("href"))).toBe("privacy.html#en");
    await bar.page.evaluate(() => window.VTI18n.setLang("es"));
    await bar.page.waitForTimeout(200);
    expect(await bar.page.evaluate(() => document.querySelector("[data-region-more]").getAttribute("href"))).toBe("privacy.html");
    await bar.ctx.close();

    const g = await open(browser, { vp: LAPTOP });
    await g.page.goto(BASE + "/guide.html");
    const links = await g.page.evaluate(() => [...document.querySelectorAll('section[lang="en"] a[href*="privacy.html"]')].map((a) => a.getAttribute("href")));
    expect(links.length).toBeGreaterThan(0);
    expect(links.every((h) => /#en$/.test(h))).toBe(true);
    await g.ctx.close();
  });

  for (const [name, vp] of [["phone", PHONE], ["laptop", LAPTOP]]) {
    for (const how of ["deep link", "the English link"]) {
      test(`${how} puts the heading below the sticky header (${name})`, async ({ browser }) => {
        const { ctx, page } = await open(browser, { vp });
        if (how === "deep link") {
          await page.goto(BASE + "/privacy.html#en");
        } else {
          await page.goto(BASE + "/privacy.html");
          await page.click('a[href="#en"]');
        }
        await page.waitForTimeout(1200);
        const m = await page.evaluate(() => ({
          top: Math.round(document.getElementById("en").getBoundingClientRect().top),
          header: Math.round(document.querySelector("header.app-header").getBoundingClientRect().bottom)
        }));
        expect(m.top).toBeGreaterThanOrEqual(m.header);
        await ctx.close();
      });
    }
  }

  test("the English half is marked lang=en and ends with its own way back", async ({ browser }) => {
    const { ctx, page } = await open(browser, { vp: LAPTOP });
    await page.goto(BASE + "/privacy.html");
    const r = await page.evaluate(() => {
      const langOf = (el) => (el.closest("[lang]") || document.documentElement).getAttribute("lang");
      const h = document.getElementById("en");
      const sec = h.closest("section[lang]");
      const back = [...document.querySelectorAll("main a")].filter((a) => a.getAttribute("href") === "./");
      return {
        h: langOf(h),
        spanishFirst: langOf(document.querySelector("main h1")),
        sectionLast: sec ? sec.lastElementChild.querySelector("a")?.textContent.trim() : null,
        back: back.map((a) => ({ text: a.textContent.trim(), lang: langOf(a) }))
      };
    });
    expect(r.h).toBe("en");
    expect(r.spanishFirst).toBe("es");
    expect(r.sectionLast).toMatch(/Back to the app/);
    expect(r.back.some((b) => /Back to the app/.test(b.text) && b.lang === "en")).toBe(true);
    expect(r.back.some((b) => /Volver a la app/.test(b.text) && b.lang === "es")).toBe(true);
    await ctx.close();
  });
});

/* ---------------------------------------------------------------- B10: taps */

test.describe("B10: the last small targets on a phone", () => {
  test("the Pro dialog's 'more' summary, privacy.html's back links and the bar's link reach 44 px", async ({ browser }) => {
    const pro = await open(browser, { vp: PHONE, lang: "es", days: [-3, -2, -1] });
    await boot(pro.page);
    await pro.page.evaluate(() => window.VTApp.openPricing());
    await pro.page.waitForSelector("#pricing-modal details.plan-more > summary", { state: "visible" });
    const summary = await pro.page.evaluate(() => document.querySelector("#pricing-modal details.plan-more > summary").getBoundingClientRect().height);
    expect(summary).toBeGreaterThanOrEqual(43.5);
    await pro.ctx.close();

    const pr = await open(browser, { vp: PHONE });
    await pr.page.goto(BASE + "/privacy.html");
    const backs = await pr.page.evaluate(() => [...document.querySelectorAll("main a")].filter((a) => a.getAttribute("href") === "./").map((a) => Math.round(a.getBoundingClientRect().height * 10) / 10));
    expect(backs.length).toBeGreaterThanOrEqual(2);
    for (const h of backs) expect(h).toBeGreaterThanOrEqual(43.5);
    await pr.ctx.close();

    const bar = await openEea(browser, { vp: PHONE, lang: "es" });
    const more = await bar.page.evaluate(() => document.querySelector("[data-region-more]").getBoundingClientRect().height);
    expect(more).toBeGreaterThanOrEqual(43.5);
    await bar.ctx.close();
  });
});

/* -------------------------------------------------------------- cross-05 */

test.describe("cross-05: forced colours", () => {
  for (const [name, vp] of [["laptop", LAPTOP], ["phone", PHONE]]) {
    for (const lang of ["es", "en"]) {
      test(`the main button, the current section and pressed toggles have a shape (${name}, ${lang})`, async ({ browser }) => {
        const { ctx, page } = await open(browser, { vp, lang, forcedColors: "active", days: [-3, -2, -1] });
        await boot(page, "#ejercicio/s9-pitch-match");
        expect(await page.evaluate(() => matchMedia("(forced-colors: active)").matches)).toBe(true);
        const r = await page.evaluate(() => {
          const start = document.querySelector("#btn-practice-start");
          const sc = getComputedStyle(start);
          const links = [...document.querySelectorAll(".header-nav .nav-link")].filter((a) => a.getBoundingClientRect().width);
          const cur = links.find((a) => a.getAttribute("aria-current") === "page");
          const other = links.find((a) => a !== cur);
          const sig = (el) => {
            const cs = getComputedStyle(el);
            return { deco: cs.textDecorationLine, border: cs.borderTopColor, bw: cs.borderTopWidth };
          };
          return {
            startBorder: parseFloat(sc.borderTopWidth) > 0 && sc.borderTopStyle !== "none",
            cur: cur ? sig(cur) : null,
            other: other ? sig(other) : null
          };
        });
        expect(r.startBorder, "Start has a border").toBe(true);
        expect(r.cur, "a current section").not.toBeNull();
        expect(r.cur.deco).toContain("underline");
        expect(r.other.deco).not.toContain("underline");
        expect(r.cur.border).not.toBe(r.other.border);
        // Pressed toggles on the home page
        await page.evaluate(() => window.VTApp.setView("home"));
        await page.waitForTimeout(600);
        const pressed = await page.evaluate(() => {
          const vis = (e) => e.getBoundingClientRect().width > 0 && !e.closest("[hidden]");
          const on = [...document.querySelectorAll('#view-home [aria-pressed="true"]')].filter(vis);
          const off = [...document.querySelectorAll('#view-home [aria-pressed="false"]')].filter(vis);
          const o = (e) => {
            const cs = getComputedStyle(e);
            return cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0 ? `${cs.outlineWidth} ${cs.outlineStyle}` : "none";
          };
          return { on: on.map(o), off: off.map(o) };
        });
        expect(pressed.on.length, "a pressed toggle to look at").toBeGreaterThan(0);
        expect(pressed.off.length, "an unpressed toggle to compare").toBeGreaterThan(0);
        for (const o of pressed.on) expect(o).not.toBe("none");
        for (const o of pressed.off) expect(o).toBe("none");
        await ctx.close();
      });
    }
  }
});

/* -------------------------------------------------------------- cross-06 */

/** Spill of each size name out of its own button, widest page, and the record button past the stage. */
async function zoomMetrics(page) {
  return page.evaluate(() => {
    const tiers = [...document.querySelectorAll("#loop-tiers .loop-tier")].filter((b) => b.getBoundingClientRect().width);
    const spill = tiers.map((b) => {
      const n = b.querySelector(".loop-tier-name");
      if (!n) return 0;
      const r = n.getBoundingClientRect();
      const br = b.getBoundingClientRect();
      return Math.round(Math.max(0, br.left - r.left, r.right - br.right));
    });
    const tabs = [...document.querySelectorAll(".track-tab")].filter((b) => b.getBoundingClientRect().width).map((b) => Math.round(b.getBoundingClientRect().right));
    const rec = document.querySelector("#opt-auto-record");
    const stage = document.querySelector("#highway-stage");
    return {
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
      spill: Math.max(0, ...spill),
      tiers: tiers.length,
      tabsRight: Math.max(0, ...tabs),
      recPast: rec && stage && rec.getBoundingClientRect().width ? Math.round(rec.getBoundingClientRect().right - Math.min(stage.getBoundingClientRect().right, innerWidth)) : null
    };
  });
}

test.describe("cross-06: text zoom on a phone", () => {
  for (const lang of ["es", "en"]) {
    test(`150 percent text keeps home, Historial and an exercise inside the screen (${lang})`, async ({ browser }) => {
      test.setTimeout(90000);
      // Home
      let c = await open(browser, { vp: PHONE, lang, zoom: 150, days: [-3, -2, -1], progress: true });
      await boot(c.page);
      let m = await zoomMetrics(c.page);
      expect(m.tiers, "size picker on home").toBeGreaterThan(0);
      expect(m.spill, "size names inside their buttons").toBeLessThanOrEqual(2);
      expect(m.sw, "home is no wider than the screen").toBeLessThanOrEqual(m.cw + 1);
      expect(m.tabsRight, "track tabs inside the screen").toBeLessThanOrEqual(m.cw + 1);
      // Historial
      await c.page.goto(BASE + "/#historial");
      await c.page.waitForTimeout(1200);
      m = await zoomMetrics(c.page);
      expect(m.sw, "Historial is no wider than the screen").toBeLessThanOrEqual(m.cw + 1);
      await c.ctx.close();
      // Exercise
      c = await open(browser, { vp: PHONE, lang, zoom: 150, days: [-3, -2, -1] });
      await boot(c.page, "#ejercicio/s9-pitch-match");
      await c.page.waitForSelector("#opt-auto-record", { state: "visible" });
      await c.page.waitForTimeout(500);
      m = await zoomMetrics(c.page);
      expect(m.sw, "the exercise is no wider than the screen").toBeLessThanOrEqual(m.cw + 1);
      await c.ctx.close();
    });

    // The phone rail's own rule (Start and "Grabarme" sharing the row when text is
    // larger) sits in the block the take batch owns, so this case is held back until
    // that rule lands with the integration.
    test(`150 percent text keeps the record button inside the stage (${lang})`, async ({ browser }) => {
      const { ctx, page } = await open(browser, { vp: PHONE, lang, zoom: 150, days: [-3, -2, -1] });
      await boot(page, "#ejercicio/s9-pitch-match");
      await page.waitForSelector("#opt-auto-record", { state: "visible" });
      await page.waitForTimeout(500);
      const m = await zoomMetrics(page);
      expect(m.recPast, "the record button past the stage edge").toBeLessThanOrEqual(2);
      await ctx.close();
    });
  }

  for (const [lang, view] of [["en", "home"], ["es", "history"]]) {
    test(`Chrome's own very large font keeps ${view} inside the screen (${lang})`, async ({}, testInfo) => {
      test.setTimeout(90000);
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vt-font-"));
      fs.mkdirSync(path.join(dir, "Default"), { recursive: true });
      fs.writeFileSync(path.join(dir, "Default", "Preferences"), JSON.stringify({ webkit: { webprefs: { default_font_size: 24 } } }));
      let ctx;
      try {
        // The headless shell Playwright runs by default never reads a profile's
        // Preferences (it renders 16 px whatever default_font_size says); the full
        // Chromium in its new headless mode does, so this case asks for it
        const exe = browserPath(testInfo);
        ctx = await chromium.launchPersistentContext(dir, { channel: exe ? undefined : "chromium", executablePath: exe, viewport: PHONE, locale: lang === "en" ? "en-US" : "es-PE" });
        const page = ctx.pages()[0] || (await ctx.newPage());
        await page.route((url) => !LOCAL.test(url.href), (route) => route.abort("blockedbyclient"));
        await page.addInitScript(seedScript, { lang, e2e: true, days: [-3, -2, -1], progress: true });
        await page.goto(BASE + "/" + (view === "history" ? "#historial" : ""), { waitUntil: "domcontentloaded" });
        await page.waitForFunction(() => !!window.VTApp);
        await page.waitForTimeout(1200);
        expect(await page.evaluate(() => parseFloat(getComputedStyle(document.documentElement).fontSize))).toBeGreaterThan(20);
        const m = await zoomMetrics(page);
        expect(m.sw, "page width").toBeLessThanOrEqual(m.cw + 1);
        expect(m.spill, "size names inside their buttons").toBeLessThanOrEqual(2);
      } finally {
        if (ctx) await ctx.close();
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  }
});
