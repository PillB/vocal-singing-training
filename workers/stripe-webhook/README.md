# Stripe webhook worker (optional hard verification)

**When you need this:** GitHub Pages cannot hold Stripe secret keys or verify `Stripe-Signature`.  
Client `?billing=success` activation is a **soft** entitlement. For production-grade anti-forgery and renewal/cancel sync, deploy this (or equivalent) serverless endpoint.

## Official references (current, non-deprecated)

| Topic | URL |
|-------|-----|
| Webhooks overview | https://docs.stripe.com/webhooks |
| Signature verification | https://docs.stripe.com/webhooks/signature |
| Raw body requirement | https://docs.stripe.com/webhooks#verify-official-libraries |
| Payment Links | https://docs.stripe.com/payment-links |
| Post-payment redirect | https://docs.stripe.com/payment-links/post-payment |
| Customer Portal | https://docs.stripe.com/customer-management |

## Non-negotiable rules (2026)

1. **Verify every request** with `Stripe-Signature` — no “skip in prod” flag.  
2. Pass the **raw body bytes** to `constructEvent` / manual HMAC — never re-serialized JSON.  
3. Use the **endpoint secret** (`whsec_…`) for that exact endpoint (test vs live differ).  
4. Process **idempotently** (store `event.id`; Stripe may retry / reorder).  
5. Return **2xx quickly**; do heavy work async if needed.  
6. **Never** put `sk_live_…` or `whsec_…` in client JavaScript or this GitHub Pages repo’s public files.

## Events to subscribe

| Event | Why |
|-------|-----|
| `checkout.session.completed` | Payment Link / Checkout finished |
| `customer.subscription.updated` | Plan change, renew, status |
| `customer.subscription.deleted` | Cancel |
| `invoice.paid` | Successful renewal |
| `invoice.payment_failed` | Dunning / grace |

Optional later: `customer.subscription.paused`, `invoice.payment_action_required`.

## Recommended stack

| Option | Notes |
|--------|--------|
| **Cloudflare Workers** | Fits GH Pages; secrets via `wrangler secret` |
| Vercel / Netlify Functions | Same pattern |
| Stripe CLI | Local: `stripe listen --forward-to …` |

## Flow (hard verification)

```
Stripe Checkout complete
  → webhook POST (signed)
  → Worker: raw body + constructEvent(body, sig, whsec)
  → switch(event.type) — idempotent upsert by subscription/customer id
  → KV/D1: status active|past_due|canceled + email
  → Issue license code / signed claim
  → Client redeems → local Pro (UX soft, forge much harder)
```

## Minimal Cloudflare Worker sketch

```js
// wrangler secret put STRIPE_WEBHOOK_SECRET
// Optional: wrangler secret put STRIPE_SECRET_KEY  (API lookups only)
export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("method not allowed", { status: 405 });
    }
    // CRITICAL: raw text, not request.json()
    const body = await request.text();
    const sig = request.headers.get("Stripe-Signature") || "";
    try {
      // npm stripe / stripe-workers: constructEvent(body, sig, env.STRIPE_WEBHOOK_SECRET)
      // const event = await verify(body, sig, env.STRIPE_WEBHOOK_SECRET);
      // await handleEvent(event, env); // idempotent by event.id
    } catch (err) {
      return new Response(`Webhook Error: ${err.message}`, { status: 400 });
    }
    return new Response(JSON.stringify({ received: true }), {
      headers: { "content-type": "application/json" }
    });
  }
};
```

## Local test

```bash
stripe listen \
  --events checkout.session.completed,customer.subscription.updated,customer.subscription.deleted,invoice.paid,invoice.payment_failed \
  --forward-to http://127.0.0.1:8787/webhook
stripe trigger checkout.session.completed
```

## Success URL (Payment Links)

```
https://pillb.github.io/vocal-singing-training/?billing=success&plan=pro_monthly&provider=stripe&session_id={CHECKOUT_SESSION_ID}
```

Yearly: `plan=pro_yearly`.  
Configure: Payment Link → After payment → custom URL with `{CHECKOUT_SESSION_ID}`  
Docs: https://docs.stripe.com/payment-links/post-payment

## Mercado Pago (parallel hard path)

- Prefer **Webhooks** (signed) over legacy IPN:  
  https://www.mercadopago.com.pe/developers/en/docs/your-integrations/notifications/webhooks  
- Topics of interest: `subscription_preapproval`, `subscription_authorized_payment`, payment status.  
- Validate secret signature **server-side**; never trust SPA return alone.  
- Soft SPA return still accepts `payment_id` / `preapproval_id` when `demoUnlockEnabled: false`.

## Operator checklist before deploy

- [ ] Test-mode endpoint + `whsec_test_…` works with CLI  
- [ ] Live endpoint + `whsec_live_…` separate  
- [ ] Idempotency store for `event.id`  
- [ ] Alert on repeated 400 signature failures  
- [ ] SPA still works if Worker down (soft return) — document degraded mode  
