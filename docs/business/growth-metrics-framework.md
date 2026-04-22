# Growth Metrics Framework

**Issue:** #1025
**Sprint:** 15 — Growth Metrics Framework
**Priority:** P2 — Medium
**Status:** Complete
**Document Owner:** Product Management
**Date:** 2025-07-30
**Related:** [KPI Dashboard Spec](kpi-dashboard-spec.md) ·
[Growth Analysis](growth-analysis-sprint8.md) ·
[Premium Conversion Tracking](premium-conversion-tracking.md) ·
[Premium Strategy](premium-strategy-conversion-funnel.md)

---

## Executive Summary

This document defines the comprehensive growth metrics framework for the Finance
app across all four platforms (iOS, Android, Web, Windows). It covers core
metric definitions, per-platform tracking plans, retention curve targets, NPS
methodology, success criteria with alert thresholds, and privacy-compliant
tracking architecture. This framework is the single source of truth for how we
measure success.

### Metrics Philosophy

1. **Privacy-first measurement** — All metrics use anonymous, aggregated data.
   No PII in analytics. No third-party SDKs that sell data.
2. **Actionable over vanity** — Every metric must answer "what should we do?"
   not just "how big are we?"
3. **Platform parity** — Same metrics, same definitions, same targets across
   all 4 platforms. Platform-specific breakdowns for debugging only.
4. **Leading indicators** — Prioritize metrics that predict future outcomes
   (activation rate, feature adoption) over lagging indicators (total users).

---

## 1. Core Metrics Taxonomy

### 1.1 AARRR Framework (Pirate Metrics)

| Stage       | Key Metric        | Definition                                      | Target       |
| ----------- | ----------------- | ----------------------------------------------- | ------------ |
| Acquisition | Weekly new users  | New registrations per week across all platforms | 500+/week    |
| Activation  | Activation rate   | % of new users who add first transaction in D1  | 40%+         |
| Retention   | D30 retention     | % of users returning 30 days after registration | 15%+         |
| Revenue     | MRR               | Monthly recurring subscription revenue          | Track growth |
| Referral    | Viral coefficient | Avg referrals per user that result in signups   | 0.1+         |

### 1.2 Engagement Metrics

| Metric                   | Definition                                     | Target       | Alert    |
| ------------------------ | ---------------------------------------------- | ------------ | -------- |
| DAU (Daily Active Users) | Unique users with 1+ session per day           | Track growth | -20% WoW |
| WAU (Weekly Active)      | Unique users with 1+ session per week          | Track growth | -15% WoW |
| MAU (Monthly Active)     | Unique users with 1+ session per month         | Track growth | -10% MoM |
| DAU/MAU ratio            | Daily stickiness (DAU / MAU)                   | 20%+         | < 12%    |
| Sessions per DAU         | Avg sessions per active user per day           | 1.5+         | < 1.1    |
| Session duration         | Median time in app per session                 | 2–5 min      | < 1 min  |
| Transactions per WAU     | Avg transactions logged per weekly active user | 5+           | < 2      |
| Feature breadth          | Avg distinct features used per MAU             | 3+           | < 2      |

### 1.3 Retention Metrics

| Metric            | Definition                                           | Target | Alert |
| ----------------- | ---------------------------------------------------- | ------ | ----- |
| D1 retention      | % returning Day 1 after registration                 | 40%+   | < 25% |
| D7 retention      | % returning Day 7                                    | 25%+   | < 15% |
| D30 retention     | % returning Day 30                                   | 15%+   | < 8%  |
| D90 retention     | % returning Day 90                                   | 10%+   | < 5%  |
| D365 retention    | % returning Day 365                                  | 5%+    | < 2%  |
| Premium D30 ret   | % of premium subscribers active at Day 30            | 85%+   | < 70% |
| Churn rate        | Monthly: cancelled subs / total subs at period start | < 5%   | > 8%  |
| Reactivation rate | Previously churned users who return per month        | 5%+    | < 2%  |

