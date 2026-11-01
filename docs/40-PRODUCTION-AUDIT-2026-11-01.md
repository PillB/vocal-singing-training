# Production audit and adversarial issue ledger — 2026-11-01

**Scope:** source, docs, deployed GitHub Pages UI, exercise state, recording,
pitch feedback, scores, mobile hit-testing, translations, CI and vocal claims.
**Repository snapshot:** 47 exercises (20 speaking, 27 singing), 40 distinct
modes, 13 progressions. `node qa/check-catalog.mjs` checks the catalog against
an independently stored snapshot. Earlier reports `23`, `24`, `27` contain
per-control click and geometry evidence **for 36 exercises as of July 2026**;
they are **not** evidence that all 47 routes have passed the new release gate.
`docs/39-EXERCISE-VISUALS.md` maps all 47 to their visual scene, measurements,
guided cues, and claimed metrics. `docs/36-TOUR-AND-USER-GUIDE.md` covers the tour.

## Verdict and evidence definitions

**Not yet production-certified.** The documented patches below exist locally;
the published Pages site still serves the earlier implementation until an
approved PR is merged/deployed. The deterministic regression harness, core
tests and some live UI behavior have evidence, but no browser binary was
available to execute a newly patched local Playwright pass, no real-device/
real-voice corpus was collected, and no post-deployment validation exists.

- **Live-confirmed:** independently reproduced against the Pages URL in
  browser Chrome. **Patched:** source change and a specified falsifiable test.
  **Unit-pass:** executed locally; **browser-unverified:** test exists but has
  not run against the patch. **Open:** still needs remediation/decision.
- The live deployed origin is also an immutable test subject for observing
  previously broken behavior; do not mistake its failures for the updated code.
- QA/research/UI review were separate challenge streams. The independent QA
  stream challenged the original patches, finding the A→B callback race and
  the microphone timeout flaw; these now have negative regression tests.

## Screens and the actual visual reading path

Inventory from UI/catalog navigation: home/catalog with speaking/singing
track switch, level filters and exercise cards; exercise detail/practice
scene; exercise guide and folded details; piano/chord chooser; recording and
post-take rating; daily session/plan, progress/history, pricing/Pro, account,
tour overlay (five steps), written `guide.html`, `privacy.html`, `admin.html`.
Routes use hash navigation and can be opened directly. These are distinct
screens/overlays, not distinct HTML documents in every case.

**Home/catalog Z scan**: top-left brand and navigation → top-right language,
account/Pro controls → primary heading and compact daily recommendation →
track selection and tier chips → exercise cards (name, skill label, duration,
progress/challenge) in reading order → progress/session callouts and footer.
Potential ambiguity: progress badges look like measured achievement even when
derived from self-rated practice; clearly mark their source and screen-reader
meaning. Active filter and language must survive route return.

**Exercise Z scan, initial viewport**: upper-left back/breadcrumb → rightward
title, tier and exercise progress → stage title/timer → central game canvas or
scene with a target path and live trace → overlaid corner HUD Start/Stop, input
sensitivity, mic/hold state → score or next cue. Next scan: guide/instructions
disclosure and **all hidden content when expanded** → piano keyboard, note and
progression controls when expanded → post-take ease buttons → detailed metrics
sliders, Save and history/next/exit controls. Inspect all overlays and focus,
not only visible text. The scene is dynamic: every mode has differing axis,
captions, legends and temporal states; see the per-exercise visual specification
in `docs/39-EXERCISE-VISUALS.md` rather than assuming identical pitch axes.

**Measured overlap:** on the deployed site, expanded piano occupied about
`y=614..743` on a desktop viewport while a sticky stage extended from
`y=36..747`; hit tests at piano buttons returned HUD/canvas, so visually
present controls were physically inaccessible. Fix changes the stage to normal
document flow **only while the piano is open**. This is also a keyboard-focus
occlusion problem under WCAG 2.2 2.4.11, not merely a cosmetic defect.

