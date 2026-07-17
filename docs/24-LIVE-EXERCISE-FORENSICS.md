# Live exercise UI forensics (headed, mouse, Space, mic)

**Generated:** 2026-07-17T19:44:48.363Z
**Mode:** headed-live-forensics
**Live duration:** 10s per exercise
**Result:** 36 exercises · **0 with issues** · P0=0

## Aggregate

| Metric | Value |
|--------|------:|
| hoverStartOk | 36 |
| micDragOk | 36 |
| liveOk | 35 |
| silenceGateOk | 35 |
| silenceGateN | 35 |
| spaceLongOk | 35 |
| spaceShortOk | 35 |
| liveSecondsCaptured | 350 |
| total | 36 |
| withIssues | 0 |

## Findings / improvements

_No automated P0/P1 issues from this headed pass._

### Soft improvements (not failures)

| Area | Observation | Suggestion |
|------|-------------|------------|
| Probe ambiguity | Some non-gated modes expose large numbers via `[data-h]` / `.mode-big` (e.g. rate ladder countdown-like values) | Prefer mode-specific selectors for “count under silence” audits |
| Space UX | `is-manual` chip appears on long/short Space when assist is active — good | Keep capture-phase Space preventDefault (already in product) |
| Silence gate | All sound-gated modes (SH, pitch hold, SOVT, scales, etc.) held **0** on silent mic for 2s | Keep as regression lock in suite |
| Mic | Drag changes sensitivity on all 36 | None |
| Headed runtime | Full matrix ~16m with `SLOWMO=50`, `LIVE_SECS=10` | Use `FORENSICS_IDS` for smoke; full run before release |

### Hard locks verified this run

- Hover Start style feedback: **36/36**
- Mic drag changes value: **36/36**
- Live Start: **35/35** (week-plan N/A)
- Silence does not auto-count sound-gated modes: **35/35** silence checks OK
- Space long-hold (Stop focused) does not stop: **35/35**
- Space short tap does not stop: **35/35**
- 10s live × before/after screenshots: **350** second-pairs

## Per-exercise image index + forensic notes

### v1-diction — Better Diction (`rateLadder`)

**Notes:**
- Profile mode=rateLadder showPitch=false soundGated=false allowManual=true
- Mic drag 7→5 (restored)
- Silence 2s: gated=false hold 74→72 PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v1-diction/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v1-diction/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v1-diction/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v1-diction/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v1-diction/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 7→5 |
| 6 | `v1-diction/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `v1-diction/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `v1-diction/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | timer modes may tick; no crash | hold=74 |
| 9 | `v1-diction/05_silence_after_2s.png` | Silence gate t=2s still silent | stable live | hold=72 live=true |
| 10 | `v1-diction/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `v1-diction/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=71 |
| 12 | `v1-diction/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `v1-diction/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `v1-diction/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `v1-diction/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `v1-diction/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=70 status=En vivo manual=true |
| 17 | `v1-diction/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=69 live=true |
| 18 | `v1-diction/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=68 status=En vivo manual=false |
| 19 | `v1-diction/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=67 live=true |
| 20 | `v1-diction/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=67 status=En vivo manual=false |
| 21 | `v1-diction/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=66 live=true |
| 22 | `v1-diction/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=66 status=En vivo manual=false |
| 23 | `v1-diction/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=65 live=true |
| 24 | `v1-diction/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=65 status=En vivo manual=false |
| 25 | `v1-diction/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=64 live=true |
| 26 | `v1-diction/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=64 status=En vivo manual=false |
| 27 | `v1-diction/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=63 live=true |
| 28 | `v1-diction/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=62 status=En vivo manual=false |
| 29 | `v1-diction/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=61 live=true |
| 30 | `v1-diction/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=61 status=En vivo manual=false |
| 31 | `v1-diction/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=60 live=true |
| 32 | `v1-diction/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=60 status=En vivo manual=false |
| 33 | `v1-diction/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=59 live=true |
| 34 | `v1-diction/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=59 status=En vivo manual=false |
| 35 | `v1-diction/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=58 live=true |
| 36 | `v1-diction/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `v1-diction/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `v1-diction/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=false hold0=74 hold1=72 **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### v2-volume — Maintain Volume (`volumeSteady`)

**Notes:**
- Profile mode=volumeSteady showPitch=false soundGated=false allowManual=true
- Mic drag 6→5 (restored)
- Silence 2s: gated=false hold null→null PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v2-volume/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v2-volume/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v2-volume/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v2-volume/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v2-volume/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→5 |
| 6 | `v2-volume/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `v2-volume/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `v2-volume/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | timer modes may tick; no crash | hold=null |
| 9 | `v2-volume/05_silence_after_2s.png` | Silence gate t=2s still silent | stable live | hold=null live=true |
| 10 | `v2-volume/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `v2-volume/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=null |
| 12 | `v2-volume/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `v2-volume/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `v2-volume/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `v2-volume/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `v2-volume/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=true |
| 17 | `v2-volume/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 18 | `v2-volume/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 19 | `v2-volume/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 20 | `v2-volume/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 21 | `v2-volume/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 22 | `v2-volume/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 23 | `v2-volume/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 24 | `v2-volume/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 25 | `v2-volume/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 26 | `v2-volume/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 27 | `v2-volume/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 28 | `v2-volume/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 29 | `v2-volume/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 30 | `v2-volume/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 31 | `v2-volume/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 32 | `v2-volume/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 33 | `v2-volume/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 34 | `v2-volume/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 35 | `v2-volume/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 36 | `v2-volume/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `v2-volume/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `v2-volume/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=false hold0=null hold1=null **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### v3-soft-palate — Lift Soft Palate (`countPace`)

**Notes:**
- Profile mode=countPace showPitch=false soundGated=false allowManual=true
- Mic drag 6→5 (restored)
- Silence 2s: gated=false hold 0→0 PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v3-soft-palate/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v3-soft-palate/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v3-soft-palate/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v3-soft-palate/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v3-soft-palate/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→5 |
| 6 | `v3-soft-palate/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `v3-soft-palate/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `v3-soft-palate/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | timer modes may tick; no crash | hold=0 |
| 9 | `v3-soft-palate/05_silence_after_2s.png` | Silence gate t=2s still silent | stable live | hold=0 live=true |
| 10 | `v3-soft-palate/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `v3-soft-palate/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=0 |
| 12 | `v3-soft-palate/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `v3-soft-palate/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `v3-soft-palate/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `v3-soft-palate/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `v3-soft-palate/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=true |
| 17 | `v3-soft-palate/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 18 | `v3-soft-palate/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 19 | `v3-soft-palate/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 20 | `v3-soft-palate/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 21 | `v3-soft-palate/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 22 | `v3-soft-palate/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 23 | `v3-soft-palate/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 24 | `v3-soft-palate/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 25 | `v3-soft-palate/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 26 | `v3-soft-palate/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 27 | `v3-soft-palate/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 28 | `v3-soft-palate/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 29 | `v3-soft-palate/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 30 | `v3-soft-palate/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 31 | `v3-soft-palate/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 32 | `v3-soft-palate/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 33 | `v3-soft-palate/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 34 | `v3-soft-palate/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 35 | `v3-soft-palate/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 36 | `v3-soft-palate/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `v3-soft-palate/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `v3-soft-palate/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=false hold0=0 hold1=0 **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### v4-articulation-pen — Improve Articulation (Pen) (`articulationContrast`)

**Notes:**
- Profile mode=articulationContrast showPitch=false soundGated=false allowManual=true
- Mic drag 6→5 (restored)
- Silence 2s: gated=false hold 90→88 PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v4-articulation-pen/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v4-articulation-pen/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v4-articulation-pen/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v4-articulation-pen/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v4-articulation-pen/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→5 |
| 6 | `v4-articulation-pen/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `v4-articulation-pen/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `v4-articulation-pen/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | timer modes may tick; no crash | hold=90 |
| 9 | `v4-articulation-pen/05_silence_after_2s.png` | Silence gate t=2s still silent | stable live | hold=88 live=true |
| 10 | `v4-articulation-pen/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `v4-articulation-pen/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=86 |
| 12 | `v4-articulation-pen/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `v4-articulation-pen/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `v4-articulation-pen/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `v4-articulation-pen/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `v4-articulation-pen/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=85 status=En vivo manual=true |
| 17 | `v4-articulation-pen/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=84 live=true |
| 18 | `v4-articulation-pen/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=84 status=En vivo manual=false |
| 19 | `v4-articulation-pen/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=83 live=true |
| 20 | `v4-articulation-pen/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=83 status=En vivo manual=false |
| 21 | `v4-articulation-pen/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=82 live=true |
| 22 | `v4-articulation-pen/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=82 status=En vivo manual=false |
| 23 | `v4-articulation-pen/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=80 live=true |
| 24 | `v4-articulation-pen/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=80 status=En vivo manual=false |
| 25 | `v4-articulation-pen/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=79 live=true |
| 26 | `v4-articulation-pen/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=79 status=En vivo manual=false |
| 27 | `v4-articulation-pen/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=78 live=true |
| 28 | `v4-articulation-pen/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=78 status=En vivo manual=false |
| 29 | `v4-articulation-pen/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=77 live=true |
| 30 | `v4-articulation-pen/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=77 status=En vivo manual=false |
| 31 | `v4-articulation-pen/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=76 live=true |
| 32 | `v4-articulation-pen/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=76 status=En vivo manual=false |
| 33 | `v4-articulation-pen/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=75 live=true |
| 34 | `v4-articulation-pen/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=75 status=En vivo manual=false |
| 35 | `v4-articulation-pen/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=73 live=true |
| 36 | `v4-articulation-pen/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `v4-articulation-pen/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `v4-articulation-pen/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=false hold0=90 hold1=88 **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### v5-neutral-ears — Neutral Ears (Persona & Story) (`recordOnly`)

