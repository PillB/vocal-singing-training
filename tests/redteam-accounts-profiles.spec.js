/**
 * Accounts and practice profiles: what the red-team QA pass found, one case per
 * finding.
 *
 * - A shared device: one account's practice was merged into the next account
 *   that signed in on the same browser.
 * - The account panel said "Plan gratis" for the whole visit after one missed
 *   /v1/me, while the header said Pro.
 * - The profile picker kept showing the old profile after "+ Perfil", so
 *   "Renombrar" renamed one the learner could not see.
 * - A page left open (a second tab, a second browser, past midnight) never
 *   showed what had changed outside it.
 * - The admin page's "Reintentar" joined a stale sign-in-methods probe, and
 *   after "Salir" it blamed a browser extension for a server blip.
 * - Copy that was not true: a refused sync promised a retry, a failed payment
 *   read as "se renueva", a burned email code said "espera un momento", and the
 *   trial said "día(s)".
 * - The admin "Borrar progreso local" button asked nothing and cleared the main
 *   profile's takes whatever profile was active.
 * - Profile names: a blank name, an emoji cut in half, a long name that pushed
 *   the picker past its card.
 *
 * The account cases run against the real worker (qa/admin/local-worker.mjs,
 * in-memory SQLite) or a small stub at the network boundary, so nothing needs
 * a deploy.
 */
const path = require("path");
const { pathToFileURL } = require("url");
const { test, expect } = require("@playwright/test");
const { mintLicense, patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://entitlements.test";
const DAY = 86400;
const LAPTOP = { width: 1280, height: 800 };
const PHONE = { width: 390, height: 844 };

/** @type {Promise<Object>|null} */
let modPromise = null;
function localWorkerModule() {
  modPromise =
    modPromise || import(pathToFileURL(path.join(__dirname, "..", "qa", "admin", "local-worker.mjs")).href);
  return modPromise;
}

/** A fresh worker on an in-memory database. */
async function startWorker() {
  const { createLocalWorker } = await localWorkerModule();
  return createLocalWorker({ origin: BASE, admins: "admin@example.com" });
}

/** Every progress row an account holds, read straight from the database. */
async function progressRows(worker, accountId) {
  const res = await worker.env.DB.prepare("SELECT profile_id, doc FROM progress WHERE account_id = ?1")
    .bind(accountId)
    .all();
  return (res && res.results) || [];
}

/** Whether any of an account's stored progress mentions `marker`. */
async function accountHas(worker, accountId, marker) {
  return (await progressRows(worker, accountId)).some((r) => String(r.doc).includes(marker));
}

/** A stand-in for Google's script: draws a plain button, signs nobody in. */
const FAKE_GIS = `window.google = { accounts: { id: {
  initialize: function () {},
  renderButton: function (el) { var b = document.createElement("div"); b.className = "fake-gsi"; b.textContent = "Google"; el.appendChild(b); }
} } };`;

/**
 * Point a page at the local worker. `gis` serves the stand-in Google script
 * instead of refusing it; `log` collects every worker request.
 * @param {import('@playwright/test').Page} page Page.
 * @param {Object} worker Local worker.
 * @param {{gis?: boolean, log?: Array}} [options] Options.
 */
async function wire(page, worker, options) {
  const opts = options || {};
  await patchBillingConfig(page, {
    verification: { apiBaseUrl: API, publicKeyJwk: worker.publicKeyJwk, required: true }
  });
  await page.route("https://accounts.google.com/**", (route) =>
    opts.gis
      ? route.fulfill({ status: 200, contentType: "text/javascript", body: FAKE_GIS })
      : route.abort("failed")
  );
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
    await route
      .fulfill({ status: response.status, headers: out, body: Buffer.from(await response.arrayBuffer()) })
      .catch(() => {});
  });
}

/**
 * Seed the language and the tour once per browser context (a reload keeps
 * whatever the test did since), and optionally a session and more keys.
 * @param {import('@playwright/test').Page} page Page.
 * @param {{lang?: string, session?: Object|null, seed?: Object, e2e?: boolean}} [options] What to seed.
 */
async function seed(page, options) {
  const o = options || {};
  await page.addInitScript(
    ({ lang, session, extra, e2e }) => {
      try {
        if (e2e) sessionStorage.setItem("vt_e2e", "1");
        if (localStorage.getItem("vt_test_seeded")) return;
        localStorage.setItem("vt_test_seeded", "1");
        localStorage.setItem("vt_tour_v1", "1");
        localStorage.setItem("vt_lang", lang);
        if (session) localStorage.setItem("vt_account_session_v1", JSON.stringify(session));
        Object.entries(extra || {}).forEach(([k, v]) => localStorage.setItem(k, typeof v === "string" ? v : JSON.stringify(v)));
      } catch {
        /* ignore */
      }
    },
    { lang: o.lang || "es", session: o.session ? { token: o.session.token, expiresAt: o.session.expiresAt } : null, extra: o.seed || {}, e2e: o.e2e !== false }
  );
}