### 1.4 Revenue Metrics

| Metric               | Definition                                    | Target | Alert     |
| -------------------- | --------------------------------------------- | ------ | --------- |
| MRR                  | Monthly recurring revenue from subscriptions  | Growth | Decline   |
| ARPU                 | Revenue / MAU (all users)                     | Track  | < $0.05   |
| ARPPU                | Revenue / paying users                        | $4.50+ | < $3.50   |
| LTV                  | Avg total revenue per subscriber before churn | $60+   | < $30     |
| LTV:CAC ratio        | Lifetime value / Customer acquisition cost    | 3:1+   | < 2:1     |
| Trial-to-paid        | % of trial users converting to paid           | 12%+   | < 5%      |
| Annual plan %        | % of subscribers on annual billing            | 50%+   | < 30%     |
| Revenue per platform | MRR broken down by iOS/Android/Web/Windows    | Track  | Imbalance |

### 1.5 Acquisition Metrics

| Metric            | Definition                                      | Target  | Alert    |
| ----------------- | ----------------------------------------------- | ------- | -------- |
| New installs      | App installs per platform per week              | Track   | -30% WoW |
| Registration rate | Installs that complete registration             | 60%+    | < 40%    |
| Activation rate   | Registrations that add first transaction in 24h | 40%+    | < 25%    |
| Time to value     | Median time from install to first transaction   | < 5 min | > 15 min |
| Organic %         | % of installs from organic (non-paid) channels  | 80%+    | < 60%    |
| CAC               | Total acquisition spend / new users             | < $2    | > $5     |
| Channel quality   | D30 retention by acquisition channel            | Track   | Variance |

---

## 2. Per-Platform Tracking Plan

### 2.1 Data Sources Per Platform

| Data Point          | iOS                   | Android                | Web                   | Windows               |
| ------------------- | --------------------- | ---------------------- | --------------------- | --------------------- |
| Installs            | App Store Connect     | Play Console           | Web analytics         | MS Partner Center     |
| Sessions            | Self-hosted analytics | Self-hosted analytics  | Self-hosted analytics | Self-hosted analytics |
| Transactions logged | Local DB count        | Local DB count         | Local DB count        | Local DB count        |
| Feature usage       | Event tracking        | Event tracking         | Event tracking        | Event tracking        |
| Subscription status | StoreKit 2 + backend  | Play Billing + backend | Stripe + backend      | MS Store + backend    |
| Crash rate          | Sentry (self-hosted)  | Sentry (self-hosted)   | Sentry (self-hosted)  | Sentry (self-hosted)  |
| Store ratings       | App Store Connect API | Play Console API       | N/A (PWA)             | MS Store API          |
| Push delivery       | APNs feedback         | FCM delivery reports   | Web Push API          | WNS feedback          |

### 2.2 Event Tracking Schema

All platforms emit the same event schema via the shared KMP analytics module:

| Event Name               | Properties                               | Trigger                     |
| ------------------------ | ---------------------------------------- | --------------------------- |
| app_open                 | platform, app_version, session_id        | App launched                |
| registration_complete    | platform, onboarding_path                | User completes signup       |
| first_transaction        | platform, time_since_registration        | First transaction logged    |
| transaction_logged       | platform, entry_method (manual/nlp/scan) | Any transaction logged      |
| budget_created           | platform, is_shared                      | Budget created              |
| goal_created             | platform                                 | Goal created                |
| feature_gate_hit         | platform, feature_name, gate_type        | User hits a premium gate    |
| paywall_viewed           | platform, trigger_source                 | Paywall screen displayed    |
| trial_started            | platform, trigger_source                 | Trial activated             |
| subscription_started     | platform, plan, billing_cycle            | Paid subscription started   |
| subscription_cancelled   | platform, plan, tenure_days              | User cancels subscription   |
| export_completed         | platform, format                         | Data export finished        |
| bank_connected           | platform                                 | Bank account linked         |
| health_score_viewed      | platform, score_value                    | Health score screen opened  |
| widget_configured        | platform, widget_type                    | Widget added to home screen |
| referral_link_shared     | platform                                 | User shares referral link   |
| education_tooltip_viewed | platform, concept_name                   | Tooltip expanded            |

