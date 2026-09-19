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
  { id: "s26-placement-compare", mode: "placementAB" }
];

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
  await page.goto(BASE + "/?t=" + Date.now(), { waitUntil: "domcontentloaded" });
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

    // The class warm-ups the session was asked to open with
    expect(report.order.slice(0, 6)).toEqual(
      expect.arrayContaining(["s15-sh-air-ladder", "s7-humming", "s4-lip-trills"])
    );
    // Solfège and song application are in the run
    expect(report.order).toContain("s2-solfege-chords");
    expect(report.order).toContain("s3-song-stanzas");
    // Quick enough to actually be daily: within a couple of minutes of the claim
    expect(Math.abs(report.totalSec / 60 - report.totalMin)).toBeLessThan(2);
  });

  test("home: one press on Canto starts the whole sequence", async ({ page }) => {
    await boot(page);
    await page.locator('.tab[data-tab="singing"]').click();
    await page.waitForTimeout(150);

    // The single primary on home is the daily session, named as a session
    const card = page.locator("#next-step-card");
    await expect(card).toBeVisible();
    await expect(page.locator("#next-step-label")).toHaveText(/Sesión diaria/i);
    await expect(page.locator("#next-step-title")).toHaveText(/16 ejercicios/i);
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
    expect(started.len).toBe(16);
    expect(started.openId).toBe(started.first);
    expect(started.structured, "opened as part of the session, so Next advances").toBe(true);

    // The banner names the daily session rather than the generic guided one
    await expect(page.locator("#session-banner")).toHaveClass(/visible/);
    await expect(page.locator("#session-banner-text")).toHaveText(/Sesión diaria de clase/i);
    // And the "next exercise" control is the way forward
    await expect(page.locator("#btn-next-structured")).toBeVisible();
  });

  test("sequence: Next walks all 16 steps in order and finishes", async ({ page }) => {
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
      // Metric labels are learner-facing: in Spanish they must not fall back to English
      expect(r.metricLabels.length, `${r.id} renders its metrics form`).toBeGreaterThan(0);
      expect(r.metricLabels, `${r.id} metric labels are translated`).not.toMatch(
        /Release phases|Complete breath cycles|Open-space holds|Rounds|targets held|takes recorded/i
      );
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
    await boot(page, "en");
    await page.locator('.tab[data-tab="singing"]').click();
    await page.waitForTimeout(150);
    await expect(page.locator("#next-step-label")).toHaveText(/Daily class session/i);
    await expect(page.locator("#btn-next-step")).toHaveText(/Start daily session/i);
    await page.locator("#btn-next-step").click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await expect(page.locator("#session-banner-text")).toHaveText(/Daily class session/i);
  });
});
