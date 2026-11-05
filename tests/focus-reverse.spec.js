/**
 * QA ui-b. Shift+Tab walk: no part of a focused control sits under the sticky header or the Back row.
 *
 * Goal behaviour: scroll-padding-top (header + Back row + 0.5rem) keeps a control clear when the browser scrolls UP to it.
 * Wrong behaviour: a padding that is too short (a regression in --ex-chrome-h, the 0.5rem, or the selector) leaves the top of a
 * 44 px button under the Back row. tests/focus-not-obscured.spec.js only presses Tab, so it never scrolls up to a control at the
 * top edge and stays green on a 40 px-short padding (mutants FN3, FN4 in qa/round4/ui-b/d-out.txt; FN2, 9 px short with the centre
 * clear, is a partial overlap and is not a 2.4.11 failure, so no test here is expected to kill it); Shift+Tab does. Measured:
 * base green; FN3 "A ciegas" 80% under, FN4 100%, FA6 (selector never matches) 100%, RN4 (invisible layer over the rail) 100%.
 * Expected value is the browser's own hit test (elementFromPoint at five points of the control's visible box), not app code.
 * Control: a planted sticky veil is reported.
 */
const { test, expect } = require("@playwright/test");
const { boot } = require("./helpers/e2e");

function settle() {
  return new Promise((res) => {
    let y = scrollY, still = 0;
    const t0 = performance.now();
    const tick = () => {
      still = scrollY === y ? still + 1 : 0;
      y = scrollY;
      if (still >= 6 || performance.now() - t0 > 2500) res();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}

/**
 * Share of five sample points (centre and the middle of each half-axis, 20% in from each edge: inside any pill or rounded button, so a
 * corner never shows the parent) of the focused control's visible box that the browser paints something else over, where that something
 * is, or sits in, a fixed or sticky layer. An ANCESTOR on top counts as covering: a layer that wraps the control (the rail's ::after,
 * mutant RN4) takes the click; only the control itself and its label count as the control.
 */
function coveredShare() {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const r = el.getBoundingClientRect();
  const box = { l: Math.max(0, r.left), t: Math.max(0, r.top), r: Math.min(innerWidth, r.right), b: Math.min(innerHeight, r.bottom) };
  if (r.width < 1 || box.r <= box.l || box.b <= box.t) return null;
  const fam = [el, ...(el.labels || [])];
  const pts = [[0.5, 0.5], [0.2, 0.5], [0.8, 0.5], [0.5, 0.2], [0.5, 0.8]];
  const hit = pts.filter(([fx, fy]) => paintedOver(document.elementFromPoint(box.l + fx * (box.r - box.l), box.t + fy * (box.b - box.t)), fam)).length;
  const name = (el.getAttribute("aria-label") || el.innerText || el.id || el.tagName).trim().slice(0, 30);
  return { share: hit / pts.length, name, y: Math.round(r.top), scroll: Math.round(scrollY) };

  /** Something else is on top, and it is (or sits in) a fixed or sticky layer. */
  function paintedOver(p, family) {
    if (!p || family.some((f) => f === p || f.contains(p))) return false;
    for (let e = p; e && e !== document.documentElement; e = e.parentElement) {
      const pos = getComputedStyle(e).position;
      if (pos === "fixed" || pos === "sticky") return true;
    }
    return false;
  }
}

async function walkBack(page, n) {
  const bad = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("Shift+Tab");
    await page.evaluate(settle);
    const o = await page.evaluate(coveredShare);
    if (o && o.share > 0) bad.push(`"${o.name}" ${Math.round(o.share * 100)}% under a sticky layer (y ${o.y}, scroll ${o.scroll})`);
  }
  return bad;
}

const IDS = ["v2-volume", "v4-articulation-pen", "s9-pitch-match", "s13-arpeggio-match"];
for (const vp of [
  { width: 1280, height: 800 },
  { width: 390, height: 844 }
]) {
  test(`${vp.width}x${vp.height}: two Shift+Tab rounds, no part of a focused control under the sticky rows`, async ({ page }) => {
    test.setTimeout(240000);
    await page.setViewportSize(vp);
    await boot(page);
    await page.waitForFunction(() => !!window.VTApp?.openExercise);
    const bad = [];
    for (const id of IDS) {
      await page.evaluate((x) => window.VTApp.openExercise(x), id);
      await page.evaluate(() => document.activeElement?.blur());
      const n = await page.evaluate(() => document.querySelectorAll("button, a[href], input, select, summary, [tabindex='0']").length);
      (await walkBack(page, Math.min(90, 2 * n + 4))).forEach((c) => bad.push(`${id}: ${c}`));
    }
    expect([...new Set(bad)], [...new Set(bad)].join("\n")).toEqual([]);
  });
}

test("control: the reverse walk reports a control under a sticky veil", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await boot(page);
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
  await page.evaluate(() => window.VTApp.openExercise("v4-articulation-pen"));
  await page.evaluate(() => {
    const v = document.createElement("div");
    v.style.cssText = "position:fixed;left:0;right:0;top:0;height:260px;z-index:99999";
    document.body.appendChild(v);
    document.activeElement?.blur();
  });
  expect((await walkBack(page, 14)).length).toBeGreaterThan(0);
});
