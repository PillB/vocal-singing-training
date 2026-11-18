/**
 * CXSS-2 (red team, Nov 2026): any origin could frame index.html and
 * admin.html. GitHub Pages sends no headers, so neither
 * `Content-Security-Policy: frame-ancestors` nor `X-Frame-Options` can be set,
 * and a <meta> CSP cannot carry frame-ancestors (CSP3: the directive is
 * ignored in a meta policy). Where storage is not partitioned (enterprise
 * policy, older browsers and webviews, Playwright's own default) the framed
 * copy holds the session, so an invisible frame could take an admin's or a
 * learner's click.
 *
 * What these tests reject: a page of the site that renders inside another
 * site's frame. The defence is a script, the first one each page runs
 * (js/boot-head.js, js/frame-guard.js): framed, the page hides itself before
 * it paints and asks the top window to load it instead. Browsers block that
 * second step from a cross-origin frame without a tap (Chrome since 2017's
 * framebusting intervention), so hiding is what holds; from a frame of the
 * same origin (another project on pillb.github.io) the top does move.
 *
 * The site is served at https://victim.test and the attacker at
 * https://attacker.test through routes, so both are real origins with the
 * pages' real CSP. Control: the same pages loaded on their own render.
 */
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const VICTIM = "https://victim.test";
const ATTACKER = "https://attacker.test";
const WORKER = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev";
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".webp": "image/webp", ".jpg": "image/jpeg", ".woff2": "font/woff2", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".webmanifest": "application/manifest+json" };
const PAGES = ["/", "/admin.html"];

/** An attacker's page: the site's pages in frames, made invisible as a clickjacker would. */
const lure = (origin) => `<!doctype html><title>prize</title>
  ${PAGES.map((p, i) => `<iframe id="f${i}" src="${origin}${p}" style="opacity:0.01;width:900px;height:600px"></iframe>`).join("")}`;

/** The repository as https://victim.test, the attacker's page on each origin, and a worker that knows nobody. */
async function serve(page) {
  await page.route(`${VICTIM}/**`, (route) => {
    const url = new URL(route.request().url());
    if (url.pathname === "/lure.html") return route.fulfill({ status: 200, contentType: "text/html", body: lure(VICTIM) });
    const rel = url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname.slice(1));
    const file = path.normalize(path.join(ROOT, rel));
    if (!file.startsWith(ROOT + path.sep) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
      return route.fulfill({ status: 404, body: "" });
    }
    return route.fulfill({ status: 200, contentType: TYPES[path.extname(file)] || "application/octet-stream", body: fs.readFileSync(file) });
  });
  await page.route(`${ATTACKER}/**`, (route) => route.fulfill({ status: 200, contentType: "text/html", body: lure(VICTIM) }));
  await page.route(`${WORKER}/**`, (route) => route.fulfill({ status: 404, contentType: "application/json", body: '{"ok":false}' }));
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      sessionStorage.setItem("vt_e2e", "1");
    } catch {
      /* a frame's storage may be refused; the assertions read the page, not storage */
    }
  });
}

/** What a frame shows: whether its root is laid out, and what a tap at its centre would hit. */
function shown(frame) {
  return frame.evaluate(() => {
    const hit = document.elementFromPoint(innerWidth / 2, innerHeight / 2);
    return {
      display: getComputedStyle(document.documentElement).display,
      hit: hit ? hit.tagName : null,
      started: !!(window.VTApp || window.VTAdmin || document.querySelector("#admin-main, #view-home"))
    };
  });
}

test.describe("CXSS-2: the site's pages do not render inside another site's frame", () => {
  test("IJ13 framed by another origin, index.html and admin.html hide before they paint", async ({ page }) => {
    await serve(page);
    await page.goto(`${ATTACKER}/`, { waitUntil: "load" });
    const frames = PAGES.map((p) => page.frames().find((f) => f.url() === VICTIM + p));
    expect(frames.every(Boolean), "control: both pages were loaded in the attacker's frames").toBe(true);
    for (const frame of frames) {
      await frame.waitForLoadState("load");
      const s = await shown(frame);
      expect(s.started, `control: ${frame.url()} is the site's page, its own markup and scripts`).toBe(true);
      expect(s.display, `${frame.url()} is not laid out in a foreign frame`).toBe("none");
      expect(s.hit, `a tap on ${frame.url()} in a foreign frame lands on nothing of it`).toBeNull();
    }
    // The browser kept the top where it was (no tap, cross-origin): the hiding is what held
    expect(page.url()).toBe(`${ATTACKER}/`);
  });

  test("IJ14 framed by a page of the same origin, the top window is sent to the page itself", async ({ page }) => {
    await serve(page);
    // Another project on the same origin (pillb.github.io is shared) framing the app
    await page.goto(`${VICTIM}/lure.html`, { waitUntil: "domcontentloaded" });
    await page.waitForURL((url) => PAGES.some((p) => url.href === VICTIM + p), { timeout: 15000 });
    await page.waitForLoadState("load");
    const s = await shown(page.mainFrame());
    expect(s.display, "loaded on its own, the page is laid out").not.toBe("none");
  });

  test("IJ15 control: on their own, at the same origin, both pages render and start", async ({ page }) => {
    await serve(page);
    for (const p of PAGES) {
      await page.goto(VICTIM + p, { waitUntil: "load" });
      const s = await shown(page.mainFrame());
      expect(s.display, `${p} top-level is laid out`).not.toBe("none");
      expect(s.hit, `${p} top-level answers a tap`).not.toBeNull();
      expect(s.started).toBe(true);
    }
    await page.goto(VICTIM + "/", { waitUntil: "load" });
    await page.waitForFunction(() => !!window.VTApp?.setTab, null, { timeout: 15000 });
    await expect(page.locator("#exercise-list .card-ex").first()).toBeVisible();
  });
});
