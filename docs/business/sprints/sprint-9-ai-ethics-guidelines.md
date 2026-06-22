# AI Feature Ethics Review and Guidelines

> **Sprint:** 9 — Smart Features
> **Issue:** #796
> **Priority:** P2 — Medium
> **Date:** 2025-07-27
> **Owner:** Product Management
> **Status:** Complete
> **Consultation Required:** @architect, @security-reviewer

---

## Executive Summary

This document establishes the ethical guidelines for AI-powered features in the Finance app. It covers privacy impact assessments, data flow analysis, bias mitigation, transparency standards, and user consent frameworks for every AI feature shipping in Sprint 9 and beyond. These guidelines are binding — no AI feature may ship without passing this review.

---

## Ethical AI Principles for Finance

### Core Principles

#### 1. Privacy by Architecture

- **Edge-first processing:** AI models run on-device whenever technically feasible
- **No training on user data:** Financial data is never sent to servers for model training
- **Minimal data collection:** AI features collect only what is strictly necessary
- **No third-party AI APIs** for processing financial data (no OpenAI, no Google ML, etc.)

#### 2. Assistive, Not Autonomous

- AI **suggests**, the user **decides** — every AI output is a recommendation
- No AI feature auto-applies changes without explicit user confirmation
- Users can always see, edit, and override AI suggestions
- The app functions fully without any AI features enabled

#### 3. Transparent and Explainable

- Every AI-generated suggestion includes a confidence indicator
- Users can see **why** the AI made a specific categorization or prediction
- AI limitations are communicated honestly — no overclaiming accuracy
- Model version and last update date are visible in settings

#### 4. Non-Judgmental

- AI never judges spending habits (no "you spent too much on X")
- Financial health scores are informational, not graded (no letter grades, no colors implying good/bad)
- Predictions are framed as possibilities, not certainties
- Language is neutral and empowering, never guilt-inducing

#### 5. Opt-In by Default

- All AI features are **off by default** — users must explicitly enable each one
- Each AI feature has its own toggle (not a global "enable AI" switch)
- Disabling an AI feature immediately stops all related processing
- No data is retained from AI processing after the feature is disabled

---

## AI Feature Privacy Impact Assessment

### Feature-by-Feature Analysis

#### Auto-Categorization (#263)

| Aspect                   | Assessment                                                                                   |
| ------------------------ | -------------------------------------------------------------------------------------------- |
| **Data processed**       | Transaction description, amount, merchant name                                               |
| **Processing location**  | On-device (TensorFlow Lite model)                                                            |
| **Data sent to servers** | None                                                                                         |
| **Data stored**          | Categorization results stored locally; model weights are read-only                           |
| **Privacy risk**         | **Low** — all processing is local                                                            |
| **Bias risk**            | **Medium** — model trained on English-language merchants may miscategorize non-English names |
| **User control**         | Toggle on/off; edit any categorization; retrain personal model                               |
| **Transparency**         | Shows confidence % for each categorization; "Why this category?" explanation                 |

**Privacy verdict: APPROVED** — fully on-device, no data leaves the device.

#### Natural Language Transaction Input (#322)

| Aspect                   | Assessment                                                   |
| ------------------------ | ------------------------------------------------------------ |
| **Data processed**       | User-typed natural language text                             |
| **Processing location**  | On-device (rule-based regex + heuristic parser)              |
| **Data sent to servers** | None                                                         |
| **Data stored**          | Parsed transaction saved locally; raw NLP input not retained |
| **Privacy risk**         | **Low** — rule-based, no ML model, no server calls           |
| **Bias risk**            | **Low** — rule-based parsing is deterministic                |
| **User control**         | Toggle on/off; always review parsed result before saving     |
| **Transparency**         | Shows parsed fields highlighted in the original text         |

**Privacy verdict: APPROVED** — deterministic, on-device, no data retention.

#### Anomaly Detection (#323)

| Aspect                   | Assessment                                                                       |
| ------------------------ | -------------------------------------------------------------------------------- |
| **Data processed**       | Transaction amounts, frequencies, merchant patterns                              |
| **Processing location**  | **On-device** for individual pattern analysis                                    |
| **Data sent to servers** | **None** — anomaly baselines are computed per-user on-device                     |
| **Data stored**          | Statistical baselines stored locally (mean, std dev per category)                |
| **Privacy risk**         | **Low** — all processing is local                                                |
| **Bias risk**            | **Medium** — may flag unusual-but-normal spending in underrepresented categories |
| **User control**         | Toggle on/off; dismiss any anomaly alert; adjust sensitivity                     |
| **Transparency**         | Shows why transaction was flagged ("This is 3x your typical amount for Dining")  |

