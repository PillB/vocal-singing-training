/**
 * Pace and timing pictures (js/scenes/speech.js, part two): v1 diction rate
 * ladder, v11 filler rounds, v14 pace river, v8 metaphor topics, v6 turn
 * lanes, v3 bead pacer. Each is fed by a synthetic speaker from
 * qa/voices/speech-timing.js and checked for: the picture drawn in the first
 * screen, the one thing it measures, English labels, and a review after Stop
 * that patches only measured values.
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
  }, lang);
  await useVoice(page);
  await page.goto(BASE + "/?e2e", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
}

async function openEx(page, id) {
  await page.evaluate((x) => window.VTApp.openExercise(x), id);
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
}

async function start(page, voice) {
  await page.locator("#btn-practice-start").click();
  await page.waitForTimeout(250);
  if (voice) await playVoice(page, voice);
}

/** The mode's live state. */
async function modeState(page, fn) {
  return page.evaluate((src) => {
    const st = window.VTApp.getState().modeInstance?.state;
    // eslint-disable-next-line no-new-func
    return new Function("st", "return (" + src + ")(st)")(st);
  }, fn.toString());
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

async function expectPicture(page) {
  const pic = await pictureInView(page);
  expect(pic.found, "the picture is mounted").toBe(true);
  expect(pic.bottom, "the picture is in the first screen").toBeLessThanOrEqual(pic.vh);
  expect(pic.h).toBeGreaterThan(120);
  expect(pic.lit, "the picture is drawn").toBeGreaterThan(20);
}

/** Stop, and return what the mode handed back (patches + summary). */
async function stopAndResult(page) {
  await page.evaluate(() => {
    const inst = window.VTApp.getState().modeInstance;
    const orig = inst.onStop;
    inst.onStop = function (...a) {
      const r = orig.apply(this, a);
      window.__lastStop = r;
      return r;
    };
  });
  await stopVoice(page);
  await page.locator("#btn-practice-stop").click();
  await expect(page.locator("#mode-focus .mode-panel")).toHaveClass(/is-replay/);
  expect(await modeState(page, (st) => st.review)).toBe(true);
  return page.evaluate(() => window.__lastStop);
}

test.describe("speech timing pictures", () => {
  test("v1 rate ladder: a faster rung reads above the measured base, map after Stop", async ({ page }) => {
    await boot(page);
    await openEx(page, "v1-diction");
    await page.evaluate(() => {
      window.__VTRateStepSec = 8;
    });
    await start(page, "rateSteps");
    await page.waitForTimeout(3000);
    await expectPicture(page);
    // Rung 1 (3.6 syll/s) measures the base; the speaker speeds up every 8 s
    await page.waitForTimeout(5500);
    expect(await modeState(page, (st) => st.base), "base measured on rung 1").toBeGreaterThan(1.5);
    await page.locator("#mode-focus [data-next-rung]").click();
    await page.waitForTimeout(8000);
    await page.locator("#mode-focus [data-next-rung]").click();
    await page.waitForTimeout(300);
    const rel = await modeState(page, (st) => st.rungs.map((r) => r.rel));
    expect(rel[0], "rung 1 is the base").toBeGreaterThan(0.85);
    expect(rel[0]).toBeLessThan(1.15);
    expect(rel[1], "rung 2 reads faster than the base").toBeGreaterThan(rel[0] + 0.08);
    const res = await stopAndResult(page);
    expect(Object.keys(res.patches).filter((k) => k !== "duration"), "no self-rating is autofilled").toEqual([]);
    expect(res.summary).toMatch(/Escalera aprox\.: 100 → \d+ %/);
  });

  test("v11 filler rounds: a flat 0.9 s 'eee' is marked approx., taps count, rounds map after Stop", async ({ page }) => {
    await boot(page);
    await openEx(page, "v11-kill-fillers");
    await start(page, "fillerTalk");
    await page.waitForTimeout(2500);
    await expectPicture(page);
    await page.locator("#mode-focus [data-fill]").click();
    await expect(page.locator("#mode-focus [data-f]")).toHaveText("1");
    // The first 0.9 s hesitation comes after the first 2.8 s phrase
    await page.waitForTimeout(3500);
    expect(Number(await page.locator("#mode-focus [data-hes]").textContent()), "hesitation sound marked").toBeGreaterThanOrEqual(1);
    await page.locator("#mode-focus [data-next-round]").click();
    await page.locator("#mode-focus [data-rep]").click();
    await expect(page.locator("#mode-focus [data-r]")).toHaveText("1");
    const res = await stopAndResult(page);
    // Rounds under 20 s of talk are too short to report a filler count
    expect(res.patches).toEqual({});
    expect(res.summary).toMatch(/Rellenos notados por ronda: 1 → 0/);
    expect(res.summary).toMatch(/aprox\./);
  });

  test("v14 pace river: a slowed key point becomes an anchor, an unslowed one does not", async ({ page }) => {
    await boot(page);
    await openEx(page, "v14-pace-variation");
    await page.evaluate(() => {
      window.__VTSlowSpec = true;
      window.__VTSlowUntil = 0;
    });
    await start(page, "keyPoints");
    await page.waitForTimeout(3000);
    await expectPicture(page);
    await page.waitForTimeout(7500);
    expect(await modeState(page, (st) => st.base), "even take measured").toBeGreaterThan(2);
    await page.locator("#mode-focus [data-next-take]").click();
    await page.waitForTimeout(1500);
    await page.evaluate(() => {
      window.__VTSlowUntil = performance.now() + 3200;
    });
    await page.locator("#mode-focus [data-key]").click();
    await page.waitForTimeout(7000);
    await expect(page.locator("#mode-focus [data-k]")).toHaveText("1");
    // A tap with no slow-down and no pause stays a plain flag
    await page.locator("#mode-focus [data-key]").click();
    await page.waitForTimeout(7500);
    const flags = await modeState(page, (st) => st.takes[1].flags.map((f) => ({ state: f.state, rel: f.rel, pause: f.pause })));
    expect(flags.length).toBe(2);
    expect(flags[0].state).toBe("anchor");
    expect(flags[0].rel < 0.85 || flags[0].pause >= 0.7).toBe(true);
    expect(flags[1].state, "at base pace, no pause: not an anchor").toBe("flat");
    const res = await stopAndResult(page);
    expect(res.patches).toEqual({ keySlowdowns: 1 });
    expect(res.summary).toMatch(/Anclas por toma: 0 → 1/);
  });

  test("v8 metaphor topics: time to first word, a starred metaphor, next topic, ribbons after Stop", async ({ page }) => {
    await boot(page);
    await openEx(page, "v8-fluency-metaphors");
    await start(page, "topicTalk");
    await page.waitForTimeout(4500);
    await expectPicture(page);
    const fw = await modeState(page, (st) => st.topics[0].firstWord);
    // The speaker starts 2.4 s after the voice begins
    expect(fw).toBeGreaterThan(1.8);
    expect(fw).toBeLessThan(3.6);
    await page.locator("#mode-focus [data-log]").click();
    await expect(page.locator("#mode-focus [data-n]")).toHaveText("1");
    await page.locator("#mode-focus [data-next-topic]").click();
    await expect(page.locator("#mode-focus [data-phase]")).toContainText("Tema 2");
    await page.waitForTimeout(1500);
    const res = await stopAndResult(page);
    expect(res.patches, "metaphors spoken are the learner's taps; vividness stays theirs").toEqual({ metaphorCount: 1 });
    expect(res.summary).toMatch(/Metáforas por tema: 1 → 0/);
  });

  test("v6 turn lanes: their turn left quiet reads quiet, talking through it is tallied", async ({ page }) => {
    await boot(page);
    await openEx(page, "v6-connect");
    await start(page, "turnTaking");
    await page.waitForTimeout(5000);
    await expectPicture(page);
    expect(await modeState(page, (st) => st.slot && st.slot.kind)).toBe("you");
    await page.waitForTimeout(13000);
    const mid = await modeState(page, (st) => ({ kind: st.slot.kind, over: st.scenarios[0].overlap, talk: st.scenarios[0].talk }));
    expect(mid.kind).toBe("them");
    expect(mid.over, "quiet in their turn").toBeLessThan(0.5);
    expect(mid.talk).toBeGreaterThan(4);
    await expect(page.locator("#mode-focus [data-slot]")).toContainText("Su turno");
    const res = await stopAndResult(page);
    expect(res.patches, "presence is self-rated").toEqual({});
    expect(res.summary).toMatch(/Hablaste \d+ %/);
  });

  test("v6 turn lanes: speaking through their turn counts seconds in their turn", async ({ page }) => {
    await boot(page);
    await openEx(page, "v6-connect");
    await start(page, "speech");
    await page.waitForTimeout(15000);
    const over = await modeState(page, (st) => st.scenarios[0].overlap);
    expect(over, "seconds in their turn").toBeGreaterThan(1.5);
    expect(Number((await page.locator("#mode-focus [data-over]").textContent()).replace(/\D/g, ""))).toBeGreaterThan(0);
  });

  test("v3 bead pacer: numbers said aloud fill beads, rushing is marked, ±1 corrects", async ({ page }) => {
    await boot(page);
    await openEx(page, "v3-soft-palate");
    await expect(page.locator("#mode-focus [data-plus]")).toBeVisible();
    await start(page, "countNumbers");
    await page.waitForTimeout(4000);
    await expectPicture(page);
    await page.waitForTimeout(4200);
    // Eight numbers at ~1.2 s, starting at 0.3 s
    const n1 = Number(await page.locator("#mode-focus [data-c]").textContent());
    expect(n1).toBeGreaterThanOrEqual(5);
    expect(n1).toBeLessThanOrEqual(9);
    // Then six rushed at ~0.55 s
    await page.waitForTimeout(5500);
    const early = await modeState(page, (st) => st.beads.filter((b) => b.early).length);
    expect(early, "rushed numbers are marked").toBeGreaterThanOrEqual(2);
    const before = Number(await page.locator("#mode-focus [data-c]").textContent());
    await page.locator("#mode-focus [data-minus]").click();
    const after = Number(await page.locator("#mode-focus [data-c]").textContent());
    expect(after).toBeLessThanOrEqual(before);
    const res = await stopAndResult(page);
    expect(Object.keys(res.patches), "openness and comfort stay self-rated").toEqual(["countReached"]);
    expect(res.summary).toMatch(/Llegaste a \d+ · ~\d,\d s por número/);
  });

  test("English labels on the timing drills", async ({ page }) => {
    await boot(page, "en");
    const cases = [
      ["v1-diction", "[data-next-rung]", /Next rung/],
      ["v11-kill-fillers", "[data-fill]", /Caught a filler/],
      ["v14-pace-variation", "[data-key]", /Key point/],
      ["v8-fluency-metaphors", "[data-log]", /I spoke a metaphor/],
      ["v6-connect", "[data-fact]", /I learned a real fact/],
      ["v3-soft-palate", "[data-plus]", /\+1/]
    ];
    for (const [id, sel, re] of cases) {
      await openEx(page, id);
      await expect(page.locator(`#mode-focus ${sel}`)).toHaveText(re);
      const words = await page.locator("#mode-focus .mode-panel").innerText();
      expect(words, `${id}: no Spanish in the English panel`).not.toMatch(/\b(Siguiente|Ronda|Toma|Tema|Situación|Llegaste|Dije)\b/);
    }
    await openEx(page, "v8-fluency-metaphors");
    await expect(page.locator("#mode-focus .mode-title")).toContainText("Metaphor");
  });

  test("words are never condensed, and the reviews say what their numbers mean", async ({ page }) => {
    test.setTimeout(120000);
    await boot(page);
    // Each picture drawn from its live model into a phone-size canvas, a
    // rotated-phone one and a short desktop one; every fillText is recorded
    const cases = [
      // v1 needs ~6 s of reading to measure its base
      ["v1-diction", "rateLadder", "rateSteps", 8500],
      ["v10-power-pause", "pause", "speech", 3500],
      ["v11-kill-fillers", "fillerRounds", "fillerTalk"],
      ["v14-pace-variation", "paceRiver", "keyPoints", 4000],
      ["v8-fluency-metaphors", "topicRibbon", "topicTalk"],
      ["v6-connect", "turns", "turnTaking"],
      ["v3-soft-palate", "beads", "countNumbers"]
    ];
    const draw = (scene, sizes) =>
      page.evaluate(
        ([scene, sizes]) => {
          const st = window.VTApp.getState().modeInstance.state;
          const out = [];
          sizes.forEach(([w, h]) => {
            const c = document.createElement("canvas");
            c.width = w;
            c.height = h;
            const ctx = c.getContext("2d");
            const fill = ctx.fillText.bind(ctx);
            ctx.fillText = (t, x, y, mw) => {
              const s = String(t);
              const px = Number((/(\d+(?:\.\d+)?)px/.exec(ctx.font) || [])[1] || 0);
              out.push({ size: `${w}x${h}`, t: s, px, mw: mw == null ? null : mw, tw: ctx.measureText(s).width });
              return mw == null ? fill(t, x, y) : fill(t, x, y, mw);
            };
            window.VTViz.scenes[scene](ctx, w, h, st);
          });
          return out;
        },
        [scene, sizes]
      );
    const sizes = [
      [294, 340],
      [294, 180],
      [480, 192],
      [1004, 120]
    ];
    const texts = {};
    for (const [id, scene, voice, ms] of cases) {
      // A fresh page per drill: the synthetic voice plays once per page
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !!window.VTApp?.openExercise);
      await openEx(page, id);
      await start(page, voice);
      await page.waitForTimeout(ms || 3200);
      const live = await draw(scene, sizes);
      await stopVoice(page);
      await page.locator("#btn-practice-stop").click();
      await expect(page.locator("#mode-focus .mode-panel")).toHaveClass(/is-replay/);
      const review = await draw(scene, sizes);
      for (const c of [...live, ...review]) {
        if (!c.t.trim() || c.t === "»") continue;
        expect(c.mw == null || c.tw <= c.mw + 0.5, `${id} ${c.size}: "${c.t}" condensed (${c.tw.toFixed(0)} > ${c.mw})`).toBe(true);
        expect(c.px, `${id} ${c.size}: "${c.t}" at ${c.px}px`).toBeGreaterThanOrEqual(10);
      }
      texts[id] = review.map((c) => c.t).join(" | ");
    }
    // v1: 100 % is named as the base, not left bare
    expect(texts["v1-diction"]).toMatch(/tu base = 100 %/);
    expect(texts["v1-diction"]).not.toMatch(/Tu escalera/);
    // v10: plain words for the typical pause, no "mediana"
    expect(texts["v10-power-pause"]).not.toMatch(/mediana/);
    expect(texts["v10-power-pause"]).toMatch(/pausas? de poder/);
    // v14: what an anchor is, in words
    expect(texts["v14-pace-variation"]).toMatch(/Ancla = /);
  });

  test("the pictures fit a phone held both ways", async ({ page }) => {
    await boot(page);
    for (const vp of [
      { width: 390, height: 844 },
      { width: 844, height: 390 }
    ]) {
      await page.setViewportSize(vp);
      for (const id of ["v1-diction", "v11-kill-fillers", "v14-pace-variation", "v8-fluency-metaphors", "v6-connect", "v3-soft-palate"]) {
        await openEx(page, id);
        await page.locator("#btn-practice-start").click();
        await page.waitForTimeout(600);
        const pic = await pictureInView(page);
        expect(pic.found, `${id} ${vp.width}`).toBe(true);
        expect(pic.bottom, `${id} ${vp.width}: in the first screen`).toBeLessThanOrEqual(vp.height + 1);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        expect(overflow, `${id} ${vp.width}: no sideways scroll`).toBeLessThanOrEqual(1);
        await page.locator("#btn-practice-stop").click();
        await page.waitForTimeout(200);
      }
    }
  });
});
