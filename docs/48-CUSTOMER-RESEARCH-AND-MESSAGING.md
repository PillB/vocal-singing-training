# 48 · Customer research and messaging (2026-11-21)

Who would use and pay for this site, what they believe and fear, which words
reach them, and what changed in the copy because of it. The study's code and
every answer are in `qa/customer-research/` (README there for how to re-run
it). The working write-up, with the same numbers, is the project's research
doc. This file is the record that stays with the code.

## 1. Summary

| # | Finding | What changed | Strength of evidence |
|---|---|---|---|
| 1 | No new framing (live feedback, "not tone-deaf", real moments, any age, all free) beat today's copy on either question, on either reading, and neither reading can rank the seven framings: among the framings alone the blind reading's split-half is −0.09 on trying, and SSR's ordering agrees with the blind one at r = 0.07 | The headline stays for now, but the question is open: every card told respondents the same facts (free, no limit, no install), so the panel could not test what stating the position in the headline is worth, nor the collision with Vocal Image's "Tres minutos al día". It is the first thing to test with people (section 10) | Low: two machine readings of machine answers, and an instrument that cannot test the question |
| 2 | Showing a feature in the headline is what gets it repeated: live pitch 86% for C1 against 8% for the shipped first visit; "free" 66% for C5 against 31%. Two framings (live pitch and any age) cut "does it work?" from 53% to 25%, so the effect is not specific to the pitch line. Naming age made younger respondents think the site is for older people (14 of the 17 age tags came from under-50s), while those over 65 rated "any age" no worse | "gratis" now says what is free (no time limit, no card); the search text says "Ves en vivo si afinas"; no age in the hero, and older readers are reached through situations instead | Moderate for the headline effect; the noise floor between two identical cards is 14 points |
| 3 | The shipped first visit is not worse than today on trying it (SSR +0.00 [−0.04, +0.05]; blind +0.09 [−0.05, +0.23]). It rules out large harms only: SSR cannot tell "probably" from "definitely". The rise in microphone-privacy worries (9% to 22%) is not significant (p = 0.08, 1 of 38 tests) | Step 2 says the voice stays on the device, as a precaution; a browser test now proves no audio leaves it | Moderate for "not worse"; the step 2 line is untested by the panel |
| 4 | Labels confused model-played visitors on real screenshots: the layout control (9 of 9, before and after the rename), "Trinos" (9 of 9, though "(brrr)" let 5 guess right), "Entrar" next to "no account needed" (7 of 9), "Plan" (9 of 9) | Plain words where this branch owns the string; the rest handed to the threads that own them (section 13) | Low to moderate: personas, still images, n = 9 |
| 5 | The market's crowded promises are "AI coach", "N minutes a day", "confidence"; the open position is the combination of every exercise free with no daily limit, singing and speaking, real Spanish, nothing to install. It holds against subscription apps, which cannot free practice without cutting their revenue, not against free tools, and it breaks if the free tier is ever capped | No "AI", no "the only", no comparison with the whole market; each promise proved by what the product does (section 12) | Moderate: listings and 3,349 coded reviews read on one day |
| 6 | A five-lens red team (method, ethics, law, market, UX) found 42 ways the conclusions or the copy could be wrong; each was checked against the data or the code | Section 11 lists them and what changed | |

## 2. The request

The owner asked for a psychology-, market- and customer-research-based
marketing pass: positioning, packaging and blurbs, with older people and young
adults in particular, personas, research and user tests, following the
synthetic-respondent method of Maier et al. 2025 (arXiv 2510.08338), and a red
team of every conclusion with alternatives and five ways it could be wrong.

## 3. Method

- **Desk research** (memos A to E, written by research agents and each
  source-checked by a second agent): market and competitors, adult voice
  learners' psychology, older adults, persuasion and advertising law, and the
  synthetic-panel method itself.
- **Concept test** (SSR, the paper's equation 8): 64 profiles, the same 64
  for every card, one card per prompt, up to eight people per call. Each
  free-text answer is rated by its similarity to five anchor sentences,
  averaged over six anchor sets and three local multilingual embedding models.
  Controls: a bad offer that must rate lower, half price that must rate higher
  on paying, and a placebo rewrite of today's copy that a new framing must also
  beat. Rules committed before any answer was scored (commit 6510331).
- **Blind second reading** (exploratory, added after SSR failed its paying
  checks): other agents, seeing only answer text in batches that mixed every
  card, rated each intent 1 to 5 and tagged each objection and what the
  respondent understood (`blind_check.py`). One coder per answer.
- **Round 2**: the shipped first visit as a card against today and the
  placebo, fresh prompts and batch seed, with a "not worse" margin of −0.10
  written before any round 2 answer.
- **Simulated user tests**: nine model-played personas (ages 20 to 72, Lima,
  Arequipa, Madrid, Mexico City, Bogotá, Manchester, Lagos, Chicago) looked at
  real screenshots of the first visit and the Pro window, before and after the
  copy changes: five-second test, first click, confusing words, pricing trust.

What none of this is: evidence about real people. The paper validated SSR on
57 US personal-care surveys; website copy is outside that. Synthetic personas
caricature groups, and adults over 65 are among the worst represented (section
6 shows it happening here). Every age-band result is a hypothesis for the
interviews in section 10. The deviations from the plan are listed in the
study's README.

## 4. Market and competitors

- Twenty products read verbatim. "Un coach. Tres minutos al día." is Vocal
  Image's Spanish line; Speeko says 2 minutes, Varka 5, Singeo 10. Our title
  sits among them, and the market memo's advice is that a time promise should
  be a secondary line, not the headline.
- Course apps checked that cap free practice: Riyaz 8 minutes a day, Erol
  Beginner 1–2, Smule duets only, Simply Sing "not a single song". Free tools
  (Vocal Pitch Monitor, Ella, YouTube) and ad-supported Sing Sharp do not.
- Spanish App Store reviews (648, Spain and Mexico): 116 of 354 negatives are
  about paying to practise and 66 about charges, cancelling or refunds. "Te
  mienten porque te sale que es gratis."
- The English-only Simply Sing ranks first or second for "aprender a cantar"
  in the Peru and Mexico App Stores.
- Peru: 56.7% of people 60+ online in Q2 2026, 97.7% of them by phone (INEI);
  43% of over-60s are not online at all.
- Older-adult voice offers are clinical, English or in person. The FTC fined
  Lumosity US$2M over "delay age-related cognitive decline". No health claim.

## 5. Psychology of adult voice learners

- 52% of US adults rate their singing below average (YouGov 2025, n = 2,293);
  13–16% sing measurably off pitch; congenital amusia is about 1.5% and
  training does not help it. So: "sin saber música", never "everyone sings in
  tune" and never "casi nadie desafina".
- Monitoring progress helps (d = 0.40, Harkin 2016). Live acoustic feedback
  supports accuracy and self-efficacy; its effect on fear is unverified, so no
  "pierde el miedo".
- Habits took a median of 66 days and a missed day did not matter (Lally
  2010): no promise of a result in N days.
- Adult amateurs who stopped singing mostly name family, time and moving (Pitts
  and Robinson 2016, mostly aged 46–65). That relatedness matters more than
  competence comes from children learning instruments (Evans 2013) and is a
  hypothesis for adults, not a finding.
- Money matters at every age: Peruvian millennials live paycheck to paycheck
  more often (50%) than Gen Z (43%), and AARP lists "true value" as a top
  barrier after 50. Young adults' demand is for soft skills in general (95%
  rate them as required), not voice specifically. AI attitudes split (66% of
  connected Peruvians excited; 8 in 10 want disclosure).
- Older adults: most self-doubt (65% of UK 60+ rate their singing below
  average); choirs reduce loneliness but not cognitive decline; voice therapy
  helps presbyphonia but is clinical; lasting hoarseness is too often put down
  to age (Golub 2006), and age-related change explains a minority of voice
  problems after 65 (Chang 2023). No age label in the pitch: people 50 to 64 do
  not count themselves in age labels (Pew 2009; Rubin and Berntsen 2006),
  though "adulto mayor" is the Peruvian state's own term and not a slur, and no
  study compares labelled with neutral voice copy.

## 6. Personas

Eight archetypes built from the desk research, the blind-coded objections and
the think-aloud words: the choir singer at home (60+), the clear speaker at
work (50–64), the one told to mouth the words (50–64), the cover singer on a
budget (18–24), the nervous interviewee (25–34), the teacher with a tired
voice (35–49), the "tone-deaf" one with a deadline (25–34), the choir member
on costly mobile data (18–24). The table, with jobs, fears and words, is in
the research doc. Its "words" are words the model used, and two of the
think-aloud briefs had their barriers written in (a son who helps with the
phone, a dislike of being called "senior"), so those rows repeat their inputs.
The next think-aloud should be briefed from screener facts only, with one
older persona who wants to speak and one who is at ease with technology.

What the simulating model assumes about age (blind-coded, round 1, bad offer
excluded; 512 answers from 64 people):

| Objection | 18–24 (13) | 25–34 (13) | 35–49 (10) | 50–64 (13) | 65–80 (15) |
|---|---|---|---|---|---|
| Doubts it works | 52% | 56% | 50% | 28% | 7% |
| Fears the technology is hard | 4% | 10% | 11% | 33% | 95% |
| Self-conscious about being heard | 23% | 26% | 25% | 16% | 3% |
| Microphone privacy | 4% | 16% | 11% | 9% | 21% |
| Ads | 40% | 42% | 39% | 38% | 33% |

