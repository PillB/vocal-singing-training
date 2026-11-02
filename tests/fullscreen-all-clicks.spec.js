/**
 * Headed fullscreen: browser Fullscreen API + mouse-click every visible control.
 *
 *   npm run test:fullscreen-clicks
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise } = require("./helpers/e2e");
const { practiceProbe, listExerciseControls } = require("./helpers/ui-forensics");

const EXERCISES = [
  "v1-diction",
  "s15-sh-air-ladder",
  "s9-pitch-match",
  "s2-solfege-chords"
];

const SKIP = new Set([
  "btn-back-home",
  "btn-complete",
  "btn-pricing",
  "btn-account",
  "btn-history",
  "btn-plan",
  "btn-lang",
  "btn-tour",
  "btn-next-structured",
  "btn-practice-stop",
  "btn-practice-start",
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

test.use({
  headless: false,
  viewport: { width: 1920, height: 1080 },
  launchOptions: {
    slowMo: process.env.CI ? 0 : Number(process.env.SLOWMO || 40),
    args: ["--start-maximized"]
  }
});

async function dismissOverlays(page) {
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
      tour.style.display = "none";
    }
    document.body.classList.remove("tour-active");
    document.querySelectorAll(".tour-backdrop").forEach((el) => {
      el.style.display = "none";
      el.hidden = true;
    });
    const m = document.getElementById("leave-modal");
    if (m) {
      document.getElementById("leave-discard")?.click();
      m.hidden = true;
      m.style.display = "none";
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

async function fit(page) {
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.getElementById("toast")?.classList.remove("show");
    window.VTApp?.syncHeaderHeightVar?.();
    window.VTApp?.fitHighwayToViewport?.();
  });
  await page.waitForTimeout(50);
  await page.evaluate(() => window.VTApp?.fitHighwayToViewport?.());
  await page.waitForTimeout(80);
}

async function hitCenter(page, sel) {
  return page.evaluate((selector) => {
    const el = document.querySelector(selector);
    if (!el) return { ok: false, reason: "missing" };
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2) return { ok: false, reason: "zero", r: { ...r } };
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const top = document.elementFromPoint(x, y);
    const ok = !!(top && (top === el || el.contains(top)));
    return {
      ok,
      x,
      y,
      r: { t: r.top, b: r.bottom, w: r.width, h: r.height },
      top: top
        ? { id: top.id, tag: top.tagName, cls: String(top.className || "").slice(0, 50) }
        : null
    };
  }, sel);
}

/** Fit, verify center hit, mouse-click. Retries once after re-fit. */
async function clickControl(page, sel) {
  await dismissOverlays(page);
  await fit(page);
  let hit = await hitCenter(page, sel);
  if (!hit.ok) {
    await page.locator(sel).scrollIntoViewIfNeeded().catch(() => {});
    await fit(page);
    hit = await hitCenter(page, sel);
  }
  if (!hit.ok || hit.x == null) {
    return { ok: false, hit };
  }
  await page.mouse.move(hit.x - 12, hit.y, { steps: 4 });
  await page.mouse.move(hit.x, hit.y, { steps: 6 });
  // Re-check after move (fullscreen layout can shift)
  hit = await hitCenter(page, sel);
  if (!hit.ok) {
    // Last resort: Playwright locator click (auto-scroll) after ensuring not covered by tour
    await page.locator(sel).click({ timeout: 5000, force: false }).catch(() => {});
    return { ok: false, hit, usedForcePath: true };
  }
  await page.mouse.click(hit.x, hit.y, { delay: 30 });
  return { ok: true, hit };
}

async function clickStartStop(page, exId, entry, issues) {
  if (!(await page.locator("#btn-practice-start").isVisible().catch(() => false))) return;
  const result = await clickControl(page, "#btn-practice-start");
  entry.clicked.push({ id: "btn-practice-start", ok: result.ok });
  if (!result.ok) {
    issues.push({ ex: exId, id: "btn-practice-start", code: "hit_miss", top: result.hit?.top, r: result.hit?.r });
    entry.failed.push({ id: "btn-practice-start", code: "hit_miss" });
  }
  await page.waitForTimeout(750);
  let live = await page.evaluate(() => !document.querySelector("#btn-practice-stop")?.hidden);
  if (!live) {
    await fit(page);
    await page.locator("#btn-practice-start").click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
    live = await page.evaluate(() => !document.querySelector("#btn-practice-stop")?.hidden);
  }
  entry.live = live;
  if (!live) return issues.push({ ex: exId, id: "btn-practice-start", code: "no_live" });
  await fit(page);
  const stop = await clickControl(page, "#btn-practice-stop");
  entry.clicked.push({ id: "btn-practice-stop", ok: stop.ok });
  if (!stop.ok) issues.push({ ex: exId, id: "btn-practice-stop", code: "hit_miss", top: stop.hit?.top });
  await page.waitForTimeout(300);
  await dismissOverlays(page);
  await page.evaluate(() => document.querySelector("#metrics-card")?.classList.add("collapsed"));
}

