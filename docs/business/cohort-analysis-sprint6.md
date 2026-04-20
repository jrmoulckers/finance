# User Behavior Cohort Analysis

> **Issue:** #819
> **Sprint:** 6 — "Measure & Learn"
> **Priority:** P1 — High
> **Created:** 2025-07-27
> **Owner:** Business Analyst
> **Status:** Draft — Pending sufficient post-launch data (minimum 14 days)
> **Depends on:** #818 (KPI Dashboard & Baseline)

---

## Executive Summary

This document defines the cohort analysis framework for segmenting early Finance app users into behavioral groups, measuring retention curves by cohort, identifying features correlated with long-term engagement, and validating pre-launch user personas. The goal is to transform raw post-launch data into actionable product insights that directly inform Sprint 7+ decisions.

**Key question we're answering:** _What do our best users have in common, and how do we create more of them?_

---

## 1. Cohort Segmentation Framework

### 1.1 Cohort Dimensions

Users are segmented across three independent dimensions:

```
┌────────────────────────────────────────────────────────┐
│              COHORT SEGMENTATION MODEL                  │
├──────────────┬──────────────────┬───────────────────────┤
│  TEMPORAL    │  BEHAVIORAL      │  CONTEXTUAL           │
├──────────────┼──────────────────┼───────────────────────┤
│ Registration │ Activation speed │ Platform (iOS/Android/ │
│ date cohort  │ Feature depth    │   Web/Windows)         │
│ (daily/      │ Session pattern  │ Acquisition channel    │
│  weekly)     │ Engagement level │ Device type            │
│              │                  │ Locale/region          │
└──────────────┴──────────────────┴───────────────────────┘
```

### 1.2 Temporal Cohorts

| Cohort                         | Definition                                    | Purpose                                           |
| ------------------------------ | --------------------------------------------- | ------------------------------------------------- |
| **Daily registration cohort**  | Users who registered on the same calendar day | Retention curve analysis (D1, D7, D30)            |
| **Weekly registration cohort** | Users who registered in the same ISO week     | Smooths daily variance; better for trend analysis |
| **Launch cohort**              | Users who registered in Days 1-7 post-launch  | Isolate launch spike behavior from organic growth |
| **Organic cohort**             | Users who registered in Days 14+ post-launch  | Steady-state behavior baseline                    |

### 1.3 Behavioral Cohorts

These cohorts emerge from user actions, not registration timing:

| Cohort            | Criteria                                                | Expected % | Hypothesis                                                |
| ----------------- | ------------------------------------------------------- | ---------- | --------------------------------------------------------- |
| **Power Users**   | ≥5 sessions/week AND ≥3 features used AND D30 retained  | 5-10%      | Drive word-of-mouth; highest Premium conversion potential |
| **Regular Users** | 2-4 sessions/week AND ≥2 features used AND D14 retained | 15-25%     | Core user base; healthy engagement                        |
| **Casual Users**  | 1-2 sessions/week AND 1-2 features used                 | 20-30%     | At risk of churning; need engagement nudges               |
| **Try-and-Leave** | Registered but <3 sessions total, churned by D7         | 30-40%     | Onboarding or value proposition issue                     |
| **Ghost Users**   | Registered but never completed a meaningful action      | 10-15%     | Registration friction; never reached value                |

**Behavioral Cohort Assignment Algorithm:**

```
IF total_sessions < 3 AND days_since_last_active > 7:
    cohort = "ghost" if no_meaningful_actions else "try_and_leave"
ELIF sessions_per_week < 2 AND features_used <= 2:
    cohort = "casual"
ELIF sessions_per_week >= 2 AND sessions_per_week < 5:
    cohort = "regular"
ELIF sessions_per_week >= 5 AND features_used >= 3:
    cohort = "power_user"
```

### 1.4 Contextual Cohorts

| Dimension              | Segments                                                                        | Analysis Purpose                                    |
| ---------------------- | ------------------------------------------------------------------------------- | --------------------------------------------------- |
| **Platform**           | iOS, Android, Web, Windows                                                      | Platform-specific UX issues and conversion patterns |
| **Acquisition source** | Organic (store search), Content (blog/social), Launch (PH/HN), Referral, Direct | Channel quality assessment                          |
| **Device category**    | Phone, Tablet, Desktop, Laptop                                                  | Screen size impact on feature usage                 |
| **Geography**          | US, UK, Canada, EU, Asia-Pacific, Other                                         | International expansion prioritization              |

---

## 2. Retention Curve Analysis

