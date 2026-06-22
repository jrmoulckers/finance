# Launch Metrics Dashboard & KPI Baseline

> **Issue:** #818
> **Sprint:** 6 — "Measure & Learn"
> **Priority:** P0 — Critical
> **Created:** 2025-07-27
> **Owner:** Business Analyst
> **Status:** Draft — Pending engineering validation of data sources

---

## Executive Summary

This document defines the complete business intelligence infrastructure for the Finance app post-launch. It specifies every core KPI with precise definitions, data sources, calculation methodology, baseline targets, and alerting thresholds. This is the foundational measurement layer that gates all subsequent business analysis (cohort analysis, churn modeling, conversion tracking, revenue forecasting).

**Key outcome:** A privacy-respecting, real-time metrics dashboard that provides actionable business intelligence without compromising our "no tracking, no ads, no data selling" commitment.

---

## 1. KPI Framework

### 1.1 Metric Taxonomy

All metrics are organized into five pillars aligned with the business lifecycle:

```
┌─────────────────────────────────────────────────────────────────┐
│                    FINANCE APP KPI FRAMEWORK                    │
├───────────┬───────────┬───────────┬───────────┬─────────────────┤
│ ACQUIRE   │ ACTIVATE  │ ENGAGE    │ MONETIZE  │ RETAIN          │
├───────────┼───────────┼───────────┼───────────┼─────────────────┤
│ Downloads │ Reg. Rate │ DAU/MAU   │ MRR       │ D1/D7/D30 Ret.  │
│ Installs  │ Onboarding│ Session   │ ARPU      │ Churn Rate      │
│ Sources   │ Completion│ Frequency │ Conv Rate │ Reactivation    │
│ CAC       │ 1st Txn   │ Features  │ LTV       │ NPS Proxy       │
│ WoW Growth│ Time-to-  │ Per-User  │ Trial→    │ Cohort Curves   │
│           │ Value     │ Actions   │ Paid %    │                 │
└───────────┴───────────┴───────────┴───────────┴─────────────────┘
```

### 1.2 Privacy Constraints on Analytics

All metrics MUST comply with these non-negotiable privacy principles:

| Constraint                                       | Implementation                                                                             |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **No PII in analytics**                          | All analytics use anonymized device/session IDs, never user email/name                     |
| **No individual tracking**                       | All dashboards show aggregate data only; minimum cohort size = 10 users                    |
| **No third-party analytics SDKs that sell data** | Use self-hosted or privacy-respecting analytics (PostHog self-hosted, Aptabase, or custom) |
| **Opt-out respected**                            | Users who disable analytics are excluded completely — not counted, not estimated           |
| **No fingerprinting**                            | No canvas fingerprinting, no device fingerprinting beyond anonymous ID                     |
| **Data minimization**                            | Collect only what's needed for each metric — no "collect everything, analyze later"        |

**Recommended Analytics Stack:**

| Component         | Option A (Self-hosted) | Option B (Privacy SaaS)  |
| ----------------- | ---------------------- | ------------------------ |
| Event collection  | PostHog self-hosted    | Aptabase (privacy-first) |
| Revenue metrics   | RevenueCat dashboard   | RevenueCat dashboard     |
| Crash/performance | Sentry (self-hosted)   | Sentry cloud (EU region) |
| Custom dashboards | Metabase on Supabase   | Retool on Supabase       |
| A/B testing       | PostHog feature flags  | Statsig (privacy mode)   |

---

## 2. Core KPI Definitions

### 2.1 Acquisition Metrics

#### KPI: Total Downloads

```
Definition:    Total number of app downloads across all platforms
Calculation:   SUM(downloads) across App Store, Play Store, Microsoft Store, Web installs
Data Source:    App Store Connect, Google Play Console, Microsoft Partner Center, web analytics
Granularity:   Daily, by platform
Baseline:      Establish in Week 1-2 (no prior benchmark — first launch)
Alert:         Daily downloads drop >50% from 7-day moving average
```

#### KPI: Install-to-Registration Rate

```
Definition:    Percentage of users who download the app AND create an account
Calculation:   (Registered users in period) / (Downloads in period) × 100
Data Source:    Store download counts ÷ backend registration events
Granularity:   Daily, by platform
Target:        ≥60% (industry benchmark for free apps: 50-70%)
Alert:         Rate drops below 40% for 3 consecutive days
```

