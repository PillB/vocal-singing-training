/** Real UI regressions for persistent skill instructions and the optional pitch-graph aid.
 * Synthetic microphone and Web Audio graph state are automation evidence, never physical audibility.
 */
const { test, expect } = require("@playwright/test");
const { boot } = require("./helpers/e2e");
const { patchBillingConfig } = require("./helpers/billing");

async function ready(page, lang = "en") {
  await patchBillingConfig(page, { skillSetsRequirePro: false, verification: { apiBaseUrl: "" } });
  await page.addInitScript(() => {
    localStorage.setItem("vt_skill_discovery_v1", JSON.stringify({ v: 1, visits: 1 }));
    sessionStorage.setItem("vt_sets_e2e", "1");
    sessionStorage.setItem("vt_rate_e2e", "1");
  });
  await boot(page, { lang, mic: "silent" });
  await page.waitForFunction(() => !!window.VTSets && !!window.VTSession);
  await expect(page.locator("#btn-skill-first")).toBeVisible();
}

async function startSet(page, id) {
  await page.locator("#btn-skill-first").click();
  await expect(page.locator("#sets-sheet")).toBeVisible();
  await page.locator(`[data-set-start="${id}"]`).click();
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  expect(await page.evaluate(() => VTStorage.getSession()?.set)).toBe(id);
}

async function nextStep(page, id) {
  const next = page.locator("#btn-next-structured");
  await expect(next).toBeVisible();
  await next.click();
  await expect.poll(() => page.evaluate(() => VTApp.getState().exercise?.id)).toBe(id);
}

async function live(page) {
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => page.evaluate(() => VTApp.getState().practiceLive)).toBe(true);
  await expect(page.locator("#btn-practice-stop")).toBeVisible();
}

async function ownsPointer(locator) {
  await locator.scrollIntoViewIfNeeded();
  const hit = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const target = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return { h: r.height, inside: r.top >= -1 && r.bottom <= innerHeight + 1, owns: el === target || el.contains(target) };
  });
  expect(hit.h, JSON.stringify(hit)).toBeGreaterThanOrEqual(44);
  expect(hit.inside, JSON.stringify(hit)).toBe(true);
  expect(hit.owns, JSON.stringify(hit)).toBe(true);
}

for (const words of [
  { lang: "en", first: "Mark a natural pause in your own sentence.", middle: "Sing a thought with a relaxed neck and shoulders.", transfer: "Try a fresh phrase and choose a comfortable pause.", safety: "Stop for pain or dizziness.", phase: "Transfer" },
  { lang: "es", first: "Señala una pausa de sentido en un texto propio.", middle: "Prueba una idea completa con hombros y cuello libres.", transfer: "Canta otra frase nueva y elige dónde descansar.", safety: "Para ante dolor o mareo.", phase: "Transfiere" }
]) {
  test(`a running set retains its actual Observe, Try and Transfer instructions and safety fallback (${words.lang})`, async ({ page }) => {
    await ready(page, words.lang);
    await startSet(page, "s-skill-breath");
    await expect(page.locator("#skill-context")).toBeVisible();
    await expect(page.locator("#skill-context-task")).toHaveText(words.first);
    await expect(page.locator("#stage-guide-steps")).toContainText(words.first);
    await nextStep(page, "s8-breath-support");
    await expect(page.locator("#skill-context-task")).toHaveText(words.middle);
    await nextStep(page, "s3-song-stanzas");
    await expect(page.locator("#skill-context-title")).toContainText(words.phase);
    await expect(page.locator("#skill-context-task")).toHaveText(words.transfer);
    await expect(page.locator("#skill-context-fallback")).toContainText(words.safety);
    await live(page);
    await expect(page.locator("#skill-context-task")).toHaveText(words.transfer);
    await expect(page.locator("#mode-cue")).toHaveText(words.transfer);
    await page.locator("#btn-practice-stop").click();
    await expect.poll(() => page.evaluate(() => VTApp.getState().practiceLive)).toBe(false);
    await expect(page.locator("#skill-context-task")).toHaveText(words.transfer);
    await expect(page.locator("#skill-context-fallback")).toContainText(words.safety);
  });
}

