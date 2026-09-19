# Value Gap Registry (living)

Shared registry updated after each research/implementation phase.  
Product: **Vocal Studio / PillB**.

| ID | Gap | Severity | Status | Owner / next | Evidence |
|----|-----|----------|--------|--------------|----------|
| VG-01 | Stripe/MP payment links empty; demo unlock on | P0 | **Mitigated** | Demo unlock off + checkout held until verification is live; Pablo still to paste live links | billing-config.js |
| VG-02 | Pro marketed multi_profile / priority_progressions undelivered | P0 | **Mitigated** | Honest feature list; coach .txt export | Hormozi likelihood; packaging fix 2026-07-16 |
| VG-03 | Pro uniqueness thin vs free | P1 | Open | Multi-profile + insights v2 | Free-rich freemium |
| VG-04 | Multi-profile flag only | P1 | **Closed** | Local multi-profile (≤3 Pro) | Shipped 2026-07-16 |
| VG-05 | Insights aggregate text only | P1 | **Closed** | Insights v2 sparkline + coach focus | Shipped 2026-07-16 |
| VG-06 | Trial auto-starts for all browsers | P2 | **Closed** | Opt-in via pricing CTA (`trialRequiresOptIn`) | Shipped 2026-09-19 |
| VG-07 | 12-week plan weakly coupled to completions | P2 | Open | Plan→exercise deep links | Habit likelihood |
| VG-08 | Entitlement local-only / shareable | P2 | **Closed** | `workers/entitlements/` + ES256 license verified in `js/license.js` | Shipped 2026-09-19 |
| VG-09 | Many vocal modes self-report | P2 | Open | More mic-derived detectors | Expectation vs delivery |
| VG-10 | No social proof on home | P2 | Open | Outcome quotes strip | Likelihood of achievement |
| VG-11 | No competitor differential on pricing | P2 | Open | Free forever vs time-cap matrix | Reddit Yousician |
| VG-12 | No product analytics | P1 | Open | Plausible/GA4 events | Funnel optimization |
| VG-13 | Home hero is track name not dream outcome | P2 | Open | Outcome line i18n | Hormozi dream outcome |
| VG-14 | Coach pack was name-only | P1 | **Closed** | JSON + .txt dual download | Fixer 2026-07-16 |
| VG-15 | No passive free-tier monetization beyond Pro | P2 | **Strategy + scaffold** | Native ads off-by-default; privacy + ad-free Pro framing; see `19-AD-…` | Validated 2026-07-16 |

## Change log
| Date | Change |
|------|--------|
| 2026-07-16 | Registry created from orchestration Phases 0–8 |
| 2026-07-16 | VG-02 mitigated; VG-14 closed; coach .txt export |
| 2026-07-16 | VG-15 ad strategy + scaffold (adsEnabled false) |
| 2026-09-19 | VG-08 closed: entitlements worker (Stripe + MP webhooks, KV, ES256 licenses) and browser-side verification |
| 2026-09-19 | VG-06 closed: free trial is opt-in; no browser is silently Pro |
| 2026-09-19 | VG-01 mitigated: `demoUnlockEnabled:false`, checkout refuses to run until verification is configured. Remaining: live payment links + worker deploy (operator) |
