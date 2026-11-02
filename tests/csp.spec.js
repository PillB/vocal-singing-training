/**
 * The Content Security Policy in the browser (QA-06). Two sides, both needed:
 * - The policy blocks: injected markup cannot run an inline handler or an
 *   inline script. Without the policy both run (that is the control).
 * - The policy does not break the app: no violation while each page loads and
 *   while a learner practises, opens the piano, rates and opens the account
 *   panel. A violation here is a feature the policy silently switched off.
 */
const { test, expect } = require("@playwright/test");
const { boot, openExercise } = require("./helpers/e2e");

/** Record every policy violation from the first byte of the page. */
function recordViolations() {
  window.__csp = [];
  document.addEventListener("securitypolicyviolation", (e) => {
    window.__csp.push({ directive: e.effectiveDirective, blocked: e.blockedURI, sample: e.sample, source: e.sourceFile });
  });
}

const violations = (page) => page.evaluate(() => window.__csp || []);

/** Inject what an XSS would: an inline handler and an inline script. */
const inject = (page) =>
  page.evaluate(async () => {
    const box = document.createElement("div");
    box.innerHTML = '<img src="data:," onerror="window.__handlerRan = true">';
    document.body.appendChild(box);
    const s = document.createElement("script");
    s.textContent = "window.__scriptRan = true;";
    document.body.appendChild(s);
    await new Promise((r) => setTimeout(r, 150));
    return { handler: !!window.__handlerRan, script: !!window.__scriptRan };
  });

test("injected inline handlers and scripts do not run, and the attempt is reported", async ({ page }) => {
  await page.addInitScript(recordViolations);
  await boot(page);
  expect(await inject(page)).toEqual({ handler: false, script: false });
  const seen = (await violations(page)).map((v) => v.directive);
  expect(seen).toContain("script-src-attr");
  expect(seen).toContain("script-src-elem");
});

test("control: without the policy the same injection runs", async ({ page }) => {
  // Serve index.html with its policy removed; everything else is the real app.
  await page.route(/\/(index\.html)?(\?.*)?$/, async (route) => {
    const res = await route.fetch();
    const body = (await res.text()).replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/, "");
    await route.fulfill({ response: res, body });
  });
  await boot(page);
  expect(await inject(page)).toEqual({ handler: true, script: true });
});

test("a learner's whole visit raises no violation: practise, piano, rate, account", async ({ page }) => {
  await page.addInitScript(recordViolations);
  await page.clock.install();
  await boot(page, { mic: "silent" });
  await openExercise(page, "s9-pitch-match");
  await page.locator("#btn-practice-start").click();
  await expect(page.locator("#btn-practice-stop")).toBeVisible();
  await page.clock.fastForward(16000);
  await page.locator("#btn-practice-stop").click();
  await page.locator('.rate-btn[data-feel="ok"]').click();
  await page.locator("#btn-back-home").click();
  await openExercise(page, "s2-solfege-chords");
  await page.locator("#btn-toggle-piano").click();
  await expect(page.locator("#piano-block")).toBeVisible();
  await page.locator("#btn-play-prog").click();
  await page.locator("#btn-back-home").click();
  await page.locator("#btn-account").click();
  await page.clock.fastForward(2000);
  expect(await violations(page)).toEqual([]);
});

for (const path of ["guide.html", "privacy.html", "admin.html"]) {
  test(`${path} loads with no violation`, async ({ page }) => {
    await page.addInitScript(recordViolations);
    await page.goto(path);
    await page.waitForLoadState("load");
    expect(await violations(page)).toEqual([]);
  });
}
