# Subscription Technical Gap Registry

| ID | Gap | Severity | Status | Fix / next |
|----|-----|----------|--------|------------|
| ST-01 | Empty Stripe/MP payment links | P0 | **Open (ops)** | Paste live URLs in `billing-config.js` |
| ST-02 | `demoUnlockEnabled: true` | P0 | **Open (ops)** | Set `false` after links live |
| ST-03 | Soft forgeable checkout return | P0 | **Mitigated** | session_id required when demo off; host allowlist; webhook path |
| ST-04 | No live webhook signature verify | P1 | **Documented** | `workers/stripe-webhook/` |
| ST-05 | No in-app Customer Portal | P2 | Open | Dashboard Portal + link later |
| ST-06 | No proration UI | P2 | Accepted | Payment Links product-level |
| ST-07 | Incomplete session_id docs | P1 | **Closed** | `10-SUBSCRIPTIONS.md` updated |
| ST-08 | MP webhooks undetailed | P2 | Open | When PE revenue warrants |
| ST-09 | Billing health invisible in UI | P3 | Partial | `getBillingHealth()` + console |

## Change log
| Date | Note |
|------|------|
| 2026-07-16 | Registry created; ST-03 mitigated in code; ST-07 closed in docs |