This is the model's stereotype, not a finding. Profiles hold no tech-skill
field, yet 10 of the 15 profiles aged 65+ raise "technology is hard" on all 8
cards, whatever their device or city. The same 50–64 profiles raise it on 8 of
9 answers when they are the oldest in their batch and on 26 of 95 when someone
older is in it (Fisher p = 0.0005), so the model hands the role to whoever is
oldest in the prompt. About 40% of answers from people 65+ mention a child or
grandchild helping, against none at 18–34. The table also contradicts the desk
research: AARP's top barriers after 50 are privacy and value, while the
simulated 65–80 group doubts value 7% of the time and the UK figure for
self-doubt is 65%, not 3%. The ads row is the stimulus: every card except the
bad offer said "Pro agrega: sin anuncios", and the bad offer, which did not,
drew no ads objection at all. Before any age split is reported again: one
respondent per prompt, as in the paper, or an age-swap control.

## 7. Concept test results

Round 1, differences from today's copy (paired 95% bootstrap intervals):

| Card | Try, SSR | Try, blind | Pay, SSR | Pay, blind |
|---|---|---|---|---|
| Placebo | +0.02 | −0.02 | −0.01 | −0.06 |
| C1 see your voice | −0.04 | −0.05 | +0.05 | +0.12 |
| C2 not tone-deaf | −0.11 [−0.18, −0.04] | +0.00 | +0.09 | +0.08 |
| C3 real moments | −0.02 | +0.09 | +0.09 | +0.17 [0.00, +0.36] |
| C4 any age | −0.02 | +0.03 | +0.14 | +0.14 [0.00, +0.27] |
| C5 all free | −0.01 | −0.02 | +0.02 | +0.05 |
| N bad offer | −0.39 | −1.23 | +0.06 (fails V1) | −0.19 |
| P half price | −0.02 | +0.02 | +0.11 | +0.36 |

- SSR failed its paying checks (V1, and split-half 0.54), so no paying result
  from SSR is claimed. V1 on paying is also ambiguous: the bad offer caps free
  practice, which could rationally raise paying for Pro.
- The blind reading passes V1, V2 and V3 with every card (split-half 0.98 and
  0.89), but that comes from the planted bad offer. Among the framings alone
  it is −0.09 on trying and 0.64 on paying, below the 0.7 bar, so under the
  stricter gate added after the red team (V3f) it gives no verdict. SSR among
  the framings: 0.80 trying, 0.62 paying.
- C1, C3 and C4 are tied on paying in the blind reading (+0.12 to +0.17; none
  significant after correcting for five framings, and C3's lower bound of 0.00
  depends on the bootstrap seed). All three go to real people, or none.
- C2's SSR harm does not replicate on the blind reading.
- On the real answers SSR agrees with the blind rater at Spearman 0.34 (es)
  and 0.49 (en) for trying, below the 0.6 bar its own holdout passed; the
  holdout was written to fit its labels. The local embedding models give
  near-flat distributions (top probability 0.34), which is this setup's
  compression: the paper found SSR spread wider than people.

Round 2 (shipped first visit F):

| | Try, SSR | Try, blind | Pay, SSR | Pay, blind |
|---|---|---|---|---|
| F − today | +0.00 [−0.04, +0.05] | +0.09 [−0.05, +0.23] | +0.04 | +0.06 |
| F − placebo | −0.01 | +0.14 [0.00, +0.28] | +0.04 | +0.03 |

F is not worse than today by more than 0.04 SSR points; the margin of −0.10 is
about a quarter of the bad offer's effect, which is a better reason for it
than C2's, the one it was written from. Allowing for people answering in the
same call widens the interval to [−0.06, +0.07], which still passes. Round 2
had no bad-offer arm, so it could not show it would fail. Today's card in
round 2 scored within 0.01 of round 1; one person's two ratings correlate
0.36. The 35–49 flag on SSR (−0.09) is +0.30 on the blind reading, so it is
noise.

## 8. Simulated user tests

Before and after the copy changes (same nine personas, separate agents):
confusing words 108 → 90; "Afinador" 5 → 0; "Oratoria" 3 → 0; ads 8 → 3;
the "1:15" clock 5 → 3. Not fixed: the layout control 9 → 9, "Trinos" 9 → 9
(but "(brrr)" helped five guess right), "Entrar" 9 → 7, "Plan" 7 → 9,
"se guarda en este navegador" 8 → 7 (people fear losing everything). Nobody
would try Pro before trying the free tier, before or after. "Feels made for
me: no" went 3 → 0, but a control run on today's English screens shows that
change comes from showing English to English speakers, not from the copy.

Created by the change, and fixed or handed on since: the Pro window promised
no ads during practice right above a Pro bullet selling "no ads" (8 of 9; the
promise is gone and the bullet hides while ads are off, on the subscriptions
branch); "no account needed" next to the header's "Entrar" (7 of 9; it now
says no account is needed to practise); "Clásica" read as classical music by
both testers over 60 (handed on with the layout control). One run per
condition, n = 9, model-played: only swings from near 0 to near 9 are signal.

## 9. Positioning, packaging and copy

Positioning: practise singing and speaking with your voice and your
microphone, see live whether you hit the note, every exercise free with no
daily limit and no card, in Spanish, nothing to install. Each clause the copy
states is proved by a test of what the product does or tied to the line in the
terms or privacy page that states it (section 12); "en español" and "ves en
vivo" are not yet.

What shipped (Spanish; English twins in `js/i18n.js`):

| Key | Now |
|---|---|
| `meta.title` | Canto y oratoria: ejercicios gratis para tu voz |
| `meta.desc` (+ Open Graph) | Ejercicios de canto y para hablar en público, gratis y sin límite de minutos. Ves en vivo si afinas. Sin instalar nada y sin tarjeta. ("si das la nota" was dropped: in Spain it also means making a scene) |
| `start.kickerNew` | Para cantar y para hablar · gratis |
| `first.singSub` / `first.speakSub`, and the catalog's `tab.singing` / `tab.vocal` | canciones, coro, afinación / presentaciones, entrevistas, dicción |
| `first.trills` | trinos de labios (brrr) |
| `first.why` | Sin cuenta, sin tarjeta y sin saber música: solo tu voz y el micrófono. |
| `start.step2sub` | La pantalla te muestra en vivo tu nota, tu volumen o tu ritmo. Tu voz se queda en tu dispositivo. |
| `start.step3sub` | Tu progreso se guarda en este navegador. No necesitas cuenta para practicar. |
| `sv.label` / `sv.a` / `sv.b` | Vista de la página / Clásica / Enfocada |
| `pricing.sub` | Practicar es gratis y sin límite de minutos. Pro suma extras para seguir y compartir tu avance. (Until 22 November 2026: "gratis, siempre"; see section 13.) |
| `pricing.proof1` (first sentence) | Muchas apps de canto con suscripción limitan la práctica gratis: a unos minutos al día o a los niveles de principiante. |
| `pricing.proof2` | Pro suma: tus últimos 28 días en un gráfico, un resumen para tu profesor, metas semanales y más perfiles. |
| `pricing.proof3`, `value.anchor`, `pricing.feat.lesson_anchor` | … cuesta menos que 3 clases particulares en Lima. |
| `value.moment.trial_ending` | Tu prueba de Pro termina en {n} días. Tu progreso se queda en este navegador y todo lo gratis sigue igual. |
| guide, section 15 | Lasting hoarseness: "No la atribuyas a la edad: a cualquier edad, una ronquera que no se va merece que la revisen." |

The Pro window no longer mentions ads while there are none: every concept card
said "Pro agrega: sin anuncios" and drew a 33–44% ads objection; the one card
that did not drew none.

Blurbs to test next, by situation and never by age:

- Older readers, ease first: "Abre el enlace, toca Empezar y canta. Sin
  descargar, sin contraseña, sin tarjeta." · "Practica en casa lo que cantas en
  tu coro: ves si te bajas en las notas largas." · "¿Cantabas antes? Retómalo
  en casa, a tu ritmo." · "Para que te entiendan bien: volumen, pausas y
  dicción."
- Young adults, mechanism and money: "Antes de subir tu cover, mira en vivo si
  afinas. Gratis, sin límite." · "Ensaya tu exposición o tu entrevista en
  voz alta y mira tu volumen y tus pausas."
- "A cualquier edad" waits: younger readers took it as "for old people".

Packaging: two plans named Gratis and Pro, no decoy; Free leads with what it
is; Pro leads with the 28-day chart and the teacher summary, then goals and
profiles; downloads last; say next to the trial button that it takes no card
and charges nothing when it ends; the yearly price as a total first. Options
for the owner, untested: a plan the teacher or choir director pays for while
members stay free; a yearly pass that does not renew by itself (an older
persona would buy only that); two free profiles for a phone shared in a
family. "Plus" is the one rename worth testing, because "Pro" read as "for
professionals" to an older beginner.

