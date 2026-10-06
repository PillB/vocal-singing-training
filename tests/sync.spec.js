/**
 * Saved progress in motion: when this browser pushes to the account, and what
 * it does with what comes back.
 *
 * tests/accounts.spec.js checks a single sync and the merge rules. These follow
 * a signed-in learner through the app instead: a take updated after it was
 * first recorded, a routine finished, a week reviewed, a setting changed, a
 * profile switched while a sync is out. Each one used to change this device
 * and leave the account behind, or mix up whose record was whose.
 *
 * The worker is a fake at the network boundary that keeps one document per
 * profile and refuses a write on a stale revision, like
 * workers/entitlements/src/progress.js. The page runs on a fixed clock so the
 * 8 s quiet period before a push can be stepped over on purpose.
 */
const { test, expect } = require("@playwright/test");
const { patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://entitlements.test";
const NOW = "2026-09-23T10:00:00-05:00";
const TODAY = "2026-09-23";
const EX = "s4-lip-trills";

test.use({ timezoneId: "America/Lima", locale: "es-PE" });

/**
 * The account side: one document and revision per profile.
 * @param {{docs?: object, revs?: object}} [seed] What the account holds already.
 */
function createServer(seed) {
  return {
    docs: { ...((seed && seed.docs) || {}) },
    revs: { ...((seed && seed.revs) || {}) },
    puts: [],
    gets: [],
    // When set, a progress GET waits on this promise before answering.
    holdGet: null
  };
}

/**
 * Point the site at the fake worker.
 * @param {import('@playwright/test').Page} page Page.
 * @param {object} server State from createServer.
 */
async function installWorker(page, server) {
  await patchBillingConfig(page, { verification: { apiBaseUrl: API } });
  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const headers = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "content-type, authorization",
      "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS"
    };
    const json = (status, data) =>
      route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(data) }).catch(() => {});
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers }).catch(() => {});
    if (url.pathname === "/v1/auth/methods") return json(200, { ok: true, email: true, google: false, trialDays: 7 });
    if (url.pathname === "/v1/me") {
      return json(200, {
        ok: true,
        account: { id: "acct_test", email: "pablo@example.test", role: "member", trialUsed: true, createdAt: 1 },
        entitlement: { pro: false, plan: null, status: "free", source: null, periodEnd: null, provider: null },
        grants: [],
        paid: [],
        licenseId: null,
        token: null
      });
    }
    if (url.pathname !== "/v1/me/progress") return json(404, { ok: false, reason: "not_found" });
    if (method === "GET") {
      const profileId = url.searchParams.get("profileId");
      server.gets.push(profileId);
      if (server.holdGet) await server.holdGet;
      return json(200, { ok: true, rev: server.revs[profileId] || 0, doc: server.docs[profileId] || null, updatedAt: 1 });
    }
    let body = {};
    try {
      body = request.postDataJSON() || {};
    } catch {
      body = {};
    }
    const profileId = body.profileId;
    server.puts.push({ profileId, baseRev: body.baseRev, doc: body.doc });
    if (Number(body.baseRev || 0) !== (server.revs[profileId] || 0)) {
      return json(409, { ok: false, reason: "conflict" });
    }
    server.revs[profileId] = (server.revs[profileId] || 0) + 1;
    server.docs[profileId] = body.doc;
    return json(200, { ok: true, rev: server.revs[profileId], updatedAt: 2 });
  });
}

/**
 * Open the site signed in, with `seed` written to localStorage once.
 * @param {import('@playwright/test').Page} page Page.
 * @param {object} server State from createServer.
 * @param {{seed?: object, settle?: boolean}} [opts] Keys to seed; whether to wait for the boot sync.
 */
async function boot(page, server, opts = {}) {
  await installWorker(page, server);
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript(
    ({ seed }) => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", "es");
        sessionStorage.setItem("vt_e2e", "1");
        if (!sessionStorage.getItem("vt_seeded")) {
          sessionStorage.setItem("vt_seeded", "1");
          localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: "singing" }));
          localStorage.setItem("vt_account_session_v1", JSON.stringify({ token: "sess-token-1", expiresAt: 4102444800 }));
          Object.entries(seed || {}).forEach(([k, v]) => localStorage.setItem(k, JSON.stringify(v)));
        }
      } catch {
        /* ignore */
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      async function fakeGUM() {
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
    },
    { seed: opts.seed || null }
  );
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && !!window.VTSync && !!window.VTDays && !!window.VTLoop);
  await page.clock.runFor(500);
  await expect.poll(() => page.evaluate(() => window.VTSync.isAvailable())).toBe(true);
  if (opts.settle === false) return;
  // Signing in schedules a sync; let it land so later pushes are this test's own.
  await page.clock.runFor(9000);
  await expect.poll(() => server.puts.length).toBeGreaterThan(0);
  await expect.poll(() => page.evaluate(() => window.VTSync.getStatus().syncing)).toBe(false);
}

