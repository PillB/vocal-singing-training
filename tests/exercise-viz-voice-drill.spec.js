/**
 * Guided voice drills (Modes.voiceDrill in js/practice-modes.js, pictures in
 * js/scenes/voice-drill.js): v21 straw to speech, v22 voice recovery, v23
 * clear speech, v24 and s28 the vocal function exercises.
 *
 * What is checked, each against the behaviour that would be wrong:
 * - a sound counts once it passes the line; a blip, speech and the piano's
 *   own note never do;
 * - quiet minutes are counted only while it is quiet;
 * - B against A is said from speech rate and the share of the take in
 *   pauses, never from how long the take ran, and a clear take that is also
 *   louder is not told off;
 * - Stop fills in only what was heard, never a self-rating;
 * - a drill with piano notes is silent on Start and sounds each note when
 *   its step begins;
 * - the picture is in the first screen and nothing overflows, from a 320 px
 *   phone to a laptop.
 */
const { test, expect } = require("@playwright/test");
const { useVoice, playVoice, stopVoice } = require("./helpers/voice");
const { tapFloorLimit } = require("./helpers/tap-floor");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const IDS = ["v21-straw-to-speech", "v22-voice-recovery", "v23-clear-speech", "v24-vocal-function", "s28-vocal-function"];

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
  // Scripted takes for the logic tests: [seconds, rms, syllables per second] pieces fed as engine frames.
  await page.addInitScript(() => {
    window.__drill = {
      mount(profile) {
        const m = window.VTPracticeModes.get("voiceDrill");
        const host = document.createElement("div");
        document.body.appendChild(host);
        m.mount(host, profile);
        m.onStart();
        m._host = host;
        m._el = 0;
        return m;
      },
      feed(m, script, every = 16) {
        for (const [sec, level, syll] of script) {
          const n = Math.round((sec * 1000) / every);
          for (let i = 0; i < n; i++) {
            m._el += every;
            // Speech: the level swings 20 dB at the syllable rate
            const swing = syll ? 0.55 + 0.45 * Math.sin((2 * Math.PI * syll * m._el) / 1000) : 1;
            const rms = level * swing;
            m.onFrame({ dtMs: Math.min(50, every), elapsedMs: m._el, rms, voiced: rms > 0, sounding: rms > 0, rawFreq: rms > 0 ? 200 : 0 });
          }
        }
      },
      done(m) {
        const facts = m._pairFacts();
        const verdict = facts ? m._pairVerdict(facts).text : null;
        const res = m.onStop({});
        m._host.remove();
        return { holds: m.state.holds, longest: m.state.longest, quiet: m.state.quietSec, patches: res.patches, summary: res.summary, facts, verdict };
      }
    };
  });
  await page.goto(BASE + "/?e2e", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise && !!window.VTViz?.guided?.art?.holdBars);
}

/** Open an exercise with every step `sec` long (same order, same pictures). */
async function open(page, id, sec) {
  await page.evaluate(
    ({ id, sec }) => {
      const ex = [...window.VT_EXERCISES.vocal, ...window.VT_EXERCISES.singing].find((e) => e.id === id);
      if (sec) ex.practice.phases = ex.practice.phases.map((p, i) => Object.assign({}, p, { sec: Array.isArray(sec) ? sec[i] : sec }));
      window.VTApp.openExercise(id);
    },
    { id, sec }
  );
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  await page.waitForTimeout(400);
}

async function start(page, voice) {
  await expect(page.locator("#btn-practice-start")).toBeVisible();
  await page.evaluate(() => document.getElementById("btn-practice-start").click());
  await page.waitForTimeout(250);
  if (voice) await playVoice(page, voice);
}

const drill = (page, fn, arg) => page.evaluate(fn, arg);

