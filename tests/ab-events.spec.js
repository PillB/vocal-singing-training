/**
 * What leaves the browser for A/B tests (js/analytics.js), and when it must not.
 *
 * The worker is stubbed at the network boundary: requests to the endpoint are
 * captured and answered, so these check the real client code. Playwright marks
 * its browser as automated (navigator.webdriver), which the client rightly
 * refuses to send from, so the send tests switch that flag off first.
 */
const path = require("path");
const { pathToFileURL } = require("url");
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const ENDPOINT = "https://events.test/v1/events";
const NOW = "2026-09-23T10:00:00-05:00";
const WORKER_SRC = path.join(__dirname, "..", "workers", "entitlements", "src");

/** The worker's own modules, so these checks cannot drift from what it does. */
const workerModule = (name) => import(pathToFileURL(path.join(WORKER_SRC, name)).href);

test.use({ timezoneId: "America/Lima", locale: "es-PE" });

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ endpoint?: string, gpc?: boolean, dnt?: boolean, human?: boolean, noWorker?: boolean, loopWeights?: number[] }} opts
 * @returns {Promise<{ bodies: object[], headers: object[], urls: string[] }>} captured requests
 */
async function boot(page, opts = {}) {
  const sent = { bodies: [], headers: [], urls: [] };
  await page.route("https://events.test/**", async (route) => {
    const req = route.request();
    sent.urls.push(req.url());
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
    // The endpoint is derived from the worker URL in js/billing-config.js since
    // 2026-09-24, so "no endpoint" now means "no worker", which is a real
    // deployment the runbook allows. Blank it before that file is read.
    if (o.noWorker) {
      let held;
      Object.defineProperty(window, "VT_BILLING_CONFIG", {
        configurable: true,
        get: () => held,
        set: (v) => {
          if (v && v.verification) v.verification.apiBaseUrl = "";
          held = v;
        }
      });
    }
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
    // Exactly the fields the privacy text lists; the worker adds the arrival time.
    expect(Object.keys(ev).sort()).toEqual(["cid", "day", "name", "props", "tz"]);
    expect(ev.cid).toMatch(/^[0-9a-f]{16}$/);
    expect(ev.day).toBe("2026-09-23");
    expect(ev.tz).toBe(-300);
    expect(ev.props).toEqual({ exerciseId: "s4-lip-trills", mode: "sustain" });
    // A simple text/plain body: no preflight, and nothing but the batch.
    expect(sent.headers[0]["content-type"]).toMatch(/^text\/plain/);
    expect(Object.keys(batch).sort()).toEqual(["events", "v"]);
  });

  test("a browser that says no is never sent from: GPC, automation", async ({ browser }) => {
    for (const opts of [{ gpc: true, human: true }, { human: false }]) {
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
      expect(state.reason).toBe(opts.gpc ? "gpc" : "automated");
      await page.waitForTimeout(150);
      expect(sent.bodies).toEqual([]);
      // Nothing changes locally: the event is still recorded on the device.
      const counts = await page.evaluate(() => window.VTAnalytics.summary().counts);
      expect(counts.practice_start).toBeGreaterThan(0);
      await ctx.close();
    }
  });

  test("Do Not Track alone no longer stops anything, which the pages no longer claim", async ({ page }) => {
    // Retired 2026-09-24: the W3C discontinued the specification in 2019 and
    // Safari removed the header that year, because sending it narrowed a
    // fingerprint rather than protecting anybody. GPC and the guide's switch are
    // the two ways to say no, and both are tested above. This case also guards
    // the pages: a promise to honour DNT must not come back while the code does
    // not, which is how a privacy page starts lying.
    const sent = await boot(page, { endpoint: ENDPOINT, dnt: true, human: true });
    const state = await page.evaluate(() => {
      window.VTAnalytics.track("practice_start", { exerciseId: "s4-lip-trills" });
      window.VTAnalytics.flush(true);
      return window.VTAnalytics.remoteState();
    });
    expect(state.sending).toBe(true);
    expect(state.reason).toBe(null);
    await expect.poll(() => sent.bodies.length).toBeGreaterThan(0);
    for (const file of ["privacy.html", "guide.html"]) {
      const res = await page.request.get(`${BASE}/${file}`);
      const body = (await res.text()).toLowerCase();
      expect(body, `${file} still promises Do Not Track`).not.toContain("do not track");
    }
  });

  test("a deploy with no worker sends nothing, and the guide says so", async ({ page }) => {
    await boot(page, { human: true, noWorker: true });
    const state = await page.evaluate(() => window.VTAnalytics.remoteState());
    expect(state).toEqual({ sending: false, reason: "no_endpoint", optedOut: false });
    await page.goto(BASE + "/guide.html#privacidad");
    const es = page.locator('[data-privacy-switch][data-lang="es"]');
    await expect(es).toBeVisible();
    await expect(es.locator("[data-privacy-state]")).toHaveText("Ahora mismo este sitio no envía estadísticas.");
    // The switch is still offered, so the choice holds if sending starts later.
    await expect(es.locator("[data-privacy-toggle]")).toBeVisible();
  });

  test("the guide's switch stops sending, deletes what was sent, and can be undone", async ({ page }) => {
    const sent = await boot(page, { endpoint: ENDPOINT, human: true });
    const oldId = await page.evaluate(() => window.VTExperiments.clientId());
    await page.goto(BASE + "/guide.html#privacidad");
    const es = page.locator('[data-privacy-switch][data-lang="es"]');
    await expect(es.locator("[data-privacy-state]")).toHaveText("Este navegador envía estadísticas anónimas.");
    const btn = es.locator("[data-privacy-toggle]");
    await expect(btn).toHaveText("No enviar y borrar lo enviado");
    await expect(page.locator('[data-privacy-switch][data-lang="en"] [data-privacy-toggle]')).toHaveText(
      "Stop sending and delete what was sent"
    );
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
    // One request asked the worker to forget the old id, and the id is gone.
    await expect.poll(() => sent.bodies.filter((b) => b && b.cid === oldId && !b.events).length).toBe(1);
    expect(sent.urls.filter((u) => u.endsWith("/v1/events/forget")).length).toBe(1);
    expect(await page.evaluate(() => localStorage.getItem("vt_ab_v1"))).toBeNull();

    await page.goto(BASE + "/");
    await page.waitForFunction(() => !!window.VTAnalytics);
    // Anything sent later could not be tied to what was deleted.
    expect(await page.evaluate(() => window.VTExperiments.clientId())).not.toBe(oldId);
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
    // Allowing again deletes nothing.
    await page.waitForTimeout(150);
    expect(sent.urls.filter((u) => u.endsWith("/v1/events/forget")).length).toBe(1);
  });

  test("the guide page knows where events go, so its switch can really delete them", async ({ page }) => {
    // The switch and the state line come from the same code the app uses, but
    // guide.html loads its own scripts. The endpoint is derived from the worker
    // URL in js/billing-config.js, so leaving that file out of this page would
    // make it say "nothing is being sent" while the app sends, and would leave
    // POST /v1/events/forget with nowhere to go — the one channel the privacy
    // page promises for deleting what was already sent. No init script here: it
    // has to be true of the page as deployed.
    await page.addInitScript(() => {
      // Only so the state line is the one a person would read; the endpoint
      // assertion below does not depend on it.
      Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
    });
    await page.goto(`${BASE}/guide.html#privacidad`);
    const seen = await page.evaluate(() => ({
      endpoint: window.VT_ANALYTICS_ENDPOINT,
      worker: window.VT_BILLING_CONFIG?.verification?.apiBaseUrl || ""
    }));
    expect(seen.worker).toMatch(/^https:\/\//);
    expect(seen.endpoint).toBe(`${seen.worker.replace(/\/+$/, "")}/v1/events`);
    // And the line the visitor reads is the sending one, not "nothing is sent".
    const state = page.locator('[data-privacy-switch][data-lang="es"] [data-privacy-state]');
    await expect(state).toHaveText("Este navegador envía estadísticas anónimas.");
  });

  test("the privacy text names every field of an event that is sent, in both languages, and the worker's retention", async ({ page }) => {
    const sent = await boot(page, { endpoint: ENDPOINT, human: true });
    await page.evaluate(() => {
      window.VTAnalytics.track("practice_start", { exerciseId: "s4-lip-trills" });
      window.VTAnalytics.flush();
    });
    await expect.poll(() => sent.bodies.length).toBeGreaterThan(0);
    const fields = Object.keys(sent.bodies[0].events[0]).sort();
    // The batch itself carries only the format version and the events. A third
    // field, `consent`, exists but rides along only where the visitor was asked
    // first (js/region-gate.js), and it says nothing about them — which is why
    // the field list the pages have to name is the event's, not the batch's.
    expect(Object.keys(sent.bodies[0]).sort()).toEqual(["events", "v"]);
    const { EVENT_RETENTION_SECONDS } = await workerModule("db.js");
    const days = EVENT_RETENTION_SECONDS / 86400;
    // Each field sent, and the arrival time the worker adds, in plain words.
    const words = {
      es: { name: "qué partes usas", props: "qué partes usas", cid: "número al azar", day: "día local", tz: "zona horaria", received: "hora en que llegan", keep: `${days} días` },
      en: { name: "which parts you use", props: "which parts you use", cid: "random number", day: "local day", tz: "time zone", received: "time they arrive", keep: `${days} days` }
    };
    const section = (id) =>
      page.evaluate((anchor) => {
        const out = [];
        for (let el = document.getElementById(anchor).nextElementSibling; el && el.tagName !== "H2" && !el.classList.contains("guide-back"); el = el.nextElementSibling) {
          if (!el.hasAttribute("data-privacy-switch")) out.push(el.textContent);
        }
        return out.join(" ").replace(/\s+/g, " ");
      }, id);
    await page.goto(BASE + "/guide.html");
    const texts = { es: await section("privacidad"), en: await section("privacidad-en") };
    await page.goto(BASE + "/privacy.html");
    const policy = (await page.locator("main").textContent()).replace(/\s+/g, " ");
    for (const lang of ["es", "en"]) {
      for (const field of [...fields, "received", "keep"]) {
        expect(words[lang][field], `no words for ${field}`).toBeTruthy();
        expect(texts[lang], `${lang} guide: ${field}`).toContain(words[lang][field]);
        expect(policy, `${lang} privacy page: ${field}`).toContain(words[lang][field]);
      }
    }
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

  test("an exposure whose beacon was lost is said again on the next visit's app_open", async ({ page }) => {
    const sent = await boot(page, { endpoint: ENDPOINT, human: true, loopWeights: [0, 1] });
    // Visit 1: the exposure happens, but the phone is offline when it is sent.
    await page.route("https://events.test/**", (route) => route.abort("internetdisconnected"));
    const first = await page.evaluate(() => {
      window.VTAnalytics.flush();
      return window.VTExperiments.report().experiments.loop_home_2026_10.exposed;
    });
    expect(first).toBe("classic");
    await page.unroute("https://events.test/**");
    await page.route("https://events.test/**", async (route) => {
      sent.bodies.push(JSON.parse(route.request().postData() || "null"));
      await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
    });
    const before = sent.bodies.length;
    // Visit 2, online: the device has spent the exposure, so only app_open can carry it.
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTAnalytics && !!window.VTLoop);
    await page.evaluate(() => window.VTAnalytics.flush());
    await expect.poll(() => sent.bodies.length).toBeGreaterThan(before);
    const events = sent.bodies.slice(before).flatMap((b) => (b && b.events) || []);
    expect(events.filter((e) => e.name === "experiment_expose")).toEqual([]);
    const open = events.find((e) => e.name === "app_open");
    expect(open.props.x_loop_home_2026_10).toBe("classic");
    // Switched-off experiments are not re-asserted.
    expect(Object.keys(open.props).filter((k) => k.startsWith("x_"))).toEqual(["x_loop_home_2026_10"]);
  });
});

/**
 * Every arm must send the events its experiment is judged on (audit AB-1).
 *
 * For each experiment in the worker's registry, each arm is forced on and the
 * same arm-independent script is run: a Mínimo left without practising, a
 * Mínimo practised through, a free exercise practised and saved with a
 * rating, and an exercise whose microphone is refused. Every event a preset
 * metric reads must then be sent, the same number of times, in every arm. The
 * loop_home "classic" arm used to send no practice_day at all.
 */
test.describe("every arm sends what its experiment is judged on", () => {
  const HUMAN_UA =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";

  /**
   * Run the script in one arm and count what was recorded on the device.
   * @returns {Promise<Record<string, number>>} event name -> count
   */
  async function runArm(browser, key, arm, arms) {
    const ctx = await browser.newContext({ timezoneId: "America/Lima", locale: "es-PE", userAgent: HUMAN_UA });
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date(NOW) });
    await page.addInitScript(
      ({ key, arm, arms }) => {
        try {
          // A first visit, so the tour test is exposed; the microphone primer
          // is taken as already seen, since it is the same in every arm.
          localStorage.setItem("vt_lang", "es");
          localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: "singing" }));
          localStorage.setItem("vt_mic_primed_v1", "1");
        } catch {
          /* ignore */
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        async function fakeGUM() {
          if (window.__vtMicDenied) {
            const err = new Error("Permission denied");
            err.name = "NotAllowedError";
            throw err;
          }
          let ctx = window.VTSharedAudioCtx;
          if (!ctx || ctx.state === "closed") {
            ctx = new AC();
            window.VTSharedAudioCtx = ctx;
          }
          const dest = ctx.createMediaStreamDestination();
          const osc = ctx.createOscillator();
          const g = ctx.createGain();
          g.gain.value = 0.00001;
          osc.connect(g);
          g.connect(dest);
          osc.start();
          return dest.stream;
        }
        if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
        navigator.mediaDevices.getUserMedia = fakeGUM;
        if (typeof MediaDevices !== "undefined") MediaDevices.prototype.getUserMedia = fakeGUM;
        // Switch this experiment on, alone, with all the weight on one arm.
        let cfg;
        Object.defineProperty(window, "VT_EXPERIMENTS", {
          configurable: true,
          get: () => cfg,
          set: (v) => {
            if (v && v[key]) {
              v[key].enabled = true;
              v[key].variants = arms.map((id) => ({ id, weight: id === arm ? 1 : 0 }));
            }
            cfg = v;
          }
        });
      },
      { key, arm, arms }
    );
    await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTApp && !!window.VTLoop && !!window.VTDays);
    const run = (ms) => page.clock.runFor(ms);
    // Fifty seconds of singing, jumped over rather than ticked through: the
    // practice time is read from the clock, and running every frame of the
    // pitch loop for a minute takes minutes of real time.
    const practise = async () => {
      await page.clock.fastForward(50000);
      await run(500);
    };
    const click = (sel) => page.evaluate((s) => document.querySelector(s)?.click(), sel);
    await run(1500);
    // A tour that opened itself is closed, the way most first visitors do.
    await page.evaluate(() => {
      if (document.body.classList.contains("tour-active")) window.VTTour?.end?.("dismiss");
    });
    // 1. A Mínimo left without practising.
    await page.evaluate(() => window.VTLoop.startTier("min"));
    await run(400);
    for (let i = 0; i < 2; i += 1) {
      await page.evaluate(() => window.VTApp.advanceStructured("next"));
      await run(300);
    }
    // 2. A Mínimo practised through.
    await page.evaluate(() => window.VTLoop.startTier("min"));
    await run(400);
    for (let i = 0; i < 2; i += 1) {
      await click("#btn-practice-start");
      await practise();
      await page.evaluate(() => window.VTApp.advanceStructured("next"));
      await run(400);
    }
    await click("#loop-done-close");
    // 3. A free exercise, practised and saved with a rating.
    await page.evaluate(() => window.VTApp.openExercise("s4-lip-trills"));
    await run(400);
    await click("#btn-practice-start");
    await practise();
    await click("#btn-complete");
    await run(1500);
    // 4. An exercise whose microphone is refused.
    await page.evaluate(() => {
      window.__vtMicDenied = true;
      window.VTApp.openExercise("s27-lip-trill-solfege");
    });
    await run(400);
    await click("#btn-practice-start");
    await run(1500);
    const out = await page.evaluate((k) => {
      const bag = JSON.parse(localStorage.getItem("vt_analytics_v1") || "{}");
      const counts = {};
      (bag.events || []).forEach((e) => {
        counts[e.name] = (counts[e.name] || 0) + 1;
      });
      return { counts, exposed: window.VTExperiments.report().experiments[k].exposed };
    }, key);
    await ctx.close();
    return out;
  }

  const keys = ["aa_2026_10", "tour_shape_2026_10", "loop_home_2026_10", "loop_surprise_2026_10", "loop_minimo_len_2026_10"];
  for (const key of keys) {
    test(key, async ({ browser }) => {
      test.setTimeout(120000);
      const { EXPERIMENT_PRESETS } = await workerModule("events.js");
      const preset = EXPERIMENT_PRESETS[key];
      expect(preset, `${key} is in the worker registry`).toBeTruthy();
      const metricEvents = [...new Set([preset.primary, ...preset.guardrails].map((m) => m.event))];
      const byArm = {};
      for (const arm of preset.arms) {
        byArm[arm] = await runArm(browser, key, arm, preset.arms);
        // The arm was really served and exposed, or the comparison proves nothing.
        expect(byArm[arm].exposed, `${key}/${arm} exposed`).toBe(arm);
      }
      for (const event of metricEvents) {
        const counts = preset.arms.map((arm) => byArm[arm].counts[event] || 0);
        expect(counts[0], `${key}: ${event} is sent at all`).toBeGreaterThan(0);
        expect(counts, `${key}: ${event} per arm ${preset.arms.join("/")}`).toEqual(counts.map(() => counts[0]));
      }
    });
  }
});

