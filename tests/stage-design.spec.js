/**
 * The practice stage while practising, designs chosen in the A/B review:
 *
 *  - start-floor: every control on the stage at least 44px tall on a phone,
 *    every word at least 12px; lip trills, straws and the rate ladder leave
 *    out the chord and play-mode menus; the octave number, the range box and
 *    the level meter say what they are; Empezar gets its own row.
 *  - coach-strip: a pitch exercise's mode and cue sit in a strip on the stage
 *    under the top controls, lanes below; without a canvas the stage guide
 *    holds the step the clock is on, "Ahora · paso n de N".
 *  - session-chrome: the guided session's banner is one line with Pausar
 *    (Reanudar) and Terminar in words.
 *  - landscape: a phone on its side hides the site header while an exercise is
 *    open; in a routine, Pausar and Terminar share the exercise header's one
 *    row; nothing covers the mode panel's title; the stage fits the screen at
 *    rest (VG-30).
 *  - The bars that stay over the stage are solid, and the stage guide's button
 *    keeps its words inside the pill.
 *  - The pitch-match challenge scores against the note it asks for, not the
 *    nearest chord lane.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const NOW = "2026-09-23T10:00:00-05:00";
const MOBILE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";

function ledger(dayKeys) {
  const days = {};
  dayKeys.forEach((k) => {
    days[k] = { sec: 240, n: 2, ex: ["s4-lip-trills"] };
  });
  return { v: 1, days, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true };
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ lang?: string, clock?: boolean }} opts
 */
async function boot(page, opts = {}) {
  if (opts.clock !== false) await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript(
    ({ lang, days }) => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", lang);
        localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: "singing" }));
        sessionStorage.setItem("vt_e2e", "1");
        if (!sessionStorage.getItem("vt_seeded")) {
          sessionStorage.setItem("vt_seeded", "1");
          localStorage.setItem("vt_days_v1", JSON.stringify(days));
        }
      } catch {
        /* ignore */
      }
      // A silent microphone: the stage goes live without a permission prompt
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
      if (!navigator.mediaDevices) {
        Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
      }
      navigator.mediaDevices.getUserMedia = fakeGUM;
      if (typeof MediaDevices !== "undefined") MediaDevices.prototype.getUserMedia = fakeGUM;
    },
    { lang: opts.lang || "es", days: ledger(["2026-09-20", "2026-09-21", "2026-09-22"]) }
  );
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && !!window.VTLoop && !!window.VTSession);
  if (opts.clock !== false) await page.clock.runFor(500);
}

const live = (page) => page.evaluate(() => !!window.VTApp.getState().practiceLive);

async function open(page, id) {
  await page.evaluate((x) => window.VTApp.openExercise(x), id);
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  await page.waitForTimeout(300);
}

async function start(page) {
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => live(page), { timeout: 10000 }).toBe(true);
}

/** Today's Mínimo: s4 lip trills, then s27. */
async function startMinimo(page) {
  await page.locator("#btn-next-step").click();
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  await expect(page.locator("#session-banner")).toHaveClass(/visible/);
}

/** Visible controls under 44px and words under 12px, in the exercise view and the banner. */
function floorAudit() {
  const small = [];
  const tiny = [];
  const roots = [document.getElementById("view-exercise"), document.getElementById("session-banner")];
  const visible = (el) => {
    if (el.closest("[hidden]")) return false;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  };
  roots.forEach((root) => {
    if (!root) return;
    root.querySelectorAll("button, select, input, a[href]").forEach((el) => {
      if (!visible(el) || el.type === "hidden") return;
      // A checkbox's hit area is its label (20px box in a 44px label)
      const hit = /checkbox|radio/.test(el.type) ? el.closest("label") || el : el;
      const r = hit.getBoundingClientRect();
      if (r.height < 43.5 || r.width < 43.5) small.push(`${el.id || el.className}:${Math.round(r.width)}x${Math.round(r.height)}`);
    });
    root.querySelectorAll("*").forEach((el) => {
      if (el.children.length || !(el.textContent || "").trim() || !visible(el)) return;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 11.95) tiny.push(`${el.id || el.className}:${fs}:${el.textContent.trim().slice(0, 16)}`);
    });
  });
  return { small, tiny, overflow: document.documentElement.scrollWidth > innerWidth };
}

