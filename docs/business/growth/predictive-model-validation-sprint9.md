# Predictive Model Validation & Accuracy Report

> **Issue:** #829
> **Sprint:** 9 — "Intelligence"
> **Priority:** P1 — High
> **Created:** 2025-07-27
> **Owner:** Business Analyst
> **Status:** Draft — Framework ready, requires 4-6 weeks of predictive feature usage data
> **Depends on:** #826 (Feature Usage Analytics)

---

## Executive Summary

This document defines the validation framework for all predictive features in the Finance app — spending forecasts, budget recommendations, goal projections, and anomaly detection. It establishes accuracy benchmarks, evaluates performance by user segment, analyzes user trust impact, and provides clear thresholds for when predictions should and shouldn't be shown. The goal is to ensure predictions build trust (not erode it) and drive measurable business outcomes.

**Key principle:** A bad prediction is worse than no prediction. Users trust us with their financial data — incorrect predictions erode that trust faster than good predictions build it.

---

## 1. Predictive Features Inventory

### 1.1 Features Under Validation

| Feature                   | Prediction Type        | Input Data                            | Output                                                | Minimum Data Required     |
| ------------------------- | ---------------------- | ------------------------------------- | ----------------------------------------------------- | ------------------------- |
| **Spending Forecast**     | Time series regression | Historical spending by category       | "Next month you'll spend ~$X on groceries"            | 30 days of transactions   |
| **Budget Recommendation** | Pattern analysis       | Spending history, existing budgets    | "Based on your spending, we suggest $X for groceries" | 14 days + 10 transactions |
| **Goal Projection**       | Linear/exponential fit | Goal target, contribution history     | "At this rate, you'll reach your goal by [date]"      | 3+ contributions          |
| **Anomaly Detection**     | Statistical outlier    | Category spending history             | "You spent 50% more on dining this week"              | 30 days of transactions   |
| **Recurring Detection**   | Pattern matching       | Transaction dates, amounts, merchants | "This looks like a recurring payment"                 | 2+ matching transactions  |

---

## 2. Accuracy Metrics

### 2.1 Primary Accuracy Metrics

| Metric                           | Definition                                               | Formula                                      | Good | Acceptable | Poor |
| -------------------------------- | -------------------------------------------------------- | -------------------------------------------- | ---- | ---------- | ---- |
| **MAE** (Mean Absolute Error)    | Average magnitude of prediction errors                   | Σ\|predicted - actual\| / n                  | <$15 | <$30       | >$30 |
| **MAPE** (Mean Absolute % Error) | Average percentage error                                 | Σ(\|predicted - actual\| / actual) / n × 100 | <15% | <25%       | >25% |
| **Direction Accuracy**           | % of time prediction direction is correct (higher/lower) | Correct directions / Total predictions × 100 | >80% | >70%       | <70% |
| **Hit Rate** (within ±20%)       | % of predictions within 20% of actual                    | Within-range / Total × 100                   | >65% | >50%       | <50% |
| **User Override Rate**           | % of auto-categorizations user changes                   | Changed / Total auto-categorized × 100       | <10% | <20%       | >20% |
| **Acceptance Rate**              | % of recommendations user accepts                        | Accepted / Shown × 100                       | >30% | >15%       | <15% |

### 2.2 Feature-Specific Accuracy Targets

| Feature               | Primary Metric     | Target | Minimum Viable | Measurement Window                               |
| --------------------- | ------------------ | ------ | -------------- | ------------------------------------------------ |
| Spending Forecast     | MAPE               | ≤15%   | ≤25%           | Monthly (forecast vs. actual)                    |
| Budget Recommendation | Acceptance Rate    | ≥30%   | ≥15%           | Per recommendation shown                         |
| Goal Projection       | Direction Accuracy | ≥85%   | ≥75%           | Per projection (on-track vs. actual)             |
| Anomaly Detection     | Precision          | ≥80%   | ≥70%           | Per alert (true anomaly vs. false positive)      |
| Recurring Detection   | Precision          | ≥90%   | ≥80%           | Per detection (true recurring vs. false)         |
| Smart Categorization  | Accuracy           | ≥90%   | ≥80%           | Per categorization (correct vs. user-overridden) |

---

## 3. Segmented Accuracy Analysis

### 3.1 Accuracy by User Tenure

**Hypothesis:** Predictions improve with more historical data. New users get worse predictions.

