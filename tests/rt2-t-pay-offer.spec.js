/**
 * VG-88's "Continue to payment" offer, and the two guards on it that had no
 * test (red team round two, tests-6):
 *
 * 1. The offer needs a link for the plan that was pressed. With the worker
 *    checkout on, the pasted links may stay empty (js/billing-config.js). A
 *    signed-out buyer whose browser cannot sign in (Google's script refused,
 *    no emailed codes) and whose plan has no link would otherwise be offered
 *    "Continue to payment", and pressing it asks for a sign-in again: the
 *    same panel, the same offer, and no way to pay. A link for another plan
 *    does not count: a deploy may paste the monthly link and not the yearly
 *    one, and a Yearly press there must not be offered a payment either.
 * 2. Closing the account panel forgets the plan. Without that, a buyer who
 *    closed the panel and opened it later from the header is offered a
 *    payment for a plan pressed long before.
 *
 * Each claim has its control in the same file: the same set-up with the one
 * input that matters turned the other way (a link for the plan; a fresh
 * Subscribe press after the panel was closed), so an assertion that cannot
 * tell the two apart fails one of them. The oracle is what the buyer sees
 * and where a press goes, never which function ran.
 *
 * The stand-in worker is copied from tests/checkout-bound.spec.js and cut
 * down to the routes a signed-out buyer reaches. It stands at the shipped
 * worker's host, which the page's Content Security Policy allows, so these
 * run under the real policy.
 */
const { test, expect } = require("@playwright/test");
const { mintLicense, patchBillingConfig } = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const API = "https://vocal-studio-entitlements.vocalstudio-pe.workers.dev";
const LINK = "https://www.creem.io/payment/prod_test_monthly";
/** A deploy that signs in with Google only: no emailed codes. */
const GOOGLE_ONLY = { email: false, google: true, googleClientId: "test-client.apps.googleusercontent.com", trialDays: 7 };
/** The worker opens Creem checkouts, and the monthly plan has a pasted link as well. */
const WITH_LINK = { rails: { creem: { apiCheckout: true } }, links: { creem: { pro_monthly: LINK } } };
/** The worker opens Creem checkouts, and no link was pasted (gate step 3 allows it). */
const NO_LINK = { rails: { creem: { apiCheckout: true } } };

/** Stand-in worker state: what it was asked. */
function freshState() {
  return { checkouts: 0, googleRefused: 0, health: 0 };
}

/** The worker's health: accounts on, Creem's checkout on, Google-only sign-in. */
function health() {
  return {
    ok: true,
    signingKeyConfigured: true,
    accountsConfigured: true,
    creemConfigured: true,
    creemCheckoutConfigured: true,
    creemPortalConfigured: true,
    mercadopagoConfigured: true,
    authMethods: GOOGLE_ONLY,
    siteOrigin: BASE
  };
}

/** What the stand-in worker answers a signed-out page, as `[status, body]`. */
function answer(state, request) {
  const path = new URL(request.url()).pathname;
  if (path === "/v1/events") return [200, { ok: true }];
  if (path === "/v1/health") {
    state.health += 1;
    return [200, health()];
  }
  if (path === "/v1/auth/methods") return [200, { ok: true, ...GOOGLE_ONLY }];
  if (path === "/v1/me/checkout") state.checkouts += 1;
  // Nobody is signed in here, so every account route is refused.
  if (path.startsWith("/v1/me")) return [401, { ok: false, reason: "no_session" }];
  return [404, { ok: false, reason: "not_found" }];
}

/**
 * Stand the worker in, refuse Google's script as a content blocker does, and
 * note every navigation to Creem.
 * @param {import('@playwright/test').Page} page Page.
 * @param {object} state From `freshState`.
 * @param {object} config Billing config patch.
 * @returns {Promise<string[]>} The Creem pages the page went to.
 */
