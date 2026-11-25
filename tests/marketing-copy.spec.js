/**
 * The marketing copy on a real page (docs/48-CUSTOMER-RESEARCH-AND-MESSAGING.md): the first visit's new words fit
 * a 360px phone in Spanish and English, and the title a tab, a bookmark or a share sheet reads is the one the
 * research chose, in the language on screen. The words themselves, and the claims behind them, are held in
 * tests/node/marketing-copy.test.mjs.
 *
 * Fixed clock in Lima, a browser that has never been here (no settings, no days), tour already seen.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const NOW = "2026-09-23T10:00:00-05:00";

test.use({ timezoneId: "America/Lima", locale: "es-PE" });

async function firstVisit(page, lang, width) {
  await page.setViewportSize({ width, height: 740 });
  await page.clock.install({ time: new Date(NOW) });
  await page.addInitScript((l) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", l);
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
  }, lang);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && !!window.VTLoop && document.body.classList.contains("loop-first"));
  await page.clock.runFor(500);
}

/** How the hero's short lines are laid out: lines drawn, and any text cut or pushed past its box. */
const layout = (page) =>
  page.evaluate(() => {
    const lines = (el) => {
      const lh = parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.2;
      return Math.round(el.getBoundingClientRect().height / lh);
    };
    const kicker = document.getElementById("start-kicker");
    const descs = [...document.querySelectorAll("#track-pick .track-pick-desc")];
    const select = document.getElementById("site-version");
    const bar = document.getElementById("site-version-bar");
    const label = bar.querySelector(".site-version-label");
    return {
      kicker: kicker.textContent.trim(),
      kickerLines: lines(kicker),
      descLines: descs.map(lines),
      descOverflow: descs.filter((d) => d.scrollWidth > d.clientWidth + 1).map((d) => d.textContent),
      pageOverflow: document.documentElement.scrollWidth - window.innerWidth,
      option: select.options[select.selectedIndex].textContent,
      selectCut: select.scrollWidth > select.clientWidth + 1,
      barRows: Math.round(bar.getBoundingClientRect().height / Math.max(label.getBoundingClientRect().height, select.getBoundingClientRect().height))
    };
  });

for (const [lang, kicker, option] of [
  ["es", "Para cantar y para hablar · gratis", "Clásica"],
  ["en", "For singing and speaking · free", "Classic"]
]) {
  for (const width of [360, 390]) {
    test(`a first visit's new words fit a ${width}px phone (${lang}): one-line kicker, choices in their buttons, the layout control in one row`, async ({ page }) => {
      await firstVisit(page, lang, width);
      const l = await layout(page);
      expect(l.kicker.toLowerCase()).toBe(kicker.toLowerCase());
      expect(l.kickerLines, "the line over the title stays one line").toBe(1);
      expect(l.descOverflow, "no choice's description is cut").toEqual([]);
      expect(Math.max(...l.descLines), "a choice's description takes at most three lines").toBeLessThanOrEqual(3);
      expect(l.pageOverflow, "nothing pushes the page sideways").toBeLessThanOrEqual(0);
      expect(l.option).toBe(option);
      expect(l.selectCut, "the layout control's choice is not cut").toBe(false);
      expect(l.barRows, "label and control share one row").toBe(1);
    });
  }
}

test("the tab title and the description follow the language on screen", async ({ page }) => {
  await firstVisit(page, "es", 390);
  await expect(page).toHaveTitle("Canto y oratoria: ejercicios gratis para tu voz");
  const desc = () => page.locator('meta[name="description"]').getAttribute("content");
  expect(await desc()).toMatch(/^Ejercicios de canto y para hablar en público, gratis/);
  await page.evaluate(() => window.VTI18n.setLang("en"));
  await expect(page).toHaveTitle("Singing and speaking practice, free in your browser");
  expect(await desc()).toMatch(/^Free singing and public-speaking exercises/);
  // The share tags are for crawlers, which read the markup's Spanish and never run the script.
  expect(await page.locator('meta[property="og:title"]').getAttribute("content")).toBe("Canto y oratoria: ejercicios gratis para tu voz");
});
