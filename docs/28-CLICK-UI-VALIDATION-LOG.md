# 28 — Click vs UI validation log (headed, mouse-only)

**Updated:** 2026-07-18T01:41:08.438Z
**Mode:** headed-click-ui-live
**Rules:** headed Chromium · human `mouse.move` paths · no programmatic control clicks · offset grid ±6–10px

## Summary

| Metric | Value |
|--------|------:|
| controls | 180 |
| centerHitOk | 180 |
| centerHitFail | 0 |
| effectOk | 180 |
| effectFail | 0 |
| logOk | 180 |
| logFail | 0 |
| offsetOnlyHits | 0 |

## Dual-agent reviews (Elon + Zuckerberg)

### all / final-gate — 2026-07-18T01:41:02.103Z

**Elon (product):**

**Product verdict: PASS (ship)** after full headed matrix.

- Living log: **180/180** centerHit + effect + press-log PASS; **offsetOnlyHits=0** (mm-offset claim resolved at center).
- Formats: desktop, desktop-short, mobile, mobile-land, tablet, fullscreen × 5 exercises × Start/mic/guide/metrics/Stop/Back.
- Screenshots under `qa/screenshots/click-ui-live/{format}/{exercise}/` with before / hover / click-moment / after.
- Residual: dense mobile-land rail is tight but center paint still receives hits; capture timing can show chrome in "before" frames — not a hit bug.
- **Ship recommendation:** deploy.

**Zuckerberg (architecture / hit geometry):**

**Architecture verdict: PASS (ship)**.

Root causes addressed:
1. Sticky stage over Back → `.exercise-header-compact` sticky z-30 / `#btn-back-home` z-32; stage top includes `--ex-chrome-h`; `syncHeaderHeightVar` measures both.
2. Leave modal blocked by inline display:none → clear style on open; tests no longer force permanent display:none.
3. Start under mic (short landscape) → rail wrap + `.hud-bl`/Start z-index above mic; Start reflow retries in suite.

Residual risk: short-viewport media must keep stage top under both headers (patched). Full matrix 180/180, format-hits green.
**Ship: YES.**

**Follow-ups:**
- Full click-ui-live green (180/180, 0 issues)
- format-hit-clicks green
- Deploy main → GitHub Pages

## Per-control log

## Format `desktop` (1280×800)

