# Early Churn Analysis & Retention Risk Report

> **Issue:** #821
> **Sprint:** 6 — "Measure & Learn"
> **Priority:** P1 — High
> **Created:** 2025-07-27
> **Owner:** Business Analyst
> **Status:** Draft — Framework ready, pending post-launch data
> **Depends on:** #818 (KPI Dashboard), #819 (Cohort Analysis)

---

## Executive Summary

This document provides a comprehensive early churn analysis framework for the Finance app's first 30 days post-launch. It defines churn prediction models, identifies risk signals visible in early user behavior, catalogs common friction points, and delivers a prioritized retention intervention roadmap. The goal is to identify and address the biggest retention risks _before_ Premium launches in Sprint 7, ensuring that paying users aren't immediately lost to preventable friction.

**Critical insight:** In consumer finance apps, 60-70% of total lifetime churn occurs in the first 7 days. Fixing early retention is the single highest-ROI investment we can make.

---

## 1. Churn Definition & Taxonomy

### 1.1 Churn Definitions

| Churn Type             | Definition                                         | Detection Window   | Reversible?                            |
| ---------------------- | -------------------------------------------------- | ------------------ | -------------------------------------- |
| **Day-1 churn**        | Registered but never returned after first session  | Day 2 check        | Partially (re-engagement notification) |
| **Week-1 churn**       | Active in Day 1-3 but no activity in Days 4-7      | Day 8 check        | Yes (re-engagement campaign)           |
| **Month-1 churn**      | Active in Week 1-2 but no activity in Days 15-30   | Day 31 check       | Possible (win-back)                    |
| **Subscription churn** | Paying subscriber cancels subscription             | Cancellation event | Yes (win-back offer)                   |
| **Ghost churn**        | Registered but NEVER performed a meaningful action | Day 3 check        | Low probability                        |

### 1.2 Churn State Machine

```
                    ┌──────────────┐
                    │  REGISTERED  │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              ▼            ▼            ▼
        ┌──────────┐ ┌──────────┐ ┌──────────┐
        │  GHOST   │ │ ACTIVATED│ │  TRIED   │
        │(no action│ │ (hit     │ │ (1-2     │
        │  taken)  │ │  criteria│ │  actions) │
        └──────────┘ │  in 7d)  │ └─────┬────┘
              │      └────┬─────┘       │
              │           │             │
              ▼      ┌────┴────┐        ▼
        ┌──────────┐ │         │  ┌──────────┐
        │  CHURNED │ ▼         ▼  │  CHURNED │
        │  (ghost) │┌────┐ ┌────┐│  (tried)  │
        └──────────┘│ENG.│ │AT  │└──────────┘
                    │    │ │RISK│
                    └──┬─┘ └──┬─┘
                       │      │
                  ┌────┴──┐ ┌─┴───────┐
                  │RETAINED│ │ CHURNED │
                  │(active)│ │(lapsed) │
                  └───────┘ └─────────┘
```

---

## 2. Drop-Off Funnel Analysis

### 2.1 Full User Journey Funnel

```
Stage                          Est. Rate    Cumulative    Key Question
─────────────────────────────────────────────────────────────────────
1. App Downloaded              100%         100%          "Did they find us?"
   │
2. App Opened (first launch)   95%          95%           "Did it install/load OK?"
   │                           ↓5% lost: install failures, regret
3. Registration Completed      65%          62%           "Did they commit?"
   │                           ↓35% lost: email friction, privacy concerns
4. Onboarding Completed        80%          49%           "Did they get through?"
   │                           ↓20% lost: too long, unclear value
5. First Account Created       85%          42%           "Did they start?"
   │                           ↓15% lost: unclear what to do next
6. First Transaction Logged    80%          34%           "Did they see value?"
   │                           ↓20% lost: manual entry friction
7. Day 2 Return                60%          20%           "Did they form intent?"
   │                           ↓40% lost: forgot, no trigger, low value
8. Day 7 Return                55%          11%           "Is it a habit?"
   │                           ↓45% lost: novelty wore off, no habit loop
9. Day 30 Return               60%          7%            "Are they committed?"
   │                           ↓40% lost: found alternative, life change
10. Premium Conversion         10%          0.7%          "Will they pay?"
```

