# 33 — The practice stage could settle past the bottom of a short screen

**Date:** 2026-09-21
**Code:** `js/app.js`, `tests/viewport-overflow.spec.js`
**Scope:** opening an exercise, on any viewport; visible damage on short ones

## Symptom

`tests/viewport-overflow.spec.js` › *viewport phone-land 844x390 › pitch
exercise: stage + start stay inside viewport* failed once in a full run: the
stage's bottom measured 399.9 against a 390px viewport. For a user on a phone
held sideways that is the Start button hanging off the bottom of the screen.

It reproduced in no targeted run — 24 attempts across two commits, including at
six workers under deliberate CPU load, all green. It only ever appeared inside
the full 264-test run, which is the tell: it is a race, and it needs the machine
to be busy.

## Cause

`css/styles.css:40` sets `html { scroll-behavior: smooth }`, which applies to
programmatic scrolls, not only to user ones. `openExercise()` then did:

```js
// Instant jump to top so game stage is the first viewport (no smooth lag)
window.scrollTo(0, 0);
requestAnimationFrame(() => { window.scrollTo(0, 0); fitStageBelowContent(); });
setTimeout(() => { fitStageBelowContent(); /* … */ }, 80);
```

The comment states the intent and the CSS defeats it: a bare `scrollTo` animates
over a few hundred milliseconds. `#highway-stage` is sticky, so its top keeps
moving for the whole of that animation, and `fitHighwayToViewport()` sizes the
stage from `getBoundingClientRect()` — a position the stage is still travelling
through. When the scroll lands, the stage sits lower than the height it was
given, and its bottom crosses the viewport edge.

Instrumenting one open at 844×390 before the fix, with the page otherwise idle:

| moment | scrollY | stage top | stage bottom |
| --- | --- | --- | --- |
| after first fit | 67 | 92.0 | 378.0 |
| after second fit | 5 | 109.9 | 377.9 |
| at measurement | 0 | 114.9 | 382.9 |

The bottom drifts 5px on an idle machine. The failing run drifted about 17.
Nothing here is load-dependent except *how far through the animation each
measurement lands*, which is exactly why load decides whether it fails.

The same drift made the fit non-idempotent: calling it a second time after the
scroll settled shrank the stage another 5px, because the first call had sized it
against the wrong origin.

## Fix

Two scrolls that exist to feed a measurement now say so, and nothing else
changes:

- `openExercise()` uses `window.scrollTo({ top: 0, left: 0, behavior: "instant" })`.
- the anchor guard inside `fitHighwayToViewport()` uses
  `scrollIntoView({ block: "start", behavior: "instant" })` for the same reason.

Every other `scrollIntoView` in the codebase is a user-facing scroll where the
animation is wanted, and all of them are left alone.

After the fix the same instrumentation reads `scrollY: 0`, top `114.9`, bottom
`377.9` at every one of five sampling points, and four further fits leave the
height unchanged at 263px. The measurement is stationary, so the fit is right the
first time and idempotent after.

## Test

`viewport-overflow.spec.js` gained *"opening an exercise lands at the top and the
stage stays put"*, per viewport. It opens the exercise the way the app does, with
no corrective `scrollTo` from the harness — the old helper's own `scrollTo(0, 0)`
was masking this — then asserts the page is already at the top, and that the
stage's bottom is both inside the viewport and unchanged 400ms later.

Without the fix it fails on all three short viewports (`window.scrollY` reads 246
at 320×640 where 0 is required). With it, all 21 tests in the file pass.

The helper split is the only change to existing test code: `clickPitchExercise()`
now holds the click, and `openPitchExercise()` is that plus the corrective scroll
and fits the original tests relied on. Those tests are otherwise untouched.
