// r9/storage killer for S13 (counts(): a minute accumulated stops counting at exactly 60 s). Drop-in for tests/.
// Goal (docs/37-DAILY-LOOP.md): "A day counts when anything was practised on it (n > 0), a minute accumulated, or a take was saved."
// A minute is 60 s: 59 s of time on its own is not a practice day, 60 s is, and 30 s + 30 s is. A row gets time without a count when
// a take already counted on an earlier day is topped up (record({ bump: false }), js/app.js: the rated save of an auto-recorded step
// after midnight). No spec records time without a count, so the boundary is never crossed.
// Wrong: `> 60` -> a learner whose step ran exactly 60 s after midnight has no practice day for it, and the streak breaks.
const { test, expect } = require("@playwright/test");

test.use({ timezoneId: "America/Lima", locale: "es-PE" });

async function boot(page) {
  await page.clock.install({ time: new Date("2026-09-23T15:00:00Z") }); // 10:00 on 23 September in Lima
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      sessionStorage.setItem("vt_e2e", "1");
      localStorage.setItem("vt_days_v1", JSON.stringify({ v: 1, days: {}, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true }));
    } catch { /* blocked */ }
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTDays, null, { timeout: 10000 });
}

// time added to today's row without counting a take, then what the ledger says
const topUp = (page, parts) =>
  page.evaluate((secs) => {
    const last = secs.map((sec) => window.VTDays.record({ sec, bump: false }));
    return { becameDay: last.map((r) => r.becameDay), practiceDays: window.VTDays.summary().practiceDays };
  }, parts);

test("control: 120 s of time with no take counted is a practice day", async ({ page }) => {
  await boot(page);
  expect(await topUp(page, [120])).toEqual({ becameDay: [true], practiceDays: 1 });
});

test("59 s of time with no take counted is not yet a practice day", async ({ page }) => {
  await boot(page);
  expect(await topUp(page, [59])).toEqual({ becameDay: [false], practiceDays: 0 });
});

test("exactly 60 s of time with no take counted is a practice day", async ({ page }) => {
  await boot(page);
  expect(await topUp(page, [60])).toEqual({ becameDay: [true], practiceDays: 1 });
});

test("30 s and then 30 s add up to a minute: the second one makes the day", async ({ page }) => {
  await boot(page);
  expect(await topUp(page, [30, 30])).toEqual({ becameDay: [false, true], practiceDays: 1 });
});