/** Load the app and wait for its modules. */
async function openApp(page, hash) {
  await page.goto(`${BASE}/${hash || ""}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && !!window.VTStorage && !!window.VTSync && !!window.VTAccount);
}

/** Wait until the signed-in account's /v1/me answer has landed. */
async function signedInAs(page, email) {
  await page.waitForFunction((e) => window.VTAccount.getState().account?.email === e, email);
}

/** Open the account panel, from the phone menu when that is where the door is. */
async function openPanel(page) {
  if (await page.locator("#account-modal").isVisible()) return;
  if (!(await page.locator("#btn-account").isVisible()) && (await page.locator("#btn-more").isVisible())) {
    await page.click("#btn-more");
  }
  await page.click("#btn-account");
  await expect(page.locator("#account-modal")).toBeVisible();
}

/** "Salir" in the account panel, and wait until the panel says signed out. */
async function signOutFromPanel(page) {
  await openPanel(page);
  await page.click("#btn-logout");
  await expect(page.locator("#account-logged-out")).toBeVisible({ timeout: 8000 });
}

/** Swap the session in storage and reload, as a sign-in on this browser leaves it. */
async function switchSession(page, session) {
  await page.evaluate((rec) => {
    localStorage.setItem("vt_account_session_v1", JSON.stringify(rec));
  }, { token: session.token, expiresAt: session.expiresAt });
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTApp && !!window.VTSync);
}

/** Save one take on this browser, tagged with `marker` in its notes. */
async function saveTake(page, marker, exerciseId) {
  await page.evaluate(
    ({ m, id }) => window.VTStorage.saveExerciseResult(id, { score: 8, durationSec: 75, notes: m }),
    { m: marker, id: exerciseId || "v2-volume" }
  );
}

/** Whether this browser's stored record mentions `marker`, in any profile. */
async function deviceHas(page, marker) {
  return page.evaluate((m) => Object.keys(localStorage).some((k) => (localStorage.getItem(k) || "").includes(m) && k !== "vt_sync_aside_v1"), marker);
}

test.describe("A shared browser: one account's practice never goes to the next", () => {
  test.use({ viewport: LAPTOP });

  test("after A signs out, B is asked before this browser's practice goes to B's account", async ({ page }) => {
    const worker = await startWorker();
    const a = await worker.signIn("ana@example.com", { displayName: "Ana" });
    const b = await worker.signIn("bruno@example.com", { displayName: "Bruno" });
    const marker = "ana-private-1";
    await wire(page, worker);
    await seed(page, { session: a });
    await openApp(page);
    await signedInAs(page, "ana@example.com");
    await saveTake(page, marker);
    expect((await page.evaluate(() => window.VTSync.syncNow())).ok).toBe(true);
    expect(await accountHas(worker, a.accountId, marker)).toBe(true);

    await signOutFromPanel(page);
    await switchSession(page, b);
    await signedInAs(page, "bruno@example.com");
    const res = await page.evaluate(() => window.VTSync.syncNow());
    // Nothing of Ana's reaches Bruno's account until Bruno chooses.
    expect(await accountHas(worker, b.accountId, marker)).toBe(false);
    expect(res.ok).toBe(false);
    expect(res.reason).toBe("other_owner");
    // Not an error: the panel asks instead of promising a retry.
    expect(await page.evaluate(() => window.VTSync.getStatus().lastError)).toBe(null);
    await openPanel(page);
    await expect(page.locator("#account-other-owner")).toBeVisible();
    await expect(page.locator("#btn-owner-add")).toHaveText("Añadir la práctica de este dispositivo a esta cuenta");
    await expect(page.locator("#btn-owner-mine")).toHaveText("Usar solo la de mi cuenta");
    // A sync asked for again in the meantime still sends nothing.
    await page.evaluate(() => window.VTSync.syncNow());
    expect(await accountHas(worker, b.accountId, marker)).toBe(false);
  });

  test("'Usar solo la de mi cuenta' keeps A's takes out of B's record, and A gets them back", async ({ page }) => {
    const worker = await startWorker();
    const a = await worker.signIn("ana@example.com", { displayName: "Ana" });
    const b = await worker.signIn("bruno@example.com", { displayName: "Bruno" });
    const marker = "ana-private-2";
    await wire(page, worker);
    await seed(page, { session: a });
    await openApp(page);
    await signedInAs(page, "ana@example.com");
    await saveTake(page, marker);
    expect((await page.evaluate(() => window.VTSync.syncNow())).ok).toBe(true);
    await signOutFromPanel(page);

    await switchSession(page, b);
    await signedInAs(page, "bruno@example.com");
    await openPanel(page);
    await expect(page.locator("#account-other-owner")).toBeVisible();
    await page.click("#btn-owner-mine");
    await expect(page.locator("#account-other-owner")).toBeHidden();
    // Bruno's record on this browser and in his account: none of Ana's takes.
    expect(await deviceHas(page, marker)).toBe(false);
    expect(await accountHas(worker, b.accountId, marker)).toBe(false);
    await page.click("#account-close");
    await page.evaluate(() => {
      location.hash = "#historial";
    });
    await expect(page.locator("#view-history")).toBeVisible();
    await expect(page.locator('#history-list [data-open-ex="v2-volume"]')).toHaveCount(0);
    // Later syncs for Bruno still carry nothing of Ana's.
    expect((await page.evaluate(() => window.VTSync.syncNow())).ok).toBe(true);
    expect(await accountHas(worker, b.accountId, marker)).toBe(false);

    // Ana signs in here again: her takes are back on this browser.
    await signOutFromPanel(page);
    const a2 = await worker.signIn("ana@example.com", { displayName: "Ana" });
    await switchSession(page, a2);
    await signedInAs(page, "ana@example.com");
    expect((await page.evaluate(() => window.VTSync.syncNow())).ok).toBe(true);
    expect(await deviceHas(page, marker)).toBe(true);
    const stash = await page.evaluate(() => localStorage.getItem("vt_sync_aside_v1"));
    expect(stash || "").not.toContain(marker);
    expect(await accountHas(worker, b.accountId, marker)).toBe(false);
  });

  test("'Añadir' adds this browser's practice to B's account", async ({ page }) => {
    const worker = await startWorker();
    const a = await worker.signIn("ana@example.com", { displayName: "Ana" });
    const b = await worker.signIn("bruno@example.com", { displayName: "Bruno" });
    const marker = "shared-take-3";
    await wire(page, worker);
    await seed(page, { session: a });
    await openApp(page);
    await signedInAs(page, "ana@example.com");
    await saveTake(page, marker);
    expect((await page.evaluate(() => window.VTSync.syncNow())).ok).toBe(true);
    await signOutFromPanel(page);

    await switchSession(page, b);
    await signedInAs(page, "bruno@example.com");
    await openPanel(page);
    await expect(page.locator("#account-other-owner")).toBeVisible();
    await page.click("#btn-owner-add");
    await expect(page.locator("#account-other-owner")).toBeHidden();
    await expect.poll(() => accountHas(worker, b.accountId, marker), { timeout: 10000 }).toBe(true);
    expect(await deviceHas(page, marker)).toBe(true);
  });

  test("practice from before any sign-in still goes to the first account, unasked", async ({ page }) => {
    const worker = await startWorker();
    const a = await worker.signIn("ana@example.com", { displayName: "Ana" });
    const marker = "anonymous-take-4";
    await wire(page, worker);
    await seed(page);
    await openApp(page);
    await saveTake(page, marker);
    await switchSession(page, a);
    await signedInAs(page, "ana@example.com");
    expect((await page.evaluate(() => window.VTSync.syncNow())).ok).toBe(true);
    expect(await accountHas(worker, a.accountId, marker)).toBe(true);
    await openPanel(page);
    await expect(page.locator("#account-logged-in")).toBeVisible();
    await expect(page.locator("#account-other-owner")).toBeHidden();
  });

  test("the same account signing in again is not asked, and its practice syncs as before", async ({ page }) => {
    const worker = await startWorker();
    const a = await worker.signIn("ana@example.com", { displayName: "Ana" });
    const marker = "same-account-6";
    await wire(page, worker);
    await seed(page, { session: a });
    await openApp(page);
    await signedInAs(page, "ana@example.com");
    await saveTake(page, marker);
    expect((await page.evaluate(() => window.VTSync.syncNow())).ok).toBe(true);
    await signOutFromPanel(page);
    // Practice done while signed out, then the same person comes back.
    await saveTake(page, "while-away-6", "s4-lip-trills");
    const a2 = await worker.signIn("ana@example.com", { displayName: "Ana" });
    await switchSession(page, a2);
    await signedInAs(page, "ana@example.com");
    const res = await page.evaluate(() => window.VTSync.syncNow());
    expect(res.ok).toBe(true);
    expect(await accountHas(worker, a.accountId, marker)).toBe(true);
    expect(await accountHas(worker, a.accountId, "while-away-6")).toBe(true);
    await openPanel(page);
    await expect(page.locator("#account-logged-in")).toBeVisible();
    await expect(page.locator("#account-other-owner")).toBeHidden();
  });

  test("a browser with no practice in it asks nobody", async ({ page }) => {
    const worker = await startWorker();
    const a = await worker.signIn("ana@example.com", { displayName: "Ana" });
    const b = await worker.signIn("bruno@example.com", { displayName: "Bruno" });
    await wire(page, worker);
    await seed(page, { session: a });
    await openApp(page);
    await signedInAs(page, "ana@example.com");
    expect((await page.evaluate(() => window.VTSync.syncNow())).ok).toBe(true);
    await signOutFromPanel(page);
    await switchSession(page, b);
    await signedInAs(page, "bruno@example.com");
    expect((await page.evaluate(() => window.VTSync.syncNow())).ok).toBe(true);
    await openPanel(page);
    await expect(page.locator("#account-other-owner")).toBeHidden();
  });

  test("Salir first sends the last take to the account that made it", async ({ page }) => {
    const worker = await startWorker();
    const a = await worker.signIn("ana@example.com", { displayName: "Ana" });
    const marker = "last-take-5";
    await wire(page, worker);
    await seed(page, { session: a });
    await openApp(page);
    await signedInAs(page, "ana@example.com");
    expect((await page.evaluate(() => window.VTSync.syncNow())).ok).toBe(true);
    // Saved, and still inside the quiet period before the push.
    await saveTake(page, marker);
    await signOutFromPanel(page);
    await expect.poll(() => accountHas(worker, a.accountId, marker), { timeout: 6000 }).toBe(true);
  });
});

/**
 * An in-page fake of the worker for the account-state cases. `me` is how
 * /v1/me answers: "up", "down" (connection refused), "status" (402), or
 * "hang" (held until `me` goes back up, then dropped, as a server restart does).
 */
function createStub(opts) {
  const o = opts || {};
  return {
    me: "up",
    held: [],
    meCalls: 0,
    methods: { email: true, google: false, trialDays: 7, ...(o.methods || {}) },
    account: { id: "acct_tina", email: "tina@example.com", displayName: "Tina Prueba", role: "member", trialUsed: true, createdAt: 1 },
    entitlement: o.entitlement || { pro: false, plan: null, status: "free", source: null, periodEnd: null, provider: null },
    codes: { current: "424242", next: ["135790"], attempts: 0, burned: false }
  };
}

/** Install the stub; `license` signs the entitlement's token. */
async function installStub(page, stub, license) {
  await patchBillingConfig(page, {
    verification: { apiBaseUrl: API, publicKeyJwk: license.publicKeyJwk, required: true, revalidateHours: 24 * 365 }
  });
  await page.route("https://accounts.google.com/**", (route) => route.abort("failed"));
  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    let body = {};
    try {
      body = request.postDataJSON() || {};
    } catch {
      body = {};
    }
    const headers = { "access-control-allow-origin": "*", "access-control-allow-headers": "content-type, authorization" };
    const json = (status, data) =>
      route.fulfill({ status, contentType: "application/json", headers, body: JSON.stringify(data) }).catch(() => {});
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers }).catch(() => {});
    if (url.pathname === "/v1/auth/methods") return json(200, { ok: true, ...stub.methods });
    if (url.pathname === "/v1/auth/email/start") {
      if (stub.codes.burned || stub.codes.attempts) {
        stub.codes.current = stub.codes.next.shift() || "999999";
        stub.codes.attempts = 0;
        stub.codes.burned = false;
      }
      return json(200, { ok: true, sent: true, expiresInSeconds: 900 });
    }
    if (url.pathname === "/v1/auth/email/verify") {
      // As workers/entitlements/src/accounts.js consumeLoginCode: the fifth
      // wrong try burns the code, and a burned code is no code at all.
      if (stub.codes.burned) return json(401, { ok: false, reason: "no_code" });
      if (body.code !== stub.codes.current) {
        stub.codes.attempts += 1;
        if (stub.codes.attempts >= 5) {
          stub.codes.burned = true;
          return json(401, { ok: false, reason: "too_many_attempts" });
        }
        return json(401, { ok: false, reason: "bad_code" });
      }
      return json(200, { ok: true, sessionToken: "sess-stub-1", expiresAt: 4102444800, ...(await mePayload()) });
    }
    if (url.pathname === "/v1/me" && method === "GET") {
      stub.meCalls += 1;
      if (stub.me === "down") return route.abort("connectionrefused").catch(() => {});
      if (stub.me === "status") return json(402, { ok: false, reason: "payment_required" });
      if (stub.me === "hang") {
        stub.held.push(route);
        return undefined;
      }
      return json(200, await mePayload());
    }
    if (url.pathname === "/v1/me/progress" && method === "GET") return json(200, { ok: true, rev: 0, doc: null, updatedAt: null });
    if (url.pathname === "/v1/me/progress") return json(200, { ok: true, rev: 1, updatedAt: 2 });
    if (url.pathname === "/v1/auth/logout") return json(200, { ok: true });
    return json(404, { ok: false, reason: "not_found" });

    async function mePayload() {
      const ent = stub.entitlement;
      let token = null;
      if (ent.pro) {
        const now = Math.floor(Date.now() / 1000);
        token = await license.sign({
          iss: "vocal-studio-entitlements",
          sub: "grant_stub_0001",
          aud: BASE,
          plan: ent.plan,
          status: ent.status,
          provider: ent.provider || "grant",
          iat: now,
          exp: ent.periodEnd,
          periodEnd: ent.periodEnd,
          accountId: stub.account.id,
          source: ent.source
        });
      }
      return { ok: true, account: stub.account, entitlement: ent, grants: [], paid: [], licenseId: ent.pro ? "grant_stub_0001" : null, token };
    }
  });
}

/** Bring the stub's /v1/me back, dropping anything it held. */
function stubUp(stub) {
  stub.me = "up";
  stub.held.splice(0).forEach((route) => route.abort("connectionreset").catch(() => {}));
}

const TRIAL = () => ({ pro: true, plan: "pro_monthly", status: "active", source: "trial", periodEnd: Math.floor(Date.now() / 1000) + 7 * DAY, provider: null });

test.describe("The account panel after a missed /v1/me", () => {
  test.use({ viewport: LAPTOP });

  for (const kind of ["down", "status", "hang"]) {
    test(`${kind}: opening the panel asks again and shows who is signed in and the plan`, async ({ page }) => {
      const license = await mintLicense({ origin: BASE });
      const stub = createStub({ entitlement: TRIAL() });
      await installStub(page, stub, license);
      await seed(page, { session: { token: "sess-stub-1", expiresAt: 4102444800 } });
      await openApp(page);
      await expect.poll(() => page.evaluate(() => window.VTBilling.isPro())).toBe(true);

      stub.me = kind;
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.waitForFunction(() => !!window.VTApp && !!window.VTAccount);
      await expect.poll(() => stub.meCalls).toBeGreaterThanOrEqual(2);
      await page.waitForTimeout(800);
      // The header kept the stored licence's word; the server is back now.
      await expect(page.locator("#btn-pricing")).toHaveAttribute("data-plan", "trialAccount");
      stubUp(stub);
      await page.waitForTimeout(300);
      const asked = stub.meCalls;
      await openPanel(page);
      await expect.poll(() => stub.meCalls).toBeGreaterThan(asked);
      await expect(page.locator("#account-who")).toContainText("tina@example.com");
      await expect(page.locator("#account-plan")).toContainText("Prueba Pro");
      await expect(page.locator("#account-plan")).not.toContainText("Plan gratis");
      // The door names the person again.
      await expect(page.locator("#btn-account .door-name")).toHaveText("Tina");
    });
  }

  test("while /v1/me still fails, the panel's plan agrees with the header", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const stub = createStub({ entitlement: TRIAL() });
    await installStub(page, stub, license);
    await seed(page, { session: { token: "sess-stub-1", expiresAt: 4102444800 } });
    await openApp(page);
    await expect.poll(() => page.evaluate(() => window.VTBilling.isPro())).toBe(true);
    stub.me = "down";
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTApp && !!window.VTAccount);
    await page.waitForTimeout(800);
    await openPanel(page);
    await page.waitForTimeout(500);
    await expect(page.locator("#btn-pricing")).toHaveAttribute("data-plan", "trialAccount");
    await expect(page.locator("#account-plan")).toContainText("Prueba Pro");
    await expect(page.locator("#account-plan")).not.toContainText("Plan gratis");
  });
});

/** A Pro browser (the browser-local trial, day 2 of 7) with no worker at all. */
async function bootPro(page, opts) {
  const o = opts || {};
  await patchBillingConfig(page, { verification: { apiBaseUrl: "" } });
  await seed(page, {
    lang: o.lang || "es",
    e2e: o.e2e,
    seed: {
      vt_billing_trial_started_v1: new Date(Date.now() - (o.trialDaysAgo ?? 2) * DAY * 1000).toISOString(),
      ...(o.seed || {})
    }
  });
  await openApp(page, o.hash || "#historial");
}

/** Answer the next native dialogs from a list (a prompt gets the text, a confirm true/false). */
function answerDialogs(page, list) {
  const queue = list.slice();
  const seen = [];
  page.on("dialog", async (d) => {
    const a = queue.length ? queue.shift() : null;
    seen.push({ type: d.type(), message: d.message() });
    if (d.type() === "prompt") {
      if (a === null || a === false) await d.dismiss().catch(() => {});
      else await d.accept(String(a)).catch(() => {});
    } else if (a) await d.accept().catch(() => {});
    else await d.dismiss().catch(() => {});
  });
  return { seen, push: (...x) => queue.push(...x) };
}

const optionLabels = (page) =>
  page.evaluate(() => [...document.querySelectorAll("#sel-profile option")].map((o) => o.textContent));

test.describe("Practice profiles", () => {
  test.use({ viewport: PHONE });

  test("after + Perfil the picker shows the new profile, and Renombrar renames that one", async ({ page }) => {
    await bootPro(page);
    answerDialogs(page, ["Bea", "Beatriz"]);
    await page.click("#btn-profile-add");
    await expect.poll(() => page.evaluate(() => window.VTStorage.getProfiles().list.length)).toBe(2);
    const r = await page.evaluate(() => {
      const sel = document.querySelector("#sel-profile");
      return { active: window.VTStorage.getActiveProfileId(), shown: sel.value, label: sel.selectedOptions[0]?.textContent };
    });
    expect(r.shown).toBe(r.active);
    expect(r.label).toBe("Bea");
    await page.click("#btn-profile-rename");
    await expect.poll(() => page.evaluate(() => window.VTStorage.getActiveProfile().name)).toBe("Beatriz");
    const names = await page.evaluate(() => window.VTStorage.getProfiles().list.map((p) => p.name));
    expect(names).toEqual(["Default", "Beatriz"]);
    await expect(page.locator("#sel-profile option:checked")).toHaveText("Beatriz");
  });

  test("a blank name makes no profile and renames nothing", async ({ page }) => {
    await bootPro(page);
    const d = answerDialogs(page, ["   "]);
    await page.click("#btn-profile-add");
    await expect.poll(() => d.seen.length).toBe(1);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.VTStorage.getProfiles().list.length)).toBe(1);

    d.push("Ana");
    await page.click("#btn-profile-add");
    await expect.poll(() => page.evaluate(() => window.VTStorage.getProfiles().list.length)).toBe(2);
    d.push("    ");
    await page.click("#btn-profile-rename");
    await expect.poll(() => d.seen.length).toBe(3);
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.VTStorage.getActiveProfile().name)).toBe("Ana");
    const labels = await optionLabels(page);
    expect(labels).toEqual(["Principal", "Ana"]);
    expect(labels.every((l) => l.trim().length > 0)).toBe(true);
    // The storage layer refuses an empty name itself, whoever asks.
    const direct = await page.evaluate(() => window.VTStorage.createProfile("    "));
    expect(direct.ok).toBe(false);
  });

  test("a name cut to 32 characters keeps a whole emoji", async ({ page }) => {
    await bootPro(page);
    answerDialogs(page, ["Abcdefghijklmnopqrstuvwxyz01234🎤 extra"]);
    await page.click("#btn-profile-add");
    await expect.poll(() => page.evaluate(() => window.VTStorage.getProfiles().list.length)).toBe(2);
    const name = await page.evaluate(() => window.VTStorage.getActiveProfile().name);
    const loneSurrogate = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(^|[^\uD800-\uDBFF])[\uDC00-\uDFFF]/;
    expect(loneSurrogate.test(name)).toBe(false);
    expect(name).toBe("Abcdefghijklmnopqrstuvwxyz01234🎤");
    const labels = await optionLabels(page);
    expect(labels.some((l) => loneSurrogate.test(l))).toBe(false);
  });

  for (const width of [390, 320]) {
    for (const lang of ["es", "en"]) {
      test(`${width}px ${lang}: a long profile name keeps the picker inside its card`, async ({ page }) => {
        await page.setViewportSize({ width, height: width === 320 ? 568 : 844 });
        await bootPro(page, { lang });
        answerDialogs(page, ["MARÍA JOSÉ FERNÁNDEZ VALDERRAMA", "Guillermo Alejandro Montenegro"]);
        for (let i = 2; i <= 3; i += 1) {
          await page.click("#btn-profile-add");
          await expect.poll(() => page.evaluate(() => window.VTStorage.getProfiles().list.length)).toBe(i);
        }
        await page.locator("#history-profiles").scrollIntoViewIfNeeded();
        const r = await page.evaluate(() => {
          const card = document.querySelector("#history-profiles").getBoundingClientRect();
          const sel = document.querySelector("#sel-profile").getBoundingClientRect();
          return {
            cardRight: card.right,
            selRight: sel.right,
            selWidth: sel.width,
            docWidth: document.documentElement.scrollWidth,
            vw: window.innerWidth
          };
        });
        expect(r.selRight).toBeLessThanOrEqual(r.cardRight + 0.5);
        expect(r.docWidth).toBeLessThanOrEqual(r.vw);
        // Still a usable control, not squeezed to nothing.
        expect(r.selWidth).toBeGreaterThan(80);
      });
    }
  }
});

const TWO_PROFILES = () => {
  const at = new Date(Date.now() - 20 * DAY * 1000).toISOString();
  return {
    activeId: "default",
    profiles: {
      default: { id: "default", name: "Default", createdAt: at },
      p1: { id: "p1", name: "Ana", createdAt: at }
    }
  };
};

test.describe("A page left open shows what changed outside it", () => {
  test.use({ viewport: LAPTOP });

  test("tab B's picker follows a profile switch made in tab A", async ({ context }) => {
    const a = await context.newPage();
    await bootPro(a, { seed: { vt_profiles_v1: TWO_PROFILES() } });
    const b = await context.newPage();
    await bootPro(b, { seed: { vt_profiles_v1: TWO_PROFILES() } });
    await expect(b.locator("#sel-profile")).toHaveValue("default");
    await a.bringToFront();
    await a.selectOption("#sel-profile", "p1");
    await expect(b.locator("#sel-profile")).toHaveValue("p1", { timeout: 3000 });
    await expect(b.locator("#sel-profile option:checked")).toHaveText("Ana");
  });

  test("tab B's Historial shows a take saved in tab A", async ({ context }) => {
    const a = await context.newPage();
    await bootPro(a, { hash: "#practicar" });
    const b = await context.newPage();
    await bootPro(b, { hash: "#historial" });
    await expect(b.locator('#history-list [data-open-ex="v2-volume"]')).toHaveCount(0);
    await saveTake(a, "tab-a-take");
    await expect(b.locator('#history-list [data-open-ex="v2-volume"]').first()).toBeVisible({ timeout: 3000 });
  });

  test("an open browser pulls another browser's take within 2 s of being shown again", async ({ browser }) => {
    const worker = await startWorker();
    const one = await worker.signIn("eva@example.com", { displayName: "Eva" });
    const two = await worker.signIn("eva@example.com", { displayName: "Eva" });
    const log1 = [];
    const c1 = await browser.newContext({ viewport: LAPTOP });
    const p1 = await c1.newPage();
    await wire(p1, worker, { log: log1 });
    await seed(p1, { session: one });
    await openApp(p1, "#historial");
    // Browser 1's own first sync after signing in has finished.
    await expect.poll(() => log1.some((r) => r.method === "PUT" && r.path === "/v1/me/progress"), { timeout: 15000 }).toBe(true);
    await expect.poll(() => p1.evaluate(() => window.VTSync.getStatus().syncing)).toBe(false);

    const c2 = await browser.newContext({ viewport: LAPTOP });
    const p2 = await c2.newPage();
    await wire(p2, worker);
    await seed(p2, { session: two });
    await openApp(p2);
    await signedInAs(p2, "eva@example.com");
    await saveTake(p2, "browser-two-take", "s4-lip-trills");
    expect((await p2.evaluate(() => window.VTSync.syncNow())).ok).toBe(true);

    await p1.bringToFront();
    await p1.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => deviceHas(p1, "browser-two-take"), { timeout: 2000 }).toBe(true);
    await expect(p1.locator('#history-list [data-open-ex="s4-lip-trills"]').first()).toBeVisible({ timeout: 2000 });
    await c1.close();
    await c2.close();
  });

  /** Put a page on the site's origin at a local time, with the clock installed. */
  async function atLocalTime(page, parts) {
    await page.clock.install({ time: new Date("2026-10-25T15:00:00Z") });
    await page.goto(`${BASE}/css/admin.css`);
    await page.clock.setSystemTime(await page.evaluate((p) => new Date(...p).getTime(), parts));
  }

  async function showAgain(page) {
    await page.evaluate(() => {
      Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" });
      Object.defineProperty(document, "hidden", { configurable: true, get: () => false });
      document.dispatchEvent(new Event("visibilitychange"));
    });
  }

  test("Plan left open past midnight opens the review that is due", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await atLocalTime(page, [2026, 9, 25, 10, 0]);
    await patchBillingConfig(page, { verification: { apiBaseUrl: "" } });
    await seed(page, { seed: { vt_settings_v1: { lastTab: "vocal" } } });
    await openApp(page, "#plan");
    await page.click("#element-chips .chip");
    await page.click("#btn-plan-start");
    await page.clock.runFor(500);
    await page.clock.setSystemTime(await page.evaluate(() => new Date(2026, 9, 31, 23, 59, 30).getTime()));
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTApp);
    await page.clock.runFor(800);
    await expect(page.locator("#plan-review-when")).toBeVisible();
    await expect(page.locator("#plan-review-body")).toBeHidden();
    await page.clock.runFor(60 * 1000);
    await showAgain(page);
    await page.clock.runFor(800);
    expect(await page.evaluate(() => window.VTDays.dayKey())).toBe("2026-11-01");
    await expect(page.locator("#plan-review-body")).toBeVisible();
  });

  test("Historial left open past midnight moves 'hoy' to the new day", async ({ page }) => {
    await page.setViewportSize(PHONE);
    await atLocalTime(page, [2026, 9, 31, 23, 59, 30]);
    await patchBillingConfig(page, { verification: { apiBaseUrl: "" } });
    const day = () => ({ sec: 240, n: 2, ex: ["s4-lip-trills"] });
    await seed(page, {
      seed: {
        vt_settings_v1: { lastTab: "singing" },
        vt_days_v1: { v: 1, days: { "2026-10-28": day(), "2026-10-29": day(), "2026-10-30": day() }, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true }
      }
    });
    await openApp(page, "#historial");
    await page.clock.runFor(800);
    await expect(page.locator(".hist-cal td.is-today")).toHaveText(/^31/);
    await page.clock.runFor(60 * 1000);
    await showAgain(page);
    await page.clock.runFor(800);
    await expect(page.locator(".hist-cal td.is-today")).toHaveText(/^1(?!\d)/);
  });
});

test.describe("Admin page: the sign-in methods probe", () => {
  test.use({ viewport: LAPTOP });

  test("Reintentar asks again even while the page's idle probe is still out", async ({ page }) => {
    const worker = await startWorker();
    // Hold idle callbacks so the test decides when the idle probe goes out.
    await page.addInitScript(() => {
      window.__held = [];
      window.requestIdleCallback = (cb) => (window.__held.push(cb), 1);
    });
    await wire(page, worker);
    await seed(page);
    // The server is away, then the idle probe goes out and hangs, then the
    // server is back: the methods route answers by mode.
    let mode = "away";
    const hanging = [];
    await page.route(`${API}/v1/auth/methods`, (route) => {
      if (mode === "away") return route.abort("failed");
      if (mode === "hang") {
        hanging.push(route);
        return undefined;
      }
      return route.fallback();
    });
    await page.goto(`${BASE}/admin.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toHaveAttribute("data-gate", "unreachable", { timeout: 10000 });
    mode = "hang";
    const held = await page.evaluate(() => {
      const n = window.__held.length;
      window.__held.splice(0).forEach((cb) => cb({ didTimeout: true, timeRemaining: () => 0 }));
      return n;
    });
    expect(held).toBeGreaterThan(0);
    await expect.poll(() => hanging.length).toBeGreaterThan(0);
    // The server is back; the stale probe is still out.
    mode = "pass";
    await page.click("#gate-retry");
    await expect(page.locator("body")).toHaveAttribute("data-gate", "signedOut", { timeout: 5000 });
    // And the stale probe failing afterwards does not undo it.
    hanging.splice(0).forEach((route) => route.abort("failed").catch(() => {}));
    await page.waitForTimeout(700);
    await expect(page.locator("body")).toHaveAttribute("data-gate", "signedOut");
  });

  test("Try again while an earlier probe still hangs reaches sign-in", async ({ page }) => {
    const worker = await startWorker();
    // The page's own idle probe would race the ones this test sends.
    await page.addInitScript(() => {
      window.requestIdleCallback = () => 1;
    });
    await wire(page, worker);
    await seed(page);
    await page.route(`${API}/v1/auth/methods`, (route) => route.abort("failed"));
    await page.goto(`${BASE}/admin.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toHaveAttribute("data-gate", "unreachable", { timeout: 10000 });
    await page.unroute(`${API}/v1/auth/methods`);
    // Somebody asks again while the server is still away (the page's idle
    // probe does exactly this call), and that probe hangs.
    const hanging = [];
    await page.route(`${API}/v1/auth/methods`, (route) => {
      hanging.push(route);
    });
    await page.evaluate(() => {
      window.VTAccount.ensureMethods();
    });
    await expect.poll(() => hanging.length).toBe(1);
    // The server is back. Try again must not wait on the hanging probe.
    await page.unroute(`${API}/v1/auth/methods`);
    await page.click("#gate-retry");
    await expect(page.locator("body")).toHaveAttribute("data-gate", "signedOut", { timeout: 5000 });
    // The old probe fails now; it must not overwrite the fresh answer.
    hanging.splice(0).forEach((route) => route.abort("failed").catch(() => {}));
    await page.waitForTimeout(700);
    await expect(page.locator("body")).toHaveAttribute("data-gate", "signedOut");
    expect(await page.evaluate(() => window.VTAccount.getState().methods?.ok)).toBe(true);
  });

  test("after Salir, with the server answering again, Google's button draws", async ({ page }) => {
    const worker = await startWorker();
    const admin = await worker.signIn("admin@example.com", { displayName: "Admin" });
    await wire(page, worker, { gis: true });
    await seed(page, { session: admin });
    // A blip: the methods answer fails while the page loads.
    let blip = true;
    await page.route(`${API}/v1/auth/methods`, (route) =>
      blip
        ? route.fulfill({ status: 503, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: '{"ok":false,"reason":"starting"}' })
        : route.fallback()
    );
    await page.goto(`${BASE}/admin.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toHaveAttribute("data-gate", "admin", { timeout: 15000 });
    await page.waitForFunction(() => window.VTAccount.getState().methods && window.VTAccount.getState().methods.ok === false, null, { timeout: 8000 });
    blip = false;
    await page.click("#admin-signout");
    await expect(page.locator("body")).toHaveAttribute("data-gate", "signedOut");
    await expect(page.locator("#gate-google .fake-gsi")).toBeVisible({ timeout: 5000 });
    await expect(page.locator("#gate-google-fallback")).toBeHidden();
  });

  test("after Salir, with the server still away, the page says so instead of blaming an extension", async ({ page }) => {
    const worker = await startWorker();
    const admin = await worker.signIn("admin@example.com", { displayName: "Admin" });
    await wire(page, worker, { gis: true });
    await seed(page, { session: admin });
    await page.route(`${API}/v1/auth/methods`, (route) => route.abort("failed"));
    await page.goto(`${BASE}/admin.html`, { waitUntil: "domcontentloaded" });
    await expect(page.locator("body")).toHaveAttribute("data-gate", "admin", { timeout: 15000 });
    await page.click("#admin-signout");
    await expect(page.locator("body")).toHaveAttribute("data-gate", "unreachable", { timeout: 8000 });
    await expect(page.locator("#gate-google-fallback")).toBeHidden();
  });
});

