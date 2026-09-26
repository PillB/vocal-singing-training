/**
 * Breath and SOVT pictures (js/scenes/breath.js): lip trills and the straw
 * (s4, s6), the lip-trill scale on the highway (s27), the SH ladder (s15)
 * and S then /A/ (s8). Each is fed a synthetic voice from qa/voices/breath.js
 * that produces the failure the picture is there to show: the lips stopping
 * mid-trill, air with no tone in the straw, a gap in an SH, a sung onset
 * that is not an S.
 */
const { test, expect } = require("@playwright/test");
const { useVoice, playVoice, stopVoice } = require("./helpers/voice");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page, lang = "es") {
  await page.addInitScript((l) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", l);
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
    // Words the pictures draw, so a spec can read a canvas
    window.__drawn = [];
    const fill = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function (s, ...rest) {
      try {
        if (window.__drawn.length > 6000) window.__drawn.splice(0, 3000);
        window.__drawn.push(String(s));
      } catch {
        /* ignore */
      }
      return fill.call(this, s, ...rest);
    };
  }, lang);
  await useVoice(page);
  await page.goto(BASE + "/?e2e", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
}

async function openAndStart(page, id, voice) {
  await page.evaluate((x) => window.VTApp.openExercise(x), id);
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  await page.locator("#btn-practice-start").click();
  await page.waitForFunction(() => !document.querySelector("#btn-practice-stop")?.hidden, null, { timeout: 15000 });
  await page.waitForTimeout(250);
  if (voice) await playVoice(page, voice);
}

async function stop(page) {
  await stopVoice(page);
  await page.locator("#btn-practice-stop").click();
  await page.waitForTimeout(500);
}

/** A canvas, drawn (not blank) and fully inside the first screen. */
async function inView(page, sel = "#mode-focus .vz-canvas, #mode-hud .vz-canvas") {
  return page.evaluate((s) => {
    const c = document.querySelector(s);
    if (!c) return { found: false };
    const r = c.getBoundingClientRect();
    const g = c.getContext("2d");
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < px.length; i += 4 * 97) if (px[i] + px[i + 1] + px[i + 2] > 120) lit++;
    return { found: true, top: r.top, bottom: r.bottom, h: r.height, vh: innerHeight, lit };
  }, sel);
}

const drawn = (page) => page.evaluate(() => window.__drawn.slice(-3000).join(" | "));
const clearDrawn = (page) => page.evaluate(() => (window.__drawn.length = 0));

/** The live mode instance's state, reduced to what a test reads. */
function modeState(page, fn) {
  return page.evaluate(`(() => {
    const m = window.VTApp.getState().modeInstance;
    const st = m && m.state;
    const K = window.VTViz.scenes.breathKit;
    return (${fn})(st, K, m);
  })()`);
}

