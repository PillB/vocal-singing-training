# Peru operator runbook — trámites, accounts and keys, in order

Everything Pablo has to do himself, in the order it has to happen, with what
each step unblocks. The code is already written and tested; nothing in this
document is a coding task.

Work top to bottom. Stages 1–3 need no Peruvian paperwork and can be done in an
evening. Stage 4 is where the trámites start.

> **Status of the numbers in this document.** Fees, tax rates and free-tier
> limits change. Each one is marked with where it came from and when it was
> checked. Anything unverified says so. Do not treat the tax section as tax
> advice — it is a list of things to ask a contador about.

---

## Stage 0 — Decide what you are selling

Before any account exists, settle three things, because the rest of the setup
hard-codes them.

| Decision | Recommendation | Why |
|---|---|---|
| Price in Peru | S/ 25–30 per month | Below a gym membership, above "not serious". Note the fee cliffs in stage 5: at S/ 19.90 a Culqi charge costs 17.6% in commission alone. |
| Price abroad | USD 7–10 per month | The fixed fee per charge dominates below $7. The same provider that takes 7.9% at $10 takes 11.9% at $5. |
| Annual option | Yes, at ~10 months' price | **The biggest lever you have.** One charge a year pays the fixed fee once instead of twelve times, on every rail. |
| Trial | One month, one per account | Already built. `TRIAL_DAYS` in `wrangler.toml`. |

Write these down. They become the Mercado Pago plan, the merchant-of-record
product, and the strings in `js/billing-config.js`.

---

## Stage 1 — Cloudflare: the backend

Free. No Peruvian paperwork. Do this first, because everything else pastes keys
into it.

1. **Create a Cloudflare account** at dash.cloudflare.com. Email and password;
   no company, no domain needed.
2. **Install wrangler and log in**:
   ```bash
   npm install -g wrangler
   wrangler login
   ```
3. **Create the KV namespace** (this holds paid subscriptions):
   ```bash
   cd workers/entitlements
   wrangler kv namespace create ENTITLEMENTS
   wrangler kv namespace create ENTITLEMENTS --preview
   ```
   Paste the two printed ids into `wrangler.toml` where it says
   `TODO_REPLACE_WITH_KV_NAMESPACE_ID`.
4. **Create the accounts database**:
   ```bash
   wrangler d1 create vocal-studio-accounts
   ```
   Paste the printed `database_id` into `wrangler.toml`. There is no migration
   step: the worker creates its own tables on first use.
5. **Generate the signing key**:
   ```bash
   node scripts/generate-keys.mjs k1
   ```
   It prints two things. The **private key** goes in the next step and nowhere
   else — not in the repo, not in a chat message, not in a note file. The
   **public JWK** goes into `js/billing-config.js` in stage 6.
6. **Store the private key as a secret**:
   ```bash
   wrangler secret put LICENSE_PRIVATE_KEY_PKCS8_B64
   ```
7. **Set `ADMIN_EMAILS`** in `wrangler.toml` to your own email. This is what
   makes the gifting panel appear for you and nobody else.
8. **Deploy**:
   ```bash
   wrangler deploy
   curl https://<your-worker>.workers.dev/v1/health
   ```
   The health response should say `accountsConfigured: true`. It prints
   booleans only, never key material.

**What this unblocks**: nothing works without it. After this step the worker is
live but has no way to sign anybody in and no way to take money.

---

## Stage 2 — Sign-in: email codes and Google

Free. No Peruvian paperwork.

### 2a. Transactional email (the six-digit codes)

The worker speaks Resend, Brevo and MailerSend — one HTTP call, no SMTP, which
is what a Worker can do.

1. Create an account with one of them.
2. **Verify a sending domain.** You need a domain you control. If you do not
   own one yet, buy one now (a `.com` is roughly USD 10–15 a year) — it is also
   what stage 6 uses to make the site look like a product rather than a GitHub
   URL.
3. Add the DNS records the provider gives you: SPF, DKIM, and ideally DMARC.
   Codes that land in spam are the single most common reason sign-in "doesn't
   work".
4. Create an API key.
5. Set it:
   ```bash
   wrangler secret put RESEND_API_KEY      # or BREVO_API_KEY / MAILERSEND_API_KEY
   ```
