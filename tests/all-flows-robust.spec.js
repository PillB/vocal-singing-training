/**
 * All exercises × robust layout + mouse click log confirmation.
 * - Programmatic overflow / placement probe
 * - Real mouse clicks with __vtClickLog press confirmation
 * - Mic drag + Start/Stop flow
 * - Multi-viewport sample + fullscreen-like
 *
 * One generated test per exercise (and per viewport × sample exercise), so
 * the suite shards evenly in CI and a failure names the exercise that broke.
 * The previous single serial test walked 47 exercises inside one 15-minute
 * budget and timed out without saying which exercise was slow or wrong.
 *
 *   npm run test:all-flows
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise } = require("./helpers/e2e");
const {
  installClickLogInit,
  dismissBlockingOverlays,
  reflowStage,
  probeLayout,
  clearClickLog,
  mouseClickAndLog
} = require("./helpers/layout-probe");
const SNAPSHOT = require("./fixtures/catalog-snapshot.json");

const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 800 },
  { name: "phone", width: 390, height: 844 },
  { name: "phone-land", width: 844, height: 390 },
  { name: "fullscreen-like", width: 1920, height: 1080 },
  { name: "short-wide", width: 1366, height: 520 }
];

// Full catalog exercised on the primary viewport; a sample on the others.
const ALL_IDS = SNAPSHOT.catalog.map((e) => e.id);
const SAMPLE_EX = ["v1-diction", "s15-sh-air-ladder", "s9-pitch-match", "s2-solfege-chords"];

const LAYOUT_HARD = new Set([
  "stage_overflow_y",
  "start_offscreen",
  "start_hit_miss",
  "mode_focus_covers_start"
]);

async function bootFlow(page, vp) {
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.addInitScript(installClickLogInit);
  await boot(page, { lang: "es", tourDone: true, mic: "silent" });
  await page.evaluate(installClickLogInit);
  await dismissBlockingOverlays(page);
  await page.addStyleTag({
    content: `#tour-root,.tour-backdrop{display:none!important;pointer-events:none!important}`
  });
}

async function waitForStageLayout(page) {
  // wait-may-fail: probeLayout() records a 0×0 Start/stage as a layout issue
  // and openedIssues() fails the test when Start is missing.
  await page
    .waitForFunction(
      () => {
        const b = document.getElementById("btn-practice-start");
        const s = document.getElementById("highway-stage");
        if (!b || !s) return false;
        const br = b.getBoundingClientRect();
        const sr = s.getBoundingClientRect();
        return br.width >= 8 && br.height >= 8 && sr.width >= 40 && sr.height >= 40;
      },
      null,
      { timeout: 8000 }
    )
    .catch(() => {});
}

function needsRecovery(layout) {
  if (layout.start && layout.start.w < 8) return true;
  if (layout.stage && layout.stage.w < 40) return true;
  return layout.issues.some((i) =>
    ["start_offscreen", "stage_overflow_y", "start_hit_miss"].includes(i.code)
  );
}

/** Open the exercise and return the settled layout probe (one recovery re-fit). */
async function openAndProbe(page, exId) {
  await dismissBlockingOverlays(page);
  await openExercise(page, exId);
  await dismissBlockingOverlays(page);
  await reflowStage(page);
  await waitForStageLayout(page);
  await reflowStage(page);
  let layout = await probeLayout(page);
  if (needsRecovery(layout)) {
    await page.evaluate(() => {
      window.scrollTo(0, 0);
      document.getElementById("toast")?.classList.remove("show");
      window.VTApp?.fitHighwayToViewport?.();
    });
    await reflowStage(page);
    layout = await probeLayout(page);
  }
  return layout;
}

/** Hard layout issues. A zero-size Start after recovery is logged, not hard. */
function layoutIssues(layout) {
  const hard = [];
  const soft = [];
  const top = layout.startHit?.top;
  for (const iss of layout.issues) {
    if (!LAYOUT_HARD.has(iss.code)) continue;
    const full = top ? { ...iss, top } : iss;
    if (layout.start && layout.start.w < 8) soft.push({ ...full, code: "start_zero_size" });
    else hard.push(full);
  }
  return { hard, soft };
}

async function currentMode(page) {
  return page.evaluate(() => {
    const st = window.VTApp?.getState?.();
    return st?.exercise ? window.VTApp.getProfile?.(st.exercise)?.mode : null;
  });
}

async function dragSlider(page, box, from, to, steps) {
  const y = box.y + box.height / 2;
  await page.mouse.move(box.x + box.width * from, y, { steps: 4 });
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * to, y, { steps });
  await page.mouse.up();
}

