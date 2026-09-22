# What to charge, and why

The prices in `js/billing-config.js` were set before anyone had looked at what
comparable products charge, and every one of them was wrong in the same
direction. This is the evidence that moved them and the arithmetic behind the
new numbers.

> Everything here was read from a primary source on **22 September 2026** unless
> it is marked ⚠. App Store prices were read live from both the `/pe/` and
> `/us/` storefronts of the same app id. A separate adversarial pass re-read 34
> sources and deleted six claims; what that pass threw out is listed at the end,
> because a deleted claim is as useful to know as a kept one.

---

## The decision

| | Was | Is | Why in one line |
|---|---|---|---|
| Peru, monthly | S/ 35 | **S/ 19.90** | S/ 35 was above what Yousician and Duolingo charge Peruvians. |
| Peru, yearly | S/ 279 | **S/ 119.90** | 50% off, which is the category norm. 34% was not. |
| World, monthly | $9.99 | **$7.99** | Modest cut; the monthly was the least wrong number. |
| World, yearly | $79 | **$49** | The category's median annual is $38–45. $79 was double. |
| Euro | €9.99 / €79 | **€7.99 / €49** | Same numerals as USD, which is the norm. ⚠ See the tax warning. |
| Trial | 7 local / 30 account | **unchanged** | They are two different trials and both lengths are right. |

The yearly discount now reads 50% in soles and 49% in dollars — the same offer
in both currencies, and both computed from the prices rather than written down.

---

## Why the soles price was the worst number

This is the finding that decided everything else.

**We were charging Peruvians more than our competitors charge Peruvians.**

| | Their Peru price | Ours, before | Ours, now |
|---|---|---|---|
| Yousician Premium Plus | S/ 30.90 / month, S/ 189.90 / year | S/ 35 and S/ 279 | S/ 19.90 and S/ 119.90 |
| Duolingo Super | S/ 32.90 / month | S/ 35 | S/ 19.90 |

Yousician sells a far larger product — multiple instruments, a song catalogue,
a company behind it — for less than we were asking, in our own market. Duolingo
likewise. Both were read from the Peru App Store on 22 September 2026.

The cause is visible in the old config: `pricePen: 35` is roughly `priceUsd`
converted at the spot rate. That is not how anyone else prices Peru.

**The benchmark is ~70% of the US price, not ~100%.** Seven subscription apps
were measured by pairing their Peru and US App Store listings, 24 matched
product pairs, at 1 USD = 3.378 PEN:

| App | Peru price as % of US |
|---|---|
| Simply Piano | 59.2% across every tier it publishes |
| Babbel | 59–66% |
| Duolingo | 63–65% on annual tiers |
| Busuu | 58% monthly, 81% annual |
| ELSA Speak | 29.5% monthly, 111% annual |
| flowkey | 95–99% — does not localize |
| Headspace | 118–131% — charges Peru *more* |

Median **69.7%**. The distribution is bimodal rather than tight: apps that
actually sell into Latin America cluster at 59–65%, and apps that do not bother
sit at 95–131%. We were in the second group without having chosen to be.

One correction to that figure, which matters because it is the one that sets our
number: Peru App Store prices are shown IGV-inclusive and US prices are shown
before sales tax, so the tax does not cancel out of the ratio. Deflating by the
18% IGV gives a tax-neutral **59%**, which is almost exactly the factor Simply
Piano applies deliberately. At 59%, a $7.99 monthly implies **S/ 15.93** and a
$9.99 monthly implies **S/ 19.92**.

We landed at S/ 19.90 rather than S/ 15.93, which puts us at 62.5% rather than
59%. That is a deliberate three-point premium and the reasons are below.

---

## Why S/ 19.90 and not S/ 14.90

There was a real disagreement in the evidence, and it is worth recording rather
than smoothing over. The market-anchor reading argued for **S/ 14.90**: it sits
visibly under Spotify, under YouTube Premium Lite at S/ 16.90, and it is only
1.3% of the minimum wage. The ratio reading argued for a band of **S/ 19.90 to
S/ 23.90**. Those bands do not overlap.

