# Round 6 results: the phone menu's label, and names that say what they open

Date: 5 October 2026. Build: round 6 (7209382). Participants are simulated (Claude agents with
personas), not real users; read this as a structured expert review.

## The phone menu's label (first-click, 3 arms, 8 participants each)

On a phone the language, the price and the tour live in the header's menu. In round 5 those three
tasks were the hardest (ease about 3 of 7), so this round tested the menu's label on the returning
home page. Tasks: `r6-menu-tasks-a.json`, `-b`, `-c`; prototypes are the design-test states
`home-returning-menu-b` and `home-returning-menu-c`.

| Task | A "Más ▾" (today) | B "☰ Menú" | C "☰ Más" |
|---|---|---|---|
| history (direct) | 8/8, ease 7.0 | 8/8, ease 6.9 | 8/8, ease 7.0 |
| language (via the menu) | 8/8, ease 3.8 | 8/8, ease 4.4 | 8/8, ease 4.5 |
| account (direct) | 8/8, ease 5.6 | 8/8, ease 5.3 | 8/8, ease 5.4 |
| price (via the menu) | 7/8, ease 2.9 | 5/8, ease 3.3 | 5/8, ease 3.1 |
| tour-again (via the menu) | 8/8, ease 3.5 | 8/8, ease 3.5 | 8/8, ease 3.4 |
| **all, on the right path** | **98%** (39/40), ease 4.55 | **93%** (37/40), ease 4.65 | **93%** (37/40), ease 4.67 |

No clear winner. The ☰ arms read a little easier for the language (about +0.6) but sent fewer
people to the right place for the price (5/8 against 7/8), and overall ease differs by 0.1 on 8
people per arm. "Más" stays. What the participants said points at the content, not the label:
nothing on the screen says the language, the price or the help are in that menu.

## Changed in round 6, from the participants' comments in rounds 5 and 6

- The exercise's guide card is "Pasos y consejos", the name the stage's "Ver todos los pasos y
  consejos" already used; it was "Cómo practicar", so three help entries read as three things.
- The header's "Recorrido" and "Guía" read "Ver el tour" and "Leer la guía", the words the home
  page and the tour use.
- The piano button drops its word where it would wrap to a row of its own (below 380px, and
  English at 390px), so the lane gets the row back.
- Home, after stepping out of a routine, says "Vas por el ejercicio 1 de 2" instead of "Llevas 0
  sesiones guardadas".
- English: "History", not "History / Audit".

These labels were not run through a separate blinded comparison; the final re-rating covers them.
