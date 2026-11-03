// QA round 9 (BUG-1). A real defect of 564fe69, found on the clean tree and fixed in normalize() (js/practice-days.js).
// Goal: the same as ledger-shapes.spec.js. normalize() repairs `days` with `typeof b.days !== "object"`, and an ARRAY is typeof "object".
// A ledger with `"days": []` (a list where the keyed bag belongs: another build's schema, an import) is kept as it is; record() then sets
// bag.days["2026-09-23"] as a property of the array, JSON.stringify drops array properties, and the practice is gone on the next read.
// record() answers becameDay: true (the toast / milestone fire), but summary().practiceDays stays 0 and vt_days_v1 never gains the day,
// on every practice, forever: the learner's streak can never start. The same class as QA-35 (array where an object belongs), one level
// inside the container storage.js checks.
// Right: the list is discarded like any other wrong kind, and today's practice is kept (practiceDays 1, the day is stored).
// The fix: `if (!b.days || typeof b.days !== "object" || Array.isArray(b.days)) b.days = {};` (C31 removes the last clause).
const { test, expect } = require("@playwright/test");

test.use({ timezoneId: "America/Lima", locale: "es-PE" });

test("a ledger whose days is a list: today's practice is still kept", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-23T15:00:00Z") });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      sessionStorage.setItem("vt_e2e", "1");
      localStorage.setItem("vt_days_v1", JSON.stringify({ v: 1, days: [], rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true }));
    } catch { /* blocked */ }
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTDays, null, { timeout: 10000 });
  const r = await page.evaluate(() => {
    const rec = window.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
    const stored = JSON.parse(localStorage.getItem("vt_days_v1"));
    return { becameDay: rec.becameDay, practiceDays: window.VTDays.summary().practiceDays, storedIsObject: !Array.isArray(stored.days), storedDays: Object.keys(stored.days) };
  });
  expect(r).toEqual({ becameDay: true, practiceDays: 1, storedIsObject: true, storedDays: ["2026-09-23"] });
});
