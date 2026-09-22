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
| VG-16 | No accounts: progress lived and died in one browser | P0 | **Closed (code)** | Email-code + Google sign-in, D1-backed; Pablo still to create the D1 database and set the keys | Shipped 2026-09-21, `docs/33-…` |
| VG-17 | No way to gift a free month, or take one back | P1 | **Closed (code)** | Trial/gift/comp are one grant row with `revoked_at`; codes and direct grants; admin panel | Shipped 2026-09-21, `docs/33-…` |
| VG-18 | Trial was per-browser, so it could be farmed by clearing storage | P1 | **Closed (code)** | Once accounts are configured the trial is one per account, ever (`trial_used_at`) | Shipped 2026-09-21 |
| VG-19 | Peru cannot be a Stripe merchant, so "international payments" had no rail | P0 | **Decided, not executed** | Mercado Pago Perú + a merchant of record (Creem first, Polar in parallel); Pablo to register | `docs/34-PERU-OPERATOR-RUNBOOK.md` |
| VG-20 | The client can only check out through Stripe or Mercado Pago, but the chosen international rail is a merchant of record | P0 | Open | `PROVIDER_IDS`, the checkout host allowlist, `preferredRail()` and every `markets[].rail` still say `stripe`, and the worker's claim route rejects any other provider. Pasting a Creem link into the config would be refused by our own validation. Needs a Creem rail end to end: host allowlist, provider id, webhook handler and signature check | `js/billing.js:27,33,108`, `workers/entitlements/src/index.js:259` |
| VG-21 | The yearly badge asserted a discount the prices did not give | P2 | **Closed** | Said "Save 20%" against a real 34%. Derived from the prices now, with two tests | Shipped 2026-09-22, `js/billing.js` `annualSavingPct` |

## Change log
| Date | Change |
|------|--------|
| 2026-07-16 | Registry created from orchestration Phases 0–8 |
| 2026-07-16 | VG-02 mitigated; VG-14 closed; coach .txt export |
| 2026-07-16 | VG-15 ad strategy + scaffold (adsEnabled false) |
| 2026-09-19 | VG-08 closed: entitlements worker (Stripe + MP webhooks, KV, ES256 licenses) and browser-side verification |
| 2026-09-19 | VG-06 closed: free trial is opt-in; no browser is silently Pro |
| 2026-09-19 | VG-01 mitigated: `demoUnlockEnabled:false`, checkout refuses to run until verification is configured. Remaining: live payment links + worker deploy (operator) |
| 2026-09-21 | VG-16/17/18 closed in code: accounts, saved progress across devices, and one grant mechanism for trial, gift and comp. All optional — with no D1 binding the worker behaves exactly as before |
| 2026-09-21 | VG-19 opened: Peru is not a Stripe merchant country, so Stripe cannot be the seller. Direction is Mercado Pago Perú plus a merchant of record for the rest of the world |
| 2026-09-21 | VG-19 corrected: the first reading — that Polar and Lemon Squeezy inherit Stripe's restriction — was wrong. Stripe added Peru as a cross-border *payout* destination on 2026-02-25, and Polar, Creem, Lemon Squeezy and Gumroad each name Peru on their own supported-country pages. Creem is cheapest at this price point (3.9% + $0.40); Lemon Squeezy is ruled out for being folded into Stripe Managed Payments, which does not cover Peru |
| 2026-09-22 | VG-19 reinforced from practitioner evidence (forums, articles, testimonials, fact-checked): Peruvian issuers approve roughly 70–90% of locally acquired charges against 30–50% acquired abroad, which decides Mercado Pago-first on transactions rather than on fees; Culqi demoted from fallback to last resort (its own subscription tooling is unmaintained — 12 open issues, the subscription request unanswered 5.5 years — and merchants rate it worst on fraud), Openpay BBVA becomes the fallback; Peru price moved from S/ 25–30 to S/ 20–25 against the streaming anchor; a Cloudflare billing alert added to stage 1 |
