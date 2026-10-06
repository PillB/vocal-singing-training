/**
 * Saved progress in motion: when this browser pushes to the account, and what
 * it does with what comes back.
 *
 * tests/accounts.spec.js checks a single sync and the merge rules. These follow
 * a signed-in learner through the app instead: a take updated after it was
 * first recorded, a routine finished, a week reviewed, a setting changed, the
 * tab hidden or closed, a connection that drops or a worker slow to answer, a
 * profile switched while a sync is out, a new device signing in. Each one used
 * to change this device and leave the account behind, mix up whose record was
 * whose, let a default overwrite somebody's choice, or leave the screen showing
 * the old record.
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
    // "abort" drops every progress request as a dead connection would;
    // "put" answers every write with a server error.
    fail: null,
    // When set, a progress GET waits on this promise before answering.
    holdGet: null,
    // When set, a progress PUT waits on this promise before answering, as a
    // slow database round trip does.
    holdPut: null,
    // Profiles whose writes the worker turns down, with the reason it gives
    // (a fourth profile is "profile_limit").
    refuse: {}
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
    if (server.fail === "abort") return route.abort("internetdisconnected").catch(() => {});
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
    if (server.holdPut) await server.holdPut;
    if (server.fail === "put") return json(500, { ok: false, reason: "internal" });
    if (server.refuse[profileId]) return json(400, { ok: false, reason: server.refuse[profileId] });
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
      // Fetch options are not visible to page.route; note the keepalive flag.
      const realFetch = window.fetch;
      window.__progressFetches = [];
      window.fetch = function (input, init) {
        if (String(input).includes("/v1/me/progress")) {
          window.__progressFetches.push({ method: (init && init.method) || "GET", keepalive: !!(init && init.keepalive) });
        }
        return realFetch.apply(this, arguments);
      };
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

/** An account whose plan has an element picked on the phone, not started yet. */
function pickedOnPhone() {
  return createServer({
    revs: { default: 3 },
    docs: {
      default: {
        v: 1,
        profileId: "default",
        savedAt: "2026-09-20T10:00:00.000Z",
        progress: {},
        weekPlan: { weekNumber: 1, element: "Volume", status: "idle", startedAt: null, checkIns: [], reviews: [], completedElements: [] }
      }
    }
  });
}

/**
 * Save a held note and let its push go out, held at the worker.
 * @param {import('@playwright/test').Page} page Page.
 * @param {object} server State from createServer.
 * @returns {Promise<function>} Lets the push answer.
 */
async function holdNoteWithPushOut(page, server) {
  let release;
  server.holdPut = new Promise((resolve) => (release = resolve));
  const before = server.puts.length;
  await page.evaluate(() => window.VTStorage.addHoldLog(1));
  await page.clock.runFor(9000);
  await expect.poll(() => server.puts.length).toBeGreaterThan(before);
  return () => {
    server.holdPut = null;
    release();
  };
}

/** The held notes the account holds, newest first. */
function serverHolds(server, profileId = "default") {
  return (server.docs[profileId]?.holdLogs || []).map((h) => h.seconds);
}

/** The take history the account holds for one exercise. */
function serverTakes(server, profileId = "default", ex = EX) {
  return ((server.docs[profileId]?.progress || {})[ex]?.history || []).map((h) => h.durationSec);
}