**Notes:**
- Profile mode=recordOnly showPitch=false soundGated=false allowManual=true
- Mic drag 6→5 (restored)
- Silence 2s: gated=false hold 0→2 PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v5-neutral-ears/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v5-neutral-ears/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v5-neutral-ears/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v5-neutral-ears/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v5-neutral-ears/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→5 |
| 6 | `v5-neutral-ears/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `v5-neutral-ears/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `v5-neutral-ears/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | timer modes may tick; no crash | hold=0 |
| 9 | `v5-neutral-ears/05_silence_after_2s.png` | Silence gate t=2s still silent | stable live | hold=2 live=true |
| 10 | `v5-neutral-ears/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `v5-neutral-ears/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=4 |
| 12 | `v5-neutral-ears/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `v5-neutral-ears/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `v5-neutral-ears/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `v5-neutral-ears/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `v5-neutral-ears/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=5 status=En vivo manual=true |
| 17 | `v5-neutral-ears/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=6 live=true |
| 18 | `v5-neutral-ears/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=6 status=En vivo manual=false |
| 19 | `v5-neutral-ears/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=7 live=true |
| 20 | `v5-neutral-ears/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=7 status=En vivo manual=false |
| 21 | `v5-neutral-ears/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=8 live=true |
| 22 | `v5-neutral-ears/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=8 status=En vivo manual=false |
| 23 | `v5-neutral-ears/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=10 live=true |
| 24 | `v5-neutral-ears/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=10 status=En vivo manual=false |
| 25 | `v5-neutral-ears/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=11 live=true |
| 26 | `v5-neutral-ears/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=11 status=En vivo manual=false |
| 27 | `v5-neutral-ears/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=12 live=true |
| 28 | `v5-neutral-ears/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=12 status=En vivo manual=false |
| 29 | `v5-neutral-ears/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=13 live=true |
| 30 | `v5-neutral-ears/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=13 status=En vivo manual=false |
| 31 | `v5-neutral-ears/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=14 live=true |
| 32 | `v5-neutral-ears/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=14 status=En vivo manual=false |
| 33 | `v5-neutral-ears/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=15 live=true |
| 34 | `v5-neutral-ears/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=16 status=En vivo manual=false |
| 35 | `v5-neutral-ears/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=17 live=true |
| 36 | `v5-neutral-ears/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `v5-neutral-ears/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `v5-neutral-ears/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=false hold0=0 hold1=2 **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### v6-connect — How to Connect (`speechEnergy`)

**Notes:**
- Profile mode=speechEnergy showPitch=false soundGated=false allowManual=true
- Mic drag 6→5 (restored)
- Silence 2s: gated=false hold null→null PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v6-connect/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v6-connect/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v6-connect/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v6-connect/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v6-connect/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→5 |
| 6 | `v6-connect/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `v6-connect/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `v6-connect/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | timer modes may tick; no crash | hold=null |
| 9 | `v6-connect/05_silence_after_2s.png` | Silence gate t=2s still silent | stable live | hold=null live=true |
| 10 | `v6-connect/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `v6-connect/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=null |
| 12 | `v6-connect/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `v6-connect/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `v6-connect/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `v6-connect/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `v6-connect/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=true |
| 17 | `v6-connect/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 18 | `v6-connect/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 19 | `v6-connect/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 20 | `v6-connect/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 21 | `v6-connect/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 22 | `v6-connect/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 23 | `v6-connect/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 24 | `v6-connect/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 25 | `v6-connect/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 26 | `v6-connect/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 27 | `v6-connect/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 28 | `v6-connect/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 29 | `v6-connect/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 30 | `v6-connect/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 31 | `v6-connect/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 32 | `v6-connect/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 33 | `v6-connect/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 34 | `v6-connect/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 35 | `v6-connect/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 36 | `v6-connect/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `v6-connect/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `v6-connect/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=false hold0=null hold1=null **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### v7-record-review — Record & Review (`reviewSession`)

**Notes:**
- Profile mode=reviewSession showPitch=false soundGated=false allowManual=true
- Mic drag 6→5 (restored)
- Silence 2s: gated=false hold 0→2 PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v7-record-review/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v7-record-review/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v7-record-review/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v7-record-review/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v7-record-review/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→5 |
| 6 | `v7-record-review/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `v7-record-review/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `v7-record-review/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | timer modes may tick; no crash | hold=0 |
| 9 | `v7-record-review/05_silence_after_2s.png` | Silence gate t=2s still silent | stable live | hold=2 live=true |
| 10 | `v7-record-review/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `v7-record-review/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=4 |
| 12 | `v7-record-review/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `v7-record-review/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `v7-record-review/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `v7-record-review/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `v7-record-review/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=5 status=En vivo manual=true |
| 17 | `v7-record-review/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=6 live=true |
| 18 | `v7-record-review/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=6 status=En vivo manual=false |
| 19 | `v7-record-review/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=7 live=true |
| 20 | `v7-record-review/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=7 status=En vivo manual=false |
| 21 | `v7-record-review/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=8 live=true |
| 22 | `v7-record-review/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=8 status=En vivo manual=false |
| 23 | `v7-record-review/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=9 live=true |
| 24 | `v7-record-review/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=10 status=En vivo manual=false |
| 25 | `v7-record-review/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=11 live=true |
| 26 | `v7-record-review/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=11 status=En vivo manual=false |
| 27 | `v7-record-review/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=12 live=true |
| 28 | `v7-record-review/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=12 status=En vivo manual=false |
| 29 | `v7-record-review/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=13 live=true |
| 30 | `v7-record-review/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=13 status=En vivo manual=false |
| 31 | `v7-record-review/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=14 live=true |
| 32 | `v7-record-review/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=14 status=En vivo manual=false |
| 33 | `v7-record-review/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=15 live=true |
| 34 | `v7-record-review/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=15 status=En vivo manual=false |
| 35 | `v7-record-review/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=17 live=true |
| 36 | `v7-record-review/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `v7-record-review/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `v7-record-review/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=false hold0=0 hold1=2 **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### v8-fluency-metaphors — Improve Fluency (Metaphors) (`metronomeSpeech`)

**Notes:**
- Profile mode=metronomeSpeech showPitch=false soundGated=false allowManual=true
- Mic drag 6→5 (restored)
- Silence 2s: gated=false hold 60→58 PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v8-fluency-metaphors/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v8-fluency-metaphors/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v8-fluency-metaphors/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v8-fluency-metaphors/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v8-fluency-metaphors/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→5 |
| 6 | `v8-fluency-metaphors/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `v8-fluency-metaphors/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `v8-fluency-metaphors/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | timer modes may tick; no crash | hold=60 |
| 9 | `v8-fluency-metaphors/05_silence_after_2s.png` | Silence gate t=2s still silent | stable live | hold=58 live=true |
| 10 | `v8-fluency-metaphors/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `v8-fluency-metaphors/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=56 |
| 12 | `v8-fluency-metaphors/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `v8-fluency-metaphors/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `v8-fluency-metaphors/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `v8-fluency-metaphors/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `v8-fluency-metaphors/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=55 status=En vivo manual=true |
| 17 | `v8-fluency-metaphors/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=54 live=true |
| 18 | `v8-fluency-metaphors/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=54 status=En vivo manual=false |
| 19 | `v8-fluency-metaphors/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=53 live=true |
| 20 | `v8-fluency-metaphors/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=53 status=En vivo manual=false |
| 21 | `v8-fluency-metaphors/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=52 live=true |
| 22 | `v8-fluency-metaphors/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=51 status=En vivo manual=false |
| 23 | `v8-fluency-metaphors/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=50 live=true |
| 24 | `v8-fluency-metaphors/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=50 status=En vivo manual=false |
| 25 | `v8-fluency-metaphors/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=49 live=true |
| 26 | `v8-fluency-metaphors/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=49 status=En vivo manual=false |
| 27 | `v8-fluency-metaphors/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=48 live=true |
| 28 | `v8-fluency-metaphors/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=48 status=En vivo manual=false |
| 29 | `v8-fluency-metaphors/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=47 live=true |
| 30 | `v8-fluency-metaphors/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=47 status=En vivo manual=false |
| 31 | `v8-fluency-metaphors/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=46 live=true |
| 32 | `v8-fluency-metaphors/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=46 status=En vivo manual=false |
| 33 | `v8-fluency-metaphors/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=44 live=true |
| 34 | `v8-fluency-metaphors/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=44 status=En vivo manual=false |
| 35 | `v8-fluency-metaphors/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=43 live=true |
| 36 | `v8-fluency-metaphors/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `v8-fluency-metaphors/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `v8-fluency-metaphors/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=false hold0=60 hold1=58 **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### v9-12-week — 12-Week Improvement Plan (`weekPlan`)

**Notes:**
- Profile mode=weekPlan showPitch=false soundGated=false allowManual=true
- Mic drag 6→5 (restored)
- weekPlan: skip live/Space/silence gate

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v9-12-week/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v9-12-week/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v9-12-week/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v9-12-week/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v9-12-week/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→5 |
| 6 | `v9-12-week/04_week_plan.png` | Week plan UI | Plan controls visible | N/A live |
| 7 | `v9-12-week/10_hover_back.png` | Hover Back | Returns home on click | hover |

### v10-power-pause — Power of the Pause (`pauseDetect`)

**Notes:**
- Profile mode=pauseDetect showPitch=false soundGated=false allowManual=true
- Mic drag 6→5 (restored)
- Silence 2s: gated=false hold 0→0 PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v10-power-pause/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v10-power-pause/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v10-power-pause/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v10-power-pause/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v10-power-pause/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→5 |
| 6 | `v10-power-pause/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `v10-power-pause/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `v10-power-pause/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | timer modes may tick; no crash | hold=0 |
| 9 | `v10-power-pause/05_silence_after_2s.png` | Silence gate t=2s still silent | stable live | hold=0 live=true |
| 10 | `v10-power-pause/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `v10-power-pause/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=0 |
| 12 | `v10-power-pause/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `v10-power-pause/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `v10-power-pause/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `v10-power-pause/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `v10-power-pause/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=true |
| 17 | `v10-power-pause/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 18 | `v10-power-pause/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 19 | `v10-power-pause/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 20 | `v10-power-pause/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=1 status=En vivo manual=false |
| 21 | `v10-power-pause/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=1 live=true |
| 22 | `v10-power-pause/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=1 status=En vivo manual=false |
| 23 | `v10-power-pause/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=1 live=true |
| 24 | `v10-power-pause/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=1 status=En vivo manual=false |
| 25 | `v10-power-pause/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=1 live=true |
| 26 | `v10-power-pause/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=1 status=En vivo manual=false |
| 27 | `v10-power-pause/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=1 live=true |
| 28 | `v10-power-pause/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=1 status=En vivo manual=false |
| 29 | `v10-power-pause/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=1 live=true |
| 30 | `v10-power-pause/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=1 status=En vivo manual=false |
| 31 | `v10-power-pause/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=1 live=true |
| 32 | `v10-power-pause/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=1 status=En vivo manual=false |
| 33 | `v10-power-pause/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=1 live=true |
| 34 | `v10-power-pause/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=1 status=En vivo manual=false |
| 35 | `v10-power-pause/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=1 live=true |
| 36 | `v10-power-pause/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `v10-power-pause/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `v10-power-pause/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=false hold0=0 hold1=0 **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### v11-kill-fillers — Kill the Fillers (`fillerDetect`)

