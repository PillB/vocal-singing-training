/**
 * UI forensics helpers — real pointer/keyboard emulation + style/hit probes.
 * Prefer mouse.move(steps) / mouse.click / keyboard.down|up over locator-only hover.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..");
const SHOT_ROOT = path.join(ROOT, "qa", "screenshots", "exercise-ui");
const REPORT_JSON = path.join(ROOT, "qa", "geometry", "exercise-ui-report.json");

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} filePath absolute or relative under SHOT_ROOT
 */
async function shot(page, filePath) {
  const abs = path.isAbsolute(filePath) ? filePath : path.join(SHOT_ROOT, filePath);
  ensureDir(path.dirname(abs));
  await page.screenshot({ path: abs, fullPage: false });
  return abs;
}

/**
 * Scroll element into view (required — raw mouse coords do not auto-scroll).
 * @param {import('@playwright/test').Page} page
 * @param {string} sel
 */
async function scrollIntoView(page, sel) {
  const loc = page.locator(sel).first();
  if ((await loc.count()) === 0) return false;
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await page.waitForTimeout(50);
  return true;
}

/**
 * Center of element in viewport CSS pixels (after optional scroll).
 * @param {import('@playwright/test').Page} page
 * @param {string} sel
 * @returns {Promise<{x:number,y:number,w:number,h:number}|null>}
 */
async function elementCenter(page, sel) {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return null;
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      w: r.width,
      h: r.height
    };
  }, sel);
}

/**
 * Element under point (forensics).
 * @param {import('@playwright/test').Page} page
 * @param {number} x
 * @param {number} y
 */
async function hitAt(page, x, y) {
  return page.evaluate(
    ({ x, y }) => {
      const top = document.elementFromPoint(x, y);
      if (!top) return null;
      return {
        id: top.id || "",
        tag: top.tagName,
        cls: String(top.className || "").slice(0, 60)
      };
    },
    { x, y }
  );
}

/**
 * Real mouse path: scroll into view, then move with steps onto center.
 * @param {import('@playwright/test').Page} page
 * @param {string} sel
 * @param {{ steps?: number, scroll?: boolean }} [opts]
 */
async function realHover(page, sel, opts = {}) {
  const steps = opts.steps ?? 12;
  if (opts.scroll !== false) {
    await scrollIntoView(page, sel);
  }
  const c = await elementCenter(page, sel);
  if (!c) return { ok: false, reason: "missing_or_zero" };
  // Approach from slightly off-element so CSS :hover transitions fire
  const ax = c.x - Math.min(40, c.w / 2 + 8);
  const ay = Math.max(4, c.y - 8);
  await page.mouse.move(ax, ay, { steps: Math.max(4, Math.floor(steps / 2)) });
  await page.mouse.move(c.x, c.y, { steps });
  const hit = await hitAt(page, c.x, c.y);
  return { ok: true, x: c.x, y: c.y, w: c.w, h: c.h, hit };
}

/**
 * Real click: scroll, move path, full mouse.click (down+up+click event).
 * @param {import('@playwright/test').Page} page
 * @param {string} sel
 * @param {{ steps?: number, delayMs?: number, scroll?: boolean }} [opts]
 */
async function realClick(page, sel, opts = {}) {
  const h = await realHover(page, sel, { steps: opts.steps ?? 10, scroll: opts.scroll });
  if (!h.ok) return h;
  await page.waitForTimeout(30);
  await page.mouse.click(h.x, h.y, { delay: opts.delayMs ?? 40 });
  return h;
}

/**
 * Drag horizontal range/slider by mouse (real path).
 * @param {import('@playwright/test').Page} page
 * @param {string} sel
 * @param {number} deltaX pixels relative to current center
 */
