# Subscription Entitlement Catalog

**Status:** Approved
**Catalog version:** 1
**Effective date:** 2026-09-06
**Authority:** [ADR-0027](../../architecture/0027-server-authoritative-entitlements.md)
**Parent issue:** [#4386](https://github.com/jrmoulckers/finance/issues/4386)

This document is the canonical commercial catalog for Finance subscriptions.
Other pricing, roadmap, conversion, and architecture documents are dated
evidence or strategy. If they conflict with this catalog, this catalog wins.

## Plans

Reference prices are USD before tax. Platform storefronts may display localized
prices or tax-inclusive amounts, but the server maps only reviewed provider
product and price identifiers to these logical products. A client-supplied
price or tier never grants access.

| Plan    | Monthly |  Yearly |          Bank connections |
| ------- | ------: | ------: | ------------------------: |
| Free    |      $0 |      $0 |                         0 |
| Plus    |   $4.99 |  $39.99 |                         0 |
| Premium |   $9.99 |  $79.99 |   2 plus verified add-ons |
| Family  |  $14.99 | $119.99 | 4 shared by one household |

Premium bank add-ons cost **$0.99 per Item per month**. They require an active
Premium entitlement and apply only to the same billing account's currently
sponsored household. Free, Plus, and Family do not receive this add-on through
catalog version 1.

Historical references to a `$4.99 Premium` plan mean the current **Plus** plan.

## Scope and binding

- Free is the default when no current verified paid grant applies.
- Plus and Premium follow the purchaser's Finance billing account.
- Premium may explicitly sponsor one eligible household.
- A Premium billing account may sponsor only one household at a time.
- Add-ons follow that Premium sponsorship; they are not independent user or
  household entitlements.
- Multiple Premium subscribers in one household do not stack. For a
  capability, Finance uses the highest allowance from one applicable sponsor.
- Family is bound to one household for that verified purchase.
- Replacing the billing owner does not transfer a provider purchase.
- Moving Family benefits to another household requires cancellation and a new
  verified purchase.

For bank connections, the effective household allowance is:

```text
max(
  Family allowance of 4 when applicable,
  each applicable Premium sponsor's 2 + that sponsor's verified add-on quantity
)
```

Finance never sums base allowances or add-ons across Premium sponsors.

## Lifecycle

| Normalized state         | Access rule                                          |
| ------------------------ | ---------------------------------------------------- |
| `trialing`               | Granted through the provider-authenticated trial end |
| `active`                 | Granted through the trusted current period           |
| `cancelled_paid_through` | Granted through the already paid period              |
| `past_due_grace`         | Granted only through provider-authenticated grace    |
| `paused_paid_through`    | Granted through paid-through time, then suspended    |
| `expired`                | Revoked at the trusted expiry                        |
| `refunded`               | Revoked at the trusted refund effective time         |
| `chargeback`             | Revoked at the trusted dispute effective time        |

Duplicate and stale events cannot change current access. Refund and chargeback
evidence cannot be reversed by an older event. A legitimate renewal or
reactivation after expiry requires a strictly newer authenticated provider
event.

## Downgrade behavior

When a household's bank allowance falls below its current connection count,
Finance asks which connections to retain. Without a valid selection, it keeps
the oldest connections by `created_at`, using `id` to break ties.

- Family to Premium retains at most the selected connections or the oldest two,
  plus any verified Premium add-on allowance.
- Premium to Plus or Free retains none.
- Provider revocation is durable and retryable. Local history is preserved.

## Not Yet Allocated

Catalog version 1 does not assign any other feature, usage limit, trial length,
discount, or support promise to a tier. Historical feature matrices and
conversion experiments are not product obligations.

Privacy, encryption, accessibility, data export, data deletion, and access to a
user's existing financial data are never paid entitlements.

Any future allocation changes this catalog through a reviewed version and must
identify migration and downgrade behavior.
