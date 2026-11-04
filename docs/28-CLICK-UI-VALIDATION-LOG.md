# 28 — Click vs UI validation log (headed, mouse-only)

**Updated:** 2026-11-04T05:00:48.624Z
**Mode:** headed-click-ui-live
**Rules:** headed Chromium · human `mouse.move` paths · no programmatic control clicks · offset grid ±6–10px

## Summary

| Metric | Value |
|--------|------:|
| controls | 180 |
| centerHitOk | 179 |
| centerHitFail | 1 |
| effectOk | 172 |
| effectFail | 8 |
| logOk | 179 |
| logFail | 1 |
| offsetOnlyHits | 0 |

## Issues

| ID | Sev | Format | Exercise | Control | Code | Message |
|----|-----|--------|----------|---------|------|---------|
| ISS-001 | P0 | desktop | v1-diction | #mic-sensitivity | effect_fail | expected mic value rises on track drag; UI label matches; actual val 7→2 ui=2 |
| ISS-002 | P0 | desktop | s15-sh-air-ladder | #mic-sensitivity | effect_fail | expected mic value rises on track drag; UI label matches; actual val 2→2 ui=2 |
| ISS-003 | P0 | desktop | s9-pitch-match | #mic-sensitivity | effect_fail | expected mic value rises on track drag; UI label matches; actual val 2→2 ui=2 |
| ISS-004 | P0 | desktop | s2-solfege-chords | #mic-sensitivity | effect_fail | expected mic value rises on track drag; UI label matches; actual val 2→2 ui=2 |
| ISS-005 | P0 | desktop | v10-power-pause | #mic-sensitivity | effect_fail | expected mic value rises on track drag; UI label matches; actual val 2→2 ui=2 |
| ISS-006 | P0 | desktop-short | v1-diction | #mic-sensitivity | effect_fail | expected mic value rises on track drag; UI label matches; actual val 2→2 ui=2 |
| ISS-007 | P1 | mobile | s15-sh-air-ladder | #btn-practice-stop | not_visible | control missing or zero size |
| ISS-008 | P0 | fullscreen | v1-diction | #mic-sensitivity | effect_fail | expected mic value rises on track drag; UI label matches; actual val 9→2 ui=2 |

## Per-control log

## Format `desktop` (1280×800)

### v1-diction

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768004563,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":170,"y":689,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (171, 690)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768007003,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":1066,"y":689,"fs":false}
- **Effect:** FAIL — expected: mic value rises on track drag; UI label matches · actual: val 7→2 ui=2
- **Click point:** (806, 690)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v1-diction/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v1-diction/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v1-diction/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v1-diction/mic-sensitivity_03_after.png` |

- **Issues:** ISS-001

#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768008845,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1108,"y":772,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1108, 773)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768010814,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1083,"y":731,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1083, 732)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768012743,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":172,"y":400,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (173, 400)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768014801,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":155,"y":84,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (155, 84)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-back-home_03_after.png` |


### s15-sh-air-ladder

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768019616,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":170,"y":689,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (171, 690)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768021729,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":1066,"y":689,"fs":false}
- **Effect:** FAIL — expected: mic value rises on track drag; UI label matches · actual: val 2→2 ui=2
- **Click point:** (806, 690)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/mic-sensitivity_03_after.png` |

- **Issues:** ISS-002

#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768023581,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1108,"y":772,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1108, 773)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768025469,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1083,"y":731,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1083, 731)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768028199,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":172,"y":400,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (173, 400)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768030178,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":155,"y":84,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (155, 84)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-back-home_03_after.png` |


### s9-pitch-match

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768035214,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":170,"y":689,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (171, 690)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768037433,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":795,"y":689,"fs":false}
- **Effect:** FAIL — expected: mic value rises on track drag; UI label matches · actual: val 2→2 ui=2
- **Click point:** (659, 690)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/mic-sensitivity_03_after.png` |

- **Issues:** ISS-003

#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768039380,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1108,"y":653,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1108, 653)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768041391,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1083,"y":731,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1083, 732)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768043341,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":172,"y":400,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (173, 400)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768045354,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":155,"y":80,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (155, 81)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-back-home_03_after.png` |


