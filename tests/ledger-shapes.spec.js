// r9/storage killer for S11 (normalize() trusts ledger.days) and S12 (normalize() trusts ledger.rest.used). Drop-in for tests/.
// Goal (QA-35, applied to the practice-day ledger): vt_days_v1 is an object, so corrupt-storage.spec.js's null / 42 / [..] cases are
// read as "no ledger". But a ledger whose CONTAINER is right and whose fields are of another kind (an import, another build's schema,
// a sync from a device on an older build) goes through normalize(), the one function that repairs fields. Nothing seeds such a ledger.
// Right: each shape is repaired where it is broken, the page throws nothing, and a practice recorded today is kept and counted once.
// Wrong (S11): `days: 5` -> "Cannot create property '2026-09-23' on number '5'" at record(); `days: null` -> Object.keys(null).
// Wrong (S12): `rest.used: 5` -> "... is not iterable" when the summary is built, so the home screen's streak card never draws.
const { test, expect } = require("@playwright/test");

test.use({ timezoneId: "America/Lima", locale: "es-PE" });

const OK_REST = { bank: 1, earnedAt: 0, used: [] };
const SHAPES = {
  "days is a number": { v: 1, days: 5, rest: OK_REST, backfilled: true },
  "days is null": { v: 1, days: null, rest: OK_REST, backfilled: true },
  "days is a string": { v: 1, days: "2026-09-22", rest: OK_REST, backfilled: true },
  "rest is a number": { v: 1, days: {}, rest: 5, backfilled: true },
  "rest.used is a number": { v: 1, days: {}, rest: { bank: 1, earnedAt: 0, used: 5 }, backfilled: true },
  "rest.used is an object": { v: 1, days: {}, rest: { bank: 1, earnedAt: 0, used: { a: 1 } }, backfilled: true },
  "rest.used is a string": { v: 1, days: {}, rest: { bank: 1, earnedAt: 0, used: "2026-09-20" }, backfilled: true }
};

async function boot(page, ledger) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  await page.clock.install({ time: new Date("2026-09-23T15:00:00Z") }); // 10:00 on 23 September in Lima
  await page.addInitScript((l) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      sessionStorage.setItem("vt_e2e", "1");
      localStorage.setItem("vt_days_v1", JSON.stringify(l));
    } catch { /* blocked */ }
  }, ledger);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTDays, null, { timeout: 10000 });
  return errors;
}

const practise = (page) =>
  page.evaluate(() => {
    try {
      const rec = window.VTDays.record({ exerciseId: "s4-lip-trills", sec: 120 });
      const s = window.VTDays.summary();
      const stored = JSON.parse(localStorage.getItem("vt_days_v1"));
      return { ok: true, becameDay: rec.becameDay, practiceDays: s.practiceDays, today: s.today, stored: Object.keys(stored.days).sort() };
    } catch (e) { return { ok: false, err: String(e.message) }; }
  });

test("control: a well-formed empty ledger counts the practice recorded today", async ({ page }) => {
  await boot(page, { v: 1, days: {}, rest: OK_REST, backfilled: true });
  expect(await practise(page)).toEqual({ ok: true, becameDay: true, practiceDays: 1, today: "2026-09-23", stored: ["2026-09-23"] });
});

for (const [name, ledger] of Object.entries(SHAPES)) {
  test(`a ledger where ${name}: the page throws nothing and today's practice is kept`, async ({ page }) => {
    const errors = await boot(page, ledger);
    await page.waitForTimeout(600);
    expect(await practise(page)).toEqual({ ok: true, becameDay: true, practiceDays: 1, today: "2026-09-23", stored: ["2026-09-23"] });
    expect(errors).toEqual([]);
  });
}
