/**
 * Tu camino (js/voice-path.js) in the real page: the card in Historial, the
 * way in from home, the lines on the completion cards, the switch that hides
 * it, design "b", a phone in English, sharing, and the arm without it.
 *
 * The rules under test, each with the wrong behaviour it rules out:
 * - areas count distinct days, not sessions or minutes (a day with two takes
 *   is one day);
 * - only earned logros are listed: no locked silhouettes, no "N to go";
 * - a logro is news once: on the home button and in Historial until it has
 *   been on screen, then never again, also after a reload;
 * - a first visit on a browser with months of practice announces nothing;
 * - the completion card adds at most what fits, and never a second
 *   "welcome back" under the loop's own;
 * - hiding it hides it everywhere and takes nothing away.
 *
 * Fixed clock: Wednesday 18 November 2026, 10:00 in Lima; the week starts
 * Monday the 16th, and the default goal is 3 to 5 days.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const NOW = "2026-11-18T10:00:00-05:00";
const TODAY = "2026-11-18";

test.use({ timezoneId: "America/Lima", locale: "es-PE" });

/** A ledger row: one practice day, two takes, the exercises in practised order. */
const row = (ex, extra = {}) => ({ sec: 240, n: 2, ex, ...extra });

/**
 * Five days in two weeks, today not practised yet:
 * warm-up on four, pitch on two, breath on two; the week of 2 November has
 * three days (the goal's low end), and the 16th comes after eleven days away.
 */
const FIVE_DAYS = {
  v: 1,
  days: {
    "2026-11-02": row(["s4-lip-trills", "s27-lip-trill-solfege"]),
    "2026-11-03": row(["s4-lip-trills", "s18-costal-breath"]),
    "2026-11-04": row(["s4-lip-trills"]),
    "2026-11-16": row(["s4-lip-trills", "s9-pitch-match"]),
    "2026-11-17": row(["s18-costal-breath"])
  },
  rest: { bank: 0, earnedAt: 0, used: [] },
  backfilled: true
};

/** What a browser that has shown Tu camino before keeps. */
const RETURNING = { "g:init": true, "g:week1": true, "g:seen:week1": true, "g:back": true, "g:seen:back": true };

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ days?: object, flags?: object, loop?: object, lang?: string, query?: string, cardOn?: boolean, setsOn?: boolean, arm?: string, share?: string }} opts
 */
async function boot(page, opts = {}) {
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript(
    ({ days, flags, loop, lang, cardOn, setsOn, arm, share }) => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", lang);
        localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: "singing" }));
        sessionStorage.setItem("vt_e2e", "1");
        if (cardOn) sessionStorage.setItem("vt_loop_e2e", "1");
        if (setsOn) sessionStorage.setItem("vt_sets_e2e", "1");
        // Seed once, so a reload inside a test sees what the app wrote.
        if (!sessionStorage.getItem("vt_seeded")) {
          sessionStorage.setItem("vt_seeded", "1");
          if (days) localStorage.setItem("vt_days_v1", JSON.stringify(days));
          if (flags) localStorage.setItem("vt_achievements_v1", JSON.stringify(flags));
          if (loop) localStorage.setItem("vt_loop_v1", JSON.stringify(loop));
        }
      } catch {
        /* ignore */
      }
      if (arm) {
        // Switch path_2026_12 on, with all the weight on one arm.
        let cfg;
        Object.defineProperty(window, "VT_EXPERIMENTS", {
          configurable: true,
          get: () => cfg,
          set: (v) => {
            if (v && v.path_2026_12) {
              v.path_2026_12.enabled = true;
              v.path_2026_12.variants = ["path", "none"].map((id) => ({ id, weight: id === arm ? 1 : 0 }));
            }
            cfg = v;
          }
        });
      }
      if (share) {
        // A browser with no share sheet; the clipboard either takes the text or refuses it.
        window.__copied = [];
        Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: {
            writeText: (t) => {
              if (share === "refuse") return Promise.reject(new Error("denied"));
              window.__copied.push(t);
              return Promise.resolve();
            }
          }
        });
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
    {
      days: opts.days || null,
      flags: opts.flags || null,
      loop: opts.loop || null,
      lang: opts.lang || "es",
      cardOn: !!opts.cardOn,
      setsOn: !!opts.setsOn,
      arm: opts.arm || null,
      share: opts.share || null
    }
  );
  await page.goto(BASE + "/" + (opts.query || ""), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && !!window.VTLoop && !!window.VTPath);
  await page.clock.runFor(500);
}

