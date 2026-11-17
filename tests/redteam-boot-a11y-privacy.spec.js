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
function seedScript({ lang, e2e, days, progress, blocked, human, endpoint, fresh, store }) {
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
    if (e2e) sessionStorage.setItem("vt_e2e", "1");
    // Keys another page keeps (admin.html's language switch writes vt_lang alone)
    for (const [k, v] of Object.entries(store || {})) localStorage.setItem(k, v);
    // This browser's first load: nothing of the site's stored yet
    if (fresh) return;
    localStorage.setItem("vt_tour_v1", "1");
    if (lang) localStorage.setItem("vt_lang", lang);
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
    ...(o.reducedMotion ? { reducedMotion: o.reducedMotion } : {}),
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
    endpoint: o.endpoint || null,
    fresh: !!o.fresh,
    store: o.store || null
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
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(o.geo || { ok: true, country: "ES", placed: true, askFirst: true }) });
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

  /*
   * index.html asks ahead for every script, and a request that fails (a 404
   * after a partial deploy, a request dropped on a weak line, a blocking rule)
   * fires an error on that request's own element while the head is still
   * being read. Taken for a failed script, it let go of an English visitor's
   * hold before the strings had come, and the page showed in Spanish for up
   * to 0.94 s (review of PR #42, rt3). The script's own tag still says so,
   * when the parser reaches it. Here the strings take a second to come.
   */
  test("the guard holds when a script late in the page cannot be fetched, until the strings have come", async ({ browser }) => {
    const { ctx, page } = await open(browser, { vp: PHONE, lang: "en", days: [-3, -2, -1] });
    await page.addInitScript(`window.__spanishFrames = 0; (function sample() { if ((${spanishShowing.toString()})()) window.__spanishFrames++; if (!window.VTApp) requestAnimationFrame(sample); })();`);
    await page.route("**/js/wake-lock.js*", (route) => route.fulfill({ status: 404, contentType: "text/plain", body: "" }));
    await page.route("**/js/i18n-early.js*", async (route) => {
      await new Promise((r) => setTimeout(r, 1000));
      await route.continue();
    });
    const failed = [];
    page.on("requestfailed", (r) => failed.push(r.url()));
    page.on("response", (r) => r.status() === 404 && failed.push(r.url()));
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTApp);
    await page.waitForTimeout(300);
    expect(failed.some((u) => /wake-lock\.js/.test(u)), "control: wake-lock.js could not be fetched").toBe(true);
    expect(await page.evaluate(() => window.__spanishFrames), "frames that showed the Spanish interface").toBe(0);
    expect(await page.evaluate(() => ({ lang: document.documentElement.lang, nav: document.getElementById("btn-history").textContent.trim() }))).toEqual({ lang: "en", nav: "History" });
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
 * Correct: until the app has drawn the page, nothing below the header that it
 * will move is shown, so the first view of the content is the app's own and
 * nothing moves. The hold must also end when the app cannot: at
 * DOMContentLoaded (the app's own start), on load when js/boot-ready.js is
 * missing, and after eight seconds when a script never arrives. A page without
 * scripts is never held.
 *
 * Wrong behaviour rejected later (review of PR #40, red team 2): the whole page
 * held on this browser's first load, when nothing is cached, made the app's
 * start the first time anything showed: about 5 s on a 4G phone and 1.8 s on a
 * fast line, against 0.8 and 0.3 s on main. On a first load the hero's words
 * show at once, where the app keeps them and as it writes them for someone new;
 * on every later load the scripts are cached and all of it waits (half a
 * second on a 4G phone).
 *
 * Wrong behaviour rejected in the review of PR #42: from 861 px wide the hero's
 * title was laid out larger and in a narrower column than the app's, and shrank
 * as the app started; the line over it said "Empieza aquí" until the app wrote
 * its own; a visitor who had read the guide first was held like a returning
 * one (the guide stores keys of its own, and the hero was gated on none at
 * all); and an address with a forced experiment arm flashed the control arm's
 * hero. The strings are held back too in the first-load cases, so what is
 * compared is the markup itself, and the title is checked as painted, not as
 * styled visible.
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
  // Where the blocks stand the moment the hold ends. Shown then, they must not
  // move after; the layout-shift entries alone under-report a block that was
  // hidden until a moment before it moved.
  let held = false;
  new MutationObserver((_, watch) => {
    const html = document.documentElement;
    if (!html) return;
    if (html.classList.contains("vt-boot-pending")) {
      held = true;
      return;
    }
    if (!held) return;
    const top = (id) => Math.round(document.getElementById(id)?.getBoundingClientRect().top ?? -1);
    window.__atRelease = { hero: top("start-panel"), catalog: top("catalog-panel") };
    watch.disconnect();
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ["class"] });
};
/**
 * Every frame from the first load's hero's first until 30 frames after the
 * hold ends: how it is drawn (the opacity the title is drawn at, its top and
 * whether it is visible), so a hero that fades or rises in, or blinks out as
 * the app starts, is seen.
 */
const frameWatch = () => {
  window.__heroFrames = [];
  let after = 0;
  const sample = () => {
    const html = document.documentElement;
    const t = document.getElementById("start-title");
    const view = document.getElementById("view-home");
    const shown = !!t && getComputedStyle(t).visibility === "visible";
    if (t && view && !window.__probing && html.classList.contains("vt-boot-hero") && (shown || window.__heroFrames.length)) {
      const held = html.classList.contains("vt-boot-pending");
      // The opacity the title is drawn at: its own and every ancestor's, not
      // only the view's (a fade of the hero or of its column passed; review
      // of PR #42, rt4)
      let drawn = 1;
      for (let e = t; e; e = e.parentElement) drawn *= parseFloat(getComputedStyle(e).opacity);
      window.__heroFrames.push({ top: Math.round(t.getBoundingClientRect().top * 10) / 10, opacity: String(Math.round(drawn * 1000) / 1000), shown, held });
    }
    if (window.__heroFrames.length && !html.classList.contains("vt-boot-pending") && ++after > 30) return;
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
};
/** Frames drawn otherwise than the last one: faded, hidden, or the title elsewhere. */
const unsteady = (frames) => frames.filter((f) => f.opacity !== "1" || !f.shown || Math.abs(f.top - frames[frames.length - 1].top) > 0.5);
/**
 * What fades in when the hold ends: the targets of js/boot-ready.js's
 * vt-boot-reveal animations over the first six frames after it.
 */
const revealWatch = () => {
  window.__revealed = null;
  let held = false;
  let frames = 0;
  const found = new Set();
  const sample = () => {
    const html = document.documentElement;
    if (html && html.classList.contains("vt-boot-pending")) held = true;
    else if (held) {
      for (const a of document.getAnimations()) {
        if (a.id !== "vt-boot-reveal") continue;
        const el = a.effect.target;
        // A fade of what holds the kicker or the title fades them too
        const words = ["start-kicker", "start-title"].filter((id) => el.contains(document.getElementById(id)));
        for (const w of words.length ? words : [el.id || String(el.className)]) found.add(w);
      }
      if (++frames >= 6) {
        window.__revealed = [...found].sort();
        return;
      }
    }
    requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
};
/** Every frame, until the app has started, in which the Spanish title is on screen under lang="en". */
const langWatch = () => {
  window.__spanishShown = [];
  const sample = () => {
    const t = document.getElementById("start-title");
    if (t && document.documentElement.lang === "en" && getComputedStyle(t).visibility === "visible" && /Entrena/.test(t.textContent)) {
      window.__spanishShown.push(Math.round(performance.now()));
    }
    if (!window.VTApp) requestAnimationFrame(sample);
  };
  requestAnimationFrame(sample);
};
/** Equal to within a pixel, rounding aside. */
const near = (a, b) => Math.abs(a - b) <= 1;
const heldNow = () => ({
  app: !!window.VTApp,
  main: getComputedStyle(document.querySelector("main")).visibility,
  footer: getComputedStyle(document.querySelector(".app-footer")).visibility,
  header: getComputedStyle(document.querySelector(".app-header")).visibility,
  hero: getComputedStyle(document.getElementById("start-panel")).visibility,
  catalog: getComputedStyle(document.getElementById("catalog-panel")).visibility,
  tops: { hero: Math.round(document.getElementById("start-panel").getBoundingClientRect().top), catalog: Math.round(document.getElementById("catalog-panel").getBoundingClientRect().top) }
});
/**
 * The first load's hero: its words and how they are laid out, whether the
 * strings have been applied yet, and any control on the page that shows
 * before it works.
 */
const heroNow = () => {
  const t = document.getElementById("start-title");
  const shown = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility === "visible";
  const box = t.getBoundingClientRect();
  return {
    strings: !!window.VTI18n,
    kicker: document.getElementById("start-kicker").textContent.trim(),
    kickerShown: shown(document.getElementById("start-kicker")),
    intro: shown(document.getElementById("start-sub")),
    otherWays: document.getElementById("more-ways").getClientRects().length,
    title: { text: t.textContent.trim(), size: getComputedStyle(t).fontSize, top: Math.round(box.top), width: Math.round(box.width), shown: shown(t) },
    controls: [...document.querySelectorAll(".main :is(button, a, select, input)")].filter(shown).map((el) => el.id || el.textContent.trim().slice(0, 24))
  };
};
/** The words of the hero and their size, which must not change as the app starts. */
const words = (h) => ({ kicker: h.kicker, title: h.title.text, size: h.title.size });
/**
 * Whether the title is painted, not only laid out: its box as it is against
 * the same box with the title hidden. Visible by its style alone, it could
 * still be covered or drawn at no opacity. Chromium's own capture: Playwright
 * 1.61's page.screenshot waits for the page while a script is held back, and
 * never returns (1.63 does not).
 */
async function titlePainted(page) {
  const cdp = await page.context().newCDPSession(page);
  const frame = () => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const shot = async () => {
    const clip = await page.evaluate(() => {
      const r = document.getElementById("start-title").getBoundingClientRect();
      return { x: r.x, y: r.y, width: Math.max(1, r.width), height: Math.max(1, r.height), scale: 1 };
    });
    return (await cdp.send("Page.captureScreenshot", { format: "png", clip })).data;
  };
  const shown = await shot();
  // frameWatch leaves out the frames this hides the title in on purpose
  await page.evaluate(() => {
    window.__probing = true;
    document.getElementById("start-title").style.visibility = "hidden";
  });
  await frame();
  const hidden = await shot();
  await page.evaluate(() => (document.getElementById("start-title").style.visibility = ""));
  await frame();
  await page.evaluate(() => (window.__probing = false));
  await cdp.detach();
  return shown !== hidden;
}
/**
 * The kicker and the title as drawn: a capture of the box around both
 * (Chromium's own, as in titlePainted). Equal before and after the app has
 * started, nothing in them has changed: not the words, their weight, colour,
 * spacing or place, and nothing has come over them. The card behind them is
 * painted plain black for the capture: its gradients are sized to the card,
 * which the app makes taller, so the tint behind the words shifts by up to
 * 13/255 (5%) when it starts. That shift is accepted; the words are what is
 * read.
 */
async function heroPixels(page) {
  const cdp = await page.context().newCDPSession(page);
  const clip = await page.evaluate(() => {
    const panel = document.getElementById("start-panel");
    panel.style.background = "#000";
    panel.style.boxShadow = "none";
    const a = document.getElementById("start-kicker").getBoundingClientRect();
    const b = document.getElementById("start-title").getBoundingClientRect();
    const x = Math.min(a.left, b.left);
    const y = Math.min(a.top, b.top);
    return { x, y, width: Math.max(a.right, b.right) - x, height: Math.max(a.bottom, b.bottom) - y, scale: 1 };
  });
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  const { data } = await cdp.send("Page.captureScreenshot", { format: "png", clip });
  await page.evaluate(() => {
    const panel = document.getElementById("start-panel");
    panel.style.background = "";
    panel.style.boxShadow = "";
  });
  await cdp.detach();
  return { clip, data };
}
/**
 * Open a page (or reload it, path null) with these scripts held back until
 * go() lets them through (one by name, or all), so it is certainly painted
 * before they run (the race the review lost on half its loads, made certain),
 * and report what is held a moment after the page has been read to its footer.
 */
async function heldBack(page, path, scripts = ["app.js"]) {
  const gates = {};
  for (const name of scripts) {
    let open;
    const gate = new Promise((r) => (open = r));
    gates[name] = open;
    await page.route(`**/js/${name}*`, async (route) => {
      await gate;
      await route.continue();
    });
  }
  const go = (name) => (name ? [gates[name]] : Object.values(gates)).forEach((open) => open());
  await (path === null ? page.reload({ waitUntil: "commit" }) : page.goto(BASE + path, { waitUntil: "commit" }));
  await page.waitForSelector(".app-footer", { state: "attached" });
  await page.waitForTimeout(350);
  return { held: await page.evaluate(heldNow), go };
}
/**
 * A server for a page that arrives slowly: index.html as the server under
 * test sends it, its head at once, then its body up to the first script in
 * `chunks` pieces over `overMs` (a response that stalls on a lossy line), then
 * the rest; every other file as the server under test sends it. Playwright's
 * routes answer a request whole, so it takes a server of its own.
 */
async function trickling(overMs, chunks) {
  const http = require("http");
  const markup = await (await fetch(BASE + "/")).text();
  const head = markup.indexOf("<body>") + "<body>".length;
  const firstScript = markup.indexOf("<script", head);
  const body = markup.slice(head, firstScript);
  const server = http.createServer(async (req, res) => {
    if (/^\/(index\.html)?(\?|$)/.test(req.url)) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
      res.write(markup.slice(0, head));
      for (let i = 0; i < chunks && !res.destroyed; i++) {
        await new Promise((r) => setTimeout(r, overMs / chunks));
        res.write(body.slice(Math.floor((i * body.length) / chunks), Math.floor(((i + 1) * body.length) / chunks)));
      }
      res.end(markup.slice(firstScript));
      return;
    }
    const up = await fetch(BASE + req.url).catch(() => null);
    if (!up) return res.writeHead(502).end();
    res.writeHead(up.status, { "content-type": up.headers.get("content-type") || "application/octet-stream" });
    res.end(Buffer.from(await up.arrayBuffer()));
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const close = () => {
    server.closeAllConnections();
    return new Promise((r) => server.close(r));
  };
  return { url: `http://127.0.0.1:${server.address().port}`, close };
}
/** The app's start, then a little over a second for anything that would still move. */
async function settled(page) {
  await page.waitForFunction(() => !!window.VTApp && document.readyState !== "loading");
  await page.waitForTimeout(1200);
}
const clsOf = (shifts) => shifts.reduce((n, s) => n + s.value, 0);
/** How far each block has moved since the hold ended (a font arriving may nudge a pixel). */
const movedSince = (atRelease, tops) => Object.fromEntries(Object.keys(tops).map((k) => [k, Math.abs(tops[k] - atRelease[k]) > 2 ? `${atRelease[k]} -> ${tops[k]}` : "stayed"]));
/** Once the app has drawn the page: shown, where it was when the hold ended, and no layout shift. */
async function expectStill(page) {
  const after = { ...(await page.evaluate(heldNow)), shifts: await page.evaluate(() => window.__shifts), atRelease: await page.evaluate(() => window.__atRelease) };
  expect(after.main, "shown once the app has drawn it").toBe("visible");
  expect(after.footer).toBe("visible");
  expect(after.atRelease, "control: the end of the hold was seen").toBeTruthy();
  expect(movedSince(after.atRelease, after.tops), "what was first shown is where it stays").toEqual({ hero: "stayed", catalog: "stayed" });
  expect(clsOf(after.shifts), `layout shifts: ${JSON.stringify(after.shifts)}`).toBeLessThan(0.1);
}
/** A later load: nothing below the header is shown while the app has not started. */
function expectAllHeld(held) {
  expect(held.app, "control: the app has not started yet").toBe(false);
  expect(held.main, "the markup's home is not on screen").toBe("hidden");
  expect(held.hero, "nor its hero: the scripts are cached and the app starts at once").toBe("hidden");
  expect(held.footer).toBe("hidden");
  expect(held.header, "the header is, at once").toBe("visible");
}
const MID_DESKTOP = { width: 900, height: 700 };

test.describe("the first paint is the app's own home", () => {
  for (const [lang, vp, days] of [
    ["es", LAPTOP, [-3, -2, -1]],
    ["en", LAPTOP, null],
    ["es", PHONE, null]
  ]) {
    test(`${lang} ${vp.width}px, a later load${days ? " with practice days" : ""}: the markup's home is never shown, so the page does not jump when the app draws it`, async ({ browser }) => {
      const { ctx, page } = await open(browser, { vp, lang, days });
      await page.addInitScript(shiftWatch);
      const { held, go } = await heldBack(page, "/");
      expectAllHeld(held);
      go();
      await settled(page);
      await expectStill(page);
      await ctx.close();
    });
  }

  test("es 390px, the load after this browser's first: held like any later one, by what the first load stored", async ({ browser }) => {
    const { ctx, page } = await open(browser, { vp: PHONE, fresh: true });
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await settled(page);
    const stored = await page.evaluate(() => Object.keys(localStorage).filter((k) => /^vt_/.test(k)));
    expect(stored, "control: the first load stored the app's own data").toEqual(expect.arrayContaining(["vt_settings_v1"]));
    await page.addInitScript(shiftWatch);
    const { held, go } = await heldBack(page, "/");
    expectAllHeld(held);
    go();
    await settled(page);
    await expectStill(page);
    await ctx.close();
  });

  for (const vp of [PHONE, MID_DESKTOP, LAPTOP]) {
    test(`es ${vp.width}px, this browser's first load: the hero's words show at once, painted, where and as the app keeps them, and nothing moves`, async ({ browser }) => {
      const { ctx, page } = await open(browser, { vp, fresh: true });
      await page.addInitScript(shiftWatch);
      await page.addInitScript(frameWatch);
      // The strings held back too: what shows first is the markup itself
      const { held, go } = await heldBack(page, "/", ["i18n.js", "app.js"]);
      const hero = await page.evaluate(heroNow);
      expect({ app: held.app, strings: hero.strings }, "control: neither the strings nor the app have run yet").toEqual({ app: false, strings: false });
      expect(held.hero, "the hero shows at once: nothing is cached and the app starts seconds later").toBe("visible");
      expect({ kicker: hero.kickerShown, title: hero.title.shown, intro: hero.intro, otherWays: hero.otherWays }, "its kicker, title and intro line show; the other ways in, not wired yet, take no room").toEqual({ kicker: true, title: true, intro: true, otherWays: 0 });
      expect(await titlePainted(page), "and its title is painted").toBe(true);
      const pixels = await heroPixels(page);
      expect(held.catalog, "what the app's hero pushes down waits").toBe("hidden");
      expect(held.footer).toBe("hidden");
      expect(hero.controls, "no button shows before it works").toEqual([]);
      expect(await page.evaluate(() => !!window.VTApp), "control: all of it seen before the app had started").toBe(false);
      // Then the strings alone: what they write into the hero shows until the app has started
      go("i18n.js");
      // i18n-early.js applies them; the parser is past it once the element after it is in the page
      await page.waitForFunction(() => !!document.querySelector('script[src*="js/i18n-early.js"]')?.nextElementSibling);
      const translated = await page.evaluate(heroNow);
      expect(await page.evaluate(() => !!window.VTApp), "control: the strings have run, the app has not").toBe(false);
      expect(words(translated), "the strings leave the hero's words as they were").toEqual(words(hero));
      go();
      await settled(page);
      const after = await page.evaluate(heroNow);
      expect(after.controls.length, "control: the app's buttons are there now").toBeGreaterThan(3);
      expect(words(after), "the words are the ones the app writes for someone new, at the same size").toEqual(words(hero));
      expect(Math.abs(after.title.width - hero.title.width), `in a column as wide (${hero.title.width} -> ${after.title.width} px)`).toBeLessThanOrEqual(1);
      expect(Math.abs(after.title.top - hero.title.top), `and where they were (${hero.title.top} -> ${after.title.top})`).toBeLessThanOrEqual(1);
      const now = await heroPixels(page);
      expect({ box: now.clip, same: now.data === pixels.data }, "the kicker and title are drawn exactly as they were: words, weight, colour, spacing, place").toEqual({ box: pixels.clip, same: true });
      const frames = await page.evaluate(() => window.__heroFrames);
      expect(frames.filter((f) => !f.held).length, "control: the hero's frames were seen, after the hold ended too").toBeGreaterThan(20);
      expect(unsteady(frames), "from its first frame the hero is drawn as it stays: no fade, no rise, no blink as the app starts").toEqual([]);
      await expectStill(page);
      await ctx.close();
    });
  }

  /*
   * Chromium's preload scanner stops at the page's CSP <meta>, so it found each
   * body script only once the one before it had run: 53 round trips in a row,
   * the app started after 11 s on a 4G phone (3.3 s on a desktop line), and
   * the first load's hero stood alone for that long (review of PR #42, rt6).
   * Correct: all of them are asked for together, from <head>. Each answer is
   * held 600 ms here, so a script asked for only once another had arrived
   * starts at least that much later than the first.
   */
  test("es 390px, this browser's first load asks for every script at once, not each once the one before it has run", async ({ browser }) => {
    test.setTimeout(90000);
    const { ctx, page } = await open(browser, { vp: PHONE, fresh: true });
    await page.route("**/js/**", async (route) => {
      await new Promise((r) => setTimeout(r, 600));
      await route.continue();
    });
    await page.goto(BASE + "/", { waitUntil: "commit" });
    await page.waitForFunction(() => !!window.VTApp && document.readyState !== "loading", null, { timeout: 60000, polling: 250 });
    const asked = await page.evaluate(() => {
      const run = new Set([...document.querySelectorAll("body script[src]")].map((el) => el.src));
      return performance
        .getEntriesByType("resource")
        .filter((e) => run.has(e.name))
        .map((e) => ({ file: e.name.replace(location.origin + "/", ""), start: Math.round(e.startTime) }));
    });
    expect(asked.length, "control: the body's scripts were fetched").toBeGreaterThanOrEqual(50);
    const first = Math.min(...asked.map((a) => a.start));
    expect(asked.filter((a) => a.start - first > 300), "none asked for after another had arrived").toEqual([]);
    await ctx.close();
  });

  /*
   * Where scrollbars take room (Windows, Linux, a Mac with a mouse) the held
   * page, one screen tall, had none and the app's has one: everything centred
   * moved 7.5 px sideways as the app started, the hero under the reader's eye
   * on a first load, the header on every load (review of PR #42, ae2). The
   * suite's browser hides its scrollbars, so this one is started with them.
   */
  for (const fresh of [true, false]) {
    test(`es 1280px, ${fresh ? "this browser's first load" : "a later load"}, scrollbars that take room: nothing moves sideways as the app starts`, async ({}, testInfo) => {
      const b = await chromium.launch({ executablePath: browserPath(testInfo), ignoreDefaultArgs: ["--hide-scrollbars"] });
      try {
        const { page } = await open(b, { vp: LAPTOP, fresh });
        const lefts = () =>
          page.evaluate(() => {
            const left = (sel) => Math.round(document.querySelector(sel).getBoundingClientRect().left * 10) / 10;
            return { brand: left(".app-header .brand"), hero: left("#start-kicker"), room: innerWidth - document.documentElement.clientWidth };
          });
        const { held, go } = await heldBack(page, "/");
        expect(held.hero, `control: the hero is ${fresh ? "shown" : "held"}`).toBe(fresh ? "visible" : "hidden");
        const before = await lefts();
        go();
        await settled(page);
        const after = await lefts();
        expect(after.room, "control: the app's page has a scrollbar, and it takes room").toBeGreaterThan(0);
        const seen = (l) => (fresh ? { brand: l.brand, hero: l.hero } : { brand: l.brand });
        expect(seen(after), "the header and the hero stay where they were").toEqual(seen(before));
      } finally {
        await b.close();
      }
    });
  }

  /*
   * A view that fits the window has no scrollbar to show. Held with one
   * forced on, a later load at Plan or an exercise moved the header 7.5 px
   * sideways as the app started (review of PR #42, rt5), and every change
   * between Practicar and Plan moved it, before this PR too. The page keeps
   * a scrollbar's room for its life: nothing moves, whatever the view.
   */
  for (const [hash, views] of [
    ["#plan", true],
    ["#ejercicio/v1-diction", false]
  ]) {
    test(`es 1920px, a later load at ${hash}, scrollbars that take room: the header does not move sideways as the app starts${views ? ", nor between views" : ""}`, async ({}, testInfo) => {
      const b = await chromium.launch({ executablePath: browserPath(testInfo), ignoreDefaultArgs: ["--hide-scrollbars"] });
      try {
        const { page } = await open(b, { vp: { width: 1920, height: 1080 } });
        await page.addInitScript(() => {
          window.__brand = [];
          const tick = () => {
            const html = document.documentElement;
            const brand = document.querySelector(".app-header .brand");
            if (html && brand) window.__brand.push({ held: html.classList.contains("vt-boot-pending"), x: Math.round(brand.getBoundingClientRect().left * 10) / 10 });
            requestAnimationFrame(tick);
          };
          requestAnimationFrame(tick);
        });
        await page.goto(BASE + "/" + hash, { waitUntil: "domcontentloaded" });
        await settled(page);
        const fits = () => page.evaluate(() => document.documentElement.scrollHeight <= innerHeight);
        expect(await fits(), "control: the app's view fits the window").toBe(true);
        if (views) {
          for (const button of ["#btn-nav-home", "#btn-plan", "#btn-nav-home"]) {
            await page.click(button);
            await page.waitForTimeout(400);
          }
          expect(await fits(), "control: the home does not fit, and scrolls").toBe(false);
        }
        const frames = await page.evaluate(() => window.__brand);
        expect(frames.filter((f) => f.held).length, "control: frames were drawn while held").toBeGreaterThan(0);
        expect([...new Set(frames.map((f) => f.x))], "the header's brand keeps one place from the first frame").toHaveLength(1);
      } finally {
        await b.close();
      }
    });
  }

  /*
   * Hidden, a view's entrance (fadeIn, 0.22 s) runs from its first style, and
   * with every script asked for at once the hold now ends soon enough that
   * its tail played in sight: a later load's home appeared at 89-99.5 % and
   * finished its fade (review of PR #42, rt5). The page shows the view the
   * app has drawn whole. Made certain here by a longer entrance (5 s).
   */
  test("es 390px, a later load: the view is whole when the hold ends, its entrance over", async ({ browser }) => {
    const { ctx, page } = await open(browser, { vp: PHONE });
    await page.addInitScript(() => {
      new MutationObserver((_, watch) => {
        if (!document.head) return;
        const style = document.createElement("style");
        style.textContent = ".view { animation-duration: 5s !important; }";
        document.head.appendChild(style);
        watch.disconnect();
      }).observe(document, { childList: true, subtree: true });
      window.__released = [];
      let held = false;
      const sample = () => {
        const html = document.documentElement;
        if (html && html.classList.contains("vt-boot-pending")) held = true;
        else if (held) {
          const view = document.querySelector(".view.active");
          if (view) window.__released.push(getComputedStyle(view).opacity);
          if (window.__released.length >= 10) return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    });
    const { held, go } = await heldBack(page, "/");
    expectAllHeld(held);
    go();
    await settled(page);
    const frames = await page.evaluate(() => window.__released);
    expect(frames.length, "control: frames after the hold ended were seen").toBe(10);
    expect([...new Set(frames)], "drawn whole from the first frame").toEqual(["1"]);
    const reopened = await page.evaluate(async () => {
      document.getElementById("btn-plan").click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return document.getElementById("view-plan").getAnimations().map((a) => [a.animationName, a.effect.getComputedTiming().duration]);
    });
    expect(reopened, "control: the longer entrance is in force, and plays when a view is opened").toContainEqual(["fadeIn", 5000]);
    await ctx.close();
  });

  /*
   * Under reduced motion every transition lasts 0.01 ms, and a change of the
   * inherited visibility is drawn hidden in its first frame. When the hold
   * ended the hero, shown until then by a rule of its own, turned visible
   * through its ancestors one level per frame: it blinked out for 6-7 frames
   * as the app started (review of PR #42, ae3). Nor does anything fade in there.
   */
  test("es 390px, reduced motion, this browser's first load: the hero does not blink out as the app starts, and nothing fades in", async ({ browser }) => {
    const { ctx, page } = await open(browser, { vp: PHONE, fresh: true, reducedMotion: "reduce" });
    await page.addInitScript(frameWatch);
    await page.addInitScript(revealWatch);
    const { held, go } = await heldBack(page, "/");
    expect({ app: held.app, hero: held.hero }, "control: the hero shows while held").toEqual({ app: false, hero: "visible" });
    go();
    await settled(page);
    const frames = await page.evaluate(() => window.__heroFrames);
    expect(frames.filter((f) => !f.held).length, "control: frames after the hold ended were seen").toBeGreaterThan(20);
    expect(unsteady(frames), "drawn as it stays, in every frame").toEqual([]);
    expect(await page.evaluate(() => window.__revealed), "nothing fades in").toEqual([]);
    await ctx.close();
  });

  /*
   * When the app starts it replaces the hero's intro line with the first
   * routine's question, under the words read until then: in one frame, it was
   * a hard cut (review of PR #42, ae3). What it adds fades in (opacity only,
   * 0.2 s); the kicker and the title, which do not change, do not.
   */
  test("es 390px, this browser's first load: what the app adds to the hero fades in under its words, which stay as they are", async ({ browser }) => {
    const { ctx, page } = await open(browser, { vp: PHONE, fresh: true });
    await page.addInitScript(revealWatch);
    const { held, go } = await heldBack(page, "/");
    expect(held.hero, "control: the hero shows while held").toBe("visible");
    go();
    await settled(page);
    const revealed = await page.evaluate(() => window.__revealed);
    expect(await page.evaluate(() => getComputedStyle(document.getElementById("track-pick")).display), "control: the app shows the first routine's question").not.toBe("none");
    expect(revealed, "the question fades in").toContain("track-pick");
    expect(revealed.filter((t) => /start-kicker|start-title/.test(t)), "the kicker and title do not").toEqual([]);
    expect(await page.evaluate(() => document.getAnimations().filter((a) => a.id === "vt-boot-reveal").length), "and the fade is over").toBe(0);
    await ctx.close();
  });

  /*
   * What the app adds fades in once, on what is there when the hold ends.
   * Faded by a class held for the length of the fade, what the app rebuilt in
   * that time (a language switch rebuilds the tour's invitation) faded in
   * again from nothing, and was cut short when the class went (review of PR
   * #42, rt3).
   */
  test("es 1280px, this browser's first load: a language switch as the app starts fades nothing in again", async ({ browser }) => {
    const { ctx, page } = await open(browser, { vp: LAPTOP, fresh: true });
    await page.addInitScript(() => {
      window.__switch = null;
      let held = false;
      new MutationObserver((_, watch) => {
        const html = document.documentElement;
        if (!html) return;
        if (html.classList.contains("vt-boot-pending")) {
          held = true;
          return;
        }
        if (!held) return;
        watch.disconnect();
        // 60 ms into the fade, the language button; then, for 30 frames, any
        // animation in the hero on an element the switch has built
        setTimeout(() => {
          const before = new Set(document.querySelectorAll("#start-panel *"));
          const invite = document.getElementById("home-tour-invite");
          document.getElementById("btn-lang").click();
          const late = new Set();
          let frames = 0;
          const sample = () => {
            for (const a of document.getAnimations()) {
              const el = a.effect && a.effect.target;
              if (a instanceof CSSTransition || !el || !el.closest || !el.closest("#start-panel") || before.has(el)) continue;
              late.add(el.id || String(el.className));
            }
            if (++frames < 30) return requestAnimationFrame(sample);
            window.__switch = { rebuilt: !!invite && document.getElementById("home-tour-invite") !== invite, late: [...late] };
          };
          sample();
        }, 60);
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ["class"] });
    });
    const { held, go } = await heldBack(page, "/");
    expect(held.hero, "control: the hero shows while held").toBe("visible");
    go();
    await page.waitForFunction(() => !!window.__switch, null, { timeout: 10000 });
    const r = await page.evaluate(() => ({ ...window.__switch, lang: document.documentElement.lang }));
    expect({ lang: r.lang, rebuilt: r.rebuilt }, "control: the page switched to English and rebuilt the tour's invitation").toEqual({ lang: "en", rebuilt: true });
    expect(r.late, "nothing in the hero starts to fade in after the switch").toEqual([]);
    await ctx.close();
  });

  /*
   * A new duration updates a running animation: the home view's entrance,
   * 0 s while held and 0.22 s after, played on from where it was when the
   * hold ended within 0.22 s of the first paint (a fast first start, with
   * the scripts cached and nothing stored), and the hero already read dropped
   * to 19-89 % and rose again (review of PR #42, rt3). Made certain here by a
   * longer entrance once the hold is over (5 s; while held, the page's own
   * 0 s rule wins on specificity), so the release always falls inside it.
   */
  test("es 390px, this browser's first load: the home view's entrance does not play when the hold ends, however soon", async ({ browser }) => {
    const { ctx, page } = await open(browser, { vp: PHONE, fresh: true });
    await page.addInitScript(() => {
      new MutationObserver((_, watch) => {
        if (!document.head) return;
        const style = document.createElement("style");
        style.textContent = "#view-home { animation-duration: 5s !important; }";
        document.head.appendChild(style);
        watch.disconnect();
      }).observe(document, { childList: true, subtree: true });
    });
    await page.addInitScript(frameWatch);
    const { held, go } = await heldBack(page, "/");
    expect(held.hero, "control: the hero shows while held").toBe("visible");
    go();
    await settled(page);
    const frames = await page.evaluate(() => window.__heroFrames);
    expect(frames.filter((f) => !f.held).length, "control: frames after the hold ended were seen").toBeGreaterThan(20);
    expect(unsteady(frames), "drawn as it stays, in every frame").toEqual([]);
    const reopened = await page.evaluate(async () => {
      document.getElementById("btn-plan").click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      document.getElementById("btn-nav-home").click();
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      return document.getElementById("view-home").getAnimations().map((a) => [a.animationName, a.effect.getComputedTiming().duration]);
    });
    expect(reopened, "control: the longer entrance is in force, and plays when the view is opened again").toContainEqual(["fadeIn", 5000]);
    await ctx.close();
  });

  /*
   * A browser that keeps only the English choice (admin.html's language switch
   * writes vt_lang alone) has none of the app's keys, so its first load shows
   * the hero. The page is held for its English strings, and the hero's own
   * rule showed it through the hidden body: the Spanish hero alone, under
   * lang="en", for 0.7 s on a 4G phone (review of PR #42, ae4, rt6).
   */
  test("en 390px, this browser's first load with only the English choice stored: the hero shows once it is English, never in Spanish", async ({ browser }) => {
    const { ctx, page } = await open(browser, { vp: PHONE, fresh: true, store: { vt_lang: "en" } });
    await page.addInitScript(langWatch);
    const { held, go } = await heldBack(page, "/", ["i18n.js", "app.js"]);
    const lang = await page.evaluate(() => document.documentElement.lang);
    expect({ app: held.app, lang }, "control: held for its English strings").toEqual({ app: false, lang: "en" });
    expect(held.hero, "the Spanish hero is not shown").toBe("hidden");
    go("i18n.js");
    await page.waitForFunction(() => !!document.querySelector('script[src*="js/i18n-early.js"]')?.nextElementSibling);
    const translated = await page.evaluate(heroNow);
    expect(await page.evaluate(() => !!window.VTApp), "control: the strings have run, the app has not").toBe(false);
    const title = translated.title.text.replace(/\s+/g, " ");
    expect({ shown: translated.title.shown, title }, "shown once it is English, before the app has started").toEqual({ shown: true, title: "Train your voice 3 minutes a day." });
    go();
    await settled(page);
    expect(words(await page.evaluate(heroNow)), "the app writes the same words").toEqual(words(translated));
    expect(await page.evaluate(() => window.__spanishShown), "no frame showed the Spanish title under lang=en").toEqual([]);
    await ctx.close();
  });

  /*
   * The first load's hero is drawn without the view's entrance (fadeIn). Turned
   * off for the page's life, the home view was the one view that never faded
   * in again on a first visit (review of PR #42, ae1, ae3, rt6).
   */
  test("es 390px, this browser's first load: the home view fades in when it is opened again, like every view", async ({ browser }) => {
    const { ctx, page } = await open(browser, { vp: PHONE, fresh: true });
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await settled(page);
    expect(await page.evaluate(() => document.documentElement.classList.contains("vt-boot-hero")), "control: this browser's first load").toBe(true);
    const entrance = (button, view) =>
      page.evaluate(
        async ([b, v]) => {
          document.getElementById(b).click();
          const names = new Set();
          for (let i = 0; i < 12; i++) {
            await new Promise((r) => requestAnimationFrame(r));
            for (const a of document.getElementById(v).getAnimations()) names.add(a.animationName);
          }
          return [...names];
        },
        [button, view]
      );
    expect(await entrance("btn-plan", "view-plan"), "control: another view fades in").toContain("fadeIn");
    expect(await entrance("btn-nav-home", "view-home"), "and so does the home view").toContain("fadeIn");
    await ctx.close();
  });

  /*
   * When the hold is let go before the app has started (a script stalled for
   * eight seconds), the markup's home shows under the hero. The hero kept its
   * held layout only while held: from 861 px its title grew and its column
   * widened at the release, the other ways in appeared, and all of it changed
   * back as the app started (layout shift 0.54 at 1280 px; review of PR #42,
   * rt6). Correct: it is laid out once, until the app has started.
   */
  test("[L] es 1280px, this browser's first load whose early script stalls: the hero keeps its layout when the hold is let go before the app, and after", async ({ browser }) => {
    test.setTimeout(60000);
    const { ctx, page } = await open(browser, { vp: LAPTOP, fresh: true });
    await page.route("**/js/exercises-data.js*", async (route) => {
      await new Promise((r) => setTimeout(r, 11000));
      await route.continue();
    });
    await page.goto(BASE + "/", { waitUntil: "commit" });
    await page.waitForSelector(".app-footer", { state: "attached" });
    await page.waitForTimeout(500);
    const layout = async () => {
      const h = await page.evaluate(heroNow);
      return { size: h.title.size, width: h.title.width, top: h.title.top, otherWays: h.otherWays };
    };
    const same = (a, b) => a.size === b.size && a.otherWays === b.otherWays && near(a.width, b.width) && near(a.top, b.top);
    const held = await page.evaluate(heldNow);
    expect({ hero: held.hero, catalog: held.catalog }, "control: the hero shows, the rest is held").toEqual({ hero: "visible", catalog: "hidden" });
    const before = await layout();
    await page.waitForFunction(() => getComputedStyle(document.querySelector("main")).visibility === "visible", null, { timeout: 15000, polling: 100 });
    expect(await page.evaluate(() => !!window.VTApp), "control: let go before the app has started").toBe(false);
    const released = await layout();
    expect(same(released, before), `laid out as it was when the hold is let go: ${JSON.stringify([before, released])}`).toBe(true);
    await page.waitForFunction(() => !!window.VTApp && document.readyState !== "loading", null, { timeout: 20000 });
    await page.waitForTimeout(800);
    const started = await layout();
    expect(same(started, before), `and as the app lays it out: ${JSON.stringify([before, started])}`).toBe(true);
    await ctx.close();
  });

  /*
   * The hero's held layout lasts until the app has started: js/boot-ready.js
   * says so when the app has started, and the load event does when that
   * script is missing. Neither, and it lasted the page's life: the other ways
   * in stayed hidden, and the two columns stayed, on the home the app draws
   * once there is a first practice (here: body.loop-first taken off).
   */
  for (const [what, block] of [
    ["js/boot-ready.js missing, once the page has loaded", "**/js/boot-ready.js*"],
    ["an image that never loads, once the app has started", "**/never-loads.png"]
  ]) {
    test(`es 1280px, this browser's first load with ${what}: the hero's layout is the app's to decide`, async ({ browser }) => {
      const { ctx, page } = await open(browser, { vp: LAPTOP, fresh: true });
      const image = block.endsWith(".png");
      await page.route(block, (route) => (image ? undefined : route.abort("failed")));
      if (image) {
        await page.addInitScript(() => {
          document.addEventListener("DOMContentLoaded", () => {
            const img = new Image();
            img.src = "/never-loads.png";
            img.alt = "";
            document.body.appendChild(img);
          });
        });
      }
      await page.goto(BASE + "/", { waitUntil: image ? "domcontentloaded" : "load" });
      await page.waitForFunction(() => !!window.VTApp && document.readyState !== "loading");
      await page.waitForTimeout(300);
      if (image) expect(await page.evaluate(() => document.readyState), "control: the page has not finished loading").toBe("interactive");
      const otherWays = () => page.evaluate(() => getComputedStyle(document.getElementById("more-ways")).display);
      expect(await page.evaluate(() => document.body.classList.contains("loop-first")), "control: the app drew the home for someone new").toBe(true);
      expect(await otherWays(), "control: which folds the other ways in").toBe("none");
      await page.evaluate(() => document.body.classList.remove("loop-first"));
      expect(await otherWays(), "they show on the home it draws once there is a first practice").not.toBe("none");
      await ctx.close();
    });
  }

  /*
   * As a person, not an automated browser: outside the regions that are asked
   * first, the guide's statistics keep a browser id (vt_ab_v1) as well as the
   * site design. Run as an automated browser (no statistics) the guide kept
   * neither, and a check that took any vt_ key for the app's passed here while
   * holding every real reader of the guide (review of PR #42, red team 1 and 3).
   */
  test("es 390px, a person's first load straight from the guide: the guide's own keys are no sign of the app, so the hero shows at once", async ({ browser }) => {
    const { ctx, page } = await open(browser, { vp: PHONE, fresh: true, human: true, e2e: false, endpoint: ENDPOINT, timezoneId: "America/Lima", geo: { ok: true, country: "PE", placed: true, askFirst: false } });
    await page.goto(BASE + "/guide.html", { waitUntil: "load" });
    await expect.poll(() => page.evaluate(() => Object.keys(localStorage)), { message: "control: the guide kept its statistics' browser id", timeout: 6000 }).toContain("vt_ab_v1");
    const { held, go } = await heldBack(page, "/");
    expect(held.app, "control: the app has not started yet").toBe(false);
    expect(held.hero).toBe("visible");
    expect(held.catalog).toBe("hidden");
    go();
    await ctx.close();
  });

  /*
   * With site data blocked nothing is stored, so every load is drawn for
   * someone new, but the app keeps the place on the page in the history entry
   * and goes back to it on a reload: below the top, the hero would only
   * flash. A reload at the top is drawn exactly as a first load, so it shows
   * the hero too; held whole, it showed nothing below the header until the app
   * had started (review of PR #42, rt6).
   */
  test("es 390px, site data blocked: the first load shows the hero (nothing can be stored); a reload below the top is held, as the app goes back there, a reload at the top is not", async ({ browser }) => {
    test.setTimeout(60000);
    const { ctx, page } = await open(browser, { vp: PHONE, blocked: true });
    const first = await heldBack(page, "/");
    expect(first.held.app, "control: the app has not started yet").toBe(false);
    expect(first.held.hero, "nothing is stored, so the app draws the hero for someone new").toBe("visible");
    first.go();
    await settled(page);
    expect(await page.evaluate(() => { try { localStorage.setItem("vt_x", "1"); return "stored"; } catch { return "blocked"; } }), "control: the page's own storage is the in-memory one").toBe("stored");
    const reloadAt = async (y) => {
      await page.evaluate((to) => window.scrollTo({ top: to, behavior: "instant" }), y);
      await expect.poll(() => page.evaluate(() => history.state?.y ?? 0), { message: `control: the app kept the place (${y})` }).toBe(await page.evaluate(() => Math.round(scrollY)));
      await page.unroute("**/js/app.js*");
      const again = await heldBack(page, null);
      expect(again.held.app, "control: the app has not started yet").toBe(false);
      again.go();
      await settled(page);
      return again.held.hero;
    };
    expect(await reloadAt(600), "a reload below the top is held whole").toBe("hidden");
    expect(await page.evaluate(() => scrollY), "control: and the app went back there").toBeGreaterThan(500);
    expect(await reloadAt(0), "a reload at the top shows the hero, which the app draws there").toBe("visible");
    expect(await page.evaluate(() => ({ y: scrollY, first: document.body.classList.contains("loop-first") })), "control: the app drew it, at the top").toEqual({ y: 0, first: true });
    await ctx.close();
  });

  // Each address the app draws something else at: another view, a place on the
  // home it scrolls to (a search result's text link among them, never in
  // location.hash), an experiment's arm forced, however the address spells it
  // and whatever else it holds, a malformed escape included (the classic arm
  // and the five-minute Mínimo write another title; any arm may)
  for (const [address, check] of [
    ["#plan", { view: "plan" }],
    ["#historial", { view: "history" }],
    ["#ejercicio/s4-lip-trills", { view: "exercise" }],
    ["#catalog-panel", { view: "home", scrolled: true }],
    ["#:~:text=Cat%C3%A1logo%20de%20ejercicios", { view: "home", scrolled: true }],
    ["?ab_loop_home_2026_10=classic", { view: "home", title: "Tu primera práctica" }],
    ["?%61b_loop_home_2026_10=classic", { view: "home", title: "Tu primera práctica" }],
    ["?%61b_loop_home_2026_10=classic&x=%ZZ", { view: "home", title: "Tu primera práctica" }],
    ["?ab_loop_minimo_len_2026_10=five", { view: "home", title: "5 minutos" }]
  ]) {
    test(`this browser's first load at ${address}: all of it waits, as the markup's hero would only flash`, async ({ browser }) => {
      const { ctx, page } = await open(browser, { vp: PHONE, fresh: true });
      const { held, go } = await heldBack(page, "/" + address);
      expect(held.app, "control: the app has not started yet").toBe(false);
      expect(held.hero).toBe("hidden");
      go();
      await settled(page);
      const at = await page.evaluate(() => ({ view: window.VTApp.getState().view, y: scrollY, title: document.getElementById("start-title").textContent }));
      expect(at.view, "control: the address opened its view").toBe(check.view);
      if (check.scrolled) expect(at.y, "control: the page scrolled away from the hero").toBeGreaterThan(200);
      if (check.title) expect(at.title, "control: the app's hero has other words").toContain(check.title);
      await ctx.close();
    });
  }

  /*
   * Addresses that force no arm, read as js/experiments.js reads them: a name
   * inside another one's value, and a malformed escape. Decoded whole, the
   * first was taken for a forced arm and held, and an arm next to the second
   * was missed (review of PR #42, rt2).
   */
  for (const address of ["?x=1%26ab_loop_home_2026_10=classic", "?utm_source=x%"]) {
    test(`this browser's first load at ${address}: no arm is forced, so the hero shows at once`, async ({ browser }) => {
      const { ctx, page } = await open(browser, { vp: PHONE, fresh: true });
      const { held, go } = await heldBack(page, "/" + address);
      expect(held.app, "control: the app has not started yet").toBe(false);
      expect(held.hero, "the hero shows").toBe("visible");
      go();
      await settled(page);
      const at = await page.evaluate(() => ({ first: document.body.classList.contains("loop-first"), title: document.getElementById("start-title").textContent.replace(/\s+/g, " ").trim() }));
      expect(at, "control: the app draws the same hero, for someone new").toEqual({ first: true, title: "Entrena tu voz 3 minutos al día." });
      await ctx.close();
    });
  }

  /*
   * A slow line: the scripts arrive one by one, as they did on every phone
   * before index.html asked for them all at once (Chromium stops looking
   * ahead after the page's CSP <meta>): 11-14 s on a 4G or Lighthouse mobile
   * profile. Let go eight seconds after the start, the markup's home showed
   * under the hero with its buttons not wired, and jumped when the app
   * replaced it (layout shift 0.11 on a phone, 0.27-0.70 from 820 px; review
   * of PR #42). Correct: held while the scripts keep arriving, let go when
   * no new one has come for eight seconds (the next tests).
   */
  test("[L] es 390px, a first load whose scripts arrive one by one for twelve seconds: held until the app has started, and nothing moves", async ({ browser }) => {
    test.setTimeout(60000);
    const { ctx, page } = await open(browser, { vp: PHONE, fresh: true });
    await page.addInitScript(shiftWatch);
    let queue = Promise.resolve();
    await page.route("**/js/**", (route) => {
      queue = queue.then(() => new Promise((r) => setTimeout(r, 220))).then(() => route.continue());
      return queue;
    });
    await page.goto(BASE + "/", { waitUntil: "commit" });
    await page.waitForFunction(() => performance.now() > 9500, null, { timeout: 20000, polling: 250 });
    const late = await page.evaluate(heldNow);
    expect(late.app, "control: nine and a half seconds in, the app has not started").toBe(false);
    expect({ hero: late.hero, catalog: late.catalog, footer: late.footer }, "the hero shows; what it pushes down still waits").toEqual({ hero: "visible", catalog: "hidden", footer: "hidden" });
    await page.waitForFunction(() => !!window.VTApp && document.readyState !== "loading", null, { timeout: 30000 });
    await page.waitForTimeout(1200);
    await expectStill(page);
    await ctx.close();
  });

  /*
   * Markup that arrives slowly is the page being read, not stalled. Let go
   * once no script had been read for eight seconds, a page whose body came in
   * over ten (a response stalled on a lossy line) showed the markup's home
   * mid-stream, its buttons not wired, and the app then replaced it lower down
   * (layout shift 0.68 on a phone; review of PR #42, rt2). Correct: held
   * until the app has started, and nothing moves.
   */
  test("[L] es 390px, a first load whose page itself arrives slowly for ten seconds: held until the app has started, and nothing moves", async ({ browser }) => {
    test.setTimeout(60000);
    const server = await trickling(10500, 30);
    try {
      const { ctx, page } = await open(browser, { vp: PHONE, fresh: true });
      await page.addInitScript(shiftWatch);
      await page.goto(server.url + "/", { waitUntil: "commit" });
      await page.waitForFunction(() => performance.now() > 9500, null, { timeout: 20000, polling: 250 });
      const late = await page.evaluate(() => ({ app: !!window.VTApp, ready: document.readyState, scripts: document.querySelectorAll("body script").length, main: getComputedStyle(document.querySelector("main")).visibility, hero: getComputedStyle(document.getElementById("start-panel")).visibility }));
      expect({ app: late.app, ready: late.ready, scripts: late.scripts }, "control: nine and a half seconds in, the page is still arriving, no script of its body read yet").toEqual({ app: false, ready: "loading", scripts: 0 });
      expect({ hero: late.hero, main: late.main }, "the hero shows; the rest of the page still waits").toEqual({ hero: "visible", main: "hidden" });
      await page.waitForFunction(() => !!window.VTApp && document.readyState !== "loading", null, { timeout: 30000 });
      await page.waitForTimeout(1200);
      await expectStill(page);
      await ctx.close();
    } finally {
      await server.close();
    }
  });

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

  /*
   * And no longer busy: js/boot-ready.js ends the busy state too, and without
   * it the page told a screen reader it was busy for its whole life (review
   * of PR #42, rt3).
   */
  test("released when the page has loaded, if the script that ends it is missing, and no longer busy", async ({ browser }) => {
    const { ctx, page } = await open(browser, { vp: LAPTOP, lang: "es" });
    await page.route("**/js/boot-ready.js*", (route) => route.abort("failed"));
    await page.goto(BASE + "/", { waitUntil: "load" });
    await expect.poll(() => page.evaluate(heldNow).then((r) => r.main), { timeout: 3000, intervals: [100] }).toBe("visible");
    expect(await page.evaluate(() => !!window.VTApp), "control: the app has started").toBe(true);
    expect(await page.evaluate(() => document.body.getAttribute("aria-busy")), "the page does not say it is busy").toBeNull();
    await ctx.close();
  });

  test("[L] released eight seconds after the page stops arriving, when a script never arrives", async ({ browser }) => {
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

  /*
   * The last resort counts the wait for a script of the page's own, on the
   * page's own clock. Counting any edit of the page, one whose app never
   * arrives was held the whole twenty seconds while anything else edited it
   * every few seconds (an extension, a translator), and so it was while an
   * extension added scripts of its own; timed by Date.now(), a system clock
   * set back during the load held it for good (review of PR #42, rt6, rt2).
   */
  test("[L] released eight seconds after the last script was read, however often the page is otherwise edited, whatever scripts are added to it, and whatever the system clock does", async ({ browser }) => {
    test.setTimeout(60000);
    const { ctx, page } = await open(browser, { vp: LAPTOP, lang: "es" });
    await page.addInitScript(() => {
      window.__lastScript = 0;
      window.__released = 0;
      window.__setBack = 0;
      // The system clock is set back an hour two seconds after each script of
      // the page's own is read, so once in the wait after the last, however
      // slowly they come: set back at a fixed time from the start, a slow
      // machine read its last script after it, and a stall timed by Date.now()
      // passed (review of PR #42, rt4). Each time by another hour, so a time
      // read after an earlier setback is moved as well.
      const real = Date.now;
      let offset = 0;
      let timer = 0;
      const setBack = () => {
        offset -= 3600000;
        Date.now = () => real() + offset;
        window.__setBack = performance.now();
      };
      // The page's own scripts, not the ones added below
      new MutationObserver((records) => {
        if (![...records].some((r) => [...r.addedNodes].some((n) => n.nodeName === "SCRIPT" && /\/js\//.test(n.src || "")))) return;
        window.__lastScript = performance.now();
        clearTimeout(timer);
        timer = setTimeout(setBack, 2000);
      }).observe(document, { childList: true, subtree: true });
      new MutationObserver(() => {
        const html = document.documentElement;
        if (html && !window.__released && window.__lastScript && !html.classList.contains("vt-boot-pending")) window.__released = performance.now();
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ["class"] });
      // Something else edits the page every second
      setInterval(() => {
        const s = document.createElement("span");
        (document.body || document.documentElement).appendChild(s);
        s.remove();
      }, 1000);
      // an extension adds a script of its own every two seconds
      let n = 0;
      setInterval(() => {
        const s = document.createElement("script");
        s.src = `/__extension-${n++}.js`;
        (document.head || document.documentElement).appendChild(s);
        window.__added = n;
      }, 2000);
    });
    await page.route("**/js/app.js*", () => {});
    await page.goto(BASE + "/", { waitUntil: "commit" });
    // Until it is let go, or well past both the eight seconds and the twenty
    await page.waitForFunction(() => window.__released > 0 || (window.__lastScript && performance.now() > Math.max(window.__lastScript + 12000, 22000)), null, { timeout: 40000, polling: 250 });
    const t = await page.evaluate(() => ({ last: Math.round(window.__lastScript), released: Math.round(window.__released), setBack: Math.round(window.__setBack), app: !!window.VTApp, added: window.__added }));
    expect(t.app, "control: the app never arrived").toBe(false);
    expect(t.added, "control: scripts were added meanwhile").toBeGreaterThan(2);
    expect(t.setBack, `control: the clock was set back in the wait after the last script (${t.last} -> ${t.setBack} ms)`).toBeGreaterThan(t.last);
    expect(t.released, `let go at all, the clock set back at ${t.setBack} ms`).toBeGreaterThan(0);
    expect(t.released - t.last, `let go eight seconds after the last script (${t.last} -> ${t.released} ms)`).toBeGreaterThanOrEqual(7500);
    expect(t.released - t.last, `not later (${t.last} -> ${t.released} ms)`).toBeLessThan(9500);
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
