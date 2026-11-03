/**
 * Router and tour: the address always names the page that is showing, Back and
 * reload put a page back where it was (view and scroll), the site tour opens
 * and closes without touching the address and fits short and rotated screens,
 * the exercise coach-marks wait for the learner, and keyboard focus is never
 * dropped or left under the sticky header.
 *
 * Real pointer clicks are made with page.mouse at the control's box: a locator
 * click scrolls a sticky-header button into view first, which moves the page
 * before the app sees the click and spoils every scroll case here.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

const VP = {
  tiny: { width: 320, height: 568 },
  phone: { width: 390, height: 844 },
  land: { width: 844, height: 390 },
  tablet: { width: 768, height: 1024 },
  laptop: { width: 1280, height: 800 }
};
const HUMAN_UA =
  "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36";

const RICH_PROGRESS = [
  { id: "s4-lip-trills", n: 3, score: 7, daysAgo: 0 },
  { id: "s27-lip-trill-solfege", n: 3, score: 6, daysAgo: 1 },
  { id: "s7-humming", n: 1, score: 8, daysAgo: 3 },
  { id: "s9-pitch-match", n: 2, score: 5, daysAgo: 6 },
  { id: "v1-diction", n: 1, score: 5, daysAgo: 9 },
  { id: "v10-power-pause", n: 2, score: 4, daysAgo: 12 }
];
const RICH_DAYS = [-12, -9, -6, -3, -2, -1, 0];
const RET_DAYS = [-3, -2, -1];

/**
 * Seed storage once per tab (a reload or a visit to the guide and back keeps
 * what the app wrote), then load the page.
 * opts: lang, hash, days (offsets), progress, plan, tour ("1" seen | null),
 *       e2e (default true: sessionStorage.vt_e2e), query, storage
 */
async function boot(page, opts = {}) {
  const cfg = {
    lang: opts.lang || "es",
    days: opts.days || null,
    progress: opts.progress || null,
    plan: opts.plan || null,
    tour: opts.tour === undefined ? "1" : opts.tour,
    e2e: opts.e2e !== false,
    tab: opts.tab || "singing",
    storage: opts.storage || {}
  };
  await page.addInitScript((c) => {
    try {
      if (sessionStorage.getItem("__rt_seeded")) return;
      sessionStorage.setItem("__rt_seeded", "1");
      localStorage.clear();
      localStorage.setItem("vt_lang", c.lang);
      if (c.tour) localStorage.setItem("vt_tour_v1", c.tour);
      localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: c.tab }));
      if (c.e2e) sessionStorage.setItem("vt_e2e", "1");
      const pad = (n) => String(n).padStart(2, "0");
      if (c.days) {
        const days = {};
        c.days.forEach((off) => {
          const d = new Date();
          d.setHours(12, 0, 0, 0);
          d.setDate(d.getDate() + off);
          days[`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`] = {
            sec: 240,
            n: 2,
            ex: ["s4-lip-trills", "s27-lip-trill-solfege"]
          };
        });
        localStorage.setItem(
          "vt_days_v1",
          JSON.stringify({ v: 1, days, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true })
        );
      }
      if (c.progress) {
        const bag = {};
        c.progress.forEach((p, i) => {
          const at = new Date(Date.now() - p.daysAgo * 86400000 - 3600000).toISOString();
          bag[p.id] = {
            completedCount: p.n,
            lastScore: p.score,
            lastAt: at,
            history: Array.from({ length: p.n }, (_, j) => ({
              id: `h${i}_${j}`,
              at,
              metrics: {},
              score: p.score,
              notes: "",
              durationSec: 90 + 30 * j
            }))
          };
        });
        localStorage.setItem("vt_progress_v1", JSON.stringify(bag));
      }
      if (c.plan) {
        localStorage.setItem(
          "vt_week_plan_v1",
          JSON.stringify({
            weekNumber: 1,
            element: "Volume",
            status: "active",
            startedAt: new Date(Date.now() - 3 * 86400000).toISOString(),
            checkIns: [],
            reviews: [],
            completedElements: []
          })
        );
      }
      Object.entries(c.storage).forEach(([k, v]) => localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)));
    } catch {
      /* ignore */
    }
  }, cfg);
  await page.goto(`${BASE}/index.html${opts.query || ""}${opts.hash || ""}`, { waitUntil: "domcontentloaded" });
  await ready(page);
}

