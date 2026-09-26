/**
 * Practice-screen designs chosen in the A/B review:
 *
 *  - step-end (audit PR-1): when a guided step's clock reaches 00:00 the mic
 *    stops and a card on the stage says the step is done, names the next
 *    exercise and offers 30 more seconds or the one-tap rating
 *    (tests/finish-rating.spec.js).
 *  - target-lane (audit PR-3): the note to sing is always drawn as the green
 *    primary lane, chord tone or not; the semitone grid recedes; the live dot
 *    stops short of the lane labels; the chord badge clears the HUD row.
 *
 * The step-done card is muted under vt_e2e like the loop's done card; these
 * tests opt in with vt_stepdone_e2e.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const NOW = "2026-09-23T10:00:00-05:00";

function ledger(dayKeys) {
  const days = {};
  dayKeys.forEach((k) => {
    days[k] = { sec: 240, n: 2, ex: ["s4-lip-trills"] };
  });
  return { v: 1, days, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true };
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ lang?: string, cardOn?: boolean, clock?: boolean }} opts
 */
async function boot(page, opts = {}) {
  if (opts.clock !== false) await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript(
    ({ lang, cardOn, days }) => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", lang);
        localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: "singing" }));
        sessionStorage.setItem("vt_e2e", "1");
        if (cardOn) sessionStorage.setItem("vt_stepdone_e2e", "1");
        if (!sessionStorage.getItem("vt_seeded")) {
          sessionStorage.setItem("vt_seeded", "1");
          localStorage.setItem("vt_days_v1", JSON.stringify(days));
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
      if (!navigator.mediaDevices) {
        Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
      }
      navigator.mediaDevices.getUserMedia = fakeGUM;
      if (typeof MediaDevices !== "undefined") MediaDevices.prototype.getUserMedia = fakeGUM;
    },
    {
      lang: opts.lang || "es",
      cardOn: opts.cardOn !== false,
      days: ledger(["2026-09-20", "2026-09-21", "2026-09-22"])
    }
  );
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && !!window.VTLoop && !!window.VTSession);
  if (opts.clock !== false) await page.clock.runFor(500);
}

const live = (page) => page.evaluate(() => !!window.VTApp.getState().practiceLive);

/**
 * Start the open step, wait until it is really live, then run its clock out.
 * Jumping the clock before the mic has started can make the start give up
 * and show the no-microphone notice.
 * @param {number} [sec] run a shorter clock: fast-forwarding a pitch step's
 *   90 s paints thousands of frames and is slow
 */
async function runStepOut(page, sec) {
  if (sec) await page.evaluate((n) => (window.VTApp.getState().timer.remaining = n), sec);
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => live(page), { timeout: 10000 }).toBe(true);
  const left = await page.evaluate(() => window.VTApp.getState().timer.remaining);
  await page.clock.runFor(Math.ceil(left * 1000) + 600);
}

/** Open today's Mínimo (s4 lip trills 90 s, then s27 90 s). */
async function startMinimo(page) {
  await page.locator("#btn-next-step").click();
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  expect(await page.evaluate(() => window.VTSession.get().order)).toEqual([
    "s4-lip-trills",
    "s27-lip-trill-solfege"
  ]);
}

