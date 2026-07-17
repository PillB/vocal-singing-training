/**
 * UI forensics helpers — screenshots + computed style / hit-target probes.
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
  // Layout should not jump more than 2px on hover
  const dx = Math.abs((after.bbox?.x || 0) - (before.bbox?.x || 0));
  const dy = Math.abs((after.bbox?.y || 0) - (before.bbox?.y || 0));
  const layoutShift = dx > 2 || dy > 2;
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
  styleSnapshot,
  hoverFeedback,
  writeReport
};