### 2.1 Retention Curve Methodology

**Retention definition:** A user is "retained" on Day N if they opened the app and performed at least one write action (transaction, budget edit, goal update) on day N after their registration date.

```
Retention Rate (Day N, Cohort C) =
    COUNT(users in C active on Day N) / COUNT(total users in C) × 100
```

### 2.2 Retention Curve Template

| Day | Target | Industry Median | Interpretation                                    |
| --- | ------ | --------------- | ------------------------------------------------- |
| D0  | 100%   | 100%            | Registration day                                  |
| D1  | ≥40%   | 27%             | "Did they come back?" — Measures first impression |
| D3  | ≥30%   | 20%             | "Forming a habit?" — Early habit signal           |
| D7  | ≥25%   | 16%             | "Weekly user?" — Key retention milestone          |
| D14 | ≥18%   | 12%             | "Building routine?" — Trial length checkpoint     |
| D30 | ≥15%   | 10%             | "Monthly user?" — Core retention metric           |
| D60 | ≥10%   | 6%              | "Committed user?" — Long-term signal              |
| D90 | ≥8%    | 4%              | "Power user territory" — Likely permanent user    |

### 2.3 Retention Curve Shapes and Diagnostics

```
                    HEALTHY CURVE
Retention %
100|●
 80|  ●
 60|    ●
 40|      ● ● ●
 30|            ● ● ●
 20|                  ● ● ● ● ● ● ●    ← Flattens = stable core
 10|
  0|___________________________________
   D0  D1  D3  D7  D14 D30 D60 D90

                    CLIFF CURVE (Problem: Onboarding)
Retention %
100|●
 50|  ●                                  ← Massive D1 drop
 20|    ● ●
 10|        ● ● ●
  5|              ● ● ● ● ● ●           ← Flat but too low
  0|___________________________________
   D0  D1  D3  D7  D14 D30 D60 D90

                    SLOW BLEED (Problem: No habit formation)
Retention %
100|●
 80|  ●
 60|    ●
 40|      ●
 25|        ●
 15|          ●
  8|            ●
  3|              ●                      ← Never flattens = no core
  1|                ●
  0|___________________________________
   D0  D1  D3  D7  D14 D30 D60 D90
```

### 2.4 Retention by Cohort Cross-Section

**Template for analysis report:**

| Cohort                      | D1  | D7  | D14 | D30 | Curve Shape | Action |
| --------------------------- | --- | --- | --- | --- | ----------- | ------ |
| iOS users                   | —   | —   | —   | —   | —           | —      |
| Android users               | —   | —   | —   | —   | —           | —      |
| Web users                   | —   | —   | —   | —   | —           | —      |
| Windows users               | —   | —   | —   | —   | —           | —      |
| Launch week cohort          | —   | —   | —   | —   | —           | —      |
| Week 2 organic cohort       | —   | —   | —   | —   | —           | —      |
| Users who created budget D1 | —   | —   | —   | —   | —           | —      |
| Users who only logged txns  | —   | —   | —   | —   | —           | —      |

---

## 3. Activation Analysis

### 3.1 Activation Funnel

The activation funnel measures how new users progress through key milestones:

```
Download → Install → Open → Register → Onboard → First Account → First Txn → First Budget → D2 Return
  100%      95%      90%     60%        48%        42%             35%          18%           25%
  (est)    (est)   (est)    (est)      (est)      (est)           (est)        (est)         (est)
```

**Note:** Estimates above are directional placeholders based on industry data. Replace with actuals from Week 2+ post-launch data.

### 3.2 Activation Events & Time Targets

| Activation Event             | Definition                                          | Target Time (from registration) | Target % |
| ---------------------------- | --------------------------------------------------- | ------------------------------- | -------- |
| **First account created**    | User creates their first financial account          | < 3 minutes                     | ≥70%     |
| **First transaction logged** | User logs their first transaction                   | < 5 minutes                     | ≥55%     |
| **Third transaction logged** | User has logged 3+ transactions (commitment signal) | < 24 hours                      | ≥35%     |
| **First budget created**     | User creates a budget                               | < 48 hours                      | ≥25%     |
| **Day 2 return**             | User opens app on day after registration            | < 48 hours                      | ≥40%     |
| **Activated (composite)**    | 1 account + 3 transactions + D2 return              | < 7 days                        | ≥30%     |

### 3.3 Activation-Retention Correlation Model

**Hypothesis:** Users who complete activation criteria within their first week retain at significantly higher rates.