### s2-solfege-chords

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768050115,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":170,"y":689,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (171, 690)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768052431,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":795,"y":689,"fs":false}
- **Effect:** FAIL — expected: mic value rises on track drag; UI label matches · actual: val 2→2 ui=2
- **Click point:** (659, 690)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/mic-sensitivity_03_after.png` |

- **Issues:** ISS-004

#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768054313,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1108,"y":653,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1108, 653)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768056244,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1083,"y":731,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1083, 731)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768058176,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":172,"y":400,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (173, 400)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768060202,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":155,"y":80,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (155, 81)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-back-home_03_after.png` |


### v10-power-pause

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768065153,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":170,"y":689,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (171, 690)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768067229,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":1066,"y":689,"fs":false}
- **Effect:** FAIL — expected: mic value rises on track drag; UI label matches · actual: val 2→2 ui=2
- **Click point:** (806, 690)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v10-power-pause/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v10-power-pause/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v10-power-pause/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v10-power-pause/mic-sensitivity_03_after.png` |

- **Issues:** ISS-005

#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768069042,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1108,"y":772,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1108, 773)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768070973,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1083,"y":731,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1083, 732)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768072874,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":172,"y":400,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (173, 400)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768074977,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":155,"y":84,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (155, 84)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-back-home_03_after.png` |


## Format `desktop-short` (1280×560)

### v1-diction

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768080169,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":170,"y":521,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (171, 522)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768082282,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":1066,"y":521,"fs":false}
- **Effect:** FAIL — expected: mic value rises on track drag; UI label matches · actual: val 2→2 ui=2
- **Click point:** (806, 522)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v1-diction/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v1-diction/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v1-diction/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v1-diction/mic-sensitivity_03_after.png` |

- **Issues:** ISS-006

#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768084109,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1108,"y":412,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1108, 413)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768085966,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1083,"y":491,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1083, 492)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768087821,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":172,"y":280,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (173, 280)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768089814,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":155,"y":84,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (155, 84)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-back-home_03_after.png` |


### s15-sh-air-ladder

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768094665,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":170,"y":521,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (171, 522)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768096865,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":1066,"y":521,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 2→9 ui=9
- **Click point:** (806, 522)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768098683,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1108,"y":412,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1108, 413)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768100583,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1083,"y":491,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1083, 492)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768103330,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":172,"y":280,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (173, 280)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768105325,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":155,"y":84,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (155, 84)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-back-home_03_after.png` |


### s9-pitch-match

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768110204,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":170,"y":521,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (171, 522)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768112389,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":795,"y":521,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (659, 522)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768114325,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1108,"y":413,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1108, 413)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768116206,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1083,"y":491,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1083, 492)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768118140,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":172,"y":280,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (173, 280)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768120125,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":155,"y":80,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (155, 81)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-back-home_03_after.png` |


### s2-solfege-chords

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768124960,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":170,"y":521,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (171, 522)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768127244,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":795,"y":521,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (659, 522)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768129210,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1108,"y":413,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1108, 413)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768131171,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1083,"y":491,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1083, 491)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768133107,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":172,"y":280,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (173, 280)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768135145,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":155,"y":80,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (155, 81)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-back-home_03_after.png` |


### v10-power-pause

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768140089,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":170,"y":521,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (171, 522)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768142329,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":1066,"y":521,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (806, 522)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768144150,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1108,"y":412,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1108, 413)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768146040,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1083,"y":491,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1083, 492)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768147898,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":172,"y":280,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (173, 280)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768149903,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":155,"y":84,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (155, 84)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-back-home_03_after.png` |


## Format `mobile` (390×844)

### v1-diction

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768154987,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":120,"y":736,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (120, 736)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768157026,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":298,"y":680,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→10 ui=10
- **Click point:** (239, 680)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v1-diction/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v1-diction/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v1-diction/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v1-diction/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768158747,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":300,"y":819,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (301, 820)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768160543,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":282,"y":769,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (282, 770)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768162327,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":120,"y":422,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (120, 422)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768164308,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":68,"y":92,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (68, 93)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-back-home_03_after.png` |


### s15-sh-air-ladder

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768169089,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":120,"y":736,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (120, 736)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768171094,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":298,"y":680,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 10→10 ui=10
- **Click point:** (239, 680)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768172786,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":300,"y":819,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (301, 820)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768174550,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":282,"y":770,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (282, 771)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** FAIL — top=`missing`
- **Offset grid:**  
- **Press log:** FAIL — {}
- **Effect:** FAIL — expected: practice stops; Start visible again · actual: control not visible
- **Click point:** (?, ?)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-practice-stop_00_before.png` |
| hover | `` |
| click-moment | `` |
| after | `` |

