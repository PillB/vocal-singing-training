# Copy & i18n inventory — end-user language pass

**Date:** 2026-07-16 · Product: Vocal Studio  
**Voice:** learner-facing coach, ES default, no developer/meta talk.

| # | Surface | Files | Status |
|---|---------|-------|--------|
| 1 | Header / nav / lang | `index.html`, `i18n.js` | ✅ Chrome keys |
| 2 | Home hero, tabs, tiers, cards | `app.js`, `i18n.js` | ✅ `exTitle` + cards |
| 3 | Value pulse, Pro studio, retention | `i18n.js` | ✅ |
| 4 | Exercise stage HUD | `i18n.js` | ✅ |
| 5 | **Folded guide** (steps/tips/avoid/original/why) | `exercises-locale-es.js`, `app.js` `exField` | ✅ **Fixed** (was EN-only) |
| 6 | Metrics form labels | `metricLabel` id map | ✅ ES fallbacks |
| 7 | Tours home + UI family | `i18n.js` tour/uiTour | ✅ Softened “tarea/homework” |
| 8 | Toasts / live feedback | `app.js` → `toast.*` | ✅ |
| 9 | Practice-mode live HUD | `practice-modes.js` `L()` | ✅ Key EN leftovers |
| 10 | History / plan / leave | `i18n.js` | ✅ |
| 11 | Account / pricing (user) | `i18n.js`; admin stays gated | ✅ Unconfigured user tone |
| 12 | Footer / privacy | `index.html`, `privacy.html` | ✅ De-meta; learner privacy |
| 13 | Billing health strip | `app.js` | ✅ User-facing sentence, no raw issues |
| 14 | Document title / meta | `meta.title` / `meta.desc` | ✅ |

## Architecture

- UI chrome: `data-i18n` + `VTI18n.applyDom`
- Exercise **titles**: `ex.{id}` keys
- Exercise **bodies** (ES): `VT_EXERCISE_LOCALE_ES` via `VTI18n.exField(ex, field)`
- Lang toggle re-runs `renderExercise()` so folded panels update

## Validation

```bash
npx playwright test tests/i18n-copy.spec.js
```

## Remaining (optional later)

- Full legal dual-language privacy expansion  
- Metrics `result.summary` / breakdown strings if still English in scoring engine  
- Every micro-string inside long practice-mode phase labels  
