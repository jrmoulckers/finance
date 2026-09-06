# Stripe entitlement delivery

These functions accept Stripe evidence for Finance Web and direct-distributed
Windows purchases. Microsoft Store billing is not implemented. Stripe is an
evidence source only; `public.record_billing_provider_event(...)` and
`public.apply_billing_provider_event(UUID)` feed the Finance ledger, whose
minimized projection remains the only runtime authorization source.

## Functions

| Function           | Purpose                                                                                        |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `stripe-checkout`  | Creates an authenticated Checkout Session from a reviewed logical catalog choice.              |
| `stripe-portal`    | Creates a short-lived billing portal redirect for the signed-in purchaser.                     |
| `stripe-webhook`   | Verifies the exact raw body and Stripe signature before normalizing current provider evidence. |
| `stripe-reconcile` | Re-fetches the purchaser's current subscriptions and appends idempotent evidence.              |
| `stripe-status`    | Returns only the minimized Finance entitlement projection.                                     |

Checkout callers can submit `catalog_choice` and, where the catalog permits it,
`household_intent`. Price IDs, tiers, provider identifiers, validity windows,
allowances, and grant scope are server-owned. The placeholder Stripe IDs in
`packages/core` are not used and should be removed in Stage 5.

## Required configuration

Use environment-appropriate values. Never commit real values.

- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRETS` (comma-separated during signing-secret rotation)
- `STRIPE_ACCOUNT_ID`
- `STRIPE_ENVIRONMENT` (`sandbox` or `production`)
- `STRIPE_CHECKOUT_SUCCESS_URL` (must identify checkout as pending; no session
  ID)
- `STRIPE_CHECKOUT_CANCEL_URL`
- `STRIPE_PORTAL_RETURN_URL`
- `STRIPE_PRICE_PLUS_MONTHLY`
- `STRIPE_PRICE_PLUS_YEARLY`
- `STRIPE_PRICE_PREMIUM_MONTHLY`
- `STRIPE_PRICE_PREMIUM_YEARLY`
- `STRIPE_PRICE_FAMILY_MONTHLY`
- `STRIPE_PRICE_FAMILY_YEARLY`
- `STRIPE_PRICE_PREMIUM_BANK_ADDON_MONTHLY`

The standard Supabase URL, anonymous key, service-role key, and allowed origins
are also required by the authenticated endpoints.

## Local tests

Tests use placeholder fixtures and no network:

```powershell
deno test --allow-env --allow-net=none --no-check `
  services\api\supabase\functions\stripe-common `
  services\api\supabase\functions\stripe-checkout `
  services\api\supabase\functions\stripe-portal `
  services\api\supabase\functions\stripe-reconcile `
  services\api\supabase\functions\stripe-status `
  services\api\supabase\functions\stripe-webhook
```

## Human-gated work not performed

Production secrets, Stripe products and prices, Customer Portal configuration,
webhook registration, processor/DPA/privacy/economic review, production
migrations, deployment, and provider dashboard changes require human approval.
