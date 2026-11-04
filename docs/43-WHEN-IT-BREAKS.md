# When it breaks — what you can see, what it costs, and what to switch on

Three questions this page answers, in this order:

1. **If the payments stopped working right now, how would you find out?**
2. **What does each thing a learner does actually cost, and which ceiling runs out first?**
3. **What is worth switching on, what does it cost, and what does Cloudflare simply not offer?**

The short version of the first answer, before the detail: **today you would find
out because somebody emailed you.** Everything built into this product that could
tell you something is a page you have to open. There is no alert, no email, no
anything that arrives. A webhook that has been answering 500 for a week looks
exactly like a webhook nobody called.

The short version of the second: **Workers KV's free allowance of 1,000 writes a
day is the first ceiling you will meet, and it sits around the one operation that
must not fail — a purchase.** The arithmetic is in section 3.

The short version of the third: **$5 a month.** Not for the capacity — the free
capacity is larger than this product needs for a long time — but because past a
free ceiling Cloudflare *refuses*, and past a paid inclusion it *bills*, and the
bill at this product's scale is a fraction of a cent per subscriber.

---

## 1. What you can see today

Measured from the code on this branch, not from memory.

| Signal | Where it is | What it answers | What it cannot answer |
|--------|-------------|-----------------|-----------------------|
| `GET /v1/health` | public, no key | Is each rail *configured* — which secrets are set, which auth methods exist | Whether anything *works*. Before this branch this route could not fail at all: every value in it is read out of the configuration, so it answered `ok: true` with `accountsConfigured: true` while D1 was past its daily row limit and every account route was answering 500 |
| `GET /v1/health?probe=1` | public, no key | **New on this branch.** Reads two rows from D1 and one key from KV, and answers **503** if either refuses, or if a payment webhook failed inside the last hour (`writes: failing`). A binding that is not bound at all reports `skipped`; `writes: unknown` means the probe cannot tell | Why it failed. The route is public, so no error text is published. It still says nothing about whether a provider's payload or secret is right — a probe cannot buy anything |
| Admin page → *Estadísticas* | `admin.html`, admin address required | The product funnel and A/B exposures over a window of days (`/v1/admin/funnel`, `/v1/admin/experiments`) | Health. These are product numbers. A day with no events looks the same whether nobody practised or the events route was refusing |
| Admin page → *Lo que nos cuenta la gente* | `admin.html` | What users typed into the problem-report form (`/v1/admin/reports`) | Nothing, until somebody bothers to report. **This is currently the only path by which a failure reaches you at all**, and it only carries failures a user noticed and chose to describe |
| Admin page → *Quién tiene Pro* | `admin.html` | Who holds Pro, by what kind of grant, and until when | Whether anybody was *refused* Pro they had paid for |
| Workers Logs | Cloudflare dashboard | The 13 log lines the worker writes (below) | Anything older than **3 days** on the free plan, and anything past **200,000 log events in a day**, after which "a 1% head-based sample will be applied for the remainder of the day" |
| The cron, 09:17 UTC | `wrangler.toml` `[triggers]` | — | Whether it ran. It deletes expired codes, sessions, rate-limit rows and data past the 180-day retention the privacy page promises, and reports nothing either way. It is a Cloudflare trigger, armed by `wrangler deploy` — so unlike the pinger in 4.1 it is not waiting on any branch |
| Cloudflare dashboard graphs | Cloudflare | Requests, errors, CPU time, KV and D1 operations | Anything, unless you open it |

Every row in that table is a **pull**. Nothing in this product pushes.

### What the worker logs, and what it does not

Thirteen lines, all of them `console`, and `[observability] enabled = true` is
already set in `wrangler.toml`, so they reach Workers Logs:

