/**
 * Where "Manage or cancel subscription" goes, and what the lines around it
 * say, for each way a subscriber can stand: paying on Mercado Pago, paying on
 * Creem with the portal on or off, signed out, in a renewal Creem is still
 * retrying, and choosing a rail before paying.
 *
 * The red team's first round on the subscription branch (d69fd73) found each
 * of these either wrong or untested:
 * - tests-3: terms.html promises Mercado Pago payers that the button opens
 *   their Mercado Pago subscriptions, and no test drew the button for them.
 * - tests-6: the page followed whatever portal URL the worker named, and drew
 *   the Creem button on a worker whose /v1/health says it cannot open one.
 * - client-7, truth-1: the Creem cancel line named that button for people the
 *   button is never drawn for (signed out; a worker without CREEM_API_KEY).
 * - money-3: a renewal Creem is still retrying after the paid period leaves no
 *   Pro, so the button went too, while the card was still being charged.
 * - tests-7: the Creem merchant-of-record notice must not be shown to somebody
 *   paying on Mercado Pago, where Creem sells nothing.
 *
 * Each claim has its control beside it: the same set-up with the one input
 * that matters turned the other way, so an assertion that cannot tell the two
 * apart fails one of them. The oracle is what a subscriber can see and press
 * and where the press goes (the tab that opens, the page navigated to, the
 * request the stand-in worker received), never which function ran.
 *
 * The worker is stood in for at the shipped worker's host, which the page's
 * Content Security Policy allows, so these run under the real policy. Licence
 * tokens are really signed with a throwaway key, so the check that grants Pro
 * is the real one. The stand-in is copied from tests/checkout-bound.spec.js
 * and cut down to the routes these cases reach.
 */
