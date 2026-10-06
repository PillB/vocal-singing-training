/**
 * Every view has an address (js/app.js, "Addresses"): #plan, #historial and
 * #ejercicio/<id>, with Practicar at the bare page. The browser's Back and
 * Forward move between views without leaving the site, and a reload or a
 * shared link opens the view it names.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page, hash = "") {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
  });
  await page.goto(`${BASE}/index.html${hash}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
}

const active = (page) => page.evaluate(() => document.querySelector(".view.active")?.id);
const hash = (page) => page.evaluate(() => location.hash);

test("Plan and Historial get addresses; Back and Forward move between them inside the site", async ({ page }) => {
  await boot(page);
  expect(await active(page)).toBe("view-home");
  expect(await hash(page)).toBe("");
  await page.click("#btn-history");
  await expect(page.locator("#view-history")).toHaveClass(/active/);
  expect(await hash(page)).toBe("#historial");
  await page.click("#btn-plan");
  await expect(page.locator("#view-plan")).toHaveClass(/active/);
  expect(await hash(page)).toBe("#plan");
  await page.goBack();
  await expect(page.locator("#view-history")).toHaveClass(/active/);
  expect(await hash(page)).toBe("#historial");
  await page.goBack();
  await expect(page.locator("#view-home")).toHaveClass(/active/);
  expect(await hash(page)).toBe("");
  expect(page.url()).toContain("/index.html");
  await page.goForward();
  await expect(page.locator("#view-history")).toHaveClass(/active/);
});

test("a reload or a shared link opens the view the address names", async ({ page }) => {
  await boot(page, "#plan");
  await expect(page.locator("#view-plan")).toHaveClass(/active/);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
  await expect(page.locator("#view-plan")).toHaveClass(/active/);
  await page.goto(`${BASE}/index.html#ejercicio/s4-lip-trills`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  // An address this file does not own is left alone.
  await page.goto(`${BASE}/index.html#nada`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
  await expect(page.locator("#view-home")).toHaveClass(/active/);
});

test("an exercise has its own address, and Back from it returns to where it was opened", async ({ page }) => {
  await boot(page);
  await page.click("#btn-history");
  await expect(page.locator("#view-history")).toHaveClass(/active/);
  await page.evaluate(() => VTApp.openExercise("s4-lip-trills"));
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  expect(await hash(page)).toBe("#ejercicio/s4-lip-trills");
  await page.goBack();
  await expect(page.locator("#view-history")).toHaveClass(/active/);
  expect(await hash(page)).toBe("#historial");
});

/* —— Back with a dialog open ——
   A dialog sits over the page Back changes, so Back answers it the way its own
   "not now" does and the page under it is the one the address names. */

const PHONE_UA =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Mobile Safari/537.36";

/** A page with a fake microphone that counts what was asked of it, on a faked clock. */
async function bootPractice(page, { e2e = true } = {}) {
  await page.clock.install({ time: new Date("2026-09-23T10:00:00-05:00") });
  await page.addInitScript((e2e) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_ui_tour_off_v1", "1");
      localStorage.setItem("vt_lang", "es");
      localStorage.setItem("vt_settings_v1", JSON.stringify({ lastTab: "singing" }));
      if (e2e) sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
    window.__gum = 0;
    const AC = window.AudioContext || window.webkitAudioContext;
    async function fakeGUM() {
      window.__gum += 1;
      let ctx = window.VTSharedAudioCtx;
      if (!ctx || ctx.state === "closed") {
        ctx = new AC();
        window.VTSharedAudioCtx = ctx;
      }
      const dest = ctx.createMediaStreamDestination();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.00001;
      osc.connect(g);
      g.connect(dest);
      osc.start();
      return dest.stream;
    }
    if (!navigator.mediaDevices) Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
    navigator.mediaDevices.getUserMedia = fakeGUM;
    if (typeof MediaDevices !== "undefined") MediaDevices.prototype.getUserMedia = fakeGUM;
  }, e2e);
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise && !!window.VTLoop);
  await page.clock.runFor(500);
}

const live = (page) => page.evaluate(() => !!window.VTApp.getState().practiceLive);

/** Open the exercise from Practicar, start it and sing past what counts as practice. */
async function practise(page, id = "s4-lip-trills") {
  await page.evaluate((x) => VTApp.openExercise(x), id);
  await page.clock.runFor(300);
  await page.locator("#btn-practice-start").click();
  await expect.poll(() => live(page), { timeout: 10000 }).toBe(true);
  await page.clock.fastForward(50000);
  await page.clock.runFor(500);
}