**Notes:**
- Profile mode=fillerDetect showPitch=false soundGated=false allowManual=true
- Mic drag 6→5 (restored)
- Silence 2s: gated=false hold null→null PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v11-kill-fillers/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v11-kill-fillers/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v11-kill-fillers/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v11-kill-fillers/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v11-kill-fillers/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→5 |
| 6 | `v11-kill-fillers/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `v11-kill-fillers/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `v11-kill-fillers/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | timer modes may tick; no crash | hold=null |
| 9 | `v11-kill-fillers/05_silence_after_2s.png` | Silence gate t=2s still silent | stable live | hold=null live=true |
| 10 | `v11-kill-fillers/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `v11-kill-fillers/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=null |
| 12 | `v11-kill-fillers/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `v11-kill-fillers/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `v11-kill-fillers/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `v11-kill-fillers/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `v11-kill-fillers/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=true |
| 17 | `v11-kill-fillers/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 18 | `v11-kill-fillers/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 19 | `v11-kill-fillers/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 20 | `v11-kill-fillers/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 21 | `v11-kill-fillers/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 22 | `v11-kill-fillers/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 23 | `v11-kill-fillers/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 24 | `v11-kill-fillers/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 25 | `v11-kill-fillers/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 26 | `v11-kill-fillers/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 27 | `v11-kill-fillers/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 28 | `v11-kill-fillers/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 29 | `v11-kill-fillers/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 30 | `v11-kill-fillers/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 31 | `v11-kill-fillers/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 32 | `v11-kill-fillers/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 33 | `v11-kill-fillers/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 34 | `v11-kill-fillers/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 35 | `v11-kill-fillers/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 36 | `v11-kill-fillers/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `v11-kill-fillers/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `v11-kill-fillers/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=false hold0=null hold1=null **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### v12-melodic-speech — Melodic Speech & Tonality (`pitchContour`)

**Notes:**
- Profile mode=pitchContour showPitch=true soundGated=true allowManual=true
- Mic drag 6→2 (restored)
- Silence 2s: gated=true hold null→null PASS
- Space long: live mid/after=true/true manual=false; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v12-melodic-speech/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v12-melodic-speech/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v12-melodic-speech/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v12-melodic-speech/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v12-melodic-speech/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→2 |
| 6 | `v12-melodic-speech/03_highway_open.png` | Pitch highway / piano chrome | Canvas or pitch block visible for showPitch profile | pitch profile active |
| 7 | `v12-melodic-speech/04_start_before.png` | Before Start click | Ready state | about to start |
| 8 | `v12-melodic-speech/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 9 | `v12-melodic-speech/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | hold/count stays ~0 without air/Space | hold=null |
| 10 | `v12-melodic-speech/05_silence_after_2s.png` | Silence gate t=2s still silent | hold/count still ~0 | hold=null live=true |
| 11 | `v12-melodic-speech/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 12 | `v12-melodic-speech/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=false hold=null |
| 13 | `v12-melodic-speech/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=false |
| 14 | `v12-melodic-speech/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 15 | `v12-melodic-speech/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=false |
| 16 | `v12-melodic-speech/07_space_short_release.png` | After short Space release | Still live | live=true |
| 17 | `v12-melodic-speech/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 18 | `v12-melodic-speech/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 19 | `v12-melodic-speech/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 20 | `v12-melodic-speech/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 21 | `v12-melodic-speech/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 22 | `v12-melodic-speech/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 23 | `v12-melodic-speech/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 24 | `v12-melodic-speech/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 25 | `v12-melodic-speech/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 26 | `v12-melodic-speech/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 27 | `v12-melodic-speech/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 28 | `v12-melodic-speech/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 29 | `v12-melodic-speech/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 30 | `v12-melodic-speech/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 31 | `v12-melodic-speech/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 32 | `v12-melodic-speech/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 33 | `v12-melodic-speech/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 34 | `v12-melodic-speech/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 35 | `v12-melodic-speech/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 36 | `v12-melodic-speech/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 37 | `v12-melodic-speech/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 38 | `v12-melodic-speech/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 39 | `v12-melodic-speech/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=true hold0=null hold1=null **PASS**

Space: longHold didNotStop=true isManual=false shortPulse didNotStop=true

### v13-volume-ladder — Volume Ladder (`volumeLadder`)

**Notes:**
- Profile mode=volumeLadder showPitch=false soundGated=false allowManual=true
- Mic drag 9→5 (restored)
- Silence 2s: gated=false hold 8→6 PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v13-volume-ladder/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v13-volume-ladder/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v13-volume-ladder/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v13-volume-ladder/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v13-volume-ladder/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 9→5 |
| 6 | `v13-volume-ladder/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `v13-volume-ladder/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `v13-volume-ladder/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | timer modes may tick; no crash | hold=8 |
| 9 | `v13-volume-ladder/05_silence_after_2s.png` | Silence gate t=2s still silent | stable live | hold=6 live=true |
| 10 | `v13-volume-ladder/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `v13-volume-ladder/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=4 |
| 12 | `v13-volume-ladder/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `v13-volume-ladder/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `v13-volume-ladder/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `v13-volume-ladder/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `v13-volume-ladder/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=true |
| 17 | `v13-volume-ladder/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=2 live=true |
| 18 | `v13-volume-ladder/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=2 status=En vivo manual=false |
| 19 | `v13-volume-ladder/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=1 live=true |
| 20 | `v13-volume-ladder/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=1 status=En vivo manual=false |
| 21 | `v13-volume-ladder/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=7 live=true |
| 22 | `v13-volume-ladder/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=7 status=En vivo manual=false |
| 23 | `v13-volume-ladder/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=6 live=true |
| 24 | `v13-volume-ladder/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=6 status=En vivo manual=false |
| 25 | `v13-volume-ladder/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=5 live=true |
| 26 | `v13-volume-ladder/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=5 status=En vivo manual=false |
| 27 | `v13-volume-ladder/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=4 live=true |
| 28 | `v13-volume-ladder/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=4 status=En vivo manual=false |
| 29 | `v13-volume-ladder/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 30 | `v13-volume-ladder/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=false |
| 31 | `v13-volume-ladder/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=1 live=true |
| 32 | `v13-volume-ladder/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=1 status=En vivo manual=false |
| 33 | `v13-volume-ladder/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=8 live=true |
| 34 | `v13-volume-ladder/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=8 status=En vivo manual=false |
| 35 | `v13-volume-ladder/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=7 live=true |
| 36 | `v13-volume-ladder/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `v13-volume-ladder/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `v13-volume-ladder/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=false hold0=8 hold1=6 **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### v14-pace-variation — Pace Variation for Impact (`keyPointPace`)

**Notes:**
- Profile mode=keyPointPace showPitch=false soundGated=false allowManual=true
- Mic drag 6→5 (restored)
- Silence 2s: gated=false hold 3→3 PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v14-pace-variation/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v14-pace-variation/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v14-pace-variation/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v14-pace-variation/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v14-pace-variation/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→5 |
| 6 | `v14-pace-variation/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `v14-pace-variation/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `v14-pace-variation/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | timer modes may tick; no crash | hold=3 |
| 9 | `v14-pace-variation/05_silence_after_2s.png` | Silence gate t=2s still silent | stable live | hold=3 live=true |
| 10 | `v14-pace-variation/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `v14-pace-variation/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=3 |
| 12 | `v14-pace-variation/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `v14-pace-variation/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `v14-pace-variation/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `v14-pace-variation/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `v14-pace-variation/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=true |
| 17 | `v14-pace-variation/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 18 | `v14-pace-variation/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=false |
| 19 | `v14-pace-variation/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 20 | `v14-pace-variation/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=false |
| 21 | `v14-pace-variation/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 22 | `v14-pace-variation/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=false |
| 23 | `v14-pace-variation/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 24 | `v14-pace-variation/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=false |
| 25 | `v14-pace-variation/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 26 | `v14-pace-variation/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=false |
| 27 | `v14-pace-variation/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 28 | `v14-pace-variation/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=false |
| 29 | `v14-pace-variation/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 30 | `v14-pace-variation/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=false |
| 31 | `v14-pace-variation/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 32 | `v14-pace-variation/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=false |
| 33 | `v14-pace-variation/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 34 | `v14-pace-variation/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=false |
| 35 | `v14-pace-variation/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 36 | `v14-pace-variation/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `v14-pace-variation/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `v14-pace-variation/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=false hold0=3 hold1=3 **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### v15-gestures — Hand Gestures & Body Language (`gestureReps`)

**Notes:**
- Profile mode=gestureReps showPitch=false soundGated=false allowManual=true
- Mic drag 6→5 (restored)
- Silence 2s: gated=false hold null→null PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v15-gestures/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v15-gestures/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v15-gestures/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v15-gestures/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v15-gestures/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→5 |
| 6 | `v15-gestures/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `v15-gestures/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `v15-gestures/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | timer modes may tick; no crash | hold=null |
| 9 | `v15-gestures/05_silence_after_2s.png` | Silence gate t=2s still silent | stable live | hold=null live=true |
| 10 | `v15-gestures/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `v15-gestures/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=null |
| 12 | `v15-gestures/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `v15-gestures/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `v15-gestures/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `v15-gestures/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `v15-gestures/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=true |
| 17 | `v15-gestures/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 18 | `v15-gestures/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 19 | `v15-gestures/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 20 | `v15-gestures/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 21 | `v15-gestures/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 22 | `v15-gestures/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 23 | `v15-gestures/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 24 | `v15-gestures/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 25 | `v15-gestures/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 26 | `v15-gestures/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 27 | `v15-gestures/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 28 | `v15-gestures/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 29 | `v15-gestures/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 30 | `v15-gestures/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 31 | `v15-gestures/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 32 | `v15-gestures/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 33 | `v15-gestures/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 34 | `v15-gestures/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 35 | `v15-gestures/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 36 | `v15-gestures/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `v15-gestures/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `v15-gestures/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=false hold0=null hold1=null **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### v16-facial-expression — Facial Expressiveness (`facePhases`)

