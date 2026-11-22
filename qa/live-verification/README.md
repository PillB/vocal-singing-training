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
