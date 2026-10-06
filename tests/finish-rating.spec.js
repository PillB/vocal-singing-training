/**
 * Finishing and rating a practice, chosen in the A/B review:
 *
 *  - rating (one-tap feel rating): after a take the card asks "¿Cómo te fue?",
 *    shows the time sung against the step's own length, and one tap on
 *    Fácil / Normal / Me costó saves the take. The sliders and notes wait
 *    under "Más detalles"; "Salir sin puntuar" keeps the practice unrated.
 *    Inside a routine the minutes are scored against the step's length.
 *  - exercise-end (finish with one-tap rating): when a single exercise's clock
 *    reaches 00:00 the practice is recorded, the mic stops and the same card
 *    asks how it went.
 *  - The take's recording lives in the same card, in reach: it used to sit
 *    under the sticky stage.
 *
 * The card's automatic ending and its closed "Más detalles" are muted under
 * vt_e2e so other specs keep their form; these tests opt in with vt_rate_e2e.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const NOW = "2026-09-23T10:00:00-05:00";
const TODAY = "2026-09-23";

function ledger(dayKeys) {
  const days = {};
  dayKeys.forEach((k) => {
    days[k] = { sec: 240, n: 2, ex: ["s4-lip-trills"] };
  });
  return { v: 1, days, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true };
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ lang?: string, rateOn?: boolean, viewport?: { width: number, height: number } }} opts
 */
async function boot(page, opts = {}) {
  if (opts.viewport) await page.setViewportSize(opts.viewport);
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript(
    ({ lang, rateOn, days }) => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", lang);
        localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: "singing" }));
        sessionStorage.setItem("vt_e2e", "1");
        sessionStorage.setItem("vt_stepdone_e2e", "1");
        if (rateOn) sessionStorage.setItem("vt_rate_e2e", "1");
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
    { lang: opts.lang || "es", rateOn: opts.rateOn !== false, days: ledger(["2026-09-20", "2026-09-21", "2026-09-22"]) }
  );
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && !!window.VTLoop && !!window.VTSession);
  await page.clock.runFor(500);
}

const live = (page) => page.evaluate(() => !!window.VTApp.getState().practiceLive);

async function start(page) {
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => live(page), { timeout: 10000 }).toBe(true);
}

/**
 * Start the open exercise and run its clock out. The clock is shortened to
 * `sec`, still past the practice credit (45 s at most), and most of it is
 * jumped over rather than ticked through: painting every frame of a pitch
 * step for a minute takes minutes of real time.
 */
async function runOut(page, sec = 50) {
  await page.evaluate((n) => (window.VTApp.getState().timer.remaining = n), sec);
  await start(page);
  await page.clock.fastForward((sec - 5) * 1000);
  await page.clock.runFor(5600);
}

async function openSingle(page, id) {
  await page.evaluate((x) => window.VTApp.openExercise(x), id);
  await page.clock.runFor(300);
}

/** Today's practice record and the exercise's saved takes. */
const records = (page, id) =>
  page.evaluate(
    ({ id, today }) => {
      const days = JSON.parse(localStorage.getItem("vt_days_v1") || "{}").days || {};
      const hist = window.VTStorage.getProgress()?.[id]?.history || [];
      return {
        day: days[today] || null,
        takes: hist.length,
        score: hist[0]?.score ?? null,
        auto: !!hist[0]?.auto,
        metrics: hist[0]?.metrics || null
      };
    },
    { id, today: TODAY }
  );

/**
 * The whole rating card is on screen: its top no lower than 45% of it (or as
 * high as the end of the page allows) and its bottom above the fold.
 *
 * A pictured exercise (s4, s27) keeps its after-Stop review whole on screen
 * instead, since that is what the question is answered from; the card follows
 * below it. There the check is the review first, then the card after the
 * learner's own scroll.
 */
