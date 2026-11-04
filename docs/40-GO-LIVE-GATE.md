# The go-live gate — what is built and off, and the order to switch it on

Everything on this branch is finished and switched off. That is deliberate:
several of the steps below start costing money, or start taking it from other
people, the moment they are on, and a few of them cannot be quietly undone.

This page is the gate. It is the one page to read when you are ready to turn
any of it on, and it answers four things for every step: **what it costs**,
**what only you can do**, **what proves it worked**, and **how to undo it**.

Nothing here needs to be done in one sitting. The order is chosen so that
every step is safe to stop after.

> **The one rule.** No step below is reversible by deleting a file. A payment
> taken is a payment you owe a service for; an address emailed is an address
> emailed; a product listed on a merchant of record is a listing somebody can
> buy from. Undo columns say what is actually possible, not what would be
> convenient.

---

## 0. Where this is right now

| Thing | State today | Where the switch is |
|-------|-------------|---------------------|
| The site | Live on GitHub Pages, free tier | `main` → Pages |
| Licence verification | **On.** The worker signs, the site verifies | `js/billing-config.js` `verification` |
| Accounts and sign-in | **Google only.** Email codes need a provider | `EMAIL_PROVIDER` + its API key |
| Saved progress across devices | **On**, for signed-in accounts | needs `DB`, which is bound |
| The free trial | **On**, 7 days, one per account ever | `TRIAL_DAYS` |
| Gifted and comp months | **On**, admin panel | `ADMIN_EMAILS` |
| Problem reports | **On** | `REPORTS_ENABLED` |
| Anonymous usage events | **On** in the file, **off** for the first of the two deploys | `EVENTS_ENABLED` |
| Checkout — Peru / LATAM | **Closed.** No Mercado Pago link, no secret | `js/billing-config.js` links + `MP_*` |
| Checkout — rest of world | **Closed.** No Creem link, no secret | `js/billing-config.js` links + `CREEM_*` |
| Checkout — Stripe | **Closed, and staying closed.** A Peru-registered seller cannot hold a Stripe merchant account | kept in code for a company abroad |
| The trial-length A/B test | **Off** | `TRIAL_LEN_EXPERIMENT` |
| The other six A/B tests | **Off** | `js/experiments-config.js` |
| Ads / affiliate cards | **Off**, and every partner link is empty. There is now a free `preview` mode for deciding, step 9a | `js/ads-config.js` `adsEnabled` + `mode` |
| Demo unlock | **Off**, and must stay off in anything public | `js/billing-config.js` `demoUnlockEnabled` |
| Health probe | **On**, and public: `/v1/health?probe=1` reads D1 and KV and answers 503 if either refuses | nothing to switch |
| The alarm that tells you it failed | **Off.** Two repository variables arm it | `.github/workflows/health-ping.yml`, `docs/43-WHEN-IT-BREAKS.md` §4.1 |
| Terms page | Live, with three placeholders in it | `terms.html` |

Two of those rows are the whole of why this page exists: **checkout is closed
on both rails that could actually work**, and the thing that opens it is an
account only you can create.

---

## 1. The gate, in order

### Step 1 — Redeploy the worker. Cost: nothing.

The report window and the Pro-holders list answer nothing until the worker
carries this branch's code. Nothing about this step takes money or sends
anything to anybody.

```bash
workers/entitlements/scripts/redeploy.sh --check   # read-only: what is live now
workers/entitlements/scripts/redeploy.sh           # the two deploys
```

**Only you can do this** — it needs your Cloudflare sign-in, on your own
machine. Do not paste a Cloudflare API token into a chat; the script prompts
for what it needs with the characters hidden.

**It is two deploys, not one, and the order matters.** The first goes up with
`--var EVENTS_ENABLED:false`. Storing anonymous events is the only thing in
this worker that writes a database row per visitor action, and Cloudflare has
enforced free D1's ceiling of 100,000 rows written per day since 1 September
2026 — past it *every* query fails until midnight UTC, which takes sign-in,
gifts and progress saving down with the statistics. So the new code goes up
with that off, you prove it healthy, and then a plain deploy turns statistics
back on.