6. In `wrangler.toml` set `EMAIL_PROVIDER`, `EMAIL_FROM` (an address at the
   verified domain, e.g. `hola@tudominio.com`) and `EMAIL_FROM_NAME`.

If `EMAIL_PROVIDER` is empty, the worker **refuses** to pretend: email sign-in
is reported as unavailable rather than silently dropping codes.

### 2b. Google Sign-In

1. Go to Google Cloud Console → create a project.
2. Configure the **OAuth consent screen**: External, your app name, your
   support email. For plain sign-in you are only asking for basic profile and
   email, which does not require Google's verification review.
3. Create an **OAuth 2.0 Client ID**, type **Web application**.
4. **Authorized JavaScript origins** must list the exact origin the site is
   served from, with no path and no trailing slash:
   - `https://pillb.github.io`
   - `http://127.0.0.1:8765` (so you can test locally)
   - your custom domain, once stage 6 gives you one.
5. Paste the client id into `GOOGLE_CLIENT_ID` in `wrangler.toml`. It is public
   by design — it ships in the page.
6. `wrangler deploy` again.

**What this unblocks**: people can now sign in, and their practice follows them
between devices. You can gift months. Still nobody can pay.

---

## Stage 3 — Test the whole thing before any paperwork

Do this before the trámites, so you find out whether the product is worth the
registration effort.

1. In `js/billing-config.js` set `verification.apiBaseUrl` to the worker URL and
   `verification.publicKeyJwk` to the public JWK from stage 1.
2. Commit and push; GitHub Pages redeploys.
3. Open the site, sign in with your email, and check the code arrives.
4. Open **Cuenta** → you should see the gifting tools, because your address is
   in `ADMIN_EMAILS`.
5. Gift yourself 30 days, confirm Pro turns on, then revoke it and confirm Pro
   goes away on reload.
6. Mint a gift code and give it to a tester. This is the friends-and-family
   flow, working, with no payment provider involved at all.

**You can run the whole beta from here.** Gifted months need no RUC, no
gateway and no fees. Only charging strangers does.

---

## Stage 4 — SUNAT: RUC and régimen

This is the first step that cannot be undone in an evening, and the first that
a Peruvian payment gateway will ask for.

> Not advice. Peruvian tax law changes often and SUNAT's own pages contradict
> each other in places. Take this to a contador colegiado — one paid hour is
> cheap next to being in the wrong régimen for a year.

### The régimen is decided for you, and it is the RMT

SUNAT requires you to **choose the régimen before you register**, not during.
For this business the choice is narrower than the usual four:

| Régimen | Verdict for a SaaS |
|---|---|
| **Nuevo RUS** | **Cannot issue facturas** — only boletas. So you could never invoice a merchant of record abroad. Also capped at S/ 8,000 a month of income. Out. |
| **RER** | **Legally excluded.** Article 118 of the Ley del Impuesto a la Renta names "programación informática, consultoría de informática y actividades conexas" and "edición de programas de informática y de software en línea" among the activities barred from the RER. Out. |
| **RMT (Régimen MYPE Tributario)** | **This one.** Ceiling is 1,700 UIT of net annual income — with UIT 2026 at S/ 5,500 that is S/ 9,350,000, which you will not hit. Monthly pago a cuenta is 1.0% of net income while annual net income stays under 300 UIT. Annual income tax is 10% up to 15 UIT and 29.5% above. |
| Régimen General | The fallback only if you exceed 1,700 UIT. 29.5%, no ceiling. |

Declare the CIIU activity accurately — the software CIIU is precisely what
triggers the RER exclusion, so getting it "helpfully" wrong to stay in the RER
is not a shortcut, it is a misdeclaration.

### Registering

1. **Get the RUC "con negocio"** (rentas de tercera categoría — *not* a
   trabajador-independiente RUC issuing recibos por honorarios). Online 24/7 at
   SUNAT Virtual or through the App Personas SUNAT with your DNI, or in person
   at a Centro de Servicios al Contribuyente with your RENIEC DNI plus proof of
   the domicilio fiscal if it differs from the DNI address.
