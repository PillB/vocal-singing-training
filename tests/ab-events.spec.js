/**
 * What leaves the browser for A/B tests (js/analytics.js), and when it must not.
 *
 * The worker is stubbed at the network boundary: requests to the endpoint are
 * captured and answered, so these check the real client code. Playwright marks
 * its browser as automated (navigator.webdriver), which the client rightly
 * refuses to send from, so the send tests switch that flag off first.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const ENDPOINT = "https://events.test/v1/events";
const NOW = "2026-09-23T10:00:00-05:00";

test.use({ timezoneId: "America/Lima", locale: "es-PE" });

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ endpoint?: string, gpc?: boolean, dnt?: boolean, human?: boolean, loopWeights?: number[] }} opts
 * @returns {Promise<{ bodies: object[], headers: object[] }>} captured requests
 */
async function boot(page, opts = {}) {
  const sent = { bodies: [], headers: [] };
  await page.route("https://events.test/**", async (route) => {
    const req = route.request();
    sent.headers.push(req.headers());
    try {
      sent.bodies.push(JSON.parse(req.postData() || "null"));
    } catch {
      sent.bodies.push(null);
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript((o) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
    } catch {
      /* ignore */
    }
    if (o.endpoint) window.VT_ANALYTICS_ENDPOINT = o.endpoint;
    if (o.human) Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
    if (o.gpc) Object.defineProperty(Navigator.prototype, "globalPrivacyControl", { get: () => true, configurable: true });
    if (o.dnt) Object.defineProperty(Navigator.prototype, "doNotTrack", { get: () => "1", configurable: true });
    if (o.loopWeights) {
      // Switch the loop test on before the app reads it, with a split that
      // puts this browser in a known arm.
      let cfg;
      Object.defineProperty(window, "VT_EXPERIMENTS", {
        configurable: true,
        get: () => cfg,
        set: (v) => {
          if (v && v.loop_home_2026_10) {
            v.loop_home_2026_10.enabled = true;
            v.loop_home_2026_10.variants = [
              { id: "loop", weight: o.loopWeights[0] },
              { id: "classic", weight: o.loopWeights[1] }
            ];
          }
          cfg = v;
        }
      });
    }
  }, opts);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTAnalytics && !!window.VTLoop);
  return sent;
}

