/**
 * Subscription / entitlement layer for static GitHub Pages deploy.
 *
 * Architecture (current, non-deprecated):
 * - Checkout: Stripe Payment Links + Mercado Pago subscription/checkout links
 *   (no card data on origin — PCI SAQ-A). Official: https://docs.stripe.com/payment-links
 * - Soft entitlement: localStorage (browser-scoped). Suitable for early revenue on
 *   static hosts; NOT a hard anti-piracy control.
 * - Hard verification (recommended at scale): serverless webhook verifies
 *   Stripe-Signature, then issues/stores license. Template: workers/stripe-webhook/
 *
 * Security notes:
 * - Never put secret keys in client JS.
 * - Return-URL activation is soft; forgeable without server verification.
 * - When demoUnlockEnabled is false, require session_id/payment_id on success return
 *   (still soft — pair with webhooks for production trust).
 */
(function (global) {
  "use strict";

  const LS_KEY = "vt_billing_v1";
  const TRIAL_KEY = "vt_billing_trial_started_v1";
  const PLAN_IDS = new Set(["pro_monthly", "pro_yearly", "trial"]);
  const PROVIDER_IDS = new Set(["stripe", "mercadopago", "demo", "internal"]);

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

  function ensureTrial() {
    let started = null;
    try {
      started = localStorage.getItem(TRIAL_KEY);
    } catch {
      started = null;
    }
    if (!started) {
      started = new Date().toISOString();
      try {
        localStorage.setItem(TRIAL_KEY, started);
      } catch {
        /* ignore */
      }
    }
    return started;
  }

  function trialActive() {
    const days = Number(cfg().freeTrialDays || 0);
    if (!days) return false;
    const started = ensureTrial();
    const t0 = Date.parse(started);
    if (!Number.isFinite(t0)) return false;
    const end = t0 + days * 86400000;
    return nowMs() < end;
  }

  function trialEndsAt() {
    const days = Number(cfg().freeTrialDays || 0);
    const started = ensureTrial();
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

  /**
   * Active entitlement: paid | trial | demo | free
   */
  function getEntitlement() {
    const st = read();
    if (st && st.status === "active" && st.plan && st.plan !== "free") {
      if (st.expiresAt && Date.parse(st.expiresAt) < nowMs()) {
        return {
          tier: "free",
          plan: "free",
          source: "expired",
          pro: false,
          status: "expired",
          raw: st
        };
      }
      // Demo only when flag still enabled
      if (st.source === "demo" && !cfg().demoUnlockEnabled) {
        return {
          tier: "free",
          plan: "free",
          source: "demo_disabled",
          pro: false,
          status: "free",
          raw: st
        };
      }
      return {
        tier: "pro",
        plan: st.plan,
        source: st.source || "paid",
        pro: true,
        status: st.source === "trial" ? "trial" : "active",
        provider: st.provider || null,
        region: st.region || detectRegion(),
        expiresAt: st.expiresAt || null,
        sessionId: st.sessionId || null,
        raw: st
      };
    }
    if (cfg().demoUnlockEnabled && st && st.source === "demo" && st.status === "active") {
      return {
        tier: "pro",
        plan: st.plan || "pro_monthly",
        source: "demo",
        pro: true,
        status: "active",
        raw: st
      };
    }
    if (trialActive()) {
      return {
        tier: "pro",
        plan: "trial",
        source: "trial",
        pro: true,
        status: "trial",
        expiresAt: trialEndsAt(),
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
    return {
      ok: !demoUnlock && links,
      demoUnlock,
      links,
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
        message:
          "Customer portal URL not set. Activate no-code portal in Stripe Dashboard (Settings → Billing → Customer portal)."
      };
    }
    if (!isPortalUrl(raw)) {
      return { ok: false, mode: "invalid_url", message: "Portal URL host not allowlisted" };
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
        "Payment links not configured or URL host not allowlisted. See docs/10-SUBSCRIPTIONS.md."
    };
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
          message:
            "Checkout return missing session_id. Configure Payment Link success URL to append session_id, or enable webhooks."
        };
      }

      activate(plan, {
        provider,
        source: "checkout_return",
        sessionId,
        verified: false
      });
      cleanUrlParams();
      return { event: "success", plan, provider, sessionId, soft: true };
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
        "preapproval_id"
      ].forEach((k) => u.searchParams.delete(k));
      window.history.replaceState({}, "", u.pathname + u.search + u.hash);
    } catch {
      /* ignore */
    }
  }

  function formatPrice(plan, region) {
    const m = marketFor(region || detectRegion());
    const cur = m.currency || "USD";
    if (plan.priceUsd === 0) return { text: "0", currency: cur };
    if (cur === "PEN" && plan.pricePen != null) {
      return { text: `S/ ${plan.pricePen}`, currency: "PEN", amount: plan.pricePen };
    }
    if (cur === "EUR" && plan.priceEur != null) {
      return { text: `€${plan.priceEur}`, currency: "EUR", amount: plan.priceEur };
    }
    return { text: `$${plan.priceUsd}`, currency: "USD", amount: plan.priceUsd };
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
      yearly_savings: pro
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

  // Start trial clock early (local soft trial)
  ensureTrial();

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
    formatPrice,
    exportProgressJson,
    onChange,
    trialEndsAt,
    trialActive,
    trialDaysLeft,
    DEFAULT_CHECKOUT_HOSTS,
    openCustomerPortal,
    isPortalUrl
  };
})(window);
