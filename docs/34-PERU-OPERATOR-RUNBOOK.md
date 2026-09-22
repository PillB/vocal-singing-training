# Peru operator runbook — trámites, accounts and keys, in order

Everything Pablo has to do himself, in the order it has to happen, with what
each step unblocks. The code is written and tested; one item here is a code
task and it is flagged as such.

**The shape of it: stages 1 to 3 cost nothing and need no Peruvian paperwork at
all, and they get you to a working product with sign-in, saved progress and
gifted months. You can run the whole friends-and-family beta from there.** Only
charging strangers needs the RUC, and that is stage 4.

> **About the numbers.** Fees, tax rates and free-tier limits change, and
> Peruvian ones change yearly. Everything here was checked against an official
> source on 21–22 September 2026 unless it is marked ⚠, which means the source
> could not be read or two sources disagree. There is a table of every
> unconfirmed item at the end. Nothing here is tax or legal advice.

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

### What the free plan gives you, and the one thing to watch

Checked on Cloudflare's own docs, 21 September 2026. Cloudflare changes these
tables without notice, so re-check before you rely on them.

| | Free | Paid ($5/month minimum) |
|---|---|---|
| Worker requests | 100,000 / day | 10 million / month, then $0.30 per million |
| **CPU per request** | **10 ms** | up to 5 minutes |
| D1 rows read / written | 5,000,000 and 100,000 per day | 25 billion and 50 million per month |
| D1 storage | 5 GB, 500 MB per database | 10 GB per database |
| KV reads / writes | 100,000 and **1,000** per day | 10 million and 1 million per month |
| Cron triggers | 5 per account | 250 |

Two things follow from that:

1. **KV's 1,000 writes a day is the tightest limit on the free plan**, by a wide
   margin. This design is already on the right side of it: KV only gets written
   when a payment webhook arrives, and everything that changes often — sessions,
   progress, grants — is in D1.
2. ⚠ **The 10 ms CPU ceiling is the one that could bite.** Signing a licence
   token and verifying a Google ID token are both real cryptography, and Google
   verification also fetches and parses a JWKS. If sign-in starts returning
   errors under load, this is the first thing to check, and the fix is the $5
   plan rather than a code change. Everything else here fits the free tier
   comfortably at your size.

Also: the daily free counters reset at **00:00 UTC, which is 7pm in Peru**.

Cloudflare says plainly that `workers.dev` is "intended for personal or hobby
projects that aren't business-critical" and recommends a custom domain for
production — which stage 6 does anyway.

---

## Stage 2 — Sign-in: email codes and Google

Free. No Peruvian paperwork.

### 2a. Transactional email (the six-digit codes)

The worker speaks Resend, Brevo and MailerSend — one HTTP call, no SMTP, which
is what a Worker can do.