#### KPI: Week-over-Week Growth Rate

```
Definition:    Growth rate of new users compared to previous week
Calculation:   ((New users this week) - (New users last week)) / (New users last week) × 100
Data Source:    Backend registration timestamps
Granularity:   Weekly
Target:        ≥5% WoW for first 3 months post-launch
Alert:         Negative WoW growth for 2 consecutive weeks
```

#### KPI: Customer Acquisition Cost (CAC)

```
Definition:    Average cost to acquire one new user (registered)
Calculation:   (Total acquisition spend in period) / (New registered users in period)
Data Source:    Marketing spend tracking + backend registrations
Granularity:   Monthly, by channel
Target:        Organic CAC = $0; Blended CAC < $2.00
Alert:         Blended CAC exceeds $5.00 (unsustainable given $4.99/mo pricing)
Note:          Track separately for organic, ASO, content, referral, paid channels
```

### 2.2 Activation Metrics

#### KPI: Onboarding Completion Rate

```
Definition:    Percentage of registered users who complete the onboarding flow
Calculation:   (Users completing onboarding) / (Users starting onboarding) × 100
Data Source:    Client-side onboarding flow events
Granularity:   Daily, by platform, by step
Target:        ≥75% (industry: 60-80% for simple onboarding)
Alert:         Rate drops below 50%
Sub-metrics:   Track completion rate per onboarding step to identify drop-off points
```

#### KPI: Time to First Value (TTFV)

```
Definition:    Time from registration to completing first meaningful action
Calculation:   MEDIAN(timestamp_first_transaction - timestamp_registration)
               Also track: MEDIAN(timestamp_first_budget - timestamp_registration)
Data Source:    Backend event timestamps
Granularity:   Daily cohorts, by platform
Target:        TTFV < 5 minutes for first transaction
Alert:         Median TTFV exceeds 15 minutes (excessive friction)
```

#### KPI: Activation Rate

```
Definition:    Percentage of registered users who reach "activated" status
Calculation:   (Users who complete activation criteria) / (Registered users) × 100
Data Source:    Backend — composite of activation events
Granularity:   Weekly cohorts
Target:        ≥40% within first 7 days

Activation Criteria (user must complete ALL within 7 days of registration):
  1. Create at least 1 account
  2. Log at least 3 transactions
  3. Return to app on a 2nd distinct day
```

### 2.3 Engagement Metrics

#### KPI: Daily Active Users (DAU)

```
Definition:    Unique users who opened the app and performed at least 1 action in a calendar day
Calculation:   COUNT(DISTINCT anonymous_user_id WHERE action_count >= 1) per day
Data Source:    Client-side session events
Granularity:   Daily, by platform
Baseline:      Establish from first 14 days of post-launch data
Alert:         DAU drops >20% day-over-day (excluding weekends)
Note:          "Action" = any write event (transaction, budget edit, goal update)
               App open without action = "passive session" (tracked separately)
```

#### KPI: Monthly Active Users (MAU)

```
Definition:    Unique users who performed at least 1 action in a rolling 28-day window
Calculation:   COUNT(DISTINCT anonymous_user_id WHERE action_count >= 1) in 28-day window
Data Source:    Client-side session events
Granularity:   Daily (rolling), by platform
Baseline:      Establish from first 30 days
Alert:         MAU declines for 3 consecutive weeks
```

#### KPI: DAU/MAU Ratio (Stickiness)

```
Definition:    Measures daily engagement intensity relative to monthly user base
Calculation:   DAU / MAU × 100 (expressed as percentage)
Data Source:    Derived from DAU and MAU
Granularity:   Daily (rolling)
Target:        ≥15% initially; ≥20% by end of Sprint 8
Industry:      Finance apps: 15-25%; Social apps: 30-50%; Games: 10-20%
Alert:         Ratio drops below 10% (users are not forming daily habits)
```

#### KPI: Session Frequency

```
Definition:    Average number of app sessions per active user per week
Calculation:   (Total sessions in week) / (Unique active users in week)
Data Source:    Client-side session start/end events
Granularity:   Weekly, by platform
Target:        ≥4 sessions/week (finance apps need habit formation)
Alert:         Average drops below 2 sessions/week
```

