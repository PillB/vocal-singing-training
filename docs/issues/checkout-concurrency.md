# PR54: simultaneous checkout can create two paid subscriptions

Priority: high; payment-release blocker. Status: reproduced on `b791748`,
unfixed in the latest saved checkout source at
`48fb14bed099e3f4139c892ebb31b66a0f58fd9e`. PR:
https://github.com/PillB/vocal-singing-training/pull/54

## Reproduction and oracle

Using the existing local Worker/SQLite test harness and a provider stub, sign
in one account without an open subscription. Start two `/v1/me/checkout`
requests concurrently before delivering either payment webhook. Capture
provider request IDs. Deliver two valid signed `checkout.completed` events
for the returned checkouts and read linked subscriptions. No real purchase
or production account is involved.

Observed independent QA output:

```text
simultaneous checkout statuses [200, 200]
distinct provider request IDs 2
signed checkout webhook status 1 200
signed checkout webhook status 2 200
distinct linked subscriptions 2
nearby valid guard after webhook 409
```

Expected: concurrent/retried attempts cannot create separate recurring charges
for the same active purchase intention. The current post-webhook 409 is a
positive control, not protection for the earlier race.

## Diagnosis and alternatives

`handleCreateCheckout` reads linked subscriptions, then mints a new `vtr`
reference per request and calls the provider before persisting its checkout
reference. Two calls both pass the read. Frontend button disabling or an
isolate-local mutex cannot protect different tabs/devices/Worker isolates.

Use an atomic durable per-account pending purchase reservation and stable
provider `request_id` for the same attempt. Bind plan/currency/product to it;
retries must not mutate the purchase behind the same key. Do not expire an
uncertain provider request into a fresh charge without reconciliation. Define
abandonment/cancellation and late paid-event handling explicitly; local TTL
alone does not cancel an externally payable checkout. A provider failure or
lost response must expose an actionable pending/recovery state.

Trade-off: pending purchases require reconciliation and recovery UX; blindly
allowing another checkout is simpler but risks duplicate recurring billing.
The provider's [own reference](https://docs.creem.io/skills/creem-api/REFERENCE)
documents `request_id` for retry idempotency; this does not establish an atomic
per-account policy across different request IDs.

## Acceptance

- Concurrent requests across separate Worker handler instances create at most
  one payable purchase intent; provider calls share the durable attempt ID or
  one request is refused/pending.
- A lost response retries the same attempt; changed product/currency cannot
  reuse it silently. Independent accounts remain independent.
- Signed duplicate, inverted and late payment events cannot bind two recurring
  subscriptions through this race. Existing subscriber receives Manage/409.
- Expiry, crash after provider success, cancellation, abandonment and storage
  failure have explicit diagnostics and reconciliation tests.
- Regression is red on the current race and green on the fix; a mutation that
  removes atomic reservation must turn it red. Keep payment activation off
  until exact-head CI and sandbox-provider validation pass.
