/**
 * Exercise pictures, guided group (js/scenes/guided.js): the pen count (v4),
 * persona & story (v5), the long take (v7), the week plan (v9), gestures
 * (v15), the face (v16), jaw & neck release (s17) and soft-palate space (s19).
 * Most are guided, not measured: the checks are that the picture is drawn in
 * the first screen, that the step and time left move, that a pure pacer keeps
 * the mic closed, that a recorded drill opens a listen-back after Stop, and
 * that only what the mic can hear is ever patched into the metrics.
 */
const { test, expect } = require("@playwright/test");
const { useVoice, playVoice, stopVoice } = require("./helpers/voice");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page, lang = "es") {
  await page.context().grantPermissions(["microphone"]).catch(() => {});
  await page.addInitScript((l) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", l);
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
  }, lang);
  await useVoice(page);
  await page.goto(BASE + "/?e2e", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
}

/** Open an exercise, optionally with shorter steps or a shorter take for the test. */
async function open(page, id, opts = {}) {
  await page.evaluate(
    ({ id, opts }) => {
      const ex = [...window.VT_EXERCISES.vocal, ...window.VT_EXERCISES.singing].find((e) => e.id === id);
      if (opts.phases) ex.practice.phases = opts.phases;
      if (opts.minSec) ex.practice.minSec = opts.minSec;
      if (opts.maxSec) ex.practice.maxSec = opts.maxSec;
      window.VTApp.openExercise(id);
    },
    { id, opts }
  );
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  await page.waitForTimeout(500);
}

/** Every step of an exercise, each `sec` long (the same order and art). */
async function shortSteps(page, id, secs) {
  return page.evaluate(
    ({ id, secs }) => {
      const ex = [...window.VT_EXERCISES.vocal, ...window.VT_EXERCISES.singing].find((e) => e.id === id);
      return ex.practice.phases.map((p, i) => Object.assign({}, p, { sec: Array.isArray(secs) ? secs[i] : secs }));
    },
    { id, secs }
  );
}

/** Start as a finger would: on the button where it is (no test-driven scrolling). */
async function start(page, voice) {
  await expect(page.locator("#btn-practice-start")).toBeVisible();
  await page.evaluate(() => document.getElementById("btn-practice-start").click());
  await page.waitForTimeout(250);
  if (voice) await playVoice(page, voice);
}

/** The picture's canvas: drawn (not blank) and fully inside the first screen. */
async function pictureInView(page) {
  return page.evaluate(() => {
    const c = document.querySelector("#mode-focus .vz-canvas, #mode-hud .vz-canvas");
    if (!c) return { found: false };
    const r = c.getBoundingClientRect();
    const g = c.getContext("2d");
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < px.length; i += 4 * 97) if (px[i] + px[i + 1] + px[i + 2] > 120) lit++;
    return { found: true, top: r.top, bottom: r.bottom, h: r.height, vh: innerHeight, lit };
  });
}

async function expectPicture(page, minH = 100) {
  const pic = await pictureInView(page);
  expect(pic.found, "the picture exists").toBe(true);
  expect(pic.top, "it starts on screen").toBeGreaterThanOrEqual(0);
  expect(pic.bottom, "it ends in the first screen").toBeLessThanOrEqual(pic.vh + 1);
  expect(pic.h).toBeGreaterThan(minH);
  expect(pic.lit, "it is drawn").toBeGreaterThan(20);
}

const vizState = (page, fn) => page.evaluate(fn);

async function stopAndExpectReview(page) {
  await stopVoice(page);
  await page.evaluate(() => document.getElementById("btn-practice-stop").click());
  const panel = page.locator("#mode-focus .mode-panel");
  await expect(panel).toHaveClass(/gd-review/);
  await expect(panel).toHaveClass(/is-replay/);
  await expect(page.locator("#mode-focus [data-ch-play]"), "the listen-back is ready").toBeEnabled({ timeout: 8000 });
}

