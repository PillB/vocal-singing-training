/**
 * The two designs of the site and the control that picks between them
 * (js/site-version.js, js/site-layout.js, css/site-version.css).
 *
 * Each test names the wrong behaviour it exists to catch. The worker is
 * stubbed at the network boundary, so what is checked is what the real client
 * sends; expected numbers are worked out by hand from the clock the test
 * drives, never by the code under test. `node qa/mutate.mjs designs` plants
 * each defect and expects red.
 */
const { test, expect } = require("@playwright/test");
// Events go to a fake host the page's Content Security Policy rightly refuses;
// the policy has its own tests (tests/csp.spec.js) against the real worker.
test.use({ bypassCSP: true, timezoneId: "America/Lima", locale: "es-PE" });

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const ENDPOINT = "https://events.test/v1/events";
const NOW = "2026-11-10T10:00:00-05:00";
const LS_KEY = "vt_site_version_v1";

/**
 * Open the site with a clock the test owns and the event route captured.
 * @param {import('@playwright/test').Page} page
 * @param {{human?: boolean, path?: string, stored?: unknown, layoutWeights?: number[], sessions?: number}} [opts]
 * @returns {Promise<{bodies: object[]}>} What was posted.
 */
async function boot(page, opts = {}) {
  const sent = { bodies: [] };
  await page.route("https://events.test/**", async (route) => {
    try {
      sent.bodies.push(JSON.parse(route.request().postData() || "null"));
    } catch {
      sent.bodies.push(null);
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  // The tour moves by animation frames, which a paused clock never delivers.
  // The clock is installed and then held still: it moves only when a test
  // moves it. Left running, the real half-second a busy machine takes between
  // loading the page and the test's first step turned "40 seconds" into 41.
  if (!opts.realClock) {
    await page.clock.install({ time: new Date(NOW) });
    // A minute on, not NOW itself: the installed clock has already run a
    // few milliseconds, and pauseAt refuses to go back.
    await page.clock.pauseAt(new Date(Date.parse(NOW) + 60 * 1000));
  }
  await page.addInitScript(
    (o) => {
      window.VT_ANALYTICS_ENDPOINT = o.endpoint;
      // Was the design on <html> before there was a <body> to paint?
      new MutationObserver(() => {
        if (window.__paintedBeforeBody === undefined) window.__paintedBeforeBody = !document.body;
      }).observe(document, { attributes: true, subtree: true, attributeFilter: ["data-site-version"] });
      if (o.human) Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
      if (o.layoutWeights) {
        let cfg;
        Object.defineProperty(window, "VT_EXPERIMENTS", {
          configurable: true,
          get: () => cfg,
          set: (v) => {
            if (v && v.site_layout_2026_11) {
              v.site_layout_2026_11.enabled = true;
              v.site_layout_2026_11.variants = [
                { id: "a", weight: o.layoutWeights[0] },
                { id: "b", weight: o.layoutWeights[1] }
              ];
            }
            cfg = v;
          }
        });
      }
      if (sessionStorage.getItem("vt_sv_seeded")) return;
      sessionStorage.setItem("vt_sv_seeded", "1");
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      if (o.stored !== undefined) localStorage.setItem(o.key, typeof o.stored === "string" ? o.stored : JSON.stringify(o.stored));
      if (o.sessions) {
        // A learner with saved practice, so Estadísticas has something to show.
        const history = [];
        for (let i = 0; i < o.sessions; i += 1) {
          history.push({ id: `s${i}`, at: new Date(Date.now() - i * 86400000).toISOString(), durationSec: 120, score: 70 });
        }
        localStorage.setItem(
          "vt_progress_v1",
          JSON.stringify({ "v1-diction": { completedCount: o.sessions, history, lastScore: 70, lastAt: history[0].at } })
        );
      }
    },
    { ...opts, endpoint: ENDPOINT, key: LS_KEY }
  );
  await page.goto(BASE + (opts.path || "/"), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTSiteVersion && !!window.VTAnalytics);
  return sent;
}

/** Every event posted so far, oldest first. */
function events(sent, name) {
  const all = sent.bodies.flatMap((body) => (body && Array.isArray(body.events) ? body.events : []));
  return name ? all.filter((e) => e.name === name) : all;
}

async function flush(page) {
  await page.evaluate(() => window.VTAnalytics.flush());
}

/** Pretend the tab was hidden or shown, the way the browser reports it. */
async function setVisible(page, visible) {
  await page.evaluate((v) => {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (v ? "visible" : "hidden") });
    document.dispatchEvent(new Event("visibilitychange"));
  }, visible);
}

const design = (page) => page.evaluate(() => document.documentElement.getAttribute("data-site-version"));
const stored = (page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) || "null"), LS_KEY);

