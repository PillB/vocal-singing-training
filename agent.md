# Agent instructions

Canonical project instructions: [`AGENTS.md`](./AGENTS.md) at the repository
root (`vocal-singing-training/AGENTS.md`). Read and follow that file before
making changes. Audit status: `docs/40-PRODUCTION-AUDIT-2026-11-01.md`.

Per task and round: follow the falsifiable-test and preexecution/source-drift
contracts in `AGENTS.md`; run `npm run lint` (modified complexity <=15),
`npm run test:core`, focused browser tests and defect mutations.
Tautological tests are harmful: preserve the wrong-behavior counterexample.

Deployment ownership/recovery contract: `docs/53-DEPLOYMENT-OWNERSHIP-AND-RECOVERY.md`.
Keep ignored private ownership records current after account or deployment changes.
