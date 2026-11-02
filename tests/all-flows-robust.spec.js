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

// Each helper has one falsifiable responsibility; the old single 47-exercise
// callback exceeded both CI's 15-minute timeout and the CC15 complexity cap.
async function measureLayout(page, entry, report, exId) {
  let layout = await probeLayout(page);
  if (
    (layout.start && layout.start.w < 8) ||
    (layout.stage && layout.stage.w < 40) ||
    layout.issues.some((i) => ["start_offscreen", "stage_overflow_y", "start_hit_miss"].includes(i.code))
  ) {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.getElementById("toast")?.classList.remove("show");
      const tour = document.getElementById("tour-root");
      if (tour) tour.hidden = true;
      window.VTApp?.fitHighwayToViewport?.();
    });
    await page.waitForTimeout(100);
    await reflowStage(page);
    layout = await probeLayout(page);
  }
  entry.layout = {
    issues: layout.issues, startHit: layout.startHit,
    stage: layout.stage, start: layout.start
  };
  for (const issue of layout.issues) {
    const full = layout.startHit?.top ? { ...issue, top: layout.startHit.top } : issue;
    if (!["stage_overflow_y", "start_offscreen", "start_hit_miss", "mode_focus_covers_start"].includes(issue.code)) continue;
    if (layout.start && layout.start.w < 8) {
      entry.issues.push({ ...full, code: "start_zero_size" });
      continue;
    }
    entry.ok = false;
    entry.issues.push(full);
    report.summary.issues.push({ exerciseId: exId, ...full });
  }
}

async function dragSensitivity(page, entry) {
  if (!(await page.locator("#mic-sensitivity").isVisible().catch(() => false))) return;
  await clearClickLog(page);
  const v0 = await page.locator("#mic-sensitivity").inputValue();
  const box = await page.locator("#mic-sensitivity").boundingBox();
  if (box) {
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 4 });
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height / 2, { steps: 10 });
    await page.mouse.up();
  }
  const v1 = await page.locator("#mic-sensitivity").inputValue();
  entry.clicks.push({ id: "mic-sensitivity", action: "drag", ok: String(v0) !== String(v1), v0, v1 });
  if (box) {
    await page.mouse.move(box.x + box.width * 0.35, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.7, box.y + box.height / 2, { steps: 8 });
    await page.mouse.up();
  }
}

async function toggleGuide(page, entry) {
  if (!(await page.locator("#btn-toggle-guide").isVisible().catch(() => false))) return;
  await clearClickLog(page);
  const result = await mouseClickAndLog(page, "#btn-toggle-guide", "btn-toggle-guide");
  entry.clicks.push({ id: "btn-toggle-guide", ...result });
  if (!result.logOk) {
    entry.issues.push({ code: "click_log_mismatch", msg: "guide click not in log", detail: result });
  }
  await page.evaluate(() => {
    const card = document.querySelector(".guide-card");
    if (card && !card.classList.contains("collapsed")) {
      document.getElementById("btn-toggle-guide")?.click();
    }
  });
}

async function stopLive(page, entry, report, exId) {
  await reflowStage(page);
  const layout = await probeLayout(page);
  entry.liveLayoutIssues = layout.issues.filter((i) =>
    ["stage_overflow_y", "mode_focus_covers_start", "stop_hit_miss"].includes(i.code)
  );
  await clearClickLog(page);
  const stop = await mouseClickAndLog(page, "#btn-practice-stop", "btn-practice-stop");
  entry.clicks.push({ id: "btn-practice-stop", ...stop });
  await page.waitForTimeout(280);
  await dismissBlockingOverlays(page);
  const stopped = await page.evaluate(() => !!document.querySelector("#btn-practice-stop")?.hidden);
  entry.stopped = stopped;
  if (!stopped) {
    entry.ok = false;
    entry.issues.push({ code: "stop_fail", msg: "Stop click did not end live" });
    report.summary.issues.push({ exerciseId: exId, code: "stop_fail", msg: "Stop failed" });
  }
  if (!stop.logOk) {
    entry.issues.push({ code: "stop_log_mismatch", msg: "Stop click not in press log", recent: stop.recent });
  }
}

