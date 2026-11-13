# qa/ — the testing side of the project

This folder has two different kinds of thing in it, and the split is the point:

| | For | Entry point |
|---|---|---|
| **The QA site** | People testing the site for us, including people who do not code | [`qa/index.html`](index.html) → served at `/qa/` |
| **The scripts** | Us, from a terminal | the table further down |

Neither is the automated test suite. That lives in [`tests/`](../tests) (browser
tests, `npx playwright test`) and
[`workers/entitlements/test/`](../workers/entitlements/test) (worker tests,
`node --test workers/entitlements/test`). Those run on every change; everything
here is run by hand, when somebody asks a question it answers.

---

## 1. The QA site — `/qa/`

A page for the handful of people helping us test. It is `noindex`, it sends no
statistics (deliberately, like `admin.html`: what a tester does must not enter
the funnel the admin panel reads), and it has six sections:

1. **What you are testing right now** — the build stamp, the browser, and what
   the worker answers at `/v1/health`, in words: whether accounts are
   configured, which ways in are switched on, how many trial days this deploy
   gives, whether reports and statistics are on. So nobody has to ask whether
   a fix is deployed.
2. **How to tell us what you find** — the report dialog (`js/reports.js`), the
   same one the studio's footer opens, and what it attaches.
3. **What is switched off on purpose** — checkout, ads, email sign-in where it
   is not configured. These are not bugs, and a report spent on one tells us
   nothing.
4. **What to test** — nine charters, each a five-to-ten minute session, written
   for somebody who knows nothing about the code. Every check is a thing you
   can see. Ticks are kept in the tester's own browser (`vt_qa_run_v1`), so a
   pass can be done over several sittings, and "Copy what I tested" turns it
   into a message. Each check has a **Report this** button that opens the
   dialog with that check's words already in the first line and the right area
   chosen.
5. **Which devices we are missing** — iPhone Safari, Android Chrome, a small
   laptop, Firefox, with and without headphones, portrait and landscape.
6. **For us** — where the reports arrive.

Both languages are on the page at once, Spanish first, the way `guide.html` and
`privacy.html` do it. The charters themselves are bilingual in `qa/qa.js`
(`title`/`titleEn`, `goal`/`goalEn`, `checks`/`checksEn`), drawn in whichever
language `vt_lang` says.

**Where reports go.** The dialog posts to the worker's `POST /v1/reports`
(`workers/entitlements/src/reports.js`), which stores them in D1. We read them
in [`admin.html#reports`](../admin.html) — *Lo que nos cuenta la gente* — where
each one can be moved to `triaged`, `fixed`, `wontfix` or `duplicate` and given
an internal note the reporter never sees. A reporter who was signed in can see
their own reports and their status from the dialog itself.

**When the worker cannot take a report**, the dialog shows the same report as
plain text with a copy button and a link to the issues page. Nothing a person
typed is lost because our server had a bad day, and a draft survives closing
the dialog for the length of the browser session.

### Adding a charter

Add an object to `CHARTERS` in `qa/qa.js`: `id` (stable — it keys the saved
ticks), `area` (one of the worker's `REPORT_AREAS`, so a finding files itself
correctly), `title`/`titleEn`, `goal`/`goalEn`, and `checks`/`checksEn` of the
same length. Bump `qa.js`'s `?v=` stamp in `qa/index.html` or returning testers
keep the old file.

---

## 2. The scripts

All of them run against the site served locally:

```bash
python3 -m http.server 8765      # the site, at http://127.0.0.1:8765
```

and the Playwright ones want a Chromium: `CHROME_PATH=/opt/pw-browsers/chromium`
in this container, or whatever `npx playwright install chromium` gave you.

| Script | What it answers |
|---|---|
| `check-catalog.mjs` | Did a change quietly remove exercises, modes, progressions or guide depth? Compares against `tests/fixtures/catalog-snapshot.json`. No browser. |
| `rebuild-catalog-snapshot.mjs` | Accept a deliberate catalog change: regenerates that fixture. Commit it with the content change. |
| `redteam-static.mjs` | Is there a live secret, or a pattern that could become one, anywhere in the tree? Exits 1 on anything P0. No network. |
| `capture-mobile.mjs` | At phone widths: sideways scroll, elements painted off-edge, text under 12px, controls under the 44px tap floor, overlapping controls. |
| `capture-viewports.mjs` | The same sweep across desktop / tablet / mobile / landscape, checking the sticky pitch highway stays inside the visual viewport. |
| `capture-geometry.mjs` | Screenshots plus element geometry for every view and exercise, for `analyze_geometry.py` to chew on. |
| `check-header-hit-targets.mjs` | Does a finger landing on each header control actually hit that control, at every width a phone can be? Uses `elementFromPoint`, so a control sitting on top of another is caught. |
| `drive-exercises.mjs` | Drives every exercise with a synthetic voice (`synthetic-voice.js`) and screenshots what a learner sees at three moments. |
| `synthetic-voice.js` | Not run directly: the fake microphone the two scripts above inject, with a scenario per practice mode and "sloppy" variants. |
| `generate-test-accounts.mjs` | Regenerates the internal test accounts. Writes the plaintext to `docs/INTERNAL-TEST-ACCOUNTS.md`, which is gitignored and must stay so. |
| `analyze_geometry.py` | Rectangle maths over a geometry capture: overlaps, overflow, z-order conflicts. |
| `analyze_viewports.py` | The same checks over a multi-viewport capture. |

### `qa/admin/` — practising the admin side without touching anyone real

| Script | What it does |
|---|---|
| `sandbox.mjs` | A private copy of the site **and its account server** on this computer, with made-up people in it. `node qa/admin/sandbox.mjs`, then open `http://127.0.0.1:8780/__sandbox/` and pick who to be. Needs Node 22.13 or later (`node:sqlite`). |
| `local-worker.mjs` | What the sandbox runs: the worker's own `handleRequest`, SQL and signing code, with D1 swapped for `node:sqlite` and KV for a `Map`. So the admin page behaves there as it does against the deployed worker. |
| `capture-guide-shots.mjs` | Re-takes every screenshot in `docs/ADMIN-GUIDE.md` by walking the guide's procedures in the sandbox. Run it whenever the account panel or admin page changes, so the guide keeps matching the screen. |

### `qa/design-test/` — choosing between designs before anyone sees them

Its own thing, with [its own README](design-test/README.md): today's design and
one or two challengers rendered in the same moments of use, measured, then
ranked by blinded judges against a decision rule written before any result was
read. Use it to filter design ideas cheaply; it is not evidence about real
users.