test.describe("Copy that says only what is true", () => {
  test.use({ viewport: LAPTOP });

  test("a refused fourth profile says why, and nothing is tried again", async ({ page }) => {
    const worker = await startWorker();
    const y = await worker.signIn("yara@example.com", { displayName: "Yara" });
    // The account already keeps three profiles from other devices.
    for (const id of ["p_o1", "p_o2", "p_o3"]) {
      const r = await worker.call("PUT", "/v1/me/progress", { token: y.token, body: { profileId: id, doc: { v: 1 }, baseRev: 0 } });
      expect(r.status).toBe(200);
    }
    const log = [];
    await page.clock.install();
    await wire(page, worker, { log });
    await seed(page, { session: y });
    await openApp(page);
    await signedInAs(page, "yara@example.com");
    await saveTake(page, "fourth-profile-take");
    const res = await page.evaluate(() => window.VTSync.syncNow());
    expect(res.reason).toBe("refused");
    await openPanel(page);
    await expect(page.locator("#account-sync")).toHaveText("No se guardó: tu cuenta ya tiene sus 3 perfiles.");
    await expect(page.locator("#account-sync")).not.toContainText("intentaremos");
    const puts = log.filter((r) => r.method === "PUT").length;
    await page.clock.runFor(130000);
    await page.waitForTimeout(300);
    expect(log.filter((r) => r.method === "PUT").length).toBe(puts);
  });

  for (const lang of ["es", "en"]) {
    test(`${lang}: a payment that did not go through reads as pending, never as renewing`, async ({ page }) => {
      const license = await mintLicense({ origin: BASE });
      const stub = createStub({
        entitlement: { pro: true, plan: "pro_monthly", status: "past_due", source: "paid", periodEnd: Math.floor(Date.now() / 1000) + 3 * DAY, provider: "stripe" }
      });
      await installStub(page, stub, license);
      await seed(page, { lang, session: { token: "sess-stub-1", expiresAt: 4102444800 } });
      await openApp(page);
      await signedInAs(page, "tina@example.com");
      const t = lang === "es"
        ? { pill: "Pro · pago pendiente", line: "El último cobro no se pudo hacer.", renew: /renueva/ }
        : { pill: "Pro · payment pending", line: "The last payment did not go through.", renew: /renew/i };
      await expect(page.locator("#btn-pricing")).toHaveText(t.pill);
      await openPanel(page);
      await expect(page.locator("#account-plan")).toContainText(t.line);
      await expect(page.locator("#account-plan")).not.toContainText(t.renew);
      await page.click("#account-close");
      await page.evaluate(() => window.VTApp.openPricing());
      await expect(page.locator("#pricing-status")).toBeVisible();
      await expect(page.locator("#pricing-status")).not.toContainText(t.renew);
      await expect(page.locator("#pricing-status")).toContainText(t.pill);
    });
  }

  test("after five wrong codes the panel offers a new code, and the new code signs in", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const stub = createStub();
    await installStub(page, stub, license);
    await seed(page);
    await openApp(page);
    await openPanel(page);
    await expect(page.locator("#account-email-form")).toBeVisible();
    await page.fill("#account-email", "nuevo@example.com");
    await page.click("#account-email-submit");
    await expect(page.locator("#account-code-form")).toBeVisible();
    for (let i = 0; i < 5; i += 1) {
      await page.fill("#account-code", "000000");
      await page.click("#account-code-submit");
      await expect.poll(() => stub.codes.attempts).toBe(i + 1);
      await expect(page.locator("#account-error")).toBeVisible();
    }
    await expect(page.locator("#account-error")).toHaveText("Este código ya no sirve. Pide uno nuevo.");
    await expect(page.locator("#account-error")).not.toContainText("espera");
    // Typing the right one now is no use either, and says so.
    await page.fill("#account-code", "424242");
    await page.click("#account-code-submit");
    await expect(page.locator("#account-error")).toHaveText("Este código ya no sirve. Pide uno nuevo.");
    await expect(page.locator("#account-code-resend")).toBeVisible();
    await page.click("#account-code-resend");
    await expect.poll(() => stub.codes.current).toBe("135790");
    await expect(page.locator("#account-code-form")).toBeVisible();
    await expect(page.locator("#account-error")).toBeHidden();
    await page.fill("#account-code", "135790");
    await page.click("#account-code-submit");
    await expect(page.locator("#account-logged-in")).toBeVisible();
  });

  for (const lang of ["es", "en"]) {
    for (const n of [7, 1]) {
      test(`${lang}: the trial line agrees with ${n} day${n === 1 ? "" : "s"}`, async ({ page }) => {
        // Started 0 days ago: 7 left. Started 6.5 days ago: the last day.
        await bootPro(page, { lang, trialDaysAgo: n === 7 ? 0 : 6.5, hash: "#" });
        await page.evaluate(() => window.VTApp.openPricing());
        const status = page.locator("#pricing-status");
        await expect(status).toBeVisible();
        const want = {
          es: { 7: "Te quedan 7 días de prueba Pro", 1: "Te queda 1 día de prueba Pro" },
          en: { 7: "7 days left on Pro trial", 1: "1 day left on Pro trial" }
        }[lang][n];
        await expect(status).toContainText(want);
        await expect(status).not.toContainText("(s)");
      });
    }
  }

  test("the trial-ending note has a one-day form in both languages", async ({ page }) => {
    await bootPro(page, { hash: "#" });
    const s = await page.evaluate(() => {
      const t = (lang, key, n) => (window.VTI18n.strings[lang][key] || "(missing)").replace("{n}", String(n));
      return {
        es: [t("es", "value.moment.trial_ending", 2), t("es", "value.moment.trial_ending_one", 1)],
        en: [t("en", "value.moment.trial_ending", 2), t("en", "value.moment.trial_ending_one", 1)]
      };
    });
    expect(s.es[0]).toContain("2 días");
    expect(s.es[1]).toContain("1 día.");
    expect(s.en[0]).toContain("2 days");
    expect(s.en[1]).toContain("1 day.");
    for (const line of [...s.es, ...s.en]) expect(line).not.toContain("(s)");
  });
});

