# Premium Strategy & Conversion Funnel

**Issue:** #1024
**Sprint:** 14 — Premium Strategy & Conversion Funnel
**Priority:** P1 — High
**Status:** Complete
**Document Owner:** Product Management
**Date:** 2025-07-30
**Related Issues:** #337, #338, #339, #344
**Related:** [Monetization Roadmap](monetization-roadmap.md) ·
[Premium Conversion Tracking](premium-conversion-tracking.md) ·
[Freemium Optimization](freemium-optimization-sprint9.md) ·
[Stage 12 Feature Specs](stage-12-feature-specifications.md)

---

## Executive Summary

This document defines the complete premium conversion strategy for the Finance
app, covering feature gating rules, upgrade prompt placement, trial period
design, pricing tier positioning, A/B testing strategy, and conversion funnel
optimization. The goal is to convert free users to paying subscribers while
maintaining trust and avoiding dark patterns.

### Strategic Principles

1. **Value before ask** — Users must experience value before seeing a paywall
2. **Honest gates** — Every gate must feel like "you'll love this feature" not
   "pay up or else"
3. **Generous free tier** — Free users should never feel punished
4. **Data-driven iteration** — Every element of the funnel is testable
5. **Privacy-first** — Conversion tracking respects our privacy principles

---

## 1. Feature Gating Rules

### 1.1 Gating Philosophy

The free tier must be genuinely useful for daily personal finance management.
Premium gates should feel like natural expansion points, not artificial walls.

**Gate when:** The feature serves power users, costs us per-user (bank API,
storage), or provides advanced intelligence beyond basic tracking.

**Never gate:** Core transaction logging, basic budgets, biometric auth,
offline support, E2E encryption, basic analytics, AI categorization (table
stakes), anomaly detection (safety feature).

### 1.2 Complete Feature Gate Map

| Feature                | Tier       | Gate Type    | Trigger Point                    |
| ---------------------- | ---------- | ------------ | -------------------------------- |
| 4th account            | Premium    | Soft limit   | User creates 4th account         |
| 6th budget             | Premium    | Soft limit   | User creates 6th budget          |
| 3rd goal               | Premium    | Soft limit   | User creates 3rd goal            |
| 6th custom category    | Premium    | Soft limit   | User creates 6th custom cat      |
| 3rd device sync        | Premium    | Soft limit   | User links 3rd device            |
| PDF/JSON export        | Premium    | Hard gate    | User selects non-CSV export      |
| Advanced analytics     | Premium    | Soft preview | User scrolls past basic charts   |
| NLP transaction input  | Premium    | Soft preview | User sees NLP icon but can't use |
| Spending predictions   | Premium    | Soft preview | User sees prediction teaser      |
| Budget recommendations | Premium    | Hard gate    | User taps "Get Recommendations"  |
| Receipt scanning       | Premium    | Hard gate    | User taps camera icon            |
| Bank connections       | Premium    | Hard gate    | User taps "Connect Bank"         |
| Report builder         | Premium    | Hard gate    | User taps "New Report"           |
| Financial health score | Premium    | Soft preview | User sees score but not details  |
| Scheduled exports      | Premium    | Hard gate    | User taps "Schedule Export"      |
| Subscription detection | Premium    | Soft preview | User sees detected subs blurred  |
| Premium themes         | Premium    | Hard gate    | User browses theme gallery       |
| Household sharing      | Family     | Hard gate    | User taps "Create Household"     |
| Budget negotiation     | Family     | Hard gate    | User taps "Propose Change"       |
| Team management        | Enterprise | Hard gate    | User taps "Create Team"          |
| Approval workflows     | Enterprise | Hard gate    | Admin configures approval rules  |

### 1.3 Gate Types Defined

**Soft Limit:** User hits a numeric limit. Show count ("3 of 3 accounts used")
and a friendly upgrade prompt. No features removed — user just can't add more.

**Hard Gate:** Feature is fully locked behind Premium. Tap reveals upgrade
prompt with feature benefit explanation.

**Soft Preview:** Feature is partially visible. User sees a teaser (blurred
prediction, summary without details) that creates desire to unlock. Tap
triggers upgrade flow with specific feature highlighted.

### 1.4 Gate UI Guidelines

- **DO:** Show what the feature does and why it's valuable
- **DO:** Show a preview of the feature with real user data when possible
- **DO:** Include a "Not now" / dismiss option that's easy to find
- **DON'T:** Use countdown timers or fake scarcity
- **DON'T:** Show the gate more than once per session for the same feature
- **DON'T:** Make the dismiss button smaller or harder to find than "Upgrade"
- **DON'T:** Block the user from returning to where they were

