/**
 * Forensic UI interactivity — REAL mouse path, click (down/up), drag, Space hold.
 * Screenshots: qa/screenshots/exercise-ui/{id}/
 * Report JSON: qa/geometry/exercise-ui-report.json
 *
 * Emulation (not CSS-only hover):
 *  - page.mouse.move({ steps }) into targets
 *  - page.mouse.down / up for press
 *  - page.mouse drag on mic slider
 *  - page.keyboard.down/up("Space") hold while live (focus on Stop)
 */
const { test, expect } = require("@playwright/test");
const path = require("path");
const {
  SHOT_ROOT,
  shot,
  styleSnapshot,
  hoverFeedback,
  writeReport,
  ensureDir,
  realHover,
  realClick,
  realDragX,
  spaceHold,
  practiceProbe,
  scrollIntoView
} = require("./helpers/ui-forensics");
const { boot, openExercise } = require("./helpers/e2e");

test.describe.configure({ mode: "serial" });

test("forensic UI matrix: real pointer + Space on all exercises", async ({ page }) => {
  test.setTimeout(900000);
  ensureDir(SHOT_ROOT);
  // headed if HEADED=1 (still works headless — real CDP mouse/keyboard events)
  await boot(page, { lang: "es", tourDone: true, mic: "silent" });

  const catalog = await page.evaluate(() => {
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
  expect(catalog.length).toBeGreaterThanOrEqual(36);

  const report = {
    generatedAt: new Date().toISOString(),
    base: process.env.BASE_URL || "http://127.0.0.1:8765",
    mode: "real-pointer-keyboard",
    exercises: [],
    summary: { total: 0, withIssues: 0, issues: [] }
  };

  // Park pointer top-left between exercises
  await page.mouse.move(4, 4);

  for (const ex of catalog) {
    const entry = {
      id: ex.id,
      track: ex.track,
      number: ex.number,
      title: ex.title,
      actions: {},
      issues: [],
      profile: null
    };
    const dir = path.join(SHOT_ROOT, ex.id);
    ensureDir(dir);
    const rel = (name) => path.join(ex.id, name);

    try {
      await openExercise(page, ex.id);
      await page.waitForTimeout(120);
      await page.evaluate(() => {
        window.VTApp?.fitHighwayToViewport?.();
        window.scrollTo(0, 0);
      });
      await page.waitForTimeout(80);
      await page.mouse.move(8, 8, { steps: 4 });

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

      // --- 00 open ---
      await shot(page, rel("00_open.png"));
      const start0 = await styleSnapshot(page, "#btn-practice-start");
      entry.actions.open = {
        title: await page.locator("#ex-title").textContent(),
        startVisible: !!start0?.visible,
        startHit: !!start0?.hitSelf,
        guideCollapsed: await page.locator(".guide-card").evaluate((el) =>
          el.classList.contains("collapsed")
        ),
        metricsCollapsed: await page.locator("#metrics-card").evaluate((el) =>
          el.classList.contains("collapsed")
        )
      };
      if (!start0?.visible && entry.profile?.mode !== "weekPlan") {
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

      entry.actions.chrome = await page.evaluate(() => {
        const focus = document.getElementById("mode-focus");
        const hud = document.getElementById("mode-hud");
        const canvas = document.getElementById("pitch-canvas");
        const pitchBlock = document.getElementById("pitch-block");
        return {
          modeFocusLive: focus?.classList.contains("mode-focus-live") && !focus.hidden,
          modeFocusKids: focus?.children?.length || 0,
          modeHudKids: hud?.children?.length || 0,
          pitchVisible:
            pitchBlock &&
            !pitchBlock.hidden &&
            canvas &&
            canvas.getBoundingClientRect().height > 0
        };
      });

      // --- 01 REAL mouse path hover Start ---
      if (start0?.visible) {
        await shot(page, rel("01_hover_start_before.png"));
        const beforeH = await styleSnapshot(page, "#btn-practice-start");
        const hover = await realHover(page, "#btn-practice-start", { steps: 16 });
        await page.waitForTimeout(120);
        const afterH = await styleSnapshot(page, "#btn-practice-start");
        await shot(page, rel("01_hover_start_after.png"));
        const hf = hoverFeedback(beforeH, afterH);
        entry.actions.hoverStart = {
          ...hf,
          pointer: hover,
          method: "mouse.move.steps",
          before: beforeH,
          after: afterH
        };
        if (!hf.ok) {
          entry.issues.push({
            code: "no_hover_style",
            sev: "P2",
            msg: "Start hover produced no style/cursor feedback"
          });
        }
        if (hf.layoutShift) {
          entry.issues.push({
            code: "layout_shift",
            sev: "P1",
            msg: "Start moved on hover (>3px)"
          });
        }
        if (!hf.hitSelfAfter) {
          entry.issues.push({
            code: "hit_mismatch_hover",
            sev: "P0",
            msg: "Start not hit-testable under hover"
          });
        }
        // Leave target so :hover clears
        await page.mouse.move(10, 10, { steps: 8 });
        await page.waitForTimeout(40);
      }

      // --- 02 REAL hover mic + drag slider ---
      const micHud = "#mic-sens-hud";
      const micInput = "#mic-sensitivity";
      if (await page.locator(micHud).isVisible().catch(() => false)) {
        await shot(page, rel("02_hover_mic_before.png"));
        const bMic = await styleSnapshot(page, micHud);
        await realHover(page, micInput, { steps: 12 }).catch(async () => {
          await realHover(page, micHud, { steps: 12 });
        });
        await page.waitForTimeout(80);
        const aMic = await styleSnapshot(page, micHud);
        await shot(page, rel("02_hover_mic_after.png"));

        const valBefore = await page.evaluate(
          () => document.querySelector("#mic-sensitivity")?.value ?? null
        );
        await shot(page, rel("02_drag_mic_before.png"));
        const drag = await realDragX(page, micInput, -48);
        await page.waitForTimeout(80);
        const valAfter = await page.evaluate(
          () => document.querySelector("#mic-sensitivity")?.value ?? null
        );
        await shot(page, rel("02_drag_mic_after.png"));
        // restore roughly
        await realDragX(page, micInput, 48).catch(() => {});

        entry.actions.hoverMic = {
          method: "mouse.move.steps",
          before: bMic,
          after: aMic,
          hitSelf: !!aMic?.hitSelf
        };
        entry.actions.dragMic = {
          method: "mouse.down+move+up",
          drag,
          valBefore,
          valAfter,
          changed: valBefore != null && valAfter != null && String(valBefore) !== String(valAfter)
        };
        if (aMic && !aMic.hitSelf && aMic.hitTop?.id !== "mic-sensitivity") {
          // hitTop on the range input is OK
          if (aMic.hitTop?.tag !== "INPUT") {
            entry.issues.push({
              code: "mic_hit_mismatch",
              sev: "P1",
              msg: "Mic HUD center not hit-testable",
              hit: aMic.hitTop
            });
          }
        }
        await page.mouse.move(10, 10, { steps: 6 });
      }

      // --- 03 guide: real click ---
      const guideBtnSel = "#btn-toggle-guide";
      if (await page.locator(guideBtnSel).isVisible().catch(() => false)) {
        await shot(page, rel("03_guide_before.png"));
        const collapsedBefore = await page.locator(".guide-card").evaluate((el) =>
          el.classList.contains("collapsed")
        );
        await realClick(page, guideBtnSel, { steps: 12 });
        await page.waitForTimeout(160);
        await shot(page, rel("03_guide_after.png"));
        const collapsedAfter = await page.locator(".guide-card").evaluate((el) =>
          el.classList.contains("collapsed")
        );
        const stepN = await page.evaluate(
          () => document.querySelectorAll("#ex-steps li").length
        );
        entry.actions.guideToggle = {
          method: "mouse.move+down+up",
          collapsedBefore,
          collapsedAfter,
          toggled: collapsedBefore !== collapsedAfter,
          stepN
        };
        if (collapsedBefore === collapsedAfter) {
          entry.issues.push({
            code: "no_expand",
            sev: "P0",
            msg: "Guide toggle did not change collapsed state"
          });
        }
        if (!collapsedAfter && stepN < 1 && entry.profile?.mode !== "weekPlan") {
          entry.issues.push({
            code: "empty_guide",
            sev: "P1",
            msg: "Guide open but no steps"
          });
        }
        if (!collapsedAfter) {
          await realClick(page, guideBtnSel, { steps: 8 });
          await page.waitForTimeout(80);
        }
        await page.mouse.move(10, 10, { steps: 4 });
      }

      // --- 04 metrics: real click ---
      const metBtnSel = "#btn-toggle-metrics";
      if (await page.locator(metBtnSel).isVisible().catch(() => false)) {
        await shot(page, rel("04_metrics_before.png"));
        const mBefore = await page.locator("#metrics-card").evaluate((el) =>
          el.classList.contains("collapsed")
        );
        await realClick(page, metBtnSel, { steps: 12 });
        await page.waitForTimeout(160);
        await shot(page, rel("04_metrics_after.png"));
        const mAfter = await page.locator("#metrics-card").evaluate((el) =>
          el.classList.contains("collapsed")
        );
        const fieldN = await page.evaluate(
          () =>
            document.querySelectorAll(
              "#metrics-form input, #metrics-form select, #metrics-form textarea"
            ).length
        );
        entry.actions.metricsToggle = {
          method: "scroll+mouse.click",
          collapsedBefore: mBefore,
          collapsedAfter: mAfter,
          toggled: mBefore !== mAfter,
          fieldN
        };
        if (mBefore === mAfter) {
          entry.issues.push({
            code: "no_metrics_toggle",
            sev: "P0",
            msg: "Metrics toggle no-op"
          });
        }
        if (!mAfter && fieldN < 1 && entry.profile?.mode !== "weekPlan") {
          entry.issues.push({
            code: "empty_metrics",
            sev: "P1",
            msg: "Metrics open but no fields"
          });
        }
        if (!mAfter) {
          await realClick(page, metBtnSel, { steps: 8 });
          await page.waitForTimeout(80);
        }
        await page.mouse.move(10, 10, { steps: 4 });
      }

      // --- 05 pitch: real hover octave ---
      if (entry.profile?.showPitch) {
        if (await page.locator("#btn-oct-up").isVisible().catch(() => false)) {
          await shot(page, rel("05_pitch_chrome_before.png"));
          const b = await styleSnapshot(page, "#btn-oct-up");
          await realHover(page, "#btn-oct-up", { steps: 12 });
          await page.waitForTimeout(70);
          const a = await styleSnapshot(page, "#btn-oct-up");
          await shot(page, rel("05_hover_oct_after.png"));
          entry.actions.hoverOct = {
            method: "mouse.move.steps",
            ...hoverFeedback(b, a)
          };
          await page.mouse.move(10, 10, { steps: 6 });
        }
        try {
          const hasOne = await page.evaluate(() => !!document.querySelector("#chk-one-note"));
          if (hasOne) {
            const before = await page.evaluate(
              () => document.querySelector("#chk-one-note")?.checked ?? null
            );
            await realHover(page, "#chk-one-note", { steps: 10 }).catch(() => {});
            await shot(page, rel("05_piano_opt_hover.png"));
            // click toggle then restore
            await realClick(page, "#chk-one-note", { steps: 8 }).catch(() => {});
            await page.waitForTimeout(50);
            const mid = await page.evaluate(
              () => document.querySelector("#chk-one-note")?.checked ?? null
            );
            if (mid !== before) {
              await realClick(page, "#chk-one-note", { steps: 6 }).catch(() => {});
            }
            entry.actions.oneNoteChecked = { before, mid, method: "mouse.click" };
            await page.mouse.move(10, 10, { steps: 4 });
          }
        } catch (pe) {
          entry.actions.pitchExtras = { error: String(pe.message || pe).slice(0, 100) };
        }
      }

      // --- 06 mode buttons: real hover + press ---
      try {
        const modeSel = await page.evaluate(() => {
          const b = document.querySelector(
            "#mode-focus button.btn, #mode-hud button.btn, #mode-focus button, #mode-hud button"
          );
          if (!b) return null;
          const r = b.getBoundingClientRect();
          if (r.width < 1 || r.height < 1) return null;
          if (b.id) return `#${CSS.escape(b.id)}`;
          // fallback: first button
          return null;
        });
        const hasModeBtn = await page.evaluate(() => {
          const b = document.querySelector(
            "#mode-focus button.btn, #mode-hud button.btn, #mode-focus button, #mode-hud button"
          );
          if (!b) return false;
          const r = b.getBoundingClientRect();
          return r.width > 0 && r.height > 0;
        });
        if (hasModeBtn) {
          const modeBtn = page.locator("#mode-focus button, #mode-hud button").first();
          await modeBtn.scrollIntoViewIfNeeded().catch(() => {});
          const labelBefore = await modeBtn.textContent().catch(() => "");
          await shot(page, rel("06_mode_btn_before.png"));
          const box = await modeBtn.boundingBox();
          if (box) {
            const cx = box.x + box.width / 2;
            const cy = box.y + box.height / 2;
            await page.mouse.move(cx - 20, cy, { steps: 8 });
            await page.mouse.move(cx, cy, { steps: 10 });
            await page.waitForTimeout(50);
            await shot(page, rel("06_mode_btn_hover.png"));
            await page.mouse.click(cx, cy, { delay: 40 });
            await page.waitForTimeout(100);
            await shot(page, rel("06_mode_btn_after_click.png"));
          }
          entry.actions.modeButton = {
            method: "scroll+mouse.click",
            label: labelBefore?.trim(),
            clicked: true,
            modeSel
          };
          await page.mouse.move(10, 10, { steps: 4 });
        }
      } catch (mbErr) {
        entry.actions.modeButton = { error: String(mbErr.message || mbErr).slice(0, 120) };
      }

      // --- 07 REAL click Start → Space hold → release → Stop ---
      if (entry.profile?.mode !== "weekPlan" && start0?.visible) {
        try {
          // real press on Start
          await shot(page, rel("07_start_press_before.png"));
          await realClick(page, "#btn-practice-start", { steps: 14, delayMs: 45 });
          await page.waitForTimeout(700);
          let probe = await practiceProbe(page);
          await shot(page, rel("07_after_start.png"));
          entry.actions.startPractice = {
            method: "mouse.move+down+up",
            live: probe.live,
            status: probe.status
          };

          if (probe.live) {
            // Focus Stop then Space-hold (must NOT activate Stop; may latch manual)
            await page.evaluate(() => {
              document.querySelector("#btn-practice-stop")?.focus();
            });
            await page.waitForTimeout(40);
            const beforeSpace = await practiceProbe(page);
            await shot(page, rel("07_space_before.png"));

            await page.keyboard.down("Space");
            await page.waitForTimeout(720);
            const midSpace = await practiceProbe(page);
            await shot(page, rel("07_space_hold.png"));

            await page.keyboard.up("Space");
            await page.waitForTimeout(120);
            const afterSpace = await practiceProbe(page);
            await shot(page, rel("07_space_after.png"));

            entry.actions.spaceHold = {
              method: "keyboard.down/up Space",
              focusedStop: beforeSpace.focusedId === "btn-practice-stop",
              before: {
                live: beforeSpace.live,
                isManual: beforeSpace.isManual,
                holdVal: beforeSpace.holdVal,
                status: beforeSpace.status
              },
              mid: {
                live: midSpace.live,
                isManual: midSpace.isManual,
                holdVal: midSpace.holdVal,
                status: midSpace.status,
                manualSound: midSpace.manualSound
              },
              after: {
                live: afterSpace.live,
                isManual: afterSpace.isManual,
                holdVal: afterSpace.holdVal,
                status: afterSpace.status
              },
              // P0: Space must not stop practice while Stop focused
              didNotStop: midSpace.live === true && afterSpace.live === true
            };

            if (!midSpace.live || !afterSpace.live) {
              entry.issues.push({
                code: "space_stopped_practice",
                sev: "P0",
                msg: "Space activated Stop or ended live while focused on Stop"
              });
            }

            // Optional soft signal: manual chip / hold advance when allowManualSound
            // Not all modes show is-manual or data-h — do not hard-fail

            // Stop via real mouse press
            await realClick(page, "#btn-practice-stop", { steps: 12, delayMs: 40 });
            await page.waitForTimeout(320);
            await shot(page, rel("07_after_stop.png"));
            const metricsOpen = await page.evaluate(
              () => !document.querySelector("#metrics-card")?.classList.contains("collapsed")
            );
            const post = await practiceProbe(page);
            entry.actions.stopPractice = {
              method: "mouse.move+down+up",
              metricsOpen,
              live: post.live
            };
            if (!metricsOpen) {
              entry.issues.push({
                code: "metrics_not_auto_open",
                sev: "P2",
                msg: "Metrics still collapsed after Stop"
              });
            }
            if (post.live) {
              entry.issues.push({
                code: "stop_failed",
                sev: "P0",
                msg: "Still live after Stop click"
              });
            }
          } else {
            entry.actions.startPractice = {
              method: "mouse.move+down+up",
              live: false,
              note: "did_not_go_live",
              status: probe.status
            };
            entry.issues.push({
              code: "start_not_live",
              sev: "P1",
              msg: "Start click did not enter live state"
            });
          }
        } catch (e) {
          entry.actions.startPractice = {
            method: "mouse.move+down+up",
            error: String(e.message || e)
          };
          entry.issues.push({
            code: "start_stop_error",
            sev: "P1",
            msg: String(e.message || e).slice(0, 160)
          });
          // ensure Space released
          await page.keyboard.up("Space").catch(() => {});
        }
      }

      // --- 08 back: scroll top, real hover + click ---
      if (await page.locator("#btn-back-home").isVisible().catch(() => false)) {
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          document.scrollingElement?.scrollTo?.(0, 0);
        });
        await page.waitForTimeout(60);
        await scrollIntoView(page, "#btn-back-home");
        const bBack = await styleSnapshot(page, "#btn-back-home");
        await realHover(page, "#btn-back-home", { steps: 12 });
        await page.waitForTimeout(60);
        const aBack = await styleSnapshot(page, "#btn-back-home");
        await shot(page, rel("08_hover_back.png"));
        entry.actions.hoverBack = {
          method: "mouse.move.steps",
          ...hoverFeedback(bBack, aBack)
        };
        // Hit mismatch on Back is P1 (overlay) only if not hitSelf after hover
        if (aBack && !aBack.hitSelf) {
          entry.issues.push({
            code: "back_hit_mismatch",
            sev: "P1",
            msg: "Back center not hit-testable",
            hit: aBack.hitTop
          });
        }
        await realClick(page, "#btn-back-home", { steps: 10 });
        await page.waitForTimeout(150);
        let onHome = await page.locator("#view-home").evaluate((el) =>
          el.classList.contains("active")
        );
        // One retry with direct click if mouse path still fails (document forensics)
        if (!onHome) {
          await page.locator("#btn-back-home").click({ timeout: 3000 }).catch(() => {});
          await page.waitForTimeout(100);
          onHome = await page.locator("#view-home").evaluate((el) =>
            el.classList.contains("active")
          );
          entry.actions.backHome = {
            method: "mouse.click then locator.retry",
            onHome,
            retried: true
          };
        } else {
          entry.actions.backHome = { method: "mouse.click", onHome };
        }
        if (!onHome) {
          entry.issues.push({ code: "back_fail", sev: "P0", msg: "Back did not return home" });
          await page.evaluate(() => window.VTApp?.setView?.("home")).catch(() => {});
        }
      }
    } catch (err) {
      entry.issues.push({
        code: "exception",
        sev: "P0",
        msg: String(err.message || err).slice(0, 200)
      });
      try {
        await shot(page, rel("99_error.png"));
      } catch {
        /* ignore */
      }
      await page.keyboard.up("Space").catch(() => {});
      await page
        .evaluate(() => {
          window.VTApp?.setView?.("home");
        })
        .catch(() => {});
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

  const out = writeReport(report);
  const p0 = report.summary.issues.filter((i) => i.sev === "P0");
  expect(
    p0,
    `P0 issues:\n${JSON.stringify(p0, null, 2)}\nReport: ${out}`
  ).toEqual([]);
  expect(report.summary.total).toBeGreaterThanOrEqual(36);
});
