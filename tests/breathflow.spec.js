/**
 * BreathFlow behavioural contract. The oracle is the shared VTDays ledger,
 * not our own preview text: a save must add exactly one take and one day.
 * Run: npx playwright test tests/breathflow.spec.js --project=chromium
 */
const { test, expect } = require("@playwright/test");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
test.use({ timezoneId: "America/Lima", locale: "es-PE" });

async function open(page, { teach = false } = {}) {
  await page.clock.install({ time: new Date("2026-11-22T10:00:00-05:00") });
  await page.goto(BASE + "/breathflow.html");
  await expect(page.locator("#coach-stage")).toContainText("Hombros");
  await expect(page.locator("#flow-start")).toBeDisabled();
  if (!teach) {
    await page.locator("#coach-skip").click();
    await expect(page.locator("#flow-start")).toBeEnabled();
  }
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
test("first-use lesson teaches body and mouth before enabling Start", async ({ page }) => {
  await open(page, { teach: true });
  await expect(page.locator("#coach-demo")).toBeVisible();
  await expect(page.locator("#coach-finish")).toBeDisabled();
  await page.locator("#coach-next").click();
  await expect(page.locator("#coach-stage")).toContainText("costillas");
  await expect(page.locator("#coach-svg-desc")).toContainText("costillas");
  await page.locator("#coach-toggle").click();
  await expect(page.locator("#flow-coach")).toHaveAttribute("data-paused", "true");
  await page.locator("#coach-next").click();
  await page.locator("#coach-vowel").click();
  await expect(page.locator("#coach-vowel")).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator("#coach-caption")).toContainText("mandíbula");
  await page.locator("#coach-hiss").click();
  await expect(page.locator("#coach-svg-desc")).toContainText("encía");
  await page.locator("#coach-next").click();
  await expect(page.locator("#coach-stage")).toContainText("frase");
  await expect(page.locator("#coach-checks")).toBeVisible();
  await expect(page.locator("#coach-finish")).toBeDisabled();
  await page.locator("#coach-check-shoulders").check();
  await page.locator("#coach-check-ribs").check();
  await expect(page.locator("#coach-finish")).toBeDisabled();
  await page.locator("#coach-check-jaw").check();
  await expect(page.locator("#coach-finish")).toBeEnabled();
  await page.locator("#coach-finish").click();
  await expect(page.locator("#flow-start")).toBeEnabled();
  expect(await page.evaluate(() => window.VTBreathTeach.isReady())).toBe(true);
  await page.locator("#flow-start").click();
  await expect(page.locator("#flow-run-teach-hint")).toBeVisible();
  await page.locator("#flow-run-teach").click();
  await expect(page.locator("#coach-stage")).toContainText("frase");
});
test("teaching stage does not save any day, ask for a microphone or invent measured checkpoints", async ({ page }) => {
  await open(page, { teach: true });
  const initial = await page.evaluate(() => JSON.stringify(window.VTDays.read().days));
  await page.locator("#coach-next").click();
  await page.locator("#coach-next").click();
  await page.locator("#coach-play").click();
  await expect(page.locator("#coach-audio-status")).toContainText("sintética");
  await page.locator("#coach-prev").click();
  await expect(page.locator("#coach-stage")).toContainText("costillas");
  expect(await page.evaluate(() => JSON.stringify(window.VTDays.read().days))).toBe(initial);
  expect(await page.evaluate(() => window.VTBreathFlow.state().mic)).toBe("off");
});
test("reduced-motion and small landscape never hide tutorial controls or impose paced breathing", async ({ page }) => {
  await page.setViewportSize({ width: 844, height: 390 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await open(page, { teach: true });
  const data = await page.evaluate(() => {
    const tutorial = document.querySelector("#flow-coach");
    const a = document.querySelector("#coach-demo svg");
    const btn = document.querySelector("#coach-next").getBoundingClientRect();
    return { paused: tutorial.dataset.paused, overflow: document.documentElement.scrollWidth > innerWidth,
      diagramWidth: a.getBoundingClientRect().width, buttonHeight: btn.height };
  });
  expect(data.paused).toBe("true");
  expect(data.overflow).toBe(false);
  expect(data.diagramWidth).toBeGreaterThan(200);
  expect(data.buttonHeight).toBeGreaterThanOrEqual(44);
  await page.locator("#coach-next").click();
  await expect(page.locator("#coach-svg-desc")).toContainText("costillas");
});
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
  await page.locator("#flow-save").click();
  const diag = await page.evaluate(() => ({
    phase: window.VTBreathFlow.state().phase,
    notice: document.querySelector("#flow-notice")?.textContent || "",
    unsaved: window.VTStorage.isUnsaved(),
    day: window.VTDays.dayKey(),
    stored: !!window.VTStorage.getDays()?.days[window.VTDays.dayKey()]
  }));
  expect(diag.phase, JSON.stringify(diag)).toBe("done");
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
test("day/week/month and every main navigation view share a single calendar authority", async ({ page }) => {
  await open(page);
  await finish(page);
  await page.locator("#flow-comfort").selectOption("easy");
  await page.evaluate(() => {
    const button = document.getElementById("flow-save");
    button.click();
    button.click(); // adversarial rapid duplicate, within the same event-loop turn
  });
  await expect(page.locator("#flow-done")).toBeVisible();
  const baseline = await page.evaluate(() => {
    const D = window.VTDays, key = D.dayKey(), row = D.read().days[key];
    return { key, n: row.n, ex: row.ex.slice(), week: D.countDays(D.weekStart(key), key) };
  });
  expect(baseline.n).toBe(1);
  for (const period of ["day", "week", "month"]) {
    await page.locator("#flow-tab-" + period).click();
    await expect(page.locator("#flow-" + period)).toBeVisible();
    const actual = await page.evaluate(() => {
      const D = window.VTDays, k = D.dayKey(), row = D.read().days[k];
      return { n: row.n, ex: row.ex.slice() };
    });
    expect(actual).toEqual({ n: baseline.n, ex: baseline.ex });
  }
  await page.goto(BASE + "/index.html");
  for (const btn of ["btn-history", "btn-plan", "btn-nav-home"]) {
    await page.locator("#" + btn).click();
    expect(await page.evaluate(() => {
      const D = window.VTDays, k = D.dayKey(), row = D.read().days[k];
      return { n: row.n, ex: row.ex.slice() };
    })).toEqual({ n: baseline.n, ex: baseline.ex });
  }
  await page.goto(BASE + "/breathflow.html");
  await expect(page.locator("#flow-day")).toContainText("ya tienes un día");
  await page.locator("#flow-tab-week").click();
  await expect(page.locator("#flow-week")).toContainText("1 día");
  await page.locator("#flow-tab-month").click();
  await expect(page.locator("#flow-month")).toContainText("1 día");
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
