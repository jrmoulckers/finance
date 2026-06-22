# Stage 9-10 Feature Specifications

**Sprint:** S3 - Feature Scoping
**Priority:** P2 - Medium
**Status:** Complete
**Document Owner:** Product Management
**Date:** 2025-07-31

---

## Executive Summary

This document provides detailed product specifications for seven features
spanning Stage 9 (user engagement) and Stage 10 (intelligence layer). Each spec
includes user stories, acceptance criteria, technical constraints, data model
requirements, UX guidelines, and cross-platform considerations.

### Features Covered

| Stage | Issue | Feature                          | Category     |
| ----- | ----- | -------------------------------- | ------------ |
| 9     | #316  | Spending watchlists              | Engagement   |
| 9     | #318  | Bulk transaction editing         | Productivity |
| 10    | #322  | Natural language input           | Input        |
| 10    | #324  | Predictive end-of-month balance  | Intelligence |
| 10    | #325  | Smart subscription detection     | Intelligence |
| 10    | #326  | Personalized savings suggestions | Intelligence |
| 10    | #327  | AI budget recommendations        | Intelligence |
| 10    | #328  | Spending forecast                | Intelligence |

---

## Spec 1: Spending Watchlists with Proactive Alerts (#316)

### User Story

As a user who tends to overspend in specific categories, I want to set spending
watchlists so that I receive gentle alerts when I approach my self-defined
limits, helping me stay aware without feeling judged.

### Acceptance Criteria

- [ ] User can mark any spending category as watched from category detail or
      dedicated watchlists settings page with a monthly threshold amount
- [ ] Configurable alert thresholds at 70%, 80%, 90%, and 100% of the watchlist
      amount. User enables/disables each independently. Default: 80% and 100%
- [ ] Local notification when spending crosses an enabled threshold with
      non-judgmental tone
- [ ] Dedicated watchlist dashboard showing all active watchlists with progress
      bars, current spend, threshold, percentage, and days remaining
- [ ] Calendar month period by default. Optional custom period (weekly, biweekly)
- [ ] Last 3 months average spend shown alongside current month for context
- [ ] All watchlist logic runs on-device. No network dependency
- [ ] Watchlist configuration syncs via existing CRDT layer. Alert delivery
      state is device-local

### Data Model

```
WatchlistEntry {
  id: UUID
  categoryId: UUID
  thresholdAmount: Decimal
  enabledThresholds: Set<Int>  // {70, 80, 90, 100}
  period: Enum(monthly, weekly, biweekly)
  isActive: Boolean
  createdAt: Timestamp
  updatedAt: Timestamp
}
```

### UX Guidelines

- Progress bars: green (0-69%), yellow (70-89%), orange (90-99%), red (100%+)
- Language: use heads up and getting close, never warning or danger
- Watchlist creation should take fewer than 3 taps from any transaction view
- Haptic feedback on threshold crossing (subtle, not alarming)

---

## Spec 2: Bulk Transaction Editing (#318)

### User Story

As a user who imports bank statements or enters many transactions at once, I
want to select multiple transactions and perform batch operations so that I can
efficiently organize my financial data.

### Acceptance Criteria

- [ ] Long-press or dedicated button enters multi-select mode with checkboxes
      on each transaction row and selection count in toolbar
- [ ] Select all button in toolbar. Optional: select all matching current filter
- [ ] Batch re-categorize: change category for all selected transactions
- [ ] Batch delete: confirmation dialog showing count, undo for 10 seconds
- [ ] Batch tag: add or remove tags from all selected transactions
- [ ] Batch change account: move selected transactions to different account
- [ ] Batch change date: shift all selected by relative offset
- [ ] Keyboard shortcuts (desktop): Ctrl+A (select all), Ctrl+Click (toggle),
      Shift+Click (range), Delete (batch delete), Ctrl+E (batch edit)
- [ ] All batch operations support undo via snackbar for 10 seconds
- [ ] Batch operations generate individual CRDT mutations per transaction for
      correct sync conflict resolution

### UX Guidelines

- Multi-select toolbar replaces standard toolbar with count and batch actions
- Batch actions via bottom sheet (mobile) or toolbar dropdown (desktop)
- Destructive actions require explicit confirmation
- Maximum selection: 500 transactions (performance guard)
- Progress indicator for large batch operations (50+ items)

---

## Spec 3: Natural Language Transaction Input (#322)

### User Story

As a user who finds form-based entry tedious, I want to type or speak a natural
description like spent 45 on groceries and have Finance parse it into a
structured transaction automatically.

### Acceptance Criteria

