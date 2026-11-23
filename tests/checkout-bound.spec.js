/**
 * Paying while signed in, in the browser: the checkout the worker opens for
 * the account, the link kept until the worker makes it (VG-83), the paid
 * licence that is never dropped before a link has been tried with it, the
 * merchant-of-record notice before paying, and the button a Creem subscriber
 * cancels from (VG-86).
 *
 * The defect behind most of this file: coming back from a checkout, the page
 * asked the worker once to link the purchase to the account. The webhook is
 * usually later than the buyer, so the answer was 202 "pending", and a 202 is
 * fetch's `ok` too: the page took it for the link, forgot the reference, and
 * on the next load the account's own answer (no licence) cleared the Pro the
 * buyer had just paid for. The oracle is therefore what the stand-in worker
 * ends up holding (was the purchase linked to the account?) and what the next
 * load shows, never which function ran.
 *
 * The worker is stood in for at the shipped worker's own host, which the
 * page's Content Security Policy allows, so these run under the real policy
 * (VG-91) with every request answered here. Licence tokens are really signed
 * with a throwaway key, so the check that grants Pro is the real one.
 */
const { test, expect } = require("@playwright/test");
const { mintLicense, patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev";
const DAY = 86400;
const SESSION = "sess-bound-1";
const ACCOUNT = { id: "acct_bound_1", email: "buyer@example.test", trialUsed: true };
/** A licence id as the worker mints them: 43 base64url characters. */
const LIC = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
const CHECKOUT_PAGE = "https://checkout.creem.io/ch_api_1";
const PORTAL_PAGE = "https://creem.io/my-orders/login/cust_bound_1";

/**
 * Mutable state of the stand-in worker. `landed` is whether Creem's webhook
 * has arrived; `linked` whether the purchase belongs to the account.
 */
function freshState(over) {
  return {
    landed: false,
    linked: false,
    links: [],
    claims: 0,
    checkouts: [],
    portals: 0,
    linkAnswer: null,
    checkoutAnswer: null,
    checkoutDelayMs: 0,
    portalAnswer: null,
    entitlement: null,
    ...(over || {})
  };
}

/** The claims of a paid Creem licence; `accountId` only on one minted for the account. */
function licenceClaims(accountId) {
  const now = Math.floor(Date.now() / 1000);
  return {
    iss: "vocal-studio-entitlements",
    sub: LIC,
    aud: BASE,
    plan: "pro_monthly",
    status: "active",
    provider: "creem",
    iat: now,
    exp: now + 3 * DAY,
    periodEnd: now + 30 * DAY,
    ...(accountId ? { accountId, source: "paid" } : {})
  };
}

/** The `/v1/me` body as the account now stands. */
async function meBody(state, license) {
  const paid = state.linked
    ? { pro: true, plan: "pro_monthly", status: "active", source: "paid", provider: "creem", periodEnd: Math.floor(Date.now() / 1000) + 30 * DAY }
    : null;
  const ent = state.entitlement || paid || { pro: false, plan: null, status: "free", source: null, periodEnd: null };
  const token = ent.pro ? await license.sign({ ...licenceClaims(ACCOUNT.id), source: ent.source, provider: ent.provider }) : null;
  const billingRails = state.billingRails || [];
  return { ok: true, account: ACCOUNT, entitlement: ent, grants: [], paid: [], licenseId: ent.pro ? LIC : null, token, billingRails };
}

/** `/v1/me/link`, as the real route answers: 202 before the webhook, the account after. */
async function linkAnswer(state, body, license) {
  state.links.push(body);
  if (state.linkDelayMs) await new Promise((r) => setTimeout(r, state.linkDelayMs));
  if (state.linkAnswer) return state.linkAnswer;
  if (body.sessionId && !state.landed) return [202, { ok: false, reason: "pending" }];
  if (!state.linked) state.linkedAt = Date.now();
  state.linked = true;
  return [200, await meBody(state, license)];
}

/** `/v1/claim`: pending once, then the anonymous licence, as when the webhook lands a moment after the buyer. */
async function claimAnswer(state, license) {
  state.claims += 1;
  if (state.claimsPendForever || state.claims < 2) return [202, { ok: false, reason: "pending" }];
  if (!state.landed) state.landedAt = Date.now();
  state.landed = true;
  return [200, { ok: true, token: await license.sign(licenceClaims(null)), licenseId: LIC }];
}

/** `/v1/me/checkout` and `/v1/me/billing-portal`. */
async function payAnswer(state, path, body) {
  if (path === "/v1/me/checkout") {
    state.checkouts.push(body);
    if (state.checkoutDelayMs) await new Promise((r) => setTimeout(r, state.checkoutDelayMs));
    return state.checkoutAnswer || [200, { ok: true, url: CHECKOUT_PAGE, plan: body.plan, provider: "creem" }];
  }
  state.portals += 1;
  return state.portalAnswer || [200, { ok: true, url: PORTAL_PAGE, provider: "creem" }];
}

/** What the stand-in worker answers, as `[status, body]`. */
async function answer(state, license, request) {
  const path = new URL(request.url()).pathname;
  let body = {};
  try {
    body = request.postDataJSON() || {};
  } catch {
    body = {};
  }
  if (path === "/v1/events") return [200, { ok: true }];
  if (path === "/v1/health") return [200, health(state)];
  if (path === "/v1/auth/methods") return [200, { ok: true, ...authMethods(state) }];
  if (path === "/v1/claim") return claimAnswer(state, license);
  const signedIn = (request.headers().authorization || "") === `Bearer ${SESSION}`;
  if (path.startsWith("/v1/me") && !signedIn) return [401, { ok: false, reason: "no_session" }];
  if (path === "/v1/me") return meAnswer(state, license);
  if (path === "/v1/me/link") return linkAnswer(state, body, license);
  if (path === "/v1/me/checkout" || path === "/v1/me/billing-portal") return payAnswer(state, path, body);
  if (path === "/v1/me/progress") return [200, { ok: true, profiles: [], rev: 0, doc: null, updatedAt: 1 }];
  return [404, { ok: false, reason: "not_found" }];
}

/** `/v1/me`, held until the first link request when the case asks for it. */
async function meAnswer(state, license) {
  if (state.meWaitsForLink) await firstLink(state);
  return [200, await meBody(state, license)];
}

/**
 * Until the first link request has arrived, or 5 s. Holding the load's
 * `/v1/me` this long makes the order certain: the return page's link is out
 * before the load's own retry, which follows `/v1/me`, is sent.
 */
async function firstLink(state) {
  for (let waited = 0; !state.links.length && waited < 5000; waited += 50) {
    await new Promise((r) => setTimeout(r, 50));
  }
}

/** How the stand-in worker signs people in: emailed codes, unless the case says otherwise. */
function authMethods(state) {
  return state.authMethods || { email: true, google: false, googleClientId: null, trialDays: 7 };
}

/** The worker's health, with the two routes this file is about switched on. */
function health(state) {
  return {
    ok: true,
    signingKeyConfigured: true,
    accountsConfigured: true,
    creemConfigured: true,
    creemCheckoutConfigured: true,
    creemPortalConfigured: true,
    mercadopagoConfigured: true,
    authMethods: authMethods(state),
    siteOrigin: BASE
  };
}

/**
 * Stand the worker in, sign somebody in, and optionally leave a licence and a
 * pending link in storage. Returns where the page tried to navigate.
 * @param {import('@playwright/test').Page} page Page.
 * @param {object} state From `freshState`.
 * @param {object} license From `mintLicense`.
 * @param {{config?: object, stored?: string, pending?: object, signedOut?: boolean}} [opts] Extras.
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
  for (const glob of ["https://checkout.creem.io/**", "https://creem.io/**"]) {
    await page.route(glob, (route) => {
      navigations.push(route.request().url());
      return route.fulfill({ status: 200, contentType: "text/html", body: "<p>Creem</p>" });
    });
  }
  await page.addInitScript((seed) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "en");
      sessionStorage.setItem("vt_e2e", "1");
      // app.js hides toasts under vt_e2e; some of these cases are about what the person is told.
      sessionStorage.setItem("vt_debug", "1");
      if (!sessionStorage.getItem("vt_seeded")) {
        sessionStorage.setItem("vt_seeded", "1");
        if (seed.session) localStorage.setItem("vt_account_session_v1", JSON.stringify({ token: seed.session, expiresAt: 4102444800 }));
        if (seed.stored) {
          localStorage.setItem("vt_license_v1", JSON.stringify({ licenseId: seed.lic, token: seed.stored, storedAt: new Date().toISOString() }));
        }
        if (seed.pending) localStorage.setItem("vt_pending_link_v1", JSON.stringify(seed.pending));
      }
    } catch {
      /* ignore */
    }
  }, { session: o.signedOut ? null : SESSION, stored: o.stored || null, lic: LIC, pending: o.pending || null });
  return { navigations };
}

