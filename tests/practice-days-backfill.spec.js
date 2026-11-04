// r9/storage killer for S8 (backfill names the day of an old take from the UTC date of its timestamp) and S9 (backfill's dayKey
// no longer refuses a date it cannot read). Drop-in for tests/.
// Goal (js/practice-days.js, QA-36): the first read on a browser with history but no ledger rebuilds the practice days from the saved
// takes and held notes, one local calendar day each: "a returning singer keeps the days they already practised". `at` is an ISO
// instant in UTC; the learner's day is the day in THEIR zone. An unreadable `at` is no practice day.
// Every ledger spec seeds `backfilled: true`, so this whole path (the one place old UTC timestamps become local days) is not run
// by any test. Lima is UTC-5: 01:30Z on 3 November is 20:30 on the 2nd.
// Wrong (S8): the take is filed under 3 November, the day after it was sung, and the streak / week cells are off by one.
// Wrong (S9): an `at` that is not a date files a practice day named "NaN-NaN-NaN" and inflates the count of practice days.
const { test, expect } = require("@playwright/test");

test.use({ timezoneId: "America/Lima", locale: "es-PE" });

const NOW = "2026-11-03T15:00:00Z"; // 10:00 on 3 November in Lima

const take = (id, at) => ({ id, at, metrics: {}, score: 3, notes: "", durationSec: 120 });
const progress = (history) => ({ "s4-lip-trills": { completedCount: history.length, history, lastScore: 3, lastAt: history[0].at } });

async function ledgerAfterBackfill(page, { history, holds = [] }) {
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript(([p, h]) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      sessionStorage.setItem("vt_e2e", "1");
      localStorage.setItem("vt_progress_v1", JSON.stringify(p));
      localStorage.setItem("vt_hold_logs_v1", JSON.stringify(h));
      // no vt_days_v1: this browser has history and no ledger yet
    } catch { /* blocked */ }
  }, [progress(history), holds]);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTDays, null, { timeout: 10000 });
  return page.evaluate(() => {
    const s = window.VTDays.summary();
    const stored = JSON.parse(localStorage.getItem("vt_days_v1") || "null");
    return { practiceDays: s.practiceDays, firstDay: s.firstDay, lastDay: s.lastDay, keys: Object.keys((stored && stored.days) || {}).sort() };
  });
}

test("control: a take sung at noon in Lima is filed under that day", async ({ page }) => {
  const r = await ledgerAfterBackfill(page, { history: [take("a", "2026-11-02T17:00:00.000Z")] }); // 12:00 on the 2nd
  expect(r).toEqual({ practiceDays: 1, firstDay: "2026-11-02", lastDay: "2026-11-02", keys: ["2026-11-02"] });
});

test("a take sung at 20:30 on 2 November in Lima (01:30Z on the 3rd) is filed under the 2nd, and a held note at 21:00 on 31 October under the 31st", async ({ page }) => {
  const r = await ledgerAfterBackfill(page, {
    history: [take("a", "2026-11-03T01:30:00.000Z")],
    holds: [{ at: "2026-11-01T02:00:00.000Z", seconds: 8 }]
  });
  expect(r).toEqual({ practiceDays: 2, firstDay: "2026-10-31", lastDay: "2026-11-02", keys: ["2026-10-31", "2026-11-02"] });
});

test("a take or a held note whose time cannot be read is no practice day", async ({ page }) => {
  const r = await ledgerAfterBackfill(page, {
    history: [take("a", "2026-11-02T17:00:00.000Z"), take("b", "yesterday")],
    holds: [{ at: "soon", seconds: 3 }]
  });
  expect(r).toEqual({ practiceDays: 1, firstDay: "2026-11-02", lastDay: "2026-11-02", keys: ["2026-11-02"] });
});