/** How many lines a box's text takes (its line boxes' distinct tops). */
function lineCount(id) {
  const range = document.createRange();
  range.selectNodeContents(document.getElementById(id));
  return new Set([...range.getClientRects()].filter((r) => r.width > 0).map((r) => Math.round(r.top))).size;
}

/**
 * Scroll so the stage is stuck under the exercise header and still inside its
 * card: the card holds the stage and the short rows under it, so past that
 * the stage leaves with the card, as it should. The piano panel under the
 * stage gives it room to stay.
 */
async function scrollIntoStuck(page) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  if (await page.locator("#piano-block").isHidden()) await page.locator("#btn-toggle-piano").click();
  await page.waitForTimeout(150);
  return page.evaluate(() => {
    const ex = document.querySelector(".exercise-header-compact").getBoundingClientRect();
    const st = document.getElementById("highway-stage").getBoundingClientRect();
    const card = document.getElementById("practice-cockpit").getBoundingClientRect();
    const room = card.bottom - st.bottom;
    const y = window.scrollY + Math.max(0, st.top - ex.bottom) + Math.min(60, Math.floor(room / 2));
    window.scrollTo({ top: y, behavior: "instant" });
    return { room, y: window.scrollY };
  });
}

/** The top rail's lowest edge and a box's top, relative to the viewport. */
function railAndTop(sel) {
  let rail = -Infinity;
  [...document.getElementById("hud-top-rail").children].forEach((el) => {
    const b = el.getBoundingClientRect();
    if (b.height) rail = Math.max(rail, b.bottom);
  });
  const el = document.querySelector(sel);
  return { rail, top: el ? el.getBoundingClientRect().top : null };
}

test.describe("Start floor: the stage's controls on a phone", () => {
  for (const vp of [
    { width: 390, height: 844 },
    { width: 360, height: 740 },
    { width: 320, height: 640 },
    { width: 844, height: 390 }
  ]) {
    test(`${vp.width}x${vp.height}: 44px controls and 12px words, idle and live, lip trill and pitch match`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: vp, userAgent: MOBILE_UA, isMobile: true, hasTouch: true });
      const page = await ctx.newPage();
      await boot(page);
      for (const id of ["s4-lip-trills", "s9-pitch-match"]) {
        await open(page, id);
        let a = await page.evaluate(floorAudit);
        expect(a.small, `${id} idle: controls under 44px`).toEqual([]);
        expect(a.tiny, `${id} idle: words under 12px`).toEqual([]);
        expect(a.overflow, `${id}: no sideways scroll`).toBe(false);
        await start(page);
        await page.clock.runFor(1500);
        a = await page.evaluate(floorAudit);
        expect(a.small, `${id} live: controls under 44px`).toEqual([]);
        expect(a.tiny, `${id} live: words under 12px`).toEqual([]);
        await page.locator("#btn-practice-stop").click();
        await expect.poll(() => live(page)).toBe(false);
      }
      await ctx.close();
    });
  }

  test("lip trill, straw and rate ladder leave out the chord and mode menus; solfège keeps them", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    for (const id of ["s4-lip-trills", "s6-straw", "v1-diction"]) {
      await open(page, id);
      await expect(page.locator("#hud-prog-bar"), id).toBeHidden();
    }
    await open(page, "s2-solfege-chords");
    await expect(page.locator("#hud-prog-bar")).toBeVisible();
    await expect(page.locator("#sel-progression")).toBeVisible();
  });

  test("the octave, the range box and the level meter say what they are; Empezar has its own row", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await open(page, "s4-lip-trills");
    await expect(page.locator("#oct-controls .oct-k")).toHaveText("octava");
    await expect(page.locator("#oct-controls .oct-auto span")).toBeVisible();
    await expect(page.locator("#oct-controls .oct-auto span")).toHaveText("Rango");
    // The meter sits in the MIC label, right after its name
    const meter = await page.evaluate(() => {
      const m = document.getElementById("level-meter-wrap");
      const title = document.querySelector("#mic-sens-hud .mic-sens-title");
      return {
        inLabel: !!m.closest("label.mic-sens-label"),
        afterTitle: title.nextElementSibling === m,
        gap: Math.round(m.getBoundingClientRect().left - title.getBoundingClientRect().right)
      };
    });
    expect(meter.inLabel).toBe(true);
    expect(meter.afterTitle).toBe(true);
    expect(meter.gap).toBeLessThan(16);
    // Empezar: full row width, at least 48px tall, nothing beside it
    const s = await page.evaluate(() => {
      const b = document.getElementById("btn-practice-start").getBoundingClientRect();
      const rail = document.getElementById("hud-bottom-rail").getBoundingClientRect();
      return { w: b.width, h: b.height, railW: rail.width };
    });
    expect(s.h).toBeGreaterThanOrEqual(48);
    expect(s.w).toBeGreaterThan(s.railW * 0.8);
    await page.evaluate(() => window.VTI18n.setLang("en"));
    await expect(page.locator("#oct-controls .oct-k")).toHaveText("octave");
    await expect(page.locator("#oct-controls .oct-auto span")).toHaveText("Range");
  });
});

