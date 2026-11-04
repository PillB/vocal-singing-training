# What this branch changed, section by section

This is the record of the branch behind pull request #26: every change in it,
what was wrong before, what is true now, and how each fix was checked. It lives
here rather than in the pull request's description for two reasons. The
description had reached GitHub's limit of 65,536 bytes and could not hold
another round. And a description is read once, by one person, before a merge;
this record outlives the merge and is the thing to read when somebody asks in
six months why a payment id is kept only while it names its own period.

The numbered sections are in the order the work was done, and they refer to each
other by number. The later ones are mostly corrections of the earlier ones,
because every fix on this branch was attacked after it landed — usually by an
independent QA session with no stake in the first answer being right.

Each section's faults also have a one-line row in
[the value-gap registry](VALUE-GAP-REGISTRY.md), which is the index; this is the
long form.

**Where to start.** Section 16 is the ordered list of switches to throw before
any money can move, and `docs/40-GO-LIVE-GATE.md` is its own document. Section 12
is the rail somebody outside Peru can pay on. Section 13 and its corrections in
sections 15, 18 and 19 are the hardest thing here and the one to read closely:
four passes at the question of which payment bought which month.

---

## 1. Terms, cancellation and refunds

**Before:** there was no page saying what a subscription costs, how it renews, how to cancel it, or how a refund works. A card network and both providers require one before a recurring charge, and Peru's consumer law requires the cancellation route to be as easy as the sign-up.

**After:** `terms.html`, Spanish first and English under `#en`, sixteen sections each. The footer and the privacy page link to it, and a test fails if the page keeps saying "nothing is on sale today" once a checkout link exists in the config.

**How:** one new page with its own inline `<style>` (`css/styles.css` untouched), `footer.terms` in both dictionaries, and two staleness guards in `tests/terms-page.spec.js` — one reading the prices back out of `js/billing-config.js`, one reading the checkout links.

## 2. Signing in before paying

**Before:** a payment made while signed out was tied to that browser's localStorage and to nothing else. The subscription would keep charging while the same person's next phone showed free, and no operator route existed to move that licence onto an account afterwards.

**After:** `startCheckout` refuses with `signin_required` when the account layer is configured and nobody is signed in; the pricing panel closes, says why, and opens the account panel.

**How:** the gate sits inside `startCheckout` after the link lookup, so a build with no checkout link behaves exactly as before, and a build with no account layer at all is not blocked. `tests/checkout-signin.spec.js` drives the real client code with the checkout host stubbed.

## 3. A way to tell us something is broken

**Before:** the only way to report a bug was to open a GitHub issue, which nobody practising their voice on a phone is going to do. So we heard nothing.

**After:** *Reportar un problema* in the studio's footer and in both halves of the guide opens a dialog that takes a bug or an idea, posts it to the worker, and gives the reporter a `VS-…` number to quote. We read them in the admin panel under *Lo que nos cuenta la gente*, where each one is triaged, noted and closed. Testers get `/qa/`: it says which build is live and what the worker has switched on, what to look at (nine charters, both languages, ticks kept per browser), what is off on purpose so nobody spends a report on it, and it turns a failed check into a filed report in one tap.

**How:**

- `workers/entitlements/src/reports.js` — `POST /v1/reports` (no account needed), `GET /v1/reports/mine`, `GET /v1/admin/reports` with filters and keyset paging, `POST /v1/admin/reports/update`. Schema v4 adds one `reports` table whose primary key *is* the reference the reporter sees, in an alphabet with no `0/O` or `1/I/L` so it can be read aloud.
- **A report is never lost.** When the worker is unconfigured, off, busy or unreachable, the dialog becomes the same report as copyable text with the issues link, and a draft survives closing the dialog for the browser session.
- **Writes are capped three ways** — per address (10/hour, 30/day), per account (40/day), per deployment (500/day) — because a public POST that inserts a row is the one thing on this worker that could spend D1's 100,000 daily writes the paid side needs. The ceiling answers its own reason, `too_busy`. Sections 7 and 8 are about the four ways that capping leaked.
- **Only a closed list of environment keys is stored**, and a card-shaped digit run is redacted before the row is written: somebody who hit a problem on the checkout page may well paste the card they were paying with. No IP address is stored with a report; it is only a rate-limit bucket.
- `privacy.html` now names every field a report keeps, in both languages, and a test fails if it stops naming one the client actually sends. Closed reports are swept after 180 days; open ones are kept while open.
- `REPORTS_ENABLED` can switch the route off without a code change. It defaults **on**, unlike the event ingest: a report costs a handful of rows a day, which is why it needs no two-step deploy.

## 4. Pro given, taken back, and who holds which kind

**Before:** Pro could be given to one person at a time and taken back from their own account page, and that was the only view. There was no way to ask "who are my testers", "which gifts run out this week" or "how many of these are our own accounts" without a wrangler SQL query, and no way to hand somebody Pro with no end date in mind. Junk in the days field quietly became a 30-day gift.

**After:** the give form asks what kind of thing you are giving — a gift, or one of our own test accounts — and offers *Sin fecha de fin* beside 7/30/90/365. A new *Quién tiene Pro* section lists every grant this deployment ever made, filterable by kind and by state, newest first, 25 at a time, with a counts line that answers "two gifts and four test accounts running". Each row takes it back with the same warning the account view gives, and tapping an address looks that account up.

Both kinds entitle identically. The label exists so the list can tell our own test accounts apart from gifts to real people, which is the distinction that was missing.

**How:**

- **"No end date" is 3650 days**, the longest grant the worker allows, not a null `ends_at`. One row shape, one resolver, and revoking stays the single column it was; ten years is indistinguishable from forever for a tester. `grantIsOpenEnded()` reads the length rather than a flag, so the lists say *sin fecha de fin* instead of printing a date in 2036.
- `listAllGrants()` and `countGrants()` in `grants.js` answer "who holds what", with keyset paging on `(created_at, id)` and a join to `accounts` for the address, because a list of account ids is not something anybody can act on. `GET /v1/admin/grants` joins the existing POST.
- **A real bug this work caught:** both grant routes read days as `Math.floor(Number(body.days) || 30)`, which silently turned `0`, `null`, `""` and `"many"` into a 30-day gift. A new `readDays()` helper makes absent mean the default and anything else outside 1..3650 a `400 bad_days` — which is what the admin page already told the operator.
- A worker that has POST but not GET on that path answers 405, and the page says *redeploy the worker* rather than a generic failure, because that is a different thing to do about it.
- `docs/ADMIN-GUIDE.md` gains **3.1** for this and **6.1** for the report window in section 3, and **8.3** now points at the page before the SQL it used to be.

## 5. Nobody is sent to pay on a rail we cannot honour

**Before:** Mercado Pago's webhook is refused outright until `MP_WEBHOOK_SECRET` and `MP_ACCESS_TOKEN` exist, and the claim route only ever reads what the webhook wrote. A payment taken in that window was money taken for Pro that could never be issued: the browser asked "is it ready" for seven days and gave up, and the only remedy left was to gift the buyer a grant by hand. The 2026-10-28 audit called it the likeliest way a first real sale goes wrong.

**After:** opening the prices asks the worker, once, through `/v1/health` whether it can honour each rail, and `startCheckout` stops on an explicit no with `provider_unavailable`. The panel says so in plain words and says nothing was charged.

**How:** the direction of the failure is the point, and it cuts both ways. An explicit `false` stops the sale; **no answer must not** — a worker that is unreachable, slow, or too old to report the field has to leave checkout open, or a flaky network becomes a lost sale. `ensureRails()` therefore records a missing field as `null` rather than `false`, throws a failed probe away rather than caching it as a verdict, and half of `tests/checkout-rail.spec.js`'s cases are about that second half. Setting the secret before the link goes live is still the operator's order; this is the net under it.

## 6. Six ways a payment could buy more than it paid for

An independent QA pass took every permutation of three to five webhook events through the real router, ran 58 mutants of the decision functions, and came back with nine findings. Six are faults in this code and are fixed here. Each was reproduced first, so each test goes red on the tree as it was and green after; and each fix was then checked against mutants of **its own** decision, not only against the goal test it was written for, because a fix that passes one test for the wrong reason is how the next one of these gets in.

### A first purchase that could mint two licences

