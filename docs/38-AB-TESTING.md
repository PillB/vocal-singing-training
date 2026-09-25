# Testing designs: blinded side-by-side tests, then live A/B tests

**Date:** 24 September 2026
**Code:** `qa/design-test/` (the offline design test), `js/experiments.js`, `js/experiments-config.js`, `js/analytics.js`, `js/privacy-switch.js`, `workers/entitlements/src/events.js`, `workers/entitlements/src/stats.js`, `privacy.html`, `guide.html` (section 14)
**Tests:** `tests/ab-events.spec.js`, `tests/accounts.spec.js` (the admin panel), `workers/entitlements/test/events.test.mjs`, `workers/entitlements/test/stats.test.mjs`

The site has two ways to choose between designs. They answer different
questions and must not be confused:

1. **The offline design test** picks between variants *before* anyone sees
   them. It shows the variants side by side, blinded, to simulated judges and
   applies a rule written down in advance. It is fast and cheap, and **it is
   not evidence about real people.** It catches designs that are confusing,
   unreachable or broken, and it ranks the rest.
2. **Live A/B experiments** split real visitors between arms and compare what
   they do. They are the only evidence about behaviour, and they need traffic
   and an analytics endpoint the site does not have yet. They ship switched off.

A design goes live once it wins the offline test clearly. A close call becomes a
live experiment, to be run when the traffic exists.

---

## 1. The offline design test

### How it works

Everything is in `qa/design-test/`, with the commands in its README.

- **Renders.** A harness renders today's site (arm A) and each challenger in
  the same named states: first visit, a learner who sang three days, a guided
  step at 00:00, and so on. It uses the same viewports each time: phone
  390×844, small phone 360×740, landscape 844×390, laptop 1280×720 and
  desktop 1280×800. A challenger is usually a patch module applied at runtime
  over today's page, so a variant costs an hour, not a branch.
- **Guardrail numbers.** Each render is measured:
  - where the primary action sits and whether it is on the first screen
  - controls under 44px
  - the smallest text
  - text-contrast failures
  - horizontal overflow
  - page errors
- **Blinding.** Each judge sees the arms labelled only "Diseño 1…N", in a
  different order per judge (a Latin square for three arms; for two arms,
  alternating sides by question). Phones are shown side by side, and wide
  screens one image per arm. Anything a still image cannot show, such as what
  a button does, is given as a neutral behaviour note per design number.
  Nothing says which design is today's.
- **Judges.** Three independent evaluators per question, each able to read
  only its brief and the images:
  - Rosa, a Peruvian beginner on an Android phone
  - a senior product and usability designer
  - an accessibility specialist who runs sessions with adults over 60

  Each ranks every design and scores it from 1 to 10, lists anything broken
  (marked blocking or not), and summarises. The personas and instructions are
  in `qa/design-test/judge-brief.md`. In the two rounds below the judges were
  model instances, so **these are simulated judges, not user data**.
- **The rule, written before any result was read** (`decide`):
  - **Ship** a challenger when at least 2 of 3 judges rank it above today's
    design and no guardrail regresses.
  - The guardrails that count as a regression:
    - more controls under 44px on a phone
    - the smallest text under 12px and smaller than today's
    - more contrast failures
    - new horizontal overflow
    - more page errors
    - a blocking problem reported by two or more judges
  - **Close:** one win, or a win with a guardrail. If the guardrail is
    mechanical, fix it and measure again. Otherwise the design becomes a live
    experiment.
  - **Holds:** no challenger beats today's design.
- **Build.** A winner is rebuilt as real code, not an observer patch. Whoever
  builds it also fixes the problems the judges noted in it, while keeping what
  made it win. So what ships is the judged design plus those fixes, not a
  pixel copy of it.

### Results, September 2026 (simulated judges)

Round 1, 15 questions:

| Question | Verdict | What shipped |
|---|---|---|
| First visit | New design, 3/3 | "¿Qué quieres entrenar?" (Cantar / Hablar) and a 3-minute routine with nothing to prepare |
| Today's basics, returning learner | New design, 3/3 | The routine is the headline, with one button |
| Phone header | New design, 3/3 | One row with a "Más" menu |
| Practice record on phones | New design, 3/3 | One compact strip |
| Guided step at 00:00 | New design, 3/3 | "¡Listo!" card, microphone off, one button to the next exercise |
| Phone landscape practice | New design, 3/3 | Landscape practice mode (with the session controls kept, see round 2) |
| Which note to sing | New design, 3/3 | The target is always the green lane and the grid recedes |
| Exercise before Start | New design, 3/3 | Replaced by round 2's "raised to the floor" |
| Exercise list | New design, 3/3 | Rows with one line on what you do |
| How singing exercises are grouped | New design, 3/3 | Groups named for what they hold, today's basics marked |
| Plan | New design, 3/3 | One focus, its exercises, days counted |
| History | New design, 3/3 | Days sung first, then what you did last |
| Pro pricing | New design, 3/3 | Replaced by round 2's honest pre-launch dialog |
| Home after today's basics | **Today's design holds**, 0/3 | Unchanged |
| Tour invitation | **Close**, 2/3 with a guardrail | Folded into the first visit as quiet links; the tour's shape stays a live experiment (`tour_shape_2026_10`) |

Round 2, 9 questions:

| Question | Verdict | What shipped |
|---|---|---|
| Start choices for a returning learner | New design, 3/3 | One naming scheme; other routes behind "Otras formas de practicar" |
| Finishing card in landscape | New design, 3/3 | Two columns with the buttons pinned |
| Pro dialog before checkout is live | New design, 3/3 | Leads with the free trial; plan buttons read "Aún no disponible" |
| How a selected choice looks | New design, 3/3 | Tint, bar and ✓; never a solid fill |
| A single exercise's time runs out | New design, 3/3 | Finish with a one-tap rating |
| Rating a finished step | New design, 3/3 | One tap: Fácil, Normal or Me costó |
| Guided-session bar on phones | **Close**, 2/3 with a guardrail | One-line bar with labelled Pausar and Terminar, after re-measuring (below) |
| Exercise controls on small phones | New design, 3/3 | Same layout, every control 44px and text 12px |
| Coaching cue while singing | New design, 3/3 | The cue stays on the stage |

The re-measure for the guided-session bar: its guardrail was 9 → 12 controls
under 44px and 0 → 2 contrast failures on a 360×740 phone. With both arms at
the same scroll position, the contrast counts were equal (2 and 2): the
difference had come from the app's own stage-fit scroll. The three extra small
controls were existing stage controls (Stop, the mic slider, octave −). They
fitted on the first screen because the bar is shorter, and "raised to the
floor" makes them 44px. So the guardrail was mechanical, and the bar shipped
with the judges' fix: the whole session no longer ends from an unlabelled ×.

### What these results are worth

- **Judges are not users.** They cannot show whether people come back, only
  whether a screen explains itself, is reachable and is legible.
- **They favour the challenger.** Across the two rounds, 21 of 24 questions
  ended with a new design to ship, and 30 of the 33 challengers were ranked
  above today's by at least two of three judges. The designs were written to
  fix problems an audit had already found, so many wins are expected. But the
  rate is high enough that a narrow win should be read as a tie.
- **Context changes answers.** The round-1 pricing winner (one plan with a
  monthly/yearly toggle) beat today's dialog 3/3. In round 2 an honest
  pre-launch alternative was also shown, and the round-1 winner then lost 0/3,
  with a blocking problem: its main button said "Suscribirme" but did nothing
  yet. Compare several alternatives at once when you can.
- **Still images hide behaviour.** Behaviour notes cover what an image cannot
  show, but a judge cannot tap anything. Anything with timing, audio or
  gestures still needs a real device and, where it matters, a live test.

---

## 2. Live A/B experiments

### What the pipeline does

- `js/experiments.js` assigns each browser to an arm with a stable hash. It
  records one exposure per experiment, only once the thing under test has
  actually been shown. `?ab_<key>=<variant>` shows an arm without joining the
  experiment.
- `js/analytics.js` sends events to `VT_ANALYTICS_ENDPOINT`, which
  `js/experiments-config.js` derives from the worker URL in
  `js/billing-config.js`. Nothing is sent when there is no worker, from
  automated browsers, or when the browser sends Global Privacy Control. Do Not
  Track is not read (dropped 2026-09-24: no law requires it, the specification
  was discontinued in 2019).