const { test, expect } = require("@playwright/test");
const { mintLicense, patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev";
const DAY = 86400;
const SESSION = "sess-manage-1";
const ACCOUNT = { id: "acct_manage_1", email: "payer@example.test", trialUsed: true };
/** A licence id as the worker mints them: 43 base64url characters. */
const LIC = "ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210_-edcba";
const PORTAL_PAGE = "https://creem.io/my-orders/login/cust_manage_1";
/** Where terms.html sends a Mercado Pago payer: their own subscriptions, in Peru. */
const MP_SUBSCRIPTIONS = "https://www.mercadopago.com.pe/subscriptions";
const MP_PLAN_LINK = "https://www.mercadopago.com.pe/subscriptions/checkout?preapproval_plan_id=2c938084test0001";
/**
 * Portal answers that are not Creem's, as a compromised or misconfigured
 * worker might name them: another host, and one that starts with Creem's
 * name, which a check by prefix or substring would let through.
 */
const NOT_CREEM = ["https://evil.example/", "https://creem.io.evil.example/my-orders/login/cust_manage_1"];

const nowSec = () => Math.floor(Date.now() / 1000);

/** A paid entitlement as /v1/me reports it, on `provider`. */
function paidOn(provider) {
  return { pro: true, plan: "pro_monthly", status: "active", source: "paid", provider, periodEnd: nowSec() + 30 * DAY };
}

/** What /v1/me reports once the paid period is over: no Pro, no rail on the entitlement. */
const NO_PRO = { pro: false, plan: null, status: "free", source: null, provider: null, periodEnd: null };

/**
 * Mutable state of the stand-in worker. `billingRails` null means "as the
 * real worker derives it": the rail of a paid entitlement, else none.
 */
function freshState(over) {
  return {
    entitlement: paidOn("creem"),
    billingRails: null,
    portals: 0,
    portalAnswer: null,
    health: {},
    ...(over || {})
  };
}

/** The claims of a paid licence on `provider`; `accountId` only on one minted for the account. */
function licenceClaims(accountId, provider) {
  const now = nowSec();
  return {
    iss: "vocal-studio-entitlements",
    sub: LIC,
    aud: BASE,
    plan: "pro_monthly",
    status: "active",
    provider,
    iat: now,
    exp: now + 3 * DAY,
    periodEnd: now + 30 * DAY,
    ...(accountId ? { accountId, source: "paid" } : {})
  };
}

/** The rails /v1/me names: as set, or the paid entitlement's own. */
function railsOf(state, ent) {
  if (Array.isArray(state.billingRails)) return state.billingRails;
  return ent.pro && ent.source === "paid" ? [ent.provider] : [];
}

/** The `/v1/me` body as the account now stands. */
async function meBody(state, license) {
  const ent = state.entitlement;
  const token = ent.pro
    ? await license.sign({ ...licenceClaims(ACCOUNT.id, ent.provider), source: ent.source })
    : null;
  return {
    ok: true,
    account: ACCOUNT,
    entitlement: ent,
    grants: [],
    paid: [],
    billingRails: railsOf(state, ent),
    licenseId: ent.pro ? LIC : null,
    token
  };
}

/** The worker's health: both Creem routes on unless the case says otherwise. */
function health(state) {
  return {
    ok: true,
    signingKeyConfigured: true,
    accountsConfigured: true,
    creemConfigured: true,
    creemCheckoutConfigured: true,
    creemPortalConfigured: true,
    mercadopagoConfigured: true,
    authMethods: { email: true, google: false, googleClientId: null, trialDays: 7 },
    siteOrigin: BASE,
    ...state.health
  };
}

/** Routes that need no session. */
const OPEN_ROUTES = {
  "/v1/events": () => [200, { ok: true }],
  "/v1/health": (state) => [200, health(state)],
  "/v1/auth/methods": () => [200, { ok: true, email: true, google: false, googleClientId: null, trialDays: 7 }]
};

/** Routes for the signed-in account. */
const ACCOUNT_ROUTES = {
  "/v1/me": async (state, license) => [200, await meBody(state, license)],
  "/v1/me/billing-portal": (state) => {
    state.portals += 1;
    return state.portalAnswer || [200, { ok: true, url: PORTAL_PAGE, provider: "creem" }];
  },
  "/v1/me/progress": () => [200, { ok: true, profiles: [], rev: 0, doc: null, updatedAt: 1 }]
};

/** What the stand-in worker answers, as `[status, body]`. */
async function answer(state, license, request) {
  const path = new URL(request.url()).pathname;
  if (OPEN_ROUTES[path]) return OPEN_ROUTES[path](state, license);
  const signedIn = (request.headers().authorization || "") === `Bearer ${SESSION}`;
  if (path.startsWith("/v1/me") && !signedIn) return [401, { ok: false, reason: "no_session" }];
  if (ACCOUNT_ROUTES[path]) return ACCOUNT_ROUTES[path](state, license);
  return [404, { ok: false, reason: "not_found" }];
}

/** Answer every off-site page the cases can reach with a stub, and note where the page went. */
async function routeElsewhere(page, navigations, opened) {
  for (const glob of ["https://checkout.creem.io/**", "https://creem.io/**", "https://evil.example/**", "https://*.evil.example/**"]) {
    await page.route(glob, (route) => {
      navigations.push(route.request().url());
      return route.fulfill({ status: 200, contentType: "text/html", body: "<p>elsewhere</p>" });
    });
  }
  // On the context, because the Mercado Pago page opens in a tab of its own.
  await page.context().route("https://www.mercadopago.com.pe/**", (route) => {
    opened.push(route.request().url());
    return route.fulfill({ status: 200, contentType: "text/html", body: "<p>Mercado Pago</p>" });
  });
}

/**
 * Stand the worker in and, unless `signedIn: false`, sign the account in;
 * optionally leave a licence in storage. Returns where the page went.
 * @param {import('@playwright/test').Page} page Page.
 * @param {object} state From `freshState`.
 * @param {object} license From `mintLicense`.
 * @param {{config?: object, stored?: string, signedIn?: boolean, lang?: string}} [opts] Extras.
 */
async function install(page, state, license, opts) {
  const o = { signedIn: true, lang: "en", ...(opts || {}) };
  const navigations = [];
  const opened = [];
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
  await routeElsewhere(page, navigations, opened);
  await page.addInitScript((seed) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", seed.lang);
      sessionStorage.setItem("vt_e2e", "1");
      // app.js hides toasts under vt_e2e; some of these cases are about what the person is told.
      sessionStorage.setItem("vt_debug", "1");
      if (!sessionStorage.getItem("vt_seeded")) {
        sessionStorage.setItem("vt_seeded", "1");
        if (seed.signedIn) localStorage.setItem("vt_account_session_v1", JSON.stringify({ token: seed.session, expiresAt: 4102444800 }));
        if (seed.stored) {
          localStorage.setItem("vt_license_v1", JSON.stringify({ licenseId: seed.lic, token: seed.stored, storedAt: new Date().toISOString() }));
        }
      }
    } catch {
      /* ignore */
    }
  }, { session: SESSION, stored: o.stored || null, lic: LIC, signedIn: o.signedIn, lang: o.lang });
  return { navigations, opened };
}

