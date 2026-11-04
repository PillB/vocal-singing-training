# Live exercise UI forensics (headed, mouse, Space, mic)

**Generated:** 2026-07-17T21:52:19.895Z
**Mode:** headed-live-forensics
**Live duration:** 3s per exercise
**Result:** 4 exercises · **0 with issues** · P0=0

## Aggregate

| Metric | Value |
|--------|------:|
| hoverStartOk | 4 |
| micDragOk | 4 |
| liveOk | 4 |
| silenceGateOk | 4 |
| silenceGateN | 4 |
| spaceLongOk | 4 |
| spaceShortOk | 4 |
| liveSecondsCaptured | 12 |
| total | 4 |
| withIssues | 0 |

## Findings / improvements

_No automated P0/P1 issues._ Soft improvements listed per exercise when relevant.

## Per-exercise image index + forensic notes

### v1-diction — Better Diction (`rateLadder`)

**Notes:**
- Profile mode=rateLadder showPitch=false soundGated=false airHold=false wallClockPhase=true allowManual=true
- Mic drag 7→5 (restored)
- Silence 2s: airHold=false gated=false hold null→null remain 74→72 progress 0→0 PASS
- Space long: live mid/after=true/true manualChip=true engManual=true hold=null; short tap live=true; assistAllowed=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `v1-diction/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `v1-diction/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `v1-diction/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `v1-diction/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `v1-diction/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 7→5 |
| 6 | `v1-diction/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `v1-diction/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `v1-diction/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | phase timer may tick; not sound-count | hold=null remain=74 engHold=0 |
| 9 | `v1-diction/05_silence_after_2s.png` | Silence gate t=2s still silent | stable live | hold=null remain=72 live=true |
| 10 | `v1-diction/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `v1-diction/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=null |
| 12 | `v1-diction/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=false |
| 13 | `v1-diction/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `v1-diction/07_space_short_hold.png` | Space short hold 200ms | Still live; short press still prevents button activation | live=true manual=true |
| 15 | `v1-diction/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `v1-diction/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 17 | `v1-diction/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 18 | `v1-diction/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 19 | `v1-diction/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 20 | `v1-diction/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 21 | `v1-diction/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 22 | `v1-diction/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 23 | `v1-diction/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 24 | `v1-diction/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=false hold0=null hold1=null **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### s2-solfege-chords — /A/ Solfège on Chord Progressions (`pitchChord`)

**Notes:**
- Profile mode=pitchChord showPitch=true soundGated=true airHold=false wallClockPhase=false allowManual=true
- Mic drag 6→5 (restored)
- Silence 2s: airHold=false gated=true hold null→null remain null→null progress 0→0 PASS
- Space assist disabled on pure pitch highway (product)
- Space long: live mid/after=true/true manualChip=false engManual=false hold=null; short tap live=true; assistAllowed=false

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `s2-solfege-chords/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `s2-solfege-chords/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `s2-solfege-chords/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `s2-solfege-chords/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `s2-solfege-chords/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→5 |
| 6 | `s2-solfege-chords/03_highway_open.png` | Pitch highway / piano chrome | Canvas or pitch block visible for showPitch profile | pitch profile active |
| 7 | `s2-solfege-chords/04_start_before.png` | Before Start click | Ready state | about to start |
| 8 | `s2-solfege-chords/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 9 | `s2-solfege-chords/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | hold/progress stays ~0 without air/Space | hold=null remain=null engHold=0 |
| 10 | `s2-solfege-chords/05_silence_after_2s.png` | Silence gate t=2s still silent | hold/progress still ~0 | hold=null remain=null live=true |
| 11 | `s2-solfege-chords/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 12 | `s2-solfege-chords/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=false hold=null |
| 13 | `s2-solfege-chords/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=false |
| 14 | `s2-solfege-chords/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 15 | `s2-solfege-chords/07_space_short_hold.png` | Space short hold 200ms | Still live; short press still prevents button activation | live=true manual=false |
| 16 | `s2-solfege-chords/07_space_short_release.png` | After short Space release | Still live | live=true |
| 17 | `s2-solfege-chords/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 18 | `s2-solfege-chords/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 19 | `s2-solfege-chords/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 20 | `s2-solfege-chords/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 21 | `s2-solfege-chords/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 22 | `s2-solfege-chords/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 23 | `s2-solfege-chords/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 24 | `s2-solfege-chords/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 25 | `s2-solfege-chords/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=true hold0=null hold1=null **PASS**

Space: longHold didNotStop=true isManual=false shortPulse didNotStop=true

### s15-sh-air-ladder — SH Air-Dosing Ladder (`shAirLadder`)

