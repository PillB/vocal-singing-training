/**
 * Headed click-vs-UI validation across formats.
 * Real mouse paths only; verifies elementFromPoint hit = painted control
 * and that Start/Stop/mic/guide/back change the correct UI state.
 *
 *   HEADED=1 SLOWMO=70 npm run test:click-ui-formats
 */
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { boot } = require("./helpers/e2e");

const SLOWMO = Number(process.env.SLOWMO || 70) || 70;
const REPORT = path.join(__dirname, "..", "qa", "geometry", "click-ui-formats-report.json");
const SHOT = path.join(__dirname, "..", "qa", "screenshots", "click-ui-formats");

const FORMATS = [
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

test.use({
  headless: false,
  viewport: { width: 1280, height: 800 },
  launchOptions: {
    slowMo: SLOWMO,
    args: ["--start-maximized", "--window-position=50,30"]
  }
});
test.describe.configure({ mode: "serial" });

async function pinkCursor(page) {
  const has = await page.evaluate(() => !!document.getElementById("vt-click-cursor"));
  if (has) return;
  await page.addStyleTag({
    content: `
      #vt-click-cursor{position:fixed;z-index:2147483647;width:18px;height:18px;margin:-9px 0 0 -9px;
        border-radius:50%;background:radial-gradient(circle at 30% 30%,#fff,#ff2d55 55%);
        box-shadow:0 0 0 2px #fff,0 0 12px #ff2d55;pointer-events:none!important}
      #tour-root,.tour-backdrop{display:none!important;pointer-events:none!important}
    `
  });
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.id = "vt-click-cursor";
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
    const leave = document.getElementById("leave-modal");
    if (leave) {
      leave.hidden = true;
      leave.style.display = "none";
    }
  });
}

async function applyFmt(page, fmt) {
  await page.setViewportSize({ width: fmt.width, height: fmt.height });
  await page.waitForTimeout(150);
  if (fmt.fs) {
    await page.mouse.click(40, 40);
    await page
      .evaluate(async () => {
        try {
          if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
        } catch {
          /* */
        }
      })
      .catch(() => {});
    await page.waitForTimeout(200);
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
    await page.waitForTimeout(150);
  }
  await page
    .evaluate(() => {
      window.VTApp?.syncHeaderHeightVar?.();
      window.VTApp?.fitHighwayToViewport?.();
    })
    .catch(() => {});
  await page.waitForTimeout(100);
}

async function openByMouse(page, id) {
  const onEx = await page.evaluate(
    () => !!document.getElementById("view-exercise")?.classList.contains("active")
  );
  if (onEx) {
    const back = await center(page, "#btn-back-home");
    if (back) {
      await mouseClick(page, back.x, back.y);
      await page.waitForTimeout(150);
      const d = await center(page, "#leave-discard");
      if (d) await mouseClick(page, d.x, d.y);
    }
  }
  const meta = await page.evaluate((exId) => {
    const all = [
      ...(window.VT_EXERCISES?.vocal || []),
      ...(window.VT_EXERCISES?.singing || [])
    ];
    return all.find((e) => e.id === exId) || null;
  }, id);
  if (!meta) throw new Error("missing " + id);

  const tab = await center(page, `.tab[data-tab="${meta.track}"]`);
  if (tab) {
    await mouseClick(page, tab.x, tab.y);
    await page.waitForTimeout(100);
  }
  const chip = await center(page, '.tier-chip[data-tier="all"]');
  if (chip) {
    await mouseClick(page, chip.x, chip.y);
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
  if (card) await mouseClick(page, card.x, card.y);
  else await page.evaluate(async (exId) => window.VTApp?.openExercise?.(exId), id);

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

async function center(page, sel) {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el || el.hidden) return null;
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden") return null;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return null;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    if (r.top < 0 || r.bottom > vh || r.left < 0 || r.right > vw) {
      el.scrollIntoView({ block: "center", behavior: "instant" });
    }
    const r2 = el.getBoundingClientRect();
    return {
      x: r2.left + r2.width / 2,
      y: r2.top + r2.height / 2,
      w: r2.width,
      h: r2.height
    };
  }, sel);
}

async function mouseClick(page, x, y, steps = 10) {
  await page.mouse.move(Math.max(4, x - 36), Math.max(4, y - 14), {
    steps: Math.max(3, Math.floor(steps / 2))
  });
  await page.mouse.move(x, y, { steps });
  await page.waitForTimeout(30);
  await page.mouse.down();
  await page.waitForTimeout(30);
  await page.mouse.up();
  await page.waitForTimeout(70);
}

/** Hit probe: painted control receives the point */
async function hitOk(page, sel, x, y) {
  return page.evaluate(
    ({ selector, x, y }) => {
      const el = document.querySelector(selector);
      const top = document.elementFromPoint(x, y);
      if (!el || !top) return { ok: false, top: null };
      const ok = top === el || el.contains(top) || top.closest?.(selector) === el;
      return {
        ok,
        top: { id: top.id, tag: top.tagName, cls: String(top.className || "").slice(0, 48) },
        pe: getComputedStyle(el).pointerEvents
      };
    },
    { selector: sel, x, y }
  );
}

