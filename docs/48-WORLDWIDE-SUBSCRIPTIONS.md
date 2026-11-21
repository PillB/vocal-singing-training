# Taking subscriptions worldwide: the choice, what was built, and how it could be wrong

21 November 2026. This page answers one question: what is the easiest route to
start taking subscriptions worldwide, for a seller who lives in Peru, has no
company, and runs a static site plus one Cloudflare Worker? It covers the
comparison, the pick, what this branch built for it, and the ways that pick
could be wrong.

Six research lanes read the providers' own pages. A skeptic then tried to
refute each load-bearing claim, and where the skeptic disagreed, the skeptic's
verdict is the one written here. **Unconfirmed** means no primary source
settled the point. The worked material is in this branch's history; every URL
below was read on 2026-11-21.

---

## 1. The answer

**Sell through Creem worldwide and through Mercado Pago in Peru. Apply to
Paddle at the same time as a backup.**

- **Creem** is a *merchant of record* (MoR). It sells to the buyer in its own
  name, charges and remits sales tax and VAT, takes card disputes, and pays
  the seller. That is what makes it the easiest route: no company abroad, no
  VAT registrations, no tax filings per country.
- Peru is on Creem's list of supported merchant countries, and individuals can
  sign up (docs.creem.io/merchant-of-record/supported-countries).
- At **3.9% + $0.40** it costs **$0.71** on a $7.99 charge, the cheapest of the
  merchants of record open to a Peruvian seller (creem.io/pricing).
- The Worker already handled Creem's webhooks before this round. This round
  added the parts that make it safe to switch on (section 3).
- **Mercado Pago** stays the Peru rail. Creem charges only USD or EUR, and
  Peru's consumer code wants the price in soles (section 4). Mercado Pago is
  also how most Peruvians pay. It is not a merchant of record, so its sales
  are the seller's own for tax.
- **Mercado Pago is Peru only.** A Mercado Pago seller account belongs to one
  country, and a Peruvian one charges soles to Peruvian accounts and cards.
  The rest of Latin America (Mexico, Argentina, Chile, Colombia, Brazil) buys
  on Creem in US$ until there is a seller account in their country.

**Why not Shopify, which the request named?** Shopify is a shop builder, not a
merchant of record. A Peruvian store gets PayPal Express rather than Shopify
Payments, recurring billing needs an app plus a supported vault that PayPal
does not list for Peru, and the seller owes every country's tax themselves. It
would cost about $0.89 a charge **plus $39 a month** and still leave tax and
cancellation to build. The "Shopify-like" experience the request wanted
(hosted checkout, a customer portal, no card data on our servers) is exactly
what a merchant of record gives, without the store.

---

## 2. The comparison

One USD 7.99 monthly charge, before tax.

| Provider | Peru seller | Fee on $7.99 | Handles tax as MoR | Customer portal | Approval | Verdict |
|---|---|---|---|---|---|---|
| **Creem** | Yes (confirmed) | **$0.71** (3.9% + $0.40) | Yes. Peru's IGV not named | Yes | Manual review, 1-2 days. **A rejection is final.** Needs an own domain (github.io refused), a branded support email, visible pricing, terms and privacy, in-product cancel | **Primary** |
| **Paddle** | Yes (confirmed) | $0.90 (5% + $0.50); custom pricing offered under $10 | Yes, including Peru's 18% | Yes | Domain review and ID check | **Backup.** Prices in PEN and takes PayPal. Bans coaching; software only. Settled with the FTC for $5M in 2025 |
| **Dodo** | Yes, by country of ID | $0.76 ($0.88 non-US card) | MoR; scope not verified | Yes | ID check, 1-3 days | Third choice. Payout route into Peru unconfirmed |
| **Polar** | Listed; Stripe Connect onboarding for Peru unconfirmed | $0.90 ($1.02 non-US card) plus payout fees | Yes | Yes | Up to 14 days | Pays out in PEN. More fees per payout |
| **Gumroad** | Yes | $1.30 to $1.83 | Yes | Unconfirmed | 1-3 weeks, after about $100 in sales | Too expensive at this price; webhook unsigned by default |
| **Lemon Squeezy** | **No.** Closed to new sellers on 2026-11-16 | — | — | — | — | Shuts down on 2027-03-31 |
| **Stripe** (direct) | **No.** Peru is not a supported Stripe country | — | — | — | — | The code is kept for a company abroad |
| **Stripe via Atlas** (US LLC) | Unconfirmed | About $0.87 to $0.99 | Managed Payments excludes Peru buyers | Yes | $500 setup + $400/yr + US filings | A company to run, for a few cents less |
| **PayPal** subscriptions | Yes | $0.73 (5.4% + $0.30) | **No** | PayPal account | Low | The seller owes every country's tax |
| **Shopify** | Store yes; recurring billing likely no | $0.89 + $39/month | **No** | App | — | Not workable (section 1) |
| **Patreon** | Yes | Not researched this round | Partly | Patreon's | Low | Built for creators' memberships; the buyer leaves the product to pay and manage it |

