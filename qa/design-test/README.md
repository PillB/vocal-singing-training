# Blinded design test

A way to choose between design variants of a screen before any real user sees
them. Today's design (arm A) and one or two challengers (B, C) are rendered in
the same moments of use and at the same screen sizes, and each render is
measured. Three judges then rank the designs from blinded screenshots: they
see "Diseño 1", "Diseño 2" and so on, in a different order for each judge, and
never which one is today's. A decision rule written before any result was
read turns the rankings and the measurements into a verdict for each question:
**ship** a challenger, a **close** call, or today's design **holds**.

It filters ideas cheaply and catches broken designs early. It is not evidence
that a change helps real learners; see [the limits](#honest-limits) and
[from a close call to a live experiment](#from-a-close-call-to-a-live-experiment).

## Files

| File | What it does |
|---|---|
| `harness.mjs` | Renders arm A and one challenger in the given states and viewports, saves screenshots and measures each render |
| `run-all.mjs` | Runs the harness for every challenger of every question in a runs (or questions) file, two at a time |
| `states.mjs` | Every state (a moment in the app) and viewport a render can use |
| `blind.mjs` | Makes the blinded images for three judges and writes `manifest.json`: the key, behaviour notes and guardrail measurements |
| `briefs.py` | Writes one brief per question and judge: the screen's job, the images, the behaviour notes by design number |
| `judge-brief.md` | What each judge is told: the three personas, the instructions and the result schema |
| `decide.py` | The pre-registered decision rule; writes `verdicts.json` |
| `notes.py` | The judges' notes per question, with design numbers mapped back to arms |
| `common.py` | Shared by the Python scripts: the work folder and reading the judges' results |
| `rounds/` | The questions, verdicts and decisions of the two rounds run on 23 September 2026 |

Every output goes under one work folder: `$DT_WORK`, by default
`design-test` in the system's temp folder (`/tmp/design-test` on Linux). Set
`DT_WORK` to keep rounds apart, and use the same value for every step of a
round. Nothing is written inside the repo.

## Running a round

You need the site served (`npm run serve`, port 8765; or set `BASE_URL`), the
repo's dev dependencies (`npm install`) and a Chromium for Playwright
(`npx playwright install chromium`, or point `CHROME_PATH` at a Chrome binary).
The Python scripts need only Python 3.

```sh
export DT_WORK=/tmp/design-test-r3                    # optional; one folder per round

# 1. Write the challengers as patch modules and the questions file (below).

# 2. Render every arm of every question
npm run design-test:render -- my-round/questions.json  # = node qa/design-test/run-all.mjs my-round/questions.json
#    one question only:  npm run design-test:render -- my-round/questions.json pricing

# 3. Blind the renders (writes $DT_WORK/blind/<key>/j0..j2/ and $DT_WORK/manifest.json)
npm run design-test:blind -- my-round/questions.json

# 4. Write the briefs ($DT_WORK/blind/<key>/j<n>/brief.md and $DT_WORK/judge-items.json)
npm run design-test:briefs

# 5. Judge: for each entry of judge-items.json, give that judge its persona and
#    the instructions from judge-brief.md, with the path of its brief. Collect
#    the answers in one file, e.g. my-round/judges.json (format in judge-brief.md).

# 6. Apply the rule ($DT_WORK/verdicts.json)
npm run design-test:decide -- my-round/judges.json

# 7. Read the judges' reasons ($DT_WORK/notes/<key>.md)
npm run design-test:notes -- my-round/judges.json
```

Then write the decisions down, and copy the questions file and
`verdicts.json` into `rounds/` (see `rounds/decisions-r2.md`). The blinded
images, renders and notes stay in the work folder: they are large and can be
made again.

Keep `manifest.json` away from the judges: it is the key. The judges' images
and briefs sit in `$DT_WORK/blind/`, apart from it.

To look at one challenger without judging, run the harness on its own. It
prints the measurements that differ between the arms and writes
`summary.md`, `metrics.json` and the screenshots:

```sh
node qa/design-test/harness.mjs --inject my-round/pricing/B.mjs --states pricing,pricing-end --vps phone,desktop
node qa/design-test/harness.mjs --b http://127.0.0.1:8801 --states home-returning --vps phone --out /tmp/look
node qa/design-test/harness.mjs --help
```

## The questions file

One entry per question. The same file is the runs file for `run-all.mjs`.

```json
{
  "pricing": {
    "title": "The Pro pricing sheet",
    "job": "Someone curious about Pro understands what it adds, what it costs and what they can do right now.",
    "states": "pricing,pricing-end",
    "vps": "phone,desktop",
    "full": false,
    "arms": {
      "A": { "caption": "The subscribe buttons show a notice that payments are not public. The 7-day free trial button works." },
      "B": {
        "name": "one plan, interval toggle, plain benefits",
        "patch": "pricing/B.mjs",
        "caption": "Mensual / Anual switches which plan is shown. The 7-day free trial is not offered in this design."
      }
    }
  }
}
```

- `title` and `job` open every brief. Write the job as what a person must be
  able to do on this screen; the judges rank against it.
- `states` and `vps`: comma-separated names from `states.mjs`. Every
  combination is rendered for every arm.
- `full`: also show the next screens down the page (two more on a phone, one
  on a desktop). Use it for long pages.
- `arms`: `A` is today's design. Add one or two challengers. Each has a
  `patch` (a patch module, relative to the questions file; default
  `<key>/<arm>.mjs` next to it) or a `url` (the challenger served from its own
  server).
- `caption`: the behaviour notes. Judges get them under the design's number,
  as facts the screenshots cannot show (what a button does, what happens at
  0:00). Write them plainly and in the same way for every arm, including
  today's. A caption that sells one design biases the judges.
- `name`: for the key and the verdicts only. Judges never see it.

A question's position in the file sets the order its two arms are shown in, so
keep the order when re-running a round.

## Writing a patch module

A patch module turns today's site into the challenger at runtime, so a design
can be tested before it is built. Its default export has any of:

```js
// my-round/label/B.mjs: the home start button says what it starts.
export default {
  // Added to every page of this arm.
  css: "#btn-next-step { font-size: 1.15rem; }",
  // Runs before any site script (to wrap a global, set a flag).
  init: () => { window.__variant = "B"; },
  // Runs after the page loads, before the state's action.
  ready: () => {},
  // Runs after the state's action, just before the screenshot.
  after: () => {
    const b = document.querySelector("#btn-next-step");
    if (b) b.textContent = "▶ Cantar 3 min";
  }
};
```

- `init`, `ready` and `after` run in the page. A function is sent as its source
  text, so it cannot use anything defined in the module. For more code, keep
  it in a `.js` file and pass it as a string:
  `ready: fs.readFileSync(new URL("./B.js", import.meta.url), "utf8")`.
- If the site re-renders what you changed, change it in `after` too.
- A challenger that only exists after a tap (a menu, a finishing sheet) can
  export `states` in the same shape as `states.mjs`. Both arms get them.
- The patch is a prototype of something that will be built. If it cannot show
  a behaviour (a timer, a toast, what a tap does), put the behaviour in the
  caption.

## Writing a state

A state is one moment of use. Add it to `states.mjs`, or put it in a module of
your own and pass it with `--states-from` (to `run-all.mjs` and
`harness.mjs` so it renders, and to `blind.mjs` so its label appears):

```js
export const states = {
  // The Plan page after scrolling to its end.
  "plan-end": {
    label: "Plan, desplazado al final",   // heading of the blinded images (Spanish, like the site)
    days: { v: 1, days: { "2026-09-22": { sec: 240, n: 2, ex: ["s4-lip-trills"] } }, rest: { bank: 1, earnedAt: 0, used: [] }, backfilled: true },
    action: async (p) => {
      await p.click("#btn-plan");
      await p.clock.runFor(500);
      await p.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
      await p.waitForTimeout(400);
    }
  }
};
```

The fields are listed at the top of `states.mjs`. The page clock is frozen at
23 September 2026, 10:00 in Lima, so seeded days are always "recent"; advance
timers with `p.clock.runFor(ms)` and wait for toasts to clear before the
screenshot. A state must work for every arm: when it taps something a
challenger may have moved or removed, add `.catch(() => {})` so that arm
simply shows the same place on its own page, and say so in a comment.

## The rule and the guardrails

The rule in `decide.py` was written before any judge's answer was read, and
it is applied as written. For each challenger X:

- **wins**: how many of the three judges ranked X above today's design.
- **guard**: any objective regression against today's design, in any state
  and viewport: on phones, more controls under 44px tall in the first screen;
  smallest text under 12px and smaller than today's; more text failing WCAG
  contrast; horizontal page overflow that today's design does not have; more
  page errors; or a blocking problem reported by two or more judges.
- **ship X**: two or more wins and no guard. When several challengers qualify,
  the best mean rank wins, then the best mean score.
- **close**: one win, or two or more wins with a guard. If the guard is
  mechanical (a size, a colour), fix it and measure again; otherwise the
  question becomes a live experiment.
- **holds**: no challenger wins even once.

Change the rule only before a round's judging, and say so in that round's
decisions. A guard can come from the measurement rather than the design:
round 2's session-chrome contrast guard came from the two arms sitting at
different scroll positions, and went away when both were measured at the top
(state `guided-live-top`, see `rounds/decisions-r2.md`).

## Round records

`rounds/` holds both rounds run on 23 September 2026: 15 questions in round 1,
9 in round 2.

- `questions-r1.json`, `questions-r2.json`: the questions as the judges got
  them.
- `verdicts-r1.json`, `verdicts-r2.json`: the verdicts, with each judge's
  ranking, confidence and summary (design numbers already mapped to arms).
- `decisions-r2.md`: what round 2 decided to build.

Round 2's `pricing-prelaunch` used a slightly different "scrolled to the end"
state than round 1's `pricing`. Both are kept in `states.mjs`: round 1's as
`pricing-end`, round 2's as `pricing-end-card` (it was called `pricing-end` at
the time; `questions-r2.json` uses the new name). The patch modules of the two
rounds are not kept: they were written against the site as it stood that day,
and would not apply to today's code.

## Honest limits

- **Simulated judges are not users.** The judges were three personas played by
  the same model family, not learners. They share blind spots, so three
  agreeing judges are less independent than three people, and a 3 of 3 is not
  statistical evidence of anything.
- **They see still screenshots and written notes.** Motion, timing, sound,
  singing into the microphone, and anything a caption leaves out are
  invisible to them. Whoever builds a challenger also writes its captions,
  which is a way for bias to get in.
- **They strongly prefer challengers.** Across the two rounds, 21 of the 24
  questions ended with a challenger to ship, 2 were close calls and 1 kept
  today's design (the home screen after today's basics are done). Of the 33
  challenger designs, 30 were ranked above today's by at least two of the
  three judges, and 27 by all three. Challengers are usually built to fix a
  problem already seen in today's design, so part of this is real, but a panel
  that nearly always prefers the new thing cannot show that a change is
  safe. It is more useful for comparing challengers with each other and for
  finding what is broken.
- **A win depends on what else is on the table.** In round 1 the pricing
  challenger ("one plan, interval toggle, plain benefits") won 3 of 3 against
  today's dialog. In round 2, shown again next to an honest pre-launch
  version, it won 0 of 3 against today's, with a blocking problem reported by
  two judges. Round 1's "one big Start" won 3 of 3, and in round 2 it came
  second (mean rank 2.33) to a version that kept the same layout and raised
  every control to 44px. Put the strongest honest alternative you can think of on the
  table, not only today's design.
- **The measurements are rough.** They cover the first screen only; contrast
  is skipped for text on gradients; the primary action is found from a fixed
  list of selectors in `harness.mjs`.

## From a close call to a live experiment

A **close** verdict whose guard cannot be fixed mechanically, a question where
the judges split, or a **ship** verdict on something that matters a lot
(pricing, the first visit, the daily loop) should become a live A/B experiment
with real learners before the decision is final. How to set one up, how many
people it needs and how to read it are in
[docs/38-AB-TESTING.md](../../docs/38-AB-TESTING.md).
