// r9/storage killer for S10 (dayKey takes its month from UTC) and for any partial-UTC variant of it (year, date). Drop-in for tests/.
// Goal (QA-36): the learner's day is the calendar day on THEIR wall clock, in every zone and on every date, not only in Lima on
// 2-3 November. local-day.spec.js and daily-loop.spec.js run in Lima (UTC-5) on dates where the UTC and local MONTH and YEAR agree,
// so a day key that mixes a local date with a UTC month or year is green there. It is wrong at the edges: the last evening of a
// month in the west, the first morning of a month (or of a year) in the far east.
// Expected keys are written by hand from each zone's fixed offset (Kiritimati UTC+14, Auckland NZDT UTC+13, Pago Pago UTC-11,
// Lima UTC-5; none of them changes on these dates), not read from the code.
const { test, expect } = require("@playwright/test");

async function keyIn(browser, timezoneId, iso) {
  const ctx = await browser.newContext({ timezoneId, locale: "en-US" });
  try {
    const page = await ctx.newPage();
    await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 503, body: "{}" }));
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTDays, null, { timeout: 10000 });
    return await page.evaluate((i) => {
      const k = window.VTDays.dayKey(new Date(i));
      return { key: k, next: window.VTDays.addDays(k, 1) };
    }, iso);
  } finally {
    await ctx.close();
  }
}

for (const [tz, iso, key, next, why] of [
  ["Pacific/Kiritimati", "2026-12-31T20:00:00Z", "2027-01-01", "2027-01-02", "UTC+14: still 31 December, 2026 in UTC; already 1 January 2027 on the wall clock"],
  ["Pacific/Auckland", "2026-01-31T12:00:00Z", "2026-02-01", "2026-02-02", "UTC+13 (NZDT): 31 January in UTC, 01:00 on 1 February on the wall clock"],
  ["Pacific/Pago_Pago", "2027-01-01T05:00:00Z", "2026-12-31", "2027-01-01", "UTC-11: 1 January 2027 in UTC, 18:00 on 31 December 2026 on the wall clock"],
  ["America/Lima", "2026-11-01T01:00:00Z", "2026-10-31", "2026-11-01", "UTC-5: 1 November in UTC, 20:00 on 31 October on the wall clock"],
  ["America/Lima", "2026-11-02T17:00:00Z", "2026-11-02", "2026-11-03", "control: noon in Lima, where the UTC and local calendars agree"]
]) {
  test(`${tz}: ${iso} is the learner's day ${key} (${why})`, async ({ browser }) => {
    expect(await keyIn(browser, tz, iso)).toEqual({ key, next });
  });
}