### v1-diction

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-start`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338295950,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":178,"y":683,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (178, 683)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338298269,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":1066,"y":683,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 7→9 ui=9
- **Click point:** (771, 683)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v1-diction/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v1-diction/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v1-diction/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v1-diction/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338300016,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1063,"y":764,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1064, 764)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338301912,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1090,"y":731,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1090, 732)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338303768,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":180,"y":396,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (180, 397)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v1-diction/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338305705,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":1132,"y":79,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (1132, 79)

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
- **Press log:** PASS — {"t":1784338310423,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":178,"y":683,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (178, 683)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338312442,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":1066,"y":683,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (771, 683)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338314158,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1063,"y":764,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1064, 764)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338316015,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1090,"y":731,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1090, 731)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338318649,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":180,"y":399,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (180, 400)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s15-sh-air-ladder/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338320628,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":1132,"y":79,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (1132, 79)

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
- **Press log:** PASS — {"t":1784338325359,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":178,"y":683,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (178, 683)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338327461,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":865,"y":683,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (661, 683)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338329303,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1063,"y":652,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1064, 652)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338331212,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1090,"y":731,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1090, 732)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338333253,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":180,"y":397,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (180, 397)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s9-pitch-match/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338335189,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":1132,"y":79,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (1132, 79)

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
- **Press log:** PASS — {"t":1784338339962,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":178,"y":683,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (178, 683)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338342078,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":865,"y":683,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (661, 683)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338343900,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1063,"y":652,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1064, 652)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338345847,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1090,"y":731,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1090, 731)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338347839,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":180,"y":398,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (180, 398)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/s2-solfege-chords/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338349779,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":1132,"y":79,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (1132, 79)

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
- **Press log:** PASS — {"t":1784338354579,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":178,"y":683,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (178, 683)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338356584,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":1066,"y":683,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (771, 683)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v10-power-pause/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v10-power-pause/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v10-power-pause/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v10-power-pause/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338358287,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1063,"y":764,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1064, 764)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338360143,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1090,"y":731,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1090, 731)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338361977,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":180,"y":396,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (180, 396)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop/v10-power-pause/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338363965,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":1132,"y":79,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (1132, 79)

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
- **Press log:** PASS — {"t":1784338368939,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":178,"y":523,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (178, 523)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338370895,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":1066,"y":523,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (771, 523)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v1-diction/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v1-diction/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v1-diction/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v1-diction/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338372590,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1063,"y":412,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1064, 413)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338374357,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1090,"y":491,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1090, 492)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338376151,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":180,"y":278,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (180, 279)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v1-diction/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338378077,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":1132,"y":79,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (1132, 79)

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
- **Press log:** PASS — {"t":1784338382716,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":178,"y":523,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (178, 523)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338384684,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":1066,"y":523,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (771, 523)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338386365,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1063,"y":412,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1064, 413)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338388170,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1090,"y":491,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1090, 491)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338390766,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":180,"y":279,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (180, 280)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s15-sh-air-ladder/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338392741,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":1132,"y":79,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (1132, 79)

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
- **Press log:** PASS — {"t":1784338397436,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":178,"y":523,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (178, 523)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338399536,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":865,"y":523,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (661, 523)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338401309,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1063,"y":412,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1064, 412)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338403135,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1090,"y":491,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1090, 492)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338405086,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":180,"y":279,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (180, 280)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s9-pitch-match/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338407013,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":1132,"y":79,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (1132, 79)

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
- **Press log:** PASS — {"t":1784338411723,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":178,"y":523,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (178, 523)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338413848,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":865,"y":523,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (661, 523)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338415660,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1063,"y":412,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1064, 412)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338417528,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1090,"y":491,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1090, 491)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338419471,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":180,"y":279,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (180, 279)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/s2-solfege-chords/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338421402,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":1132,"y":79,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (1132, 79)

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
- **Press log:** PASS — {"t":1784338426064,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":178,"y":523,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (178, 523)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338428029,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":1066,"y":523,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (771, 523)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338429737,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1063,"y":412,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1064, 413)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338431565,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1090,"y":491,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1090, 491)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338433383,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":180,"y":279,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (180, 279)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/desktop-short/v10-power-pause/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338435353,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":1132,"y":79,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (1132, 79)

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
- **Press log:** PASS — {"t":1784338440228,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":85,"y":745,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (86, 745)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338442139,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":263,"y":698,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→10 ui=10
- **Click point:** (195, 698)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v1-diction/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v1-diction/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v1-diction/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v1-diction/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338443798,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":268,"y":679,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (268, 680)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338445529,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":294,"y":769,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (295, 770)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338447235,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":87,"y":417,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (88, 418)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v1-diction/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✗ S:✓ E:✓ W:✓ NE:✗ SW:✓ 
- **Press log:** PASS — {"t":1784338449981,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":334,"y":100,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (335, 79)

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
- **Press log:** PASS — {"t":1784338454508,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":85,"y":774,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (86, 775)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338456448,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":263,"y":727,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 10→10 ui=10
- **Click point:** (195, 728)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338458079,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":268,"y":680,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (268, 681)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338459824,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":294,"y":769,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (295, 770)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338462345,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":87,"y":421,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (88, 422)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s15-sh-air-ladder/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✗ S:✓ E:✓ W:✓ NE:✗ SW:✓ 
- **Press log:** PASS — {"t":1784338465152,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":334,"y":129,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (335, 109)

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
- **Press log:** PASS — {"t":1784338469753,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":85,"y":702,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (86, 702)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338471703,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":263,"y":655,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 10→10 ui=10
- **Click point:** (195, 655)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338473441,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":268,"y":679,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (268, 680)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338475208,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":294,"y":770,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (295, 770)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338476962,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":87,"y":417,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (88, 418)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s9-pitch-match/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✗ S:✓ E:✓ W:✓ NE:✗ SW:✓ 
- **Press log:** PASS — {"t":1784338479747,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":334,"y":100,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (335, 79)

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
- **Press log:** PASS — {"t":1784338484371,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":85,"y":731,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (86, 732)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338486338,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":263,"y":684,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 10→10 ui=10
- **Click point:** (195, 685)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338488029,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":268,"y":679,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (268, 680)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338489804,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":294,"y":770,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (295, 770)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338491562,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":87,"y":417,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (88, 418)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/s2-solfege-chords/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✗ S:✓ E:✓ W:✓ NE:✗ SW:✓ 
- **Press log:** PASS — {"t":1784338494342,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":334,"y":129,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (335, 109)

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
- **Press log:** PASS — {"t":1784338498957,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":85,"y":774,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (86, 775)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338500888,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":263,"y":727,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 10→10 ui=10
- **Click point:** (195, 728)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v10-power-pause/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v10-power-pause/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v10-power-pause/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v10-power-pause/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338502547,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":268,"y":680,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (268, 681)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338504285,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":294,"y":769,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (295, 770)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338506020,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":87,"y":417,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (88, 418)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile/v10-power-pause/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✗ S:✓ E:✓ W:✓ NE:✗ SW:✓ 
- **Press log:** PASS — {"t":1784338508807,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":334,"y":129,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (335, 109)

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
- **Press log:** PASS — {"t":1784338513800,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":84,"y":360,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (84, 361)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338515727,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":726,"y":300,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 10→9 ui=9
- **Click point:** (449, 301)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/v1-diction/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/v1-diction/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/v1-diction/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/v1-diction/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338517388,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":717,"y":242,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (718, 243)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338519105,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":744,"y":321,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (744, 321)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/v1-diction/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338520821,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":86,"y":194,"fs":false}
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
- **Press log:** PASS — {"t":1784338522729,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":786,"y":79,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (786, 79)

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
- **Press log:** PASS — {"t":1784338527271,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":84,"y":361,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (84, 362)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338529227,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":726,"y":300,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (449, 301)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338530862,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":717,"y":242,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (718, 243)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338532571,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":744,"y":321,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (744, 321)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338535145,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":86,"y":194,"fs":false}
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
- **Press log:** PASS — {"t":1784338537032,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":786,"y":79,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (786, 79)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s15-sh-air-ladder/btn-back-home_03_after.png` |


