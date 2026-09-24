/**
 * Subscription / billing regression — rails, entitlement, pricing overlay.
 *
 * The shipped build unlocks Pro only for a license signed by the entitlements
 * worker, so anything that needs Pro here either mints a real signed token or
 * switches on the QA unlock explicitly (tests/helpers/billing.js).
 */
const { test, expect } = require("@playwright/test");
const {
  mintLicense,
  tamperToken,
  patchBillingConfig,
  enableQaPro,
  installLicense,
  waitForLicenseState
} = require("./helpers/billing");

const BASE = process.env.BASE_URL || "http://127.0.0.1:8765";

async function boot(page) {
  await page.addInitScript(() => {
    try {
      localStorage.setItem("vt_tour_v1", "1");
      localStorage.setItem("vt_lang", "es");
      sessionStorage.setItem("vt_e2e", "1");
      localStorage.removeItem("vt_billing_v1");
      localStorage.removeItem("vt_billing_trial_started_v1");
      localStorage.removeItem("vt_license_v1");
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
        hasLicense: !!window.VTLicense,
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
    expect(info.hasLicense).toBe(true);
    expect(info.plans).toEqual(expect.arrayContaining(["free", "pro_monthly", "pro_yearly"]));
    expect(info.markets).toEqual(expect.arrayContaining(["PE", "US", "ES", "GB", "MX", "DE", "BR"]));
    expect(info.hasStripe).toBe(true);
    expect(info.hasMp).toBe(true);
    expect(info.pe?.rail).toBe("mercadopago");
    expect(info.us?.rail).toBe("stripe");
  });

  test("shipped config hands out nothing for free", async ({ page }) => {
    await boot(page);
    const r = await page.evaluate(() => {
      const c = window.VT_BILLING_CONFIG;
      const e = VTBilling.getEntitlement();
      return {
        demoUnlockEnabled: c.demoUnlockEnabled,
        verificationRequired: VTBilling.verificationRequired(),
        verificationConfigured: VTBilling.verificationConfigured(),
        trialRequiresOptIn: c.trialRequiresOptIn,
        trialStarted: VTBilling.trialStartedAt(),
        canStartTrial: VTBilling.canStartTrial(),
        pro: e.pro,
        status: e.status,
        canExport: VTBilling.can("export_progress"),
        demoNoop: VTBilling.activateDemo("pro_monthly")
      };
    });
    expect(r.demoUnlockEnabled).toBe(false);
    expect(r.verificationRequired).toBe(true);
    // The worker is deployed and its public key is in the config, so a license
    // CAN now be verified. That is the stricter state, not a looser one: what
    // keeps this build from handing anything out is everything below.
    expect(r.verificationConfigured).toBe(true);
    expect(r.trialRequiresOptIn).toBe(true);
    // No trial clock starts on its own — a fresh browser is plain free.
    expect(r.trialStarted).toBeFalsy();
    expect(r.canStartTrial).toBe(true);
    expect(r.pro).toBe(false);
    expect(r.status).toBe("free");
    expect(r.canExport).toBe(false);
    expect(r.demoNoop).toBeNull();
  });

  test("forged localStorage entitlement does not grant Pro", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        sessionStorage.setItem("vt_e2e", "1");
        localStorage.removeItem("vt_billing_trial_started_v1");
        localStorage.setItem(
          "vt_billing_v1",
          JSON.stringify({
            status: "active",
            plan: "pro_yearly",
            provider: "stripe",
            source: "paid",
            verified: true,
            activatedAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 365 * 86400000).toISOString()
          })
        );
        // A forged license token is not signed by the configured key either.
        localStorage.setItem(
          "vt_license_v1",
          JSON.stringify({ licenseId: "lic_forged", token: "aaa.bbb.ccc" })
        );
      } catch {
        /* ignore */
      }
    });
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    const r = await page.evaluate(() => {
      const e = VTBilling.getEntitlement();
      return { pro: e.pro, status: e.status, canExport: VTBilling.can("export_progress") };
    });
    expect(r.pro).toBe(false);
    expect(["unverified", "pending"]).toContain(r.status);
    expect(r.canExport).toBe(false);
    await expect(page.locator("#btn-export-progress")).toBeHidden();
  });

  test("worker-signed license unlocks Pro and survives reload", async ({ page }) => {
    const license = await mintLicense({ origin: BASE, plan: "pro_yearly" });
    await boot(page);
    await installLicense(page, license);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForLicenseState(page, "ok");
    const r = await page.evaluate(() => {
      const e = VTBilling.getEntitlement();
      return {
        pro: e.pro,
        plan: e.plan,
        source: e.source,
        verified: e.verified,
        canExport: VTBilling.can("export_progress")
      };
    });
    expect(r.pro).toBe(true);
    expect(r.plan).toBe("pro_yearly");
    expect(r.source).toBe("license");
    expect(r.verified).toBe(true);
    expect(r.canExport).toBe(true);
    await expect(page.locator("#billing-pill")).toContainText(/Pro/i);

    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForLicenseState(page, "ok");
    expect(await page.evaluate(() => VTBilling.isPro())).toBe(true);
  });

  test("tampered, expired and wrong-audience licenses are rejected", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await boot(page);
    await installLicense(page, license);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForLicenseState(page, "ok");

    const results = await page.evaluate(
      async ({ tampered, expired, wrongAud, other }) => {
        const check = async (token) => !!(await VTLicense.verifyToken(token));
        return {
          tampered: await check(tampered),
          expired: await check(expired),
          wrongAud: await check(wrongAud),
          otherKey: await check(other),
          garbage: await check("not-a-token")
        };
      },
      {
        tampered: tamperToken(license.token, { plan: "pro_yearly" }),
        // Same trusted key, but the claims themselves must still hold up.
        expired: await license.sign({
          ...license.claims,
          iat: license.claims.iat - 100000,
          exp: license.claims.iat - 90000
        }),
        wrongAud: await license.sign({ ...license.claims, aud: "https://evil.example" }),
        other: (await mintLicense({ origin: BASE })).token
      }
    );
    expect(results.tampered).toBe(false);
    expect(results.expired).toBe(false);
    expect(results.wrongAud).toBe(false);
    // Signed by a different keypair than the one this page trusts.
    expect(results.otherKey).toBe(false);
    expect(results.garbage).toBe(false);
  });

  test("a token minted by the worker verifies in the browser", async ({ page }) => {
    // Pins the wire format across the seam: the worker's own signer against the
    // browser's own verifier, no test-only encoding in between.
    const { webcrypto } = require("crypto");
    const importEsm = new Function("p", "return import(p)");
    const { createLicenseToken } = await importEsm(
      require("url").pathToFileURL(
        require("path").join(__dirname, "../workers/entitlements/src/license.js")
      ).href
    );
    const pair = await webcrypto.subtle.generateKey(
      { name: "ECDSA", namedCurve: "P-256" },
      true,
      ["sign", "verify"]
    );
    const privateKeyPkcs8B64 = Buffer.from(
      new Uint8Array(await webcrypto.subtle.exportKey("pkcs8", pair.privateKey))
    ).toString("base64");
    const publicKeyJwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
    delete publicKeyJwk.ext;
    delete publicKeyJwk.key_ops;

    const { token } = await createLicenseToken(
      {
        licenseId: "lic_cross_seam_0001",
        plan: "pro_monthly",
        status: "active",
        provider: "stripe",
        periodEnd: Math.floor(Date.now() / 1000) + 30 * 86400
      },
      {
        LICENSE_PRIVATE_KEY_PKCS8_B64: privateKeyPkcs8B64,
        SITE_ORIGIN: BASE,
        LICENSE_KEY_ID: "k1",
        LICENSE_TTL_SECONDS: "259200"
      }
    );

    await boot(page);
    await installLicense(page, { token, publicKeyJwk, licenseId: "lic_cross_seam_0001" });
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForLicenseState(page, "ok");
    const r = await page.evaluate(() => {
      const e = VTBilling.getEntitlement();
      return { pro: e.pro, plan: e.plan, source: e.source };
    });
    expect(r.pro).toBe(true);
    expect(r.plan).toBe("pro_monthly");
    expect(r.source).toBe("license");
  });

  test("a cancelled subscription keeps the period it paid for", async ({ page }) => {
    // The worker signs "canceled" with exp capped at the period end; access
    // should run out with the token, not the moment someone cancels.
    const license = await mintLicense({ origin: BASE, status: "canceled" });
    await boot(page);
    await installLicense(page, license);
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitForLicenseState(page, "ok");
    const r = await page.evaluate(() => {
      const e = VTBilling.getEntitlement();
      return { pro: e.pro, licenseStatus: e.licenseStatus };
    });
    expect(r.pro).toBe(true);
    expect(r.licenseStatus).toBe("canceled");
  });

  test("a revoked license is dropped on refresh", async ({ page }) => {
    // Minted a minute ago so the staleness window below has already passed.
    const license = await mintLicense({ origin: BASE, iatOffsetSeconds: -60 });
    await boot(page);
    await page.route("**/v1/license", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, reason: "inactive" })
      })
    );
    // revalidateHours ~0 makes the stored token stale immediately, so boot
    // re-checks it with the worker.
    await installLicense(page, { ...license, revalidateHours: 0.0001 });
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.VTLicense?.getStatus?.().hasToken === false, null, {
      timeout: 5000
    });
    const r = await page.evaluate(() => ({
      pro: VTBilling.isPro(),
      canExport: VTBilling.can("export_progress")
    }));
    expect(r.pro).toBe(false);
    expect(r.canExport).toBe(false);
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

  test("demo unlock button is hidden in a public build", async ({ page }) => {
    await boot(page);
    await page.click("#btn-pricing");
    await expect(page.locator("#btn-demo-pro")).toBeHidden();
  });

  test("QA builds can still demo-unlock Pro", async ({ page }) => {
    await enableQaPro(page);
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

  test("free trial is opt-in", async ({ page }) => {
    await boot(page);
    const before = await page.evaluate(() => VTBilling.getEntitlement());
    expect(before.pro).toBe(false);
    expect(before.status).toBe("free");

    await page.click("#btn-pricing");
    await expect(page.locator("#btn-start-trial")).toBeVisible();
    await page.click("#btn-start-trial");

    // The click asks the worker which trial this is before starting one, so the
    // entitlement lands a moment after the press rather than during it.
    await expect
      .poll(() => page.evaluate(() => VTBilling.getEntitlement().pro))
      .toBe(true);
    const after = await page.evaluate(() => ({
      ent: VTBilling.getEntitlement(),
      daysLeft: VTBilling.trialDaysLeft(),
      canStartAgain: VTBilling.canStartTrial()
    }));
    expect(after.ent.pro).toBe(true);
    expect(after.ent.status).toBe("trial");
    expect(after.daysLeft).toBeGreaterThan(0);
    expect(after.canStartAgain).toBe(false);
    await expect(page.locator("#btn-start-trial")).toBeHidden();
  });

  test("a stranded checkout claim is resumed on the next visit", async ({ page }) => {
    // The webhook can land after the return page has given up. The pending
    // record, not the (already cleaned) URL, is what we retry from.
    const license = await mintLicense({ origin: BASE });
    await boot(page);
    await patchBillingConfig(page, {
      verification: {
        apiBaseUrl: "https://entitlements.invalid",
        publicKeyJwk: license.publicKeyJwk,
        required: true,
        revalidateHours: 24 * 365
      }
    });
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          "vt_billing_v1",
          JSON.stringify({
            status: "pending",
            plan: "pro_monthly",
            provider: "stripe",
            source: "checkout_return",
            activatedAt: new Date().toISOString(),
            sessionId: "cs_test_stranded",
            verified: false
          })
        );
      } catch {
        /* ignore */
      }
    });
    let claimed = 0;
    await page.route("**/v1/claim", (route) => {
      claimed += 1;
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ ok: true, licenseId: "lic_test_0001", token: license.token })
      });
    });

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => window.VTBilling?.isPro?.() === true, null, { timeout: 8000 });
    expect(claimed).toBeGreaterThan(0);
    const ent = await page.evaluate(() => VTBilling.getEntitlement());
    expect(ent.pro).toBe(true);
    expect(ent.source).toBe("license");
  });

  test("a checkout that never confirms stops retrying and says so", async ({ page }) => {
    await boot(page);
    await patchBillingConfig(page, {
      verification: {
        apiBaseUrl: "https://entitlements.invalid",
        publicKeyJwk: { kty: "EC", crv: "P-256", x: "AA", y: "AA" },
        required: true
      }
    });
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          "vt_billing_v1",
          JSON.stringify({
            status: "pending",
            plan: "pro_monthly",
            provider: "stripe",
            source: "checkout_return",
            // Older than the retry window
            activatedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
            sessionId: "cs_test_ancient",
            verified: false
          })
        );
      } catch {
        /* ignore */
      }
    });
    let claimed = 0;
    await page.route("**/v1/claim", (route) => {
      claimed += 1;
      route.fulfill({ status: 202, contentType: "application/json", body: "{}" });
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    const ent = await page.evaluate(() => VTBilling.getEntitlement());
    expect(claimed).toBe(0);
    expect(ent.pro).toBe(false);
    expect(ent.status).toBe("unverified");

    // ...but the customer can still force a re-check from the pricing modal.
    await page.click("#btn-pricing");
    await expect(page.locator("#btn-recheck-payment")).toBeVisible();
    await page.click("#btn-recheck-payment");
    await expect.poll(() => claimed, { timeout: 8000 }).toBeGreaterThan(0);
  });

  test("a payment the provider rejects stops being retried", async ({ page }) => {
    const license = await mintLicense({ origin: BASE });
    await boot(page);
    await patchBillingConfig(page, {
      verification: {
        apiBaseUrl: "https://entitlements.invalid",
        publicKeyJwk: license.publicKeyJwk,
        required: true
      }
    });
    await page.addInitScript(() => {
      try {
        localStorage.setItem(
          "vt_billing_v1",
          JSON.stringify({
            status: "pending",
            plan: "pro_monthly",
            provider: "stripe",
            source: "checkout_return",
            activatedAt: new Date().toISOString(),
            sessionId: "cs_test_failed_payment",
            verified: false
          })
        );
      } catch {
        /* ignore */
      }
    });
    // What the worker answers once an async payment has failed.
    await page.route("**/v1/claim", (route) =>
      route.fulfill({
        status: 403,
        contentType: "application/json",
        body: JSON.stringify({ ok: false, reason: "inactive" })
      })
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => VTBilling.getEntitlement().status === "unverified",
      null,
      { timeout: 8000 }
    );
    const r = await page.evaluate(() => ({
      ent: VTBilling.getEntitlement(),
      stored: JSON.parse(localStorage.getItem("vt_billing_v1") || "null")
    }));
    expect(r.ent.pro).toBe(false);
    expect(r.stored.status).toBe("unclaimed");
  });

  test("checkout return waits for the worker instead of granting Pro", async ({ page }) => {
    await page.addInitScript(() => {
      try {
        localStorage.setItem("vt_tour_v1", "1");
        sessionStorage.setItem("vt_e2e", "1");
        localStorage.removeItem("vt_billing_v1");
        localStorage.removeItem("vt_billing_trial_started_v1");
      } catch {
        /* ignore */
      }
    });
    await page.goto(
      `${BASE}/?billing=success&plan=pro_yearly&provider=stripe&session_id=cs_test_fake`,
      { waitUntil: "domcontentloaded" }
    );
    const ent = await page.evaluate(() => VTBilling.getEntitlement());
    expect(ent.pro).toBe(false);
    expect(["pending", "unverified"]).toContain(ent.status);
    // URL cleaned either way
    expect(page.url()).not.toContain("billing=success");
  });

  test("operators can opt out of verification for a soft (forgeable) return", async ({ page }) => {
    await patchBillingConfig(page, { verification: { required: false } });
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
      `${BASE}/?billing=success&plan=pro_yearly&provider=stripe&session_id=cs_test_fake`,
      { waitUntil: "domcontentloaded" }
    );
    const ent = await page.evaluate(() => VTBilling.getEntitlement());
    expect(ent.pro).toBe(true);
    expect(ent.plan).toBe("pro_yearly");
    expect(ent.verified).toBe(false);
  });

  test("checkout is held closed while entitlements cannot be verified", async ({ page }) => {
    await patchBillingConfig(page, {
      // Explicitly unwired: the shipped config points at the deployed worker,
      // so without this the case would silently become "links and a worker",
      // and the redirect it forbids would actually happen.
      verification: { apiBaseUrl: "", publicKeyJwk: null, required: true },
      providers: {
        stripe: {
          id: "stripe",
          label: "Stripe Checkout",
          labelEs: "Stripe",
          regions: ["US"],
          links: { pro_monthly: "https://buy.stripe.com/test_live_link", pro_yearly: "" }
        },
        mercadopago: {
          id: "mercadopago",
          label: "Mercado Pago",
          labelEs: "Mercado Pago",
          regions: ["PE"],
          links: { pro_monthly: "", pro_yearly: "" }
        }
      }
    });
    await boot(page);
    const r = await page.evaluate(() => {
      const res = VTBilling.startCheckout("pro_monthly", "stripe");
      const h = VTBilling.getBillingHealth();
      return { res, health: h, url: location.href, pro: VTBilling.isPro() };
    });
    expect(r.res.ok).toBe(false);
    expect(r.res.mode).toBe("verification_unavailable");
    expect(r.health.links).toBe(true);
    expect(r.health.verificationConfigured).toBe(false);
    expect(r.health.ok).toBe(false);
    expect(r.pro).toBe(false);
    // No redirect to the payment link happened
    expect(r.url).not.toContain("buy.stripe.com");
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

  test("entitlement status is always one of the known states", async ({ page }) => {
    await boot(page);
    const e = await page.evaluate(() => VTBilling.getEntitlement());
    expect(["free", "trial", "active", "expired", "pending", "unverified"]).toContain(e.status);
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
    // The worker is wired up; the checkout links are not, and that alone is
    // enough to keep this from being production-ok.
    expect(r.links).toBe(false);
    expect(r.h.ok).toBe(false);
    expect(r.h.productionReady).toBe(false);
    expect(r.h.portalConfigured).toBe(false);
    expect(r.h.demoUnlock).toBe(false);
    expect(r.h.verificationRequired).toBe(true);
    expect(r.h.verificationConfigured).toBe(true);
    expect(r.bad.ok).toBe(false);
    expect(r.good.ok).toBe(true);
    expect(r.http.ok).toBe(false);
  });

  test("ad_free feature maps to Pro only", async ({ page }) => {
    await enableQaPro(page);
    await boot(page);
    const free = await page.evaluate(() => {
      try {
        localStorage.removeItem("vt_billing_v1");
        localStorage.removeItem("vt_billing_trial_started_v1");
        window.VT_BILLING_CONFIG.freeTrialDays = 0;
      } catch {
        /* ignore */
      }
      return {
        adFree: VTBilling.can("ad_free"),
        export: VTBilling.can("export_progress"),
        pro: VTBilling.isPro()
      };
    });
    expect(free.pro).toBe(false);
    expect(free.adFree).toBe(false);
    expect(free.export).toBe(false);

    const pro = await page.evaluate(() => {
      VTBilling.activateDemo("pro_monthly");
      return {
        adFree: VTBilling.can("ad_free"),
        export: VTBilling.can("export_progress"),
        pro: VTBilling.isPro()
      };
    });
    expect(pro.pro).toBe(true);
    expect(pro.adFree).toBe(true);
    expect(pro.export).toBe(true);
  });

  test("customer portal URL validation and manage-billing UI", async ({ page }) => {
    await enableQaPro(page);
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

  test("success return without session_id is rejected", async ({ page }) => {
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
      history.replaceState({}, "", "?billing=success&plan=pro_monthly&provider=stripe");
      return VTBilling.handleReturnFromCheckout();
    });
    expect(res?.event).toBe("error");
    expect(res?.reason).toBe("missing_session");
    expect(await page.evaluate(() => VTBilling.isPro())).toBe(false);
  });

  test("local activate() alone never grants Pro", async ({ page }) => {
    await boot(page);
    const ent = await page.evaluate(() => {
      VTBilling.activate("pro_monthly", {
        source: "checkout_return",
        provider: "stripe",
        sessionId: "cs_test_fake",
        verified: true
      });
      return VTBilling.getEntitlement();
    });
    expect(ent.pro).toBe(false);
    expect(["unverified", "pending"]).toContain(ent.status);
  });

  // The shipped badge said "Save 20%" while the prices gave 34%, and nothing
  // caught it because the number was a translation string. It is derived now,
  // and this is what stops it being written down again.
  test("the annual badge states the saving the prices actually give", async ({ page }) => {
    await boot(page);
    const math = await page.evaluate(() => {
      const plans = window.VT_BILLING_CONFIG.plans || [];
      const monthly = plans.find((p) => p.interval === "month");
      const yearly = plans.find((p) => p.interval === "year");
      return {
        badgeKey: yearly.badge,
        shown: window.VTBilling.annualSavingPct(plans),
        usd: window.VTBilling.annualSavingPct(plans, "US"),
        usdExpected: Math.round((1 - yearly.priceUsd / (monthly.priceUsd * 12)) * 100),
        pen: window.VTBilling.annualSavingPct(plans, "PE"),
        penExpected: Math.round((1 - yearly.pricePen / (monthly.pricePen * 12)) * 100)
      };
    });
    expect(math.badgeKey).toBe("saveAnnual");
    expect(math.usd).toBe(math.usdExpected);
    expect(math.pen).toBe(math.penExpected);
    expect(math.shown).toBeGreaterThan(0);

    await page.click("#btn-pricing");
    await expect(page.locator("#pricing-modal")).toBeVisible();
    const badge = page.locator('.plan-card[data-plan="pro_yearly"] .plan-badge');
    await expect(badge).toBeVisible();
    expect(await badge.innerText()).toMatch(new RegExp(`\\b${math.shown}\\s*%`));
  });

  // A price of 19.90 interpolated straight into a template prints "S/ 19.9",
  // which reads as a typo on the one screen that asks somebody to pay.
  test("prices with centimos keep both decimals", async ({ page }) => {
    await boot(page);
    const out = await page.evaluate(() => {
      const f = (pen, usd) =>
        window.VTBilling.formatPrice({ pricePen: pen, priceUsd: usd, priceEur: usd }, "PE").text;
      return {
        centimos: f(19.9, 6.99),
        whole: f(169, 59),
        real: window.VTBilling.formatPrice(
          (window.VT_BILLING_CONFIG.plans || []).find((p) => p.interval === "month"),
          "PE"
        ).text
      };
    });
    expect(out.centimos).toBe("S/ 19.90");
    expect(out.whole).toBe("S/ 169");
    expect(out.real).not.toMatch(/\.\d$/);
  });

  // Two prices for the same plan can drift apart silently. They are one
  // product, so the discount a Peruvian is offered and the one an American is
  // offered should not differ by more than rounding.
  test("the yearly discount is the same offer in soles as in dollars", async ({ page }) => {
    await boot(page);
    const { usd, pen } = await page.evaluate(() => {
      const plans = window.VT_BILLING_CONFIG.plans || [];
      return {
        usd: window.VTBilling.annualSavingPct(plans, "US"),
        pen: window.VTBilling.annualSavingPct(plans, "PE")
      };
    });
    expect(Math.abs(usd - pen)).toBeLessThanOrEqual(2);
  });
});
