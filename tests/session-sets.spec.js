/**
 * Goal sets ("Rutinas por objetivo", js/session-sets.js, docs/46-SESSION-SETS.md).
 *
 * What is pinned here, each with the defect it would otherwise let through
 * (qa/mutate.mjs, set `flows`, SS1 to SS9):
 *
 * - the picker sits behind "Otras formas de practicar" and lists the sets of
 *   the track on screen, speaking as well as singing;
 * - a set runs on the guided engine as a set: its own name on the banner, its
 *   own timer per step, and a step borrowed from the other track does not
 *   carry that track's label;
 * - the step trail draws one mark per step for every routine, inside the
 *   banner, adding no height to it;
 * - a finished set ends on its own card, which says what was practised, and
 *   does not mark today's basics or pick a size;
 * - on a phone the picker is a sheet on the bottom edge that fits from 320px
 *   up, with every control at least 44px tall.
 *
 * Fixed clock in Lima: Wednesday 23 September 2026, 10:00.
 */
const { test, expect } = require("@playwright/test");
const { tapFloorLimit } = require("./helpers/tap-floor");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const NOW = "2026-09-23T10:00:00-05:00";
const TODAY = "2026-09-23";

test.use({ timezoneId: "America/Lima", locale: "es-PE" });

/** Three earlier practice days (a returning learner), and optionally what was practised today. */
function ledger(todayEx) {
  const days = {};
  ["2026-09-20", "2026-09-21", "2026-09-22"].forEach((k) => {
    days[k] = { sec: 240, n: 2, ex: ["s4-lip-trills"] };
  });
  if (todayEx) days[TODAY] = { sec: 120, n: todayEx.length, ex: todayEx };
  return { v: 1, days, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true };
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ tab?: string, lang?: string, todayEx?: string[], session?: object, toasts?: boolean, card?: boolean }} opts
 */
async function boot(page, opts = {}) {
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript(
    ({ days, tab, lang, session, toasts, card }) => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", lang);
        sessionStorage.setItem("vt_e2e", "1");
        if (card) sessionStorage.setItem("vt_sets_e2e", "1");
        if (toasts) sessionStorage.setItem("vt_debug", "1");
        if (!sessionStorage.getItem("vt_seeded")) {
          sessionStorage.setItem("vt_seeded", "1");
          localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: tab }));
          localStorage.setItem("vt_days_v1", JSON.stringify(days));
          if (session) localStorage.setItem("vt_session_v1", JSON.stringify(session));
        }
      } catch {
        /* ignore */
      }
    },
    {
      days: ledger(opts.todayEx),
      tab: opts.tab || "vocal",
      lang: opts.lang || "es",
      session: opts.session || null,
      toasts: !!opts.toasts,
      card: opts.card !== false
    }
  );
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && !!window.VTLoop && !!window.VTDays && !!window.VTSets);
  await page.clock.runFor(500);
}

async function openSheet(page) {
  const more = page.locator("#btn-more-ways");
  if ((await more.getAttribute("aria-expanded")) === "false") await more.click();
  await page.locator("#btn-sets").click();
  await expect(page.locator("#sets-sheet")).toBeVisible();
  // The sheet rises over 0.22 s: measure it where it comes to rest, not on the way.
  await page.evaluate(() => document.getAnimations().forEach((a) => a.finish()));
}

async function startSet(page, id) {
  await openSheet(page);
  await page.locator(`[data-set-start="${id}"]`).click();
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  await page.clock.runFor(300);
}

/** The trail's marks as a string: "d" done, "n" now, "." to come. */
const trail = (page) =>
  page.evaluate(() =>
    [...document.querySelectorAll("#session-trail:not([hidden]) i")]
      .map((i) => (i.classList.contains("is-done") ? "d" : i.classList.contains("is-now") ? "n" : "."))
      .join("")
  );

const session = (page) => page.evaluate(() => window.VTStorage.getSession());

