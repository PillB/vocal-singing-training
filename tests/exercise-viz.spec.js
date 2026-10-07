/**
 * Exercise pictures (docs/39-EXERCISE-VISUALS.md): each exercise draws the
 * picture of its own skill, fed by a synthetic voice, in the first screen.
 * Pattern for the per-group specs (tests/exercise-viz-*.spec.js).
 */
const { test, expect } = require("@playwright/test");
const { useVoice, playVoice, fanInRoom } = require("./helpers/voice");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page, lang = "es", init) {
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
  // An init script, or [script, its argument]
  if (init) await page.addInitScript(...[].concat(init));
  await page.goto(BASE + "/?e2e", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
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

test.describe("exercise pictures", () => {
  test("costal breath paces without asking for the mic", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => {
      window.__gumCalls = 0;
      const orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
      navigator.mediaDevices.getUserMedia = (c) => {
        window.__gumCalls++;
        return orig(c);
      };
    });
    await openAndStart(page, "s18-costal-breath");
    await page.waitForTimeout(1500);
    const pic = await pictureInView(page);
    expect(pic.found).toBe(true);
    expect(pic.bottom).toBeLessThanOrEqual(pic.vh);
    expect(pic.h).toBeGreaterThan(150);
    expect(pic.lit, "the wave is drawn").toBeGreaterThan(20);
    expect(await page.evaluate(() => window.__gumCalls)).toBe(0);
    const stage = await page.locator("#mode-focus [data-stage]").textContent();
    expect(stage).toMatch(/Inhala|Suspende|Exhala/);
  });

  test("power pause counts a 1.2 s pause and compares takes after Stop", async ({ page }) => {
    await boot(page);
    await openAndStart(page, "v10-power-pause", "speech");
    // The synthetic speaker talks 3 s, pauses 1.2 s
    await page.waitForTimeout(9500);
    const n = Number(await page.locator("#mode-focus [data-p]").textContent());
    expect(n, "1.2 s pauses count (the old grace window hid them)").toBeGreaterThanOrEqual(1);
    const pic = await pictureInView(page);
    expect(pic.found && pic.bottom <= pic.vh).toBe(true);
    await page.locator("#mode-focus [data-next-take]").click();
    await page.waitForTimeout(300);
    await page.locator("#btn-practice-stop").click();
    await expect(page.locator("#mode-focus .mode-panel")).toHaveClass(/is-replay/);
    const toast = await page.evaluate(() => window.VTApp.getState().modeInstance?.state?.review);
    expect(toast).toBe(true);
  });

  test("power pause counts pauses with a fan running", async ({ page }) => {
    await boot(page, "es", fanInRoom);
    await openAndStart(page, "v10-power-pause", "speech");
    // The same speaker (3 s talk, 1.2 s pause) over the fan: the fan is
    // learned as the room in the first pause instead of reading as speech
    await page.waitForTimeout(9500);
    const n = Number(await page.locator("#mode-focus [data-p]").textContent());
    const vad = await page.evaluate(() => {
      const v = window.VTApp.getState().modeInstance?.state?.vad;
      return { floor: v?.floorDb, segs: (v?.segments || []).map((g) => `${g.kind[0]}${g.start.toFixed(2)}`).join(" ") };
    });
    expect(vad.floor, "the fan is the room").toBeGreaterThan(-45);
    // Both pauses, the first one too (it went uncounted while the fan was
    // still being learned)
    expect(n, vad.segs).toBe(2);
    expect(vad.segs, "the first pause starts when the voice stops").toMatch(/^s0\.\d\d p3\.[3-6]/);
  });

  test("power pause counts pauses with a fan's low rumble on a 96 kHz interface", async ({ page }) => {
    // An audio interface can run the page at 96 kHz, where the engine's frame
    // of 2048 samples lasted 21 ms: a fan's rumble wobbled 5 dB from frame to
    // frame and its noise read as periodic, so it was often never learned,
    // the take read as one stretch of speech and no pause counted
    await page.addInitScript((sr) => {
      const AC = window.AudioContext;
      window.AudioContext = window.webkitAudioContext = class extends AC {
        constructor(o) {
          super(Object.assign({}, o, { sampleRate: sr }));
        }
      };
    }, 96000);
    await boot(page, "es", [fanInRoom, { gain: 0.009, hz: 250, order: 2 }]);
    await openAndStart(page, "v10-power-pause");
    const frame = await page.evaluate(() => {
      const e = window.VTApp.getState().practice;
      return { sr: e.audioCtx.sampleRate, ms: (e.analyser.fftSize / e.audioCtx.sampleRate) * 1000 };
    });
    expect(frame.sr).toBe(96000);
    expect(frame.ms, "the frame lasts as long as at 48 kHz").toBeCloseTo(42.7, 0);
    // 2 s of the fan alone, then the speaker (3 s talk, 1.2 s pause)
    await page.waitForTimeout(1750);
    await playVoice(page, "speech");
    await page.waitForTimeout(10000);
    const n = Number(await page.locator("#mode-focus [data-p]").textContent());
    const vad = await page.evaluate(() => {
      const v = window.VTApp.getState().modeInstance.state.vad;
      return { floor: v.floorDb, segs: v.segments.map((g) => `${g.kind[0]}${g.start.toFixed(2)}`).join(" ") };
    });
    expect(vad.floor, "the fan is the room").toBeGreaterThan(-45);
    expect(vad.segs, "nothing said before the voice").toMatch(/^s2\./);
    expect(n, vad.segs).toBe(2);
  });

  test("power pause counts pauses over a fan's low rumble at 100 Hz", async ({ page }) => {
    // Noise under 100 Hz wobbles ~1.5 dB from frame to frame and 6 dB over
    // 0.6 s: it was often never learned as the room, the take read as one
    // stretch of speech and the pauses went uncounted. Often, not always: the
    // real rumble sometimes holds within 4.5 dB for 0.6 s, so the old test
    // failed this case only about half the time, from Start or after any
    // lead-in. The deterministic guards are in tests/vad-floor.spec.js: the
    // wobbling rumble ("a fan's low rumble that wobbles…") and how high this
    // same noise sits ("how high a sound sits…"). Here, the real engine.
    await boot(page, "es", [fanInRoom, { gain: 0.009, hz: 100, order: 2 }]);
    await openAndStart(page, "v10-power-pause");
    // 2 s of the fan alone, then the speaker (3 s talk, 1.2 s pause)
    await page.waitForTimeout(1750);
    await playVoice(page, "speech");
    await page.waitForTimeout(10000);
    const n = Number(await page.locator("#mode-focus [data-p]").textContent());
    const vad = await page.evaluate(() => {
      const v = window.VTApp.getState().modeInstance.state.vad;
      return { floor: v.floorDb, segs: v.segments.map((g) => `${g.kind[0]}${g.start.toFixed(2)}`).join(" ") };
    });
    expect(vad.floor, `the fan is the room · ${vad.segs}`).toBeGreaterThan(-45);
    expect(vad.segs, "nothing said before the voice").toMatch(/^s2\./);
    expect(n, vad.segs).toBe(2);
  });

  test("power pause counts pauses over a fan's low rumble with the mic's own hiss under it", async ({ page }) => {
    // A real mic adds its own hiss: here 18 dB under a 100 Hz rumble (−58
    // and −76 dBFS before the gain). The weak hiss still made the rumble
    // read as sitting high, so it got only the strict 4.5 dB test, which a
    // rumble that wobbles 6 dB rarely passes: the floor stayed at −70, the
    // take read as one stretch of speech and no pause counted (two runs in
    // three). The noise is seeded, one the old code failed on; the sim's
    // "rumble with the quiet room's hiss" case in tests/vad-floor.spec.js
    // fails there on 19 of its 32 takes.
    const raw = (db) => Math.pow(10, db / 20) * Math.sqrt(3);
    await boot(page, "es", [fanInRoom, { gain: raw(-58), hz: 100, order: 2, hiss: raw(-76), seed: 15838 }]);
    await openAndStart(page, "v10-power-pause");
    // 2 s of the room alone, then the speaker (3 s talk, 1.2 s pause)
    await page.waitForTimeout(1750);
    await playVoice(page, "speech");
    await page.waitForTimeout(10000);
    const n = Number(await page.locator("#mode-focus [data-p]").textContent());
    const vad = await page.evaluate(() => {
      const v = window.VTApp.getState().modeInstance.state.vad;
      return { floor: v.floorDb, segs: v.segments.map((g) => `${g.kind[0]}${g.start.toFixed(2)}`).join(" ") };
    });
    expect(vad.floor, `the rumble is the room · ${vad.segs}`).toBeGreaterThan(-55);
    expect(n, vad.segs).toBe(2);
  });

  for (const [db, gain] of [
    [-30, 0.03],
    [-38, 0.012]
  ]) {
    test(`power pause keeps whispered talk at about ${db} dBFS`, async ({ page }) => {
      // A whisper has no period, so it reads as aperiodic as a fan, and its
      // syllables swing only 6 dB, about as little as a fan's low rumble
      // wobbles. After a 2 s lead-in in a quiet room it was learned as the
      // room: the floor jumped to it and the take was erased, no talk and no
      // pause counted.
      await boot(page, "es", [(w) => (window.__VTWhisper = w), { gain, swingDb: 6 }]);
      await openAndStart(page, "v10-power-pause");
      // 2 s of the quiet room, then whispered phrases (3 s, 1.2 s pauses)
      await page.waitForTimeout(1750);
      await playVoice(page, "speechWhisper");
      await page.waitForTimeout(10000);
      const n = Number(await page.locator("#mode-focus [data-p]").textContent());
      const vad = await page.evaluate(() => {
        const v = window.VTApp.getState().modeInstance.state.vad;
        return { floor: v.floorDb, talk: v.talkSec, segs: v.segments.map((g) => `${g.kind[0]}${g.start.toFixed(2)}`).join(" ") };
      });
      expect(vad.floor, `the quiet room is the floor · ${vad.segs}`).toBeLessThan(-60);
      expect(vad.talk, `the whisper is talk · ${vad.segs}`).toBeGreaterThan(6);
      expect(n, vad.segs).toBe(2);
    });
  }

  test("power pause keeps whispered phrases of 6 s", async ({ page }) => {
    // Deep into a long whispered phrase the floor used to need only 0.6 s
    // within 4.5 dB to take a new room: 3 s after it last heard the quiet
    // room, a stretch of the whisper passed, the floor jumped to it and the
    // phrase was taken back (or the next one read as a pause). It failed
    // one run in three; the sim's "whispered phrases of 6 s or more" case
    // in tests/vad-floor.spec.js is the deterministic guard.
    await boot(page, "es", [(w) => (window.__VTWhisper = w), { gain: 0.03, swingDb: 6, phraseMs: 6000 }]);
    await openAndStart(page, "v10-power-pause");
    // 1 s of the quiet room, then two 6 s whispered phrases with a 1.2 s pause
    await page.waitForTimeout(750);
    await playVoice(page, "speechWhisper");
    await page.waitForTimeout(13800);
    const n = Number(await page.locator("#mode-focus [data-p]").textContent());
    const vad = await page.evaluate(() => {
      const v = window.VTApp.getState().modeInstance.state.vad;
      return { floor: v.floorDb, talk: v.talkSec, segs: v.segments.map((g) => `${g.kind[0]}${g.start.toFixed(2)}`).join(" ") };
    });
    expect(vad.floor, `the quiet room is the floor · ${vad.segs}`).toBeLessThan(-60);
    expect(vad.talk, `both phrases are talk · ${vad.segs}`).toBeGreaterThan(11);
    expect(n, vad.segs).toBe(1);
  });

  for (const [label, voice, why] of [
    [
      "power pause keeps whispered talk through a narrowband headset",
      { gain: 0.03, swingDb: 6, lp: 3000, lpOrder: 4 },
      // Through a headset's steep 3 kHz low-pass a whisper sits lower (0.29
      // where the qa whisper reads 0.55), under the 0.3 that once marked a
      // rumble: its 6 dB syllables passed the rumble's loose test, the floor
      // jumped to the whisper after the lead-in and the take was erased
      "the whisper is talk"
    ],
    [
      "power pause hears a held 'sss' as a voice",
      { gain: 0.03, swingDb: 1, bands: [5000, 7000], q: 1.5 },
      // A held hiss (5–7 kHz, swinging 1 dB) has no period and holds
      // stiller than a fan: 0.6–1.2 s into it the floor took it for a fan
      // switched on, and each hiss was taken back as the room
      "the hisses are talk"
    ]
  ]) {
    test(label, async ({ page }) => {
      await boot(page, "es", [(w) => (window.__VTWhisper = w), voice]);
      await openAndStart(page, "v10-power-pause");
      // 2 s of the quiet room, then 3 s phrases (or holds) with 1.2 s pauses
      await page.waitForTimeout(1750);
      await playVoice(page, "speechWhisper");
      await page.waitForTimeout(10000);
      const n = Number(await page.locator("#mode-focus [data-p]").textContent());
      const vad = await page.evaluate(() => {
        const v = window.VTApp.getState().modeInstance.state.vad;
        return { floor: v.floorDb, talk: v.talkSec, segs: v.segments.map((g) => `${g.kind[0]}${g.start.toFixed(2)}`).join(" ") };
      });
      expect(vad.floor, `the quiet room is the floor · ${vad.segs}`).toBeLessThan(-60);
      expect(vad.talk, `${why} · ${vad.segs}`).toBeGreaterThan(6);
      expect(n, vad.segs).toBe(2);
    });
  }

  for (const [label, mix, pauses] of [
    // Talk, a 1.5 s "sss", talk, another, talk, then one real pause
    ["power pause hears a 'sss' said twice inside talk as talk", { plan: [["w", 3000], ["s", 1500], ["w", 2000], ["s", 1500], ["w", 3000], ["q", 1200], ["w", 2000]] }, 1],
    // The same hiss 5 dB softer, three times: the tail of the word before
    // it must not make it read as a rumble over a steady hiss
    [
      "power pause hears a soft 'sss' said three times inside talk as talk",
      { plan: [["w", 3000], ["s", 1200], ["w", 2000], ["s", 1200], ["w", 2000], ["s", 1200], ["w", 3000], ["q", 1200], ["w", 2000]], gain: 0.016 },
      1
    ],
    // sss-word, sss-word, a pause, the same again, a pause, a word
    [
      "power pause hears 'sss'-word-'sss'-word as talk",
      { plan: [["s", 1200], ["w", 1000], ["s", 1200], ["w", 1000], ["q", 1200], ["s", 1200], ["w", 1000], ["s", 1200], ["w", 1000], ["q", 1200], ["w", 1500]] },
      2
    ],
    // Whispered and voiced phrases in turn, no gap: a breathy whisper whose
    // syllables dip only 3 dB (the stock whisper's bands)
    [
      "power pause hears a whisper alternating with voice as talk",
      { plan: [["h", 2000], ["w", 2000], ["h", 2000], ["w", 2000], ["q", 1200], ["h", 2000], ["w", 2000]], bands: [900, 2400], q: 1.2, dip: 0.7 },
      1
    ],
    // The same whisper half as loud, about 20 dB under the voice: every
    // word stays over it, as it would over a fan
    [
      "power pause hears a soft whisper alternating with voice as talk",
      { plan: [["h", 2000], ["w", 2000], ["h", 2000], ["w", 2000], ["q", 1200], ["h", 2000], ["w", 2000]], bands: [900, 2400], q: 1.2, dip: 0.7, gain: 0.015 },
      1
    ],
    // An audible inhale between phrases, no silence around it: talk (see
    // VTFeatures.Vad), never the room
    [
      "power pause hears an audible inhale between phrases as talk",
      { plan: [["w", 3000], ["b", 600], ["w", 3000], ["b", 600], ["w", 3000], ["b", 600], ["w", 3000], ["q", 1200], ["w", 2000]] },
      1
    ]
  ]) {
    test(label, async ({ page }) => {
      // A still stretch that comes back at one level after a voice is a fan
      // switched on under the talk. A hiss, a whisper or a breath said
      // between words came back too: 0.4 s into the second one the floor
      // jumped to it, each was cut out of the talk and read as a pause the
      // learner never made (a hiss's of 1.2 s or more counted).
      await boot(page, "es", [(m) => (window.__VTMix = m), mix]);
      await openAndStart(page, "v10-power-pause");
      // 2 s of the quiet room, then the plan
      await page.waitForTimeout(1750);
      await playVoice(page, "speechMix");
      await page.waitForTimeout(mix.plan.reduce((t, [, ms]) => t + ms, 0) + 800);
      const n = Number(await page.locator("#mode-focus [data-p]").textContent());
      const vad = await page.evaluate(() => {
        const v = window.VTApp.getState().modeInstance.state.vad;
        return { floor: v.floorDb, talk: v.talkSec, segs: v.segments.map((g) => `${g.kind[0]}${g.start.toFixed(2)}`).join(" ") };
      });
      const said = mix.plan.filter(([k]) => k !== "q").reduce((t, [, ms]) => t + ms / 1000, 0);
      expect(vad.talk, `all of it is talk · ${vad.segs}`).toBeGreaterThan(said - 1);
      expect(vad.floor, `the quiet room is the floor · ${vad.segs}`).toBeLessThan(-60);
      expect(n, vad.segs).toBe(pauses);
    });
  }

  test("power pause counts no pause before the first word, with a fan running", async ({ page }) => {
    await boot(page, "es", fanInRoom);
    await openAndStart(page, "v10-power-pause");
    // The learner gathers their thoughts for 3 s over the fan, then talks
    // (3 s, a 1.2 s pause, 3 s): one pause, not a phantom one after the fan
    await page.waitForTimeout(3000);
    await playVoice(page, "speech");
    await page.waitForTimeout(6500);
    const n = Number(await page.locator("#mode-focus [data-p]").textContent());
    const segs = await page.evaluate(() =>
      window.VTApp.getState()
        .modeInstance.state.vad.segments.map((g) => `${g.kind[0]}${g.start.toFixed(2)}`)
        .join(" ")
    );
    expect(segs, "nothing said during the lead-in").toMatch(/^s[3-9]\./);
    expect(n, segs).toBe(1);
  });

  test("English labels on the pause drill", async ({ page }) => {
    await boot(page, "en");
    await openAndStart(page, "v10-power-pause");
    await expect(page.locator("#mode-focus [data-next-take]")).toHaveText(/Next take/);
  });
});