test.describe("Saved progress follows the learner", () => {
  test("a take updated after it was first recorded reaches the account", async ({ page }) => {
    // Ninety seconds of live practice on the page clock: on a busy machine
    // that alone can pass the default minute.
    test.setTimeout(150000);
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

  test("a take kept as the tab is hidden is pushed while the page is still there", async ({ page }) => {
    const server = createServer();
    await boot(page, server);

    await page.evaluate((id) => window.VTApp.openExercise(id), EX);
    await page.clock.runFor(300);
    await page.locator("#btn-practice-start").click();
    await page.clock.runFor(50000);
    const before = server.puts.length;
    // A phone locking: the page is hidden, then frozen. No quiet period passes.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    await expect.poll(() => server.puts.length, { timeout: 4000 }).toBeGreaterThan(before);
    await expect.poll(() => serverTakes(server)).toHaveLength(1);
  });

  test("closing the tab sends what is not on the account yet", async ({ page }) => {
    const server = createServer();
    await boot(page, server);
    const rev = server.revs.default;
    const reads = server.gets.length;

    await page.evaluate((id) => window.VTApp.openExercise(id), EX);
    await page.clock.runFor(300);
    await page.locator("#btn-practice-start").click();
    await page.clock.runFor(50000);
    // The tab closing. (A real close cannot be watched from here: Playwright
    // stops routing a page's requests once it is gone.)
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));

    // One request the browser finishes on its own, on top of the revision this
    // page last wrote: there is no time to read first.
    await expect.poll(() => serverTakes(server), { timeout: 4000 }).toHaveLength(1);
    expect(server.gets.length).toBe(reads);
    expect(server.puts[server.puts.length - 1].baseRev).toBe(rev);
    expect(await page.evaluate(() => window.__progressFetches.filter((f) => f.method === "PUT" && f.keepalive).length)).toBe(1);
  });

  test("closing the tab after this device's progress was cleared keeps the account's takes", async ({ page }) => {
    const take = { completedCount: 1, lastScore: 5, lastAt: "2026-09-20T10:00:00Z", history: [{ id: "t1", at: "2026-09-20T10:00:00Z", metrics: {}, score: 5, notes: "", durationSec: 60 }] };
    const server = createServer();
    await boot(page, server, { seed: { vt_progress_v1: { "v1-diction": take } } });
    expect(Object.keys(server.docs.default.progress)).toEqual(["v1-diction"]);

    // What "Borrar progreso local" in the admin panel does, then a held note,
    // then the tab closes before the quiet period is up.
    await page.evaluate(() => {
      localStorage.removeItem("vt_progress_v1");
      window.VTStorage.addHoldLog(3);
    });
    await page.evaluate(() => window.dispatchEvent(new PageTransitionEvent("pagehide", { persisted: false })));
    await expect.poll(() => serverHolds(server), { timeout: 4000 }).toEqual([3]);
    expect(Object.keys(server.docs.default.progress)).toEqual(["v1-diction"]);
  });

  test("a change saved while a slow push is out follows it up", async ({ page }) => {
    const server = createServer();
    await boot(page, server);

    const answer = await holdNoteWithPushOut(page, server);
    // Another note while that write waits on the database, which stays slow
    // past the new note's own quiet period.
    await page.evaluate(() => window.VTStorage.addHoldLog(2));
    await page.clock.runFor(9000);
    answer();
    await expect.poll(() => serverHolds(server), { timeout: 4000 }).toEqual([2, 1]);
  });

  test("a change saved while a push is out goes up when the tab is hidden", async ({ page }) => {
    const server = createServer();
    await boot(page, server);

    const answer = await holdNoteWithPushOut(page, server);
    await page.evaluate(() => window.VTStorage.addHoldLog(2));
    // The phone locks before the quiet period is up; the first write lands after.
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
      document.dispatchEvent(new Event("visibilitychange"));
    });
    answer();
    await expect.poll(() => serverHolds(server), { timeout: 4000 }).toEqual([2, 1]);
  });

  test("a sync that fails says so, and is tried again", async ({ page }) => {
    const server = createServer();
    await boot(page, server);

    server.fail = "abort";
    await page.evaluate(() => window.VTStorage.addHoldLog(5));
    await passQuietPeriod(page);
    await expect.poll(() => page.evaluate(() => window.VTSync.getStatus().lastError)).toBe("offline");
    await page.evaluate(() => window.VTApp.openAccount());
    await expect(page.locator("#account-sync")).toHaveText("No se pudo guardar. Lo intentaremos de nuevo.");
    await page.evaluate(() => window.VTApp.closeAccount());

    // The connection comes back without a word; the retry finds it.
    server.fail = null;
    await page.clock.runFor(31000);
    await page.waitForTimeout(300);
    await expect.poll(() => server.docs.default?.holdLogs?.length || 0).toBe(1);
    await expect.poll(() => page.evaluate(() => window.VTSync.getStatus().lastError)).toBe(null);
  });

  test("a write the worker refused is tried again, as the panel promises", async ({ page }) => {
    const server = createServer();
    await boot(page, server);
    const rev = server.revs.default;

    server.fail = "put";
    await page.evaluate(() => window.VTApp.openAccount());
    await page.locator("#btn-account-sync").click();
    await expect(page.locator("#account-sync")).toHaveText("No se pudo guardar. Lo intentaremos de nuevo.");

    server.fail = null;
    await page.clock.runFor(31000);
    await page.waitForTimeout(300);
    await expect.poll(() => server.revs.default).toBe(rev + 1);
    await expect(page.locator("#account-sync")).toHaveText("Progreso guardado en tu cuenta.");
  });

  test("a read the worker never answers gives up, and is tried again", async ({ page }) => {
    const server = createServer();
    await boot(page, server);

    let release;
    server.holdGet = new Promise((resolve) => (release = resolve));
    const reads = server.gets.length;
    await page.evaluate(() => window.VTStorage.addHoldLog(5));
    await page.clock.runFor(9000);
    await expect.poll(() => server.gets.length).toBeGreaterThan(reads);
    // Longer than any database round trip: the read is given up as a dropped
    // connection, rather than holding up every sync after it.
    await page.clock.runFor(46000);
    await expect.poll(() => page.evaluate(() => window.VTSync.getStatus().lastError)).toBe("offline");
    expect(await page.evaluate(() => window.VTSync.getStatus().syncing)).toBe(false);

    server.holdGet = null;
    release();
    await page.clock.runFor(31000);
    await page.waitForTimeout(300);
    await expect.poll(() => serverHolds(server)).toEqual([5]);
  });

  test("the connection coming back starts a sync", async ({ page }) => {
    const server = createServer();
    await boot(page, server);

    server.fail = "abort";
    await page.evaluate(() => window.VTStorage.addHoldLog(5));
    await passQuietPeriod(page);
    await expect.poll(() => page.evaluate(() => window.VTSync.getStatus().lastError)).toBe("offline");

    server.fail = null;
    await page.evaluate(() => window.dispatchEvent(new Event("online")));
    await passQuietPeriod(page);
    await expect.poll(() => server.docs.default?.holdLogs?.length || 0).toBe(1);
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

  test("a profile the account turns down holds up no other, and is not tried again on a timer", async ({ page }) => {
    const server = createServer();
    // The account already keeps three other profiles: this one is a fourth.
    server.refuse.p_b = "profile_limit";
    await boot(page, server, { seed: { vt_profiles_v1: TWO_PROFILES } });

    await page.evaluate(() => window.VTStorage.addHoldLog(7));
    await page.locator("#btn-history").click();
    await page.locator("#sel-profile").selectOption("p_b");
    await passQuietPeriod(page);
    await expect.poll(() => server.puts.filter((p) => p.profileId === "p_b").length).toBeGreaterThan(0);
    await expect.poll(() => serverHolds(server)).toEqual([7]);
    await expect.poll(() => page.evaluate(() => window.VTSync.getStatus().lastError)).toBe("refused");

    // Asking again would get the same answer: no retry comes round for it.
    const refused = server.puts.filter((p) => p.profileId === "p_b").length;
    await page.clock.runFor(130000);
    await page.waitForTimeout(300);
    expect(server.puts.filter((p) => p.profileId === "p_b").length).toBe(refused);
  });

  test("a profile deleted while a sync is out is not synced, and leaves nothing behind", async ({ page }) => {
    const server = createServer();
    await boot(page, server, { seed: { vt_profiles_v1: TWO_PROFILES } });
    const leftOf = (id) => page.evaluate((id) => Object.keys(localStorage).filter((k) => k.startsWith(`vt_prof_${id}_`)), id);

    // A held note for each profile, both waiting on the same sync.
    await page.evaluate(() => {
      window.VTStorage.setActiveProfile("p_b");
      window.VTStorage.addHoldLog(4);
      window.VTStorage.setActiveProfile("default");
      window.VTStorage.addHoldLog(1);
    });
    let release;
    server.holdGet = new Promise((resolve) => (release = resolve));
    const reads = server.gets.length;
    await page.clock.runFor(9000);
    await expect.poll(() => server.gets.length).toBeGreaterThan(reads);
    // Ana's profile is deleted while the learner's own read is still out.
    await page.evaluate(() => window.VTStorage.deleteProfile("p_b"));
    expect(await leftOf("p_b")).toEqual([]);
    server.holdGet = null;
    release();
    await expect.poll(() => serverHolds(server)).toEqual([1]);
    await passQuietPeriod(page);

    expect(server.gets).not.toContain("p_b");
    expect(server.docs.p_b).toBeUndefined();
    expect(await leftOf("p_b")).toEqual([]);

    // Deleted while its own read is out: what comes back is not written for it.
    const p3 = await page.evaluate(() => {
      const made = window.VTStorage.createProfile("Luis");
      window.VTStorage.setActiveProfile("default");
      return made.id;
    });
    server.holdGet = new Promise((resolve) => (release = resolve));
    const sync = page.evaluate((id) => window.VTSync.syncNow(id), p3);
    await expect.poll(() => server.gets).toContain(p3);
    await page.evaluate((id) => window.VTStorage.deleteProfile(id), p3);
    server.holdGet = null;
    release();
    expect(await sync).toEqual({ ok: false, reason: "deleted" });
    expect(server.docs[p3]).toBeUndefined();
    expect(await leftOf(p3)).toEqual([]);
  });

  test("a goal set on another device comes down, and a default never goes up over it", async ({ page }) => {
    const server = createServer({
      revs: { default: 3 },
      docs: {
        default: {
          v: 1,
          profileId: "default",
          savedAt: "2026-09-20T10:00:00.000Z",
          progress: {},
          goals: { weeklySessionsTarget: 6, weekKey: null, updatedAt: "2026-09-20T09:00:00.000Z" },
          loop: { v: 1, seed: "phone", tier: "ess", tierAt: "2026-09-20T09:00:00.000Z", goal: "5-7", goalAt: "2026-09-20T09:00:00.000Z", ms: [], cards: {}, surprises: [], since: 0, comebacks: [], completions: 0 }
        }
      }
    });
    // A new device: it has drawn home (writing its own defaults) and never chose anything.
    await boot(page, server);

    expect(server.docs.default.goals.weeklySessionsTarget).toBe(6);
    expect(server.docs.default.loop.goal).toBe("5-7");
    expect(server.docs.default.loop.tier).toBe("ess");
    const local = await page.evaluate(() => ({
      goals: window.VTStorage.getGoals().weeklySessionsTarget,
      loopGoal: window.VTLoop.readLoop().goal,
      tier: window.VTLoop.readLoop().tier
    }));
    expect(local).toEqual({ goals: 6, loopGoal: "5-7", tier: "ess" });
  });

  test("goals chosen before they carried a time are kept over another device's defaults", async ({ page }) => {
    // Older builds pushed every device's goals, untouched defaults included,
    // so the account holds those of a device where nobody chose anything.
    const server = createServer({
      revs: { default: 3 },
      docs: {
        default: {
          v: 1,
          profileId: "default",
          savedAt: "2026-09-20T10:00:00.000Z",
          progress: {},
          goals: { weeklySessionsTarget: 3, weekKey: null },
          loop: { v: 1, seed: "phone", tier: null, goal: "3-5", ms: [], cards: {}, surprises: [], since: 0, comebacks: [], completions: 0 }
        }
      }
    });
    // This device is where the learner chose, before choices carried a time.
    await boot(page, server, {
      seed: {
        vt_goals_v1: { weeklySessionsTarget: 5, weekKey: null },
        vt_loop_v1: { v: 1, seed: "laptop", tier: "ess", goal: "5-7", ms: [], cards: {}, surprises: [], since: 0, comebacks: [], completions: 2 }
      }
    });

    expect(server.docs.default.goals.weeklySessionsTarget).toBe(5);
    expect(server.docs.default.loop.goal).toBe("5-7");
    const local = await page.evaluate(() => ({
      goals: window.VTStorage.getGoals().weeklySessionsTarget,
      loopGoal: window.VTLoop.readLoop().goal
    }));
    expect(local).toEqual({ goals: 5, loopGoal: "5-7" });
  });

  test("a week picked on another device is not undone by a new device's untouched plan", async ({ page }) => {
    const server = pickedOnPhone();
    // A new device: the plan on it is the one every profile starts with.
    await boot(page, server);

    expect(server.docs.default.weekPlan.element).toBe("Volume");
    expect(await page.evaluate(() => window.VTStorage.getWeekPlan().element)).toBe("Volume");
  });

  test("picking another element after the account's came down keeps the new pick", async ({ page }) => {
    const server = pickedOnPhone();
    await boot(page, server);

    await page.locator("#btn-plan").click();
    await page.clock.runFor(300);
    await page.locator("#element-chips .chip:not([hidden]):not(.selected)").first().click();
    const picked = await page.evaluate(() => window.VTStorage.getWeekPlan().element);
    expect(picked).not.toBe("Volume");

    await passQuietPeriod(page);
    await expect.poll(() => server.docs.default.weekPlan.element).toBe(picked);
    expect(await page.evaluate(() => window.VTStorage.getWeekPlan().element)).toBe(picked);
  });

  test("a sync that brings another device's practice redraws Historial", async ({ page }) => {
    const server = createServer({
      revs: { default: 2 },
      docs: {
        default: {
          v: 1,
          profileId: "default",
          progress: {
            "v1-diction": {
              completedCount: 4,
              lastScore: 80,
              lastAt: "2026-09-22T10:00:00.000Z",
              history: [{ id: "phone-take", at: "2026-09-22T10:00:00.000Z", metrics: {}, score: 80, notes: "", durationSec: 60 }]
            }
          },
          days: { v: 1, days: { "2026-09-22": { sec: 60, n: 1, ex: ["v1-diction"] } }, rest: { bank: 0, earnedAt: 0, used: [] }, backfilled: true }
        }
      }
    });
    await boot(page, server, { settle: false });
    await page.locator("#btn-history").click();
    await page.clock.runFor(300);
    await expect(page.locator("#history-list")).toContainText("Aún no has guardado ninguna sesión");

    // The sync signing in asked for lands while Historial is open.
    await passQuietPeriod(page);
    await expect.poll(() => server.puts.length).toBeGreaterThan(0);
    await expect(page.locator("#history-list")).not.toContainText("Aún no has guardado ninguna sesión");
    await expect(page.locator("#vp-sessions")).toHaveText("4");
    expect(await page.evaluate(() => window.VTApp.getState().view)).toBe("history");

    // A sync with nothing new leaves the list alone rather than flashing it.
    await page.evaluate(() => {
      window.__listRedraws = 0;
      new MutationObserver(() => (window.__listRedraws += 1)).observe(document.querySelector("#history-list"), { childList: true });
    });
    expect((await page.evaluate(() => window.VTSync.syncNow())).ok).toBe(true);
    expect(await page.evaluate(() => window.__listRedraws)).toBe(0);
  });

  test("a sync landing mid-exercise leaves the learner in the exercise", async ({ page }) => {
    const server = createServer({
      revs: { default: 2 },
      docs: { default: { v: 1, profileId: "default", progress: { "v1-diction": { completedCount: 4, lastScore: 80, lastAt: "2026-09-22T10:00:00.000Z", history: [] } } } }
    });
    await boot(page, server, { settle: false });
    await page.evaluate((id) => window.VTApp.openExercise(id), EX);
    await page.clock.runFor(300);

    await passQuietPeriod(page);
    await expect.poll(() => server.puts.length).toBeGreaterThan(0);
    await expect.poll(() => page.evaluate(() => window.VTStorage.getProgress()["v1-diction"]?.completedCount)).toBe(4);
    expect(await page.evaluate(() => window.VTApp.getState().view)).toBe("exercise");
  });
});
