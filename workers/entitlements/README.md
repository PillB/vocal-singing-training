# Entitlements worker (`vocal-studio-entitlements`)

The server half of Pro. GitHub Pages cannot hold a secret key or verify a
`Stripe-Signature`, so everything that decides *whether someone actually paid*
lives here, in a Cloudflare Worker.

It does four things:

1. Receives **Stripe** and **Mercado Pago** webhooks and verifies their
   signatures before reading a single field.
2. Stores one **entitlement record per subscription** in KV
   (`plan`, `status`, `periodEnd`, provider ids).
3. Issues short-lived **ECDSA P-256 (ES256) license tokens** that the browser
   verifies offline against a published public key.
4. Re-issues those tokens on demand, so a cancellation or a failed renewal
   stops Pro at the next re-check instead of "whenever the user clears
   localStorage".

Zero npm dependencies: plain ES modules, WebCrypto, `fetch`.

```
Checkout (Stripe / Mercado Pago)
  → signed webhook  → verify signature → (Mercado Pago: re-read state from the API)
  → KV upsert (idempotent by event id, keyed on subscription id)
  → POST /v1/claim {sessionId}     → { licenseId, token }
  → browser stores licenseId, verifies token against the public JWK
  → POST /v1/license {licenseId}   → fresh token (revocation + renewal propagate)
```

## Token format

Compact JWS-like, three base64url parts joined by `.`:

| Part | Content |
|------|---------|
| header | `{"alg":"ES256","typ":"VSL","kid":"<LICENSE_KEY_ID>"}` |
| payload | `{"iss":"vocal-studio-entitlements","sub":"<licenseId>","aud":"<SITE_ORIGIN>","plan":"pro_monthly"\|"pro_yearly","status":"active"\|"past_due"\|"canceled","provider":"stripe"\|"mercadopago","iat":<unix s>,"exp":<unix s>,"periodEnd":<unix s or null>}` |
| signature | ECDSA P-256 / SHA-256 over ASCII `header.payload`, raw IEEE-P1363 64 bytes, base64url, unpadded |

`sub` (the license id) is 32 random bytes as base64url. It doubles as the bearer
"license key" the client stores. Lifetime is `LICENSE_TTL_SECONDS` (default
`259200` = 72h), **capped at `periodEnd` whenever the record has one** — see
"Access ends at the end of what was paid for" below.

Stored records have a fourth status, `pending`: a checkout completed but the
money has not arrived yet (delayed payment methods — bank debit, boleto, OXXO).
It never issues a token, so `pending` never appears in a payload; the routes
answer **202 `{ok:false,reason:"pending"}`** and the browser keeps polling until
`checkout.session.async_payment_succeeded` (→ `active`) or
`async_payment_failed` (→ not entitled) settles it.

## Routes

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/webhooks/stripe` | Signed Stripe events. 400 on a bad signature. |
| POST | `/v1/webhooks/mercadopago` | Signed Mercado Pago notifications; state is then re-read from the MP API. |
| POST | `/v1/claim` | `{provider, sessionId}` → `200 {ok, licenseId, token, entitlement}`, `202 {ok:false,reason:"pending"}` while the webhook is still in flight *or* while an async payment settles, `404` for garbage. |
| POST | `/v1/license` | `{licenseId}` → a fresh token from live KV state. `404` unknown, `202 {reason:"pending"}` while an async payment settles, `403 {reason:"inactive"}` once the paid period has ended. |
| GET | `/v1/jwks` | The public key as a JWK set, with `kid`. |
| GET | `/v1/health` | `{ok, stripeConfigured, mercadopagoConfigured, signingKeyConfigured, siteOrigin, accountsConfigured, authMethods}` — booleans and the public Google client id only. |

Accounts, grants and saved progress (all of these need the `DB` binding; without
it every one of them answers `503 {reason:"accounts_not_configured"}` and the
routes above are untouched):

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/auth/methods` | Which sign-in methods this deploy actually has. |
| POST | `/v1/auth/email/start` | `{email}` → emails a 6-digit code. Always `200` with the same body, known address or not. |
| POST | `/v1/auth/email/verify` | `{email, code}` → `{token, account, entitlement, licenseToken}`. |
| POST | `/v1/auth/google` | `{credential}` — a Google ID token, verified against Google's JWKS. |
| POST | `/v1/auth/logout` | Drops the bearer session. |
| GET | `/v1/me` | The account, its entitlement, and a fresh license token when entitled. |
| POST | `/v1/me/link` | `{provider, sessionId}` — attaches a checkout the visitor paid for anonymously. |
| POST | `/v1/me/trial` | Starts the one free trial. `409 {reason:"trial_used"}` the second time. |
| POST | `/v1/me/redeem` | `{code}` — redeems a gift code. |
| GET/PUT/DELETE | `/v1/me/progress` | Saved progress for one profile. `PUT` takes `{profileId, doc, baseRev}` and answers `409` with the server's copy when the revision moved. |
| POST/GET | `/v1/admin/gift-codes` | Mint or list gift codes. |
| POST | `/v1/admin/gift-codes/revoke` | Stop a code being redeemed again. |
| POST/GET | `/v1/admin/grants` | Gift months straight to an email, or list an account's grants. |
| POST | `/v1/admin/grants/revoke` | Take a gifted month back. |
| GET | `/v1/admin/account` | Look an account up by email. |
| POST | `/v1/admin/sweep` | Delete expired sessions, codes and rate-limit rows, and events, exposures and ingest counters past 180 days. |