/** Historial through the home button, the way a singer gets there. */
async function openFromHome(page) {
  await page.locator("#path-home-btn").click();
  await page.clock.runFor(800);
  await expect(page.locator("#path-card")).toBeVisible();
}

const logrosShown = (page) => page.locator("#path-card .path-logro").evaluateAll((els) => els.map((e) => e.dataset.logro));
const flags = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("vt_achievements_v1") || "{}"));

test.describe("Tu camino", () => {
  test("Historial counts each area in days and lists only the logros earned, nothing locked", async ({ page }) => {
    await boot(page, { days: FIVE_DAYS });
    // A first visit with this much practice already behind it: what is earned
    // is filed, and none of it is announced as new.
    await expect(page.locator("#path-home-btn")).toHaveText("Tu camino · 2 logros");
    await expect(page.locator("#path-home-btn")).not.toHaveClass(/has-new/);
    await openFromHome(page);

    const card = page.locator("#path-card");
    // The singing track's seven areas, every one shown, practised or not.
    await expect(card.locator(".path-area")).toHaveCount(7);
    // Four days, although those days held eight takes: a day is a day.
    await expect(card.locator('[data-area="warm"] .path-area-meta')).toHaveText(/^4 días · Lo probaste · esta semana$/);
    await expect(card.locator('[data-area="pitch"] .path-area-meta')).toHaveText(/^2 días · Lo probaste · esta semana$/);
    await expect(card.locator('[data-area="onset"]')).toHaveClass(/is-empty/);
    await expect(card.locator('[data-area="onset"] .path-area-meta')).toHaveText("aún no");
    // A screen reader hears each row as one sentence, with "1 día" in the singular.
    await expect(card.locator('[data-area="warm"]')).toHaveAttribute("aria-label", "Calentar y cuidar: 4 días, Lo probaste, esta semana");
    await expect(card.locator('[data-area="onset"]')).toHaveAttribute("aria-label", "Inicio y control: aún no");
    // One segment lit for the first stage, out of five.
    await expect(card.locator('[data-area="warm"] .path-pip.on')).toHaveCount(1);

    // Earned only, in the catalogue's order; nothing waiting to be unlocked.
    expect(await logrosShown(page)).toEqual(["week1", "back"]);
    await expect(card.locator(".path-logro.is-new")).toHaveCount(0);
    await expect(card).not.toContainText(/bloquead|☆|te faltan|para desbloquear/i);
    // No minutes, no notes held, no score anywhere on it.
    await expect(card).not.toContainText(/\bmin(utos)?\b|\bsegundos\b|puntos|%/i);
    await expect(page.locator("#pro-ach-grid")).toHaveCount(0);
    await expect(card.locator(".path-weeks")).toHaveText("Semanas cumpliendo tu meta: 1 · Tu mejor semana: 3 días");
  });

  test("a logro earned today is news once: on the home button, first in Historial, then just a logro", async ({ page }) => {
    const days = { ...FIVE_DAYS, days: { ...FIVE_DAYS.days, [TODAY]: row(["s4-lip-trills"], { saved: true }) } };
    await boot(page, { days, flags: RETURNING });
    // Today's rating earns "Valoraste tu práctica", and warm-up reaches five days exactly.
    const btn = page.locator("#path-home-btn");
    await expect(btn).toHaveText("Tu camino · 2 nuevos");
    await expect(btn).toHaveClass(/has-new/);

    await openFromHome(page);
    await expect(page.locator("#path-title")).toBeFocused();
    expect((await logrosShown(page))[0]).toBe("rated");
    await expect(page.locator('#path-card .path-logro[data-logro="rated"]')).toHaveClass(/is-new/);
    await expect(page.locator('#path-card .path-logro[data-logro="rated"]')).toContainText("Nuevo");
    // The new one is shown whole, the older ones folded to their titles.
    await expect(page.locator('#path-card .path-logro[data-logro="rated"] details')).toHaveCount(0);
    await expect(page.locator('#path-card .path-logro[data-logro="week1"] details')).toHaveCount(1);
    await expect(page.locator('#path-card [data-area="warm"] .path-area-meta')).toContainText("5 días · Lo practicas");

    // Once on screen it is seen.
    await expect.poll(() => page.evaluate(() => VTPath.unseen())).toEqual({ logros: [], stages: [] });
    await page.locator("#btn-nav-home").click();
    await page.clock.runFor(500);
    await expect(btn).toHaveText("Tu camino · 3 logros");
    await expect(btn).not.toHaveClass(/has-new/);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTPath);
    await page.clock.runFor(500);
    await expect(btn).toHaveText("Tu camino · 3 logros");
    const f = await flags(page);
    expect(f["g:rated"]).toBe(true);
    expect(f["g:seen:rated"]).toBe(true);
  });

  test("Historial drawn but not on screen does not count as seen", async ({ page }) => {
    // Design "b" draws the card behind the Estadísticas tab while Historial's
    // own tab is showing.
    const days = { ...FIVE_DAYS, days: { ...FIVE_DAYS.days, [TODAY]: row(["s9-pitch-match"], { saved: true }) } };
    await boot(page, { days, flags: RETURNING, query: "?version=b" });
    // Progreso opens on Historial's own tab.
    await page.locator("#btn-nav-progress").click();
    await page.clock.runFor(800);
    await expect(page.locator("#view-history")).toHaveAttribute("data-progress-tab", "history");
    await expect(page.locator("#path-card")).toBeHidden();
    await page.clock.runFor(800);
    expect((await page.evaluate(() => VTPath.unseen())).logros).toEqual(["rated"]);
    // The Estadísticas tab shows it, and then it is seen.
    await page.locator('#progress-tabs [data-progress="stats"]').click();
    await expect(page.locator("#path-card")).toBeVisible();
    await expect.poll(() => page.evaluate(() => VTPath.unseen().logros)).toEqual([]);
  });

  test("at 200% zoom the home button lands on the card's title, just below the sticky header", async ({ page }) => {
    // A 1280 × 720 laptop at 200% zoom. Reduced motion makes the scroll instant, so where it lands is final.
    // Wrong ways this catches: scrolling before Historial's calendar is drawn (the calendar then pushes the
    // card down and the title ends at the bottom of the screen), including on a draw of the card that comes
    // from elsewhere while the recordings are still being read (an account change redraws the progress
    // cards), and landing under the header (the page's scroll-padding-top keeps the header's height free).
    await page.setViewportSize({ width: 640, height: 360 });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await boot(page, { days: FIVE_DAYS, flags: RETURNING });
    await page.evaluate(() => {
      const read = VTStorage.listRecordings.bind(VTStorage);
      window.__recordingsRead = new Promise((r) => (window.__letRecordingsRead = r));
      VTStorage.listRecordings = () => window.__recordingsRead.then(read);
    });
    await page.locator("#path-home-btn").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#history-list")).toContainText(/Cargando/i);
    await page.evaluate(() => VTPath.renderCard()); // drawn from elsewhere, before the calendar
    await page.evaluate(() => window.__letRecordingsRead());
    await page.clock.runFor(800);
    await expect(page.locator("#history-list .hist-rec-empty")).toBeVisible();
    await expect(page.locator("#path-title")).toBeFocused();
    const at = () =>
      page.evaluate(() => {
        const header = document.querySelector(".app-header").getBoundingClientRect().bottom;
        return Math.round(document.querySelector("#path-title").getBoundingClientRect().top - header);
      });
    await expect.poll(at).toBeGreaterThanOrEqual(0);
    const gap = await at();
    expect(gap, "the title sits just below the header, with the card's top in view").toBeLessThanOrEqual(60);
  });

  test("design b: the home button opens Estadísticas, where the card lives, and nowhere else shows it", async ({ page }) => {
    await boot(page, { days: FIVE_DAYS, query: "?version=b" });
    await openFromHome(page);
    await expect(page.locator("#view-history")).toHaveAttribute("data-progress-tab", "stats");
    await expect(page.locator("#path-title")).toBeFocused();
    await page.locator('#progress-tabs [data-progress="profiles"]').click();
    await expect(page.locator("#path-card")).toBeHidden();
    await page.locator('#progress-tabs [data-progress="history"]').click();
    await expect(page.locator("#path-card")).toBeHidden();
  });

  test("the completion card names what the Mínimo brought, and no second welcome back", async ({ page }) => {
    // Two steps of 40 s of fake time each, drawn frame by frame (see daily-loop.spec.js).
    test.setTimeout(150000);
    // Six days of basics, then eleven days away: today's Mínimo is a comeback
    // and the seventh day with the basics finished.
    const days = {};
    ["2026-11-02", "2026-11-03", "2026-11-04", "2026-11-05", "2026-11-06", "2026-11-07"].forEach((k) => {
      days[k] = row(["s4-lip-trills", "s27-lip-trill-solfege"], { basics: 1 });
    });
    await boot(page, {
      days: { v: 1, days, rest: { bank: 0, earnedAt: 0, used: [] }, backfilled: true },
      flags: { "g:init": true, "g:week1": true, "g:seen:week1": true },
      cardOn: true
    });
    await page.locator("#btn-next-step").click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    for (let i = 0; i < 2; i += 1) {
      await page.locator("#btn-practice-start").click();
      await page.clock.runFor(40000);
      await page.evaluate(() => window.VTApp.advanceStructured("next"));
      await page.clock.runFor(400);
    }
    const card = page.locator("#loop-done");
    await expect(card).toBeVisible();
    const extra = page.locator("#loop-done-extra");
    await expect(extra.locator('.path-done[data-logro="basics7"]')).toContainText("Tus básicos, 7 días");
    // "De vuelta" is earned, but the loop's own line already says welcome back.
    await expect(extra.locator('[data-logro="back"]')).toHaveCount(0);
    await expect(extra.locator(".path-done")).toHaveCount(1);
    const f = await flags(page);
    expect(f["g:back"]).toBe(true);
    expect(f["g:seen:back"]).toBe(true);
    expect(f["g:seen:basics7"]).toBe(true);
    // The card still closes from its own button, on screen.
    await expect(page.locator("#loop-done-close")).toBeInViewport();
    await page.locator("#loop-done-close").click();
    await expect(card).toBeHidden();
    // Shown on the card, so not news again at home.
    await expect(page.locator("#path-home-btn")).toHaveText("Tu camino · 3 logros");
  });

  test("a goal set finished with half its steps is kept, and its card says what it brought", async ({ page }) => {
    const days = { ...FIVE_DAYS, days: { ...FIVE_DAYS.days, [TODAY]: row(["s5-sirens", "s6-straw"]) } };
    await boot(page, { days, flags: RETURNING, setsOn: true });
    // Two of the cool-down's three steps practised today.
    await page.evaluate(() => VTSets.onComplete({ path: "set", set: "s-cooldown" }));
    await expect(page.locator("#set-done")).toBeVisible();
    const lines = page.locator("#set-done-path .path-done");
    await expect(lines).toHaveCount(2);
    await expect(lines.nth(0)).toHaveAttribute("data-logro", "set");
    await expect(lines.nth(1)).toHaveAttribute("data-logro", "cool");
    await expect(page.locator("#set-done-path")).not.toContainText(/previene|lesi[oó]n(es)? evitad|garantiza/i);
    expect((await flags(page))["g:set:s-cooldown"]).toBe(true);
  });

  test("a goal set left after one step of three is not kept", async ({ page }) => {
    const days = { ...FIVE_DAYS, days: { ...FIVE_DAYS.days, [TODAY]: row(["s5-sirens"]) } };
    await boot(page, { days, flags: RETURNING, setsOn: true });
    await page.evaluate(() => VTSets.onComplete({ path: "set", set: "s-cooldown" }));
    await expect(page.locator("#set-done")).toBeVisible();
    await expect(page.locator("#set-done-path")).toBeHidden();
    const f = await flags(page);
    expect(f["g:set:s-cooldown"]).toBeUndefined();
    expect(f["g:set"]).toBeUndefined();
  });

  test("Ocultar hides it everywhere, keeps every logro, and stays hidden after a reload", async ({ page }) => {
    await boot(page, { days: FIVE_DAYS });
    await openFromHome(page);
    // On a laptop (1280 px) the site's small buttons are 32 px tall; the switch stays a full 44 px target,
    // which the phone rules give every small button anyway.
    const box = await page.locator("#path-toggle").boundingBox();
    expect(Math.round(box.height)).toBeGreaterThanOrEqual(44);
    await page.locator("#path-toggle").click();
    await expect(page.locator("#path-body")).toContainText("Tu camino está oculto");
    await expect(page.locator("#path-card [data-path-show]")).toBeFocused();
    await expect(page.locator("#path-card .path-logro")).toHaveCount(0);
    expect(await page.evaluate(() => VTPath.earned())).toEqual(["week1", "back"]);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("vt_loop_v1")).pathOff)).toBe(true);

    await page.locator("#btn-nav-home").click();
    await page.clock.runFor(500);
    await expect(page.locator("#path-home-btn")).toBeHidden();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTPath);
    await page.clock.runFor(500);
    await expect(page.locator("#path-home-btn")).toBeHidden();

    await page.locator("#btn-history").click();
    await page.clock.runFor(800);
    await page.locator("#path-card [data-path-show]").click();
    await expect(page.locator("#path-toggle")).toBeFocused();
    expect(await logrosShown(page)).toEqual(["week1", "back"]);
  });

  test("on a phone in English it fits, reads, and every control is a full-size target", async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await boot(page, { days: FIVE_DAYS, lang: "en" });
    await expect(page.locator("#path-home-btn")).toHaveText("Your path · 2 milestones");
    await openFromHome(page);
    const card = page.locator("#path-card");
    await expect(page.locator("#path-title")).toHaveText("Your path");
    await expect(card.locator('[data-area="warm"] .path-area-name')).toHaveText("Warm-up and care");
    await expect(card).not.toContainText(/días|logro|Calentar/);
    const m = await page.evaluate(() => {
      const c = document.querySelector("#path-card");
      const small = [...c.querySelectorAll("*")]
        .filter((e) => e.childElementCount === 0 && e.textContent.trim() && e.getClientRects().length)
        .map((e) => parseFloat(getComputedStyle(e).fontSize))
        .filter((px) => px < 12);
      const targets = [...c.querySelectorAll("button, summary")]
        .filter((e) => e.getClientRects().length)
        .map((e) => Math.round(e.getBoundingClientRect().height));
      return { overflow: document.documentElement.scrollWidth - innerWidth, wider: c.scrollWidth - c.clientWidth, small, targets };
    });
    expect(m.overflow).toBeLessThanOrEqual(0);
    expect(m.wider).toBeLessThanOrEqual(0);
    expect(m.small).toEqual([]);
    expect(m.targets.length).toBeGreaterThanOrEqual(3);
    for (const h of m.targets) expect(h).toBeGreaterThanOrEqual(44);
    // A folded milestone opens to say why it matters.
    const week = card.locator('.path-logro[data-logro="week1"]');
    await week.locator("summary").click();
    await expect(week.locator("details > p")).toBeVisible();
  });

  test("Compartir copies the week's sentence when there is no share sheet", async ({ page }) => {
    await boot(page, { days: FIVE_DAYS, share: "copy" });
    await openFromHome(page);
    await page.locator("#path-card [data-path-share]").click();
    await expect(page.locator("#path-card .path-share-status")).toHaveText("Copiado. Pégalo donde quieras.");
    const copied = await page.evaluate(() => window.__copied);
    expect(copied).toHaveLength(1);
    expect(copied[0]).toBe(
      `Esta semana practiqué mi voz 2 días (mi meta: 3 a 5). Llevo 5 días de práctica. Entreno con Entrenamiento vocal y de canto: ${BASE}/`
    );
    // Nothing about the person: no address, no name, no logro list.
    expect(copied[0]).not.toMatch(/@|De vuelta|Una semana/);
  });

  test("when the clipboard refuses, the sentence is shown to copy by hand", async ({ page }) => {
    await boot(page, { days: FIVE_DAYS, share: "refuse" });
    await openFromHome(page);
    await page.locator("#path-card [data-path-share]").click();
    await expect(page.locator("#path-card .path-share-status")).toContainText("No se pudo compartir. Este es el texto: Esta semana practiqué mi voz 2 días");
  });

  test("warming up before the song is heard from the takes as they are sung, not from a row's order", async ({ page }) => {
    // Two exercises sung through the exercise screen, the way a singer does: the order is judged when the
    // song's take is recorded. A backfilled row listing trills before the song (today, before any take) is
    // no evidence on its own.
    test.setTimeout(120000);
    const days = { ...FIVE_DAYS, days: { ...FIVE_DAYS.days, "2026-11-17": row(["s4-lip-trills", "s3-song-stanzas"]) } };
    await boot(page, { days, flags: RETURNING });
    expect(await page.evaluate(() => VTPath.earned())).not.toContain("warmfirst");
    const sing = async (id) => {
      await page.evaluate((x) => window.VTApp.openExercise(x), id);
      await page.clock.runFor(400);
      await page.locator("#btn-practice-start").click();
      // Fifty seconds jumped over, not ticked through (see ab-events.spec.js).
      await page.clock.fastForward(50000);
      await page.clock.runFor(500);
      // Stop, and save from the rating card the stop opens.
      await page.locator("#btn-practice-stop").click();
      await page.clock.runFor(800);
      await page.locator("#btn-complete").click();
      await page.clock.runFor(1500);
    };
    await sing("s4-lip-trills");
    expect((await flags(page))["g:ev:warmfirst"], "control: trills alone are no evidence").toBeUndefined();
    await sing("s3-song-stanzas");
    expect((await flags(page))["g:ev:warmfirst"]).toBe(true);
    expect(await page.evaluate(() => VTPath.earned())).toContain("warmfirst");
  });

  test("the arm without it shows nothing, earns nothing, and is still counted as exposed", async ({ page }) => {
    await boot(page, { days: FIVE_DAYS, arm: "none" });
    await expect(page.locator("#path-home-btn")).toBeHidden();
    await page.locator("#btn-history").click();
    await page.clock.runFor(800);
    await expect(page.locator("#path-card")).toBeHidden();
    await expect(page.locator("#pro-ach-grid")).toHaveCount(0);
    const f = await flags(page);
    expect(Object.keys(f).filter((k) => k.startsWith("g:"))).toEqual([]);
    expect(await page.evaluate(() => VTExperiments.report().experiments.path_2026_12.exposed)).toBe("none");
  });

  test("the arm with it is counted as exposed on the same screen", async ({ page }) => {
    await boot(page, { days: FIVE_DAYS, arm: "path" });
    await expect(page.locator("#path-home-btn")).toBeVisible();
    expect(await page.evaluate(() => VTExperiments.report().experiments.path_2026_12.exposed)).toBe("path");
  });
});
