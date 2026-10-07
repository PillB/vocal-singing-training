# Round 3 results: an exercise screen that says what its controls do

Date: 5 October 2026. Arm A: round 2b (8361b82; the exercise screen did not change in 2c). Arm B:
round 3 (52259ab) plus the phone piano-row fix (562b883). Questions: `r3-questions.json`. Judges
and participants are simulated (Claude agents with personas), not real users; read this as a
structured expert review.

## What changed

- Phones can record: "⏺ Grabarme" sits beside Empezar on every screen size (it was hidden on
  phones, and a small "Grabar" box on desktop).
- Plain labels: "Tiempo" instead of "Listo" beside the timer, "Micrófono" instead of "MIC",
  "A mi voz" instead of "Rango", "🎹 Piano ▾" instead of an icon with a plus, "Piano automático"
  instead of "Auto". Opened piano options keep their words on phones and wrap.
- The pitch readout says nothing until it has heard a voice ("canta para medir"). It used to say
  "en el tono · estable (preciso)" before anyone sang. Its words are Afinación and Estabilidad,
  with "un poco grave / sube" style directions.
- When the time runs out the screen says so, asks "¿Cómo te fue?" in the first screen, hides the
  settings rows, and the start button reads "↻ Otra vez".

## Blinded judges (3 per question: beginner, designer, accessibility)

| Question | Verdict | A mean score | B mean score | B wins |
|---|---|---|---|---|
| exercise-start (phone, desktop) | B; guard is a false alarm | 4.0 | 7.7 | 3/3 |
| exercise-pitch (phone, desktop) | B; guard is a false alarm | 4.7 | 7.0 | 3/3 |
| exercise-timeup (phone, desktop) | ship B | 2.3 | 8.3 | 3/3 |
| exercise-piano (phone, desktop) | B after 3b | 3.7 | 6.3 | 3/3 |
| exercise-speaking (phone) | B; guard is a false alarm | 6.3 | 6.7 | 2/3 |

The guard that held four questions at "close" counts checkboxes under 44px. Each one it counts
(the new "Grabarme" box, and the piano options' boxes on phones) sits inside a label that is the
44px tap target, the same pattern as the "A mi voz" box arm A already had.

Every blocking problem the judges reported in arm A is fixed in B: no way to record on a phone,
a readout that said "in tune, stable" before any singing, a time-up state that showed only a
clipped "Listo 00:00" and a big green Empezar, and unlabelled piano checkboxes running off a
phone's edge.

Round 3b (aa93408) fixes what the judges found in B:

- Desktop with the piano options open: the options ran off the right edge and the microphone
  slider covered the octave buttons. They now take their own row. A landscape phone and a narrow
  tablet keep the short "Mic" label so the row fits.
- The unticked "Grabarme" box was dark grey on near-black. Unticked boxes on the rail are now
  light.
- "Ver todos los pasos y consejos" appeared twice. The "Cómo practicar" card's toggle now reads
  "Mostrar ▾ / Ocultar ▴".
- Speaking ladders showed one rung as "1:15" and the others as "75 s". All rungs use the clock.
- The pitch box showed a lone "—" before singing. It now reads "Afinación —".

Carried into later rounds: "Siguiente peldaño →" and "Paso a /A/ →" stand out before the
exercise starts and compete with Empezar (in both arms); music words ("octava", "SOVT",
"I–vi–IV–V") with no explanation; "Grabarme" does not say the take is saved in Historial.

## First-click test (8 participants, 24 tasks, same tasks as rounds 0 to 2)

| | Round 0 | Round 1 | Round 2 | Round 3 |
|---|---|---|---|---|
| Right control, first tap | 76% | 79% | 83% | 86% |
| On the right path (incl. a closed menu that holds it) | 89% | 92% | 96% | 98% |
| Mean ease (1-7) | 5.19 | 5.33 | 5.46 | 5.54 |

Recording yourself on a phone went from 0 of 8 (ease 2.0) to 5 of 8 scored (ease 6.6). All
eight chose "Grabarme"; three gave the badge number it has on the other exercise screenshot in
their brief, so the strict score counts them as misses. Reading an exercise's instructions went
from 5.3 to 5.6. Lowering the notes dipped from 4.9 to 4.4: participants still find "−" next to
"octava", but "A mi voz" now reads as a second way to do it.

Still unsolved: the phone's menu-only items (language, Pro, the tour: found only by guessing
"Más", ease about 3), and the Plan's "Elige el elemento" (ease 4.6). Those are rounds 4 to 6.
