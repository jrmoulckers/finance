# Pricing A/B Test Analysis & Validation

> **Issue:** #823
> **Sprint:** 7 — "Monetize"
> **Priority:** P1 — High
> **Created:** 2025-07-27
> **Owner:** Business Analyst
> **Status:** Draft — Requires Premium live + paywall traffic for execution
> **Depends on:** #822 (Conversion Tracking), #338 (Premium IAP)

---

## Executive Summary

This document defines the pricing validation methodology for the Finance app's Premium tier. It includes competitive pricing benchmarks (refreshed from pre-launch), A/B test design with statistical rigor, price sensitivity analysis framework, and a decision matrix for recommending final pricing. All pricing decisions require human sign-off before implementation.

**Key insight:** The optimal price maximizes _revenue per paywall view_ (RPV), not conversion rate. A higher price with lower conversion can yield more revenue than a lower price with higher conversion.

---

## 1. Competitive Pricing Benchmark (Refreshed)

### 1.1 Direct Competitor Pricing

| Competitor              | Monthly | Annual  | Annual Savings | Free Tier                 | Key Value Prop                         | Last Verified |
| ----------------------- | ------- | ------- | -------------- | ------------------------- | -------------------------------------- | ------------- |
| **YNAB**                | $14.99  | $109.99 | 39%            | ❌ None (34-day trial)    | Envelope budgeting methodology         | 2025-07       |
| **Monarch Money**       | $9.99   | $99.99  | 17%            | ❌ None (7-day trial)     | AI categorization, bank connections    | 2025-07       |
| **Copilot**             | $14.99  | $89.99  | 50%            | ❌ None (trial available) | Beautiful iOS design                   | 2025-07       |
| **Goodbudget**          | $10.00  | $80.00  | 33%            | ✅ Limited free           | Envelope budgeting, shared             | 2025-07       |
| **PocketGuard**         | $7.99   | $34.99  | 64%            | ✅ Limited free           | Bill negotiation, net worth            | 2025-07       |
| **Simplifi by Quicken** | $5.99   | $47.99  | 33%            | ❌ None (30-day trial)    | Spending plan, watchlists              | 2025-07       |
| **Finance (us)**        | $4.99   | $39.99  | 33%            | ✅ Genuine free           | Privacy-first, offline, multi-platform | —             |

### 1.2 Pricing Positioning Map

```
                        PRICE (Monthly)
            $3     $5     $8     $10    $15
            │      │      │      │      │
No Free     │      │      │      │ Monarch│ YNAB, Copilot
Tier        │      │      │      │      │
            │      │      │      │      │
            │      │      │      │      │
Free Tier   │    Finance │ PocketGuard  │ Goodbudget
Available   │   ($4.99)  │      │      │
            │      │      │      │      │
            │      │      │      │      │
Full Free   │      │      │      │      │
(ad-support)│ Credit Karma (free)       │
            └──────┴──────┴──────┴──────┘

POSITIONING: Finance is the MOST AFFORDABLE premium option among
             apps with a genuine free tier.
```

### 1.3 Price-Value Competitive Analysis

| Feature               | Finance ($4.99)   | YNAB ($14.99)     | Monarch ($9.99)   | Copilot ($14.99)  |
| --------------------- | ----------------- | ----------------- | ----------------- | ----------------- |
| Multi-platform (4+)   | ✅                | ✅ (Web+Mobile)   | ✅ (Web+Mobile)   | ❌ (iOS only)     |
| Offline-first         | ✅                | ❌                | ❌                | ❌                |
| Bank connections      | ❌ (Planned)      | ✅                | ✅                | ✅                |
| No ads                | ✅                | ✅                | ✅                | ✅                |
| Open source           | ✅                | ❌                | ❌                | ❌                |
| Household sharing     | ✅ (Premium)      | ✅                | ✅                | ❌                |
| AI features           | 🟡 (Coming)       | ❌                | ✅                | 🟡                |
| Data export           | ✅ (Premium)      | ✅                | ✅                | ✅                |
| **Price per feature** | **$0.71/feature** | **$2.50/feature** | **$1.43/feature** | **$3.00/feature** |

**Takeaway:** At $4.99/mo, Finance offers the highest feature-per-dollar value. The lack of bank connections is the primary feature gap vs. competitors priced 2-3× higher.

---

## 2. A/B Test Design

### 2.1 Test Variants

