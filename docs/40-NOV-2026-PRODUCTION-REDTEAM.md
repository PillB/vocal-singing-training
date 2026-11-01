# Production red-team ledger — 2026-11-01

**Status: release candidate under review, NOT certified production-ready.** Repository HEAD at audit start: `07e967d`; public Pages was inspected at `https://pillb.github.io/vocal-singing-training/`. The pending fixes in this report are local/PR changes until an exact deployed SHA is verified. The independent QA and research threads challenged the implementation rather than approving it.

## Boundaries of evidence

- Read repository strategy, requirements, catalog snapshot, reliability/QA, live forensics, UI red-team and implementation; statically inspected audio engine, pitch visualizer, guided scenes, progression map, app timing, worker and representative tests. Frozen catalog: **47 exercises (20 speaking, 27 singing), 40 registered modes, 13 progressions**. Older reports saying 36 are historical.
- Direct public-browser interaction: **Home → Hablar → Mejor dicción** (idle next rung, guidance, geometry), **Home → Cantar → Afinar una nota** (six progression/mode/challenge/octave/range combinations), and independent QA's **Soltar mandíbula y cuello** (Start/Stop/phase/reflect/save). These are sampled live observations, NOT 6 rounds × 47 exercises.
- Browser screenshots observed at ~1348×926 desktop. Local Playwright binary was absent; its download through the present environment returned a truncated/0-byte archive even with approved network access. This is an **environmental execution blocker**, not a passing/failing visual suite. CI must run the full suite elsewhere. No physical microphone, iOS Safari, device-permission grant, payment production endpoint or real voice corpus was used in this audit.

## Z-pattern visual and reading-order inventory (observed)

### Home — top-left → right → down-left → right

1. **Global black 58px header**: gradient rounded icon and brand/subtitle on left; Practicar, Plan, Historial, Entrar, Probar Pro, English, Ver el tour and Leer la guía chips across right. Visually the largest attention conflict is eight adjacent header actions with different priority, some ~12px copy; at ~1348px wide they fit, but mobile folding/occlusion requires separate snapshots.
2. **Welcome/next-step card**: top-left eye path hits uppercase free-training kicker and 3-minute headline, then two large exclusive Cantar/Hablar tiles; next line has basics description left and green/teal Empezar CTA right. A second right-hand subcard explains mic and saving. The tour and guide text links sit below the primary path.
3. **Catalog card**: heading/description left, full-width mutually exclusive Hablar/Cantar segmented control, contextual explanation below, three rounded category choices, then 3-column cards. Each card visually groups title, one-line abbreviated description and duration/capabilities. At the observed viewport, the third card row crosses the fold and needs scrolling. The input semantics for exclusive hero choices and category choices are exposed as checkboxes, not radio choices.
4. **Footnote**: privacy summary, manual, privacy link and analytics opt-out. No observed on-screen overlap at desktop initial fold, but visual/keyboard/landscape sweeps are open.

### Speaking stage — `v1-diction`

1. Sticky global header; compact back/title/category/Help row. Main stage begins with a tiny **Tiempo 05:00** pill.
2. Large dark inset **DICCIÓN · ESCALERA DE RITMO** with Siguiente peldaño at top-right. A ~12px explanation spans the width, followed by four time-labelled rungs and a 4-column graph with base-band/green active segment. Reading path is partly broken by the plot: no current numerical measured rate is available before Start and the uncalibrated visual baseline may appear objective.
3. Guide block explains three actions in numbered order; Ver todos los pasos y consejos is a small link-styled button.
4. Persistent bottom rail: high-contrast green Start, recording checkbox, mic-sensitivity slider 1–10. Below the stage, both PASOS Y CONSEJOS and REFLEXIONAR Y GUARDAR are collapsed. Before Start, Siguiente peldaño changes a preview rung but the practice timer is unchanged; expectations should be made explicit or the control disabled until live.

### Singing pitch game — `s9-pitch-match`