async function realDragX(page, sel, deltaX) {
  await scrollIntoView(page, sel);
  const c = await elementCenter(page, sel);
  if (!c) return { ok: false, reason: "missing" };
  await page.mouse.move(c.x, c.y, { steps: 8 });
  await page.mouse.down();
  await page.mouse.move(c.x + deltaX, c.y, { steps: 14 });
  await page.mouse.up();
  return { ok: true, fromX: c.x, toX: c.x + deltaX };
}

/**
 * Hold Space (manual sound assist) then release.
 * @param {import('@playwright/test').Page} page
 * @param {number} holdMs
 */
async function spaceHold(page, holdMs = 650) {
  await page.keyboard.down("Space");
  await page.waitForTimeout(holdMs);
  await page.keyboard.up("Space");
}

/**
 * Probe practice UI + engine. Prefer mode-specific selectors — never treat
 * wall-clock [data-remain] countdown as "hold count".
 * @param {import('@playwright/test').Page} page
 */
async function practiceProbe(page) {
  return page.evaluate(() => {
    const st = window.VTApp?.getState?.() || {};
    const eng = st.practice || window.VTApp?.engine || null;
    const stop = document.querySelector("#btn-practice-stop");
    const start = document.querySelector("#btn-practice-start");
    const status = document.querySelector("#practice-status")?.textContent || "";
    const chip = document.querySelector("#mic-sens-hud")?.className || "";
    const focus = document.getElementById("mode-focus");
    const hud = document.getElementById("mode-hud");
    // Pitch exercises mount mode UI in #mode-hud; speech modes use #mode-focus
    const roots = [focus, hud].filter(Boolean);
    const q = (sel) => {
      for (const r of roots) {
        const el = r.querySelector(sel);
        if (el) return el;
      }
      return null;
    };
    const mic = document.querySelector("#mic-sensitivity");
    const pitchCanvas = document.getElementById("pitch-canvas");

    // Hold seconds: ONLY .mode-big[data-h] (not meta [data-h] hard-attack counters)
    const holdEl = q(".mode-big[data-h]");
    const remainEl = q(".mode-big[data-remain], [data-remain]");
    const clearedEl = q("[data-c]");
    const bestEl = q("[data-b], [data-best]");
    const shortEl = q("[data-sh]");
    const longEl = q("[data-lg]");
    const easyEl = q("[data-e]");

    const parseNum = (el) => {
      if (!el) return null;
      const v = parseFloat(String(el.textContent || "").replace(/[^\d.-]/g, ""));
      return Number.isFinite(v) ? v : null;
    };

    const holdText = holdEl ? String(holdEl.textContent || "").trim().slice(0, 40) : null;
    const holdVal = parseNum(holdEl);

    // Engine live fields (preferred truth for pitch/hold)
    const engHold =
      typeof eng?.currentHoldSec === "number"
        ? eng.currentHoldSec
        : typeof eng?._currentHoldSec === "number"
          ? eng._currentHoldSec
          : null;
    const manSt = eng?.getManualSound?.() || null;
    const manualActive = !!(manSt && manSt.active);
    const manualGrace = !!(manSt && manSt.grace);

    const profile = st.exercise ? window.VTApp?.getProfile?.(st.exercise) : null;
    const showPitch = !!profile?.showPitch;
    const mode = profile?.mode || null;
    // Mirror product rules: air modes always; else non-highway only
    const airAssist =
      profile?.manualSoundKind === "air" ||
      mode === "shAirLadder" ||
      mode === "breathS";
    const spaceAssistAllowed = !!(
      st.practiceLive &&
      profile &&
      profile.allowManualSound !== false &&
      (airAssist || !showPitch)
    );

    return {
      t: Date.now(),
      live: !!(stop && !stop.hidden),
      startVisible: !!(start && !start.hidden),
      status: (status || "").trim().slice(0, 80),
      micClass: chip,
      isManual: /is-manual(?:\s|$)/.test(chip) && !/is-manual-grace/.test(chip),
      isManualGrace: /is-manual-grace/.test(chip),
      holdText,
      /** Seconds from mode-big[data-h] only — null if N/A */
      holdVal,
      remainSec: parseNum(remainEl),
      cleared: parseNum(clearedEl),
      bestHold: parseNum(bestEl),
      shortNotes: parseNum(shortEl),
      longNotes: parseNum(longEl),
      easyOnsets: parseNum(easyEl),
      engHoldSec: engHold,
      manualSound: manualActive,
      manualGrace,
      manualKind: manSt?.kind || null,
      spaceAssistAllowed,
      showPitch,
      mode,
      micValue: mic ? mic.value : null,
      modeKids: focus?.children?.length || 0,
      pitchH: pitchCanvas ? pitchCanvas.getBoundingClientRect().height : 0,
      focusedId: document.activeElement?.id || null,
      focusedTag: document.activeElement?.tagName || null
    };
  });
}