/** Load the site and wait for the account layer. */
async function open(page) {
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTBilling && !!window.VTAccount && !!window.VTLicense, null, { timeout: 10000 });
}

/** What this browser's licence says right now. */
function licenceNow(page) {
  return page.evaluate(() => {
    const claims = window.VTLicense.getClaims();
    return { pro: !!claims, provider: claims?.provider || null, accountId: claims?.accountId || null };
  });
}

/** Whose /v1/me answer the account layer holds: null until one has landed. */
function accountLoaded(page) {
  return page.evaluate(() => window.VTAccount.getState().account?.id || null);
}

/** Open the Pro dialog. */
async function openPricing(page) {
  await page.locator("#btn-pricing").click();
  await expect(page.locator("#pricing-modal")).toBeVisible();
}

/**
 * Open the Pro dialog as somebody who has opened it once before in this tab.
 * The dialog asks /v1/health when it opens (openPricing, js/app.js) and draws
 * before the answer, and nothing draws it again when the answer lands, so
 * only a later opening follows what the worker said. Measured on d69fd73: on
 * the first opening a worker that said creemPortalConfigured:false still gets
 * the Creem button and the line naming it, and a press says "Subscription
 * management isn't available yet" without asking the worker. That is
 * reported as a defect, not asserted here; the first-draw case below holds
 * only what must be true on either side of a fix (line and button agree).
 */
async function openPricingSettled(page) {
  await openPricing(page);
  await expect.poll(() => page.evaluate(() => window.VTAccount.knownRails() !== null), { timeout: 8000 }).toBe(true);
  await page.locator("#pricing-close").click();
  await expect(page.locator("#pricing-modal")).toBeHidden();
  await openPricing(page);
}

/** The Manage button and the cancel line, as drawn. */
function cancelChrome(page) {
  return page.evaluate(() => {
    const manage = document.getElementById("btn-manage-billing");
    const note = document.getElementById("pricing-cancel-note");
    return {
      manageShown: !!manage && !manage.hidden && manage.getClientRects().length > 0,
      manageLabel: (manage?.textContent || "").trim(),
      noteShown: !!note && !note.hidden,
      noteKey: note?.getAttribute("data-i18n") || null,
      noteText: (note?.textContent || "").trim()
    };
  });
}

/** Does the line name the button by the label it is drawn with? The label is read from the button itself. */
function namesButton(chrome) {
  return chrome.manageLabel.length > 0 && chrome.noteText.includes(chrome.manageLabel);
}

