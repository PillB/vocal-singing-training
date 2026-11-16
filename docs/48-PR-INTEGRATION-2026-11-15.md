# PR and CI integration — 2026-11-15

## Evidence and diagnosis

Main at `1ae3693` passed its ordinary checks but failed the nightly sweep in
run [43721497915](https://github.com/PillB/vocal-singing-training/actions/runs/43721497915).

| Finding | Actual versus expected | Root cause / response |
| --- | --- | --- |
| Voice/live job | Stopped after 4,800 seconds before all formats completed | Two large serial specs shared one budget. Run the live spec alone and each of the six headed formats in its own job, preserving all 52 exercises per format. |
| Fullscreen solfège metrics | `btn-toggle-metrics` reported `hit_miss`, top element null | The sweep scrolled the target into view, then immediately called `fit()`, which scrolls back to the top. A shared pointer helper performs a trial action to scroll and check actionability, then verifies the real hit target and clicks with the mouse, without resetting scroll. |
| Short-screen diction | Stage bottom 566.7 px against a 560 px viewport | CI reproduced this after #40: a fitted 433 px stage grew to 448 px while the optional guide still occupied 115 px. Fit the guide before testing whether picture content needs more stage height. Keep both screen bounds and picture clipping as hard assertions. |
| macOS WebKit design selector | Claude measured 119×22 px instead of the 44 px touch target | The selector still used native appearance. Draw the closed select with CSS, including its arrow, while keeping native selection and keyboard behaviour. A dedicated macOS WebKit job runs both designs across all 30 device sizes and the design-selection suite. SL1 restores the original native-select CSS rule and must be caught on macOS. |
| Layout-suite authentication noise | Intermittent WebKit console errors from the live worker rejecting localhost | Stub the authentication-methods response at the network boundary for these layout tests. Live CORS is a separate contract; these layout cases no longer depend on a production service. |

Playwright's [actionability contract](https://playwright.dev/docs/actionability)
requires visible, stable, enabled targets receiving events. Its
[timeout documentation](https://playwright.dev/docs/test-timeouts) distinguishes
the whole-suite deadline from each test's deadline. The change preserves both
deadlines and partitions coverage instead of discarding it.
The CSS appearance change follows the
[platform appearance contract](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/appearance).
Forced-colour mode retains the operating system's control appearance.

## Related PRs and Claude records

- #40 merged as `ad5d35c`: boot layout shift, mic row slack, trial singular
  wording and route scroll restoration.
- #36 was reconciled with that main. Only cache-reference conflicts needed
  resolution; evidence texts and their reading hashes remain intact.
- #38 was reconciled with that main. Both `pitch` and `ledger` mutation sets
  remain enabled; account and transaction code merged without text conflicts.
- Local Claude sessions from November 12 recorded WebKit sizing/CORS findings,
  a missing Chromium installation on an older run, and an undeployed worker.
  The select and layout-test isolation findings are now carried into the Mac CI
  job; its result is still required. The other Claude
  checkout and its uncommitted worker bindings were left untouched.

## Verification and review ledger

The focused GitHub job passed both real metrics clicks and the occlusion
control, and failed on the same 566.7 px diction stage as the nightly run.
Extra measurements showed the premature growth before the guide could fold.
NS5 restores that ordering and must fail the same geometry test in CI.

The partition guard was red on the combined job, then passed with all six
formats exactly once. Three deliberately broken schedules were caught: a
duplicate desktop replacing short, a missing format environment variable, and
loss of solfège from PR smoke. Lint passed. Browser regressions include both
real metrics toggles and a covered-button negative control. NS4 removes the
scroll/actionability step and must fail the below-fold test in CI.

Five review passes: (1) malformed/duplicate schedule inputs, (2) geometry and
scroll changes between pointer movement and click, (3) occlusion with a genuine
overlay, (4) preservation of all exercise/format coverage and timeout bounds,
(5) branch integration, cache history and privacy. The CI/layout fixes change
no audio, billing, scientific scoring or pose instructions. This branch also
integrates #36's evidence wording and #38's worker changes for combined CI;
their separate reviews and rollout limits still apply. The mutation registry
retains all evidence guards plus `pitch`, `ledger` and `nightly` defaults.

On the separately reconciled branches, all 25 evidence mutations and all 143
ledger mutations were killed locally. GitHub's full core check passed for both
heads before browser/mutation jobs began.

Local browser launch fails at macOS Mach-port registration; the complete core
command also cannot open the redeploy checker's localhost socket. A separate
Node child-process contract cannot resolve its home directory with its minimal
environment. These checks are unverified locally and must be read from fresh
GitHub CI. Desktop, narrow mobile, zoom/keyboard and locale/animation visual
passes are likewise unverified locally. No real-microphone, physical Safari or
worker-deployment success is claimed.

## Trade-offs

The schedule uses more independent runners and setup steps, in exchange for
bounded completion of every format. Aggregate exercise coverage is unchanged.
PR fullscreen smoke adds the failing solfège exercise, increasing its runtime.
The click helper can spend five seconds diagnosing a blocked control; it never
forces a click or treats a failed hit test as success. The dedicated focused
job duplicates four small tests from the full browser suite to surface nightly
regressions early. On a short screen, optional guide rows may fold into the
existing button for all steps before the picture is allowed to grow; the
picture's words and primary controls keep their space. Worker rollout and
real-device verification remain separate.
The selector has a CSS arrow and border in ordinary colour mode; its open picker
and keyboard selection remain native. The Mac job adds runner time and covers
desktop macOS WebKit at device viewports, not physical iPhones or Safari's app UI.

## Follow-up CI findings

The first Mac run passed 96 of 98 layout cases, including all device sizes.
Two existing swipe cases failed before reaching their assertions because
macOS WebKit rejects construction of `Touch`. The helper now dispatches
portable synthetic DOM events with the touch records consumed by the real
listener. Its direction, distance, diagonal and design-A assertions remain.
This follows the [Touch constructor compatibility limitation](https://developer.mozilla.org/en-US/docs/Web/API/Touch/Touch)
and the [synthetic Event API](https://developer.mozilla.org/en-US/docs/Web/API/Event/Event).
These are listener checks, not physical swipe verification. SL1 restores the
entire original select rule: custom borders/backgrounds can also affect native
styling, so removing only appearance declarations is not a complete regression.
The guide page's updated stylesheet reference is included with this correction;
the core asset gate correctly rejected the earlier omitted page.

The corrected Mac suite passed all 98 cases. Its nested mutation runner then
failed its unmodified baseline during web-server readiness (30 seconds), before
any selector mutation ran. Give that runner its own existing configurable port
(8766, with direct Python startup) and enable Playwright web-server diagnostics.
The baseline must still pass before the original CSS rule can be judged;
no timeout, skip or layout threshold is relaxed. The earlier nightly run can
continue because its application tree and sweep definitions are unchanged.

Changing the port did not fix the Mac nested runner: diagnostics show its
Python process starts but HTTP readiness changes from refused to timed out.
The direct Playwright command again passed all 98 cases. Run SL1 directly from
the CI shell too, instead of under the synchronous Node mutation subprocess.
The [Node child-process contract](https://nodejs.org/api/child_process.html#synchronous-process-creation)
explains that synchronous execution blocks the parent; the precise Mac
network/process interaction remains unproven. The dedicated shell check uses
the same canonical SL1 CSS mutation, restores the file on exit, first requires
a clean baseline, and accepts a kill only when both designs report the measured
selector-size assertion. Empty reports, unrelated errors, server timeouts and
browser failures are explicitly rejected by its result classifier. This adds
a small dedicated runner but prevents infrastructure errors masquerading as
regression detection. Playwright's [server readiness contract](https://playwright.dev/docs/test-webserver)
is retained, with the same timeout.