/**
 * Air/hold modes where the primary progress number must stay ~0 on pure silence
 * and should advance when Space assist is allowed (non-highway).
 */
const AIR_HOLD_MODES = new Set(["shAirLadder", "breathS"]);

/** Pitch hold UI (engine holdSec / data-h) — silence must not free-run */
const PITCH_HOLD_UI_MODES = new Set(["pitchHold", "humTargets"]);

/**
 * Modes where wall-clock phase timers tick without sound (not a silence bug).
 * Do NOT treat [data-remain] as sound-gated count.
 */
const WALL_CLOCK_PHASE_MODES = new Set([
  "rateLadder",
  "metronomeSpeech",
  "staccatoLegato",
  "volumeLadder",
  "volumeSteady",
  "storyTimer",
  "keyPointPace",
  "facePhases",
  "countPace",
  "dynamicSwell"
]);

/** Broader set: silence should not inflate *sound progress* counters */
const SOUND_GATED_MODES = new Set([
  ...AIR_HOLD_MODES,
  ...PITCH_HOLD_UI_MODES,
  "sovtFlow",
  "pitchMatch",
  "pitchChord",
  "scaleSteps",
  "sirenRange",
  "onsetReps",
  "pitchSong",
  "pitchContour"
]);

function isSoundGated(mode) {
  return SOUND_GATED_MODES.has(mode);
}

function isAirHoldMode(mode) {
  return AIR_HOLD_MODES.has(mode);
}

function isWallClockPhase(mode) {
  return WALL_CLOCK_PHASE_MODES.has(mode);
}

/** Best numeric proxy for "sound progress" for silence assertions */
function soundProgress(probe) {
  if (!probe) return null;
  if (probe.holdVal != null) return probe.holdVal;
  if (probe.engHoldSec != null) return probe.engHoldSec;
  if (probe.shortNotes != null || probe.longNotes != null) {
    return (probe.shortNotes || 0) + (probe.longNotes || 0);
  }
  if (probe.easyOnsets != null) return probe.easyOnsets;
  if (probe.cleared != null) return probe.cleared;
  return null;
}

/**
 * @param {import('@playwright/test').Page} page
 * @param {string} sel
 */
async function styleSnapshot(page, sel) {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const st = getComputedStyle(el);
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {
      exists: true,
      tag: el.tagName,
      id: el.id,
      className: String(el.className || "").slice(0, 120),
      bbox: {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        x2: r.x + r.width,
        y2: r.y + r.height
      },
      visible:
        st.display !== "none" &&
        st.visibility !== "hidden" &&
        !el.hasAttribute("hidden") &&
        r.width > 0 &&
        r.height > 0,
      cursor: st.cursor,
      filter: st.filter,
      boxShadow: st.boxShadow,
      transform: st.transform,
      backgroundColor: st.backgroundColor,
      color: st.color,
      opacity: st.opacity,
      hitSelf: !!(top && (top === el || el.contains(top))),
      hitTop: top
        ? { id: top.id, tag: top.tagName, cls: String(top.className || "").slice(0, 60) }
        : null
    };
  }, sel);
}

/**
 * @param {object|null} before
 * @param {object|null} after
 */
