// r9/storage killer for S5 (the event log keeps the OLDEST 500 events instead of the newest). Drop-in for tests/.
// Goal: vt_analytics_v1 is a bounded log (500 events, so it never fills the 5 MB the whole origin shares, QA-47) and when it is full
// the newest event is kept and the oldest is dropped. Nothing in the suite fills the log: ab-events and region-gate read a handful.
// Wrong: `slice(0, MAX)` keeps the first 500, so once the log is full every new event is dropped and the log is frozen for good;
// the funnel the log exists for goes silent exactly for the people who use the site most.
// Right: after one more event the log still holds 500, its last entry is the new one and the first entry of the old log is gone.
const { test, expect } = require("@playwright/test");

const seed = (n) => ({ events: Array.from({ length: n }, (_, i) => ({ name: `e${i}`, props: {}, t: "2026-01-01T00:00:00.000Z" })) });

async function boot(page, log) {
  await page.addInitScript((l) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      sessionStorage.setItem("vt_e2e", "1");
      // seed once: the page writes its own events while it boots and a reload must not undo that
      if (!sessionStorage.getItem("vt_seeded")) {
        sessionStorage.setItem("vt_seeded", "1");
        localStorage.setItem("vt_analytics_v1", JSON.stringify(l));
      }
    } catch { /* blocked */ }
  }, log);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTAnalytics, null, { timeout: 10000 });
}

// Re-seed to an exact size AFTER boot, so the page's own boot events cannot change the count under test.
const fillAndTrack = (page, n) =>
  page.evaluate((count) => {
    const events = Array.from({ length: count }, (_, i) => ({ name: `e${i}`, props: {}, t: "2026-01-01T00:00:00.000Z" }));
    localStorage.setItem("vt_analytics_v1", JSON.stringify({ events }));
    const result = window.VTAnalytics.track("newest", {});
    const stored = JSON.parse(localStorage.getItem("vt_analytics_v1"));
    return { result, n: stored.events.length, first: stored.events[0].name, last: stored.events[stored.events.length - 1].name };
  }, n);

test("control: below the cap every event is kept, oldest first", async ({ page }) => {
  await boot(page, seed(0));
  expect(await fillAndTrack(page, 3)).toEqual({ result: "recorded", n: 4, first: "e0", last: "newest" });
});

test("at the cap (500) the next event is kept, the oldest is dropped, the log stays 500", async ({ page }) => {
  await boot(page, seed(0));
  expect(await fillAndTrack(page, 500)).toEqual({ result: "recorded", n: 500, first: "e1", last: "newest" });
});

test("well over the cap (an old build kept more) the log is cut back to the newest 500", async ({ page }) => {
  await boot(page, seed(0));
  expect(await fillAndTrack(page, 700)).toEqual({ result: "recorded", n: 500, first: "e201", last: "newest" });
});
