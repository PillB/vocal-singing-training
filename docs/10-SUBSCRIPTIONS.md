# Subscriptions & payments — operator guide (current)

**Stack:** Static SPA (GitHub Pages) · **Stripe Payment Links** (global) · **Mercado Pago** (Perú/LATAM) · soft local entitlement  
**Code:** `js/billing-config.js`, `js/billing.js` · **Hardening path:** `workers/stripe-webhook/`  
**Deep audit:** [`16-SUBSCRIPTION-TECHNICAL-ORCHESTRATION.md`](./16-SUBSCRIPTION-TECHNICAL-ORCHESTRATION.md) · [`SUBSCRIPTION-TECH-GAP-REGISTRY.md`](./SUBSCRIPTION-TECH-GAP-REGISTRY.md)

> Official (non-deprecated):  
> - Payment Links: https://docs.stripe.com/payment-links  
> - Webhooks + signatures: https://docs.stripe.com/webhooks  
> - Post-payment: https://docs.stripe.com/payment-links/post-payment  

---

## Architecture (what is / is not guaranteed)

| Layer | Behavior | Trust level |
|-------|----------|-------------|
| Hosted checkout | Card data never hits our origin (PCI SAQ-A style) | High (provider) |
| Return URL `?billing=success` | Client marks Pro in `localStorage` | **Soft** (forgeable without webhooks) |
| `session_id` on return | Required when `demoUnlockEnabled: false` | Soft mitigation |
| Webhook Worker (optional) | Verifies `Stripe-Signature`; source of truth | **Hard** |

**Never** put `sk_live_…` or `whsec_…` in client JavaScript.

---

## Plans (display)

| Plan | USD | PEN hint | EUR | Features (shipped) |
|------|-----|----------|-----|--------------------|
| Free | 0 | 0 | 0 | All exercises, highway, piano, plan, value pulse |
| Pro monthly | 9.99 | 35 | 9.99 | + export JSON, coach .txt, insights narrative |
| Pro yearly | 79 | 279 | 79 | Same + ~20% save + lesson-price positioning |

Prices in config are **display**; real charge = Stripe/MP product prices.

---

## Go-live checklist (Stripe) — step by step

### 1. Account & product

