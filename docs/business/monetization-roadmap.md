# Monetization Roadmap: Premium Feature Rollout

**Sprint:** S4 - Monetization Planning
**Priority:** P2 - Medium
**Status:** Complete
**Document Owner:** Product Management
**Date:** 2025-07-31
**Source Issues:** #337-#344 (Stage 12)

---

## Executive Summary

This document plans the premium feature rollout for the Finance app, covering
all 8 Stage 12 monetization issues. The strategy follows a freemium model where
core personal finance remains free forever, with premium features for power
users and families. The approach prioritizes user trust: no feature that exists
in v1.0 will ever be moved behind a paywall.

### Core Principle

> Free users get a complete, useful personal finance app. Premium users get
> power features that justify the cost. No dark patterns. No artificial
> limitations on core functionality.

### Stage 12 Issues

| Issue | Feature                       | Category       | Priority |
| ----- | ----------------------------- | -------------- | -------- |
| #337  | Freemium tier feature gating  | Architecture   | P1       |
| #338  | Premium subscription IAP      | Infrastructure | P1       |
| #339  | Family/household premium plan | Plan tier      | P2       |
| #340  | Privacy-as-premium marketing  | Marketing      | P2       |
| #341  | Optional tip jar              | Revenue        | P3       |
| #342  | Referral program              | Growth         | P2       |
| #343  | Enterprise/team expense plan  | Plan tier      | P3       |
| #344  | Annual subscription discount  | Pricing        | P2       |

---

## Tier Structure

### Free Tier (Core Finance)

Everything a user needs for personal finance management:

- Unlimited accounts, transactions, budgets, and goals
- Custom categories and tags
- Biometric authentication
- Full offline support
- Cross-device sync (up to 2 devices)
- Data export (CSV)
- Dark mode and accessibility
- Community support via GitHub

### Premium Tier (Individual)

Power features for engaged users:

- Everything in Free, plus:
- Unlimited device sync
- AI-powered features: budget recommendations (#327), savings suggestions
  (#326), spending forecast (#328), predictive balance (#324)
- Smart subscription detection (#325)
- Natural language transaction input (#322)
- Receipt scanning and OCR (#301)
- Custom report builder (#303)
- Advanced data export (PDF, JSON, scheduled exports)
- Bank connection API (#265) when available
- Priority support and early access to new features

### Family Plan (Household)

Shared premium for families:

- Everything in Premium for all household members (up to 6)
- Shared budgets and goals
- Collaborative budget negotiation (#300)
- Individual privacy within shared household
- Single subscription covers all members
- Family dashboard with combined view

### Enterprise Plan (Future - v2.0+)

Small business and team features:

- Everything in Family, plus:
- Team expense tracking and approval workflows
- Category-based reporting for accounting
- CSV export formatted for accounting software
- Admin dashboard for team management
- Receipt capture and storage
- Audit trail for all transactions
- Up to 25 team members with email support SLA

---

## Pricing Strategy

### Recommended Pricing

| Plan       | Monthly | Annual (per month) | Annual Total | Savings |
| ---------- | ------- | ------------------ | ------------ | ------- |
| Free       | 0       | 0                  | 0            | -       |
| Premium    | 4.99    | 3.99               | 47.88        | 20%     |
| Family     | 7.99    | 5.99               | 71.88        | 25%     |
| Enterprise | 14.99   | 11.99              | 143.88       | 20%     |

### Pricing Rationale

- **Premium at 4.99/mo:** Below Monarch Money (9.99) and Copilot (8.33).
  Competitive with YNAB (14.99) while offering privacy advantages. The
  open-source, privacy-first positioning justifies a lower price point that
  drives volume over margin.
- **Family at 7.99/mo:** 60% premium over individual. Competitive with family
  plans in the market. Covers up to 6 members making per-person cost minimal.
- **Annual discount at 20-25%:** Industry standard. Drives annual commitment
  and reduces churn. Higher discount for Family to incentivize household
  adoption.
- **Enterprise at 14.99/mo:** Positioned below dedicated business expense
  tools. Attracts freelancers and small teams.

### Competitive Landscape

| App            | Individual | Family  | Model        |
| -------------- | ---------- | ------- | ------------ |
| Finance (ours) | 4.99/mo    | 7.99/mo | Freemium     |
| Monarch Money  | 9.99/mo    | -       | Subscription |
| Copilot        | 8.33/mo    | -       | Subscription |
| YNAB           | 14.99/mo   | -       | Subscription |

---

## Implementation Phases

### Phase 1: Foundation (Weeks 1-4)

**Goal:** Build the technical infrastructure for premium features.

| Issue | Task                                 | Agent Type    | Effort |
| ----- | ------------------------------------ | ------------- | ------ |
| #337  | Freemium tier feature gating         | KMP + plats   | L      |
| #338  | Premium subscription IAP (iOS first) | iOS + backend | L      |

**#337 - Freemium Feature Gating (P1)**

- [ ] Define FeatureFlag enum in KMP shared module with all gatable features
- [ ] Implement SubscriptionManager in KMP that tracks current tier
- [ ] Create PremiumGate UI component per platform showing upgrade prompt
- [ ] Gate checks must be instantaneous (cached tier state, no network call)
- [ ] Offline behavior: cached subscription state persists with 7-day grace
- [ ] Free-to-premium upgrade: seamless, no data migration
- [ ] Premium-to-free downgrade: keep data, show upgrade prompts

**#338 - Premium Subscription IAP (P1)**

- [ ] iOS: StoreKit 2, receipt validation via Supabase Edge Function
- [ ] Android: Google Play Billing Library v6+, server-side validation
- [ ] Web: Stripe Checkout with webhook integration
- [ ] Windows: Microsoft Store IAP via Windows.Services.Store API
- [ ] Backend: unified subscription state table, cross-platform sync
- [ ] Restore purchases flow on each platform

### Phase 2: Plans and Pricing (Weeks 5-8)

**Goal:** Launch Premium and Family plans with annual discount.

| Issue | Task                          | Agent Type    | Effort |
| ----- | ----------------------------- | ------------- | ------ |
| #339  | Family/household premium plan | Backend + KMP | M      |
| #344  | Annual subscription discount  | All platforms | S      |
| #340  | Privacy-as-premium marketing  | Marketing     | M      |

**#339 - Family/Household Premium Plan (P2)**

- [ ] Household owner subscribes to Family plan
- [ ] Owner invites members via shareable link (up to 6 total)
- [ ] All members receive premium while subscription is active
- [ ] Member management screen: add, remove, view members
- [ ] If owner cancels, members lose premium (with 30-day notice)

**#344 - Annual Subscription Discount (P2)**

- [ ] Monthly and annual options shown side by side on upgrade screen
- [ ] Annual savings amount displayed prominently
- [ ] Allow switching between monthly and annual billing
- [ ] Pro-rate when switching mid-cycle

**#340 - Privacy-as-Premium Marketing (P2)**

- [ ] Messaging: Your finances, your eyes only
- [ ] Privacy badge in app (visible to all users)
- [ ] Comparison page: what we collect vs industry norm
- [ ] Transparency report: data handling practices

### Phase 3: Growth and Community (Weeks 9-12)

**Goal:** Drive organic growth through referrals and community support.

| Issue | Task             | Agent Type      | Effort |
| ----- | ---------------- | --------------- | ------ |
| #342  | Referral program | Backend + plats | M      |
| #341  | Optional tip jar | All platforms   | S      |

**#342 - Referral Program (P2)**

- [ ] Shareable referral link per user (deep link all platforms)
- [ ] Reward: referrer and referee both get 1 month premium free
- [ ] Maximum 12 referral rewards per user (1 year of free premium)
- [ ] Referral tracking in user profile
- [ ] Fraud prevention: one referral per device, email verification

**#341 - Optional Tip Jar (P3)**

- [ ] Support Development option in Settings/About
- [ ] One-time tip amounts: 2, 5, 10, 25 (custom optional)
- [ ] Thank-you animation on purchase (non-intrusive)
- [ ] Never gatekeep features behind tips. Purely voluntary

### Phase 4: Enterprise (Weeks 13-20, v2.0 timeframe)

**Goal:** Small business tier for higher ARPU.

**#343 - Enterprise/Team Expense Tracking (P3)**

- [ ] Team creation and admin dashboard
- [ ] Invite team members via email with role assignment
- [ ] Shared expense categories and budgets
- [ ] Receipt capture with team-level storage
- [ ] Category-based reporting for accounting
- [ ] CSV export compatible with QuickBooks and Xero
- [ ] Approval workflow for expenses above threshold
- [ ] Audit trail for all transactions and approvals
- [ ] Per-seat pricing with volume discounts

---

## Revenue Projections

### Assumptions

- Month 1 downloads: 5,000 (from launch plan)
- Free-to-premium conversion: 5% (Month 1), growing to 8% (Month 6)
- Family plan adoption: 15% of premium subscribers
- Annual plan adoption: 40% of subscribers
- Monthly churn: 5%

### 6-Month Revenue Model

| Month | Total Users | Premium | Family | MRR    | Notes           |
| ----- | ----------- | ------- | ------ | ------ | --------------- |
| 1     | 5,000       | 250     | 38     | 1,553  | Launch month    |
| 2     | 8,000       | 480     | 72     | 2,974  | Growth phase    |
| 3     | 12,000      | 840     | 126    | 5,201  | Marketing push  |
| 4     | 16,000      | 1,120   | 168    | 6,935  | Steady growth   |
| 5     | 20,000      | 1,400   | 210    | 8,668  | Feature updates |
| 6     | 25,000      | 2,000   | 300    | 12,383 | Maturity        |

### Annual Revenue Target

- Year 1: 80K-120K ARR (conservative-optimistic range)
- Year 2: 250K-400K ARR (with enterprise tier)
- Break-even: Month 8-12 depending on infrastructure costs

---

## Risk Mitigation

| Risk                                | Impact | Mitigation                             |
| ----------------------------------- | ------ | -------------------------------------- |
| Low conversion (below 3%)           | High   | A/B test pricing, improve onboarding   |
| Platform IAP commission (15-30%)    | Medium | Web direct billing via Stripe          |
| Feature gating perceived as unfair  | High   | Generous free tier, no bait-and-switch |
| Cross-platform subscription sync    | Medium | Server-side source of truth            |
| Referral fraud                      | Low    | Device fingerprint, email verification |
| Enterprise scope creep              | Medium | MVP scope first, iterate               |
| Price sensitivity in privacy market | Medium | Position as investment in privacy      |

---

## Success Metrics

| Metric                         | Target (Month 3) | Target (Month 6) |
| ------------------------------ | ---------------- | ---------------- |
| Free-to-premium conversion     | 5%               | 8%               |
| Premium-to-family upsell       | 10%              | 15%              |
| Annual plan adoption           | 30%              | 40%              |
| Monthly churn rate             | < 6%             | < 5%             |
| MRR                            | 5,000            | 12,000           |
| Referral program participation | 10%              | 20%              |
| NPS (premium users)            | > 40             | > 50             |
| Refund rate                    | < 3%             | < 2%             |

---

## Dependencies

| Dependency                       | Required For | Status      |
| -------------------------------- | ------------ | ----------- |
| Supabase backend deployed        | #337, #338   | Complete    |
| E2E encryption working           | #340         | Complete    |
| Household sharing feature        | #339         | In progress |
| Push notification infrastructure | #342         | Planned     |
| App store developer accounts     | #338         | In progress |
| Stripe account setup             | #338 (web)   | Not started |
| Legal: terms of service          | #337, #338   | Not started |
| Legal: privacy policy update     | #340         | Not started |

---

## Acceptance Criteria Checklist

- [x] Tier structure defined (Free, Premium, Family, Enterprise)
- [x] Pricing strategy with competitive analysis
- [x] Implementation phases with issue-level breakdown
- [x] Revenue projections with assumptions documented
- [x] All 8 Stage 12 issues (#337-#344) addressed with acceptance criteria
- [x] Risk mitigation strategies for each major risk
- [x] Success metrics with monthly targets
- [x] Dependency map for monetization infrastructure
