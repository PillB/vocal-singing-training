/**
 * Forensic UI interactivity — ALL visible exercise controls + Space hold when live.
 *
 * Emulation:
 *  - page.mouse.move({ steps }) hover path on every control
 *  - page.mouse.click for buttons / checkbox toggles (restore after)
 *  - mic range drag
 *  - keyboard.down/up("Space") hold while live (Stop focused) — always for non-weekPlan
 *
 * Screenshots: qa/screenshots/exercise-ui/{id}/
 * Report: qa/geometry/exercise-ui-report.json
 *
 * Always headed (never headless). Pink cursor overlay + slowMo.
 * Env: SLOWMO=100 (default), FORENSICS_LIMIT / FORENSICS_IDS for subset demo
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
  practiceProbe,
  scrollIntoView,
  listExerciseControls
} = require("./helpers/ui-forensics");
const { boot, openExercise } = require("./helpers/e2e");

// Always show a real Chromium window (never headless shell).
const SLOWMO = Number(process.env.SLOWMO || 100) || 100;
test.use({
  headless: false,
  viewport: { width: 1280, height: 800 },
  launchOptions: {
    slowMo: SLOWMO,
    args: ["--start-maximized"]
  }
});

test.describe.configure({ mode: "serial" });

/** Controls we only hover (don't click — would leave exercise / save / open heavy UI) */
const HOVER_ONLY = new Set([
  "btn-back-home",
  "btn-complete",
  "btn-next-structured",
  "btn-pricing",
  "btn-account",
  "btn-history",
  "btn-plan",
  "btn-lang",
  "btn-tour"
]);

/** Skip entirely (hidden legacy / not exercise UI) */
const SKIP_IDS = new Set([
  "btn-rec-start",
  "btn-rec-stop",
  "btn-timer-start",
  "btn-timer-pause",
  "btn-timer-reset",
  "btn-hold-start",
  "btn-hold-stop",
  "btn-pitch-start",
  "btn-pitch-stop",
  "btn-practice-stop" // only when not live; exercised in live phase
]);

/** Click twice to restore (toggles) */
const TOGGLE_RESTORE = new Set([
  "chk-auto-record",
  "chk-one-note",
  "chk-arpeggio",
  "chk-sustain",
  "chk-auto-piano",
  "chk-range-auto",
  "chk-pitch-challenge",
  "btn-toggle-guide",
  "btn-toggle-metrics",
  "btn-toggle-piano"
]);

/** Pink cursor overlay + warm-up path (always on — suite is always headed). */
async function ensureForensicsCursor(page) {
  page.setDefaultTimeout(30000);
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
  await page.mouse.move(40, 40);
  await page.waitForTimeout(150);
  await page.mouse.move(480, 160, { steps: 20 });
  await page.waitForTimeout(100);
  await page.mouse.move(220, 400, { steps: 16 });
  await page.waitForTimeout(120);
}

/**
 * Interact with one control: hover always; click/toggle when safe.
 */
