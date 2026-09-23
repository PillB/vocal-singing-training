# The daily loop: basics every day, forever

**Date:** 23 September 2026
**Code:** `js/daily-loop.js` (new), `js/practice-days.js` (new), `js/app.js`, `js/session.js`, `js/storage.js`, `js/sync.js`, `js/reminders.js`, `js/value-pulse.js`, `js/practice-engine.js`, `js/practice-modes.js`, `js/analytics.js`, `js/experiments.js`, `js/experiments-config.js`, `js/i18n.js`, `index.html`, `css/styles.css`, `guide.html`
**Tests:** `tests/daily-loop.spec.js` (new, 19 cases); `tests/retention.spec.js` (two cases rewritten for rest days and the loop's welcome back)
**Research:** the full write-up, with every source and the claims that did not survive checking, is published separately as a readable page. This file is the engineering record.

People walk through the lessons and leave. The catalog and the 12-week plan are
an arc: they end, and when they end there is nothing to come back to. Singers
who keep singing for decades do the opposite. They repeat the same few basics
every day, long after they can do the hard things. This change gives the site
that loop, and fixes the record-keeping it has to stand on, which was losing
practice.

---

## What was wrong underneath

All of these were reproduced before anything was changed.

| # | Defect | What it did |
|---|---|---|
| 1 | **Practice only existed if you pressed Save** (VG-27) | Next in a guided session, leaving, switching exercise, closing the tab: none of them recorded anything. A learner could finish a whole guided session with `vt_progress_v1` still `null` |
| 2 | **Days were UTC** | Lima is UTC−5, so the day turned over at 19:00. Someone who sang Monday at 18:00 and Tuesday at 20:00 had a one-day streak |
| 3 | **The streak was capped at about 50 days** | It was rebuilt from progress history, which keeps the newest 50 takes per exercise |
| 4 | **The "freeze" never protected anything** | It spent itself when the last practice was 24–48 hours old, which is the evening after *any* practice, and the streak never read it. "Racha protegida" was shown over a streak of 0 |
| 5 | **A refused microphone froze a guided session** (VG-40) | The step clock waited for the mic, so with the mic denied and the piano playing the timer sat still and no control moved the session on |
| 6 | **The 5-minute micro-session stuck** | The flag stayed on until the next Save, so every later exercise, including every step of the daily class, got a 5:00 timer |
| 7 | **Leaving with "Save" pointed at a hidden button** (VG-28) | The silent stop skipped the metrics reveal, so focus went to a button inside a collapsed card |
| 8 | **The primary buttons failed contrast** | White on the green `.btn-practice` read 2.5:1, white on the Canto orange `.btn-singing` 2.6:1, white on the blue end of `.btn-primary` 3.5:1, and the active Vocal and Canto track tabs 3.2:1 and 2.9:1. All five are below AA on buttons the whole layout is built around |
| 9 | **Analytics could not answer an A/B question** | The beacon sent a JSON content type under `no-cors`, which the browser silently strips, and carried no client id, local day or time zone |
| 10 | **Switched-off experiments spent exposures** | `exposeOnce` recorded an exposure while an experiment was disabled, so browsers would have entered a real test already counted, half of them in the wrong arm |

Also fixed on the way: the lip-trill mode's English-only prompts, the history
screen's English buttons and "last score" line, and "sesión(es)" on the home
title.

---

## What counts as practice now

`recordPracticeIfDue()` in `js/app.js` is the one place practice is recorded,
and every exit calls it: Next, Skip, leaving, switching exercise, the tab being
hidden or closed (`pagehide`, `visibilitychange`), and the step timer running
out.

- It counts once the step has run for **max(15 s, 30% of the step), capped at
  45 s**. A 90-second Mínimo step counts at 27 s.
- It writes one take per open. A later record of the same open **replaces** that
  take (`replaceId`) with the longer time, and a Save adds the rating to it, so
  one practice is never counted twice however it ends.
- "Salir sin puntuar" now means exactly that: the practice is kept and only the
  rating is skipped. The leave dialog says so, and its button reads "Puntuar
  ahora" rather than "Guardar progreso", because progress is saved either way.

## The ledger: `vt_days_v1`

`js/practice-days.js` (`VTDays`) keeps one row per **local** calendar day,
separate from progress history, so it is not capped and it records practice
however it happened.

```json
{
  "v": 1,
  "days": { "2026-09-22": { "sec": 240, "n": 2, "ex": ["s4-lip-trills"], "basics": 1, "len": "min", "track": "singing" } },
  "rest": { "bank": 1, "earnedAt": 6, "used": ["2026-09-19"] },
  "backfilled": true
}
```

- A day counts when anything was practised on it (`n > 0`), a minute
  accumulated, or a take was saved.
- On first read the ledger is rebuilt once from saved takes and held notes, and
  the rest days that history would have earned are credited, so a long-time
  user does not start with less slack than a newcomer.
- **Rest days** replace the freeze. You start with one, earn one per six
  practice days, and bank up to two (three with Pro). One is spent only on a
  day that was really missed, and only when the bank covers the **whole** gap:
  half-covering a three-day gap would spend rest on a streak that breaks anyway.
  A rest day bridges the streak without lengthening it.
- A **comeback** is a return after a gap the rest days could not cover. A gap
  they did cover was rest, and the screen treats it as rest.
- Profile-scoped and synced. Merging two devices unions the days with the
  larger figures and takes the rest bank from whichever side has earned further
  and spent more, so a sync can never mint a rest day.

## The loop: `vt_loop_v1` and the start panel

**A first visit** (no day sung yet, no guided session open, and not the
`classic` arm) asks one question, "¿Qué quieres entrenar?", with two large
choices: **Cantar** (canciones, afinación) and **Hablar** (presentaciones,
dicción). Choosing one switches the track; the chosen one is ticked, not only
coloured. Under it sits that track's **Mínimo** ("Tus básicos · 3 min", its
steps and times) with one button, "▶ Empezar (3 min)", which starts it. The
intro line, the other ways in (Continuar, sesión guiada, Ruta) and the
explainer's "pick an exercise" step are hidden, and the tour offer shrinks to
two quiet links. So the first practice is the same few minutes the loop offers
every day after, and it needs nothing prepared: on Canto the card says "Sin
libro ni partitura"; Vocal's Mínimo ends on diction, which reads a page aloud,
so its card says to have a short text at hand. The track the site defaults to
is unchanged, and the catalog keeps its own track switch.

