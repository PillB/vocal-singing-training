/**
 * The region gate (js/region-gate.js): the EU's rules where they apply, and
 * nowhere else.
 *
 * The owner's rule, 2026-09-24: a visitor outside the countries that require
 * being asked first must not pay for those rules with a banner, an extra
 * request or a moment's wait. So the first test here is the important one — it
 * says nothing at all happens in Lima — and the rest check that the asking, the
 * holding and the remembering work where they are required.
 *
 * The worker is stubbed at the network boundary, so these drive the real client
 * code. Playwright marks its browser as automated, which the client rightly
 * refuses to send from, so webdriver is switched off first.
 */
const path = require("path");
const { pathToFileURL } = require("url");
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const WORKER_SRC = path.join(__dirname, "..", "workers", "entitlements", "src");
const ENDPOINT = "https://events.test/v1/events";

/**
 * Open the site in its own context, with the worker stubbed.
 * @param {import('@playwright/test').Browser} browser Browser.
 * @param {{timezoneId: string, locale: string, geo?: object|"fail", gpc?: boolean,
 *          storage?: Record<string, string>}} opts Case.
 * @returns {Promise<{ctx: object, page: object, sent: {batches: object[], geo: number}}>} Case.
 */
async function open(browser, opts) {
  const ctx = await browser.newContext({ timezoneId: opts.timezoneId, locale: opts.locale });
  const page = await ctx.newPage();
  const sent = { batches: [], geo: 0 };
  await page.route("https://events.test/**", async (route) => {
    const req = route.request();
    if (req.url().endsWith("/v1/geo")) {
      sent.geo += 1;
      if (opts.geo === "fail") {
        await route.abort();
        return;
      }
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify(opts.geo || { ok: true, country: "ES", askFirst: true })
      });
      return;
    }
    try {
      sent.batches.push(JSON.parse(req.postData() || "null"));
    } catch {
      sent.batches.push(null);
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  await page.addInitScript((o) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      Object.entries(o.storage || {}).forEach(([k, v]) => localStorage.setItem(k, v));
    } catch {
      /* ignore */
    }
    window.VT_ANALYTICS_ENDPOINT = o.endpoint;
    Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
    if (o.gpc) {
      Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: () => true, configurable: true });
    }
  }, { endpoint: ENDPOINT, gpc: !!opts.gpc, storage: opts.storage || {} });
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTAnalytics && !!window.VTRegion);
  return { ctx, page, sent };
}

/** Raise an event and try to send it, the way the app does on any real action. */
async function trackAndFlush(page) {
  await page.evaluate(() => {
    window.VTAnalytics.track("practice_start", { exerciseId: "s4-lip-trills" });
    window.VTAnalytics.flush();
  });
}

const bar = "[data-region-consent]";

