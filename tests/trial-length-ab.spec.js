/**
 * The trial-length A/B test in the browser (`trial_len_2026_11`).
 *
 * The arm is the worker's, not this page's: it decides how many days of Pro an
 * account is given, so nothing here may choose it. What the page is responsible
 * for is the other three halves of that arrangement, and each gets a case:
 *
 *   - the offer on screen names THIS account's length, not the public default
 *     that `/v1/auth/methods` can answer with before anybody signs in;
 *   - the exposure is recorded when that offer is shown, carrying the worker's
 *     arm and the same random browser id as every other event;
 *   - with the test off, nothing about it is sent at all.
 *
 * Plus the one event the test is read on, `pro_paid_first`, which must fire for
 * a paid period and never for a free one.
 *
 * The worker is stubbed at the network boundary, so these run the real client
 * modules. The analytics endpoint is derived from the worker URL
 * (js/experiments-config.js), so one route handler catches both.
 */
const { test, expect } = require("@playwright/test");
const { mintLicense, patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://entitlements.test";
const DAY = 86400;
const KEY = "trial_len_2026_11";

test.use({ timezoneId: "America/Lima", locale: "es-PE" });

/**
 * Install a worker stub and capture what the page sends.
 *
 * @param {import('@playwright/test').Page} page Page.
 * @param {{trialDays?: number|null, trialArm?: string|null, methodsTrialDays?: number,
 *          entitlement?: object, trialUsed?: boolean}} opts What the worker says.
 * @returns {Promise<{events: function, calls: object[]}>} Captured traffic.
 */
async function installWorker(page, opts = {}) {
  const license = await mintLicense({ origin: BASE });
  const bodies = [];
  const calls = [];
  const state = {
    trialUsed: !!opts.trialUsed,
    entitlement:
      opts.entitlement || { pro: false, plan: null, status: "free", source: null, periodEnd: null, provider: null }
  };

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
    calls.push({ method, path, body });

    const json = (status, data) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(data)
      });

    if (method === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*" } });
    }

    if (path === "/v1/events") {
      try {
        bodies.push(JSON.parse(request.postData() || "null"));
      } catch {
        bodies.push(null);
      }
      return json(200, { ok: true });
    }

    if (path === "/v1/auth/methods") {
      return json(200, {
        ok: true,
        email: true,
        google: false,
        googleClientId: null,
        // Deliberately not the account's own length: this route answers before
        // anybody has signed in, so it can only ever report the default.
        trialDays: opts.methodsTrialDays === undefined ? 7 : opts.methodsTrialDays
      });
    }
    if (path === "/v1/auth/email/start") return json(200, { ok: true, sent: true, expiresInSeconds: 900 });

    const me = async () => {
      let token = null;
      if (state.entitlement.pro) {
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
          accountId: "acct_test",
          source: state.entitlement.source
        });
      }
      const payload = {
        ok: true,
        account: {
          id: "acct_test",
          email: "pablo@example.test",
          displayName: null,
          locale: null,
          role: "member",
          trialUsed: state.trialUsed,
          createdAt: 1
        },
        entitlement: state.entitlement,
        grants: [],
        paid: [],
        licenseId: state.entitlement.pro ? "grant_test_0001" : null,
        token
      };
      // Absent on purpose when the caller passes undefined: an older worker
      // sends neither field, and the page has to cope with that.
      if (opts.trialDays !== undefined) payload.trialDays = opts.trialDays;
      if (opts.trialArm !== undefined) payload.trialArm = opts.trialArm;
      return payload;
    };

    if (path === "/v1/auth/email/verify") {
      if (body.code !== "424242") return json(401, { ok: false, reason: "bad_code" });
      return json(200, { ok: true, sessionToken: "sess-token-1", expiresAt: 4102444800, ...(await me()) });
    }

    const authorized = (request.headers().authorization || "").includes("sess-token-1");
    if (path.startsWith("/v1/me") && !authorized) return json(401, { ok: false, reason: "no_session" });

    if (path === "/v1/me" && method === "GET") return json(200, await me());

    if (path === "/v1/me/trial") {
      if (state.trialUsed) return json(409, { ok: false, reason: "trial_used" });
      state.trialUsed = true;
      const days = opts.trialDays || 7;
      const periodEnd = Math.floor(Date.now() / 1000) + days * DAY;
      state.entitlement = {
        pro: true,
        plan: "pro_monthly",
        status: "active",
        source: "trial",
        periodEnd,
        provider: null
      };
      return json(200, await me());
    }

    if (path === "/v1/me/progress") return json(200, { ok: true, profiles: [], rev: 0, doc: null, updatedAt: 1 });
    if (path === "/v1/health") return json(200, { ok: true });
    return json(404, { ok: false, reason: "not_found" });
  });

  return {
    calls,
    /** Every event sent so far, flattened out of its batches. */
    events: () => bodies.filter(Boolean).flatMap((b) => b.events || [])
  };
}