test.describe("Admin tools: Borrar progreso local", () => {
  test.use({ viewport: LAPTOP });

  /** Two profiles with a full record each, Ana active, an internal admin signed in. */
  async function bootAdmin(page) {
    const at = new Date(Date.now() - 2 * DAY * 1000).toISOString();
    const progress = (tag) => ({ "v2-volume": { completedCount: 1, lastScore: 7, lastAt: at, history: [{ id: tag, at, metrics: {}, score: 7, notes: tag, durationSec: 60 }] } });
    const pad = (n) => String(n).padStart(2, "0");
    const d = new Date(Date.now() - DAY * 1000);
    const key = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    const days = { v: 1, days: { [key]: { sec: 240, n: 2, ex: ["v2-volume"] } }, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true };
    const plan = { weekNumber: 1, element: "Volume", status: "active", startedAt: at, checkIns: [], reviews: [], completedElements: [] };
    const profiles = TWO_PROFILES();
    profiles.activeId = "p1";
    await patchBillingConfig(page, { verification: { apiBaseUrl: "" } });
    await page.addInitScript(() => {
      sessionStorage.setItem("vt_auth_session_v1", JSON.stringify({ username: "qa-admin", role: "admin", at: Date.now() }));
    });
    await seed(page, {
      seed: {
        vt_profiles_v1: profiles,
        vt_progress_v1: progress("main-take"),
        vt_days_v1: days,
        vt_week_plan_v1: plan,
        vt_achievements_v1: { first: true },
        vt_prof_p1_vt_progress_v1: progress("ana-take"),
        vt_prof_p1_vt_days_v1: days,
        vt_prof_p1_vt_week_plan_v1: plan,
        vt_prof_p1_vt_achievements_v1: { first: true },
        vt_prof_p1_vt_reviews_v1: [{ week: 1, element: "Volume", verdict: "improved", at }]
      }
    });
    await openApp(page, "#historial");
    await openPanel(page);
    await expect(page.locator("#admin-clear-progress")).toBeVisible();
  }

  // The day ledger is drawn again at once (reading it writes an empty one), so
  // "cleared" for it means no days in it, not no key.
  const ANA_KEYS = ["vt_prof_p1_vt_progress_v1", "vt_prof_p1_vt_week_plan_v1", "vt_prof_p1_vt_achievements_v1", "vt_prof_p1_vt_reviews_v1"];
  const MAIN_KEYS = ["vt_progress_v1", "vt_days_v1", "vt_week_plan_v1", "vt_achievements_v1"];
  const held = (page, keys) => page.evaluate((ks) => ks.filter((k) => localStorage.getItem(k) !== null), keys);
  const daysHeld = (page, key) =>
    page.evaluate((k) => {
      const raw = localStorage.getItem(k);
      return raw ? Object.keys(JSON.parse(raw).days || {}).length : 0;
    }, key);

  test("asks first, then clears the active profile's whole record and leaves the main one", async ({ page }) => {
    await bootAdmin(page);
    const d = answerDialogs(page, [true]);
    await page.click("#admin-clear-progress");
    await expect.poll(() => d.seen.length).toBe(1);
    expect(d.seen[0].type).toBe("confirm");
    await expect.poll(() => held(page, ANA_KEYS)).toEqual([]);
    expect(await daysHeld(page, "vt_prof_p1_vt_days_v1")).toBe(0);
    expect(await held(page, MAIN_KEYS)).toEqual(MAIN_KEYS);
    expect(await daysHeld(page, "vt_days_v1")).toBe(1);
    expect(await deviceHas(page, "main-take")).toBe(true);
    // Historial, open behind the panel, now shows Ana's empty record.
    await page.click("#account-close");
    await expect(page.locator('#history-list [data-open-ex="v2-volume"]')).toHaveCount(0);
  });

  test("saying no clears nothing, and Quitar Pro local asks too", async ({ page }) => {
    await bootAdmin(page);
    const d = answerDialogs(page, [false, false]);
    await page.click("#admin-clear-progress");
    await expect.poll(() => d.seen.length).toBe(1);
    await page.waitForTimeout(300);
    expect(await held(page, ANA_KEYS)).toEqual(ANA_KEYS);
    expect(await daysHeld(page, "vt_prof_p1_vt_days_v1")).toBe(1);
    await page.click("#admin-clear-billing");
    await expect.poll(() => d.seen.length).toBe(2);
    expect(d.seen[1].type).toBe("confirm");
  });
});