**Privacy verdict: APPROVED** — on-device statistical analysis only.

**Note:** Originally considered server-side for cross-user baselines. **Decision: On-device only.** Cross-user comparison would require aggregating financial data on servers, which violates Privacy by Architecture. Individual baselines are sufficient for v1.

#### Predictive End-of-Month Balance (#324)

| Aspect                   | Assessment                                                                  |
| ------------------------ | --------------------------------------------------------------------------- |
| **Data processed**       | Historical transaction patterns, recurring transactions, budget allocations |
| **Processing location**  | On-device (time-series extrapolation)                                       |
| **Data sent to servers** | None                                                                        |
| **Data stored**          | Prediction model parameters stored locally                                  |
| **Privacy risk**         | **Low** — on-device time-series analysis                                    |
| **Bias risk**            | **Low** — mathematical extrapolation, not ML classification                 |
| **User control**         | Toggle on/off; view prediction methodology; adjust assumptions              |
| **Transparency**         | Shows confidence interval ("Predicted: $1,200-1,400"), lists assumptions    |

**Privacy verdict: APPROVED** — mathematical, on-device, transparent methodology.

#### Smart Subscription Detection (#325)

| Aspect                   | Assessment                                                                               |
| ------------------------ | ---------------------------------------------------------------------------------------- |
| **Data processed**       | Transaction descriptions, amounts, recurrence patterns                                   |
| **Processing location**  | On-device (pattern matching on recurring transactions)                                   |
| **Data sent to servers** | None                                                                                     |
| **Data stored**          | Detected subscription metadata stored locally                                            |
| **Privacy risk**         | **Low** — on-device pattern matching                                                     |
| **Bias risk**            | **Low** — deterministic pattern matching                                                 |
| **User control**         | Toggle on/off; confirm/dismiss detected subscriptions                                    |
| **Transparency**         | Shows detection reason ("3 transactions of $14.99 to Netflix on the 15th of each month") |

**Privacy verdict: APPROVED** — deterministic, on-device.

#### AI Budget Recommendations (#327)

| Aspect                   | Assessment                                                                                    |
| ------------------------ | --------------------------------------------------------------------------------------------- |
| **Data processed**       | Historical spending patterns, income, existing budgets                                        |
| **Processing location**  | On-device                                                                                     |
| **Data sent to servers** | None                                                                                          |
| **Data stored**          | Recommendation parameters stored locally                                                      |
| **Privacy risk**         | **Low** — on-device analysis                                                                  |
| **Bias risk**            | **High** — budget recommendations may reflect biases in training data about "normal" spending |
| **User control**         | Suggestions only — never auto-creates budgets; user reviews and accepts/rejects               |
| **Transparency**         | Shows methodology ("Based on your last 3 months: avg dining $320, avg groceries $450")        |

**Privacy verdict: APPROVED WITH CONDITIONS** — must include prominent disclaimer: "These suggestions are based on your spending patterns, not financial advice."

---

## Data Flow Architecture

### On-Device AI Processing Model

```
┌──────────────────────────────────────────────┐
│                 USER DEVICE                   │
│                                               │
│  ┌─────────┐    ┌──────────────┐             │
│  │ User    │───>│ Transaction  │             │
│  │ Input   │    │ Database     │             │
│  └─────────┘    │ (SQLite/     │             │
│                 │  Room/CoreData)│             │
│                 └──────┬───────┘             │
│                        │                      │
│                 ┌──────▼───────┐             │
│                 │  AI Engine   │             │
│                 │ (TFLite /    │             │
│                 │  Rules)      │             │
│                 └──────┬───────┘             │
│                        │                      │
│                 ┌──────▼───────┐             │
│                 │ AI Results   │             │
│                 │ (categories, │             │
│                 │  predictions,│             │
│                 │  anomalies)  │             │
│                 └──────┬───────┘             │
│                        │                      │
│                 ┌──────▼───────┐             │
│                 │ User Reviews │             │
│                 │ & Confirms   │             │
│                 └──────────────┘             │
│                                               │
│  ╔═══════════════════════════════════════╗    │
│  ║  NO FINANCIAL DATA LEAVES THE DEVICE  ║    │
│  ║  FOR AI PROCESSING — EVER             ║    │
│  ╚═══════════════════════════════════════╝    │
│                                               │
└──────────────────────────────────────────────┘
                     │
          SYNC (encrypted,
          user-initiated)
                     │
                     ▼
┌──────────────────────────────────────────────┐
│              SYNC SERVER                      │
│                                               │
│  Stores encrypted transaction data for sync.  │
│  Server CANNOT read transaction content.       │
│  NO AI/ML processing on server side.           │
│  NO model training on server side.             │
│  Server is a dumb encrypted pipe.              │
│                                               │
└──────────────────────────────────────────────┘
```

