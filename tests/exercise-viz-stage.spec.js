/**
 * Where the exercise pictures meet the stage and the rating card (js/app.js):
 *
 *  - After Stop, a pictured exercise's review stays whole on screen: it is what
 *    "¿Cómo te fue?" is answered from. The card follows below it (on a phone,
 *    within one screen of scrolling). Exercises without a picture keep the
 *    card's own reveal (tests/finish-rating.spec.js).
 *  - s19 opens on two silent steps: Start plays no piano over them (the mode
 *    plays its own reference at the first sung step).
 *  - Modes that draw their own picture where the chord menus sat, or walk
 *    their own notes, hide the chord menus.
 *  - A free siren has no target: the readout names the nearest note.
 *  - The stage's HUD boxes are not live regions (their numbers change many
 *    times a second); a pitch panel's step is announced instead.
 */
const { test, expect } = require("@playwright/test");
const { useVoice, playVoice, stopVoice } = require("./helpers/voice");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page, { rate = false } = {}) {
  await page.context().grantPermissions(["microphone"]).catch(() => {});
  await page.addInitScript((rate) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      sessionStorage.setItem("vt_e2e", "1");
      // The rating card's own reveal and closed "Más detalles", as a learner sees them
      if (rate) sessionStorage.setItem("vt_rate_e2e", "1");
    } catch {
      /* ignore */
    }
  }, rate);
  await useVoice(page);
  await page.goto(BASE + "/?e2e", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
}

async function open(page, id) {
  await page.evaluate((id) => window.VTApp.openExercise(id), id);
  await expect(page.locator("#view-exercise")).toHaveClass(/active/);
  await page.waitForTimeout(500);
}

async function start(page) {
  await expect(page.locator("#btn-practice-start")).toBeVisible();
  await page.evaluate(() => document.getElementById("btn-practice-start").click());
  await page.waitForTimeout(250);
}

/** Take v10 (pauses) for a few seconds and Stop; the review is drawn. */
async function takeAndStop(page) {
  await boot(page, { rate: true });
  await open(page, "v10-power-pause");
  await start(page);
  await playVoice(page, "speech");
  await page.waitForTimeout(6000);
  await stopVoice(page);
  // a real tap: Detener takes focus, then hands it to the card's question
  await page.locator("#btn-practice-stop").click();
  await expect(page.locator("#mode-focus .mode-panel.has-viz")).toHaveClass(/is-replay/);
  await expect(page.locator("#metrics-card")).not.toHaveClass(/collapsed/);
  // the reveal runs on the next frame, then a smooth scroll settles
  await page.waitForTimeout(1200);
  return page.evaluate(() => {
    const box = (s) => {
      const r = document.querySelector(s).getBoundingClientRect();
      return { top: r.top, bottom: r.bottom };
    };
    const buttons = [...document.querySelectorAll("#metrics-card .rate-btn")].map((b) => b.getBoundingClientRect());
    const root = getComputedStyle(document.documentElement);
    return {
      vh: innerHeight,
      // the sticky page header and exercise bar
      chrome: (parseFloat(root.getPropertyValue("--header-h")) || 0) + (parseFloat(root.getPropertyValue("--ex-chrome-h")) || 0),
      review: box("#mode-focus .mode-panel.has-viz.is-replay"),
      q: box("#rate-q"),
      buttonsBottom: Math.max(...buttons.map((r) => r.bottom)),
      focus: document.activeElement && document.activeElement.id
    };
  });
}