#### KPI: Session Duration

```
Definition:    Average time spent in app per session
Calculation:   MEAN(session_end - session_start) excluding sessions >30 min (likely backgrounded)
Data Source:    Client-side session events
Granularity:   Daily, by platform
Target:        2-5 minutes (finance apps are task-oriented, not dwell-time apps)
Alert:         Average exceeds 10 min (may indicate UX confusion) or drops below 30 sec
```

#### KPI: Feature Adoption Rate

```
Definition:    Percentage of MAU who used a specific feature at least once in 28 days
Calculation:   (Users who triggered feature event) / MAU × 100
Data Source:    Client-side feature usage events
Granularity:   Monthly, by feature, by platform

Track per feature:
  - Accounts:     CREATE, VIEW, EDIT, DELETE
  - Transactions: CREATE, VIEW, EDIT, CATEGORIZE, RECURRING
  - Budgets:      CREATE, VIEW, EDIT, TRACK
  - Goals:        CREATE, VIEW, EDIT, CONTRIBUTE
  - Reports:      VIEW_INSIGHTS, VIEW_CHARTS, EXPORT_DATA
  - Settings:     CUSTOMIZE, THEME, NOTIFICATION_PREFS

Target: Core features (accounts, transactions) ≥80% of MAU
        Secondary features (budgets, goals) ≥30% of MAU
        Power features (export, recurring) ≥10% of MAU
```

### 2.4 Monetization Metrics

#### KPI: Monthly Recurring Revenue (MRR)

```
Definition:    Total recurring subscription revenue in a calendar month
Calculation:   (Monthly subscribers × monthly_price) + (Annual subscribers × annual_price / 12)
Data Source:    RevenueCat / App Store Connect / Google Play Console
Granularity:   Daily (for trend), monthly (for reporting)
Baseline:      $0 until Premium launches (Sprint 7); track from day 1 of Premium
Alert:         MRR declines MoM (excluding seasonal variation)
Note:          Use NET MRR (after app store fees) for unit economics
```

#### KPI: Average Revenue Per User (ARPU)

```
Definition:    Average revenue generated per total user (including free users)
Calculation:   MRR / MAU
Data Source:    RevenueCat + session analytics
Granularity:   Monthly
Target:        ≥$0.25 initially (at 5% conversion × $4.99/mo)
Note:          Also track ARPPU (paying users only) = MRR / paying_subscribers
```

#### KPI: Trial-to-Paid Conversion Rate

```
Definition:    Percentage of free trial users who convert to paid subscription
Calculation:   (Users converting to paid within 7 days of trial end) / (Users who started trial) × 100
Data Source:    RevenueCat subscription events
Granularity:   Weekly cohorts
Target:        8-15% (industry benchmark for premium finance apps)
Alert:         Rate drops below 5% (paywall or value proposition issue)
```

#### KPI: Free-to-Premium Conversion Rate

```
Definition:    Percentage of total free users who become paying subscribers
Calculation:   (New premium subscribers in period) / (Total free users at period start) × 100
Data Source:    RevenueCat + backend user status
Granularity:   Monthly
Target:        3-8% overall (includes users who never trial)
```

#### KPI: Lifetime Value (LTV)

```
Definition:    Predicted total revenue from a subscriber over their entire subscription
Calculation:   ARPU_paying × (1 / monthly_churn_rate)
               OR: Monthly revenue per subscriber × average subscription duration in months
Data Source:    RevenueCat churn data + revenue data
Granularity:   Monthly recalculation
Target:        LTV ≥ $50 (implies ~10 months at $4.99/mo)
Alert:         LTV:CAC ratio drops below 3:1
```

### 2.5 Retention Metrics

#### KPI: Day-N Retention