2. **Get your Clave SOL.** It is the key to every later filing: Declara Fácil
   621, the free invoicing portal, and SIRE.
3. **You are an electronic issuer from day one.** Resolución de
   Superintendencia N° 000075-2026/SUNAT, in force 1 June 2026, designates new
   RUC registrants in RMT, RER or Régimen General as emisores electrónicos from
   the day of inscription, and requires the sales and purchase registers in
   SIRE from the moment the obligation arises. There is no grace period to plan
   around.

### Invoicing, which is the real workload

- **Peruvian customers → a boleta de venta electrónica for every charge**, with
  18% IGV in the price. Capture the buyer's document type and number on any
  charge over S/ 700. Only charges of S/ 5.00 or less may be consolidated.
- **Foreign customers, or the merchant of record → a factura de exportación**,
  no IGV. Exports of services are not affected by IGV under Article 33 of the
  Ley del IGV, but only when four requirements hold at once: the service is
  provided for consideration from Peru to abroad and evidenced by the
  comprobante, the exporter is domiciled in Peru, the user is non-domiciled,
  and the use of the service happens abroad.
- **Issuing options**: SEE-SOL is SUNAT's free web portal, needs only your
  Clave SOL and no digital certificate, and can invoice a buyer with no RUC —
  so it covers the export invoice. It is one invoice at a time. Automating a
  boleta per subscription charge realistically means SEE del Contribuyente
  (buy a digital certificate) or an OSE/PSE you call from the billing webhook.
- **Keep every purchase factura with IGV** — hosting, domain, laptop, internet,
  the contador. As an exporter that input IGV becomes your Saldo a Favor del
  Exportador and can be offset against other taxes rather than lost.

### Monthly, forever

- **Declara Fácil 621** (IGV–Renta mensual) through SOL, on the cronograma for
  your last RUC digit. One form covers the IGV and the RMT pago a cuenta.
- **SIRE** (sales and purchase registers) is a separate monthly filing on top.
- **An annual return**, which the RMT requires and the RER and NRUS do not.

### Three questions to put to the contador, in these words

1. When a merchant of record resells my subscription to somebody **in Peru**,
   is that slice still an exportación de servicios? Requirement (d) says the
   service must be used abroad, and no SUNAT pronouncement on merchant-of-record
   resale of SaaS was found. This is the genuinely unsettled one.
2. Do I invoice the merchant of record for the **gross** subscription value or
   the **net** payout after its fees? Neither SUNAT nor the providers address it.
3. Is prior inscription in the **Registro de Exportadores de Servicios** still
   required? The phrase is absent from the Article 33 text currently published
   on SUNAT's legislation site, but SUNAT's own orientation pages and the
   PromPerú guide still describe it as a requirement. Registration is free and
   immediate, so doing it removes the risk either way.

**What this unblocks**: Mercado Pago Perú, and every local gateway.

---

## Stage 5 — Payments

Two rails: Mercado Pago for Peru and LATAM, a merchant of record for everyone
else. Both sit behind the single provider interface already in the repo, so
adding or swapping one is a webhook handler and a config entry.

### Peru and LATAM → Mercado Pago Perú

This is the one to set up first, because it is the market you know and the one
you can be paid in soles from.

What is confirmed from Mercado Pago's own documentation:

- **Suscripciones is available in Peru.** The developer docs list Peru in the
  supported set (AR, BR, CL, CO, MX, **PE**, UY), and the Peru reference for
  `POST /preapproval_plan` shows `"currency_id": "PEN"` in both the request and
  the response.
- **Charging really is automatic.** Mercado Pago's Peru page says it outright:
  *"Nos encargamos de los cobros y si algún pago es rechazado, hacemos nuevos
  intentos."* A rejected instalment is retried up to four times over ten days,
  and three consecutive failures cancel the subscription and email you.
- **The buyer needs no Mercado Pago account and you need no website** for the
  hosted flow.
- **Peru accepts DNI, CE and RUC** as payer document types.
- The API is `POST/GET/PUT https://api.mercadopago.com/preapproval` and
  `.../preapproval_plan`, plus authorized-payment endpoints for reading each
  generated charge. There are three mutually exclusive contracts — with-plan,
  without-plan-authorized, without-plan-pending — and mixing them is the classic
  integration mistake. Any flow that saves a card must tokenize it with
  CardForm or the Card Payment Brick; never collect raw card numbers.

