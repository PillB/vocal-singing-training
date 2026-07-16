# Subscription & Payment Technical Orchestration  
## Phases 0–6 · Current (non-deprecated) practices · Vocal Studio SPA

**Product:** Static SPA on GitHub Pages · Soft client entitlement + hosted checkout  
**Date:** 2026-07-16  
**Related:** [`10-SUBSCRIPTIONS.md`](./10-SUBSCRIPTIONS.md) · [`SUBSCRIPTION-TECH-GAP-REGISTRY.md`](./SUBSCRIPTION-TECH-GAP-REGISTRY.md) · `workers/stripe-webhook/`

---

# Phase 0 — Setup preamble & Current Best Practices Reference

### Pre-round research (2025–2026)
- Stripe Payment Links (no-code / low-code hosted checkout): https://docs.stripe.com/payment-links  
- Stripe webhooks + signature verification: https://docs.stripe.com/webhooks  
- Subscription lifecycle events (community 2025 summary): `checkout.session.completed`, `customer.subscription.*`, `invoice.paid|payment_failed`  
- MoR alternatives for tax-heavy markets: Lemon Squeezy / Paddle (~5% + MoR) vs Stripe processor model · e.g. [globalsolo 2026 comparison](https://www.globalsolo.global/blog/stripe-vs-paddle-vs-lemon-squeezy-2026)  
- Stripe vs Lemon Squeezy for indie SaaS: [vibecoder.me](https://blog.vibecoder.me/stripe-vs-lemon-squeezy-vs-paddle)

### Preamble
Establish **currently supported** patterns for subscription monetization on a **static site** (no Node server in production path).

### Best practices reference (operative)

| Topic | Current practice | Evidence |
|-------|------------------|----------|
| Checkout without PCI burden | **Hosted** Payment Links / Checkout — no card fields on origin | [Stripe Payment Links](https://docs.stripe.com/payment-links) |
| Recurring billing | Stripe Billing prices on Payment Links; Smart Retries | Payment Links + Billing docs |
| Webhooks | HTTPS endpoint; **verify `Stripe-Signature`**; raw body; return 2xx fast; idempotent | [Webhooks](https://docs.stripe.com/webhooks) |
| Source of truth | Stripe subscription status, not client localStorage alone | Webhook journals / Stripe docs |
| Static GH Pages | Soft entitlement + optional Worker for hard verify | Architecture constraint |
| Secrets | Never in client JS; Workers secrets / env only | Stripe keys best practices |
| Trials | Stripe trial on Price **or** local soft trial (we use local 7-day) | Product choice |
| Proration / portal | Customer Portal (Dashboard) for cancel/upgrade at scale | Stripe Billing Customer Portal |
| LATAM | Mercado Pago subscriptions / Checkout for PE | Regional GTM |
| MoR option | Paddle / Lemon Squeezy if VAT becomes ops burden | 2026 MoR comparisons |

### Architecture decision (this product)

```
[Browser SPA]
   ├─ Pricing UI (plans, rails)
   ├─ Redirect → Stripe Payment Link | Mercado Pago
   ├─ Return ?billing=success&session_id=…  → soft Pro (localStorage)
   └─ can("export_progress") soft gates

[Optional later]
   Stripe → Cloudflare Worker (signature verify) → license / KV
```

**Why Payment Links (not Elements first):** zero PCI on GH Pages, Dashboard-managed products, official post-payment redirects, coupons, Adaptive Pricing.

### Phase 0 retrospection
Payment Links + webhooks remain current. Full Billing API / Elements is overkill until multi-tenant accounts exist. Soft entitlement is honest for SPA stage; hard path documented.

---

# Phase 1 — Current Implementation Audit

### Preamble
Map code paths for subscription, tiers, checkout, docs.

### Inventory

| File | Role |
|------|------|
| `js/billing-config.js` | Plans, prices, rails, links, demo flag, session_id policy |
| `js/billing.js` | Entitlement, trial, checkout, health, host allowlist, export |
| `js/app.js` | Pricing modal, return URL handling, export dual-file |
| `docs/10-SUBSCRIPTIONS.md` | Operator go-live |
| `workers/stripe-webhook/` | Optional hard-verify template |
| `tests/billing.spec.js` | Regression |

### Flows (as implemented)

1. **Trial:** `ensureTrial()` on load → 7-day Pro soft  
2. **Demo:** `demoUnlockEnabled` → Activate demo Pro  
3. **Checkout:** `startCheckout` → validate HTTPS host → redirect  
4. **Return:** `handleReturnFromCheckout` → activate if success (+ session_id when strict)  
5. **Gates:** `can(feature)` soft Pro for export / insights / coach pack  
6. **Expiry:** `expiresAt` on local state; trial clock separate  

### Strengths
- Dual rail (Stripe + MP) region-aware  
- Plan id allowlist; checkout host allowlist  
- Honest Pro feature marketing  
- Playwright coverage  
- Billing health diagnostics  

### Issues found (pre-fix)
- Empty payment links  
- `demoUnlockEnabled: true`  
- Soft forgeable success URL (mitigated when demo off + session_id required)  
- No live webhook  
- Docs needed step-by-step session_id success URL  

### Phase 1 retrospection
Implementation is coherent for SPA soft-monetization; not production-hard without webhooks + live links.

---

# Phase 2 — Gap & Root-Cause Analysis

| ID | Gap | Severity | Root cause | Impact |
|----|-----|----------|------------|--------|
| ST-01 | Payment links empty | P0 | Not configured | No real revenue |
| ST-02 | demoUnlockEnabled true | P0 | QA default | Fake Pro / confusion |
| ST-03 | Soft success URL entitlement | P0 | No server secrets on GH Pages | Forge Pro without pay |
| ST-04 | No webhook / signature verify | P1 | No backend | Renewals/cancels not synced |
| ST-05 | No Customer Portal link | P2 | Was not wired → **fixed** | Cancel UX self-serve via portal login |
| ST-06 | No proration UI | P2 | Payment Links product-level | Acceptable early |
| ST-07 | Docs incomplete on session_id | P1 | Doc lag | Operator misconfig |
| ST-08 | MP webhook path undetailed | P2 | Focus on Stripe first | PE risk later |

### Phase 2 retrospection
ST-03 cannot be fully closed on pure static hosting; mitigated + Worker path.

---

# Phase 3 — Design of Improvements

| Gap | Design | Evidence |
|-----|--------|----------|
| ST-01/02 | Operator checklist; health API; docs | Config hygiene |
| ST-03 | `requireCheckoutSessionId` when demo off; host allowlist; never trust bare success | Stripe post-payment + security hygiene |
| ST-04 | Worker template + event list + CLI test | [Stripe webhooks](https://docs.stripe.com/webhooks) |
| ST-05 | Config `customerPortalUrl` + in-app **Manage subscription** + `isPortalUrl` allowlist | [No-code portal](https://docs.stripe.com/customer-management/activate-no-code-customer-portal) |
| ST-07 | Rewrite 10-SUBSCRIPTIONS step-by-step | Operator UX |
| ST-09 | Pricing modal health strip when `!getBillingHealth().ok` | Operator UX |

### Phase 3 retrospection
Design stays non-deprecated (Payment Links + webhooks). No Elements/PCI expansion.

---

# Phase 4 — Implementation (applied)

### Code (pass 1 — hardening)
- `billing.js`: host allowlist, `validateCheckoutUrl`, `getBillingHealth`, `linksConfigured`, strict session_id when demo off, demo revoked if flag false, safer activate metadata  
- `billing-config.js`: `requireCheckoutSessionId`, success URL with `{CHECKOUT_SESSION_ID}` documented  
- `app.js`: toast on checkout error; health log  
- `workers/stripe-webhook/README.md`: hard-verify path  
- Tests: host validation, health, strict success without session  

### Code (pass 2 — ST-05 / ST-09 Customer Portal + health UI)
- `billing-config.js`: `customerPortalUrl` (paste Stripe portal login link)  
- `billing.js`: `isPortalUrl`, `openCustomerPortal`, `getBillingHealth().portalConfigured`  
- `app.js`: `#btn-manage-billing` when Pro/trial + portal URL; `#pricing-health-note` when `!ok`  
- `index.html`: manage button + health note nodes  
- `i18n.js`: `pricing.manage`, portal toasts, health prefix (ES/EN)  
- Tests: portal allowlist + manage UI + health note  

### Docs
- This orchestration report  
- Gap registry (ST-05/ST-09 closed in wire)  
- Updated `10-SUBSCRIPTIONS.md` (portal step-by-step)  

### Phase 4 retrospection
Backward compatible when `demoUnlockEnabled: true` (default QA). Portal button stays hidden until operator pastes URL. Empty portal is a health **issue** but does not flip `ok` alone (still driven by demo + links).

---

# Phase 5 — Validation

- Playwright `tests/billing.spec.js` (incl. portal + health UI)  
- Manual matrix:  
  - demo on + empty links → demo activate  
  - demo off + empty links → unconfigured toast  
  - success without session_id + demo off → error  
  - success with session_id → Pro  
  - Pro + portal URL → Manage subscription visible; `openCustomerPortal()` redirects  
  - Pricing open + `!health.ok` → health note visible  

### Phase 5 retrospection
Iterate until suite green. Ops gaps ST-01/ST-02 remain intentional until live Payment Links.

---

# Phase 6 — Final report & recommendations

### Executive summary
Vocal Studio monetization is a **static-SPA soft entitlement** over **hosted checkout** (Stripe Payment Links + Mercado Pago). Hard anti-piracy requires the optional Worker webhook path. Code now enforces host allowlists, optional strict `session_id` returns, billing health diagnostics in UI, and an in-app Stripe Customer Portal entry point (config-driven).

### Gaps status

| ID | Status |
|----|--------|
| ST-01 Payment links empty | **Open (ops)** |
| ST-02 demoUnlockEnabled true | **Open (ops)** |
| ST-03 Soft forgeable return | **Mitigated** (session_id + allowlist) |
| ST-04 Live webhook | **Documented** (Worker template) |
| ST-05 Customer Portal | **Closed (wire)** — paste live URL |
| ST-06 Proration UI | Accepted (Portal / product-level) |
| ST-07 session_id docs | **Closed** |
| ST-08 MP webhooks detail | Open when PE warrants |
| ST-09 Health in UI | **Closed** |

### Before → after (this pass)

| Area | Before | After |
|------|--------|-------|
| Cancel / manage | Docs only | `#btn-manage-billing` → portal login |
| Portal config | Missing | `customerPortalUrl` + host checks |
| Health | Console only | `#pricing-health-note` in pricing modal |

### Operator sequence (this week)
1. Create Stripe products + Payment Links; success URL with `session_id`.  
2. Activate [no-code Customer Portal](https://docs.stripe.com/customer-management/activate-no-code-customer-portal); paste login link into `customerPortalUrl`.  
3. Set `demoUnlockEnabled: false`.  
4. Deploy Pages; verify `VTBilling.getBillingHealth().ok === true`.  
5. This month: Cloudflare Worker webhook for renewals/cancels.  
6. If VAT ops hurt: evaluate Paddle / Lemon Squeezy MoR.  

### Never
- Ship `sk_live` / `whsec` in client JS.  
- Treat `localStorage` Pro as hard DRM.

### Monitoring
- Checkout conversion (Stripe Dashboard)  
- Failed invoices / Smart Retries  
- `getBillingHealth().ok` false in production = misconfig  
- Portal usage (Dashboard)  

### Sources (current / non-deprecated)
1. https://docs.stripe.com/payment-links  
2. https://docs.stripe.com/webhooks  
3. https://docs.stripe.com/payment-links/post-payment  
4. https://docs.stripe.com/customer-management/activate-no-code-customer-portal  
5. https://docs.stripe.com/customer-management  
6. https://docs.stripe.com/no-code/customer-portal  
7. https://www.globalsolo.global/blog/stripe-vs-paddle-vs-lemon-squeezy-2026  
8. https://blog.vibecoder.me/stripe-vs-lemon-squeezy-vs-paddle  
