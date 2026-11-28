/**
 * Discovery is a returning document-session affordance, not a practice-day award or an automatic trial.
 * Wrong behaviours: reload counts as another visit, discovery takes focus/opens a modal, a locked start
 * changes the session, an expired trial restarts, or the future bundle gate blocks individual exercises.
 * Synthetic signed licenses exercise real verification; physical audio and browser zoom remain separate gates.
 */
const { test, expect } = require("@playwright/test");
const { patchBillingConfig, mintLicense, installLicense, waitForLicenseState } = require("./helpers/billing");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const TRIAL_KEY = "vt_billing_trial_started_v1";
// The signed-license control uses an offline test API origin; CSP itself has its own production-policy suite.
test.use({ bypassCSP: true });

async function initBrowser(context, lang = "es") {
  await context.addInitScript((language) => {
    localStorage.setItem("vt_tour_v1", "1");
    localStorage.setItem("vt_lang", language);
    if (!localStorage.getItem("vt_settings_v1")) localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: "singing" }));
    sessionStorage.setItem("vt_e2e", "1");
    sessionStorage.setItem("vt_sets_e2e", "1");
  }, lang);
}

async function bootPage(page, gated = false) {
  await patchBillingConfig(page, { skillSetsRequirePro: gated, verification: { apiBaseUrl: "" } });
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTSets && !!window.VTLoop && !!window.VTBilling && !!window.VTApp);
  await expect(page.locator("#btn-next-step")).toBeVisible();
}

async function returningPage(page, context, gated = false) {
  await bootPage(page, gated);
  await expect(page.locator("#btn-skill-first")).toBeHidden();
  const next = await context.newPage();
  await bootPage(next, gated);
  await expect(next.locator("#btn-skill-first")).toBeVisible();
  return next;
}

async function showSkills(page) {
  const entry = page.locator("#btn-skill-first");
  await expect(entry).toBeVisible();
  await entry.click();
  await expect(page.locator("#sets-sheet")).toBeVisible();
}

/** A visible painted button is insufficient if sticky content actually takes its pointer. */
async function hittable(locator) {
  await locator.scrollIntoViewIfNeeded();
  const hit = await locator.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { width: r.width, height: r.height, inside: r.x >= -1 && r.right <= innerWidth + 1 && r.y >= -1 && r.bottom <= innerHeight + 1, owns: el === target || el.contains(target) };
  });
  expect(hit.height, JSON.stringify(hit)).toBeGreaterThanOrEqual(44);
  expect(hit.inside, JSON.stringify(hit)).toBe(true);
  expect(hit.owns, JSON.stringify(hit)).toBe(true);
}

test("first website session keeps both skill entries hidden; reload is not a return visit", async ({ page, context }) => {
  await initBrowser(context);
  await bootPage(page);
  const cta = await page.locator("#btn-next-step").textContent();
  await expect(page.locator("#btn-skill-first")).toBeHidden();
  await expect(page.locator("#btn-skill-sets")).toBeHidden();
  await expect(page.locator("#sets-sheet")).toBeHidden();
  await expect(page.locator("#pricing-modal")).toBeHidden();
  expect(await page.evaluate(() => VTBilling.trialStartedAt())).toBeNull();
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTSets && !!window.VTLoop);
  await expect(page.locator("#btn-skill-first")).toBeHidden();
  await expect(page.locator("#btn-skill-sets")).toBeHidden();
  await expect(page.locator("#btn-next-step")).toHaveText(cta);
});

test("a second new tab with the same storage reveals one optional entry without changing the daily CTA or taking focus", async ({ page, context }) => {
  await initBrowser(context);
  await bootPage(page);
  const cta = await page.locator("#btn-next-step").textContent();
  const second = await context.newPage();
  await bootPage(second);
  await expect(second.locator("#btn-skill-first")).toBeVisible();
  await expect(second.locator("#btn-skill-first")).toHaveCount(1);
  await expect(second.locator("#btn-next-step")).toHaveText(cta);
  await expect(second.locator("#sets-sheet")).toBeHidden();
  await expect(second.locator("#pricing-modal")).toBeHidden();
  expect(await second.evaluate(() => document.activeElement?.id)).not.toBe("btn-skill-first");
  expect(await second.evaluate(() => ({ trial: VTBilling.trialStartedAt(), days: VTDays.summary().practiceDays }))).toEqual({ trial: null, days: 0 });
  await second.reload({ waitUntil: "domcontentloaded" });
  await expect(second.locator("#btn-skill-first")).toBeVisible();
  await expect(second.locator("#sets-sheet")).toBeHidden();
});

