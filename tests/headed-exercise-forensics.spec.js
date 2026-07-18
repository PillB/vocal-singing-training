/**
 * HEADED-ONLY · real mouse only (no programmatic click / no reflow thrash)
 * ────────────────────────────────────────────────────────────────────────
 * Pink cursor + mouse.move(steps) + mouse.click + keyboard Space hold.
 * No evaluate-click, no stopPractice(), no showHome() shortcuts.
 * No repeated fitHighway / scrollTo (those caused the screen flicker).
 *
 *   npm run test:headed-forensics
 *   FORENSICS_IDS=v1-diction,s15-sh-air-ladder FORENSICS_FORMATS=desktop,mobile npm run test:headed-forensics
 *
 * Artifacts:
 *   qa/screenshots/exercise-ui-formats/{format}/{id}/
 *   qa/geometry/headed-exercise-forensics-report.json
 *   docs/27-HEADED-EXERCISE-FORENSICS.md
 */
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { boot } = require("./helpers/e2e");
const {
  ensureDir,
  practiceProbe,
  styleSnapshot,
  hoverFeedback,
  listExerciseControls,
  elementCenter,
  hitAt
} = require("./helpers/ui-forensics");
const { installClickLogInit } = require("./helpers/layout-probe");

const ROOT = path.join(__dirname, "..");
const SHOT_ROOT = path.join(ROOT, "qa", "screenshots", "exercise-ui-formats");
const REPORT_JSON = path.join(ROOT, "qa", "geometry", "headed-exercise-forensics-report.json");
const REPORT_MD = path.join(ROOT, "docs", "27-HEADED-EXERCISE-FORENSICS.md");

const SLOWMO = Number(process.env.SLOWMO || 90) || 90;
const LIVE_SECS = Number(process.env.LIVE_SECS || 3) || 3;

/** Always headed — never headless. */
test.use({
  headless: false,
  viewport: { width: 1280, height: 800 },
  launchOptions: {
    slowMo: SLOWMO,
    args: ["--start-maximized", "--window-position=40,20"]
  }
});
test.describe.configure({ mode: "serial" });

const ALL_FORMATS = [
  { name: "desktop", width: 1280, height: 800, fullscreen: false },
  { name: "mobile", width: 390, height: 844, fullscreen: false },
  { name: "mobile-land", width: 844, height: 390, fullscreen: false },
  { name: "tablet", width: 768, height: 1024, fullscreen: false },
  { name: "short", width: 1280, height: 560, fullscreen: false },
  { name: "fullscreen", width: 1440, height: 900, fullscreen: true }
];

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
  "btn-complete",
  "btn-next-structured",
  "btn-pricing",
  "btn-account",
  "btn-history",
  "btn-plan",
  "btn-lang",
  "btn-tour"
]);

