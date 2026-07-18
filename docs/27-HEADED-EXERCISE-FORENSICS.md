# Headed multi-format exercise UI forensics (mouse-only)

**Generated:** 2026-07-18T00:32:33.742Z
**Mode:** headed · slowMo=50ms · mouse.move/click only · no reflow thrash
**Formats:** desktop, mobile, fullscreen
**Exercises×formats:** 12 · **actions:** 168 · **issues:** 0

## Method

- Chromium **headed** with pink cursor overlay.
- Every interaction: `mouse.move({ steps })` approach → `mouse.down` / `mouse.up`.
- Space: `keyboard.down('Space')` hold → `up` while live.
- Open exercises by mouse (tab → tier → card). No `element.click()` / `stopPractice()` shortcuts.
- No repeated `fitHighway` / `scrollTo` (that caused UI flicker).
- Screenshots before/after key actions with expected vs actual verdict.

## Summary

| Metric | Value |
|--------|------:|
| hover_ok | 12 |
| hover_fail | 0 |
| start_ok | 12 |
| start_fail | 0 |
| space_ok | 12 |
| space_fail | 0 |
| stop_ok | 12 |
| stop_fail | 0 |

## Format: `desktop` (1280×800)

### v1-diction — Better Diction (`rateLadder`)

| Shot | Action | Expected | Actual | Verdict |
|------|--------|----------|--------|---------|
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/00_open.png` | open_exercise | Exercise view; Start visible | live=false · status="Listo" · mode=rateLadder · manual=false · hold=0 · startVisible=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/01_hover_start_before.png` | hover_start_before | Start idle | at 178,669 | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/01_hover_start_after.png` | hover_start_after | Hover feedback and/or pointer; hit-self | changed=[filter,boxShadow,transform] cursor=pointer hit=btn-practice-start hitSelf=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/02_hover_btn-ui-help.png` | hover_btn-ui-help | Hover lands on control | center=1081,65 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/02_hover_mic-sensitivity.png` | hover_mic-sensitivity | Hover lands on control | center=769,669 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/03_mic_drag.png` | mic_drag | Mic value rises via track drag (low→high) | before=2 after=9 w=709 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/02_hover_btn-toggle-guide.png` | hover_btn-toggle-guide | Hover lands on control | center=1064,750 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/04_btn-toggle-guide_before.png` | btn-toggle-guide_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/04_btn-toggle-guide_after.png` | btn-toggle-guide_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/02_hover_btn-toggle-metrics.png` | hover_btn-toggle-metrics | Hover lands on control | center=1090,731 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/04_btn-toggle-metrics_before.png` | btn-toggle-metrics_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/04_btn-toggle-metrics_after.png` | btn-toggle-metrics_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/10_start_before.png` | start_before | Ready; Start clickable | live=false · status="Listo" · mode=rateLadder · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/10_start_after.png` | start_after | Practice live after mouse Start | live=true · status="En vivo" · mode=rateLadder · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/11_space_before.png` | space_before | Live, assist idle | live=true · status="En vivo" · mode=rateLadder · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/11_space_hold.png` | space_hold | Manual assist active; still live | live=true · status="En vivo" · mode=rateLadder · manual=true · hold=0.4844000000357628 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/11_space_after.png` | space_release | Still live after release | live=true · status="En vivo" · mode=rateLadder · manual=true · hold=0.9206000000238419 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/12_live_silence.png` | live_silence | Remains live on silence | live=true · status="En vivo" · mode=rateLadder · manual=false · hold=1.3874000000357627 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/13_stop_before.png` | stop_before | Stop button visible | live=true · status="En vivo" · mode=rateLadder · manual=false · hold=1.537600000023842 | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/13_stop_after.png` | stop_after | Stopped after mouse on Stop | live=false · status="Listo" · mode=rateLadder · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/20_back_hover.png` | back_hover | Back button in view | center=1136,65 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/v1-diction/20_back_after.png` | back_home | Home view active after mouse Back | homeActive=true | **PASS** |

### s2-solfege-chords — /A/ Solfège on Chord Progressions (`pitchChord`)

