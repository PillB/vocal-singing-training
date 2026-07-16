# Subscriptions — Peru + Worldwide (ready to use)

## Strategy summary

This app is a **static SPA on GitHub Pages** (no server). The most straightforward, production-proven path is:

| Rail | Role | Best for |
|------|------|----------|
| **Stripe Payment Links** (recurring) | Primary global checkout | **US, EU (ES/DE/FR/IT), UK, CA, AU, MX, BR**, rest of world cards |
| **Mercado Pago** (Peru + LATAM) | Primary local rail | **Perú** (cards + local methods), AR/CL/CO/UY |

**Why not only one provider?**  
Peruvian and LATAM conversion is often higher with **Mercado Pago** (local UX, currency, trust). US/EU/UK coaches and learners expect **Stripe**. Supporting both maximizes revenue without building a custom PCI stack.

**Why Payment Links / Checkout (not custom Elements first)?**  
- Zero PCI burden on GH Pages  
- Subscriptions configured in dashboard UI  
- Success URL returns users to the app for local entitlement  
- Can add webhooks + serverless later for hard verification  

Optional later upgrade: **Paddle / Lemon Squeezy** as Merchant of Record if you want tax/VAT handled for you (higher fee).

---

## Market prioritization (vocal / singing online demand)

Based on online singing/vocal coaching demand patterns (YouTube/TikTok singing content consumption, English + Spanish creator economies, and LATAM mobile payment adoption):

### Tier 1 (launch first)
| Market | Why |
|--------|-----|
| **Perú (PE)** | Home market; MP local checkout; Spanish UX already default |
| **United States (US)** | Largest paid digital music-education ARPU |
| **México (MX)** | Large Spanish singing audience; Stripe + OXXO options |
| **España (ES)** | EU Spanish; strong amateur singing / theater market |
| **United Kingdom (GB)** | High willingness to pay for voice apps |

### Tier 2
Germany, France, Italy (EU EUR), Brazil, Argentina, Chile, Colombia, Canada, Australia.

### Tier 3 (English-language coach niches)
Philippines, India — large English online creator audiences; price sensitivity → yearly plan + trial.

Implementation maps each market → preferred **rail** in `js/billing-config.js`.

---

## Plans (default marketing prices)

| Plan | USD | PEN (hint) | EUR (hint) | Notes |
|------|-----|------------|------------|-------|
| Free | 0 | 0 | 0 | All core exercises, highway, mic, local record |
| **Pro Monthly** | **$9.99** | **S/ 35** | **€9.99** | Export, multi-profile, Pro insights |
| **Pro Yearly** | **$79** (~20% off) | **S/ 279** | **€79** | Best LTV |

Adjust amounts in Stripe/MP products; keep display numbers in `billing-config.js` in sync.

### Free vs Pro (product)

| Feature | Free | Pro |
|---------|------|-----|
| All vocal + singing exercises | ✅ | ✅ |
| Pitch highway / piano / mic | ✅ | ✅ |
| 12-week plan | ✅ | ✅ |
| **7-day Pro trial** (local) | ✅ once | — |
| Export progress JSON | — | ✅ |
| Multi-profile practice slots | — | ✅ |
| Pro insights badge + export tools | — | ✅ |
| Priority progression packs UX | soft | ✅ |

Core practice stays free so learners convert on outcomes, not paywalls on “Empezar”.

---

## Setup checklist (go live in ~30–60 min)

### A. Stripe (global)