/** Load a page of the site and wait for the account layer. */
async function open(page, query) {
  await page.goto(`${BASE}/index.html${query || ""}`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTBilling && !!window.VTAccount && !!window.VTLicense, null, { timeout: 10000 });
}

/** What this browser's licence says right now. */
function licenceNow(page) {
  return page.evaluate(() => {
    const claims = window.VTLicense.getClaims();
    return { pro: !!claims, provider: claims?.provider || null, accountId: claims?.accountId || null };
  });
}

test.describe("VG-83: a purchase made while signed in reaches the account however late the webhook is", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  test("the link answered 'pending' is made once the claim lands, and the next load is Pro from the account", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState();
    await install(page, state, license);
    await open(page, "?billing=success&checkout_id=ch_1");
    // The first link went out before the webhook and was told to wait.
    await expect.poll(() => state.links.length, { timeout: 5000 }).toBeGreaterThan(0);
    expect(state.links[0]).toEqual({ provider: "creem", sessionId: "ch_1" });
    // Wrong (before): the 202 was taken for the link, the reference forgotten,
    // and nothing asked again; `linked` stayed false.
    await expect.poll(() => state.linked, { timeout: 9000 }).toBe(true);
    expect(state.links.at(-1)).toEqual({ provider: "creem", sessionId: "ch_1" });
    // And at once, not at the next scheduled retry: the claim landing (about
    // 1.5 s in) is the sign the webhook has, and the retry is 4 s after the
    // first try, about 2.5 s after it. The account shows Pro while they look.
    expect(state.linkedAt - state.landedAt).toBeLessThan(1500);
    await expect.poll(() => page.evaluate(() => localStorage.getItem("vt_pending_link_v1"))).toBeNull();

    await open(page, "");
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
  });

  test("a link still pending when the tab closes is tried again on the next load", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    // The load's /v1/me waits for the return's link, and the link is slow to
    // answer, so the load's retry is certain to come while the first is out.
    // Left to timing, the two missed each other on some runs, and a page that
    // sent both passed.
    const state = freshState({ claimsPendForever: true, meWaitsForLink: true, linkDelayMs: 400 });
    await install(page, state, license);
    await open(page, "?billing=success&checkout_id=ch_1");
    await expect.poll(() => state.links.length, { timeout: 5000 }).toBeGreaterThan(0);
    // The return and the load's own retry asked at once: one request answers both
    // (the next in-page retry is 4 s away).
    await page.waitForTimeout(1500);
    // Off for the next visit, which should link at once.
    Object.assign(state, { meWaitsForLink: false, linkDelayMs: 0 });
    expect(state.links).toHaveLength(1);
    const kept = await page.evaluate(() => JSON.parse(localStorage.getItem("vt_pending_link_v1") || "null"));
    expect(kept).toMatchObject({ provider: "creem", sessionId: "ch_1" });

    // The webhook lands while nobody is looking; the next visit links it.
    state.landed = true;
    await open(page, "");
    await expect.poll(() => state.linked, { timeout: 5000 }).toBe(true);
    expect(state.links.at(-1)).toEqual({ provider: "creem", sessionId: "ch_1" });
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
  });

  test("control: a pending link older than a week is dropped, not sent", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ landed: true });
    await install(page, state, license, { pending: { provider: "creem", sessionId: "ch_old", at: Date.now() - 8 * DAY * 1000 } });
    await open(page, "");
    await expect.poll(() => page.evaluate(() => localStorage.getItem("vt_pending_link_v1"))).toBeNull();
    expect(state.links).toEqual([]);
  });
});

