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
 * @param {{timezoneId?: string, locale: string, geo?: object|"fail", geoStatus?: number,
 *          gpc?: boolean, human?: boolean, storage?: Record<string, string>}} opts Case.
 * @returns {Promise<{ctx: object, page: object, sent: {batches: object[], geo: number}}>} Case.
 */
async function open(browser, opts) {
  const ctx = await browser.newContext(
    // No timezoneId leaves the container's own zone, which is Etc/UTC — the case
    // a hardened browser and this suite both present.
    opts.timezoneId ? { timezoneId: opts.timezoneId, locale: opts.locale } : { locale: opts.locale }
  );
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
        status: opts.geoStatus || 200,
        contentType: "application/json",
        body: JSON.stringify(opts.geo || { ok: true, country: "ES", placed: true, askFirst: true })
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
    if (o.human) {
      Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
    }
    if (o.gpc) {
      Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: () => true, configurable: true });
    }
  }, { endpoint: ENDPOINT, gpc: !!opts.gpc, human: opts.human !== false, storage: opts.storage || {} });
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

    // Nothing is written to the device either, because that is the thing being
    // asked about. The events wait in memory, which is why summary() still shows
    // them while localStorage holds nothing.
    expect(await page.evaluate(() => localStorage.getItem("vt_analytics_v1"))).toBeNull();
    const counts = await page.evaluate(() => window.VTAnalytics.summary().counts);
    expect(counts.practice_start).toBeGreaterThan(0);
    expect(counts.app_open).toBeGreaterThan(0);

    // And practising itself is untouched: the streaks, the heatmap and the
    // history read their own keys, not this log.
    expect(await page.evaluate(() => !!window.VTDays?.summary)).toBe(true);

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
    // The device is written at the same moment, with each event keeping the time
    // it actually happened rather than the time the answer came.
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("vt_analytics_v1") || "null"));
    expect(stored.events.map((e) => e.name)).toEqual(expect.arrayContaining(["app_open", "practice_start"]));
    expect(new Set(stored.events.map((e) => e.t)).size).toBeGreaterThan(1);
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

  test("a hidden clock is not released by a worker that has no route yet", async ({ browser }) => {
    // The nastiest case: somebody in Berlin on Tor Browser, whose clock says UTC,
    // against a worker that has not been redeployed. Releasing them on the 404
    // would mint the id, send the batch, and be kept — a worker old enough to
    // 404 this route has no refusal on ingest either.
    const { ctx, page, sent } = await open(browser, { locale: "en-US", geoStatus: 404 });
    await page.waitForFunction(() => window.VTRegion.verdict() !== "pending");
    expect(await page.evaluate(() => window.VTRegion.zoneVerdict())).toBe("unknown");
    expect(await page.evaluate(() => window.VTRegion.verdict())).toBe("eu");
    await trackAndFlush(page);
    await page.waitForTimeout(250);
    expect(sent.batches).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem("vt_ab_v1"))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("vt_analytics_v1"))).toBeNull();
    await expect(page.locator(bar)).toBeVisible();
    await ctx.close();
  });

  test("a gate that fails to load keeps nothing and sends nothing", async ({ browser }) => {
    // js/region-gate.js 404ing, blocked by an extension, or failing to parse must
    // not read as permission. Both pages declare VT_REGION_REQUIRED, so its
    // absence stops everything instead.
    const ctx = await browser.newContext({ timezoneId: "Europe/Madrid", locale: "es-ES" });
    const page = await ctx.newPage();
    const batches = [];
    await page.route("https://events.test/**", async (route) => {
      try {
        batches.push(JSON.parse(route.request().postData() || "null"));
      } catch {
        batches.push(null);
      }
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    });
    await page.route("**/js/region-gate.js*", (route) => route.fulfill({ status: 404, body: "" }));
    await page.addInitScript((ep) => {
      window.VT_ANALYTICS_ENDPOINT = ep;
      Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
    }, ENDPOINT);
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTAnalytics);
    expect(await page.evaluate(() => !!window.VTRegion)).toBe(false);
    expect(await page.evaluate(() => window.VT_REGION_REQUIRED)).toBe(true);
    expect(await page.evaluate(() => window.VTAnalytics.remoteState().reason)).toBe("no_region_gate");
    await trackAndFlush(page);
    await page.waitForTimeout(300);
    expect(batches).toEqual([]);
    expect(await page.evaluate(() => localStorage.getItem("vt_analytics_v1"))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem("vt_ab_v1"))).toBeNull();
    expect(await page.evaluate(() => window.VTExperiments.report().inert)).toBe(true);
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
    // they drift, a visitor is asked by one half and recorded by the other, so
    // they have to match exactly rather than merely overlap.
    const { ASK_FIRST_COUNTRIES } = await import(pathToFileURL(path.join(WORKER_SRC, "events.js")).href);
    const { ctx, page } = await open(browser, { timezoneId: "America/Lima", locale: "es-PE" });
    const client = await page.evaluate(() => window.VTRegion.regions());
    const missing = [...ASK_FIRST_COUNTRIES].filter((cc) => !client.includes(cc));
    expect(missing).toEqual([]);
    const extra = client.filter((cc) => !ASK_FIRST_COUNTRIES.has(cc));
    expect(extra).toEqual([]);
    // And the list is the one the research settled on, which is not "the EU":
    // the EEA, the EU outermost regions under their own Cloudflare codes,
    // Gibraltar on its own 2006 Regulations, and the French overseas
    // collectivities, where art. 82 of loi 78-17 has applied in full since
    // 1 June 2019 even though no EU instrument reaches them.
    expect(client).toContain("RE");
    expect(client).toContain("MF");
    expect(client).toContain("GI");
    expect(client).toContain("PF");
    expect(client).toContain("NC");
    // Out, each for its own reason: the UK repealed nothing but took the
    // consent-or-object route (PECR Sch. A1), and the Crown dependencies were
    // never inside the ePrivacy Directive or PECR at all.
    expect(client).not.toContain("GB");
    expect(client).not.toContain("JE");
    expect(client).not.toContain("GG");
    expect(client).not.toContain("IM");
    // Greenland, the Faroes and the Dutch Caribbean legislate their own.
    expect(client).not.toContain("GL");
    expect(client).not.toContain("FO");
    expect(client).not.toContain("CW");
    await ctx.close();
  });

  test("a browser that hides its clock is checked, not assumed", async ({ browser }) => {
    // Firefox with resistFingerprinting and Tor Browser report UTC on purpose,
    // and a machine with no zone set reports nothing at all. Reading either as
    // "not in Europe" would leave the visitors most likely to care never asked.
    const { ctx, page, sent } = await open(browser, {
      locale: "en-US",
      geo: { ok: true, country: "PE", placed: true, askFirst: false }
    });
    expect(await page.evaluate(() => window.VTRegion.zoneVerdict())).toBe("unknown");
    expect(await page.evaluate(() => window.VTRegion.looksEuropean())).toBe(true);
    await page.waitForFunction(() => window.VTRegion.verdict() !== "pending");
    expect(sent.geo).toBe(1);
    expect(await page.evaluate(() => window.VTRegion.verdict())).toBe("non_eu");
    await trackAndFlush(page);
    await expect.poll(() => sent.batches.length).toBeGreaterThan(0);
    await expect(page.locator(bar)).toHaveCount(0);
    await ctx.close();
  });

  test("an automated browser is never asked, so the suite grows no bar", async ({ browser }) => {
    // This container runs on Etc/UTC, so every spec that does not set a zone
    // lands on the "unknown" branch above. Nothing may come of that: an
    // automated browser sends nothing, so there is nothing to consent to.
    const { ctx, page, sent } = await open(browser, { locale: "es-PE", human: false });
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => window.VTRegion.verdict())).toBe("non_eu");
    expect(await page.evaluate(() => window.VTRegion.report().source)).toBe("automated");
    expect(sent.geo).toBe(0);
    expect(await page.evaluate(() => window.VTAnalytics.remoteState().reason)).toBe("automated");
    await trackAndFlush(page);
    await page.waitForTimeout(200);
    expect(sent.batches).toEqual([]);
    await expect(page.locator(bar)).toHaveCount(0);
    await ctx.close();
  });

  test("a worker that cannot place the request is no answer, not a no", async ({ browser }) => {
    // Tor answers "T1" and an unmappable address answers "XX"; the worker reports
    // both as placed:false. Treating that as "not in Europe" would release
    // exactly the visitors who are hardest to place.
    const { ctx, page, sent } = await open(browser, {
      timezoneId: "Europe/Madrid",
      locale: "es-ES",
      geo: { ok: true, country: null, placed: false, askFirst: false }
    });
    await page.waitForFunction(() => window.VTRegion.verdict() !== "pending");
    expect(await page.evaluate(() => window.VTRegion.verdict())).toBe("eu");
    await trackAndFlush(page);
    await page.waitForTimeout(250);
    expect(sent.batches).toEqual([]);
    await expect(page.locator(bar)).toBeVisible();
    await ctx.close();
  });

  test("a worker without the route yet falls back to the clock, not to a bar for everybody", async ({ browser }) => {
    // /v1/geo only exists once the worker is redeployed. A 404 is a fact about
    // the deployment, not a privacy signal: keep the bar for a European clock and
    // keep it away from somebody whose only European signal was a language.
    const madrid = await open(browser, { timezoneId: "Europe/Madrid", locale: "es-ES", geoStatus: 404 });
    await madrid.page.waitForFunction(() => window.VTRegion.verdict() !== "pending");
    expect(await madrid.page.evaluate(() => window.VTRegion.report().source)).toBe("route_missing");
    expect(await madrid.page.evaluate(() => window.VTRegion.verdict())).toBe("eu");
    await expect(madrid.page.locator(bar)).toBeVisible();
    await madrid.ctx.close();

    const lima = await open(browser, { timezoneId: "America/Lima", locale: "de-DE", geoStatus: 404 });
    await lima.page.waitForFunction(() => window.VTRegion.verdict() !== "pending");
    expect(await lima.page.evaluate(() => window.VTRegion.verdict())).toBe("non_eu");
    await trackAndFlush(lima.page);
    await expect.poll(() => lima.sent.batches.length).toBeGreaterThan(0);
    await expect(lima.page.locator(bar)).toHaveCount(0);
    await lima.ctx.close();
  });

  test("the United Kingdom is not asked, and pays nothing for the EU's rules", async ({ browser }) => {
    // PECR Schedule A1 para 5, in force 5 February 2026, exempts first-party
    // statistics where the visitor is told and has a simple free way to object.
    // docs/38-AB-TESTING.md carries the reasoning and the risk in it.
    const { ctx, page, sent } = await open(browser, { timezoneId: "Europe/London", locale: "en-GB" });
    expect(await page.evaluate(() => window.VTRegion.zoneVerdict())).toBe("clear");
    expect(await page.evaluate(() => window.VTRegion.verdict())).toBe("non_eu");
    await trackAndFlush(page);
    await expect.poll(() => sent.batches.length).toBeGreaterThan(0);
    expect(sent.geo).toBe(0);
    await expect(page.locator(bar)).toHaveCount(0);
    await ctx.close();
  });

  test("the way back from yes is on the same page as the bar, in the page's language", async ({ browser }) => {
    // GDPR art. 7(3) and EDPB Guidelines 05/2020 para 114: withdrawing consent
    // has to be as easy as giving it. Consent is given with one tap on a bar on
    // the app, so the way back has to be on the app too — a control only in the
    // guide would leave a visitor hunting through a different page for it. The
    // same control is what the UK's PECR Schedule A1 exemption and Switzerland's
    // art. 45c FMG hang on, so it is the one control three jurisdictions need.
    const { ctx, page, sent } = await open(browser, { timezoneId: "Europe/Madrid", locale: "es-ES" });
    await page.locator(`${bar} [data-region-accept]`).click();
    const eventBatches = () => sent.batches.filter((b) => b && Array.isArray(b.events));
    await expect.poll(() => eventBatches().length).toBeGreaterThan(0);

    const box = page.locator("footer.app-footer [data-privacy-switch]");
    await expect(box).toBeVisible();
    const off = box.locator("[data-privacy-toggle]");
    await expect(off).toBeVisible();
    // The app's footer carries no data-lang, so it speaks whatever the page
    // speaks — and follows it when the visitor switches language mid-session.
    await expect(box.locator("[data-privacy-state]")).toHaveText("Este navegador envía estadísticas anónimas.");
    await expect(off).toHaveText("No enviar y borrar lo enviado");
    await page.evaluate(() => window.VTI18n.setLang("en"));
    await expect(box.locator("[data-privacy-state]")).toHaveText("This browser sends anonymous statistics.");
    await expect(off).toHaveText("Stop sending and delete what was sent");

    // One tap, from the same page, and nothing is sent again.
    const before = eventBatches().length;
    await off.click();
    expect(await page.evaluate(() => window.VTAnalytics.remoteState().optedOut)).toBe(true);
    await trackAndFlush(page);
    await page.waitForTimeout(300);
    expect(eventBatches().length).toBe(before);
    // And it offers the way back in, so the choice is a switch rather than a
    // door that locks behind them.
    await expect(off).toHaveText("Allow again");
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
    // In an ask-first country the signal is the answer, so nothing is kept either.
    expect(await page.evaluate(() => window.VTRegion.blockedReason())).toBe("eu_refused");
    expect(await page.evaluate(() => localStorage.getItem("vt_analytics_v1"))).toBeNull();
    await expect(page.locator(bar)).toHaveCount(0);
    await ctx.close();
  });
});
