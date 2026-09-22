# The tour, the user guide, and the A/B machinery behind them

**Date:** 22 September 2026
**Code:** `js/tour.js`, `js/experiments.js`, `js/experiments-config.js`, `guide.html`, `css/styles.css`, `js/i18n.js`, `js/app.js`, `index.html`
**Scope:** onboarding and documentation only. No exercise, audio, scoring, billing or account behaviour was changed.
**Tests:** `tests/tour-geometry.spec.js` (new, 10 cases), `tests/tour-behaviour.spec.js` (new, 25 cases), plus guide cases added to `tests/max-effort-journeys.spec.js`, `tests/viewport-overflow.spec.js` and `tests/live-pages.spec.js`.

The site had a tour that described a home page deleted in the September
redesign, and no written documentation of any kind. This is what was measured,
what changed, and what was deliberately left alone.

---

## What was actually wrong

Everything below was measured in Chromium at 1280×800, 390×844 and 320×640
before anything was changed, not inferred from reading the code.

| # | Defect | Measurement |
|---|---|---|
| 1 | Step 4 pointed at `.continue-toolbar`, an element deleted in the redesign | No such node in `index.html`. The step silently vanished, so the counter read "Paso 1 de 11" over a twelve-step list, and the guided session — the one thing the redesign added — was never mentioned |
| 2 | The tour opened on the exercise catalog | The catalog now sits below the fold on a cold visit. The start panel and its recommended-exercise button, which the page is built to present, had no step |
| 3 | The popover covered the thing it was explaining | The play-mode step was at **100% coverage** of its own target on desktop. Nine steps overlapped their target somewhere in the three viewports |
| 4 | The backdrop painted over the highlighted element | `.tour-backdrop` kept its dim while the spotlight ring was drawn, so the element being pointed at lost about two thirds of its brightness — the ring framed a *darker* patch |
| 5 | The tour could not scroll | `body.tour-active { overflow: hidden }` meant **every `scrollIntoView` the tour made was a silent no-op**. Proved by driving it: `scrollY` 6 → 6 across a step change that asked for a target 900px down |
| 6 | The phone card collapsed to 209px | `width: auto` with only `left` pinned. 209px of a 390px screen, and it was the first thing a mobile visitor saw |
| 7 | The hold pack was unreachable | `detectUiFamily` answers `"highway"` for all eight pitch exercises that show a hold readout, so the `hold` pack had never run for anybody since it was written |
| 8 | Skipping was recorded as finishing | One flag for both. Skipping the home tour also marked the per-screen coach-marks as seen, so declining the tour silently declined everything else too |
| 9 | Enter was hijacked | The global key handler advanced the tour on Enter even when focus was on Skip, so keyboard users could not skip |
| 10 | `#btn-ui-help` was 32×32 | Below the repo's own 44px phone floor. `qa/capture-mobile.mjs` never saw it because it is inside a view the capture does not open |
| 11 | `data-i18n-aria` was inert | Five landmark and tab labels carried the attribute; nothing applied it, so they stayed Spanish in the English UI |
| 12 | The route label lied | "Completa" is 16 of Canto's 27 exercises. Nothing said so |
| 13 | The microphone was requested with no warning | On a pitch exercise a *denied* microphone looks like success: the piano plays, the highway scrolls, and only the voice line is missing. The denial is then only undoable in browser settings |
| 14 | No written documentation existed | Not a page, not a README section, nothing. Everything a user could not guess was only in the code |

---

## The tour, rebuilt

`js/tour.js` went from 765 to 1100 lines. The public contract is unchanged —
`#tour-root`, `.tour-card`, `body.tour-active`, the `[data-tour-*]` hooks and
the `window.VTTour` surface all still exist and still mean the same thing — so
nothing else in the app had to move.

**Four steps, not twelve.** Welcome, the next-step card, the guided session,
and the header. All four are on the first screen of a cold visit, so the tour
never has to scroll to explain the home page. Everything that used to be said
about the practice screen moved into the per-screen coach-marks, which is where
it can actually be seen.