async function install(page, state, config) {
  const license = await mintLicense({ origin: BASE });
  const navigations = [];
  await patchBillingConfig(page, {
    verification: { publicKeyJwk: license.publicKeyJwk, required: true, revalidateHours: 24 * 365 },
    ...config
  });
  await page.route(`${API}/**`, async (route) => {
    if (route.request().method() === "OPTIONS") {
      return route.fulfill({ status: 204, headers: { "access-control-allow-origin": "*", "access-control-allow-headers": "*" } });
    }
    const [status, body] = answer(state, route.request());
    return route.fulfill({ status, contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(body) });
  });
  await page.route("https://accounts.google.com/**", (route) => {
    state.googleRefused += 1;
    return route.abort();
  });
  for (const glob of ["https://www.creem.io/**", "https://checkout.creem.io/**", "https://creem.io/**"]) {
    await page.route(glob, (route) => {
      navigations.push(route.request().url());
      return route.fulfill({ status: 200, contentType: "text/html", body: "<p>Creem</p>" });
    });
  }
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "en");
      sessionStorage.setItem("vt_e2e", "1");
      // app.js hides toasts under vt_e2e; the toast a press leaves is read below.
      sessionStorage.setItem("vt_debug", "1");
    } catch {
      /* ignore */
    }
  });
  return navigations;
}

/** Load the site and wait for the account layer. */
async function open(page) {
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTBilling && !!window.VTAccount && !!window.VTLicense, null, { timeout: 10000 });
}

/** Open the Pro dialog and press Subscribe on a plan (monthly unless named); the press lands on the account panel. */
async function pressPlan(page, plan = "pro_monthly") {
  await page.locator("#btn-pro, #btn-pricing, [data-open-pricing]").first().click();
  await expect(page.locator("#pricing-modal")).toBeVisible();
  await page.locator(`#pricing-modal .plan-cta[data-plan="${plan}"]`).click();
  await expect(page.locator("#account-modal")).toBeVisible();
}

/** The links this page knows for the monthly and the yearly plan, on Creem. */
function knownLinks(page) {
  return page.evaluate(() => ({
    monthly: window.VTBilling.checkoutUrl("pro_monthly", "creem"),
    yearly: window.VTBilling.checkoutUrl("pro_yearly", "creem")
  }));
}

/**
 * The panel is in its "cannot sign in here" state: Google refused and no
 * emailed codes. paintSignInStates draws this state and the offer in the same
 * pass, so once it shows, the offer has been decided.
 */
async function blockedShown(page, state) {
  await expect(page.locator("#account-signin-blocked")).toBeVisible({ timeout: 8000 });
  await expect(page.locator("#account-email-form")).toBeHidden();
  expect(state.googleRefused, "Google's script was asked for and refused").toBeGreaterThan(0);
}

/** Open the account panel from the header, from the phone menu where that is where the door is. */
async function openPanelFromHeader(page) {
  if (!(await page.locator("#btn-account").isVisible()) && (await page.locator("#btn-more").isVisible())) {
    await page.click("#btn-more");
  }
  await page.locator("#btn-account").click();
  await expect(page.locator("#account-modal")).toBeVisible();
}

test.use({ locale: "en-US", timezoneId: "America/New_York" });

