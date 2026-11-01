# Engineering and independent QA contract

Scope: the repository's complete vocal/singing learning app, 47 frozen exercises (`tests/fixtures/catalog-snapshot.json`), account/payment worker, GitHub Pages deployment, docs and CI. This file applies to every agent, task and round.

## Definition of done — evidence, not confidence

1. **State the intended result and a plausible wrong result before coding.** Write a falsifiable test whose independent oracle catches both; run it once against the defect or a deliberate mutation to demonstrate failure, then against the fix. A test that reads the production predicate to decide its expected answer is tautological and rejected. Do not force-click, manually hide modal DOM, or edit app state to make an end-to-end test pass.
2. **For every task and every iteration**, record: issue ID, reproducible input/state, expected/observed output, failure hypothesis, root cause, changed files, cross-feature blast radius, negative control, actual test command/result, screenshot or trace when a UI feature, and remaining trade-offs. Run `npm run chore:lint`, `npm run test:signal`, `npm run test:catalog`, targeted tests, then full test suites when browsers are available. If a test cannot run, record the exact blocker; never mark it passed.
3. **Complexity gate:** ESLint's cyclomatic `complexity` rule has a ceiling of **20**. `npm run chore:lint` fails any new >20-complexity function, increase over a frozen legacy exception, unreachable code, unsafe `finally`, or invalid `typeof`. The `qa/complexity-baseline.json` lists **existing technical debt**, not permission to add more. Do not regenerate it just to obtain a green build; updates require a reviewed refactor rationale and QA signoff. Decompose newly written logic that exceeds 20.
4. **After the first failed error-fix hypothesis**, stop changing code and research that error online: original maintainers' issues, official docs, research papers, and genuinely comparable reports. Record what alternative mechanism they found, why the first hypothesis failed, and a discriminating test before the next attempt.
5. For every product/algorithm/UX decision, ask what a specialist would reject under the strongest feasible benchmark. Research primary sources and challenge the choice. Make each trade-off visible to the user and in the issue ledger; never silently optimize for minimal implementation effort. Do not describe approximate acoustic proxies as scientifically validated measurements.

## Investigation and red-team cadence

For each new screen, exercise, phase, and pose:

- Inventory all controls, words, icons, canvases, timers, focus/hover states, help, empty/loading/error states, audio sources, storage, analytics, and backend side effects. Describe reading order left-to-right/top-to-bottom in a Z path at desktop, phone portrait and landscape; inspect all edges, clipped text, sticky chrome, occlusion, hidden focus, size and contrast.
- Perform **five analytical passes**: requirements and pedagogy; data/state/timer mathematics; signal/audio methodological validity; accessibility/i18n; API/storage/security and integration.
- Perform **five adversarial passes**: empty/denied/malformed state; fast double actions/races; delayed/background/disconnected devices; boundary values/harmonics/permission and storage failure; navigation/refresh/undo/locale and paid/unpaid permission bypass.
- Perform **four aesthetic/pose passes**: composition and reading path; visual geometry and overflow; responsive/touch/keyboard/reduced-motion; timeliness and correspondence of animations/labels to actual actions. For every pose, use geometric measurements and re-test related poses when a shared cause is found.
- Perform **six representative interaction rounds per exercise**, varying options and action order. Capture ready/live/paused/stopped states, emitted events and a per-tick timeline where it matters. Independent QA must try unexpected transitions and spot-check any fixes outside their original screen family.
- Use a tiered ledger: P0 invalid results/privacy/payment/security; P1 blocked workflows or scoring integrity; P2 usability/accessibility/visual; P3 cosmetic/docs. Every P0/P1 requires an expected-versus-actual regression test and cross-exercise review before closure.

An unperformed pass is **open work**, not an implicit pass. Respect real hardware limits: synthesized microphone signals verify code paths but do not validate acoustic accuracy on real devices/voices. Real mic and expert-annotated recordings are a distinct release gate.

## Independent review thread

Assign a read-only QA/red-team reviewer when collaboration is available. The reviewer must challenge implementation threads, request evidence, try to disprove each claimed fix, and run surprise spot-checks on shared dependencies, especially timekeeping, octave transposition, pitch aliases, recording permissions, local persistence, payments and accessibility. Reviewer signs off on actual artifacts and negative controls, not task descriptions.

## Production release gates

- `npm run chore:lint`, `npm run test:signal`, `npm run test:catalog`, worker tests, targeted Playwright UI/audio, cross-browser smoke and CI green at the exact candidate SHA.
- Browser-visible clicks with real focus order; no invisible DOM manipulation. Verify desktop, phone portrait/landscape, focus trap, reduced motion, microphone denied/revoked, and recording interruption.
- Voice-science acceptance tested on an independent labelled corpus across devices; pitch scoring separated from accompaniment bleed and intentionally sung vibrato. Explicitly label guided and self-rated outcomes.
- Security review of auth, entitlements, Stripe/Mercado Pago webhooks, refunds, storage failures and privacy; never expose secrets or real recordings in test artifacts.
- Confirm Pages build SHA equals the released commit and re-run the live smoke suite. Never call a local-only patch deployed or call a test unrun green.

Primary research starting points: [YIN](https://pubmed.ncbi.nlm.nih.gov/12002874/), [WCAG 2.2](https://www.w3.org/TR/WCAG22/), [Playwright best practices](https://playwright.dev/docs/best-practices), [OWASP ASVS](https://owasp.org/projects/asvs), [ESLint complexity](https://eslint.org/docs/latest/rules/complexity), [NIDCD voice health](https://www.nidcd.nih.gov/health/taking-care-your-voice).
