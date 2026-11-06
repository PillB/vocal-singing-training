// Browser-level proof that the safety guidance is what the learner sees, and
// that the breathing pacer does not insert the old compulsory hold phase.
const { test, expect } = require("@playwright/test");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page, lang = "es") {
  await page.addInitScript((l) => {
    localStorage.setItem("vt_tour_v1", "1");
    localStorage.setItem("vt_lang", l);
    sessionStorage.setItem("vt_e2e", "1");
  }, lang);
  await page.goto(BASE + "/?e2e", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
}

async function guide(page, id) {
  await page.evaluate((exerciseId) => window.VTApp.openExercise(exerciseId), id);
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  await page.locator("#btn-toggle-guide").click();
  await expect(page.locator("#guide-body")).toBeVisible();
  return page.locator("#guide-body").innerText();
}

for (const lang of ["es", "en"]) {
  test(`${lang}: learner-visible guides distinguish safety, transfer, and natural vibrato`, async ({ page }) => {
    await boot(page, lang);
    const ladder = await guide(page, "s15-sh-air-ladder");
    expect(ladder).toMatch(lang === "es" ? /puedes saltarte los peldaños/ : /longer rungs unfinished/);
    const straw = await guide(page, "s6-straw");
    expect(straw).toMatch(lang === "es" ? /cañita más ancha/ : /wider straw/);
    const s = await guide(page, "s8-breath-support");
    expect(s).toMatch(/4.?6/);
    expect(s).toMatch(lang === "es" ? /no flujo real de aire/ : /not actual airflow/);
    const pitch = await guide(page, "s9-pitch-match");
    expect(pitch).toMatch(/vibrato/i);
    expect(pitch).toMatch(lang === "es" ? /no diagnostica/ : /cannot diagnose/);
    const breath = await guide(page, "s18-costal-breath");
    expect(breath).toMatch(lang === "es" ? /no retengas el aire/ : /do not hold your breath/);
  });
}

test("390px learner: s18 runs inhale → exhale without a hold, and never asks for microphone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await boot(page);
  await page.evaluate(() => {
    window.__techGumCalls = 0;
    navigator.mediaDevices.getUserMedia = () => {
      window.__techGumCalls++;
      return Promise.reject(new Error("Denied by test"));
    };
  });
  await page.locator('.tab[data-tab="singing"]').click();
  await page.locator('#exercise-list .card-ex[data-id="s18-costal-breath"]').click();
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  const counts = await page.locator("#mode-focus .mode-meta").innerText();
  expect(counts).toMatch(/4–0–6/);
  await page.locator("#btn-practice-start").click();
  // Observe the actual transition instead of assuming the browser draws within 4.7s.
  await expect(page.locator("#mode-focus [data-stage]")).toContainText("Exhala", { timeout: 10000 });
  expect(await page.evaluate(() => window.__techGumCalls)).toBe(0);
  const stage = page.locator("#mode-focus [data-stage]");
  const box = await stage.boundingBox();
  expect(box, "breath stage is actually visible").toBeTruthy();
  expect(box.y).toBeGreaterThanOrEqual(0);
  expect(box.y + box.height).toBeLessThanOrEqual(844);
  await page.locator("#btn-practice-stop").click();
});