**Other Z scans**: daily session uses header → step position/progress → current
exercise cue and timer → Next/finish actions; progress uses summary/streaks →
exercise history rows → review/return; pricing uses plan/features → upgrade
actions and legal caveats; account uses auth state → fields/actions → saved
entitlements; tour overlays spotlight a target but must preserve focus,
dismissal and readable context. The old 36-route geometry logs are useful
historical baselines, but not a substitute for new breakpoint/focus screenshots.

## Mode-by-mode exercise coverage register

`Route`: catalog static check passed for every ID. `Full ×6`: six independent
end-to-end input/visual iterations and five adversarial passes **not yet
completed this round**. These remain explicit acceptance work; the mode name
identifies the shared implementation to retest if a root cause changes.

| Exercise | Mode / critical interaction to test | Route | Full ×6 |
|---|---|---|---|
| v1-diction | rateLadder · baseline/rung changes and sample rate | ✓ | pending |
| v2-volume | volumeSteady · dynamic level/reference | ✓ | pending |
| v3-soft-palate | countPace · timed beads/guide disclosure | ✓ | pending |
| v4-articulation-pen | articulationContrast · pen in/out safety and playback | ✓ | pending |
| v5-neutral-ears | recordOnly · personas and replay | ✓ | pending |
| v6-connect | speechEnergy · turn share and overlapping speech | ✓ | pending |
| v7-record-review | reviewSession · three review phases/recordings | ✓ | pending |
| v8-fluency-metaphors | metronomeSpeech · topic swap/mark metaphor | ✓ | pending |
| v9-12-week | weekPlan · navigate/complete/restore | ✓ | pending |
| v10-power-pause | pauseDetect · three takes/silence metric | ✓ | pending |
| v11-kill-fillers | fillerDetect · manual taps vs automatic hints | ✓ | pending |
| v12-melodic-speech | pitchContour · cadence lines, flat baseline | ✓ | pending |
| v13-volume-ladder | volumeLadder · level steps/reverse ladder | ✓ | pending |
| v14-pace-variation | keyPointPace · flag timing/baseline | ✓ | pending |
| v15-gestures | gestureReps · counts vs body pose certainty | ✓ | pending |
| v16-facial-expression | facePhases · phases/manual state | ✓ | pending |
| v17-strategic-concision | concisionGate · pre-response silence | ✓ | pending |
| v18-story-peak | storyTimer · sections/mark peak | ✓ | pending |
| v19-authority-close | authorityLand · cadence/ending label | ✓ | pending |
| v20-energy-match | energyMatch · level/pace/pitch take comparison | ✓ | pending |
| s1-vocal-fry | pitchHold · unvoiced/fry vs pitched scoring | ✓ | pending |
| s2-solfege-chords | pitchChord · piano expanded/frequency | ✓ | pending |
| s3-song-stanzas | pitchSong · target navigation | ✓ | pending |
| s4-lip-trills | sovtFlow · airflow subjective/recorded time | ✓ | pending |
| s5-sirens | sirenRange · octave, pitch span, voice strain | ✓ | pending |
| s6-straw | sovtFlow · straw variant and safe airflow | ✓ | pending |
| s7-humming | humTargets · humming/voicing uncertainty | ✓ | pending |
| s8-breath-support | breathS · duration vs physiologic claim | ✓ | pending |
| s9-pitch-match | pitchMatch · noise, octave error, scoring | ✓ | pending |
| s10-five-note | scaleSteps · progression/next step | ✓ | pending |
| s11-dynamics | dynamicSwell · microphone AGC caveat | ✓ | pending |
| s12-easy-onset | onsetReps · noise/transient false positives | ✓ | pending |
| s13-arpeggio-match | pitchChord · shared chord & piano logic | ✓ | pending |
| s14-staccato-legato | staccatoLegato · onset/offset boundaries | ✓ | pending |
| s15-sh-air-ladder | shAirLadder · silent airflow vs Space assist | ✓ | pending |
| s16-major-scale-coord | scaleSteps · transposition/range | ✓ | pending |
| s17-jaw-neck-release | releaseFlow · posture safety/pacing | ✓ | pending |
| s18-costal-breath | breathCycle · breathing phase/timer | ✓ | pending |
| s19-soft-palate-surprise | openSpace · illustrations ≠ observed velum | ✓ | pending |
| s20-five-vowels | vowelLadder · formant limits/range | ✓ | pending |
| s21-chest-resonance | resonanceZone · subjective vibration vs mic | ✓ | pending |
| s22-mid-voice-hola | resonanceZone · bounded pitch/range | ✓ | pending |
| s23-mask-ya | resonanceZone · mask as sensation, not anatomy | ✓ | pending |
| s24-nana-high | resonanceZone · high pitch/comfort | ✓ | pending |
| s25-zone-tour | resonanceZone · sequence, return/undo | ✓ | pending |
| s26-placement-compare | placementAB · A/B audio, manual done, retake | ✓ | pending |
| s27-lip-trill-solfege | trillSolfege · voiced trill/harmonic ambiguity | ✓ | pending |

