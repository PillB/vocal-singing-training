/**
 * Multi-format + fullscreen-like hit targets: real mouse click must land on
 * the painted control (elementFromPoint) and change state.
 *
 * Research: visualViewport remeasure, safe-area, hit area = paint box.
 * Report: qa/geometry/format-hit-report.json
 */
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { boot, openExercise } = require("./helpers/e2e");

const EXERCISES = ["s15-sh-air-ladder", "v1-diction", "s9-pitch-match"];

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "desktop-wide", width: 1600, height: 900 },
  { name: "desktop-short", width: 1280, height: 600 },
  { name: "laptop", width: 1024, height: 768 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "tablet-land", width: 1024, height: 600 },
  { name: "phone", width: 390, height: 844 },
  { name: "phone-narrow", width: 360, height: 740 },
  { name: "phone-small", width: 320, height: 640 },
  { name: "phone-land", width: 844, height: 390 },
  { name: "fullscreen-like", width: 1920, height: 1080 },
  { name: "short-wide", width: 1366, height: 500 }
];

const REPORT_PATH = path.join(
  __dirname,
  "..",
  "qa",
  "geometry",
  "format-hit-report.json"
);

function writeReport(data) {
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(data, null, 2));
}

async function layoutReady(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    // Dismiss toast so hit samples never collide with ephemeral UI
    document.getElementById("toast")?.classList.remove("show");
    window.VTApp?.syncHeaderHeightVar?.();
    window.VTApp?.fitHighwayToViewport?.();
  });
  await page.waitForTimeout(40);
  await page.evaluate(() => {
    window.VTApp?.fitHighwayToViewport?.();
  });
  await page.waitForTimeout(60);
}

/**
 * Sample hit-test grid on selector; return misses.
 */
async function hitSamples(page, sel) {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el || el.hidden) return { ok: false, reason: "missing", misses: [] };
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return { ok: false, reason: "zero", misses: [] };
    const points = [
      [0.5, 0.5],
      [0.25, 0.5],
      [0.75, 0.5],
      [0.5, 0.3],
      [0.5, 0.7]
    ];
    const misses = [];
    for (const [px, py] of points) {
      const x = r.left + r.width * px;
      const y = r.top + r.height * py;
      const top = document.elementFromPoint(x, y);
      const hit = !!(top && (top === el || el.contains(top)));
      if (!hit) {
        misses.push({
          px,
          py,
          x: Math.round(x),
          y: Math.round(y),
          top: top
            ? { id: top.id, tag: top.tagName, cls: String(top.className || "").slice(0, 50) }
            : null
        });
      }
    }
    const vh = window.visualViewport?.height || window.innerHeight;
    const offsetTop = window.visualViewport?.offsetTop || 0;
    return {
      ok: misses.length === 0,
      misses,
      bbox: {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        y2: r.bottom
      },
      inViewport: r.top >= -1 && r.bottom <= offsetTop + vh + 2,
      vh,
      offsetTop
    };
  }, sel);
}

async function realClickSel(page, sel) {
  const box = await page.locator(sel).boundingBox();
  if (!box) return false;
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await page.mouse.move(x - 20, y, { steps: 4 });
  await page.mouse.move(x, y, { steps: 6 });
  await page.mouse.click(x, y, { delay: 30 });
  return true;
}

async function dismissLeave(page) {
  await page.evaluate(() => {
    const m = document.getElementById("leave-modal");
    if (!m) return;
    document.getElementById("leave-discard")?.click();
    m.hidden = true;
    m.style.display = "none";
  });
}