test.describe("Coach strip: the mode and its cue on the stage", () => {
  for (const vp of [
    { width: 390, height: 844 },
    { width: 360, height: 740 },
    { width: 844, height: 390 },
    { width: 1280, height: 800 }
  ]) {
    test(`${vp.width}x${vp.height}: pitch match's cue sits whole in the strip, lanes below`, async ({ page }) => {
      await page.setViewportSize(vp);
      await boot(page);
      await open(page, "s9-pitch-match");
      const r = await page.evaluate(() => {
        const strip = document.getElementById("stage-coach");
        const stage = document.getElementById("highway-stage");
        const cue = document.getElementById("mode-cue");
        const sr = strip.getBoundingClientRect();
        const rects = [...cue.getClientRects()];
        return {
          inRail: strip.parentElement.id === "hud-top-rail" && !strip.hidden,
          hudIn: strip.contains(document.getElementById("mode-hud")),
          title: (strip.querySelector(".mode-title")?.textContent || "").trim(),
          cue: cue.textContent.trim(),
          cueWhole: rects.length > 0 && rects.every((x) => x.top >= sr.top - 1 && x.bottom <= sr.bottom + 1),
          clipped: strip.scrollHeight > strip.clientHeight + 2,
          inStage: sr.top >= stage.getBoundingClientRect().top && sr.bottom <= stage.getBoundingClientRect().bottom,
          inView: sr.bottom <= innerHeight,
          lanesTop: document.getElementById("pitch-block").getBoundingClientRect().top,
          stripTop: sr.top,
          stripBottom: sr.bottom
        };
      });
      expect(r.inRail).toBe(true);
      expect(r.hudIn).toBe(true);
      expect(r.title).toBe("Juego de afinación");
      expect(r.cue).toBe("Escucha primero, luego afina. Bloquea 8 notas en el carril verde.");
      expect(r.cueWhole, "every line of the cue inside the strip").toBe(true);
      expect(r.clipped).toBe(false);
      expect(r.inStage).toBe(true);
      expect(r.inView, "strip on the first screen").toBe(true);
      expect(r.lanesTop).toBeGreaterThanOrEqual(r.stripBottom - 1);
      // The lock toast rides above the stage, never over the strip
      const toast = await page.evaluate(async () => {
        sessionStorage.removeItem("vt_e2e");
        window.VTApp.getState().pitchGame.onLock?.("A2", "C3");
        await new Promise((res) => setTimeout(res, 50));
        const t = document.querySelector(".toast.show");
        return t ? t.getBoundingClientRect().bottom : null;
      });
      await page.clock.runFor(400);
      expect(toast, "the lock toast showed").not.toBeNull();
      expect(toast).toBeLessThanOrEqual(r.stripTop + 1);
    });
  }

  test("without a canvas the stage guide follows the clock: Ahora · paso n de N", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await open(page, "s4-lip-trills");
    await expect(page.locator("#stage-coach")).toBeHidden();
    await expect(page.locator("#stage-guide-k")).toHaveText("Qué vas a hacer");
    await expect(page.locator("#stage-guide-now")).toBeHidden();
    await start(page);
    const now = page.locator("#stage-guide-now");
    await expect(now).toBeVisible();
    await expect(page.locator("#stage-now-k")).toHaveText(/^Ahora · paso 1 de (\d+)$/);
    const n = Number((await page.locator("#stage-now-k").textContent()).match(/de (\d+)/)[1]);
    const total = await page.evaluate(() => window.VTApp.getState().timer.total);
    await expect(page.locator("#stage-guide-steps")).toBeHidden();
    await page.clock.runFor(Math.ceil((total / n) * 1000) + 800);
    await expect(page.locator("#stage-now-k")).toHaveText(`Ahora · paso 2 de ${n}`);
    const text = (await page.locator("#stage-now-t").textContent()).trim();
    expect(text.length).toBeGreaterThan(5);
    // Whole and on the stage, under the mode panel
    const g = await page.evaluate(() => {
      const guide = document.getElementById("stage-guide").getBoundingClientRect();
      const panel = document.getElementById("mode-focus-panel").getBoundingClientRect();
      const rail = document.getElementById("hud-bottom-rail").getBoundingClientRect();
      const el = document.getElementById("stage-guide");
      return { top: guide.top, bottom: guide.bottom, panelBottom: panel.bottom, railTop: rail.top, clipped: el.scrollHeight > el.clientHeight + 1 };
    });
    expect(g.top).toBeGreaterThanOrEqual(g.panelBottom);
    expect(g.bottom).toBeLessThanOrEqual(g.railTop);
    expect(g.clipped).toBe(false);
    await page.locator("#btn-practice-stop").click();
    await expect(page.locator("#stage-guide-k")).toBeVisible();
    await expect(now).toBeHidden();
    await page.evaluate(() => window.VTI18n.setLang("en"));
    await start(page);
    await expect(page.locator("#stage-now-k")).toHaveText(/^Now · step \d+ of \d+$/);
  });

  test("idle, the guide shows whole steps only, or just its button, never a step cut mid-line", async ({ page }) => {
    for (const vp of [
      { width: 390, height: 844 },
      { width: 360, height: 740 },
      { width: 320, height: 640 }
    ]) {
      await page.setViewportSize(vp);
      if (vp.width === 390) await boot(page);
      await open(page, "s4-lip-trills");
      await page.waitForTimeout(300);
      const g = await page.evaluate(() => {
        const el = document.getElementById("stage-guide");
        const rail = document.getElementById("hud-bottom-rail").getBoundingClientRect();
        const r = el.getBoundingClientRect();
        return {
          shown: !el.hidden,
          clipped: el.scrollHeight > el.clientHeight + 1,
          bottom: r.bottom,
          railTop: rail.top,
          moreShown: !document.getElementById("btn-stage-guide-more").hidden
        };
      });
      expect(g.shown, `${vp.width}: the guide or its button is on the stage`).toBe(true);
      expect(g.clipped, `${vp.width}: nothing cut`).toBe(false);
      expect(g.bottom).toBeLessThanOrEqual(g.railTop);
      expect(g.moreShown).toBe(true);
    }
  });

  for (const vp of [
    { width: 390, height: 844 },
    { width: 360, height: 740 },
    { width: 844, height: 390 }
  ]) {
    test(`${vp.width}x${vp.height}: the top rail never covers the mode panel's title, idle or live`, async ({ page }) => {
      await page.setViewportSize(vp);
      await boot(page);
      // s4 has no chord menus; s18 and v2 are other panels without a canvas
      for (const id of ["s4-lip-trills", "s18-costal-breath", "v2-volume"]) {
        await open(page, id);
        let r = await page.evaluate(railAndTop, "#mode-focus-panel .mode-title");
        expect(r.top, `${id} idle`).toBeGreaterThanOrEqual(r.rail);
        await start(page);
        await page.clock.runFor(1200);
        r = await page.evaluate(railAndTop, "#mode-focus-panel .mode-title");
        expect(r.top, `${id} live`).toBeGreaterThanOrEqual(r.rail);
        // "En vivo" on one line
        expect(await page.evaluate(lineCount, "practice-status"), `${id}: En vivo on one line`).toBe(1);
        await page.locator("#btn-practice-stop").click();
        await expect.poll(() => live(page)).toBe(false);
      }
    });
  }
});

