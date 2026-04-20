# Revenue Model Validation & MRR Forecasting

> **Issue:** #824
> **Sprint:** 7 — "Monetize"
> **Priority:** P1 — High
> **Created:** 2025-07-27
> **Owner:** Business Analyst
> **Status:** Draft — Requires 2+ weeks of Premium subscription data
> **Depends on:** #822 (Conversion Tracking), #823 (Pricing Validation)

---

## Executive Summary

This document validates pre-launch revenue assumptions against actual post-launch data, recalibrates unit economics with real conversion and churn metrics, and produces 6-month MRR/ARR forecasts across three scenarios. It includes app store fee modeling, infrastructure cost analysis, and break-even calculations. All projections are directional estimates, not commitments.

**Core question:** Is our business model sustainable? At what scale do we reach profitability?

---

## 1. Pre-Launch Assumptions vs. Actuals

### 1.1 Assumption Tracking

| Assumption                  | Pre-Launch Estimate | Actual (4 weeks) | Variance | Action     |
| --------------------------- | ------------------- | ---------------- | -------- | ---------- |
| Free MAU (Month 1)          | 2,000               | —                | —        | —          |
| Install-to-register rate    | 60%                 | —                | —        | —          |
| Activation rate (7-day)     | 35%                 | —                | —        | —          |
| D7 retention                | 22%                 | —                | —        | —          |
| D30 retention               | 13%                 | —                | —        | —          |
| Trial start rate            | 25%                 | —                | —        | —          |
| Trial-to-paid conversion    | 10%                 | —                | —        | —          |
| Overall free-to-paid rate   | 5%                  | —                | —        | —          |
| Monthly churn (subscribers) | 5%                  | —                | —        | —          |
| Monthly/annual split        | 50/50               | —                | —        | —          |
| Monthly price               | $4.99               | $4.99            | 0%       | As planned |
| Annual price                | $39.99              | $39.99           | 0%       | As planned |

**Variance categories:**

- 🟢 Within ±15% of estimate — assumption validated
- 🟡 ±15-30% — assumption needs adjustment
- 🔴 ±30%+ — assumption was wrong; significant model recalibration needed

### 1.2 Lessons Learned

```
For each red/yellow variance, document:
1. What we assumed and why
2. What actually happened
3. Why the variance occurred
4. How to adjust the model
5. Impact on downstream projections
```

---

## 2. Unit Economics Model

### 2.1 Revenue Per Subscriber

```
GROSS Revenue Per Subscriber:
  Monthly plan: $4.99/mo = $59.88/yr
  Annual plan:  $39.99/yr = $3.33/mo

BLENDED Revenue Per Subscriber (assuming 50% annual):
  = (0.50 × $4.99) + (0.50 × $3.33)
  = $2.50 + $1.67
  = $4.16/mo blended ARPU (paying users)

NET Revenue Per Subscriber (after app store fees):
  Year 1 (30% app store cut):
    Monthly: $4.99 × 0.70 = $3.49 net
    Annual:  $39.99 × 0.70 = $28.00 net ($2.33/mo)
    Blended net: $2.91/mo

  Year 2+ (15% via Small Business Program, if <$1M revenue):
    Monthly: $4.99 × 0.85 = $4.24 net
    Annual:  $39.99 × 0.85 = $34.00 net ($2.83/mo)
    Blended net: $3.54/mo

WEB/WINDOWS Revenue (Stripe: 2.9% + $0.30):
  Monthly: $4.99 - ($4.99 × 0.029 + $0.30) = $4.55 net
  Annual:  $39.99 - ($39.99 × 0.029 + $0.30) = $38.53 net ($3.21/mo)
  Blended net: $3.88/mo

NOTE: Web/Windows has significantly better economics than mobile.
```

### 2.2 Platform Economics Comparison

| Platform             | Gross ARPU | Fee   | Net ARPU | Fee Type       | Year 2 Rate |
| -------------------- | ---------- | ----- | -------- | -------------- | ----------- |
| iOS (App Store)      | $4.16      | 30%   | $2.91    | Apple IAP      | 15%         |
| Android (Play Store) | $4.16      | 30%\* | $2.91    | Google Billing | 15%         |
| Web (Stripe)         | $4.16      | ~5.9% | $3.88    | Stripe         | Same        |
| Windows (MS Store)   | $4.16      | 15%   | $3.54    | MS Store       | 15%         |