### Data Flow Rules

1. **Financial data → AI Engine:** On-device only, never crosses network boundary
2. **AI Results → Sync:** AI results (categories, etc.) sync as part of transaction data, encrypted
3. **Model Updates:** Pre-trained models bundled with app updates (no server-side model serving)
4. **Telemetry:** Only aggregate, anonymized usage metrics (e.g., "AI categorization used by 45% of Premium users") — never individual financial data
5. **Crash Reports:** AI-related crashes include stack traces but NEVER transaction data

---

## Bias Assessment Framework

### Pre-Launch Bias Testing

| Test                      | Method                                                    | Acceptance Criteria                   |
| ------------------------- | --------------------------------------------------------- | ------------------------------------- |
| **Merchant diversity**    | Test categorization on merchants from all 5 i18n markets  | >=90% accuracy across all markets     |
| **Amount bias**           | Test with transaction amounts from $0.01 to $100,000+     | No systematic miscat. by amount       |
| **Currency bias**         | Test with all supported currencies                        | No accuracy difference by currency    |
| **Language bias**         | Test with non-English merchant names                      | >=80% accuracy (vs >=95% for English) |
| **Category distribution** | Verify no category is systematically over/under-predicted | Chi-squared test p>0.05               |

### Ongoing Bias Monitoring

- Track categorization accuracy by user-reported corrections
- Monitor anomaly detection false positive rates
- Review prediction accuracy across different spending patterns
- Quarterly bias audit with updated test sets

### Bias Mitigation Strategies

1. **User corrections improve personal model** — each correction refines on-device model
2. **No cross-user learning** — prevents majority-pattern bias from affecting minority users
3. **Explicit "I don't know" output** — model outputs "Uncategorized" rather than guessing at low confidence
4. **Diverse training data** — pre-trained model uses geographically diverse merchant data
5. **Regular retraining** — model updates shipped with app updates quarterly

---

## User Transparency Standards

### What Users Must Be Able to See

| Information                         | Where Shown               | Format                             |
| ----------------------------------- | ------------------------- | ---------------------------------- |
| AI is enabled/disabled per feature  | Settings → AI Features    | Toggle with description            |
| Confidence level for each AI output | Inline with suggestion    | Percentage or High/Med/Low         |
| Why AI made a specific suggestion   | Tap on suggestion         | "Why?" expandable section          |
| What data the AI feature uses       | Settings → AI → [Feature] | Plain-language list                |
| AI model version                    | Settings → AI → About     | Version number + date              |
| How to disable AI completely        | Settings → AI Features    | Individual toggles + "Disable all" |
| AI is Premium-only                  | Paywall / Settings        | Clear labeling                     |

### AI Confidence Display

| Confidence | Display               | Color                     | Action                                 |
| ---------- | --------------------- | ------------------------- | -------------------------------------- |
| >=90%      | "High confidence"     | Neutral (no color coding) | Auto-suggest, user confirms            |
| 70-89%     | "Moderate confidence" | Neutral                   | Suggest with "?" indicator             |
| 50-69%     | "Low confidence"      | Neutral                   | Suggest as option among alternatives   |
| <50%       | "Uncategorized"       | Neutral                   | Do not suggest; ask user to categorize |

**Important:** No green/red/yellow color coding for confidence levels. This avoids implying "good" or "bad" AI performance and maintains the non-judgmental design language.

---

## Opt-In/Opt-Out Framework

### Per-Feature Toggle Design

