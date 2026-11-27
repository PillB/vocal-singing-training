# Research and learning routes

Reviewed 2026-11-26. This page distinguishes inspected design, our proposed
adaptation, and evidence supporting vocal claims.

## PyArcana reference and inspection limits

The user supplied [PyArcana's optional web route](https://pyarcana.dev/#ruta-web).
The saved live HTML contains an optional-route link with a separate 31-item
counter beside the 52-section main course, and describes demonstration,
guided practice and independent work. It is useful design inspiration.
The hash-selected route is client-rendered: its detailed screen, interactions
and complete syllabus were **not verified** from that HTML. Local checkout
contents are not assumed to be the current deployed site. No browser usability
test or comparative learning outcome was established.

Deployment follow-up: the actual deployed client bundle was subsequently
inspected, including its static-Worker deployment lesson. See
[the implemented Cloudflare frontend](../55-CLOUDFLARE-FRONTEND.md) for the
specific deployment adaptation, evidence and limits. This does not retroactively
claim a browser interaction or learner-outcome test of PyArcana.

## Adaptation to the existing Vocal Studio architecture

Retain session sets as the sequence authority, the existing recorder/engine
for take ownership, and existing profile/day/sync stores for participation.
Do not create a second progress system, an independent microphone owner or an
automatic skill certificate. Existing implementation and source limitations:
[integration and skill practice](../52-INTEGRATION-AND-SKILL-PRACTICE.md),
[session sets](../47-SESSION-SETS.md), [Tu camino](../48-TU-CAMINO.md).

| Proposed pattern | Existing place / expert objection | Measurable acceptance before UI expansion |
| --- | --- | --- |
| Optional skill routes alongside the main routine | Filter and extend current sets; a separate route engine could lose resume/profile ownership | Switch skill, reload and return: original sequence/step survives; unknown/removed skill falls back without inventing completion. |
| Demonstration → supported attempt → independent transfer | Piano/reference and current exercise then song task; automated reference tone is not a human vocal demonstration | Learner can identify what to do and what feedback measures; independent phrase is assessed separately, without a guide being counted as mic evidence. |
| Explain prerequisites and the next action | Existing bilingual routine instructions and settings | Comfortable key/octave, optional rests and a clear exit/retry remain visible at narrow widths, zoom and keyboard focus. No hidden hard prerequisites based on sex or guessed voice type. |
| Keep a useful practice artifact | Existing local recordings and self notes, with consented export | Revisit/compare an actual saved take, handle refused storage and profile handover, explain what remained local. No cloud upload implied. |
| Distinguish participation from learning | Day ledger/logros already represent practice | A completed timer or song rating cannot produce a mastery/clinical claim. Unknown detector confidence is not a bad voice score. |

These are design hypotheses, not newly shipped UI. Compare them with current
flows in short observed sessions before adding interface complexity. Log
misunderstood instructions, next-action errors, recovery success and perceived
effort; do not treat simulated personas as participants or automatically infer
causation from an A/B arm with no prespecified outcome/sample plan.

## Voice evidence and boundaries

[Titze 2006](https://pubmed.ncbi.nlm.nih.gov/16671856/) models the physical
rationale for semi-occlusion; it does not validate the app's routine duration
or every singer's response. [Dargin et al.](https://pubmed.ncbi.nlm.nih.gov/26390961/)
observed four singers with differing responses across SOVT tasks. This small
case series supports caution, not a universal safe prescription. A
[2025 randomized trial](https://pubmed.ncbi.nlm.nih.gov/39909787/) in 26 voice
professionals/students with fatigue found some immediate improvements while
connected-speech indices did not show comparable changes. That population,
intervention and endpoint do not establish healthy singers' song transfer or
long-term benefit from these short app sets.

Our inference: assess a comfortable real phrase separately from drill
participation, offer alternatives/rest, and abstain from medical or anatomical
diagnosis. Do not prescribe stronger adduction, longer holds or more effort
from a pitch trace. Follow [NIDCD voice-care guidance](https://www.nidcd.nih.gov/health/taking-care-your-voice)
and obtain qualified clinical help for persistent voice problems. No universal
minutes-to-warm-up, gender-based protective key or automatic artistry score
is supported by these sources.

Historical score links add phrasing, entries, text/rhythm and independent
listening tasks. Existing selections are repertoire suggestions, not a
verified popularity ranking. A composition, arrangement and recording have
separate rights; [Copyright Office Circular56A](https://www.copyright.gov/circs/circ56a.pdf)
explains the composition/recording distinction. US public-domain provenance
does not establish worldwide permission. Do not substitute modern lyrics or
recordings when an archive link breaks. Wordless practice and comfortable
transposition remain available to any voice.

## Future drift and falsifiable review

Exercise removed or renamed → validate routine IDs at authoring/CI and give
a safe resume route; never credit an absent task. Skill tag renamed → validate
known tags and retain safe browsing. Old/new clients sync → test both merge
orders, false/true legacy flags and profile handover. Research link removed →
mark source unavailable and re-review the actual claim, without pretending a
similar title is the same evidence. Cached assets differ → fail release
verification with the asset/URL rather than accept a superficially healthy page.

The existing catalog, curriculum, session-set, voice-path and evidence tests
cover these contracts; add a behavioral regression and planted defect for any
new behavior. External teaching ideas are hypotheses until tested with the
relevant learners, voices and devices. Sources are dated evidence, not a
promise that every feature is production ready.