test.describe("Back with a dialog open", () => {
  test.describe("the first-run microphone primer", () => {
    // A person's browser: the primer is muted under automation.
    test.use({ userAgent: PHONE_UA });

    test("Back closes it without answering it, and its button then starts nothing", async ({ page }) => {
      await bootPractice(page, { e2e: false });
      await page.evaluate(() => VTApp.openExercise("s4-lip-trills"));
      await page.clock.runFor(300);
      await page.locator("#btn-practice-start").click();
      await expect(page.locator("#mic-primer")).toBeVisible();
      await page.goBack();
      await page.clock.runFor(300);
      await expect(page.locator("#view-home")).toHaveClass(/active/);
      await expect(page.locator("#mic-primer")).toBeHidden();
      expect(await page.evaluate(() => document.body.classList.contains("modal-open"))).toBe(false);
      // Back is not a "no": nothing is stored and no "we won't ask again" toast.
      expect(await page.evaluate(() => localStorage.getItem("vt_mic_primed_v1"))).toBeNull();
      await expect(page.locator("#toast")).not.toHaveClass(/show/);
      // A press that still reaches the primer's button starts nothing off-screen.
      await page.evaluate(() => document.querySelector("#mic-primer [data-primer-ok]").click());
      await page.clock.runFor(1000);
      expect(await page.evaluate(() => ({ live: VTApp.getState().practiceLive, gum: window.__gum }))).toEqual({ live: false, gum: 0 });
    });
  });

  test("Back with the leave question open answers it 'Seguir practicando': the exercise and its take stay", async ({ page }) => {
    await bootPractice(page);
    await practise(page);
    await page.locator("#btn-history").click();
    await expect(page.locator("#leave-modal")).toBeVisible();
    await page.goBack();
    await page.clock.runFor(300);
    await expect(page.locator("#leave-modal")).toBeHidden();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    expect(await hash(page)).toBe("#ejercicio/s4-lip-trills");
    expect(await live(page)).toBe(true);
    // Nothing was recorded on the way: the take is still to be rated.
    expect(await page.evaluate(() => (window.VTStorage.getProgress()?.["s4-lip-trills"]?.history || []).length)).toBe(0);
    // The way out still asks.
    await page.goBack();
    await page.clock.runFor(300);
    await expect(page.locator("#leave-modal")).toBeVisible();
    await page.locator("#leave-cancel").click();
    await page.clock.runFor(300);
    expect(await hash(page)).toBe("#ejercicio/s4-lip-trills");
    expect(await live(page)).toBe(true);
  });

  test("a second Back while Back's own leave question is open keeps the exercise, and puts its address back once", async ({ page }) => {
    await bootPractice(page);
    await page.click("#btn-plan");
    await page.click("#btn-nav-home");
    await practise(page);
    expect(await hash(page)).toBe("#ejercicio/s4-lip-trills");
    await page.goBack();
    await page.clock.runFor(300);
    await expect(page.locator("#leave-modal")).toBeVisible();
    await page.goBack();
    await page.clock.runFor(300);
    await expect(page.locator("#leave-modal")).toBeHidden();
    await expect(page.locator("#view-exercise")).toHaveClass(/active/);
    expect(await hash(page)).toBe("#ejercicio/s4-lip-trills");
    expect(await live(page)).toBe(true);
    // One entry for the exercise, not two: the next Back asks again.
    await page.goBack();
    await page.clock.runFor(300);
    await expect(page.locator("#leave-modal")).toBeVisible();
    await page.locator("#leave-discard").click();
    await page.clock.runFor(300);
    await expect(page.locator("#view-plan")).toHaveClass(/active/);
    expect(await live(page)).toBe(false);
  });

  test("Back closes the reminder dialog and the loop's dialogs as 'Ahora no', with nothing switched on", async ({ page }) => {
    await bootPractice(page);
    await page.click("#btn-history");
    await page.click("#btn-nav-home");
    const open = (sel) => page.locator(sel).evaluate((m) => !m.hidden);
    const trapped = () => page.evaluate(() => !!document.activeElement?.closest?.(".modal-overlay:not([hidden])"));

    await page.evaluate(() => VTApp.openReminders());
    expect(await open("#reminder-modal")).toBe(true);
    await page.goBack();
    await page.clock.runFor(300);
    await expect(page.locator("#view-history")).toHaveClass(/active/);
    expect(await open("#reminder-modal")).toBe(false);
    expect(await trapped()).toBe(false);
    expect(await page.evaluate(() => !!window.VTReminders.getConfig().enabled)).toBe(false);

    await page.goForward();
    await page.clock.runFor(300);
    await expect(page.locator("#view-home")).toHaveClass(/active/);
    await page.evaluate(() => VTLoop.openCards());
    expect(await open("#loop-cards")).toBe(true);
    await page.goBack();
    await page.clock.runFor(300);
    await expect(page.locator("#view-history")).toHaveClass(/active/);
    expect(await open("#loop-cards")).toBe(false);
    expect(await trapped()).toBe(false);

    await page.goForward();
    await page.clock.runFor(300);
    await page.evaluate(() =>
      VTLoop.showDone({ sum: VTDays.summary(), tier: "min", track: "singing", surprise: null, ms: 0, comeback: false, first: false })
    );
    expect(await open("#loop-done")).toBe(true);
    await page.goBack();
    await page.clock.runFor(300);
    await expect(page.locator("#view-history")).toHaveClass(/active/);
    expect(await open("#loop-done")).toBe(false);
    expect(await trapped()).toBe(false);
  });
});
