# 47 · Goal sets and guided voice drills (2026-11-11 / 12)

What this round added, why, on what evidence, and what stays open. The code is
`js/session-sets.js`, `css/session-sets.css`, `Modes.voiceDrill` in
`js/practice-modes.js`, `js/scenes/voice-drill.js`, and five exercises in the
catalogue (v21 to v24, s28).

## 1. The request

The singing side had prepared sessions; the speaking side had none. The ask
was a matching set of sessions for speaking, the missing techniques on both
sides chosen by weight of evidence (reviews before single papers), better
pictures for each exercise and set, and a layout that works by touch on
phones, tablets and laptops.

## 2. What was built

### Goal sets ("Rutinas por objetivo")

A set is a short ordered list of existing exercises with its own step times.
It runs on the session engine (`VTSession`, path `set`), so the banner, the
timers, a reload and "next" behave as in any guided session. It does not mark
today's basics and it stores nothing new: "practised today" is read from the
practice days already kept.

| Set | Steps | Minutes | Grade |
|---|---|---|---|
| v-pretalk · Antes de hablar | s18, v21, v2 | 8 | limited |
| v-aftertalk · Después de hablar mucho | s17, v22 | 12 | moderate |
| v-clarity · Que se te entienda | v23, v1, v10 | 9 | limited |
| v-expression · Voz con expresión | v12, v13, v19, v20 | 10 | limited |
| v-fillers · Pausas en vez de muletillas | v11, v10, v17 | 10 | limited |
| v-voice · Voz en forma | v21, v24 | 12 | moderate |
| s-warmup · Calentar para cantar | s17, s18, s4, s5, s7, s10 | 8 | limited |
| s-pitch · Afinación | s9, s10, s13, s16 | 11 | limited |
| s-technique · Técnica en 13 minutos | s18, s6, s8, s12, s11, s14 | 13 | limited |
| s-function · Función vocal | s28, s6 | 10 | moderate |
| s-range · Graves, medios y agudos | s4, s5, s24, s25 | 9 | class tradition |
| s-cooldown · Enfriar la voz | s5, s6, s7 | 6 | limited |

Each card says what the set is for, why (in plain words, with the study's
limits), the source, and a grade written out. No grade is drawn as the
maximum: nothing here has strong long-term evidence in healthy voices.

Set-level pictures: a step trail on the session banner (one mark per step,
done, now, to come, with the position also in words) and a finishing card
(a tick per practised step, no score).

### Guided voice drills

One mode, `voiceDrill`, runs a drill written as data: a list of timed steps,
each silent, sounded, spoken, or one half of a pair to compare.

| Exercise | What you do | What the phone counts | Self-rated |
|---|---|---|---|
| v21 De la pajita a la frase | Soft straw sounds, glides, loudness waves, a sentence through the straw, the same sentence without it | Soft sounds of 1.5 s or more | Ease after; carry-over |
| v22 Recuperar la voz | Five quiet minutes with water, then five of soft straw sounds | Whole quiet minutes; soft sounds | Comfort after |
| v23 Habla clara | The sentence your usual way (A), then as if to someone who hears poorly (B), then with pauses marked, then normal pace | Nothing is filled in. After Stop: B against A by speech rate, share of the take in pauses, level | Clarity on listening back; naturalness |
| v24 Funciones vocales | Long soft "ee", glide up, glide down, five soft notes twice | Sounds of 3 s or more; the longest, rounded down | Easy voice |
| s28 Función vocal con notas | The same on the piano's notes (F, then C to G, at the singer's octave) | As v24 | Easy voice |

## 3. Evidence

Grades: **moderate** = controlled trials or a review support the short-term
or trained-task effect in healthy voices; **limited** = one small trial,
patient studies, or indirect support; **tradition** = taught, not measured.

