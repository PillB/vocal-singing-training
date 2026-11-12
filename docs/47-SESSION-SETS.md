# 47 · Goal sets and guided voice drills (2026-11-11 / 12)

What this round added, why, on what evidence, and what stays open. The
studies are recorded in `qa/evidence-ledger.json`. The code is
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

Grades: **moderate** = a review or a controlled trial supports the immediate
or trained-task effect in healthy voices; **limited** = one small study,
patient studies, or indirect support; **tradition** = taught, not measured.

Every study named here has a record in `qa/evidence-ledger.json`: where it
was read (PubMed id or DOI), what was read (abstract or full text), by whom,
on what date, its design, its people, its numbers, and its limits. A card may
say only what its records say (`tests/node/evidence-ledger.test.mjs`).

| Claim made in the app | Source | Grade | What the app does not claim |
|---|---|---|---|
| Straw and other half-closed sounds lowered the pressure needed to start the voice and the effort felt | Apfelbach & Guzmán 2024, integrative review of 53 studies in adults without voice training, with and without voice problems (PMID 34774370) | moderate for the effect; how long it lasts was rarely measured | That it holds for trained singers (outside the review); that warming up improves how you speak or sing afterwards |
| Right after a 5-minute warm-up the voice felt more effortful; after 5 quiet minutes it did not | Whitling et al. 2023, 26 healthy adults (PMID 35713650) | limited | A best gap between warm-up and talk |
| A sentence's melody through the straw | Kapsner-Smith et al. 2015, tube programme, 20 people with voice problems (PMID 25675335) | limited, patients | **The sentence said aloud straight after is this app's own step.** In that programme every exercise stayed inside the straw |
| After heavy use, 5 min quiet then 5 min straw recovered the voice better than 10 min quiet | Peng et al. 2026, RCT, 114 healthy adults after 1 h of loading (PMID 42156834) | moderate, one study, measured once | Anything about the next day; prevention |
| Recovery takes hours | Hunter & Titze 2009, 86 adults (PMID 19663377) | limited | A safe daily dose |
| Clear speech is understood better; the talkers slowed down, paused between words and released final consonants | Picheny et al. 1985 (+17 points, 5 listeners with hearing loss); Picheny et al. 1986 (what the talkers did); Smiljanić & Bradlow 2009 (review, "various listener populations") | moderate for the listener's benefit | That a short daily drill carries into everyday talk (those studies did not measure it) |
| Vocal function exercises lengthen how long a sound can be sustained | Stemple et al. 1994 (35 women, placebo and control groups, 4 weeks); Sabol et al. 1995 (10 of 20 singers, 4 weeks); Bane et al. 2019 (28 women, three doses, 6 weeks, **no untreated group**); Angadi et al. 2019 (review, none of 21 studies reported adverse voice outcomes) | moderate for voice tasks (how long a sound is held, airflow, pitch range) | Better-sounding speech or singing in healthy voices; prevention |
| Clips with higher and more varied pitch were rated more charismatic; a visual signal increased variation more than audio feedback | Rosenberg & Hirschberg 2005 (8 raters, 45 clips of 9 politicians); Hincks & Edlund 2009 (14 Chinese learners of English, two groups) | limited | A norm for "expressive"; that listeners prefer the trained result |
| Learning to notice fillers reduced them; the taught pause was little used | Luiselli 2022 (review of 7 single-case studies); Mancuso & Miltenberger 2016 (n = 6); Pawlik & Perrin 2020 (n = 4, silent pause, used at a moderate level by 1); Perrin et al. 2021 (n = 9, silent pause, stayed high for 1) | limited | Long-term change; that fewer fillers makes a talk rate better (in Laske et al. 2024, n = 2, expert ratings did not improve) |
| Singers perceived changes in their own voice after a warm-up; listeners heard it in only some | Moorcroft & Kenny 2013 (12 singers, 6 listeners, no control condition) | limited | An audible improvement |
| Seeing pitch as well as hearing it improved accuracy more than hearing alone in one 20-minute session; over 10 weeks it gave no advantage | Berglin, Pfordresher & Demorest 2022; Paney & Tharp 2021 | limited, mixed | Lasting improvement from the picture itself |
| Most singers said the voice felt better after a cool-down; not statistically significant; listeners could not tell | Ragan 2016 (20 singers, 4 listeners, nothing measured by instrument) | limited | Any measured change |
| Resonance "zones" | Class tradition | tradition | That the phone hears where a voice resonates |

