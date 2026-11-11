// @ts-check
/**
 * The admin page's "Diseños del sitio" card and the at-a-glance strip, against
 * the worker's real code on a real SQLite database (qa/admin/local-worker.mjs).
 *
 * The expected numbers are worked out here from the seed's own rule, by a
 * second, independent count: the worker sums rows in SQL, this file walks the
 * thirty made-up browsers one by one. A dashboard that double-counts, mixes
 * the two designs or reads the wrong window disagrees with it.
 */
const { test, expect } = require("@playwright/test");
const path = require("path");
const { pathToFileURL } = require("url");
const { patchBillingConfig } = require("./helpers/billing");
const { tapFloorLimit } = require("./helpers/tap-floor");

// The worker is stood in for at a fake host the page's Content Security Policy
// rightly refuses (tests/csp.spec.js tests the policy against the real host).
test.use({ bypassCSP: true });

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://entitlements.test";

let modPromise = null;
function localWorkerModule() {
  modPromise = modPromise || import(pathToFileURL(path.join(__dirname, "..", "qa", "admin", "local-worker.mjs")).href);
  return modPromise;
}

/** What the seed sends, counted the slow way. `days` is the window read. */
function model(now, days) {
  const dayOf = (back) => new Date((now - back * 86400) * 1000).toISOString().slice(0, 10);
  const since = dayOf(days - 1);
  const out = {
    a: { sessions: 0, seconds: 0, cids: new Set() },
    b: { sessions: 0, seconds: 0, cids: new Set() },
    ab: 0,
    ba: 0,
    daily: new Map()
  };
  for (let i = 0; i < 30; i++) {
    const choosesB = i % 3 === 0;
    const goesBack = i % 9 === 0;
    const visits = 1 + (i % 4);
    for (let v = 0; v < visits; v++) {
      const day = dayOf(13 - ((i + v * 3) % 14));
      if (day < since) continue;
      const onB = choosesB && v > 0 && !(goesBack && v > 1);
      const ver = onB ? "b" : "a";
      const sec = 90 + ((i * 37 + v * 53) % 600);
      out[ver].sessions += 1;
      out[ver].seconds += sec;
      out[ver].cids.add(i);
      const key = `${day},${ver}`;
      const cell = out.daily.get(key) || { sessions: 0, seconds: 0 };
      cell.sessions += 1;
      cell.seconds += sec;
      out.daily.set(key, cell);
      if (choosesB && v === 1) out.ab += 1;
      if (goesBack && v === 2) out.ba += 1;
    }
  }
  return out;
}

async function startWorker(seed) {
  const { createLocalWorker, seedStats } = await localWorkerModule();
  const worker = await createLocalWorker({ origin: BASE, admins: "admin@example.com" });
  const admin = await worker.signIn("admin@example.com", { displayName: "Admin" });
  if (seed) await seedStats(worker);
  return { worker, admin };
}

/**
 * @param {import('@playwright/test').Page} page Page.
 * @param {Object} worker Local worker.
 * @param {Object|null} session Session to hold.
 * @param {{lang?: string, oldWorker?: boolean}} [options] Language; an old worker has no layouts route.
 */
async function wire(page, worker, session, options) {
  const opts = options || {};
  await patchBillingConfig(page, { verification: { apiBaseUrl: API, publicKeyJwk: worker.publicKeyJwk, required: true } });
  await page.addInitScript(
    ({ rec, lang }) => {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", lang);
      if (sessionStorage.getItem("vt_admin_e2e")) return;
      sessionStorage.setItem("vt_admin_e2e", "1");
      if (rec) localStorage.setItem("vt_account_session_v1", JSON.stringify(rec));
      else localStorage.removeItem("vt_account_session_v1");
    },
    { rec: session ? { token: session.token, expiresAt: session.expiresAt } : null, lang: opts.lang || "es" }
  );
  await page.route("https://accounts.google.com/**", (route) => route.abort("failed"));
  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (opts.oldWorker && url.pathname === "/v1/admin/layouts") {
      // What the worker deployed before this change answers for a route it does not have.
      await route.fulfill({
        status: 404,
        headers: { "content-type": "application/json", "access-control-allow-origin": BASE },
        body: JSON.stringify({ ok: false, reason: "not_found" })
      });
      return;
    }
    const headers = { ...request.headers() };
    if (!headers.origin) headers.origin = BASE;
    const method = request.method();
    const response = await worker.fetch(
      new Request(request.url(), {
        method,
        headers,
        body: method === "GET" || method === "HEAD" ? undefined : request.postDataBuffer() || undefined
      })
    );
    const out = {};
    response.headers.forEach((value, key) => {
      out[key] = value;
    });
    await route.fulfill({ status: response.status, headers: out, body: Buffer.from(await response.arrayBuffer()) });
  });
}