---

## 2. Upgrade Prompt Placement Map

### 2.1 Passive Prompts (Always Visible)

| Location           | Prompt Type            | Frequency      |
| ------------------ | ---------------------- | -------------- |
| Settings page      | "Upgrade to Premium"   | Always visible |
| About/Support page | Small "Go Premium" CTA | Always visible |
| Export screen      | "PDF/JSON: Premium"    | When viewing   |

### 2.2 Contextual Prompts (Triggered by User Action)

| Trigger                               | Prompt                                  | Cooldown      |
| ------------------------------------- | --------------------------------------- | ------------- |
| Hit account/budget/goal limit         | "Need more? Upgrade to Premium"         | 1 per day     |
| Tap locked feature                    | Feature-specific upgrade sheet          | 1 per session |
| View soft preview (e.g., predictions) | "Unlock full predictions"               | 1 per day     |
| Complete 30 days of active use        | "You're a power user! Try Premium free" | One-time      |
| Monthly spending summary              | "See deeper insights with Premium"      | 1 per month   |

### 2.3 Prompt Frequency Rules

- **Daily cap:** Maximum 2 upgrade prompts per day across all triggers
- **Session cap:** Maximum 1 upgrade prompt per session
- **Post-dismiss cooldown:** Same trigger won't fire again for 24 hours
- **Never interrupt:** Prompts NEVER appear during transaction entry, budget
  editing, or any active workflow
- **New user grace period:** No upgrade prompts in first 7 days

### 2.4 Prompt Effectiveness Tracking

Every prompt must track:

- Impression count (how many times shown)
- Dismiss rate (closed without action)
- Tap-through rate (tapped "Learn More" or "Upgrade")
- Conversion rate (resulted in trial start or subscription)
- Annoyance signal (user disabled feature or reduced app usage after prompt)

---

## 3. Trial Period Design

### 3.1 Trial Structure

| Parameter               | Value                                |
| ----------------------- | ------------------------------------ |
| Duration                | 14 days                              |
| Credit card required    | No                                   |
| Features included       | Full Premium (all features unlocked) |
| Automatic conversion    | No — user must actively subscribe    |
| Maximum trials per user | 1 per account (ever)                 |
| Trial for Family plan   | 14 days (all household members)      |

### 3.2 Trial Activation Triggers

| Trigger                | Context                          | Priority  |
| ---------------------- | -------------------------------- | --------- |
| First gate encounter   | "Try Premium free for 14 days"   | Primary   |
| Onboarding completion  | "Start your Premium trial?"      | Secondary |
| 30-day usage milestone | "You're ready for Premium"       | Tertiary  |
| Referral reward        | "Your friend gifted you Premium" | Automatic |

### 3.3 Trial Onboarding Experience

**Day 1 (Trial Start):**

- Welcome message: "Your 14-day Premium trial has started!"
- Guided tour of top 3 Premium features relevant to user's data
- "Try this today" prompt for the most relevant Premium feature

**Day 3–7 (Discovery Phase):**

- Daily notification highlighting one Premium feature not yet tried
- In-app badge: "X of 5 Premium features discovered"

**Day 10 (Mid-Trial):**

- Summary of Premium features used during trial
- "You've used [feature] X times — keep it with Premium"
- Show personalized value: "Premium saved you X minutes this week"

**Day 12 (Pre-Expiry):**

- Push notification: "Your trial ends in 2 days"
- In-app banner with subscribe CTA
- Show what will be locked: specific features user has been using

**Day 14 (Trial End):**

- "Your trial has ended" screen with summary
- Clear pricing: monthly vs annual with savings highlighted
- "Subscribe" and "Maybe Later" (equal prominence)
- If user declines: "We'll be here when you're ready" (graceful exit)

**Post-Trial (if not converted):**

- No additional prompts for 7 days
- Then: 1 "Welcome back to Premium" prompt per month (max 3 total)
- After 3 months: stop prompting entirely

### 3.4 Trial Conversion Targets

| Metric                       | Target                        | Alert Threshold |
| ---------------------------- | ----------------------------- | --------------- |
| Trial start rate             | 20–30% of paywall viewers     | < 10%           |
| Trial engagement (features)  | 3+ of 5 Premium features used | < 2             |
| Trial-to-paid conversion     | 8–15%                         | < 5%            |
| Average trial-to-paid time   | Day 12–14                     | —               |
| Annual plan % of conversions | 50%+                          | < 30%           |

