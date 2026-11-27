# Operations and recovery

Evidence snapshot: 2026-11-26. Canonical public inventory:
[deployment ownership and recovery](../53-DEPLOYMENT-OWNERSHIP-AND-RECOVERY.md).

| Component | Verified role | Important limit |
| --- | --- | --- |
| GitHub main / Pages | Source and static app at `pillb.github.io/vocal-singing-training/` | Main can advance before Pages finishes. Verify actual HTML and stamped assets, then live navigation. |
| Original `vocalstudio-pe` Worker | Current frontend's account/entitlement backend | Existence is established; original account owner/recovery is unresolved. Git authors and Google client IDs cannot resolve it. |
| Selected-account replica | Separate Worker with new D1/KV and signing identity | Health probes passed on its deployed source. Existing users, licenses and progress were not migrated. Frontend was not repointed. |
| Google OAuth | Public client configured | Client ID is not account ownership evidence. Verify Cloud project IAM/origins independently. |
| Payment/email/ads providers | Implemented alternatives and configuration points | Supported code does not prove an approved/configured operator account. Payment activation remains gated. |
| Local browser storage | Learner data and recordings on the browser origin | Not a server backup; origin changes and shared Pages quota matter. |

## Safe deployment and evidence

Use the reviewed `wrangler.sh` with the ignored private target record. It
fetches remote main and archives that exact SHA; combines only permitted
private identity/binding overrides with source policy; checks account,
subdomain, D1/KV membership, key continuity and rollback target; and verifies
actual deployed version/source and real binding reads. Plan is read-only.
Deploy requires the same checks again. It never interprets an API failure as
an empty account or a missing signing key.

Record source SHA, account/target, previous and actual new version, policy,
health/JWK result and rollback/backup references. Private receipts contain
operational evidence, not secret values. A stale deployment lock requires
inspection; an interrupted write is not permission to retry blindly.

The deployment lock is local and optimistic. Cloudflare cannot atomically
lock a different operator out between our last check and deployment. Use
one operator and inspect mismatches. Worker rollback does not reverse data
changes. A matching JWK is continuity evidence, not proof that an encrypted
private-key recovery backup exists.

## Recovery and release gates

Source account access, D1/KV exports, signing-key recovery and owner/recovery
membership must be verified separately. A new key cannot validate old
licenses. Before cutover, test existing and fresh users, sign-in, trial,
progress, reports, permission recovery and a real rollback/restore plan.
Keep the [backend recovery issue context](../issues/backend-recovery.md) open
until evidence exists. Health alarms also require configured recipients and
an actual alert drill; a YAML file alone is not monitoring.

After a Pages deployment, use the `Deployed Pages verification` workflow.
Compare deployed HTML/all stamped assets with its checked-out SHA, then run
live Playwright. Run CI on the exact integrated head first. Local browser
launch and localhost binding restrictions in this session remain explicit
test blockers, not permission to claim success.

Primary references: [Wrangler source configuration](https://developers.cloudflare.com/workers/wrangler/configuration/),
[secret semantics](https://developers.cloudflare.com/workers/configuration/secrets/),
[D1 import/export](https://developers.cloudflare.com/d1/best-practices/import-export-data/).
Research rechecked 2026-11-26. These explain platform mechanisms; none proves
ownership or completeness of this project's backups.

## Keeping this wiki current

Update versioned source alongside its code/ledger. Refresh remote pages before
publishing. GitHub's wiki is a separate Git repository; [official instructions](https://docs.github.com/en/communities/documenting-your-project-with-wikis/adding-or-editing-wiki-pages)
describe initial-page creation and subsequent clone/commit/push. Adjust links
that cross from wiki to source to the repository's canonical docs. Never mark
publishing complete until the remote page is read back. Do not use a different
API surface to bypass an approval-review failure or retry an uncertain write.
