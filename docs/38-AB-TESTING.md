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
- **They favour the challenger.** Across the two rounds, 21 of 24 new designs
  beat today's. The designs were written to fix problems an audit had already
  found, so many wins are expected. But the rate is high enough that a narrow
  win should be read as a tie.
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
- `js/analytics.js` sends events to `VT_ANALYTICS_ENDPOINT`. Nothing is sent
  while that is empty (today), from automated browsers, or when the browser
  sends Global Privacy Control or Do Not Track.
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

### Left for later

- `tour_shape_2026_10` is still judged on first wins. A practice-based primary
  would suit it better.
- A browser that already sends GPC or DNT never sees the switch, so it cannot
  delete what it sent before. That data goes at the 180-day sweep.
- There are no always-valid p-values: the fixed plan is the only protection
  against peeking.
- There is no route to replay an A/A from stored data.
- Nothing is counted while `EVENTS_ENABLED` is false.
