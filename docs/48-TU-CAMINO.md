# 48 · Tu camino: a game layer on the side of the habit (2026-11-21)

What this round added, why, on what evidence, every decision with the
alternatives it beat and the ways it could still be wrong, and what stays
open. The code is `js/voice-path.js` and `css/voice-path.css`, with small
hooks in `js/daily-loop.js`, `js/session-sets.js`, `js/app.js`,
`js/value-pulse.js` and `index.html`. It sits on top of the daily loop
(docs/37) and the goal sets (docs/47) and keeps their rules.

## 1. The request

"Gamify the website", from Pablo, scoped by the project's coordinator to:
streaks, progress and achievements that support real practice habits rather
than cheap engagement, fitted to the daily loop and the session sets, for
older adults and young adults alike, with every design decision red-teamed
(alternatives, five ways it could be wrong, limited or improved) and tested.

## 2. What was built

**Areas, counted in days.** The catalogue's 52 exercises fall into twelve
areas (five shared, two singing-only, five speaking-only): Calentar y cuidar,
Aire, Inicio y control, Afinación, Resonancia, Graves medios y agudos,
Canciones; Dicción y claridad, Volumen, Ritmo y pausas, Expresión,
Presencia. An area counts the distinct days it was practised, never takes,
minutes or scores. Five stages name how often, not how well: Lo probaste
(1 day), Lo practicas (5), En tu rutina (15), Es tuyo (40), De siempre
(100). Every area of the current track is listed, practised or not; an
unpractised one reads "aún no" in a dashed outline, an invitation and not a
gap. "esta semana" marks the areas touched since Monday.

**Logros, only ever earned.** Seventeen, in six groups: Constancia (a week,
four weeks, twelve weeks within the weekly goal's range, not necessarily in a
row; the same weekday four weeks running), Volver (a comeback; a rest day
used), Rutina (basics finished on 7 and 30 days; an Esencial or a Clase),
Explorar (every singing area; every speaking area; both voices; a goal set
finished), Cuidar la voz (a cool-down or recovery; a warm-up before the
song), Escucharte (a rated take; a recording listened back). None is listed
before it is earned, none has a counter, and none is ever taken back. Each
says, in one sentence, why the behaviour matters, with no claim the sources
do not make.

**Where it shows.**
- *Historial*: the card "Tu camino" after the days calendar and before "Tu
  progreso" (design "b": on the Estadísticas tab). A line of weeks within the
  goal and the best week, the areas, the logros (new ones whole and first,
  older ones folded to their title with the reason a tap away), and
  "Compartir mi semana".
- *Inicio*: one quiet button beside the fact cards, "Tu camino · 4 logros",
  or "Tu camino · 1 nuevo" with a gold dot when something is waiting. It
  opens Historial on the card, scrolled to it, with focus on its title.
- *The completion cards* (the loop's and a goal set's): at most two lines for
  what today brought, one when the card already carries two of its own, and
  never a second "welcome back" under the loop's comeback line. The rest
  waits in Historial ("Y 1 más en Historial, en Tu camino").
- *A switch*: "Ocultar" hides all of it (card, home button, completion
  lines) for this profile, synced, latest choice wins. Days, rest days and
  the loop are untouched, and nothing is saved up to be announced later.

**What is stored.** Nothing new for the counts: areas and logros are read
from the practice days already kept (`vt_days_v1`). The earned logros, what
has been seen, the stages reached and the finished goal sets are flags in
the existing `vt_achievements_v1` (per profile, synced as a union, so nothing
earned is lost when two devices merge). The hide switch is `pathOff` in
`vt_loop_v1`, merged by its own timestamp.

**Also in this round, in the same file (separate commit).** Two labels on the
loop's routine line, from the customer-research thread's think-aloud with
nine personas: a step's length reads "1 min 15 s" instead of "1:15", which a
third of them took for a time of day, and the second trill exercise is
"do-re-mi en trino" / "do-re-mi on a trill" instead of "solfeo en trino" /
"trill solfège", which all three English readers failed to parse.

## 3. Evidence

Read in full or in an author summary unless marked. Full notes, with effect
sizes and caveats, are in the research run behind this round.