test.describe("breath and SOVT pictures", () => {
  test("lip trills: a brrr on the floor, a trill at its pitch, and the stall counted", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s4-lip-trills", "trillStops");
    // 2.6 s brrr, a voiced trill from 3 s whose lips stop at 5.2–6.1 s
    await page.waitForTimeout(8200);
    const pic = await inView(page);
    expect(pic.found).toBe(true);
    expect(pic.bottom, "the ribbon sits in the first screen").toBeLessThanOrEqual(pic.vh);
    expect(pic.h).toBeGreaterThan(150);
    expect(pic.lit, "the ribbon is drawn").toBeGreaterThan(30);
    const r = await modeState(
      page,
      `(st, K) => ({ brrr: st.track.sec[K.T.AIRTRILL], trill: st.track.sec[K.T.TRILL], stalls: st.track.stalls.length,
        stallTag: st.track.stalls[0] && st.track.stalls[0].tag, runs: st.track.runs.map((x) => x.kind) })`
    );
    expect(r.brrr, "the unvoiced brrr is heard as flutter with no pitch").toBeGreaterThan(1.2);
    expect(r.trill, "the voiced trill is heard as flutter with a pitch").toBeGreaterThan(1.5);
    expect(r.stalls, "the lips stopping mid-sound is counted").toBeGreaterThanOrEqual(1);
    expect(r.runs).toContain("stall");
    // The axis words sit in their own gutter, away from the trace
    expect(await drawn(page)).toContain("sin tono");
    await clearDrawn(page);
    await stop(page);
    const words = await drawn(page);
    // Totals and the longest unbroken run are named, not two bare numbers
    expect(words).toMatch(/seguido/);
    expect(words, "a share of the sound never passes 100 %").not.toMatch(/\b(1\d[1-9]|1[1-9]\d|[2-9]\d\d) %/);
    const after = await modeState(page, `(st) => ({ review: st.review, replay: document.querySelector("#mode-focus .mode-panel").classList.contains("is-replay") })`);
    expect(after.review).toBe(true);
    expect(after.replay, "Stop leaves the take on the picture").toBe(true);
    expect((await inView(page)).lit).toBeGreaterThan(30);
  });

  test("straw: air with no tone reads as air, and an onset is not a bubble", async ({ page }) => {
    await boot(page);
    // A tone through the straw (0–3.2 s), then air only (to 5.6 s)
    await openAndStart(page, "s6-straw", "strawAir");
    await page.waitForTimeout(5300);
    const mid = await modeState(page, `(st, K) => ({ tag: st.track.tag, T: K.T, status: document.querySelector("#mode-focus [data-status]").textContent })`);
    expect(mid.tag, "air alone is tagged air").toBe(mid.T.AIR);
    expect(mid.status).toMatch(/Solo aire/);
    await page.waitForTimeout(3000);
    const r = await modeState(page, `(st, K) => ({ tone: st.track.sec[K.T.TONE], air: st.track.sec[K.T.AIR], bubbles: st.track.sec[K.T.TRILL] + st.track.sec[K.T.AIRTRILL] })`);
    expect(r.tone).toBeGreaterThan(2);
    expect(r.air).toBeGreaterThan(1.2);
    // The detector's window straddles the silence at every onset; that must
    // not read as a trill in a straw with no flutter at all
    expect(r.bubbles, "no bubbles invented at the onsets").toBeLessThan(0.3);
    // The step's seconds are its total; the longest run is said in words
    const w6 = await drawn(page);
    expect(w6).toMatch(/en total/);
    expect(w6).toMatch(/tono seguido más largo \d+,\d s/);
    const pic = await inView(page);
    expect(pic.bottom).toBeLessThanOrEqual(pic.vh);
    await stop(page);
    expect(await modeState(page, `(st) => st.review`)).toBe(true);
  });

  test("lip trills on a phone: the ribbon fits the first screen", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await openAndStart(page, "s4-lip-trills", "trillStops");
    await page.waitForTimeout(4000);
    const pic = await inView(page);
    expect(pic.found).toBe(true);
    expect(pic.top).toBeGreaterThanOrEqual(0);
    expect(pic.bottom).toBeLessThanOrEqual(pic.vh);
    expect(pic.lit).toBeGreaterThan(20);
    await stop(page);
  });

  test("lip-trill solfège: the bubble strip and the notes ahead on the highway; stones after Stop", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s27-lip-trill-solfege", "trillStops");
    await page.waitForTimeout(7500);
    const live = await page.evaluate(() => {
      const pv = window.VTGetPitchViz();
      const m = window.VTApp.getState().modeInstance;
      const K = window.VTViz.scenes.breathKit;
      return {
        overlay: typeof pv.overlay === "function",
        queue: (pv.noteQueue || []).map((q) => q.label),
        trillRec: m.state.rec.filter((e) => e.tag === K.T.TRILL).length,
        stallMarks: m.state.stallMarks.length,
        step: m.state.i,
        patterns: m.state.patterns
      };
    });
    expect(live.overlay, "the strip is drawn on the highway").toBe(true);
    expect(live.queue.length, "the rest of the pattern waits ahead").toBeGreaterThanOrEqual(1);
    expect(live.queue.every((l) => /^(DO|RE|MI|FA|SOL)$/.test(l))).toBe(true);
    expect(live.trillRec).toBeGreaterThanOrEqual(1);
    expect(live.stallMarks, "the lips stopping shows on the strip").toBeGreaterThanOrEqual(1);
    expect(live.step + live.patterns * 9, "the scale walks").toBeGreaterThan(0);
    await clearDrawn(page);
    const hw = await inView(page, "#pitch-canvas");
    expect(hw.found && hw.bottom <= hw.vh, "the highway is the first-screen picture").toBe(true);
    await stop(page);
    const after = await page.evaluate(() => {
      const pv = window.VTGetPitchViz();
      const m = window.VTApp.getState().modeInstance;
      const stones = m.state.rows.flatMap((r) => r.stones.map((s) => s.state));
      return { overlay: pv.overlay, queue: pv.noteQueue, review: m.state.review, stones, ev: document.querySelector("#mode-hud [data-ev]").textContent };
    });
    expect(after.overlay, "the strip goes with the take").toBeNull();
    expect(after.queue).toBeNull();
    expect(after.review).toBe(true);
    expect(after.stones).toContain("trill");
    expect(after.stones).toContain("stall");
    expect(after.ev).toMatch(/notas con burbujeo/);
    expect(await drawn(page), "the review says where the lips stopped").toMatch(/se paró en|sin burbuja en|el burbujeo siguió/);
    expect((await inView(page, "#mode-hud .vz-canvas")).lit).toBeGreaterThan(20);
  });

  test("SH ladder: rungs clear and stay cleared, the hold is not reset, a gap shows", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s15-sh-air-ladder", "airLadder");
    await page.waitForTimeout(9000);
    const midHold = await modeState(page, `(st) => ({ cleared: st.cleared, cur: st.cur, h: document.querySelector(".mode-big[data-h]").textContent })`);
    expect(midHold.cleared, "5 s cleared while the SH goes on").toBeGreaterThanOrEqual(1);
    expect(midHold.cur, "clearing a rung does not reset the hold").toBeGreaterThan(6);
    expect(midHold.h).toMatch(/^\d+\.\d+s$/);
    expect(parseFloat(midHold.h)).toBeGreaterThan(6);
    const pic = await inView(page);
    expect(pic.found && pic.bottom <= pic.vh).toBe(true);
    expect(pic.lit).toBeGreaterThan(30);
    // The 11 s hiss clears 5 and 10; then a rest; then a hiss with a gap
    await page.waitForTimeout(9500);
    const r = await modeState(page, `(st) => ({ cleared: st.cleared, best: st.best, last: st.track.last && st.track.last.len,
      gaps: st.track.hold ? st.track.hold.gaps.length : st.track.last ? st.track.last.gaps.length : 0 })`);
    expect(r.cleared).toBeGreaterThanOrEqual(2);
    expect(r.best).toBeGreaterThan(9.5);
    expect(r.gaps, "a short gap inside a hold is shown, not hidden").toBeGreaterThanOrEqual(1);
    await stop(page);
    const after = await modeState(page, `(st) => ({ review: st.review, holds: st.track.holds.length })`);
    expect(after.review).toBe(true);
    expect(after.holds).toBeGreaterThanOrEqual(2);
  });

  test("S then /A/: the S lane, then the /A/ lane, and the sung onset is not an S", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s8-breath-support", "sThenA");
    const pic0 = await inView(page);
    expect(pic0.found, "no highway: the lanes are the picture").toBe(true);
    expect(pic0.bottom).toBeLessThanOrEqual(pic0.vh);
    expect(await page.locator("#mode-focus [data-phase]").textContent()).toMatch(/Paso 1/);
    // 7 s of S, a breath, then a sung /A/ from 10 s
    await page.waitForTimeout(13500);
    const r = await modeState(page, `(st) => ({ s: st.sTrack.best, sLast: st.sTrack.last && st.sTrack.last.len, a: st.aTrack.hold ? st.aTrack.hold.len : 0, phase: st.phase })`);
    expect(r.s).toBeGreaterThan(5.5);
    expect(r.sLast, "the /A/ onset did not become the last S").toBeGreaterThan(5.5);
    expect(r.a, "the /A/ is timed in its own lane").toBeGreaterThan(1.5);
    expect(r.phase, "after a real S the next step is the /A/").toBe("A");
    await stop(page);
    const after = await modeState(page, `(st) => ({ review: st.review, bestS: st.bestS })`);
    expect(after.review).toBe(true);
    expect(after.bestS).toBeGreaterThan(5.5);
  });

  test("English: the pictures' words and controls", async ({ page }) => {
    await boot(page, "en");
    await openAndStart(page, "s4-lip-trills", "airTrill");
    await page.waitForTimeout(2500);
    const s4 = await page.evaluate(() => ({
      btn: document.querySelector("#mode-focus [data-xfer]").textContent,
      label: document.querySelector("#mode-focus .vz-canvas").getAttribute("aria-label"),
      status: document.querySelector("#mode-focus [data-status]").textContent
    }));
    expect(s4.btn).toMatch(/On to \/A\//);
    expect(s4.label).toMatch(/^Trill ribbon/);
    expect(s4.status).toMatch(/Brrr, no voice|Listening|Start with a brrr/);
    await stop(page);
    await page.evaluate(() => window.VTApp.openExercise("s15-sh-air-ladder"));
    await page.waitForTimeout(300);
    const s15 = await page.evaluate(() => ({
      label: document.querySelector("#mode-focus .vz-canvas").getAttribute("aria-label"),
      words: document.querySelector("#mode-focus .viz-words").textContent
    }));
    expect(s15.label).toMatch(/^SH ladder/);
    expect(s15.words).toMatch(/Target/);
    expect(s15.words).toMatch(/Rungs/);
    await page.evaluate(() => window.VTApp.openExercise("s8-breath-support"));
    await page.waitForTimeout(300);
    expect(await page.locator("#mode-focus [data-phase]").textContent()).toMatch(/^Step 1/);
    expect(await page.locator("#mode-focus [data-sw]").textContent()).toMatch(/Step 2: \/A\//);
  });
});