```
Definition:    Percentage of users who return to the app N days after registration
Calculation:   (Users active on day N from registration cohort) / (Total users in registration cohort) × 100
Data Source:    Backend registration timestamps + client-side session events
Granularity:   Daily cohorts

Targets (finance app industry benchmarks):
  D1  (Day 1):   ≥40%  (industry: 25-35%)
  D7  (Day 7):   ≥25%  (industry: 15-20%)
  D14 (Day 14):  ≥18%  (industry: 10-15%)
  D30 (Day 30):  ≥15%  (industry: 8-12%)
  D60 (Day 60):  ≥10%  (industry: 5-8%)
  D90 (Day 90):  ≥8%   (industry: 3-5%)

Alert: D7 retention drops below 15% (critical — onboarding friction)
Alert: D30 retention drops below 8% (critical — value proposition issue)
```

#### KPI: Monthly Subscriber Churn Rate

```
Definition:    Percentage of paying subscribers who cancel in a given month
Calculation:   (Subscribers who cancelled in month) / (Total subscribers at start of month) × 100
Data Source:    RevenueCat subscription events
Granularity:   Monthly
Target:        <5% monthly (industry benchmark: 5-10% for consumer subscriptions)
Alert:         Churn exceeds 8% monthly (unsustainable — LTV collapses)
```

#### KPI: Net Revenue Retention (NRR)

```
Definition:    Revenue retained from existing subscribers including expansion/contraction
Calculation:   (MRR at end of month from customers who were subscribers at start of month) /
               (MRR at start of month) × 100
Data Source:    RevenueCat
Granularity:   Monthly
Target:        ≥95% (>100% indicates expansion revenue exceeds churn)
```

---

## 3. Dashboard Specification