| User Segment                       | Data Available    | Expected Accuracy      | Implication                                  |
| ---------------------------------- | ----------------- | ---------------------- | -------------------------------------------- |
| **New users (<14 days)**           | 0-2 weeks of data | Poor (>30% MAPE)       | Don't show predictions; show after threshold |
| **Early users (14-30 days)**       | 2-4 weeks         | Moderate (20-30% MAPE) | Show with "early estimate" caveat            |
| **Established users (1-3 months)** | 1-3 months        | Good (15-20% MAPE)     | Full predictions, no caveat needed           |
| **Mature users (3+ months)**       | 3+ months         | Best (<15% MAPE)       | High-confidence predictions; Premium value   |

### 3.2 Accuracy by Spending Pattern

| Pattern Type           | Description                                   | Expected Accuracy        | Challenge                           |
| ---------------------- | --------------------------------------------- | ------------------------ | ----------------------------------- |
| **Regular spender**    | Consistent spending, predictable patterns     | High (<15% MAPE)         | Easy to predict; low variance       |
| **Irregular spender**  | Variable spending, occasional large purchases | Medium (15-25% MAPE)     | Outliers skew predictions           |
| **Seasonal spender**   | Holiday, back-to-school, vacation patterns    | Medium (depends on data) | Needs 12+ months for seasonal model |
| **Life-event spender** | Moving, new job, new baby → spending shift    | Low (>25% MAPE)          | Model can't predict life events     |

### 3.3 Accuracy by Transaction Volume

| Weekly Transaction Volume | Expected Accuracy (MAPE) | Note                                |
| ------------------------- | ------------------------ | ----------------------------------- |
| 1-3 transactions/week     | >30% (unreliable)        | Insufficient data density           |
| 4-10 transactions/week    | 15-25% (moderate)        | Enough for category-level forecasts |
| 11-20 transactions/week   | 10-15% (good)            | Detailed predictions viable         |
| 20+ transactions/week     | <10% (excellent)         | High-confidence predictions         |

---

## 4. Minimum Data Thresholds

### 4.1 When to Show vs. Hide Predictions

```
DECISION FRAMEWORK: Show prediction only if confidence is adequate

For Spending Forecasts:
  SHOW IF: ≥30 days of history AND ≥20 transactions in category AND MAPE <25%
  HIDE IF: <14 days of history OR <5 transactions in category
  CAVEAT IF: 14-30 days OR estimated MAPE >20%

For Budget Recommendations:
  SHOW IF: ≥14 days of history AND ≥10 transactions
  HIDE IF: <7 days of history OR <5 transactions

For Goal Projections:
  SHOW IF: ≥3 contributions AND some variance in contribution amounts
  HIDE IF: <2 contributions (not enough data to project)

For Anomaly Detection:
  SHOW IF: ≥30 days of history AND ≥10 transactions in category
  HIDE IF: <14 days (everything looks "anomalous" with no baseline)

For Recurring Detection:
  SHOW IF: ≥2 matching transactions with similar amount and timing
  HIDE IF: Only 1 transaction (can't detect pattern from 1 data point)
```

### 4.2 Confidence Display

```
User-facing confidence levels:

  HIGH CONFIDENCE (show as solid prediction):
    - Prediction based on 3+ months of data
    - Historical accuracy <15% MAPE for this user segment
    - Consistent spending pattern

  MEDIUM CONFIDENCE (show with "estimate" label):
    - Prediction based on 1-3 months of data
    - Historical accuracy 15-25% MAPE
    - Moderate spending consistency

  LOW CONFIDENCE (show with "early estimate" + learn more):
    - Prediction based on <1 month of data
    - Historical accuracy >25% MAPE
    - Variable spending pattern

  NOT SHOWN (insufficient data):
    - Below minimum data threshold
    - Feature hidden; show "Log more transactions for spending insights"
```

---

## 5. User Trust Analysis

### 5.1 Trust Measurement Framework

```
User trust is measured through BEHAVIORAL signals (not surveys):

1. PREDICTION ENGAGEMENT:
   - Do users VIEW predictions when available? (View rate)
   - Do users FOLLOW predictions? (Compliance rate)
   - Do users DISMISS predictions? (Dismiss rate)

2. TRUST EROSION SIGNALS:
   - After a wrong prediction, does the user:
     a) Continue viewing predictions? → Trust maintained
     b) Stop viewing predictions? → Trust eroded
     c) Disable the feature? → Trust broken

3. TRUST-RETENTION CORRELATION:
   - Users who trust predictions (high view rate) → retention impact
   - Users who distrust predictions (high dismiss rate) → retention impact
```

### 5.2 Trust Metrics Template

| Metric                  | Definition                                                       | Target  | Concern Threshold |
| ----------------------- | ---------------------------------------------------------------- | ------- | ----------------- |
| Prediction view rate    | % of available predictions user actually views                   | ≥60%    | <30%              |
| Prediction follow rate  | % of recommendations user follows                                | ≥25%    | <10%              |
| Prediction dismiss rate | % of predictions user explicitly dismisses                       | <20%    | >40%              |
| Feature disable rate    | % of users who disable predictive features                       | <5%     | >15%              |
| Post-error engagement   | % of users who continue using predictions after an error         | ≥80%    | <60%              |
| Trust recovery time     | Days until engagement returns to baseline after a bad prediction | <3 days | >7 days           |