| Variant         | Monthly Price | Annual Price | Annual Savings | Effective Monthly (Annual) |
| --------------- | ------------- | ------------ | -------------- | -------------------------- |
| **A (Control)** | $4.99         | $39.99       | 33%            | $3.33                      |
| **B (Mid)**     | $5.99         | $49.99       | 30%            | $4.17                      |
| **C (Low)**     | $3.99         | $29.99       | 37%            | $2.50                      |

### 2.2 Primary Metric: Revenue Per Paywall View (RPV)

```
RPV = (Conversion Rate × Blended Monthly Revenue) per paywall view

Where:
  Blended Monthly Revenue = (% monthly × monthly_price) + (% annual × annual_price / 12)

Example calculations:
  Variant A: 12% conv × (50% × $4.99 + 50% × $3.33) = 12% × $4.16 = $0.50 RPV
  Variant B: 9% conv × (50% × $5.99 + 50% × $4.17) = 9% × $5.08 = $0.46 RPV
  Variant C: 16% conv × (50% × $3.99 + 50% × $2.50) = 16% × $3.25 = $0.52 RPV
```

### 2.3 Secondary Metrics

| Metric                        | Why It Matters                                               |
| ----------------------------- | ------------------------------------------------------------ |
| **Trial start rate**          | Higher price may discourage trials even though trial is free |
| **Annual plan selection %**   | Different savings rates affect annual vs. monthly split      |
| **Time to conversion**        | Do users at higher prices take longer to decide?             |
| **Post-conversion D30 churn** | Do lower-price subscribers churn faster (less committed)?    |
| **LTV at 6 months**           | True revenue impact (not just initial conversion)            |

### 2.4 Statistical Methodology

```
Test Parameters:
  - Type: Multi-variant A/B/C test
  - Allocation: 33/33/33 random by user (deterministic hash for consistency)
  - Primary metric: Revenue Per Paywall View (RPV)
  - Significance level: α = 0.05 (95% confidence)
  - Power: 1 - β = 0.80 (80% power)
  - Minimum Detectable Effect: 20% relative change in RPV

Sample Size Calculation:
  For continuous metric (RPV) with expected variance:
  n ≈ 16σ² / δ²  (per variant, for 80% power)

  Estimated σ (RPV std dev) ≈ $0.80 (high variance due to most views = $0)
  Desired δ (MDE) = 20% × $0.50 = $0.10

  n ≈ 16 × 0.64 / 0.01 ≈ 1,024 paywall views per variant

  Total required: 3,072 paywall views
  At estimated 30-50 views/day: 60-100 days

  Practical adjustment: If traffic is low, extend test OR use Bayesian analysis

Statistical Test:
  - ANOVA for RPV comparison across 3 variants
  - Post-hoc: Tukey HSD for pairwise comparisons
  - Also run: Mann-Whitney U (non-parametric) as robustness check
  - Report: Point estimates, 95% CI, p-values, effect sizes (Cohen's d)

Decision Rule:
  1. If one variant significantly outperforms others (p < 0.05 AND practical significance):
     → Recommend winner (pending human sign-off)
  2. If no significant difference:
     → Maintain current pricing (Variant A); retest after feature additions
  3. If results are directional but not significant:
     → Extend test duration or increase traffic; do NOT make pricing changes
```

### 2.5 Test Integrity Requirements

| Requirement                | Implementation                                              | Why                                      |
| -------------------------- | ----------------------------------------------------------- | ---------------------------------------- |
| **Consistent assignment**  | User sees same variant forever (hash-based)                 | Prevent confusion from price changes     |
| **No variant switching**   | Once assigned, user stays in variant even if they reinstall | Avoid selection bias                     |
| **Exclude early adopters** | Users who subscribed before A/B test excluded               | They already converted at original price |
| **Minimum exposure time**  | User must have been in variant for ≥7 days before counting  | Allow for consideration time             |
| **Geographic consistency** | Same test across all regions (initially)                    | Regional pricing tested separately later |
| **Platform consistency**   | Same variant shown on all platforms for same user           | Cross-platform consistency               |

---

## 3. Price Sensitivity Analysis

### 3.1 Van Westendorp Price Sensitivity Meter

**Survey methodology** (supplement A/B test with user research):