1. Back/title/category/Help; top stage rail **Tiempo 08:00**, three-choice **ACORDES** selector, three-choice **MODO** selector, challenge toggle and accuracy indicator. Compact control labels (~10–12px) are harder to scan than the exercise title.
2. Main canvas dominates roughly 500px of first fold; before Start it shows horizontal note lanes, centered **Escucha, luego canta**, empty piano keys along bottom and the cue **0/8**. This is a clear visual hierarchy but the large empty inactive canvas and distant note readouts can make readiness ambiguous. Target/tuning colors need color-blind and reduced-motion checks on a real active frame.
3. Bottom overlay rail: Start, Grabarme, mic-sensitivity slider, octave decrement/current/increment, automatic range toggle and piano disclosure. Under it, readouts Objetivo, Tú, Afinación, Estabilidad show dashes/placeholder until sound. The fold ends on collapsed PASOS Y CONSEJOS; no overlap was visible at this desktop size.
4. Six live *idle-state* combinations selected 3 progressions × 3 modes, challenge true/false, auto-range true/false and octave 0/+1/+2. DOM option labels, selected states, octave readout, canvas width (~1044px) and stage width (~1047px) agreed. This verifies option *selection*, not live audio playback or scored note correctness.

### Guided phase — `s17-jaw-neck-release` (independent QA live)

1. Phase title, graphic/movement cue and remaining step time precede a large illustrated sequence; the bottom rail still exposes microphone sensitivity despite the explicit mic-free profile.
2. In live practice, a 2-minute global timer and frame-capped guided progression diverged dramatically. On Stop after ~1:41, the mode recorded zero of four release phases even though the countdown was near its end.
3. The old Siguiente control was actionable-looking before/after live while its handler ignored clicks; locally fixed to disable it outside active practice. A generic self-assessment saved 6.0/10 and emitted first-win encouragement despite 0/4 phases, requiring differentiated copy.

## Complete exercise inventory and coverage status

Every ID below is in the frozen catalog and statically exercised by existing source/test contracts. `LIVE` means direct UI sample in this audit (not full microphone/per-tick acceptance); `CODE` is code/catalog only.

