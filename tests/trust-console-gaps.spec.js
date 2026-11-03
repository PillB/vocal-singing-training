/**
 * Trust-boundary gaps the QA-05 console freeze leaves (round 4, "trust").
 * Each test states the GOAL behaviour, the WRONG behaviour it must catch, and which build it was proven on:
 *   T1 trial mark dated 2999 grants Pro                     red on 13b53ea, green with a future-date clamp
 *   T2 a trial started now still grants 7 days of Pro       green everywhere (guards the clamp from over-reaching)
 *   T3 license public key is deep-frozen (depth >= 2)       green on 13b53ea, red on the "freeze depth 1 only" mutant
 *   T4 window.VTBilling / window.VTLicense cannot be swapped green on 13b53ea, red when the window binding is left writable
 *   T5 stubbing SubtleCrypto.verify from the console       red on 13b53ea, green when verify is captured at load
 *   T5b/c/d importKey swapped, Function.prototype.call stubbed  red when either intrinsic or the call primitive is read at call time
 *   T6 an unsigned /v1/me reply saying pro:true             red on 13b53ea, green when the plan chip/insights follow the signature
 * Expected values are literals (7 days, "free"), never read back from the code under test.
 * Run:  BASE_URL=http://127.0.0.1:<port> npx playwright test tests/trust-console-gaps.spec.js --project=chromium
 */
const { test, expect } = require("@playwright/test");
const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";
const WORKER = /vocal-studio-entitlements\.vocalstudio-pe\.workers\.dev/;

async function boot(page, { session = false } = {}) {
  await page.addInitScript((withSession) => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "en");
      sessionStorage.setItem("vt_e2e", "1");
      if (withSession && !localStorage.getItem("vt_account_session_v1")) {
        localStorage.setItem("vt_account_session_v1", JSON.stringify({ token: "t".repeat(40), expiresAt: Math.floor(Date.now() / 1000) + 86400 }));
      }
    } catch { /* ignore */ }
  }, session);
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/, (r) => r.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
  await page.goto(BASE + "/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => !!window.VTBilling && !!window.VTLicense && !!window.VTApp && !!window.VTAccount);
  await page.waitForTimeout(400);
}
const run = (page, src) => page.evaluate(`(async () => { ${src} })()`); // sloppy mode, like the DevTools console

test("T1 a trial mark dated far in the future does not grant Pro", async ({ page }) => {
  await boot(page);
  await run(page, `localStorage.setItem("vt_billing_trial_started_v1", "2999-01-01T00:00:00.000Z");`);
  const r = await page.evaluate(() => ({ pro: window.VTBilling.isPro(), days: window.VTBilling.trialDaysLeft() }));
  expect(r.pro, "a start date 970 years ahead is not a trial").toBe(false);
  expect(r.days).toBeLessThanOrEqual(7);
});

test("T2 control: a trial started now grants 7 days of Pro", async ({ page }) => {
  await boot(page);
  await run(page, `VTBilling.startTrial();`);
  const r = await page.evaluate(() => ({ pro: window.VTBilling.isPro(), days: window.VTBilling.trialDaysLeft() }));
  expect(r).toEqual({ pro: true, days: 7 });
});

test("T3 the license public key survives a console edit (freeze reaches depth 2)", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    const J = window.VT_BILLING_CONFIG.verification.publicKeyJwk;
    const before = J.x;
    try { J.x = "A".repeat(43); } catch { /* strict refusal is fine */ }
    return { before, after: window.VT_BILLING_CONFIG.verification.publicKeyJwk.x };
  });
  expect(r.after).toBe(r.before);
  expect(r.before).toBe("G-6nu_L_-Qpf9-0XD94mO9IAs57laAFWkb7kqYu43Hc"); // literal from js/billing-config.js, guards against a vacuous pass
});

test("T4 window.VTBilling and window.VTLicense cannot be replaced by another object", async ({ page }) => {
  await boot(page);
  const r = await page.evaluate(() => {
    window.VTBilling = { isPro: () => true, can: () => true, getEntitlement: () => ({ pro: true }) };
    window.VTLicense = Object.assign({}, window.VTLicense, { getClaims: () => ({ plan: "pro_yearly", status: "active", exp: Date.now() / 1000 + 9e6 }) });
    return { billingSwapped: window.VTBilling.isPro() === true && window.VTBilling.getEntitlement().source === undefined, licenseSwapped: !!window.VTLicense.getClaims() };
  });
  expect(r.billingSwapped, "VTBilling was swapped").toBe(false);
  expect(r.licenseSwapped, "VTLicense was swapped").toBe(false);
});

