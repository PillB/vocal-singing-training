/**
 * Subscription / entitlement layer for static GitHub Pages deploy.
 *
 * Architecture (current, non-deprecated):
 * - Checkout: Stripe Payment Links + Mercado Pago subscription/checkout links
 *   (no card data on origin — PCI SAQ-A). Official: https://docs.stripe.com/payment-links
 * - Entitlement: decided by workers/entitlements/, which verifies the provider
 *   webhook signature and issues a short-lived ES256 license token. The browser
 *   verifies that signature (js/license.js) before granting Pro.
 * - localStorage still carries plan/provider for the UI, but on its own it grants
 *   nothing: `verification.required` makes an unsigned "paid" record worthless.
 *
 * Security notes:
 * - Never put secret keys in client JS.
 * - A ?billing=success return is only a hint: it starts a license claim, it does
 *   not grant Pro.
 * - Demo unlock and internal-account Pro are QA switches, off in public builds.
 * - Honest limit: every Pro feature here runs in the browser, so devtools can
 *   still reach them. This closes forged and shared entitlements, not devtools.
 */
(function (global) {
  "use strict";

  const LS_KEY = "vt_billing_v1";
  const TRIAL_KEY = "vt_billing_trial_started_v1";
  const PLAN_IDS = new Set(["pro_monthly", "pro_yearly", "trial"]);
  const PROVIDER_IDS = new Set(["stripe", "mercadopago", "demo", "internal", "auth"]);
  /** Sources that unlock Pro without payment — QA only, gated by demoUnlockEnabled. */
  const OVERRIDE_SOURCES = new Set(["demo", "internal_account"]);

  /** Default hosts allowed for checkout redirects (override via config.allowedCheckoutHosts). */
  const DEFAULT_CHECKOUT_HOSTS = [
    "buy.stripe.com",
    "checkout.stripe.com",
    "www.mercadopago.com",
    "www.mercadopago.com.pe",
    "www.mercadopago.com.ar",
    "www.mercadopago.com.mx",
    "www.mercadopago.com.co",
    "www.mercadopago.cl",
    "www.mercadopago.com.uy",
    "mpago.la",
    "link.mercadopago.com.pe",
    "link.mercadopago.com.ar"
  ];

  function cfg() {
    return global.VT_BILLING_CONFIG || {};
  }

  function read() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  function write(state) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(state));
    } catch {
      /* private mode */
    }
  }

  function detectRegion() {
    try {
      const lang = (navigator.language || "en").toLowerCase();
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      if (tz.includes("Lima") || lang.endsWith("-pe") || lang === "es-pe") return "PE";
      if (tz.includes("Mexico") || lang.endsWith("-mx")) return "MX";
      if (tz.includes("Buenos_Aires") || lang.endsWith("-ar")) return "AR";
      if (tz.includes("Santiago") || lang.endsWith("-cl")) return "CL";
      if (tz.includes("Bogota") || lang.endsWith("-co")) return "CO";
      if (tz.includes("Sao_Paulo") || lang.endsWith("-br")) return "BR";
      if (lang.endsWith("-es") || tz.includes("Madrid")) return "ES";
      if (lang.endsWith("-gb") || tz.includes("London")) return "GB";
      if (lang.endsWith("-de") || tz.includes("Berlin")) return "DE";
      if (lang.endsWith("-fr") || tz.includes("Paris")) return "FR";
      if (lang.endsWith("-it") || tz.includes("Rome")) return "IT";
      if (
        lang.endsWith("-us") ||
        tz.includes("New_York") ||
        tz.includes("Los_Angeles") ||
        tz.includes("Chicago")
      )
        return "US";
      if (lang.endsWith("-ca") || tz.includes("Toronto") || tz.includes("Vancouver")) return "CA";
      if (lang.endsWith("-au") || tz.includes("Sydney") || tz.includes("Melbourne")) return "AU";
      if (lang.endsWith("-ph") || tz.includes("Manila")) return "PH";
      if (lang.endsWith("-in") || tz.includes("Kolkata") || tz.includes("Calcutta")) return "IN";
      if (lang.startsWith("es")) return "PE";
      return "WW";
    } catch {
      return "WW";
    }
  }

  function marketFor(code) {
    const m = (cfg().markets || []).find((x) => x.code === code);
    return m || { code: "WW", name: "Worldwide", currency: "USD", rail: "stripe", priority: 3 };
  }

  function preferredRail(region) {
    const m = marketFor(region);
    return m.rail === "mercadopago" ? "mercadopago" : "stripe";
  }

  function nowMs() {
    return Date.now();
  }

  function trialRequiresOptIn() {
    return cfg().trialRequiresOptIn !== false;
  }

  function trialStartedAt() {
    try {
      return localStorage.getItem(TRIAL_KEY);
    } catch {
      return null;
    }
  }

  /**
   * Trial clock. With `trialRequiresOptIn` (the default) it only starts when the
   * visitor asks for it — otherwise every fresh browser would silently be Pro.
   * @param {boolean} [start] start the clock when it has never run
   * @returns {string|null} ISO start time, or null while unstarted
   */
  function ensureTrial(start) {
    let started = trialStartedAt();
    if (!started && (start === true || !trialRequiresOptIn())) {
      started = new Date().toISOString();
      try {
        localStorage.setItem(TRIAL_KEY, started);
      } catch {
        /* ignore */
      }
    }
    return started;
  }

  /** True when a checkout is still waiting on its license and can be retried. */
  function hasPendingClaim() {
    const st = read();
    return !!(st && (st.status === "pending" || st.status === "unclaimed") && st.sessionId);
  }

  /** True when this browser still has its one free trial. */
  function canStartTrial() {
    return Number(cfg().freeTrialDays || 0) > 0 && !trialStartedAt();
  }

  /**
   * Start the local free trial (explicit opt-in).
   * @returns {{ ok: boolean, reason?: string, endsAt?: string|null }}
   */
  function startTrial() {
    if (!Number(cfg().freeTrialDays || 0)) return { ok: false, reason: "disabled" };
    if (trialStartedAt()) {
      return trialActive()
        ? { ok: true, reason: "already_active", endsAt: trialEndsAt() }
        : { ok: false, reason: "used" };
    }
    ensureTrial(true);
    emit();
    return { ok: true, endsAt: trialEndsAt() };
  }

  function trialActive() {
    const days = Number(cfg().freeTrialDays || 0);
    if (!days) return false;
    const started = ensureTrial();
    if (!started) return false;
    const t0 = Date.parse(started);
    if (!Number.isFinite(t0)) return false;
    return nowMs() < t0 + days * 86400000;
  }

  function trialEndsAt() {
    const days = Number(cfg().freeTrialDays || 0);
    const started = ensureTrial();
    if (!started) return null;
    const t0 = Date.parse(started);
    if (!Number.isFinite(t0)) return null;
    return new Date(t0 + days * 86400000).toISOString();
  }

  function trialDaysLeft() {
    if (!trialActive()) return 0;
    const end = trialEndsAt();
    if (!end) return 0;
    return Math.max(0, Math.ceil((Date.parse(end) - nowMs()) / 86400000));
  }

  /** Server verification is the rule unless an operator deliberately turns it off. */
  function verificationRequired() {
    return (cfg().verification || {}).required !== false;
  }

  /** True once the entitlements worker URL and its public key are both configured. */
  function verificationConfigured() {
    try {
      return !!global.VTLicense?.isConfigured?.();
    } catch {
      return false;
    }
  }

  /** QA-only switch: demo / internal-account Pro without payment. Off in public builds. */
  function localOverridesAllowed() {
    return !!cfg().demoUnlockEnabled;
  }

  /** Verified license claims from the entitlements worker, or null. */
  function licenseClaims() {
    try {
      const claims = global.VTLicense?.getClaims?.() || null;
      if (!claims) return null;
      return PLAN_IDS.has(claims.plan) && claims.plan !== "trial" ? claims : null;
    } catch {
      return null;
    }
  }

  function getLicenseStatus() {
    try {
      return global.VTLicense?.getStatus?.() || null;
    } catch {
      return null;
    }
  }

  /**
   * Active entitlement, in priority order:
   *   1. a server-signed license — the only thing that counts as paid
   *   2. a QA override (demo / internal account) while demoUnlockEnabled is on
   *   3. an opted-in local trial
   *   4. free — including a stored "paid" record we could not verify
   * @returns {{ tier: string, plan: string, source: string, pro: boolean, status: string }}
   */
  function getEntitlement() {
    const st = read();
    const claims = licenseClaims();
    if (claims) {
      return {
        tier: "pro",
        plan: claims.plan,
        source: "license",
        pro: true,
        status: "active",
        // "past_due" / "canceled" still carry access to the end of the paid
        // period; the token's own expiry is what ends it.
        licenseStatus: claims.status,
        verified: true,
        provider: claims.provider || st?.provider || null,
        region: st?.region || detectRegion(),
        expiresAt: claims.periodEnd ? new Date(claims.periodEnd * 1000).toISOString() : null,
        licenseExpiresAt: claims.exp ? new Date(claims.exp * 1000).toISOString() : null,
        sessionId: st?.sessionId || null,
        raw: st
      };
    }

    const active = st && st.status === "active" && st.plan && st.plan !== "free" ? st : null;
    const expired = !!(active && active.expiresAt && Date.parse(active.expiresAt) < nowMs());

    if (active && !expired && OVERRIDE_SOURCES.has(active.source) && localOverridesAllowed()) {
      return {
        tier: "pro",
        plan: active.plan,
        source: active.source,
        pro: true,
        status: "active",
        verified: false,
        provider: active.provider || null,
        region: active.region || detectRegion(),
        expiresAt: active.expiresAt || null,
        raw: active
      };
    }

    if (active && !expired && !verificationRequired()) {
      // Operator opted out of server checks: the local record is taken at face
      // value, forgeable and all. Off by default.
      return {
        tier: "pro",
        plan: active.plan,
        source: active.source || "paid",
        pro: true,
        status: "active",
        verified: !!active.verified,
        provider: active.provider || null,
        region: active.region || detectRegion(),
        expiresAt: active.expiresAt || null,
        sessionId: active.sessionId || null,
        raw: active
      };
    }

    if (trialActive()) {
      return {
        tier: "pro",
        plan: "trial",
        source: "trial",
        pro: true,
        status: "trial",
        verified: false,
        expiresAt: trialEndsAt(),
        raw: st
      };
    }

    if (expired) {
      return { tier: "free", plan: "free", source: "expired", pro: false, status: "expired", raw: st };
    }

    // A paid-looking local record with no verified license behind it.
    const unverified = active && !OVERRIDE_SOURCES.has(active.source);
    if (unverified || st?.status === "pending" || st?.status === "unclaimed") {
      const licenseState = getLicenseStatus()?.state;
      const waiting =
        st?.status !== "unclaimed" && (licenseState === "checking" || st?.status === "pending");
      return {
        tier: "free",
        plan: "free",
        source: (st && st.source) || "checkout_return",
        pro: false,
        status: waiting ? "pending" : "unverified",
        verified: false,
        awaitingVerification: !!waiting,
        plannedPlan: (st && st.plan) || null,
        raw: st
      };
    }

    if (active && OVERRIDE_SOURCES.has(active.source)) {
      return {
        tier: "free",
        plan: "free",
        source: active.source === "demo" ? "demo_disabled" : "override_disabled",
        pro: false,
        status: "free",
        raw: st
      };
    }

    return {
      tier: "free",
      plan: "free",
      source: "none",
      pro: false,
      status: "free",
      raw: st
    };
  }

  function isPro() {
    return !!getEntitlement().pro;
  }

  function activate(planId, meta) {
    const plan = planId || "pro_monthly";
    const safePlan = PLAN_IDS.has(plan) ? plan : "pro_monthly";
    const region = (meta && meta.region) || detectRegion();
    let provider = (meta && meta.provider) || preferredRail(region);
    if (!PROVIDER_IDS.has(provider)) provider = preferredRail(region);
    const source = (meta && meta.source) || "paid";
    const state = {
      status: "active",
      plan: safePlan,
      provider,
      region,
      source,
      activatedAt: new Date().toISOString(),
      expiresAt: meta && meta.expiresAt ? meta.expiresAt : null,
      sessionId: meta && meta.sessionId ? String(meta.sessionId).slice(0, 128) : null,
      verified: !!(meta && meta.verified)
    };
    if (!state.expiresAt && (source === "internal_account" || source === "demo")) {
      state.expiresAt = new Date(nowMs() + 365 * 86400000).toISOString();
    } else if (!state.expiresAt && safePlan === "pro_yearly") {
      state.expiresAt = new Date(nowMs() + 365 * 86400000).toISOString();
    } else if (!state.expiresAt && safePlan === "pro_monthly") {
      state.expiresAt = new Date(nowMs() + 31 * 86400000).toISOString();
    }
    write(state);
    emit();
    return state;
  }

  /** QA unlock. No-op unless demoUnlockEnabled is on, which public builds do not set. */
  function activateDemo(planId) {
    if (!cfg().demoUnlockEnabled) return null;
    return activate(planId || "pro_monthly", { source: "demo", provider: "demo" });
  }

  function clearEntitlement() {
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
    try {
      global.VTLicense?.clear?.();
    } catch {
      /* ignore */
    }
    emit();
  }

  /** True if at least one paid plan has a non-empty checkout link for a rail. */
  function linksConfigured(providerId) {
    const c = cfg();
    const rails = providerId
      ? [providerId]
      : Object.keys(c.providers || {});
    for (const rail of rails) {
      const links = (c.providers || {})[rail]?.links || {};
      if (String(links.pro_monthly || "").trim() || String(links.pro_yearly || "").trim()) {
        return true;
      }
    }
    return false;
  }

  /**
   * Production readiness checklist for operators / health UI.
   * @returns {{ ok: boolean, demoUnlock: boolean, links: boolean, issues: string[] }}
   */
  function getBillingHealth() {
    const c = cfg();
    const issues = [];
    const demoUnlock = !!c.demoUnlockEnabled;
    const links = linksConfigured();
    if (demoUnlock) issues.push("demoUnlockEnabled is true — disable before real revenue");
    if (!links) issues.push("No Payment Link / MP checkout URLs configured");
    const stripeEmpty =
      !String(c.providers?.stripe?.links?.pro_monthly || "").trim() &&
      !String(c.providers?.stripe?.links?.pro_yearly || "").trim();
    const mpEmpty =
      !String(c.providers?.mercadopago?.links?.pro_monthly || "").trim() &&
      !String(c.providers?.mercadopago?.links?.pro_yearly || "").trim();
    if (stripeEmpty) issues.push("Stripe links empty");
    if (mpEmpty) issues.push("Mercado Pago links empty");
    const portalRaw = String(c.customerPortalUrl || "").trim();
    let portalOk = false;
    if (portalRaw) {
      // Portal hosts are billing.stripe.com (not checkout hosts)
      portalOk = isPortalUrl(portalRaw);
      if (!portalOk) issues.push("customerPortalUrl host not recognized (expect billing.stripe.com)");
    } else {
      issues.push("customerPortalUrl empty — customers cannot self-serve cancel/update");
    }
    const verifyRequired = verificationRequired();
    const verifyReady = verificationConfigured();
    if (!verifyRequired) {
      issues.push("verification.required is false — entitlements are forgeable");
    } else if (!verifyReady) {
      issues.push(
        "Entitlement worker not configured (verification.apiBaseUrl / publicKeyJwk) — checkout stays closed"
      );
    }
    // ok = safe to take real money: links live, demo off, entitlements server-checked.
    // productionReady = ok + portal for self-serve cancel (Stripe).
    const ok = !demoUnlock && links && verifyRequired && verifyReady;
    return {
      ok,
      productionReady: ok && portalOk,
      demoUnlock,
      links,
      verificationRequired: verifyRequired,
      verificationConfigured: verifyReady,
      stripeConfigured: !stripeEmpty,
      mercadopagoConfigured: !mpEmpty,
      portalConfigured: portalOk,
      issues
    };
  }

  function isPortalUrl(url) {
    try {
      const u = new URL(String(url).trim());
      if (u.protocol !== "https:") return false;
      const h = u.hostname.toLowerCase();
      return (
        h === "billing.stripe.com" ||
        h.endsWith(".billing.stripe.com") ||
        h === "billing.stripe.me" ||
        // some portal login links
        (h.includes("stripe.com") && u.pathname.includes("billing"))
      );
    } catch {
      return false;
    }
  }

  /**
   * Open Stripe Customer Portal (no-code link or API session URL).
   * @see https://docs.stripe.com/customer-management
   */
  function openCustomerPortal() {
    const raw = String(cfg().customerPortalUrl || "").trim();
    if (!raw) {
      return {
        ok: false,
        mode: "unconfigured",
        message: null // app maps mode → i18n pricing.toast.portalUnconfigured
      };
    }
    if (!isPortalUrl(raw)) {
      return { ok: false, mode: "invalid_url", message: null };
    }
    window.open(raw, "_blank", "noopener,noreferrer");
    return { ok: true, mode: "redirect", url: raw };
  }

  function allowedHosts() {
    const extra = cfg().allowedCheckoutHosts;
    if (Array.isArray(extra) && extra.length) {
      return extra.map((h) => String(h).toLowerCase());
    }
    return DEFAULT_CHECKOUT_HOSTS.slice();
  }

  /**
   * Validate checkout URL host against allowlist (open-redirect defense).
   * @returns {{ ok: boolean, url?: string, reason?: string }}
   */
  function validateCheckoutUrl(url) {
    if (!url || !String(url).trim()) return { ok: false, reason: "empty" };
    let u;
    try {
      u = new URL(String(url).trim());
    } catch {
      return { ok: false, reason: "invalid_url" };
    }
    if (u.protocol !== "https:") return { ok: false, reason: "not_https" };
    const host = u.hostname.toLowerCase();
    const allowed = allowedHosts();
    const match = allowed.some(
      (h) => host === h || host.endsWith("." + h)
    );
    if (!match) return { ok: false, reason: "host_not_allowed", host };
    return { ok: true, url: u.toString() };
  }

  function checkoutUrl(planId, providerId) {
    const c = cfg();
    const region = detectRegion();
    const rail = providerId || preferredRail(region);
    const prov = (c.providers || {})[rail];
    if (!prov) return null;
    const link = (prov.links || {})[planId];
    if (!link || !String(link).trim()) return null;
    const v = validateCheckoutUrl(link);
    if (!v.ok) {
      console.warn("[VTBilling] checkout URL rejected:", v.reason, link);
      return null;
    }
    return v.url;
  }

  function startCheckout(planId, providerId) {
    if (!PLAN_IDS.has(planId) || planId === "trial") {
      return { ok: false, mode: "invalid_plan", message: "Invalid plan id" };
    }
    const url = checkoutUrl(planId, providerId);
    if (url) {
      if (verificationRequired() && !verificationConfigured()) {
        // Never send someone to pay when we cannot turn that payment into a
        // verifiable entitlement — they would come back to a free account.
        return { ok: false, mode: "verification_unavailable", message: null };
      }
      try {
        sessionStorage.setItem(
          "vt_billing_intent",
          JSON.stringify({
            plan: planId,
            provider: providerId || preferredRail(detectRegion()),
            at: Date.now()
          })
        );
      } catch {
        /* ignore */
      }
      window.location.href = url;
      return { ok: true, mode: "redirect", url };
    }
    // Link missing or invalid
    if (cfg().demoUnlockEnabled) {
      activateDemo(planId);
      return { ok: true, mode: "demo", plan: planId };
    }
    return {
      ok: false,
      mode: "unconfigured",
      message:
        "Checkout isn’t available yet. Keep practicing free."
    };
  }

  /** How long we keep retrying a checkout whose webhook never showed up. */
  const PENDING_CLAIM_MAX_AGE_MS = 7 * 86400000;
  /**
   * Answers that mean "this checkout will never become a license": the payment
   * failed or the entitlement behind it is over. Anything else (a 202 while a
   * delayed payment settles, a network error) is worth retrying.
   */
  const TERMINAL_CLAIM_REASONS = new Set(["inactive", "not_found"]);

  /**
   * Ask the worker for the license behind a checkout, and store it on success.
   * @param {{plan: string, provider: string, sessionId: string}} intent
   * @returns {Promise<{ok: boolean, reason?: string, claims?: object}>}
   */
  function claimLicense(intent) {
    const plan = intent.plan;
    const provider = intent.provider;
    const sessionId = intent.sessionId;
    return global.VTLicense.claim({ provider, sessionId })
      .then((res) => {
        if (res.ok) {
          write({
            status: "active",
            plan: res.claims?.plan || plan,
            provider: res.claims?.provider || provider,
            region: detectRegion(),
            source: "license",
            activatedAt: new Date().toISOString(),
            expiresAt: res.claims?.periodEnd
              ? new Date(res.claims.periodEnd * 1000).toISOString()
              : null,
            sessionId: sessionId ? String(sessionId).slice(0, 128) : null,
            verified: true
          });
        }
        if (!res.ok && TERMINAL_CLAIM_REASONS.has(res.reason)) {
          const st = read();
          if (st && (st.status === "pending" || st.status === "unclaimed")) {
            write({ ...st, status: "unclaimed", claimReason: res.reason });
          }
        }
        emit();
        return res;
      })
      .catch(() => {
        emit();
        return { ok: false, reason: "error" };
      });
  }

  /**
   * Pick up a checkout whose license never arrived. The webhook can land after
   * the return page has given up (or while the customer was offline), and the
   * URL parameters are gone by then — so the pending record is what we retry
   * from, on every load, until it succeeds or gets too old to be worth it.
   * @returns {Promise<{ok: boolean, reason?: string}>|null}
   */
  function resumePendingClaim(options) {
    const force = !!(options && options.force);
    const st = read();
    const claimable = st && (st.status === "pending" || (force && st.status === "unclaimed"));
    if (!claimable || !st.sessionId || !st.provider) return null;
    if (!verificationRequired() || !verificationConfigured()) return null;
    if (licenseClaims()) {
      // A license already landed; the pending record is stale bookkeeping.
      write({ ...st, status: "superseded" });
      return null;
    }
    const startedAt = Date.parse(st.activatedAt || "");
    if (!force && Number.isFinite(startedAt) && nowMs() - startedAt > PENDING_CLAIM_MAX_AGE_MS) {
      // Stop retrying forever; the UI drops to "not confirmed" and the customer
      // can contact support with their receipt.
      write({ ...st, status: "unclaimed" });
      emit();
      return null;
    }
    return claimLicense({ plan: st.plan, provider: st.provider, sessionId: st.sessionId });
  }

  /**
   * Parse return from hosted checkout.
   * Soft entitlement: GH Pages cannot verify Stripe secrets client-side.
   * When demoUnlockEnabled is false, require a session_id or payment_id query param
   * so casual ?billing=success forges are less trivial (still not cryptographic).
   *
   * @see https://docs.stripe.com/payment-links
   * @see https://docs.stripe.com/webhooks — hard verification path
   */
  function handleReturnFromCheckout() {
    let params;
    try {
      params = new URLSearchParams(window.location.search);
    } catch {
      return null;
    }
    const billing = params.get("billing");
    if (!billing) return null;

    if (billing === "cancel") {
      cleanUrlParams();
      return { event: "cancel" };
    }
    if (billing === "success") {
      let plan = params.get("plan") || "pro_monthly";
      if (!PLAN_IDS.has(plan) || plan === "trial") plan = "pro_monthly";
      let provider = params.get("provider") || preferredRail(detectRegion());
      if (!PROVIDER_IDS.has(provider)) provider = preferredRail(detectRegion());
      const sessionId =
        params.get("session_id") ||
        params.get("payment_id") ||
        params.get("preapproval_id") ||
        null;

      try {
        const intent = JSON.parse(sessionStorage.getItem("vt_billing_intent") || "null");
        if (intent?.plan && PLAN_IDS.has(intent.plan)) plan = intent.plan;
        if (intent?.provider && PROVIDER_IDS.has(intent.provider)) provider = intent.provider;
        sessionStorage.removeItem("vt_billing_intent");
      } catch {
        /* ignore */
      }

      // Production-ish guard: without demo mode, require a provider session id
      const strict = cfg().demoUnlockEnabled === false;
      const requireSession = cfg().requireCheckoutSessionId !== false && strict;
      if (requireSession && !sessionId) {
        cleanUrlParams();
        return {
          event: "error",
          reason: "missing_session",
          message: null // app maps → i18n pricing.toast.checkoutError
        };
      }

      if (!verificationRequired()) {
        // Operator opted out of server checks: legacy soft (forgeable) activation.
        activate(plan, { provider, source: "checkout_return", sessionId, verified: false });
        cleanUrlParams();
        return { event: "success", plan, provider, sessionId, soft: true, verified: false };
      }

      // The return URL proves nothing. Record the intent, then ask the worker for
      // a signed license — Pro turns on only when that signature verifies.
      write({
        status: "pending",
        plan,
        provider,
        region: detectRegion(),
        source: "checkout_return",
        activatedAt: new Date().toISOString(),
        expiresAt: null,
        sessionId: sessionId ? String(sessionId).slice(0, 128) : null,
        verified: false
      });
      const claiming = verificationConfigured()
        ? claimLicense({ plan, provider, sessionId })
        : null;
      emit();
      cleanUrlParams();
      return {
        event: "success",
        plan,
        provider,
        sessionId,
        soft: false,
        verified: false,
        pendingVerification: true,
        claiming
      };
    }
    return null;
  }

  function cleanUrlParams() {
    try {
      const u = new URL(window.location.href);
      [
        "billing",
        "plan",
        "provider",
        "session_id",
        "payment_id",
        "preapproval_id",
        // Mercado Pago / Checkout Pro common return params
        "collection_id",
        "collection_status",
        "payment_type",
        "merchant_order_id",
        "preference_id",
        "status",
        "external_reference",
        "site_id",
        "processing_mode",
        "merchant_account_id"
      ].forEach((k) => u.searchParams.delete(k));
      window.history.replaceState({}, "", u.pathname + u.search + u.hash);
    } catch {
      /* ignore */
    }
  }

  /**
   * Money as a person writes it: a whole number stays whole, anything else gets
   * both decimals. Interpolating the raw number prints "S/ 19.9" for a price of
   * 19.90, which reads as a typo on a page asking somebody to pay.
   *
   * @param {number} n
   * @returns {string}
   */
  function money(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(2);
  }

  function formatPrice(plan, region) {
    const m = marketFor(region || detectRegion());
    const cur = m.currency || "USD";
    if (plan.priceUsd === 0) return { text: "0", currency: cur };
    if (cur === "PEN" && plan.pricePen != null) {
      return { text: `S/ ${money(plan.pricePen)}`, currency: "PEN", amount: plan.pricePen };
    }
    if (cur === "EUR" && plan.priceEur != null) {
      return { text: `€${money(plan.priceEur)}`, currency: "EUR", amount: plan.priceEur };
    }
    return { text: `$${money(plan.priceUsd)}`, currency: "USD", amount: plan.priceUsd };
  }

  /**
   * How much the yearly plan saves against twelve monthly charges, as a whole
   * percent, in the currency actually on screen.
   *
   * This is derived rather than written down because a hard-coded badge drifts
   * the moment a price moves: the shipped one said 20% while the real figure
   * was 34%, which was wrong and undersold the plan at the same time.
   *
   * @param {Array} plans
   * @param {string} [region]
   * @returns {number|null} whole percent saved, or null when there is nothing to claim
   */
  function annualSavingPct(plans, region) {
    const list = Array.isArray(plans) ? plans : [];
    const monthly = list.find((p) => p && p.interval === "month");
    const yearly = list.find((p) => p && p.interval === "year");
    if (!monthly || !yearly) return null;
    const m = formatPrice(monthly, region).amount;
    const y = formatPrice(yearly, region).amount;
    if (!(m > 0) || !(y > 0)) return null;
    const pct = Math.round((1 - y / (m * 12)) * 100);
    return pct > 0 ? pct : null;
  }

  const listeners = new Set();
  function onChange(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  }
  function emit() {
    const e = getEntitlement();
    listeners.forEach((fn) => {
      try {
        fn(e);
      } catch (err) {
        console.warn(err);
      }
    });
  }

  /** Feature flags for soft Pro gates */
  function can(feature) {
    const pro = isPro();
    const free = {
      all_exercises: true,
      pitch_highway: true,
      local_record: true,
      basic_plan: true,
      value_pulse: true,
      export_progress: false,
      multi_profile: false,
      pro_insights: false,
      coach_pack: false,
      studio_goals: false,
      pro_progressions: false,
      achievements_export: false,
      extra_reminders: false,
      extra_freezes: false,
      priority_progressions: false,
      no_limits: false,
      lesson_anchor: false,
      yearly_savings: false,
      ad_free: false,
      all_free: true,
      all_pro_monthly: pro
    };
    const map = {
      ...free,
      export_progress: pro,
      multi_profile: pro,
      pro_insights: pro,
      coach_pack: pro,
      studio_goals: pro,
      pro_progressions: pro,
      achievements_export: pro,
      extra_reminders: pro,
      extra_freezes: pro,
      priority_progressions: pro,
      no_limits: pro,
      lesson_anchor: pro,
      yearly_savings: pro,
      ad_free: pro
    };
    return !!map[feature];
  }

  function exportProgressJson() {
    if (!can("export_progress")) return null;
    const pulse =
      typeof global.VTValuePulse?.compute === "function" ? global.VTValuePulse.compute() : null;
    const isEs =
      (global.VTI18n && global.VTI18n.lang === "es") ||
      (typeof document !== "undefined" && (document.documentElement.lang || "").startsWith("es"));
    const narrative =
      typeof global.VTValuePulse?.narrative === "function"
        ? global.VTValuePulse.narrative(pulse, isEs)
        : null;
    try {
      const flags = global.VTStorage?.getAchievementFlags?.() || {};
      flags.exported = true;
      global.VTStorage?.setAchievementFlags?.(flags);
    } catch {
      /* ignore */
    }
    const achievements =
      typeof global.VTValuePulse?.achievements === "function"
        ? global.VTValuePulse.achievements(pulse)
        : [];
    const coachFocus =
      typeof global.VTValuePulse?.coachFocus === "function"
        ? global.VTValuePulse.coachFocus(pulse, isEs)
        : null;
    const payload = {
      exportedAt: new Date().toISOString(),
      product: "Vocal Studio Pro",
      profile: global.VTStorage?.getActiveProfile?.() || null,
      entitlement: getEntitlement(),
      valuePulse: pulse,
      coachSummary: narrative,
      coachFocus,
      achievements,
      goals: global.VTStorage?.getGoals?.() || null,
      progress: global.VTStorage?.getProgress?.() || {},
      holdLogs: global.VTStorage?.getHoldLogs?.() || [],
      weekPlan: global.VTStorage?.getWeekPlan?.() || null,
      settings: global.VTStorage?.getSettings?.() || {}
    };
    return JSON.stringify(payload, null, 2);
  }

  // No auto-start: the trial clock only runs once the visitor opts in (startTrial).
  // A license landing, refreshing or being revoked moves the entitlement.
  // A paid checkout whose webhook was slow must not strand the customer, but
  // wait for the stored token to be checked first so we do not claim twice.
  let resumeAttempted = false;
  function maybeResumePendingClaim() {
    if (resumeAttempted) return;
    if (getLicenseStatus()?.state === "checking") return;
    resumeAttempted = true;
    try {
      resumePendingClaim();
    } catch {
      /* ignore */
    }
  }
  try {
    global.VTLicense?.onChange?.(() => {
      emit();
      maybeResumePendingClaim();
    });
  } catch {
    /* ignore */
  }
  maybeResumePendingClaim();

  global.VTBilling = {
    cfg,
    detectRegion,
    marketFor,
    preferredRail,
    getEntitlement,
    isPro,
    can,
    activate,
    activateDemo,
    clearEntitlement,
    startCheckout,
    checkoutUrl,
    validateCheckoutUrl,
    linksConfigured,
    getBillingHealth,
    handleReturnFromCheckout,
    resumePendingClaim,
    hasPendingClaim,
    formatPrice,
    annualSavingPct,
    exportProgressJson,
    onChange,
    trialEndsAt,
    trialActive,
    trialDaysLeft,
    trialStartedAt,
    canStartTrial,
    startTrial,
    verificationRequired,
    verificationConfigured,
    getLicenseStatus,
    refreshLicense: () => global.VTLicense?.refresh?.() || Promise.resolve({ ok: false }),
    DEFAULT_CHECKOUT_HOSTS,
    openCustomerPortal,
    isPortalUrl
  };
})(window);
