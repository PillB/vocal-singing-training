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
| QA-45 Every a11y mutant was judged by all six browser specs; the job outgrew its 30 minutes | A mutant is judged by the spec written to catch it (`A11Y_KILLER`); the whole group runs nightly (`MUTATE_WIDE=1`). The mutation job is a matrix of six sets (`stage a11y flows regress billing audit`), the longest ~14 min | `qa/mutate.mjs`; a mutant with no entry in `A11Y_KILLER` is a build error |
| QA-47 A browser that refuses writes (full quota, Safari private mode) threw out of `init` and left a blank page | `storage.write` keeps the value in memory when the browser refuses it, reads see it, the page says once that nothing will be saved (`data-storage="memory"`, a toast) | `tests/storage-full.spec.js`, C5 to C12 |
| QA-49 Mutant C2 (the event-log reader) survived in CI: the cases that seeded `vt_analytics_v1` booted with `vt_e2e=1`, so `track()` answered "automated" before it read the log | The reader is judged through `summary()` (QA's spec, `tests/analytics-reader.spec.js`) and through `track()` with automation off (`PROBE` cases in `corrupt-storage.spec.js`) | C2, with its control cases |
| License check called `crypto.subtle.verify` through `Function.prototype.call`, which a console stub could replace | The call goes through a `Reflect.apply` captured at load (`APPLY`) | `tests/trust-console-gaps.spec.js` T5b to T5d, B12 to B14 |
| FAL-09 Sweep specs were matched by a pattern anchored on the end of the name, so a PR-gate spec whose name ended like one was dropped from the gate | The pattern is anchored on the directory separator and tested | `tests/node/playwright-projects.test.mjs`, L27 |
| The coach summary `.txt` was named for the UTC day beside a JSON named for the learner's | Both use the learner's day | `tests/local-day.spec.js`, C17 |
| QA-57 Ten runtime `test.skip()` / `{ skip: true }` guards in six specs (`i18n-copy`, `sh-air-detect`, `mic-manual-grace`, `redteam-client`, `hit-targets`, `full-journey`) turn a test into a skip when the page API it drives is missing; Playwright reports a skip as a success and CI counted none, so a rename with its callers updated left four tests green and checking nothing | The guards are assertions that name what is missing; `qa/no-skips-reporter.cjs`, registered in `playwright.config.js`, fails the run on any skip outside a reviewed list (live-pages, and the two auth tests that need the generated secrets file) | `tests/node/no-skips-reporter.test.mjs` (the real runner on a throwaway project: a skip fails and is named, a pass and a by-design skip do not), L32 to L37; R1 renames `VTPracticeModes.get` with its callers and is killed by the four converted tests (the old guards let it survive) |
| A18 survived in CI on 59ea565: the follow-the-page tests had gone under the row when the cut-message rule landed, and test B only asserted the toast does not cover Back or Help, which holds without the observer (QA, round 8c) | The old tests raise a kept toast in the row; QA's `tests/toast-follows-view.spec.js` compares a toast raised on the old view with one raised fresh on the new view, with every CSS animation off so `animationend` cannot do the observer's job | A18 (judged by both specs) |
| The landscape sticky-row test (UIA-04) read the scroll two frames after a smooth `scrollTo` (the page sets `scroll-behavior: smooth`): 52, 53 and 15 px of 180 on the runner, red in browser (4) and in the a11y baseline, and the earlier unexplained red baseline | `behavior: "instant"` | A25, A26 still kill |
| L25 and L26 were "killed" by the asset-manifest check, not by their own tests | A lint mutant can name the one test that judges it | `qa/mutate.mjs` (5th element) |
| The audit ledger flagged note names ("C3"), cents ("+6¢"), decimal percents, ms/min/Hz/bpm/dB, thousands and range words ("DEL 1 AL 10") as counts that rose, compared "Reps" and "REPS" as different counts, and never reported a thrown interruption run on the plan page | All of those are read as what they are; the case is folded; the throw is reported for every mode. `#mode-cue` is left out of the count lines on purpose: it is static text set when the mode mounts | `tests/node/analyze-audit-gaps.test.mjs` part 3 (each unit, sign and range word has its own record), AU31 to AU52 |
| v14's steps said "one key idea" and "2 brakes" while the mode scores 3 anchors and asks for a brake before each | Both languages say 3 key ideas and a brake before each; the test ties the text to `profile.keyPoints` | `tests/node/exercise-parity.test.mjs`, L28 to L31 |
| Toasts: the 120 px edge was unpinned, a message the row cut ended in an ellipsis, wrapped toasts had pill corners | See Part B | A28 to A34 |

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
- Not taken: UIB-02 (200% text on the wrapped rail), the 568x320 rail wrap, the
  consent bar over Start at 740x360 on pitch exercises (UIB-01 is a half fix),
  FAL-02, FAL-06, FAL-08, FAL-10, UIB-05 to UIB-08, the hammer threshold of the
  s14 exercise under-reporting voices near 110 Hz, the 12 client-side test
  accounts in the public bundle, and the billing, trial and export branches that
  are still unpinned.
- The mutation baseline (legacy complexity exceptions) is 348 and can only shrink.

Decisions that are Pablo's, unchanged: the trial lives in `localStorage` (QA-24
follow-up), a token is a bearer of its subscription (QA-28), no rate limit on
`/v1/license` and `/v1/claim` (QA-29), the `createProfile` cap (QA-30), two-tab
staleness (QA-31), the ad-script and CSP (QA-21), the payments functions over the
ceiling (QA-33) and the payments findings QA-W-01 to QA-W-09 (payments thread,
PR #26).