```
Settings → AI Features

  ┌────────────────────────────────────────┐
  │ AI Features                    Premium │
  │                                        │
  │ All AI processing happens on your      │
  │ device. Your financial data is never    │
  │ sent to any server for AI processing.  │
  │                                        │
  │ ┌──────────────────────────────┐       │
  │ │ Auto-Categorization    [OFF] │       │
  │ │ Suggest categories for new   │       │
  │ │ transactions                 │       │
  │ └──────────────────────────────┘       │
  │                                        │
  │ ┌──────────────────────────────┐       │
  │ │ Smart Typing           [OFF] │       │
  │ │ Parse natural language to    │       │
  │ │ create transactions          │       │
  │ └──────────────────────────────┘       │
  │                                        │
  │ ┌──────────────────────────────┐       │
  │ │ Anomaly Alerts         [OFF] │       │
  │ │ Flag unusual transactions    │       │
  │ └──────────────────────────────┘       │
  │                                        │
  │ ┌──────────────────────────────┐       │
  │ │ Predictions            [OFF] │       │
  │ │ Forecast end-of-month        │       │
  │ │ balances                     │       │
  │ └──────────────────────────────┘       │
  │                                        │
  │ ┌──────────────────────────────┐       │
  │ │ Subscription Detection [OFF] │       │
  │ │ Find recurring charges       │       │
  │ └──────────────────────────────┘       │
  │                                        │
  │ ┌──────────────────────────────┐       │
  │ │ Budget Suggestions     [OFF] │       │
  │ │ Recommend budget amounts     │       │
  │ └──────────────────────────────┘       │
  │                                        │
  │ [Disable All AI Features]              │
  │                                        │
  │ Learn more about how AI works in       │
  │ Finance → [AI Privacy Guide]           │
  └────────────────────────────────────────┘
```

### Toggle Behavior

- **OFF → ON:** Brief explanation of what the feature does and what data it accesses
- **ON → OFF:** Immediate stop; option to clear AI-generated data (categories, predictions)
- **"Disable All":** Turns off all AI toggles; single-tap to confirm
- **No dark patterns:** "OFF" is not visually inferior to "ON" — both are neutral states

---

## Financial Health Score Guidelines

### What It Is

A single-number summary of a user's financial behaviors based on their tracked data.

### What It Must NOT Be

- Not a credit score
- Not a judgment of financial responsibility
- Not comparable between users
- Not shared with any third party
- Not used for any lending or insurance decision

### Display Rules

1. **No letter grades** (A, B, C, D, F) — implies judgment
2. **No traffic-light colors** (red/yellow/green) — implies good/bad
3. **No percentile ranking** — implies comparison with others
4. **No gamification** — no badges, streaks, or achievements tied to the score
5. **Score is private** — never shared, exported, or visible to anyone but the user

### Recommended Display

```
Your Financial Snapshot

  Tracking consistency:  ████████░░  80%
  Budget adherence:      ██████░░░░  60%
  Goal progress:         █████████░  90%

  These reflect your tracking habits in Finance,
  not a judgment of your finances. Everyone's
  situation is different.

  [How is this calculated?]
```

---

## Compliance Checklist

Before any AI feature ships, it must pass ALL of these checks:

### Privacy

- [ ] All processing is on-device (no server-side AI processing)
- [ ] No financial data sent to third-party APIs
- [ ] No model training on user data (pre-trained models only)
- [ ] Opt-in by default (feature starts disabled)
- [ ] Data cleared when feature is disabled

### Transparency

- [ ] Confidence level shown for every AI output
- [ ] "Why?" explanation available for every suggestion
- [ ] Model version and data sources documented
- [ ] AI Privacy Guide updated with feature details

### Fairness

- [ ] Bias testing completed across target markets
- [ ] Non-English merchant accuracy documented
- [ ] No category systematically over/under-predicted
- [ ] User corrections improve personal model

### User Control

- [ ] Individual feature toggle (not global switch)
- [ ] Every AI suggestion is editable/dismissible
- [ ] No auto-apply without user confirmation
- [ ] "Disable All" option available and functional

### Non-Judgment

- [ ] No evaluative language ("good," "bad," "poor," "excellent")
- [ ] No color coding implying value judgments
- [ ] Financial health display follows approved guidelines
- [ ] All copy reviewed against brand voice guide

---

## Architecture Decision: Consult @architect

The following decisions require @architect consultation before implementation:

| Decision                    | Recommended                          | Alternative                                  | Trade-off                            |
| --------------------------- | ------------------------------------ | -------------------------------------------- | ------------------------------------ |
| Categorization model format | TensorFlow Lite (KMP-compatible)     | ONNX Runtime or CoreML + TFLite per platform | Simplicity vs. platform optimization |
| NLP parsing approach        | Rule-based regex + heuristics        | LLM API call                                 | Privacy vs. capability               |
| Anomaly detection scope     | On-device only (individual patterns) | Server-side (cross-user baselines)           | Privacy vs. accuracy                 |
| Model update mechanism      | Bundled with app updates             | Server-side model serving                    | Simplicity vs. freshness             |

**Recommendation:** Rule-based and on-device approaches for v1. Server-side and ML approaches only considered for v2+ with explicit user consent and transparent data handling.
