# 29 — UI/UX graphic red-team + discoverability

**Date:** 2026-07-18  
**Evidence:** `qa/screenshots/ui-ux-redteam/` (local), home captures `qa/screenshots/01_home_*`, forensics `qa/screenshots/click-ui-live/`  
**Code:** `index.html`, `css/styles.css`, `js/app.js`, `js/i18n.js`  
**Status:** Fixes shipped for P0 discoverability (track switch + breadcrumbs + catalog fold)

---

## Research applied

| Practice | Source | Application |
|----------|--------|-------------|
| Segmented control as exclusive mode | Apple HIG Segmented Controls | Solid active fills, icons, min-height ~48px |
| Visual hierarchy / F-pattern | NN/g | Catalog panel moved **above** dense studio (Tu estudio / Pro) |
| Breadcrumbs for location | NN/g Breadcrumbs | `Inicio › Vocal|Canto › n. Title` on exercise |
| Progressive disclosure | NN/g | `body.home-zero` collapses empty heatmap / spark noise |
| Track color coding | Wayfinding | Card left accent + grid `track-vocal` / `track-singing` |
| Touch targets | WCAG 2.5.8 | Track tabs ≥46–48px |

---

## Findings → fixes

| ID | Sev | Finding | Evidence | Code locus | Fix | Status |
|----|-----|---------|----------|------------|-----|--------|
| R1 | **P0** | Vocal vs Canto tabs samey as tier chips; soft tint only | `01_home_vocal_es.png` mid-page pills | `.tabs` / `.tab` `styles.css` | Segmented **track-switch**: solid blue/warm gradients, icons 🎙/♪, short+full labels | **Done** |
| R2 | **P0** | Catalog + track switch buried under studio chrome | Phone fold: stats/Pro first | `index.html` home order | Move `#catalog-panel` **immediately after hero** | **Done** |
| R3 | **P0** | Exercise view: no path, only Atrás | click-ui exercise frames | `.exercise-header-compact` | Breadcrumb nav `bc-home` / `bc-track` / `bc-current` | **Done** |
| R4 | **P1** | Zero-session Insights/heatmap steal attention | phone home | `#pro-insights-panel`, heatmap | `body.home-zero` hides spark + heatmap | **Done** |
| R5 | **P2** | Cards lack track cue | card grid | `renderExerciseList` | `card-ex track-{vocal\|singing}` left border | **Done** |
| R6 | **P2** | Live toast raw mode ids (prior U4) | docs/25 | `modeDisplayName` already maps common modes | Keep / extend map as needed | **Prior done** |
| R7 | **P2** | Dense header actions (Tour/Cuenta/Pro…) compete | home header | app-header | Split into `.header-nav` destinations + `.header-utils`, with an active state per view — see [30-DESIGN-FLOW-OVERHAUL](30-DESIGN-FLOW-OVERHAUL.md) | **Done** |
| R8 | **P3** | Continue + structured still secondary to Pro CTA in studio | value-pulse | Studio block | Catalog now above studio | **Mitigated** |

---

## Before → after (intent)

| Surface | Before | After |
|---------|--------|-------|
| Home track switch | Muted pill chips twin to Todos/Básico | High-contrast segmented control inside labeled **Catálogo** card |
| Home fold (phone) | Stats/Pro dominate | Catalog + track switch earlier in document order |
| Exercise chrome | Badge + title + Atrás | **Breadcrumb** + title + Atrás |
| Exercise cards | Uniform borders | Track-colored left accent |

**Capture paths (local):**

- `qa/screenshots/ui-ux-redteam/after_home_desktop.png`  
- `qa/screenshots/ui-ux-redteam/after_home_phone.png`  
- `qa/screenshots/ui-ux-redteam/after_exercise_bc.png`  

---

## Smoke validation

- Track switch Vocal → Canto updates list (`track-singing`, first singing exercise title)  
- Open exercise shows breadcrumb e.g. `Inicio › Canto › 1. Fry vocal…`  
- `bc-home` / `#btn-back-home` still call `leaveExercise({ type: "home" })`  
- `bc-track` returns home and `setTab(track)` after leave  

---

## Dual-agent notes

### Elon (product) — **PASS · Ship YES**
- Vocal vs Canto findable in &lt;3s: solid segmented control + catalog label + early placement.
- Breadcrumbs fix orientation vs bare Atrás.
- Residual: header chip soup (Tour/Cuenta/Pro…); slight redundancy badge + breadcrumb — non-blocking.

### Zuckerberg (architecture) — **PASS (minor WARN) · Ship YES**
- Same `data-tab` / `setTab` path; cards presentational.
- `bc-track` correctly `await leaveExercise` then `setTab`.
- WARN: breadcrumb grows sticky exercise chrome → shorter stage until measure; sync path correct.

---

## Deploy

Pushed with this change set (cache `?v=20260718a` for styles/app/i18n).