// tests-3: the Mercado Pago route terms.html promises had no test.
test.describe("a Mercado Pago payer cancels where terms.html says", () => {
  test.use({ locale: "es-PE", timezoneId: "America/Lima" });

  test("'Gestionar o cancelar suscripción' opens their Mercado Pago subscriptions in a tab of its own, and asks the worker for nothing", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ entitlement: paidOn("mercadopago") });
    const { navigations, opened } = await install(page, state, license, { lang: "es" });
    await open(page);
    // Precondition: Pro from the account, on Mercado Pago.
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "mercadopago", accountId: ACCOUNT.id });
    await openPricing(page);
    const manage = page.locator("#btn-manage-billing");
    // Wrong (the mutant of app.js manageRoute): no Mercado Pago route, so the
    // button terms.html names is not drawn for any Mercado Pago payer.
    await expect(manage).toBeVisible();
    await expect(manage).toHaveText(/Gestionar o cancelar suscripción/);
    const chrome = await cancelChrome(page);
    expect(chrome.noteKey).toBe("pricing.cancel.mercadopago");
    expect(namesButton(chrome), "the line names the button that is drawn").toBe(true);

    const tab = page.context().waitForEvent("page");
    await manage.click();
    const popup = await tab;
    await expect.poll(() => popup.url()).toBe(MP_SUBSCRIPTIONS);
    expect(opened).toEqual([MP_SUBSCRIPTIONS]);
    // A tab with no handle back on this one (noopener): the page it opens
    // cannot navigate the site's tab somewhere else.
    expect(await popup.evaluate(() => window.opener === null)).toBe(true);
    // The site stays where it was, and the Creem portal is not asked for.
    expect(page.url()).toBe(`${BASE}/index.html`);
    expect(navigations).toEqual([]);
    expect(state.portals).toBe(0);
  });

  test("control: a gift on the same account charges nobody, so no button and no tab", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const gift = { ...paidOn("grant"), source: "grant" };
    const state = freshState({ entitlement: gift });
    const { opened } = await install(page, state, license, { lang: "es" });
    await open(page);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "grant", accountId: ACCOUNT.id });
    await openPricing(page);
    const chrome = await cancelChrome(page);
    expect(chrome.manageShown).toBe(false);
    expect(chrome.noteShown, "nothing to cancel, so no line").toBe(false);
    expect(opened).toEqual([]);
  });
});

// tests-6 (first half): the page's URL check on the worker's portal answer had no test.
test.describe("the page's own guard on the Creem portal it is sent to", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  test("a portal answer naming a host that is not Creem's is not followed; Creem's own portal is", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState();
    const { navigations } = await install(page, state, license);
    const manage = page.locator("#btn-manage-billing");
    const failed = /couldn't open your billing portal/;
    for (const [i, url] of NOT_CREEM.entries()) {
      state.portalAnswer = [200, { ok: true, url, provider: "creem" }];
      // A fresh load per answer, so the toast read below is this press's own.
      await open(page);
      await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
      await openPricing(page);
      await expect(page.locator("#toast")).not.toContainText(failed);
      await manage.click();
      await expect.poll(() => state.portals).toBe(i + 1);
      // Wrong: the page went wherever the worker's answer said.
      await expect(page.locator("#toast"), url).toContainText(failed);
      await expect(manage).not.toHaveAttribute("aria-busy", "true");
      expect(navigations, url).toEqual([]);
      expect(page.url()).toBe(`${BASE}/index.html`);
    }

    // Control, same page and button: the portal Creem itself names is followed.
    state.portalAnswer = null;
    await manage.click();
    await page.waitForURL(PORTAL_PAGE);
    expect(navigations).toEqual([PORTAL_PAGE]);
    expect(state.portals).toBe(NOT_CREEM.length + 1);
  });
});

