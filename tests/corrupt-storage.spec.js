// QA-35. A localStorage key that holds valid JSON of the wrong type (null, a number, an array)
// must not stop the app from booting. Correct: the home screen renders its exercise cards and an
// exercise opens. Wrong: an uncaught TypeError at init leaves a blank page until site data is cleared.
// Sources of such a value in the wild: a sync write from the server, an import, another build's schema.
// Adopted from the QA thread (round 4 part C, QA-35). Control: a clean boot passes. Currently red for: vt_settings_v1 (null, 42), vt_progress_v1 (null),
// vt_hold_logs_v1 (42 at boot; null when the first exercise opens), vt_session_v1 (array, 42: usable but throws).
// QA-44 (found on d59d574 by the QA thread, after the first fix): an OBJECT without `order` ({}, {"order":null}, {"path":"daily"})
// passed a check of the container type and then threw at js/session.js progressLabel on every setView; the banner showed
// "Sesion guiada" with no position and the rest of setView never ran. A reader that checks only the container type is not enough:
// it has to check the fields the callers dereference (order is an array, index is a finite number).
const { test, expect } = require("@playwright/test");

const CASES = [
  ["vt_settings_v1", "null"],
  ["vt_settings_v1", "42"],
  ["vt_progress_v1", "null"],
  ["vt_hold_logs_v1", "42"],
  ["vt_hold_logs_v1", "null"],
  ["vt_session_v1", "[1,2,3]"],
  ["vt_session_v1", "42"],
  // QA-44: valid JSON of the right container but without the fields the callers dereference
  ["vt_session_v1", "{}"],
  ["vt_session_v1", '{"order":null}'],
  ["vt_session_v1", '{"path":"daily"}'],
  ["vt_session_v1", '{"order":["v1-breath-flow"]}'],
  ["vt_session_v1", '{"order":["v1-breath-flow"],"index":"0"}'],
  // Added with the fix: the same class in the event log (js/analytics.js reads it on every tracked event)
  ["vt_analytics_v1", "null"],
  ["vt_analytics_v1", "42"],
  ["vt_analytics_v1", '{"events":5}']
];

async function boot(page, seed) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  await page.addInitScript((s) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      sessionStorage.setItem("vt_e2e", "1");
      for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v);
    } catch {
      /* storage blocked */
    }
  }, seed);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp, null, { timeout: 10000 });
  return errors;
}

test("control: a clean boot renders the exercise cards and throws nothing", async ({ page }) => {
  const errors = await boot(page, {});
  await expect.poll(() => page.locator("[data-ex-id], .ex-card, .exercise-card, button.card").count(), { timeout: 8000 }).toBeGreaterThan(3);
  expect(errors).toEqual([]);
});

for (const [key, value] of CASES) {
  test(`${key} = ${value}: the app still boots and throws nothing`, async ({ page }) => {
    const errors = await boot(page, { [key]: value });
    await expect.poll(() => page.locator("[data-ex-id], .ex-card, .exercise-card, button.card").count(), { timeout: 8000 }).toBeGreaterThan(3);
    // open the first exercise: some readers (hold history) only run there
    await page.evaluate(() => document.querySelector("[data-ex-id], .ex-card, .exercise-card, button.card").click());
    await page.waitForTimeout(600);
    expect(errors).toEqual([]);
  });
}

// QA-44 at the reader itself: the stored value is judged by the fields callers use, not by its container.
const SESSION_GOOD = { mode: "structured", track: "vocal", path: "basic", order: ["v1-breath-flow", "v2-lip-trill"], index: 1, status: "active", completedIds: ["v1-breath-flow"] };

async function sessionAfterBoot(page, stored) {
  await boot(page, { vt_session_v1: JSON.stringify(stored) });
  return page.evaluate(() => {
    const s = window.VTSession.get();
    return s && { order: s.order, index: s.index, completedIds: s.completedIds };
  });
}

test("a stored session with its order and index is read as it is", async ({ page }) => {
  const s = await sessionAfterBoot(page, SESSION_GOOD);
  expect(s).toEqual({ order: ["v1-breath-flow", "v2-lip-trill"], index: 1, completedIds: ["v1-breath-flow"] });
});

for (const bad of [{}, { order: null }, { path: "daily" }, { order: ["v1-breath-flow"] }, { order: ["v1-breath-flow"], index: "0" }, { order: "v1-breath-flow", index: 0 }, { order: [], index: NaN }]) {
  test(`a stored session ${JSON.stringify(bad)} is no session`, async ({ page }) => {
    expect(await sessionAfterBoot(page, bad)).toBeNull();
  });
}

test("a stored session without completedIds still completes a step", async ({ page }) => {
  const partial = { ...SESSION_GOOD };
  delete partial.completedIds;
  await boot(page, { vt_session_v1: JSON.stringify(partial) });
  const r = await page.evaluate(() => {
    const next = window.VTSession.markCurrentComplete();
    return { completedIds: next.completedIds, index: next.index };
  });
  expect(r).toEqual({ completedIds: ["v2-lip-trill"], index: 2 });
});

// QA-35 for the event log, at the reader: the tracker is best-effort, so the app swallows its exception and a
// log of the wrong kind never shows up as a page error. What does show is whether the next event is kept.
// Wrong: a number, an array or `{events: 5}` is used as the log, track() throws on it, and every event after is lost.
const PROBE = () => {
  const result = window.VTAnalytics.track("qa35_probe", {});
  const stored = JSON.parse(localStorage.getItem("vt_analytics_v1") || "null");
  return { result, names: stored && Array.isArray(stored.events) ? stored.events.map((e) => e.name) : null };
};

test("control: with no stored log the next event is recorded", async ({ page }) => {
  await boot(page, {});
  expect(await page.evaluate(PROBE)).toEqual({ result: "recorded", names: expect.arrayContaining(["qa35_probe"]) });
});

for (const bad of ["null", "42", "[1,2]", '{"events":5}', '{"events":"x"}', '{"events":null}']) {
  test(`vt_analytics_v1 = ${bad}: the next event starts a fresh log and is kept`, async ({ page }) => {
    await boot(page, { vt_analytics_v1: bad });
    expect(await page.evaluate(PROBE)).toEqual({ result: "recorded", names: expect.arrayContaining(["qa35_probe"]) });
  });
}