```
Correlation to test:

D30_Retention(activated_users) vs D30_Retention(non_activated_users)

Expected: Activated users retain 2-4× better at D30

Statistical method:
  - Chi-squared test for proportions (is the difference statistically significant?)
  - Minimum sample: 50 users per group for directional signal; 200 for confidence
  - Report with 95% confidence interval
```

### 3.4 Feature-Activation Correlation Matrix

**Template (populate with actual data):**

| Feature Used in Week 1       | D7 Retention | D30 Retention | Δ vs. Baseline | Statistical Significance |
| ---------------------------- | ------------ | ------------- | -------------- | ------------------------ |
| Created budget               | —            | —             | +X%            | p < 0.05?                |
| Set up recurring transaction | —            | —             | +X%            | p < 0.05?                |
| Created goal                 | —            | —             | +X%            | p < 0.05?                |
| Used insights/reports        | —            | —             | +X%            | p < 0.05?                |
| Customized categories        | —            | —             | +X%            | p < 0.05?                |
| Used on 2+ platforms         | —            | —             | +X%            | p < 0.05?                |
| Imported data                | —            | —             | +X%            | p < 0.05?                |

**Key analysis:** Identify the "aha moment" — the single action most correlated with long-term retention. For many finance apps, this is the moment a user sees their spending pattern for the first time (typically after 5-10 transactions).

---

## 4. Power User Profile

### 4.1 Power User Identification Criteria

Power users are the top 10% of users by a composite engagement score:

```
Engagement Score =
    (sessions_per_week × 2) +
    (distinct_features_used × 3) +
    (transactions_logged_per_week × 1) +
    (consecutive_active_weeks × 5)

Power User threshold: Top 10% of engagement scores among D14+ retained users
```

### 4.2 Power User Profile Template

**Populate with actual data:**

| Characteristic           | Power Users (Top 10%) | Average Users | Delta |
| ------------------------ | --------------------- | ------------- | ----- |
| Sessions per week        | —                     | —             | —     |
| Avg session duration     | —                     | —             | —     |
| Features used (out of N) | —                     | —             | —     |
| Transactions per week    | —                     | —             | —     |
| Budgets created          | —                     | —             | —     |
| Goals set                | —                     | —             | —     |
| Platforms used           | — (multi-platform?)   | —             | —     |
| Most used feature        | —                     | —             | —     |
| Registration source      | —                     | —             | —     |
| Primary platform         | —                     | —             | —     |
| D30 retention            | —                     | —             | —     |
| Premium conversion       | —                     | —             | —     |

### 4.3 Power User Behavioral Patterns

**Analysis questions:**

1. What do power users do in their **first session** that casual users don't?
2. Do power users discover features **faster** or use features in a different **sequence**?
3. Are power users **multi-platform** users (use app on phone + web)?
4. Do power users have a **specific use case** (budget-focused? goal-focused? tracking-focused)?
5. What is the **earliest signal** that predicts a user will become a power user?

---

## 5. Persona Validation

### 5.1 Pre-Launch Personas

The following personas were defined pre-launch. This analysis validates them against real user behavior:

| Persona                          | Description                                                             | Hypothesized Behavior                                                  | Validation Approach                                                          |
| -------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| **Alex (Budget Beginner)**       | New to budgeting, wants simplicity, uses phone primarily                | Transaction logging + basic budgets, short sessions, mobile-only       | Cluster analysis: users with few features, mobile-only, budget-focused       |
| **Jordan (Financial Optimizer)** | Experienced with finance apps, wants detailed analytics, multi-platform | All features, longer sessions, data export, multi-platform             | Cluster analysis: high feature breadth, multi-platform, report usage         |
| **Casey (Couple/Household)**     | Manages finances with a partner, needs sharing and collaboration        | Household sharing (Premium), dual access patterns, budget coordination | Identify users who use sharing features or have overlapping account patterns |

### 5.2 Cluster Analysis Methodology

**Approach:** k-means clustering on behavioral feature vectors, then map clusters to personas.

```
Feature vector per user:
  [sessions_per_week,
   avg_session_duration,
   features_used_count,
   transactions_per_week,
   budgets_created,
   goals_created,
   reports_viewed,
   platforms_used,
   data_exported (0/1),
   days_since_registration,
   total_active_days]

Clustering:
  - k=3 (validate if 3 clusters emerge naturally, or if 4-5 is better)
  - Evaluate with silhouette score and elbow method
  - Map clusters to personas based on centroid characteristics
```

### 5.3 Persona Validation Report Template