async function cardInView(page, { cardFirst = false } = {}) {
  // The reveal runs on the next frame (a faked clock here) and scrolls smoothly.
  await page.clock.runFor(100);
  const review = page.locator("#mode-focus .mode-panel.has-viz.is-replay, #mode-hud .mode-panel.has-viz.is-replay");
  // After Stop a picture's review comes first; "Calificar" asks for the card itself
  if (!cardFirst && (await review.count())) {
    const vh = await page.evaluate(() => innerHeight);
    await expect
      .poll(async () => {
        const r = await review.first().boundingBox();
        return r.y >= 0 && r.y + r.height <= vh + 1;
      }, { message: "the picture's review stays on screen" })
      .toBe(true);
    await page.evaluate(() => {
      const c = document.querySelector("#metrics-card").getBoundingClientRect();
      window.scrollBy(0, c.top - Math.min(innerHeight * 0.45, innerHeight - c.height - 8));
    });
  }
  await expect
    .poll(
      () =>
        page.evaluate(() => {
          const r = document.querySelector("#metrics-card").getBoundingClientRect();
          const atEnd = scrollY + innerHeight >= document.documentElement.scrollHeight - 2;
          return (r.top <= innerHeight * 0.45 + 2 || atEnd) && r.bottom <= innerHeight;
        }),
      { timeout: 5000 }
    )
    .toBe(true);
  return page.evaluate(() => {
    const r = (s) => document.querySelector(s).getBoundingClientRect();
    const chrome = Math.max(
      ...[...document.querySelectorAll(".app-header, .exercise-header-compact")].map((e) => e.getBoundingClientRect().bottom)
    );
    const q = r("#rate-q");
    const btns = [...document.querySelectorAll(".rate-btn")].map((b) => {
      const x = b.getBoundingClientRect();
      const hit = document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2);
      return { onTop: hit === b, h: x.height };
    });
    return { qBelowChrome: q.top >= chrome - 1, btns };
  });
}