| Line | Where | When |
|------|-------|------|
| `stripe entitlement updated` | `src/index.js` | A Stripe payment entitled somebody — the happy path |
| `creem entitlement updated` | `src/index.js` | Same, Creem |
| `mercadopago entitlement updated` | `src/index.js` | Same, Mercado Pago |
| `stripe webhook rejected` | `src/index.js` | A signature did not verify — **wrong secret, or somebody probing** |
| `creem webhook rejected` | `src/index.js` | Same, Creem |
| `mercadopago webhook rejected` | `src/index.js` | Same, Mercado Pago |
| `stripe event names a license we do not know` | `src/index.js` | A refund or renewal for a licence this worker has never seen |
| `creem event names a license we do not know` | `src/index.js` | Same, Creem |
| `mercadopago notification not applied` | `src/index.js` | A notification that mapped to nothing actionable |
| `login code send failed` | `src/email.js` | The email provider refused a sign-in code — **nobody can sign in by email** |
| `ingest counter` | `src/events.js` | The per-deployment event counter could not be written |
| `report stored` | `src/reports.js` | A user reported a problem |
| `unhandled error` | `src/index.js` | **Anything that threw.** The message only, never the body or headers |

That last one is the catch-all, and it is where a ceiling failure lands: a
`kv.put` that throws because the day's writes are gone is not caught anywhere in
`handleRequest`, so it reaches the entry point's `catch`, logs
`unhandled error <message>`, and answers 500. So the information does exist —
for three days, in a console nobody is watching, as a line that does not say
"we are out of KV writes" unless Cloudflare's own error message happens to.

**There is no log line for a payment that was refused and lost.** The nearest
thing is `unhandled error`, which is also what a null-pointer bug looks like.

---

## 2. Every way this breaks, and what you would actually notice

Ordered by how likely it is to cost money. "Time to notice" assumes today's
setup: nothing is watching.

### 2.1 KV's daily write allowance runs out — 1,000 writes

**What the learner sees.** They pay. The provider's page says the payment
succeeded, because it did — the money moved. Then nothing: no Pro, and on the
Peruvian rail no sign that anything is wrong beyond a page that will not unlock.

**What happens inside.** `kv.put` throws. The webhook answers 500. What happens
next is entirely up to the provider, and the three rails differ in a way that
decides whether the sale survives:

| Rail | Retry behaviour, from the provider's own docs | Outcome of a day that ran out of KV writes |
|------|----------------------------------------------|--------------------------------------------|
| Mercado Pago | 22-second confirmation timeout, then retries "cada 15 minutos, hasta que reciba la respuesta"; "Después del tercer intento, el plazo será prorrogado, pero los envíos continuarán sucediendo" — no documented maximum | **Recovers.** The allowance resets at 00:00 UTC and a retry lands after it |
| Stripe | "Stripe attempts to deliver events to your destination for up to three days with an exponential back off in live mode" | **Recovers**, for the same reason, with three days of margin |
| Creem | "There are 5 attempts in total": the delivery, then 30 seconds, 5 minutes, 30 minutes and 6 hours, each with a 15-second response timeout, and "Events are not retried after 24 hours, even if attempts remain". A merchant can resend by hand from the Developers section of the dashboard, and a manual resend carries a **new** event id while automatic retries keep the same one | **Recovers if the purchase was early enough in the day.** The last automatic attempt is about 6 h 35 m after the sale, so anything bought before roughly 17:25 UTC gets a retry after the allowance resets. Later than that and the sale waits for somebody to press resend — and nothing tells either of you to |

This table was wrong until 2026-11-04 and the correction matters, so it is on the
page rather than only in a commit. It said Creem backs off "30 seconds, 1 minute,
5 minutes and 1 hour", about 1 h 6 m in total, and concluded the sale was simply
lost. That schedule came from a page that now 404s; `docs.creem.io/code/webhooks`
gives the one above, and the real window is six times longer with a hard
twenty-four-hour stop. QA raised it, and the quoted schedule was re-read from
Creem's live page before this was changed.

**Pressing resend is safe, and that is now tested rather than argued.** A manual
resend carries a new event id, which is exactly what the idempotency marker
cannot catch, so the instruction above rests on the entitlement write being
idempotent on its own key. It is, because no period in this worker is ever
counted from `now` — every date comes out of the payload — but that is a property
of today's code, and one `Date.now()` in a period calculation would break it
silently. `test/resend-idempotent.test.mjs` resends a Creem renewal an hour
later under a new id, resends a Stripe invoice, and resends an old renewal after
a newer one, and asserts that everything stored is byte-identical afterwards
apart from `updatedAt`.

So the same ceiling is a delay on two rails, and on the third it is a delay for
most of the day and a sale parked behind a button nobody knows to press for the
rest of it. That asymmetry is still the sharpest thing on this page, and the part
that needs no arithmetic is this: **on no rail does anything tell you.**

