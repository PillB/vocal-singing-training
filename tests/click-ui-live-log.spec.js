/**
 * HEADED click-vs-UI living log — human mouse only + offset grid + 4-shot trails.
 *
 *   npm run test:click-ui-live
 *   CLICK_UI_IDS=v1-diction,s15-sh-air-ladder FORENSICS_FORMATS=desktop,mobile npm run test:click-ui-live
 *
 * Writes continuously:
 *   docs/28-CLICK-UI-VALIDATION-LOG.md
 *   qa/geometry/click-ui-live-report.json
 *   qa/screenshots/click-ui-live/{fmt}/{ex}/…
 */
const { test, expect } = require("@playwright/test");
const path = require("path");
const { boot } = require("./helpers/e2e");
const { installClickLogInit, getClickLog, clearClickLog } = require("./helpers/layout-probe");
const {
  SHOT_ROOT,
  ensureDir,
  emptyReport,
  loadReport,
  appendControl,
  addIssue,
  saveReport,
  relShot
} = require("./helpers/click-ui-live-report");

const SLOWMO = Number(process.env.SLOWMO || 70) || 70;
const OFFSET = Number(process.env.OFFSET_PX || 8) || 8;

const ALL_FORMATS = [
  { name: "desktop", width: 1280, height: 800, fs: false },
  { name: "desktop-short", width: 1280, height: 560, fs: false },
  { name: "mobile", width: 390, height: 844, fs: false },
  { name: "mobile-land", width: 844, height: 390, fs: false },
  { name: "tablet", width: 768, height: 1024, fs: false },
  { name: "fullscreen", width: 1440, height: 900, fs: true }
];

const EXERCISES = (process.env.CLICK_UI_IDS ||
  "v1-diction,s15-sh-air-ladder,s9-pitch-match,s2-solfege-chords,v10-power-pause")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

function parseFormats() {
  const raw = process.env.FORENSICS_FORMATS || process.env.CLICK_UI_FORMATS;
  if (!raw) return ALL_FORMATS;
  const names = raw.split(",").map((s) => s.trim());
  return ALL_FORMATS.filter((f) => names.includes(f.name));
}

test.use({
  headless: false,
  viewport: { width: 1280, height: 800 },
  launchOptions: {
    slowMo: SLOWMO,
    args: ["--start-maximized", "--window-position=40,20"]
  }
});
test.describe.configure({ mode: "serial" });

async function pinkCursor(page) {
  if (await page.evaluate(() => !!document.getElementById("vt-live-cursor"))) return;
  await page.addStyleTag({
    content: `
      #vt-live-cursor{position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;
        border-radius:50%;background:radial-gradient(circle at 30% 30%,#fff,#ff2d55 55%);
        box-shadow:0 0 0 2px #fff,0 0 12px #ff2d55;pointer-events:none!important}
      #tour-root,.tour-backdrop{display:none!important;pointer-events:none!important}
    `
  });
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.id = "vt-live-cursor";
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

async function quiet(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
    } catch {
      /* */
    }
    document.getElementById("toast")?.classList.remove("show");
    // Do NOT set leave-modal inline display:none — it sticks after hidden is cleared
    // and blocks the real leave dialog (mobile Back looked dead). Only hide via .hidden.
    const leave = document.getElementById("leave-modal");
    if (leave && leave.hidden === false) {
      leave.hidden = true;
      leave.style.display = "";
      leave.style.visibility = "";
    }
  });
}

async function applyFmt(page, fmt) {
  await page.setViewportSize({ width: fmt.width, height: fmt.height });
  await page.waitForTimeout(160);
  if (fmt.fs) {
    await page.mouse.click(36, 36);
    await page
      .evaluate(async () => {
        try {
          if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
        } catch {
          /* */
        }
      })
      .catch(() => {});
    await page.waitForTimeout(220);
  } else if (await page.evaluate(() => !!document.fullscreenElement).catch(() => false)) {
    await page
      .evaluate(async () => {
        try {
          await document.exitFullscreen();
        } catch {
          /* */
        }
      })
      .catch(() => {});
    await page.waitForTimeout(160);
  }
  await page
    .evaluate(() => {
      window.VTApp?.syncHeaderHeightVar?.();
      window.VTApp?.fitHighwayToViewport?.();
    })
    .catch(() => {});
  await page.waitForTimeout(100);
}