### 5.3 Trust Impact on Business Metrics

```
Hypothesized relationships:

High Trust (accurate predictions) →
  ✅ Higher engagement (users check predictions regularly)
  ✅ Higher retention (predictions provide ongoing value)
  ✅ Higher Premium conversion (predictions are a Premium feature)

Low Trust (inaccurate predictions) →
  ❌ Feature abandonment (users stop checking predictions)
  ❌ App abandonment (users lose trust in the app overall)
  ❌ Negative reviews ("predictions are useless" → ASO damage)

CRITICAL: One bad spending prediction that's wildly wrong (e.g., "You'll spend $500
on groceries" when they spend $200) can undo months of trust-building.
It's better to show NO prediction than a confidently wrong one.
```

---

## 6. Model Performance Benchmarks

### 6.1 Industry Benchmarks

| Prediction Type                  | Industry Best    | Industry Average | Our Target     | Notes                                      |
| -------------------------------- | ---------------- | ---------------- | -------------- | ------------------------------------------ |
| Spending category forecast       | 8-12% MAPE       | 15-25% MAPE      | ≤15% MAPE      | With 3+ months of data                     |
| Budget recommendation acceptance | 35-45%           | 20-30%           | ≥30%           | Depends on personalization quality         |
| Anomaly detection precision      | 85-90%           | 70-80%           | ≥80%           | False positives kill trust                 |
| Auto-categorization accuracy     | 92-97%           | 80-90%           | ≥90%           | Bank connection data improves this         |
| Goal projection accuracy         | 80-90% direction | 70-80%           | ≥85% direction | Simple math when contributions are regular |

### 6.2 Competitive Performance Comparison

| Feature                 | Finance (Target) | Monarch  | Copilot  | Notes                                              |
| ----------------------- | ---------------- | -------- | -------- | -------------------------------------------------- |
| Categorization accuracy | 90%              | 92-95%\* | 88-92%   | \*Monarch has bank transaction data advantage      |
| Prediction MAPE         | 15%              | ~12%\*   | ~15%     | \*Monarch's cloud models may be more sophisticated |
| Works offline           | ✅               | ❌       | ❌       | Our unique advantage: predictions work anywhere    |
| Privacy                 | ✅ On-device     | ❌ Cloud | ❌ Cloud | Our unique advantage: no data sent off-device      |

**Accuracy gap explanation:** Competitors using cloud-based models with bank transaction data may achieve 2-5% better accuracy. However, our on-device approach offers zero-latency predictions, offline capability, and total privacy — which may matter more to users than marginal accuracy differences.

---

## 7. Model Improvement Roadmap

### 7.1 Accuracy Improvement Strategies

| Strategy                                                         | Expected Improvement                        | Effort         | Timeline   |
| ---------------------------------------------------------------- | ------------------------------------------- | -------------- | ---------- |
| **More training data per user** (time)                           | +5-10% accuracy as users accumulate history | $0 (automatic) | Ongoing    |
| **Better feature engineering**                                   | +3-5% accuracy                              | Medium         | Sprint 10  |
| **Ensemble models** (combine multiple simple models)             | +2-4% accuracy                              | Medium         | Sprint 10  |
| **Seasonal pattern detection**                                   | +5-10% for seasonal categories              | Large          | Sprint 11+ |
| **Federated learning** (aggregate patterns without sharing data) | +3-8% accuracy                              | Very Large     | v2.0+      |

### 7.2 Federated Learning Assessment

```
Federated learning allows model improvement from aggregate user patterns
WITHOUT sharing individual data.

Approach:
  1. Each device trains a local model on user's data
  2. Only MODEL WEIGHTS (not data) are sent to server
  3. Server aggregates weights from many users → improved global model
  4. Improved model is pushed back to all devices

Privacy assessment:
  ✅ Raw financial data NEVER leaves device
  ✅ Model weights don't contain individual transactions
  🟡 Theoretical privacy risk: model weights could potentially be reverse-engineered
  🟡 Requires opt-in consent and clear explanation

Business value:
  - Improves accuracy for new users (cold start problem)
  - Better category predictions from aggregate patterns
  - Could be a Premium feature ("AI that learns from anonymized patterns")

Decision: DEFER to v2.0. Requires significant engineering and careful privacy review.
         Current on-device-only approach is sufficient for launch.
```

---

## 8. Prediction Failure Modes & Mitigations