**The edge case inside the edge case.** Each webhook sets an idempotency marker
in KV *before* doing the work (`markEventSeen`), and on any failure its `catch`
deletes that marker so the provider's retry is not dismissed as a duplicate
(`clearEventSeen`). KV meters writes and deletes separately — 1,000 of each a
day — so the delete normally succeeds even when writes are gone, and the retry
works. But if **deletes** are also exhausted, `clearEventSeen` throws from inside
the `catch`, the marker stays, and the provider's retry is answered
`200 duplicate`. The purchase is then lost *permanently*, not until midnight,
because the marker lives 30 days (`EVENT_TTL_SECONDS`) and no provider retries
that long — except Mercado Pago, which retries indefinitely and would recover at
the 30-day mark. Deletes are far less used than writes here, so this needs both
budgets gone in the same day; it is written down because it is the one path where
a ceiling loses a sale that a later retry cannot recover.

**Time to notice today:** when the buyer emails you.

### 2.2 D1's daily row allowance runs out — 100,000 written, 5,000,000 read

**What the learner sees.** Sign-in fails, saved progress stops syncing, the free
trial cannot be started. Paying still works on the Stripe and Creem rails, which
touch KV and not D1 — so you can be selling while nobody can log in.

**Which half runs out first.** Almost certainly reads, and almost certainly
because of one page: the admin *Estadísticas* panel. `/v1/admin/funnel`'s query
plan is `SCAN events USING COVERING INDEX idx_events_cid_name` — it reads the
whole `events` table regardless of the `days` window you ask for, because
grouping by browser id would cost a sort otherwise. Two candidate indexes were
tried (`(received_at, cid, name)` and `(cid, received_at, name)`) and the planner
scanned anyway. The arithmetic is in section 3.4, and it is uncomfortable.

**Time to notice today:** when a learner says their progress is not saving, or
when you open the stats page and it errors.

### 2.3 A webhook secret is wrong, rotated, or set on the wrong endpoint

**What the learner sees.** Exactly what 2.1 looks like: paid, no Pro. Except it
never recovers, because every retry is rejected the same way.

**What happens inside.** `<rail> webhook rejected` is logged with the reason, and
the worker answers **400**, which most providers treat as a permanent failure
rather than something to retry. The 400 is right — a body that did not verify is
not a body to act on — but it means a wrong secret converts every sale into a
lost sale, with no recovery window at all.

**This is the failure most likely to happen on the first day**, because it is the
one that depends on copying a value correctly, and because test and live secrets
differ on every provider. `/v1/health` tells you a secret is *set*; nothing tells
you it is the *right* one. The go-live gate (`docs/40-GO-LIVE-GATE.md`) has the
one-purchase proof for each rail, and that proof is the only thing that catches
this.

**Time to notice today:** the first buyer.

### 2.4 The email provider's key expires or its account is suspended

**What the learner sees.** The sign-in code never arrives. Google Sign-In still
works, so only the people who chose email are locked out, which makes it look
like their mail is at fault.

**What happens inside.** `login code send failed <provider> <status>` is logged.
The response to the browser is deliberately the same as a success, so an attacker
cannot use the route to discover which addresses exist — which also means a
*user* cannot tell a provider outage from a typo.

**Time to notice today:** when somebody tells you they never got the code.

### 2.5 The cron stops, or its sweep starts failing

**What you lose.** The privacy page promises deletion at 180 days. A sweep that
silently stops is a promise quietly broken, and it is also the thing holding the
`events` table — and therefore 2.2's read ceiling — down.

**Time to notice today:** never, by design. Nothing reports it.

### 2.6 Storage fills — KV 1 GB, D1 5 GB

Far away at this scale, and listed so it is not a surprise later. The things that
grow are `events` (bounded by the 180-day sweep), `progress` (bounded at 512 KB a
document, 3 profiles an account) and the per-event idempotency markers (bounded by
their 30-day TTL). Nothing here grows without a bound.

### 2.7 A provider changes its payload shape

**What happens inside.** `<rail> notification not applied` or
`<rail> event names a license we do not know`, logged, and then the retry logic in
section 2.1's table decides what happens. This branch has already been bitten by
four versions of this question — `docs/42-WHAT-THIS-BRANCH-CHANGED.md` sections
19 and 20, and VG-51, VG-53, VG-54, VG-55, VG-56 in the registry — which is why
the rule everywhere here is that an ambiguous payload may only ever *lengthen*
access.

