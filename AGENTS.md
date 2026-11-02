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
   Give particular weight to **methodological and scientific correctness**
   (is the measurement valid for this voice, this microphone, this room? is
   the pedagogy supported by voice-science evidence or only by tradition?),
   to current state-of-the-art techniques, and to the **usability and
   intuitiveness of the user flow**: a learner who has never seen the app
   must know what to do next, what the screen is measuring, and why a take
   did or did not count. Quality-of-life features (resume, undo, clear
   errors, keyboard paths, sensible defaults) are part of "correct".
4. Explicitly record *every* trade-off (performance, false positives vs
   abstention, device support, privacy, accessibility, scope, pedagogy,
   maintenance) in the change summary and issue ledger. Never silently absorb
   one. Never describe a heuristic as a medical diagnosis or a ground-truth
   assessment of vocal skill.
5. After **one failed fix hypothesis**, stop repeating the same guess; search
   current online documentation/issue reports for how others solved a
   similar error, cite the authoritative evidence, refine the root cause, then
   retest both failure and success paths. Record the failed hypothesis and the
   source that corrected it in the ledger row, so the next agent does not try
   it again.

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

### Tautological tests considered harmful

A test is only worth having if it can fail. Before writing one, write down
the goal of the correct behaviour **and** the specific wrong behaviour, and
model both: the test must pass on the correct code and turn red if the
defect comes back. Rejected patterns (each has shipped in this repo before):

- asserting that a mock returns what the mock was told to return, or that a
  function exists / a string appears in a file;
- an oracle computed by the code under test (re-deriving the expected score
  with the same formula);
- "nothing threw" as the only assertion;
- a wait or probe whose failure is swallowed (`waitFor*().catch(() => {})`)
  so the test carries on against a page that never reached the state — now
  a lint error unless a `// wait-may-fail: <reason>` comment names what
  checks the outcome instead (`qa/lint-playwright-waits.mjs`);
- a flow test that can pass without the flow happening (e.g. Start never
  became visible, so the Start/Stop block was skipped). Assert the
  precondition explicitly (see `openedIssues()` in
  `tests/all-flows-robust.spec.js`).

Prove falsifiability with a mutation: plant the defect, watch the test go
red, restore. `node qa/mutate.mjs` does this for the audio and lint
contracts and fails CI when any planted defect survives; add a mutant there
for every new contract you write.

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

For a six-iteration exercise deep dive, vary one dimension per iteration:
default, alternative controls, boundary values, interruptions, responsive /
keyboard, and return/reset/replay. Capture a left-to-right Z reading-order
inventory of visible and folded content plus bounding boxes, stacking context,
hit-test element, clipping/overlap, focus path, state transitions and timed
animation frames. All 47 current exercises must appear in the coverage matrix;
avoid claiming 36-exercise reports cover later additions.

## Automated gates

### chore(lint): cyclomatic-complexity ceiling (code)

`eslint.config.mjs` — the rule itself:

```js
export default [
  {
    files: ["**/*.{js,mjs,cjs}"],
    ignores: ["node_modules/**", "tests/fixtures/**", "qa/design-test/site-review/**"],
    languageOptions: { ecmaVersion: "latest" },
    rules: { complexity: ["error", { max: 15, variant: "modified" }] }
  }
];
```

`qa/lint-complexity.mjs` runs it over `js/ qa/ tests/ workers/` and root
modules, and compares each over-ceiling function by source hash against
`qa/complexity-baseline.json` (legacy debt only):

- every **new or edited** function must be <= 15; editing an exempt function
  drops its exemption;
- exclusions are exact paths (`qa/fixtures`, `tests/fixtures`, …), never a
  folder name; `.cjs` is scanned; a `.ts`/`.jsx` file fails the gate
  because it cannot be parsed;
- the baseline **may only shrink**: `npm run lint:prune` removes exemptions
  for code that was fixed and never adds one; CI runs
  `node qa/lint-complexity.mjs --baseline-ref origin/<base>` and fails if the
  baseline gained an entry. There is deliberately no flag that blesses new
  debt — split the function.

Per task / per round, the lint test is part of the round's evidence:

```sh
npm run lint            # complexity + Playwright-wait lint + asset versions + qa/lint-gate.test.mjs
node qa/mutate.mjs lint # every planted loophole in the gate must be caught
```

`qa/lint-gate.test.mjs` holds positive and negative controls for each rule
(15 passes / 16 fails, edited exemption, new debt, prune never adds, folder
names, `.cjs`, `.ts`, baseline growth against a git ref, an unresolvable or
empty ref, a pasted copy of an exempt function, misbound and swallowed waits).

Edited a script or stylesheet a page loads? Run `npm run assets:bump`: it
gives each changed file a new `?v=` in every page and records its hash in
`qa/asset-manifest.json`. `npm run lint` fails on a file whose content
changed under the same version (GitHub Pages caches for ten minutes, so a
visitor would run new HTML against an old script).

