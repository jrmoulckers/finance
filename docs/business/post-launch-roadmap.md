# Post-Launch Roadmap — Quarterly Milestones

**Issue:** #1021
**Sprint:** 13 — Post-Launch Roadmap
**Priority:** P2 — Medium
**Status:** Complete
**Document Owner:** Product Management
**Date:** 2025-07-30
**Source Issues:** #265, #267, #378, #379, #382
**Related:** [v1.2 Release Plan](v12-release-plan-v20-roadmap.md) ·
[V2 Feature Specifications](v2-feature-specifications.md) ·
[International Expansion Analysis](international-expansion-analysis.md)

---

## Executive Summary

This document defines the comprehensive post-launch roadmap for the Finance app,
organized into quarterly milestones across 4 quarters. The roadmap covers three
strategic pillars: **connectivity** (bank connections, browser extension),
**education** (contextual tooltips, expertise tiers, learning paths), and
**platform expansion** (V2 features, international markets).

Each quarter has a theme, specific deliverables, success metrics, and risk
assessment. Features are sequenced based on dependencies, engineering capacity,
and expected business impact.

### Roadmap Overview

| Quarter | Theme                    | Key Deliverables                              |
| ------- | ------------------------ | --------------------------------------------- |
| Q1      | Connect & Monetize       | Bank connections, premium launch, browser ext |
| Q2      | Educate & Engage         | Financial education, health score, widgets    |
| Q3      | Power & Enterprise       | Report builder, enterprise plan, API access   |
| Q4      | Scale & Internationalize | i18n expansion, advanced AI, investment track |

---

## Q1: Connect & Monetize (Months 1–3 Post-Launch)

### Theme

Establish revenue infrastructure and launch the highest-impact post-launch
feature: bank connections. This quarter transforms Finance from a manual-entry
app into an optionally-connected financial hub.

### Milestone Deliverables

| Feature                      | Issue | Priority | Agent Types         | Effort |
| ---------------------------- | ----- | -------- | ------------------- | ------ |
| Bank connection API (Plaid)  | #265  | P1       | Backend + KMP       | L      |
| Browser extension (Chrome)   | #267  | P2       | Web                 | M      |
| Freemium gating              | #337  | P1       | KMP + all platforms | L      |
| Premium subscription IAP     | #338  | P1       | All platforms       | L      |
| Annual subscription discount | #344  | P2       | All platforms       | S      |
| Privacy-as-premium marketing | #340  | P2       | Marketing           | M      |

### Feature Detail: Bank Connection API (#265)

**Scope:** Plaid integration for automatic transaction import from US bank
accounts. Completely optional — Finance works great without it.

**Implementation Plan:**

1. **Weeks 1–2:** Plaid Link integration (account linking UI)
2. **Weeks 3–4:** Transaction sync pipeline (Plaid → Edge Function → local DB)
3. **Weeks 5–6:** Balance updates, error handling, retry logic
4. **Weeks 7–8:** Security review, disconnect flow, privacy controls
5. **Weeks 9–10:** Beta testing with limited user cohort
6. **Weeks 11–12:** GA rollout with monitoring

**Platform Rollout:**

| Platform | Implementation                         | Timeline   |
| -------- | -------------------------------------- | ---------- |
| iOS      | Plaid Link SDK (native)                | Weeks 1–8  |
| Android  | Plaid Link SDK (native)                | Weeks 1–8  |
| Web      | Plaid Link JS (embedded)               | Weeks 1–8  |
| Windows  | Plaid Link WebView (via Edge WebView2) | Weeks 3–10 |

**Privacy Safeguards:**

- Plaid never sees user's Finance data; Finance never sees bank credentials
- Users can disconnect at any time; imported transactions persist locally
- Imported transactions encrypted with same E2E encryption as manual entries
- Clear disclosure: what Plaid accesses, what Finance stores, how to revoke

**Success Metrics:**

- 15% of premium users connect at least one bank account in Month 1
- Transaction import accuracy: 95%+ match to bank statement
- Average time from link to first imported transaction: < 2 minutes
- Disconnect rate: < 10% within 30 days

### Feature Detail: Browser Extension (#267)

**Scope:** Chrome extension (Firefox in Q2) that detects online purchases and
offers to capture them as transactions in Finance.

**Implementation Plan:**