**Before:** Stripe sends `checkout.session.completed`, `customer.subscription.created` and `invoice.paid` at effectively the same moment for a new customer. Each ran the same read-then-write against KV, and KV has no compare-and-swap, so all three could look, find nothing, and each mint a licence of its own. The customer kept whichever the last write indexed; the other two were orphans no later event could reach — so a cancellation told one licence while the browser held another, and an unpaid-cancelled customer stayed Pro.

**After:** a licence id is derived rather than random — an HMAC over the provider and the subscription id (or, for a one-off, the payment) — so two writers that cannot see each other arrive at the same id and the three events converge on one row. A licence that already exists keeps the id it was minted with, which is why nothing already stored moves, and with no key configured the id is random exactly as before.

### Money that went back but access that did not

**Before:** Mercado Pago has always ended the access a refunded or charged-back payment paid for; Stripe did not. The same product behaved differently depending on which rail somebody bought on, and a refunded yearly pass kept up to 366 days of Pro. The README's stated reason was that a charge carries nothing a licence can be found by — true of the charge alone, false of the pair, because a one-time checkout names its payment intent and so do the refunded charge and the dispute.

**After:** the payment intent is written down against the licence when it is first seen, in its own 400-day key space, and `charge.refunded` and a lost dispute end the period that payment bought. A **partial** refund does not — that is a goodwill gesture, not the end of what was bought — and the refund of an earlier month leaves a later month alone. A refund naming a payment this worker never saw mints nothing and is retried for a day in case it simply arrived first.

The payment index is kept in its own keys rather than aliased onto the claim index, so a payment intent buys nobody a token through `/v1/claim`. The dispute half of this was corrected again in section 8, because the first version ended access on an inquiry; the rule that decides *which* period a payment owns was narrowed twice more in section 13; and the test of whether all the money went back was wrong on the Creem rail in two ways, in section 15.

### A paid checkout that never ended

**Before:** a paid subscription checkout whose `customer.subscription.*` events never arrived left the licence open-ended. 400 days later, with nothing renewing it, it was still Pro.

**After:** the checkout bounds the period itself, for subscriptions as it already did for one-off payments. The bound is a **floor**, not a ceiling: a real subscription event still moves the end date out, so this only ever shortens a period nothing else is reporting on.

### A label that outranked the card

**Before:** a Mercado Pago subscription whose label mentioned a year while the card was charged monthly bought a year of Pro for one monthly charge. Free text in `reason` outranked the billed recurrence.

**After:** a label is what somebody typed into the Mercado Pago panel; `auto_recurring` is what the card is actually charged. The charge decides, and text is read only when a preapproval arrives with no recurrence block at all. When the two disagree the record says `auto_recurring_over_text`, so an operator who meant the label can see why it was ignored.

### A single-use gift code redeemed twice

**Before:** a single-use code redeemed by two people at the same moment was granted twice. The code read the use count, wrote the redemption row and the grant, then incremented the count without looking at the result — so two requests that both read "0 of 1 used" both got through. The unique index on `(code, account)` caught the same person twice; nothing caught two different people.

**After:** the increment *is* the test. It carries the condition in its `WHERE` clause, and when it changes no row somebody else took the last use, so both speculative writes are undone and the loser is told the code is exhausted. Section 14 is the same shape, found in two more places.

### Any price in the account buying Pro

**Before:** `STRIPE_PRICE_PRO_MONTHLY` and `_YEARLY` began as labels — a way to know whether a subscription was monthly or yearly — and were never a gate. Anything else sold from the same Stripe account entitled: a donation, a one-off lesson, a subscription at any price at all.

**After:** where they are filled in they are read as an allow-list as well. A subscription on an unlisted price is suspended rather than active, and a paid invoice on one does not lift that back off.

The dangerous direction here is the other one — a hand-maintained list can refuse somebody who really did pay, and a yearly subscriber hears nothing until their next renewal — so what is pinned in `test/price-table.test.mjs` is as much the two ways back as the gate itself: naming the plan in the subscription's metadata, which needs no deploy and takes effect on the event that edit emits, or adding the price id and redeploying, after which the next subscription event entitles it. And, because the repository ships with both ids empty, that an unconfigured worker behaves exactly as it did before.

**How, across all six:** `changedRows()` in `db.js` reads D1's `meta.changes` and counts an unreadable answer as zero, which refuses rather than grants — the safe direction when the database will not say. A guarded `UPDATE … WHERE <condition>` plus its changed-row count is the only atomic test of a condition D1 gives us; `RETURNING` is not listed as supported in Cloudflare's current D1 SQL docs, so it is not used anywhere on this branch. The QA pass's own eleven tests are adopted rather than rewritten, and a `todo` there is a known open finding rather than a test that does not matter.

**Three of the nine findings are questions for you, not bugs** — how long Pro lasts after a declined renewal, the smallest payment that may buy it, and whether gifted months stack. `docs/33-ACCOUNTS-AND-PAYMENTS.md` has a section saying what the code does until you answer, and the two still open carry failing `todo` tests so the suite names them.

## 7. The write ceiling that could be overspent, and the card scrub that could not see a paste

A second QA pass went at the report route from section 3 and found four faults in it. All four are fixed here.

**Before:** the per-deployment write ceiling existed to stop a public POST spending the 100,000 daily D1 writes that sign-in, gifts and progress saving need. It did not hold. The limiter read the count, added one, and wrote the sum back, so forty requests arriving together each read the same number and each wrote the same number: the ceiling was whatever one request thought it was. Worse, a request the limiter *refused* still cost a write to the counter row — so the thing protecting the write budget was spending it, and a flood of refusals could take the worker down on its own. A body that failed validation spent a slot too, before anybody had asked whether it was a report at all.

**After:** the limiter peeks read-only first, so a refusal writes nothing; then the two statements that do write both carry their condition in the `WHERE` clause, and the count that comes back is the answer. Past the ceiling, twenty-five refusals leave the `rate_limits` table untouched. Validation now runs before any limit is spent, in the order sanitize → read-only ceiling peek → per-IP hourly → per-IP daily → per-account → increment → insert.

**Before:** the card scrub only recognised a card somebody had typed as sixteen unbroken digits. A card pasted off the plastic — `4242 4242 4242 4242`, or with hyphens, or non-breaking spaces out of a PDF — went into the row as written. Which is exactly the shape a card arrives in, because people paste.

**After:** full-width digits are folded to ASCII first, then a digit run is read across the separators a card is actually written with, and any window of whole groups totalling 13–19 digits is hidden. The test table carries prose controls alongside — a phone number, a date, a reference number — because a scrub that eats everything numeric is its own bug. Sections 8 and 10 widened both halves of this again, and section 10 is also where the comment above it stopped claiming something untrue.

## 8. The four things the re-attack found in last night's fixes

The same QA session then attacked the fixes in sections 6 and 7 rather than the code they replaced, which is how the next four came out. Three were real and are fixed; one turned out not to be a defect, and saying so is part of the result.

### The write ceiling reopened at every window boundary

**Before:** a Worker reads its clock once and may write seconds later, so a request that began at 23:59:59 can reach the limiter after midnight, when another request has already opened the new day. It then computes *yesterday's* window. The limiter compared windows for equality, found a mismatch, reported an empty bucket, and the guarded upsert — which fired on any difference — reset the count **and dragged the window backwards**. The next request with a current clock then saw a mismatch too, and reset it again. One straggler per boundary therefore handed out a whole fresh allowance: of a person's hourly share, and of the 500-a-day ceiling that exists so this route cannot spend the write budget the paid side needs.

**After:** a bucket only ever moves forward. The peek adopts the stored window whenever it is newer, so a straggler is counted in the window it found rather than handed an empty one of its own, and the upsert guard is `<` rather than `<>`.

Worth saying which half does the work, because a mutation check said so: the peek is the fix, and `<` alone changes no test outcome. It is kept as the invariant because the pair is what makes a future mistake safe — with the peek wrong and `<` in place, a straggler is refused rather than reopening the bucket, which costs a request instead of the write budget.

### A card pasted with invisible spaces

**Before:** the separator set was a hand-written list of code points, and the list was missing the thin space, the hair space, the ideographic space, the zero-width space, the zero-width joiner and non-joiner, the word joiner, the byte-order mark and the soft hyphen. Every one of those is what a paste out of a PDF, a rich-text field or a CJK keyboard actually carries, and every one of them leaked the whole number.

**After:** the set is `\p{Zs}` and `\p{Cf}` with tab, return and newline — the whole Unicode class rather than this week's list of it, so the next invisible character is covered before anybody finds it.

