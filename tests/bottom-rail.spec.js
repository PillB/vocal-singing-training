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

/** 1 when the rail's controls sit on more than one row, else 0. */
function railRows() {
  const rail = document.getElementById("hud-bottom-rail");
  const tops = [...rail.children]
    .filter((el) => el.getBoundingClientRect().height > 1 && getComputedStyle(el).display !== "none")
    .map((el) => Math.round(el.getBoundingClientRect().top));
  return new Set(tops).size > 1 && Math.max(...tops) - Math.min(...tops) > 20 ? 1 : 0;
}

for (const vp of [
  { width: 1280, height: 800, lang: "es" },
  { width: 1440, height: 900, lang: "es" },
  { width: 1180, height: 820, lang: "es" },
  // English labels are a different length
  { width: 1180, height: 820, lang: "en" },
  // A browser set to "Very large" text (24 px, Chrome's setting; WCAG 1.4.4).
  // Since #21 the piano options sit behind "Piano ▾", so at 16 px every rail
  // fits one row and the cases above no longer need it to wrap (A7 survived
  // them in the #21 merge). At 24 px half the exercises need a second row.
  // The page sets no root font size, so the browser's setting is what an
  // inline root size stands in for.
  { width: 1280, height: 800, lang: "es", textPx: 24 }
]) {
  test(`${vp.lang} ${vp.width}x${vp.height}${vp.textPx ? ` at ${vp.textPx} px text` : ""}: no exercise's bottom rail overlaps`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    if (vp.textPx) {
      await page.addInitScript((px) => {
        document.addEventListener("DOMContentLoaded", () => {
          document.documentElement.style.fontSize = `${px}px`;
        });
      }, vp.textPx);
    }
    await boot(page, { lang: vp.lang });
    await page.waitForFunction(() => !!window.VTApp?.openExercise && !!window.VT_EXERCISES);
    const ids = await page.evaluate(() =>
      Object.values(window.VT_EXERCISES)
        .flat()
        .map((e) => e.id)
    );
    const bad = [];
    let twoRows = 0;
    for (const id of ids) {
      await page.evaluate((x) => window.VTApp.openExercise(x), id);
      // Two frames: the rail is laid out and the stage insets follow it
      await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
      const got = await page.evaluate(railClashes);
      if (got.length) bad.push(`${id}: ${got.join("; ")}`);
      if (vp.textPx) twoRows += await page.evaluate(railRows);
    }
    expect(bad, bad.join("\n")).toEqual([]);
    // Control: the larger text does make rails that only fit on two rows.
    if (vp.textPx) expect(twoRows, "rails that took a second row").toBeGreaterThan(0);
  });
}

/**
 * Free room at the end of the mic box's row, in px: the rail's inner right edge
 * minus the right edge of the last box on that row. null when there is no mic box.
 */
function micRowSlack() {
  const rail = document.getElementById("hud-bottom-rail");
  const shown = (el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 1 && r.height > 1 && cs.display !== "none" && cs.visibility !== "hidden";
  };
  const bc = rail.querySelector(":scope > .hud-bc");
  if (!bc || !shown(bc)) return null;
  const b = bc.getBoundingClientRect();
  const row = [...rail.children].filter(shown).filter((el) => {
    const r = el.getBoundingClientRect();
    return r.top < b.bottom - 4 && r.bottom > b.top + 4;
  });
  const end = Math.max(...row.map((el) => el.getBoundingClientRect().right));
  const inner = rail.getBoundingClientRect().right - (parseFloat(getComputedStyle(rail).paddingRight) || 0);
  return Math.round(inner - end);
}

/*
 * The mic box grows into the room its row has left (the rail's own design:
 * "Start | Mic (grows into free X) | Piano opts"). Wrong behaviour rejected
 * (review AE3/AE4 of PR #39): #21 kept the mic box at its natural width beside
 * options that wrap inside themselves, on a rail that could not wrap; main made
 * the rail wrap instead. The merge kept both, so v12 took two rows and still
 * had a 129 px slider, and every speech exercise, whose options box is hidden,
 * matched the same rule: the slider ended about 500 px short of the rail's
 * right edge on 27 of 52 exercises, at every desktop width.
 */
for (const vp of [
  { width: 1280, height: 800, lang: "es" },
  { width: 1920, height: 1080, lang: "es" },
  { width: 1180, height: 820, lang: "en" }
]) {
  test(`${vp.lang} ${vp.width}x${vp.height}: the mic box takes the rest of its row in every exercise`, async ({ page }) => {
    test.setTimeout(120000);
    await page.setViewportSize({ width: vp.width, height: vp.height });
    await boot(page, { lang: vp.lang });
    await page.waitForFunction(() => !!window.VTApp?.openExercise && !!window.VT_EXERCISES);
    const ids = await page.evaluate(() =>
      Object.values(window.VT_EXERCISES)
        .flat()
        .map((e) => e.id)
    );
    const short = [];
    let measured = 0;
    for (const id of ids) {
      await page.evaluate((x) => window.VTApp.openExercise(x), id);
      await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
      const slack = await page.evaluate(micRowSlack);
      if (slack === null) continue;
      measured += 1;
      if (slack > 20) short.push(`${id}: ${slack} px left empty`);
    }
    expect(measured, "control: the mic box is on screen in the exercises").toBeGreaterThan(40);
    expect(short, short.join("\n")).toEqual([]);
  });
}

test("control: the slack check sees a mic box held to its own width", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await boot(page);
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
  await page.evaluate(() => window.VTApp.openExercise("v2-volume"));
  await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
  expect(await page.evaluate(micRowSlack)).toBeLessThanOrEqual(20);
  await page.evaluate(() => {
    document.querySelector("#hud-bottom-rail > .hud-bc").style.flex = "0 0 auto";
  });
  await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
  expect(await page.evaluate(micRowSlack)).toBeGreaterThan(100);
});

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