**What proves it worked:** the script gates each deploy on the worker's own
`/v1/health` and refuses to continue on a bad answer. Afterwards the admin
page stops saying *redeploy the worker* in the two places it says it now, and
*Lo que nos cuenta la gente* and *Quién tiene Pro* both answer.

**Undo:** `wrangler rollback` to the version id the script writes down before
each deploy. Cloudflare keeps the last 100 versions. There is no migration to
unwind: the schema is one idempotent list applied on the first request that
needs it.

### Step 2 — Fill in the three values in `terms.html`. Cost: nothing.

A card network and both payment services require a terms page before a
recurring charge, and Peru's consumer law requires the cancellation route to
be as easy as the sign-up. The page is written; three things in it are mine to
guess and yours to state:

1. **The seller's legal name.** Your own name until a company exists.
2. **A contact address for cancellations and refunds.** It currently points at
   the GitHub repository, which is not a lawful cancellation route for a paid
   subscription. An email address you will read is enough.
3. **The refund window.** The page says 14 days. Say if you want another number.

**Undo:** it is a committed file. Edit and push.

### Step 3 — Open the Creem account. Cost: nothing to open; 3.9% + $0.40 per sale.

This is the step the international half of the product has been waiting for.
Creem is a **merchant of record**: it sells to the customer in its own name,
charges and remits the tax, and pays you. That is why it is the choice — a
merchant of record needs no company in the customer's country, and Peru is not
a country Stripe will take as a seller.

**Only you can do this.** Create the account, then create **two products**, a
monthly and a yearly, because Creem has no single link that offers both.

Then four values, none of which belong in a chat message:

```bash
# in workers/entitlements/wrangler.toml — public, so ids only, never secrets
CREEM_PRODUCT_PRO_MONTHLY = "prod_…"
CREEM_PRODUCT_PRO_YEARLY  = "prod_…"
CREEM_ALLOW_TEST_MODE     = "true"    # while you test; see step 4

# in your terminal, on your machine
wrangler secret put CREEM_WEBHOOK_SECRET
```

Point Creem's webhook (Dashboard → Developers → Webhook) at
`https://<your-worker-host>/v1/webhooks/creem` and subscribe the ten events
listed in `workers/entitlements/README.md` under *Creem*.

Filling either product id in also makes it an **allow-list**: anything else
ever sold from the same Creem account cannot become Pro. That is the point,
and the cost of it is a product you add in Creem and forget here, which is
then refused — add the id and redeploy.

**Worth applying to Polar at the same time.** It is the second candidate in
VG-19 and the code shape is identical; whichever answers first can be the rail.

**What proves it worked:** `/v1/health` reports `creemConfigured: true`, and
opening the prices in the site no longer says the rail cannot be honoured.

**Undo:** remove the secret and the product ids, redeploy. Any subscription
already sold keeps charging in Creem until it is cancelled there — that is the
part that is not undone by a deploy.

### Step 4 — Buy it yourself, in test mode. Cost: nothing.

Do not let the first real purchase be the first purchase. With
`CREEM_ALLOW_TEST_MODE = "true"` from step 3, a Creem test-mode purchase
drives the whole path — checkout, webhook, licence, the browser believing it —
without money moving.

Walk all of it: sign in, buy monthly, see Pro arrive; refund it in Creem's
dashboard and see Pro end; buy yearly; cancel and see the period you paid for
survive to its end.

**Then set `CREEM_ALLOW_TEST_MODE` back to `"false"` and redeploy.** A test
purchase moves no money, so while that flag is on, anyone who can make Creem
fire a test event at the worker gets the paid tier for nothing. The worker
defaults to refusing those events for exactly this reason, and the flag exists
only for this step.

**What proves you put it back:** `/v1/health` does not report this flag, so
check `wrangler.toml` and the deploy. This is the one step on this page whose
undo is the step itself — treat it as unfinished until the flag is `"false"`.

### Step 5 — Paste the Creem checkout links into the site. Cost: this is the gate.

```js
// js/billing-config.js
providers.creem.links = {
  pro_monthly: "https://www.creem.io/payment/prod_…",   // Products -> Share
  pro_yearly:  "https://www.creem.io/payment/prod_…"
}
```