Anonymous usage events and A/B results (`src/events.js`; also need `DB`):

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/events` | A batch of up to 25 events from the site's beacon (`text/plain` JSON). `200 {ok, accepted, dropped}`; `202` and nothing stored for GPC/DNT, automated user agents, or `EVENTS_ENABLED=false`; `403` from any origin but `SITE_ORIGIN`; `429` past a limit (below). |
| POST | `/v1/events/forget` | `{cid}` → deletes every event and exposure for that browser id: `200 {ok, deleted: {events, exposures}}`. Sent by the guide's opt-out switch. Always allowed (GPC, DNT and the kill switch do not stop a deletion); origin-checked, 30 per address per hour. |
| GET | `/v1/admin/experiments` | Every registered experiment with exposures per arm and the sample-ratio check, plus `ingest`: the last 7 days of ingest counters and when the last event arrived. |
| GET | `/v1/admin/experiments/results?experiment=KEY` | The preset primary metric and guardrails per arm, the sample-ratio check, the instrumentation check (`eventMix`), where the test stands against its plan (`horizon`), and a one-word `readMe`. `event`/`kind`/`from`/`to` ask for one exploratory metric instead; `control` and `weights` override the registry's. `404` for a key not in the registry. |

Admin routes require a session whose email is in `ADMIN_EMAILS`; that list is
read per request, so removing an address revokes it on the next deploy.

### Reading an A/B result

`EXPERIMENT_PRESETS` in `src/events.js` is the registry: for each experiment
its arms and weights (the same as `js/experiments-config.js`; a test fails if
they differ), what it is judged on, and its **plan** — `nPerArm` people per arm
and at least `minDays` days since the first exposure. An exposure for a key or
an arm not in the registry is kept as a plain event and never counted.

- **Fixed horizon.** The result is read on the people exposed up to the moment
  the last arm reached `nPerArm`, once all of them are past their longest
  metric window and `minDays` have passed (`horizon.readyAt`). Before that the
  answer has each arm's counts and intervals but no differences and no
  p-values (`withheld: true`), and `readyAt` is an estimate from the arrival
  rate (`estimated: true`). After it the answer no longer changes, so looking
  again cannot move it.
- **`readMe`**, most serious first: `srm` (the split does not match the
  weights, chi-square p < 0.001), `instrumentation` (an arm does not send an
  event the result reads, or `app_open` arrives at different rates per arm),
  `too_early`, `small_sample` (an arm under 30), `ok`. The sample-ratio and
  instrumentation checks are always in the answer.
- **Metrics must be sent by every arm.** Each preset lists, per arm, the events
  that come from the screens the arms differ in (`armEvents`); none of them may
  be a metric (`presetProblems`, run by the tests). `tests/ab-events.spec.js`
  runs the real site in every arm of every experiment and checks that each
  metric's event is sent the same number of times in each.
- **Exposures are re-asserted.** Every `app_open` carries `x_<key>: <arm>` for
  each switched-on experiment the browser has been exposed to. The first
  exposure the worker receives is kept (`INSERT OR IGNORE`), so this only fills
  in exposures whose own beacon never arrived.

### Event limits

| Limit | Value | Why |
|-------|-------|-----|
| Requests per browser id | 180 / hour | The site sends about 65 in an hour of practice; this only stops one browser stuck in a loop. |
| Requests per address | 3000 / hour | A backstop. A class of twelve on one wifi sends about 780. |
| New exposures per address | 100 / UTC day | Fabricated exposures are what could move a result. Events over the cap are kept, and the next `app_open` re-asserts. |
| Body | 16 KB, 25 events | A full batch is about 6 KB. |

### What the events tables hold, and for how long

| Table | Holds | Kept |
|-------|-------|------|
| `events` | Event name (from a fixed list), flat id-like props (no free text), the random browser id, the visitor's local day and time-zone offset, and when it arrived. | 180 days |
| `exposures` | Experiment, browser id, arm, when and on which local day the first exposure arrived. | 180 days |
| `ingest_daily` | UTC day, a reason from a fixed list (`accepted`, `unknown_event`, `origin_not_allowed`, `rate_limited`, `exposure_new`, `exposure_recovered`, …), a count. No id, no address. | 180 days |
| `rate_limits` | `ev:` and `exn:` buckets keyed by an HMAC of the address and the UTC day under a secret key (not reversible without it); `evc:` buckets keyed by the browser id. | Deleted by the daily sweep, within two days |

No IP address, user agent, account id or email is stored with any of it. The
daily cron (`17 9 * * *`) runs the sweep, and `/v1/events/forget` deletes one
browser's rows at once. privacy.html and the guide's section 14 say exactly
this; `tests/ab-events.spec.js` fails if the fields sent and the text drift.

Sessions are bearer tokens in the `Authorization` header, not cookies:
`github.io` → `workers.dev` is cross-site, and third-party cookies are gone.

CORS is restricted to `SITE_ORIGIN` (with `OPTIONS` preflight). Bodies over
1 MiB are refused with 413. Non-`POST` on a webhook route is 405.

## Bindings

Public, committed in `wrangler.toml`:

| Var | Meaning |
|-----|---------|
| `SITE_ORIGIN` | Exact site origin, e.g. `https://pillb.github.io`. Token audience and the only allowed CORS origin. |
| `LICENSE_KEY_ID` | `kid` in the token header and the JWKS. Bump on rotation. |
| `LICENSE_TTL_SECONDS` | Token lifetime (clamped to 60…2592000). |
| `STRIPE_PRICE_PRO_MONTHLY` / `STRIPE_PRICE_PRO_YEARLY` | Optional price → plan mapping. |
| `MP_PLAN_PRO_MONTHLY` / `MP_PLAN_PRO_YEARLY` | Optional `preapproval_plan_id` → plan mapping. |
| `TRIAL_DAYS` | Length of the free trial, in days. One per account, ever. Default 7. |
| `ADMIN_EMAILS` | Comma-separated emails allowed to gift and revoke months, and to read A/B results. |
| `GOOGLE_CLIENT_ID` | Google Sign-In client id. Public by design. Empty disables Google sign-in. |
| `EMAIL_PROVIDER` | `resend`, `brevo` or `mailersend`. Empty disables email sign-in rather than dropping codes silently. |
| `EMAIL_FROM` / `EMAIL_FROM_NAME` | Sender of the code emails. Must be a verified sender at the provider. |
| `EVENTS_ENABLED` | `"false"` stops recording anonymous events at once (nothing is stored, not even counters). Deletions still work. |