**Notes:**
- Profile mode=facePhases showPitch=false soundGated=false allowManual=true
- Mic drag 6→5 (restored)
- Silence 2s: gated=false hold 40→38 PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v16-facial-expression/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v16-facial-expression/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v16-facial-expression/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v16-facial-expression/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v16-facial-expression/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→5 |
| 6 | `v16-facial-expression/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `v16-facial-expression/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `v16-facial-expression/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | timer modes may tick; no crash | hold=40 |
| 9 | `v16-facial-expression/05_silence_after_2s.png` | Silence gate t=2s still silent | stable live | hold=38 live=true |
| 10 | `v16-facial-expression/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `v16-facial-expression/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=36 |
| 12 | `v16-facial-expression/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `v16-facial-expression/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `v16-facial-expression/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `v16-facial-expression/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `v16-facial-expression/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=35 status=En vivo manual=true |
| 17 | `v16-facial-expression/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=34 live=true |
| 18 | `v16-facial-expression/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=34 status=En vivo manual=false |
| 19 | `v16-facial-expression/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=33 live=true |
| 20 | `v16-facial-expression/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=33 status=En vivo manual=false |
| 21 | `v16-facial-expression/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=32 live=true |
| 22 | `v16-facial-expression/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=31 status=En vivo manual=false |
| 23 | `v16-facial-expression/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=30 live=true |
| 24 | `v16-facial-expression/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=30 status=En vivo manual=false |
| 25 | `v16-facial-expression/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=29 live=true |
| 26 | `v16-facial-expression/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=29 status=En vivo manual=false |
| 27 | `v16-facial-expression/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=28 live=true |
| 28 | `v16-facial-expression/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=28 status=En vivo manual=false |
| 29 | `v16-facial-expression/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=27 live=true |
| 30 | `v16-facial-expression/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=27 status=En vivo manual=false |
| 31 | `v16-facial-expression/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=26 live=true |
| 32 | `v16-facial-expression/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=26 status=En vivo manual=false |
| 33 | `v16-facial-expression/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=24 live=true |
| 34 | `v16-facial-expression/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=24 status=En vivo manual=false |
| 35 | `v16-facial-expression/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=23 live=true |
| 36 | `v16-facial-expression/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `v16-facial-expression/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `v16-facial-expression/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=false hold0=40 hold1=38 **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### v17-strategic-concision — Strategic Concision (`concisionGate`)

**Notes:**
- Profile mode=concisionGate showPitch=false soundGated=false allowManual=true
- Mic drag 6→5 (restored)
- Silence 2s: gated=false hold 1.7→3 PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v17-strategic-concision/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v17-strategic-concision/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v17-strategic-concision/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v17-strategic-concision/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v17-strategic-concision/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→5 |
| 6 | `v17-strategic-concision/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `v17-strategic-concision/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `v17-strategic-concision/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | timer modes may tick; no crash | hold=1.7 |
| 9 | `v17-strategic-concision/05_silence_after_2s.png` | Silence gate t=2s still silent | stable live | hold=3 live=true |
| 10 | `v17-strategic-concision/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `v17-strategic-concision/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=3 |
| 12 | `v17-strategic-concision/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `v17-strategic-concision/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `v17-strategic-concision/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `v17-strategic-concision/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `v17-strategic-concision/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=true |
| 17 | `v17-strategic-concision/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 18 | `v17-strategic-concision/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=false |
| 19 | `v17-strategic-concision/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 20 | `v17-strategic-concision/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=false |
| 21 | `v17-strategic-concision/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 22 | `v17-strategic-concision/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=false |
| 23 | `v17-strategic-concision/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 24 | `v17-strategic-concision/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=false |
| 25 | `v17-strategic-concision/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 26 | `v17-strategic-concision/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=false |
| 27 | `v17-strategic-concision/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 28 | `v17-strategic-concision/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=false |
| 29 | `v17-strategic-concision/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 30 | `v17-strategic-concision/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=false |
| 31 | `v17-strategic-concision/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 32 | `v17-strategic-concision/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=false |
| 33 | `v17-strategic-concision/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 34 | `v17-strategic-concision/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=3 status=En vivo manual=false |
| 35 | `v17-strategic-concision/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=3 live=true |
| 36 | `v17-strategic-concision/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `v17-strategic-concision/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `v17-strategic-concision/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=false hold0=1.7 hold1=3 **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### v18-story-peak — Storytelling Peak Emotion (`storyTimer`)

**Notes:**
- Profile mode=storyTimer showPitch=false soundGated=false allowManual=true
- Mic drag 6→5 (restored)
- Silence 2s: gated=false hold 40→38 PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v18-story-peak/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v18-story-peak/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v18-story-peak/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v18-story-peak/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v18-story-peak/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→5 |
| 6 | `v18-story-peak/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `v18-story-peak/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `v18-story-peak/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | timer modes may tick; no crash | hold=40 |
| 9 | `v18-story-peak/05_silence_after_2s.png` | Silence gate t=2s still silent | stable live | hold=38 live=true |
| 10 | `v18-story-peak/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `v18-story-peak/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=36 |
| 12 | `v18-story-peak/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `v18-story-peak/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `v18-story-peak/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `v18-story-peak/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `v18-story-peak/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=35 status=En vivo manual=true |
| 17 | `v18-story-peak/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=34 live=true |
| 18 | `v18-story-peak/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=34 status=En vivo manual=false |
| 19 | `v18-story-peak/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=33 live=true |
| 20 | `v18-story-peak/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=33 status=En vivo manual=false |
| 21 | `v18-story-peak/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=32 live=true |
| 22 | `v18-story-peak/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=31 status=En vivo manual=false |
| 23 | `v18-story-peak/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=30 live=true |
| 24 | `v18-story-peak/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=30 status=En vivo manual=false |
| 25 | `v18-story-peak/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=29 live=true |
| 26 | `v18-story-peak/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=29 status=En vivo manual=false |
| 27 | `v18-story-peak/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=28 live=true |
| 28 | `v18-story-peak/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=28 status=En vivo manual=false |
| 29 | `v18-story-peak/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=27 live=true |
| 30 | `v18-story-peak/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=27 status=En vivo manual=false |
| 31 | `v18-story-peak/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=26 live=true |
| 32 | `v18-story-peak/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=26 status=En vivo manual=false |
| 33 | `v18-story-peak/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=24 live=true |
| 34 | `v18-story-peak/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=24 status=En vivo manual=false |
| 35 | `v18-story-peak/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=23 live=true |
| 36 | `v18-story-peak/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `v18-story-peak/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `v18-story-peak/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=false hold0=40 hold1=38 **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### v19-authority-close — Authority Close (Cadence) (`authorityLand`)

**Notes:**
- Profile mode=authorityLand showPitch=false soundGated=false allowManual=true
- Mic drag 6→5 (restored)
- Silence 2s: gated=false hold 5→5 PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v19-authority-close/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v19-authority-close/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v19-authority-close/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v19-authority-close/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v19-authority-close/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→5 |
| 6 | `v19-authority-close/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `v19-authority-close/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `v19-authority-close/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | timer modes may tick; no crash | hold=5 |
| 9 | `v19-authority-close/05_silence_after_2s.png` | Silence gate t=2s still silent | stable live | hold=5 live=true |
| 10 | `v19-authority-close/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `v19-authority-close/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=5 |
| 12 | `v19-authority-close/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `v19-authority-close/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `v19-authority-close/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `v19-authority-close/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `v19-authority-close/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=5 status=En vivo manual=true |
| 17 | `v19-authority-close/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=5 live=true |
| 18 | `v19-authority-close/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=5 status=En vivo manual=false |
| 19 | `v19-authority-close/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=5 live=true |
| 20 | `v19-authority-close/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=5 status=En vivo manual=false |
| 21 | `v19-authority-close/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=5 live=true |
| 22 | `v19-authority-close/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=5 status=En vivo manual=false |
| 23 | `v19-authority-close/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=5 live=true |
| 24 | `v19-authority-close/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=5 status=En vivo manual=false |
| 25 | `v19-authority-close/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=5 live=true |
| 26 | `v19-authority-close/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=5 status=En vivo manual=false |
| 27 | `v19-authority-close/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=5 live=true |
| 28 | `v19-authority-close/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=5 status=En vivo manual=false |
| 29 | `v19-authority-close/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=5 live=true |
| 30 | `v19-authority-close/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=5 status=En vivo manual=false |
| 31 | `v19-authority-close/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=5 live=true |
| 32 | `v19-authority-close/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=5 status=En vivo manual=false |
| 33 | `v19-authority-close/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=5 live=true |
| 34 | `v19-authority-close/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=5 status=En vivo manual=false |
| 35 | `v19-authority-close/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=5 live=true |
| 36 | `v19-authority-close/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `v19-authority-close/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `v19-authority-close/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=false hold0=5 hold1=5 **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### v20-energy-match — Energy Match & Charisma (`energyMatch`)

