/**
 * Prepared daily class session: the home entry point, the sequence itself, the
 * short per-step timers, and the new class exercises' practice modes.
 *
 * The point of the feature is that a user presses one button and is carried
 * through every class exercise in order, so the spec walks the whole sequence
 * rather than only asserting the first step opens.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

/** New exercises added from the class notes, with the mode each one must mount. */
const CLASS_EXERCISES = [
  { id: "s17-jaw-neck-release", mode: "releaseFlow" },
  { id: "s18-costal-breath", mode: "breathCycle" },
  { id: "s19-soft-palate-surprise", mode: "openSpace" },
  { id: "s20-five-vowels", mode: "vowelLadder" },
  { id: "s21-chest-resonance", mode: "resonanceZone" },
  { id: "s22-mid-voice-hola", mode: "resonanceZone" },
  { id: "s23-mask-ya", mode: "resonanceZone" },
  { id: "s24-nana-high", mode: "resonanceZone" },
  { id: "s25-zone-tour", mode: "resonanceZone" },
  { id: "s26-placement-compare", mode: "placementAB" },
  { id: "s27-lip-trill-solfege", mode: "trillSolfege" }
];

async function boot(page, lang = "es", query = "") {
  await page.context().grantPermissions(["microphone"]).catch(() => {});
  await page.addInitScript((l) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", l);
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    async function fakeGUM() {
      let ctx = window.VTPiano?.ctx || window.VTSharedAudioCtx;
      if (!ctx || ctx.state === "closed") {
        ctx = new AC();
        window.VTSharedAudioCtx = ctx;
      }
      try {
        if (ctx.state !== "running") await ctx.resume();
      } catch {
        /* ignore */
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
  }, lang);
  await page.goto(BASE + "/?t=" + Date.now() + query, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && !!window.VT_DAILY_SESSION);
}

test.describe("Prepared daily class session", () => {
  test("catalog: the class sequence is complete and every step is real", async ({ page }) => {
    await boot(page);
    const report = await page.evaluate(() => {
      const order = window.VT_STRUCTURED.singing_daily || [];
      const def = window.VT_DAILY_SESSION;
      const all = [...VT_EXERCISES.vocal, ...VT_EXERCISES.singing];
      const modeIds = window.VTPracticeModes.ids();
      return {
        order,
        totalMin: def.totalMin,
        totalSec: order.reduce((a, id) => a + (def.sec[id] || 0), 0),
        missingExercise: order.filter((id) => !all.some((e) => e.id === id)),
        missingSec: order.filter((id) => !def.sec[id]),
        missingMode: order.filter((id) => {
          const ex = all.find((e) => e.id === id);
          return !ex || !modeIds.includes(ex.practice?.mode);
        }),
        duplicates: order.filter((id, i) => order.indexOf(id) !== i)
      };
    });

    expect(report.missingExercise, "every step is a real exercise").toEqual([]);
    expect(report.missingSec, "every step has its own daily timer").toEqual([]);
    expect(report.missingMode, "every step mounts a registered practice mode").toEqual([]);
    expect(report.duplicates, "no exercise appears twice in the sequence").toEqual([]);

    // The class warm-ups the session was asked to open with. Both lip-trill
    // steps are part of the mandatory block, and the solfège one follows the
    // free trill rather than floating somewhere later in the run.
    expect(report.order.slice(0, 6)).toEqual(
      expect.arrayContaining([
        "s15-sh-air-ladder",
        "s7-humming",
        "s4-lip-trills",
        "s27-lip-trill-solfege"
      ])
    );
    expect(report.order.indexOf("s27-lip-trill-solfege")).toBe(
      report.order.indexOf("s4-lip-trills") + 1
    );
    // Solfège and song application are in the run
    expect(report.order).toContain("s2-solfege-chords");
    expect(report.order).toContain("s3-song-stanzas");
    // Quick enough to actually be daily: within a couple of minutes of the claim
    expect(Math.abs(report.totalSec / 60 - report.totalMin)).toBeLessThan(2);
  });

  // A first visit in the loop arm starts with the Mínimo (tests/home-design.spec.js);
  // the daily class as home's recommendation is the classic arm's panel.
  const CLASSIC = "&ab_loop_home_2026_10=classic";

  test("home: one press on Canto starts the whole sequence", async ({ page }) => {
    await boot(page, "es", CLASSIC);
    await page.locator('.tab[data-tab="singing"]').click();
    await page.waitForTimeout(150);

    // The single primary on home is the daily session, named as a session
    const card = page.locator("#next-step-card");
    await expect(card).toBeVisible();
    await expect(page.locator("#next-step-label")).toHaveText(/Sesión diaria/i);
    const stepCount = await page.evaluate(() => window.VT_STRUCTURED.singing_daily.length);
    await expect(page.locator("#next-step-title")).toHaveText(
      new RegExp(`${stepCount} ejercicios`, "i")
    );
    const cta = page.locator("#btn-next-step");
    await expect(cta).toHaveText(/sesión diaria/i);
    // Home must still have exactly one primary action (the IA rule for this panel)
    expect(await page.locator("#start-panel .btn-practice").count()).toBe(1);
    // ...and the first-visit explainer must not tell them to pick an exercise
    // while the card beside it promises there is nothing to pick.
    await expect(page.locator("#start-steps li").first()).toHaveText(/sesión diaria/i);
    await page.locator('.tab[data-tab="vocal"]').click();
    await page.waitForTimeout(150);
    await expect(page.locator("#start-steps li").first()).toHaveText(/Elige un ejercicio/i);
    await page.locator('.tab[data-tab="singing"]').click();
    await page.waitForTimeout(150);

    await cta.click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);

    const started = await page.evaluate(() => {
      const s = window.VTStorage.getSession();
      return {
        path: s?.path,
        track: s?.track,
        status: s?.status,
        len: s?.order?.length,
        first: s?.order?.[0],
        openId: window.VTApp.getState().exercise?.id,
        structured: window.VTApp.getState().structured
      };
    });
    expect(started.path).toBe("daily");
    expect(started.track).toBe("singing");
    expect(started.status).toBe("active");
    expect(started.len).toBe(stepCount);
    expect(started.openId).toBe(started.first);
    expect(started.structured, "opened as part of the session, so Next advances").toBe(true);

    // The banner names the daily session rather than the generic guided one
    await expect(page.locator("#session-banner")).toHaveClass(/visible/);
    await expect(page.locator("#session-banner-text")).toHaveText(/Sesión diaria de clase/i);
    // And the "next exercise" control is the way forward
    await expect(page.locator("#btn-next-structured")).toBeVisible();
  });

  test("sequence: Next walks every step in order and finishes", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.VTApp.startDaily());
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);

    const order = await page.evaluate(() => window.VT_STRUCTURED.singing_daily);
    const seen = [];
    for (let i = 0; i < order.length; i++) {
      const step = await page.evaluate(() => {
        const st = window.VTApp.getState();
        return {
          id: st.exercise?.id,
          timer: st.timer?.total,
          modeMounted: !!document.querySelector("#mode-hud .mode-panel, #mode-focus .mode-panel"),
          progress: document.querySelector("#structured-progress")?.textContent || ""
        };
      });
      seen.push(step.id);
      expect(step.id, `step ${i + 1} is the exercise the session ordered`).toBe(order[i]);
      expect(step.modeMounted, `${step.id} mounted its practice HUD`).toBe(true);
      const expected = await page.evaluate((id) => window.VT_DAILY_SESSION.sec[id], step.id);
      expect(step.timer, `${step.id} uses its short daily timer`).toBe(expected);
      expect(step.progress).toContain(String(i + 1));

      await page.locator("#btn-next-structured").click();
      await page.waitForTimeout(120);
    }

    expect(seen).toEqual(order);
    const done = await page.evaluate(() => {
      const s = window.VTStorage.getSession();
      return { status: s?.status, view: window.VTApp.getState().view };
    });
    expect(done.status, "the session completes after the last step").toBe("completed");
    expect(done.view).toBe("home");
  });

  test("daily timers are shorter than the exercises' own defaults", async ({ page }) => {
    await boot(page);
    const rows = await page.evaluate(() => {
      const all = [...VT_EXERCISES.singing];
      return (window.VT_STRUCTURED.singing_daily || []).map((id) => {
        const ex = all.find((e) => e.id === id);
        const p = ex?.practice || {};
        // Phase runners and multi-zone tours both drive a fixed-length sequence
        const guided = (p.phases || p.zones || []).reduce((a, x) => a + (x.sec || 0), 0);
        return {
          id,
          daily: window.VT_DAILY_SESSION.sec[id],
          own: ex?.timerDefaultSec || 0,
          guidedSec: guided
        };
      });
    });
    for (const r of rows) {
      expect(r.daily, `${r.id} daily timer is set`).toBeGreaterThan(0);
      expect(r.daily, `${r.id} daily timer is not longer than its own default`).toBeLessThanOrEqual(
        r.own
      );
      // A guided phase sequence that outlives its step would be cut off before its
      // last phase, so the user would never reach the part the exercise builds to.
      if (r.guidedSec) {
        expect(r.guidedSec, `${r.id} phases fit inside its daily step`).toBeLessThanOrEqual(r.daily);
      }
    }
  });

  test("new class exercises: catalog card, guide, mode and bilingual title", async ({ page }) => {
    await boot(page);
    const report = await page.evaluate(async (ids) => {
      const out = [];
      const I = window.VTI18n;
      for (const { id, mode } of ids) {
        await window.VTApp.openExercise(id);
        await new Promise((r) => setTimeout(r, 60));
        const st = window.VTApp.getState();
        const ex = st.exercise;
        I.lang = "es";
        const es = I.exTitle(ex);
        const esSteps = I.exField(ex, "steps");
        I.lang = "en";
        const en = I.exTitle(ex);
        I.lang = "es";
        out.push({
          id,
          opened: ex?.id === id,
          mode: ex?.practice?.mode,
          wantMode: mode,
          hud: !!document.querySelector("#mode-hud .mode-panel, #mode-focus .mode-panel"),
          cue: (document.querySelector("#mode-cue")?.textContent || "").trim().length,
          steps: document.querySelectorAll("#ex-steps li").length,
          tips: document.querySelectorAll("#ex-tips li").length,
          mistakes: document.querySelectorAll("#ex-mistakes li").length,
          metricLabels: (document.querySelector("#metrics-form")?.textContent || "").trim(),
          metricCount: (ex?.metrics || []).length,
          metrics: (ex?.metrics || []).map((m) => ({
            id: m.id,
            label: m.label,
            labelEs: m.labelEs || null
          })),
          esTitle: es,
          enTitle: en,
          esStepsTranslated: Array.isArray(esSteps) && esSteps.length > 0 && esSteps !== ex.steps
        });
      }
      return out;
    }, CLASS_EXERCISES);

    for (const r of report) {
      expect(r.opened, `${r.id} opens`).toBe(true);
      expect(r.mode, `${r.id} mode`).toBe(r.wantMode);
      expect(r.hud, `${r.id} mounts a mode HUD`).toBe(true);
      expect(r.cue, `${r.id} has a practice cue`).toBeGreaterThan(0);
      expect(r.steps, `${r.id} steps`).toBeGreaterThanOrEqual(4);
      expect(r.tips, `${r.id} tips`).toBeGreaterThanOrEqual(3);
      expect(r.mistakes, `${r.id} mistakes`).toBeGreaterThanOrEqual(3);
      expect(r.metricCount, `${r.id} has metrics to log`).toBeGreaterThanOrEqual(3);
      // Metric labels are learner-facing: in Spanish they must not fall back to
      // English. Checked against each metric's own declared pair rather than a
      // frozen list of phrases, so a new metric cannot ship untranslated.
      expect(r.metricLabels.length, `${r.id} renders its metrics form`).toBeGreaterThan(0);
      for (const m of r.metrics) {
        expect(m.labelEs, `${r.id}.${m.id} declares a Spanish label`).toBeTruthy();
        expect(r.metricLabels, `${r.id}.${m.id} renders in Spanish`).toContain(m.labelEs);
        if (m.label !== m.labelEs) {
          expect(r.metricLabels, `${r.id}.${m.id} does not fall back to English`).not.toContain(
            m.label
          );
        }
      }
      expect(r.esTitle, `${r.id} Spanish title`).not.toMatch(/^ex\./);
      expect(r.enTitle, `${r.id} English title`).not.toMatch(/^ex\./);
      expect(r.esTitle).not.toBe(r.enTitle);
      expect(r.esStepsTranslated, `${r.id} has Spanish steps`).toBe(true);
    }
  });

  test("time-driven modes advance their HUD while practice runs", async ({ page }) => {
    test.setTimeout(120_000);
    await boot(page);

    // Each case names the element that must move, and how long that takes at the
    // mode's own pace (a vowel lasts 4s, a breath count ticks every second).
    const cases = [
      { id: "s17-jaw-neck-release", sel: "[data-remain]", waitMs: 2000 },
      { id: "s18-costal-breath", sel: "[data-count]", waitMs: 2000 },
      { id: "s20-five-vowels", sel: "[data-cur]", waitMs: 4800 }
    ];

    for (const c of cases) {
      await page.evaluate((id) => window.VTApp.openExercise(id), c.id);
      await expect(page.locator("#view-exercise")).toHaveClass(/active/);
      const panel = page.locator(`#mode-hud ${c.sel}, #mode-focus ${c.sel}`).first();
      await expect(panel, `${c.id} renders ${c.sel}`).toBeAttached();

      const before = await panel.textContent();
      await page.locator("#btn-practice-start").click();
      await page.waitForTimeout(c.waitMs);
      expect(
        await page.evaluate(() => !!window.VTApp.getState().modeInstance),
        `${c.id} keeps its mode instance while practising`
      ).toBe(true);
      const after = await panel.textContent();
      expect(after, `${c.id} HUD advances while practising`).not.toBe(before);

      await page.locator("#btn-practice-stop").click().catch(() => {});
      await page.waitForTimeout(200);
    }
  });

  test("pitch-driven modes log what they measure", async ({ page }) => {
    await boot(page);

    // resonanceZone: singing the target note for ~1s must credit a target and
    // move on to the next one, and the in-zone share must reflect it.
    const zone = await page.evaluate(() => {
      const m = window.VTPracticeModes.get("resonanceZone");
      const host = document.createElement("div");
      document.body.appendChild(host);
      m.mount(host, {
        zones: [
          { key: "low", label: "Low", labelEs: "Graves", notes: ["C3", "D3", "E3"] }
        ]
      });
      m.onStart();
      const first = m.state.wantName;
      const afterOne = [];
      // Sing whatever the mode currently asks for, the way a user following the
      // targets would: ~4s of on-pitch voiced frames.
      for (let i = 0; i < 260; i++) {
        m.onFrame({ dtMs: 16, rms: 0.2, voiced: true, voiceFreq: m.state.wantFreq });
        if (m.state.held === 1 && !afterOne.length) afterOne.push(m.state.wantName);
      }
      const out = m.onStop({});
      const res = {
        first,
        afterFirstHold: afterOne[0],
        held: m.state.held,
        patches: out.patches,
        summary: out.summary,
        chips: host.querySelectorAll(".zone-chip").length
      };
      host.remove();
      return res;
    });
    expect(zone.first, "a zone target is set on start").toBe("C3");
    expect(zone.held, "holding each note credits a target").toBeGreaterThanOrEqual(3);
    expect(zone.afterFirstHold, "and the mode moves to the next target").toBe("D3");
    expect(zone.patches.zoneTargets).toBeGreaterThanOrEqual(3);
    expect(zone.patches.steadiness, "single-zone drills score steadiness").toBeGreaterThanOrEqual(4);
    expect(zone.summary, "the summary reports the in-zone share").toMatch(/100% in zone/);
    expect(zone.chips, "the zone strip renders a chip per zone").toBe(1);

    // Off-pitch singing must not credit anything
    const offPitch = await page.evaluate(() => {
      const m = window.VTPracticeModes.get("resonanceZone");
      const host = document.createElement("div");
      document.body.appendChild(host);
      m.mount(host, { zones: [{ key: "low", label: "Low", labelEs: "Graves", notes: ["C3"] }] });
      m.onStart();
      const off = m.state.wantFreq * 1.35; // well over a semitone away
      for (let i = 0; i < 120; i++) {
        m.onFrame({ dtMs: 16, rms: 0.2, voiced: true, voiceFreq: off });
      }
      const held = m.state.held;
      host.remove();
      return held;
    });
    expect(offPitch, "a note this far off must not count as held").toBe(0);

    // openSpace: only a sounding phase logs holds, and only past the threshold
    const open = await page.evaluate(() => {
      function run(sound, frames) {
        const m = window.VTPracticeModes.get("openSpace");
        const host = document.createElement("div");
        document.body.appendChild(host);
        m.mount(host, { phases: [{ label: "P", labelEs: "P", sec: 60, sound }], minHoldMs: 1500 });
        for (let i = 0; i < frames; i++) m.onFrame({ dtMs: 16, rms: 0.2, voiced: true });
        const out = m.onStop({});
        host.remove();
        return { holds: m.state.holds, patches: out.patches };
      }
      return {
        sounding: run(true, 100),
        tooShort: run(true, 40),
        silentPhase: run(false, 100)
      };
    });
    expect(open.sounding.holds, "a long hold in a sounding phase logs").toBeGreaterThanOrEqual(1);
    expect(open.sounding.patches.openHolds).toBeGreaterThanOrEqual(1);
    expect(open.tooShort.holds, "a hold under 1.5s does not").toBe(0);
    expect(open.silentPhase.holds, "the silent setup phases never log holds").toBe(0);

    // placementAB: the take counter is the protocol, and it caps at two
    const ab = await page.evaluate(() => {
      const m = window.VTPracticeModes.get("placementAB");
      const host = document.createElement("div");
      document.body.appendChild(host);
      m.mount(host, { phases: [{ label: "A", labelEs: "A", sec: 30 }] });
      const btn = host.querySelector("[data-take]");
      btn.click();
      btn.click();
      btn.click();
      const out = m.onStop({});
      const res = { takes: m.state.takes, patches: out.patches };
      host.remove();
      return res;
    });
    expect(ab.takes).toBe(2);
    expect(ab.patches.takes).toBe(2);
  });

  test("zone targets follow the octave shift and the highway", async ({ page }) => {
    await boot(page);
    await page.evaluate(() => window.VTApp.openExercise("s21-chest-resonance"));
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);

    // With a shift applied, the mode must aim at the note the highway and the
    // piano reference actually play, not at the raw-octave lookup.
    const res = await page.evaluate(() => {
      window.VTApp.applyOctaveShift(1); // the shift is in octaves, clamped to ±2
      const m = window.VTPracticeModes.get("resonanceZone");
      const host = document.createElement("div");
      document.body.appendChild(host);
      m.mount(host, { zones: [{ key: "low", label: "Low", labelEs: "Graves", notes: ["C3"] }] });
      m.onStart();
      const out = {
        shift: window.VTApp.getOctaveShift(),
        wantFreq: m.state.wantFreq,
        rawC3: window.VT_NOTE_FREQ.C3,
        shiftedC3: window.VT_NOTE_FREQ.C4
      };
      host.remove();
      window.VTApp.applyOctaveShift(0);
      return out;
    });
    expect(res.shift).toBe(1);
    expect(res.wantFreq, "target follows the shift").toBeCloseTo(res.shiftedC3, 1);
    expect(res.wantFreq).not.toBeCloseTo(res.rawC3, 1);

    // And the generic refPitch bootstrap must not move the target the mode set:
    // s21's refPitch is A2 while its first zone target is C3.
    await page.evaluate(() => window.VTApp.openExercise("s21-chest-resonance"));
    await page.locator("#btn-practice-start").click();
    await page.waitForTimeout(600);
    const live = await page.evaluate(() => {
      const st = window.VTApp.getState();
      return {
        modeWants: st.modeInstance?.state?.wantName,
        modeFreq: st.modeInstance?.state?.wantFreq,
        engineTarget: st.practice?.getTargetFreq?.() ?? st.practice?.targetFreq ?? null,
        c3: window.VT_NOTE_FREQ.C3,
        a2: window.VT_NOTE_FREQ.A2
      };
    });
    expect(live.modeWants).toBe("C3");
    if (live.engineTarget != null) {
      expect(live.engineTarget, "engine follows the mode, not refPitch").toBeCloseTo(live.c3, 1);
      expect(live.engineTarget).not.toBeCloseTo(live.a2, 1);
    }
    await page.locator("#btn-practice-stop").click().catch(() => {});
  });

  test("each zone exercise scores the metric it actually defines", async ({ page }) => {
    await boot(page);
    const report = await page.evaluate(() => {
      const out = [];
      const byId = Object.fromEntries(VT_EXERCISES.singing.map((e) => [e.id, e]));
      for (const id of ["s21-chest-resonance", "s22-mid-voice-hola", "s23-mask-ya", "s24-nana-high", "s25-zone-tour"]) {
        const ex = byId[id];
        const m = window.VTPracticeModes.get("resonanceZone");
        const host = document.createElement("div");
        document.body.appendChild(host);
        m.mount(host, ex.practice);
        m.onStart();
        // Over three seconds of on-pitch singing, which is what unlocks the score
        for (let i = 0; i < 260; i++) {
          m.onFrame({ dtMs: 16, rms: 0.2, voiced: true, voiceFreq: m.state.wantFreq });
        }
        const patches = m.onStop({}).patches || {};
        host.remove();
        out.push({
          id,
          patchKeys: Object.keys(patches),
          metricIds: (ex.metrics || []).map((x) => x.id)
        });
      }
      return out;
    });

    for (const r of report) {
      expect(r.patchKeys.length, `${r.id} scored something`).toBeGreaterThan(0);
      for (const k of r.patchKeys) {
        // A patch under a key the metrics form does not have is dropped silently,
        // so the user's saved result would keep the form default.
        expect(r.metricIds, `${r.id} patches a metric it defines (${k})`).toContain(k);
      }
    }
  });

  test("a shared boundary note counts for the zone being asked for", async ({ page }) => {
    await boot(page);
    // In the tour C3 is the top of the low zone and the bottom of the middle one.
    const res = await page.evaluate(() => {
      const m = window.VTPracticeModes.get("resonanceZone");
      const host = document.createElement("div");
      document.body.appendChild(host);
      m.mount(host, {
        zones: [
          { key: "low", label: "Low", labelEs: "Graves", sec: 45, notes: ["C3", "B2", "A2"] },
          { key: "mid", label: "Middle", labelEs: "Medios", sec: 45, notes: ["C3", "D3", "E3"] }
        ]
      });
      m.onStart();
      const c3 = window.VT_NOTE_FREQ.C3;
      const lowSaysLow = m._zoneOf(c3);
      m._setZone(1); // the exercise now asks for the middle zone
      const midSaysMid = m._zoneOf(c3);
      host.remove();
      return { lowSaysLow, midSaysMid };
    });
    expect(res.lowSaysLow, "C3 is the low zone while low is asked for").toBe(0);
    expect(res.midSaysMid, "and the middle zone once middle is asked for").toBe(1);
  });

  test("the lip-trill scale tolerates a trill without tolerating the wrong note", async ({
    page
  }) => {
    await boot(page);

    const r = await page.evaluate(() => {
      // A lip trill reads sharp through this app's detector and scatters frame
      // to frame, so the gate is asymmetric and bleeds instead of resetting.
      // Drive it with frames shaped like a real trill rather than a clean tone.
      function run(centsOff, frames, opts = {}) {
        const m = window.VTPracticeModes.get("trillSolfege");
        const host = document.createElement("div");
        document.body.appendChild(host);
        m.mount(host, { mode: "trillSolfege", rootMidi: 48, topRootMidi: 55 });
        m.onStart();
        const first = m.state.wantName;
        const firstRoot = m.state.rootMidi;
        for (let i = 0; i < frames; i++) {
          const bad = opts.badAt && i >= opts.badAt[0] && i < opts.badAt[1];
          const off = bad ? -400 : centsOff;
          // ±1 cent of jitter, the way a bubbling trill actually arrives
          const jitter = ((i % 3) - 1) * 0.0005;
          const f = m.state.wantFreq * Math.pow(2, off / 1200) * (1 + jitter);
          m.onFrame({ dtMs: 16, rms: 0.2, voiced: true, voiceFreq: f, airRmsThreshold: 0.006 });
        }
        const out = m.onStop({});
        const res = {
          first,
          firstRoot,
          step: m.state.i,
          patterns: m.state.patterns,
          root: m.state.rootMidi,
          note: m.state.wantName,
          patches: out.patches,
          summary: out.summary
        };
        host.remove();
        return res;
      }

      // One step is ~250ms of reference blanking plus 600ms in band ≈ 54 frames.
      const STEP = 60;
      return {
        onPitch: run(0, STEP * 9 + 40),
        sharp: run(60, STEP * 2),
        flat: run(-80, STEP * 4),
        wayOff: run(300, STEP * 4),
        dropout: run(0, 76, { badAt: [50, 56] }),
        silent: (() => {
          const m = window.VTPracticeModes.get("trillSolfege");
          const host = document.createElement("div");
          document.body.appendChild(host);
          m.mount(host, { mode: "trillSolfege" });
          m.onStart();
          // The clock-only fallback frame: no mic, voiceFreq 0, no energy.
          for (let i = 0; i < 400; i++)
            m.onFrame({ dtMs: 16, rms: 0, voiced: false, voiceFreq: 0 });
          const out = { step: m.state.i, patches: m.onStop({}).patches };
          host.remove();
          return out;
        })(),
        stale: (() => {
          const m = window.VTPracticeModes.get("trillSolfege");
          const host = document.createElement("div");
          document.body.appendChild(host);
          m.mount(host, { mode: "trillSolfege" });
          m.onStart();
          // `voiced` stays true through a grace window after the sound stops and
          // `voiceFreq` repeats its last value exactly. That must not advance.
          const f = m.state.wantFreq;
          for (let i = 0; i < 400; i++)
            m.onFrame({ dtMs: 16, rms: 0.2, voiced: true, voiceFreq: f });
          const out = { step: m.state.i, patterns: m.state.patterns };
          host.remove();
          return out;
        })()
      };
    });

    expect(r.onPitch.first, "the ladder starts on the profile root").toBe("C3");
    expect(r.onPitch.firstRoot).toBe(48);
    expect(r.onPitch.patterns, "trilling the whole pattern completes it").toBe(1);
    expect(r.onPitch.root, "and the root walks up a semitone for the next pass").toBe(49);
    expect(r.onPitch.patches.patterns).toBe(1);
    // The summary lands in a toast and the results panel, so it is Spanish here
    expect(r.onPitch.summary).toMatch(/1 pasada · raíz alcanzada C#3/i);

    expect(r.sharp.step, "a trill read sharp still counts — that is the point").toBeGreaterThan(0);
    expect(r.flat.step, "but a note this flat is the note below, not a sharp trill").toBe(0);
    expect(r.wayOff.step, "and a target missed by a third never counts").toBe(0);

    // The gate bleeds at half the fill rate, so a burst of bad frames costs some
    // progress without throwing the whole hold away. A hard reset would leave
    // only the frames after the burst, which is not enough to advance here.
    expect(r.dropout.step, "a dropout mid-hold does not wipe the hold").toBe(1);

    expect(r.silent.step, "the clock-only fallback frame never advances the scale").toBe(0);
    expect(r.silent.patches.patterns, "and scores nothing").toBeUndefined();
    expect(r.stale.step, "a repeated stale pitch is not singing").toBe(0);
    expect(r.stale.patterns).toBe(0);

    // Live: the mode owns the target, and the highway shows the pattern it is
    // asking for rather than every semitone the ladder will eventually visit.
    await page.evaluate(() => window.VTApp.openExercise("s27-lip-trill-solfege"));
    await page.locator("#btn-practice-start").click();
    await page.waitForTimeout(700);
    const live = await page.evaluate(() => {
      const st = window.VTApp.getState();
      return {
        wantName: st.modeInstance?.state?.wantName,
        engineTarget: st.practice?.getTargetFreq?.() ?? st.practice?.targetFreq ?? null,
        c3: window.VT_NOTE_FREQ.C3,
        lanes: (window.VTGetPitchViz?.()?.progressionLanes || []).map((l) => l.name)
      };
    });
    expect(live.wantName).toBe("C3");
    if (live.engineTarget != null) {
      expect(live.engineTarget, "the mode's target survives the refPitch bootstrap").toBeCloseTo(
        live.c3,
        1
      );
    }
    expect(live.lanes, "one lane per note of the current pattern").toEqual([
      "C3",
      "D3",
      "E3",
      "F3",
      "G3"
    ]);

    // The root walks, and the lanes walk with it inside the same locked range.
    const walked = await page.evaluate(() => {
      const m = window.VTApp.getState().modeInstance;
      m.state.rootMidi = 52; // E3
      m._drawLanes();
      return (window.VTGetPitchViz?.()?.progressionLanes || []).map((l) => l.name);
    });
    expect(walked, "the pattern transposes with the root").toEqual([
      "E3",
      "F#3",
      "G#3",
      "A3",
      "B3"
    ]);
    await page.locator("#btn-practice-stop").click().catch(() => {});
  });

  test("time-driven exercises still run when the mic is refused", async ({ page }) => {
    await boot(page);
    // No microphone at all — the paced breathing exercise must still pace.
    await page.evaluate(() => {
      navigator.mediaDevices.getUserMedia = () => Promise.reject(new Error("NotAllowedError"));
    });
    await page.evaluate(() => window.VTApp.openExercise("s18-costal-breath"));
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    const count = page.locator("#mode-hud [data-count], #mode-focus [data-count]").first();
    await expect(count).toBeAttached();

    await page.locator("#btn-practice-start").click();
    await page.waitForTimeout(2200);
    const after = await page.evaluate(() => {
      const st = window.VTApp.getState();
      return {
        ticking: !!st._modeTicker,
        stage: (
          document.querySelector("#mode-hud [data-stage], #mode-focus [data-stage]")?.textContent ||
          ""
        ).trim(),
        timerMoved: st.timer?.remaining < st.timer?.total
      };
    });
    expect(after.ticking, "the mode is driven without the engine").toBe(true);
    expect(after.stage.length, "the breath stage still renders").toBeGreaterThan(0);
    expect(after.timerMoved, "and the exercise timer still runs").toBe(true);
    await page.locator("#btn-practice-stop").click().catch(() => {});
  });

  test("the daily route is offered on Canto only", async ({ page }) => {
    await boot(page);
    const sel = page.locator("#session-path");
    const opt = page.locator('#session-path option[value="daily"]');

    await page.locator('.tab[data-tab="singing"]').click();
    await page.waitForTimeout(120);
    expect(await opt.evaluate((o) => o.disabled)).toBe(false);

    await page.locator('.tab[data-tab="vocal"]').click();
    await page.waitForTimeout(120);
    expect(await opt.evaluate((o) => o.disabled)).toBe(true);
    // Falling back to a real route rather than silently running Basic as "Diaria"
    expect(await sel.inputValue()).not.toBe("daily");
  });

  test("English keeps the session usable", async ({ page }) => {
    await boot(page, "en", CLASSIC);
    await page.locator('.tab[data-tab="singing"]').click();
    await page.waitForTimeout(150);
    await expect(page.locator("#next-step-label")).toHaveText(/Daily class session/i);
    await expect(page.locator("#btn-next-step")).toHaveText(/Start daily session/i);
    await page.locator("#btn-next-step").click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await expect(page.locator("#session-banner-text")).toHaveText(/Daily class session/i);
  });
});