async function restoreToggle(page, id, selector) {
  if (id === "btn-toggle-guide" || id === "btn-toggle-metrics") {
    await page.waitForTimeout(100);
    const expanded = await page.evaluate((kind) => {
      const card = kind === "btn-toggle-guide"
        ? document.querySelector(".guide-card") : document.querySelector("#metrics-card");
      return card && !card.classList.contains("collapsed");
    }, id);
    if (expanded) await clickControl(page, selector);
  }
  if (id === "btn-toggle-piano") {
    await page.evaluate(() => {
      if (window.VTApp?.getState?.()?.pianoOpen) {
        document.getElementById("btn-toggle-piano")?.click();
      }
    });
  }
}

async function clickVisibleControls(page, exId, entry, issues) {
  await fit(page);
  const controls = await listExerciseControls(page);
  entry.inventory = controls.map((c) => c.id);
  for (const control of controls) {
    if (SKIP.has(control.id) || !control.hasDomId || control.id.startsWith("anon-")) continue;
    const selector = `#${control.id}`;
    if (!(await page.locator(selector).isVisible().catch(() => false))) continue;
    try {
      const result = await clickControl(page, selector);
      entry.clicked.push({ id: control.id, ok: result.ok });
      if (!result.ok && (control.kind === "button" || control.tag === "BUTTON")) {
        issues.push({ ex: exId, id: control.id, code: "hit_miss", top: result.hit?.top });
        entry.failed.push({ id: control.id, code: "hit_miss" });
      }
      await restoreToggle(page, control.id, selector);
      await page.waitForTimeout(40);
    } catch (err) {
      entry.failed.push({ id: control.id, code: "error", msg: String(err.message || err).slice(0, 80) });
    }
  }
}

async function clickModeButtons(page, entry) {
  const modeN = await page.locator("#mode-focus button:visible, #mode-hud button:visible").count();
  for (let i = 0; i < Math.min(modeN, 6); i++) {
    const btn = page.locator("#mode-focus button:visible, #mode-hud button:visible").nth(i);
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    const box = await btn.boundingBox();
    if (!box) continue;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, { delay: 25 });
    entry.clicked.push({ id: `mode-${i}`, ok: true });
  }
}

async function clickBack(page) {
  await fit(page);
  await dismissOverlays(page);
  if (!(await page.locator("#btn-back-home").isVisible().catch(() => false))) return;
  const result = await clickControl(page, "#btn-back-home");
  if (!result.ok) await page.locator("#btn-back-home").click().catch(() => {});
  await page.waitForTimeout(100);
  await dismissOverlays(page);
  await page.evaluate(() => window.VTApp?.setView?.("home"));
}

async function exerciseFullscreen(page, exId, issues) {
  const entry = { id: exId, clicked: [], failed: [] };
  await dismissOverlays(page);
  await openExercise(page, exId);
  await dismissOverlays(page);
  await fit(page);
  await page.waitForTimeout(150);
  await clickStartStop(page, exId, entry, issues);
  await clickVisibleControls(page, exId, entry, issues);
  await clickModeButtons(page, entry);
  await clickBack(page);
  return entry;
}

// One retryable test per exercise avoids a 360-second all-or-nothing timeout.
for (const exId of EXERCISES) test(`fullscreen controls: ${exId}`, async ({ page }) => {
  test.setTimeout(180000);
  await boot(page, { lang: "es", tourDone: true, mic: "silent" });
  await dismissOverlays(page);

  await page.addStyleTag({
    content: `
      #vt-fs-cursor {
        position: fixed; z-index: 2147483647; width: 16px; height: 16px;
        margin: -8px 0 0 -8px; border-radius: 50%;
        background: #ff2d55; box-shadow: 0 0 0 2px #fff;
        pointer-events: none !important;
      }
      #tour-root, .tour-backdrop {
        display: none !important;
        pointer-events: none !important;
        visibility: hidden !important;
      }
      body.tour-active { overflow: auto !important; }
    `
  });
  await page.evaluate(() => {
    const d = document.createElement("div");
    d.id = "vt-fs-cursor";
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

  // User gesture → Fullscreen API
  await page.mouse.click(240, 140);
  await page.evaluate(async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      /* blocked — still run at 1920×1080 */
    }
  });
  await page.waitForTimeout(250);
  await dismissOverlays(page);
  await fit(page);

  const isFs = await page.evaluate(() => !!document.fullscreenElement);
  const issues = [];
  const log = {
    fullscreen: isFs,
    viewport: page.viewportSize(),
    exercises: []
  };

  log.exercises.push(await exerciseFullscreen(page, exId, issues));
  await page
    .evaluate(async () => {
      if (document.fullscreenElement) await document.exitFullscreen?.();
    })
    .catch(() => {});

  console.log(
    "\n[fullscreen-clicks]",
    JSON.stringify(
      {
        fullscreen: log.fullscreen,
        viewport: log.viewport,
        issues,
        perEx: log.exercises.map((e) => ({
          id: e.id,
          clicked: e.clicked.length,
          failed: e.failed.length,
          live: e.live
        }))
      },
      null,
      2
    )
  );

  expect(issues, `Fullscreen click issues:\n${JSON.stringify(issues, null, 2)}`).toEqual(
    []
  );
});
