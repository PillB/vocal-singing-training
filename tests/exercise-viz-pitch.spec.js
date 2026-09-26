/**
 * Exercise pictures — pitch family (js/scenes/pitch.js on the note highway).
 * Each exercise: the highway picture is drawn and sits in the first screen,
 * the measured behaviour works with a synthetic singer (qa/voices/pitch.js),
 * the labels switch to English, and Stop leaves a review on the canvas.
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
      // Start every take at the written octave
      localStorage.setItem("vt_octave_shift", "0");
      localStorage.setItem("vt_range_auto", "0");
    } catch {
      /* ignore */
    }
  }, lang);
  await useVoice(page);
  await page.goto(BASE + "/?e2e", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
}

async function openAndStart(page, id, voice) {
  await page.evaluate((x) => window.VTApp.openExercise(x), id);
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  await page.waitForTimeout(300);
  await page.locator("#btn-practice-start").click();
  await page.waitForTimeout(250);
  if (voice) await playVoice(page, voice);
}

/** The highway canvas: drawn (not blank) and fully inside the first screen. */
async function highwayInView(page) {
  return page.evaluate(() => {
    const c = document.querySelector("#pitch-canvas");
    if (!c) return { found: false };
    const r = c.getBoundingClientRect();
    const g = c.getContext("2d");
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < px.length; i += 4 * 97) if (px[i] + px[i + 1] + px[i + 2] > 150) lit++;
    return { found: true, top: r.top, bottom: r.bottom, h: r.height, vh: innerHeight, lit };
  });
}

/** The live mode's picture state (what the overlay paints). */
async function viz(page) {
  return page.evaluate(() => {
    const m = window.VTApp.getState().modeInstance;
    const v = (m && m.state && m.state.viz) || {};
    const pv = window.VTGetPitchViz();
    return {
      head: v.head || "",
      right: v.right || "",
      review: !!v.review,
      sirens: (v.sirens || []).length,
      breaks: (v.breaks || []).length,
      extent: v.extent ? v.extent.hi - v.extent.lo : 0,
      best: v.best || 0,
      holds: (v.holds || []).length,
      phase: v.phase || null,
      marks: (v.marks || []).length,
      steps: (v.steps || []).length,
      slots: (v.slots || []).filter((s) => s.state === "done").length,
      phrases: (v.phrases || []).length,
      phrasesOk: (v.phrases || []).filter((p) => p.ok).length,
      links: (v.links || []).length,
      locked: m.state.locked || 0,
      landed: m.state.landed || 0,
      chordsDone: m.state.chordsDone || 0,
      queue: pv.noteQueue ? pv.noteQueue.length : 0,
      overlay: !!pv.overlay,
      keep: !!pv.display.keepOnStop,
      frozen: !!pv._frozenAt,
      gameHold: !!pv.display.gameHold
    };
  });
}

/**
 * After Stop: where the review card goes (kit.reviewPlan) and where the lanes
 * start (the display's headPx), so a test can check the card covers no lane.
 */
async function reviewLayout(page) {
  return page.evaluate(() => {
    const kit = window.VTViz.scenes.pitchKit;
    const m = window.VTApp.getState().modeInstance;
    const v = m.state.viz;
    const pv = window.VTGetPitchViz();
    const gh = pv.h - 58;
    const st = pv.safeTop || 0;
    const rows = v.reviewRows || v.summary || [];
    const plan = kit.reviewPlan(kit.measureCtx(), kit.plotBox(pv.w, gh, st), rows, {});
    const hp = pv.display.headPx;
    const head = typeof hp === "function" ? hp(gh, st) : hp || 0;
    return plan ? { mode: plan.mode, bottom: plan.y + plan.h, lanesTop: st + head, gh } : { mode: null };
  });
}

async function stop(page) {
  await stopVoice(page);
  await page.locator("#btn-practice-stop").click();
  await page.waitForTimeout(900);
}

