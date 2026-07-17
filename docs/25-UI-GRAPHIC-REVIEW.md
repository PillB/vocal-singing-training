# UI & graphic review — forensics before/after + code cross-check

**Date:** 2026-07-17  
**Evidence:** `qa/screenshots/exercise-ui/{id}/` (live headed forensics), `docs/24-LIVE-EXERCISE-FORENSICS.md`  
**Code:** `css/styles.css`, `js/app.js`, `js/practice-modes.js`, `js/practice-profiles.js`, `index.html`  
**Functional suite status:** green (separate); this doc is **visual / layout / copy**

---

## Executive summary

Interaction forensics (hover, Start/Stop, mic drag, Space, silence gate) **pass**. Graphical review of forensics before/after frames found polish issues; **research-backed fixes** shipped for empty highway idle wiring, speech panel theater, piano density, and CTA hover.

| Severity | Count | Theme | Status |
|----------|------:|-------|--------|
| P1 | 3 | Empty highway, speech void, Detener clip | **Fixed** (U1/U2/U3) |
| P2 | 6 | Copy/i18n, density, idle labels, Space badge | **Fixed** (U4–U6, U8–U9 partial) |
| P3 | 3 | Hover, metrics jump, pitch footer | **Partial** (U10/U12 done; U11 open) |
| Info | 1 | Forensic pink cursor | Test-only |

### Research applied

| Practice | Source | Application |
|----------|--------|-------------|
| Empty states teach next action | Pitch/tuner apps show lanes before audio | `_drawIdle` + post-layout `redrawIdle` |
| Progressive disclosure | NN/g primary vs secondary | Piano secondary opts behind 🎹+ |
| Touch targets | WCAG 2.5.8 / ~44px primary | Practice CTA min-height 40 + min-width |
| Primary CTA emphasis | NN/g | Stronger `.btn-practice:hover` without translateY |
| Coach focus, not empty theater | Speech practice UIs | Top-align content-sized mode panel |

---

## What works (before → after)

| Action | Before | After | Verdict | Code |
|--------|--------|-------|---------|------|
| Hover Start | Resting mint CTA | Brighter + glow + 1px lift | Pass (subtle) | `.btn` hover `styles.css` ~242–256 |
| Mic drag | e.g. value 7 | e.g. 5 | Pass | `#mic-sensitivity` range |
| Start | Listo / Empezar | En vivo + Detener | Pass | `setPracticeUI` `app.js` |
| SH silence 2s | 0.0s | still 0.0s | Pass | `shAirLadder` onset |
| SH Space hold | 0.0s | ~1.2s + mic green border | Pass | Space + `.hud-bc.is-manual` |
| Guide open | Collapsed strip | Steps + “Ocultar detalles” | Pass | guide toggle |
| Stop | Live | Metrics card open | Pass | `openMetricsPanel` |

**Representative paths**

- Speech: `v1-diction/01_hover_start_{before,after}.png`, `04_start_after.png`, `09_after_stop.png`  
- Air: `s15-sh-air-ladder/05_silence_after_2s.png`, `06_space_long_hold.png`  
- Highway: `s9-pitch-match/00_open.png`, `s2-solfege-chords/03_highway_open.png`  

---

## Findings (cross-validated)

### U1 — P1 — Pitch highway empty void at rest

**Visual:** Canvas is solid near-black; no lanes, no “press Start” affordance (`s9…/00_open`, `s2…/03_highway_open`).  
**Code:** `#pitch-canvas` in `index.html`; pitch viz only draws when live; no empty-state draw.  
**Improve:** Faint static lane grid + muted caption when `!practiceLive`.

### U2 — P1 — Speech mode panel wastes vertical space

**Visual:** Large empty navy card under title; chrome only at top (`v1…/00_open`, `01_*`).  
**Code:** `.mode-focus.mode-focus-live` min geometry / stage padding `styles.css` ~1964–2012; mode HTML is title + phase + bar only.  
**Improve:** Lower min-height for speech modes **or** idle coach / waveform placeholder.

### U3 — P1 — Detener label truncates

**Visual:** Stop reads “D…ner” in compact rail (`v1…/04_start_after`, `s15…/06_*`).  
**Code:** `.hud-bl .btn-practice` tight padding / small font `styles.css` ~1634–1640.  
**Improve:** `min-width` + `white-space: nowrap` on stop/start practice buttons.

### U4 — P2 — Internal mode id in live toast

**Visual:** Chip “En vivo · rateLadder” (`v1…/04_start_after`).  
**Code:** `tt("toast.live", { mode: profile.mode })` `app.js` ~2205; i18n `toast.live`: `"En vivo · {mode}"`.  
**Improve:** Map mode → human label (i18n); never pass raw camelCase ids.

### U5 — P2 — Mixed EN/ES in mode chrome

