# Feature Usage Analytics & Roadmap Insights

> **Issue:** #826
> **Sprint:** 8 — "Expand"
> **Priority:** P1 — High
> **Created:** 2025-07-27
> **Owner:** Business Analyst
> **Status:** Draft — Framework ready, requires 30+ days of post-launch data
> **Depends on:** #819 (Cohort Analysis), #822 (Conversion Tracking)

---

## Executive Summary

This document defines the comprehensive feature usage analytics framework for the Finance app. It measures adoption rates, engagement depth, feature-retention correlations, Premium demand signals, and identifies underperforming features. The analysis culminates in data-driven roadmap recommendations that directly inform product priorities for Sprints 9-10 and beyond.

**Goal:** Every product decision is backed by quantified user behavior data. No feature investment without evidence of demand or strategic necessity.

---

## 1. Feature Inventory & Classification

### 1.1 Complete Feature Map

| Feature                        | Category       | Tier             | Launched  | Tracking Status |
| ------------------------------ | -------------- | ---------------- | --------- | --------------- |
| **Account creation**           | Core           | Free (1 account) | v1.0      | ✅ Tracked      |
| **Transaction logging**        | Core           | Free             | v1.0      | ✅ Tracked      |
| **Transaction categorization** | Core           | Free             | v1.0      | ✅ Tracked      |
| **Budget creation**            | Core           | Free (3 budgets) | v1.0      | ✅ Tracked      |
| **Budget tracking**            | Core           | Free             | v1.0      | ✅ Tracked      |
| **Category management**        | Core           | Free (defaults)  | v1.0      | ✅ Tracked      |
| **Multiple accounts**          | Premium        | Premium          | Sprint 7  | 🟡 Pending      |
| **Goal creation**              | Premium        | Premium          | Sprint 7  | 🟡 Pending      |
| **Goal tracking**              | Premium        | Premium          | Sprint 7  | 🟡 Pending      |
| **Advanced analytics**         | Premium        | Premium          | Sprint 7  | 🟡 Pending      |
| **Data export**                | Premium        | Premium          | Sprint 7  | 🟡 Pending      |
| **Household sharing**          | Premium        | Premium          | Sprint 10 | ❌ Not shipped  |
| **Recurring transactions**     | Productivity   | Free             | v1.0      | ✅ Tracked      |
| **Insights/reports**           | Engagement     | Free (basic)     | v1.0      | ✅ Tracked      |
| **Quick entry**                | Productivity   | Free             | Sprint 8  | 🟡 Pending      |
| **AI categorization**          | AI             | TBD              | Sprint 9  | ❌ Not shipped  |
| **NLP input**                  | AI             | TBD              | Sprint 9  | ❌ Not shipped  |
| **Sync across devices**        | Infrastructure | Free             | v1.0      | ✅ Tracked      |
| **Biometric auth**             | Security       | Free             | v1.0      | ✅ Tracked      |
| **Data import**                | Onboarding     | Free             | v1.0      | ✅ Tracked      |

### 1.2 Feature Classification Framework

```
              HIGH ADOPTION
                    │
     ┌──────────────┼──────────────┐
     │   "TABLE     │    "POWER    │
     │   STAKES"    │    FEATURES" │
     │              │              │
     │  Must have   │  Drives      │
     │  Keep free   │  retention   │
     │  Optimize UX │  May gate    │
LOW ─┼──────────────┼──────────────┤─ HIGH
DEPTH│              │              │  DEPTH
     │  "DISCOVER-  │  "PREMIUM    │
     │  ABILITY     │  GEMS"       │
     │  ISSUES"     │              │
     │              │  Low adoption│
     │  Low use =   │  but deep    │
     │  hidden or   │  engagement  │
     │  unnecessary │  → Premium   │
     └──────────────┼──────────────┘
                    │
              LOW ADOPTION
```

---

## 2. Feature Adoption Metrics

### 2.1 Adoption Rate Framework

```
Feature Adoption Rate = (MAU who used feature ≥1 time in 28 days) / MAU × 100

Adoption Depth Levels:
  Level 1 — Viewed: User navigated to the feature screen
  Level 2 — Tried: User performed the primary action once
  Level 3 — Used: User performed the primary action 3+ times
  Level 4 — Habitual: User performs the action weekly
  Level 5 — Power: User has customized/advanced usage patterns
```

### 2.2 Adoption Rate Targets & Benchmarks