**This is the commit that makes the product sellable.** Before it, the pricing
panel says nothing is on sale; after it, a stranger can pay. Everything in
steps 1 to 4 exists so that this commit is boring.

The site's own validation refuses anything that is not an allowed checkout
host, so a mistyped link fails closed rather than sending somebody somewhere
else. A test fails if the terms page still claims nothing is on sale once a
link exists.

**Undo:** remove the links and push. Pages serves the new build in a minute or
two. Subscriptions already sold keep charging in Creem; see step 3's undo.

### Step 6 — Mercado Pago Perú, for Peru and Latin America. Cost: per transaction.

Peruvian issuers approve roughly 70–90% of locally acquired charges against
30–50% acquired abroad, which is why this rail exists alongside Creem rather
than instead of it: for a Peruvian buyer it is the difference between a sale
and a declined card.

**Only you can do this**, and it is the one step on this page with real
paperwork in front of it — a Mercado Pago account that can take subscriptions
wants your RUC. `docs/34-PERU-OPERATOR-RUNBOOK.md` stages 4 to 5 are that
paperwork, including which régimen, what the contador costs monthly, and the
registrations nobody mentions.

```bash
wrangler secret put MP_WEBHOOK_SECRET
wrangler secret put MP_ACCESS_TOKEN
```

Then the preapproval link into `js/billing-config.js`, exactly as step 5.

**What proves it worked:** `/v1/health` reports `mercadopagoConfigured: true`.
Until it does, the site refuses to send a Peruvian buyer down this rail at all,
rather than taking money it cannot turn into a licence.

**Undo:** as step 3. The subscriptions are Mercado Pago's, not ours.

### Step 7 — Email sign-in. Cost: free to a few thousand a month, then money.

Today the only way in is Google. That is fine and it is not enough: plenty of
people do not want to use a Google account for a singing app, and on a shared
family phone it signs them in as somebody else.

**Only you can do this:** create a Resend, Brevo or MailerSend account, verify
a sending domain, then:

```bash
wrangler secret put RESEND_API_KEY     # or BREVO_API_KEY / MAILERSEND_API_KEY
# and in wrangler.toml: EMAIL_PROVIDER = "resend", EMAIL_FROM = "…"
```

With `EMAIL_PROVIDER` empty the worker **disables** email sign-in rather than
accepting an address and silently dropping the code, which is the failure that
looks like the product being broken.

**What proves it worked:** the account panel offers an address field, and a
code arrives. `/v1/auth/methods` is what the page reads.

**Undo:** clear `EMAIL_PROVIDER`, redeploy. Addresses already stored stay
stored; the privacy page says what is kept and the nightly cron sweeps codes
and sessions.

### Step 8 — Statistics, and then an A/B test. Cost: database rows.

`EVENTS_ENABLED` is already `"true"` in the file and gets turned back on by the
second of step 1's two deploys. That is all the usage statistics need.

**Do not switch the trial-length test on yet.** `TRIAL_LEN_EXPERIMENT` gives
half of your accounts fourteen free days instead of seven, and
`docs/38-AB-TESTING.md` says plainly what it can and cannot measure: 432
accounts per arm would be needed for conversion to *double*, about 2,200 per
arm for a believable 5% → 7%, and the only large randomised test of trial
length that exists — 337,724 users — found the fourteen-day arm not
significant. At a few hundred users this spends Pro and returns noise.

**Undo:** `EVENTS_ENABLED = "false"`, or a one-off
`wrangler deploy --var EVENTS_ENABLED:false`, which the next plain deploy
reverses. The nightly cron deletes events older than 180 days, which the
privacy page promises.

### Step 9 — Ads. Cost: nothing in money; something in trust.

`js/ads-config.js` ships with `adsEnabled: false` and every partner link
empty. The strategy is in `docs/19-AD-MONETIZATION-ORCHESTRATION.md` and its
first line is the recommendation: **leave this off while Pro is the thing you
are selling.** Ads on a free tier make the paid tier's "no ads" line true,
which is worth something, but they also make the free tier worse at the moment
you most need people to stay in it.

