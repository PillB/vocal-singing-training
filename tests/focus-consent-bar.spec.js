/**
 * QA ui-b. The EU consent bar (js/region-gate.js, position:fixed bottom, z-index 2147483000) never hides a focused control.
 *
 * Goal behaviour (WCAG 2.2 2.4.11): Tab to a control and it is at least partly visible; the bar must not swallow Start, the mic
 * slider, "Mostrar métricas" ... Wrong behaviour: the browser's focus scroll only knows scroll-padding-top; nothing keeps focus clear
 * of the bar, so at 390x844 (bar 203 px tall) Start is under it and at 1280x800 (bar 83 px) the two toggles are.
 * The bar is shown the way tests/region-gate.spec.js shows it (Madrid time zone, worker stubbed at events.test, askFirst verdict).
 * Expected value: the browser's hit test at the control's centre. Control: a bar planted over the whole page is reported.
 */
const { test, expect } = require("@playwright/test");
test.use({ bypassCSP: true, timezoneId: "Europe/Madrid", locale: "es-ES" });

async function openEu(page, vp) {
  await page.setViewportSize(vp);
  await page.route("https://events.test/**", (route) =>
    route.request().url().endsWith("/v1/geo")
      ? route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, country: "ES", placed: true, askFirst: true }) })
      : route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' })
  );
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
    } catch {}
    window.VT_ANALYTICS_ENDPOINT = "https://events.test/v1/events";
    Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
  });
  await page.goto("/");
  await page.waitForSelector("[data-region-consent]", { timeout: 8000 });
  await page.waitForFunction(() => !!window.VTApp?.openExercise);
}

const settle = () =>
  new Promise((res) => {
    let y = scrollY, still = 0;
    const t0 = performance.now();
    const tick = () => {
      still = scrollY === y ? still + 1 : 0;
      y = scrollY;
      if (still >= 6 || performance.now() - t0 > 2500) res();
      else requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });

async function walk(page, id, n) {
  await page.evaluate((x) => window.VTApp.openExercise(x), id);
  await page.evaluate(() => {
    document.activeElement?.blur();
    scrollTo({ top: 0, behavior: "instant" });
  });
  const bad = [];
  for (let i = 0; i < n; i++) {
    await page.keyboard.press("Tab");
    await page.evaluate(settle);
    const o = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el.closest("[data-region-consent]")) return null;
      const r = el.getBoundingClientRect();
      const x = r.left + r.width / 2;
      const y = r.top + r.height / 2;
      if (r.width < 1 || x < 0 || y < 0 || x >= innerWidth || y >= innerHeight) return null;
      const t = document.elementFromPoint(x, y);
      if (!t || ownsPoint(el, t)) return null;
      return t.closest("[data-region-consent]") ? (el.getAttribute("aria-label") || el.innerText || el.id).trim().slice(0, 28) : null;

      function ownsPoint(control, hit) {
        return hit === control || control.contains(hit) || hit.contains(control) || [...(control.labels || [])].some((l) => l.contains(hit));
      }
    });
    if (o) bad.push(o);
  }
  return [...new Set(bad)];
}

for (const vp of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 }
]) {
  test(`${vp.width}x${vp.height}: no Tab stop is under the EU consent bar`, async ({ page }) => {
    test.setTimeout(180000);
    await openEu(page, vp);
    const bad = [];
    for (const id of ["v2-volume", "s9-pitch-match", "v4-articulation-pen"]) {
      (await walk(page, id, 45)).forEach((c) => bad.push(`${id}: ${c}`));
    }
    expect(bad, bad.join("\n")).toEqual([]);
  });
}

test("control: the walk reports a control under a bar planted over the page", async ({ page }) => {
  await openEu(page, { width: 1280, height: 800 });
  await page.evaluate(() => {
    document.querySelector("[data-region-consent]")?.remove();
    const v = document.createElement("div");
    v.setAttribute("data-region-consent", "planted");
    v.style.cssText = "position:fixed;inset:0;z-index:2147483001";
    document.body.appendChild(v);
  });
  expect((await walk(page, "v2-volume", 8)).length).toBeGreaterThan(0);
});

// Added with the fix: the room kept for the bar goes when the bar does, and follows its height
test("the room kept for the bar follows its height and goes when it is answered", async ({ page }) => {
  await openEu(page, { width: 390, height: 844 });
  const room = () =>
    page.evaluate(() => ({
      bar: Math.ceil(document.querySelector("[data-region-consent]")?.getBoundingClientRect().height ?? 0),
      scrollPad: getComputedStyle(document.documentElement).scrollPaddingBottom,
      pad: getComputedStyle(document.documentElement).paddingBottom
    }));
  const shown = await room();
  expect(shown.bar, "control: the bar is showing").toBeGreaterThan(60);
  expect(parseInt(shown.scrollPad, 10)).toBe(shown.bar + 8);
  expect(parseInt(shown.pad, 10)).toBe(shown.bar + 8);
  await page.setViewportSize({ width: 1280, height: 800 });
  await expect.poll(async () => (await room()).bar).toBeLessThan(shown.bar);
  const wide = await room();
  expect(parseInt(wide.scrollPad, 10), "follows the narrower bar").toBe(wide.bar + 8);
  await page.locator("[data-region-accept]").click();
  await expect(page.locator("[data-region-consent]")).toHaveCount(0);
  const gone = await room();
  expect(gone.scrollPad === "auto" || parseInt(gone.scrollPad, 10) === 0, `scroll padding after: ${gone.scrollPad}`).toBe(true);
  expect(parseInt(gone.pad, 10), "no padding left behind").toBe(0);
});