for (const viewport of [{ name: "desktop", width: 1280, height: 900 }, { name: "phone", width: 390, height: 844 }]) {
  test(`pitch graph off/on preserves the take and piano, then resets for the next step and individual practice (${viewport.name})`, async ({ page }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.clock.install();
    await ready(page);
    await page.clock.pauseAt(new Date((await page.evaluate(() => Date.now())) + 10000));
    await startSet(page, "s-skill-pitch");
    const toggle = page.locator("#skill-feedback-toggle");
    await expect(toggle).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#pitch-canvas")).toBeVisible();
    await live(page);
    await ownsPointer(toggle);
    const before = await page.locator("#pitch-canvas").boundingBox();
    expect(before.width).toBeGreaterThan(0);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#pitch-canvas")).toBeHidden();
    const after = await page.locator("#pitch-canvas").evaluate((el) => ({ w: el.getBoundingClientRect().width, h: el.getBoundingClientRect().height }));
    expect(Math.abs(after.w - before.width), "hiding feedback preserves its layout width").toBeLessThanOrEqual(2);
    expect(Math.abs(after.h - before.height), "hiding feedback preserves its layout height").toBeLessThanOrEqual(2);
    expect(await page.evaluate(() => VTApp.getState().practiceLive), "hiding the visual aid must not end the take").toBe(true);
    await ownsPointer(page.locator("#btn-practice-stop"));
    await expect(page.locator("#btn-toggle-piano")).toBeVisible();
    await page.locator("#btn-toggle-piano").click();
    await expect(page.locator("#piano-block")).toBeVisible();
    await expect(page.locator("#btn-ref-pitch")).toBeVisible();
    await page.locator("#btn-ref-pitch").click();
    await expect.poll(() => page.evaluate(() => (VTPiano.playing || []).length)).toBeGreaterThan(0);
    await ownsPointer(toggle);
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await expect(page.locator("#pitch-canvas")).toBeVisible();
    await toggle.click();
    await page.locator("#btn-practice-stop").click();
    await expect.poll(() => page.evaluate(() => VTApp.getState().practiceLive)).toBe(false);
    await nextStep(page, "s10-five-note");
    await expect(page.locator("#pitch-canvas")).toBeVisible();
    await expect(toggle).toHaveAttribute("aria-pressed", "false");
    await toggle.click();
    await expect(page.locator("#pitch-canvas")).toBeHidden();
    await page.evaluate(() => VTApp.openExercise("s9-pitch-match"));
    await expect(page.locator("#skill-context")).toBeHidden();
    await expect(page.locator("#pitch-canvas")).toBeVisible();
    await expect(toggle).toBeHidden();
    await expect(page.locator("#btn-practice-start")).toBeVisible();
  });
}

test("clarity starts with a listen-first task instead of the contradictory over-articulation exercise", async ({ page }) => {
  await ready(page);
  const started = await page.evaluate(() => VTSets.start("v-skill-clarity"));
  expect(started).toBeTruthy();
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  expect(await page.evaluate(() => VTApp.getState().exercise?.id)).toBe("v7-record-review");
  await expect(page.locator("#skill-context-task")).toHaveText("Listen to one sentence at your usual pace.");
  await expect(page.locator("#stage-guide-steps")).not.toContainText(/over-articulat/i);
  await nextStep(page, "v23-clear-speech");
  await expect(page.locator("#skill-context-task")).toHaveText("Repeat with clear consonants and useful pauses.");
  await nextStep(page, "v10-power-pause");
  await expect(page.locator("#skill-context-task")).toHaveText("Speak about a new topic and notice intelligibility.");
});
