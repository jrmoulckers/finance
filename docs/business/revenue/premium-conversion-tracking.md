# Premium Conversion Tracking & Paywall Analytics

> **Issue:** #822
> **Sprint:** 7 — "Monetize"
> **Priority:** P0 — Critical
> **Created:** 2025-07-27
> **Owner:** Business Analyst
> **Status:** Draft — Requires #338 (Premium IAP) to be live
> **Depends on:** #818 (KPI Dashboard), #821 (Churn Analysis), #338 (Premium IAP)

---

## Executive Summary

This document specifies the complete Premium conversion tracking infrastructure for the Finance app. It defines the full conversion funnel from free user to paying subscriber, catalogs every paywall touchpoint in the app, establishes trial behavior analysis frameworks, and provides the first Premium performance reporting template. This is the core monetization measurement layer — without it, we're flying blind on revenue optimization.

**Key principle:** Track conversion aggressively, but never let tracking compromise user experience. The paywall should feel like a natural upgrade path, not a trap.

---

## 1. Premium Conversion Funnel

### 1.1 Full Funnel Definition

```
PREMIUM CONVERSION FUNNEL — 7 Stages

Stage 1: FREE USER (Base)
    │  Total free users in the app
    │  Entry: Registration completion
    │
Stage 2: PREMIUM IMPRESSION
    │  Free user encounters a Premium-gated feature
    │  Trigger: Taps a locked feature, sees upgrade badge, hits account limit
    │  Metric: Impression rate = Premium impressions / Free MAU
    │
Stage 3: CONSIDERATION
    │  User taps "Learn More" or engages with the paywall trigger
    │  Metric: Consideration rate = Considerations / Impressions
    │
Stage 4: PAYWALL VIEW
    │  User sees the full pricing/paywall screen
    │  Metric: Paywall view rate = Paywall views / Considerations
    │
Stage 5: TRIAL START
    │  User begins 14-day free Premium trial (no credit card required)
    │  Metric: Trial start rate = Trials started / Paywall views
    │  Target: 20-30% of paywall viewers start trial
    │
Stage 6: TRIAL ENGAGEMENT
    │  User actively uses Premium features during trial period
    │  Metric: Trial feature usage (% of Premium features tried)
    │  Sub-metrics: Days active during trial, features discovered
    │
Stage 7: CONVERSION
    │  User converts to paid subscription (monthly or annual)
    │  Metric: Trial-to-paid rate = Conversions / Trial starts
    │  Target: 8-15% of trial starters convert
    │
Stage 8: RETENTION (Post-Conversion)
       First renewal confirms subscription viability
       Metric: First renewal rate = Renewals / First subscriptions
       Target: ≥85% first renewal rate
```

### 1.2 Funnel Metrics Dashboard

| Stage            | Metric                  | Calculation                        | Target         | Alert Threshold |
| ---------------- | ----------------------- | ---------------------------------- | -------------- | --------------- |
| Impressions      | Premium impression rate | Impressions / Free MAU per month   | ≥3 per user/mo | <1 per user/mo  |
| Consideration    | Tap-through rate        | Considerations / Impressions       | ≥15%           | <5%             |
| Paywall view     | View rate               | Views / Considerations             | ≥80%           | <50%            |
| Trial start      | Trial conversion        | Trials / Views                     | 20-30%         | <10%            |
| Trial engagement | Feature breadth         | Avg Premium features used in trial | ≥3 of 5        | <2              |
| Conversion       | Trial-to-paid           | Paid / Trials                      | 8-15%          | <5%             |
| Revenue split    | Annual plan %           | Annual subs / Total subs           | ≥50%           | <30%            |
| Retention        | First renewal           | Renewals / First subs              | ≥85%           | <75%            |

### 1.3 End-to-End Conversion Rate Model

```
E2E Conversion = Impression Rate × Tap Rate × View Rate × Trial Rate × Conversion Rate

Example (target scenario):
  Free MAU: 5,000
  × Premium impression rate: 80% (4,000 see a gate)
  × Tap-through rate: 15% (600 tap "Learn More")
  × Paywall view rate: 85% (510 see paywall)
  × Trial start rate: 25% (128 start trial)
  × Trial-to-paid rate: 12% (15 convert)

  Overall free-to-paid: 15 / 5,000 = 0.3% per month
  Annualized: ~3.5% of free users convert in Year 1

Revenue at this rate:
  15 new subscribers/month × ($4.99 monthly or $3.33/mo effective annual)
  Blended ARPU (assuming 50% annual): ~$4.16/mo
  MRR from month 1 cohort: $62
  Cumulative MRR after 12 months (with 5% monthly churn): ~$540
```

