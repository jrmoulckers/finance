# Growth Metrics & Acquisition Channel Analysis

> **Issue:** #827
> **Sprint:** 8 — "Expand"
> **Priority:** P1 — High
> **Created:** 2025-07-27
> **Owner:** Business Analyst
> **Status:** Draft — Framework ready, requires 6+ weeks of post-launch data
> **Depends on:** #818 (KPI Dashboard), #824 (Revenue Model)

---

## Executive Summary

This document defines the growth analytics framework for the Finance app, analyzing acquisition channels by quality (not just volume), modeling viral coefficients, projecting growth trajectories, and recommending channel investment priorities. The analysis optimizes for _sustainable organic growth_ — our primary competitive advantage is a zero-CAC acquisition model that makes $4.99/mo pricing viable.

**Key principle:** A user acquired for free who retains well is worth infinitely more than an expensive user who churns. Channel quality > channel volume.

---

## 1. Acquisition Channel Taxonomy

### 1.1 Channel Definitions

| Channel                  | Definition                                                  | Tracking Method                       | CAC                     |
| ------------------------ | ----------------------------------------------------------- | ------------------------------------- | ----------------------- |
| **Organic Search (ASO)** | User found app via App Store/Play Store search              | Store analytics keyword data          | $0 direct               |
| **Brand Search**         | User searched for "Finance" or app name directly            | Store analytics brand keyword         | $0 direct               |
| **Content Marketing**    | User came from blog post, tutorial, or social media content | UTM parameters on web → app deep link | $0-2 per attribution    |
| **Reddit / HN / Forums** | User came from community discussion or post                 | UTM tracking + referral analysis      | $0 direct               |
| **Product Hunt**         | User came from Product Hunt launch                          | UTM + launch day cohort               | $0 direct (spike event) |
| **Word of Mouth**        | User referred by existing user (no formal program)          | Self-reported attribution survey      | $0                      |
| **Referral Program**     | User came through formal referral link                      | Referral code tracking                | Cost of incentive       |
| **Press/Media**          | User came from a press article or review                    | UTM + spike correlation               | $0-500 (PR costs)       |
| **Paid Acquisition**     | User acquired via paid ads (App Store Ads, Google Ads)      | Ad platform attribution               | $2.50-8.00 CPI          |
| **Cross-promotion**      | User came from another app/service partnership              | Partner referral tracking             | Revenue share           |

### 1.2 Channel Quality Scoring

```
Channel Quality Score = (LTV per Channel User × 0.35) +
                        (D30 Retention × 0.30) +
                        (Premium Conversion Rate × 0.25) +
                        (1 / CAC × 0.10)

Scale: Each factor normalized 0-10 relative to best-performing channel

Best channel: Highest quality score at acceptable volume
```

---

## 2. Channel Performance Analysis

### 2.1 Channel Performance Template

| Channel           | Volume (Users/Mo) | % of Total | CAC | D7 Retention | D30 Retention | Premium Conv % | LTV (est.) | Quality Score |
| ----------------- | ----------------- | ---------- | --- | ------------ | ------------- | -------------- | ---------- | ------------- |
| Organic ASO       | —                 | —          | $0  | —            | —             | —              | —          | —             |
| Brand Search      | —                 | —          | $0  | —            | —             | —              | —          | —             |
| Content Marketing | —                 | —          | —   | —            | —             | —              | —          | —             |
| Reddit/HN/Forums  | —                 | —          | $0  | —            | —             | —              | —          | —             |
| Product Hunt      | —                 | —          | $0  | —            | —             | —              | —          | —             |
| Word of Mouth     | —                 | —          | $0  | —            | —             | —              | —          | —             |
| Press/Media       | —                 | —          | —   | —            | —             | —              | —          | —             |
| Paid Acquisition  | —                 | —          | —   | —            | —             | —              | —          | —             |

### 2.2 Channel Expectations (Pre-Data)