Every page carries the same Content Security Policy meta. An inline
`<script>` needs its sha256 in `script-src` (`tests/node/csp.test.mjs` says
which one is missing); inline `on*=` handlers never run under it, so bind
events in JS. A new third-party host (ads, a font CDN) must be added to the
policy, and `tests/csp.spec.js` fails on any violation during a visit.

### Billing config is frozen (QA-05)

`VT_BILLING_CONFIG`, `VTBilling` and `VTLicense` are frozen and their window
bindings locked once each script has run, so a console line cannot turn on
the QA unlock, loosen the license check or replace an answer
(`tests/console-unlock.spec.js`, mutation set `billing`). A test that needs
a different config patches it as the page loads, with `patchBillingConfig`
or `enableQaPro` from `tests/helpers/billing.js` (they compose); assigning to
the config from `page.evaluate` silently does nothing. This raises the bar
and no more: a script that runs before the page's own, or an edited copy of
the files, can still unlock the client-side Pro features. Paid access itself
rests on the server-signed license.

### Test layers

- `npm run test:core` — lint, catalog regression, Node/Worker unit and
  contract tests (`tests/node/*.test.mjs`, `workers/entitlements/test`).
- `node qa/mutate.mjs` — mutation check of the Node sets (audio, lint); CI
  runs it on every PR. `node qa/mutate.mjs stage a11y flows billing` runs the
  browser sets (sticky stage and piano, the phone h1, the per-exercise flow
  test, the console routes to Pro); CI runs those after the production
  contracts. Each set first proves its tests green on the unmutated code.
- `npx playwright test --project=chromium` — the **PR gate**: headless,
  deterministic, one generated test per exercise where a suite walks the
  catalog, so shards balance and a failure names the exercise. No retries
  (a retry hides flakiness); traces are kept on failure.
- `npm run test:sweep` (`--project=sweep`) — headed watch sweeps with a real
  pointer, slowMo, screenshots and reports. Nightly and on manual dispatch,
  never on the PR gate. `tests/node/playwright-projects.test.mjs` fails if a
  spec that forces `headless: false` is not in the sweep list.
- `npm run test:live` — the deployed GitHub Pages site (nightly).

CI (`.github/workflows/quality.yml`) runs contracts → browser contracts → 4
gate shards on every PR, and the sweeps + live check nightly. A blocked or
un-run test is **unverified**, not passed.

Avoid committing `.env`, account secrets or recordings; never auto-correct
historical scores without a trustworthy provenance signal and learner consent.

## QA / red-team thread protocol

A separate QA thread checks other threads' work. It works in two modes:

1. **Structured checks, in order** — for each change: reproduce the original
   defect on the base commit, confirm the fix on the head commit, run the
   positive control (a planted defect the check must catch), then re-test
   sibling exercises that share the mechanic. Record each in the QA ledger
   with commit SHAs.
2. **Surprise spot-checks** informed by published failure modes of
   AI-generated ("vibe-coded") apps: authorization enforced only in the
   client (CVE-2025-48757 class); paywalled content shipped in public static
   files; secrets or admin hashes in the bundle; missing security headers /
   CSP with `innerHTML` sinks; tests with high coverage but low mutation
   score; swallowed errors and waits; race conditions across async callbacks
   (late MediaRecorder chunks, double clicks, permission prompts);
   hallucinated APIs or wrong call signatures (the misbound
   `waitForFunction` options); copy that claims what the code does not do
   (privacy, medical or scoring claims); and layout that only works at the
   developer's viewport (360 px Android, 200 % zoom, landscape phones).

Findings go to the owning thread with a red-today test; the owner states the
trade-off of the fix to the user.

## Research anchors and non-negotiable product limits

- YIN, de Cheveigné & Kawahara, *JASA* (2002), PMID 12002874: noisy pitch
  requires voiced/unvoiced uncertainty and validation against labeled voices.
- Titze, semi-occluded vocal tract exercises (2006), PMID 16671856: SOVT is a
  useful intervention, not proof of uniform outcomes or guaranteed range gains.
- W3C MediaStream Recording: `dataavailable` precedes `stop`; callbacks and
  stream ownership must be bound to the originating take.
- W3C WCAG 2.2 2.4.11: focused controls must not disappear beneath sticky
  content. Inspect actual hit-test targets, not screenshots alone.
- NIDCD voice-care guidance: any report of pain, strain or ongoing hoarseness
  should lead to stopping and appropriate clinical evaluation; exercises are
  education, not medical treatment.

See `docs/40-PRODUCTION-AUDIT-2026-11-01.md` for the current evidence, debt,
trade-offs, and explicit outstanding release gates.