\*Google Play: 15% for first $1M in qualifying revenue under Reduced Fee Program

**Strategic implication:** Web subscribers are ~33% more valuable than mobile subscribers (Year 1). Consider incentivizing web subscription.

### 2.3 Lifetime Value (LTV) Calculation

```
LTV = ARPU_net × Average Subscriber Lifetime (months)

Average Subscriber Lifetime = 1 / Monthly Churn Rate

Scenarios:
  Pessimistic (8% monthly churn):
    Lifetime = 1 / 0.08 = 12.5 months
    LTV = $2.91 × 12.5 = $36.38 (mobile Year 1)
    LTV = $3.88 × 12.5 = $48.50 (web)

  Base (5% monthly churn):
    Lifetime = 1 / 0.05 = 20 months
    LTV = $2.91 × 20 = $58.20 (mobile Year 1)
    LTV = $3.88 × 20 = $77.60 (web)

  Optimistic (3% monthly churn):
    Lifetime = 1 / 0.03 = 33.3 months
    LTV = $2.91 × 33.3 = $96.90 (mobile Year 1)
    LTV = $3.88 × 33.3 = $129.20 (web)

Blended LTV (weighted by expected platform mix: 60% mobile, 30% web, 10% desktop):
  Base scenario: 0.60 × $58.20 + 0.30 × $77.60 + 0.10 × $70.80 = $65.28
```

### 2.4 Customer Acquisition Cost (CAC) Model

```
CAC by Channel:

  Organic (App Store/Play Store search):
    CAC = $0 (direct costs) + amortized ASO effort
    Estimated effective CAC: $0.50-$1.00

  Content Marketing (blog, social media):
    CAC = Content creation time ÷ attributed signups
    Estimated: $2.00-$5.00

  Referral:
    CAC = Incentive cost (if any) per referred signup
    Estimated: $1.00-$3.00 (if offering premium trial as incentive)

  Paid Acquisition (if used):
    Finance app CPI (cost per install): $2.50-$8.00 (industry average)
    Finance app CPA (cost per subscriber): $15-$40
    WARNING: At $4.99/mo pricing, paid acquisition ROI is challenging

Blended CAC (organic-dominated):
  Estimated: $1.00-$2.00 initially (heavy organic)

LTV:CAC Ratio (target ≥3:1):
  Base scenario: $65.28 / $1.50 = 43.5:1  ← Very healthy for organic-dominated
  With paid acquisition: $65.28 / $20.00 = 3.3:1  ← Marginal

CONCLUSION: Unit economics are strong as long as acquisition remains primarily organic.
            Paid acquisition must be used surgically (retargeting, brand) not broadly.
```

### 2.5 Payback Period

```
Payback Period = CAC / Monthly Net Revenue per Subscriber

Organic subscriber:
  $1.50 / $2.91 = 0.5 months  ← Recovers CAC in first month

Paid acquisition subscriber:
  $20.00 / $2.91 = 6.9 months  ← Recovers CAC in ~7 months

Target: Payback period < 6 months for all channels
```

---

## 3. MRR Forecast Model

### 3.1 MRR Growth Formula

```
MRR(t+1) = MRR(t) + New MRR - Churned MRR + Expansion MRR

Where:
  New MRR = New subscribers in month × Blended ARPU_net
  Churned MRR = MRR(t) × Monthly churn rate
  Expansion MRR = Monthly→Annual upgrades × price differential (usually 0 or small)

Net New MRR = New MRR - Churned MRR + Expansion MRR
```

### 3.2 Scenario Definitions

| Parameter               | Conservative | Base  | Optimistic |
| ----------------------- | ------------ | ----- | ---------- |
| Month 1 free MAU        | 1,500        | 3,000 | 5,000      |
| Monthly MAU growth      | 3%           | 5%    | 10%        |
| Free-to-trial rate      | 2%           | 4%    | 6%         |
| Trial-to-paid rate      | 8%           | 12%   | 16%        |
| Overall conversion rate | 1.6%         | 4.8%  | 9.6%       |
| Monthly churn           | 7%           | 5%    | 3%         |
| Annual plan %           | 40%          | 50%   | 60%        |
| Blended net ARPU        | $2.75        | $3.10 | $3.50      |