test.describe("guided pictures", () => {
  test("s17 release paces without asking for the mic; the step and time left move", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window.__gumCalls = 0;
      const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (c) => {
        window.__gumCalls++;
        return orig(c);
      };
    });
    await open(page, "s17-jaw-neck-release");
    await start(page);
    const remain = page.locator("#mode-focus [data-remain]");
    const first = await remain.textContent();
    await expect.poll(() => remain.textContent(), { timeout: 3000 }).not.toBe(first);
    await expectPicture(page, 150);
    expect(await page.evaluate(() => window.__gumCalls), "a pure pacer keeps the mic closed").toBe(0);
    const before = await vizState(page, () => window.VTApp.getState().modeInstance.viz.run.index);
    await page.locator("#mode-focus [data-next-step]").click();
    const after = await vizState(page, () => window.VTApp.getState().modeInstance.viz.run.index);
    expect(after).toBe(before + 1);
    await expect(page.locator("#mode-focus [data-phase]")).toHaveText(/Cuello|cuello/);
  });

  test("s19 counts sung holds and compares closed with open after Stop", async ({ page }) => {
    await boot(page);
    const phases = await shortSteps(page, "s19-soft-palate-surprise", [3, 3, 10, 12, 4]);
    await open(page, "s19-soft-palate-surprise", { phases });
    await expect(page.locator("#pitch-canvas"), "space is not a pitch drill").toBeHidden();
    await start(page, "palateLouder");
    await expectPicture(page, 150);
    // Two silent steps, then the reference note, then 2.6 s phrases
    await expect.poll(async () => Number(await page.locator("#mode-focus [data-h]").textContent()), { timeout: 20000 }).toBeGreaterThanOrEqual(2);
    await expect
      .poll(() => vizState(page, () => window.VTApp.getState().modeInstance._abDone().length), { timeout: 20000 })
      .toBe(2);
    const ab = await vizState(page, () => {
      const [a, b] = window.VTApp.getState().modeInstance._abDone();
      return { a: b.r0 - a.r0, dDb: b.db - a.db, lenA: a.len, lenB: b.len };
    });
    expect(ab.lenA, "a whole phrase, not the tail of the last step").toBeGreaterThanOrEqual(1);
    expect(ab.lenB).toBeGreaterThanOrEqual(1);
    expect(Math.abs(ab.dDb), "the voice alternates quiet and loud (≈6 dB)").toBeGreaterThan(3);
    await stopAndExpectReview(page);
    const labels = await vizState(page, () => window.VTApp.getState().modeInstance.viz.chapters.map((c) => c.label));
    expect(labels).toEqual(expect.arrayContaining(["1 · Cerrado", "2 · Abierto", "Cerrado → abierto"]));
  });

  test("s19 logic: A/B in dB, busy-device frames, the last step's tail, short phrases", async ({ page }) => {
    await boot(page);
    const out = await page.evaluate(() => {
      function mount(phases) {
        const m = window.VTPracticeModes.get("openSpace");
        const host = document.createElement("div");
        document.body.appendChild(host);
        m.mount(host, { phases, minHoldMs: 1500 });
        m._host = host;
        return m;
      }
      function done(m) {
        const res = m.onStop({});
        const pair = m._abDone();
        m._host.remove();
        return { holds: m.state.holds, patches: res.patches, summary: res.summary, pair: pair.map((p) => ({ r0: p.r0, len: p.len, db: p.db })) };
      }
      // A script of [seconds, rms] pieces, fed at `every` ms with dtMs capped like the engine's
      function feed(m, script, every = 16) {
        let el = 0;
        for (const [sec, rms] of script) {
          const n = Math.round((sec * 1000) / every);
          for (let i = 0; i < n; i++) {
            el += every;
            m.onFrame({ dtMs: Math.min(50, every), elapsedMs: el, rms, voiced: rms > 0, sounding: rms > 0, rawFreq: rms > 0 ? 220 : 0 });
          }
        }
      }
      const AB = [{ label: "AB", labelEs: "AB", sec: 600, sound: true, ab: true }];
      const r = {};
      let m = mount(AB);
      feed(m, [[0.5, 0], [2, 0.1], [0.6, 0], [2, 0.2], [0.6, 0]]);
      r.pair = done(m);
      m = mount(AB);
      feed(m, [[0.5, 0], [2.6, 0.1], [0.9, 0], [2.6, 0.2], [0.9, 0]], 200);
      r.busy = done(m);
      m = mount(AB);
      feed(m, [[1.5, 0.1], [0.6, 0], [2, 0.1], [0.6, 0]]);
      r.tail = done(m);
      m = mount([{ label: "S", labelEs: "S", sec: 600, sound: true }]);
      feed(m, [[0.9, 0.1], [0.9, 0], [0.9, 0.1], [0.9, 0], [0.9, 0.1], [0.9, 0]]);
      r.short = done(m);
      return r;
    });
    expect(out.pair.pair.length).toBe(2);
    expect(out.pair.pair[1].db - out.pair.pair[0].db, "twice the rms is +6 dB").toBeCloseTo(6.02, 1);
    expect(out.pair.holds, "each 2 s phrase is also a sung hold").toBe(2);
    expect(out.pair.patches, "only the measured holds are patched").toEqual({ openHolds: 2 });
    expect(out.pair.summary).toMatch(/\+6,0 dB aprox/);
    expect(out.busy.pair.length, "sparse frames: a 0.9 s breath still splits the phrases").toBe(2);
    expect(out.busy.pair[0].len).toBeGreaterThan(2);
    expect(out.busy.pair[0].len).toBeLessThan(3.2);
    expect(out.tail.pair.length, "a phrase already sounding when the step starts is not taken").toBe(1);
    expect(out.tail.pair[0].r0).toBeGreaterThan(2);
    expect(out.short.holds, "phrases under 1.5 s are not holds").toBe(0);
    expect(out.short.patches).toEqual({});
  });

  test("guided drills never fill a self-rating", async ({ page }) => {
    await boot(page);
    const out = await page.evaluate(() => {
      const all = [...window.VT_EXERCISES.vocal, ...window.VT_EXERCISES.singing];
      const res = {};
      for (const [id, mode] of [
        ["v4-articulation-pen", "articulationContrast"],
        ["v5-neutral-ears", "recordOnly"],
        ["v7-record-review", "reviewSession"],
        ["v15-gestures", "gestureReps"],
        ["v16-facial-expression", "facePhases"],
        ["s17-jaw-neck-release", "releaseFlow"]
      ]) {
        const ex = all.find((e) => e.id === id);
        const m = window.VTPracticeModes.get(mode);
        const host = document.createElement("div");
        document.body.appendChild(host);
        m.mount(host, Object.assign({}, ex.practice));
        m.onStart?.();
        let el = 0;
        for (let i = 0; i < 250; i++) {
          el += 16;
          m.onFrame({ dtMs: 16, elapsedMs: el, rms: 0.2, voiced: true, sounding: true, rawFreq: 200 });
        }
        const r = m.onStop({});
        host.remove();
        res[id] = { patches: r.patches, summary: r.summary };
      }
      return res;
    });
    for (const id of ["v4-articulation-pen", "v5-neutral-ears", "v7-record-review", "v15-gestures", "v16-facial-expression"]) {
      expect(out[id].patches, id + ": self-ratings stay with the learner").toEqual({});
      expect(out[id].summary, id + " has a summary").toBeTruthy();
    }
    // Release: only the steps done, never "ease" or "relaxation"
    expect(Object.keys(out["s17-jaw-neck-release"].patches).every((k) => k === "phasesDone")).toBe(true);
  });

  test("v4 counts on the beat, then offers A (pen) and B (no pen) to hear", async ({ page }) => {
    await boot(page);
    const phases = await shortSteps(page, "v4-articulation-pen", [6, 3, 4]);
    await open(page, "v4-articulation-pen", { phases });
    await start(page, "countNumbers");
    await page.waitForTimeout(1500);
    await expectPicture(page, 150);
    await page.waitForTimeout(12000);
    await stopAndExpectReview(page);
    const labels = await vizState(page, () => window.VTApp.getState().modeInstance.viz.chapters.map((c) => c.label));
    expect(labels.slice(0, 3)).toEqual(["A · con bolígrafo", "B · sin bolígrafo", "A y luego B"]);
  });

  test("v7 keeps the page still, grows the ribbon and cuts the take by minute", async ({ page }) => {
    await boot(page);
    await open(page, "v7-record-review", { minSec: 4, maxSec: 60 });
    await expectPicture(page, 150);
    const y0 = await page.evaluate(() => scrollY);
    await start(page, "longTake");
    await page.waitForTimeout(1000);
    expect(Math.abs((await page.evaluate(() => scrollY)) - y0), "Start does not scroll the page").toBeLessThan(4);
    await page.waitForTimeout(4500);
    await expect(page.locator("#mode-focus [data-t]")).not.toHaveText("0:00");
    const r = await vizState(page, () => {
      const v = window.VTApp.getState().modeInstance.viz;
      return { bins: v.bins.filter((b) => b >= 0).length, rows: v._ribbon && v._ribbon.rows };
    });
    expect(r.bins, "a bar per second of voice").toBeGreaterThanOrEqual(2);
    expect(r.rows).toBeGreaterThanOrEqual(1);
    await expectPicture(page, 150);
    await stopAndExpectReview(page);
    const labels = await vizState(page, () => window.VTApp.getState().modeInstance.viz.chapters.map((c) => c.label));
    expect(labels[0]).toMatch(/Minuto 1/);
  });

  test("v9 draws this week and the twelve at open, and opens the plan", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      const D = window.VTDays;
      const today = D.dayKey();
      const plan = window.VTStorage.getWeekPlan();
      plan.weekNumber = 3;
      plan.element = "Diction";
      plan.status = "active";
      plan.startedAt = D.parseDay(D.addDays(today, -3)).toISOString();
      plan.reviews = [
        { week: 2, element: "Volume", verdict: "improved", at: new Date().toISOString() },
        { week: 1, element: "Volume", verdict: "continue", at: new Date().toISOString() }
      ];
      window.VTStorage.setWeekPlan(plan);
      const bag = window.VTStorage.getDays() || { v: 1, days: {}, rest: { bank: 1, earnedAt: 0, used: [] } };
      bag.days = bag.days || {};
      bag.days[D.addDays(today, -3)] = { sec: 400, n: 2, ex: ["v1-diction"] };
      bag.days[D.addDays(today, -1)] = { sec: 350, n: 1, ex: ["v4-articulation-pen"] };
      bag.backfilled = true;
      window.VTStorage.setDays(bag);
    });
    await open(page, "v9-12-week");
    await page.waitForTimeout(300);
    // A plan, not a drill: drawn before any Start
    await expectPicture(page, 120);
    await expect(page.locator("#mode-focus [data-week-head]")).toContainText("Semana 3");
    const m = await vizState(page, () => window.VTApp.getState().modeInstance._weekModel());
    expect(m.days.length).toBe(7);
    expect(m.days.filter((d) => d.today).length, "today is in the week").toBe(1);
    expect(m.days.filter((d) => d.state === "focus").length, "two days with the focus").toBe(2);
    expect(m.weeks.length).toBe(12);
    await page.locator("#mode-focus [data-open-plan]").click();
    await expect(page.locator("#view-plan")).toHaveClass(/active/);
  });

  test("v15 gestures: drawn, the next step on tap, a listen-back after Stop", async ({ page }) => {
    await boot(page);
    await open(page, "v15-gestures");
    await start(page, "speech");
    await page.waitForTimeout(2500);
    await expectPicture(page, 150);
    await page.locator("#mode-focus [data-next-step]").click();
    expect(await vizState(page, () => window.VTApp.getState().modeInstance.viz.run.index)).toBe(1);
    await expect(page.locator("#mode-focus [data-rep], #mode-focus [data-tap]"), "no tap-to-score buttons").toHaveCount(0);
    await stopAndExpectReview(page);
  });

  // One mic session per page: the synthetic voice hands back its stopped stream
  test("v16 face: drawn step by step, a listen-back after Stop", async ({ page }) => {
    await boot(page);
    const phases = await shortSteps(page, "v16-facial-expression", 3);
    await open(page, "v16-facial-expression", { phases });
    await start(page, "speech");
    await page.waitForTimeout(1500);
    await expectPicture(page, 150);
    await page.waitForTimeout(3000);
    await stopAndExpectReview(page);
    const n = await vizState(page, () => window.VTApp.getState().modeInstance.viz.chapters.length);
    expect(n).toBeGreaterThanOrEqual(1);
  });

  test("English labels on the guided drills", async ({ page }) => {
    await boot(page, "en");
    await open(page, "v15-gestures");
    await start(page);
    await expect(page.locator("#mode-focus [data-next-step]")).toHaveText(/Next →/);
    await page.evaluate(() => document.getElementById("btn-practice-stop").click());
    await open(page, "v9-12-week");
    await expect(page.locator("#mode-focus [data-open-plan]")).toHaveText(/Open the plan/);
    await open(page, "v7-record-review");
    await expect(page.locator("#mode-focus [data-topic]")).toHaveText(/Another topic/);
    await open(page, "s19-soft-palate-surprise");
    await start(page);
    await expect(page.locator("#mode-focus [data-phase]")).toHaveText(/[A-Za-z]/);
    const phase = await page.locator("#mode-focus [data-phase]").textContent();
    expect(phase).not.toMatch(/Sorpresa|bostezo/);
  });
});