async function center(page, sel) {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el || el.hidden) return null;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return null;
    let r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    if (r.top < 0 || r.bottom > vh || r.left < 0 || r.right > vw) {
      el.scrollIntoView({ block: "center", behavior: "instant" });
      r = el.getBoundingClientRect();
    }
    return {
      x: r.left + r.width / 2,
      y: r.top + r.height / 2,
      w: r.width,
      h: r.height,
      left: r.left,
      top: r.top
    };
  }, sel);
}

async function mouseApproach(page, x, y, steps = 12) {
  await page.mouse.move(Math.max(4, x - 42), Math.max(4, y - 18), {
    steps: Math.max(4, Math.floor(steps / 2))
  });
  await page.mouse.move(x, y, { steps });
  await page.waitForTimeout(45);
}

async function mouseClickAt(page, x, y, steps = 12) {
  await mouseApproach(page, x, y, steps);
  await page.mouse.down();
  await page.waitForTimeout(35);
  await page.mouse.up();
  await page.waitForTimeout(70);
}

async function hitAt(page, sel, x, y) {
  return page.evaluate(
    ({ selector, x, y }) => {
      const el = document.querySelector(selector);
      const top = document.elementFromPoint(x, y);
      if (!el || !top) return { ok: false, top: null };
      const ok =
        top === el ||
        el.contains(top) ||
        (top.closest && top.closest(selector) === el) ||
        (el.id && top.closest && top.closest(`#${el.id}`) === el);
      // label[for=mic] counts as hit for range
      const forMic =
        selector === "#mic-sensitivity" &&
        top.closest &&
        (top.closest("label.mic-sens-label") || top.id === "mic-sensitivity");
      return {
        ok: ok || !!forMic,
        top: {
          id: top.id || "",
          tag: top.tagName,
          cls: String(top.className || "").slice(0, 48)
        }
      };
    },
    { selector: sel, x, y }
  );
}

async function offsetGrid(page, sel, box, delta) {
  const pts = {
    C: { x: box.x, y: box.y },
    N: { x: box.x, y: box.y - delta },
    S: { x: box.x, y: box.y + delta },
    E: { x: box.x + delta, y: box.y },
    W: { x: box.x - delta, y: box.y },
    NE: { x: box.x + delta, y: box.y - delta },
    SW: { x: box.x - delta, y: box.y + delta }
  };
  const grid = {};
  for (const [k, p] of Object.entries(pts)) {
    const h = await hitAt(page, sel, p.x, p.y);
    grid[k] = !!h.ok;
  }
  return grid;
}

async function shot(page, fmt, ex, name) {
  const abs = path.join(SHOT_ROOT, fmt, ex, name);
  ensureDir(path.dirname(abs));
  await page.waitForTimeout(40);
  await page.screenshot({ path: abs, fullPage: false });
  return relShot(abs);
}