**Time to notice today:** the first buyer after the change.

### 2.8 The site itself

GitHub Pages is a different system with its own status page, and the site is
static: if Pages is down, nothing in this document applies, and if the worker is
down the site still loads and simply cannot verify a licence. That split is
deliberate and it is the one piece of good news on this page — a worker outage
degrades the product, it does not remove it.

---

## 3. What it costs, with the arithmetic

### 3.1 What each thing actually spends

Measured on 3 November 2026 by metering the real handlers, and pinned in
`workers/entitlements/test/cost.test.mjs` so the numbers below stay true or the
build fails.

| What happens | KV writes | D1 statements |
|--------------|-----------|---------------|
| A new Stripe subscriber, checkout → licence | **10** | 0 |
| A new Creem subscriber | **11** | 0 |
| A Stripe renewal | **5** | 0 |
| A Creem renewal | **6** | 0 |
| A browser re-checking its licence (`/v1/claim`) | **0** | 0 |
| A whole email sign-in, code → session | 0 | **19** |
| The first saved-progress write of a profile | 0 | **6** |
| Each later progress push | 0 | **7** |
| A heavy evening — twelve pushes | 0 | **84** |
| A batch of 25 usage events, **accepted** | 0 | **30** prepares in 2 batches, about **80 rows written** |
| The same batch **refused** (no `User-Agent`) | 0 | **1** |
| `/v1/health` | 0 | 0 |
| `/v1/health?probe=1` | 0 | **2**, plus one KV read |

Two things worth reading off that table. A browser checking its licence — the
single most frequent thing that happens — costs **nothing** that is metered
tightly, because claims are read-only and licences are cached. And saved progress
never touches KV at all, so an evening of practice cannot eat into the budget a
purchase needs. Both of those are properties worth keeping, which is why the test
asserts them rather than merely measuring them.

**The events row was wrong until 2026-11-04 and it was wrong by a factor of
thirty, so here is how.** The test behind it sent no `User-Agent` and put `cid`
on the envelope instead of on each event. Both are refusal conditions
— `ingestRefusal` answers `automated` for a missing UA, `sanitizeEvent` reads
`cid` off the event and rejects it as `bad_cid` otherwise — so the request this
table called "a batch of 25 usage events" stored nothing and spent its one
statement on the counter that records refusals. Its budget of "≤ 3 statements"
would have passed for any implementation that exists, including one with no
batching at all, which was the single thing it claimed to measure. The accepted
path answers **200**, not the 202 the test asserted. QA found it; the test now
asserts the accepted path, pins the batch sizes so one batch of 25 is
distinguishable from 25 batches of one, and keeps the refusal as a case of its
own that says what it is.

**About "80 rows written", which is the number that matters and no fake can
report.** D1 bills rows, not statements: "Indexes will add an additional written
row when writes include the indexed column". `events` carries two indexes
(`idx_events_cid_name`, `idx_events_received`), so each stored event is three
rows — 75 for a batch of 25 — plus the ingest counter and the per-browser rate
limit row. Only real D1 reports the exact figure; the arithmetic is Cloudflare's
own rule applied to this schema, and section 3.3 now carries what it implies.

### 3.2 The ceilings, verbatim

Read from Cloudflare's own documentation on 3 November 2026.

| Resource | Free | What happens past it | Workers Paid |
|----------|------|----------------------|--------------|
| KV writes | 1,000/day | "further operations of that type will fail with an error"; resets 00:00 UTC | 1 million/month included, then **$5.00/million** |
| KV reads | 100,000/day | same | 10 million/month, then $0.50/million |
| KV deletes / lists | 1,000/day each | same | 1 million/month each, then $5.00/million |
| KV storage | 1 GB | same | 1 GB, then $0.50/GB-month |
| D1 rows written | 100,000/day | "D1 API will return errors to your client indicating that your daily limits have been exceeded" until 00:00 UTC | 50 million/month, then **$1.00/million** |
| D1 rows read | 5,000,000/day | same | 25 billion/month, then $0.001/million |
| D1 storage | 5 GB | same | 5 GB, then $0.75/GB-month |
| Worker requests | 100,000/day | the worker stops answering | 10 million/month, then $0.30/million |
| Worker CPU | 10 ms per invocation | the invocation is killed | 30 million CPU-ms/month, then $0.02/million |
| Workers Logs | 200,000 events/day, 3 days kept | "After the limit is exceed, a 1% head-based sample will be applied for the remainder of the day" | 7 days kept |

