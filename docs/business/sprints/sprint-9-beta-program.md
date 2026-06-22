# Smart Features Beta Program and Feedback Collection Plan

> **Sprint:** 9 — Smart Features
> **Issue:** #797
> **Priority:** P2 — Medium
> **Date:** 2025-07-27
> **Owner:** Product Management
> **Status:** Complete

---

## Executive Summary

This document defines the beta program for AI-powered features in the Finance app. It covers participant recruitment, feature rollout strategy, structured feedback mechanisms, accuracy tracking methodology, success criteria, and the feedback-to-improvement pipeline. The beta program runs for 4 weeks before general availability.

---

## Beta Program Overview

### Program Structure

| Phase          | Duration | Participants              | Features        | Goal                                        |
| -------------- | -------- | ------------------------- | --------------- | ------------------------------------------- |
| **Alpha**      | Week 1-2 | 50 internal + power users | All AI features | Identify critical bugs, accuracy issues     |
| **Beta**       | Week 3-4 | 500 Premium subscribers   | All AI features | Validate at scale, gather satisfaction data |
| **GA Rollout** | Week 5+  | All Premium users         | Staged rollout  | 10% → 50% → 100% with monitoring            |

### Timeline

```
Week 1-2: Alpha (50 users)
  |  Collect: Bug reports, accuracy reports, UX friction
  |  Gate: No P0/P1 bugs, >80% categorization accuracy
  v
Week 3-4: Beta (500 users)
  |  Collect: Satisfaction surveys, feature usage, accuracy at scale
  |  Gate: >85% satisfaction, <5% disable rate, >85% accuracy
  v
Week 5: GA Decision
  |  Review: All metrics, feedback synthesis, bias audit results
  |  Decision: Ship, iterate, or pause
  v
Week 5+: General Availability (staged rollout)
```

---

## Participant Recruitment

### Alpha Testers (50 participants)

| Segment              | Count | Selection Criteria                                             |
| -------------------- | ----- | -------------------------------------------------------------- |
| Internal team        | 10    | All team members with production accounts                      |
| Power users          | 20    | >=5 sessions/week, >=10 transactions/week, >=3 months active   |
| Multi-platform users | 10    | Active on 2+ platforms                                         |
| Non-English primary  | 10    | Users in Spanish, German, Portuguese, French, Japanese markets |

**Recruitment method:** Direct invitation via in-app banner for qualifying users. Opt-in with clear explanation of what beta testing involves.

### Beta Testers (500 participants)

| Segment                      | Count | Selection Criteria                                  |
| ---------------------------- | ----- | --------------------------------------------------- |
| Existing Premium subscribers | 200   | Active Premium, random selection                    |
| High-engagement free users   | 150   | Top 25% by session frequency, offered Premium trial |
| Geographic diversity         | 100   | Proportional to top 5 i18n markets                  |
| Accessibility users          | 50    | Users with accessibility settings enabled           |

**Recruitment method:** In-app opt-in with beta badge. "Help shape Finance's AI features — join the beta."

### Participant Rights

- [ ] Clear explanation of what beta involves before opt-in
- [ ] Ability to leave beta at any time (instant, no questions)
- [ ] All feedback is optional — no surveys required to use features
- [ ] Beta features can be individually disabled
- [ ] No data collected beyond normal Premium analytics + explicit feedback

---

## Feature Rollout Strategy

### Rollout Order

AI features are rolled out in order of risk and complexity:

| Order | Feature                       | Risk Level       | Rollout      |
| ----- | ----------------------------- | ---------------- | ------------ |
| 1     | Subscription Detection (#325) | Low              | Alpha Week 1 |
| 2     | Auto-Categorization (#263)    | Medium           | Alpha Week 1 |
| 3     | NLP Transaction Input (#322)  | Low              | Alpha Week 1 |
| 4     | Anomaly Detection (#323)      | Medium           | Alpha Week 2 |
| 5     | Predictive Balance (#324)     | Medium           | Alpha Week 2 |
| 6     | Budget Suggestions (#327)     | High (bias risk) | Beta Week 3  |

### Feature Flags

Each AI feature has an independent feature flag:

```
ai_categorization_enabled: false  (default)
ai_nlp_input_enabled: false
ai_anomaly_detection_enabled: false
ai_predictions_enabled: false
ai_subscription_detection_enabled: false
ai_budget_suggestions_enabled: false
ai_beta_program_active: false
```

- Alpha users: `ai_beta_program_active: true` + individual feature flags
- Beta users: `ai_beta_program_active: true` + individual feature flags
- GA users: Individual feature flags only (user-controlled)

---

## Feedback Collection Mechanisms

### 1. Inline Feedback (Every AI Suggestion)

Every AI output includes a minimal feedback mechanism:

```
┌──────────────────────────────────────┐
│ Category: Dining Out  (87% confidence)│
│                                      │
│ [✓ Correct]  [✗ Wrong]  [Edit]       │
└──────────────────────────────────────┘
```

**Data collected:**

- Feature name
- Confidence level
- User action (confirmed, rejected, edited)
- Corrected value (if edited)
- Time to respond

**NOT collected:** Transaction details, amounts, merchant names

### 2. Feature-Level Satisfaction (Weekly, In-App)

Shown once per week per active AI feature:

```
┌──────────────────────────────────────┐
│ How useful is Auto-Categorization?   │
│                                      │
│ 😊 Very useful                       │
│ 🙂 Somewhat useful                   │
│ 😐 Neutral                           │
│ 🙁 Not very useful                   │
│ 😞 Not useful at all                 │
│                                      │
│ [Skip]              [Optional comment]│
└──────────────────────────────────────┘
```

**Rules:**

- Maximum 1 survey per week across all features
- Always skippable
- Comment is optional and plain text (no structured data extraction)
- Survey rotates across features each week

### 3. Beta Feedback Form (Biweekly)

Sent via email/in-app notification at Week 2 and Week 4:

**Questions:**

1. Overall, how satisfied are you with Finance's AI features? (1-5 scale)
2. Which AI feature do you find most useful? (multi-select)
3. Which AI feature needs the most improvement? (multi-select)
4. Have you encountered any AI suggestions that felt wrong or inappropriate? (yes/no + optional description)
5. Do the AI features respect your privacy as you expected? (yes/no + optional comment)
6. Would you recommend Finance Premium to a friend based on the AI features? (1-10 NPS)
7. Open feedback: What would you change about the AI features? (free text)

### 4. Bug Reports (Always Available)

```
Settings → AI Features → Report an Issue

┌──────────────────────────────────────┐
│ Report AI Issue                      │
│                                      │
│ Feature: [dropdown]                  │
│ Issue type:                          │
│  ○ Wrong categorization              │
│  ○ Missed subscription               │
│  ○ Incorrect prediction              │
│  ○ Confusing display                 │
│  ○ Other                             │
│                                      │
│ Description: [text area]             │
│                                      │
│ ⚠️ Do not include account numbers,  │
│ passwords, or sensitive financial    │
│ details in your report.              │
│                                      │
│ [Submit]                             │
└──────────────────────────────────────┘
```

---

## Accuracy Tracking Methodology

### Per-Feature Accuracy Metrics

#### Auto-Categorization (#263)

| Metric              | Definition                                              | Target | Measurement                                    |
| ------------------- | ------------------------------------------------------- | ------ | ---------------------------------------------- |
| Top-1 Accuracy      | % of transactions where the first suggestion is correct | >=85%  | User confirmations / total suggestions         |
| Top-3 Accuracy      | % where correct category is in top 3 suggestions        | >=95%  | User selections from suggestion list           |
| False Positive Rate | % of confident (>90%) suggestions that are wrong        | <5%    | User rejections of high-confidence suggestions |
| Category Coverage   | % of transactions that receive a suggestion             | >=80%  | Suggestions / total new transactions           |

#### NLP Transaction Input (#322)

| Metric             | Definition                                | Target | Measurement                          |
| ------------------ | ----------------------------------------- | ------ | ------------------------------------ |
| Parse Success Rate | % of inputs successfully parsed           | >=90%  | Successful parses / total NLP inputs |
| Field Accuracy     | % of parsed fields that are correct       | >=95%  | Correct fields / total parsed fields |
| Rejection Rate     | % of parsed transactions rejected by user | <10%   | Rejections / successful parses       |

#### Anomaly Detection (#323)

| Metric               | Definition                                              | Target | Measurement                         |
| -------------------- | ------------------------------------------------------- | ------ | ----------------------------------- |
| True Positive Rate   | % of flagged transactions that user confirms as unusual | >=70%  | User confirmations / total flags    |
| False Positive Rate  | % of flagged transactions that user dismisses           | <30%   | Dismissals / total flags            |
| Alert Fatigue Metric | Average alerts per user per week                        | <=3    | Total alerts / active users / weeks |

#### Predictive Balance (#324)

| Metric              | Definition                                               | Target           | Measurement                                |
| ------------------- | -------------------------------------------------------- | ---------------- | ------------------------------------------ |
| Prediction Accuracy | % of predictions within confidence interval at month end | >=80%            | Actual within interval / total predictions |
| Mean Absolute Error | Average dollar difference between predicted and actual   | <=10% of balance | Absolute error / balance                   |

#### Subscription Detection (#325)

| Metric              | Definition                                        | Target | Measurement                             |
| ------------------- | ------------------------------------------------- | ------ | --------------------------------------- |
| Detection Rate      | % of actual subscriptions detected                | >=90%  | Detected / user-confirmed subscriptions |
| False Positive Rate | % of detected "subscriptions" that user dismisses | <15%   | Dismissals / detections                 |

---

## Success Criteria

### Alpha → Beta Gate (End of Week 2)

| Criterion                     | Target                   | Must Pass               |
| ----------------------------- | ------------------------ | ----------------------- |
| P0 bugs                       | 0                        | Yes                     |
| P1 bugs                       | <=2 (with fixes planned) | Yes                     |
| Categorization top-1 accuracy | >=80%                    | Yes                     |
| NLP parse success rate        | >=85%                    | Yes                     |
| Anomaly false positive rate   | <40%                     | Yes (relaxed for alpha) |
| Alpha tester satisfaction     | >=3.5/5                  | Yes                     |
| Privacy concerns raised       | 0 unresolved             | Yes                     |

### Beta → GA Gate (End of Week 4)

| Criterion                     | Target       | Must Pass |
| ----------------------------- | ------------ | --------- |
| P0 bugs                       | 0            | Yes       |
| P1 bugs                       | 0            | Yes       |
| Categorization top-1 accuracy | >=85%        | Yes       |
| NLP parse success rate        | >=90%        | Yes       |
| Anomaly true positive rate    | >=70%        | Yes       |
| Beta tester satisfaction      | >=4.0/5      | Yes       |
| Feature disable rate          | <5%          | Yes       |
| NPS (AI features)             | >=30         | Yes       |
| Privacy concerns raised       | 0 unresolved | Yes       |
| Bias audit passed             | All markets  | Yes       |

### GA Monitoring (Ongoing)

| Metric                       | Alert Threshold                   | Action                           |
| ---------------------------- | --------------------------------- | -------------------------------- |
| Categorization accuracy drop | <80% for 48 hours                 | Investigate, potentially disable |
| Anomaly false positive spike | >40% for 1 week                   | Reduce sensitivity, review model |
| Feature disable rate         | >10% in any 1-week period         | Investigate UX, review feedback  |
| Privacy complaints           | Any                               | Immediate review                 |
| Crash rate increase          | >0.1% attributable to AI features | Disable affected feature         |

---

## Feedback-to-Improvement Pipeline

### Weekly Cycle

```
Monday: Aggregate previous week's feedback data
  |
Tuesday: Triage feedback into categories
  |  - Bug fixes (P0-P3)
  |  - Accuracy improvements
  |  - UX improvements
  |  - Feature requests
  |
Wednesday: Prioritize and assign to sprint backlog
  |
Thursday-Friday: Engineering addresses top items
  |
Following Monday: Ship improvements, measure impact
```

### Feedback Categories and Owners

| Category                    | Owner                   | SLA                    |
| --------------------------- | ----------------------- | ---------------------- |
| Privacy concern             | @security-reviewer      | 24 hours               |
| P0 bug (data loss, crash)   | Engineering lead        | 24 hours               |
| P1 bug (incorrect behavior) | Feature owner           | Current sprint         |
| Accuracy issue              | ML engineer / KMP agent | Next model update      |
| UX friction                 | Design agent            | Current or next sprint |
| Feature request             | Product manager         | Backlog triage         |

---

## Communication Plan

### Beta Program Communications

| When          | Channel                    | Message                                                  |
| ------------- | -------------------------- | -------------------------------------------------------- |
| Beta invite   | In-app banner + email      | "Help shape Finance AI — join the beta"                  |
| Alpha → Beta  | In-app notification        | "AI features beta expanding — thanks for your feedback!" |
| Weekly update | Email to beta participants | Summary of improvements made from feedback               |
| Beta → GA     | In-app + email + blog post | "AI features now available to all Premium users"         |
| Post-GA       | App store "What's New"     | v1.2 release notes highlighting AI features              |

### Transparency Commitments

- Publish aggregate beta results (accuracy rates, satisfaction) in a blog post
- Share how feedback directly led to improvements (specific examples)
- Acknowledge limitations honestly — "Here's what we're still working on"
- Thank beta participants with a permanent "Beta Tester" badge in their profile

---

## Risk Mitigation

| Risk                                 | Likelihood | Impact   | Mitigation                                                     |
| ------------------------------------ | ---------- | -------- | -------------------------------------------------------------- |
| Low accuracy frustrates users        | Medium     | High     | Conservative confidence thresholds; "Uncategorized" over wrong |
| Privacy concerns from beta testers   | Low        | Critical | Proactive privacy documentation; @security-reviewer on standby |
| Alert fatigue from anomaly detection | Medium     | Medium   | Cap at 3 alerts/user/week; adaptive sensitivity                |
| Bias in non-English markets          | Medium     | High     | Dedicated non-English testing cohort; pre-launch bias audit    |
| Beta feedback volume overwhelms team | Low        | Medium   | Automated categorization of feedback; weekly triage cadence    |
| Feature disable rate exceeds 5%      | Low        | High     | A/B test feature defaults; improve first-use experience        |

---

## Dependencies

| Dependency                  | Issue                              | Status                 | Impact                                     |
| --------------------------- | ---------------------------------- | ---------------------- | ------------------------------------------ |
| AI feature implementations  | #263, #322, #323, #324, #325, #327 | Planned (Sprint 9)     | Features must be functional                |
| AI ethics guidelines        | #796                               | Complete (this sprint) | Guidelines must be established before beta |
| Analytics instrumentation   | #764                               | Open                   | Required for accuracy tracking             |
| Freemium gating             | #337                               | Open                   | AI features gated as Premium               |
| Feature flag infrastructure | —                                  | Needed                 | Per-feature toggles for staged rollout     |