Secrets — **never** in this repo, only `wrangler secret put`:

| Secret | Meaning |
|--------|---------|
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` for *this* endpoint (test and live differ). |
| `MP_WEBHOOK_SECRET` | Mercado Pago webhook signing secret. |
| `MP_ACCESS_TOKEN` | Mercado Pago access token, used only for server-side reads. |
| `LICENSE_PRIVATE_KEY_PKCS8_B64` | base64 PKCS#8 P-256 private key. |
| `RESEND_API_KEY` / `BREVO_API_KEY` / `MAILERSEND_API_KEY` | Only the one named by `EMAIL_PROVIDER`. |
| `EVENTS_IP_KEY` | Optional. The key the rate-limit buckets are an HMAC under. Without it a key derived from `LICENSE_PRIVATE_KEY_PKCS8_B64` is used; with neither, `/v1/events` answers `503`. Any long random string. |

KV: one namespace bound as `ENTITLEMENTS`.

```
event:<provider>:<eventId>            "1"          30d TTL   idempotency
lic:<licenseId>                       record JSON            the entitlement
claim:<provider>:<sessionOrPaymentId> licenseId    90d TTL   ?billing=success lookup
sub:<provider>:<subscriptionId>       licenseId              keeps one license per subscription
```

D1: one database bound as `DB`, optional. The schema is created on first use
(`ensureSchema`, every statement `IF NOT EXISTS`), so there is no migration step
to forget — deploying is enough.

| Table | Holds |
|-------|-------|
| `accounts` | One row per person. `email_normalized` is unique; `trial_used_at` is why a revoked trial does not hand out a second. |
| `identities` | `(provider, subject)` → account. `email` and `google` can both point at one account. |
| `sessions` | Only a SHA-256 of the bearer token, never the token. |
| `login_codes` | One-time codes, hashed, with an attempt counter. |
| `grants` | **Trial, gift and comp are the same row.** `revoked_at` is how any of them is taken back. |
| `gift_codes` / `gift_redemptions` | Codes and who used them. A unique index makes double redemption impossible. |
| `license_links` | Which paid licenses belong to which account. |
| `progress` | One document per `(account, profile)` with a `rev` for compare-and-swap. |
| `rate_limits` | Per-IP and per-email counters for the sign-in routes, and the event route's buckets. |
| `events` / `exposures` / `ingest_daily` | Anonymous usage events and A/B exposures; see "What the events tables hold" above. |

`resolveEntitlement` reads the D1 grants **and** the KV paid records and returns
whichever access runs longest, so nothing is mirrored between the two and
nothing can drift. An open-ended paid subscription outranks any dated grant.

## Deploy

```bash
cd workers/entitlements

