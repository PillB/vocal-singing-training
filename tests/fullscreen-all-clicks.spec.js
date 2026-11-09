/**
 * Headed fullscreen: browser Fullscreen API + mouse-click every visible control.
 *
 *   npm run test:fullscreen-clicks
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise } = require("./helpers/e2e");
const { practiceProbe, listExerciseControls } = require("./helpers/ui-forensics");

const ALL_EXERCISES = [
  "v1-diction",
  "s15-sh-air-ladder",
  "s9-pitch-match",
  "s2-solfege-chords"
];

// Each scheduled run must test one exercise within the existing 360s cap.
// No filter means all four, useful for a local, deliberately long inspection.
const EXERCISES = process.env.FULLSCREEN_IDS
  ? process.env.FULLSCREEN_IDS.split(",").map((id) => id.trim()).filter(Boolean)
  : ALL_EXERCISES;
if (EXERCISES.length === 0 || EXERCISES.some((id) => !ALL_EXERCISES.includes(id))) {
  throw new Error("FULLSCREEN_IDS must contain known nonempty exercise IDs");
}

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
    slowMo: Number(process.env.SLOWMO || 40) || 40,
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
    // This is not a cosmetic overlay: VTTour marks the exercise <section>
    // inert, so hiding its root by hand leaves every button unclickable.
    // End via the real controller to clear inert, focus trap and highlight.
    if (window.VTTour?.isActive?.()) window.VTTour.end(null);
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

const FS_STYLE = `
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
`;

/** A visible cursor dot, then a user gesture into the Fullscreen API. True when the page went fullscreen. */
async function enterFullscreen(page) {
  await page.addStyleTag({ content: FS_STYLE });
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
  return page.evaluate(() => !!document.fullscreenElement);
}

const stopVisible = (page) => page.evaluate(() => !document.querySelector("#btn-practice-stop")?.hidden);

/** --- 1) Start / Stop first (before any page scroll) --- */
async function startThenStop(page, exId, entry, issues) {
  if (!(await page.locator("#btn-practice-start").isVisible().catch(() => false))) return;
  const r = await clickControl(page, "#btn-practice-start");
  entry.clicked.push({ id: "btn-practice-start", ok: r.ok });
  if (!r.ok) {
    issues.push({
      ex: exId,
      id: "btn-practice-start",
      code: "hit_miss",
      top: r.hit?.top,
      r: r.hit?.r
    });
    entry.failed.push({ id: "btn-practice-start", code: "hit_miss" });
  }
  await page.waitForTimeout(750);
  entry.live = await stopVisible(page);
  if (!entry.live) {
    // Retry Start with locator click
    await fit(page);
    await page.locator("#btn-practice-start").click({ timeout: 5000 }).catch(() => {});
    await page.waitForTimeout(800);
    entry.live = await stopVisible(page);
  }
  if (!entry.live) {
    issues.push({ ex: exId, id: "btn-practice-start", code: "no_live" });
    return;
  }
  await fit(page);
  const rs = await clickControl(page, "#btn-practice-stop");
  entry.clicked.push({ id: "btn-practice-stop", ok: rs.ok });
  if (!rs.ok) {
    issues.push({
      ex: exId,
      id: "btn-practice-stop",
      code: "hit_miss",
      top: rs.hit?.top
    });
  }
  await page.waitForTimeout(300);
  await dismissOverlays(page);
  // collapse metrics so stage stays clear
  await page.evaluate(() => {
    document.querySelector("#metrics-card")?.classList.add("collapsed");
  });
}

/** Put back what a click opened: an expanded guide or metrics card closes again, and the piano stays closed. */
async function restoreAfterClick(page, c, sel) {
  if (c.id === "btn-toggle-guide" || c.id === "btn-toggle-metrics") {
    await page.waitForTimeout(100);
    const open = await page.evaluate((id) => {
      const card =
        id === "btn-toggle-guide"
          ? document.querySelector(".guide-card")
          : document.querySelector("#metrics-card");
      return card && !card.classList.contains("collapsed");
    }, c.id);
    if (open) await clickControl(page, sel);
  }
  if (c.id === "btn-toggle-piano") {
    // leave closed
    await page.evaluate(() => {
      if (window.VTApp?.getState?.()?.pianoOpen) {
        document.getElementById("btn-toggle-piano")?.click();
      }
    });
  }
}

