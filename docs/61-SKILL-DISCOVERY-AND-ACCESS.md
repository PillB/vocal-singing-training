# Skill discovery, authentic transfer and access — 2026-11-27

User priority: integrate PR51/53/64/65 with59/63; reveal optional skill training
on the second website visit without overwhelming the first. A visit means a
new tab browsing session with the same local browser storage; reloading or
restoring that tab does not count again. This is not an authentication event.
Only functional discovery preferences are stored locally, with no analytics,
account ID or extra network request. If storage is unavailable, keep the
ordinary optional menu route usable without pretending a visit was counted.

## Choices before execution

Reject an automatic modal, focus jump, endless pulse or flashing reward.
Choose a brief accent glow on a small optional returning-visit entry, using
existing website colors. Respect prefers-reduced-motion; keep a durable text
label, keyboard path,44px controls, and no notification repeated on reload.
The primary daily-practice action and every individual exercise stay free.

Reject silently charging or starting a trial from discovery. Tag all10 skills
as Pro; keep their explicit launch-preview access until the operator enables
`skillSetsRequirePro`. The actual `skill_sets` capability is Pro/trial-only;
the launch preview is a separately labeled availability policy. Later, a free
visitor can read the teaching cards and deliberately open existing Pro/trial
details. A trial starts only through the existing explicit opt-in. Show its
real expiry date, never a resetting urgency counter or invented scarcity.

Trade-offs: preserving an in-progress session after access expires avoids
discarding practice or interrupting recording; starting a new premium skill
set is checked again. History is never deleted. Static-client gates cannot
make publicly shipped curriculum confidential or stop a rewritten client;
they are entitlement-controlled UX, with the existing signed-license model,
not a claim of server-side content secrecy. Paid activation remains blocked
by payment issues60/61 and backend migration/recovery62.

Reject treating a checklist or graph as retained singing competence. PR65's
transfer text disappeared after the picker and several sequences still ended
on drills. Carry cue/attempt/transfer/fallback into real practice and review,
end appropriate sets on authentic song/speech tasks, and offer optional visual
feedback fading while retaining reference audio and all Stop/permission controls.
Voice-recovery work remains rest/reflection, not a demand to sing while hoarse.

## Research and its limits

- [W3C animation guidance](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions): support reduced motion. No proof that a glow improves retention/conversion.
- [FTC dark-pattern findings](https://www.ftc.gov/news-events/news/press-releases/2022/09/ftc-report-shows-rise-sophisticated-dark-patterns-designed-trick-trap-consumers): reject misleading timers and trial/cancel traps. Use truthful value and user choice.
- [Motor-learning/voice clinical review](https://pubmed.ncbi.nlm.nih.gov/41941658/): supports examining practice/feedback/retention; small clinical studies do not establish this app's healthy-singer efficacy.
- [Singer scoping review](https://pubmed.ncbi.nlm.nih.gov/41058356/):20 studies include SOVT, VFE and warmups, with heterogeneous methods. It is not20 confirmations of these exact sets.
- [Respiratory training review](https://pubmed.ncbi.nlm.nih.gov/42185121/):7 studies; musical-performance transfer remains inconclusive. Do not reward breath-holding or force.

No neuroscience claim is used to justify a conversion tactic. Conversion and
learning are separate outcomes; a future consented evaluation must measure
retention/transfer and voluntary trial continuation separately.

## Falsifiable acceptance and source drift

First/new-tab second/reload/BF-cache/blocked storage; local dates and expiry;
free/preview/trial/paid/revoked or stale state; locked direct start; preserved
history and individual exercises; authentic final task visible after navigation;
optional trace off while piano and Stop remain usable; reset on leaving the
set; desktop/narrow/landscape/zoom/keyboard/es/en/reduced-motion hit tests.
Plant each old behavior and require its own regression to fail. New/edited
functions retain modified complexity<=15. Broken set IDs, missing Pro tags,
missing translation and malformed discovery state must fail visibly in authoring
tests or fall back without blocking ordinary practice. All hosted/live checks
must identify the actual integrated commit; physical devices remain distinct.

## Round evidence and observed integration failures

Integrated local baseline9167e17 includes main5d740f3 (PR64), PR65
4eaa5cedc453e561b24280ec36a768c1ffe68db7, PR59 and PR58. PR63 prior
published head1101ae0 failed hosted browser jobs140532368956/140532368889,
learner mutation140531864693 and macOS layout140528579911; those failures
were read, not retried blindly. Root causes and corrections:

- Late hidden permission: practice clock20s but timer card80s. The first fix
  prevented credit but missed the hidden span used by the card. Initialize
  that span when permission resolves hidden; preserve the existing timer
  policy. LF19 and LF22 independently cover clock and card.
- Weekly goal assertion used a nonexistent translation attribute; use the
  real dynamically labeled #loop-goal-label. Goal selection14→5 remains the
  functional oracle; no product assertion was weakened.
- Region fixture inherited a runner timezone; pin Etc/UTC for unknown-clock
  cases while preserving explicit locale/timezone cases.
- macOS WebKit completed92 but65 did not run before600s. Split into two
  balanced shards; keep the timeout/assertions and run the native-select
  negative control once. Trade-off: another runner, no reduced test scope.
- WebKit's project matcher excluded practice-hidden-time despite the command
  naming it. Include it and the new skill cases explicitly.

Local automated evidence before these final browser fixes: full core1532,
1528pass/0fail/4pre-existing payment TODO;55policy/promise/config tests pass;
29set mutations killed (including SK1–4). Independent QA's14teaching/matrix
checks pass; new SK5–6 and browser LF23–26 registered. Final exact-head CI
and actual live skill tests remain pending until their results are recorded.

Five red-team lenses: malformed/forged/future entitlement (Node verified),
state/race/late permission (hosted defect reproduced, revised fix pending),
accessibility/occlusion (13new independent browser cases pending), scientific
claims/retention (primary-source review with limits above), integration/privacy
(promise inventory reviewed, no new network sink; stale order rejected).
Four aesthetic checks are encoded for desktop, narrow/landscape mobile,
zoom/keyboard, reduced motion/ES/EN; they are unverified until hosted results.
No new anatomical pose is prescribed: ordinary safe catalog guidance remains,
and rest/reflection stays the endpoint of the recovery set.

PR53 merged into the draft BreathFlow base as ca2292f1ed87696bcae8747ed145423f7215cda6
with26green and2intentional skipped checks. It is not a production promotion.
PR51's old browser failure is an ambiguous .guide-site-link a selector after
adding a second distinct guide link; update to the actual full-guide anchor
and retain separate link-destination tests before any feature-branch release.

### Counter-review: delayed listening is a different workflow

Rejected the first clarity repair (v7-record-review): its catalog explicitly
requires waiting a full day, so it cannot fulfill this short same-session
routine. Use v14-pace-variation for a normal-pace recorded baseline, then
clear speech and a new paused message. The authoring gate now rejects any
`audio.reviewWorkflow` exercise in these bounded skill sets; a negative
fixture and SK7 restore the rejected route. Trade-off: baseline practice is
pace-aware, not an objective intelligibility assessment; a listener remains
the meaningful check. Access disclosures are also kept visible in landscape,
where the old compact-header rule hid every muted paragraph.

Final local core on273d4af:1532tests,1528pass,0fail,4existing payment TODO.
The subsequent curriculum/disclosure correction requires refreshed tests/CI.