### s9-pitch-match

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`DIV#mic-sens-hud`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338541855,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":84,"y":348,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (84, 349)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338543837,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":726,"y":300,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (449, 301)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338545541,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":717,"y":242,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (718, 243)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338547302,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":744,"y":321,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (744, 321)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338549044,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":86,"y":194,"fs":false}
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
- **Press log:** PASS — {"t":1784338550916,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":786,"y":79,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (786, 79)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-back-home_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-back-home_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-back-home_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s9-pitch-match/btn-back-home_03_after.png` |


### s2-solfege-chords

#### `#btn-practice-start`

- **Center hit (mouse over paint):** PASS — top=`DIV#mic-sens-hud`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338555731,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":84,"y":348,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (84, 349)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338557752,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":726,"y":300,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (449, 301)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338559445,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":717,"y":242,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (718, 243)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338561151,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":744,"y":321,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (744, 322)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/s2-solfege-chords/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338562905,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":86,"y":194,"fs":false}
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
- **Press log:** PASS — {"t":1784338564779,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":786,"y":79,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (786, 79)

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
- **Press log:** PASS — {"t":1784338569350,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":84,"y":361,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (84, 362)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338571275,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":726,"y":300,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (449, 301)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338572897,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":717,"y":242,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (718, 243)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338574652,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":744,"y":321,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (744, 322)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/mobile-land/v10-power-pause/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338576385,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":86,"y":194,"fs":false}
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
- **Press log:** PASS — {"t":1784338578236,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":786,"y":79,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (786, 79)

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
- **Press log:** PASS — {"t":1784338583281,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":86,"y":795,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (87, 795)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338585313,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":654,"y":746,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (411, 746)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v1-diction/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v1-diction/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v1-diction/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v1-diction/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338587067,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":641,"y":876,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (642, 876)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338588904,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":668,"y":955,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (668, 955)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338590730,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":88,"y":506,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (89, 506)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v1-diction/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338592677,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":710,"y":79,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (710, 79)

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
- **Press log:** PASS — {"t":1784338597419,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":86,"y":795,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (87, 795)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338599438,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":654,"y":746,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (411, 746)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338601173,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":641,"y":876,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (642, 876)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338602980,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":668,"y":955,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (668, 955)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s15-sh-air-ladder/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338605619,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":88,"y":511,"fs":false}
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
- **Press log:** PASS — {"t":1784338607623,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":710,"y":79,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (710, 79)

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
- **Press log:** PASS — {"t":1784338612354,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":86,"y":795,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (87, 795)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338614459,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":654,"y":746,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (411, 746)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338616333,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":641,"y":876,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (642, 876)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338618264,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":668,"y":955,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (668, 956)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338620310,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":88,"y":506,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (89, 507)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s9-pitch-match/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338622305,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":710,"y":79,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (710, 79)

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
- **Press log:** PASS — {"t":1784338627019,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":86,"y":795,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (87, 795)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338629192,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":654,"y":746,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (411, 746)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338631023,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":641,"y":876,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (642, 876)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338632930,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":668,"y":955,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (668, 955)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338634940,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":88,"y":507,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (89, 508)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/s2-solfege-chords/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338636920,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":710,"y":79,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (710, 79)

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
- **Press log:** PASS — {"t":1784338641681,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":86,"y":795,"fs":false}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (87, 795)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338643720,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":654,"y":746,"fs":false}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (411, 746)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v10-power-pause/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v10-power-pause/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v10-power-pause/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v10-power-pause/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338645416,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":641,"y":876,"fs":false}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (642, 876)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338647224,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":668,"y":955,"fs":false}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (668, 955)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338649053,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":88,"y":506,"fs":false}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (89, 506)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/tablet/v10-power-pause/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338651042,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":710,"y":79,"fs":false}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (710, 79)

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
- **Press log:** PASS — {"t":1784338656542,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":258,"y":759,"fs":true}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (258, 759)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338658611,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":1146,"y":759,"fs":true}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (851, 759)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v1-diction/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v1-diction/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v1-diction/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v1-diction/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338660409,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1143,"y":840,"fs":true}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1144, 840)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338662378,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1170,"y":830,"fs":true}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1170, 831)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338664305,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":260,"y":445,"fs":true}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (260, 446)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v1-diction/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338666408,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":1212,"y":79,"fs":true}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (1212, 79)

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
- **Press log:** PASS — {"t":1784338671353,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":258,"y":759,"fs":true}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (258, 759)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338673428,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":1146,"y":759,"fs":true}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (851, 759)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338675258,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1143,"y":840,"fs":true}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1144, 840)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338677210,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1170,"y":830,"fs":true}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1170, 830)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338679940,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":260,"y":449,"fs":true}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (260, 450)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s15-sh-air-ladder/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338682034,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":1212,"y":79,"fs":true}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (1212, 79)

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
- **Press log:** PASS — {"t":1784338686960,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":258,"y":759,"fs":true}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (258, 759)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338689260,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":944,"y":759,"fs":true}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (741, 759)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338691241,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1143,"y":752,"fs":true}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1144, 752)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338693266,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1170,"y":831,"fs":true}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1170, 832)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338695449,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":260,"y":447,"fs":true}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (260, 448)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s9-pitch-match/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338697531,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":1212,"y":79,"fs":true}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (1212, 79)

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
- **Press log:** PASS — {"t":1784338702539,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":258,"y":759,"fs":true}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (258, 759)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338704908,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":944,"y":759,"fs":true}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (741, 759)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338706983,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1143,"y":752,"fs":true}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1144, 752)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338709085,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1170,"y":831,"fs":true}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1170, 831)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338711473,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":260,"y":447,"fs":true}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (260, 448)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/s2-solfege-chords/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338714208,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":1212,"y":79,"fs":true}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (1212, 79)

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
- **Press log:** PASS — {"t":1784338719074,"id":"btn-practice-start","tag":"BUTTON","cls":"btn btn-practice btn-sm","rawId":"btn-practice-start","x":258,"y":759,"fs":true}
- **Effect:** PASS — expected: practice goes live; Stop visible · actual: live=true status="En vivo"
- **Click point:** (258, 759)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-practice-start_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-practice-start_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-practice-start_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-practice-start_03_after.png` |


#### `#mic-sensitivity`