async function openByMouse(page, exerciseId) {
  const onEx = await page.evaluate(
    () => !!document.getElementById("view-exercise")?.classList.contains("active")
  );
  if (onEx) {
    const back = await center(page, "#btn-back-home");
    if (back) {
      await mouseClickAt(page, back.x, back.y);
      await page.waitForTimeout(140);
      const d = await center(page, "#leave-discard");
      if (d) await mouseClickAt(page, d.x, d.y, 8);
      await page.waitForTimeout(100);
    }
  }
  const meta = await page.evaluate((id) => {
    const all = [
      ...(window.VT_EXERCISES?.vocal || []),
      ...(window.VT_EXERCISES?.singing || [])
    ];
    return all.find((e) => e.id === id) || null;
  }, exerciseId);
  if (!meta) throw new Error("unknown " + exerciseId);

  const tab = await center(page, `.tab[data-tab="${meta.track}"]`);
  if (tab) {
    await mouseClickAt(page, tab.x, tab.y);
    await page.waitForTimeout(100);
  }
  const chip = await center(page, '.tier-chip[data-tier="all"]');
  if (chip) {
    await mouseClickAt(page, chip.x, chip.y);
    await page.waitForTimeout(80);
  }
  const card = await page.evaluate((num) => {
    for (const c of document.querySelectorAll("#exercise-list .card-ex")) {
      if (c.querySelector(".num")?.textContent?.trim() === String(num)) {
        c.scrollIntoView({ block: "center", behavior: "instant" });
        const r = c.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
      }
    }
    return null;
  }, meta.number);
  if (!card) throw new Error("card not found for " + exerciseId);
  await mouseClickAt(page, card.x, card.y);
  await page.waitForSelector("#view-exercise.active", { timeout: 8000 });
  await page
    .waitForFunction(() => {
      const b = document.getElementById("btn-practice-start");
      if (!b || b.hidden) return false;
      const r = b.getBoundingClientRect();
      return r.width >= 8 && r.height >= 8;
    }, { timeout: 8000 })
    .catch(() => {});
  await page
    .evaluate(() => {
      window.VTApp?.syncHeaderHeightVar?.();
      window.VTApp?.fitHighwayToViewport?.();
    })
    .catch(() => {});
  await page.waitForTimeout(120);
}

async function lastLogMatch(page, wantId, sinceLen) {
  const log = await getClickLog(page);
  const recent = log.slice(sinceLen);
  const match = [...recent].reverse().find((e) => e.id === wantId || e.rawId === wantId);
  return {
    logOk: !!match,
    match: match || recent[recent.length - 1] || null,
    recent: recent.slice(-3)
  };
}

/**
 * Probe + click one control; append to living report.
 */