- **Issues:** ISS-007

#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768177530,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":68,"y":91,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (68, 92)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-back-home_03_after.png` |


### s9-pitch-match

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768182383,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":120,"y":736,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (120, 736)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768184510,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":298,"y":622,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 10→10 ui=10
- **Click point:** (239, 623)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768186287,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":300,"y":686,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (301, 686)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768188144,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":282,"y":770,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (282, 771)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768189986,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":120,"y":421,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (120, 422)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768191945,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":68,"y":88,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (68, 88)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-back-home_03_after.png` |


### s2-solfege-chords

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768196771,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":120,"y":736,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (120, 736)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768198897,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":298,"y":622,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 10→10 ui=10
- **Click point:** (239, 623)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768200743,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":300,"y":686,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (301, 686)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768202551,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":282,"y":769,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (282, 770)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768204402,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":120,"y":421,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (120, 422)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768206362,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":68,"y":88,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (68, 88)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-back-home_03_after.png` |


### v10-power-pause

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768211123,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":120,"y":736,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (120, 736)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768213241,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":298,"y":680,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 10→10 ui=10
- **Click point:** (239, 680)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v10-power-pause/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v10-power-pause/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v10-power-pause/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v10-power-pause/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768215054,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":300,"y":819,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (301, 820)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768216909,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":282,"y":769,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (282, 770)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768218759,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":120,"y":422,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (120, 422)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768220720,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":68,"y":92,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (68, 93)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-back-home_03_after.png` |


## Format `mobile-land` (844×390)

### v1-diction

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768225886,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":84,"y":347,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (84, 347)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768228072,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":731,"y":347,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 10→9 ui=9
- **Click point:** (561, 347)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/v1-diction/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/v1-diction/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/v1-diction/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/v1-diction/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768229901,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":754,"y":242,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (755, 243)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768231801,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":729,"y":321,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (730, 321)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768233718,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":86,"y":195,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (86, 195)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768235674,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":72,"y":26,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (73, 27)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-back-home_03_after.png` |


### s15-sh-air-ladder

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768240466,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":84,"y":347,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (84, 347)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768242454,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":731,"y":347,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (561, 347)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768244176,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":754,"y":242,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (755, 243)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768245988,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":729,"y":321,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (730, 321)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768248617,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":86,"y":195,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (86, 195)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768250516,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":72,"y":26,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (73, 27)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-back-home_03_after.png` |


### s9-pitch-match

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768255403,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":84,"y":345,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (84, 346)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768257510,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":416,"y":345,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→10 ui=10
- **Click point:** (389, 346)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768259353,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":754,"y":242,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (755, 243)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768261316,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":729,"y":321,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (730, 322)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768263265,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":86,"y":195,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (86, 195)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768265287,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":72,"y":22,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (73, 22)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-back-home_03_after.png` |


### s2-solfege-chords

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768270169,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":84,"y":345,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (84, 346)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768272342,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":416,"y":345,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 10→10 ui=10
- **Click point:** (389, 346)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768274155,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":754,"y":242,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (755, 243)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768276084,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":729,"y":321,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (730, 322)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768277896,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":86,"y":195,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (86, 195)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768279853,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":72,"y":22,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (73, 22)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-back-home_03_after.png` |


### v10-power-pause

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768284662,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":84,"y":347,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (84, 347)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768286686,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":731,"y":347,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 10→9 ui=9
- **Click point:** (561, 347)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768288404,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":754,"y":242,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (755, 243)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768290150,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":729,"y":321,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (730, 322)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768291915,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":86,"y":195,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (86, 195)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768293836,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":72,"y":26,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (73, 27)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-back-home_03_after.png` |


## Format `tablet` (768×1024)

### v1-diction

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768298980,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":86,"y":857,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (87, 858)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768301140,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":640,"y":806,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (403, 807)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v1-diction/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v1-diction/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v1-diction/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v1-diction/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768302962,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":678,"y":940,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (679, 940)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768304927,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":653,"y":954,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (654, 954)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768306873,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":88,"y":510,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (89, 511)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768308877,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":72,"y":140,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (73, 140)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-back-home_03_after.png` |


### s15-sh-air-ladder

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768313752,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":86,"y":857,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (87, 858)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768315817,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":640,"y":806,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (403, 807)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768317613,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":678,"y":940,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (679, 940)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768319491,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":653,"y":954,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (654, 954)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768322298,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":88,"y":511,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (89, 512)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768324253,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":72,"y":140,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (73, 140)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-back-home_03_after.png` |


