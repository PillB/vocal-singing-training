/**
 * Never send anyone to pay on a rail the worker cannot honour.
 *
 * Mercado Pago's webhook is refused outright until MP_WEBHOOK_SECRET and
 * MP_ACCESS_TOKEN exist. Nothing is written for a payment whose webhook was
 * refused, and the claim route only ever reads what the webhook wrote, so the
 * browser asks "is it ready" for seven days and then gives up. A payment taken
 * in that window is money taken for Pro that can never be issued, and the only
 * remedy left is to gift the buyer a grant by hand. The 2026-10-28 audit called
 * this the likeliest way the first real sale goes wrong.
 *
 * "Set the secret before the link goes live" is the operator's order and stays
 * the first line of defence. The gate these tests cover is the net under it:
 * startCheckout asks the worker, through /v1/health, whether it can honour the
 * rail, and stops on an explicit no.
 *
 * The direction of the failure is the point, and it cuts both ways:
 *   - an explicit `false` must stop the sale;
 *   - no answer — a worker that is unreachable, slow, or too old to report the
 *     field — must NOT stop it, or a flaky network becomes a lost sale.
 * Half of these tests are about the second half of that.
 *
 * The committed config has no checkout link, so each test injects one and
 * stubs the checkout host; nothing leaves the machine.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const STRIPE_LINK = "https://buy.stripe.com/test_rail";
const MP_LINK = "https://www.mercadopago.com.pe/subscriptions/checkout?preapproval_plan_id=test_rail";

/** A /v1/health body, with only the fields this gate reads spelled out. */
function healthBody(extra) {
  return JSON.stringify({
    ok: true,
    signingKeyConfigured: true,
    accountsConfigured: true,
    authMethods: { email: false, google: true, googleClientId: null, trialDays: 7 },
    siteOrigin: BASE,
    ...extra
  });
}

/**
 * Open the app with both rails linked, somebody signed in, and /v1/health
 * answering however this test needs.
 * @param {import('@playwright/test').Page} page Page.
 * @param {{health?: string|null, status?: number}} options `health` is the body
 *   to answer with, or null to make the worker unreachable.
 * @returns {Promise<{navigations: string[]}>} Where the page tried to go.
 */
async function boot(page, options) {
  const opts = options || {};
  const navigations = [];
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      sessionStorage.setItem("vt_e2e", "1");
      // app.js hides toasts under vt_e2e so they cannot cover Start; one of
      // these tests is about what the visitor is told, so turn them back on.
      sessionStorage.setItem("vt_debug", "1");
    } catch {
      /* ignore */
    }
  });
  // If the gate ever leaks, these prove it: nothing may reach either host. The
  // attempt is recorded and then aborted rather than answered, because a page
  // that actually navigates takes its own JavaScript with it, and several of
  // these tests ask the page another question after an allowed checkout.
  for (const glob of ["https://buy.stripe.com/**", "https://www.mercadopago.com.pe/**"]) {
    await page.route(glob, (route) => {
      navigations.push(route.request().url());
      return route.abort("aborted");
    });
  }
  await page.route("**/v1/health**", (route) => {
    if (opts.health === null) return route.abort("failed");
    return route.fulfill({
      status: opts.status || 200,
      contentType: "application/json",
      body: opts.health === undefined ? healthBody({}) : opts.health
    });
  });
  // The sign-in methods probe runs on boot and is not what is under test.
  await page.route("**/v1/auth/methods**", (route) =>
    route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ ok: true, email: false, google: true, googleClientId: null, trialDays: 7 })
    })
  );
  await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTBilling?.startCheckout && !!window.VTAccount?.ensureRails);
  await page.evaluate(
    ({ stripe, mp }) => {
      const cfg = window.VT_BILLING_CONFIG;
      cfg.providers.stripe.links.pro_monthly = stripe;
      cfg.providers.mercadopago.links.pro_monthly = mp;
      // Signed in, so the sign-in gate cannot be what refuses.
      const real = window.VTAccount;
      window.VTAccount = {
        ...real,
        getState: () => ({ configured: true, signedIn: true, account: { email: "a@example.com" } })
      };
    },
    { stripe: STRIPE_LINK, mp: MP_LINK }
  );
  return { navigations };
}

/** Let the rails probe land, the way opening the pricing panel does. */
async function askTheWorker(page) {
  await page.evaluate(() => window.VTAccount.ensureRails());
}