| Dimension         | Alex (Predicted)      | Alex (Actual Cluster) | Match? |
| ----------------- | --------------------- | --------------------- | ------ |
| % of users        | 40-50%                | —                     | —      |
| Primary platform  | Mobile                | —                     | —      |
| Features used     | 2-3                   | —                     | —      |
| Sessions/week     | 2-3                   | —                     | —      |
| Key features      | Transactions, budgets | —                     | —      |
| D30 retention     | 12-15%                | —                     | —      |
| Premium potential | Low (limited needs)   | —                     | —      |

_(Repeat for Jordan and Casey)_

**Outcome:** Confirm, refine, or redefine personas based on actual behavioral clusters.

---

## 6. Platform Behavior Analysis

### 6.1 Platform Comparison Framework

| Metric                 | iOS | Android | Web | Windows | Significance Test |
| ---------------------- | --- | ------- | --- | ------- | ----------------- |
| **User share**         | —   | —       | —   | —       | —                 |
| **D1 retention**       | —   | —       | —   | —       | Chi-squared       |
| **D7 retention**       | —   | —       | —   | —       | Chi-squared       |
| **D30 retention**      | —   | —       | —   | —       | Chi-squared       |
| **Activation rate**    | —   | —       | —   | —       | Chi-squared       |
| **Sessions/week**      | —   | —       | —   | —       | ANOVA             |
| **Session duration**   | —   | —       | —   | —       | ANOVA             |
| **Feature depth**      | —   | —       | —   | —       | ANOVA             |
| **Premium conversion** | —   | —       | —   | —       | Chi-squared       |
| **Top feature**        | —   | —       | —   | —       | Descriptive       |
| **Top churn reason**   | —   | —       | —   | —       | Qualitative       |

### 6.2 Platform-Specific Hypotheses

| Hypothesis                                             | Rationale                                                                | Validation                                                    |
| ------------------------------------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------- |
| iOS users have highest D30 retention                   | Apple ecosystem users tend to be more committed; fewer free alternatives | Compare D30 retention across platforms                        |
| Web users have lowest retention                        | Browser tabs compete for attention; no push notifications                | Compare D7 and D30 retention; web vs. native                  |
| Multi-platform users retain best                       | Using on multiple devices = deeper integration into daily life           | Compare retention of single-platform vs. multi-platform users |
| Android users have highest volume but lower conversion | Larger market but more price-sensitive                                   | Compare volume, retention, and conversion by platform         |
| Windows users are "power users"                        | Desktop use implies deeper analysis; more likely to use export/reports   | Compare feature depth and session duration                    |

---

## 7. Engagement Funnel Analysis

### 7.1 Feature Adoption Funnel

Track the sequence and timing of feature adoption:

```
Registration
    ├─→ Account Creation (est. 70% within 5 min)
    │       ├─→ First Transaction (est. 55% within same session)
    │       │       ├─→ Third Transaction (est. 35% within 24h)
    │       │       │       ├─→ Budget Creation (est. 25% within 48h)
    │       │       │       │       ├─→ Goal Setting (est. 15% within 7 days)
    │       │       │       │       │       ├─→ Reports/Insights (est. 10% within 14 days)
    │       │       │       │       │       │       └─→ Data Export (est. 5% within 30 days)
    │       │       │       │       │       └─→ ❌ Never discovers reports
    │       │       │       │       └─→ ❌ Doesn't see need for goals
    │       │       │       └─→ ❌ Doesn't create budget
    │       │       └─→ ❌ Stops after 1-2 transactions
    │       └─→ ❌ Creates account but never logs transactions
    └─→ ❌ Never creates an account (ghost user)
```

### 7.2 Time-to-Feature Discovery

| Feature           | Median Time from Registration | Target     | Implication if Slow             |
| ----------------- | ----------------------------- | ---------- | ------------------------------- |
| Account creation  | —                             | < 3 min    | Onboarding friction             |
| First transaction | —                             | < 5 min    | Value not immediately clear     |
| Budget creation   | —                             | < 48 hours | Feature discoverability issue   |
| Goal creation     | —                             | < 7 days   | May need prompting              |
| Insights/reports  | —                             | < 14 days  | Feature hidden or unclear       |
| Data export       | —                             | < 30 days  | Niche need; expected to be slow |

---

## 8. Recommendations Framework

### 8.1 Recommendation Priority Matrix

All recommendations from this analysis are prioritized using:

```
Priority Score = (Expected Impact on Retention × 3) + (Expected Impact on Activation × 2) + (1 / Implementation Effort)

Scale: Impact = 1 (low) to 5 (high); Effort = 1 (trivial) to 5 (major)
```

### 8.2 Preliminary Recommendations (Pre-Data)

Based on industry patterns and common finance app issues:

| #   | Recommendation                                       | Expected Impact             | Effort | Rationale                                                  |
| --- | ---------------------------------------------------- | --------------------------- | ------ | ---------------------------------------------------------- |
| 1   | **Add budget creation prompt after 3rd transaction** | High (retention +5-10%)     | Small  | Most retained users create budgets; prompt drives adoption |
| 2   | **Send D1 re-engagement notification**               | Medium (D1 retention +3-5%) | Small  | Industry best practice; requires opt-in push notification  |
| 3   | **Streamline onboarding to <3 steps**                | High (activation +10-15%)   | Medium | Long onboarding = drop-off; measure step completion rates  |
| 4   | **Show "Your Week in Finance" weekly summary**       | Medium (D7 retention +3-5%) | Medium | Creates weekly habit loop; gives reason to return          |
| 5   | **Highlight multi-platform sync on first use**       | Medium (retention +5-8%)    | Small  | Multi-platform users retain 2-3× better                    |
| 6   | **Reduce time-to-first-insight**                     | High (activation +5-10%)    | Medium | Users need to see value of tracking quickly                |

**Note:** These are hypothesis-driven. Actual recommendations will be data-driven once cohort data is available.

---

## 9. Statistical Methodology

### 9.1 Sample Size Requirements

| Analysis Type                         | Minimum Sample per Group | Confidence Level | Notes                   |
| ------------------------------------- | ------------------------ | ---------------- | ----------------------- |
| Retention comparison (2 cohorts)      | 50 users                 | 80%              | Directional signal      |
| Retention comparison (2 cohorts)      | 200 users                | 95%              | Statistically confident |
| Feature correlation                   | 100 users (per feature)  | 90%              | Proportions test        |
| Cluster analysis (persona validation) | 300 total users          | —                | k-means needs density   |
| A/B comparison                        | 385 per variant          | 95% (5% MDE)     | Standard power analysis |

### 9.2 Statistical Tests

| Question                                             | Test                             | When to Use                                           |
| ---------------------------------------------------- | -------------------------------- | ----------------------------------------------------- |
| "Is D7 retention different between iOS and Android?" | Chi-squared test for proportions | Comparing retention rates across groups               |
| "Do power users have significantly more sessions?"   | Welch's t-test or Mann-Whitney U | Comparing means of continuous metrics                 |
| "Which features predict retention?"                  | Logistic regression              | Feature importance for binary outcome (retained Y/N)  |
| "Do users cluster into distinct personas?"           | k-means + silhouette score       | Exploratory segmentation                              |
| "Is the retention difference real or noise?"         | 95% confidence interval          | All comparisons — report CI alongside point estimates |

### 9.3 Caveats and Limitations

1. **Small sample sizes early post-launch** — First 2 weeks may have <200 users per cohort. Report confidence intervals and flag when results are directional, not conclusive.
2. **Launch spike contamination** — Week 1 users may behave differently (tech-savvy early adopters). Analyze launch cohort separately.
3. **Survivorship bias** — Feature-retention correlations may reflect selection bias (engaged users both use features AND retain; features may not _cause_ retention).
4. **Privacy limitations** — We cannot track individual user journeys in detail. All analysis uses aggregate patterns.
5. **Platform distribution** — If one platform has very few users (<30), platform-specific analysis may be unreliable for that platform.

---

## 10. Success Criteria

- [ ] Minimum 3 distinct behavioral cohorts identified and characterized with quantified differences
- [ ] Retention curves generated for at least 2 temporal cohorts with D1, D7, D14 data points
- [ ] Feature-activation correlations quantified for top 5 features (e.g., "users who create a budget retain 2.3× better at D7")
- [ ] Power user profile documented with at least 5 distinguishing characteristics
- [ ] Persona validation completed: each pre-launch persona confirmed, refined, or replaced
- [ ] Platform behavior differences documented with statistical significance noted
- [ ] Top 3 actionable recommendations delivered with expected impact and effort estimates
- [ ] All analysis uses aggregate/anonymized data — zero individual user identification
- [ ] Confidence levels and sample size caveats clearly stated throughout

---

_This analysis framework will be applied to real data as soon as 14+ days of post-launch data are available. Results will be published as an addendum to this document and will directly inform Sprint 7 Premium launch decisions._