**Note:** Rates above are industry-informed estimates. Replace with actuals from post-launch data. The cumulative column shows that only ~7% of downloaders may reach Day 30, making each funnel stage critical.

### 2.2 Drop-Off Severity Analysis

| Drop-Off Point              | Estimated Loss | Severity  | Root Cause Hypothesis                                 | Investigation Method                         |
| --------------------------- | -------------- | --------- | ----------------------------------------------------- | -------------------------------------------- |
| Download → Open             | 5%             | 🟡 Low    | App size, install failures                            | Store analytics, crash reports               |
| Open → Register             | 35%            | 🔴 High   | Privacy concerns, email requirement, perceived effort | Funnel analytics, A/B test registration flow |
| Register → Onboard Complete | 20%            | 🟠 Medium | Onboarding too long/complex                           | Step completion rates, time per step         |
| Onboard → First Account     | 15%            | 🟠 Medium | Unclear next step, choice paralysis                   | Session recordings (aggregate heatmaps)      |
| Account → First Transaction | 20%            | 🟠 Medium | Manual entry friction, unclear value                  | Feature timing analytics                     |
| Transaction → D2 Return     | 40%            | 🔴 High   | No re-engagement trigger, low perceived value         | D1 notification A/B test                     |
| D2 → D7 Return              | 45%            | 🔴 High   | No habit formed, novelty wore off                     | Feature-retention correlation                |
| D7 → D30 Return             | 40%            | 🟠 Medium | Found alternative, life change, not enough value      | Churn survey, competitive analysis           |

### 2.3 Highest-Impact Interventions (by Funnel Stage)

| Stage                 | Intervention                                                    | Expected Impact           | Effort |
| --------------------- | --------------------------------------------------------------- | ------------------------- | ------ |
| Open → Register       | Allow anonymous/guest mode (register later)                     | +15-25% registration      | High   |
| Open → Register       | Reduce registration to email-only (no password, use magic link) | +10-15% registration      | Medium |
| Register → Onboard    | Reduce onboarding to 3 screens max                              | +10-15% completion        | Small  |
| Onboard → Account     | Auto-create a "Cash" account during onboarding                  | +20% account creation     | Small  |
| Account → Transaction | Pre-populate with sample transactions to show value             | +10-15% first transaction | Medium |
| Transaction → D2      | Send "Great start! Log today's spending" push notification      | +5-10% D2 return          | Small  |
| D2 → D7               | "Your Week in Finance" email/notification summary               | +5-8% D7 return           | Medium |
| D7 → D30              | Monthly spending insight email                                  | +3-5% D30 return          | Medium |

---

## 3. Churn Timing Analysis

### 3.1 When Do Users Churn?

Industry data for finance apps shows a clear churn distribution:

```
Churn Probability by Day (Finance App Industry Average)

Day 1:   ████████████████████████████████████  35%
Day 2:   ████████████████████                  20%
Day 3:   █████████████                         13%
Day 4-7: ████████████                          12%
Day 8-14:████████                               8%
Day 15-21:███                                   4%
Day 22-30:███                                   4%
Day 31+:  ██                                    4%
         ─────────────────────────────────────────
         0%    10%    20%    30%    40%

KEY INSIGHT: 67% of all churn happens in the first 3 days.
```

### 3.2 Critical Churn Windows

| Window              | Days  | % of Total Churn | Intervention Window  | Strategy                                          |
| ------------------- | ----- | ---------------- | -------------------- | ------------------------------------------------- |
| **"First Hour"**    | 0-1   | 35%              | During first session | Great onboarding, fast time-to-value              |
| **"Morning After"** | 1-3   | 33%              | Hours 24-72          | Push notification, email re-engagement            |
| **"First Week"**    | 3-7   | 12%              | Days 3-7             | Weekly summary, feature discovery prompts         |
| **"Trial Window"**  | 7-14  | 8%               | Days 7-14            | Premium trial messaging, habit reinforcement      |
| **"Monthly Test"**  | 14-30 | 8%               | Days 14-30           | Monthly insight, value demonstration              |
| **"Steady State"**  | 30+   | 4%               | Ongoing              | Regular value delivery, new feature announcements |