S/ 19.90 wins on four counts:

1. **ELSA Speak charges exactly S/ 19.90 in Peru.** It is the closest analogue
   in the set — speaking practice, microphone, feedback — and that is the price
   it has settled on for this market.
2. **It clears the anchor that matters.** Spotify Individual is S/ 20.90 and has
   been since 2023. S/ 19.90 is under it. The anchors above S/ 25 —
   Netflix Básico S/ 28.90, Yousician S/ 30.90, Duolingo S/ 32.90 — are all
   comfortably above.
3. **The fee is not linear.** Mercado Pago charges 3.49% **plus a fixed S/ 1**
   plus IGV. That fixed sol is 10.0% of a S/ 19.90 charge and 12.0% of a
   S/ 14.90 one. Dropping the price by a quarter costs two points of margin on
   top.
4. **S/ 14.90 had the weaker evidence.** It comes from requiring a visible gap
   under Spotify, which is a judgement, not from the measured ratio.

What would change this: if conversion at S/ 19.90 is poor after a real cohort
has seen it, S/ 14.90 is the next stop and the argument for it is already
written above. The gifted-month machinery means that can be tested on real
people without touching the price.

---

## Why the annual price was the worst number in dollars

The soles price was the most visibly wrong. The **annual** price was the most
wrong relative to its own category.

- Subscription apps average a **67% discount** on annual against twelve monthly
  charges, and the median annual plan costs about **3× the monthly price**.
- In the Education category specifically, the median annual is **$38.42**
  (Adapty, 16,000+ apps) or **$44.99** (RevenueCat, 75,000+ apps).
- Ours was **$79**, at a 34% discount — 8 months' price rather than 3.

Against the same benchmarks our monthly was fine: the Education median monthly
is $8.38 or $12.99 depending on the dataset, and we were at $9.99. So the
dollar-side problem was concentrated almost entirely in the annual plan, and the
monthly moved only modestly, to $7.99.

$49 at a 49% discount is still above the category median annual. That is
deliberate: this is a product with a permanently free core, so the paid tier is
bought by people who already practise here, and it does not need to win on price
against apps that gate the practice itself.

---

## What Pro actually competes with

Worth stating plainly, because it constrains the price more than any benchmark
does. **Every verified competitor caps free practice. We do not.**

| Product | What the free tier allows |
|---|---|
| Riyaz | 8 minutes a day |
| Vanido | 3 exercises a day |
| Erol Singer's Studio | Beginner 1 and 2 only |
| Sing Sharp | ad-supported, most songs members-only |
| VocalGYM | 2 of 4 routine levels |
| Smule | only as the second singer |
| **Vocal Studio** | **everything, forever** |

So Pro does not sell access. It sells convenience and continuity — no
interstitials, export, profiles, insights, goals, streak freezes, cross-device
sync. That tier lives lower in the market than the access tiers do:

- **VocalGYM**, the Spanish-language direct competitor with a free-forever tier
  and a virtual piano: **$4.99/month**.
- **Vocalify**, the closest analogue by business model: **$5/month**.
- **Vanido**, the closest analogue by function: **$3.99/month**.
- The category median, made of products that gate practice: **$14.99/month**.

$7.99 sits between the convenience band and the access band. It is above the
Spanish-language competitor, which the cross-device sync and the coach export
have to justify. If they do not, this is the next number to revisit.

One warning from the same evidence: **Sing Sharp sells ad-removal alone as a
$2.99 one-time purchase.** "No study-tip interstitials" is worth far less than
it looks on a feature list, and should not be the headline reason to buy Pro.

---

## What reaches us after fees

Mercado Pago Peru at the instant-settlement tier is 3.49% + S/ 1, with IGV on
the fee. Creem is 3.9% + $0.40.

| | Price | Fee | Net | Take |
|---|---|---|---|---|
| Peru monthly | S/ 19.90 | S/ 2.00 | S/ 17.90 | 10.0% |
| Peru yearly | S/ 119.90 | S/ 6.12 | S/ 113.78 | 5.1% |
| World monthly | $7.99 | $0.71 | $7.28 | 8.9% |
| World yearly | $49.00 | $2.31 | $46.69 | 4.7% |

