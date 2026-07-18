/**
 * Layout overflow + click-log helpers for multi-format robustness tests.
 */
const fs = require("fs");
const path = require("path");

/**
 * Install capture-phase click logger + kill tour overlays (init script payload).
 * Call via page.addInitScript(installClickLogInit) or evaluate after load.
 */
function installClickLogInit() {
  try {
    window.__vtClickLog = [];
    window.__vtLayoutLog = [];
    if (!window.__vtClickLogBound) {
      window.__vtClickLogBound = true;
      document.addEventListener(
        "click",
        (e) => {
          const t =
            e.target &&
            e.target.closest &&
            e.target.closest(
              "button, a.btn, a[href], input, select, label, [role=button], .card-ex, .tab, .tier-chip"
            );
          window.__vtClickLog.push({
            t: Date.now(),
            id: (t && t.id) || "",
            tag: (t && t.tagName) || (e.target && e.target.tagName) || "",
            cls: String((t && t.className) || "").slice(0, 80),
            rawId: (e.target && e.target.id) || "",
            x: e.clientX,
            y: e.clientY,
            fs: !!document.fullscreenElement
          });
        },
        true
      );
    }
  } catch {
    /* ignore */
  }
}

/**
 * Force-hide tour / modals that steal hits.
 * @param {import('@playwright/test').Page} page
 */
async function dismissBlockingOverlays(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
    } catch {
      /* ignore */
    }
    try {
      window.VTTour?.stop?.();
      window.VTTour?.end?.();
      window.VTTour?.close?.();
      window.VTTour?.dismiss?.();
    } catch {
      /* ignore */
    }
    document.getElementById("toast")?.classList.remove("show");
    const tour = document.getElementById("tour-root");
    if (tour) {
      tour.hidden = true;
      tour.style.display = "none";
      tour.style.pointerEvents = "none";
    }
    document.body.classList.remove("tour-active");
    document.querySelectorAll(".tour-backdrop, .tour-spotlight").forEach((el) => {
      el.hidden = true;
      el.style.display = "none";
      el.style.pointerEvents = "none";
    });
    const leave = document.getElementById("leave-modal");
    if (leave) {
      document.getElementById("leave-discard")?.click();
      leave.hidden = true;
      leave.style.display = "none";
    }
    ["pricing-modal", "account-modal"].forEach((id) => {
      const el = document.getElementById(id);
      if (el) {
        el.hidden = true;
        el.style.display = "none";
      }
    });
  });
}

/**
 * Reflow practice stage (visualViewport-aware fit).
 * @param {import('@playwright/test').Page} page
 */
async function reflowStage(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.getElementById("toast")?.classList.remove("show");
    window.VTApp?.syncHeaderHeightVar?.();
    window.VTApp?.fitHighwayToViewport?.();
  });
  await page.waitForTimeout(40);
  await page.evaluate(() => window.VTApp?.fitHighwayToViewport?.());
  await page.waitForTimeout(50);
}

/**
 * Overflow / placement probe for exercise view.
 * @param {import('@playwright/test').Page} page
 */
async function probeLayout(page) {
  return page.evaluate(() => {
    const vh = window.visualViewport?.height || window.innerHeight;
    const vw = window.visualViewport?.width || window.innerWidth;
    const ot = window.visualViewport?.offsetTop || 0;
    const visualBottom = ot + vh;
    const visualRight = (window.visualViewport?.offsetLeft || 0) + vw;

    const stage = document.getElementById("highway-stage");
    const rail = document.getElementById("hud-bottom-rail");
    const start = document.getElementById("btn-practice-start");
    const stop = document.getElementById("btn-practice-stop");
    const mf = document.getElementById("mode-focus");
    const back = document.getElementById("btn-back-home");

    const box = (el) => {
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return {
        x: r.x,
        y: r.y,
        w: r.width,
        h: r.height,
        x2: r.right,
        y2: r.bottom,
        hidden: !!(el.hidden || el.getAttribute("hidden") != null)
      };
    };

    const hit = (el) => {
      if (!el) return { ok: false, reason: "missing" };
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return { ok: false, reason: "zero" };
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const top = document.elementFromPoint(cx, cy);
      const ok = !!(top && (top === el || el.contains(top)));
      return {
        ok,
        top: top
          ? { id: top.id, tag: top.tagName, cls: String(top.className || "").slice(0, 48) }
          : null
      };
    };

    const sb = box(stage);
    const rb = box(rail);
    const startB = box(start);
    const stopB = box(stop);
    const mfB = box(mf);
    const backB = box(back);

    const issues = [];
    if (sb && sb.y2 > visualBottom + 2) {
      issues.push({
        code: "stage_overflow_y",
        msg: `stage.bottom ${sb.y2.toFixed(1)} > visual ${visualBottom.toFixed(1)}`
      });
    }
    if (sb && sb.x2 > visualRight + 2) {
      issues.push({
        code: "stage_overflow_x",
        msg: `stage.right ${sb.x2.toFixed(1)} > visual ${visualRight.toFixed(1)}`
      });
    }
    if (startB && !startB.hidden) {
      if (startB.y2 > visualBottom + 2 || startB.y < ot - 2) {
        issues.push({
          code: "start_offscreen",
          msg: `Start y=${startB.y.toFixed(1)} y2=${startB.y2.toFixed(1)} vb=${visualBottom.toFixed(1)}`
        });
      }
      const hs = hit(start);
      if (!hs.ok) {
        issues.push({
          code: "start_hit_miss",
          top: hs.top,
          msg: "Start center not hit-testable"
        });
      }
    }
    if (rb && startB && !startB.hidden) {
      // Start should be inside rail vertically
      if (startB.y < rb.y - 4 || startB.y2 > rb.y2 + 4) {
        issues.push({
          code: "start_outside_rail",
          msg: `Start not within bottom rail (start ${startB.y.toFixed(0)}-${startB.y2.toFixed(0)} rail ${rb.y.toFixed(0)}-${rb.y2.toFixed(0)})`
        });
      }
    }
    // mode-focus must not cover Start center
    if (mfB && startB && !startB.hidden && mf?.classList.contains("mode-focus-live")) {
      const cx = startB.x + startB.w / 2;
      const cy = startB.y + startB.h / 2;
      if (cx >= mfB.x && cx <= mfB.x2 && cy >= mfB.y && cy <= mfB.y2) {
        const pe = getComputedStyle(mf).pointerEvents;
        if (pe !== "none") {
          // only fail if mode-focus itself (not children) receives the hit
          const top = document.elementFromPoint(cx, cy);
          if (top === mf) {
            issues.push({
              code: "mode_focus_covers_start",
              msg: "mode-focus element is top at Start center"
            });
          }
        }
      }
    }

    // Horizontal distribution: rail children should not heavily overflow stage
    if (rb && sb && rb.x2 > sb.x2 + 8) {
      issues.push({
        code: "rail_overflow_x",
        msg: `bottom rail extends past stage by ${(rb.x2 - sb.x2).toFixed(1)}px`
      });
    }

    return {
      vh,
      vw,
      visualBottom,
      stage: sb,
      rail: rb,
      start: startB,
      stop: stopB,
      modeFocus: mfB,
      back: backB,
      startHit: start ? hit(start) : null,
      stopHit: stop && !stop.hidden ? hit(stop) : null,
      backHit: back ? hit(back) : null,
      issues
    };
  });
}