- [ ] Prominent text field on transaction entry screen with placeholder example
- [ ] Amount parsing: supports 45, 45.00, dollar sign 45, EUR 45 formats
- [ ] Category matching: fuzzy match against user categories (70%+ confidence)
- [ ] Date parsing: today (default), yesterday, last Monday, on the 15th,
      3 days ago, July 15, 2025-07-15
- [ ] Payee extraction: at [payee] or from [payee] patterns
- [ ] Transaction type detection by keywords: spent/paid/bought = expense,
      received/got/earned/salary = income
- [ ] Always show parsed result in pre-filled form for review before saving
- [ ] Learning from corrections: improved matching weights over time
- [ ] All NLP parsing runs on-device in KMP shared module
- [ ] Parser architecture supports pluggable language modules (English v1)

### Technical Architecture

```
NLPParser (packages/core)
  +-- AmountExtractor: regex + heuristic for monetary amounts
  +-- CategoryMatcher: fuzzy string matching against user categories
  +-- DateParser: relative and absolute date interpretation
  +-- PayeeExtractor: pattern-based merchant name extraction
  +-- TypeClassifier: keyword-based income/expense classification
  +-- CorrectionStore: local table for learned corrections
```

### UX Guidelines

- Real-time parsing as user types (debounced 300ms)
- Live preview below input showing parsed amount, category, and date
- Confidence indicators: checkmark (high) or question mark (low)
- Voice input via platform speech-to-text feeds into same parser

---

## Spec 4: Predictive End-of-Month Balance (#324)

### User Story

As a user planning my spending for the rest of the month, I want to see a
projected balance at month end based on my patterns so that I can make informed
decisions about upcoming purchases.

### Acceptance Criteria

- [ ] Project month-end balance: current balance + remaining income - remaining
      recurring expenses - (avg daily discretionary \* remaining days)
- [ ] Confidence interval using historical variance with 95% CI
- [ ] Line chart: actual balance (solid) and projected (dashed with shaded band)
- [ ] Factor breakdown: remaining income, recurring expenses, estimated
      discretionary. Tappable to see underlying data
- [ ] What-if slider: adjust daily discretionary to see impact in real time
- [ ] Per-account and total-across-all-accounts projections
- [ ] Historical accuracy display: last month projection vs actual
- [ ] All calculations in KMP shared module. No data sent to server

### Algorithm

```
projected = current_balance
  + sum(remaining_recurring_income)
  - sum(remaining_recurring_expenses)
  - (avg_daily_discretionary * remaining_days)

ci_low = projected - (stddev_daily * sqrt(remaining_days) * 1.96)
ci_high = projected + (stddev_daily * sqrt(remaining_days) * 1.96)
```

---

## Spec 5: Smart Subscription Detection (#325)

### User Story

As a user who has lost track of my recurring charges, I want Finance to
automatically identify and group my subscriptions so that I can see my total
recurring spend and catch forgotten charges.

### Acceptance Criteria

- [ ] Detection by matching: same payee (fuzzy 85%), similar amount (10%
      variance), regular interval. Minimum 2 occurrences to flag
- [ ] Dedicated subscriptions screen: payee, amount, frequency, next expected
      date, annual cost projection, status
- [ ] Monthly and annual total subscription cost displayed prominently
- [ ] New subscription alert when new recurring pattern detected
- [ ] Price change detection alert when subscription amount changes
- [ ] Cancelled detection: mark as potentially cancelled if expected charge
      does not appear within 7 days
- [ ] User overrides: confirm, dismiss, or manually add subscriptions
- [ ] Auto-tag detected subscriptions. Allow user category assignment
- [ ] All pattern matching runs locally in KMP shared module

### Detection Algorithm

```
for each payee:
  group = transactions where payee fuzzy matches within 85%
  if group.length >= 2:
    intervals = pairwise date differences
    if intervals cluster around 7/14/30/90/365 days (20% tolerance):
      subscription_candidate = true
      frequency = most common interval
      next_expected = last_date + frequency
      annual_cost = amount * (365 / frequency)
```

---

## Spec 6: Personalized Savings Suggestions (#326)

### User Story

As a user trying to save more, I want Finance to suggest specific actionable
areas where I could save, based on my own patterns and goals rather than
generic advice.

### Acceptance Criteria

- [ ] Analyze 3+ months of spending to identify categories exceeding budget or
      historical average. Require minimum data before generating suggestions
- [ ] Up to 5 suggestions per month ranked by potential savings amount. Each
      includes: category, current average, target, potential savings, rationale
- [ ] Goal-aware: tie suggestions to active goals with timeline impact
- [ ] Non-judgmental tone: positive framing, never criticize spending
- [ ] Actionable specificity: reference specific patterns not generic advice
- [ ] Suggestion lifecycle: dismiss, save (track progress), or snooze
- [ ] Progress tracking for saved suggestions month-over-month
- [ ] All analysis runs on-device. Suggestions never synced