Its fee in Peru is **3.29% + S/ 1 + IGV** with the money released after 14
business days, or **3.49% + S/ 1 + IGV** released instantly. No affiliation fee,
no monthly fee.

Not confirmed, so check it when you register: **whether a *persona natural con
negocio* (RUC tipo 10) can open the seller account.** The Peru signup offers a
personal account with DNI and a business account with RUC, and the link-de-pago
product page says a free account is all you need — but no official page names
RUC-10 as an accepted seller profile, and several Mercado Pago Peru help pages
refuse to load from outside the country. Culqi and Openpay both state plainly
that they take a RUC 10, so if Mercado Pago turns out not to, they are the
fallback.

One thing that will bite if you miss it: **the bank account you withdraw to must
be in your own name** — the Mercado Pago account holder and the bank account
holder have to be the same person.

Steps:
1. Create a seller account at mercadopago.com.pe.
2. Add your Peruvian bank account (CCI) for payouts, in your own name.
3. In the developer panel, create an **application**, take its **Access Token**
   and **Public Key**, and point a **webhook** at
   `https://<your-worker>.workers.dev/v1/webhooks/mercadopago`.
4. Store the secrets:
   ```bash
   wrangler secret put MP_ACCESS_TOKEN
   wrangler secret put MP_WEBHOOK_SECRET
   ```
5. Create a subscription plan at your soles price, put its checkout URL into
   `js/billing-config.js` under the `mercadopago` rail, and its plan id into
   `MP_PLAN_PRO_MONTHLY`.

### The other Peruvian gateways, and why your price decides

Mercado Pago is not the only local rail, and at a S/ 20–30 ticket the choice is
decided by **fixed fees, not percentages**.

| Gateway | Cost | Recurring? | Gets a RUC 10? | Note |
|---|---|---|---|---|
| **Mercado Pago** | 3.29% + S/ 1 + IGV at 14 business days, or 3.49% + S/ 1 + IGV instant. No affiliation or monthly fee. | Yes, `preapproval` | Peru accepts DNI/CE/RUC; RUC-10 not confirmed | Cheapest per charge below about S/ 60. |
| **Culqi** | 3.44% + USD 0.20, IGV-exempt — **but a minimum of S/ 3.50 on anything under S/ 87.72**. S/ 0 affiliation, T+2. | Yes, Plans + Suscripciones, charged on Culqi's own daily batch | Yes — its price list has separate RUC 10 rows, and its contract names *persona natural* | That S/ 3.50 floor is **11.7% on S/ 29.90 and 17.6% on S/ 19.90**. Only worth it above S/ 88, or billed annually. |
| **Openpay (BBVA)** | Max 3.44% + IGV, S/ 0 affiliation and maintenance, daily deposits including weekends | Yes, Plans + Subscriptions | Yes — BBVA says outright "con tu RUC y DNI" | The best fallback. Worth getting approved before you need it. |
| **Izipay** | 3.44% + IGV, S/ 0 to start, next business day | Tokenized recurring exists but **support has to enable it on your account** | Reported yes | Not self-serve for recurring, so not a day-one choice. |
| **dLocal Go** | 2.99% + 18% local tax ≈ 3.53%, **no fixed fee at all**, no setup, no monthly | Yes, built-in Subscriptions | Yes — explicit sole-proprietor document path | Lowest rate with no fixed fee, so best on small tickets. But funds are held 7 days and it settles in your company country's currency: verify both before committing. |
| **Niubiz** | Reported ≈ S/ 300 setup + S/ 50/month before a single sale | "Pago Programado" exists | Reported yes | A fixed S/ 900 a year is wrong at your size. |
| **Kushki** | Not published, and it imposes a **monthly minimum billing** | Yes, well documented | — | The minimum disqualifies a sub-100-subscriber operator. |

Two consequences worth acting on:

1. **Below about S/ 60 a month, Mercado Pago is cheaper per charge than Culqi**,
   because Culqi's S/ 3.50 floor bites. Above S/ 88, Culqi wins. If you price at
   S/ 25, do not reach for Culqi first.
