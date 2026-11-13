/**
 * QA round 4 (csp): gaps in tests/csp.spec.js, each written to go RED when the defect returns.
 * Drop into tests/ of the repo. Every test names the wrong behaviour it rejects.
 *
 *  T1 each page enforces its own policy (guide/privacy/admin were only checked for "no violation",
 *     which a page whose policy is not in effect satisfies).
 *  T2 Google's sign-in client as Google loads it: stylesheet from /gsi/style, iframe from /gsi/button,
 *     a call to /gsi/ (frame-src / style-src / connect-src for Google were never driven offline).
 *  T3 a recorded take plays back (blob: audio; media-src was never driven: no recording was made).
 *  T4 the path a human takes and an automated browser skips: geo lookup, consent bar, analytics flush
 *     (tests/csp.spec.js runs with vt_e2e=1, where region-gate and analytics do nothing).
 */
const { test, expect } = require("@playwright/test");
const { openExercise } = require("./helpers/e2e");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const WORKER = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev";

function recordViolations() {
  window.__csp = [];
  document.addEventListener("securitypolicyviolation", (e) => {
    window.__csp.push(`${e.effectiveDirective}|${e.blockedURI}`);
  });
}
const violations = (page) => page.evaluate(() => window.__csp || []);

const cors = (route) => ({
  "access-control-allow-origin": route.request().headers()["origin"] || "*",
  "access-control-allow-headers": "content-type, authorization",
  "access-control-allow-methods": "GET, POST, OPTIONS",
  vary: "Origin"
});

/** The worker, stubbed at the network layer (after the policy has decided, so a blocked call never reaches it). */
async function stubWorker(page, { geo = "PE", google = false } = {}) {
  const seen = [];
  await page.route(`${WORKER}/**`, async (route) => {
    const req = route.request();
    const p = new URL(req.url()).pathname;
    seen.push(`${req.method()} ${p}`);
    if (req.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors(route) });
    const json = (o) => route.fulfill({ status: 200, contentType: "application/json", headers: cors(route), body: JSON.stringify(o) });
    if (p === "/v1/auth/methods") return json({ ok: true, email: false, google, googleClientId: google ? "test.apps.googleusercontent.com" : null, trialDays: 30 });
    if (p === "/v1/geo") return json({ ok: true, country: geo, placed: true, askFirst: geo === "DE" });
    if (p.startsWith("/v1/events")) return route.fulfill({ status: 204, headers: cors(route) });
    return route.fulfill({ status: 404, contentType: "application/json", headers: cors(route), body: '{"ok":false}' });
  });
  return seen;
}

/** A visitor as the app sees a human: no webdriver flag, no e2e marker (so geo, consent and analytics run). */
async function visit(page, { mic = "tone", path = "/" } = {}) {
  await page.addInitScript(recordViolations);
  await page.addInitScript((m) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
    } catch {
      /* ignore */
    }
    Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
    const AC = window.AudioContext || window.webkitAudioContext;
    if (navigator.mediaDevices && AC) {
      navigator.mediaDevices.getUserMedia = async () => {
        const c = new AC();
        const dest = c.createMediaStreamDestination();
        const osc = c.createOscillator();
        const g = c.createGain();
        g.gain.value = m === "tone" ? 0.05 : 0.00001;
        osc.frequency.value = 220;
        osc.connect(g);
        g.connect(dest);
        osc.start();
        return dest.stream;
      };
    }
  }, mic);
  await page.context().grantPermissions(["microphone"]).catch(() => {});
  await page.goto(BASE + path + (path.includes("?") ? "&" : "?") + "t=" + Date.now(), { waitUntil: "domcontentloaded" });
}

// Every page the site serves, the two #26 added included: the six qa/asset-versions.mjs lists.
const PAGES = ["/index.html", "/guide.html", "/privacy.html", "/admin.html", "/terms.html", "/qa/index.html"];

for (const path of PAGES) {
  test(`T1 ${path}: injected inline script, inline handler and foreign-origin script do not run`, async ({ page }) => {
    await page.route("https://evil.example/**", (r) => r.fulfill({ contentType: "text/javascript", body: "window.__foreign = true;" }));
    await page.addInitScript(recordViolations);
    await page.goto(BASE + path);
    await page.waitForLoadState("load");
    const ran = await page.evaluate(async () => {
      const f = document.createElement("script");
      f.src = "https://evil.example/x.js";
      document.head.appendChild(f);
      const s = document.createElement("script");
      s.textContent = "window.__inline = true;";
      document.body.appendChild(s);
      const d = document.createElement("div");
      d.innerHTML = '<img src="data:," onerror="window.__handler = true">';
      document.body.appendChild(d);
      await new Promise((r) => setTimeout(r, 400));
      return { foreign: !!window.__foreign, inline: !!window.__inline, handler: !!window.__handler };
    });
    expect(ran).toEqual({ foreign: false, inline: false, handler: false });
    const seen = await violations(page);
    expect(seen).toContain("script-src-elem|https://evil.example/x.js");
    expect(seen).toContain("script-src-elem|inline");
    expect(seen).toContain("script-src-attr|inline");
  });
}

