/**
 * Billing configuration — ready for Stripe (global) + Mercado Pago (Peru/LATAM).
 * Replace placeholder Payment Link URLs with real ones from your dashboards.
 * See docs/10-SUBSCRIPTIONS.md for setup.
 */
(function (global) {
  "use strict";

  /** @type {import('./billing.js').BillingConfig} */
  const CONFIG = {
    /** Product brand shown on pricing */
    productName: "Vocal Studio Pro",
    productNameEs: "Estudio Vocal Pro",
    /**
     * When true, all Pro features unlock without payment (local QA / demo only).
     * Ships **false**: a public build must never hand out the paid tier.
     * Official Payment Links: https://docs.stripe.com/payment-links
     */
    demoUnlockEnabled: false,
    /**
     * Require session_id (or payment_id) on the ?billing=success return before we
     * even try to claim a license. Cheap first filter; the real check is the
     * signed license issued by workers/entitlements/.
     */
    requireCheckoutSessionId: true,
    /**
     * Server-checked entitlements (see workers/entitlements/ and docs/10-SUBSCRIPTIONS.md).
     *
     * `required: true` means a stored "paid" entitlement only counts when it is
     * backed by a license token this site can verify against `publicKeyJwk`.
     * Forged or copied localStorage no longer grants Pro, and cancellations stop
     * it at the next refresh.
     *
     * Operator setup:
     *   1. Deploy workers/entitlements/ and put its base URL in `apiBaseUrl`.
     *   2. Run `node workers/entitlements/scripts/generate-keys.mjs`, keep the
     *      private key as a worker secret, paste the public JWK below.
     *   3. Leave `required: true`.
     * Until apiBaseUrl and publicKeyJwk are set, checkout stays closed on purpose —
     * we do not take money we cannot turn into a verifiable entitlement.
     */
    verification: {
      /** Base URL of the entitlements worker, e.g. https://entitlements.example.workers.dev */
      apiBaseUrl: "",
      /** Public half of the worker's signing key (ECDSA P-256 / ES256 JWK). */
      publicKeyJwk: null,
      /** Token audience; defaults to this site's origin when empty. */
      audience: "",
      /** Ask the worker for a fresh token once a stored one is this old. */
      revalidateHours: 24,
      /** Never grant Pro from an unverified local entitlement. */
      required: true
    },
    /**
     * Free trial days, granted once per browser when the visitor asks for it.
     * The trial is a local entitlement by design (no payment, nothing to verify);
     * `trialRequiresOptIn` keeps it from silently making every visitor Pro.
     */
    freeTrialDays: 7,
    trialRequiresOptIn: true,
    /**
     * Success URL for Stripe Payment Links (Dashboard → after payment):
     * https://pillb.github.io/vocal-singing-training/?billing=success&plan=pro_monthly&provider=stripe&session_id={CHECKOUT_SESSION_ID}
     * Stripe docs: append session_id via “Pass the checkout session ID” / URL template.
     * https://docs.stripe.com/payment-links/post-payment
     */
    successPath: "./?billing=success",
    cancelPath: "./?billing=cancel",
    /**
     * Stripe Customer Portal (cancel / update payment / switch plan).
     * No-code: Dashboard → Settings → Billing → Customer portal → Activate link
     * https://docs.stripe.com/customer-management/activate-no-code-customer-portal
     * Paste the shareable portal login link (or leave empty until configured).
     */
    customerPortalUrl: "",
    /**
     * Optional extra checkout hosts (in addition to defaults in billing.js).
     * Only https hosts are accepted.
     */
    allowedCheckoutHosts: null,
    /**
     * Primary rails:
     * - stripe: US, EU, UK, CA, AU, MX, most of world (card + local methods by country)
     * - mercadopago: Peru + LATAM (cards, Yape/Plin ecosystem where available)
     */
    providers: {
      stripe: {
        id: "stripe",
        label: "Stripe Checkout",
        labelEs: "Stripe (tarjeta internacional)",
        /** Regions where we recommend this rail first */
        regions: ["US", "EU", "GB", "CA", "AU", "MX", "BR", "WW"],
        /**
         * Paste Stripe Payment Link URLs (Dashboard → Payment Links → Create).
         * Use recurring prices for subscriptions.
         */
        links: {
          pro_monthly: "", // e.g. https://buy.stripe.com/xxxx
          pro_yearly: ""
        }
      },
      mercadopago: {
        id: "mercadopago",
        label: "Mercado Pago",
        labelEs: "Mercado Pago (Perú / LATAM)",
        regions: ["PE", "AR", "CL", "CO", "UY"],
        /**
         * Preference init_point or payment link from Mercado Pago.
         * Peru: create plan/subscription or checkout preference in MP dashboard.
         */
        links: {
          pro_monthly: "", // e.g. https://www.mercadopago.com.pe/subscriptions/checkout?preapproval_plan_id=...
          pro_yearly: ""
        }
      }
    },
    /**
     * Plans — display prices are marketing defaults (not charged until links are set).
     * USD list + regional display hints for PE (PEN) and EU (EUR).
     */
    plans: [
      {
        id: "free",
        name: "Free",
        nameEs: "Gratis",
        interval: null,
        priceUsd: 0,
        pricePen: 0,
        priceEur: 0,
        features: [
          "all_exercises",
          "pitch_highway",
          "local_record",
          "basic_plan",
          "value_pulse"
        ],
        cta: "current"
      },
      {
        id: "pro_monthly",
        name: "Pro Monthly",
        nameEs: "Pro mensual",
        interval: "month",
        priceUsd: 9.99,
        pricePen: 35,
        priceEur: 9.99,
        popular: true,
        // Only list features actually delivered in product (trust > feature stack theater)
        features: [
          "all_free",
          "ad_free",
          "export_progress",
          "coach_pack",
          "pro_insights",
          "multi_profile",
          "studio_goals",
          "pro_progressions",
          "achievements_export",
          "extra_reminders",
          "extra_freezes"
        ],
        cta: "subscribe"
      },
      {
        id: "pro_yearly",
        name: "Pro Yearly",
        nameEs: "Pro anual",
        interval: "year",
        priceUsd: 79,
        pricePen: 279,
        priceEur: 79,
        badge: "saveAnnual",
        popular: false,
        hero: true,
        features: [
          "all_pro_monthly",
          "yearly_savings",
          "lesson_anchor"
        ],
        cta: "subscribe"
      }
    ],
    /**
     * Priority markets for go-to-market (research-backed vocal/singing online demand):
     * US, ES/LATAM (PE, MX, AR, CO, CL), EU (ES, DE, FR, IT, UK), BR, CA, AU, PH/IN English coaches niche
     */
    markets: [
      { code: "PE", name: "Perú", currency: "PEN", rail: "mercadopago", priority: 1 },
      { code: "US", name: "United States", currency: "USD", rail: "stripe", priority: 1 },
      { code: "MX", name: "México", currency: "MXN", rail: "stripe", priority: 1 },
      { code: "ES", name: "España", currency: "EUR", rail: "stripe", priority: 1 },
      { code: "GB", name: "United Kingdom", currency: "GBP", rail: "stripe", priority: 1 },
      { code: "DE", name: "Germany", currency: "EUR", rail: "stripe", priority: 2 },
      { code: "FR", name: "France", currency: "EUR", rail: "stripe", priority: 2 },
      { code: "IT", name: "Italy", currency: "EUR", rail: "stripe", priority: 2 },
      { code: "BR", name: "Brasil", currency: "BRL", rail: "stripe", priority: 2 },
      { code: "AR", name: "Argentina", currency: "ARS", rail: "mercadopago", priority: 2 },
      { code: "CL", name: "Chile", currency: "CLP", rail: "mercadopago", priority: 2 },
      { code: "CO", name: "Colombia", currency: "COP", rail: "mercadopago", priority: 2 },
      { code: "CA", name: "Canada", currency: "CAD", rail: "stripe", priority: 2 },
      { code: "AU", name: "Australia", currency: "AUD", rail: "stripe", priority: 2 },
      { code: "PH", name: "Philippines", currency: "PHP", rail: "stripe", priority: 3 },
      { code: "IN", name: "India", currency: "INR", rail: "stripe", priority: 3 },
      { code: "WW", name: "Worldwide", currency: "USD", rail: "stripe", priority: 3 }
    ]
  };

  global.VT_BILLING_CONFIG = CONFIG;
})(window);