| ID | Exercise (Spanish) | Mode | Required sound contract | Audit |
|---|---|---|---|---|
| v1-diction | Mejor dicción | rateLadder | Voice / no piano | LIVE |
| v2-volume | Mantener el volumen | volumeSteady | Voice / no piano | CODE |
| v3-soft-palate | Elevar el velo del paladar | countPace | No piano | CODE |
| v4-articulation-pen | Articulación (con bolígrafo) | articulationContrast | Recording / no piano | CODE |
| v5-neutral-ears | Oídos neutros (persona e historia) | recordOnly | Recording / no piano | CODE |
| v6-connect | Cómo conectar | speechEnergy | Recording / no piano | CODE |
| v7-record-review | Grabar y revisar | reviewSession | Recording / no piano | CODE |
| v8-fluency-metaphors | Fluidez (metáforas) | metronomeSpeech | Recording / no piano | CODE |
| v9-12-week | Plan de 12 semanas | weekPlan | Plan UI / no piano | CODE |
| v10-power-pause | El poder de la pausa | pauseDetect | Voice / no piano | CODE |
| v11-kill-fillers | Eliminar rellenos | fillerDetect | Voice / no piano | CODE |
| v12-melodic-speech | Habla melódica y tono | pitchContour | Voice / no piano | CODE |
| v13-volume-ladder | Escalera de volumen | volumeLadder | Voice / no piano | CODE |
| v14-pace-variation | Variar el ritmo | keyPointPace | Voice / no piano | CODE |
| v15-gestures | Gestos y lenguaje corporal | gestureReps | Guided / no piano | CODE |
| v16-facial-expression | Expresión facial | facePhases | Guided / no piano | CODE |
| v17-strategic-concision | Concisión estratégica | concisionGate | Voice / no piano | CODE |
| v18-story-peak | Historia: pico emocional | storyTimer | Guided / no piano | CODE |
| v19-authority-close | Cierre con autoridad | authorityLand | Voice / no piano | CODE |
| v20-energy-match | Energía y carisma | energyMatch | Voice / no piano | CODE |
| s1-vocal-fry | Fry vocal → /A/ sostenida | pitchHold | Piano-capable | CODE |
| s2-solfege-chords | /A/ en progresiones (solfeo) | pitchChord | Piano-capable | CODE |
| s3-song-stanzas | Estrofas de canción | pitchSong | Piano-capable | CODE |
| s4-lip-trills | Trinos de labios | sovtFlow | Piano-capable | CODE |
| s5-sirens | Sirenas / deslizamientos | sirenRange | Piano-capable | CODE |
| s6-straw | Fonación con pajita (SOVT) | sovtFlow | Piano-capable | CODE |
| s7-humming | Resonancia con hum | humTargets | Piano-capable | CODE |
| s8-breath-support | Apoyo del aire (S sostenida) | breathS | Piano-capable | CODE |
| s9-pitch-match | Afinar una nota | pitchMatch | Piano-capable | LIVE |
| s10-five-note | Escala de cinco notas (/A/) | scaleSteps | Piano-capable | CODE |
| s11-dynamics | Crescendo en una nota | dynamicSwell | Piano-capable | CODE |
| s12-easy-onset | Ataque suave | onsetReps | Piano-capable | CODE |
| s13-arpeggio-match | Arpegios afinados | pitchChord | Piano-capable | CODE |
| s14-staccato-legato | Staccato vs legato | staccatoLegato | Piano-capable | CODE |
| s15-sh-air-ladder | Escalera de aire SH | shAirLadder | Unvoiced air / no piano | CODE |
| s16-major-scale-coord | Coordinación en escala mayor | scaleSteps | Piano-capable | CODE |
| s17-jaw-neck-release | Soltar mandíbula y cuello | releaseFlow | Silent guided / no mic | LIVE |
| s18-costal-breath | Respiración costo-abdominal (apoyo) | breathCycle | Silent guided / no piano | CODE |
| s19-soft-palate-surprise | Paladar blando: sorpresa y pre-bostezo | openSpace | Piano-capable | CODE |
| s20-five-vowels | Las cinco vocales (I–E–A–O–U) | vowelLadder | Piano-capable | CODE |
| s21-chest-resonance | Graves: resonancia de pecho | resonanceZone | Piano-capable | CODE |
| s22-mid-voice-hola | Voz media («Hola») | resonanceZone | Piano-capable | CODE |
| s23-mask-ya | Buscar la máscara («YA») | resonanceZone | Piano-capable | CODE |
| s24-nana-high | Agudos con «NANA» | resonanceZone | Piano-capable | CODE |
| s25-zone-tour | Recorrido por las tres zonas | resonanceZone | Piano-capable | CODE |
| s26-placement-compare | Comparar colocaciones (A/B) | placementAB | Piano-capable | CODE |
| s27-lip-trill-solfege | Solfeo en trino de labios | trillSolfege | Piano-capable | CODE |

## Tiered issues and root causes

