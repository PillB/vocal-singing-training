# Accounts, subscriptions and gifted months

What this covers: signing in, saving progress across devices, charging people
every month, and handing out free months to friends, family and testers.

The operator side — the Peruvian trámites, the accounts to open and the keys to
paste, in the order Pablo has to do them — is a separate document:
[34-PERU-OPERATOR-RUNBOOK.md](34-PERU-OPERATOR-RUNBOOK.md).

---

## The shape of it

```
  Browser (GitHub Pages, static)            Cloudflare Worker             Provider
  ------------------------------            -----------------             --------
  js/account.js   sign in, gifts   ─────▶   /v1/auth/*    D1: accounts
  js/sync.js      saved progress   ─────▶   /v1/me/*      D1: progress
  js/license.js   verifies ES256   ◀─────   signed token
  js/billing.js   what Pro means
                                            /v1/webhooks/*  ◀───────────  Stripe / MP
                                            KV: paid licenses
```

Nothing about the site stops being static. The site is still a folder of files
on GitHub Pages; the worker is the only thing that holds state, and it is one
file tree under `workers/entitlements/` with no dependencies.

Three properties this design keeps, and which are worth not trading away later:

1. **A browser cannot give itself Pro.** Pro is granted only for a token signed
   by the worker's private key. `js/license.js` checks that signature against a
   published JWK before anything unlocks. Editing localStorage does nothing.
2. **The worker holds no secret the site needs.** The public JWK is in
   `js/billing-config.js`. The private key exists only as a wrangler secret.
3. **Accounts are optional.** With no `DB` binding, every account route answers
   `503 accounts_not_configured` and the old anonymous pay → claim → license
   flow is unchanged, byte for byte. There is a test that asserts exactly that.

---

## Accounts

**Sign-in is an emailed six-digit code, plus Google.** No passwords: a password
is a thing to leak, reset, and support, and for a practice app it buys nothing.

- `POST /v1/auth/email/start` emails a code. It **always** answers `200` with
  the same body, known address or not, so nobody can use it to find out who has
  an account. Rate-limited per IP and per address.
- `POST /v1/auth/email/verify` trades the code for a session token. Five wrong
  attempts burn the code.
- `POST /v1/auth/google` takes a Google ID token and verifies it properly:
  RS256, a `kid` Google currently publishes, the signature, the issuer, our
  audience, expiry, and `email_verified`.

**Sessions are bearer tokens, not cookies.** `pillb.github.io` calling
`*.workers.dev` is cross-site; third-party cookies are gone in every browser
that matters. The token sits in `localStorage` under `vt_account_session_v1`,
travels in the `Authorization` header, and the database stores only its
SHA-256. A stolen database row cannot be replayed as a session.

Two identities — `email` and `google` — can point at one account, so signing in
with Google after using a code lands on the same practice history.

---

## Saved progress

`GET/PUT/DELETE /v1/me/progress`, one document per `(account, profile)`, up to
three profiles, 512 KiB each.

**Progress is merged, never chosen between.** The rule that shapes the code: a
sync must never lose a session somebody actually did. So:

- Exercise histories are **unioned by entry id**, newest 50 kept, and
  `completedCount` takes the larger of the two — the history is capped, so it
  cannot be recomputed from the entries.
- The 12-week plan is a state machine, not a list, so it cannot be unioned. The
  honest answer is "whichever device got further": week, then completed
  elements, then check-ins.
- Reviews and hold logs are unioned by content identity and sorted by time.
- Goals are a single value with no history, so the more recently saved side
  wins.

**Concurrency is a compare-and-swap.** Every write carries the `rev` the client
last read; the server's `UPDATE ... WHERE rev = ?` is the guard. A `409` is not
an error — it means another device got there first, so the client merges the
server's copy in and writes again. Three attempts, then it gives up until next
time.

Recordings stay in IndexedDB. They are megabytes each and are not what "don't
lose my progress" means.

Syncing is debounced by 8 seconds after a saved result, so a practice session is
one write rather than one per repetition. That matters on a free-tier database.

---

## One mechanism for trial, gift and comp

This is the part worth reading twice, because it is where a system like this
usually grows three half-built copies of the same idea.

**The trial, a gifted month and a comped account are the same database row.**

```sql
grants(id, account_id, kind, plan, starts_at, ends_at,
       source, note, issued_by, revoked_at, revoked_by)
```

`kind` is `trial`, `gift` or `comp`. That is the only difference. Consequently:

- **Repeatable**: gifting again is another row. There is no limit and no state
  to reset.
- **Revocable**: `revoked_at` is set, and the account loses Pro on its next
  license refresh — within 24 hours by default, immediately on reload. One
  column, one code path, works identically for a trial, a gift and a comp.
- **Auditable**: `issued_by`, `note` and `revoked_by` mean you can answer "who
  gave this person a free year and why" a year later.

The trial is **one per account, ever**, enforced by `accounts.trial_used_at`
rather than by counting grants — so revoking somebody's trial does not hand them
a second one. The old browser-local trial in `js/billing.js` still exists for
deploys with no worker, but once accounts are configured the pricing panel
routes the trial through the account: a trial tied to a person cannot be farmed
by clearing localStorage.

Gifts come in two shapes, because the two situations are different:

- **Straight to an email** (`POST /v1/admin/grants`) — for a friend you already
  know the address of. It works whether or not they have signed up yet.
- **A code** (`POST /v1/admin/gift-codes`) — `VOCAL-XXXX-XXXX`, N uses, N days,
  for handing out at a class or to testers. The alphabet has no `O/0`, `I/1` or
  `U`, because these get read aloud and written down. A unique index on
  `(code, account)` makes double redemption impossible rather than unlikely.

Revoking a code stops further redemptions and deliberately leaves months already
given alone — taking back something somebody is already using needs to be a
separate, explicit act.

**Who can gift**: any account whose email is in `ADMIN_EMAILS`. That is read on
every request, so removing an address revokes the power at the next deploy,
with no session to hunt down.

---

## How Pro is decided

`resolveEntitlement` reads **both** stores and returns whichever access runs
longest:

- D1 `grants` — trials, gifts, comps.
- KV `lic:*` — the paid subscriptions the webhooks already maintain.

Nothing is mirrored between them, so nothing can drift. An open-ended paid
subscription outranks any dated grant, which is the right answer when somebody
with a gifted month decides to pay.

The worker then mints a short-lived ES256 token carrying the plan, the period
end and the account id. The browser verifies it. That token is the only thing
that unlocks anything.

---

## Payments

The rails decision, and everything Pablo must register for, is in
[34-PERU-OPERATOR-RUNBOOK.md](34-PERU-OPERATOR-RUNBOOK.md). In short:

- **Peru and LATAM → Mercado Pago Perú.** Its Suscripciones product is
  available in Peru, prices in soles, charges a saved card automatically each
  month, and retries a failed charge four times over ten days before giving up.
  The worker already verifies its webhooks.
- **Rest of the world → a merchant of record.** Somebody else is the legal
  seller, owes the VAT wherever the customer is, and pays Pablo. Stripe cannot
  be that seller: Peru is not a Stripe merchant country. Stripe *payouts* to
  Peru are a different thing and do work, which is why merchants of record can
  pay a Peruvian seller — see the runbook for which ones say so in writing.

Both sit behind the single provider interface already in the repo. Adding a
third is a webhook handler and a config entry, not a redesign.

An anonymous visitor who pays and then signs up is not stranded:
`POST /v1/me/link` attaches a checkout they paid for before they had an account.

**Gifting does not depend on the payment provider.** A gifted month is a row in
our own database, not a 100%-off coupon at Paddle or Polar — which matters more
than it sounds, because not one of those providers documents whether a
100%-off coupon is even possible. Whichever rail Pablo ends up on, and if he
changes rails later, gifting works the same way.

---

## What it costs to run

Zero, until it is not. Cloudflare Workers, KV and D1 all have free tiers this
workload sits well inside at small numbers; the sign-in emails are the first
thing likely to need a paid plan. Exact current limits are in the runbook.

---

## Rules that must not be broken

- The ES256 private key is a wrangler secret. It never goes in the repo, never
  in a chat message, never in a config file.
- No `sk_live_…` or `whsec_…` in client JavaScript, ever. The browser gets the
  **public** JWK and nothing else.
- `demoUnlockEnabled` ships `false`. A public build must never hand out Pro.
- `SITE_ORIGIN` and the site's real origin must match exactly, or every token
  fails its audience check and CORS blocks everything.

**The honest limit, worth repeating rather than overclaiming**: every Pro
feature runs in the browser, so devtools can still reach them. What is closed is
forged, shared and post-cancellation entitlements — not a determined person with
a debugger.

---

## Tests

| Command | Covers |
|---------|--------|
| `npm run test:worker` | 212 node cases: schema, sessions, grants, gift codes, progress CAS, Google token verification, email, the API router, and one asserting the old anonymous flow is unchanged. |
| `npx playwright test tests/accounts.spec.js` | 19 browser cases: sign-in, gifts, admin tools, the trial, sync and merge, phone layout and tap targets. |
| `npx playwright test tests/billing.spec.js` | The existing 22, unchanged. |

The worker tests run the **real SQL** against `node:sqlite` through a D1-shaped
adapter, not a hand-written fake, so a statement that D1 would reject fails
locally too.

---

## File map

| File | What it holds |
|------|---------------|
| `workers/entitlements/src/schema.js` | The tables. Idempotent; created on first use. |
| `workers/entitlements/src/db.js` | Ids, hashing, rate limits, expiry sweeping. |
| `workers/entitlements/src/accounts.js` | Sessions, login codes, identities, admin check. |
| `workers/entitlements/src/grants.js` | Trials, gifts, comps, codes, entitlement resolution. |
| `workers/entitlements/src/progress.js` | Saved progress and the compare-and-swap. |
| `workers/entitlements/src/google.js` | Google ID token verification. |
| `workers/entitlements/src/email.js` | Resend / Brevo / MailerSend, one shape. |
| `workers/entitlements/src/api.js` | Every `/v1/auth`, `/v1/me` and `/v1/admin` route. |
| `js/account.js` | `VTAccount` — sign in, gifts, the admin panel's calls. |
| `js/sync.js` | `VTSync` — the merge and the read-merge-write cycle. |
| `js/storage.js` | `readSyncBag` / `writeSyncBag`, the bridge to local state. |
