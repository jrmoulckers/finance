<!-- SPDX-License-Identifier: BUSL-1.1 -->

# RevenueCat Entitlement Evidence

The RevenueCat adapter accepts Apple App Store and Google Play evidence and
normalizes it into Finance's server-only billing ledger. RevenueCat is not an
authorization read path: only the PostgreSQL entitlement projection described
by [ADR-0027](../../../docs/architecture/0027-server-authoritative-entitlements.md)
may authorize server actions.

## Trust boundaries

| Boundary                     | Accepted input                                                                                                                 | Authority                                 |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------- |
| RevenueCat webhook           | Exact raw body with configured Authorization, timestamped HMAC signature, reviewed app/store/environment, and reviewed product | Evidence only                             |
| Native confirmation/restore  | Authenticated Finance user, expected app/environment, and optional eligible Family household intent                            | Initiates provider lookup only            |
| Reconciliation               | Dedicated server credential                                                                                                    | Re-fetches current provider evidence only |
| PostgreSQL ledger/projection | Normalized events written through `record_billing_provider_event` then `apply_billing_provider_event`                          | Sole runtime authority                    |

Clients cannot submit a tier, price, validity period, allowance, quantity,
provider customer/subscription/event identifier, or receipt. The confirmation
endpoint derives the RevenueCat customer lookup from the authenticated
`auth.uid()`. Family evidence is applied only after active membership is
verified, and the ledger preserves the first household binding for the lifetime
of the purchase.

The webhook signs `timestamp + "." + exact_raw_body` with HMAC-SHA256. The
`X-RevenueCat-Webhook-Signature` header must contain exactly one Unix-second
`t` value and at least one hexadecimal `v1` value. Every configured signature
secret is checked to support rotation, and timestamps outside five minutes are
rejected. JSON parsing occurs only after Authorization and signature
verification.

## Endpoints

- `POST /revenuecat-webhook` accepts provider delivery. Unknown event or
  product mappings are acknowledged without a grant. Duplicate provider event
  IDs are successful no-ops. `PRODUCT_CHANGE` notifications are deferred:
  their `new_product_id` never changes access until later effective purchase
  evidence confirms the product.
- `POST /revenuecat-confirm` accepts `confirm` or `restore`, the expected app
  and environment, and optional eligible `household_id`. It returns
  `pending`, `confirmed`, or `error` plus only the minimized Finance
  projection.
- `GET /revenuecat-confirm?household_id=...` returns the current minimized
  Finance projection without contacting RevenueCat.
- `POST /revenuecat-reconcile` uses a distinct server credential, retrieves
  current RevenueCat state with the project-scoped API key, and feeds the same
  append/apply path. The provider client consumes RevenueCat v2 numeric
  millisecond period timestamps and lowercase store values, resolves the app
  from the reviewed product/app maps, and follows every scoped `next_page`.
  Each invocation processes at most 100 server-side identities; `partial`
  responses carry an ordinal cursor for the next idempotent invocation
  and never claim full completion early. Provider outages return a bounded
  `temporarily_unavailable` error with `Retry-After`.

RevenueCat v2 `gives_access` is required for every recognized current-state
subscription. Paused state maps to paid-through access only when that flag is
explicitly true. Billing-retry and access-false states normalize to denial.
RevenueCat v2 does not expose a trustworthy future grace bound, so an
access-bearing grace snapshot fails closed; webhook evidence may establish
grace only when it carries the provider's explicit grace expiry. Unknown or
future access-bearing statuses also fail closed rather than claiming
reconciliation completed.

The canonical purchase identity is RevenueCat v2's documented
`store_subscription_identifier`, which is the same store purchase identifier
carried as `original_transaction_id` by webhooks. Reconciliation and webhook
evidence therefore converge on one ledger subscription and one immutable
Family binding.

Responses and logs exclude provider names and identifiers, receipts, customer
attributes, raw payloads, signatures, secrets, internal ledger IDs, and other
household billing data. Responses use `Cache-Control: no-store` where clients
read entitlement status. Billing authority tables remain excluded from
PowerSync.

## Data protection

RevenueCat is a new processor for purchase-account linkage and store
subscription state. Finance stores only normalized evidence needed for
authorization, reconciliation, dispute handling, and legally required billing
records. Raw provider payloads and receipts are neither persisted nor logged.
Billing-account pseudonymization follows the ledger's account-deletion
contract; retained transaction evidence remains server-only for the approved
retention period.

Before production enablement, privacy review must confirm purpose and lawful
basis, RevenueCat's DPA and subprocessors, data region and cross-border
transfer posture, retention/deletion behavior, and consistency with the
published privacy notice. Security review must confirm secret rotation,
least-privilege API access, replay controls, and incident response.

## Local verification

All fixtures are synthetic and the tests deny network access:

```powershell
cd services\api\supabase\functions
deno task test:revenuecat
cd ..\..
npm run test:sync-contract
```

The existing billing ledger integration suite validates duplicate delivery,
deterministic ordering, stale-event handling, terminal non-resurrection, and
projection behavior:

```powershell
cd services\api
npm run test:billing-entitlements
```

Run the SQL suite only against disposable local Supabase.

## Needs Human Action

Do not enable this adapter in production until a human has completed all of
the following:

1. Approve RevenueCat as a processor, including DPA, subprocessors, security,
   privacy, data-region/transfer, retention, deletion, and economic review.
2. Create and configure the RevenueCat account, project, Apple/Google apps,
   products, entitlements, and native SDK integration.
3. Provision the API key, webhook Authorization value, current/previous
   signature secrets, and reconciliation credential in the approved secrets
   manager.
4. Register the production webhook and confirm its exact raw-body signature
   contract and scoped app/project/account mapping.
5. Review and perform deployment, production configuration, smoke testing, and
   production enablement.
