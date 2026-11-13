# What Pro is for, and what Free keeps

**Written 3 November 2026.** This answers the half of the Pro-versus-free
question that was never written down: not *how* the two tiers are enforced,
which [33-ACCOUNTS-AND-PAYMENTS.md](33-ACCOUNTS-AND-PAYMENTS.md) covers, but
what belongs in each and whether the split we have is worth its price.

The short version is uncomfortable, so it goes first.

> **Free gets everything that makes the product work, including saved progress
> across devices. Pro gets a bundle made mostly of things the evidence says
> singers do not ask for. The price was justified partly by cross-device sync,
> which free users already have. One of those three sentences has to change, and
> which one is a decision about money, so it is yours.**

Nothing on this page is live. No checkout link exists, so no price has been
charged and no tier has been sold. Changing the split today costs a commit.
Changing it after the first sale costs a refund and an apology.

---

## 1. What each tier actually is, read out of the code

Not out of the marketing. `can()` in `js/billing.js` is the gate the product
asks, and `qa/check-tiers.mjs` now fails the build if it disagrees with the
pricing cards or with the words printed on them.

| | Free | Pro |
|---|---|---|
| Every exercise, every mode | yes | yes |
| The pitch highway and the piano | yes | yes |
| Recording a take, locally | yes | yes |
| The 12-week plan | yes | yes |
| The daily loop and the practice ledger | yes | yes |
| The value pulse | yes | yes |
| An account, and progress saved across devices | **yes** | yes |
| Practice profiles | 1 | up to 3 |
| Streak freezes | 2 | 3 |
| Reminder times | 1 | 2 |
| Study-tip interstitials | shown | **none** |
| Downloading your progress | no | yes |
| The coach pack | no | yes |
| Insights v2 (the sparkline and the focus line) | no | yes |
| Studio goals | no | yes |
| Pro progressions | no | yes |
| Exporting achievements | no | yes |

Two things on that table were corrected to produce it:

- **`priority_progressions` and `no_limits` were deleted.** Both were removed
  from the pricing cards in July 2026 when VG-02 was fixed, and both were left
  behind in `can()` and in both dictionaries. So `can("no_limits")` answered
  *yes* to every Pro subscriber while nothing in the product meant anything by
  it, and finished marketing copy for a feature that was never built sat one
  config line away from being shown again. That is the feature museum this
  project is written against; `qa/check-tiers.mjs` exists so the next one
  fails a build instead of waiting four months.
- **Cross-device sync is free.** `PUT /v1/me/progress` asks `requireSession`
  and nothing else, and `MAX_PROFILES` is 3 on the server for everybody — it is
  the *client* that holds a free account to one profile. That was the right call
  (VG-16 called losing progress in one browser a P0 for everybody) but
  [35-PRICING.md](35-PRICING.md) had been using it as half the reason the price
  can sit above the Spanish-language competitor. That sentence is now corrected
  there.

---

## 2. What the evidence says, and where it came from

Read on 3 November 2026, first-hand, not remembered.

**Every competitor that could be verified caps free practice. We do not.** The
table in [35-PRICING.md](35-PRICING.md) holds the full list; Riyaz was
re-verified from its own App Store listing on 3 November 2026 and still says
all content is free with practice limited to **8 minutes a day**, with
"unlimited practice" as the paid promise, at **$24.49 monthly** and $79.99
yearly. That is the single strongest thing we can say to a buyer and until today
it was in a document nobody outside this repository will ever read.

**Singers do not ask for what Pro sells.** Yousician's public Trustpilot
reviews are the largest body of unsolicited opinion available about a product of
this shape. Across them:

- **Not one reviewer mentions wanting to export progress, keep several
  profiles, or receive a coaching report.** Those are three of the six things
  Pro is built out of.
- What they say they value is structure ("learning path from basic to advanced"),
  practice *tools* — "the ability to practice a song, adjust the tempo and loop
  a measure(s) is absolutely perfect" — and the habit itself ("still keeping my
  streak alive in my second year").
- What they complain about, more than anything else, is **billing**: being
  charged after cancelling, auto-renewal they did not expect, refunds not given.
  Riyaz's own store reviews say the same, independently.

**The money band.** VocalGYM, the Spanish-language competitor with a
free-forever tier, is $4.99. Vocalify, the closest analogue by business model,
is $5. Vanido, the closest by function, is $3.99. The products that charge
$14.99 and up are the ones that cap practice. We ask $7.99 and S/ 19.90 and
cap nothing.

**One source worth its own sentence, because it is the counter-evidence to our
own feature list:** Sing Sharp sells ad-removal on its own as a $2.99 one-time
purchase. "No interstitials" is the first bullet on our Pro card and the
market price of it is three dollars, once.

### Where this evidence is thin, said plainly