The Workers Paid plan has a "minimum charge of $5 USD per month for an account",
and that one charge covers all of the above.

A note on how D1 counts, because it is the one that surprises people: "Rows read
measure how many rows a query reads (scans)", so a query that scans 5,000 rows to
return one "would count as 5,000 rows read". And a write to a column an index
covers counts as two rows written.

### 3.3 Where the free plan actually runs out

**KV writes are the binding constraint, and they bind on purchases.**

- New subscribers: 1,000 ÷ 11 = **about 90 new Creem subscribers in one day**, or
  100 on Stripe. That is a launch day, a press mention, or a TikTok. It is not a
  theoretical number.
- Renewals: a monthly subscriber renews once every ~30 days at 6 writes, so each
  one costs about 0.2 writes a day. 1,000 ÷ 0.2 = **about 5,000 monthly
  subscribers** before renewals alone fill the day. At S/ 19.90 that is roughly
  S/ 99,500 a month in revenue, so the free write ceiling is nowhere near the
  business's limit.
- Mixed, realistically: at 500 subscribers, renewals cost about 100 writes a day
  and leave room for 80-odd new ones.

So the honest statement is that **the free tier's capacity is not the problem; the
free tier's behaviour at the edge is.** You will not grow into this ceiling
gradually. You will hit it on one unusual day, and on that day the international
rail loses the sales rather than deferring them.

**D1 writes are the second ceiling, and analytics is what spends them.** This
paragraph said they were "roughly an order of magnitude looser" and that "nothing
a learner does threatens this", reasoning from statements and assuming one row
each. Both halves were wrong, and in opposite directions: a statement can write
several rows, and events dominate the total. QA worked it through on 2026-11-04;
redone here with Cloudflare's indexing rule and this schema:

- One accepted batch of 25 events is about **80 rows written** (3 per event for
  the row and its two indexes, plus the counter and the rate-limit row).
- The 180-day sweep deletes those same rows later, and "Write operations include
  `INSERT`, `UPDATE`, and `DELETE`", each contributing to rows written. So in a
  steady state every learner-day is paid for twice: about **155 rows**, with
  sign-in's own 19 statements on top of that.
- 100,000 ÷ 155 ≈ **650 learner-days before the free D1 write ceiling is gone**.

That is a far smaller number than this page used to imply, and what happens at
the 651st is the part to sit with: D1 refuses *every* query for the rest of the
UTC day — sign-in, saved progress, the trial, the licence link — because of
analytics. The product stops for a reason none of its users caused.

Two things follow, and only one of them is a decision. The arithmetic says the
events pipeline should shed load before the account layer does, which is a cap on
accepted events per day rather than an operator judgement, and `ingest_daily`
already counts what the cap would read. And the $5/month plan in 4.3 moves this
ceiling too, by a factor of 500. Section 4 says which of those is switched on.

**How you see that it happened.** The cap counts every shed event as
`daily_capped`, and that is a row of its own in the admin page's arrivals list
and a named sentence in the account panel's, in the colour of a fault in both. It
is deliberately **not** summed into "descartados por mal formados" with the
events the worker could not read: a shed event is one it read and chose not to
store, the remedy is yours rather than a bug in the browser, and a number filed
under "malformed" sends a reader after the wrong thing. For a day this was in the
worker and in neither readout, so a shed day read as a quiet one; the two tests
that hold the worker's list of reasons against each page's are what caught it.
A shed day is the signal to raise `EVENTS_DAILY_CAP` on the paid plan, or to send
fewer events.

**Worker requests** at 100,000 a day are not a constraint for a static site whose
browser work is a cached licence check, an occasional progress push and one
batched events call per session.

### 3.4 The one read cost that grows: the stats page

`/v1/admin/funnel` scans the whole `events` table. Put numbers on it:

- 25 events per learner-day is what the browser batches.
- At 200 learners a day that is 5,000 rows a day.
- The cron keeps 180 days, so the steady state is **about 900,000 rows**.
- 5,000,000 ÷ 900,000 = **about 5 opens of the stats page in a day** before the
  entire account's D1 read allowance is gone.

And when it is gone, it is not the stats page that stops — it is sign-in, saved
progress and the trial, for every learner, until 00:00 UTC. **An admin refreshing
a dashboard can take the product down.** This is the strongest argument on this
page for the $5, and section 6 says what the real fix is.

### 3.5 What the paid plan costs at this product's scale

Past an inclusion you are billed, not refused. The bill:

- A new Creem subscriber: 11 KV writes × $5.00/million = **$0.000055**, against
  about $5.30 of revenue. **0.001% of the sale.**
- 3,000 new subscribers in a day stays inside the monthly KV write inclusion.
- 27,000 opens of the stats page a month stays inside the D1 read inclusion.

**$5 a month converts every ceiling in section 3.2 from a refusal into a rounding
error.** That is the whole case for it. It is not capacity.

---

## 4. What to switch on, and where

Ordered cheapest first. Nothing here is required to go live; the first item is
free and closes the biggest hole on this page.

### 4.0 Doing nothing

Worth stating as an option, with its price: a payment rail that breaks stays
broken until a buyer writes to you, and on the Creem rail the sales made while it
was broken are gone rather than delayed. If you are not selling yet, this is a
perfectly reasonable place to be.

### 4.1 Free — the health pinger in this repository

`.github/workflows/health-ping.yml` is on this branch, **switched off**. When it
is on it calls `/v1/health?probe=1` three times an hour, and on a failure it opens
a GitHub issue — which emails you, because you are watching your own repository.
On the next success it closes the issue again, so a blip is one notification and
not a stream.

Two settings arm it, both in **Settings → Secrets and variables → Actions →
Variables** on GitHub, with no code change:

| Variable | Value |
|----------|-------|
| `ENTITLEMENTS_BASE` | the worker's base URL, no trailing slash |
| `HEALTH_PING` | `on` |

The URL goes in a repository variable rather than in the file because **this
repository is public**, and a variable is the cheapest way to keep it out of git
history. `/v1/health` takes no key, so no secret is involved — but one more
thing is needed, and it is not a setting: this branch has to be merged. GitHub
never schedules a workflow that is not on the default branch, which is the first
bullet at the end of this section.

What it is honestly worth: it catches the worker being down, D1 refusing, KV
*reads* refusing, a deploy that broke the routing, a deploy that lost a binding
— `?probe=1` reports `skipped` rather than `error` for a binding that is not
bound at all, and the worker still answers 200 in that state while every account
route refuses, so the workflow treats `skipped` as a failure too — and, since
2026-11-04, **a payment webhook that could not finish**. It does **not** catch a
wrong webhook secret or a provider that changed its payload: those answer 400,
look like a rejected request, and section 2.3 onwards is not visible from
outside.

**That last addition is a correction, and it is the most important one on this
page.** This paragraph used to say the pinger catches "KV refusing". What it
caught was KV *reads* refusing. KV meters reads and writes separately — 1,000
writes a day against 100,000 reads — so past the write ceiling `kv.put` throws
while `kv.get` answers normally, and the probe, which reads and must only read,
went on reporting a cheerful 200 through exactly the failure section 2.1 ranks
first: a purchase that cannot be recorded. The free monitor could not see the
thing this page says to watch. QA found that.

The fix is to stop asking KV. A webhook that fails now writes one row into
`health_flags` in **D1** — a different service on a different daily budget — and
the probe reads it. `?probe=1` gained a third field: `writes` is `ok`,
`failing` if a webhook failed inside the last hour, or `unknown` when the probe
cannot tell (no D1 binding, or a schema that has never been created, which is a
deployment nobody has used rather than a broken one). `failing` makes the route
answer 503, so the alarm above fires on it with a message naming what happened.
It costs one more D1 row read per probe: 2,880 a day at a probe a minute,
against D1's 5,000,000.

It is recorded at the routing layer rather than inside each webhook, because the
first thing every webhook does is a KV write — `markEventSeen`, the idempotency
marker — and that one sits *outside* each handler's own try block. Which makes it
both the likeliest place for the day's thousandth write to throw and the place
whose failure nothing was catching.

