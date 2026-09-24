/**
 * Resonance pictures (js/scenes/resonance.js): five vowels (s20), the zone
 * lanes (s21–s25) and the placement A/B takes (s26). Live runs use the
 * synthetic voices in qa/voices/resonance.js; the measured details are
 * checked by feeding frames to the modes directly, so they do not depend on
 * how busy the machine is.
 */
const { test, expect } = require("@playwright/test");
const { useVoice, playVoice, stopVoice } = require("./helpers/voice");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const IDS = [
  "s20-five-vowels",
  "s21-chest-resonance",
  "s22-mid-voice-hola",
  "s23-mask-ya",
  "s24-nana-high",
  "s25-zone-tour",
  "s26-placement-compare"
];

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
  await page.waitForFunction(() => !!window.VTApp?.openExercise && !!window.VTViz?.scenes?.resonanceKit);
}

async function open(page, id) {
  await page.evaluate((x) => window.VTApp.openExercise(x), id);
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
}

async function openAndStart(page, id, voice) {
  await open(page, id);
  await page.locator("#btn-practice-start").click();
  await page.waitForTimeout(250);
  if (voice) await playVoice(page, voice);
}

/** The picture's canvas, drawn (not blank) and inside the first screen. */
async function pictureInView(page) {
  return page.evaluate(() => {
    const c = document.querySelector("#mode-focus .vz-canvas, #mode-hud .vz-canvas");
    if (!c) return { found: false };
    const r = c.getBoundingClientRect();
    const g = c.getContext("2d");
    const px = g.getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < px.length; i += 4 * 97) if (px[i] + px[i + 1] + px[i + 2] > 120) lit++;
    return { found: true, top: r.top, bottom: r.bottom, h: r.height, w: r.width, vh: innerHeight, vw: innerWidth, lit };
  });
}

const modeState = (page) => page.evaluate(() => window.VTApp.getState().modeInstance?.state || null);