### 3.3 6-Month MRR Forecast — Conservative Scenario

```
Month 1:
  Free MAU: 1,500
  New subscribers: 1,500 × 1.6% = 24
  New MRR: 24 × $2.75 = $66
  Churned MRR: $0 (first month)
  End MRR: $66

Month 2:
  Free MAU: 1,545 (3% growth)
  New subscribers: 25
  Churned MRR: $66 × 7% = $5
  New MRR: 25 × $2.75 = $69
  End MRR: $66 + $69 - $5 = $130

Month 3: End MRR: $188
Month 4: End MRR: $240
Month 5: End MRR: $287
Month 6: End MRR: $329

6-Month Summary (Conservative):
  Total subscribers: ~105
  MRR: $329
  ARR run-rate: $3,948
  Cumulative revenue: ~$1,240
```

### 3.4 6-Month MRR Forecast — Base Scenario

```
Month 1:
  Free MAU: 3,000
  New subscribers: 3,000 × 4.8% = 144
  New MRR: 144 × $3.10 = $446
  Churned MRR: $0
  End MRR: $446

Month 2:
  Free MAU: 3,150 (5% growth)
  New subscribers: 151
  Churned MRR: $446 × 5% = $22
  New MRR: 151 × $3.10 = $468
  End MRR: $892

Month 3: End MRR: $1,305
Month 4: End MRR: $1,688
Month 5: End MRR: $2,042
Month 6: End MRR: $2,370

6-Month Summary (Base):
  Total subscribers: ~695
  MRR: $2,370
  ARR run-rate: $28,440
  Cumulative revenue: ~$8,741
```

### 3.5 6-Month MRR Forecast — Optimistic Scenario

```
Month 1:
  Free MAU: 5,000
  New subscribers: 5,000 × 9.6% = 480
  New MRR: 480 × $3.50 = $1,680
  Churned MRR: $0
  End MRR: $1,680

Month 2:
  Free MAU: 5,500 (10% growth)
  New subscribers: 528
  Churned MRR: $1,680 × 3% = $50
  New MRR: 528 × $3.50 = $1,848
  End MRR: $3,478

Month 3: End MRR: $5,152
Month 4: End MRR: $6,719
Month 5: End MRR: $8,193
Month 6: End MRR: $9,585

6-Month Summary (Optimistic):
  Total subscribers: ~2,507
  MRR: $9,585
  ARR run-rate: $115,020
  Cumulative revenue: ~$34,807
```

### 3.6 Forecast Comparison Summary

| Metric                      | Conservative | Base    | Optimistic |
| --------------------------- | ------------ | ------- | ---------- |
| Month 6 MRR                 | $329         | $2,370  | $9,585     |
| Month 6 ARR run-rate        | $3,948       | $28,440 | $115,020   |
| Total subscribers (Month 6) | ~105         | ~695    | ~2,507     |
| Cumulative revenue          | ~$1,240      | ~$8,741 | ~$34,807   |
| Net revenue (after fees)    | ~$868        | ~$6,119 | ~$24,365   |

```
MRR Trend Comparison (6 Months):

$10K│                                              ● Optimistic
    │                                         ●
$8K │                                    ●
    │                               ●
$6K │                          ●
    │                     ●
$4K │                ●
    │           ●
$2K │      ●                                       ● Base
    │ ●           ● ● ● ● ● ● ● ● ● ●
$0K │ ● ● ● ● ● ● ● ● ● ● ● ● ● ● ●             ● Conservative
    └──────────────────────────────────────────────
     M1   M2   M3   M4   M5   M6
```

---

## 4. App Store Economics Deep Dive

### 4.1 Fee Structure Summary

| Store             | Year 1 Fee      | Year 2+ Fee (Small Business)    | Eligibility                     | Application           |
| ----------------- | --------------- | ------------------------------- | ------------------------------- | --------------------- |
| Apple App Store   | 30%             | 15% (< $1M revenue)             | Auto-enroll if < $1M prior year | Must apply annually   |
| Google Play Store | 15% (first $1M) | 15% (first $1M), 30% thereafter | Automatic                       | Per developer account |
| Microsoft Store   | 15%             | 15%                             | Standard for all developers     | Automatic             |
| Stripe (Web)      | 2.9% + $0.30    | Same                            | N/A                             | Per transaction       |