Sources: docs.creem.io/merchant-of-record/supported-countries,
creem.io/pricing, paddle.com/pricing, dodopayments.com/pricing,
polar.sh/docs/merchant-of-record/fees, gumroad.com/help/article/66-gumroads-fees,
docs.lemonsqueezy.com/migration, stripe.com/global,
docs.stripe.com/payments/managed-payments/eligibility,
paypal.com/pe/business/paypal-business-fees.

**The trade-off in the pick.** Creem is the cheapest and already built, and it
is the youngest of the field: its Trustpilot score is 2.9 of 5, and its terms
allow payout holds and closing an account without notice. Paddle is older and
covers Peru's VAT and soles, at about 19 cents more per charge, a second
integration, and a product-category rule this product has to stay inside.
Applying to both costs nothing and removes the single point of failure.

---

## 3. What this branch built

The goal was the smallest set of changes that makes it safe to switch Creem on,
because the gate had two faults standing in front of it (VG-83, VG-88) and the
terms made a promise the product could not keep (VG-86).

1. **The purchase belongs to the account from the start (VG-83).**
   `POST /v1/me/checkout` creates the Creem checkout on the server for the
   signed-in account. It sends a random `request_id` (`vtr_` plus 22 base64url
   characters) and stores it in a new D1 table, `checkout_refs`, for 30 days.
   When Creem's `checkout.completed` webhook names that checkout, the licence
   is bound to the account inside the webhook. The buyer's tab no longer has
   to win a race against the webhook.
   - A licence another account already holds is never moved.
   - A duplicate delivery retries a bind that failed.
   - Switched on by `providers.creem.apiCheckout`, which ships `false`.
     Setting it to `true` is the commit that puts Pro on sale.
2. **A safety net in the browser for the other paths.** A pending link is
   saved under `vt_pending_link_v1`. It is retried on load, after sign-in, and
   at 4, 12, 30 and 90 seconds. A 202 ("the webhook has not landed yet") is
   not taken as success, two tabs asking at once share one request, and a paid
   licence the browser holds is never dropped before a link by its licence id
   has been tried.
3. **Sign in before paying, only where signing in is possible (VG-88).** The
   gate holds when this browser can offer a way in: emailed codes, or Google
   with a client id and a script that loaded. Where none can be offered (a
   content blocker refused Google, and no emailed codes), the link is the way
   to pay, and the licence is linked when the buyer signs in later.
4. **Cancel in the product (VG-86).** "Gestionar o cancelar suscripción" opens
   Creem's customer portal (`POST /v1/me/billing-portal`), or Mercado Pago's
   subscriptions page for a Mercado Pago payer (that address is still to be
   checked with a real payer account). Creem's review and Peru's
   Art 47(c) both require cancelling from inside the product.
5. **The terms and privacy pages say who sells.** Creem (Armitage Labs OÜ,
   Estonia) is named as the merchant of record, with its buyer terms linked.
   The pages name four ways to cancel, and say what the Worker passes to Creem
   (the account email and a random reference, kept 30 days).