test("returning discovery also works for an existing learner with a recorded practice day", async ({ page, context }) => {
  await initBrowser(context);
  await bootPage(page);
  await page.evaluate(() => {
    const take = VTStorage.saveExerciseResult("s7-humming", { score: 7, notes: "previous-session", durationSec: 60 });
    VTDays.record({ exerciseId: "s7-humming", sec: 60, saved: true, bump: true, source: "save", day: take.day });
  });
  const second = await context.newPage();
  await bootPage(second);
  await expect(second.locator("body")).not.toHaveClass(/loop-first/);
  expect(await second.evaluate(() => VTDays.summary().practiceDays)).toBe(1);
  await expect(second.locator("#btn-skill-first")).toBeVisible();
  await showSkills(second);
  await expect(second.locator(".set-card")).toHaveCount(5);
});

for (const layout of [
  { name: "desktop", width: 1280, height: 900, lang: "es" },
  { name: "narrow", width: 320, height: 640, lang: "en" },
  { name: "mobile", width: 390, height: 844, lang: "es" },
  { name: "landscape", width: 844, height: 390, lang: "en" },
  { name: "200% CSS layout scale", width: 1280, height: 900, lang: "es", zoom: 2 }
]) {
  test(`returning discovery reopens, filters, closes by keyboard and starts the selected set at ${layout.name}`, async ({ page, context }) => {
    await initBrowser(context, layout.lang);
    const second = await returningPage(page, context);
    await second.setViewportSize({ width: layout.width, height: layout.height });
    if (layout.zoom) await second.evaluate((zoom) => { document.documentElement.style.zoom = String(zoom); }, layout.zoom);
    await hittable(second.locator("#btn-skill-first"));
    await showSkills(second);
    await hittable(second.locator("#sets-close"));
    await hittable(second.locator("#sets-focus"));
    await second.locator("#sets-focus").selectOption("pitch");
    await expect(second.locator(".set-card")).toHaveCount(1);
    await expect(second.locator('[data-set="s-skill-pitch"]')).toBeVisible();
    await second.keyboard.press("Escape");
    await expect(second.locator("#sets-sheet")).toBeHidden();
    await expect(second.locator("#btn-skill-first")).toBeFocused();
    await second.keyboard.press("Enter");
    await expect(second.locator("#sets-sheet")).toBeVisible();
    await second.locator("#sets-focus").selectOption("breath");
    const start = second.locator('[data-set-start="s-skill-breath"]');
    await hittable(start);
    expect(await second.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await start.click();
    await expect(second.locator("#sets-sheet")).toBeHidden();
    await expect(second.locator("#view-exercise")).toHaveClass(/active/);
    expect(await second.evaluate(() => ({ set: VTStorage.getSession()?.set, exercise: VTApp.getState().exercise?.id }))).toEqual({ set: "s-skill-breath", exercise: "s18-costal-breath" });
  });
}

test("reduced motion has no running discovery animation and never forces the sheet", async ({ page, context }) => {
  await initBrowser(context);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await bootPage(page);
  const second = await context.newPage();
  await second.emulateMedia({ reducedMotion: "reduce" });
  await bootPage(second);
  await expect(second.locator("#btn-skill-first")).toBeVisible();
  const running = await second.locator("#btn-skill-first").evaluate((el) => el.getAnimations({ subtree: true }).filter((a) => a.playState === "running" || a.pending).length);
  expect(running).toBe(0);
  await expect(second.locator("#sets-sheet")).toBeHidden();
  expect(await second.evaluate(() => document.activeElement?.id)).not.toBe("btn-skill-first");
});

test("future Pro policy gates new skill starts without starting a trial or removing individual exercises and earned history", async ({ page, context }) => {
  await initBrowser(context);
  const second = await returningPage(page, context, true);
  const before = await second.evaluate(() => {
    VTStorage.saveExerciseResult("s7-humming", { score: 7, notes: "earned-before-policy", durationSec: 60 });
    return JSON.stringify(VTStorage.getProgress());
  });
  await showSkills(second);
  await expect(second.locator("#skill-access-status")).toBeVisible();
  await expect(second.locator('[data-set-start="s-skill-breath"]')).toHaveCount(0);
  const upgrade = second.locator('[data-set="s-skill-breath"] [data-skill-upgrade]');
  await expect(upgrade).toBeVisible();
  // The actual card's upgrade control must lead to the existing pricing flow, without opting in.
  await upgrade.click();
  await expect(second.locator("#pricing-modal")).toBeVisible();
  const refused = await second.evaluate(() => ({ result: VTSets.start("s-skill-breath"), session: VTStorage.getSession(), trial: VTBilling.trialStartedAt() }));
  expect(refused.result).toBeNull();
  expect(refused.session).toBeNull();
  expect(refused.trial).toBeNull();
  expect(await second.evaluate(() => VTBilling.trialStartedAt())).toBeNull();
  await second.locator("#pricing-close").click();
  const individual = await second.evaluate(async () => {
    const ids = [...VT_EXERCISES.vocal, ...VT_EXERCISES.singing].map((ex) => ex.id);
    const failed = [];
    for (const id of ids) {
      await VTApp.openExercise(id);
      if (VTApp.getState().exercise?.id !== id || !document.querySelector("#pricing-modal").hidden) failed.push(id);
    }
    return { ids, failed, history: JSON.stringify(VTStorage.getProgress()) };
  });
  expect(individual.ids.length, "the individual catalog must be present").toBeGreaterThanOrEqual(52);
  expect(individual.failed).toEqual([]);
  expect(individual.history).toBe(before);
});

test("an explicit trial opt-in unlocks new skill starts and records a fixed expiry", async ({ page, context }) => {
  await initBrowser(context);
  const second = await returningPage(page, context, true);
  await showSkills(second);
  await second.locator('[data-set="s-skill-breath"] [data-skill-upgrade]').click();
  await expect(second.locator("#pricing-modal")).toBeVisible();
  expect(await second.evaluate(() => VTBilling.trialStartedAt())).toBeNull();
  await expect(second.locator("#btn-start-trial")).toBeVisible();
  await second.locator("#btn-start-trial").click();
  await expect.poll(() => second.evaluate(() => VTBilling.getEntitlement().status)).toBe("trial");
  await expect(second.locator("#pricing-modal")).toBeVisible();
  await second.locator("#pricing-close").click();
  const trial = await second.evaluate(() => ({ start: VTBilling.trialStartedAt(), end: VTBilling.trialEndsAt() }));
  expect(Date.parse(trial.end)).toBeGreaterThan(Date.parse(trial.start));
  await showSkills(second);
  await second.locator('[data-set-start="s-skill-breath"]').click();
  await expect(second.locator("#view-exercise")).toHaveClass(/active/);
  expect(await second.evaluate(() => VTStorage.getSession()?.set)).toBe("s-skill-breath");
  expect(await second.evaluate(() => ({ start: VTBilling.trialStartedAt(), end: VTBilling.trialEndsAt() }))).toEqual(trial);
});

test("a spent trial stays expired after sheet visits and reload instead of restarting its clock", async ({ page, context }) => {
  await initBrowser(context, "en");
  const old = new Date(Date.now() - 30 * 86400000).toISOString();
  await context.addInitScript(({ key, at }) => { if (!localStorage.getItem(key)) localStorage.setItem(key, at); }, { key: TRIAL_KEY, at: old });
  const second = await returningPage(page, context, true);
  await showSkills(second);
  await expect(second.locator("#skill-access-status")).toContainText(/expir|ended|finished|used/i);
  await expect(second.locator('[data-set="s-skill-breath"] [data-skill-upgrade]')).toBeVisible();
  expect(await second.evaluate(() => ({ start: VTBilling.trialStartedAt(), active: VTBilling.trialActive(), again: VTBilling.canStartTrial() }))).toEqual({ start: old, active: false, again: false });
  await second.locator("#sets-close").click();
  await second.reload({ waitUntil: "domcontentloaded" });
  await second.waitForFunction(() => !!window.VTBilling && !!window.VTSets);
  await showSkills(second);
  expect(await second.evaluate(() => VTBilling.trialStartedAt())).toBe(old);
  expect(await second.evaluate(() => VTSets.start("s-skill-breath"))).toBeNull();
});

test("verified signed Pro permits a skill start under the future policy", async ({ page, context }) => {
  await initBrowser(context);
  await bootPage(page, true);
  const second = await context.newPage();
  await patchBillingConfig(second, { skillSetsRequirePro: true });
  const license = await mintLicense({ origin: BASE, provider: "creem" });
  await installLicense(second, license);
  await second.route("https://entitlements.invalid/**", (route) => route.fulfill({ status: 503, json: { ok: false, reason: "offline" } }));
  await second.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await waitForLicenseState(second, "ok");
  expect(await second.evaluate(() => VTBilling.getEntitlement().pro)).toBe(true);
  await showSkills(second);
  await expect(second.locator("#skill-access-status")).toBeVisible();
  await expect(second.locator('[data-set="s-skill-breath"] [data-skill-upgrade]')).toHaveCount(0);
  await second.locator('[data-set-start="s-skill-breath"]').click();
  await expect(second.locator("#view-exercise")).toHaveClass(/active/);
  expect(await second.evaluate(() => VTStorage.getSession()?.set)).toBe("s-skill-breath");
  expect(await second.evaluate(() => VTBilling.trialStartedAt())).toBeNull();
});