/** Drag the mic sensitivity slider like a user, then restore it. */
async function dragMic(page) {
  const slider = page.locator("#mic-sensitivity");
  if (!(await slider.isVisible().catch(() => false))) return null;
  const v0 = await slider.inputValue();
  const box = await slider.boundingBox();
  if (box) await dragSlider(page, box, 0.7, 0.35, 10);
  const v1 = await slider.inputValue();
  if (box) await dragSlider(page, box, 0.35, 0.7, 8);
  return { id: "mic-sensitivity", action: "drag", ok: String(v0) !== String(v1), v0, v1 };
}

async function toggleGuide(page) {
  if (!(await page.locator("#btn-toggle-guide").isVisible().catch(() => false))) return null;
  await clearClickLog(page);
  const g = await mouseClickAndLog(page, "#btn-toggle-guide", "btn-toggle-guide");
  await page.evaluate(() => {
    const c = document.querySelector(".guide-card");
    if (c && !c.classList.contains("collapsed")) {
      document.getElementById("btn-toggle-guide")?.click();
    }
  });
  return { id: "btn-toggle-guide", ...g };
}

const isLive = (page) =>
  page.evaluate(() => !document.querySelector("#btn-practice-stop")?.hidden);
const isStopped = (page) =>
  page.evaluate(() => !!document.querySelector("#btn-practice-stop")?.hidden);

/** Wait (bounded) for Stop to appear instead of sleeping a fixed 650 ms. */
async function waitLive(page, ms) {
  return page
    .waitForFunction(() => !document.querySelector("#btn-practice-stop")?.hidden, null, {
      timeout: ms
    })
    .then(() => true)
    .catch(() => false);
}

/** Press Start with the mouse; one recovery press if the first did not go live. */
async function pressStart(page) {
  await clearClickLog(page);
  await reflowStage(page);
  const st = await mouseClickAndLog(page, "#btn-practice-start", "btn-practice-start");
  let live = await waitLive(page, 3000);
  if (!live) {
    await reflowStage(page);
    await page.locator("#btn-practice-start").click({ timeout: 4000 }).catch(() => {});
    live = await waitLive(page, 3000);
  }
  return { st, live };
}

async function pressStop(page) {
  await clearClickLog(page);
  const sp = await mouseClickAndLog(page, "#btn-practice-stop", "btn-practice-stop");
  // wait-may-fail: isStopped() below is the assertion; startStop() fails on it.
  await page
    .waitForFunction(() => !!document.querySelector("#btn-practice-stop")?.hidden, null, {
      timeout: 3000
    })
    .catch(() => {});
  await dismissBlockingOverlays(page);
  return { sp, stopped: await isStopped(page) };
}

/** Start → live layout → Stop. Returns the issues found (hard and soft). */
async function startStop(page, entry) {
  const hard = [];
  const soft = [];
  const { st, live } = await pressStart(page);
  entry.clicks.push({ id: "btn-practice-start", ...st });
  if (!st.logOk && !st.preHit?.ok) {
    hard.push({ code: "start_click_log_fail", preHit: st.preHit, recent: st.recent });
  }
  entry.live = live;
  if (!live) {
    hard.push({ code: "start_no_live", msg: "Did not enter live after Start" });
    return { hard, soft };
  }
  await reflowStage(page);
  const liveLayout = await probeLayout(page);
  entry.liveLayoutIssues = liveLayout.issues.filter((i) =>
    ["stage_overflow_y", "mode_focus_covers_start", "stop_hit_miss"].includes(i.code)
  );
  const { sp, stopped } = await pressStop(page);
  entry.clicks.push({ id: "btn-practice-stop", ...sp });
  entry.stopped = stopped;
  if (!stopped) hard.push({ code: "stop_fail", msg: "Stop click did not end live" });
  if (!sp.logOk) soft.push({ code: "stop_log_mismatch", recent: sp.recent });
  return { hard, soft };
}

async function backHome(page, entry) {
  await reflowStage(page);
  await dismissBlockingOverlays(page);
  if (!(await page.locator("#btn-back-home").isVisible().catch(() => false))) return;
  await clearClickLog(page);
  const b = await mouseClickAndLog(page, "#btn-back-home", "btn-back-home");
  entry.clicks.push({ id: "btn-back-home", ...b });
  await dismissBlockingOverlays(page);
  entry.home = await page.evaluate(
    () => !!document.getElementById("view-home")?.classList.contains("active")
  );
}