test.describe("VG-83: a paid licence the account does not show yet is linked, not dropped", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  test("the licence is linked by its id and the account becomes Pro", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ landed: true });
    await install(page, state, license, { stored: await license.sign(licenceClaims(null)) });
    await open(page, "");
    // Wrong (before): the account's own answer, no licence, cleared it.
    await expect.poll(() => state.links, { timeout: 5000 }).toEqual([{ licenseId: LIC }]);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
  });

  test("control: a licence minted for the account, which the account no longer shows (refunded, moved), is cleared with no link asked for", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ landed: true });
    await install(page, state, license, { stored: await license.sign(licenceClaims(ACCOUNT.id)) });
    await open(page, "");
    await expect.poll(() => page.evaluate(() => window.VTLicense.getStatus().hasToken)).toBe(false);
    expect(state.links).toEqual([]);
  });

  test("control: a licence another account holds (409) is cleared", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const refused = freshState({ landed: true, linkAnswer: [409, { ok: false, reason: "already_linked" }] });
    await install(page, refused, license, { stored: await license.sign(licenceClaims(null)) });
    await open(page, "");
    await expect.poll(() => refused.links.length, { timeout: 5000 }).toBe(1);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: false, provider: null, accountId: null });
  });

  test("control: a worker that fails (503) leaves the licence standing", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const failing = freshState({ landed: true, linkAnswer: [503, { ok: false, reason: "unavailable" }] });
    await install(page, failing, license, { stored: await license.sign(licenceClaims(null)) });
    await open(page, "");
    // Asked again, not given up on: the first cut marked the licence tried
    // before the answer, so the next refresh in the page dropped it after
    // one 503 (red team, money-2). The in-page retry asks at 4 s.
    await expect.poll(() => failing.links.length, { timeout: 9000 }).toBeGreaterThanOrEqual(2);
    // Wrong: dropped on a failure that says nothing about whose it is.
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: null });
    await page.evaluate(() => window.VTAccount.refresh());
    expect(await licenceNow(page), "and a refresh after it keeps it too").toEqual({ pro: true, provider: "creem", accountId: null });
  });
});

