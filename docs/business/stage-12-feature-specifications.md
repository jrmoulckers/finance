# Stage 12 Feature Specifications — Monetization & Growth

**Issue:** #1019
**Sprint:** 11 — Stage 12 Feature Specifications
**Priority:** P1 — High
**Status:** Complete
**Document Owner:** Product Management
**Date:** 2025-07-30
**Source Issues:** #337, #338, #339, #340, #341, #342, #343, #344
**Related:** [Monetization Roadmap](monetization-roadmap.md) ·
[Premium Conversion Tracking](premium-conversion-tracking.md) ·
[Freemium Optimization](freemium-optimization-sprint9.md)

---

## Executive Summary

This document provides detailed product specifications for all 8 Stage 12
features — the monetization and growth layer of the Finance app. Stage 12
transforms the free, privacy-first finance tracker into a sustainable business
with freemium gating, premium subscriptions, family plans, referral growth, and
enterprise expansion.

### Core Principles

1. **Free stays genuinely useful** — No feature shipped in v1.0 moves behind a
   paywall. Free users get a complete personal finance app.
2. **Premium = power, not permission** — Premium unlocks advanced capabilities,
   not basic functionality.
3. **Privacy is universal** — E2E encryption and zero-knowledge architecture
   apply to all tiers. Privacy is never a premium upsell.
4. **Trust over tactics** — No dark patterns, no artificial urgency, no
   manipulative pricing psychology.

### Implementation Priority Order

| Priority | Issue | Feature                      | Rationale                               |
| -------- | ----- | ---------------------------- | --------------------------------------- |
| 1        | #337  | Freemium feature gating      | Foundation — all other features need it |
| 2        | #338  | Premium subscription IAP     | Revenue infrastructure                  |
| 3        | #344  | Annual subscription discount | Ships with IAP, increases LTV           |
| 4        | #340  | Privacy-as-premium marketing | Supports launch messaging               |
| 5        | #339  | Family/household plan        | Second revenue tier, high retention     |
| 6        | #342  | Referral program             | Organic growth engine                   |
| 7        | #341  | Tip jar                      | Community goodwill, low effort          |
| 8        | #343  | Enterprise/team plan         | Future v2.0+ scope, highest complexity  |

### Platform Parity Matrix

| Feature              | iOS | Android | Web | Windows | KMP Shared  | Backend    |
| -------------------- | --- | ------- | --- | ------- | ----------- | ---------- |
| #337 Feature gating  | Yes | Yes     | Yes | Yes     | Core logic  | Tier sync  |
| #338 Premium IAP     | Yes | Yes     | Yes | Yes     | State mgmt  | Validation |
| #339 Family plan     | Yes | Yes     | Yes | Yes     | Member mgmt | Household  |
| #340 Privacy mktg    | Yes | Yes     | Yes | Yes     | Badge UI    | —          |
| #341 Tip jar         | Yes | Yes     | Yes | Yes     | —           | —          |
| #342 Referral        | Yes | Yes     | Yes | Yes     | Link gen    | Tracking   |
| #343 Enterprise      | Yes | Yes     | Yes | Yes     | Team mgmt   | Admin API  |
| #344 Annual discount | Yes | Yes     | Yes | Yes     | —           | Billing    |

All features must ship on all 4 platforms simultaneously. No platform-first
launches for monetization features.

---

## Feature 1: Freemium Tier Feature Gating (#337)

**Priority:** P1 — Critical (blocks all monetization)
**Effort:** Large (4–6 weeks)
**Dependencies:** None (foundation feature)
**Agent Types:** KMP (core logic) + all platform agents (UI) + backend (sync)

### Problem Statement

The app currently has no concept of feature tiers. All features are available to
all users. Before launching premium subscriptions, we need a gating layer that
can restrict feature access based on subscription tier — without degrading
the core experience for free users.

### Specification

#### Tier Definitions

