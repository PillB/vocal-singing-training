/**
 * Two places named the day in UTC where the learner's own calendar day belongs (QA-36):
 * the progress export's file name and the metronome-speech deck's starting card.
 * In Lima (UTC-5) the UTC date turns over at 19:00, so an evening export was
 * dated tomorrow and the deck changed in the middle of the evening.
 *
 * The clock is set so that the instant is the evening of 2 November in Lima and
 * already the 3rd in UTC. Controls: the same file name at noon, when both calendars agree,
 * and a deck that does change from one Lima day to the next.
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise } = require("./helpers/e2e");

test.use({ timezoneId: "America/Lima" });

const LIMA_EVENING = "2026-11-03T01:30:00Z"; // 20:30 on 2 November in Lima
const LIMA_NOON = "2026-11-02T17:00:00Z"; // 12:00 on 2 November in Lima

async function exportName(page, at) {
  await page.clock.install({ time: new Date(at) });
  await page.addInitScript((now) => {
    // A running trial is Pro, which is what the export needs
    localStorage.setItem("vt_billing_trial_started_v1", now);
  }, new Date(at).toISOString());
  await boot(page, { lang: "es" });
  const download = page.waitForEvent("download");
  await page.evaluate(() => document.getElementById("btn-export-progress").click());
  return (await download).suggestedFilename();
}

test("the export is named for the learner's day: 2 November at 20:30 in Lima", async ({ page }) => {
  expect(await exportName(page, LIMA_EVENING)).toBe("vocal-studio-progress-2026-11-02.json");
});

test("control: at noon the file carries the same date", async ({ page }) => {
  expect(await exportName(page, LIMA_NOON)).toBe("vocal-studio-progress-2026-11-02.json");
});

/** The deck's starting card on a fresh open of the exercise at `at`. */
async function deckStart(browser, at) {
  const ctx = await browser.newContext({ timezoneId: "America/Lima" });
  const page = await ctx.newPage();
  await page.clock.install({ time: new Date(at) });
  await boot(page, { lang: "es" });
  await openExercise(page, "v8-fluency-metaphors");
  const topics = await page.evaluate(() => window.VTApp.getState().modeInstance.state.topics.map((t) => t.text));
  await ctx.close();
  return JSON.stringify(topics);
}

test("the metronome-speech deck does not change at 19:00 in Lima, only at local midnight", async ({ browser }) => {
  const before = await deckStart(browser, "2026-11-02T23:30:00Z"); // 18:30 on the 2nd
  const after = await deckStart(browser, "2026-11-03T00:30:00Z"); // 19:30 on the 2nd, past UTC midnight
  const nextDay = await deckStart(browser, "2026-11-03T05:30:00Z"); // 00:30 on the 3rd
  expect(before, "control: the deck has cards").not.toBe("[]");
  expect(after, "same Lima day, same cards").toBe(before);
  expect(nextDay, "the next Lima day, other cards").not.toBe(before);
});