Reviews of prevention trials, mostly in teachers, found no reliable evidence
that voice training prevents voice disorders (Ruotsalainen et al. 2007: two small, poor-quality
trials; Ramos et al. 2025: 26 studies, none at low risk of bias, no pooled
effect). A third review is mixed: 10 of 23 studies linked voice training or
hygiene education to better voice outcomes (Vermeulen et al. 2022). None
counted diagnosed disorders. That is absence of good evidence, not proof of
no effect, and it is why no card promises prevention: the copy checker
(`tests/node/session-sets.test.mjs`) rejects prevention, cure, guarantee and
diagnosis words on every card.

### Independent fact-check, 2026-11-12

Two checkers who had not written the cards read each cited record (PubMed,
Crossref, ERIC) against the sentence that cites it. The papers all exist and
say roughly what the cards said. Ten sentences went further than their
source and were corrected in both languages:

| What the app said | What the record says | Now |
|---|---|---|
| Half-closed sounds lower pressure and effort "for a while" | The review says few studies measured how long it lasts, and covers adults without voice training | The cards say who was studied and that duration was rarely measured; the singing cards say the review did not include singers |
| Straw into a sentence "follows the tube protocol" | In that programme every exercise, the "reading" too, was done through the straw | The text says the spoken sentence is this app's own step |
| Vocal function exercises worked "in small controlled trials (Stemple 1994; Bane 2019)", "for about six weeks" | Bane 2019 compared doses and had no untreated group; Stemple 1994 ran four weeks | One trial is named as controlled, the other as a dose comparison; "four to six weeks" |
| Once per session "was not enough" | It gave a smaller gain that was not statistically significant | Said so |
| Singers who cooled down felt better; "the measurements did not change"; "no sign it does harm" | Most said so, not statistically significant; listeners picked the cool-down week 46% of the time; nothing was measured by instrument | Said so. The line about harm is gone: no record supports it |
| Two filler studies "noticing and pausing instead" | One taught awareness only. Seven small studies exist; where a pause was taught it was little used | The card says noticing is what was tested |
| "Speakers who varied pitch more were heard as more charismatic"; "a visual signal increased it" | 8 raters, clips of 9 politicians; 14 learners of English, visual against audio feedback | The card gives the people and the comparison |
| "Other studies do not find the same advantage" (no source) | Paney & Tharp 2021: 10 weeks, no advantage | Named on the card |
| "No study shows", "nobody has shown", "has not been tested" (8 places) | Nobody can read every study. The reviews found no reliable evidence | Each is now a sentence about the studies named |
| Resonant voice was left out because trials "found no group effect" | The same small trial found none for straw sounds either (10 per group); the other found a benefit for people who already had problems | See section 4: the reason given was wrong and is restated |

What the correction rests on, and what stays unverified:

- Records were read as abstracts, except Rosenberg & Hirschberg 2005 and
  Kapsner-Smith et al. 2015, whose full text was read through a page
  summariser from an open copy (PubMed Central and one university archive
  refuse automated readers). A person with the PDFs should confirm the two
  sentences that rest on them.
- What Mancuso & Miltenberger 2016 taught as the competing response is not
  in the abstract, and the thesis copy refused access. The card no longer
  depends on it: Pawlik & Perrin 2020 names a silent pause.
- Berglin et al. 2022 gives no sample size in its abstract. The card gives
  none.
- The review of the code by independent reviewers is still not done (see
  section 5).

### Second independent reading, 2026-11-12 (after PR #36 was opened)

The first fact-check compared each record with its paper. It did not read
each sentence on a card against the abstract. A fresh checker did that the
same afternoon: 46 sentences that name a study or state a number, in both
languages, against abstracts it fetched itself. 26 stood. It flagged 15. I
read each flagged sentence against the abstract again (19 abstracts fetched)
and reworded 13:

| Kind of fault | What the app said | What the abstract says | Now |
|---|---|---|---|
| A ranking of the evidence | "The straw is the best studied item on the list, mostly in voices without training" | The review covers adults without voice training by its own inclusion rule. It ranks nothing | "A family of exercises with a review of 53 studies behind it; that review covered adults without voice training, not singers" |
| A result pinned on two items | "Trills and humming lowered the pressure it takes to start the voice" | The review reports it for half-closed sounds as a group | "In a review of studies of adults without voice training, sounds made with the mouth half closed (the family that trills and humming belong to) tended to lower the pressure" |
| A detail cited to the wrong record | The dose (twice, twice a day) beside Stemple 1994; how clear talkers speak beside Picheny 1985; "morning and evening" | The dose is in Bane 2019. What the talkers did is in a second paper, Picheny 1986. "Morning and evening" is in no abstract | The dose is in the tip, as "the usual dose" of "the study that compared doses". Picheny 1986 is read, recorded and named. "Morning and evening" is gone |
| A sample credited whole to one arm | The tube programme "tested in 20 people" | 20 people were randomised between two programmes | "The trial that compared a tube programme against other exercises in 20 people" |
| An outcome narrowed | "What was measured is the trained task" | Stemple 1994 and Sabol 1995 report airflow, phonation volume and pitch range as well | "Those gains were in voice tasks, which is not the same as everyday speaking" (or "as singing better") |
| "Little used", with no count | "The pause was little used" | 1 of 4 used it at a moderate level (Pawlik 2020); it stayed high for 1 of 9 (Perrin 2021) | "After training, only 1 person in each kept using it at a moderate or high level". Perrin 2021 is recorded and named |
| A condition the abstract does not name | Clear speech helps "above all in noise" | The review's abstract says "various listener populations" | "Other groups of listeners" |
| A population widened | "Reviews in teachers" | The Cochrane review covers adults: two trials, teachers and student teachers | "Reviews of prevention trials, mostly in teachers" |
| Spanish and English apart | "se oyeron mejor a sí mismas" against "rated themselves better"; "forzar la voz" against "loading the voice" | "All singers perceived significant changes"; "vocal loading task" | "Noticed changes in their own voice" in both; "uso intenso de la voz" and "heavy voice use" |
| The scored unit | "17 percentage points more words" | 17 percentage points of intelligibility, nonsense sentences | "About 17 percentage points more" |

Two flags were not changed, with the reason. "Reduced them in 7 studies,
most with university students" is not in the review's abstract; it rests on
the seven study abstracts, which I read again (all seven report fewer
fillers; four name students). The 8 raters of Rosenberg & Hirschberg 2005
are in the full text only, which is already an open item.

Two of these kinds are now rules in the test: nothing ranks the evidence
("best studied", "mejor estudiada", "the most evidence"), and a number stated
in one language is stated in the other. The other kinds have no mechanical
test. A person or a second reader has to read the sentence.

### Third reading of the reworded sentences, 2026-11-12

Two more fresh readers took the new wording: one against the abstracts (128
sentences in 24 texts), one Spanish against English as a plain-language
editor (110 sentences in 28 texts). Neither had seen the earlier passes.

The fact reader found the cards for clear speech, the voice and singing
versions of the vocal function exercises, the warm-up and the technique set
clean, and flagged eight sentences in the rest. All eight were changed:

| What the app said | What the abstract says | Now |
|---|---|---|
| Straw before speaking: "what it changes is short-lived" (a tip, older than this round) | "Few studies examined the duration of these changes" | "How long the change lasts was rarely measured" |
| "In the dose study each was done twice"; "four exercises" | Only the "traditional" group of three did each twice. No abstract counts the exercises | The research text says "a set of voice exercises". The tip says "the usual dose was each exercise twice" |
| The pause was used by "only 1 person in each with any regularity" | In one study its use rose for everyone and "only remained high for 1 participant following training" | "After training, only 1 person in each kept using it at a moderate or high level" |
| "7 small studies", "few people in each study" | One of the seven abstracts gives no count | "7 studies"; "the six that give a number had 4 to 9 people each" |
| Five minutes of "soft" sound through a straw | The abstract describes a sustained vowel through a straw and does not say soft | "Sound through a straw". The drill's own steps still ask for a soft sound: that is the app's instruction, not the trial's |
| "The clinic's time goal needs a lung measure a phone lacks" | No abstract says how the goal is set | "Comfort sets the limit, not the clock" |