### 2.3 Privacy-Compliant Implementation

| Requirement                 | Implementation                                      |
| --------------------------- | --------------------------------------------------- |
| Anonymous IDs               | Random UUID per device, not tied to user account    |
| No PII in events            | No email, name, or account numbers in event data    |
| Opt-out respected           | analytics_enabled preference; opted-out = no events |
| Minimum aggregation         | Dashboard shows cohorts of 10+ users minimum        |
| Data retention              | Raw events deleted after 90 days; aggregates kept   |
| No third-party data sharing | Self-hosted analytics; no data leaves our infra     |
| Transparency                | In-app "What We Measure" page explaining tracking   |

### 2.4 Analytics Stack

| Component         | Recommended                | Privacy Rationale               |
| ----------------- | -------------------------- | ------------------------------- |
| Event collection  | PostHog (self-hosted)      | Full control, no data sharing   |
| Revenue tracking  | RevenueCat + Supabase      | Cross-platform sub management   |
| Crash reporting   | Sentry (self-hosted or EU) | No PII in crash reports         |
| Custom dashboards | Metabase on Supabase       | Self-hosted, query our own data |
| A/B testing       | PostHog feature flags      | Same infra, no additional SDK   |

---

## 3. Retention Curve Targets

### 3.1 Target Retention Curves

**All Users (Free + Premium):**

| Day  | Target | Good   | Acceptable | Alert |
| ---- | ------ | ------ | ---------- | ----- |
| D1   | 45%    | 40–50% | 30–40%     | < 25% |
| D3   | 35%    | 30–40% | 25–30%     | < 20% |
| D7   | 28%    | 25–32% | 18–25%     | < 15% |
| D14  | 22%    | 18–25% | 12–18%     | < 10% |
| D30  | 18%    | 15–20% | 10–15%     | < 8%  |
| D60  | 14%    | 12–16% | 8–12%      | < 6%  |
| D90  | 12%    | 10–14% | 6–10%      | < 5%  |
| D180 | 8%     | 6–10%  | 4–6%       | < 3%  |
| D365 | 5%     | 4–7%   | 2–4%       | < 2%  |

**Premium Subscribers Only:**

| Day  | Target | Alert |
| ---- | ------ | ----- |
| D30  | 90%    | < 80% |
| D60  | 85%    | < 75% |
| D90  | 80%    | < 70% |
| D180 | 70%    | < 55% |
| D365 | 55%    | < 40% |

### 3.2 Retention by Platform (Expected Variance)

| Platform | Expected D30 | Rationale                                      |
| -------- | ------------ | ---------------------------------------------- |
| iOS      | 18–22%       | Historically higher retention on iOS           |
| Android  | 14–18%       | Broader device range, more casual installs     |
| Web      | 10–14%       | Lower commitment (no install), easier to churn |
| Windows  | 16–20%       | Desktop users are intentional, fewer installs  |

Platform variance > 30% from the average signals a platform-specific issue
that needs investigation.

### 3.3 Retention Improvement Levers

| Lever                           | Target Day | Expected Lift | Effort |
| ------------------------------- | ---------- | ------------- | ------ |
| Improve onboarding (faster TTV) | D1         | +5–10%        | M      |
| Push notification reminders     | D3, D7     | +3–5%         | S      |
| Weekly spending summary email   | D7, D30    | +5–8%         | M      |
| Gamification (streaks, badges)  | D30+       | +3–5%         | L      |
| Widget adoption (passive view)  | D30+       | +5–10%        | M      |
| Bank connection (auto-import)   | D30+       | +10–15%       | L      |
| Education content engagement    | D30+       | +3–5%         | M      |

---

## 4. NPS Measurement

### 4.1 NPS Survey Design