| Finding | Source | What it decided |
|---|---|---|
| Expected, completion-contingent rewards lower free-choice motivation (d = −0.36); unexpected ones do not (d = 0.01); informational feedback raises it (+0.33, adults +0.43) | Deci, Koestner & Ryan 1999, *Psych Bull* 125:627 | Logros are unannounced, earned only, and each carries a reason |
| Incentives predict the quantity of performance, intrinsic motivation its quality | Cerasoli, Nicklin & Ford 2014, *Psych Bull* 140:980 | No points for minutes or takes; nothing tied to pitch or hold scores |
| Points, levels and leaderboards raised quantity, not quality or motivation | Mekler et al. 2017, *CHB* 71:525 | No XP and no levels built on practice volume |
| Self-monitoring of a behaviour works (d ≈ 0.40), more so when recorded and shared | Harkin et al. 2016, *Psych Bull* 142:198 | Days per area are the core "game"; sharing is one sentence, by choice |
| Missing one day does not set habit formation back; automaticity takes a median of 66 days (18 to 254) | Lally et al. 2010, *Eur J Soc Psych* 40:998 | Nothing withers; a comeback is a logro; the 12-week logro says "about two months, with large differences" |
| Same-weekday regularity predicts habits that last | Buyalskaya et al. 2023, *PNAS* 120:e2216115120 | "Tu día fijo" |
| A range goal is re-engaged with more than a single number | Scott & Nowlis 2013, *J Consumer Research* 40:444 | Weeks are counted against the low end of the loop's range goal |
| Emergency reserves raise goal days (4.00 against 2.83 a week) | Sharif & Shu 2021, *OBHDP* 163:17 | A rest day used is a logro, not a failure |
| A broken streak lowers continued engagement | Silverman & Barasch 2023 (university summary only) | No streak counter in this layer, no "lost" wording; weeks need not be consecutive |
| Game effects fall after about four weeks and partly recover in weeks 6 to 10 | Rodrigues et al. 2022, *Int J Educ Tech High Educ* 19:13 | The experiment is judged on weeks 5 to 12 |
| Badges with thresholds produce sprints, then slumps after the badge | Kivetz et al. 2006; Anderson et al. 2013 (via the research run) | No "N to go", no locked grid; widening stage gaps are named, not counted down |
| Age changes perceived ease of use, not enjoyment of game elements | Koivisto & Hamari 2014, *CHB* 35:179 | One adult visual language for both ages; effort spent on legibility and targets |
| For adults 55+, gamification evidence is 12 mostly weak studies; one game wrapper was rated less enjoyable than plain puzzles | Koivisto & Malik 2021, *Gerontologist* 61:e360; Boot et al. 2016 | No cartoon, no fiction, no "for seniors" mode; every logro tied to a voice benefit |
| Relatedness is the largest gamification lever (g = 1.78); rankings cause anxiety and jealousy | Li, Hew & Du 2024 (abstract); Bai et al. 2020 | Private share; no leaderboard |
| A 5 to 10 minute warm-up is enough; 15 added nothing | Ragsdale et al. 2020; Gish et al. 2012, *J Voice* 26:e1 | "Calentar antes de cantar" rewards order, not length |
| Cool-downs feel better; no measured protection | Ragan et al. 2016, *J Voice* 30:764.e1 | The caption says "felt", and says protection is unproven |
| Forecasts of which nudge works correlate with results at r = 0.02 | Milkman et al. 2021, *Nature* 600:478 | Shipped behind an experiment with a pre-stated metric |

No randomised study of gamification for singing or speaking-voice practice
was found. Every estimate above is borrowed from education, physical
activity and consumer research.

## 4. Decisions, the alternatives, and how each could still be wrong

Each decision lists what it beat, five ways it could be wrong, limited or
improved, and the test that holds it.

### D1 · Days per area as the core, not XP, minutes or scores

- **Beat:** XP per minute or per take (rewards quantity: Cerasoli, Mekler);
  a skill score from pitch or holds (performance-contingent rewards, d =
  −0.28, and a reason to strain); a single total only (no sense of breadth).