test.describe("Session chrome: one line, Pausar and Terminar in words", () => {
  // A phone on its side puts the banner's buttons in the exercise header's
  // row instead (see Landscape below)
  for (const vp of [
    { width: 390, height: 844 },
    { width: 360, height: 740 },
    { width: 320, height: 640 },
    { width: 1280, height: 800 }
  ]) {
    test(`${vp.width}x${vp.height}: the banner is one line and says where you are`, async ({ page }) => {
      await page.setViewportSize(vp);
      await boot(page);
      await startMinimo(page);
      const b = await page.evaluate(() => {
        const banner = document.getElementById("session-banner").getBoundingClientRect();
        const pos = document.querySelector("#session-banner-text .session-banner-pos");
        const pr = pos.getBoundingClientRect();
        const btns = ["btn-session-pause", "btn-session-end"].map((id) => {
          const r = document.getElementById(id).getBoundingClientRect();
          return { id, h: r.height, top: r.top, bottom: r.bottom, right: r.right };
        });
        return {
          h: banner.height,
          top: banner.top,
          bottom: banner.bottom,
          pos: pos.textContent,
          posWhole: pos.scrollWidth <= pos.clientWidth + 1 && pr.right <= btns[0].right,
          btns,
          vw: innerWidth
        };
      });
      expect(b.h, "one line").toBeLessThanOrEqual(60);
      expect(b.pos).toBe("Ejercicio 1 de 2");
      expect(b.posWhole, "the step count is never cut").toBe(true);
      for (const x of b.btns) {
        expect(x.h, x.id).toBeGreaterThanOrEqual(44);
        expect(x.top, x.id).toBeGreaterThanOrEqual(b.top);
        expect(x.bottom, x.id).toBeLessThanOrEqual(b.bottom);
        expect(x.right, x.id).toBeLessThanOrEqual(b.vw);
      }
      await expect(page.locator("#btn-session-pause")).toHaveText("Pausar");
      await expect(page.locator("#btn-session-end")).toHaveText("Terminar");
      await expect(page.locator("#btn-session-end")).toHaveAttribute("aria-label", "Terminar la sesión guiada");
      // The header's own "Ejercicio 1 de 2" would only repeat the banner
      await expect(page.locator("#structured-progress")).toBeHidden();
      await expect(page.locator("#structured-progress")).toHaveText("Ejercicio 1 de 2");
    });
  }

  test("Pausar turns into Reanudar, the line says En pausa, and Terminar ends the routine", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await startMinimo(page);
    await page.locator("#btn-session-pause").click();
    await expect(page.locator("#btn-session-resume")).toBeVisible();
    await expect(page.locator("#btn-session-resume")).toHaveText("Reanudar");
    await expect(page.locator("#btn-session-pause")).toBeHidden();
    await expect(page.locator("#session-banner-text")).toContainText("Ejercicio 1 de 2 · En pausa");
    await expect(page.locator("#session-banner-text")).toHaveAttribute("title", /En pausa/);
    await page.locator("#btn-session-resume").click();
    await expect(page.locator("#btn-session-pause")).toBeVisible();
    await expect(page.locator("#session-banner-text")).not.toContainText("En pausa");
    page.once("dialog", (d) => d.accept());
    await page.locator("#btn-session-end").click();
    await expect.poll(() => page.evaluate(() => window.VTSession.get()?.status || "none")).not.toBe("active");
    await expect(page.locator("#session-banner")).not.toHaveClass(/visible/);
    // No bare "×" on the banner at any point
    expect(await page.locator("#session-banner").evaluate((el) => /×/.test(el.textContent))).toBe(false);
  });

  test("English reads in its own words", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, { lang: "en" });
    await startMinimo(page);
    await expect(page.locator("#session-banner-text .session-banner-pos")).toHaveText("Exercise 1 of 2");
    await expect(page.locator("#btn-session-pause")).toHaveText("Pause");
    await expect(page.locator("#btn-session-pause")).toHaveAttribute("aria-label", "Pause the guided session");
    await expect(page.locator("#btn-session-end")).toHaveText("End");
  });
});

