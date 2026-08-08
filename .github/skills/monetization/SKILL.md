---
name: monetization
description: >
  Monetization strategy, pricing, and subscription management. Use for topics
  related to freemium tier design, paid feature boundaries, IAP or checkout
  implementation, entitlement sync, pricing analysis, revenue optimization, or
  subscription lifecycle.
---
<!-- synced from jrmoulckers/.github — canonical source; do not edit here -->

# Monetization Skill

**Trigger:** pricing, freemium tiers, entitlements, paywalls, checkout/IAP, trials, churn, revenue metrics.
**Inputs:** target audience, value metric, platforms in scope, cost model, competitor range, privacy constraints.
**Related:** `go-to-market` (positioning/growth), `privacy-compliance` (claims/data use),
`ux-testing` (paywall usability), `security-review-methodology` (receipt/entitlement risk).

## Out of scope

- ASO, launch communications, and growth channels → use `go-to-market`.
- Domain calculations and product-specific feature modeling → use the relevant domain skill.
- Backend transport or database internals → use the relevant implementation skill.
- Privacy-as-marketing claims and regulatory basis → use `privacy-compliance`.

## Method

1. **Pick the value metric** — charge for durable value, not for privacy, safety, accessibility, or access to existing user data.
2. **Define tiers** — keep free useful, paid clearly better, and enterprise/team plans operationally supportable.
3. **Gate server-side** — validate purchases/receipts with trusted services; never trust client-only entitlement state.
4. **Preserve access** — downgrades should stop new premium actions, not lock users out of existing data.
5. **Design humane prompts** — contextual, dismissible, rate-limited, accessible, and honest.
6. **Measure lightly** — track tier changes, trials, renewals, cancellations, and funnel events without sensitive payloads.
7. **Review regularly** — compare conversion, churn, support load, and competitor anchors before changing price.

## Tier design

| Tier | Purpose | Good gates | Avoid gating |
| --- | --- | --- | --- |
| Free | Prove the core product value | Limits on volume, automation, collaboration, advanced exports | Privacy, accessibility, account deletion, existing data access |
| Pro/Premium | Expand power and convenience | Advanced workflows, sync/collaboration, automation, integrations | Basic safety, compliance, support for export/delete |
| Team/Family/Enterprise | Shared administration | Roles, seats, admin controls, priority support | Individual data portability or consent controls |

## Entitlement checklist

- [ ] Purchases are verified by trusted platform/server APIs where applicable.
- [ ] Webhooks or scheduled checks handle renewals, refunds, cancellations, grace periods, and billing retry.
- [ ] Cached entitlements have an expiry and safe offline grace behavior.
- [ ] UI gates are backed by service/repository-layer checks.
- [ ] Paywalls state what changes on downgrade before purchase.
- [ ] Metrics exclude sensitive product data and personal payloads.

## Revenue metrics

| Metric | Readout |
| --- | --- |
| Free → paid conversion | Value clarity and paywall timing |
| Trial → paid conversion | Trial quality and purchase friction |
| Churn | Ongoing value, billing issues, support load |
| ARPU / LTV | Pricing sustainability |
| Refunds/support tickets | Mismatch between promise and experience |

## Safety

Do not monetize privacy, sell user data, dark-pattern upgrades, hide cancellation terms, or rely on client-only entitlement checks. Route legal/tax/store-policy questions to qualified review.

## Output

A monetization plan with tier boundaries, entitlement flow, pricing rationale, humane upgrade UX, metrics, and issue-ready implementation tasks.