// client-7 and truth-1: the line named a button that was not drawn; tests-6
// (second half): the worker's creemPortalConfigured:false had no test.
test.describe("the Creem cancel line names the button only where it is drawn", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  test("a worker that says it cannot open the portal: no button, and the line points at Creem's emailed link", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ health: { creemPortalConfigured: false } });
    await install(page, state, license);
    await open(page);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
    await openPricingSettled(page);
    const chrome = await cancelChrome(page);
    // Wrong: the button drawn anyway, and a press only an error.
    expect(chrome.manageShown).toBe(false);
    // The label the line must not name, read off the (hidden) button itself.
    expect(chrome.manageLabel).toBe("Manage or cancel subscription");
    // Wrong: "'Manage or cancel subscription' opens your Creem portal".
    expect(chrome.noteShown).toBe(true);
    expect(chrome.noteKey).toBe("pricing.cancel.creemEmail");
    expect(chrome.noteText).toMatch(/Creem emails you your own link to manage or cancel/);
    expect(namesButton(chrome), "the line never names a button that is not drawn").toBe(false);
    expect(state.portals).toBe(0);
    // And it is the worker's no that hid it, not an answer still to come.
    expect(await page.evaluate(() => window.VTAccount.knownRails().creemPortal)).toBe(false);
  });

  test("control: the same subscriber on a worker that can open the portal is given the button, and the line names it", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ health: { creemPortalConfigured: true } });
    await install(page, state, license);
    await open(page);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
    await openPricingSettled(page);
    expect(await page.evaluate(() => window.VTAccount.knownRails().creemPortal)).toBe(true);
    const chrome = await cancelChrome(page);
    expect(chrome.manageShown).toBe(true);
    expect(chrome.noteKey).toBe("pricing.cancel.creem");
    expect(namesButton(chrome)).toBe(true);
  });

  test("signed out, a Creem licence held in this browser has no portal here, and the line does not send them to one", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState();
    // The VG-88 buyer: paid through a link without an account.
    await install(page, state, license, { signedIn: false, stored: await license.sign(licenceClaims(null, "creem")) });
    await open(page);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: null });
    await openPricingSettled(page);
    expect(await page.evaluate(() => window.VTAccount.getState().signedIn)).toBe(false);
    // Precondition: the worker would open the portal, so only signing out hides the button.
    expect(await page.evaluate(() => window.VTAccount.knownRails().creemPortal)).toBe(true);
    const chrome = await cancelChrome(page);
    expect(chrome.manageShown).toBe(false);
    expect(chrome.manageLabel).toBe("Manage or cancel subscription");
    expect(chrome.noteKey).toBe("pricing.cancel.creemEmail");
    expect(namesButton(chrome)).toBe(false);
  });

  test("whatever the dialog's first draw, the line and the button agree", async ({ browser }) => {
    // The first draw comes before the /v1/health answer (see
    // openPricingSettled), so this reads it too, for both workers: whatever
    // the draw shows, the line may name the button only if the button is there.
    const license = await mintLicense({ origin: BASE });
    for (const creemPortalConfigured of [false, true]) {
      const state = freshState({ health: { creemPortalConfigured } });
      const context = await browser.newContext({ locale: "en-US", timezoneId: "America/New_York" });
      const fresh = await context.newPage();
      try {
        await install(fresh, state, license);
        await open(fresh);
        await expect.poll(() => licenceNow(fresh)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
        await openPricing(fresh);
        const first = await cancelChrome(fresh);
        expect(first.manageLabel).toBe("Manage or cancel subscription");
        expect(first.noteShown).toBe(true);
        expect(namesButton(first), `first draw, portal ${creemPortalConfigured}`).toBe(first.manageShown);
        await fresh.locator("#pricing-close").click();
        await openPricingSettled(fresh);
        const settled = await cancelChrome(fresh);
        expect(settled.manageShown, `settled, portal ${creemPortalConfigured}`).toBe(creemPortalConfigured);
        expect(namesButton(settled), `settled, portal ${creemPortalConfigured}`).toBe(settled.manageShown);
      } finally {
        await context.close();
      }
    }
  });
});

// money-3: a renewal Creem retries after the paid period lost its button with its Pro.
test.describe("a renewal Creem is still retrying keeps its Manage button", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  test("no Pro after the paid period, a subscription still on Creem: the button is drawn and opens the portal", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ entitlement: NO_PRO, billingRails: ["creem"] });
    const { navigations } = await install(page, state, license);
    await open(page);
    // Precondition: the account's answer is in, and it gives no Pro.
    await expect.poll(() => accountLoaded(page)).toBe(ACCOUNT.id);
    expect(await licenceNow(page)).toEqual({ pro: false, provider: null, accountId: null });
    await openPricing(page);
    const manage = page.locator("#btn-manage-billing");
    // Wrong (before): the button was keyed on Pro alone, and went with it.
    await expect(manage).toBeVisible();
    await manage.click();
    await page.waitForURL(PORTAL_PAGE);
    expect(state.portals).toBe(1);
    expect(navigations).toEqual([PORTAL_PAGE]);
  });

  test("control: no Pro and no subscription on any rail: no button", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ entitlement: NO_PRO, billingRails: [] });
    await install(page, state, license);
    await open(page);
    await expect.poll(() => accountLoaded(page)).toBe(ACCOUNT.id);
    await openPricing(page);
    expect((await cancelChrome(page)).manageShown).toBe(false);
    expect(state.portals).toBe(0);
  });
});