| Capability           | Free         | Premium          | Family           | Enterprise       |
| -------------------- | ------------ | ---------------- | ---------------- | ---------------- |
| Accounts             | Up to 3      | Unlimited        | Unlimited        | Unlimited        |
| Transactions         | Unlimited    | Unlimited        | Unlimited        | Unlimited        |
| Budgets              | Up to 5      | Unlimited        | Unlimited+shared | Unlimited+team   |
| Categories           | Defaults + 5 | Unlimited custom | Unlimited custom | Unlimited custom |
| Goals                | Up to 2      | Unlimited        | Unlimited+shared | Unlimited        |
| Sync devices         | Up to 2      | Unlimited        | Unlimited        | Unlimited        |
| Export               | CSV only     | CSV, PDF, JSON   | CSV, PDF, JSON   | CSV, PDF, QBO    |
| Analytics            | Basic charts | Full suite       | Full suite       | Full + team      |
| AI categorization    | Included     | Included         | Included         | Included         |
| Anomaly detection    | Included     | Included         | Included         | Included         |
| NLP input            | —            | Included         | Included         | Included         |
| Spending predictions | —            | Included         | Included         | Included         |
| Receipt scanning     | —            | Included         | Included         | Included         |
| Bank connections     | —            | Included         | Included         | Included         |
| Report builder       | —            | Included         | Included         | Included         |
| Health score         | —            | Included         | Included         | Included         |
| Household sharing    | —            | —                | Up to 6 members  | —                |
| Budget negotiation   | —            | —                | Included         | —                |
| Team management      | —            | —                | —                | Up to 25 seats   |
| Approval workflows   | —            | —                | —                | Included         |
| Audit trail          | —            | —                | —                | Included         |

#### Technical Architecture

- **KMP shared module:** FeatureGate enum listing all gatable features.
  SubscriptionManager class exposing currentTier (reactive Flow) and
  canAccess(feature: FeatureGate): Boolean.
- **Cached state:** Tier state cached locally. Gate checks MUST be
  instantaneous (no network call). Sync tier from backend on app open.
- **Grace period:** If subscription lapses while offline, maintain premium
  access for 7 days.
- **Downgrade behavior:** Keep ALL user data. Show upgrade prompts on gated
  features. Never delete or hide data created during premium.
- **Upgrade behavior:** Seamless — no data migration, no app restart.

#### Platform Implementation

| Platform | Gate UI Component             | Upgrade Flow                    |
| -------- | ----------------------------- | ------------------------------- |
| iOS      | PremiumGateView (SwiftUI)     | Sheet with StoreKit paywall     |
| Android  | PremiumGateScreen (Compose)   | Bottom sheet with BillingClient |
| Web      | PremiumGate (React component) | Modal with Stripe redirect      |
| Windows  | PremiumGateDialog (WinUI)     | ContentDialog with Store IAP    |

### Acceptance Criteria

- [ ] FeatureGate enum defines all gatable features in KMP shared module
- [ ] SubscriptionManager exposes reactive currentTier state
- [ ] canAccess(feature) checks are instantaneous (< 1ms, cached)
- [ ] Gate UI component exists on all 4 platforms with consistent branding
- [ ] Free users see clear upgrade prompt when hitting a gate
- [ ] Upgrade prompt shows feature benefit, not just price
- [ ] Downgrade preserves all data; re-upgrading restores full access
- [ ] 7-day offline grace period prevents false lockouts
- [ ] Tier state syncs from backend on app launch and subscription change
- [ ] Feature gate unit tests cover free, premium, family, enterprise tiers
- [ ] No existing v1.0 feature is moved behind a gate

---

## Feature 2: Premium Subscription IAP (#338)

**Priority:** P1 — Critical (revenue infrastructure)
**Effort:** Large (6–8 weeks)
**Dependencies:** #337 (feature gating must exist)
**Agent Types:** All platform agents + backend

### Problem Statement

To generate revenue, users need a way to purchase and manage premium
subscriptions. Each platform has different payment infrastructure that must be
integrated with a unified backend subscription state.

### Specification

#### Platform Payment Integration

**iOS — StoreKit 2:**

- Auto-renewable subscriptions: monthly and annual
- Server-side receipt validation via Supabase Edge Function
- Transaction.updates listener for real-time status changes
- AppStore.sync() for restore purchases
- Handle offer codes and promotional offers

**Android — Google Play Billing Library v6+:**

- BillingClient with ProductDetails for subscription products
- launchBillingFlow() for purchase initiation
- Server-side token validation via Google Play Developer API
- Handle PENDING state for slow payment methods
- Account hold and grace period via Play Console

**Web — Stripe Checkout:**

- Stripe Checkout Session for initial subscription
- Customer Portal for management (cancel, upgrade, payment method)
- Webhook handler on Edge Function for lifecycle events
- No PCI compliance burden (Stripe handles card data)

**Windows — Microsoft Store IAP:**

- Windows.Services.Store.StoreContext for product queries
- RequestPurchaseAsync() for purchase flow
- Server-side receipt validation via Microsoft Store collection API
- GetUserCollectionAsync() for restore purchases

