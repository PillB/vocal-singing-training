/**
 * The page's own check on the Creem portal address the worker names, for the
 * answers round one's tests did not try (red team round two, truth-6 c).
 *
 * tests/manage-cancel-route.spec.js tries two hosts that are not Creem's
 * (evil.example, and creem.io.evil.example, which a check by prefix would let
 * through). The rule the red team set is wider: an answer from
 * /v1/me/billing-portal is followed only to an https page on Creem's host,
 * the same rule the worker applies before it answers (isCreemPageUrl,
 * workers/entitlements/src/checkout.js). Two answers break it in ways those
 * hosts do not show:
 * - Creem's host over plain http: the page would send a paying subscriber,
 *   signed in, to a page anyone on the network can read and change.
 * - another rail's checkout page (Stripe, Mercado Pago): the page's checkout
 *   allowlist takes these hosts for pasted links, and a "Manage or cancel"
 *   press must never end on somebody's payment page.
 *
 * The control in each case is the same page and the same press with Creem's
 * own https portal, which is followed. The oracle is where the page goes (the
 * request the browser makes) and what the subscriber is told, never which
 * function ran.
 *
 * The stand-in worker is copied from tests/manage-cancel-route.spec.js and cut
 * down to a signed-in Creem subscriber. It stands at the shipped worker's
 * host, which the page's Content Security Policy allows, so these run under
 * the real policy. The licence is really signed with a throwaway key.
 */
const { test, expect } = require("@playwright/test");
const { mintLicense, patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev";
const DAY = 86400;
const SESSION = "sess-portal-host-1";
const ACCOUNT = { id: "acct_portal_host_1", email: "payer@example.test", trialUsed: true };
const LIC = "ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210_-abcde";
/** Creem's own portal, as the worker names it. */
const PORTAL_PAGE = "https://creem.io/my-orders/login/cust_portal_host_1";
/** The same page on Creem's host, over plain http. */
const HTTP_PORTAL = "http://creem.io/my-orders/login/cust_portal_host_1";
/** Payment pages on hosts the page allows for pasted checkout links, which are not Creem's portal. */
const OTHER_RAILS = ["https://buy.stripe.com/test_not_a_portal", "https://www.mercadopago.com.pe/checkout/v1/redirect?pref_id=not_a_portal"];
const FAILED = /couldn't open your billing portal/;

/** Mutable state of the stand-in worker. */
function freshState() {
  return { portals: 0, portalAnswer: null };
}

/** The claims of the account's paid Creem licence. */
function licenceClaims() {
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
    accountId: ACCOUNT.id,
    source: "paid"
  };
}

/** The `/v1/me` body: a Creem subscriber, paid. */
async function meBody(license) {
  const ent = { pro: true, plan: "pro_monthly", status: "active", source: "paid", provider: "creem", periodEnd: Math.floor(Date.now() / 1000) + 30 * DAY };
  return { ok: true, account: ACCOUNT, entitlement: ent, grants: [], paid: [], billingRails: ["creem"], licenseId: LIC, token: await license.sign(licenceClaims()) };
}

/** The worker's health: both Creem routes on. */
function health() {
  return {
    ok: true,
    signingKeyConfigured: true,
    accountsConfigured: true,
    creemConfigured: true,
    creemCheckoutConfigured: true,
    creemPortalConfigured: true,
    mercadopagoConfigured: true,
    authMethods: { email: true, google: false, googleClientId: null, trialDays: 7 },
    siteOrigin: BASE
  };
}

/** What the stand-in worker answers, as `[status, body]`. */
async function answer(state, license, request) {
  const path = new URL(request.url()).pathname;
  if (path === "/v1/events") return [200, { ok: true }];
  if (path === "/v1/health") return [200, health()];
  if (path === "/v1/auth/methods") return [200, { ok: true, email: true, google: false, googleClientId: null, trialDays: 7 }];
  if ((request.headers().authorization || "") !== `Bearer ${SESSION}`) return [401, { ok: false, reason: "no_session" }];
  if (path === "/v1/me") return [200, await meBody(license)];
  if (path === "/v1/me/billing-portal") {
    state.portals += 1;
    return state.portalAnswer || [200, { ok: true, url: PORTAL_PAGE, provider: "creem" }];
  }
  if (path === "/v1/me/progress") return [200, { ok: true, profiles: [], rev: 0, doc: null, updatedAt: 1 }];
  return [404, { ok: false, reason: "not_found" }];
}

/**
 * Stand the worker in, sign the subscriber in, and answer every off-site page
 * a press can reach with a stub. Returns where the page went.
 * @param {import('@playwright/test').Page} page Page.
 * @param {object} state From `freshState`.
 * @returns {Promise<string[]>} Off-site pages the page navigated to.
 */