For each register entry, the **six iteration oracles** are: (1) default open,
Start→Stop→rate; (2) each option and alternative/mode toggle; (3) minimum,
maximum and impossible inputs, including noise; (4) rapid/double clicks,
permission denial and leaving during async callbacks; (5) keyboard, 200% zoom,
360/390 desktop/mobile/landscape, language and reduced motion; (6) restore,
re-rate, abandon, next, history, reload. Compare visible text, accessible name,
hit target, request/event ordering, memory/storage and progress. Capture
before/after and key animation frames with actual time stamps.

## Issue ledger: observations, root causes, results, trade-offs

| ID / priority | Evidence: actual → required | Root cause, scope | Status / falsifiable oracle |
|---|---|---|---|
| VT-001 P0 scoring integrity | Live **Easy** before Start gave `10/10`, first win, a streak day, zero minutes → cannot save as practiced | Unguarded shared `completeExercise()`/one-tap and detailed Save; all 47 exercises | **Patched; 7/7 focused CI browser tests passed on first gate.** `canSaveRatedTake`: Start + at least **15 seconds** elapsed for an intentional rating; passive navigation auto-credit still takes **15–45 seconds** depending on target. Negative no-Start and under-15s vs positive after 15s; rejected rating sliders must not mutate. **Trade-off:** legitimate unrecorded manual practice cannot be logged without pressing Start. Consider explicitly labeled manual log without automatic achievement claims. |
| VT-002 P0 hit target | Live expanded piano under sticky stage; hit-test resolves to HUD → piano buttons must physically receive clicks | CSS sticky stacking geometry; all piano-enabled exercises, narrow screens | **Patched**, browser-unverified. Stage becomes relative while expanded, returns sticky on collapse. Regression checks bounding boxes and `elementFromPoint` at desktop, 390, 360 for three modes. **Trade-off:** expanded layout may scroll rather than remain pinned. |
| VT-003 P1 recording data loss | `MediaRecorder.stop()` returned a blob before async final chunk → short/last audio lost | Premature synchronous assembly; recorded modes | **Patched, unit-pass.** W3C requires `dataavailable` before `stop`. Test HEAD+TAIL exactly once and final-only take. **Trade-off:** playback arrives asynchronously after Stop. |
| VT-004 P1 async cross-session contamination | After A stops, newly installed B callback could receive late A recording → B must not own A | Mutable callback dereference in recorder's `onstop`; all recorded modes | **Patched, unit-pass** with immutable callback/take epoch and exercise/session id guard; negative A-recorded→B-unrecorded race. |
| VT-005 P1 pitch octave alias | 440/493.88 Hz reported ~220/247 Hz → should resolve fundamental or abstain | Raw autocorrelation capped at 400 Hz, accepted noise | **Patched, unit-pass** confidence-gated CMND/YIN, 52–1060 Hz. Deterministic clean sine/harmonic matrix, silence, 40 noise seeds, 240 noisy harmonic frames. **Trade-offs:** real input at low SNR can display no pitch; range outside 52–1060 unsupported, live voice devices not validated. |
| VT-006 P1 empty comparisons | Two pre-Start `Take done` clicks displayed completed A/B `2/2` → require actual audio | `_markTake` advanced even empty | **Patched**, browser-unverified; test two empty clicks yield 0 takes, no replay. Manual/automatic threshold now both 1.2 s. Real singing/retake still needs live test. |
| VT-007 P2 translated state | Switching Spanish→English while value banner visible kept old Spanish → redraw existing moment in chosen language | Cached DOM without relabel on i18n change | **Patched**, browser-unverified; test existing banner changes without changing moment id/dismissal. |
| VT-008 P1 scientific claims | False 60% vs 25% breathing fractions, guaranteed +2–3 semitone range, causal palate/pushing claims → describe individual variability and subjective cues | Overconfident unsourced EN/ES exercise catalog copy | **Patched**, static review; changes s18, s19, s22, s23, s27, v4 in both locales. Test safety/pedagogical review by qualified coach/SLP still **open**. Trade-off: less motivational certainty, more defensible pedagogy. |
| VT-009 P1 microphone prompts | 4-second timeout could issue three overlapping getUserMedia prompts while learner decides → one pending prompt, bounded fallback | Permission-latency misclassified as device-constraint failure | **Patched, unit-pass.** 30 s single attempt timeout; retries only after constraint/device errors; clean late stream. **Trade-off:** pending permission can delay first start up to 30 s. Further UX should expose explicit Cancel/Retry. |
| VT-010 P2 complexity debt | 357 existing functions initially exceeded CC15; new high complexity must fail CI | Historic monolithic app/mode functions | **Guard installed**, parser-backed ESLint max15 with exact SHA fingerprint exceptions. Refactored s27 `_frameGate` from CC24 into smaller methods, shrinking debt to **356**. Bad fixture CC16 fails, good passes. **Open:** refactor remaining functions and require reviewer decisions for exception changes. |
| VT-011 P2 historical trust | Previous false zero-duration score/streak entries may already exist | No trustworthy provenance/consent to repair | **Open.** Do not silently erase; optional one-time transparency/opt-in correction with backup. |
| VT-012 P1 release evidence | Browser binaries unavailable locally (download produced invalid/zero-byte Chromium ZIP); CI later ran real Chromium | CI/runtime environment, no real mic | **Partially verified:** dedicated GitHub Actions production-contract job passed 7/7; first full 896-test sharded pass found legacy rating tests that assumed no minimum time, a pre-existing assertion expecting an empty A/B progress patch, and an s27 test expecting +60-cent errors to count. Follow-up explicit-vs-passive gate adjustment and falsifiable corrected tests are pending CI. **Open:** full green browser suite, post-merge live, real-device/voice and account/privacy gates. |
| VT-013 P2 UX localization | Some English/Spanish mixed copy and plural/wording quirks seen in live review (`1 días`, persona string) | Dynamic labels beyond static i18n dictionary | **Open:** bilingual copy/fold/ARIA sweep in six iterations, not safe to auto-correct all without screen context. |
| VT-014 P1 experiment/recording privacy | Analytics/auth/entitlement workers exist; browser progress and recording state differ from server billing metadata | Existing multi-store architecture; README incorrectly claimed "all practice data stays browser" while the live footer says accounts may sync progress and sends anonymous statistics | **README patched** with conditional sync/anonymous statistics/opt-out disclosure. **Open:** verify exact data flow, opt-out deletion and authenticated endpoint threat model; no production security certification implied. |
| VT-015 P2 vocal inference | Reference speaker bleed, background fan, AGC, voice fry/unvoiced, very low/high voices can fool a frequency-only widget | Single mic pitch estimate is not a source classifier or diagnosis | **Open:** labeled gender/range/device corpus, headphones/noise calibration, test false-credit bounds, UI uncertainty cues. Do not promise objective vocal correctness. |
| VT-016 P1 neighboring-note false credit | Trill solfège accepted up to **+120 cents** because of an old detector's sharp bias; the next chromatic semitone could be scored as the current note | Detector-specific tolerance left unchanged after new YIN estimator; s27 | **Patched, unit-pass:** default +50/−40-cent band; deliberate +100-cent test cannot advance, +30-cent hold does. **Trade-off:** legitimate human trills that read sharp by more than 50 cents may fail to advance until a labeled trill corpus justifies retuning. |
| VT-017 P2 nondeterministic visual oracle | Hosted Chromium volume-picture tests logged cross-origin `/v1/auth/methods` CORS errors unrelated to the scene and failed despite the image assertions | Rendering test accidentally depended on live account-worker network policy | **Test harness patched, pending CI:** intercept only `**/v1/auth/methods` with an explicit valid JSON response. Keep console/page errors actionable; do **not** loosen worker CORS or discard unrelated errors. Account/CORS behavior must be covered in its own integration/security suite. |