**The annual plan halves the fee take**, because the fixed charge is paid once
instead of twelve times. It also arrives as cash immediately, which matters more
than the discount costs:

> A Peru annual subscriber nets S/ 113.78 on day one. A monthly subscriber only
> passes that after **6.4 months**. The same crossover in dollars is 6.4 months.

Given that 72% of annual subscribers cancel within the first year across the
industry — and monthly churn is far worse than that — the annual plan is the
better deal for us at this discount, not a concession.

⚠ **One unresolved number.** No readable Mercado Pago document says whether the
plan amount is IGV-inclusive. Netflix, HBO Max and Disney+ all publish
IGV-inclusive prices in Peru, and Peruvian consumer law requires the displayed
price to be the total, so the table above assumes inclusive. If it turns out to
be exclusive, Peru net revenue is overstated by roughly 15%.

---

## What the law requires of the price itself

Peruvian consumer law constrains the *display*, not just the amount. All of the
following is ⚠ — the statute itself is on `gob.pe`, which is blocked from this
environment, so these come from press and law-firm summaries that quote it.

- **The displayed price must be the total**, IGV and all charges included, and
  the customer cannot be charged more than what was shown (Código de Protección
  y Defensa del Consumidor, art. 5).
- **A price may not be shown to Peruvians in dollars alone.** A foreign-currency
  price has to carry the sol equivalent in equal characters with the exchange
  rate stated (art. 6). The site already shows soles to the PE market, which
  satisfies this, and it is why the soles price is set on its own merits rather
  than converted.
- **Cancellation must use the same means as signup.** If subscribing is two taps
  in the app, cancelling has to be too.
- **Dark patterns are prohibited** since Decreto Legislativo 1729, published
  12 February 2026, which added art. 56.1.h covering interfaces that distort or
  manipulate the consumer's freedom of choice, and art. 24.5 requiring a working
  support contact. This touches the free tier's study-tip interstitials
  directly: keep them one-tap dismissible, never pre-tick an upgrade.

Confirmed from a strong source rather than a summary: Peru has charged **18% IGV
on digital services from non-domiciled providers since 1 October 2024** under
Decreto Legislativo 1623 (El Peruano).

---

## What the rails can and cannot do

These are mechanical constraints, read from the providers' own documentation,
and two of them change what is buildable.

- **Creem can price products in USD and EUR only.** It physically cannot bill
  soles. So the two-rail split is not a preference, it is forced: the Peru price
  lives on Mercado Pago and the rest-of-world price on the merchant of record,
  and the two levels are necessarily set independently.
- **Polar supports genuine multi-currency**, but PEN appears nowhere in its
  currency lists. Do not plan on it for Peru either.
- Neither merchant of record does automatic purchasing-power-parity pricing.
- **Creem needs two products for an annual plan** — one monthly, one yearly — so
  budget for two product ids that both map to Pro.
- Both merchants of record **grandfather existing subscribers** on a price
  change, so cutting the dollar prices is risk-free for anyone already paying.
- **Mercado Pago is the opposite**, and this is the operational trap: its docs
  describe plan-level changes as synchronizing the amount to subscribers.
  ⚠ Whether existing subscribers are repriced is not documented. **Create a new
  plan for each price point and never edit a live one.**
- Mercado Pago does support annual: `frequency: 12` with
  `frequency_type: "months"` — there is no years unit — and `billing_day` is
  capped at 28.
- Trials work on all three rails. Mercado Pago's seller UI offers 7 and 14 days
  as presets, so a 30-day trial may need the API rather than the dashboard.
- ⚠ **Creem never documents whether its displayed price is tax-inclusive.** Pin
  this down before publishing a euro price, because a tax-exclusive default
  turns €7.99 into €9.43 at checkout, which is exactly the surprise Peruvian law
  forbids and European buyers dislike.

---

## The trial stays as it is

The code has two trials and that looked like an inconsistency. It is not.

- **7 days, browser-local** (`freeTrialDays`) is the fallback for a deploy with
  no worker. It is farmable by clearing storage, so it stays short.