#### 9a. Look at it first, for free, with no account — two minutes

There is now a mode whose whole purpose is this decision. Locally, not pushed:

```js
// js/ads-config.js
adsEnabled: true,
mode: "preview",
```

```bash
python3 -m http.server 8765   # then open http://127.0.0.1:8765
```

Every slot renders as it would, marked **Vista previa**, with the card's button
deliberately dead and a dashed box showing the footprint an AdSense unit would
take. **No third-party script is loaded, no request is made to anybody, no
AdSense account is needed, and nothing is recorded as an impression** — a
preview is not an advertisement. It is the only mode that will show you a card
whose partner link is still empty, and it says so on the card.

Look at the home screen and the post-session screen in particular. If the answer
is "this makes the free tier worse", you have it for free and you stop here. Put
both values back before pushing.

#### 9b. If you want the first-party cards (the recommended live mode)

`mode: "native"` renders your own tip cards: no third-party script, nothing from
Google, nothing loaded during practice (enforced in `js/ads.js`, not merely
intended), and a dismiss button on every card.

What only you can do: join whatever partner or affiliate programme you want to
earn from, and paste **its own tracking link** into the matching card's `href`
in `js/ads-config.js`. The `rel="sponsored noopener noreferrer"` and the
disclosure line are applied for you. Three cards ship; `pro-nudge` already works,
because its destination is your own pricing panel.

**A card with no destination is now skipped rather than shown.** So with every
`href` still empty, `mode: "native"` shows nothing at all. That is deliberate and
it is a bug fix: before 4 November 2026, turning `adsEnabled` on — the one switch
this step used to name — rendered a card in the home slot whose button called
nothing and recorded a click for the press. If you want to see those cards before
you have links, that is what 9a is for.

#### 9c. If you want AdSense — the account is the whole of the work

This is the only part of this step that needs an account, and the account is
yours alone:

1. **Open an AdSense account** at `adsense.google.com` and add this site to it.
2. **Let Google review the site.** It decides whether to approve, on criteria
   that are theirs and that change; read AdSense's own getting-started pages
   rather than this one. Nothing in this repository can speed that up.
3. **Create the ad units** once approved — one for the home slot, one for
   history — and note each unit's slot id and your publisher id (`ca-pub-…`).
4. **Paste them in** `js/ads-config.js`:
   ```js
   mode: "adsense",            // or "hybrid": your cards first, AdSense as fill
   adsense: {
     client: "ca-pub-XXXXXXXXXXXXXXXX",
     slots: { home: "1234567890", history: "0987654321" }
   }
   ```
   The publisher id and the slot ids are **public by design** — they ship inside
   the page to every visitor — so they are safe in this repository. There is no
   AdSense secret to keep, which is why this step has no `wrangler secret put`.

Three things to know before you choose this mode, each measured rather than
assumed:

- **Google's script outlives the ads.** A learner who buys Pro part-way through a
  session has the ad unit removed from the page immediately, but
  `adsbygoogle.js` and its globals stay until they navigate or reload. Removing a
  `<script>` tag does not unload a script, so there is no fix for this short of a
  reload the product does not do. `mode: "native"` never loads it at all. The
  test `tests/ads-redteam.spec.js` asserts both halves so the limit stays a
  measurement rather than a surprise.
- **An unfilled unit hides itself**, using the CSS Google itself recommends for
  that case, and our own funnel counts an impression only when Google says the
  unit was `filled` — so `ad_impression` means an ad was actually returned, and
  `ad_unfilled` tells you the difference between "no ad" and "no slot".
- **What AdSense forbids, in its own words**, because two of these are easy to do
  by accident later: hiding ad units (except an unfilled one), letting content
  cover them, overlapping content on mobile, and any change that "artificially
  inflates ad performance".

**Undo:** `adsEnabled: false` and push. On a page already open, that takes effect
on the next reload; nothing persists.

---

## 2. What costs money, and when