test.describe("Step done: a guided step's clock runs out", () => {
  test("the card covers the stage, the mic stops, and Siguiente opens the next step", async ({ page }) => {
    await boot(page);
    await startMinimo(page);
    const card = page.locator("#step-done");
    await expect(card).toBeHidden();
    await runStepOut(page);

    await expect(card).toBeVisible();
    await expect(card).toHaveAttribute("role", "status");
    // The banner's own word for the unit, not "Paso".
    await expect(page.locator("#session-banner-text")).toContainText("Ejercicio 1 de 2");
    await expect(page.locator("#step-done-step")).toHaveText("Ejercicio 1 de 2");
    await expect(card).toContainText("¡Listo!");
    await expect(page.locator("#step-done-sub")).toContainText(/micrófono se apagó/);
    const next = page.locator("#btn-step-done-next");
    await expect(next).toHaveText("Siguiente: Solfeo en trino de labios →");
    await expect(next).toBeFocused();
    await expect(page.locator("#btn-step-done-more")).toHaveText("30 s más");
    await expect(page.locator("#btn-step-done-rate")).toHaveText("Calificar este ejercicio");

    // The step is over: nothing is listening and the pill no longer says live.
    const st = await page.evaluate(() => {
      const s = window.VTApp.getState();
      return {
        live: s.practiceLive,
        engine: !!s.practice?.running,
        pill: document.querySelector("#practice-status").textContent,
        timer: document.querySelector("#timer-display").textContent
      };
    });
    expect(st).toEqual({ live: false, engine: false, pill: "Listo", timer: "00:00" });

    // The card sits on the stage, inside the first screen.
    const geo = await page.evaluate(() => {
      const r = (s) => document.querySelector(s).getBoundingClientRect();
      const stage = r("#highway-stage");
      const b = r("#btn-step-done-next");
      const hit = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
      return {
        inStage: b.top >= stage.top && b.bottom <= stage.bottom,
        inView: b.top >= 0 && b.bottom <= innerHeight,
        onTop: hit?.id === "btn-step-done-next",
        h: b.height
      };
    });
    expect(geo).toEqual({ inStage: true, inView: true, onTop: true, h: expect.any(Number) });
    expect(geo.h).toBeGreaterThanOrEqual(44);

    // The step ran its full length, so it counts.
    const row = await page.evaluate(() => JSON.parse(localStorage.getItem("vt_days_v1")).days["2026-09-23"]);
    expect(row.ex).toContain("s4-lip-trills");

    await next.click();
    await page.clock.runFor(300);
    await expect(card).toBeHidden();
    const after = await page.evaluate(() => ({
      id: window.VTApp.getState().exercise?.id,
      index: window.VTSession.get().index,
      live: window.VTApp.getState().practiceLive
    }));
    expect(after).toEqual({ id: "s27-lip-trill-solfege", index: 1, live: false });
    await expect(page.locator("#session-banner-text")).toContainText("Ejercicio 2 de 2");
  });

  test("30 s más closes the card and runs the same step for 30 more seconds", async ({ page }) => {
    await boot(page);
    await startMinimo(page);
    await runStepOut(page, 5);
    await expect(page.locator("#step-done")).toBeVisible();

    await page.locator("#btn-step-done-more").click();
    await expect(page.locator("#step-done")).toBeHidden();
    await expect.poll(() => live(page), { timeout: 10000 }).toBe(true);
    const st = await page.evaluate(() => ({
      id: window.VTApp.getState().exercise?.id,
      running: window.VTApp.getState().timer.running,
      left: window.VTApp.getState().timer.remaining
    }));
    expect(st.id).toBe("s4-lip-trills");
    expect(st.running).toBe(true);
    expect(st.left).toBeGreaterThan(25);
    expect(st.left).toBeLessThanOrEqual(30);
    await expect(page.locator("#timer-display")).toHaveText(/00:(30|29|28|27|26)/);

    await page.clock.runFor(31000);
    await expect(page.locator("#step-done")).toBeVisible();
    await expect(page.locator("#step-done-step")).toHaveText("Ejercicio 1 de 2");
  });

  test("Calificar este ejercicio opens the one-tap rating and moves focus to its question", async ({ page }) => {
    await boot(page);
    await startMinimo(page);
    await runStepOut(page, 5);
    await page.locator("#btn-step-done-rate").click();
    await expect(page.locator("#step-done")).toBeHidden();
    await expect(page.locator("#metrics-card")).not.toHaveClass(/collapsed/);
    await expect(page.locator("#btn-toggle-metrics")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#rate-q")).toBeFocused();
    await expect(page.locator(".rate-btn")).toHaveText(["Fácil", "Normal", "Me costó"]);
    // The card is brought up, not left at the fold (it scrolls on the next
    // frame, smoothly, so the fake clock moves and then real time passes).
    await page.clock.runFor(100);
    await expect
      .poll(() => page.evaluate(() => document.querySelector("#metrics-card").getBoundingClientRect().top / innerHeight))
      .toBeLessThan(0.5);
    // One tap saves, and still moves the routine on, as Save did.
    await page.locator('.rate-btn[data-feel="ok"]').click();
    await expect(page.locator("#ps-routine-next")).toBeVisible();
  });

  test("Escape closes the card and hands focus back to Empezar", async ({ page }) => {
    await boot(page);
    await startMinimo(page);
    await runStepOut(page, 5);
    await expect(page.locator("#btn-step-done-next")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#step-done")).toBeHidden();
    await expect(page.locator("#btn-practice-start")).toBeFocused();
    expect(await page.evaluate(() => window.VTApp.getState().exercise?.id)).toBe("s4-lip-trills");
  });

  test("the last step offers the routine's own finish and ends it", async ({ page }) => {
    await boot(page);
    await startMinimo(page);
    await runStepOut(page, 5);
    await page.locator("#btn-step-done-next").click();
    await page.clock.runFor(400);
    expect(await page.evaluate(() => window.VTApp.getState().exercise?.id)).toBe("s27-lip-trill-solfege");
    await runStepOut(page, 5);
    await expect(page.locator("#step-done")).toBeVisible();
    await expect(page.locator("#step-done-step")).toHaveText("Ejercicio 2 de 2");
    await expect(page.locator("#btn-step-done-next")).toHaveText("Terminar la rutina");
    await page.locator("#btn-step-done-next").click();
    await page.clock.runFor(400);
    const done = await page.evaluate(() => ({
      view: window.VTApp.getState().view,
      status: window.VTSession.get()?.status || null
    }));
    expect(done.view).toBe("home");
    expect(done.status).toBe("completed");
    await expect(page.locator("#step-done")).toBeHidden();
  });

  test("leaving the routine takes the card away", async ({ page }) => {
    await boot(page);
    await startMinimo(page);
    await runStepOut(page, 5);
    await expect(page.locator("#step-done")).toBeVisible();
    await page.locator("#btn-session-end").click();
    await page.clock.runFor(300);
    await expect(page.locator("#view-home")).toHaveClass(/active/);
    await expect(page.locator("#step-done")).toBeHidden();
  });

  test("English reads in its own words", async ({ page }) => {
    await boot(page, { lang: "en" });
    await startMinimo(page);
    await runStepOut(page, 5);
    await expect(page.locator("#step-done-step")).toHaveText("Exercise 1 of 2");
    await expect(page.locator("#step-done")).toContainText("Done!");
    await expect(page.locator("#btn-step-done-next")).toHaveText(/^Next: .+ →$/);
    await expect(page.locator("#btn-step-done-more")).toHaveText("30 s more");
    await expect(page.locator("#btn-step-done-rate")).toHaveText("Rate this exercise");
    const text = await page.locator("#step-done").innerText();
    expect(text).not.toMatch(/Listo|Siguiente|más|Calificar|micrófono/);
  });

  test("muted under automation without the opt-in, but the mic still stops", async ({ page }) => {
    await boot(page, { cardOn: false });
    await startMinimo(page);
    await runStepOut(page, 5);
    await expect(page.locator("#step-done")).toBeHidden();
    const st = await page.evaluate(() => ({
      live: window.VTApp.getState().practiceLive,
      engine: !!window.VTApp.getState().practice?.running
    }));
    expect(st).toEqual({ live: false, engine: false });
    // The old way on is still there.
    await page.locator("#btn-next-structured").click();
    await page.clock.runFor(300);
    expect(await page.evaluate(() => window.VTApp.getState().exercise?.id)).toBe("s27-lip-trill-solfege");
  });

  test("a single exercise gets no step card, and its mic stops at 00:00 too", async ({ page }) => {
    // It used to keep listening, "En vivo", with nothing on screen; its own
    // ending (the rating card) is in tests/finish-rating.spec.js.
    await boot(page);
    await page.evaluate(() => window.VTApp.openExercise("s4-lip-trills"));
    await page.clock.runFor(300);
    await runStepOut(page, 5);
    await expect(page.locator("#step-done")).toBeHidden();
    expect(await live(page)).toBe(false);
  });
});

test.describe("Target lane: the note to sing is always the primary lane", () => {
  /** Paint one frame of the open exercise's highway and read it back. */
  async function paint(page, setup) {
    return page.evaluate((setupSrc) => {
      const pv = window.VTApp.getState().pitchViz;
      const U = window.VTPitchUtils;
      pv._resize();
      // eslint-disable-next-line no-new-func
      new Function("pv", "U", setupSrc)(pv, U);
      const ctx = pv.ctx2d;
      const strokes = [];
      const proto = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, "strokeStyle");
      Object.defineProperty(ctx, "strokeStyle", {
        configurable: true,
        get() {
          return proto.get.call(this);
        },
        set(v) {
          strokes.push(String(v));
          proto.set.call(this, v);
        }
      });
      try {
        pv._draw();
      } finally {
        delete ctx.strokeStyle;
      }
      const c = pv.canvas;
      const dpr = c.width / pv.w;
      const graphH = pv.h - 58;
      const tMidi = U.freqToMidi(pv.targetFreq);
      const yOf = (midi) => pv._midiToY(midi, tMidi, graphH);
      const px = (x, y) => Array.from(ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data).slice(0, 3);
      const x = pv.w * 0.35;
      const gutter = Math.max(72, Math.min(pv.w * 0.14, 140));
      return {
        strokes,
        target: U.midiToName(tMidi),
        chordLanes: pv.chordLanes.map((l) => l.name),
        inTargetLane: px(x, yOf(tMidi) - 6),
        gutterRowG3: (() => {
          const y = yOf(U.freqToMidi(window.VT_NOTE_FREQ.G3));
          const out = [];
          for (let gx = pv.w - gutter + 2; gx < pv.w - 2; gx += 1) out.push(px(gx, y));
          return out;
        })(),
        inG3Lane: px(x, yOf(U.freqToMidi(window.VT_NOTE_FREQ.G3)) - 6)
      };
    }, setup);
  }

  const greenish = ([r, g, b]) => g > r + 30 && g > b;

  test("solfège trill: the target is green although no chord is playing; the grid recedes", async ({ page }) => {
    await boot(page, { clock: false });
    await page.evaluate(() => window.VTApp.openExercise("s27-lip-trill-solfege"));
    await page.waitForTimeout(400);
    // The five solfège degrees are ghost lanes once the step is live.
    const r = await paint(
      page,
      `pv.lockRangeFromNoteNames(["C3", "D3", "E3", "F3", "G3"], window.VT_NOTE_FREQ);
       pv.setTargetNoteName("C3", window.VT_NOTE_FREQ);
       pv.history = [];`
    );
    expect(r.chordLanes).toEqual([]);
    expect(r.target).toBe("C3");
    // Before: a ghost lane, rgba(120,150,190,.12) over the background, bluer than green.
    expect(greenish(r.inTargetLane), `target lane pixel ${r.inTargetLane}`).toBe(true);
    expect(r.strokes).toContain("rgba(160, 255, 210, 1)");
    expect(r.strokes).toContain("rgba(170, 195, 230, 0.12)");
    expect(r.strokes).not.toContain("rgba(170, 195, 230, 0.38)");
  });

  test("pitch match: the target is green and the other chord tones stay gold", async ({ page }) => {
    await boot(page, { clock: false });
    await page.evaluate(() => window.VTApp.openExercise("s9-pitch-match"));
    await page.waitForTimeout(400);
    const r = await paint(
      page,
      `pv.setTargetFromChord({ name: "C", notes: ["C2", "C3", "E3", "G3"] });
       pv.setTargetFreq(window.VT_NOTE_FREQ.A2);
       pv.history = [];`
    );
    expect(r.chordLanes).toEqual(["C2", "C3", "E3", "G3"]);
    expect(r.target).toBe("A2");
    expect(greenish(r.inTargetLane), `A2 lane pixel ${r.inTargetLane}`).toBe(true);
    const [gr, gg, gb] = r.inG3Lane;
    expect(gr > gb && !greenish(r.inG3Lane), `G3 lane pixel ${r.inG3Lane}`).toBe(true);
    expect(gg).toBeGreaterThan(gb);
  });

  test("the live dot stops short of the lane labels", async ({ page }) => {
    await boot(page, { clock: false });
    await page.evaluate(() => window.VTApp.openExercise("s27-lip-trill-solfege"));
    await page.waitForTimeout(400);
    // A full trail of voice on G3, the solfège lane labelled "G3 Sol".
    const r = await paint(
      page,
      `pv.lockRangeFromNoteNames(["C3", "D3", "E3", "F3", "G3"], window.VT_NOTE_FREQ);
       pv.setTargetNoteName("C3", window.VT_NOTE_FREQ);
       const g3 = U.freqToMidi(window.VT_NOTE_FREQ.G3);
       const c3 = U.freqToMidi(pv.targetFreq);
       pv.history = Array.from({ length: pv.maxPoints }, () => ({ targetMidi: c3, voiceMidi: g3, cents: 0 }));`
    );
    // The dot is #b8f0d4 (184,240,212); the label text is #c8d6ea. Nothing in
    // the label column at that row may be the dot.
    const dotLike = r.gutterRowG3.filter(([pr, pg, pb]) => pg >= 232 && pr < 196 && pb < 222);
    expect(dotLike.length, "dot pixels inside the label column").toBe(0);
  });

  test("on a phone the chord badge clears the HUD row", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page, { clock: false });
    await page.evaluate(() => window.VTApp.openExercise("s9-pitch-match"));
    await page.waitForTimeout(400);
    await page.locator("#btn-practice-start").click();
    await expect.poll(() => live(page), { timeout: 10000 }).toBe(true);
    await page.waitForTimeout(1200);
    const r = await page.evaluate(() => {
      const pv = window.VTApp.getState().pitchViz;
      pv.activeChordName = pv.activeChordName || "C";
      pv._resize();
      pv._draw();
      const c = pv.canvas;
      const cr = c.getBoundingClientRect();
      const dpr = c.width / pv.w;
      const ctx = pv.ctx2d;
      // First row from the top where the badge's text colour (#ffe8b8) shows
      // in the middle of the canvas.
      let badgeY = null;
      for (let y = 0; y < pv.h * 0.4 && badgeY == null; y += 0.5) {
        for (let x = pv.w / 2 - 8; x <= pv.w / 2 + 8; x += 1) {
          const [r, g, b] = ctx.getImageData(Math.round(x * dpr), Math.round(y * dpr), 1, 1).data;
          if (r > 235 && g > 205 && b > 150 && b < 205) {
            badgeY = y;
            break;
          }
        }
      }
      let railBottom = -Infinity;
      [...document.querySelector("#hud-top-rail").children].forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.height) railBottom = Math.max(railBottom, b.bottom);
      });
      return { badgeY, badgeTopPx: cr.top + (badgeY ?? 0), railBottom, safeTop: pv.safeTop, canvasTop: cr.top };
    });
    expect(r.badgeY, "chord badge painted").not.toBeNull();
    // Design coach-strip: the lanes now start under the rail (and the coach
    // strip in it), so safeTop is 0 there; either way the badge clears the rail.
    expect(r.safeTop > 0 || r.canvasTop >= r.railBottom, "canvas under the rail, or badge pushed down").toBe(true);
    expect(r.badgeTopPx).toBeGreaterThanOrEqual(r.railBottom);
  });
});