**Notes:**
- Profile mode=shAirLadder showPitch=false soundGated=true airHold=true wallClockPhase=false allowManual=true
- Mic drag 6→5 (restored)
- Silence 2s: airHold=true gated=true hold 0→0 remain null→null progress 0→0 PASS
- Space long: live mid/after=true/true manualChip=true engManual=true hold=1.1; short tap live=true; assistAllowed=true

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `s15-sh-air-ladder/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `s15-sh-air-ladder/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `s15-sh-air-ladder/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `s15-sh-air-ladder/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `s15-sh-air-ladder/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→5 |
| 6 | `s15-sh-air-ladder/04_start_before.png` | Before Start click | Ready state | about to start |
| 7 | `s15-sh-air-ladder/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 8 | `s15-sh-air-ladder/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | hold/progress stays ~0 without air/Space | hold=0 remain=null engHold=0 |
| 9 | `s15-sh-air-ladder/05_silence_after_2s.png` | Silence gate t=2s still silent | hold/progress still ~0 | hold=0 remain=null live=true |
| 10 | `s15-sh-air-ladder/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 11 | `s15-sh-air-ladder/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=true hold=1.1 |
| 12 | `s15-sh-air-ladder/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=false |
| 13 | `s15-sh-air-ladder/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 14 | `s15-sh-air-ladder/07_space_short_hold.png` | Space short hold 200ms | Still live; short press still prevents button activation | live=true manual=true |
| 15 | `s15-sh-air-ladder/07_space_short_release.png` | After short Space release | Still live | live=true |
| 16 | `s15-sh-air-ladder/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=2.2 status=En vivo manual=false |
| 17 | `s15-sh-air-ladder/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=3.2 live=true |
| 18 | `s15-sh-air-ladder/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=3.3 status=En vivo manual=false |
| 19 | `s15-sh-air-ladder/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=4.5 live=true |
| 20 | `s15-sh-air-ladder/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=4.6 status=En vivo manual=false |
| 21 | `s15-sh-air-ladder/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=0 live=true |
| 22 | `s15-sh-air-ladder/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 23 | `s15-sh-air-ladder/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 24 | `s15-sh-air-ladder/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=true hold0=0 hold1=0 **PASS**

Space: longHold didNotStop=true isManual=true shortPulse didNotStop=true

### s9-pitch-match — Single-Note Pitch Match (`pitchMatch`)

**Notes:**
- Profile mode=pitchMatch showPitch=true soundGated=true airHold=false wallClockPhase=false allowManual=true
- Mic drag 6→5 (restored)
- Silence 2s: airHold=false gated=true hold null→null remain null→null progress 0→0 PASS
- Space assist disabled on pure pitch highway (product)
- Space long: live mid/after=true/true manualChip=false engManual=false hold=null; short tap live=true; assistAllowed=false

| # | File | Action | Expected | Actual / verdict |
|---|------|--------|----------|------------------|
| 1 | `s9-pitch-match/00_open.png` | Open exercise | Stage visible, Start hit-testable (except weekPlan), folds collapsed | captured open state |
| 2 | `s9-pitch-match/01_hover_start_before.png` | Before hover Start | Resting CTA style | baseline |
| 3 | `s9-pitch-match/01_hover_start_after.png` | After mouse.move onto Start | brightness/glow/lift; hitSelf Start | PASS hover feedback |
| 4 | `s9-pitch-match/02_mic_before.png` | Mic before drag | Range interactive; value readable | baseline mic |
| 5 | `s9-pitch-match/02_mic_after_drag.png` | Mic after mouse drag −50px | value changes from drag | PASS 6→5 |
| 6 | `s9-pitch-match/03_highway_open.png` | Pitch highway / piano chrome | Canvas or pitch block visible for showPitch profile | pitch profile active |
| 7 | `s9-pitch-match/04_start_before.png` | Before Start click | Ready state | about to start |
| 8 | `s9-pitch-match/04_start_after.png` | After Start (live) | Stop visible; status En vivo/live | PASS live status=En vivo |
| 9 | `s9-pitch-match/05_silence_before.png` | Silence gate t=0 (silent mic, no Space) | hold/progress stays ~0 without air/Space | hold=null remain=null engHold=0 |
| 10 | `s9-pitch-match/05_silence_after_2s.png` | Silence gate t=2s still silent | hold/progress still ~0 | hold=null remain=null live=true |
| 11 | `s9-pitch-match/06_space_long_before.png` | Before Space long-hold (Stop focused) | Space must NOT activate Stop; may set is-manual | focus=btn-practice-stop |
| 12 | `s9-pitch-match/06_space_long_hold.png` | Space held ~1.1s | Still live; assist active if allowManualSound | live=true manual=false hold=null |
| 13 | `s9-pitch-match/06_space_long_release.png` | Short release after long hold | Still live; grace may keep assist briefly | live=true manual=false |
| 14 | `s9-pitch-match/07_space_short_before.png` | Before short Space tap | Quick down/up assist pulse | ready |
| 15 | `s9-pitch-match/07_space_short_hold.png` | Space short hold 200ms | Still live; short press still prevents button activation | live=true manual=false |
| 16 | `s9-pitch-match/07_space_short_release.png` | After short Space release | Still live | live=true |
| 17 | `s9-pitch-match/08_live_s00_before.png` | Live second 0 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 18 | `s9-pitch-match/08_live_s00_after.png` | Live second 0 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 19 | `s9-pitch-match/08_live_s01_before.png` | Live second 1 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 20 | `s9-pitch-match/08_live_s01_after.png` | Live second 1 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 21 | `s9-pitch-match/08_live_s02_before.png` | Live second 2 before tick | Still live; highway/mode UI updating | hold=null status=En vivo manual=false |
| 22 | `s9-pitch-match/08_live_s02_after.png` | Live second 2 after tick | No crash; counters only advance with sound/Space if gated | hold=null live=true |
| 23 | `s9-pitch-match/09_stop_hover.png` | Hover Stop | Stop hit-testable | hover stop |
| 24 | `s9-pitch-match/09_after_stop.png` | After Stop | Not live; metrics often auto-open | live=false metricsOpen=true |
| 25 | `s9-pitch-match/10_hover_back.png` | Hover Back | Returns home on click | hover |

Silence gate: soundGated=true hold0=null hold1=null **PASS**

Space: longHold didNotStop=true isManual=false shortPulse didNotStop=true

---

Screenshots root: `qa/screenshots/exercise-ui/{id}/`
