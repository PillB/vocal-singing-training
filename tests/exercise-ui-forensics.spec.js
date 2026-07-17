/**
 * Forensic UI interactivity + hover audit for every vocal & singing exercise.
 * Screenshots: qa/screenshots/exercise-ui/{id}/
 * Report JSON: qa/geometry/exercise-ui-report.json
 */
const { test, expect } = require("@playwright/test");
const path = require("path");
const {
  SHOT_ROOT,
  shot,
  styleSnapshot,
  hoverFeedback,
  writeReport,
  ensureDir
} = require("./helpers/ui-forensics");
const { boot, openExercise } = require("./helpers/e2e");

test.describe.configure({ mode: "serial" });

test("forensic UI matrix: all vocal + singing exercises", async ({ page }) => {
  test.setTimeout(600000);
  ensureDir(SHOT_ROOT);
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
    exercises: [],
    summary: { total: 0, withIssues: 0, issues: [] }
  };

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

      // Mode / pitch chrome
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
      if (entry.profile?.showPitch && !entry.actions.chrome.pitchVisible) {
        entry.issues.push({ code: "pitch_missing", sev: "P1", msg: "Pitch canvas not visible" });
      }
      if (
        entry.profile &&
        !entry.profile.showPitch &&
        entry.profile.mode !== "weekPlan" &&
        !entry.actions.chrome.modeFocusKids &&
        !entry.actions.chrome.modeHudKids
      ) {
        entry.issues.push({ code: "mode_missing", sev: "P1", msg: "No mode UI mounted" });
      }

      // --- 01 hover Start ---
      if (start0?.visible) {
        await shot(page, rel("01_hover_start_before.png"));
        const beforeH = await styleSnapshot(page, "#btn-practice-start");
        await page.locator("#btn-practice-start").hover({ force: true });
        await page.waitForTimeout(100);
        const afterH = await styleSnapshot(page, "#btn-practice-start");
        await shot(page, rel("01_hover_start_after.png"));
        const hf = hoverFeedback(beforeH, afterH);
        entry.actions.hoverStart = { ...hf, before: beforeH, after: afterH };
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
            msg: "Start moved on hover"
          });
        }
        if (!hf.hitSelfAfter) {
          entry.issues.push({
            code: "hit_mismatch_hover",
            sev: "P0",
            msg: "Start not hit-testable under hover"
          });
        }
        // Move pointer away
        await page.mouse.move(5, 5);
      }

      // --- 02 hover mic ---
      const micSel = "#mic-sens-hud";
      if (await page.locator(micSel).isVisible().catch(() => false)) {
        await shot(page, rel("02_hover_mic_before.png"));
        const bMic = await styleSnapshot(page, micSel);
        await page.locator(micSel).hover({ force: true });
        await page.waitForTimeout(80);
        const aMic = await styleSnapshot(page, micSel);
        await shot(page, rel("02_hover_mic_after.png"));
        entry.actions.hoverMic = {
          before: bMic,
          after: aMic,
          hitSelf: !!aMic?.hitSelf
        };
        if (aMic && !aMic.hitSelf) {
          entry.issues.push({
            code: "mic_hit_mismatch",
            sev: "P1",
            msg: "Mic HUD center not hit-testable"
          });
        }
        await page.mouse.move(5, 5);
      }

      // --- 03 guide toggle ---
      const guideBtn = page.locator("#btn-toggle-guide");
      if (await guideBtn.isVisible().catch(() => false)) {
        await shot(page, rel("03_guide_before.png"));
        const collapsedBefore = await page.locator(".guide-card").evaluate((el) =>
          el.classList.contains("collapsed")
        );
        await guideBtn.click();
        await page.waitForTimeout(150);
        await shot(page, rel("03_guide_after.png"));
        const collapsedAfter = await page.locator(".guide-card").evaluate((el) =>
          el.classList.contains("collapsed")
        );
        const stepN = await page.evaluate(
          () => document.querySelectorAll("#ex-steps li").length
        );
        entry.actions.guideToggle = {
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
        // collapse again for clean metrics shot
        if (!collapsedAfter) {
          await guideBtn.click();
          await page.waitForTimeout(80);
        }
      }

      // --- 04 metrics toggle ---
      const metBtn = page.locator("#btn-toggle-metrics");
      if (await metBtn.isVisible().catch(() => false)) {
        await shot(page, rel("04_metrics_before.png"));
        const mBefore = await page.locator("#metrics-card").evaluate((el) =>
          el.classList.contains("collapsed")
        );
        await metBtn.click();
        await page.waitForTimeout(150);
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
          await metBtn.click();
          await page.waitForTimeout(80);
        }
      }

      // --- 05 pitch-specific hover octave / piano ---
      if (entry.profile?.showPitch) {
        const oct = page.locator("#btn-oct-up");
        if (await oct.isVisible().catch(() => false)) {
          await shot(page, rel("05_pitch_chrome_before.png"));
          const b = await styleSnapshot(page, "#btn-oct-up");
          await oct.hover({ force: true });
          await page.waitForTimeout(60);
          const a = await styleSnapshot(page, "#btn-oct-up");
          await shot(page, rel("05_hover_oct_after.png"));
          entry.actions.hoverOct = hoverFeedback(b, a);
          await page.mouse.move(5, 5);
        }
        try {
          const hasOne = await page.evaluate(() => !!document.querySelector("#chk-one-note"));
          if (hasOne) {
            const before = await page.evaluate(
              () => document.querySelector("#chk-one-note")?.checked ?? null
            );
            await page.locator("#chk-one-note").hover({ force: true }).catch(() => {});
            await shot(page, rel("05_piano_opt_hover.png"));
            entry.actions.oneNoteChecked = before;
          }
        } catch (pe) {
          entry.actions.pitchExtras = { error: String(pe.message || pe).slice(0, 100) };
        }
      }

      // --- 06 mode buttons (first button in mode panel) ---
      try {
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
          const labelBefore = await modeBtn.textContent().catch(() => "");
          await shot(page, rel("06_mode_btn_before.png"));
          await modeBtn.hover({ force: true }).catch(() => {});
          await page.waitForTimeout(50);
          await shot(page, rel("06_mode_btn_hover.png"));
          await modeBtn.click({ force: true }).catch(() => {});
          await page.waitForTimeout(100);
          await shot(page, rel("06_mode_btn_after_click.png"));
          entry.actions.modeButton = {
            label: labelBefore?.trim(),
            clicked: true
          };
        }
      } catch (mbErr) {
        entry.actions.modeButton = { error: String(mbErr.message || mbErr).slice(0, 120) };
      }

      // --- 07 Start/Stop for non-weekPlan ---
      if (entry.profile?.mode !== "weekPlan" && start0?.visible) {
        try {
          await page.locator("#btn-practice-start").click({ timeout: 5000 });
          await page.waitForTimeout(600);
          const live = await page.evaluate(
            () => !document.querySelector("#btn-practice-stop")?.hidden
          );
          await shot(page, rel("07_after_start.png"));
          entry.actions.startPractice = { live };
          if (live) {
            await page.locator("#btn-practice-stop").click({ timeout: 5000 });
            await page.waitForTimeout(300);
            await shot(page, rel("07_after_stop.png"));
            const metricsOpen = await page.evaluate(
              () => !document.querySelector("#metrics-card")?.classList.contains("collapsed")
            );
            entry.actions.stopPractice = { metricsOpen };
            if (!metricsOpen) {
              entry.issues.push({
                code: "metrics_not_auto_open",
                sev: "P2",
                msg: "Metrics still collapsed after Stop"
              });
            }
          } else {
            entry.actions.startPractice = { live: false, note: "did_not_go_live" };
          }
        } catch (e) {
          entry.actions.startPractice = { error: String(e.message || e) };
          entry.issues.push({
            code: "start_stop_error",
            sev: "P1",
            msg: String(e.message || e).slice(0, 160)
          });
        }
      }

      // --- 08 back home ---
      const back = page.locator("#btn-back-home");
      if (await back.isVisible().catch(() => false)) {
        const bBack = await styleSnapshot(page, "#btn-back-home");
        await back.hover({ force: true });
        await page.waitForTimeout(50);
        const aBack = await styleSnapshot(page, "#btn-back-home");
        await shot(page, rel("08_hover_back.png"));
        entry.actions.hoverBack = hoverFeedback(bBack, aBack);
        await back.click();
        await page.waitForTimeout(100);
        const onHome = await page.locator("#view-home").evaluate((el) =>
          el.classList.contains("active")
        );
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
        await shot(page, rel("99_error.png"));
      } catch {
        /* ignore */
      }
      // try recover to home
      await page.evaluate(() => {
        window.VTApp?.setView?.("home");
      }).catch(() => {});
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
  // Soft assert: no P0 issues
  const p0 = report.summary.issues.filter((i) => i.sev === "P0");
  expect(
    p0,
    `P0 issues:\n${JSON.stringify(p0, null, 2)}\nReport: ${out}`
  ).toEqual([]);
  expect(report.summary.total).toBeGreaterThanOrEqual(36);
});