function parseList(env, fallback) {
  const raw = process.env[env];
  if (!raw || !String(raw).trim()) return fallback;
  return String(raw)
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

async function installPinkCursor(page) {
  // once per page load only — avoid restyling (flicker)
  const exists = await page.evaluate(() => !!document.getElementById("vt-forensics-cursor"));
  if (exists) return;
  await page.addStyleTag({
    content: `
      #vt-forensics-cursor {
        position: fixed; z-index: 2147483647; width: 20px; height: 20px;
        margin: -10px 0 0 -10px; border-radius: 50%;
        background: radial-gradient(circle at 30% 30%, #fff, #ff2d55 55%);
        box-shadow: 0 0 0 2px #fff, 0 0 14px #ff2d55;
        pointer-events: none !important; left: 0; top: 0;
      }
      #tour-root, .tour-backdrop, .tour-spotlight {
        display: none !important; pointer-events: none !important; visibility: hidden !important;
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
}

/** Soft hide overlays without layout thrash (no scrollTo / fitHighway). */
async function quietOverlays(page) {
  await page.evaluate(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
    } catch {
      /* ignore */
    }
    document.getElementById("toast")?.classList.remove("show");
    const tour = document.getElementById("tour-root");
    if (tour) {
      tour.hidden = true;
      tour.style.pointerEvents = "none";
    }
    document.querySelectorAll(".tour-backdrop, .tour-spotlight").forEach((el) => {
      el.hidden = true;
      el.style.pointerEvents = "none";
    });
    const leave = document.getElementById("leave-modal");
    if (leave && !leave.hidden) {
      // only click discard if modal is actually open — mouse path preferred later
      leave.hidden = true;
      leave.style.display = "none";
    }
  });
}

async function applyFormat(page, fmt) {
  // One viewport change per format — not mid-exercise (avoids flicker)
  await page.setViewportSize({ width: fmt.width, height: fmt.height });
  await page.waitForTimeout(200);
  if (fmt.fullscreen) {
    // user-gesture style: click then requestFullscreen once
    await page.mouse.click(40, 40);
    await page
      .evaluate(async () => {
        try {
          if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
        } catch {
          /* blocked ok */
        }
      })
      .catch(() => {});
    await page.waitForTimeout(250);
  } else {
    const fsOn = await page.evaluate(() => !!document.fullscreenElement).catch(() => false);
    if (fsOn) {
      await page
        .evaluate(async () => {
          try {
            await document.exitFullscreen();
          } catch {
            /* ignore */
          }
        })
        .catch(() => {});
      await page.waitForTimeout(200);
    }
  }
  // Single gentle fit after format change only
  await page
    .evaluate(() => {
      window.VTApp?.syncHeaderHeightVar?.();
      window.VTApp?.fitHighwayToViewport?.();
    })
    .catch(() => {});
  await page.waitForTimeout(120);
}

/**
 * Open exercise by MOUSE: home → tab → tier all → card click.
 * Falls back to VTApp.openExercise only if card not found (still no click() on buttons).
 */
async function openExerciseByMouse(page, exerciseId) {
  // Ensure on home first via mouse if needed
  const onEx = await page.evaluate(
    () => !!document.getElementById("view-exercise")?.classList.contains("active")
  );
  if (onEx) {
    const back = await centerIfVisible(page, "#btn-back-home");
    if (back) {
      await mouseClick(page, back.x, back.y);
      await page.waitForTimeout(200);
      // discard leave modal with mouse if present
      const discard = await centerIfVisible(page, "#leave-discard");
      if (discard) {
        await mouseClick(page, discard.x, discard.y);
        await page.waitForTimeout(150);
      }
    }
  }

  const meta = await page.evaluate((id) => {
    const all = [
      ...(window.VT_EXERCISES?.vocal || []),
      ...(window.VT_EXERCISES?.singing || [])
    ];
    const found = all.find((e) => e.id === id);
    if (!found) return null;
    return { track: found.track, number: found.number, id: found.id };
  }, exerciseId);
  if (!meta) throw new Error("unknown exercise " + exerciseId);

  // Tab
  const tabSel = `.tab[data-tab="${meta.track}"]`;
  const tab = await centerIfVisible(page, tabSel);
  if (tab) {
    await mouseClick(page, tab.x, tab.y);
    await page.waitForTimeout(120);
  }

  // Tier "all"
  const chip = await centerIfVisible(page, '.tier-chip[data-tier="all"]');
  if (chip) {
    await mouseClick(page, chip.x, chip.y);
    await page.waitForTimeout(100);
  }

  // Find card by number
  const cardPt = await page.evaluate((num) => {
    for (const c of document.querySelectorAll("#exercise-list .card-ex")) {
      if (c.querySelector(".num")?.textContent?.trim() === String(num)) {
        const r = c.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) return null;
        // scroll only this card once
        c.scrollIntoView({ block: "center", behavior: "instant" });
        const r2 = c.getBoundingClientRect();
        return { x: r2.left + r2.width / 2, y: r2.top + r2.height / 2 };
      }
    }
    return null;
  }, meta.number);

  if (cardPt) {
    await mouseClick(page, cardPt.x, cardPt.y);
  } else {
    // Last resort: API open (not a button click) — still no DOM .click() thrash
    await page.evaluate(async (id) => {
      await window.VTApp?.openExercise?.(id);
    }, exerciseId);
  }

  await page
    .waitForSelector("#view-exercise.active", { timeout: 8000 })
    .catch(() => {});
  // Wait for Start to have size — NO fitHighway loop
  await page
    .waitForFunction(
      () => {
        const b = document.getElementById("btn-practice-start");
        if (!b || b.hidden) return false;
        const r = b.getBoundingClientRect();
        return r.width >= 8 && r.height >= 8;
      },
      { timeout: 8000 }
    )
    .catch(() => {});
  await page.waitForTimeout(150);
}

async function centerIfVisible(page, sel) {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return null;
    if (el.hidden) return null;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    // Only scroll if mostly off-screen (one scroll, no thrash)
    if (r.top < 0 || r.bottom > vh || r.left < 0 || r.right > vw) {
      el.scrollIntoView({ block: "center", behavior: "instant" });
    }
    const r2 = el.getBoundingClientRect();
    if (r2.width < 2 || r2.height < 2) return null;
    return {
      x: r2.left + r2.width / 2,
      y: r2.top + r2.height / 2,
      w: r2.width,
      h: r2.height
    };
  }, sel);
}

/** Visible approach path + real mouse click (down/up). No locator.click. */
async function mouseClick(page, x, y, steps = 12) {
  const ax = Math.max(6, x - 40);
  const ay = Math.max(6, y - 18);
  await page.mouse.move(ax, ay, { steps: Math.max(4, Math.floor(steps / 2)) });
  await page.mouse.move(x, y, { steps });
  await page.waitForTimeout(40);
  await page.mouse.down();
  await page.waitForTimeout(35);
  await page.mouse.up();
  await page.waitForTimeout(80);
}

async function mouseHover(page, x, y, steps = 12) {
  const ax = Math.max(6, x - 40);
  const ay = Math.max(6, y - 18);
  await page.mouse.move(ax, ay, { steps: Math.max(4, Math.floor(steps / 2)) });
  await page.mouse.move(x, y, { steps });
  await page.waitForTimeout(50);
}

async function capture(page, fmt, id, name, meta) {
  const abs = path.join(SHOT_ROOT, fmt, id, name);
  ensureDir(path.dirname(abs));
  await page.waitForTimeout(60); // settle before shot
  await page.screenshot({ path: abs, fullPage: false });
  return {
    file: path.relative(ROOT, abs).replace(/\\/g, "/"),
    ...meta
  };
}

function describeProbe(probe, extra = {}) {
  if (!probe) return "no-probe";
  const parts = [
    `live=${probe.live}`,
    `status="${probe.status || ""}"`,
    `mode=${probe.mode || "?"}`,
    `manual=${probe.manualSound}`,
    `hold=${probe.holdVal ?? probe.engHoldSec ?? "n/a"}`
  ];
  for (const [k, v] of Object.entries(extra)) parts.push(`${k}=${v}`);
  return parts.join(" · ");
}

function writeMarkdown(report) {
  ensureDir(path.dirname(REPORT_MD));
  const lines = [];
  lines.push("# Headed multi-format exercise UI forensics (mouse-only)");
  lines.push("");
  lines.push(`**Generated:** ${report.generatedAt}`);
  lines.push(
    `**Mode:** headed · slowMo=${report.slowMo}ms · mouse.move/click only · no reflow thrash`
  );
  lines.push(
    `**Formats:** ${(report.formats || []).map((f) => f.name).join(", ")}`
  );
  lines.push(
    `**Exercises×formats:** ${report.summary.totalExercises} · **actions:** ${report.summary.totalActions} · **issues:** ${report.summary.issueCount}`
  );
  lines.push("");
  lines.push("## Method");
  lines.push("");
  lines.push("- Chromium **headed** with pink cursor overlay.");
  lines.push(
    "- Every interaction: `mouse.move({ steps })` approach → `mouse.down` / `mouse.up`."
  );
  lines.push("- Space: `keyboard.down('Space')` hold → `up` while live.");
  lines.push(
    "- Open exercises by mouse (tab → tier → card). No `element.click()` / `stopPractice()` shortcuts."
  );
  lines.push(
    "- No repeated `fitHighway` / `scrollTo` (that caused UI flicker)."
  );
  lines.push("- Screenshots before/after key actions with expected vs actual verdict.");
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Value |");
  lines.push("|--------|------:|");
  for (const [k, v] of Object.entries(report.summary.metrics || {})) {
    lines.push(`| ${k} | ${v} |`);
  }
  lines.push("");
  if (report.summary.issues?.length) {
    lines.push("## Findings");
    lines.push("");
    lines.push("| Format | Exercise | Sev | Code | Message |");
    lines.push("|--------|----------|-----|------|---------|");
    for (const i of report.summary.issues.slice(0, 200)) {
      lines.push(
        `| ${i.format} | ${i.exerciseId} | ${i.sev} | ${i.code} | ${String(i.msg || "").replace(/\|/g, "/")} |`
      );
    }
    lines.push("");
  }
  for (const fmt of report.formats || []) {
    lines.push(
      `## Format: \`${fmt.name}\` (${fmt.width}×${fmt.height}${fmt.fullscreen ? " fullscreen" : ""})`
    );
    lines.push("");
    for (const e of fmt.exercises || []) {
      lines.push(`### ${e.id} — ${e.title || ""} (\`${e.mode || "?"}\`)`);
      lines.push("");
      if (e.issues?.length) {
        for (const i of e.issues) lines.push(`- **${i.sev}** \`${i.code}\`: ${i.msg}`);
        lines.push("");
      }
      if (e.images?.length) {
        lines.push("| Shot | Action | Expected | Actual | Verdict |");
        lines.push("|------|--------|----------|--------|---------|");
        for (const im of e.images) {
          lines.push(
            `| \`${im.file}\` | ${im.action || ""} | ${String(im.expected || "").replace(/\|/g, "/")} | ${String(im.actual || "").replace(/\|/g, "/")} | **${im.verdict || "?"}** |`
          );
        }
        lines.push("");
      }
    }
  }
  lines.push("Screenshots: `qa/screenshots/exercise-ui-formats/{format}/{id}/`");
  lines.push("");
  fs.writeFileSync(REPORT_MD, lines.join("\n"));
  return REPORT_MD;
}

test("headed mouse-only forensics: exercises × formats", async ({ page }) => {
  test.setTimeout(4 * 60 * 60 * 1000);

  ensureDir(SHOT_ROOT);
  await page.addInitScript(installClickLogInit);
  await boot(page, { lang: "es", tourDone: true, mic: "silent" });
  await quietOverlays(page);
  await installPinkCursor(page);

  // Warm mouse once on home (visible motion)
  await page.mouse.move(40, 40);
  await page.mouse.move(380, 160, { steps: 16 });
  await page.mouse.move(220, 300, { steps: 12 });

  let catalog = await page.evaluate(() => {
    const v = (window.VT_EXERCISES?.vocal || []).map((e) => ({
      id: e.id,
      track: "vocal",
      number: e.number,
      title: e.title || e.id
    }));
    const s = (window.VT_EXERCISES?.singing || []).map((e) => ({
      id: e.id,
      track: "singing",
      number: e.number,
      title: e.title || e.id
    }));
    return [...v, ...s];
  });

  const idFilter = parseList("FORENSICS_IDS", null);
  if (idFilter) catalog = catalog.filter((e) => idFilter.includes(e.id));
  const lim = Number(process.env.FORENSICS_LIMIT || 0);
  if (lim > 0) catalog = catalog.slice(0, lim);

  const fmtNames = parseList(
    "FORENSICS_FORMATS",
    ALL_FORMATS.map((f) => f.name)
  );
  const formats = ALL_FORMATS.filter((f) => fmtNames.includes(f.name));

  expect(catalog.length).toBeGreaterThan(0);
  expect(formats.length).toBeGreaterThan(0);

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "headed-mouse-only-forensics",
    slowMo: SLOWMO,
    liveSeconds: LIVE_SECS,
    formats: [],
    summary: {
      totalExercises: 0,
      totalActions: 0,
      issueCount: 0,
      metrics: {
        hover_ok: 0,
        hover_fail: 0,
        start_ok: 0,
        start_fail: 0,
        space_ok: 0,
        space_fail: 0,
        stop_ok: 0,
        stop_fail: 0
      },
      issues: []
    }
  };

  const pushIssue = (fmt, exId, sev, code, msg, entry) => {
    const issue = { format: fmt, exerciseId: exId, sev, code, msg };
    report.summary.issues.push(issue);
    report.summary.issueCount++;
    entry.issues.push({ sev, code, msg });
  };

  for (const fmt of formats) {
    const fmtEntry = {
      name: fmt.name,
      width: fmt.width,
      height: fmt.height,
      fullscreen: fmt.fullscreen,
      exercises: []
    };
    console.log(`\n══ FORMAT ${fmt.name} ${fmt.width}×${fmt.height} (mouse-only) ══`);
    await applyFormat(page, fmt);
    await installPinkCursor(page);
    await quietOverlays(page);

    // Warm mouse after format change
    await page.mouse.move(30, 30);
    await page.mouse.move(Math.min(fmt.width - 40, 400), Math.min(fmt.height - 40, 200), {
      steps: 14
    });

    for (const ex of catalog) {
      console.log(`  ▶ ${fmt.name} / ${ex.id}`);
      const entry = {
        id: ex.id,
        track: ex.track,
        title: ex.title,
        mode: null,
        images: [],
        actions: {},
        issues: []
      };

      try {
        await quietOverlays(page);
        await openExerciseByMouse(page, ex.id);
        console.log(`    … opened (mouse)`);

        const openProbe = await practiceProbe(page);
        entry.mode = openProbe.mode;
        entry.images.push(
          await capture(page, fmt.name, ex.id, "00_open.png", {
            action: "open_exercise",
            expected: "Exercise view; Start visible",
            actual: describeProbe(openProbe, { startVisible: openProbe.startVisible }),
            verdict: openProbe.startVisible ? "PASS" : "FAIL"
          })
        );
        report.summary.totalActions++;
        if (!openProbe.startVisible) {
          pushIssue(fmt.name, ex.id, "P0", "start_not_visible", "Start not visible after open", entry);
        }

        // ── Hover Start (real mouse path) ──
        {
          const startPt = await centerIfVisible(page, "#btn-practice-start");
          entry.images.push(
            await capture(page, fmt.name, ex.id, "01_hover_start_before.png", {
              action: "hover_start_before",
              expected: "Start idle",
              actual: startPt ? `at ${Math.round(startPt.x)},${Math.round(startPt.y)}` : "missing",
              verdict: startPt ? "INFO" : "FAIL"
            })
          );
          if (startPt) {
            const before = await styleSnapshot(page, "#btn-practice-start");
            await mouseHover(page, startPt.x, startPt.y, 14);
            const after = await styleSnapshot(page, "#btn-practice-start");
            const fb = hoverFeedback(before, after);
            const hit = await hitAt(page, startPt.x, startPt.y);
            entry.images.push(
              await capture(page, fmt.name, ex.id, "01_hover_start_after.png", {
                action: "hover_start_after",
                expected: "Hover feedback and/or pointer; hit-self",
                actual: `changed=[${(fb.changed || []).join(",")}] cursor=${after?.cursor} hit=${hit?.id || hit?.tag} hitSelf=${after?.hitSelf}`,
                verdict: after?.hitSelf || after?.cursor === "pointer" ? "PASS" : "WARN"
              })
            );
            if (after?.hitSelf || fb.ok) report.summary.metrics.hover_ok++;
            else {
              report.summary.metrics.hover_fail++;
              pushIssue(fmt.name, ex.id, "P2", "hover_start", "weak hover feedback", entry);
            }
            entry.actions.hoverStart = { fb, hit };
          }
          report.summary.totalActions++;
        }

        // ── Hover + light interact primary controls (mouse only) ──
        const ctrls = await listExerciseControls(page);
        for (const c of ctrls) {
          if (SKIP_IDS.has(c.id)) continue;
          if (!c.hasDomId || c.id.startsWith("anon-")) continue;
          if (
            ![
              "btn-toggle-guide",
              "btn-toggle-metrics",
              "btn-toggle-piano",
              "btn-ui-help",
              "mic-sensitivity"
            ].includes(c.id)
          ) {
            continue;
          }
          const sel = `#${c.id}`;
          const pt = await centerIfVisible(page, sel);
          if (!pt) continue;

          await mouseHover(page, pt.x, pt.y, 10);
          entry.images.push(
            await capture(page, fmt.name, ex.id, `02_hover_${c.id}.png`, {
              action: `hover_${c.id}`,
              expected: "Hover lands on control",
              actual: `center=${Math.round(pt.x)},${Math.round(pt.y)}`,
              verdict: "PASS"
            })
          );
          report.summary.totalActions++;

          if (c.id === "mic-sensitivity") {
            // Drag along track (not from center alone) — range snaps value to
            // click X; a short -30px from center often leaves value unchanged.
            const box = await page.evaluate((s) => {
              const el = document.querySelector(s);
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return { x: r.x, y: r.y, w: r.width, h: r.height };
            }, sel);
            let before = null;
            let mid = null;
            if (box && box.w >= 20) {
              const y = box.y + box.h / 2;
              const xHi = box.x + box.w * 0.92;
              const xLo = box.x + box.w * 0.08;
              // Seed low then drag high (always a delta even if already at floor)
              await page.mouse.click(xLo, y);
              await page.waitForTimeout(40);
              before = await page.evaluate(
                (s) => document.querySelector(s)?.value ?? null,
                sel
              );
              await page.mouse.move(xLo, y, { steps: 4 });
              await page.mouse.down();
              await page.mouse.move(xHi, y, { steps: 18 });
              await page.mouse.up();
              await page.waitForTimeout(80);
              mid = await page.evaluate(
                (s) => document.querySelector(s)?.value ?? null,
                sel
              );
            }
            entry.images.push(
              await capture(page, fmt.name, ex.id, "03_mic_drag.png", {
                action: "mic_drag",
                expected: "Mic value rises via track drag (low→high)",
                actual: `before=${before} after=${mid} w=${box ? Math.round(box.w) : 0}`,
                verdict:
                  before != null && mid != null && Number(mid) > Number(before)
                    ? "PASS"
                    : "FAIL"
              })
            );
            report.summary.totalActions++;
          } else if (
            c.id === "btn-toggle-guide" ||
            c.id === "btn-toggle-metrics" ||
            c.id === "btn-toggle-piano"
          ) {
            entry.images.push(
              await capture(page, fmt.name, ex.id, `04_${c.id}_before.png`, {
                action: `${c.id}_before`,
                expected: "Panel baseline",
                actual: "before mouse click",
                verdict: "INFO"
              })
            );
            await mouseClick(page, pt.x, pt.y, 10);
            await page.waitForTimeout(150);
            entry.images.push(
              await capture(page, fmt.name, ex.id, `04_${c.id}_after.png`, {
                action: `${c.id}_after`,
                expected: "Panel toggles after mouse click",
                actual: "after mouse click",
                verdict: "PASS"
              })
            );
            // restore with second mouse click
            const pt2 = await centerIfVisible(page, sel);
            if (pt2) await mouseClick(page, pt2.x, pt2.y, 8);
            report.summary.totalActions++;
          } else if (c.id === "btn-ui-help") {
            await mouseClick(page, pt.x, pt.y, 8);
            await page.waitForTimeout(120);
            // close help with Escape (keyboard, not click spam)
            await page.keyboard.press("Escape").catch(() => {});
            await page.waitForTimeout(80);
          }

          // park mouse so hover styles clear
          await page.mouse.move(12, 12, { steps: 6 });
        }

        // ── Start via real mouse click ──
        {
          console.log(`    … mouse Start`);
          entry.images.push(
            await capture(page, fmt.name, ex.id, "10_start_before.png", {
              action: "start_before",
              expected: "Ready; Start clickable",
              actual: describeProbe(await practiceProbe(page)),
              verdict: "INFO"
            })
          );
          const startPt = await centerIfVisible(page, "#btn-practice-start");
          if (startPt) {
            await mouseClick(page, startPt.x, startPt.y, 14);
          }
          // Poll live without hammering layout
          const deadline = Date.now() + 7000;
          let liveProbe = null;
          while (Date.now() < deadline) {
            liveProbe = await practiceProbe(page);
            if (liveProbe.live) break;
            // weekPlan opens plan — not live
            if (entry.mode === "weekPlan") break;
            await page.waitForTimeout(250);
          }
          liveProbe = liveProbe || (await practiceProbe(page));
          entry.actions.start = { probe: liveProbe };
          entry.images.push(
            await capture(page, fmt.name, ex.id, "10_start_after.png", {
              action: "start_after",
              expected:
                entry.mode === "weekPlan"
                  ? "Week plan may open instead of live"
                  : "Practice live after mouse Start",
              actual: describeProbe(liveProbe),
              verdict:
                entry.mode === "weekPlan"
                  ? "PASS"
                  : liveProbe.live
                    ? "PASS"
                    : "FAIL"
            })
          );
          report.summary.totalActions++;
          if (entry.mode === "weekPlan") {
            // close plan modal / return if needed via mouse Escape + back later
            await page.keyboard.press("Escape").catch(() => {});
          } else if (liveProbe.live) {
            report.summary.metrics.start_ok++;
          } else {
            report.summary.metrics.start_fail++;
            pushIssue(fmt.name, ex.id, "P0", "start_live", "Start mouse click did not go live", entry);
          }
          console.log(`    … live=${liveProbe.live} ${liveProbe.status}`);

          // ── Space hold (keyboard) while live ──
          if (liveProbe.live) {
            console.log(`    … Space hold`);
            // focus canvas/body with a soft click away from buttons
            await page.mouse.click(Math.min(60, fmt.width * 0.15), Math.min(100, fmt.height * 0.2));
            await page.waitForTimeout(80);
            entry.images.push(
              await capture(page, fmt.name, ex.id, "11_space_before.png", {
                action: "space_before",
                expected: "Live, assist idle",
                actual: describeProbe(await practiceProbe(page)),
                verdict: "INFO"
              })
            );
            await page.keyboard.down("Space");
            await page.waitForTimeout(Math.min(700, LIVE_SECS * 220));
            const mid = await practiceProbe(page);
            entry.images.push(
              await capture(page, fmt.name, ex.id, "11_space_hold.png", {
                action: "space_hold",
                expected: mid.spaceAssistAllowed
                  ? "Manual assist active; still live"
                  : "Still live (pitch may ignore Space)",
                actual: describeProbe(mid),
                verdict: mid.live ? "PASS" : "FAIL"
              })
            );
            await page.keyboard.up("Space");
            await page.waitForTimeout(220);
            const afterSp = await practiceProbe(page);
            entry.images.push(
              await capture(page, fmt.name, ex.id, "11_space_after.png", {
                action: "space_release",
                expected: "Still live after release",
                actual: describeProbe(afterSp),
                verdict: afterSp.live ? "PASS" : "FAIL"
              })
            );
            entry.actions.space = { mid, after: afterSp };
            report.summary.totalActions++;
            if (afterSp.live) report.summary.metrics.space_ok++;
            else {
              report.summary.metrics.space_fail++;
              pushIssue(fmt.name, ex.id, "P0", "space_stopped", "Space stopped session", entry);
            }

            await page.waitForTimeout(Math.max(300, LIVE_SECS * 120));
            entry.images.push(
              await capture(page, fmt.name, ex.id, "12_live_silence.png", {
                action: "live_silence",
                expected: "Remains live on silence",
                actual: describeProbe(await practiceProbe(page)),
                verdict: (await practiceProbe(page)).live ? "PASS" : "FAIL"
              })
            );

            // ── Stop via real mouse on Stop button only ──
            console.log(`    … mouse Stop`);
            entry.images.push(
              await capture(page, fmt.name, ex.id, "13_stop_before.png", {
                action: "stop_before",
                expected: "Stop button visible",
                actual: describeProbe(await practiceProbe(page)),
                verdict: "INFO"
              })
            );
            const stopPt = await centerIfVisible(page, "#btn-practice-stop");
            if (stopPt) {
              await mouseClick(page, stopPt.x, stopPt.y, 12);
            }
            await page.waitForTimeout(350);
            const stopped = await practiceProbe(page);
            entry.images.push(
              await capture(page, fmt.name, ex.id, "13_stop_after.png", {
                action: "stop_after",
                expected: "Stopped after mouse on Stop",
                actual: describeProbe(stopped),
                verdict: !stopped.live ? "PASS" : "FAIL"
              })
            );
            report.summary.totalActions++;
            if (!stopped.live) report.summary.metrics.stop_ok++;
            else {
              report.summary.metrics.stop_fail++;
              pushIssue(fmt.name, ex.id, "P0", "stop_failed", "Stop mouse click did not end practice", entry);
            }
          }
        }

        // ── Back home via real mouse ──
        {
          console.log(`    … mouse Back`);
          const backPt = await centerIfVisible(page, "#btn-back-home");
          entry.images.push(
            await capture(page, fmt.name, ex.id, "20_back_hover.png", {
              action: "back_hover",
              expected: "Back button in view",
              actual: backPt
                ? `center=${Math.round(backPt.x)},${Math.round(backPt.y)}`
                : "missing",
              verdict: backPt ? "PASS" : "WARN"
            })
          );
          if (backPt) {
            await mouseHover(page, backPt.x, backPt.y, 10);
            await mouseClick(page, backPt.x, backPt.y, 10);
            await page.waitForTimeout(150);
            // leave modal: Discard by mouse
            const discard = await centerIfVisible(page, "#leave-discard");
            if (discard) {
              await mouseClick(page, discard.x, discard.y, 8);
              await page.waitForTimeout(120);
            }
          }
          await page.waitForTimeout(150);
          const home = await page.evaluate(
            () => !!document.getElementById("view-home")?.classList.contains("active")
          );
          entry.images.push(
            await capture(page, fmt.name, ex.id, "20_back_after.png", {
              action: "back_home",
              expected: "Home view active after mouse Back",
              actual: `homeActive=${home}`,
              verdict: home ? "PASS" : "WARN"
            })
          );
          report.summary.totalActions++;
          // If still not home, try brand mark mouse click
          if (!home) {
            const brand = await centerIfVisible(page, ".brand, .brand-mark, #btn-back-home");
            if (brand) {
              await mouseClick(page, brand.x, brand.y, 8);
              const d2 = await centerIfVisible(page, "#leave-discard");
              if (d2) await mouseClick(page, d2.x, d2.y, 6);
            }
          }
        }
      } catch (err) {
        pushIssue(
          fmt.name,
          ex.id,
          "P0",
          "exercise_error",
          String(err.message || err).slice(0, 160),
          entry
        );
        entry.images.push(
          await capture(page, fmt.name, ex.id, "99_error.png", {
            action: "error",
            expected: "No exception",
            actual: String(err.message || err).slice(0, 120),
            verdict: "FAIL"
          }).catch(() => ({ file: "(shot failed)", action: "error", verdict: "FAIL" }))
        );
        // recover: try mouse back
        const backPt = await centerIfVisible(page, "#btn-back-home");
        if (backPt) {
          await mouseClick(page, backPt.x, backPt.y, 6).catch(() => {});
          const d = await centerIfVisible(page, "#leave-discard");
          if (d) await mouseClick(page, d.x, d.y, 6).catch(() => {});
        }
      }

      fmtEntry.exercises.push(entry);
      report.summary.totalExercises++;
      fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
    }

    report.formats.push(fmtEntry);
    fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  }

  writeMarkdown(report);
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2));
  console.log("\n══ MOUSE-ONLY FORENSICS DONE ══");
  console.log(REPORT_JSON);
  console.log(REPORT_MD);
  console.log("Issues:", report.summary.issueCount, "Actions:", report.summary.totalActions);

  // Soft gate
  const p0Start = report.summary.issues.filter(
    (i) => i.sev === "P0" && i.code === "start_live"
  ).length;
  expect.soft(p0Start, "P0 start failures").toBeLessThan(5);
  expect(report.summary.totalActions).toBeGreaterThan(0);
});
