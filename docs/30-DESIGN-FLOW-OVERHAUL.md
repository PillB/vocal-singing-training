# 30 — Site design & user-flow overhaul

**Date:** 2026-09-19
**Code:** `index.html`, `css/styles.css`, `js/app.js`, `js/i18n.js`, `js/practice-modes.js`
**Scope:** home, header navigation, exercise screen, 12-week plan, history, pricing modal

---

## The problem

Walking every screen at 1440×900 and 390×844 turned up one root issue: **the site
never tells a newcomer what to do first.**

Home opened on twenty near-identical exercise cards under three competing primary
buttons — *Continuar práctica*, *Iniciar sesión guiada*, and *Siguiente paso → Abrir* —
that all lead to roughly the same place. On a phone the page was a ~5,000px scroll.
Nothing said what the site was, or what *Vocal* and *Canto* mean.

Around that, four smaller faults:

| # | Surface | Finding |
|---|---------|---------|
| F1 | Header | Seven equal-weight chips wrapping onto two rows; no home link, no sense of which section you were in. Carried over as **R7 (open)** in [29-UI-UX-REDTEAM](29-UI-UX-REDTEAM.md). |
| F2 | Exercise | A large empty area mid-stage on exercises with no pitch canvas, while "cómo practicar" sat collapsed below the fold. Coaching cue clipped mid-sentence on phone. |
| F3 | Plan / History | Rendered in English on a Spanish-default site: `Week 1`, `Not started — pick an element to begin`, all seventeen element chips, `No recordings yet`, `Exercise completions`. Phase labels in the practice HUD (`Rate 5 · comfortable`) too. |
| F4 | Pricing | Eleven feature bullets pushed each plan's button past the modal's visible edge. |

---

## Direction

**One clear next action per screen; teach before asking; nothing load-bearing behind a toggle.**

### Home — a start panel, then a catalog

A new `#start-panel` is the single decision point. It carries the recommended
exercise and **one** primary button, and adapts to who is looking:

| State | Kicker | Primary |
|-------|--------|---------|
| First visit | Empieza aquí | ▶ Empezar |
| Returning | Continúa donde lo dejaste | ▶ Continuar |
| Guided session open | Sesión guiada en curso | ▶ Seguir la sesión |

On a first visit only, a three-step strip says what a session looks like
(pick → practise with the mic → save and review); it disappears once
`body.home-zero` clears. *Continuar práctica* and *Iniciar sesión guiada* stay,
demoted to ghost buttons — alternatives, not rivals.

The catalog now groups cards under **Básico** and **Avanzado** headings that span
the grid, so twenty cards read as two scannable sets. The
`#exercise-list .card-ex` contract the suite leans on is unchanged. The
`tier.counts` summary line only renders when a filter is active, since the group
headers carry their own counts.

### Header — destinations, then utilities

`Practicar / Plan de 12 semanas / Historial` become a segmented `#header-nav`
with an active state driven by `setView`, so the current section is always
identifiable. `Pro / Cuenta / idioma / Tour` move into a quieter `.header-utils`
group. Every button keeps its id and stays visible and clickable at every
viewport — nothing moved behind an overflow menu.

### Exercise — guidance where the void was

The stage has to stay tall enough to keep the HUD rails inside the first
viewport (see `tests/fold-regression.spec.js`), so the empty middle is not
reclaimable height — the choice is guidance or empty space. `#stage-guide` now
renders the exercise's first three steps there whenever no pitch canvas occupies
the stage, with a link into the full guide. `fitHighwayToViewport` measures the
real gap between the mode panel and the bottom rail and sizes it to fit, hiding
it below ~92px of room. It clears on `body.practice-live`.

`.mode-panel` max-height went 14rem → 18rem; 14rem cut the last line of the
coaching cue on a 390px-wide phone.

### Plan — the twelve weeks made visible

A `#plan-week-rail` shows all twelve weeks with done / current / todo states, so
the panel's name matches what you see. The week-review column is muted with an
explanatory note until a week is actually under way, instead of asking you to
judge a week you have not run.

### Pricing

Feature lists cap at five bullets with the rest behind a `<details>`; plan CTAs
are pinned to the bottom of their card with `margin-top: auto`.

---

## Localization

Stored values are unchanged — only labels are localized, so plans and progress
saved before this change keep working.

- `weekElementLabel()` maps a `VT_WEEK_ELEMENTS` entry to `plan.el.<slug>`,
  falling back to the raw English string.
- `localizeProfile()` in `js/practice-modes.js` clones a profile's `phases` and
  rewrites each `label` through `PHASE_ES` at mount time, so every mode's HUD
  picks it up without touching fifteen separate `.label` reads. Cloning keeps a
  language switch from baking the previous language into the shared profile.
- Seven English fallback strings in mode HUDs (`All topics done`,
  `Contrast complete — rate both`, …) now go through `L()`.
- `VTI18n.onChange` re-renders the plan and history views, which build their copy
  at render time.

---

## Verification

- `node qa/check-catalog.mjs` — 36 exercises · 33 modes · 13 progressions.
- Full Chromium Playwright suite.
- Screenshots at 1440×900, 390×844 and 844×390 across home, exercise, plan,
  history and the pricing modal.