---

## 2. Paywall Trigger Inventory

### 2.1 Complete Paywall Touchpoint Catalog

Every point in the app where a free user encounters a Premium gate:

| #    | Trigger Location        | Feature Being Gated   | Trigger Type  | Priority | Notes                                                     |
| ---- | ----------------------- | --------------------- | ------------- | -------- | --------------------------------------------------------- |
| PW1  | **Accounts screen**     | Create 2nd+ account   | Soft gate     | P0       | Free tier = 1 account. Tapping "+" shows upgrade prompt   |
| PW2  | **Goals screen**        | Create any goal       | Soft gate     | P0       | Goals are Premium-only. Screen shows value proposition    |
| PW3  | **Reports screen**      | Advanced analytics    | Soft gate     | P1       | Free users see basic charts; advanced locked with preview |
| PW4  | **Export button**       | Data export (CSV/PDF) | Hard gate     | P1       | Tapping Export shows upgrade prompt                       |
| PW5  | **Settings → Sharing**  | Household sharing     | Hard gate     | P1       | "Invite partner" locked behind Premium                    |
| PW6  | **Budget screen**       | Unlimited budgets     | Soft gate     | P2       | Free tier = 3 budgets. 4th budget shows upgrade           |
| PW7  | **Category management** | Custom categories     | Soft gate     | P2       | Free tier uses default categories only                    |
| PW8  | **Insights tab**        | AI-powered insights   | Soft gate     | P2       | Sprint 9+; AI insights Premium-only                       |
| PW9  | **Settings → Theme**    | Premium themes        | Cosmetic gate | P3       | Low-friction upgrade opportunity                          |
| PW10 | **Trial banner**        | Premium trial CTA     | Proactive     | P0       | Periodic (not nagging) prompt to try Premium              |

### 2.2 Trigger Type Definitions

| Type              | Behavior                                             | User Experience                      | Conversion Potential         |
| ----------------- | ---------------------------------------------------- | ------------------------------------ | ---------------------------- |
| **Hard gate**     | Feature completely locked; must subscribe to use     | Clear value prop but may frustrate   | High (if feature is desired) |
| **Soft gate**     | Feature partially available; full version is Premium | User sees value before hitting limit | Highest (demonstrated value) |
| **Cosmetic gate** | Visual-only Premium features (themes, icons)         | Non-essential; low frustration       | Low (nice-to-have)           |
| **Proactive**     | App-initiated prompt (not triggered by user action)  | Must be gentle and infrequent        | Medium (depends on timing)   |

### 2.3 Paywall Frequency Rules

**Anti-annoyance rules (MANDATORY):**

| Rule                               | Implementation                                             | Rationale                  |
| ---------------------------------- | ---------------------------------------------------------- | -------------------------- |
| Max 1 proactive prompt per 7 days  | Server-side frequency cap                                  | Prevent nagging            |
| Never interrupt an active workflow | Paywall only on tap, never modal overlay during action     | Respect user intent        |
| Remember dismissal for 48 hours    | After user dismisses paywall, don't show proactive for 48h | Respect "not now"          |
| Never paywall during onboarding    | First 3 days: no upgrade prompts                           | Let user build habit first |
| Always show "Not Now" prominently  | Dismiss button same visual weight as CTA                   | No dark patterns           |
| Trial banner max 3 total lifetime  | After 3 dismissals, never show proactive again             | Permanent respect          |

### 2.4 Paywall Screen Design Requirements

```
┌─────────────────────────────────────┐
│         🔓 Unlock Premium           │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ ✅ Unlimited accounts         │  │
│  │ ✅ Financial goals            │  │
│  │ ✅ Advanced analytics         │  │
│  │ ✅ Data export (CSV/PDF)      │  │
│  │ ✅ Household sharing          │  │
│  │ ✅ Custom categories          │  │
│  │ ✅ Premium themes             │  │
│  └───────────────────────────────┘  │
│                                     │
│  ┌───────────────────────────────┐  │
│  │ Try Premium Free for 14 Days │  │ ← Primary CTA
│  │  No credit card required     │  │
│  └───────────────────────────────┘  │
│                                     │
│  Monthly: $4.99/mo                  │
│  Annual:  $39.99/yr (Save 33%) ← ★ │ ← Highlight annual
│                                     │
│  ┌───────────────────────────────┐  │
│  │        Not Now                │  │ ← Clear dismiss
│  └───────────────────────────────┘  │
│                                     │
│  🔒 Same privacy. More features.   │ ← Privacy assurance
│  Your data stays on your device.    │
└─────────────────────────────────────┘
```

