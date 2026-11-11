# 46. Two site designs, what they report, and the admin card (2026-11-11)

One round. What changed, why, what it costs, how it was attacked, and what is
still unverified. The method notes for the analytics are in
`docs/38-AB-TESTING.md` ("The two site designs are a preference, not an
experiment"); the admin procedure is `docs/ADMIN-GUIDE.md` 8.13b.

## What was built

| Part | Where | What it does |
|---|---|---|
| The control | `index.html` `#site-version-bar`, `js/site-version.js` | "Diseño del sitio": A · Clásico or B · Enfocado, at the top of the practice site, gone inside an exercise. Painted before first paint from `localStorage`, followed across tabs, previewable with `?version=b`. |
| Design B | `js/site-layout.js`, `css/site-version.css` | Plan, Historial, the statistics and the profiles become one **Progreso** destination with four tabs (swipeable on touch); catalogue groups fold (first open, each closed one says how many exercises it holds); the guide's sections fold and open for the link that points into them. Nothing is removed: every element with an id in A exists in B (tested). |
| What it reports | `js/site-version.js` → `/v1/events` | `layout_session`, `layout_switch`, `layout_time`, under the existing consent, opt-out, GPC and region rules. |
| The reading | `workers/entitlements/src/layouts.js`, `GET /v1/admin/layouts` | Per design: visits, browsers, time, time per visit, browsers that came back (with a Wilson interval), browsers back on another day; switches by direction; how visits started; a daily series. |
| The admin card | `admin.html` `#layouts`, `js/admin-layouts.js` | The caveats first, then tiles, split bars, a daily chart with the same numbers as a table, switches, CSV. Also new on the page: an at-a-glance strip (server up, statistics on, server new enough) and a sticky section bar that marks where you are. |
| The fair test | `site_layout_2026_11` in `js/experiments-config.js` | Randomises the *default* design. Off. |

## Decisions, and what an expert would object to

1. **A visitor-chosen design is not an A/B test, and the dashboard says so.**
   An experimenter would reject "time on B > time on A, ship B": the people
   on B selected themselves, most people never touch a setting, and new things
   get looked at. So the numbers are labelled a preference, the route itself
   carries `readMe: "self_selected"`, and a randomised-default experiment is
   registered for the causal question. *Trade-off:* the dashboard answers
   "what do people choose and use", not "which is better", until the owner
   turns the experiment on; at beta traffic that test needs about 355 browsers
   per arm and three weeks to see 30% → 40%.
2. **Time is engaged time, and a lower bound.** Counting wall-clock time with
   the tab open would credit a design for being left open. Time counts while
   the page is visible and someone acted in the last five minutes (a running
   practice counts as acting). *Trade-off:* reading a long page without
   touching it for five minutes is undercounted, and a browser killed without
   notice loses its last stretch. Both designs are undercounted alike.
3. **A visit ends after 30 quiet minutes, shared by every tab** (the common
   web-analytics convention), so two tabs are one visit and a reload is not a
   new one. *Trade-off:* the counter lives in `localStorage`; a browser that
   clears storage looks new.
4. **Design B regroups; it does not remove.** A card-sort or tree test with
   real users would be the right evidence for the grouping, and there is
   none: the grouping follows the app's own model (do / look back), which is
   an inference. That is exactly why A stays and the choice is measured.
5. **Design B is built from outside `js/app.js`** (observers and the existing
   buttons), one line added there. *Trade-off:* B depends on A's ids and
   classes staying put; the "every id in A is in B" and tour tests fail if
   they move.
6. **Touch targets.** Phones already had 44px. Tablets and touch laptops drew
   36px header buttons, and a rotated phone's "Plan" was 40px wide: the hit
   area now reaches 44px there without moving anything (a wider `::after`).
   A mouse pointer keeps the denser 36px row (WCAG 2.5.8 asks 24px).
   *Trade-off:* the drawn button is still 36px on a tablet; only the area
   that takes the tap grew.

## Ledger

| ID | Tier | Screen | Finding (actual vs expected) | Root cause | Status |
|---|---|---|---|---|---|
| SD-1 | Med | B, Progreso → Estadísticas, new user | A blank tab; expected a reason and a way forward | The statistics blocks hide themselves with no saved practice | Fixed: `#progress-empty`; test "Estadísticas says why it is empty" |
| SD-2 | Med | B, Progreso on a short page, touch | A flick did nothing below the content | Listeners were on `<main>`, shorter than the screen | Fixed: on `document`; test "a sideways flick…" |
| SD-3 | Med | Both, 390px, keyboard | The design control took focus behind the sticky header | In the viewport as far as the browser can tell, so no scroll | Fixed: `revealBelowHeader`; mutant DS16 |
| SD-4 | Med | Both, tablets and touch laptops | Header buttons gave a finger 36px; rotated phone "Plan" 40px wide | Pointer-density rule applied by width, not by pointer | Fixed in `css/styles.css`; mutant DS8; 30-device matrix |
| SD-5 | Low | B, 390px | "Perfiles" tab hidden behind a swipe | Tab padding sized for a wide screen | Fixed; mutant DS9 |
| SD-6 | Low | Site, experiment off after being on | The remembered random default would flash before settling | Default read before the experiment was consulted | Fixed: `rememberDefault` |
| SD-7 | Test | `layouts.test.mjs` | The time-cap test read the cap from the code, so any cap passed | Tautology; found because mutant DS11 survived | Fixed: literal 3600; DS11 killed |
| SD-8 | Test | `site-version.spec.js` | "a short or diagonal flick does not" never sent a diagonal one | Found because mutant DS6 survived | Fixed: diagonal case added; DS6 killed |
| SD-9 | Pre-existing | `account-pro-states.spec.js:961` (1280px, Ayuda fold) | Fails here on this branch **and** on the untouched base commit f258ba3 | Not investigated; the fold depends on how the title wraps, so installed fonts are a suspect | **Unverified**, not caused by this round |

## Red-team passes (five)

1. **Malformed input.** Stored junk (bad JSON, arrays, unknown ids, huge
   counters) → design A, no error. `?version=` junk ignored. Worker: unknown
   design ids are counted as ignored, not shown; a non-number `sec` adds 0;
   a report over an hour is cut to an hour; one browser cannot add more than
   400 visits. Found SD-7.
2. **Races and state.** Two tabs (followed, counted once); a switch cannot
   happen mid-take (control hidden in an exercise); switching closes the old
   design's time before the new one starts (mutant DS5); the tour in B, with
   the strips inert behind it. Found SD-2, SD-6.
3. **Accessibility and occlusion.** Tab walk through all four Progreso tabs
   at 1280 and 390; tap sizes on 30 device shapes in both designs and both
   languages; a labelled native `<select>` for the control. Found SD-3, SD-4,
   SD-5. High-contrast rules were added for the current tab and the chart
   colours but **not tested** (unverified).
4. **Numbers.** Window by receipt time; shares that are null, not 0, when
   nothing is known; Wilson interval for "came back"; seed counted a second,
   independent way in `tests/admin-layouts.spec.js`. Found SD-8.
5. **Integration, privacy, CI.** An old worker (404) says "redeploy", and the
   strip says it before a press; a non-admin never triggers the read and the
   worker answers 403; opting out drops the visit counter and keeps the
   design; the guide and privacy page name what is sent, in both languages;
   mutation set `designs` (16 mutants) added to CI. Found SD-9.

## Aesthetic passes (four)

1. Desktop 1280–1920, both designs: one header row, the control right-aligned
   with its one-line explanation.
2. Narrow phones 320–430 and landscape: explanation dropped, label + choice
   only; all four tabs visible without a swipe.
3. Tablets 744–1180: two-column catalogue kept; fold arrows at the row's end.
4. Colour and language: chart colours checked for colour-blind separation on
   the card surface (A `#3987e5`, B `#d95926`), identity never by colour
   alone (labels, legend, table); English labels fit everywhere Spanish does.

## Evidence

- `npm run lint`, `npm run test:core`: green.
- Chromium (Playwright 1.61.1, headless, Linux): `site-version.spec.js` 35,
  `site-version-devices.spec.js` 60, `admin-layouts.spec.js` 8; worker
  `layouts.test.mjs` 11.
- `node qa/mutate.mjs designs`: 16 planted defects, all killed (two survived
  the first run and exposed SD-7 and SD-8).
- **Not run:** WebKit and Firefox; real phones (the matrix is emulated
  viewports with touch); screen readers.

## To make it live

Merging to `main` publishes the site. The numbers start only when the worker
is redeployed (`docs/ADMIN-GUIDE.md` 8.7): the worker deployed today drops
the three new event names and answers 404 to the reading, which the admin
page reports as "servidor antiguo".
