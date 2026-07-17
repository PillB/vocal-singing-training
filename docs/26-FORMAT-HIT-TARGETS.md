# Multi-format hit targets & click robustness

**Date:** 2026-07-17  
**Suite:** `npm run test:format-hits` → `tests/format-hit-clicks.spec.js`  
**Report:** `qa/geometry/format-hit-report.json`  
**Result:** **12 viewports × 3 exercises + resize stress — pass**

---

## Goal

Prove Start / Stop / guide / Back stay **hit-testable and clickable** across default, mobile, landscape, short desktop, and fullscreen-like sizes — with **real mouse** clicks, not only geometry overflow checks.

---

## Research applied

| Practice | Source | Application |
|----------|--------|-------------|
| Layout vs **visual** viewport | MDN CSSOM view | `fitHighwayToViewport` uses `visualViewport.height` + `offsetTop` |
| Dynamic viewport height | `dvh` / `svh` | `min-height: 100dvh` on body; stage already uses `100dvh` gaps |
| Safe areas | `env(safe-area-inset-*)` | CSS vars `--safe-*`; bottom rail `bottom: max(0.2rem, var(--safe-bottom))` |
| Hit area = painted control | Harvard DAS hit areas | Toast `pointer-events: none`; no bottom toast over rail |
| Remeasure on change | Mobile chrome / fullscreen | `visualViewport` resize/scroll + `fullscreenchange` → debounced fit |
| Progressive disclosure | NN/g (prior U8) | Compact piano opts keep Start large on phones |

---

## Formats tested

| Name | Size |
|------|------|
| desktop | 1280×800 |
| desktop-wide | 1600×900 |
| desktop-short | 1280×600 |
| laptop | 1024×768 |
| tablet | 768×1024 |
| tablet-land | 1024×600 |
| phone | 390×844 |
| phone-narrow | 360×740 |
| phone-small | 320×640 |
| phone-land | 844×390 |
| fullscreen-like | 1920×1080 |
| short-wide | 1366×500 |

Exercises: `s15-sh-air-ladder`, `v1-diction`, `s9-pitch-match`.  
Also: desktop → phone → fullscreen **mid-session resize** stress.

---

## Checks per cell

1. Stage bottom ≤ visual viewport bottom  
2. Start fully in viewport  
3. `elementFromPoint` grid on Start (center + edges)  
4. Real mouse click Start → live  
5. Stop hit grid + click → not live  
6. Guide / Back center hits (when applicable)  

---

## Issue found & fixed (this pass)

| Issue | RCA | Fix |
|-------|-----|-----|
| **Toast stole clicks** on phone/narrow/small | `.toast` fixed **bottom** + high z-index; covered Start/Stop edge samples | Move toast to **top** under header; `pointer-events: none`; suppress visual toast in e2e |
| Stage/Start clamp on short viewports | Measure used `innerHeight` only | Prefer `visualViewport`; multi-pass clamp; Start y2 guard |

---

## Product changes

| File | Change |
|------|--------|
| `js/app.js` | `getViewportMetrics`, hardened `fitHighwayToViewport`, `scheduleFitHighway`, visualViewport + fullscreen listeners, e2e-quiet toast |
| `css/styles.css` | safe-area vars, `100dvh` body, rail safe bottom, toast top + no pointer events |
| `tests/format-hit-clicks.spec.js` | Full matrix suite |
| `package.json` | `test:format-hits`, included in `test:redteam` |

---

## Commands

```bash
npm run serve
npm run test:format-hits           # full matrix
npm run test:format-hits:headed    # visual sample
```

---

## Success

All format × exercise cells green after toast + viewport hardens. Deployed on `main`.
