/**
 * Per-exercise feature matrix: profile flags must match wired UI + Start behavior.
 * Fails if an exercise is missing mode UI, pitch/hold/challenge/prog/piano chrome,
 * or is silent when it should produce piano.
 */
const { test, expect } = require("@playwright/test");
const snap = require("./fixtures/catalog-snapshot.json");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page) {
  await page.context().grantPermissions(["microphone"]).catch(() => {});
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
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
      try {
        await window.VTPiano?.ensure?.();
        ctx = window.VTPiano?.ctx || ctx;
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
  });
  await page.goto(BASE + "/?t=" + Date.now(), { waitUntil: "domcontentloaded" });
}

test.describe("Exercise feature matrix", () => {
  test.describe.configure({ mode: "serial", timeout: 300_000 });

  test("every exercise: mode + UI chrome + Start contract", async ({ page }) => {
    test.setTimeout(300_000);
    await boot(page);

    const report = await page.evaluate(async () => {
      const all = [...VT_EXERCISES.vocal, ...VT_EXERCISES.singing];
      const modeIds = window.VTPracticeModes?.ids?.() || [];
      const issues = [];
      const summary = [];

      for (const ex of all) {
        await VTApp.openExercise(ex.id);
        await new Promise((r) => setTimeout(r, 50));
        const st = VTApp.getState();
        const p = st.exercise?.practice || {};
        const profile = {
          mode: p.mode,
          showPitch: !!p.showPitch,
          showHold: !!p.showHold,
          showLevel: p.showLevel !== false,
          autoPiano: !!p.autoPiano,
          autoRecord: !!p.autoRecord,
          pitchChallenge: !!p.pitchChallenge,
          refPitch: p.refPitch || st.exercise?.audio?.refPitch || null
        };

        const pitchVisible = !!(
          document.querySelector("#pitch-block") &&
          !document.querySelector("#pitch-block").hidden
        );
        const holdHidden = !!document.querySelector("#hold-display")?.hidden;
        const gameHud = document.querySelector("#pitch-game-hud");
        const gameHudShown = !!(gameHud && getComputedStyle(gameHud).display !== "none");
        const challengeShown = !document.querySelector("#pitch-challenge-row")?.hidden;
        const progShown = !!(
          document.querySelector("#hud-prog-bar") &&
          !document.querySelector("#hud-prog-bar").hidden
        );
        const pianoMini = document.querySelector("#piano-mini-opts");
        const pianoShown = !!(
          pianoMini &&
          pianoMini.style.display !== "none" &&
          getComputedStyle(pianoMini).display !== "none"
        );
        const modeFocus = document.querySelector("#mode-focus");
        const modeHud = document.querySelector("#mode-hud");
        const modeHasContent = !!(
          (modeFocus && !modeFocus.hidden && modeFocus.children.length) ||
          (modeHud && !modeHud.hidden && modeHud.children.length)
        );
        const wantsSound = !!VTApp.wantsSound?.(st.exercise);
        const local = [];

        if (!profile.mode) local.push("missing practice.mode");
        if (profile.mode && !modeIds.includes(profile.mode)) {
          local.push(`mode ${profile.mode} not registered`);
        }
        if (profile.showPitch !== pitchVisible) {
          local.push(
            `pitch block mismatch showPitch=${profile.showPitch} visible=${pitchVisible}`
          );
        }
        if (profile.showHold === holdHidden) {
          local.push(
            `hold mismatch showHold=${profile.showHold} hidden=${holdHidden}`
          );
        }
        if (profile.showPitch !== gameHudShown) {
          local.push(
            `game HUD mismatch showPitch=${profile.showPitch} shown=${gameHudShown}`
          );
        }
        if (profile.pitchChallenge !== challengeShown) {
          local.push(
            `challenge mismatch expect=${profile.pitchChallenge} shown=${challengeShown}`
          );
        }
        if (["pitchChord", "pitchSong"].includes(profile.mode) && !progShown) {
          local.push("chord/song mode missing progression bar");
        }
        // scale / arpeggio / hum with progressions should expose prog picker
        const hasProgData = !!(
          st.exercise?.progressions?.length ||
          st.exercise?.songs?.length ||
          st.exercise?.audio?.progressions
        );
        if (
          hasProgData &&
          (profile.autoPiano || st.exercise?.audio?.piano) &&
          !progShown &&
          profile.mode !== "pitchMatch"
        ) {
          // pitchMatch may still show prog bar via renderPianoControls
        }
        if (hasProgData && (profile.autoPiano || st.exercise?.audio?.piano) && !progShown) {
          local.push("has progressions + piano but prog bar hidden");
        }
        if (!profile.showPitch && profile.mode !== "weekPlan" && !modeHasContent) {
          local.push("non-pitch mode missing mode UI");
        }
        if (profile.mode === "weekPlan") {
          const cta = document.querySelector("#week-plan-cta");
          if (cta?.hidden && !modeHasContent) local.push("weekPlan missing CTA/mode");
        }
        if (!document.querySelector("#btn-practice-start")) local.push("no Start");
        if (!(document.querySelector("#ex-title")?.textContent || "").trim()) {
          local.push("empty title");
        }

        // Live Start contract
        if (profile.mode !== "weekPlan") {
          const a = document.querySelector("#chk-auto-piano");
          if (a) a.checked = true;
          document.querySelector("#btn-practice-start")?.click();
          await new Promise((r) => setTimeout(r, 420));
          const live = !!VTApp.getState().practiceLive;
          const stopVis = !document.querySelector("#btn-practice-stop")?.hidden;
          if (!live && !stopVis) local.push("Start did not go live");
          if (wantsSound && (live || stopVis)) {
            await new Promise((r) => setTimeout(r, 180));
            const peak = VTPiano.outputPeak?.() || 0;
            const voices = VTPiano.playing?.length || 0;
            const loop = !!VTPiano.loopActive;
            if (!loop && voices === 0 && peak < 0.002) {
              local.push(`expected sound but silent peak=${peak.toFixed(4)}`);
            }
          }
          if (stopVis) document.querySelector("#btn-practice-stop")?.click();
          await new Promise((r) => setTimeout(r, 60));
          VTPiano.stopAll?.();
        }

        summary.push({
          id: ex.id,
          mode: profile.mode,
          showPitch: profile.showPitch,
          showHold: profile.showHold,
          autoPiano: profile.autoPiano,
          wantsSound,
          pitchVisible,
          progShown,
          pianoShown,
          modeHasContent
        });
        if (local.length) issues.push({ id: ex.id, mode: profile.mode, issues: local });
      }

      return { total: all.length, issueCount: issues.length, issues, summary, modeIds };
    });

    if (report.issueCount) {
      console.log("FEATURE ISSUES", JSON.stringify(report.issues, null, 2));
    }
    expect(report.total).toBeGreaterThanOrEqual(36);
    expect(report.modeIds.length).toBeGreaterThanOrEqual(30);
    expect(
      report.issueCount,
      report.issues.map((i) => `${i.id}: ${i.issues.join("; ")}`).join("\n")
    ).toBe(0);
  });

  test("snapshot catalog ids still covered by live exercises", async ({ page }) => {
    await boot(page);
    const live = await page.evaluate(() =>
      [...VT_EXERCISES.vocal, ...VT_EXERCISES.singing].map((e) => e.id).sort()
    );
    for (const id of snap.exerciseIds) {
      expect(live, `missing ${id}`).toContain(id);
    }
  });
});
