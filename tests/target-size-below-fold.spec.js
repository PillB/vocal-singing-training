/**
 * Round 4 (falsify): tests/target-size.spec.js filters on `inView`, so a control below the first
 * screen is never measured. Goal behaviour: no control in any exercise is under 24 x 24 px
 * (WCAG 2.5.8) wherever it sits on the page. Wrong behaviour: a 13 px checkbox 330 px below the
 * fold passes. The control test plants such a checkbox and proves the walk can see it.
 * Copy to tests/ and run: npx playwright test tests/target-size-below-fold.spec.js --project=chromium
 * Expected today (0bd8b32): the two walks are RED on v7-record-review ("Paso listo" x3, 13 x 13).
 * It also keeps controls whose ancestor carries the class "collapsed" (94 visible controls in the shipped app,
 * e.g. #btn-toggle-guide and #btn-toggle-metrics) which target-size.spec.js and the ledger skip as "folded".
 */
const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("@playwright/test");
const { boot } = require("./helpers/e2e");

const PROBES = fs.readFileSync(path.join(__dirname, "..", "qa", "audit", "page-probes.js"), "utf8");

for (const vp of [{ width: 1280, height: 800 }, { width: 390, height: 844 }]) {
  test(`${vp.width}x${vp.height}: no control under 24 px in any exercise, below the fold included`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize(vp);
    await page.addInitScript({ content: PROBES });
    await boot(page, { lang: "es" });
    await page.waitForFunction(() => !!window.VTApp?.openExercise && !!window.VT_EXERCISES && !!window.__audit);
    const ids = await page.evaluate(() => Object.values(window.VT_EXERCISES).flat().map((e) => e.id));
    const bad = [];
    for (const id of ids) {
      await page.evaluate((x) => window.VTApp.openExercise(x), id);
      await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
      const small = await page.evaluate(() =>
        window.__audit.zInventory("#view-exercise").flat()
          .filter((x) => x.kind === "control" && x.small && (!x.fold || x.fold === "collapsed") && !x.disabled) // no inView filter; the "collapsed" label marks a section's state, its toggle is on screen
          .map((x) => `"${x.text}" ${x.w}x${x.h}${x.inView ? "" : " (below the fold)"}`)
      );
      if (small.length) bad.push(`${id}: ${small.join(", ")}`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
}

test("control: a 13 px checkbox far below the fold is seen by this walk and missed by the in-view filter", async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await page.setContent('<body style="margin:0"><div style="height:1500px"></div><input type="checkbox" style="width:13px;height:13px;margin:0"></body>');
  await page.addScriptTag({ content: PROBES });
  const r = await page.evaluate(() => {
    const all = window.__audit.zInventory().flat().filter((x) => x.kind === "control" && x.small);
    return { withoutFilter: all.length, withInViewFilter: all.filter((x) => x.inView).length };
  });
  expect(r).toEqual({ withoutFilter: 1, withInViewFilter: 0 });
});
