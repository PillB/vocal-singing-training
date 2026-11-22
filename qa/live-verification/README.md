# Live deployment verification — 2026-11-21

Target: https://pillb.github.io/vocal-singing-training/, deployed main
`801755ddf1577b4924aba355742cd19bb0df53f9` (Pages build 1388941143).
Recent merged changes: #45 payment rails, #46 account/sync security, #44 nightly
coverage. Open #49 repairs two test races; #47/#48/#50 are unpublished changes.
This isolated audit branch changes no deployed application file.

Expected: deployed HTML and every referenced versioned asset match that commit;
public health reads succeed, production-origin CORS is correct; the existing
live suite passes in Chromium, Firefox and WebKit; desktop, portrait phone and
landscape phone can open an exercise, reach Start/metrics and return home.
Wrong versions, failed HTTP responses, unavailable bindings, hidden/occluded
controls, uncaught page errors and failed interactions are hard failures.

Five review passes: publication identity/cache; HTTP/CORS failure paths;
actual pointer actionability; navigation/reset and viewport bounds; production
privacy (GET-only API checks, no sign-in/checkout, browser-local test state).
Screenshots cover desktop, narrow mobile and landscape. Physical device/audio,
high zoom and a real authenticated/payment journey remain outside this audit.
The existing live exercise test uses synthetic microphone input.

Local Chromium cannot register its macOS process services; shell DNS is also
unavailable. Fresh verification therefore runs on GitHub-hosted Linux runners.
Three engines and three viewport journeys cost extra CI time but test the actual
public deployment; saved screenshots/JSON/traces support diagnosis. A failing
suite or audit fails the final job even though both evidence steps are allowed
to finish. Results are evidence for this commit and timestamp only.

First live run 44980101678: all six HTML files and 74 assets match main;
1280x800, 390x844 and 844x390 real-pointer navigation passed, no page errors.
The worker is demonstrably old: no probe/db/kv result and trialDays 30.
22/24 live cases passed; Firefox/WebKit Start timed out with the Chromium-only
microphone fixture. Retry with the already established shared-audio-context
and prototype fixture from tests/helpers/e2e.js and cross-browser-audio.spec.js.
The original failures remain in the first run's traces; no app file changes.
Wrangler is signed out and there are no repository Actions secrets, so a real
worker deployment needs an authenticated Cloudflare session.

Second run 44980588595: 23/24 cases pass; WebKit's Start case is now green with
the shared graph. Firefox still times out. Add console/start-state diagnostics
before attributing it to production code. Published files and all three viewport
journeys pass again; the old worker remains the audit's confirmed failure.

Third run 44981062764 retains 23/24 passes. Firefox diagnostics show
practiceStarting true and the shared/piano graph suspended, with no JS error.
The fixture itself awaits resume before returning a stream, unlike the existing
tests/helpers/e2e.js fixture: this can wait indefinitely before production's
bounded graph setup even receives the microphone. Remove that fixture-owned
await and let the production engine perform its normal resume/timeout handling.
Expected: Start becomes live, silence remains zero and Space counts; suspended
or failed production startup must still fail the unchanged assertions. Do not
relax autoplay preferences or claim speaker/microphone hardware verification.
Evidence: https://www.w3.org/TR/webaudio/#dom-audiocontext-resume specifies
pending promises for a context not yet allowed to start; MDN's autoplay guide
explains that browser policies vary. The shared-graph hypothesis corrected
WebKit but did not resolve Firefox; preserve all prior failing traces.
