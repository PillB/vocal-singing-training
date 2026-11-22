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
  /**
   * Longest /v1/me may take. Without a limit a host that accepts the request and
   * never answers holds every later refresh (the account panel's, the sync's)
   * on the same promise for as long as the browser waits.
   */
  const ME_TIMEOUT_MS = 15000;

  /**
   * Set once `pro_paid_first` has actually been recorded, so it is sent once per
   * browser and not on every `/v1/me` answer for as long as somebody pays.
   *
   * It is the outcome the trial-length test is read on (the primary metric of
   * `trial_len_2026_11`), and the only thing in the statistics that comes from
   * the account rather than from watching the page. Latched on the beacon being
   * recorded rather than on sending it, so a visit with sending switched off, or
   * one where the request failed, tries again next time instead of losing the
   * only conversion this browser will ever report.
   */
  const LS_PAID_FIRST_KEY = "vt_pro_paid_first_v1";
  /**
   * A checkout whose link to the signed-in account the worker has not
   * confirmed yet (VG-83). The return page's one link attempt used to be
   * dropped on a 202 — the webhook later than the buyer, which Creem and
   * Stripe document as ordinary — and the next load then cleared the Pro the
   * buyer had just paid for. The reference is kept here and retried on every
   * load, and a few times while the page stays open, until the worker answers
   * for it or a week has passed.
   */
  const LS_PENDING_LINK_KEY = "vt_pending_link_v1";
  const PENDING_LINK_MAX_AGE_MS = 7 * 86400000;
  /** In-page retries after a 202; past the last one, the next load tries again. */
  const LINK_RETRY_DELAYS_MS = [4000, 12000, 30000, 90000];
  /** Answers after which retrying cannot help: malformed, unknown, or somebody else's. */
  const LINK_FINAL_STATUSES = new Set([400, 404, 409]);
  /** A link that has not answered in this long counts as offline: kept, and tried again later. */
  const LINK_TIMEOUT_MS = 15000;
  /** The rails a paid licence can come from (a grant or a trial has none of these). */
  const PAID_RAILS = new Set(["creem", "stripe", "mercadopago"]);
  /** Google Identity Services, loaded on demand so a signed-out visitor pays nothing for it. */
  const GIS_SRC = "https://accounts.google.com/gsi/client";

  /** @type {{token: string, expiresAt: number}|null} */
  let session = null;
  /**
   * Licence ids the worker has settled (linked, or refused for good), so an
   * answer cannot loop; and the ones being asked about right now. A licence
   * whose link failed for a passing reason is in neither, so it is asked
   * again rather than dropped on the next refresh.
   */
  const linkSettled = new Set();
  const linkAsking = new Set();
  /**
   * The pending link as last written, for a browser whose storage refuses it
   * (quota, blocked site data): the in-page retries read this copy.
   */
  let pendingMem = null;
  let pendingMemOnly = false;
  /** Link requests on their way, by body, so two callers asking at once send one. */
  const linksInFlight = new Map();
  /** The pending link's in-page retry timer, and how many delays it has used. */
  let linkRetryTimer = null;
  let linkRetryStep = 0;
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
   * Which probe is the newest. A probe that was superseded (somebody pressed
   * "try again" while it was still out) must not write its late answer over
   * the newer one: a stale failure landing last put the admin page back on
   * "server did not answer" after the server had answered.
   */
  let methodsGen = 0;

  /**
   * Which payment rails the worker can actually honour, from /v1/health.
   *
   * A rail is honourable only when the secret its webhook is verified with is
   * set: Mercado Pago needs MP_WEBHOOK_SECRET and MP_ACCESS_TOKEN, Stripe needs
   * STRIPE_WEBHOOK_SECRET. Without them the webhook is refused, nothing is ever
   * written for the payment, and the claim route — which only reads what the
   * webhook wrote — answers "pending" until the browser gives up. So a payment
   * taken in that window is money taken for Pro that can never be issued.
   *
   * `ok` false means we could not get an answer, which is not the same as a no;
   * js/billing.js stops a sale only on an explicit false.
   * @type {{stripe: boolean|null, mercadopago: boolean|null, ok: boolean}|null}
   */
  let rails = null;
  /** In-flight probe, shared the same way as methodsPending. */
  let railsPending = null;
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
  /** The session token `refreshing` was asked for. */
  let refreshingFor = null;
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

  /**
   * Send `pro_paid_first` the first time this browser sees a paid period.
   *
   * `source` is "paid" only for a subscription the provider has actually paid
   * for; a trial, a gift and a comp all report their own kind, so this cannot
   * count free access as a conversion. Nothing about the account goes with it —
   * the beacon carries the event name and the random browser id, like every
   * other one.
   * @param {Object|null} ent The entitlement from `/v1/me`.
   */
  function notePaidFirst(ent) {
    if (!ent || ent.pro !== true || ent.source !== "paid") return;
    try {
      if (localStorage.getItem(LS_PAID_FIRST_KEY) === "1") return;
    } catch {
      /* private mode: send it, and accept that it may be sent again */
    }
    let kept = null;
    try {
      kept = global.VTAnalytics?.track?.("pro_paid_first", {});
    } catch {
      /* analytics never breaks the page */
    }
    if (kept !== "recorded") return;
    try {
      localStorage.setItem(LS_PAID_FIRST_KEY, "1");
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
   * @param {{auth?: boolean, timeoutMs?: number, token?: string, keepalive?: boolean}} [options]
   *   Whether to send the session token, how long to wait before giving up, a
   *   token to send in place of the current one (sign-out, after forgetting
   *   it), and whether the request must outlive the page (a closing tab).
   * @returns {Promise<{ok: boolean, status: number, data: object|null, offline?: boolean}>} Result.
   */
  async function request(method, path, body, options) {
    const base = apiBase();
    if (!base) return { ok: false, status: 0, data: null };
    const headers = {};
    if (body !== null && body !== undefined) headers["content-type"] = "application/json";
    const token = (options && options.token) || session?.token;
    if ((options && options.auth) !== false && token) {
      headers.authorization = `Bearer ${token}`;
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
        keepalive: !!(options && options.keepalive),
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
    notePaidFirst(data && data.entitlement);
    if (data && data.token && global.VTLicense?.adopt) {
      // The account's own token (a trial, a gift) would replace a paid licence
      // this browser holds that the account does not name yet, bought signed
      // out (VG-88): it is linked first, or it is never linked at all.
      linkHeldLicence(data.licenseId);
      await global.VTLicense.adopt(data.token, data.licenseId);
    } else if (global.VTLicense?.clear && !(await keptByLinking())) {
      // Entitled to nothing right now: drop any token still lying around so the
      // UI cannot keep showing Pro after a gift was revoked.
      global.VTLicense.clear();
    }
    emit();
    return data;
  }

  /**
   * The paid licence this browser holds that is not this account's yet, by
   * id: one claimed on the way back from a checkout, or bought signed out.
   * A token minted for an account carries `accountId`, and for that one the
   * account's own answer is the truth (a revoked gift must end), so it is
   * never returned here.
   * @returns {string|null} Licence id, or null.
   */
  function heldPaidLicence() {
    try {
      const claims = global.VTLicense?.getClaims?.();
      const id = global.VTLicense?.getStatus?.()?.licenseId;
      if (!claims || claims.accountId || !PAID_RAILS.has(claims.provider)) return null;
      return typeof id === "string" && /^[A-Za-z0-9_-]{43}$/.test(id) ? id : null;
    } catch {
      return null;
    }
  }

  /**
   * Before dropping a paid licence the account does not show, ask the worker
   * once to link it (VG-83: never clear a claimed licence before a link has
   * been tried with its id). True when the licence is to be kept: the link
   * worked (and its answer has been adopted), or the worker did not answer
   * for it either way, in which case what the signature proves still stands.
   * @returns {Promise<boolean>}
   */
  async function keptByLinking() {
    const licenseId = heldPaidLicence();
    if (!licenseId || linkSettled.has(licenseId) || !session?.token) return false;
    // Already being asked (a second refresh, or that link's own answer being
    // adopted): keep it until the answer settles it.
    if (linkAsking.has(licenseId)) return true;
    const res = await linkLicence(licenseId);
    // Dropped only on an answer that settles it (malformed, unknown, or
    // another account's); offline, throttled or failing, the signature stands
    // and the link is tried again (it is pending until the worker answers).
    return res.ok || !LINK_FINAL_STATUSES.has(res.status);
  }

  /** Link the held paid licence before the account's own token replaces it; see adopt(). */
  function linkHeldLicence(accountLicenceId) {
    const held = heldPaidLicence();
    if (!held || held === accountLicenceId || linkSettled.has(held) || linkAsking.has(held) || !session?.token) return;
    linkLicence(held).catch(() => {});
  }

  /**
   * Ask the worker to link a licence by id, kept pending until it answers
   * for it, so a failure that passes is retried rather than forgotten.
   * @param {string} licenseId Licence id.
   * @returns {Promise<{ok: boolean, status?: number, reason?: string}>}
   */
  async function linkLicence(licenseId) {
    linkAsking.add(licenseId);
    try {
      const res = await linkCheckout({ licenseId }, { persist: true });
      if (res.ok || LINK_FINAL_STATUSES.has(res.status)) linkSettled.add(licenseId);
      return res;
    } finally {
      linkAsking.delete(licenseId);
    }
  }

  /**
   * Forget the session locally. Used on sign-out and on a rejected token.
   * A checkout still waiting to be claimed goes too: claimed after sign-out,
   * it would be linked to whoever signs in next on this browser. A pending
   * link stays, but names its account, and only that account retries it.
   */
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
   * On a sign-out, and only then, drop the checkout still waiting for its
   * licence, and stop any claim of it already running: claimed afterwards, it
   * would be linked to whoever signs in next on this browser. Not on a session
   * the worker rejected (expired, signed out everywhere): the buyer is still
   * here, and the claim is how their purchase reaches them when they sign in
   * again, since a link written before the account answered names only the
   * session that lapsed.
   */
  function dropPendingClaim() {
    try {
      global.VTBilling?.forgetPendingClaim?.();
    } catch {
      /* ignore */
    }
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
    const gen = (methodsGen += 1);
    methodsPending = (async () => {
      const res = await request("GET", "/v1/auth/methods", null, { auth: false, timeoutMs: 6000 });
      const answer = res.ok && res.data
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
      // Only the newest probe writes. A superseded one hands its own caller
      // the newer answer when there is one, and leaves the state alone.
      if (gen !== methodsGen) return methods || answer;
      methods = answer;
      methodsPending = null;
      return methods;
    })();
    return methodsPending;
  }

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
    methodsGen += 1;
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

  /**
   * Ask the worker what it offers, if nobody has asked yet, and tell listeners
   * when the answer lands so the panel can redraw. Cheap to call on every open:
   * a real answer is cached for the page's life, a failed probe is not.
   * @returns {Promise<object|null>} The answer, or null when unconfigured.
   */
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
   * Ask the worker which payment rails it can honour. Cached for the page's
   * life when it answers; a failed probe is thrown away so the next open asks
   * again, exactly as `ensureMethods` does.
   *
   * /v1/health needs no session and is the only route that reports this, which
   * is why it is read here rather than folded into /v1/me.
   * @returns {Promise<object|null>} The answer, or null with no worker.
   */
  function ensureRails() {
    if (!isConfigured()) return Promise.resolve(null);
    if (rails && rails.ok) return Promise.resolve(rails);
    if (railsPending) return railsPending;
    rails = null;
    railsPending = (async () => {
      const res = await request("GET", "/v1/health", null, { auth: false, timeoutMs: 6000 });
      const d = (res.ok && res.data) || null;
      rails = d
        ? {
          // A worker too old to report a field leaves it null, and null is not
          // a no: it must not stop a sale. Health has carried these two since
          // the first build, so a missing one is a broken answer, not an old one.
          stripe: typeof d.stripeConfigured === "boolean" ? d.stripeConfigured : null,
          mercadopago: typeof d.mercadopagoConfigured === "boolean" ? d.mercadopagoConfigured : null,
          // The Creem fields are the opposite case: each arrived in the same
          // build as the route it reports on (the webhook; the bound checkout
          // and the billing portal), so a worker that answers without one has
          // no such route. A Creem payment taken there can never become Pro
          // (the live worker before its redeploy answered the Creem webhook
          // with 404), so missing is a no.
          creem: d.creemConfigured === true,
          creemCheckout: d.creemCheckoutConfigured === true,
          creemPortal: d.creemPortalConfigured === true,
          ok: true
        }
        : { stripe: null, mercadopago: null, creem: null, creemCheckout: null, creemPortal: null, ok: false };
      railsPending = null;
      return rails;
    })();
    return railsPending;
  }

  /**
   * What `ensureRails()` last learned, without asking. Null until an answer
   * has landed, so a caller can tell "no answer yet" from "the worker said no".
   * @returns {object|null} The cached answer, or null.
   */
  function knownRails() {
    return rails && rails.ok ? rails : null;
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
    retryPendingLink().catch(() => {});
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
    // A failed probe is cached only so the panel has something to draw. It is
    // not a reason to say Google is not set up: ask again. If the worker still
    // does not answer, say that, so the caller can show "server did not answer"
    // instead of blaming an extension.
    if (methods && methods.ok === false) methods = null;
    const available = await getMethods();
    if (available.ok === false && isConfigured()) {
      container.innerHTML = "";
      return { ok: false, reason: "unreachable" };
    }
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
    retryPendingLink().catch(() => {});
    return { ok: true, account: res.data.account };
  }

  /**
   * Sign out here, or on every device.
   * @param {{everywhere?: boolean}} [options] Scope.
   * @returns {Promise<{ok: boolean}>} Result.
   */
  async function signOut(options) {
    const everywhere = !!(options && options.everywhere);
    const token = session?.token;
    // Forget first, synchronously: the page is signed out the moment this is
    // called, whether or not the worker ever answers the call below.
    forget();
    dropPendingClaim();
    if (token) {
      // Best effort, and bounded, so a caller that awaits this is not stuck.
      await request("POST", "/v1/auth/logout", { everywhere }, { token, timeoutMs: 6000 });
    }
    return { ok: true };
  }

  /**
   * Re-read the account and its entitlement from the worker.
   * @returns {Promise<{ok: boolean, reason?: string}>} Result.
   */
  function refresh() {
    if (!session?.token) return Promise.resolve({ ok: false, reason: "no_session" });
    const token = session.token;
    // One ask at a time, but only for the same sign-in: an answer about
    // somebody who has since signed out is not an answer about whoever is here.
    if (refreshing && refreshingFor === token) return refreshing;
    const mine = (async () => {
      const res = await request("GET", "/v1/me", null, { timeoutMs: ME_TIMEOUT_MS });
      if (session?.token !== token) return { ok: false, reason: "signed_out" };
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
    refreshing = mine;
    refreshingFor = token;
    mine
      .finally(() => {
        if (refreshing === mine) refreshing = null;
      })
      .catch(() => {});
    return mine;
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
  function linkCheckout(input, options) {
    const body = linkBody(input);
    const persist = !!(options && options.persist);
    // Written before asking, so a tab closed mid-request still retries on the next load.
    if (persist) writePendingLink(body);
    // The return page and the load's own retry ask for the same reference
    // within a moment of each other; one request answers both. Only for the
    // same sign-in: a request sent with somebody else's session is not theirs.
    const key = sessionTag() + JSON.stringify(body);
    if (!linksInFlight.has(key)) {
      linksInFlight.set(key, sendLink(body, persist).finally(() => linksInFlight.delete(key)));
    }
    return linksInFlight.get(key);
  }

  /** One `/v1/me/link` request, and what its answer does to the pending reference. */
  async function sendLink(body, persist) {
    const res = await request("POST", "/v1/me/link", body, { timeoutMs: LINK_TIMEOUT_MS });
    // Only the account's own answer is a link. A 202 is fetch's "ok" too, and
    // its body ({ok: false, reason: "pending"}) is the webhook not having
    // landed: taken for a link, it cleared the reference and replaced the
    // account snapshot with a body that has no account in it (VG-83).
    if (res.ok && res.data?.ok === true) {
      if (persist || samePendingLink(body)) writePendingLink(null);
      await adopt(res.data);
      return { ok: true, status: res.status };
    }
    settlePendingLink(body, res.status, persist);
    return { ok: false, status: res.status, reason: res.data?.reason || (res.status === 0 ? "offline" : "error") };
  }

  /** The `/v1/me/link` body for a checkout reference or a licence id. */
  function linkBody(input) {
    const body = {};
    if (input && input.licenseId) body.licenseId = String(input.licenseId);
    if (input && input.provider) body.provider = String(input.provider);
    if (input && input.sessionId) body.sessionId = String(input.sessionId);
    return body;
  }

  /**
   * After a link the worker did not make: forget the reference when retrying
   * cannot help (malformed, unknown, or somebody else's), otherwise try again
   * later — 202 (the webhook has not landed), 429, 401 until they sign in
   * again, offline and 5xx alike.
   */
  function settlePendingLink(body, status, persist) {
    if (LINK_FINAL_STATUSES.has(status) && samePendingLink(body)) {
      writePendingLink(null);
    } else if (persist) {
      scheduleLinkRetry();
    }
  }

  /** The checkout reference still waiting to be linked, or null; a week-old one is dropped. */
  function readPendingLink() {
    let rec = null;
    try {
      const raw = localStorage.getItem(LS_PENDING_LINK_KEY);
      rec = raw ? JSON.parse(raw) : pendingMemOnly ? pendingMem : null;
    } catch {
      rec = pendingMem;
    }
    if (!rec || typeof rec !== "object" || !(rec.sessionId || rec.licenseId)) return null;
    if (!(Date.now() - Number(rec.at) < PENDING_LINK_MAX_AGE_MS)) {
      writePendingLink(null);
      return null;
    }
    return rec;
  }

  /**
   * Keep (or, with null, forget) the reference to link; keeps the first time
   * it was asked for, and names who asked: the account when it is known, and
   * a tag of the session, so on a shared browser the next person to sign in
   * does not link somebody else's purchase to themselves.
   */
  function writePendingLink(body) {
    if (!body) {
      pendingMem = null;
      pendingMemOnly = false;
      try {
        localStorage.removeItem(LS_PENDING_LINK_KEY);
      } catch {
        /* ignore */
      }
      return;
    }
    const prev = readPendingLink();
    const at = samePendingLink(body, prev) ? prev.at : Date.now();
    pendingMem = { ...body, at, acct: snapshot?.account?.id || null, sess: sessionTag() };
    try {
      localStorage.setItem(LS_PENDING_LINK_KEY, JSON.stringify(pendingMem));
      pendingMemOnly = false;
    } catch {
      // Quota or blocked site data: the in-page retries read pendingMem.
      pendingMemOnly = true;
    }
  }

  /** Whether the pending reference was written by whoever is signed in now. */
  function ownsPending(rec) {
    const acct = snapshot?.account?.id;
    if (rec.acct && acct) return rec.acct === acct;
    return !!rec.sess && rec.sess === sessionTag();
  }

  /** A short, one-way tag of the session token (FNV-1a), never the token itself. */
  function sessionTag() {
    const token = session?.token;
    if (!token) return "";
    let h = 0x811c9dc5;
    for (let i = 0; i < token.length; i += 1) {
      h ^= token.charCodeAt(i);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h.toString(16);
  }

  /** Whether a link body names the pending reference. */
  function samePendingLink(body, pending) {
    const rec = pending === undefined ? readPendingLink() : pending;
    if (!rec || !body) return false;
    return (!!body.sessionId && body.sessionId === rec.sessionId && body.provider === rec.provider)
      || (!!body.licenseId && body.licenseId === rec.licenseId);
  }

  /** Try the pending link again after the next delay, while the page stays open. */
  function scheduleLinkRetry() {
    if (linkRetryTimer || linkRetryStep >= LINK_RETRY_DELAYS_MS.length) return;
    const delay = LINK_RETRY_DELAYS_MS[linkRetryStep];
    linkRetryStep += 1;
    linkRetryTimer = setTimeout(() => {
      linkRetryTimer = null;
      retryPendingLink().catch(() => {});
    }, delay);
  }

  /**
   * Link the pending checkout now, if there is one and somebody is signed in:
   * on every load, after a sign-in, and on the in-page schedule.
   * @returns {Promise<{ok: boolean, reason?: string}|null>} The answer, or null with nothing pending.
   */
  function retryPendingLink() {
    const rec = readPendingLink();
    if (!rec || !session?.token || !ownsPending(rec)) return Promise.resolve(null);
    const { at, acct, sess, ...body } = rec;
    return linkCheckout(body, { persist: true });
  }

  /**
   * Ask the worker to open a checkout bound to this account
   * (`POST /v1/me/checkout`); js/billing.js navigates to the answer.
   * @param {{plan: string, provider?: string, returnPath?: string}} input What to buy.
   * @returns {Promise<{ok: boolean, url?: string, reason?: string}>} Result.
   */
  async function openCheckout(input) {
    if (!session?.token) return { ok: false, reason: "no_session" };
    const res = await request("POST", "/v1/me/checkout", checkoutBody(input), { timeoutMs: 20000 });
    if (res.ok && res.data?.url) return { ok: true, url: String(res.data.url) };
    if (res.status === 401) return lostSession();
    return refusalOf(res);
  }

  /**
   * A refusal from the worker, with what the page needs to answer it: the
   * reason, the rail an open subscription is on (`subscription_open`), and how
   * many seconds a rate limit has left (`rate_limited`), when the worker said.
   */
  function refusalOf(res) {
    const out = { ok: false, status: res.status, reason: res.data?.reason || (res.status === 0 ? "offline" : "error") };
    if (typeof res.data?.provider === "string") out.provider = res.data.provider;
    const wait = Number(res.data?.retryAfter);
    if (Number.isFinite(wait) && wait > 0) out.retryAfter = wait;
    return out;
  }

  /** The `/v1/me/checkout` body for what the page asked to buy. */
  function checkoutBody(input) {
    return {
      plan: String(input?.plan || ""),
      provider: String(input?.provider || "creem"),
      returnPath: String(input?.returnPath || "/")
    };
  }

  /**
   * A 401 on a press: the session ended elsewhere (signed out, everywhere or
   * in another tab; expired; disabled). Forgotten here as refresh() does, so
   * the page asks them to sign in rather than failing every press until a
   * reload, whatever words the worker gave for it.
   */
  function lostSession() {
    forget();
    return { ok: false, status: 401, reason: "no_session" };
  }

  /**
   * The page where a subscriber manages or cancels (`POST /v1/me/billing-portal`).
   * @returns {Promise<{ok: boolean, url?: string, reason?: string, providers?: string[]}>} Result.
   */
  async function openBillingPortal() {
    if (!session?.token) return { ok: false, reason: "no_session" };
    const res = await request("POST", "/v1/me/billing-portal", {}, { timeoutMs: 15000 });
    if (res.ok && res.data?.url) return { ok: true, url: String(res.data.url) };
    if (res.status === 401) return lostSession();
    return {
      ok: false,
      status: res.status,
      reason: res.data?.reason || (res.status === 0 ? "offline" : "error"),
      providers: Array.isArray(res.data?.providers) ? res.data.providers : []
    };
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
      // Rails this account has a subscription on that is not over, Pro or
      // not: a renewal being retried after the paid period still needs its
      // "Manage or cancel" button.
      billingRails: Array.isArray(snapshot?.billingRails) ? snapshot.billingRails : [],
      // Null until the first /v1/auth/methods answer lands, so read it
      // defensively: the pricing panel may open before anyone signs in.
      methods,
      // Null until the account panel has tried to load Google's script.
      googleReady,
      /**
       * How long THIS account's trial is, which is not always what
       * `/v1/auth/methods` says: that route answers before anyone signs in and
       * can only report the configured default, while the trial-length test
       * gives each account 7 or 14 days. Falls back to the public answer until
       * the first `/v1/me` lands, and to nothing when neither has.
       */
      trialDays: accountTrialDays(),
      /**
       * Which arm of the trial-length test this account is in, as the worker
       * assigned it. Null when the test is off, and null for an account that
       * trialled before it was switched on. The page never chooses this.
       */
      trialArm: typeof snapshot?.trialArm === "string" ? snapshot.trialArm : null,
      // Pro is whatever the signature check says, never what this JSON claims.
      pro: !!global.VTLicense?.getClaims?.()
    };
  }

  /** This account's trial length from `/v1/me`, else the public default from `/v1/auth/methods`, else null. */
  function accountTrialDays() {
    if (Number(snapshot?.trialDays) > 0) return Number(snapshot.trialDays);
    if (Number(methods?.trialDays) > 0) return Number(methods.trialDays);
    return null;
  }

  /** The session token, for modules that call the worker themselves (sync). */
  function getSessionToken() {
    return session?.token || null;
  }

  /**
   * Run something once the page has stopped being busy, so a boot-time request
   * never competes with the first paint.
   * @param {Function} fn What to run.
   */
  function afterIdle(fn) {
    try {
      if (typeof global.requestIdleCallback === "function") {
        global.requestIdleCallback(() => fn(), { timeout: 2500 });
        return;
      }
    } catch {
      /* fall through to the timer */
    }
    setTimeout(fn, 1500);
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
    // This used to be deliberately empty: a visitor who only practised must not
    // have their browser talk to our worker at all, which is what privacy.html
    // promised until 2026-09-24. That promise is gone — the site sends anonymous
    // statistics from the first visit — and the cost of keeping the rule was
    // real: nothing knew which ways in this deployment offers until somebody
    // opened a panel, so the first open of every page load drew "still asking"
    // and reported that state to the funnel. Asking once the page is quiet fixes
    // both, and costs one cached request per load.
    afterIdle(() => {
      ensureMethods().catch(() => null);
    });
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
    retryPendingLink().catch(() => {});
    return getState();
  }

  global.VTAccount = {
    init,
    isConfigured,
    getMethods,
    ensureMethods,
    ensureRails,
    knownRails,
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
    retryPendingLink,
    openCheckout,
    openBillingPortal,
    request,
    LS_KEY
  };

  if (typeof document !== "undefined") {
    init().catch(() => {
      /* a failed check leaves the visitor signed out, which is the safe side */
    });
  }
})(window);