| ID | Severity | Confirmed result / preemptive risk | Root cause | Status and falsifiable gate |
|---|---|---|---|---|
| P0-01 | P0 | 440Hz→220Hz; 523Hz→261Hz; loud random noise got ~76Hz, corrupting game rewards | Raw autocorrelation maximum + 65–400 search and no periodicity confidence | **Patched locally** with YIN-style difference, independent spectral off-grid abstention, 14 sine/harmonic/fourth-partial/noise tests at 44.1/48/96k; needs device corpus, vibrato and out-of-range probes |
| P0-02 | P0 | 79/212 chord-note occurrences missing under −2 transposition | Dictionary C1–B6, unchecked shifted names and silent `if(freq)` playback | **Patched locally** C0–B8 parity + tests; low C0 remains subaudible/unscorable; warning added, target restriction still OPEN |
| P1-03 | P1 | 2-minute guided exercise finishes clock with almost no phases complete | 100ms per-frame cap vs wall-clock timer, exacerbated by 1FPS/rAF throttling | **Patched locally** guided wall time, independent 1FPS-vs-50ms test; on hidden tab stop mic/piano/recorder + reset timer to restart fully; real hidden-tab UI re-test OPEN |
| P1-04 | P1 | Notes above 520Hz discarded despite pitch detector output | Engine's `PITCH_MAX` disagreed with wider estimator | **Patched locally** PITCH_MAX 1350; integration Playwright/real singing gate OPEN |
| P1-05 | P1 | Piano sound from speakers may falsely count as the singer | `getUserMedia` disables echo cancellation; no source separation | **Open**; negative control piano-only mic must earn zero hits; use listen/sing turn-taking or headphone requirement if confirmed |
| P1-06 | P1 | Mic pending Start/Stop race can orphan stream | Async acquisition not atomically guarded in low-level engine/standalone visualizer | **Engine patched locally** with generation-token cleanup, single-flight Start, track-stop tests; standalone visualizer and real permission UI OPEN |
| P1-07 | P1 | Local scoring proxies may overclaim measurable skill (lip flutter, vowels, inflection, formants, filler words) | Synthetic waveform test is not acoustic external validation | **Open**; two independent expert annotations, stratified device/mic/voice/noise holdout corpus; publish error bars |
| P1-08 | P1 | Payment/account entitlement, auth, quota and refund security may differ live from tests | Auth/UI/worker/cloud integration surfaces not verified together | **Open**; OWASP ASVS, signed grants/webhooks, cancellation/refund/replay/quota sweeps |
| P2-09 | P2 | Exclusive choices announced as checkboxes | Semantics mismatch (radio group/tab pattern) | **Open**; WAI-ARIA keyboard/screen-reader role tests |
| P2-10 | P2 | Guided Siguiente enabled when handler ignores it; idle diction rung can advance | Control affordance divorced from live state | **Partly patched** guided disable; diction idle behavior OPEN; ready/live/stopped role and click test needed |
| P2-11 | P2 | s17 mic sensitivity irrelevant; score 6.0/10 after 0/4 phases and first-win copy | Shared HUD and self-assessment copy are not keyed to objective completion | **Open**; differentiated descriptive score and completion labeling |
| P2-12 | P2 | Tests can pass by asking production logic for their expected result | Self-oracle `VTApp.wantsSound` and direct DOM repair in test harness | **Partly patched** sound test now uses frozen catalog flags + real checkbox handler; more full user-action tests OPEN |
| P3-13 | P3 | `En vivo · release Flow`; `¡1 días cantados!` | Missing localized mode names, interpolated plural | **Open**; all 40 mode-name and 0/1/2 locale assertions |
| P3-14 | P3 | Historical docs claim 36 exercises despite 47 current | Documentation lag | **Open**, frozen snapshot is authoritative |
| P2-15 | P2 | Static red-team scan flags five `innerHTML` template concatenations in `js/app.js` | Translation/template strings rendered into HTML without uniformly applying text-only sinks | **Triage open**: observed flagged paths at audit lines ~1748, 1939, 1952, 5574, 8476. Several already escape dynamic content; prove source provenance and hostile-payload tests before calling them exploitable or safe |

### Scientific trade-offs that must not be hidden

- YIN-style replacement with spectral off-grid abstention is deterministic on synthetic tones, including dominant third/fourth partials; it **is not proof of calibrated vocal F0 measurement**, especially vibrato, polyphony, room reflections, or ~1400Hz aliases. The 0.6%-of-dominant-power veto can reject some valid multiphonics; a missed pitch is preferable to a confident wrong score, but real-voice benchmarking and tuning are release gates.
- Mapping C0 is better than silently dropping notes or playing wrong labels, but phone speakers may not produce 16Hz and the detector does not score it. The warning is an interim guard; a world-class release should restrict unachievable note targets and personalize the singer's tessitura.
- On tab hide, stopping the entire active take and resetting its visible timer sacrifices uninterrupted background practice; it prevents unearned hidden minutes, stuck microphones and corrupted guided chapters. The user is told to restart. A true pause/resume feature would require coordinated audio/recording/phase checkpoints, not just a countdown pause.
- ESLint complexity limit is 20 for all new code, with **223 explicit, ratcheted legacy exceptions in 60 files**. Making the whole legacy base ≤20 requires substantial refactoring and additional regression coverage; that debt is not disguised as a clean codebase.