6. **The Pro dialog tells the truth before launch, and names its money.**
   - It leads with what can be done today, and says the trial takes no card.
   - The merchant-of-record note appears only on the Creem rail.
   - "No ads" is shown only while there are ads to take away.
   - Prices carry their currency: "S/ 0", "US$ 7.99" outside the US (a bare
     "$" is the peso in Mexico, Argentina, Chile and Colombia), and the region
     line says "precios en soles (S/)" rather than "PEN".
   - The euro markets are shown US$, the money the Creem products charge
     (VG-85's recommended answer), so the panel and the terms agree.
7. **What the first red-team round fixed** (25 findings, two serious, none
   critical):
   - A pending purchase link is kept per account and per sign-in, so it is
     never sent for whoever signs in next on a shared computer, and signing
     out forgets it.
   - Every attempt is bounded (15 s), and a licence is cleared only on a
     final answer from the worker, never on a timeout or a 503.
   - One checkout at a time: a second press, or a press on a button drawn
     again under the first, joins the checkout being opened.
   - A session that ended elsewhere (a 401 on a press) signs this page out,
     so the next press asks to sign in instead of failing until a reload.
   - The "Manage or cancel" button stays while a renewal is being retried
     after the paid month ends: Pro is gone, the card is still being charged,
     and that subscriber needs the button most.
   - A Creem subscriber with no button drawn (signed out, or a worker without
     the portal) is pointed at Creem's emailed link, not at a missing button.
   - Where this browser cannot sign in at all, the account panel offers to go
     on and pay (VG-88), instead of ending at "could not load".
   - `/v1/health` reports `creemKeyMode` ("test" or "live", never the key),
     so a worker left on the test key is visible.

Each behaviour has a test that models the right and the wrong result, proven
red with `node qa/mutate.mjs`: worker mutants CK1 to CK16 (with CK3b, CK8b,
CK12b, CK12c, CK15b and CK16b) and browser mutants B118 to B139 and B190.

---

## 4. Red team: how this could be wrong

Each item gives what would show it and what we would do.

1. **Creem rejects the application, or freezes the account later.** A
   rejection is final, and the terms allow payout holds.
   - *What would show it:* a "Rejected" status, or a held balance.
   - *What we'd do:* apply only once every review item is in place (own
     domain, branded email, terms with a legal name, visible prices, in-app
     cancel). Keep Paddle approved in parallel. Entitlements live in our own
     Worker, so swapping the merchant of record is a new webhook mapper, not
     a rebuild.
2. **Paid out, but at a cost that eats a small business.** Creem's payout
   route into a Peruvian bank is **unconfirmed**. A bank transfer costs $7 or
   1%, with a $50 minimum and a 7-12 day hold. A $7 fee is 14% of a $50
   withdrawal, and a SWIFT receiving fee may come on top.
   - *What would show it:* Creem support's answer, then the first payout
     statement.
   - *What we'd do:* ask before applying, use a USD account in the seller's
     own name, withdraw in larger batches, and fall back to USDC (2%).
3. **The seller is not allowed to sell yet.** Creem's Merchant Terms 3.4.9
   require being registered as a business or self-employed person. In Peru
   that likely means a RUC. Whether Creem checks for one is **unconfirmed**.
   - *What would show it:* the KYC form, or a contador's answer.
   - *What we'd do:* get a RUC first (free, online, same day, as a persona
     natural con negocio in the RMT; `docs/34-PERU-OPERATOR-RUNBOOK.md`
     stage 5). That also covers how Mercado Pago income is taxed.
4. **Peruvians shown dollars.** On the card rail a Peruvian sees US$ 7.99,
   because Creem cannot charge soles. Ley 29571 Art 6 asks for the soles
   amount and the exchange rate beside a foreign-currency price. Whether the
   exemption for providers selling "desde y hacia el exterior" covers this
   seller is **unconfirmed**.
   - *What we'd do:* Peru defaults to Mercado Pago in soles. The card rail
     stays a choice the buyer makes, labelled "Tarjeta internacional".
   - *Still open:* a soles equivalent next to the dollar price on that rail
     (VG-85).
5. **The EU withdrawal button.** Since 19 June 2026, EU distance contracts
   need a "withdraw from contract here" function (CRD Art 11a). Creem is the
   seller in the consumer contract, but its terms (17.1.2) put consumer-law
   compliance on the merchant, and whose duty this is under a merchant of
   record is **unconfirmed**.
   - *What would show it:* Creem's answer, or a regulator's guidance.
   - *What we'd do:* ask Creem first. If it is ours, add a public page that
     takes a name and an email and records the request through the Worker,
     without a login gate.
6. **The cancel goes through, but Pro ends early.** Creem's portal cancel may
   be immediate, which is **unconfirmed** in its docs. `store.js` already
   keeps the paid period after a cancel (CU3b). Setting the Creem store to
   cancel at the end of the period makes the two agree, so that is a step on
   the gate.