---

## 3. Trial Behavior Analysis

### 3.1 Trial Metrics Framework

| Metric                                | Definition                                               | Target                  | Analysis Purpose                    |
| ------------------------------------- | -------------------------------------------------------- | ----------------------- | ----------------------------------- |
| **Trial start rate**                  | % of paywall viewers who start trial                     | 20-30%                  | Paywall effectiveness               |
| **Trial engagement rate**             | % of trial days with at least 1 session                  | ≥50% (7/14 days active) | Trial value perception              |
| **Premium feature breadth**           | Avg distinct Premium features used during trial          | ≥3 of 5+ features       | Feature discovery                   |
| **Trial completion rate**             | % of trials that reach Day 14 (not cancelled early)      | ≥80%                    | Trial length appropriateness        |
| **Conversion rate**                   | % of completed trials converting to paid                 | 8-15%                   | Value demonstration success         |
| **Time to convert**                   | Days from trial start to subscription purchase           | —                       | Decision timing insight             |
| **Plan selection**                    | % choosing monthly vs. annual at conversion              | ≥50% annual             | Annual plan attractiveness          |
| **Post-trial churn (non-converters)** | % of non-converting trial users who also churn from free | <30%                    | Trial didn't damage free experience |

### 3.2 Trial Engagement Timeline

```
Trial Day Analysis Framework:

Day 1-3:  "Discovery Phase"
  - User explores Premium features
  - Key metric: Number of Premium features tried
  - Predictor: Users who try 3+ features in Days 1-3 convert at 2× rate

Day 4-7:  "Evaluation Phase"
  - User settles into using specific Premium features
  - Key metric: Which features become habitual?
  - Predictor: Daily usage pattern emerges (or doesn't)

Day 8-11: "Decision Formation"
  - User has enough data to see value (2+ weeks of spending data)
  - Key metric: Session frequency trend (increasing = good)
  - Predictor: Users active on 5+ of Days 8-11 convert at 3× rate

Day 12-14: "Conversion Window"
  - Trial end approaching; decision time
  - Key metric: Paywall view on Day 12-14
  - Action: "Your trial ends in X days" notification (Day 12, Day 14)
  - Anti-dark-pattern: Show what happens on downgrade (data preserved, features locked)
```

### 3.3 Trial Length Validation

**Question: Is 14 days the right trial length?**

| Trial Length          | Pros                                                         | Cons                                                          | Industry Data                              |
| --------------------- | ------------------------------------------------------------ | ------------------------------------------------------------- | ------------------------------------------ |
| **7 days**            | Faster conversion decision; less free usage                  | May not build enough value; user doesn't see monthly patterns | Used by: some productivity apps            |
| **14 days (current)** | Two weekends of usage; forms habit; sees 2 weeks of spending | Some users "forget" they're on trial; longer free ride        | Used by: YNAB (34 days), many finance apps |
| **30 days**           | Full month of data; strongest value demonstration            | Long free ride; high trial starts but lower conversion rate   | Used by: some enterprise SaaS              |

**Validation method:**

1. Track trial engagement by day (which days have sessions?)
2. If >70% of trial engagement happens in Days 1-7, consider shortening to 7 days
3. If engagement peaks in Days 10-14, 14 days is correct
4. If engagement is still rising at Day 14, consider extending to 21 days

### 3.4 Premium Feature Usage During Trial

| Premium Feature    | % Trial Users Who Try | % Who Use 3+ Times | Conversion Lift | Recommendation                             |
| ------------------ | --------------------- | ------------------ | --------------- | ------------------------------------------ |
| Multiple accounts  | —                     | —                  | —               | Track: Is this the #1 reason to upgrade?   |
| Goals              | —                     | —                  | —               | Track: Does goal-setting drive commitment? |
| Advanced analytics | —                     | —                  | —               | Track: Do insights create "aha" moments?   |
| Data export        | —                     | —                  | —               | Track: One-time use or recurring need?     |
| Household sharing  | —                     | —                  | —               | Track: Couples who share → high retention? |
| Custom categories  | —                     | —                  | —               | Track: Power user feature or nice-to-have? |

