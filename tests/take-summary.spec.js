/**
 * The take's measured summary under the time in the rating card ("Esta toma: …").
 *
 * Wrong behaviours rejected (found by the round-4 red team on the first version):
 * - The line was introduced by `rate.take`, the label of the recording player ("Tu grabación"),
 *   so a sentence of numbers read "Tu grabación Sin ritmo medido…". It has its own wording now,
 *   in both languages.
 * - Take 1's numbers stayed on the card while take 2 was being sung.
 * - A take that ends without the Stop announcement (leave, then "Puntuar ahora") kept take 1's
 *   numbers instead of its own, or instead of nothing: the card then described a take that was
 *   not the one just sung, next to a rating that saves against this one.
 * Control: the numbers do appear after a real Stop, so "cleared" is not "never shown".
 *
 * The mode's measurement is stood in for with onStop (what the mode reports when the take ends):
 * a silent test microphone gives every take the same text, and a summary that cannot differ
 * between takes cannot tell "this take's" from "the last take's".
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise, startPractice } = require("./helpers/e2e");

const sum = (page) =>
  page.evaluate(() => {
    const el = document.getElementById("rate-sum");
    return { text: el.textContent, hidden: el.hidden, kept: window.VTApp.getState().rate.summary };
  });

/** Take 1: sing, press Stop. Its numbers go to the card. */
async function firstTake(page) {
  await openExercise(page, "v1-diction");
  await startPractice(page);
  await page.clock.runFor(1500);
  await page.locator("#btn-practice-stop").click();
  await expect.poll(async () => (await sum(page)).hidden).toBe(false);
}

for (const [lang, label, notLabel] of [
  ["es", "Esta toma:", "Tu grabación"],
  ["en", "This take:", "Your recording"]
]) {
  test(`${lang}: the summary is introduced as this take's, not as the recording`, async ({ page }) => {
    await page.clock.install();
    await boot(page, { lang });
    await firstTake(page);
    const s = await sum(page);
    expect(s.text.startsWith(`${label} `), `"${s.text}"`).toBe(true);
    expect(s.text).not.toContain(notLabel);
    expect(s.text.length, "control: there are numbers after the label").toBeGreaterThan(label.length + 3);
  });
}

test("take 2 starts: take 1's numbers leave the card", async ({ page }) => {
  await page.clock.install();
  await boot(page, { lang: "es" });
  await firstTake(page);
  expect((await sum(page)).kept, "control: take 1 left numbers").toBeTruthy();
  await startPractice(page);
  const s = await sum(page);
  expect(s.hidden, "hidden while take 2 is live").toBe(true);
  expect(s.text).toBe("");
  expect(s.kept, "and not kept for later").toBeNull();
});

for (const [name, result, expected] of [
  ["its own numbers", { summary: "TOMA DOS 7 s" }, "Esta toma: TOMA DOS 7 s"],
  ["nothing when it measured nothing", {}, null]
]) {
  test(`a take that ends by leaving ("Puntuar ahora") shows ${name}, not take 1's`, async ({ page }) => {
    await page.clock.install();
    await boot(page, { lang: "es" });
    await firstTake(page);
    const s1 = (await sum(page)).kept;
    await startPractice(page);
    await page.evaluate((r) => {
      window.VTApp.getState().modeInstance.onStop = () => r;
    }, result);
    await page.clock.fastForward(50000);
    await page.clock.runFor(500);
    await page.locator("#btn-back-home").click();
    await expect(page.locator("#leave-modal")).toBeVisible();
    await page.locator("#leave-save").click();
    await expect(page.locator("#leave-modal")).toBeHidden();
    const s = await sum(page);
    expect(s.text, `take 1 said "${s1}"`).not.toContain(s1);
    if (expected) {
      expect(s.hidden).toBe(false);
      expect(s.text).toBe(expected);
    } else {
      expect(s.hidden).toBe(true);
      expect(s.text).toBe("");
    }
  });
}
