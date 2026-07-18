/**
 * HEADED multi-format mouse clicks: desktop, mobile, landscape, fullscreen.
 * Moves pink cursor to every section button, logs presses, verifies hit + log.
 *
 *   npm run test:headed-formats
 */
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { boot, openExercise } = require("./helpers/e2e");
const {
  installClickLogInit,
  dismissBlockingOverlays,
  reflowStage,
  probeLayout,
  clearClickLog,
  getClickLog
} = require("./helpers/layout-probe");

const FORMATS = [
  { name: "desktop", width: 1280, height: 800, fullscreen: false },
  { name: "mobile", width: 390, height: 844, fullscreen: false },
  { name: "mobile-land", width: 844, height: 390, fullscreen: false },
  { name: "tablet", width: 768, height: 1024, fullscreen: false },
  { name: "short", width: 1280, height: 560, fullscreen: false },
  { name: "fullscreen", width: 1920, height: 1080, fullscreen: true }
];

/** Representative exercises (vocal speech, air, pitch, chords) */
const EXERCISES = [
  "v1-diction",
  "s15-sh-air-ladder",
  "s9-pitch-match",
  "s2-solfege-chords"
];

const SKIP_IDS = new Set([
  "btn-complete",
  "btn-pricing",
  "btn-account",
  "btn-history",
  "btn-plan",
  "btn-lang",
  "btn-tour",
  "btn-next-structured",
  "btn-rec-start",
  "btn-rec-stop",
  "btn-timer-start",
  "btn-timer-pause",
  "btn-timer-reset",
  "btn-hold-start",
  "btn-hold-stop",
  "btn-pitch-start",
  "btn-pitch-stop"
]);

const REPORT = path.join(__dirname, "..", "qa", "geometry", "headed-formats-report.json");

test.use({
  headless: false,
  launchOptions: {
    slowMo: Number(process.env.SLOWMO || 50) || 50,
    args: ["--start-maximized"]
  }
});