test.describe("The control: two designs, one choice, kept", () => {
  test("a first visit is design A, with the control saying so, and nothing chosen is stored", async ({ page }) => {
    // Wrong: a visitor who chose nothing landing on B, or a "choice" written for them.
    await boot(page);
    expect(await design(page)).toBe("a");
    await expect(page.locator("#site-version")).toHaveValue("a");
    await expect(page.locator("#site-version-bar")).toBeVisible();
    await expect(page.locator("#btn-plan")).toBeVisible();
    await expect(page.locator("#btn-history")).toBeVisible();
    await expect(page.locator("#btn-nav-progress")).toBeHidden();
    await expect(page.locator("#progress-tabs")).toBeHidden();
    const bag = await stored(page);
    expect(bag === null || bag.ver === undefined).toBe(true);
  });

  test("choosing B changes the page at once, and a reload paints B before the page is drawn", async ({ page }) => {
    // Wrong: the choice lost on reload; or A flashing first because the design
    // is applied after the page has been drawn.
    await boot(page);
    await page.selectOption("#site-version", "b");
    expect(await design(page)).toBe("b");
    await expect(page.locator("#btn-nav-progress")).toBeVisible();
    await expect(page.locator("#btn-plan")).toBeHidden();
    await expect(page.locator("#btn-history")).toBeHidden();
    expect(await stored(page)).toMatchObject({ ver: "b", src: "chosen" });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTSiteVersion);
    expect(await design(page)).toBe("b");
    expect(await page.evaluate(() => window.__paintedBeforeBody)).toBe(true);
    await expect(page.locator("#site-version")).toHaveValue("b");

    // And back: A is exactly A again.
    await page.selectOption("#site-version", "a");
    expect(await design(page)).toBe("a");
    await expect(page.locator("#btn-plan")).toBeVisible();
    await expect(page.locator("#btn-nav-progress")).toBeHidden();
    expect(await page.locator(".group-fold").count()).toBe(0);
  });

  for (const junk of ["42", '"b"', "[]", "null", '{"ver":"zz","src":"chosen"}', '{"ver":7}', "{not json"]) {
    test(`stored junk (${junk}) is design A and breaks nothing`, async ({ page }) => {
      // Wrong: a value of the wrong kind in storage throwing, or inventing a design.
      const errors = [];
      page.on("pageerror", (e) => errors.push(String(e)));
      await boot(page, { stored: junk });
      expect(await design(page)).toBe("a");
      await expect(page.locator("#site-version")).toHaveValue("a");
      await page.selectOption("#site-version", "b");
      expect(await design(page)).toBe("b");
      expect(errors).toEqual([]);
    });
  }

  test("?version=b shows B for that page only and stores nothing", async ({ page }) => {
    // Wrong: a shared link silently changing the visitor's own setting.
    await boot(page, { path: "/?version=b" });
    expect(await design(page)).toBe("b");
    expect((await stored(page))?.ver).toBeUndefined();
    await page.goto(BASE + "/?version=zz", { waitUntil: "domcontentloaded" });
    expect(await design(page)).toBe("a");
  });

  test("inside an exercise the control is gone, so a design cannot change mid-take", async ({ page }) => {
    await boot(page);
    await page.locator("#exercise-list .card-ex").first().click();
    await expect(page.locator("#view-exercise")).toBeVisible();
    await expect(page.locator("#site-version-bar")).toBeHidden();
    await expect(page.locator("#progress-tabs")).toBeHidden();
  });

  test("another tab changing the design is followed here", async ({ context, page }) => {
    // Wrong: two tabs of one browser showing (and reporting) different designs.
    await boot(page);
    const other = await context.newPage();
    await other.goto(BASE + "/", { waitUntil: "domcontentloaded" });
    await other.waitForFunction(() => !!window.VTSiteVersion);
    await other.selectOption("#site-version", "b");
    await expect.poll(() => design(page)).toBe("b");
    await expect(page.locator("#site-version")).toHaveValue("b");
  });
});