| Feature                      | Expected Adoption (L2+) | Healthy Target | Concern Threshold | Notes                                  |
| ---------------------------- | ----------------------- | -------------- | ----------------- | -------------------------------------- |
| Transaction logging          | ≥85%                    | ≥90%           | <75%              | Core action; low adoption = UX failure |
| Account creation             | ≥80%                    | ≥85%           | <70%              | Gateway feature; required for value    |
| Budget creation              | ≥30%                    | ≥40%           | <20%              | Secondary feature; drives retention    |
| Insights/reports             | ≥25%                    | ≥35%           | <15%              | Value demonstration feature            |
| Recurring transactions       | ≥15%                    | ≥25%           | <10%              | Productivity feature                   |
| Category customization       | ≥10%                    | ≥20%           | <5%               | Power user feature                     |
| Data import                  | ≥8%                     | ≥15%           | <3%               | Onboarding feature                     |
| Data export (Premium)        | ≥15% of Premium         | ≥25%           | <5%               | Premium value demonstration            |
| Goals (Premium)              | ≥20% of Premium         | ≥35%           | <10%              | Premium value demonstration            |
| Advanced analytics (Premium) | ≥25% of Premium         | ≥40%           | <10%              | Premium value demonstration            |
| Sync                         | ≥40%                    | ≥50%           | <25%              | Multi-device users                     |
| Biometric auth               | ≥60%                    | ≥70%           | <40%              | Security feature; convenience          |

### 2.3 Feature Adoption Measurement Template

**Populate with actual data (30+ days post-launch):**

| Feature             | L1 (Viewed) | L2 (Tried) | L3 (Used 3+) | L4 (Weekly) | L5 (Power) | Median Time to Discover |
| ------------------- | ----------- | ---------- | ------------ | ----------- | ---------- | ----------------------- |
| Transaction logging | —%          | —%         | —%           | —%          | —%         | < — min                 |
| Account creation    | —%          | —%         | N/A          | N/A         | N/A        | < — min                 |
| Budget creation     | —%          | —%         | —%           | —%          | —%         | < — hrs                 |
| Insights/reports    | —%          | —%         | —%           | —%          | —%         | < — days                |
| Recurring txns      | —%          | —%         | —%           | —%          | —%         | < — days                |
| Categories          | —%          | —%         | —%           | —%          | —%         | < — days                |
| Data import         | —%          | —%         | N/A          | N/A         | N/A        | < — hrs                 |
| Sync                | —%          | —%         | N/A          | N/A         | N/A        | < — hrs                 |

---

## 3. Feature-Retention Correlation

### 3.1 Methodology

```
For each feature F:
  1. Split users into two groups:
     Group A: Users who used feature F in their first 7 days
     Group B: Users who did NOT use feature F in their first 7 days

  2. Compare D30 retention:
     D30_retention(Group A) vs D30_retention(Group B)

  3. Calculate retention lift:
     Lift = D30_retention(A) / D30_retention(B) - 1

  4. Statistical test:
     Chi-squared test for proportions
     Report: lift, 95% CI, p-value, sample sizes

  5. CAVEAT: Correlation ≠ causation
     Engaged users both use features AND retain better.
     Feature usage may be a SIGNAL of engagement, not a CAUSE.
     To establish causation: A/B test feature availability.
```

### 3.2 Feature-Retention Correlation Template

| Feature Used (Week 1)  | D7 Ret (Used) | D7 Ret (Not Used) | Lift | D30 Ret (Used) | D30 Ret (Not Used) | Lift | p-value | n (Used) | n (Not) |
| ---------------------- | ------------- | ----------------- | ---- | -------------- | ------------------ | ---- | ------- | -------- | ------- |
| Budget created         | —             | —                 | —    | —              | —                  | —    | —       | —        | —       |
| 3+ transactions logged | —             | —                 | —    | —              | —                  | —    | —       | —        | —       |
| Recurring txn set up   | —             | —                 | —    | —              | —                  | —    | —       | —        | —       |
| Insights viewed        | —             | —                 | —    | —              | —                  | —    | —       | —        | —       |
| Categories customized  | —             | —                 | —    | —              | —                  | —    | —       | —        | —       |
| Sync enabled           | —             | —                 | —    | —              | —                  | —    | —       | —        | —       |
| Multi-platform used    | —             | —                 | —    | —              | —                  | —    | —       | —        | —       |
| Data imported          | —             | —                 | —    | —              | —                  | —    | —       | —        | —       |

### 3.3 "Aha Moment" Identification

```
The "aha moment" is the specific action most strongly correlated with long-term retention.

Hypothesis: The aha moment for Finance is when a user sees their first spending insight
            (requires 5-10 transactions + 1 budget).

Analysis:
  1. Identify the single action with highest D30 retention lift
  2. Determine the minimum threshold (e.g., "users with 5+ transactions AND 1 budget")
  3. Calculate time-to-aha for different user segments
  4. Product implication: Accelerate users to this moment

Industry examples:
  - Facebook: "7 friends in 10 days"
  - Slack: "2,000 messages"
  - Dropbox: "1 file in 1 folder on 1 device"

Finance hypothesis: "[1 budget] + [5 transactions] + [view insights] = aha moment"
```

