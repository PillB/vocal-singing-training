/**
 * A learner's first month, day by day, with every surface read after each step (state-machine inventory,
 * 2026-11-26). The test keeps its own account of what was practised (which days, how many takes, how many
 * seconds the clock ran), and after the first visit and after each day's basics it walks Inicio, Plan,
 * Historial and Inicio again, and reads a second tab that was open all along and never reloaded. Each surface
 * must say what the test did: the same days, the same week, the same takes, no more minutes than were sung.
 *
 * The wrong behaviours it models: a surface that counts takes as days, minutes credited beyond the clock,
 * a second tab that keeps the record it loaded, History drawn before its record is read. Its mutants are the
 * LF16 to LF18 in the learner set of qa/mutate.mjs.
 */
const { test, expect } = require("@playwright/test");
const { boot } = require("./helpers/e2e");

// Noon UTC: the same calendar day in every time zone from -11 to +11, so the day keys do not move with the host.
const at = (d) => new Date(`2026-11-${String(d).padStart(2, "0")}T12:00:00Z`);
// 2 November 2026 is a Monday: the first visit opens a week.
const DAYS = [2, 3, 4, 6, 9, 20, 30];
const STEP_MS = 40000;

/** Monday of the week holding `d`, as a day of November (the month starts on a Sunday, so no week crosses into October). */
const mondayOf = (d) => d - ((at(d).getUTCDay() + 6) % 7);

/** What every surface of one tab says, read without moving it. */
async function readHome(page) {
  return page.evaluate(() => {
    const t = (s) => document.querySelector(s)?.textContent.replace(/\s+/g, " ").trim() ?? null;
    const week = [...document.querySelectorAll("#loop-week li")].map((l) => (/\bis-(done|rest|missed|today|future)\b/.exec(l.className) || [, ""])[1]);
    return { days: Number(t("#loop-days")), weekDone: week.filter((s) => s === "done").length, streak: t("#loop-streak"), goal: t("#loop-goal-text"), path: !document.getElementById("path-home-btn")?.hidden };
  });
}

async function go(page, view) {
  await page.locator(`[data-view="${view}"]`).first().click();
  await page.clock.runFor(400);
}

/** Historial, once its record is read (the recordings come from IndexedDB, so it draws a moment later). */
async function readHistory(page) {
  await go(page, "history");
  await expect
    .poll(() => page.evaluate(() => document.querySelector("#history-list")?.textContent.trim() !== VTI18n.t("history.loading")), { message: "History finished drawing" })
    .toBe(true);
  return page.evaluate(() => {
    const t = (s) => document.querySelector(s)?.textContent.replace(/\s+/g, " ").trim() ?? null;
    return { days: Number(/\d+/.exec(t("#hist-days-count") || "")?.[0] ?? 0), sessions: Number(t("#vp-sessions")), minutes: Number(t("#vp-minutes")), weekTakes: Number(/\d+/.exec(t("#pro-goal-progress") || "")?.[0] ?? -1) };
  });
}

/** Every surface, walked as a learner would: Inicio, Plan, Historial, back to Inicio. */
async function walk(page) {
  await go(page, "home");
  const home = await readHome(page);
  await go(page, "plan");
  const planWeek = await page.locator("#plan-week-num").textContent();
  const history = await readHistory(page);
  await go(page, "home");
  return { home, planWeek, history, again: await readHome(page) };
}

/** The day's basics from Inicio's main button: two steps, each sung for STEP_MS. */
async function basics(page) {
  await page.locator("#btn-next-step").click();
  await page.clock.runFor(500);
  let takes = 0;
  for (let i = 0; i < 2 && (await page.locator("#btn-practice-start").isVisible()); i += 1) {
    await page.locator("#btn-practice-start").click();
    await page.clock.fastForward(STEP_MS);
    // Not awaited in the page: the step's way out may wait on a timer, which only this clock moves.
    await page.evaluate(() => void window.VTApp.advanceStructured("next"));
    await page.clock.runFor(400);
    takes += 1;
  }
  if (await page.locator("#loop-done-close").isVisible()) await page.locator("#loop-done-close").click();
  await page.clock.runFor(300);
  return takes;
}