| Shot | Action | Expected | Actual | Verdict |
|------|--------|----------|--------|---------|
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/00_open.png` | open_exercise | Exercise view; Start visible | live=false · status="Listo" · mode=pitchChord · manual=false · hold=0 · startVisible=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/01_hover_start_before.png` | hover_start_before | Start idle | at 178,622 | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/01_hover_start_after.png` | hover_start_after | Hover feedback and/or pointer; hit-self | changed=[filter,boxShadow,transform] cursor=pointer hit=btn-practice-start hitSelf=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/02_hover_btn-ui-help.png` | hover_btn-ui-help | Hover lands on control | center=1081,65 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/02_hover_mic-sensitivity.png` | hover_mic-sensitivity | Hover lands on control | center=659,622 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/03_mic_drag.png` | mic_drag | Mic value rises via track drag (low→high) | before=2 after=9 w=490 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/02_hover_btn-toggle-piano.png` | hover_btn-toggle-piano | Hover lands on control | center=1131,622 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/04_btn-toggle-piano_before.png` | btn-toggle-piano_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/04_btn-toggle-piano_after.png` | btn-toggle-piano_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/02_hover_btn-toggle-guide.png` | hover_btn-toggle-guide | Hover lands on control | center=1064,653 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/04_btn-toggle-guide_before.png` | btn-toggle-guide_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/04_btn-toggle-guide_after.png` | btn-toggle-guide_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/02_hover_btn-toggle-metrics.png` | hover_btn-toggle-metrics | Hover lands on control | center=1090,731 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/04_btn-toggle-metrics_before.png` | btn-toggle-metrics_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/04_btn-toggle-metrics_after.png` | btn-toggle-metrics_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/10_start_before.png` | start_before | Ready; Start clickable | live=false · status="Listo" · mode=pitchChord · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/10_start_after.png` | start_after | Practice live after mouse Start | live=true · status="En vivo" · mode=pitchChord · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/11_space_before.png` | space_before | Live, assist idle | live=true · status="En vivo" · mode=pitchChord · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/11_space_hold.png` | space_hold | Still live (pitch may ignore Space) | live=true · status="En vivo" · mode=pitchChord · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/11_space_after.png` | space_release | Still live after release | live=true · status="En vivo" · mode=pitchChord · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/12_live_silence.png` | live_silence | Remains live on silence | live=true · status="En vivo" · mode=pitchChord · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/13_stop_before.png` | stop_before | Stop button visible | live=true · status="En vivo" · mode=pitchChord · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/13_stop_after.png` | stop_after | Stopped after mouse on Stop | live=false · status="Listo" · mode=pitchChord · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/20_back_hover.png` | back_hover | Back button in view | center=1136,65 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s2-solfege-chords/20_back_after.png` | back_home | Home view active after mouse Back | homeActive=true | **PASS** |

### s15-sh-air-ladder — SH Air-Dosing Ladder (`shAirLadder`)

| Shot | Action | Expected | Actual | Verdict |
|------|--------|----------|--------|---------|
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/00_open.png` | open_exercise | Exercise view; Start visible | live=false · status="Listo" · mode=shAirLadder · manual=false · hold=0 · startVisible=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/01_hover_start_before.png` | hover_start_before | Start idle | at 178,669 | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/01_hover_start_after.png` | hover_start_after | Hover feedback and/or pointer; hit-self | changed=[filter,boxShadow,transform] cursor=pointer hit=btn-practice-start hitSelf=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/02_hover_btn-ui-help.png` | hover_btn-ui-help | Hover lands on control | center=1081,65 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/02_hover_mic-sensitivity.png` | hover_mic-sensitivity | Hover lands on control | center=769,669 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/03_mic_drag.png` | mic_drag | Mic value rises via track drag (low→high) | before=2 after=9 w=709 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/02_hover_btn-toggle-guide.png` | hover_btn-toggle-guide | Hover lands on control | center=1064,750 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/04_btn-toggle-guide_before.png` | btn-toggle-guide_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/04_btn-toggle-guide_after.png` | btn-toggle-guide_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/02_hover_btn-toggle-metrics.png` | hover_btn-toggle-metrics | Hover lands on control | center=1090,731 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/04_btn-toggle-metrics_before.png` | btn-toggle-metrics_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/04_btn-toggle-metrics_after.png` | btn-toggle-metrics_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/10_start_before.png` | start_before | Ready; Start clickable | live=false · status="Listo" · mode=shAirLadder · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/10_start_after.png` | start_after | Practice live after mouse Start | live=true · status="En vivo" · mode=shAirLadder · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/11_space_before.png` | space_before | Live, assist idle | live=true · status="En vivo" · mode=shAirLadder · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/11_space_hold.png` | space_hold | Manual assist active; still live | live=true · status="En vivo" · mode=shAirLadder · manual=true · hold=0.5 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/11_space_after.png` | space_release | Still live after release | live=true · status="En vivo" · mode=shAirLadder · manual=true · hold=0.9 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/12_live_silence.png` | live_silence | Remains live on silence | live=true · status="En vivo" · mode=shAirLadder · manual=false · hold=1.4 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/13_stop_before.png` | stop_before | Stop button visible | live=true · status="En vivo" · mode=shAirLadder · manual=false · hold=1.5 | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/13_stop_after.png` | stop_after | Stopped after mouse on Stop | live=false · status="Listo" · mode=shAirLadder · manual=false · hold=2.2 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/20_back_hover.png` | back_hover | Back button in view | center=1136,65 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s15-sh-air-ladder/20_back_after.png` | back_home | Home view active after mouse Back | homeActive=true | **PASS** |

### s9-pitch-match — Single-Note Pitch Match (`pitchMatch`)

| Shot | Action | Expected | Actual | Verdict |
|------|--------|----------|--------|---------|
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/00_open.png` | open_exercise | Exercise view; Start visible | live=false · status="Listo" · mode=pitchMatch · manual=false · hold=0 · startVisible=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/01_hover_start_before.png` | hover_start_before | Start idle | at 178,622 | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/01_hover_start_after.png` | hover_start_after | Hover feedback and/or pointer; hit-self | changed=[filter,boxShadow,transform] cursor=pointer hit=btn-practice-start hitSelf=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/02_hover_btn-ui-help.png` | hover_btn-ui-help | Hover lands on control | center=1081,65 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/02_hover_mic-sensitivity.png` | hover_mic-sensitivity | Hover lands on control | center=659,622 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/03_mic_drag.png` | mic_drag | Mic value rises via track drag (low→high) | before=2 after=9 w=490 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/02_hover_btn-toggle-piano.png` | hover_btn-toggle-piano | Hover lands on control | center=1131,622 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/04_btn-toggle-piano_before.png` | btn-toggle-piano_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/04_btn-toggle-piano_after.png` | btn-toggle-piano_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/02_hover_btn-toggle-guide.png` | hover_btn-toggle-guide | Hover lands on control | center=1064,653 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/04_btn-toggle-guide_before.png` | btn-toggle-guide_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/04_btn-toggle-guide_after.png` | btn-toggle-guide_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/02_hover_btn-toggle-metrics.png` | hover_btn-toggle-metrics | Hover lands on control | center=1090,731 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/04_btn-toggle-metrics_before.png` | btn-toggle-metrics_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/04_btn-toggle-metrics_after.png` | btn-toggle-metrics_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/10_start_before.png` | start_before | Ready; Start clickable | live=false · status="Listo" · mode=pitchMatch · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/10_start_after.png` | start_after | Practice live after mouse Start | live=true · status="En vivo" · mode=pitchMatch · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/11_space_before.png` | space_before | Live, assist idle | live=true · status="En vivo" · mode=pitchMatch · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/11_space_hold.png` | space_hold | Still live (pitch may ignore Space) | live=true · status="En vivo" · mode=pitchMatch · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/11_space_after.png` | space_release | Still live after release | live=true · status="En vivo" · mode=pitchMatch · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/12_live_silence.png` | live_silence | Remains live on silence | live=true · status="En vivo" · mode=pitchMatch · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/13_stop_before.png` | stop_before | Stop button visible | live=true · status="En vivo" · mode=pitchMatch · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/13_stop_after.png` | stop_after | Stopped after mouse on Stop | live=false · status="Listo" · mode=pitchMatch · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/20_back_hover.png` | back_hover | Back button in view | center=1136,65 | **PASS** |
| `qa/screenshots/exercise-ui-formats/desktop/s9-pitch-match/20_back_after.png` | back_home | Home view active after mouse Back | homeActive=true | **PASS** |

## Format: `mobile` (390×844)

### v1-diction — Better Diction (`rateLadder`)

| Shot | Action | Expected | Actual | Verdict |
|------|--------|----------|--------|---------|
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/00_open.png` | open_exercise | Exercise view; Start visible | live=false · status="Listo" · mode=rateLadder · manual=false · hold=0 · startVisible=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/01_hover_start_before.png` | hover_start_before | Start idle | at 86,731 | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/01_hover_start_after.png` | hover_start_after | Hover feedback and/or pointer; hit-self | changed=[filter,boxShadow,transform] cursor=pointer hit=btn-practice-start hitSelf=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/02_hover_btn-ui-help.png` | hover_btn-ui-help | Hover lands on control | center=283,93 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/02_hover_mic-sensitivity.png` | hover_mic-sensitivity | Hover lands on control | center=195,684 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/03_mic_drag.png` | mic_drag | Mic value rises via track drag (low→high) | before=1 after=10 w=162 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/02_hover_btn-toggle-guide.png` | hover_btn-toggle-guide | Hover lands on control | center=268,816 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/04_btn-toggle-guide_before.png` | btn-toggle-guide_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/04_btn-toggle-guide_after.png` | btn-toggle-guide_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/02_hover_btn-toggle-metrics.png` | hover_btn-toggle-metrics | Hover lands on control | center=295,770 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/04_btn-toggle-metrics_before.png` | btn-toggle-metrics_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/04_btn-toggle-metrics_after.png` | btn-toggle-metrics_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/10_start_before.png` | start_before | Ready; Start clickable | live=false · status="Listo" · mode=rateLadder · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/10_start_after.png` | start_after | Practice live after mouse Start | live=true · status="En vivo" · mode=rateLadder · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/11_space_before.png` | space_before | Live, assist idle | live=true · status="En vivo" · mode=rateLadder · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/11_space_hold.png` | space_hold | Manual assist active; still live | live=true · status="En vivo" · mode=rateLadder · manual=true · hold=0.48969999998807906 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/11_space_after.png` | space_release | Still live after release | live=true · status="En vivo" · mode=rateLadder · manual=true · hold=0.9035 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/12_live_silence.png` | live_silence | Remains live on silence | live=true · status="En vivo" · mode=rateLadder · manual=false · hold=1.328300000011921 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/13_stop_before.png` | stop_before | Stop button visible | live=true · status="En vivo" · mode=rateLadder · manual=false · hold=1.475699999988079 | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/13_stop_after.png` | stop_after | Stopped after mouse on Stop | live=false · status="Listo" · mode=rateLadder · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/20_back_hover.png` | back_hover | Back button in view | center=337,93 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/v1-diction/20_back_after.png` | back_home | Home view active after mouse Back | homeActive=true | **PASS** |

### s2-solfege-chords — /A/ Solfège on Chord Progressions (`pitchChord`)

| Shot | Action | Expected | Actual | Verdict |
|------|--------|----------|--------|---------|
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/00_open.png` | open_exercise | Exercise view; Start visible | live=false · status="Listo" · mode=pitchChord · manual=false · hold=0 · startVisible=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/01_hover_start_before.png` | hover_start_before | Start idle | at 86,629 | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/01_hover_start_after.png` | hover_start_after | Hover feedback and/or pointer; hit-self | changed=[filter,boxShadow,transform] cursor=pointer hit=btn-practice-start hitSelf=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/02_hover_btn-ui-help.png` | hover_btn-ui-help | Hover lands on control | center=283,39 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/02_hover_mic-sensitivity.png` | hover_mic-sensitivity | Hover lands on control | center=195,587 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/03_mic_drag.png` | mic_drag | Mic value rises via track drag (low→high) | before=1 after=10 w=162 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/02_hover_btn-toggle-piano.png` | hover_btn-toggle-piano | Hover lands on control | center=286,682 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/04_btn-toggle-piano_before.png` | btn-toggle-piano_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/04_btn-toggle-piano_after.png` | btn-toggle-piano_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/02_hover_btn-toggle-guide.png` | hover_btn-toggle-guide | Hover lands on control | center=268,681 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/04_btn-toggle-guide_before.png` | btn-toggle-guide_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/04_btn-toggle-guide_after.png` | btn-toggle-guide_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/02_hover_btn-toggle-metrics.png` | hover_btn-toggle-metrics | Hover lands on control | center=295,770 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/04_btn-toggle-metrics_before.png` | btn-toggle-metrics_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/04_btn-toggle-metrics_after.png` | btn-toggle-metrics_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/10_start_before.png` | start_before | Ready; Start clickable | live=false · status="Listo" · mode=pitchChord · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/10_start_after.png` | start_after | Practice live after mouse Start | live=true · status="En vivo" · mode=pitchChord · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/11_space_before.png` | space_before | Live, assist idle | live=true · status="En vivo" · mode=pitchChord · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/11_space_hold.png` | space_hold | Still live (pitch may ignore Space) | live=true · status="En vivo" · mode=pitchChord · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/11_space_after.png` | space_release | Still live after release | live=true · status="En vivo" · mode=pitchChord · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/12_live_silence.png` | live_silence | Remains live on silence | live=true · status="En vivo" · mode=pitchChord · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/13_stop_before.png` | stop_before | Stop button visible | live=true · status="En vivo" · mode=pitchChord · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/13_stop_after.png` | stop_after | Stopped after mouse on Stop | live=false · status="Listo" · mode=pitchChord · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/20_back_hover.png` | back_hover | Back button in view | center=337,122 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s2-solfege-chords/20_back_after.png` | back_home | Home view active after mouse Back | homeActive=true | **PASS** |