# 1. KV namespace — paste the printed ids into wrangler.toml
wrangler kv namespace create ENTITLEMENTS
wrangler kv namespace create ENTITLEMENTS --preview

# 1b. Accounts database — paste the printed id into wrangler.toml.
#     Skip this and the worker keeps working; accounts simply stay off.
wrangler d1 create vocal-studio-accounts

# 2. Signing key (prints the private key and the public JWK)
node scripts/generate-keys.mjs k1

# 3. Secrets (each one reads from stdin; nothing touches the repo)
wrangler secret put STRIPE_WEBHOOK_SECRET
wrangler secret put MP_WEBHOOK_SECRET
wrangler secret put MP_ACCESS_TOKEN
wrangler secret put LICENSE_PRIVATE_KEY_PKCS8_B64
wrangler secret put RESEND_API_KEY        # accounts only, matching EMAIL_PROVIDER
wrangler secret put EVENTS_IP_KEY         # optional: its own key for the event route's address buckets

# 4. Ship
wrangler deploy

# 5. Sanity check (booleans only, no key material)
curl https://<your-worker-host>/v1/health
curl https://<your-worker-host>/v1/jwks
```

Then wire the site up in `js/billing-config.js`:

```js
verification: {
  apiBaseUrl: "https://<your-worker-host>",   // no trailing slash
  publicKeyJwk: { /* the public JWK printed by generate-keys.mjs */ },
  audience: "",            // empty = this site's origin, must equal SITE_ORIGIN
  revalidateHours: 24,
  required: true
}
```

`SITE_ORIGIN` in `wrangler.toml` and the site's own origin must match exactly,
or every token fails its audience check and CORS blocks the calls.

### Key rotation

Generate a new pair, bump `LICENSE_KEY_ID` (`k1` → `k2`), `wrangler secret put
LICENSE_PRIVATE_KEY_PKCS8_B64`, deploy, then publish the new JWK in
`billing-config.js`. Tokens signed with the old key stop verifying as soon as the
site has the new JWK, so expect a wave of re-checks (the client just calls
`/v1/license` again). Rotate immediately if the private key ever leaves the
secret store.

## Access ends at the end of what was paid for

A token's `exp` is capped at the record's `periodEnd` for **every** status, not
just cancellations, and `/v1/license` refuses once `periodEnd` has passed. That
is what stops a Mercado Pago Checkout Pro payment — a one-off charge with no
subscription lifecycle behind it — from becoming lifetime Pro: a payment-derived
record is entitled for one plan interval from its approval date (31 days for
`pro_monthly`, 365 for `pro_yearly`), and each renewal charge extends it.
A charge never *shortens* an existing period.

Consequences worth understanding before you ship:

- **A missed renewal webhook ends access at `periodEnd`, by design.** We prefer
  a paying customer briefly losing Pro (one `/v1/license` call after the
  provider catches up restores it) over a cancelled customer keeping it forever.
- **The providers' own retries are what keep `periodEnd` moving.** Stripe
  retries a failing endpoint for up to ~3 days and `invoice.paid` /
  `customer.subscription.updated` carry the new period; Mercado Pago retries
  too, and `subscription_authorized_payment` extends by one interval. If the
  worker is down for longer than a billing period, expect expiries — watch for
  repeated non-2xx in the Stripe/MP dashboards, and replay events from there.
- **Out-of-order delivery cannot resurrect a dead entitlement.** Every update
  carries `occurredAt` (Stripe's `event.created`; Mercado Pago's
  `date_last_updated`/`last_modified`), stored on the record. An update older
  than the stored one may not change plan, status or `periodEnd` — so a late or
  retried `invoice.paid` arriving after `customer.subscription.deleted` is
  filed, not applied. Identity fields and the claim/subscription indexes are
  order-independent and are still written.

## Registering the webhooks

### Stripe

Dashboard → Developers → Webhooks → *Add endpoint*
`https://<your-worker-host>/v1/webhooks/stripe`