---

## 4. Pricing Tier Strategy

### 4.1 Tier Comparison

| Attribute          | Free      | Premium      | Family           | Enterprise       |
| ------------------ | --------- | ------------ | ---------------- | ---------------- |
| Monthly price      | $0        | $4.99        | $7.99            | $14.99/seat      |
| Annual price       | $0        | $47.88/yr    | $71.88/yr        | $143.88/seat/yr  |
| Accounts           | 3         | Unlimited    | Unlimited        | Unlimited        |
| Budgets            | 5         | Unlimited    | Unlimited+shared | Unlimited+team   |
| Goals              | 2         | Unlimited    | Unlimited        | Unlimited        |
| Sync devices       | 2         | Unlimited    | Unlimited        | Unlimited        |
| AI features        | Basic     | Full suite   | Full suite       | Full suite       |
| Export formats     | CSV       | CSV,PDF,JSON | CSV,PDF,JSON     | CSV,PDF,QBO,Xero |
| Bank connections   | —         | Included     | Included         | Included         |
| Report builder     | —         | Included     | Included         | Included         |
| Household sharing  | —         | —            | Up to 6 members  | —                |
| Team management    | —         | —            | —                | Up to 25 seats   |
| Approval workflows | —         | —            | —                | Included         |
| Support            | Community | Priority     | Priority         | Email SLA        |

### 4.2 Competitive Positioning

| App            | Price     | Model        | Our Advantage                      |
| -------------- | --------- | ------------ | ---------------------------------- |
| Finance (ours) | $4.99/mo  | Freemium     | Privacy-first, cross-platform, OSS |
| Monarch Money  | $9.99/mo  | Subscription | 50% cheaper, privacy-first         |
| Copilot        | $8.33/mo  | Subscription | 40% cheaper, 4 platforms vs 1      |
| YNAB           | $14.99/mo | Subscription | 67% cheaper, free tier exists      |
| Mint (Intuit)  | Free      | Ad-supported | No ads, no data selling            |

**Positioning statement:** "All the power of premium finance apps, none of the
privacy compromise, at half the price."

### 4.3 Price Sensitivity Testing Plan

| Test            | Variant A          | Variant B     | Metric            | Duration |
| --------------- | ------------------ | ------------- | ----------------- | -------- |
| Monthly price   | $4.99              | $5.99         | Conversion rate   | 4 weeks  |
| Annual discount | 20%                | 30%           | Annual adoption % | 4 weeks  |
| Family price    | $7.99              | $9.99         | Family adoption % | 4 weeks  |
| Trial duration  | 14 days            | 7 days        | Trial-to-paid %   | 6 weeks  |
| Trial CTA       | "Start Free Trial" | "Try Premium" | Trial start %     | 2 weeks  |

---

## 5. Conversion Funnel Optimization

### 5.1 Funnel Stages

| Stage              | Definition                            | Target Rate           |
| ------------------ | ------------------------------------- | --------------------- |
| Free user          | Registered, using app                 | 100% (base)           |
| Premium impression | Encountered a gated feature           | 60% of free users     |
| Consideration      | Tapped "Learn More" on gate           | 15% of impressions    |
| Paywall view       | Saw pricing screen                    | 80% of considerations |
| Trial start        | Began 14-day trial                    | 25% of paywall views  |
| Trial engagement   | Used 3+ Premium features during trial | 70% of trial starts   |
| Conversion         | Paid subscription started             | 12% of trial starts   |
| First renewal      | Renewed after first billing cycle     | 85% of conversions    |

### 5.2 End-to-End Conversion Model

Starting with 1,000 free users:

| Stage              | Users | Rate | Drop-off |
| ------------------ | ----- | ---- | -------- |
| Free users         | 1000  | 100% | —        |
| Premium impression | 600   | 60%  | 400      |
| Consideration      | 90    | 15%  | 510      |
| Paywall view       | 72    | 80%  | 18       |
| Trial start        | 18    | 25%  | 54       |
| Trial engagement   | 13    | 70%  | 5        |
| Conversion         | 2.2   | 12%  | 16       |
| First renewal      | 1.8   | 85%  | 0.4      |

**End-to-end conversion:** ~0.2% of all free users (in line with freemium
industry benchmarks of 2–5% for users who encounter a gate).

### 5.3 Funnel Optimization Levers