### s15-sh-air-ladder — SH Air-Dosing Ladder (`shAirLadder`)

| Shot | Action | Expected | Actual | Verdict |
|------|--------|----------|--------|---------|
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/00_open.png` | open_exercise | Exercise view; Start visible | live=false · status="Listo" · mode=shAirLadder · manual=false · hold=0 · startVisible=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/01_hover_start_before.png` | hover_start_before | Start idle | at 86,760 | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/01_hover_start_after.png` | hover_start_after | Hover feedback and/or pointer; hit-self | changed=[filter,boxShadow,transform] cursor=pointer hit=btn-practice-start hitSelf=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/02_hover_btn-ui-help.png` | hover_btn-ui-help | Hover lands on control | center=283,122 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/02_hover_mic-sensitivity.png` | hover_mic-sensitivity | Hover lands on control | center=195,713 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/03_mic_drag.png` | mic_drag | Mic value rises via track drag (low→high) | before=1 after=10 w=162 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/02_hover_btn-toggle-guide.png` | hover_btn-toggle-guide | Hover lands on control | center=268,681 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/04_btn-toggle-guide_before.png` | btn-toggle-guide_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/04_btn-toggle-guide_after.png` | btn-toggle-guide_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/02_hover_btn-toggle-metrics.png` | hover_btn-toggle-metrics | Hover lands on control | center=295,770 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/04_btn-toggle-metrics_before.png` | btn-toggle-metrics_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/04_btn-toggle-metrics_after.png` | btn-toggle-metrics_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/10_start_before.png` | start_before | Ready; Start clickable | live=false · status="Listo" · mode=shAirLadder · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/10_start_after.png` | start_after | Practice live after mouse Start | live=true · status="En vivo" · mode=shAirLadder · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/11_space_before.png` | space_before | Live, assist idle | live=true · status="En vivo" · mode=shAirLadder · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/11_space_hold.png` | space_hold | Manual assist active; still live | live=true · status="En vivo" · mode=shAirLadder · manual=true · hold=0.5 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/11_space_after.png` | space_release | Still live after release | live=true · status="En vivo" · mode=shAirLadder · manual=true · hold=0.9 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/12_live_silence.png` | live_silence | Remains live on silence | live=true · status="En vivo" · mode=shAirLadder · manual=false · hold=1.3 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/13_stop_before.png` | stop_before | Stop button visible | live=true · status="En vivo" · mode=shAirLadder · manual=false · hold=1.5 | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/13_stop_after.png` | stop_after | Stopped after mouse on Stop | live=false · status="Listo" · mode=shAirLadder · manual=false · hold=2.1 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/20_back_hover.png` | back_hover | Back button in view | center=337,122 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s15-sh-air-ladder/20_back_after.png` | back_home | Home view active after mouse Back | homeActive=true | **PASS** |