```
Four questions asked to a sample of active free users:

Q1: "At what monthly price would you consider Finance Premium too expensive?"
    → "Too expensive" curve

Q2: "At what monthly price would you consider Finance Premium a bargain?"
    → "Bargain" curve

Q3: "At what monthly price would you start to think Finance Premium is getting expensive,
     but you might still consider it?"
    → "Expensive" curve

Q4: "At what monthly price would you think Finance Premium is so cheap that
     you'd question its quality?"
    → "Too cheap" curve

Intersection Analysis:
  - Point of Marginal Cheapness (PMC): Q4 ∩ Q3
  - Point of Marginal Expensiveness (PME): Q1 ∩ Q2
  - Indifference Price Point (IPP): Q3 ∩ Q2
  - Optimal Pricing Point (OPP): Q1 ∩ Q4

Expected range for Finance: OPP between $3.99 and $6.99
```

### 3.2 Demand Curve Modeling

```
Price-Demand Model (from A/B test data):

Conversion Rate = f(Price)

Expected shape (exponential decay):
  Conv(P) = a × e^(-b × P)

Where:
  P = monthly price
  a = maximum conversion rate (at price → $0)
  b = price sensitivity coefficient

Data points to fit:
  P = $3.99 → Conv = C₁%
  P = $4.99 → Conv = C₂%
  P = $5.99 → Conv = C₃%

Revenue optimization:
  Revenue(P) = Conv(P) × P × MAU_free
  dRevenue/dP = 0 → Optimal price P*

Visualization:

  Conv%│  ●
   20 │    ●
   15 │      ●
   10 │        ●
    5 │          ●
      └────┼────┼────┼────► Price
          $3   $5   $7
```

### 3.3 Annual vs. Monthly Preference Analysis

| Annual Discount           | Expected Annual Plan % | Revenue Implication                                      |
| ------------------------- | ---------------------- | -------------------------------------------------------- |
| 15% ($50.99/yr)           | 30-35% choose annual   | Higher per-user revenue, but fewer annual plans          |
| 25% ($44.99/yr)           | 40-45% choose annual   | Moderate sweet spot                                      |
| 33% ($39.99/yr — current) | 50-55% choose annual   | Good annual adoption; industry standard discount         |
| 40% ($35.99/yr)           | 60-65% choose annual   | More annual, but giving up revenue                       |
| 50% ($29.99/yr)           | 70-75% choose annual   | Heavy annual adoption; significantly lower total revenue |

**Key analysis:** Annual plans reduce churn (annual users churn at ~50% the rate of monthly) but at lower revenue per user. Optimal discount maximizes _Annual Revenue per User_ considering churn:

```
Annual Revenue per User (ARU):

Monthly plan:  $4.99/mo × (1 - monthly_churn_rate)^12
  At 5% churn: $4.99 × (0.95)^12 = $4.99 × 0.54 ≈ $2.69/mo effective = $32.30/yr

Annual plan:   $39.99/yr × renewal_probability
  At 75% annual renewal: $39.99 × 0.75 = $30.00/yr effective

Result: Annual plan users generate LESS Year 1 revenue but MORE Year 2+ revenue
  (because annual renewal rate of 75% > implied monthly retention of 54%)

Year 2:
  Monthly: $4.99 × (0.95)^24 = $4.99 × 0.29 ≈ $1.45/mo effective
  Annual: $39.99 × 0.75 × 0.80 = $24.00 Year 2 effective

Conclusion: Annual plan is better for LTV. Optimize for annual plan adoption.
```

---

## 4. Regional Pricing Considerations

### 4.1 PPP-Adjusted Pricing Framework

| Market     | PPP Factor | Suggested Monthly | Suggested Annual | Rationale                                     |
| ---------- | ---------- | ----------------- | ---------------- | --------------------------------------------- |
| **US**     | 1.0×       | $4.99             | $39.99           | Base pricing                                  |
| **UK**     | 0.9×       | £3.99             | £34.99           | Similar purchasing power; round to .99        |
| **Canada** | 0.95×      | C$5.99            | C$49.99          | CAD → USD conversion roughly offsets PPP      |
| **EU**     | 0.85×      | €4.49             | €37.99           | GDPR compliance costs offset by lower pricing |
| **Brazil** | 0.40×      | R$9.99            | R$79.99          | Significant PPP discount; large market        |
| **India**  | 0.25×      | ₹149              | ₹999             | Very low PPP; price for scale                 |
| **Japan**  | 0.75×      | ¥600              | ¥4,800           | Mid-range PPP; round to cultural norms        |

