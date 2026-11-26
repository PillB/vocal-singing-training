# Phone fit: Detener on the page, pictures whole on a phone on its side — 2026-11-25

Two layout faults from the measurement of 2026-11-23: every exercise (52), on
opening and during a take, at the 80 page sizes of the phones and tablets in
Playwright's device registry (iPhone SE and 11 to 17, Pixel 4 to 9, Galaxy S8,
S9+, S24, A55, Tab and Z, iPads), in Spanish and English: 16,480 measurements.
No sideways scroll and no script error anywhere. The two faults below are what
was left. They were measured again on main `a3d05e3` before this work, with the
same numbers.

## Before editing: observed root cause, routes compared, what was chosen

### Fault 1. Detener goes under the page during a take (song exercise, Spanish)

`s3-song-stanzas`, Spanish, 375x629 (iPhone 12 mini, 13 mini) and 375x635
(iPhone 11 Pro): after Empezar, Detener sits at 614 to 662 px on a 629 px page.
Its centre cannot be tapped until the page is scrolled by about 40 px.

Observed root cause, two things stacked:

1. Before the take the status corner ("Tiempo 20:00") and the tuning readout
   share one row. At Empezar the pill reads "En vivo" (79 px against 69) and
   the readout gains its note ("C3"): 177 + 152 px no longer fit 315, so the
   readout wraps to a row of its own, 35 px. English ("Live", 61 px) still fits.
2. The stage is never shorter than its two rails plus 60 px of lanes
   (`growStageForContent`), so it grows by those 35 px, past the page. Before
   the take Empezar ended 2 px inside the page, by luck. Nothing checks
   Detener: `keepStartOnScreen` returns when Empezar is hidden, and what it
   shrinks, the content floor grows back.