async function openAdmin(page, worker, session, options) {
  await wire(page, worker, session, options);
  await page.goto(`${BASE}/admin.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).not.toHaveAttribute("data-gate", "checking", { timeout: 10000 });
}

/** The big number of one stat in one design's tile, by its position. */
function statOf(page, ver, index) {
  return page.locator(`.lay-tile[data-ver="${ver}"] .lay-stat`).nth(index).locator("strong");
}

test.describe("Admin: the site designs card", () => {
  test("the tiles, the switches and the CSV carry the seed's own counts for the window read", async ({ page }) => {
    const { worker, admin } = await startWorker(true);
    await openAdmin(page, worker, admin);
    await page.click("#layouts-load");
    await expect(page.locator(".lay-tile")).toHaveCount(2);

    const want = model(worker.now(), 28);
    // The seed must exercise both designs and both directions, or equal
    // numbers below would prove nothing.
    expect(want.a.sessions).toBeGreaterThan(want.b.sessions);
    expect(want.b.sessions).toBeGreaterThan(0);
    expect(want.ab).toBeGreaterThan(want.ba);
    expect(want.ba).toBeGreaterThan(0);

    for (const ver of ["a", "b"]) {
      await expect(statOf(page, ver, 0)).toHaveText(String(want[ver].sessions));
      await expect(page.locator(`.lay-tile[data-ver="${ver}"] .lay-stat`).nth(0).locator(".lay-sub")).toHaveText(
        `${want[ver].cids.size} navegadores`
      );
      const shown = await page.evaluate((sec) => window.VTAdminLayouts.duration(sec), want[ver].seconds);
      await expect(statOf(page, ver, 1)).toHaveText(shown);
    }
    // The duration is words for a length of time, not a clock.
    expect(await page.evaluate(() => [3725, 754, 40].map((s) => window.VTAdminLayouts.duration(s)))).toEqual([
      "1 h 2 min",
      "12 min",
      "40 s"
    ]);

    // Switches: one row per direction, with how many times.
    const rows = await page.locator("#layouts-result .admin-table").nth(1).locator("tbody tr").allInnerTexts();
    const cells = rows.map((row) => row.split(/\t|\n/).map((c) => c.trim()).filter(Boolean));
    const ab = cells.find((c) => c[0] === "A · Clásico" && c[1] === "B · Enfocado");
    const ba = cells.find((c) => c[0] === "B · Enfocado" && c[1] === "A · Clásico");
    expect(ab && ab[2], JSON.stringify(cells)).toBe(String(want.ab));
    expect(ba && ba[2], JSON.stringify(cells)).toBe(String(want.ba));

    // The CSV: every day and design the seed touched, and nothing it did not.
    const [download] = await Promise.all([page.waitForEvent("download"), page.click("#layouts-csv")]);
    expect(download.suggestedFilename()).toBe("site-designs-28d.csv");
    const stream = await download.createReadStream();
    let csv = "";
    for await (const chunk of stream) csv += chunk;
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("day,design,visits,seconds");
    const got = new Map();
    lines.slice(1).forEach((line) => {
      const [day, ver, sessions, seconds] = line.split(",");
      if (Number(sessions) || Number(seconds)) got.set(`${day},${ver}`, { sessions: Number(sessions), seconds: Number(seconds) });
    });
    expect([...got.entries()].sort()).toEqual([...want.daily.entries()].sort());

    // The caution comes before the numbers, not after them.
    const order = await page.evaluate(() => {
      const box = document.getElementById("layouts-result");
      const caveat = box.querySelector(".lay-caveat");
      const tiles = box.querySelector(".lay-tiles");
      return !!(caveat.compareDocumentPosition(tiles) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(order).toBe(true);
  });

  test("a shorter window leaves out what arrived before it, and the chip says which window is on", async ({ page }) => {
    // The window is by when the server received a visit. Everything in the
    // seed arrives ten days ago; one more visit on design B arrives today.
    const { createLocalWorker, seedStats } = await localWorkerModule();
    const today = Math.floor(Date.now() / 1000);
    let at = today - 10 * 86400;
    const worker = await createLocalWorker({ origin: BASE, admins: "admin@example.com", now: () => at });
    await seedStats(worker);
    at = today;
    const day = new Date(today * 1000).toISOString().slice(0, 10);
    const sent = await worker.fetch(
      new Request("http://worker.local/v1/events", {
        method: "POST",
        headers: { origin: BASE, "content-type": "text/plain;charset=UTF-8", "user-agent": "Mozilla/5.0 (X11; Linux x86_64) Chrome/129.0 Safari/537.36" },
        body: JSON.stringify({ events: [{ name: "layout_session", cid: "sbxtoday1", day, tz: 300, props: { ver: "b", src: "chosen", n: 1 } }] })
      })
    );
    expect((await sent.json()).accepted).toBe(1);
    const admin = await worker.signIn("admin@example.com", { displayName: "Admin" });
    await openAdmin(page, worker, admin);
    await page.click("#layouts-load");
    const all = model(today - 10 * 86400, 28);
    await expect(statOf(page, "a", 0)).toHaveText(String(all.a.sessions));
    await expect(statOf(page, "b", 0)).toHaveText(String(all.b.sessions + 1));
    await page.click('#layouts [data-lwindow="7"]');
    await expect(page.locator('#layouts [data-lwindow="7"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('#layouts [data-lwindow="28"]')).toHaveAttribute("aria-pressed", "false");
    await expect(statOf(page, "b", 0)).toHaveText("1");
    await expect(statOf(page, "a", 0)).toHaveText("0");
  });

  test("a server from before this change: the card says to redeploy, and the strip says so without a press", async ({ page }) => {
    const { worker, admin } = await startWorker(true);
    await openAdmin(page, worker, admin, { oldWorker: true });
    await expect(page.locator("#glance-list li").filter({ hasText: "Lectura de diseños" })).toContainText("servidor antiguo");
    await expect(page.locator("#glance-list li").filter({ hasText: "Servidor" }).first()).toContainText("activo");
    await page.click("#layouts-load");
    const message = page.locator("#layouts-result .admin-message");
    await expect(message).toHaveAttribute("data-tone", "error");
    await expect(message).toContainText("volver a desplegarlo");
    await expect(page.locator(".lay-tile")).toHaveCount(0);
    await expect(page.locator("#layouts-load")).toBeEnabled();
  });

  test("a current server shows the reading as ready in the strip", async ({ page }) => {
    const { worker, admin } = await startWorker(false);
    await openAdmin(page, worker, admin);
    await expect(page.locator("#glance-list li").filter({ hasText: "Lectura de diseños" })).toHaveAttribute("data-tone", "on");
  });

  test("no visits yet: it says why there may be none and still shows how to read it", async ({ page }) => {
    const { worker, admin } = await startWorker(false);
    await openAdmin(page, worker, admin);
    await page.click("#layouts-load");
    await expect(page.locator("#layouts-result")).toContainText("Todavía no llegó ninguna visita");
    await expect(page.locator(".lay-caveat")).toBeVisible();
    await expect(page.locator(".lay-tile")).toHaveCount(0);
  });

  test("someone who is not an admin never sees the card, and nothing is read for them", async ({ page }) => {
    const { worker } = await startWorker(true);
    const visitor = await worker.signIn("visitor@example.com", { displayName: "Visitor" });
    const asked = [];
    page.on("request", (r) => {
      if (r.url().includes("/v1/admin/layouts")) asked.push(r.url());
    });
    await openAdmin(page, worker, visitor);
    await expect(page.locator("#layouts")).toBeHidden();
    await expect(page.locator("#glance-list li")).toHaveCount(0);
    expect(asked).toEqual([]);
    // And the worker itself refuses the read, whatever the page does.
    const status = await page.evaluate(async () => (await window.VTAccount.request("GET", "/v1/admin/layouts?days=28")).status);
    expect(status).toBe(403);
  });

  test("English: the card, the tiles and the strip change language together", async ({ page }) => {
    const { worker, admin } = await startWorker(true);
    await openAdmin(page, worker, admin);
    await page.click("#layouts-load");
    await expect(page.locator(".lay-tile")).toHaveCount(2);
    await page.click("#admin-lang");
    await expect(page.locator("#layouts-title")).toHaveText("Site designs");
    await expect(page.locator('.lay-tile[data-ver="b"] h3')).toHaveText("B · Focused");
    await expect(page.locator("#glance-list")).toContainText("Server");
    await expect(page.locator("#layouts-result")).not.toContainText("Visitas");
  });

  test("390px phone: the dashboard fits the screen and every control clears 44px", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, bypassCSP: true });
    const page = await context.newPage();
    const { worker, admin } = await startWorker(true);
    await openAdmin(page, worker, admin);
    await page.locator("#layouts-load").scrollIntoViewIfNeeded();
    await page.click("#layouts-load");
    await expect(page.locator(".lay-tile")).toHaveCount(2);
    const floor = tapFloorLimit(44);
    const report = await page.evaluate((floor) => {
      const out = [];
      const vw = document.documentElement.clientWidth;
      if (document.documentElement.scrollWidth > vw + 1) out.push(`the page scrolls sideways by ${document.documentElement.scrollWidth - vw}px`);
      document.querySelectorAll("#layouts button, #layouts summary").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (!r.width) return;
        if (r.height < floor || r.width < floor) out.push(`"${el.textContent.trim()}" is ${Math.round(r.width)}x${Math.round(r.height)}`);
      });
      document.querySelectorAll("#layouts .lay-tile, #layouts .lay-chart, #layouts .lay-share, #layouts .lay-caveat").forEach((el) => {
        const r = el.getBoundingClientRect();
        if (r.left < -0.5 || r.right > vw + 0.5) out.push(`${el.className} is cut off (${Math.round(r.left)}..${Math.round(r.right)} of ${vw})`);
      });
      return out;
    }, floor);
    expect(report).toEqual([]);
    await context.close();
  });
});
