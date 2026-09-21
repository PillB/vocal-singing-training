/**
 * Accounts: sign in, stay signed in, and carry Pro between devices.
 *
 * The site is static, so this module holds no secret and decides nothing. It
 * exchanges proof of an email — a code we sent, or a Google ID token — for an
 * opaque session token from the entitlements worker, keeps that token, and asks
 * the worker what the account is entitled to. The answer comes back as the same
 * signed license token `js/license.js` already verifies, so being Pro because
 * somebody gifted you a month and being Pro because you pay go down one path.
 *
 * Why a bearer token and not a cookie: the site is served from one origin and
 * the worker from another, so a cookie set by the worker is a third-party
 * cookie, which browsers no longer keep. The token lives in localStorage and
 * travels in an Authorization header.
 *
 * Nothing here works until an operator fills in the worker URL — see
 * docs/10-SUBSCRIPTIONS.md. Until then `isConfigured()` is false and the
 * account UI stays hidden rather than offering a sign-in that cannot work.
 */
(function (global) {
  "use strict";

  const LS_KEY = "vt_account_session_v1";
  /** Google Identity Services, loaded on demand so a signed-out visitor pays nothing for it. */
  const GIS_SRC = "https://accounts.google.com/gsi/client";

  /** @type {{token: string, expiresAt: number}|null} */
  let session = null;
  /** @type {object|null} Last `/v1/me` answer. */
  let snapshot = null;
  /** @type {{email: boolean, google: boolean, googleClientId: string|null}|null} */
  let methods = null;
  let refreshing = null;
  let gisPromise = null;

  const listeners = new Set();

  function cfg() {
    const c = global.VT_BILLING_CONFIG || {};
    return c.verification || {};
  }

  /** Base URL of the entitlements worker, or "" when unset or not https. */
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

  /** True once the worker URL is configured; the account UI keys off this. */
  function isConfigured() {
    return !!apiBase();
  }

  function readSession() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return null;
      const rec = JSON.parse(raw);
      if (!rec || typeof rec.token !== "string" || !rec.token) return null;
      if (Number.isFinite(rec.expiresAt) && rec.expiresAt * 1000 < Date.now()) {
        localStorage.removeItem(LS_KEY);
        return null;
      }
      return rec;
    } catch {
      return null;
    }
  }

  function writeSession(rec) {
    try {
      if (!rec) localStorage.removeItem(LS_KEY);
      else localStorage.setItem(LS_KEY, JSON.stringify(rec));
    } catch {
      /* private mode */
    }
  }

  function emit() {
    const state = getState();
    listeners.forEach((fn) => {
      try {
        fn(state);
      } catch (err) {
        console.warn(err);
      }
    });
  }

  /**
   * Subscribe to account changes.
   * @param {function} fn Listener.
   * @returns {function} Unsubscribe.
   */
  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }

  /**
   * Call the worker.
   * @param {string} method HTTP method.
   * @param {string} path Path under the worker base.
   * @param {object|null} body JSON body, or null.
   * @param {{auth?: boolean}} [options] Whether to send the session token.
   * @returns {Promise<{ok: boolean, status: number, data: object|null, offline?: boolean}>} Result.
   */
  async function request(method, path, body, options) {
    const base = apiBase();
    if (!base) return { ok: false, status: 0, data: null };
    const headers = {};
    if (body !== null && body !== undefined) headers["content-type"] = "application/json";
    if ((options && options.auth) !== false && session?.token) {
      headers.authorization = `Bearer ${session.token}`;
    }
    let res;
    try {
      res = await fetch(base + path, {
        method,
        headers,
        body: body === null || body === undefined ? undefined : JSON.stringify(body),
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

  /**
   * Take a `/v1/me`-shaped answer as the current truth, handing the license
   * token straight to the verifier rather than trusting the JSON around it.
   * @param {object} data Response body.
   * @returns {Promise<object>} The same data.
   */
  async function adopt(data) {
    snapshot = data;
    if (data && data.token && global.VTLicense?.adopt) {
      await global.VTLicense.adopt(data.token, data.licenseId);
    } else if (global.VTLicense?.clear) {
      // Entitled to nothing right now: drop any token still lying around so the
      // UI cannot keep showing Pro after a gift was revoked.
      global.VTLicense.clear();
    }
    emit();
    return data;
  }

  /** Forget the session locally. Used on sign-out and on a rejected token. */
  function forget() {
    session = null;
    snapshot = null;
    writeSession(null);
    try {
      global.VTLicense?.clear?.();
    } catch {
      /* ignore */
    }
    emit();
  }

  /**
   * Which sign-in methods the deployment offers. Cached for the page's life.
   * @returns {Promise<{email: boolean, google: boolean, googleClientId: string|null}>} Methods.
   */
  async function getMethods() {
    if (methods) return methods;
    const res = await request("GET", "/v1/auth/methods", null, { auth: false });
    methods = res.ok && res.data
      ? {
        email: !!res.data.email,
        google: !!res.data.google,
        googleClientId: res.data.googleClientId || null
      }
      : { email: false, google: false, googleClientId: null };
    return methods;
  }

  /**
   * Ask the worker to email a sign-in code.
   * @param {string} email Address.
   * @returns {Promise<{ok: boolean, reason?: string}>} Result.
   */
  async function startEmailSignIn(email) {
    const address = String(email || "").trim();
    if (!address) return { ok: false, reason: "bad_email" };
    const res = await request("POST", "/v1/auth/email/start", { email: address }, { auth: false });
    if (res.ok) return { ok: true };
    if (res.status === 0) return { ok: false, reason: "offline" };
    return { ok: false, reason: res.data?.reason || "error" };
  }

  /**
   * Exchange an emailed code for a session.
   * @param {string} email Address.
   * @param {string} code Six-digit code.
   * @returns {Promise<{ok: boolean, reason?: string, account?: object}>} Result.
   */
  async function verifyEmailCode(email, code) {
    const res = await request(
      "POST",
      "/v1/auth/email/verify",
      { email: String(email || "").trim(), code: String(code || "").trim() },
      { auth: false }
    );
    if (!res.ok || !res.data?.sessionToken) {
      if (res.status === 0) return { ok: false, reason: "offline" };
      return { ok: false, reason: res.data?.reason || "error" };
    }
    session = { token: res.data.sessionToken, expiresAt: res.data.expiresAt };
    writeSession(session);
    await adopt(res.data);
    return { ok: true, account: res.data.account };
  }

  /**
   * Load Google Identity Services once.
   * @returns {Promise<boolean>} Whether it is available.
   */
  function loadGoogleScript() {
    if (gisPromise) return gisPromise;
    gisPromise = new Promise((resolve) => {
      if (global.google?.accounts?.id) return resolve(true);
      const el = document.createElement("script");
      el.src = GIS_SRC;
      el.async = true;
      el.defer = true;
      el.onload = () => resolve(!!global.google?.accounts?.id);
      el.onerror = () => resolve(false);
      document.head.appendChild(el);
    });
    return gisPromise;
  }

  /**
   * Render Google's own sign-in button into a container.
   *
   * Google's button is used rather than a look-alike on purpose: it is the only
   * thing that can produce an ID token, and Google's branding rules require it.
   *
   * @param {HTMLElement} container Where to draw it.
   * @param {{onResult?: function}} [options] Called with the sign-in result.
   * @returns {Promise<{ok: boolean, reason?: string}>} Whether the button drew.
   */
  async function renderGoogleButton(container, options) {
    const available = await getMethods();
    if (!available.google || !available.googleClientId) {
      return { ok: false, reason: "google_not_configured" };
    }
    if (!(await loadGoogleScript())) return { ok: false, reason: "script_blocked" };
    try {
      global.google.accounts.id.initialize({
        client_id: available.googleClientId,
        callback: async (response) => {
          const result = await signInWithGoogle(response?.credential);
          if (options && typeof options.onResult === "function") options.onResult(result);
        }
      });
      container.innerHTML = "";
      global.google.accounts.id.renderButton(container, {
        theme: "outline",
        size: "large",
        shape: "pill",
        width: Math.min(320, Math.max(220, container.clientWidth || 260))
      });
      return { ok: true };
    } catch (err) {
      console.warn("[VTAccount] Google button failed:", err?.message || err);
      return { ok: false, reason: "error" };
    }
  }

  /**
   * Exchange a Google ID token for a session.
   * @param {string} idToken Credential from Google Identity Services.
   * @returns {Promise<{ok: boolean, reason?: string, account?: object}>} Result.
   */
  async function signInWithGoogle(idToken) {
    if (!idToken) return { ok: false, reason: "no_credential" };
    const res = await request("POST", "/v1/auth/google", { idToken }, { auth: false });
    if (!res.ok || !res.data?.sessionToken) {
      if (res.status === 0) return { ok: false, reason: "offline" };
      return { ok: false, reason: res.data?.reason || "error" };
    }
    session = { token: res.data.sessionToken, expiresAt: res.data.expiresAt };
    writeSession(session);
    await adopt(res.data);
    return { ok: true, account: res.data.account };
  }

  /**
   * Sign out here, or on every device.
   * @param {{everywhere?: boolean}} [options] Scope.
   * @returns {Promise<{ok: boolean}>} Result.
   */
  async function signOut(options) {
    const everywhere = !!(options && options.everywhere);
    if (session?.token) {
      // Best effort: the local session is dropped either way, so a failed call
      // never leaves somebody stuck signed in.
      await request("POST", "/v1/auth/logout", { everywhere });
    }
    forget();
    return { ok: true };
  }

  /**
   * Re-read the account and its entitlement from the worker.
   * @returns {Promise<{ok: boolean, reason?: string}>} Result.
   */
  function refresh() {
    if (refreshing) return refreshing;
    if (!session?.token) return Promise.resolve({ ok: false, reason: "no_session" });
    refreshing = (async () => {
      const res = await request("GET", "/v1/me", null);
      if (res.ok && res.data) {
        await adopt(res.data);
        return { ok: true, claims: global.VTLicense?.getClaims?.() || null };
      }
      if (res.status === 401) {
        // The session is gone server-side: signed out elsewhere, or expired.
        forget();
        return { ok: false, reason: "signed_out" };
      }
      if (res.status === 0) return { ok: false, reason: "offline" };
      return { ok: false, reason: res.data?.reason || "error" };
    })();
    try {
      return refreshing;
    } finally {
      refreshing.finally(() => {
        refreshing = null;
      });
    }
  }

  /**
   * Start this account's free trial.
   * @returns {Promise<{ok: boolean, reason?: string}>} Result.
   */
  async function startTrial() {
    const res = await request("POST", "/v1/me/trial", {});
    if (res.ok && res.data) {
      await adopt(res.data);
      const endsAt = res.data.entitlement?.periodEnd;
      const days = Number.isFinite(endsAt)
        ? Math.max(1, Math.round((endsAt - Date.now() / 1000) / 86400))
        : null;
      return { ok: true, days };
    }
    return { ok: false, reason: res.data?.reason || (res.status === 0 ? "offline" : "error") };
  }

  /**
   * Redeem a gift code onto this account.
   * @param {string} code Code in any form.
   * @returns {Promise<{ok: boolean, reason?: string, days?: number}>} Result.
   */
  async function redeem(code) {
    const res = await request("POST", "/v1/me/redeem", { code: String(code || "").trim() });
    if (res.ok && res.data) {
      await adopt(res.data);
      return { ok: true, days: res.data.redeemedDays || null };
    }
    return { ok: false, reason: res.data?.reason || (res.status === 0 ? "offline" : "error") };
  }

  /**
   * Attach a completed checkout to this account, so the subscription follows
   * the person rather than the browser they happened to pay in.
   * @param {{provider?: string, sessionId?: string, licenseId?: string}} input Checkout reference.
   * @returns {Promise<{ok: boolean, reason?: string}>} Result.
   */
  async function linkCheckout(input) {
    const body = {};
    if (input && input.licenseId) body.licenseId = String(input.licenseId);
    if (input && input.provider) body.provider = String(input.provider);
    if (input && input.sessionId) body.sessionId = String(input.sessionId);
    const res = await request("POST", "/v1/me/link", body);
    if (res.ok && res.data) {
      await adopt(res.data);
      return { ok: true };
    }
    return { ok: false, reason: res.data?.reason || (res.status === 0 ? "offline" : "error") };
  }

  /**
   * Current account state, synchronously.
   * @returns {{configured: boolean, signedIn: boolean, account: object|null,
   *            entitlement: object|null, grants: object[], pro: boolean}} State.
   */
  function getState() {
    return {
      configured: isConfigured(),
      signedIn: !!session?.token,
      account: snapshot?.account || null,
      entitlement: snapshot?.entitlement || null,
      grants: snapshot?.grants || [],
      // Pro is whatever the signature check says, never what this JSON claims.
      pro: !!global.VTLicense?.getClaims?.()
    };
  }

  /** The session token, for modules that call the worker themselves (sync). */
  function getSessionToken() {
    return session?.token || null;
  }

  /**
   * Adopt what is in storage and, when signed in, re-check with the worker.
   * @returns {Promise<object>} State after the check.
   */
  async function init() {
    session = readSession();
    if (!isConfigured() || !session?.token) {
      emit();
      return getState();
    }
    // A signed-in visitor's license is refreshed through the account rather
    // than through a bare license id, so a revoked gift stops Pro on the next
    // load even though nothing about the token itself changed.
    try {
      global.VTLicense?.setRefresher?.(() => refresh());
    } catch {
      /* ignore */
    }
    await refresh();
    return getState();
  }

  global.VTAccount = {
    init,
    isConfigured,
    getMethods,
    getState,
    getSessionToken,
    onChange,
    startEmailSignIn,
    verifyEmailCode,
    renderGoogleButton,
    signInWithGoogle,
    signOut,
    refresh,
    startTrial,
    redeem,
    linkCheckout,
    request,
    LS_KEY
  };

  if (typeof document !== "undefined") {
    init().catch(() => {
      /* a failed check leaves the visitor signed out, which is the safe side */
    });
  }
})(window);
