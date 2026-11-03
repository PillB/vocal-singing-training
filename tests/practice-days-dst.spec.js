// r9/storage killer for S7 (diffDays floors/ceils instead of rounding). Drop-in for tests/.
// Goal (js/practice-days.js): days are LOCAL calendar days and a day is always exactly one day after the one before it, also on the
// night the clocks change. Two calendar days are 23 h apart on the spring-forward night and 25 h apart on the fall-back night;
// parseDay anchors at noon so the gap between two keys is 23, 24 or 25 hours, and diffDays rounds it to whole days.
// Every spec that touches the ledger (daily-loop, local-day) runs in America/Lima, which has no daylight-saving time, so a diffDays that
// floors (spring forward: 0.958 days -> 0) or ceils (fall back: 1.04 days -> 2) is invisible to the suite.
// Wrong: the longest run ("best") is cut in two at the clock change and "days away" is one short (or one long).
// Expected values are counted from the calendar (consecutive dates written into the ledger), not read from the code.
const { test, expect } = require("@playwright/test");

test.use({ timezoneId: "America/New_York", locale: "en-US" });

// n consecutive calendar dates from y-m-d, counted in UTC so that the test's own arithmetic has no DST in it
const run = (y, m, d, n) => Array.from({ length: n }, (_, i) => new Date(Date.UTC(y, m - 1, d + i)).toISOString().slice(0, 10));
const ledger = (keys) => {
  const days = {};
  keys.forEach((k) => { days[k] = { sec: 240, n: 2, ex: ["s4-lip-trills"] }; });
  return { v: 1, days, rest: { bank: 0, earnedAt: 0, used: [] }, backfilled: true };
};

async function summaryAt(page, nowIso, keys) {
  await page.clock.install({ time: new Date(nowIso) });
  await page.addInitScript((l) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      sessionStorage.setItem("vt_e2e", "1");
      localStorage.setItem("vt_days_v1", JSON.stringify(l));
    } catch { /* blocked */ }
  }, ledger(keys));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTDays, null, { timeout: 10000 });
  return page.evaluate(() => {
    const s = window.VTDays.summary();
    return { today: s.today, best: s.best, streak: s.streak, practiceDays: s.practiceDays, daysAway: s.daysAway };
  });
}

test("control: nine days in a row in January (no clock change) are a best run of 9", async ({ page }) => {
  const r = await summaryAt(page, "2026-02-20T12:00:00-05:00", run(2026, 1, 4, 9));
  expect(r).toEqual({ today: "2026-02-20", best: 9, streak: 0, practiceDays: 9, daysAway: 39 });
});

test("nine days in a row across the spring-forward night (8 March 2026, New York) are one run of 9", async ({ page }) => {
  const r = await summaryAt(page, "2026-04-20T12:00:00-04:00", run(2026, 3, 4, 9)); // 4..12 March
  expect(r).toEqual({ today: "2026-04-20", best: 9, streak: 0, practiceDays: 9, daysAway: 39 });
});

test("seven days in a row across the fall-back night (1 November 2026, New York) are one run of 7", async ({ page }) => {
  const r = await summaryAt(page, "2026-12-01T12:00:00-05:00", run(2026, 10, 29, 7)); // 29 Oct..4 Nov
  expect(r).toEqual({ today: "2026-12-01", best: 7, streak: 0, practiceDays: 7, daysAway: 27 });
});

test("practised on 6 March, back on 9 March: three days away, across the spring-forward night", async ({ page }) => {
  const r = await summaryAt(page, "2026-03-09T10:00:00-04:00", ["2026-03-06"]);
  expect(r.today).toBe("2026-03-09");
  expect(r.daysAway).toBe(3);
});

test("practised on 30 October, back on 2 November: three days away, across the fall-back night", async ({ page }) => {
  const r = await summaryAt(page, "2026-11-02T10:00:00-05:00", ["2026-10-30"]);
  expect(r.today).toBe("2026-11-02");
  expect(r.daysAway).toBe(3);
});
