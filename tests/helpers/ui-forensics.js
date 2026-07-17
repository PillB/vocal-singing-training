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
 * Probe practice engine / UI state useful for Space + live + count checks.
 * @param {import('@playwright/test').Page} page
 */
async function practiceProbe(page) {
  return page.evaluate(() => {
    const eng = window.VTApp?.engine || window.practiceEngine || null;
    const stop = document.querySelector("#btn-practice-stop");
    const start = document.querySelector("#btn-practice-start");
    const status = document.querySelector("#practice-status")?.textContent || "";
    const chip = document.querySelector("#mic-sens-hud")?.className || "";
    const holdEl = document.querySelector("[data-h]");
    const big = document.querySelector(".mode-big, .mode-focus .mode-big, #mode-focus .mode-big");
    const mic = document.querySelector("#mic-sensitivity");
    const modeFocus = document.getElementById("mode-focus");
    const pitchCanvas = document.getElementById("pitch-canvas");
    const manual =
      typeof eng?.manualSound === "boolean"
        ? eng.manualSound
        : typeof eng?._manualSound === "boolean"
          ? eng._manualSound
          : null;
    const holdText = holdEl?.textContent || big?.textContent || null;
    const holdNum = holdText != null ? parseFloat(String(holdText).replace(/[^\d.-]/g, "")) : null;
    // Collect any numeric chips that look like counters
    const nums = [...document.querySelectorAll("#mode-focus [data-h], #mode-focus .mode-big, #mode-hud [data-h]")]
      .map((el) => ({
        t: (el.textContent || "").trim().slice(0, 40),
        v: parseFloat(String(el.textContent || "").replace(/[^\d.-]/g, ""))
      }))
      .filter((x) => Number.isFinite(x.v));
    return {
      t: Date.now(),
      live: !!(stop && !stop.hidden),
      startVisible: !!(start && !start.hidden),
      status: (status || "").trim().slice(0, 80),
      micClass: chip,
      isManual: /is-manual/.test(chip),
      holdText: holdText ? String(holdText).trim().slice(0, 40) : null,
      holdVal: Number.isFinite(holdNum) ? holdNum : null,
      counters: nums.slice(0, 6),
      manualSound: manual,
      micValue: mic ? mic.value : null,
      modeKids: modeFocus?.children?.length || 0,
      pitchH: pitchCanvas ? pitchCanvas.getBoundingClientRect().height : 0,
      focusedId: document.activeElement?.id || null,
      focusedTag: document.activeElement?.tagName || null,
      airDetected: eng?.airDetected ?? eng?._airDetected ?? null,
      rms: typeof eng?._hfRms === "number" ? eng._hfRms : eng?.rms ?? null
    };
  });
}

/**
 * Modes where score/count/hold must NOT advance on pure silence (needs mic air or Space).
 * Timers / speech UX modes are excluded (they may tick wall-clock).
 */
const SOUND_GATED_MODES = new Set([
  "shAirLadder",
  "breathS",
  "pitchHold",
  "sovtFlow",
  "humTargets",
  "pitchMatch",
  "pitchChord",
  "scaleSteps",
  "sirenRange",
  "onsetReps",
  "dynamicSwell",
  "staccatoLegato",
  "pitchSong",
  "pitchContour"
]);

function isSoundGated(mode) {
  return SOUND_GATED_MODES.has(mode);
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
  SOUND_GATED_MODES,
  styleSnapshot,
  hoverFeedback,
  listExerciseControls,
  controlSelector,
  writeReport,
  writeMarkdownReport
};