**Before, separately:** hiding only the card-shaped window left the rest of the run readable, and a number typed in front of a card moves that window across the join. `123456789 4111 1111 1111 1111` has a thirteen-digit window spanning the order number and the card's first group, so the card's first four digits were hidden and **its last twelve were stored, in order**. Twelve consecutive digits of a card is the card.

**After:** the whole run goes. A run is digits and separators with no letters in it, so prose is not at risk; what the wider rule costs is a bare list of five or more three-digit numbers. One pinned judgement is deliberately reversed with it: twenty unbroken digits used to be "no card" and be stored as typed, and a card with the expiry or the CVV typed onto the end of it is the commonest way one arrives.

### An inquiry ended a paying subscriber's Pro

**Before:** `charge.dispute.created` was treated as money going back whatever the dispute said about itself. Three of Stripe's dispute statuses are **inquiries** rather than chargebacks — its own enum calls `warning_closed` "an inquiry closed without becoming a formal dispute" — and `prevented` and `won` are disputes that cost us nothing. No money moves on any of them, most never become a chargeback, and the cardholder often does not know one was raised. We cut their access off the same day.

**After:** a dispute ends access only when it is a formal chargeback, and `charge.dispute.funds_withdrawn` still always does, because the event name is the fact. `charge.dispute.updated` and `charge.dispute.closed` are now subscribed to as well, so an inquiry that escalates is caught on the event that says so, and one closed as lost is caught even if no funds-withdrawn event reached us. The status list was read off Stripe's Dispute object documentation on 2026-11-03 rather than from memory, because it decides whether a paying customer keeps what they bought.

Section 12 then had to make the opposite call on the rail that will actually see money, and says why.

### A redelivered older invoice cut a paid month short

**Before:** Stripe can emit a paid invoice for an *earlier* period after a later one, with a newer `created` — a redelivery, or collection re-attempted on an older invoice. The event-ordering guard does not catch it, because by event time it really is the newest thing we have heard; what is older is the period it names, and that replaced the period end outright. Reproducing it showed exactly what a subscriber would see: paid through 62 days out after two months, then 31 after month one is redelivered, and a 403 on a day they had paid for.

**After:** a paid invoice's period end is a floor on paid-through and never a ceiling. A `customer.subscription.*` event still replaces it, because `current_period_end` is the provider's current answer — and that distinction is load-bearing: making every event a floor breaks four tests about a cancelled subscription keeping only the period it paid for. Mercado Pago was checked for the same shape and does not have it.

### And one that was not a defect

A refund of a **delayed** payment (bank debit, OXXO) was reported as unmatched. It is not: `checkout.session.async_payment_succeeded` carries the payment intent and the index is written there, so the refund finds the licence. There is now a test that says so, which is the useful outcome either way.

## 9. The A/B test on the free trial, built and switched off

You asked for a test on the seven-day trial. It is here, off, and it is the first experiment in this codebase whose treatment is **money** — the arm decides whether an account gets 7 or 14 free days of Pro — which is why almost none of it looks like the five experiments already on the list.

**The worker assigns the arm, not the browser.** Every other arm is a hash of the browser id computed in `js/experiments.js`. A browser that could choose this one could choose fourteen days, or three thousand. So the worker derives it from the account id under a secret (`trialArmFor`), domain-separated from the licence-id derivation that shares that secret, and **refuses to run the test at all when there is no secret to key it with**: an arm anybody can compute in advance is an arm anybody can farm addresses against until they land in the longer one. `TRIAL_LEN_EXPERIMENT` in the worker switches it on, and it overrides `TRIAL_DAYS`. The `enabled` flag in the file the browser loads governs nothing for this key.

**The arm is written on the grant row it produced, not recomputed later.** Recomputing changes its answer when the secret is rotated or an arm is added, which would file an account in a column it was never in — and it would invent an arm for every account that trialled before the test existed, whose trial was the configured length whatever a hash says now. The row is the record; `/v1/me` reads it back, and the admin grant list says *14-day trial* beside it so an operator can see what an account was actually given.

**Exposed when the offer is shown, not when the trial starts.** The button says "Start 14 free days", so the offer already *is* the treatment. Counting only the people who went on to start would condition on something the treatment itself can move — a longer offer may well be taken up more often — and a difference in paid conversion could then be that sorting rather than the length.

That required fixing something the page had wrong: the trial button read `/v1/auth/methods`, which answers before anybody signs in and can therefore only report the configured default. A fourteen-day account would have been promised seven and given fourteen. Under-promising costs nobody anything, but a test whose treatment is never applied measures nothing. `/v1/me` now carries `trialDays` and `trialArm`; a worker deployed before those fields sends neither and the page still falls back to the public answer — which section 14 then made the shortest arm rather than the configured default, because the public answer was the one thing that could still over-promise.

Two new event names, because a metric counts an event and cannot read its props: `trial_started` (`trial_result` fires on refusals too, so "started" was indistinguishable from "tried and could not") and `pro_paid_first`, the only thing in the statistics that comes from the account rather than from watching the page. The exposure still carries nothing but the random browser id, so the `exposures` table joins to no account — the privacy promise on `privacy.html` is unchanged.

**And the part you most need to read.** The primary metric is paid conversion, which is the 2%-ish case `docs/38-AB-TESTING.md` already says nothing at this traffic can measure. 432 accounts per arm is sized for conversion *doubling* (5% → 10%); a believable 5% → 7% needs about 2,200 per arm. And the prior is that there is nothing to find: the only large randomised test of trial length — 337,724 users across six markets, the one that decided seven days on 2026-09-24 — found **the fourteen-day arm not significant**. So the comparison this runs is one that a test a thousand times larger already called null.

It is built anyway for two reasons, both written down in the doc. The first is the one argument external data cannot settle, which is this product's own: a daily singing habit plausibly needs longer than a week, and the mechanism behind short trials winning is people forgetting, which is worse in a practice product than in most. The second is that the mechanism — a worker-assigned arm, recorded on the row it changed — is what was missing, and it is reusable for any later question about what an account is *given* rather than what it is *shown*. **Do not switch it on at a few hundred users.** If the trial disappoints, the lever the evidence supports is re-entry, not length.

**Four properties of this mechanism that were measured, are true, and are not defects** are now written down in `docs/38-AB-TESTING.md` rather than left for a later pass to file as findings: the browser tests assert the arm the worker computed instead of recomputing it, which is the whole point of moving the assignment server-side; the *offer* arm is derived on each render while the *granted* arm is the row, and those are deliberately two different things; the arm is readable before the trial starts, which it must be or the exposure is dishonest; and the length named before sign-in is the shortest arm rather than a guess at the reader's own.

## 10. A card is a card in Devanagari too

A sixth QA pass went at section 8's scrub and found six shapes that still stored a card. Four are closed here, two are left open on purpose, and the comment that claimed none existed is corrected — which was the real finding.

**Before:** a digit was `[0-9]`, with full-width digits folded to ASCII before the match. That covered exactly one script somebody had thought of and let every other one through. The same card in Arabic-Indic digits, in Devanagari, in Thai, or in the mathematical bold digits a copy out of styled text produces, went into the row as typed. Separately, U+FF0D (the full-width hyphen) and U+2212 (the real minus sign, which is what a paste out of a spreadsheet or a formatted document carries) were not in the dash list, and either one leaked a whole number.

**After:** a digit is `\p{Nd}`, the whole Unicode category, so there is nothing left to enumerate. The proposed patch mapped each script's digits to ASCII; that turned out to be unnecessary — the length rules never need a digit's *value*, only to know it is one, so widening the class does the entire job. Two consequences came with it: groups are counted in code points, because a mathematical bold digit is a surrogate pair and `.length` would turn twelve digits into eighteen and hide them; and the fold is **deleted** rather than extended, because it rewrote the reporter's own text to make a narrower class match. What is stored is now what they typed, minus the cards.

**And then the dash list turned out to have the problem the space list had.** Section 8 replaced the hand-written space list with `\p{Zs}` and `\p{Cf}`; the dashes were still four code points chosen by hand, and a comment of mine claimed a Unicode class "would be no shorter than the list". Measured, that was simply false: the set is now `\p{Pd}` — the whole Unicode dash category, 27 code points — plus the full stop and U+2212, which is not in that category. That is both shorter than the list it replaces and seven times wider, and there is a test for each code point in it.