test.describe("Format hit-clicks matrix", () => {
  test.setTimeout(600000);

  test("all viewports × 3 exercises: hit-test + real click Start/Stop", async ({
    browser
  }) => {
    const report = {
      generatedAt: new Date().toISOString(),
      viewports: [],
      summary: { total: 0, failed: 0, issues: [] }
    };

    for (const vp of VIEWPORTS) {
      const context = await browser.newContext({
        viewport: { width: vp.width, height: vp.height }
      });
      const page = await context.newPage();
      const vpEntry = {
        name: vp.name,
        width: vp.width,
        height: vp.height,
        exercises: [],
        issues: []
      };

      try {
        await boot(page, { lang: "es", tourDone: true, mic: "silent" });

        for (const exId of EXERCISES) {
          const exEntry = { id: exId, checks: {}, ok: true };
          try {
            await dismissLeave(page);
            await openExercise(page, exId);
            await layoutReady(page);

            // Stage must not overflow visual viewport
            const geom = await page.evaluate(() => {
              const stage = document.getElementById("highway-stage");
              const start = document.getElementById("btn-practice-start");
              const r = stage?.getBoundingClientRect();
              const s = start?.getBoundingClientRect();
              const vh = window.visualViewport?.height || window.innerHeight;
              const ot = window.visualViewport?.offsetTop || 0;
              return {
                stageBottom: r?.bottom,
                stageTop: r?.top,
                startBottom: s?.bottom,
                startTop: s?.top,
                visualBottom: ot + vh,
                startHit: (() => {
                  if (!s) return false;
                  const t = document.elementFromPoint(
                    s.left + s.width / 2,
                    s.top + s.height / 2
                  );
                  return !!(
                    t &&
                    (t.id === "btn-practice-start" ||
                      t.closest?.("#btn-practice-start"))
                  );
                })()
              };
            });
            exEntry.checks.geometry = geom;
            if (geom.stageBottom > geom.visualBottom + 2) {
              exEntry.ok = false;
              exEntry.checks.stageOverflow = true;
              vpEntry.issues.push({
                ex: exId,
                code: "stage_overflow",
                msg: `stage bottom ${geom.stageBottom} > visual ${geom.visualBottom}`
              });
            }
            if (geom.startBottom > geom.visualBottom + 2) {
              exEntry.ok = false;
              vpEntry.issues.push({
                ex: exId,
                code: "start_offscreen",
                msg: `Start bottom ${geom.startBottom} > visual ${geom.visualBottom}`
              });
            }

            // Hit-test Start
            const startHit = await hitSamples(page, "#btn-practice-start");
            exEntry.checks.startHit = startHit;
            if (!startHit.ok) {
              exEntry.ok = false;
              vpEntry.issues.push({
                ex: exId,
                code: "start_hit_miss",
                misses: startHit.misses
              });
            }

            // Real click Start → live
            await realClickSel(page, "#btn-practice-start");
            await page.waitForTimeout(700);
            const live = await page.evaluate(
              () => !document.querySelector("#btn-practice-stop")?.hidden
            );
            exEntry.checks.startClickLive = live;
            if (!live) {
              exEntry.ok = false;
              vpEntry.issues.push({ ex: exId, code: "start_click_no_live" });
            }

            if (live) {
              await layoutReady(page);
              const stopHit = await hitSamples(page, "#btn-practice-stop");
              exEntry.checks.stopHit = stopHit;
              if (!stopHit.ok) {
                exEntry.ok = false;
                vpEntry.issues.push({
                  ex: exId,
                  code: "stop_hit_miss",
                  misses: stopHit.misses
                });
              }
              await realClickSel(page, "#btn-practice-stop");
              await page.waitForTimeout(350);
              await dismissLeave(page);
              const stopped = await page.evaluate(
                () => !!document.querySelector("#btn-practice-stop")?.hidden
              );
              exEntry.checks.stopClick = stopped;
              if (!stopped) {
                exEntry.ok = false;
                vpEntry.issues.push({ ex: exId, code: "stop_click_fail" });
              }
            }

            // Guide toggle hit + click (may need scroll)
            if (await page.locator("#btn-toggle-guide").isVisible().catch(() => false)) {
              await page.locator("#btn-toggle-guide").scrollIntoViewIfNeeded();
              await page.waitForTimeout(40);
              const gHit = await hitSamples(page, "#btn-toggle-guide");
              exEntry.checks.guideHit = gHit;
              if (!gHit.ok) {
                // soft on guide if scrolled — only hard-fail if completely broken center
                if (gHit.misses?.some((m) => m.px === 0.5 && m.py === 0.5)) {
                  exEntry.ok = false;
                  vpEntry.issues.push({
                    ex: exId,
                    code: "guide_hit_miss",
                    misses: gHit.misses
                  });
                }
              }
            }

            // Back home
            await page.evaluate(() => window.scrollTo(0, 0));
            await page.locator("#btn-back-home").scrollIntoViewIfNeeded().catch(() => {});
            await layoutReady(page);
            const backHit = await hitSamples(page, "#btn-back-home");
            exEntry.checks.backHit = backHit;
            if (!backHit.ok && backHit.misses?.some((m) => m.px === 0.5 && m.py === 0.5)) {
              exEntry.ok = false;
              vpEntry.issues.push({
                ex: exId,
                code: "back_hit_miss",
                misses: backHit.misses
              });
            }
            await realClickSel(page, "#btn-back-home");
            await page.waitForTimeout(100);
            await dismissLeave(page);
            await page.evaluate(() => {
              if (!document.getElementById("view-home")?.classList.contains("active")) {
                window.VTApp?.setView?.("home");
              }
            });
          } catch (e) {
            exEntry.ok = false;
            exEntry.error = String(e.message || e).slice(0, 160);
            vpEntry.issues.push({
              ex: exId,
              code: "exception",
              msg: exEntry.error
            });
            await dismissLeave(page);
            await page.evaluate(() => window.VTApp?.setView?.("home")).catch(() => {});
          }

          vpEntry.exercises.push(exEntry);
          report.summary.total++;
          if (!exEntry.ok) report.summary.failed++;
        }

        // Mid-session resize stress: desktop → phone → fullscreen
        if (vp.name === "desktop") {
          await openExercise(page, "s15-sh-air-ladder");
          await layoutReady(page);
          await page.setViewportSize({ width: 390, height: 844 });
          await page.waitForTimeout(100);
          await layoutReady(page);
          let hit = await hitSamples(page, "#btn-practice-start");
          if (!hit.ok) {
            vpEntry.issues.push({
              ex: "s15-resize-phone",
              code: "resize_hit_miss",
              misses: hit.misses
            });
            report.summary.failed++;
          }
          await page.setViewportSize({ width: 1920, height: 1080 });
          await page.waitForTimeout(100);
          await layoutReady(page);
          hit = await hitSamples(page, "#btn-practice-start");
          if (!hit.ok) {
            vpEntry.issues.push({
              ex: "s15-resize-fullscreen",
              code: "resize_hit_miss",
              misses: hit.misses
            });
            report.summary.failed++;
          }
          // restore
          await page.setViewportSize({ width: vp.width, height: vp.height });
        }
      } finally {
        await context.close();
      }

      report.viewports.push(vpEntry);
      for (const iss of vpEntry.issues) {
        report.summary.issues.push({ viewport: vp.name, ...iss });
      }
    }

    writeReport(report);
    expect(
      report.summary.issues,
      `Format hit issues:\n${JSON.stringify(report.summary.issues, null, 2)}\n${REPORT_PATH}`
    ).toEqual([]);
    expect(report.summary.total).toBeGreaterThanOrEqual(VIEWPORTS.length * EXERCISES.length);
  });
});
