/**
 * Ad / native monetization config — OFF by default.
 * Strategy: docs/19-AD-MONETIZATION-ORCHESTRATION.md
 *
 * Operator checklist before enabling:
 * 1. Prefer mode "native" with real affiliate/partner URLs.
 * 2. Keep adsEnabled false until subscription Payment Links are live (higher EV).
 * 3. Never put ads during practice — enforced in js/ads.js.
 */
(function (global) {
  "use strict";

  /** @type {import('./ads.js').AdsConfig} */
  const CONFIG = {
    /**
     * Master switch. false = no UI, no third-party scripts.
     * Set true only after reviewing docs/19-AD-MONETIZATION-ORCHESTRATION.md
     */
    adsEnabled: false,
    /**
     * "native" — first-party studio tip cards (recommended early)
     * "adsense" — Google AdSense display only (requires approved units)
     * "hybrid" — native + optional AdSense fill
     */
    mode: "native",
    /** Pro / trial never see ads (conversion stick) */
    suppressForPro: true,
    /** Label for a11y + FTC-style honesty */
    labelEs: "Consejo de estudio",
    labelEn: "Studio tip",
    disclosureEs: "Enlace de afiliado o patrocinio · Pro quita estos consejos",
    disclosureEn: "Affiliate or sponsored link · Pro removes these tips",
    frequency: {
      /** Min ms between home slot re-renders */
      homeMinIntervalMs: 60_000,
      /** Min ms between post-session cards */
      postSessionMinIntervalMs: 120_000
    },
    /**
     * Native / affiliate cards — replace href with real partner links.
     * Use rel="sponsored noopener noreferrer" (applied in ads.js).
     */
    nativeCards: [
      {
        id: "mic-starter",
        titleEs: "Micrófono USB de estudio",
        titleEn: "USB studio mic",
        bodyEs: "Un mic decente mejora la autopista de pitch y tus grabaciones de revisión.",
        bodyEn: "A decent mic improves pitch highway accuracy and review recordings.",
        ctaEs: "Ver opciones",
        ctaEn: "See options",
        href: "", // e.g. https://www.amazon.com/... tag=your-20
        slots: ["home", "post-session"]
      },
      {
        id: "headphones",
        titleEs: "Auriculares cerrados",
        titleEn: "Closed-back headphones",
        bodyEs: "Escucha la referencia del piano sin fugas hacia el mic.",
        bodyEn: "Hear piano reference without bleeding into the mic.",
        ctaEs: "Ver opciones",
        ctaEn: "See options",
        href: "",
        slots: ["home", "history"]
      },
      {
        id: "pro-nudge",
        titleEs: "Exporta tu prueba con Pro",
        titleEn: "Export your proof with Pro",
        bodyEs: "JSON + resumen coach · sin consejos de estudio · multi-perfil.",
        bodyEn: "JSON + coach summary · no studio tips · multi-profile.",
        ctaEs: "Ver Pro",
        ctaEn: "See Pro",
        href: "#pricing",
        action: "open-pricing",
        slots: ["post-session", "history"]
      }
    ],
    /**
     * AdSense — leave empty until approved.
     * https://support.google.com/adsense/
     */
    adsense: {
      client: "", // ca-pub-xxxxxxxx
      slots: {
        home: "",
        history: ""
      }
    }
  };

  global.VT_ADS_CONFIG = CONFIG;
})(window);