## Research checks and methodological restraint

1. de Cheveigné & Kawahara's [YIN original](https://pubmed.ncbi.nlm.nih.gov/12002874/) establishes a reasonable CMND period estimator, **not** a guarantee of pitch accuracy with polyphonic speaker bleed, unstable register or noisy mobile microphones. Compare against ground-truth voice recordings and report false octave, voicing precision/recall, cents MAE and abstention by SNR/range.
2. [W3C MediaStream Recording](https://www.w3.org/TR/mediastream-recording/) orders final `dataavailable` before `stop`; [MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/stop) confirms it. This motivates asynchronous ownership tests.
3. [W3C WCAG 2.2 focus-not-obscured](https://www.w3.org/WAI/WCAG22/Techniques/failures/F110.html) identifies sticky header/footer overlap as a failure mode. Also test 2.5.8 target size and 1.4.10 reflow.
4. [Titze's SOVT theory](https://pubmed.ncbi.nlm.nih.gov/16671856/), [randomized SOVT trial](https://pmc.ncbi.nlm.nih.gov/articles/PMC4610291/), [breathing variability](https://pmc.ncbi.nlm.nih.gov/articles/PMC9760878/), and [NIDCD care guidance](https://www.nidcd.nih.gov/health/taking-care-your-voice) support gentle, context-sensitive instructions rather than guarantees or fixed capacities.
5. [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) documents that users may ignore the prompt indefinitely; timeout logic must avoid generating parallel capture streams. A timeout is an application UX policy, not proof of denied permission.

## Red-team passes, attack → defense, and unmet release gates

The first independent review challenged five dimensions, with selected
attack/defense pairs below. **Do not label these five categories as five
complete per-pose rounds**; the per-exercise quota remains pending in the
coverage table above.

1. **State corruption:** attack one-tap Easy before Start. Defense central
   Save invariant; probe positive timed take and re-rate same ID (browser test).
2. **Geometry/interaction:** attack expanded piano by pointer/keyboard focus
   and scroll. Defense disable sticky during expansion; probe 360/390/1280 and
   collapse restoration (browser test).
3. **Async fault/race:** attack recorder final-only chunk and A→B delayed
   callback; defense onstop assembly, epoch and immutable callback (Node tests).
4. **Numerical/scientific:** attack 440 Hz octave, 40 seeds white noise,
   unsupported bands, 240 noisy harmonic frames and +100-cent adjacent-note
   trill scoring; defense YIN confidence-based abstention and bounded gate
   (Node tests), still needs real-voice benchmark.
5. **Workflow, localization, CI:** attack empty A/B double-click, language
   toggle after banner, stale test invocations, missing CI. Defense no empty
   advancement, translation re-render, parser lint and a new Actions job;
   browser/CI must confirm.

**Before merge:** run `npm run test:core`; run the dedicated Chromium regression
contract job and all four virtual-display Chromium suite shards,
inspect artifacts and failures, and complete manual mic, keyboard/focus,
browser permissions and screen-reader tests. **After deploy:** recapture the
published site at desktop, 390/360/landscape; repeat direct routes, A/B and
score/regression checks; run payment/auth/privacy abuse tests in safe staging;
obtain a qualified vocal-science/SLP content review. Record separate evidence
for reduced motion, color-blindness, large text, voice-type boundaries and
real-world acoustic equipment. Uncompleted passes remain explicit debt.
