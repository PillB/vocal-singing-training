/**
 * The stage's bottom rail (Start, mic, piano options) at desktop widths:
 * nothing in it overlaps, in any exercise.
 *
 * Wrong behaviour rejected (forensic audit, 2026-11-02): at 1280 and 1440 px
 * the melodic-speech exercise (v12) shows seven piano options beside Start
 * and the mic. The row could not wrap, so the mic box shrank to its 10rem
 * floor while its slider and value did not: the slider's thumb sat on the
 * octave "−" button and the value "7" on "0 octava". Every exercise is
 * checked, so the next one with a long rail is caught too.
 * Control: the check sees overlap (a button planted over the octave "−" is
 * reported).
 */
const { test, expect } = require("@playwright/test");
const { boot } = require("./helpers/e2e");

/** Pairs of visible rail controls (or a box and the control it spills onto) that intersect. */
function railClashes() {
  const rail = document.getElementById("hud-bottom-rail");
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && cs.visibility !== "hidden" && cs.display !== "none";
  };
  const name = (el) => el.id || el.getAttribute("aria-label") || el.textContent.trim().slice(0, 20) || el.tagName;
  const controls = [...rail.querySelectorAll("button, input, select, label")].filter(shown);
  const cross = (a, b) => a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  const out = [];
  for (let i = 0; i < controls.length; i++) {
    for (let j = i + 1; j < controls.length; j++) {
      const a = controls[i];
      const b = controls[j];
      if (a.contains(b) || b.contains(a) || a.control === b || b.control === a) continue;
      if (cross(a.getBoundingClientRect(), b.getBoundingClientRect())) out.push(`${name(a)} × ${name(b)}`);
    }
  }
  // A box whose content spills out paints over its neighbour
  for (const box of [...rail.children].filter(shown)) {
    const r = box.getBoundingClientRect();
    for (const c of box.querySelectorAll("*")) {
      const k = c.getBoundingClientRect();
      if (shown(c) && (k.right > r.right + 1 || k.left < r.left - 1)) {
        out.push(`${name(c)} spills out of ${box.id || box.className.split(" ")[0]}`);
        break;
      }
    }
  }
  return out;
}

for (const vp of [
  { width: 1280, height: 800, lang: "es" },
  { width: 1440, height: 900, lang: "es" },
  { width: 1180, height: 820, lang: "es" },
  // English labels are a different length
  { width: 1180, height: 820, lang: "en" }
]) {
  test(`${vp.lang} ${vp.width}x${vp.height}: no exercise's bottom rail overlaps`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await boot(page, { lang: vp.lang });
    await page.waitForFunction(() => !!window.VTApp?.openExercise && !!window.VT_EXERCISES);
    const ids = await page.evaluate(() =>
      Object.values(window.VT_EXERCISES)
        .flat()
        .map((e) => e.id)
    );
    const bad = [];
    for (const id of ids) {
      await page.evaluate((x) => window.VTApp.openExercise(x), id);
      // Two frames: the rail is laid out and the stage insets follow it
      await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
      const got = await page.evaluate(railClashes);
      if (got.length) bad.push(`${id}: ${got.join("; ")}`);
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
}

test("control: the check reports a box laid over the octave buttons", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await boot(page);
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
  await page.evaluate(() => window.VTApp.openExercise("v12-melodic-speech"));
  await page.evaluate(() => {
    const down = document.getElementById("btn-oct-down");
    const r = down.getBoundingClientRect();
    // In the flow, pulled back over the octave "−" by a negative margin
    const fake = document.createElement("button");
    fake.id = "planted";
    fake.style.cssText = `margin-left:-${r.width}px;width:${r.width}px;height:${r.height}px;flex:0 0 auto`;
    down.after(fake);
  });
  const got = await page.evaluate(railClashes);
  expect(got.join("; ")).toContain("planted");
});