---

## 4. Churn Signal Detection Model

### 4.1 Early Warning Signals

These behavioral signals predict churn before it happens:

| Signal                          | Detection Method                     | Lead Time       | Churn Probability Increase | Action                                           |
| ------------------------------- | ------------------------------------ | --------------- | -------------------------- | ------------------------------------------------ |
| **No action in first session**  | Session event without write events   | Immediate       | +60% churn by D7           | Trigger guided first-action flow                 |
| **Onboarding abandoned**        | Onboarding started but not completed | Immediate       | +40% churn by D3           | Re-engagement email within 4 hours               |
| **Session < 30 seconds**        | Session duration tracking            | Day 1           | +50% churn by D7           | Investigate: app crash? UX confusion?            |
| **No D2 return**                | Absence of Day 2 session             | Day 2           | +35% churn by D14          | Push notification: "Continue where you left off" |
| **Declining session frequency** | 3+ sessions → 1 session → 0          | Trailing 7 days | +45% churn next 14 days    | "We miss you" engagement nudge                   |
| **Single feature usage**        | Only uses 1 feature after 7+ days    | Day 7+          | +30% churn by D30          | Feature discovery prompt                         |
| **Zero budgets after 10 txns**  | Transaction count without budget     | Varies          | +25% churn by D30          | "Ready to set a budget?" prompt                  |
| **App opened but no action**    | "Passive sessions" increasing        | Trailing 7 days | +35% churn next 14 days    | Simplify primary action (quick entry)            |

### 4.2 Churn Risk Scoring Model

```
Churn Risk Score = Weighted sum of risk factors (0-100 scale)

Factors and weights:
  - Days since last active:           25% weight
    (0 days = 0 risk; 3 days = 50 risk; 7+ days = 100 risk)

  - Session trend (7-day):            20% weight
    (increasing = 0; flat = 30; declining = 70; zero = 100)

  - Feature breadth:                  15% weight
    (3+ features = 0; 2 features = 30; 1 feature = 60; 0 features = 100)

  - Activation status:                15% weight
    (fully activated = 0; partially = 50; not activated = 100)

  - Session duration trend:           10% weight
    (stable/increasing = 0; declining = 50; <30s avg = 100)

  - Onboarding completion:            10% weight
    (completed = 0; skipped = 60; abandoned = 100)

  - Platform engagement:              5% weight
    (multi-platform = 0; mobile-only = 20; web-only = 50; desktop-only = 40)

Risk Tiers:
  Score 0-20:   🟢 Healthy — No action needed
  Score 21-40:  🟡 Watch — Monitor, prepare re-engagement
  Score 41-60:  🟠 At Risk — Trigger re-engagement within 48h
  Score 61-80:  🔴 High Risk — Immediate re-engagement
  Score 81-100: ⚫ Likely Churned — Win-back campaign
```

### 4.3 Churn Risk Calculation (Privacy-Compliant)

**Important:** This model runs on **aggregate cohort data**, not individual user tracking.

```
Implementation approach:
1. Calculate risk factors at cohort level (e.g., "users who registered this week")
2. Identify at-risk COHORTS, not at-risk INDIVIDUALS
3. Apply interventions to cohort (e.g., "all D3 users who haven't returned get a notification")
4. Never surface individual user risk scores in any dashboard
5. No personal targeting — only pattern-based, consent-gated interventions
```

---

## 5. Competitive Retention Benchmarking

### 5.1 Finance App Retention Benchmarks

| Metric                      | Industry Bottom | Industry Median | Industry Top | Our Target | Source                         |
| --------------------------- | --------------- | --------------- | ------------ | ---------- | ------------------------------ |
| D1 Retention                | 18%             | 27%             | 38%          | 40%        | Adjust 2024 Global App Trends  |
| D7 Retention                | 8%              | 16%             | 24%          | 25%        | Adjust 2024 Global App Trends  |
| D14 Retention               | 5%              | 11%             | 18%          | 18%        | AppsFlyer Benchmarks 2024      |
| D30 Retention               | 3%              | 9%              | 16%          | 15%        | Adjust 2024 Global App Trends  |
| D90 Retention               | 1%              | 4%              | 9%           | 8%         | Liftoff Mobile App Trends 2024 |
| Monthly Churn (subscribers) | 12%             | 7%              | 3%           | <5%        | Recurly Benchmarks 2024        |