async function install(page, state) {
  const license = await mintLicense({ origin: BASE });
  const navigations = [];
  await patchBillingConfig(page, {
    verification: { publicKeyJwk: license.publicKeyJwk, required: true, revalidateHours: 24 * 365 }
  });
  await page.route(`${API}/**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    }
    const [status, body] = await answer(state, license, route.request());
    return route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  });
  const elsewhere = ["https://creem.io/**", "http://creem.io/**", "https://buy.stripe.com/**", "https://www.mercadopago.com.pe/**"];
  for (const glob of elsewhere) {
    await page.route(glob, (route) => {
      navigations.push(route.request().url());
      return route.fulfill({ status: 200, contentType: "text/html", body: "<p>elsewhere</p>" });
    });
  }
  await page.addInitScript((session) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "en");
      sessionStorage.setItem("vt_e2e", "1");
      // app.js hides toasts under vt_e2e; what the subscriber is told is read below.
      sessionStorage.setItem("vt_debug", "1");
      localStorage.setItem("vt_account_session_v1", JSON.stringify({ token: session, expiresAt: 4102444800 }));
    } catch {
      /* ignore */
    }
  }, SESSION);
  return navigations;
}

/** Load the site, wait for the subscriber's Pro from the account, and open the Pro dialog. */
async function openAsSubscriber(page) {
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTBilling && !!window.VTAccount && !!window.VTLicense, null, { timeout: 10000 });
  await expect
    .poll(() => page.evaluate(() => ({ provider: window.VTLicense.getClaims()?.provider || null, accountId: window.VTLicense.getClaims()?.accountId || null })))
    .toEqual({ provider: "creem", accountId: ACCOUNT.id });
  await page.locator("#btn-pricing").click();
  await expect(page.locator("#pricing-modal")).toBeVisible();
  // Precondition: the Creem route is drawn, so a press asks the worker for the portal.
  await expect(page.locator("#btn-manage-billing")).toBeVisible();
}

/** Press Manage with `url` as the worker's answer; the page must stay and say the portal did not open. */
async function pressRefused(page, state, navigations, url) {
  const asked = state.portals;
  state.portalAnswer = [200, { ok: true, url, provider: "creem" }];
  await page.evaluate(() => {
    document.querySelector("#toast").textContent = "";
  });
  await page.locator("#btn-manage-billing").click();
  await expect.poll(() => state.portals).toBe(asked + 1);
  // Wrong: the page went where the answer said.
  await expect(page.locator("#toast"), url).toContainText(FAILED);
  await expect(page.locator("#btn-manage-billing")).not.toHaveAttribute("aria-busy", "true");
  expect(navigations, url).toEqual([]);
  expect(page.url(), url).toBe(`${BASE}/index.html`);
}

/** Control, same page and button: Creem's own https portal is followed. */
async function pressFollowed(page, state, navigations) {
  state.portalAnswer = null;
  await page.locator("#btn-manage-billing").click();
  await page.waitForURL(PORTAL_PAGE, { timeout: 10000 });
  expect(navigations).toEqual([PORTAL_PAGE]);
}

/**
 * Where a press ended, once it has: "followed" (the page went where the
 * answer said), "refused" (it stayed and said the portal did not open), or
 * "waiting" while it is neither yet.
 */
async function pressEnd(page, navigations) {
  if (navigations.length) return "followed";
  try {
    const told = await page.locator("#toast").textContent({ timeout: 500 });
    return FAILED.test(told || "") && page.url() === `${BASE}/index.html` ? "refused" : "waiting";
  } catch {
    return "waiting";
  }
}

/**
 * Load the site afresh, press Manage with `url` as the worker's answer, and
 * wait until the press has ended either way. Every step here is set-up: it
 * must work whether or not the page follows the answer.
 * @returns {Promise<string>} "followed" or "refused".
 */
async function pressOutcome(page, state, navigations, url) {
  navigations.length = 0;
  await openAsSubscriber(page);
  const asked = state.portals;
  state.portalAnswer = [200, { ok: true, url, provider: "creem" }];
  await page.evaluate(() => {
    document.querySelector("#toast").textContent = "";
  });
  await page.locator("#btn-manage-billing").click();
  await expect.poll(() => state.portals, "the press asked the worker for the portal").toBe(asked + 1);
  let end = "waiting";
  await expect
    .poll(async () => {
      end = await pressEnd(page, navigations);
      return end;
    }, { message: `the press on ${url} ended`, timeout: 10000 })
    .not.toBe("waiting");
  return end;
}

test.use({ locale: "en-US", timezoneId: "America/New_York" });

test.describe("a portal answer is followed only to an https page on Creem's host", () => {
  test("Creem's own portal over plain http is not followed; the same page over https is", async ({ page }) => {
    const state = freshState();
    const navigations = await install(page, state);
    await openAsSubscriber(page);
    await pressRefused(page, state, navigations, HTTP_PORTAL);
    await pressFollowed(page, state, navigations);
    expect(state.portals).toBe(2);
  });

  // The defect this guards (red team round two, truth-6): openCreemPortal
  // checked the portal answer with VTBilling.validateCheckoutUrl, the
  // allowlist for pasted checkout links, which takes every Stripe and Mercado
  // Pago checkout host, so a worker answer naming a payment page on one of
  // them was followed from the "Manage or cancel subscription" button
  // (measured on 330c5d7: both answers below navigated). The portal is now
  // checked with VTBilling.validateCreemPageUrl, Creem's host only.
  //
  // Every step before the last assertion is set-up and fails the test as it
  // would any other (the stand-in, the licence, the button, the press
  // reaching the worker), and the control proves the oracle sees a followed
  // page, so the last assertion cannot pass because nothing was ever followed.
  test("a payment page on another rail's checkout host is not followed from the Manage button", async ({ page }) => {
    const state = freshState();
    const navigations = await install(page, state);
    // Control: the oracle sees a page followed. Creem's own portal is.
    await openAsSubscriber(page);
    await pressFollowed(page, state, navigations);
    const ends = {};
    for (const url of OTHER_RAILS) {
      ends[url] = await pressOutcome(page, state, navigations, url);
    }
    expect(state.portals, "one portal request per press").toBe(1 + OTHER_RAILS.length);

    // Wrong (before): the page went to the other rail's payment page.
    expect(ends).toEqual(Object.fromEntries(OTHER_RAILS.map((url) => [url, "refused"])));
  });
});