| Channel               | Expected Quality | Expected Volume       | Rationale                                              |
| --------------------- | ---------------- | --------------------- | ------------------------------------------------------ |
| **Organic ASO**       | ★★★★☆ High       | Medium-High           | Intentional searchers have need; competitive keywords  |
| **Brand Search**      | ★★★★★ Highest    | Low (growing)         | Users already aware = highest intent                   |
| **Word of Mouth**     | ★★★★★ Highest    | Low                   | Referred users trust the referrer; very high retention |
| **Content Marketing** | ★★★★☆ High       | Low-Medium            | Educated users who found us through content            |
| **Reddit/HN/Forums**  | ★★★☆☆ Medium     | Spiky (event-driven)  | Tech-savvy but may be novelty-seekers                  |
| **Product Hunt**      | ★★★☆☆ Medium     | High (one-time spike) | Launch spike, but many are "app collectors"            |
| **Press/Media**       | ★★★☆☆ Medium     | Spiky                 | Depends on article framing and audience                |
| **Paid Acquisition**  | ★★☆☆☆ Lower      | Controllable          | Volume available but quality varies; expensive         |

---

## 3. Organic Growth Analysis

### 3.1 ASO Performance Framework

```
App Store Optimization (ASO) drives the majority of organic acquisition.
Track these ASO metrics:

  Keyword Rankings:
    - "budget app" — position: #? → target: top 20
    - "expense tracker" — position: #? → target: top 15
    - "finance app" — position: #? → target: top 30
    - "budgeting app free" — position: #? → target: top 10
    - "personal finance" — position: #? → target: top 25
    - "privacy budget" — position: #? (niche keyword, lower competition)
    - "offline budget app" — position: #? (unique differentiator keyword)

  Conversion Rate Optimization (CRO):
    - Store page view → Install rate
    - iOS: typically 25-35% for finance apps
    - Android: typically 20-30% for finance apps
    - Optimize: screenshots, description, ratings

  Keyword-to-Install Attribution:
    - Which keywords drive the most installs?
    - Which keyword-sourced users have highest D30 retention?
    - Focus ASO on high-quality keywords, not just high-volume
```

### 3.2 Organic Growth Health Indicators

| Indicator                   | Healthy Signal | Warning Signal | Critical Signal                    |
| --------------------------- | -------------- | -------------- | ---------------------------------- |
| Organic % of total installs | ≥70%           | 50-70%         | <50% (over-reliant on paid/spikes) |
| Brand search trend          | Growing MoM    | Flat           | Declining                          |
| Organic install trend       | Growing WoW    | Flat           | Declining                          |
| App store rating            | ≥4.5 stars     | 4.0-4.5        | <4.0 (ASO penalty)                 |
| Review volume               | Growing        | Flat           | Declining                          |
| Keyword ranking trend       | Improving      | Stable         | Losing positions                   |

---

## 4. Viral Coefficient Analysis

### 4.1 Viral Coefficient Calculation

```
Viral Coefficient (K-factor):
  K = i × c

Where:
  i = average number of invitations sent per user
  c = conversion rate of invitations (% who install)

Example:
  If average user invites 0.5 people (via sharing, word of mouth)
  And 20% of invitees install the app
  K = 0.5 × 0.20 = 0.10

Interpretation:
  K < 1.0: Sub-viral growth (need external acquisition to grow)
  K = 1.0: Viral equilibrium (each user brings exactly 1 new user)
  K > 1.0: Viral growth (exponential — very rare for finance apps)

Finance app realistic K-factor: 0.05 - 0.20
  (Finance is low-virality category — people don't share financial tools widely)

Revenue implication:
  Effective CAC with virality = Paid CAC / (1 + K + K² + K³ + ...)
                               = Paid CAC / (1 / (1-K)) for K < 1

  At K=0.10: Effective CAC = Paid CAC × 0.90 (10% discount)
  At K=0.20: Effective CAC = Paid CAC × 0.80 (20% discount)
```

### 4.2 Sharing & Referral Tracking

| Sharing Action                     | Tracking             | Volume (est.)      | K-factor Contribution                           |
| ---------------------------------- | -------------------- | ------------------ | ----------------------------------------------- |
| Household sharing invite (Premium) | In-app tracking      | Low (Premium-only) | High quality (partner = very likely to install) |
| "Share with friend" button         | Share sheet tracking | Low-Medium         | Medium quality                                  |
| App store review/rating            | Store data           | Low                | Medium (influences ASO)                         |
| Social media mention               | Social listening     | Unknown            | Low-Medium                                      |
| Blog/article by user               | Referral tracking    | Very Low           | High quality (detailed recommendation)          |
| Screenshot shared                  | Cannot track         | Unknown            | Low                                             |