- **Could be wrong:** (1) a day of one 30-second exercise counts as much as
  a full Clase, so the count rewards touching an area, not working it;
  (2) the area map is a judgement call (s27 trill solfège sits in
  Afinación, not Calentar); (3) a singer who only ever wants songs sees six
  areas that "aún no" ask for attention they do not want; (4) days are not
  competence: twelve months of the same wrong habit fill the same bar;
  (5) speaking and singing share five areas, so a speaking day lifts a
  singing area and the card can look further along than the singer is.
- **Improve next:** the weekly then-and-now recording (competence is the
  need gamification barely moves, Li 2024); let a singer pin the areas they
  care about.
- **Tests:** Node "a day is a day" and "every exercise belongs to exactly one
  area"; browser "counts each area in days" (eight takes on four days read
  "4 días"); mutant VP1.

### D2 · Logros earned only, unannounced, never taken back

- **Beat:** the old grid of nine ☆ badges with thresholds, two of which went
  dark again (`streak_3`, `goal_week`), two rewarding held-note length (a
  strain risk), one rewarding a Pro export; a visible checklist with
  progress bars (expected rewards, goal-gradient slumps).
- **Could be wrong:** (1) hidden criteria feel arbitrary to people who like
  to plan; (2) a singer who earns most in the first month has little left to
  find (novelty fades by week 4 anyway); (3) "unannounced" is weakened by
  the guide, which describes them; (4) a logro earned on another device
  shows as new on this one too, which is right once but may surprise;
  (5) seventeen is a guess: too few for a year, maybe too many in month one.