- **30 days, per account** (`TRIAL_DAYS`) is the real one, and it is one per
  person ever.

The evidence says length barely matters for conversion: there is a cliff below
about 5 days and then a plateau. Adapty's medians are 30% for 1–4 day trials,
then 45%, 44% and 45.7% for longer ones. RevenueCat's larger dataset puts the
7-day-to-30-day difference at 37.4% versus 42.5%.

So 30 days is justified on habit formation — the 12-week plan needs a month
before it has anything to show — and on cancellation timing: 64% of 7-day trial
cancellations happen on day 0–1, against 31% for 30-day trials. It is not
justified by a conversion claim, and should not be sold as one.

**What to expect.** The right benchmark for a product with a permanently free
core is freemium, not trials: the median is **2.1% of downloads paying by day
35**, against 10.7% for trial-based apps. Anyone forecasting from the trial
figure will be disappointed by a factor of five.

---

## What the fact-checking pass deleted

Recorded because knowing what did not survive is part of knowing what did. Six
claims were thrown out; one of them carried a recommendation:

1. **"Peru localizes monthly more deeply than annual" — deleted.** It rested on
   four judgement-call pairings, and the most defensible alternative closes the
   gap almost entirely. **Do not act on "cut the soles monthly hard and leave
   the annual high."**
2. Headspace's per-app median was the mean of two of three ratios.
3. ELSA's per-app median required an undisclosed deduplication.
4. Simply Piano's factor is ~59% on the tiers cited, but not "every tier with
   zero variance".
5. Duolingo's monthly ratio depended on picking $12.99 when the US page also
   lists $9.99; the honest pairing is near parity.
6. A trial-cancellation statistic was quoted at 55% when the page says 84%.

The headline 69.7% median survived recomputation three separate ways.

---

## Sources that could not be read

Each is one look away for somebody who is not behind this proxy.

| What it would settle | Where |
|---|---|
| Whether Mercado Pago's plan amount is IGV-inclusive | Mercado Pago seller help — `www.mercadopago.com.pe` is refused at the network gateway here |
| Whether editing a live Mercado Pago plan reprices existing subscribers | Same. Until it is answered, create a new plan per price point |
| Whether Creem's displayed price is tax-inclusive | [docs.creem.io](https://docs.creem.io/) — documented silence, so ask them |
| Whether Polar can present PEN | [polar.sh/docs](https://polar.sh/docs/) — absent from both currency lists |
| The consumer-code articles in their own words | [gob.pe](https://www.gob.pe/) — blocked at the gateway; everything legal above is from summaries |
| Whether Indecopi's DL 1729 reglamento has been issued | [indecopi.gob.pe](https://www.indecopi.gob.pe/) — blocked; the 180-day deadline fell around 11 August 2026 |
| Yousician's own web prices, and whether they localize PEN | [account.yousician.com/plans](https://account.yousician.com/plans) |
| Singing Carrots' real prices | [singingcarrots.com/pro](https://singingcarrots.com/pro) — deliberately hidden behind a quiz |
| VocalGYM's Google Play price in soles | [play.google.com](https://play.google.com/store/apps/details?id=com.imlautaro.vocalgym) |
| 30 Day Singer's true monthly, where two sources disagree | [30daysinger.com/pricing](https://www.30daysinger.com/pricing) |

---

## What still has to happen before any of this charges anybody

The prices are display-only until the checkout links exist. Ordered, with the
operator steps in [34-PERU-OPERATOR-RUNBOOK.md](34-PERU-OPERATOR-RUNBOOK.md):

1. Create the Mercado Pago plan at S/ 19.90 and a second at S/ 119.90, and put
   their checkout URLs in `js/billing-config.js`.
2. Create two Creem products, $7.99 monthly and $49 yearly, once Creem approves
   a Peru-registered seller.
3. **VG-20 blocks step 2.** The checkout host allowlist, the provider ids and
   the worker's claim route are all still written around Stripe, so a Creem
   checkout link would be refused by our own validation. That is a separate
   piece of work.
4. Confirm Creem's tax mode before the euro price is shown to anyone.