**Notes:**
- Profile mode=energyMatch showPitch=false soundGated=false allowManual=true
- Mic drag 6→5 (restored)
- Silence 2s: gated=false hold 30→28 PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v20-energy-match/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v20-energy-match/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v20-energy-match/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v20-energy-match/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v20-energy-match/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→5 |
| 6 | `v20-energy-match/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `v20-energy-match/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `v20-energy-match/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | timer modes may tick; no crash | hold=30 |
| 9 | `v20-energy-match/05_silence_after_2s.png` | Silence gate t=2s still silent | stable live | hold=28 live=true |
| 10 | `v20-energy-match/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `v20-energy-match/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=26 |
| 12 | `v20-energy-match/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `v20-energy-match/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `v20-energy-match/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `v20-energy-match/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `v20-energy-match/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=25 status=En vivo manual=true |
| 17 | `v20-energy-match/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=24 live=true |
| 18 | `v20-energy-match/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=24 status=En vivo manual=false |
| 19 | `v20-energy-match/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=23 live=true |
| 20 | `v20-energy-match/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=23 status=En vivo manual=false |
| 21 | `v20-energy-match/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=21 live=true |
| 22 | `v20-energy-match/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=21 status=En vivo manual=false |
| 23 | `v20-energy-match/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=20 live=true |
| 24 | `v20-energy-match/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=20 status=En vivo manual=false |
| 25 | `v20-energy-match/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=19 live=true |
| 26 | `v20-energy-match/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=19 status=En vivo manual=false |
| 27 | `v20-energy-match/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=18 live=true |
| 28 | `v20-energy-match/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=18 status=En vivo manual=false |
| 29 | `v20-energy-match/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=17 live=true |
| 30 | `v20-energy-match/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=17 status=En vivo manual=false |
| 31 | `v20-energy-match/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=15 live=true |
| 32 | `v20-energy-match/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=15 status=En vivo manual=false |
| 33 | `v20-energy-match/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=14 live=true |
| 34 | `v20-energy-match/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=14 status=En vivo manual=false |
| 35 | `v20-energy-match/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=13 live=true |
| 36 | `v20-energy-match/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `v20-energy-match/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `v20-energy-match/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=false hold0=30 hold1=28 **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### s1-vocal-fry — Vocal Fry → Sustained /A/ (`pitchHold`)

**Notes:**
- Profile mode=pitchHold showPitch=true soundGated=true allowManual=true
- Mic drag 6→2 (restored)
- Silence 2s: gated=true hold 0→0 PASS
- Space long: live mid/after=true/true manual=false; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `s1-vocal-fry/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `s1-vocal-fry/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `s1-vocal-fry/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `s1-vocal-fry/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `s1-vocal-fry/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→2 |
| 6 | `s1-vocal-fry/03_highway_open.png` | Pitch highway / piano chrome | Canvas or pitch block visible for showPitch profile | pitch profile active |
| 7 | `s1-vocal-fry/04_start_before.png` | Before Start click | Ready state | about to start |
| 8 | `s1-vocal-fry/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 9 | `s1-vocal-fry/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | hold/count stays ~0 without air/Space | hold=0 |
| 10 | `s1-vocal-fry/05_silence_after_2s.png` | Silence gate t=2s still silent | hold/count still ~0 | hold=0 live=true |
| 11 | `s1-vocal-fry/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 12 | `s1-vocal-fry/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=false hold=0 |
| 13 | `s1-vocal-fry/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=false |
| 14 | `s1-vocal-fry/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 15 | `s1-vocal-fry/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=false |
| 16 | `s1-vocal-fry/07_space_short_release.png` | After short Space release | Still live | live=true |
| 17 | `s1-vocal-fry/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 18 | `s1-vocal-fry/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 19 | `s1-vocal-fry/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 20 | `s1-vocal-fry/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 21 | `s1-vocal-fry/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 22 | `s1-vocal-fry/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 23 | `s1-vocal-fry/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 24 | `s1-vocal-fry/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 25 | `s1-vocal-fry/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 26 | `s1-vocal-fry/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 27 | `s1-vocal-fry/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 28 | `s1-vocal-fry/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 29 | `s1-vocal-fry/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 30 | `s1-vocal-fry/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 31 | `s1-vocal-fry/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 32 | `s1-vocal-fry/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 33 | `s1-vocal-fry/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 34 | `s1-vocal-fry/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 35 | `s1-vocal-fry/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 36 | `s1-vocal-fry/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 37 | `s1-vocal-fry/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 38 | `s1-vocal-fry/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 39 | `s1-vocal-fry/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=true hold0=0 hold1=0 **PASS**

Space: longHold didNotStop=true isManual=false shortPulse didNotStop=true

### s2-solfege-chords — /A/ Solfège on Chord Progressions (`pitchChord`)

**Notes:**
- Profile mode=pitchChord showPitch=true soundGated=true allowManual=true
- Mic drag 9→2 (restored)
- Silence 2s: gated=true hold 0→0 PASS
- Space long: live mid/after=true/true manual=false; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `s2-solfege-chords/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `s2-solfege-chords/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `s2-solfege-chords/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `s2-solfege-chords/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `s2-solfege-chords/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 9→2 |
| 6 | `s2-solfege-chords/03_highway_open.png` | Pitch highway / piano chrome | Canvas or pitch block visible for showPitch profile | pitch profile active |
| 7 | `s2-solfege-chords/04_start_before.png` | Before Start click | Ready state | about to start |
| 8 | `s2-solfege-chords/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 9 | `s2-solfege-chords/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | hold/count stays ~0 without air/Space | hold=0 |
| 10 | `s2-solfege-chords/05_silence_after_2s.png` | Silence gate t=2s still silent | hold/count still ~0 | hold=0 live=true |
| 11 | `s2-solfege-chords/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 12 | `s2-solfege-chords/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=false hold=0 |
| 13 | `s2-solfege-chords/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=false |
| 14 | `s2-solfege-chords/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 15 | `s2-solfege-chords/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=false |
| 16 | `s2-solfege-chords/07_space_short_release.png` | After short Space release | Still live | live=true |
| 17 | `s2-solfege-chords/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 18 | `s2-solfege-chords/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 19 | `s2-solfege-chords/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 20 | `s2-solfege-chords/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 21 | `s2-solfege-chords/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 22 | `s2-solfege-chords/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 23 | `s2-solfege-chords/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 24 | `s2-solfege-chords/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 25 | `s2-solfege-chords/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 26 | `s2-solfege-chords/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 27 | `s2-solfege-chords/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 28 | `s2-solfege-chords/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 29 | `s2-solfege-chords/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 30 | `s2-solfege-chords/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 31 | `s2-solfege-chords/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 32 | `s2-solfege-chords/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 33 | `s2-solfege-chords/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 34 | `s2-solfege-chords/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 35 | `s2-solfege-chords/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 36 | `s2-solfege-chords/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 37 | `s2-solfege-chords/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 38 | `s2-solfege-chords/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 39 | `s2-solfege-chords/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=true hold0=0 hold1=0 **PASS**

Space: longHold didNotStop=true isManual=false shortPulse didNotStop=true

### s3-song-stanzas — Song Stanzas (your songs) (`pitchSong`)

**Notes:**
- Profile mode=pitchSong showPitch=true soundGated=true allowManual=true
- Mic drag 9→2 (restored)
- Silence 2s: gated=true hold null→null PASS
- Space long: live mid/after=true/true manual=false; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `s3-song-stanzas/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `s3-song-stanzas/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `s3-song-stanzas/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `s3-song-stanzas/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `s3-song-stanzas/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 9→2 |
| 6 | `s3-song-stanzas/03_highway_open.png` | Pitch highway / piano chrome | Canvas or pitch block visible for showPitch profile | pitch profile active |
| 7 | `s3-song-stanzas/04_start_before.png` | Before Start click | Ready state | about to start |
| 8 | `s3-song-stanzas/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 9 | `s3-song-stanzas/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | hold/count stays ~0 without air/Space | hold=null |
| 10 | `s3-song-stanzas/05_silence_after_2s.png` | Silence gate t=2s still silent | hold/count still ~0 | hold=null live=true |
| 11 | `s3-song-stanzas/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 12 | `s3-song-stanzas/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=false hold=null |
| 13 | `s3-song-stanzas/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=false |
| 14 | `s3-song-stanzas/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 15 | `s3-song-stanzas/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=false |
| 16 | `s3-song-stanzas/07_space_short_release.png` | After short Space release | Still live | live=true |
| 17 | `s3-song-stanzas/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 18 | `s3-song-stanzas/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 19 | `s3-song-stanzas/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 20 | `s3-song-stanzas/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 21 | `s3-song-stanzas/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 22 | `s3-song-stanzas/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 23 | `s3-song-stanzas/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 24 | `s3-song-stanzas/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 25 | `s3-song-stanzas/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 26 | `s3-song-stanzas/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 27 | `s3-song-stanzas/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 28 | `s3-song-stanzas/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 29 | `s3-song-stanzas/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 30 | `s3-song-stanzas/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 31 | `s3-song-stanzas/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 32 | `s3-song-stanzas/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 33 | `s3-song-stanzas/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 34 | `s3-song-stanzas/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 35 | `s3-song-stanzas/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 36 | `s3-song-stanzas/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 37 | `s3-song-stanzas/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 38 | `s3-song-stanzas/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 39 | `s3-song-stanzas/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=true hold0=null hold1=null **PASS**

Space: longHold didNotStop=true isManual=false shortPulse didNotStop=true

### s15-sh-air-ladder — SH Air-Dosing Ladder (`shAirLadder`)

**Notes:**
- Profile mode=shAirLadder showPitch=false soundGated=true allowManual=true
- Mic drag 9→5 (restored)
- Silence 2s: gated=true hold 0→0 PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `s15-sh-air-ladder/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `s15-sh-air-ladder/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `s15-sh-air-ladder/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `s15-sh-air-ladder/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `s15-sh-air-ladder/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 9→5 |
| 6 | `s15-sh-air-ladder/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `s15-sh-air-ladder/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `s15-sh-air-ladder/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | hold/count stays ~0 without air/Space | hold=0 |
| 9 | `s15-sh-air-ladder/05_silence_after_2s.png` | Silence gate t=2s still silent | hold/count still ~0 | hold=0 live=true |
| 10 | `s15-sh-air-ladder/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `s15-sh-air-ladder/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=1.2 |
| 12 | `s15-sh-air-ladder/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `s15-sh-air-ladder/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `s15-sh-air-ladder/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `s15-sh-air-ladder/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `s15-sh-air-ladder/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=2.3 status=En vivo manual=true |
| 17 | `s15-sh-air-ladder/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=3.4 live=true |
| 18 | `s15-sh-air-ladder/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=3.5 status=En vivo manual=false |
| 19 | `s15-sh-air-ladder/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=1.1 live=true |
| 20 | `s15-sh-air-ladder/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=1.2 status=En vivo manual=false |
| 21 | `s15-sh-air-ladder/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 22 | `s15-sh-air-ladder/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 23 | `s15-sh-air-ladder/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 24 | `s15-sh-air-ladder/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 25 | `s15-sh-air-ladder/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=1.1 live=true |
| 26 | `s15-sh-air-ladder/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=1.2 status=En vivo manual=false |
| 27 | `s15-sh-air-ladder/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 28 | `s15-sh-air-ladder/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 29 | `s15-sh-air-ladder/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 30 | `s15-sh-air-ladder/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 31 | `s15-sh-air-ladder/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=1.1 live=true |
| 32 | `s15-sh-air-ladder/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=1.2 status=En vivo manual=false |
| 33 | `s15-sh-air-ladder/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 34 | `s15-sh-air-ladder/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 35 | `s15-sh-air-ladder/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 36 | `s15-sh-air-ladder/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `s15-sh-air-ladder/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `s15-sh-air-ladder/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=true hold0=0 hold1=0 **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### s16-major-scale-coord — Major Scale Coordination (`scaleSteps`)

