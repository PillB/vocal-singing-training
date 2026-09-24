/**
 * Speech-shape pictures (js/scenes/speech-shape.js): the melody of speech in
 * semitones against your own usual pitch (v12), the landing of a claim (v19),
 * the thinking silence before an answer (v17) and a story's peak against its
 * context (v18). Each is fed by a synthetic speaker from
 * qa/voices/speech-shape.js whose phrases end on purpose (a fall, a rise, a
 * tag), so the measured behaviour can be checked, not only the drawing.
 *
 * Waits poll the mode's own clock (tracker.t), not the wall clock, so a busy
 * machine that drops frames does not move the checks.
 */
const { test, expect } = require("@playwright/test");
const { useVoice, playVoice } = require("./helpers/voice");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page, lang = "es", opts = {}) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message || e)));
  await page.addInitScript((l) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", l);
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
  }, lang);
  if (opts.denyMic) {
    await page.addInitScript(() => {
      if (!navigator.mediaDevices) return;
      navigator.mediaDevices.getUserMedia = async () => {
        const err = new Error("Permission denied");
        err.name = "NotAllowedError";
        throw err;
      };
    });
  } else {
    await useVoice(page);
  }
  await page.goto(BASE + "/?e2e", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
  return errors;
}

async function openAndStart(page, id, voice) {
  await page.evaluate((x) => window.VTApp.openExercise(x), id);
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  await page.locator("#btn-practice-start").click();
  await page.waitForTimeout(250);
  if (voice) await playVoice(page, voice);
}

/** The picture's canvas, drawn (not blank) and fully inside the first screen. */
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

/** Wait until the running mode's clock reaches `sec` seconds. */
async function untilModeTime(page, sec, timeout = 40000) {
  await page.waitForFunction((s) => (window.VTApp.getState().modeInstance?.state?.tracker?.t || 0) >= s, sec, { timeout, polling: 100 });
}

const modeState = (page, fn) => page.evaluate(fn);