From the first day sung, the start panel becomes **today's basics**:

| Size | Canto | Vocal |
|---|---|---|
| **Mínimo** | Lip trills 90 s, lip-trill solfège 90 s. The same every day | Lip trills 75 s, diction 105 s |
| **Esencial** (~10 min) | Breath, trills, trill solfège, then four slots that rotate by date: voice (sirens, humming, dynamics, easy onset), vowel shape, resonance zone, scale | Breath, trills, humming, soft palate, diction, then a clarity slot and an expression slot |
| **Clase** | The prepared daily class, unchanged | A 19-minute class built from the Vocal exercises |

- The Mínimo never changes. Sameness is what lets a routine become automatic;
  the variety lives in the optional sizes, where it cannot erode the habit.
- The chosen size is remembered. A comeback always offers the Mínimo first.
- The panel has four states: **go** (today's basics), **sang** (you practised
  something else today; the basics round it off), **back** (a comeback: "Qué
  bueno verte", nothing to make up) and **done** ("Listo por hoy", with the
  button turned quiet and nothing asking for more).
- In go, sang and back the panel says it once: the kicker, the headline and
  the button. The size and steps are in the chips below and in the exercise
  itself; the intro line shows only when it reports a rest day spent. A number
  and its unit never break across lines ("3 minutos").
- Beside it: **días cantados**, a lifetime count that only goes up and leads;
  the week from Monday; the streak and rest days, second; and a weekly goal
  that is a **range** (3–5 days by default), because a range survives a bad week
  that a fixed number does not.
- On a phone the record is a compact strip: the count beside this week's
  ticks (captioned "Esta semana", so three days sung beside two ticks reads
  right), then the streak and the weekly goal, whose picker stays. The next
  milestone is left to the wider layout.
- A routine counts as done when today is a practice day **and** at least half
  of its steps were practised. Stepping through without starting them says
  plainly that it did not count.
- Finishing shows one card: the day count, the week, any milestone, the
  comeback line, sometimes a surprise, and what tomorrow brings. Milestones fall
  at 1, 3, 7, 14, 21, 30, 50, 75, 100 days and on; only the exact count is news,
  so a browser arriving with 40 days of history is not told it just reached 30.

`vt_loop_v1` holds the chosen size and goal, milestones marked, cards found,
surprises shown, comebacks, and a random seed. It is profile-scoped and synced;
a merge unions the lists and keeps this device's settings.

### Surprises

- **Sparse:** a 25% chance on a finished routine in the first eight weeks, 15%
  after; at most one a day; never before the third practice day.
- **Guaranteed** on a comeback, and after seven finished routines without one.
- **Informational:** one of 18 voice-fact cards, each with its source, or a true
  statistic about your own practice (minutes sung, days with trills, your most
  regular weekday). Cards never repeat.
- **Stable:** the roll is a hash of the browser's seed and the date, so a reload
  does not reroll, and nothing about it can be bought.

