# Forensic audit of every exercise — 2026-11-02

**Scope:** all 47 exercises of the branch build (PR #23), each opened and
driven six ways by `qa/audit/forensic-audit.mjs`, plus the side pages
(privacy, guide). Findings come from `qa/audit/analyze-audit.mjs`; every fix
below has a test that is red on the code before it, and a planted defect
(`qa/mutate.mjs`) that the test kills.

## Method

For each exercise the driver records, on a 1280 × 800 desktop and a
360 × 780 phone:

1. **Default run:** mouse Start, the mode's synthetic voice for 8 s, mouse Stop.
2. **Keyboard run:** Tab to Start, Enter; Escape or Enter to stop.
3. **Boundary run:** a silent microphone, then steady unpitched air. No count
   may rise.
4. **Interruption run:** double Start (one microphone, not two), Back mid-take
   (the leave prompt must ask; Stay keeps the take), tab hidden.
5. **Phone run:** 360 × 780 touch, the default run, screenshots before and after.
6. **Replay run:** run, Back, reopen: the second open starts clean.

Each run keeps a 500 ms tick timeline of what a learner sees (status, HUD,
cue, pitch, toast), console errors, analytics events and getUserMedia calls.
A Z-order inventory lists every visible control and text leaf in reading
order (rows top to bottom, left to right) with its box, fold state, target
size, what sits on its centre, and an approximate contrast. The keyboard
focus path is walked twice round (45 Tab presses) with what covers each stop.

## Round 1 ledger and what was wrong with the instrument

The first full run (6 × 47, no crash, no uncaught exception, no microphone
left live, every leave prompt asked) produced 153 findings. Reading them
against the screenshots, 114 were the audit misreading the page, not the page:

| Finding | Count | Truth | Probe fix |
|---|---|---|---|
| "on" target 13–20 px | 106 | Checkboxes inside 32–44 px labels ("A mi voz", "Grabarme"). A label activates its control, so the target is the label (WCAG 2.5.8). They were also named by their value, "on". | Target = control or a visible label ≥ 24 px; name = label text |
| Clipped text | 8 | Screen-reader-only live regions (1 × 1 px, clipped on purpose) | Boxes ≤ 1 px are not on screen |
| "Tab stop is covered" | 17 → 22 | Real, but unactionable: the coverer was not recorded | The coverer is named |
| Weekly plan "Start did not start" | 2 | The 12-week plan has no Start: it is a schedule | Skipped for `weekPlan` |
| v17 counts rose on silence | 2 | By design: the concision gate opens on the 2.5 s thinking pause itself; the answer is timed after it | Exempt, with the reason in code |

Each probe rule has a positive and a negative control in
`tests/audit-probes.spec.js` and `tests/node/analyze-audit.test.mjs`, and five
mutants (`node qa/mutate.mjs audit`): a label no longer counting, any label
excusing any box, a checkbox named by its value, a covered control reported
as itself, a live region counted as clipped.

## Round 2 ledger (the fixed build)

The same 6 × 47 run on the fixed build gave 18 findings, none a crash:
12 phone titles cut with "…" (accepted below) and 6 covered Tab stops. The 6
were an artefact of the run, not the page: the stylesheet was edited while the
audit was reading it. Re-running those seven exercises on the final stylesheet
gives no finding. (Lesson kept in the driver's header: do not edit served
files during a run.)

## Real findings and their root causes

Ranked by how much a learner loses.

### T1 — The way back is hidden right after Stop (phones)

**Seen:** the phone screenshot after Stop read
`← Pra[■ Ladder approx.: 100% · 1 min]Help`. The toast sat centred under the
header, which in an exercise is the row holding ← Back and Help; at 320–390 px
it covered both for its whole life, the moment leaving is likeliest.
**Root cause:** the toast's place was chosen for the home screen (under the
header, never over the main nav) and never revisited when a second sticky row
appeared under the header in exercises.
**Fix:** in an exercise the toast takes the title's place between ← Back and
Help, two lines at most (so it ends above the stage's strip); the title fades
while it is up and is still read by screen readers. Toasts stay
`1,5 s + 50 ms per character` (2,8–8 s): 58 characters of numbers could not be
read in 2,8 s. The take's summary is also kept in the rating card
("Esta toma: …"), so nothing is lost when the toast goes.
**Tests:** `tests/toast-placement.spec.js` (red on the old build: Back covered
at every phone width, out of the row on desktop, gone at 2,8 s; the number of
red cases was stated here before and did not reproduce, QA FAL-07, so none is
claimed now).

### T2 — Keyboard focus lands under the sticky rows (22 stops, 17 exercises)

**Seen:** after Tab had gone round once and scrolled the page, "Siguiente →"
ended under the exercise title and the chord menus under "Practicar".
**Root cause:** the browser scrolls a focused control just into the window,
which is under the sticky header and ← Back row; nothing told it those rows
cover the top. WCAG 2.2, 2.4.11 Focus Not Obscured (Minimum).
**Fix:** `scroll-padding-top` on the app page (header, plus the ← Back row in
an exercise; both heights are already measured by `js/app.js`). The browser
keeps focus clear of that band. The guide and privacy pages keep their own
margins (no script measures their header).
**Tests:** `tests/focus-not-obscured.spec.js`: two full Tab rounds (at most 90
presses) in four exercises, a speech and a singing one of each kind, at 1280 and 390 px; red on the old build (the count of covered stops stated
here before did not reproduce, QA FAL-07, so none is claimed now); a control
proves the walk sees a covered stop.

### T3 — The mic slider lies on the octave buttons (v12, 1280–1440 px)

**Seen:** melodic speech shows seven piano options beside Start and the mic.
The slider's thumb sat on the octave "−" and the value "7" on "0 octava".
**Root cause:** the bottom rail was a single row that could not wrap, so the
mic box shrank to its `10rem` floor while its slider and value did not, and
the rail let children overflow.
**Fix:** the rail wraps when its controls do not fit (the stage already reads
the rail's height for the lanes). I first also gave the mic box a
content-width floor; a planted defect showed the wrap alone is what holds the
test, so the floor was removed rather than kept untested.
**Tests:** `tests/bottom-rail.spec.js`: every exercise at 1180, 1280 and
1440 px; red on v12 at all three; a planted overlap proves the check sees one.

### T4 — "Reto" was a 13 px target (s9 desktop)

**Fix:** the label is at least 24 px tall. **Test:** `tests/target-size.spec.js`
walks all 47 exercises at desktop and phone with the audit's own probe; red on
the old CSS.

### T5 — Privacy page structure

Three `h1` (site name, Spanish title, English title); the English half was
read with Spanish rules (no `lang="en"`, WCAG 3.1.2); the "English" link
landed under the sticky header. **Fix:** one `h1`, the English half a
`<section lang="en">` with an `h2`, the site name a `p` that the phone header
rule does not hide, a scroll margin on the English title.
**Tests:** `tests/page-headings.spec.js` (privacy and guide, 360 and 1280 px).

### T6 — Lost audio guessed from late frames (onsets, s12)

Found while reviewing the shared envelope, not by the ledger. s12 called an
onset "not measured" when a frame came more than 6 ms late, whether or not
audio was lost, and measured onsets whose audio was lost on frames that came
on time. The envelope now knows exactly (`lostSince(from, to)`); s12 uses it
and keeps the late-frame guess only for a capture that cannot tell. The
caption names the real cause ("the page stalled and missed part of it").
**Tests:** two new cases in `tests/node/attack-rise.test.mjs`, red on the old
code; mutants M24, M25.

## Accepted as they are

- **Exercise titles cut with "…" on phones** (16 titles, e.g. "Three-Zone Tour
  (Low–Mid–High)"). The ← Back row has ~170 px for the title at 360 px. A
  navigation bar truncating its title is the platform convention; the full
  title is on the exercise card that opened it and is read whole by screen
  readers. Two lines would make the sticky row taller on every exercise.
- **v17 "Puertas abiertas" rises on silence:** the gate opening on the
  thinking pause is the exercise's design (see above).

## Trade-offs taken

- A long Stop summary can be cut to two lines in the toast on a narrow phone;
  the full text is in the rating card and in the screen-reader announcement.
- The rating card's "Esta toma" line stays in the language the take was
  measured in if the learner switches language before rating it.
- Toasts with long text stay up to 8 s; a learner who reads fast waits for it
  to fade (it never blocks a tap: `pointer-events: none`).
- On v12 at desktop widths the bottom rail now takes two rows, so the lanes
  give up 42 px there (the rail reserves 114 px instead of 72).
- `scroll-padding-top` also moves every `scrollIntoView` on the app page below
  the sticky rows (intended), and does nothing in browsers without CSS `:has`
  (Firefox before 121), where focus can still land under the header.
- The audit's target-size rule accepts a control whose label is large enough;
  it does not check WCAG's spacing exception, so a small control with room
  around it is still reported.

## QA round 4 and what it changed in this branch

The QA thread attacked the build after round 2 (CSP, console freeze, trust
boundary, env-noise filter, the baseline re-cut). Its report is
`qa/round4/ROUND4-A-csp-trust.md` in the project files. What this branch took:

| Finding | What changed | Test and mutants |
|---|---|---|
| QA-16 env-noise matched the worker by prefix | The worker is its whole host, read from `js/billing-config.js`; a look-alike host or a CORS refusal naming another host is not noise | `tests/node/env-noise-killers.test.mjs`, L14, L15, L17 to L19 |
| QA-17, QA-18, QA-22 the CSP tests pinned almost nothing | Every directive is pinned per page with the reason for each source; every `.html` file in the root must be covered by both gates | `tests/node/csp-pins.test.mjs`, L20 to L22 (the same defect on all four pages) |
| QA-19, QA-20 | Each page enforces its policy in a browser; Google's sign-in client, a recorded take and a human visit (geo, consent bar, analytics flush) run under it with no violation | `tests/csp-gaps.spec.js` |
| QA-23 | The signature check and key import are captured at load and invoked through a `Reflect.apply` captured at load too (a stub of `Function.prototype.call` reached the first version; found by our own red team) | `tests/trust-console-gaps.spec.js` T5, T5b to T5d, B10, B12 to B14 |
| QA-24 | A trial started in the future is not a trial | T1, T2 (control), B9 |
| QA-25 | The plan chip, insights panel and sparkline follow the verified license | T6, B11 |
| QA-26, QA-27 | The key is frozen to full depth; both window bindings are locked | T3, T4, B6 to B8 |
| QA-32 | AGENTS.md no longer calls the freeze Pro protection | |

Left alone, with the reason:

- QA-33: the nine over-ceiling functions #20 added or edited in the account
  worker (among them `getEntitlement`, 28) are in the re-cut baseline. They are
  the payments owner's code; the baseline can only shrink from here.
- QA-28 (a token is a bearer of its subscription), QA-29 (no rate limit on
  `/v1/license` and `/v1/claim`), QA-30, QA-31, QA-21: product or worker
  decisions, listed for Pablo.
- Trade-offs of the fixes above: the trial still lives in `localStorage`, so
  clearing site data renews it; capturing `verify` at load raises the bar for
  a console snippet only, since a script that runs before the page's own or an
  edited copy of the files always wins on a static site; the plan chip no
  longer shows Pro in the window between sign-in and the license token
  arriving (it showed the worker's unsigned reply there before).

### Part B: the toast and the page's heading (QA report `qa/round4/ROUND4-B-worker-ui.md`)

| Finding | What changed | Test and mutants |
|---|---|---|
| UIA-01 The in-row toast covered Help on a 280 px phone, or a 320 px one with text at 125% (the room between Back and Help was under the 120 px floor) | Under 120 px of room the toast stands just under the row, whole, instead of on Help | `tests/toast-and-h1-gaps.spec.js` A (QA's, plus width and position), A19, A20 |
| UIA-02, UIA-03 A toast placed once stayed there when the view, the window or the language changed ("session paused" toast fires on every load) | A shown toast is placed again on view change, resize, rotation, language (the switch rewrites the body class) and when the entrance animation ends | same file B, C; `tests/toast-placement.spec.js`; A14, A17, A18, A22 |
| UIA-04 On a landscape phone the whole site header was `display: none`, so an open exercise had no h1 (axe `page-has-heading-one`) | The header leaves the layout, the tab order and the accessibility tree except the h1 (`visibility`), and `syncHeaderHeightVar` reads `position: absolute` as "takes no room" | D (QA's) and the sticky-offset test, A25, A26 |
| UIA-05 The 374 px cut could move to 360 px unseen | 373, 374 and 375 px are pinned | E, A27 |
| UIA-06 A toast placed during the view's entrance animation was 2 to 6 px off | Placed again at `animationend` | `tests/toast-placement.spec.js`, A22 |
| UIA-07 A faded toast kept its text in the accessibility tree | The region stays (so the next message is still announced) and is emptied 0,4 s after it fades; a new toast cancels the pending clear | `tests/toast-placement.spec.js`, A23, A24 |
| UIA-08 `--ex-chrome-h` is not re-measured on a text-size change without a resize | Left alone: no consumer is affected today | |

A toast that two lines would cut (the pace mode's take instructions, the storage
notice) used to end in an ellipsis in the row at phone width. Now only the take's
summary, which the rating card keeps whole, may be cut there (`opts.kept`); any other
message that needs more lines stands under the row, whole, and the title stays. The
toast's 999 px pill corners, which let a wrapped message run out of its border, are
1.4rem (still a pill for one line). The 120 px edge is swept from 280 to 340 px in
5 px steps in both languages and checked against the span measured at each width,
because where it falls depends on the font (`tests/toast-and-h1-gaps.spec.js`, A28
to A30; the cut message: `tests/toast-placement.spec.js`, A31 to A34).

Trade-offs: where the row has no room (a 280 px phone) the toast covers part of
the stage's strip for its 3 to 8 s instead of Help, which is the lesser loss;
at 200% text the row itself overflows, which is a layout limit of the row and
not of the toast. The payments findings in the same report (QA-W-01 to
QA-W-09: concurrent first-purchase events minting several licenses, no
handling of Stripe refunds and disputes, no price or amount allowlist, gift codes redeemed
twice at once, and five mutants of the decision functions that the worker's
tests do not catch, among them a failed Stripe event keeping its idempotency
marker) are the account worker's, owned by the
payments thread; this branch does not touch that code.

### Part C: storage, the learner's day, drill parity and the audio envelope (`qa/round4/ROUND4-C-vibe-audio.md`)

| Finding | What changed | Test and mutants |
|---|---|---|
| QA-35 Valid JSON of the wrong kind (`null`, `42`, an array) in `vt_settings_v1`, `vt_progress_v1`, `vt_hold_logs_v1`, `vt_session_v1` or `vt_analytics_v1` left a blank page until site data was cleared | `storage.read` returns the fallback when the parsed value's kind differs from the fallback's (a `null` fallback means "an object"); `analytics.read` wants an object with an `events` array | `tests/corrupt-storage.spec.js`, C-set mutants |
| QA-36 The progress export's file name and the metronome-speech deck start used the UTC day (19:00 in Lima is already tomorrow) | Both read `VTDays.dayKey` | `tests/local-day.spec.js` |
| QA-34 v13 and v14 had 4 steps in English and 5 in Spanish | The English text now says what the Spanish text and the practice mode already did | `tests/node/exercise-parity.test.mjs` pins every drill's step, tip and mistake counts across languages; and v14's steps name the 3 key ideas its mode scores, with a brake before each (L28 to L31) |
| QA-37 Five envelope behaviours had no test | Pinned | `tests/node/envelope-killers.test.mjs`, M26 to M30 |

Trade-offs: the kind check does not look inside the value (a settings object
with a wrong field is still read as it is); the three legacy functions edited
on the way (`setPracticeUI`, `headerPlanState`, `bindBilling`) lost their
complexity exemption by being edited and are now small functions, so the
baseline went from 353 to 348.

### Part D: small phones, the consent bar and the audit ledger (`qa/round4/ROUND4-D-*.md`)

| Finding | What changed | Test and mutants |
|---|---|---|
| UIB-01 The consent bar covered the last controls of every page, and focus could land under it | The bar reserves its height as `padding-bottom` and `scroll-padding-bottom` on `html` while it is shown and gives both back when it is answered or the window resizes | `tests/focus-consent-bar.spec.js`, D3 to D5 |
| UIB-03 On a phone on its side the mic slider lay on the octave button | The rail wraps to a second row under 500 px of height and 800 px of width | `tests/rail-small-screens.spec.js`, D1 |
| UIB-04 Shift+Tab from the first control left focus under the Back row | The Back row's height is part of the scroll padding going up | `tests/focus-reverse.spec.js`, D6 |
| FAL-01 "Paso listo" was a 13 px checkbox below the fold | A 24 px target (WCAG 2.5.8) | `tests/target-size-below-fold.spec.js`, D2 |
| FAL-03 The audit analyzer's layout, contrast, clipping, overlap, focus, mic, replay and phone rules had no test that turned red when one was dropped | Each rule is pinned | `tests/node/analyze-audit.test.mjs` and `analyze-audit-gaps.test.mjs`, AU10 to AU22 |
| FAL-04 The analyzer did not read counts in status lines ("3 sílabas"), or a count that rose and fell back, and did not check the mic at the plan page | Counts are read from every status line, a rise is any value above the first tick's, and a mic left on at the plan page is a finding | AU23 to AU27 |
| FAL-05 The exemptions in the ledger (modes with no take, modes that count on silence) could grow unseen | The set of modes is pinned; the exemption covers the silent run only, not the noise run | AU28 to AU30 |
| FAL-07 Two numbers in this document ("8 of 9 red", "26 covered stops") did not reproduce | The numbers are removed from T1 and T2 above; the tests stay | |

Left by decision, in the open:

- UIB-02: at 200% text the wrapped rail swaps one failure (the slider on the
  button) for another (a taller rail over the stage). Not fixed; the rail needs
  a redesign, not another media query.
- FAL-02, FAL-06, FAL-08 to FAL-10, UIB-05 to UIB-08 (the rail's invisible overlay,
  the collapsed exemption that hides 94 controls from the layout check, the
  complexity-growth check that is vacuous for this PR, unanchored sweep specs,
  shard balance) were not taken this round.
- The consent bar adds padding to `html` while it is shown, so the page is
  taller by the bar's height for as long as it stays.

### The red team on those fixes

Five adversarial passes over the round-4 changes found defects in the fixes
themselves. Each is fixed with a test that is red on the defect:

| Found | Fixed | Test and mutants |
|---|---|---|
| The take's summary borrowed the label of the recording player (`rate.take`, "Tu grabación"), so numbers read as if they described the recording; the file also held a key twice (the later silently won) | Its own words, `rate.takeSum` ("Esta toma:" / "This take:"); a key written twice in one table now fails the build | `tests/node/i18n-duplicate-keys.test.mjs` (with a planted-duplicate control), `tests/take-summary.spec.js`, L25, A11 |
| Take 1's numbers stayed on the card while take 2 ran, and a take that ended without the Stop announcement (leave, then "Puntuar ahora") kept take 1's numbers | A new take clears them; every end of a take keeps its own, or nothing | `tests/take-summary.spec.js`, A12, A13 |
| A toast raised while the page changed (leaving an exercise without rating, rotating a phone) stayed at the old row's coordinates | A shown toast is placed again when the window or the view changes | `tests/toast-placement.spec.js`, A14, A17, A18 |
| The "kept whole" check passed on a hidden or collapsed line (no overflow when nothing is drawn); the 2,8 s floor and the title coming back were not pinned | The oracle requires the line to be drawn and uncut; a five-letter message must outlast 2,6 s | `tests/toast-placement.spec.js`, A15, A16 |
| The audit ledger dropped a mode's crashed run together with the exemption for that mode (`weekPlan`, `concisionGate`) | A crashed run is reported for every mode; the exemption excuses only what it names | `tests/node/analyze-audit.test.mjs`, AU7, AU9 |
| The worker's CORS refusal counted as environment noise for the deployed site too, where it is a broken sign-in | Noise only for a page served from this machine; the driver records where it ran | `tests/node/env-noise.test.mjs`, `analyze-audit.test.mjs`, L23, L24, AU8 |
| The plan chip's helper `headerPlanState` (25) and `verifyToken` (22) and `setPracticeUI` (28) lost their exemptions by being edited | Split into small functions; the baseline went from 353 to 350 | `npm run lint` |
| Capturing `SubtleCrypto.prototype.verify` at load broke the test harness's stand-in, which offers only the instance's methods (the worker's site-client tests went red) | Falls back to the instance's own method where the prototype has none | `workers/entitlements/test/site-client.test.mjs` |

Trade-offs of this round, for Pablo: the capture-at-load fallback means a
runtime without `SubtleCrypto` on its prototype takes the instance's method at
load (same bar: a later swap changes nothing); `setPracticeUI` is now four
small functions in place of one 60-line one, and its behaviour is covered only
by the existing specs plus the two lifecycle tests above.

### Round 4e: QA-44, QA-45, QA-47, QA-49 and the second red team

| Finding | What changed | Test and mutants |
|---|---|---|
| QA-44 A stored session that was an object but not a session (`{}`, no `order`, no numeric `index`) passed the kind check and threw on the next step | `VTSession.get` returns a session only when `order` is an array and `index` a number, and gives `completedIds` back as `[]` | `tests/corrupt-storage.spec.js` (shapes, direct `VTSession` calls), C13 to C16 |
| QA-45 Every a11y mutant was judged by all six browser specs; the job outgrew its 30 minutes | A mutant is judged by the spec written to catch it (`A11Y_KILLER`); the whole group runs nightly (`MUTATE_WIDE=1`). The mutation job is a matrix of seven sets (`stage a11y flows regress billing audit toast`), the longest ~16 min | `qa/mutate.mjs`; a mutant with no entry in `A11Y_KILLER` is a build error |
| QA-47 A browser that refuses writes (full quota, Safari private mode) threw out of `init` and left a blank page | `storage.write` keeps the value in memory when the browser refuses it, reads see it, the page says once that nothing will be saved (`data-storage="memory"`, a toast) | `tests/storage-full.spec.js`, C5 to C12 |
| QA-49 Mutant C2 (the event-log reader) survived in CI: the cases that seeded `vt_analytics_v1` booted with `vt_e2e=1`, so `track()` answered "automated" before it read the log | The reader is judged through `summary()` (QA's spec, `tests/analytics-reader.spec.js`) and through `track()` with automation off (`PROBE` cases in `corrupt-storage.spec.js`) | C2, with its control cases |
| License check called `crypto.subtle.verify` through `Function.prototype.call`, which a console stub could replace | The call goes through a `Reflect.apply` captured at load (`APPLY`) | `tests/trust-console-gaps.spec.js` T5b to T5d, B12 to B14 |
| FAL-09 Sweep specs were matched by a pattern anchored on the end of the name, so a PR-gate spec whose name ended like one was dropped from the gate | The pattern is anchored on the directory separator and tested | `tests/node/playwright-projects.test.mjs`, L27 |
| The coach summary `.txt` was named for the UTC day beside a JSON named for the learner's | Both use the learner's day | `tests/local-day.spec.js`, C17 |
| QA-57 Ten runtime `test.skip()` / `{ skip: true }` guards in six specs (`i18n-copy`, `sh-air-detect`, `mic-manual-grace`, `redteam-client`, `hit-targets`, `full-journey`) turn a test into a skip when the page API it drives is missing; Playwright reports a skip as a success and CI counted none, so a rename with its callers updated left four tests green and checking nothing | The guards are assertions that name what is missing; `qa/no-skips-reporter.cjs`, registered in `playwright.config.js`, fails the run on any skip outside a reviewed list (live-pages, and the two auth tests that need the generated secrets file) | `tests/node/no-skips-reporter.test.mjs` (the real runner on a throwaway project: a skip fails and is named, a pass and a by-design skip do not), L32 to L37; R1 renames `VTPracticeModes.get` with its callers and is killed by the four converted tests (the old guards let it survive) |
| A18 survived in CI on 59ea565: the follow-the-page tests had gone under the row when the cut-message rule landed, and test B only asserted the toast does not cover Back or Help, which holds without the observer (QA, round 8c) | The old tests raise a kept toast in the row; QA's `tests/toast-follows-view.spec.js` compares a toast raised on the old view with one raised fresh on the new view, with every CSS animation off so `animationend` cannot do the observer's job | A18 (judged by both specs) |
| The landscape sticky-row test (UIA-04) read the scroll two frames after a smooth `scrollTo` (the page sets `scroll-behavior: smooth`): 52, 53 and 15 px of 180 on the runner, red in browser (4) and in the a11y baseline, and the earlier unexplained red baseline | `behavior: "instant"` | A25, A26 still kill |
| browser (2) failed on 564fe69: "s14 sloppy" waited 20 s for a slide that never counted (2 of 24 runs under load, the rest took 4 to 24 s). The synthetic voice's slide took 0,4 s, which the mode measures as 0,26 s (old pitch to within a third of a semitone of the new) against a 0,25 s line, so the phase of the 26 ms sampling clock decided each loop. No test pinned the detector itself | The voice slides for 0,7 s (measures 0,46 s) and the next note waits for it; the legato waits are 30 s | `tests/node/slide-detect.test.mjs` runs the real `_segment` on 1 080 pitch tracks (27 clock phases x 40 audio-chunk lags): a 0,7 s slide counts in all, a 0,05 s step and a 0,15 s change in none, and the old 0,4 s slide counts in some and not in others; L38 to L41. 40 of 40 under full CPU load after (was 2 of 24 failing) |
| The same test's share of 4 ms attacks marked ▲ fell to 4 to 6 of 8 in 4 of 32 runs with every core busy (the attack reads 9 to 17 ms against the 14 ms line); its `hammers >= 6` was a constant | The browser test asks for a majority (the 2 of 13 bug read 15 %) and that the HUD count is at least the marks it saw; the measure itself stays pinned by `tests/node/attack-rise.test.mjs` (4 ms always a hammer, 30 ms never, at every phase of chunked audio) | M19 and the attack tests; see the limit below |
| "A 14-second take is rejected" passed by speed (QA, round 8c): `clock.install()` leaves real time running, the real seconds between Start and the fast-forward were added to the take, and the slack to 15 s was 1 s (2 of 10 runs at 5 workers saved a 14 s take) | The test pauses the clock before Start, fast-forwards 14,999 s (rejected) and then 1 ms (saved), so both sides of the 15 s line are pinned | `tests/production-contracts.spec.js`; S7 (line one tick down) and S8 (one tick up); 50 of 50 at 5 workers under load |
| QA-66 browser (1) failed on be702cf: the account panel's 44 px tap-floor test read "Guardar ahora" as 43,99997. The pointer rests where "Entrar" was, so the button under it is mid-way through its 0,12 s hover lift (`translateY(-1px)`) and the float32 geometry after the transform is a hair under 44 (1 run in 60 with every core busy, and on CI) | A control CSS makes 44 px is not "too small" by a hundredth of a pixel: `tests/helpers/tap-floor.js` allows 0,05 px, and every strict tap-floor check uses it (4 sites in the patch from QA, and the 22 other `toBeGreaterThanOrEqual(44 or 48)` in nine more specs) | `tests/tap-floor.spec.js` (a 44 px box clears at 41 lift positions, 43,5 and 43 px boxes do not); S9 (allowance 0), S10 (0,6) and S11 (1 px) |
| BUG-1 (QA round 9, Low) A stored practice ledger with `"days": []` was kept (`typeof [] === "object"`); `record()` set today's row on the array, `JSON.stringify` dropped it, so every practice was lost on every read and the streak could never start. Nothing in the app writes that shape; another build's schema or an import would | `normalize()` discards a list where the keyed bag belongs, like any other wrong kind | `tests/ledger-days-array.spec.js` (red on 564fe69); C31 |
| QA round 9, storage: 13 mutants of `storage.js`, `session.js`, `analytics.js` and `practice-days.js` survived the 83 tests that exist for them: a list where a bag belongs (S1), a storage switched off rather than full (S2, S3), a session field that is truthy but not a list (S4), the 500-event cap keeping the oldest (S5), a refused analytics write (S6), the learner's day across DST nights, month and year edges and the backfill path (S7 to S10), the repair lines of the ledger (S11, S12) and the 60 s rule (S13) | Ten goal-based specs, run in the CI font and five times each under load | `tests/storage-kinds`, `storage-off`, `session-fields`, `analytics-cap`, `analytics-write-refused`, `practice-days-dst`, `practice-days-backfill`, `local-day-zones`, `ledger-shapes`, `practice-days-minute` (`.spec.js`); C18 to C32 |
| QA-68 (Med) Both CSP gates kept the LAST occurrence of a repeated directive; a browser keeps the FIRST. `connect-src *; ` written before the page's own passed 17 tests and was enforced by the browser | `tests/node/csp-effective-policy.test.mjs` reads the policy as a browser does (first wins) and demands exactly one policy meta per page | L42 |
| QA round 9, trust: three clauses of `license.js` no test observed: `Reflect.apply` captured at load (a console stub forges the check), the signature check failing closed, and the in-session expiry (a tab left open past `exp` kept Pro) | Three specs: `trust-reflect-apply`, `trust-fail-closed`, `trust-claims-expire` | B15 to B17 |
| QA round 9, audit ledger: eleven survivors of `analyze-audit.mjs` (large text starts at 24 px, an unmeasured contrast judged as 0:1, an off-screen control called covered, "N %" and comma or no-break-space thousands read as counts, an uncaught exception in the phone run ignored, folded controls judged, the cue not counted as feedback, focus on the page called a stop without a ring, two-digit clock minutes, "1 cent") left both audit test files at 52 passed. No product defect | `tests/node/analyze-audit-r9.test.mjs` (15 tests) | AU53 to AU63 |
| QA round 9, CSS: the landscape rail bound `(max-height: 500px) and (max-width: 799.98px)` was pinned only at 568x320, 667x375 and 740x360, so moving it to 741 px wide or 380 px tall left `rail-small-screens` green | `tests/rail-landscape-bounds.spec.js` pins 760x360, 736x414, 640x480 and 700x500 (QA's note: the true floor is about 770 px and 799,98 is generous, not a defect) | D7, D8 |
| L25 and L26 were "killed" by the asset-manifest check, not by their own tests | A lint mutant can name the one test that judges it | `qa/mutate.mjs` (5th element) |
| The audit ledger flagged note names ("C3"), cents ("+6¢"), decimal percents, ms/min/Hz/bpm/dB, thousands and range words ("DEL 1 AL 10") as counts that rose, compared "Reps" and "REPS" as different counts, and never reported a thrown interruption run on the plan page | All of those are read as what they are; the case is folded; the throw is reported for every mode. `#mode-cue` is left out of the count lines on purpose: it is static text set when the mode mounts | `tests/node/analyze-audit-gaps.test.mjs` part 3 (each unit, sign and range word has its own record), AU31 to AU52 |
| v14's steps said "one key idea" and "2 brakes" while the mode scores 3 anchors and asks for a brake before each | Both languages say 3 key ideas and a brake before each; the test ties the text to `profile.keyPoints` | `tests/node/exercise-parity.test.mjs`, L28 to L31 |
| Toasts: the 120 px edge was unpinned, a message the row cut ended in an ellipsis, wrapped toasts had pill corners | See Part B | A28 to A34 |
| QA-69 `toast-and-h1-gaps` "D 844x390" (line 198) read the exercise row while the view's 0,22 s `fadeIn` (a 6 px rise) was still running: `rowTop` 6, 3, 1, 0, 0 at 20, 60, 110, 160, 200 ms; 1 run in 4 with three workers (QA, round 9) | The case ends every animation before it reads, as the rest of the file does; 10 of 10 after | the case itself |
| QA-70 `toast-placement` "1280x800: a toast that wraps to two lines still fits inside the header row" (line 119) read the toast before the page had placed it again: 2 runs in 10 with three workers (toast 68,27 to 105,73 against a row of 64,83 to 104,02). The page re-places a shown toast on `animationend` (the A22 fix, correct); `measureToast` called `a.finish()` and read at once, and the browser sends that event on the next frame. QA removed the two-frame wait from the existing "still moving" test and it failed 3 of 6, the same 6 px | `measureToast` finishes the finite animations and waits for their `animationend` or `animationcancel` (waiting two frames hangs under a paused `page.clock`); 12 of 12 runs of the 46 after. A22 is still killed (V3, V4, "still moving") | A22 |
| QA-71 (2026-11-21, readiness check) `stage-design` "Landscape: a phone on its side › guided" (line 640), phase paused, failed nightly 44914917075 on 801755d: "stage under the header (scrollY 43)". Detener scrolls to the rating card itself one frame later (`revealRating`, `js/app.js:5434`, a smooth `scrollBy` at :5466); the case sent `scrollTo(0)` 8 to 12 ms after the click, so the reveal sometimes ran after it and carried the page to 43 to 48 px (CI trace: scrollTop 0, then 44, 47, 43). 1 failure in 98 gate runs since 2026-10-27; not reproduced naturally in 130 local runs, reproduced 14 of 30 by delaying the reveal 40 ms. A test race, not an app defect: the reveal is how the rating comes up after Detener | The case waits until the page has held still for 300 ms, scrolls to the top, waits again and asserts it is at the top before Pausar ("nothing carried the page off the top"); 30 of 30 clean, 30 of 30 against the 40 ms smooth and instant plants, 20 of 20 at 4x and 8x CPU throttle. Trade-off: about 0,6 to 0,9 s more per run; a reveal that starts more than 300 ms after Detener now fails by name on the precondition | Planted pause-scroll defect: 10 of 10 red (3 of 3 again on the branch); 400 ms reveal: 6 of 6 red on the precondition |
| QA-72 (2026-11-21, readiness check) `safari-mobile-recovery` "the sound-paused banner moves off the controls a rail brings up under it" (line 915) failed on mobile-safari in push run 44863358369 (801755d): "Timeout 2000ms exceeded". The CI trace shows the banner did move, 1,1 to 1,4 s after the rail change, while WebKit had stopped drawing (one look took up to 304 ms); the 2 s `expect.poll` had stopped looking at 1,41 s, because Playwright skips a poll whose interval would end past the deadline. 1 failure in 65 safari-audio jobs since 2026-11-06; in Chromium the banner moves within 1 to 3 frames even at 60x CPU throttle, where the old case fails 6 of 10 with CI's exact list | The case looks again on each animation frame until the banner covers nothing (up to 12 frames, a 10 s cap that says the page stopped drawing) and asserts it is free within 4 frames: 3 by the event loop's order (rAF, ResizeObserver, the next rAF), 1 spare. Stricter than the 2 s window: a placement a second late now fails. **WebKit unverified locally** (WebKit needs libraries this container lacks); the PR's safari-audio job is the WebKit check | The rail watch removed (M1): red; the rail watch 1 s late (M2): red, where the old case passed it; controls SB1 to SB7 killed |
| QA-73 (2026-11-25, PR integration) `ab-events` "opening the account panel reports which state the visitor is looking at" (line 543) failed on PR #55's browser (1) job 139367240544: "Timeout 5000ms exceeded while waiting on the predicate". The page counts the open only once the worker has said what it offers, or after its 1.5 s floor (`js/app.js` `openAccount`), so the event can be queued after the test's one `flush()` right after the click; the queue's own 4 s timer (`FLUSH_MS`) then sends it at about 5.5 s, past the 5 s poll. Reproduced with the worker held: the old case failed 1 of 3 runs, the new one passed 3 of 3 | Each look of the poll sends the queue first | the case itself |
| QA-74 (2026-11-26, PR integration) Two webkit-layout cases that came in with #52 failed on PR #56's safari-layout job 139587270126 (macOS WebKit), where the diff touches no UI; main's run on a3d05e3 passed. (a) `session-sets` "a set runs as a set" (line 238): Empezar took 4.3 s to be handled (trace: `performing click action` 46.7 s, `click action done` 51.0 s); the frames show the toast "Después de hablar mucho: 2 pasos" drawn at 51.2 s and gone by 51.6 s, so the look at `#toast` from 51.5 s saw only "". (b) `site-version` "catalogue groups fold" (line 441): after a group closed and the page grew shorter, the pointer click on the advanced chip chased it for 5.2 s, intercepted by the sticky header's title at y 22 and by the list at y 686, and landed on the list, so the filter never applied (24 cards, 9 visible). Neither reproduces in Chromium | (a) A MutationObserver keeps every line the toast says, and the case checks the line was said once (SS6 still killed). (b) The chips are pressed from the keyboard, which fires the same click handler wherever the chip has scrolled to, and the counts wait for the filter (DS7 still killed). Open question for the flows work: a control scrolled into view upward on the home page can sit under the sticky header (no scroll padding outside exercises) | the cases themselves |
| QA-75 (2026-11-26, PR integration) PR #57's `contracts` job was cancelled at its 25-minute limit (job 139594679565 on 331e83b), so every job that needs it was skipped; nothing was red. Once #47, #48 and #52 merged, `node qa/mutate.mjs` ran ten Node sets in one step: 22.8 minutes on b9e30d2 (job 139557670886), 23.9 and still in guards on 331e83b. Timed from each KILLED line, audio (110 mutants, 5.2 to 5.6 s each) and guards (120, 4.3 to 4.8 s, the three guard tests per mutant, 4 s of it the promise guards' scope analysis: parsing is 0.5 s, so caching the parse would not help) were 18 of those minutes; the other eight sets about 5. The same job took 18.9 to 19.0 minutes on a3d05e3, d0f2b33 and 2d5530f the same hour: runners differ by a quarter or more, so a step that needs 19 minutes on a fast one runs out on a slow one | The contracts step names the eight light sets; audio and guards run as `node-mutation`, one job each after contracts, with no browser to install. `tests/node/mutation-matrix.test.mjs` now reads every Node job: each set runs once, CI's Node sets are `DEFAULT_SETS` (the local default), and each job's estimate (its mutants at the measured seconds per mutant) stays under half its limit (the spread above, plus checkout, install and test:core), so a set that grows turns that test red with the job's name and minutes before CI cancels it. Estimates now: contracts 5.3 of 25, audio 10.3 of 25, guards 9.6 of 25; the old shape reads 25.3 of 25. L64 (the old shape), L65 (guards in no job) and L66 (no time limit) are killed. Not budgeted: the browser sets, which have no measured rates yet | the workflow and its test |
| QA-76 (2026-11-26, state-machine inventory) Two tabs of one browser: Ana signed in in tab B and synced; Bruno signed in in tab A, which still read "signed out", and kept his account's copy. Tab B went on as Ana over the record the browser now kept for Bruno; her next take went into it, and closing tab B sent it to her account: Ana's account held [A-1, A-2, B-own-1] (Bruno's take), and Bruno's then held Ana's A-2. Reproduced against the real storage, account and sync modules and the worker router. Root cause: the session is per browser in storage and per tab in memory (`js/account.js` read it once, at init, with no `storage` or `pageshow` listener), and the closing write (`flush({unloading})`) never asked whose the practice is. The same gap let a stale tab's 401 delete the session another tab had just stored, and let "Usar solo la de mi cuenta" pressed again in a second window pull the account copy over a take made since (the question stayed up there: sync told only its own tab) | Every tab follows the stored session (`followStoredSession` on `storage` and on `pageshow` from the back-forward cache, re-reading storage rather than the event's value; names nobody until the worker answers). A 401 forgets only when storage still holds the refused token. The closing write runs only when the practice is the signed-in account's. The owner answer is idempotent (asked once, answered once: `reason: "answered"`), and sync tells its listeners when another window writes the owner or the handover. Route rejected: a per-origin Web Lock or leader tab (Firestore, RxDB) serialises syncs but leaves a tab writing under the wrong name; that is for a later round. Trade-off: a take in progress in the other tab is saved under whoever is signed in now, as the header then says. `tests/node/sync-cross-tab.test.mjs` (9 tests, 8 red on the old code, the ninth a control); `tests/node/sync-env.mjs` gains opt-in storage and page events between tabs; SY55 to SY61 killed; the syncing set 61 of 61 | `js/account.js`, `js/sync.js` |
| QA-77 (2026-11-26, state-machine inventory) Two clocks with two policies: the engine counts no time it cannot hear, but the take's own clock (`sessionPractice`, read by `takeTimes`, the rating card, the day ledger, History and the score) ran from Start to Stop. A learner who sang a minute of `s4-lip-trills` and spent half an hour in another app was told "31:00 de 5:00 ✓", and the day was credited 1,860 s (reproduced with the page clock and a hidden page in `tests/practice-hidden-time.spec.js`). Root cause: `visibilitychange` saved the take and flushed the sync but never paused the clock, and `takeTimes` measured the step timer's run, which goes on while hidden | Hidden time is not practice: on hide the take's credit clock is flushed and paused (`pausePracticeClock`), on show it resumes from the return (`resumePracticeClock`), and `takeTimes` subtracts the hidden span (`hiddenSec`). The step timer keeps running, so the microphone still closes when the step ends. Route rejected: pausing the whole take while hidden (as a game would), which leaves the microphone open with nobody there on browsers that keep capturing in the background. Trade-off: a learner who comes back after the step's time finds the take ended, credited with the time they were there. Three tests (a minute sung and half an hour away reads 1:00 with no ✓ and the day a minute; 20 s, 15 s away, 25 s reads 0:45; a control never hidden); LF6 to LF8 killed | `js/app.js` |
| QA-78 (2026-11-26, state-machine inventory) Every way out of an exercise stops the take, and `stopPractice` asked the mode to end it each time (`takeModeResult`). The rate ladder measures its minutes when asked, so a learner who read `v1-diction` for 3 minutes, pressed Detener, read the review for 4 and then left through Inicio and "Puntuar ahora" had 7 minutes on the card, saved and scored against the target; and a stop with no take wiped the take's own words off the rating card | `stopPractice` notes whether a take was live (or starting) before it resets, and only then asks the mode for its result and writes the card's summary. Route rejected: making each mode's end idempotent, which leaves the next mode free to repeat it; one choke point covers all of them. Trade-off: a mode can no longer be asked for its result after the take, and none was. One test (3 minutes stay 3, the summary unchanged); LF9 and LF10 killed; A13 re-anchored | `js/app.js` |
| QA-79 (2026-11-26, state-machine inventory) The last take, left playing in the rating card, played on through the next take. The microphone opens without echo cancellation (so the voice is measured as sung), so the old take was heard as the learner's voice: its holds were logged and the new recording held it | Start pauses every take player (`pauseTakePlayers`) before the microphone opens. Route rejected: echo cancellation, which bends the pitch and level the exercises measure. One test (a playing take in the card is paused by Empezar); LF11 killed | `js/app.js` |
| QA-80 (2026-11-26, state-machine inventory) Reminders had one flag for the day: `isDue` answered false once `lastNotifiedDay` was today, so of two times (Pro's 08:00 and 20:00) the first spent the day and the second was never told. The second field came filled with 09:00 (`index.html`), and Save keeps a filled field, so every Pro learner who set one time had 09:00 added: with one flag a day, 09:00 came first and spent it, and they were reminded in the morning instead of at the hour they picked. The way in to the reminder named only the first time | Each time is told once: `markNotified` records the time it told (`lastNotifiedSlot`), and `isDue` is true when a later time has passed. A record from before has no time and counts for the whole day, so nobody is told twice on the day this ships. The second field is empty unless chosen, and the way in names every time (`Intl.ListFormat`, "8:00 a. m. y 8:00 p. m."). Trade-off: a learner told at 08:00 who has not practised is told again at 20:00, which is what two times ask for. Two tests (each of two times told once, the second as well, and the way in names both; a Pro learner who sets one time keeps only it); LF12 to LF15 killed | `js/reminders.js`, `js/app.js`, `index.html` |
| QA round 9, toast: twelve behaviours of the message over the page survived the 46 toast tests: the z-index above dialogs and the tour (TA), the width and top a message gives back when it leaves the row (TB1, TB2), `pointer-events: none` (TC), a second message restarting the clock (TE), `width: max-content` (TF), the emptying delay, the 8 s cap and `durationMs` (TG1 to TG3), a hidden toast keeping the title away on resize (TH), the home toast standing under the navigation (TI), the 560 px cap (TJ). None is a product defect | Nine of QA's attacker specs (`toast-above-dialogs`, `toast-leaves-row`, `toast-no-click-steal`, `toast-replaced`, `toast-shrink-wrap`, `toast-timing`, `toast-title-returns`, `toast-under-header`, `toast-width-cap`), and a `toast` set of 12 mutants, run as a seventh CI job so the longer sets do not grow | TA to TJ |
| Two of those nine failed on CI's font at once: `toast-leaves-row` (its 38-character message needs three lines in DejaVu Sans, so the page rightly put it under the row and the control "the toast stands in the row" failed) and `toast-shrink-wrap` (its 37-character message is 349 px in DejaVu against a 324 px cap, so "narrower than the cap" failed). Both passed in the font they were written in | The messages are 29 and 28 characters, between the half window and the cap in either font. 264 of 276 runs of the whole group passed under load before the change; all 12 failures were these two specs | `toast-leaves-row`, `toast-shrink-wrap` |

Second red-team sweep: of 28 findings, the ones above were taken. The workflow's
verification agents died twice on the account's 5-hour usage limit, so the
triage was done by hand and every taken finding has a test that is red on the
defect (`node qa/mutate.mjs`), not a verifier's verdict.

Trade-offs and limits, stated:

- The license check is deterrence. It resists a console snippet that stubs
  `crypto.subtle` or `Function.prototype.call`; it does not resist a user who
  rewrites the runtime (`TextEncoder`, `Date.now`) or edits the served files,
  which no static site can.
- A full or refused storage holds data in memory for the page's life only, and
  only for what goes through `storage.js` (the days ledger and analytics manage
  their own storage). The notice is a toast once per page, not a persistent
  banner.
- The storage kind check looks at the kind of the value; the session reader now
  checks its fields, the other readers still do not.
- The counts the ledger ignores (note names, signed offsets, units) could hide a
  real count written in that form ("Objetivos +2"); no screen does that today.
- Occasional load flakes remain possible on a shared runner (the daily-loop
  "Mínimo" run, `account-pro-states` line 960 on the font); the first has a
  150 s limit, the second depends on the runner's font.
  `tests/exercise-viz-speech-shape.spec.js` "v19 landing" read a fall as a rise or a
  level in several of 30 runs when the machine ran six busy processes on four cores;
  it has not failed on CI.
- With every core busy, about one 4 ms synthetic attack in ten reads 14 to 17 ms
  and goes unmarked by the s14 ▲ (a stalled frame is marked unmeasured, not "no").
  The measure is exact on chunked audio in `attack-rise.test.mjs`; whether a real
  device under that load does the same is not known, and the 14 ms line was not moved.
- Not taken: UIB-02 (200% text on the wrapped rail), the 568x320 rail wrap, the
  consent bar over Start at 740x360 on pitch exercises (UIB-01 is a half fix),
  FAL-02, FAL-06, FAL-08, FAL-10, UIB-05 to UIB-08, the hammer threshold of the
  s14 exercise under-reporting voices near 110 Hz, the 12 client-side test
  accounts in the public bundle, and the billing, trial and export branches that
  are still unpinned.
- The toast's `orientationchange` listener has no test and no mutant: no current browser fires that event without also firing `resize`, so nothing can tell it from a tree without it (QA: TD, dormant). Nine of QA's ten toast specs are taken; the tenth, which only exercised that listener, is not.
- The mutation baseline (legacy complexity exceptions) is 348 and can only shrink.

Decisions that are Pablo's, unchanged: the trial lives in `localStorage` (QA-24
follow-up), a token is a bearer of its subscription (QA-28), no rate limit on
`/v1/license` and `/v1/claim` (QA-29), the `createProfile` cap (QA-30), two-tab
staleness (QA-31), the ad-script and CSP (QA-21), the payments functions over the
ceiling (QA-33) and the payments findings QA-W-01 to QA-W-09 (payments thread,
PR #26).