Never say (enforced by `tests/node/marketing-copy.test.mjs`): AI, health or
memory outcomes, a result in N days, "el mejor" or "único", streak or
"adictivo", any form of age label (Peru's "personas adultas mayores" included),
youth as the goal, claims about the whole market, a lesson price without the
city it was measured in, prize or urgency wording, a trial end that implies
progress is lost.

## 10. Validating with real people

At today's traffic an on-site A/B cannot see a copy effect of a few points
(40% to 43% needs about 4,200 first visits per arm), so the order is:

1. **Headline test on paid traffic.** Two or three headlines, not seven: the
   time ("3 minutos al día"), the position ("Para cantar y para hablar: todos
   los ejercicios gratis, sin límite de minutos"), the mechanism ("Mira en vivo
   si afinas"). One ad per headline into a matched landing variant, one
   age band per test, Peru first, the platform's split-test tool. About 230
   started exercises per arm detects a 30% difference in cost per start, 470 a
   20% one. Read it as which ad buys starts cheapest on that platform: ad
   systems deliver each ad to different people, so it does not say which
   message persuades a segment. For that, randomise landing variants behind
   one neutral ad.
2. **A human concept test, which also calibrates the panel.** The same five or
   six framings plus the bad offer and half price, on a Spanish-language panel,
   each person rating every card (about 56 people at an assumed SD of
   difference of 0.8), then Spearman across the cards against SSR. Stop using
   SSR for copy if it is below 0.6.
3. **Five-second and first-click test**, unmoderated, 20 to 25 people per
   segment (55+ and 18–30), both languages, on their own phones; with 10 people
   it is problem-finding only, since 8 of 10 has an interval of 49% to 94%.
4. **Interviews**, 10 to 12 per segment: the last time you sang or spoke in
   front of people, what you tried, what it cost, why you stopped; then the
   page. With 55+, who helps you set up a new app. Recruit 55+ through choirs
   and CAM workshops, not online panels: 43% of Peruvians over 60 are offline.
   Do not name age, AI or price first.
5. **On-site A/B (docs/38)** once there is traffic, with an arm whose headline
   differs; first visits that start an exercise, then day-7 return; no early
   stopping.

## 11. Red team

Five independent agents each took one lens and tried to break the
conclusions; every finding was checked against the committed data or the code
before it was acted on. "Fixed" means a change in this branch with a test.

### Method and statistics

| Conclusion challenged | How it could be wrong | Check run | Outcome |
|---|---|---|---|
| The blind reading "passes all four checks" and agrees with SSR (r = 0.96) | The reliability and the agreement come from the planted bad offer; V3 was counted twice and V4 never run for this reading | Split-half without N: −0.82 (old estimator), −0.09 (new); card-mean agreement without N: r = 0.07 | Fixed: a stricter gate V3f (split-half among the framings alone) in `analyze.py`; the blind reading now gives no verdict; claim withdrawn. Test and mutant |
| The blind reading was part of the plan | It is not in the pre-registration; it was added after SSR's paying gates failed, and the anchors and holdout were committed with the answers | `git show 6510331` | Fixed: labelled exploratory in the README, `blind_check.py` and here |
| The age table matches AARP | It contradicts AARP's ranking, and it is a model stereotype (per person, per batch) | Recomputed: 10 of 15 personas tag 8 of 8; oldest-in-batch 8/9 against 26/95 | Fixed: section 6 retitled and rewritten |
| F "passes" a −0.10 margin | The margin rests on C2's harm, which does not replicate; SSR cannot see "probably" against "definitely" (3.68 and 3.69); no assay arm | F passes any margin down to −0.04; batch-aware interval [−0.06, +0.07] | Reworded: rules out large harms only; keep N in every round |
| V4 licenses SSR | The holdout was written to fit its labels; on real answers SSR agrees with the blind rater at 0.34 and 0.49 on trying | Spearman per language and model | Reworded in section 7 and the README |
| "Only 16% repeat gratis" and "the pitch line halves doubt" | No placebo baseline (C0 16% against C0p 30%, p = 0.035); C4, without a pitch line, also halves doubt | McNemar per person, Benjamini-Hochberg over 156 tests | Reworded in section 1 |
| C3 and C4 are the two to test | C1 is tied with them; none survives correction; C3's bound depends on the seed | 200 bootstrap seeds; sign tests | All three go forward, or none |
| SSR could not read paying and the blind reading could | N's capped free tier may raise paying; the blind raters could see prices (14.99 in 25 of 64 N answers, 0 of 512 others) | Marker counts | Reworded; a masked re-rating is next time's |
| "Spread three times wider" is the compression the paper warns about | The paper says SSR spreads wider than people; the compression is local embeddings at T = 1 | Mean top probability 0.34 | Reworded |
| The split-half guard fixed −2,395 | Spearman-Brown corrected split by split has no lower bound: four near-equal cards gave −32 | `split_half` on 4- and 5-card subsets | Fixed: average r, correct once, only if positive. Test and mutant |
| The intervals | Up to eight people per call adds between-call variance (1.2 to 1.3 times chance) | Permutation test, batch bootstrap | Stated; only SSR C4 paying loses its difference |

### Ethics, ageism and psychology

| Conclusion challenged | How it could be wrong | Check run | Outcome |
|---|---|---|---|
| The age gradient in the personas section | The model's stereotype, by relative age in the prompt | As above | Fixed (section 6) |
| The choir-singer personas fear the phone and "adulto mayor" | Written into their briefs; no simulated answer ever uses the Spanish age labels | grep over all answers: 0 hits | Flagged in section 6; next think-aloud from screener facts |
| "Naming age raises doubts, so no age wording" protects older readers | The doubt came from under-50s (14 of 17); those 65+ rated C4 no worse | Tags by age band; paired C4 − C0 by band | Reasoning rewritten in section 1: the neutral hero serves the young; older readers are reached through situations |
| The age-label ban | It missed "adultos mayores", "personas adultas mayores", "For older adults" and caught "senior leadership" and "de memoria" | Probes through `bannedClaims()` | Fixed: inflected rule, 10 positive and 6 negative controls; MK13 |
| No dark patterns in the selling copy | (a) Pro sold as ad-free while ads are off; (b) extra rest days sold in Pro, a paid streak freeze; (c) "Descarga tu progreso si quieres guardarlo" when nothing is lost | Read `ads-config.js`, `billing.js`; the trial end clears only the billing key | (a) fixed by the subscriptions thread and here (no ads in `pricing.sub`); (c) fixed, test, MK14; (b) put to the owner |
| Young adults: "money first", "95% want communication", Evans | Money is tight at every age; "soft skills"; Evans is children | Objections by age; re-read the sources | Fixed in section 5 |
| The older-adult pass shipped persuasion, not protection | The memo's warning not to put hoarseness down to age was missing | grep | Fixed: guide section 15 in both languages, same weeks; MK15, MK16 |
| tú is backed by gob.pe | A state house style, not older people's preference | usted scan: none in selling copy | Kept tú; stated as untested |

### Claims and law

| Conclusion challenged | How it could be wrong | Check run | Outcome |
|---|---|---|---|
| Each claim is "tied to code by a test" | The checks only find a string; a change that makes a claim false while the string stays passed (the pattern AGENTS.md rejects) | Semantic mutants: 14 of 14 tests stayed green | Fixed: `tests/marketing-claims.spec.js` proves four promises by behaviour, with MK3 and MK19–MK22; the string checks are kept as drift guards and say so |
| `value.anchor` "menos que 3 clases particulares" | The only price is Lima's; shown in every market, false in Mexico at the top of one source's range | 3 × MXN 300 = 900 against 49 × 18.5 = 906 | Fixed: "en Lima" in all three strings; a test computes 3 × S/66 against S/119.90; MK17, MK18 |
| "Practicar es gratis, siempre" | A promise about the future that the terms do not make; Spain (TRLGDCU art. 61.2) and Peru (Ley 29571 art. 46) make advertising part of the contract; CI forbids removing it | grep terms.html: none | Owner's decision, 22 November 2026: say what is true today. Every "gratis, siempre" and "free, always" became "gratis y sin límite de minutos" / "free, with no daily time limit"; `qa/check-tiers.mjs` now requires that phrase; a copy rule refuses any promise of free practice for ever. MK47, MK48 |
| "nunca verás anuncios mientras practicas" | The code drew the end-of-task ad between the steps of a guided routine | Read `followRatedTake` | Fixed in `js/app.js`, proved by the routine test; MK19. The Pro window no longer mentions ads |
| `pricing.proof1` cap types | "ejercicios al día" rested on Vanido's 2017 listing, which the memo calls inactive | docs/35 table | Fixed: only the two verified cap types |
| The ads objection shows the product's problem | It is the stimulus's own sentence (0% on the one card without it) | Recount by card | Stated in section 9 |
| "Sin instalar nada", "sin tarjeta" proofs | The viewport tag proves nothing about installing; only the Spanish terms were checked | Mutants on the English terms | "sin tarjeta" now needs both languages and the trial clause; the install claim stays a drift guard |

### Market and positioning

| Conclusion challenged | How it could be wrong | Check run | Outcome |
|---|---|---|---|
| "The headline stays" | The panel could not test the collision with Vocal Image or the value of stating the position: every card gave the same facts | 0 of 768 answers name a rival; F's top takeaway is "short daily" (80%) | Reworded: unresolved, first test with people |
| The validation plan | The A/B arms share a headline and the traffic does not exist; 8 of 10 barely discriminates; ads deliver to different people | Power and binomial calculations | Fixed: section 10 reordered with new sizes |
| The copy says the position | "sin límite" is only in the description and the Pro window; English has no URL, hreflang or English Open Graph | grep | English URL handed to its thread; first-screen line in the headline test |
| Position and packaging are sound | Defensible only by counter-positioning; one lever (capping free) destroys it | Think-aloud: 7 of 9 would not try Pro | Packaging options added for the owner |
| The blurbs | None addresses the older group's setup fear or the young group's doubt | Objections by card and band | Fixed: ease and mechanism blurbs; "a cualquier edad" waits |
| Shared links are done | No og:image, og:url or canonical; a generic brand name | grep | Owner decision |

### UX and copy on the screens

| Conclusion challenged | How it could be wrong | Check run | Outcome |
|---|---|---|---|
| "nunca verás anuncios mientras practicas" answers the ads objection | One card above a Pro bullet selling "no ads": 8 of 9 called it a contradiction | Re-run tally; the filter that hides the bullet is on the subscriptions branch | Fixed here (no ads in the Pro window's line) and there (bullet hidden while ads are off); merge both |
| "Sin saber música" answers "I can't sing" | The singing routine line under it names "solfeo en trino"; no Spanish persona saw it | Screens and `daily-loop.js` | Handed to the gamification thread, which owns the routine names; a dead test exemption for "solfège" removed |
| Plain names on the first visit | The catalog's switch said "canciones, afinación" one scroll below; the lip trill has four or five names across surfaces | grep | Fixed for the switch, with a test and MK23; the exercise names are the next copy round |
| The layout control rename | 9 of 9 still confused, and "Clásica" read as classical music by both testers over 60 | Re-run tally | Handed on (section 13): hide it on the first visit |
| "No necesitas cuenta" builds trust | Next to "Entrar", 7 of 9 asked why they would sign in; the sentence lost its subject | Re-run tally; the explaining variant shows only where sign-in is configured | Fixed: "Tu progreso se guarda… No necesitas cuenta para practicar"; MK25 |
| "Ves en vivo si das la nota" | Also Spain's idiom for making a scene; the title keeps "oratoria" which the kicker dropped; four product names | Two dictionaries | Fixed: "si afinas"; MK24. "Oratoria" stays for search, a trade-off stated here; one product name is an owner decision |
| The English is natural | 22 strings use British "practise", 18 American forms, sometimes on one screen; og:locale says en_US | Count over the English table | Owner decision: pick one, then a spelling lint (section 13) |
| The new words fit a 360 px phone | The spec measures the kicker and the choices only; the clock wraps alone onto a line | Screens | The non-breaking space and "1 min 15 s" are the gamification thread's (it owns the routine line) |
| The re-run shows what the pass fixed | It also created three confusions and left the most frequent first-screen labels | Tallies | Reported in section 8; "Plan", "Tus básicos" and the trial button next |

### Second round: the promise tests themselves

Codex's review of this branch, and then a second independent red team (one
agent per promise and one on flakiness, each survivor re-applied and judged by
another agent), tried to break `tests/marketing-claims.spec.js` rather than the
copy: each way a promise could be broken while the spec stayed green was
planted in the code and run, and the ones that stayed green are below. The spec was rewritten twice. The defects
named in the last column are planted in `qa/mutate.mjs` and each turns it red;
the other ways are covered by the visitors and controls described there.

| Promise | How the spec could be fooled | Outcome |
|---|---|---|
| No time limit | A cap that spares the first day (Codex); a cap above the one hour tested, a weekly one, one that starts on a launch date after the spec's fixed clock or fourteen days after a first visit, one read from the take history instead of the day ledger; a take cut short, which the spec hid by shortening every take to 50 s; English only, weekends, the catalog or a routine as the way in; the runner's time zone moving "today" | Three visitors: a first day past an hour; ten years on, a Sunday night at a month's end, in English, 40 days of 8 h and 10 h and 300 takes today in both records, on the third page load, from the catalog and from a routine; and one who first came 45 days ago. Every take keeps its full length, is still live 5 s before its end, and is counted; the time zone is pinned and the app's own day key checked. MK22, MK28, MK34–MK37, MK44, MK46 |
| Voice stays on the device | Small text pieces in beacons and WebSocket frames (Codex); a send put off by a timer, on leaving the page, or to the next visit; the analytics queue, which the spec's automation mark had silenced; headers the page may set (`accept`, a cookie); a file fetched again with the take in its query; WebRTC in a frame made with no address; a worker; a take too large for a beacon, so a beacon upload failed by itself | Counted for a visitor the app treats as a person (its analytics on, checked first), from Start through Save, a minute, the page hidden and left, and the next visit with a minute of it; bytes, requests and repeat fetches are each budgeted; the take is stopped at about 24 KB; nine controls each send the saved take and are caught. MK20, MK26, MK27, MK38–MK41 |
| No account needed | Only the latest take kept, the rating dropped, a guest history that expires, a store lost on restart | Two takes, one rated, read in a new tab a minute later and after a restart (a new browser from what is kept on disk, session cookies dropped) a month on, where Start still starts. MK21, MK42, MK43, MK45 |
| No ad during practice | An AdSense unit or another container, unseen by a check for one class (Codex); an ad drawn and cleared between two checks; one mode or one entry point checked at a time, where refreshAllSafe cleared what another had drawn; checks that could never fail (refreshAllSafe outside the home page; the native mode, which has no card for the home slot) | A MutationObserver over the whole routine sees every ad node added; all four modes; each entry point checked by itself while a take starts, while it is live and at every moment of a routine, and each with a control that draws an ad the same way once practice is over; the pairs that could never draw are left out and named. MK3, MK19, MK29–MK33 |

It also found three ways the product broke the promise, now fixed:

| Found | Fix |
|---|---|
| The end-of-task card stayed in the rating card through "↻ Otra vez" and the whole next take | `clearPostSessionAd()` as a take starts (`js/app.js`); MK30 |
| A card from a single exercise rode into the first step of a routine started next | The same, as an exercise opens; MK31 |
| Mid-routine, Historial and the home page drew their ads (the routine was checked only at the end-of-task card) | `routineUnderWay()` in the ad gate (`js/ads.js`): a routine under way counts as practice. Trade-off: a routine left running keeps those ads away until it is finished, ended or paused; MK32. The older guard after the rating (MK19) is kept as a second layer; with this check in place it cannot be seen alone, so MK19 now removes both |

### Third round: the paths the scenarios did not walk

Four more red teams, one per promise, then a pass on why each mutant dies and
one on flakiness, planted changes that broke a promise on a path none of the
browser visitors walked: 15 for the time limit, 12 for the voice, 12 for the
account and 9 for the ads. 47 of 48 stayed green. Walking every path in a
browser does not scale, so the answer has three layers.

**Guards on the code itself** (`tests/node/promise-guards.test.mjs`, built on
`qa/promise-scan.mjs`, which parses every shipped script and the pages' inline
scripts):

| Guard | What it holds |
|---|---|
| Egress inventory | Every place a script can send something, in its ordinary spellings, is listed with its reason: a request (fetch called, deferred with `fetchLater`, bound, or handed on as a value), a beacon, a WebSocket or WebTransport, a message to another window, speech recognition (Chrome streams the microphone to Google for it), a form, a new window, a navigation, a cookie, an address set on an element (by property, `setAttribute(NS)` or `Object.assign`), a module import, and a DNS hint, SVG image or `@import` in HTML or CSS text. A new one fails until it is reviewed. |
| Voice sources | Only six files may touch the microphone, the recorder, speech recognition or saved takes (by name, or by the takes' store opened by its own name), and in them no function that reads the voice reaches a network sink through the call graph, which follows callbacks set on a property and methods called on `this`. |
| The plan on the way to practice | From 31 entry points (Start, Stop, Continue, the routines and their banner's pause, continue and end, the take's own record and stop, the welcome-back and reminder starts, the rating, Next, "+30 s", Historial) the call graph, which follows callbacks set on a property such as home's Start card or the engine's per-frame handler, reaches the plan only in ten named functions that draw Pro, each with a fixed count of reads, and never the Pro or account window. Those ten, and every function on the path that uses one's answer, are pinned by their code (fifth round). |
| Tracking plan | Every analytics event and every key it carries is pinned, so a new event or a new prop fails, and every one is checked against the worker's own list, so an event the wire filter would drop fails in CI rather than going missing. |
| Sign-in | On the way to practice only `headerPlanState` (the header's label, the progress board's tag and Start's trial funnel, which records an event and starts nothing) and the page's way out (a signed-in visitor's progress sent as the page hides) touch the account module or ask whether the visitor is signed in (`getState().account`, Google's sign-in and the older `VTAuth` included), and only eight files do at all. |
| Guest stores | The code that keeps a guest's progress never names the account or session storage, and its storage keys are pinned. |
| Ads | Only `js/ads.js` and `js/ads-config.js` read the ad config, and every push to AdSense's queue, by its name or through a variable, is `{}`: the page asks for no page-level ads. Auto ads are a switch in the AdSense account that no test can see, so the go-live checklist keeps them off (docs/40 step 9c). |

**A filter on the analytics wire** (`js/analytics.js`): the browser now applies
the worker's own event list and prop rules before anything leaves. The worker
used to drop a 1.5 KB pitch contour only after it had arrived.
`tests/node/analytics-wire.test.mjs` compares the two on 3,000 generated cases,
so the filter drops nothing the funnel could read, and reads the browser's list
of names from its source to compare it with the worker's both ways.

**Wider scenarios and one product fix:**

- Time limit:
  - the longest exercise (20 minutes), a drill with no microphone, "+30 s" and
    Next in a routine, and the daily class started after leaving a routine;
  - a phone in Madrid whose trial has ended, with today's basics done;
  - every take played to its end, and the takes "+30 s" and Start right after
    Stop begin, check at their start and five seconds before their end that the
    microphone listens, that its frames reach the take (the level meter moves)
    and that the piano sounds where ticked. The take stopped half a minute in
    checks at its start.
- Voice: a rating, a singing take run to its end and saved (a second save),
  three minutes on in ten-second steps, and two more visits.
- Account:
  - a second tab, opened after the first exercise's takes and kept open from
    then on, with its own take;
  - takes on both tracks, a saved recording, a routine half done;
  - restarts 31 and 32 days on, where Historial shows the day and the
    recording and a new take is kept.
- Ads:
  - a unit test of the gate (`tests/node/ads-gate.test.mjs`);
  - a routine paused and then continued, or paused with its step taken anyway;
  - no card while a take is starting.
- **Product fix:** the ads red team found that pausing a routine, taking its
  step anyway and pressing Next left the routine paused, so Historial drew an
  ad in the middle of it. Starting a paused routine's own step now resumes it
  (`resumeRoutineOnStart` in `js/app.js`; MK55).

The pass on why each mutant dies found seven time caps reported only as "Timeout
10000ms exceeded", which reads the same as a broken fake microphone. Start now
says what it saw: live, a Pro window or an account window. Reading the new
mutants' reds the same way found four more that named a step on the way rather
than the promise: two died on the routine's status, not on the ad that status
lets through; one waited out the whole test on a button it could not press; and
one died on an assertion marked as a control. Each now dies on the promise.

The stability pass ran the spec 110 times without a failure, then found three
more ways round it and four weaknesses, all now closed:

- A take uploaded five seconds after the page is hidden: the page is now left
  hidden for a minute before it is closed (MK68; the guards see it too).
- Guest takes pruned three seconds after the page opens: each restart is now
  read a minute after it opens, and the other exercises are checked after the
  new take (MK69).
- Past an hour, the basics' steps planned at 30 seconds: the test took the
  expected length from the session the code had built, so it expected 30. The
  planned lengths are now written in the test (MK70).
- The "no time limit" visitors, with analytics on, posted events to the
  production worker on every run. The worker's host now answers inside the
  test.
- The end-of-task card is drawn 700 ms after the last rating, so a runner that
  stalled that long would have counted it inside the routine. An ad is now
  labelled by the routine's own state as well.
- Two older specs probed the analytics with made-up event names, which the
  wire filter now drops. They probe with an event the worker keeps.
- Outside this spec, it traced CI's intermittent `stage-design` failure to a
  race between the test's scroll to the top and the rating card's smooth
  reveal one frame later. That is handed over in section 13.

An independent review of this round's changes then looked through four lenses
(the guards, the spec, the analytics and this record), and a skeptic checked
each finding. It confirmed 25, all now closed:

- **The guards missed paths and spellings.** A callback set on a property
  (home's Start card, the engine's per-frame handler, the buttons shown when
  the microphone is blocked) was cut off from the call graph, and a method
  called on `this` had no edge. The routine banner's pause, continue and end,
  the take's own record and stop, and the welcome-back and reminder starts
  were not entry points. Speech recognition was in neither list. Neither were
  `fetchLater`, a bound or aliased fetch or beacon, WebTransport,
  `cookieStore`, `Object.assign`, SVG and `@import` in text,
  `location.search` and `navigation.navigate`, nor a take read through its
  store's own name. A sign-in check spelled `getState().account`, a call to
  Google's sign-in and an aliased push to AdSense all got past. A JSON-LD
  block on a page would have crashed every guard. Fourteen planted defects
  (PX1 to PX14) stay green on the old guards and fail on the new ones.
- **The wire filter hid drift.** An event the app raised that the worker does
  not know was now dropped without a trace, so the worker's count of unknown
  events could no longer show it. Two browser specs that checked what the
  worker keeps read the filtered wire, where every check holds. The tracking
  plan is now checked against the worker's list, those specs read the events
  as raised, and the browser's own list is compared both ways (PX12, PX14). A
  control that could not fail now runs the code without its filter.
- **The spec missed silent takes.** It did not catch a take that runs on the
  clock while it drops every frame, a piano that stops a minute in, a silent
  "+30 s", a silent take right after Stop, or a send on an interval's third
  tick. Each is now caught (MK71 to MK75).
- **The record was wrong in places**: the Safari note below, "every take
  checks" (three did not), when the second tab opens, two mutant counts and a
  mutant's name. All are corrected.

A skeptic then went over those fixes with the same three lenses and confirmed
16 more, all now closed:

- **The guards still had gaps.** A click handler written inline in a binder
  that also opens other things (the welcome-back card's three starts, the
  routine's "end" answer, today's basics) was merged into its binder, which
  was not on the path, so a cap there before the call into practice passed.
  Each handler on an element found by its selector is now a function of its
  own, named by that selector, and every function of `js/app.js` that calls
  into practice must be on the path or be listed with why it is not (four
  were: the page's start, the redraw after a language change, the reminders
  card's binder and an admin button). The fourth round below found that a
  handler on an element kept in a variable was still merged, and that a
  listed function could hide a cap in its own body. A fetch
  held by a default parameter, a class field or a destructuring, a callback
  set on `this` in a constructor, a window `open()` hidden by another
  function's own `open`, and an AdSense push through `window["adsbygoogle"]`
  or a helper that returns the queue all got past. So did an event named from
  a template (`tour_${reason}`), which the check against the worker passed by
  its prefix, and a name added to the browser's wire list outside its
  literal. Ten planted defects (PX15 to PX24) stay green on the old guards and
  fail on the new ones.
- **The spec's new checks were thinner than they read.** The level meter is
  only the first thing a frame feeds, so a cap right after it would drop the
  rest unseen; the exercise's own mode must now be handed the microphone's
  frames (MK76). "The piano sounds" read the piano's bookkeeping; its output
  must now carry sound at the take's start (MK77). Near the end, sound alone
  proved little: the take's minutes are jumped in a second or two of real
  time, so the start's notes can still be ringing there (a loop silent after
  its first pass passed that way, MK78). Every note the piano schedules after
  the start is now counted with whether it is wired to the piano's output,
  and near the end every one must be. CI then caught the first version of
  the check failing on a slow runner, where an exercise that cues each target
  once had gone quiet by the end; it is held to its books there, and the page's
  clock is stepped while the check waits. MK71, the send on an interval's third tick, was
  already caught by the earlier spec through a minute it spent elsewhere, so it
  showed nothing; it now sends on the fourth tick, which the earlier spec
  misses and this one catches. MK76, MK77 and MK78 pass the earlier spec.
- **The record**: the pull request's description was a round behind, the
  Safari bug report was read wrongly (below), "never a miss" was not true of
  the call graph, and the spec's time was out of date. All are corrected.

A fourth red team then went over those fixes with five lenses (the scanner,
the practice path, the events, the spec and this record) and a skeptic
checked each finding: 17 stood, one was refuted as a limit already written
down, and all 17 are now closed. Fifteen planted defects (PX26 to PX40) fail
on the new guards and pass the old ones. PX25 plants the class field the
previous round's record named but never planted, which that round had already
closed: it fails the old guards too, and passes the guards before that round
only without its EGRESS row. Three (MK79 to MK81) fail on the new spec and pass
the old one. (This paragraph first said sixteen; the fifth round corrected it.)

- **The voice check lost paths.** Stop's handler could keep a take in a
  variable that the page's pagehide handler, made beside it, beacons out: the
  two were separate functions with no edge between them, a loss the previous
  round's handler naming itself caused (PX26). The functions a hearer is made
  in now hear too. The take store's own methods (`getRecordingBlob` and the
  rest) were filed under the file's top, so `js/storage.js` was checked for
  nothing (PX28), and a class's `#private` method was not followed (PX29).
  Each is now named for itself.
- **Handlers and wrappers hid caps.** A handler on an element kept in a
  variable (`const again = $("#wb-again")`) was still merged into its binder
  (51 of 139 handlers were), so a cap there passed if the binder was a listed
  exception (PX27). Each is now named by the variable's selector, or by the
  variable, `document` or `window`, and none of the 139 is merged into its
  binder. A listed exception may no longer read the
  plan or the account at all, and a function handed a practice function as an
  argument (`proOnly(startDaily)`, the hand-off by which the daily loop starts
  the class) now counts as calling it (PX31, PX40).
- **A cap need not be on the path.** A page-wide capture listener can swallow
  the welcome-back Start and open the plans without calling anything in
  practice (PX32), and the plans open on `$("#btn-pricing").click()` with no
  billing name in sight (PX33, PX34, and PX35 for the account button). So the
  buttons' ids and the plan's and session's storage keys now count as names,
  and every function in every file that reads the plan or opens the sale (53
  today, with why) or opens the sign-in (13) is written down, as every way off
  the device is.
- **Events got past the plan.** A relay's own body was never read, so props it
  added rode out on every event (PX36); a template's part given a new value
  in its own function (PX37), or its function called through `bind` or from
  another script (PX38), resolved to the wrong names; and `js/analytics.js`
  was skipped (PX39). A relay must now pass its own two parameters on as they
  came; such a template is unresolved and fails; tour.js's exported `end` can
  only dismiss (no other script passes anything else); and analytics.js is
  read like the rest.
- **AdSense's queue** taken out of the window by destructuring, a default
  parameter or a class field got past, the holders the previous round closed
  for fetch (PX30).
- **The spec read calls, not content.** A reference that plays once instead of
  looping passed, because the start's notes still ring (MK79): the two
  looping references these visits play are now written out and must loop. A
  mode handed silence in place of each frame (MK80), or a pitch highway fed
  nothing (MK81), passed a count of calls: the mode's frames must now carry a
  level and a pitch, and a pitch exercise's highway must draw the voice. The
  daily class is started through the loop's own hand-off, where PX31's
  wrapper would sit.
- **The record**: the head the pull request named had failed its own spec in
  CI, so "13 of 13" and "all caught" were not shown there; it named a
  class-field mutant that did not exist (now PX25); and three sentences here
  said more than the code did ("named by its selector", "must be on the path
  or listed", "can only add paths"). All are corrected.

A fifth red team went over those fixes with the same five lenses, and a
skeptic checked each finding: 17 stood or were partly right, three were
refuted as limits already written down, and all 17 are now closed, with one of
the three limits closed as well. Fourteen planted defects (PX41 to PX54) fail
on the new guards and pass the old ones, five (MK82 to MK86) fail on the new
spec and pass the old one, and one (L63) fails the new check of the harness's
own usage line.

- **The sale had other doors.** The plans also open from the progress board's
  Pro button, the trial note's, the account panel's and three Pro controls,
  from their dialog shown by its own id (`$("#pricing-modal").hidden =
  false`), and the header's Pro button carries the plan on the page
  (`data-plan`). A cap past an hour on the welcome-back start, on Start or in
  the daily loop got past every guard that way (PX43 to PX46), so "every
  function that reads the plan or opens the sale is written down" was true
  only of the names the scanner knew. The elements bound to open the sale or
  the sign-in are now found from the code's own listeners, and a guard fails
  when one is not among the scanner's words (PX54); a dialog of the sale or the
  sign-in shown by its id counts as opening it (closing it does not); and the
  header button's plan marks count as reading the plan. 60 functions now read
  the plan or open the sale, and 18 open the sign-in, each written down with
  why.
- **The second sign-in.** `VTAuth`, the older sign-in for the owner and
  testers that `js/app.js` also trusts, was outside the account's words: a
  guest's sixth take refused behind the account panel passed (PX47), and so
  did a saved take that would not play for a guest (MK86, in the browser). It
  and its session key are now account words; the account visitor now checks
  that a take is saved and a saved take plays a month on, with no sign-in in
  the way.
- **A reader could gate with what it already held.** The counts pin which
  names a function on the practice path uses, not what it does with the
  answer: `restQuickStarts(ent.pro)` in the trial note disabled the routine's
  Continue past an hour (PX48), and `if (headerPlanState().kind === "free")
  return` in the routine's Continue stopped it with no new name at all (PX49).
  The 16 functions on the path that read the plan or the account, or use one's
  answer at any depth, are now pinned by a hash of their code (comments and
  layout aside): a change to one, or a new one, fails until it is read again.
- **"Only the header" was not true.** `headerPlanState` is also the progress
  board's tag and Start's trial funnel (`trackTrialFirstPractice`, which
  records trial_first_practice once and starts nothing). The lists, the test's
  title and the table above now say so.
- **The voice and ad checks lost names.** Two functions that each make a
  `finish` gave the hearer only one function it is made in, the other one's,
  so Stop's handler kept a take its pagehide sibling beaconed (PX41); a name
  now keeps every function it is made in. AdSense's queue handed to a helper as
  an argument, or kept in a property, was not followed (PX42); both are now.
- **Events.** A relay could add props through `Object.assign(props || {},
  ...)`, an alias or a helper (PX50 to PX52): a relay's props must now be named
  once, in its send. A relay handed on as a default parameter was never read
  (PX53); the skeptic found it a written limit, but it was cheap to close, so a
  relay used as a value is now listed. The tour's event failed the guard on
  three honest edits far from it (`end()` with nothing, another function's own
  `end`, a `.catch((reason) => ...)`): the template's calls are now told apart
  by scope (`eslint-scope`), and a missing argument takes its default or makes
  no name, as `false` does.
- **The spec read fields and calls.** A mode handed a copy of each frame with
  only its sound gate shut passed a check of level and pitch (MK82): the mode
  must now be handed the engine's own frame, with its gate open and a raw
  pitch. A loop kept flagged on with its next pass cancelled passed (MK83): a
  looping reference whose take outlasts the pass sounding at its start must
  schedule another. A highway stopped for the take passed a count of calls
  (MK84): it must run and keep new points of the voice. The class, started by
  calling the loop below its chip, passed a cap where the start panel picks the
  size (MK85): it is now started by its chip and Start, as a visitor starts it.
- **The record**: "Sixteen planted defects ... pass the old ones" above was
  wrong (fifteen did; corrected); the last commit's message said each of the
  17 was closed by a planted defect, but the record finding was closed by
  corrections to the text; the spec's header and the harness's usage line
  still named three browser sets, so the documented command skipped the time
  limit's second half (now held by a test, L63); and "every handler is a
  function of its own" left out a handler on an element found by a computed
  selector (one, in `js/site-layout.js`), which is now named by the selector's
  fixed text, or by the call that found the element.

Trade-offs:

- The guards read names as they are spelled. A computed name
  (`window["fe" + "tch"]`), an alias made through a variable that is not a
  sink's own name, or a value handed between files through a variable gets
  past them. They are tripwires backed by the browser scenarios, not proofs.
- The call graph merges functions that share a name and joins every callback
  made inside a function to that function. Naming handlers apart, which the
  previous round did, cut an edge the merge had given (PX26), so the
  functions a hearer is made in now hear too. That stops at the file's top: a
  take kept in a file-level variable or a global, and sent by a function that
  never hears, is a value handed through a variable, which the scanner does
  not follow. It can also miss a function kept in an array or a map and
  called from there, one passed to another file, `this.x()` where `x` is
  named nowhere in the file, or a call made by a name it does not resolve.
  Handlers added in a loop (`forEach((btn) => btn.addEventListener(...))`)
  share one name per binder and variable, and a handler on an element found by
  a computed selector is named by its fixed text (`#tabs [data-tab="${}"]`),
  so two such handlers in one binder share a name. The path is walked in `js/app.js`
  only; other files are held by the lists of who reads the plan or opens the
  sale or the sign-in, function by function.
- Only callers of the core practice functions must be on the path. A function
  that calls one of those callers (a Pro profile switch that redraws the
  history, say) is not checked unless it is listed, and a listed one may not
  read the plan or the account.
- Every function that reads the plan or opens the sale (60) or the sign-in
  (18) is written down, so each honest new one costs a line and a reason. A
  cap that does neither (returning early past an hour for everyone, with no
  window) is not seen by these lists; the browser visitors catch it on the
  paths they walk. "Reads the plan" means by a word the scanner knows: the
  plan's names and keys, the elements bound to open the sale or the sign-in
  (found from their listeners, so a new button joins on its own), their dialogs
  shown by id (directly, or through a variable given the element in the same
  function), and the header button's plan marks. The plan read from the
  button's label text, or a dialog shown through an element kept elsewhere,
  is not seen.
- The 16 functions on the practice path that read the plan or the account,
  or use one's answer, are pinned by their code, so an honest edit to one
  (`renderExercise` and `renderPianoControls` among them) costs a re-read and a
  new hash. "Uses the answer" means a call whose value is kept, tested or
  returned; an answer kept in shared state and read elsewhere is not
  followed.
- A relay's props must be named once, in its send, so a relay that tests them
  (`if (!props) return`) is listed as changing them; the test belongs in the
  caller.
- tour.js's exported `end` turns any reason another script passes into
  "dismiss", so a tour can be recorded as complete or skipped only by its own
  buttons. No script passes anything else today.
- The looping references are written out in the spec (two today), so a new
  visit that plays another looping exercise must add it. A loop must schedule
  another pass only when the take outlasts the pass sounding at its start, by
  three seconds, so "+30 s" inside one pass is not held to it. The mode's
  frames count only when they are the engine's own frame, with the sound gate
  open and a raw pitch, not the fake tone's exact pitch, since an octave error
  or a speech drill may read it another way; a cap that changed the frame in
  place, keeping the object, would pass. The highway check reads the
  visualizer's own history (its points' time and voice), so a rename there must
  update the spec. The class is now started by its chip and Start, before the
  basics, because the chips are hidden while a routine is open.
- An event named from a template is resolved through the calls of the
  function it is in, in its own file, told apart by scope. A `false`, `null`
  or missing argument passed there makes no name, on the reading that the
  function returns first (tour.js's `end(false)` does), unless the parameter
  has a default, which is read instead. A template with more than one part, one whose part is
  given another value in its function, one whose function is handed on,
  bound or exported, or one whose part cannot be traced, fails the check and
  must be written out.
- The piano's output is read from its own monitor on its master bus, so a
  mute placed after that bus (on the compressor or the speakers) would not
  show. The audio clock runs in real time, not on the test's clock, so the
  check waits for sound for up to ten seconds, stepping the page's clock.
- Near a take's end the piano is held to wiring, not to sound: each note
  scheduled since the start must reach the master bus. A mute of the master
  bus itself late in a take would show only while earlier notes still ring.
  A pass can outlast a short take (one-note mode: up to 20 notes of up to
  5.5 s), so "+30 s" may schedule no note to check; the long takes schedule
  12 to 16. An exercise that cues each target once is checked for sound at
  its start only, because a fake microphone holding one tone never moves it
  on.
- One jump of the clock runs a take of minutes in about a second of frames.
  A cap counted in heard audio, in frames or in a timer's ticks is therefore
  not reached by the browser spec; playing each take in real frames would cost
  its full length. The guards hold the free-visitor form of it (a plan read in
  the per-frame handler, PX2). A cap for everyone counted that way is not
  caught.
- The worker's count of unknown events no longer sees a client bug, because
  the browser drops the event first. CI's check of the tracking plan against
  the worker's list takes its place, before release rather than after.
- Auto ads are a setting in the AdSense account, so a line in the go-live
  checklist holds them, not a test.
- The guards also fail on honest new code. Each new send, event or plan read
  has to be added with its reason, and that review is the point.
- A short id-like value (up to 64 letters, digits and `_.:-`) on a known event
  and key can still leave, and a few pitch values would fit. The tracking plan
  pins the keys, so the risk is bounded but not zero.
- A paused routine is not practice, so ads may show while it is paused. The
  visitor chose to stop.
- Signed-in visitors' progress scores still sync, as the privacy page says.
  Their voice does not.
- The browser spec now takes about 1.7 minutes with two workers; the piano check waits for real sound at a take's start.
- **Still open (section 13):** Safari can clear everything a site's scripts
  stored after seven days of Safari use without user interaction on the site,
  that is a tap, click or keypress there (WebKit's "7-day cap on
  script-writeable storage", 2020). So "no account needed" can fail on Safari
  for someone who does not use the site for longer; opening it without a tap
  does not count. The same WebKit post says a web app added to the Home Screen
  is not part of Safari, keeps its own count of days of use, and is not
  expected to lose its data. Since iOS 26 any site added to the Home Screen
  opens as a web app by default, with or without a manifest (WebKit, Safari 26
  beta, 2025). A 2022 WebKit bug report (237350), earlier cited here as a Home
  Screen app losing its data, is about a login cookie set by script, whose
  expiry WebKit caps at seven days; WebKit's reply there says server-set
  cookies and HTML storage "should not be deleted" for a Home Screen web app's
  main domain. This app keeps a guest's progress in that storage, not in
  cookies. The app never asks for
  persistent storage (`navigator.storage.persist()`). WebKit's storage-policy
  post says a persistent origin "might be excluded from eviction" but not
  whether that lifts the seven-day cap. Two questions are left for a real
  iPhone or Mac: does persistence lift the cap in Safari itself, and does a
  Home Screen launch on iOS 26 keep a guest's progress past seven days.

## 12. Tests and mutants

| Guard | What it catches | Mutants |
|---|---|---|
| `tests/node/marketing-copy.test.mjs` | Banned words in any selling string, every inflection of an age label included, and any promise that practice stays free for ever; an English twin missing or in Spanish; jargon that confused the personas, the catalog describing a track differently from the first visit, a bare "no account" line, the "das la nota" idiom; a lesson comparison without the city its price is from, or one that does not hold; a trial end that implies progress is lost; the guide's hoarseness advice without its age warning or with different weeks per language; the line in the code, terms or privacy page behind each claim (a drift guard) | MK1, MK2, MK4–MK18, MK23–MK25, MK47, MK48 (`node qa/mutate.mjs claims`) |
| `tests/marketing-claims.spec.js` | By what the product does (section 11, second round): full-length takes start, run out and are counted with no Pro or account window for three visitors (a first day past an hour; ten years on, a Sunday at a month's end, in English, heavy in both records, from the catalog and a routine; one who first came 45 days ago); a take recorded, saved, left and come back to sends nothing the size of it by any request, header, cookie, WebSocket, worker or WebRTC connection, for a visitor whose analytics are on, with nine controls; two takes and a rating survive a new tab and a restart a month on; with ads on, no ad of any form at any moment of a routine in any of four modes, nor while a take starts or is live, each check with its own control, and the end-of-task card goes as a take or a routine starts. Third round: the longest exercise, a drill with no microphone, "+30 s", Next and the daily class, a phone in Madrid; a rating, a natural end, a second save, three minutes and two more visits; a second tab and restarts 31 and 32 days on; a paused routine continued or its step taken anyway. The review of that round: the microphone's frames and the piano at both ends of a take, "+30 s" and Start right after Stop heard too, three minutes in ten-second steps. The skeptic's pass: the exercise's own mode handed the microphone's frames, the piano's output carrying sound at a take's start, and every note it schedules after that wired to its output. The fourth red team: the two looping references loop, the mode's frames carry a level and a pitch, a pitch exercise's highway draws the voice, and the daily class starts through the loop's own hand-off. The fifth: the mode is handed the engine's own frames with the sound gate open, a looping reference schedules its next pass, the highway runs and keeps the voice, the class is started by its chip and Start, and a saved take is saved and plays a month on with no sign-in in the way | MK3, MK19–MK22, MK26–MK46, MK49–MK86, in four sets so that none outgrows a CI job's 30 minutes (the time limit's 23 alone took 23): `node qa/mutate.mjs promises` and `promises-time-2` (the time limit's two halves), `promises-voice` and `promises-account-ads`, each a job in CI's mutation matrix. MK41 now also removes the wire filter, since with the filter in place its event never leaves |
| `tests/node/promise-guards.test.mjs`, `tests/node/analytics-wire.test.mjs`, `tests/node/ads-gate.test.mjs` | Section 11, third round: a new send, voice read or event prop; the plan, the sale or a sign-in question on the way to practice; a guest store that names the account or keeps anything for the tab only; the ad config read outside the ad files; an event or prop the worker would drop leaving the browser; a routine under way not counted as practice in any state. The review of that round: callbacks set on a property, methods on `this`, the banner, record and welcome-back entry points, speech recognition and the other send spellings, a take read by its store's name, the account module and Google's sign-in, an aliased AdSense push, the browser's event list against the worker's both ways, and a planned event the worker was never told of. The skeptic's pass: every caller of practice in `js/app.js` on the path or listed, inline click handlers as functions of their own, fetch held by a default parameter, class field or destructuring, a sibling's `open`, AdSense by brackets or a helper, event names made from templates resolved at their calls, and the wire list read only by its filter. The fourth red team: a hearer's enclosing functions, the take store's methods and private methods, handlers on elements kept in variables, listed exceptions that read nothing of the plan or account, a function handed a practice function, every function in every file that reads the plan or opens the sale or the sign-in written down with why, the buttons' ids and the storage keys as names, relays that change what they pass on, templates reassigned, bound or exported, analytics.js's own events, and AdSense's queue through destructuring, a default parameter or a class field. The fifth: every element bound to open the sale or the sign-in (derived from the code), the dialogs shown by id, the header button's plan marks, the older sign-in (VTAuth), the functions on the path that read the plan or use its answer pinned by their code, a name made in two functions, AdSense's queue handed to a helper or kept in a property, a relay's props named once and a relay handed on, and templates told apart by scope | PT1–PT15, PV1–PV13, PW1–PW7, PA1–PA7, PN1–PN7, PX1–PX54 (`node qa/mutate.mjs guards`); L63 (`lint`: the harness's usage line names every browser set CI runs) |
| `tests/marketing-copy.spec.js` | On a real page at 360 and 390 px, both languages: the kicker stays one line, no choice is cut or over three lines, no sideways scroll, the layout control fits one row; the tab title and description follow the language; Open Graph stays Spanish | DS20–DS23 (DS23: the kicker set larger on phones). CI's runner has no Inter and draws in DejaVu Sans, which is wider, so the kicker's tracking is 0.06em under 400 px; reproduce with a fontconfig that maps Inter to DejaVu |
| `qa/customer-research/test_rules.py` | Answers matched to the wrong round's batch; split-half reported for three cards, or unbounded for four; reliability that comes from the bad offer alone; "not worse" judged on the point estimate; a verdict on a question that failed its checks; "better" while any gate failed | 7 rule mutants plus 6 scoring mutants in `mutate_ssr.py`, all killed |

## 13. Handed to other threads, and decisions for the owner

| Item | Evidence | Where it went |
|---|---|---|
| "gratis, siempre" is a promise about the future that the terms do not make | Spain and Peru treat advertising as part of the contract; `qa/check-tiers.mjs` requires the phrase | Decided 22 November 2026: soften the copy. Done in this branch (section 11, claims and law) |
| Pro sells extra rest days for the streak | Charges for relief from broken-streak loss, the mechanism the streak ban cites (Silverman and Barasch 2023) | Owner decision; subscriptions thread told |
| The headline | Section 1 row 1 and section 10 | Owner decision after the headline test |
| No og:image, og:url or canonical; a generic brand name, and four names across the header, tab and Pro window | grep of index.html | Owner decision |
| English mixes British and American spelling (22 and 18 strings) | Count over the English table; both an American and a British tester noticed | Owner decision: one locale, then a spelling lint |
| "solfeo en trino" under "sin saber música"; the clock alone on a line | Screens; 3 of 3 English testers | Gamification thread (owns `js/daily-loop.js`) |
| English browsers land on the Spanish site; no English URL or hreflang | Playwright with en-GB and en-US; grep | Its own thread ("Show English to English-language browsers"): `?lang=es\|en`, reciprocal hreflang and an `x-default` |
| English link previews stay Spanish even with `?lang=en` | Link previews and crawlers read the raw HTML and never run the script that switches language | Owner decision: only a static `/en/` page with its own title, description and Open Graph tags fixes them |
| Search engines may not pick up the English URL | hreflang is a hint, not an instruction | Owner, after deploy: submit the three URLs in Search Console and check "View crawled page" for each |
| hreflang links are absolute `pillb.github.io` URLs | The English thread's markup | Owner: if the site moves to its own domain, move the hreflang links with it |
| "Hablar" is pre-selected on a first visit | 5 of 6 personas who came to sing undid it first | Owner decision: the default is pinned by a test as deliberate |
| The layout control is the first thing on screen and nobody understands it | 9 of 9, before and after the rename; "Clásica" read as classical music | Deploy and blind-pair-ratings thread; owner decision to hide it until after the first exercise |
| "trill solfège", "Tus básicos", "1:15" | 3 of 3 English personas; 6 of 9; 3 of 9 | Gamification thread (owns `js/daily-loop.js`) |
| PEN, "Gratis 0", "pagos no públicos" beside the trial button, ad-free as Pro's lead benefit | 5, 7 and 7 of 9; ads the top objection | Subscriptions thread, fixed there |
| Hoarseness: 4 weeks (AAO-HNS) or 3 (NIDCD's consumer page) | C-older memo | The age warning is added; the weeks are the voice-science owner's (docs/44) |
| CI's intermittent `stage-design` failure ("paused" phase, scrollY 20 to 26 against at least 43) | Traced by the stability pass: the rating card's smooth reveal (`revealRating`, one frame after Stop) races the test's scroll to the top; slowed by 40 ms locally it fails 9 of 12 | The thread that owns `tests/stage-design.spec.js`: wait for the reveal before scrolling to the top, or skip a reveal the page was scrolled away from (a guard in `revealRating`, probed: 12 of 12 with the delay) |
| "No necesitas cuenta" on Safari | Safari can clear what a site's scripts stored after seven days of Safari use without user interaction on the site (WebKit, 2020). WebKit says a Home Screen web app keeps its own count and is not expected to lose its data, and since iOS 26 any site added to the Home Screen opens as one (WebKit, Safari 26 beta); a 2022 WebKit bug report about such an app losing a login was a script-set cookie, whose expiry is capped at seven days, and WebKit replied there that HTML storage should not be deleted. The app never calls `navigator.storage.persist()`, and whether that lifts the cap is undocumented (WebKit, "Updates to Storage Policy") | Owner decision: on a real iPhone and Mac, test `persist()` in Safari and a Home Screen launch on iOS 26 past seven days; if neither holds, qualify the line on Safari or offer an export |

Merging with the subscriptions branch (`claude/project-thread-nrj90h`): that
branch carries the filter that hides "no ads" in the Pro window while ads are
off, which this branch's ads answer relies on, so merge both. The subscriptions
thread test-merged the two; the conflicts are adjacent lines only. Keep this
branch's `pricing.sub` and that branch's `pricing.note`, `pricing.cancel.*`,
`pricing.morNote`, `pricing.morTerms` and `pricing.opening`, in both language
halves, and settle the asset-stamp conflicts with `npm run assets:bump`.

## 14. Ledger

| ID | Tier | Where | Finding | Root cause | Status |
|---|---|---|---|---|---|
| MR-1 | High | `value.anchor` | "Una clase particular ≈ el año de Pro" was false in Lima (S/ 66 a lesson against S/ 119.90 a year) | No test tied the anchor to a price source | Fixed: "menos que 3 clases"; MK10 |
| MR-2 | Med | `pricing.proof1` | "Casi todas las apps…" claimed the whole market | Proof covered course apps only (docs/35) | Fixed: "Muchas apps de canto con suscripción"; MK9 |
| MR-3 | Med | first visit | Mentioning the microphone raised privacy worries 9% → 22% (not significant) | Reassurance missing where the mic is named | Fixed as a precaution: step 2 line; MK12, MK20 |
| MR-4 | Test | `marketing-copy.test.mjs` | `\búnic[ao]\b` never matched "única" | JavaScript `\b` is ASCII-only | Fixed: Unicode lookarounds with the `u` flag |
| MR-5 | Test | `marketing-copy.test.mjs` | The share-text control compared against an undefined key, so it always passed | Wrong key name (`meta.description`) | Fixed: compares with `meta.desc` and asserts the edit is read |
| MR-6 | Research | `collect.py` | Round 2's C0 and C0p kept 10 and 16 of 64 answers | Batch ids repeat across rounds; the first index found won | Fixed: run tag mapped to its round; mutant killed |
| MR-7 | Research | `analyze.py` | Split-half printed −2,395 for round 2, and −32 for four near-equal cards | Spearman-Brown applied split by split | Fixed: not reported under four cards; corrected once, only when positive; two mutants |
| MR-8 | Research | `analyze.py` | "Beats today and placebo" printed for C4 on paying although that question failed its checks | Verdicts ignored the gates | Fixed: "not judged"; two mutants |
| MR-9 | Open | layout control | 9 of 9 confused after the rename | Placement, not wording | Handed over (section 13) |
| MR-10 | High | `marketing-copy.test.mjs` | Every claim check only found a string | Proof by presence, which AGENTS.md rejects | Fixed: behavioural spec, five browser mutants |
| MR-11 | High | `js/app.js` | The end-of-task ad was drawn between a routine's steps, against "nunca durante la práctica" | The routine was not checked before the ad | Fixed; MK19 |
| MR-12 | High | `value.anchor`, `pricing.proof3` (en), `lesson_anchor` | A Lima price shown as true everywhere | City dropped | Fixed: "en Lima"; MK17, MK18 |
| MR-13 | High | research doc, section 6 | A model stereotype presented as a finding about older people | Batched prompts, no age-swap control | Fixed: retitled with the batch evidence |
| MR-14 | High | `analyze.py` | Reliability came from the planted bad offer | Split-half over every card | Fixed: V3f; mutant |
| MR-15 | Med | `value.moment.trial_ending` | Implied progress is lost when the trial ends | Upsell written as loss | Fixed; MK14 |
| MR-16 | Med | age-label rule | Missed plural and official forms; caught harmless words | Hand-listed nouns | Fixed; MK13 |
| MR-17 | Med | guide | No warning against putting hoarseness down to age | The protective half of the older-adult memo was not shipped | Fixed; MK15, MK16 |
| MR-18 | Med | `pricing.sub` | Mentioned ads while there are none | Copy written against a stimulus artefact | Fixed |
| MR-19 | Open | "gratis, siempre"; paid rest days | Promise not in terms; paid streak relief | "Gratis, siempre" fixed by the owner's decision (softened; MK47, MK48); paid rest days still the owner's | Section 13 |
| MR-20 | Med | `start.step3sub` | "No necesitas cuenta" beside "Entrar" raised a sign-up-wall suspicion (7 of 9) | Reassurance that contradicts a visible control | Fixed; MK25 |
| MR-21 | Med | `meta.desc` | "si das la nota" is also an idiom for making a scene | Untested pun in the most widely shown line | Fixed; MK24 |
| MR-22 | Low | `tab.*` | The catalog's switch described the tracks differently from the picker | Two strings for one thing | Fixed; MK23 |
| MR-23 | Test | `marketing-claims.spec.js` | A time cap that spares the first day passed (Codex) | Only a first-day visitor was tested | Fixed: returning and heavy visitors; MK28 |
| MR-24 | Test | `marketing-claims.spec.js` | Audio in small text payloads or WebSocket frames passed (Codex) | Only large or audio-typed requests counted | Fixed: every byte, request and frame counted; MK26, MK27 |
| MR-25 | Test | `marketing-claims.spec.js` | An AdSense unit or another container passed (Codex) | One class looked for in one slot | Fixed: every ad form in every slot; MK29 |
| MR-26 | High | `js/app.js` | The end-of-task card stayed through the next take and into a routine started next | Nothing cleared it until the next ad decision | Fixed: cleared as a take starts and an exercise opens; MK30, MK31 |
| MR-27 | High | `js/ads.js` | Mid-routine, Historial and the home page drew ads | The gate looked at the live take only | Fixed: a routine under way counts as practice; MK32 |
| MR-28 | Test | `marketing-claims.spec.js` | The second red team's ways round the spec (section 11, second round) | Fixed visitors, a shortened take, automation marks that silence analytics, point checks | Fixed: spec rewritten; MK33–MK46 |
| MR-29 | Low | `css/styles.css` | The line over the title wrapped onto two lines at 360 px in CI | CI draws in DejaVu Sans, wider than Inter | Fixed: tracking 0.06em under 400 px; DS23 |
| MR-30 | High | `js/app.js` | A routine paused, its step taken anyway and Next pressed stayed paused, so Historial drew an ad in the middle of it | Starting a step did not resume the routine it belongs to | Fixed: `resumeRoutineOnStart`; MK55 |
| MR-31 | High | `js/analytics.js` | A pitch contour on an analytics event left the device; the worker dropped it only after it arrived | The worker's rules ran on the server alone | Fixed: the same rules in the browser before sending, tested against the worker's own code; PW1–PW7, MK41 |
| MR-32 | Test | promise tests | 47 of 48 changes on paths no visitor walked kept the promise tests green (section 11, third round) | Behaviour tests walk chosen paths only | Fixed: code-level guards, a wire filter and wider scenarios; PT, PV, PA and PN mutants, MK49–MK70 |
| MR-33 | Test | `marketing-claims.spec.js` | Seven time caps were reported as a bare timeout | Start's poll carried no message and did not look for a window | Fixed: Start names what it saw |
| MR-34 | Open | storage | Safari can clear a site's script-written storage after seven days of Safari use without user interaction on the site | Nothing asks for persistent storage, and whether asking helps is undocumented; a Home Screen web app keeps its own count and its HTML storage by WebKit's account, untested here | Section 13 |
| MR-35 | Test | `marketing-claims.spec.js` | A take sent five seconds after the page was hidden, takes pruned three seconds after it opened, and routine steps planned shorter all passed; the spec also sent analytics to the production worker | No clock ran after the hide or the restarts; the routine's expected length came from the code under test; no route for the worker's host | Fixed; MK68–MK70 |
| MR-36 | Test | `qa/promise-scan.mjs`, `promise-guards.test.mjs` | Fourteen ways round the guards (review of the third round): callbacks set on a property, methods on `this`, entry points not listed, speech recognition and other send spellings, a take read by its store's name, other sign-in spellings, an aliased AdSense push | The scanner named callbacks after their property alone and added no edge to them; the lists were written from the red team's own spellings | Fixed; PX1–PX11, PX13 |
| MR-37 | Test | `js/analytics.js`, two browser specs | The wire filter dropped an unknown event without a trace, and the checks of what the worker keeps read the filtered wire | The drift signal lived on the server, after the filter | Fixed: the plan checked against the worker's list in CI, the specs read events as raised; PX12, PX14, DS24, DS25 |
| MR-38 | Test | `marketing-claims.spec.js` | A take that drops every frame, a piano that stops part way, a silent "+30 s" or restart, and a send on an interval's later tick all passed | "Listening" read only whether the microphone was open, once; three takes were not heard at all; one jump fires an interval once | Fixed; MK71–MK75 |
| MR-39 | Test | `qa/promise-scan.mjs`, guards, spec | Sixteen gaps in those fixes (a skeptic's pass): inline click handlers off the path, fetch held by a default parameter, class field or destructuring, a sibling's `open`, AdSense by brackets or a helper, templated event names passed by prefix, the wire list changed outside its literal, a cap after the level meter, a piano booked but silent, a mutant the old spec already caught | Handlers were merged into their binders; the scanner knew fewer places a value is held; the spec read the first consumer and the piano's books | Fixed; PX15–PX24, MK76–MK78, MK71 moved to the fourth tick |
| MR-40 | Test | `marketing-claims.spec.js` | The first piano-output check failed on CI for an exercise that cues each target once, and passed a loop silent after its first pass | The take's minutes run in seconds of real time while the audio runs in real time, so the end heard the start's notes, or nothing | Fixed: sound at the start, wiring of every later note at the end, the page's clock stepped while waiting; MK78 |
| MR-41 | Test | `qa/promise-scan.mjs`, guards, spec, `js/tour.js` | Seventeen gaps in those fixes (a fourth red team): a take kept by one handler and sent by its sibling, the take store and private methods unchecked, handlers on held elements merged, caps in listed exceptions, in a wrapper handed to the daily loop or off the path entirely, the sale opened by its button's id, relays and templates that change an event, analytics.js skipped, AdSense through more holders, a reference that stops looping, a mode or highway fed nothing, and a record that named a head whose CI had failed | Naming handlers apart cut edges; names were tallied where they were walked; the guards checked the path, not who else reads the plan; the spec counted calls | Fixed; PX25–PX40, MK79–MK81 |
| MR-42 | Test | `qa/promise-scan.mjs`, guards, spec, `qa/mutate.mjs` | Seventeen gaps in those fixes (a fifth red team): the sale opened by other buttons, by its dialog's id or by the plan read off the page; the older sign-in unseen; a plan reader gating with an answer it held, or a new caller with none; "only the header" untrue; a name made in two functions; AdSense's queue through a helper's argument or a property; relays adding props through an alias, a helper or `props \|\| {}`, or handed on; the tour's event failing on honest edits; a mode, loop, highway and class each checked by a field or a call; a saved take not played; and a record that overcounted, named three browser sets of four, and overstated the handlers | The vocabulary was hand-written; counts pin names, not what is done with an answer; the template machinery keyed on spelling; the spec read fields and calls | Fixed; PX41–PX54, MK82–MK86, L63 |
