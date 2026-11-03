// r9/storage killer for S6 (analytics write() loses its try/catch). Drop-in for tests/.
// Goal: analytics is best effort. A browser that refuses the write of the local event log (the 5 MB the whole origin shares is full,
// QA-47) must not make track() throw, and must not stop the event from reaching the worker: track() writes the log BEFORE it queues
// the event for the worker, so a write that throws silences the funnel for exactly the people whose storage is full.
// storage-full.spec.js's control "only vt_analytics_v1 refused" passes with the guard removed because every caller of track() wraps it
// in its own try/catch, and the spec only listens for page errors.
// Right: track() returns without throwing and the event is POSTed to the endpoint.
// Wrong: track() throws QuotaExceededError and nothing is sent.
const { test, expect } = require("@playwright/test");

// Lima, as ab-events.spec.js: the container's own zone (UTC) is read by the region gate as "ask first", which holds events in memory
test.use({ bypassCSP: true, timezoneId: "America/Lima", locale: "es-PE" });

const ENDPOINT = "https://events.test/v1/events";

async function boot(page, refuse) {
  const bodies = [];
  await page.route("https://events.test/**", async (route) => {
    try { bodies.push(JSON.parse(route.request().postData() || "null")); } catch { bodies.push(null); }
    await route.fulfill({ status: 200, contentType: "application/json", body: '{"ok":true}' });
  });
  await page.addInitScript(([endpoint, r]) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
    } catch { /* blocked */ }
    window.VT_ANALYTICS_ENDPOINT = endpoint;
    // Playwright's browser is "automated", which the client rightly refuses to send from: present a person's browser
    Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
    if (r) {
      const real = Storage.prototype.setItem;
      Storage.prototype.setItem = function (k, v) {
        if (String(k) === "vt_analytics_v1") throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
        return real.call(this, k, v);
      };
    }
  }, [ENDPOINT, refuse]);
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTAnalytics, null, { timeout: 10000 });
  return bodies;
}

const sentNames = (bodies) => bodies.flatMap((b) => ((b && b.events) || []).map((e) => e.name));

for (const [name, refuse] of [["control: the log accepts the write", false], ["the log's write is refused (quota full)", true]]) {
  test(`${name}: track() does not throw and the event is sent to the worker`, async ({ page }) => {
    const bodies = await boot(page, refuse);
    const r = await page.evaluate(() => {
      try {
        window.VTAnalytics.track("qa_r9_probe", {});
        window.VTAnalytics.flush(false);
        return { ok: true };
      } catch (e) { return { ok: false, err: String(e.message) }; }
    });
    expect(r).toEqual({ ok: true });
    await expect.poll(() => sentNames(bodies), { timeout: 5000 }).toContain("qa_r9_probe");
  });
}