---

## 4. Premium Feature Demand Signals

### 4.1 Gate Hit Analysis

Every time a free user encounters a Premium feature gate, it's a demand signal:

| Premium Feature    | Gate Hits / Free MAU / Month | % Who Tap "Learn More" | % Who Start Trial | Conversion Lift |
| ------------------ | ---------------------------- | ---------------------- | ----------------- | --------------- |
| Multiple accounts  | —                            | —                      | —                 | —               |
| Goals              | —                            | —                      | —                 | —               |
| Advanced analytics | —                            | —                      | —                 | —               |
| Data export        | —                            | —                      | —                 | —               |
| Custom categories  | —                            | —                      | —                 | —               |
| Premium themes     | —                            | —                      | —                 | —               |

### 4.2 Premium Feature Value Ranking

```
Feature Value Score = (Gate Hits × 0.3) + (Learn More Rate × 0.3) + (Trial Conversion Lift × 0.4)

Ranking determines:
1. Which features to highlight on the paywall
2. Which features justify their Premium gate
3. Which features might be moved to Free (if gate hits are high but conversion is low → frustrating users)
4. Which features might be removed/replaced (if gate hits are near zero → nobody cares)
```

### 4.3 Premium Feature Trial Usage

| Premium Feature    | % Trial Users Who Try | % Who Use 3+ Times | Correlation with Conversion | Recommendation                |
| ------------------ | --------------------- | ------------------ | --------------------------- | ----------------------------- |
| Multiple accounts  | —                     | —                  | —                           | Keep/Move/Remove from Premium |
| Goals              | —                     | —                  | —                           | Keep/Move/Remove from Premium |
| Advanced analytics | —                     | —                  | —                           | Keep/Move/Remove from Premium |
| Data export        | —                     | —                  | —                           | Keep/Move/Remove from Premium |
| Custom categories  | —                     | —                  | —                           | Keep/Move/Remove from Premium |

---

## 5. Underperforming Feature Analysis

### 5.1 Identification Criteria

A feature is "underperforming" if:

- **Adoption < 10% of MAU** after 30 days (for a free feature)
- **Adoption < 5% of subscribers** after 30 days (for a Premium feature)
- **Usage depth is shallow** (high L1/L2 but very low L3/L4)
- **Discovery time > 14 days** (feature is hidden or unclear)

### 5.2 Root Cause Framework

```
For each underperforming feature, diagnose:

1. DISCOVERABILITY: Can users find it?
   - Is it buried in navigation?
   - Is there a clear entry point?
   - Test: Add a tooltip/prompt → does adoption increase?

2. CLARITY: Do users understand it?
   - Is the feature's purpose obvious?
   - Is there onboarding/education for the feature?
   - Test: Add a brief explanation → does try rate increase?

3. VALUE: Is it useful?
   - Does the feature solve a real user need?
   - Is the implementation good enough?
   - Evidence: Check if users who try it continue using it (L2 → L4 rate)

4. TIMING: Is it offered at the right moment?
   - Are users ready for this feature at this point in their journey?
   - Should it be introduced later (after activation)?

Decision Matrix:
  Low discovery + High value once found → Improve discoverability (quick win)
  Low discovery + Low value → Consider deprecation (save maintenance cost)
  High discovery + Low depth → Improve the feature (medium investment)
  High discovery + Low return rate → Feature isn't delivering on its promise (redesign)
```

### 5.3 Underperforming Feature Action Plan Template

| Feature | Issue         | Root Cause      | Recommended Action    | Effort | Expected Impact     |
| ------- | ------------- | --------------- | --------------------- | ------ | ------------------- |
| —       | Low adoption  | Discoverability | Add contextual prompt | S      | +X% adoption        |
| —       | Shallow depth | Value unclear   | Redesign onboarding   | M      | +X% depth           |
| —       | Low adoption  | Not needed      | Deprecation candidate | —      | Reduced maintenance |

---

## 6. Feature Engagement Depth

### 6.1 Session-Feature Correlation

```
Analysis: How does feature usage correlate with session characteristics?

For each feature:
  - Average session length when feature is used vs. not used
  - Session frequency correlation (do feature users open app more often?)
  - Multi-feature usage (do users who use Feature A also tend to use Feature B?)

Feature Combination Matrix:
         Accounts  Txns  Budgets  Goals  Insights  Export
Accounts    —       —      —       —       —        —
Txns        —       —      —       —       —        —
Budgets     —       —      —       —       —        —
Goals       —       —      —       —       —        —
Insights    —       —      —       —       —        —
Export      —       —      —       —       —        —

Value: % of users who use both features (vs expected if independent)
Correlation > expected → Features are complementary
Correlation < expected → Features serve different user segments
```