test("T1 control: the same injection runs when the page has no policy (the instrument can tell)", async ({ page }) => {
  await page.route("https://evil.example/**", (r) => r.fulfill({ contentType: "text/javascript", body: "window.__foreign = true;" }));
  await page.route(/\/guide\.html$/, async (route) => {
    const res = await route.fetch();
    await route.fulfill({ response: res, body: (await res.text()).replace(/<meta\s+http-equiv="Content-Security-Policy"[^>]*>/, "") });
  });
  await page.goto(BASE + "/guide.html");
  const ran = await page.evaluate(async () => {
    const f = document.createElement("script");
    f.src = "https://evil.example/x.js";
    document.head.appendChild(f);
    await new Promise((r) => setTimeout(r, 400));
    return !!window.__foreign;
  });
  expect(ran).toBe(true);
});

test("T2 Google's sign-in client, loaded the way Google loads it, raises no violation", async ({ page }) => {
  const seen = await stubWorker(page, { google: true });
  const google = [];
  // What the real client does in this page (observed against https://accounts.google.com/gsi/client):
  // adds a stylesheet from /gsi/style, draws the button as an iframe from /gsi/button, and calls /gsi/.
  await page.route("https://accounts.google.com/gsi/client", (r) => {
    google.push("client");
    return r.fulfill({
      contentType: "text/javascript",
      body: `
      const l = document.createElement("link"); l.rel = "stylesheet"; l.href = "https://accounts.google.com/gsi/style"; document.head.appendChild(l);
      window.google = { accounts: { id: {
        initialize() {},
        renderButton(container) {
          const f = document.createElement("iframe"); f.src = "https://accounts.google.com/gsi/button?theme=outline"; container.appendChild(f);
          fetch("https://accounts.google.com/gsi/log", { mode: "no-cors" }).catch(() => {});
        } } } };`
    });
  });
  await page.route("https://accounts.google.com/gsi/style", (r) => {
    google.push("style");
    return r.fulfill({ contentType: "text/css", body: "" });
  });
  await page.route("https://accounts.google.com/gsi/button**", (r) => {
    google.push("button");
    return r.fulfill({ contentType: "text/html", body: "<title>button</title>" });
  });
  await page.route("https://accounts.google.com/gsi/log", (r) => {
    google.push("log");
    return r.fulfill({ status: 204 });
  });
  await visit(page);
  await page.locator("#btn-account").click();
  await expect.poll(() => google.slice().sort().join(), { timeout: 8000 }).toBe("button,client,log,style");
  expect(seen).toContain("GET /v1/auth/methods");
  expect(await violations(page)).toEqual([]);
});

test("T3 a recorded take plays back: the audio element loads its blob without a violation", async ({ page }) => {
  await stubWorker(page);
  await visit(page, { mic: "tone" });
  await page.waitForSelector("#btn-account");
  await openExercise(page, "v7-record-review");
  await page.locator("#btn-practice-start").click();
  await expect(page.locator("#btn-practice-stop")).toBeVisible();
  await page.waitForFunction(() => (document.querySelector("#practice-status")?.textContent || "").length > 0);
  await page.waitForTimeout(2200); // @allow-wait: a take must be long enough for the recorder to keep it
  await page.locator("#btn-practice-stop").click();
  const audio = page.locator("#playback-area audio");
  await expect(audio).toHaveCount(1, { timeout: 8000 });
  await expect
    .poll(() => audio.evaluate((a) => ({ error: a.error ? a.error.code : null, ready: a.readyState >= 1, blob: a.src.startsWith("blob:") })), { timeout: 8000 })
    .toEqual({ error: null, ready: true, blob: true });
  expect(await violations(page)).toEqual([]);
});

test("T4 a human visit: geo lookup, consent bar and an analytics flush raise no violation and all reach the worker", async ({ page }) => {
  const seen = await stubWorker(page, { geo: "DE" });
  await visit(page);
  await expect(page.locator("[data-region-consent] button").first()).toBeVisible({ timeout: 8000 });
  await page.locator("[data-region-consent] button").first().click(); // accept
  await page.evaluate(() => {
    window.VTAnalytics.track("csp_probe", {});
    return window.VTAnalytics.flush();
  });
  await expect.poll(() => seen.filter((s) => s === "GET /v1/geo").length).toBe(1);
  await expect.poll(() => seen.filter((s) => s === "POST /v1/events").length).toBeGreaterThan(0);
  expect(await violations(page)).toEqual([]);
});