test.describe("Rating: one tap after a take", () => {
  test("a guided step: Calificar opens the one-tap card; Normal saves once against the step's own length", async ({ page }) => {
    await boot(page);
    await page.locator("#btn-next-step").click();
    await page.clock.runFor(400);
    await runOut(page, 35);
    const recorded = await records(page, "s4-lip-trills");
    expect(recorded.takes).toBe(1);
    expect(recorded.auto).toBe(true);
    const n0 = recorded.day.n;

    await page.locator("#btn-step-done-rate").click();
    await expect(page.locator("#step-done")).toBeHidden();
    await expect(page.locator("#metrics-card")).not.toHaveClass(/collapsed/);
    await expect(page.locator("#rate-q")).toHaveText("¿Cómo te fue?");
    await expect(page.locator("#rate-q")).toBeFocused();
    // The step is 1:30 and it ran out.
    await expect(page.locator("#rate-time")).toHaveText("Tiempo: 1:30 de 1:30 ✓");
    await expect(page.locator(".rate-btn")).toHaveText(["Fácil", "Normal", "Me costó"]);
    await expect(page.locator(".rate-btn[aria-pressed='true']")).toHaveCount(0);
    await expect(page.locator("#rate-note")).toHaveText("Un toque guarda la toma.");
    // Inside the routine the way out goes on, and the big "Siguiente
    // ejercicio" no longer competes with the answers.
    await expect(page.locator("#btn-rate-skip")).toHaveText("Seguir sin puntuar");
    await expect(page.locator("#structured-nav")).toBeHidden();
    // The sliders wait under "Más detalles".
    await expect(page.locator("#rate-more")).not.toHaveAttribute("open", "");
    await expect(page.locator("#btn-complete")).toBeHidden();
    const geo = await cardInView(page, { cardFirst: true });
    expect(geo.qBelowChrome).toBe(true);
    geo.btns.forEach((b) => {
      expect(b.onTop).toBe(true);
      expect(b.h).toBeGreaterThanOrEqual(44);
    });

    await page.locator('.rate-btn[data-feel="ok"]').click();
    await expect(page.locator('.rate-btn[data-feel="ok"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#score-result")).toBeVisible();
    await expect(page.locator("#score-result .score-big")).toHaveText("7.0 / 10");
    await expect(page.locator("#score-result")).toContainText("Cómo te fue: Normal");
    // Minutes are full marks for a full 1:30 step, not 2/5 against 5 minutes.
    const minutes = page.locator("#score-result .breakdown li").first();
    await expect(minutes).toContainText("1:30 de 1:30 ✓");
    await expect(minutes.locator("strong")).toHaveText("5/5");
    await expect(page.locator("#rate-note")).toContainText("Guardado: 7.0 / 10");
    await expect(page.locator("#btn-rate-skip")).toBeHidden();
    await expect(page.locator("#ps-routine-next")).toBeVisible();
    // The way on follows the score, not the breakdown, and is brought on
    // screen (on the next frame, then a smooth scroll).
    expect(
      await page.evaluate(() => {
        const list = document.querySelector("#score-result .breakdown");
        const next = document.querySelector("#post-session-next");
        return !!(next.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING);
      })
    ).toBe(true);
    await page.clock.runFor(100);
    await expect
      .poll(
        () =>
          page.evaluate(() => {
            const b = document.querySelector("#ps-routine-next").getBoundingClientRect();
            return b.top >= 0 && b.bottom <= window.innerHeight;
          }),
        { timeout: 5000 }
      )
      .toBe(true);

    // One take, rated in place; the day counted once.
    let after = await records(page, "s4-lip-trills");
    expect(after.takes).toBe(1);
    expect(after.score).toBe(7);
    expect(after.auto).toBe(false);
    expect(after.day.n).toBe(n0);
    // Stored values keep their shape: plain numbers as strings, English ids.
    expect(after.metrics).toEqual({ duration: "2", ease: "3", steadiness: "3", transfer: "3" });

    // A mis-tap is changed in place.
    await page.locator('.rate-btn[data-feel="easy"]').click();
    await expect(page.locator("#score-result .score-big")).toHaveText("10.0 / 10");
    await expect(page.locator('.rate-btn[data-feel="easy"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('.rate-btn[data-feel="ok"]')).toHaveAttribute("aria-pressed", "false");
    after = await records(page, "s4-lip-trills");
    expect(after.takes).toBe(1);
    expect(after.score).toBe(10);
    expect(after.day.n).toBe(n0);
    // The routine moved one step, not two.
    expect(await page.evaluate(() => window.VTSession.get().index)).toBe(1);

    await page.locator("#ps-routine-next").click();
    await page.clock.runFor(400);
    expect(await page.evaluate(() => window.VTApp.getState().exercise?.id)).toBe("s27-lip-trill-solfege");
    await expect(page.locator("#metrics-card")).toHaveClass(/collapsed/);
    await expect(page.locator("#structured-nav")).toBeVisible();
  });

  test("Seguir sin puntuar in a routine keeps the practice unrated and opens the next step", async ({ page }) => {
    await boot(page);
    await page.locator("#btn-next-step").click();
    await page.clock.runFor(400);
    await runOut(page, 35);
    await page.locator("#btn-step-done-rate").click();
    await page.locator("#btn-rate-skip").click();
    await page.clock.runFor(400);
    expect(await page.evaluate(() => window.VTApp.getState().exercise?.id)).toBe("s27-lip-trill-solfege");
    const r = await records(page, "s4-lip-trills");
    expect(r.takes).toBe(1);
    expect(r.score).toBe(null);
    expect(r.auto).toBe(true);
  });

  test("a single exercise at 00:00: the mic stops, the practice is recorded, and the card asks how it went", async ({ page }) => {
    await boot(page);
    await openSingle(page, "s4-lip-trills");
    await runOut(page);
    const st = await page.evaluate(() => ({
      live: window.VTApp.getState().practiceLive,
      engine: !!window.VTApp.getState().practice?.running,
      pill: document.querySelector("#practice-status").textContent
    }));
    expect(st).toEqual({ live: false, engine: false, pill: "Tiempo" });
    await expect(page.locator("#step-done")).toBeHidden();
    await expect(page.locator("#metrics-card")).not.toHaveClass(/collapsed/);
    await expect(page.locator("#rate-done")).toHaveText("¡Listo! Se acabó el tiempo y el micrófono se apagó.");
    await expect(page.locator("#rate-q")).toBeFocused();
    await expect(page.locator("#rate-time")).toHaveText("Tiempo: 5:00 de 5:00 ✓");
    await expect(page.locator("#btn-rate-skip")).toHaveText("Salir sin puntuar");
    // At 00:00 the answers come first, even on a pictured exercise (after a
    // Stop, the review still does): the stage filled the screen and left them
    // below the fold.
    const geo = await cardInView(page, { cardFirst: true });
    expect(geo.btns.every((b) => b.onTop)).toBe(true);
    // The rating is the next step: Empezar steps back to "Otra vez" and the
    // guide steps aside, so the answers sit under the stage.
    await expect(page.locator("#btn-practice-start")).toHaveText("↻ Otra vez");
    await expect(page.locator("#view-exercise .guide-card")).toBeHidden();
    // Nothing looks chosen before the learner chooses.
    await expect(page.locator(".rate-btn[aria-pressed='true']")).toHaveCount(0);
    for (const b of await page.locator(".rate-btn").all()) await expect(b).not.toBeFocused();

    const r = await records(page, "s4-lip-trills");
    expect(r.takes).toBe(1);
    expect(r.day.ex).toContain("s4-lip-trills");
    const n0 = r.day.n;

    // Keyboard: the answers are the next stop after the question.
    await page.keyboard.press("Tab");
    await expect(page.locator('.rate-btn[data-feel="easy"]')).toBeFocused();
    await page.keyboard.press("Tab");
    await page.keyboard.press("Enter");
    await expect(page.locator('.rate-btn[data-feel="ok"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#score-result .score-big")).toHaveText("7.0 / 10");
    const after = await records(page, "s4-lip-trills");
    expect(after.takes).toBe(1);
    expect(after.day.n).toBe(n0);
  });

  test("Salir sin puntuar outside a routine goes home and counts the practice once", async ({ page }) => {
    await boot(page);
    await openSingle(page, "s4-lip-trills");
    await runOut(page);
    const n0 = (await records(page, "s4-lip-trills")).day.n;
    await page.locator("#btn-rate-skip").click();
    await page.clock.runFor(400);
    await expect(page.locator("#view-home")).toHaveClass(/active/);
    const r = await records(page, "s4-lip-trills");
    expect(r.takes).toBe(1);
    expect(r.score).toBe(null);
    expect(r.day.n).toBe(n0);
    // Leaving did not ask the leave question on top of it.
    await expect(page.locator("#leave-modal")).toBeHidden();
  });

  test("Detener before the end: the card opens with the time sung so far; Más detalles saves the sliders and notes once", async ({ page }) => {
    await boot(page);
    await openSingle(page, "s4-lip-trills");
    await start(page);
    await page.clock.fastForward(38000);
    await page.clock.runFor(2000);
    // From the keyboard: Detener hides itself and hands focus to the question.
    await page.locator("#btn-practice-stop").focus();
    await page.keyboard.press("Enter");
    await expect(page.locator("#metrics-card")).not.toHaveClass(/collapsed/);
    await expect(page.locator("#rate-q")).toBeFocused();
    await expect(page.locator("#rate-done")).toBeHidden();
    await expect(page.locator("#rate-time")).toHaveText(/^Tiempo: 0:4\d de 5:00$/);
    await cardInView(page);

    await page.locator("#rate-more > summary").click();
    await expect(page.locator("#rate-more")).toHaveAttribute("open", "");
    await expect(page.locator("#btn-complete")).toHaveText("Guardar con estos detalles");
    // The clock has the minutes; the field is for practice it never saw.
    await expect(page.locator("#m-duration")).toBeHidden();
    await expect(page.locator("#m-ease")).toBeVisible();
    await page.locator("#m-ease").fill("4");
    await page.locator("#m-notes").fill("Mandíbula suelta");
    await page.locator("#btn-complete").click();
    await expect(page.locator("#score-result")).toBeVisible();
    await expect(page.locator(".rate-btn[aria-pressed='true']")).toHaveCount(0);
    await expect(page.locator("#score-result")).not.toContainText("Cómo te fue");
    const r = await records(page, "s4-lip-trills");
    expect(r.takes).toBe(1);
    expect(r.metrics.ease).toBe("4");
    expect(r.metrics.duration).toBe("1");
    // Saved before the practice credit was due: one take, counted once.
    expect(r.day.n).toBe(1);
  });

  test("Puntuar ahora on the way out lands on the question; one tap saves and goes on", async ({ page }) => {
    await boot(page);
    await openSingle(page, "s4-lip-trills");
    await start(page);
    await page.clock.fastForward(50000);
    await page.clock.runFor(500);
    await page.locator("#btn-back-home").click();
    await expect(page.locator("#leave-modal")).toBeVisible();
    await page.locator("#leave-save").click();
    await expect(page.locator("#leave-modal")).toBeHidden();
    await expect(page.locator("#rate-q")).toBeFocused();
    // "Puntuar ahora" asks for the card itself (cardFirst), on main too: once
    // the scroll settles the review is above the screen. The review-first
    // check only passed when it read the page before that scroll had run.
    await cardInView(page, { cardFirst: true });
    await page.locator('.rate-btn[data-feel="hard"]').click();
    await page.clock.runFor(600);
    await expect(page.locator("#view-home")).toHaveClass(/active/);
    const r = await records(page, "s4-lip-trills");
    expect(r.takes).toBe(1);
    expect(r.day.n).toBe(1);
    expect(r.metrics).toMatchObject({ ease: "2", steadiness: "2", transfer: "2" });
  });

  test("the header's tour on an exercise leaves it the way Back does, asking first", async ({ page }) => {
    await boot(page, { viewport: { width: 1280, height: 800 } });
    const view = () => page.evaluate(() => window.VTApp.getState().view);
    const tour = async () => {
      if (!(await page.locator("#btn-tour").isVisible())) await page.locator("#btn-help").click();
      await page.locator("#btn-tour").click();
      await page.clock.runFor(1000);
    };
    // Nothing worth keeping yet: the exercise closes and the tour starts.
    await openSingle(page, "s4-lip-trills");
    await tour();
    await expect(page.locator(".tour-card")).toBeVisible();
    expect(await view()).toBe("home");
    await page.keyboard.press("Escape");
    await expect(page.locator(".tour-card")).toBeHidden();

    // Practice worth keeping: it asks. Staying keeps the mic on and starts no tour.
    await openSingle(page, "s4-lip-trills");
    await start(page);
    await page.clock.fastForward(50000);
    await page.clock.runFor(500);
    expect(await live(page)).toBe(true);
    await tour();
    await expect(page.locator("#leave-modal")).toBeVisible();
    await page.locator("#leave-cancel").click();
    await expect(page.locator("#leave-modal")).toBeHidden();
    await page.clock.runFor(500);
    await expect(page.locator(".tour-card")).toBeHidden();
    expect(await live(page)).toBe(true);
    expect(await view()).toBe("exercise");

    // Descartar: the mic stops and the practice still counts, then the tour.
    await tour();
    await expect(page.locator("#leave-modal")).toBeVisible();
    await page.locator("#leave-discard").click();
    await page.clock.runFor(1000);
    await expect(page.locator(".tour-card")).toBeVisible();
    expect(await live(page)).toBe(false);
    expect(await view()).toBe("home");
    expect((await records(page, "s4-lip-trills")).day).not.toBeNull();
  });

  test("the header's guide on an exercise opens beside it: the take keeps running", async ({ page, context }) => {
    await boot(page, { viewport: { width: 1280, height: 800 } });
    const dialogs = [];
    page.on("dialog", (d) => {
      dialogs.push(d.type());
      d.dismiss().catch(() => {});
    });
    await openSingle(page, "s4-lip-trills");
    await start(page);
    await page.clock.fastForward(50000);
    await page.clock.runFor(500);
    if (!(await page.locator("#link-guide").isVisible())) await page.locator("#btn-help").click();
    const [guide] = await Promise.all([
      context.waitForEvent("page", { timeout: 5000 }),
      page.locator("#link-guide").click()
    ]);
    expect(guide.url()).toContain("/guide.html");
    await guide.close();
    // The exercise did not ask to be left, because it was not.
    expect(dialogs).toEqual([]);
    expect(page.url()).toContain("#ejercicio/s4-lip-trills");
    expect(await live(page)).toBe(true);
    expect((await records(page, "s4-lip-trills")).takes).toBe(0);
    // Elsewhere it is an ordinary link in the same tab.
    await page.locator("#btn-nav-home").click();
    await page.locator("#leave-discard").click();
    await page.clock.runFor(500);
    await expect(page.locator("#view-home")).toHaveClass(/active/);
    await expect(page.locator("#link-guide")).not.toHaveAttribute("target", /.+/);
  });

  test("a count nobody asked for is not scored as zero: Fácil reads as Fácil", async ({ page }) => {
    await boot(page);
    // Pace variation: two self-ratings and a count of key slowdowns.
    await openSingle(page, "v14-pace-variation");
    await page.locator("#btn-toggle-metrics").click();
    await page.locator('.rate-btn[data-feel="easy"]').click();
    await expect(page.locator("#score-result .score-big")).toHaveText("10.0 / 10");
    await expect(page.locator("#score-result")).toContainText("Cómo te fue: Fácil");
    const row = page.locator("#score-result .breakdown li", { hasText: "Sin registrar" });
    await expect(row).toContainText("no cuenta");
    await expect(row.locator("strong")).toHaveText("—");
  });

  test("the take's recording is in the card, in view and in reach, on a phone, a desktop and a phone on its side", async ({ page }) => {
    for (const viewport of [
      { width: 390, height: 844 },
      { width: 1280, height: 800 },
      // A phone on its side: the question and answers come first; the take is
      // one short scroll below them, never under the stage or the header.
      { width: 844, height: 390, short: true }
    ]) {
      await boot(page, { viewport: { width: viewport.width, height: viewport.height } });
      await openSingle(page, "v1-diction");
      await page.evaluate(() => (document.querySelector("#chk-auto-record").checked = true));
      await start(page);
      // MediaRecorder hands over its data on its own clock.
      await page.waitForTimeout(1200);
      await page.clock.fastForward(28000);
      await page.clock.runFor(2000);
      await page.locator("#btn-practice-stop").click();
      const save = page.locator("#btn-save-rec");
      await expect(save).toHaveText("Guardar en historial");
      await expect(page.locator("#btn-discard-rec")).toHaveText("Descartar");
      await expect(page.locator("#metrics-card #playback-area audio")).toHaveCount(1);
      if (viewport.short) {
        await page.clock.runFor(100);
        // v1 is pictured: its review stays on screen, the answers are a scroll below
        const review = page.locator("#mode-focus .mode-panel.has-viz.is-replay");
        if (await review.count()) {
          await page.clock.runFor(100);
          await expect
            .poll(async () => {
              const r = await review.boundingBox();
              return r.y >= 0 && r.y + r.height <= viewport.height + 1;
            }, { message: "the picture's review stays on screen" })
            .toBe(true);
          // the learner's scroll: the answers just under the sticky chrome
          await page.evaluate(() => {
            const chrome = Math.max(...[...document.querySelectorAll(".app-header, .exercise-header-compact")].map((e) => e.getBoundingClientRect().bottom));
            window.scrollTo({ top: scrollY + document.querySelector(".rate-row").getBoundingClientRect().top - chrome - 8, behavior: "instant" });
          });
        }
        await expect
          .poll(() =>
            page.evaluate(() =>
              [...document.querySelectorAll(".rate-btn")].every((b) => {
                const x = b.getBoundingClientRect();
                return x.bottom <= innerHeight && document.elementFromPoint(x.left + x.width / 2, x.top + x.height / 2) === b;
              })
            )
          )
          .toBe(true);
        await save.scrollIntoViewIfNeeded();
      } else {
        await cardInView(page);
      }
      const hit = await page.evaluate(() => {
        const out = {};
        for (const sel of ["#playback-area audio", "#btn-save-rec", "#btn-discard-rec"]) {
          const el = document.querySelector(sel);
          const b = el.getBoundingClientRect();
          const at = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2);
          out[sel] = { inView: b.top >= 0 && b.bottom <= innerHeight, onTop: at === el || el.contains(at) };
        }
        const stage = document.querySelector("#highway-stage").getBoundingClientRect();
        const s = document.querySelector("#btn-save-rec").getBoundingClientRect();
        out.clearOfStage = s.top >= stage.bottom || s.bottom <= stage.top;
        return out;
      });
      expect(hit, `${viewport.width}x${viewport.height}`).toEqual({
        "#playback-area audio": { inView: true, onTop: true },
        "#btn-save-rec": { inView: true, onTop: true },
        "#btn-discard-rec": { inView: true, onTop: true },
        clearOfStage: true
      });
      await save.click();
      await expect(save).toHaveText("Guardada en historial ✓");
      await expect(save).toBeDisabled();
      await page.evaluate(() => sessionStorage.removeItem("vt_seeded"));
    }
  });

  test("an exercise that always records its take shows ⏺ Grabarme ticked; elsewhere the learner's choice is kept", async ({ page }) => {
    await boot(page);
    const box = page.locator("#chk-auto-record");
    const opt = page.locator("#opt-auto-record");
    // v1: recording is the learner's choice, off until they tick it
    await openSingle(page, "v1-diction");
    await expect(box).not.toBeChecked();
    await expect(box).toBeEnabled();
    await expect(box).toHaveAccessibleDescription("");
    // v10 records every take, whatever the box says: the box says so
    await openSingle(page, "v10-power-pause");
    await expect(opt).toBeVisible();
    await expect(box).toBeChecked();
    await expect(box).toBeDisabled();
    await expect(opt).toHaveAttribute("title", /graba siempre la toma/);
    // …to a screen reader too, which does not read the label's title
    await expect(box).toHaveAccessibleDescription(/graba siempre la toma/);
    await start(page);
    await page.waitForTimeout(1200);
    await page.clock.runFor(2000);
    await page.locator("#btn-practice-stop").click();
    // The take is offered, not saved: keeping it is the learner's tap
    await expect(page.locator("#btn-save-rec")).toHaveText("Guardar en historial");
    // Back on v1 the box is the learner's again, as they left it
    await openSingle(page, "v1-diction");
    await expect(box).not.toBeChecked();
    await expect(box).toBeEnabled();
    await expect(opt).not.toHaveAttribute("title", /graba/);
    await expect(box).toHaveAccessibleDescription("");
    await box.check();
    await openSingle(page, "v10-power-pause");
    await openSingle(page, "v1-diction");
    await expect(box, "a tick the learner chose survives the exercise that forced one").toBeChecked();
    await openSingle(page, "v10-power-pause");
    await page.evaluate(() => window.VTI18n.setLang("en"));
    await expect(opt).toHaveAttribute("title", /always records the take/);
    await expect(box).toHaveAccessibleDescription(/always records the take/);
  });

  test("the written guide says some exercises always record, and keeping the take is still the learner's", async ({ page }) => {
    await page.goto(`${BASE}/guide.html`);
    // The recording point under "Guardar, puntuar y el historial", in each language
    const es = page.locator("#guardar + p + ul > li").first();
    await expect(es).toContainText("Grabarte");
    await expect(es).toContainText(/algunos ejercicios graban siempre la toma/i);
    await expect(es).toContainText(/decides si la guardas/);
    const en = page.locator("#guardar-en + p + ul > li").first();
    await expect(en).toContainText("Recording");
    await expect(en).toContainText(/some exercises always record the take/i);
    await expect(en).toContainText(/you decide whether to save it/);
  });

  test("English reads in its own words", async ({ page }) => {
    await boot(page, { lang: "en" });
    await openSingle(page, "s4-lip-trills");
    await runOut(page);
    await expect(page.locator("#rate-done")).toHaveText("Done! Time’s up, and the microphone is off.");
    await expect(page.locator("#rate-q")).toHaveText("How did it go?");
    await expect(page.locator("#rate-time")).toHaveText("Time: 5:00 of 5:00 ✓");
    await expect(page.locator(".rate-btn")).toHaveText(["Easy", "OK", "Hard"]);
    await expect(page.locator("#rate-note")).toHaveText("One tap saves this take.");
    await expect(page.locator("#rate-more > summary")).toHaveText("More details");
    await expect(page.locator("#btn-rate-skip")).toHaveText("Leave without rating");
    const text = await page.locator("#rate").innerText();
    expect(text).not.toMatch(/Cómo|Tiempo|Fácil|Normal|costó|toque|detalles|puntuar|Listo/);
    await page.locator('.rate-btn[data-feel="hard"]').click();
    await expect(page.locator("#score-result")).toContainText("How it went: Hard");
    await expect(page.locator("#rate-note")).toContainText("Saved:");
  });

  test("a language switch mid-take changes the words, not the take: the mic, the clock and Stop stay", async ({ page }) => {
    await boot(page, { viewport: { width: 1280, height: 800 } });
    await openSingle(page, "s4-lip-trills");
    await start(page);
    await page.clock.fastForward(20000);
    await page.clock.runFor(500);
    const clocks = () =>
      page.evaluate(() => ({ sung: window.VTApp.getPracticedSec(), left: window.VTApp.getState().timer.remaining }));
    const before = await clocks();
    const esTitle = await page.locator("#ex-title").textContent();
    await page.locator("#btn-lang").click();
    await page.clock.runFor(500);
    expect(await live(page)).toBe(true);
    await expect(page.locator("#btn-practice-stop")).toBeVisible();
    await expect(page.locator("#btn-practice-start")).toBeHidden();
    await expect(page.locator("#practice-status")).toHaveText(await page.evaluate(() => VTI18n.t("practice.live")));
    await expect(page.locator("#ex-title")).not.toHaveText(esTitle);
    await expect(page.locator("#btn-back-home")).toHaveText(await page.evaluate(() => VTI18n.t("ex.backPractice")));
    // The time keeps counting as practice, and the clock does not start over.
    await page.clock.fastForward(5000);
    await page.clock.runFor(500);
    const after = await clocks();
    expect(after.sung - before.sung).toBeGreaterThan(5);
    expect(after.left).toBeLessThan(before.left - 5);
  });

  test("a language switch after Stop keeps the take's recording, its Save and the time sung", async ({ page }) => {
    await boot(page, { viewport: { width: 1280, height: 800 } });
    await openSingle(page, "v1-diction");
    await page.evaluate(() => (document.querySelector("#chk-auto-record").checked = true));
    await start(page);
    // MediaRecorder hands over its data on its own clock.
    await page.waitForTimeout(1200);
    await page.clock.fastForward(28000);
    await page.clock.runFor(2000);
    await page.locator("#btn-practice-stop").click();
    await expect(page.locator("#btn-save-rec")).toHaveText("Guardar en historial");
    const timer = await page.locator("#timer-display").textContent();
    await page.locator("#btn-lang").click();
    await page.clock.runFor(500);
    await expect(page.locator("#metrics-card #playback-area audio")).toHaveCount(1);
    await expect(page.locator("#btn-save-rec")).toHaveText("Save to history");
    await expect(page.locator("#btn-discard-rec")).toHaveText("Discard");
    await expect(page.locator("#rate-time")).toContainText("Time:");
    await expect(page.locator("#timer-display")).toHaveText(timer);
    await expect(page.locator("#practice-status")).toHaveText(await page.evaluate(() => VTI18n.t("practice.ready")));
    // Rated, its score card follows a switch back too: the same score and ways on, in Spanish.
    await page.locator('.rate-btn[data-feel="easy"]').click();
    const card = page.locator("#score-result");
    await expect(card).toContainText("How it went: Easy");
    const score = await card.locator(".score-big").textContent();
    const buttons = await card.locator("button").count();
    await page.locator("#btn-lang").click();
    await page.clock.runFor(500);
    await expect(card).toBeVisible();
    await expect(card).toContainText("Cómo te fue: Fácil");
    await expect(card).toContainText(await page.evaluate(() => VTI18n.t("toast.sessionEncourage")));
    await expect(card.locator(".score-big")).toHaveText(score);
    await expect(card.locator("button")).toHaveCount(buttons);
    expect(await card.innerText()).not.toMatch(/How it went|Easy|Not rated|Not counted|intention| of \d+:\d\d/);
  });

  test("muted under automation without the opt-in: the mic still stops, the form stays open for other specs", async ({ page }) => {
    await boot(page, { rateOn: false });
    await openSingle(page, "s4-lip-trills");
    await runOut(page);
    expect(await live(page)).toBe(false);
    await expect(page.locator("#metrics-card")).toHaveClass(/collapsed/);
    expect((await records(page, "s4-lip-trills")).takes).toBe(1);
    await page.locator("#btn-toggle-metrics").click();
    await expect(page.locator("#rate-more")).toHaveAttribute("open", "");
    await expect(page.locator("#btn-complete")).toBeVisible();
  });
});