| Claim made in the app | Source | Grade | What the app does not claim |
|---|---|---|---|
| Straw and other half-closed sounds lower, for a while, the pressure needed to start the voice and the effort felt | Apfelbach & Guzmán 2024, integrative review of 53 studies (PMID 34774370) | moderate, short-term | That warming up improves how you speak or sing afterwards |
| Straw into a sentence | Kapsner-Smith et al. 2015 (flow-resistant tube protocol, people with voice problems) | limited | That the carry-over step is tested in healthy speakers |
| After heavy use, 5 min quiet then 5 min straw recovered the voice better than 10 min quiet | Peng et al. 2026, RCT, 114 healthy adults after 1 h of loading (PMID 42156834) | moderate, one study | Prevention of voice problems |
| Recovery takes hours | Hunter & Titze 2009 | limited | A safe daily dose |
| Clear speech is understood better | Picheny et al. 1985 (+17 points, listeners with hearing loss); Smiljanić & Bradlow 2009 (review) | moderate for the listener's benefit | That a short daily drill carries into everyday talk |
| Vocal function exercises lengthen how long a sound can be sustained | Stemple et al. 1994 (35 women, controlled); Sabol et al. 1995 (20 singers); Bane et al. 2019 (dose); Angadi et al. 2019 (review of 21 studies, no adverse effects) | moderate for the trained task | Better-sounding speech or singing; range; prevention |
| Pitch varied more is heard as more charismatic; a visual signal increased variation | Rosenberg & Hirschberg 2005; Hincks & Edlund 2009 (n = 14) | limited | A norm for "expressive" |
| Noticing fillers and pausing instead reduced them | Mancuso & Miltenberger 2016 (n = 6); Spieler & Miltenberger 2017 (n = 4) | limited | Long-term change |
| Singers rated themselves better after a warm-up; listeners barely heard it | Moorcroft & Kenny 2013 (n = 12) | limited | An audible improvement |
| Practice with pitch in view improved accuracy more than by ear | Berglin, Pfordresher & Demorest 2022 (one 20-minute session) | limited | Lasting improvement |
| Singers who cooled down said the voice felt better | Ragan 2016 | limited | Any measured change |
| Resonance "zones" | Class tradition | tradition | That the phone hears where a voice resonates |

No study shows that any routine here prevents voice disorders (Ruotsalainen
et al. 2007; Ramos et al. 2025). The copy checker
(`tests/node/session-sets.test.mjs`) rejects prevention, cure, guarantee and
diagnosis words on every card.

## 4. Decisions an expert could challenge, and the answer

