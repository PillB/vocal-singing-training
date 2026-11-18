/**
 * The nightly fullscreen sweep clicks every control with the real mouse
 * (tests/helpers/fullscreen-clicks.js). It ran red every night from Nov 12 on
 * one control, "Mostrar métricas" on s2-solfege-chords: in CI's fonts its
 * centre was 5 px under a 1080 px screen, and the harness's retry scrolled to
 * it and then straight back to the top. These tests hold the harness to what a
 * person does (scroll to the control, click it there) and to what it is for
 * (a covered control is still a miss). They also hold it to giving up at once
 * on a control with no box, and to putting back the metrics card it opened. They
 * run on every pull request, since the sweep itself runs only at night.
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise } = require("./helpers/e2e");
const { fit, clickControl, restoreAfterClick } = require("./helpers/fullscreen-clicks");

test.use({ viewport: { width: 1920, height: 1080 } });

/** s2-solfege-chords as the sweep sees it, with the metrics toggle's centre `under` px below the window. */
async function toggleUnderTheFold(page, under) {
  await boot(page, { lang: "es", tourDone: true, mic: "silent" });
  await openExercise(page, "s2-solfege-chords");
  await fit(page);
  // A spacer above the metrics card, sized here: the fonts of the machine
  // decide where the card falls, and the test must not depend on them.
  return page.evaluate((px) => {
    const btn = document.getElementById("btn-toggle-metrics");
    const b = btn.getBoundingClientRect();
    const spacer = document.createElement("div");
    spacer.id = "harness-spacer";
    spacer.style.height = Math.max(0, Math.ceil(innerHeight + px - (b.top + b.height / 2))) + "px";
    document.getElementById("metrics-card").before(spacer);
    window.scrollTo(0, 0);
    const a = btn.getBoundingClientRect();
    return { centre: a.top + a.height / 2, vh: innerHeight, open: btn.getAttribute("aria-expanded") };
  }, under);
}

const expanded = (page) => page.locator("#btn-toggle-metrics").getAttribute("aria-expanded");

/** s2-solfege-chords with its metrics card opened by the app: the card then hides its own toggle. */
async function metricsOpened(page) {
  await boot(page, { lang: "es", tourDone: true, mic: "silent" });
  await openExercise(page, "s2-solfege-chords");
  await fit(page);
  await page.evaluate(() => document.getElementById("btn-toggle-metrics").click());
  await expect(page.locator("#metrics-card")).not.toHaveClass(/\bcollapsed\b/);
  expect(await expanded(page)).toBe("true");
  const box = await page.evaluate(() => document.getElementById("btn-toggle-metrics").getBoundingClientRect().height);
  expect(box, "the open card hides its toggle").toBe(0);
}

test.describe("The fullscreen sweep's click harness", () => {
  test("a control under the window's edge is scrolled to and clicked where it then is", async ({ page }) => {
    const before = await toggleUnderTheFold(page, 5);
    expect(before.centre, "the toggle starts under the edge, as in CI").toBeGreaterThan(before.vh);
    expect(before.open).toBe("false");

    const r = await clickControl(page, "#btn-toggle-metrics");

    expect(r.ok, JSON.stringify(r.hit)).toBe(true);
    await expect.poll(() => expanded(page)).toBe("true");
  });

  test("negative control: a control covered where it is scrolled to is still a miss, and is not pressed", async ({ page }) => {
    const before = await toggleUnderTheFold(page, 5);
    expect(before.centre, "the toggle starts under the edge, as in CI").toBeGreaterThan(before.vh);
    await page.evaluate(() => {
      const cover = document.createElement("div");
      cover.id = "harness-cover";
      cover.style.cssText = "position:fixed;left:0;right:0;bottom:0;height:160px;z-index:2147483646";
      document.body.appendChild(cover);
    });

    const r = await clickControl(page, "#btn-toggle-metrics");

    expect(r.ok).toBe(false);
    expect(r.hit.top?.id).toBe("harness-cover");
    expect(await expanded(page)).toBe("false");
  });

  test("a control with no box is a miss at once, not a wait until the test's timeout", async ({ page }) => {
    // Scrolling to a control with no box retries until the timeout (no actionTimeout in the config);
    // this test's own is short, so that a harness which tries it fails here in seconds.
    test.setTimeout(30000);
    await metricsOpened(page);

    const started = Date.now();
    const r = await clickControl(page, "#btn-toggle-metrics");

    expect(r.ok).toBe(false);
    expect(r.hit.reason).toBe("zero");
    expect(Date.now() - started, "ms to give up").toBeLessThan(10000);
  });

  test("the metrics card a click opened is put back closed, and the app knows it is", async ({ page }) => {
    test.setTimeout(30000);
    await metricsOpened(page);

    await restoreAfterClick(page, { id: "btn-toggle-metrics" }, "#btn-toggle-metrics");

    await expect(page.locator("#metrics-card")).toHaveClass(/\bcollapsed\b/);
    await expect.poll(() => expanded(page)).toBe("false");
    expect(await page.evaluate(() => window.VTApp.getState().metricsOpen)).toBe(false);
  });
});
