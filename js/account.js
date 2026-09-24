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
  /**
   * Which KIND of access the last `/v1/me` reported. Display only, and kept
   * apart from the session for that reason: a signed licence token says
   * `pro_monthly` whether it came from the free trial, a gifted month or a
   * payment (the trial grant sets that plan id — see grants.js), so between a
   * reload and the worker answering there is nothing in the browser that can
   * tell them apart. Writing the last answer down is what stops the header
   * calling a free trial a subscription in that window, and for as long as it
   * lasts when the browser is offline. It grants nothing: access is still only
   * what the signature check says.
   */
  const LS_PLAN_KEY = "vt_account_plan_v1";
  /** Google Identity Services, loaded on demand so a signed-out visitor pays nothing for it. */
  const GIS_SRC = "https://accounts.google.com/gsi/client";

  /** @type {{token: string, expiresAt: number}|null} */
  let session = null;
  /** @type {object|null} Last `/v1/me` answer. */
  let snapshot = null;
  /**
   * Remembered kind of access, shaped like an `entitlement`. `undefined`
   * until first read so nothing touches storage at parse time.
   * @type {object|null|undefined}
   */
  let lastPlan;
  /**
   * What this deploy offers, once the worker has said. Null until asked, and
   * `ok: false` when the worker could not be reached — the panel shows those
   * two states differently, because "not switched on" and "we could not check"
   * are different things to tell a visitor.
   * @type {{email: boolean, google: boolean, googleClientId: string|null,
   *         trialDays: number, ok: boolean}|null}
   */
  let methods = null;
  /** In-flight probe, so two callers on the same open share one request. */
  let methodsPending = null;
  /**
   * Whether Google's script could actually be loaded in this browser: null
   * until we have tried, then true or false. The worker naming Google as a
   * method and a browser being able to run it are different facts — an
   * extension, a content blocker or a network can refuse the script — and on a
   * Google-only deploy the difference is the whole sign-in.
   * @type {boolean|null}
   */
  let googleReady = null;
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

  /**
   * The remembered kind of access, or null. A record whose period has already
   * ended is dropped: a stale "gifted month" label outliving the gift is the
   * mistake this whole record exists to prevent, in the other direction.
   * @returns {object|null} An entitlement-shaped record, display only.
   */
  function readLastPlan() {
    try {
      const raw = localStorage.getItem(LS_PLAN_KEY);
      if (!raw) return null;
      const rec = JSON.parse(raw);
      if (!rec || rec.pro !== true) return null;
      if (Number.isFinite(rec.periodEnd) && rec.periodEnd * 1000 < Date.now()) {
        localStorage.removeItem(LS_PLAN_KEY);
        return null;
      }
      return rec;
    } catch {
      return null;
    }
  }

  function writeLastPlan(ent) {
    lastPlan = null;
    try {
      if (!ent || ent.pro !== true) {
        localStorage.removeItem(LS_PLAN_KEY);
        return;
      }
      // Only the four fields the wording needs. No email, no ids, no token.
      lastPlan = {
        pro: true,
        plan: ent.plan || null,
        status: ent.status || null,
        source: ent.source || null,
        periodEnd: Number.isFinite(ent.periodEnd) ? ent.periodEnd : null
      };
      localStorage.setItem(LS_PLAN_KEY, JSON.stringify(lastPlan));
    } catch {
      /* private mode: the label just falls back to the licence's own reading */
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
   * @param {{auth?: boolean, timeoutMs?: number}} [options] Whether to send the
   *   session token, and how long to wait before giving up.
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
    // A host that accepts the connection and then never answers is the worst
    // case for a caller that gates UI on the reply: without this it waits as
    // long as the browser will, which is forever to anyone looking at the panel.
    const timeoutMs = Number(options && options.timeoutMs) > 0 ? Number(options.timeoutMs) : 0;
    let abort = null;
    let timer = null;
    if (timeoutMs) {
      try {
        abort = new AbortController();
        timer = setTimeout(() => abort.abort(), timeoutMs);
      } catch {
        abort = null;
      }
    }
    try {
      res = await fetch(base + path, {
        method,
        headers,
        body: body === null || body === undefined ? undefined : JSON.stringify(body),
        credentials: "omit",
        cache: "no-store",
        signal: abort ? abort.signal : undefined
      });
    } catch {
      return { ok: false, status: 0, data: null, offline: true };
    } finally {
      if (timer) clearTimeout(timer);
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
    writeLastPlan(data && data.entitlement);
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
    writeLastPlan(null);
    try {
      global.VTLicense?.clear?.();
    } catch {
      /* ignore */
    }
    emit();
  }

  /**
   * Which sign-in methods the deployment offers. Cached for the page's life.
   * @returns {Promise<{email: boolean, google: boolean, googleClientId: string|null,
   *                    trialDays: number}>} Methods. `trialDays` falls back to the
   *          worker's own default (7) when the answer omits it; see
   *          workers/entitlements/src/grants.js DEFAULT_TRIAL_DAYS.
   */
  async function getMethods() {
    if (methods) return methods;
    if (methodsPending) return methodsPending;
    methodsPending = (async () => {
      const res = await request("GET", "/v1/auth/methods", null, { auth: false, timeoutMs: 6000 });
      methods = res.ok && res.data
        ? {
          email: !!res.data.email,
          google: !!res.data.google,
          googleClientId: res.data.googleClientId || null,
          trialDays: Number(res.data.trialDays) > 0 ? Number(res.data.trialDays) : 7,
          ok: true
        }
        // Unreachable is not an answer. It is cached only so the panel has
        // something terminal to draw, and ensureMethods() throws it away so
        // the next open asks again.
        : { email: false, google: false, googleClientId: null, trialDays: 7, ok: false };
      methodsPending = null;
      return methods;
    })();
    return methodsPending;
  }

  /**
   * Ask the worker what it offers, if nobody has asked yet, and tell listeners
   * when the answer lands so the panel can redraw. Cheap to call on every open:
   * a real answer is cached for the page's life, a failed probe is not.
   * @returns {Promise<object|null>} The answer, or null when unconfigured.
   */
  /**
   * Ask the worker again, from scratch.
   *
   * `ensureMethods()` keeps a good answer and re-asks a bad one, which is right
   * for reopening the panel. It is not enough for a person pressing "try
   * again": the reason they are pressing is usually that they have just turned
   * off the extension that blocked Google's script, and the `false` verdict on
   * that script is cached separately from the worker's answer. This clears
   * both, so a retry can actually succeed.
   * @returns {Promise<object|null>} The methods, or null with no worker.
   */
  function refreshMethods() {
    methods = null;
    methodsPending = null;
    googleReady = null;
    gisPromise = null;
    if (!isConfigured()) {
      emit();
      return Promise.resolve(null);
    }
    return getMethods().then((m) => {
      emit();
      return m;
    });
  }

  function ensureMethods() {
    if (!isConfigured()) return Promise.resolve(null);
    if (methods && methods.ok) return Promise.resolve(methods);
    if (methods && !methods.ok) methods = null;
    return getMethods().then((m) => {
      emit();
      return m;
    });
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
    }).then((ok) => {
      googleReady = !!ok;
      // A refusal is not a permanent verdict — it may have been the network —
      // so let the next open try again, the way a failed methods probe does.
      if (!ok) gisPromise = null;
      // The panel keys its sign-in options off this, so it has to hear about it.
      emit();
      return ok;
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
      // Clear on the way out too: what a deploy offers can change between one
      // open and the next, and a button drawn earlier must not outlive it.
      container.innerHTML = "";
      return { ok: false, reason: "google_not_configured" };
    }
    if (!(await loadGoogleScript())) {
      container.innerHTML = "";
      return { ok: false, reason: "script_blocked" };
    }
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
      // The kind of access the worker last reported, for the window where
      // `signedIn` is already true and `entitlement` is not in yet. Wording
      // only; read `pro` below for whether anything is actually unlocked.
      lastPlan: lastPlan === undefined ? (lastPlan = readLastPlan()) : lastPlan,
      grants: snapshot?.grants || [],
      // Null until the first /v1/auth/methods answer lands, so read it
      // defensively: the pricing panel may open before anyone signs in.
      methods,
      // Null until the account panel has tried to load Google's script.
      googleReady,
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
    if (!isConfigured()) {
      emit();
      return getState();
    }
    // Deliberately no /v1/auth/methods here. A visitor who only ever practises
    // must not have their browser talk to our worker at all, which is what
    // privacy.html promises and what tests/tour-behaviour.spec.js checks. The
    // probe happens on ensureMethods(), which the account and Pro panels call
    // when someone opens them.
    if (!session?.token) {
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
    ensureMethods,
    getState,
    getSessionToken,
    onChange,
    startEmailSignIn,
    verifyEmailCode,
    refreshMethods,
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
