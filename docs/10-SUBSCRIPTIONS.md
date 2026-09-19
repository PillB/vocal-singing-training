# Subscriptions & payments — operator guide (current)

**Stack:** Static SPA (GitHub Pages) · **Stripe Payment Links** (global) · **Mercado Pago** (Perú/LATAM) · **server-checked entitlements**  
**Code:** `js/billing-config.js`, `js/billing.js`, `js/license.js` · **Entitlement server:** `workers/entitlements/`  
**Deep audit:** [`16-SUBSCRIPTION-TECHNICAL-ORCHESTRATION.md`](./16-SUBSCRIPTION-TECHNICAL-ORCHESTRATION.md) · [`SUBSCRIPTION-TECH-GAP-REGISTRY.md`](./SUBSCRIPTION-TECH-GAP-REGISTRY.md)

> Official (non-deprecated, 2025–2026):  
> - Payment Links: https://docs.stripe.com/payment-links  
> - Post-payment + `{CHECKOUT_SESSION_ID}`: https://docs.stripe.com/payment-links/post-payment  
> - Webhooks + signatures: https://docs.stripe.com/webhooks · https://docs.stripe.com/webhooks/signature  
> - Customer Portal (no-code): https://docs.stripe.com/customer-management/activate-no-code-customer-portal  
> - MP Webhooks (prefer over IPN): https://www.mercadopago.com.pe/developers/en/docs/your-integrations/notifications/webhooks  

---

## Operator one-pager (go live in order)

| Step | Action | Done when |
|------|--------|-----------|
| 1 | Stripe product + recurring prices | Prices visible in Dashboard |
| 2 | Two Payment Links (monthly / yearly) | `buy.stripe.com/…` URLs |
| 3 | Success URL with `session_id={CHECKOUT_SESSION_ID}` | Template on each link |
| 4 | Deploy `workers/entitlements/` (KV + secrets) | `GET /v1/health` returns `ok: true` |
| 5 | Register the webhook endpoints in Stripe and Mercado Pago | Test event delivers 200 |
| 6 | `node workers/entitlements/scripts/generate-keys.mjs` → private key as worker secret, public JWK into `verification.publicKeyJwk` | Keys in place, private key never committed |
| 7 | Worker URL into `verification.apiBaseUrl` | `VTBilling.verificationConfigured()` true |
| 8 | Paste links into `billing-config.js` → `providers.*.links` | Non-empty strings |
| 9 | Activate Customer Portal login link → `customerPortalUrl` | `billing.stripe.com/p/login/…` |
| 10 | Commit → push `main` → Pages deploy | Live site uses new config |
| 11 | Real test-card checkout → Pro pill + export | Return shows “confirming”, then Pro |
| 12 | `VTBilling.getBillingHealth()` | `ok: true` (ideally `productionReady: true`) |

`demoUnlockEnabled` already ships `false`; leave it that way in anything public.

**Checkout stays closed** until steps 4–7 are done: `startCheckout()` refuses with
`mode: "verification_unavailable"` when links exist but entitlements cannot be verified,
so nobody pays for an account we cannot switch to Pro.

---

## Architecture (what is / is not guaranteed)

| Layer | Behavior | Trust level |
|-------|----------|-------------|
| Hosted checkout | Card data never hits our origin (PCI SAQ-A style) | High (provider) |
| Provider webhook → `workers/entitlements/` | Signature verified, entitlement stored in KV | **Hard** (source of truth) |
| Return URL `?billing=success&session_id=…` | Starts a license claim; grants nothing by itself | Hint only |
| License token (ES256, ≤72h) | Browser verifies the signature against `verification.publicKeyJwk` | **Hard** |
| `localStorage` entitlement record | Plan/provider for the UI; ignored unless a valid license backs it | None |
| Local free trial | Opt-in, per browser, no payment involved | Local by design |

Flow:

```
Stripe / Mercado Pago checkout
  → signed webhook → worker verifies → entitlement in KV
  → browser returns with session_id → POST /v1/claim → signed license token
  → js/license.js verifies signature, iss, aud, exp, status
  → VTBilling.getEntitlement() reports Pro
  → token re-fetched every 24h → cancel / dunning / revocation land within a day
```

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

