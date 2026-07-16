# Subscription Technical Gap Registry

| ID | Gap | Severity | Status | Fix / next |
|----|-----|----------|--------|------------|
| ST-01 | Empty Stripe/MP payment links | P0 | **Open (ops)** | Paste live URLs in `billing-config.js` |
| ST-02 | `demoUnlockEnabled: true` | P0 | **Open (ops)** | Set `false` after links live |
| ST-03 | Soft forgeable checkout return | P0 | **Mitigated** | session_id required when demo off; host allowlist; webhook path |
| ST-04 | No live webhook signature verify | P1 | **Documented** | `workers/stripe-webhook/` (raw body + constructEvent) |
| ST-05 | No in-app Customer Portal | P2 | **Closed (wire)** | `customerPortalUrl` + `#btn-manage-billing` — paste live portal URL |
| ST-06 | No proration UI | P2 | Accepted | Payment Links product-level / Portal switch plans |
| ST-07 | Incomplete session_id docs | P1 | **Closed** | `10-SUBSCRIPTIONS.md` |
| ST-08 | MP webhooks undetailed | P2 | **Closed (docs)** | Expanded MP section: webhooks over IPN, back_urls, params |
| ST-09 | Billing health invisible in UI | P3 | **Closed** | `#pricing-health-note` + console |
| ST-10 | Health `ok` vs portal readiness unclear | P3 | **Closed** | `productionReady = ok && portalConfigured` |
| ST-11 | MP return query params litter URL | P3 | **Closed** | `cleanUrlParams` strips collection_id, status, etc. |
| ST-12 | `can("ad_free")` missing | P3 | **Closed** | Mapped to Pro in `billing.js` |

## Change log
| Date | Note |
|------|------|
| 2026-07-16 | Registry created; ST-03 mitigated; ST-07 closed |
| 2026-07-16 | ST-05/ST-09 closed (portal UI + health strip) |
| 2026-07-16 | Re-orchestration: ST-08/10/11/12 closed; worker README 2026 refresh; operator one-pager |
