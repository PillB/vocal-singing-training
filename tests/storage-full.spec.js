// QA-47. localStorage that refuses writes (the site's 5 MB is full, storage is switched off, an old Safari private window)
// must not stop the app booting. pillb.github.io is ONE origin for every project page of the account, so its quota is shared.
// Correct: the home screen renders its cards, an exercise opens, a language switch works, nothing throws, what the page
// writes is read back for the life of the page, and the learner is told once that nothing will survive a reload.
// Wrong: storage.js write() had no try/catch, ensureProfiles() writes the default profile on the first read, the exception
// escaped init and the catalog stayed empty (0 cards; VTApp existed).
// Controls: a clean boot, and refusing only a key whose writer already copes (vt_analytics_v1, vt_mic_sens), are green, which
// proves the key that mattered is vt_profiles_v1 and that the spec can tell a survivable write from a fatal one.
// Adopted from the QA thread (vibe/storage-full.spec.js), extended with the read-back, the removal, the recovery and the notice.
const { test, expect } = require("@playwright/test");

const CARDS = "[data-ex-id], .ex-card, .exercise-card, button.card";

async function boot(page, refuse, { notice = false, late = false } = {}) {
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e.message)));
  await page.addInitScript(
    ([r, withNotice, refuseFromStart]) => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        sessionStorage.setItem("vt_e2e", "1");
        // vt_debug lets the toast through the e2e quiet mode
        if (withNotice) sessionStorage.setItem("vt_debug", "1");
      } catch {
        /* blocked */
      }
      if (!r) return;
      window.__refuse = refuseFromStart;
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        const key = String(k);
        const hit = key.startsWith("vt_") && key !== "vt_tour_v1" && (r === "all" || key === r);
        if (hit && window.__refuse) throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
        return real.call(this, k, v);
      };
    },
    [refuse, notice, !late]
  );
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 503, body: "{}" }));
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp, null, { timeout: 10000 });
  return errors;
}

for (const [name, refuse] of [
  ["control: nothing refused", null],
  ["control: only vt_analytics_v1 refused", "vt_analytics_v1"],
  ["control: only vt_mic_sens refused", "vt_mic_sens"],
  ["every vt_* write refused (storage full)", "all"],
  ["only the profiles refused (the key that stopped the boot)", "vt_profiles_v1"]
]) {
  test(`${name}: the app boots, opens an exercise and switches language without an error`, async ({ page }) => {
    const errors = await boot(page, refuse);
    await expect.poll(() => page.locator(CARDS).count(), { timeout: 8000 }).toBeGreaterThan(3);
    await page.evaluate((sel) => document.querySelector(sel).click(), CARDS);
    await page.waitForTimeout(500);
    await page.evaluate(() => window.VTApp.setLang && window.VTApp.setLang("en"));
    await page.waitForTimeout(300);
    expect(errors).toEqual([]);
  });
}

const SESSION = { mode: "structured", track: "vocal", path: "basic", order: ["v1-breath-flow", "v2-lip-trill"], index: 1, status: "active", completedIds: ["v1-breath-flow"] };

test("a value the browser refused is read back, and removed, for the life of the page", async ({ page }) => {
  await boot(page, "all");
  const r = await page.evaluate((s) => {
    VTStorage.setSession(s);
    const kept = VTStorage.getSession();
    const inBrowser = localStorage.getItem("vt_session_v1");
    VTStorage.setSession(null);
    return { kept: kept && { index: kept.index, order: kept.order }, inBrowser, afterClear: VTStorage.getSession(), unsaved: VTStorage.isUnsaved() };
  }, SESSION);
  expect(r.kept, "what the page just saved is what it reads").toEqual({ index: 1, order: SESSION.order });
  expect(r.inBrowser, "control: the browser really refused it").toBeNull();
  expect(r.afterClear, "removing it removes the kept copy too").toBeNull();
  expect(r.unsaved).toBe(true);
});

test("when the browser accepts writes again, they go back to it and the kept copy is dropped", async ({ page }) => {
  await boot(page, "all");
  const r = await page.evaluate((s) => {
    VTStorage.setSession({ ...s, index: 0 });
    window.__refuse = false;
    VTStorage.setSession(s);
    const stored = JSON.parse(localStorage.getItem("vt_session_v1") || "null");
    const readIndex = VTStorage.getSession()?.index;
    window.__refuse = true;
    VTStorage.setSession(null);
    return { storedIndex: stored && stored.index, readIndex, after: VTStorage.getSession() };
  }, SESSION);
  expect(r.storedIndex, "the accepted write is in the browser").toBe(1);
  expect(r.readIndex, "and it is what the page reads, not the older copy it kept while the browser refused").toBe(1);
  expect(r.after).toBeNull();
});

test("the learner is told once that nothing will survive a reload", async ({ page }) => {
  await boot(page, "all", { notice: true });
  await expect(page.locator("#toast")).toHaveClass(/show/);
  await expect(page.locator("#toast")).toContainText(/no deja guardar|won't let the site save/);
  expect(await page.evaluate(() => document.documentElement.dataset.storage)).toBe("memory");
  // A second refusal says nothing new: one notice per page
  await page.evaluate(() => {
    document.getElementById("toast").classList.remove("show");
    document.getElementById("toast").textContent = "";
    VTStorage.setSession({ order: ["a"], index: 0 });
  });
  await page.waitForTimeout(300);
  await expect(page.locator("#toast")).not.toContainText(/no deja guardar|won't let the site save/);
});

test("a refusal that comes after the page has loaded is announced too", async ({ page }) => {
  await boot(page, "all", { notice: true, late: true });
  await page.waitForTimeout(500);
  await expect(page.locator("#toast")).not.toContainText(/no deja guardar|won't let the site save/);
  await page.evaluate(() => {
    window.__refuse = true;
    VTStorage.setSession({ order: ["a"], index: 0 });
  });
  await expect(page.locator("#toast")).toContainText(/no deja guardar|won't let the site save/);
  expect(await page.evaluate(() => document.documentElement.dataset.storage)).toBe("memory");
});

test("control: with storage working there is no notice and no marker", async ({ page }) => {
  await boot(page, null, { notice: true });
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => document.documentElement.dataset.storage)).toBeUndefined();
  expect(await page.evaluate(() => VTStorage.isUnsaved())).toBe(false);
  await expect(page.locator("#toast")).not.toContainText(/no deja guardar|won't let the site save/);
});
