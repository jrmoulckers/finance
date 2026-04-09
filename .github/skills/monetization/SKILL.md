---
name: monetization
description: >
  Monetization strategy, pricing, and subscription management for the Finance app. Use for freemium tier design, IAP implementation, pricing analysis, revenue optimization, and subscription lifecycle.
---

# Monetization — Finance App

This skill provides guidance on monetization strategy, subscription management, pricing, and revenue analytics for the Finance monorepo. Related GitHub issues: #337–#344 (Stage 12 — Monetization).

## 1. Freemium Tier Design

### Free Tier (Core)

The free tier delivers a complete, useful budgeting experience:

- Core budgeting (create and manage 1 budget)
- Transaction tracking (manual entry and basic categorization)
- 1 linked account
- Basic reports (monthly spending summary)
- Full offline support
- Full privacy protections (no ads, no data selling — same as Premium)

### Premium Tier

Premium unlocks power-user and household features:

- Unlimited accounts and budgets
- Goal tracking and progress analytics
- Data export (CSV, JSON — GDPR portability)
- Advanced analytics (trends, category breakdowns, net worth tracking)
- Family/household support (up to 5 members on Family plan)
- Budget rollover across periods
- Recurring transaction rules
- Priority support

### Feature Gating Architecture

Feature gating is implemented in the KMP shared code layer so every platform enforces the same rules:

```
SubscriptionTier (enum: FREE, PREMIUM, FAMILY)
  └─ EntitlementChecker (commonMain interface)
       └─ checks tier at the repository/use-case layer
            └─ platform UI reads entitlement to show/hide features
```

- Define `SubscriptionTier` and `Entitlement` in `packages/models`.
- Implement `EntitlementChecker` in `packages/core` with `expect`/`actual` for platform receipt sources.
- Gate features at the **repository or use-case layer**, never in UI code alone — UI reads entitlements to conditionally render, but enforcement happens in shared logic.
- Cache the current tier locally so gating works offline (see §6 Offline Grace Period).

### Upgrade Prompts — UX Principles

- **Non-manipulative**: Explain what the user gains; never guilt or pressure.
- **Contextual**: Show the prompt when the user hits the gate (e.g., "Add a second account" → upgrade CTA), not as random pop-ups.
- **Dismissible**: Every prompt must have a clear "No thanks" / dismiss action.
- **Infrequent**: Rate-limit prompts so users aren't asked more than once per session per feature.
- **Accessible**: Prompts must meet WCAG 2.2 AA (focus management, screen-reader announcements).

## 2. Subscription Management

### Platform-Specific IAP

| Platform | Technology | Notes |
| -------- | ------------------------------------ | ------------------------------------------- |
| iOS | StoreKit 2 + App Store Server API v2 | Use `Product.SubscriptionInfo` for status |
| Android | Google Play Billing Library v7 | Use `BillingClient` with `PurchasesUpdatedListener` |
| Web | Stripe or Paddle | No direct card handling; use hosted checkout |
| Windows | Microsoft Store IAP | `Windows.Services.Store` namespace |

### Cross-Platform Entitlement Sync

All subscription state flows through Supabase for a single source of truth:

1. **Purchase** happens on-device via the platform store.
2. **Receipt / purchase token** is sent to a Supabase Edge Function for server-side validation.
3. **Validation endpoint** verifies with the platform API (App Store Server API, Google Play Developer API, Stripe webhook, Microsoft Store).
4. On success, the Edge Function updates `auth.users.app_metadata.subscription_tier` and `subscription_expires_at`.
5. **PowerSync** syncs the entitlement to all user devices.
6. **KMP `EntitlementChecker`** reads the synced tier for local gating.

```
Device → Platform Store → Purchase
Device → Supabase Edge Function (receipt validation)
Edge Function → Platform API (verify)
Edge Function → auth.users.app_metadata (update tier)
PowerSync → All devices (sync entitlement)
```

### Receipt Validation (Server-Side)

- **Never trust the client** — always validate receipts server-side.
- Edge Function endpoints: `POST /functions/v1/validate-receipt`
- Accept: `{ platform: 'ios' | 'android' | 'web' | 'windows', receipt: string }`
- Validate against the respective platform API.
- Store validated purchase records in a `subscriptions` table (with RLS).
- Handle subscription renewals, cancellations, and grace periods via platform webhooks.

## 3. Pricing Strategy

### Competitive Landscape

| App | Monthly | Annual | Positioning |
| ------- | -------- | --------- | ---------------------------------- |
| YNAB | $14.99 | $109.99 | Envelope budgeting, education |
| Monarch | $14.99 | $99.99 | Aggregation, financial planning |
| Copilot | $13.99 | $89.99 | Design-forward, Apple-only |
| **Finance (ours)** | **$4.99** | **$39.99** | **Privacy-first, cross-platform** |

### Recommended Pricing

- **Individual Premium**: $4.99/month or $39.99/year (~33% annual discount)
- **Family Premium**: $7.99/month or $59.99/year (up to 5 household members)
- **Positioning**: Privacy-premium at an accessible price — undercut competitors significantly while emphasizing "your data stays yours."
- **Student/Educator Discount**: Consider 50% off ($2.49/mo or $19.99/yr) — verify via SheerID or platform student programs.

### Annual Discount Rationale

- ~33% discount incentivizes annual commitment, reducing churn and improving LTV.
- Annual pricing shown prominently as "per month equivalent" ($3.33/mo individual, $4.99/mo family).

## 4. Revenue Analytics

### Key Metrics