test.describe("resonance pictures", () => {
  test("five vowels: a page per round, stamps against the note and the round, an approximate vowel map", async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page);
    await open(page, "s20-five-vowels");
    const evenBefore = await page.locator('#metrics-form [name="evenVowels"]').inputValue().catch(() => null);
    await page.locator("#btn-practice-start").click();
    await page.waitForTimeout(250);
    await playVoice(page, "vowels");
    const pic = await pictureInView(page);
    expect(pic.found, "the picture is in the panel").toBe(true);
    expect(pic.bottom).toBeLessThanOrEqual(pic.vh);
    // A full round: I E A O U, 4 s each on the mode's own clock
    await page.waitForFunction(() => (window.VTApp.getState().modeInstance?.state?.sung || 0) >= 1, null, { timeout: 70_000 });
    const st = await modeState(page);
    const cells = st.pages[0].cells;
    const by = Object.fromEntries(st.vowels.map((v, i) => [v, cells[i]]));
    // The voice sings U ~35 cents flat and A ~4 dB louder than the rest
    expect(by.U.cents, "U sat flat").toBeLessThan(-15);
    expect(by.U.cents).toBeGreaterThan(-60);
    expect(Math.abs(by.I.cents), "I on the note").toBeLessThan(20);
    const dbs = cells.map((c) => c.db);
    const mean = dbs.reduce((a, b) => a + b, 0) / dbs.length;
    expect(by.A.db - mean, "A louder than the round").toBeGreaterThan(2);
    // Vowel shapes, approximately: I front and closed, A open, U back
    expect(by.I.f2 - by.U.f2, "I is further front than U").toBeGreaterThan(600);
    expect(by.A.f1 - by.I.f1, "A is more open than I").toBeGreaterThan(200);
    const drawn = await pictureInView(page);
    expect(drawn.lit, "the page is drawn").toBeGreaterThan(40);
    await stopVoice(page);
    await page.locator("#btn-practice-stop").click();
    await expect(page.locator("#mode-focus .mode-panel")).toHaveClass(/is-replay/);
    expect((await modeState(page)).review).toBe(true);
    // Only the round count is measured; evenness and space stay the learner's
    const rounds = Number(await page.locator('#metrics-form [name="rounds"]').inputValue());
    expect(rounds).toBeGreaterThanOrEqual(1);
    if (evenBefore != null) expect(await page.locator('#metrics-form [name="evenVowels"]').inputValue()).toBe(evenBefore);
  });

  test("zone lane: targets are held by pitch, the queue shows what comes next", async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page);
    await openAndStart(page, "s21-chest-resonance", "zones");
    await page.waitForFunction(() => (window.VTApp.getState().modeInstance?.state?.held || 0) >= 3, null, { timeout: 40_000 });
    const st = await modeState(page);
    expect(st.focus).toBe("body");
    expect(st.queue.length, "three targets wait ahead").toBe(3);
    expect(st.lvl.rel, "level is read against your own average").not.toBeNull();
    expect(st.clar.now, "tone clarity is read").toBeGreaterThan(0.5);
    const pic = await pictureInView(page);
    expect(pic.found && pic.bottom <= pic.vh).toBe(true);
    expect(pic.lit).toBeGreaterThan(40);
    await stopVoice(page);
    await page.locator("#btn-practice-stop").click();
    await expect(page.locator("#mode-focus .mode-panel")).toHaveClass(/is-replay/);
    expect(Number(await page.locator('#metrics-form [name="zoneTargets"]').inputValue())).toBeGreaterThanOrEqual(3);
  });

  test("zones score only what the microphone measures", async ({ page }) => {
    await boot(page);
    const out = await page.evaluate(() => {
      const byId = Object.fromEntries(VT_EXERCISES.singing.map((e) => [e.id, e]));
      const res = {};
      for (const id of ["s21-chest-resonance", "s22-mid-voice-hola", "s23-mask-ya", "s24-nana-high", "s25-zone-tour"]) {
        const m = window.VTPracticeModes.get("resonanceZone");
        const host = document.createElement("div");
        document.body.appendChild(host);
        m.mount(host, byId[id].practice);
        m.onStart();
        for (let i = 0; i < 400; i++) m.onFrame({ dtMs: 16, rms: 0.05, sounding: true, rawFreq: m.state.wantFreq, inputGain: 1 });
        res[id] = Object.keys(m.onStop({}).patches || {}).sort();
        m.unmount();
        host.remove();
      }
      return res;
    });
    expect(out["s21-chest-resonance"]).toEqual(["zoneTargets"]);
    expect(out["s22-mid-voice-hola"]).toEqual(["steadiness", "zoneTargets"]);
    expect(out["s23-mask-ya"]).toEqual(["zoneTargets"]);
    expect(out["s24-nana-high"]).toEqual(["stability", "zoneTargets"]);
    expect(out["s25-zone-tour"]).toEqual(["zoneTargets"]);
  });

  test("steadiness is pitch wobble over the holds, not time in the zone", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      function run(wobbleCents) {
        const m = window.VTPracticeModes.get("resonanceZone");
        const host = document.createElement("div");
        document.body.appendChild(host);
        m.mount(host, { zones: [{ key: "mid", label: "Mid", labelEs: "Medios", notes: ["C3", "D3", "E3"] }], focus: "", stabilityMetric: "steadiness" });
        m.onStart();
        let t = 0;
        for (let i = 0; i < 500; i++) {
          t += 0.016;
          // A slow drift (1.5 Hz) is what 200 ms smoothing keeps; vibrato-rate wobble it averages out
          const c = wobbleCents * Math.sin(2 * Math.PI * 1.5 * t);
          m.onFrame({ dtMs: 16, rms: 0.05, sounding: true, rawFreq: m.state.wantFreq * Math.pow(2, c / 1200) });
        }
        const out = m.onStop({});
        m.unmount();
        host.remove();
        return out.patches.steadiness;
      }
      return { steady: run(0), wobbly: run(30) };
    });
    expect(r.steady).toBe(5);
    expect(r.wobbly).toBeLessThanOrEqual(3);
  });

  test("soft high notes: the starting volume, a louder phrase, cards per note", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const m = window.VTPracticeModes.get("resonanceZone");
      const host = document.createElement("div");
      document.body.appendChild(host);
      const ex = VT_EXERCISES.singing.find((e) => e.id === "s24-nana-high");
      m.mount(host, ex.practice);
      m.onStart();
      const f = (rms) => m.onFrame({ dtMs: 16, rms, sounding: true, rawFreq: m.state.wantFreq, inputGain: 1 });
      for (let i = 0; i < 200; i++) f(0.03); // soft: sets the start and holds notes
      const softCards = m.state.cards.length;
      for (let i = 0; i < 200; i++) f(0.12); // ~12 dB louder
      const over = m.state.soft.overMs;
      const out = m.onStop({});
      const cards = m.state.cards.map((c) => c.soft);
      m.unmount();
      host.remove();
      return { ref: m.state.soft.ref, softCards, over, cards, patches: out.patches, summary: out.summary };
    });
    expect(r.ref, "the starting volume is taken").not.toBeNull();
    expect(r.softCards).toBeGreaterThanOrEqual(1);
    expect(r.over, "louder than the start is noticed").toBeGreaterThan(600);
    expect(r.cards).toContain(true);
    expect(r.cards).toContain(false);
    expect(r.patches.stability, "stability comes from the soft holds only").toBe(5);
    expect(r.summary).toMatch(/notas suaves|notes soft/);
  });

  test("middle zone: spoken turns make the speaking band, sung turns are compared with it", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const m = window.VTPracticeModes.get("resonanceZone");
      const host = document.createElement("div");
      document.body.appendChild(host);
      const ex = VT_EXERCISES.singing.find((e) => e.id === "s22-mid-voice-hola");
      m.mount(host, ex.practice);
      m.onStart();
      const base = window.VT_NOTE_FREQ.C3;
      const quiet = (n) => {
        for (let i = 0; i < n; i++) m.onFrame({ dtMs: 16, rms: 0.001, sounding: false, rawFreq: null });
      };
      for (let k = 0; k < 3; k++) {
        // "ho-la, ho-la": syllables moving 3–4 semitones, a short pause
        for (let i = 0; i < 50; i++) {
          const st = [0, 3, -1, 2][Math.floor(i / 12) % 4];
          m.onFrame({ dtMs: 16, rms: 0.04, sounding: true, rawFreq: base * Math.pow(2, st / 12) });
        }
        quiet(25);
        // then the note, held and 3 dB louder
        for (let i = 0; i < 70; i++) m.onFrame({ dtMs: 16, rms: 0.056, sounding: true, rawFreq: m.state.wantFreq });
        quiet(25);
      }
      const sp = m.state.sp;
      const out = m.onStop({});
      m.unmount();
      host.remove();
      return { kinds: sp.turns.map((t) => t.kind), band: sp.band, pairs: sp.pairs, summary: out.summary };
    });
    expect(r.kinds).toContain("spoken");
    expect(r.kinds).toContain("sung");
    expect(r.band, "the speaking band is measured").not.toBeNull();
    expect(r.pairs.length).toBeGreaterThanOrEqual(1);
    expect(r.pairs[r.pairs.length - 1].dDb).toBeGreaterThan(1.5);
    expect(r.summary).toMatch(/cantado frente a hablado|sung vs spoken/);
  });

  test("mask 'YA': brightness against your normal 'YA', and louder is not brighter", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const m = window.VTPracticeModes.get("resonanceZone");
      const host = document.createElement("div");
      document.body.appendChild(host);
      const ex = VT_EXERCISES.singing.find((e) => e.id === "s23-mask-ya");
      m.mount(host, ex.practice);
      m.onStart();
      const sr = 48000;
      const f0 = m.state.wantFreq;
      // A sawtooth through a two-pole low-pass: a higher corner is a brighter tone
      function frameBuf(fc, gain, phase0) {
        const n = 2048;
        const b = new Float32Array(n);
        const a = Math.exp((-2 * Math.PI * fc) / sr);
        let p1 = 0;
        let p2 = 0;
        let ph = phase0;
        for (let i = 0; i < n + 1024; i++) {
          ph = (ph + f0 / sr) % 1;
          p1 = (1 - a) * (2 * ph - 1) + a * p1;
          p2 = (1 - a) * p1 + a * p2;
          if (i >= 1024) b[i - 1024] = gain * p2;
        }
        let s = 0;
        for (const v of b) s += v * v;
        return { buf: b, rms: Math.sqrt(s / n) };
      }
      // Two semitones off the target, so no note is credited and the phases
      // move only on time and on the button
      const f = f0 * Math.pow(2, 2 / 12);
      const feed = (fc, gain, frames) => {
        for (let i = 0; i < frames; i++) {
          const { buf, rms } = frameBuf(fc, gain, (i * 0.37) % 1);
          m.onFrame({ dtMs: 16, rms, sounding: true, rawFreq: f, buf, sampleRate: sr, inputGain: 1 });
        }
      };
      feed(1500, 0.3, 200); // normal "YA": the reference; this phase moves on by itself
      const p1 = m.state.br.p;
      feed(1500, 0.9, 90); // exaggerated as louder, not brighter
      const louder = m.state.br.louder;
      host.querySelector("[data-next]").click(); // "Next phase"
      const p2 = m.state.br.p;
      feed(5000, 0.3, 200); // then really brighter
      const med = m.state.br.med;
      m.unmount();
      host.remove();
      return { p1, p2, louder, med };
    });
    expect(r.p1, "the normal phase moves on after 3 s of sound").toBe(1);
    expect(r.louder, "louder without brighter is named").toBe(true);
    expect(r.med[1].x, "the louder phase sits to the right").toBeGreaterThan(6);
    expect(Math.abs(r.med[1].y), "and not higher").toBeLessThan(1);
    expect(r.p2, "the button moves to the next phase").toBe(2);
    expect(r.med[2].y - r.med[0].y, "a brighter tone reads brighter (aprox.)").toBeGreaterThan(2);
  });

  test("zone tour: each seam reports the level change on entering", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const m = window.VTPracticeModes.get("resonanceZone");
      const host = document.createElement("div");
      document.body.appendChild(host);
      m.mount(host, {
        focus: "seams",
        zones: [
          { key: "low", label: "Low", labelEs: "Graves", sec: 5, notes: ["C3", "B2"] },
          { key: "mid", label: "Middle", labelEs: "Medios", sec: 5, notes: ["C3", "D3"] }
        ]
      });
      m.onStart();
      // 5 s at one level, then 4 s about 6 dB louder after the seam
      for (let i = 0; i < 312; i++) m.onFrame({ dtMs: 16, rms: 0.05, sounding: true, rawFreq: m.state.wantFreq, inputGain: 1 });
      for (let i = 0; i < 250; i++) m.onFrame({ dtMs: 16, rms: 0.1, sounding: true, rawFreq: m.state.wantFreq, inputGain: 1 });
      const seams = m.state.seams.map((s) => ({ from: s.from, to: s.to, d: s.d }));
      const out = m.onStop({});
      m.unmount();
      host.remove();
      return { seams, summary: out.summary, patches: out.patches };
    });
    expect(r.seams.length).toBe(1);
    expect(r.seams[0].d).toBeGreaterThan(4);
    expect(r.seams[0].d).toBeLessThan(8);
    expect(r.summary).toMatch(/costura|seam/);
    expect(Object.keys(r.patches)).toEqual(["zoneTargets"]);
  });

  test("placement A/B: takes start and end by themselves, the facts, level-matched playback", async ({ page }) => {
    test.setTimeout(90_000);
    await boot(page);
    await openAndStart(page, "s26-placement-compare", "abTakes");
    await expect(page.locator("#mode-focus [data-take]")).toBeVisible();
    // Two phrases of ~4.3 s with 2.4 s between them
    await page.waitForFunction(() => window.VTApp.getState().modeInstance?.state?.stage === "listen", null, { timeout: 45_000 });
    const st = await modeState(page);
    expect(st.takes).toBe(2);
    expect(st.A.dur).toBeGreaterThan(3);
    expect(st.B.dur).toBeGreaterThan(3);
    expect(st.facts.keyOk, "same key").toBe(true);
    expect(st.facts.vol, "B was sung ~2 dB louder").toBeGreaterThan(0.5);
    expect(st.facts.vol).toBeLessThan(4.5);
    expect(st.facts.melOk).toBe(true);
    expect(st.facts.bright, "B brighter (aprox.)").toBeGreaterThan(0);
    await expect(page.locator("#mode-focus [data-take]")).toBeHidden();
    const playA = page.locator('#mode-focus [data-play="A"]');
    await expect(playA).toBeVisible();
    await expect(page.locator("#mode-focus [data-facts]")).toHaveText(/misma tonalidad/);
    const match = page.locator("#mode-focus [data-match]");
    await match.click();
    await expect(match).toHaveAttribute("aria-pressed", "true");
    await playA.click();
    expect((await modeState(page)).playing?.which).toBe("A");
    await expect(playA).toHaveText(/■ A/);
    await playA.click();
    expect((await modeState(page)).playing).toBeNull();
    const pic = await pictureInView(page);
    expect(pic.found && pic.bottom <= pic.vh).toBe(true);
    await stopVoice(page);
    await page.locator("#btn-practice-stop").click();
    await expect(page.locator("#mode-focus .mode-panel")).toHaveClass(/is-replay/);
    // After Stop the takes still play
    await expect(page.locator('#mode-focus [data-play="B"]')).toBeVisible();
    expect(Number(await page.locator('#metrics-form [name="takes"]').inputValue())).toBe(2);
  });

  test("English words on the resonance drills", async ({ page }) => {
    await boot(page, "en");
    await open(page, "s26-placement-compare");
    await expect(page.locator("#mode-focus [data-take]")).toHaveText(/Take done/);
    await open(page, "s21-chest-resonance");
    await expect(page.locator("#mode-focus .mode-title")).toHaveText(/Low notes with body/);
    await open(page, "s23-mask-ya");
    await expect(page.locator("#mode-focus [data-next]")).toHaveText(/Next phase/);
    const sum = await page.evaluate(() => {
      const m = window.VTPracticeModes.get("resonanceZone");
      const host = document.createElement("div");
      document.body.appendChild(host);
      m.mount(host, { zones: [{ key: "low", label: "Low", labelEs: "Graves", notes: ["C3"] }] });
      m.onStart();
      for (let i = 0; i < 120; i++) m.onFrame({ dtMs: 16, rms: 0.05, sounding: true, rawFreq: m.state.wantFreq });
      const s = m.onStop({}).summary;
      m.unmount();
      host.remove();
      return s;
    });
    expect(sum).toMatch(/targets · 100% in zone/);
  });

  test("reduced motion: the zone lane pages instead of scrolling, and draws without errors", async ({ page }) => {
    test.setTimeout(60_000);
    const errors = [];
    page.on("pageerror", (e) => errors.push(String(e.message || e)));
    // A painter that throws is caught by the surface and logged as "[viz]"
    page.on("console", (m) => {
      if (m.text().includes("[viz]")) errors.push("[viz] " + m.text());
    });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await boot(page);
    await openAndStart(page, "s22-mid-voice-hola", "zones");
    await page.waitForTimeout(3000);
    const pic = await pictureInView(page);
    expect(pic.found && pic.lit > 20).toBe(true);
    expect(await page.evaluate(() => window.VTViz.reducedMotion())).toBe(true);
    await stopVoice(page);
    await page.locator("#btn-practice-stop").click();
    await expect(page.locator("#mode-focus .mode-panel")).toHaveClass(/is-replay/);
    const viz = errors.filter((e) => /\[viz\]|resonance|practice-modes/i.test(e));
    expect(viz, viz.join("\n")).toEqual([]);
  });

  for (const vp of [
    { name: "phone", width: 390, height: 844 },
    { name: "landscape", width: 844, height: 390 }
  ]) {
    test(`every resonance picture is in the first screen (${vp.name})`, async ({ page }) => {
      test.setTimeout(120_000);
      await page.setViewportSize({ width: vp.width, height: vp.height });
      await boot(page);
      for (const id of IDS) {
        await open(page, id);
        // The start/stop rail can sit under the page header on a rotated phone;
        // what is checked here is the picture, so the buttons are pressed directly
        await page.evaluate(() => document.getElementById("btn-practice-start")?.click());
        await page.waitForTimeout(700);
        const pic = await pictureInView(page);
        expect(pic.found, `${id} draws a picture`).toBe(true);
        expect(pic.bottom, `${id} picture ends inside the screen`).toBeLessThanOrEqual(pic.vh + 1);
        expect(pic.top, `${id} picture starts inside the screen`).toBeGreaterThanOrEqual(0);
        expect(pic.w, `${id} picture fits the width`).toBeLessThanOrEqual(pic.vw);
        expect(pic.lit, `${id} picture is drawn`).toBeGreaterThan(10);
        await page.evaluate(() => document.getElementById("btn-practice-stop")?.click());
        await page.waitForTimeout(250);
      }
    });
  }
});
