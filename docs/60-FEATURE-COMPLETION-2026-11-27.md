# Recent PR completion and red-team evidence — 2026-11-27

Inputs: main03f59bc; PR59 fcea467; PR58 4621a97 (exact fetched refs retained
in git). PR54 payment security work is isolated; PR51 BreathFlow stays a draft.

Before editing, compare two routes: merge individually green PRs unchanged,
or exercise their actual combined tree and preserve newer main's contracts.
Select the latter. PR59 duplicated ops mutations in contracts and the isolated
job; keep main's single isolated ops job,12 planted controls, and preview CI.
This costs an integration run but prevents silently weakening release checks.

| Finding / mode | Wrong behavior and root cause | Selected correction / oracle |
| --- | --- | --- |
| QA-81 / permission | Permission resolves after hiding: enterLivePractice starts its clock after the visibility handler already ran | Start credit only if visible; hidden60s=0 then visible20s=20; visible positive control |
| QA-82 / rate ladder | App excludes hidden time while scored duration still uses performance.now minus start | Pass active practicedSec to mode result;20visible+100hidden produces the existing rounded1-minute input, not2; day/card remain20s. Quantized metric units remain an explicit limitation. |
| QA-83 / account handover | GET pending while another same-account tab saves: old remote response overwrites new take | Previous owner's practice is already stored aside; merge changed current-account work into the pull, mark dirty and sync. Held real GET regression red on cdb06cf, revised2/2 positive/negative controls pass. |
| QA-84 / weekly goal | Generic labels obscure Home's practice days vs History's saved-session target | Explicit units and ES/EN explanation. Preserve chosen session targets; changing them to days would reinterpret existing preferences, including targets over7. |

The goal picker also retains an imported target outside3/5/7 (valid range1–14)
instead of displaying a stale preset; the temporary numeric option names no
plan and never gates practice. Its reviewed promise hash and non-plan mark
inventory were updated after manually reviewing the rendering-only path.

Rejected: pause the whole exercise timer (could leave a hidden microphone
open), use wall time as acoustic practice, overwrite after an async pull, or
silently migrate a session goal into a day goal. Existing daily max merge
semantics and per-account ownership are retained; session counters are not
proof of vocal skill.

Primary research: [Page Visibility](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API),
[cross-tab auth persistence](https://firebase.google.com/docs/auth/web/auth-state-persistence).
Firebase is a comparison of persistence semantics, not a dependency added to
this app. Synthetic hidden events and fake microphone input do not establish
real mobile permission/headset/audio correctness.

## Verification and remaining gates

Focused integration:46 Node tests passed before further red-team fixes;
31 sync/promise tests passed after fixes, including the real-router held-GET
regression. Local Chromium remains blocked by macOS MachPort SIGTRAP; hosted
browser verification is required. No screenshots or physical-device signoff
are invented. The earlier release's9 live checks do not verify this new tree.

Initial full core:1508 tests,1501 passed,3 failed,4 billing TODOs. Two failures
were the promise inventory correctly detecting the changed goal renderer and
its new option marker; both were reviewed and updated, then29 promise tests
passed. The third was the unchanged five-year latency oracle (66.7ms against
60ms under the parallel run); isolated it passed. Preserve that failure and
require fresh exact-head hosted CI. No performance threshold was relaxed.
The new SY62 mutation restoring data loss was killed; LF19–21 are registered
for hosted browser mutation checks, not reported as locally executed.

Five lenses: malformed/drifting stored state (existing shared-path controls),
race/interruption (new regressions), accessibility/occlusion (PR58 phones,
desktop/narrow/zoom/locale suites), numerical validity (active time vs wall
time), and integration/privacy (owner isolation + exact combined CI). Four
visual passes and actual post-merge deployment remain open until their new
evidence exists. No new anatomical or instructional pose claim is introduced.
