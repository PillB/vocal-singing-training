/**
 * Red team round 9 (audit-css). tests/rail-small-screens.spec.js pins the landscape-phone fix (css/styles.css, then the rule
 * `@media (max-height: 500px) and (max-width: 799.98px) { .hud-bottom-rail { flex-wrap: wrap } }`) at 568x320, 667x375 and 740x360 only.
 * Since the merge of #21 (PR #39) that rule is gone: #21's landscape block wraps the rail at every width, so there is no width
 * bound left to move, and the bounds mutants D7 and D8 are retired as equivalent (qa/mutate.mjs says why). These sizes stay as a
 * check of every exercise's rail between the pinned sizes and the old bounds.
 *
 * Goal behaviour: a phone on its side narrower than 800 px and not taller than 500 px keeps Start, the mic and the piano settings
 * apart: no two rail controls overlap, every rail control's centre hits itself, the rail stays inside the stage, the lanes end above
 * it. Wrong behaviour: the rule's bounds are moved in, so a phone between the pinned sizes and the bounds gets one row again and the
 * mic slider lies on the octave "-" (the original UIB-03). Real phones in the gaps: Galaxy S10 760x360, iPhone 8 Plus 736x414,
 * a 640x480 or 700x500 window. (786x393 and 799x360 were measured too: the one-row rail fits there, so they discriminate nothing and are left out.)
 * The expected values are the browser's hit test and boxes (the measure() of rail-small-screens.spec.js, copied); none comes from the CSS.
 * Control: a button planted over the octave "-" is reported (rail-small-screens.spec.js has the same one).
 */
const { test, expect } = require("@playwright/test");
const { boot } = require("./helpers/e2e");

function measure() {
  const R = (e) => e.getBoundingClientRect();
  const q = (s) => document.querySelector(s);
  const rail = q("#hud-bottom-rail");
  const stage = q("#highway-stage");
  if (!rail || !stage) return ["no rail/stage"];
  const items = [...rail.querySelectorAll("button, input, select, label")].filter(shown);
  return [...overlaps(items), ...unreachable(items), ...leavesStage(), ...lanesUnderRail()];

  function shown(e) {
    const r = R(e);
    const cs = getComputedStyle(e);
    return r.width > 1 && r.height > 1 && cs.display !== "none" && cs.visibility !== "hidden" && !e.closest("[hidden]");
  }
  function nm(e) {
    return e.id || e.getAttribute("aria-label") || (e.textContent || "").trim().slice(0, 14) || e.tagName;
  }
  function cross(a, b) {
    return a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1;
  }
  function related(a, b) {
    return a.contains(b) || b.contains(a) || a.control === b || b.control === a;
  }
  function overlaps(list) {
    const bad = [];
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        if (!related(list[i], list[j]) && cross(R(list[i]), R(list[j]))) bad.push(`overlap ${nm(list[i])} x ${nm(list[j])}`);
      }
    }
    return bad;
  }
  // An ANCESTOR on top is not the control: an overlay of the rail (a ::after, a z-index) is its ancestor, and the click goes to it
  function coveredBy(e) {
    const r = R(e);
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return "offscreen";
    const t = document.elementFromPoint(x, y);
    const own = [e, ...(e.labels || [])].some((f) => t && (f === t || f.contains(t)));
    return own ? "" : `covered by ${t ? t.id || t.tagName : "nothing"}`;
  }
  function unreachable(list) {
    return list
      .filter((x) => x.tagName !== "LABEL")
      .map((e) => [e, coveredBy(e)])
      .filter(([, why]) => why)
      .map(([e, why]) => (why === "offscreen" ? `offscreen ${nm(e)}` : `covered ${nm(e)} ${why.replace("covered ", "")}`));
  }
  function leavesStage() {
    const rr = R(rail);
    const sr = R(stage);
    if (rr.bottom <= sr.bottom + 1 && rr.top >= sr.top - 1) return [];
    return [`rail leaves the stage by ${Math.round(Math.max(rr.bottom - sr.bottom, sr.top - rr.top))}px`];
  }
  function lanesUnderRail() {
    const pb = q("#pitch-block");
    const cv = q("#pitch-canvas");
    if (!pb || pb.hidden || !cv || R(cv).height <= 58) return [];
    const over = Math.round(R(cv).bottom - 58 - R(rail).top);
    return over > 0 ? [`pitch lanes run ${over}px under the rail`] : [];
  }
}

// Between the pinned widths and the 800 px bound, and between the pinned heights and the 500 px bound
const SIZES = [
  { width: 760, height: 360 },
  { width: 736, height: 414 },
  { width: 640, height: 480 },
  { width: 700, height: 500 }
];
for (const vp of SIZES) {
  test(`${vp.width}x${vp.height}: every exercise's bottom rail overlaps nothing, is hit-testable, sits in the stage, lanes end above it`, async ({ page }) => {
    test.setTimeout(180000);
    await page.setViewportSize(vp);
    await boot(page);
    await page.waitForFunction(() => !!window.VTApp?.openExercise && !!window.VT_EXERCISES);
    const ids = await page.evaluate(() => Object.values(window.VT_EXERCISES).flat().map((e) => e.id));
    const bad = [];
    for (const id of ids) {
      await page.evaluate((x) => window.VTApp.openExercise(x), id);
      await page.evaluate(() => new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res))));
      const got = await page.evaluate(measure);
      if (got.length) bad.push(`${id}: ${got.join("; ")}`);
    }
    expect(bad.length, `${bad.length}/${ids.length} exercises\n` + bad.slice(0, 8).join("\n")).toBe(0);
  });
}

test("control: a button planted over the octave '-' is reported", async ({ page }) => {
  await page.setViewportSize({ width: 760, height: 360 });
  await boot(page);
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
  await page.evaluate(() => window.VTApp.openExercise("v12-melodic-speech"));
  await page.evaluate(() => {
    const down = document.getElementById("btn-oct-down");
    const r = down.getBoundingClientRect();
    const fake = document.createElement("button");
    fake.id = "planted";
    fake.style.cssText = `margin-left:-${r.width}px;width:${r.width}px;height:${r.height}px;flex:0 0 auto`;
    down.after(fake);
  });
  expect((await page.evaluate(measure)).join("; ")).toContain("planted");
});