/** Open the Pro dialog and return the monthly plan's button. */
async function openPricing(page) {
  await page.locator("#btn-pro, #btn-pricing, [data-open-pricing]").first().click();
  await expect(page.locator("#pricing-modal")).toBeVisible();
  return page.locator('#pricing-modal .plan-cta[data-plan="pro_monthly"]');
}

const ON_SALE = { config: { rails: { creem: { apiCheckout: true } } } };

test.describe("a checkout the worker opens for the account", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  test("one press asks the worker once, says it is opening, and goes to the checkout it named", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ checkoutDelayMs: 600 });
    const { navigations } = await install(page, state, license, ON_SALE);
    await open(page, "");
    const cta = await openPricing(page);
    await cta.click();
    await expect(cta).toHaveAttribute("aria-busy", "true");
    await expect(cta).toHaveText(/Opening secure checkout/);
    // A second press while the worker is answering is not a second checkout.
    await cta.click({ force: true });
    await page.waitForURL(CHECKOUT_PAGE);
    // In the dollars the card showed an American (VG-85: the page names the money it asks to be charged in).
    expect(state.checkouts).toEqual([{ plan: "pro_monthly", provider: "creem", returnPath: "/index.html", currency: "USD" }]);
    expect(navigations).toEqual([CHECKOUT_PAGE]);
  });

  test("a refusal or a failure keeps the page, gives the button back, and says nothing was charged", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState();
    const { navigations } = await install(page, state, license, ON_SALE);
    await open(page, "");
    const cta = await openPricing(page);
    const label = await cta.textContent();
    const cases = [
      [[429, { ok: false, reason: "rate_limited", retryAfter: 60 }], /Too many tries in a row/],
      [[502, { ok: false, reason: "provider_error" }], /couldn't open the checkout, and nothing was charged/],
      // The page checks the worker's answer too: somewhere that is not a checkout host is not followed.
      [[200, { ok: true, url: "https://evil.example/pay" }], /couldn't open the checkout, and nothing was charged/]
    ];
    for (const [reply, said] of cases) {
      state.checkoutAnswer = reply;
      // Emptied first: the last two cases say the same words, so the third
      // passed on the second's toast even when its own press said nothing.
      await page.evaluate(() => {
        document.querySelector("#toast").textContent = "";
      });
      await cta.click();
      await expect(page.locator("#toast")).toContainText(said);
      await expect(cta).not.toHaveAttribute("aria-busy", "true");
      await expect(cta).toBeEnabled();
      await expect(cta).toHaveText(label);
    }
    expect(navigations).toEqual([]);
    expect(state.checkouts).toHaveLength(3);
  });

  test("before paying, the buyer is told Creem sells the subscription, with its Buyer Terms", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, freshState(), license, ON_SALE);
    await open(page, "");
    await openPricing(page);
    const note = page.locator("#pricing-mor-note");
    await expect(note).toBeVisible();
    await expect(note).toContainText(/merchant of record/);
    await expect(note.locator("a")).toHaveAttribute("href", "https://www.creem.io/buyer-terms");
  });

  test("control: with nothing on sale the notice is not shown", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, freshState(), license);
    await open(page, "");
    await openPricing(page);
    await expect(page.locator("#pricing-mor-note")).toBeHidden();
  });
});