### 5.2 Competitor Retention Strategies (Observed)

| Competitor        | Retention Strategy                                                                                         | Applicable to Finance App?                                                                    |
| ----------------- | ---------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **YNAB**          | Strong community (subreddit, workshops), methodology-driven ("give every dollar a job"), education content | ✅ Community building, methodology framing — NOT workshops (too resource-intensive initially) |
| **Monarch**       | AI-powered insights that surprise users ("You spent 30% more on dining"), weekly email digests             | ✅ Automated insights; weekly summary; AI-driven value — aligns with Sprint 9 AI features     |
| **Copilot**       | Beautiful design that makes checking finances feel good, rapid feature iteration                           | ✅ Design already a strength; maintain iteration velocity                                     |
| **Mint (legacy)** | Push notifications on bill reminders, credit score monitoring, gamification                                | 🟡 Bill reminders yes; credit score no (third-party data); gamification planned (#242)        |

### 5.3 Retention Advantages (Our Differentiation)

| Advantage          | Retention Impact                                                                                  | How to Leverage                                                |
| ------------------ | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| **Offline-first**  | Users can log transactions anywhere, anytime — removes "I'll do it later" friction                | Emphasize in onboarding: "Works without internet"              |
| **Multi-platform** | Users who use 2+ platforms retain 2-3× better (industry data)                                     | Cross-platform sync prompt during onboarding                   |
| **No ads**         | Zero interruptions → longer sessions → deeper engagement                                          | Highlight in retention messaging: "No ads, ever"               |
| **Privacy**        | Trust → less hesitancy to log sensitive financial data → richer data → more insights → more value | Privacy assurance during onboarding reduces data entry anxiety |
| **Open source**    | Transparency → trust → lower churn (users trust their data is safe)                               | Badge in app: "Open source. Your data, your control."          |

---

## 6. Friction Point Catalog

### 6.1 Identified Friction Points (Pre-Data Hypotheses)

Based on the app architecture, onboarding flow, and common finance app issues:

| #   | Friction Point                             | Funnel Stage    | Severity   | Users Affected (est.)     | Evidence Source                                  |
| --- | ------------------------------------------ | --------------- | ---------- | ------------------------- | ------------------------------------------------ |
| F1  | **Email registration requirement**         | Open → Register | 🔴 High    | 20-30% of openers         | Industry: guest mode increases conversion 15-25% |
| F2  | **Manual transaction entry**               | First week      | 🟠 Medium  | 30-40% of new users       | #1 complaint in competitor app reviews           |
| F3  | **No visual payoff until 5+ transactions** | First session   | 🟠 Medium  | 40-50% of new users       | Insights/charts meaningless with 1-2 data points |
| F4  | **Budget setup complexity**                | Days 1-3        | 🟡 Low-Med | 20-30% of users who try   | Category selection can be overwhelming           |
| F5  | **No re-engagement trigger**               | Day 2           | 🔴 High    | 40-50% of D1 users        | Without push notification, no reason to return   |
| F6  | **Sync setup friction**                    | First session   | 🟡 Low-Med | 10-20% multi-device users | Cloud sync requires account; may confuse         |
| F7  | **Category mismatch**                      | Ongoing         | 🟡 Low     | 15-25% of users           | Default categories may not match user's spending |
| F8  | **No "quick win" in first session**        | First 5 min     | 🟠 Medium  | 30-40% of new users       | User doesn't see immediate value from logging    |

### 6.2 Friction Severity Scoring

```
Friction Score = (% of users affected × 3) + (churn probability increase × 2) + (ease of fix × 1)

Scale: Each factor scored 1-5
  - % affected: 1 (<10%), 2 (10-20%), 3 (20-35%), 4 (35-50%), 5 (>50%)
  - Churn increase: 1 (<5%), 2 (5-15%), 3 (15-25%), 4 (25-40%), 5 (>40%)
  - Ease of fix: 5 (trivial), 4 (small), 3 (medium), 2 (large), 1 (very large)
```

| Friction Point         | Affected (1-5) | Churn Impact (1-5) | Ease of Fix (1-5) | Score | Rank    |
| ---------------------- | -------------- | ------------------ | ----------------- | ----- | ------- |
| F1: Email registration | 4              | 4                  | 2                 | 22    | 1       |
| F5: No re-engagement   | 4              | 4                  | 4                 | 24    | **Top** |
| F3: No visual payoff   | 4              | 3                  | 3                 | 21    | 3       |
| F2: Manual entry       | 3              | 3                  | 2                 | 17    | 4       |
| F8: No quick win       | 3              | 3                  | 3                 | 18    | 5       |
| F4: Budget complexity  | 2              | 2                  | 3                 | 13    | 6       |
| F7: Category mismatch  | 2              | 2                  | 4                 | 14    | 7       |
| F6: Sync friction      | 2              | 2                  | 3                 | 13    | 8       |

---

## 7. Retention Improvement Roadmap

### 7.1 Quick Wins (< 1 Sprint to Implement)

| #   | Intervention                                                                        | Expected Impact               | Effort | Sprint Target |
| --- | ----------------------------------------------------------------------------------- | ----------------------------- | ------ | ------------- |
| QW1 | **Push notification on D1: "Log today's spending in 10 seconds"**                   | D2 retention +5-10%           | XS     | Sprint 7      |
| QW2 | **Auto-create "Cash" and "Checking" accounts during onboarding**                    | Account creation +15-20%      | S      | Sprint 7      |
| QW3 | **Add "Add Transaction" FAB (floating action button) to all screens**               | Transaction logging +10%      | S      | Sprint 7      |
| QW4 | **Weekly email digest: "Your week in spending"**                                    | D7 retention +3-5%            | S      | Sprint 7      |
| QW5 | **Reduce onboarding to 3 steps (welcome → create account → log first transaction)** | Onboarding completion +10-15% | S      | Sprint 7      |

### 7.2 Medium-Term Improvements (1-2 Sprints)

| #   | Intervention                                                              | Expected Impact                              | Effort | Sprint Target |
| --- | ------------------------------------------------------------------------- | -------------------------------------------- | ------ | ------------- |
| MT1 | **"Your First Insight" — Show a mini-insight after 3 transactions**       | Activation rate +10-15%, D7 retention +5%    | M      | Sprint 8      |
| MT2 | **Smart budget suggestions based on first week of transactions**          | Budget adoption +15-20%, D14 retention +3-5% | M      | Sprint 8      |
| MT3 | **Guest mode: Use app without registration, prompt to register for sync** | Registration funnel +15-25%                  | L      | Sprint 8      |
| MT4 | **Contextual feature discovery: Prompt goals after first budget created** | Goal adoption +20%, feature depth +1         | M      | Sprint 8      |
| MT5 | **Quick entry mode: Single-tap amount + category transaction logging**    | Transaction frequency +25-30%                | M      | Sprint 8      |
| MT6 | **Monthly spending comparison: "You spent X% more/less than last month"** | D30 retention +3-5%                          | M      | Sprint 8      |

### 7.3 Strategic Investments (3+ Sprints)

| #   | Intervention                                                 | Expected Impact                                       | Effort | Sprint Target  |
| --- | ------------------------------------------------------------ | ----------------------------------------------------- | ------ | -------------- |
| SI1 | **AI-powered categorization (auto-categorize transactions)** | Manual entry friction -50%, retention +5-10%          | XL     | Sprint 9       |
| SI2 | **NLP transaction input ("Coffee $4.50 at Starbucks")**      | Transaction logging friction -60%                     | XL     | Sprint 9       |
| SI3 | **Gamification: Streaks, badges, progress indicators**       | D30 retention +5-10%, session frequency +15%          | L      | Sprint 8-9     |
| SI4 | **Bank connection import (reduce manual entry to zero)**     | Retention +15-25% for connected users                 | XL     | Sprint 10      |
| SI5 | **Household sharing (partner can see shared budgets)**       | Retention +10-15% for couples (mutual accountability) | XL     | Sprint 10      |
| SI6 | **Community features (forums, tips, shared templates)**      | D60 retention +3-5%                                   | L      | Post-Sprint 10 |

### 7.4 Retention Roadmap Impact Projection

```
Intervention Timeline and Cumulative D30 Retention Impact (Projected)

Sprint:     6      7       8       9       10
D30 Ret:   ~13%   ~16%    ~19%    ~22%    ~25%
            │      │       │       │       │
            │      │       │       │       └── +3% (bank connections, household sharing)
            │      │       │       └── +3% (AI categorization, NLP, gamification)
            │      │       └── +3% (insights, smart budgets, guest mode)
            │      └── +3% (notifications, onboarding, quick wins)
            └── Baseline (no interventions)

NOTE: Impacts are NOT additive in reality — diminishing returns apply.
      Conservative estimate: Baseline 13% → 20% by Sprint 10 (vs. 25% ideal)
```

---

## 8. Churn Survey Design

### 8.1 In-App Churn Survey (Triggered on Subscription Cancellation)

```
Question 1: "What's the main reason you're cancelling?"
  ○ It's too expensive
  ○ I don't use it enough
  ○ I'm switching to another app
  ○ Missing a feature I need
  ○ It's too complicated
  ○ Other: [free text]

Question 2 (conditional):
  If "too expensive": "What price would feel fair?" [$2.99, $3.99, $4.99, still wouldn't pay]
  If "switching": "Which app?" [YNAB, Monarch, Copilot, Spreadsheet, Other]
  If "missing feature": "What feature?" [free text]
  If "too complicated": "What was confusing?" [free text]

Question 3: "Would anything change your mind?"
  ○ Lower price
  ○ More features
  ○ Simpler design
  ○ No, I've decided
```

### 8.2 Re-Engagement Survey (Email to Churned Free Users at Day 14)

```
Subject: "We'd love your feedback (takes 30 seconds)"

"Hi! We noticed you haven't used Finance in a while. We'd love to learn why.

What's the main reason you stopped using Finance?
  ○ Manual entry was too much work
  ○ I didn't find it useful enough
  ○ I'm using a different app
  ○ I forgot about it
  ○ Too complicated
  ○ I just needed it temporarily

Thanks! Your feedback directly shapes what we build next."
```

### 8.3 Churn Data Analysis Framework

```
Monthly Churn Report Template:

1. HEADLINE METRICS
   - Total churn rate this month: X%
   - Trend: ▲/▼ vs. last month
   - Churn by plan type: Monthly X%, Annual X%

2. CHURN REASON BREAKDOWN (from survey)
   - Pie chart of primary reasons
   - Top 3 reasons with actionable details

3. CHURN COHORT ANALYSIS
   - Churn rate by registration month
   - Churn rate by platform
   - Churn rate by activation status

4. INTERVENTION EFFECTIVENESS
   - Re-engagement notification conversion rate
   - Win-back campaign conversion rate
   - Time-to-churn trend (is it getting longer? = good)

5. RECOMMENDATIONS
   - Top 3 actions to reduce churn next month
   - Expected impact of each action
```

---

## 9. Win-Back Strategy

### 9.1 Win-Back Campaign Framework

| Trigger                    | Timing             | Channel       | Message                                               | Offer                |
| -------------------------- | ------------------ | ------------- | ----------------------------------------------------- | -------------------- |
| Free user inactive 7 days  | Day 7              | Push + Email  | "Your finances don't take a day off. Quick check-in?" | —                    |
| Free user inactive 14 days | Day 14             | Email         | "We've made improvements. Come see what's new."       | —                    |
| Free user inactive 30 days | Day 30             | Email         | "Start fresh — your data is waiting for you."         | —                    |
| Trial user didn't convert  | Trial end + 7 days | Email         | "Premium features you used: [list]. Still available." | 20% off first month  |
| Subscriber cancelled       | Cancel + 3 days    | In-app banner | "We're sorry to see you go. Changed your mind?"       | —                    |
| Subscriber cancelled       | Cancel + 14 days   | Email         | "We've added [new feature]. Come back and try it."    | 1 month free         |
| Subscriber cancelled       | Cancel + 30 days   | Email         | "Annual plan saves 33%. Worth another look?"          | Annual plan discount |

### 9.2 Win-Back Messaging Principles

1. **Never guilt-trip** — "We miss you" is fine; "Your budget is falling apart without us" is NOT
2. **Lead with value** — Always mention something new or improved
3. **Respect the decision** — Include easy unsubscribe from all communications
4. **No dark patterns** — Never make it hard to cancel; never hide the cancel button
5. **Timing matters** — Don't bombard; maximum 3 total win-back touches over 30 days
6. **Personalization without PII** — Reference feature usage patterns (aggregate), not financial data

---

## 10. Success Criteria

### 10.1 Deliverable Checklist

- [ ] Drop-off funnel mapped with actual data for every stage (Download → D30 Return)
- [ ] Top 3 churn points identified with quantified user impact
- [ ] Churn timing distribution mapped (when do most users churn?)
- [ ] At least 5 churn signals defined with detection methodology
- [ ] Platform-specific churn rates compared with statistical significance noted
- [ ] Competitive retention benchmark table completed with cited sources
- [ ] Friction point catalog with severity scores (minimum 5 friction points)
- [ ] Retention roadmap with 5+ quick wins, 5+ medium-term, 3+ strategic interventions
- [ ] Each intervention sized (effort) and impact-estimated
- [ ] All recommendations are ethical — no dark patterns, no manipulative retention tactics
- [ ] Report distinguishes fixable friction (UX issues) from natural attrition (non-target users)
- [ ] Churn survey designed and ready for implementation

### 10.2 Measurement of Intervention Success

| Metric                   | Baseline (Sprint 6) | Target (Sprint 8) | Target (Sprint 10) |
| ------------------------ | ------------------- | ----------------- | ------------------ |
| D1 retention             | Establish           | +5 pp             | +8 pp              |
| D7 retention             | Establish           | +5 pp             | +8 pp              |
| D30 retention            | Establish           | +3 pp             | +7 pp              |
| Activation rate          | Establish           | +10 pp            | +15 pp             |
| Churn rate (subscribers) | N/A (pre-Premium)   | <8%               | <5%                |
| Win-back conversion      | N/A                 | Establish         | >10%               |

_(pp = percentage points)_

---

## 11. Appendix: Churn Research References

### 11.1 Industry Research

| Source                                    | Key Finding                                                                  | Relevance                             |
| ----------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------- |
| Adjust Global App Trends 2024             | Finance app D30 retention median: 9.5%                                       | Baseline benchmark                    |
| AppsFlyer State of App Marketing 2024     | 70% of churn happens in first 3 days across all app categories               | Validates early intervention strategy |
| Recurly Research: Subscription Churn 2024 | Voluntary churn ~4-5%, involuntary (payment failure) ~1-2% for consumer apps | Need to address both types            |
| Liftoff Mobile App Trends 2024            | Finance apps with onboarding <3 steps retain 2× better than >5 steps         | Validates onboarding simplification   |
| CleverTap Benchmarks 2024                 | Push notification re-engagement lifts D7 retention by 5-10% for finance apps | Validates notification strategy       |

### 11.2 Competitor Churn Analysis (From Public Reviews)

| Competitor  | Top Churn Reason (from reviews)             | Our Advantage                             |
| ----------- | ------------------------------------------- | ----------------------------------------- |
| **YNAB**    | "Too expensive" ($14.99/mo), learning curve | Lower price, simpler UX                   |
| **Monarch** | "Too expensive" ($9.99/mo), feature bloat   | Lower price, focused feature set          |
| **Copilot** | iOS-only, missing features                  | Multi-platform, growing feature set       |
| **Mint**    | Ads, declining feature set, Intuit distrust | No ads, active development, privacy-first |

---

_This analysis framework will be populated with real data from Week 2+ post-launch. Initial findings and refined recommendations will be delivered by end of Sprint 6. This document directly feeds into Sprint 7 Premium launch decisions — retention issues must be addressed before monetization begins._