**Core Question:** "How likely are you to recommend Finance to a friend or
colleague?" (0–10 scale)

**Follow-up (conditional):**

- Promoters (9–10): "What do you love most about Finance?"
- Passives (7–8): "What would make Finance a 10 for you?"
- Detractors (0–6): "What's the biggest issue holding you back?"

### 4.2 Survey Delivery

| Parameter          | Value                                       |
| ------------------ | ------------------------------------------- |
| Delivery method    | In-app modal (non-blocking)                 |
| Frequency          | Every 90 days per user                      |
| Trigger            | After 3+ sessions in the current week       |
| Minimum app tenure | 14 days (no surveys for new users)          |
| Dismissable        | Yes, always (with "remind me later" option) |
| Incentive          | None (to avoid bias)                        |
| Sample target      | 10% of MAU per quarter                      |

### 4.3 NPS Targets

| Segment       | Target NPS | Good  | Alert |
| ------------- | ---------- | ----- | ----- |
| All users     | 40+        | 30–50 | < 20  |
| Premium users | 55+        | 45–65 | < 35  |
| Free users    | 30+        | 20–40 | < 10  |
| iOS users     | 45+        | 35–55 | < 25  |
| Android users | 35+        | 25–45 | < 15  |
| Web users     | 30+        | 20–40 | < 10  |
| Windows users | 40+        | 30–50 | < 20  |

### 4.4 NPS Action Protocol

| NPS Score | Action                                                      |
| --------- | ----------------------------------------------------------- |
| 50+       | Celebrate. Ask promoters for app store reviews.             |
| 30–49     | Healthy. Analyze passive feedback for quick wins.           |
| 10–29     | Concerning. Prioritize top detractor themes in next sprint. |
| < 10      | Critical. Emergency product review. All hands on feedback.  |

### 4.5 Qualitative Feedback Analysis

- Categorize open-ended responses into themes (monthly)
- Top 5 themes tracked over time for trend analysis
- Common theme categories: performance, features, pricing, privacy, UX
- Feed top themes into sprint planning as P1/P2 issues

---

## 5. Success Criteria & Alert Thresholds

### 5.1 Executive Dashboard Metrics

| Metric             | Green (Healthy) | Yellow (Warning) | Red (Critical) |
| ------------------ | --------------- | ---------------- | -------------- |
| Weekly new users   | > 500           | 200–500          | < 200          |
| Activation rate    | > 40%           | 25–40%           | < 25%          |
| D30 retention      | > 15%           | 8–15%            | < 8%           |
| DAU/MAU ratio      | > 20%           | 12–20%           | < 12%          |
| Premium conversion | > 5%            | 2–5%             | < 2%           |
| MRR growth         | > 10% MoM       | 0–10% MoM        | Negative       |
| Churn rate         | < 5%            | 5–8%             | > 8%           |
| NPS                | > 40            | 20–40            | < 20           |
| Crash-free rate    | > 99.5%         | 99–99.5%         | < 99%          |
| App store rating   | > 4.5           | 4.0–4.5          | < 4.0          |

### 5.2 Alert Configuration

| Alert               | Trigger                            | Channel       | Response Time |
| ------------------- | ---------------------------------- | ------------- | ------------- |
| DAU drop            | > 20% drop WoW                     | Slack + email | 4 hours       |
| Retention drop      | D7 retention < 15% for 7 days      | Email         | 24 hours      |
| Revenue decline     | MRR drops > 10% MoM                | Slack + email | 4 hours       |
| Crash spike         | Crash-free rate < 99% for 24 hours | PagerDuty     | 1 hour        |
| NPS collapse        | NPS < 10 in any weekly sample      | Email         | 48 hours      |
| Rating drop         | Store rating < 4.0 (7-day avg)     | Slack         | 24 hours      |
| Conversion collapse | Trial-to-paid < 3% for 14 days     | Email         | 48 hours      |
| Platform anomaly    | Any platform metric diverges 30%+  | Slack         | 24 hours      |

