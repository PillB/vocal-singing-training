# PR54: bearer license linking grants another payer's billing portal

Priority: high; payment-release blocker. Independently reproduced on
`b791748`; latest saved head `48fb14bed099e3f4139c892ebb31b66a0f58fd9e`
has identical checkout/accounts source. PR:
https://github.com/PillB/vocal-singing-training/pull/54

## Reproduction and observed behavior

In the isolated Worker/SQLite test harness, deliver a signed paid event for an
anonymous payer. Sign into a different verified email account. Link the still
unbound bearer license with `/v1/me/link`, request `/v1/me/billing-portal`, and
inspect the provider stub's customer ID. Finally try linking as the actual
payer. No real portal or production customer was accessed.

```text
signed anonymous paid event 200
different verified email can link bearer licence 200
different verified email gets portal 200
provider portal requested for payer customer true
actual payer later linking is refused 409
```

Expected: possession of an entitlement bearer alone cannot grant another
customer's billing-management authority or permanently displace the payer.
Positive control: the authenticated, authoritatively bound payer can reach
their own portal; a different account must be denied with **no provider portal
request**. Do not claim the current reproduction ran against the real provider.

## Root cause, alternatives and remedy

License possession was treated as sufficient account association, and portal
lookup reused that association as proof of payer ownership. Pro access and
the authority to manage invoices/subscriptions/customer data are different
permissions. A valid login proves control of that login, not the payer.

Prefer authenticated checkout bound to a durable account, with verified signed
provider events establishing customer ownership. Historical anonymous claims
need an explicit verified payer recovery/claim flow, not first-bearer-wins.
Email matching alone needs rules for changed addresses, aliases and provider
evidence; never trust an email or customer ID sent by the browser. Existing
incorrect links require auditable repair rather than silently transferring
ownership. Until authoritative ownership is available, deny this portal route
for bearer-only links and use the provider's verified buyer recovery channel.

Trade-off: some legitimate anonymous buyers need an extra recovery step.
That inconvenience is preferable to granting billing authority to another
verified user merely holding a copied token. [Creem's workflow](https://docs.creem.io/skills/creem-api/WORKFLOWS)
obtains the portal customer from the logged-in user's persisted subscription;
the local association must itself be trustworthy.

## Acceptance

- Different verified user plus unbound/stolen/shared bearer cannot request the
  payer's portal or make the payer unable to claim ownership.
- Signed, account-bound payer can manage their own subscription; the browser
  cannot choose an arbitrary customer ID or account association.
- Gift access, anonymous purchases, already-linked licenses, alias/address
  changes, concurrent claim attempts and revoked sessions have explicit tests.
- Provider calls are absent on authorization refusal. Preserve a red original
  regression and a mutation that replaces payer proof with bearer possession.
- Review existing link data and publish recovery guidance before activation.
  This is a billing authorization gate, not merely optional defense in depth.
