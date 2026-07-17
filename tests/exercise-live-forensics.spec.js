/**
 * Headed live exercise forensics — visible mouse, mic, Space hold/release,
 * silence count gate, 10s play with per-second screenshots + indexed report.
 *
 * Always headed (never headless). Pink cursor overlay.
 *
 * Env:
 *   SLOWMO=50 (default for this long suite)
 *   LIVE_SECS=10
 *   FORENSICS_LIMIT / FORENSICS_IDS
 *
 * Artifacts:
 *   qa/screenshots/exercise-ui/{id}/*.png
 *   qa/geometry/exercise-ui-report.json
 *   docs/24-LIVE-EXERCISE-FORENSICS.md
 */
const { test, expect } = require("@playwright/test");
const path = require("path");
const {
  SHOT_ROOT,
  shot,
  styleSnapshot,
  hoverFeedback,
  writeReport,
  writeMarkdownReport,
  ensureDir,
  realHover,
  realClick,
  realDragX,
  practiceProbe,
  isSoundGated,
  isAirHoldMode,
  isWallClockPhase,
  soundProgress,
  scrollIntoView
} = require("./helpers/ui-forensics");
const { boot, openExercise } = require("./helpers/e2e");

const SLOWMO = Number(process.env.SLOWMO || 50) || 50;
const LIVE_SECS = Math.max(3, Number(process.env.LIVE_SECS || 10) || 10);

test.use({
  headless: false,
  viewport: { width: 1280, height: 800 },
  launchOptions: {
    slowMo: SLOWMO,
    args: ["--start-maximized"]
  }
});

test.describe.configure({ mode: "serial" });

async function dismissLeaveModal(page) {
  const covering = await page.evaluate(() => {
    const m = document.getElementById("leave-modal");
    if (!m) return false;
    const st = getComputedStyle(m);
    if (m.hidden || st.display === "none") {
      const top = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
      return top?.id === "leave-modal" || !!top?.closest?.("#leave-modal");
    }
    return true;
  });
  if (!covering) return false;
  if (await page.locator("#leave-discard").isVisible().catch(() => false)) {
    await page.locator("#leave-discard").click({ force: true }).catch(() => {});
  } else {
    await page.keyboard.press("Escape").catch(() => {});
  }
  await page.evaluate(() => {
    const m = document.getElementById("leave-modal");
    if (!m) return;
    m.hidden = true;
    m.classList.remove("open", "active", "show");
    m.style.display = "none";
  });
  await page.waitForTimeout(80);
  return true;
}

async function ensureCursor(page) {
  page.setDefaultTimeout(45000);
  await page.addStyleTag({
    content: `
      #vt-forensics-cursor {
        position: fixed; z-index: 2147483647; width: 18px; height: 18px;
        margin: -9px 0 0 -9px; border-radius: 50%;
        background: radial-gradient(circle at 35% 35%, #fff 0 18%, #ff2d55 22% 100%);
        box-shadow: 0 0 0 2px #fff, 0 0 12px 3px rgba(255,45,85,.85);
        pointer-events: none; left: 0; top: 0;
      }
    `
  });
  await page.evaluate(() => {
    if (document.getElementById("vt-forensics-cursor")) return;
    const d = document.createElement("div");
    d.id = "vt-forensics-cursor";
    document.documentElement.appendChild(d);
    window.addEventListener(
      "mousemove",
      (e) => {
        d.style.left = e.clientX + "px";
        d.style.top = e.clientY + "px";
      },
      true
    );
  });
  await page.mouse.move(30, 30);
  await page.waitForTimeout(80);
  await page.mouse.move(500, 200, { steps: 18 });
  await page.waitForTimeout(60);
}

function pushImg(entry, file, action, expected, verdict) {
  entry.images.push({ file, action, expected, verdict });
}

function note(entry, text) {
  entry.forensicNotes.push(text);
}

