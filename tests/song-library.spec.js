const { test, expect } = require("@playwright/test");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
for (const lang of ["es", "en"]) {
  for (const viewport of [{ width: 360, height: 740 }, { width: 1280, height: 800 }]) {
    test(`song library ${lang} at ${viewport.width}px exposes scores, task and limits`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await page.addInitScript((lang) => {
        localStorage.setItem("vt_lang", lang);
        localStorage.setItem("vt_tour_v1", "1");
        sessionStorage.setItem("vt_e2e", "1");
      }, lang);
      await page.goto(`${BASE}/#ejercicio/s3-song-stanzas`, { waitUntil: "domcontentloaded" });
      await expect(page.locator("#btn-toggle-piano")).toBeVisible();
      await page.locator("#btn-toggle-piano").click();
      const library = page.locator(".song-library");
      await expect(library).toBeVisible();
      await expect(library.locator("[data-song-study]")).toHaveCount(3);
      await expect(library).toContainText(lang === "es" ? "no estas melodías" : "not these melodies");
      const source = library.locator('[data-song-study="aura-lea"] a');
      await expect(source).toHaveAttribute("href", "https://levysheetmusic.mse.jhu.edu/collection/024/002");
      await expect(source).toHaveAccessibleName(new RegExp(lang === "es" ? "Abrir partitura histórica" : "Open historical score"));
      await source.focus();
      await expect(source).toBeFocused();
      const fit = await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
      expect(fit, "score cards must not widen the page").toBe(true);
      expect((await source.boundingBox()).height).toBeGreaterThanOrEqual(44);
      // A score card must not create a microphone stream or count as practice.
      expect(await page.evaluate(() => !!window.VTApp.getState().practiceLive)).toBe(false);
    });
  }
}
