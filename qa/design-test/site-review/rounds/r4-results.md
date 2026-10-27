# Round 4 results: one tour across the whole site

Date: 5 October 2026. Arm A: round 3b (22e780d). Arm B: round 4 (4f1c674). Questions:
`r4-questions.json`. Judges are simulated (Claude agents with personas), not real users; read this
as a structured expert review.

## What changed

- The home tour goes to each place instead of describing it from the home page: today's basics,
  an exercise, the Plan, Historial, then sign-in and the "Más" menu. Each card names its place
  ("Paso 3 de 5 · Plan"), and the back button is not filled with the tour's pages.
- The last card's main button starts today's basics ("Empezar mis 3 min"); "Ahora no" closes the
  tour. "Saltar ayuda" turns automatic help off for good.
- The in-exercise help explains what each control does, in three to six cards per kind of
  exercise, instead of walking the screen region by region in up to twelve.
- The ring sits on the real control; the white box around the card's title and the second
  square ring are gone; the phone card stays above the EEA consent bar.

## Blinded judges (3 per question: beginner, designer, accessibility)

| Question | Verdict | A mean score | B mean score | B wins |
|---|---|---|---|---|
| tour-start (phone, desktop) | ship B | 6.0 | 8.0 | 3/3 |
| tour-stops (phone) | B; guard is a false alarm | 5.0 | 8.0 | 3/3 |
| tour-end (phone, desktop) | ship B | 4.7 | 8.0 | 3/3 |
| help-pitch (phone, desktop) | ship B | 4.0 | 8.0 | 3/3 |
| help-speech (phone) | ship B | 4.0 | 8.0 | 3/3 |

The guard on tour-stops counts tap targets under 44px; the ones it counts are the checkboxes
inside 44px labels on the exercise stop, as in round 3.

Problems the judges found in arm A and B fixes: a welcome card that said what the site has but
not what to do first; a last card listing six places in one paragraph with two buttons that both
close; a "Recorrido" button the text named and the phone does not show; help cards describing a
left/centre/right layout that a phone stacks; the Empezar button never shown in the first two
help cards of a speaking exercise.

Round 4b (71e327e) fixes what the judges found in B:

- The speaking exercise's Empezar card mentioned the piano. It mentions it only when the exercise
  has one.
- On a phone the lane's ring took in the microphone and octave rows laid over the stage. Controls
  laid over the lane are cut from the ring.
- On desktop the tour scrolled the stats row away. It scrolls only when the target is off screen.
- The Historial stop described days a newcomer has none of. With no practice yet it says what
  will fill it.
- The exercise stop did not show the Ayuda button it talked about; the card now says where it is.
- The active tab was faint. It has a stronger fill, an outline and an underline.

Left as minor: on a phone the first stop's ring touches the headline; on desktop the last card
covers the hero's Empezar; on a phone the card covers the "Ver el tour / Leer la guía" links.

Carried into round 5: the Plan's "Elige el elemento" (named jargon by all three judges on the
Plan stop), and the exercise screen's music words ("octava", "toma").