async function ready(page) {
  await page.waitForFunction(() => !!window.VTApp?.openExercise && document.readyState === "complete");
  await page.waitForTimeout(500);
}

const settle = (page, ms = 350) =>
  page
    .waitForTimeout(ms)
    .then(() => page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)))));

async function clickAt(page, sel) {
  const b = await page.locator(sel).boundingBox();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
}

const view = (page) => page.evaluate(() => window.VTApp.getState().view);
const hashOf = (page) => page.evaluate(() => location.hash);
const scrollY = (page) => page.evaluate(() => Math.round(window.scrollY));
const toY = (page, y) => page.evaluate((y) => window.scrollTo({ top: y, behavior: "instant" }), y);

/** Open the tour the way a person does: the header's Tour button (behind Más on a phone). */
async function startTourByButton(page) {
  if (await page.isVisible("#btn-more")) await clickAt(page, "#btn-more");
  else if (await page.isVisible("#btn-help")) await clickAt(page, "#btn-help");
  await clickAt(page, "#btn-tour");
  await settle(page, 900);
}

async function nextStops(page, n) {
  for (let i = 0; i < n; i++) {
    await page.locator("[data-tour-next]").click();
    await settle(page, 650);
  }
}

// ──────────────────────────────────────────────────────────────────────────
// 1. chrome-tour-end-address, chrome-tour-back-button
// ──────────────────────────────────────────────────────────────────────────