test.describe("The account and trial funnel", () => {
  /** Watch every host the page actually contacts, not only the stubbed one. */
  async function watchHosts(page) {
    const hosts = new Set();
    page.on("request", (r) => {
      try {
        const u = new URL(r.url());
        if (u.origin !== new URL(BASE).origin) hosts.add(u.host);
      } catch {
        /* ignore */
      }
    });
    return hosts;
  }

  test("the only host a first visit contacts is our own worker", async ({ page }) => {
    // The promise that a first visit contacts NO server of ours was retired on
    // 2026-09-24: it made the funnel unmeasurable, and the owner chose the
    // measurement. What replaces it is the part that was always the point — no
    // third party is contacted, by us or on our behalf, before anybody signs in.
    const hosts = await watchHosts(page);
    const sent = await boot(page, { endpoint: ENDPOINT, human: true });
    await page.evaluate(() => window.VTAnalytics.flush());
    await expect.poll(() => sent.bodies.length).toBeGreaterThan(0);
    // Two of ours, and only ours: the stubbed events endpoint, and the worker
    // itself, which js/account.js now asks once the page is quiet so the account
    // panel knows the ways in before anybody opens it. The allowed host is read
    // from the deployment's own config, so a new URL cannot slip through here.
    const ours = await page.evaluate(
      () => window.VT_BILLING_CONFIG?.verification?.apiBaseUrl || ""
    );
    const allowed = new Set(["events.test", new URL(ours).host]);
    await page.waitForTimeout(2600); // the idle probe's own timeout
    for (const host of hosts) expect(allowed.has(host), `${host} is not ours`).toBe(true);
    expect([...hosts], "and the statistics really were sent").toContain("events.test");
  });

  test("opening the account panel reports which state the visitor is looking at", async ({ page }) => {
    const sent = await boot(page, { endpoint: ENDPOINT, human: true });
    await page.click("#btn-account");
    await expect(page.locator("#account-modal")).toBeVisible();
    await page.evaluate(() => window.VTAnalytics.flush());
    const names = () => sent.bodies.filter(Boolean).flatMap((b) => b.events || []);
    await expect.poll(() => names().some((e) => e.name === "account_panel_open")).toBe(true);
    const open = names().filter((e) => e.name === "account_panel_open");
    // Exactly one per open, and it carries accountSignIn()'s own answer. Which
    // answer depends on whether this run's worker is reachable, so assert the
    // vocabulary rather than one value: it is the vocabulary that makes "an
    // extension blocked Google's script" a count instead of a hypothesis.
    expect(open).toHaveLength(1);
    expect([
      "signed_in",
      "not_configured",
      "checking",
      "unreachable",
      "blocked",
      "offered",
      "no_method"
    ]).toContain(open[0].props.state);
  });

  test("the trial offer counts as seen only once it is on screen", async ({ page }) => {
    // Both CTAs are drawn at boot, inside dialogs that are still `hidden`.
    // Counting a view there would count nearly every browser, and because this
    // step sits downstream of signing in the rate would pin near 100% forever.
    const sent = await boot(page, { endpoint: ENDPOINT, human: true });
    const views = () =>
      sent.bodies
        .filter(Boolean)
        .flatMap((b) => b.events || [])
        .filter((e) => e.name === "trial_cta_view");
    await page.evaluate(() => window.VTAnalytics.flush());
    await expect.poll(() => sent.bodies.length).toBeGreaterThan(0);
    expect(views(), "nothing was on screen yet").toEqual([]);

    await page.click("#btn-pricing");
    await expect(page.locator("#pricing-modal")).toBeVisible();
    await expect(page.locator("#btn-start-trial")).toBeVisible();
    await page.evaluate(() => window.VTAnalytics.flush());
    await expect.poll(() => views().length).toBe(1);
    expect(views()[0].props.where).toBe("pricing");

    // And once per page load, not once per render: closing and reopening the
    // dialog re-runs updateBillingChrome().
    await page.click("#pricing-close");
    await page.click("#btn-pricing");
    await expect(page.locator("#pricing-modal")).toBeVisible();
    await page.evaluate(() => window.VTAnalytics.flush());
    await page.waitForTimeout(200);
    expect(views(), "one view per load").toHaveLength(1);
  });

  test("a press that only asks somebody to sign in is its own outcome", async ({ page }) => {
    // The likeliest leak in the funnel, and invisible in the step rates: every
    // branch of the button sends a trial_result, so the rate is ~1 and the whole
    // signal is in this prop.
    const sent = await boot(page, { endpoint: ENDPOINT, human: true });
    await page.click("#btn-pricing");
    await page.click("#btn-start-trial");
    await page.evaluate(() => window.VTAnalytics.flush());
    const of = (name) =>
      sent.bodies
        .filter(Boolean)
        .flatMap((b) => b.events || [])
        .filter((e) => e.name === name);
    await expect.poll(() => of("trial_result").length).toBeGreaterThan(0);
    expect(of("trial_click")).toHaveLength(1);
    expect(of("trial_click")[0].props.where).toBe("pricing");
    const result = of("trial_result")[0];
    expect(typeof result.props.outcome).toBe("string");
    // Whichever branch this deploy takes, it says which layer answered, so a
    // missing prop never has to be read as a meaning.
    expect(["account", "local"]).toContain(result.props.kind);
  });

  test("every funnel event the page can emit is a name the worker accepts", async ({ page }) => {
    // The two halves drift silently otherwise: the browser sends a name, the
    // worker drops it, and the funnel has a hole nobody sees.
    const { EVENT_NAMES } = await workerModule("events.js");
    const FUNNEL = [
      "account_panel_open",
      "signin_start",
      "signin_success",
      "signin_fail",
      "trial_cta_view",
      "trial_click",
      "trial_result",
      "trial_first_practice"
    ];
    for (const name of FUNNEL) expect(EVENT_NAMES.has(name), `${name} missing from EVENT_NAMES`).toBe(true);
    // And the denominator the funnel is read against.
    expect(EVENT_NAMES.has("app_open")).toBe(true);

    // The props must survive the worker's own key and value rules, or they are
    // dropped and the readout loses the only interesting dimension.
    const { EXPERIMENT_PRESETS } = await workerModule("events.js");
    const armEvents = new Set(
      Object.values(EXPERIMENT_PRESETS).flatMap((p) => Object.values(p.armEvents || {}).flat())
    );
    // A metric has to be an event every arm sends through the same code, so none
    // of these may be an arm event: they fire from js/app.js in every arm.
    for (const name of FUNNEL) expect(armEvents.has(name), `${name} is an arm event`).toBe(false);
  });

  test("the funnel events carry only flat ids, which is what the worker keeps", async ({ page }) => {
    const { EVENT_NAMES } = await workerModule("events.js");
    const sent = await boot(page, { endpoint: ENDPOINT, human: true });
    await page.click("#btn-account");
    await expect(page.locator("#account-modal")).toBeVisible();
    await page.evaluate(() => window.VTAnalytics.flush());
    await expect.poll(() => sent.bodies.filter(Boolean).flatMap((b) => b.events || []).length).toBeGreaterThan(0);
    const events = sent.bodies.filter(Boolean).flatMap((b) => b.events || []);
    const KEY = /^[A-Za-z][A-Za-z0-9_]{0,31}$/;
    const VALUE = /^[A-Za-z0-9_.:-]{0,64}$/;
    for (const e of events) {
      expect(EVENT_NAMES.has(e.name), `${e.name} not accepted`).toBe(true);
      for (const [k, v] of Object.entries(e.props || {})) {
        expect(KEY.test(k), `prop key ${k}`).toBe(true);
        if (typeof v === "string") expect(VALUE.test(v), `prop ${k}=${v}`).toBe(true);
      }
      // Nothing that identifies a person. The browser id is a separate field and
      // is random; an email or a name must never ride in props.
      expect(JSON.stringify(e.props || {})).not.toMatch(/@/);
    }
  });
});
