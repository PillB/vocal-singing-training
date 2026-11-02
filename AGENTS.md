# Engineering and research contract — Vocal & Singing Training

This file is the canonical agent-facing contract for this repository. Read it
before changing the exercise catalog, scoring, DSP, visuals, payments, privacy,
or deployment. `agent.md` and `CLAUDE.md` point here.

## Decision rule: challenge the expert

For **every feature and meaningful design/implementation decision**:

1. State the intended behavior, relevant population, risk and measurable
   benchmark, including what incorrect behavior looks like.
2. Review primary evidence: W3C/WHATWG/MDN and platform specifications for
   browser behavior; peer-reviewed voice-science or signal-processing studies
   for vocal claims; WCAG and tested assistive-technology behavior for access;
   established security guidance for identity, storage and payments.
3. Ask: **What would the best expert in this field reject about our first
   choice, and why?** If you can name a valid evidence-backed objection,
   revise the choice before merging. Compare with the feasible evidence-based
   ideal, not the cheapest way to meet a task's minimum wording.
4. Explicitly record *every* trade-off (performance, false positives vs
   abstention, device support, privacy, accessibility, scope, pedagogy,
   maintenance) in the change summary and issue ledger. Never silently absorb
   one. Never describe a heuristic as a medical diagnosis or a ground-truth
   assessment of vocal skill.
5. After **one failed fix hypothesis**, stop repeating the same guess; search
   current online documentation/issue reports for similar failures, cite the
   authoritative evidence, refine the root cause, then retest both failure and
   success paths.

## Falsifiable test contract — every task and every round

Before writing a fix, define a test oracle with **(a) expected correct behavior,
(b) a specific wrong behavior that the test would fail on, and (c) the
observable browser, storage, callback, network, animation or DSP outcome**.
Use test inputs that plausibly trigger the original defect. A test that merely
asserts the code is present, calls a mocked implementation of itself, or checks
that nothing threw is insufficient. Preserve the original regression as a
negative test and a nearby valid positive case. Include boundaries, resets,
interruptions, rapid clicks, denied/late permissions, keyboard, mobile,
localization, offline mode and realistic noisy input when applicable.

Every task and every numbered round must:

1. Register a dated ledger row with screen, exercise/mode/pose, evidence,
   impact, actual-vs-expected behavior, root cause and suspected shared paths.
2. Run `npm run lint` and `npm run test:core`; run focused browser suites for
   affected flows and log browser/device/version. If blocked, say so and keep
   the issue **unverified**, not passed.
3. Prove the test would turn red on the wrong behavior (an explicit negative
   fixture, reverted-code mutation or controlled bad input), not only green on
   the revised code. Preserve output and/or the failing assertion.
4. Revisit counterpart exercises using the same mode/scene/scoring mechanic;
   use a regression matrix rather than treating an isolated fix as complete.
5. Complete five recorded **red-team passes** (malformed and adversarial input,
   state/race interruptions, accessibility/occlusion, numerical/scientific
   errors, integration/privacy/CI), with attack -> defense -> retest for each
   serious finding. Complete four **aesthetic/legibility passes** (desktop,
   narrow mobile, high zoom/keyboard, color/animation/locale) and a full pose
   compliance audit for each affected pose, including anatomical, mathematical,
   geometrical, instructional and safety claims. A "pose" may be a microphone/
   jaw/neck/breath-body posture or a game scene/state; record which meaning
   applies. Repeat rounds on sibling poses whenever a root cause is shared.
6. Do not mark production-ready until actual deployment, platform CI, live
   human-browser hit tests, real microphone/audio tests and the applicable
   security/privacy checks are verified. A blocked test stays a release gate.

For **mobile audio/Safari** tasks, separately test output unlock on the actual
tap (before any permission `await`), a denied/late/busy microphone, single
stream ownership while recording, asynchronous MP4/AAC or WebM finalization,
temporary track `mute`/`unmute`, sustained mute, track `ended`, Web Audio
`interrupted`/`suspended`, AudioSession interruption and foreground restore,
lock/call/AirPods/wired-headset routing, replay after Stop, and 360×740 / 390×844
/ 844×390 visible hit targets. CI WebKit emulation is not physical iOS Safari;
require actual-device acoustic playback and permission-cycle signoff. Never
infer speaker audibility merely from an oscillator having been scheduled.

For a six-iteration exercise deep dive, vary one dimension per iteration:
default, alternative controls, boundary values, interruptions, responsive /
keyboard, and return/reset/replay. Capture a left-to-right Z reading-order
inventory of visible and folded content plus bounding boxes, stacking context,
hit-test element, clipping/overlap, focus path, state transitions and timed
animation frames. All 47 current exercises must appear in the coverage matrix;
avoid claiming 36-exercise reports cover later additions.

## Automated gates

- `npm run lint` — includes `chore(lint)`: parser-based ESLint cyclomatic
  `complexity` maximum **15** and a Node contract test that checks both a
  good and deliberately bad fixture. `eslint.config.mjs` specifies the rule.
- `qa/lint-complexity.mjs` rejects *all new or changed* functions exceeding 15.
  `qa/complexity-baseline.json` is a fingerprinted **legacy-debt exception
  list**, not a license for new complexity. Do not regenerate it as a routine
  way to pass the build. Any exception needs an itemized risk review and an
  explicit maintainer decision; prefer splitting the function.
- `npm run test:core` — runs lint, deterministic catalog and Node/Worker tests.
- `npx playwright test tests/production-contracts.spec.js --project=chromium`
  — browser regression contract; requires a Chromium binary and a local server.
- `npm test` — core gate plus the full Playwright suite.

CI on pull requests should run the gates and retain artifacts on failure.
Avoid committing `.env`, account secrets or recordings; never auto-correct
historical scores without a trustworthy provenance signal and learner consent.

## Research anchors and non-negotiable product limits

- YIN, de Cheveigné & Kawahara, *JASA* (2002), PMID 12002874: noisy pitch
  requires voiced/unvoiced uncertainty and validation against labeled voices.
- Titze, semi-occluded vocal tract exercises (2006), PMID 16671856: SOVT is a
  useful intervention, not proof of uniform outcomes or guaranteed range gains.
- W3C MediaStream Recording: `dataavailable` precedes `stop`; callbacks and
  stream ownership must be bound to the originating take.
- MDN/WebKit AudioContext interruption and WebKit AudioSession routing bugs:
  retain explicit user-gesture recovery, avoid an untested universal output
  route override, and prove audio with physical hardware before release.
- W3C WCAG 2.2 2.4.11: focused controls must not disappear beneath sticky
  content. Inspect actual hit-test targets, not screenshots alone.
- NIDCD voice-care guidance: any report of pain, strain or ongoing hoarseness
  should lead to stopping and appropriate clinical evaluation; exercises are
  education, not medical treatment.

See `docs/40-PRODUCTION-AUDIT-2026-11-01.md` for the current evidence, debt,
trade-offs, and explicit outstanding release gates.
