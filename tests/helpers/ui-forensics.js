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
 * Probe practice engine / UI state useful for Space + live checks.
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
    const manual =
      typeof eng?.manualSound === "boolean"
        ? eng.manualSound
        : typeof eng?._manualSound === "boolean"
          ? eng._manualSound
          : null;
    return {
      live: !!(stop && !stop.hidden),
      startVisible: !!(start && !start.hidden),
      status,
      micClass: chip,
      isManual: /is-manual/.test(chip),
      holdText: holdEl?.textContent || null,
      holdVal: holdEl ? parseFloat(holdEl.textContent) : null,
      manualSound: manual,
      focusedId: document.activeElement?.id || null,
      focusedTag: document.activeElement?.tagName || null
    };
  });
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

function writeReport(data) {
  ensureDir(path.dirname(REPORT_JSON));
  fs.writeFileSync(REPORT_JSON, JSON.stringify(data, null, 2));
  return REPORT_JSON;
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
  styleSnapshot,
  hoverFeedback,
  writeReport
};
