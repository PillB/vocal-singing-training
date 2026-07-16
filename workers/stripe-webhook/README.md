# Stripe webhook worker (optional hard verification)

**When you need this:** GitHub Pages cannot hold Stripe secret keys or verify `Stripe-Signature`.  
Client `?billing=success` activation is a **soft** entitlement. For production-grade anti-forgery, deploy this (or equivalent) serverless endpoint.

## Official references (current)

- Webhooks overview: https://docs.stripe.com/webhooks  
- Signature verification: https://docs.stripe.com/webhooks#verify-official-libraries  
- Events for subscriptions: `checkout.session.completed`, `customer.subscription.updated|deleted`, `invoice.paid`, `invoice.payment_failed`  
- Payment Links: https://docs.stripe.com/payment-links  
- Stripe CLI local test: `stripe listen --forward-to …`

## Recommended stack

| Option | Notes |
|--------|--------|
| **Cloudflare Workers** | Free tier, edge, good for GH Pages sites |
| Vercel / Netlify Functions | Same pattern |
| Never put `sk_live_…` or `whsec_…` in client JS |

## Events to subscribe

1. `checkout.session.completed` — first subscription checkout  
2. `customer.subscription.updated` — renewals / plan changes  
3. `customer.subscription.deleted` — cancellation  
4. `invoice.payment_failed` — dunning signal  

Stripe does **not** guarantee event order; use object ids + idempotent processing ([webhook best practices](https://docs.stripe.com/webhooks#best-practices)).

## Flow (hard verification)

```
Stripe Checkout complete
  → webhook POST (signed)
  → Worker verifies Stripe-Signature with whsec_…
  → Upsert customer email + subscription status in KV/D1
  → Email license code OR return signed JWT
  → Client redeems code → local Pro (still soft UX, harder to forge)
```

## Minimal Cloudflare Worker sketch

```js
// wrangler secret put STRIPE_WEBHOOK_SECRET
// wrangler secret put STRIPE_SECRET_KEY  (only if you need API lookups)
export default {
  async fetch(request, env) {
    if (request.method !== "POST") return new Response("ok");
    const body = await request.text();
    const sig = request.headers.get("Stripe-Signature") || "";
    // Use Stripe SDK constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET)
    // Then switch(event.type) …
    return new Response(JSON.stringify({ received: true }), {
      headers: { "content-type": "application/json" }
    });
  }
};
```

Install Stripe Node in Worker bundler or call verification manually per docs.

## Local test

```bash
stripe listen --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted,invoice.payment_failed \
  --forward-to http://127.0.0.1:8787/webhook
stripe trigger checkout.session.completed
```

## Success URL (Payment Links)

After payment, redirect to:

```
https://pillb.github.io/vocal-singing-training/?billing=success&plan=pro_monthly&provider=stripe&session_id={CHECKOUT_SESSION_ID}
```

Configure in Payment Link → After payment → Don’t show confirmation page / custom URL.  
See: https://docs.stripe.com/payment-links/post-payment

## Mercado Pago

Use MP IPN / Webhooks with secret validation (dashboard). Map `preapproval` / subscription events similarly; never trust client-only return URLs as sole proof of payment.
