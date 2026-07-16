# User-facing copy inventory (learner language)

Validated and revised: **2026-07-16** (copy pass: de-meta, ES guides, metrics).

## Surface inventory

| # | Surface | Source of truth | Lang | Status |
|---|---------|-----------------|------|--------|
| 1 | App chrome (nav, home, footer) | `index.html` `data-i18n` + `js/i18n.js` | ES/EN | OK |
| 2 | Product tour (home) | `tour.*` in i18n + `js/tour.js` | ES/EN | OK learner |
| 3 | UI mini-tours (exercise) | `uiTour.*` in i18n | ES/EN | OK |
| 4 | Exercise titles | `ex.{id}` in i18n | ES/EN | OK (36) |
| 5 | Folded guide: original / research / steps / tips / mistakes | `exercises-data.js` (EN) + `exercises-locale-es.js` (ES) via `VTI18n.exField` | ES/EN | **Fixed** incomplete ES arrays |
| 6 | Live mode cues | `practice-profiles.js` `cue` / `cueEs` | ES/EN | OK |
| 7 | Live mode HUD strings | `practice-modes.js` `L(es,en)` | ES/EN | **Fixed** Phase/Next/Best hard-EN |
| 8 | Metric form labels | `app.js` `metricLabel()` byId map | ES | **Expanded** all metric ids |
| 9 | Pricing / Pro modal | `pricing.*` i18n | ES/EN | **De-meta** paywall/portal/checkout |
| 10 | Account / auth | `auth.*` i18n | ES/EN | **De-meta** internal/admin wording |
| 11 | Retention / first-win / pulse | `retain.*` `value.*` `home.next*` | ES/EN | OK |
| 12 | Mic / range / leave dialogs | i18n keys | ES/EN | OK |
| 13 | Privacy page | `privacy.html` (static ES + EN block) | ES/EN | Polished |
| 14 | Toasts (billing return) | i18n + `billing.js` messages | ES/EN | **De-meta** |
| 15 | Ads labels (off by default) | `ads-config.js` | ES/EN | OK |

## Exercises (36) — guide locale

All ids have an ES pack entry. Arrays for `steps` / `tips` / `mistakes` should match EN length (or be pedagogically complete).

**Completed in this pass:** `s1-vocal-fry`, `s2-solfege-chords`, `s3-song-stanzas`, `s15-sh-air-ladder`, `s16-major-scale-coord`, `s10-five-note`, `s9-pitch-match` wording.

## Meta language ban list (do not show learners)

- Class-1 / homework spine / “comply with requirements”
- paywall / soft limits / session_id / Stripe → Billing → Customer portal
- Internal admin / F&F / QA accounts (use “test account” only if needed)
- “The app was built to…” developer voice

## QA

```bash
npx playwright test tests/i18n-copy.spec.js
```

Automated checks: ES guide not English-first-step; full locale pack; no Class-1 in visible EN original; metric labels Spanish for common ids.
