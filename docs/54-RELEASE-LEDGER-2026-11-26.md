# Release ledger — 2026-11-26

## Feature completion follow-up — 2026-11-27

The subsequent [recent-PR red-team round](60-FEATURE-COMPLETION-2026-11-27.md)
integrates PR58 phone fit and PR59 session/active-time/reminder fixes with
main03f59bc. It additionally corrects late-hidden permission credit, rate
ladder wall-time scoring, and a reproduced cross-tab account-pull data loss.
Weekly days and sessions are labeled separately and existing custom targets
are preserved. That branch has its own CI/served-release gate; the completed
deployment below verifies03f59bc, not these newer features. Payment security
completion is isolated on a different branch and payments remain disabled.

## Post-merge verification — 2026-11-27

This entry supersedes the earlier pending/blocked release status below while
preserving those observations as history. [PR55](https://github.com/PillB/vocal-singing-training/pull/55)
merged as `03f59bc0aa854ac1d54a4255cc9312995f4f3568` after its exact head
`54307b81b4b1a7b3714f9ab5f7a74074eb30c7bb` had 37 successful checks and
three intentional manual/nightly skips. The local checkout was brought onto
that main commit after preserving operator documentation as commit `2beaa81`;
ignored identity/configuration files retained their byte hashes. No private
binding file in the historical Documents checkout was changed.

| Target / oracle | Observed result and evidence |
| --- | --- |
| Pages publishing at merged main | [Deployment46001538365](https://github.com/PillB/vocal-singing-training/actions/runs/46001538365) succeeded at `03f59bc`. |
| Production bytes | Independent HTTPS check and hosted verification both matched index.html and all77 versioned assets. An index mismatch, stale same-version asset or HTTP404 fails the existing negative controls. |
| Production live browser | [Job140516303208](https://github.com/PillB/vocal-singing-training/actions/runs/46002164387/job/140516303208), manually dispatched on merged main: Chromium9/9 passed in9.9s. The workflow's automatic post-deployment trigger was not observed this round; manual dispatch is verified. |
| Cloudflare preview | Its separately packaged index/all77 assets were freshly rechecked; its earlier hosted Chromium9/9 remains the browser evidence. Source8c87acc and active version29b171b5 are unchanged. This is local practice only, with accounts/payments/sync off. |
| Deployment regression controls | [Post-merge ops job](https://github.com/PillB/vocal-singing-training/actions/runs/46001539676/job/140516591692) killed all12 mutants, measured0.40s each. The earlier60s allowance remains a conservative scheduling policy, not this measurement. |
| Broader post-merge CI | [Run46001539676](https://github.com/PillB/vocal-singing-training/actions/runs/46001539676) was still running when this entry was saved; contracts/core, integration-focus and ops had passed. Do not label the whole run complete from those jobs alone. |

The round selected independent live-byte checks plus hosted Chromium over
repeating the known broken local macOS browser launch. This checks the deployed
release and avoids relabeling synthetic UI as physical audio evidence. No app
code changed in this documentation round; fresh `npm run lint` passed,
including all14 lint-gate controls. Exact-head core/browser gates are recorded
above rather than rerun against unchanged code. Existing mutation
and malformed-release controls establish the wrong-behavior oracle.

Remaining gates: PR54's checkout/portal issues60/61, original backend
ownership/key/data recovery issue62, authenticated origin migration, actual
iOS/acoustic audio and human accessibility checks. The earlier local latency
failure and four billing TODOs remain recorded. GitHub wiki publication and
health-alarm activation are not claimed. Public documentation excludes private
operator IDs; the ignored receipts are not an encrypted external backup.

## Subsequent deployment round: PyArcana web-route reference

The earlier approval-review limitation below was temporary. On the user's
deployment follow-up, remote reads and deployment became available again;
main/PR heads were refreshed and matched the saved snapshot. The original
round's blocked results are preserved as history, not current final status.

Implemented [Cloudflare static frontend deployment](55-CLOUDFLARE-FRONTEND.md)
using the actual PyArcana deployment lesson and primary Cloudflare docs.
Exact-main8c87acc preview is live, separate from the entitlements Workers.
HTML/all77 asset bytes, headers and private/missing404 controls passed.
The first path validator rejected a legitimate generated filename; independent
QA found it, the rule and a positive regression were fixed before upload.
The first OP11 mutant control depended on diagnostic wording; reorder to test
actual committed-server-file publication first. OP10–OP12 all killed.

The isolated frontend explicitly keeps API/accounts/payments/sync off pending
origin, Google authorization and account/data continuity. That limitation is
visible in both languages, not absorbed as a silent trade-off. Response CSP
blocks off-origin requests while retaining local microphone/audio capability.

The full core suite can now bind its localhost contracts. Initial expanded
tree result:1494 tests,1490 passed,0 failed,4 existing billing TODOs. The two
additional TODOs are VG-100's Stripe/Creem past-due cancellation ordering,
alongside QA-W03 and QA-W07; they are unresolved payment gates, not successes.
Final source checks and hosted live-browser evidence must be recorded against
their actual commit. See docs55 for deployment version and current gates.

A subsequent full-core run reported1497 tests:1492 passed,1 failed,4 TODOs.
The failure was the unchanged five-year milestone performance test:76.9ms
against its60ms budget during parallel execution. Running that exact test in
isolation passed; both its source and the runtime module match main8c87acc.
This suggests load sensitivity but does not prove the exact cause. The failed
run is retained; no threshold, retry policy or runtime algorithm was relaxed.
Require exact-head hosted CI and track this latency failure separately from
the deployment packager's passing functional controls. [Node's execution model](https://nodejs.org/docs/latest-v24.x/api/test.html#test-runner-execution-model)
documents parallel file processes; a single isolated pass does not erase the
parallel failure.

Final deployed-site evidence: Cloudflare live Chromium9/9 passed in
[job140302364504](https://github.com/PillB/vocal-singing-training/actions/runs/45936989152/job/140302364504),
including local-only configuration and no external requests. Both the
Cloudflare package and existing Pages index/all77 assets matched their
respective expected bytes. Issue contexts were published as
[60](https://github.com/PillB/vocal-singing-training/issues/60),
[61](https://github.com/PillB/vocal-singing-training/issues/61) and
[62](https://github.com/PillB/vocal-singing-training/issues/62); issue29 has
the linked deployment update. PR55 carries the implementation; require its
exact-head CI before merge. The GitHub wiki itself is still unpublished;
versioned wiki content is preserved with the code. Physical/mobile/zoom and
authenticated cutover gates are not closed by desktop Chromium.

This is an evidence snapshot, not a claim that all features are production ready.
Public topology: [deployment and recovery](53-DEPLOYMENT-OWNERSHIP-AND-RECOVERY.md).
Research: [learning routes](wiki/Research-and-learning-routes.md).
Publishable issue context: [issue drafts](issues/README.md).
The existing GitHub tracking issue is [#29](https://github.com/PillB/vocal-singing-training/issues/29).

## Baseline, freshness and publication

The last successful GitHub snapshot on this date identified main
`8c87acc4627b0308bd19c5145fdce37ef1cd4e9c`. Remote state can change; re-read
heads and checks before any merge. Saved checks are evidence for their exact
commit, never for an eventual merge commit.

| PR | Last verified head / state | Decision and remaining gate |
| --- | --- | --- |
| [52](https://github.com/PillB/vocal-singing-training/pull/52) | `4c819cffb2b3fc2c3622e2f3595004a0c9a4a794`; merged | Skill routines, historical song tasks and integration fixes are in main. Do not republish its old branch over newer main. |
| [53](https://github.com/PillB/vocal-singing-training/pull/53) | `e9d3a3e143b7f135be6cec57843fd9d8751a9be7`; open, 26 successful / 2 skipped checks | Base is the BreathFlow feature branch. Merge only into that branch after a fresh check; keep PR51 draft pending its physical, human and integration gates. |
| [54](https://github.com/PillB/vocal-singing-training/pull/54) | `48fb14bed099e3f4139c892ebb31b66a0f58fd9e`; open, 41 successful / 1 cancelled / 2 skipped checks | Hold payment release: duplicate-checkout and portal-authorization findings below. The latest saved cancellation is `browser (2)`, not an inferred billing failure. Earlier billing cancellation is historical evidence only. |
| [55](https://github.com/PillB/vocal-singing-training/pull/55) | `d0f2b339592e93a051aba9bb7a759de61ee18f03`; open, 34 successful / 2 skipped checks | Deployment code matches the reviewed implementation. Integrating with newer main exposes the CI omission fixed in this round. Require CI on the combined tree before merging. |

This round's local integration merges that main and PR55 without resetting
either tree. GitHub refresh/merges, issue posting and wiki publishing were
**not executed**: automatic approval review could not complete because of the
session usage limit. No alternate remote write path was attempted. The files
under `docs/wiki/` and `docs/issues/` are saved content, not published pages or
created issue numbers. Remote operations require a fresh snapshot when review
becomes available.

## Root causes, fixes and shared paths

| ID / screen or mode | Actual vs expected; root cause | Fix / evidence / scope |
| --- | --- | --- |
| OPS-01 · service ownership | Existing public Worker was mistaken for a service in the selected login. A hostname, OAuth client ID and git author identify different things. | Complete successful destination inventory was empty before replication. Original Worker exists in another unresolved account. Private inventory preserves verified login/binding evidence; public map marks unknown ownership. No migration claimed. |
| OPS-02 · setup / signing | Failed or malformed secret listing could follow the same branch as a genuinely empty list and generate a new key. | Require command success and a complete top-level JSON array; nested error `result: []` is invalid. Positive existing-key and empty-account cases plus malformed/error controls; OP5 mutation. Shared path: all setup invocations. |
| OPS-03 · deploy / rollback | Local branch name and a separately chosen probe URL could validate the wrong source or account. | `wrangler.sh` archives fresh remote main; verifies identity, actual subdomain, real KV/D1 membership, unchanged JWK, source annotation and before/after versions. OP1–OP4, OP8–OP9 mutations. Concurrency is optimistic; another operator is not atomically locked out. |
| OPS-04 · release assets | PR tests alone cannot detect cached HTML paired with stale stamped scripts. | New release checker compares deployed index and every versioned asset; stale HTML, stale same-version asset and HTTP404 controls. OP6–OP7. Live workflow follows Pages deployment, then runs Playwright. This round's post-merge run is still unverified. |
| INT-01 · CI source drift | Newer main explicitly names Node mutation sets; PR55 adds `ops` only to local defaults. Combined tree silently omitted all nine ops mutants from CI. | Existing matrix oracle reproduced `missing: ['ops']`. Add isolated `ops` job; update L64/L65 anchors and add L67 removal mutant. Green matrix plus L64–L67 all killed and restored. Shared path: every future set addition, not only ops. |
| CUR-01 · skill routine / sync | False pending milestone flags were dropped by true-only merge; plausible unknown stage keys could create phantom milestones. | PR52 uses distinct true earned/seen keys with migration and exact memberships; real merge in both orders and malformed keys. Practice counts remain participation, not competence. |
| CUR-02 · song / onset | Breath length, sex-based keys and acoustic traces were overstated as safety/physiology measures. | PR52 adds rest/short phrases/comfortable key and gentle starts; eight bilingual desk reviews, source-linked score tasks, no recording/modern arrangement copied. Teacher/device validation is separate. |
| BF-01 · save / resume | Retrying after quota failure could count a round twice or overwrite a newer tab's day bag. | PR53 caches the round receipt, merges retry data through real `VTDays.merge`; BF-M15/M16. Same-day max semantics are preserved, not silently changed to additive totals. |
| BF-02 · guide / microphone | Guide audio could remain running when requesting the mic; shared viewport fitter could jump to the stage top. | PR53 stops the real guide context before `getUserMedia`; removes fitter scroll. BF-M14/M18. Earlier smooth-scroll test failure came from probing before navigation settled; retain meaningful scrolled baseline and <=2px oracle. Browser context state does not prove physical speaker sound. |
| PAY-01 · PR54 checkout | Concurrent authenticated requests return two checkout URLs with different request IDs; both paid signed events can bind separate subscriptions. Checking only already-linked subscriptions leaves a pre-webhook window. | Reproduced on `b791748`; latest saved head has identical checkout source. Full outputs: [checkout context](issues/checkout-concurrency.md). Atomic pending reservation plus stable provider attempt identity is required; no fix claimed here. |
| PAY-02 · PR54 portal | A different verified account can link an unbound payer's bearer license, request that payer's portal, and block the actual payer from linking. License access was reused as billing-management authority. | Reproduced on `b791748`; latest saved head has identical checkout/accounts source. [Authorization context](issues/portal-authorization.md). Require authoritative payer/account binding or disable this portal route until established; no real account exploited. |

## Pre-execution alternatives and trade-offs

1. Deploy from an operator's mutable checkout vs an isolated exact-main
   snapshot: retain the latter. It excludes unpublished local changes and needs
   network/disk, but preserves policy and private binding separation.
2. Restore bare `node qa/mutate.mjs` in one job vs add `ops` to the isolated
   matrix: use the matrix. The former recreates QA-75's timeout. Another job
   costs runner setup but makes this gate visible and contains runtime growth.
3. Pretend an unobserved timing is measured vs explicitly budget it: reserve
   **60 seconds per ops mutant**, 9 minutes in a 25-minute job, until hosted
   samples exist. This is a provisional scheduling allowance, not a measured
   performance claim. Capture its `TIME [ops]` line and replace the allowance
   with a conservative hosted rate; keep the half-time-limit gate.
4. Cut over to a new empty Worker vs preserve production while preparing a
   replica: preserve production. The replica has a new signing identity and
   empty user state. No seamless migration exists without source data and
   key/identity continuity or an explicit recovery/re-enrollment design.
5. Copy another course's progress engine vs adapt its learning-flow ideas to
   existing session sets: retain current storage/recorder/engine authorities.
   No new UI or voice-efficacy claim is introduced by the research notes.

## Validation and adversarial rounds

| Round | Attack → defense → observable result |
| --- | --- |
| 1 · malformed / missing | Missing CI set → exact matrix/default parity. Original combined tree fails naming `ops`; revised tree passes eight matrix tests. |
| 2 · race / interruption | Reintroduce monolithic job, omit guards, remove timeout, omit ops → budget/parity oracles. L64–L67 are all killed, files restored. Checkout and portal races remain open, with controlled original outputs saved in issue context. |
| 3 · accessibility / occlusion | No product UI/pose changed in this round. Prior desktop/narrow/zoom/keyboard evidence is linked in docs52; it is not relabeled as a fresh device test. Physical hit testing remains a gate. |
| 4 · scientific / numerical | Challenge participation=mastery and one SOVT fits everyone → retain practice labels, uncertainty, comfortable self-selected key and transfer tasks. [Primary evidence and limits](wiki/Research-and-learning-routes.md); no diagnostic algorithm or exercise dose changed. |
| 5 · integration / privacy / CI | New main plus a separately green PR → reproduce actual missing-set failure before editing. Keep public topology separate from ignored private identities and binding IDs. Preserve exact checked heads and pending-publication status. |

Four aesthetic/legibility passes (desktop, narrow mobile, zoom/keyboard,
color/locale) and anatomical pose audits are **not newly executed**: this
round changes CI/operator documents only. Prior browser evidence cannot
substitute for a physical-device release gate. Do not invent screenshots or
human reviews.

Current validation: lint passes (complexity <=15; 272 unchanged legacy
exceptions), 12 matrix/mutant-ID tests, 26 deployment/setup tests and 79
curriculum/session-set/voice-path tests pass (117 focused tests in total).
All 67 lint mutants are killed and restored, including L64–L67. Independent QA repeated the eight matrix
tests and four mutant-ID tests, checked L64/L65/L67 in isolated copies and
approved the scoped CI fix with no blocker. The unchanged live-release HTTP
test and full ops mutation set were not rerun under the port restriction.
`npm run test:core` passed lint and the 52-exercise catalog check, then stopped
at `qa/check-redeploy.mjs`: sandbox `listen EPERM 127.0.0.1`. The current full
suite is **blocked, not passed**. Prior ops release recorded 1359 passed,
0 failed and 2 existing billing TODOs on its own tree; those counts are not
reused as proof for this new integration. Local Chromium's previously
reproduced macOS launch failure also remains unresolved; use hosted Chromium
and WebKit plus actual iOS/audio signoff when available.

## Resume order and acceptance gates

1. Refresh main, all PR heads/bases and completed checks; inspect drift.
2. Publish this integration fix over the latest compatible branch without
   force-overwriting other work. Require exact-head core/browser/mutation CI,
   including `node-mutation (ops)` and its timing artifact/log.
3. Recheck and merge PR53 into its feature base only. Keep PR51 draft.
4. Merge the deployment integration only after combined CI is green. Verify
   Pages build SHA, deployed HTML/all assets and live Playwright. Arm the
   health alarm only with verified private recipient/secret references and
   an alert drill. The last variables listing had zero configured variables.
5. Post the existing issue29 update; search for duplicate payment/recovery
   issues before creating new ones. Publish the saved wiki pages only after
   reconciling any existing wiki. GitHub's wiki is a separate Git repository;
   an initial page may need creation before clone. No wiki initialization or
   credential failure is inferred from an unauthenticated Git prompt alone.
6. Keep payments off and PR54 held until both payment issues pass adversarial
   tests on the exact new head. Retest historical QA-W03/W07 TODOs too.
7. Verify original account ownership, source backup/key recovery, Google/admin
   login, data continuity and actual-device audio before any frontend cutover.

Update this ledger, the issue context, wiki and private inventory after each
verified change; record its SHA, method, observed result and what remains
unverified. Temporary files are evidence staging, never the sole handoff.

Platform research rechecked this round:
[GitHub job timeout/matrix semantics](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-syntax),
[Playwright observable assertions](https://playwright.dev/docs/test-assertions),
[CSSOM scrolling specification, working draft](https://www.w3.org/TR/cssom-view-1/).
The half-limit budget is a project policy derived from observed runner variance,
not a guarantee offered by GitHub. Observable assertion polling is distinct
from retrying an entire failing test. The scroll specification is a draft;
actual browser behavior still needs its regression suite.