### 6.2 Feature Journey Mapping

```
Typical Feature Adoption Sequence (Hypothesis):

Week 1:  Account → Transactions → (pause)
Week 2:  Transactions → Budget → Insights
Week 3:  Budget tracking → Recurring transactions → Categories
Week 4+: Advanced analytics → Goals → Export → Sharing

Validate with actual data:
  - What's the most common feature adoption ORDER?
  - Where do users "plateau" (stop discovering new features)?
  - How do we push users past the plateau?
```

---

## 7. Roadmap Recommendations Framework

### 7.1 Feature Investment Prioritization

```
Priority Score =
  (User Demand Signal × 0.30) +     ← Gate hits, requests, reviews
  (Retention Impact × 0.25) +        ← Feature-retention correlation
  (Revenue Impact × 0.25) +          ← Premium conversion lift
  (Strategic Alignment × 0.10) +     ← Competitive necessity, vision fit
  (1 / Implementation Effort × 0.10) ← Engineering complexity

Scale: Each factor 1-10
```

### 7.2 Roadmap Recommendation Template

| Rank | Feature Investment | Demand Signal | Retention Impact | Revenue Impact | Effort | Priority Score | Sprint Target |
| ---- | ------------------ | ------------- | ---------------- | -------------- | ------ | -------------- | ------------- |
| 1    | —                  | —             | —                | —              | —      | —              | —             |
| 2    | —                  | —             | —                | —              | —      | —              | —             |
| 3    | —                  | —             | —                | —              | —      | —              | —             |
| 4    | —                  | —             | —                | —              | —      | —              | —             |
| 5    | —                  | —             | —                | —              | —      | —              | —             |

### 7.3 Preliminary Recommendations (Pre-Data)

Based on industry patterns and competitive analysis:

| #   | Recommendation                          | Rationale                                                                                          | Expected Impact                                       |
| --- | --------------------------------------- | -------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | **Invest in quick-entry mode**          | Manual entry is the #1 churn reason in finance apps; reducing friction directly improves retention | High: D30 retention +3-5%, transaction volume +25%    |
| 2   | **Prioritize insights/reports quality** | Insights are the "aha moment" — the reason users keep tracking expenses                            | High: D30 retention +5-8% for users who view insights |
| 3   | **Improve budget visualization**        | Budget tracking is the feature most correlated with retention in competitor apps                   | Medium: Budget adoption +15%, D30 +3%                 |
| 4   | **Add widget support**                  | Widgets drive daily habit without needing to open the app (reduces "forgot about it" churn)        | Medium: D7 retention +3-5%, DAU +10%                  |
| 5   | **Gamification (streaks, badges)**      | Proven to increase session frequency in finance and fitness apps                                   | Medium: Session frequency +15-20%                     |

---

## 8. Segmented Analysis

### 8.1 Feature Usage by User Segment

| Feature      | New Users (<14 days) | Established (14-60 days) | Power Users | Free Users  | Trial Users | Premium Users |
| ------------ | -------------------- | ------------------------ | ----------- | ----------- | ----------- | ------------- |
| Transactions | —                    | —                        | —           | —           | —           | —             |
| Budgets      | —                    | —                        | —           | —           | —           | —             |
| Goals        | N/A                  | N/A                      | —           | N/A (gated) | —           | —             |
| Insights     | —                    | —                        | —           | —           | —           | —             |
| Export       | N/A                  | N/A                      | —           | N/A (gated) | —           | —             |
| Recurring    | —                    | —                        | —           | —           | —           | —             |

### 8.2 Key Segmentation Questions

1. Do **new users** discover features at the pace we expect?
2. Do **established users** find ongoing value, or do they plateau?
3. Do **trial users** explore Premium features broadly or focus on 1-2?
4. Do **Premium users** use features that justify their subscription?
5. Are there features that **only power users** find, suggesting discoverability issues?

---

## 9. Success Criteria

- [ ] Every shipped feature has adoption data (L1-L5 where applicable)
- [ ] Feature-retention correlations quantified for top 8 features with confidence levels
- [ ] "Aha moment" hypothesis defined and measured
- [ ] Premium demand signals documented (gate hits, learn-more rate, trial conversion lift per feature)
- [ ] Underperforming features identified with root cause analysis and action plan
- [ ] Feature combination/journey analysis completed
- [ ] Top 5 roadmap recommendations with priority scores and expected impact
- [ ] Analysis segmented by user cohort (new vs. established, free vs. trial vs. premium)
- [ ] Each insight tied to a specific product decision or action
- [ ] Actionable for Product Manager — recommendations are specific, sized, and prioritized

---

_This analysis is designed to be repeated quarterly. The framework is reusable — only the data tables need to be updated with fresh metrics. Feature analytics should become a routine input to sprint planning and roadmap decisions._
