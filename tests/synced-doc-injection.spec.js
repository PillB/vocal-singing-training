/**
 * CXSS-1 and CXSS-4 (red team, Nov 2026). The account's progress document is
 * data a stranger can write: a stolen session, a shared computer whose
 * unowned practice is merged into the next account to sign in, or any script
 * on the shared pillb.github.io origin writing localStorage. Three of its
 * fields reached innerHTML unescaped (the catalogue card's session count, the
 * exercise screen's hold pills, the 12-week plan's HUD), and under the shipped
 * CSP an injected <meta http-equiv="refresh"> still moved every device on the
 * account to an attacker's page on every visit: the CSP stops scripts, not
 * navigation (navigate-to never shipped).
 *
 * Every test here runs under the page's real CSP (no bypassCSP), puts hostile
 * data in at a boundary the app does not control (localStorage, or the worker
 * answering GET /v1/me/progress), lets the app's own views render it, and
 * asserts that no element was created from it and the page never left the
 * site. Each also holds a positive control from the same data, so a view that
 * never rendered cannot pass.
 *
 * This replaces the "guide list escapes HTML" test in redteam-client.spec.js,
 * which wrote host.innerHTML itself with its own copy of escapeHtml and so
 * passed on an app.js whose renderer escaped nothing (CXSS-4).
 */
const { test, expect } = require("@playwright/test");
const { openExercise } = require("./helpers/e2e");
const { enableQaPro } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const WORKER = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev";
const AT = "2026-11-17T10:00:00.000Z";
const OLDER = "2026-11-16T10:00:00.000Z";

/** A marker element: if one of these is ever in the DOM, a field was parsed as HTML. */
const M = (field) => `<b class="vtmk" data-f="${field}">${field}</b>`;
/** What an attacker would actually store: a navigation the CSP cannot stop, then a marker. */
const REFRESH = (field) => `<meta http-equiv="refresh" content="0;url=https://evil.example/${field}">${M(field)}`;

/**
 * Seed localStorage on every load, and watch for any marker the page ever
 * inserts (a MutationObserver, so a marker removed again by a re-render is
 * still seen).
 */
async function seed(page, items) {
  await page.addInitScript((kv) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      sessionStorage.setItem("vt_e2e", "1");
      for (const [k, v] of Object.entries(kv)) localStorage.setItem(k, JSON.stringify(v));
    } catch {
      /* the assertions below fail if the seed did not land */
    }
    window.__vtmk = new Set();
    new MutationObserver(() => {
      document.querySelectorAll(".vtmk, body meta").forEach((el) => window.__vtmk.add(el.dataset.f || el.outerHTML.slice(0, 80)));
    }).observe(document, { subtree: true, childList: true });
  }, items);
}

/** Every field that ever became an element, and where the page is now. */
async function injected(page) {
  return page.evaluate(() => [...(window.__vtmk || [])].sort());
}

/** Off-site main-frame navigations, recorded as they happen. */
function watchNavigations(page) {
  const off = [];
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame() && !frame.url().startsWith(BASE)) off.push(frame.url());
  });
  return off;
}

async function home(page) {
  await page.goto(BASE + "/?t=" + Date.now(), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.setTab && !!window.VTStorage, null, { timeout: 15000 });
}

async function singingCatalogue(page) {
  await page.evaluate(() => window.VTApp.setTab("singing"));
  await expect(page.locator('#exercise-list .card-ex[data-id="s4-lip-trills"]')).toHaveCount(1);
}