The 18 cards were fact-checked against the literature. Eleven were softened
from how they were first drafted (for example, "lip trills lower phonation
effort" became "can make the folds easier to set vibrating"), the steam claim
was dropped, and the warm-up card no longer states as fact what only
self-reports support.

## Rules the loop holds itself to

These are product rules, written down so a later change has to argue with them
explicitly:

1. **Nothing withers.** No count, card or milestone decays or expires with
   absence. Days sung never goes down.
2. **No guilt.** No "perdiste tu racha", no red for a missed day (missed days
   are a dashed outline), no sad mascot, no countdown.
3. **Rewards are informational and unannounced.** No "practise 5 more days to
   unlock". Nothing random is ever tied to money, minutes practised or streak
   length, and nothing is sold.
4. **Done means done.** Finishing ends the day on its best moment. The page does
   not offer more to grind.
5. **Honest feedback.** The completion card only appears when the practice
   really happened.
6. **Colour carries meaning, not mood.** One accent per state; celebration has
   its own gold (`--reward`) so it never borrows the level meter's caution
   yellow.

## Experiments

Three tests ship switched off in `js/experiments-config.js`, with the arithmetic
beside them. The worker's registry (`EXPERIMENT_PRESETS` in
`workers/entitlements/src/events.js`) holds the same keys and arms, what each is
judged on, and its plan; a test fails if the two disagree.

| Key | Control | Treatment | Primary outcome | Plan per arm |
|---|---|---|---|---|
| `loop_home_2026_10` | `loop` | `classic` (the old panel) | Share with a practice day in the fourth week after first seeing the start panel (days 21–27) | 355 people, 28 days |
| `loop_surprise_2026_10` | `surprises` | `none` | Practice days in the 28 after the first finished routine | 250 people, 28 days |
| `loop_minimo_len_2026_10` | `three` | `five` (150 s steps) | Practice days in the 28 after first starting the Mínimo | 565 people, 28 days |

Guardrails: practice days in the first 28 and the share who refuse the
microphone (`loop_home`), finished routines (`loop_surprise`), and the share who
leave a Mínimo unfinished (`loop_minimo_len`).

**Only events every arm sends can be a metric.** `practice_day` and `comeback`
are tracked in `onPractice` before the loop decides whether to show anything, so
the classic arm sends them too. The loop's own events (`basics_start`,
`basics_complete`, `milestone`, `surprise_shown`…) exist only where the loop is
on, so they are never compared across `loop_home`'s arms: a readout on them
would crown the loop whatever people did. `tests/ab-events.spec.js` runs the
same script in every arm of every experiment and checks that each metric's
event is sent the same number of times.

At the traffic a friends-and-family beta can bring, only large effects are
visible: per arm, 30% → 45% needs about 160 people, 30% → 40% about 355, 30% →
36% about 960. So:

- **Nothing can be read without an endpoint.** Events land in `localStorage`
  on each visitor's own device. `VT_ANALYTICS_ENDPOINT` sends a client id,
  the local day and the time zone, which is what a result needs.
- Run the **A/A test** (`aa_2026_10`) first and check the arms split evenly
  and no event is flagged before trusting anything.
- The sample size and the minimum run are **written in the registry before
  starting**, and the worker holds the comparison back until both are met
  (`readMe: "too_early"`, with the date it opens). Report "no detectable
  difference", not "no difference".
- Every `app_open` repeats the arms this browser was exposed to, so an exposure
  whose own beacon was lost (offline, no endpoint yet) is recorded late rather
  than dropped from the test.
- Colours, button hues and themes are **not** worth a test at this size.

`?ab_<key>=<variant>` shows either arm without joining the experiment.

## Deliberately not done here

| Idea | Why it waits |
|---|---|
| A 3 a.m. day rollover for night singers | The heatmap and plan code call the day key with midnight dates; shifting it needs those callers changed together |
| Choosing to spend a rest day after a miss, instead of automatically | Stronger in one study (Sharif & Shu), but it adds a decision to the moment people are most likely to leave. A good second test |
| "Sing first, then see" reps with the pitch trace hidden | The best-supported fix for dependence on live feedback, and a change to the practice screen, not the loop |
| A weekly "then and now" recording | Needs a benchmark exercise and storage design |
| Musical surprises (a changed final chord, a best take replayed with a fuller piano) | The most natural reward for a singing app; needs work in `js/piano.js` |
| A light theme that follows the system setting | Dark-on-light reads better for text screens; this is a design-system change |
| Seasons after week 12 | The loop already keeps going; seasons are the next layer on top |

## Verifying

- `npx playwright test tests/home-design.spec.js` covers the first visit (the
  chooser switches the routine, the button starts the Mínimo), the quiet loop
  panel, the phone record strip and the phone header's "Más" menu.
- `npx playwright test tests/daily-loop.spec.js` — 19 cases on a fixed clock in
  `America/Lima`: routine rotation, local days, the four panel states, tier
  choice, comeback, rest days, a full Mínimo run to the completion card, the
  not-counted path, one take per open, the refused-mic notice and Skip, surprise
  rules and odds, milestones, the forced classic arm, dormant experiments, the
  two-device merge, and English with the Vocal track.
- The completion card is suppressed under automation (`vt_e2e`) so it cannot sit
  over other specs' clicks; a spec opts in with `sessionStorage.vt_loop_e2e = "1"`.
  Toasts are muted the same way and come back with `vt_debug = "1"`.