test.describe("speech-shape pictures", () => {
  test("v12 melody: semitones against your usual pitch, the flat baseline beside an exaggerated take", async ({ page }) => {
    const errors = await boot(page);
    await openAndStart(page, "v12-melodic-speech", "cadenceFlat");
    await untilModeTime(page, 7);
    const pic = await pictureInView(page);
    expect(pic.found, "the melody ribbon is mounted").toBe(true);
    expect(pic.bottom, "in the first screen").toBeLessThanOrEqual(pic.vh);
    expect(pic.lit, "drawn").toBeGreaterThan(20);
    expect(await page.locator("#pitch-block").isVisible(), "no note highway for speech").toBe(false);
    const base = await modeState(page, () => {
      const st = window.VTApp.getState().modeInstance.state;
      return { range: st.takes[0].range, ref: st.tracker.ref };
    });
    expect(base.ref, "a usual pitch was found").not.toBeNull();
    expect(base.range, "the flat take has a small range").toBeLessThan(3);

    await page.locator("#mode-focus [data-next-take]").click();
    await playVoice(page, "cadence");
    const t1 = await modeState(page, () => window.VTApp.getState().modeInstance.state.tracker.t);
    await untilModeTime(page, t1 + 10, 50000);
    const take = await modeState(page, () => {
      const st = window.VTApp.getState().modeInstance.state;
      const ps = st.tracker.phrases.filter((p) => p.takeIdx === 1 && p.fin);
      return {
        current: st.current,
        locked: st.tracker.locked,
        range: st.takes[1].range,
        kinds: ps.map((p) => p.fin.kind),
        words: document.querySelector("#mode-focus [data-d]")?.textContent || ""
      };
    });
    expect(take.current).toBe(1);
    expect(take.locked, "the baseline set the 0 line").not.toBeNull();
    expect(take.range, "the exaggerated take moves more than the flat one").toBeGreaterThan(base.range + 1.5);
    expect(take.kinds, "endings read as falls").toContain("fall");
    expect(take.kinds, "and rises").toContain("rise");
    expect(take.words).toMatch(/Final de frase|Exagera/);

    await page.locator("#btn-practice-stop").click();
    await expect(page.locator("#mode-focus .mode-panel")).toHaveClass(/is-replay/);
    expect(await modeState(page, () => window.VTApp.getState().modeInstance?.state?.review)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("v19 landing: a fall with a full pause lands; a rise and a tagged fall do not; Again adds a try", async ({ page }) => {
    const errors = await boot(page);
    await openAndStart(page, "v19-authority-close", "claims");
    // Claims: fall + 1.5 s (≈3.2 s), rise + 1.4 s (≈6.6 s), fall + tag + 1.5 s (≈10.7 s)
    await page.waitForFunction(() => (window.VTApp.getState().modeInstance?.state?.slots?.length || 0) >= 3, null, { timeout: 45000, polling: 100 });
    const pic = await pictureInView(page);
    expect(pic.found && pic.bottom <= pic.vh, "the landing strip is in the first screen").toBe(true);
    const s = await modeState(page, () =>
      window.VTApp.getState().modeInstance.state.slots.slice(0, 3).map((x) => {
        const a = x.attempts[0];
        return { kind: a.fin && a.fin.kind, landed: a.landed, tag: a.tag, pause: a.pause };
      })
    );
    expect(s[0].kind).toBe("fall");
    expect(s[0].landed, "a fall and a full second of silence").toBe(true);
    expect(s[1].kind).toBe("rise");
    expect(s[1].landed).toBe(false);
    expect(s[2].kind).toBe("fall");
    expect(s[2].tag, "the rising ¿no? after it is asked about").toBe(true);
    expect(s[2].landed).toBe(false);
    await expect(page.locator("#mode-focus [data-l]")).toHaveText("1 / 5");

    // "Again": the next claim goes into the last slot as a second try
    await page.locator("#mode-focus [data-again]").click();
    await expect(page.locator("#mode-focus [data-again]")).toHaveAttribute("aria-pressed", "true");
    await page.waitForFunction(
      () => {
        const st = window.VTApp.getState().modeInstance.state;
        return st.slots[st.slots.length - 1].attempts.length >= 2;
      },
      null,
      { timeout: 30000, polling: 100 }
    );
    await expect(page.locator("#mode-focus [data-again]")).toHaveAttribute("aria-pressed", "false");

    await page.locator("#btn-practice-stop").click();
    await expect(page.locator("#mode-focus .mode-panel")).toHaveClass(/is-replay/);
    expect(await modeState(page, () => window.VTApp.getState().modeInstance?.state?.review)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("v17 gate: the thinking silence opens the door, the answer is timed, silence closes it, an ‘eeh’ is asked about", async ({ page }) => {
    const errors = await boot(page);
    await openAndStart(page, "v17-strategic-concision", "qaGate");
    await page.waitForFunction(() => window.VTApp.getState().modeInstance?.state?.qs?.[0]?.gateOk === true, null, { timeout: 20000, polling: 100 });
    await expect(page.locator("#mode-focus [data-ok]")).toHaveText("1");
    // The answer runs ≈8.6 s with two 0.7 s pauses, then 2 s of silence closes it
    await page.waitForFunction(() => window.VTApp.getState().modeInstance.state.qs[0].aEnd != null, null, { timeout: 40000, polling: 100 });
    const q0 = await modeState(page, () => {
      const q = window.VTApp.getState().modeInstance.state.qs[0];
      return { silent: q.silent, len: q.aEnd - q.aStart, pauses: q.pauses };
    });
    expect(q0.silent).toBeGreaterThanOrEqual(2.5);
    expect(q0.len).toBeGreaterThan(6);
    expect(q0.len).toBeLessThan(12);
    expect(q0.pauses, "pauses ≥0.5 s inside the answer").toBeGreaterThanOrEqual(1);
    const pic = await pictureInView(page);
    expect(pic.found && pic.bottom <= pic.vh && pic.lit > 20).toBe(true);
    // The next question is up; its thinking time holds a flat "eeh"
    await page.waitForFunction(
      () => {
        const q = window.VTApp.getState().modeInstance.state.qs[1];
        return q && q.blips.length >= 1;
      },
      null,
      { timeout: 30000, polling: 100 }
    );
    const q1 = await modeState(page, () => window.VTApp.getState().modeInstance.state.qs[1]);
    expect(q1.blips[0].filler, "held and flat: ¿relleno?").toBe(true);
    expect(q1.aStart, "a short sound is not the answer").toBeNull();

    await page.locator("#btn-practice-stop").click();
    await expect(page.locator("#mode-focus .mode-panel")).toHaveClass(/is-replay/);
    expect(await modeState(page, () => window.VTApp.getState().modeInstance?.state?.review)).toBe(true);
    expect(errors).toEqual([]);
  });

  test("v18 story: parts move on by button, the marked peak is compared with the context after Stop", async ({ page }) => {
    const errors = await boot(page);
    await openAndStart(page, "v18-story-peak", "story");
    const pic = await pictureInView(page);
    expect(pic.found && pic.bottom <= pic.vh).toBe(true);
    // Quiet, quick context to ≈10 s; a 1.5 s pause (both parts move on in
    // it); a loud, slow peak from ≈11.6 s, marked at 15.5 s
    await untilModeTime(page, 10.3);
    await page.locator("#mode-focus [data-next-phase]").click();
    await untilModeTime(page, 11);
    await page.locator("#mode-focus [data-next-phase]").click();
    expect(await modeState(page, () => window.VTApp.getState().modeInstance.state.index)).toBe(2);
    await untilModeTime(page, 15.5);
    await page.locator("#mode-focus [data-peak]").click();
    await expect(page.locator("#mode-focus [data-peak-st]")).toContainText(/Pico marcado/);
    // The last sentence falls and ends ≈24.1 s; stop a second after it
    await untilModeTime(page, 25.2, 50000);
    await page.locator("#btn-practice-stop").click();
    await expect(page.locator("#mode-focus .mode-panel")).toHaveClass(/is-replay/);
    const c = await modeState(page, () => {
      const st = window.VTApp.getState().modeInstance.state;
      return { review: st.review, ...st.compare };
    });
    expect(c.review).toBe(true);
    expect(c.fromMark).toBe(true);
    expect(c.dDb, "the peak was louder than the context").toBeGreaterThan(3);
    expect(c.pauseBefore, "the pause before the peak").toBeGreaterThanOrEqual(0.8);
    if (c.dRate != null) expect(c.dRate, "and slower").toBeLessThan(0);
    expect(c.end && c.end.kind, "the last sentence falls").toBe("fall");
    expect(errors).toEqual([]);
  });

  test("v18 runs on the clock when the mic is refused", async ({ page }) => {
    const errors = await boot(page, "es", { denyMic: true });
    await openAndStart(page, "v18-story-peak");
    await page.waitForFunction(() => (window.VTApp.getState().modeInstance?.state?.tracker?.t || 0) >= 2, null, { timeout: 15000 });
    await expect(page.locator("#btn-practice-stop")).toBeVisible();
    const remain = Number((await page.locator("#mode-focus [data-remain]").textContent()).replace(/\D/g, ""));
    expect(remain, "the part's countdown runs").toBeLessThan(20);
    const pic = await pictureInView(page);
    expect(pic.found && pic.lit > 20).toBe(true);
    expect(errors).toEqual([]);
  });

  test("English labels", async ({ page }) => {
    await boot(page, "en");
    await page.evaluate(() => window.VTApp.openExercise("v12-melodic-speech"));
    await expect(page.locator("#mode-focus [data-next-take]")).toHaveText(/Next take/);
    await page.evaluate(() => window.VTApp.openExercise("v19-authority-close"));
    await expect(page.locator("#mode-focus [data-again]")).toHaveText(/Again/);
    await page.evaluate(() => window.VTApp.openExercise("v17-strategic-concision"));
    await expect(page.locator("#mode-focus [data-next]")).toHaveText(/Next question/);
    await page.evaluate(() => window.VTApp.openExercise("v18-story-peak"));
    await expect(page.locator("#mode-focus [data-next-phase]")).toHaveAttribute("aria-label", /next part/i);
    await expect(page.locator("#mode-focus [data-phase]")).toHaveText("Context");
  });

  for (const vp of [
    { name: "phone", width: 390, height: 844 },
    { name: "landscape", width: 844, height: 390 }
  ]) {
    test(`all four pictures fit the first screen on a ${vp.name}`, async ({ browser }) => {
      const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
      for (const id of ["v12-melodic-speech", "v19-authority-close", "v17-strategic-concision", "v18-story-peak"]) {
        // A fresh page each (Stop scrolls down to the ratings), and a moment
        // to settle before Start: a Start pressed while the page is still
        // laying out makes the app's stage fit scroll the title to the top in
        // landscape, for any exercise, not only these pictures
        const page = await ctx.newPage();
        const errors = await boot(page);
        await page.evaluate((x) => window.VTApp.openExercise(x), id);
        await expect(page.locator("#view-exercise")).toHaveClass(/active/);
        await page.waitForTimeout(700);
        await page.locator("#btn-practice-start").click();
        await page.waitForTimeout(250);
        await playVoice(page, "cadence");
        await page.waitForTimeout(1500);
        const pic = await pictureInView(page);
        expect(pic.found, id).toBe(true);
        expect(pic.top, `${id} top`).toBeGreaterThanOrEqual(0);
        expect(pic.bottom, `${id} bottom`).toBeLessThanOrEqual(pic.vh);
        const over = await page.evaluate(() => document.scrollingElement.scrollWidth - innerWidth);
        expect(over, `${id} no sideways scroll`).toBeLessThanOrEqual(1);
        // Every control the picture adds is a 44 px tap
        const small = await page.evaluate(() =>
          [...document.querySelectorAll("#mode-focus .viz-head button")]
            .filter((b) => b.offsetParent)
            .map((b) => b.getBoundingClientRect())
            .filter((r) => r.height < 44 || r.width < 44).length
        );
        expect(small, `${id} taps`).toBe(0);
        expect(errors, id).toEqual([]);
        await page.close();
      }
      await ctx.close();
    });
  }

  test("v12 with reduced motion pages instead of scrolling", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    const errors = await boot(page);
    await openAndStart(page, "v12-melodic-speech", "cadence");
    await untilModeTime(page, 20, 50000);
    const pic = await pictureInView(page);
    expect(pic.found && pic.lit > 20).toBe(true);
    expect(await page.evaluate(() => window.VTViz.reducedMotion())).toBe(true);
    const st = await modeState(page, () => {
      const s = window.VTApp.getState().modeInstance.state;
      return { phrases: s.tracker.phrases.length, pageFrom: s.takes[0]._pageFrom };
    });
    expect(st.phrases).toBeGreaterThanOrEqual(5);
    expect(st.pageFrom, "a full page started a new one").toBeGreaterThan(0);
    expect(errors).toEqual([]);
  });
});