/**
 * Clear click log.
 * @param {import('@playwright/test').Page} page
 */
async function clearClickLog(page) {
  await page.evaluate(() => {
    window.__vtClickLog = [];
  });
}

/**
 * Read click log (copy).
 * @param {import('@playwright/test').Page} page
 */
async function getClickLog(page) {
  return page.evaluate(() => (window.__vtClickLog || []).slice());
}

/**
 * Assert last meaningful click matches expected id (or rawId).
 * @param {import('@playwright/test').Page} page
 * @param {string} expectedId
 * @param {{ since?: number }} [opts]
 */
async function assertLastClick(page, expectedId, opts = {}) {
  const log = await getClickLog(page);
  const since = opts.since || 0;
  const recent = log.filter((e) => e.t >= since);
  const last = [...recent].reverse().find((e) => e.id || e.rawId);
  const ok =
    last &&
    (last.id === expectedId ||
      last.rawId === expectedId ||
      (last.cls && last.cls.includes(expectedId)));
  return {
    ok: !!ok,
    expected: expectedId,
    last: last || null,
    recentCount: recent.length,
    logTail: recent.slice(-5)
  };
}

/**
 * Mouse path + click center of selector; returns hit + click-log confirmation.
 * @param {import('@playwright/test').Page} page
 * @param {string} sel
 * @param {string} [expectLogId] defaults to sel without #
 */
async function mouseClickAndLog(page, sel, expectLogId) {
  const id = expectLogId || sel.replace(/^#/, "");
  await dismissBlockingOverlays(page);
  await reflowStage(page);
  const loc = page.locator(sel).first();
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  await reflowStage(page);

  const beforeN = await page.evaluate(() => (window.__vtClickLog || []).length);
  const box = await loc.boundingBox();
  if (!box || box.width < 1) {
    return { ok: false, reason: "no_box", logOk: false };
  }
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;

  // Programmatic hit check before click
  const preHit = await page.evaluate(
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

  await page.mouse.move(x - 10, y, { steps: 4 });
  await page.mouse.move(x, y, { steps: 6 });
  await page.mouse.click(x, y, { delay: 25 });

  // Confirm log received press for this control
  const logCheck = await page.evaluate(
    ({ beforeN, wantId }) => {
      const log = window.__vtClickLog || [];
      const recent = log.slice(beforeN);
      const match = [...recent]
        .reverse()
        .find(
          (e) =>
            e.id === wantId ||
            e.rawId === wantId ||
            (e.cls && e.cls.includes(wantId))
        );
      return {
        logOk: !!match,
        match: match || null,
        recent: recent.slice(-6)
      };
    },
    { beforeN, wantId: id }
  );

  // If hit missed but locator might still work, try force path for recovery
  if (!preHit.ok || !logCheck.logOk) {
    await loc.click({ timeout: 3000 }).catch(() => {});
  }

  return {
    ok: preHit.ok && logCheck.logOk,
    preHit,
    logOk: logCheck.logOk,
    match: logCheck.match,
    recent: logCheck.recent,
    bbox: box
  };
}

function writeJson(relPath, data) {
  const abs = path.isAbsolute(relPath)
    ? relPath
    : path.join(__dirname, "..", "..", relPath);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, JSON.stringify(data, null, 2));
  return abs;
}

module.exports = {
  installClickLogInit,
  dismissBlockingOverlays,
  reflowStage,
  probeLayout,
  clearClickLog,
  getClickLog,
  assertLastClick,
  mouseClickAndLog,
  writeJson
};
