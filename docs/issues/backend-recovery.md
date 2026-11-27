# Establish original Worker ownership and recovery before frontend cutover

Status: open release gate; do not infer ownership from git authors or OAuth
client IDs. [Public topology](../53-DEPLOYMENT-OWNERSHIP-AND-RECOVERY.md).

The current app still points at the existing `vocalstudio-pe` Worker. A
separate selected-account replica was created and its D1/KV/JWK checks passed;
it has fresh state and a different signing identity. This is a replacement
environment, not a completed migration. The selected account's successful
empty inventory before provisioning does not refute the original service's
existence in another account.

Acceptance gates:

- Verify original Cloudflare membership/account and record owner/recovery refs
  in the ignored private inventory; public issue contains no private IDs/mail.
- Recover source D1/KV and signing-key backup references, or explicitly design
  consented re-enrollment/license recovery. Verify encrypted off-repository
  backup and a restore drill; temporary `/tmp` receipts are insufficient.
- Establish Google Cloud project IAM, authorized origins, admin sign-in and
  actual trial/progress/report behavior on the destination.
- Document source/destination SHA, versions, schema, rollback and data
  reconciliation; rollback of Worker code does not restore database state.
- Review frontend Worker URL/JWK/CSP/cache stamp changes together. Test an
  existing user/license/session, signed-out user and fresh user; do not silently
  treat a rejected old signature as expired paid access.
- Keep production traffic on the original until approved continuity/recovery
  gates pass. Payments/analytics remain independently gated.
- Configure health notifications and perform an actual alert drill. Last
  repository-variable inventory was empty; a workflow file is not an armed
  monitor.

See [Cloudflare D1 export/import](https://developers.cloudflare.com/d1/best-practices/import-export-data/)
for the data mechanism; it does not export Worker signing secrets or establish
ownership. Recovery policy must cover all three separately.