**Left open, deliberately:** a card written one or two digits at a time, `4 1 1 1 …` or `41 11 11 …`. That is the price of the group-of-three rule, which is what keeps four clock times, a bare list of three-digit numbers and two phone numbers readable. The alternative offered was to accept short groups when the run passes a Luhn check and starts with a card brand's digit. It was declined: one run in ten passes Luhn by chance — it passes on the clock times already pinned in these tests, which is why a brand-prefix filter had to be bolted on top of it — and the measured cost was about one short-group run in twenty hidden without being a card. In a form whose entire purpose is somebody telling us what broke, hiding their text costs a report, and those two shapes are the least likely way a card ever reaches that field.

**The comment above all of it was also wrong, and that is the finding worth reading.** It said a legitimate report loses nothing to these rules. Running the scrub says otherwise, and the cost is not hypothetical: `pedido 1002345 2024-11-03` is hidden, so is `987654321 2024-11-03`, so is a thirteen-digit millisecond timestamp, and so is `Screenshot_20241103-143025.png` — any two unrelated numbers that add to thirteen digits across a separator, which is an order number next to a date. The comment now says exactly that, a test pins all four, and VG-50 in `docs/VALUE-GAP-REGISTRY.md` is open for the thing that actually fixes it: telling the reporter that something in their text was hidden, so they can say it again in words. The scrub stops claiming to be free.

## 11. Deploying it, in the order that cannot hurt

Both the report window and the holders list need a worker redeploy before they answer anything, so this branch also ships the redeploy itself as one command:

```bash
workers/entitlements/scripts/redeploy.sh          # the whole sequence
workers/entitlements/scripts/redeploy.sh --check  # what is live, no deploy, no sign-in
```

**Two deploys, not one.** The first goes up with `--var EVENTS_ENABLED:false`. Storing anonymous events is the only thing in this worker that writes a row per visitor action, and Cloudflare has enforced free D1's ceiling of 100,000 rows written a day since 1 September 2026 — past it *every* query fails until midnight UTC, so sign-in, gifts and progress saving go down with statistics. So: new code up with that off, prove it healthy, then a plain deploy turns statistics on. A mistake is then a mistake on a worker that is barely writing.

The script preflights Node/git/curl and the real ids, records the live version id for rollback, gates each deploy on the worker's own `/v1/health`, pauses for a look at the admin page, and prints what to check last. `qa/check-redeploy.mjs` (26 checks, in `npm test`) runs `--check` against stubs for every shape a worker gives — fully deployed, the older one live today, mid-deploy with events deliberately off, a Cloudflare HTML error page, a 500, nothing listening — and proves the go/no-go probe refuses a worker that did not come back right. A missing field must read as "this worker is older than the field", never as "off": a stale worker must not look deliberately configured.

`--var KEY:VALUE`, "secrets are never deleted by a deployment", `deployments status --json`, the 100-version rollback window and the D1 limits were all checked against Cloudflare's current docs on 2026-11-03 rather than from memory, and cited where the guide uses them. **There is no migration step:** the schema is one idempotent list with a version beside it, applied on the first request that needs it.

**Two bindings changed meaning.** `LICENSE_ID_KEY` is new and optional — it is what the derived licence ids in section 6 are keyed by, and with it unset the worker falls back to the signing key it already has. And `ADMIN_EMAILS` has moved out of the public vars table: the README and the Peru runbook both told you to put your own address in `wrangler.toml`, which publishes it in the commit that adds it and leaves it in the git history after any later edit. It is a `wrangler secret put` now, the worker reads it from `env` either way, and `scripts/setup.sh` already did it correctly. A new test in `test/config.test.mjs` compares the settings the code reads against the settings the README names, in both directions, and refuses an address or a provider key assigned anywhere in `wrangler.toml`.

## 12. The rail somebody outside Peru can actually pay on

Everything in sections 6 and 8 hardens `src/stripe.js`, and a Peru-registered seller **cannot be a Stripe merchant**: Peru is not on Stripe's supported-country list (checked against `stripe.com/global` on 2026-11-03). So the international half of the pricing table pointed at a rail that can never take a payment, and VG-20 in `docs/VALUE-GAP-REGISTRY.md` had been open since the audit: the provider id list, the checkout-host allow-list and the worker's claim route all said `stripe`, so a merchant-of-record checkout link pasted into the config would have been refused by our own validation.

**After:** Creem is wired end to end as a third rail, and VG-20 is closed. `POST /v1/webhooks/creem` verifies, maps and stores ten event types; `/v1/claim` and `/v1/license` accept `creem`; `/v1/health` reports `creemConfigured`, which is what section 5's gate reads; all eleven international markets in `js/billing-config.js` now route to it; `checkout.creem.io` is a legitimate destination and `creem.io.attacker.test` still is not. Stripe stays in the code with an empty region list — it is the rail kept for the day a company outside Peru exists, not one anybody is sent to.

The webhook facts were read off `docs.creem.io` on 2026-11-03, not from memory, because several of them are where a Stripe habit would have written a bug:

- **No timestamp in the signature.** `creem-signature` is a bare HMAC-SHA256 hex digest over the raw body — no timestamp, no separator — so there is no replay window to check and nothing to compare a clock against. The event id is the only replay defence, which is why `markEventSeen` is claimed *before* the event is mapped and released again only if the mapping fails. What makes that enough is that no period is ever counted from *now*: every instant in an update is read out of the body, so a replay sets the period it set the first time. Creem retries five times over 24 hours keeping the same event id; a manual resend gets a new one, which is a human pressing a button.
- **Two clocks in one envelope.** `created_at` is epoch **milliseconds**; every subscription date — `current_period_end_date`, `last_transaction_date`, `canceled_at` — is an **ISO 8601 string**. `epochSeconds` and `isoSeconds` are separate readers, and the epoch one refuses anything that is neither plausible seconds nor plausible milliseconds rather than guessing, because the guess that fails silently here is a period end in 1970 or in the year 57000.
- **A dispute carries no status.** Stripe's dispute statuses are the whole of how section 8 tells an inquiry from a chargeback; Creem's `dispute.created` has neither a status nor a reason field. So a Creem dispute always ends the period it names. That is the opposite call from the Stripe one, deliberately: there is nothing to read, and the alternative to acting is ignoring chargebacks on the rail that will actually see money.
- **"Was it a full refund" is three questions, not one**, and **test mode reaches the same endpoint** — both of those are section 15, because both were got wrong first.

The payment identity on this rail is the **transaction** id (`tran_…`), read from whichever of its four shapes the event uses, so a refund or a dispute resolves to the period its own payment bought under the same rule section 13 applies to Stripe. `CREEM_PRODUCT_PRO_MONTHLY` and `_YEARLY` are section 6's price allow-list on this rail and ship empty, so an unconfigured worker reads the billing period off the subscription exactly as it would have.

## 13. An id is only proof while it names the period it bought

Two commits here and a third in section 15, each a narrowing of the one before, because the first fix was right about the hole and wrong about what replaces it. If you read one section of this branch closely, read this one and its correction.

**Before:** section 6 writes the payment id against the licence so a refund can end what that payment bought. A renewal that lengthens the period does not always name a payment — Mercado Pago's authorized-payment events do, its preapproval updates do not, and a subscription event that only moves `current_period_end` never does. The id was left in place across such an update. So month two was paid for, and the refund of **month one** ended it, because the row still said month one's payment owned the current period.

**After:** a payment id is kept only while it still names the period on the row. An update that lengthens the period and names no payment clears it — nothing is owed to a refund that cannot be matched, and not taking Pro away is the safe direction to be wrong in.

**Then that fix had a hole of its own, found by asking for it to be falsified.** Deciding by "the last payment for this period wins" is wrong for the commonest mid-cycle event there is: a proration invoice ends with the same period the month's real payment bought, so it took the claim. Two consequences, both reproduced: refunding the small proration ended a month it had not bought, and refunding the real payment left Pro running. That was a regression this branch introduced, not a pre-existing fault, which is the reason the narrowing took more than one commit.

**So the rule is first-payment-wins, pinned to the period it was first seen on.** A second field, `periodPaymentEnd`, records which period end the stored id was claimed for, and a payment takes the claim only when the period is genuinely new or when nobody holds it. A record written by the previous commit has no `periodPaymentEnd` at all, and is read as **holding** its claim rather than as unclaimed — stricter than the patch offered — so nothing already stored changes hands on the first event after a deploy.

