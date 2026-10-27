# Round 5 results: the Plan, Historial and the guided routine

Date: 5 October 2026. Arm A: round 4 (4f1c674). Arm B: round 5 (71e327e). Questions:
`r5-questions.json`. Judges are simulated (Claude agents with personas), not real users; read this
as a structured expert review.

## What changed

- Plan: "¿Qué quieres mejorar esta semana?" instead of "Elige el elemento", one line under the
  choice saying what it trains, and a start button that names the week and the choice.
- Historial: the year map waits until there are a few weeks to show; the calendar and the saved
  sessions come first.
- After rating a guided step, the next step sits under the score, on screen, instead of under the
  breakdown. While the step-done card shows, the foot of the page drops its second "Siguiente
  ejercicio".
- Past the first step, Terminar asks first ("¿Terminar la rutina? Vas en el 2 de 2."), with
  "Seguir" in Terminar's place, so a second tap keeps the routine going. The toast no longer says
  "limpiada".
- The tour's Plan stop uses the Plan's new words.

## Blinded judges (3 per question: beginner, designer, accessibility)

| Question | Verdict | A mean score | B mean score | B wins |
|---|---|---|---|---|
| plan-choose (phone, desktop) | ship B | 5.3 | 7.7 | 3/3 |
| history-early (phone, desktop) | ship B | 6.0 | 7.0 | 3/3 |
| step-next (phone, desktop) | ship B | 4.0 | 7.3 | 3/3 |
| end-ask (phone, landscape) | B; guard is a false alarm | 2.0 | 8.0 | 3/3 |
| tour-plan (phone, desktop) | ship B | 5.0 | 8.0 | 3/3 |

B won all 15 judgements. The guard on end-ask counts tap targets under 44px; the one it counts is
a checkbox inside a 44px label, as in rounds 3 and 4.

What the judges found in arm A that B fixes: "Elige el elemento" read as jargon and nothing said
what a choice trains; the way to the next guided step sat under the score's breakdown, off screen;
one tap on Terminar on step 2 ended the routine, sent the learner home and restarted at step 1,
with a "Sesión guiada limpiada" toast that hid part of the home card.

## Round 5b (e754767), from the judges' notes on B

- After rating a guided step, the next step reads like the step-done card ("Siguiente: Solfeo en
  trino de labios →") at full size, with no heading repeating it, and no "saved" toast over the
  back and Ayuda buttons (the rating card already says "Guardado").
- Plan: the start button follows the choice and its line, above this week's exercises, so it is in
  the first screen on desktop.
- The tour's Plan stop rings "Ver otros" and the start button when they fit.
- On a phone on its side, "¿Terminar la rutina?" stands out in the header line instead of a grey
  subtitle.
- Historial: the last score has a line of its own, and the calendar's key names today's outline.

## First-click check on the round 5 build

The same 24 tasks and 8 simulated participants as rounds 0 to 3 (`firstclick.mjs`):

| Build | Right first tap | On the right path | Mean ease (1 to 7) |
|---|---|---|---|
| Round 0 (main) | 76% | 89% | 5.19 |
| Round 3 | 86% | 98% | 5.54 |
| Round 5 | 88% | 100% | 5.60 |

Still the weakest, all on a phone: changing the language (3.1), finding the price (3.0) and
reopening the tour (3.0), each behind "Más". Round 6 tests that menu's label.