### 3.1 Dashboard Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                     EXECUTIVE OVERVIEW                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐ │
│  │   MAU    │ │  MRR     │ │  D30 Ret │ │ Conv Rate│ │  NPS     │ │
│  │ ▲ 12%   │ │ ▲ $X     │ │  15.2%   │ │  8.3%    │ │  42      │ │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘ └──────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│                     ACQUISITION                                     │
│  Downloads/day (by platform) │ Registration rate │ CAC by channel   │
│  WoW growth trend            │ Source attribution │ Organic %        │
├─────────────────────────────────────────────────────────────────────┤
│                     ENGAGEMENT                                      │
│  DAU/MAU trend  │ Session frequency │ Feature adoption heatmap      │
│  Stickiness %   │ Session duration  │ Platform breakdown             │
├─────────────────────────────────────────────────────────────────────┤
│                     MONETIZATION                                    │
│  MRR trend      │ Conversion funnel │ ARPU trend │ LTV:CAC ratio    │
│  Plan mix (M/A) │ Trial performance │ Churn rate │ Revenue forecast │
├─────────────────────────────────────────────────────────────────────┤
│                     RETENTION                                       │
│  Retention curves (D1-D90) │ Churn signals │ Cohort heatmap         │
│  Reactivation rate         │ At-risk users │ Win-back performance    │
└─────────────────────────────────────────────────────────────────────┘
```

### 3.2 Dashboard Views

| View                     | Audience               | Refresh | Key Metrics                                           |
| ------------------------ | ---------------------- | ------- | ----------------------------------------------------- |
| **Executive Overview**   | Founders, stakeholders | Daily   | MAU, MRR, D30 retention, conversion rate, NPS proxy   |
| **Growth Dashboard**     | Product, Marketing     | Daily   | DAU/MAU, downloads, WoW growth, channel attribution   |
| **Revenue Dashboard**    | Business, Finance      | Daily   | MRR, ARPU, LTV, churn, conversion funnel              |
| **Engagement Dashboard** | Product, Engineering   | Daily   | Feature adoption, session metrics, platform breakdown |
| **Retention Dashboard**  | Product, Business      | Weekly  | Cohort curves, churn analysis, at-risk indicators     |

### 3.3 Data Sources & Integration

| Source                    | Metrics Provided                    | Integration Method            | Update Frequency          |
| ------------------------- | ----------------------------------- | ----------------------------- | ------------------------- |
| Analytics events (client) | DAU, MAU, sessions, feature usage   | Event pipeline → analytics DB | Real-time (batched 5 min) |
| Backend (Supabase)        | Registrations, user counts          | Direct DB query               | Real-time                 |
| RevenueCat                | MRR, subscriptions, churn, LTV      | Webhook + API                 | Near real-time            |
| App Store Connect         | iOS downloads, ratings, revenue     | API                           | Daily                     |
| Google Play Console       | Android downloads, ratings, revenue | API                           | Daily                     |
| Microsoft Partner Center  | Windows downloads, ratings          | API                           | Daily                     |
| Web analytics             | Web visits, PWA installs            | Self-hosted analytics         | Real-time                 |

---

## 4. Alerting Framework

### 4.1 Alert Severity Levels

| Severity        | Criteria                                                  | Response Time     | Escalation                         |
| --------------- | --------------------------------------------------------- | ----------------- | ---------------------------------- |
| 🔴 **Critical** | Core metric drops >30% in 24h                             | < 2 hours         | Immediate — all hands              |
| 🟠 **Warning**  | Core metric drops >20% in 48h or secondary metric anomaly | < 24 hours        | Business Analyst + Product Manager |
| 🟡 **Watch**    | Metric trend declining for 5+ days                        | < 72 hours        | Business Analyst                   |
| 🔵 **Info**     | Notable change worth monitoring                           | Next business day | Weekly review                      |

### 4.2 Specific Alerts

| Alert              | Condition                                               | Severity    | Action                                                |
| ------------------ | ------------------------------------------------------- | ----------- | ----------------------------------------------------- |
| DAU crash          | DAU drops >20% day-over-day (excl. weekends/holidays)   | 🔴 Critical | Investigate: app crash? Store removal? API outage?    |
| Registration cliff | Install-to-registration rate drops below 40% for 3 days | 🟠 Warning  | Check onboarding flow, auth service health            |
| Retention collapse | D7 retention for new cohort drops below 15%             | 🔴 Critical | Analyze latest cohort behavior; check for bugs        |
| Conversion drop    | Trial-to-paid rate drops below 5%                       | 🟠 Warning  | Review paywall, check pricing, analyze trial behavior |
| Churn spike        | Monthly churn exceeds 8%                                | 🟠 Warning  | Churn survey analysis, recent change review           |
| Growth stall       | Negative WoW growth for 2 consecutive weeks             | 🟡 Watch    | ASO review, channel analysis, competitor check        |
| Revenue decline    | MRR drops MoM                                           | 🟠 Warning  | Churn analysis + new subscriber analysis              |
| Feature regression | Any core feature adoption drops >30% MoM                | 🟡 Watch    | UX regression check, platform-specific investigation  |

---

## 5. Baseline Establishment Plan

### 5.1 Baseline Collection Timeline

```
Week 1 (Days 1-7):     Collect raw data; validate event firing; fix instrumentation gaps
Week 2 (Days 8-14):    First baseline snapshot; identify obvious issues
Week 3 (Days 15-21):   Baseline confirmation; adjust for launch spike normalization
Week 4 (Days 22-28):   Stable baseline established; alerting thresholds activated
```

### 5.2 Launch Spike Normalization

Post-launch data includes artificial spikes from:

- Product Hunt / Hacker News / Reddit launch posts (Days 1-3)
- Press coverage and social media (Days 1-7)
- Friends-and-family sharing (Days 1-5)

**Normalization method:**

1. Tag users by acquisition cohort (launch week vs. organic)
2. Report metrics both including and excluding launch cohort
3. Establish "steady state" baseline from Week 3+ data
4. Use steady-state metrics for target-setting and alerting

### 5.3 Baseline Targets (First 30 Days)

| Category        | Metric                    | Aggressive Target | Realistic Target | Minimum Viable |
| --------------- | ------------------------- | ----------------- | ---------------- | -------------- |
| **Acquisition** | Total downloads (30 days) | 10,000            | 3,000            | 1,000          |
| **Acquisition** | Install-to-register rate  | 70%               | 60%              | 45%            |
| **Activation**  | Onboarding completion     | 80%               | 70%              | 55%            |
| **Activation**  | Time to first value       | < 3 min           | < 5 min          | < 10 min       |
| **Engagement**  | DAU/MAU ratio             | 25%               | 18%              | 12%            |
| **Engagement**  | Sessions per week         | 5+                | 3.5              | 2              |
| **Retention**   | D1 retention              | 50%               | 40%              | 30%            |
| **Retention**   | D7 retention              | 30%               | 22%              | 15%            |
| **Retention**   | D30 retention             | 18%               | 13%              | 8%             |
| **Growth**      | WoW growth (steady state) | 10%               | 5%               | 2%             |

### 5.4 Platform-Specific Baseline Expectations

| Metric                      | iOS     | Android  | Web      | Windows  |
| --------------------------- | ------- | -------- | -------- | -------- |
| **Expected download share** | 35-45%  | 30-40%   | 10-15%   | 5-10%    |
| **Expected D7 retention**   | Higher  | Moderate | Lower    | Lower    |
| **Session frequency**       | Highest | High     | Moderate | Moderate |
| **Conversion to Premium**   | Highest | Moderate | Moderate | Lower    |

**Rationale:** iOS users typically show higher engagement and conversion in finance apps (higher disposable income demographic, Apple ecosystem trust). Web users have lowest retention (browser tab competition). Windows is niche but potentially high-value (power users).

---

## 6. Analytics Event Specification

### 6.1 Required Events (Minimum Viable Analytics)

```yaml
# Lifecycle events
app_opened:
  properties: [platform, app_version, session_id]