test.describe("a rail the worker cannot honour", () => {
  test("a worker with no Mercado Pago secret refuses that rail before the money moves", async ({ page }) => {
    const { navigations } = await boot(page, {
      health: healthBody({ mercadopagoConfigured: false, stripeConfigured: true })
    });
    await askTheWorker(page);
    const res = await page.evaluate(() => window.VTBilling.startCheckout("pro_monthly", "mercadopago"));
    expect(res.ok).toBe(false);
    expect(res.mode).toBe("provider_unavailable");
    expect(res.provider).toBe("mercadopago");
    expect(res.plan).toBe("pro_monthly");
    // Nobody went anywhere near a payment page.
    expect(navigations).toEqual([]);
    expect(page.url()).toContain("/index.html");
  });

  test("one rail being down does not close the other", async ({ page }) => {
    await boot(page, { health: healthBody({ mercadopagoConfigured: false, stripeConfigured: true }) });
    await askTheWorker(page);
    const res = await page.evaluate(() => window.VTBilling.startCheckout("pro_monthly", "stripe"));
    expect(res.mode).toBe("redirect");
  });

  test("and the other way round", async ({ page }) => {
    await boot(page, { health: healthBody({ mercadopagoConfigured: true, stripeConfigured: false }) });
    await askTheWorker(page);
    const stripe = await page.evaluate(() => window.VTBilling.startCheckout("pro_monthly", "stripe"));
    expect(stripe.mode).toBe("provider_unavailable");
    const mp = await page.evaluate(() => window.VTBilling.startCheckout("pro_monthly", "mercadopago"));
    expect(mp.mode).toBe("redirect");
  });

  test("a worker that can honour both refuses neither", async ({ page }) => {
    await boot(page, { health: healthBody({ mercadopagoConfigured: true, stripeConfigured: true }) });
    await askTheWorker(page);
    for (const rail of ["stripe", "mercadopago"]) {
      const res = await page.evaluate((r) => window.VTBilling.startCheckout("pro_monthly", r), rail);
      expect(res.mode, rail).toBe("redirect");
    }
  });

  // ----- the other direction: no answer is not a no

  test("a sale is not lost while the answer is still in the air", async ({ page }) => {
    await boot(page, { health: healthBody({ mercadopagoConfigured: false, stripeConfigured: false }) });
    // Deliberately not awaiting the probe: this is the press that lands before
    // the worker has replied. Both rails would be refused once it does.
    const res = await page.evaluate(() => window.VTBilling.startCheckout("pro_monthly", "mercadopago"));
    expect(res.mode).toBe("redirect");
  });

  test("a worker that cannot be reached is not a no either", async ({ page }) => {
    await boot(page, { health: null });
    await askTheWorker(page);
    const res = await page.evaluate(() => window.VTBilling.startCheckout("pro_monthly", "mercadopago"));
    expect(res.mode).toBe("redirect");
    // And the failed probe was not cached as an answer, so the next open asks
    // again rather than carrying a wrong verdict for the page's life.
    const known = await page.evaluate(() => window.VTAccount.knownRails());
    expect(known).toBe(null);
  });

  test("a worker too old to report a rail is not a no", async ({ page }) => {
    // /v1/health has always carried both fields, so this is belt and braces —
    // but reading a missing field as "off" is exactly the mistake that would
    // close checkout on a deployment that was fine.
    await boot(page, { health: healthBody({}) });
    await askTheWorker(page);
    const known = await page.evaluate(() => window.VTAccount.knownRails());
    expect(known.mercadopago).toBe(null);
    expect(known.stripe).toBe(null);
    const res = await page.evaluate(() => window.VTBilling.startCheckout("pro_monthly", "mercadopago"));
    expect(res.mode).toBe("redirect");
  });

  test("a worker answering nonsense is not a no", async ({ page }) => {
    await boot(page, { health: "<html>error 1101</html>" });
    await askTheWorker(page);
    const res = await page.evaluate(() => window.VTBilling.startCheckout("pro_monthly", "mercadopago"));
    expect(res.mode).toBe("redirect");
  });

  // ----- what the visitor sees

  test("the panel press says so, in plain words, and charges nothing", async ({ page }) => {
    const { navigations } = await boot(page, {
      health: healthBody({ mercadopagoConfigured: false, stripeConfigured: false })
    });
    await askTheWorker(page);
    await page.click("#btn-pricing");
    await expect(page.locator("#pricing-modal")).toBeVisible();
    await page.locator('#pricing-modal .plan-cta[data-plan="pro_monthly"]').click();
    const toast = page.locator("#toast");
    await expect(toast).toContainText(/no está disponible ahora mismo/);
    await expect(toast).toContainText(/no te cobramos nada/);
    // The pricing panel stays open: there is nothing to go and do elsewhere.
    await expect(page.locator("#pricing-modal")).toBeVisible();
    expect(navigations).toEqual([]);
  });

  test("opening the prices is what asks the worker, not loading the page", async ({ page }) => {
    const asked = [];
    await page.addInitScript(() => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        sessionStorage.setItem("vt_e2e", "1");
      } catch {
        /* ignore */
      }
    });
    await page.route("**/v1/health**", (route) => {
      asked.push(route.request().url());
      return route.fulfill({
        status: 200,
        contentType: "application/json",
        body: healthBody({ mercadopagoConfigured: true, stripeConfigured: true })
      });
    });
    await page.route("**/v1/auth/methods**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, email: false, google: true, googleClientId: null, trialDays: 7 })
      })
    );
    await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => !!window.VTBilling?.startCheckout);
    // Somebody who never looks at the prices pays for no extra request.
    expect(asked).toEqual([]);
    await page.click("#btn-pricing");
    await expect(page.locator("#pricing-modal")).toBeVisible();
    await expect.poll(() => asked.length).toBeGreaterThan(0);
    // And once is enough, however many times it is opened.
    await page.locator("#pricing-close").click();
    await page.click("#btn-pricing");
    await expect(page.locator("#pricing-modal")).toBeVisible();
    await page.waitForTimeout(300);
    expect(asked.length).toBe(1);
  });
});
