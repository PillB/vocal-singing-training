# Round 2 results: a calmer home page, a reminder you can find

Date: 5 October 2026. Arm A: round 1 (89e61b4). Arm B: round 2 (cf7cae9), then 2b (8361b82)
for the two screens retested. Questions: `r2-questions.json`, `r2b-questions.json`. Judges and
participants are simulated (Claude agents with personas), not real users; read this as a
structured expert review.

## What changed

- Practicar keeps today's practice, the start panel and the catalog. Totals, achievements, the
  practice map and the Pro offers moved to Historial, under "Tu progreso".
- The daily reminder opens from "🔔 Poner un recordatorio" on the week card, in a small dialog,
  instead of a panel at the very bottom of Practicar.
- "Otras formas de practicar" gained "Elegir un ejercicio", which jumps to the list; the line of
  shortcuts above the catalog went.
- Cantar lists warm-ups and technique first, then the class exercises from shortest to longest,
  without homework numbers. The first-visit headline says what the site is for.

## Blinded judges (3 per question: beginner, designer, accessibility)

| Question | Verdict | A mean score | B mean score | B wins |
|---|---|---|---|---|
| home-first | ship B | 6.0 | 7.0 | 3/3 |
| home-returning | ship B | 6.0 | 8.0 | 3/3 |
| catalog-order | ship B | 6.0 | 6.7 | 2/3 |
| history-progress (round 2) | close | 5.7 | 6.3 | 2/3 |
| history-progress (2b retest) | B, guard fixed in 2c | 5.3 | 7.0 | 3/3 |
| reminder (round 2) | ship B | 3.0 | 8.0 | 3/3 |
| reminder (2b retest) | ship B | 3.0 | 8.0 | 3/3 |

Historial was close in round 2: the judges wanted the progress there but found it noisy (a Pro
banner ahead of it, profile settings inside it, "6/3" with no words, an empty "Nota más larga",
a cut-off achievement, faint locked bars that looked like an empty chart). Round 2b fixed those
and won 3 of 3. Its one guard (two tags at 10.4px on desktop) is fixed in 2c, with the judges'
last notes: one Pro offer per page, the goal line naming what it counts, the reminder dialog
with one way on (the main button) and one way off (the ticked box).

Carried into later rounds: the 26-week practice map repeats the calendar in tiny colour-only
squares; "Entrar" can read as "start" to a newcomer; the catalog's Hablar/Cantar switch repeats
the first-visit choice lower down.

## First-click test (8 participants, 24 tasks, same tasks as rounds 0 and 1)

| | Round 0 | Round 1 | Round 2 |
|---|---|---|---|
| Right control, first tap | 76% | 79% | 83% |
| On the right path (incl. a closed menu that holds it) | 89% | 92% | 96% |
| Mean ease (1-7) | 5.19 | 5.33 | 5.46 |

Setting a reminder went from 0 of 8 (ease 2.4) to 8 of 8 (ease 7.0). Still unsolved: recording
yourself on a phone (0 of 8: the option is hidden on phones) and the menu-only items on a phone
(language, Pro, tour: found only by guessing "Más", ease about 3). Reading an exercise's
instructions stays at 5.3: "Ayuda", "Ver todos los pasos y consejos" and "Mostrar pasos y
consejos" compete. Those are rounds 3 and 4.