#### Cross-Platform Subscription Sync

- Backend is the source of truth for subscription state
- Each platform validates receipts server-side and writes to subscriptions table
- Subscribe on one platform, premium access on all platforms
- Platform-specific management redirects to originating store

### Acceptance Criteria

- [ ] StoreKit 2 integration on iOS with receipt validation
- [ ] Google Play Billing v6+ on Android with server-side validation
- [ ] Stripe Checkout on web with webhook handling
- [ ] Microsoft Store IAP on Windows with collection API validation
- [ ] Unified subscriptions table in Supabase with RLS
- [ ] Cross-platform sync: subscribe on one platform, premium on all
- [ ] Restore purchases works on all platforms
- [ ] Subscription status handles grace period, cancellation, expiry
- [ ] Error states: payment declined, network failure, validation failure
- [ ] Monthly and annual products configured in all 4 stores

---

## Feature 3: Annual Subscription Discount (#344)

**Priority:** P2 — Medium (ships with #338)
**Effort:** Small (1–2 weeks, bundled with IAP)
**Dependencies:** #338 (IAP infrastructure)

### Specification

| Plan       | Monthly  | Annual/mo | Annual Total | Savings |
| ---------- | -------- | --------- | ------------ | ------- |
| Premium    | 4.99/mo  | 3.99/mo   | 47.88/yr     | 20%     |
| Family     | 7.99/mo  | 5.99/mo   | 71.88/yr     | 25%     |
| Enterprise | 14.99/mo | 11.99/mo  | 143.88/yr    | 20%     |

- Monthly and annual plans shown side by side on upgrade screen
- Annual plan visually recommended ("Best Value" badge)
- Mid-cycle switching supported with proration

### Acceptance Criteria

- [ ] Monthly and annual plans shown side by side on upgrade screen
- [ ] Annual savings amount and percentage displayed prominently
- [ ] Annual plan marked as "Best Value" with visual badge
- [ ] Switching between monthly and annual supported with proration
- [ ] Discount percentages: Premium 20%, Family 25%, Enterprise 20%
- [ ] Analytics track plan type selection (monthly vs annual)

---

## Feature 4: Privacy-as-Premium Marketing (#340)

**Priority:** P2 — Medium
**Effort:** Medium (3–4 weeks)
**Dependencies:** None (can develop in parallel)

### Specification

- **Privacy badge** on dashboard for all users: shield icon + "End-to-End Encrypted"
- Tapping opens privacy details sheet with Finance vs. industry comparison
- Quarterly transparency report template (data requests, incidents)
- App store listings emphasize privacy in first 2 lines
- Campaign aligned with #804 and #810

### Acceptance Criteria

- [ ] Privacy badge visible on home/dashboard on all 4 platforms
- [ ] Tapping badge opens privacy details sheet with comparison table
- [ ] Transparency report template created with quarterly cadence
- [ ] App store descriptions updated with privacy messaging
- [ ] All privacy claims are factually accurate and legally reviewed

---

## Feature 5: Family/Household Premium Plan (#339)

**Priority:** P2 — Medium
**Effort:** Medium (4–6 weeks)
**Dependencies:** #337, #338, household sharing feature

### Specification

- 1 owner + up to 5 members (6 total), 7.99/mo or 5.99/mo annual
- Invite via shareable link (7-day expiry, single-use)
- All members get full Premium access; individual privacy by default
- Cancellation: 30-day notice to members before premium expires
- Removed members revert to free tier with 7-day notice

### Acceptance Criteria

- [ ] Family plan available for purchase on all 4 platforms
- [ ] Owner can invite up to 5 members via shareable link
- [ ] All members receive Premium access when Family plan is active
- [ ] Member management screen on all platforms
- [ ] Cancellation notifies all members 30 days before expiration
- [ ] Individual privacy maintained — shared budgets/goals opt-in only
- [ ] Family plan pricing displayed correctly

---

## Feature 6: Referral Program (#342)

**Priority:** P2 — Medium
**Effort:** Medium (3–4 weeks)
**Dependencies:** #337, #338, push notifications

### Specification

- Any user can refer; unique referral link with deep link support
- Reward: 1 month Premium free for both referrer and referee
- Referee must register and add first transaction to qualify
- Max 12 referral rewards per user per year
- Fraud prevention: device check, email verification, self-referral block

### Acceptance Criteria

- [ ] Unique referral link per user, shareable on all platforms
- [ ] Deep link handling on iOS, Android, Web, Windows
- [ ] Referrer gets 1 month Premium after referee qualifies
- [ ] Referee gets 1 month Premium after qualifying
- [ ] Maximum 12 referral rewards per user per year
- [ ] Fraud prevention: device check, email verification, self-referral block
- [ ] In-app referral screen shows link, share button, rewards earned

---

## Feature 7: Optional Tip Jar (#341)

**Priority:** P3 — Low
**Effort:** Small (1–2 weeks)
**Dependencies:** #338 IAP infrastructure

### Specification

- Settings > About > Support Development (not prominent)
- Amounts: 1.99, 4.99, 9.99, 24.99 (one-time IAP)
- Thank-you animation; permanent "Supporter" badge (cosmetic only)
- Tips never unlock premium features

### Acceptance Criteria

- [ ] Tip jar in Settings > About > Support Development
- [ ] Four tip amounts with IAP on all 4 platforms
- [ ] Thank-you animation after successful tip
- [ ] "Supporter" badge in About section
- [ ] Tips never unlock premium features
- [ ] Not promoted in upgrade flow or onboarding

---

## Feature 8: Enterprise/Team Plan (#343)

**Priority:** P3 — Low (v2.0+ scope)
**Effort:** Extra-Large (12–16 weeks)
**Dependencies:** #337, #338, #339, mature household sharing

### Specification

- Roles: Admin, Manager, Member (up to 25 seats)
- Expense submission with approval workflow
- Export: CSV, QuickBooks IIF, Xero CSV
- Admin dashboard with audit trail
- Pricing: 14.99/seat/mo or 11.99/seat/mo annual

### Acceptance Criteria

- [ ] Team creation with admin, manager, member roles
- [ ] Member invitation via email with role assignment
- [ ] Configurable approval threshold for expenses
- [ ] Export in CSV, QuickBooks IIF, Xero CSV formats
- [ ] Admin dashboard with spending overview and audit trail
- [ ] Per-seat billing at 14.99/mo or 11.99/mo annual
- [ ] Maximum 25 members per team

---

## Cross-Feature Dependency Map

| Feature              | Depends On                    | Blocks                 |
| -------------------- | ----------------------------- | ---------------------- |
| #337 Feature gating  | None (foundation)             | All other Stage 12     |
| #338 Premium IAP     | #337                          | #339, #341, #342, #344 |
| #344 Annual discount | #338                          | —                      |
| #340 Privacy mktg    | None (parallel)               | —                      |
| #339 Family plan     | #337, #338, household sharing | #343                   |
| #342 Referral        | #337, #338, notifications     | —                      |
| #341 Tip jar         | #338 IAP infra                | —                      |
| #343 Enterprise      | #337, #338, #339              | —                      |

### Implementation Phases

| Phase | Weeks | Features                               | Revenue Impact |
| ----- | ----- | -------------------------------------- | -------------- |
| 1     | 1–4   | #337 Feature gating + #338 Premium IAP | First revenue  |
| 2     | 5–8   | #339 Family + #344 Annual + #340 Mktg  | Tier expansion |
| 3     | 9–12  | #342 Referral + #341 Tip jar           | Growth engine  |
| 4     | 13–20 | #343 Enterprise                        | ARPU expansion |

---

## Revenue Impact Assessment

| Feature              | Direct Revenue | Indirect Revenue          | Risk   |
| -------------------- | -------------- | ------------------------- | ------ |
| #337 Feature gating  | None           | Enables all revenue       | Low    |
| #338 Premium IAP     | 4.99/mo        | —                         | Medium |
| #344 Annual discount | Higher LTV     | Reduced churn             | Low    |
| #340 Privacy mktg    | None           | Supports conversion       | Low    |
| #339 Family plan     | 7.99/mo        | Household lock-in         | Medium |
| #342 Referral        | None           | Acquisition at ~0 CAC     | Low    |
| #341 Tip jar         | 2–25 one-time  | Community goodwill        | Low    |
| #343 Enterprise      | 14.99/seat/mo  | Business market expansion | High   |

---

## Acceptance Criteria Summary

- [x] All 8 Stage 12 features (#337–#344) have detailed specifications
- [x] Each feature has acceptance criteria as checkbox lists
- [x] Platform parity matrix shows all features on all 4 platforms
- [x] Implementation priority ranking with dependency rationale
- [x] Cross-references to monetization-roadmap.md and related issues
- [x] Dependencies mapped between all 8 features
- [x] Revenue impact assessment per feature with projections
- [x] Technical architecture described per platform per feature