### 8.1 Common Failure Modes

| Failure Mode              | Example                                                 | Frequency (est.) | User Impact                      | Mitigation                                                                     |
| ------------------------- | ------------------------------------------------------- | ---------------- | -------------------------------- | ------------------------------------------------------------------------------ |
| **Outlier contamination** | One-time $5K expense skews next month forecast          | Common           | Medium                           | Outlier detection before forecasting; exclude 1-time large expenses            |
| **Cold start**            | New user gets wildly wrong predictions                  | Very Common      | High                             | Minimum data thresholds; hide predictions below threshold                      |
| **Category confusion**    | Auto-categorization puts groceries under dining         | Common           | Low-Medium                       | Easy re-categorization UX; model learns from corrections                       |
| **Life event**            | User gets new job → spending patterns change completely | Rare per user    | High                             | Adaptive model with short-term weighting; "patterns have changed" notification |
| **Seasonal miss**         | Holiday spending spike not predicted                    | Annual           | Medium                           | Seasonal model (requires 12+ months of data); Q4 caveat                        |
| **False anomaly**         | Normal variation flagged as anomaly                     | Moderate         | Low (if few), High (if frequent) | Raise anomaly threshold; fewer, more confident alerts                          |

### 8.2 Graceful Degradation Strategy

```
When predictions are poor, gracefully degrade:

Level 1: HIGH CONFIDENCE → Show prediction normally
Level 2: MEDIUM → Show with "estimate based on limited data" label
Level 3: LOW → Show with prominent caveat: "This is a rough estimate. Log more transactions for better predictions."
Level 4: VERY LOW → Hide prediction entirely: "We need more data to make predictions. Keep logging!"
Level 5: ERROR → Never show a broken prediction: "Something went wrong. We'll try again later."

NEVER: Show a confidently wrong prediction without caveat.
       It's better to show nothing than to show something wrong.
```

---

## 9. Business Impact of Prediction Accuracy

### 9.1 Accuracy-Retention Correlation Model

```
Hypothesis: Prediction accuracy directly correlates with user retention.

Analysis plan:
  1. Segment users by prediction accuracy they receive:
     - High accuracy group: MAPE <15% for their predictions
     - Medium accuracy group: MAPE 15-25%
     - Low accuracy group: MAPE >25%

  2. Compare D30 retention across groups

  3. Expected results:
     High accuracy: D30 retention +5-10% vs. no-prediction baseline
     Medium accuracy: D30 retention +2-5%
     Low accuracy: D30 retention ±0% (no benefit, slight negative risk)

  4. Business implication:
     If high-accuracy predictions add +7% to D30 retention:
     At 5,000 MAU: 350 additional retained users
     If 5% of those convert: 17.5 additional subscribers
     Revenue: 17.5 × $3.10/mo = $54/mo incremental MRR
     Annualized: $650 incremental revenue from accuracy improvement
```

### 9.2 "Aha Moment" from Predictions

```
Hypothesis: The first accurate spending insight creates an "aha moment"
that significantly increases retention.

Test:
  - Identify users who received their FIRST spending prediction/insight
  - Measure: D7 retention AFTER receiving the insight vs. matched cohort without insights
  - If insight-recipients retain 1.5-2× better → spending insight IS the aha moment

Product implication:
  - Accelerate time-to-first-insight (lower data threshold for initial prediction)
  - Accept lower accuracy for first insight IF it delivers directional value
  - Show insight prominently (notification, not buried in a tab)
```

---

## 10. Success Criteria

- [ ] Every predictive feature has quantified accuracy metrics (MAE, MAPE, direction, hit rate)
- [ ] Accuracy segmented by user tenure (new, early, established, mature) with clear thresholds
- [ ] Accuracy segmented by spending pattern type (regular, irregular, seasonal)
- [ ] Minimum data thresholds defined for each feature (when to show vs. hide)
- [ ] User trust metrics defined and tracked (view rate, follow rate, dismiss rate, disable rate)
- [ ] Trust erosion analysis: what happens after a wrong prediction?
- [ ] Industry accuracy benchmarks cited for comparison
- [ ] Graceful degradation strategy defined (from high confidence to hidden)
- [ ] Business impact tied to specific outcomes (retention, conversion, revenue)
- [ ] Model improvement roadmap with expected accuracy gains and effort estimates
- [ ] Methodology documented for reproducibility in future sprints

---

_Prediction accuracy should be monitored continuously and reported monthly. As user data accumulates, models will naturally improve. The key success factor is NOT achieving perfect accuracy — it's knowing when predictions are good enough to show and when they should be hidden. Users forgive imperfect predictions with appropriate caveats; they don't forgive confidently wrong ones._