### s9-pitch-match

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768329166,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":86,"y":857,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (87, 858)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768331437,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":640,"y":806,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (403, 807)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768333305,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":678,"y":976,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (679, 977)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768335335,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":653,"y":954,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (654, 955)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768337313,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":88,"y":512,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (89, 512)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768339330,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":72,"y":135,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (73, 136)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-back-home_03_after.png` |


### s2-solfege-chords

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768344168,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":86,"y":857,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (87, 858)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768346371,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":640,"y":806,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (403, 807)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768348247,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":678,"y":876,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (679, 877)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768350212,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":653,"y":955,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (654, 955)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768352116,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":88,"y":512,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (89, 512)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768354113,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":72,"y":135,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (73, 136)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-back-home_03_after.png` |


### v10-power-pause

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768359033,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":86,"y":857,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (87, 858)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768361206,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":640,"y":806,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (403, 807)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v10-power-pause/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v10-power-pause/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v10-power-pause/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v10-power-pause/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768363027,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":678,"y":940,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (679, 940)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768364946,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":653,"y":953,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (654, 954)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768366837,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":88,"y":510,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (89, 511)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768368864,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":72,"y":140,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (73, 140)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-back-home_03_after.png` |


## Format `fullscreen` (1440×900 fullscreen)

### v1-diction

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768374402,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":250,"y":765,"fs":true}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (251, 766)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768376766,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":1146,"y":765,"fs":true}
- **Effect:** FAIL — expected: mic value rises on track drag; UI label matches · actual: val 9→2 ui=2
- **Click point:** (886, 766)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v1-diction/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v1-diction/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v1-diction/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v1-diction/mic-sensitivity_03_after.png` |

- **Issues:** ISS-008

#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768378781,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1188,"y":848,"fs":true}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1188, 849)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768380913,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1163,"y":830,"fs":true}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1163, 831)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768382977,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":252,"y":450,"fs":true}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (253, 450)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768385038,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":235,"y":84,"fs":true}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (235, 84)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-back-home_03_after.png` |


### s15-sh-air-ladder

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768389975,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":250,"y":765,"fs":true}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (251, 766)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768392133,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":1146,"y":765,"fs":true}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 2→9 ui=9
- **Click point:** (886, 766)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768394013,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1188,"y":848,"fs":true}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1188, 849)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768396017,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1163,"y":830,"fs":true}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1163, 830)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768398809,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":252,"y":450,"fs":true}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (253, 450)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768400888,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":235,"y":84,"fs":true}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (235, 84)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-back-home_03_after.png` |


### s9-pitch-match

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768405955,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":250,"y":765,"fs":true}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (251, 766)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768408317,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":874,"y":765,"fs":true}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (739, 766)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768410383,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1188,"y":753,"fs":true}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1188, 753)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768412566,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1163,"y":831,"fs":true}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1163, 832)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768414661,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":252,"y":450,"fs":true}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (253, 450)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768416781,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":235,"y":80,"fs":true}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (235, 81)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-back-home_03_after.png` |


### s2-solfege-chords

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768421815,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":250,"y":765,"fs":true}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (251, 766)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768424152,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":874,"y":765,"fs":true}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (739, 766)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768426179,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1188,"y":753,"fs":true}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1188, 753)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768428278,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1163,"y":831,"fs":true}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1163, 831)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768430310,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":252,"y":450,"fs":true}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (253, 450)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768432405,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":235,"y":80,"fs":true}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (235, 81)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-back-home_03_after.png` |


### v10-power-pause

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768437414,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":250,"y":765,"fs":true}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (251, 766)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768439682,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":1146,"y":765,"fs":true}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (886, 766)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768441676,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1188,"y":848,"fs":true}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1188, 849)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768443695,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1163,"y":830,"fs":true}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1163, 831)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768445738,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":252,"y":450,"fs":true}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (253, 450)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1793768447938,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":235,"y":84,"fs":true}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (235, 84)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-back-home_03_after.png` |


---

Screenshots root: `qa/screenshots/click-ui-live`
JSON: `qa/geometry/click-ui-live-report.json`
Issues: `qa/geometry/click-ui-issues.json`
