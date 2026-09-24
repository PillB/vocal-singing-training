/**
 * The admin page, against the real worker.
 *
 * Unlike tests/accounts.spec.js, nothing here is a stub: every request the page
 * makes is answered by the worker's own `handleRequest` running in this
 * process, on a real SQLite database (qa/admin/local-worker.mjs). So when a
 * test says "the tester loses Pro after a reload", the grant row really was
 * revoked, the licence really was re-signed or withheld, and the site really
 * checked the signature.
 *
 * Each procedure in docs/ADMIN-GUIDE.md has a test here with the same name.
 */
const { test, expect } = require("@playwright/test");
const path = require("path");
const { pathToFileURL } = require("url");
const { patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://entitlements.test";
const DAY = 86400;

/** @type {Promise<Object>} */
let modPromise = null;
function localWorkerModule() {
  modPromise =
    modPromise || import(pathToFileURL(path.join(__dirname, "..", "qa", "admin", "local-worker.mjs")).href);
  return modPromise;
}

/**
 * A fresh worker with an admin and a signed-in session for them.
 * @param {Object} [options] `createLocalWorker` options.
 */
async function startWorker(options) {
  const { createLocalWorker } = await localWorkerModule();
  const worker = await createLocalWorker({ origin: BASE, admins: "admin@example.com", ...(options || {}) });
  const admin = await worker.signIn("admin@example.com", { displayName: "Admin" });
  return { worker, adminToken: admin.token, admin };
}

/**
 * Point a page at the local worker and hold a session in its storage.
 * @param {import('@playwright/test').Page} page Page.
 * @param {Object} worker Local worker.
 * @param {{token?: string, expiresAt?: number}|null} session Session to hold, or null.
 * @param {{lang?: string, log?: Array}} [options] Language and a request log.
 */
async function wire(page, worker, session, options) {
  const opts = options || {};
  await patchBillingConfig(page, {
    verification: { apiBaseUrl: API, publicKeyJwk: worker.publicKeyJwk, required: true }
  });
  await page.addInitScript(
    ({ rec, lang }) => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", lang);
        const fresh = !sessionStorage.getItem("vt_admin_e2e");
        sessionStorage.setItem("vt_admin_e2e", "1");
        if (!fresh) return;
        localStorage.removeItem("vt_license_v1");
        localStorage.removeItem("vt_billing_v1");
        if (rec) localStorage.setItem("vt_account_session_v1", JSON.stringify(rec));
        else localStorage.removeItem("vt_account_session_v1");
      } catch {
        /* ignore */
      }
    },
    { rec: session ? { token: session.token, expiresAt: session.expiresAt } : null, lang: opts.lang || "es" }
  );
  // Google's script is the one thing the sandbox cannot provide.
  await page.route("https://accounts.google.com/**", (route) => route.abort("failed"));
  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const headers = { ...request.headers() };
    if (!headers.origin) headers.origin = BASE;
    const method = request.method();
    if (opts.log) opts.log.push({ method, path: new URL(request.url()).pathname });
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

/** Open the admin page as a given session and wait for it to settle. */
async function openAdmin(context, worker, session, options) {
  const page = await context.newPage();
  await wire(page, worker, session, options);
  await page.goto(`${BASE}/admin.html`, { waitUntil: "domcontentloaded" });
  await expect(page.locator("body")).not.toHaveAttribute("data-gate", "checking", { timeout: 10000 });
  return page;
}

/** Open the practice site as somebody, and report whether it verified Pro. */
async function openStudio(context, worker, session) {
  const page = await context.newPage();
  await wire(page, worker, session);
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTBilling && !!window.VTAccount);
  return page;
}

async function studioIsPro(page) {
  // Pro is decided by the licence signature check, after /v1/me answers.
  return page.evaluate(async () => {
    await window.VTAccount.refresh();
    return window.VTBilling.isPro();
  });
}

async function lookUp(page, email) {
  await page.fill("#lookup-email", email);
  await page.click("#lookup-submit");
  await expect(page.locator("#lookup-result")).not.toContainText(/Un momento|One moment/);
}