### s9-pitch-match — Single-Note Pitch Match (`pitchMatch`)

| Shot | Action | Expected | Actual | Verdict |
|------|--------|----------|--------|---------|
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/00_open.png` | open_exercise | Exercise view; Start visible | live=false · status="Listo" · mode=pitchMatch · manual=false · hold=0 · startVisible=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/01_hover_start_before.png` | hover_start_before | Start idle | at 86,688 | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/01_hover_start_after.png` | hover_start_after | Hover feedback and/or pointer; hit-self | changed=[filter,boxShadow,transform] cursor=pointer hit=btn-practice-start hitSelf=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/02_hover_btn-ui-help.png` | hover_btn-ui-help | Hover lands on control | center=283,93 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/02_hover_mic-sensitivity.png` | hover_mic-sensitivity | Hover lands on control | center=195,582 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/03_mic_drag.png` | mic_drag | Mic value rises via track drag (low→high) | before=1 after=10 w=162 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/02_hover_btn-toggle-piano.png` | hover_btn-toggle-piano | Hover lands on control | center=286,677 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/04_btn-toggle-piano_before.png` | btn-toggle-piano_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/04_btn-toggle-piano_after.png` | btn-toggle-piano_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/02_hover_btn-toggle-guide.png` | hover_btn-toggle-guide | Hover lands on control | center=268,681 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/04_btn-toggle-guide_before.png` | btn-toggle-guide_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/04_btn-toggle-guide_after.png` | btn-toggle-guide_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/02_hover_btn-toggle-metrics.png` | hover_btn-toggle-metrics | Hover lands on control | center=295,770 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/04_btn-toggle-metrics_before.png` | btn-toggle-metrics_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/04_btn-toggle-metrics_after.png` | btn-toggle-metrics_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/10_start_before.png` | start_before | Ready; Start clickable | live=false · status="Listo" · mode=pitchMatch · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/10_start_after.png` | start_after | Practice live after mouse Start | live=true · status="En vivo" · mode=pitchMatch · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/11_space_before.png` | space_before | Live, assist idle | live=true · status="En vivo" · mode=pitchMatch · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/11_space_hold.png` | space_hold | Still live (pitch may ignore Space) | live=true · status="En vivo" · mode=pitchMatch · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/11_space_after.png` | space_release | Still live after release | live=true · status="En vivo" · mode=pitchMatch · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/12_live_silence.png` | live_silence | Remains live on silence | live=true · status="En vivo" · mode=pitchMatch · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/13_stop_before.png` | stop_before | Stop button visible | live=true · status="En vivo" · mode=pitchMatch · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/13_stop_after.png` | stop_after | Stopped after mouse on Stop | live=false · status="Listo" · mode=pitchMatch · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/20_back_hover.png` | back_hover | Back button in view | center=337,93 | **PASS** |
| `qa/screenshots/exercise-ui-formats/mobile/s9-pitch-match/20_back_after.png` | back_home | Home view active after mouse Back | homeActive=true | **PASS** |