test.describe("anonymous events for A/B tests", () => {
  test("with an endpoint, events go out in one batch with the id, day and zone a result needs", async ({ page }) => {
    const sent = await boot(page, { endpoint: ENDPOINT, human: true });
    await page.evaluate(() => {
      window.VTAnalytics.track("practice_start", { exerciseId: "s4-lip-trills", mode: "sustain" });
      window.VTAnalytics.flush();
    });
    await expect.poll(() => sent.bodies.length).toBeGreaterThan(0);
    // app_open and practice_start travel together, not as one request each.
    expect(sent.bodies.length).toBe(1);
    const batch = sent.bodies[0];
    expect(batch.v).toBe(1);
    const names = batch.events.map((e) => e.name);
    expect(names).toEqual(expect.arrayContaining(["app_open", "practice_start"]));
    const ev = batch.events.find((e) => e.name === "practice_start");
    expect(ev.cid).toMatch(/^[0-9a-f]{16}$/);
    expect(ev.day).toBe("2026-09-23");
    expect(ev.tz).toBe(-300);
    expect(ev.props).toEqual({ exerciseId: "s4-lip-trills", mode: "sustain" });
    // A simple text/plain body: no preflight, and nothing but the batch.
    expect(sent.headers[0]["content-type"]).toMatch(/^text\/plain/);
    expect(Object.keys(batch).sort()).toEqual(["events", "v"]);
  });

  test("a browser that says no is never sent from: GPC, Do Not Track, automation", async ({ browser }) => {
    for (const opts of [{ gpc: true, human: true }, { dnt: true, human: true }, { human: false }]) {
      // A fresh context per case: init scripts would otherwise pile up.
      const ctx = await browser.newContext({ timezoneId: "America/Lima", locale: "es-PE" });
      const page = await ctx.newPage();
      const sent = await boot(page, { endpoint: ENDPOINT, ...opts });
      const state = await page.evaluate(() => {
        window.VTAnalytics.track("practice_start", { exerciseId: "s4-lip-trills" });
        window.VTAnalytics.flush(true);
        return window.VTAnalytics.remoteState();
      });
      expect(state.sending).toBe(false);
      expect(state.reason).toBe(opts.gpc ? "gpc" : opts.dnt ? "dnt" : "automated");
      await page.waitForTimeout(150);
      expect(sent.bodies).toEqual([]);
      // Nothing changes locally: the event is still recorded on the device.
      const counts = await page.evaluate(() => window.VTAnalytics.summary().counts);
      expect(counts.practice_start).toBeGreaterThan(0);
      await ctx.close();
    }
  });

  test("without an endpoint nothing leaves the page, and the guide says so", async ({ page }) => {
    await boot(page, { human: true });
    const state = await page.evaluate(() => window.VTAnalytics.remoteState());
    expect(state).toEqual({ sending: false, reason: "no_endpoint", optedOut: false });
    await page.goto(BASE + "/guide.html#privacidad");
    const es = page.locator('[data-privacy-switch][data-lang="es"]');
    await expect(es).toBeVisible();
    await expect(es.locator("[data-privacy-state]")).toHaveText("Ahora mismo este sitio no envía estadísticas.");
    // The switch is still offered, so the choice holds if sending starts later.
    await expect(es.locator("[data-privacy-toggle]")).toBeVisible();
  });

  test("the guide's switch stops sending from this browser, says so, and can be undone", async ({ page }) => {
    const sent = await boot(page, { endpoint: ENDPOINT, human: true });
    await page.goto(BASE + "/guide.html#privacidad");
    const es = page.locator('[data-privacy-switch][data-lang="es"]');
    await expect(es.locator("[data-privacy-state]")).toHaveText("Este navegador envía estadísticas anónimas.");
    const btn = es.locator("[data-privacy-toggle]");
    await expect(btn).toHaveText("No enviar desde este navegador");
    const box = await btn.boundingBox();
    expect(box.height).toBeGreaterThanOrEqual(44);
    await btn.click();
    await expect(es.locator("[data-privacy-state]")).toHaveText("Elegiste no enviar estadísticas desde este navegador.");
    await expect(btn).toHaveText("Volver a permitir");
    await expect(btn).toHaveAttribute("aria-pressed", "true");
    // The English half agrees.
    await expect(page.locator('[data-privacy-switch][data-lang="en"] [data-privacy-state]')).toHaveText(
      "You chose not to send statistics from this browser."
    );

    await page.goto(BASE + "/");
    await page.waitForFunction(() => !!window.VTAnalytics);
    const before = sent.bodies.length;
    await page.evaluate(() => {
      window.VTAnalytics.track("practice_start", { exerciseId: "s4-lip-trills" });
      window.VTAnalytics.flush();
    });
    await page.waitForTimeout(150);
    expect(sent.bodies.length).toBe(before);

    await page.goto(BASE + "/guide.html#privacidad");
    await page.locator('[data-privacy-switch][data-lang="es"] [data-privacy-toggle]').click();
    await expect(es.locator("[data-privacy-state]")).toHaveText("Este navegador envía estadísticas anónimas.");
  });

  test("when the loop test is on, both arms are exposed on opening the app", async ({ browser }) => {
    for (const [weights, arm] of [
      [[1, 0], "loop"],
      [[0, 1], "classic"]
    ]) {
      const ctx = await browser.newContext({ timezoneId: "America/Lima", locale: "es-PE" });
      const page = await ctx.newPage();
      await boot(page, { loopWeights: weights });
      const r = await page.evaluate(() => ({
        rep: window.VTExperiments.report().experiments.loop_home_2026_10,
        events: window.VTAnalytics.summary().recent.filter((e) => e.name === "experiment_expose").map((e) => e.props)
      }));
      expect(r.rep.enabled).toBe(true);
      expect(r.rep.assigned).toBe(arm);
      expect(r.rep.exposed).toBe(arm);
      expect(r.events).toEqual([{ experiment: "loop_home_2026_10", variant: arm, forced: false, enabled: true }]);
      await ctx.close();
    }
  });
});