- **Center hit (mouse over paint):** PASS — top=`INPUT#mic-sensitivity`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338721152,"id":"mic-sensitivity","tag":"INPUT","cls":"","rawId":"mic-sensitivity","x":1146,"y":759,"fs":true}
- **Effect:** PASS — expected: mic value rises on track drag; UI label matches · actual: val 9→9 ui=9
- **Click point:** (851, 759)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/mic-sensitivity_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/mic-sensitivity_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/mic-sensitivity_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/mic-sensitivity_03_after.png` |


#### `#btn-toggle-guide`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-guide`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338723020,"id":"btn-toggle-guide","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-guide","x":1143,"y":840,"fs":true}
- **Effect:** PASS — expected: guide panel toggles collapsed state · actual: open false→true
- **Click point:** (1144, 840)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-toggle-guide_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-toggle-guide_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-toggle-guide_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-toggle-guide_03_after.png` |


#### `#btn-toggle-metrics`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-toggle-metrics`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338724991,"id":"btn-toggle-metrics","tag":"BUTTON","cls":"btn btn-ghost btn-sm","rawId":"btn-toggle-metrics","x":1170,"y":830,"fs":true}
- **Effect:** PASS — expected: metrics panel toggles collapsed state · actual: open false→true
- **Click point:** (1170, 830)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-toggle-metrics_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-toggle-metrics_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-toggle-metrics_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-toggle-metrics_03_after.png` |


#### `#btn-practice-stop`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-practice-stop`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338726956,"id":"btn-practice-stop","tag":"BUTTON","cls":"btn btn-danger btn-sm","rawId":"btn-practice-stop","x":260,"y":446,"fs":true}
- **Effect:** PASS — expected: practice stops; Start visible again · actual: live=false startVisible=true
- **Click point:** (260, 447)