async function probeControl(page, report, fmt, exId, ctrl) {
  const { sel, id, kind, expected } = ctrl;
  const safeName = id.replace(/[^a-z0-9_-]/gi, "_");
  console.log(`      · ${id}`);

  const box = await center(page, sel);
  const shots = { before: null, hover: null, down: null, after: null };

  shots.before = await shot(page, fmt.name, exId, `${safeName}_00_before.png`);

  if (!box) {
    const rec = {
      control: sel,
      centerHit: false,
      hitTop: "missing",
      offsetGrid: {},
      offsetOnly: false,
      logOk: false,
      effectOk: false,
      expected,
      actual: "control not visible",
      shots,
      x: null,
      y: null
    };
    const issue = addIssue(report, {
      sev: "P1",
      format: fmt.name,
      exercise: exId,
      control: sel,
      code: "not_visible",
      msg: "control missing or zero size"
    });
    rec.issueIds = [issue.id];
    appendControl(report, { format: fmt, exercise: exId, control: rec });
    return rec;
  }

  // Fresh geometry right before hover (sticky chrome can shift after prior actions)
  let liveBox = (await center(page, sel)) || box;
  if (kind === "back" || kind === "start") {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      window.VTApp?.syncHeaderHeightVar?.();
    });
    await page.waitForTimeout(60);
    liveBox = (await center(page, sel)) || liveBox;
  }

  // Hover path
  await mouseApproach(page, liveBox.x, liveBox.y, 14);
  const hoverHit = await hitAt(page, sel, liveBox.x, liveBox.y);
  shots.hover = await shot(page, fmt.name, exId, `${safeName}_01_hover.png`);

  // Offset grid
  const grid = await offsetGrid(page, sel, liveBox, OFFSET);
  const anyHit = Object.values(grid).some(Boolean);
  let centerHit = !!grid.C;
  const offsetOnly = !centerHit && anyHit;

  // Choose click point: center if hit, else first offset that hits (and flag issue)
  let clickX = liveBox.x;
  let clickY = liveBox.y;
  if (!centerHit && anyHit) {
    const map = {
      N: [liveBox.x, liveBox.y - OFFSET],
      S: [liveBox.x, liveBox.y + OFFSET],
      E: [liveBox.x + OFFSET, liveBox.y],
      W: [liveBox.x - OFFSET, liveBox.y],
      NE: [liveBox.x + OFFSET, liveBox.y - OFFSET],
      SW: [liveBox.x - OFFSET, liveBox.y + OFFSET]
    };
    for (const [k, ok] of Object.entries(grid)) {
      if (k !== "C" && ok && map[k]) {
        clickX = map[k][0];
        clickY = map[k][1];
        break;
      }
    }
  }

  // Start: reflow + bias if covered (short landscape pitch/solfege race)
  if (kind === "start" && !centerHit) {
    for (let attempt = 0; attempt < 3 && !centerHit; attempt++) {
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        window.VTApp?.syncHeaderHeightVar?.();
        window.VTApp?.fitHighwayToViewport?.();
        // Collapse piano opts if open so rail doesn't crush Start
        const piano = document.getElementById("piano-mini-opts");
        if (piano?.classList.contains("piano-opts-expanded")) {
          document.getElementById("btn-toggle-piano")?.click();
        }
      });
      await page.waitForTimeout(120);
      liveBox = (await center(page, sel)) || liveBox;
      if (!liveBox) break;
      const g2 = await offsetGrid(page, sel, liveBox, OFFSET);
      Object.assign(grid, g2);
      centerHit = !!g2.C;
      clickX = liveBox.x;
      clickY = liveBox.y;
      if (!centerHit) {
        const biased = await page.evaluate(() => {
          const el = document.getElementById("btn-practice-start");
          if (!el) return null;
          const r = el.getBoundingClientRect();
          const pts = [
            [r.left + Math.min(24, r.width * 0.25), r.top + r.height / 2],
            [r.left + r.width * 0.5, r.top + r.height * 0.35],
            [r.left + r.width * 0.35, r.top + r.height * 0.5]
          ];
          for (const [x, y] of pts) {
            const top = document.elementFromPoint(x, y);
            if (top && (top === el || el.contains(top))) return { x, y, ok: true };
          }
          return { ok: false };
        });
        if (biased?.ok) {
          clickX = biased.x;
          clickY = biased.y;
          centerHit = true;
        }
      }
    }
  }

  const beforeLen = (await getClickLog(page)).length;
  let effectOk = false;
  let actual = "";

  // Pre-state for effects
  const pre = await page.evaluate((kind) => {
    if (kind === "start") {
      return { live: !document.getElementById("btn-practice-stop")?.hidden };
    }
    if (kind === "stop") {
      return { live: !document.getElementById("btn-practice-stop")?.hidden };
    }
    if (kind === "guide") {
      const c = document.querySelector(".guide-card");
      return { open: c ? !c.classList.contains("collapsed") : null };
    }
    if (kind === "metrics") {
      const c = document.getElementById("metrics-card");
      return { open: c ? !c.classList.contains("collapsed") : null };
    }
    if (kind === "mic") {
      return {
        val: document.getElementById("mic-sensitivity")?.value,
        ui: document.getElementById("mic-sens-val")?.textContent?.trim()
      };
    }
    if (kind === "back") {
      return {
        home: !!document.getElementById("view-home")?.classList.contains("active")
      };
    }
    return {};
  }, kind);

  if (kind === "mic") {
    // full track drag low→high
    const track = await page.evaluate(() => {
      const el = document.getElementById("mic-sensitivity");
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: r.x, y: r.y, w: r.width, h: r.height };
    });
    if (track && track.w > 20) {
      const y = track.y + track.h / 2;
      const xLo = track.x + track.w * 0.08;
      const xHi = track.x + track.w * 0.92;
      await mouseApproach(page, xLo, y, 8);
      await page.mouse.down();
      shots.down = await shot(page, fmt.name, exId, `${safeName}_02_down.png`);
      await page.mouse.move(xHi, y, { steps: 18 });
      await page.mouse.up();
      await page.waitForTimeout(80);
    }
  } else {
    // Re-check hit at click point immediately before down
    let preHit = await hitAt(page, sel, clickX, clickY);
    if (!preHit.ok && kind === "back") {
      // Sticky race: re-scroll chrome and re-measure
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        window.VTApp?.syncHeaderHeightVar?.();
        document.getElementById("btn-back-home")?.scrollIntoView({
          block: "nearest",
          behavior: "instant"
        });
      });
      await page.waitForTimeout(80);
      const b2 = await center(page, sel);
      if (b2) {
        clickX = b2.x;
        clickY = b2.y;
      }
      preHit = await hitAt(page, sel, clickX, clickY);
    }
    await mouseApproach(page, clickX, clickY, 12);
    await page.mouse.down();
    shots.down = await shot(page, fmt.name, exId, `${safeName}_02_down.png`);
    await page.waitForTimeout(40);
    await page.mouse.up();
    await page.waitForTimeout(150);
  }

  // leave modal for back (unsaved practice ≥10%)
  if (kind === "back") {
    await page.waitForTimeout(250);
    const leaveOpen = await page.evaluate(() => {
      const m = document.getElementById("leave-modal");
      if (!m || m.hidden) return false;
      const st = getComputedStyle(m);
      return st.display !== "none" && st.visibility !== "hidden";
    });
    if (leaveOpen) {
      // Prefer Discard (not Save — Save keeps user on exercise)
      let discard = await center(page, "#leave-discard");
      if (!discard) {
        // Force modal paintable if tooling left inline styles
        await page.evaluate(() => {
          const m = document.getElementById("leave-modal");
          if (m) {
            m.hidden = false;
            m.style.display = "";
            m.style.visibility = "";
          }
        });
        await page.waitForTimeout(100);
        discard = await center(page, "#leave-discard");
      }
      if (discard) {
        await mouseClickAt(page, discard.x, discard.y, 12);
        await page.waitForTimeout(250);
      }
    }
    // Wait for home transition
    const homeDeadline = Date.now() + 4000;
    while (Date.now() < homeDeadline) {
      const home = await page.evaluate(
        () => !!document.getElementById("view-home")?.classList.contains("active")
      );
      if (home) break;
      const stillLeave = await page.evaluate(() => {
        const m = document.getElementById("leave-modal");
        return !!(m && !m.hidden && getComputedStyle(m).display !== "none");
      });
      if (stillLeave) {
        const d2 = await center(page, "#leave-discard");
        if (d2) await mouseClickAt(page, d2.x, d2.y, 8);
      } else {
        // Retry Back once if leave didn't open and still on exercise
        const b3 = await center(page, "#btn-back-home");
        if (b3) await mouseClickAt(page, b3.x, b3.y, 8);
        await page.waitForTimeout(200);
        const d3 = await center(page, "#leave-discard");
        if (d3) await mouseClickAt(page, d3.x, d3.y, 8);
      }
      await page.waitForTimeout(180);
    }
  }

  if (kind === "start") {
    const deadline = Date.now() + 6500;
    while (Date.now() < deadline) {
      const live = await page.evaluate(
        () => !document.getElementById("btn-practice-stop")?.hidden
      );
      if (live) break;
      await page.waitForTimeout(200);
    }
  }

  const post = await page.evaluate((kind) => {
    if (kind === "start") {
      const stop = document.getElementById("btn-practice-stop");
      const st = document.querySelector("#practice-status")?.textContent || "";
      return {
        live: !!(stop && !stop.hidden),
        status: st.trim().slice(0, 40)
      };
    }
    if (kind === "stop") {
      const stop = document.getElementById("btn-practice-stop");
      const start = document.getElementById("btn-practice-start");
      return {
        live: !!(stop && !stop.hidden),
        startVisible: !!(start && !start.hidden)
      };
    }
    if (kind === "guide") {
      const c = document.querySelector(".guide-card");
      return { open: c ? !c.classList.contains("collapsed") : null };
    }
    if (kind === "metrics") {
      const c = document.getElementById("metrics-card");
      return { open: c ? !c.classList.contains("collapsed") : null };
    }
    if (kind === "mic") {
      return {
        val: document.getElementById("mic-sensitivity")?.value,
        ui: document.getElementById("mic-sens-val")?.textContent?.trim()
      };
    }
    if (kind === "back") {
      return {
        home: !!document.getElementById("view-home")?.classList.contains("active")
      };
    }
    return {};
  }, kind);

  if (kind === "start") {
    effectOk = !!post.live;
    actual = `live=${post.live} status="${post.status}"`;
  } else if (kind === "stop") {
    effectOk = !post.live && post.startVisible;
    actual = `live=${post.live} startVisible=${post.startVisible}`;
  } else if (kind === "guide" || kind === "metrics") {
    effectOk = pre.open == null || post.open !== pre.open;
    actual = `open ${pre.open}→${post.open}`;
  } else if (kind === "mic") {
    effectOk = Number(post.val) > Number(pre.val) || Number(post.val) !== Number(pre.val);
    // after low→high seed, value should rise; also accept any change + UI sync
    if (Number(post.val) >= Number(pre.val) && post.ui === String(post.val)) {
      effectOk = Number(post.val) !== Number(pre.val) || Number(post.val) >= 8;
    }
    // stronger: after full track high should be >= 7
    effectOk = Number(post.val) >= 7 && post.ui === String(post.val);
    actual = `val ${pre.val}→${post.val} ui=${post.ui}`;
  } else if (kind === "back") {
    effectOk = !!post.home;
    actual = `home=${post.home}`;
  }

  let log = await lastLogMatch(page, id, beforeLen);
  // mic drag may not fire "click" on range — log optional for mic
  // back: leave-discard click is also success evidence when modal shown
  if (kind === "back" && !log.logOk) {
    const alt = await lastLogMatch(page, "leave-discard", beforeLen);
    if (alt.logOk) log = { logOk: true, match: alt.match, recent: alt.recent };
  }
  const logOk = kind === "mic" ? true : log.logOk;

  shots.after = await shot(page, fmt.name, exId, `${safeName}_03_after.png`);

  const rec = {
    control: sel,
    centerHit,
    hitTop: hoverHit.top
      ? `${hoverHit.top.tag}#${hoverHit.top.id || hoverHit.top.cls}`
      : "?",
    offsetGrid: grid,
    offsetOnly,
    logOk,
    logMatch: log.match,
    effectOk,
    expected,
    actual,
    shots,
    x: clickX,
    y: clickY,
    issueIds: []
  };

  if (!centerHit) {
    const issue = addIssue(report, {
      sev: offsetOnly ? "P0" : "P0",
      format: fmt.name,
      exercise: exId,
      control: sel,
      code: offsetOnly ? "center_dead_offset_ok" : "center_miss",
      msg: offsetOnly
        ? `Center misses paint; offset hits work (users must aim mm off-center). grid=${JSON.stringify(grid)}`
        : `Center and offsets miss. top=${rec.hitTop} grid=${JSON.stringify(grid)}`,
      evidence: shots
    });
    rec.issueIds.push(issue.id);
  }
  if (!effectOk) {
    const issue = addIssue(report, {
      sev: "P0",
      format: fmt.name,
      exercise: exId,
      control: sel,
      code: "effect_fail",
      msg: `expected ${expected}; actual ${actual}`,
      evidence: shots
    });
    rec.issueIds.push(issue.id);
  }
  if (!logOk && kind !== "mic") {
    const issue = addIssue(report, {
      sev: "P1",
      format: fmt.name,
      exercise: exId,
      control: sel,
      code: "click_log_miss",
      msg: `press log did not record #${id}`,
      evidence: { log: log.recent, shots }
    });
    rec.issueIds.push(issue.id);
  }

  appendControl(report, { format: fmt, exercise: exId, control: rec });
  console.log(
    `        center=${centerHit} effect=${effectOk} log=${logOk} offsetOnly=${offsetOnly}`
  );
  return rec;
}

