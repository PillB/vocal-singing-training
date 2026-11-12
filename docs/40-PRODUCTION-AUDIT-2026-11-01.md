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
| v21-straw-to-speech | voiceDrill · soft holds vs blips, speech steps not counted | ✓ | pending |
| v22-voice-recovery | voiceDrill · five quiet minutes, chime not counted, screen sleep | ✓ | pending |
| v23-clear-speech | voiceDrill · A/B takes, a skipped take, rate and pause share | ✓ | pending |
| v24-vocal-function | voiceDrill · 3 s line, longest hold rounded down | ✓ | pending |
| s28-vocal-function | voiceDrill · reference note per step, octave shift, replay | ✓ | pending |

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
| VT-010 P2 complexity debt | 357 existing functions initially exceeded CC15; new high complexity must fail CI | Historic monolithic app/mode functions | **Guard installed**, parser-backed ESLint max15 with exact SHA fingerprint exceptions. Refactored s27 `_frameGate` and the tour's `end()` into smaller methods; latest gate reports **352 unchanged legacy exceptions**. Bad fixture CC16 fails, good passes. **Open:** refactor remaining functions and require reviewer decisions for exception changes. |
| VT-011 P2 historical trust | Previous false zero-duration score/streak entries may already exist | No trustworthy provenance/consent to repair | **Open.** Do not silently erase; optional one-time transparency/opt-in correction with backup. |
| VT-012 P1 release evidence | Browser binaries unavailable locally (download produced invalid/zero-byte Chromium ZIP); CI later ran real Chromium | CI/runtime environment, no real mic | **Partially verified:** dedicated GitHub Actions production-contract job passed 7/7; first full 896-test sharded pass found legacy rating tests that assumed no minimum time, a pre-existing assertion expecting an empty A/B progress patch, and an s27 test expecting +60-cent errors to count. Follow-up explicit-vs-passive gate adjustment and falsifiable corrected tests are pending CI. **Open:** full green browser suite, post-merge live, real-device/voice and account/privacy gates. |
| VT-013 P2 UX localization | Some English/Spanish mixed copy and plural/wording quirks seen in live review (`1 días`, persona string) | Dynamic labels beyond static i18n dictionary | **Open:** bilingual copy/fold/ARIA sweep in six iterations, not safe to auto-correct all without screen context. |
| VT-014 P1 experiment/recording privacy | Analytics/auth/entitlement workers exist; browser progress and recording state differ from server billing metadata | Existing multi-store architecture; README incorrectly claimed "all practice data stays browser" while the live footer says accounts may sync progress and sends anonymous statistics | **README patched** with conditional sync/anonymous statistics/opt-out disclosure. **Open:** verify exact data flow, opt-out deletion and authenticated endpoint threat model; no production security certification implied. |
| VT-015 P2 vocal inference | Reference speaker bleed, background fan, AGC, voice fry/unvoiced, very low/high voices can fool a frequency-only widget | Single mic pitch estimate is not a source classifier or diagnosis | **Open:** labeled gender/range/device corpus, headphones/noise calibration, test false-credit bounds, UI uncertainty cues. Do not promise objective vocal correctness. |
| VT-016 P1 neighboring-note false credit | Trill solfège accepted up to **+120 cents** because of an old detector's sharp bias; the next chromatic semitone could be scored as the current note | Detector-specific tolerance left unchanged after new YIN estimator; s27 | **Patched, unit-pass:** default +50/−40-cent band; deliberate +100-cent test cannot advance, +30-cent hold does. **Trade-off:** legitimate human trills that read sharp by more than 50 cents may fail to advance until a labeled trill corpus justifies retuning. |
| VT-017 P2 nondeterministic visual oracle | Hosted Chromium volume-picture tests logged cross-origin `/v1/auth/methods` CORS errors unrelated to the scene and failed despite the image assertions | Rendering test accidentally depended on live account-worker network policy | **Test harness patched, pending CI:** intercept only `**/v1/auth/methods` with an explicit valid JSON response. Keep console/page errors actionable; do **not** loosen worker CORS or discard unrelated errors. Account/CORS behavior must be covered in its own integration/security suite. |
| VT-018 P1 deployment asset coherence | HTML linked the modified scripts and stylesheet under their **old** release query strings, risking cached pre-fix code with new page markup | Static HTML resource versioning must advance when published content changes | **Patched, browser-unverified:** bumped the seven changed HTML-linked CSS/JS assets to `20261101a` and all four page links to shared CSS. **Trade-off:** cold reloads download new assets; verify deployment propagation and a mixed-cache reload after merge. |
| VT-019 P1 47-route sweep timeout | CI exhausted a 15-minute `all-flows-robust` deadline, losing per-route failure detail | One 47-route callback and mistaken `waitForFunction` overload | **Split into 4 independent 390-second batches, pending CI.** Extracted small layout/mic/guide/Start/Stop helpers (CC15), fixed wait options and added per-route begin/end timing and batch-specific reports. Falsifiable: all 47 routes still covered; a single slow batch fails alone. **Trade-off:** four independent browser contexts modestly increase setup time but enable parallel CI and individual retries. |
| VT-020 P0 Safari playback gesture | After waiting for a microphone permission prompt, `AudioContext.resume()` and source start could occur without transient activation; sound appears scheduled but output remains suspended | Async Start→getUserMedia→piano path; **speaking-only mic analysers also need an active AudioContext** even when no piano is requested | **Patched; unit and 16/16 local WebKit/mobile-Safari tests passed; CI pending.** Capture all non-plan Start, mic Retry and primer OK taps; prime both buffer/oscillator before first await even when the exercise only needs the mic. Detect context `interrupted`/`suspended` and expose explicit on-stage recovery. Negative: speaking-only Start must still synchronously unlock. **Trade-off:** a near-inaudible unlock source may be scheduled on a mic-only exercise even if permission is subsequently refused; never autoplay loud material. |
| VT-021 P0 Safari input stream contention | Standalone Record while Practice already captured mic called `getUserMedia` again and created another AudioContext; iOS can mute/reroute original stream | Independent recorder and practice mic ownership; all recording exercises, especially v1/v4/v5/v7/s26 | **Patched; unit and local WebKit/mobile-Safari browser tests passed; CI pending.** Borrow live practice stream and meter, never stop borrowed track or context, otherwise own standalone capture and cleanup. Assert exact getUserMedia count and continued track after recorder Stop. **Trade-off:** stopping Practice while separate recording is active remains a sequencing/last-chunk edge case to hardware-verify. |
| VT-022 P1 Safari recording codec/finalization | A WebM default label may misidentify Safari's AAC/MP4 recording; final chunk arrives after Stop | MIME assumption and callback-timing race on separate recorder | **Patched; deterministic unit-pass, WebKit CI pending.** Prefer WebM/Opus if supported, then MP4/AAC; use actual `recorder.mimeType`, assemble in onstop after final dataavailable, generation guard old callbacks, preserve stream ownership. Negative: deferred final-only MP4 take must contain correct bytes and MIME. **Trade-off:** Safari and Chromium produce different formats; persistence and sharing consumers must accept both. |
| VT-023 P0 failed/muted input false live | A failed WebKit `createMediaStreamSource` connected an artificial silent source yet declared live; a muted/ended mic could leave the game counting without audible voice | Failure-masking fallback, no track lifecycle listeners, narrow getUserMedia retry policy | **Patched; deterministic unit-pass, WebKit CI pending.** Abort graph failure and release track; `NotReadableError` busy mic is a single attempt; debounce temporary iOS mute for 1.2 s, stop take and show retry on sustained mute/ended. Negative: no silent pseudo-live input and no second busy-device prompt. **Trade-off:** a legitimate multi-second route switch ends a take and requires explicit restart; safer than granting credit from stale data. |
| VT-024 P1 iOS hardware-route and AudioSession risk | Safari may route sound to earpiece/AirPods/headset unexpectedly even while JS reports a running AudioContext; platform audio session can be separately interrupted | OS routing outside Web Audio's introspection; Safari/WebKit device-specific bugs | **Monitoring patched; local WebKit hit/interrupt tests passed at 360×740/390×844/844×390; real-device release gate open.** Listen to `navigator.audioSession.statechange` when supported; do **not** force `play-and-record`/`playback` globally because WebKit reports route regressions. Physical iPhone matrix: silent switch, lock/foreground, incoming call, AirPods, wired headset, Speaker, mic permission. `outputPeak` alone is **not** an acoustic audibility oracle. |
| VT-025 P1 fullscreen click CI timeout | Four exercise control permutations in one 360-second headed test exhausted the timeout twice; unrelated remainder skipped | Monolithic headed browser test, CI forced 40 ms slow motion on every operation | **Split into four parallel 180-second exercise tests, pending CI.** Extracted Start/Stop, controls, toggle restore, mode and Back into CC15 helpers; CI slow motion now 0 while headed local demos retain 40 ms. Negative: occluded button still fails actual center hit. **Trade-off:** parallel browser sessions cost more CPU and may expose shared test-server timing. |
| VT-026 P1 local test source contamination | First Playwright WebKit run unexpectedly lacked newly added markup and showed all mic prompts failing | `reuseExistingServer` adopted a port-8765 Python server whose process cwd was an **older copy** at `/workspace/scratch/f479323b213b/vocal-singing-training`; tests silently probed the wrong release | **Resolved locally:** added validated `VT_TEST_PORT` config and ran with a unique port 18765 plus matching `BASE_URL`. Correct asset requests confirmed; 16/16 distinct local desktop-WebKit/emulated-iPhone audio tests passed (10 recovery/responsive + 6 existing cross-browser audio). Negative: old server had zero `#sound-blocked`, new served markup has one. **Trade-off:** alternate-port invocation must keep URL and server port aligned. |
| VT-027 P0 stale pitch after audio-context interruption | A browser may suspend Web Audio without immediately muting the `MediaStreamTrack`, leaving the animation frame pump reading stale analyser data and potentially extending a vocal hold | Input and piano share `AudioContext`; mic track events alone do not guarantee detection of output/input graph pauses | **Patched, local Node + 10/10 WebKit/iPhone recovery tests passed; CI pending.** On `statechange` to suspended/interrupted immediately cancel analyser RAF and close hold at last real input, resume only on running, show mic Retry after 1.2 s of unresolved suspension, detach watcher on Stop. Negative fixture: interrupted graph must have `raf === null` and must eventually announce `input-interrupted`; positive: brief recovery restores RAF without false interruption. **Trade-off:** a sustained route switch ends a take and requires a fresh gesture, preserving score integrity over seamless continuation. |
| VT-028 P1 shared stylesheet version drift | Full Chromium shard 1's page-consistency contract found `admin.html`, `guide.html`, and `privacy.html` requesting `styles.css?v=20261101a` while the redesigned exercise requested `20261102a` | Cached shared CSS variants could make layout differ between pages after navigation | **Patched, CI rerun pending.** All four pages now refer to `20261102a`. Positive: one shared asset key; negative: a single stale key fails the existing `admin.spec.js` comparison. **Trade-off:** three page types force one extra CSS download. |
| VT-029 P0 idle tour dismissal destroys the current exercise | In Chromium shard 1, **20/20 five-viewport Start hit tests** returned a zero-size center while the independent direct WebKit Start test was visible. Reproduced old five-viewport failure locally in WebKit. The cleanup helper called `VTTour.end()` *after* opening every exercise; its inactive `end()` called `restorePlace()` and silently changed view to Home. The 47-route batching helper also misclassified zero-size Start as a soft success | Shared tour public API had no idle guard; QA cleanup was state-destructive. This was a **false-green QA blind spot**, not evidence that the 47 routes truly completed | **Patched, negative reproduced before fix; Chromium CI rerun pending.** Idle `end()` is inert, QA cleanup only closes an active tour while preserving the probed route, and zero-size or missing Start is a **hard** error. New WebKit contract invokes `end()` on an idle exercise and verifies the view/Start/Start→live; previously failing five-viewport sweep and **all four 47-route batches** now pass in WebKit with actual Start/Stop and logged pointer clicks. **Trade-off:** 47 genuine routes now take about two minutes in parallel local WebKit rather than passing trivially; CI resources/timeouts must be observed. |
| VT-030 P1 WebKit fake-microphone incompatibility | After correcting VT-029, speaking/diction exercises failed Start with the `mic-blocked` permission UI while pitch exercises remained live. A direct 3-viewport Start test reproduced this; the existing Safari recovery tests worked only with a prototype-level mock | WebKit invokes `MediaDevices.prototype.getUserMedia`, bypassing the old instance-only test stub; the test's *artificial* second AudioContext also diverged from the one-context architecture and risked Safari resource limits | **Test-fixture patched; reproduced-red → 3/3 WebKit direct, 5/5 viewport samples, and expanded 22/22 desktop/iPhone WebKit audio contracts green locally; CI rerun pending.** Intercept both instance/prototype methods, simulate the microphone stream in `VTPiano.ctx` (or a fallback shared context), and assert live state, not just button existence. Applied the same shared-graph model to the richer `qa/synthetic-voice.js` waveform source. Negative: native WebKit GUM previously produced a permission-blocked false failure; positive: live stream, Start/Stop, and a nonzero hit target. **Trade-off:** synthetic media cannot validate real iPhone microphone permission, AGC, physical audio routing, or acoustic latency; those remain human-device gates. |
| VT-031 P1 visual-suite mic lifecycle failures | Chromium shard 2 logged 4 regressions among 223 passing tests: blank dynamics/pitch labels and hidden Stop in speech/volume visual fixtures. Reproduced all four in WebKit. The mic-rejection diagnostic read **`Microphone supplied no live audio track`**; the synthetic voice's cached destination track was **`audio:ended`** on the *second* exercise after the first Stop | The stricter production engine correctly refuses dead input. The old QA synth reused one stopped stream across consecutive exercises; it also had a separate AudioContext and instance-only GUM stub | **Fixture patched; reproduced-red → exact four WebKit visual tests green 4/4; Chromium CI rerun pending.** Detect a retired input track, discard its old synth graph without closing the piano-owned context, and regenerate a fresh destination and voice sources for the next take; prototype-level mock and shared context retained. The `volume` test additionally asserts actual live state, context/track diagnostics and both positive/negative Start paths before reading picture labels. **Trade-off:** regenerating synthetic sources between takes has minor test CPU overhead; physical capture remains a separate release gate. |
| VT-032 P1 misleading Safari microphone recovery | A device-busy `NotReadableError`, absent `NotFoundError`, late `TimeoutError`, or dead source graph previously displayed "microphone blocked—allow permission in address bar," even when permission was already granted or the permission sheet remained open | UI discarded the browser's capture failure `name` and reused its permission-denied wording for every cause | **Patched, 2/2 focused desktop-WebKit/iPhone tests green; wider CI pending.** Retain the last capture error for only the current attempt, map busy/temporary hardware error to close-other-apps/headset guidance, missing device to input connection/selection, delayed prompt to check/answer the original browser sheet, dead graph to reconnection, and keep `NotAllowedError` as actual permission guidance. Negative one call each for busy, denied, absent, timeout; positive fifth explicit Retry obtains a live mic and Stop. **Trade-off:** browser error names remain approximate, not proof of which physical app owns the microphone; avoid claiming an automatic repair of OS routing. |
| VT-033 P1 test-isolation failures in broad WebKit visual sweep | An *exploratory* run of all 106 Chromium-tuned `exercise-viz-*` scenarios on Linux WebKit with four workers produced **78 passes / 28 failures**. Ten failures were unrelated account-worker CORS pageerrors; one test's instance-only `getUserMedia` override never made the synthetic track report `autoGainControl: true` | Scene tests leaked a remote auth request, and WebKit resolves media methods through prototypes; neither failure demonstrates a scene or microphone fault | **Test fixtures patched.** Narrowly fulfill only `**/v1/auth/methods` in speech-shape tests; on the *captured track*, verify `getSettings().autoGainControl === true` via `MediaStreamTrack.prototype.getSettings` before asserting the volume warning. The previously red processed-input case and a previously red speech-shape reduced-motion case now pass individually in Linux WebKit (**2/2**). **Trade-off:** synthetic browser-reported AGC does not prove the physical mic is processing or unprocessing samples; a real signal-level calibration remains necessary. The 106-case exploratory suite is not a release gate until its portability oracles are revised. |
| VT-034 P1 WebKit recording-api test blind spot | Six guided-scene tests expected enabled listen-back after Stop; Linux Playwright WebKit had no native `MediaRecorder`, so optional recording did not produce `practice.recUrl`. Chrome's real MediaRecorder run is a separate positive control | Browser-test implementation lacks Safari's native recorder on this Linux runtime; app intentionally keeps nonrecorded exercise usable when recording is unavailable | **Open hardware/integration validation, not a claimed iOS regression.** Add a separate deferred-final-chunk MP4/AAC simulator to verify guided UI wiring with a valid playable fixture, then require physical iOS Safari to record, finish, listen, retake, export and reload each recording exercise. Negative: absent/unsupported recorder must visibly explain why replay is unavailable and never imply it saved audio; positive: valid output MIME/bytes and audible distinct A/B takes. **Trade-off:** a mock can test callback ordering but cannot establish codec decoding, acoustic capture, output route or data durability on a real device. |
| VT-035 P1 timed-scoring uncertainty under WebKit load | Eleven scene-signal checks failed under four parallel WebKit workers: breath/lip-trill **3**, dynamics **1**, pitch/hold **4**, speech contour **1**, speech pacing **1**, volume level **1**. **Seven** previously red scenarios passed isolated single-worker checks (s14, v19, v14, SH ladder, lip-trill stall, five-note scale, quiet-room even count), but independent v19 repeat testing was wrong **1/3** times | Real-time rAF sampling, audio-thread scheduling, limited analysis-window resolution and synthetic-source callback timing can alter observations. For s14, `_attack` deliberately marks hammer `null` if `maxDt` exceeds the ~43 ms sample window + 6 ms; an unobserved 4 ms onset is *unknown*, not a negative observation | **Open measurement/UX issue; no threshold fudging.** Instrument `AudioContext.currentTime`, sample count, `dtMs`, confidence, raw/filtered frame bins and scene event decisions in opt-in, privacy-safe diagnostics. Negative: inject dropped frames, clipping, silence and contradictory tone contour; verify **unknown/abstain**, no automatic credit or unjustified praise. Positive: deterministic buffered −4.5/0/+3.5-semitone contour, voiced-hold and onset fixtures plus a single-worker real-time WebKit replay must give expected results. Then benchmark calibrated human-voice recordings. **Trade-off:** honest uncertainty can temporarily decrease scores and make some feedback inconclusive. |
| VT-036 P1 native iOS audio-output invisibility | WebKit bug reports document `AudioContext` appearing healthy while output is inaudible or crackles after OS interruptions, focus changes, or input echo cancellation. A software oscillator meter cannot prove acoustic delivery | Audio routing and the OS audio session can diverge from Web Audio graph state; for example [WebKit 323104](https://bugs.webkit.org/show_bug.cgi?id=323104) describes all output APIs reporting success while a tab remains silent and [WebKit 326286](https://bugs.webkit.org/show_bug.cgi?id=326286) reports iPhone output crackling with input AEC active | **Open real-device release gate.** Keep an explicit user-tapped sound test/recovery and a clear microphone retry; test actual loudspeaker/headset output with mic capture on/off, AEC preference on/off where supported, silent switch, call/notification, locking, route switch, background/foreground, and repeat Start/Stop. Negative: no UI must claim sound was audible solely because the graph's state is `running`; positive: human/coupled probe hears intended tone while recorded vocal input continues. **Trade-off:** there is no universal page-script workaround for all Safari/OS bugs; do not force a global AudioSession category without measuring route regressions. |
| VT-037 P0 running-but-frozen audio renderer awards stale practice | Official [WebKit 263627](https://bugs.webkit.org/show_bug.cgi?id=263627) and [276687](https://bugs.webkit.org/show_bug.cgi?id=276687) describe `AudioContext.state === 'running'` with `currentTime` frozen; a repeatedly sampled analyser may return one cached pitched buffer while wall-clock holds/game scores keep advancing | Prior listener reacted only to `statechange`; `requestAnimationFrame` and `performance.now()` can move independently of the audio rendering clock | **Patched; revised 28/28 local desktop-WebKit/emulated-iPhone contracts and 15/15 core suites passed, remote CI pending.** A low-complexity entry guard compares audio time to wall time before any analysis. At **60 ms without clock advance**, withhold frames and close the hold at its last accepted observation; at **1,400 ms**, stop and require a new mic gesture. Negative: freeze a *running* context's `currentTime` while synthetic mic and rAF continue; assert `lastVoiceAt`, hold, pitch-game score and cleared count stay fixed after suspicion. Positive: tap Retry **without altering the frozen context**, prove a different shared graph takes ownership and its audio clock really advances. `PianoEngine.rebuildStalledContext` primes the new graph inside this gesture; retired context state events may not override it. The legacy `voiceFreq` remains a grace-held **display** value; `_detectPitch` exposes a separate fresh measurement, and the pitch visualizer's low-complexity adapter gates game points on that measurement plus voice energy. The integration test rejects 15 unmeasured grace frames while awarding points for a new synthesized tone. **Trade-offs:** first **at most ~60 ms** remains a bounded uncertainty window; interruptions may end legitimate takes and closing the previous graph during delayed recorder finalization needs hardware confirmation. Cross-module access to the current practice frame is temporary coupling until the high-CC app callback is refactored. The high-CC DSP loop remains byte-identical; a ≤15-CC entry guard composes around it. |
| VT-038 P1 intermittently incorrect semantic singing/speech feedback | Independent QA repeated v19 landing in WebKit **3×**: **2 correct / 1 wrong**, with an intentionally *falling* third claim labeled **rise** (initial broad run labeled another fall **level**). Also v14 pace river incorrectly credited a key point as an `anchor` | Candidate segmentation fault: a short rising after-tag with measured duration over 0.8 s can overwrite the first claim's falling `fin.kind` when the gap is under 0.45 s. Independently, `_judge` credits a pause's entire duration if it only intersects a wide key-point window, instead of its clipped intersection length | **Open, not excused as fixture flakiness.** Require a deterministic direct-mode test for falling claim + 350 ms gap + short rising tag; preserve original fall and ask about the tag, plus a longer uncertain tag. For pacing, test a 1.2 s pause overlapping the window for only 0.1 s (must not earn an anchor) versus one substantially inside (must qualify). Collect privacy-safe phrase/gap/window bins in 20-repeat WebKit stress before adjusting timing/thresholds; report unknown for insufficient frame evidence. **Trade-off:** conservative classification yields more inconclusive guidance until human-speech validation rather than confidently wrong advice. |
| VT-039 P0 green successor PR silently omits Safari recovery | **2026-11-02:** PR #23 at `118c4bfe` claimed to supersede #22 and had 7/7 green CI jobs, but its tree did not contain `js/audio-recovery.js`, `tests/safari-mobile-recovery.spec.js`, or a WebKit Safari job. PR #22 at `39470224` had the recovery graph and tests but shard 4 timed out with 221 tests unrun | The drafts diverged six Safari commits after their common base. PR #23 correctly repaired the tour/Playwright helper timeout and isolated headed sweeps, but those same helper differences mean naive whole-file cherry-picks would undo the fixes | **Integration branch `codex/safari-on-production-qa`, not merged/deployed.** Port the six Safari commits onto PR #23; retain its bounded Playwright waits, active-tour guard, per-exercise suites, security/CSP and 15-complexity ratchet. Restore the separate WebKit desktop/iPhone CI job. Falsifiable negatives: removing the recovery script/test/job must fail a targeted gate; a `running` but frozen audio clock must not award points; a speech Start must reach live using a fresh synthetic track on every exercise. **Trade-off:** creates a third draft integration candidate to prevent changing an actively updated PR; the maintainer must choose a canonical merge path. |
| VT-040 P1 QA VM test and WebKit mic fixture drift across branches | **2026-11-02:** merging the Safari engine caused an inherited recorder mutation test to throw `ReferenceError: clearTimeout is not defined`; the first merged WebKit 28-case run scored 20 pass/8 fail: six Start/Stop routes said mic blocked and two busy/Retry cases failed. The independent PR #22 WebKit suite was green before this merge | The isolated Node `runInNewContext` fixture never exposed the browser timer globals newly required by `stop()`. The PR #23 `e2e` fixture intercepted `navigator.mediaDevices.getUserMedia` on the instance only and created a second AudioContext: Linux WebKit resolves via `MediaDevices.prototype`, and its fake extra context could exhaust Safari's capture budget | **Patched both fixtures; negative reproduced before fix, positive verified:** the recorder's empty blob is still rejected with timers available; re-running the previously failing Start/Stop sweep passed **3/3 desktop-WebKit viewport cases**, busy/Retry passed **1/1 WebKit**, then **28/28 full desktop WebKit and emulated-iPhone recovery contracts passed**. `npm run test:core` passed 23/23 suites and `node qa/mutate.mjs` killed every mutant. Remote integration CI remains pending. [Node VM docs](https://nodejs.org/api/vm.html) confirm context objects define available globals; [Playwright browser install docs](https://playwright.dev/docs/browsers) explain separate engine/OS dependencies. **Trade-off:** adding timers to a test context is fixture realism, not increased browser reliability; synthetic streams cannot certify physical devices. |
| VT-041 P1 Chromium local binary and release evidence gap | **2026-11-02:** local Playwright WebKit installed successfully after OS dependencies; Chromium's full and headless-shell downloads both yielded corrupt/empty archives in this workstation although the prior #23 hosted Chromium CI was green | Browser binary delivery in the current workspace, not a demonstrated application defect; Playwright supports distinct binaries and per-browser download hosts ([official docs](https://playwright.dev/docs/browsers)) | **Open integration CI gate.** Use a fresh GitHub Actions run against the exact integration SHA for all four Chromium shards and the Safari WebKit job. Do not infer Chrome success from WebKit. **Trade-off:** the hosted runner is the Chromium oracle until the local download route is fixed; physical iPhone tests remain a separate non-CI gate. |

#### 2026-11-02 branch-integration cross-checks (not six physical-device trials)

1. **Adversarial capture:** four distinct failed permission/availability reasons must lead to the correct guidance, and the fifth Retry must start a live take; WebKit single-case repeat passed after helper repair.
2. **Asynchronous state:** recording must borrow one practice stream and preserve final late MP4/AAC chunks; the Node/Worker suite and the WebKit recorder contract passed, with stale-callback mutants killed.
3. **Occlusion and recovery:** a stopped track, interrupted graph and frozen clock must halt scoring; the Retry must be hit-testable on both narrow portrait and landscape; dedicated desktop/WebKit and emulated-iPhone tests passed.
4. **Numerical and scientific uncertainty:** stale display-held pitch must earn zero points; fresh, measured pitched input may earn points. Mutants removing confidence/hold/gate protections were killed, but human-voice pitch/classifier error bars remain open.
5. **Integration and CI:** the new WebKit job is back; upstream Chromium timeout-causing `VTTour.end()` and `waitForFunction` fixes were deliberately preserved rather than cherry-picked over. The full 28 synthetic Safari tests passed; exact-SHA hosted Chromium/Safari jobs remain a gate.

Four legibility/aesthetic passes are tracked distinctly: 1280×800 desktop, 360×740/390×844 portrait, 844×390 landscape, and 200% zoom/keyboard/VoiceOver/reduced motion. Browser recovery center-hit and sample Start visibility passed for the first three synthetic configurations; all remaining unfolded/folded overlays and **the fourth assistive/physical pass** are unverified. The audio work changes no anatomical teaching pose, so the existing qualified vocal-science content-review gate still applies. This is one cross-branch integration round, not the requested five completed red-team rounds for each of 47 exercises.

### Exploratory Safari scene sweep — evidence boundaries

The 106-case run used **Linux WebKit, not Safari running on an iPhone**, and
four concurrent workers. It was temporarily enabled by expanding WebKit's
`testMatch`; the normal cross-browser CI lane intentionally focuses on
microphone, output/interruption and route/hit-test contracts. Classify each
failure by its falsifiable expected behavior before changing application code:

| Failure class | Count | Correct behavior | Wrong behavior / next check |
|---|---:|---|---|
| Remote auth request injected into speech-shape tests | 10 | Render/score remains independent of an unreachable account-worker preflight | CORS becomes a synthetic exercise failure; narrow test route patched, full isolated shape set not yet rerun |
| Optional native recorder absent from Linux WebKit | 6 | No falsely enabled playback without bytes, but positive playable media is testable with native Safari or an explicit deferred recorder fixture | Disabled listen-back interpreted as proof that genuine Safari recording is broken; hardware test still open |
| AGC test double intercepts wrong object | 1 | A track reporting AGC true makes the volume scene disclose processing | Old instance-only mic override left track setting false; prototype fixture now red-to-green with explicit track assertion |
| Real-time/algorithmic signal assertions | 11 | Staged voice and silence produce evidence-backed score or an explicit unknown when timing loses samples | Seven previously failing tests passed isolated single-worker WebKit checks; v19 then reproduced **1 wrong/3** in independent repeats. Four others and the classifier's root cause remain open pending frame-level trace. |

This run is **not 28 production defects**, nor is it a full WebKit pass. Record
both limits. If the CI-specific `safari-audio` job is green, that verifies its
dedicated deterministic contracts—not Safari's native recorder, microphone
hardware, physical speakers, and all 106 real-time scene tests.

## Research checks and methodological restraint

1. de Cheveigné & Kawahara's [YIN original](https://pubmed.ncbi.nlm.nih.gov/12002874/) establishes a reasonable CMND period estimator, **not** a guarantee of pitch accuracy with polyphonic speaker bleed, unstable register or noisy mobile microphones. Compare against ground-truth voice recordings and report false octave, voicing precision/recall, cents MAE and abstention by SNR/range.
2. [W3C MediaStream Recording](https://www.w3.org/TR/mediastream-recording/) orders final `dataavailable` before `stop`; [MDN](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/stop) confirms it. This motivates asynchronous ownership tests.
3. [W3C WCAG 2.2 focus-not-obscured](https://www.w3.org/WAI/WCAG22/Techniques/failures/F110.html) identifies sticky header/footer overlap as a failure mode. Also test 2.5.8 target size and 1.4.10 reflow.
4. [Titze's SOVT theory](https://pubmed.ncbi.nlm.nih.gov/16671856/), [randomized SOVT trial](https://pmc.ncbi.nlm.nih.gov/articles/PMC4610291/), [breathing variability](https://pmc.ncbi.nlm.nih.gov/articles/PMC9760878/), and [NIDCD care guidance](https://www.nidcd.nih.gov/health/taking-care-your-voice) support gentle, context-sensitive instructions rather than guarantees or fixed capacities.
5. [MDN getUserMedia](https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia) documents that users may ignore the prompt indefinitely; timeout logic must avoid generating parallel capture streams. A timeout is an application UX policy, not proof of denied permission.
6. [MDN BaseAudioContext.state](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state) specifically documents iOS Safari's `interrupted` state after app/lock transitions. [MDN AudioSession.state](https://developer.mozilla.org/en-US/docs/Web/API/AudioSession/state) separately exposes platform interruption. These are two signals, not proof of actual speaker audibility.
7. [WebKit bug 218012](https://bugs.webkit.org/show_bug.cgi?id=218012) documents sudden output-volume changes after microphone permission; [WebKit bug 282939](https://bugs.webkit.org/show_bug.cgi?id=282939) documents wrong default mic/headset routing and proposed workarounds that may themselves reroute output. [WebKit audio-session regression 321275](https://bugs.webkit.org/show_bug.cgi?id=321275) was fixed in 2026. Consequently forcing `navigator.audioSession.type` on all phones is not an evidence-backed universal fix; test actual routes first.
8. [WebKit's Safari 18.4 release](https://webkit.org/blog/16574/webkit-features-in-safari-18-4/) added WebM/Opus media recording support; older Safari may use MP4/AAC. `MediaRecorder.isTypeSupported` and the returned recorder's `mimeType` should decide actual persistence, not the user-agent string.

### Mobile audio red-team pass register (2026-11-02)

The five attack/defense passes below are **code and deterministic-test passes**,
not fabricated physical iPhone trial counts. Full device execution remains open.

| Attack pass | Wrong behavior that must turn the test red | Defense and present evidence |
|---|---|---|
| 1 · permissions / malformed constraints | Busy mic triggers another prompt; denial or broken graph shows a healthy green game | `NotReadableError` single-attempt negative; `OverconstrainedError` positive fallback; graph-failure track release (`safari-audio-contract`). |
| 2 · async/race | Old A final MP4 chunk gets attached to B; recorder opens a second capture or stops live borrowed mic | `MediaRecorder` deferred final chunk + generation negative fixtures; stream ownership/count assertions. |
| 3 · lock/foreground/audio state | `interrupted` context silently remains live; modal recovery button exists but is not tappable | Context + AudioSession listeners, visible Resume tap; dedicated mobile-WebKit `elementFromPoint` test queued for CI. |
| 4 · acoustic/scientific | Scheduled audio or input RMS taken as evidence that speaker route/voice is correct | Do not claim acoustic verification from nodes; separate physical mic/speaker tests and labeled human-vocal benchmark are open. |
| 5 · integration/CI/regression | One 47-exercise or four-pose test times out and all other controls remain untested | Split into 4+4 independent tests, preserve route reports, new WebKit desktop/iPhone job; pending first green runs. |

Four **aesthetic/hit-test passes** to execute per affected scene, independent
of the deterministic core tests: (a) 1280×800 desktop stage recovery alignment;
(b) 360×740 and 390×844 portrait, both languages, no HUD button overlap;
(c) 844×390 landscape and 200% zoom, keyboard tab focus/scroll visibility;
(d) reduced-motion, screen-reader announcement and high-contrast interruption
status with a reachable Retry. The UI is not cosmetically signed off until
those actual rendered snapshots and hit targets are reviewed. Medical/anatomical
pose compliance is unchanged by this audio recovery change; shared mic/game
timing paths for all 47 exercises must be retested, with s2 and v1 prioritized.

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