test("T5 stubbing the signature check from the console does not make a forged token Pro", async ({ page }) => {
  await boot(page);
  await run(page, `
    const b = (o) => btoa(JSON.stringify(o)).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
    const now = Math.floor(Date.now() / 1000);
    SubtleCrypto.prototype.verify = async () => true;
    await VTLicense.adopt(b({ alg: "ES256" }) + "." + b({ iss: "vocal-studio-entitlements", sub: "x", aud: location.origin, plan: "pro_yearly", status: "active", provider: "stripe", iat: now, exp: now + 31536000, periodEnd: now + 31536000 }) + "." + "A".repeat(86));`);
  expect(await page.evaluate(() => window.VTBilling.isPro())).toBe(false);
});

const FORGE = `
  const b = (o) => btoa(JSON.stringify(o)).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
  const now = Math.floor(Date.now() / 1000);
  const claims = { iss: "vocal-studio-entitlements", sub: "x", aud: location.origin, plan: "pro_yearly", status: "active", provider: "stripe", iat: now, exp: now + 31536000, periodEnd: now + 31536000 };
  const head = b({ alg: "ES256" }) + "." + b(claims);
`;
// A token signed with the attacker's own key, and the attacker's public half in JWK form
const ATTACKER = `
  const pair = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const sig = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, pair.privateKey, new TextEncoder().encode(head)));
  const forged = head + "." + btoa(String.fromCharCode(...sig)).replace(/\\+/g, "-").replace(/\\//g, "_").replace(/=+$/, "");
  const attackerJwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
`;

test("T5b swapping importKey from the console cannot make the page trust the attacker's key", async ({ page }) => {
  await boot(page);
  await run(page, FORGE + ATTACKER + `
    const real = SubtleCrypto.prototype.importKey;
    SubtleCrypto.prototype.importKey = function (fmt, jwk, ...rest) { return real.call(this, fmt, attackerJwk, ...rest); };
    await VTLicense.adopt(forged);`);
  expect(await page.evaluate(() => window.VTBilling.isPro()), "a token signed by the attacker's key was accepted").toBe(false);
});

test("T5c stubbing Function.prototype.call cannot fake the signature check", async ({ page }) => {
  await boot(page);
  await run(page, FORGE + `
    const verify = SubtleCrypto.prototype.verify, call = Function.prototype.call;
    Function.prototype.call = function (target, ...args) { return this === verify ? Promise.resolve(true) : Reflect.apply(call, this, [target, ...args]); };
    await VTLicense.adopt(head + "." + "A".repeat(86));`);
  expect(await page.evaluate(() => window.VTBilling.isPro()), "a forged signature passed with Function.prototype.call stubbed").toBe(false);
});

test("T5d stubbing Function.prototype.call cannot swap the public key", async ({ page }) => {
  await boot(page);
  await run(page, FORGE + ATTACKER + `
    const importKey = SubtleCrypto.prototype.importKey, call = Function.prototype.call;
    Function.prototype.call = function (target, fmt, jwk, ...rest) { return this === importKey ? Reflect.apply(call, this, [target, fmt, attackerJwk, ...rest]) : Reflect.apply(call, this, [target, fmt, jwk, ...rest]); };
    await VTLicense.adopt(forged);`);
  expect(await page.evaluate(() => window.VTBilling.isPro()), "the attacker's key was trusted with Function.prototype.call stubbed").toBe(false);
});

test("T6 a worker reply that says pro:true without a signed token leaves the Pro surfaces locked", async ({ page }) => {
  await boot(page, { session: true });
  const me = { ok: true, account: { email: "a@example.test", role: "member" }, entitlement: { pro: true, plan: "pro_yearly", status: "active", source: "paid", periodEnd: Math.floor(Date.now() / 1000) + 2592000 }, grants: [], paid: true, licenseId: null, token: null };
  await run(page, `window.fetch = async () => ({ ok: true, status: 200, json: async () => (${JSON.stringify(me)}) }); await VTAccount.refresh();`);
  await page.waitForTimeout(400);
  const r = await page.evaluate(() => ({ chip: document.querySelector("#btn-pricing")?.dataset.plan, lockHidden: document.querySelector("#pro-insights-lock")?.hidden, signed: window.VTAccount.getState().pro }));
  expect(r.signed).toBe(false);
  expect(r.chip, "header says Pro without a verified license").toBe("free");
  expect(r.lockHidden, "insights lock opened without a verified license").toBe(false);
});