Subscribe exactly these events:

| Event | Why |
|-------|-----|
| `checkout.session.completed` | Payment Link / Checkout finished — this is what `/v1/claim` looks up. Only `payment_status` `paid` / `no_payment_required` entitles; anything else is stored `pending` |
| `checkout.session.async_payment_succeeded` | A delayed payment method finally cleared → `active` |
| `checkout.session.async_payment_failed` | It never cleared → not entitled |
| `customer.subscription.created` | First subscription state |
| `customer.subscription.updated` | Plan change, renewal, status change |
| `customer.subscription.deleted` | Cancellation |
| `invoice.paid` | Successful renewal (moves `periodEnd` forward) |
| `invoice.payment_failed` | Dunning → `past_due` |

Copy that endpoint's `whsec_…` into `STRIPE_WEBHOOK_SECRET`. **Test mode and
live mode have different secrets and usually different endpoints.**

Payment Link success URL (Dashboard → Payment Link → After payment → custom):

```
https://pillb.github.io/vocal-singing-training/?billing=success&plan=pro_monthly&provider=stripe&session_id={CHECKOUT_SESSION_ID}
```

Yearly: `plan=pro_yearly`. Status mapping: `active`/`trialing` → `active`;
`past_due`/`unpaid` → `past_due` (a grace state that still entitles);
`incomplete` → `pending`, because that is a subscription whose *first* payment
never succeeded — the same "money has not arrived" case as an unpaid session, so
it must not get the grace that an existing subscriber gets;
`canceled`/`incomplete_expired` → `canceled`. Plan mapping: price id → `session.metadata.plan` → subscription
interval (`month` → `pro_monthly`, `year` → `pro_yearly`).

### Mercado Pago

Your integrations → *Webhooks* (not legacy IPN) → URL
`https://<your-worker-host>/v1/webhooks/mercadopago`, and copy the generated
signing secret into `MP_WEBHOOK_SECRET`.

Subscribe: `payment`, `subscription_preapproval`,
`subscription_authorized_payment`.

The `x-signature` header is verified against the documented manifest
`id:<data.id lowercased>;request-id:<x-request-id>;ts:<ts>;` (segments whose
value is absent are omitted). After that the notification body is treated as a
*pointer only* — the worker re-reads state from the API with `MP_ACCESS_TOKEN`:

| Kind | Endpoint |
|------|----------|
| `payment` | `GET /v1/payments/{id}` |
| `subscription_preapproval` | `GET /preapproval/{id}` |
| `subscription_authorized_payment` | `GET /authorized_payments/{id}` |

Payment `approved` / preapproval `authorized` → `active`; `paused`/`cancelled` →
`canceled`; anything else → `past_due`. An approved payment sets the period to
one plan interval from its approval date; a preapproval's `next_payment_date`
sets it directly. `next_retry_date` is a dunning date and is never used as a
paid-through date. The plan comes from
`MP_PLAN_PRO_MONTHLY`/`MP_PLAN_PRO_YEARLY`, else the preapproval `reason` or
`external_reference`, else `auto_recurring`; when nothing says, it defaults to
`pro_monthly` and records what it saw in the record's `planSource`.

## Local testing

```bash
# Worker on http://127.0.0.1:8787
wrangler dev

# Stripe CLI: forwards real signed events and prints a local whsec_…
stripe listen \
  --events checkout.session.completed,customer.subscription.created,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed \
  --forward-to http://127.0.0.1:8787/v1/webhooks/stripe

stripe trigger checkout.session.completed
```

`stripe listen` prints its own webhook secret — put *that* one in
`workers/entitlements/.dev.vars` as `STRIPE_WEBHOOK_SECRET=whsec_…` while
developing. **Add `.dev.vars` to the repo's `.gitignore` before you create it**;
it is not ignored today.

