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

/**
 * Errors the flow must not raise. An uncaught exception on Start used to pass
 * all 16 sampled flows (QA-10, FM4): nothing listened. Allowed errors are
 * listed with the reason they are not the app's fault; anything else fails.
 */
const ENTITLEMENTS = /^https:\/\/vocal-studio-entitlements\.[^/]+\.workers\.dev\//;
const ERROR_ALLOW = [
  {
    // The account worker allows only the Pages origin (checked 2026-11-01:
    // Access-Control-Allow-Origin: https://pillb.github.io), so from the test
    // server the sign-in methods request is refused. Live, it is not.
    why: "entitlements worker CORS from 127.0.0.1",
    test: (e) => ENTITLEMENTS.test(e.url) || /Access to fetch at 'https:\/\/vocal-studio-entitlements\./.test(e.text)
  }
];

function watchErrors(page) {
  const errors = [];
  page.on("pageerror", (e) => errors.push({ kind: "pageerror", text: String(e?.message || e), url: "" }));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push({ kind: "console.error", text: m.text(), url: m.location()?.url || "" });
  });
  return errors;
}

function unexpectedErrors(errors) {
  return errors.filter((e) => !ERROR_ALLOW.some((a) => a.test(e)));
}

async function bootFlow(page, vp) {
  const errors = watchErrors(page);
  await page.setViewportSize({ width: vp.width, height: vp.height });
  await page.addInitScript(installClickLogInit);
  await boot(page, { lang: "es", tourDone: true, mic: "silent" });
  await page.evaluate(installClickLogInit);
  await dismissBlockingOverlays(page);
  await page.addStyleTag({
    content: `#tour-root,.tour-backdrop{display:none!important;pointer-events:none!important}`
  });
  return errors;
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

/** What the app made of the slider: its label, the saved level, the engine's level. */
const micPlumbing = (page) =>
  page.evaluate(() => ({
    slider: document.getElementById("mic-sensitivity")?.value,
    label: document.getElementById("mic-sens-val")?.textContent.trim(),
    saved: localStorage.getItem("vt_mic_sens"),
    engine: String(window.VTApp?.getState?.()?.practice?.getSensitivity?.() ?? "")
  }));

/**
 * Drag the mic sensitivity slider like a user, then restore it. A native range
 * input moves under the mouse even when its handler is dead (QA-10, FM5: 7 to
 * 4 with the handler disabled), so "the value changed" proves nothing; the
 * label, the saved level and the engine must all follow the slider.
 */
async function dragMic(page) {
  const slider = page.locator("#mic-sensitivity");
  if (!(await slider.isVisible().catch(() => false))) return null;
  const v0 = await slider.inputValue();
  const box = await slider.boundingBox();
  if (box) await dragSlider(page, box, 0.7, 0.35, 10);
  const moved = await micPlumbing(page);
  if (box) await dragSlider(page, box, 0.35, 0.7, 8);
  const back = await micPlumbing(page);
  const follows = (m) => m.label === m.slider && m.saved === m.slider && m.engine === m.slider;
  const ok = moved.slider !== String(v0) && follows(moved) && follows(back);
  return { id: "mic-sensitivity", action: "drag", ok, v0, moved, back };
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

/**
 * Press Start once with the mouse. There is no second "recovery" press: it
 * hid a Start that swallowed the first click, which a learner meets as a
 * dead button (QA-10, FM2).
 */
async function pressStart(page) {
  await clearClickLog(page);
  await reflowStage(page);
  const st = await mouseClickAndLog(page, "#btn-practice-start", "btn-practice-start");
  const live = await waitLive(page, 3000);
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
    hard.push({ code: "start_no_live", msg: "One press of Start did not go live" });
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
  if (!sp.logOk) hard.push({ code: "stop_log_mismatch", recent: sp.recent });
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
  if (mic && !mic.ok) hard.push({ code: "mic_slider_dead", detail: mic });
  const guide = await toggleGuide(page);
  if (guide) {
    entry.clicks.push(guide);
    if (!guide.logOk) hard.push({ code: "click_log_mismatch", detail: guide });
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
      const errors = await bootFlow(page, VIEWPORTS[0]);
      const { entry, hard } = await runExerciseFlow(page, exId);
      entry.errors = errors;
      await testInfo.attach("flow.json", {
        body: JSON.stringify(entry, null, 2),
        contentType: "application/json"
      });
      expect(hard, `Hard flow issues for ${exId}:\n${JSON.stringify(hard, null, 2)}`).toEqual([]);
      expect(entry.issues, `Soft flow issues for ${exId}`).toEqual([]);
      expect(unexpectedErrors(errors), `Errors during the ${exId} flow`).toEqual([]);
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
        const errors = await bootFlow(page, vp);
        const { entry, hard } = await runSampleFlow(page, exId);
        entry.errors = errors;
        await testInfo.attach("flow.json", {
          body: JSON.stringify(entry, null, 2),
          contentType: "application/json"
        });
        expect(hard, JSON.stringify(hard, null, 2)).toEqual([]);
        expect(unexpectedErrors(errors), `Errors during the ${exId} flow`).toEqual([]);
      });
    }
  }
});