---

## 4. Subscription Platform Integration

### 4.1 RevenueCat Integration Spec

**RevenueCat** is the recommended subscription management platform for cross-platform consistency:

| Feature          | Requirement                                                       | Implementation                                                   |
| ---------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------- |
| **Entitlements** | Single "premium" entitlement across all platforms                 | RevenueCat entitlement check → feature unlock                    |
| **Products**     | 2 products: `premium_monthly` ($4.99), `premium_annual` ($39.99)  | Configured per app store + RevenueCat                            |
| **Trial**        | 14-day free trial (no payment method required where store allows) | StoreKit 2 (iOS), Google Billing (Android), Stripe (Web/Windows) |
| **Webhooks**     | Real-time subscription events → analytics pipeline                | `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`      |
| **Restore**      | Cross-platform purchase restoration                               | RevenueCat user identity linking                                 |

### 4.2 Subscription Event Tracking

```yaml
# RevenueCat webhook events → Analytics pipeline

subscription_started:
  properties: [platform, plan_type, price, trial_used, trigger_feature]

subscription_renewed:
  properties: [platform, plan_type, renewal_number, total_revenue]

subscription_cancelled:
  properties: [platform, plan_type, duration_days, cancel_reason]

subscription_expired:
  properties: [platform, plan_type, was_trial_only]

trial_started:
  properties: [platform, trigger_feature, paywall_variant]

trial_converted:
  properties: [platform, plan_type, trial_features_used, trial_days_active]

trial_expired:
  properties: [platform, trial_features_used, trial_days_active]
```

### 4.3 Revenue Reconciliation

