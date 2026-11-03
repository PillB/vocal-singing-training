/**
 * Signing in before paying.
 *
 * A payment made while signed out is tied to this browser's storage and to
 * nothing else: the subscription keeps charging while the same person's next
 * phone shows free, and no operator route exists to move that licence onto an
 * account afterwards. The 2026-10-28 audit found this as the second thing
 * blocking payments, after the terms page.
 *
 * The gate sits inside startCheckout, after the link lookup, so a build with no
 * checkout link behaves exactly as before. These tests therefore inject a link
 * at runtime — the committed config deliberately has none — and drive the real
 * client code, with the checkout host stubbed so nothing leaves the machine.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const LINK = "https://buy.stripe.com/test_gate";

/**
 * Open the app with the pricing panel's dependencies in a known state.
 * @param {import('@playwright/test').Page} page Page.
 * @param {{signedIn: boolean, configured: boolean}|null} account Account layer to pretend.
 * @returns {Promise<void>} Nothing.
 */
async function boot(page, account) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      sessionStorage.setItem("vt_e2e", "1");
      // js/app.js suppresses toasts under vt_e2e so they cannot cover Start on a
      // small viewport; vt_debug is its own escape hatch, and one of these tests
      // is about what the visitor is told.
      sessionStorage.setItem("vt_debug", "1");
    } catch {
      /* ignore */
    }
  });
  // Nothing should reach a checkout host; if the gate leaks, these prove it.
  for (const glob of ["https://buy.stripe.com/**", "https://checkout.creem.io/**"]) {
    await page.route(glob, (route) =>
      route.fulfill({ status: 200, contentType: "text/html", body: "<p>checkout</p>" })
    );
  }
  await page.goto(BASE + "/index.html", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTBilling?.startCheckout);
  await page.evaluate((state) => {
    const cfg = window.VT_BILLING_CONFIG;
    cfg.providers.stripe.links.pro_monthly = "https://buy.stripe.com/test_gate";
    // The international markets buy on Creem, so the panel press goes through
    // that rail: without a link on it the press would be refused for having
    // no link at all, before it ever reached the sign-in gate under test.
    cfg.providers.creem.links.pro_monthly = "https://checkout.creem.io/ch_test_gate";
    // The pricing panel reads the account layer through getState(); replacing it
    // is the smallest way to stand in each of the three cases.
    if (state === null) {
      delete window.VTAccount;
    } else {
      window.VTAccount = { ...(window.VTAccount || {}), getState: () => state };
    }
  }, account);
}

test.describe("sign in before paying", () => {
  test("a signed-out visitor is sent to sign in, not to the checkout", async ({ page }) => {
    await boot(page, { configured: true, signedIn: false, methods: { google: true } });
    const res = await page.evaluate(() => window.VTBilling.startCheckout("pro_monthly", "stripe"));
    expect(res.ok).toBe(false);
    expect(res.mode).toBe("signin_required");
    expect(res.plan).toBe("pro_monthly");
    expect(page.url()).toContain("/index.html");
  });

  test("the panel press closes pricing and opens the account panel", async ({ page }) => {
    await boot(page, { configured: true, signedIn: false, methods: { google: true } });
    await page.evaluate(() => window.VTBilling.getPlans?.());
    await page.locator("#btn-pro, #btn-pricing, [data-open-pricing]").first().click();
    const cta = page.locator('#pricing-modal .plan-cta[data-plan="pro_monthly"]');
    await expect(cta).toBeVisible();
    await cta.click();
    await expect(page.locator("#pricing-modal")).toBeHidden();
    await expect(page.locator("#account-modal")).toBeVisible();
    await expect(page.locator("#toast")).toContainText(/Entra primero|Sign in first/);
    expect(page.url()).toContain("/index.html");
  });

  test("a signed-in visitor still reaches the checkout", async ({ page }) => {
    await boot(page, { configured: true, signedIn: true, methods: { google: true } });
    const mode = await page.evaluate(
      () => window.VTBilling.startCheckout("pro_monthly", "stripe").mode
    );
    expect(mode).toBe("redirect");
    // The real branch sets location.href, so the stubbed host is where it lands.
    await page.waitForURL(LINK);
    expect(page.url()).toBe(LINK);
  });

  test("a build with no account layer is not blocked", async ({ page }) => {
    await boot(page, null);
    const mode = await page.evaluate(
      () => window.VTBilling.startCheckout("pro_monthly", "stripe").mode
    );
    expect(mode).toBe("redirect");
    await page.waitForURL(LINK);
    expect(page.url()).toBe(LINK);
  });
});
