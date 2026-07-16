# Reliability & QA (vibe-coded SPA)

Client-only GH Pages app. Prefer **fail visibly**, **idempotent Start/Stop**, and **Playwright journey gates** over “looks fine” confidence.

## Known failure modes (and defenses)

| Mode | Symptom | Defense |
|------|---------|---------|
| Closed / suspended `AudioContext` after mic | Silent piano | Shared `VTSharedAudioCtx`; PracticeEngine never closes piano ctx; `ensure()` recreates if `closed`; `unlock()` on Start gesture |
| Double-click Empezar / leave during Start | Zombie live audio | `practiceGen` token + `practiceStarting` disables Start until settle; Stop bumps gen |
| End structured while live | Mic/piano on home | `endStructured` always `stopPractice` + piano stop |
| Leave → Save then metrics | Destination forgotten | `pendingLeave` honored after `completeExercise` |
| Rapid option flips | Race stopAll vs schedule | `applyPianoOptionsHot` serializes via `_hotApplyPromise` |
| Empty catch / silent fail | UI “En vivo” without sound | Toasts on piano fail; `outputPeak` / `isLive` probes; audio regression suite |
| Catalog regression | Missing exercises | `qa/check-catalog.mjs` + `tests/catalog-regression.spec.js` |
| Layout collisions | Overlapping HUD | Fold/geometry QA + less-scroll locks |
| Secrets in repo | Leaked passwords | Gitignored `INTERNAL-TEST-ACCOUNTS.md`; hashes only in repo |
| Client auth bypass | Soft gate only | Documented in `11-AUTH-AND-HARDENING.md` — not production multi-tenant |
| Fixed mid-male octave for all singers | Targets unreachable → strain / zero hits | `VTRangeAdapter`: voiced + directed pitch attempt + plateau ≥5 semi short → ±1 oct (max ±2); manual −/+; Auto toggle; 10s cooldown |
| Silence mistaken for “can’t reach” | Spurious octave thrash | Require RMS + pitch + motion toward target (not grace-only / no sound) |
| Missing note freqs after ±oct | Silent shifted piano | `NOTE_FREQ` chromatic C1–C6; `VTTransposeProgression` / `playProgression({ octaveShift })` |
| Highway vs piano desync after shift | Lanes in old octave | `lockHighwayForProgression/Notes` always apply `state.octaveShift`; hot-apply restarts loop |

## Adaptive vocal range (competitors + design)

- **Yousician**: calibrate range + song transpose — we continuous-adapt mid-practice + manual ±oct.
- **Sing Sharp**: personalise to measured range — we infer edges from plateau short of target while trying.
- **UX**: bottom-rail `− | 0 | + | Rango`; toast on auto shift; prefs in `localStorage` (`vt_octave_shift`, `vt_range_auto`).

```bash
npx playwright test tests/range-adapter.spec.js
```

```js
VTGetOctaveShift()                 // −2…+2
VTApplyOctaveShift(1)              // raise material one octave
VTApp.getRangeSnapshot?.()         // auto / pending / session min·max midi
```

## Health checks (console / e2e)

```js
// After Start on a piano exercise:
VTPiano.ctx?.state          // expect "running"
VTPiano.loopActive          // true when looping progression
VTPiano.playing?.length     // > 0 when voices scheduled
VTPiano.outputPeak?.()      // > ~0.01 when audible
VTApp._hotApplyPromise      // await after option changes
```

Set `sessionStorage.vt_e2e = "1"` for Playwright (suppresses global error toasts).  
Set `sessionStorage.vt_debug = "1"` to re-enable toasts during e2e debug.

## Test commands

```bash
npm run serve                 # :8765
npm run test:catalog          # inventory freeze
npx playwright test tests/audio-regression.spec.js   # piano + hot-apply matrix
npx playwright test tests/full-journey.spec.js       # every exercise Start + flows
# All 36 exercises × Empezar × master-bus peak (repeat N rounds):
VT_SOUND_ROUNDS=5 npx playwright test tests/sound-all-exercises.spec.js
npm test                      # catalog check + all Playwright
npm run test:geometry         # AABB HUD forensics (optional after CSS)
```

### Sound contract (per exercise)

| Kind | Expect on Empezar |
|------|-------------------|
| `profile.autoPiano` + Auto checked | Piano/ref/progression audio |
| Speech / air-only (e.g. `s15-sh-air-ladder`) | Live practice; **no** piano required |
| `weekPlan` | May open plan UI without live mic |

**Auto piano checkbox** defaults from `profile.autoPiano` only (not merely “can make sound”). Piano mini still shows when `audio.piano` / progressions exist so user can enable.

### Feature matrix (all 36 exercises)

Playwright: `tests/exercise-features.spec.js` asserts for each exercise:
- Registered mode + non-empty title + Start  
- `showPitch` ↔ pitch block + game HUD  
- `showHold` ↔ hold display  
- `pitchChallenge` ↔ challenge row  
- Chord/song + piano data ↔ progression bar  
- Non-pitch modes ↔ mode-focus/mode-hud content  
- Start goes live; sound when Auto on and wants piano  

Do **not** infer piano from mode name alone (`shAirLadder` is unvoiced air).

## Change method

1. Reproduce + RCA (call graph: `startPractice` → mic → `startExerciseSound` → `playProgression`)  
2. Minimal fix; watch blast radius (speech modes must not require piano)  
3. Targeted test → full suite → deploy  

## Cross-browser audio (Chrome / Safari / Firefox / Edge / Opera / mobile)

| Engine | Covered by | Notes |
|--------|------------|--------|
| Chrome / Edge / Opera | Playwright `chromium` (+ Chromium mobile) | Blink; standard AudioContext |
| Firefox | Playwright `firefox` | Progressive getUserMedia fallbacks |
| Safari / iOS | Playwright `webkit` + `mobile-safari` | `webkitAudioContext`, `interrupted` state, visibility resume, safe gain ramps |
| Android Chrome | `mobile-chrome` project | Same Blink path |

**Hardening in `js/piano.js` / `js/practice-engine.js`:**
- Shared context + never close on Stop  
- `unlock()` buffer + oscillator prime; resume on `visibilitychange` / `pageshow` / pointer  
- Safe exponential gain (never ramp to 0 — Safari mute bug)  
- getUserMedia constraint cascade → `{ audio: true }`  

```bash
# All engines in playwright.config.js projects:
npx playwright test tests/cross-browser-audio.spec.js
# Single engine:
npx playwright test tests/cross-browser-audio.spec.js --project=webkit
```

## Deploy gate

- All Playwright green (at least chromium; ideally webkit + firefox for audio)  
- No secrets in commit  
- `main` pushed; GH Pages status `built` for the commit SHA  