test.describe("What is sent: visits, time in use, and switches", () => {
  test("a visit is reported once, on the design it is on", async ({ page }) => {
    // Wrong: no visit reported; or one per page load, which turns one person
    // reloading into a crowd.
    const sent = await boot(page, { human: true });
    await flush(page);
    await expect.poll(() => events(sent, "layout_session").length).toBe(1);
    expect(events(sent, "layout_session")[0].props).toEqual({ ver: "a", src: "default", n: 1 });

    // Ten minutes later, a reload: the same visit.
    await page.clock.fastForward(10 * 60 * 1000);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTSiteVersion && !!window.VTLoop);
    await flush(page);
    await expect.poll(() => events(sent, "app_open").length).toBe(2);
    expect(events(sent, "layout_session").length).toBe(1);
    expect(events(sent, "layout_switch").length).toBe(0);
  });

  test("thirty-one quiet minutes later it is a second visit, numbered 2", async ({ page }) => {
    // Wrong: repeat visits never counted (n stuck at 1), which is the number
    // "do they come back" is read from.
    const sent = await boot(page, { human: true });
    await setVisible(page, false);
    await page.clock.fastForward(31 * 60 * 1000);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTSiteVersion && !!window.VTLoop);
    await flush(page);
    await expect.poll(() => events(sent, "layout_session").length).toBe(2);
    expect(events(sent, "layout_session").map((e) => e.props.n)).toEqual([1, 2]);
  });

  test("a switch reports where from, where to, how far into the visit, and the time spent on the old design", async ({ page }) => {
    // Wrong: the switch not sent; from and to swapped; the 40 seconds on A
    // credited to B; or B's first use not reported as a visit that used B.
    const sent = await boot(page, { human: true });
    await page.clock.fastForward(40 * 1000);
    await page.selectOption("#site-version", "b");
    await flush(page);
    await expect.poll(() => events(sent, "layout_switch").length).toBe(1);
    expect(events(sent, "layout_switch")[0].props).toEqual({ from: "a", to: "b", via: "menu", sec: 40 });
    expect(events(sent, "layout_time").map((e) => e.props)).toEqual([{ ver: "a", sec: 40 }]);
    expect(events(sent, "layout_session").map((e) => e.props)).toEqual([
      { ver: "a", src: "default", n: 1 },
      { ver: "b", src: "chosen", n: 1 }
    ]);

    // Back and forth again in the same visit: more switches, no more "visits".
    await page.selectOption("#site-version", "a");
    await page.selectOption("#site-version", "b");
    await flush(page);
    await expect.poll(() => events(sent, "layout_switch").length).toBe(3);
    expect(events(sent, "layout_session").length).toBe(2);
  });

  test("time counts while the page is in view, not while it is hidden", async ({ page }) => {
    // Wrong: a tab left in the background for ten minutes counted as ten
    // minutes of use; or the report lost because it was queued after the
    // page-hide flush had already run.
    const sent = await boot(page, { human: true });
    await page.clock.fastForward(120 * 1000);
    await setVisible(page, false);
    await expect.poll(() => events(sent, "layout_time").length).toBe(1);
    expect(events(sent, "layout_time")[0].props).toEqual({ ver: "a", sec: 120 });

    await page.clock.fastForward(10 * 60 * 1000);
    await setVisible(page, true);
    await page.clock.fastForward(30 * 1000);
    await setVisible(page, false);
    await expect.poll(() => events(sent, "layout_time").length).toBe(2);
    expect(events(sent, "layout_time")[1].props).toEqual({ ver: "a", sec: 30 });
  });

  test("a page left open with nobody at it stops counting after five minutes", async ({ page }) => {
    // Wrong: a tab left open over lunch read as an hour of engagement.
    const sent = await boot(page, { human: true });
    // Two minutes in, a key press; then nothing for fifty minutes.
    await page.clock.fastForward(2 * 60 * 1000);
    await page.keyboard.press("Shift");
    await page.clock.fastForward(50 * 60 * 1000);
    await setVisible(page, false);
    await expect.poll(() => events(sent, "layout_time").length).toBeGreaterThan(0);
    const total = events(sent, "layout_time").reduce((n, e) => n + e.props.sec, 0);
    // 2 minutes of use + the 5 idle minutes after the last input = 420 s.
    expect(total).toBe(420);
  });

  test("an automated browser sends nothing, and the control still works", async ({ page }) => {
    // Wrong: test traffic in the numbers; or the feature depending on statistics.
    const sent = await boot(page);
    await page.selectOption("#site-version", "b");
    await page.evaluate(() => window.VTAnalytics.flush());
    await page.clock.fastForward(6000);
    expect(sent.bodies.length).toBe(0);
    expect(await design(page)).toBe("b");
  });

  test("switching statistics off drops the visit counter and keeps the design", async ({ page }) => {
    // Wrong: a counter that exists only for statistics surviving the switch
    // that turns statistics off; or the visitor's design reset by it.
    const sent = await boot(page, { human: true });
    await page.selectOption("#site-version", "b");
    expect((await stored(page)).n).toBe(1);
    await page.locator("[data-privacy-toggle]").first().click();
    expect(await stored(page)).toEqual({ ver: "b", src: "chosen" });
    const before = events(sent).length;
    await page.clock.fastForward(60 * 1000);
    await page.selectOption("#site-version", "a");
    await setVisible(page, false);
    await page.clock.fastForward(6000);
    expect(events(sent).length).toBe(before);
    expect(await stored(page)).toEqual({ ver: "a", src: "chosen" });
    expect(await design(page)).toBe("a");
  });

  test("the worker keeps every prop these events carry", async ({ page }) => {
    // Wrong: a prop the worker's sanitiser silently drops (a space, a slash),
    // which would empty the dashboard while every client test passes.
    const sent = await boot(page, { human: true });
    await page.clock.fastForward(5000);
    await page.selectOption("#site-version", "b");
    await setVisible(page, false);
    await expect.poll(() => events(sent, "layout_time").length).toBeGreaterThan(0);
    const path = require("path");
    const { pathToFileURL } = require("url");
    const src = path.join(__dirname, "..", "workers", "entitlements", "src");
    const { EVENT_NAMES, sanitizeProps } = await import(pathToFileURL(path.join(src, "events.js")).href);
    const { LAYOUT_VERSIONS } = await import(pathToFileURL(path.join(src, "layouts.js")).href);
    const ours = events(sent).filter((e) => e.name.startsWith("layout_"));
    expect(new Set(ours.map((e) => e.name))).toEqual(new Set(["layout_session", "layout_switch", "layout_time"]));
    for (const e of ours) {
      expect(EVENT_NAMES.has(e.name), e.name).toBe(true);
      expect(sanitizeProps(e.props), e.name).toEqual(e.props);
    }
    // The client's designs are the worker's designs.
    expect(await page.evaluate(() => window.VTSiteVersion.VERSIONS)).toEqual(LAYOUT_VERSIONS);
    const options = await page.locator("#site-version option").evaluateAll((list) => list.map((o) => o.value));
    expect(options).toEqual(LAYOUT_VERSIONS);
  });
});