test("headed live forensics: mouse, mic, Space, 10s play, image index", async ({ page }) => {
  test.setTimeout(3_600_000);
  ensureDir(SHOT_ROOT);
  await boot(page, { lang: "es", tourDone: true, mic: "silent" });
  await ensureCursor(page);

  let catalog = await page.evaluate(() => {
    const v = (window.VT_EXERCISES?.vocal || []).map((e) => ({
      id: e.id,
      track: "vocal",
      number: e.number,
      title: e.title
    }));
    const s = (window.VT_EXERCISES?.singing || []).map((e) => ({
      id: e.id,
      track: "singing",
      number: e.number,
      title: e.title
    }));
    return [...v, ...s];
  });

  const onlyIds = (process.env.FORENSICS_IDS || "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
  if (onlyIds.length) catalog = catalog.filter((e) => onlyIds.includes(e.id));
  const limit = Number(process.env.FORENSICS_LIMIT || 0);
  if (limit > 0) catalog = catalog.slice(0, limit);

  expect(catalog.length).toBeGreaterThanOrEqual(onlyIds.length || limit ? 1 : 36);

  const report = {
    generatedAt: new Date().toISOString(),
    base: process.env.BASE_URL || "http://127.0.0.1:8765",
    mode: "headed-live-forensics",
    liveSeconds: LIVE_SECS,
    exercises: [],
    summary: {
      total: 0,
      withIssues: 0,
      issues: [],
      metrics: {
        hoverStartOk: 0,
        micDragOk: 0,
        liveOk: 0,
        silenceGateOk: 0,
        silenceGateN: 0,
        spaceLongOk: 0,
        spaceShortOk: 0,
        liveSecondsCaptured: 0
      }
    }
  };

  for (const ex of catalog) {
    const entry = {
      id: ex.id,
      track: ex.track,
      number: ex.number,
      title: ex.title,
      profile: null,
      actions: {},
      images: [],
      forensicNotes: [],
      issues: []
    };
    ensureDir(path.join(SHOT_ROOT, ex.id));
    const rel = (name) => path.join(ex.id, name);
    const shotF = async (name, action, expected, verdict) => {
      await shot(page, rel(name));
      pushImg(entry, `${ex.id}/${name}`, action, expected, verdict);
    };

    try {
      await dismissLeaveModal(page);
      await page.evaluate(() => {
        try {
          window.VTApp?.stopPractice?.();
        } catch {
          /* ignore */
        }
      });
      await dismissLeaveModal(page);
      await openExercise(page, ex.id);
      await page.waitForTimeout(120);
      await dismissLeaveModal(page);
      await page.evaluate(() => {
        window.VTApp?.fitHighwayToViewport?.();
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(60);

      entry.profile = await page.evaluate(() => {
        const st = window.VTApp?.getState?.();
        const p = st?.exercise ? window.VTApp.getProfile?.(st.exercise) : null;
        return p
          ? {
              mode: p.mode,
              showPitch: !!p.showPitch,
              showHold: !!p.showHold,
              allowManualSound: p.allowManualSound !== false
            }
          : null;
      });
      const mode = entry.profile?.mode || "";
      const soundGated = isSoundGated(mode);
      const airHold = isAirHoldMode(mode);
      const wallClock = isWallClockPhase(mode);
      note(
        entry,
        `Profile mode=${mode} showPitch=${!!entry.profile?.showPitch} soundGated=${soundGated} airHold=${airHold} wallClockPhase=${wallClock} allowManual=${entry.profile?.allowManualSound !== false}`
      );

      // --- 00 open ---
      await shotF(
        "00_open.png",
        "Open exercise",
        "Stage visible, Start hit-testable (except weekPlan), folds collapsed",
        "captured open state"
      );
      const start0 = await styleSnapshot(page, "#btn-practice-start");
      if (!start0?.visible && mode !== "weekPlan") {
        entry.issues.push({ code: "hidden_cta", sev: "P0", msg: "Start not visible" });
      }
      if (start0?.visible && !start0.hitSelf) {
        entry.issues.push({
          code: "hit_mismatch",
          sev: "P0",
          msg: "Start center not hit-testable",
          hit: start0.hitTop
        });
      }

      // --- 01 hover Start (before/after) ---
      if (start0?.visible) {
        await shotF(
          "01_hover_start_before.png",
          "Before hover Start",
          "Resting CTA style",
          "baseline"
        );
        const b = await styleSnapshot(page, "#btn-practice-start");
        await realHover(page, "#btn-practice-start", { steps: 16 });
        await page.waitForTimeout(90);
        const a = await styleSnapshot(page, "#btn-practice-start");
        await shotF(
          "01_hover_start_after.png",
          "After mouse.move onto Start",
          "brightness/glow/lift; hitSelf Start",
          hoverFeedback(b, a).ok ? "PASS hover feedback" : "FAIL no style change"
        );
        const hf = hoverFeedback(b, a);
        entry.actions.hoverStart = hf;
        if (hf.ok) report.summary.metrics.hoverStartOk++;
        if (!hf.ok) {
          entry.issues.push({
            code: "no_hover_style",
            sev: "P2",
            msg: "Start hover no style feedback"
          });
        }
        if (!hf.hitSelfAfter) {
          entry.issues.push({
            code: "hit_mismatch_hover",
            sev: "P0",
            msg: "Start not hit-testable under hover"
          });
        }
        await page.mouse.move(12, 12, { steps: 6 });
      }

      // --- 02 mic function: hover + drag ---
      if (await page.locator("#mic-sensitivity").isVisible().catch(() => false)) {
        await shotF(
          "02_mic_before.png",
          "Mic before drag",
          "Range interactive; value readable",
          "baseline mic"
        );
        const v0 = await page.evaluate(
          () => document.querySelector("#mic-sensitivity")?.value
        );
        await realHover(page, "#mic-sensitivity", { steps: 12 });
        await realDragX(page, "#mic-sensitivity", -50);
        await page.waitForTimeout(80);
        const v1 = await page.evaluate(
          () => document.querySelector("#mic-sensitivity")?.value
        );
        await shotF(
          "02_mic_after_drag.png",
          "Mic after mouse drag −50px",
          "value changes from drag",
          String(v0) !== String(v1)
            ? `PASS ${v0}→${v1}`
            : `FAIL value stuck ${v0}`
        );
        await realDragX(page, "#mic-sensitivity", 50).catch(() => {});
        entry.actions.mic = {
          before: v0,
          afterDrag: v1,
          changed: String(v0) !== String(v1)
        };
        if (entry.actions.mic.changed) report.summary.metrics.micDragOk++;
        else {
          entry.issues.push({
            code: "mic_drag_noop",
            sev: "P1",
            msg: "Mic sensitivity drag did not change value"
          });
        }
        note(entry, `Mic drag ${v0}→${v1} (restored)`);
      }

      // --- 03 highway / pitch chrome snapshot if present ---
      if (entry.profile?.showPitch) {
        await shotF(
          "03_highway_open.png",
          "Pitch highway / piano chrome",
          "Canvas or pitch block visible for showPitch profile",
          entry.profile.showPitch ? "pitch profile active" : "n/a"
        );
        for (const pid of ["btn-oct-up", "btn-oct-down", "chk-one-note", "btn-toggle-piano"]) {
          if (await page.locator(`#${pid}`).isVisible().catch(() => false)) {
            await realHover(page, `#${pid}`, { steps: 8 });
            if (pid.startsWith("btn-oct")) {
              await realClick(page, `#${pid}`, { steps: 6 });
              await page.waitForTimeout(40);
            }
          }
        }
      }

      // --- weekPlan short path ---
      if (mode === "weekPlan") {
        await shotF("04_week_plan.png", "Week plan UI", "Plan controls visible", "N/A live");
        note(entry, "weekPlan: skip live/Space/silence gate");
      } else if (start0?.visible) {
        // --- 04 Start live ---
        await shotF(
          "04_start_before.png",
          "Before Start click",
          "Ready state",
          "about to start"
        );
        await realClick(page, "#btn-practice-start", { steps: 14, delayMs: 40 });
        await page.waitForTimeout(700);
        let probe = await practiceProbe(page);
        await shotF(
          "04_start_after.png",
          "After Start (live)",
          "Stop visible; status En vivo/live",
          probe.live ? `PASS live status=${probe.status}` : "FAIL not live"
        );
        entry.actions.start = { live: probe.live, status: probe.status };
        if (!probe.live) {
          entry.issues.push({
            code: "start_not_live",
            sev: "P1",
            msg: "Start did not enter live"
          });
        } else {
          report.summary.metrics.liveOk++;

          // --- 05 SILENCE GATE (2s): sound progress must not free-run ---
          // Wall-clock [data-remain] is ALLOWED to tick — not a silence bug.
          const silenceBefore = await practiceProbe(page);
          await shotF(
            "05_silence_before.png",
            "Silence gate t=0 (silent mic, no Space)",
            airHold || soundGated
              ? "hold/progress stays ~0 without air/Space"
              : wallClock
                ? "phase timer may tick; not sound-count"
                : "stable live",
            `hold=${silenceBefore.holdVal} remain=${silenceBefore.remainSec} engHold=${silenceBefore.engHoldSec}`
          );
          await page.waitForTimeout(2000);
          const silenceAfter = await practiceProbe(page);
          await shotF(
            "05_silence_after_2s.png",
            "Silence gate t=2s still silent",
            airHold || soundGated ? "hold/progress still ~0" : "stable live",
            `hold=${silenceAfter.holdVal} remain=${silenceAfter.remainSec} live=${silenceAfter.live}`
          );

          let silenceOk = true;
          const p0 = soundProgress(silenceBefore);
          const p1 = soundProgress(silenceAfter);
          // Strict: air-hold modes (SH / breath S) — data-h hold must stay ~0
          if (airHold) {
            const h0 = silenceBefore.holdVal ?? 0;
            const h1 = silenceAfter.holdVal ?? 0;
            silenceOk = h1 <= 0.35 && h1 <= h0 + 0.2 && silenceAfter.live;
            if (!silenceOk) {
              entry.issues.push({
                code: "silence_auto_count",
                sev: "P0",
                msg: `Air-hold mode advanced on silence: hold ${h0}→${h1}`
              });
            }
          } else if (soundGated && p0 != null && p1 != null) {
            // Progress proxy (not remainSec) must not jump > 0.5
            silenceOk = p1 <= p0 + 0.5 && silenceAfter.live;
            if (!silenceOk) {
              entry.issues.push({
                code: "silence_auto_count",
                sev: "P0",
                msg: `Sound-gated progress advanced on silence: ${p0}→${p1}`
              });
            }
          } else if (!silenceAfter.live) {
            silenceOk = false;
            entry.issues.push({
              code: "silence_dropped_live",
              sev: "P0",
              msg: "Left live during silence gate"
            });
          }
          entry.actions.silenceGate = {
            soundGated,
            airHold,
            wallClock,
            holdBefore: silenceBefore.holdVal,
            holdAfter: silenceAfter.holdVal,
            remainBefore: silenceBefore.remainSec,
            remainAfter: silenceAfter.remainSec,
            progressBefore: p0,
            progressAfter: p1,
            live: silenceAfter.live,
            ok: silenceOk
          };
          report.summary.metrics.silenceGateN++;
          if (silenceOk) report.summary.metrics.silenceGateOk++;
          note(
            entry,
            `Silence 2s: airHold=${airHold} gated=${soundGated} hold ${silenceBefore.holdVal}→${silenceAfter.holdVal} remain ${silenceBefore.remainSec}→${silenceAfter.remainSec} progress ${p0}→${p1} ${silenceOk ? "PASS" : "FAIL"}`
          );

          // --- 06 SPACE long hold + short release ---
          await page.evaluate(() => {
            document.querySelector("#btn-practice-stop")?.focus();
          });
          await page.waitForTimeout(40);
          const sp0 = await practiceProbe(page);
          await shotF(
            "06_space_long_before.png",
            "Before Space long-hold (Stop focused)",
            "Space must NOT activate Stop; may set is-manual",
            `focus=${sp0.focusedId}`
          );
          await page.keyboard.down("Space");
          await page.waitForTimeout(1100);
          const spMid = await practiceProbe(page);
          await shotF(
            "06_space_long_hold.png",
            "Space held ~1.1s",
            "Still live; assist active if allowManualSound",
            `live=${spMid.live} manual=${spMid.isManual} hold=${spMid.holdVal}`
          );
          // short letting go
          await page.keyboard.up("Space");
          await page.waitForTimeout(180);
          const spAfter = await practiceProbe(page);
          await shotF(
            "06_space_long_release.png",
            "Short release after long hold",
            "Still live; grace may keep assist briefly",
            `live=${spAfter.live} manual=${spAfter.isManual}`
          );
          const longOk = spMid.live && spAfter.live;
          if (!longOk) {
            entry.issues.push({
              code: "space_stopped_practice",
              sev: "P0",
              msg: "Long Space hold/release stopped practice"
            });
          } else report.summary.metrics.spaceLongOk++;

          // Product: Space assist off on pure pitch highway; on for air modes (incl. breathS+pitch)
          const spaceAllowed = !!spMid.spaceAssistAllowed || !!sp0.spaceAssistAllowed;
          if (spaceAllowed) {
            if (!spMid.isManual && !spMid.manualSound) {
              entry.issues.push({
                code: "space_no_manual_flag",
                sev: "P1",
                msg: "Space hold did not set is-manual / engine manualSound when assist allowed"
              });
            }
          } else {
            if (spMid.isManual || spMid.manualSound) {
              entry.issues.push({
                code: "space_manual_on_highway",
                sev: "P1",
                msg: "Space set manual assist on pure pitch highway (product forbids)"
              });
            }
            note(entry, "Space assist disabled on pure pitch highway (product)");
          }

          // Air-hold modes (SH / breath S): Space must advance hold counter
          if (airHold) {
            if (!spaceAllowed) {
              entry.issues.push({
                code: "space_blocked_air_mode",
                sev: "P0",
                msg: "Air-hold mode has Space assist blocked (showPitch/manual gate bug)"
              });
            } else {
              const midH = spMid.holdVal ?? 0;
              if (midH < 0.45) {
                entry.issues.push({
                  code: "space_no_air_progress",
                  sev: "P0",
                  msg: `SH/breath Space hold did not advance count (hold=${midH})`
                });
              }
            }
          }

          // --- 07 SPACE short press (tap) + short release ---
          await shotF(
            "07_space_short_before.png",
            "Before short Space tap",
            "Quick down/up assist pulse",
            "ready"
          );
          await page.keyboard.down("Space");
          await page.waitForTimeout(200);
          const spTap = await practiceProbe(page);
          await shotF(
            "07_space_short_hold.png",
            "Space short hold 200ms",
            "Still live; short press still prevents button activation",
            `live=${spTap.live} manual=${spTap.isManual}`
          );
          await page.keyboard.up("Space");
          await page.waitForTimeout(120);
          const spTapAfter = await practiceProbe(page);
          await shotF(
            "07_space_short_release.png",
            "After short Space release",
            "Still live",
            `live=${spTapAfter.live}`
          );
          const shortOk = spTap.live && spTapAfter.live;
          if (!shortOk) {
            entry.issues.push({
              code: "space_short_stopped",
              sev: "P0",
              msg: "Short Space pulse stopped practice"
            });
          } else report.summary.metrics.spaceShortOk++;

          entry.actions.space = {
            spaceAssistAllowed: spaceAllowed,
            longHold: {
              didNotStop: longOk,
              midManual: spMid.isManual,
              midManualSound: spMid.manualSound,
              midHold: spMid.holdVal,
              afterHold: spAfter.holdVal
            },
            shortPulse: {
              didNotStop: shortOk,
              midManual: spTap.isManual
            }
          };
          note(
            entry,
            `Space long: live mid/after=${spMid.live}/${spAfter.live} manualChip=${spMid.isManual} engManual=${spMid.manualSound} hold=${spMid.holdVal}; short tap live=${spTap.live}; assistAllowed=${spaceAllowed}`
          );

          // --- 08 LIVE 10s: every second before + after shot + probe ---
          entry.actions.liveTimeline = [];
          for (let sec = 0; sec < LIVE_SECS; sec++) {
            const pBefore = await practiceProbe(page);
            await shotF(
              `08_live_s${String(sec).padStart(2, "0")}_before.png`,
              `Live second ${sec} before tick`,
              "Still live; highway/mode UI updating",
              `hold=${pBefore.holdVal} status=${pBefore.status} manual=${pBefore.isManual}`
            );
            // Mid window: brief Space only on non-highway air-hold modes (a11y path)
            if (airHold && !entry.profile?.showPitch && sec % 3 === 1) {
              await page.keyboard.down("Space");
              await page.waitForTimeout(350);
              await page.keyboard.up("Space");
              await page.waitForTimeout(650);
            } else {
              await page.waitForTimeout(1000);
            }
            const pAfter = await practiceProbe(page);
            await shotF(
              `08_live_s${String(sec).padStart(2, "0")}_after.png`,
              `Live second ${sec} after tick`,
              "No crash; counters only advance with sound/Space if gated",
              `hold=${pAfter.holdVal} live=${pAfter.live}`
            );
            entry.actions.liveTimeline.push({
              sec,
              before: {
                hold: pBefore.holdVal,
                live: pBefore.live,
                manual: pBefore.isManual,
                status: pBefore.status
              },
              after: {
                hold: pAfter.holdVal,
                live: pAfter.live,
                manual: pAfter.isManual,
                status: pAfter.status
              }
            });
            report.summary.metrics.liveSecondsCaptured++;
            if (!pAfter.live) {
              entry.issues.push({
                code: "dropped_live",
                sev: "P0",
                msg: `Left live during second ${sec}`
              });
              break;
            }
          }

          // --- 09 Stop ---
          await realHover(page, "#btn-practice-stop", { steps: 10 });
          await shotF(
            "09_stop_hover.png",
            "Hover Stop",
            "Stop hit-testable",
            "hover stop"
          );
          await realClick(page, "#btn-practice-stop", { steps: 12, delayMs: 40 });
          await page.waitForTimeout(350);
          const post = await practiceProbe(page);
          const metricsOpen = await page.evaluate(
            () => !document.querySelector("#metrics-card")?.classList.contains("collapsed")
          );
          await shotF(
            "09_after_stop.png",
            "After Stop",
            "Not live; metrics often auto-open",
            `live=${post.live} metricsOpen=${metricsOpen}`
          );
          entry.actions.stop = { live: post.live, metricsOpen };
          if (post.live) {
            entry.issues.push({
              code: "stop_failed",
              sev: "P0",
              msg: "Still live after Stop"
            });
          }
          if (!metricsOpen) {
            entry.issues.push({
              code: "metrics_not_auto_open",
              sev: "P2",
              msg: "Metrics still collapsed after Stop"
            });
          }
        }
      }

      // --- 10 Back home ---
      await dismissLeaveModal(page);
      if (await page.locator("#btn-back-home").isVisible().catch(() => false)) {
        await page.evaluate(() => window.scrollTo(0, 0));
        await scrollIntoView(page, "#btn-back-home");
        await realHover(page, "#btn-back-home", { steps: 10 });
        await shotF("10_hover_back.png", "Hover Back", "Returns home on click", "hover");
        await realClick(page, "#btn-back-home", { steps: 10 });
        await page.waitForTimeout(100);
        await dismissLeaveModal(page);
        let onHome = await page.locator("#view-home").evaluate((el) =>
          el.classList.contains("active")
        );
        if (!onHome) {
          await page.evaluate(() => window.VTApp?.setView?.("home")).catch(() => {});
          await dismissLeaveModal(page);
          onHome = await page.locator("#view-home").evaluate((el) =>
            el.classList.contains("active")
          );
        }
        entry.actions.backHome = { onHome };
        if (!onHome) {
          entry.issues.push({ code: "back_fail", sev: "P0", msg: "Back did not return home" });
        }
      }
    } catch (err) {
      entry.issues.push({
        code: "exception",
        sev: "P0",
        msg: String(err.message || err).slice(0, 200)
      });
      try {
        await shotF("99_error.png", "Exception", "Recoverable", String(err.message || err).slice(0, 80));
      } catch {
        /* ignore */
      }
      await page.keyboard.up("Space").catch(() => {});
      await dismissLeaveModal(page);
      await page.evaluate(() => window.VTApp?.setView?.("home")).catch(() => {});
    }

    report.exercises.push(entry);
    report.summary.total++;
    if (entry.issues.length) {
      report.summary.withIssues++;
      for (const iss of entry.issues) {
        report.summary.issues.push({ exerciseId: ex.id, ...iss });
      }
    }
  }

  const jsonPath = writeReport(report);
  const mdPath = writeMarkdownReport(report);
  const p0 = report.summary.issues.filter((i) => i.sev === "P0");
  expect(
    p0,
    `P0 issues:\n${JSON.stringify(p0, null, 2)}\nJSON: ${jsonPath}\nMD: ${mdPath}`
  ).toEqual([]);
  if (!process.env.FORENSICS_LIMIT && !process.env.FORENSICS_IDS) {
    expect(report.summary.total).toBeGreaterThanOrEqual(36);
  } else {
    expect(report.summary.total).toBeGreaterThanOrEqual(1);
  }
});
