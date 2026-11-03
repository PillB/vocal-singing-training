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
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");
const { patchBillingConfig } = require("./helpers/billing");
const { tapFloorLimit } = require("./helpers/tap-floor");

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
        localStorage.removeItem("vt_account_plan_v1");
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
  // boot() fires the reports and holders reads without waiting for them, so
  // the page is usable before they land. A test that changes the session right
  // after this would otherwise race those requests — and a 401 on one signs
  // the admin out, correctly, but before the test has pressed anything. Both
  // counts lines are filled by the answers, even when there is nothing to list.
  if ((await page.locator("body").getAttribute("data-gate")) === "admin") {
    await expect(page.locator("#reports-counts")).not.toBeEmpty({ timeout: 10000 });
    await expect(page.locator("#holders-counts")).not.toBeEmpty({ timeout: 10000 });
  }
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

/**
 * Open the tester's account panel, where the plan line is. Written against
 * what the guide tells an admin to look for, so it holds whichever header
 * wording is live: the header names a gift ("Regalo", "Pro de regalo"), and
 * the panel says "Pro de regalo · termina el …" or "Plan gratis".
 */
async function openAccountPanel(page) {
  if (!(await page.locator("#account-plan").isVisible())) await page.click("#btn-account");
  await expect(page.locator("#account-plan")).toBeVisible();
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
    // One handler whose answer changes, rather than removing the outage route
    // and wiring the worker back: an unroute races the press below, and the
    // page asks once per press, so a request that lost that race left the page
    // on "unreachable" for ever and the test failed under load.
    const outage = { on: true };
    await page.route(`${API}/**`, (route) => (outage.on ? route.abort("failed") : route.fallback()));
    await page.goto(`${BASE}/admin.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toHaveAttribute("data-gate", "unreachable");
    await expect(page.locator("#gate-google-fallback")).toBeHidden();

    // Back up: Try again gets to sign-in.
    outage.on = false;
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
    // What she sees, as the guide describes it: the header names the gift and
    // her account panel says when it ends.
    await expect(studio.locator(".app-header")).toContainText(/regalo/i);
    await openAccountPanel(studio);
    await expect(studio.locator("#account-plan")).toHaveText(/^Pro de regalo · termina el /);

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
    await expect(studio.locator(".app-header")).toContainText(/regalo/i);

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
    // What he sees: no gift in the header, "Plan gratis" in his panel. Removing
    // a gift does not use up the free trial, so he is now offered it; the guide
    // says so and how to stop it.
    await expect(studio.locator(".app-header")).not.toContainText(/regalo/i);
    await openAccountPanel(studio);
    await expect(studio.locator("#account-plan")).toHaveText("Plan gratis");
    await expect(studio.locator("#btn-account-trial")).toBeVisible();
    await expect(studio.locator("#btn-account-trial")).toHaveText("Empezar 7 días gratis");
    expect(await studio.evaluate(() => localStorage.getItem("vt_account_plan_v1"))).toBeNull();
    await adminCtx.close();
    await brunoCtx.close();
  });

  test("blocking the free trial after removing a gift, with the guide's SQL", async ({ browser }) => {
    const { worker, adminToken } = await startWorker();
    const bruno = await worker.signIn("bruno.tester@example.com");
    await worker.call("POST", "/v1/admin/grants", { token: adminToken, body: { email: "bruno.tester@example.com", days: 30 } });
    const look = await worker.call("GET", "/v1/admin/account?email=bruno.tester@example.com", { token: adminToken });
    const grantId = look.body.grants[0].id;
    await worker.call("POST", "/v1/admin/grants/revoke", { token: adminToken, body: { grantId } });
    // The command from docs/ADMIN-GUIDE.md itself, so the guide cannot drift
    // from what is tested, with the address in mixed case and padded the way
    // people paste it.
    const guide = fs.readFileSync(path.join(__dirname, "..", "docs", "ADMIN-GUIDE.md"), "utf8");
    const command = guide.match(/--command "(UPDATE accounts SET trial_used_at[^"]*)"/);
    expect(command, "the guide's trial-blocking command").toBeTruthy();
    const statement = command[1].split("'$SQLEMAIL'").join("?1");
    expect(statement).toContain("?1");
    expect(statement).not.toContain("$");
    await worker.sql(statement, " Bruno.Tester@example.com ");
    const ctx = await browser.newContext();
    const studio = await openStudio(ctx, worker, bruno);
    await studio.evaluate(() => window.VTAccount.refresh());
    await openAccountPanel(studio);
    await expect(studio.locator("#account-plan")).toHaveText("Plan gratis");
    await expect(studio.locator("#btn-account-trial")).toBeHidden();
    const trial = await worker.call("POST", "/v1/me/trial", { token: bruno.token });
    expect(trial.status).toBe(409);
    await ctx.close();
  });

  test("remove a free trial: it stays used, so no second trial is offered", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    const carla = await worker.signIn("carla@example.com");
    const trial = await worker.call("POST", "/v1/me/trial", { token: carla.token });
    expect(trial.status).toBe(200);

    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    await lookUp(page, "carla@example.com");
    await expect(page.locator("#lookup-result")).toContainText("Ya usó su prueba gratis");
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

  // ------------------------------------------------------------- reports

  /**
   * Send a report the way a browser does, through the worker's own route.
   * @param {Object} worker Local worker.
   * @param {Object} body Report body.
   * @returns {Promise<string>} The reference the worker minted.
   */
  async function sendReport(worker, body) {
    const res = await worker.call("POST", "/v1/reports", { body });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    return res.body.reference;
  }

  test("reports: read what somebody sent, and move it along", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    const blocking = await sendReport(worker, {
      kind: "bug",
      area: "audio",
      severity: "blocks",
      summary: "el micrófono no se enciende en mi iPhone",
      detail: "toco Empezar y no pasa nada,\nni con auriculares",
      steps: "1. abrir el estudio\n2. tocar Empezar",
      contact: "ana@example.com",
      page: "/index.html#practice",
      build: "20261102a",
      locale: "es",
      environment: { ua: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)", viewport: "390x844" }
    });
    await sendReport(worker, { kind: "idea", area: "exercises", summary: "más escalas, por favor" });

    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    const cards = page.locator("#reports-list .admin-report");
    await expect(cards).toHaveCount(2);
    await expect(page.locator("#reports-counts")).toContainText("2 sin leer");

    // Located by their words, not by position: both of these arrived in the
    // same second, and the order within one second is not this test's subject
    // (the paging test below seeds a minute apart and asserts newest first).
    const idea = cards.filter({ hasText: "más escalas" });
    const bug = cards.filter({ hasText: "el micrófono" });
    await expect(idea).toContainText("más escalas, por favor");
    await expect(idea).toContainText("Idea");
    await expect(bug).toContainText("el micrófono no se enciende en mi iPhone");
    await expect(bug).toContainText("Fallo");
    await expect(bug).toContainText("No puede seguir");
    // Their own words, their own line breaks, and where they were.
    await expect(bug).toContainText("ni con auriculares");
    await expect(bug).toContainText("tocar Empezar");
    await expect(bug).toContainText("/index.html#practice");
    await expect(bug).toContainText("iPhone");
    await expect(bug).toContainText("390x844");
    await expect(bug).toContainText(blocking);
    // Answering somebody is one tap, not a retyped address.
    await expect(bug.locator('a[href="mailto:ana@example.com"]')).toHaveCount(1);

    // Move it along, with a note only we see.
    await bug.locator(`#report-status-${blocking}`).selectOption("triaged");
    await bug.locator(`#report-note-${blocking}`).fill("pasa solo en iOS 16, reproducido");
    await bug.getByRole("button", { name: "Guardar" }).click();
    await expect(page.locator("#reports-counts")).toContainText("1 sin leer");
    await expect(bug).toContainText("En curso");
    const row = await worker.env.DB.prepare("SELECT status, admin_note, handled_at FROM reports WHERE id = ?1")
      .bind(blocking)
      .first();
    expect(row.status).toBe("triaged");
    expect(row.admin_note).toBe("pasa solo en iOS 16, reproducido");
    expect(Number(row.handled_at)).toBeGreaterThan(0);

    // Filtering to the unread drops it, because it no longer is one.
    await page.click('#reports [data-report-status="new"]');
    await expect(page.locator("#reports-list .admin-report")).toHaveCount(1);
    await expect(page.locator("#reports-list")).toContainText("más escalas");
    // And filtering by kind narrows it the same way.
    await page.click('#reports [data-report-status=""]');
    await page.click('#reports [data-report-kind="bug"]');
    await expect(page.locator("#reports-list .admin-report")).toHaveCount(1);
    await expect(page.locator("#reports-list")).toContainText("el micrófono");
    await adminCtx.close();
  });

  test("reports: a signed-out reporter is named as one, and a signed-in one by their address", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    const tester = await worker.signIn("ana.tester@example.com", { displayName: "Ana" });
    await worker.call("POST", "/v1/reports", {
      token: tester.token,
      body: { kind: "bug", summary: "con cuenta", contact: "ana.tester@example.com" }
    });
    await sendReport(worker, { kind: "bug", summary: "sin cuenta" });

    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    const cards = page.locator("#reports-list .admin-report");
    await expect(cards).toHaveCount(2);
    await expect(cards.filter({ hasText: "sin cuenta" })).toContainText("Sin cuenta");
    await expect(cards.filter({ hasText: "con cuenta" })).toContainText("De ana.tester@example.com");
    await adminCtx.close();
  });

  test("reports: older ones are a button away, not a scroll away", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    // Seeded straight into the database: the route's own hourly limit per
    // address is what stops abuse, and thirty reports from one address is
    // exactly what it refuses.
    const now = worker.now();
    // References in the shape the worker mints, so a seeded row can also be
    // saved from the page: VS- then ten characters of its readable alphabet.
    const ALPHA = "23456789ABCDEFGHJKMNPQRSTVWXYZ";
    for (let i = 0; i < 30; i += 1) {
      await worker.sql(
        `INSERT INTO reports (id, created_at, updated_at, kind, area, summary, detail, steps, env, status)
         VALUES (?1, ?2, ?2, 'bug', 'site', ?3, '', '', '{}', 'new')`,
        `VS-SEED2222${ALPHA[Math.floor(i / 30) % 30]}${ALPHA[i % 30]}`,
        now - i * 60,
        `reporte número ${i}`
      );
    }
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    await expect(page.locator("#reports-list .admin-report")).toHaveCount(25);
    await expect(page.locator("#reports-counts")).toContainText("30 sin leer");
    const more = page.locator("#reports-more");
    await expect(more).toBeVisible();
    await more.click();
    await expect(page.locator("#reports-list .admin-report")).toHaveCount(30);
    await expect(more).toBeHidden();
    // No report appears twice across the page boundary, and the newest is first.
    const summaries = await page.locator("#reports-list .admin-report h4").allTextContents();
    expect(new Set(summaries).size).toBe(30);
    expect(summaries[0]).toContain("número 0");
    expect(summaries[summaries.length - 1]).toContain("número 29");
    await adminCtx.close();
  });

  test("reports: a worker without the route leaves the section empty rather than shouting", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    const adminCtx = await browser.newContext();
    const page = await adminCtx.newPage();
    await wire(page, worker, admin);
    // What an older deploy answers: the path is simply not there.
    await page.route(`${API}/v1/admin/reports*`, (route) =>
      route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, reason: "not_found" }) })
    );
    await page.goto(`${BASE}/admin.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toHaveAttribute("data-gate", "admin", { timeout: 10000 });
    // It says the list may be stale, and the rest of the page still works.
    await expect(page.locator("#reports-counts")).toContainText(/Algo falló|desactualizada/);
    await expect(page.locator("#reports-list .admin-report")).toHaveCount(0);
    await lookUp(page, "admin@example.com");
    await expect(page.locator("#lookup-result")).toContainText("Admin");
    await adminCtx.close();
  });

  test("maintenance: server status and clean-up", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    // An expired session, and one browser's statistics from 200 days ago next
    // to one from today, for clean-up to sort.
    const old = await worker.signIn("old@example.com", { at: worker.now() - 200 * DAY });
    expect(old.token).toBeTruthy();
    const insertEvent = "INSERT INTO events (received_at, cid, name, day, tz, props) VALUES (?1, ?2, 'app_open', NULL, NULL, '{}')";
    await worker.sql(insertEvent, worker.now() - 200 * DAY, "oldbrowser1");
    await worker.sql(insertEvent, worker.now() - DAY, "newbrowser1");
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    const health = page.locator("#health-list");
    await expect(health).toContainText("Cuentas y regalos: activo");
    await expect(health).toContainText("Firma de licencias Pro: activo");
    await expect(health).toContainText("Entrar con Google: activo");
    await expect(health).toContainText("Entrar con código por correo: apagado");
    await expect(health).toContainText("Estadísticas anónimas: activo");
    await expect(health).toContainText("Prueba gratis: 7 días");
    await expect(health).toContainText(`Sitio permitido: ${BASE}`);
    await expect(page.locator("#maintenance")).toContainText("04:17");

    const before = await worker.env.DB.prepare("SELECT COUNT(*) AS n FROM sessions").first();
    await page.click("#sweep-run");
    await expect(page.locator("#sweep-result")).toHaveText("Limpieza hecha.");
    const after = await worker.env.DB.prepare("SELECT COUNT(*) AS n FROM sessions").first();
    expect(Number(after.n)).toBe(Number(before.n) - 1);
    const left = await worker.env.DB.prepare("SELECT cid FROM events ORDER BY cid").all();
    expect(left.results.map((r) => r.cid)).toEqual(["newbrowser1"]);
    await adminCtx.close();
  });

  test("maintenance: an old worker's missing statistics field reads as 'redeploy', not as off", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    const adminCtx = await browser.newContext();
    const page = await adminCtx.newPage();
    await wire(page, worker, admin);
    // The shape the worker had before statistics: no eventsEnabled, 30-day trial.
    await page.route(`${API}/v1/health`, async (route) => {
      const res = await worker.fetch(new Request(`${API}/v1/health`, { headers: { origin: BASE } }));
      const body = await res.json();
      delete body.eventsEnabled;
      body.authMethods.trialDays = 30;
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(body) });
    });
    await page.goto(`${BASE}/admin.html`, { waitUntil: "domcontentloaded" });
    const health = page.locator("#health-list");
    await expect(health).toContainText("Estadísticas anónimas: no informado (servidor antiguo: redespliégalo, guía 8.7)");
    await expect(health).toContainText("Prueba gratis: 30 días");
    await expect(health.locator("li", { hasText: "Estadísticas anónimas" })).toHaveAttribute("data-tone", "error");
    await adminCtx.close();
  });

  test("statistics switched off on the server: the page says so, in status and in Statistics", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    worker.env.EVENTS_ENABLED = "false";
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    const health = page.locator("#health-list");
    await expect(health).toContainText("Estadísticas anónimas: apagado");
    await expect(health.locator("li", { hasText: "Estadísticas anónimas" })).toHaveAttribute("data-tone", "off");
    await page.click("#stats-load");
    await expect(page.locator("#stats-result")).toContainText("El servidor tiene las estadísticas apagadas (EVENTS_ENABLED).");
    await adminCtx.close();
  });

  test("statistics: the funnel and arrivals, read without adding to them", async ({ browser }) => {
    const { seedStats } = await localWorkerModule();
    const { worker, admin } = await startWorker();
    await seedStats(worker);
    const before = await worker.env.DB.prepare("SELECT COUNT(*) AS n FROM events").first();
    const log = [];
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin, { log });
    // Nothing is read until asked, and the page carries no statistics code.
    await expect(page.locator("#stats-result")).toBeEmpty();
    expect(await page.evaluate(() => typeof window.VTAnalytics)).toBe("undefined");
    await expect(page.locator('#stats [data-window="28"]')).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator('#stats [data-window="28"]')).toHaveText("28 días");

    await page.click("#stats-load");
    const result = page.locator("#stats-result");
    await expect(result).toContainText("Últimos 28 días · 40 navegadores");
    const rows = result.locator(".admin-funnel tbody tr");
    await expect(rows).toHaveCount(8);
    await expect(rows.nth(0)).toContainText("abrió el sitio");
    await expect(rows.nth(1)).toContainText("abrió el panel de cuenta");
    await expect(rows.nth(1)).toContainText("35.0 %");
    await expect(result).toContainText("Google bloqueado en ese navegador: 2");
    await expect(result).toContainText("le pedimos entrar primero: 1");
    await expect(result).toContainText("Último evento guardado:");
    await expect(result).toContainText("borrados a petición: 1");
    await expect(result).toContainText("navegador que pide no ser rastreado: 1");
    expect(log.filter((r) => r.path === "/v1/admin/funnel")).toHaveLength(1);

    // Another window re-reads; the language switch redraws what was read.
    await page.click('#stats [data-window="7"]');
    await expect(page.locator('#stats [data-window="7"]')).toHaveAttribute("aria-pressed", "true");
    await expect(result).toContainText("Últimos 7 días");
    await page.click("#admin-lang");
    await expect(result).toContainText("Last 7 days · 40 browsers");
    await expect(result).toContainText("opened the account panel");
    await expect(result).toContainText("deleted on request: 1");

    // Looking changed nothing: no event route was called and no row was added.
    expect(log.some((r) => r.path.startsWith("/v1/events") || r.path === "/v1/geo")).toBe(false);
    const after = await worker.env.DB.prepare("SELECT COUNT(*) AS n FROM events").first();
    expect(Number(after.n)).toBe(Number(before.n));
    await adminCtx.close();
  });

  test("statistics: an empty window, a member, and a worker without the route", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    await page.click("#stats-load");
    await expect(page.locator("#stats-result")).toContainText("Todavía no hay datos en este periodo");
    await expect(page.locator("#stats-result")).toContainText("Todavía no se ha guardado ningún evento");

    // The route itself refuses anyone not on ADMIN_EMAILS.
    const ana = await worker.signIn("ana.tester@example.com");
    const denied = await worker.call("GET", "/v1/admin/funnel", { token: ana.token });
    expect(denied.status).toBe(403);

    // A worker from before the statistics answers 404: say what to do.
    await page.route(`${API}/v1/admin/funnel**`, (route) =>
      route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, reason: "not_found" }) })
    );
    await page.click("#stats-load");
    await expect(page.locator("#stats-result")).toHaveText(/Redespliega el worker \(guía, sección 8\.7\)/);
    await adminCtx.close();
  });

  test("statistics: exposures the worker set aside are named", async ({ browser }) => {
    // Once an experiment is on, the worker counts an exposure over one
    // address's daily cap (a school, an office) and one for an arm its registry
    // does not have, and neither showed anywhere on this page.
    const { worker, admin } = await startWorker();
    const day = new Date(worker.now() * 1000).toISOString().slice(0, 10);
    const post = (events) =>
      worker.fetch(
        new Request("http://worker.local/v1/events", {
          method: "POST",
          headers: {
            origin: worker.env.SITE_ORIGIN,
            "content-type": "text/plain;charset=UTF-8",
            "user-agent":
              "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36",
            "cf-connecting-ip": "203.0.113.77"
          },
          body: JSON.stringify({ events })
        })
      );
    const expose = (i, variant) => ({
      name: "experiment_expose",
      cid: `sbxexp${String(i).padStart(4, "0")}`,
      day,
      tz: 300,
      props: { experiment: "aa_2026_10", variant, forced: false, enabled: true }
    });
    // 125 browsers behind one address, 25 over the cap of 100 a day...
    for (let i = 0; i < 125; i += 25) {
      await post(Array.from({ length: 25 }, (_, j) => expose(i + j, (i + j) % 2 ? "b" : "a")));
    }
    // ...and ten exposed to an arm that does not exist.
    await post(Array.from({ length: 10 }, (_, j) => expose(500 + j, "zz")));

    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    await page.click("#stats-load");
    const result = page.locator("#stats-result");
    await expect(result).toContainText("guardados: 135");
    await expect(result).toContainText("exposiciones nuevas: 100");
    const capped = result.locator("li", { hasText: "exposiciones por encima del tope diario de una dirección: 25" });
    await expect(capped).toHaveAttribute("data-tone", "error");
    // An unknown arm is forged traffic or a site and worker deployed out of
    // step: the registry doing its job, so not the colour of a fault.
    const unknown = result.locator("li", { hasText: "exposiciones a una prueba o versión que no existe: 10" });
    await expect(unknown).toHaveAttribute("data-tone", "");
    await page.click("#admin-lang");
    await expect(result).toContainText("exposures over one address's daily cap: 25");
    await adminCtx.close();
  });

  test("statistics: every counter the worker keeps is shown once, grouped as the worker groups it", async ({
    browser
  }) => {
    // The worker's list of ingest reasons and this page's are two copies of one
    // list. They drifted once (eu_no_consent), and this page also counted two
    // whole requests turned away, body_too_large and bad_request, as events
    // dropped, so its "dropped" did not match the A/B panel's for the same week.
    // Every reason gets its own count here: each must be a row of its own, or
    // be summed into the one row for events dropped one by one.
    const { INGEST_REASONS } = await import(
      pathToFileURL(path.join(__dirname, "..", "workers", "entitlements", "src", "events.js")).href
    );
    expect(Object.keys(INGEST_REASONS).sort()).toEqual(["event", "exposure", "request"]);
    const totals = {};
    Object.values(INGEST_REASONS)
      .flat()
      .forEach((key, i) => {
        totals[key] = 11 + i;
      });
    const dropped = INGEST_REASONS.event.filter((k) => k !== "accepted").reduce((n, k) => n + totals[k], 0);
    const own = ["accepted", ...INGEST_REASONS.request, ...INGEST_REASONS.exposure];

    const { worker, admin } = await startWorker();
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    await page.route(`${API}/v1/admin/experiments**`, (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ ok: true, experiments: [], ingest: { since: "2026-09-29", totals, lastAcceptedAt: 1790000000 } })
      })
    );
    await page.click("#stats-load");
    const counts = page.locator("#stats-result .admin-counts li strong");
    await expect(counts.first()).toBeVisible();
    const shown = (await counts.allTextContents()).map(Number).sort((a, b) => a - b);
    expect(shown).toEqual([...own.map((k) => totals[k]), dropped].sort((a, b) => a - b));
    await adminCtx.close();
  });

  test("the sandbox's trial length is the one wrangler.toml deploys", async () => {
    const fs = require("fs");
    const toml = fs.readFileSync(path.join(__dirname, "..", "workers", "entitlements", "wrangler.toml"), "utf8");
    const deployed = /^TRIAL_DAYS\s*=\s*"(\d+)"/m.exec(toml);
    expect(deployed).not.toBeNull();
    const { worker } = await startWorker();
    const methods = await worker.call("GET", "/v1/auth/methods");
    expect(String(methods.body.trialDays)).toBe(deployed[1]);
  });

  test("every page loads its own files with a version, and the same version of a shared file", async () => {
    // The ?v= stamp is what makes a browser fetch a changed file after a deploy.
    // A file loaded with none is served from the cache under the same address,
    // so a reload can run new HTML on the old file: privacy.html loaded
    // css/styles.css that way, and index.html five of its scripts. And a file
    // two pages share has to carry the same stamp on both, or one of them keeps
    // the old copy (guide.html's stylesheet once fell behind index.html's).
    // Anything after the path other than exactly ?v=<word> fails too, rather
    // than slipping past the check: an empty ?v=, a second parameter or a #.
    const fs = require("fs");
    const root = path.join(__dirname, "..");
    const pages = fs.readdirSync(root).filter((name) => name.endsWith(".html"));
    expect(pages).toEqual(expect.arrayContaining(["index.html", "guide.html", "admin.html", "privacy.html"]));
    const seen = {};
    for (const name of pages) {
      const html = fs.readFileSync(path.join(root, name), "utf8");
      for (const m of html.matchAll(/(?:src|href)\s*=\s*["']?(?:\.?\/)?((?:js|css)\/[^"'\s>?#]+)([^"'\s>]*)/g)) {
        const stamp = /^\?v=(\w+)$/.exec(m[2]);
        expect(stamp, `${name} loads ${m[1]}${m[2]}, not ${m[1]}?v=<version>`).toBeTruthy();
        (seen[m[1]] = seen[m[1]] || {})[name] = stamp[1];
      }
    }
    expect(Object.keys(seen["css/styles.css"]).sort()).toEqual([...pages].sort());
    for (const [file, byPage] of Object.entries(seen)) {
      expect(new Set(Object.values(byPage)).size, `${file}: ${JSON.stringify(byPage)}`).toBe(1);
    }
  });

  test("works in English too", async ({ browser }) => {
    const { worker, adminToken, admin } = await startWorker();
    await worker.call("POST", "/v1/admin/grants", { token: adminToken, body: { email: "ana.tester@example.com", days: 30 } });
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin, { lang: "en" });
    await expect(page.locator("h1")).toHaveText("Admin panel");
    await expect(page.locator(".admin-jump")).toHaveAttribute("aria-label", "Sections");
    await expect(page.locator("#give .admin-chips")).toHaveAttribute("aria-label", "Days");
    await expect(page.locator("#stats .admin-chips")).toHaveAttribute("aria-label", "Period");
    await expect(page.locator('#stats [data-window="28"]')).toHaveText("28 days");
    await lookUp(page, "ana.tester@example.com");
    // Scoped, because the holders list below now offers the same button.
    await expect(page.locator("#lookup-result").getByRole("button", { name: "Remove access" })).toBeVisible();
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
    const { seedStats } = await localWorkerModule();
    await seedStats(worker);
    const ctx = await browser.newContext({ viewport: { width: 375, height: 740 }, isMobile: true, hasTouch: true });
    const page = await openAdmin(ctx, worker, admin);
    await lookUp(page, "ana.tester@example.com");
    await page.click("#stats-load");
    await expect(page.locator("#stats-result .admin-funnel")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const small = await page.evaluate((limit) =>
      [...document.querySelectorAll("#admin-main button, #admin-main input, .admin-jump a")]
        .filter((node) => node.offsetParent !== null)
        .map((node) => ({ id: node.id || node.textContent.trim(), h: node.getBoundingClientRect().height }))
        .filter((r) => r.h < limit)
    , tapFloorLimit(44));
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

  // ----- Who holds Pro. The lookup answers "what does this person hold"; this
  // answers the one that had no answer, which is the one you ask when you want
  // to know how many testers are still comped.

  test("who has Pro: a gift and a test account, told apart, and one taken back from the list", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);

    // Given through the form, which is how an operator does it: a month for a
    // friend, and a tester comped with no end date.
    await page.fill("#give-email", "amiga@example.com");
    await page.fill("#give-days", "30");
    await page.fill("#give-note", "familia");
    await page.click("#give-submit");
    await expect(page.locator("#give-result")).toContainText("tiene Pro hasta el");

    await page.fill("#give-email", "qa.tester@example.com");
    // The chip is the point: "no end date" is a length, not a missing date.
    await page.click('#give .admin-chips [data-days="3650"]');
    await expect(page.locator("#give-days")).toHaveValue("3650");
    await page.check('#give input[name="give-kind"][value="comp"]');
    await page.fill("#give-note", "cuenta de pruebas");
    await page.click("#give-submit");
    await expect(page.locator("#give-result")).toContainText("tiene Pro hasta el");

    // What the worker stored is what the radio said, not a default.
    const stored = await worker.call("GET", "/v1/admin/grants?kind=comp", { token: admin.token });
    expect(stored.body.grants.map((g) => g.email)).toEqual(["qa.tester@example.com"]);
    expect(stored.body.grants[0].openEnded).toBe(true);

    // The list the form just added to. Default filter is what is running.
    await page.locator("a[href='#holders']").click();
    const rows = page.locator("[data-testid=holders-table] tbody tr");
    await expect(rows).toHaveCount(2);
    const tester = rows.filter({ hasText: "qa.tester@example.com" });
    const friend = rows.filter({ hasText: "amiga@example.com" });
    await expect(tester).toHaveAttribute("data-kind", "comp");
    await expect(friend).toHaveAttribute("data-kind", "gift");
    // The open-ended one says so in words; no date ten years out.
    await expect(tester).toContainText("sin fecha de fin");
    await expect(tester).not.toContainText("2036");
    await expect(friend).toContainText("→");
    await expect(page.locator("#holders-counts")).toContainText("1 regalos y 1 cuentas de pruebas vigentes");
    await expect(page.locator("#holders-counts")).toContainText("2 en total");

    // Filtering by kind is the question "which of these are our own accounts".
    await page.click('#holders [data-grant-kind="comp"]');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("qa.tester@example.com");
    await page.click('#holders [data-grant-kind=""]');
    await expect(rows).toHaveCount(2);

    // Taking it back from here warns about the same things the account view
    // warns about, and really revokes the grant.
    let question = "";
    page.once("dialog", (dialog) => {
      question = dialog.message();
      dialog.accept();
    });
    await rows.filter({ hasText: "amiga@example.com" }).getByRole("button", { name: "Quitar acceso" }).click();
    await expect(page.locator("#lookup-result")).toContainText("se quitó el acceso");
    expect(question).toContain("amiga@example.com");
    expect(question).toContain("hasta 3 días");
    // It left the running list, and the worker agrees it is gone.
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("qa.tester@example.com");
    const after = await worker.call("GET", "/v1/admin/account?email=amiga@example.com", { token: admin.token });
    expect(after.body.entitlement.pro).toBe(false);
    expect(after.body.grants[0].status).toBe("revoked");

    // And it is still findable under "taken back", which is the other half of
    // "examine who holds which kind".
    await page.click('#holders [data-grant-state="revoked"]');
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toContainText("amiga@example.com");
    await expect(rows.first()).toHaveAttribute("data-status", "revoked");
    await adminCtx.close();
  });

  test("who has Pro: saying no to the confirmation leaves the grant alone", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    await worker.call("POST", "/v1/admin/grants", {
      token: admin.token,
      body: { email: "amiga@example.com", days: 30, note: "familia" }
    });
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    const rows = page.locator("[data-testid=holders-table] tbody tr");
    await expect(rows).toHaveCount(1);
    page.once("dialog", (dialog) => dialog.dismiss());
    await rows.first().getByRole("button", { name: "Quitar acceso" }).click();
    // The row is still there and still running, and the button works again.
    await expect(rows).toHaveCount(1);
    await expect(rows.first()).toHaveAttribute("data-status", "active");
    await expect(rows.first().getByRole("button", { name: "Quitar acceso" })).toBeEnabled();
    const after = await worker.call("GET", "/v1/admin/account?email=amiga@example.com", { token: admin.token });
    expect(after.body.entitlement.pro).toBe(true);
    await adminCtx.close();
  });

  test("who has Pro: tapping an address looks that account up", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    await worker.call("POST", "/v1/admin/grants", {
      token: admin.token,
      body: { email: "qa.tester@example.com", days: 3650, kind: "comp", note: "QA" }
    });
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    await page.locator("[data-testid=holders-table] tbody tr").first().getByRole("button", { name: "qa.tester@example.com" }).click();
    await expect(page.locator("#lookup-email")).toHaveValue("qa.tester@example.com");
    await expect(page.locator("[data-testid=lookup-status]")).toContainText("Tiene Pro");
    await expect(page.locator("[data-testid=grants-table] tbody tr").first()).toContainText("Cortesía");
    await adminCtx.close();
  });

  test("who has Pro: older grants come on asking, newest first", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    const account = await worker.signIn("muchos@example.com");
    const now = worker.now();
    // Seeded straight into the database: thirty gifts, a day apart, so the
    // page boundary is unambiguous and nothing depends on insert order.
    for (let i = 0; i < 30; i += 1) {
      await worker.sql(
        `INSERT INTO grants (id, account_id, kind, plan, starts_at, ends_at, source, note, created_at, updated_at)
         VALUES (?1, ?2, 'gift', 'pro_monthly', ?3, ?4, 'admin', ?5, ?3, ?3)`,
        `g-seed-${String(i).padStart(2, "0")}`,
        account.accountId,
        now - i * DAY,
        now + (300 - i) * DAY,
        `regalo ${i}`
      );
    }
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin);
    const rows = page.locator("[data-testid=holders-table] tbody tr");
    await expect(rows).toHaveCount(25);
    // Newest first: the one created today, not the one from a month ago.
    await expect(rows.first()).toContainText("regalo 0");
    await expect(page.locator("#holders-counts")).toContainText("30 en total");
    await page.click("#holders-more");
    await expect(rows).toHaveCount(30);
    await expect(rows.last()).toContainText("regalo 29");
    // No row twice: thirty distinct notes across both pages.
    const notes = await rows.evaluateAll((list) =>
      list.map((tr) => tr.querySelector('[data-label="Nota"]').textContent)
    );
    expect(new Set(notes).size).toBe(30);
    await adminCtx.close();
  });

  test("who has Pro: a worker older than this list says to redeploy it", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    const adminCtx = await browser.newContext();
    const page = await adminCtx.newPage();
    await wire(page, worker, admin);
    // What a deploy from before this list answers: it has POST on the path,
    // so GET is a method mismatch, not a missing route.
    await page.route(`${API}/v1/admin/grants?*`, (route) =>
      route.fulfill({
        status: 405,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, reason: "method_not_allowed" })
      })
    );
    await page.goto(`${BASE}/admin.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toHaveAttribute("data-gate", "admin", { timeout: 10000 });
    await expect(page.locator("#holders-counts")).toContainText("Redespliega el worker");
    await expect(page.locator("[data-testid=holders-table]")).toHaveCount(0);
    // And giving Pro still works, which is the point of saying it this way.
    await page.fill("#give-email", "amiga@example.com");
    await page.click("#give-submit");
    await expect(page.locator("#give-result")).toContainText("tiene Pro hasta el");
    await adminCtx.close();
  });

  test("who has Pro: the list reads in English too", async ({ browser }) => {
    const { worker, admin } = await startWorker();
    await worker.call("POST", "/v1/admin/grants", {
      token: admin.token,
      body: { email: "qa.tester@example.com", days: 3650, kind: "comp", note: "QA" }
    });
    const adminCtx = await browser.newContext();
    const page = await openAdmin(adminCtx, worker, admin, { lang: "en" });
    await expect(page.locator("#holders-title")).toHaveText("Who has Pro");
    await expect(page.locator('#holders [data-grant-kind="comp"]')).toHaveText("Test accounts");
    await expect(page.locator('#holders [data-grant-state="active"]')).toHaveText("Running");
    const row = page.locator("[data-testid=holders-table] tbody tr").first();
    await expect(row).toContainText("no end date");
    await expect(page.locator("#holders-counts")).toContainText("test accounts running");
    await expect(page.locator('#give input[name="give-kind"][value="comp"]')).toBeAttached();
    await expect(page.locator("#give fieldset legend")).toHaveText("What you are giving");
    // Switching back redraws rows that were built in the other language.
    await page.click("#admin-lang");
    await expect(page.locator("#holders-title")).toHaveText("Quién tiene Pro");
    await expect(row).toContainText("sin fecha de fin");
    await adminCtx.close();
  });
});