## Rounds ledger and next falsifiable acceptance matrix

Five analysis axes were reviewed at representative code/scene level: catalog and pedagogy, mathematical pitch/timing, UI hierarchy and labels, audio/recording architecture, privacy/payment integration. Five adversarial axes were sampled: harmonic/noise inputs, octave limits, frame cadence/background state, misleading enabled controls, test oracle independence. Four visual axes were observed on desktop exemplars: information hierarchy, approximate geometry/fold, available controls, empty-state feedback. **Per-exercise exhaustive five/five/four passes and six live takes are NOT complete.**

For each of 47 exercises, run 6 rounds with independent oracle:

1. Default desktop: real card click → ready/Start/first tick/Stop/reflect/save/back, state and DOM/console checked.
2. Alternative selector matrix: all meaningful modes, progression, challenge and octave boundary values, with before/after audio and canvas pixels.
3. Mobile portrait at 390×844 and narrow 320×640, hit targets, scroll, 200% zoom, labels and sticky bottom rail.
4. Mobile landscape at 844×390 plus keyboard-only/screen-reader semantics, focus order and no clipped controls.
5. Adversarial mic denied/disconnected/silent/noisy; synthetic known pitch, octave/fourth harmonics, vibrato and accompaniment bleed; no false rewards.
6. State transitions: repeated Start/Stop, rapid option changes, hidden tab, refresh, Back, locale switch, saved history and quota/worker failures.

Every round must compare **correct vs deliberately wrong behavior**, e.g. 440Hz→440±15 cents versus a 220Hz mutant; 6s phase after six 1s frames versus a 600ms mutant; C2−2=C0 versus a missing or unshifted-note mutant. Capture first/last state and intermediate changing ticks, wall-clock timestamps, color/state feedback and full browser console; stop on the first failed hypothesis and research the error before revising. This ledger is a gate, not a claim that unperformed sweeps passed.

## Test evidence and release handoff

- `npm run test:signal` includes **14 pitch estimator tests / 2 piano mapping / 3 guided time / 2 deferred microphone race tests**. Prior to patches, pitch tests failed for octaves/noise; 79 shifted notes had no mapping; guided time test failed 6s→0.6s; late permission and double-start tests failed. After patches, all independent checks passed.
- `npm run lint` enforces complexity ceiling with explicit ratchet; `npm run test:catalog` preserves 47 exercises; `npm run test:worker` passed its entitlement suite and `node qa/redteam-static.mjs` exited 0 with five P2 review flags. CI runs the full browser suite on an actual browser host; a green workflow is required before release.
- Playwright locally **not executed successfully** due missing Chromium and download failure; GH Actions candidate CI must provide the browser and run all tests.
- **Release remains blocked** by real mic/device, false-score/feedback, auth/payment, six-round per-exercise live sweeps and Pages SHA verification. No source push alone establishes production readiness.

Research: [original YIN](https://pubmed.ncbi.nlm.nih.gov/12002874/), [librosa YIN reference behavior](https://librosa.org/doc/main/api/generated/librosa.yin.html), [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [MDN rAF background behavior](https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame), [MDN MediaRecorder MIME support](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder/isTypeSupported_static), [NIDCD vocal health](https://www.nidcd.nih.gov/health/taking-care-your-voice), [OWASP ASVS](https://owasp.org/projects/asvs), [Playwright best practices](https://playwright.dev/docs/best-practices).
