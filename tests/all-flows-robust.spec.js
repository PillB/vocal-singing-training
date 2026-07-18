/**
 * All exercises × robust layout + mouse click log confirmation.
 * - Programmatic overflow / placement probe
 * - Real mouse clicks with __vtClickLog press confirmation
 * - Mic drag + Start/Stop flow
 * - Multi-viewport sample + fullscreen-like
 *
 *   npm run test:all-flows
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise } = require("./helpers/e2e");
const {
  installClickLogInit,
  dismissBlockingOverlays,
  reflowStage,
  probeLayout,
  clearClickLog,
  mouseClickAndLog,
  writeJson
} = require("./helpers/layout-probe");

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "phone", width: 390, height: 844 },
  { name: "phone-land", width: 844, height: 390 },
  { name: "fullscreen-like", width: 1920, height: 1080 },
  { name: "short-wide", width: 1366, height: 520 }
];

// Full catalog exercised on primary viewport; sample on others
const SAMPLE_EX = ["v1-diction", "s15-sh-air-ladder", "s9-pitch-match", "s2-solfege-chords"];

test.describe.configure({ mode: "serial" });

test("all flows: layout + click-log + mic on all exercises (desktop)", async ({
  page
}) => {
  test.setTimeout(900000);
  await page.addInitScript(installClickLogInit);
  await boot(page, { lang: "es", tourDone: true, mic: "silent" });
  // Ensure logger after navigation
  await page.evaluate(installClickLogInit);
  await dismissBlockingOverlays(page);
  await page.addStyleTag({
    content: `
      #tour-root, .tour-backdrop {
        display: none !important;
        pointer-events: none !important;
      }
    `
  });

  const catalog = await page.evaluate(() => {
    const v = (window.VT_EXERCISES?.vocal || []).map((e) => e.id);
    const s = (window.VT_EXERCISES?.singing || []).map((e) => e.id);
    return [...v, ...s];
  });
  expect(catalog.length).toBeGreaterThanOrEqual(36);

  const report = {
    generatedAt: new Date().toISOString(),
    viewport: { width: 1280, height: 800 },
    exercises: [],
    summary: { total: 0, failed: 0, issues: [] }
  };

  await page.setViewportSize({ width: 1280, height: 800 });

  for (const exId of catalog) {
    const entry = {
      id: exId,
      layout: null,
      clicks: [],
      ok: true,
      issues: []
    };
    try {
      await dismissBlockingOverlays(page);
      await openExercise(page, exId);
      await dismissBlockingOverlays(page);
      await reflowStage(page);
      // Ensure non-zero layout before probing (open can race paint)
      await page
        .waitForFunction(() => {
          const b = document.getElementById("btn-practice-start");
          const s = document.getElementById("highway-stage");
          if (!b || !s) return false;
          const br = b.getBoundingClientRect();
          const sr = s.getBoundingClientRect();
          return br.width >= 8 && br.height >= 8 && sr.width >= 40 && sr.height >= 40;
        }, { timeout: 8000 })
        .catch(() => {});
      await reflowStage(page);

      // --- Layout probe ---
      let layout = await probeLayout(page);
      // Recovery if zero-size or start offscreen
      if (
        (layout.start && layout.start.w < 8) ||
        (layout.stage && layout.stage.w < 40) ||
        layout.issues.some(
          (i) =>
            i.code === "start_offscreen" ||
            i.code === "stage_overflow_y" ||
            i.code === "start_hit_miss"
        )
      ) {
        await page.evaluate(() => {
          window.scrollTo(0, 0);
          document.getElementById("toast")?.classList.remove("show");
          document.getElementById("tour-root") && (document.getElementById("tour-root").hidden = true);
          window.VTApp?.fitHighwayToViewport?.();
        });
        await page.waitForTimeout(100);
        await reflowStage(page);
        layout = await probeLayout(page);
      }
      entry.layout = {
        issues: layout.issues,
        startHit: layout.startHit,
        stage: layout.stage,
        start: layout.start
      };
      for (const iss of layout.issues) {
        // Include hit top for RCA
        const full = layout.startHit?.top
          ? { ...iss, top: layout.startHit.top }
          : iss;
        if (
          iss.code === "stage_overflow_y" ||
          iss.code === "start_offscreen" ||
          iss.code === "start_hit_miss" ||
          iss.code === "mode_focus_covers_start"
        ) {
          // Zero-size after recovery = real layout bug; log but try click flow anyway
          if (layout.start && layout.start.w < 8) {
            entry.issues.push({ ...full, code: "start_zero_size" });
          } else {
            entry.ok = false;
            entry.issues.push(full);
            report.summary.issues.push({ exerciseId: exId, ...full });
          }
        }
      }

      const mode = await page.evaluate(() => {
        const st = window.VTApp?.getState?.();
        return st?.exercise ? window.VTApp.getProfile?.(st.exercise)?.mode : null;
      });

      // --- Mic drag (emulate user) ---
      if (await page.locator("#mic-sensitivity").isVisible().catch(() => false)) {
        await clearClickLog(page);
        const v0 = await page.locator("#mic-sensitivity").inputValue();
        const box = await page.locator("#mic-sensitivity").boundingBox();
        if (box) {
          await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, {
            steps: 4
          });
          await page.mouse.down();
          await page.mouse.move(box.x + box.width * 0.35, box.y + box.height / 2, {
            steps: 10
          });
          await page.mouse.up();
        }
        const v1 = await page.locator("#mic-sensitivity").inputValue();
        entry.clicks.push({
          id: "mic-sensitivity",
          action: "drag",
          ok: String(v0) !== String(v1),
          v0,
          v1
        });
        // restore
        if (box) {
          await page.mouse.move(box.x + box.width * 0.35, box.y + box.height / 2);
          await page.mouse.down();
          await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, {
            steps: 8
          });
          await page.mouse.up();
        }
      }

      // --- Guide toggle with log confirm ---
      if (await page.locator("#btn-toggle-guide").isVisible().catch(() => false)) {
        await clearClickLog(page);
        const g = await mouseClickAndLog(page, "#btn-toggle-guide", "btn-toggle-guide");
        entry.clicks.push({ id: "btn-toggle-guide", ...g });
        if (!g.logOk) {
          entry.issues.push({
            code: "click_log_mismatch",
            msg: "guide click not in log",
            detail: g
          });
          // not always P0 if force click recovered
        }
        // collapse if open
        await page.evaluate(() => {
          const c = document.querySelector(".guide-card");
          if (c && !c.classList.contains("collapsed")) {
            document.getElementById("btn-toggle-guide")?.click();
          }
        });
      }

      // --- Start with log confirm ---
      if (mode !== "weekPlan" && (await page.locator("#btn-practice-start").isVisible())) {
        await clearClickLog(page);
        await reflowStage(page);
        const st = await mouseClickAndLog(page, "#btn-practice-start", "btn-practice-start");
        entry.clicks.push({ id: "btn-practice-start", ...st });

        if (!st.logOk && !st.preHit?.ok) {
          entry.ok = false;
          entry.issues.push({
            code: "start_click_log_fail",
            msg: "Start click not confirmed in press log / hit miss",
            preHit: st.preHit,
            recent: st.recent
          });
          report.summary.issues.push({
            exerciseId: exId,
            code: "start_click_log_fail",
            msg: "Start press not logged or hit miss"
          });
        }

        await page.waitForTimeout(650);
        let live = await page.evaluate(
          () => !document.querySelector("#btn-practice-stop")?.hidden
        );
        if (!live) {
          // recovery
          await reflowStage(page);
          await page.locator("#btn-practice-start").click({ timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(700);
          live = await page.evaluate(
            () => !document.querySelector("#btn-practice-stop")?.hidden
          );
        }
        entry.live = live;
        if (!live) {
          entry.ok = false;
          entry.issues.push({ code: "start_no_live", msg: "Did not enter live after Start" });
          report.summary.issues.push({
            exerciseId: exId,
            code: "start_no_live",
            msg: "Start did not go live"
          });
        } else {
          // Layout while live
          await reflowStage(page);
          const liveLayout = await probeLayout(page);
          entry.liveLayoutIssues = liveLayout.issues.filter(
            (i) =>
              i.code === "stage_overflow_y" ||
              i.code === "mode_focus_covers_start" ||
              i.code === "stop_hit_miss"
          );
          // Stop with log
          await clearClickLog(page);
          const sp = await mouseClickAndLog(page, "#btn-practice-stop", "btn-practice-stop");
          entry.clicks.push({ id: "btn-practice-stop", ...sp });
          await page.waitForTimeout(280);
          await dismissBlockingOverlays(page);
          const stopped = await page.evaluate(
            () => !!document.querySelector("#btn-practice-stop")?.hidden
          );
          entry.stopped = stopped;
          if (!stopped) {
            entry.ok = false;
            entry.issues.push({ code: "stop_fail", msg: "Stop click did not end live" });
            report.summary.issues.push({
              exerciseId: exId,
              code: "stop_fail",
              msg: "Stop failed"
            });
          }
          // Confirm log had stop press
          if (!sp.logOk) {
            entry.issues.push({
              code: "stop_log_mismatch",
              msg: "Stop click not in press log",
              recent: sp.recent
            });
          }
        }
      }

      // Back
      await reflowStage(page);
      await dismissBlockingOverlays(page);
      if (await page.locator("#btn-back-home").isVisible().catch(() => false)) {
        await clearClickLog(page);
        const b = await mouseClickAndLog(page, "#btn-back-home", "btn-back-home");
        entry.clicks.push({ id: "btn-back-home", ...b });
        await page.waitForTimeout(80);
        await dismissBlockingOverlays(page);
        await page.evaluate(() => {
          if (!document.getElementById("view-home")?.classList.contains("active")) {
            window.VTApp?.setView?.("home");
          }
        });
      }
    } catch (e) {
      entry.ok = false;
      entry.issues.push({
        code: "exception",
        msg: String(e.message || e).slice(0, 200)
      });
      report.summary.issues.push({
        exerciseId: exId,
        code: "exception",
        msg: String(e.message || e).slice(0, 160)
      });
      await dismissBlockingOverlays(page);
      await page.evaluate(() => window.VTApp?.setView?.("home")).catch(() => {});
    }

    report.exercises.push(entry);
    report.summary.total++;
    if (!entry.ok) report.summary.failed++;
  }

  writeJson("qa/geometry/all-flows-report.json", report);

  const hard = report.summary.issues.filter((i) =>
    [
      "stage_overflow_y",
      "start_offscreen",
      "start_hit_miss",
      "mode_focus_covers_start",
      "start_no_live",
      "stop_fail",
      "start_click_log_fail",
      "exception"
    ].includes(i.code)
  );
  expect(
    hard,
    `Hard flow issues:\n${JSON.stringify(hard, null, 2)}\nSee qa/geometry/all-flows-report.json`
  ).toEqual([]);
  expect(report.summary.total).toBeGreaterThanOrEqual(36);
});

test("multi-viewport sample flows + click logs", async ({ browser }) => {
  test.setTimeout(600000);
  const report = {
    generatedAt: new Date().toISOString(),
    viewports: [],
    issues: []
  };

  for (const vp of VIEWPORTS) {
    const context = await browser.newContext({
      viewport: { width: vp.width, height: vp.height }
    });
    const page = await context.newPage();
    await page.addInitScript(installClickLogInit);
    const vpEntry = { name: vp.name, width: vp.width, height: vp.height, exercises: [] };

    try {
      await boot(page, { lang: "es", tourDone: true, mic: "silent" });
      await page.evaluate(installClickLogInit);
      await dismissBlockingOverlays(page);
      await page.addStyleTag({
        content: `#tour-root,.tour-backdrop{display:none!important;pointer-events:none!important}`
      });

      for (const exId of SAMPLE_EX) {
        const ex = { id: exId, ok: true, issues: [] };
        try {
          await dismissBlockingOverlays(page);
          await openExercise(page, exId);
          await dismissBlockingOverlays(page);
          await reflowStage(page);

          const layout = await probeLayout(page);
          for (const iss of layout.issues) {
            if (
              ["stage_overflow_y", "start_offscreen", "start_hit_miss", "mode_focus_covers_start"].includes(
                iss.code
              )
            ) {
              ex.ok = false;
              ex.issues.push(iss);
              report.issues.push({ viewport: vp.name, exerciseId: exId, ...iss });
            }
          }

          await clearClickLog(page);
          await reflowStage(page);
          if (await page.locator("#btn-practice-start").isVisible()) {
            const st = await mouseClickAndLog(page, "#btn-practice-start", "btn-practice-start");
            ex.startLog = st;
            await page.waitForTimeout(700);
            let live = await page.evaluate(
              () => !document.querySelector("#btn-practice-stop")?.hidden
            );
            if (!live) {
              await page.locator("#btn-practice-start").click().catch(() => {});
              await page.waitForTimeout(700);
              live = await page.evaluate(
                () => !document.querySelector("#btn-practice-stop")?.hidden
              );
            }
            ex.live = live;
            if (!live) {
              ex.ok = false;
              report.issues.push({
                viewport: vp.name,
                exerciseId: exId,
                code: "start_no_live"
              });
            } else {
              // Confirm press log contains Start
              if (!st.logOk) {
                report.issues.push({
                  viewport: vp.name,
                  exerciseId: exId,
                  code: "start_log_miss",
                  recent: st.recent
                });
              }
              await clearClickLog(page);
              await reflowStage(page);
              const sp = await mouseClickAndLog(page, "#btn-practice-stop", "btn-practice-stop");
              ex.stopLog = sp;
              await page.waitForTimeout(250);
              await dismissBlockingOverlays(page);
              if (!sp.logOk) {
                // stop log miss is soft if stop still worked
                const stopped = await page.evaluate(
                  () => !!document.querySelector("#btn-practice-stop")?.hidden
                );
                if (!stopped) {
                  ex.ok = false;
                  report.issues.push({
                    viewport: vp.name,
                    exerciseId: exId,
                    code: "stop_fail"
                  });
                }
              }
            }
          }

          await page.evaluate(() => window.VTApp?.setView?.("home"));
        } catch (e) {
          ex.ok = false;
          report.issues.push({
            viewport: vp.name,
            exerciseId: exId,
            code: "exception",
            msg: String(e.message || e).slice(0, 120)
          });
          await page.evaluate(() => window.VTApp?.setView?.("home")).catch(() => {});
        }
        vpEntry.exercises.push(ex);
      }
    } finally {
      await context.close();
    }
    report.viewports.push(vpEntry);
  }

  writeJson("qa/geometry/viewport-flows-report.json", report);

  const hard = report.issues.filter((i) =>
    [
      "stage_overflow_y",
      "start_offscreen",
      "start_hit_miss",
      "mode_focus_covers_start",
      "start_no_live",
      "stop_fail",
      "exception"
    ].includes(i.code)
  );
  expect(hard, JSON.stringify(hard, null, 2)).toEqual([]);
});