1. **Weeks 1–2:** Extension scaffold, manifest v3, popup UI
2. **Weeks 3–4:** Purchase detection (email confirmation pages, order pages)
3. **Weeks 5–6:** Transaction creation via deep link to web app
4. **Weeks 7–8:** Testing across major e-commerce sites

**Detection Strategy:**

- Parse order confirmation pages (Amazon, major retailers)
- Detect common purchase patterns (amount + merchant + date)
- User clicks "Add to Finance" → opens web app with pre-filled transaction
- No automatic transaction creation — user always confirms

**Success Metrics:**

- 5% of web users install extension in first quarter
- Purchase detection accuracy: 80%+ on supported retailers
- Extension-to-transaction conversion: 60%+ of detected purchases captured

### Q1 Dependencies

| Dependency                      | Required For | Status      |
| ------------------------------- | ------------ | ----------- |
| Plaid developer account         | #265         | Human-gated |
| Chrome Web Store developer acct | #267         | Human-gated |
| Stripe account setup            | #338 (web)   | Human-gated |
| App store subscription products | #338         | Human-gated |
| Terms of service update         | #337, #338   | Required    |
| Privacy policy update           | #265, #340   | Required    |

### Q1 Risk Assessment

| Risk                              | Impact | Probability | Mitigation                            |
| --------------------------------- | ------ | ----------- | ------------------------------------- |
| Plaid onboarding delays           | High   | Medium      | Start vendor outreach pre-launch      |
| Low premium conversion (< 3%)     | High   | Low         | A/B test pricing, improve onboarding  |
| Browser extension store rejection | Medium | Low         | Follow manifest v3 guidelines         |
| Bank connection privacy backlash  | Medium | Low         | Clear opt-in, transparent disclosures |

### Q1 Success Criteria

- [ ] Premium subscription live on all 4 platforms
- [ ] MRR reaches $1,500 by end of Q1
- [ ] Bank connections available for US banks via Plaid
- [ ] Browser extension published in Chrome Web Store
- [ ] 5% free-to-premium conversion rate

---

## Q2: Educate & Engage (Months 4–6 Post-Launch)

### Theme

Deepen user engagement through financial education and intelligent features.
This quarter builds the "smart" layer that differentiates Finance from
spreadsheet alternatives.

### Milestone Deliverables

| Feature                        | Issue | Priority | Agent Types         | Effort |
| ------------------------------ | ----- | -------- | ------------------- | ------ |
| Contextual financial education | #378  | P2       | KMP + all platforms | M      |
| Expertise tier system          | #379  | P2       | KMP + all platforms | M      |
| Financial health score         | #299  | P1       | KMP + backend       | M      |
| Biometric-protected categories | #295  | P2       | KMP + all platforms | M      |
| Family/household premium plan  | #339  | P2       | Backend + KMP       | M      |
| Referral program               | #342  | P2       | Backend + all plats | M      |
| Browser extension (Firefox)    | #267  | P3       | Web                 | S      |

### Feature Detail: Contextual Financial Education (#378)

**Scope:** Every financial concept in the app gets an info icon that expands
into educational content.

**Content Structure (per concept):**

1. **What it is** — One-sentence plain explanation
2. **How it's calculated** — Show actual inputs from user's data
3. **Why it matters** — Practical implication for the user
4. **Learn more** — Link to deeper content (premium: learning paths)

**Concepts to Cover (minimum 20):**

- Net Worth / Total Picture
- Budget / Spending Plan
- Savings Rate
- Budget Rollover
- Categories and Sub-categories
- Recurring Transactions
- Debt-to-Income Ratio
- Emergency Fund
- Income vs Expense
- Financial Goals
- Cash Flow
- Spending Trends
- Budget Variance
- Account Types (checking, savings, credit, investment)
- Transaction Types (income, expense, transfer)
- Biometric Security
- Data Export
- Sync and Backup
- Financial Health Score
- Investment Basics

**Implementation:**

- Content stored as Markdown in KMP shared resources
- Tooltip UI component per platform (bottom sheet / popover)
- Content tagged by expertise tier for filtering
- Analytics: track which tooltips are viewed most (anonymous)

**Success Metrics:**

- 30% of active users interact with at least one tooltip per month
- Average tooltip views per user: 3+ per month
- Tooltip engagement correlates with 10%+ higher retention

