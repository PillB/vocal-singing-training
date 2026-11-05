/**
 * Red team r9 (trust): a signature check that throws rejects the token.
 *
 * GOAL (js/license.js signatureHolds, "Whether `signature` is the issuer's over `header.payload`"): any failure of the
 * check, including an exception, means the token is NOT accepted (the check fails closed). No test made the check
 * throw: with a well-formed key and a 64-byte signature ECDSA verify answers false and never throws, so
 * `catch { return false; }` -> `catch { return true; }` (fail open) left every license test green.
 *
 *   F1 the bytes to verify cannot be produced (TextEncoder throws in the page) -> a forged token must not be Pro
 *   F2 same, with a REAL token: a valid license is not honoured while its check cannot run (fail closed, not open)
 *   F3 control: the instrument. With TextEncoder wrapped but working, the forged token is still rejected, the real one
 *      is accepted, and the wrapper was reached (so F1/F2 fail because of the throw, not because of the stub's shape).
 *
 * Expected values are literals (Pro false/true), never read back from the code under test.
 * Drop into tests/ and run:  BASE_URL=http://127.0.0.1:<port> npx playwright test tests/trust-fail-closed.spec.js --project=chromium
 */
const { test, expect } = require("@playwright/test");
const { mintLicense, installLicense } = require("./helpers/billing");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "en");
      sessionStorage.setItem("vt_e2e", "1");
    } catch { /* ignore */ }
  });
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTBilling && !!window.VTLicense && !!window.VTApp && !!window.VTAccount);
  await page.waitForTimeout(400);
}
const run = (page, src) => page.evaluate(`(async () => { ${src} })()`); // sloppy mode, like the DevTools console

const FORGE = `
  const b = (o) => btoa(JSON.stringify(o)).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: "vocal-studio-entitlements", sub: "x", aud: location.origin, plan: "pro_yearly", status: "active", provider: "stripe", iat: now, exp: now + 31536000, periodEnd: now + 31536000 };
  const forged = b({ alg: "ES256" }) + "." + b(claims) + "." + "A".repeat(86);
`;

test("F1 a signature check that throws does not accept a forged token", async ({ page }) => {
  await boot(page);
  await run(page, FORGE + `
    window.TextEncoder = class { encode() { throw new Error("cannot encode"); } };
    await VTLicense.adopt(forged);`);
  expect(await page.evaluate(() => window.VTBilling.isPro()), "a forged token is Pro because its signature check threw").toBe(false);
});

test("F2 a signature check that throws does not honour even a real token (fail closed)", async ({ page }) => {
  const license = await mintLicense({ origin: BASE, plan: "pro_yearly" });
  await boot(page);
  await installLicense(page, license);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.VTLicense?.getStatus?.().state === "ok");
  const r = await page.evaluate(async (token) => {
    window.TextEncoder = class { encode() { throw new Error("cannot encode"); } };
    return !!(await VTLicense.verifyToken(token));
  }, license.token);
  expect(r, "a real token verified although the check could not run").toBe(false);
});

test("F3 control: with TextEncoder wrapped but working, the real token is accepted, the forged one is not, and the wrapper ran", async ({ page }) => {
  const license = await mintLicense({ origin: BASE, plan: "pro_yearly" });
  await boot(page);
  await installLicense(page, license);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.VTLicense?.getStatus?.().state === "ok");
  const r = await page.evaluate(async ({ token, forgeSrc }) => {
    const Real = window.TextEncoder;
    let used = 0;
    window.TextEncoder = class { constructor() { used++; this.e = new Real(); } encode(s) { return this.e.encode(s); } };
    const forged = new Function(forgeSrc + "; return forged;")();
    return { real: !!(await VTLicense.verifyToken(token)), forged: !!(await VTLicense.verifyToken(forged)), used: used >= 2 };
  }, { token: license.token, forgeSrc: FORGE });
  expect(r).toEqual({ real: true, forged: false, used: true });
});