test.describe("EU rules only in the EU", () => {
  test("a visitor outside the ask-first countries is asked nothing and waits for nothing", async ({ browser }) => {
    const { ctx, page, sent } = await open(browser, { timezoneId: "America/Lima", locale: "es-PE" });
    // Synchronous: the verdict is in before the first event is raised, so no
    // event is ever held and no request goes out to find out where we are.
    expect(await page.evaluate(() => window.VTRegion.verdict())).toBe("non_eu");
    expect(await page.evaluate(() => window.VTRegion.blockedReason())).toBe("");
    await trackAndFlush(page);
    await expect.poll(() => sent.batches.length).toBeGreaterThan(0);
    expect(sent.geo).toBe(0);
    await expect(page.locator(bar)).toHaveCount(0);
    // The body is the same bytes it was before any of this existed.
    expect(Object.keys(sent.batches[0]).sort()).toEqual(["events", "v"]);
    expect(sent.batches[0].events.map((e) => e.name)).toContain("practice_start");
    await ctx.close();
  });

  test("in an ask-first country nothing is sent, and nothing is stored for us, until the visitor answers", async ({
    browser
  }) => {
    const { ctx, page, sent } = await open(browser, { timezoneId: "Europe/Madrid", locale: "es-ES" });
    await page.waitForFunction(() => window.VTRegion.verdict() !== "pending");
    expect(await page.evaluate(() => window.VTRegion.verdict())).toBe("eu");
    expect(await page.evaluate(() => window.VTRegion.country())).toBe("ES");
    expect(sent.geo).toBe(1);

    await trackAndFlush(page);
    await page.waitForTimeout(300);
    expect(sent.batches).toEqual([]);
    expect(await page.evaluate(() => window.VTAnalytics.remoteState().reason)).toBe("eu_unanswered");

    // Practising is untouched: the local log, which is what the streaks and the
    // guide's own figures read, still has everything.
    const counts = await page.evaluate(() => window.VTAnalytics.summary().counts);
    expect(counts.practice_start).toBeGreaterThan(0);
    expect(counts.app_open).toBeGreaterThan(0);

    // No A/B id minted, and the split is inert rather than all in one arm.
    expect(await page.evaluate(() => localStorage.getItem("vt_ab_v1"))).toBeNull();
    const report = await page.evaluate(() => window.VTExperiments.report());
    expect(report.clientId).toBeNull();
    expect(report.inert).toBe(true);
    expect(await page.evaluate(() => window.VTExperiments.variant("loop_home_2026_10"))).toBe("loop");

    // Asked, in the page's language, with refusing exactly as easy as accepting.
    await expect(page.locator(bar)).toBeVisible();
    const yes = page.locator(`${bar} [data-region-accept]`);
    const no = page.locator(`${bar} [data-region-reject]`);
    await expect(yes).toBeVisible();
    await expect(no).toBeVisible();
    await expect(yes).toHaveText("Aceptar");
    await expect(no).toHaveText("Rechazar");
    const look = (el) =>
      el.evaluate((n) => {
        const s = getComputedStyle(n);
        return [s.fontSize, s.backgroundColor, s.color, s.minHeight, s.borderWidth];
      });
    expect(await look(no)).toEqual(await look(yes));
    await ctx.close();
  });

  test("saying yes sends what was held, marked as answered", async ({ browser }) => {
    const { ctx, page, sent } = await open(browser, { timezoneId: "Europe/Madrid", locale: "es-ES" });
    await page.waitForFunction(() => window.VTRegion.verdict() !== "pending");
    await trackAndFlush(page);
    await page.waitForTimeout(200);
    expect(sent.batches).toEqual([]);

    await page.locator(`${bar} [data-region-accept]`).click();
    await expect.poll(() => sent.batches.length).toBeGreaterThan(0);
    const batch = sent.batches[0];
    // The events raised before the answer are the ones a funnel starts with, so
    // they are kept and sent, not thrown away and re-raised.
    expect(batch.events.map((e) => e.name)).toEqual(expect.arrayContaining(["app_open", "practice_start"]));
    expect(batch.consent).toBe("granted");
    // Every event still carries the id, stamped on when the answer came.
    expect(batch.events.every((e) => /^[0-9a-f]{16}$/.test(e.cid))).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem("vt_ab_v1"))).toContain("cid");
    await expect(page.locator(bar)).toHaveCount(0);
    await ctx.close();
  });

  test("saying no is honoured and remembered, with no second asking", async ({ browser }) => {
    const { ctx, page, sent } = await open(browser, { timezoneId: "Europe/Madrid", locale: "es-ES" });
    await page.waitForFunction(() => window.VTRegion.verdict() !== "pending");
    await page.locator(`${bar} [data-region-reject]`).click();
    await expect(page.locator(bar)).toHaveCount(0);
    await trackAndFlush(page);
    await page.waitForTimeout(300);
    expect(sent.batches).toEqual([]);

    // A stored no needs no request to the worker and no bar on the next visit.
    const before = sent.geo;
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTRegion);
    await trackAndFlush(page);
    await page.waitForTimeout(300);
    expect(sent.batches).toEqual([]);
    expect(sent.geo).toBe(before);
    await expect(page.locator(bar)).toHaveCount(0);
    expect(await page.evaluate(() => window.VTRegion.consent())).toBe("denied");
    await ctx.close();
  });

  test("the worker overrules the browser's guess, in both directions", async ({ browser }) => {
    // A European time zone on a machine that is not in Europe: the edge knows
    // better, so the hold is lifted and nobody is ever asked.
    const inside = await open(browser, {
      timezoneId: "Europe/Madrid",
      locale: "es-ES",
      geo: { ok: true, country: "PE", askFirst: false }
    });
    await inside.page.waitForFunction(() => window.VTRegion.verdict() !== "pending");
    expect(await inside.page.evaluate(() => window.VTRegion.verdict())).toBe("non_eu");
    await trackAndFlush(inside.page);
    await expect.poll(() => inside.sent.batches.length).toBeGreaterThan(0);
    expect(Object.keys(inside.sent.batches[0]).sort()).toEqual(["events", "v"]);
    await expect(inside.page.locator(bar)).toHaveCount(0);
    await inside.ctx.close();

    // And a worker that cannot be reached is the stricter answer, because
    // asking afterwards is not asking first.
    const blind = await open(browser, { timezoneId: "Europe/Madrid", locale: "es-ES", geo: "fail" });
    await blind.page.waitForFunction(() => window.VTRegion.verdict() !== "pending");
    expect(await blind.page.evaluate(() => window.VTRegion.verdict())).toBe("eu");
    await trackAndFlush(blind.page);
    await blind.page.waitForTimeout(300);
    expect(blind.sent.batches).toEqual([]);
    await expect(blind.page.locator(bar)).toBeVisible();
    await blind.ctx.close();
  });

  test("a European language alone is enough to check, and costs nothing else", async ({ browser }) => {
    // Someone in Lima with a German phone: worth one small question to the
    // worker, and nothing more once it answers.
    const { ctx, page, sent } = await open(browser, {
      timezoneId: "America/Lima",
      locale: "de-DE",
      geo: { ok: true, country: "PE", askFirst: false }
    });
    expect(await page.evaluate(() => window.VTRegion.looksEuropean())).toBe(true);
    await page.waitForFunction(() => window.VTRegion.verdict() !== "pending");
    expect(sent.geo).toBe(1);
    await trackAndFlush(page);
    await expect.poll(() => sent.batches.length).toBeGreaterThan(0);
    await expect(page.locator(bar)).toHaveCount(0);
    await ctx.close();
  });

  test("the browser's list of ask-first countries agrees with the worker's", async ({ browser }) => {
    // Two lists in two languages, and the worker's is the one that decides. If
    // they drift, a visitor is asked by one half and recorded by the other.
    const { ASK_FIRST_COUNTRIES } = await import(pathToFileURL(path.join(WORKER_SRC, "events.js")).href);
    const { ctx, page } = await open(browser, { timezoneId: "America/Lima", locale: "es-PE" });
    const client = await page.evaluate(() => window.VTRegion.regions());
    const missing = [...ASK_FIRST_COUNTRIES].filter((cc) => !client.includes(cc));
    expect(missing).toEqual([]);
    // The page may be broader: a language tag can name an EU outermost region
    // (Guadeloupe, Réunion, the Azores) whose requests reach the worker under
    // the member state's own code, so the worker needs no entry for it.
    const extra = client.filter((cc) => !ASK_FIRST_COUNTRIES.has(cc));
    expect(extra).toEqual(["GF", "GP", "MQ", "RE", "YT"]);
    await ctx.close();
  });

  test("a browser that already said no is not asked again", async ({ browser }) => {
    // Global Privacy Control is a refusal with legal force in several US states
    // and is what Brave and DuckDuckGo send. Putting a bar in front of it would
    // be asking somebody to repeat themselves.
    const { ctx, page, sent } = await open(browser, {
      timezoneId: "Europe/Madrid",
      locale: "es-ES",
      gpc: true
    });
    await page.waitForFunction(() => window.VTRegion.verdict() !== "pending");
    await trackAndFlush(page);
    await page.waitForTimeout(300);
    expect(sent.batches).toEqual([]);
    expect(await page.evaluate(() => window.VTAnalytics.remoteState().reason)).toBe("gpc");
    await expect(page.locator(bar)).toHaveCount(0);
    await ctx.close();
  });
});
