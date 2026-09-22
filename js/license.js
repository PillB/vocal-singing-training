/**
 * Server-checked entitlement licenses.
 *
 * The site is static (GitHub Pages), so it cannot hold payment secrets. Payment
 * providers notify a small worker (workers/entitlements/) instead; the worker is
 * the only place that decides who is paid, and it hands the browser a short-lived
 * token signed with an ECDSA P-256 key (ES256, compact JWS-like encoding).
 *
 * What this buys us:
 * - A "paid" entitlement can no longer be invented by editing localStorage: the
 *   token carries a signature we verify against the public key in billing-config.
 * - Tokens expire (72h by default) and are re-fetched with the license id, so a
 *   cancellation or a failed renewal stops Pro on the next refresh.
 * - A token copied to another browser stops working when it expires, and the
 *   license id it came from can be revoked server-side.
 *
 * What it cannot buy on a static site: every Pro feature here is computed in the
 * browser, so someone editing the page in devtools can still reach them. This
 * closes forgery and sharing, not devtools. See docs/10-SUBSCRIPTIONS.md.
 */
(function (global) {
  "use strict";

  const LS_KEY = "vt_license_v1";
  const ISSUER = "vocal-studio-entitlements";
  const CLOCK_SKEW_S = 300;
  const DEFAULT_REVALIDATE_HOURS = 24;
  /**
   * Statuses the worker is willing to sign. A cancelled subscription keeps the
   * period it paid for (the worker caps `exp` at `periodEnd`); a past_due one
   * keeps access while the provider retries, until the provider cancels it.
   */
  const ENTITLED_STATUSES = new Set(["active", "past_due", "canceled"]);
  const CLAIM_RETRY_DELAYS_MS = [1500, 3000, 5000, 8000];

  /** In-memory result of the last signature check — billing reads this synchronously. */
  let verified = null;
  /** @type {"idle"|"checking"|"ok"|"invalid"|"none"} */
  let state = "idle";
  let refreshing = false;
  /**
   * When an account is signed in, its session — not a bare license id — is what
   * a fresh token is fetched with, so a revoked gift or a cancelled plan stops
   * Pro on the next re-check. `js/account.js` installs this.
   * @type {null | (() => Promise<{ok: boolean, reason?: string}>)}
   */
  let refresher = null;
  let publicKeyPromise = null;
  let publicKeyJwkSource = null;

  const listeners = new Set();

  function cfg() {
    const c = global.VT_BILLING_CONFIG || {};
    return c.verification || {};
  }

  function apiBase() {
    const raw = String(cfg().apiBaseUrl || "").trim();
    if (!raw) return "";
    try {
      const u = new URL(raw);
      if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") {
        return "";
      }
      return raw.replace(/\/+$/, "");
    } catch {
      return "";
    }
  }

  /** True when an operator has wired both halves (worker URL + public key). */
  function isConfigured() {
    return !!apiBase() && !!cfg().publicKeyJwk;
  }

  function read() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function write(rec) {
    try {
      if (!rec) localStorage.removeItem(LS_KEY);
      else localStorage.setItem(LS_KEY, JSON.stringify(rec));
    } catch {
      /* private mode */
    }
  }

  function emit() {
    listeners.forEach((fn) => {
      try {
        fn(getStatus());
      } catch (err) {
        console.warn(err);
      }
    });
  }

  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  function base64UrlToBytes(str) {
    const pad = "=".repeat((4 - (String(str).length % 4)) % 4);
    const b64 = String(str).replace(/-/g, "+").replace(/_/g, "/") + pad;
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function base64UrlToJson(str) {
    const bytes = base64UrlToBytes(str);
    return JSON.parse(new TextDecoder().decode(bytes));
  }

  function publicKey() {
    const jwk = cfg().publicKeyJwk;
    if (!jwk) return Promise.resolve(null);
    const fingerprint = JSON.stringify(jwk);
    if (publicKeyPromise && publicKeyJwkSource === fingerprint) return publicKeyPromise;
    publicKeyJwkSource = fingerprint;
    publicKeyPromise = (async () => {
      try {
        return await crypto.subtle.importKey(
          "jwk",
          jwk,
          { name: "ECDSA", namedCurve: "P-256" },
          false,
          ["verify"]
        );
      } catch (err) {
        console.warn("[VTLicense] public key rejected:", err?.message || err);
        return null;
      }
    })();
    return publicKeyPromise;
  }

  /** Origin this site is allowed to present tokens for (matches the worker's SITE_ORIGIN). */
  function expectedAudience() {
    const aud = String(cfg().audience || "").trim();
    if (aud) return aud;
    try {
      return global.location.origin;
    } catch {
      return "";
    }
  }

  /**
   * Verify a license token's signature and claims.
   * @param {string} token compact `header.payload.signature`
   * @returns {Promise<object|null>} claims when valid, null otherwise
   */
  async function verifyToken(token) {
    const raw = String(token || "").trim();
    const parts = raw.split(".");
    if (parts.length !== 3) return null;
    const key = await publicKey();
    if (!key) return null;
    let header;
    let claims;
    let signature;
    try {
      header = base64UrlToJson(parts[0]);
      claims = base64UrlToJson(parts[1]);
      signature = base64UrlToBytes(parts[2]);
    } catch {
      return null;
    }
    if (!header || header.alg !== "ES256") return null;
    if (!claims || typeof claims !== "object") return null;

    let ok = false;
    try {
      ok = await crypto.subtle.verify(
        { name: "ECDSA", hash: "SHA-256" },
        key,
        signature,
        new TextEncoder().encode(parts[0] + "." + parts[1])
      );
    } catch {
      return null;
    }
    if (!ok) return null;

    const now = Math.floor(Date.now() / 1000);
    if (claims.iss !== ISSUER) return null;
    const aud = expectedAudience();
    if (aud && claims.aud && claims.aud !== aud) return null;
    if (typeof claims.exp !== "number" || claims.exp + CLOCK_SKEW_S < now) return null;
    if (typeof claims.iat === "number" && claims.iat - CLOCK_SKEW_S > now) return null;
    if (!ENTITLED_STATUSES.has(claims.status)) return null;
    if (claims.plan !== "pro_monthly" && claims.plan !== "pro_yearly") return null;
    return claims;
  }

  /** True when the stored token is old enough that we should ask the worker again. */
  function needsRefresh(claims) {
    if (!claims) return true;
    const hours = Number(cfg().revalidateHours);
    const window = (Number.isFinite(hours) && hours > 0 ? hours : DEFAULT_REVALIDATE_HOURS) * 3600;
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.iat !== "number") return true;
    return now - claims.iat >= window;
  }

  async function postJson(path, body) {
    const base = apiBase();
    if (!base) return { ok: false, status: 0, data: null };
    let res;
    try {
      res = await fetch(base + path, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
        credentials: "omit",
        cache: "no-store"
      });
    } catch {
      return { ok: false, status: 0, data: null, offline: true };
    }
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    return { ok: res.ok, status: res.status, data };
  }

  async function adopt(token, licenseId) {
    const claims = await verifyToken(token);
    if (!claims) {
      state = "invalid";
      verified = null;
      emit();
      return null;
    }
    verified = claims;
    state = "ok";
    write({
      licenseId: licenseId || claims.sub || null,
      token: String(token),
      storedAt: new Date().toISOString()
    });
    emit();
    return claims;
  }

  /**
   * Exchange a provider checkout id for a license. The worker only answers once
   * the matching webhook has landed, so a short retry covers the usual race.
   * @param {{provider: string, sessionId: string}} input
   * @returns {Promise<{ok: boolean, reason?: string, claims?: object}>}
   */
  async function claim(input) {
    const provider = String(input?.provider || "").trim();
    const sessionId = String(input?.sessionId || "").trim();
    if (!isConfigured()) return { ok: false, reason: "unconfigured" };
    if (!provider || !sessionId) return { ok: false, reason: "invalid_input" };

    state = "checking";
    emit();
    for (let attempt = 0; attempt <= CLAIM_RETRY_DELAYS_MS.length; attempt++) {
      const res = await postJson("/v1/claim", { provider, sessionId });
      if (res.ok && res.data?.token) {
        const claims = await adopt(res.data.token, res.data.licenseId);
        return claims ? { ok: true, claims } : { ok: false, reason: "bad_signature" };
      }
      const pending = res.status === 202 || res.status === 0;
      if (!pending) {
        state = "none";
        emit();
        return { ok: false, reason: res.data?.reason || "not_found" };
      }
      if (attempt < CLAIM_RETRY_DELAYS_MS.length) {
        await new Promise((r) => setTimeout(r, CLAIM_RETRY_DELAYS_MS[attempt]));
      }
    }
    state = "checking";
    emit();
    return { ok: false, reason: "pending" };
  }

  /**
   * Ask the worker for a fresh token for the stored license id. Revocation,
   * cancellation and failed renewals surface here.
   * @returns {Promise<{ok: boolean, reason?: string, claims?: object}>}
   */
  async function refresh() {
    if (refreshing) return { ok: false, reason: "busy" };
    if (!isConfigured()) return { ok: false, reason: "unconfigured" };
    if (refresher) {
      refreshing = true;
      try {
        return await refresher();
      } catch {
        return { ok: false, reason: "error" };
      } finally {
        refreshing = false;
      }
    }
    const rec = read();
    if (!rec?.licenseId) return { ok: false, reason: "no_license" };
    refreshing = true;
    try {
      const res = await postJson("/v1/license", { licenseId: rec.licenseId });
      if (res.ok && res.data?.token) {
        const claims = await adopt(res.data.token, rec.licenseId);
        return claims ? { ok: true, claims } : { ok: false, reason: "bad_signature" };
      }
      if (res.status === 0) {
        // Offline: keep whatever is still within its expiry.
        return { ok: false, reason: "offline" };
      }
      if (res.status === 404 || res.status === 410) {
        clear();
        return { ok: false, reason: "revoked" };
      }
      if (res.status === 403) {
        // Subscription cancelled or past its period end — stop claiming Pro now.
        clear();
        return { ok: false, reason: res.data?.reason || "inactive" };
      }
      return { ok: false, reason: res.data?.reason || "error" };
    } finally {
      refreshing = false;
    }
  }

  function clear() {
    write(null);
    verified = null;
    state = "none";
    emit();
  }

  /** Verified claims, or null. Synchronous: reflects the last completed check. */
  function getClaims() {
    if (!verified) return null;
    const now = Math.floor(Date.now() / 1000);
    if (typeof verified.exp === "number" && verified.exp + CLOCK_SKEW_S < now) {
      verified = null;
      state = "invalid";
      return null;
    }
    return verified;
  }

  function hasStoredLicense() {
    return !!read()?.token;
  }

  /**
   * @returns {{configured: boolean, state: string, pro: boolean, plan: string|null,
   *            expiresAt: string|null, hasToken: boolean}}
   */
  function getStatus() {
    const claims = getClaims();
    return {
      configured: isConfigured(),
      state,
      pro: !!claims,
      plan: claims?.plan || null,
      licenseStatus: claims?.status || null,
      provider: claims?.provider || null,
      expiresAt: claims?.exp ? new Date(claims.exp * 1000).toISOString() : null,
      periodEndsAt: claims?.periodEnd ? new Date(claims.periodEnd * 1000).toISOString() : null,
      licenseId: read()?.licenseId || null,
      hasToken: hasStoredLicense()
    };
  }

  /** Verify what is in storage, then refresh in the background when it is stale. */
  async function init() {
    const rec = read();
    if (!rec?.token) {
      state = "none";
      return getStatus();
    }
    if (!isConfigured()) {
      // No public key to check against — a stored token proves nothing.
      state = "invalid";
      verified = null;
      return getStatus();
    }
    state = "checking";
    const claims = await verifyToken(rec.token);
    if (claims) {
      verified = claims;
      state = "ok";
    } else {
      verified = null;
      state = "invalid";
    }
    emit();
    if (!claims || needsRefresh(claims)) {
      refresh().catch(() => {});
    }
    return getStatus();
  }

  /**
   * Install (or clear) the account-aware refresher.
   * @param {null | (() => Promise<object>)} fn Refresher, or null to restore
   *   the plain license-id path.
   * @returns {void}
   */
  function setRefresher(fn) {
    refresher = typeof fn === "function" ? fn : null;
  }

  global.VTLicense = {
    isConfigured,
    verifyToken,
    adopt,
    setRefresher,
    claim,
    refresh,
    clear,
    getClaims,
    getStatus,
    hasStoredLicense,
    needsRefresh,
    onChange,
    init,
    LS_KEY
  };

  // Fail closed until the signature check finishes.
  if (read()?.token) state = "checking";
  init().catch(() => {
    state = "invalid";
  });
})(window);