async function shot(page, rel) {
  const abs = path.join(SHOT, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  await page.screenshot({ path: abs, fullPage: false });
  return abs;
}

test("click vs UI: Start/Stop/mic/guide/back across formats", async ({ page }) => {
  test.setTimeout(45 * 60 * 1000);
  fs.mkdirSync(SHOT, { recursive: true });

  await boot(page, { lang: "es", tourDone: true, mic: "silent" });
  await quiet(page);
  await pinkCursor(page);
  await page.mouse.move(40, 40);
  await page.mouse.move(400, 180, { steps: 12 });

  const report = {
    generatedAt: new Date().toISOString(),
    mode: "headed-click-ui-formats",
    formats: [],
    summary: { cases: 0, pass: 0, fail: 0, fails: [] }
  };

  const record = (fmt, ex, name, ok, detail) => {
    report.summary.cases++;
    if (ok) report.summary.pass++;
    else {
      report.summary.fail++;
      report.summary.fails.push({ format: fmt, exercise: ex, name, detail });
    }
    return { name, ok, detail };
  };

  for (const fmt of FORMATS) {
    const fmtEntry = { name: fmt.name, width: fmt.width, height: fmt.height, exercises: [] };
    console.log(`\n══ ${fmt.name} ${fmt.width}×${fmt.height} ══`);
    await applyFmt(page, fmt);
    await pinkCursor(page);
    await quiet(page);

    for (const exId of EXERCISES) {
      console.log(`  ▶ ${fmt.name}/${exId}`);
      const entry = { id: exId, checks: [] };
      try {
        await openByMouse(page, exId);
        await quiet(page);

        // ── Start hit + click ──
        {
          // One gentle fit after open (short/landscape can lag)
          await page
            .evaluate(() => {
              window.VTApp?.syncHeaderHeightVar?.();
              window.VTApp?.fitHighwayToViewport?.();
            })
            .catch(() => {});
          await page.waitForTimeout(80);
          let pt = await center(page, "#btn-practice-start");
          expect(pt, `${fmt.name}/${exId} Start geometry`).toBeTruthy();
          await page.mouse.move(pt.x, pt.y, { steps: 10 });
          let hit = await hitOk(page, "#btn-practice-start", pt.x, pt.y);
          // If covered, try left-biased point inside Start paint box
          if (!hit.ok && pt) {
            const alt = await page.evaluate(() => {
              const el = document.getElementById("btn-practice-start");
              if (!el) return null;
              const r = el.getBoundingClientRect();
              return { x: r.left + Math.min(24, r.width * 0.35), y: r.top + r.height / 2 };
            });
            if (alt) {
              pt = alt;
              await page.mouse.move(pt.x, pt.y, { steps: 6 });
              hit = await hitOk(page, "#btn-practice-start", pt.x, pt.y);
            }
          }
          entry.checks.push(
            record(fmt.name, exId, "start_hit", hit.ok, hit)
          );
          await shot(page, `${fmt.name}/${exId}/01_start_hover.png`);
          await mouseClick(page, pt.x, pt.y, 12);
          const liveDeadline = Date.now() + 7000;
          let live = false;
          while (Date.now() < liveDeadline) {
            live = await page.evaluate(() => {
              const stop = document.getElementById("btn-practice-stop");
              return !!(stop && !stop.hidden);
            });
            if (live) break;
            await page.waitForTimeout(200);
          }
          // weekPlan may not go live
          const mode = await page.evaluate(
            () => window.VTApp?.getProfile?.(window.VTApp?.getState?.()?.exercise)?.mode
          );
          const startOk = mode === "weekPlan" ? true : live;
          entry.checks.push(
            record(fmt.name, exId, "start_live", startOk, { live, mode })
          );
          await shot(page, `${fmt.name}/${exId}/02_start_after.png`);
          console.log(`    start hit=${hit.ok} live=${live}`);
        }

        // ── Mic track drag (full range: low→high then high→low so floor never stalls) ──
        {
          const box = await page.evaluate(() => {
            const el = document.getElementById("mic-sensitivity");
            if (!el || el.hidden) return null;
            const r = el.getBoundingClientRect();
            if (r.width < 8) return null;
            return { x: r.x, y: r.y, w: r.width, h: r.height };
          });
          if (box) {
            const y = box.y + box.h / 2;
            const xMid = box.x + box.w * 0.5;
            const xLo = box.x + box.w * 0.08;
            const xHi = box.x + box.w * 0.92;
            await page.mouse.move(xMid, y, { steps: 8 });
            const hit = await hitOk(page, "#mic-sensitivity", xMid, y);
            entry.checks.push(record(fmt.name, exId, "mic_hit", hit.ok, hit));
            // Seed known low value via track click, then drag up (always a delta)
            await page.mouse.click(xLo, y);
            await page.waitForTimeout(40);
            const before = await page.evaluate(
              () => document.getElementById("mic-sensitivity")?.value
            );
            await page.mouse.move(xLo, y, { steps: 4 });
            await page.mouse.down();
            await page.mouse.move(xHi, y, { steps: 20 });
            await page.mouse.up();
            await page.waitForTimeout(80);
            const after = await page.evaluate(
              () => document.getElementById("mic-sensitivity")?.value
            );
            const uiVal = await page.evaluate(
              () => document.getElementById("mic-sens-val")?.textContent?.trim()
            );
            const dragOk = Number(after) > Number(before);
            const uiSync = !uiVal || uiVal === String(after);
            entry.checks.push(
              record(fmt.name, exId, "mic_drag", dragOk, { before, after, uiVal, uiSync })
            );
            entry.checks.push(
              record(fmt.name, exId, "mic_ui_sync", uiSync, { after, uiVal })
            );
            await shot(page, `${fmt.name}/${exId}/03_mic_drag.png`);
            console.log(`    mic hit=${hit.ok} ${before}→${after} ui=${uiVal}`);
          } else {
            entry.checks.push(
              record(fmt.name, exId, "mic_hit", false, { reason: "no_box" })
            );
          }
        }

        // ── Guide toggle ──
        {
          const pt = await center(page, "#btn-toggle-guide");
          if (pt) {
            await page.mouse.move(pt.x, pt.y, { steps: 8 });
            const hit = await hitOk(page, "#btn-toggle-guide", pt.x, pt.y);
            entry.checks.push(record(fmt.name, exId, "guide_hit", hit.ok, hit));
            const before = await page.evaluate(() => {
              const c = document.querySelector(".guide-card");
              return c ? !c.classList.contains("collapsed") : null;
            });
            await mouseClick(page, pt.x, pt.y, 10);
            await page.waitForTimeout(120);
            const after = await page.evaluate(() => {
              const c = document.querySelector(".guide-card");
              return c ? !c.classList.contains("collapsed") : null;
            });
            entry.checks.push(
              record(
                fmt.name,
                exId,
                "guide_toggle",
                before == null || after !== before,
                { before, after }
              )
            );
            // restore
            const pt2 = await center(page, "#btn-toggle-guide");
            if (pt2) await mouseClick(page, pt2.x, pt2.y, 8);
            await shot(page, `${fmt.name}/${exId}/04_guide.png`);
          }
        }

        // ── Stop ──
        {
          const live = await page.evaluate(() => {
            const s = document.getElementById("btn-practice-stop");
            return !!(s && !s.hidden);
          });
          if (live) {
            const pt = await center(page, "#btn-practice-stop");
            expect(pt, `${fmt.name}/${exId} Stop geometry`).toBeTruthy();
            await page.mouse.move(pt.x, pt.y, { steps: 10 });
            const hit = await hitOk(page, "#btn-practice-stop", pt.x, pt.y);
            entry.checks.push(record(fmt.name, exId, "stop_hit", hit.ok, hit));
            await mouseClick(page, pt.x, pt.y, 12);
            await page.waitForTimeout(300);
            const stopped = await page.evaluate(() => {
              const stop = document.getElementById("btn-practice-stop");
              const start = document.getElementById("btn-practice-start");
              return !!(start && !start.hidden) && !!(stop && stop.hidden);
            });
            entry.checks.push(record(fmt.name, exId, "stop_effect", stopped, {}));
            await shot(page, `${fmt.name}/${exId}/05_stop.png`);
            console.log(`    stop hit=${hit.ok} effect=${stopped}`);
          }
        }

        // ── Back ──
        {
          const pt = await center(page, "#btn-back-home");
          if (pt) {
            await page.mouse.move(pt.x, pt.y, { steps: 8 });
            const hit = await hitOk(page, "#btn-back-home", pt.x, pt.y);
            entry.checks.push(record(fmt.name, exId, "back_hit", hit.ok, hit));
            await mouseClick(page, pt.x, pt.y, 10);
            await page.waitForTimeout(120);
            const discard = await center(page, "#leave-discard");
            if (discard) await mouseClick(page, discard.x, discard.y, 8);
            await page.waitForTimeout(120);
            const home = await page.evaluate(
              () => !!document.getElementById("view-home")?.classList.contains("active")
            );
            entry.checks.push(record(fmt.name, exId, "back_home", home, {}));
            await shot(page, `${fmt.name}/${exId}/06_back.png`);
          } else {
            entry.checks.push(
              record(fmt.name, exId, "back_hit", false, { reason: "no_box" })
            );
          }
        }
      } catch (err) {
        entry.checks.push(
          record(fmt.name, exId, "exception", false, {
            msg: String(err.message || err).slice(0, 140)
          })
        );
        await shot(page, `${fmt.name}/${exId}/99_error.png`).catch(() => {});
      }
      fmtEntry.exercises.push(entry);
      fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
    }
    report.formats.push(fmtEntry);
  }

  fs.writeFileSync(REPORT, JSON.stringify(report, null, 2));
  console.log("\n══ CLICK UI DONE ══");
  console.log("pass", report.summary.pass, "fail", report.summary.fail, "of", report.summary.cases);
  if (report.summary.fails.length) {
    console.log("fails:", JSON.stringify(report.summary.fails.slice(0, 20), null, 2));
  }
  expect(report.summary.fail, `click-ui fails: ${report.summary.fail}`).toBe(0);
});
