/**
 * The side pages (privacy, guide, admin) keep one h1 each and say which
 * language each half is in.
 *
 * Wrong behaviours rejected:
 * - privacy.html carried three level-1 headings: the site name in the header,
 *   the Spanish title and the English title. A screen-reader user who jumps by
 *   heading level lands on the site name first and cannot tell which of the
 *   other two is the page.
 * - Its English half sat under <html lang="es"> with no lang of its own, so a
 *   screen reader read it with Spanish rules and voice (WCAG 3.1.2, Language
 *   of Parts). guide.html had already fixed both; this holds every page to it.
 * - The fix for the first can empty the phone header: the narrow-screen rule
 *   hides `.app-header .brand p`, which is where the site name moves (guide.html
 *   hit exactly that). So the name must stay visible at 360 px.
 * Controls: the Spanish title resolves to "es", so the language check can tell
 * the halves apart, and the guide (already right) passes the same checks.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

const PAGES = [
  { file: "privacy.html", title: "Tu privacidad, en claro", en: "Privacy (English)", enText: "Vocal Studio is a browser practice tool" },
  { file: "guide.html", title: "Guía de uso", en: null, enText: null }
];

/** The language a screen reader would use for the element holding `text`. */
const langOf = (page, text) =>
  page.evaluate((t) => {
    const all = [...document.querySelectorAll("main h1, main h2, main p")];
    const el = all.find((e) => e.textContent.replace(/\s+/g, " ").includes(t));
    return el ? (el.closest("[lang]")?.getAttribute("lang") ?? null) : "missing";
  }, text);

test.describe("Side pages keep one h1 and mark their English half (one h1)", () => {
  for (const p of PAGES) {
    for (const width of [360, 1280]) {
      test(`${p.file} at ${width}px: one level-1 heading, the site name still shown`, async ({ page }) => {
        await page.setViewportSize({ width, height: 800 });
        await page.goto(`${BASE}/${p.file}`, { waitUntil: "domcontentloaded" });
        const h1 = page.getByRole("heading", { level: 1 });
        await expect(h1).toHaveCount(1);
        await expect(h1).toHaveAccessibleName(p.title);
        // The site name moved out of the h1 must not vanish with the phone rule
        await expect(page.locator(".app-header .brand")).toContainText("Estudio Vocal");
        const shown = await page
          .locator(".app-header .brand")
          .getByText("Estudio Vocal", { exact: true })
          .evaluate((e) => e.getBoundingClientRect().height > 4 && getComputedStyle(e).display !== "none");
        expect(shown, "the site name is visible in the header").toBe(true);
      });
    }
  }

  test("privacy.html: the English half is marked English, the Spanish half Spanish", async ({ page }) => {
    const p = PAGES[0];
    await page.goto(`${BASE}/${p.file}`, { waitUntil: "domcontentloaded" });
    expect(await langOf(page, p.title), "control: the Spanish title").toBe("es");
    expect(await langOf(page, p.en), "the English title").toBe("en");
    expect(await langOf(page, p.enText), "the English text").toBe("en");
    // The English title is a heading screen readers can jump to, one level under the page
    await expect(page.getByRole("heading", { level: 2, name: p.en })).toHaveCount(1);
  });

  for (const width of [390, 1280]) {
    test(`privacy.html#en at ${width}px: the "English" link lands below the sticky header`, async ({ page }) => {
      await page.setViewportSize({ width, height: 800 });
      await page.goto(`${BASE}/privacy.html`, { waitUntil: "domcontentloaded" });
      await page.getByRole("link", { name: "English" }).click();
      await expect.poll(() => page.evaluate(() => Math.round(scrollY)), { timeout: 5000 }).toBeGreaterThan(100);
      // Smooth scrolling: wait until it rests
      await expect
        .poll(() => page.evaluate(() => new Promise((r) => { const y = scrollY; setTimeout(() => r(scrollY === y), 150); })))
        .toBe(true);
      const g = await page.evaluate(() => ({
        title: document.getElementById("en").getBoundingClientRect().top,
        header: document.querySelector(".app-header").getBoundingClientRect().bottom
      }));
      expect(g.title, JSON.stringify(g)).toBeGreaterThanOrEqual(g.header);
    });
  }
});