test.describe("Voice drills: what the microphone counts", () => {
  test("a sound counts once it passes the line; a blip, speech and a busy device do not change that", async ({ page }) => {
    await boot(page);
    const out = await drill(page, () => {
      const D = window.__drill;
      const SOUND = { phases: [{ label: "S", labelEs: "S", sec: 600, sound: true }], minHoldMs: 1500, holdsMetric: "strawHolds", longestMetric: "longestHold" };
      const r = {};
      let m = D.mount(SOUND);
      D.feed(m, [[0.5, 0], [2, 0.1], [0.6, 0], [0.9, 0.1], [0.6, 0], [2.6, 0.1], [0.6, 0]]);
      r.two = D.done(m);
      m = D.mount(SOUND);
      D.feed(m, [[0.9, 0.1], [0.9, 0], [0.9, 0.1], [0.9, 0], [0.9, 0.1], [0.9, 0]]);
      r.blips = D.done(m);
      m = D.mount(SOUND);
      D.feed(m, [[0.5, 0], [2.6, 0.1], [0.9, 0], [2.6, 0.1], [0.9, 0]], 200);
      r.busy = D.done(m);
      const SPEECH = { phases: [{ label: "T", labelEs: "T", sec: 600, sound: true, speech: true }], holdsMetric: "strawHolds", longestMetric: "longestHold" };
      m = D.mount(SPEECH);
      r.speechArt = m.viz.artFor(m.viz.run.cur, {}).draw === window.VTViz.guided.art.speak;
      D.feed(m, [[0.5, 0], [4, 0.1], [0.6, 0]]);
      r.speech = D.done(m);
      return r;
    });
    expect(out.two.holds, "2.0 s and 2.6 s pass a 1.5 s line; 0.9 s does not").toBe(2);
    expect(out.two.patches, "only what was heard, and the longest rounded down").toEqual({ strawHolds: 2, longestHold: 2 });
    expect(out.two.summary).toMatch(/2 sonidos de 1,5 s o más/);
    expect(out.blips.holds).toBe(0);
    expect(out.blips.patches).toEqual({});
    expect(out.busy.holds, "sparse frames: a 0.9 s breath still splits two sounds").toBe(2);
    expect(out.busy.longest).toBeLessThan(3.2);
    expect(out.speech.holds, "four seconds of speech is not a held sound").toBe(0);
    expect(out.speech.patches).toEqual({});
    expect(out.speechArt, "a spoken step shows what to say, not hold bars").toBe(true);
  });

  test("the piano's own note is not the learner; quiet minutes count only while it is quiet", async ({ page }) => {
    await boot(page);
    const out = await drill(page, () => {
      const D = window.__drill;
      const r = { notes: [] };
      const real = window.VTPiano.playRefPitch;
      window.VTPiano.playRefPitch = (note) => {
        r.notes.push(note);
        return Promise.resolve(0);
      };
      const NOTE = { phases: [{ label: "Q", labelEs: "Q", sec: 1 }, { label: "N", labelEs: "N", sec: 600, sound: true, ref: "C3" }], minHoldMs: 1500, holdsMetric: "longHolds" };
      let m = D.mount(NOTE);
      // The step begins, the note rings 1.6 s through the speakers, then the learner holds 2 s
      D.feed(m, [[1.1, 0], [1.6, 0.1], [0.6, 0], [2, 0.1], [0.6, 0]]);
      r.note = D.done(m);
      window.VTPiano.playRefPitch = real;
      const REST = { phases: [{ label: "R", labelEs: "R", sec: 600, rest: true }], restMetric: "quietMin" };
      m = D.mount(REST);
      D.feed(m, [[130, 0]], 50);
      r.quiet = D.done(m);
      m = D.mount(REST);
      D.feed(m, [[130, 0.1]], 50);
      r.talked = D.done(m);
      return r;
    });
    expect(out.notes.length, "the note sounds when its step begins").toBe(1);
    expect(out.notes[0]).toMatch(/^C\d$/);
    expect(out.note.holds, "the note's 1.6 s is not a held sound; the learner's 2 s is").toBe(1);
    expect(out.quiet.patches, "130 quiet seconds are 2 whole minutes").toEqual({ quietMin: 2 });
    expect(out.talked.patches, "talking through the rest fills nothing in").toEqual({});
    expect(out.talked.quiet).toBeLessThan(3);
  });

  test("B against A: slower by rate or pauses, never by a longer take; louder alone is pointed out", async ({ page }) => {
    await boot(page);
    const out = await drill(page, () => {
      const D = window.__drill;
      const PAIR = {
        phases: [
          { label: "A", labelEs: "A", sec: 14, sound: true, speech: true, compare: "a" },
          { label: "B", labelEs: "B", sec: 14, sound: true, speech: true, compare: "b" },
          { label: "T", labelEs: "T", sec: 600, sound: true, speech: true }
        ],
        pairYes: "YES",
        pairYesEs: "YES",
        pairNo: "NO",
        pairNoEs: "NO",
        pairLoud: "LOUD",
        pairLoudEs: "LOUD"
      };
      // Quick: 5.5 syllables a second with one short pause. Clear: 3 a second with three longer pauses.
      const quick = (lv, sec = 10) => [[0.5, 0], [sec / 2, lv, 5.5], [0.5, 0], [sec / 2, lv, 5.5]];
      const clear = (lv) => [[0.5, 0], [2.4, lv, 3], [0.9, 0], [2.4, lv, 3], [0.9, 0], [2.4, lv, 3], [0.9, 0], [2.4, lv, 3]];
      const pad = (script) => {
        const used = script.reduce((a, x) => a + x[0], 0);
        return script.concat([[14.2 - used, 0]]);
      };
      const run = (a, b) => {
        const m = D.mount(PAIR);
        D.feed(m, pad(a));
        D.feed(m, pad(b));
        D.feed(m, [[1, 0]]);
        return D.done(m);
      };
      return {
        slower: run(quick(0.1), clear(0.1)),
        same: run(quick(0.1), quick(0.1)),
        loud: run(quick(0.05), quick(0.1)),
        both: run(quick(0.05), clear(0.1)),
        longer: run(quick(0.1, 6), quick(0.1, 12)),
        skipped: run([[1, 0]], clear(0.1))
      };
    });
    expect(out.slower.facts.slower).toBe(true);
    expect(out.slower.facts.dRate, "3 against 5.5 syllables a second").toBeLessThan(-0.2);
    expect(out.slower.facts.b.share).toBeGreaterThan(out.slower.facts.a.share + 0.08);
    expect(out.slower.verdict).toBe("YES");
    expect(out.slower.summary).toMatch(/ritmo .* síl\/s · en pausa \d+ % → \d+ %/);
    expect(out.slower.patches, "clarity is the learner's to rate").toEqual({});
    expect(out.same.verdict).toBe("NO");
    expect(out.loud.facts.dDb).toBeCloseTo(6.02, 0);
    expect(out.loud.verdict).toBe("LOUD");
    expect(out.both.verdict, "slower and louder is still a clear take").toBe("YES");
    expect(out.longer.facts.b.voiced, "B really did run twice as long").toBeGreaterThan(out.longer.facts.a.voiced * 1.6);
    expect(out.longer.verdict, "the same pace said for longer is not slower").toBe("NO");
    expect(out.skipped.facts, "one take alone compares nothing").toBeNull();
  });

  test("the pictures' own rules: a glide's shape, and a skipped take is not shown as still to come", async ({ page }) => {
    await boot(page);
    const out = await drill(page, () => {
      const G = window.VTViz.guided;
      return {
        up: [G.glideAt("up", 0), G.glideAt("up", 1)],
        down: [G.glideAt("down", 0), G.glideAt("down", 1)],
        both: [G.glideAt("updown", 0), G.glideAt("updown", 0.5), G.glideAt("updown", 1)],
        got: G.pairState({ end: 5 }, "a", { compare: "b" }),
        live: G.pairState({ end: null }, "b", { compare: "b" }),
        asked: G.pairState(null, "a", { compare: "a" }),
        later: G.pairState(null, "b", { compare: "a" }),
        none: G.pairState(null, "a", { compare: "b" })
      };
    });
    expect(out.up).toEqual([0, 1]);
    expect(out.down).toEqual([1, 0]);
    expect(out.both[0]).toBeCloseTo(0, 5);
    expect(out.both[1]).toBeCloseTo(1, 5);
    expect(out.both[2]).toBeCloseTo(0, 5);
    expect([out.got, out.live, out.asked, out.later, out.none]).toEqual(["got", "now", "now", "later", "none"]);
  });
});