test.describe("Landscape: a phone on its side", () => {
  test("guided: one header row with Pausar and Terminar, stage fits, nothing covers the title", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 844, height: 390 },
      userAgent: MOBILE_UA,
      isMobile: true,
      hasTouch: true
    });
    const page = await ctx.newPage();
    await boot(page);
    await startMinimo(page);
    await expect(page.locator("header.app-header")).toBeHidden();
    await expect(page.locator("#ex-breadcrumb")).toBeHidden();
    // The view slides 6px into place as it opens
    await expect.poll(() => page.evaluate(() => document.getElementById("view-exercise").getAnimations().length)).toBe(0);
    // The routine's line moves into the header row; screen readers still
    // hear the banner's
    await expect(page.locator("#structured-progress")).toBeVisible();
    await expect(page.locator("#structured-progress")).toHaveText("Ejercicio 1 de 2");
    await expect(page.locator("#session-banner-text")).toContainText("Ejercicio 1 de 2");
    for (const phase of ["idle", "live", "scrolled", "paused"]) {
      if (phase === "live") {
        await start(page);
        await page.clock.runFor(1500);
      }
      if (phase === "scrolled") await page.evaluate(() => window.scrollBy({ top: 300, behavior: "instant" }));
      if (phase === "paused") {
        await page.locator("#btn-practice-stop").click();
        await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
        await page.locator("#btn-session-pause").click();
        await expect(page.locator("#structured-progress")).toHaveText("Ejercicio 1 de 2 · En pausa");
        // Reanudar is wider than Pausar: the header makes room for it once its
        // ResizeObserver has run, on the next rendering step, not at the click.
        await expect
          .poll(() =>
            page.evaluate(() => {
              const back = document.getElementById("btn-back-home").getBoundingClientRect();
              return back.right <= document.getElementById("btn-session-resume").getBoundingClientRect().left;
            })
          )
          .toBe(true);
      }
      const r = await page.evaluate(() => {
        const q = (id) => document.getElementById(id).getBoundingClientRect();
        const title = document.querySelector("#mode-focus-panel .mode-title").getBoundingClientRect();
        const pill = q("practice-status");
        return {
          scrollY,
          vh: innerHeight,
          vw: innerWidth,
          pause: q(document.getElementById("btn-session-pause").hidden ? "btn-session-resume" : "btn-session-pause"),
          end: q("btn-session-end"),
          stage: q("highway-stage"),
          exHeader: document.querySelector(".exercise-header-compact").getBoundingClientRect(),
          back: q("btn-back-home"),
          heading: q("ex-title"),
          progress: q("structured-progress"),
          title,
          pill,
          overlap: !(pill.right <= title.left || pill.left >= title.right || pill.bottom <= title.top || pill.top >= title.bottom),
          stop: q(document.getElementById("btn-practice-stop").hidden ? "btn-practice-start" : "btn-practice-stop")
        };
      });
      // Pausar and Terminar sit in the header's row, clear of Atrás, the title
      // and the routine's line, and stay there scrolled
      expect(r.exHeader.height, `${phase}: one header row`).toBeLessThanOrEqual(52);
      for (const b of [r.pause, r.end]) {
        expect(b.height, `${phase}: 44px`).toBeGreaterThanOrEqual(44);
        expect(b.top, `${phase}: in the header row`).toBeGreaterThanOrEqual(r.exHeader.top - 1);
        expect(b.bottom, `${phase}: in the header row`).toBeLessThanOrEqual(r.exHeader.bottom + 1);
        expect(b.right).toBeLessThanOrEqual(r.vw);
      }
      expect(r.back.right, `${phase}: Atrás clear of Pausar`).toBeLessThanOrEqual(r.pause.left);
      expect(r.heading.right).toBeLessThanOrEqual(r.back.left);
      expect(r.progress.right).toBeLessThanOrEqual(r.back.left);
      if (phase === "scrolled") {
        expect(r.scrollY).toBeGreaterThan(0);
        expect(Math.abs(r.exHeader.top), "the row stays at the top").toBeLessThanOrEqual(1);
        continue;
      }
      expect(r.overlap, `${phase}: En vivo pill over the panel title`).toBe(false);
      expect(r.title.top).toBeGreaterThanOrEqual(r.pill.bottom);
      expect(await page.evaluate(lineCount, "practice-status"), `${phase}: pill on one line`).toBe(1);
      expect(r.stage.top, `${phase}: stage under the header (scrollY ${r.scrollY})`).toBeGreaterThanOrEqual(r.exHeader.bottom - 1);
      expect(r.stage.bottom, `${phase}: stage inside the screen (VG-30)`).toBeLessThanOrEqual(r.vh);
      expect(r.stop.bottom).toBeLessThanOrEqual(r.vh);
    }
    await ctx.close();
  });

  test("single exercise: the stage fits at rest and sticks under the exercise header (VG-30)", async ({ browser }) => {
    const ctx = await browser.newContext({
      viewport: { width: 844, height: 390 },
      userAgent: MOBILE_UA,
      isMobile: true,
      hasTouch: true
    });
    const page = await ctx.newPage();
    await boot(page);
    for (const id of ["s4-lip-trills", "s9-pitch-match"]) {
      await open(page, id);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
      await page.evaluate(() => window.VTApp.fitHighwayToViewport());
      let r = await page.evaluate(() => ({
        vh: innerHeight,
        stage: document.getElementById("highway-stage").getBoundingClientRect().bottom,
        ex: document.querySelector(".exercise-header-compact").getBoundingClientRect().top
      }));
      expect(r.stage, `${id}: stage bottom at rest`).toBeLessThanOrEqual(r.vh);
      expect(r.ex).toBeGreaterThanOrEqual(0);
      // Scrolled, it sticks right under the exercise header
      const stuck = await scrollIntoStuck(page);
      expect(stuck.room, `${id}: room to stay stuck`).toBeGreaterThan(20);
      await page.waitForTimeout(100);
      r = await page.evaluate(() => ({
        stageTop: document.getElementById("highway-stage").getBoundingClientRect().top,
        exBottom: document.querySelector(".exercise-header-compact").getBoundingClientRect().bottom,
        exTop: document.querySelector(".exercise-header-compact").getBoundingClientRect().top
      }));
      expect(Math.abs(r.exTop), `${id}: exercise header stuck at the top`).toBeLessThanOrEqual(1);
      expect(Math.abs(r.stageTop - r.exBottom), `${id}: stage stuck under it`).toBeLessThanOrEqual(2);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    }
    await ctx.close();
  });
});