### 4.3 Referral Program Design (if Implemented)

| Element                | Recommendation                                     | Rationale                                          |
| ---------------------- | -------------------------------------------------- | -------------------------------------------------- |
| **Referrer incentive** | 1 month Premium free                               | Reward without cash cost; drives Premium sampling  |
| **Referee incentive**  | Extended 30-day trial (instead of 14-day)          | More time to see value; higher conversion expected |
| **Sharing method**     | In-app share sheet with unique referral link       | Standard, trackable, multi-channel                 |
| **Double-sided**       | Yes — both parties benefit                         | Industry best practice; doubles participation      |
| **Limit**              | Max 5 referral rewards per user per year           | Prevent gaming; manage costs                       |
| **Tracking**           | Referral code → install → activation → attribution | Full funnel per referral                           |

---

## 5. Growth Model

### 5.1 Growth Formula

```
Users(t+1) = Users(t) + New_Organic + New_Content + New_Referral + New_Paid - Churned

Where:
  New_Organic = f(ASO ranking, store rating, category trends)
  New_Content = f(content velocity, SEO ranking, social engagement)
  New_Referral = Users(t) × viral_coefficient
  New_Paid = Budget / CPI (if paid acquisition active)
  Churned = Users(t) × monthly_churn_rate
```

### 5.2 Growth Projections (6 Months)

#### Scenario A: Organic Only ($0 Marketing Spend)

```
Assumptions:
  - Starting MAU: 3,000 (from Sprint 7)
  - Organic growth rate: 5% WoW initially, decaying to 3% by Month 6
  - Monthly churn: 15% of total users (includes free user attrition)
  - Viral K-factor: 0.10

Month 1: 3,000 → 3,450 (+15% net growth)
Month 2: 3,450 → 3,900 (+13% net growth)
Month 3: 3,900 → 4,330 (+11% net growth)
Month 4: 4,330 → 4,720 (+9% net growth)
Month 5: 4,720 → 5,070 (+7% net growth)
Month 6: 5,070 → 5,370 (+6% net growth)

6-Month Result: ~5,400 MAU (79% growth from baseline)
Revenue impact (at 5% conversion, $3.10 net ARPU): MRR ~$837
```

#### Scenario B: Moderate Content Marketing ($500/month)

```
Assumptions:
  - Starting MAU: 3,000
  - Organic: same as Scenario A
  - Content marketing: 200 additional users/month at $2.50 effective CAC
  - Content users have 10% higher retention (quality traffic)
  - Monthly churn: 14% (slight improvement from better users)

Month 1: 3,000 → 3,650
Month 2: 3,650 → 4,340
Month 3: 4,340 → 5,060
Month 4: 5,060 → 5,800
Month 5: 5,800 → 6,550
Month 6: 6,550 → 7,300

6-Month Result: ~7,300 MAU (143% growth)
Revenue impact: MRR ~$1,132
Additional MRR from content: ~$295 (59% ROI on $500/mo spend)
```

#### Scenario C: Growth Push ($2,000/month, including paid)

```
Assumptions:
  - Starting MAU: 3,000
  - Organic: same as Scenario A
  - Content: $500/mo → 200 users/month
  - Paid acquisition: $1,500/mo → 300 users/month at $5.00 CPI
  - Paid users have 20% lower retention (lower intent)
  - Monthly churn: 16% (blended; paid users churn faster)

Month 1: 3,000 → 3,950
Month 2: 3,950 → 4,990
Month 3: 4,990 → 6,100
Month 4: 6,100 → 7,270
Month 5: 7,270 → 8,480
Month 6: 8,480 → 9,700

6-Month Result: ~9,700 MAU (223% growth)
Revenue impact: MRR ~$1,504
LTV:CAC for paid channel: $65 / $20 = 3.25:1 (marginal but viable)
```

### 5.3 Growth Scenario Comparison

