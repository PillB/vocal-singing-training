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
  const PROVIDER_IDS = new Set(["stripe", "mercadopago", "creem", "demo", "internal", "auth"]);
  /**
   * The providers money can actually come in on. `PROVIDER_IDS` is wider: it
   * also holds the QA override sources and the account rail, none of which has
   * a checkout link, so a market must not be able to name one as its rail.
   */
  const CHECKOUT_RAILS = new Set(["stripe", "mercadopago", "creem"]);
  /** Sources that unlock Pro without payment — QA only, gated by demoUnlockEnabled. */
  const OVERRIDE_SOURCES = new Set(["demo", "internal_account"]);

  /** Default hosts allowed for checkout redirects (override via config.allowedCheckoutHosts). */
  const DEFAULT_CHECKOUT_HOSTS = [
    "buy.stripe.com",
    "checkout.stripe.com",
    // Creem, the merchant of record. The API returns checkout.creem.io/<id>;
    // a product's own share link from the dashboard is on creem.io, so both
    // are allowed. Anything else needs `allowedCheckoutHosts`.
    "checkout.creem.io",
    "www.creem.io",
    "creem.io",
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

  /**
   * The European Union's 27 member states (ISO 3166-1 alpha-2). The Creem
   * products charge them euros, VAT included, and every other market on that
   * rail US dollars, Europe outside the Union too (VG-85, decided 2026-11-22).
   */
  const EU_REGIONS = Object.freeze([
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR", "HU", "IE",
    "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE"
  ]);

  /**
   * Each member state's IANA time zones, with the state. The Canaries, Ceuta,
   * Madeira, the Azores and Åland are in the Union too, so their zones are here,
   * and so are France's outermost regions (French Guiana, Guadeloupe,
   * Martinique, Réunion, Mayotte and Saint-Martin: parts of a member state
   * under TFEU arts. 349 and 355(1), paying in euros; js/region-gate.js lists
   * the same zones). Left out with reason: Saint-Barthélemy, Saint-Pierre and
   * the Pacific territories, which are overseas countries outside the Union.
   * So are the three old link names a browser may still report for a member
   * state (js/region-gate.js lists them for the same reason): "Poland",
   * "Portugal" and "Eire" name a place, and without them an "en-US" browser
   * reporting "Poland" was read as American and shown dollars.
   */
  const EU_TIME_ZONES = new Map([
    ["Europe/Vienna", "AT"], ["Europe/Brussels", "BE"], ["Europe/Sofia", "BG"], ["Europe/Zagreb", "HR"],
    ["Europe/Nicosia", "CY"], ["Asia/Nicosia", "CY"], ["Asia/Famagusta", "CY"], ["Europe/Prague", "CZ"],
    ["Europe/Copenhagen", "DK"], ["Europe/Tallinn", "EE"], ["Europe/Helsinki", "FI"], ["Europe/Mariehamn", "FI"],
    ["Europe/Paris", "FR"], ["Europe/Berlin", "DE"], ["Europe/Busingen", "DE"], ["Europe/Athens", "GR"],
    ["Europe/Budapest", "HU"], ["Europe/Dublin", "IE"], ["Europe/Rome", "IT"], ["Europe/Riga", "LV"],
    ["Europe/Vilnius", "LT"], ["Europe/Luxembourg", "LU"], ["Europe/Malta", "MT"], ["Europe/Amsterdam", "NL"],
    ["Europe/Warsaw", "PL"], ["Europe/Lisbon", "PT"], ["Atlantic/Azores", "PT"], ["Atlantic/Madeira", "PT"],
    ["Europe/Bucharest", "RO"], ["Europe/Bratislava", "SK"], ["Europe/Ljubljana", "SI"], ["Europe/Madrid", "ES"],
    ["Atlantic/Canary", "ES"], ["Africa/Ceuta", "ES"], ["Europe/Stockholm", "SE"],
    ["America/Cayenne", "FR"], ["America/Guadeloupe", "FR"], ["America/Martinique", "FR"],
    ["Indian/Reunion", "FR"], ["Indian/Mayotte", "FR"], ["America/Marigot", "FR"],
    ["Poland", "PL"], ["Portugal", "PT"], ["Eire", "IE"]
  ]);

  /**
   * The region subtags of France's outermost regions, which ISO 3166 codes
   * apart from France: "fr-RE" is Réunion, a part of France and of the Union.
   */
  const EU_OUTERMOST_SUBTAGS = new Map([["GF", "FR"], ["GP", "FR"], ["MQ", "FR"], ["RE", "FR"], ["YT", "FR"], ["MF", "FR"]]);

  /**
   * The member state this browser is in, or "" when it is not in the Union.
   *
   * The time zone decides whenever it names a place, because it says where
   * the device is and so, more often than the language, where the card was
   * issued: a member state's zone is that state (an "en-US" browser in
   * Europe/Warsaw is Poland), and a zone anywhere else (London, Zurich, Lima,
   * New York) is outside the Union whatever the language says. Only a zone
   * that names no place, as UTC does in a hardened browser, "CET", or none at
   * all, leaves it to the language's region subtag: "pl-PL" is Poland, a bare
   * "pl" is nowhere in particular.
   * @param {string} lang Lower-case language tag, e.g. "de-at".
   * @param {string} tz IANA time zone, e.g. "Europe/Vienna".
   * @returns {string} Two-letter member state, or "".
   */
  function euRegion(lang, tz) {
    if (EU_TIME_ZONES.has(tz)) return EU_TIME_ZONES.get(tz);
    if (tz.includes("/") && !tz.startsWith("Etc/")) return "";
    const subtag = regionSubtag(lang);
    const region = EU_OUTERMOST_SUBTAGS.get(subtag) || subtag;
    return EU_REGIONS.includes(region) ? region : "";
  }

  /**
   * A language tag's region subtag, upper case, or "": "AT" in "de-at", "RS"
   * in "sr-latn-rs". It comes before any extension, so the "ca" of
   * "en-u-ca-gregory" (a calendar) is not Canada.
   * @param {string} lang Language tag.
   * @returns {string}
   */
  function regionSubtag(lang) {
    for (const part of String(lang || "").split(/[-_]/).slice(1)) {
      if (part.length === 1) return "";
      if (/^[a-z]{2}$/i.test(part)) return part.toUpperCase();
    }
    return "";
  }

  /**
   * The other markets a browser is read into, tried in this order after the
   * European Union: the first whose time zone contains one of its zone names,
   * or whose language ends in one of its region suffixes. A table rather than
   * a line per market, so detectRegion stays within the complexity ceiling
   * (it was 36, in the legacy baseline, and editing it drops the exemption).
   */
  const REGION_SIGNS = [
    ["PE", ["Lima"], ["-pe"]],
    ["MX", ["Mexico"], ["-mx"]],
    ["AR", ["Buenos_Aires"], ["-ar"]],
    ["CL", ["Santiago"], ["-cl"]],
    ["CO", ["Bogota"], ["-co"]],
    ["BR", ["Sao_Paulo"], ["-br"]],
    ["GB", ["London"], ["-gb"]],
    ["US", ["New_York", "Los_Angeles", "Chicago"], ["-us"]],
    ["CA", ["Toronto", "Vancouver"], ["-ca"]],
    ["AU", ["Sydney", "Melbourne"], ["-au"]],
    ["PH", ["Manila"], ["-ph"]],
    ["IN", ["Kolkata", "Calcutta"], ["-in"]]
  ];

  function detectRegion() {
    try {
      const lang = (navigator.language || "en").toLowerCase();
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
      // A Peruvian locale is Peru wherever the device is, before the Union's
      // time zones: it is a setting somebody chose, and Peru is the market
      // whose buyers must be shown soles (Ley 29571 art. 6) and can pay with
      // Mercado Pago. The price of it: a Peruvian living in Madrid who kept
      // es-PE is offered soles first, and the card rail in US$, not euros.
      if (lang.endsWith("-pe")) return "PE";
      const eu = euRegion(lang, tz);
      if (eu) return eu;
      const sign = REGION_SIGNS.find(([, zones, suffixes]) =>
        zones.some((zone) => tz.includes(zone)) || suffixes.some((suffix) => lang.endsWith(suffix)));
      if (sign) return sign[0];
      // Anything else is the worldwide market, Spanish locales too: Peru is
      // the Lima time zone or a Peruvian locale, never a whole language. The
      // catch-all that sent every other Spanish speaker to Peru told a buyer
      // in Montevideo or Quito "Tu región: Perú" and sold them the Peruvian
      // Mercado Pago plan by default (red team money-6).
      return "WW";
    } catch {
      return "WW";
    }
  }

  function marketFor(code) {
    const m = (cfg().markets || []).find((x) => x.code === code);
    return m || { code: "WW", name: "Worldwide", currency: "USD", rail: "creem", priority: 3 };
  }

  /**
   * The rail a region buys on. A market naming a rail money cannot arrive on —
   * a typo, a QA source, a rail removed from the config — falls back to Creem,
   * the merchant of record, rather than to a Stripe account a Peru-registered
   * seller cannot hold.
   * @param {string} region Two-letter region code.
   * @returns {string} Provider id.
   */
  function preferredRail(region) {
    const m = marketFor(region);
    return CHECKOUT_RAILS.has(m.rail) ? m.rail : "creem";
  }

  /**
   * The region whose prices a rail's cards show, and so the money a press on
   * that rail is charged in: the visitor's own on the visitor's own rail, and
   * on any other the rail's own money. A Peruvian who picks the card rail pays
   * Creem, which cannot charge soles; an Argentine who picks Mercado Pago pays
   * a Peruvian plan in soles. A rail sold in one country (its config
   * `regions`) is priced as there, any other at the worldwide dollar price.
   * Moved here from js/app.js so the checkout asks for the money the card
   * showed, read from the same function (VG-85).
   * @param {string} rail Provider id.
   * @param {string} [region] The visitor's region; the detected one when left out.
   * @returns {string} Region code.
   */
  function priceRegion(rail, region) {
    const own = region || detectRegion();
    if (rail === preferredRail(own)) return own;
    const regions = cfg().providers?.[rail]?.regions || [];
    return regions.length === 1 ? regions[0] : "WW";
  }

  /** The paid plans' ids, in config order. */
  function paidPlanIds() {
    return (cfg().plans || []).filter((p) => p.interval).map((p) => p.id);
  }

  /**
   * The rails the Pro dialog offers, the region's own first: every rail a
   * market sells on, each marked sellable when a paid plan has a checkout link
   * on it. Read from the markets rather than drawn as a fixed pair, because the
   * pair the dialog used to draw (Stripe and Mercado Pago) outlived the move to
   * Creem: its card button still chose "stripe", which no market sells on, so
   * pressing it turned a working checkout into "payments are not public yet",
   * and outside Peru neither button showed as the one in use.
   * @param {string} region Two-letter region code.
   * @returns {{rail: string, sellable: boolean}[]} In the order to draw them.
   */
  function checkoutRails(region) {
    const c = cfg();
    const named = (c.markets || []).map((m) => m.rail).filter((r) => CHECKOUT_RAILS.has(r) && railSellsIn(r, region));
    const paid = paidPlanIds();
    return [...new Set([preferredRail(region), ...named])].map((rail) => ({
      rail,
      sellable: apiCheckoutEnabled(rail) || paid.some((id) => !!checkoutUrl(id, rail))
    }));
  }

  /**
   * Whether a rail is offered to a buyer in `region` beside the region's own.
   * A rail whose provider lists the regions it sells in, without "WW"
   * (worldwide), sells only there: Mercado Pago's plans are a Peruvian seller
   * account's, in soles, paid with a Peruvian account or card, so its button
   * drawn for an Argentine offered a plan they could not pay (money-6). A
   * provider listing none, or "WW", sells everywhere; Creem's list names
   * where it is recommended first, and "WW".
   * @param {string} rail Provider id.
   * @param {string} region Two-letter region code.
   * @returns {boolean}
   */
  function railSellsIn(rail, region) {
    const regions = ((cfg().providers || {})[rail] || {}).regions;
    if (!Array.isArray(regions) || !regions.length || regions.includes("WW")) return true;
    return regions.includes(region);
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
    if (t0 > nowMs() + 300000) return false; // a start date in the future is not a start
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
  /**
   * What the account layer says about this browser, defensively.
   *
   * Null when this build has no account layer at all, which is not the same as
   * a signed-out visitor: a deployment without accounts must still be able to
   * take a payment the old way.
   * @returns {object|null} Account state, or null.
   */
  function accountState() {
    try {
      return global.VTAccount?.getState?.() || null;
    } catch {
      return null;
    }
  }

  /**
   * Which payment rails the worker says it can honour, or null when nobody has
   * asked yet. Read defensively: a build with no account layer has none of this.
   * @returns {object|null} `{stripe, mercadopago}` or null.
   */
  function accountRails() {
    try {
      return global.VTAccount?.knownRails?.() || null;
    } catch {
      return null;
    }
  }

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
      // A euro link sells as much as a dollar one (VG-85).
      if (["links", "linksEur"].some((table) => hasPaidLink((c.providers || {})[rail]?.[table]))) {
        return true;
      }
      // A rail whose checkouts the worker opens has no link to paste and is on
      // sale all the same: the terms, the health line and the pricing panel
      // must read it that way.
      if (apiCheckoutEnabled(rail)) return true;
    }
    return false;
  }

  /** Whether a table of links holds a link for either paid plan. */
  function hasPaidLink(links) {
    return !!links && (!!String(links.pro_monthly || "").trim() || !!String(links.pro_yearly || "").trim());
  }

  /**
   * Whether this build opens a rail's checkouts through the worker
   * (`POST /v1/me/checkout`), bound to the signed-in account, instead of
   * sending the buyer to a pasted payment link. Creem only: it is the one
   * rail whose create-checkout API the worker calls (VG-83). Ships false;
   * turning it on is the commit that opens sales on that rail.
   * @param {string} rail Provider id.
   * @returns {boolean}
   */
  function apiCheckoutEnabled(rail) {
    return rail === "creem" && cfg().providers?.creem?.apiCheckout === true;
  }

  /**
   * Whether the visitor could sign in from this browser right now, read the
   * way the account panel reads it (js/app.js accountSignIn): an emailed code,
   * or Google with a client id and a script that has not been refused. While
   * the worker has not said which methods it offers, the answer is yes, so
   * the gate holds rather than letting a payment through that sign-in could
   * have owned (VG-88).
   * @param {object} account `VTAccount.getState()`.
   * @returns {boolean}
   */
  function signInOffered(account) {
    const m = account && account.methods;
    if (!m || m.ok === false) return true;
    const google = !!m.google && !!m.googleClientId && account.googleReady !== false;
    return !!m.email || google;
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

  /**
   * A page the worker sends the buyer to on Creem's behalf, a bound checkout
   * or the customer portal: https on creem.io or one of its subdomains, with
   * no user name or password in it, the worker's own isCreemPageUrl rule, and
   * on the operator's checkout host list as well. validateCheckoutUrl alone is
   * the list for pasted links, which also holds every Stripe and Mercado Pago
   * checkout host, so a worker answer naming a payment page there was followed
   * from "Manage or cancel subscription" (red team round two, truth-6).
   * @returns {{ ok: boolean, url?: string, reason?: string }}
   */
  function validateCreemPageUrl(url) {
    const v = validateCheckoutUrl(url);
    if (!v.ok) return v;
    const u = new URL(v.url);
    const host = u.hostname.toLowerCase();
    if (u.username || u.password) return { ok: false, reason: "credentials" };
    if (host !== "creem.io" && !host.endsWith(".creem.io")) return { ok: false, reason: "not_creem", host };
    return v;
  }

  /**
   * A plan's pasted link on a rail, in the money its card shows: the euro
   * product's (`linksEur`) where the card shows €, else the rail's own. A
   * card in euros with no euro link has no link: the dollar one would charge
   * a price the card does not show (VG-85).
   */
  function checkoutUrl(planId, providerId) {
    const rail = providerId || preferredRail(detectRegion());
    const link = linkOf(planId, rail, checkoutCurrency(planId, rail));
    if (!link) return null;
    const v = validateCheckoutUrl(link);
    if (!v.ok) {
      console.warn("[VTBilling] checkout URL rejected:", v.reason, link);
      return null;
    }
    return v.url;
  }

  /**
   * A plan's link on a rail in a currency ("EUR" reads `linksEur`), trimmed
   * and not yet checked, or "".
   * @param {string} planId Plan.
   * @param {string} rail Provider id.
   * @param {string} currency "EUR", or anything else for the rail's own links.
   * @returns {string}
   */
  function linkOf(planId, rail, currency) {
    const prov = (cfg().providers || {})[rail] || {};
    const links = (currency === "EUR" ? prov.linksEur : prov.links) || {};
    return String(links[planId] || "").trim();
  }

  /**
   * The currency a press of a plan on a rail is charged in: the one its card
   * shows, read through the same two functions that drew the card.
   * @param {string} planId Plan.
   * @param {string} rail Provider id.
   * @returns {string} "USD", "EUR" or "PEN".
   */
  function checkoutCurrency(planId, rail) {
    const plan = (cfg().plans || []).find((p) => p.id === planId) || {};
    return formatPrice(plan, priceRegion(rail)).currency;
  }

  function startCheckout(planId, providerId) {
    if (!PLAN_IDS.has(planId) || planId === "trial") {
      return { ok: false, mode: "invalid_plan", message: "Invalid plan id" };
    }
    const viaWorker = workerCheckout(planId, providerId);
    if (viaWorker) return viaWorker;
    const url = checkoutUrl(planId, providerId);
    if (url) {
      const refusal = checkoutRefusal(planId, providerId);
      if (refusal) return refusal;
      rememberCheckoutIntent(planId, providerId);
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

  /**
   * The checkout the worker opens for the signed-in account, when this rail
   * is sold that way: a refusal now, or `mode: "opening"` with `done`, a
   * promise of the same shape `startCheckout` returns once the worker has
   * answered (it navigates on success). Null when the rail is not sold
   * through the worker, or when nobody is signed in and nobody can sign in
   * from this browser: then the pasted link, if there is one, is the way to
   * pay, and the licence is linked when they do sign in (VG-88).
   * @param {string} planId Plan.
   * @param {string|undefined} providerId Rail asked for, if any.
   * @returns {Object|null}
   */
  function workerCheckout(planId, providerId) {
    const rail = providerId || preferredRail(detectRegion());
    if (!apiCheckoutEnabled(rail)) return null;
    const account = accountState();
    if (!account || !account.configured) return null;
    if (!account.signedIn && !signInOffered(account) && checkoutUrl(planId, rail)) return null;
    const refusal = checkoutRefusal(planId, rail);
    if (refusal) return refusal;
    if (!account.signedIn) {
      // signInOffered is false and there is no link to fall back on.
      return { ok: false, mode: "signin_required", plan: planId, provider: rail };
    }
    const rails = accountRails();
    if (rails && rails.creemCheckout === false) {
      return { ok: false, mode: "provider_unavailable", plan: planId, provider: rail };
    }
    // One checkout at a time: a press while one is opening (the pricing panel
    // redrawn under the busy button) joins it rather than asking the worker
    // for a second checkout. In this page only (another tab has its own), and
    // for this sign-in only: one asked for by somebody who has since signed
    // out is not the next person's to join (red team authz-2).
    if (!checkoutOpening()) beginOpening(planId, rail);
    return { ok: true, mode: "opening", plan: workerOpening.plan, provider: workerOpening.provider, done: workerOpening.done };
  }

  /**
   * Ask the worker for the checkout, or go back to the one this page last
   * opened for the same choice, and hold every other press until it answers
   * or the page has had time to leave.
   */
  function beginOpening(planId, rail) {
    const done = reopenLastCheckout(planId, rail) || openWorkerCheckout(planId, rail);
    const entry = { plan: planId, provider: rail, done };
    workerOpening = entry;
    openingSession = sessionNow();
    done.then((out) => {
      // Navigating away holds it until the page has gone; anything else frees
      // the next press at once (the pressed button's own handler redraws it).
      if (out && out.mode === "redirect") holdWhileLeaving(entry);
      else releaseOpening(entry, false);
    });
  }

  /**
   * How long a page that was sent to the checkout may still be here before
   * the navigation counts as not having happened: Stop or Esc while the
   * checkout page loads on a slow phone, "Stay" on the page's own leave
   * prompt, an in-app browser that refuses the move. The page never learns of
   * any of those, and holding the plans until a reload left every Subscribe
   * dead (red team money-4, states-5). Generous, because the other mistake is
   * milder: a checkout slower than this gets its buttons back while it is
   * still loading, and a second press opens a second, unpaid checkout.
   */
  const LEAVE_GRACE_MS = 8000;

  /** After `location.assign`: let the hold go if the page is still here once LEAVE_GRACE_MS has passed. */
  function holdWhileLeaving(entry) {
    // pagehide is the page really leaving (or going into the back/forward
    // cache, which pageshow below answers): from then on nothing is let go.
    const left = () => clearTimeout(timer);
    const timer = setTimeout(() => {
      global.removeEventListener?.("pagehide", left);
      releaseOpening(entry, true);
    }, LEAVE_GRACE_MS);
    global.addEventListener?.("pagehide", left, { once: true });
  }

  /**
   * Free the next press. With `repaint`, tell the page, which draws the open
   * Pro dialog again with every plan button idle: the button that was pressed
   * still read "Opening secure checkout…" and stayed disabled.
   * @param {Object|null} entry The opening to let go; null for whichever there is.
   * @param {boolean} repaint Whether the page has to draw its buttons again.
   */
  function releaseOpening(entry, repaint) {
    if (!workerOpening || (entry && workerOpening !== entry)) return;
    workerOpening = null;
    if (repaint) emit();
  }

  /**
   * The checkout the worker is opening for this page and this sign-in, if
   * any: {plan, provider, done}. Keyed to the session that asked for it
   * rather than cleared by the sign-out code, so it ends the moment that
   * session does: on a sign-out, and on a session lost to a 401, which never
   * goes through sign-out. The next person to sign in neither joins it nor
   * waits on it (red team authz-2).
   */
  function checkoutOpening() {
    return workerOpening && openingSession === sessionNow() ? workerOpening : null;
  }

  /** The session signed in now, to tell one sign-in's checkout from the next one's. */
  function sessionNow() {
    try {
      return global.VTAccount?.getSessionToken?.() || null;
    } catch {
      return null;
    }
  }

  /** The worker checkout this page is opening, so a second press cannot open another. */
  let workerOpening = null;
  /** The session it was asked for under. */
  let openingSession = null;
  /**
   * The checkout the worker last sent this page to, as
   * {plan, provider, session, url, at}, until it is gone back to once.
   */
  let lastRedirect = null;

  /**
   * How long after the worker opened a checkout a press of the same plan goes
   * back to it. Creem documents an "expired" status for a checkout but not
   * its lifetime; Stripe's checkout sessions last 30 minutes at the least and
   * 24 hours by default, so this stays at that floor. A checkout that has
   * expired sooner costs one wasted trip, because each is gone back to once.
   */
  const REOPEN_CHECKOUT_MS = 30 * 60000;

  /**
   * Back to the checkout the worker last opened for this page, when it is for
   * this plan, this rail, this sign-in and the money the card shows now, and
   * was opened less than REOPEN_CHECKOUT_MS ago; else null, and the worker is
   * asked. After Stop on a slow load, or back from the checkout page, the next
   * press of the same plan asked the worker for a second Creem checkout, which
   * spent one of the account's twelve an hour and left two open (red team
   * money-4).
   *
   * The money: a press made before /v1/health answered opened a US$ checkout,
   * and a card that has since turned to € is not sent back to it (VG-85, the
   * price shown is the price charged). And the account: the worker refuses a
   * second checkout while a subscription is open, and going back skips that
   * question, so /v1/me is asked first; a subscription opened meanwhile (paid
   * on another device) sends the press to the worker, which answers
   * subscription_open. Both found reviewing the merge, 2026-11-23.
   * @returns {Promise<Object>|null} The outcome, in startCheckout's shape.
   */
  function reopenLastCheckout(planId, rail) {
    const last = lastRedirect;
    if (!last || last.plan !== planId || last.provider !== rail) return null;
    lastRedirect = null;
    if (last.session !== sessionNow() || nowMs() - last.at >= REOPEN_CHECKOUT_MS) return null;
    if (last.currency !== checkoutCurrency(planId, rail)) return null;
    return nothingOpenNow().then((clear) => (clear ? goBackTo(last) : openWorkerCheckout(planId, rail)));
  }

  /**
   * Whether /v1/me, asked now, still lists no open subscription for this
   * account. Any doubt (offline, an error, a sign-out meanwhile) is a no, and
   * the worker, asked instead, decides.
   * @returns {Promise<boolean>}
   */
  function nothingOpenNow() {
    const refresh = global.VTAccount?.refresh;
    if (typeof refresh !== "function") return Promise.resolve(false);
    return Promise.resolve(refresh())
      .then((res) => !!(res && res.ok) && !(accountState()?.billingRails || []).length)
      .catch(() => false);
  }

  /** Go back to the checkout `last` names, in startCheckout's shape. */
  function goBackTo(last) {
    rememberCheckoutIntent(last.plan, last.provider);
    window.location.assign(last.url);
    return { ok: true, mode: "redirect", url: last.url, plan: last.plan, provider: last.provider };
  }

  try {
    // Back from the checkout through the back/forward cache: the page that
    // navigated away is not opening anything any more, and the dialog it
    // kept still shows the pressed plan busy, so it is drawn again.
    global.addEventListener?.("pageshow", (e) => {
      if (e && e.persisted) releaseOpening(null, true);
    });
  } catch {
    /* ignore */
  }

  /** What the page does with each refusal from `/v1/me/checkout`, by its reason. */
  const WORKER_CHECKOUT_REFUSALS = {
    no_session: "signin_required",
    session_expired: "signin_required",
    invalid_session: "signin_required",
    rate_limited: "rate_limited",
    // Answered after the person who asked signed out: nobody is told anything,
    // and nobody is sent to that checkout.
    signed_out: "signed_out",
    // An open subscription (paid, or a renewal being retried): a second
    // checkout would charge twice, so the page sends them to Manage instead.
    subscription_open: "subscription_open",
    checkout_unconfigured: "provider_unavailable",
    plan_unavailable: "provider_unavailable",
    // The euro product is missing on the worker. The page shows € only where
    // /v1/health says it is there, so this is the net under that check.
    currency_unavailable: "provider_unavailable",
    accounts_not_configured: "provider_unavailable"
  };

  /**
   * Ask the worker to open the checkout, then go there.
   * @param {string} planId Plan.
   * @param {string} rail Provider id.
   * @returns {Promise<Object>} The `startCheckout`-shaped outcome.
   */
  function openWorkerCheckout(planId, rail) {
    const ask = global.VTAccount?.openCheckout;
    if (typeof ask !== "function") {
      return Promise.resolve({ ok: false, mode: "provider_unavailable", plan: planId, provider: rail });
    }
    const asker = sessionNow();
    const currency = checkoutCurrency(planId, rail);
    return ask({ plan: planId, provider: rail, returnPath: returnPathHere(), currency })
      .then((answer) => followWorkerAnswer(answerForAsker(answer, asker), planId, rail, currency))
      .catch(() => ({ ok: false, mode: "checkout_failed", plan: planId, provider: rail, reason: "error" }));
  }

  /**
   * The worker's answer, unless it is a checkout and whoever asked for it has
   * signed out since: a checkout is bound to the account that asked, and the
   * next person on this browser is never sent to it (red team authz-2). A
   * refusal keeps its own reason (a 401 has just signed the asker out, and
   * they are asked to sign in again).
   */
  function answerForAsker(answer, asker) {
    if (answer && answer.ok && sessionNow() !== asker) return { ok: false, reason: "signed_out" };
    return answer;
  }

  /**
   * Go to the checkout the worker opened, or say why there is none, in
   * startCheckout's shape. The worker opens Creem checkouts only
   * (apiCheckoutEnabled), so its answer is followed only to a Creem page.
   * `currency` is the money the worker was asked to charge, kept so that the
   * checkout is gone back to only under a card showing the same.
   */
  function followWorkerAnswer(res, planId, rail, currency) {
    const target = res && res.ok ? validateCreemPageUrl(res.url) : null;
    if (target && target.ok) {
      rememberCheckoutIntent(planId, rail);
      lastRedirect = { plan: planId, provider: rail, session: sessionNow(), currency, url: target.url, at: nowMs() };
      window.location.assign(target.url);
      return { ok: true, mode: "redirect", url: target.url, plan: planId, provider: rail };
    }
    const mode = WORKER_CHECKOUT_REFUSALS[res && res.reason] || "checkout_failed";
    const out = { ok: false, mode, plan: planId, provider: rail, reason: (res && res.reason) || "error" };
    if (res && res.provider) out.openProvider = res.provider;
    if (res && res.retryAfter) out.retryAfter = res.retryAfter;
    return out;
  }

  /** This page's path, which is where the checkout sends the buyer back to (the worker adds the rest). */
  function returnPathHere() {
    try {
      return window.location.pathname || "/";
    } catch {
      return "/";
    }
  }

  /**
   * Why a checkout that has a link must not go ahead yet, or null when it may:
   * no way to verify the payment, nobody signed in where sign-in exists, or a
   * rail the worker has said it cannot honour.
   * @param {string} planId Plan.
   * @param {string|undefined} providerId Rail asked for, if any.
   * @returns {Object|null} The refusal startCheckout returns.
   */
  function checkoutRefusal(planId, providerId) {
    if (verificationRequired() && !verificationConfigured()) {
      // Never send someone to pay when we cannot turn that payment into a
      // verifiable entitlement — they would come back to a free account.
      return { ok: false, mode: "verification_unavailable", message: null };
    }
    // A payment made while signed out is tied to this browser's storage and
    // to nothing else: the card keeps charging every month while the same
    // person's next phone shows free, and no operator route exists to move
    // that licence onto an account afterwards. So where this deployment can
    // sign somebody in, it has to, before the money moves. The free trial
    // already works this way (trial_result outcome "needs_account" in
    // js/app.js); this is the same gate on the paid path.
    // Only where sign-in can actually be offered in this browser, though: a
    // content blocker that refuses Google's script on a deployment with no
    // emailed codes used to leave the buyer with no way to pay at all, while
    // the trial, asking the same question, let them through (VG-88). There the
    // anonymous claim is the way in, and the page links the licence once they
    // sign in (js/account.js adopt).
    const account = accountState();
    if (account && account.configured && !account.signedIn && signInOffered(account)) {
      return { ok: false, mode: "signin_required", plan: planId, provider: providerId || null };
    }
    // A rail the worker cannot honour is not a rail. Mercado Pago's webhook
    // is refused outright until MP_WEBHOOK_SECRET and MP_ACCESS_TOKEN exist,
    // and nothing is written for a payment whose webhook was refused, so the
    // claim route — which only ever reads what the webhook wrote — answers
    // "pending" until the browser gives up after seven days. A payment taken
    // in that window is money taken for Pro that can never be issued, and
    // the only remedy left is to gift the buyer a grant by hand.
    //
    // "Set the secret before the link goes live" is the operator's order and
    // stays the first line of defence. This is the net under it, in the one
    // place that can see both halves.
    //
    // Only an explicit no stops a sale. A worker we could not reach, or one
    // too old to report the field, is not an answer, and refusing without an
    // answer would turn a flaky network into a lost sale.
    const rail = providerId || preferredRail(detectRegion());
    const rails = accountRails();
    if (rails && rails[rail] === false) {
      return { ok: false, mode: "provider_unavailable", plan: planId, provider: rail };
    }
    return null;
  }

  /** Note what is being bought, so the page can tell a returning buyer what to expect. */
  function rememberCheckoutIntent(planId, providerId) {
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
   * Drop a checkout still waiting for its licence, on sign-out: claimed
   * afterwards, it would be linked to whoever signs in next on this browser
   * (js/account.js dropPendingClaim). The account that bought it keeps its own
   * pending link, which only that account retries.
   */
  function forgetPendingClaim() {
    // A claim already running would store the licence after this returns.
    global.VTLicense?.cancelClaims?.();
    const st = read();
    if (!st || (st.status !== "pending" && st.status !== "unclaimed")) return;
    try {
      localStorage.removeItem(LS_KEY);
    } catch {
      /* ignore */
    }
    emit();
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
    if (billing === "cancel") {
      cleanUrlParams();
      return { event: "cancel" };
    }
    if (billing !== "success") return null;

    const { plan, provider } = returnedPlanAndProvider(params);
    const sessionId = returnedSessionId(params);

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
    return startReturnClaim(plan, provider, sessionId);
  }

  /**
   * The provider's id for the payment the customer is coming back from, or
   * null: Stripe's `session_id` (the success URL's {CHECKOUT_SESSION_ID}),
   * Creem's `checkout_id` (appended to its return URL; the worker files the
   * claim under it), or Mercado Pago's `preapproval_id`, else its
   * `payment_id`. The preapproval comes first: the worker files a
   * subscription under it and never under a charge's number, which is printed
   * on the receipt and so is nobody's secret.
   * @param {URLSearchParams} params The return URL's query.
   * @returns {string|null}
   */
  function returnedSessionId(params) {
    return (
      params.get("session_id") ||
      params.get("checkout_id") ||
      params.get("preapproval_id") ||
      params.get("payment_id") ||
      null
    );
  }

  /**
   * The plan and rail being returned from. The intent saved as the checkout
   * opened outranks the URL, which anybody can edit; with neither, a
   * `checkout_id` is Creem's return (no other rail sends one) and anything
   * else is the region's own rail.
   * @param {URLSearchParams} params The return URL's query.
   * @returns {{plan: string, provider: string}}
   */
  function returnedPlanAndProvider(params) {
    let plan = params.get("plan") || "pro_monthly";
    if (!PLAN_IDS.has(plan) || plan === "trial") plan = "pro_monthly";
    let provider = params.get("provider") || (params.get("checkout_id") ? "creem" : "");
    if (!PROVIDER_IDS.has(provider)) provider = preferredRail(detectRegion());
    try {
      const intent = JSON.parse(sessionStorage.getItem("vt_billing_intent") || "null");
      if (intent?.plan && PLAN_IDS.has(intent.plan)) plan = intent.plan;
      if (intent?.provider && PROVIDER_IDS.has(intent.provider)) provider = intent.provider;
      sessionStorage.removeItem("vt_billing_intent");
    } catch {
      /* ignore */
    }
    return { plan, provider };
  }

  /**
   * The return URL proves nothing. Record the intent, then ask the worker for
   * a signed license — Pro turns on only when that signature verifies.
   */
  function startReturnClaim(plan, provider, sessionId) {
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
        "merchant_account_id",
        // Creem's return URL (docs.creem.io, Return URL): its ids and the
        // signature over them, none of which should be left to be copied,
        // shared or bookmarked with the page.
        "checkout_id",
        "order_id",
        "customer_id",
        "subscription_id",
        "product_id",
        "request_id",
        "signature"
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

  /**
   * The symbol a price is written with. A bare "$" is the local peso in Mexico,
   * Argentina, Chile and Colombia, so "$7.99" there reads as 7.99 pesos: the
   * dollar carries its country everywhere but the United States.
   * @param {string} cur Currency charged.
   * @param {string} marketCode The market the price is shown in.
   * @returns {string}
   */
  function currencySymbol(cur, marketCode) {
    if (cur === "PEN") return "S/ ";
    return marketCode === "US" ? "$" : "US$ ";
  }

  /**
   * A price as the reader's language writes it. The euro follows the page:
   * "7,99 €" in Spanish (decimal comma, the sign after the number, as the
   * RAE's Ortografía and Fundéu set it out; a no-break space keeps the sign
   * on the number's line) and "€7.99" in English. Soles and dollars keep the
   * form Peru and the dollar markets read: "S/ 19.90", "US$ 7.99", "$7.99".
   * @param {string} cur Currency charged.
   * @param {number} amount Amount.
   * @param {string} marketCode The market the price is shown in.
   * @returns {string}
   */
  function priceText(cur, amount, marketCode) {
    if (cur !== "EUR") return currencySymbol(cur, marketCode) + money(amount);
    return pageLang() === "en" ? "€" + money(amount) : money(amount).replace(".", ",") + "\u00a0€";
  }

  /** The page's language, "es" unless it is English. */
  function pageLang() {
    return global.VTI18n?.lang === "en" ? "en" : "es";
  }

  /**
   * Whether a rail can charge euros on the path a press takes, so that a
   * European is shown the price they will be charged (the Price Indication
   * Directive 98/6/EC art. 2(a): the selling price, VAT and all other taxes
   * included; Peru's Ley 29571 art. 6 says the same for Peruvians). Euros are
   * Creem's only, and on Creem:
   * - while no press can take money (salesClosed: the dialog's own
   *   pre-launch, whose plan buttons say "not available yet"): yes, the
   *   planned price, since no charge can follow it;
   * - checkouts the worker opens: only once /v1/health has said
   *   `creemEurConfigured`, so dollars until it answers;
   * - pasted links: only with a euro link for every paid plan, so one dialog
   *   never shows two currencies.
   * @param {string} rail Provider id.
   * @returns {boolean}
   */
  function euroChargeable(rail) {
    if (rail !== "creem") return false;
    if (salesClosed()) return true;
    if (apiCheckoutEnabled(rail) && accountState()?.configured) return accountRails()?.creemEur === true;
    return paidPlanIds().every((id) => validateCheckoutUrl(linkOf(id, rail, "EUR")).ok);
  }

  /**
   * Whether no press can take money yet: not safe to sell (getBillingHealth)
   * and no QA unlock standing in. It is the same reading as the dialog's own
   * pre-launch (js/app.js isCheckoutPrelaunch), whose plan buttons then say
   * "not available yet". Not `!ok` alone: with demo mode on, or entitlements
   * unverified, a press can still reach a pasted link, and a European shown
   * the planned 7,99 € was then charged the dollar link or unlocked by demo.
   * @returns {boolean}
   */
  function salesClosed() {
    const h = getBillingHealth();
    return !h.ok && !h.demoUnlock;
  }

  /**
   * Whether every plan has a euro price. All or none, like the euro links: a
   * plan without one would leave its card in dollars beside the others in
   * euros, and the region line names one money for the whole dialog.
   * @returns {boolean}
   */
  function euroPriced() {
    return (cfg().plans || []).every((p) => p.priceEur != null);
  }

  /**
   * The money a plan is charged in for a market: the market's own where the
   * plan is priced in it and its rail can charge it, else US dollars.
   * @param {object} plan A plan from the billing config.
   * @param {object} m Its market.
   * @returns {string}
   */
  function chargedCurrency(plan, m) {
    if (m.currency === "PEN" && plan.pricePen != null) return "PEN";
    if (m.currency === "EUR" && plan.priceEur != null && euroPriced() && euroChargeable(preferredRail(m.code))) return "EUR";
    return "USD";
  }

  /**
   * Whether the money this visitor's cards show waits on the worker's
   * /v1/health answer: a visitor in a euro market while Creem is sold through
   * the worker and sales are open (euroChargeable reads `creemEur` then). The
   * page asks for that answer early for them, and nobody else, so their Pro
   * dialog opens on the money a press will charge rather than turning from
   * US$ to € in front of them (VG-85).
   * @returns {boolean}
   */
  function pricesWaitOnRails() {
    const m = marketFor(detectRegion());
    if (m.currency !== "EUR" || !apiCheckoutEnabled(preferredRail(m.code))) return false;
    return !!accountState()?.configured && !salesClosed();
  }

  /**
   * A plan's price in the currency it is charged in, with that currency's
   * symbol. The free plan gets one too: a bare "0" under "Gratis" read as a
   * broken price (customer-research think-aloud, 2026-11-21).
   * @param {object} plan A plan from the billing config.
   * @param {string} [region] Market code; the detected one when left out.
   * @returns {{text: string, currency: string, amount: number}}
   */
  function formatPrice(plan, region) {
    const m = marketFor(region || detectRegion());
    const cur = chargedCurrency(plan, m);
    const amount = { PEN: plan.pricePen, EUR: plan.priceEur, USD: plan.priceUsd }[cur];
    return { text: priceText(cur, amount, m.code), currency: cur, amount };
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
    priceRegion,
    checkoutRails,
    getEntitlement,
    isPro,
    can,
    activate,
    activateDemo,
    clearEntitlement,
    startCheckout,
    checkoutUrl,
    checkoutCurrency,
    validateCheckoutUrl,
    validateCreemPageUrl,
    linksConfigured,
    apiCheckoutEnabled,
    getBillingHealth,
    handleReturnFromCheckout,
    resumePendingClaim,
    hasPendingClaim,
    forgetPendingClaim,
    checkoutOpening,
    formatPrice,
    annualSavingPct,
    EU_REGIONS,
    euRegion,
    pricesWaitOnRails,
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
  // QA-05: `VTBilling.isPro = () => true` from the console must not unlock Pro
  Object.defineProperty(global, "VTBilling", { value: Object.freeze(global.VTBilling), writable: false, configurable: false, enumerable: true });
})(window);
