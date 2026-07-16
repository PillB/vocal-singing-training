/**
 * Subscription / entitlement layer for static GitHub Pages deploy.
 * Rails: Stripe Payment Links (global) + Mercado Pago (Peru/LATAM).
 * Entitlements stored locally; optional webhook backend can re-verify later.
 */
(function (global) {
  "use strict";

  const LS_KEY = "vt_billing_v1";
  const TRIAL_KEY = "vt_billing_trial_started_v1";

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
      if (lang.endsWith("-us") || tz.includes("New_York") || tz.includes("Los_Angeles") || tz.includes("Chicago"))
        return "US";
      if (lang.endsWith("-ca") || tz.includes("Toronto") || tz.includes("Vancouver")) return "CA";
      if (lang.endsWith("-au") || tz.includes("Sydney") || tz.includes("Melbourne")) return "AU";
      if (lang.endsWith("-ph") || tz.includes("Manila")) return "PH";
      if (lang.endsWith("-in") || tz.includes("Kolkata") || tz.includes("Calcutta")) return "IN";
      // Spanish default without country → LATAM-friendly PE rail preference
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
      return {
        tier: "pro",
        plan: st.plan,
        source: st.source || "paid",
        pro: true,
        status: "active",
        provider: st.provider || null,
        region: st.region || detectRegion(),
        expiresAt: st.expiresAt || null,
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
    // Only allow known plan ids (open-redirect / injection hygiene)
    const allowed = new Set(["pro_monthly", "pro_yearly", "trial"]);
    const safePlan = allowed.has(plan) ? plan : "pro_monthly";
    const region = (meta && meta.region) || detectRegion();
    const provider = (meta && meta.provider) || preferredRail(region);
    const source = (meta && meta.source) || "paid";
    const state = {
      status: "active",
      plan: safePlan,
      provider,
      region,
      source,
      activatedAt: new Date().toISOString(),
      expiresAt: meta && meta.expiresAt ? meta.expiresAt : null,
      sessionId: meta && meta.sessionId ? String(meta.sessionId).slice(0, 128) : null
    };
    // Internal accounts / demo: long-lived soft expiry
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

  function checkoutUrl(planId, providerId) {
    const c = cfg();
    const region = detectRegion();
    const rail = providerId || preferredRail(region);
    const prov = (c.providers || {})[rail];
    if (!prov) return null;
    const link = (prov.links || {})[planId];
    if (link && String(link).trim()) return String(link).trim();
    return null;
  }

  function startCheckout(planId, providerId) {
    const url = checkoutUrl(planId, providerId);
    if (url) {
      // Remember intent for return URL without session_id
      try {
        sessionStorage.setItem(
          "vt_billing_intent",
          JSON.stringify({ plan: planId, provider: providerId || preferredRail(detectRegion()), at: Date.now() })
        );
      } catch {
        /* ignore */
      }
      window.location.href = url;
      return { ok: true, mode: "redirect", url };
    }
    // No live link yet — demo path if allowed
    if (cfg().demoUnlockEnabled) {
      activateDemo(planId);
      return { ok: true, mode: "demo", plan: planId };
    }
    return {
      ok: false,
      mode: "unconfigured",
      message:
        "Payment links not configured yet. Add Stripe/Mercado Pago URLs in js/billing-config.js (see docs/10-SUBSCRIPTIONS.md)."
    };
  }

  /**
   * Parse return from Checkout:
   * ?billing=success&plan=pro_monthly&provider=stripe&session_id=cs_test_...
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
      let provider = params.get("provider") || preferredRail(detectRegion());
      const sessionId = params.get("session_id") || params.get("payment_id") || null;
      try {
        const intent = JSON.parse(sessionStorage.getItem("vt_billing_intent") || "null");
        if (intent?.plan) plan = intent.plan;
        if (intent?.provider) provider = intent.provider;
        sessionStorage.removeItem("vt_billing_intent");
      } catch {
        /* ignore */
      }
      activate(plan, { provider, source: "checkout_return", sessionId });
      cleanUrlParams();
      return { event: "success", plan, provider };
    }
    return null;
  }

  function cleanUrlParams() {
    try {
      const u = new URL(window.location.href);
      ["billing", "plan", "provider", "session_id", "payment_id"].forEach((k) => u.searchParams.delete(k));
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
      export_progress: false,
      multi_profile: false,
      pro_insights: false,
      priority_progressions: false,
      no_limits: false
    };
    const map = {
      ...free,
      export_progress: pro,
      multi_profile: pro,
      pro_insights: pro,
      priority_progressions: pro,
      no_limits: pro
    };
    return !!map[feature];
  }

  function exportProgressJson() {
    if (!can("export_progress")) return null;
    const payload = {
      exportedAt: new Date().toISOString(),
      entitlement: getEntitlement(),
      progress: global.VTStorage?.getProgress?.() || {},
      weekPlan: global.VTStorage?.getWeekPlan?.() || null,
      settings: global.VTStorage?.getSettings?.() || {}
    };
    return JSON.stringify(payload, null, 2);
  }

  // Start trial clock early
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
    handleReturnFromCheckout,
    formatPrice,
    exportProgressJson,
    onChange,
    trialEndsAt,
    trialActive
  };
})(window);