test.describe("The randomised default (experiment site_layout_2026_11)", () => {
  test("switched off, nobody is exposed and everybody gets A", async ({ page }) => {
    const sent = await boot(page, { human: true });
    await flush(page);
    await expect.poll(() => events(sent, "layout_session").length).toBe(1);
    expect(events(sent, "experiment_expose").length).toBe(0);
    expect(await design(page)).toBe("a");
  });

  test("switched on, the arm is the design, exposed once, and a later choice does not move the arm", async ({ page }) => {
    // Wrong: assigned B but shown A (the experiment would compare A with A);
    // or a visitor's own switch re-recorded as their arm, which is the
    // self-selection the experiment exists to avoid.
    const sent = await boot(page, { human: true, layoutWeights: [0, 1] });
    expect(await design(page)).toBe("b");
    await expect(page.locator("#site-version")).toHaveValue("b");
    await flush(page);
    await expect.poll(() => events(sent, "experiment_expose").length).toBe(1);
    expect(events(sent, "experiment_expose")[0].props).toMatchObject({ experiment: "site_layout_2026_11", variant: "b", enabled: true });
    expect(events(sent, "layout_session")[0].props).toEqual({ ver: "b", src: "default", n: 1 });

    await page.selectOption("#site-version", "a");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTSiteVersion && !!window.VTLoop);
    await flush(page);
    expect(await design(page)).toBe("a");
    expect(events(sent, "experiment_expose").length).toBe(1);
    expect(await page.evaluate(() => window.VTExperiments.exposedArms().site_layout_2026_11)).toBe("b");
  });
});