A third rank was then added for the Creem rail and was **wrong**; section 15 is how that was found and why it is now deleted rather than narrowed. What survives is a rule with no exceptions: the first payment seen for a period is the one that bought it.

Ten tests, each red on the tree as it was: a month with no payment intent on it surviving the refund of the month before, the same with a chargeback, a proration keeping its own payment's name, two payments ending the same period, the refund of the one that did buy it, a record stored before the field existed keeping the id it has, and a period moved by a state event before the invoice behind it arrives.

## 14. Two more races where the second request wins as well

Section 6 fixed the gift code redeemed twice. The same read-then-write shape was in two more places, and both are worse.

**The sign-in code's guess allowance.** `consumeLoginCode` read the attempt count, compared it to the limit, and wrote the count back. Twenty wrong guesses arriving together each read the same number and each wrote the same number, so a six-digit code's five-guess allowance was whatever one request happened to think it was: a million-code space becomes brute-forceable by fan-out. In the other direction, the *right* code could be consumed by five parallel requests and mint five sessions from one email.

**After:** the increment carries its own condition — `WHERE consumed_at IS NULL AND attempts < 5` — and a changed-row count of zero means somebody else took the last guess. The burn that spends an exhausted code and the single-use consumption both do the same, so the right code signs in exactly once. A spent allowance reads as `too_many_attempts` before the burn has even landed, and a code already consumed reads as *gone* rather than as over-guessed, which are different things for the person reading the message.

**The trial month.** `startTrial` checked `trial_used_at IS NULL`, created the grant, then set the marker. Five parallel starts wrote five trials. **After:** the marker is claimed first with the condition in its `WHERE`, the grant is written under it, and if the grant write fails the marker is released again — so a transient D1 error does not burn somebody's only free month.

Both are guarded `UPDATE … WHERE` plus `meta.changes`, for section 6's reason: `RETURNING` is not listed as supported in Cloudflare's current D1 SQL docs. Seven tests, and each fix was then checked against mutants of its own decision — the allowance limit, the burn, the single-use guard, the changed-row check, the trial claim's guard, its count check and its release.

**And a fourth thing, which is a promise rather than a race.** `/v1/auth/methods` answers before anybody has signed in, so with section 9's trial-length test running it could only ever report the configured default — and would promise fourteen days to an account about to be given seven. It now reports the **shortest** length any live arm can give. Under-promising costs nobody anything; over-promising is a thing we said and did not do.

## 15. Five faults in the new rail, found by attacking it the day it was built

Section 12 shipped in the morning. A QA pass took it apart the same afternoon, and five things came out. Two of them put all of a customer's money back and left Pro running; one was a rule added that morning; one is the worst fault on this branch, because it gave access away rather than failing to take it back; and one would have handed out the paid tier to anybody who could make Creem fire a test event.

**But the finding to read first is not a payment bug at all.** `test/creem.test.mjs` was never imported by `test/index.mjs`, so its 32 cases had never run. `node --test workers/entitlements/test` resolves the directory through its `package.json` main rather than recursing, so the entry point imports each suite by hand, and a file nobody adds to it passes locally and is counted in no total anybody reports. The figure in an earlier revision of the pull request's description, "468 cases", counted 32 cases the suite could not see; sixteen went red the moment the test-mode gate below landed. One test now reads the directory and fails on any `*.test.mjs` the entry point leaves out, so the hole closes for the next file rather than for this one. It is VG-52 in the registry.

### Money fully back in two payments read as two goodwill gestures

**Before:** `isFullCreemRefund` compared **this** refund's amount with what the customer paid. Two refunds of half each therefore read as partial twice, and a month whose money had entirely gone back ran to its end.

**After:** three signals, each sufficient on its own. The transaction's own `status` first — `refunded` against `partialRefund`, which is Creem's verdict; then the transaction's cumulative `refunded_amount`, which is the only one that sees two halves; then this refund's own amount, which is right for the ordinary case. A genuine part refund trips none of the three, so the direction of being wrong is unchanged.

### A refund quoted without the tax the customer paid

**Before:** the same comparison. Creem's own documented example pays 1210 for a 1000 product — 1000 of price and 210 of tax — so a refund quoted at 1000 is the entire sale and reads as 83% of one. Which of the two numbers a refund is quoted in depends on how it was issued, so this is not an edge case.

**After:** the status clause above answers it, because Creem said `refunded` while the arithmetic said no.

### A mid-cycle upgrade took the month from the payment that bought it

**Before:** section 13's third rank, added that morning — a payment that *named* its period outranked one whose period was *inferred*. An upgrade or a proration charged mid-cycle names the period it belongs to, so it took the claim from the month's real payment. Refunding the small charge then ended a month it had not bought, and refunding the real payment ended nothing.

**After:** the rank is **deleted**, not narrowed. It only ever existed because a test fixture gave one payment two transaction ids, and a Creem checkout's order and the first invoice of its subscription are one transaction with one id — so nothing legitimate ever needs a claim to move between two payments. The fixture now says so. First payment for a period keeps it, with no exceptions, which is a simpler rule than the one it replaces.

That deletion left a mutant alive — a claim that always holds, whatever period it was made for — and chasing it found a case nothing covered: a `subscription.update` moves the period end and says nothing about money, so month one's id sits on a period month one did not buy until the paid event behind it arrives. That event lengthens nothing and must still be able to take the claim. It is a test now.

### A charge taken mid-cycle bought a whole extra interval — on all three rails

**Before, and this is the one I would fix first if only one could ship:** money arriving entitled for one plan interval counted from the charge, as a floor, *even when the provider named the period end in the same event*. An upgrade, a proration and a renewal retried after dunning all name their period and are charged inside it, so each one extended access by up to a whole month beyond what was paid for. Not a Creem bug: the arithmetic is in the shared store, so Stripe and Mercado Pago did it too.

**After:** the charge-derived interval applies only when the update names no period of its own. The comment at that call site had always said "not past a period end the update sets itself"; the code did not do it, and nothing tested the difference. Section 18 is the correction this needed, because the new rule was too broad in the other direction.

### A test-mode purchase bought Pro

**Before:** every Creem object carries a `mode` — `test`, `prod` or `sandbox` in the API reference, `local` in the webhook examples — and the worker never read it. A test-mode purchase moves no money, so an event from one reaching the live endpoint with a valid signature was the paid tier for free.

**After:** the three non-production modes entitle nobody unless `CREEM_ALLOW_TEST_MODE` is `"true"`, which is the setting to use while proving the rail works and to put back before the first real sale. A mode this worker does not recognise **still entitles**, deliberately: refusing an unknown one would mean a production value Creem renames stops every real payment, silently, until somebody notices no licences are being issued. That is the worse way to be wrong, and a mutant that makes `prod` an allow-list is in the suite to keep it that way.

Two places Creem's docs disagree with themselves, found while checking the above and worth knowing even though neither is load-bearing: a dispute's transaction status reads `chargeback` in the webhook example and `chargedBack` in the enum, and the refund example's mode is `local`, which the API reference does not list. Both are reasons not to key anything on one spelling.

## 16. The order to switch it on, and what each step costs

**Before:** everything on this branch that touches money is built and switched off, and nothing said which switch to throw first. Several of the steps cost money or take weeks of waiting the moment they are started, and two of them cannot be undone by deleting a file, so guessing the order is expensive.

**After:** `docs/40-GO-LIVE-GATE.md`. It opens with the state of every switch today, then nine ordered steps, and each step says what it costs, what only you can do, what proves it worked, and how to undo it. Then: what costs money and when (only one line costs anything regardless of sales), the three decisions that are yours, and the seven documents that carry the same state if this thread is gone.

**How:** the step that makes the product sellable is step 5, pasting the checkout links, and it is deliberately fifth: the worker has to be redeployed, the terms page filled in, the Creem account opened, and the rail proved end to end in test mode before a link exists that anybody can click. The document also carries the words to post to reopen this thread at the gate, and what the thread will do with them, because the gate is weeks away and the queue here will not remember.

`docs/34-PERU-OPERATOR-RUNBOOK.md` now points at it before its own Stage 0, and the README's document list leads with it.

## 17. Twenty mutants our own tests let live

A QA pass mutated two decisions this branch had already tested and found that neither suite could tell the difference. Both are adopted here as their own files, with their headers rewritten to record what was measured rather than what was claimed.