---

## Spec 7: AI Budget Recommendations (#327)

### User Story

As a new or existing user reviewing budget allocations, I want Finance to
suggest budget amounts based on my actual spending history so I start with
realistic targets.

### Acceptance Criteria

- [ ] Analyze 3 months of categorized spending: per-category averages, medians,
      and trends
- [ ] Per-category budget recommendation using median with 10% variance buffer
- [ ] First-time setup: pre-fill budget creation with recommendations
- [ ] Existing budget review: periodic prompt showing current vs recommended
- [ ] Trend awareness: flag categories with increasing spend trends
- [ ] User preference learning: store adjustment ratios for future use
- [ ] Income awareness: warn if recommendations exceed 90% of monthly income
- [ ] All computation in KMP shared module. No data sent externally

### Algorithm

```
for each category with >= 6 transactions over 3+ months:
  monthly_amounts = aggregate spending by month
  recommended = median(monthly_amounts) * 1.10
  trend = linear_regression_slope(monthly_amounts)
  if trend > 0.05: flag as increasing
  if user_adjustment exists: recommended *= adjustment_ratio
```

---

## Spec 8: Spending Forecast with Confidence Intervals (#328)

### User Story

As a user planning for the future, I want to see projected spending by category
with confidence ranges so I understand both the likely amount and the
uncertainty.

### Acceptance Criteria

- [ ] Per-category forecast using exponentially weighted moving average of
      last 6 months
- [ ] 80% confidence interval from historical variance per category
- [ ] Fan chart visualization: point estimate center line with 50% and 80%
      confidence bands
- [ ] Aggregate forecast combining all categories with propagated CIs
- [ ] Seasonal adjustment using 12-month lookback for known patterns
- [ ] Accuracy tracking: compare forecast vs actual after each month
- [ ] Interactive drill-down per category: details, trend, band explanation
- [ ] All calculations in KMP shared module. No data sent externally

### Algorithm

```
for each category:
  monthly_spends = last 6 months
  weights = [0.05, 0.10, 0.15, 0.20, 0.25, 0.25]
  forecast = weighted_average(monthly_spends, weights)
  variance = weighted_variance(monthly_spends, weights)
  ci_80 = forecast +/- 1.28 * sqrt(variance)
  ci_50 = forecast +/- 0.67 * sqrt(variance)
```

---

## Cross-Cutting Concerns

### Privacy

All seven features process data exclusively on-device. No financial data is sent
to any server. Watchlist and subscription configurations sync via the existing
encrypted CRDT layer. Suggestions and forecasts are generated fresh per device.

### Performance Budget

| Feature                | Target                  |
| ---------------------- | ----------------------- |
| NLP parsing            | < 50ms                  |
| Subscription detection | < 500ms / 10k txns      |
| Forecast calculation   | < 200ms / 50 categories |
| Watchlist check        | < 10ms / transaction    |

### Minimum Data Requirements

| Feature                     | Minimum Data                   |
| --------------------------- | ------------------------------ |
| #316 Watchlists             | 1 category with spending       |
| #318 Bulk editing           | 2+ transactions                |
| #322 NLP input              | None (works immediately)       |
| #324 Predictive balance     | 1 month history                |
| #325 Subscription detect    | 2+ months history              |
| #326 Savings suggestions    | 3+ months categorized spending |
| #327 Budget recommendations | 3+ months categorized spending |
| #328 Spending forecast      | 3+ months categorized spending |

---

## Implementation Order

```
Phase 1 (Stage 9):     #318 Bulk Editing > #316 Watchlists
Phase 2 (Stage 10 Core): #322 NLP Input > #325 Subscription Detection
Phase 3 (Stage 10 Intel): #324 Predictive Balance > #328 Forecast
Phase 4 (Stage 10 AI):  #327 Budget Recs > #326 Savings Suggestions
```

Rationale: Productivity features first (no data requirements). Intelligence
features require accumulated history. AI features depend on statistical
foundation from #324 and #328.

---

## Acceptance Criteria Checklist

- [x] #316 Spending watchlists: user story, criteria, data model, UX
- [x] #318 Bulk editing: operations, keyboard shortcuts, undo, sync safety
- [x] #322 NLP input: parsing spec, architecture, multi-language foundation
- [x] #324 Predictive balance: algorithm, confidence intervals, visualization
- [x] #325 Subscription detection: algorithm, alerts, overrides
- [x] #326 Savings suggestions: personalization, goal-awareness, privacy
- [x] #327 Budget recommendations: analysis, learning, income awareness
- [x] #328 Spending forecast: fan charts, seasonal adjustment, accuracy
- [x] Cross-cutting: privacy, performance, accessibility documented
- [x] Implementation order with dependency rationale