7. **Integration failures nobody sees.** Dashboard test events carry no
   metadata, so only a real test-mode purchase proves the binding.
   Cloudflare's Bot Fight Mode can block both Creem's webhooks and its
   reviewers.
   - *What we'd do:* turn Bot Fight Mode off on the Worker's zone, run a real
     test purchase, a cancel and a refund before applying for review, and
     watch `/v1/health`, which reports `creemCheckoutConfigured`,
     `creemPortalConfigured` and `creemKeyMode`. The last must read `"live"`
     once the test purchase is done.
8. **A forwarded checkout link pays for the wrong account.** A checkout URL
   created for one account and opened by another person still pays for the
   first account. This is **accepted**: a buyer who forwards their own
   checkout is gifting it. How long a Creem checkout link stays open is
   **unconfirmed**. It is written down so nobody mistakes it for a bug.
9. **Tax-exclusive prices in the EU.** Creem's product samples use
   `tax_mode: exclusive`. EU law requires the displayed price to include VAT.
   - *What we'd do:* create the products as **tax-inclusive** at US$ 7.99 and
     US$ 49, so VAT comes out of the price rather than on top of it. This is
     the recommended answer to VG-85, and it is Pablo's call. The branch
     already shows euro markets the US$ price; euro products would mean
     putting `priceEur` back and changing the terms' prices with it.
10. **The billing portal trusts any licence linked to the account.** The
    worker opens the Creem portal of whichever customer a linked licence
    names, however that licence was linked. Round one's red team showed a
    shared computer replaying one account's pending link under the next
    account to sign in, which then opened the first account's portal. The
    browser no longer does that (the link is kept per account and per
    sign-in), so what is left is defence in depth, and it is **not done**: a
    follow-up should have the worker open the portal only for a licence bound
    through the account's own checkout reference, or whose Creem customer
    email is the account's.

**Improvements considered and not taken now:**
- *One rail for everyone through Paddle, in soles for Peru.* It would remove
  Mercado Pago, but costs more per charge and loses Yape and Plin.
- *Pay first, claim by email afterwards.* It avoids the sign-in step, which
  Baymard links to 18% of abandoned checkouts. It was rejected because the
  buyer may be able to change the email inside the checkout (Creem's guide
  and its API schema disagree), so the licence could land on an address
  nobody controls. The gate is relaxed only where sign-in is
  impossible (VG-88).

---

## 5. What only Pablo can do, in order

None of this is code. Each item is a sign-up, a payment or a legal statement
in his name.

1. **Buy a domain** and point GitHub Pages at it. Then change `SITE_ORIGIN` in
   `workers/entitlements/wrangler.toml` and the Google sign-in origins, and
   redeploy. They must match exactly, or every token fails its audience check.
2. **Create a support mailbox on that domain** (for example `soporte@`) and
   answer it within 3 business days.
3. **Fill in the three placeholders in `terms.html`:** the seller's legal
   name, that contact address, and the refund window (14 days today).
4. **Ask a contador about a RUC** and how payouts are taxed, then register.
5. **Ask Creem support** how payouts reach a Peruvian bank, and whether a RUC
   is required.
6. **Apply to Creem as an individual.** Create two **tax-inclusive USD**
   products (US$ 7.99 a month, US$ 49 a year) and set cancellation to the end
   of the period.
7. **Store the keys on the Worker, never in a chat:**
   `wrangler secret put CREEM_API_KEY` and `wrangler secret put
   CREEM_WEBHOOK_SECRET`. Put the two product ids in `wrangler.toml`.
8. **Flip `providers.creem.apiCheckout` to `true` while the worker is still
   on the test key,** with `CREEM_ALLOW_TEST_MODE = "true"`, and buy it
   yourself. The in-app checkout can only be walked on the live site, so this
   commit is also the one that puts Pro on sale.
9. **Refund every test purchase, then swap to the live key** and live product
   ids, set the flag back to `"false"`, redeploy, and check that
   `/v1/health` says `"creemKeyMode": "live"`.
10. **Apply to Paddle** in parallel, and ask for its custom pricing under $10.

`docs/40-GO-LIVE-GATE.md` has each step with its cost, its proof and its undo.