test.describe("Design B: the same things, regrouped", () => {
  test("Progreso holds Historial, Plan, Estadísticas and Perfiles, one at a time", async ({ page }) => {
    // Wrong: a tab showing nothing, two sections at once, or a section that
    // exists in A being unreachable in B.
    await boot(page, { stored: { ver: "b", src: "chosen" }, sessions: 3 });
    await page.click("#btn-nav-progress");
    await expect(page.locator("#progress-tabs")).toBeVisible();
    await expect(page.locator('[data-progress="history"]')).toHaveAttribute("aria-current", "true");
    await expect(page.locator("#history-list")).toBeVisible();
    await expect(page.locator("#value-pulse")).toBeHidden();
    await expect(page.locator("#history-profiles")).toBeHidden();
    await expect(page.locator("#btn-nav-progress")).toHaveAttribute("aria-current", "page");

    await page.click('[data-progress="stats"]');
    await expect(page.locator("#value-pulse")).toBeVisible();
    await expect(page.locator("#history-list")).toBeHidden();
    await expect(page.locator("#history-profiles")).toBeHidden();
    await expect(page.locator("#progress-empty")).toBeHidden();

    await page.click('[data-progress="profiles"]');
    await expect(page.locator("#history-profiles")).toBeVisible();
    await expect(page.locator("#sel-profile")).toBeVisible();
    await expect(page.locator("#value-pulse")).toBeHidden();

    await page.click('[data-progress="plan"]');
    await expect(page.locator("#view-plan")).toBeVisible();
    await expect(page).toHaveURL(/#plan$/);
    await expect(page.locator('[data-progress="plan"]')).toHaveAttribute("aria-current", "true");
    await expect(page.locator("#progress-tabs")).toBeVisible();

    // Back is the browser's Back, as in A.
    await page.goBack();
    await expect(page.locator("#view-history")).toBeVisible();
    await expect(page).toHaveURL(/#historial$/);

    // Practicar leaves Progreso: the strip goes, the mark moves.
    await page.click("#btn-nav-home");
    await expect(page.locator("#progress-tabs")).toBeHidden();
    await expect(page.locator("#btn-nav-progress")).not.toHaveAttribute("aria-current", "page");
  });

  test("Estadísticas says why it is empty before the first saved practice", async ({ page }) => {
    // Wrong: a blank tab (the card hides itself when there is nothing to count).
    await boot(page, { stored: { ver: "b", src: "chosen" } });
    await page.click("#btn-nav-progress");
    await page.click('[data-progress="stats"]');
    await expect(page.locator("#progress-empty")).toBeVisible();
    await expect(page.locator("#progress-empty")).toContainText("primera práctica");
    await page.click('[data-progress="history"]');
    await expect(page.locator("#progress-empty")).toBeHidden();
  });

  test("nothing A shows is missing from B: every element with an id is still in the page", async ({ page }) => {
    // Wrong: "regrouped" quietly meaning "removed".
    await boot(page, { sessions: 2 });
    const ids = () => page.evaluate(() => Array.from(document.querySelectorAll("main [id], header [id]"), (n) => n.id).sort());
    const inA = await ids();
    await page.selectOption("#site-version", "b");
    const inB = await ids();
    expect(inB).toEqual(inA);
    const cardsA = await page.locator("#exercise-list .card-ex").count();
    expect(cardsA).toBeGreaterThan(10);
  });

  test("catalogue groups fold: the first is open, a closed one keeps its exercises and says how many", async ({ page }) => {
    // Wrong: exercises removed rather than folded; a fold that cannot be
    // opened by keyboard; a filter chip showing an empty list.
    await boot(page, { stored: { ver: "b", src: "chosen" } });
    const heads = page.locator("#exercise-list .grid-group-head");
    await expect(heads).toHaveCount(2);
    const folds = page.locator("#exercise-list .group-fold");
    await expect(folds.nth(0)).toHaveAttribute("aria-expanded", "true");
    await expect(folds.nth(1)).toHaveAttribute("aria-expanded", "false");
    const total = await page.locator("#exercise-list .card-ex").count();
    const visible = await page.locator("#exercise-list .card-ex:visible").count();
    expect(visible).toBeGreaterThan(0);
    expect(visible).toBeLessThan(total);
    await expect(folds.nth(1)).toContainText(/\d+ ejercicios/);

    await folds.nth(1).focus();
    await page.keyboard.press("Enter");
    await expect(folds.nth(1)).toHaveAttribute("aria-expanded", "true");
    expect(await page.locator("#exercise-list .card-ex:visible").count()).toBe(total);

    // Closed again, then a filter: the filtered list is whole.
    await folds.nth(1).click();
    await page.locator('.tier-chip[data-tier="advanced"]').click();
    const advanced = await page.locator("#exercise-list .card-ex").count();
    expect(advanced).toBeGreaterThan(0);
    expect(await page.locator("#exercise-list .card-ex:visible").count()).toBe(advanced);

    // The other track has its own groups, the first open.
    await page.locator('.tier-chip[data-tier="all"]').click();
    await page.click("#tab-singing");
    await expect(page.locator("#exercise-list .group-fold").first()).toHaveAttribute("aria-expanded", "true");
    expect(await page.locator("#exercise-list .card-ex:visible").count()).toBeGreaterThan(0);
  });

  test("coming back from an exercise in a closed group opens that group", async ({ page }) => {
    // Wrong: returning to a catalogue where the card you opened is nowhere.
    await boot(page, { stored: { ver: "b", src: "chosen" } });
    const second = page.locator("#exercise-list .group-fold").nth(1);
    await second.click();
    const card = page.locator("#exercise-list .grid-group-head").nth(1).locator("xpath=following-sibling::button[1]");
    const id = await card.getAttribute("data-id");
    await card.click();
    await expect(page.locator("#view-exercise")).toBeVisible();
    await page.evaluate(() => document.querySelector("#exercise-list .group-fold[aria-expanded='true']:last-of-type"));
    await page.click("#btn-back-home");
    await expect(page.locator(`#exercise-list .card-ex[data-id="${id}"]`)).toBeVisible();
  });

  test("the tour runs in B: its Plan and Historial stops show those views, and the strips cannot be pressed behind it", async ({ page }) => {
    // Wrong: the tour pointing at buttons B hides, or the page behind the tour
    // staying live through the two strips this change adds.
    await boot(page, { stored: { ver: "b", src: "chosen" }, realClock: true });
    await page.click("#btn-tour");
    await expect(page.locator(".tour-card")).toBeVisible();
    expect(await page.locator("#site-version-bar").getAttribute("inert")).not.toBeNull();
    const seen = [];
    for (let i = 0; i < 8; i += 1) {
      const stop = await page.evaluate(() => ({
        view: window.VTApp.getState().view,
        progress: document.querySelector("[data-tour-progress]").textContent,
        strip: !document.getElementById("progress-tabs").hidden
      }));
      seen.push(stop);
      const m = /(\d+)\D+(\d+)/.exec(stop.progress);
      if (m && m[1] === m[2]) break;
      await page.locator("[data-tour-next]").click();
      await expect.poll(() => page.evaluate(() => document.querySelector("[data-tour-progress]").textContent)).not.toBe(stop.progress);
    }
    expect(seen.map((s) => s.view)).toEqual(["home", "exercise", "plan", "history", "home"]);
    // In Plan and Historial the tour stands over B's strip, which names the place.
    expect(seen.map((s) => s.strip)).toEqual([false, false, true, true, false]);
    await page.keyboard.press("Escape");
    // The tour over, the strips are live again.
    await expect(page.locator(".tour-card")).toBeHidden();
    expect(await page.locator("#site-version-bar").getAttribute("inert")).toBeNull();
  });
});

test.describe("Design B on a touch screen", () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });

  /** A one-finger flick across the page, as the browser reports it. */
  async function flick(page, fromX, toX, y = 500, toY = y) {
    await page.evaluate(
      ({ fromX, toX, y, toY }) => {
        const target = document.elementFromPoint(fromX, y) || document.body;
        const touch = (x, at) => new Touch({ identifier: 1, target, clientX: x, clientY: at });
        target.dispatchEvent(new TouchEvent("touchstart", { bubbles: true, touches: [touch(fromX, y)], changedTouches: [touch(fromX, y)] }));
        target.dispatchEvent(new TouchEvent("touchend", { bubbles: true, touches: [], changedTouches: [touch(toX, toY)] }));
      },
      { fromX, toX, y, toY }
    );
  }

  test("a sideways flick moves between the Progreso tabs; a short or diagonal one does not", async ({ page }) => {
    // Wrong: a scroll that drifts sideways changing tab under the thumb.
    await boot(page, { stored: { ver: "b", src: "chosen" } });
    await page.click("#btn-nav-progress");
    await expect(page.locator("#view-history")).toBeVisible();
    await flick(page, 300, 270);
    await expect(page.locator("#view-history")).toBeVisible();
    // A scroll down the page that drifts 200px sideways is a scroll.
    await flick(page, 320, 120, 300, 520);
    await expect(page.locator("#view-history")).toBeVisible();
    await expect(page.locator('[data-progress="history"]')).toHaveAttribute("aria-current", "true");
    await flick(page, 320, 80);
    await expect(page.locator("#view-plan")).toBeVisible();
    await flick(page, 80, 320);
    await expect(page.locator("#view-history")).toBeVisible();
    await expect(page.locator('[data-progress="history"]')).toHaveAttribute("aria-current", "true");
    // First tab: a flick the other way has nowhere to go and does nothing.
    await flick(page, 80, 320);
    await expect(page.locator("#view-history")).toBeVisible();
  });

  test("in A a flick does nothing at all", async ({ page }) => {
    await boot(page);
    await page.click("#btn-history");
    await flick(page, 320, 80);
    await expect(page.locator("#view-history")).toBeVisible();
  });
});