Unit tests (Node 20+, no network, no Workers runtime):

```bash
node --test workers/entitlements/test     # or: npm test --prefix workers/entitlements
```

They cover signature accept/reject for both providers (bad digest, stale
timestamp, multiple `v1`s, swapped data id), the token sign → verify round trip,
tampered and expired tokens, the KV upsert/idempotency and out-of-order logic
against an in-memory fake, plan/status mapping, period-end enforcement for
one-off payments, the pending → async-settled checkout flow, and the whole
webhook → claim → token flow through the router with a fake `fetch`.

## Official references

| Topic | URL |
|-------|-----|
| Stripe webhooks overview | https://docs.stripe.com/webhooks |
| Stripe signature verification | https://docs.stripe.com/webhooks/signature |
| Raw body requirement | https://docs.stripe.com/webhooks#verify-official-libraries |
| Payment Links | https://docs.stripe.com/payment-links |
| Post-payment redirect | https://docs.stripe.com/payment-links/post-payment |
| Customer Portal (no-code) | https://docs.stripe.com/customer-management/activate-no-code-customer-portal |
| Mercado Pago webhooks | https://www.mercadopago.com.pe/developers/en/docs/your-integrations/notifications/webhooks |
| Mercado Pago subscriptions | https://www.mercadopago.com.pe/developers/en/docs/subscriptions/landing |
| Cloudflare Workers | https://developers.cloudflare.com/workers/ |
| Workers KV | https://developers.cloudflare.com/kv/ |
| `wrangler secret` | https://developers.cloudflare.com/workers/wrangler/commands/#secret |

## Non-negotiable rules

1. Verify **every** request — there is no "skip in prod" flag, and no route
   trusts a body it has not authenticated.
2. Hash the **raw body bytes**, never re-serialized JSON.
3. Use the endpoint secret for **that exact endpoint** (test ≠ live).
4. Process **idempotently**: `event.id` is stored for 30 days, and a failed
   event drops its marker so the provider's retry still lands.
5. Return 2xx fast; 5xx only when we *want* a retry.
6. Never put a private key, `sk_live_…`, `whsec_…` or an MP access token in this
   repo or in client JavaScript. Nothing here logs a secret, a token or a raw
   webhook body.

## What this protects — and what it does not

**It does stop:**

- **Forged entitlements.** `localStorage.isPro = true` is worthless: the client
  only grants Pro for a token whose ES256 signature verifies against the
  published public key. Minting one requires the private key, which lives in
  Cloudflare's secret store.
- **Shared/copied entitlements going stale.** Tokens expire in 72h and are
  re-issued only from live KV state.
- **Cancellations and failed renewals lingering.** `customer.subscription.deleted`,
  `invoice.payment_failed` and a paused Mercado Pago preapproval all flip the
  stored status; the next `/v1/license` call refuses or downgrades. Even with no
  event at all, access stops at `periodEnd`.
- **Unpaid "completed" checkouts.** A delayed payment method that never clears
  never yields a token.
- **One-off payments becoming lifetime access**, and **stale events
  resurrecting a cancelled subscription** (see above).
- **Spoofed webhooks.** No signature, no state change — and Mercado Pago
  notifications are re-confirmed against the API, so a valid-looking body
  claiming `status: "approved"` changes nothing.
- **Replays and provider retries** double-applying.

**It cannot stop:**

- **A determined user unlocking Pro in their own browser.** The site is static
  vanilla JS on GitHub Pages: the feature code ships to the client, so anyone
  can edit it in devtools, patch the verification call, or run a modified copy.
  That is a property of client-side gating, not a bug here. Server-side
  verification makes it a deliberate act of tampering rather than a one-line
  localStorage edit, and it means nobody accidentally or casually holds Pro.
- **Sharing one license id.** A license id copied to a friend still verifies.
  There is no device binding and no account system; the mitigation is that a
  cancellation kills every copy at once.
- **Protecting content that has already been downloaded.** Everything the site
  ships is public by definition. Only genuinely server-side value (data the
  worker holds back) can be withheld.
- **Working while the worker is down.** If Cloudflare or the worker is
  unreachable, no new tokens are issued; the client keeps whatever unexpired
  token it holds and degrades afterwards. Decide deliberately whether that
  degradation is "stay Pro until expiry" or "drop to free", and say so in
  `docs/10-SUBSCRIPTIONS.md`.

In short: it makes entitlements **authentic and revocable**, which is what
billing needs. It does not make a static site's client-side features
un-hackable, and no serverless endpoint can.
