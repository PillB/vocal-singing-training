# Update for existing issue29 — 2026-11-26

Historical draft below. It was superseded by the posted
[deployment/diagnoses update](https://github.com/PillB/vocal-singing-training/issues/29#issuecomment-7209423608).
Keep the draft's earlier limitations as history; current deployment results
are in docs55 and the latest issue discussion.

Canonical current context: [release ledger](../54-RELEASE-LEDGER-2026-11-26.md).
Main snapshot `8c87acc4627b0308bd19c5145fdce37ef1cd4e9c` includes PR52's
skill sets/song tasks and newer CI scheduling fixes. Catalog now has **52
exercises / 41 modes / 13 progressions**; old issue29 counts are historical.

PR53's exact saved head is green and targets the BreathFlow feature branch;
PR51 stays draft. PR55's saved head is green, but its combination with newer
main leaves `ops` mutations out of CI. This round reproduces the missing-set
failure and adds an isolated job, updated anchors and L67; matrix tests pass
and L64–L67 are killed. Its provisional 60s/mutant allowance needs hosted
measurement. Require CI on the combined commit before merge.

PR54 remains held: concurrent checkout can create separate recurring charges;
bearer-only license claim can grant another payer's billing portal. Context and
negative/positive oracles are saved in the neighboring issue drafts. Latest
saved head's checkout/accounts files match the reproduced head. Its latest
saved cancelled check is `browser (2)`; do not call it a billing failure.

The replica Worker is healthy at last probe, with new storage/key and events/
payments off. Frontend still uses the original. Original owner, key/data
recovery and backup/restore remain unresolved. Private emails and binding IDs
are kept outside public git.

- [ ] Fresh heads/checks, then exact combined-tree CI including ops timing.
- [ ] Merge deployment integration only after combined CI, then verify actual
  Pages HTML/all stamped assets and live Playwright at the deployed SHA.
- [ ] Fix and mutation-test both PR54 payment blockers before activation.
- [ ] Resolve original backend ownership/data/key recovery and authenticated
  destination checks before any frontend cutover.
- [ ] Physical iOS/audio, instructor/bilingual/user-flow validation and monitor
  alert drill remain required; no synthetic test closes them.
- [ ] Publish saved wiki and issue context without duplicating current issues.

This round's lint/catalog and focused matrix checks are verified; full core
stopped on sandbox `listen EPERM 127.0.0.1`. Remote approval review was blocked
by session usage limit. No new merge, issue posting, wiki publication or live
Playwright result is claimed.