test.describe("CXSS-1: the synced progress document renders as text", () => {
  test("IJ1 the catalogue card's session count is a number, not markup", async ({ page }) => {
    await seed(page, {
      vt_progress_v1: {
        "s4-lip-trills": { completedCount: M("progress.completedCount"), history: [], lastScore: null, lastAt: AT },
        // Positive control: a real count on the same tab still shows its badge
        "s9-pitch-match": { completedCount: 3, history: [], lastScore: null, lastAt: AT },
        // A number only in name: Number("1e400") is Infinity, which is no count either
        "s1-vocal-fry": { completedCount: "1e400", history: [], lastScore: null, lastAt: AT }
      }
    });
    await home(page);
    await singingCatalogue(page);
    expect(await injected(page), "no field of the document became an element").toEqual([]);
    const card = (id) => page.locator(`#exercise-list .card-ex[data-id="${id}"]`);
    await expect(card("s9-pitch-match").locator(".badge.done"), "control: a real count is shown").toContainText("3");
    // Not a number: no sessions to count, so no badge, and none of the markup as text either
    await expect(card("s4-lip-trills").locator(".badge.done")).toHaveCount(0);
    await expect(card("s4-lip-trills")).not.toContainText("vtmk");
    await expect(card("s1-vocal-fry").locator(".badge.done")).toHaveCount(0);
  });

  test("IJ2 the exercise screen's hold pills show seconds, and drop a value that is not a number", async ({ page }) => {
    await seed(page, {
      vt_hold_logs_v1: [
        { seconds: M("holdLogs.seconds"), at: AT },
        // Positive control: a real hold, older, still listed
        { seconds: 2.5, at: OLDER }
      ]
    });
    await home(page);
    await openExercise(page, "s4-lip-trills");
    const pills = page.locator("#hold-history .pill");
    await expect(pills, "control: the stored hold is listed").toHaveText(["2.5s"]);
    expect(await injected(page)).toEqual([]);
  });

  test("IJ3 the 12-week plan's HUD shows a stored focus as text", async ({ page }) => {
    const plan = (element) => ({
      weekNumber: 3,
      status: "active",
      element,
      startedAt: AT,
      updatedAt: AT,
      completedElements: [],
      checkIns: [],
      reviews: []
    });
    await seed(page, { vt_week_plan_v1: plan(M("weekPlan.element")) });
    await home(page);
    await openExercise(page, "v9-12-week");
    const head = page.locator("[data-week-head]");
    await expect(head, "control: the HUD drew its head").toContainText("Semana 3");
    // The stored string reaches the head, as the characters it holds
    await expect(head).toContainText('<b class="vtmk" data-f="weekPlan.element">');
    expect(await injected(page)).toEqual([]);

    // Positive control: a focus from the plan's own list is shown in the learner's language
    await page.evaluate((p) => window.VTStorage.setWeekPlan(p), plan("Diction"));
    await openExercise(page, "v1-diction");
    await openExercise(page, "v9-12-week");
    await expect(page.locator("[data-week-head]")).toContainText("Semana 3 · Dicción");
  });

  test("IJ4 every synced field, with Pro's panels drawn, creates no element in any view", async ({ page }) => {
    // Pro's own reading (insights, coach focus, sparkline, hold trend) reads the
    // same document and was never rendered by the red team's sweep (free user).
    await enableQaPro(page);
    await seed(page, {
      vt_progress_v1: {
        "s4-lip-trills": {
          completedCount: M("progress.completedCount"),
          lastScore: M("progress.lastScore"),
          lastAt: AT,
          history: [
            {
              id: "h1",
              at: AT,
              day: M("progress.history.day"),
              metrics: { pitch: M("progress.history.metrics") },
              score: M("progress.history.score"),
              notes: M("progress.history.notes"),
              durationSec: M("progress.history.durationSec")
            }
          ]
        },
        "v1-diction": {
          completedCount: 2,
          lastScore: 4,
          lastAt: AT,
          history: [{ id: "h2", at: AT, day: AT.slice(0, 10), metrics: { clarity: 2 }, score: 4, notes: M("progress.history.notes2"), durationSec: 60 }]
        }
      },
      vt_week_plan_v1: {
        weekNumber: 3,
        status: "active",
        element: M("weekPlan.element"),
        startedAt: AT,
        updatedAt: AT,
        completedElements: [M("weekPlan.completedElements")],
        checkIns: [M("weekPlan.checkIns")],
        reviews: [{ week: M("weekPlan.reviews.week"), element: M("weekPlan.reviews.element"), verdict: M("weekPlan.reviews.verdict"), notes: M("weekPlan.reviews.notes"), at: AT }]
      },
      vt_reviews_v1: [{ week: M("reviews.week"), element: M("reviews.element"), verdict: M("reviews.verdict"), notes: M("reviews.notes"), at: AT }],
      vt_hold_logs_v1: [{ seconds: M("holdLogs.seconds"), at: AT }, { seconds: 6.5, at: OLDER }],
      vt_goals_v1: { weeklySessionsTarget: M("goals.weeklySessionsTarget"), updatedAt: AT },
      vt_achievements_v1: { [M("achievements.key")]: true },
      vt_days_v1: {
        v: 1,
        days: { [AT.slice(0, 10)]: { sec: M("days.sec"), n: M("days.n"), ex: [M("days.ex")], basics: M("days.basics"), len: M("days.len"), track: M("days.track") } },
        rest: { bank: M("days.rest.bank"), earnedAt: 0, used: [] }
      },
      vt_loop_v1: {
        v: 1,
        seed: 1,
        tier: M("loop.tier"),
        goal: M("loop.goal"),
        ms: [M("loop.ms")],
        cards: { [M("loop.cards.key")]: AT },
        surprises: [{ day: AT.slice(0, 10), kind: "stat", id: M("loop.surprises.id") }],
        since: 0,
        comebacks: [],
        completions: 1
      }
    });
    await home(page);
    await page.evaluate(() => window.VTBilling.activateDemo("pro_monthly"));
    await page.evaluate(() => window.VTApp.renderValuePulse());
    for (const tab of ["vocal", "singing"]) await page.evaluate((t) => window.VTApp.setTab(t), tab);
    await page.click("#btn-plan");
    await expect(page.locator("#view-plan")).toHaveClass(/active/);
    await page.click("#btn-history");
    await expect(page.locator("#view-history #value-pulse")).toBeVisible();
    // Control: Pro's panels were drawn from this document, not left locked
    await expect(page.locator("#pro-coach-focus")).not.toBeEmpty();
    await expect(page.locator("#pro-hold-trend")).toContainText("6.5s");
    await expect(page.locator("#pro-spark")).toBeVisible();
    for (const id of ["s4-lip-trills", "v1-diction", "v9-12-week"]) await openExercise(page, id);
    expect(await injected(page), "fields that became elements").toEqual([]);
  });
});

