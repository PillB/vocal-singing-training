/**
 * Pressing Subscribe, "Manage or cancel" and "Continue to payment", in the
 * browser: the four red-team findings of round one that are about the press
 * itself (findings client-2, client-5, client-6 and tests-2).
 *
 * - client-2: a session that ended elsewhere (signed out in another tab,
 *   "sign out everywhere", 90 days) still sat in this tab's memory, so the
 *   worker answered the press 401 with reasons the page did not know
 *   ("revoked", "expired"). The press said "couldn't open the checkout, try
 *   again" every time until a reload, and the panel still said signed in.
 * - client-5: the "cannot be pressed twice" guard lived on the button, and any
 *   redraw of the Pro dialog mid-request (the load's late /v1/me, a licence
 *   change) replaced it with a fresh Subscribe that opened a second checkout.
 * - client-6: on a Google-only deployment whose script a blocker refuses, the
 *   first press always lands on the sign-in panel (nothing knows Google is
 *   refused until that panel tries it), and the panel then said only "could
 *   not load", with no word that paying was possible.
 * - tests-2: with the worker checkout switched on, the same browser must still
 *   be sent to the pasted link (VG-88), and nothing tested that path.
 *
 * The oracle is what the person sees and where the page goes, and what the
 * stand-in worker was asked, never which function ran. The worker is stood in
 * for at the shipped worker's own host, which the page's Content Security
 * Policy allows, so these run under the real policy with every request
 * answered here; Google's script is refused or stood in for at its own URL.
 * Licence tokens are really signed with a throwaway key.
 */
const { test, expect } = require("@playwright/test");
const { mintLicense, patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev";
const GIS = "https://accounts.google.com/gsi/client";
const DAY = 86400;
const SESSION = "sess-press-1";
const ACCOUNT = { id: "acct_press_1", email: "presser@example.test", trialUsed: true };
/** A licence id as the worker mints them: 43 base64url characters. */
const LIC = "PrEsSeDtWiCeLiCeNcEiD0123456789_-abcdefghij";
const CHECKOUT_PAGE = "https://checkout.creem.io/ch_api_press";
const PORTAL_PAGE = "https://creem.io/my-orders/login/cust_press_1";
/** A product's pasted Creem share link, the way the shipped build sells (apiCheckout false). */
const LINK = "https://www.creem.io/payment/prod_press_monthly";
const METHODS_EMAIL = { ok: true, email: true, google: false, googleClientId: null, trialDays: 7 };
/** Google offered the way the account panel offers it: on, with a client id. */
const METHODS_GOOGLE = { ok: true, email: false, google: true, googleClientId: "press.apps.googleusercontent.com", trialDays: 7 };
const METHODS_BOTH = { ...METHODS_GOOGLE, email: true };
/** The worker checkout switched on, as at go-live (VG-83). */
const ON_SALE = { rails: { creem: { apiCheckout: true } } };
/** Google Identity Services as far as js/account.js uses it: a script that loads and can draw a button. */
const GIS_STUB =
  "window.google = { accounts: { id: { initialize: function () {}, prompt: function () {}," +
  " renderButton: function (el) { el.textContent = 'Sign in with Google'; } } } };";

/** A promise the test opens when it chooses: holds one of the worker's answers. */
function gate() {
  let open = () => {};
  const promise = new Promise((resolve) => {
    open = resolve;
  });
  return { promise, open };
}

/**
 * Mutable state of the stand-in worker. `meGate`/`checkoutGate` hold the
 * `/v1/me` and `/v1/me/checkout` answers until the test opens them.
 */
function freshState(over) {
  return {
    linked: false,
    checkouts: [],
    portals: 0,
    checkoutAnswer: null,
    portalAnswer: null,
    meGate: null,
    checkoutGate: null,
    methods: METHODS_EMAIL,
    ...(over || {})
  };
}

/** The claims of a paid Creem licence minted for the account. */
function licenceClaims() {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: "vocal-studio-entitlements",
    sub: LIC,
    aud: BASE,
    plan: "pro_monthly",
    status: "active",
    provider: "creem",
    source: "paid",
    accountId: ACCOUNT.id,
    iat: now,
    exp: now + 3 * DAY,
    periodEnd: now + 30 * DAY
  };
}