/** One listed control: skipped, unnamed and hidden ones are left alone; a button whose center is covered is an issue. */
async function clickListedControl(page, c, exId, entry, issues) {
  if (SKIP.has(c.id)) return;
  if (!c.hasDomId || c.id.startsWith("anon-")) return;
  const sel = `#${c.id}`;
  const visible = await page.locator(sel).isVisible().catch(() => false);
  if (!visible) return;

  try {
    const r = await clickControl(page, sel);
    entry.clicked.push({ id: c.id, ok: r.ok });
    // Soft: range inputs can report miss on track padding — only hard-fail buttons
    if (!r.ok && (c.kind === "button" || c.tag === "BUTTON")) {
      issues.push({
        ex: exId,
        id: c.id,
        code: "hit_miss",
        top: r.hit?.top
      });
      entry.failed.push({ id: c.id, code: "hit_miss" });
    }
    await restoreAfterClick(page, c, sel);
    await page.waitForTimeout(40);
  } catch (e) {
    entry.failed.push({
      id: c.id,
      code: "error",
      msg: String(e.message || e).slice(0, 80)
    });
  }
}

/** Mode buttons */
async function clickModes(page, entry) {
  const modes = page.locator("#mode-focus button:visible, #mode-hud button:visible");
  const modeN = await modes.count();
  for (let i = 0; i < Math.min(modeN, 6); i++) {
    const btn = modes.nth(i);
    await btn.scrollIntoViewIfNeeded().catch(() => {});
    const box = await btn.boundingBox();
    if (!box) continue;
    await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
      delay: 25
    });
    entry.clicked.push({ id: `mode-${i}`, ok: true });
  }
}

/** Back */
async function clickBack(page, entry, log) {
  await fit(page);
  await dismissOverlays(page);
  if (!(await page.locator("#btn-back-home").isVisible().catch(() => false))) return;
  const rb = await clickControl(page, "#btn-back-home");
  if (!rb.ok) {
    // A real hit-target failure is evidence, not a reason to click forever
    // (Playwright's locator timeout 0 consumed the full six-minute test).
    entry.failed.push({ id: "btn-back-home", code: "hit_miss", hit: rb });
    log.exercises.push(entry);
    throw new Error("Back button center blocked: " + JSON.stringify(rb));
  }
  await page.waitForTimeout(100);
  await dismissOverlays(page);
  await page.evaluate(() => window.VTApp?.setView?.("home"));
}

async function clickExercise(page, exId, issues, log) {
  const entry = { id: exId, clicked: [], failed: [] };
  await dismissOverlays(page);
  await openExercise(page, exId);
  await dismissOverlays(page);
  await fit(page);
  await page.waitForTimeout(150);

  await startThenStop(page, exId, entry, issues);

  // --- 2) All other visible controls ---
  await fit(page);
  const controls = await listExerciseControls(page);
  entry.inventory = controls.map((c) => c.id);
  for (const c of controls) await clickListedControl(page, c, exId, entry, issues);

  await clickModes(page, entry);
  await clickBack(page, entry, log);
  log.exercises.push(entry);
}

test("fullscreen: mouse-click all visible buttons per exercise", async ({ page }) => {
  test.setTimeout(360000);
  await boot(page, { lang: "es", tourDone: true, mic: "silent" });
  await dismissOverlays(page);

  const isFs = await enterFullscreen(page);
  const issues = [];
  const log = {
    fullscreen: isFs,
    viewport: page.viewportSize(),
    exercises: []
  };

  for (const exId of EXERCISES) await clickExercise(page, exId, issues, log);

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