**Note:** Regional pricing requires app store configuration and human approval. This analysis is directional — final prices should account for local competitor pricing and store-specific pricing tiers.

---

## 5. Pricing Decision Framework

### 5.1 Decision Matrix

```
IF A/B test shows clear winner (p < 0.05):
  │
  ├── Winner = Variant A ($4.99):
  │   → Maintain current pricing. No change needed.
  │   → Focus optimization on paywall conversion, not price.
  │
  ├── Winner = Variant B ($5.99):
  │   → Price increase justified by data.
  │   → ⚠️ REQUIRES HUMAN SIGN-OFF before implementation.
  │   → Grandfather existing subscribers at $4.99 for 6 months.
  │   → Communicate price change transparently.
  │
  └── Winner = Variant C ($3.99):
      → Price decrease justified by data (higher volume × lower price = more revenue).
      → ⚠️ REQUIRES HUMAN SIGN-OFF — price decreases are easier to implement but hard to reverse.
      → Consider: Is the conversion lift sustainable, or just novelty?
      → Retest after 30 days to confirm.

IF A/B test is inconclusive:
  │
  ├── Maintain current pricing ($4.99).
  ├── Increase paywall traffic (more gate triggers, better feature gating).
  └── Retest in Sprint 9 with larger sample.
```

### 5.2 Pricing Change Communication Principles

1. **Transparency:** Email existing subscribers about any pricing changes 30+ days in advance
2. **Grandfathering:** Existing subscribers keep current price for at least 1 renewal cycle
3. **Rationale:** Explain what value justifies the new price (new features, not just "costs went up")
4. **No bait-and-switch:** Trial users see the price they'll pay; no surprise increases post-trial
5. **Honesty about sustainability:** If raising prices, frame as "sustainable pricing to keep building"

---

## 6. Revenue Sensitivity Analysis

### 6.1 Revenue Impact by Price Point (Year 1, 5K MAU)

| Price Point    | Est. Conv Rate | Monthly Subs | Annual Subs | Monthly MRR | Year 1 Revenue |
| -------------- | -------------- | ------------ | ----------- | ----------- | -------------- |
| $3.99 / $29.99 | 6.5%           | 163          | 163         | $1,061      | $10,880        |
| $4.99 / $39.99 | 5.0%           | 125          | 125         | $1,040      | $10,673        |
| $5.99 / $49.99 | 3.8%           | 95           | 95          | $988        | $10,009        |
| $6.99 / $54.99 | 3.0%           | 75           | 75          | $943        | $9,425         |
| $7.99 / $64.99 | 2.3%           | 58           | 58          | $870        | $8,553         |

**Note:** Assumes 50/50 monthly/annual split, 5% monthly churn, and steady 5K free MAU. Revenue includes cumulative subscriber additions month-over-month.

### 6.2 Sensitivity to Key Assumptions

| Variable        | -20%  | Base  | +20%  | Revenue Impact |
| --------------- | ----- | ----- | ----- | -------------- |
| Conversion rate | 4.0%  | 5.0%  | 6.0%  | ±$2,100/yr     |
| Monthly churn   | 4.0%  | 5.0%  | 6.0%  | ±$1,300/yr     |
| Free MAU        | 4,000 | 5,000 | 6,000 | ±$2,100/yr     |
| Annual plan %   | 40%   | 50%   | 60%   | ±$400/yr       |

**Most sensitive to:** Free MAU (growth) and conversion rate — these are the highest-leverage levers.

---

## 7. Success Criteria

- [ ] Competitor pricing refreshed and verified (with dates and sources)
- [ ] A/B test designed with statistically valid sample sizes and methodology
- [ ] RPV (Revenue Per Paywall View) defined as primary metric (not just conversion rate)
- [ ] Price sensitivity analysis framework ready (Van Westendorp + demand curve)
- [ ] Annual vs. monthly preference modeled with LTV implications
- [ ] Regional pricing framework developed for top 5 international markets
- [ ] Revenue sensitivity analysis completed with ±20% scenario modeling
- [ ] All pricing changes flagged as requiring human sign-off
- [ ] Decision framework documented: clear rules for when to change pricing
- [ ] Test integrity requirements defined (no variant switching, consistent assignment)

---

_⚠️ HUMAN APPROVAL REQUIRED: No pricing changes will be implemented based on this analysis without explicit sign-off from the product owner. This document provides analysis and recommendations only._
