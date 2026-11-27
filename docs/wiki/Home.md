# Vocal Studio project wiki

Versioned wiki source, updated 2026-11-27. **Not yet published to the GitHub wiki.**
Reconcile current remote pages before publishing; do not overwrite newer work.

- [Operations and recovery](Operations-and-recovery.md): where services live,
  what remains unknown and how to avoid confusing a replacement with migration.
- [Cloudflare deployment learned from PyArcana](../55-CLOUDFLARE-FRONTEND.md):
  deployed preview, public packaging, checks and account-migration gates.
- [Research and learning routes](Research-and-learning-routes.md): bounded
  lessons from PyArcana, existing integration points and scientific limits.
- [Release ledger](../54-RELEASE-LEDGER-2026-11-26.md): exact PR snapshots,
  root causes, fixes, regression evidence and remaining gates.
- [Recent-PR completion and red-team round](../60-FEATURE-COMPLETION-2026-11-27.md):
  pending integrated practice/layout fixes, concrete regressions and CI gates.
- [Issue context](../issues/README.md): checkout, portal and backend-recovery
  findings published as issues60–62; the index distinguishes historical drafts.

The canonical engineering contract is [AGENTS.md](../../AGENTS.md).
`agent.md` and `CLAUDE.md` point there. Changes to code, deployment, research
claims or ownership must update their evidence records in the same round.

Use precise status: **proposed**, **reproduced**, **fixed locally**, **CI
verified**, **deployed**, or **human/device verified**. A successful earlier
commit does not verify newer source. A skipped, cancelled, blocked or unrun
test is not a pass. Keep every trade-off and unfinished release gate visible.

Personal operator emails, resource IDs and credential recovery references are
in ignored private records. Never copy those records into a public wiki.