### Feature Detail: Expertise Tier System (#379)

**Scope:** 3-tier system that adapts terminology, visible features, and UI
complexity based on user's financial comfort level.

**Tiers:**

| Tier            | Terminology      | Features Shown | Prompts           |
| --------------- | ---------------- | -------------- | ----------------- |
| Getting Started | Plain language   | Simplified     | Guided, proactive |
| Comfortable     | Standard + hints | Full set       | On request        |
| Advanced        | Finance terms    | Full + power   | Minimal           |

- Selection during onboarding and changeable in Settings
- Default tier: Comfortable
- Tier affects: label text, tooltip depth, feature visibility, notification tone
- Does NOT gate features behind tiers — just adapts presentation

**Success Metrics:**

- 40% of new users select a tier during onboarding
- Getting Started users retain 15% better than unselected users at D30
- 20% of Getting Started users upgrade to Comfortable within 90 days

### Feature Detail: Financial Learning Paths (#382, Premium)

**Scope:** Structured in-app education modules available as a premium feature.

**Proposed Modules:**

1. Building an Emergency Fund (4 lessons)
2. Understanding Credit (5 lessons)
3. Budgeting Basics (4 lessons)
4. Saving for Goals (4 lessons)
5. Understanding Debt (5 lessons)
6. Investing 101 (6 lessons)

**Lesson Format:**

- 3–5 minute reading time per lesson
- Embedded examples from user's own data (when available)
- Quiz at end of each module (3–5 questions)
- Completion badge in user profile
- Progress tracking across modules

**Delivery:** Q2 ships modules 1–3; remaining modules in Q3–Q4.

### Q2 Dependencies

| Dependency                      | Required For | Status       |
| ------------------------------- | ------------ | ------------ |
| Education content authoring     | #378, #382   | Content team |
| Health score formula validation | #299         | Data team    |
| Household sharing maturity      | #339         | Engineering  |
| Referral deep link infra        | #342         | Engineering  |

### Q2 Risk Assessment

| Risk                               | Impact | Probability | Mitigation                            |
| ---------------------------------- | ------ | ----------- | ------------------------------------- |
| Education content quality/accuracy | High   | Medium      | Expert review before ship             |
| Health score methodology disputes  | Medium | Medium      | Publish formula, allow weight tuning  |
| Expertise tier adds UI complexity  | Medium | Low         | Careful QA across all tier combos     |
| Family plan billing edge cases     | Medium | Medium      | Extensive testing of member lifecycle |

### Q2 Success Criteria

- [ ] Financial education tooltips live on 20+ concepts
- [ ] Expertise tier system active with 40%+ onboarding selection
- [ ] Financial health score live for all users (benchmarking: premium)
- [ ] Biometric-protected categories available on all platforms
- [ ] Family plan generating 15% of premium revenue
- [ ] Referral program driving 100+ new users per month
- [ ] First 3 learning path modules published

---

## Q3: Power & Enterprise (Months 7–9 Post-Launch)

### Theme

Serve power users and small businesses with advanced reporting and enterprise
features. This quarter unlocks the highest-ARPU customer segment.

### Milestone Deliverables

| Feature                      | Issue | Priority | Agent Types         | Effort |
| ---------------------------- | ----- | -------- | ------------------- | ------ |
| Custom report builder        | #303  | P2       | KMP + all platforms | L      |
| Collaborative budget negot.  | #300  | P3       | KMP + backend       | L      |
| Enterprise/team plan         | #343  | P3       | Backend + all plats | XL     |
| Widget support (all plats)   | #293  | P2       | All platforms       | L      |
| Learning paths (modules 4–6) | #382  | P3       | Content + KMP       | S      |
| Bank connection expansion    | #265  | P2       | Backend             | L      |

### Q3 Success Criteria

- [ ] Report builder live for premium users on all platforms
- [ ] Enterprise plan launched with at least 10 team subscribers
- [ ] Widget support on all 4 platforms
- [ ] Budget negotiation live for family plan households
- [ ] Bank connections expanded to 2+ additional providers or UK/EU
- [ ] MRR reaches $8,000

---

## Q4: Scale & Internationalize (Months 10–12 Post-Launch)

### Theme

Expand to international markets, deepen AI capabilities, and lay groundwork for
v2.0 major release.

