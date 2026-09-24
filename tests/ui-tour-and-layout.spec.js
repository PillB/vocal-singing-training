/**
 * Default 1-nota mode, the coach strip fits its cue text, interactive UI tours.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.VT_BASE || "http://127.0.0.1:8765";

async function boot(page, { markHomeTour = true, clearUiTours = true } = {}) {
  await page.addInitScript(
    ({ markHomeTour, clearUiTours }) => {
      sessionStorage.setItem("vt_e2e", "1");
      if (markHomeTour) localStorage.setItem("vt_tour_v1", "1");
      if (clearUiTours) localStorage.removeItem("vt_ui_tour_seen_v1");
    },
    { markHomeTour, clearUiTours }
  );
  await page.goto(BASE + "/?e2e=1&t=" + Date.now(), { waitUntil: "networkidle" });
}

async function openSolfege(page) {
  await page.click('.tab[data-tab="singing"]');
  await page.waitForTimeout(150);
  await page.locator("#exercise-list").getByText(/progres|solfeo|Solfège|Solfege/i).first().click();
  await page.waitForTimeout(400);
  await expect(page.locator("#view-exercise")).toBeVisible();
}

async function openSpeechExercise(page) {
  await page.click('.tab[data-tab="vocal"]');
  await page.waitForTimeout(150);
  await page.locator("#exercise-list .card-ex").first().click();
  await page.waitForTimeout(400);
  await expect(page.locator("#view-exercise")).toBeVisible();
}

test.describe("Default 1-nota + stage-below layout", () => {
  test("one-note is default mode on pitch exercise open", async ({ page }) => {
    await boot(page);
    await openSolfege(page);
    await expect(page.locator("#chk-one-note")).toBeChecked();
    await expect(page.locator("#sel-play-mode")).toHaveValue("oneNote");
    await expect(page.locator("#chk-arpeggio")).not.toBeChecked();
  });

  // Design coach-strip: the cue left the box under the stage for a strip on
  // the stage (#stage-coach, under the top controls). It must still show in
  // full, never clipped, with the lanes starting below it.
  test("mode-cue in the stage's coach strip is fully visible without clip/scroll", async ({ page }) => {
    await boot(page);
    await openSolfege(page);
    // Ensure cue has multi-line potential content
    await page.evaluate(() => {
      const cue = document.getElementById("mode-cue");
      if (cue) {
        cue.hidden = false;
        cue.textContent =
          "Canta cada nota con aire libre y sin tensión en cuello. Escucha el piano, " +
          "apunta al carril verde de la autopista y mantén el tono estable durante el sostenido. " +
          "Si no alcanzas, usa el control de octava − / + o Rango auto.";
      }
      window.VTApp?.fitHighwayToViewport?.();
    });
    await page.waitForTimeout(150);
    const metrics = await page.evaluate(() => {
      const cue = document.getElementById("mode-cue");
      const strip = document.getElementById("stage-coach");
      const stage = document.getElementById("highway-stage");
      const lanes = document.getElementById("pitch-block");
      if (!cue || !strip || !stage || !lanes) return { ok: false };
      const sr = strip.getBoundingClientRect();
      const rects = [...cue.getClientRects()];
      return {
        ok: true,
        inStrip: strip.contains(cue) && !strip.hidden,
        lines: rects.length,
        textInside: rects.every((r) => r.top >= sr.top - 1 && r.bottom <= sr.bottom + 1),
        clipped: strip.scrollHeight > strip.clientHeight + 2,
        stripInStage: sr.bottom <= stage.getBoundingClientRect().bottom,
        lanesBelow: lanes.getBoundingClientRect().top >= sr.bottom - 1
      };
    });
    expect(metrics.ok).toBe(true);
    expect(metrics.inStrip).toBe(true);
    expect(metrics.lines).toBeGreaterThan(0);
    // Must not clip text
    expect(metrics.clipped).toBe(false);
    expect(metrics.textInside).toBe(true);
    expect(metrics.stripInStage).toBe(true);
    expect(metrics.lanesBelow).toBe(true);
  });

  test("coach strip grows with the cue on a narrow window and never clips", async ({ page }) => {
    await boot(page);
    await openSolfege(page);
    await page.evaluate(() => {
      const cue = document.getElementById("mode-cue");
      cue.hidden = false;
      cue.textContent =
        "Long cue text that should wrap on narrow viewports so height grows with line count and never needs an inner scrollbar for the prompt itself.";
      window.VTApp?.fitHighwayToViewport?.();
    });
    const wide = await page.evaluate(() => document.getElementById("stage-coach").scrollHeight);
    await page.setViewportSize({ width: 360, height: 720 });
    await page.waitForTimeout(250);
    const narrow = await page.evaluate(() => document.getElementById("stage-coach").scrollHeight);
    expect(narrow).toBeGreaterThanOrEqual(wide - 2);
    const noClip = await page.evaluate(() => {
      const c = document.getElementById("stage-coach");
      const lanes = document.getElementById("pitch-block").getBoundingClientRect();
      return c.scrollHeight <= c.clientHeight + 3 && lanes.top >= c.getBoundingClientRect().bottom - 1;
    });
    expect(noClip).toBe(true);
  });
});

test.describe("Interactive exercise UI tours", () => {
  test("highway pack can start and advances with Next", async ({ page }) => {
    await boot(page);
    await openSolfege(page);
    const started = await page.evaluate(() => {
      // e2e blocks auto; force pack
      return window.VTTour.startUiPack("highway", { force: true });
    });
    // startUiPack may return false if shouldBlockAuto — force path in e2e:
    // When blocked, call begin via evaluate by temporarily clearing block
    if (!started) {
      await page.evaluate(() => {
        sessionStorage.removeItem("vt_e2e");
        window.VTTour.startUiPack("highway", { force: true });
      });
    }
    await expect(page.locator("#tour-root")).toBeVisible({ timeout: 3000 });
    await expect(page.locator("[data-tour-title]")).not.toBeEmpty();
    // Advance a couple steps
    await page.locator("[data-tour-next]").click();
    await page.waitForTimeout(200);
    await expect(page.locator("#tour-root")).toBeVisible();
    await page.locator("[data-tour-skip]").click();
    await page.waitForTimeout(150);
    await expect(page.locator("#tour-root")).toBeHidden();
    // Stay on exercise (not kicked home)
    await expect(page.locator("#view-exercise")).toBeVisible();
  });

  test("? help button present and forces UI tour", async ({ page }) => {
    await boot(page);
    await openSolfege(page);
    await expect(page.locator("#btn-ui-help")).toBeVisible();
    await page.evaluate(() => {
      sessionStorage.removeItem("vt_e2e");
    });
    await page.click("#btn-ui-help");
    await expect(page.locator("#tour-root")).toBeVisible({ timeout: 3000 });
    await page.locator("[data-tour-skip]").click();
  });

  test("speech family tour targets mode-focus", async ({ page }) => {
    await boot(page);
    await openSpeechExercise(page);
    await page.evaluate(() => {
      sessionStorage.removeItem("vt_e2e");
      window.VTTour.clearUiSeen("speech");
      window.VTTour.startUiPack("speech", { force: true });
    });
    await expect(page.locator("#tour-root")).toBeVisible({ timeout: 3000 });
    const title = await page.locator("[data-tour-title]").textContent();
    expect(title?.length).toBeGreaterThan(3);
    await page.locator("[data-tour-skip]").click();
  });

  test("detectUiFamily maps pitch → highway", async ({ page }) => {
    await boot(page);
    await openSolfege(page);
    const fam = await page.evaluate(() => {
      const ex = window.VTApp.getState().exercise;
      const p = window.VTApp.getProfile(ex);
      return window.VTTour.detectUiFamily(p);
    });
    expect(fam).toBe("highway");
  });
});