### 5.3 Weekly Metrics Review Cadence

| Day       | Activity                                            |
| --------- | --------------------------------------------------- |
| Monday    | Review weekend metrics; check for anomalies         |
| Wednesday | Mid-week engagement check; A/B test progress review |
| Friday    | Weekly metrics summary; publish to team             |

### 5.4 Monthly Business Review Metrics

| Section         | Metrics Reviewed                                |
| --------------- | ----------------------------------------------- |
| Growth          | New users, growth rate, channel mix, CAC        |
| Engagement      | DAU/MAU, session metrics, feature adoption      |
| Retention       | D1/D7/D30 curves, cohort analysis, churn trends |
| Revenue         | MRR, ARPU, LTV, conversion funnel, plan mix     |
| Quality         | Crash rate, store rating, NPS, support tickets  |
| Platform health | Per-platform breakdown of all above metrics     |

---

## 6. Platform Parity Monitoring

### 6.1 Platform Health Matrix

| Metric             | iOS Target | Android Target | Web Target | Windows Target |
| ------------------ | ---------- | -------------- | ---------- | -------------- |
| D1 retention       | 45%+       | 40%+           | 35%+       | 40%+           |
| D30 retention      | 20%+       | 16%+           | 12%+       | 18%+           |
| Activation rate    | 45%+       | 40%+           | 35%+       | 40%+           |
| Crash-free rate    | 99.5%+     | 99.5%+         | 99.5%+     | 99.5%+         |
| Session duration   | 3 min+     | 2.5 min+       | 2 min+     | 3 min+         |
| Premium conversion | 6%+        | 5%+            | 4%+        | 5%+            |
| Store rating       | 4.5+       | 4.3+           | N/A        | 4.3+           |

### 6.2 Parity Alerts

If any platform metric diverges more than 30% from the cross-platform average,
an investigation is triggered:

1. Check for platform-specific bugs or crashes
2. Review recent platform-specific releases for regressions
3. Compare feature parity (is a feature missing on one platform?)
4. Analyze user feedback from that platform's store reviews
5. File P1 issue if root cause is a platform bug

---

## 7. Metrics Implementation Checklist

### Phase 1: Launch (Week 1–2)

- [ ] PostHog self-hosted instance deployed
- [ ] Core events instrumented on all 4 platforms
- [ ] Basic dashboard with DAU, MAU, registration, activation
- [ ] Crash reporting via Sentry on all platforms
- [ ] Store review monitoring configured

### Phase 2: Monetization (Week 3–6)

- [ ] RevenueCat integrated for subscription tracking
- [ ] Conversion funnel dashboard (gate hit through conversion)
- [ ] Trial tracking events instrumented
- [ ] Revenue dashboard (MRR, ARPU, LTV)

### Phase 3: Retention (Week 7–10)

- [ ] Cohort retention curves (D1 through D90)
- [ ] NPS survey infrastructure deployed
- [ ] Retention alerts configured
- [ ] Weekly metrics report automated

### Phase 4: Optimization (Week 11+)

- [ ] A/B testing framework operational
- [ ] Feature adoption tracking per feature
- [ ] Channel quality analysis dashboard
- [ ] Platform parity monitoring alerts

---

## Acceptance Criteria Summary

- [x] Complete metrics taxonomy with definitions (engagement, retention, revenue, acquisition)
- [x] Per-platform tracking plan with data sources for iOS, Android, Web, Windows
- [x] Retention curve targets (D1, D7, D30, D90, D365) for all users and premium
- [x] Conversion metrics per funnel stage with targets
- [x] NPS survey design with delivery rules and measurement cadence
- [x] Success criteria thresholds per metric (green/yellow/red)
- [x] Alert configuration for metric anomalies with response times
- [x] Privacy-compliant tracking architecture (self-hosted, anonymous, opt-out)
- [x] Platform parity monitoring framework with divergence alerts
- [x] Implementation checklist with phased rollout