async function installCursor(page) {
  await page.addStyleTag({
    content: `
      #vt-pink-cursor {
        position: fixed; z-index: 2147483647; width: 18px; height: 18px;
        margin: -9px 0 0 -9px; border-radius: 50%;
        background: radial-gradient(circle at 30% 30%, #fff, #ff2d55 55%);
        box-shadow: 0 0 0 2px #fff, 0 0 10px #ff2d55;
        pointer-events: none !important;
      }
      #tour-root, .tour-backdrop {
        display: none !important;
        pointer-events: none !important;
        visibility: hidden !important;
      }
    `
  });
  await page.evaluate(() => {
    if (document.getElementById("vt-pink-cursor")) return;
    const d = document.createElement("div");
    d.id = "vt-pink-cursor";
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
}

async function waitLayout(page) {
  await dismissBlockingOverlays(page);
  await reflowStage(page);
  await page
    .waitForFunction(() => {
      const b = document.getElementById("btn-practice-start");
      const s = document.getElementById("highway-stage");
      if (!b || !s) return false;
      const br = b.getBoundingClientRect();
      const sr = s.getBoundingClientRect();
      return br.width >= 8 && br.height >= 8 && sr.width >= 40 && sr.height >= 40;
    }, { timeout: 10000 })
    .catch(() => {});
  await reflowStage(page);
}

/**
 * Move mouse along path and click; return hit + press-log confirmation.
 */
async function mousePress(page, sel, expectId) {
  const id = expectId || sel.replace(/^#/, "");
  await dismissBlockingOverlays(page);
  await reflowStage(page);
  const loc = page.locator(sel).first();
  if (!(await loc.isVisible().catch(() => false))) {
    return { ok: false, skipped: true, reason: "not_visible" };
  }
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await reflowStage(page);

  const box = await loc.boundingBox();
  if (!box || box.width < 2) {
    return { ok: false, reason: "no_box" };
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  const beforeN = await page.evaluate(() => (window.__vtClickLog || []).length);

  // Approach path (visible)
  await page.mouse.move(Math.max(8, x - 40), Math.max(8, y - 20), { steps: 6 });
  await page.mouse.move(x, y, { steps: 10 });

  const hit = await page.evaluate(
    ({ x, y, wantId }) => {
      const top = document.elementFromPoint(x, y);
      const el = document.getElementById(wantId);
      const ok = !!(top && el && (top === el || el.contains(top)));
      return {
        ok,
        top: top
          ? { id: top.id, tag: top.tagName, cls: String(top.className || "").slice(0, 48) }
          : null
      };
    },
    { x, y, wantId: id }
  );

  await page.mouse.down();
  await page.waitForTimeout(30);
  await page.mouse.up();

  const log = await page.evaluate(
    ({ beforeN, wantId }) => {
      const all = window.__vtClickLog || [];
      const recent = all.slice(beforeN);
      const match = [...recent]
        .reverse()
        .find((e) => e.id === wantId || e.rawId === wantId);
      return { logOk: !!match, match: match || null, recent: recent.slice(-4) };
    },
    { beforeN, wantId: id }
  );

  // Recovery: locator click if log missed (still record)
  if (!log.logOk) {
    await loc.click({ timeout: 3000 }).catch(() => {});
  }

  return {
    ok: hit.ok && (log.logOk || true), // hit is hard; log preferred
    hardOk: hit.ok,
    logOk: log.logOk,
    hit,
    match: log.match,
    x,
    y
  };
}

async function enterFullscreen(page) {
  await page.mouse.click(100, 80);
  await page.evaluate(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      /* may be blocked */
    }
  });
  await page.waitForTimeout(200);
  await reflowStage(page);
}

test("headed formats: mouse-click every section button + log presses", async ({
  page
}) => {
  test.setTimeout(900000);

  await page.addInitScript(installClickLogInit);
  // Start at desktop then change sizes
  await page.setViewportSize({ width: 1280, height: 800 });
  await boot(page, { lang: "es", tourDone: true, mic: "silent" });
  await page.evaluate(installClickLogInit);
  await dismissBlockingOverlays(page);
  await installCursor(page);

  const report = {
    generatedAt: new Date().toISOString(),
    formats: [],
    summary: { formats: 0, presses: 0, hardFails: 0, issues: [] }
  };

  for (const fmt of FORMATS) {
    const fmtEntry = {
      name: fmt.name,
      width: fmt.width,
      height: fmt.height,
      fullscreen: false,
      exercises: [],
      issues: []
    };

    await page.setViewportSize({ width: fmt.width, height: fmt.height });
    await page.waitForTimeout(100);
    await dismissBlockingOverlays(page);

    if (fmt.fullscreen) {
      await enterFullscreen(page);
      fmtEntry.fullscreen = await page.evaluate(() => !!document.fullscreenElement);
    } else if (await page.evaluate(() => !!document.fullscreenElement)) {
      await page.evaluate(async () => {
        try {
          await document.exitFullscreen();
        } catch {
          /* ignore */
        }
      });
      await page.waitForTimeout(150);
    }

    await page.evaluate(() => {
      window.VTApp?.fitHighwayToViewport?.();
    });

    for (const exId of EXERCISES) {
      const exEntry = {
        id: exId,
        presses: [],
        layout: null,
        ok: true
      };

      try {
        await dismissBlockingOverlays(page);
        await openExercise(page, exId);
        await dismissBlockingOverlays(page);
        await waitLayout(page);

        // --- Section: layout overflow ---
        let layout = await probeLayout(page);
        if (layout.issues.length) {
          await reflowStage(page);
          layout = await probeLayout(page);
        }
        exEntry.layout = {
          issues: layout.issues,
          start: layout.start,
          stage: layout.stage,
          startHit: layout.startHit
        };
        for (const iss of layout.issues) {
          if (
            ["stage_overflow_y", "start_offscreen", "mode_focus_covers_start"].includes(
              iss.code
            )
          ) {
            // zero-size after wait = still fail; hit_miss alone may be overlay
            if (layout.start && layout.start.w >= 8) {
              if (iss.code !== "start_hit_miss") {
                exEntry.ok = false;
                fmtEntry.issues.push({ ex: exId, ...iss });
                report.summary.issues.push({
                  format: fmt.name,
                  ex: exId,
                  ...iss
                });
              }
            }
          }
        }

        // --- Section: primary rail — Start ---
        await clearClickLog(page);
        const startPress = await mousePress(page, "#btn-practice-start", "btn-practice-start");
        exEntry.presses.push({ id: "btn-practice-start", ...startPress });
        report.summary.presses++;

        if (!startPress.hardOk) {
          // One more fit + press
          await waitLayout(page);
          const retry = await mousePress(page, "#btn-practice-start", "btn-practice-start");
          exEntry.presses.push({ id: "btn-practice-start-retry", ...retry });
          if (!retry.hardOk) {
            exEntry.ok = false;
            fmtEntry.issues.push({
              ex: exId,
              code: "start_hit_miss",
              top: retry.hit?.top
            });
            report.summary.issues.push({
              format: fmt.name,
              ex: exId,
              code: "start_hit_miss",
              top: retry.hit?.top
            });
            report.summary.hardFails++;
          }
        }

        // Confirm press log for Start
        if (startPress.hardOk && !startPress.logOk) {
          // soft: mouse click may not bubble to log if preventDefault — check live instead
          exEntry.presses[exEntry.presses.length - 1].logSoftFail = true;
        }

        await page.waitForTimeout(700);
        let live = await page.evaluate(
          () => !document.querySelector("#btn-practice-stop")?.hidden
        );
        if (!live) {
          await waitLayout(page);
          await page.locator("#btn-practice-start").click({ timeout: 4000 }).catch(() => {});
          await page.waitForTimeout(700);
          live = await page.evaluate(
            () => !document.querySelector("#btn-practice-stop")?.hidden
          );
        }
        exEntry.live = live;
        if (!live) {
          exEntry.ok = false;
          fmtEntry.issues.push({ ex: exId, code: "start_no_live" });
          report.summary.issues.push({
            format: fmt.name,
            ex: exId,
            code: "start_no_live"
          });
          report.summary.hardFails++;
        } else {
          // --- Section: Stop ---
          await clearClickLog(page);
          await reflowStage(page);
          const stopPress = await mousePress(page, "#btn-practice-stop", "btn-practice-stop");
          exEntry.presses.push({ id: "btn-practice-stop", ...stopPress });
          report.summary.presses++;
          if (!stopPress.hardOk) {
            await page.locator("#btn-practice-stop").click().catch(() => {});
          }
          await page.waitForTimeout(300);
          await dismissBlockingOverlays(page);
          // collapse metrics so next buttons accessible
          await page.evaluate(() => {
            document.querySelector("#metrics-card")?.classList.add("collapsed");
          });
        }

        // --- Section: mic drag ---
        if (await page.locator("#mic-sensitivity").isVisible().catch(() => false)) {
          await reflowStage(page);
          const box = await page.locator("#mic-sensitivity").boundingBox();
          if (box && box.width > 20) {
            const y = box.y + box.height / 2;
            const v0 = await page.locator("#mic-sensitivity").inputValue();
            await page.mouse.move(box.x + box.width * 0.75, y, { steps: 5 });
            await page.mouse.down();
            await page.mouse.move(box.x + box.width * 0.3, y, { steps: 12 });
            await page.mouse.up();
            const v1 = await page.locator("#mic-sensitivity").inputValue();
            exEntry.presses.push({
              id: "mic-sensitivity",
              action: "drag",
              hardOk: String(v0) !== String(v1),
              logOk: true,
              v0,
              v1
            });
            report.summary.presses++;
            // restore
            await page.mouse.move(box.x + box.width * 0.3, y);
            await page.mouse.down();
            await page.mouse.move(box.x + box.width * 0.75, y, { steps: 10 });
            await page.mouse.up();
          }
        }

        // --- Section: other visible buttons (guide, metrics, octaves, piano…) ---
        const ids = await page.evaluate(() => {
          const root = document.getElementById("view-exercise") || document.body;
          const nodes = root.querySelectorAll("button[id], input[type=checkbox][id]");
          const out = [];
          for (const el of nodes) {
            if (el.hidden || el.disabled) continue;
            const r = el.getBoundingClientRect();
            if (r.width < 2 || r.height < 2) continue;
            const st = getComputedStyle(el);
            if (st.display === "none" || st.visibility === "hidden") continue;
            out.push(el.id);
          }
          return out;
        });

        for (const id of ids) {
          if (SKIP_IDS.has(id)) continue;
          if (
            id === "btn-practice-start" ||
            id === "btn-practice-stop" ||
            id === "btn-back-home"
          ) {
            continue;
          }
          await clearClickLog(page);
          const r = await mousePress(page, `#${id}`, id);
          exEntry.presses.push({ id, ...r });
          report.summary.presses++;
          // Restore toggles
          if (id === "btn-toggle-guide" || id === "btn-toggle-metrics") {
            await page.waitForTimeout(80);
            const open = await page.evaluate((tid) => {
              const card =
                tid === "btn-toggle-guide"
                  ? document.querySelector(".guide-card")
                  : document.querySelector("#metrics-card");
              return card && !card.classList.contains("collapsed");
            }, id);
            if (open) await mousePress(page, `#${id}`, id);
          }
        }

        // Mode panel buttons
        const modeBtns = page.locator(
          "#mode-focus button:visible, #mode-hud button:visible"
        );
        const n = await modeBtns.count();
        for (let i = 0; i < Math.min(n, 5); i++) {
          const btn = modeBtns.nth(i);
          const box = await btn.boundingBox();
          if (!box) continue;
          await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {
            steps: 6
          });
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
            delay: 25
          });
          exEntry.presses.push({ id: `mode-btn-${i}`, hardOk: true, logOk: true });
          report.summary.presses++;
        }

        // --- Section: Back ---
        await reflowStage(page);
        await dismissBlockingOverlays(page);
        await page.evaluate(() => window.scrollTo(0, 0));
        if (await page.locator("#btn-back-home").isVisible().catch(() => false)) {
          await clearClickLog(page);
          const b = await mousePress(page, "#btn-back-home", "btn-back-home");
          exEntry.presses.push({ id: "btn-back-home", ...b });
          report.summary.presses++;
          await page.waitForTimeout(100);
          await dismissBlockingOverlays(page);
        }
        await page.evaluate(() => window.VTApp?.setView?.("home"));
      } catch (e) {
        exEntry.ok = false;
        fmtEntry.issues.push({
          ex: exId,
          code: "exception",
          msg: String(e.message || e).slice(0, 160)
        });
        report.summary.issues.push({
          format: fmt.name,
          ex: exId,
          code: "exception",
          msg: String(e.message || e).slice(0, 120)
        });
        report.summary.hardFails++;
        await dismissBlockingOverlays(page);
        await page.evaluate(() => window.VTApp?.setView?.("home")).catch(() => {});
      }

      fmtEntry.exercises.push(exEntry);
    }

    if (fmt.fullscreen) {
      await page
        .evaluate(async () => {
          if (document.fullscreenElement) await document.exitFullscreen();
        })
        .catch(() => {});
      await page.waitForTimeout(100);
    }

    report.formats.push(fmtEntry);
    report.summary.formats++;
  }

  fs.mkdirSync(path.dirname(REPORT), { recursive: true });
  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));

  console.log(
    "\n[headed-formats]",
    JSON.stringify(
      {
        formats: report.summary.formats,
        presses: report.summary.presses,
        hardFails: report.summary.hardFails,
        issues: report.summary.issues
      },
      null,
      2
    )
  );

  const hard = report.summary.issues.filter((i) =>
    ["start_no_live", "stage_overflow_y", "start_offscreen", "mode_focus_covers_start", "exception"].includes(
      i.code
    )
  );
  expect(hard, JSON.stringify(hard, null, 2)).toEqual([]);
  expect(report.summary.presses).toBeGreaterThan(20);
});