function hoverFeedback(before, after) {
  if (!before || !after) return { ok: false, reason: "missing_snapshot" };
  const keys = ["filter", "boxShadow", "transform", "backgroundColor", "color", "opacity", "cursor"];
  const changed = keys.filter((k) => before[k] !== after[k]);
  // Intentional hover translateY(~1px) is OK; flag only real jumps
  const dx = Math.abs((after.bbox?.x || 0) - (before.bbox?.x || 0));
  const dy = Math.abs((after.bbox?.y || 0) - (before.bbox?.y || 0));
  const layoutShift = dx > 3 || dy > 3;
  return {
    ok: changed.length > 0 || after.cursor === "pointer",
    changed,
    layoutShift,
    hitSelfAfter: !!after.hitSelf
  };
}

/**
 * List visible interactive controls inside the exercise view (buttons, checkboxes, ranges, selects).
 * @param {import('@playwright/test').Page} page
 * @returns {Promise<Array<{id:string,tag:string,role:string,label:string,kind:string}>>}
 */
async function listExerciseControls(page) {
  return page.evaluate(() => {
    const root = document.getElementById("view-exercise") || document.body;
    const nodes = root.querySelectorAll(
      [
        "button:not([hidden])",
        "input[type=checkbox]:not([hidden])",
        "input[type=range]:not([hidden])",
        "select:not([hidden])",
        "a.btn:not([hidden])",
        "#mode-focus button",
        "#mode-hud button",
        "#prog-buttons button"
      ].join(",")
    );
    const out = [];
    const seen = new Set();
    for (const el of nodes) {
      if (el.closest("[hidden]")) continue;
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || st.pointerEvents === "none") continue;
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      // Skip truly disabled
      if (el.disabled) continue;
      let id = el.id || "";
      if (!id) {
        // stable synthetic id for mode/prog buttons without id
        const text = (el.textContent || "").trim().slice(0, 24).replace(/\s+/g, "_");
        id = `anon-${el.tagName.toLowerCase()}-${text || out.length}`;
      }
      if (seen.has(id)) continue;
      seen.add(id);
      const tag = el.tagName;
      let kind = "button";
      if (tag === "INPUT") kind = el.type || "input";
      else if (tag === "SELECT") kind = "select";
      const label = (
        el.getAttribute("aria-label") ||
        el.getAttribute("title") ||
        el.textContent ||
        el.id ||
        ""
      )
        .trim()
        .replace(/\s+/g, " ")
        .slice(0, 60);
      out.push({
        id,
        tag,
        role: el.getAttribute("role") || "",
        label,
        kind,
        hasDomId: !!el.id
      });
    }
    return out;
  });
}

/**
 * CSS selector for a control returned by listExerciseControls.
 * @param {{id:string,hasDomId?:boolean}} c
 */
function controlSelector(c) {
  if (c.hasDomId !== false && c.id && !c.id.startsWith("anon-")) {
    return `#${CSS.escape ? CSS.escape(c.id) : c.id.replace(/([^a-zA-Z0-9_-])/g, "\\$1")}`;
  }
  // fallback: match by text in mode panels
  return null;
}

function writeReport(data) {
  ensureDir(path.dirname(REPORT_JSON));
  fs.writeFileSync(REPORT_JSON, JSON.stringify(data, null, 2));
  return REPORT_JSON;
}

/**
 * Write markdown forensic report with image index + issue findings.
 * @param {object} data same shape as JSON report
 * @param {string} [outPath]
 */