test.describe("guided pictures on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

  for (const id of ["v5-neutral-ears", "s17-jaw-neck-release", "s19-soft-palate-surprise", "v7-record-review"]) {
    test(`${id}: the picture sits in the first screen`, async ({ page }) => {
      await boot(page);
      await open(page, id);
      await start(page, id === "s17-jaw-neck-release" ? null : "speech");
      await page.waitForTimeout(1200);
      await expectPicture(page, 200);
      const tap = await page.evaluate(() =>
        [...document.querySelectorAll("#mode-focus .gd-ctl button:not([hidden])")].filter((b) => b.offsetParent).map((b) => {
          const r = b.getBoundingClientRect();
          return Math.min(r.width, r.height);
        })
      );
      for (const s of tap) expect(s, "44 px taps").toBeGreaterThanOrEqual(43.5);
    });
  }

  test("v5: skipping to the end still leaves a take to hear", async ({ page }) => {
    await boot(page);
    await open(page, "v5-neutral-ears");
    await start(page, "speech");
    await page.waitForTimeout(2500);
    for (let i = 0; i < 7; i++) {
      const b = page.locator("#mode-focus [data-next-step]");
      if (await b.isVisible().catch(() => false)) await b.click();
    }
    await page.waitForTimeout(800);
    await stopAndExpectReview(page);
    await page.locator("#mode-focus [data-ch-play]").click();
    await expect.poll(() => vizState(page, () => !!window.VTApp.getState().modeInstance.viz.player.playing), { timeout: 4000 }).toBe(true);
    await expectPicture(page, 200);
  });
});