**Placement is now searched, not assumed.** `placeCard()` tries bottom, top,
right and left in order and rejects any candidate that overlaps its target or
leaves the viewport, measuring the card *after* its copy has been written so
the box is the real one. Coverage is now 0% on every step in all three
viewports except the two whose target is physically larger than the viewport,
where no placement exists — and the test proves that claim by replicating the
four candidate boxes rather than exempting by a guessed size.

**The spotlight cuts a real hole.** `body.tour-spot-on` removes the backdrop's
dim while the ring's own outer shadow does the dimming, so the highlighted
element is the brightest thing on screen. A target taller than 60% of the
viewport is not ringed at all — a "highlight" round most of the screen points
at nothing.

**Phones get a sheet.** Below 520px the card is pinned to both gutters and sits
at the bottom, flipping to the top (`.tour-sheet-top`) when the bottom would
cover the target. `body.tour-active` now uses `overscroll-behavior: contain`
instead of `overflow: hidden`, which is what made scrolling possible at all.

**It no longer rearranges the page behind you.** `openSample()`, which switched
track and tier and left them switched after the tour ended, is gone. A walk
through the tour now leaves the page in the state it found it.

**Accessibility.** A 44px close button; focus moves to the step heading rather
than a Next button whose label never changes; the rest of the page is `inert`
while the tour runs, and inert is lifted *before* the focus trap releases, or
focus cannot return to the button in the header that opened it; Enter is no
longer taken from a focused Skip; scrolling respects
`prefers-reduced-motion`.

**Both languages, live.** `VTI18n.onChange` now re-renders an open tour, so
switching language mid-tour no longer leaves the step in the old one.

### The microphone primer

`startPractice()` now intercepts the first microphone request on any exercise
that wants one and shows `#mic-primer` first: what is about to be asked, what
it is for, and that the audio never leaves the browser. Accepting continues
into the exercise; declining leaves you on the exercise with Start still there.
Either answer sets `vt_mic_primed_v1`, so it is asked exactly once.

It is suppressed under automation by the same gate as the tour (a headless user
agent, `vt_e2e`, or `?e2e`). That is load-bearing: twelve existing specs press
Start without setting `vt_e2e` and rely on the user-agent half of that check.
The primer's own tests set a real Chrome user agent at the context level
instead of weakening the gate.

---

## The written guide

`guide.html` is 14 sections in Spanish with an English twin of each, one file,
no JavaScript, reachable from the footer of every page and from a link in each
tour step. It documents what a user cannot work out by looking:

- **The pitch highway's whole vocabulary** — green primary lane, amber active,
  grey dashed ghost, lane height = ±35 cents, the blue precision ribbon, the
  800ms lock ring, and the 65–400 Hz detector range that is why a very high
  soprano or a very low bass sees nothing.
- **What each number means**, including the ones whose names do not explain
  them.
- **Which exercises need the microphone and which do not**, and what a denied
  microphone looks like — because it looks like success.
- **Where the data lives**, matching `privacy.html` rather than restating it.
- **A "things that confuse people" section** written from the defects found in
  this pass and the earlier forensics documents.

It is deliberately a static page and not a modal: it is linkable, printable,
findable by search, and survives a JavaScript error on the app.

---

## Versions and the A/B decision

`js/experiments.js` (168 lines) is a complete client-side assignment layer:
stable per-browser bucketing by FNV-1a over `experiment:clientId`, one
exposure event per experiment per browser, `?ab_<key>=<variant>` forcing for
looking at a variant deliberately, and `VTExperiments.report()` for reading
the result back out of the local ring buffer.

`tour_shape_2026_10` is defined with two arms — `invite` (the start panel
offers the tour) and `auto` (it opens itself) — **and is disabled.** With it
disabled every browser deterministically gets `invite`.

That is a decision, not an omission. Detecting a realistic 5-percentage-point
difference in tour completion at 80% power and 95% confidence needs on the
order of **1,570 browsers in each arm, about 3,140 in total**
(`n = 2(z₀.₉₇₅ + z₀.₈)² · p(1−p) / δ²` at `p = 0.5`, `δ = 0.05`). This site does
not have that, and will not have it soon. At the traffic it does have, the only
effects a test could resolve are ones so large you would not need a test to see
them. Running the experiment anyway would produce a number that looks like
evidence and is not. There is also an honest limit written into
`js/experiments-config.js`: with no analytics endpoint configured, exposures
and outcomes stay in each visitor's own localStorage and never reach anyone, so
there is nothing to aggregate even if the sample existed.

