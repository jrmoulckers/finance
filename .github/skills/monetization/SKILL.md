---
name: monetization
description: >
  Monetization strategy, pricing, and subscription management for the Finance app. Use for freemium tier design, IAP implementation, pricing analysis, revenue optimization, and subscription lifecycle.
---

# Monetization Skill

## Validated Pricing

| Tier                   | Monthly    | Annual                | Includes                                                                                 |
| ---------------------- | ---------- | --------------------- | ---------------------------------------------------------------------------------------- |
| **Free**               | $0         | —                     | 1 budget, 1 account, manual tracking, basic reports, full offline, full privacy          |
| **Individual Premium** | **$4.99**  | **$39.99** (~33% off) | Unlimited accounts/budgets, goals, export, advanced analytics, rollover, recurring rules |
| **Family Premium**     | **$7.99**  | **$59.99** (~33% off) | Everything in Individual + household sharing (up to 5 members)                           |
| **Enterprise**         | **$14.99** | —                     | Multi-household, admin dashboard, priority support (future)                              |

### Competitive Position

| App         | Monthly   | Our Advantage                                 |
| ----------- | --------- | --------------------------------------------- |
| YNAB        | $14.99    | **3x cheaper**, privacy-first                 |
| Monarch     | $14.99    | **3x cheaper**, offline-first, 4 platforms    |
| Copilot     | $13.99    | **3x cheaper**, cross-platform (not iOS-only) |
| **Finance** | **$4.99** | Privacy-premium at accessible price           |

### Break-Even Analysis

- **Infrastructure-only break-even**: ~55 paying subscribers (Supabase Pro + PowerSync + hosting)
- **Full-cost break-even** (including dev tools, stores): ~200 paying subscribers
- Annual plans at 33% discount improve LTV while reducing churn

## Freemium Tier Design

### Free Tier (Complete but Limited)

- ✅ Core budgeting (1 budget)
- ✅ Transaction tracking (manual entry, basic categorization)
- ✅ 1 linked account
- ✅ Basic reports (monthly spending summary)
- ✅ Full offline support
- ✅ Full privacy protections (same as Premium — no ads, no data selling)

### Premium Gating

| Feature                | Free | Premium   | Family       |
| ---------------------- | ---- | --------- | ------------ |
| Accounts               | 1    | Unlimited | Unlimited    |
| Budgets                | 1    | Unlimited | Unlimited    |
| Goal tracking          | ❌   | ✅        | ✅           |
| Data export (CSV/JSON) | ❌   | ✅        | ✅           |
| Advanced analytics     | ❌   | ✅        | ✅           |
| Budget rollover        | ❌   | ✅        | ✅           |
| Recurring rules        | ❌   | ✅        | ✅           |
| Household sharing      | ❌   | ❌        | ✅ (up to 5) |

### Feature Gating Architecture

```
SubscriptionTier (enum: FREE, PREMIUM, FAMILY)
  └─ EntitlementChecker (commonMain interface)
       └─ checks tier at repository/use-case layer
            └─ platform UI reads entitlement to show/hide
```

- Define `SubscriptionTier` + `Entitlement` in `packages/models`
- Implement `EntitlementChecker` in `packages/core` with `expect`/`actual` for platform receipt sources
- Gate at **repository/use-case layer**, never UI alone
- Cache tier locally for offline gating

```kotlin
// packages/core
enum class SubscriptionTier { FREE, PREMIUM, FAMILY }

enum class Feature {
    UNLIMITED_ACCOUNTS, GOAL_TRACKING, DATA_EXPORT,
    ADVANCED_ANALYTICS, HOUSEHOLD_SUPPORT, BUDGET_ROLLOVER, RECURRING_RULES,
}

object FeatureGating {
    fun isAvailable(feature: Feature, tier: SubscriptionTier): Boolean
    fun featuresFor(tier: SubscriptionTier): Set<Feature>
}
```

### Upgrade Prompts — UX Principles

- **Contextual**: Show when user hits gate (e.g., "Add 2nd account" → CTA), not random pop-ups
- **Dismissible**: Clear "No thanks" action on every prompt
- **Non-manipulative**: Explain the value; never guilt or pressure
- **Rate-limited**: Max once per session per feature
- **Accessible**: WCAG 2.2 AA (focus management, screen reader announcements)

## Subscription Management

### Platform IAP

| Platform | Technology                           |
| -------- | ------------------------------------ |
| iOS      | StoreKit 2 + App Store Server API v2 |
| Android  | Google Play Billing Library v7       |
| Web      | Stripe or Paddle (hosted checkout)   |
| Windows  | Microsoft Store IAP                  |

### Cross-Platform Entitlement Flow

```
Device → Platform Store → Purchase
Device → Supabase Edge Function (receipt validation)
Edge Function → Platform API (verify)
Edge Function → auth.users.app_metadata (update tier + expiry)
PowerSync → All devices (sync entitlement)
KMP EntitlementChecker → Local gating
```

- **Never trust the client** — always validate receipts server-side
- Webhooks handle renewals, cancellations, grace periods
- RLS can reference `auth.jwt() -> 'app_metadata' ->> 'subscription_tier'`

### Offline Grace Period

- Cache `subscription_tier` + `subscription_expires_at` in local SQLite
- Trust cached tier if `expires_at` is in future or within 7-day grace window
- After grace: degrade to free tier until connectivity restored
- **Never lock users out of existing data** — only gate new premium actions

## Revenue Analytics

| Metric               | Target              |
| -------------------- | ------------------- |
| Free→Paid conversion | > 5% within 90 days |
| Monthly churn        | < 5%                |
| LTV (paying user)    | > $60               |
| ARPU (all users)     | $0.50/month         |
| MRR growth           | Track monthly       |

### Conversion Funnel

```
Free Users → Feature Gate Hit → Upgrade Prompt → Trial (14 days) → Paid
                                              ↘ Dismiss → Continue Free
```

Track: tier changes, renewals, cancellations. **Never** track financial data.

## Privacy-as-Premium

This is the brand differentiator:

- **Free users get identical privacy** to paying users — no ads, no tracking, ever
- **Premium = more features, NOT less privacy**
- Revenue from subscriptions, never from user data
- Tip jar available in Settings (optional one-time support, non-gating)

## Beta User Migration

1. Beta ends → users move to free tier by default
2. "Founding member" discount: 50% off first year
3. Beta data retained regardless of tier
4. Premium features become read-only until upgrade (goals visible, can't create new)

## Related Issues

- #337–#344: Stage 12 — Monetization