| Decision | The challenge | Why it stands, or what it costs |
|---|---|---|
| "As long as it stays easy" instead of a maximal hold in v24 and s28 | Bane et al. 2025 found a time goal and maximal sustain are active ingredients | Unsupervised maximal holds invite squeezing, and the clinical goal needs a lung-volume measure a phone lacks. Cost: probably a smaller gain than the clinic protocol. A self-referenced goal (first week's median plus a fifth) is the next step and needs per-exercise history |
| Each exercise twice per run | The studied dose is twice per session, twice a day | The drill does two repetitions; the card says twice a day. Once per session was not enough in Bane et al. 2019 |
| B against A by rate and pause share | Clear speech is defined for the listener | The phone cannot hear intelligibility. It reports two things that do not grow when a take merely runs longer, labels them approximate, and leaves clarity self-rated. The syllable counter undercounts fast speech, which makes "slower" harder to earn, not easier |
| A louder B is not flagged when it is also slower | The instruction says not to push the volume | Clear speech tends to come out somewhat louder as well, and loudness alone does not make speech clearer. Only "louder and no slower" is pointed out |
| Resonant voice therapy was not added as an exercise | It is a standard bridge from hum to speech | In healthy speakers the trials found no group effect (Meerschman et al. 2017; Nanjundeswaran et al. 2012). Adding it would contradict the brief |
| No singer cool-down exercise; the cool-down stays a set | A guided cool-down is a common ask | The evidence is one small study of self-report. The set already does it with three existing exercises |
| The guided routes "Expresión" and "Técnica" keep their 11 exercises | New exercises are missing from them | A ten-minute recovery drill does not belong in an expression session. Sets carry the new drills |
| The speaking group is renamed "Voz y expresión" | A rename moves a label people know | A straw exercise under "Expresión" is the wrong shelf. The stored tier is unchanged |
| The sets sit behind "Otras formas de practicar" | A first-time visitor will not see them | One primary action on the start panel is a standing rule (docs/32). Cost: discovery |
| Nothing new is stored | There is no per-set history or streak | No migration, nothing to lose. Cost: the finishing card cannot say "third time this week" |
| The piano's note is muted to the counter for 1.8 s | A learner who starts at once loses the first second | Otherwise the note itself is counted as a hold through the speakers |
| Quiet minutes are strict: two seconds of sound cost the minute they fall in | A sip of water, a door or a cough is not talking | Voice rest means no voicing, and a cough is not rest either. The phone cannot tell a door from a voice, so a noisy room can cost a minute the learner did keep. The field is labelled as what was heard, and an allowance (say 3 s a minute) is a number to set from real recordings, not a guess |
| At 360 × 640 the s28 picture gives way to the step, cue and count | The bars are the measured part | The count stays in words. A phone that small cannot hold the piano row, two controls, the cue and a picture in one screen |

## 5. Verification

Run on 2026-11-12, Chromium, local server, on the branch after `main` was
merged into it (the site designs of docs/46, the touch hover fixes and the
audio recovery work):

- `npm run lint`: pass (complexity, waits, asset versions). One legacy
  complexity exemption removed (`modeDisplayName` is now a table).
- `npm run test:core`: 661 pass.
- `tests/session-sets.spec.js`: 32 pass. `tests/exercise-viz-voice-drill.spec.js`: 18 pass.
- Fifteen wider browser specs (site designs on every device size, touch
  hover, start visibility, guided scenes, catalogue regression, validation,
  copy, home choices, all flows, daily session, plan and history, stage,
  viewport overflow, hit targets): 384 pass.
- Mutants: `node qa/mutate.mjs sets` GS1 to GS13 killed; SS1 to SS13,
  VD1 to VD19 and WL1 to WL9 (flows set) killed. Each SS and VD mutant is now judged by the
  test written to catch it instead of its whole spec: 27 whole-spec runs on
  top of the flows job's own would outlive its 30 minutes on the build
  server (the QA-45 failure, which ends as "cancelled", not red).

### The site's two designs

`main` gained a second site design while this branch was open (B,
"Enfocado": two destinations in the header, catalogue groups that fold).
What was checked, and how:

- The four new speaking drills sit in the second catalogue group, which B
  draws closed. One test (`in design B the closed group holds the new
  drills`) checks that the closed group counts them (15), that they show
  when it opens, and that a set whose steps are both inside the closed group
  runs anyway, with the design control out of the way as in A. Mutant SS13
  files a drill in the wrong group and turns it red.
- Screenshots in B at 390 × 844, 360 × 640 and 1366 × 768: the start panel,
  the picker, the catalogue and a live drill. No overflow; the picker covers
  the design control.
- Nothing in the sets or the drills branches on the design, so there is no
  B-only code to plant a defect in. The cost of that: a future change to B
  that hides the start panel's "Otras formas de practicar" would be caught
  by this one test only.

Red-team passes this round, each of which changed something:

1. Citations on every card re-read against the source records. Four were
   wrong (an author pair that does not exist, two years, a population) and
   were corrected before or just after the first commit.
2. Promise words. The checker read "heal" inside "healthy"; whole words are
   now matched as whole words, with controls both ways.
3. Dose. "Once a day was not enough" misread Bane et al. 2019 (the variable
   was repetitions per session). Text corrected; the drills now do two.
4. Measurement validity. The first B-against-A compared seconds of voice,
   which grows with a longer step. Replaced; mutant VD5 keeps it out.
5. Sound the learner did not make. The reference note and the step chime
   are not counted (VD3); a note drill is silent on Start (VD9).

Two more, found by the automatic review on the pull request (2026-11-12),
both reproduced as a red test before the fix:

6. Five silent minutes were written down as four. The frame that carries a
   step over its end belongs to the next step, and sums of 16 ms fall a hair
   short, so a fully silent 300 s step added up to 299.98 s and was floored
   to 4. Quiet time is now counted on the step's own clock, with a quarter
   of a second of slack for that one frame (VD15). The same change closes a
   second fault found while fixing the first: on a stuttering device the
   real-time gap between frames could be eight times what the step clock
   was given, so a five-minute step could have been written down as forty
   quiet minutes (VD16).
7. A refused microphone was counted as silence. With no microphone the app
   drives the drill with clock-only frames, and "no sound in the frame" was
   read as "silence heard": v22 would fill in quiet minutes for a learner
   who talked throughout. Those frames now say they carry no microphone
   (`noMic`), nothing is measured from them, and the step says "Sin
   micrófono · aquí no se mide nada" instead of "En silencio ✓" (VD17 to
   VD19).