| Data Source             | What It Tells Us                             | Reconciliation Check                             |
| ----------------------- | -------------------------------------------- | ------------------------------------------------ |
| **RevenueCat**          | Real-time MRR, subscriber count, churn       | Primary source of truth for subscription metrics |
| **App Store Connect**   | iOS revenue (after Apple's 30%/15% cut)      | Verify against RevenueCat iOS revenue            |
| **Google Play Console** | Android revenue (after Google's 30%/15% cut) | Verify against RevenueCat Android revenue        |
| **Stripe**              | Web/Windows revenue (2.9% + $0.30 per txn)   | Verify against RevenueCat web revenue            |

**Reconciliation frequency:** Weekly manual check for first month; monthly thereafter.

---

## 5. Conversion Analytics Dashboard

### 5.1 Dashboard Sections

**Section 1: Funnel Overview**

- Full funnel visualization (Impression → Trial → Conversion)
- Period comparison (this week vs. last week)
- Platform breakdown

**Section 2: Paywall Performance**

- Paywall view count by trigger point
- Trial start rate by trigger point (which gates convert best?)
- Paywall dismissal reasons (if tracked)

**Section 3: Trial Performance**

- Active trials count
- Trial engagement rate (% of trial days active)
- Premium features used during trial (distribution)
- Conversion prediction: Trial users likely to convert (based on Day 1-7 behavior)

**Section 4: Revenue**

- MRR trend (daily/weekly/monthly)
- Plan mix (monthly vs. annual)
- Revenue by platform
- New MRR vs. Churned MRR vs. Net MRR

**Section 5: Subscriber Health**

- Total active subscribers
- First renewal rate
- Churn rate trend
- LTV estimate (updating as data accumulates)

### 5.2 Report Cadence

| Report                        | Frequency         | Audience                     | Contents                                          |
| ----------------------------- | ----------------- | ---------------------------- | ------------------------------------------------- |
| **Daily metrics snapshot**    | Daily (automated) | Product, Business            | Key funnel numbers, MRR, alerts                   |
| **Weekly conversion report**  | Weekly            | Product, Business, Marketing | Full funnel analysis, WoW trends                  |
| **Monthly revenue report**    | Monthly           | Stakeholders, all teams      | MRR, subscriber growth, unit economics, forecasts |
| **Quarterly business review** | Quarterly         | Stakeholders                 | Comprehensive performance, strategy adjustments   |

---

## 6. Paywall A/B Testing Framework

### 6.1 Testable Elements

| Element                  | Variant A (Control)            | Variant B                             | Hypothesis                                     |
| ------------------------ | ------------------------------ | ------------------------------------- | ---------------------------------------------- |
| **CTA text**             | "Try Premium Free"             | "Start Your Free Trial"               | "Try Free" may have higher CTR                 |
| **Price display**        | Monthly + Annual               | Annual-first + Monthly                | Leading with annual may increase annual plan % |
| **Feature list**         | All 7 features                 | Top 3 features + "and more"           | Shorter list may reduce decision fatigue       |
| **Privacy message**      | "Same privacy. More features." | "Your data never leaves your device." | Direct privacy claim may increase trust        |
| **Trial length display** | "14-day free trial"            | "2-week free trial"                   | "14 days" may feel longer (more generous)      |
| **Social proof**         | None                           | "Joined by X users this week"         | Social proof may increase trial starts         |
| **Trigger timing**       | After 3rd gate hit             | After 5th gate hit                    | Later trigger = more invested user             |

### 6.2 A/B Test Statistical Requirements

```
Minimum Detectable Effect (MDE): 5 percentage points
  e.g., trial start rate from 20% → 25%

Required sample size per variant:
  n = (Zα/2 + Zβ)² × p(1-p) / MDE²
  n = (1.96 + 0.84)² × 0.20 × 0.80 / 0.05²
  n = 7.84 × 0.16 / 0.0025
  n ≈ 502 paywall views per variant

Test duration: Until both variants reach 500+ paywall views
  At estimated 30 paywall views/day: ~17 days per test
  Run max 1 test at a time (avoid interaction effects)

Statistical method: Two-proportion z-test with α=0.05
  Also report: 95% CI, effect size, p-value
  Decision rule: Implement winner only if p < 0.05 AND practical significance (MDE ≥ 3pp)
```

---

## 7. Platform-Specific Conversion Analysis

### 7.1 Platform Conversion Expectations

| Platform    | Expected Conversion Rate | Rationale                                                               |
| ----------- | ------------------------ | ----------------------------------------------------------------------- |
| **iOS**     | Highest (10-15%)         | Higher income demo, Apple Pay frictionless, strong IAP trust            |
| **Android** | Medium (6-10%)           | Larger volume, more price-sensitive, variable device quality            |
| **Web**     | Medium-Low (5-8%)        | Stripe checkout friction, no app store trust, but desktop = power users |
| **Windows** | Unknown (5-10%)          | Niche audience, likely power users, Microsoft Store IAP less proven     |

### 7.2 Platform-Specific Tracking Requirements

| Platform | Subscription SDK                   | Trial Support         | Tracking Notes                                    |
| -------- | ---------------------------------- | --------------------- | ------------------------------------------------- |
| iOS      | StoreKit 2 via RevenueCat          | Native offer          | App Store requires specific purchase flow         |
| Android  | Google Play Billing via RevenueCat | Native offer          | Must handle free trial per Google policy          |
| Web      | Stripe via RevenueCat              | Custom implementation | No app store mediation; direct billing            |
| Windows  | Microsoft Store via RevenueCat     | Native offer          | Smaller user base; may need manual reconciliation |

---

## 8. Success Criteria

- [ ] Every paywall touchpoint (PW1-PW10) cataloged with trigger conditions and metrics
- [ ] Complete 7-stage conversion funnel instrumented with zero measurement gaps
- [ ] RevenueCat integration live and reporting MRR, subscriptions, churn accurately
- [ ] Revenue reconciliation passing between RevenueCat and app store dashboards
- [ ] Trial behavior analysis framework defined with Day 1-3, 4-7, 8-11, 12-14 tracking
- [ ] First Premium performance report produced (after 14+ days of Premium availability)
- [ ] Free tier validated as still genuinely useful (free user retention not declining post-Premium launch)
- [ ] Paywall anti-annoyance rules implemented and verified
- [ ] Platform-specific conversion rates tracked (iOS vs. Android vs. Web vs. Windows)
- [ ] A/B testing framework ready with statistical methodology defined

---

_This specification must be implemented BEFORE or concurrent with #338 (Premium IAP) launch. Conversion tracking that starts late means lost data and delayed optimization. Coordinate with engineering to ensure analytics events are firing from Day 1 of Premium availability._