app_backgrounded:
  properties: [platform, session_duration_ms]

user_registered:
  properties: [platform, registration_method]

onboarding_step_completed:
  properties: [platform, step_name, step_index, time_in_step_ms]

onboarding_completed:
  properties: [platform, total_onboarding_time_ms]

# Core feature events
account_created:
  properties: [platform, account_type]

transaction_created:
  properties: [platform, entry_method] # manual, quick_entry, import

budget_created:
  properties: [platform]

goal_created:
  properties: [platform]

# Engagement events
feature_viewed:
  properties: [platform, feature_name, source] # how user navigated there

report_generated:
  properties: [platform, report_type]

data_exported:
  properties: [platform, export_format]

# Monetization events (Sprint 7+)
paywall_viewed:
  properties: [platform, trigger_feature, paywall_variant]

trial_started:
  properties: [platform, trigger_feature]

subscription_purchased:
  properties: [platform, plan_type, price_id]

subscription_cancelled:
  properties: [platform, subscription_duration_days, cancel_reason]

subscription_renewed:
  properties: [platform, plan_type, renewal_count]
```

### 6.2 Event Naming Convention

```
Format: {domain}_{action}_{object}  (lowercase, snake_case)
Examples:
  user_registered
  transaction_created
  budget_updated
  paywall_viewed
  subscription_purchased