test.describe("Sticky bars over the stage", () => {
  test("the site header and the exercise header are solid; nothing shows between them", async ({ page }) => {
    for (const vp of [
      { width: 1280, height: 800 },
      { width: 390, height: 844 }
    ]) {
      await page.setViewportSize(vp);
      if (vp.width === 1280) await boot(page);
      await open(page, "s2-solfege-chords");
      // Past the card, so the stage's top row runs under both bars
      await page.evaluate(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: "instant" }));
      await page.waitForTimeout(150);
      const r = await page.evaluate(() => {
        const alpha = (el) => {
          const m = getComputedStyle(el).backgroundColor.match(/[\d.]+/g).map(Number);
          return m.length > 3 ? m[3] : 1;
        };
        const app = document.querySelector("header.app-header");
        const ex = document.querySelector(".exercise-header-compact");
        const a = app.getBoundingClientRect();
        const rail = document.getElementById("hud-top-rail").getBoundingClientRect();
        const under = document.elementFromPoint(innerWidth / 2, a.bottom + 0.5);
        return {
          appAlpha: alpha(app),
          blur: getComputedStyle(app).backdropFilter,
          exAlpha: alpha(ex),
          railUnder: rail.top < a.bottom,
          seam: under ? !!under.closest(".exercise-header-compact, header.app-header") : true
        };
      });
      expect(r.railUnder, `${vp.width}: the stage's top row is under the bars`).toBe(true);
      expect(r.appAlpha, `${vp.width}: site header solid`).toBe(1);
      expect(r.blur).toBe("none");
      expect(r.exAlpha, `${vp.width}: exercise header solid`).toBe(1);
      expect(r.seam, `${vp.width}: no stage between the two bars`).toBe(true);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    }
  });

  test("the guide's button keeps its words inside the pill", async ({ page }) => {
    for (const [vp, lang] of [
      [{ width: 1280, height: 800 }, "es"],
      [{ width: 390, height: 844 }, "es"],
      [{ width: 320, height: 640 }, "en"]
    ]) {
      await page.setViewportSize(vp);
      if (vp.width === 1280) await boot(page);
      await page.evaluate((l) => window.VTI18n.setLang(l), lang);
      await open(page, "s4-lip-trills");
      await expect(page.locator("#btn-stage-guide-more")).toBeVisible();
      const b = await page.evaluate(() => {
        const btn = document.getElementById("btn-stage-guide-more");
        const r = btn.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(btn);
        const t = range.getBoundingClientRect();
        return { left: t.left - r.left, right: r.right - t.right, fits: btn.scrollWidth <= btn.clientWidth };
      });
      expect(b.fits, `${vp.width} ${lang}`).toBe(true);
      expect(b.left, `${vp.width} ${lang}: room on the left`).toBeGreaterThanOrEqual(6);
      expect(b.right, `${vp.width} ${lang}: room on the right`).toBeGreaterThanOrEqual(6);
    }
  });
});

