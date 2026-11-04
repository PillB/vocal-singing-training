// r9/storage killer for S2 (write() keeps a value in memory only for QuotaExceededError) and S3 (remove() has no try/catch).
// Drop-in for tests/. Goal (QA-47): a browser that will not let the site save must not stop the app, WHATEVER error it throws.
// storage-full.spec.js refuses setItem with QuotaExceededError only. The other way a browser says "no" is a SecurityError: Safari with
// all cookies blocked, Firefox with dom.storage disabled, a sandboxed iframe, a Chrome "block site data" policy. There even
// reading `window.localStorage` throws. The comment in js/storage.js lists "storage is switched off" as a case the code is for.
// Correct: the app boots with its cards, an exercise opens, a session can be saved, read back and cleared, nothing throws.
// Wrong (S2): only a quota error is caught, a SecurityError escapes write() out of ensureProfiles() and the catalog stays empty.
// Wrong (S3): remove() has no try/catch, so clearing a session throws where the storage is off (reading `localStorage` throws).
const { test, expect } = require("@playwright/test");

const CARDS = "[data-ex-id], .ex-card, .exercise-card, button.card";
const SESSION = { mode: "structured", track: "vocal", path: "basic", order: ["v1-breath-flow", "v2-lip-trill"], index: 1, status: "active", completedIds: ["v1-breath-flow"] };

// how: "setItem" = every vt_* setItem throws a SecurityError; "getter" = window.localStorage itself throws (storage switched off).
async function boot(page, how) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  await page.addInitScript((h) => {
    try {
      sessionStorage.setItem("vt_e2e", "1");
      localStorage.setItem("vt_tour_v1", "1");
    } catch { /* blocked */ }
    const deny = () => new DOMException("The operation is insecure.", "SecurityError");
    if (h === "setItem") {
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (String(k).startsWith("vt_") && k !== "vt_tour_v1") throw deny();
        return real.call(this, k, v);
      };
    } else if (h === "getter") {
      Object.defineProperty(window, "localStorage", { configurable: true, get() { throw deny(); } });
    }
  }, how);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp, null, { timeout: 10000 });
  return errors;
}

for (const how of ["setItem", "getter"]) {
  test(`storage refused by a SecurityError (${how}): the app boots, opens an exercise and throws nothing`, async ({ page }) => {
    const errors = await boot(page, how);
    await expect.poll(() => page.locator(CARDS).count(), { timeout: 8000 }).toBeGreaterThan(3);
    await page.evaluate((sel) => document.querySelector(sel).click(), CARDS);
    await page.waitForTimeout(500);
    expect(errors).toEqual([]);
  });
}

test("storage refused by a SecurityError on every write: a session is read back for the life of the page, then cleared", async ({ page }) => {
  await boot(page, "setItem");
  const r = await page.evaluate((s) => {
    try {
      VTStorage.setSession(s);
      const kept = VTStorage.getSession();
      VTStorage.setSession(null);
      return { ok: true, kept: kept && kept.index, after: VTStorage.getSession() };
    } catch (e) { return { ok: false, err: String(e.message) }; }
  }, SESSION);
  expect(r).toEqual({ ok: true, kept: 1, after: null });
});

test("storage switched off (localStorage itself throws): saving and then clearing a session does not throw, the page reads none", async ({ page }) => {
  await boot(page, "getter");
  const r = await page.evaluate((s) => {
    try {
      VTStorage.setSession(s);
      VTStorage.setSession(null);
      return { ok: true, after: VTStorage.getSession() };
    } catch (e) { return { ok: false, err: String(e.message) }; }
  }, SESSION);
  expect(r).toEqual({ ok: true, after: null });
});