/** The `/v1/me` body: free, or Pro on Creem once `linked`. */
async function meBody(state, license) {
  const ent = state.linked
    ? { pro: true, plan: "pro_monthly", status: "active", source: "paid", provider: "creem", periodEnd: Math.floor(Date.now() / 1000) + 30 * DAY }
    : { pro: false, plan: null, status: "free", source: null, periodEnd: null };
  const token = ent.pro ? await license.sign(licenceClaims()) : null;
  const billingRails = state.linked ? ["creem"] : [];
  return { ok: true, account: ACCOUNT, entitlement: ent, grants: [], paid: [], billingRails, licenseId: ent.pro ? LIC : null, token };
}

/** `/v1/me`, held until `meGate` opens: the load's answer arriving late. */
async function meAnswer(state, license) {
  if (state.meGate) await state.meGate.promise;
  return [200, await meBody(state, license)];
}

/** `/v1/me/checkout`: counted on arrival, then held until `checkoutGate` opens. */
async function checkoutAnswer(state, body) {
  state.checkouts.push(body);
  if (state.checkoutGate) await state.checkoutGate.promise;
  return state.checkoutAnswer || [200, { ok: true, url: CHECKOUT_PAGE, plan: body.plan, provider: "creem" }];
}

/** `/v1/me/billing-portal`. */
function portalAnswer(state) {
  state.portals += 1;
  return state.portalAnswer || [200, { ok: true, url: PORTAL_PAGE, provider: "creem" }];
}

/** The routes that need the session, by path. */
const SIGNED_ROUTES = {
  "/v1/me": (state, license) => meAnswer(state, license),
  "/v1/me/checkout": (state, license, body) => checkoutAnswer(state, body),
  "/v1/me/billing-portal": (state) => portalAnswer(state),
  "/v1/me/progress": () => [200, { ok: true, profiles: [], rev: 0, doc: null, updatedAt: 1 }]
};

/** A request's JSON body, or {}. */
function bodyOf(request) {
  try {
    return request.postDataJSON() || {};
  } catch {
    return {};
  }
}

/** What the stand-in worker answers, as `[status, body]`. */
async function answer(state, license, request) {
  const path = new URL(request.url()).pathname;
  if (path === "/v1/events") return [200, { ok: true }];
  if (path === "/v1/health") return [200, health(state)];
  if (path === "/v1/auth/methods") return [200, state.methods];
  const route = SIGNED_ROUTES[path];
  if (!route) return [404, { ok: false, reason: "not_found" }];
  if ((request.headers().authorization || "") !== `Bearer ${SESSION}`) return [401, { ok: false, reason: "no_session" }];
  return route(state, license, bodyOf(request));
}

/** The worker's health, with Creem's checkout and portal switched on. */
function health(state) {
  return {
    ok: true,
    signingKeyConfigured: true,
    accountsConfigured: true,
    creemConfigured: true,
    creemCheckoutConfigured: true,
    creemPortalConfigured: true,
    mercadopagoConfigured: true,
    authMethods: state.methods,
    siteOrigin: BASE
  };
}

/** Where Google's script comes from: refused (a blocker), stood in for, or not touched. */
async function routeGoogle(page, gis) {
  if (gis === "abort") await page.route(`${GIS}**`, (route) => route.abort("blockedbyclient"));
  if (gis === "load") {
    await page.route(`${GIS}**`, (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: GIS_STUB }));
  }
}

/**
 * Stand the worker in, sign somebody in unless told not to, and count the
 * page's own `/v1/me/checkout` requests as it sends them (`__vtCheckoutAsks`),
 * so a second press is seen at once, not after the worker answers.
 * @param {import('@playwright/test').Page} page Page.
 * @param {object} state From `freshState`.
 * @param {object} license From `mintLicense`.
 * @param {{config?: object, signedIn?: boolean, gis?: "abort"|"load"}} [opts] Extras.
 * @returns {Promise<{navigations: string[]}>} Where the page tried to go.
 */
