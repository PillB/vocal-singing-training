# Exercise UI forensics — real pointer, click, drag, Space hold

**Date:** 2026-07-17  
**Product:** Vocal Studio (GH Pages SPA)  
**Live URL:** https://pillb.github.io/vocal-singing-training/  
**Suite:** `tests/exercise-ui-forensics.spec.js` + `tests/helpers/ui-forensics.js`  
**Mode:** `real-pointer-keyboard` (Playwright `mouse.move` / `mouse.click` / drag / `keyboard.down|up Space`)  
**Artifacts:** `qa/screenshots/exercise-ui/{id}/` (~732 PNGs), `qa/geometry/exercise-ui-report.json`  
**Result:** **36/36 exercises · 0 issues · 0 product bugs**

---

## Goal

For **every** vocal and singing exercise, emulate a real user:

1. **Move the mouse** onto controls (stepped path, not CSS-only)  
2. **Press/click** with full mouse click sequence  
3. **Drag** the mic sensitivity slider  
4. **Hold Space** while live (Stop focused) — must not activate Stop  
5. Screenshot **before/after** each key action  
6. Diff computed styles + hit targets; sample multimodal forensic review  

Not hundreds of image captions in chat: full **automated matrix** + **sample** forensic prose.

---

## How to run

```bash
npm run serve                 # terminal 1
npm run test:ui-forensics     # headless CDP mouse/keyboard (real events)
npm run test:ui-forensics:headed   # optional visible browser
```

---

## Emulation methods

| Helper | Input | Notes |
|--------|--------|------|
| `realHover` | `scrollIntoView` → `mouse.move` steps | Required: raw coords do **not** auto-scroll |
| `realClick` | hover path + `mouse.click(x,y,{delay})` | Full click event (not bare down/up alone) |
| `realDragX` | down → move → up on `#mic-sensitivity` | Confirms range value changes |
| Space | `keyboard.down('Space')` … hold … `up` | Focus Stop first; assert still live |

**Harness fix (2026-07-17):** First real-pointer pass failed guide/metrics/back with P0 because off-screen targets were clicked without scroll. Product handlers were fine; helpers now always scroll into view.

---

## Action matrix (per exercise)

| Step | Action | Emulation | Screenshots |
|------|--------|-----------|-------------|
| 00 | Open | — | `00_open.png` |
| 01 | Hover Start | `mouse.move` steps | `01_hover_start_{before,after}.png` |
| 02 | Hover + **drag mic** | move + down/move/up | `02_hover_mic_*`, `02_drag_mic_*` |
| 03 | Guide toggle | scroll + `mouse.click` | `03_guide_{before,after}.png` |
| 04 | Metrics toggle | scroll + `mouse.click` | `04_metrics_{before,after}.png` |
| 05 | Pitch chrome | hover / click | `05_*` |
| 06 | Mode button | scroll + click | `06_*` |
| 07 | Start press | `mouse.click` | `07_start_press_before`, `07_after_start` |
| 07b | **Space hold** (Stop focused) | keyboard Space down/up | `07_space_{before,hold,after}` |
| 07c | Stop | `mouse.click` | `07_after_stop` |
| 08 | Back home | scroll top + hover + click | `08_hover_back` |

**Exceptions:** `v9-12-week` (`weekPlan`) — no live/Space loop.

---

## Aggregate results (real-pointer run)

| Metric | Value |
|--------|------:|
| Exercises | 36 |
| Issues (any sev) | **0** |
| Hover Start pass | **36/36** |
| Guide toggle | **36/36** |
| Metrics toggle | **36/36** |
| Mic drag value change | **36/36** |
| Live Start | **35/35** |
| Space did **not** stop (Stop focused) | **35/35** |
| Space mid-hold `is-manual` chip | **21/35** (soft — not all modes style the chip) |
| Metrics auto-open after Stop | **35/35** |
| Back → home | **35/35** (+ week-plan path) |
| Screenshots | **~732** |
| Report mode | `real-pointer-keyboard` |

### Hover Start — computed style (v1-diction, real mouse path)

| Property | Before | After | Expected? |
|----------|--------|-------|-----------|
| `filter` | `none` | `brightness(1.05)` | Yes |
| `boxShadow` | soft green | stronger green glow | Yes |
| `transform` | `none` | `translateY(-1px)` | Yes |
| `hitTop` | Start button | Start button | Yes |
| Layout jump | — | ≤1px | OK |

### Space hold (Stop focused)

| Check | Result |
|-------|--------|
| Still `live` mid-hold | Pass 35/35 |
| Still `live` after release | Pass 35/35 |
| Does **not** fire Stop | Pass |
| SH ladder hold advances under silence + Space | Pass (e.g. 0.8s on s15 mid-hold) |
| Speech rate ladder progresses under Space | Pass (v1 shows rate progress while live) |

---

## Full matrix