- **Improve next:** add later layers around weeks 8 and 12 (the research
  run's recommendation), not more of the same.
- **Tests:** Node "nothing withers" and "no logro counts minutes, holds or
  scores"; browser "lists only the logros earned, nothing locked"; mutants
  VP11, VP17.

### D3 · Five stages at 1, 5, 15, 40 and 100 days

- **Beat:** levels from XP; even steps (every 10 days: 1 day would show
  nothing for a week); open-ended levels.
- **Could be wrong:** (1) the gaps widen, and the middle (15 to 40) can sag
  (Bonezzi et al. 2011 predict it; not verified here); (2) "De siempre" at 100
  days is a round number, not a habit threshold; (3) five bars still look
  like a progress meter to fill, a quiet "to go"; (4) "Es tuyo" says
  ownership that 40 days may not give; (5) the singing track's Canciones
  area has one exercise, so it moves only when that one is chosen.
- **Improve next:** stage names checked with real singers; a Canciones area
  that counts the songs a singer brings.
- **Tests:** Node "a stage is news at its exact count"; mutants VP9, VP10.
  The bars are segments, not dots, because five dots read as a star rating
  (checked in the screenshots, aesthetic pass 1).

### D4 · What counts as news

A first visit with months of practice behind it announces nothing; more than
three at once is history, not news (a sync that brought another device's
days); news needs practice today and the layer switched on; a stage is news
only at its exact count, and the first stage never is (the Esencial rotates
areas, so a new singer would be told about one most days). News counts as
seen once the card is on screen, not when it is drawn.

- **Beat:** announce everything as it is reached (a flood on first visit and
  after a sync); mark seen when drawn (design "b" draws the card behind
  another tab, a phone draws it below the fold).
- **Could be wrong:** (1) a singer who earns four in one day hears about
  none; (2) a logro earned on a day with no practice (a sync of yesterday's
  session from the phone) is never news on the laptop; (3) the 3 is a
  guess; (4) "on screen" means any pixel of the card, not the logro itself;
  (5) a stage waiting to be shown is kept as `false`, which sync drops, so a
  pending stage can be lost to a sync before it is shown.
- **Tests:** Node "first run files everything as seen", "many at once are
  history", "no practice today: quiet", "a jump is filed quietly"; browser
  "news once", "drawn but not on screen does not count as seen"; mutants
  VP5 to VP10, VU1, VU2.

### D5 · Where it lives: Historial, one home button, two lines on a card

- **Beat:** a new panel on the start screen (one primary action is a
  standing rule, docs/32); a toast after each exercise (practice is not the
  place); a modal "achievement unlocked" (interrupts singing).
- **Could be wrong:** (1) the home button is one more control on a panel
  people already found busy; (2) Historial is visited rarely, so the areas
  are unseen by most; (3) two lines on a completion card that already holds
  a milestone and a fact card is a lot on a phone in landscape; (4) the
  classic arm of the loop experiment has no home button, so it only finds
  the card in Historial; (5) a singer who never finishes a routine never
  sees a completion line.
- **Improved after a test turned red:** the home button first sat on a row
  of its own and made the strip under this week's ticks 288 px tall on a
  phone, past the 260 px that home-design.spec.js allows ("count beside this
  week's ticks"). The strip's three buttons ("Tus cartas", "Tu camino",
  "Poner un recordatorio") now share one wrapping row: side by side on a
  phone, two lines each, at their own width on a laptop.
- **Tests:** browser "the completion card names what the Mínimo brought, and
  no second welcome back", "a goal set finished with half its steps",
  home-choices.spec.js (the completion card's layout at 844 × 390, 390 × 844,
  360 × 740, 320 × 640), home-design.spec.js (the strip's height); mutants
  VP13 to VP15, VU3, VU4, VU7.

### D6 · The old badge grid is gone; the coach export carries the logros

- **Beat:** keeping both (two systems that disagree); keeping the grid as
  Pro-only (the guide said logros were Pro; the code made them free; neither
  is what a habit needs).
- **Could be wrong:** (1) anybody who liked a ☆ they had loses it; (2) the
  export's `achievements` changes shape (earned only, with titles), which a
  coach's script reading `unlocked:false` rows would notice; (3) `pro.ach.*`
  strings stay in `js/i18n.js` unused (left so this branch does not collide
  with the marketing thread's edits there); (4) "Tus logros incluidos en la
  descarga" still sells an export of something that is now free to see;
  (5) the experiment's "none" arm has neither grid nor card, so it tests
  "some layer against none", not "new against old".
- **Tests:** pro-features.spec.js (no grid, card shown, export equals
  earned); mutant VP17.

### D7 · A switch to hide it

- **Beat:** always on (some adults find game elements patronising, Boot
  2016); off by default (most people never change defaults).
- **Could be wrong:** (1) hidden, the logros still accrue silently, so
  showing it again later reveals a list nobody saw arrive; (2) the switch
  is per profile, so a household shares nothing; (3) it hides the home
  button, the only way in from home; (4) the word "Ocultar" may read as
  "delete"; the note under it says days stay; (5) the experiment cannot see
  who hides it except through `path_hide`.
- **Tests:** browser "Ocultar hides it everywhere, keeps every logro, and
  stays hidden after a reload"; Node "hidden: no news saved up"; mutants
  VP6, VP23, VU8.

### D8 · Sharing is one sentence, sent by the singer

"Esta semana canté 2 días (mi meta: 3 a 5). Llevo 5 días cantados. Entreno
con Entrenamiento vocal y de canto: <address>". A week with nothing yet says
only the total. The share sheet if there is one, else the clipboard, else
the sentence on screen to copy.

- **Beat:** a public profile or leaderboard (rankings harm; privacy); a
  shareable image (more work, a picture of a score); no sharing (monitoring
  made public to someone strengthens it, Harkin 2016).
- **Could be wrong:** (1) the address is a referral link in disguise; it is
  said plainly; (2) "mi meta" exposes a goal some would keep private;
  (3) nothing invites a reply, so the relatedness is one way; (4) the
  sentence is Spanish or English only; (5) a singer on the speaking track
  shares "practiqué mi voz", which some will find vague.
- **Improve next:** a practice partner who sees only days (relatedness, g =
  1.78), opt-in.
- **Tests:** browser "Compartir copies the week's sentence" (exact text, no
  address or logro names), "when the clipboard refuses"; Node share text in
  both languages, singular, and the week-without-practice case; mutants
  VP18, VP19, VU13.

### D9 · Shipped behind `path_2026_12`, judged on weeks 5 to 12

Control "path" (what everybody gets while the test is off), treatment "none".
Primary: practice days in days 28 to 84 after exposure. Guardrails:
practice days in the first 28, and the share who leave a Mínimo unfinished.
566 per arm for +2 days (mean 10, SD 12), at least 84 days. Exposed on the
first home or Historial drawn after a practice day, in both arms.

- **Could be wrong:** (1) at this site's traffic, 566 a arm is months away,
  so the honest reading for a long time is "no detectable difference";
  (2) the SD of 12 is a guess; (3) both arms send `path_*` only in one, so
  those are arm events and can never be metrics (the worker refuses them);
  (4) exposure on "any practice day" includes people who never look at
  Historial, diluting the effect; (5) the "none" arm loses the old grid too.
- **Tests:** ab-events.spec.js runs both arms through two Mínimos, a save and
  a refused microphone and requires every metric event in equal numbers;
  browser "the arm without it shows nothing, stores nothing, and is still
  counted as exposed"; worker tests check the preset; mutants VP17, VU12.

### D10 · One design for 60-year-olds and 20-year-olds

No mascots, confetti, sounds or childish copy; no "for seniors" mode (age
changes ease of use, not enjoyment). Labels at 12.5 px or more, captions at
14.4 px, every control 44 px tall, a disclosure chevron that turns, reduced
motion respected, forced colours handled, and the same calm gold the loop
already uses for celebration.

- **Could be wrong:** (1) young adults may find it too quiet to notice;
  (2) folded logros need a tap that some older users will not discover;
  (3) the small capitals group label is still small at 12.5 px; (4) no
  light theme; (5) no test with real older users.
- **Tests:** browser "on a phone in English it fits, reads, and every
  control is a full-size target" (no text under 12 px, every button and
  summary 44 px); mutants VU9 to VU11.

### D11 · The copy lives in `js/voice-path.js`, not `js/i18n.js`

- **Beat:** i18n.js keys (the repo's convention; the marketing thread was
  editing the same file at the same time, and a conflict there blocks both).
- **Could be wrong:** (1) the duplicate-key test does not see this table;
  (2) a translator has two files to look in; (3) the language switch must
  redraw this card itself; (4) the copy is not in the static-copy check;
  (5) moving it later is churn.
- **Tests:** Node "the copy promises nothing, names no score, and reads in
  both languages" (every logro translated, no promise or guilt wording,
  titles fit); mutant VP20.

## 5. Red-team passes

1. **Malformed and adversarial input.** Attack: flags stored as an array, a
   string, a number; rows whose exercises are a string or an object; a day
   key made of markup; flag keys made of markup. Defence: every read goes
   through a shape check; logro ids come only from the catalogue, stage keys
   only from a strict pattern; all text is escaped. Retest: Node "stored flags
   of the wrong kind…", synced-doc-injection.spec.js, corrupt-storage.spec.js.
2. **State, races and interruptions.** Attack: Historial drawn twice on the
   way in (the "Nuevo" label vanished under the reader: found and fixed);
   the completion card marking news seen while home behind it still said
   "2 nuevos" (found and fixed); a profile switch carrying one profile's
   "Nuevo" to another (fixed); a sync dropping a pending stage (accepted,
   D4.5); the home button pressed before Historial has drawn (focus waits
   for the card, for four seconds at most). Found in the aesthetic pass: a
   second scroll, fired before Historial's calendar was drawn, aimed at where
   the card was and landed a screen short of it at 200 % zoom; only the draw
   after the calendar scrolls now. Retest: browser "news once", "the
   completion card…", "at 200% zoom…"; mutants VU2, VU3, VU15.
3. **Accessibility and occlusion.** Attack: the card behind a design "b" tab
   counted as seen; focus lost on hide and show; area rows read as "1 días"
   or "0 días, aún no" by a screen reader (found: the spoken label now reads
   "Inicio y control: aún no", "Aire: 7 días, Lo practicas, esta semana");
   labels under 12 px (found at 11.8 px, raised); targets under 44 px.
   Retest: browser tests for each; mutants VU1, VU9 to VU11.
4. **Numerical and scientific claims.** Attack: every caption against its
   source. Two failed and were rewritten: "el oído es mejor juez que la
   sensación" (no source; now the bone-conduction fact) and "tanto como
   cantar" (an overclaim). The weeks count is against today's goal, so a
   higher goal counts fewer weeks (said in the code; logros stay). Day keys
   are local days from the ledger (Lima evening tests in practice-days
   specs). Five years of daily practice evaluate in under 60 ms.
5. **Integration, privacy and CI.** Attack: events the worker drops (all four
   `path_*` names added to its list and to the arm events); a metric only
   one arm sends (the preset check refuses it); exposure only in one arm
   (both arms expose: VU12); the share text leaking anything personal (no
   address, no names, no logro list); inline handlers under the CSP (none);
   asset versions and the preload list (bumped; boot-preload test); the
   synced document size (at most about 60 short keys).

## 6. Aesthetic passes

1. **Desktop, 1366 × 900.** Three columns of areas, logros in a grid, the
   hide button at the top right of the card. Change made: the five round
   pips became five short segments in the accent blue, because gold dots in
   a row read as a star rating.
2. **Narrow phone, 390 × 844 and 360 × 740.** One column; the hide button
   stays beside the title instead of wrapping under the subtitle. Change
   made: logros already seen fold to their titles; seventeen open captions
   were a wall of text.
3. **200 % zoom and keyboard (640 × 360).** The card reflows like the
   phone; the home button lands focus on the card's title; Tab goes Ocultar,
   then each folded logro, then Compartir; hide moves focus to "Mostrar" and
   back; a folded logro opens from the keyboard and shows its focus ring.
   Change made: the jump from home landed with the title at the bottom edge
   (P48-9); it now lands just under the sticky header. The completion card
   at 844 × 390 keeps its buttons on screen and scrolls its body to the
   logro line.
4. **Colour, motion and language.** Gold only for what was earned (medals,
   "Nuevo", the home dot); the accent for stages; green only for "esta
   semana", as on the calendar. Motion only on the completion card, off with
   reduced motion. English checked in full (no Spanish left on the card) and
   for plurals ("1 day sung so far").

## 7. Verification

Run on 2026-11-21, on Chromium (Playwright's build) in a Linux container:

| Check | Result |
| --- | --- |
| `npm run lint` | pass: complexity ≤ 15 for every new or changed function, the legacy list unchanged |
| `npm run test:core` | 1,277 pass, 0 fail, 2 todo |
| `tests/node/voice-path.test.mjs` | 30 pass |
| `node qa/mutate.mjs path` | 23 of 23 killed |
| `node qa/mutate.mjs pathui` | 15 of 15 killed |
| Browser: voice-path, home-design, home-choices, daily-loop, retention, redteam-home-retention | 129 of 129 pass before the last fix; voice-path (14), pro-features and ab-events (28) after it |

The mutation runs found four tests that could not fail: VP5 (the first run's
quiet rule was masked by the news limit), VP21 (the song came first, so the
order rule was never reached), VP22 (no run of exactly three weekdays) and
VU10 (on a phone the site's own rule already makes small buttons 44 px).
Each now has a case that turns red: a first run with one logro, a warm-up
after the song with sirens before it, three Mondays, and the switch measured
on a laptop.

Not verified: Safari and Firefox, real phones, real users.

## 8. Decisions left to Pablo

- Whether the old "Pro" export of logros stays a Pro feature now that the
  logros themselves are free to see (D6.4).
- "Tus básicos" or "Tu rutina de hoy" for the loop's name (6 of 9 personas
  misread "básicos" in the customer-research think-aloud; it touches several
  strings in `js/i18n.js` and the marketing copy).
- Whether to switch `path_2026_12` on now or after `loop_home_2026_10` reads
  out (two tests on the same screens at once share their traffic).

## 9. Open items

- A weekly then-and-now recording, the competence evidence this layer cannot
  give.
- A practice partner who sees only days, opt-in.
- An if-then plan prompt at first visit and on a comeback (Gollwitzer &
  Sheeran, d = 0.65).
- Ask the browser to keep storage (`navigator.storage.persist`): the flags
  live in localStorage, which a browser may clear.
- Remove the unused `pro.ach.*` strings once the marketing branch has merged.