### 4.2 Revenue Scenarios After Store Fees

| Scenario     | Gross Revenue (6-mo) | Store Fees | Net Revenue | Effective Fee Rate |
| ------------ | -------------------- | ---------- | ----------- | ------------------ |
| Conservative | $1,240               | $372       | $868        | 30%                |
| Base         | $8,741               | $2,622     | $6,119      | 30%                |
| Optimistic   | $34,807              | $10,442    | $24,365     | 30%                |

**Year 2 improvement:** If we qualify for reduced rates (< $1M), effective fee rate drops to ~18% blended (some platforms at 15%, web at ~6%).

### 4.3 Platform Revenue Mix Optimization

```
If we can shift 10% of subscribers from mobile → web:
  Current (60/30/10 mobile/web/desktop): $2.91 × 0.60 + $3.88 × 0.30 + $3.54 × 0.10 = $3.26 blended net
  Shifted (50/40/10):                    $2.91 × 0.50 + $3.88 × 0.40 + $3.54 × 0.10 = $3.36 blended net

  Impact: +$0.10/subscriber/month
  At 695 subscribers (base): +$69.50/mo = +$834/yr additional net revenue

Strategy: Encourage web subscription with prominent web pricing page,
         "Subscribe on web for best value" messaging (if permitted by app stores).

⚠️ WARNING: Apple and Google TOS may prohibit directing users to subscribe outside the app.
           Consult legal before implementing any web-subscription promotion strategy.
```

---

## 5. Infrastructure Cost Model

### 5.1 Monthly Infrastructure Costs

| Service                 | Free Tier                  | Cost at 5K MAU  | Cost at 50K MAU   | Notes                            |
| ----------------------- | -------------------------- | --------------- | ----------------- | -------------------------------- |
| Supabase (backend)      | Free (500MB, 50K requests) | $25/mo (Pro)    | $75/mo (Pro+)     | Database + Auth + Edge Functions |
| RevenueCat              | Free (< $2.5K MTR)         | Free            | $0.01/user/mo     | Free until meaningful revenue    |
| PostHog (analytics)     | Self-hosted (free)         | ~$15/mo (infra) | ~$50/mo (infra)   | Docker on small VPS              |
| Sentry (error tracking) | Free (5K events)           | $26/mo (Team)   | $80/mo (Business) | Crash + performance monitoring   |
| Domain + CDN            | ~$15/mo                    | ~$20/mo         | ~$40/mo           | Cloudflare + domain registration |
| Email (transactional)   | Free (< 100/day)           | ~$10/mo         | ~$30/mo           | SendGrid or Postmark             |
| **Total**               | **~$15/mo**                | **~$96/mo**     | **~$275/mo**      | —                                |

### 5.2 Cost Per User

| MAU     | Monthly Infra Cost | Cost Per User | Revenue Per User (Base) | Margin |
| ------- | ------------------ | ------------- | ----------------------- | ------ |
| 1,000   | ~$60               | $0.060        | $0.15                   | 60%    |
| 5,000   | ~$96               | $0.019        | $0.15                   | 87%    |
| 10,000  | ~$130              | $0.013        | $0.15                   | 91%    |
| 50,000  | ~$275              | $0.006        | $0.15                   | 96%    |
| 100,000 | ~$500              | $0.005        | $0.15                   | 97%    |

**Key insight:** Infrastructure costs scale sub-linearly due to our edge-first architecture. Most computation happens on client devices, not our servers. This is a massive cost advantage vs. competitors relying on server-side processing.

### 5.3 Break-Even Analysis

```
Break-Even Point: Monthly Revenue ≥ Monthly Costs

Monthly Costs:
  Infrastructure: ~$96 (at 5K MAU)
  Developer tools: ~$50 (GitHub, CI/CD)
  Misc: ~$25 (email, DNS, certificates)
  Total fixed: ~$171/mo

  Variable: ~$0.01/user/mo (at scale)

Break-Even MRR: $171/mo
Break-Even subscribers: $171 / $3.10 (net ARPU) = 55 subscribers

Conservative scenario reaches break-even: Month 3 (MRR $188)
Base scenario reaches break-even: Month 1 (MRR $446)
Optimistic scenario: Already profitable Month 1

NOTE: This excludes developer salaries/time, which is the primary cost.
      Including 1 developer at $8K/mo part-time: break-even at $8,171/mo MRR = ~2,636 subscribers.
```