function writeMarkdownReport(data, outPath) {
  const mdPath =
    outPath ||
    path.join(ROOT, "docs", "24-LIVE-EXERCISE-FORENSICS.md");
  ensureDir(path.dirname(mdPath));
  const lines = [];
  lines.push("# Live exercise UI forensics (headed, mouse, Space, mic)");
  lines.push("");
  lines.push(`**Generated:** ${data.generatedAt || ""}`);
  lines.push(`**Mode:** ${data.mode || "live-forensics"}`);
  lines.push(`**Live duration:** ${data.liveSeconds || 10}s per exercise`);
  lines.push(`**Result:** ${data.summary?.total || 0} exercises · **${data.summary?.withIssues || 0} with issues** · P0=${(data.summary?.issues || []).filter((i) => i.sev === "P0").length}`);
  lines.push("");
  lines.push("## Aggregate");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|------:|");
  const s = data.summary || {};
  for (const [k, v] of Object.entries(s.metrics || {})) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push(`| total | ${s.total ?? ""} |`);
  lines.push(`| withIssues | ${s.withIssues ?? ""} |`);
  lines.push("");
  lines.push("## Findings / improvements");
  lines.push("");
  const issues = s.issues || [];
  if (!issues.length) {
    lines.push("_No automated P0/P1 issues._ Soft improvements listed per exercise when relevant.");
  } else {
    lines.push("| Exercise | Sev | Code | Message |");
    lines.push("|----------|-----|------|---------|");
    for (const i of issues) {
      lines.push(`| ${i.exerciseId} | ${i.sev} | ${i.code} | ${String(i.msg || "").replace(/\|/g, "/")} |`);
    }
  }
  lines.push("");
  lines.push("## Per-exercise image index + forensic notes");
  lines.push("");
  for (const e of data.exercises || []) {
    lines.push(`### ${e.id} — ${e.title || ""} (\`${e.profile?.mode || "?"}\`)`);
    lines.push("");
    if (e.issues?.length) {
      lines.push("**Issues:**");
      for (const i of e.issues) lines.push(`- **${i.sev}** \`${i.code}\`: ${i.msg}`);
      lines.push("");
    }
    if (e.forensicNotes?.length) {
      lines.push("**Notes:**");
      for (const n of e.forensicNotes) lines.push(`- ${n}`);
      lines.push("");
    }
    const imgs = e.images || [];
    if (imgs.length) {
      lines.push("| # | File | Action | Expected | Actual / verdict |");
      lines.push("|---|------|--------|----------|------------------|");
      imgs.forEach((im, idx) => {
        lines.push(
          `| ${idx + 1} | \`${im.file}\` | ${im.action || ""} | ${im.expected || ""} | ${im.verdict || im.actual || ""} |`
        );
      });
      lines.push("");
    }
    if (e.actions?.silenceGate) {
      lines.push(
        `Silence gate: soundGated=${e.actions.silenceGate.soundGated} hold0=${e.actions.silenceGate.holdBefore} hold1=${e.actions.silenceGate.holdAfter} **${e.actions.silenceGate.ok ? "PASS" : "FAIL"}**`
      );
      lines.push("");
    }
    if (e.actions?.space) {
      const sp = e.actions.space;
      lines.push(
        `Space: longHold didNotStop=${sp.longHold?.didNotStop} isManual=${sp.longHold?.midManual} shortPulse didNotStop=${sp.shortPulse?.didNotStop}`
      );
      lines.push("");
    }
  }
  lines.push("---");
  lines.push("");
  lines.push("Screenshots root: `qa/screenshots/exercise-ui/{id}/`");
  lines.push("");
  fs.writeFileSync(mdPath, lines.join("\n"));
  return mdPath;
}

module.exports = {
  SHOT_ROOT,
  REPORT_JSON,
  ensureDir,
  shot,
  scrollIntoView,
  elementCenter,
  hitAt,
  realHover,
  realClick,
  realDragX,
  spaceHold,
  practiceProbe,
  isSoundGated,
  isAirHoldMode,
  isWallClockPhase,
  soundProgress,
  SOUND_GATED_MODES,
  AIR_HOLD_MODES,
  PITCH_HOLD_UI_MODES,
  WALL_CLOCK_PHASE_MODES,
  styleSnapshot,
  hoverFeedback,
  listExerciseControls,
  controlSelector,
  writeReport,
  writeMarkdownReport
};
