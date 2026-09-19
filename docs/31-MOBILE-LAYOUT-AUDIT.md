# Mobile layout audit — plan / history / pricing

Audit date: 2026-09-19. Viewports: 390×844, 360×740, 320×640 (Chromium, `isMobile`,
DPR 2). Harness: `npm run test:mobile` (`qa/capture-mobile.mjs`), which seeds
realistic progress and week-plan data before measuring, because empty states hide
most of these breaks.

The harness flags five things per page/viewport: horizontal page scroll, elements
painted outside the viewport edge, text under 12px, interactive controls under the
44px `--min-tap` floor the stylesheet already declares, and interactive controls
that overlap inside the same stacking layer.

**Before: 258 findings across 15 page/viewport pairs. After: 0.**

## What was broken

| # | Where | Symptom | Cause |
|---|-------|---------|-------|
| 1 | Header, every page | 7 actions wrapped into a ragged 2–4 row staircase; at 320px the sticky header ate 173px (27% of the viewport) before any content | `.header-actions` was right-aligned inside `max-width: min(62vw, 11.5rem)` at ≤360px |
| 2 | Header, every page | Labels rendered at 10.9px on 34px-tall buttons | `.header-actions .btn-sm { font-size: 0.68rem; min-height: 34px }` at ≤360px |
| 3 | Header, every page | "Plan de 12 semanas" was 162px wide and forced a row of its own | No short-label variant, unlike the track tabs |
| 4 | Pricing modal | The plan cards — the only reason the dialog opens — started 783px down a 574px scroll box at 320px, behind the value copy | Source order put `.pricing-value-stack` before `.pricing-grid` |
| 5 | Pricing / account modals | The ✕ took ~22% of the header line, so the title and subtitle wrapped two words early (subtitle 188px of 243px available at 320px) | Close button sat in the `.pricing-head` flex row |
| 6 | Plan page | Element chips were 36px tall | `.chip` had no `min-height` |
| 7 | Home / settings | Selects 31px, time inputs 30px, checkboxes 13×13px, profile buttons 32px | No phone floor on form controls |
| 8 | Footer, every page | Privacy link was a 68×15 target | Inline `<a>` inside a `<p>` |
| 9 | Every page | Badges 11.5px, value-pulse tag 10.9px, stat labels and achievement labels 10.4px, plan badge 10.4px | Sub-12px `font-size` values with no phone floor |
| 10 | History page | Long recording labels could squeeze the Play/Delete pair | `.history-item` text column had no `min-width: 0` |

Horizontal page scroll was already clean at every viewport before this pass, and
still is.

## What changed

All of it is CSS in a single commented block at the end of `css/styles.css`,
scoped `body:not(.view-exercise)` wherever it touches shared chrome, so the
exercise view's sticky-highway geometry (`tests/viewport-overflow.spec.js`,
`tests/mic-hud-layout.spec.js`, `tests/ui-tour-and-layout.spec.js`) is untouched.

The one markup change is the short-label variant on `#btn-plan`, following the
`.track-label-short` / `.track-label-full` pattern the track tabs already use.
`nav.plan` and `#btn-plan` are unchanged, so `tests/fixtures/catalog-snapshot.json`
still matches.

Sticky header height on the plan page: 118px → 129px at 390, **173px → 129px at 320**.
First plan card offset inside the pricing modal: 646px → 317px at 390,
**783px → 378px at 320**.

## Known pre-existing failures (not touched here)

These fail identically on `main`:

- `tests/ui-tour-and-layout.spec.js` › "speech family tour targets mode-focus" —
  flaky ~2/10; reads `textContent` the instant `#tour-root` becomes visible,
  before the title is painted. `toHaveText` would auto-retry.
- `tests/pro-features.spec.js` › "home shows pro studio chrome"
- `tests/retention.spec.js` › "practice heatmap and analytics exist"
- `tests/validation.spec.js` › "sustain checkbox still present with arpeggio and one-note mode"
