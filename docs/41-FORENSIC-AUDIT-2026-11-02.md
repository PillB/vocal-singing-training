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
**Tests:** `tests/toast-placement.spec.js` (8 of 9 red on the old build:
Back covered at every phone width, out of the row on desktop, gone at 2,8 s).

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
**Tests:** `tests/focus-not-obscured.spec.js`: two full Tab rounds in six
exercises at 1280 and 390 px; red on the old build with 26 covered stops; a
control proves the walk sees a covered stop.

### T3 — The mic slider lies on the octave buttons (v12, 1280–1440 px)

**Seen:** melodic speech shows seven piano options beside Start and the mic.
The slider's thumb sat on the octave "−" and the value "7" on "0 octava".
**Root cause:** the bottom rail was a single row that could not wrap, so the
mic box shrank to its `10rem` floor while its slider and value did not, and
the rail let children overflow.
**Fix:** the rail wraps when its controls do not fit (the stage already reads
the rail's height for the lanes), and the mic box is never narrower than its
own content.
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