---

## 6. Risk Analysis

### 6.1 Revenue Risk Matrix

| Risk                                | Probability | Impact    | Mitigation                                                   |
| ----------------------------------- | ----------- | --------- | ------------------------------------------------------------ |
| Conversion rate < 2%                | Medium      | High      | Optimize paywall, add features, test pricing                 |
| Churn rate > 8% monthly             | Medium      | High      | Retention interventions from Sprint 6 analysis               |
| Free MAU growth stalls              | Medium      | Medium    | Content marketing, ASO optimization, referral program        |
| App store rejection of IAP          | Low         | Very High | Follow guidelines precisely; pre-submit for review           |
| Competitor undercuts pricing        | Low         | Medium    | Differentiate on value (privacy, offline), not price         |
| Payment failure (involuntary churn) | Medium      | Medium    | Grace period, retry logic (RevenueCat handles automatically) |

### 6.2 Sensitivity to Key Variables

```
Tornado Chart: Impact of ±20% change on Month 6 MRR (Base scenario)

Free MAU growth:     |████████████████████████| ±$474   ← Highest leverage
Conversion rate:     |██████████████████████  | ±$394
Monthly churn:       |█████████████████       | ±$302
ARPU:                |███████████             | ±$237
Annual plan %:       |████                    | ±$95    ← Lowest leverage

Priority for optimization:
1. Grow free MAU (content, ASO, virality)
2. Improve conversion (paywall, features, onboarding)
3. Reduce churn (retention, value delivery)
4. Optimize ARPU (pricing, plan mix)
```

---

## 7. Key Financial Metrics Dashboard

### 7.1 Monthly Revenue Report Template

```
FINANCE APP — MONTHLY REVENUE REPORT
Month: [MONTH YEAR]

┌─────────────────────────────────────────────┐
│ MRR: $X,XXX  │  ▲/▼ X% MoM  │  ARR: $XX,XXX │
├─────────────────────────────────────────────┤
│ NEW MRR        │ CHURNED MRR    │ NET NEW MRR  │
│ $XXX (+XX subs)│ $XXX (-XX subs)│ +/- $XXX     │
├─────────────────────────────────────────────┤
│ SUBSCRIBERS    │ CHURN RATE     │ LTV:CAC      │
│ XXX total      │ X.X% monthly   │ XX.X:1       │
├─────────────────────────────────────────────┤
│ PLAN MIX       │ PLATFORM MIX   │ TRIAL CONV   │
│ XX% annual     │ XX% iOS        │ XX% trial→paid│
│ XX% monthly    │ XX% Android    │              │
│                │ XX% Web        │              │
│                │ XX% Windows    │              │
└─────────────────────────────────────────────┘

UNIT ECONOMICS:
  Gross ARPU:     $X.XX/mo
  Net ARPU:       $X.XX/mo (after store fees)
  LTV:            $XX.XX
  CAC:            $X.XX
  LTV:CAC:        XX.X:1
  Payback period: X.X months

PROJECTIONS (next 3 months):
  Conservative: $X,XXX MRR by Month+3
  Base:         $X,XXX MRR by Month+3
  Optimistic:   $X,XXX MRR by Month+3
```

---

## 8. Success Criteria

- [ ] All pre-launch assumptions documented alongside actuals with variance analysis
- [ ] App store fee structures accurately modeled (30% Year 1, 15% Year 2 eligible programs)
- [ ] LTV uses actual or estimated churn — not assumed; sensitivity range included if data insufficient
- [ ] Three forecast scenarios produced (Conservative, Base, Optimistic) with clearly stated assumptions
- [ ] Infrastructure costs included with per-user economics at multiple scale points
- [ ] Break-even point calculated (excluding and including developer costs)
- [ ] Revenue projections clearly labeled as "directional estimates, not commitments"
- [ ] Platform economics compared (iOS vs. Android vs. Web vs. Windows net revenue)
- [ ] Monthly revenue report template ready for ongoing use
- [ ] Risk analysis with mitigation strategies for top 5 revenue risks

---

_⚠️ IMPORTANT: All revenue projections in this document are directional estimates based on industry benchmarks and modeled assumptions. Actual results will vary. This document will be updated monthly as real data accumulates. No business commitments should be made based solely on these projections._