| Route | What an expert would reject | Verdict |
| --- | --- | --- |
| A. During a take, when Detener would end under the page, the coach strip's cue line (the exercise's one fixed sentence, on screen since the exercise opened) is hidden to the eye and kept for screen readers; the stage is fitted again. Frees 53 px of the 35 needed. | The sentence cannot be read again without stopping. The layout differs between two phones of nearly the same size. | **Selected.** The cue is the only thing on the stage that is neither a control nor live: `openExercise` writes it once from the profile. It comes back at Detener. |
| B. Scroll the page to show Detener. | A refit must not move the reader (the fit's own rule); the live status and clock go under the sticky header; `anchorStageTop` would fight it. | Rejected. |
| C. A bottom rail that sticks to the page's bottom edge. | It would cover the lanes it belongs to; a second sticky layer over a sticky stage on iOS Safari is where the earlier VG-30 faults came from. | Rejected. |
| D. Shrink the song panel for good (smaller chips, one row). | Breaks the 44 px tap floor (start-floor), or loses the cue before the take, when it is needed. | Rejected. |
| E. Keep the status and the readout on one row in Spanish (abbreviate "Afinación", or narrow the clock). | Saves exactly the 35 px needed and leaves 2 px; the next longer word breaks it again; abbreviations cost clarity on every phone to fix two. | Rejected as the fix. The guard in A is what makes the layout safe against the next long word. |
| F. Put the Empezar row first in the bottom rail between 501 and 699 px of height. | Changes the rail on the most common iPhones (390x664, 393x659) where nothing is wrong; start-floor chose that order on purpose. | Rejected. |
| G. Drop the cue during every take on a phone, by a media query. | Removes content from phones where it fits. Content yields only where it has to. | Rejected. |

Trade-offs of A, stated: on those phones, in that exercise and language, the
cue cannot be read during the take. The microphone row stays under the page
during a take, as it already is before one (the stage is taller than the page
there). On a 320 px wide phone Empezar is still under the page on opening in
the exercises with the tallest rails (decision cross-01: that page scrolls);
the cue is not hidden before a take, because that is when it is read.

### Fault 2. The picture is cut on a short page on its side

15 to 16 picture exercises (s4, s6, s8, s11, s12, s14, s19 to s26, s28, v12),
both languages: cut by 9 to 15 px at 712x325 and 724x325, 26 to 32 px at
756x308 and 788x308, 41 to 47 px at 802x293; also at 568x320 and 658x320. Whole
at 828x308 and wider, and on every page 340 px high or more.

Observed root cause: on a page 500 px high or less the stage does not grow
(Empezar must stay on the page), and under about 820 px of width the bottom
rail takes two rows (UIB-03). At 802x293 the stage is 228 px: the status row
takes 38 + gaps, the rail 124, and the picture gets 55 px where its own
minimum is 84 plus padding. The status row holds a pill and a clock, 153 px
wide, with about 590 px empty beside it.

| Route | What an expert would reject | Verdict |
| --- | --- | --- |
| N. On a page on its side, a picture starts at the top of the stage, beside the status corner, and the corner stacks its pill over its clock. The rule is CSS (page 500 px high or less, 540 px wide or more, a picture's panel); the script only measures where the corner ends. Frees 44 px; the picture is 100 to 110 px narrower. | The picture loses width. A picture stage on its side looks different from a pitch stage on its side. | **Selected.** Height is the scarce dimension there; the picture's box goes from 13:1 to about 6:1. One rule for every sideways picture stage, nothing switches while practising. |
| N'. The same, but only when a picture is measured as cut. | The layout would flip between opening and the take on one phone (712x327 is cut on opening only), and between neighbours. A measured switch has two looks to test. | Rejected. |
| A'. Fold the octave group away to make one row. | The octave controls exist nowhere else: that removes a function. | Rejected. |
| I. Move the piano settings into the top rail. | Re-parents controls: tab order, selectors and the UIB-03 tests change for every exercise. | Rejected. |
| S. Scale the picture down. | Words under the 12 px floor. | Rejected. |
| G. Let the stage grow on a page on its side. | Pushes Empezar under the page: the fault the 500 px rule exists to prevent. | Rejected. |
| R. A side column for Empezar, the microphone and the piano settings. | The layout a native app would use, and the right long-term answer, but it redesigns the rail UIB-03 settled and every landscape test with it. Not a fault fix. | Rejected for this round; recorded as the follow-up. |

Trade-offs of N, stated: the picture is narrower by the status column (about
100 px of 740; about 100 of 520 on a 568 px page, where a picture shortens its
labels sooner). The cover screens of folding phones (about 320x300) keep
today's layout: beside a status column their picture would be about 100 px
wide, which is worse than a cut one. If anything else ever shows in a picture
stage's top rail, the script leaves the picture under the rail (safe, and the
test below fails).

### Checked against the standing contracts

- Storage, session, sync: untouched. No key is read or written.
- Localization: no new words. The cue keeps its text in both languages; the
  fault itself is a Spanish word 10 px longer than its English one, so both
  languages are in the test.
- Accessibility: the cue stays in the accessibility tree (clipped, not
  `display: none`). No control is hidden, moved in the tab order or made
  smaller than 44 px. Text sizes are unchanged.
- Deployment: `js/app.js` and two stylesheets change, so `npm run assets:bump`.
  A client holding the old script with the new stylesheet keeps today's layout:
  the new rules read values only the new script sets (`data-relief`, `--pic-t`,
  `--pic-l`), with today's values as their fallbacks.

### Predicted failures (compared with what was observed, below)

1. A second fit inside one call could loop or flicker. Predicted safe: relief
   is cleared and applied inside one task, at most one extra fit.
2. Existing landscape assertions that place the panel under the top rail
   (`tests/stage-design.spec.js`, `tests/exercise-viz-stage.spec.js`) may
   fail by design and need the same property stated as "does not overlap".
3. A picture that draws by its box (`js/exercise-viz.js`) may not redraw when
   only its left edge moves.
4. Scenes with their own sideways rules (guided, speech taps, resonance A/B)
   may cut or crowd their buttons in a narrower panel.
5. The cue may not come back after Detener if no fit runs then.

## After the round: predicted against observed

| Predicted | Observed |
| --- | --- |
| 1. A second fit inside one call loops or flickers | Not observed. Relief is cleared and set inside one task; at most one extra fit; no script error in any run. |
| 2. Landscape assertions that place the panel under the top rail fail by design | Observed, two in `tests/stage-design.spec.js` ("the top rail never covers the mode panel's title", "guided: … nothing covers the title"). Both now state the rule itself, that nothing in the rail lies over the title or the picture, and keep "under the rail" where the page is upright. |
| 3. A picture does not redraw when only its left edge moves | Not observed; pictures redraw with their box. |
| 4. Scenes with their own sideways rules crowd their buttons in a narrower panel | Not observed: guided (5 and 6 buttons), placement A/B, speech taps and the ladders are whole at 568x320, the narrowest page. |
| 5. The cue does not come back after Detener | **Observed.** Only a take that ran to the end of its clock got a fit (`setExerciseEnded`); one stopped early got none, so the cue stayed hidden. Fixed: `leaveLivePractice` fits on the frame after a take ends. A stage stopped early now also returns to its opening height; it used to keep the height the take's rails had grown it to. |

Not predicted, found by the new tests:

- `.mode-cue` carries `height: auto !important` and `overflow: visible
  !important` from an earlier fix. The clipped cue stayed one line high, and
  only the deprecated `clip` kept it unseen. The rule now answers with its own
  `!important` and adds `clip-path`.
- The stage opened up to 5 px shorter than its own fit intends, at every size:
  the fits at one frame, 80 and 100 ms run while the view slides up 6 px (css
  `fadeIn`, 0.22 s), so they measure the stage too low. The next fit was
  Empezar, where the stage jumped. On a 293 px page those px were the 2 to 3
  the picture's panel still lacked on opening. Fixed: one fit when the view's
  animation ends.

## Shared-path regression matrix

| Shared path changed | Who else runs through it | Checked by |
| --- | --- | --- |
| `fitHighwayToViewport`, split into `fitStageOnce` plus relief | Every exercise at every size; the piano panel; rotation | `stage-design`, `viewport-overflow`, `fold-regression`, `rail-small-screens`, `rail-landscape-bounds`, `redteam-exercise-language` (a refit never moves the reader); the mutants anchored on its lines (CUR7, S3, S6, S12 to S14) still find them |
| `syncStageInsets` now also sets `data-beside`, `--pic-t`, `--pic-l` | Pitch exercises, whose rail holds more than the status corner | `phone-fit` "not on a pitch exercise on its side"; `mic-hud-layout`, `bottom-rail` |
| `setPracticeUI(false)` now fits | Every Stop: the review card, the rating, a routine's next step | `exercise-viz-stage` (after Stop), `finish-rating`, `redteam-exercise-take`, `daily-session` |
| The rail observer also watches the status corner | Every exercise | `phone-fit` "a longer status word" |
| A fit when the exercise view's animation ends | Every exercise opening | `phone-fit` "resting height"; the specs above, which had been fitting by hand after opening |
| css: the cue's relief; the corner stacked beside a picture | The other nine pitch exercises; all 40 picture exercises; a routine on its side | `phone-fit` (every pitch exercise at two sizes in two languages; every picture at four sizes on opening and one during a take), `stage-design` "guided: one header row" |

## Simulated drift

- A status word longer than today's two: the picture moves over (`phone-fit`,
  mutants PH9, PH10).
- Something new in a picture stage's top rail: the script withdraws
  `data-beside` and the stage is laid out as before this design (PH11, PH15).
- The song exercise leaves the catalogue: the test fails saying which
  exercise to use instead. Every other list is read from the catalogue at run
  time, so a new exercise is covered and a removed one breaks nothing.
- A stale script with the new stylesheet, or the reverse: today's layout. The
  new rules need attributes only the new script sets, and the new script's
  attributes do nothing without the new rules.
- A browser without `:has()` (before Safari 15.4, Firefox 121): the sideways
  rule is ignored and the picture stays under the rail, as today.
- Storage, sync and older clients: nothing persisted, so nothing to merge.

## What this does not cover

- The cover screen of a folding phone (about 320x300): a picture still gets
  about 12 px there. It needs a layout of its own.
- A 320 px wide phone: Empezar is still under the page on opening in the
  exercises with the tallest rails (decision cross-01).
- The follow-up worth doing: a side column for Empezar, the microphone and the
  piano settings on a phone on its side (route R above).
- Every measurement is in Chromium at the page sizes of real phones. No
  physical phone was used.