test.describe("CXSS-1: a hostile account document arriving through sign-in sync", () => {
  test("IJ5 a meta refresh in the worker's copy does not move the page off the site", async ({ page }) => {
    const off = watchNavigations(page);
    await page.route("https://evil.example/**", (route) => route.fulfill({ status: 200, contentType: "text/html", body: "<title>attacker</title>" }));
    const remote = {
      v: 1,
      profileId: "default",
      savedAt: AT,
      progress: {
        // An exercise this browser never practised: a merge takes the account's row as it is
        "s4-lip-trills": { completedCount: REFRESH("cc"), history: [], lastScore: null, lastAt: AT },
        // Positive control: an honest row from the same document reaches the catalogue
        "v1-diction": { completedCount: 2, history: [], lastScore: null, lastAt: AT }
      },
      weekPlan: { weekNumber: 12, status: "active", element: REFRESH("plan"), startedAt: AT, updatedAt: AT, completedElements: [], checkIns: [], reviews: [] },
      reviews: [],
      holdLogs: [{ seconds: REFRESH("hold"), at: AT }],
      goals: null,
      achievements: {},
      days: null,
      loop: null
    };
    let gets = 0;
    await page.route(`${WORKER}/**`, async (route) => {
      const req = route.request();
      const path = new URL(req.url()).pathname;
      const headers = {
        "access-control-allow-origin": req.headers()["origin"] || "*",
        "access-control-allow-headers": "content-type, authorization",
        "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
        vary: "Origin"
      };
      const json = (status, body) => route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(body) });
      if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers });
      if (path === "/v1/auth/methods") return json(200, { ok: true, email: true, google: false, trialDays: 7 });
      if (path === "/v1/me") {
        return json(200, {
          ok: true,
          account: { id: "acct_x", email: "learner@example.test", role: "member", trialUsed: true, createdAt: 1 },
          entitlement: { pro: false, plan: null, status: "free", source: null, periodEnd: null, provider: null },
          grants: [],
          paid: [],
          licenseId: null,
          token: null
        });
      }
      if (path === "/v1/me/progress" && req.method() === "GET") {
        gets += 1;
        return json(200, { ok: true, rev: 3, doc: remote, updatedAt: 1 });
      }
      if (path === "/v1/me/progress") return json(200, { ok: true, rev: 4, updatedAt: 2 });
      return json(404, { ok: false, reason: "not_found" });
    });
    await seed(page, { vt_account_session_v1: { token: "sess-token-1", expiresAt: 4102444800 } });
    await home(page);
    await page.waitForFunction(() => !!window.VTSync?.isAvailable?.(), null, { timeout: 15000 });
    // The sync a sign-in asks for, now rather than after its quiet period
    const result = await page.evaluate(() => window.VTSync.syncNow());
    expect(result.ok, "control: the account's copy was read and merged").toBe(true);
    expect(gets).toBeGreaterThan(0);

    // The next visit: the merged document is now this browser's own
    await home(page);
    await page.evaluate(() => window.VTApp.setTab("vocal"));
    await expect(
      page.locator('#exercise-list .card-ex[data-id="v1-diction"] .badge.done'),
      "control: the account's honest row reached the catalogue"
    ).toContainText("2");
    await singingCatalogue(page);
    await openExercise(page, "s4-lip-trills");
    await openExercise(page, "v9-12-week");
    // A refresh fires on the next task; give one a moment to show itself, then read
    // both where the page is and what it ever inserted.
    await page.waitForTimeout(800);
    expect(off, "main-frame navigations off the site").toEqual([]);
    expect(page.url().startsWith(BASE)).toBe(true);
    expect(await injected(page)).toEqual([]);
  });
});