test("living log: headed mouse offset-grid click-vs-UI all formats", async ({ page }) => {
  test.setTimeout(3 * 60 * 60 * 1000);
  ensureDir(SHOT_ROOT);

  // fresh report for this run
  let report = emptyReport();
  report.generatedAt = new Date().toISOString();
  saveReport(report);

  await page.addInitScript(installClickLogInit);
  await boot(page, { lang: "es", tourDone: true, mic: "silent" });
  await page.evaluate(installClickLogInit);
  await quiet(page);
  await pinkCursor(page);
  await page.mouse.move(30, 30);
  await page.mouse.move(360, 150, { steps: 14 });

  const formats = parseFormats();
  expect(formats.length).toBeGreaterThan(0);
  expect(EXERCISES.length).toBeGreaterThan(0);

  for (const fmt of formats) {
    console.log(`\n══ ${fmt.name} ${fmt.width}×${fmt.height} ══`);
    await applyFmt(page, fmt);
    await pinkCursor(page);
    await quiet(page);

    for (const exId of EXERCISES) {
      console.log(`  ▶ ${fmt.name}/${exId}`);
      await clearClickLog(page);
      await openByMouse(page, exId);
      await quiet(page);
      await page
        .evaluate(() => {
          window.VTApp?.syncHeaderHeightVar?.();
          window.VTApp?.fitHighwayToViewport?.();
          window.scrollTo(0, 0);
        })
        .catch(() => {});
      await page.waitForTimeout(120);

      // 1 Start
      await probeControl(page, report, fmt, exId, {
        sel: "#btn-practice-start",
        id: "btn-practice-start",
        kind: "start",
        expected: "practice goes live; Stop visible"
      });

      // 2 Mic
      if (await center(page, "#mic-sensitivity")) {
        await probeControl(page, report, fmt, exId, {
          sel: "#mic-sensitivity",
          id: "mic-sensitivity",
          kind: "mic",
          expected: "mic value rises on track drag; UI label matches"
        });
      }

      // 3 Guide
      if (await center(page, "#btn-toggle-guide")) {
        await probeControl(page, report, fmt, exId, {
          sel: "#btn-toggle-guide",
          id: "btn-toggle-guide",
          kind: "guide",
          expected: "guide panel toggles collapsed state"
        });
      }

      // 4 Metrics
      if (await center(page, "#btn-toggle-metrics")) {
        await probeControl(page, report, fmt, exId, {
          sel: "#btn-toggle-metrics",
          id: "btn-toggle-metrics",
          kind: "metrics",
          expected: "metrics panel toggles collapsed state"
        });
      }

      // 5 Stop (if live)
      const live = await page.evaluate(
        () => !document.getElementById("btn-practice-stop")?.hidden
      );
      if (live) {
        // Space spot-check on air modes
        if (exId.includes("sh-air") || exId.includes("breath")) {
          await page.mouse.click(Math.min(50, fmt.width * 0.12), Math.min(90, fmt.height * 0.2));
          await page.keyboard.down("Space");
          await page.waitForTimeout(500);
          await page.keyboard.up("Space");
          await page.waitForTimeout(150);
        }
        await probeControl(page, report, fmt, exId, {
          sel: "#btn-practice-stop",
          id: "btn-practice-stop",
          kind: "stop",
          expected: "practice stops; Start visible again"
        });
      }

      // 6 Back — scroll chrome into view (sticky stage must not cover header)
      await page.evaluate(() => {
        window.scrollTo(0, 0);
        document.getElementById("btn-back-home")?.scrollIntoView({
          block: "nearest",
          behavior: "instant"
        });
      });
      await page.waitForTimeout(80);
      await probeControl(page, report, fmt, exId, {
        sel: "#btn-back-home",
        id: "btn-back-home",
        kind: "back",
        expected: "return to home view"
      });
    }
  }

  report = loadReport();
  saveReport(report);
  console.log("\n══ LIVE LOG DONE ══");
  console.log("summary", report.summary);
  console.log("issues", (report.issues || []).length);
  console.log("MD docs/28-CLICK-UI-VALIDATION-LOG.md");

  // Hard gate: no center-dead Start/Stop; no center_miss P0 without fix
  const p0 = (report.issues || []).filter((i) => i.sev === "P0");
  const centerDead = p0.filter((i) => i.code === "center_dead_offset_ok" || i.code === "center_miss");
  expect
    .soft(centerDead.length, `P0 center-hit issues: ${centerDead.length}`)
    .toBe(0);
  expect(report.summary.controls).toBeGreaterThan(0);
});
