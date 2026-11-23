# Integration and skill practice — 2026-11-22

## Baseline and decision record

Main43374b7 already incorporated evidence PR36 and test-race PR49. Its quality
and Pages runs were successful; historical failed/cancelled/skipped runs are
not current failures. Read Claude PR descriptions and branch docs before
reconciliation. PR47/48/50 were individually green but conflicted with that
main and each other. Preserve their combined behavior, evidence36 and all
mutation jobs, rather than resetting to one branch's complete old tree.
Synthetic marketing research in PR48 is simulation, not human participants.

Alternatives considered before curriculum execution:

1. A separate curriculum engine and new song playback/scoring system would
   duplicate session persistence and add microphone/playback ownership races.
   Rejected without labeled musical data and physical-device evidence.
2. Extend the existing session sets, piano, recorder and bilingual song task.
   Selected:20 routines (10 per track),8 new routines,7 intent filters and3
   linked historical scores. Intent labels describe tasks, never competence.

The scores add pitch-memory, rhythm/entry and legato/breathing listening tasks.
They are familiar historical repertoire suggestions, not a verified popularity
ranking or evidence of superior/clinical effectiveness. Readers need basic
score literacy or their own familiar melody. No score images, modern lyrics,
arrangements or performances are copied; external archives require internet.
A/B loops remain generic accompaniment, explicitly not the score melodies.
Routine lengths are adjustable product defaults, not validated research doses.
Learners may rest, shorten, transpose or stop early. Any voice chooses a
comfortable key/octave; sex and low pitch do not establish safe tessitura.

## Independent findings and repairs

| Actual defect / root cause | Defense / falsifiable check |
| --- | --- |
| PR47 false pending-stage flags were removed by real true-only sync normalization | Separate true earned/seen keys; migrate legacy pending values before upload. Real mergeBag regression checks pending survival and seen wins in both merge orders. |
| Global practice-day totals were labeled days sung | Generic voice-practice share wording; speaking-only ledger cannot produce singing claim. |
| Unknown plausible stage keys could create phantom milestones | Validate exact area and stage membership; bogus area/999 negative fixture. |
| Warm-up dose and share privacy copy exceeded evidence | Remove universal sufficient duration; scope disclosure to shared summary. |
|1825day evaluation repeatedly recomputed immutable earned milestone predicates | Skip already-earned expensive predicates and rebuild the day summary only for actual news; preserve original60ms test rather than loosening it. Original PR47 also failed locally under load; runner variance is not evidence of a migration regression. |
| New short routines initially reused delayed speech/video review | Use immediate clear-speech/pace/song tasks, preserve v7's own workflow. |
| Song task forbade midphrase breathing and claimed low male keys protect voice | Bilingual comfort/pausing guidance; stable metric IDs with self-report labels. |
| Easy-onset task asked for hard glottal demonstrations | Gentle vowel starts, rest, stop cues; trace cannot measure fold closure. |
| macOS native select could override44px size | Salvage PR41 appearance/forced-colors fix and macOS WebKit positive/negative oracle, retaining newer main workflows. |
| Playwright project fixture strippedHOME required by browser dependency | Preserve legitimate home directory alongside isolated URL overrides; no app behavior change. |

Independent QA read all8 new cards in both languages against teaching claims,
exercise suitability and primary sources. Hashes in qa/evidence-ledger.json
record the exact wording. This is desk review, not instructor or user testing.

## Sources and boundaries

- [NIDCD voice care](https://www.nidcd.nih.gov/health/taking-care-your-voice): rest/avoid strain; no endorsement of these exact sequences.
- [Blanco et al.2021](https://pubmed.ncbi.nlm.nih.gov/34305739/): experimental pitch feedback; does not validate automatic artistic scoring or these song routines.
- [Dalla Bella et al.2016](https://pubmed.ncbi.nlm.nih.gov/26948385/): task/tempo/articulation matter; no universal gender-based key prescription.
- [Copyright Office Circular56A](https://www.copyright.gov/circs/circ56a.pdf): composition and recording rights are distinct; modern arrangements need separate consideration.
- [Frère Jacques old collection](https://hdl.handle.net/1802/13550): Lebouc/Augener ca1885 edition, not a claim about an1861 translation.
- [LOC discussion of Cole1800 Auld Lang Syne](https://blogs.loc.gov/teachers/2018/12/primary-sources-for-musical-learning-comparing-arrangements-of-auld-lang-syne/): catalog source linked; direct item access403 prevented inspection, so no specific pickup/notation asserted.
- [Aura Lea1861](https://levysheetmusic.mse.jhu.edu/collection/024/002): original has minstrel context; use wordless melody and do not import Love Me Tender lyrics/recordings.

US public-domain source qualification is not a worldwide legal guarantee.

## Red-team and drift rounds

| Round | Attack → defense → retest |
| --- | --- |
|1 malformed state | Valid-looking bogus stage/unknown skill → exact memberships and safe all-skills fallback → Node negative fixtures; markup in song task → escaping → executable-markup mutant. |
|2 state/sync | Pending stage union, stale seen device → earned/seen true flags → real sync regression both orders. No novel song audio engine introduced. |
|3 access/occlusion | Narrow cards/select/links and keyboard →44px targets, existing sheet focus trap → Chromium desktop/narrow and macOS WebKit suites. |
|4 scientific/numerical | Breath as capacity, trace as closure, sex as safe key, universal dose → explicit limits, independent bilingual readings → evidence/sets gates and mutations. |
|5 integration/privacy/CI | Conflicting workflow matrices/cache versions, source change/removed IDs → union all jobs, immutable asset stamps, catalog validation → lint/core and curriculum/path/browser mutants. |

Aesthetic passes are represented by desktop,360px mobile, keyboard/high-zoom
existing sheet suites, and bilingual/color/forced-colors coverage. Local
browser launch is blocked by macOS MachPortRendezvous SIGTRAP; local screenshots
or physical-device success are not claimed. GitHub CI must supply browser
results; outstanding human/acoustic checks remain release limits.

Future drift fixtures cover unknown skill tags, malformed stage keys, real
older false-stage migration, stale remote seen flags, missing catalog IDs
(existing set contract), edited research wording hashes and stale assets.
External score links may change; recheck their specific edition rather than
silently replacing a score with a modern copyrighted arrangement.

## Validation updates

The finalized local core suite passed1330 tests with0 new failures and2
pre-existing billing TODOs. All25 set,28 path and4 curriculum mutations were
killed, including the unchanged-summary control. Platform Chromium/WebKit
checks must run on the final tree; a queued run is not a passed run.

## Draft51 remains gated

Independent review reproduced: starting optional mic during guide playback
lacks reciprocal cancellation; retrying quota-failed Save increments one round
twice (n1/sec30 → n2/sec60); bf-breathflow has no explicit practice-area policy.
Physical Safari/acoustic, instructor/novice, bilingual and sync validation are
still open. Keep the draft unmerged until fixed and validated; green synthetic
CI does not close those gates. No claim that every feature is perfect or
production-ready is justified by this integration.