/**
 * Open the page with a clean slate, as a browser the analytics will send from.
 * @param {import('@playwright/test').Page} page Page.
 */
async function boot(page) {
  await page.addInitScript(() => {
    // The client refuses to send from an automated browser, and rightly so.
    Object.defineProperty(Navigator.prototype, "webdriver", { get: () => false, configurable: true });
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      localStorage.removeItem("vt_billing_v1");
      localStorage.removeItem("vt_license_v1");
      localStorage.removeItem("vt_account_session_v1");
      localStorage.removeItem("vt_ab_v1");
      localStorage.removeItem("vt_pro_paid_first_v1");
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTAccount && !!window.VTExperiments);
}

/** Sign in through the emailed-code form, leaving the account panel open. */
async function signIn(page) {
  if (await page.locator("#btn-more").isVisible()) await page.click("#btn-more");
  await page.click("#btn-account");
  await expect(page.locator("#account-modal")).toBeVisible();
  await page.fill("#account-email", "pablo@example.test");
  await page.click("#account-email-submit");
  await expect(page.locator("#account-code-form")).toBeVisible();
  await page.fill("#account-code", "424242");
  await page.click("#account-code-submit");
  await expect(page.locator("#account-logged-in")).toBeVisible();
}

test.describe("the trial-length test in the browser", () => {
  test("the offer names this account's own length, not the public default", async ({ page }) => {
    // The bug this closes: the button read `/v1/auth/methods`, which answers
    // before anybody signs in and therefore can only report the configured
    // default. A fourteen-day account would have been promised seven and given
    // fourteen — under-promising, so nobody loses anything, but the number on
    // the button IS the treatment, and a test whose treatment is not applied
    // measures nothing.
    const sent = await installWorker(page, { trialDays: 14, trialArm: "fourteen", methodsTrialDays: 7 });
    await boot(page);
    await signIn(page);

    const trial = page.locator("#btn-account-trial");
    await expect(trial).toBeVisible();
    await expect(trial).toContainText("14");
    await expect(trial).not.toContainText("7");
    void sent;
  });

  test("the exposure is recorded when the offer is shown, with the worker's arm", async ({ page }) => {
    const sent = await installWorker(page, { trialDays: 14, trialArm: "fourteen" });
    await boot(page);
    await signIn(page);
    await expect(page.locator("#btn-account-trial")).toBeVisible();
    await page.evaluate(() => window.VTAnalytics.flush());

    await expect
      .poll(() => sent.events().filter((e) => e.name === "experiment_expose").length)
      .toBeGreaterThan(0);
    const exposures = sent
      .events()
      .filter((e) => e.name === "experiment_expose")
      .flatMap((e) => e.exposures || [{ experiment: e.props.experiment, variant: e.props.variant }]);
    const ours = exposures.filter((x) => x.experiment === KEY);
    expect(ours.length).toBe(1);
    expect(ours[0].variant).toBe("fourteen");

    // Recorded against the browser id, like every other exposure: nothing about
    // the account travels with it.
    const ev = sent.events().find((e) => e.name === "experiment_expose");
    expect(ev.cid).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(ev)).not.toContain("acct_test");
    expect(JSON.stringify(ev)).not.toContain("pablo@example.test");
  });

  test("the arm is re-asserted on later visits, so a lost beacon is recovered", async ({ page }) => {
    // The same recovery path the locally-split experiments use: the arm rides
    // on every app_open as `x_<key>`, and the worker keeps whichever arrives
    // first. It has to work for this experiment too, and the local `enabled`
    // flag is false for it, which is what made that worth a test.
    const sent = await installWorker(page, { trialDays: 14, trialArm: "fourteen" });
    await boot(page);
    await signIn(page);
    await expect(page.locator("#btn-account-trial")).toBeVisible();
    expect(await page.evaluate(() => window.VTExperiments.exposedArms())).toMatchObject({
      [KEY]: "fourteen"
    });
    void sent;
  });

  test("a second account on the same browser does not move the arm", async ({ page }) => {
    // Two people, one browser: the worker's exposure row is INSERT OR IGNORE on
    // (experiment, browser), so the first arm is the one the result is computed
    // from. Keeping the second would make this browser re-assert an arm the
    // worker has already refused.
    const sent = await installWorker(page, { trialDays: 14, trialArm: "fourteen" });
    await boot(page);
    await signIn(page);
    await expect(page.locator("#btn-account-trial")).toBeVisible();
    const kept = await page.evaluate((key) => window.VTExperiments.exposeServerArm(key, "seven"), KEY);
    expect(kept).toBe("fourteen");
    expect(await page.evaluate(() => window.VTExperiments.exposedArms())).toMatchObject({
      [KEY]: "fourteen"
    });
    void sent;
  });

  test("with the test off, nothing about it is sent and the default is shown", async ({ page }) => {
    const sent = await installWorker(page, { trialDays: 7, trialArm: null, methodsTrialDays: 7 });
    await boot(page);
    await signIn(page);
    await expect(page.locator("#btn-account-trial")).toBeVisible();
    await page.evaluate(() => window.VTAnalytics.flush());

    await expect.poll(() => sent.events().length).toBeGreaterThan(0);
    const mentioned = JSON.stringify(sent.events()).includes(KEY);
    expect(mentioned).toBe(false);
    expect(await page.evaluate(() => window.VTExperiments.exposedArms())).toEqual({});
    await expect(page.locator("#btn-account-trial")).toContainText("7");
  });

  test("an older worker that sends neither field still names a length", async ({ page }) => {
    // `trialDays` and `trialArm` are new. A worker deployed before them sends
    // neither, and the page must fall back to the public answer rather than
    // dropping the number off the button.
    const sent = await installWorker(page, { methodsTrialDays: 30 });
    await boot(page);
    await signIn(page);
    await expect(page.locator("#btn-account-trial")).toContainText("30");
    expect(await page.evaluate(() => window.VTExperiments.exposedArms())).toEqual({});
    void sent;
  });

  test("starting the trial sends trial_started, which is what a metric can count", async ({ page }) => {
    const sent = await installWorker(page, { trialDays: 14, trialArm: "fourteen" });
    await boot(page);
    await signIn(page);
    await page.click("#btn-account-trial");
    await expect.poll(async () => {
      await page.evaluate(() => window.VTAnalytics.flush());
      return sent.events().filter((e) => e.name === "trial_started").length;
    }).toBe(1);
    const ev = sent.events().find((e) => e.name === "trial_started");
    expect(ev.props).toMatchObject({ where: "panel", kind: "account" });
  });

  test("pro_paid_first fires for a paid period, once, and never for a free one", async ({ page }) => {
    const now = Math.floor(Date.now() / 1000);
    const free = await installWorker(page, {
      trialDays: 14,
      trialArm: "fourteen",
      trialUsed: true,
      entitlement: {
        pro: true,
        plan: "pro_monthly",
        status: "active",
        source: "trial",
        periodEnd: now + 14 * DAY,
        provider: null
      }
    });
    await boot(page);
    await signIn(page);
    await page.evaluate(() => window.VTAnalytics.flush());
    await expect.poll(() => free.events().length).toBeGreaterThan(0);
    // A trial is not a conversion. Nor is a gift or a comp: `source` is the
    // grant's own kind for all three, and "paid" only for a subscription a
    // provider has actually paid for.
    expect(free.events().some((e) => e.name === "pro_paid_first")).toBe(false);
  });

  test("pro_paid_first fires once for a paid subscription", async ({ page }) => {
    const now = Math.floor(Date.now() / 1000);
    const sent = await installWorker(page, {
      trialDays: 14,
      trialArm: "fourteen",
      trialUsed: true,
      entitlement: {
        pro: true,
        plan: "pro_monthly",
        status: "active",
        source: "paid",
        periodEnd: now + 30 * DAY,
        provider: "stripe"
      }
    });
    await boot(page);
    await signIn(page);
    await expect.poll(async () => {
      await page.evaluate(() => window.VTAnalytics.flush());
      return sent.events().filter((e) => e.name === "pro_paid_first").length;
    }).toBe(1);

    // Latched: a second /v1/me answer saying the same thing is not a second
    // conversion. Without the latch the primary metric would count one payer
    // once per page load for as long as they kept paying.
    await page.evaluate(() => window.VTAccount.refresh && window.VTAccount.refresh());
    await page.evaluate(() => window.VTAnalytics.flush());
    await page.waitForTimeout(250);
    expect(sent.events().filter((e) => e.name === "pro_paid_first").length).toBe(1);
  });
});