async function next(page) {
  await page.locator("#btn-next-structured").click();
  await page.clock.runFor(300);
}

test.describe("Goal sets: the picker", () => {
  test("it sits behind Otras formas de practicar and lists the speaking sets on Hablar", async ({ page }) => {
    await boot(page, { tab: "vocal" });
    const open = page.locator("#btn-sets");
    await expect(open).toBeHidden();
    await page.locator("#btn-more-ways").click();
    await expect(open).toBeVisible();
    await expect(open).toHaveText("Rutinas por objetivo");
    expect((await open.boundingBox()).height).toBeGreaterThanOrEqual(tapFloorLimit(44));
    // Still one primary on the panel: the sets are an alternative, not a second start.
    expect(await page.locator("#start-panel .btn-practice").count()).toBe(1);

    await open.click();
    const sheet = page.locator("#sets-sheet");
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute("aria-modal", "true");
    await expect(page.locator("#sets-title")).toHaveText("Rutinas por objetivo");
    await expect(page.locator("#sets-sub")).toContainText("al hablar");
    const names = await page.locator(".set-card h4").allTextContents();
    expect(names).toEqual(["Antes de hablar", "Después de hablar mucho", "Que se te entienda", "Voz con expresión", "Pausas en vez de muletillas"]);
    // Opening the picker starts nothing.
    await expect(page.locator("#view-home")).toHaveClass(/active/);
    expect(await session(page)).toBeNull();
  });

  test("on Cantar it lists the singing sets, each with minutes, steps, a grade and a start", async ({ page }) => {
    await boot(page, { tab: "singing" });
    await openSheet(page);
    await expect(page.locator("#sets-sub")).toContainText("al cantar");
    const cards = await page.evaluate(() =>
      [...document.querySelectorAll(".set-card")].map((c) => ({
        id: c.dataset.set,
        meta: c.querySelector(".set-meta").textContent,
        steps: [...c.querySelectorAll(".set-steps li")].map((li) => li.textContent.trim()),
        grade: c.querySelector(".set-grade").textContent.trim(),
        on: c.querySelectorAll(".set-grade-dots .is-on").length,
        dots: c.querySelectorAll(".set-grade-dots i").length,
        start: c.querySelector(".set-start").textContent.trim()
      }))
    );
    expect(cards.map((c) => c.id)).toEqual(["s-warmup", "s-pitch", "s-technique", "s-range", "s-cooldown"]);
    expect(cards[0].meta).toBe("8 min · 6 pasos");
    expect(cards[0].steps).toEqual(["soltar mandíbula", "respiración", "trinos", "sirenas", "hum", "escala de cinco notas"]);
    for (const c of cards) {
      expect(c.start, c.id).toBe("▶ Empezar");
      expect(c.dots, c.id).toBe(3);
      // The grade is written out; the marks only repeat it, and none is drawn full.
      expect(c.grade, c.id).toMatch(/^(Respaldo moderado|Respaldo limitado|Tradición de clase)$/);
      expect(c.on, c.id).toBe({ "Respaldo moderado": 2, "Respaldo limitado": 1, "Tradición de clase": 0 }[c.grade]);
      // A short name for every step, never an id or a catalogue title in brackets.
      for (const s of c.steps) expect(s, c.id).toMatch(/^[a-záéíóúñ][a-záéíóúñ S]{2,23}$/);
    }
    expect(cards.find((c) => c.id === "s-range").grade).toBe("Tradición de clase");
  });

  test("Por qué opens the reason, the limits and the source; nothing promises prevention", async ({ page }) => {
    await boot(page, { tab: "vocal" });
    await openSheet(page);
    const card = page.locator('.set-card[data-set="v-aftertalk"]');
    const why = card.locator(".set-why");
    await expect(why.locator("p").first()).toBeHidden();
    await why.locator("summary").click();
    await expect(why.locator("p").first()).toContainText("114 docentes");
    await expect(why.locator("p").first()).toContainText("un solo estudio");
    await expect(why.locator(".set-src")).toHaveText("Fuente: Peng et al. 2026, ensayo aleatorizado");
    await expect(card.locator(".set-grade")).toHaveText("Respaldo moderado");
    expect((await why.locator("summary").boundingBox()).height).toBeGreaterThanOrEqual(tapFloorLimit(44));
    const text = await page.locator("#sets-list").innerText();
    expect(text).not.toMatch(/previene|cura\b|garantiza|diagn/i);
  });

  test("Escape closes it and gives the focus back; so does a press outside the card", async ({ page }) => {
    await boot(page, { tab: "vocal" });
    await openSheet(page);
    await expect(page.locator("#sets-close")).toBeFocused();
    await expect(page.locator("#sets-close")).toHaveAccessibleName("Cerrar");
    await page.keyboard.press("Escape");
    await expect(page.locator("#sets-sheet")).toBeHidden();
    await expect(page.locator("#btn-sets")).toBeFocused();

    await page.locator("#btn-sets").click();
    await expect(page.locator("#sets-sheet")).toBeVisible();
    await page.locator("#sets-sheet").click({ position: { x: 8, y: 8 } });
    await expect(page.locator("#sets-sheet")).toBeHidden();
  });

  test("it closes when the page under it changes", async ({ page }) => {
    await boot(page, { tab: "vocal" });
    // Plan, then Back to Practicar, so that the browser's Forward leads off home again.
    await page.locator("#btn-plan").click();
    await expect(page.locator("#view-plan")).toHaveClass(/active/);
    await page.goBack();
    await expect(page.locator("#view-home")).toHaveClass(/active/);
    await page.clock.runFor(300);
    await openSheet(page);
    await page.goForward();
    await expect(page.locator("#view-plan")).toHaveClass(/active/);
    await expect(page.locator("#sets-sheet")).toBeHidden();
  });

  test("English reads in its own words", async ({ page }) => {
    await boot(page, { tab: "vocal", lang: "en" });
    await page.locator("#btn-more-ways").click();
    await expect(page.locator("#btn-sets")).toHaveText("Routines by goal");
    await page.locator("#btn-sets").click();
    await expect(page.locator(".set-card h4").first()).toHaveText("Before you speak");
    await expect(page.locator(".set-meta").first()).toHaveText("5 min · 4 steps");
    await expect(page.locator(".set-grade").first()).toHaveText("Limited support");
    await expect(page.locator(".set-start").first()).toHaveText("▶ Start");
  });

  test("a set whose steps were all practised today says so, in words and with a tick per step", async ({ page }) => {
    await boot(page, { tab: "vocal", todayEx: ["s17-jaw-neck-release", "s6-straw", "v1-diction"] });
    await openSheet(page);
    const done = page.locator('.set-card[data-set="v-aftertalk"]');
    await expect(done.locator(".set-today")).toHaveText("✓ Hoy ya practicaste todos sus pasos");
    await expect(done.locator(".set-steps li.is-done")).toHaveCount(2);
    await expect(done.locator(".set-steps li").first()).toContainText("(practicado hoy)");
    // One step of three is not the set.
    const partly = page.locator('.set-card[data-set="v-clarity"]');
    await expect(partly.locator(".set-today")).toHaveCount(0);
    await expect(partly.locator(".set-steps li.is-done")).toHaveCount(1);
  });
});

