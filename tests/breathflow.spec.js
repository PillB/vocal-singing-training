/**
 * BreathFlow behavioural contract. The oracle is the shared VTDays ledger,
 * not our own preview text: a save must add exactly one take and one day.
 * Run: npx playwright test tests/breathflow.spec.js --project=chromium
 */
const { test, expect } = require("@playwright/test");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
test.use({ timezoneId: "America/Lima", locale: "es-PE" });

async function open(page) {
  await page.clock.install({ time: new Date("2026-11-22T10:00:00-05:00") });
  await page.goto(BASE + "/breathflow.html");
  await expect(page.locator("#flow-start")).toBeEnabled();
}
async function finish(page) {
  await page.locator("#flow-start").click();
  await expect(page.locator("#flow-counter")).toHaveText("Frase 1 de 3");
  await page.locator("#flow-breath").click();
  await page.locator("#flow-next").click();
  await page.locator("#flow-breath").click();
  await page.locator("#flow-mid").click();
  await page.locator("#flow-next").click();
  await page.locator("#flow-next").click();
  await expect(page.locator("#flow-review")).toBeVisible();
}
test("one manual round updates the same day, week and month ledger used by main", async ({ page }) => {
  await open(page);
  const initial = await page.evaluate(() => {
    const d = window.VTDays;
    const b = d.read();
    return { n: b.days[d.dayKey()]?.n || 0, count: d.summary().practiceDays || 0 };
  });
  await finish(page);
  await expect(page.locator("#flow-review-text")).toContainText("respiraciones entre frases que marcaste: 2");
  await expect(page.locator("#flow-review-text")).toContainText("dentro de frase: 1");
  await page.locator("#flow-comfort").selectOption("mixed");
  await page.locator("#flow-save").dblclick();
  await expect(page.locator("#flow-done")).toBeVisible();
  const after = await page.evaluate(() => {
    const d = window.VTDays;
    const b = d.read();
    return { n: b.days[d.dayKey()].n, id: b.days[d.dayKey()].ex.includes("bf-breathflow") };
  });
  expect(after.n).toBe(initial.n + 1);
  expect(after.id).toBe(true);
  await page.locator("#flow-tab-week").click();
  await expect(page.locator("#flow-week")).toContainText("1 día");
  await page.locator("#flow-tab-month").click();
  await expect(page.locator("#flow-month")).toContainText("1 día");
  await page.goto(BASE + "/index.html");
  const inMain = await page.evaluate(() => {
    const d = window.VTDays; return !!d && d.read().days[d.dayKey()]?.ex.includes("bf-breathflow");
  });
  expect(inMain).toBe(true);
});
test("validation stops one phrase or overlong text from entering active state", async ({ page }) => {
  await open(page);
  await page.locator("#flow-lines").fill("Una sola frase");
  await expect(page.locator("#flow-start")).toBeDisabled();
  await page.locator("#flow-lines").fill("A".repeat(161) + "\nBien.");
  await expect(page.locator("#flow-start")).toBeDisabled();
  await page.locator("#flow-lines").fill("Uno.\nDos.");
  await expect(page.locator("#flow-start")).toBeEnabled();
  await page.locator("#flow-start").click();
  await expect(page.locator("#flow-phrase")).toHaveText("Uno.");
});
test("cancelled practice does not mark a day; saving requires self-reported comfort", async ({ page }) => {
  await open(page);
  await page.locator("#flow-start").click();
  await page.locator("#flow-abort").click();
  expect(await page.evaluate(() => window.VTDays.read().days[window.VTDays.dayKey()]?.ex.includes("bf-breathflow") || false)).toBe(false);
  await finish(page);
  await page.locator("#flow-save").click();
  await expect(page.locator("#flow-notice")).toContainText("indica cómo se sintió");
  expect(await page.evaluate(() => window.VTDays.read().days[window.VTDays.dayKey()]?.ex.includes("bf-breathflow") || false)).toBe(false);
});
test("profile switch before save fails closed rather than crediting a different profile", async ({ page }) => {
  await open(page);
  await finish(page);
  await page.locator("#flow-comfort").selectOption("easy");
  await page.evaluate(() => { window.VTStorage.getActiveProfileId = () => "another-profile"; });
  await page.locator("#flow-save").click();
  await expect(page.locator("#flow-notice")).toContainText("Cambió el perfil");
  await expect(page.locator("#flow-review")).toBeVisible();
});
test("microphone denied still permits all manual controls", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    navigator.mediaDevices.getUserMedia = async () => { throw new DOMException("Denied", "NotAllowedError"); };
  });
  await page.locator("#flow-mic").click();
  await expect(page.locator("#flow-mic-status")).toContainText("denegado");
  await finish(page);
  await expect(page.locator("#flow-review")).toBeVisible();
});
test("late microphone permission after cancel never starts audio or leaks a stream", async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    window.__micStopped = false;
    navigator.mediaDevices.getUserMedia = () => new Promise((resolve) => { window.__resolvePermission = resolve; });
  });
  await page.locator("#flow-mic").click();
  await expect(page.locator("#flow-mic-status")).toContainText("Esperando permiso");
  await page.locator("#flow-mic-cancel").click();
  await page.evaluate(() => {
    window.__resolvePermission({ getTracks: () => [{ stop: () => { window.__micStopped = true; } }] });
  });
  await expect.poll(() => page.evaluate(() => window.__micStopped)).toBe(true);
  expect(await page.evaluate(() => window.VTBreathFlow.state().mic)).toBe("off");
  await expect(page.locator("#flow-start")).toBeEnabled();
});
test("HTML typed as a phrase stays text, never an element", async ({ page }) => {
  await open(page);
  await page.locator("#flow-lines").fill("<img src=x onerror=alert(1)>\nOtra frase.");
  await page.locator("#flow-start").click();
  await expect(page.locator("#flow-phrase")).toContainText("<img src=x onerror");
  expect(await page.locator("#flow-phrase img").count()).toBe(0);
});
test("mobile: visible active controls have 44px targets and no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await open(page);
  await page.locator("#flow-start").click();
  const issues = await page.evaluate(() => {
    const ids = ["flow-breath", "flow-mid", "flow-next", "flow-mic-off", "flow-abort"];
    return ids.filter((id) => {
      const r = document.getElementById(id).getBoundingClientRect();
      return r.height < 44 || r.width < 44;
    });
  });
  expect(issues).toEqual([]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});
test("keyboard tabs cycle and never display two panels simultaneously", async ({ page }) => {
  await open(page);
  await page.locator("#flow-tab-day").focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.locator("#flow-tab-week")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#flow-day")).toBeHidden();
  await expect(page.locator("#flow-week")).toBeVisible();
  await page.keyboard.press("End");
  await expect(page.locator("#flow-tab-month")).toHaveAttribute("aria-selected", "true");
  await expect(page.locator("#flow-week")).toBeHidden();
});
