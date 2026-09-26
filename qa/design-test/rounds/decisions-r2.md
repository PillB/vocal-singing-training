# Round 2 decisions (simulated blinded judges, not user data)

Rule applied as pre-registered (../decide.py). Verdicts in verdicts-r2.json, with each judge's
ranking, confidence and summary. The judges' full notes (per-design scores and reasons, problems
found) were kept with the working files and are not in the repo.

| question | verdict | build |
|---|---|---|
| naming | ship B (3/3; C also 3/3 but worse mean rank) | B: one naming scheme, routes behind "Otras formas de practicar" |
| done-landscape | ship B (3/3) | B: two-column done card under 500px tall, actions pinned |
| pricing-prelaunch | ship B (3/3); C = round-1 winner "one plan" lost 0/3 with a blocking problem | B replaces the round-1 pricing winner |
| selected-style | ship B (3/3) | B: tint + 3px bar + check for choose-one controls |
| exercise-end | ship B (3/3) | B, sharing the one-tap rating component with rating B |
| rating | ship B (3/3; C 3/3 but rank 2.0) | B: one-tap feel rating |
| session-chrome | close: C 2/3, B 1/3, both with a guard | C with fixes, see below |
| start-floor | ship B (3/3); C = round-1 winner "big start" 2/3 rank 2.33 | B replaces the round-1 big-start winner |
| coach-strip | ship B (3/3) | B |

## session-chrome guard, re-measured
Guard was "controls under 44px 9 -> 12, contrast 0 -> 2" on 360x740 while singing.
Re-measured with both arms at scrollY 0 (state guided-live-top in ../states.mjs): contrast 2 = 2 (the
difference was the app's own stage-fit scroll). The 3 extra sub-44 controls are
#btn-practice-stop (40), #mic-sensitivity (28), #btn-oct-down (25): existing stage
controls that now fit in the first screen because the banner is shorter. They are the
controls start-floor B raises to 44px, so shipping start-floor B clears the guard.
Mechanical, so C ships with the judges' fixes: the bare x must not be the end control
(two judges read it as "dismiss banner"); pause and end get visible text labels.