| ID | Hover | Guide | Metrics | Live | Space no-stop | Manual chip | Stop→metrics | Back |
|----|-------|-------|---------|------|---------------|-------------|--------------|------|
| v1-diction | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| v2-volume | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| v3-soft-palate | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| v4-articulation-pen | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| v5-neutral-ears | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| v6-connect | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| v7-record-review | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| v8-fluency-metaphors | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| v9-12-week | PASS | PASS | PASS | N/A | N/A | — | N/A | PASS* |
| v10-power-pause | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| v11-kill-fillers | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| v12-melodic-speech | PASS | PASS | PASS | PASS | PASS | n | PASS | PASS |
| v13-volume-ladder | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| v14-pace-variation | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| v15-gestures | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| v16-facial-expression | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| v17-strategic-concision | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| v18-story-peak | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| v19-authority-close | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| v20-energy-match | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| s1-vocal-fry | PASS | PASS | PASS | PASS | PASS | n | PASS | PASS |
| s2-solfege-chords | PASS | PASS | PASS | PASS | PASS | n | PASS | PASS |
| s3-song-stanzas | PASS | PASS | PASS | PASS | PASS | n | PASS | PASS |
| s4-lip-trills | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| s5-sirens | PASS | PASS | PASS | PASS | PASS | n | PASS | PASS |
| s6-straw | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| s7-humming | PASS | PASS | PASS | PASS | PASS | n | PASS | PASS |
| s8-breath-support | PASS | PASS | PASS | PASS | PASS | n | PASS | PASS |
| s9-pitch-match | PASS | PASS | PASS | PASS | PASS | n | PASS | PASS |
| s10-five-note | PASS | PASS | PASS | PASS | PASS | n | PASS | PASS |
| s11-dynamics | PASS | PASS | PASS | PASS | PASS | n | PASS | PASS |
| s12-easy-onset | PASS | PASS | PASS | PASS | PASS | n | PASS | PASS |
| s13-arpeggio-match | PASS | PASS | PASS | PASS | PASS | n | PASS | PASS |
| s14-staccato-legato | PASS | PASS | PASS | PASS | PASS | n | PASS | PASS |
| s15-sh-air-ladder | PASS | PASS | PASS | PASS | PASS | Y | PASS | PASS |
| s16-major-scale-coord | PASS | PASS | PASS | PASS | PASS | n | PASS | PASS |

\* Week-plan has no live Space loop; Back/home covered without P0.

`is-manual` chip is a soft signal (HUD class). **Hard P0** is only “Space must not stop practice while Stop is focused.”

---

## Sample forensic descriptions

### 1) v1 Start hover (real `mouse.move` path)

**Before:** Resting mint **Empezar**; soft green shadow; MIC at 7; stage “Listo 05:00”; guide folded.  
**After:** Same layout; Start gains brightness + stronger glow + 1px lift (computed). Hit target remains `#btn-practice-start`. Neighbors (Grabar, MIC) do not jump.  
**Verdict:** **Correct** hover feedback.

### 2) v1 mic drag

**Before:** Thumb near right; numeric **7**.  
**After real drag −48px:** Thumb leftward; value **5**. Stage/CTA unchanged.  
**Verdict:** **Correct** range interaction via mouse drag.

### 3) v1 Space hold while live (Stop focused)

Live state: **Detener** coral, status “En vivo · rateLadder”, progress advancing (e.g. 7.4s / rate phase). Mic HUD can show manual assist styling. Practice **does not** end mid-hold or after release.  
**Verdict:** **Correct** — Space is assist, not button activation.

### 4) s15 SH ladder Space hold

Silent mic + Space: hold timer advances (e.g. **0.8s** / Mejor 0.8s); **Detener** still present; live chip `shAirLadder`.  
**Verdict:** **Correct** Space latch / air assist under silence.

### 5) Guide expand / metrics after Stop

Guide: collapsed → steps list; metrics after Stop: reflection form open with fields.  
**Verdict:** **Correct** (matches `openMetricsPanel` product behavior).

---

## Product bugs

**None** in this pass.

| Non-issue | Detail |
|-----------|--------|
| Missing `is-manual` on some pitch modes | Soft UI signal; Space still does not stop |
| Hover translateY 1px | Intentional; not layout thrash |
| Soft Pro forge | Accepted risk (doc 22) |

---

## Files

| Path | Role |
|------|------|
| `tests/helpers/ui-forensics.js` | `realHover`, `realClick`, `realDragX`, `spaceHold`, style/hit probes |
| `tests/exercise-ui-forensics.spec.js` | Serial matrix all catalog exercises |
| `package.json` | `test:ui-forensics`, `test:ui-forensics:headed` |
| `docs/23-EXERCISE-UI-FORENSICS.md` | This report |

Screenshots/JSON under `qa/` are gitignored; regenerate with `npm run test:ui-forensics`.

---

## Conclusion

All **20 vocal + 16 singing** exercises were exercised with **real mouse movement, click, mic drag, and Space hold/release**. Hover styles, hit targets, toggles, live Start/Stop, Space non-activation of Stop, and Back→home all **pass**. No product code change required after harness scroll fix.