| Metric                                 | Organic Only | Content ($500/mo)  | Growth Push ($2K/mo) |
| -------------------------------------- | ------------ | ------------------ | -------------------- |
| Month 6 MAU                            | 5,400        | 7,300              | 9,700                |
| Total growth                           | 79%          | 143%               | 223%                 |
| Total spend                            | $0           | $3,000             | $12,000              |
| Cost per incremental user (vs organic) | —            | $1.58              | $2.56                |
| Month 6 MRR                            | $837         | $1,132             | $1,504               |
| Incremental MRR (vs organic)           | —            | $295               | $667                 |
| 6-month ROI on spend                   | —            | Positive (Month 8) | Positive (Month 10)  |

**Recommendation:** Content marketing ($500/mo, Scenario B) offers the best ROI. Paid acquisition is viable but should be tested carefully with small budgets first.

---

## 6. Growth Lever Analysis

### 6.1 Growth Lever Framework

| Lever                  | Mechanism                                                  | Expected Impact                             | Cost                     | Timeline           |
| ---------------------- | ---------------------------------------------------------- | ------------------------------------------- | ------------------------ | ------------------ |
| **ASO optimization**   | Improve store listing conversion rate                      | +20-40% organic installs                    | $0 (time only)           | 2-4 weeks          |
| **App store ratings**  | Prompt satisfied users to rate                             | +0.3-0.5 star improvement → +15% conversion | $0                       | Ongoing            |
| **Content marketing**  | Blog, social media, SEO                                    | +200 users/mo at $2.50 CAC                  | $500/mo                  | 1-3 months to ramp |
| **Referral program**   | Incentivize existing user sharing                          | +10-20% organic acquisition                 | $0 (Premium trial cost)  | 4-6 weeks          |
| **Product-led growth** | Features that naturally invite sharing (household, export) | K-factor +0.05-0.10                         | $0 (feature development) | Varies             |
| **PR/press**           | Pitch to finance blogs, tech press                         | Spikes of 500-2000 installs                 | $0-2000                  | Unpredictable      |
| **Localization**       | Enter new markets (UK, Germany)                            | +10-25% of base user growth                 | Translation costs        | 4-8 weeks          |
| **Paid acquisition**   | App Store Ads, Google Ads                                  | Controllable volume                         | $5 CPI                   | Immediate          |

### 6.2 Growth Lever Prioritization

```
Priority = (Expected Impact × 0.40) + (ROI × 0.30) + (Speed to Impact × 0.20) + (Sustainability × 0.10)
```

| Rank | Lever                  | Impact | ROI | Speed | Sustainability | Score   |
| ---- | ---------------------- | ------ | --- | ----- | -------------- | ------- |
| 1    | **ASO optimization**   | 7      | 10  | 8     | 9              | **8.4** |
| 2    | **App store ratings**  | 6      | 10  | 7     | 9              | **7.7** |
| 3    | **Content marketing**  | 7      | 8   | 5     | 8              | **7.1** |
| 4    | **Referral program**   | 5      | 9   | 6     | 8              | **6.8** |
| 5    | **Localization**       | 7      | 7   | 4     | 9              | **6.7** |
| 6    | **Product-led growth** | 6      | 10  | 3     | 10             | **6.6** |
| 7    | **PR/press**           | 6      | 7   | 4     | 3              | **5.2** |
| 8    | **Paid acquisition**   | 8      | 4   | 10    | 5              | **6.5** |

---

## 7. Network Effects & Inflection Points

### 7.1 Network Effect Analysis

```
Finance app network effects are WEAK compared to social apps,
but PRESENT through:

1. Household Sharing (Premium):
   - Each household subscriber effectively locks in 2 users
   - Partner has high switching cost (shared financial context)
   - Household users likely: 10-20% of Premium subscribers

2. Word-of-Mouth (Social Proof):
   - As user count grows, social proof increases
   - More app store reviews → higher ranking → more organic installs
   - Inflection: ~1,000 reviews triggers meaningful ASO benefit

3. Content Network Effect:
   - More users → more questions/answers in forums
   - More blog content referencing the app
   - User-generated templates, tips, strategies

4. Data Network Effect (FUTURE — if AI features use aggregate data):
   - More users → better spending category predictions
   - More data → better budget recommendations
   - NOTE: Must respect privacy — only aggregate, anonymized patterns
```

### 7.2 Growth Inflection Points

