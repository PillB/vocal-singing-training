/**
 * Keyboard focus is never hidden under the sticky header or the exercise's
 * ← Back row (WCAG 2.2, 2.4.11 Focus Not Obscured).
 *
 * Wrong behaviour rejected (forensic audit, 2026-11-02, 22 Tab stops in 17
 * exercises): after Tab had gone round once and scrolled the page, the
 * browser brought each next control "into view" at the very top of the
 * window, which is under the two sticky rows: "Siguiente →" under the
 * exercise's title, the chord menu under "Practicar". The browser does keep
 * a focused control clear of a band the page declares (scroll-padding-top).
 * Measured after the scroll has settled: the page scrolls smoothly, and a
 * stop that is under the header only while the glide passes is not a defect.
 * Control: the same walk sees a covered stop (a sticky veil planted over the
 * top of the page is reported).
 */
const { test, expect } = require("@playwright/test");
const { boot } = require("./helpers/e2e");

/** Tab `n` times and list every stop whose centre is under something else, once the page has settled. */
async function walk(page, n) {
  const covered = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("Tab");
    await page.evaluate(settle);
    const o = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (r.width < 1 || y < 0 || y > innerHeight) return null;
      const top = document.elementFromPoint(x, y);
      if (!top || top === el || el.contains(top) || top.contains(el)) return null;
      if (el.labels && [...el.labels].some((l) => l.contains(top))) return null;
      const name = (e) => e.id || e.className?.toString().split(" ")[0] || e.tagName;
      return `"${(el.getAttribute("aria-label") || el.innerText || el.id).trim().slice(0, 30)}" under ${name(top)} (y ${Math.round(r.top)}, scroll ${Math.round(scrollY)})`;
    });
    if (o) covered.push(o);
  }
  return covered;
}

/** Resolve once the page has stopped scrolling: `html { scroll-behavior: smooth }` animates Tab's scroll, and mid-glide a control is briefly under the header. */
function settle() {
  return new Promise((res) => {
    let y = scrollY;
    let still = 0;
    const t0 = performance.now();
    const tick = () => {
      still = scrollY === y ? still + 1 : 0;
      y = scrollY;
      if (still >= 4 || performance.now() - t0 > 2000) res();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

// Exercises the audit caught, a speech and a singing one each kind
const IDS = ["v2-volume", "v4-articulation-pen", "s9-pitch-match", "s13-arpeggio-match"];

for (const vp of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 }
]) {
  test(`${vp.width}x${vp.height}: two full Tab rounds, no focused control under the sticky rows`, async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize(vp);
    await boot(page);
    await page.waitForFunction(() => !!window.VTApp?.openExercise);
    const bad = [];
    for (const id of IDS) {
      await page.evaluate((x) => window.VTApp.openExercise(x), id);
      await page.evaluate(() => document.activeElement?.blur());
      const n = await page.evaluate(() => document.querySelectorAll("button, a[href], input, select, summary, [tabindex='0']").length);
      // Twice round: the second round starts from a page the first scrolled
      (await walk(page, Math.min(90, 2 * n + 4))).forEach((c) => bad.push(`${id}: ${c}`));
    }
    expect([...new Set(bad)], [...new Set(bad)].join("\n")).toEqual([]);
  });
}

test("control: the walk reports a control under a sticky veil", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await boot(page);
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
  await page.evaluate(() => window.VTApp.openExercise("v4-articulation-pen"));
  await page.evaluate(() => {
    const v = document.createElement("div");
    v.id = "veil";
    v.style.cssText = "position:fixed;left:0;right:0;top:0;height:260px;z-index:99999";
    document.body.appendChild(v);
    document.activeElement?.blur();
  });
  const got = await walk(page, 14);
  expect(got.join("\n")).toContain("under veil");
});
