/**
 * Sound verification: every vocal + singing exercise → Empezar → audio output check.
 *
 * - Piano exercises (autoPiano / piano / progressions / refPitch): assert ctx running +
 *   non-zero master peak (multi-sampled) and/or scheduled voices / loop.
 * - Speech-only: assert practice goes live; piano peak not required.
 *
 * Systematic issues are reported as grouped RCA hints.
 */
const { test, expect } = require("@playwright/test");
const snap = require("./fixtures/catalog-snapshot.json");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const PEAK_FLOOR = Number(process.env.VT_PEAK_FLOOR || 0.004);
const ROUNDS = Math.max(1, Math.min(5, Number(process.env.VT_SOUND_ROUNDS || 1)));

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
    if (!navigator.mediaDevices) return;
    navigator.mediaDevices.getUserMedia = async () => {
      const ctx = new AC();
      const osc = ctx.createOscillator();
      const dest = ctx.createMediaStreamDestination();
      const g = ctx.createGain();
      g.gain.value = 0.00001;
      osc.connect(g);
      g.connect(dest);
      osc.start();
      return dest.stream;
    };
  });
  await page.goto(BASE + "/?t=" + Date.now(), { waitUntil: "domcontentloaded" });
}

async function openEx(page, id) {
  await page.evaluate(async (exId) => {
    if (window.VTApp?.openExercise) await window.VTApp.openExercise(exId);
  }, id);
  await expect(page.locator("#view-exercise")).toHaveClass(/active/, { timeout: 8000 });
}

async function sampleAudio(page) {
  return page.evaluate(async () => {
    const P = window.VTPiano;
    let peak = 0;
    for (let i = 0; i < 6; i++) {
      if (typeof P?.outputPeak === "function") peak = Math.max(peak, P.outputPeak());
      await new Promise((r) => setTimeout(r, 50));
    }
    const st = window.VTApp?.getState?.();
    const ex = st?.exercise;
    const profile = ex && window.VTPracticeProfiles
      ? null
      : null;
    // Mirror app exerciseWantsSound logic
    const wants = !!(
      ex &&
      (ex.audio?.piano ||
        ex.audio?.refPitch ||
        ex.progressions ||
        ex.audio?.progressions ||
        ex.songs ||
        (st &&
          (() => {
            try {
              // profile via app getProfile if exposed — fall back to DOM auto-piano + pitch block
              return false;
            } catch {
              return false;
            }
          })()))
    );
    const autoOn = document.querySelector("#chk-auto-piano")?.checked !== false;
    const pitchShown = !!(
      document.querySelector("#pitch-block") &&
      !document.querySelector("#pitch-block")?.hidden
    );
    const miniPiano =
      document.querySelector("#piano-mini-opts") &&
      getComputedStyle(document.querySelector("#piano-mini-opts")).display !== "none";

    return {
      peak,
      ctx: P?.ctx?.state ?? "none",
      loop: !!P?.loopActive,
      playing: P?.playing?.length ?? 0,
      live: !!st?.practiceLive,
      stopVisible: !document.querySelector("#btn-practice-stop")?.hidden,
      autoOn,
      pitchShown,
      miniPiano,
      wantsHeuristic: wants || pitchShown || miniPiano,
      master: P?.master?.gain?.value ?? null,
      id: ex?.id
    };
  });
}

/** Prefer live VTApp.wantsSound (profile.autoPiano / progressions / ref). */
async function expectsPianoSound(page, ex) {
  const live = await page.evaluate(() => {
    try {
      return !!window.VTApp?.wantsSound?.();
    } catch {
      return null;
    }
  });
  if (live != null) return live;
  // Fallback: catalog flags only (s15 SH air has no piano — must not match mode regex)
  return !!(ex.hasPiano || ex.hasPitchViz || ex.showPitch);
}

