/**
 * The daily loop (js/daily-loop.js, js/practice-days.js): today's basics on
 * the start panel, days counted in local time, rest days, the completion card,
 * surprises, and the fixes underneath it (practice kept on every exit, a
 * refused microphone that no longer strands a guided routine).
 *
 * Every test runs on a fixed clock in Lima, where the old UTC day turned over
 * at 19:00. Wednesday 23 September 2026, 10:00 local; the week starts Monday 21.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const NOW = "2026-09-23T10:00:00-05:00";
const TODAY = "2026-09-23";

test.use({ timezoneId: "America/Lima", locale: "es-PE" });

/** A ledger with the given days practised. */
function ledger(dayKeys, bank = 1) {
  const days = {};
  dayKeys.forEach((k) => {
    days[k] = { sec: 240, n: 2, ex: ["s4-lip-trills"] };
  });
  return { v: 1, days, rest: { bank, earnedAt: 0, used: [] }, backfilled: true };
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {{ days?: object, loop?: object, lang?: string, query?: string, cardOn?: boolean, micDenied?: boolean, toasts?: boolean, now?: string }} opts
 */
async function boot(page, opts = {}) {
  await page.clock.install({ time: new Date(opts.now || NOW) });
  await page.addInitScript(
    ({ days, loop, lang, cardOn, micDenied, toasts }) => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", lang);
        localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: "singing" }));
        sessionStorage.setItem("vt_e2e", "1");
        if (cardOn) sessionStorage.setItem("vt_loop_e2e", "1");
        // Toasts are muted under automation unless debugging; some tests read them.
        if (toasts) sessionStorage.setItem("vt_debug", "1");
        // Seed once, so a reload inside a test sees what the app wrote.
        if (!sessionStorage.getItem("vt_seeded")) {
          sessionStorage.setItem("vt_seeded", "1");
          if (days) localStorage.setItem("vt_days_v1", JSON.stringify(days));
          if (loop) localStorage.setItem("vt_loop_v1", JSON.stringify(loop));
        }
      } catch {
        /* ignore */
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      async function fakeGUM() {
        if (micDenied) {
          const err = new Error("Permission denied");
          err.name = "NotAllowedError";
          throw err;
        }
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
    { days: opts.days || null, loop: opts.loop || null, lang: opts.lang || "es", cardOn: !!opts.cardOn, micDenied: !!opts.micDenied, toasts: !!opts.toasts }
  );
  await page.goto(BASE + "/" + (opts.query || ""), { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && !!window.VTLoop && !!window.VTDays);
  await page.clock.runFor(500);
}

/** Press Start, let the step run long enough to count, and move on. */
async function practiseStep(page, ms = 40000) {
  await page.locator("#btn-practice-start").click();
  await page.clock.runFor(ms);
  await page.evaluate(() => window.VTApp.advanceStructured("next"));
  await page.clock.runFor(400);
}

const panel = (page) =>
  page.evaluate(() => ({
    state: document.querySelector("#next-step-card")?.dataset.loop || null,
    kicker: document.querySelector("#start-kicker")?.textContent || "",
    title: document.querySelector("#start-title")?.textContent || "",
    sub: document.querySelector("#start-sub")?.textContent || "",
    cta: document.querySelector("#btn-next-step")?.textContent || "",
    ctaClass: document.querySelector("#btn-next-step")?.className || "",
    pressed: document.querySelector('#loop-tiers [aria-pressed="true"]')?.dataset.tier || null,
    loopOn: document.body.classList.contains("loop-on"),
    days: document.querySelector("#loop-days")?.textContent || "",
    week: [...document.querySelectorAll("#loop-week li")].map(
      (l) => (/\bis-(done|rest|missed|today|future)\b/.exec(l.className) || [])[0]
    ),
    primaries: document.querySelectorAll("#start-panel .btn-practice").length
  }));

test.describe("Daily loop", () => {
  test("routines: the Mínimo never changes, Esencial rotates, every step is real", async ({ page }) => {
    await boot(page);
    const res = await page.evaluate((today) => {
      const all = [...VT_EXERCISES.vocal, ...VT_EXERCISES.singing].map((e) => e.id);
      const week = ["2026-09-21", "2026-09-22", "2026-09-23", "2026-09-24", "2026-09-25", "2026-09-26", "2026-09-27"];
      const out = {};
      ["singing", "vocal"].forEach((track) => {
        const mins = week.map((d) => VTLoop.routine(track, "min", d));
        const ess = week.map((d) => VTLoop.routine(track, "ess", d));
        const cls = VTLoop.routine(track, "class", today);
        out[track] = {
          minOrders: [...new Set(mins.map((m) => m.order.join(",")))],
          minSec: mins[0].totalSec,
          essOrders: new Set(ess.map((e) => e.order.join(","))).size,
          essMin: Math.round(ess[0].totalSec / 60),
          classDaily: cls.daily,
          classMin: Math.round(cls.totalSec / 60),
          missing: [...mins, ...ess, cls].flatMap((x) => x.order).filter((id) => !all.includes(id)),
          dupes: [...mins, ...ess, cls].filter((x) => new Set(x.order).size !== x.order.length).length
        };
      });
      return out;
    }, TODAY);

    // The daily minimum is the same two trills every day: sameness is the point.
    expect(res.singing.minOrders).toEqual(["s4-lip-trills,s27-lip-trill-solfege"]);
    expect(res.singing.minSec).toBe(180);
    expect(res.vocal.minOrders.length).toBe(1);
    expect(res.vocal.minSec).toBeLessThanOrEqual(180);
    // Esencial keeps its core and rotates the rest, so a week is not seven copies.
    expect(res.singing.essOrders).toBeGreaterThanOrEqual(4);
    expect(res.vocal.essOrders).toBeGreaterThanOrEqual(3);
    expect(res.singing.essMin).toBeGreaterThanOrEqual(8);
    expect(res.singing.essMin).toBeLessThanOrEqual(12);
    // The whole class on Canto is the prepared daily session.
    expect(res.singing.classDaily).toBe(true);
    expect(res.vocal.classMin).toBeGreaterThanOrEqual(15);
    for (const t of ["singing", "vocal"]) {
      expect(res[t].missing, `${t}: every step exists`).toEqual([]);
      expect(res[t].dupes, `${t}: no step twice in a routine`).toBe(0);
    }
  });

  test("local days: an evening in Lima is still the same day", async ({ page }) => {
    // 20:30 in Lima is already 01:30 the next day in UTC.
    await boot(page, { now: "2026-09-22T20:30:00-05:00" });
    const r = await page.evaluate(() => {
      const d = VTDays.record({ exerciseId: "s4-lip-trills", sec: 90 });
      return { key: VTDays.dayKey(), recorded: d.day, becameDay: d.becameDay };
    });
    expect(r.key).toBe("2026-09-22");
    expect(r.recorded).toBe("2026-09-22");
    expect(r.becameDay).toBe(true);
  });

  test("first visit: the loop stays out of the way until a day is sung", async ({ page }) => {
    await boot(page);
    const p = await panel(page);
    expect(p.loopOn).toBe(false);
    expect(p.state).toBeNull();
    await expect(page.locator("#loop-tiers")).toBeHidden();
    await expect(page.locator("#loop-today")).toBeHidden();
  });

  test("a day sung yesterday: today's basics own the start panel", async ({ page }) => {
    await boot(page, { days: ledger(["2026-09-20", "2026-09-21", "2026-09-22"]) });
    const p = await panel(page);
    expect(p.loopOn).toBe(true);
    expect(p.state).toBe("go");
    expect(p.kicker).toBe("Tus básicos de hoy");
    expect(p.title).toMatch(/3 minutos/);
    expect(p.pressed).toBe("min");
    expect(p.days.trim()).toBe("3");
    // Mon, Tue sung; Wed is today and still open; the rest of the week is ahead.
    expect(p.week).toEqual(["is-done", "is-done", "is-today", "is-future", "is-future", "is-future", "is-future"]);
    // One primary action on the panel, as before.
    expect(p.primaries).toBe(1);
    await expect(page.locator("#loop-tiers")).toBeVisible();
    await expect(page.locator("#loop-today")).toBeVisible();
  });

  test("tier chips: picking Esencial changes the routine and is remembered", async ({ page }) => {
    await boot(page, { days: ledger(["2026-09-21", "2026-09-22"]) });
    await page.locator('#loop-tiers [data-tier="ess"]').click();
    let p = await panel(page);
    expect(p.pressed).toBe("ess");
    expect(p.title).toMatch(/Básicos esenciales/);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTLoop);
    await page.clock.runFor(500);
    p = await panel(page);
    expect(p.pressed).toBe("ess");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("vt_loop_v1")).tier)).toBe("ess");
  });

  test("comeback: after days away the panel offers the smallest step back in", async ({ page }) => {
    await boot(page, {
      days: ledger(["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19"], 0),
      loop: { v: 1, tier: "class" }
    });
    const p = await panel(page);
    expect(p.state).toBe("back");
    expect(p.kicker).toBe("Qué bueno verte");
    expect(p.sub).toMatch(/nada que recuperar/i);
    // Whatever size they usually pick, a comeback starts with the Mínimo.
    expect(p.pressed).toBe("min");
    // Nothing on the page counts what was lost.
    const text = await page.locator("#start-panel").innerText();
    expect(text).not.toMatch(/perdiste|perdida|lost|0 días seguidos/i);
    await expect(page.locator("#welcome-back")).toBeHidden();
  });

  test("rest day: one missed day is covered and the week shows it as rest", async ({ page }) => {
    await boot(page, {
      days: ledger(["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18", "2026-09-19", "2026-09-20", "2026-09-21"], 1)
    });
    const p = await panel(page);
    expect(p.state).toBe("go");
    expect(p.sub).toMatch(/día de descanso/);
    expect(p.week.slice(0, 3)).toEqual(["is-done", "is-rest", "is-today"]);
    const s = await page.evaluate(() => ({ ...VTDays.summary(), used: VTDays.read().rest.used }));
    // Bridged, not lengthened: seven days sung, streak seven.
    expect(s.streak).toBe(7);
    // Six of those days earned a second rest day; one was spent on Tuesday.
    expect(s.rest.bank).toBe(1);
    expect(s.used).toEqual(["2026-09-22"]);
  });

  test("Mínimo run: two steps, the completion card, and home says done for today", async ({ page }) => {
    await boot(page, { days: ledger(["2026-09-20", "2026-09-21", "2026-09-22"]), cardOn: true });
    await page.locator("#btn-next-step").click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    const started = await page.evaluate(() => {
      const s = VTStorage.getSession();
      return { path: s.path, order: s.order, tier: s.tier, open: VTApp.getState().exercise?.id };
    });
    expect(started.path).toBe("basics");
    expect(started.tier).toBe("min");
    expect(started.order).toEqual(["s4-lip-trills", "s27-lip-trill-solfege"]);
    expect(started.open).toBe("s4-lip-trills");
    await expect(page.locator("#session-banner-text")).toContainText(/Mínimo/);
    // Each step runs on its own short timer, not the exercise's full one.
    expect(await page.evaluate(() => VTApp.getState().timer.total)).toBe(90);

    await practiseStep(page);
    expect(await page.evaluate(() => VTApp.getState().exercise?.id)).toBe("s27-lip-trill-solfege");
    await practiseStep(page);

    const card = page.locator("#loop-done");
    await expect(card).toBeVisible();
    await expect(page.locator("#loop-done-count")).toContainText("4");
    const row = await page.evaluate((k) => JSON.parse(localStorage.getItem("vt_days_v1")).days[k], TODAY);
    expect(row.ex).toEqual(expect.arrayContaining(["s4-lip-trills", "s27-lip-trill-solfege"]));
    expect(row.basics).toBe(1);

    await page.locator("#loop-done-close").click();
    await expect(card).toBeHidden();
    const p = await panel(page);
    expect(p.state).toBe("done");
    expect(p.kicker).toBe("Listo por hoy");
    // Done for today: the button stays, quietly, and nothing asks for more.
    expect(p.ctaClass).toMatch(/btn-ghost/);
    expect(p.ctaClass).not.toMatch(/btn-practice/);
    expect(p.cta).toMatch(/Otra vuelta/);
    expect(p.week[2]).toBe("is-done");
  });

  test("leaving the routine without practising does not mark the basics", async ({ page }) => {
    await boot(page, { days: ledger(["2026-09-21", "2026-09-22"]), cardOn: true, toasts: true });
    await page.locator("#btn-next-step").click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await page.evaluate(() => VTApp.advanceStructured("next"));
    await page.clock.runFor(300);
    await page.evaluate(() => VTApp.advanceStructured("next"));
    await page.clock.runFor(300);
    await expect(page.locator("#toast")).toContainText(/Para que cuente/);
    await expect(page.locator("#loop-done")).toBeHidden();
    const s = await page.evaluate(() => VTDays.summary());
    expect(s.basicsToday).toBe(false);
    expect(s.todayDone).toBe(false);
  });

  test("practice is kept on the way out, once, and a longer take replaces it", async ({ page }) => {
    await boot(page, { days: ledger(["2026-09-22"]) });
    await page.evaluate(() => VTApp.openExercise("s4-lip-trills"));
    await page.clock.runFor(300);
    await page.locator("#btn-practice-start").click();
    // Past the credit line (45 s on a full-length exercise), then more.
    await page.clock.runFor(50000);
    const first = await page.evaluate(() => {
      const a = VTApp.recordPracticeIfDue("test");
      const b = VTApp.recordPracticeIfDue("test");
      return { a: !!a, b: !!b };
    });
    expect(first).toEqual({ a: true, b: false });
    await page.clock.runFor(20000);
    const after = await page.evaluate((k) => {
      VTApp.recordPracticeIfDue("test");
      const hist = VTStorage.getProgress()["s4-lip-trills"].history;
      const row = JSON.parse(localStorage.getItem("vt_days_v1")).days[k];
      return { takes: hist.length, sec: hist[hist.length - 1].durationSec, n: row.n, daySec: row.sec };
    }, TODAY);
    // One take however often it is recorded, with the longer time.
    expect(after.takes).toBe(1);
    expect(after.n).toBe(1);
    expect(after.sec).toBeGreaterThanOrEqual(65);
    expect(after.daySec).toBe(after.sec);
  });

  test("a refused microphone inside the routine: the notice stays and Skip moves on", async ({ page }) => {
    await boot(page, { days: ledger(["2026-09-21", "2026-09-22"]), micDenied: true });
    await page.locator("#btn-next-step").click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await page.locator("#btn-practice-start").click();
    await page.clock.runFor(1500);
    const box = page.locator("#mic-blocked");
    await expect(box).toBeVisible();
    await expect(page.locator("#mic-blocked-text")).not.toBeEmpty();
    await expect(page.locator("#btn-mic-retry")).toBeVisible();
    await expect(page.locator("#btn-mic-skip")).toBeVisible();
    await page.locator("#btn-mic-skip").click();
    await page.clock.runFor(400);
    expect(await page.evaluate(() => VTApp.getState().exercise?.id)).toBe("s27-lip-trill-solfege");
  });

  test("surprises: at most one a day, the same after a reload, guaranteed on a comeback", async ({ page }) => {
    await boot(page, { days: ledger(["2026-09-15", "2026-09-16", "2026-09-17", "2026-09-18"]) });
    const r = await page.evaluate(() => {
      const summary = VTDays.summary();
      const a = VTLoop.drawSurprise({ summary, comeback: true, day: "2026-09-23" });
      const again = VTLoop.drawSurprise({ summary, comeback: true, day: "2026-09-23" });
      const b = VTLoop.drawSurprise({ summary, day: "2026-09-24", force: "test" });
      // A week with nothing guarantees the next one.
      const L = JSON.parse(localStorage.getItem("vt_loop_v1"));
      L.since = 6;
      localStorage.setItem("vt_loop_v1", JSON.stringify(L));
      const pity = VTLoop.drawSurprise({ summary, day: "2026-09-25" });
      return { a, again, b, pity, stored: JSON.parse(localStorage.getItem("vt_loop_v1")) };
    });
    expect(r.a.reason).toBe("comeback");
    expect(r.again).toBeNull();
    expect(r.b).not.toBeNull();
    expect(r.pity.reason).toBe("pity");
    expect(r.stored.since).toBe(0);
    const cards = [r.a, r.b, r.pity].filter((x) => x.kind === "card").map((x) => x.id);
    expect(new Set(cards).size, "a card is never repeated").toBe(cards.length);
  });

  test("surprise odds: sparse, not a slot machine", async ({ page }) => {
    await boot(page, { days: ledger(["2026-09-19", "2026-09-20", "2026-09-21", "2026-09-22"]) });
    const hits = await page.evaluate(() => {
      const summary = VTDays.summary();
      let n = 0;
      for (let i = 0; i < 400; i += 1) {
        const L = JSON.parse(localStorage.getItem("vt_loop_v1") || "{}");
        localStorage.setItem("vt_loop_v1", JSON.stringify({ ...L, since: 0, surprises: [], cards: {}, seed: "s" + i }));
        if (VTLoop.drawSurprise({ summary, day: "2026-09-23" })) n += 1;
      }
      return n;
    });
    // Early weeks draw at 25%; allow for sampling noise.
    expect(hits).toBeGreaterThan(60);
    expect(hits).toBeLessThan(145);
  });

  test("milestones: only the exact count is news, and lower ones are marked with it", async ({ page }) => {
    await boot(page, { days: ledger(["2026-09-21", "2026-09-22"]), toasts: true });
    const r = await page.evaluate(() => {
      const day = VTDays.record({ exerciseId: "s4-lip-trills", sec: 90 });
      VTLoop.onPractice({ day, source: "test" });
      return { toast: document.querySelector("#toast")?.textContent || "", ms: JSON.parse(localStorage.getItem("vt_loop_v1")).ms };
    });
    expect(r.toast).toMatch(/3/);
    expect(r.ms).toEqual([1, 3]);
  });

  test("a long history arriving is not told it just reached an old milestone", async ({ page }) => {
    const keys = [];
    for (let i = 40; i >= 1; i -= 1) {
      const d = new Date(Date.UTC(2026, 8, 23 - i, 12));
      keys.push(d.toISOString().slice(0, 10));
    }
    await boot(page, { days: ledger(keys), toasts: true });
    const r = await page.evaluate(() => {
      const day = VTDays.record({ exerciseId: "s4-lip-trills", sec: 90 });
      VTLoop.onPractice({ day, source: "test" });
      return { toast: document.querySelector("#toast")?.textContent || "", loop: localStorage.getItem("vt_loop_v1") };
    });
    expect(r.toast).toMatch(/41/);
    expect(r.toast).not.toMatch(/30/);
  });

  test("the classic arm, forced, keeps the old start panel", async ({ page }) => {
    await boot(page, { days: ledger(["2026-09-21", "2026-09-22"]), query: "?ab_loop_home_2026_10=classic" });
    const p = await panel(page);
    expect(p.loopOn).toBe(false);
    expect(p.state).toBeNull();
    await expect(page.locator("#loop-tiers")).toBeHidden();
  });

  test("experiments ship switched off: control for everyone, nothing exposed", async ({ page }) => {
    await boot(page, { days: ledger(["2026-09-22"]) });
    const r = await page.evaluate(() => {
      const keys = ["loop_home_2026_10", "loop_surprise_2026_10", "loop_minimo_len_2026_10"];
      const rep = VTExperiments.report();
      return {
        arms: keys.map((k) => VTExperiments.variant(k)),
        enabled: keys.map((k) => rep.experiments[k].enabled),
        exposed: keys.map((k) => rep.experiments[k].exposed),
        exposeEvents: (VTAnalytics.summary().counts.experiment_expose || 0)
      };
    });
    expect(r.arms).toEqual(["loop", "surprises", "three"]);
    expect(r.enabled).toEqual([false, false, false]);
    expect(r.exposed).toEqual([null, null, null]);
    expect(r.exposeEvents).toBe(0);
  });

  test("two devices merge: days union, and a sync never mints a rest day", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const a = { v: 1, days: { "2026-09-20": { sec: 200, n: 1, ex: ["s4-lip-trills"] } }, rest: { bank: 0, earnedAt: 6, used: ["2026-09-19"] }, backfilled: true };
      const b = { v: 1, days: { "2026-09-21": { sec: 100, n: 1, ex: ["v1-diction"], basics: 1 } }, rest: { bank: 2, earnedAt: 0, used: [] }, backfilled: true };
      const m = VTDays.merge(a, b);
      const la = { v: 1, ms: [1, 3], cards: { c01: "2026-09-20" }, surprises: [{ day: "2026-09-20", kind: "card", id: "c01" }], comebacks: [], tier: "ess" };
      const lb = { v: 1, ms: [1, 3, 7], cards: { c02: "2026-09-21" }, surprises: [{ day: "2026-09-21", kind: "card", id: "c02" }], comebacks: ["2026-09-21"], tier: "min" };
      const lm = VTLoop.merge(la, lb);
      return { days: Object.keys(m.days).sort(), basics: m.days["2026-09-21"].basics, bank: m.rest.bank, used: m.rest.used, lm };
    });
    expect(r.days).toEqual(["2026-09-20", "2026-09-21"]);
    expect(r.basics).toBe(1);
    // The side that had earned further and spent more leads: bank 0, not 2.
    expect(r.bank).toBe(0);
    expect(r.used).toEqual(["2026-09-19"]);
    expect(r.lm.ms).toEqual([1, 3, 7]);
    expect(Object.keys(r.lm.cards).sort()).toEqual(["c01", "c02"]);
    expect(r.lm.comebacks).toEqual(["2026-09-21"]);
    expect(r.lm.tier).toBe("ess");
  });

  test("English and the Vocal track read in their own words", async ({ page }) => {
    await boot(page, { days: ledger(["2026-09-21", "2026-09-22"]), lang: "en" });
    await page.locator('.tab[data-tab="vocal"]').click();
    await page.clock.runFor(300);
    const p = await panel(page);
    expect(p.kicker).toBe("Today’s basics");
    expect(p.sub).toMatch(/in public/i);
    const text = await page.locator("#start-panel").innerText();
    expect(text).not.toMatch(/básicos|minutos|Tus |Hoy /);
  });
});
