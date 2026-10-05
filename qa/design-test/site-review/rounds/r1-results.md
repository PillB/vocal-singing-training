# Round 1 results: one header, one map

Date: 5 October 2026. Arm A: `main` at 2e5c046. Arm B: this branch at 89e61b4.
Questions: `r1-questions.json`. Judges and participants are simulated (Claude agents with
personas), not real users; read this as a structured expert review.

## Blinded judges (3 per question: beginner, designer, accessibility)

| Question | Verdict | A mean score | B mean score | B wins |
|---|---|---|---|---|
| exercise-header | ship B | 3.3 | 8.0 | 3/3 |
| header-find | ship B | 5.0 | 8.0 | 3/3 |
| catalog-tracks | ship B | 5.0 | 7.7 | 3/3 |
| plan-history-top | ship B | 6.0 | 7.7 | 3/3 |

No guard tripped (tap targets, text size, contrast, overflow, page errors). Every blocking
problem the judges reported was in arm A: Plan and Historial missing from the exercise header,
the phone's Back button leaving the site, the guide reachable only from the footer.

Problems the judges saw in arm B, carried into later rounds:

- Desktop exercise screen: "Ayuda", "Recorrido" and "Guía" read as three kinds of help.
- Phone header: the "Practicar" pill is tight, and "Más" sits close to the edge.
- Catalog: the singing list says 16 exercises but is numbered 1, 2, 3, 15, 16, 17.
- Catalog: a jump to the list leaves its intro line under the sticky header.

## First-click test (8 participants, 24 tasks, same tasks as round 0)

| | Round 0 | Round 1 |
|---|---|---|
| Right control, first tap | 76% | 79% |
| On the right path (incl. a closed menu that holds it) | 89% | 92% |
| Mean ease (1-7) | 5.19 | 5.33 |

Largest changes: finding the manual on desktop went from 2 of 8 (ease 2.8) to 8 of 8 (ease 6.0);
choosing another exercise from an exercise went from ease 4.6 to 5.4. Two tasks got a little
harder: reading the how-to on an exercise (6.0 to 5.4: "Ayuda", "Ver todos los pasos" and
"Mostrar pasos y consejos" compete) and picking the speaking track on a first visit (6.9 to 6.4:
two Hablar/Cantar choosers on one screen). Still unsolved: setting a reminder (0 of 8) and
recording yourself on a phone (0 of 8); language, Pro and the tour on a phone are found only by
guessing "Más".