| Lever                              | Target Stage     | Expected Lift | Effort |
| ---------------------------------- | ---------------- | ------------- | ------ |
| More soft previews                 | Impression rate  | +10–20%       | S      |
| Better gate UI with data preview   | Consideration    | +5–10%        | M      |
| Streamlined paywall (fewer clicks) | Paywall view     | +5–10%        | S      |
| No-credit-card trial               | Trial start      | +20–40%       | S      |
| Trial onboarding notifications     | Trial engagement | +15–25%       | M      |
| Day-12 personalized value msg      | Conversion       | +10–15%       | M      |
| Annual plan prominence             | Revenue per conv | +20–30%       | S      |

---

## 6. A/B Testing Strategy

### 6.1 Testing Infrastructure

- **Platform:** PostHog feature flags (self-hosted) or Statsig (privacy mode)
- **Assignment:** Random per user, sticky (same user always sees same variant)
- **Minimum sample:** 500 users per variant per test
- **Statistical significance:** p < 0.05, minimum 80% power
- **Maximum concurrent tests:** 2 (to avoid interaction effects)

### 6.2 Test Roadmap (Priority Order)

| Priority | Test Name                       | Hypothesis                                | Timeline   |
| -------- | ------------------------------- | ----------------------------------------- | ---------- |
| 1        | Trial duration (14 vs 7d)       | 14-day trial converts better than 7-day   | Week 1–6   |
| 2        | Gate UI (simple vs preview)     | Data preview in gates lifts consideration | Week 3–8   |
| 3        | Price point ($4.99 vs $5.99)    | $4.99 converts enough more to offset      | Week 7–12  |
| 4        | Annual discount (20% vs 30%)    | 30% discount lifts annual adoption        | Week 9–14  |
| 5        | Paywall layout (2-col vs stack) | Side-by-side plans convert better         | Week 11–16 |

### 6.3 Test Evaluation Framework

Each test must have:

- **Primary metric:** The one metric that determines winner
- **Guardrail metrics:** Metrics that must not degrade (retention, NPS)
- **Decision criteria:** Minimum lift to ship, maximum acceptable degradation
- **Rollout plan:** Winner rolled out to 100% within 1 week of conclusion

---

## 7. Revenue Projection Model

### 7.1 Monthly Revenue Projections (Year 1)

| Month | Users  | Trial Starts | Conversions | MRR     | Notes              |
| ----- | ------ | ------------ | ----------- | ------- | ------------------ |
| 1     | 5,000  | 150          | 18          | $90     | Launch month       |
| 2     | 8,000  | 320          | 38          | $280    | Growth phase       |
| 3     | 12,000 | 600          | 72          | $640    | Marketing push     |
| 4     | 16,000 | 960          | 115         | $1,200  | Steady state       |
| 5     | 20,000 | 1,400        | 168         | $2,040  | Referral ramp      |
| 6     | 25,000 | 2,000        | 240         | $3,240  | Family plan launch |
| 7     | 30,000 | 2,700        | 324         | $4,860  | Q3 features        |
| 8     | 35,000 | 3,500        | 420         | $6,960  | Widget boost       |
| 9     | 40,000 | 4,400        | 528         | $9,600  | Enterprise launch  |
| 10    | 45,000 | 5,400        | 648         | $12,840 | International      |
| 11    | 50,000 | 6,500        | 780         | $16,740 | Scale              |
| 12    | 55,000 | 7,700        | 924         | $21,360 | Year-end           |

**Assumptions:** 8% of free MAU encounter gate, 25% start trial, 12%
trial-to-paid, 5% monthly churn, 45% annual plan adoption.

### 7.2 Annual Revenue Summary

| Metric                  | Conservative | Expected | Optimistic |
| ----------------------- | ------------ | -------- | ---------- |
| Year 1 total users      | 35,000       | 55,000   | 80,000     |
| Year 1 paid subscribers | 500          | 924      | 1,500      |
| Year 1 ARR              | $30,000      | $80,000  | $150,000   |
| LTV per subscriber      | $45          | $72      | $108       |
| Break-even month        | Month 14     | Month 9  | Month 6    |

---

## Acceptance Criteria Summary

- [x] Complete feature gating rules with gate type per feature
- [x] Upgrade prompt placement map with frequency limits
- [x] Trial period specification (14-day, no credit card, full features)
- [x] Trial onboarding journey (Day 1 through post-trial)
- [x] Pricing tier comparison with competitive landscape
- [x] Conversion funnel model with targets per stage
- [x] A/B testing strategy with prioritized test roadmap
- [x] Revenue projection model with conservative/expected/optimistic
- [x] Gate UI guidelines (do's and don'ts)
- [x] Privacy-compliant tracking requirements
