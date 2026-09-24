/**
 * Accounts in the browser: sign in, gifted months, and saved progress.
 *
 * The entitlements worker is stubbed at the network boundary with
 * `page.route`, so these exercise the real client modules — VTAccount,
 * VTSync, VTLicense — against realistic answers without a deploy. The license
 * tokens the stub hands back are genuinely signed with a throwaway key, so the
 * signature check that decides Pro is the real one.
 */
const { test, expect } = require("@playwright/test");
const { mintLicense, patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://entitlements.test";
const DAY = 86400;

/**
 * A small in-page fake of the worker.
 *
 * Holds just enough state to make the flows real: one account, its grants, and
 * one progress document with a revision.
 */
function createWorkerStub(options) {
  const opts = options || {};
  return {
    methods: { email: true, google: true, googleClientId: "test.apps.googleusercontent.com", trialDays: 30, ...(opts.methods || {}) },
    account: {
      id: "acct_test",
      email: "pablo@example.test",
      displayName: null,
      locale: null,
      role: opts.role || "member",
      trialUsed: !!opts.trialUsed,
      createdAt: 1
    },
    entitlement: opts.entitlement || { pro: false, plan: null, status: "free", source: null, periodEnd: null, provider: null },
    grants: [],
    token: null,
    licenseId: null,
    progress: opts.progress || null,
    rev: opts.rev || 0,
    // Overrides for the A/B results answer, merged over the default below.
    abResults: opts.abResults || null,
    sentCode: "424242",
    calls: []
  };
}

/**
 * Install the stub and point the site at it.
 * @param {import('@playwright/test').Page} page Page.
 * @param {object} stub Stub state.
 * @param {{publicKeyJwk: object, sign: function}} license Signing material.
 */
async function installWorker(page, stub, license) {
  await patchBillingConfig(page, {
    verification: {
      apiBaseUrl: API,
      publicKeyJwk: license.publicKeyJwk,
      required: true,
      revalidateHours: 24 * 365
    }
  });

  await page.route(`${API}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname;
    const method = request.method();
    let body = {};
    try {
      body = request.postDataJSON() || {};
    } catch {
      body = {};
    }
    stub.calls.push({ method, path, body });

    /** Answer with JSON. */
    const json = (status, data) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(data)
      });

    if (method === "OPTIONS") return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    if (path === "/v1/auth/methods") return json(200, { ok: true, ...stub.methods });

    if (path === "/v1/auth/email/start") {
      if (!stub.methods.email) return json(503, { ok: false, reason: "email_not_configured" });
      return json(200, { ok: true, sent: true, expiresInSeconds: 900 });
    }

    if (path === "/v1/auth/email/verify") {
      if (body.code !== stub.sentCode) return json(401, { ok: false, reason: "bad_code" });
      return json(200, { ok: true, sessionToken: "sess-token-1", expiresAt: 4102444800, ...(await mePayload(stub)) });
    }

    const authorized = (request.headers().authorization || "").includes("sess-token-1");
    if (path.startsWith("/v1/me") || path.startsWith("/v1/admin")) {
      if (!authorized) return json(401, { ok: false, reason: "no_session" });
    }

    if (path === "/v1/me" && method === "GET") return json(200, await mePayload(stub));

    if (path === "/v1/me/trial") {
      if (stub.account.trialUsed) return json(409, { ok: false, reason: "trial_used" });
      stub.account.trialUsed = true;
      const periodEnd = Math.floor(Date.now() / 1000) + 30 * DAY;
      stub.entitlement = { pro: true, plan: "pro_monthly", status: "active", source: "trial", periodEnd, provider: null };
      stub.grants = [{ id: "grant_trial", kind: "trial", plan: "pro_monthly", startsAt: 0, endsAt: periodEnd, status: "active", note: null, source: "trial", revokedAt: null }];
      return json(200, await mePayload(stub, license));
    }

    if (path === "/v1/me/redeem") {
      const code = String(body.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
      if (code !== "VOCALGIFT2026") return json(404, { ok: false, reason: "not_found" });
      const periodEnd = Math.floor(Date.now() / 1000) + 30 * DAY;
      stub.entitlement = { pro: true, plan: "pro_monthly", status: "active", source: "gift", periodEnd, provider: null };
      return json(200, { ...(await mePayload(stub, license)), redeemedDays: 30 });
    }

    if (path === "/v1/me/progress" && method === "GET") {
      if (url.searchParams.get("profileId")) {
        return json(200, { ok: true, rev: stub.rev, doc: stub.progress, updatedAt: 1 });
      }
      return json(200, { ok: true, profiles: [] });
    }

    if (path === "/v1/me/progress" && (method === "PUT" || method === "POST")) {
      if (Number(body.baseRev || 0) !== stub.rev) {
        return json(409, { ok: false, reason: "conflict", server: { rev: stub.rev, doc: stub.progress, updatedAt: 1 } });
      }
      stub.rev += 1;
      stub.progress = body.doc;
      return json(200, { ok: true, rev: stub.rev, updatedAt: 2 });
    }

    if (path === "/v1/admin/gift-codes" && method === "POST") {
      if (stub.account.role !== "admin") return json(403, { ok: false, reason: "forbidden" });
      return json(200, { ok: true, giftCode: { code: "VOCAL-GIFT-2026", plan: "pro_monthly", days: body.days, maxRedemptions: body.maxRedemptions, redeemedCount: 0 } });
    }
    if (path === "/v1/admin/gift-codes" && method === "GET") {
      if (stub.account.role !== "admin") return json(403, { ok: false, reason: "forbidden" });
      return json(200, { ok: true, giftCodes: [{ code: "VOCAL-GIFT-2026", plan: "pro_monthly", days: 30, maxRedemptions: 5, redeemedCount: 1, note: null, expiresAt: null, revokedAt: null, createdAt: 1 }] });
    }
    if (path === "/v1/admin/grants" && method === "POST") {
      if (stub.account.role !== "admin") return json(403, { ok: false, reason: "forbidden" });
      return json(200, { ok: true, account: { email: body.email }, grant: { id: "grant_1", status: "active" } });
    }
    if (path === "/v1/admin/experiments" && method === "GET") {
      if (stub.account.role !== "admin") return json(403, { ok: false, reason: "forbidden" });
      return json(200, {
        ok: true,
        experiments: [
          { experiment: "aa_2026_10", arms: [{ variant: "a", exposed: 412 }, { variant: "b", exposed: 398 }], srm: { p: 0.62, flagged: false } },
          { experiment: "loop_home_2026_10", arms: [], srm: { p: null, flagged: false } }
        ],
        ingest: {
          since: "2026-09-17",
          days: [{ day: "2026-09-23", counts: { accepted: 1240, unknown_event: 2 } }],
          totals: { accepted: 1240, unknown_event: 2 },
          lastAcceptedAt: 1790000000
        }
      });
    }
    if (path === "/v1/admin/experiments/results" && method === "GET") {
      if (stub.account.role !== "admin") return json(403, { ok: false, reason: "forbidden" });
      // Shaped exactly like workers/entitlements/src/events.js answers.
      return json(200, {
        ok: true,
        experiment: url.searchParams.get("experiment"),
        control: "a",
        exposed: [{ variant: "a", n: 412 }, { variant: "b", n: 398 }],
        srm: { chi2: 0.24, df: 1, p: 0.62, weights: [1, 1], flagged: false },
        horizon: { nPerArm: 150, minDays: 14, mde: null, maxTo: 7, startedAt: 1788000000, cohortEnd: 1788500000, readyAt: 1789200000, estimated: false, reached: true, counted: 150 },
        eventMix: {
          events: [{ event: "app_open", from: -1, to: 1, arms: [{ variant: "a", n: 412, k: 412, share: 1 }, { variant: "b", n: 398, k: 398, share: 1 }], p: 1, flagged: false, reason: null }],
          flagged: false
        },
        metrics: [
          {
            role: "primary", event: "practice_day", kind: "share", from: 0, to: 7,
            arms: [
              { variant: "a", n: 380, k: 152, rate: 0.4, lo: 0.352, hi: 0.45 },
              { variant: "b", n: 371, k: 150, rate: 0.4043, lo: 0.356, hi: 0.455 }
            ],
            comparisons: [{ variant: "b", vs: "a", diff: 0.0043, lo: -0.065, hi: 0.074, z: 0.12, p: 0.904 }],
            smallSample: false
          },
          {
            role: "guardrail", event: "app_open", kind: "days", from: 0, to: 7,
            arms: [
              { variant: "a", n: 380, mean: 2.1, sd: 1.4, lo: 1.96, hi: 2.24 },
              { variant: "b", n: 371, mean: 2.08, sd: 1.5, lo: 1.93, hi: 2.23 }
            ],
            comparisons: [{ variant: "b", vs: "a", diff: -0.02, lo: -0.23, hi: 0.19, z: -0.19, p: 0.85 }],
            smallSample: false
          }
        ],
        readMe: "ok",
        ...(stub.abResults || {})
      });
    }
    if (path === "/v1/auth/logout") return json(200, { ok: true });

    return json(404, { ok: false, reason: "not_found" });

    /** Build the `/v1/me` answer, signing a token when entitled. */
    async function mePayload(state) {
      const entitled = state.entitlement.pro;
      let token = null;
      if (entitled) {
        const now = Math.floor(Date.now() / 1000);
        token = await license.sign({
          iss: "vocal-studio-entitlements",
          sub: "grant_test_0001",
          aud: BASE,
          plan: state.entitlement.plan,
          status: state.entitlement.status,
          provider: state.entitlement.provider || "grant",
          iat: now,
          exp: state.entitlement.periodEnd,
          periodEnd: state.entitlement.periodEnd,
          accountId: state.account.id,
          source: state.entitlement.source
        });
      }
      return {
        ok: true,
        account: state.account,
        entitlement: state.entitlement,
        grants: state.grants,
        paid: [],
        licenseId: entitled ? "grant_test_0001" : null,
        token
      };
    }
  });
}

/**
 * Open the page with a clean slate.
 * @param {import('@playwright/test').Page} page Page.
 */
async function boot(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      // This runs on every navigation, so the clearing is gated on a
      // once-per-page flag: a reload under test must keep its session, which is
      // the whole point of the "session survives a reload" case.
      const fresh = !sessionStorage.getItem("vt_e2e");
      sessionStorage.setItem("vt_e2e", "1");
      if (!fresh) return;
      localStorage.removeItem("vt_billing_v1");
      localStorage.removeItem("vt_license_v1");
      localStorage.removeItem("vt_account_session_v1");
      localStorage.removeItem("vt_sync_rev_v1");
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
}

/** Sign in through the emailed-code form. */
async function signIn(page) {
  // On a phone, Cuenta is in the header's "Más" menu.
  if (await page.locator("#btn-more").isVisible()) await page.click("#btn-more");
  await page.click("#btn-account");
  await expect(page.locator("#account-modal")).toBeVisible();
  await expect(page.locator("#account-signin")).toBeVisible();
  await page.fill("#account-email", "pablo@example.test");
  await page.click("#account-email-submit");
  await expect(page.locator("#account-code-form")).toBeVisible();
  await page.fill("#account-code", "424242");
  await page.click("#account-code-submit");
  await expect(page.locator("#account-logged-in")).toBeVisible();
}

test.describe("Accounts, gifted months and saved progress", () => {
  test("a build with no worker offers no sign-in and says so", async ({ page }) => {
    // The documented no-backend mode: anybody who clones this site and does not
    // deploy the worker gets a practice-only build. The shipped build does point
    // at a worker now (see the case below), so this states the premise itself
    // rather than inheriting whatever js/billing-config.js currently holds.
    await patchBillingConfig(page, { verification: { apiBaseUrl: "" } });
    await boot(page);
    await page.click("#btn-account");
    await expect(page.locator("#account-modal")).toBeVisible();
    // No worker configured: the panel must not offer a sign-in that cannot work.
    await expect(page.locator("#account-signin")).toBeHidden();
    await expect(page.locator("#account-unconfigured")).toBeVisible();
    // Nor claim it merely could not check, because it never asked.
    await expect(page.locator("#account-checking")).toBeHidden();
    await expect(page.locator("#account-offline")).toBeHidden();
    // And the internal QA form stays reachable, because it is the only way in.
    await expect(page.locator("#login-username")).toBeVisible();
  });

  test("Google-only deploy: a blocked Google script does not leave an empty panel", async ({ page }) => {
    // This is the configuration the site actually ships: a Google client id and
    // no email provider. "The worker names a method" and "this browser can run
    // it" are different facts — an extension, a content blocker or the network
    // can refuse accounts.google.com — and if the panel trusts the first one it
    // shows a sign-in block with nothing in it and no way in.
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub({
      methods: { email: false, google: true, googleClientId: "test.apps.googleusercontent.com" }
    });
    await installWorker(page, stub, license);
    await page.route("https://accounts.google.com/**", (route) => route.abort("failed"));
    await boot(page);

    await page.click("#btn-account");
    await expect(page.locator("#account-modal")).toBeVisible();
    await expect(page.locator("#account-signin-blocked")).toBeVisible();
    await expect(page.locator("#account-signin")).toBeHidden();
    // It is not the same as "accounts are off", and not the same as "we could
    // not ask the worker" — both of those would misdirect the reader.
    await expect(page.locator("#account-unconfigured")).toBeHidden();
    await expect(page.locator("#account-offline")).toBeHidden();
    // And the way in that does work is open, with focus somewhere real.
    await expect(page.locator("#login-username")).toBeVisible();
    expect(
      await page.evaluate(() =>
        document.querySelector("#account-modal").contains(document.activeElement)
      )
    ).toBe(true);
  });

  test("Google-only deploy: a blocked Google script leaves the local trial reachable", async ({
    page
  }) => {
    // The other half of the same defect: the pricing trial routed to the account
    // layer on the worker's word alone, so it closed the pricing card and opened
    // a panel with no way in, and the browser-local trial — the documented
    // fallback — became unreachable.
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub({
      methods: { email: false, google: true, googleClientId: "test.apps.googleusercontent.com" }
    });
    await installWorker(page, stub, license);
    await page.route("https://accounts.google.com/**", (route) => route.abort("failed"));
    await boot(page);

    // Open the account panel first: that is what tries the script, and what the
    // trial's decision then has to take into account.
    await page.click("#btn-account");
    await expect(page.locator("#account-signin-blocked")).toBeVisible();
    await page.click("#account-close");

    await page.evaluate(() => window.VTApp.openPricing());
    const trial = page.locator("#btn-start-trial");
    await expect(trial).toBeVisible();
    // Named for what it will actually give, which is the browser-local length.
    await expect(trial).toContainText("7");
    await trial.click();

    await expect(page.locator("#account-modal")).toBeHidden();
    await expect
      .poll(() => page.evaluate(() => window.VTBilling.getEntitlement().pro))
      .toBe(true);
    const after = await page.evaluate(() => ({
      local: localStorage.getItem("vt_billing_trial_started_v1"),
      ent: window.VTBilling.getEntitlement()
    }));
    expect(after.local).toBeTruthy();
    expect(after.ent.status).toBe("trial");
  });

  test("a slow worker: the trial button names the length the press will give", async ({ page }) => {
    // The press and the label have to read the same flag. Before, the label came
    // from the worker's default trial length while the press fell back to the
    // browser-local trial, so a visitor who clicked before the answer landed was
    // promised 30 days and given 7.
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub({ methods: { email: true, google: false } });
    await patchBillingConfig(page, {
      verification: { apiBaseUrl: API, publicKeyJwk: license.publicKeyJwk, required: true }
    });
    let release;
    const held = new Promise((r) => {
      release = r;
    });
    await page.route(`${API}/**`, async (route) => {
      if (new URL(route.request().url()).pathname === "/v1/auth/methods") {
        await held;
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          headers: { "access-control-allow-origin": "*" },
          body: JSON.stringify({ ok: true, ...stub.methods })
        });
      }
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify({ ok: true })
      });
    });
    await boot(page);

    await page.evaluate(() => window.VTApp.openPricing());
    const trial = page.locator("#btn-start-trial");
    await expect(trial).toBeVisible();
    // The answer is still in flight, so the honest offer is the local one.
    await expect(trial).toContainText("7");

    release();
    // Once the worker has spoken, the offer becomes the worker's.
    await expect(trial).toContainText("30");
  });

  test("a worker that never answers gives up rather than pinning the panel", async ({ page }) => {
    // A host that accepts the connection and then goes silent is the worst case
    // for a panel that waits on the reply: with no timeout the visitor is left
    // on "Comprobando cómo entrar…" for as long as they keep the panel open,
    // and reopening re-joins the same dead request instead of retrying.
    test.setTimeout(30000);
    await patchBillingConfig(page, { verification: { apiBaseUrl: API } });
    // Never fulfils, never aborts.
    await page.route(`${API}/**`, () => {});
    await boot(page);

    await page.click("#btn-account");
    await expect(page.locator("#account-modal")).toBeVisible();
    await expect(page.locator("#account-checking")).toBeVisible();
    // The request is bounded, so this resolves into a state with a way forward.
    await expect(page.locator("#account-offline")).toBeVisible({ timeout: 15000 });
    await expect(page.locator("#account-checking")).toBeHidden();
    await expect(page.locator("#login-username")).toBeVisible();
  });

  test("the shipped build is pointed at a deployed worker", async () => {
    // Guards the wiring itself. Every other case here stubs the worker, so an
    // emptied apiBaseUrl would take the whole account layer out of the live
    // site without failing anything.
    const fs = require("fs");
    const src = fs.readFileSync(require("path").join(__dirname, "..", "js", "billing-config.js"), "utf8");
    const base = /apiBaseUrl:\s*"([^"]*)"/.exec(src);
    expect(base, "js/billing-config.js still declares apiBaseUrl").toBeTruthy();
    expect(base[1]).toMatch(/^https:\/\/[^\s"]+$/);
    // A public key has to be there too, or a license token cannot be checked
    // and every entitlement the worker signs is worthless.
    expect(src).toMatch(/"kty":\s*"EC"|kty:\s*"EC"/);
    // And the client secret must never be here: this repo is public.
    expect(src).not.toMatch(/client_?[Ss]ecret/);
  });

  test("a worker with no sign-in method wired up offers none", async ({ page }) => {
    // A deployed worker whose operator has set neither an email provider nor a
    // Google client. It answers, so the site counts as configured, but there is
    // nothing to sign in with — the panel must not take an address it cannot
    // send a code to.
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub({ methods: { email: false, google: false, googleClientId: null } });
    await installWorker(page, stub, license);
    await boot(page);
    await page.click("#btn-account");
    await expect(page.locator("#account-modal")).toBeVisible();
    await expect(page.locator("#account-signin")).toBeHidden();
    await expect(page.locator("#account-unconfigured")).toBeVisible();
    await expect(page.locator("#login-username")).toBeVisible();
  });

  test("with only Google wired up, the email form stays out of the way", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub({ methods: { email: false, google: true } });
    await installWorker(page, stub, license);
    await boot(page);
    await page.click("#btn-account");
    await expect(page.locator("#account-modal")).toBeVisible();
    // The email form goes, because this deploy cannot send a code...
    await expect(page.locator("#account-email-form")).toBeHidden();
    // ...but this is a working sign-in, so the panel must not claim accounts
    // are switched off. Asserted on the notice rather than on #account-signin,
    // whose only remaining child here is the Google button, which needs
    // Google's script and so has no box under test.
    await expect(page.locator("#account-unconfigured")).toBeHidden();
    await expect(page.locator("#account-signin")).toHaveJSProperty("hidden", false);
  });

  test("signing in by emailed code shows the account and its free plan", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub();
    await installWorker(page, stub, license);
    await boot(page);
    await signIn(page);

    await expect(page.locator("#account-who")).toContainText("pablo@example.test");
    await expect(page.locator("#account-plan")).toContainText("gratis");
    // Free means free: no license token, so nothing grants Pro.
    expect(await page.evaluate(() => !!window.VTLicense.getClaims())).toBe(false);
    expect(await page.evaluate(() => window.VTBilling.isPro())).toBe(false);
  });

  test("a wrong code never signs anyone in", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub();
    await installWorker(page, stub, license);
    await boot(page);

    await page.click("#btn-account");
    await page.fill("#account-email", "pablo@example.test");
    await page.click("#account-email-submit");
    await page.fill("#account-code", "000000");
    await page.click("#account-code-submit");

    await expect(page.locator("#account-error")).toBeVisible();
    await expect(page.locator("#account-logged-in")).toBeHidden();
    expect(await page.evaluate(() => window.VTAccount.getState().signedIn)).toBe(false);
  });

  test("starting the trial grants Pro through a verified license", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub();
    await installWorker(page, stub, license);
    await boot(page);
    await signIn(page);

    await expect(page.locator("#btn-account-trial")).toBeVisible();
    await page.click("#btn-account-trial");

    await expect(page.locator("#account-plan")).toContainText("Prueba Pro");
    await expect(page.locator("#btn-account-trial")).toBeHidden();
    // Pro is on because the signature verified, not because the JSON said so.
    await expect.poll(() => page.evaluate(() => window.VTBilling.isPro())).toBe(true);
    expect(await page.evaluate(() => window.VTBilling.getEntitlement().source)).toBe("license");
  });

  test("redeeming a gift code turns Pro on and a bad code does not", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub();
    await installWorker(page, stub, license);
    await boot(page);
    await signIn(page);

    await page.fill("#account-redeem-code", "nope-nope");
    await page.click("#account-redeem-submit");
    await expect(page.locator("#account-error")).toBeVisible();
    expect(await page.evaluate(() => window.VTBilling.isPro())).toBe(false);

    // The code is typed the way somebody would copy it out of a message.
    await page.fill("#account-redeem-code", "vocal gift 2026");
    await page.click("#account-redeem-submit");
    await expect(page.locator("#account-plan")).toContainText("regalo");
    await expect.poll(() => page.evaluate(() => window.VTBilling.isPro())).toBe(true);
  });

  test("a member never sees the gifting tools; an admin does", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const member = createWorkerStub({ role: "member" });
    await installWorker(page, member, license);
    await boot(page);
    await signIn(page);
    await expect(page.locator("#account-admin")).toBeHidden();
  });

  test("an admin can mint a gift code from the panel", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub({ role: "admin" });
    await installWorker(page, stub, license);
    await boot(page);
    await signIn(page);

    await expect(page.locator("#account-admin")).toBeVisible();
    await page.fill("#gift-code-days", "30");
    await page.fill("#gift-code-uses", "5");
    await page.click("#gift-code-form button[type=submit]");
    await expect(page.locator("#gift-result")).toContainText("VOCAL-GIFT-2026");
  });

  test("an admin can gift months straight to an email", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub({ role: "admin" });
    await installWorker(page, stub, license);
    await boot(page);
    await signIn(page);

    await page.fill("#gift-grant-email", "amiga@example.test");
    await page.fill("#gift-grant-days", "60");
    await page.click("#gift-grant-form button[type=submit]");
    await expect(page.locator("#gift-result")).toContainText("amiga@example.test");
    const call = stub.calls.find((c) => c.path === "/v1/admin/grants");
    expect(call.body.days).toBe(60);
  });

  test("an admin reads A/B results in the account panel", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub({ role: "admin" });
    await installWorker(page, stub, license);
    await boot(page);
    await signIn(page);

    await page.click("#ab-results-load");
    const box = page.locator("#ab-results");
    await expect(box).toContainText("aa_2026_10");
    // Only experiments somebody has seen are asked for.
    expect(stub.calls.filter((c) => c.path === "/v1/admin/experiments/results").length).toBe(1);
    await expect(box.locator(".ab-table").first()).toContainText("40.0 %");
    await expect(box.locator(".ab-diff").first()).toContainText("b frente a a: +0.4 pts");
    await expect(box.locator(".ab-diff").first()).toContainText("p = 0.904");
    await expect(box.locator(".ab-warn")).toHaveCount(0);
    // The plan is met, the split check shows even when it passes, and the
    // arrivals line says the pipeline is alive.
    await expect(box).toContainText("Plan cumplido el");
    await expect(box).toContainText("Reparto parejo entre versiones (p = 0.620)");
    await expect(box.locator(".ab-ingest")).toContainText(/1[,.\u00a0]?240 eventos guardados, 2 descartados, 0 envíos rechazados/);
  });

  test("before its plan is met a test shows counts and the date, never a comparison", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const readyAt = Math.floor(Date.UTC(2026, 10, 20, 15) / 1000);
    const stub = createWorkerStub({
      role: "admin",
      abResults: {
        horizon: { nPerArm: 150, minDays: 14, mde: null, maxTo: 7, startedAt: 1788000000, cohortEnd: null, readyAt, estimated: true, reached: false, counted: 120 },
        readMe: "instrumentation",
        eventMix: {
          events: [
            { event: "practice_day", from: 0, to: 1, arms: [{ variant: "a", n: 380, k: 152, share: 0.4 }, { variant: "b", n: 371, k: 0, share: 0 }], p: 1e-40, flagged: true, reason: "missing" }
          ],
          flagged: true
        },
        metrics: [
          {
            role: "primary", event: "practice_day", kind: "share", from: 0, to: 7,
            arms: [
              { variant: "a", n: 120, k: 48, rate: 0.4, lo: 0.316, hi: 0.49 },
              { variant: "b", n: 121, k: 50, rate: 0.4132, lo: 0.328, hi: 0.503 }
            ],
            comparisons: [],
            withheld: true,
            smallSample: false
          }
        ]
      }
    });
    await installWorker(page, stub, license);
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await signIn(page);

    await page.click("#ab-results-load");
    const box = page.locator("#ab-results");
    await expect(box).toContainText("Aún no se puede leer: van 120 de 150 por versión");
    await expect(box).toContainText(/Se podrá leer hacia el 20 nov\.? 2026/);
    // No difference and no p-value for any metric: only the arms' own numbers.
    await expect(box.locator(".ab-diff")).toHaveCount(0);
    await expect(box).not.toContainText("frente a");
    // The split check and the instrumentation check are shown regardless.
    await expect(box).toContainText("Reparto parejo entre versiones");
    await expect(box.locator(".ab-warn")).toContainText("Una versión no registra «practice_day»");
    // On a phone the interval wraps under the value rather than scrolling away.
    const edges = await page.evaluate(() => {
      const wrap = document.querySelector("#ab-results .ab-table-wrap");
      const ci = document.querySelector("#ab-results .ab-table .ab-ci");
      return { wrap: wrap.getBoundingClientRect().right, ci: ci.getBoundingClientRect().right, scroll: wrap.scrollWidth - wrap.clientWidth };
    });
    expect(edges.ci).toBeLessThanOrEqual(edges.wrap + 0.5);
    expect(edges.scroll).toBeLessThanOrEqual(0);
  });

  test("signing out drops the session and any Pro that came with it", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub();
    await installWorker(page, stub, license);
    await boot(page);
    await signIn(page);
    await page.click("#btn-account-trial");
    await expect.poll(() => page.evaluate(() => window.VTBilling.isPro())).toBe(true);

    await page.click("#btn-logout");
    await expect(page.locator("#account-logged-out")).toBeVisible();
    expect(await page.evaluate(() => window.VTAccount.getState().signedIn)).toBe(false);
    expect(await page.evaluate(() => window.VTBilling.isPro())).toBe(false);
    expect(await page.evaluate(() => localStorage.getItem("vt_account_session_v1"))).toBeNull();
  });

  test("the session survives a reload", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub();
    await installWorker(page, stub, license);
    await boot(page);
    await signIn(page);
    await page.click("#btn-account-trial");
    await expect.poll(() => page.evaluate(() => window.VTBilling.isPro())).toBe(true);

    await page.reload({ waitUntil: "domcontentloaded" });
    await expect.poll(() => page.evaluate(() => window.VTAccount.getState().signedIn)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.VTBilling.isPro())).toBe(true);
  });

  test("progress written on this device reaches the account", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub();
    await installWorker(page, stub, license);
    await boot(page);
    await signIn(page);

    await page.evaluate(() => {
      VTStorage.saveExerciseResult("v1-diction", { metrics: {}, score: 88, notes: "", durationSec: 90 });
    });
    const result = await page.evaluate(() => window.VTSync.syncNow());
    expect(result.ok).toBe(true);
    expect(stub.progress.progress["v1-diction"].completedCount).toBe(1);
  });

  test("a second device's practice is merged in, not overwritten", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    // The account already holds a take recorded somewhere else.
    const stub = createWorkerStub({
      rev: 4,
      progress: {
        v: 1,
        profileId: "default",
        savedAt: "2026-09-20T10:00:00.000Z",
        progress: {
          "s1-lip-trill": {
            completedCount: 7,
            lastScore: 91,
            lastAt: "2026-09-20T10:00:00.000Z",
            history: [{ id: "phone-take", at: "2026-09-20T10:00:00.000Z", metrics: {}, score: 91, notes: "", durationSec: 60 }]
          }
        },
        weekPlan: { weekNumber: 5, element: "resonance", status: "active", checkIns: [1, 2], completedElements: ["breath"] },
        reviews: [],
        holdLogs: [],
        goals: { weeklySessionsTarget: 4 },
        achievements: {}
      }
    });
    await installWorker(page, stub, license);
    await boot(page);
    await signIn(page);

    await page.evaluate(() => {
      VTStorage.saveExerciseResult("v1-diction", { metrics: {}, score: 70, notes: "", durationSec: 30 });
    });
    const result = await page.evaluate(() => window.VTSync.syncNow());
    expect(result.ok).toBe(true);

    // Both devices' work is present on the server...
    expect(Object.keys(stub.progress.progress).sort()).toEqual(["s1-lip-trill", "v1-diction"]);
    expect(stub.progress.progress["s1-lip-trill"].completedCount).toBe(7);
    // ...and the further-along plan won.
    expect(stub.progress.weekPlan.weekNumber).toBe(5);

    // And this browser now holds the other device's take too.
    const local = await page.evaluate(() => VTStorage.getProgress()["s1-lip-trill"]);
    expect(local.completedCount).toBe(7);
  });

  test("a write that lost the race is merged and retried, losing nothing", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub({ rev: 2, progress: null });
    await installWorker(page, stub, license);
    await boot(page);
    await signIn(page);

    // The client believes it is at rev 0; the server is at 2, so the first PUT
    // is refused, and the client must merge and try again rather than give up.
    await page.evaluate(() => {
      VTStorage.saveExerciseResult("v1-diction", { metrics: {}, score: 60, notes: "", durationSec: 30 });
    });
    const result = await page.evaluate(() => window.VTSync.syncNow());
    expect(result.ok).toBe(true);
    expect(stub.progress.progress["v1-diction"]).toBeTruthy();
  });

  test("merging never loses a take, whichever side it came from", async ({ page }) => {
    await boot(page);
    const merged = await page.evaluate(() => {
      const local = {
        savedAt: "2026-09-21T10:00:00.000Z",
        profileId: "default",
        progress: {
          ex: {
            completedCount: 2,
            lastScore: 80,
            lastAt: "2026-09-21T10:00:00.000Z",
            history: [{ id: "a", at: "2026-09-21T10:00:00.000Z", score: 80 }]
          }
        },
        weekPlan: { weekNumber: 2, completedElements: [], checkIns: [] },
        reviews: [{ at: "2026-09-21T10:00:00.000Z", note: "local" }],
        holdLogs: [],
        goals: { weeklySessionsTarget: 3 },
        achievements: { local: true }
      };
      const remote = {
        savedAt: "2026-09-20T10:00:00.000Z",
        progress: {
          ex: {
            completedCount: 9,
            lastScore: 95,
            lastAt: "2026-09-22T10:00:00.000Z",
            history: [{ id: "b", at: "2026-09-22T10:00:00.000Z", score: 95 }]
          }
        },
        weekPlan: { weekNumber: 1, completedElements: [], checkIns: [] },
        reviews: [{ at: "2026-09-19T10:00:00.000Z", note: "remote" }],
        holdLogs: [],
        goals: { weeklySessionsTarget: 5 },
        achievements: { remote: true }
      };
      return window.VTSync.mergeBag(local, remote);
    });

    // Both takes survive, newest first.
    expect(merged.progress.ex.history.map((h) => h.id)).toEqual(["b", "a"]);
    // The count cannot be recomputed from a capped history, so the larger wins.
    expect(merged.progress.ex.completedCount).toBe(9);
    // The later session decides the headline score.
    expect(merged.progress.ex.lastScore).toBe(95);
    // The further-along plan wins.
    expect(merged.weekPlan.weekNumber).toBe(2);
    // Both review lines survive.
    expect(merged.reviews.length).toBe(2);
    // A setting with no history takes the more recently saved side.
    expect(merged.goals.weeklySessionsTarget).toBe(3);
    // Achievements are a union: an award earned anywhere stays earned.
    expect(merged.achievements).toEqual({ remote: true, local: true });
  });

  test("sync does nothing at all while signed out", async ({ page }) => {
    await boot(page);
    const status = await page.evaluate(() => window.VTSync.getStatus());
    expect(status.available).toBe(false);
    const result = await page.evaluate(() => window.VTSync.syncNow());
    expect(result).toEqual({ ok: false, reason: "signed_out" });
  });

  test("account chrome stays inside the phone viewport", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub({ role: "admin" });
    await installWorker(page, stub, license);
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await signIn(page);

    const overflow = await page.evaluate(() => {
      const card = document.querySelector(".account-card");
      const r = card.getBoundingClientRect();
      return { right: r.right - window.innerWidth, left: r.left, scrollX: document.documentElement.scrollWidth - window.innerWidth };
    });
    expect(overflow.right).toBeLessThanOrEqual(1);
    expect(overflow.left).toBeGreaterThanOrEqual(-1);
    expect(overflow.scrollX).toBeLessThanOrEqual(1);
  });

  test("every control in the account panel clears the 44px tap floor on a phone", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub();
    await installWorker(page, stub, license);
    await page.setViewportSize({ width: 390, height: 844 });
    await boot(page);
    await signIn(page);

    const small = await page.evaluate(() => {
      const panel = document.querySelector("#account-logged-in");
      const out = [];
      panel.querySelectorAll("button, input, summary").forEach((el) => {
        if (el.offsetParent === null) return;
        const r = el.getBoundingClientRect();
        if (r.height > 0 && r.height < 44) out.push({ id: el.id || el.className, h: Math.round(r.height) });
      });
      return out;
    });
    expect(small).toEqual([]);
  });

  test("the pricing trial leads to sign-in rather than a per-browser trial", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub();
    await installWorker(page, stub, license);
    await boot(page);

    await page.evaluate(() => window.VTApp.openPricing());
    const trial = page.locator("#btn-start-trial");
    await expect(trial).toBeVisible();
    // The length comes from the worker (30), not from billing-config's local 7.
    await expect(trial).toHaveText(/30/);

    await trial.click();
    // Pricing gives way to the account panel; no local trial was started.
    await expect(page.locator("#account-modal")).toBeVisible();
    const local = await page.evaluate(() => localStorage.getItem("vt_billing_trial_started_v1"));
    expect(local).toBeNull();
  });

  test("with no sign-in to offer, the pricing trial still starts a local one", async ({ page }) => {
    // The worker is deployed but its operator has wired up no sign-in method.
    // Routing the trial to the account layer here would end at a panel saying
    // accounts are switched off, with the browser-local trial — which is the
    // documented no-backend fallback — no longer reachable.
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub({ methods: { email: false, google: false, googleClientId: null } });
    await installWorker(page, stub, license);
    await boot(page);

    await page.evaluate(() => window.VTApp.openPricing());
    const trial = page.locator("#btn-start-trial");
    await expect(trial).toBeVisible();
    await trial.click();

    await expect(page.locator("#account-modal")).toBeHidden();
    const after = await page.evaluate(() => ({
      local: localStorage.getItem("vt_billing_trial_started_v1"),
      ent: window.VTBilling.getEntitlement()
    }));
    expect(after.local).toBeTruthy();
    expect(after.ent.pro).toBe(true);
    expect(after.ent.status).toBe("trial");
  });

  test("an account that already used its month is not offered another", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const stub = createWorkerStub({ trialUsed: true });
    await installWorker(page, stub, license);
    await boot(page);
    await signIn(page);
    await page.click("#account-close");

    await page.evaluate(() => window.VTApp.openPricing());
    await expect(page.locator("#btn-start-trial")).toBeHidden();
  });
});
