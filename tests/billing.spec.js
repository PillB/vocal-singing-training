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
});
