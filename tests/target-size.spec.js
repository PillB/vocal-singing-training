/**
 * Every control a learner can see in an exercise is a 24 × 24 px target, or
 * sits in a label that is (WCAG 2.2, 2.5.8 Target Size Minimum), in every
 * exercise, at a desktop and a phone size. The measuring is the forensic
 * audit's own probe (qa/audit/page-probes.js; its rules are tested in
 * tests/audit-probes.spec.js).
 *
 * Wrong behaviour rejected (audit, 2026-11-02): pitch match's "Reto"
 * switch on desktop was a 13 px box with 11 px text, a 13 × 17 target.
 */
const { test, expect } = require("@playwright/test");
const fs = require("node:fs");
const path = require("node:path");
const { boot } = require("./helpers/e2e");

const PROBES = fs.readFileSync(path.join(__dirname, "..", "qa", "audit", "page-probes.js"), "utf8");

for (const vp of [
  { width: 1280, height: 800, lang: "es" },
  { width: 390, height: 844, lang: "es" },
  { width: 1280, height: 800, lang: "en" }
]) {
  test(`${vp.lang} ${vp.width}x${vp.height}: no control under 24 px in any exercise`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await page.addInitScript({ content: PROBES });
    await boot(page, { lang: vp.lang });
    await page.waitForFunction(() => !!window.VTApp?.openExercise && !!window.VT_EXERCISES && !!window.__audit);
    const ids = await page.evaluate(() =>
      Object.values(window.VT_EXERCISES)
        .flat()
        .map((e) => e.id)
    );
    const bad = [];
    for (const id of ids) {
      await page.evaluate((x) => window.VTApp.openExercise(x), id);
      await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
      const small = await page.evaluate(() =>
        window.__audit
          .zInventory("#view-exercise")
          .flat()
          .filter((x) => x.kind === "control" && x.small && x.inView && !x.fold && !x.disabled)
          .map((x) => `"${x.text}" ${x.w}×${x.h}`)
      );
      if (small.length) bad.push(`${id}: ${small.join(", ")}`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
}