| Milestone                 | Expected Effect                                                    | Target Timeline |
| ------------------------- | ------------------------------------------------------------------ | --------------- |
| **100 app store reviews** | ASO visibility improvement (minimum credibility threshold)         | Month 2-3       |
| **500 app store reviews** | Category ranking boost; "social proof" unlocked                    | Month 4-6       |
| **1,000 MAU**             | Enough data for meaningful analytics; community formation possible | Month 1         |
| **5,000 MAU**             | Content network effects begin; referral program viable             | Month 4-6       |
| **10,000 MAU**            | PR/press interest increases; partnership opportunities emerge      | Month 6-12      |
| **50,000 MAU**            | Platform status; app store featuring consideration                 | Year 2          |

---

## 8. Acquisition Channel Budget Recommendations

### 8.1 Budget Allocation by Growth Stage

| Stage                | MAU      | Monthly Budget | Allocation                                                    |
| -------------------- | -------- | -------------- | ------------------------------------------------------------- |
| **Early (0-5K MAU)** | 0-5K     | $0-500         | 100% organic (ASO, content, community)                        |
| **Growth (5K-20K)**  | 5K-20K   | $500-2,000     | 60% content, 20% referral, 20% test paid                      |
| **Scale (20K-100K)** | 20K-100K | $2,000-10,000  | 40% content, 25% paid (proven channels), 20% referral, 15% PR |
| **Mature (100K+)**   | 100K+    | $10,000+       | Optimize by channel ROI; add brand advertising                |

### 8.2 Budget-Aware Recommendations

| Budget           | Strategy                                                                                                      | Expected Outcome                       |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------- |
| **$0/month**     | ASO optimization, in-app review prompts, social media presence (organic), community building on Reddit/forums | 5-8% WoW growth; ~5K MAU by Month 6    |
| **$500/month**   | Above + 2 blog posts/month, targeted social media content, app store screenshot A/B testing                   | 8-12% WoW growth; ~7K MAU by Month 6   |
| **$2,000/month** | Above + small paid acquisition test ($1K on Apple Search Ads), influencer micro-partnerships, PR outreach     | 12-18% WoW growth; ~10K MAU by Month 6 |

---

## 9. App Store Review Sentiment Analysis

### 9.1 Review Analysis Framework

```
For each review, classify:
  1. Sentiment: Positive / Neutral / Negative
  2. Topic: UX, Features, Privacy, Price, Bugs, Comparison, Other
  3. Platform: iOS, Android, Windows
  4. Actionability: Actionable feedback / Praise / Non-actionable complaint

Aggregate insights:
  - What do users LOVE? (Repeat in marketing)
  - What do users HATE? (Fix in product)
  - What do users REQUEST? (Roadmap input)
  - How do users COMPARE us? (Competitive positioning)
```

### 9.2 Review-to-Growth Pipeline

| Review Insight                      | Product Action                      | Growth Implication                        |
| ----------------------------------- | ----------------------------------- | ----------------------------------------- |
| "I love the privacy focus"          | Amplify in ASO keywords             | Privacy keywords drive high-quality users |
| "Needs bank connections"            | Roadmap priority (Sprint 10)        | Feature gap vs. competitors               |
| "Switched from YNAB — much cheaper" | Price comparison marketing          | Cost positioning resonates                |
| "Works offline!"                    | Highlight in screenshots            | Unique differentiator                     |
| "Manual entry is tedious"           | Quick entry, NLP input (Sprint 8-9) | Remove top churn driver                   |

---

## 10. Success Criteria

- [ ] Every significant acquisition channel identified and measured (volume, CAC, retention, conversion)
- [ ] Channel quality scoring includes retention AND conversion, not just volume
- [ ] CAC calculated per channel (including $0 for organic — most important channel)
- [ ] Viral coefficient calculated with component analysis (invitations × conversion)
- [ ] Growth model with 3 scenarios (organic, content, growth push) and 6-month projections
- [ ] Growth levers ranked by ROI, speed, and sustainability
- [ ] Budget recommendations for $0, $500, and $2,000 monthly budgets
- [ ] ASO performance framework with target keywords and ranking goals
- [ ] Referral program design specified (if recommended)
- [ ] App store review sentiment analyzed for positioning insights

---

_Growth analysis should be updated monthly as channel performance data accumulates. The most important early focus is on organic channel health — if organic isn't working, no amount of paid acquisition will build a sustainable business at $4.99/mo pricing._
