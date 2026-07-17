/**
 * Space manual assist: must not activate Start/Stop; must count on silent mic.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function bootSh(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* ignore */
    }
    // Silent mic stream
    navigator.mediaDevices.getUserMedia = async () => {
      const AC = window.AudioContext || window.webkitAudioContext;
      const ctx = new AC();
      const dest = ctx.createMediaStreamDestination();
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      g.gain.value = 0.00001;
      osc.connect(g);
      g.connect(dest);
      osc.start();
      return dest.stream;
    };
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.locator('.tab[data-tab="singing"]').click();
  await page.waitForTimeout(120);
  await page.evaluate(() => {
    const cards = [...document.querySelectorAll("#exercise-list .card-ex")];
    cards.find((el) => /SH|Escalera|aire/i.test(el.textContent || ""))?.click();
  });
  await page.waitForSelector("#btn-practice-start");
}

test.describe("Space assist (SH ladder)", () => {
  test("silence keeps count at 0; Space raises count; focus on Stop does not stop", async ({
    page
  }) => {
    await bootSh(page);
    await page.locator("#btn-practice-start").click();
    await expect(page.locator("#practice-status")).toContainText(/vivo|live/i, {
      timeout: 8000
    });
    await page.waitForTimeout(900);
    let cur = await page.locator("[data-h]").first().textContent();
    expect(parseFloat(cur)).toBe(0);

    // Focus Stop (browser would normally activate it with Space)
    await page.evaluate(() => {
      document.querySelector("#btn-practice-stop")?.focus();
    });
    await page.keyboard.down("Space");
    await page.waitForTimeout(700);
    const mid = await page.evaluate(() => ({
      cur: document.querySelector("[data-h]")?.textContent,
      status: document.querySelector("#practice-status")?.textContent,
      stopHidden: document.querySelector("#btn-practice-stop")?.hidden,
      chip: document.querySelector("#mic-sens-hud")?.className || ""
    }));
    expect(mid.stopHidden).toBe(false); // still live
    expect(mid.status).toMatch(/vivo|live/i);
    expect(parseFloat(mid.cur)).toBeGreaterThan(0.3);
    expect(mid.chip).toMatch(/is-manual/);

    await page.keyboard.up("Space");
    await page.waitForTimeout(100);
    const after = await page.evaluate(() => ({
      stopHidden: document.querySelector("#btn-practice-stop")?.hidden,
      chip: document.querySelector("#mic-sens-hud")?.className || ""
    }));
    expect(after.stopHidden).toBe(false);
    expect(after.chip).toMatch(/is-manual/);
  });
});