test.describe("VG-88: the offer to pay without signing in needs a link for the plan pressed", () => {
  test("no link for the plan: the panel says sign-in is blocked and offers no payment it cannot make", async ({ page }) => {
    const state = freshState();
    const navigations = await install(page, state, NO_LINK);
    await open(page);
    // Precondition: the page knows no link for this plan, so the worker checkout is the only way to pay.
    expect(await page.evaluate(() => window.VTBilling.checkoutUrl("pro_monthly", "creem"))).toBeNull();
    await pressPlan(page);
    await blockedShown(page, state);
    // Wrong (checkoutUrl dropped from paintPayAnyway): "Continue to payment"
    // is offered, and a press on it asks for a sign-in again.
    await expect(page.locator("#account-pay-anyway")).toBeHidden();
    await expect(page.locator("#account-pay-anyway-btn")).toBeHidden();
    // Nothing was opened or asked for in their name.
    expect(navigations).toEqual([]);
    expect(state.checkouts).toBe(0);
  });

  test("a link for the monthly plan only: a Yearly press is offered no payment, though Monthly would be", async ({ page }) => {
    const state = freshState();
    const navigations = await install(page, state, WITH_LINK);
    await open(page);
    // Precondition: this page knows a link, but for the other plan, so only
    // the plan pressed can tell the offer apart from the control below.
    expect(await knownLinks(page)).toEqual({ monthly: LINK, yearly: null });
    await pressPlan(page, "pro_yearly");
    await blockedShown(page, state);
    // Wrong (the offer checks some link, not the pressed plan's): "Continue
    // to payment" is offered for Yearly, and its press asks for a sign-in
    // again, the same panel with the same offer.
    await expect(page.locator("#account-pay-anyway")).toBeHidden();
    expect(navigations).toEqual([]);
    expect(state.checkouts).toBe(0);

    // Control in the same page: the monthly link is live here. Now that this
    // browser is known unable to sign in, a Monthly press goes to it (B169).
    await page.locator("#account-close").click();
    await expect(page.locator("#account-modal")).toBeHidden();
    await page.locator("#btn-pro, #btn-pricing, [data-open-pricing]").first().click();
    await page.locator('#pricing-modal .plan-cta[data-plan="pro_monthly"]').click();
    await expect.poll(() => navigations).toEqual([LINK]);
    expect(state.checkouts).toBe(0);
  });

  test("control: the same buyer with a link for the plan is offered it, and the press goes to that link", async ({ page }) => {
    const state = freshState();
    const navigations = await install(page, state, WITH_LINK);
    await open(page);
    expect(await page.evaluate(() => window.VTBilling.checkoutUrl("pro_monthly", "creem"))).toBe(LINK);
    await pressPlan(page);
    await blockedShown(page, state);
    const offer = page.locator("#account-pay-anyway");
    await expect(offer).toBeVisible();
    await expect(offer).toContainText(/You can still pay from this browser/);
    await page.locator("#account-pay-anyway-btn").click();
    await expect.poll(() => navigations).toEqual([LINK]);
    expect(state.checkouts).toBe(0);
  });
});

test.describe("VG-88: closing the account panel forgets the plan that was pressed", () => {
  // Every way the panel can be put away goes through closeAccount().
  const CLOSES = [
    ["its close button", (page) => page.locator("#account-close").click()],
    ["Escape", (page) => page.keyboard.press("Escape")],
    ["a click outside the card", (page) => page.locator("#account-modal").click({ position: { x: 4, y: 4 } })]
  ];

  for (const [how, close] of CLOSES) {
    test(`closed with ${how} and opened again from the header: no offer, and a new Subscribe press goes to the link`, async ({ page }) => {
      const state = freshState();
      const navigations = await install(page, state, WITH_LINK);
      await open(page);
      await pressPlan(page);
      await blockedShown(page, state);
      const offer = page.locator("#account-pay-anyway");
      // Positive anchor: the offer is there for the press, so its absence below is not vacuous.
      await expect(offer).toBeVisible();

      await close(page);
      await expect(page.locator("#account-modal")).toBeHidden();
      await openPanelFromHeader(page);
      // Control: the offer's other two conditions still hold in this page (the
      // panel is in its blocked state and the plan has a link), so the only
      // thing that can hide it is the pressed plan having been forgotten.
      await blockedShown(page, state);
      expect(await page.evaluate(() => window.VTBilling.checkoutUrl("pro_monthly", "creem"))).toBe(LINK);
      // Wrong (closeAccount keeps the plan): the header's "Sign in" opens an
      // offer to pay for a plan pressed before the panel was closed.
      await expect(offer).toBeHidden();
      expect(navigations).toEqual([]);

      // And nobody is stranded: now that this browser is known unable to sign
      // in, a new Subscribe press goes straight to the plan's link (B169).
      await page.locator("#account-close").click();
      await expect(page.locator("#account-modal")).toBeHidden();
      await page.locator("#btn-pro, #btn-pricing, [data-open-pricing]").first().click();
      await page.locator('#pricing-modal .plan-cta[data-plan="pro_monthly"]').click();
      await expect.poll(() => navigations).toEqual([LINK]);
      expect(state.checkouts).toBe(0);
    });
  }
});