**Notes:**
- Profile mode=scaleSteps showPitch=true soundGated=true allowManual=true
- Mic drag 6→2 (restored)
- Silence 2s: gated=true hold 115→115 PASS
- Space long: live mid/after=true/true manual=false; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `s16-major-scale-coord/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `s16-major-scale-coord/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `s16-major-scale-coord/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `s16-major-scale-coord/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `s16-major-scale-coord/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→2 |
| 6 | `s16-major-scale-coord/03_highway_open.png` | Pitch highway / piano chrome | Canvas or pitch block visible for showPitch profile | pitch profile active |
| 7 | `s16-major-scale-coord/04_start_before.png` | Before Start click | Ready state | about to start |
| 8 | `s16-major-scale-coord/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 9 | `s16-major-scale-coord/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | hold/count stays ~0 without air/Space | hold=115 |
| 10 | `s16-major-scale-coord/05_silence_after_2s.png` | Silence gate t=2s still silent | hold/count still ~0 | hold=115 live=true |
| 11 | `s16-major-scale-coord/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 12 | `s16-major-scale-coord/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=false hold=115 |
| 13 | `s16-major-scale-coord/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=false |
| 14 | `s16-major-scale-coord/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 15 | `s16-major-scale-coord/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=false |
| 16 | `s16-major-scale-coord/07_space_short_release.png` | After short Space release | Still live | live=true |
| 17 | `s16-major-scale-coord/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=115 status=En vivo manual=false |
| 18 | `s16-major-scale-coord/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=115 live=true |
| 19 | `s16-major-scale-coord/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=115 status=En vivo manual=false |
| 20 | `s16-major-scale-coord/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=115 live=true |
| 21 | `s16-major-scale-coord/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=115 status=En vivo manual=false |
| 22 | `s16-major-scale-coord/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=115 live=true |
| 23 | `s16-major-scale-coord/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=115 status=En vivo manual=false |
| 24 | `s16-major-scale-coord/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=115 live=true |
| 25 | `s16-major-scale-coord/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=115 status=En vivo manual=false |
| 26 | `s16-major-scale-coord/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=115 live=true |
| 27 | `s16-major-scale-coord/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=115 status=En vivo manual=false |
| 28 | `s16-major-scale-coord/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=115 live=true |
| 29 | `s16-major-scale-coord/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=115 status=En vivo manual=false |
| 30 | `s16-major-scale-coord/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=115 live=true |
| 31 | `s16-major-scale-coord/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=115 status=En vivo manual=false |
| 32 | `s16-major-scale-coord/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=115 live=true |
| 33 | `s16-major-scale-coord/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=115 status=En vivo manual=false |
| 34 | `s16-major-scale-coord/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=115 live=true |
| 35 | `s16-major-scale-coord/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=115 status=En vivo manual=false |
| 36 | `s16-major-scale-coord/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=115 live=true |
| 37 | `s16-major-scale-coord/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 38 | `s16-major-scale-coord/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 39 | `s16-major-scale-coord/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=true hold0=115 hold1=115 **PASS**

Space: longHold didNotStop=true isManual=false shortPulse didNotStop=true

### s4-lip-trills — Lip Trills (SOVT Warm-up) (`sovtFlow`)

**Notes:**
- Profile mode=sovtFlow showPitch=false soundGated=true allowManual=true
- Mic drag 9→2 (restored)
- Silence 2s: gated=true hold null→null PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `s4-lip-trills/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `s4-lip-trills/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `s4-lip-trills/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `s4-lip-trills/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `s4-lip-trills/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 9→2 |
| 6 | `s4-lip-trills/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `s4-lip-trills/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `s4-lip-trills/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | hold/count stays ~0 without air/Space | hold=null |
| 9 | `s4-lip-trills/05_silence_after_2s.png` | Silence gate t=2s still silent | hold/count still ~0 | hold=null live=true |
| 10 | `s4-lip-trills/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `s4-lip-trills/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=null |
| 12 | `s4-lip-trills/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `s4-lip-trills/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `s4-lip-trills/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `s4-lip-trills/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `s4-lip-trills/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=true |
| 17 | `s4-lip-trills/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 18 | `s4-lip-trills/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 19 | `s4-lip-trills/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 20 | `s4-lip-trills/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 21 | `s4-lip-trills/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 22 | `s4-lip-trills/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 23 | `s4-lip-trills/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 24 | `s4-lip-trills/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 25 | `s4-lip-trills/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 26 | `s4-lip-trills/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 27 | `s4-lip-trills/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 28 | `s4-lip-trills/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 29 | `s4-lip-trills/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 30 | `s4-lip-trills/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 31 | `s4-lip-trills/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 32 | `s4-lip-trills/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 33 | `s4-lip-trills/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 34 | `s4-lip-trills/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 35 | `s4-lip-trills/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 36 | `s4-lip-trills/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `s4-lip-trills/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `s4-lip-trills/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=true hold0=null hold1=null **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### s5-sirens — Sirens / Pitch Glides (`sirenRange`)

**Notes:**
- Profile mode=sirenRange showPitch=true soundGated=true allowManual=true
- Mic drag 9→2 (restored)
- Silence 2s: gated=true hold null→null PASS
- Space long: live mid/after=true/true manual=false; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `s5-sirens/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `s5-sirens/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `s5-sirens/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `s5-sirens/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `s5-sirens/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 9→2 |
| 6 | `s5-sirens/03_highway_open.png` | Pitch highway / piano chrome | Canvas or pitch block visible for showPitch profile | pitch profile active |
| 7 | `s5-sirens/04_start_before.png` | Before Start click | Ready state | about to start |
| 8 | `s5-sirens/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 9 | `s5-sirens/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | hold/count stays ~0 without air/Space | hold=null |
| 10 | `s5-sirens/05_silence_after_2s.png` | Silence gate t=2s still silent | hold/count still ~0 | hold=null live=true |
| 11 | `s5-sirens/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 12 | `s5-sirens/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=false hold=null |
| 13 | `s5-sirens/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=false |
| 14 | `s5-sirens/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 15 | `s5-sirens/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=false |
| 16 | `s5-sirens/07_space_short_release.png` | After short Space release | Still live | live=true |
| 17 | `s5-sirens/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 18 | `s5-sirens/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 19 | `s5-sirens/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 20 | `s5-sirens/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 21 | `s5-sirens/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 22 | `s5-sirens/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 23 | `s5-sirens/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 24 | `s5-sirens/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 25 | `s5-sirens/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 26 | `s5-sirens/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 27 | `s5-sirens/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 28 | `s5-sirens/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 29 | `s5-sirens/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 30 | `s5-sirens/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 31 | `s5-sirens/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 32 | `s5-sirens/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 33 | `s5-sirens/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 34 | `s5-sirens/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 35 | `s5-sirens/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 36 | `s5-sirens/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 37 | `s5-sirens/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 38 | `s5-sirens/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 39 | `s5-sirens/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=true hold0=null hold1=null **PASS**

Space: longHold didNotStop=true isManual=false shortPulse didNotStop=true

### s6-straw — Straw Phonation (SOVT) (`sovtFlow`)

**Notes:**
- Profile mode=sovtFlow showPitch=false soundGated=true allowManual=true
- Mic drag 9→2 (restored)
- Silence 2s: gated=true hold null→null PASS
- Space long: live mid/after=true/true manual=true; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `s6-straw/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `s6-straw/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `s6-straw/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `s6-straw/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `s6-straw/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 9→2 |
| 6 | `s6-straw/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `s6-straw/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `s6-straw/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | hold/count stays ~0 without air/Space | hold=null |
| 9 | `s6-straw/05_silence_after_2s.png` | Silence gate t=2s still silent | hold/count still ~0 | hold=null live=true |
| 10 | `s6-straw/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `s6-straw/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=null |
| 12 | `s6-straw/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=true |
| 13 | `s6-straw/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `s6-straw/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=true |
| 15 | `s6-straw/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `s6-straw/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=true |
| 17 | `s6-straw/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 18 | `s6-straw/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 19 | `s6-straw/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 20 | `s6-straw/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 21 | `s6-straw/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 22 | `s6-straw/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 23 | `s6-straw/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 24 | `s6-straw/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 25 | `s6-straw/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 26 | `s6-straw/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 27 | `s6-straw/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 28 | `s6-straw/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 29 | `s6-straw/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 30 | `s6-straw/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 31 | `s6-straw/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 32 | `s6-straw/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 33 | `s6-straw/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 34 | `s6-straw/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 35 | `s6-straw/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 36 | `s6-straw/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 37 | `s6-straw/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 38 | `s6-straw/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=true hold0=null hold1=null **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### s7-humming — Humming Resonance (`humTargets`)