What ships instead is the machinery, working and dormant, so that the day
traffic or an endpoint exists it is a one-line change — and
`?ab_tour_shape_2026_10=auto` today, which is how both versions can be looked
at side by side.

---

## What was deliberately not changed

| Thing | Why not |
|---|---|
| `#btn-tour` is 54×36 on desktop | WCAG 2.2 AA's minimum is 24px, which it passes; the repo's 44px floor is a phone rule and is met at 390px. Raising the desktop size risks `fold-regression.spec.js`, which measures the header |
| Inline prose links in `guide.html` are below 44px | WCAG 2.2 explicitly exempts targets inside a sentence. Padding them out would wreck the line spacing of a document meant to be read |
| `detectUiFamily`'s `"hold"` branch still exists | It is part of the exported contract. The hold *steps* were folded into the highway pack, which is the pack those exercises actually get |

---

## Found here, and left for a separate change

Three defects were found while walking the flows for the guide that this change
does not fix, because they are `js/app.js` and `js/metrics.js` bugs with their
own blast radius and would make a documentation change unreviewable. They are
filed as VG-27, VG-28 and VG-29 in
[VALUE-GAP-REGISTRY.md](VALUE-GAP-REGISTRY.md):

- **VG-27 — a guided session can save nothing.** `#btn-next-structured` calls
  `VTSession.markCurrentComplete()`, which writes only the session row.
  `shouldPromptOnLeave()` returns false under 10% of the exercise target, so a
  learner doing short runs can finish an entire guided session with
  `vt_progress_v1` still `null`. This is the serious one: real work completed,
  nothing recorded, no warning.
- **VG-28 — "Save" focuses an invisible button.** `leaveExercise()`'s save path
  calls `stopPractice(true)`, the silent variant, which skips the
  `openMetricsPanel(true)` a normal stop performs; it then focuses
  `#btn-complete` and says "review the metrics and tap Save session" while the
  card may still be collapsed. The `#btn-next-structured` path does open the
  panel, so the fix is one line.
- **VG-29 — the score screen is English in the Spanish UI.**
  `VTMetrics.score()` hard-codes all four `summary` bands, the `how`
  explanation, `"Not rated"`, `"Not logged"`, `"(lower is better)"` and
  `"target"`.

The work in *this* change is filed as VG-24 (the tour), VG-25 (the guide) and
VG-26 (the microphone primer).

---

## The browser pass, and what it found

Everything above was written, tested and merged. Then all eight flows were
driven again in a real Chromium with a genuine Chrome user agent — not the
headless agent the suite uses, which the tour deliberately hides from — and
every finding was re-reproduced independently before it was believed. Of 29
raised, **28 confirmed and 1 refuted**.

The test suite had not caught any of them, and it is worth being precise about
why: every one is a question the specs were not asking. The geometry spec
proves the card does not cover its target; nothing asked what happens when you
*touch* the target. The behaviour spec proves the primer appears; nothing asked
whether what it says is true of the exercise it appears on.

**The one that mattered, VG-31 — the spotlight was a trap.** The tour draws a
ring around the thing it is describing, which is an invitation to touch it.
Touching it closed the tour. `.tour-backdrop` covers the hole in the dim and
`.tour-highlight` carries `pointer-events: none !important`, so the lit element
can never receive the click; it lands on the backdrop, which called
`end("skip")`. That writes `dismissed`, and `dismissed` also suppresses every
per-screen coach-mark on the site. So the single most inviting pixel on the
screen silently declined all of the product's onboarding, with no way back
except a header button the tour had not explained yet. On a 390px phone the dim
is about 64% of the screen, so it was easy to hit without meaning to at all.

Now a click inside the ring advances the step — which is what the gesture meant
— and a click on the dim does nothing. Leaving is Skip, the close button or
Escape: three deliberate acts, none of them a stray tap.