1. Create/login [Stripe Dashboard](https://dashboard.stripe.com).  
2. **Product catalog →** create product `Vocal Studio Pro`.  
3. Add **recurring** prices:  
   - Monthly (e.g. $9.99 / month)  
   - Yearly (e.g. $79 / year)  
4. Copy Price IDs if needed for later API work (not required for Payment Links alone).

### 2. Payment Links

1. **Payment Links → Create** ([docs](https://docs.stripe.com/payment-links/create)).  
2. Select the **monthly** recurring price → create link.  
3. Repeat for **yearly**.  
4. Note the URLs (`https://buy.stripe.com/...`).

### 3. After payment (success URL)

Configure each Payment Link → **After payment**:

**Recommended success URL pattern:**

```text
https://pillb.github.io/vocal-singing-training/?billing=success&plan=pro_monthly&provider=stripe&session_id={CHECKOUT_SESSION_ID}
```

Yearly:

```text
https://pillb.github.io/vocal-singing-training/?billing=success&plan=pro_yearly&provider=stripe&session_id={CHECKOUT_SESSION_ID}
```

Cancel / abandoned (optional):

```text
https://pillb.github.io/vocal-singing-training/?billing=cancel
```

- Enable “Pass the session ID” / `{CHECKOUT_SESSION_ID}` per [post-payment docs](https://docs.stripe.com/payment-links/post-payment).  
- App requires `session_id` (or `payment_id`) when `demoUnlockEnabled: false`.

### 4. Wire the app

Edit `js/billing-config.js`:

```js
demoUnlockEnabled: false,
requireCheckoutSessionId: true,
providers: {
  stripe: {
    links: {
      pro_monthly: "https://buy.stripe.com/YOUR_MONTHLY",
      pro_yearly: "https://buy.stripe.com/YOUR_YEARLY"
    }
  }
}
```

Commit → push `main` → wait for Pages build.

### 5. Verify

1. Open site → Pro → Subscribe (Stripe rail).  
2. Use [test cards](https://docs.stripe.com/testing) in test mode.  
3. Confirm return unlocks Pro pill + export.  
4. In DevTools: `VTBilling.getBillingHealth()` → `ok: true`.  
5. Run: `npx playwright test tests/billing.spec.js`.

---

## Go-live checklist (Mercado Pago · Perú / LATAM)

1. [Mercado Pago Developers](https://www.mercadopago.com.pe/developers) app (Peru).  
2. Create **subscription / preapproval plan** or Checkout Pro preference for monthly/yearly amounts (S/ 35, S/ 279 or your list).  
3. Set back/success URLs similarly:

```text
https://pillb.github.io/vocal-singing-training/?billing=success&plan=pro_monthly&provider=mercadopago&payment_id=… 
```

(Use MP’s documented return parameters; app also accepts `preapproval_id`.)  

4. Paste `init_point` / checkout URLs into `providers.mercadopago.links`.  
5. Test sandbox first.  
6. Later: configure **IPN/webhooks** with secret validation (do not trust return URL alone).

Hosts must be on the allowlist in `billing.js` (`buy.stripe.com`, `*.mercadopago.com*`, etc.). Override via `allowedCheckoutHosts` if needed.

---

## Runtime API (browser)

```js
VTBilling.getEntitlement()     // { pro, plan, status, source, expiresAt, … }
VTBilling.isPro()
VTBilling.can("export_progress")
VTBilling.startCheckout("pro_monthly", "stripe")
VTBilling.getBillingHealth()   // { ok, demoUnlock, links, portalConfigured, issues[] }
VTBilling.validateCheckoutUrl(url)
VTBilling.openCustomerPortal() // redirect to billing.stripe.com portal login
VTBilling.isPortalUrl(url)
VTBilling.linksConfigured()
VTBilling.trialDaysLeft()
```

### Feature flags (`can`)

| Feature | Free | Pro (paid/demo/trial) |
|---------|------|------------------------|
| all_exercises, pitch_highway, local_record, basic_plan, value_pulse | ✅ | ✅ |
| export_progress, coach_pack, pro_insights | ❌ | ✅ |
| multi_profile (≤3), studio_goals | ❌ | ✅ |
| pro_progressions (progPro1/2), achievements_export | ❌ | ✅ |

### What’s in Pro (shipped features)

| Feature | Description |
|---------|-------------|
| **Coach pack** | JSON + `.txt` summary + achievements + coach focus |
| **Multi-profile** | Up to 3 named practice slots (family / roles) |
| **Insights v2** | 28-day sparkline, hold trend, rule-based coach focus |
| **Weekly goals** | Set 3/5/7 sessions per week |
| **Pro progressions** | Extra piano packs `progPro1`, `progPro2` |
| **Achievements** | Earn free; export in coach pack (Pro) |

---

## Security model (honest)

| Attack | Mitigation |
|--------|------------|
| Open redirect on checkout | HTTPS + host allowlist |
| Plan id injection | Allowlist `pro_monthly` / `pro_yearly` |
| Forge `?billing=success` | Require `session_id` when demo off; **still soft** |
| Stolen Pro (localStorage) | Soft product; webhook + account for hard control |
| Secret key leak | Never ship secrets in SPA |

**Production upgrade path:** Cloudflare Worker webhook → verify signature → issue license / store status → client redeems. See `workers/stripe-webhook/README.md`.

---

## Customer cancel / upgrade (Customer Portal)

Official no-code portal: https://docs.stripe.com/customer-management/activate-no-code-customer-portal

### Step-by-step

1. Stripe Dashboard → **Settings → Billing → Customer portal**  
   (`https://dashboard.stripe.com/settings/billing/portal`).  
2. Click **Activate link** under “Ways to get started”.  
3. Configure cancel, payment-method update, invoice history as needed.  
4. Copy the **portal login link** (`https://billing.stripe.com/p/login/...`).  
5. Paste into `js/billing-config.js`:

```js
customerPortalUrl: "https://billing.stripe.com/p/login/YOUR_LINK",
```

6. Commit → push → open **Pro** pricing → **Gestionar suscripción / Manage subscription** (visible when Pro/trial + URL set).  
7. Customers log in with email + one-time code (Stripe-hosted).  

**API:** `VTBilling.openCustomerPortal()` · `VTBilling.isPortalUrl(url)` · health field `portalConfigured`.

Local “Clear Pro” remains internal-admin only (not a cancel path).

---

## QA / demo mode

| Flag | Effect |
|------|--------|
| `demoUnlockEnabled: true` | Empty links → demo Pro; success URL works without session_id |
| `demoUnlockEnabled: false` | Real links required; success needs session_id |

Internal auth can force Pro for testers (`docs/11-AUTH-AND-HARDENING.md`).

---

## Tests

```bash
npm run serve   # :8765
npx playwright test tests/billing.spec.js
```

---

## Ops metrics

- Checkout start → success rate (Stripe Dashboard)  
- Trial → paid (manual or later analytics)  
- Failed invoices / dunning (Stripe Billing)  
- `getBillingHealth().ok` false in production = misconfig  

---

## Markets → preferred rail

See `markets[]` in `billing-config.js` (PE→MP, US/EU→Stripe, …).

---

## File map

| Path | Purpose |
|------|---------|
| `js/billing-config.js` | Plans, links, flags |
| `js/billing.js` | Entitlement engine |
| `workers/stripe-webhook/` | Optional hard verification |
| `docs/16-…ORCHESTRATION.md` | Full technical audit |
| `docs/SUBSCRIPTION-TECH-GAP-REGISTRY.md` | Living gaps |
| `tests/billing.spec.js` | Regression |

---

## Recommended sequence

1. Live Stripe links + success URL with `session_id`  
2. Activate Customer Portal login link → `customerPortalUrl`  
3. `demoUnlockEnabled: false`  
4. Live MP for PE  
5. Webhook Worker for renewals/cancels  
6. Evaluate MoR (Paddle/Lemon Squeezy) if tax ops exceed bandwidth  
