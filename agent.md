# Agent entry point — voice and singing app

Read the canonical contract **first**: [`AGENTS.md`](./AGENTS.md)
(repository path: `vocal-singing-training/AGENTS.md`).

For each task, every iteration and red-team round, enforce the following:

1. **Teaching before testing**: observe a human-usable demonstration, sound,
   mouth/tongue/jaw, posture and tactile checkpoints; include a teach-back
   prompt and corrective feedback. A learner clicking through is not evidence
   that their singing or speech mechanics are correct.
2. **Expert challenge**: research primary scientific/platform evidence; state
   at least two viable alternatives, their trade-offs and the reason the best
   expert might reject the tempting one. Record user and device differences.
3. **Anticipate source drift**: inspect current code and external contracts,
   open PRs, workflow SHAs, owners of session/ledger/worker state; compare
   prior assumptions to current behavior before modifying.
4. **Falsifiable tests, not tautologies**: write a correct case, a wrong case,
   and an independent observable oracle. Plant a realistic defect, show the
   test fails because of the defect, restore and show the test passes.
5. **chore(lint)** must run on each task and round:
   `npm run lint && npm run test:core`. Cyclomatic complexity max **15**
   for new/edited functions, with immutable legacy exceptions; no silent
   baseline growth. Use `node qa/mutate-breathflow.mjs` for BreathFlow
   contracts and the relevant targeted Playwright test.
6. **Simulation**: newcomer/returning, day/week/month, second tab,
   profile switch, denied/late audio, mobile, VoiceOver, reduced motion and
   state across all main tabs. Fail with explicit diagnostics and issue IDs,
   not a passing test that skipped the action.
7. **Rendered cross-view oracle after each meaningful step**: never validate only the shared store or API. Observe and assert each affected *visible* Home / History / Plan / daily / weekly / monthly result after setup, Save, profile changes, rollover, navigation and second-tab writes. Add a targeted mutation that breaks the renderer but leaves storage correct; the test **must fail**. Log unvisited combinations as unverified, not as a passed exhaustive simulation.
8. **Four adversarial rounds minimum**, plus the repository's stricter
   five-round / four-aesthetic-pass standard; log attacks, actual executions,
   evidence and remaining blocked cases. No "verified" without execution.
9. **Release** only with same-SHA CI, compatible integration PRs, deployed
   SHA parity, hardware microphone/assistive-tech checks and actual pedagogy
   observations. Never call a draft PR deployed.

Canonical engineering detail and executable lint specification:
[`AGENTS.md`](./AGENTS.md).
Current architecture and FSM ledger:
[`docs/49-BREATHFLOW-AND-STATE-MACHINES.md`](./docs/49-BREATHFLOW-AND-STATE-MACHINES.md).
Visual teaching research and red-team ledger:
[`docs/50-TEACHING-VISUAL-PEDAGOGY.md`](./docs/50-TEACHING-VISUAL-PEDAGOGY.md).

Run (or explicitly mark blocked):
```sh
npm run lint
npm run test:core
node qa/mutate-breathflow.mjs
npx playwright test tests/breathflow.spec.js --project=chromium
```