test.describe("Admin page", () => {
  test("signed out: offers admin sign-in, shows no tools, and calls no admin route", async ({ browser }) => {
    const { worker } = await startWorker();
    const context = await browser.newContext();
    const log = [];
    const page = await openAdmin(context, worker, null, { log });
    await expect(page.locator("body")).toHaveAttribute("data-gate", "signedOut");
    await expect(page.locator("#gate-signed-out")).toBeVisible();
    await expect(page.locator("#admin-tools")).toBeHidden();
    // Google's script is blocked here, so the page must say so and offer a way in.
    await expect(page.locator("#gate-google-fallback")).toBeVisible();
    await expect(page.locator("#gate-google-fallback a")).toHaveAttribute("href", "./");
    // The guide is reachable before anyone gets in.
    await expect(page.locator(".admin-guide-link a")).toBeVisible();
    expect(log.filter((r) => r.path.startsWith("/v1/admin"))).toEqual([]);
    await context.close();
  });

  test("an account server that is down reads as down, not as a blocked Google button", async ({ browser }) => {
    const { worker } = await startWorker();
    const context = await browser.newContext();
    const page = await context.newPage();
    await wire(page, worker, null);
    await page.route(`${API}/**`, (route) => route.abort("failed"));
    await page.goto(`${BASE}/admin.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toHaveAttribute("data-gate", "unreachable");
    await expect(page.locator("#gate-google-fallback")).toBeHidden();

    // Back up: Try again gets to sign-in.
    await page.unroute(`${API}/**`);
    await wire(page, worker, null);
    await page.click("#gate-retry");
    await expect(page.locator("body")).toHaveAttribute("data-gate", "signedOut");
    await context.close();
  });

  test("a worker that never answers leaves the page on Try again, not on Checking", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    const context = await browser.newContext();
    const page = await context.newPage();
    await wire(page, worker, admin);
    await page.route(`${API}/v1/me`, () => {
      /* hold the request forever */
    });
    await page.goto(`${BASE}/admin.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toHaveAttribute("data-gate", "unreachable", { timeout: 15000 });
    await context.close();
  });

  test("a member who is not on ADMIN_EMAILS sees no tools", async ({ browser }) => {
    const { worker } = await startWorker();
    const member = await worker.signIn("ana.tester@example.com");
    const context = await browser.newContext();
    const page = await openAdmin(context, worker, member);
    await expect(page.locator("body")).toHaveAttribute("data-gate", "notAdmin");
    await expect(page.locator("#gate-not-admin")).toContainText("ana.tester@example.com");
    await expect(page.locator("#admin-tools")).toBeHidden();
    // Switching language keeps saying who is signed in.
    await page.click("#admin-lang");
    await expect(page.locator("#gate-not-admin")).toContainText("Signed in as ana.tester@example.com");
    // And the server agrees, whatever the page draws.
    const direct = await worker.call("POST", "/v1/admin/grants", {
      token: member.token,
      body: { email: "ana.tester@example.com", days: 30 }
    });
    expect(direct.status).toBe(403);
    await context.close();
  });

  test("give Pro to a tester who has not signed in yet, then they sign in and have it", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    await expect(page.locator("body")).toHaveAttribute("data-gate", "admin");
    await expect(page.locator("#gate-admin-who")).toHaveText("admin@example.com");

    await page.fill("#give-email", "Ana.Tester@Example.com ");
    await page.click('.admin-chips [data-days="30"]');
    await page.fill("#give-note", "Beta ronda 1");
    await page.click("#give-submit");
    await expect(page.locator("#give-result")).toContainText("ana.tester@example.com tiene Pro hasta");
    await expect(page.locator("[data-testid=lookup-status]")).toContainText("Tiene Pro hasta");
    await expect(page.locator("[data-testid=lookup-status]")).toContainText("30 días más");
    await expect(page.locator("[data-testid=never-signed-in]")).toBeVisible();
    await expect(page.locator("[data-testid=grants-table] tbody tr")).toHaveCount(1);
    await expect(page.locator("[data-testid=grants-table] tbody tr").first()).toContainText("Beta ronda 1");

    // Ana signs in for the first time, on her own browser.
    const ana = await worker.signIn("ana.tester@example.com", { displayName: "Ana Tester" });
    const anaCtx = await browser.newContext();
    const studio = await openStudio(anaCtx, worker, ana);
    await expect.poll(() => studioIsPro(studio)).toBe(true);

    // Looking her up again now shows she has signed in.
    await lookUp(page, "ana.tester@example.com");
    await expect(page.locator("[data-testid=never-signed-in]")).toHaveCount(0);
    await expect(page.locator("#lookup-result")).toContainText("Entra con Google");
    await adminCtx.close();
    await anaCtx.close();
  });

  test("remove Pro: the tester loses it on their next load", async ({ browser }) => {
    const { worker, adminToken, admin } = await startWorker();
    const bruno = await worker.signIn("bruno.tester@example.com");
    await worker.call("POST", "/v1/admin/grants", {
      token: adminToken,
      body: { email: "bruno.tester@example.com", days: 30, note: "Beta" }
    });
    const brunoCtx = await browser.newContext();
    const studio = await openStudio(brunoCtx, worker, bruno);
    await expect.poll(() => studioIsPro(studio)).toBe(true);

    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    await lookUp(page, "bruno.tester@example.com");
    const row = page.locator("[data-testid=grants-table] tbody tr").first();
    await expect(row).toHaveAttribute("data-status", "active");

    // Saying no to the confirmation changes nothing.
    page.once("dialog", (dialog) => dialog.dismiss());
    await row.getByRole("button", { name: "Quitar acceso" }).click();
    await expect(row).toHaveAttribute("data-status", "active");

    let question = "";
    page.once("dialog", (dialog) => {
      question = dialog.message();
      dialog.accept();
    });
    await row.getByRole("button", { name: "Quitar acceso" }).click();
    await expect(page.locator("#lookup-result")).toContainText("se quitó el acceso");
    expect(question).toContain("bruno.tester@example.com");
    expect(question).toContain("hasta 3 días");
    expect(question).not.toContain("seguirá teniendo Pro");
    // The button is gone, so the reader is put on the outcome.
    await expect(page.locator("#lookup-result .admin-message")).toBeFocused();
    await expect(page.locator("[data-testid=lookup-status]")).toHaveText("Sin Pro ahora mismo");
    const revokedRow = page.locator("[data-testid=grants-table] tbody tr").first();
    await expect(revokedRow).toHaveAttribute("data-status", "revoked");
    await expect(revokedRow).toContainText("Quitado el");
    await expect(revokedRow.getByRole("button")).toHaveCount(0);

    // Bruno reloads: the worker hands out no licence, and the page drops the old one.
    await studio.reload({ waitUntil: "domcontentloaded" });
    await studio.waitForFunction(() => !!window.VTBilling);
    await expect.poll(() => studioIsPro(studio)).toBe(false);
    await adminCtx.close();
    await brunoCtx.close();
  });

  test("remove a free trial: it stays used, so no second trial is offered", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    const carla = await worker.signIn("carla@example.com");
    const trial = await worker.call("POST", "/v1/me/trial", { token: carla.token });
    expect(trial.status).toBe(200);

    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    await lookUp(page, "carla@example.com");
    await expect(page.locator("#lookup-result")).toContainText("Ya usó su mes de prueba");
    const row = page.locator("[data-testid=grants-table] tbody tr").first();
    await expect(row).toContainText("Prueba gratis");
    page.once("dialog", (dialog) => dialog.accept());
    await row.getByRole("button", { name: "Quitar acceso" }).click();
    await expect(page.locator("[data-testid=lookup-status]")).toHaveText("Sin Pro ahora mismo");

    const again = await worker.call("POST", "/v1/me/trial", { token: carla.token });
    expect(again.status).toBe(409);
    expect(again.body.reason).toBe("trial_used");
    await adminCtx.close();
  });

  test("give more days: a shorter gift never shortens access, and says so", async ({ browser }) => {
    const { worker, adminToken, admin } = await startWorker();
    await worker.call("POST", "/v1/admin/grants", {
      token: adminToken,
      body: { email: "diego@example.com", days: 90 }
    });
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    await page.fill("#give-email", "diego@example.com");
    await page.click('.admin-chips [data-days="7"]');
    await page.click("#give-submit");
    await expect(page.locator("#give-result")).toContainText("ya tenía acceso hasta");
    await expect(page.locator("[data-testid=lookup-status]")).toContainText("90 días más");
    await expect(page.locator("[data-testid=grants-table] tbody tr")).toHaveCount(2);

    // A longer one moves the end date.
    await page.fill("#give-email", "diego@example.com");
    await page.fill("#give-days", "120");
    await page.click("#give-submit");
    await expect(page.locator("#give-result")).toContainText("diego@example.com tiene Pro hasta");
    await expect(page.locator("[data-testid=lookup-status]")).toContainText("120 días más");
    await adminCtx.close();
  });

  test("removing one of two gifts warns that the other keeps them on Pro", async ({ browser }) => {
    const { worker, adminToken, admin } = await startWorker();
    await worker.call("POST", "/v1/admin/grants", { token: adminToken, body: { email: "diego@example.com", days: 30, note: "Uno" } });
    await worker.call("POST", "/v1/admin/grants", { token: adminToken, body: { email: "diego@example.com", days: 90, note: "Dos" } });
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    await lookUp(page, "diego@example.com");
    const shortRow = page.locator("[data-testid=grants-table] tbody tr", { hasText: "Uno" });
    let question = "";
    page.once("dialog", (dialog) => {
      question = dialog.message();
      dialog.accept();
    });
    await shortRow.getByRole("button", { name: "Quitar acceso" }).click();
    await expect(page.locator("#lookup-result")).toContainText("se quitó el acceso");
    expect(question).toContain("seguirá teniendo Pro por Regalo hasta el");
    await expect(page.locator("[data-testid=lookup-status]")).toContainText("90 días más");
    await adminCtx.close();
  });

  test("a gift whose answer is lost says it may be saved and shows the account", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    // The worker saves the gift; the answer never reaches the page.
    await page.route(`${API}/v1/admin/grants`, async (route) => {
      const request = route.request();
      await worker.fetch(
        new Request(request.url(), {
          method: request.method(),
          headers: { ...request.headers(), origin: BASE },
          body: request.postDataBuffer() || undefined
        })
      );
      await route.abort("failed");
    });
    await page.fill("#give-email", "ana.tester@example.com");
    await page.click("#give-submit");
    await expect(page.locator("#give-result")).toContainText("Puede que el regalo se haya guardado");
    await expect(page.locator("#lookup-email")).toHaveValue("ana.tester@example.com");
    await expect(page.locator("[data-testid=lookup-status]")).toContainText("Tiene Pro hasta");
    await expect(page.locator("[data-testid=grants-table] tbody tr")).toHaveCount(1);
    await adminCtx.close();
  });

  test("give Pro refuses a bad address or day count before calling the server", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    const log = [];
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin, { log });
    const before = log.length;
    await page.fill("#give-email", "not-an-email");
    await page.click("#give-submit");
    await expect(page.locator("#give-result")).toHaveText("Escribe un correo válido.");
    await page.fill("#give-email", "ok@example.com");
    await page.fill("#give-days", "0");
    await page.click("#give-submit");
    await expect(page.locator("#give-result")).toContainText("entre 1 y 3650");
    expect(log.slice(before).filter((r) => r.path === "/v1/admin/grants")).toEqual([]);
    await adminCtx.close();
  });

  test("look up an address nobody has used, then give it Pro from there", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    await lookUp(page, "nadie@example.com");
    await expect(page.locator("#lookup-result")).toContainText("No hay ninguna cuenta con nadie@example.com");
    await page.getByRole("button", { name: "Dar más días a esta cuenta" }).click();
    await expect(page.locator("#give-email")).toHaveValue("nadie@example.com");
    await adminCtx.close();
  });

  test("gift codes: create, redeem, used up, cancel", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    const adminCtx = await browser.newContext();
    await adminCtx.grantPermissions(["clipboard-read", "clipboard-write"], { origin: BASE });
    const page = await openAdmin(adminCtx, worker, admin);
    await expect(page.locator("#code-list")).toContainText("Todavía no hay códigos");

    await page.fill("#code-days", "14");
    await page.fill("#code-uses", "1");
    await page.fill("#code-note", "Para Ana");
    await page.click("#code-submit");
    await expect(page.locator("#code-new-value")).toHaveText(/^VOCAL-/);
    const code = (await page.locator("#code-new-value").textContent()).trim();
    expect(code).toMatch(/^VOCAL-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    await expect(page.locator("[data-testid=codes-table] tbody tr")).toHaveCount(1);
    await expect(page.locator("[data-testid=codes-table] tbody tr").first()).toContainText("0/1");

    await page.click("#code-copy-message");
    await expect(page.locator("#code-copy-status")).toHaveText("Copiado.");
    const message = await page.evaluate(() => navigator.clipboard.readText());
    expect(message).toContain(code);
    expect(message).toContain(`${BASE}/`);

    // Ana redeems it in the practice site's account panel, typed loosely.
    const ana = await worker.signIn("ana.tester@example.com");
    const anaCtx = await browser.newContext();
    const studio = await openStudio(anaCtx, worker, ana);
    await studio.click("#btn-account");
    await expect(studio.locator("#account-redeem-form")).toBeVisible();
    await studio.fill("#account-redeem-code", code.toLowerCase().replace(/-/g, " "));
    await studio.click("#account-redeem-submit");
    await expect.poll(() => studio.evaluate(() => window.VTBilling.isPro())).toBe(true);

    // A second person finds it used up.
    const bruno = await worker.signIn("bruno.tester@example.com");
    const second = await worker.call("POST", "/v1/me/redeem", { token: bruno.token, body: { code } });
    expect(second.status).toBe(409);
    expect(second.body.reason).toBe("exhausted");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toHaveAttribute("data-gate", "admin");
    const row = page.locator("[data-testid=codes-table] tbody tr").first();
    await expect(row).toContainText("1/1");
    await expect(row).toHaveAttribute("data-status", "usedup");

    // Ana's lookup names the code her month came from.
    await lookUp(page, "ana.tester@example.com");
    await expect(page.locator("[data-testid=grants-table]")).toContainText(`con el código ${code}`);
    await anaCtx.close();

    // A code for a group, cancelled before anyone uses it.
    await page.fill("#code-days", "30");
    await page.fill("#code-uses", "10");
    await page.click("#code-submit");
    // The page was reloaded above, so the box starts empty and fills with the new code.
    await expect(page.locator("#code-new-value")).toHaveText(/^VOCAL-/);
    const group = (await page.locator("#code-new-value").textContent()).trim();
    const groupRow = page.locator(`[data-testid=codes-table] tbody tr:has(code:text-is("${group}"))`);
    await expect(groupRow).toHaveAttribute("data-status", "active");
    page.once("dialog", (dialog) => dialog.accept());
    await groupRow.getByRole("button", { name: "Anular" }).click();
    await expect(page.locator("#code-result")).toContainText(`Código ${group} anulado`);
    await expect(groupRow).toHaveAttribute("data-status", "revoked");
    const late = await worker.call("POST", "/v1/me/redeem", { token: bruno.token, body: { code: group } });
    expect(late.body.reason).toBe("revoked");
    await adminCtx.close();
  });

  test("cancelling a code does not take days from people who already redeemed it", async ({ browser }) => {
    const { worker, adminToken, admin } = await startWorker();
    const created = await worker.call("POST", "/v1/admin/gift-codes", {
      token: adminToken,
      body: { days: 30, maxRedemptions: 3 }
    });
    const code = created.body.giftCode.code;
    const ana = await worker.signIn("ana.tester@example.com");
    await worker.call("POST", "/v1/me/redeem", { token: ana.token, body: { code } });

    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("[data-testid=codes-table] tbody tr").first().getByRole("button", { name: "Anular" }).click();
    await expect(page.locator("#code-result")).toContainText("anulado");

    const me = await worker.call("GET", "/v1/me", { token: ana.token });
    expect(me.body.entitlement.pro).toBe(true);

    // A code made elsewhere (another admin) shows up on Refresh list.
    await worker.call("POST", "/v1/admin/gift-codes", { token: adminToken, body: { days: 7 } });
    await expect(page.locator("[data-testid=codes-table] tbody tr")).toHaveCount(1);
    await page.click("#codes-refresh");
    await expect(page.locator("[data-testid=codes-table] tbody tr")).toHaveCount(2);
    await adminCtx.close();
  });

  test("signing out forgets what this admin looked up and ends the session", async ({ browser }) => {
    const { worker, adminToken, admin } = await startWorker();
    await worker.call("POST", "/v1/admin/grants", { token: adminToken, body: { email: "ana.tester@example.com", days: 30 } });
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    await lookUp(page, "ana.tester@example.com");
    await page.click("#code-submit");
    await expect(page.locator("#code-new-value")).toHaveText(/^VOCAL-/);

    await page.click("#admin-signout");
    await expect(page.locator("body")).toHaveAttribute("data-gate", "signedOut");
    await expect(page.locator("#lookup-result")).toBeEmpty();
    await expect(page.locator("#lookup-email")).toHaveValue("");
    await expect(page.locator("#code-new")).toBeHidden();
    await expect(page.locator("#code-new-value")).toBeHidden();
    expect(await page.evaluate(() => localStorage.getItem("vt_account_session_v1"))).toBeNull();
    await expect.poll(async () => (await worker.call("GET", "/v1/me", { token: adminToken })).status).toBe(401);
    await adminCtx.close();
  });

  test("notes and names are shown as text, never run as HTML", async ({ browser }) => {
    const { worker, adminToken, admin } = await startWorker();
    const evil = '<img src=x onerror="window.__pwned=1">';
    await worker.signIn("eve@example.com", { displayName: evil });
    await worker.call("POST", "/v1/admin/grants", { token: adminToken, body: { email: "eve@example.com", days: 5, note: evil } });
    await worker.call("POST", "/v1/admin/gift-codes", { token: adminToken, body: { days: 5, note: evil } });
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    await lookUp(page, "eve@example.com");
    await expect(page.locator("#lookup-result")).toContainText(evil);
    await expect(page.locator("#code-list")).toContainText(evil);
    expect(await page.locator("#admin-main img").count()).toBe(0);
    expect(await page.evaluate(() => window.__pwned)).toBeUndefined();
    await adminCtx.close();
  });

  test("an admin taken off ADMIN_EMAILS is refused at once, and sees no tools on reload", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    await expect(page.locator("body")).toHaveAttribute("data-gate", "admin");

    worker.env.ADMIN_EMAILS = "someone-else@example.com";
    await page.fill("#give-email", "ana.tester@example.com");
    await page.click("#give-submit");
    await expect(page.locator("#give-result")).toContainText("ya no es administradora");

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toHaveAttribute("data-gate", "notAdmin");
    await adminCtx.close();
  });

  test("an admin added to ADMIN_EMAILS after first signing in gets the tools", async ({ browser }) => {
    const { worker } = await startWorker();
    const late = await worker.signIn("second-admin@example.com");
    worker.env.ADMIN_EMAILS = "admin@example.com,second-admin@example.com";
    const ctx = await browser.newContext();
    const page = await openAdmin(ctx, worker, late);
    await expect(page.locator("body")).toHaveAttribute("data-gate", "admin");

    // The practice site's account panel now links here for them too.
    const studio = await openStudio(ctx, worker, late);
    await studio.click("#btn-account");
    await expect(studio.locator("#account-admin-page")).toBeVisible();
    await expect(studio.locator("#account-admin-page")).toHaveAttribute("href", "admin.html");
    await ctx.close();
  });

  test("a session that ends mid-use returns to sign-in instead of failing quietly", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    await worker.sql("UPDATE sessions SET revoked_at = ?1", worker.now());
    await lookUp(page, "ana.tester@example.com");
    await expect(page.locator("body")).toHaveAttribute("data-gate", "signedOut");
    await expect(page.locator("#gate-error")).toContainText("Tu sesión terminó");
    expect(await page.evaluate(() => localStorage.getItem("vt_account_session_v1"))).toBeNull();
    await adminCtx.close();
  });

  test("maintenance: server status and clean-up", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    // An expired session for clean-up to remove.
    const old = await worker.signIn("old@example.com", { at: worker.now() - 200 * DAY });
    expect(old.token).toBeTruthy();
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    const health = page.locator("#health-list");
    await expect(health).toContainText("Cuentas y regalos: activo");
    await expect(health).toContainText("Firma de licencias Pro: activo");
    await expect(health).toContainText("Entrar con Google: activo");
    await expect(health).toContainText("Entrar con código por correo: apagado");
    await expect(health).toContainText(`Sitio permitido: ${BASE}`);

    const before = await worker.env.DB.prepare("SELECT COUNT(*) AS n FROM sessions").first();
    await page.click("#sweep-run");
    await expect(page.locator("#sweep-result")).toHaveText("Limpieza hecha.");
    const after = await worker.env.DB.prepare("SELECT COUNT(*) AS n FROM sessions").first();
    expect(Number(after.n)).toBe(Number(before.n) - 1);
    await adminCtx.close();
  });

  test("works in English too", async ({ browser }) => {
    const { worker, adminToken, admin } = await startWorker();
    await worker.call("POST", "/v1/admin/grants", { token: adminToken, body: { email: "ana.tester@example.com", days: 30 } });
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin, { lang: "en" });
    await expect(page.locator("h1")).toHaveText("Admin panel");
    await expect(page.locator(".admin-jump")).toHaveAttribute("aria-label", "Sections");
    await expect(page.locator(".admin-chips")).toHaveAttribute("aria-label", "Days");
    await lookUp(page, "ana.tester@example.com");
    await expect(page.getByRole("button", { name: "Remove access" })).toBeVisible();
    await expect(page.locator("[data-testid=lookup-status]")).toContainText("Has Pro until");
    await page.click("#admin-lang");
    await expect(page.locator("h1")).toHaveText("Panel de admin");
    await expect(page.locator("[data-testid=lookup-status]")).toContainText("Tiene Pro hasta");
    await adminCtx.close();
  });

  test("on a phone: no sideways scroll and every control clears the 44px floor", async ({ browser }) => {
    const { worker, adminToken, admin } = await startWorker();
    await worker.call("POST", "/v1/admin/grants", { token: adminToken, body: { email: "ana.tester@example.com", days: 30, note: "Beta" } });
    await worker.call("POST", "/v1/admin/gift-codes", { token: adminToken, body: { days: 30, maxRedemptions: 5, note: "Coro" } });
    const ctx = await browser.newContext({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true });
    const page = await openAdmin(ctx, worker, admin);
    await lookUp(page, "ana.tester@example.com");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const small = await page.evaluate(() =>
      [...document.querySelectorAll("#admin-main button, #admin-main input, .admin-jump a")]
        .filter((node) => node.offsetParent !== null)
        .map((node) => ({ id: node.id || node.textContent.trim(), h: node.getBoundingClientRect().height }))
        .filter((r) => r.h < 44)
    );
    expect(small).toEqual([]);
    const tiny = await page.evaluate(() =>
      [...document.querySelectorAll("#admin-main *")]
        .filter((node) => node.offsetParent !== null && node.childNodes.length && [...node.childNodes].some((c) => c.nodeType === 3 && c.textContent.trim()))
        .map((node) => ({ text: node.textContent.trim().slice(0, 30), size: parseFloat(getComputedStyle(node).fontSize) }))
        .filter((r) => r.size < 12)
    );
    expect(tiny).toEqual([]);
    await ctx.close();
  });
});
