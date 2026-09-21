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
| Price in Peru | S/ 19–25 per month | Below a gym membership, above "not serious". Round numbers read better than S/ 19.90. |
| Price abroad | USD 5–7 per month | A merchant of record's fixed fee per transaction hurts badly below $5. |
| Annual option | Yes, at ~10 months' price | Fewer charges means fewer fees and fewer failed renewals. |
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

> Everything in this section is the shape of the process, not advice. Take the
> specifics to a contador — one consultation is cheap next to getting the
> régimen wrong for a year.

1. **Get a RUC as *persona natural con negocio***, or form a company. For a
   solo developer testing a product, persona natural con negocio is the
   lighter path: it is done at a SUNAT office or online with a DNI, and it does
   not require capital, a notary or a company name.
2. **Choose a régimen tributario.** The realistic candidates for a small
   digital-services business are Nuevo RUS, Régimen Especial (RER) and Régimen
   MYPE Tributario (RMT). They differ in the rate, in what you may deduct, and
   critically in **which comprobantes you may issue** — Nuevo RUS cannot issue
   facturas, which matters if a Peruvian business ever wants one.
3. **Get your Clave SOL**, which is how you declare and how you issue
   comprobantes electrónicos through SUNAT's own free system.
4. **Ask the contador specifically about:**
   - Whether a monthly digital subscription sold to a Peruvian consumer carries
     IGV at 18%, and whether the price you set is with IGV included.
   - Whether income from a merchant of record paying you from abroad is an
     **exportación de servicios** and how it is declared.
   - Whether you must issue a **boleta electrónica** for every monthly charge,
     and if so, whether to do it through SUNAT's free SEE-SOL or a paid PSE.
     This is the single biggest hidden workload in charging Peruvians monthly —
     find out before you have subscribers, not after.
   - Which monthly declarations you owe from the month the RUC exists, even
     with zero income.

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

Not confirmed, so check it when you register: **whether a *persona natural con
negocio* (RUC tipo 10) can open the seller account.** The Peru signup offers a
personal account with DNI and a business account with RUC, and the link-de-pago
product page says a free account is all you need — but no official page names
RUC-10 as an accepted seller profile, and several Mercado Pago Peru help pages
refuse to load from outside the country, so this could not be settled from the
documentation. Culqi, by contrast, documents accepting both RUC 10 and RUC 20.

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
5. RUC + régimen + Clave SOL, with a contador.
6. Mercado Pago Perú seller account, plan, webhook, secrets.
7. Merchant of record for the rest of the world.
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