The language reader found one difference in meaning (the 12 singers of the
warm-up study were women in Spanish and unmarked in English: now "12 female
singers") and 26 points of plain wording. The ones taken: a review named
before "that review" points to it; "estudios pequeños"
where "ensayos" reads as rehearsals to a singer; "speakers" for "talkers";
"heavy voice use" for "loading the voice"; one sentence of 448 characters
split in three; the hours of recovery stated as the study measured them (90%
within 4 to 6 hours, all by 12 to 18) where the text told the learner what
to expect by morning; and "could have been chance" where the tip said "not
statistically significant". Two points of vocabulary were left for a pass
over the whole app (section 6): a straw is "pajita", "pajilla" and "cañita"
in different places, and the warm-up card says "hum" where the exercise
itself is titled "Zumbido".

Shortening: the vocal function text for speakers had grown to 953
characters in Spanish (612 px tall at 320 wide). The schedule moved to the
tip, which already stated it. It is now 798 characters and 523 px (785
characters when merged); the singing version is 671. The cards measured at
320 wide are between 372 and 554 px tall with "Por qué" open, none wider
than the sheet.

Still resting on one reader: the tube protocol detail (Kapsner-Smith 2015)
and the 8 raters (Rosenberg 2005) are from full texts read through a
summariser.

## 4. Decisions an expert could challenge, and the answer

| Decision | The challenge | Why it stands, or what it costs |
|---|---|---|
| "As long as it stays easy" instead of a maximal hold in v24 and s28 | Two small trials suggest a time goal and a maximal sustain both matter (Bane et al. 2025, two papers, 19 and 23 people; groups without them improved less, the differences not statistically significant) | Unsupervised maximal holds invite squeezing, and the clinical goal needs a lung-volume measure a phone lacks. Cost: possibly a smaller gain than the clinic protocol; the evidence that it is smaller is itself weak. A self-referenced goal (first week's median plus a fifth) is the next step and needs per-exercise history |
| Each exercise twice per run | The studied dose is twice per session, twice a day | The drill does two repetitions; the card says twice a day. Once per session gave a smaller gain that was not significant in Bane et al. 2019 |
| B against A by rate and pause share | Clear speech is defined for the listener | The phone cannot hear intelligibility. It reports two things that do not grow when a take merely runs longer, labels them approximate, and leaves clarity self-rated. The syllable counter undercounts fast speech, which makes "slower" harder to earn, not easier |
| A louder B is not flagged when it is also slower | The instruction says not to push the volume | Clear speech tends to come out somewhat louder as well, and loudness alone does not make speech clearer. Only "louder and no slower" is pointed out |
| Resonant voice therapy was not added as an exercise | It is a standard bridge from hum to speech | **Restated 2026-11-12.** The first reason given, "the trials found no group effect", does not hold: in Meerschman et al. 2017 (30 healthy students, 10 per group) neither resonant voice nor straw sounds differed from no training, so that trial cannot favour one over the other and is too small to rule either out; in Nanjundeswaran et al. 2012 (31 student teachers, preliminary) it added nothing consistent for healthy voices and helped those with problems. The honest reason is narrower: the app already has humming (s7) and the straw-to-sentence drill for the same bridge, and no trial in healthy speakers shows resonant voice doing more. It stays a candidate, not a rejected technique |
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

### Citation corrections (2026-11-12, after the merge of PR #35)

The independent fact-check of section 3 led to this second change. What was
run, on Chromium with a local server:

- `tests/node/evidence-ledger.test.mjs` (5 tests) against the wording as
  merged: **red in 20 places** (16 sentences about all research, 4 "controlled
  trials" with one controlled trial named). Against the corrected wording:
  green.
- `npm run lint` and `npm run test:core`: pass, 666 tests.
- `node qa/mutate.mjs sets`: GS1 to GS22 killed. GS14 to GS22 are new: a
  trial given another size, a paper nobody read, a sentence about all
  research on a card and in a drill, a dose comparison counted as a
  controlled trial, a self-report study graded moderate, a review given
  another count, a study dropped in one language, a record with no locator.
- Seven browser specs (goal sets, guided drills, catalogue regression,
  catalogue design, copy, validation, viewport overflow): 182 pass.

Five red-team passes on this change:

| # | Attack | Result |
|---|---|---|
| 1 | Run the new test on the text that was merged | Red in 20 places. It would have stopped the first version |
| 2 | Name a study outside brackets in a drill, where no record is looked up | It escaped. Rule added: a year outside brackets is a fault |
| 3 | Name the same trial twice to make "controlled trials" plural | It passed (two names counted as two). Fixed: a study named twice is one |
| 4 | Say it another way: "there is no evidence", "no hay evidencia" | It escaped. Both added. **Open:** a list of phrasings is never complete; a new one must be added when seen |
| 5 | Write the number as a word ("thirty-five women") | **Escapes, and stays open.** Counts of people on cards are now digits so the rule sees them; durations stay as words and are not checked |

What the test cannot do: it holds a card to its record, not the record to
the paper. A wrong number typed into the ledger and the card together
passes. The record carries where and when it was read so that a person can
check it.

Four aesthetic passes: the twelve cards with "Por qué" open at 320 × 568 and
390 × 844 in both languages (no clipped or overflowing text; the longest
card, "Antes de hablar", is 554 px tall at 320 wide and scrolls inside the
sheet); the sheet at 360 × 640 and 768 × 1024; the drill texts under "Pasos y
consejos" at 320, 390 and 1366 wide. The corrected text of v24 stood 634 px
tall at 320 wide, ahead of the steps, so v21, v24 and s28 were shortened to
at or below their merged length (v24 in Spanish: 785 characters).

Trade-offs of this change:

| Decision | The challenge | Why it stands, or what it costs |
|---|---|---|
| Cards say who was studied and how many | Longer cards on a small phone | The text is behind "Por qué" and scrolls. Cost: "Antes de hablar" grew by about 100 characters |
| Sentences about all research are banned, also true-sounding ones | "Nobody has shown X" is often right | It cannot be checked by reading a few records. Each is now a sentence about the studies named. Cost: weaker-sounding caveats |
| "No sign it does harm" was removed from the cool-down card | It reassures | No record supports it. The card now says it is brief and gentle |
| The records live in `qa/`, not in the page | The app could show a study's details on tap | Nothing in the page reads them yet. Showing them is a later step |
| Two records rest on a summariser's reading of the full text | A summariser can misread | Marked in the record and in section 6 for a person to confirm |

### Second and third readings (2026-11-12, on PR #36)

What changed and why is in section 3. What was run on the final wording,
Chromium on a local server:

- `npm run lint`: pass. `npm run test:core`: 666 pass.
- `node qa/mutate.mjs sets`: GS1 to GS24 killed. GS23 (a card ranks the
  evidence) and GS24 (a number stays in one language) are new.
- The evidence test run against the wording this PR had before: red, on
  "best studied" and "mejor estudiado".
- Seven browser specs (goal sets, guided drills, catalogue regression,
  catalogue design, copy, validation, viewport overflow): 182 pass.

Five red-team passes on the two new rules:

| # | Attack | Result |
|---|---|---|
| 1 | Rank it another way: "the most widely studied", "la técnica mejor estudiada", "it has the most evidence" | The first pattern caught only "lo mejor estudiado". Widened, with a control for each |
| 2 | Compare without a superlative: "better studied than the rest" | Caught. "It has more studies behind it than the rest" **escapes, and stays open**: a list of phrasings is never complete |
| 3 | Write the number as a word in one language and in digits in the other | Caught: the two must be written the same way |
| 4 | Drop the number from both languages | Passes, by design: nothing disagrees and nothing false is said |
| 5 | Same numbers, opposite meaning ("solo en algunas" against "in all of them") | **Escapes both rules.** No rule about names and numbers can see it. Only a reader can, which is what the reading lock in section 6 is for |

Four aesthetic passes: the eleven changed card texts with "Por qué" open at
320 wide in both languages (372 to 554 px tall, none wider than the sheet);
two of them read by eye at 320 × 568 in Spanish, which showed the warm-up
text saying "zumbido" under a step chip that says "hum", so the text keeps
the chip's word; the three changed drill texts at 320, 390 and 1366 wide in
both languages; the viewport specs at 320 × 640, 360 × 740, 390 × 844 and
844 × 390.

Trade-offs of this round:

| Decision | The challenge | Why it stands, or what it costs |
|---|---|---|
| "Could have been chance" for "not statistically significant" | A statistician would say that is not what a p-value means | It is the plain reading a learner can use, and the exact term stays in the ledger. Cost: precision |
| The schedule left the research text of the vocal function drills | The reader of that text no longer sees the dose | The tip directly under it states it. Cost: one more place to look |
| "A set of voice exercises", no longer "four" | The programme does have four | No abstract in the ledger counts them. The drill's own steps still show four |
| "Soft" removed from what the recovery trial did | The app asks for a soft sound | The abstract does not say soft. The instruction stays in the steps, as the app's own |
| Plain-wording changes taken from a reader who is a model, not a person from Peru | It can be wrong about what sounds natural | Each change was kept only where it removed a second reading or an ambiguity. Two vocabulary questions are left for a person (section 6) |

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

- An independent review of the code. A parallel review was started three
  times and stopped each time by a usage limit before any reviewer
  finished. The citations were then checked on their own by two independent
  checkers (section 3); the code was not.
- Real devices. Everything above ran in desktop Chromium at phone sizes. No
  iPhone, Android or iPad was touched; Safari was not run.
- A real voice. Counts were exercised with a synthetic voice and scripted
  frames, not a person with a straw.
- The six-iteration deep dive of docs/40 for the five new exercises.

## 6. Open items

| Date | Item | Status |
|---|---|---|
| 2026-11-12 | Independent fact-check of the citations | done 2026-11-12: ten sentences corrected, a ledger and a test added (section 3) |
| 2026-11-12 | Second independent reading, each sentence against its abstract | done 2026-11-12: 13 sentences reworded, two studies added to the ledger, two rules added to the test (section 3) |
| 2026-11-12 | Third reading of the reworded sentences, by a fact reader and a bilingual plain-language reader | done 2026-11-12: eight more sentences changed on the facts, one difference between the languages closed, wording made plainer (section 3) |
| 2026-11-12 | One word for a straw across the app ("pajita", "pajilla" and "cañita" are all in use), and "hum" or "zumbido" | open |
| 2026-11-12 | Faults a rule cannot see (an outcome narrowed, a sample credited to one arm, a detail beside the wrong study) | open: only a second reader catches them. A lock that fails when wording changes after its last reading is the next step |
| 2026-11-12 | Independent adversarial review of the code | open, blocked three times by a usage limit |
| 2026-11-12 | Two full texts read through a summariser (Rosenberg & Hirschberg 2005; Kapsner-Smith et al. 2015) confirmed by a person with the PDFs | open |
| 2026-11-12 | Resonant voice as a guided drill (hum into words) | open, a candidate: no trial in healthy speakers separates it from straw sounds |
| 2026-11-12 | The "why it helps" lines of the 47 earlier exercises name no study, so the evidence test does not reach them | open: each needs a source and a record, or wording that claims less |
| 2026-11-12 | Numbers written as words on cards are not held to the records | open |
| 2026-11-12 | Screen stays awake during a practice (v22 has five minutes with no touch) | done in code, 2026-11-12; open on a real phone |
| 2026-11-12 | Say "the screen will stay on" in a long quiet step, only while the lock is held | open |
| 2026-11-12 | No pull-to-refresh while live. A reload mid-practice already asks first (`beforeunload`) and the take is kept on `pagehide`; `overscroll-behavior` on the page would stop the gesture on Android but cannot be tested without a device | open |
| 2026-11-12 | Safe-area padding for the new sheet and cards on phones with a notch, checked on a device | open |
| 2026-11-12 | Research write-ups on gamification, visualization and mobile patterns for the sets | open, blocked with the review |
| 2026-11-12 | Self-referenced hold goal for v24 and s28; per-set history | open, needs storage |
| 2026-11-12 | Four-note melody echo, interval singing, a pitch-discrimination game, a tube-in-water programme | open, the best-supported singing additions not yet built |
| 2026-11-12 | The new analytics names (`sets_open`, `set_start`, `set_complete`) need the worker redeployed | open |
| 2026-11-12 | Android Back does not close the picker (as with the other dialogs) | accepted |