// tests-7: the notice's rail rule had only a pre-launch control.
test.describe("the Creem merchant-of-record notice follows the rail chosen", () => {
  test.use({ locale: "es-PE", timezoneId: "America/Lima" });

  test("in Peru, with a Mercado Pago link on sale, the notice is hidden on Mercado Pago and shown on Creem", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    const config = { links: { mercadopago: { pro_monthly: MP_PLAN_LINK } }, rails: { creem: { apiCheckout: true } } };
    await install(page, freshState({ entitlement: NO_PRO }), license, { lang: "es", config });
    await open(page);
    await openPricing(page);
    const rails = page.locator("#pricing-rails");
    const mp = rails.locator('.rail-btn[data-rail="mercadopago"]');
    const creem = rails.locator('.rail-btn[data-rail="creem"]');
    const note = page.locator("#pricing-mor-note");
    // Precondition: something is on sale, on both rails, and Peru's own rail is the one chosen.
    await expect(rails).toBeVisible();
    await expect(mp).toHaveAttribute("aria-pressed", "true");
    await expect(creem).toHaveAttribute("aria-pressed", "false");
    // Wrong: a Mercado Pago buyer told that Creem sells them the subscription.
    await expect(note).toBeHidden();
    await expect(note).toHaveText("");

    // Control, same dialog: on the Creem rail the notice is there, with Creem's terms.
    await creem.click();
    await expect(creem).toHaveAttribute("aria-pressed", "true");
    await expect(note).toBeVisible();
    await expect(note).toContainText(/comerciante registrado/);
    await expect(note.locator("a")).toHaveAttribute("href", "https://www.creem.io/buyer-terms");

    // And back: not a latch.
    await rails.locator('.rail-btn[data-rail="mercadopago"]').click();
    await expect(rails.locator('.rail-btn[data-rail="mercadopago"]')).toHaveAttribute("aria-pressed", "true");
    await expect(note).toBeHidden();
  });
});

test.describe("round two: the first opening of the dialog follows the worker's answer", () => {
  test.use({ locale: "en-US", timezoneId: "America/New_York" });

  test("first opening on a worker that cannot open the portal: the button goes once health says so, and the line points at Creem's email", async ({ page }) => {
    // Wrong (round one): the dialog drew before /v1/health answered, treated
    // the missing answer as yes, and was never drawn again, so the button and
    // the line naming it stayed for the whole first opening of every tab.
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ health: { creemPortalConfigured: false }, portalAnswer: [503, { ok: false, reason: "portal_unconfigured" }] });
    await install(page, state, license);
    await open(page);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
    await openPricing(page);
    await expect.poll(() => page.evaluate(() => window.VTAccount.knownRails()?.creemPortal), { timeout: 8000 }).toBe(false);
    await expect.poll(async () => (await cancelChrome(page)).manageShown, { timeout: 5000 }).toBe(false);
    const chrome = await cancelChrome(page);
    expect(chrome.noteKey).toBe("pricing.cancel.creemEmail");
    expect(namesButton(chrome), "the line names no button that is not drawn").toBe(false);
  });

  test("a press on a Manage button gone stale says where Creem's link is, not that billing is not open yet", async ({ page }) => {
    // The button's own handler, reached after the worker said no (a press in
    // the moment before the repaint): the route is gone, and it used to fall
    // through to the Stripe portal's "isn't available yet", false for somebody
    // already paying.
    const license = await mintLicense({ origin: BASE });
    const state = freshState({ health: { creemPortalConfigured: false }, portalAnswer: [503, { ok: false, reason: "portal_unconfigured" }] });
    await install(page, state, license);
    await open(page);
    await expect.poll(() => licenceNow(page)).toEqual({ pro: true, provider: "creem", accountId: ACCOUNT.id });
    await openPricing(page);
    await expect.poll(() => page.evaluate(() => window.VTAccount.knownRails()?.creemPortal), { timeout: 8000 }).toBe(false);
    await page.evaluate(() => document.getElementById("btn-manage-billing").click());
    const toast = page.locator("#toast");
    await expect(toast).toContainText(/Creem emails you your own link to manage or cancel/);
    await expect(toast).not.toContainText(/isn't available yet/);
    expect(state.portals, "and the worker was not asked for a portal it said it cannot open").toBe(0);
  });
});
