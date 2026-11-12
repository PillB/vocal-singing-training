// Seams between the red-team fix batches, found in the review of the merged
// branch: each case would fail on the merge without the review fixes.
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function openHome(page) {
  await page.addInitScript(() => {
    sessionStorage.setItem("vt_e2e", "1");
    localStorage.setItem("vt_tour_v1", "done");
    localStorage.setItem("vt_lang", "es");
  });
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTStorage && !!window.VTFocusTrap);
}

test.describe("seams between the fix batches", () => {
  test("a profile name is never cut inside a flag or a family emoji", async ({ page }) => {
    await openHome(page);
    const out = await page.evaluate(() => {
      const flag = "\u{1F1F5}\u{1F1EA}";
      const family = "\u{1F468}‍\u{1F469}‍\u{1F467}‍\u{1F466}";
      const names = ["x".repeat(31) + flag, "y".repeat(28) + family + "z", "a".repeat(40)];
      return names.map((n) => {
        const cut = window.VTStorage.cleanProfileName(n);
        return { cut, units: Array.from(cut).length };
      });
    });
    // The flag and the family do not fit, so they are left out whole.
    expect(out[0].cut).toBe("x".repeat(31));
    expect(out[1].cut).toBe("y".repeat(28));
    expect(out[2].units).toBe(32);
    for (const o of out) expect(o.units).toBeLessThanOrEqual(32);
  });

  test("a dialog whose opener is gone hands focus to a heading made focusable by script", async ({ page }) => {
    await openHome(page);
    const active = await page.evaluate(() => {
      const heading = document.createElement("h2");
      heading.id = "ft-fallback-heading";
      heading.tabIndex = -1;
      heading.textContent = "Inicio";
      document.body.prepend(heading);
      const box = document.createElement("div");
      box.id = "ft-box";
      box.innerHTML = '<button id="ft-inside">Dentro</button>';
      document.body.append(box);
      const opener = document.createElement("button");
      opener.id = "ft-opener";
      document.body.append(opener);
      opener.focus();
      const trap = window.VTFocusTrap.activate(box, {
        returnFocus: () => document.getElementById("ft-gone"),
        fallbackFocus: () => document.getElementById("ft-fallback-heading"),
      });
      document.getElementById("ft-inside").focus();
      window.VTFocusTrap.release ? window.VTFocusTrap.release(box) : trap && trap.release && trap.release();
      return document.activeElement && document.activeElement.id;
    });
    expect(active).toBe("ft-fallback-heading");
  });
});