test.describe("VG-86: a Creem subscriber cancels from inside the site", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  test("'Manage or cancel subscription' opens their own Creem portal", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ landed: true, linked: true });
    const { navigations } = await install(page, state, license, ON_SALE);
    await open(page, "");
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
    await openPricing(page);
    const manage = page.locator("#btn-manage-billing");
    await expect(manage).toBeVisible();
    await expect(manage).toHaveText(/Manage or cancel subscription/);
    await expect(page.locator("#pricing-cancel-note")).toContainText(/Creem portal/);
    await manage.click();
    await page.waitForURL(PORTAL_PAGE);
    expect(state.portals).toBe(1);
    expect(navigations).toEqual([PORTAL_PAGE]);
  });

  test("a portal the worker cannot open keeps the page and names the other ways out", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ landed: true, linked: true, portalAnswer: [502, { ok: false, reason: "provider_error" }] });
    const { navigations } = await install(page, state, license, ON_SALE);
    await open(page, "");
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
    await openPricing(page);
    await page.locator("#btn-manage-billing").click();
    await expect(page.locator("#toast")).toContainText(/Creem's latest email, or write to us/);
    expect(navigations).toEqual([]);
  });

  test("a renewal still being retried after the paid month: no Pro, the button stays, and the line says why", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    // The worker's /v1/me: no entitlement, and a Creem subscription not over (CK15).
    const state = freshState({ landed: true, billingRails: ["creem"] });
    const { navigations } = await install(page, state, license, ON_SALE);
    await open(page, "");
    await expect.poll(() => page.evaluate(() => window.VTAccount.getState().billingRails)).toEqual(["creem"]);
    expect(await licenceNow(page)).toEqual({ pro: false, provider: null, accountId: null });
    await openPricing(page);
    const note = page.locator("#pricing-cancel-note");
    // Wrong (before): no Pro, so no button and no line, for the subscriber
    // whose card is still being charged.
    await expect(page.locator("#btn-manage-billing")).toBeVisible();
    await expect(note).toBeVisible();
    await expect(note).toHaveAttribute("data-i18n", "pricing.cancel.lapsed");
    await expect(note).toContainText(/still open, but Pro is off/);
    await page.locator("#btn-manage-billing").click();
    await page.waitForURL(PORTAL_PAGE);
    expect(navigations).toEqual([PORTAL_PAGE]);
  });

  test("control: an account with no open subscription and no Pro has neither the button nor the line", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await install(page, freshState({ landed: true }), license, ON_SALE);
    await open(page, "");
    await expect.poll(() => page.evaluate(() => window.VTAccount.getState().signedIn)).toBe(true);
    await openPricing(page);
    await expect(page.locator("#btn-manage-billing")).toBeHidden();
    await expect(page.locator("#pricing-cancel-note")).toBeHidden();
  });

  test("control: a trial has nothing to cancel, so no button", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const trial = { pro: true, plan: "pro_monthly", status: "active", source: "trial", provider: "grant", periodEnd: Math.floor(Date.now() / 1000) + 7 * DAY };
    const state = freshState({ entitlement: trial });
    await install(page, state, license, ON_SALE);
    await open(page, "");
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "grant", accountId: ACCOUNT.id });
    await openPricing(page);
    await expect(page.locator("#btn-manage-billing")).toBeHidden();
  });
});