**Use Resend.** It is the one the worker treats as its primary path, its API is
a single JSON POST, and the volume here is tiny: a sign-in code per person per
device, not a newsletter. The alternatives, if Resend does not suit you:
[Brevo](https://www.brevo.com/pricing/) and
[MailerSend](https://www.mailersend.com/pricing) — both are wired up and both
need only a different secret and one line in `wrangler.toml`.

⚠ I could not read any of the three pricing pages to confirm their current free
allowances, so check the figure yourself on the page you sign up to. It will not
change the choice: at a handful of sign-in codes a day, every one of them is
free. What matters more is the domain verification in step 2, which all three
require.

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

## Stage 4 — Formalizing: entity, RUC, régimen

The first step that cannot be undone in an evening, and the first a Peruvian
payment gateway will ask for.

> Not advice. Peruvian tax law changes often and SUNAT's own pages contradict
> each other in places — this document says so where they do. Take it to a
> contador colegiado. One paid hour is cheap next to being in the wrong régimen
> for a year.

### Do you need a company? No — and you could not form one alone anyway

Start as a **persona natural con negocio**. It is free, 100% online, same day,
and there is a fact that settles it: **a solo founder cannot form an S.A.C., an
S.R.L. or an S.A.C.S. at all.** The Decreto Legislativo 1409 says it word for
word — "la SACS se constituye por el acuerdo privado de **dos (02)** o hasta
veinte (20) personas naturales." The only one-owner company is the E.I.R.L., and
it buys you little at your stage.

| Route | Cost to set up | Owners | When it is right |
|---|---|---|---|
| **Persona natural con negocio** (RUC 10) | **S/ 0**, online, same day, issues your Clave SOL in the same flow | 1 (you) | **Start here.** One person, small revenue, nothing to shield. |
| **E.I.R.L.** via SID-SUNARP | Registral fees (below) + notary | 1 | The only single-owner *company*. Limited liability, but adds a company's whole compliance load. Worth it only when you have real assets to separate. |
| **S.A.C. / S.R.L.** | Registral fees + notary | **2–20** | Needs a genuine second shareholder. When you take on a partner or an investor. |
| **S.A.C.S.** via SID-SUNARP, no notary | Registral fees ≈ S/ 100, ~24 h | **2–20** | The only form that skips the notary, but every shareholder, director and the gerente general needs an activated DNI electrónico plus a card reader. And it still needs two people. |
| **Via a CDE (PRODUCE)** | **Registral fees waived** (E.I.R.L./S.A./S.R.L., capital ≤ 1 UIT, to 28 May 2029) | — | If you do form a company, this is the cheap way. |

**Why not incorporate "to look serious":** a company adds, at near-zero revenue,
a contador at roughly **S/ 1,800–3,000 a year**, twelve monthly declarations
whether or not you sell, an annual return, a Declaración de Beneficiario Final,
and — when you pay yourself — **5% dividend tax** the persona natural does not
pay. Incorporating does not lower your income tax: the RMT rate is the same 10% /
29.5% either way. What it adds is cost.

**You can start a company later without losing much** — an S.A.C.S. can convert
to an S.A.C. keeping the same RUC. But going from persona natural to a company is
*not* a conversion: the company is a new taxpayer with its own RUC, its own
gateway account with fresh KYC, and — the one that bites a subscription business
— **the saved-card tokens do not migrate**, so every subscriber has to re-enter
their card. That is a strong reason to pick the entity you can live with now.

Two more things:

- The company RUC created through SID-SUNARP arrives **inactive**; you activate
  it in SUNAT with your Clave SOL before you can issue anything.
- **Do not inflate the capital.** The inscription fee is capital × 3 ÷ 1000, and
  a capital over 1 UIT loses the free CDE route.

Gateways do not force your hand: **Culqi's contract names a *persona natural***
and has RUC 10 rows, and **BBVA's Openpay says "con tu RUC y DNI"**. The RUC 20's
real friction is at the bank, not the gateway — it wants a copia literal under 30
days old and a vigencia de poder (~S/ 25, and it expires). A persona natural has
none of that. Whether Mercado Pago takes a RUC 10 is the one open question; Culqi
and Openpay are the fallback.

### The régimen, which is decided for you

SUNAT requires the régimen to be chosen **before** registering, not during.

| Régimen | Verdict for a SaaS |
|---|---|
| **Nuevo RUS** | **Cannot issue facturas** — only boletas and tickets, which carry no crédito fiscal. So you could never invoice a merchant of record abroad, and no Peruvian company would buy from you. Capped at S/ 8,000 a month and S/ 96,000 a year. Out. |
| **RER** | 1.5% of monthly gross, no annual return, ceiling S/ 525,000. **Closed to software** — see below. |
| **RMT** | **The recommendation.** Ceiling 1,700 UIT = S/ 9,350,000 at the 2026 UIT of S/ 5,500. Monthly pago a cuenta 1% of net income while annual net stays under 300 UIT (S/ 1,650,000). Annual tax 10% on net up to 15 UIT (S/ 82,500), 29.5% above. Monthly *and* annual returns. Issues every kind of comprobante. |
| Régimen General | The fallback above 1,700 UIT. 29.5%, no ceiling. |

**The RER is closed to you.** SUNAT's own exclusion list names it word for word —
"programación informática, consultoría de informática y actividades conexas" and
"edición de programas de informática y de software en línea." Enrolling in it
anyway gets you moved to the Régimen General de oficio. That leaves the RMT, and
the earlier doubt about this is resolved: the exclusion is textual, not a
reading. (Nuevo RUS is technically open to software by absence, but it cannot
issue facturas, so it is out for the export side regardless.)

Declare the CIIU activity accurately. It is exactly what triggers the RER
question, so "helpfully" mis-picking one is a misdeclaration, not a shortcut.

### Invoicing, which is the real ongoing workload

- **Peruvian customers → a boleta de venta electrónica for every charge**, with
  18% IGV in the price. Capture the buyer's document type and number above
  S/ 700; only charges of S/ 5.00 or less may be consolidated.
- **Foreign customers or the merchant of record → a factura de exportación**,
  no IGV. Exports of services escape IGV under Article 33 of the Ley del IGV,
  but only when four things hold at once: provided for consideration from Peru
  to abroad and evidenced by the comprobante, the exporter domiciled in Peru,
  the user non-domiciled, and the service used abroad. **You must be inscribed
  in the Registro de Exportadores de Servicios first** — SUNAT lists the
  no-registration exceptions as hotels and ship repair, not software. It is done
  in SUNAT Operaciones en Línea (Mis trámites y consultas → Empresas → Mi RUC y
  otros Registros → Exportadores de Servicios) and ends in a constancia de
  aprobación.
- **Issue it free.** SEE-SOL (the SUNAT portal) and the **APP Emprender** both
  issue facturas and boletas at no cost, with no digital certificate and no OSE
  or PSE contract. Do not pay a provider on day one. One limit to know: a
  factura through SEE-SOL can only be issued to a receptor **with a RUC**, and
  your own RUC must be active and *habido*.
- Automating a boleta per charge, when the volume justifies it, means SEE del
  Contribuyente (buy a digital certificate) or an OSE/PSE called from the
  billing webhook.
- **Keep every purchase factura with IGV** — hosting, domain, laptop, internet,
  the contador. As an exporter that input IGV becomes your Saldo a Favor del
  Exportador and offsets other taxes instead of being lost.

**When does electronic issuing become compulsory?** You get a grace period:
the obligation starts on the **first calendar day of the third month** after the
month you registered — roughly two months to get invoicing running, not zero.
Set it up early anyway; arriving at the deadline without a system is a classic
way to get stuck. (SEE-SOL and the APP Emprender need nothing bought, so there
is no reason to leave it late.)

### Monthly, forever

- **Declara Fácil 621** (IGV–Renta mensual) through SOL on the cronograma for
  your last RUC digit. One form covers the IGV and the RMT pago a cuenta.
- **SIRE** (electronic sales and purchase registers) is a separate monthly
  filing on top.
- **An annual return**, which the RMT requires.
- **File even in months with no sales.** A zero return is still a return, and
  missing it is the infraction under article 176.1 of the Código Tributario.
  Fixing it **voluntarily, before SUNAT notifies you, wipes 100% of the fine** —
  so if you miss one, file it the moment you notice rather than waiting.
- Give the contador a **secondary Clave SOL user** (SOL → Administración de
  Usuarios → Crear Usuario) with only the profiles they need, rather than your
  own password. SUNAT's warning is worth reading twice: whatever a secondary
  user does counts as done by you.
- If you ever pause, **suspensión temporal de actividades** is 100% online and
  lasts up to twelve months. Better than going quiet and becoming *no habido*.

### Two questions to put to the contador, in these words

1. When a merchant of record resells my subscription to somebody **in Peru**, is
   that slice still an exportación de servicios? Article 33 requires the service
   to be used abroad, and no SUNAT pronouncement on merchant-of-record resale of
   SaaS was found.
2. Do I invoice the merchant of record for the **gross** subscription value or
   the **net** payout after its fees? Neither SUNAT nor the providers address it.

(The third question from an earlier draft — whether the Registro de Exportadores
de Servicios is mandatory — is now answered: for software it is required, so it
is a step above, not a question.)

---

## Stage 4b — The registrations nobody mentions

Three obligations that are easy to miss and carry real fines.

### Licencia de funcionamiento municipal

**A business run from home is not exempt.** Ley 28976 defines an
*establecimiento* as "the property, part of it, or installation where economic
activities are carried out", and its only exemptions are state entities,
embassies and consulates, the Cuerpo General de Bomberos, and temples,
monasteries and convents. There is no exemption for working from your flat.

Check your **district** municipality's TUPA before assuming anything — the fee
and the risk classification are set per district. For a low or medium risk
activity the maximum is **2 working days with automatic approval**, with the
safety inspection afterwards; high risk is 8 working days with the inspection
first. A software business with no customers visiting should classify low.

### Libro de Reclamaciones — and this one needs a change to the site

The complaints book is obligatory in every commercial establishment **and on
online sales platforms**. It may be physical or virtual.

⚠ For e-commerce specifically, a 2024 INDECOPI precedent and a Casación are
reported to require a **virtual Libro de Reclamaciones reachable in two clicks
from the home page**, a visible notice at checkout, available 24/7, with 15
working days to answer a complaint. Fines are reported to start at 1 UIT
(S/ 5,500) and reach 10 UIT. This is the one item in this runbook that is a
*code* task rather than a paperwork task, and it is not built yet — say the word
and it is a short piece of work.

### Marca at INDECOPI

Optional, but cheap insurance on a name you are about to print on things.

- **Search first, free**: INDECOPI's "Busca tu marca" before you file.
- **Tasa: S/ 534.90 per class**, or **S/ 401.20 per class** with a valid REMYPE
  constancia. Filing goes through the Mesa de Partes Virtual.
- **It takes 4 to 6 months.**
- A vocal-training web app plausibly needs class 41 (education and training) and
  class 42 (software services) — confirm the classes with INDECOPI's own
  classifier, since each class is charged separately.
- **The company name at SUNARP is not a trademark.** They are different
  registers: a razón social stops another company registering the same name, it
  does not stop anyone using it as a brand.

**REMYPE**, which unlocks that discount, **requires at least one employee on the
planilla** — and the owner does not count. So with no staff, no REMYPE, and no
discount. Do not register for it prematurely; SUNAFIL sanctions false
declarations.

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

**Costs nothing, needs no paperwork — do it this week:**

1. Cloudflare account, KV namespace, D1 database, signing key, deploy.
2. Buy a domain. Transactional email on it (Resend), and a Google OAuth client.
3. Paste the worker URL and public JWK into `js/billing-config.js`. Test
   sign-in, gifting and revocation end to end.
4. **Run the beta on gifted months.** No RUC, no gateway, no fees. This is where
   you find out whether people want it.

**Only once step 4 says yes:**

5. RUC "con negocio" as persona natural — free, online, same day — in the
   **RMT**, with a contador's blessing. Set up free electronic invoicing
   (SEE-SOL or the APP Emprender) immediately.
6. Check your district's TUPA for the licencia de funcionamiento. A home office
   is not exempt.
7. Put a virtual Libro de Reclamaciones on the site, two clicks from the home
   page. *(Not built yet — ask and it gets built.)*
8. Mercado Pago Perú seller account, plan, webhook, secrets. Openpay BBVA as the
   fallback if Mercado Pago will not take a RUC 10.
9. Merchant of record for abroad: Creem first, Polar in parallel. Open a
   Payoneer account in Peru as the hedge.
10. Custom domain, customer portal link, trial live.

**Later, optional:** marca at INDECOPI (S/ 534.90 per class, 4–6 months).

---

## What is still unconfirmed

Everything else in this document comes from an official source. These do not,
and each is one look away for somebody in Peru:

| Question | Where to look |
|---|---|
| Does Mercado Pago Perú accept a **RUC 10** seller? | Ask at registration. Culqi and Openpay both say they do, so there is a fallback either way. |
| The **Libro de Reclamaciones** rules for e-commerce (two clicks, 24/7, 15 days) | [indecopi.gob.pe](https://www.indecopi.gob.pe/). The obligation itself is certain; the exact e-commerce requirements come from a reported 2024 precedent. |
| Current **free-tier email** allowances | [Resend](https://resend.com/pricing), [Brevo](https://www.brevo.com/pricing/), [MailerSend](https://www.mailersend.com/pricing). Does not affect the choice at this volume. |
| Whether **Creem and Polar actually approve** a Peru-registered seller | Write and ask before building. A country on a docs page is not an approved account. |
| Whether a **100%-off coupon** is possible at any merchant of record | Nobody documents it — and it does not matter here, because gifted months come from our own database. |
| **Niubiz and Izipay** exact tariffs | Neither publishes a complete public tarifario; the figures circulating are third-party. Both are ruled out on other grounds anyway. |

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