/** Step past the quiet period, then let the network catch up. */
async function passQuietPeriod(page) {
  await page.clock.runFor(9000);
  await page.waitForTimeout(300);
}

/** The learner and somebody else at home. */
const TWO_PROFILES = {
  activeId: "default",
  profiles: {
    default: { id: "default", name: "Default", createdAt: "2026-01-01T00:00:00Z" },
    p_b: { id: "p_b", name: "Ana", createdAt: "2026-01-02T00:00:00Z" }
  }
};

/** The take history the account holds for one exercise. */
function serverTakes(server, profileId = "default", ex = EX) {
  return ((server.docs[profileId]?.progress || {})[ex]?.history || []).map((h) => h.durationSec);
}

test.describe("Saved progress follows the learner", () => {
  test("a take updated after it was first recorded reaches the account", async ({ page }) => {
    const server = createServer();
    await boot(page, server);

    await page.evaluate((id) => window.VTApp.openExercise(id), EX);
    await page.clock.runFor(300);
    await page.locator("#btn-practice-start").click();
    await page.clock.runFor(50000);
    // What the clock running out does: the take is kept without a rating.
    await page.evaluate(() => window.VTApp.recordPracticeIfDue("timer_done"));
    await passQuietPeriod(page);
    await expect.poll(() => serverTakes(server)).toHaveLength(1);
    const first = serverTakes(server)[0];

    // "Otra vez": the same take keeps growing, then the learner leaves unrated.
    await page.clock.runFor(40000);
    await page.evaluate(() => window.VTApp.recordPracticeIfDue("leave"));
    const local = await page.evaluate(
      ({ ex, today }) => ({
        dur: window.VTStorage.getProgress()[ex].history[0].durationSec,
        daySec: window.VTStorage.getDays().days[today].sec
      }),
      { ex: EX, today: TODAY }
    );
    expect(local.dur).toBeGreaterThan(first);

    await passQuietPeriod(page);
    await expect.poll(() => serverTakes(server)).toEqual([local.dur]);
    expect(server.docs.default.days.days[TODAY].sec).toBe(local.daySec);
  });

  test("finishing the day's routine reaches the account", async ({ page }) => {
    test.setTimeout(150000);
    const server = createServer();
    const days = { v: 1, days: { "2026-09-22": { sec: 240, n: 2, ex: [EX] } }, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true };
    await boot(page, server, { seed: { vt_days_v1: days } });

    await page.locator("#btn-next-step").click();
    await page.clock.runFor(500);
    const steps = await page.evaluate(() => window.VTSession.get().order.length);
    for (let i = 0; i < steps - 1; i += 1) {
      await page.locator("#btn-practice-start").click();
      await page.clock.runFor(40000);
      await page.evaluate(() => window.VTApp.advanceStructured("next"));
      await page.clock.runFor(400);
    }
    // The last step runs out; its take is pushed while the learner reads the card.
    const total = await page.evaluate(() => window.VTApp.getState().timer.total);
    const before = server.puts.length;
    await page.locator("#btn-practice-start").click();
    await page.clock.runFor(total * 1000 + 500);
    await passQuietPeriod(page);
    await expect.poll(() => server.puts.length).toBeGreaterThan(before);
    await expect.poll(() => page.evaluate(() => window.VTSync.getStatus().syncing)).toBe(false);

    // Then Next ends the routine: today is marked done and the loop counts it.
    await page.evaluate(() => window.VTApp.advanceStructured("next"));
    await page.clock.runFor(400);
    const local = await page.evaluate((today) => ({
      basics: window.VTStorage.getDays().days[today].basics,
      completions: window.VTStorage.getLoop().completions
    }), TODAY);
    expect(local).toEqual({ basics: 1, completions: 1 });

    await passQuietPeriod(page);
    await expect.poll(() => server.docs.default?.days?.days?.[TODAY]?.basics || 0).toBe(1);
    expect(server.docs.default.loop.completions).toBe(1);
  });

  test("picking, starting and reviewing the week reach the account", async ({ page }) => {
    const server = createServer();
    await boot(page, server);

    await page.locator("#btn-plan").click();
    await page.clock.runFor(300);
    await page.locator("#element-chips .chip:not([hidden])").first().click();
    await page.locator("#btn-plan-start").click();
    await passQuietPeriod(page);
    await expect.poll(() => server.docs.default?.weekPlan?.status).toBe("active");

    // A week later the review opens; "Mejoró" moves the plan on.
    await page.evaluate(() => {
      const plan = window.VTStorage.getWeekPlan();
      plan.startedAt = new Date(Date.now() - 8 * 86400000).toISOString();
      localStorage.setItem("vt_week_plan_v1", JSON.stringify(plan));
    });
    await page.locator("#btn-nav-home").click();
    await page.locator("#btn-plan").click();
    await page.clock.runFor(300);
    await page.locator("#btn-plan-improved").click();
    const local = await page.evaluate(() => ({ week: window.VTStorage.getWeekPlan().weekNumber, reviews: window.VTStorage.getReviews().length }));
    expect(local).toEqual({ week: 2, reviews: 1 });

    await passQuietPeriod(page);
    await expect.poll(() => server.docs.default?.weekPlan?.weekNumber).toBe(2);
    expect(server.docs.default.reviews).toHaveLength(1);
  });

  test("a routine size picked on home and a held note reach the account", async ({ page }) => {
    const server = createServer();
    const days = { v: 1, days: { "2026-09-22": { sec: 240, n: 2, ex: [EX] } }, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true };
    await boot(page, server, { seed: { vt_days_v1: days } });

    await page.locator('#loop-tiers [data-tier="ess"]').click();
    // What both hold tools call when a held note ends.
    await page.evaluate(() => window.VTStorage.addHoldLog(9.4));
    await passQuietPeriod(page);
    await expect.poll(() => server.docs.default?.loop?.tier).toBe("ess");
    expect(server.docs.default.holdLogs.map((h) => h.seconds)).toEqual([9.4]);
  });

  test("switching profile while a sync is out keeps each record its own", async ({ page }) => {
    const takeOf = (id, at) => ({ completedCount: 1, lastScore: 5, lastAt: at, history: [{ id, at, metrics: {}, score: 5, notes: "", durationSec: 60 }] });
    const server = createServer();
    await boot(page, server, {
      settle: false,
      seed: {
        vt_profiles_v1: TWO_PROFILES,
        vt_progress_v1: { "v1-diction": takeOf("take-of-A", "2026-09-20T10:00:00Z") },
        "vt_prof_p_b_vt_progress_v1": { "v2-volume": takeOf("take-of-B", "2026-09-21T10:00:00Z") }
      }
    });

    let release;
    server.holdGet = new Promise((resolve) => (release = resolve));
    await page.locator("#btn-history").click();
    await page.clock.runFor(300);
    const sync = page.evaluate(() => window.VTSync.syncNow());
    await expect.poll(() => server.gets.length).toBeGreaterThan(0);
    // The learner hands the phone over while the read is still out.
    await page.locator("#sel-profile").selectOption("p_b");
    server.holdGet = null;
    release();
    await sync;
    await passQuietPeriod(page);

    const local = await page.evaluate(() => {
      const read = (k) => Object.keys(JSON.parse(localStorage.getItem(k) || "{}"));
      return { a: read("vt_progress_v1"), b: read("vt_prof_p_b_vt_progress_v1") };
    });
    expect(local).toEqual({ a: ["v1-diction"], b: ["v2-volume"] });
    expect(Object.keys(server.docs.default.progress)).toEqual(["v1-diction"]);
    if (server.docs.p_b) expect(Object.keys(server.docs.p_b.progress)).toEqual(["v2-volume"]);
  });

  test("a change made just before switching profile is pushed for its owner", async ({ page }) => {
    const server = createServer();
    await boot(page, server, { seed: { vt_profiles_v1: TWO_PROFILES } });

    await page.evaluate(() => window.VTStorage.addHoldLog(7));
    await page.locator("#btn-history").click();
    await page.locator("#sel-profile").selectOption("p_b");
    await passQuietPeriod(page);
    await expect.poll(() => server.docs.default?.holdLogs?.length || 0).toBe(1);
    expect(server.docs.p_b?.holdLogs || []).toEqual([]);
  });
});
