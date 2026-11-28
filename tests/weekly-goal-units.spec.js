const { test, expect } = require("@playwright/test");
const { boot } = require("./helpers/e2e");
const { enableQaPro } = require("./helpers/billing");

for (const [lang, dayWords, sessionWords, explanation] of [
  ["es", /días de práctica/, /Sesiones por semana/, /un solo día de práctica/],
  ["en", /practice-day/, /Sessions per week/, /one practice day/]
]) {
  test(`weekly units stay distinct and a synced 14-session goal survives rendering (${lang})`, async ({ page }) => {
    await enableQaPro(page);
    await boot(page, { lang, mic: "silent" });
    await expect(page.locator("#loop-goal-label")).toContainText(dayWords);
    await page.evaluate(() => VTStorage.setGoals({ weeklySessionsTarget: 14 }));
    await page.locator('[data-view="history"]').first().click();
    await expect(page.locator('label[for="sel-week-goal"]')).toContainText(sessionWords);
    await expect(page.locator("#sel-week-goal")).toHaveValue("14");
    await expect(page.locator('[data-i18n="pro.goalUnits"]')).toContainText(explanation);
    expect(await page.evaluate(() => VTStorage.getGoals().weeklySessionsTarget)).toBe(14);
    await page.locator("#sel-week-goal").selectOption("5");
    await page.reload();
    await page.locator('[data-view="history"]').first().click();
    await expect(page.locator("#sel-week-goal")).toHaveValue("5");
    expect(await page.evaluate(() => VTStorage.getGoals().weeklySessionsTarget)).toBe(5);
  });
}
