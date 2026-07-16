/**
 * Default 1-nota mode, stage-below fits cue text, interactive UI tours.
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

  test("mode-cue under highway is fully visible without clip/scroll", async ({ page }) => {
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
      window.VTApp?.fitStageBelowContent?.();
    });
    await page.waitForTimeout(80);
    const metrics = await page.evaluate(() => {
      const cue = document.getElementById("mode-cue");
      const below = document.querySelector(".stage-below");
      if (!cue || !below) return { ok: false };
      const cs = getComputedStyle(cue);
      return {
        ok: true,
        scrollH: cue.scrollHeight,
        clientH: cue.clientHeight,
        overflowY: cs.overflowY,
        maxHeight: cs.maxHeight,
        belowMin: below.style.minHeight || getComputedStyle(below).minHeight,
        belowScroll: below.scrollHeight,
        belowClient: below.clientHeight,
        clipped: cue.scrollHeight > cue.clientHeight + 2
      };
    });
    expect(metrics.ok).toBe(true);
    expect(metrics.overflowY === "visible" || metrics.overflowY === "auto").toBeTruthy();
    // Must not clip text
    expect(metrics.clipped).toBe(false);
    expect(metrics.scrollH).toBeGreaterThan(20);
    // Container tall enough for its content
    expect(metrics.belowClient + 4).toBeGreaterThanOrEqual(Math.min(metrics.belowScroll, metrics.scrollH));
  });

  test("stage-below min-height tracks window resize wrap", async ({ page }) => {
    await boot(page);
    await openSolfege(page);
    await page.evaluate(() => {
      const cue = document.getElementById("mode-cue");
      cue.hidden = false;
      cue.textContent =
        "Long cue text that should wrap on narrow viewports so height grows with line count and never needs an inner scrollbar for the prompt itself.";
      window.VTApp?.fitStageBelowContent?.();
    });
    const wide = await page.evaluate(() => document.getElementById("mode-cue").scrollHeight);
    await page.setViewportSize({ width: 360, height: 720 });
    await page.waitForTimeout(120);
    await page.evaluate(() => window.VTApp?.fitStageBelowContent?.());
    const narrow = await page.evaluate(() => document.getElementById("mode-cue").scrollHeight);
    expect(narrow).toBeGreaterThanOrEqual(wide - 2);
    const noClip = await page.evaluate(() => {
      const c = document.getElementById("mode-cue");
      return c.scrollHeight <= c.clientHeight + 3;
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