2. **Bill annually wherever you can.** One S/ 250 charge pays the fixed fee once
   instead of twelve times. At these price points that is the single biggest
   lever you have, bigger than the choice of gateway.

### Yape and Plin cannot carry a subscription

This is the fact most likely to break a plan built on how Peruvians actually
pay. **None of Yape, Plin or PagoEfectivo can be tokenized and re-charged**:

- Yape through Culqi is single-use, the approval code lives two minutes, and it
  caps at S/ 2,000 per operation. There is no direct public Yape merchant API.
- Plin has no merchant API at all — it is a feature inside each bank's app, not
  a service with merchant infrastructure.
- PagoEfectivo issues a one-time CIP code the customer pays manually, and its
  own integration docs list only one-off payments.

So they are **renewal channels, not subscription rails**. If you want to accept
them you have to build the reminder-and-chase flow yourself: a notice before the
month ends, a link, and a grace period. Decide deliberately whether that is
worth it, or whether card-only with an annual option is the honest first
version.

### Why not just Stripe

Stripe does not open **merchant** accounts to sellers registered in Peru; in
Latin America its merchant countries are Brazil and Mexico. Being the Stripe
merchant would mean forming a US company, which brings a large up-front cost, an
annual franchise tax and registered-agent fee, and US federal filings with
serious penalties for getting them wrong. At tens of subscribers that fixed cost
dwarfs the revenue. Do not do it.

**This does not rule out the resellers.** Stripe added Peru as a cross-border
*payout* destination on 2026-02-25, which is a different thing from acquiring.
So a merchant of record can be the seller in a country Stripe supports and still
pay a Peruvian bank account. Several of them name Peru outright.

### The rest of the world → a merchant of record

A merchant of record is the legal seller: they take the money, they owe the VAT
in whatever country the customer is in, and they pay you. For a one-person
business selling worldwide that is the difference between a viable product and a
tax problem in twenty jurisdictions. Their fee is higher than a raw gateway's,
and that gap is what you are buying.

The deciding question is not the fee, it is **"do they accept a seller based in
Peru, and how do they pay one?"**