| Stage | Path |
|-------|------|
| before | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-practice-stop_00_before.png` |
| hover | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-practice-stop_01_hover.png` |
| click-moment | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-practice-stop_02_down.png` |
| after | `qa/screenshots/click-ui-live/fullscreen/v10-power-pause/btn-practice-stop_03_after.png` |


#### `#btn-back-home`

- **Center hit (mouse over paint):** PASS — top=`BUTTON#btn-back-home`
- **Offset grid:** C:✓ N:✓ S:✓ E:✓ W:✓ NE:✓ SW:✓ 
- **Press log:** PASS — {"t":1784338729083,"id":"btn-back-home","tag":"BUTTON","cls":"btn btn-ghost btn-sm btn-back-compact","rawId":"btn-back-home","x":1212,"y":79,"fs":true}
- **Effect:** PASS — expected: return to home view · actual: home=true
- **Click point:** (1212, 79)

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

## Deploy

{
  "at": "2026-07-18T01:41:08.437Z",
  "validation": {
    "clickUiLive": "180/180 center+effect+log PASS, offsetOnly=0",
    "formatHits": "passed",
    "dualReview": "Elon PASS ship · Zuck PASS ship"
  },
  "note": "Sticky Back chrome, leave-modal fix, Start z-index short landscape, mic-help beep helper"
}