Official: [Subscriptions](https://www.mercadopago.com.pe/developers/en/docs/subscriptions/overview) · [Webhooks](https://www.mercadopago.com.pe/developers/en/docs/your-integrations/notifications/webhooks) · [Back URLs](https://www.mercadopago.com.ar/developers/en/docs/checkout-pro/configure-back-urls)

> Prefer **Webhooks** over legacy **IPN** (MP documents IPN as discontinued path). Webhooks include a **secret signature** for origin validation.

### Step by step

1. Create a [Mercado Pago Developers](https://www.mercadopago.com.pe/developers) application (Peru / your country).  
2. Create a **subscription plan** (preapproval) or Checkout preference for monthly/yearly (display hints: S/ 35, S/ 279).  
3. Configure **return / back URLs** to your site (HTTPS; no localhost in production):

```text
success → https://pillb.github.io/vocal-singing-training/?billing=success&plan=pro_monthly&provider=mercadopago
failure → https://pillb.github.io/vocal-singing-training/?billing=cancel
pending → same as success or a “pending” page (soft Pro only after approved)
```

4. App accepts on return: `payment_id`, `preapproval_id`, or (with demo off) any of those as session-like ids. MP may also append `collection_id`, `status`, `preference_id`, etc. — `billing.js` strips common MP query keys after handling.  
5. Paste `init_point` / subscription checkout URLs into `providers.mercadopago.links` (`pro_monthly`, `pro_yearly`).  
6. Hosts must match allowlist (`www.mercadopago.com.pe`, `mpago.la`, …) or set `allowedCheckoutHosts`.  
7. **Sandbox first**, then production credentials.  
8. **Webhooks (hard path, recommended when PE revenue matters):**  
   - Dashboard → Your integrations → Webhooks  
   - Topics: `subscription_preapproval`, `subscription_authorized_payment`, payment status as applicable  
   - Validate MP secret signature server-side (never in SPA)  
   - Do **not** treat browser return alone as proof of payment  

### MP vs Stripe (this product)

| | Stripe | Mercado Pago |
|--|--------|--------------|
| Primary markets | US/EU/global cards | PE + LATAM |
| Hosted checkout | Payment Links | Subscriptions / Checkout Pro |
| Soft return param | `session_id` | `payment_id` / `preapproval_id` |
| Self-serve portal | Customer Portal login | MP account / bill emails |
| Hard verify | Stripe-Signature Worker | MP Webhooks + signature |

---

## Runtime API (browser)

`VTBilling.startTrial()` · `canStartTrial()` · `verificationConfigured()` · `getLicenseStatus()` · `refreshLicense()`
`VTLicense.claim({provider, sessionId})` · `refresh()` · `verifyToken(token)` · `getStatus()`

```js
VTBilling.getEntitlement()     // { pro, plan, status, source, expiresAt, … }
VTBilling.isPro()
VTBilling.can("export_progress")
VTBilling.startCheckout("pro_monthly", "stripe")
VTBilling.getBillingHealth()   // { ok, productionReady, demoUnlock, links, portalConfigured, issues[] }
// ok = !demo && linksConfigured; productionReady = ok && portalConfigured
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
| ad_free (no studio tips / ads when ads layer on) | ❌ | ✅ |

> Ads / native tips: off by default. See [`19-AD-MONETIZATION-ORCHESTRATION.md`](./19-AD-MONETIZATION-ORCHESTRATION.md) and `js/ads-config.js`.

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
| Forge `?billing=success` | Return URL grants nothing; a license must be claimed and verified |
| Hand-write `vt_billing_v1` in localStorage | Ignored — Pro needs a token signed by the worker's key |
| Copy a license token to another browser | Works until it expires (≤72h); the license id can be revoked server-side |
| Replayed / spoofed webhook | `Stripe-Signature` and MP `x-signature` verified over the raw body, 300s window, idempotent by event id |
| Spoofed Mercado Pago notification body | Body is never trusted; state is re-read from the MP API |
| Secret key leak | Secrets live only in worker bindings, never in the SPA |

**What this does not fix:** every Pro feature is computed in the browser, so someone
running devtools on their own machine can still reach them. The point of the server
check is that entitlements cannot be *forged, shared, or kept after cancellation* —
not that a static site becomes tamper-proof. Anything that must be truly protected
has to move behind the worker.

**If the worker is unreachable:** the browser keeps the token it already holds
until that token expires (≤72h), then drops to free. A paying customer therefore
survives a short outage; a longer one costs them Pro until the worker is back.
Raise `verification.revalidateHours` / the worker's `LICENSE_TTL_SECONDS` to widen
that cushion, at the cost of cancellations taking longer to bite.

`verification.required: false` turns all of this off and goes back to the old
forgeable behaviour. `getBillingHealth()` reports it as an issue.

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
| `demoUnlockEnabled: false` (shipped) | No demo button, internal accounts get no Pro, checkout needs a verified license |
| `demoUnlockEnabled: true` | Local QA build: demo Pro button, internal auth accounts carry Pro |
| `verification.required: false` | Legacy soft mode — the `?billing=success` return activates Pro directly (forgeable) |
| `trialRequiresOptIn: false` | Trial clock starts on first visit again (every browser silently Pro) |

Playwright uses neither switch in the shipped code: `tests/helpers/billing.js` either
mints a real ES256 license with a throwaway keypair or flips `demoUnlockEnabled` for
the page under test.

Internal auth can force Pro for testers in QA builds only (`docs/11-AUTH-AND-HARDENING.md`).

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
| `js/license.js` | License token verification + refresh |
| `workers/entitlements/` | Webhooks, entitlement store, license signing |
| `docs/16-…ORCHESTRATION.md` | Full technical audit |
| `docs/SUBSCRIPTION-TECH-GAP-REGISTRY.md` | Living gaps |
| `tests/billing.spec.js` | Regression |

---

## Recommended sequence

1. Deploy `workers/entitlements/` + keys → `verification.apiBaseUrl` / `publicKeyJwk`  
2. Live Stripe links + success URL with `session_id`, webhook endpoint registered  
3. Activate Customer Portal login link → `customerPortalUrl`  
4. Live MP for PE (webhook endpoint + access token)  
5. Watch `getBillingHealth()` and the worker's 400-rate on signature failures  
6. Evaluate MoR (Paddle/Lemon Squeezy) if tax ops exceed bandwidth  