- The worker (`workers/entitlements/src/events.js`) stores the events and
  exposures, and answers results for an admin. The results show in the account
  panel and at `GET /v1/admin/experiments/results?experiment=<key>`.

### Rules that make a result trustworthy

- **Every arm must send what it is judged on.** An event that only one arm
  can send can never be a metric. The worker's registry lists, per arm, the
  events only that arm sends, and rejects any metric built on them.
  `tests/ab-events.spec.js` plays the same script in every arm of every
  experiment in a real browser, and requires equal non-zero counts for each
  metric event.
- **A fixed plan, and no early winner.** Each experiment's people per arm and
  minimum days are set in the registry before it starts. Until both are met,
  a result shows counts and the date it opens, and no comparison. The group
  measured is frozen when the last arm reaches its number, so later arrivals
  never change a result that is already readable.
- **Lost exposures are recovered.** Every `app_open` repeats the arms this
  browser has seen. The server keeps the first arm it stored and never
  changes it.
- **Checks in every answer.** An uneven split (chi-square p < 0.001) or broken
  instrumentation is flagged before the effect is shown. Instrumentation is
  broken when an arm sends none of an event the result reads, or when
  `app_open` differs between arms at p < 0.001.
- **Only registered experiments count.** Unknown keys or arms create no
  exposures and are counted as such.

A result's `readMe` says how far it can be trusted, most serious first:

1. `srm`
2. `instrumentation`
3. `too_early`
4. `small_sample` (fewer than 30 in the smallest arm)
5. `ok`

### The experiments, all switched off

All are sized for two-sided alpha 0.05 and 80% power, with arms weighted 1:1.

| Key | Arms (control first) | People per arm | Minimum days | Sized for | Primary | Guardrails |
|---|---|---|---|---|---|---|
| `aa_2026_10` | a / b | 150 | 14 | none (A/A) | share with a practice day, days 0–7 | app opens, days 0–7 |
| `tour_shape_2026_10` | invite / auto | 160 | 14 | 30% → 45% | share with a first win, days 0–7 | practice-day share, days 0–7 and 0–1 |
| `loop_home_2026_10` | loop / classic | 355 | 28 | 30% → 40% | share with a practice day, days 21–28 | practice days 0–28; microphone refused 0–28 |
| `loop_surprise_2026_10` | surprises / none | 250 | 28 | +1.5 days | practice days, 0–28 | finished routines 0–28 |
| `loop_minimo_len_2026_10` | three / five | 565 | 28 | +1 day | practice days, 0–28 | unfinished Mínimo share 0–28 |

At the traffic a friends-and-family beta brings, only large effects can be
seen. Report "no detectable difference", never "no difference". Colours and
hues are not worth a test at this size.

These sizes suit behaviour that many people show (a third or more). A
conversion near 2%, such as starting the trial or paying, is another matter:
a 20% relative lift (2.0% → 2.4%) needs about 21,100 people per arm at the
same alpha and power, and 150 per arm there would detect almost nothing. At
this traffic, read each step of a funnel on its own, as one proportion with a
Wilson interval (`wilson()` in `workers/entitlements/src/stats.js`): 0 of 20
people passing a step bounds its rate below about 16%, which finds a broken
step without an A/B test. It cannot show a 20% improvement; nothing at this
traffic can.

### Running the first test

1. Deploy the entitlements worker (see `docs/34-PERU-OPERATOR-RUNBOOK.md`).
   The `EVENTS_IP_KEY` secret is optional but recommended.
2. Set `VT_ANALYTICS_ENDPOINT` in `js/experiments-config.js` to
   `<worker URL>/v1/events`, and enable only `aa_2026_10`.
3. Wait for 150 people per arm and 14 days. Until then the panel shows the
   date the result opens.
4. Check four things:
   - `srm` is not flagged
   - the event-mix check is clean
   - the ingest counters show no unexpected `origin_not_allowed` or
     `rate_limited`
   - the two arms do not differ

   About one A/A in twenty shows p < 0.05 by chance, so run it again before
   digging. An uneven split or an instrumentation flag is a bug.
