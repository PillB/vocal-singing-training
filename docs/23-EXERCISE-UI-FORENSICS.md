# Exercise UI forensics — hover & interactivity matrix

**Date:** 2026-07-17  
**Product:** Vocal Studio (GH Pages SPA)  
**Live URL:** https://pillb.github.io/vocal-singing-training/  
**Suite:** `tests/exercise-ui-forensics.spec.js` + `tests/helpers/ui-forensics.js`  
**Artifacts:** `qa/screenshots/exercise-ui/{id}/` (~520 PNGs), `qa/geometry/exercise-ui-report.json` (gitignored; regenerate with `npm run test:ui-forensics`)  
**Result:** **36/36 exercises · 0 issues · 0 product bugs**

---

## Goal

For **every** vocal and singing exercise, automate Playwright simulation of key UI actions, capture **before/after screenshots**, compute **style/hit-target diffs**, and judge expected vs actual hover/interactivity effects — without dumping hundreds of image captions into chat.

Forensic depth is split:

1. **Automated matrix** (all 36 × actions) → JSON report + P0 assertions  
2. **Sample multimodal forensics** (representative open / hover / guide / live / stop / mode chrome) → prose below  
3. Full PNG tree remains on disk for re-inspection

---

## How to run

```bash
npm run serve          # terminal 1 — http://127.0.0.1:8765
npm run test:ui-forensics
```

Optional: re-validate production after deploy:

```bash
npm run test:live
```

---

## Actions per exercise

| Step | Action | Screenshots | Pass criteria |
|------|--------|-------------|---------------|
| 00 | Open exercise | `00_open.png` | Title correct; Start visible (except week-plan); Start hit-testable; guide + metrics collapsed |
| 01 | Hover Start | `01_hover_start_{before,after}.png` | `filter` / `boxShadow` / `transform` change; **no harmful layout shift**; center still hits Start |
| 02 | Hover mic HUD | `02_hover_mic_{before,after}.png` | HUD remains hit-testable (range input under pointer) |
| 03 | Toggle guide | `03_guide_{before,after}.png` | Collapsed → expanded; step list present |
| 04 | Toggle metrics | `04_metrics_{before,after}.png` | Collapsed → expanded; metric fields present |
| 05 | Pitch chrome (if shown) | `05_*.png` | Octave hover / piano opt / one-note check without crash |
| 06 | Mode buttons (if any) | `06_mode_btn_*.png` | Hover + click does not break rail |
| 07 | Start → Stop | `07_after_start.png`, `07_after_stop.png` | Live state; Stop returns Start; metrics **auto-open** |
| 08 | Hover Back + home | `08_hover_back.png` | Back hover feedback; return to home |

**Exceptions**

- **`v9-12-week`** (`weekPlan`): no live Start/Stop loop — plan UI only; hover Start still audited if present; live/metrics-auto = N/A.
- Pitch/mode steps run only when chrome is present for the exercise profile.

---

## Aggregate results

| Metric | Value |
|--------|------:|
| Exercises in catalog | 36 |
| With P0/P1 issues | **0** |
| Hover Start pass | **36/36** |
| Hover Start effects | `filter`, `boxShadow`, `transform` (all) |
| Guide toggle pass | **36/36** |
| Metrics toggle pass | **36/36** |
| Live Start pass | **35/35** (1 N/A week-plan) |
| Metrics auto-open after Stop | **35/35** |
| Hover Back pass | **35/35** |
| Back → home | **35/35** |
| Screenshots captured | **~520** |
| Report timestamp | `2026-07-17T06:04:58.222Z` |

### Hover Start — computed style (canonical, v1-diction)

| Property | Before | After | Expected? |
|----------|--------|-------|-----------|
| `filter` | `none` | `brightness(1.05)` | Yes — hover lift |
| `boxShadow` | `rgba(61,186,122,0.28) 0 2px 10px` | `rgba(61,186,122,0.392) 0 2.92px 11.85px` | Yes — stronger green glow |
| `transform` | `none` | `matrix(1,0,0,1,0,-0.98)` (~translateY −1px) | Yes — slight raise |
| BBox size | 95.7×40 | 95.7×40 | Yes — no reflow of neighbors |
| `hitSelf` | true → Start | true → Start | Yes — no overlay steal |
| `cursor` | `pointer` | `pointer` | Yes |

