// Tap-floor measurements are float32 after the element's transform (see tests/helpers/tap-floor.js).
// Goal: a control that CSS makes 44 px clears the floor wherever the hover lift has moved it; one that is really smaller does not.
// Wrong behaviours rejected:
//   - a strict `height < 44` that reads 43.99999 as too small (the CI red on be702cf: accounts.spec.js "44px tap floor");
//   - an allowance so wide that a real 43 px or 43.5 px control passes.
const { test, expect } = require("@playwright/test");
const { clearsTapFloor, tapFloorLimit, TAP_FLOOR_EPSILON } = require("./helpers/tap-floor");

const PAGE = (minH) => `<style>
  .btn{display:inline-flex;align-items:center;box-sizing:border-box;height:${minH}px;border:1px solid #888;padding:0 1rem;font:14px sans-serif}
</style><div style="height:100.37px"></div><button class="btn" id="a">Pro</button>`;

/** Measures the button at 41 fractional lifts, as the hover transition passes through them. */
async function heightsUnderLift(page, minH) {
  await page.setContent(PAGE(minH));
  return page.evaluate(() => {
    const el = document.getElementById("a");
    const out = [];
    for (let i = 0; i <= 40; i++) {
      el.style.transform = `translateY(${-i * 0.0852769 + 0.013 * (i % 7)}px)`;
      out.push(el.getBoundingClientRect().height);
    }
    return out;
  });
}

test("a control CSS makes 44 px clears the 44 px floor at every point of the hover lift", async ({ page }) => {
  const heights = await heightsUnderLift(page, 44);
  const tooSmall = heights.filter((h) => !clearsTapFloor(h, 44));
  expect(tooSmall, `heights the floor called too small: ${tooSmall.join(", ")}`).toEqual([]);
  // The allowance is only noise: nothing here is more than a hair off 44.
  expect(Math.min(...heights)).toBeGreaterThan(44 - TAP_FLOOR_EPSILON);
});

test("a control that really is 43.5 px, or 43 px, does not clear the 44 px floor", async ({ page }) => {
  for (const minH of [43.5, 43]) {
    const heights = await heightsUnderLift(page, minH);
    expect(heights.every((h) => !clearsTapFloor(h, 44)), `${minH} px control: ${Math.max(...heights)}`).toBe(true);
  }
});

test("the 24 px floor of WCAG 2.5.8 uses the same allowance", async ({ page }) => {
  const heights = await heightsUnderLift(page, 24);
  expect(heights.every((h) => clearsTapFloor(h, 24))).toBe(true);
  const small = await heightsUnderLift(page, 23);
  expect(small.every((h) => !clearsTapFloor(h, 24))).toBe(true);
  expect(tapFloorLimit(24)).toBeCloseTo(24 - TAP_FLOOR_EPSILON, 10);
});

test("control: the strict comparison does read this browser's 44 px box as too small somewhere in the lift (why the allowance exists)", async ({ page }) => {
  const heights = await heightsUnderLift(page, 44);
  test.info().annotations.push({ type: "strict-misreads", description: `${heights.filter((h) => h < 44).length} of ${heights.length}` });
  // Not asserted as a number: a Chromium that computes this exactly makes the allowance unnecessary, not wrong.
  expect(heights.every((h) => h > 43.9)).toBe(true);
});