**Notes:**
- Profile mode=humTargets showPitch=true soundGated=true allowManual=true
- Mic drag 9→2 (restored)
- Silence 2s: gated=true hold 10→10 PASS
- Space long: live mid/after=true/true manual=false; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `s7-humming/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `s7-humming/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `s7-humming/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `s7-humming/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `s7-humming/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 9→2 |
| 6 | `s7-humming/03_highway_open.png` | Pitch highway / piano chrome | Canvas or pitch block visible for showPitch profile | pitch profile active |
| 7 | `s7-humming/04_start_before.png` | Before Start click | Ready state | about to start |
| 8 | `s7-humming/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 9 | `s7-humming/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | hold/count stays ~0 without air/Space | hold=10 |
| 10 | `s7-humming/05_silence_after_2s.png` | Silence gate t=2s still silent | hold/count still ~0 | hold=10 live=true |
| 11 | `s7-humming/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 12 | `s7-humming/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=false hold=10 |
| 13 | `s7-humming/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=false |
| 14 | `s7-humming/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 15 | `s7-humming/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=false |
| 16 | `s7-humming/07_space_short_release.png` | After short Space release | Still live | live=true |
| 17 | `s7-humming/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=10 status=En vivo manual=false |
| 18 | `s7-humming/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=10 live=true |
| 19 | `s7-humming/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=10 status=En vivo manual=false |
| 20 | `s7-humming/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=10 live=true |
| 21 | `s7-humming/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=10 status=En vivo manual=false |
| 22 | `s7-humming/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=10 live=true |
| 23 | `s7-humming/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=10 status=En vivo manual=false |
| 24 | `s7-humming/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=10 live=true |
| 25 | `s7-humming/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=10 status=En vivo manual=false |
| 26 | `s7-humming/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=10 live=true |
| 27 | `s7-humming/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=10 status=En vivo manual=false |
| 28 | `s7-humming/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=10 live=true |
| 29 | `s7-humming/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=10 status=En vivo manual=false |
| 30 | `s7-humming/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=10 live=true |
| 31 | `s7-humming/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=10 status=En vivo manual=false |
| 32 | `s7-humming/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=10 live=true |
| 33 | `s7-humming/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=10 status=En vivo manual=false |
| 34 | `s7-humming/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=10 live=true |
| 35 | `s7-humming/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=10 status=En vivo manual=false |
| 36 | `s7-humming/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=10 live=true |
| 37 | `s7-humming/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 38 | `s7-humming/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 39 | `s7-humming/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=true hold0=10 hold1=10 **PASS**

Space: longHold didNotStop=true isManual=false shortPulse didNotStop=true

### s8-breath-support — Breath Support (Sustained S) (`breathS`)

**Notes:**
- Profile mode=breathS showPitch=true soundGated=true allowManual=true
- Mic drag 9→2 (restored)
- Silence 2s: gated=true hold 0→0 PASS
- Space long: live mid/after=true/true manual=false; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `s8-breath-support/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `s8-breath-support/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `s8-breath-support/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `s8-breath-support/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `s8-breath-support/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 9→2 |
| 6 | `s8-breath-support/03_highway_open.png` | Pitch highway / piano chrome | Canvas or pitch block visible for showPitch profile | pitch profile active |
| 7 | `s8-breath-support/04_start_before.png` | Before Start click | Ready state | about to start |
| 8 | `s8-breath-support/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 9 | `s8-breath-support/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | hold/count stays ~0 without air/Space | hold=0 |
| 10 | `s8-breath-support/05_silence_after_2s.png` | Silence gate t=2s still silent | hold/count still ~0 | hold=0 live=true |
| 11 | `s8-breath-support/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 12 | `s8-breath-support/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=false hold=0 |
| 13 | `s8-breath-support/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=false |
| 14 | `s8-breath-support/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 15 | `s8-breath-support/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=false |
| 16 | `s8-breath-support/07_space_short_release.png` | After short Space release | Still live | live=true |
| 17 | `s8-breath-support/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 18 | `s8-breath-support/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 19 | `s8-breath-support/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 20 | `s8-breath-support/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 21 | `s8-breath-support/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 22 | `s8-breath-support/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 23 | `s8-breath-support/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 24 | `s8-breath-support/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 25 | `s8-breath-support/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 26 | `s8-breath-support/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 27 | `s8-breath-support/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 28 | `s8-breath-support/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 29 | `s8-breath-support/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 30 | `s8-breath-support/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 31 | `s8-breath-support/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 32 | `s8-breath-support/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 33 | `s8-breath-support/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 34 | `s8-breath-support/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 35 | `s8-breath-support/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 36 | `s8-breath-support/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 37 | `s8-breath-support/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 38 | `s8-breath-support/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 39 | `s8-breath-support/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=true hold0=0 hold1=0 **PASS**

Space: longHold didNotStop=true isManual=false shortPulse didNotStop=true

### s9-pitch-match — Single-Note Pitch Match (`pitchMatch`)

**Notes:**
- Profile mode=pitchMatch showPitch=true soundGated=true allowManual=true
- Mic drag 9→2 (restored)
- Silence 2s: gated=true hold null→null PASS
- Space long: live mid/after=true/true manual=false; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `s9-pitch-match/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `s9-pitch-match/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `s9-pitch-match/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `s9-pitch-match/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `s9-pitch-match/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 9→2 |
| 6 | `s9-pitch-match/03_highway_open.png` | Pitch highway / piano chrome | Canvas or pitch block visible for showPitch profile | pitch profile active |
| 7 | `s9-pitch-match/04_start_before.png` | Before Start click | Ready state | about to start |
| 8 | `s9-pitch-match/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 9 | `s9-pitch-match/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | hold/count stays ~0 without air/Space | hold=null |
| 10 | `s9-pitch-match/05_silence_after_2s.png` | Silence gate t=2s still silent | hold/count still ~0 | hold=null live=true |
| 11 | `s9-pitch-match/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 12 | `s9-pitch-match/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=false hold=null |
| 13 | `s9-pitch-match/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=false |
| 14 | `s9-pitch-match/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 15 | `s9-pitch-match/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=false |
| 16 | `s9-pitch-match/07_space_short_release.png` | After short Space release | Still live | live=true |
| 17 | `s9-pitch-match/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 18 | `s9-pitch-match/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 19 | `s9-pitch-match/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 20 | `s9-pitch-match/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 21 | `s9-pitch-match/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 22 | `s9-pitch-match/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 23 | `s9-pitch-match/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 24 | `s9-pitch-match/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 25 | `s9-pitch-match/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 26 | `s9-pitch-match/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 27 | `s9-pitch-match/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 28 | `s9-pitch-match/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 29 | `s9-pitch-match/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 30 | `s9-pitch-match/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 31 | `s9-pitch-match/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 32 | `s9-pitch-match/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 33 | `s9-pitch-match/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 34 | `s9-pitch-match/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 35 | `s9-pitch-match/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 36 | `s9-pitch-match/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 37 | `s9-pitch-match/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 38 | `s9-pitch-match/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 39 | `s9-pitch-match/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=true hold0=null hold1=null **PASS**

Space: longHold didNotStop=true isManual=false shortPulse didNotStop=true

### s10-five-note — Five-Note Scale (/A/) (`scaleSteps`)

**Notes:**
- Profile mode=scaleSteps showPitch=true soundGated=true allowManual=true
- Mic drag 9→2 (restored)
- Silence 2s: gated=true hold 19→19 PASS
- Space long: live mid/after=true/true manual=false; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `s10-five-note/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `s10-five-note/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `s10-five-note/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `s10-five-note/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `s10-five-note/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 9→2 |
| 6 | `s10-five-note/03_highway_open.png` | Pitch highway / piano chrome | Canvas or pitch block visible for showPitch profile | pitch profile active |
| 7 | `s10-five-note/04_start_before.png` | Before Start click | Ready state | about to start |
| 8 | `s10-five-note/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 9 | `s10-five-note/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | hold/count stays ~0 without air/Space | hold=19 |
| 10 | `s10-five-note/05_silence_after_2s.png` | Silence gate t=2s still silent | hold/count still ~0 | hold=19 live=true |
| 11 | `s10-five-note/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 12 | `s10-five-note/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=false hold=19 |
| 13 | `s10-five-note/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=false |
| 14 | `s10-five-note/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 15 | `s10-five-note/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=false |
| 16 | `s10-five-note/07_space_short_release.png` | After short Space release | Still live | live=true |
| 17 | `s10-five-note/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=19 status=En vivo manual=false |
| 18 | `s10-five-note/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=19 live=true |
| 19 | `s10-five-note/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=19 status=En vivo manual=false |
| 20 | `s10-five-note/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=19 live=true |
| 21 | `s10-five-note/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=19 status=En vivo manual=false |
| 22 | `s10-five-note/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=19 live=true |
| 23 | `s10-five-note/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=19 status=En vivo manual=false |
| 24 | `s10-five-note/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=19 live=true |
| 25 | `s10-five-note/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=19 status=En vivo manual=false |
| 26 | `s10-five-note/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=19 live=true |
| 27 | `s10-five-note/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=19 status=En vivo manual=false |
| 28 | `s10-five-note/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=19 live=true |
| 29 | `s10-five-note/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=19 status=En vivo manual=false |
| 30 | `s10-five-note/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=19 live=true |
| 31 | `s10-five-note/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=19 status=En vivo manual=false |
| 32 | `s10-five-note/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=19 live=true |
| 33 | `s10-five-note/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=19 status=En vivo manual=false |
| 34 | `s10-five-note/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=19 live=true |
| 35 | `s10-five-note/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=19 status=En vivo manual=false |
| 36 | `s10-five-note/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=19 live=true |
| 37 | `s10-five-note/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 38 | `s10-five-note/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 39 | `s10-five-note/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=true hold0=19 hold1=19 **PASS**

Space: longHold didNotStop=true isManual=false shortPulse didNotStop=true

### s11-dynamics — Dynamic Swells on One Note (`dynamicSwell`)