The hour is deliberate. Long enough that a pinger on a few-minute schedule sees
it and opens its issue; short enough that one transient failure does not hold the
alarm red until midnight, because a monitor that is always red is a monitor
nobody reads. The row itself stays, as the operator's record of when this last
happened.

Eleven responses have been put through the probe step — healthy, 503, a 200
claiming health with a binding in error, a 200 with both bindings unbound, a 404,
no server listening at all, a base URL with a trailing slash,
`ENTITLEMENTS_BASE` unset, and the three answers the write flag added
(`writes: failing`, `writes: unknown`, and an older worker that sends no
`writes` field at all). Two say healthy — `ok` and `unknown` — and the rest open
the issue. An alarm nobody has tried to make lie is not an alarm.

**And a second correction of the same kind: the step that opens the issue had
never been run at all.** Eleven responses had been put through the *probe* step.
The step after it — the one that opens, comments on and closes the issue — calls
`gh`, and this job has no `actions/checkout`, so there is no git remote for `gh`
to learn the repository from. Confirmed against the tool rather than reasoned
about: gh 2.89.0, in a directory with no `.git`, answers `gh issue list` with
"failed to run git: fatal: not a git repository", and `GITHUB_REPOSITORY`, which
Actions always sets, does not help, because gh reads only `GH_REPO` or `--repo`.
The script swallowed that stderr with `2>/dev/null || true` and ended on an
`echo`, so the run would have been **green**, would have printed "Opened a new
alert issue.", and would have opened nothing. The alarm was a step that could not
run, reporting success.

It now passes `GH_REPO: ${{ github.repository }}` and fails the run on any `gh`
call that fails, so an alert that could not be sent is at least red in the run
history. `qa/health-ping.test.mjs` runs that step as written against a `gh` that
fails exactly the way the real one does: five cases, four of them red before this
fix, one a control that passes either way so the fake cannot be rigged. It is in
`npm test`. QA found it.

It has still never run on a real runner. The first scheduled run after the merge
is the only thing that proves it, and the way to check is to look for the issue
after deliberately pointing `ENTITLEMENTS_BASE` at a URL that answers nothing.

What to know before relying on it, from GitHub's own documentation:

- "Scheduled workflows will only run on the default branch." And: "This event
  will only trigger a workflow run if the workflow file exists on the default
  branch." **So the pinger does nothing at all while it lives on this branch**,
  whatever the two variables above say. It starts on the first merge to `main`,
  and nothing warns you in the meantime: a workflow file on a branch is simply
  never scheduled. QA raised it.
- "The shortest interval you can run scheduled workflows is once every 5 minutes."
- "The `schedule` event can be delayed during periods of high loads of GitHub
  Actions workflow runs", "High load times include the start of every hour", and
  "If the load is sufficiently high enough, some queued jobs may be dropped" —
  which is why the schedule is at 7, 27 and 47 minutes past rather than on the
  hour.
- "In a public repository, scheduled workflows are automatically disabled when no
  repository activity has occurred in 60 days." So a quiet two months silently
  turns the alarm off. That is the one real weakness of this approach, and it is
  the reason it is item 4.1 and not the only item.

### 4.2 Free — Cloudflare budget alerts

Cloudflare's **Budget alerts** email you when account-wide spend crosses a
threshold you set. Worth setting to a low number, both as a spend guard and as a
crude signal that something is generating far more traffic than you expected.
Cloudflare's notifications page does not state whether this is available on the
Free plan, so check your own dashboard rather than taking a number from here.

### 4.3 $5/month — the Workers Paid plan

The case is section 3.5. In one sentence: on the free plan an unusual day refuses
operations and the international rail loses the sales; on the paid plan the same
day costs cents. Switch it on **before** opening either checkout, not after,
because the day you need it is the day you cannot predict.

It also doubles Workers Logs retention from 3 days to 7, which matters when the
thing you are investigating happened over a weekend.

### 4.4 What Cloudflare does not offer, so you do not go looking

Checked on 3 November 2026:

- **There is no notification type for a Worker erroring or approaching a usage
  limit.** The one you would want does not exist.
- **Usage Based Billing notifications** are "Professional plans or higher" and
  "available to Pay-as-you-go accounts only".
- **Health Checks notifications** are "Professional plans or higher".

