const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

/** Ensure English for tests that assert English mode copy; default app is Spanish */
async function forceEn(page) {
  await page.goto(BASE);
  const lang = await page.locator("html").getAttribute("lang");
  if (lang === "es") await page.click("#btn-lang");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
}

async function forceEs(page) {
  await page.goto(BASE);
  const lang = await page.locator("html").getAttribute("lang");
  if (lang === "en") await page.click("#btn-lang");
  await expect(page.locator("html")).toHaveAttribute("lang", "es");
}

test.describe("Exercise-specific practice modes", () => {
  test("profiles and modes load for all exercises", async ({ page }) => {
    await page.goto(BASE);
    const report = await page.evaluate(() => {
      const all = [...VT_EXERCISES.vocal, ...VT_EXERCISES.singing];
      const missing = all.filter((e) => !e.practice?.mode).map((e) => e.id);
      const modes = typeof VTPracticeModes !== "undefined" ? VTPracticeModes.ids() : [];
      return { total: all.length, missing, modeCount: modes.length };
    });
    expect(report.total).toBe(34);
    expect(report.missing).toEqual([]);
    expect(report.modeCount).toBeGreaterThan(10);
  });

  test("v2 volume shows volume lane not pitch challenge", async ({ page }) => {
    await forceEn(page);
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").nth(1).click();
    await expect(page.locator("#ex-title")).toContainText("Maintain Volume");
    await expect(page.locator(".mode-panel.mode-volumeSteady")).toBeVisible();
    await expect(page.locator(".volume-lane")).toBeVisible();
    await expect(page.locator("#pitch-block")).toBeHidden();
  });

  test("v10 pause detect UI not pitch game", async ({ page }) => {
    await forceEn(page);
    await page.click('.tier-chip[data-tier="advanced"]');
    await page.locator("#exercise-list .card-ex").first().click();
    await expect(page.locator("#ex-title")).toContainText("Pause");
    await expect(page.locator(".mode-panel.mode-pauseDetect")).toBeVisible();
    await expect(page.locator("#pitch-block")).toBeHidden();
  });

  test("v11 fillers is distinct from pause mode", async ({ page }) => {
    await forceEn(page);
    await page.click('.tier-chip[data-tier="advanced"]');
    await page.locator("#exercise-list .card-ex", { hasText: "Kill the Fillers" }).click();
    await expect(page.locator(".mode-panel.mode-fillerDetect")).toBeVisible();
    await expect(page.locator(".mode-panel.mode-pauseDetect")).toHaveCount(0);
  });

  test("v8 metaphors is not rate ladder", async ({ page }) => {
    await forceEn(page);
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex", { hasText: "Metaphors" }).click();
    await expect(page.locator(".mode-panel.mode-metronomeSpeech")).toBeVisible();
    await expect(page.locator(".mode-title")).toContainText("Metaphor");
  });

  test("v3 soft palate has count logger", async ({ page }) => {
    await forceEn(page);
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex", { hasText: "Soft Palate" }).click();
    await expect(page.locator(".mode-panel.mode-countPace")).toBeVisible();
    await expect(page.locator("[data-plus]")).toBeVisible();
  });

  test("s14 staccato is not pen contrast shell", async ({ page }) => {
    await forceEn(page);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="advanced"]');
    await page.locator("#exercise-list .card-ex", { hasText: "Staccato" }).click();
    await expect(page.locator(".mode-panel.mode-staccatoLegato")).toBeVisible();
  });

  test("s10 scale is pitch-gated wording", async ({ page }) => {
    await forceEn(page);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="advanced"]');
    await page.getByRole("button", { name: /Five-Note Scale/i }).click();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    await expect(page.locator("#mode-hud")).toContainText("pitch-gated");
  });

  test("s1 fry is pitchHold without forcing challenge game hud", async ({ page }) => {
    await forceEn(page);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").first().click();
    await expect(page.locator(".mode-panel.mode-pitchHold")).toBeVisible();
    await expect(page.locator("#pitch-block")).toBeVisible();
    await expect(page.locator("#hold-display")).toBeVisible();
    // Score corner may show; challenge option stays off for fry
    await expect(page.locator("#chk-pitch-challenge")).not.toBeChecked();
  });

  test("s9 pitch match enables game HUD", async ({ page }) => {
    await forceEn(page);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="advanced"]');
    await page.locator("#exercise-list .card-ex", { hasText: "Single-Note Pitch Match" }).click();
    await expect(page.locator(".mode-panel.mode-pitchMatch")).toBeVisible();
    await expect(page.locator("#pitch-game-hud")).toBeVisible();
    await expect(page.locator("#chk-pitch-challenge")).toBeChecked();
  });

  test("s5 sirens use range mode not pitchMatch", async ({ page }) => {
    await forceEn(page);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="advanced"]');
    await page.locator("#exercise-list .card-ex", { hasText: "Sirens" }).click();
    await expect(page.locator(".mode-panel.mode-sirenRange")).toBeVisible();
    await expect(page.locator("#chk-pitch-challenge")).not.toBeChecked();
  });

  test("single Start practice CTA still primary", async ({ page }) => {
    await forceEs(page);
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").first().click();
    await expect(page.locator("#btn-practice-start")).toBeVisible();
    await expect(page.locator("#btn-pitch-start")).toBeHidden();
    await expect(page.locator("#mode-hud")).not.toBeEmpty();
  });

  test("structured session + continue still work", async ({ page }) => {
    await forceEs(page);
    await page.selectOption("#session-path", "basic");
    await page.click("#btn-structured");
    await expect(page.locator("#session-banner")).toHaveClass(/visible/);
    await expect(page.locator("#mode-hud .mode-panel")).toBeVisible();
    await page.click("#btn-session-end");
    await page.click("#btn-continue");
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  });

  test("tier counts unchanged", async ({ page }) => {
    await page.goto(BASE);
    await page.click('.tier-chip[data-tier="basic"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(9);
    await page.click('.tier-chip[data-tier="advanced"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(11);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="all"]');
    await expect(page.locator("#exercise-list .card-ex")).toHaveCount(14);
  });

  test("save metrics still works", async ({ page }) => {
    await forceEs(page);
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").first().click();
    await page.click("#btn-toggle-guide");
    await page.fill('#metrics-form [name="duration"]', "5");
    await page.click("#btn-complete");
    await expect(page.locator("#score-result .score-big")).toContainText("/ 10");
  });

  test("Spanish is default; English toggle works", async ({ page }) => {
    await page.goto(BASE);
    // reset lang via evaluate to es
    await page.evaluate(() => {
      localStorage.setItem("vt_lang", "es");
    });
    await page.goto(BASE);
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
    await expect(page.locator("h1")).toContainText("Entrenamiento");
    await expect(page.locator("#btn-continue")).toContainText("Continuar");
    await page.click("#btn-lang");
    await expect(page.locator("html")).toHaveAttribute("lang", "en");
    await expect(page.locator("h1")).toContainText("Vocal");
    await expect(page.locator("#btn-continue")).toContainText("Continue");
    await page.click("#btn-lang");
    await expect(page.locator("html")).toHaveAttribute("lang", "es");
  });

  test("hold grace constants are lenient", async ({ page }) => {
    await page.goto(BASE);
    const grace = await page.evaluate(() => ({
      grace: window.VT_HOLD_GRACE_MS,
      silence: window.VT_SILENCE_END_MS,
      min: window.VT_HOLD_MIN_SEC
    }));
    expect(grace.grace).toBeGreaterThanOrEqual(500);
    expect(grace.silence).toBeGreaterThanOrEqual(800);
    expect(grace.min).toBe(2);
  });

  test("sustain checkbox still present with arpeggio", async ({ page }) => {
    await forceEn(page);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").nth(1).click();
    await expect(page.locator("#chk-sustain")).toBeVisible();
    await expect(page.locator("#chk-arpeggio")).toBeVisible();
  });

  test("Spanish exercise titles on cards", async ({ page }) => {
    await forceEs(page);
    await page.click('.tier-chip[data-tier="basic"]');
    await expect(page.locator("#exercise-list .card-ex").first()).toContainText("dicción");
  });

  test("chord highway stage is above the fold with overlays", async ({ page }) => {
    await forceEn(page);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").nth(1).click();
    await expect(page.locator("#highway-stage")).toBeVisible();
    await expect(page.locator(".hud-tl")).toBeVisible();
    await expect(page.locator(".hud-bl #btn-practice-start")).toBeVisible();
    await expect(page.locator("#pitch-canvas")).toBeVisible();
    // guide is below cockpit, collapsed by default
    await expect(page.locator(".guide-card")).toHaveClass(/collapsed/);
  });

  test("wide jump progressions available for solfege", async ({ page }) => {
    await forceEn(page);
    await page.click('.tab[data-tab="singing"]');
    await page.click('.tier-chip[data-tier="basic"]');
    await page.locator("#exercise-list .card-ex").nth(1).click();
    // Piano panel is collapsed by default — open it for progression list
    await page.locator("#btn-toggle-piano").click();
    await expect(page.locator("#prog-buttons")).toContainText("Wide jumps");
    const hasJump = await page.evaluate(() => !!window.VT_PROGRESSIONS?.progJump1);
    expect(hasJump).toBeTruthy();
  });
});