async function exerciseControl(page, ctrl, shotRel, entry) {
  const id = ctrl.id;
  if (SKIP_IDS.has(id)) return { skipped: true, id };

  const result = {
    id,
    kind: ctrl.kind,
    label: ctrl.label,
    hovered: false,
    clicked: false,
    error: null
  };

  // Prefer real DOM id; anon buttons need text locator
  let sel = ctrl.hasDomId && !id.startsWith("anon-") ? `#${id}` : null;

  try {
    if (sel) {
      const visible = await page.locator(sel).isVisible().catch(() => false);
      if (!visible) {
        result.skipped = true;
        result.reason = "not_visible";
        return result;
      }
      await realHover(page, sel, { steps: 10 });
      result.hovered = true;
      await page.waitForTimeout(40);

      // Snapshot first few + primary CTAs
      if (
        [
          "btn-practice-start",
          "btn-toggle-guide",
          "btn-toggle-metrics",
          "btn-ui-help",
          "btn-oct-up",
          "btn-oct-down",
          "btn-toggle-piano",
          "btn-play-prog",
          "mic-sensitivity"
        ].includes(id)
      ) {
        await shot(page, shotRel(`ctrl_${id}_hover.png`));
      }

      if (HOVER_ONLY.has(id) || id === "btn-practice-start") {
        // Start clicked later in live phase; back last
        await page.mouse.move(8, 8, { steps: 4 });
        return result;
      }

      if (ctrl.kind === "range" || id === "mic-sensitivity") {
        const before = await page.evaluate(
          (s) => document.querySelector(s)?.value ?? null,
          sel
        );
        await realDragX(page, sel, -40);
        await page.waitForTimeout(50);
        const after = await page.evaluate(
          (s) => document.querySelector(s)?.value ?? null,
          sel
        );
        await realDragX(page, sel, 40).catch(() => {});
        result.clicked = true;
        result.drag = { before, after, changed: String(before) !== String(after) };
        await shot(page, shotRel(`ctrl_${id}_drag.png`));
        return result;
      }

      if (ctrl.kind === "select") {
        // Cycle to next option and restore
        const prev = await page.evaluate((s) => {
          const el = document.querySelector(s);
          return el ? el.selectedIndex : -1;
        }, sel);
        await realClick(page, sel, { steps: 8 });
        await page.keyboard.press("ArrowDown").catch(() => {});
        await page.keyboard.press("Enter").catch(() => {});
        await page.waitForTimeout(60);
        if (prev >= 0) {
          await page.evaluate(
            ({ s, i }) => {
              const el = document.querySelector(s);
              if (el) el.selectedIndex = i;
              el?.dispatchEvent(new Event("change", { bubbles: true }));
            },
            { s: sel, i: prev }
          );
        }
        result.clicked = true;
        return result;
      }

      // checkbox or button
      const checkedBefore =
        ctrl.kind === "checkbox"
          ? await page.evaluate((s) => document.querySelector(s)?.checked ?? null, sel)
          : null;

      await realClick(page, sel, { steps: 10, delayMs: 35 });
      result.clicked = true;
      await page.waitForTimeout(80);

      // Close help overlay if opened
      if (id === "btn-ui-help") {
        await page.keyboard.press("Escape").catch(() => {});
        await page.mouse.click(20, 20).catch(() => {});
        await page.waitForTimeout(60);
      }

      // Restore toggles
      if (TOGGLE_RESTORE.has(id) || ctrl.kind === "checkbox") {
        if (ctrl.kind === "checkbox") {
          const checkedAfter = await page.evaluate(
            (s) => document.querySelector(s)?.checked ?? null,
            sel
          );
          if (checkedBefore != null && checkedAfter !== checkedBefore) {
            await realClick(page, sel, { steps: 6 });
            await page.waitForTimeout(40);
          }
        } else if (id === "btn-toggle-guide" || id === "btn-toggle-metrics") {
          // leave collapsed for later explicit tests — re-click if expanded
          const cardSel = id === "btn-toggle-guide" ? ".guide-card" : "#metrics-card";
          const open = await page.locator(cardSel).evaluate((el) => !el.classList.contains("collapsed"));
          if (open) {
            await realClick(page, sel, { steps: 6 });
            await page.waitForTimeout(40);
          }
        } else if (id === "btn-toggle-piano") {
          // leave piano closed if it was closed: if open, close
          const pianoOpen = await page.evaluate(() => {
            const b = document.getElementById("piano-block");
            return b && !b.hidden;
          });
          if (pianoOpen) {
            await realClick(page, sel, { steps: 6 });
            await page.waitForTimeout(40);
          }
        }
      }

      await page.mouse.move(8, 8, { steps: 4 });
      return result;
    }

    // Anon mode/prog buttons: first matching text in mode panels
    const loc = page
      .locator("#mode-focus button, #mode-hud button, #prog-buttons button")
      .filter({ hasText: ctrl.label.slice(0, 20) })
      .first();
    if (await loc.isVisible().catch(() => false)) {
      await loc.scrollIntoViewIfNeeded().catch(() => {});
      const box = await loc.boundingBox();
      if (box) {
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await page.mouse.move(cx - 12, cy, { steps: 6 });
        await page.mouse.move(cx, cy, { steps: 8 });
        result.hovered = true;
        await page.mouse.click(cx, cy, { delay: 35 });
        result.clicked = true;
        await page.waitForTimeout(80);
      }
    }
  } catch (e) {
    result.error = String(e.message || e).slice(0, 120);
    entry.issues.push({
      code: "control_error",
      sev: "P2",
      msg: `${id}: ${result.error}`
    });
  }
  return result;
}