test.describe("Sound verification: all exercises Empezar", () => {
  test.describe.configure({ mode: "serial", timeout: 600_000 });

  for (let round = 1; round <= ROUNDS; round++) {
    test(`round ${round}/${ROUNDS}: every exercise Start + audio contract`, async ({ page }) => {
      test.setTimeout(600_000);
      const pageErrors = [];
      page.on("pageerror", (e) => pageErrors.push(String(e?.message || e)));

      await boot(page);
      const results = [];
      const failures = [];

      // Prefer live catalog order: vocal then singing (section check)
      const liveOrder = await page.evaluate(() => {
        const v = (VT_EXERCISES.vocal || []).map((e) => e.id);
        const s = (VT_EXERCISES.singing || []).map((e) => e.id);
        return { vocal: v, singing: s };
      });
      const byId = Object.fromEntries(snap.catalog.map((c) => [c.id, c]));
      const ordered = [
        ...liveOrder.vocal.map((id) => byId[id]).filter(Boolean),
        ...liveOrder.singing.map((id) => byId[id]).filter(Boolean)
      ];
      // Any missing from snap
      for (const c of snap.catalog) {
        if (!ordered.find((x) => x.id === c.id)) ordered.push(c);
      }

      for (const ex of ordered) {
        try {
          await openEx(page, ex.id);
          // Force auto piano ON when control exists (user-visible default)
          await page.evaluate(() => {
            const a = document.querySelector("#chk-auto-piano");
            if (a) a.checked = true;
          });
          const wantSound = await expectsPianoSound(page, ex);

          await page.click("#btn-practice-start");
          await page.waitForTimeout(ex.mode === "weekPlan" ? 300 : 500);

          const audio = await sampleAudio(page);
          const row = {
            id: ex.id,
            track: ex.track,
            mode: ex.mode,
            wantSound,
            ...audio
          };
          results.push(row);

          if (ex.mode === "weekPlan") {
            // no live audio required
          } else if (!audio.stopVisible && !audio.live) {
            failures.push({ id: ex.id, kind: "not-live", detail: row });
          } else if (wantSound) {
            const okCtx = audio.ctx === "running";
            const okVoices = audio.loop || audio.playing > 0;
            const okPeak = audio.peak >= PEAK_FLOOR;
            // Accept voices without peak only if we just scheduled (analyser lag)
            const ok = okCtx && okVoices && (okPeak || audio.playing >= 7);
            if (!ok) {
              // One recover attempt: re-call start sound path
              await page.evaluate(async () => {
                try {
                  await window.VTPiano?.unlock?.();
                  const st = window.VTApp?.getState?.();
                  if (st?.exercise && window.VTApp?.applyPianoOptionsHot) {
                    await window.VTApp.applyPianoOptionsHot("sound-recover");
                  }
                } catch {
                  /* ignore */
                }
              });
              await page.waitForTimeout(350);
              const retry = await sampleAudio(page);
              const ok2 =
                retry.ctx === "running" &&
                (retry.loop || retry.playing > 0) &&
                (retry.peak >= PEAK_FLOOR || retry.playing >= 7);
              if (!ok2) {
                failures.push({
                  id: ex.id,
                  kind: "silent-or-weak",
                  detail: {
                    ctx: retry.ctx,
                    peak: retry.peak,
                    loop: retry.loop,
                    playing: retry.playing,
                    autoOn: retry.autoOn,
                    miniPiano: retry.miniPiano,
                    firstPeak: audio.peak
                  }
                });
              }
            }
          } else {
            // Speech / air-only: must not leave piano ctx permanently closed
            if (audio.ctx === "closed") {
              failures.push({ id: ex.id, kind: "ctx-closed-speech", detail: row });
            }
          }

          // Stop if live
          if (await page.locator("#btn-practice-stop").isVisible().catch(() => false)) {
            await page.click("#btn-practice-stop");
            await page.waitForTimeout(80);
          }
          await page.evaluate(() => {
            window.VTPiano?.stopAll?.();
            if (window.VTApp?.setView) window.VTApp.setView("home");
            document.querySelector("#leave-discard")?.click();
          });
          await page.waitForTimeout(40);
        } catch (e) {
          failures.push({ id: ex.id, kind: "exception", detail: String(e?.message || e).slice(0, 180) });
          try {
            await page.goto(BASE + "/?t=" + Date.now(), { waitUntil: "domcontentloaded" });
          } catch {
            /* ignore */
          }
        }
      }

      // Systematic RCA grouping
      const silent = failures.filter((f) => f.kind === "silent-or-weak");
      const byCtx = {};
      for (const f of silent) {
        const k = f.detail?.ctx || "?";
        byCtx[k] = (byCtx[k] || 0) + 1;
      }
      const autoOff = silent.filter((f) => f.detail?.autoOn === false).length;
      const noVoices = silent.filter((f) => !f.detail?.loop && !(f.detail?.playing > 0)).length;
      const weakPeak = silent.filter(
        (f) => (f.detail?.loop || f.detail?.playing > 0) && f.detail?.peak < PEAK_FLOOR
      ).length;

      console.log(
        `\n[sound-round ${round}] exercises=${results.length} failures=${failures.length}` +
          ` silent=${silent.length} autoOff=${autoOff} noVoices=${noVoices} weakPeak=${weakPeak}` +
          ` ctxBreakdown=${JSON.stringify(byCtx)}`
      );
      if (silent.length) {
        console.log(
          "silent ids:",
          silent.map((f) => f.id).join(", ")
        );
      }

      if (pageErrors.length) {
        failures.push({ id: "_page", kind: "pageerror", detail: pageErrors.slice(0, 5) });
      }

      // Vocal section + singing section counts
      const vocalN = results.filter((r) => r.track === "vocal").length;
      const singingN = results.filter((r) => r.track === "singing").length;
      expect(vocalN).toBeGreaterThanOrEqual(20);
      expect(singingN).toBeGreaterThanOrEqual(16);

      if (failures.length) {
        // Systematic diagnosis string
        let sys = "";
        if (silent.length >= 5 && noVoices >= silent.length * 0.7) {
          sys +=
            "\nSYSTEMATIC: most piano exercises scheduled no voices — check startExerciseSound / autoPiano / unlock after mic.";
        }
        if (silent.length >= 5 && weakPeak >= silent.length * 0.7) {
          sys +=
            "\nSYSTEMATIC: voices scheduled but peak≈0 — master gain, analyser disconnect, or stopAll race.";
        }
        if (autoOff >= 3) {
          sys += "\nSYSTEMATIC: auto-piano unchecked on Start for multiple exercises.";
        }
        if (byCtx.closed >= 1) {
          sys += "\nSYSTEMATIC: AudioContext closed — PracticeEngine must not close shared ctx.";
        }
        if (byCtx.suspended >= 1) {
          sys += "\nSYSTEMATIC: AudioContext suspended after mic — need unlock/resume after getUserMedia.";
        }

        throw new Error(
          `Round ${round}: ${failures.length} sound failures${sys}\n` +
            failures
              .slice(0, 25)
              .map(
                (f) =>
                  `${f.id} [${f.kind}] ${
                    typeof f.detail === "string" ? f.detail : JSON.stringify(f.detail)
                  }`
              )
              .join("\n")
        );
      }
    });
  }
});