1. Create account at [stripe.com](https://stripe.com) and activate country that can sell to your buyers.  
2. **Products →** create *Vocal Studio Pro* monthly + yearly recurring prices.  
3. **Payment Links →** create two links (monthly / yearly).  
4. Set **After payment →** redirect to:  
   `https://pillb.github.io/vocal-singing-training/?billing=success&plan=pro_monthly&provider=stripe`  
   (and yearly plan id accordingly).  
5. Paste URLs into `js/billing-config.js` → `providers.stripe.links`.  
6. Set `demoUnlockEnabled: false` when real links work.  
7. (Optional) Webhook `checkout.session.completed` → serverless function that stores customer email; client remains local-first for GH Pages.

### B. Mercado Pago (Perú / LATAM)

1. Create [Mercado Pago Developers](https://www.mercadopago.com.pe/developers) application (Peru).  
2. Create a **subscription / preapproval plan** or Checkout Pro preference for monthly/yearly.  
3. Set back_urls / success to the same `?billing=success&plan=...&provider=mercadopago` pattern.  
4. Paste `init_point` or plan checkout URL into `providers.mercadopago.links`.  
5. Test with MP sandbox credentials first.

### C. App config

```js
// js/billing-config.js
demoUnlockEnabled: false,
providers: {
  stripe: { links: { pro_monthly: "https://buy.stripe.com/...", pro_yearly: "..." } },
  mercadopago: { links: { pro_monthly: "https://www.mercadopago.com.pe/...", pro_yearly: "..." } }
}
```

Redeploy GH Pages (`main`).

---

## How entitlement works (current)

```
User opens Pricing → chooses plan + rail
  → Stripe/MP Payment Link (hosted)
  → success URL ?billing=success&plan=pro_monthly
  → VTBilling.activate() → localStorage vt_billing_v1
  → Pro features unlock in this browser
```

**Trial:** first visit starts a **7-day local trial** (`vt_billing_trial_started_v1`).  
**Demo unlock:** while `demoUnlockEnabled: true`, “Activar demo Pro” unlocks without payment (for QA).

### Security note (honest)

LocalStorage entitlements are **soft gates** (fine for early revenue + GH Pages).  
For hard enforcement (anti-share):

1. Cloudflare Workers / Vercel serverless webhook from Stripe/MP  
2. Issue signed JWT or license code  
3. App verifies signature before `export_progress` / multi-profile  

Documented path; not required to start charging.

---

## UI entry points

- Header **Pro** button (`#btn-pricing`) — always one click, no scroll  
- Pricing modal overlay (game-style, centered)  
- Region auto-detected; user can switch rail (Stripe vs Mercado Pago)  
- Status pill: Free / Trial / Pro  

---

## Tests

- Catalog regression includes billing DOM (`#btn-pricing`, `#pricing-modal`)  
- Unit-style entitlement checks in Playwright  
- Geometry capture includes pricing modal open state  

---

## Ops / metrics to watch

- Trial → paid conversion by region  
- Stripe vs MP share in PE/MX  
- Yearly attach rate  
- Churn (from Stripe dashboard)

---

## Internal test accounts

Friends/family + admins use **client auth** (see `docs/11-AUTH-AND-HARDENING.md`).  
Plaintext credentials: **`docs/INTERNAL-TEST-ACCOUNTS.md`** (gitignored).  
Generate: `npm run accounts:generate`

## File map

| File | Purpose |
|------|---------|
| `js/billing-config.js` | Plans, markets, payment link placeholders |
| `js/billing.js` | Entitlement, checkout, trial, export |
| `docs/10-SUBSCRIPTIONS.md` | This document |
| `index.html` | Pricing modal + Pro button |
| `css/styles.css` | Pricing modal (compact overlay) |
| `js/i18n.js` | ES/EN copy |
| `js/app.js` | Wire UI + soft gates |

---

## Value marketing (research-backed)

See **`docs/14-VALUE-MARKETING-AND-SUBSCRIPTIONS.md`** for Hormozi value equation, freemium benchmarks, ethical game psychology, Reddit competitive insights, feature validation, and funnel.

| Surface | Role |
|---------|------|
| Home **Tu estudio** | Free progress proof (competence) |
| Soft **value banner** | Milestone upgrade after success (never blocks Empezar) |
| Pricing **value stack** | Dream outcome + proof + lesson anchor + personal stats |
| Export pack | Pro: JSON + coach narrative |

## Recommended next 90 days

1. Live Stripe + MP links; disable demo unlock  
2. Email receipt via Stripe  
3. Webhook → optional license code email  
4. Promo codes (Stripe coupons) for PE launch (e.g. `PERU20`)  
5. Compare Paddle MoR if EU VAT overhead grows  
6. Measure trial→paid and soft-banner→pricing open rate  