**Verdict:** Correct hover feedback; no mis-hit; no layout thrash of the practice rail.

### Guide / metrics

All exercises: guide starts **collapsed**, expands on “Mostrar pasos y consejos”, collapses cleanly. Metrics start **collapsed**, expand on toggle; after **Stop**, metrics open automatically (`metricsOpen: true`) — matches product fix from max-effort pass 3.

### Live Start / Stop

After Start: primary CTA becomes **Detener** (red/stop style); mode chip shows live (e.g. `En vivo · shAirLadder`). After Stop: **Empezar** restored; reflection card expanded with session fields.

---

## Full matrix (36 exercises)

| ID | Track | Hover Start | Hover FX | Guide (steps) | Metrics (fields) | Live | Metrics auto | Pitch chrome | Issues |
|----|-------|-------------|----------|---------------|------------------|------|--------------|--------------|-------:|
| v1-diction | vocal | PASS | filter,boxShadow,transform | PASS (5) | PASS (4) | PASS | PASS | N | 0 |
| v2-volume | vocal | PASS | filter,boxShadow,transform | PASS (4) | PASS (3) | PASS | PASS | N | 0 |
| v3-soft-palate | vocal | PASS | filter,boxShadow,transform | PASS (3) | PASS (4) | PASS | PASS | N | 0 |
| v4-articulation-pen | vocal | PASS | filter,boxShadow,transform | PASS (3) | PASS (3) | PASS | PASS | N | 0 |
| v5-neutral-ears | vocal | PASS | filter,boxShadow,transform | PASS (5) | PASS (4) | PASS | PASS | N | 0 |
| v6-connect | vocal | PASS | filter,boxShadow,transform | PASS (3) | PASS (3) | PASS | PASS | N | 0 |
| v7-record-review | vocal | PASS | filter,boxShadow,transform | PASS (6) | PASS (5) | PASS | PASS | N | 0 |
| v8-fluency-metaphors | vocal | PASS | filter,boxShadow,transform | PASS (3) | PASS (3) | PASS | PASS | N | 0 |
| v9-12-week | vocal | PASS | filter,boxShadow,transform | PASS (4) | PASS (3) | N/A | N/A | N | 0 |
| v10-power-pause | vocal | PASS | filter,boxShadow,transform | PASS (6) | PASS (4) | PASS | PASS | N | 0 |
| v11-kill-fillers | vocal | PASS | filter,boxShadow,transform | PASS (5) | PASS (4) | PASS | PASS | N | 0 |
| v12-melodic-speech | vocal | PASS | filter,boxShadow,transform | PASS (5) | PASS (4) | PASS | PASS | Y | 0 |
| v13-volume-ladder | vocal | PASS | filter,boxShadow,transform | PASS (5) | PASS (4) | PASS | PASS | N | 0 |
| v14-pace-variation | vocal | PASS | filter,boxShadow,transform | PASS (5) | PASS (4) | PASS | PASS | N | 0 |
| v15-gestures | vocal | PASS | filter,boxShadow,transform | PASS (4) | PASS (4) | PASS | PASS | N | 0 |
| v16-facial-expression | vocal | PASS | filter,boxShadow,transform | PASS (4) | PASS (4) | PASS | PASS | N | 0 |
| v17-strategic-concision | vocal | PASS | filter,boxShadow,transform | PASS (4) | PASS (4) | PASS | PASS | N | 0 |
| v18-story-peak | vocal | PASS | filter,boxShadow,transform | PASS (4) | PASS (4) | PASS | PASS | N | 0 |
| v19-authority-close | vocal | PASS | filter,boxShadow,transform | PASS (4) | PASS (4) | PASS | PASS | N | 0 |
| v20-energy-match | vocal | PASS | filter,boxShadow,transform | PASS (4) | PASS (4) | PASS | PASS | N | 0 |
| s1-vocal-fry | singing | PASS | filter,boxShadow,transform | PASS (5) | PASS (4) | PASS | PASS | Y | 0 |
| s2-solfege-chords | singing | PASS | filter,boxShadow,transform | PASS (5) | PASS (5) | PASS | PASS | Y | 0 |
| s3-song-stanzas | singing | PASS | filter,boxShadow,transform | PASS (5) | PASS (6) | PASS | PASS | Y | 0 |
| s4-lip-trills | singing | PASS | filter,boxShadow,transform | PASS (5) | PASS (4) | PASS | PASS | N | 0 |
| s5-sirens | singing | PASS | filter,boxShadow,transform | PASS (4) | PASS (4) | PASS | PASS | Y | 0 |
| s6-straw | singing | PASS | filter,boxShadow,transform | PASS (5) | PASS (4) | PASS | PASS | N | 0 |
| s7-humming | singing | PASS | filter,boxShadow,transform | PASS (5) | PASS (4) | PASS | PASS | Y | 0 |
| s8-breath-support | singing | PASS | filter,boxShadow,transform | PASS (5) | PASS (4) | PASS | PASS | Y | 0 |
| s9-pitch-match | singing | PASS | filter,boxShadow,transform | PASS (5) | PASS (4) | PASS | PASS | Y | 0 |
| s10-five-note | singing | PASS | filter,boxShadow,transform | PASS (5) | PASS (4) | PASS | PASS | Y | 0 |
| s11-dynamics | singing | PASS | filter,boxShadow,transform | PASS (5) | PASS (4) | PASS | PASS | Y | 0 |
| s12-easy-onset | singing | PASS | filter,boxShadow,transform | PASS (4) | PASS (4) | PASS | PASS | Y | 0 |
| s13-arpeggio-match | singing | PASS | filter,boxShadow,transform | PASS (5) | PASS (4) | PASS | PASS | Y | 0 |
| s14-staccato-legato | singing | PASS | filter,boxShadow,transform | PASS (5) | PASS (4) | PASS | PASS | Y | 0 |
| s15-sh-air-ladder | singing | PASS | filter,boxShadow,transform | PASS (5) | PASS (4) | PASS | PASS | N | 0 |
| s16-major-scale-coord | singing | PASS | filter,boxShadow,transform | PASS (5) | PASS (5) | PASS | PASS | Y | 0 |