test.describe("after Stop: the picture's review, then the rating", () => {
  test("phone: the review stays whole; the card is at most one screen below", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const r = await takeAndStop(page);
    expect(r.review.top, "the review is not under the sticky header").toBeGreaterThanOrEqual(r.chrome - 1);
    expect(r.review.bottom, "the review ends on screen").toBeLessThanOrEqual(r.vh + 1);
    expect(r.q.top - r.vh, "¿Cómo te fue? within one screen below").toBeLessThanOrEqual(r.vh);
    expect(r.focus).toBe("rate-q");
  });

  // At 1280x800 the stage is ~600 px tall, so the answers can't share the
  // screen with a whole review: the review stays, the question starts in view
  // and the three answers are a short scroll below.
  test("desktop: the review stays whole; the question starts in view", async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 800 });
    const r = await takeAndStop(page);
    expect(r.review.top, "the review is not under the sticky header").toBeGreaterThanOrEqual(r.chrome - 1);
    expect(r.review.bottom).toBeLessThanOrEqual(r.vh + 1);
    expect(r.q.top, "¿Cómo te fue? starts on screen").toBeLessThanOrEqual(r.vh);
    expect(r.buttonsBottom - r.vh, "the answers a short scroll away").toBeLessThanOrEqual(r.vh * 0.25);
  });
});

test("s19: the silent first steps play no piano", async ({ page }) => {
  await boot(page);
  await open(page, "s19-soft-palate-surprise");
  await page.evaluate(() => {
    window.__notes = 0;
    const P = window.VTPiano;
    for (const k of ["playNote", "playRefPitch", "playChord", "startLoop"]) {
      if (typeof P[k] !== "function") continue;
      const orig = P[k].bind(P);
      P[k] = (...a) => {
        window.__notes++;
        return orig(...a);
      };
    }
  });
  await start(page);
  await page.waitForTimeout(3000);
  const r = await page.evaluate(() => ({
    notes: window.__notes,
    sounding: !!window.VTPiano.isSounding?.(0),
    phase: document.querySelector("#mode-focus [data-phase]")?.textContent || ""
  }));
  expect(r.phase).toMatch(/Sorpresa|sorpresa/);
  expect(r.notes, "no note on a silent step").toBe(0);
  expect(r.sounding).toBe(false);
});

test("chord menus: hidden where a picture or the mode's own notes take their place", async ({ page }) => {
  await boot(page);
  const shown = {};
  for (const id of ["s14-staccato-legato", "s26-placement-compare", "s7-humming", "s10-five-note", "s16-major-scale-coord", "s2-solfege-chords"]) {
    await open(page, id);
    await start(page);
    await page.waitForTimeout(400);
    shown[id] = await page.evaluate(() => {
      const b = document.getElementById("hud-prog-bar");
      return !!(b && !b.hidden && b.offsetParent && b.getBoundingClientRect().height > 0);
    });
    await page.evaluate(() => document.getElementById("btn-practice-stop")?.click());
    await page.waitForTimeout(300);
  }
  expect(shown).toEqual({
    "s14-staccato-legato": false,
    "s26-placement-compare": false,
    "s7-humming": false,
    "s10-five-note": false,
    "s16-major-scale-coord": false,
    // chords are the exercise here: the menus stay
    "s2-solfege-chords": true
  });
});

test("a siren's readout names the nearest note; the HUD boxes are not live regions", async ({ page }) => {
  await boot(page);
  await open(page, "s5-sirens");
  await start(page);
  await playVoice(page, "sirenBreak");
  await expect(page.locator("#pitch-stats")).toContainText("Nota", { timeout: 6000 });
  await expect(page.locator("#pitch-stats")).not.toContainText("Objetivo");
  await expect(page.locator("#pitch-stats")).not.toContainText(/agudo|grave/);
  const live = await page.evaluate(() => ({
    game: document.getElementById("pitch-game-hud").getAttribute("aria-live"),
    hud: document.getElementById("mode-hud").getAttribute("aria-live")
  }));
  expect(live).toEqual({ game: null, hud: null });
  await stopVoice(page);
  await page.evaluate(() => document.getElementById("btn-practice-stop")?.click());

  await open(page, "s1-vocal-fry");
  await start(page);
  await expect(page.locator("#mode-hud [data-phase]")).toHaveAttribute("aria-live", "polite");
});