test.describe("Voice drills: the five exercises", () => {
  test("steps add up to the timer, read in both languages, and Stop never fills a self-rating", async ({ page }) => {
    await boot(page);
    const out = await drill(page, (ids) => {
      const all = [...window.VT_EXERCISES.vocal, ...window.VT_EXERCISES.singing];
      return ids.map((id) => {
        const ex = all.find((e) => e.id === id);
        const p = ex.practice;
        const m = window.__drill.mount(Object.assign({}, p, { phases: p.phases.map((ph) => Object.assign({}, ph, { sec: 70 })) }));
        window.__drill.feed(m, [[2, 0], [65, 0], [4, 0.1], [0.6, 0], [4, 0.1], [0.6, 0]], 50);
        const res = window.__drill.done(m);
        const measured = [p.holdsMetric, p.longestMetric, p.restMetric].filter(Boolean);
        return {
          id,
          mode: p.mode,
          total: p.phases.reduce((a, ph) => a + ph.sec, 0),
          timer: ex.timerDefaultSec,
          spanish: p.phases.every((ph) => ph.labelEs && ph.shortEs && ph.cueEs) && !!p.cueEs && !!p.titleEs,
          metricsEs: ex.metrics.every((x) => !!x.labelEs),
          measuredExist: measured.every((k) => ex.metrics.some((x) => x.id === k && x.type === "number")),
          patched: Object.keys(res.patches),
          measured,
          scales: ex.metrics.filter((x) => x.type === "scale").map((x) => x.id)
        };
      });
    }, IDS);
    for (const r of out) {
      expect(r.mode, r.id).toBe("voiceDrill");
      expect(r.total, `${r.id}: the steps fill the timer exactly`).toBe(r.timer);
      expect(r.spanish, `${r.id}: every step has its Spanish`).toBe(true);
      expect(r.metricsEs, `${r.id}: every metric has its Spanish label`).toBe(true);
      expect(r.measuredExist, `${r.id}: what Stop fills in exists as a number metric`).toBe(true);
      expect(r.scales.length, `${r.id} keeps a self-rating`).toBeGreaterThan(0);
      for (const k of r.patched) expect(r.measured, `${r.id}: ${k} is measured, not rated`).toContain(k);
    }
  });

  test("v21 on a phone: the picture is in the first screen, soft sounds are counted, Stop opens the listen-back", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await open(page, "v21-straw-to-speech", [2, 30, 30, 30, 30, 30]);
    await start(page, "straw");
    await expect(page.locator("#mode-focus [data-phase]")).toHaveText("“U” suave", { timeout: 6000 });
    await expect.poll(() => drill(page, () => window.VTApp.getState().modeInstance.state.holds), { timeout: 15000 }).toBeGreaterThanOrEqual(1);
    const pic = await drill(page, () => {
      const c = document.querySelector("#mode-focus .vz-canvas");
      const r = c.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, h: r.height, vh: innerHeight, sw: document.documentElement.scrollWidth, vw: innerWidth };
    });
    expect(pic.top).toBeGreaterThanOrEqual(0);
    expect(pic.bottom, "the picture ends in the first screen").toBeLessThanOrEqual(pic.vh + 1);
    expect(pic.h).toBeGreaterThan(250);
    expect(pic.sw, "nothing scrolls sideways").toBeLessThanOrEqual(pic.vw);
    const next = page.locator("#mode-focus [data-next-step]");
    expect((await next.boundingBox()).height).toBeGreaterThanOrEqual(tapFloorLimit(44));
    await next.click();
    await expect(page.locator("#mode-focus [data-phase]")).toHaveText("Deslizamientos cortos");
    await stopVoice(page);
    await page.evaluate(() => document.getElementById("btn-practice-stop").click());
    await expect(page.locator("#mode-focus .mode-panel")).toHaveClass(/gd-review/);
    const form = await drill(page, () => ({
      holds: Number(document.querySelector('#metrics-form [name="strawHolds"]').value),
      rated: [...document.querySelectorAll('#metrics-form input[type="range"]')].filter((i) => i.dataset.measured === "1").map((i) => i.name)
    }));
    expect(form.holds).toBeGreaterThanOrEqual(1);
    expect(form.rated, "no self-rating was filled in for the learner").toEqual([]);
  });

  test("s28 is silent on Start, sounds each note when its step begins, and plays it again on request", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await open(page, "s28-vocal-function", [2, 30, 30, 30, 30, 30, 30, 30, 30]);
    await drill(page, () => {
      window.__notes = [];
      const real = window.VTPiano.playRefPitch.bind(window.VTPiano);
      window.VTPiano.playRefPitch = (note, ...rest) => {
        window.__notes.push(note);
        return real(note, ...rest);
      };
    });
    expect(await drill(page, () => window.VTApp.wantsSound()), "Start itself plays nothing").toBe(false);
    await start(page);
    await page.waitForTimeout(600);
    expect(await drill(page, () => window.__notes.length), "the posture step is silent").toBe(0);
    await expect(page.locator("#mode-focus [data-phase]")).toHaveText("“I” larga y suave en la nota", { timeout: 6000 });
    await expect.poll(() => drill(page, () => window.__notes.length)).toBe(1);
    expect(await drill(page, () => window.__notes[0])).toMatch(/^F\d$/);
    const again = page.locator("#mode-focus [data-ref-again]");
    await expect(again).toHaveText("Oír la nota");
    expect((await again.boundingBox()).height).toBeGreaterThanOrEqual(tapFloorLimit(44));
    await again.click();
    await expect.poll(() => drill(page, () => window.__notes.length)).toBe(2);
    // Two controls on a phone: the title's line goes to the picture
    await expect(page.locator("#mode-focus .viz-head .mode-title")).toBeHidden();
    await page.evaluate(() => document.getElementById("btn-practice-stop").click());
  });

  test("the steps read in English", async ({ page }) => {
    await boot(page, "en");
    await open(page, "v23-clear-speech", 30);
    await expect(page.locator("#ex-title")).toHaveText("Clear Speech");
    await start(page);
    await expect(page.locator("#mode-focus [data-phase]")).toHaveText("Your sentence");
    await expect(page.locator("#mode-focus [data-next]")).toHaveText("Next: A · your usual way");
    await page.locator("#mode-focus [data-next-step]").click();
    await expect(page.locator("#mode-focus [data-cue]")).toHaveText("Say it the way you usually do. Once or twice.");
    await page.evaluate(() => document.getElementById("btn-practice-stop").click());
  });
});

