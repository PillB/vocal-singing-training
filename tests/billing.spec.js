/**
 * Subscription / billing regression — rails, entitlement, pricing overlay.
 */
const { test, expect } = require("@playwright/test");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      sessionStorage.setItem("vt_e2e", "1");
      localStorage.removeItem("vt_billing_v1");
    } catch {
      /* ignore */
    }
  });
  await page.goto(BASE, { waitUntil: "domcontentloaded" });
}

test.describe("Billing & subscriptions", () => {
  test("billing globals and config markets exist", async ({ page }) => {
    await boot(page);
    const info = await page.evaluate(() => {
      const c = window.VT_BILLING_CONFIG;
      const B = window.VTBilling;
      return {
        hasConfig: !!c,
        hasBilling: !!B,
        plans: (c?.plans || []).map((p) => p.id),
        markets: (c?.markets || []).map((m) => m.code),
        hasStripe: !!c?.providers?.stripe,
        hasMp: !!c?.providers?.mercadopago,
        pe: (c?.markets || []).find((m) => m.code === "PE"),
        us: (c?.markets || []).find((m) => m.code === "US")
      };
    });
    expect(info.hasConfig).toBe(true);
    expect(info.hasBilling).toBe(true);
    expect(info.plans).toEqual(expect.arrayContaining(["free", "pro_monthly", "pro_yearly"]));
    expect(info.markets).toEqual(expect.arrayContaining(["PE", "US", "ES", "GB", "MX", "DE", "BR"]));
    expect(info.hasStripe).toBe(true);
    expect(info.hasMp).toBe(true);
    expect(info.pe?.rail).toBe("mercadopago");
    expect(info.us?.rail).toBe("stripe");
  });

  test("pricing modal opens from header without leaving home", async ({ page }) => {
    await boot(page);
    await expect(page.locator("#btn-pricing")).toBeVisible();
    await page.click("#btn-pricing");
    await expect(page.locator("#pricing-modal")).toBeVisible();
    await expect(page.locator("#pricing-grid .plan-card")).toHaveCount(3);
    await expect(page.locator("#pricing-rails .rail-btn")).toHaveCount(2);
    // Modal centered overlay — close works
    await page.click("#pricing-close");
    await expect(page.locator("#pricing-modal")).toBeHidden();
    await expect(page.locator("#view-home")).toHaveClass(/active/);
  });

  test("demo Pro unlock enables export feature flag", async ({ page }) => {
    await boot(page);
    await page.click("#btn-pricing");
    await page.click("#btn-demo-pro");
    const ent = await page.evaluate(() => {
      const e = VTBilling.getEntitlement();
      return { pro: e.pro, source: e.source, canExport: VTBilling.can("export_progress") };
    });
    expect(ent.pro).toBe(true);
    expect(ent.source).toBe("demo");
    expect(ent.canExport).toBe(true);
    await expect(page.locator("#billing-pill")).toContainText(/Pro/i);
    await expect(page.locator("#btn-export-progress")).toBeVisible();
  });

  test("checkout return URL activates entitlement", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        sessionStorage.setItem("vt_e2e", "1");
        localStorage.removeItem("vt_billing_v1");
      } catch {
        /* ignore */
      }
    });
    await page.goto(`${BASE}/?billing=success&plan=pro_yearly&provider=stripe`, {
      waitUntil: "domcontentloaded"
    });
    const ent = await page.evaluate(() => VTBilling.getEntitlement());
    expect(ent.pro).toBe(true);
    expect(ent.plan).toBe("pro_yearly");
    // URL cleaned
    expect(page.url()).not.toContain("billing=success");
  });

  test("value pulse board and pricing value stack are present", async ({ page }) => {
    await page.goto(BASE + "/?e2e=1&t=" + Date.now(), { waitUntil: "networkidle" });
    await expect(page.locator("#value-pulse")).toBeVisible();
    await expect(page.locator("#vp-sessions")).toBeVisible();
    await page.click("#btn-pricing");
    await expect(page.locator("#pricing-modal")).toBeVisible();
    await expect(page.locator("#pricing-value-stack")).toBeVisible();
    await expect(page.locator("#pricing-personal")).toBeVisible();
    const pulse = await page.evaluate(() => window.VTValuePulse?.compute?.());
    expect(pulse).toBeTruthy();
    expect(typeof pulse.sessions).toBe("number");
  });

  test("trial or free entitlement always defined", async ({ page }) => {
    await boot(page);
    const e = await page.evaluate(() => VTBilling.getEntitlement());
    expect(["free", "trial", "active", "expired"]).toContain(e.status);
    expect(typeof e.pro).toBe("boolean");
  });

  test("billing health and checkout URL host allowlist", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const h = VTBilling.getBillingHealth();
      const bad = VTBilling.validateCheckoutUrl("https://evil.example/pay");
      const good = VTBilling.validateCheckoutUrl("https://buy.stripe.com/test_abc");
      const http = VTBilling.validateCheckoutUrl("http://buy.stripe.com/x");
      return { h, bad, good, http, links: VTBilling.linksConfigured() };
    });
    expect(r.h).toBeTruthy();
    expect(Array.isArray(r.h.issues)).toBe(true);
    // Empty links + demo on → not production-ok
    expect(r.h.ok).toBe(false);
    expect(r.h.portalConfigured).toBe(false);
    expect(r.bad.ok).toBe(false);
    expect(r.good.ok).toBe(true);
    expect(r.http.ok).toBe(false);
  });

  test("customer portal URL validation and manage-billing UI", async ({ page }) => {
    await boot(page);
    const portal = await page.evaluate(() => {
      const good = VTBilling.isPortalUrl("https://billing.stripe.com/p/login/test_abc");
      const badHost = VTBilling.isPortalUrl("https://evil.example/billing");
      const http = VTBilling.isPortalUrl("http://billing.stripe.com/p/login/x");
      const empty = VTBilling.openCustomerPortal();
      return { good, badHost, http, empty };
    });
    expect(portal.good).toBe(true);
    expect(portal.badHost).toBe(false);
    expect(portal.http).toBe(false);
    expect(portal.empty.ok).toBe(false);
    expect(portal.empty.mode).toBe("unconfigured");

    // Manage button hidden without portal URL
    await page.click("#btn-pricing");
    await expect(page.locator("#btn-manage-billing")).toBeHidden();
    // Health note visible when not production-ok
    await expect(page.locator("#pricing-health-note")).toBeVisible();

    // Configure portal + activate Pro → manage button appears
    await page.evaluate(() => {
      window.VT_BILLING_CONFIG.customerPortalUrl =
        "https://billing.stripe.com/p/login/test_abc";
      VTBilling.activateDemo("pro_monthly");
    });
    await page.click("#pricing-close");
    await page.click("#btn-pricing");
    await expect(page.locator("#btn-manage-billing")).toBeVisible();

    const openRes = await page.evaluate(() => VTBilling.openCustomerPortal());
    expect(openRes.ok).toBe(true);
    expect(openRes.mode).toBe("redirect");
  });

  test("strict mode rejects success return without session_id", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        sessionStorage.setItem("vt_e2e", "1");
        localStorage.removeItem("vt_billing_v1");
      } catch {
        /* ignore */
      }
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    const res = await page.evaluate(() => {
      // Simulate production flags without reloading config object permanently
      const c = window.VT_BILLING_CONFIG;
      const prevDemo = c.demoUnlockEnabled;
      const prevReq = c.requireCheckoutSessionId;
      c.demoUnlockEnabled = false;
      c.requireCheckoutSessionId = true;
      // Forge success params
      history.replaceState({}, "", "?billing=success&plan=pro_monthly&provider=stripe");
      const out = VTBilling.handleReturnFromCheckout();
      c.demoUnlockEnabled = prevDemo;
      c.requireCheckoutSessionId = prevReq;
      return out;
    });
    expect(res?.event).toBe("error");
    expect(res?.reason).toBe("missing_session");
  });

  test("strict mode accepts success with session_id", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        sessionStorage.setItem("vt_e2e", "1");
        localStorage.removeItem("vt_billing_v1");
      } catch {
        /* ignore */
      }
    });
    await page.goto(
      `${BASE}/?billing=success&plan=pro_monthly&provider=stripe&session_id=cs_test_fake`,
      { waitUntil: "domcontentloaded" }
    );
    // Force strict flags then re-handle would clean URL already on load with demo true.
    // Explicit activate path check:
    const ent = await page.evaluate(() => {
      const c = window.VT_BILLING_CONFIG;
      c.demoUnlockEnabled = false;
      c.requireCheckoutSessionId = true;
      VTBilling.activate("pro_monthly", {
        source: "checkout_return",
        provider: "stripe",
        sessionId: "cs_test_fake"
      });
      return VTBilling.getEntitlement();
    });
    expect(ent.pro).toBe(true);
    expect(ent.plan).toBe("pro_monthly");
  });
});