/** Seconds the day ledger holds, in all and for one day. */
const ledger = (page) =>
  page.evaluate(() => {
    const days = VTDays.read().days;
    return { total: Object.values(days).reduce((s, d) => s + (d.sec || 0), 0), today: days[VTDays.dayKey()]?.sec || 0 };
  });

async function open(context, d) {
  const page = await context.newPage();
  page.on("pageerror", (e) => page.errors.push(String(e)));
  page.errors = [];
  await page.clock.install({ time: at(d) });
  await boot(page, { lang: "es", mic: "silent" });
  await page.clock.runFor(1500);
  return page;
}

test.describe("a learner's first month, every surface after every step", () => {
  test("first visit, then seven days over four weeks: Inicio, Plan, Historial and a second tab agree with what was done", async ({ context }) => {
    test.setTimeout(240000);
    const tab = await open(context, DAYS[0]);
    const done = [];
    let takes = 0;

    const first = await walk(tab);
    expect(first.home, "first visit: nothing is counted yet").toMatchObject({ days: 0, weekDone: 0, path: false });
    expect(first.history).toMatchObject({ days: 0, sessions: 0, minutes: 0 });
    expect(first.planWeek).toContain("1");

    for (const d of DAYS) {
      if (d !== DAYS[0]) {
        await tab.clock.setSystemTime(at(d));
        await tab.reload({ waitUntil: "domcontentloaded" });
        await tab.clock.runFor(1500);
      }
      // A second tab, open before the day's practice and never reloaded.
      const other = await open(context, d);
      await tab.bringToFront();

      const before = await walk(tab);
      expect(before.home.days, `day ${d} on load: the days practised so far`).toBe(done.length);
      expect(before.again, `day ${d}: Inicio reads the same after a walk through Plan and Historial`).toEqual(before.home);

      const sung = await basics(tab);
      expect(sung, `day ${d}: the basics are two takes`).toBe(2);
      done.push(d);
      takes += sung;
      const week = done.filter((x) => x >= mondayOf(d) && x <= d).length;

      const after = await walk(tab);
      const label = `day ${d} after the basics`;
      expect(after.home.days, `${label}: Inicio counts days, not takes`).toBe(done.length);
      expect(after.home.weekDone, `${label}: this week's days on Inicio's strip`).toBe(week);
      expect(after.home.path, `${label}: Tu camino is open once a day is done`).toBe(true);
      expect(after.history.days, `${label}: Historial counts the same days`).toBe(done.length);
      expect(after.history.sessions, `${label}: Historial counts every take`).toBe(takes);
      expect(after.history.weekTakes, `${label}: the week's takes (the goal card counts takes: docs/54, the weekly goal)`).toBe(week * 2);
      expect(after.again, `${label}: Inicio reads the same after the walk`).toEqual(after.home);

      const sec = await ledger(tab);
      expect(sec.today, `${label}: the day holds no more than was sung`).toBeLessThanOrEqual((sung * STEP_MS) / 1000 + 1);
      expect(sec.today, `${label}: and the day holds the practice`).toBeGreaterThan(0);
      expect(after.history.minutes, `${label}: Historial's minutes are the days' seconds`).toBe(Math.round(sec.total / 60));

      // The other tab heard the record change and drew it again, without a reload.
      await other.clock.runFor(600);
      await go(other, "home");
      expect(await readHome(other), `${label}: the second tab shows what the first did`).toEqual(after.home);
      expect(other.errors, "no error in the second tab").toEqual([]);
      await other.close();
    }
    expect(tab.errors, "no error in the first tab").toEqual([]);
  });
});