**The trial-arm derivation.** Which arm of the 7-day-versus-14-day test an account lands in is `parity(HMAC-SHA256(secret, "trial-arm:v1:trial_len_2026_11:" + accountId))`, and the whole value of a test over that is that its expectations are *not* computed by the code under test. So the 22 golden vectors were re-derived from the shell before being trusted — `printf 'trial-arm:v1:trial_len_2026_11:%s' ID | openssl dgst -sha256 -hmac KEY -hex` — and all 22 matched. Five mechanical mutants of the derivation each turn the file red.

**The card scrub's run counting.** Fourteen cases, and the measured result matters more than the finding: four of five mutants die here and under nothing in `reports.test.mjs`, and the fifth dies under neither, correctly. The early-out in `redactLongDigitRuns` is a **cheap guard, not a decision** — mutating it alone changes no outcome, because the counting that decides is `[...group].length` inside `runHasCard`. The source says so now, so the next person to find that mutant surviving does not go looking for a missing test. One claim in the QA note did not survive checking and is recorded as corrected rather than repeated: a single-site mutant of that early-out survives both suites, and it is the *combined* mutation that both catch.

## 18. What period did this money buy?

Two faults, both answering that question in the expensive direction, and the first is a regression from section 15's own fix the same day.

### A paid renewal could buy nothing

**Before:** section 15 stopped counting a plan interval from the charge whenever the event named its own period. That is right for any payment taken mid-cycle and wrong when the named period is already over. Creem's `subscription.paid` "fires for the first payment and every renewal", and its docs show only a first-payment sample: nothing says whether a renewal's snapshot carries the new period or the one just paid off. If it carries the previous one, a paid renewal set the period end to a date in the past and bought no access at all.

**After:** a named period stands in for the charge only if it was still running at the moment of the charge. A snapshot serialised before the period rolled over names a period that is already closed, and the interval from the charge is then the only account there is of what the money bought.

### A Stripe renewal after any plan change was read off the wrong line

**Before:** `mapInvoice` read `invoice.lines.data[0]`. Stripe documents an invoice's lines as sorted "(1) pending invoice items (including prorations) in reverse chronological order, (2) subscription items in reverse chronological order", and a proration's period "ends at the period end of the subscription" as it stood when the proration was calculated. So after any upgrade, downgrade or quantity change, the renewal invoice's **first line is the period that just closed**. The renewal recorded the wrong month; and on a monthly-to-yearly upgrade the plan was read off the credit line too, so a year's payment was stored as a month. Live since the Stripe handler was written, and green under every test in the suite, because every fixture put the subscription's line first.

**After:** the line whose period ends last among the lines that are the subscription's own, in both the pre- and post-`2025-03-31` payload shapes (`proration` and `type` on the line; `parent.type` and `parent.subscription_item_details.proration` since). An add-on invoice item on the same invoice is excluded, because its period length means nothing — a year-long add-on on a monthly renewal is not a year of Pro.

**Both go the same way, and so does the tie-break.** A period ending at the very moment of the charge counts as closed and the interval is counted instead, which can hand out a month that was already paid for. That is deliberate: locking out somebody who has just paid is the worse failure, and it is the failure both of these were.

**Verified first-hand, not remembered.** `docs.stripe.com/api/invoices/object` for the line ordering and `docs.stripe.com/api/invoice-line-item/object` for the proration fields and the `parent.type` enum, both read on 3 November 2026 and quoted verbatim in the source.

**Mutants: 15, of which 11 die.** The five that live are each provably redundant rather than untested, and the source now names which and why — the `isFinite` guard on the charge time cannot change an outcome because every comparison with NaN is false; the two proration clauses and the latest-ending comparison each back up a rule that already gets every documented payload right; and no payload Stripe documents separates the all-side-lines fallback from `lines[0]`. Chasing two of them was worth it: the add-on in the 2025-03-31 shape and a renewal collected nine days late after access had already lapsed were both untested, and are tests now.

## 19. A cancel date is not the end of a month somebody paid for

Two faults on the Creem rail, found by QA attacking section 18's own fixes the same day, and a policy decision that came out of both.

**A cancel date read as a period end.** `subscriptionPeriodEnd` fell back to `canceled_at` when a subscription event named no `current_period_end_date`. Creem's API reference marks `current_period_end_date` merely optional, marks `canceled_at` nullable, describes it as "The date and time when the subscription was canceled, if applicable", and lists `scheduled_cancel` among the statuses (all read 3 November 2026). So for a subscription that will not renew, the cancel date is the moment somebody clicked, and it is always in the past: read as a period end it replaced a month that had been paid for with the moment they changed their mind. The fallback is gone — an absent period end is no statement, not a guess.

**And a yearly subscriber relabelled monthly by the invoice for their own upgrade.** This was the residual recorded when section 18 closed, and it is here because that fix was re-attacked rather than left as a note. `mapInvoice` read the plan off whichever line named the period, and on an upgrade invoiced immediately *every* line is a proration: Stripe lists the credit for unused time on the plan being **left** before the debit for the plan being joined, so the credit named the plan and a yearly licence read back as `pro_monthly` until the subscription's own event arrived. Access was never affected, because the period was named either way. Only the subscription's own line may name a plan now, which is the rule section 18 had already applied to the period.

**The policy, which is a judgement and not a fact:** a Creem subscription event's period is now a floor, so it can only ever lengthen access. Nothing Creem documents makes an active subscription's period end move backwards, while a snapshot serialised before a renewal demonstrably names the period that just closed. Two guesses, and the tie-break goes the way it goes everywhere else here: towards the person who paid. A test that asserted the opposite — that a state event replaces the period, so a downgrade shortens it — is reversed, with its old expectation written down beside it, and a control was added so the lengthening half is still pinned.

**Measured honesty.** With the floor in place, no mutant of the deleted `canceled_at` fallback dies: the two fixes overlap, so the fallback is removed for being the wrong reading of the field rather than for being load-bearing, and the source says so. A comment claiming the opposite was written first and corrected when the mutant run disagreed with it.

Nine cases adopted from QA, one changed from printing what it observed to asserting the decision, plus one written for the first paid event of a subscription that names no period and carries a cancel date. VG-55, VG-56.

## 20. What Pro is for, and what Free keeps

Not a payment fault. The question nobody had written down: what belongs in each tier, and whether the split is worth its price.

**Two Pro features that were never built.** `priority_progressions` and `no_limits` came off the pricing cards in July 2026 when VG-02 was fixed, and were left behind in `can()` and in both dictionaries. So `can("no_limits")` answered *yes* to every Pro subscriber while nothing in the product meant anything by it, and finished marketing copy for a feature that does not exist sat one config line away from being shown again. Both are deleted, and `qa/check-tiers.mjs` (in `npm test`) now fails the build if the names in `can()`, the plan cards and the two dictionaries disagree again, or if a capability exists that no plan sells. **Corrected on 3 November 2026:** the sentence above first said it fails if `can()` disagrees, and that was more than the check does. It compares names and never evaluates `can()`, which needs a browser, so a gate that stops answering yes for something a Pro card sells passed it. QA planted twelve defects and two classes survived; section 22 is what closed them. It caught a bug in itself on its first run, which is the point of it: a regex meant for the `plans:` array matched a payment provider's `id` above it, paired that with the first plan's features, and then reported that there is no free plan at all.

**The price's stated justification does not hold.** `docs/35-PRICING.md` had been using cross-device sync as half the reason the price can sit above the Spanish-language competitor. Sync is free: `PUT /v1/me/progress` asks `requireSession` and nothing else, and `MAX_PROFILES` is 3 on the server for everybody. That was the right call — losing progress in one browser was a P0 for everybody — but it cannot also be the thing Pro is sold on. The pricing doc is corrected in both places it said so, with the date.

**What free has that nothing else does, now said where buyers can see it.** Every competitor that could be verified caps free practice; Riyaz, re-read from its own App Store listing on 3 November 2026, still limits it to 8 minutes a day and sells "unlimited practice" at $24.49 a month. We cap nothing, and until today that sentence lived only in this repository. `pricing.proof1` says it in both languages now. It deliberately does not name competitors in a table, which is what VG-11 originally proposed: a named public comparison goes stale the day one of them changes its limit, nobody here will re-verify five companies quarterly, and a stale public claim about a named competitor is a different kind of problem from a weak headline. The verified table stays in `docs/35-PRICING.md` as the evidence, and the check fails if either the claim or the table disappears.

