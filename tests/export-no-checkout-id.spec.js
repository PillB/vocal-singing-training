/**
 * F8 (payments state-machine inventory, 2026-11-26): the progress export
 * carries no checkout id.
 *
 * The export is a file "to keep", which the app suggests handing to a
 * teacher. It used to write the whole entitlement, raw record and all, so it
 * carried the checkout id the purchase came back with. That id is a key: the
 * worker answers POST /v1/claim with a licence for it, to anyone, and links
 * it by POST /v1/me/link to whichever account sends it first (the payer is
 * then refused "already_linked"), and with it the Creem portal of the
 * subscription. So anybody holding the file could use the subscription, or
 * take it.
 *
 * Correct, pinned here:
 * - the exported entitlement names the plan and nothing that proves the
 *   purchase: {tier, plan, status, source, pro, provider, expiresAt}, so a
 *   fix that dropped the plan from the file fails too;
 * - a claimed receipt no longer keeps the id in storage;
 * - control: a checkout still waiting keeps its id in storage, which is what
 *   it retries with, and it stays out of the file all the same.
 *
 * Wrong behaviour each case fails on: the id anywhere in the file, the id
 * still in the stored receipt after the claim, or the waiting record losing
 * the id it needs.
 */
const { test, expect } = require("@playwright/test");
const { readFile } = require("fs/promises");
const { patchBillingConfig, mintLicense } = require("./helpers/billing");

test.use({ bypassCSP: true });

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const CHECKOUT = "ch_EXPORT_SECRET_f8";
const WAITING = "pre_WAITING_SECRET_f8";

async function boot(page, { license, seed }) {
  await page.addInitScript((records) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      sessionStorage.setItem("vt_e2e", "1");
      for (const [k, v] of Object.entries(records)) localStorage.setItem(k, v);
    } catch {
      /* ignore */
    }
  }, seed || {});
  await page.route("**/v1/**", (route) =>
    route.fulfill({ status: 404, contentType: "application/json", body: JSON.stringify({ ok: false, reason: "not_stubbed" }) })
  );
  await page.route("**/v1/claim", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ ok: true, licenseId: "lic_test_0001", token: license.token }) })
  );
  await patchBillingConfig(page, {
    verification: { apiBaseUrl: "https://entitlements.invalid", publicKeyJwk: license.publicKeyJwk, required: true, revalidateHours: 24 * 365 }
  });
}

/** Press the Pro dialog's export button and return the JSON file's text. */
async function exportedFile(page) {
  await page.click("#btn-pricing");
  const button = page.locator("#btn-export-progress");
  await expect(button, "the export is offered to someone on Pro").toBeVisible();
  const files = [];
  page.on("download", (d) => files.push(d));
  await button.click();
  await expect.poll(() => files.some((d) => d.suggestedFilename().endsWith(".json"))).toBe(true);
  const json = files.find((d) => d.suggestedFilename().endsWith(".json"));
  return readFile(await json.path(), "utf8");
}

test.describe("F8 the progress export is safe to hand on", () => {
  test("after a Creem purchase the file names the plan, and neither it nor the stored receipt keeps the checkout id", async ({ page }) => {
    const license = await mintLicense({ origin: BASE, provider: "creem" });
    await boot(page, { license });
    await page.goto(`${BASE}/index.html?billing=success&plan=pro_monthly&checkout_id=${CHECKOUT}`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.VTBilling?.isPro?.() === true, null, { timeout: 10000 });

    const text = await exportedFile(page);
    expect(text).not.toContain(CHECKOUT);
    const file = JSON.parse(text);
    expect(file.entitlement).toEqual({
      tier: "pro",
      plan: "pro_monthly",
      status: "active",
      source: "license",
      pro: true,
      provider: "creem",
      expiresAt: new Date(license.claims.periodEnd * 1000).toISOString()
    });
    // The rest of the file is still the learner's progress.
    expect(file.product).toBe("Vocal Studio Pro");
    expect(file).toHaveProperty("progress");

    const receipt = await page.evaluate(() => localStorage.getItem("vt_billing_v1") || "");
    expect(receipt, "the claim wrote its receipt").toContain("\"source\":\"license\"");
    expect(receipt).not.toContain(CHECKOUT);
  });

  test("control: a checkout still waiting keeps its id to retry with, and the file leaves it out all the same", async ({ page }) => {
    // Pro through the browser's trial, with a Mercado Pago checkout waiting
    // on its first charge (the worker answers its claim 202).
    const license = await mintLicense({ origin: BASE });
    await boot(page, {
      license,
      seed: {
        vt_billing_trial_started_v1: new Date().toISOString(),
        vt_billing_v1: JSON.stringify({ status: "pending", plan: "pro_monthly", provider: "mercadopago", source: "checkout_return", activatedAt: new Date().toISOString(), sessionId: WAITING, verified: false })
      }
    });
    await page.unroute("**/v1/claim");
    await page.route("**/v1/claim", (route) =>
      route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ ok: false, reason: "pending" }) })
    );
    await page.goto(`${BASE}/index.html`, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.VTBilling?.isPro?.() === true, null, { timeout: 10000 });

    const text = await exportedFile(page);
    expect(text).not.toContain(WAITING);
    expect(JSON.parse(text).entitlement).toMatchObject({ pro: true, plan: "trial", status: "trial" });
    expect(await page.evaluate(() => window.VTBilling.hasPendingClaim())).toBe(true);
    expect(await page.evaluate(() => localStorage.getItem("vt_billing_v1") || "")).toContain(WAITING);
  });
});
