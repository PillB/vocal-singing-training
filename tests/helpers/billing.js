/**
 * Billing/entitlement helpers for Playwright.
 *
 * The shipped build grants Pro only for a license token signed by the
 * entitlements worker, so tests either mint a real token with a throwaway
 * keypair (mintLicense + installLicense) or turn the QA unlock on for the page
 * (enableQaPro). Neither needs a switch in the production code.
 */
const { webcrypto } = require("crypto");

const ISSUER = "vocal-studio-entitlements";

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/**
 * Mint an ES256 license token with a fresh keypair.
 *
 * `provider` is the payment rail the worker recorded, and it is what
 * getEntitlement() reports as `.provider`. It used to be hard-coded to
 * "stripe", which is the one rail a Peru-registered seller cannot use
 * (VG-19), so any test about per-rail behaviour was testing the one case
 * that will never happen. Default kept for the callers that do not care.
 *
 * @param {{origin: string, plan?: string, status?: string, ttlSeconds?: number,
 *          iatOffsetSeconds?: number, audience?: string, provider?: string}} opts
 * @returns {Promise<{token: string, publicKeyJwk: object, claims: object,
 *                    sign: (claims: object) => Promise<string>}>}
 */
async function mintLicense(opts) {
  const {
    origin,
    plan = "pro_monthly",
    status = "active",
    ttlSeconds = 72 * 3600,
    iatOffsetSeconds = 0,
    audience,
    provider = "stripe"
  } = opts || {};
  const pair = await webcrypto.subtle.generateKey(
    { name: "ECDSA", namedCurve: "P-256" },
    true,
    ["sign", "verify"]
  );
  const publicKeyJwk = await webcrypto.subtle.exportKey("jwk", pair.publicKey);
  delete publicKeyJwk.ext;
  delete publicKeyJwk.key_ops;

  const iat = Math.floor(Date.now() / 1000) + iatOffsetSeconds;
  const claims = {
    iss: ISSUER,
    sub: "lic_test_0001",
    aud: audience || origin,
    plan,
    status,
    provider,
    iat,
    exp: iat + ttlSeconds,
    periodEnd: iat + 30 * 86400
  };

  const sign = async (payload) => {
    const header = b64url(JSON.stringify({ alg: "ES256", typ: "VSL", kid: "test" }));
    const body = b64url(JSON.stringify(payload));
    const sig = await webcrypto.subtle.sign(
      { name: "ECDSA", hash: "SHA-256" },
      pair.privateKey,
      Buffer.from(`${header}.${body}`)
    );
    return `${header}.${body}.${b64url(new Uint8Array(sig))}`;
  };

  return { token: await sign(claims), publicKeyJwk, claims, sign };
}

/** Swap a token's payload while keeping its original signature. */
function tamperToken(token, patch) {
  const [header, body, sig] = token.split(".");
  const claims = JSON.parse(
    Buffer.from(body.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8")
  );
  return `${header}.${b64url(JSON.stringify({ ...claims, ...patch }))}.${sig}`;
}

/**
 * Patch VT_BILLING_CONFIG as it is defined by billing-config.js, before any
 * other script reads it. Survives reloads because it is an init script. The
 * page freezes its config once assigned (QA-05), so this is the only way a
 * test changes it; patches compose (enableQaPro plus a trial patch both hold).
 *
 * Two keys reach inside without replacing what they do not name, because
 * replacing `providers` or `markets` wholesale drops the rails and markets a
 * test did not mean to touch (Creem, most of all):
 * - `links: { rail: { plan: url } }` sets checkout links on rails that exist;
 * - `extraMarkets: [market]` appends markets to the shipped list.
 * @param {import('@playwright/test').Page} page
 * @param {object} patch shallow merge, `verification` merged one level deeper,
 *   `links` and `extraMarkets` as above
 */
async function patchBillingConfig(page, patch) {
  await page.addInitScript((p) => {
    let held;
    const earlier = Object.getOwnPropertyDescriptor(window, "VT_BILLING_CONFIG");
    Object.defineProperty(window, "VT_BILLING_CONFIG", {
      configurable: true,
      get: () => held,
      set: (value) => {
        if (earlier && earlier.set) earlier.set(value);
        held = value;
        if (!value) return;
        const { verification, links, extraMarkets, ...rest } = p || {};
        Object.assign(value, rest);
        if (verification) {
          value.verification = Object.assign({}, value.verification, verification);
        }
        for (const [rail, byPlan] of Object.entries(links || {})) {
          const provider = value.providers && value.providers[rail];
          // Loud, not skipped: a link for a rail the config does not have
          // (a typo, a renamed rail) used to vanish, and the test that set it
          // went on checking nothing. Thrown here, the page's config never
          // loads and every assertion after it fails.
          if (!provider) throw new Error(`patchBillingConfig: no rail "${rail}" in VT_BILLING_CONFIG.providers`);
          provider.links = Object.assign({}, provider.links, byPlan);
        }
        if (extraMarkets) value.markets = (value.markets || []).concat(extraMarkets);
      }
    });
  }, patch);
}

/** Turn the QA unlock on for this page (what demoUnlockEnabled:true builds do). */
async function enableQaPro(page) {
  await patchBillingConfig(page, { demoUnlockEnabled: true });
}

/**
 * Install a signed license so the page boots as verified Pro.
 * @param {import('@playwright/test').Page} page
 * @param {{token: string, publicKeyJwk: object, apiBaseUrl?: string, licenseId?: string}} license
 */
async function installLicense(page, license) {
  const apiBaseUrl = license.apiBaseUrl || "https://entitlements.invalid";
  await patchBillingConfig(page, {
    verification: {
      apiBaseUrl,
      publicKeyJwk: license.publicKeyJwk,
      required: true,
      // Keep the test offline unless it asks for a refresh round trip.
      revalidateHours: license.revalidateHours || 24 * 365
    }
  });
  await page.addInitScript(
    ({ token, licenseId }) => {
      try {
        localStorage.setItem(
          "vt_license_v1",
          JSON.stringify({ licenseId, token, storedAt: new Date().toISOString() })
        );
      } catch {
        /* ignore */
      }
    },
    { token: license.token, licenseId: license.licenseId || "lic_test_0001" }
  );
}

/** Wait for the async signature check to settle. */
async function waitForLicenseState(page, expected) {
  await page.waitForFunction(
    (want) => window.VTLicense?.getStatus?.().state === want,
    expected,
    { timeout: 5000 }
  );
}

module.exports = {
  mintLicense,
  tamperToken,
  patchBillingConfig,
  enableQaPro,
  installLicense,
  waitForLicenseState
};
