# Growth Metrics Review and Sprint 8 Scope Adjustment

> **Sprint:** 8 — Growth and Retention
> **Issue:** #794
> **Priority:** P2 — Medium
> **Date:** 2025-07-27
> **Owner:** Product Management
> **Status:** Complete

---

## Executive Summary

This document defines the growth metrics framework for the Finance app, establishes measurement baselines, defines the free-to-premium conversion funnel, and adjusts Sprint 8 scope based on data-driven analysis. It serves as the operating playbook for measuring and optimizing growth from Sprint 8 onward.

---

## Growth Metrics Framework

### Core KPIs

| Category        | Metric           | Definition                                    | Target                        | Measurement Source                         |
| --------------- | ---------------- | --------------------------------------------- | ----------------------------- | ------------------------------------------ |
| **Acquisition** | Weekly New Users | New installs per week across all platforms    | Week-over-week growth >=5%    | App Store Connect, Play Console, analytics |
| **Acquisition** | CAC              | Total acquisition spend / new users           | Track baseline                | Marketing spend + analytics                |
| **Engagement**  | DAU              | Daily Active Users (unique users opening app) | Establish baseline            | Analytics (#764)                           |
| **Engagement**  | MAU              | Monthly Active Users                          | Establish baseline            | Analytics (#764)                           |
| **Engagement**  | DAU/MAU Ratio    | Stickiness indicator                          | >=20% (finance app benchmark) | Analytics (#764)                           |
| **Engagement**  | Session Length   | Average time in app per session               | >=3 minutes                   | Analytics (#764)                           |
| **Engagement**  | Sessions/Week    | Average sessions per active user per week     | >=4                           | Analytics (#764)                           |
| **Retention**   | D1 Retention     | % users returning day 1                       | >=40%                         | Analytics (#764)                           |
| **Retention**   | D7 Retention     | % users returning day 7                       | >=25%                         | Analytics (#764)                           |
| **Retention**   | D30 Retention    | % users returning day 30                      | >=15%                         | Analytics (#764)                           |
| **Conversion**  | Trial Start Rate | % of free users starting Premium trial        | >=10%                         | Paywall analytics                          |
| **Conversion**  | Trial-to-Paid    | % of trial users converting to paid           | 8-15%                         | IAP analytics                              |
| **Revenue**     | MRR              | Monthly Recurring Revenue                     | Track from Sprint 7           | Stripe + IAP APIs                          |
| **Revenue**     | ARPU             | Average Revenue Per User                      | Track from Sprint 7           | MRR / MAU                                  |

### Feature Adoption Metrics

| Feature      | Metric                               | Target | Sprint 8 Goal |
| ------------ | ------------------------------------ | ------ | ------------- |
| Accounts     | % users with >=1 account             | >=90%  | Baseline      |
| Transactions | % users logging >=1 transaction/week | >=60%  | Baseline      |
| Budgets      | % users with >=1 budget              | >=40%  | Baseline      |
| Goals        | % users with >=1 goal                | >=25%  | Baseline      |
| Sync         | % multi-device users                 | >=15%  | Baseline      |
| Export       | % users who exported data            | >=5%   | Baseline      |

---

## Conversion Funnel Specification

### Free-to-Premium Funnel

```
Stage 1: Free User Active
    |
    v  (Impression rate)
Stage 2: Premium Feature Encounter
    |    User attempts a gated feature
    v  (Consideration rate)
Stage 3: Paywall View
    |    User sees the paywall/comparison
    v  (Trial start rate)
Stage 4: Free Trial Start
    |    User begins 14-day trial
    v  (Trial engagement)
Stage 5: Trial Active Usage
    |    User uses Premium features during trial
    v  (Conversion rate)
Stage 6: Paid Subscription
    |    User converts after trial
    v  (Retention rate)
Stage 7: First Renewal
         User renews subscription
```

### Funnel Measurement Points

| Stage | Event                       | Properties              | Target Rate             |
| ----- | --------------------------- | ----------------------- | ----------------------- |
| 1 → 2 | `premium_feature_encounter` | feature, trigger_type   | 30-50% of free users    |
| 2 → 3 | `paywall_impression`        | feature, paywall_type   | 60-80% of encounters    |
| 3 → 4 | `trial_started`             | plan, source, feature   | 10-15% of paywall views |
| 4 → 5 | `trial_feature_used`        | feature, day_of_trial   | 70%+ of trial users     |
| 5 → 6 | `subscription_started`      | plan, price, trial_days | 8-15% of trials         |
| 6 → 7 | `subscription_renewed`      | plan, tenure_months     | 80%+ renewal rate       |

### Paywall Trigger Inventory

| Trigger               | Feature Gated         | User Action        | Paywall Type |
| --------------------- | --------------------- | ------------------ | ------------ |
| 6th budget creation   | Budget limit (5 free) | Tap "New Budget"   | Soft paywall |
| 4th goal creation     | Goal limit (3 free)   | Tap "New Goal"     | Soft paywall |
| Custom reports        | Report generation     | Tap "Reports"      | Soft paywall |
| AI categorization     | Auto-categorization   | Enable in settings | Soft paywall |
| NLP transaction input | Natural language      | Tap NLP mode       | Soft paywall |
| Advanced widgets      | Widget customization  | Edit widget layout | Soft paywall |
| Bank connection       | Auto-import           | Add bank account   | Soft paywall |
| Receipt scanning      | OCR capture           | Tap camera icon    | Soft paywall |

---

## Competitive Pricing Analysis

### Market Landscape (July 2025)

| App                | Free Tier           | Premium Price | Annual Price | Key Differentiator                         |
| ------------------ | ------------------- | ------------- | ------------ | ------------------------------------------ |
| **YNAB**           | None (34-day trial) | $14.99/mo     | $109/yr      | Zero-based budgeting methodology           |
| **Monarch Money**  | Limited             | $9.99/mo      | $99.99/yr    | Bank connections, investment tracking      |
| **Copilot**        | None (free trial)   | $9.99/mo      | $69.99/yr    | AI insights, Apple-native design           |
| **Goodbudget**     | Limited             | $8/mo         | $70/yr       | Envelope budgeting                         |
| **Simplifi**       | None (free trial)   | $5.99/mo      | $47.99/yr    | Bill tracking, spending plan               |
| **Finance (Ours)** | Generous free tier  | $4.99/mo      | $39.99/yr    | Privacy-first, cross-platform, local-first |

### Pricing Position

Finance Premium is positioned as the **most affordable** option in the category:

- **33% cheaper** than the next cheapest (Simplifi)
- **67% cheaper** than YNAB
- **60% cheaper** than Monarch and Copilot

This supports the "premium without exploitation" brand promise and reflects the cost advantage of local-first architecture (no expensive server-side processing for core features).

### Revenue Projections (Conservative)

| Scenario        | MAU    | Trial Rate | Conv. Rate | ARPU  | MRR     |
| --------------- | ------ | ---------- | ---------- | ----- | ------- |
| **Pessimistic** | 5,000  | 5%         | 5%         | $0.62 | $625    |
| **Base**        | 10,000 | 8%         | 10%        | $2.00 | $4,000  |
| **Optimistic**  | 25,000 | 12%        | 15%        | $5.62 | $14,063 |

---

## Sprint 8 Scope Adjustment

### Original Sprint 8 Plan (from Sprint Plan 6-10)

Sprint 8 was originally scoped for:

1. Platform widgets (Android #381, iOS, Web dashboard)
2. i18n framework and first 5 languages
3. Quick-entry mode
4. Referral program

### Data-Informed Adjustments

Based on the stability review (#788) and release planning (#792), the following adjustments are recommended:

#### Added to Sprint 8

| #    | Item                              | Rationale                                | Priority |
| ---- | --------------------------------- | ---------------------------------------- | -------- |
| #414 | iOS KMP bridge completion         | Tech debt blocking iOS v1.2 features     | P1       |
| #77  | Accessibility audit (WCAG 2.2 AA) | Legal compliance, 15%+ of users affected | P1       |
| #330 | RASP implementation               | Security hardening continuation          | P2       |
| #331 | Device attestation                | Security hardening continuation          | P2       |

#### Kept in Sprint 8

| #    | Item                       | Rationale                                       | Priority |
| ---- | -------------------------- | ----------------------------------------------- | -------- |
| #381 | Android widgets            | High engagement lever, Material You integration | P2       |
| #795 | i18n market prioritization | Research task, informs i18n engineering         | P2       |

#### Deferred from Sprint 8

| Item                    | Reason                                            | New Target |
| ----------------------- | ------------------------------------------------- | ---------- |
| Referral program (#342) | Premium must be proven before referral incentives | Sprint 10  |
| Quick-entry mode (#319) | Lower impact than accessibility and security      | Sprint 9   |

### Final Sprint 8 Engineering Workload

| Category               | Issues                         | Agent Type     |
| ---------------------- | ------------------------------ | -------------- |
| Engineering — iOS      | #414 (KMP bridge)              | iOS agent      |
| Engineering — Android  | #381 (widgets)                 | Android agent  |
| Engineering — Security | #330, #331 (RASP, attestation) | Security agent |
| Engineering — QA       | #77 (accessibility audit)      | QA agent       |
| Product — Research     | #795 (i18n market research)    | Product        |
| Product — Analytics    | #794 (this document)           | Product        |

**Total:** 4 engineering tasks + 2 product tasks = balanced sprint

---

## Cohort Analysis Framework

### User Cohorts to Track

| Cohort             | Definition                                | Key Metrics                          | Purpose                     |
| ------------------ | ----------------------------------------- | ------------------------------------ | --------------------------- |
| **Power Users**    | >=5 sessions/week, >=10 transactions/week | Feature adoption, Premium conversion | Identify Premium candidates |
| **Casual Users**   | 1-4 sessions/week                         | Retention, engagement patterns       | Reduce churn risk           |
| **Trial Users**    | Started Premium trial                     | Feature usage, conversion            | Optimize trial experience   |
| **Churned Users**  | No session in 14+ days                    | Last actions, feature usage          | Win-back opportunities      |
| **Multi-Platform** | Use 2+ platforms                          | Sync usage, session distribution     | Platform parity validation  |

### Engagement Segments

| Segment                | Criteria               | Expected Distribution | Strategy                  |
| ---------------------- | ---------------------- | --------------------- | ------------------------- |
| **Highly Engaged**     | DAU, >=5 sessions/week | 15-20%                | Upsell to Premium         |
| **Moderately Engaged** | WAU, 2-4 sessions/week | 40-50%                | Increase feature adoption |
| **Low Engagement**     | MAU, <2 sessions/week  | 20-30%                | Re-engagement campaigns   |
| **At Risk**            | No session in 7+ days  | 10-15%                | Win-back notifications    |

---

## Platform Performance Benchmarks

### Target Metrics by Platform

| Metric                | iOS                 | Android | Web         | Windows |
| --------------------- | ------------------- | ------- | ----------- | ------- |
| App Launch Time       | <1.5s               | <2.0s   | <3.0s (FCP) | <2.0s   |
| Screen Transition     | <300ms              | <300ms  | <500ms      | <300ms  |
| Sync Duration         | <5s (100 records)   | <5s     | <5s         | <5s     |
| Memory Usage (idle)   | <80MB               | <100MB  | <150MB      | <120MB  |
| Battery Impact        | <5% per hour active | <5%     | N/A         | <3%     |
| Crash-Free Rate       | >=99.5%             | >=99.5% | N/A         | >=99.5% |
| Offline → Online Sync | <10s (1000 records) | <10s    | <10s        | <10s    |

---

## Action Items

- [ ] Instrument all conversion funnel events once #764 analytics is live
- [ ] Configure cohort tracking in analytics platform
- [ ] Set up weekly metrics review cadence (every Monday)
- [ ] Create automated dashboard for core KPIs
- [ ] Begin A/B testing paywall copy after 2 weeks of baseline data
- [ ] Review pricing after 30 days of Premium data
- [ ] Track platform-specific conversion rates for parity
- [ ] Schedule Sprint 9 scope review based on Sprint 8 metrics