---

## Sample forensic descriptions (multimodal)

### 1) `v1-diction` — Start hover (before → after)

**Scene:** Spanish UI. Header: app title, Cuenta / Pro / PRUEBA / English. Exercise chip “Vocal · básico · 1. Mejor dicción”. Stage card: status **Listo** + **05:00**, mode title **DICCIÓN · ESCALERA DE RITMO**, pace line (~72 BPM), empty progress bar, coach cue. Bottom rail: green **▶ Empezar**, grey **Grabar**, full-width MIC slider at **7**, folded guide strip “CÓMO PRACTICAR” / “Mostrar pasos y consejos”.

**Before hover:** Empezar is solid mint-green capsule; soft green glow; no brightness boost; baseline Y.

**After hover (computed + visual):** `brightness(1.05)`, stronger green box-shadow, ~1px upward translate. Button text/icon unchanged; MIC slider and Grabar do not jump; no second button steals the hit target.

**Expected vs actual:** **Match.** Intended `.btn-practice` hover polish only.

### 2) `s15-sh-air-ladder` — Guide collapse → expand

**Before:** Stage shows **ESCALERA DE AIRE SH**, meta 5s SH pareja, 0.0s timer, peldaños 0/5; guide strip folded (“Mostrar pasos y consejos”). Empezar visible; no expanded step list.

**After toggle:** Guide body open; control becomes **“Ocultar detalles”**; numbered practice steps/tips visible in the fold region (report `stepN: 5`). Stage metrics HUD still present; rail CTA unchanged.