## Format: `fullscreen` (1440×900 fullscreen)

### v1-diction — Better Diction (`rateLadder`)

| Shot | Action | Expected | Actual | Verdict |
|------|--------|----------|--------|---------|
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/00_open.png` | open_exercise | Exercise view; Start visible | live=false · status="Listo" · mode=rateLadder · manual=false · hold=0 · startVisible=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/01_hover_start_before.png` | hover_start_before | Start idle | at 258,745 | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/01_hover_start_after.png` | hover_start_after | Hover feedback and/or pointer; hit-self | changed=[filter,boxShadow,transform] cursor=pointer hit=btn-practice-start hitSelf=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/02_hover_btn-ui-help.png` | hover_btn-ui-help | Hover lands on control | center=1161,65 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/02_hover_mic-sensitivity.png` | hover_mic-sensitivity | Hover lands on control | center=849,745 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/03_mic_drag.png` | mic_drag | Mic value rises via track drag (low→high) | before=2 after=9 w=709 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/02_hover_btn-toggle-guide.png` | hover_btn-toggle-guide | Hover lands on control | center=1144,826 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/04_btn-toggle-guide_before.png` | btn-toggle-guide_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/04_btn-toggle-guide_after.png` | btn-toggle-guide_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/02_hover_btn-toggle-metrics.png` | hover_btn-toggle-metrics | Hover lands on control | center=1170,831 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/04_btn-toggle-metrics_before.png` | btn-toggle-metrics_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/04_btn-toggle-metrics_after.png` | btn-toggle-metrics_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/10_start_before.png` | start_before | Ready; Start clickable | live=false · status="Listo" · mode=rateLadder · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/10_start_after.png` | start_after | Practice live after mouse Start | live=true · status="En vivo" · mode=rateLadder · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/11_space_before.png` | space_before | Live, assist idle | live=true · status="En vivo" · mode=rateLadder · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/11_space_hold.png` | space_hold | Manual assist active; still live | live=true · status="En vivo" · mode=rateLadder · manual=true · hold=0.46960000002384183 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/11_space_after.png` | space_release | Still live after release | live=true · status="En vivo" · mode=rateLadder · manual=true · hold=0.9201999999880791 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/12_live_silence.png` | live_silence | Remains live on silence | live=true · status="En vivo" · mode=rateLadder · manual=false · hold=1.4793999999761582 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/13_stop_before.png` | stop_before | Stop button visible | live=true · status="En vivo" · mode=rateLadder · manual=false · hold=1.6468999999761582 | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/13_stop_after.png` | stop_after | Stopped after mouse on Stop | live=false · status="Listo" · mode=rateLadder · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/20_back_hover.png` | back_hover | Back button in view | center=1216,65 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/v1-diction/20_back_after.png` | back_home | Home view active after mouse Back | homeActive=true | **PASS** |