```

### 6.3 Privacy-Safe Event Design

**DO include:**

- Anonymous session/user IDs (UUID, no mapping to PII)
- Feature names and navigation paths
- Timing data (how long actions take)
- Platform and app version
- Success/failure indicators

**DO NOT include:**

- Account balances, transaction amounts, or any financial data
- User names, emails, or any PII
- Location data (GPS, IP-based geolocation)
- Transaction descriptions or categories (user-created content)
- Any data that could reconstruct individual financial behavior

---

## 7. Implementation Recommendations

### 7.1 Analytics Platform Decision Matrix

| Criteria           | PostHog (Self-hosted)     | Aptabase           | Mixpanel (Privacy Mode) | Custom (Supabase)     |
| ------------------ | ------------------------- | ------------------ | ----------------------- | --------------------- |
| Privacy compliance | ✅ Full control           | ✅ Privacy-first   | 🟡 Configurable         | ✅ Full control       |
| Cost (10K MAU)     | ~$0 (self-hosted infra)   | ~$15/mo            | ~$25/mo                 | ~$0 (existing infra)  |
| Cost (100K MAU)    | ~$50/mo (infra)           | ~$50/mo            | ~$150/mo                | ~$30/mo (infra)       |
| Feature richness   | ✅ Full analytics suite   | 🟡 Basic analytics | ✅ Full suite           | 🔴 Build everything   |
| Setup complexity   | 🟡 Medium (Docker)        | ✅ Low (SDK)       | ✅ Low (SDK)            | 🔴 High (build)       |
| A/B testing        | ✅ Built-in feature flags | 🔴 No              | ✅ Yes                  | 🔴 Build or integrate |
| Dashboards         | ✅ Built-in               | 🟡 Basic           | ✅ Rich                 | 🔴 Build (Metabase)   |

**Recommendation:** PostHog self-hosted for maximum privacy control and feature richness. Aptabase as lightweight alternative if engineering capacity is limited. Custom Supabase solution only if both are rejected.

### 7.2 Revenue Tracking

**RevenueCat** (recommended) provides:

- Cross-platform subscription management (iOS, Android, Web)
- Real-time MRR, churn, LTV dashboards
- Cohort analysis for subscribers
- Webhook integration for custom analytics
- Privacy-respecting (processes payment data, not usage data)

### 7.3 Engineering Requirements

| Requirement                               | Priority | Sprint | Notes                                        |
| ----------------------------------------- | -------- | ------ | -------------------------------------------- |
| Analytics SDK integration (all platforms) | P0       | 6      | Must fire all lifecycle events               |
| Event validation pipeline                 | P1       | 6      | Ensure events are well-formed before storage |
| RevenueCat integration                    | P0       | 7      | Required for Premium launch                  |
| Dashboard deployment (PostHog/Metabase)   | P1       | 6      | Self-hosted, internal-only access            |
| Alert webhook integration                 | P2       | 6      | Slack/email for critical alerts              |

---

## 8. Success Criteria

### 8.1 Sprint 6 Completion Criteria

- [ ] Every KPI in this document has confirmed data flowing from at least 1 platform
- [ ] Dashboard deployed with real data (minimum 14 days)
- [ ] Baseline targets set for all metrics (may be revised as more data arrives)
- [ ] Alerting operational for all Critical and Warning level alerts
- [ ] Platform breakdown visible for all key metrics (no aggregate-only blindness)
- [ ] Zero PII exposure in analytics — privacy audit passed

### 8.2 Measurement Validation Checklist

| Validation                                 | Method                                             | Owner            |
| ------------------------------------------ | -------------------------------------------------- | ---------------- |
| Events firing correctly                    | Spot-check 100 events per platform                 | Engineering      |
| No PII in event payloads                   | Automated scan + manual audit                      | Security/Privacy |
| Dashboard calculations match raw data      | Cross-reference dashboard with SQL queries         | Business Analyst |
| RevenueCat data reconciles with store data | Compare RevenueCat MRR with App Store/Play reports | Business Analyst |
| Alerts trigger correctly                   | Simulate threshold breach with test data           | Engineering      |

---

## 9. Appendix: Industry Benchmarks

### 9.1 Finance App Benchmarks (Sources: Adjust 2024, AppsFlyer 2024, Liftoff 2024)

| Metric           | Bottom Quartile | Median | Top Quartile | Best-in-Class |
| ---------------- | --------------- | ------ | ------------ | ------------- |
| D1 Retention     | 18%             | 27%    | 35%          | 45%+          |
| D7 Retention     | 10%             | 16%    | 22%          | 30%+          |
| D30 Retention    | 5%              | 10%    | 15%          | 22%+          |
| DAU/MAU          | 8%              | 15%    | 22%          | 30%+          |
| Trial-to-Paid    | 3%              | 8%     | 15%          | 25%+          |
| Monthly Churn    | 12%+            | 7%     | 4%           | <3%           |
| ARPU (all users) | $0.05           | $0.15  | $0.40        | $1.00+        |

### 9.2 Competitor Benchmarks (Estimated from Public Data)

| Metric          | YNAB                | Monarch             | Copilot             | Finance (Target)   |
| --------------- | ------------------- | ------------------- | ------------------- | ------------------ |
| MAU (est.)      | 500K+               | 100K+               | 200K+               | Establish baseline |
| Paid conversion | ~N/A (no free tier) | ~N/A (no free tier) | ~N/A (no free tier) | 5-10%              |
| Monthly churn   | ~3-5% (est.)        | ~5-7% (est.)        | ~4-6% (est.)        | <5%                |
| Annual plan %   | ~60% (est.)         | ~50% (est.)         | ~55% (est.)         | Target: ≥50%       |

**Key insight:** Our closest competitors (YNAB, Monarch, Copilot) have NO free tier, making direct conversion rate comparison difficult. Our freemium model is more comparable to fitness/productivity apps.

---

_This document is the single source of truth for KPI definitions and measurement methodology. All subsequent business analysis (cohort analysis, churn modeling, revenue forecasting) MUST reference these definitions for consistency._