**The decision this leaves you, in `docs/41-PRO-VS-FREE.md`.** Free gets everything that makes the product work. Pro gets a bundle made mostly of things the evidence says singers do not ask for: across Yousician's public Trustpilot reviews, not one reviewer mentions wanting to export progress, keep several profiles, or receive a coaching report, and those are three of the six things Pro is built out of. What reviewers say they value is structure, practice tools and the habit itself; what they complain about more than anything is billing. The doc lays out three mutually exclusive ways out with their costs, recommends one, and says plainly that it holds no Spanish-language evidence at all, which is the largest hole in it. Nothing is sold yet, so changing the split today costs a commit and changing it after the first sale costs a refund.

**And three red specs that were never missing features.** VG-49 had said since 2026-09-21 that the tests expect three things the product does not show. Re-measured instead of taken on trust: `retention.spec.js` is green 7 of 7 and `pro-features.spec.js` 14 of 14, the practice heatmap is built, free, and hidden on purpose until practice goes back further than the five-week calendar already shows — with a comment saying so and a spec asserting both halves — and the sustain checkbox is one press away because the piano options row opens collapsed. The one spec written against the older layout was fixed. Re-measuring took twenty minutes, and the registry row saying the features were gone had been the reason nobody did it for six weeks.

## 21. Two devices, one new profile, one statement

**Before:** `putProgress` asked the two questions a first write raises — is this profile already stored, and is the account already at its cap — with a read, and then acted on the answer. Both halves were a race.

Two devices writing the same brand-new profile both read "no row", both reached the `INSERT`, and the loser threw `UNIQUE constraint failed`. Nothing on the route's own path catches it: the worker's entry point turns any unhandled throw into `500 internal_error` and one `console.error` line carrying the message, so the learner whose phone and laptop both woke up got a 500 where the documented answer is a 409 carrying the winner's copy to merge against — and the only trace of it anywhere was a log line nobody is watching. `js/sync.js` does the right thing with either — it merges and retries on a 409, and treats an error as retryable — so the cost was a failed sync cycle and a Worker exception rather than lost practice. The server was the side that was wrong. The second half leaves a lasting wrong state: an account one profile short of the cap, opening two at once, ended up holding four with a cap of three, and that cap is a storage-cost guard which turned out to be guarding only against sequential writes.

**After:** one guarded `INSERT ... SELECT ... ON CONFLICT DO NOTHING` decides both, because a guarded write plus `changedRows` is the only atomic condition test D1 gives us. The `WHERE` clause carries the cap and is also what makes the statement parse: SQLite's upsert page says the parser "might not be able to tell if the ON keyword is introducing the UPSERT or if it is the ON clause of a join", and so "the SELECT statement should always include a WHERE clause". Zero rows changed means the write did not land, and the branch after it asks the table which of the two reasons it was rather than guessing — an unreadable row count lands there too, which is the direction worth being wrong in, because a write that did land comes back as a conflict against its own copy and the client merges and retries losing nothing.

**Both halves were reproduced before anything changed**, with the three sequential controls green throughout, which is what says these were races and not a broken cap. Six mutants were run against the fix and all six die: a cap nothing reaches, a cap off by one, no upsert clause, an always-stored answer, the two refusal reasons swapped, and no lookup of who won. VG-57.

## 22. A check nobody had tried to fool

Section 20 added `qa/check-tiers.mjs` so the three hand-maintained lists of what
is free and what is Pro could not drift apart again. It shipped the same day,
and nothing had tried to defeat it. QA attacked it the next hour, planted twelve
defects, and two classes of them survived.

**The differentiator claim was tested with one regex over the whole file**, so
either language satisfied it. Replace the English sentence and the check stayed
green; replace the Spanish one and it stayed green too. Both were reproduced
before the fix. The claim is the only thing we can say to a buyer that no
verified competitor can say back, and half of it could have been deleted in a
translation pass with the build still green. The two dictionaries are read
separately now, with a third check that there are exactly two of those strings
at all, so a missing one cannot read as a passing one.

**And the check never evaluates `can()`.** It cannot: `can()` lives in the page
and needs a browser. So a `map` that stops overriding a key a Pro card sells, or
overrides it with `false`, leaves every name in all three lists in place. Three
such defects were planted and all three passed, each of them a feature a
subscriber paid for and would not get. That half is now
`tests/tier-values.spec.js`, which asks the real `can()` in a real browser, once
as a free visitor and once as a subscriber, and holds the answers to the plan
cards: everything the Free card lists is yes for both, and everything only a Pro
card lists is no for one and yes for the other. Four mutants, all of which fail
that spec and pass the name check.

**The check is now itself tested**, in `qa/check-tiers.test.mjs`: nine cases that
copy the four files it reads, plant one defect, and run it against the copy. A
check nobody has tried to fool is a belief rather than a check, and this one was
a belief for about four hours.

**One QA claim did not survive checking**, and is recorded rather than repeated.
A `free` table that says no to a key the Free card promises was reported as
passing. It does not: each of the five Free-card keys was set to `false` in turn
and the check caught all five. What is genuinely dead code is the `free` value of
a key the `map` overrides, which QA retracted on its own.

**And a tenth case closes VG-52 for this directory.** `qa/check-tiers.test.mjs`
is not in `workers/entitlements/test`, so the completeness guard from section 15
cannot see it. One test reads `package.json` and fails if any `qa/*.test.mjs` is
not named in the `test` script, which is the same hole in the same shape: a test
file nobody runs is worse than no test, because it reads as coverage.

VG-58.

## 23. A floor measured with a ruler that answers in float32

