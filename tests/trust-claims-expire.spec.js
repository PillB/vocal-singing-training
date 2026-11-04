/**
 * Red team r9 (trust): a verified license stops being Pro when its token runs out, without a reload.
 *
 * GOAL (js/license.js getClaims, "Verified claims, or null. Synchronous: reflects the last completed check"; tokens
 * "expire (72h by default)"): a token verified at boot is honoured only until `exp` plus the 300 s clock skew. A tab
 * left open past that moment must stop granting Pro by itself. No test moved the clock after verification (they all
 * check expiry in verifyToken at load), so removing the expiry test in getClaims left every license test green.
 *
 *   E1 one second inside the skew the license still counts (control: the boundary is exact, not "expires at exp")
 *   E2 one second past exp + 300 s it no longer does, with no reload and no refresh
 *   E3 control: the instrument. The same page, clock untouched, is Pro (so E2 fails for the clock, not for the setup)
 *
 * Expected values come from the minted token's own exp (written by the test helper) and the 300 s skew in the goal.
 * Drop into tests/ and run:  BASE_URL=http://127.0.0.1:<port> npx playwright test tests/trust-claims-expire.spec.js --project=chromium
 */
const { test, expect } = require("@playwright/test");
const { mintLicense, installLicense } = require("./helpers/billing");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const SKEW_S = 300;

async function bootWithLicense(page, ttlSeconds) {
  const license = await mintLicense({ origin: BASE, plan: "pro_yearly", ttlSeconds });
  await page.clock.install({ time: Date.now() });
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "en");
      sessionStorage.setItem("vt_e2e", "1");
    } catch { /* ignore */ }
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await installLicense(page, license);
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.VTLicense?.getStatus?.().state === "ok");
  return license;
}
const proAt = async (page, epochS) => {
  await page.clock.setSystemTime(epochS * 1000);
  return page.evaluate(() => ({ claims: !!window.VTLicense.getClaims(), pro: !!window.VTBilling.isPro() }));
};

test("E3 control: a verified license is Pro while its token is valid", async ({ page }) => {
  await bootWithLicense(page, 600);
  expect(await page.evaluate(() => ({ claims: !!window.VTLicense.getClaims(), pro: !!window.VTBilling.isPro() }))).toEqual({ claims: true, pro: true });
});

test("E1 one second inside exp + 300 s the license still counts", async ({ page }) => {
  const license = await bootWithLicense(page, 600);
  expect(await proAt(page, license.claims.exp + SKEW_S - 1)).toEqual({ claims: true, pro: true });
});

test("E2 one second past exp + 300 s the license no longer counts, without a reload", async ({ page }) => {
  const license = await bootWithLicense(page, 600);
  expect(await proAt(page, license.claims.exp + SKEW_S + 1), "an expired token still grants Pro in an open tab").toEqual({ claims: false, pro: false });
});
