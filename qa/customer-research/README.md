# Customer research: a synthetic concept test with semantic similarity rating

This folder holds the tools and data behind
[docs/48-CUSTOMER-RESEARCH-AND-MESSAGING.md](../../docs/48-CUSTOMER-RESEARCH-AND-MESSAGING.md):
a concept test of the site's marketing copy run on a **synthetic panel**, scored
with **semantic similarity rating** (SSR) as described by Maier et al.,
[*LLMs Reproduce Human Purchase Intent via Semantic Similarity Elicitation of Likert Ratings*](https://arxiv.org/abs/2510.08338)
(PyMC Labs and Colgate-Palmolive, 2025).

**What it is worth.** A ranking of message framings and a list of objections,
in the words of simulated respondents. It is a screen that decides what to put
in front of real people first. It is not a measure of what real people in Peru
or anywhere else will do, and nothing here was validated against human answers
about this product. The paper validated SSR on 57 personal-care surveys
(9,300 US respondents); voice training in Spanish is a different domain, and
the paper says plainly that SSR is only as good as the model's knowledge of the
domain and that subgroup results (gender, region) were not reliable.

## The method, as the paper has it and as we ran it

| Step | Paper (A.4) | Here | Why the difference |
|---|---|---|---|
| Respondent | LLM impersonates one human respondent with their age, gender, income, location, ethnicity | LLM impersonates one of 64 profiles: age, gender, location, a budget statement, occupation, what they'd train, experience, device | No human panel to mirror. The three screener facts are what a real concept test asks. Nothing psychographic, so the answer is not written into the persona |
| Exposure | One concept image per survey, monadic | One concept card per prompt, monadic; the same 64 profiles see every concept in separate prompts (matched) | Matched panel: a difference between concepts is not a difference in who was asked |
| Elicitation | "How likely are you to purchase the product?", reply briefly | Four questions: try it, pay for Pro after a week, what would put you off, what is it and for whom | Two intents to rate; objections and comprehension for the copy |
| Prompt | One respondent per call | Up to 8 respondents per call, same concept, same language, told to answer independently | Cost: 576 calls would take hours. Trade-off: answers in one call may converge or deliberately diverge. Measured: split-half reliability |
| Rating | Cosine similarity to 5 anchors, minus the minimum, normalised (eq. 8, ε = 0, T = 1), averaged over 6 anchor sets | Same equations (`ssr.py`), 6 anchor sets per question and language, written by a separate agent | Spanish answers are compared with Spanish anchors |
| Embeddings | OpenAI text-embedding-3-small | Three local multilingual models (mpnet, MiniLM, multilingual-e5-large), averaged; each alone as a robustness check | No OpenAI key here. The paper notes results depend on the embedding model, so we use three |
| Validation | KS similarity and correlation attainment against human test–retest | None against humans. Instead: controls (below), split-half reliability, a blind labelled holdout for the rating step, cross-model rank agreement | No human data exists yet. `docs/48` §10 says how to get it |

## Pre-registered rules (written 2026-11-21, before any answer was scored)

Primary rating: the pmf averaged over the three embedding models and the six
anchor sets for the answer's language and question.

Validity gates, all required before any concept is called better:

- **V1** the bad offer `N` (AI-coach hype, capped practice, card up front, US$14.99,
  English only) rates below today's copy `C0` on both questions, paired 95%
  bootstrap interval below zero. Otherwise the panel does not tell offers apart.
- **V2** half price `P` (today's copy, Pro at half price) rates above `C0` on
  paid intent. Otherwise the panel ignores price.
- **V3** split-half reliability of the concept means is at least 0.7
  (Spearman–Brown). Otherwise the ranking is noise.
- **V4** on the blind labelled holdout, SSR's rank correlation with the labels
  is above 0.6 for each question, language and model (`test_ssr.py`).

A framing **beats today** only if the paired interval of its difference from
`C0` is above zero **and** its difference from the placebo rewrite `C0p` is
above zero too. `C0p` says what `C0` says in other words; the repo's own design
test found simulated judges prefer almost any challenger
([qa/design-test/README.md](../design-test/README.md#honest-limits)), so beating
`C0` alone may be the reward for being new.

Segments (18–34, n = 26; 50+, n = 28) are reported with intervals and called
hypotheses, never findings. Gender and region are not analysed: the paper found
LLMs did not reproduce them.

The winning framing is chosen from several, so its score is biased upward
(winner's curse). Round 2 re-tests the copy actually shipped against `C0` and
`C0p` with fresh prompts before anything is claimed about it.

## Round 2 rules (written 2026-11-21, after round 1 was scored, before any round 2 answer was collected)

Round 1 ended with no framing beating today on either question, the "you are
not tone-deaf" reframe (C2) worse on trial intent, and paid intent failing its
gates (V1 on paid, V3 on paid). So the copy shipped is a clarity pass on today's
copy, not a new framing, and round 2 asks a narrower question: **is the shipped
first visit (F) at least as good as today's (C0)?**

- Same 64 profiles, concepts C0, C0p and F only, batch seed 2 (round 1 used 0),
  prompts written fresh into `prompts/r2/`.
- **Non-inferiority on trial intent**: F is "not worse" if the lower end of the
  paired 95% interval of F − C0 is above −0.10 (about the size of C2's harm in
  round 1, −0.11). F "beats today" only by the round 1 rule (above zero against
  both C0 and C0p).
- Paid intent is reported, but no decision rests on it: it failed its
  reliability gate in round 1.
- The comparison of C0 with C0p is re-run as a check on round 1: if C0p again
  rates no differently from C0, novelty alone does not move this panel.

## Files

| File | What |
|---|---|
| `ssr.py` | Equations 8 and 9 of the paper, anchor-set averaging, KS similarity |
| `test_ssr.py`, `mutate_ssr.py` | Tests, and six planted defects that each must turn them red |
| `panel.py` → `data/panel.json` | The 64 profiles (seeded, quota-sampled per age band) |
| `data/concepts-r1.json` | Round 1 concept cards, ES and EN, with the controls |
| `build_batches.py`, `write_prompts.py` → `prompts/` | The exact text each panel agent read |
| `data/anchors.json` | 6 anchor sets × 2 questions × 2 languages |
| `data/holdout-labelled.json` | 120 answers labelled 1–5, written blind to the anchors |
| `analyze.py` | Scoring, bootstrap intervals, gates, verdicts |
| `data/r*-responses.json`, `data/r*-results.json` | Raw answers and results |

## Running it

```sh
python3 -m venv .venv && .venv/bin/pip install fastembed numpy scipy
.venv/bin/python -m unittest qa/customer-research/test_ssr.py   # needs the models (~2.5 GB first run)
.venv/bin/python qa/customer-research/mutate_ssr.py             # every planted defect must be caught
.venv/bin/python qa/customer-research/analyze.py data/r1-responses.json data/r1-results.json
```

None of this runs in CI: it needs the embedding models and the answers come
from model calls. It is a research record, kept so the numbers in `docs/48`
can be checked and the study re-run.