### Milestone Deliverables

| Feature                        | Priority | Agent Types         | Effort |
| ------------------------------ | -------- | ------------------- | ------ |
| International bank connections | P2       | Backend             | XL     |
| Investment tracking (v2.0)     | P2       | KMP + all platforms | XL     |
| Advanced AI insights           | P2       | KMP + backend       | L      |
| API access for power users     | P3       | Backend             | L      |
| Additional learning paths      | P3       | Content + KMP       | S      |
| i18n expansion (EU, UK, AU)    | P2       | KMP + all platforms | L      |

### Q4 Success Criteria

- [ ] App available in 5+ languages
- [ ] Bank connections working in at least 2 international markets
- [ ] Investment tracking in beta
- [ ] API documentation published
- [ ] MRR reaches $12,000
- [ ] Total users: 25,000+

---

## Resource Requirements

### Engineering Capacity Per Quarter

| Quarter | KMP | iOS | Android | Web | Windows | Backend | Total |
| ------- | --- | --- | ------- | --- | ------- | ------- | ----- |
| Q1      | 1   | 0.5 | 0.5     | 0.5 | 0.5     | 1       | 4     |
| Q2      | 1   | 0.5 | 0.5     | 0.5 | 0.5     | 0.5     | 3.5   |
| Q3      | 1   | 0.5 | 0.5     | 0.5 | 0.5     | 1       | 4     |
| Q4      | 1   | 0.5 | 0.5     | 0.5 | 0.5     | 1       | 4     |

(Numbers represent full-time equivalents)

### Non-Engineering Resources

| Resource           | Q1   | Q2   | Q3   | Q4   |
| ------------------ | ---- | ---- | ---- | ---- |
| Product Management | 0.5  | 0.5  | 0.5  | 0.5  |
| Design             | 0.25 | 0.5  | 0.25 | 0.25 |
| Content/Education  | 0    | 0.5  | 0.25 | 0.25 |
| Marketing          | 0.25 | 0.25 | 0.25 | 0.5  |
| Legal              | 0.1  | 0.05 | 0.1  | 0.1  |

---

## Cross-Quarter Dependency Map

| Feature               | Depends On                    | Enables                |
| --------------------- | ----------------------------- | ---------------------- |
| #265 Bank connections | Plaid account, privacy review | Investment tracking    |
| #267 Browser ext      | Chrome Web Store account      | —                      |
| #378 Education tips   | Content authoring             | #382 Learning paths    |
| #379 Expertise tiers  | —                             | #378 content filtering |
| #382 Learning paths   | #378, content authoring       | —                      |
| #337 Feature gating   | —                             | All premium features   |
| #338 Premium IAP      | #337, store accounts          | #339, #342, #343       |
| #299 Health score     | Budget/goal data maturity     | Benchmarking           |
| #293 Widgets          | Design tokens                 | —                      |
| #303 Report builder   | Chart libraries               | Enterprise value       |
| #300 Budget negot.    | Household sharing maturity    | —                      |
| #343 Enterprise       | #337, #338, #339              | —                      |

---

## Roadmap Risks (Cross-Quarter)

| Risk                             | Quarters | Impact | Mitigation                            |
| -------------------------------- | -------- | ------ | ------------------------------------- |
| Plaid partnership delays         | Q1       | High   | Start outreach before launch          |
| Low premium conversion           | Q1–Q2    | High   | A/B test pricing, iterate on gates    |
| Education content accuracy       | Q2–Q4    | Medium | Expert review, user feedback loop     |
| Enterprise market fit unknown    | Q3       | Medium | MVP scope, validate with 10 teams     |
| International regulatory         | Q4       | High   | Legal review per market, PSD2/GDPR    |
| Engineering capacity constraints | All      | Medium | Prioritize ruthlessly, defer Q4 scope |

---

## Acceptance Criteria Summary

- [x] Quarterly milestone definitions (Q1–Q4) with themes and deliverables
- [x] Feature-to-quarter mapping with rationale and dependencies
- [x] Platform rollout strategy per feature
- [x] Resource requirements per quarter
- [x] Risk assessment per quarter with mitigations
- [x] Success metrics per milestone
- [x] Cross-quarter dependency map
- [x] All referenced issues (#265, #267, #378, #379, #382) covered