test.describe("The guide in each design", () => {
  test("A shows every section open; B folds them and opens the one a link points into", async ({ page }) => {
    // Wrong: a tour link to #basicos (inside section 3) landing on a closed
    // section; or A's guide changed by a design it is not using.
    await boot(page, { path: "/guide.html" });
    expect(await page.locator(".guide-fold").count()).toBe(0);
    await expect(page.locator("#basicos")).toBeVisible();

    await page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ ver: "b", src: "chosen" })), LS_KEY);
    await page.goto(BASE + "/guide.html#basicos", { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelectorAll(".guide-fold").length > 10);
    await expect(page.locator("#basicos")).toBeVisible();
    await expect(page.locator("#inicio .guide-fold")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#practica .guide-fold")).toHaveAttribute("aria-expanded", "false");
    // Everything is still in the page, and opens from its heading by keyboard.
    await page.locator("#practica .guide-fold").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#practica .guide-fold")).toHaveAttribute("aria-expanded", "true");
    // The privacy section and its switch survive the folding.
    await page.goto(BASE + "/guide.html#privacidad", { waitUntil: "domcontentloaded" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelectorAll(".guide-fold").length > 10);
    await expect(page.locator("#privacidad .guide-fold")).toHaveAttribute("aria-expanded", "true");
  });

  test("the guide and the privacy page say what the design events send", async ({ page }) => {
    // Wrong: sending seconds and visit counts the privacy text does not name.
    for (const file of ["guide.html", "privacy.html"]) {
      await page.goto(`${BASE}/${file}`, { waitUntil: "domcontentloaded" });
      const text = await page.evaluate(() => document.body.textContent.replace(/\s+/g, " "));
      expect(text, file).toContain("qué diseño del sitio usas (A o B)");
      expect(text, file).toContain("cuántos segundos lo tienes abierto");
      expect(text, file).toContain("cuántas visitas llevas");
      expect(text, file).toContain("which design of the site you use (A or B)");
      expect(text, file).toContain("how many seconds you keep it open");
      expect(text, file).toContain("how many visits you have made");
    }
  });
});