| Provider | Peru | Fee | On $10 / on $5 | Payout | Verdict |
|---|---|---|---|---|---|
| **Creem** | Named in [their list](https://docs.creem.io/merchant-of-record/supported-countries) | 3.9% + $0.40 | 7.9% / 11.9% | Local bank transfer, max($7, 1%); $50 minimum | **Apply first.** Cheapest, and its payout does not touch Stripe. |
| **Polar** | Named in [their list](https://polar.sh/docs/merchant-of-record/supported-countries) | 5% + 50¢, +1.5% non-US card | 11.5% / 16.5% | $2/month + 0.25% + $0.25, up to 1% FX | **Apply in parallel.** Good trial and discount primitives; $15 per dispute stings at this price. |
| **Paddle** | Only *absent* from a sanctions exclusion list — not confirmed | 5% + 50¢ | 10% / 15% | Wire or Payoneer, $100 minimum, possible $15 SWIFT | Strongest institution, and Payoneer avoids Stripe entirely. Their pricing page sends sub-$10 products to sales, so get a rate in writing. |
| **Gumroad** | [Named](https://gumroad.gumroad.com/p/local-bank-account-support-in-more-countries) | 10% + $0.50 | 15% / 20% | Direct deposit or PayPal | Works, but you are giving away a sixth of the revenue. |
| **FastSpring** | Only absent from an exclusion list | Contact sales | unknown | $100 minimum, 14-day settlement, **45-day hold on the first payout** | Wrong shape for a solo developer at this price. |
| **Lemon Squeezy** | Named today | 7% + 50¢ for an international subscription | 12% / 17% | Bank, $50 minimum, +1% international | **Do not build on it.** Being folded into Stripe Managed Payments, which covers ~35 countries not including Peru. |
| **Payhip** | Not an MoR for your case | 5% free plan | — | Your own gateway | Only partial VAT cover, and it needs a gateway you cannot get. |
| **Ko-fi** | — | — | — | — | Says plainly it is *not* the merchant of record and does not remit VAT. Disqualified. |

Two things that fall out of this table:

1. **At $5 the fixed fee per charge is the whole story.** The same provider that
   costs 7.9% at $10 costs 11.9% at $5. Price abroad at $7 or more, and push the
   annual plan, which pays the fixed fee once instead of twelve times.
2. **A country on a docs page is not an approved account.** Before you build
   anything, write to Creem and Polar from your Peru address and ask them to
   confirm in writing that a Peru-registered seller can complete onboarding *and*
   receive payouts. Apply to both at once so a rejection does not cost weeks.

**Gifting does not depend on any of this.** Not one of these providers documents
whether a 100%-off coupon is even possible — and it does not matter, because a
gifted month is a row in our own database. That stays true if you change rails
later.

### What to do, in order

1. Open a **Payoneer** account registered in Peru. It is the one payout route
   among the candidates that does not touch Stripe at all, so it is your hedge.
2. Confirm your Peruvian bank accepts inbound USD wires; get its SWIFT/BIC and
   the exact account format, and ask what it charges to receive one. None of the
   providers discloses your bank's own commission.
3. Put the site on a real domain with visible pricing, a refund policy, terms and
   a working contact address **before** applying. Paddle runs a domain review and
   thin sites are the usual rejection.
4. Apply to Creem, and to Polar in parallel.
5. In sandbox, before committing: run a free trial through to a paid charge, and
   cancel a subscription as a customer would, without emailing yourself.
6. Set the payout cadence to monthly rather than twice monthly, so you pay the
   fixed payout fee once.

---

## Stage 6 — Polish

1. **Custom domain.** Point the domain you bought in stage 2 at GitHub Pages.
   Then update `SITE_ORIGIN` in `wrangler.toml`, the Google authorized origins,
   and redeploy. They must match exactly or every token fails its audience
   check.
2. **Customer portal link** in `js/billing-config.js`, so people can cancel
   without emailing you. A subscription somebody cannot cancel is a chargeback
   waiting to happen.
3. **Turn the trial on in the pricing panel** and announce it.

---

## The order, in one list

1. Cloudflare account, KV, D1, signing key, deploy.
2. Domain + transactional email + Google OAuth client.
3. Paste the worker URL and public JWK into `js/billing-config.js`; test
   sign-in, gifting and revocation end to end.
4. Run the beta on gifted months. No paperwork needed.
5. RUC "con negocio" in the **RMT** + Clave SOL, with a contador. Electronic
   invoicing from day one — there is no grace period.
6. Mercado Pago Perú seller account, plan, webhook, secrets. Openpay BBVA as
   the fallback if Mercado Pago will not take a RUC 10.
7. Merchant of record for the rest of the world: Creem first, Polar in parallel.
8. Custom domain, portal link, trial live.

Steps 1–4 cost nothing and need no paperwork. Do not start step 5 until step 4
has told you people want this.

---

## Keys and where each one lives

| Value | Where it comes from | Where it goes | Secret? |
|---|---|---|---|
| KV namespace ids | `wrangler kv namespace create` | `wrangler.toml` | No |
| D1 database id | `wrangler d1 create` | `wrangler.toml` | No |
| License private key | `scripts/generate-keys.mjs` | `wrangler secret put LICENSE_PRIVATE_KEY_PKCS8_B64` | **Yes** |
| License public JWK | the same script | `js/billing-config.js` | No |
| Google client id | Google Cloud Console | `GOOGLE_CLIENT_ID` in `wrangler.toml` | No |
| Email API key | Resend / Brevo / MailerSend | `wrangler secret put …_API_KEY` | **Yes** |
| MP access token | Mercado Pago developer panel | `wrangler secret put MP_ACCESS_TOKEN` | **Yes** |
| MP webhook secret | Mercado Pago webhook config | `wrangler secret put MP_WEBHOOK_SECRET` | **Yes** |
| MP checkout URL | Mercado Pago plan | `js/billing-config.js` | No |
| Admin emails | you | `ADMIN_EMAILS` in `wrangler.toml` | No |

Nothing marked **Yes** ever goes in the repository, in a message, or in a
screenshot. If one leaks, rotate it: for the license key, generate a new pair,
bump `LICENSE_KEY_ID` to `k2`, deploy, and publish the new JWK.