async function metric(page, name) {
  return page.evaluate((n) => document.querySelector(`#metrics-form [name="${n}"]`)?.value ?? null, name);
}

test.describe("pitch pictures", () => {
  test.describe.configure({ timeout: 60_000 });

  test("s5 sirens: range and jumps are measured, the count is logged, Stop leaves a review", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s5-sirens", "sirenBreak");
    await page.waitForTimeout(12500);
    const pic = await highwayInView(page);
    expect(pic.found).toBe(true);
    expect(pic.bottom).toBeLessThanOrEqual(pic.vh);
    expect(pic.lit, "the siren line is drawn").toBeGreaterThan(20);
    const v = await viz(page);
    expect(v.sirens, "up then down, 5+ semitones each way").toBeGreaterThanOrEqual(1);
    expect(v.breaks, "the register jump in the glide is marked").toBeGreaterThanOrEqual(1);
    expect(v.extent).toBeGreaterThan(15);
    expect(Number(await page.locator("#mode-hud [data-s]").textContent())).toBe(v.sirens);
    // Free range: no piano drone and no target lane
    expect(await page.evaluate(() => window.VTGetPitchViz().display.primaryLane)).toBe(false);
    await stop(page);
    const after = await viz(page);
    expect(after.review).toBe(true);
    expect(after.overlay && after.keep && after.frozen, "the review stays on the highway").toBe(true);
    expect(Number(await metric(page, "sirens"))).toBeGreaterThanOrEqual(1);
    const lit = (await highwayInView(page)).lit;
    expect(lit, "the frozen take is still drawn after Stop").toBeGreaterThan(20);
  });

  test("s1 fry: creak and clear tone are told apart, the best clear hold is logged", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s1-vocal-fry", "fryClear");
    await page.waitForTimeout(11000);
    const pic = await highwayInView(page);
    expect(pic.found && pic.bottom <= pic.vh && pic.lit > 20).toBe(true);
    const v = await viz(page);
    expect(v.phase, "a clear second moves to step 2 by itself").toBe("clear");
    expect(v.best).toBeGreaterThanOrEqual(2);
    expect(v.best, "the fry part is not counted as clear").toBeLessThan(3.4);
    await expect(page.locator("#mode-hud [data-phase]")).toContainText(/Paso 2/);
    await stop(page);
    expect((await viz(page)).review).toBe(true);
    expect(Number(await metric(page, "maxHold"))).toBeGreaterThanOrEqual(2);
  });

  test("s7 humming: soft targets as stones, held notes counted", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s7-humming", "follow");
    await page.waitForTimeout(1200);
    // Only the blocks that fit whole wait to the right
    expect((await viz(page)).queue, "the next notes wait to the right").toBeGreaterThanOrEqual(3);
    // Five targets, as the title says (two rounds make the goal of ten)
    expect((await viz(page)).steps).toBe(5);
    await expect(page.locator("#mode-hud .mode-title")).toContainText("5 objetivos");
    await page.waitForTimeout(8500);
    const pic = await highwayInView(page);
    expect(pic.found && pic.bottom <= pic.vh && pic.lit > 20).toBe(true);
    const v = await viz(page);
    expect(v.locked).toBeGreaterThanOrEqual(3);
    // The app's chord loop does not replace the hum targets
    expect(await page.evaluate(() => !!window.VTPiano?.loopActive)).toBe(false);
    await stop(page);
    expect((await viz(page)).review).toBe(true);
    // A wide stage: the review card sits beside the take
    expect((await reviewLayout(page)).mode).toBe("side");
    expect(Number(await metric(page, "targets"))).toBeGreaterThanOrEqual(3);
  });

  test("s9 pitch match: listen first, then locks; an octave up counts", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s9-pitch-match", "matchListen");
    await page.waitForTimeout(600);
    expect((await viz(page)).gameHold, "nothing scores while the reference rings").toBe(true);
    await page.waitForTimeout(10000);
    const pic = await highwayInView(page);
    expect(pic.found && pic.bottom <= pic.vh && pic.lit > 20).toBe(true);
    const v = await viz(page);
    expect(v.slots).toBeGreaterThanOrEqual(2);
    // Now an octave above the target
    await page.evaluate(() => {
      window.__VTVoice.define("octaveUp", (h) => {
        h.vibrato(6);
        h.startFollow(1205);
        h.voiceOn(0.3, 0.05);
      });
      window.__VTVoice.play("octaveUp");
    });
    await page.waitForTimeout(4500);
    expect((await viz(page)).slots).toBeGreaterThan(v.slots);
    await stop(page);
    expect((await viz(page)).review).toBe(true);
    expect(Number(await metric(page, "matches"))).toBeGreaterThanOrEqual(3);
  });

  test("s10 five-note scale: steps lock in order with the path ahead", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s10-five-note", "follow");
    await page.waitForTimeout(1000);
    const q = await viz(page);
    expect(q.queue).toBeGreaterThanOrEqual(3);
    // One step counter, on the picture; the panel names the root
    expect(q.head).toMatch(/Paso \d+\/9/);
    await expect(page.locator("#mode-hud [data-root]")).toContainText("Raíz");
    await expect(page.locator("#mode-hud [data-step]")).toHaveCount(0);
    await page.waitForTimeout(9500);
    const pic = await highwayInView(page);
    expect(pic.found && pic.bottom <= pic.vh && pic.lit > 20).toBe(true);
    const v = await viz(page);
    expect(v.locked).toBeGreaterThanOrEqual(5);
    expect(v.marks).toBe(v.locked);
    expect(await page.evaluate(() => !!window.VTPiano?.loopActive)).toBe(false);
    await stop(page);
    expect((await viz(page)).review).toBe(true);
  });

  test("s16 major scale: the engine target walks the scale", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s16-major-scale-coord", "stoneFollow");
    const seen = new Set();
    for (let i = 0; i < 20; i++) {
      await page.waitForTimeout(500);
      seen.add(Math.round(await page.evaluate(() => window.VTApp.getState().practice.targetFreq)));
    }
    expect(seen.size, "several scale steps were targeted in turn").toBeGreaterThanOrEqual(4);
    const v = await viz(page);
    expect(v.locked).toBeGreaterThanOrEqual(4);
    await stop(page);
    expect((await viz(page)).review).toBe(true);
  });

  test("s2 solfège chords: the note the piano plays is landed and counted", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s2-solfege-chords", "follow");
    await page.waitForTimeout(11000);
    const pic = await highwayInView(page);
    expect(pic.found && pic.bottom <= pic.vh && pic.lit > 20).toBe(true);
    const v = await viz(page);
    expect(v.landed).toBeGreaterThanOrEqual(1);
    expect(parseInt(await page.locator("#mode-hud [data-r]").textContent(), 10)).toBe(v.landed);
    await stop(page);
    expect((await viz(page)).review).toBe(true);
    expect(Number(await metric(page, "reps"))).toBeGreaterThanOrEqual(1);
  });

  test("s13 arpeggio: stones light 1-3-5-8 in order, intervals are measured", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s13-arpeggio-match", "follow");
    await page.waitForTimeout(11000);
    const pic = await highwayInView(page);
    expect(pic.found && pic.bottom <= pic.vh && pic.lit > 20).toBe(true);
    const v = await viz(page);
    expect(v.chordsDone).toBeGreaterThanOrEqual(1);
    expect(v.links).toBeGreaterThanOrEqual(2);
    await stop(page);
    expect((await viz(page)).review).toBe(true);
  });

  test("s3 song phrases: phrase lengths against the goal, stanza taps logged", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "s3-song-stanzas", "songPhrases");
    await page.waitForTimeout(13000);
    const pic = await highwayInView(page);
    expect(pic.found && pic.bottom <= pic.vh && pic.lit > 20).toBe(true);
    const v = await viz(page);
    expect(v.phrases).toBeGreaterThanOrEqual(2);
    expect(v.phrasesOk, "the 6,5 s phrase reaches the 6 s goal").toBeGreaterThanOrEqual(1);
    expect(v.phrasesOk, "the 4,2 s one does not").toBeLessThan(v.phrases);
    // A pause, not a breath: the mic hears unbroken sound
    await expect(page.locator("#mode-hud .mode-title")).toContainText("sin pausa");
    await page.locator("#mode-hud [data-feel]").click();
    await stop(page);
    expect((await viz(page)).review).toBe(true);
    expect(Number(await metric(page, "repsFeel"))).toBe(1);
  });

  test("phone: after Stop the review card sits above the lanes, not on them", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    for (const [id, voice] of [
      ["s1-vocal-fry", "fryClear"],
      ["s9-pitch-match", "matchListen"]
    ]) {
      await openAndStart(page, id, voice);
      await page.waitForTimeout(6000);
      await stop(page);
      const r = await reviewLayout(page);
      expect(r.mode, id).toBe("top");
      expect(r.lanesTop, `${id}: the lanes start under the card`).toBeGreaterThanOrEqual(r.bottom);
      // Inside what the highway allows the header rows (45 % of the plot)
      expect(r.bottom, id).toBeLessThanOrEqual(r.gh * 0.45);
    }
  });

  test("reduced motion: the siren picture pages instead of scrolling", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await boot(page);
    await openAndStart(page, "s5-sirens", "sirenBreak");
    await page.waitForTimeout(3000);
    // What was sung stays where it was drawn: the left part of the page does not move
    const grab = () =>
      page.evaluate(() => {
        const c = document.querySelector("#pitch-canvas");
        const g = c.getContext("2d");
        const x = Math.floor(c.width * 0.03);
        const y = Math.floor(c.height * 0.3);
        const d = g.getImageData(x, y, Math.floor(c.width * 0.14), Math.floor(c.height * 0.45)).data;
        const out = [];
        for (let i = 0; i < d.length; i += 4) out.push(d[i] + d[i + 1] + d[i + 2]);
        return out;
      });
    // Growing the range rescales everything once; compare two grabs taken
    // while the scale holds
    const range = () => page.evaluate(() => JSON.stringify(window.VTGetPitchViz().display.range));
    let ratio = 1;
    for (let k = 0; k < 4 && ratio >= 0.02; k++) {
      const r0 = await range();
      const a = await grab();
      await page.waitForTimeout(500);
      const b = await grab();
      if ((await range()) !== r0) continue;
      let diff = 0;
      for (let i = 0; i < a.length; i++) if (Math.abs(a[i] - b[i]) > 30) diff++;
      ratio = diff / a.length;
    }
    expect(ratio).toBeLessThan(0.02);
    expect(await page.evaluate(() => window.VTGetPitchViz()._pageStart != null)).toBe(true);
    await stop(page);
  });

  test("English labels on the pitch panels and pictures", async ({ page }) => {
    await boot(page, "en");
    const cases = [
      ["s5-sirens", /Siren · your range/, null],
      ["s1-vocal-fry", /Fry → clear \/A\/ hold/, null],
      ["s10-five-note", /pitch-gated/, /Step \d+\/9 · sing/],
      ["s7-humming", /Humming · 5 soft targets/, /Hum [A-G]/],
      ["s9-pitch-match", /Pitch match · listen, then sing/, null],
      ["s2-solfege-chords", /Chord \/ solfège/, /Sing|Wait for the piano|chord tone|✓/],
      ["s3-song-stanzas", /Song phrases/, /Phrase|Sing the first phrase|Breathe/]
    ];
    for (const [id, title, head] of cases) {
      await openAndStart(page, id, "follow");
      await expect(page.locator("#mode-hud .mode-panel")).toContainText(title);
      if (head) {
        await page.waitForTimeout(700);
        expect((await viz(page)).head).toMatch(head);
      }
      await stop(page);
    }
  });
});