/** In the page: wait for scrolling to stop, then name the focused control if something else is drawn over its centre. */
async function coveredFocus() {
  // Let a smooth scroll come to rest before judging.
  await new Promise((res) => {
    let y = scrollY;
    let still = 0;
    const t0 = performance.now();
    const tick = () => {
      still = scrollY === y ? still + 1 : 0;
      y = scrollY;
      if (still >= 4 || performance.now() - t0 > 2000) res();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const r = el.getBoundingClientRect();
  const y = r.top + r.height / 2;
  if (r.width < 1 || y < 0 || y > innerHeight) return null;
  const top = document.elementFromPoint(r.left + r.width / 2, y);
  const own = (node) => node === el || el.contains(node) || node.contains(el) || [...(el.labels || [])].some((l) => l.contains(node));
  if (!top || own(top)) return null;
  const said = el.getAttribute("aria-label") || el.innerText || el.id;
  return `"${said.trim().slice(0, 30)}" under ${top.id || top.className || top.tagName} (y ${Math.round(r.top)})`;
}

test.describe("Design B by keyboard", () => {
  test("the design control, focused while scrolled behind the sticky header, comes out from under it", async ({ page }) => {
    // Wrong: the browser counts a control behind the header as in view and
    // does not scroll, so it is focused where nobody can see it. Set up
    // directly, because whether a Tab walk lands there depends on the page's
    // height on the machine running it.
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, { realClock: true });
    const before = await page.evaluate(() => {
      const select = document.getElementById("site-version");
      window.scrollTo({ top: window.scrollY + select.getBoundingClientRect().top - 3, behavior: "instant" });
      const header = document.querySelector(".app-header").getBoundingClientRect();
      return { top: select.getBoundingClientRect().top, headerBottom: header.bottom };
    });
    // The control really is behind the header before it takes focus.
    expect(before.top).toBeLessThan(before.headerBottom);
    await page.evaluate(() => document.getElementById("site-version").focus({ preventScroll: true }));
    // The page scrolls smoothly, so the control arrives a moment later.
    const state = () =>
      page.evaluate(() => {
        const select = document.getElementById("site-version").getBoundingClientRect();
        const top = document.elementFromPoint(select.left + select.width / 2, select.top + select.height / 2);
        return { clear: select.top >= document.querySelector(".app-header").getBoundingClientRect().bottom, hit: top && top.id };
      });
    await expect.poll(async () => (await state()).clear, { timeout: 5000 }).toBe(true);
    const after = await state();
    expect(after.hit).toBe("site-version");
  });

  for (const vp of [
    { width: 1280, height: 800 },
    { width: 390, height: 844 }
  ]) {
    test(`${vp.width}x${vp.height}: no focused control hides under the header or the Progreso tabs`, async ({ page }) => {
      // Wrong: the tabs stick under the header, so a control scrolled to by
      // Tab can come to rest beneath them, focused and invisible (WCAG 2.4.11).
      test.setTimeout(120000);
      await page.setViewportSize(vp);
      await boot(page, { stored: { ver: "b", src: "chosen" }, sessions: 3, realClock: true });
      await page.click("#btn-nav-progress");
      const covered = [];
      for (const tab of ["history", "plan", "stats", "profiles"]) {
        await page.click(`[data-progress="${tab}"]`);
        await page.evaluate(() => document.activeElement?.blur());
        const stops = await page.evaluate(
          () => [...document.querySelectorAll("main button, main a[href], main input, main select, main summary")].filter((el) => el.getClientRects().length).length
        );
        for (let i = 0; i < Math.min(60, stops + 12); i += 1) {
          await page.keyboard.press("Tab");
          const found = await page.evaluate(coveredFocus);
          if (found) covered.push(`${tab}: ${found}`);
        }
      }
      expect([...new Set(covered)], [...new Set(covered)].join("\n")).toEqual([]);
    });
  }
});