| What | When it starts costing | Roughly |
|------|------------------------|---------|
| GitHub Pages | never, at this size | free |
| Cloudflare Workers, KV, D1 | only past the free ceilings, and **past them it refuses rather than slows** | $5/month, and worth paying before the first checkout opens — `docs/43-WHEN-IT-BREAKS.md` §3 has the arithmetic |
| Creem | only on a real sale | 3.9% + $0.40 |
| Mercado Pago Perú | only on a real sale | per their tariff |
| Transactional email | past the free tier | a few thousand emails free |
| The contador | the month you have a RUC | **monthly, forever** — the real recurring cost |
| INDECOPI marca | when you file | one-off |
| The trial-length A/B test | the day you switch it on | in Pro given away, not in cash |

The contador is the one worth noticing: it is the only line that keeps costing
whether or not anybody buys anything. `docs/34-PERU-OPERATOR-RUNBOOK.md` stage
4 has the two questions to put to one, in the words to use.

---

## 3. What is a decision, not a step

These are not blocked on anybody but you, and the code has a stated default
for each until you answer. They are written up with the current behaviour
beside them in `docs/33-ACCOUNTS-AND-PAYMENTS.md`.

1. **How long Pro lasts after a declined renewal.** Today: it ends when the
   period ends, with no grace. A grace period is kinder and costs a few days
   of Pro per failure.
2. **The smallest payment that may buy Pro.** Today: any amount on an allowed
   product. A floor stops a one-sol payment buying a year if a price is ever
   mis-set, and risks refusing somebody who really did pay.
3. **Whether gifted months stack.** Today: they do not — the longest end date
   wins.
4. **Whether to pay Cloudflare the $5 a month.** Today: the free plan, which
   refuses operations past its daily ceilings rather than billing for them.
   The one that binds is KV's 1,000 writes a day, which is about 90 new
   subscribers in a single day — and the day it runs out, Mercado Pago and
   Stripe retry until it resets while **Creem gives up after about an hour, so
   those sales are lost rather than delayed.** On the paid plan the same day
   costs about $0.000055 a subscriber. This one has a deadline the others do
   not: it is worth answering before either checkout opens, not after.
   `docs/43-WHEN-IT-BREAKS.md` is the whole case.

Two of the three carry a failing `todo` test, so the suite names them rather
than letting them be forgotten.

---

## 4. Reopening this thread at the gate

The work above was done in the project thread **"Accounts, payments and
gifted months"**. It is still the thread that knows this code: the payment
identity rules, why each rail behaves as it does, what every switch costs, and
which findings were deliberately left open.

When you are ready for any step on this page, post in that thread and say
which step. For example:

> Step 3 and 4 — I have opened the Creem account, the products are
> `prod_…` and `prod_…`, webhook secret is set. Walk me through testing it.

or

> Step 5 — go. Here are the checkout links.

What it will do, in each case: read the current state of the worker through
`/v1/health` rather than assuming, make the code or config change, run the
suite and the browser tests over what it touched, push, and tell you exactly
what to check on the live site. For anything that takes money or sends
anything to anybody, it will say so before doing it and wait for you.

If that thread is gone by then, the state it would need is all in the
repository: this page, `docs/33-ACCOUNTS-AND-PAYMENTS.md`,
`docs/34-PERU-OPERATOR-RUNBOOK.md`, `docs/35-PRICING.md`,
`docs/38-AB-TESTING.md`, `docs/ADMIN-GUIDE.md`,
`workers/entitlements/README.md`, and `docs/VALUE-GAP-REGISTRY.md` — which is
the one that says what is still open and why each open thing was left.

---

## 5. Things that are deliberately not on this page

- **Switching Stripe on.** A Peru-registered seller cannot hold a Stripe
  merchant account (checked against `stripe.com/global`, 2026-11-03). The
  handler is kept, hardened and unused, for a company outside Peru. There is
  no step that makes it work from here.
- **Libro de Reclamaciones.** Required of a Peruvian business selling to
  consumers, and it attaches to a registered company. It belongs with step 6's
  paperwork, not before it.
- **The demo unlock.** `demoUnlockEnabled` must stay `false` in anything
  public. It is a QA switch, there is a test that it is off, and there is no
  step here that turns it on.