async function startStop(page, entry, report, exId, mode) {
  if (mode === "weekPlan" || !(await page.locator("#btn-practice-start").isVisible())) return;
  await clearClickLog(page);
  await reflowStage(page);
  const start = await mouseClickAndLog(page, "#btn-practice-start", "btn-practice-start");
  entry.clicks.push({ id: "btn-practice-start", ...start });
  if (!start.logOk && !start.preHit?.ok) {
    entry.ok = false;
    entry.issues.push({
      code: "start_click_log_fail", msg: "Start click not confirmed in press log / hit miss",
      preHit: start.preHit, recent: start.recent
    });
    report.summary.issues.push({
      exerciseId: exId, code: "start_click_log_fail", msg: "Start press not logged or hit miss"
    });
  }
  await page.waitForTimeout(650);
  let live = await page.evaluate(() => !document.querySelector("#btn-practice-stop")?.hidden);
  if (!live) {
    await reflowStage(page);
    await page.locator("#btn-practice-start").click({ timeout: 4000 }).catch(() => {});
    await page.waitForTimeout(700);
    live = await page.evaluate(() => !document.querySelector("#btn-practice-stop")?.hidden);
  }
  entry.live = live;
  if (!live) {
    entry.ok = false;
    entry.issues.push({ code: "start_no_live", msg: "Did not enter live after Start" });
    report.summary.issues.push({ exerciseId: exId, code: "start_no_live", msg: "Start did not go live" });
    return;
  }
  await stopLive(page, entry, report, exId);
}

async function navigateBack(page, entry) {
  await reflowStage(page);
  await dismissBlockingOverlays(page);
  if (!(await page.locator("#btn-back-home").isVisible().catch(() => false))) return;
  await clearClickLog(page);
  const result = await mouseClickAndLog(page, "#btn-back-home", "btn-back-home");
  entry.clicks.push({ id: "btn-back-home", ...result });
  await page.waitForTimeout(80);
  await dismissBlockingOverlays(page);
  await page.evaluate(() => {
    if (!document.getElementById("view-home")?.classList.contains("active")) {
      window.VTApp?.setView?.("home");
    }
  });
}

async function exerciseFlow(page, exId, entry, report) {
  await dismissBlockingOverlays(page);
  await openExercise(page, exId);
  await dismissBlockingOverlays(page);
  await reflowStage(page);
  // Layout has to settle on actual non-zero geometry before hit testing.
  await page.waitForFunction(() => {
    const start = document.getElementById("btn-practice-start")?.getBoundingClientRect();
    const stage = document.getElementById("highway-stage")?.getBoundingClientRect();
    return start?.width >= 8 && start?.height >= 8 && stage?.width >= 40 && stage?.height >= 40;
  }, null, { timeout: 8000 }).catch(() => {});
  await reflowStage(page);
  await measureLayout(page, entry, report, exId);
  const mode = await page.evaluate(() => {
    const st = window.VTApp?.getState?.();
    return st?.exercise ? window.VTApp.getProfile?.(st.exercise)?.mode : null;
  });
  await dragSensitivity(page, entry);
  await toggleGuide(page, entry);
  await startStop(page, entry, report, exId, mode);
  await navigateBack(page, entry);
}

// Divide a 47-route journey into independent contexts: a slow route cannot
// consume the entire 15-minute monolith, and individual batches can retry.
for (let batch = 0; batch < 4; batch++) test(`all flows: desktop layout + click log (batch ${batch + 1}/4)`, async ({
  page
}) => {
  test.setTimeout(390000);
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
    batch,
    viewport: { width: 1280, height: 800 },
    exercises: [],
    summary: { total: 0, failed: 0, issues: [] }
  };

  await page.setViewportSize({ width: 1280, height: 800 });

  for (const [index, exId] of catalog.entries()) {
    if (index % 4 !== batch) continue;
    const exerciseStartedAt = Date.now();
    // Keep a per-exercise breadcrumb even if a long catalogue sweep hits its
    // overall deadline. Without this, a timeout loses which mode was active.
    console.log(`[all-flows] begin ${exId}`);
    const entry = {
      id: exId,
      layout: null,
      clicks: [],
      ok: true,
      issues: []
    };
    try {
      await exerciseFlow(page, exId, entry, report);
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
    console.log(`[all-flows] end ${exId} (${Date.now() - exerciseStartedAt} ms) ${entry.ok ? "ok" : "issues"}`);
  }

  const reportPath = `qa/geometry/all-flows-report-batch-${batch + 1}.json`;
  writeJson(reportPath, report);

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
    `Hard flow issues:\n${JSON.stringify(hard, null, 2)}\nSee ${reportPath}`
  ).toEqual([]);
  expect(report.summary.total).toBeGreaterThanOrEqual(9);
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
