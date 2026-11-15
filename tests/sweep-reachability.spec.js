const { test, expect } = require("@playwright/test");
const { boot, openExercise } = require("./helpers/e2e");
const { mouseClickControl } = require("./helpers/mouse-control");
const { reflowStage, probeLayout } = require("./helpers/layout-probe");

for (const id of ["v1-diction", "s2-solfege-chords"]) {
  test(`${id}: the real pointer reaches the metrics toggle below the first screen`, async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 560 });
    await boot(page, { lang: "es", tourDone: true, mic: "silent" });
    await openExercise(page, id);
    await reflowStage(page);
    const button = page.locator("#btn-toggle-metrics");
    await expect(button).toHaveAttribute("aria-expanded", "false");
    const before = await button.boundingBox();
    expect(before.y + before.height / 2, "control: the target begins below the fold").toBeGreaterThan(560);
    const result = await mouseClickControl(page, "#btn-toggle-metrics");
    expect(result.ok, JSON.stringify(result)).toBe(true);
    await expect(button).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#metrics-card")).not.toHaveClass(/collapsed/);
  });
}

test("a covered control is reported and never clicked", async ({ page }) => {
  await page.setContent('<button id="target">Target</button><div style="position:fixed;inset:0;z-index:99"></div>');
  await page.evaluate(() => {
    window.__presses = 0;
    document.querySelector("#target").addEventListener("click", () => window.__presses++);
  });
  const result = await mouseClickControl(page, "#target");
  expect(result.ok).toBe(false);
  expect(await page.evaluate(() => window.__presses)).toBe(0);
});

test("tablet to short desktop: the diction stage stays within the screen", async ({ page }) => {
  await page.setViewportSize({ width: 768, height: 1024 });
  await boot(page, { lang: "es", tourDone: true, mic: "silent" });
  await openExercise(page, "s2-solfege-chords");
  await page.setViewportSize({ width: 1280, height: 560 });
  await openExercise(page, "v1-diction");
  await reflowStage(page);
  const layout = await probeLayout(page);
  console.log("short-stage-diagnostics", JSON.stringify(layout));
  expect(layout.issues.filter((issue) => ["stage_overflow_y", "start_offscreen"].includes(issue.code))).toEqual([]);
});