test.describe("Sticky stage on narrow phones", () => {
  test("at 360px and below the stage still sticks under the exercise header", async ({ page }) => {
    for (const vp of [
      { width: 360, height: 740 },
      { width: 320, height: 640 }
    ]) {
      await page.setViewportSize(vp);
      if (vp.width === 360) await boot(page);
      await open(page, "s4-lip-trills");
      const stuck = await scrollIntoStuck(page);
      expect(stuck.y, `${vp.width}: scrolled`).toBeGreaterThan(0);
      await page.waitForTimeout(100);
      const r = await page.evaluate(() => ({
        stageTop: document.getElementById("highway-stage").getBoundingClientRect().top,
        exBottom: document.querySelector(".exercise-header-compact").getBoundingClientRect().bottom,
        header: document.querySelector("header.app-header").getBoundingClientRect().top
      }));
      expect(r.header, `${vp.width}: site header stuck`).toBeGreaterThanOrEqual(-1);
      expect(Math.abs(r.stageTop - r.exBottom), `${vp.width}: stage stuck under the exercise header`).toBeLessThanOrEqual(2);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    }
  });
});

test.describe("Pitch match challenge scores the note it asks for", () => {
  test("singing a chord lane two or more semitones from the challenge note is not BIEN", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    await boot(page, { clock: false });
    await open(page, "s9-pitch-match");
    await start(page);
    const r = await page.evaluate(() => {
      const st = window.VTApp.getState();
      const pv = st.pitchViz;
      const game = st.pitchGame;
      const U = window.VTPitchUtils;
      const want = game.currentChallengeNote();
      const wantF = window.VT_NOTE_FREQ[want];
      const wantMidi = U.freqToMidi(wantF);
      // A lane the voice sits on, far from the asked note: the page's own
      // chord lanes, or one set up like them when none is active
      let lane = (pv.chordLanes || []).find((l) => Math.abs(l.midi - wantMidi) >= 2);
      if (!lane) {
        const name = wantMidi < 55 ? "G3" : "C3";
        const f = window.VT_NOTE_FREQ[name];
        lane = { name, freq: f, midi: U.freqToMidi(f), active: true };
        pv.chordLanes = [...(pv.chordLanes || []), lane];
      }
      pv.setTargetFreq(wantF);
      for (let i = 0; i < 30; i++) pv.pushFrame(lane.freq, wantF);
      const snap = game.snapshot();
      // …and on the asked note it is in tune
      for (let i = 0; i < 30; i++) pv.pushFrame(wantF, wantF);
      const onNote = game.snapshot();
      return {
        want,
        lane: lane.name,
        challenge: snap.challengeMode,
        quality: snap.quality,
        cleared: snap.challengeCleared,
        onNote: onNote.quality,
        hud: document.getElementById("hud-quality").textContent.trim()
      };
    });
    expect(r.challenge).toBe(true);
    expect(["perfect", "good"], `voice on ${r.lane} while ${r.want} is asked`).not.toContain(r.quality);
    expect(r.cleared).toBe(0);
    expect(r.onNote).toBe("perfect");
  });
});