test.describe("Goal sets: running one", () => {
  test("a set runs as a set: its name, its timers, a mark per step, no other track's label", async ({ page }) => {
    await boot(page, { tab: "vocal", toasts: true });
    await startSet(page, "v-aftertalk");
    await expect(page.locator("#sets-sheet")).toBeHidden();
    const s = await session(page);
    expect(s.path).toBe("set");
    expect(s.set).toBe("v-aftertalk");
    expect(s.track).toBe("vocal");
    expect(s.order).toEqual(["s17-jaw-neck-release", "s6-straw"]);
    // One short line, said once: the set and its size.
    await expect(page.locator("#toast")).toHaveText("Después de hablar mucho: 2 pasos");

    await expect(page.locator("#session-banner-text")).toHaveText("Ejercicio 1 de 2 · Después de hablar mucho");
    // The set's 1:30, not the exercise's own 2:00.
    await expect(page.locator("#timer-display")).toHaveText("01:30");
    expect(await trail(page)).toBe("n.");
    // A singing warm-up borrowed by a speaking set is a step of that set, not "Canto".
    await expect(page.locator("#ex-track-badge")).toHaveText("Básicos · calentamiento");
    await expect(page.locator("#ex-track-badge")).toHaveAttribute("data-track", "vocal");

    await next(page);
    await expect(page.locator("#session-banner-text")).toHaveText("Ejercicio 2 de 2 · Después de hablar mucho");
    // 4:00 of the straw's own 6:00.
    await expect(page.locator("#timer-display")).toHaveText("04:00");
    expect(await trail(page)).toBe("dn");
    await expect(page.locator("#ex-track-badge")).toHaveAttribute("data-track", "vocal");
  });

  test("the trail lies inside the banner, adds no height, and takes no press", async ({ page }) => {
    await boot(page, { tab: "singing" });
    await startSet(page, "s-warmup");
    const g = await page.evaluate(() => {
      const banner = document.querySelector("#session-banner").getBoundingClientRect();
      const t = document.querySelector("#session-trail");
      const r = t.getBoundingClientRect();
      return {
        bannerH: banner.height,
        fromBottom: banner.bottom - r.bottom,
        inside: r.left >= banner.left && r.right <= banner.right && r.top >= banner.top,
        h: r.height,
        pointer: getComputedStyle(t).pointerEvents,
        hidden: t.getAttribute("aria-hidden"),
        marks: t.children.length,
        widths: [...t.children].map((i) => i.getBoundingClientRect().width)
      };
    });
    expect(g.marks).toBe(6);
    expect(g.inside).toBe(true);
    expect(g.bannerH).toBeLessThanOrEqual(60);
    expect(g.h).toBeLessThanOrEqual(4);
    expect(g.fromBottom).toBeGreaterThanOrEqual(0);
    expect(g.fromBottom).toBeLessThanOrEqual(6);
    expect(g.pointer).toBe("none");
    expect(g.hidden).toBe("true");
    for (const w of g.widths) expect(w).toBeGreaterThanOrEqual(8);
    // Ending the routine takes the trail away with the banner.
    await page.locator("#btn-session-end").click();
    await page.clock.runFor(300);
    await expect(page.locator("#session-banner")).not.toHaveClass(/visible/);
    expect(await trail(page)).toBe("");
  });

  test("today's basics draw the same trail", async ({ page }) => {
    await boot(page, { tab: "singing" });
    await page.locator("#btn-next-step").click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await page.clock.runFor(300);
    expect((await session(page)).path).toBe("basics");
    expect(await trail(page)).toBe("n.");
    await next(page);
    expect(await trail(page)).toBe("dn");
  });

  test("a reload keeps the set: same name, same step, same timers", async ({ page }) => {
    await boot(page, { tab: "vocal" });
    await startSet(page, "v-clarity");
    await next(page);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTApp && !!window.VTSets);
    await page.clock.runFor(500);
    await expect(page.locator("#session-banner-text")).toHaveText("Ejercicio 2 de 3 · Que se te entienda");
    expect(await trail(page)).toBe("dn.");
    expect((await session(page)).sec).toEqual({ "v1-diction": 150, "v10-power-pause": 150, "v14-pace-variation": 150 });
  });

  test("a stored set this build does not know keeps a name and ends as a plain routine", async ({ page }) => {
    await boot(page, {
      tab: "vocal",
      session: {
        mode: "structured",
        track: "vocal",
        path: "set",
        set: "v-retired",
        order: ["v1-diction", "v2-volume"],
        index: 1,
        status: "active",
        startedAt: "2026-09-23T14:00:00.000Z",
        pausedAt: null,
        completedIds: ["v1-diction"],
        sec: { "v1-diction": 60, "v2-volume": 60 }
      }
    });
    await expect(page.locator("#session-banner-text")).toHaveText("Ejercicio 2 de 2 · Rutina por objetivo");
    expect(await trail(page)).toBe("dn");
    // Its ending is not claimed by the sets: the plain ending follows (tests/node/session-sets.test.mjs).
    expect(await page.evaluate(() => window.VTSets.onComplete(window.VTStorage.getSession()))).toBe(false);
  });
});