test("forensic UI matrix: all controls + Space on all exercises", async ({ page }) => {
  test.setTimeout(1200000);
  ensureDir(SHOT_ROOT);
  await boot(page, { lang: "es", tourDone: true, mic: "silent" });
  await ensureForensicsCursor(page);

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
    .map((s) => s.trim())
    .filter(Boolean);
  if (onlyIds.length) catalog = catalog.filter((e) => onlyIds.includes(e.id));
  const limit = Number(process.env.FORENSICS_LIMIT || 0);
  if (limit > 0) catalog = catalog.slice(0, limit);

  expect(catalog.length).toBeGreaterThanOrEqual(onlyIds.length || limit ? 1 : 36);

  const report = {
    generatedAt: new Date().toISOString(),
    base: process.env.BASE_URL || "http://127.0.0.1:8765",
    mode: "all-controls+space",
    exercises: [],
    summary: { total: 0, withIssues: 0, issues: [] }
  };

  await page.mouse.move(4, 4);

  for (const ex of catalog) {
    const entry = {
      id: ex.id,
      track: ex.track,
      number: ex.number,
      title: ex.title,
      actions: {},
      controls: [],
      issues: [],
      profile: null
    };
    ensureDir(path.join(SHOT_ROOT, ex.id));
    const rel = (name) => path.join(ex.id, name);

    try {
      await openExercise(page, ex.id);
      await page.waitForTimeout(100);
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

      // --- 00 open ---
      await shot(page, rel("00_open.png"));
      const start0 = await styleSnapshot(page, "#btn-practice-start");
      entry.actions.open = {
        title: await page.locator("#ex-title").textContent(),
        startVisible: !!start0?.visible,
        startHit: !!start0?.hitSelf
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

      // --- 01 Hover Start (dedicated before/after) ---
      if (start0?.visible) {
        await shot(page, rel("01_hover_start_before.png"));
        const beforeH = await styleSnapshot(page, "#btn-practice-start");
        await realHover(page, "#btn-practice-start", { steps: 16 });
        await page.waitForTimeout(100);
        const afterH = await styleSnapshot(page, "#btn-practice-start");
        await shot(page, rel("01_hover_start_after.png"));
        const hf = hoverFeedback(beforeH, afterH);
        entry.actions.hoverStart = { ...hf, method: "mouse.move.steps" };
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
        await page.mouse.move(10, 10, { steps: 6 });
      }

      // --- 02 Sweep ALL visible controls ---
      const controls = await listExerciseControls(page);
      entry.actions.controlInventory = controls.map((c) => ({
        id: c.id,
        kind: c.kind,
        label: c.label
      }));

      for (const ctrl of controls) {
        // Don't Start or Stop here
        if (ctrl.id === "btn-practice-start" || ctrl.id === "btn-practice-stop") {
          entry.controls.push({ id: ctrl.id, deferred: true });
          continue;
        }
        if (ctrl.id === "btn-back-home") {
          entry.controls.push({ id: ctrl.id, deferred: true });
          continue;
        }
        const r = await exerciseControl(page, ctrl, rel, entry);
        entry.controls.push(r);
      }

      // --- 03 Explicit guide expand (assert) ---
      if (await page.locator("#btn-toggle-guide").isVisible().catch(() => false)) {
        await shot(page, rel("03_guide_before.png"));
        const c0 = await page.locator(".guide-card").evaluate((el) =>
          el.classList.contains("collapsed")
        );
        await realClick(page, "#btn-toggle-guide", { steps: 12 });
        await page.waitForTimeout(140);
        await shot(page, rel("03_guide_after.png"));
        const c1 = await page.locator(".guide-card").evaluate((el) =>
          el.classList.contains("collapsed")
        );
        const stepN = await page.evaluate(
          () => document.querySelectorAll("#ex-steps li").length
        );
        entry.actions.guideToggle = {
          toggled: c0 !== c1,
          stepN,
          method: "scroll+mouse.click"
        };
        if (c0 === c1) {
          entry.issues.push({ code: "no_expand", sev: "P0", msg: "Guide toggle no-op" });
        }
        if (!c1) await realClick(page, "#btn-toggle-guide", { steps: 6 });
      }

      // --- 04 Explicit metrics expand ---
      if (await page.locator("#btn-toggle-metrics").isVisible().catch(() => false)) {
        await shot(page, rel("04_metrics_before.png"));
        const m0 = await page.locator("#metrics-card").evaluate((el) =>
          el.classList.contains("collapsed")
        );
        await realClick(page, "#btn-toggle-metrics", { steps: 12 });
        await page.waitForTimeout(140);
        await shot(page, rel("04_metrics_after.png"));
        const m1 = await page.locator("#metrics-card").evaluate((el) =>
          el.classList.contains("collapsed")
        );
        entry.actions.metricsToggle = {
          toggled: m0 !== m1,
          method: "scroll+mouse.click"
        };
        if (m0 === m1) {
          entry.issues.push({
            code: "no_metrics_toggle",
            sev: "P0",
            msg: "Metrics toggle no-op"
          });
        }
        if (!m1) await realClick(page, "#btn-toggle-metrics", { steps: 6 });
      }

      // --- 05 Pitch rail: octaves + every piano checkbox again if shown ---
      if (entry.profile?.showPitch || entry.actions.controlInventory?.some((c) => c.id === "btn-oct-up")) {
        for (const pid of [
          "btn-oct-down",
          "btn-oct-up",
          "chk-range-auto",
          "chk-one-note",
          "chk-arpeggio",
          "chk-sustain",
          "chk-auto-piano",
          "btn-toggle-piano"
        ]) {
          if (await page.locator(`#${pid}`).isVisible().catch(() => false)) {
            await realHover(page, `#${pid}`, { steps: 8 });
            await page.waitForTimeout(30);
            if (pid.startsWith("btn-oct")) {
              await realClick(page, `#${pid}`, { steps: 8 });
              await page.waitForTimeout(40);
            }
          }
        }
        // Open piano panel and click play/stop if available
        if (await page.locator("#btn-toggle-piano").isVisible().catch(() => false)) {
          await realClick(page, "#btn-toggle-piano", { steps: 8 });
          await page.waitForTimeout(100);
          await shot(page, rel("05_piano_open.png"));
          for (const pb of ["btn-play-prog", "btn-loop-prog", "btn-stop-piano", "btn-ref-pitch", "btn-inhale-ticks"]) {
            if (await page.locator(`#${pb}`).isVisible().catch(() => false)) {
              await realHover(page, `#${pb}`, { steps: 8 });
              await realClick(page, `#${pb}`, { steps: 8 });
              await page.waitForTimeout(120);
              entry.controls.push({ id: pb, hovered: true, clicked: true, phase: "piano" });
            }
          }
          // stop any loop
          if (await page.locator("#btn-stop-piano").isVisible().catch(() => false)) {
            await realClick(page, "#btn-stop-piano", { steps: 6 }).catch(() => {});
          }
          // close piano
          await realClick(page, "#btn-toggle-piano", { steps: 6 }).catch(() => {});
        }
        entry.actions.pitchRail = { ok: true };
      }

      // --- 06 Mode buttons: click EVERY visible mode/hud button ---
      const modeBtns = page.locator(
        "#mode-focus button:visible, #mode-hud button:visible"
      );
      const modeN = await modeBtns.count();
      entry.actions.modeButtons = { count: modeN, clicked: [] };
      for (let i = 0; i < Math.min(modeN, 12); i++) {
        const btn = modeBtns.nth(i);
        const label = ((await btn.textContent()) || "").trim().slice(0, 40);
        await btn.scrollIntoViewIfNeeded().catch(() => {});
        const box = await btn.boundingBox();
        if (!box) continue;
        const cx = box.x + box.width / 2;
        const cy = box.y + box.height / 2;
        await page.mouse.move(cx - 10, cy, { steps: 6 });
        await page.mouse.move(cx, cy, { steps: 8 });
        await page.mouse.click(cx, cy, { delay: 35 });
        await page.waitForTimeout(70);
        entry.actions.modeButtons.clicked.push(label);
      }
      if (modeN > 0) await shot(page, rel("06_mode_buttons.png"));

      // --- 07 Live: Start + Space holds + Stop (all non-weekPlan) ---
      if (entry.profile?.mode !== "weekPlan" && start0?.visible) {
        try {
          // Space on focused Start is allowed to start (product design) — we use click for clarity
          await shot(page, rel("07_start_press_before.png"));
          await realClick(page, "#btn-practice-start", { steps: 14, delayMs: 45 });
          await page.waitForTimeout(650);
          let probe = await practiceProbe(page);
          await shot(page, rel("07_after_start.png"));
          entry.actions.startPractice = {
            method: "mouse.click",
            live: probe.live,
            status: probe.status
          };

          if (probe.live) {
            // Live control sweep: hover Stop, mic, any still-visible rail controls
            if (await page.locator("#btn-practice-stop").isVisible().catch(() => false)) {
              await realHover(page, "#btn-practice-stop", { steps: 12 });
              await shot(page, rel("07_hover_stop.png"));
            }

            // Focus Stop — Space must NOT activate button
            await page.evaluate(() => {
              document.querySelector("#btn-practice-stop")?.focus();
            });
            await page.waitForTimeout(40);

            // --- Space hold #1 (primary assist) ---
            await shot(page, rel("07_space_before.png"));
            const beforeSpace = await practiceProbe(page);
            await page.keyboard.down("Space");
            await page.waitForTimeout(800);
            const midSpace = await practiceProbe(page);
            await shot(page, rel("07_space_hold.png"));
            await page.keyboard.up("Space");
            await page.waitForTimeout(150);
            const afterSpace = await practiceProbe(page);
            await shot(page, rel("07_space_after.png"));

            // --- Space hold #2 (pulse / re-press) ---
            await page.keyboard.down("Space");
            await page.waitForTimeout(500);
            const midSpace2 = await practiceProbe(page);
            await shot(page, rel("07_space_hold_2.png"));
            await page.keyboard.up("Space");
            await page.waitForTimeout(100);
            const afterSpace2 = await practiceProbe(page);

            // --- Space while focus on body (not button) ---
            await page.evaluate(() => {
              document.activeElement?.blur?.();
              document.body.focus?.();
            });
            await page.keyboard.down("Space");
            await page.waitForTimeout(450);
            const midSpace3 = await practiceProbe(page);
            await shot(page, rel("07_space_hold_body.png"));
            await page.keyboard.up("Space");
            await page.waitForTimeout(80);

            entry.actions.spaceHold = {
              method: "keyboard.down/up Space ×3",
              relevant: entry.profile?.allowManualSound !== false,
              focusedStop: beforeSpace.focusedId === "btn-practice-stop",
              hold1: {
                midLive: midSpace.live,
                midManual: midSpace.isManual,
                midHold: midSpace.holdVal,
                afterLive: afterSpace.live
              },
              hold2: {
                midLive: midSpace2.live,
                midManual: midSpace2.isManual,
                afterLive: afterSpace2.live
              },
              hold3_body: {
                midLive: midSpace3.live,
                midManual: midSpace3.isManual
              },
              didNotStop:
                midSpace.live &&
                afterSpace.live &&
                midSpace2.live &&
                afterSpace2.live &&
                midSpace3.live
            };

            if (!entry.actions.spaceHold.didNotStop) {
              entry.issues.push({
                code: "space_stopped_practice",
                sev: "P0",
                msg: "Space ended live practice (button activation leak)"
              });
            }

            // Hover complete if visible while live (usually not)
            if (await page.locator("#btn-complete").isVisible().catch(() => false)) {
              await realHover(page, "#btn-complete", { steps: 8 });
            }

            // Stop
            await realClick(page, "#btn-practice-stop", { steps: 12, delayMs: 40 });
            await page.waitForTimeout(300);
            await shot(page, rel("07_after_stop.png"));
            const metricsOpen = await page.evaluate(
              () => !document.querySelector("#metrics-card")?.classList.contains("collapsed")
            );
            const post = await practiceProbe(page);
            entry.actions.stopPractice = {
              method: "mouse.click",
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
                msg: "Still live after Stop"
              });
            }

            // Hover Save complete (don't force-save)
            if (await page.locator("#btn-complete").isVisible().catch(() => false)) {
              await realHover(page, "#btn-complete", { steps: 10 });
              await shot(page, rel("07_hover_complete.png"));
              entry.controls.push({ id: "btn-complete", hovered: true, clicked: false });
            }
          } else {
            entry.issues.push({
              code: "start_not_live",
              sev: "P1",
              msg: "Start did not enter live"
            });
          }
        } catch (e) {
          entry.issues.push({
            code: "start_stop_error",
            sev: "P1",
            msg: String(e.message || e).slice(0, 160)
          });
          await page.keyboard.up("Space").catch(() => {});
        }
      } else if (entry.profile?.mode === "weekPlan") {
        // Week plan: click open plan if present
        if (await page.locator("#btn-open-plan").isVisible().catch(() => false)) {
          await realHover(page, "#btn-open-plan", { steps: 10 });
          await realClick(page, "#btn-open-plan", { steps: 10 });
          await page.waitForTimeout(200);
          await shot(page, rel("07_week_plan.png"));
          entry.actions.weekPlan = { opened: true };
          // back from plan if navigated
          if (await page.locator("#btn-plan-back").isVisible().catch(() => false)) {
            await realClick(page, "#btn-plan-back", { steps: 8 });
            await page.waitForTimeout(100);
          }
          // re-open exercise if needed
          const onEx = await page.locator("#view-exercise").evaluate((el) =>
            el.classList.contains("active")
          );
          if (!onEx) await openExercise(page, ex.id);
        }
      }

      // --- 08 Back home ---
      if (await page.locator("#btn-back-home").isVisible().catch(() => false)) {
        await page.evaluate(() => {
          window.scrollTo(0, 0);
        });
        await scrollIntoView(page, "#btn-back-home");
        const bBack = await styleSnapshot(page, "#btn-back-home");
        await realHover(page, "#btn-back-home", { steps: 12 });
        const aBack = await styleSnapshot(page, "#btn-back-home");
        await shot(page, rel("08_hover_back.png"));
        entry.actions.hoverBack = hoverFeedback(bBack, aBack);
        await realClick(page, "#btn-back-home", { steps: 10 });
        await page.waitForTimeout(120);
        let onHome = await page.locator("#view-home").evaluate((el) =>
          el.classList.contains("active")
        );
        if (!onHome) {
          await page.locator("#btn-back-home").click().catch(() => {});
          await page.waitForTimeout(80);
          onHome = await page.locator("#view-home").evaluate((el) =>
            el.classList.contains("active")
          );
        }
        entry.actions.backHome = { onHome };
        if (!onHome) {
          entry.issues.push({ code: "back_fail", sev: "P0", msg: "Back did not return home" });
          await page.evaluate(() => window.VTApp?.setView?.("home")).catch(() => {});
        }
      }

      // Summary counts
      entry.actions.controlStats = {
        inventoried: entry.actions.controlInventory?.length || 0,
        hovered: entry.controls.filter((c) => c.hovered).length,
        clicked: entry.controls.filter((c) => c.clicked).length,
        errors: entry.controls.filter((c) => c.error).length
      };
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

  const out = writeReport(report);
  const p0 = report.summary.issues.filter((i) => i.sev === "P0");
  expect(p0, `P0 issues:\n${JSON.stringify(p0, null, 2)}\nReport: ${out}`).toEqual([]);
  if (!process.env.FORENSICS_LIMIT && !process.env.FORENSICS_IDS) {
    expect(report.summary.total).toBeGreaterThanOrEqual(36);
  } else {
    expect(report.summary.total).toBeGreaterThanOrEqual(1);
  }
});