- Yousician is a guitar-first product and its reviewers are mostly guitarists.
  The billing complaints and the habit motivation generalise; "nobody asks for
  export" may not.
- Trustpilot self-selects for the angry and the delighted.
- The searches for singing-app opinion returned mostly machine-written
  comparison pages (several sites that did not exist a year ago, all ranking
  the same eight apps). None of them is cited here and none should be.
- No Spanish-language user evidence was found at all, which matters, because
  Peru is market one.

---

## 3. So the price has three ways out, and they are mutually exclusive

### Option A — Make Pro worth it: add something singers ask for

Keep free practice uncapped, keep the price, and put something in Pro that the
evidence actually points at. One candidate, and it is the only one the codebase
implies:

- **A take history.** Recording a take is already free; *keeping* takes, and
  hearing January against November, is the thing singers describe wanting and
  the thing no tier here offers at all. It is also the only candidate that
  costs us real money per subscriber per month, which makes it an honest thing
  to charge for rather than an artificial lock on something free to give.

**The practice heatmap was the other candidate and it is not one.** VG-49 lists
`#practice-heatmap` among three features "the tests expect [that] are not
shown", and the obvious move was to make visible habit a Pro feature. Checked
on 3 November 2026 instead of taken on trust: the heatmap is built, free, and
hidden on purpose. `js/app.js` renders 26 weeks of it and then hides the
wrapper while every day it would show is already in Historial's five-week
calendar, with a comment saying so, and `retention.spec.js` asserts both halves
of that — hidden with only today's practice, visible once there is practice from
two months ago. The spec is green: 7 of 7 on this branch. So one third of VG-49
is answered, and the row was simply stale: not lost, not retired, waiting until
it has something to add. `pro-features.spec.js` is green too, 14 of 14, which
answers a second third. "Known-red in every run since 2026-09-21" was written
once and never re-measured.

**Cost:** new product work, and storage that has to be paid for.
**Risk:** it is still a guess about what converts, just a better-aimed one.

### Option B — Drop the price to what a convenience tier is worth

$4.99 and S/ 14.90, level with VocalGYM. [35-PRICING.md](35-PRICING.md) §"Why
S/ 19.90 and not S/ 14.90" argued against this, but it argued with sync counted
as a Pro feature. That argument is now weaker than it was when it was made.

**Cost:** about 25% of revenue per subscriber, and a price cut after launch is
much harder than before it.
**Risk:** at $4.99 the fee floor matters a lot more — Creem's $0.40 per
transaction is 8% of a $4.99 charge against 5% of a $7.99 one.

### Option C — Cap free practice like everyone else

Rejected, and recorded here so nobody has to re-litigate it. It would trade the
only differentiator we have, in the only market where we are the local product,
for a conversion mechanism that every competitor already runs better. It also
contradicts the sentence the pricing panel now leads with.

---

## 4. What was done today, independent of the decision

All of this is true under any of the three options:

1. The two phantom capabilities are gone, and `qa/check-tiers.mjs` (in
   `npm test`) fails if `can()`, the pricing cards and the two dictionaries ever
   disagree again, or if a capability exists that no plan sells.
2. **The free-forever claim is now on the pricing panel**, where a buyer sees
   it, instead of only in this repository. `pricing.proof1` in both languages
   reads: *almost every singing app caps free practice — minutes a day,
   exercises a day, or beginner levels only; here every exercise, the mic and
   the piano are free, always.* That closes VG-11.
   It deliberately does **not** name competitors in a table, which is what
   VG-11 originally proposed. A named comparison is stronger copy and a worse
   liability: it goes stale the day Riyaz changes its limit, nobody here will
   re-verify five companies' free tiers quarterly, and a public claim about a
   named competitor that has gone out of date is a different kind of problem
   from a weak headline. The verified table stays in
   [35-PRICING.md](35-PRICING.md) as the evidence, and `qa/check-tiers.mjs`
   fails if either the claim or the table it rests on disappears.
3. [35-PRICING.md](35-PRICING.md) no longer justifies the price with sync.

---

## 5. The recommendation, if you want one

**Option A, and specifically the take history**, with the price unchanged until
it ships.

The reasoning: the one thing both bodies of user evidence agree on is that
people stay for the habit and leave over billing. A take history is the only
candidate that serves the habit *and* is something a free tier genuinely cannot
give away, because it costs storage per user per month. Everything currently in
Pro is a convenience that costs us nothing to give, which is exactly why it is
hard to charge for.

Option B is the safe move and can be taken at any time before the first sale.
It is worth taking **if** Option A is not going to be built within a month,
because a convenience tier priced above the convenience band, launched and left,
is the version of this that quietly does not sell.

What would change this advice: any Spanish-language evidence about what Peruvian
singers will pay for. There is none in this document, and that is the largest
hole in it.
