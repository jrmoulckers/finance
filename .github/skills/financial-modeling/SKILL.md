---
name: financial-modeling
description: >
  Financial calculation and modeling knowledge for budgeting, transaction
  processing, goal tracking, and reporting. Use for topics related to money,
  budget, transaction, currency, financial calculation, balance, or accounting.
---

# Financial Modeling Skill

This skill provides domain knowledge for implementing correct financial calculations and models in the Finance application.

## Money Representation

### The Golden Rule: No Floating Point

```
WRONG: let balance = 19.99          // floating point — will cause rounding errors
RIGHT: let balanceCents = 1999      // integer cents — exact representation
RIGHT: let balance = Decimal("19.99") // fixed-precision decimal
```

- Store monetary values as **integers in the smallest currency unit** (cents, pence, etc.)
- Alternatively, use a fixed-precision decimal type if the language provides one
- Display formatting is a UI concern — format at the presentation layer only

### Currency Handling

- Always store the **ISO 4217 currency code** alongside every monetary value
- Never assume a default currency
- Exchange rates are time-sensitive — store the rate AND the timestamp
- Multi-currency accounts need a base currency for reporting

```
Transaction {
  amount: 1999,          // integer cents
  currency: "USD",       // ISO 4217
  exchangeRate: null,    // null if same as account currency
  exchangeDate: null
}
```

## Budgeting Models

### Envelope / Zero-Based (YNAB-style)
- Every dollar has a job — income is allocated to categories
- Categories can be overspent (negative available)
- Overspending rolls over or is covered from other categories
- Budget period is typically monthly but should be configurable

### Budget Calculations
```
available = allocated - spent + rolledOver
spent = sum(transactions in category for period)
rolledOver = previous period's remaining (if carry-over enabled)
```

### Budget Alerts
- Threshold-based alerts (80% spent, 100% spent, overspent)
- Trend alerts (spending pace ahead of historical average)
- Goal progress alerts (on track, behind, ahead)

## Transaction Processing

### Transaction Types
- **Income** — Money coming in (salary, refund, gift)
- **Expense** — Money going out (purchase, bill, fee)
- **Transfer** — Money between accounts (always creates two linked entries)
- **Split** — A single transaction split across multiple categories

### Transaction Categorization
- Support hierarchical categories (Food > Groceries > Organic)
- Auto-categorization based on payee history
- Allow manual override that feeds back into learning
- Support multiple tags in addition to categories

### Recurring Transactions
- Store the schedule definition, not future instances
- Generate upcoming instances on-demand (for display and budgeting)
- Handle variable amounts (estimated vs. actual)
- Support skip, modify single instance, modify series

## Goal Tracking

```
Goal {
  targetAmount: 500000,     // $5,000.00 in cents
  currentAmount: 125000,    // $1,250.00 saved so far
  deadline: "2026-12-31",   // target date
  monthlyTarget: 41667,     // calculated: remaining / months left
}
```

- Recalculate projections whenever contributions change
- Support multiple funding sources (dedicated account, virtual allocation)
- Show progress as percentage AND absolute values
- Consider compound interest for savings goals

## Reporting

### Net Worth
```
netWorth = sum(asset accounts) - sum(liability accounts)
```
- Track over time for trend analysis
- Exclude closed accounts from active calculations but preserve history

### Spending Analysis
- Category breakdown (pie/bar chart data)
- Trend over time (monthly spending per category)
- Comparison to budget (actual vs. planned)
- Income vs. expense ratio

## Rounding Rules

- Use **banker's rounding** (round half to even) for financial calculations
- When splitting amounts, allocate the remainder to the last item
- Example: $10.00 split 3 ways = $3.34 + $3.33 + $3.33

## Testing Financial Logic

- Test boundary conditions (zero amounts, maximum values, negative balances)
- Test currency conversion with known exchange rates
- Test rounding with amounts that produce fractional cents
- Test budget rollover across period boundaries
- Test split transactions sum to the original total
- Use property-based testing where applicable (sum of splits = total, etc.)