test.describe("VG-88: where this browser cannot sign in, the account panel offers to go on and pay", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  const LINK = "https://www.creem.io/payment/prod_test_monthly";
  const GOOGLE_ONLY = { email: false, google: true, googleClientId: "test-client.apps.googleusercontent.com", trialDays: 7 };
  const WITH_LINK = { config: { rails: { creem: { apiCheckout: true } }, links: { creem: { pro_monthly: LINK } } }, signedOut: true };

  /** Press Subscribe signed out, with Google's script refused: the press lands on the account panel. */
  async function pressSignedOut(page, state, license) {
    // A content blocker refusing Google's script, as the real one does.
    await page.route("https://accounts.google.com/**", (route) => {
      state.googleRefused = (state.googleRefused || 0) + 1;
      return route.abort();
    });
    const { navigations } = await install(page, state, license, WITH_LINK);
    for (const glob of ["https://www.creem.io/**"]) {
      await page.route(glob, (route) => {
        navigations.push(route.request().url());
        return route.fulfill({ status: 200, contentType: "text/html", body: "<p>Creem</p>" });
      });
    }
    await open(page, "");
    const cta = await openPricing(page);
    await cta.click();
    await expect(page.locator("#account-modal")).toBeVisible();
    return navigations;
  }

  test("the offer shows once Google fails, the 'sign in first' toast goes, and the button pays by the link", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const navigations = await pressSignedOut(page, freshState({ authMethods: GOOGLE_ONLY }), license);
    const offer = page.locator("#account-pay-anyway");
    await expect(offer).toBeVisible({ timeout: 8000 });
    await expect(offer).toContainText(/You can still pay from this browser/);
    // Wrong: the toast that sent them here ("sign in first") stays over the
    // panel, saying the opposite of the offer under it.
    // Read once, not polled: the toast leaves on its own after 4.6 s, and a
    // retried assertion waited that out and passed.
    expect(await page.locator("#toast").getAttribute("class")).not.toMatch(/\bshow\b/);
    await page.locator("#account-pay-anyway-btn").click();
    await expect.poll(() => navigations).toEqual([LINK]);
  });

  test("control: with emailed codes on, signing in is possible, so there is no offer", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ authMethods: { ...GOOGLE_ONLY, email: true } });
    const navigations = await pressSignedOut(page, state, license);
    await expect(page.locator("#account-email-form")).toBeVisible();
    // Google refused here too; the offer, where it shows, follows within a moment.
    await expect.poll(() => state.googleRefused || 0, { timeout: 8000 }).toBeGreaterThan(0);
    await page.waitForTimeout(1500);
    await expect(page.locator("#account-pay-anyway")).toBeHidden();
    expect(navigations).toEqual([]);
  });
});