Four tap-target cases, across four suites, compared a measured size against 44
exactly. `getBoundingClientRect()` returns float32 geometry *after* the
element's transform, and the site lifts a button on hover — `transform:
translateY(-1px)` over 0.12 s, with the pointer resting wherever the last click
left it. Stepped through 41 fractional positions of that lift in Chromium on
3 November 2026, a box CSS makes exactly 44 px measures **43.99999237060547 at
14 of them**. So `height < 44` called a compliant control too small about a
third of the time, depending on where the pointer happened to be.

That is the expensive kind of red. A test that fails on geometry nobody got
wrong teaches the next person to re-run it instead of reading it, which is how
`validation.spec.js` sat red for six weeks under a registry row that blamed a
missing feature (section 20).

The four now compare against one `tapFloorLimit()` whose allowance is 0.05 px:
about 6,500 times the error that was measured, and ten times smaller than the
smallest shortfall worth catching. Because this is a fix that makes four tests
*more* permissive, which is the direction that hides defects, the allowance is
pinned from both sides in `tests/tap-floor.spec.js`: a 44 px control clears it
at every point of the lift, and a control that really is 43.5 px or 43 px clears
it nowhere. A fifth case is a control that deliberately asserts nothing about
the misread count, because a Chromium that computes the box exactly would make
the allowance unnecessary rather than wrong.

Found by QA round 10 as QA-66. The number above was measured here rather than
taken from the report. VG-59.

---

## 24. What it costs, and what you see when it breaks

Commit `789df8b`. The part of the list that had had no attention at all.

### The health route could not fail

`/v1/health` answered `ok: true` from booleans read out of the configuration.
Every one of them says whether a *secret is set*. None of them says whether
anything *works*, so the route answered `ok: true` with
`accountsConfigured: true` while D1 was past its daily row limit and every
account route was answering 500. "Configured" and "working" are different
questions and only one of them was being asked.

`?probe=1` now also reads one row from D1 and one key from KV and answers **503**
if either refuses. Three decisions in it are worth stating:

- **It reads and never writes.** The KV free tier allows 1,000 writes a day
  against 100,000 reads, so a probe once a minute — 1,440 operations a day — is
  1.4% of the read allowance and **144% of the write allowance**. A write probe
  would have been the monitoring eating the thing it was monitoring.
- **A binding that is not bound reports `skipped`, and the alarm treats that as a
  failure**, because the worker answers 200 in that state while every account
  route refuses. That is what a deploy that lost a binding looks like.
- **No error text is published.** The route is public, and a database error
  message is not ours to publish.

### Nobody had counted what anything costs

Metered through the real handlers and pinned in `test/cost.test.mjs`:

| What happens | KV writes | D1 statements |
|--------------|-----------|---------------|
| A new Stripe subscriber | 10 | 0 |
| A new Creem subscriber | 11 | 0 |
| A Stripe renewal | 5 | 0 |
| A Creem renewal | 6 | 0 |
| A browser re-checking its licence | 0 | 0 |
| A whole email sign-in | 0 | 19 |
| First saved-progress write | 0 | 6 |
| Each later push | 0 | 7 |
| A batch of 25 usage events | 0 | 1 |

Against KV's free ceiling of 1,000 writes a day, eleven writes a subscriber is
**about 90 new subscribers in one day**. That is a launch day, not a theoretical
number, and past a free ceiling Cloudflare refuses rather than slows:
"further operations of that type will fail with an error".

### The finding that matters most is not ours, it is the providers'

What a refused `kv.put` costs depends entirely on how patient the provider is,
and the three rails differ by three orders of magnitude. Mercado Pago retries
"cada 15 minutos, hasta que reciba la respuesta" with no documented maximum.
Stripe "attempts to deliver events to your destination for up to three days".
Creem's documented backoff is "30 seconds, 1 minute, 5 minutes and 1 hour" —
about 1 h 6 m in total. The daily allowance resets at 00:00 UTC, so two rails
come back and **on the international rail the sale is simply lost**, with nothing
telling either party.

There is a sharper case inside that one. Each webhook sets an idempotency marker
in KV before doing the work and deletes it on failure so the retry is not
dismissed as a duplicate. KV meters writes and deletes separately, so the delete
normally survives a day that has run out of writes. If both budgets are gone the
delete throws from inside the `catch`, the marker stays for its 30-day TTL, and
the provider's retry is answered `200 duplicate` — a purchase lost permanently
rather than until midnight. It needs both ceilings in one day, and it is written
down because it is the only path where a later retry cannot recover.

### A test that asks for the query plan, and what it found

`cost.test.mjs`'s last cases ask SQLite for the plan of every statement a hot
path runs and fail on a `SCAN` of a table that grows with use. Nothing a learner
does scans. One thing an *operator* does: `/v1/admin/funnel`'s plan is
`SCAN events USING COVERING INDEX idx_events_cid_name`, so it reads the whole
events table whatever `days` window is asked for. At 25 events a learner-day and
200 learners a day, the 180-day retention leaves about 900,000 rows, and
5,000,000 ÷ 900,000 is **five opens of the admin stats page before the account's
whole daily D1 read allowance is gone** — and what stops then is not the stats
page, it is sign-in, saved progress and the trial, for everybody, until 00:00
UTC. Two candidate indexes were tried and the planner scanned anyway, because a
range index would cost a sort for the `GROUP BY`. The scan is asserted *as* the
known exception with its threshold written beside it, so it cannot quietly
spread, and the real fix — a daily rollup table — is named in
`docs/43-WHEN-IT-BREAKS.md` §6 with the number rather than built.

### The alarm, switched off

`.github/workflows/health-ping.yml` calls the probe three times an hour and opens
a GitHub issue when it fails, closing it on the next success. It is the only free
push alert available: Cloudflare has no notification type for a Worker erroring
or nearing a usage limit, and its Health Checks and usage-billing notifications
are "Professional plans or higher". Two repository variables arm it, so merging
this turns nothing on. Eight responses were put through the probe step before it
was committed — healthy, 503, a 200 claiming health with a binding in error, a
200 with both bindings unbound, a 404, nothing listening, a trailing-slash base
URL, and the variable unset. One says healthy; the other seven open the issue.

The weakness is GitHub's own: "In a public repository, scheduled workflows are
automatically disabled when no repository activity has occurred in 60 days." A
quiet two months turns the alarm off by itself. That is stated in the document
rather than discovered later.

### What is left is a decision, not code

The $5/month Workers Paid plan converts every ceiling above from a refusal into
about **$0.000055 a subscriber**. It is in `docs/40-GO-LIVE-GATE.md` §3 as the
fourth decision, and it is the only one of the four with a deadline: it is worth
answering before either checkout opens.

VG-60. `docs/43-WHEN-IT-BREAKS.md` is the whole of it.

---

## 25. The ads nobody has switched on yet

Commit `TBD`. The cheapest moment to attack a feature is before anybody has seen
it, and this one has never been switched on. Four findings, each reproduced
against the configuration that actually ships before a line was changed.

### Turning it on showed a button that did nothing

`pickNativeCard` filtered for cards with somewhere to go and then undid its own
filter: `usable.length ? usable : cards`. Both cards that name the home slot ship
with `href: ""`, because the partner links do not exist yet, so the fallback
always fired exactly there.

Changing one value — `adsEnabled`, the single switch step 9 of the gate used to
name — rendered "Micrófono USB de estudio" in the home slot with a "Ver opciones"
button that called `window.open` **zero** times and opened no pricing panel, and
recorded an `ad_click` for the press. A dead button in the most prominent slot of
the free tier is worse than an empty slot, so an empty slot is what it renders
now.

The part worth keeping is not the fix. `tests/ads.spec.js` already patched a
destination onto a card before asserting anything, with the comment *"ensure at
least one card with open-pricing so CTA works without affiliate URL"*. The test
knew. It worked around it and said nothing, which is the same failure as section
15's un-imported suite and section 22's untested guard, in a third costume.

### The slot that really is an advertisement was the only one that did not say so

The AdSense path set `aria-label="Advertisement"` — hard-coded English, in a
Spanish-first product — with no `role`, no visible label and no disclosure, while
the native card beside it carried a translated label, a `role` and a disclosure
line. Measured, not inferred: `aria-label` "Advertisement", `role` null, no
`.ad-native-label`, no `.ad-native-disc`.

It now uses the configured label in the page's language, sets
`role="complementary"`, and renders the same disclosure the card does. A label
above the unit and a disclosure below it are not among the modifications AdSense
prohibits — that list is hiding units, covering them, overlapping content on
mobile, hidden-keyword targeting, distribution in email or software, and anything
that "artificially inflates ad performance" — and nothing here covers the unit.

### An impression was counted before there was an ad

`ad_impression` fired when the unit was *requested*, so it counted an ad that came
back empty and an ad an extension blocked before Google's script ran. Google
documents the right signal: it "adds a parameter to the `<ins>` element called
`data-ad-status`" once a unit "has finished requesting an ad", with the values
`filled` ("An ad was returned to the ad unit and is now showing"), `unfilled`
and `unfill-optimized`.

So the impression now fires on `filled` only, a new `ad_unfilled` event records
the rest — without it, a slot that rendered and filled nothing is
indistinguishable from a slot that never rendered — and an unfilled unit hides
itself using the CSS Google itself recommends for that case. The new event name
is added to the worker's closed set, because a name it does not know is refused.

### You could not look at any of this without going live

The real reason none of the above had been found: the only way to see what ads do
to this product was an approved AdSense account and real ad requests from the live
site. `mode: "preview"` answers the question locally instead. Every slot renders
as it would, chipped **Vista previa**, with the card's button deliberately dead
and labelled *(sin destino todavía)*, and a dashed box the exact minimum height of
an AdSense unit underneath so the layout shift is visible. No third-party script,
no network request, no account, and nothing tracked, because a preview is not an
impression. It is also the only mode that will show a card whose partner link is
still empty — the legitimate use of the fallback the first finding deleted.

Rendered at 420 px it is 380×313 with no sideways scroll. Step 9a of
`docs/40-GO-LIVE-GATE.md` is the two-minute version, and step 9c is the AdSense
account, written out, because that account is the only part of this nobody else
can do.

### One that stays open, because it cannot be closed

When a learner buys Pro mid-session the ad unit is correctly **removed** from the
page rather than hidden — which is what AdSense requires — but `adsbygoogle.js`
and its global stay for the life of the page, since removing a `<script>` tag does
not unload a script. Somebody who has just paid for "no ads" keeps Google's script
until they navigate.

Every remedy is worse than the fault at this stage: a reload on the entitlement
change interrupts whatever they were doing, and a consent gate is a bigger product
decision. The one that costs nothing is the default the gate already recommends,
`mode: "native"`, which never loads it. So it is VG-64, open, and the suite
asserts **both** halves — the unit goes, the script does not — so it is a
measurement rather than a worry, and a future fix has a test to flip.

Seven cases in `tests/ads-redteam.spec.js`, six mutants run against the fixes,
five dead. The survivor is an empty-pool guard whose only caller already writes
`if (card)`, so deleting it changes nothing observable; it is kept because the
documented return type would otherwise be a lie, and the source says exactly that
rather than leaving somebody to hunt for a missing test.

VG-61, VG-62, VG-63, VG-64.