test.describe("Goal sets: the ending", () => {
  test("a finished set ends on its card: what was practised, no score, basics untouched", async ({ page }) => {
    // The first step was practised earlier today; the second is walked through without a sound.
    await boot(page, { tab: "vocal", todayEx: ["s17-jaw-neck-release"] });
    await startSet(page, "v-aftertalk");
    await next(page);
    await next(page);
    await expect(page.locator("#view-home")).toHaveClass(/active/);
    const card = page.locator("#set-done");
    await expect(card).toBeVisible();
    await expect(page.locator("#set-done-kicker")).toHaveText("Rutina terminada");
    await expect(page.locator("#set-done-title")).toHaveText("Después de hablar mucho");
    await expect(page.locator("#set-done-steps li")).toHaveCount(2);
    await expect(page.locator("#set-done-steps li.is-done")).toHaveCount(1);
    await expect(page.locator("#set-done-steps li").nth(0)).toHaveText(/✓\s*soltar mandíbula\s*\(practicado hoy\)/);
    await expect(page.locator("#set-done-steps li").nth(1)).toHaveText(/·\s*pajita\s*\(sin practicar\)/);
    await expect(page.locator("#set-done-line")).toHaveText("Practicaste 1 de 2 pasos. Lo practicado ya cuenta en tu día.");
    await expect(page.locator("#set-done-tip")).toHaveText(/cinco minutos sin hablar/);
    await expect(page.locator("#set-done-close")).toBeFocused();
    for (const id of ["#set-done-close", "#set-done-more"]) {
      expect((await page.locator(id).boundingBox()).height, id).toBeGreaterThanOrEqual(tapFloorLimit(44));
    }
    // A set is not today's basics: no size picked, no basics mark on the day, no routine counted.
    const kept = await page.evaluate((today) => {
      const days = JSON.parse(localStorage.getItem("vt_days_v1"));
      const loop = JSON.parse(localStorage.getItem("vt_loop_v1") || "{}");
      return { basics: days.days[today].basics || 0, completions: loop.completions || 0, tierAt: loop.tierAt || null };
    }, TODAY);
    expect(kept).toEqual({ basics: 0, completions: 0, tierAt: null });
    await expect(page.locator("#loop-done")).toBeHidden();
    expect((await session(page)).status).toBe("completed");

    await page.locator("#set-done-close").click();
    await expect(card).toBeHidden();
  });

  test("walked through without a sound, the card says so and judges nothing", async ({ page }) => {
    await boot(page, { tab: "singing" });
    await startSet(page, "s-cooldown");
    for (let i = 0; i < 3; i += 1) await next(page);
    await expect(page.locator("#set-done")).toBeVisible();
    await expect(page.locator("#set-done-steps li.is-done")).toHaveCount(0);
    await expect(page.locator("#set-done-line")).toHaveText("Recorriste la rutina sin usar la voz. El día cuenta cuando suena.");
    // No tip for this set: the line is not left as an empty box.
    await expect(page.locator("#set-done-tip")).toBeHidden();
    const text = await page.locator("#set-done").innerText();
    expect(text).not.toMatch(/mal|fall|error|puntos|score|%/i);
  });

  test("Otra rutina goes back to the picker; Escape closes the card", async ({ page }) => {
    await boot(page, { tab: "singing" });
    await startSet(page, "s-cooldown");
    for (let i = 0; i < 3; i += 1) await next(page);
    await page.locator("#set-done-more").click();
    await expect(page.locator("#set-done")).toBeHidden();
    await expect(page.locator("#sets-sheet")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#sets-sheet")).toBeHidden();
  });

  test("the specs' quiet mode skips the card and still claims the ending", async ({ page }) => {
    await boot(page, { tab: "singing", card: false, toasts: true });
    await startSet(page, "s-cooldown");
    for (let i = 0; i < 3; i += 1) await next(page);
    await expect(page.locator("#view-home")).toHaveClass(/active/);
    await expect(page.locator("#set-done")).toBeHidden();
    await expect(page.locator("#toast")).not.toContainText("Sesión guiada completa");
  });
});

const PHONES = [
  [320, 568],
  [344, 882],
  [360, 740],
  [375, 667],
  [390, 844],
  [412, 915],
  [430, 932]
];
const WIDE = [
  [844, 390],
  [744, 1133],
  [820, 1180],
  [1024, 1366],
  [1366, 768],
  [1920, 1080]
];

/** Geometry of the open picker: the card, every control, and whether anything spills sideways. */
const sheetGeometry = (page) =>
  page.evaluate(() => {
    const card = document.querySelector(".sets-card").getBoundingClientRect();
    const list = document.querySelector("#sets-list");
    const box = (el) => {
      const r = el.getBoundingClientRect();
      return { w: r.width, h: r.height, left: r.left, right: r.right };
    };
    return {
      vw: innerWidth,
      vh: innerHeight,
      pageW: document.documentElement.scrollWidth,
      card: { left: card.left, right: card.right, top: card.top, bottom: card.bottom },
      listScrolls: list.scrollWidth <= list.clientWidth + 1,
      starts: [...document.querySelectorAll(".set-start")].map(box),
      summaries: [...document.querySelectorAll(".set-why summary")].map(box),
      close: box(document.querySelector("#sets-close")),
      cards: [...document.querySelectorAll(".set-card")].map(box),
      heads: [...document.querySelectorAll(".set-head")].map((h) => h.scrollWidth <= h.clientWidth + 1)
    };
  });

function expectSheetFits(g, label) {
  expect(g.pageW, label).toBeLessThanOrEqual(g.vw);
  expect(g.card.left, label).toBeGreaterThanOrEqual(0);
  expect(g.card.right, label).toBeLessThanOrEqual(g.vw + 0.5);
  expect(g.card.top, label).toBeGreaterThanOrEqual(0);
  expect(g.card.bottom, label).toBeLessThanOrEqual(g.vh + 0.5);
  expect(g.listScrolls, label).toBe(true);
  expect(g.close.w, label).toBeGreaterThanOrEqual(tapFloorLimit(44));
  expect(g.close.h, label).toBeGreaterThanOrEqual(tapFloorLimit(44));
  for (const b of [...g.starts, ...g.summaries]) expect(b.h, label).toBeGreaterThanOrEqual(tapFloorLimit(44));
  for (const c of g.cards) {
    expect(c.left, label).toBeGreaterThanOrEqual(g.card.left);
    expect(c.right, label).toBeLessThanOrEqual(g.card.right + 0.5);
  }
  // A set's name and its minutes share a line without running into each other.
  expect(g.heads.every(Boolean), label).toBe(true);
}

test.describe("Goal sets: layout", () => {
  for (const [w, h] of PHONES) {
    test(`at ${w}×${h} the picker is a sheet on the bottom edge and everything fits`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      for (const tab of ["vocal", "singing"]) {
        await boot(page, { tab });
        await openSheet(page);
        const g = await sheetGeometry(page);
        expectSheetFits(g, `${tab} ${w}×${h}`);
        // A sheet: full width, on the bottom edge, with the page still showing above it.
        expect(g.card.left).toBe(0);
        expect(Math.round(g.card.right)).toBe(w);
        expect(Math.round(g.card.bottom)).toBe(h);
        expect(g.card.top).toBeGreaterThanOrEqual(24);
        for (const b of g.starts) expect(b.w).toBeGreaterThanOrEqual(w - 80);
        // The last set's button can be scrolled into view inside the sheet.
        const last = page.locator(".set-start").last();
        await last.scrollIntoViewIfNeeded();
        const box = await last.boundingBox();
        expect(box.y + box.height).toBeLessThanOrEqual(h + 0.5);
        expect(box.y).toBeGreaterThanOrEqual(g.card.top);
      }
    });
  }

  for (const [w, h] of WIDE) {
    test(`at ${w}×${h} the picker is a centred card and everything fits`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await boot(page, { tab: "singing" });
      await openSheet(page);
      const g = await sheetGeometry(page);
      expectSheetFits(g, `${w}×${h}`);
      // Centred, with the page showing on both sides.
      expect(Math.abs(g.card.left - (g.vw - g.card.right))).toBeLessThanOrEqual(2);
      expect(g.card.left).toBeGreaterThan(0);
      // More than one column where there is room for two cards of 300px.
      const firstRow = g.cards.filter((c) => Math.abs(c.left - g.cards[0].left) > 1).length;
      expect(firstRow).toBeGreaterThan(0);
    });
  }

  test("a drag down on the handle closes the sheet on a touch screen; a short drag does not", async ({ browser }) => {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, timezoneId: "America/Lima", locale: "es-PE" });
    const page = await ctx.newPage();
    await boot(page, { tab: "vocal" });
    await openSheet(page);
    const drag = (dy) =>
      page.evaluate((d) => {
        const h = document.querySelector("#sets-handle");
        const r = h.getBoundingClientRect();
        const at = (type, y) =>
          h.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: "touch", pointerId: 7, clientX: r.left + r.width / 2, clientY: y }));
        at("pointerdown", r.top + 4);
        at("pointermove", r.top + 4 + d / 2);
        at("pointermove", r.top + 4 + d);
        at("pointerup", r.top + 4 + d);
      }, dy);
    await drag(30);
    await expect(page.locator("#sets-sheet")).toBeVisible();
    expect(await page.evaluate(() => document.querySelector(".sets-card").style.transform)).toBe("");
    await drag(140);
    await expect(page.locator("#sets-sheet")).toBeHidden();
    await ctx.close();
  });

  test("the finishing card fits a small phone and a phone on its side, buttons on screen", async ({ page }) => {
    for (const [w, h] of [
      [320, 568],
      [390, 844],
      [844, 390],
      [667, 375]
    ]) {
      await page.setViewportSize({ width: w, height: h });
      await boot(page, { tab: "singing" });
      await page.evaluate(() => window.VTSets.showDone(window.VTSets.resolve("s-warmup")));
      await expect(page.locator("#set-done")).toBeVisible();
      const g = await page.evaluate(() => {
        const card = document.querySelector(".set-done-card").getBoundingClientRect();
        const btn = document.querySelector("#set-done-close").getBoundingClientRect();
        return { top: card.top, bottom: card.bottom, left: card.left, right: card.right, btnBottom: btn.bottom, btnH: btn.height, pageW: document.documentElement.scrollWidth };
      });
      const label = `${w}×${h}`;
      expect(g.top, label).toBeGreaterThanOrEqual(0);
      expect(g.bottom, label).toBeLessThanOrEqual(h + 0.5);
      expect(g.left, label).toBeGreaterThanOrEqual(0);
      expect(g.right, label).toBeLessThanOrEqual(w + 0.5);
      expect(g.btnBottom, label).toBeLessThanOrEqual(h + 0.5);
      expect(g.btnH, label).toBeGreaterThanOrEqual(tapFloorLimit(44));
      expect(g.pageW, label).toBeLessThanOrEqual(w);
      await page.locator("#set-done-close").click();
    }
  });
});