**Notes:**
- Profile mode=dynamicSwell showPitch=true soundGated=true allowManual=true
- Mic drag 9→2 (restored)
- Silence 2s: gated=true hold null→null PASS
- Space long: live mid/after=true/true manual=false; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `s11-dynamics/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `s11-dynamics/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `s11-dynamics/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `s11-dynamics/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `s11-dynamics/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 9→2 |
| 6 | `s11-dynamics/03_highway_open.png` | Pitch highway / piano chrome | Canvas or pitch block visible for showPitch profile | pitch profile active |
| 7 | `s11-dynamics/04_start_before.png` | Before Start click | Ready state | about to start |
| 8 | `s11-dynamics/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 9 | `s11-dynamics/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | hold/count stays ~0 without air/Space | hold=null |
| 10 | `s11-dynamics/05_silence_after_2s.png` | Silence gate t=2s still silent | hold/count still ~0 | hold=null live=true |
| 11 | `s11-dynamics/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 12 | `s11-dynamics/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=false hold=null |
| 13 | `s11-dynamics/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=false |
| 14 | `s11-dynamics/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 15 | `s11-dynamics/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=false |
| 16 | `s11-dynamics/07_space_short_release.png` | After short Space release | Still live | live=true |
| 17 | `s11-dynamics/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 18 | `s11-dynamics/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 19 | `s11-dynamics/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 20 | `s11-dynamics/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 21 | `s11-dynamics/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 22 | `s11-dynamics/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 23 | `s11-dynamics/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 24 | `s11-dynamics/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 25 | `s11-dynamics/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 26 | `s11-dynamics/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 27 | `s11-dynamics/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 28 | `s11-dynamics/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 29 | `s11-dynamics/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 30 | `s11-dynamics/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 31 | `s11-dynamics/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 32 | `s11-dynamics/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 33 | `s11-dynamics/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 34 | `s11-dynamics/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 35 | `s11-dynamics/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 36 | `s11-dynamics/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 37 | `s11-dynamics/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 38 | `s11-dynamics/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 39 | `s11-dynamics/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=true hold0=null hold1=null **PASS**

Space: longHold didNotStop=true isManual=false shortPulse didNotStop=true

### s12-easy-onset — Easy Onset Coordination (`onsetReps`)

**Notes:**
- Profile mode=onsetReps showPitch=true soundGated=true allowManual=true
- Mic drag 9→2 (restored)
- Silence 2s: gated=true hold 0→0 PASS
- Space long: live mid/after=true/true manual=false; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `s12-easy-onset/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `s12-easy-onset/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `s12-easy-onset/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `s12-easy-onset/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `s12-easy-onset/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 9→2 |
| 6 | `s12-easy-onset/03_highway_open.png` | Pitch highway / piano chrome | Canvas or pitch block visible for showPitch profile | pitch profile active |
| 7 | `s12-easy-onset/04_start_before.png` | Before Start click | Ready state | about to start |
| 8 | `s12-easy-onset/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 9 | `s12-easy-onset/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | hold/count stays ~0 without air/Space | hold=0 |
| 10 | `s12-easy-onset/05_silence_after_2s.png` | Silence gate t=2s still silent | hold/count still ~0 | hold=0 live=true |
| 11 | `s12-easy-onset/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 12 | `s12-easy-onset/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=false hold=0 |
| 13 | `s12-easy-onset/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=false |
| 14 | `s12-easy-onset/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 15 | `s12-easy-onset/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=false |
| 16 | `s12-easy-onset/07_space_short_release.png` | After short Space release | Still live | live=true |
| 17 | `s12-easy-onset/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 18 | `s12-easy-onset/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 19 | `s12-easy-onset/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 20 | `s12-easy-onset/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 21 | `s12-easy-onset/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 22 | `s12-easy-onset/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 23 | `s12-easy-onset/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 24 | `s12-easy-onset/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 25 | `s12-easy-onset/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 26 | `s12-easy-onset/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 27 | `s12-easy-onset/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 28 | `s12-easy-onset/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 29 | `s12-easy-onset/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 30 | `s12-easy-onset/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 31 | `s12-easy-onset/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 32 | `s12-easy-onset/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 33 | `s12-easy-onset/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 34 | `s12-easy-onset/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 35 | `s12-easy-onset/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 36 | `s12-easy-onset/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 37 | `s12-easy-onset/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 38 | `s12-easy-onset/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 39 | `s12-easy-onset/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=true hold0=0 hold1=0 **PASS**

Space: longHold didNotStop=true isManual=false shortPulse didNotStop=true

### s13-arpeggio-match — Arpeggio Pitch Match (`pitchChord`)

**Notes:**
- Profile mode=pitchChord showPitch=true soundGated=true allowManual=true
- Mic drag 9→2 (restored)
- Silence 2s: gated=true hold 0→0 PASS
- Space long: live mid/after=true/true manual=false; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `s13-arpeggio-match/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `s13-arpeggio-match/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `s13-arpeggio-match/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `s13-arpeggio-match/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `s13-arpeggio-match/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 9→2 |
| 6 | `s13-arpeggio-match/03_highway_open.png` | Pitch highway / piano chrome | Canvas or pitch block visible for showPitch profile | pitch profile active |
| 7 | `s13-arpeggio-match/04_start_before.png` | Before Start click | Ready state | about to start |
| 8 | `s13-arpeggio-match/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 9 | `s13-arpeggio-match/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | hold/count stays ~0 without air/Space | hold=0 |
| 10 | `s13-arpeggio-match/05_silence_after_2s.png` | Silence gate t=2s still silent | hold/count still ~0 | hold=0 live=true |
| 11 | `s13-arpeggio-match/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 12 | `s13-arpeggio-match/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=false hold=0 |
| 13 | `s13-arpeggio-match/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=false |
| 14 | `s13-arpeggio-match/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 15 | `s13-arpeggio-match/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=false |
| 16 | `s13-arpeggio-match/07_space_short_release.png` | After short Space release | Still live | live=true |
| 17 | `s13-arpeggio-match/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 18 | `s13-arpeggio-match/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 19 | `s13-arpeggio-match/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 20 | `s13-arpeggio-match/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 21 | `s13-arpeggio-match/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 22 | `s13-arpeggio-match/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 23 | `s13-arpeggio-match/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 24 | `s13-arpeggio-match/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 25 | `s13-arpeggio-match/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 26 | `s13-arpeggio-match/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 27 | `s13-arpeggio-match/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 28 | `s13-arpeggio-match/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 29 | `s13-arpeggio-match/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 30 | `s13-arpeggio-match/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 31 | `s13-arpeggio-match/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 32 | `s13-arpeggio-match/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 33 | `s13-arpeggio-match/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 34 | `s13-arpeggio-match/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 35 | `s13-arpeggio-match/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=0 status=En vivo manual=false |
| 36 | `s13-arpeggio-match/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 37 | `s13-arpeggio-match/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 38 | `s13-arpeggio-match/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 39 | `s13-arpeggio-match/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=true hold0=0 hold1=0 **PASS**

Space: longHold didNotStop=true isManual=false shortPulse didNotStop=true

### s14-staccato-legato — Staccato vs Legato Control (`staccatoLegato`)

**Notes:**
- Profile mode=staccatoLegato showPitch=true soundGated=true allowManual=true
- Mic drag 9→2 (restored)
- Silence 2s: gated=true hold 90→87 PASS
- Space long: live mid/after=true/true manual=false; short tap live=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `s14-staccato-legato/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `s14-staccato-legato/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `s14-staccato-legato/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `s14-staccato-legato/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `s14-staccato-legato/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 9→2 |
| 6 | `s14-staccato-legato/03_highway_open.png` | Pitch highway / piano chrome | Canvas or pitch block visible for showPitch profile | pitch profile active |
| 7 | `s14-staccato-legato/04_start_before.png` | Before Start click | Ready state | about to start |
| 8 | `s14-staccato-legato/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 9 | `s14-staccato-legato/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | hold/count stays ~0 without air/Space | hold=90 |
| 10 | `s14-staccato-legato/05_silence_after_2s.png` | Silence gate t=2s still silent | hold/count still ~0 | hold=87 live=true |
| 11 | `s14-staccato-legato/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 12 | `s14-staccato-legato/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=false hold=86 |
| 13 | `s14-staccato-legato/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=false |
| 14 | `s14-staccato-legato/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 15 | `s14-staccato-legato/07_space_short_hold.png` | Space short hold 200ms | Still live | live=true manual=false |
| 16 | `s14-staccato-legato/07_space_short_release.png` | After short Space release | Still live | live=true |
| 17 | `s14-staccato-legato/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=85 status=En vivo manual=false |
| 18 | `s14-staccato-legato/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=83 live=true |
| 19 | `s14-staccato-legato/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=83 status=En vivo manual=false |
| 20 | `s14-staccato-legato/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=82 live=true |
| 21 | `s14-staccato-legato/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=82 status=En vivo manual=false |
| 22 | `s14-staccato-legato/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=81 live=true |
| 23 | `s14-staccato-legato/08_live_s03_before.png` | Live second 3 before tick | Still live; highway/mode UI updating | hold=81 status=En vivo manual=false |
| 24 | `s14-staccato-legato/08_live_s03_after.png` | Live second 3 after tick | No crash; counters only advance with sound/Space if gated | hold=79 live=true |
| 25 | `s14-staccato-legato/08_live_s04_before.png` | Live second 4 before tick | Still live; highway/mode UI updating | hold=79 status=En vivo manual=false |
| 26 | `s14-staccato-legato/08_live_s04_after.png` | Live second 4 after tick | No crash; counters only advance with sound/Space if gated | hold=78 live=true |
| 27 | `s14-staccato-legato/08_live_s05_before.png` | Live second 5 before tick | Still live; highway/mode UI updating | hold=78 status=En vivo manual=false |
| 28 | `s14-staccato-legato/08_live_s05_after.png` | Live second 5 after tick | No crash; counters only advance with sound/Space if gated | hold=77 live=true |
| 29 | `s14-staccato-legato/08_live_s06_before.png` | Live second 6 before tick | Still live; highway/mode UI updating | hold=77 status=En vivo manual=false |
| 30 | `s14-staccato-legato/08_live_s06_after.png` | Live second 6 after tick | No crash; counters only advance with sound/Space if gated | hold=76 live=true |
| 31 | `s14-staccato-legato/08_live_s07_before.png` | Live second 7 before tick | Still live; highway/mode UI updating | hold=75 status=En vivo manual=false |
| 32 | `s14-staccato-legato/08_live_s07_after.png` | Live second 7 after tick | No crash; counters only advance with sound/Space if gated | hold=74 live=true |
| 33 | `s14-staccato-legato/08_live_s08_before.png` | Live second 8 before tick | Still live; highway/mode UI updating | hold=74 status=En vivo manual=false |
| 34 | `s14-staccato-legato/08_live_s08_after.png` | Live second 8 after tick | No crash; counters only advance with sound/Space if gated | hold=73 live=true |
| 35 | `s14-staccato-legato/08_live_s09_before.png` | Live second 9 before tick | Still live; highway/mode UI updating | hold=73 status=En vivo manual=false |
| 36 | `s14-staccato-legato/08_live_s09_after.png` | Live second 9 after tick | No crash; counters only advance with sound/Space if gated | hold=72 live=true |
| 37 | `s14-staccato-legato/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 38 | `s14-staccato-legato/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 39 | `s14-staccato-legato/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=true hold0=90 hold1=87 **PASS**

Space: longHold didNotStop=true isManual=false shortPulse didNotStop=true

---

Screenshots root: `qa/screenshots/exercise-ui/{id}/`
