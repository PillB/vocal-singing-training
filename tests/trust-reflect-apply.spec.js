/**
 * Red team r9 (trust): the license check's Reflect.apply is captured at load, not looked up per call.
 *
 * GOAL (commit d59d574, js/license.js): a console line typed after the page has loaded cannot fake the signature
 * check or swap the public key. VERIFY and IMPORT_KEY are captured at load, and so is the primitive that invokes
 * them (APPLY = Reflect.apply), so none of the three can be reached by editing a global afterwards.
 * T5/T5b-d stub SubtleCrypto.prototype.{verify,importKey} and Function.prototype.call, but never Reflect.apply itself,
 * so `const APPLY = (f, t, a) => Reflect.apply(f, t, a)` (a per-call lookup) left every one of them green.
 *
 *   RA1 a stubbed Reflect.apply answers "valid" for the signature check     -> a forged token must not be Pro
 *   RA2 a stubbed Reflect.apply hands the page the attacker's public key    -> a token signed by the attacker must not be Pro
 *   RA3 control: the instrument. A pass-through Reflect.apply stub that counts calls is installed and the license
 *      check still verifies a REAL token (so the stub is live and the page works), and it was called 0 times by the
 *      page's license code (it is invoked through the copy taken at load).
 *
 * Expected values are literals (Pro is false, call count is 0), never read back from the code under test.
 * Drop into tests/ and run:  BASE_URL=http://127.0.0.1:<port> npx playwright test tests/trust-reflect-apply.spec.js --project=chromium
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
  const head = b({ alg: "ES256" }) + "." + b(claims);
`;
const ATTACKER = `
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(head)));
  const forged = head + "." + btoa(String.fromCharCode(...sig)).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
  const attackerJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
`;

test("RA1 stubbing Reflect.apply cannot fake the signature check", async ({ page }) => {
  await boot(page);
  await run(page, FORGE + `
    const verify = SubtleCrypto.prototype.verify, real = Reflect.apply;
    Reflect.apply = function (f, t, a) { return f === verify ? Promise.resolve(true) : real(f, t, a); };
    await VTLicense.adopt(head + "." + "A".repeat(86));`);
  expect(await page.evaluate(() => window.VTBilling.isPro()), "a forged signature passed with Reflect.apply stubbed").toBe(false);
});

test("RA2 stubbing Reflect.apply cannot make the page trust the attacker's key", async ({ page }) => {
  await boot(page);
  await run(page, FORGE + ATTACKER + `
    const importKey = SubtleCrypto.prototype.importKey, real = Reflect.apply;
    Reflect.apply = function (f, t, a) { return f === importKey ? real(f, t, [a[0], attackerJwk, ...a.slice(2)]) : real(f, t, a); };
    await VTLicense.adopt(forged);`);
  expect(await page.evaluate(() => window.VTBilling.isPro()), "the attacker's key was trusted with Reflect.apply stubbed").toBe(false);
});

test("RA3 control: a counting Reflect.apply stub is live, the real token still verifies, and the license code never calls it", async ({ page }) => {
  const license = await mintLicense({ origin: BASE, plan: "pro_yearly" });
  await boot(page);
  await installLicense(page, license);
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.VTLicense?.getStatus?.().state === "ok");
  const r = await page.evaluate(async (token) => {
    const real = Reflect.apply;
    let calls = 0;
    Reflect.apply = function (f, t, a) { calls++; return real(f, t, a); };
    const probe = Reflect.apply(Math.max, null, [1, 2]); // the stub is live: it counts this call
    const before = calls;
    const claims = await VTLicense.verifyToken(token);
    return { probe, probeCounted: before === 1, calls: calls - before, plan: claims && claims.plan };
  }, license.token);
  expect(r).toEqual({ probe: 2, probeCounted: true, calls: 0, plan: "pro_yearly" });
});
