// @ts-check
/**
 * A touch screen keeps :hover on the last thing tapped. The button lift and
 * accent border are for a pointer that can hover; on a phone they made a
 * tapped button look chosen until something else was tapped.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function open(page) {
  await page.addInitScript(() => {
    localStorage.setItem("vt_tour_v1", "1");
    localStorage.setItem("vt_lang", "es");
  });
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => document.querySelectorAll("#exercise-list .card-ex").length > 0);
}

/** The button's look while the pointer rests on it. */
async function hovered(page) {
  const button = page.locator("#btn-more, #btn-account").first();
  const rest = await button.evaluate((el) => getComputedStyle(el).borderTopColor);
  await button.hover();
  // The lift is a 0.12 s transition: read it once it has settled.
  await page.waitForTimeout(300);
  return button.evaluate((el, rest) => {
    const cs = getComputedStyle(el);
    return { matches: el.matches(":hover"), lifted: cs.transform !== "none", recoloured: cs.borderTopColor !== rest };
  }, rest);
}

test("a phone: a button under the finger is not lifted or outlined", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  const page = await context.newPage();
  await open(page);
  expect(await page.evaluate(() => matchMedia("(hover: none)").matches)).toBe(true);
  const state = await hovered(page);
  // The control really is in the :hover state, so the rule is what is being tested.
  expect(state.matches).toBe(true);
  expect(state.lifted).toBe(false);
  expect(state.recoloured).toBe(false);
  await context.close();
});

test("a mouse: the same button still lifts and takes the accent border", async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await open(page);
  const state = await hovered(page);
  expect(state.matches).toBe(true);
  expect(state.lifted).toBe(true);
  expect(state.recoloured).toBe(true);
});