So the free alerting story on Cloudflare is budget alerts and nothing else, and
that is why 4.1 is an external pinger rather than a Cloudflare setting.

---

## 5. What was built for this, on this branch

| Thing | Where | What it is for |
|-------|-------|----------------|
| `?probe=1` on `/v1/health` | `workers/entitlements/src/index.js` | A health route that can actually fail. Two D1 row reads and one KV read, 503 if either refuses or if a webhook failed within the hour, no error text published because the route is public |
| `test/cost.test.mjs`, 15 cases | `workers/entitlements/test/` | Every number in section 3.1, asserted. Four KV-write budgets, a statement budget for sign-in, progress and events, a proof that a claim spends no writes and progress spends no KV at all, and — since the correction in 4.1 — a webhook whose writes are refused while its reads still work, which must turn the probe red |
| A query-plan guard | the last cases of `cost.test.mjs` | Asks SQLite for the plan of every statement a hot path runs, and fails on a `SCAN` of a table that grows with use. The admin funnel's known scan is asserted *as* the known exception, with its threshold, so it cannot quietly spread |
| `.github/workflows/health-ping.yml` | repository root | Section 4.1. Off until two repository variables are set **and this branch is merged**, because a schedule only runs on the default branch |
| `qa/health-ping.test.mjs`, 5 cases | `qa/` | The alert step of that workflow, run as written against a fake `gh` that fails the way the real one does outside a checkout. Four of the five were red before 4.1's second correction |
| `test/resend-idempotent.test.mjs`, 3 cases | `workers/entitlements/test/` | The one recovery step §2.1 tells the operator to take: a webhook resent by hand under a new event id must leave everything stored identical |

The probe reads and never writes, deliberately: a probe once a minute would be
1,440 KV operations a day, which is 1.4% of the free read allowance and **144% of
the free write allowance.** A write probe would have been the monitoring eating
the thing it was monitoring. That constraint is also what made the blind spot in
4.1: a probe that cannot write cannot discover that writing is refused, so it had
to be told by something that tried — which is what the `health_flags` row is.

---

## 6. What was not built, and why

**Alerting from inside the worker.** An email on failure needs the email
provider, which is one of the things that can fail (2.4), and a worker that emails
on every failed request emails a thousand times on a bad day. Alerting belongs
outside the thing being watched, which is what 4.1 is.

**A rollup table for the funnel.** This is the real fix for 3.4 and it is the
largest piece of work on this page: a small table of daily per-step counts written
as events arrive, so the stats page reads 180 rows rather than 900,000. It is not
built because it is a schema change and a second write path on the hot route, and
because the $5 plan removes the danger for a tenth of the effort. The threshold is
written into the test's comment so the next person meets the number rather than
rediscovering it.

**Logpush, Analytics Engine, or any metrics endpoint.** All of them are either
paid, or another moving part to maintain, and none of them answer a question
section 4.1 does not.

**A synthetic purchase check.** The only test that would catch 2.3 is a real
purchase, and a real purchase moves real money and real tax. The go-live gate's
one-purchase-per-rail proof is the human version of this, done once, deliberately.

**The Creem retry window — which turned out to agree, not to mismatch.**
`RETRY_REFUSED_SECONDS` in `src/index.js` is 86,400: when an event names a licence
this worker has never seen, the worker answers 500 and asks to be retried for a
day before giving up and acknowledging. That window was chosen for Mercado Pago,
whose API can lag behind its own notifications.

This section used to call that a mismatch on the Creem rail, on the figure the
retry table above has now corrected: it said Creem gives up after about an hour,
so the last 23 hours of the window were addressed to nobody. Creem's own page
says "Events are not retried after 24 hours", which is the same number this
constant already holds. One constant, three rails, and on this one it happens to
be exactly right. What is true on the Creem rail is narrower and still worth
knowing: five attempts, the last about 6 h 35 m in, so an out-of-order delivery
has five chances inside that day rather than a day of continuous retrying.

---

## Where the rest is

- `docs/40-GO-LIVE-GATE.md` — the switch-on order, what each step costs, and what
  proves it worked.
- `docs/42-WHAT-THIS-BRANCH-CHANGED.md` — what changed in this branch, section by
  section.
- `docs/VALUE-GAP-REGISTRY.md` — VG-60 is this work.
- `workers/entitlements/README.md` — the worker's own routes and data model.