| Metric | Definition | Target |
| ------ | ---------- | ------ |
| **MRR** | Monthly Recurring Revenue — sum of all active monthly-equivalent subscriptions | Track growth rate |
| **Churn Rate** | % of subscribers who cancel in a given period | < 5% monthly |
| **LTV** | Lifetime Value — average revenue per user over their subscription lifetime | > $60 |
| **Conversion Rate** | Free → Trial → Paid funnel completion | > 5% free-to-paid |
| **ARPU** | Average Revenue Per User (across free and paid) | Track over time |

### Conversion Funnel

```
Free Users → [Feature Gate Hit] → Upgrade Prompt → Trial (14 days) → Paid Subscription
                                                 ↘ Dismiss → Continue Free
```

- Track each stage with anonymous, privacy-respecting analytics.
- **No tracking of financial data** — only subscription events (tier change, renewal, cancellation).
- Revenue per platform breakdown to inform development investment.

### Cohort Analysis

- Group users by signup month.
- Track retention and conversion by cohort.
- Identify which features drive the most upgrades (gate-hit analytics).

## 5. Privacy-as-Premium

### Core Differentiation

Finance's competitive advantage is privacy. This is not just a feature — it is the brand:

- **"Your data stays yours"** — the primary value proposition.
- **No ads, ever** — not even on the free tier. Ads compromise privacy and trust.
- **No data selling or sharing** — financial data is never monetized, aggregated, or shared with third parties.
- **Edge-first architecture** — data lives on-device, not on our servers. Sync is encrypted end-to-end.
- **Premium = more features, NOT less privacy** — free users get the same privacy protections as paying users.

### Tip Jar (Optional Support)

- Allow users to make optional one-time contributions ("Buy the team a coffee").
- Non-gating: tips unlock nothing; they are purely voluntary support.
- Display in Settings, not as a recurring prompt.
- Use platform IAP for tip transactions (required by App Store / Play Store rules).

## 6. Implementation Architecture

### Feature Flag System

Feature flags live in KMP shared code (`packages/core`):

```kotlin
enum class SubscriptionTier { FREE, PREMIUM, FAMILY }

enum class Feature {
    UNLIMITED_ACCOUNTS,
    GOAL_TRACKING,
    DATA_EXPORT,
    ADVANCED_ANALYTICS,
    HOUSEHOLD_SUPPORT,
    BUDGET_ROLLOVER,
    RECURRING_RULES,
}

object FeatureGating {
    /** Returns the set of features available for a given tier. */
    fun featuresFor(tier: SubscriptionTier): Set<Feature>

    /** Checks if a specific feature is available for the tier. */
    fun isAvailable(feature: Feature, tier: SubscriptionTier): Boolean
}
```

### Entitlement Checking Layer

- Check entitlements at the **repository or use-case layer** — before data is created or returned.
- Example: `AccountRepository.createAccount()` checks `isAvailable(UNLIMITED_ACCOUNTS, currentTier)` and returns a gating error if the free-tier limit (1 account) is reached.
- UI reads entitlements to show locked/unlocked states but does not enforce — shared logic enforces.

### Server-Side Validation

- Supabase Edge Function validates receipts and updates `app_metadata`.
- RLS policies can reference `auth.jwt() -> 'app_metadata' ->> 'subscription_tier'` to enforce server-side access control on premium-only data.
- Webhook endpoints for each platform handle renewal, cancellation, and billing issue events.

### Offline Grace Period

- Cache `subscription_tier` and `subscription_expires_at` in the local SQLite database.
- On app launch without network: trust cached tier if `expires_at` is in the future or within a 7-day grace window.
- After the grace period, degrade to free tier until connectivity is restored and entitlement is re-validated.
- Never lock users out of their existing data — only gate new premium actions.

### Beta User Migration

- All current beta users receive a migration path:
  1. Beta period ends → users are moved to the free tier by default.
  2. Offer a "founding member" discount (e.g., 50% off first year) as a thank-you.
  3. Data created during beta is retained regardless of tier — no data loss.
  4. Features above the free tier become read-only until upgrade (e.g., existing goals are visible but new ones cannot be created).

## 7. Business Issue Templates

Use these templates when creating GitHub issues for monetization work:

### `[Business] Define freemium tier feature boundaries`

Finalize the exact feature split between Free and Premium tiers. Document the gating rules and edge cases (e.g., what happens to a second account if a user downgrades).

### `[Business] Implement [platform] IAP integration`

Integrate the platform-specific IAP library, implement purchase flows, and connect receipt validation to the Supabase Edge Function. One issue per platform (iOS, Android, Web, Windows).

### `[Business] Pricing A/B test design`

Design an experiment to validate the $4.99/mo price point. Define cohorts, success metrics (conversion rate, revenue per user), test duration, and statistical significance thresholds.

### `[Business] Revenue dashboard setup`

Build an internal dashboard displaying MRR, churn, LTV, conversion funnel, and per-platform revenue. Source data from the `subscriptions` table via a read-only analytics connection (never expose to client apps).

## Related Issues

- #337–#344: Stage 12 — Monetization (freemium tiers, IAP integration, pricing, revenue analytics)

## References

- [Apple StoreKit 2 Documentation](https://developer.apple.com/storekit/)
- [Google Play Billing Library](https://developer.android.com/google/play/billing)
- [Stripe Subscriptions](https://stripe.com/docs/billing/subscriptions/overview)
- [Microsoft Store In-App Purchases](https://learn.microsoft.com/en-us/windows/uwp/monetize/)
- [Supabase Auth Metadata](https://supabase.com/docs/guides/auth/managing-user-data)