5. Turn the A/A off and run one real experiment at a time.

### What is stored, and privacy

| Table | Holds | Kept |
|---|---|---|
| `events` | event name (from a fixed list), flat id-like details (no free text), a random browser id, the local day, the time-zone offset, arrival time | 180 days |
| `exposures` | experiment, browser id, arm, first arrival time and local day | 180 days |
| `ingest_daily` | day, reason, count (no id, no address) | 180 days |
| `rate_limits` | per-browser buckets, and address buckets keyed by a daily-changing HMAC of the address | about two days |

- No IP address, user agent, account id or email is stored with any of this.
- The limits are:
  - 180 requests an hour per browser
  - 3,000 an hour per address, as a backstop for a class sharing one wifi
  - 100 new exposures per address per day
- `POST /v1/events/forget` deletes one browser's rows. The guide's switch ("No
  enviar y borrar lo enviado") calls it, gives the browser a new id and stops
  sending.
- `EVENTS_ENABLED=false` on the worker turns everything off.
- `privacy.html` and guide section 14 list exactly the fields sent, and
  `tests/ab-events.spec.js` fails if the text and the code drift apart.

### What the owner decided on 2026-09-24, and what it cost

Analytics are on. The endpoint is no longer a string somebody has to remember to
fill in: `js/experiments-config.js` derives it from the worker URL in
`js/billing-config.js`, so a deployment with a worker measures and one without
sends nothing.

Three self-imposed rules were dropped with it, because each one made the funnel
unreadable and none was required by any law:

- **"While you are only practising, your browser talks to no server of ours."**
  It was the reason there was no funnel at all. privacy.html now says what the
  site does instead: statistics go from the first visit, and here is the switch.
  `tests/tour-behaviour.spec.js` used to assert zero external requests — and
  passed only because Playwright browsers never send. It now asserts what is
  still true and is worth defending: no third party is contacted, ever.
- **Honouring Do Not Track.** No law anywhere requires it, the W3C discontinued
  the specification in 2019, and Safari removed the header that year because
  sending it narrowed a fingerprint rather than protecting anybody. Dropped on
  the client and in the worker in the same commit: the client sending while the
  worker discarded would be the worst of both.
- **No `/v1/auth/methods` probe on page load.** It existed to keep the promise
  above. Its cost was that nothing knew which ways in the deployment offers
  until somebody opened a panel, so every first open drew "still asking" and
  reported that state. `js/account.js` now asks once the page is quiet.

What stays, and why it is not people-pleasing:

- **Global Privacy Control**, the guide's switch and `POST /v1/events/forget`.
  Ley 29733 arts. 20, 22 and 24 require a channel to stop and delete; GDPR arts.
  17 and 21 require the same, and art. 13(2)(b) requires saying so. GPC is also
  what Brave and DuckDuckGo actually send, and it has legal force in several US
  states for businesses the thresholds cover.
- **The recipient and cross-border disclosure** that privacy.html was missing
  entirely: Cloudflare (the Worker, D1, KV), GitHub Pages (the host, which sees
  an IP), Google (sign-in), Stripe and Mercado Pago (payment). Ley 29733 art. 15
  requires saying the data leaves Peru and art. 18 requires naming who receives
  it; GDPR art. 13(1)(e)-(f) says the same.
- **The retention figures** (180 days for events, about two days for the address
  bucket). Part of the same required notice, and true.

**How solid the citations above are.** The Ley 29733 article numbers were read
from secondary copies of the statute and of reglamento DS 016-2024-JUS, not from
an official source: `*.gob.pe` is refused at this container's proxy, and the OAS
copy of the law (`oas.org/es/sla/ddi/docs/…`) could not be fetched either. The
numbers most load-bearing here — art. 15 (flujo transfronterizo), art. 18 (the
notice items) and arts. 20/22/24 (cancelación, oposición, and the duty to provide
the channel) — were each seen in the statute text by a research pass, but nobody
has checked them against an official publication. The visitor-facing pages name
only "la Ley 29733" and make no article claim, which is deliberate. Verify the
numbering before quoting it anywhere public, and treat the EU and US citations
(EDPB Guidelines 2/2023, WP29 Opinion 04/2012, CNIL délibération 2020-091) the
same way.

### The region gate: asked first where the law asks first (2026-09-25)

The question left open above — ePrivacy art. 5(3) wants *prior* consent for
analytics storage in the EU, and an opt-out is not consent — was answered by the
owner: "We are not for the eu or only enable required eu stuff in the eu."

Declaring the site out of scope was not available. `js/billing-config.js` lists
ES, GB, DE, FR and IT among its priority markets and the site is served in
English from a public URL, so "not directed at the EU" is not a claim it could
defend. What shipped is the second half of the sentence, read strictly: the rule
applies where it applies, and **nowhere else pays for it** — no banner, no extra
request, no latency, not one byte different on the wire.

**Three files.**

- `js/region-gate.js` (`window.VTRegion`) decides. A browser whose time zone is
  none of the EEA / UK zones and whose languages carry none of their regions is
  `non_eu` **synchronously**, at load, before the first event exists: no fetch,
  no bar, nothing held. Anything that does look European is `pending`, which
  holds events in memory (never on the device) while `GET /v1/geo` is asked.
- `workers/entitlements/src/events.js` holds the authority: `ASK_FIRST_COUNTRIES`
  plus `cf.isEUCountry`, read from Cloudflare's own view of the address, which
  no page can talk its way out of. `GET /v1/geo` (index.js) answers
  `{country, askFirst}` and stores nothing at all — no counter, no row.
  `handleIngest` turns away a batch from an ask-first country that does not carry
  `consent: "granted"`, with a new `eu_no_consent` ingest reason, 202 and nothing
  stored, so the client never retries it.
- `js/analytics.js` holds up to 50 events while the answer is outstanding and
  replays them, with the id stamped on at that moment, if the answer is yes. The
  `consent` field is added to the body **only** when it is needed, so a batch from
  Lima is byte-for-byte what it was before this existed — which is what
  `tests/ab-events.spec.js` still asserts, untouched.

**Fail closed, in both directions.** A worker that cannot be reached, or answers
without a country, leaves the stricter verdict in place: asking afterwards is not
asking first. And a worker that says PE for a browser whose clock says Madrid
lifts the hold, so an expat with a European time zone is never asked.

**The A/B split goes inert, not uniform.** The obvious implementation — make
`clientId()` return `""` — would have hashed every visitor in those countries into
the same arm and produced a result that looked real and was worthless.
`assignment()` returns `variants[0]` before anything reads or writes the id, and
`exposeOnce()` records nothing.

**What is deliberately *not* gated:** practice history, streaks, recordings and
the local event log `js/analytics.js` keeps. That is storage strictly necessary
for the service the visitor explicitly requested (art. 5(3), second limb): it is
what draws their streak and their heatmap, it never leaves the device, and
gating it would break the product for those visitors rather than protect them.
What is gated is the sending and the A/B id, which serve us.

**The UK is in, Switzerland is out.** The list is the set of places whose law
requires asking first, not a political one: the EEA under ePrivacy art. 5(3),
the UK under PECR reg. 6 (the same rule, kept after leaving), and the Crown
dependencies and Gibraltar, which follow it. Switzerland's revFADP does not
require prior consent for first-party analytics, so a visitor in Zurich is not
asked. The two lists live in two languages — IANA zones in the page, ISO codes
in the worker — and `tests/region-gate.spec.js` holds them to each other so they
cannot drift.

**What it costs.** Sample, in exactly those countries: every browser there that
refuses, or closes the tab before answering, is absent from the funnel and from
every experiment. For a site whose traffic is Peruvian that is a small share of a
small share, but it means an arm's totals are not comparable across regions and
the SRM check should be read on the whole, not per country. It also means the
funnel understates first visits from the EEA and the UK by however many people
never answer, and no correction for that is possible or attempted.

### Left for later

- `tour_shape_2026_10` is still judged on first wins. A practice-based primary
  would suit it better.
- A browser that already sends GPC never sees the switch, so it cannot delete
  what it sent before. That data goes at the 180-day sweep.
- There are no always-valid p-values: the fixed plan is the only protection
  against peeking.
- There is no route to replay an A/A from stored data.
- Nothing is counted while `EVENTS_ENABLED` is false.