async function install(page, state, license, opts) {
  const o = opts || {};
  const navigations = [];
  await patchBillingConfig(page, {
    verification: { publicKeyJwk: license.publicKeyJwk, required: true, revalidateHours: 24 * 365 },
    ...(o.config || {})
  });
  await page.route(`${API}/**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    }
    const [status, body] = await answer(state, license, route.request());
    return route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  });
  for (const glob of ["https://checkout.creem.io/**", "https://creem.io/**", "https://www.creem.io/**"]) {
    await page.route(glob, (route) => {
      navigations.push(route.request().url());
      return route.fulfill({ status: 200, contentType: "text/html", body: "<p>Creem</p>" });
    });
  }
  await routeGoogle(page, o.gis);
  await page.addInitScript((seed) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "en");
      sessionStorage.setItem("vt_e2e", "1");
      // app.js hides toasts under vt_e2e; these cases are about what the person is told.
      sessionStorage.setItem("vt_debug", "1");
      if (seed.signedIn && !sessionStorage.getItem("vt_seeded")) {
        sessionStorage.setItem("vt_seeded", "1");
        localStorage.setItem("vt_account_session_v1", JSON.stringify({ token: seed.session, expiresAt: 4102444800 }));
      }
    } catch {
      /* ignore */
    }
    window.__vtCheckoutAsks = 0;
    const send = window.fetch;
    window.fetch = function (input, init) {
      if (String((input && input.url) || input).endsWith("/v1/me/checkout")) window.__vtCheckoutAsks += 1;
      return send.call(this, input, init);
    };
  }, { session: SESSION, signedIn: o.signedIn !== false });
  return { navigations };
}

/** Load the site and wait for the account layer. */
async function open(page) {
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTBilling && !!window.VTAccount && !!window.VTLicense, null, { timeout: 10000 });
}

/** Whether this tab thinks somebody is signed in, and whether the session is still stored. */
function sessionNow(page) {
  return page.evaluate(() => ({
    signedIn: window.VTAccount.getState().signedIn,
    stored: !!localStorage.getItem("vt_account_session_v1")
  }));
}

/** What the account layer has learned about Google's script: null untried, then true or false. */
function googleReady(page) {
  return page.evaluate(() => window.VTAccount.getState().googleReady);
}

/** What this browser's licence says right now. */
function licenceNow(page) {
  return page.evaluate(() => {
    const claims = window.VTLicense.getClaims();
    return { pro: !!claims, provider: claims?.provider || null, accountId: claims?.accountId || null };
  });
}

/** Open the Pro dialog and return the monthly plan's button. */
async function openPricing(page) {
  await page.locator("#btn-pro, #btn-pricing, [data-open-pricing]").first().click();
  await expect(page.locator("#pricing-modal")).toBeVisible();
  return page.locator('#pricing-modal .plan-cta[data-plan="pro_monthly"]');
}

/** Signed in, the account's /v1/me in, and the Pro dialog open: the monthly button. */
async function signedInPricing(page, state) {
  const license = await mintLicense({ origin: BASE });
  const { navigations } = await install(page, state, license, { config: ON_SALE });
  await open(page);
  await expect.poll(() => page.evaluate(() => window.VTAccount.getState().account?.id || null)).toBe(ACCOUNT.id);
  return { navigations, cta: await openPricing(page) };
}

// client-2
test.describe("a press whose session ended elsewhere asks them to sign in again", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  // The worker's requireSession answers 401 with these reasons; the first cut
  // of the page knew only no_session and two reasons the worker never sends.
  for (const reason of ["revoked", "expired"]) {
    test(`a Subscribe press answered 401 "${reason}" forgets the session and opens the sign-in`, async ({ page }) => {
      const state = freshState();
      const { navigations, cta } = await signedInPricing(page, state);
      expect(await sessionNow(page), "precondition: signed in").toEqual({ signedIn: true, stored: true });
      state.checkoutAnswer = [401, { ok: false, reason }];
      await cta.click();
      // Wrong (before): "couldn't open the checkout, try again", the Pro dialog
      // left open, and the panel still signed in, press after press.
      await expect(page.locator("#account-modal")).toBeVisible();
      await expect(page.locator("#pricing-modal")).toBeHidden();
      await expect(page.locator("#toast")).toContainText(/Sign in first/);
      expect(await sessionNow(page)).toEqual({ signedIn: false, stored: false });
      await expect(page.locator("#account-logged-out")).toBeVisible();
      await expect(page.locator("#account-logged-in")).toBeHidden();
      await expect(page.locator("#btn-account")).not.toHaveClass(/is-signed-in/);

      // The next press is not sent with the dead token: it goes to sign-in again.
      await page.locator("#account-close").click();
      await (await openPricing(page)).click();
      await expect(page.locator("#account-modal")).toBeVisible();
      expect(state.checkouts).toHaveLength(1);
      expect(await page.evaluate(() => window.__vtCheckoutAsks)).toBe(1);
      expect(navigations).toEqual([]);
    });
  }

  test("control: a checkout the worker could not open (502) keeps the session and says nothing was charged", async ({ page }) => {
    const state = freshState({ checkoutAnswer: [502, { ok: false, reason: "provider_error" }] });
    const { navigations, cta } = await signedInPricing(page, state);
    await cta.click();
    await expect(page.locator("#toast")).toContainText(/couldn't open the checkout, and nothing was charged/);
    await expect(cta).toBeEnabled();
    await expect(page.locator("#pricing-modal")).toBeVisible();
    await expect(page.locator("#account-modal")).toBeHidden();
    // Wrong: a failure that says nothing about the session signs them out.
    expect(await sessionNow(page)).toEqual({ signedIn: true, stored: true });
    expect(state.checkouts).toHaveLength(1);
    expect(navigations).toEqual([]);
  });

  test("a Manage press answered 401 forgets the session; control: a 502 before it keeps it", async ({ page }) => {
    const state = freshState({ linked: true });
    const { navigations } = await signedInPricing(page, state);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
    const manage = page.locator("#btn-manage-billing");
    await expect(manage).toBeVisible();

    // Control first: the portal failing on Creem's side is not a lost session.
    state.portalAnswer = [502, { ok: false, reason: "provider_error" }];
    await manage.click();
    await expect(page.locator("#toast")).toContainText(/Creem's latest email/);
    await expect(manage).not.toHaveAttribute("aria-busy", "true");
    expect(await sessionNow(page)).toEqual({ signedIn: true, stored: true });

    // Then the session is revoked elsewhere and the next press hears 401.
    state.portalAnswer = [401, { ok: false, reason: "revoked" }];
    await manage.click();
    // Wrong (before): the dead session stayed, and so did the Manage button
    // that fails with it on every press until a reload.
    await expect.poll(() => sessionNow(page)).toEqual({ signedIn: false, stored: false });
    await expect(page.locator("#btn-account")).not.toHaveClass(/is-signed-in/);
    await expect(page.locator("#btn-account")).toHaveText(/Sign in/);
    // And the press is answered with the way on, as a Subscribe press is: the
    // sign-in, with a line saying why. Wrong (round two): "We couldn't open
    // your billing portal", for a portal that only needed them signed in.
    await expect(page.locator("#account-modal")).toBeVisible();
    await expect(page.locator("#toast")).toContainText(/Your session ended. Sign in again to manage or cancel/);
    await expect(page.locator("#toast")).not.toContainText(/couldn't open your billing portal/);
    expect(state.portals).toBe(2);
    expect(navigations).toEqual([]);
  });
});

// client-5
test.describe("one worker checkout at a time, whatever redraws the button", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  test("the Pro dialog redrawn while the checkout opens keeps the pressed plan busy, and a second press opens no second checkout", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ meGate: gate(), checkoutGate: gate() });
    const { navigations } = await install(page, state, license, { config: ON_SALE });
    await open(page);
    const cta = await openPricing(page);
    // Precondition: the load's own /v1/me is still out, so it lands mid-press.
    expect(await page.evaluate(() => window.VTAccount.getState().account)).toBeNull();
    await cta.click();
    await expect(cta).toHaveAttribute("aria-busy", "true");
    await expect.poll(() => state.checkouts.length).toBe(1);
    const pressed = await cta.elementHandle();

    // The free account's /v1/me lands: adopt() clears the licence, VTBilling
    // emits, and the open Pro dialog is drawn again from scratch.
    state.meGate.open();
    await expect.poll(() => pressed.evaluate((b) => b.isConnected), { message: "the dialog was redrawn" }).toBe(false);
    // Wrong (before): the fresh button said Subscribe, enabled, mid-request.
    await expect(cta).toHaveAttribute("aria-busy", "true");
    await expect(cta).toBeDisabled();
    await expect(cta).toHaveText(/Opening secure checkout/);
    await cta.click({ force: true });
    expect(await page.evaluate(() => window.__vtCheckoutAsks), "requests the page sent").toBe(1);

    state.checkoutGate.open();
    await page.waitForURL(CHECKOUT_PAGE, { timeout: 10000 });
    // In the dollars the card showed an American (VG-85: the page names the money it asks to be charged in).
    expect(state.checkouts).toEqual([{ plan: "pro_monthly", provider: "creem", returnPath: "/index.html", currency: "USD" }]);
    expect(navigations).toEqual([CHECKOUT_PAGE]);
  });

  test("a second caller while a checkout opens joins it; control: once it comes back without navigating, the next press asks again", async ({ page }) => {
    const state = freshState({ checkoutGate: gate(), checkoutAnswer: [502, { ok: false, reason: "provider_error" }] });
    const { navigations } = await signedInPricing(page, state);
    const joined = await page.evaluate(() => {
      const first = window.VTBilling.startCheckout("pro_monthly", "creem");
      const second = window.VTBilling.startCheckout("pro_yearly", "creem");
      window.__vtFirstDone = first.done;
      return { first: [first.mode, first.plan], second: [second.mode, second.plan], asks: window.__vtCheckoutAsks };
    });
    // Wrong: the second asked the worker for its own checkout, and whichever
    // answer came last decided where the buyer was sent.
    expect(joined).toEqual({ first: ["opening", "pro_monthly"], second: ["opening", "pro_monthly"], asks: 1 });

    state.checkoutGate.open();
    expect(await page.evaluate(() => window.__vtFirstDone.then((out) => out.mode))).toBe("checkout_failed");
    const next = await page.evaluate(async () => {
      const third = window.VTBilling.startCheckout("pro_yearly", "creem");
      const out = await third.done;
      return { plan: third.plan, mode: out.mode, asks: window.__vtCheckoutAsks };
    });
    // Wrong the other way: a guard that never lets go blocks every later press.
    expect(next).toEqual({ plan: "pro_yearly", mode: "checkout_failed", asks: 2 });
    expect(state.checkouts.map((c) => c.plan)).toEqual(["pro_monthly", "pro_yearly"]);
    expect(navigations).toEqual([]);
  });
});

/** Signed out on a deployment offering `methods`, Google's script refused, a pasted Creem link. */
async function signedOutBlocked(page, state, extra) {
  const license = await mintLicense({ origin: BASE });
  const config = { links: { creem: { pro_monthly: LINK } }, ...(extra || {}) };
  return install(page, state, license, { signedIn: false, gis: "abort", config });
}

// client-6: VG-88 in the real order of events.
test.describe("a press from a browser that cannot sign in ends at a way to pay", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  for (const [sold, extra] of [["the shipped pasted link", null], ["the worker checkout switched on", ON_SALE]]) {
    test(`Google refused, no emailed codes, ${sold}: the sign-in the first press opens offers to pay, and paying goes to the link`, async ({ page }) => {
      const state = freshState({ methods: METHODS_GOOGLE });
      const { navigations } = await signedOutBlocked(page, state, extra);
      await open(page);
      const cta = await openPricing(page);
      expect(await googleReady(page), "precondition: nothing has tried Google's script yet").toBeNull();
      await cta.click();
      // The first press cannot know Google is refused, so it asks them to sign in.
      await expect(page.locator("#account-modal")).toBeVisible();
      await expect(page.locator("#pricing-modal")).toBeHidden();
      await expect.poll(() => googleReady(page)).toBe(false);
      await expect(page.locator("#account-signin-blocked")).toBeVisible();
      // Wrong (before): the panel ended at "could not load", with no way on.
      const offer = page.locator("#account-pay-anyway");
      await expect(offer).toBeVisible();
      await expect(offer).toContainText(/You can still pay from this browser/);
      const go = page.locator("#account-pay-anyway-btn");
      await expect(go).toHaveText(/Continue to payment/);
      expect(navigations).toEqual([]);
      await go.click();
      await page.waitForURL(LINK, { timeout: 10000 });
      expect(navigations).toEqual([LINK]);
      // Signed out, the worker is never asked for a bound checkout.
      expect(state.checkouts).toEqual([]);
    });
  }

  test("control: with emailed codes offered, Google's refusal still leaves a way in, so the panel offers no payment", async ({ page }) => {
    const state = freshState({ methods: METHODS_BOTH });
    const { navigations } = await signedOutBlocked(page, state, null);
    await open(page);
    await (await openPricing(page)).click();
    await expect(page.locator("#account-modal")).toBeVisible();
    // The same refusal as above has happened and been drawn...
    await expect.poll(() => googleReady(page)).toBe(false);
    await expect(page.locator("#account-email-form")).toBeVisible();
    await expect(page.locator("#account-signin-blocked")).toBeHidden();
    // ...and with a way to sign in left, the payment waits for it.
    await expect(page.locator("#account-pay-anyway")).toBeHidden();
    expect(navigations).toEqual([]);
  });
});

// tests-2: VG-88 on the worker-checkout path (js/billing.js workerCheckout).
test.describe("with the worker checkout on, a browser that cannot sign in still pays by the link", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  /** Signed out, Google-only, a Creem link, the worker checkout on; the account panel opened once so the page learns about Google. */
  async function learnGoogle(page, gis) {
    const state = freshState({ methods: METHODS_GOOGLE });
    const license = await mintLicense({ origin: BASE });
    const config = { links: { creem: { pro_monthly: LINK } }, ...ON_SALE };
    const { navigations } = await install(page, state, license, { signedIn: false, gis, config });
    await open(page);
    await page.locator("#btn-account").click();
    await expect(page.locator("#account-modal")).toBeVisible();
    await expect.poll(() => googleReady(page)).toBe(gis === "load");
    await page.locator("#account-close").click();
    await expect(page.locator("#account-modal")).toBeHidden();
    return { state, navigations };
  }

  /** Press for the monthly plan on Creem; what startCheckout answered. */
  function press(page) {
    return page.evaluate(() => {
      const res = window.VTBilling.startCheckout("pro_monthly", "creem");
      return { mode: res.mode, url: res.url || null };
    });
  }

  test("Google refused (googleReady false): startCheckout goes to the pasted link", async ({ page }) => {
    const { state, navigations } = await learnGoogle(page, "abort");
    // Wrong: "signin_required", back to a panel with no way in (VG-88 again).
    expect(await press(page)).toEqual({ mode: "redirect", url: LINK });
    await page.waitForURL(LINK, { timeout: 10000 });
    expect(navigations).toEqual([LINK]);
    expect(state.checkouts).toEqual([]);
  });

  test("control: with Google's script loaded (googleReady true), the same press asks them to sign in", async ({ page }) => {
    const { state, navigations } = await learnGoogle(page, "load");
    expect(await press(page)).toEqual({ mode: "signin_required", url: null });
    expect(new URL(page.url()).pathname).toBe("/index.html");
    expect(navigations).toEqual([]);
    expect(state.checkouts).toEqual([]);
  });
});