**Visual:** “Rate 5 · comfortable”; stop chip “1/4 rate phases” (`v1…/04_start_after`, `09_after_stop`).  
**Code:** `practice-profiles.js` phases English-only; `rateLadder` summary template English.  
**Improve:** `label` / `labelEs` on phases; localize summaries with `L()`.

### U6 — P2 — Pre-start placeholders look broken

**Visual:** Phase `—`, remain `—`, orphan metro dots (`v1…/01_hover_*`).  
**Code:** `rateLadder.render` sets `data-phase` / `data-remain` to `—` until first frame.  
**Improve:** Seed first phase label + duration at mount (before live).

### U7 — P2 — Top pitch HUD overcrowded

**Visual:** Timer + chords + mode + pts + combo + carril + reto (`s9…/00_open`).  
**Code:** `.hud-top-rail` denser flex; challenge row always available for pitchMatch.  
**Improve:** Defer challenge/score density until live, or collapse secondary into “Más”.

### U8 — P2 — Bottom piano rail density

**Visual:** Start + mic + octave + 5 toggles + 🎹 (`s2…/03_highway_open`).  
**Code:** `#piano-mini-opts` always expanded for piano profiles.  
**Improve:** Keep Start/Mic primary; park secondary under 🎹+ by default.

### U9 — P2 — Space-assist feedback easy to miss

**Visual:** Only subtle green mic border; no “Espacio” label (`s15…/06_space_long_hold` vs silence).  
**Code:** `#mic-manual-hint { display: none !important }` `styles.css` ~1717; `.hud-bc.is-manual` 1px border.  
**Improve:** Short “Espacio” badge on mic chip when `is-manual` / `is-manual-air` on mode-big (styles already exist ~1015–1024).

### U10 — P3 — Start hover very subtle in stills

**Code:** `brightness(1.05)` + 1px lift.  
**Improve:** Optional stronger primary CTA hover only.

### U11 — P3 — After Stop, viewport sits on metrics

**Visual:** Stage gone; Start only at top of metrics form (`v1…/09_after_stop`).  
**Code:** `openMetricsPanel` expands + may scroll.  
**Improve:** Keep sticky rail; soft-scroll metrics without losing context.

### U12 — P3 — Pitch footer on non-pitch (SH) sessions

**Visual:** “Objetivo G2 · Cents…” under SH air (`s15…/05_silence_*`).  
**Code:** `#pitch-stats` filled by `updatePitchStatsLabel`; not always cleared when `!showPitch`.  
**Improve:** Clear + hide `#pitch-stats` when profile has no pitch viz.

### U13 — Info — Pink forensic cursor

Test-only `#vt-forensics-cursor` in Playwright suite — ignore for product design.

---

## Recommended fix order

1. **U3** Detener/Start nowrap min-width (CSS)  
2. **U4** Human mode labels in toast  
3. **U6** Idle phase seed for rateLadder (and similar)  
4. **U12** Hide/clear pitch-stats when `!showPitch`  
5. **U5** Localize phase labels  
6. **U9** Stronger Space-assist badge  
7. **U1 / U2** Empty-state design (larger effort)  
8. **U7 / U8** Density (layout pass)

---

## Fixes shipped

| ID | Change | Files |
|----|--------|-------|
| U1 | `redrawIdle()` after layout; brighter idle lane + “Pulsa Empezar”; fitHighway redraws idle | `pitch-visualizer.js`, `app.js` |
| U2 | Top-align content-sized `.mode-focus-live` panel | `styles.css` |
| U3 | min-width + nowrap Start/Stop | `styles.css` |
| U4 | `modeDisplayName()` in live toasts | `app.js` |
| U5/U6 | ES phase labels + idle duration seed | `practice-modes.js` |
| U8 | `.piano-opts-compact` until 🎹+ expands | `app.js`, `styles.css` |
| U9 | Mic “Espacio” badge when manual | `styles.css` |
| U10 | Stronger practice hover | `styles.css` |
| U12 | Clear/hide `#pitch-stats` when `!showPitch` | `app.js` |
| U7 | At rest hide/de-emphasize Pts·Combo·Carril; denser prog labels only on wide | `styles.css` + `body.practice-live` |
| U11 | Soft scroll metrics under stage (no center yank) | `openMetricsPanel` |

**Verify U1:** center canvas pixel greenish after open pitch exercise (idle lane).  
**Open:** none (U7/U11 closed).

---

## Out of scope

- Soft Pro entitlement  
- Re-running full 36-exercise headed matrix for visual-only changes (smoke on sample exercises sufficient)  
- Redesign of brand palette  

---

## References

- Forensics matrix: `docs/24-LIVE-EXERCISE-FORENSICS.md`  
- Screenshots: `qa/screenshots/exercise-ui/`  
- Prior hit-target work: rail `z-index` / mode-focus `pointer-events` in `styles.css`  