Visual passes (screenshots read at 390 × 844, 360 × 640 and 844 × 390): the
hold bars now scale with the sound instead of sitting at the floor of a 20 s
axis; a sentence to say is no longer labelled as a drawing; two controls on a
phone give the title's line to the picture; long titles were shortened to fit
the header.

### The screen stays on during a practice

A phone locks after a short while without a touch, and a locked phone stops
the microphone and the clock. v22 opens with five quiet minutes, so on a real
phone the drill would have died in its first step. `js/wake-lock.js` holds a
screen wake lock (W3C Screen Wake Lock API) while `body.practice-live` is
set, for every exercise, and gives it back on Stop.

| Decision | The challenge | Why it stands, or what it costs |
|---|---|---|
| The standard API, with no fallback | Older phones get nothing | Chrome and Edge 84 (2020), Safari 16.4 (2023), Firefox 126 (2024) have it, which covers phones of the last six years on a current system. The older trick, a hidden looping video, takes part in the iPhone's audio session and can disturb the microphone. Cost: on Safari before 16.4, and on a site added to the home screen before iOS 18.4 (WebKit bug 254545), the screen follows the phone's timer as before |
| Held only while live | A learner reading the result wants the screen on too | Reading is done with the phone in hand. Holding the lock outside a practice spends battery for nothing |
| A refusal is not retried until the next Start or return | The battery saver may be switched off mid-practice | A browser that says no is asked once, not on every change of the page. Cost: that practice runs on the phone's timer |
| It watches the body class from outside `js/app.js` | A direct call on Start and Stop is simpler to follow | No legacy function is edited, and every path that ends a practice (Stop, leaving, an error that clears the class) releases the lock |
| No line on screen says the screen will stay on | The learner cannot know they may put the phone down | Where the browser refuses, the line would be false. Open: say it only while the lock is held |

`tests/wake-lock.spec.js` (5 tests) replaces the browser's lock with one the
test owns: Start asks once and Stop releases; nothing is asked before Start
or on a hidden page; a return to a live practice asks again; a lock that
arrives after Stop is given back; a refusal is asked once per Start; a
browser without the API practises as before. Mutants WL1 to WL9 each turn
one red.

**Not verified (blocked, so open, not passed):**

- A real wake lock. Headless Chromium refuses every request
  (`NotAllowedError`, also with the permission granted over the debugging
  protocol), so the granted path ran only against the test's stand-in. The
  refused path ran for real: the practice went on and nothing was thrown.
  Whether an iPhone or an Android phone stays awake through v22's five quiet
  minutes has to be seen on the device.

- An independent parallel review (five reviewers, four fact-checkers, four
  researchers) was started twice and stopped both times by a usage limit
  before any agent finished. The citations above were checked by the author
  of this change only.
- Real devices. Everything above ran in desktop Chromium at phone sizes. No
  iPhone, Android or iPad was touched; Safari was not run.
- A real voice. Counts were exercised with a synthetic voice and scripted
  frames, not a person with a straw.
- The six-iteration deep dive of docs/40 for the five new exercises.

## 6. Open items

| Date | Item | Status |
|---|---|---|
| 2026-11-12 | Independent fact-check and adversarial review of this change | open, blocked twice |
| 2026-11-12 | Screen stays awake during a practice (v22 has five minutes with no touch) | done in code, 2026-11-12; open on a real phone |
| 2026-11-12 | Say "the screen will stay on" in a long quiet step, only while the lock is held | open |
| 2026-11-12 | No pull-to-refresh while live. A reload mid-practice already asks first (`beforeunload`) and the take is kept on `pagehide`; `overscroll-behavior` on the page would stop the gesture on Android but cannot be tested without a device | open |
| 2026-11-12 | Safe-area padding for the new sheet and cards on phones with a notch, checked on a device | open |
| 2026-11-12 | Research write-ups on gamification, visualization and mobile patterns for the sets | open, blocked with the review |
| 2026-11-12 | Self-referenced hold goal for v24 and s28; per-set history | open, needs storage |
| 2026-11-12 | Four-note melody echo, interval singing, a pitch-discrimination game, a tube-in-water programme | open, the best-supported singing additions not yet built |
| 2026-11-12 | The new analytics names (`sets_open`, `set_start`, `set_complete`) need the worker redeployed | open |
| 2026-11-12 | Android Back does not close the picker (as with the other dialogs) | accepted |