test.describe("Voice drills: layout from a small phone to a laptop", () => {
  const SIZES = [
    [320, 568],
    [360, 640],
    [390, 844],
    [412, 915],
    [844, 390],
    [768, 1024],
    [1024, 768],
    [1366, 768]
  ];
  for (const [w, h] of SIZES) {
    test(`${w}×${h}: nothing overflows, the controls clear 44 px, the step and time are on screen`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await boot(page);
      await open(page, "s28-vocal-function", [2, 40, 40, 40, 40, 40, 40, 40, 40]);
      await start(page);
      await expect(page.locator("#mode-focus [data-phase]")).toHaveText("“I” larga y suave en la nota", { timeout: 6000 });
      const g = await drill(page, () => {
        const box = (sel) => {
          const el = document.querySelector(sel);
          if (!el) return null;
          const r = el.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, h: r.height, w: r.width };
        };
        return {
          sw: document.documentElement.scrollWidth,
          vw: innerWidth,
          vh: innerHeight,
          canvas: box("#mode-focus .vz-canvas"),
          next: box("#mode-focus [data-next-step]"),
          again: box("#mode-focus [data-ref-again]"),
          stop: box("#btn-practice-stop")
        };
      });
      expect(g.sw, "no sideways scroll").toBeLessThanOrEqual(g.vw);
      for (const k of ["next", "again", "stop"]) {
        expect(g[k], k).not.toBeNull();
        // The drill's own controls everywhere; the page's Stop where a finger presses it (40 px with a mouse)
        const floor = k === "stop" && w >= 700 ? 40 : 44;
        expect(g[k].h, `${k} is tall enough to tap`).toBeGreaterThanOrEqual(tapFloorLimit(floor));
        expect(g[k].left, `${k} is inside the screen`).toBeGreaterThanOrEqual(0);
        expect(g[k].right).toBeLessThanOrEqual(g.vw + 1);
      }
      expect(g.next.right <= g.again.left || g.again.right <= g.next.left || g.next.bottom <= g.again.top || g.again.bottom <= g.next.top, "the two controls do not overlap").toBe(true);
      expect(g.canvas.top, "the picture starts on screen").toBeGreaterThanOrEqual(0);
      expect(g.canvas.bottom, "and ends in the first screen").toBeLessThanOrEqual(g.vh + 1);
      await page.evaluate(() => document.getElementById("btn-practice-stop").click());
    });
  }
});