**VG-32 — every link into the guide landed under the header.** All 40 contents
links, every inline cross-reference and all four of the tour's "full guide"
links. `.app-header` is sticky at ~74px and no heading had `scroll-margin-top`,
so `document.elementFromPoint()` at each heading's position returned
`.app-header`. You arrived mid-paragraph, in both languages.

**VG-33 and VG-34 — the primer was wrong, then rude.** One string was shown for
all 45 microphone exercises: the piano keeps playing, only the pitch readout is
lost. That is false for 23 of them, `v1-diction` among them — which is the
exercise the home page's own first-practice button opens. So the first sentence
the product says to a new user was about a screen they were not looking at.
Worse, answering "Ahora no" abandoned the `startPractice()` they had just
pressed and said nothing, while still setting `vt_mic_primed_v1` — so the
primary button of the product did nothing the first time it was pressed and
something different the second. The copy is now chosen by
`exerciseWantsSound()`, and declining says what it did.

**VG-35 and VG-36 — the English site was not English.** `renderTourInvite()`
returned early when the row already existed, so its four phrases kept whatever
language the page first loaded in, and the site defaults to Spanish. Nine
controls carried hard-coded Spanish `aria-label` and `title` text, so a blind
English user heard "Bajar una octava". And because `guide.html` holds both
languages in one file, every bare `guide.html` link landed an English reader on
the Spanish half.

### Two measurements worth keeping

**The phone card was positioned from a scroll position that had not happened
yet.** Stepping *backwards* on a 320px screen parked the card on top of the
control the step was describing — 70% and 55% coverage on two steps. The
placement code measured, scrolled, and re-measured to score each candidate. But
`window.scrollY` in this Chromium does not update until the next frame: a probe
that calls `window.scrollBy(0, 150)` and reads `scrollY` immediately gets `0`,
and `150` about 300ms later. So every re-measurement read the *pre-scroll*
position, scored both candidates as failures, and kept the first one tried. The
fix is to stop reading and start predicting: the post-scroll geometry is
computed from the target's document offset and the clamped scroll target, and
nothing is measured after a scroll. Coverage is 0% on all four steps, both
directions, at 390×844 and 320×640.

**The home page grows under you, and the browser moves you with it.** While
testing the restore, a measurement 300ms after load said `scrollY` was 662 and
the document 1462px; a moment later, with nobody touching anything, `scrollY`
was 933 and the document 2368px. The lower sections render lazily and
Chromium's scroll anchoring keeps the visual position steady by moving the
scroll offset. Any test that scrolls and then measures has to let that settle
first, or it compares two different pages.

Ten more findings of the 28 were small: the last step pointing at the same
guide section as the first, an auto-started tour reopening on every reload, a
forced `?ab_` view spending the browser's one exposure. They are VG-31 to VG-39
in [VALUE-GAP-REGISTRY.md](VALUE-GAP-REGISTRY.md).

**What was found and deliberately not fixed** is VG-40: the saved-sessions list
is untranslated and its count placeholder reads `sesion(es)`, and a microphone
denied mid-session leaves the session bar up with no control that advances it.
Both are pre-existing `js/app.js` behaviour with their own blast radius, which
is the same reason VG-27 to VG-29 were left alone.

---

## Verification

```bash
# serve the site
python3 -m http.server 8765

# the two new specs — 35 cases across 1280x800, 390x844 and 320x640
npx playwright test tests/tour-geometry.spec.js tests/tour-behaviour.spec.js --reporter=line

# the guide's smoke cases inside the existing suites
npx playwright test tests/viewport-overflow.spec.js -g "user guide" --reporter=line
npx playwright test tests/max-effort-journeys.spec.js -g "guide" --reporter=line

# the phone tap-target and text-size gate — must print "Total: 0 issue(s)"
npm run test:mobile

# the published guide, after a deploy
LIVE_PAGES=1 npx playwright test tests/live-pages.spec.js -g "user guide" --reporter=line

# look at the auto-start variant without enabling it for anyone
open 'http://127.0.0.1:8765/?ab_tour_shape_2026_10=auto'
```

`npm run test:mobile` never sets a non-zero exit code, so its output has to be
read — grep for `Total: 0 issue(s)`.