/**
 * The exercise must really be on screen before anything else counts. Without
 * this, a helper that bounced the page home (as an unguarded VTTour.end() did)
 * left Start invisible, the Start/Stop block was skipped, and the test passed
 * having exercised nothing.
 */
async function openedIssues(page, exId, mode) {
  const st = await page.evaluate(() => ({
    view: !!document.getElementById("view-exercise")?.classList.contains("active"),
    id: window.VTApp?.getState?.()?.exercise?.id || null,
    start: (() => {
      const b = document.getElementById("btn-practice-start");
      const r = b?.getBoundingClientRect();
      return !!(b && !b.hidden && r && r.width >= 8 && r.height >= 8);
    })()
  }));
  const issues = [];
  if (!st.view || st.id !== exId) issues.push({ code: "not_opened", ...st });
  else if (mode !== "weekPlan" && !st.start) issues.push({ code: "start_missing", ...st });
  return issues;
}

/** The full per-exercise desktop flow. Returns { entry, hard }. */
async function runExerciseFlow(page, exId) {
  const entry = { id: exId, clicks: [], issues: [] };
  const layout = await openAndProbe(page, exId);
  const li = layoutIssues(layout);
  entry.layout = { issues: layout.issues, startHit: layout.startHit, start: layout.start };
  entry.issues.push(...li.soft);
  const hard = [...li.hard];

  const mic = await dragMic(page);
  if (mic) entry.clicks.push(mic);
  const guide = await toggleGuide(page);
  if (guide) {
    entry.clicks.push(guide);
    if (!guide.logOk) entry.issues.push({ code: "click_log_mismatch", detail: guide });
  }
  const mode = await currentMode(page);
  hard.push(...(await openedIssues(page, exId, mode)));
  if (mode !== "weekPlan" && (await page.locator("#btn-practice-start").isVisible())) {
    const ss = await startStop(page, entry);
    hard.push(...ss.hard);
    entry.issues.push(...ss.soft);
  }
  await backHome(page, entry);
  if (entry.home !== true) hard.push({ code: "back_not_home", msg: "Back did not return home" });
  return { entry, hard };
}

test.describe("all flows on every exercise (desktop)", () => {
  test("the flow matrix covers every exercise the app actually ships", async ({ page }) => {
    await boot(page, { lang: "es", tourDone: true, mic: "silent" });
    const runtime = await page.evaluate(() =>
      [...(window.VT_EXERCISES?.vocal || []), ...(window.VT_EXERCISES?.singing || [])].map(
        (e) => e.id
      )
    );
    // Wrong behaviour this guards: an exercise added to the app but not to the
    // snapshot would silently get no flow test at all.
    expect([...runtime].sort()).toEqual([...ALL_IDS].sort());
  });

  for (const exId of ALL_IDS) {
    test(`${exId}: layout, click log, mic, Start/Stop, back`, async ({ page }, testInfo) => {
      await bootFlow(page, VIEWPORTS[0]);
      const { entry, hard } = await runExerciseFlow(page, exId);
      await testInfo.attach("flow.json", {
        body: JSON.stringify(entry, null, 2),
        contentType: "application/json"
      });
      expect(hard, `Hard flow issues for ${exId}:\n${JSON.stringify(hard, null, 2)}`).toEqual([]);
    });
  }
});

/** Sample flow on a non-desktop viewport: layout hard issues + Start/Stop. */
async function runSampleFlow(page, exId) {
  const entry = { id: exId, clicks: [], issues: [] };
  const layout = await openAndProbe(page, exId);
  const hard = layout.issues.filter((i) => LAYOUT_HARD.has(i.code));
  if (await page.locator("#btn-practice-start").isVisible()) {
    const ss = await startStop(page, entry);
    hard.push(...ss.hard);
  }
  await page.evaluate(() => window.VTApp?.setView?.("home"));
  return { entry, hard };
}

test.describe("sample flows on other viewports", () => {
  for (const vp of VIEWPORTS.slice(1)) {
    for (const exId of SAMPLE_EX) {
      test(`${vp.name} ${vp.width}x${vp.height} / ${exId}`, async ({ page }, testInfo) => {
        await bootFlow(page, vp);
        const { entry, hard } = await runSampleFlow(page, exId);
        await testInfo.attach("flow.json", {
          body: JSON.stringify(entry, null, 2),
          contentType: "application/json"
        });
        expect(hard, JSON.stringify(hard, null, 2)).toEqual([]);
      });
    }
  }
});
