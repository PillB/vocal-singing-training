# Reliability & QA (vibe-coded SPA)

Client-only GH Pages app. Prefer **fail visibly**, **idempotent Start/Stop**, and **Playwright journey gates** over “looks fine” confidence.

## Known failure modes (and defenses)

| Mode | Symptom | Defense |
|------|---------|---------|
| Closed / suspended `AudioContext` after mic | Silent piano | Shared `VTSharedAudioCtx`; PracticeEngine never closes piano ctx; `ensure()` recreates if `closed`; `unlock()` on Start gesture |
| Rapid option flips | Race stopAll vs schedule | `applyPianoOptionsHot` serializes via `_hotApplyPromise` |
| Empty catch / silent fail | UI “En vivo” without sound | Toasts on piano fail; `outputPeak` / `isLive` probes; audio regression suite |
| Catalog regression | Missing exercises | `qa/check-catalog.mjs` + `tests/catalog-regression.spec.js` |
| Layout collisions | Overlapping HUD | Fold/geometry QA + less-scroll locks |
| Secrets in repo | Leaked passwords | Gitignored `INTERNAL-TEST-ACCOUNTS.md`; hashes only in repo |
| Client auth bypass | Soft gate only | Documented in `11-AUTH-AND-HARDENING.md` — not production multi-tenant |

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
npm test                      # catalog check + all Playwright
npm run test:geometry         # AABB HUD forensics (optional after CSS)
```

## Change method

1. Reproduce + RCA (call graph: `startPractice` → mic → `startExerciseSound` → `playProgression`)  
2. Minimal fix; watch blast radius (speech modes must not require piano)  
3. Targeted test → full suite → deploy  

## Deploy gate

- All Playwright green  
- No secrets in commit  
- `main` pushed; GH Pages status `built` for the commit SHA  