test.describe("tour and the address", () => {
  for (const vp of ["phone", "laptop"]) {
    for (const [btn, hash, name] of [
      ["#btn-plan", "#plan", "plan"],
      ["#btn-history", "#historial", "history"]
    ]) {
      test(`${vp}: starting the tour on ${name} and skipping it leaves the address on ${name}, and a reload opens it`, async ({
        page
      }) => {
        await page.setViewportSize(VP[vp]);
        await boot(page, { days: RET_DAYS, progress: RICH_PROGRESS });
        await clickAt(page, btn);
        await settle(page, 400);
        expect(await view(page)).toBe(name);
        expect(await hashOf(page)).toBe(hash);
        await startTourByButton(page);
        // The tour does not write an address of its own while it runs.
        expect(await hashOf(page)).toBe(hash);
        await page.locator("[data-tour-skip]").click();
        await settle(page, 700);
        expect(await view(page)).toBe(name);
        expect(await hashOf(page)).toBe(hash);
        await page.reload({ waitUntil: "domcontentloaded" });
        await ready(page);
        expect(await view(page)).toBe(name);
      });
    }
  }

  for (const vp of ["phone", "laptop"]) {
    for (const [from, stop] of [
      ["plan", 3],
      ["history", 4]
    ]) {
      test(`${vp}: Back at stop ${stop} of a tour opened on ${from} closes the tour and the address matches the page`, async ({
        page
      }) => {
        await page.setViewportSize(VP[vp]);
        await boot(page, { days: RET_DAYS, progress: RICH_PROGRESS });
        await clickAt(page, from === "plan" ? "#btn-plan" : "#btn-history");
        await settle(page, 400);
        await startTourByButton(page);
        await nextStops(page, stop - 1);
        await page.goBack({ timeout: 4000 }).catch(() => {});
        await settle(page, 900);
        const s = await page.evaluate(() => ({
          tour: !!window.VTTour?.isActive?.(),
          card: !!document.querySelector("#tour-root:not([hidden]) .tour-card"),
          view: window.VTApp.getState().view,
          hash: location.hash
        }));
        expect(s.tour).toBe(false);
        expect(s.card).toBe(false);
        // The page and the address agree.
        const want = { home: "", plan: "#plan", history: "#historial" }[s.view];
        expect(s.hash).toBe(want);
        expect(page.url()).toContain("/index.html");
      });
    }
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 2. chrome-history-back-scroll, chrome-scroll-lost-reload-and-return
// ──────────────────────────────────────────────────────────────────────────

test.describe("scroll comes back", () => {
  for (const [vp, y, lang] of [
    ["phone", 600, "es"],
    ["laptop", 450, "es"],
    ["phone", 900, "en"],
    ["tablet", 700, "en"]
  ]) {
    test(`${vp} ${lang}: Back to Historial lands at ${y} (within 2px), also after Forward and Back`, async ({ page }) => {
      await page.setViewportSize(VP[vp]);
      await boot(page, { lang, days: RICH_DAYS, progress: RICH_PROGRESS, hash: "#historial" });
      await settle(page, 300);
      await toY(page, y);
      await settle(page, 500);
      const before = await scrollY(page);
      expect(Math.abs(before - y)).toBeLessThanOrEqual(2);
      await clickAt(page, "#btn-plan");
      await settle(page, 500);
      expect(await view(page)).toBe("plan");
      await page.goBack();
      await settle(page, 1500);
      expect(await view(page)).toBe("history");
      expect(Math.abs((await scrollY(page)) - y)).toBeLessThanOrEqual(2);
      await page.goForward();
      await settle(page, 600);
      await page.goBack();
      await settle(page, 1500);
      expect(Math.abs((await scrollY(page)) - y)).toBeLessThanOrEqual(2);
    });
  }

  for (const [vp, which, lang] of [
    ["phone", "home", "es"],
    ["laptop", "home", "en"],
    ["phone", "history", "en"],
    ["laptop", "plan", "es"]
  ]) {
    for (const how of ["reload", "guide-and-back"]) {
      test(`${vp} ${lang} ${which}: ${how} comes back to where the page was`, async ({ page }) => {
        await page.setViewportSize(VP[vp]);
        await boot(page, {
          lang,
          days: which === "history" ? RICH_DAYS : RET_DAYS,
          progress: which === "history" ? RICH_PROGRESS : null,
          plan: which === "plan",
          tab: which === "plan" ? "vocal" : "singing",
          hash: which === "home" ? "" : which === "plan" ? "#plan" : "#historial"
        });
        await settle(page, 300);
        const max = await page.evaluate(() => document.documentElement.scrollHeight - innerHeight);
        const want = Math.min(800, max - 10);
        expect(want).toBeGreaterThan(100);
        await toY(page, want);
        await settle(page, 600);
        const y0 = await scrollY(page);
        if (how === "reload") {
          await page.reload({ waitUntil: "domcontentloaded" });
        } else {
          // The guide opens in this tab from the header's Ayuda / Más.
          if (await page.isVisible("#btn-more")) await clickAt(page, "#btn-more");
          else if (await page.isVisible("#btn-help")) await clickAt(page, "#btn-help");
          await settle(page, 250);
          await page.evaluate(() => {
            const a = document.getElementById("link-guide");
            a.removeAttribute("target");
          });
          await clickAt(page, "#link-guide");
          await page.waitForURL(/guide\.html/);
          await settle(page, 300);
          await page.goBack();
        }
        await ready(page);
        await settle(page, 1500);
        expect(await view(page)).toBe(which);
        expect(Math.abs((await scrollY(page)) - y0)).toBeLessThanOrEqual(2);
      });
    }
  }

  // Guard for the fix itself (it cannot fail on a page that never restores): the
  // list is slow to arrive, the learner scrolls at once, and the page must not
  // pull them back to where they were afterwards.
  test("a restoring page gives way at the first input: the learner's wheel is not undone", async ({ page }) => {
    await page.setViewportSize(VP.phone);
    await boot(page, { days: RICH_DAYS, progress: RICH_PROGRESS, hash: "#historial" });
    await settle(page, 300);
    await toY(page, 700);
    await settle(page, 500);
    await clickAt(page, "#btn-plan");
    await settle(page, 400);
    await page.evaluate(() => {
      const read = VTStorage.listRecordings;
      VTStorage.listRecordings = (...a) => new Promise((r) => setTimeout(r, 900)).then(() => read.apply(VTStorage, a));
    });
    await page.goBack();
    await page.waitForFunction(() => window.VTApp.getState().view === "history");
    await page.mouse.move(200, 400);
    await page.mouse.wheel(0, 120);
    await settle(page, 3000);
    const y = await scrollY(page);
    // Not put back at 700: the wheel ended the restore.
    expect(Math.abs(y - 700)).toBeGreaterThan(60);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 3. chrome-unknown-exercise-back, chrome-reload-exercise-dead-back
// ──────────────────────────────────────────────────────────────────────────

test.describe("addresses of exercises", () => {
  for (const vp of ["phone", "laptop"]) {
    test(`${vp}: an address for no exercise is replaced by the page that shows, so Back stays honest`, async ({
      page
    }) => {
      await page.setViewportSize(VP[vp]);
      await boot(page, { days: RET_DAYS, hash: "#ejercicio/no-existe" });
      expect(await view(page)).toBe("home");
      expect(await hashOf(page)).toBe("");
      await clickAt(page, "#btn-plan");
      await settle(page, 300);
      await page.goBack();
      await settle(page, 600);
      const s = { hash: await hashOf(page), view: await view(page) };
      expect(s.view).toBe("home");
      expect(s.hash).toBe("");
    });

    test(`${vp}: Back or Forward onto an address for no exercise leaves the address of the page shown`, async ({
      page
    }) => {
      await page.setViewportSize(VP[vp]);
      await boot(page, { days: RET_DAYS });
      await clickAt(page, "#btn-plan");
      await settle(page, 300);
      await page.evaluate(() => {
        history.pushState({ vt: "exercise" }, "", "#ejercicio/no-existe");
        window.dispatchEvent(new PopStateEvent("popstate", { state: history.state }));
      });
      await settle(page, 500);
      const s = { hash: await hashOf(page), view: await view(page) };
      expect(s.hash).toBe({ home: "", plan: "#plan", history: "#historial" }[s.view]);
    });
  }

  for (const vp of ["phone", "laptop"]) {
    test(`${vp}: after a reload, an exercise still goes back to the card it was opened from`, async ({ page }) => {
      await page.setViewportSize(VP[vp]);
      // A page before the app, so the last Back has somewhere to go.
      await page.goto(`${BASE}/css/admin.css`, { waitUntil: "domcontentloaded" });
      await boot(page, { days: RET_DAYS });
      const card = page.locator('#exercise-list .card-ex[data-id="s9-pitch-match"]');
      await card.scrollIntoViewIfNeeded();
      await settle(page, 300);
      const yCard = await scrollY(page);
      expect(yCard).toBeGreaterThan(300);
      await card.click();
      await settle(page, 600);
      expect(await view(page)).toBe("exercise");
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => window.VTApp && window.VTApp.getState().view === "exercise");
      await settle(page, 600);
      await clickAt(page, "#btn-back-home");
      await settle(page, 1200);
      const a = { hash: await hashOf(page), view: await view(page), y: await scrollY(page) };
      expect(a.view).toBe("home");
      expect(a.hash).toBe("");
      // At the card, not the top of the page.
      const cardBox = await page
        .locator('#exercise-list .card-ex[data-id="s9-pitch-match"]')
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom };
        });
      expect(cardBox.bottom).toBeGreaterThan(0);
      expect(cardBox.top).toBeLessThan(VP[vp].height);
      expect(a.y).toBeGreaterThan(300);
      // The exercise's entry was stepped back over, not turned into a second
      // Practicar: one more Back leaves the app instead of changing nothing.
      await page.goBack({ timeout: 4000 }).catch(() => {});
      await settle(page, 700);
      expect(page.url()).toContain("/css/admin.css");
    });
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 4. Tour on short and rotated screens, and under the sticky header
// ──────────────────────────────────────────────────────────────────────────

const TARGET = { 1: "#next-step-card", 2: "#btn-practice-start", 3: "#plan-week-num", 4: ".hist-cal", 5: ".header-door" };

function measureStop(page, stop) {
  return page.evaluate(
    ([sel]) => {
      const card = document.querySelector("#tour-root .tour-card").getBoundingClientRect();
      const t = document.querySelector(sel)?.getBoundingClientRect();
      if (!t) return { missing: sel };
      const w = Math.max(0, Math.min(card.right, t.right) - Math.max(card.left, t.left));
      const h = Math.max(0, Math.min(card.bottom, t.bottom) - Math.max(card.top, t.top));
      const hdr = [...document.querySelectorAll(".app-header")].map((e) => e.getBoundingClientRect()).find((r) => r.height > 0);
      const more = document.getElementById("btn-more");
      return {
        sel,
        covered: Math.round(((w * h) / Math.max(1, t.width * t.height)) * 100),
        card: [Math.round(card.left), Math.round(card.top), Math.round(card.width), Math.round(card.height)],
        tTop: Math.round(t.top),
        underHeader: hdr ? Math.max(0, Math.round(hdr.bottom - t.top)) : 0,
        body: document.querySelector("[data-tour-body]")?.textContent || "",
        moreShown: !!more && more.getBoundingClientRect().width > 0,
        h: window.innerHeight
      };
    },
    [TARGET[stop]]
  );
}

test.describe("tour on short and rotated screens", () => {
  for (const lang of ["es", "en"]) {
    test(`844x390 ${lang}: the card covers none of stops 1, 2 and 3's target`, async ({ page }) => {
      await page.setViewportSize(VP.land);
      await boot(page, { lang, days: RICH_DAYS, progress: RICH_PROGRESS });
      await page.evaluate(() => window.VTTour.start(true));
      await settle(page, 900);
      for (const stop of [1, 2, 3]) {
        if (stop > 1) await nextStops(page, 1);
        const m = await measureStop(page, stop);
        expect(m.covered, `stop ${stop} ${JSON.stringify(m)}`).toBeLessThanOrEqual(2);
      }
    });
  }

  test("844x390: stop 5's button starts the practice and focus lands on Start, not <body>", async ({ page }) => {
    await page.setViewportSize(VP.land);
    await boot(page, { lang: "en", days: RICH_DAYS, progress: RICH_PROGRESS });
    await page.evaluate(() => window.VTTour.start(true));
    await settle(page, 900);
    await nextStops(page, 4);
    await page.locator("[data-tour-next]").click();
    await settle(page, 1800);
    expect(await view(page)).toBe("exercise");
    const f = await page.evaluate(() => {
      const a = document.activeElement;
      return { id: a?.id || "", body: a === document.body };
    });
    expect(f.body).toBe(false);
    expect(f.id).toBe("btn-practice-start");
  });

  const ROT = [
    ["phone", "land", 1, "portrait to landscape"],
    ["land", "phone", 2, "landscape to portrait"],
    ["laptop", "phone", 3, "laptop to phone"],
    ["phone", "laptop", 5, "phone to laptop"],
    ["laptop", "phone", 5, "laptop to phone, last stop"]
  ];
  for (const [a, b, stop, name] of ROT) {
    test(`rotating ${name} on stop ${stop}: the card still clears the target, and stop 5 says what is there`, async ({
      page
    }) => {
      await page.setViewportSize(VP[a]);
      await boot(page, { lang: "es", days: RICH_DAYS, progress: RICH_PROGRESS });
      await page.evaluate(() => window.VTTour.start(true));
      await settle(page, 900);
      await nextStops(page, stop - 1);
      await page.setViewportSize(VP[b]);
      await settle(page, 1400);
      const m = await measureStop(page, stop);
      expect(m.covered, JSON.stringify(m)).toBeLessThanOrEqual(2);
      if (stop === 5) {
        if (m.moreShown) expect(m.body).not.toMatch(/Al lado/);
        else expect(m.body).not.toMatch(/«Más»/);
      }
    });
  }

  for (const lang of ["es", "en"]) {
    for (const vp of [VP.tiny, { width: 360, height: 640 }]) {
      test(`${vp.width}x${vp.height} ${lang}: stop 1's target starts below the sticky header`, async ({ page }) => {
        await page.setViewportSize(vp);
        await boot(page, { lang, days: RET_DAYS });
        await page.evaluate(() => window.VTTour.start(true));
        await settle(page, 900);
        const g = await page.evaluate(() => {
          const hi = document.querySelector(".tour-highlight");
          const hd = document.querySelector(".app-header");
          return {
            top: hi ? Math.round(hi.getBoundingClientRect().top) : null,
            hb: Math.round(hd.getBoundingClientRect().bottom)
          };
        });
        expect(g.top).not.toBeNull();
        expect(g.top).toBeGreaterThanOrEqual(g.hb - 1);
      });
    }
  }
});

// ──────────────────────────────────────────────────────────────────────────
// 5. B2: coach-marks wait for the learner (timer based: run under the browser lock too)
// ──────────────────────────────────────────────────────────────────────────

test.describe("coach-marks over a take", () => {
  test.use({ userAgent: HUMAN_UA });

  async function human(page, primed) {
    await page.addInitScript(() => {
      // A silent microphone: the take can go live.
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!navigator.mediaDevices || !AC) return;
      navigator.mediaDevices.getUserMedia = async () => {
        const ctx = new AC();
        const dest = ctx.createMediaStreamDestination();
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        g.gain.value = 0.00001;
        osc.connect(g);
        g.connect(dest);
        osc.start();
        return dest.stream;
      };
    });
    await boot(page, {
      days: RET_DAYS,
      e2e: false,
      tour: "finished",
      storage: primed ? { vt_mic_primed_v1: "1" } : {}
    });
  }

  for (const primed of [false, true]) {
    test(`Start pressed inside the first 0.7 s (${primed ? "mic already allowed" : "mic primer"}): no coach-marks over it`, async ({
      page
    }) => {
      await page.setViewportSize(VP.phone);
      await human(page, primed);
      await page.evaluate(() => window.VTApp.openExercise("s9-pitch-match"));
      await page.waitForFunction(() => {
        const r = document.getElementById("btn-practice-start")?.getBoundingClientRect();
        return r && r.width > 8;
      });
      await page.click("#btn-practice-start", { timeout: 2000 });
      await page.waitForTimeout(1600);
      const s = await page.evaluate(() => ({
        primer: !!document.querySelector("#mic-primer:not([hidden])"),
        card: !!document.querySelector("#tour-root:not([hidden]) .tour-card"),
        live: document.body.classList.contains("practice-live"),
        primed: localStorage.getItem("vt_mic_primed_v1") === "1"
      }));
      expect(primed ? s.live : s.primer).toBe(true);
      expect(s.card).toBe(false);
      if (!primed) expect(s.primed).toBe(false);
      // The pack was not used up: it offers itself on the next open.
      expect(await page.evaluate(() => window.VTTour.isUiSeen("highway"))).toBe(false);
    });
  }

  test("a coach-marks pack still opens by itself when the learner just looks", async ({ page }) => {
    await page.setViewportSize(VP.phone);
    await human(page, true);
    await page.evaluate(() => window.VTApp.openExercise("s9-pitch-match"));
    await page.waitForTimeout(1600);
    expect(await page.evaluate(() => !!document.querySelector("#tour-root:not([hidden]) .tour-card"))).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────────────
// 6. Focus: tour invite dismissed, Shift+Tab under the sticky header
// ──────────────────────────────────────────────────────────────────────────

test.describe("keyboard focus", () => {
  for (const vp of ["phone", "laptop"]) {
    test(`${vp}: dismissing the tour invite by keyboard leaves focus on a visible control of the page`, async ({
      page
    }) => {
      await page.setViewportSize(VP[vp]);
      // A first visit on the classic arm: the start panel offers the tour.
      await boot(page, { tour: null, query: "?ab_loop_home_2026_10=classic" });
      const dismiss = page.locator("#home-tour-invite [data-tour-invite-dismiss]");
      await expect(dismiss).toBeVisible();
      await dismiss.focus();
      await page.keyboard.press("Enter");
      await settle(page, 300);
      const r = await page.evaluate(() => {
        const a = document.activeElement;
        const box = a && a !== document.body ? a.getBoundingClientRect() : null;
        return {
          gone: !document.getElementById("home-tour-invite"),
          body: a === document.body,
          visible: !!box && box.width > 0 && box.height > 0,
          inHome: !!a?.closest("#view-home")
        };
      });
      expect(r.gone).toBe(true);
      expect(r.body).toBe(false);
      expect(r.visible).toBe(true);
      expect(r.inHome).toBe(true);
    });
  }

  const SHIFT_TAB = [
    ["phone", "es", "home"],
    ["laptop", "en", "home"],
    ["phone", "en", "history"],
    ["laptop", "es", "history"],
    ["phone", "es", "plan"]
  ];
  for (const [vp, lang, which] of SHIFT_TAB) {
    test(`${vp} ${lang} ${which}: no Shift+Tab stop is hidden behind the sticky header`, async ({ page }) => {
      await page.setViewportSize(VP[vp]);
      await page.emulateMedia({ reducedMotion: "reduce" });
      await boot(page, {
        lang,
        days: which === "history" ? RICH_DAYS : RET_DAYS,
        progress: which === "history" ? RICH_PROGRESS : null,
        plan: which === "plan",
        tab: which === "plan" ? "vocal" : "singing",
        hash: which === "home" ? "" : which === "plan" ? "#plan" : "#historial"
      });
      await settle(page, 400);
      // From the end of the page, backwards.
      await page.evaluate(() => {
        const all = [...document.querySelectorAll("a[href],button,select,input,[tabindex]:not([tabindex='-1'])")].filter(
          (e) => !e.disabled && !e.closest("[hidden],[inert]") && e.getBoundingClientRect().width > 0
        );
        all[all.length - 1].focus();
      });
      const hidden = [];
      for (let i = 0; i < 70; i++) {
        await page.keyboard.press("Shift+Tab");
        await page.waitForTimeout(70);
        const f = await page.evaluate(() => {
          const el = document.activeElement;
          if (!el || el === document.body) return null;
          const hdr = document.querySelector(".app-header");
          const hb = hdr.getBoundingClientRect();
          if (hdr.contains(el)) return { inHeader: true };
          const r = el.getBoundingClientRect();
          const visTop = Math.max(r.top, hb.bottom);
          const visBottom = Math.min(r.bottom, innerHeight);
          const shown = Math.max(0, visBottom - visTop) / Math.max(1, r.height);
          const name = (el.getAttribute("aria-label") || el.innerText || "").replace(/\s+/g, " ").trim().slice(0, 40);
          return { name, shown: Math.round(shown * 100) };
        });
        if (!f) continue;
        if (f.inHeader) break;
        if (f.shown < 50) hidden.push(`${f.shown}% ${f.name}`);
      }
      expect(hidden).toEqual([]);
    });
  }

  test("focus returning to the header does not scroll the page (the tour puts the page back)", async ({ page }) => {
    await page.setViewportSize(VP.laptop);
    await boot(page, { days: RET_DAYS });
    await toY(page, 900);
    await settle(page, 400);
    const y0 = await scrollY(page);
    await page.evaluate(() => document.getElementById("btn-help")?.focus());
    await page.keyboard.press("Tab");
    await page.keyboard.press("Shift+Tab");
    await settle(page, 300);
    expect(Math.abs((await scrollY(page)) - y0)).toBeLessThanOrEqual(2);
  });
});