**Expected vs actual:** **Match.** Folded-by-default guide expands without covering Start or stealing clicks.

### 3) `s15-sh-air-ladder` — Live Start → Stop + metrics auto-open

**After Start:** Primary control is **Detener** (coral/red stop affordance); live chip **“En vivo · shAirLadder”**; stage still shows ladder goals; Empezar gone. Reflects silent-mic session correctly (no false score inflation in this audit).

**After Stop:** **Empezar** restored; **REFLEXIONAR Y GUARDAR** expanded with SH-specific fields (peldaños, longest SH, air uniformity slider, notes) and CTA **Guardar sesión y puntaje**; control **“Ocultar métricas”** confirms auto-open.

**Expected vs actual:** **Match.** Start/Stop chrome swap + post-stop metrics panel behavior correct.

### 4) `s2-solfege-chords` — Pitch / mode chrome open + mode hover

**Open:** Singing basic solfege: timer **15:00**, ACORDES + MODO selects, pitch readout (C3 / ¢), empty highway canvas, bottom rail with Empezar/Grabar/MIC, octave ±, Rango / 1 nota / Arpegio / Sostener / Auto / piano toggle. Mode focus chrome live; pitch canvas present.

**Mode button hover shot:** Rail remains stable; checkboxes and octave controls readable; no overlap from glow/focus layers onto Empezar (regression guard for earlier mode-focus `pointer-events` / z-index bugs).

**Expected vs actual:** **Match.** Pitch exercises expose correct chrome; hover/click path does not obscure primary CTA.

---

## P0 checks encoded in suite

| Code | Severity | Condition |
|------|----------|-----------|
| `hidden_cta` | P0 | Start not visible (except `weekPlan`) |
| `hit_mismatch` | P0 | Element at Start center is not Start |
| Hover fail | P0 assert | `hoverFeedback(...).ok` false (no style change or hit lost) |
| Guide fail | Assert | Guide does not expand |
| Metrics fail | Assert | Metrics do not expand |
| Live fail | Assert | Start does not enter live (non-week-plan) |
| Metrics auto fail | Assert | After Stop, metrics still collapsed |

Suite final summary: `withIssues: 0`, `issues: []`.

---

## Product bugs found

**None** in this pass. Prior regressions (Start hit-target under mode-focus, metrics not opening after Stop, Space activating focused button) remain covered by this matrix + redteam suite and did not reappear.

### Non-issues / notes

| Note | Detail |
|------|--------|
| Hover `transform` may flag `layoutShift` on Back | Intentional translate; bbox moves slightly — not a reflow of the page grid |
| Residual `99_error.png` under `s9-pitch-match/` | Leftover from an earlier flaky selector fix; final run has empty `issues[]` |
| Mic HUD hover has little CSS delta | Range input is the real target; hit-top is `mic-sensitivity` — correct |
| Soft Pro forge | Still accepted risk (see doc 22); out of scope for UI hover |

---

## Files added

| Path | Role |
|------|------|
| `tests/helpers/ui-forensics.js` | `shot`, `styleSnapshot`, `hoverFeedback`, `writeReport` |
| `tests/exercise-ui-forensics.spec.js` | Serial matrix over full catalog |
| `package.json` → `test:ui-forensics` | npm script |
| `docs/23-EXERCISE-UI-FORENSICS.md` | This report |

Screenshots/JSON live under `qa/` (gitignored); re-run suite to regenerate.

---

## Conclusion

All **20 vocal + 16 singing** exercises show correct:

1. **Open state** (CTA hit-testable, folds collapsed)  
2. **Hover feedback** on Start (brightness + glow + micro-lift) without layout thrash  
3. **Guide / metrics** expand-collapse  
4. **Live Start → Stop** chrome and **auto-open metrics**  
5. **Pitch/mode chrome** where profile requires it  
6. **Back → home**

**Ship status:** UI interactivity forensics **green**. No product fix required from this audit. Deploy path is GH Pages via `main` (suite + docs only; product assets unchanged since last redteam pass).