### s2-solfege-chords — /A/ Solfège on Chord Progressions (`pitchChord`)

| Shot | Action | Expected | Actual | Verdict |
|------|--------|----------|--------|---------|
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/00_open.png` | open_exercise | Exercise view; Start visible | live=false · status="Listo" · mode=pitchChord · manual=false · hold=0 · startVisible=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/01_hover_start_before.png` | hover_start_before | Start idle | at 258,698 | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/01_hover_start_after.png` | hover_start_after | Hover feedback and/or pointer; hit-self | changed=[filter,boxShadow,transform] cursor=pointer hit=btn-practice-start hitSelf=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/02_hover_btn-ui-help.png` | hover_btn-ui-help | Hover lands on control | center=1161,65 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/02_hover_mic-sensitivity.png` | hover_mic-sensitivity | Hover lands on control | center=739,698 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/03_mic_drag.png` | mic_drag | Mic value rises via track drag (low→high) | before=2 after=9 w=489 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/02_hover_btn-toggle-piano.png` | hover_btn-toggle-piano | Hover lands on control | center=1211,698 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/04_btn-toggle-piano_before.png` | btn-toggle-piano_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/04_btn-toggle-piano_after.png` | btn-toggle-piano_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/02_hover_btn-toggle-guide.png` | hover_btn-toggle-guide | Hover lands on control | center=1144,753 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/04_btn-toggle-guide_before.png` | btn-toggle-guide_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/04_btn-toggle-guide_after.png` | btn-toggle-guide_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/02_hover_btn-toggle-metrics.png` | hover_btn-toggle-metrics | Hover lands on control | center=1170,831 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/04_btn-toggle-metrics_before.png` | btn-toggle-metrics_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/04_btn-toggle-metrics_after.png` | btn-toggle-metrics_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/10_start_before.png` | start_before | Ready; Start clickable | live=false · status="Listo" · mode=pitchChord · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/10_start_after.png` | start_after | Practice live after mouse Start | live=true · status="En vivo" · mode=pitchChord · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/11_space_before.png` | space_before | Live, assist idle | live=true · status="En vivo" · mode=pitchChord · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/11_space_hold.png` | space_hold | Still live (pitch may ignore Space) | live=true · status="En vivo" · mode=pitchChord · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/11_space_after.png` | space_release | Still live after release | live=true · status="En vivo" · mode=pitchChord · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/12_live_silence.png` | live_silence | Remains live on silence | live=true · status="En vivo" · mode=pitchChord · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/13_stop_before.png` | stop_before | Stop button visible | live=true · status="En vivo" · mode=pitchChord · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/13_stop_after.png` | stop_after | Stopped after mouse on Stop | live=false · status="Listo" · mode=pitchChord · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/20_back_hover.png` | back_hover | Back button in view | center=1216,65 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s2-solfege-chords/20_back_after.png` | back_home | Home view active after mouse Back | homeActive=true | **PASS** |

### s15-sh-air-ladder — SH Air-Dosing Ladder (`shAirLadder`)

| Shot | Action | Expected | Actual | Verdict |
|------|--------|----------|--------|---------|
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/00_open.png` | open_exercise | Exercise view; Start visible | live=false · status="Listo" · mode=shAirLadder · manual=false · hold=0 · startVisible=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/01_hover_start_before.png` | hover_start_before | Start idle | at 258,745 | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/01_hover_start_after.png` | hover_start_after | Hover feedback and/or pointer; hit-self | changed=[filter,boxShadow,transform] cursor=pointer hit=btn-practice-start hitSelf=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/02_hover_btn-ui-help.png` | hover_btn-ui-help | Hover lands on control | center=1161,65 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/02_hover_mic-sensitivity.png` | hover_mic-sensitivity | Hover lands on control | center=849,745 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/03_mic_drag.png` | mic_drag | Mic value rises via track drag (low→high) | before=2 after=9 w=709 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/02_hover_btn-toggle-guide.png` | hover_btn-toggle-guide | Hover lands on control | center=1144,826 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/04_btn-toggle-guide_before.png` | btn-toggle-guide_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/04_btn-toggle-guide_after.png` | btn-toggle-guide_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/02_hover_btn-toggle-metrics.png` | hover_btn-toggle-metrics | Hover lands on control | center=1170,831 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/04_btn-toggle-metrics_before.png` | btn-toggle-metrics_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/04_btn-toggle-metrics_after.png` | btn-toggle-metrics_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/10_start_before.png` | start_before | Ready; Start clickable | live=false · status="Listo" · mode=shAirLadder · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/10_start_after.png` | start_after | Practice live after mouse Start | live=true · status="En vivo" · mode=shAirLadder · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/11_space_before.png` | space_before | Live, assist idle | live=true · status="En vivo" · mode=shAirLadder · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/11_space_hold.png` | space_hold | Manual assist active; still live | live=true · status="En vivo" · mode=shAirLadder · manual=true · hold=0.5 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/11_space_after.png` | space_release | Still live after release | live=true · status="En vivo" · mode=shAirLadder · manual=true · hold=1 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/12_live_silence.png` | live_silence | Remains live on silence | live=true · status="En vivo" · mode=shAirLadder · manual=false · hold=1.4 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/13_stop_before.png` | stop_before | Stop button visible | live=true · status="En vivo" · mode=shAirLadder · manual=false · hold=1.6 | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/13_stop_after.png` | stop_after | Stopped after mouse on Stop | live=false · status="Listo" · mode=shAirLadder · manual=false · hold=2.3 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/20_back_hover.png` | back_hover | Back button in view | center=1216,65 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s15-sh-air-ladder/20_back_after.png` | back_home | Home view active after mouse Back | homeActive=true | **PASS** |

### s9-pitch-match — Single-Note Pitch Match (`pitchMatch`)

| Shot | Action | Expected | Actual | Verdict |
|------|--------|----------|--------|---------|
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/00_open.png` | open_exercise | Exercise view; Start visible | live=false · status="Listo" · mode=pitchMatch · manual=false · hold=0 · startVisible=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/01_hover_start_before.png` | hover_start_before | Start idle | at 258,698 | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/01_hover_start_after.png` | hover_start_after | Hover feedback and/or pointer; hit-self | changed=[filter,boxShadow,transform] cursor=pointer hit=btn-practice-start hitSelf=true | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/02_hover_btn-ui-help.png` | hover_btn-ui-help | Hover lands on control | center=1161,65 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/02_hover_mic-sensitivity.png` | hover_mic-sensitivity | Hover lands on control | center=739,698 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/03_mic_drag.png` | mic_drag | Mic value rises via track drag (low→high) | before=2 after=9 w=489 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/02_hover_btn-toggle-piano.png` | hover_btn-toggle-piano | Hover lands on control | center=1211,698 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/04_btn-toggle-piano_before.png` | btn-toggle-piano_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/04_btn-toggle-piano_after.png` | btn-toggle-piano_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/02_hover_btn-toggle-guide.png` | hover_btn-toggle-guide | Hover lands on control | center=1144,753 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/04_btn-toggle-guide_before.png` | btn-toggle-guide_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/04_btn-toggle-guide_after.png` | btn-toggle-guide_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/02_hover_btn-toggle-metrics.png` | hover_btn-toggle-metrics | Hover lands on control | center=1170,831 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/04_btn-toggle-metrics_before.png` | btn-toggle-metrics_before | Panel baseline | before mouse click | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/04_btn-toggle-metrics_after.png` | btn-toggle-metrics_after | Panel toggles after mouse click | after mouse click | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/10_start_before.png` | start_before | Ready; Start clickable | live=false · status="Listo" · mode=pitchMatch · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/10_start_after.png` | start_after | Practice live after mouse Start | live=true · status="En vivo" · mode=pitchMatch · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/11_space_before.png` | space_before | Live, assist idle | live=true · status="En vivo" · mode=pitchMatch · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/11_space_hold.png` | space_hold | Still live (pitch may ignore Space) | live=true · status="En vivo" · mode=pitchMatch · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/11_space_after.png` | space_release | Still live after release | live=true · status="En vivo" · mode=pitchMatch · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/12_live_silence.png` | live_silence | Remains live on silence | live=true · status="En vivo" · mode=pitchMatch · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/13_stop_before.png` | stop_before | Stop button visible | live=true · status="En vivo" · mode=pitchMatch · manual=false · hold=0 | **INFO** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/13_stop_after.png` | stop_after | Stopped after mouse on Stop | live=false · status="Listo" · mode=pitchMatch · manual=false · hold=0 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/20_back_hover.png` | back_hover | Back button in view | center=1216,65 | **PASS** |
| `qa/screenshots/exercise-ui-formats/fullscreen/s9-pitch-match/20_back_after.png` | back_home | Home view active after mouse Back | homeActive=true | **PASS** |

Screenshots: `qa/screenshots/exercise-ui-formats/{format}/{id}/`
