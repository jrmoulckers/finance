# Budgets

Finance uses **envelope budgeting** — a method where you decide in advance how to allocate every dollar of your income to specific categories. Think of it as putting cash into labeled envelopes: when the envelope is empty, you're done spending in that category (or you move money from another envelope).

This guide covers everything about creating, managing, and getting the most out of your budget.

---

## Table of Contents

- [How envelope budgeting works](#how-envelope-budgeting-works)
- [Creating your first budget](#creating-your-first-budget)
- [The budget screen explained](#the-budget-screen-explained)
- [Allocating money to categories](#allocating-money-to-categories)
- [Tracking spending against your budget](#tracking-spending-against-your-budget)
- [Covering overspending](#covering-overspending)
- [Budget rollover](#budget-rollover)
- [Monthly budget review](#monthly-budget-review)
- [Budget alerts](#budget-alerts)
- [Tips and best practices](#tips-and-best-practices)

---

## How envelope budgeting works

The idea is simple:

1. **Start with your income.** When you get paid, that money goes into a "To Budget" pool.
2. **Give every dollar a job.** Assign money from that pool to categories — Food, Rent, Transport, Entertainment, Savings, and so on.
3. **Spend from envelopes.** Each transaction you record pulls from the appropriate category's envelope.
4. **Adjust as needed.** If you overspend in one category, move money from another to cover it.

The goal is to reach **$0 in "To Budget"** — meaning every dollar has a purpose. This is called **zero-based budgeting**.

### Why this method works

- You make spending decisions **before** you spend, not after.
- You always know how much is left in each category.
- There are no surprises at the end of the month.
- It builds awareness: you notice spending patterns quickly.

---

## Creating your first budget

### Guided setup

If this is your first time, Finance walks you through the process:

1. Go to the **Budget** tab.
2. Finance asks for your **monthly income** (take-home pay).
3. It suggests a starting allocation based on the **50/30/20 rule**:

   | Category group | Percentage | Example (on $4,000 income) |
   | -------------- | ---------- | -------------------------- |
   | **Needs**      | 50%        | $2,000                     |
   | **Wants**      | 30%        | $1,200                     |
   | **Savings**    | 20%        | $800                       |

4. Adjust the amounts to match your reality. The 50/30/20 split is a starting point, not a rule.
5. Tap **Save**.

### Manual setup

If you prefer to start from scratch:

1. Go to the **Budget** tab.
2. Tap **Create Budget**.
3. For each category you want to budget, enter the amount you plan to spend this month.
4. Watch the "To Budget" counter decrease as you assign money.
5. When "To Budget" reaches $0, every dollar has a job.

---

## The budget screen explained

After setup, the budget screen shows all your budgeted categories in a clear layout:

### Top section: budget summary

| Element              | What it shows                                              |
| -------------------- | ---------------------------------------------------------- |
| **Total Income**     | All income recorded this period                            |
| **To Budget**        | Income not yet assigned to a category                      |
| **Total Budgeted**   | Sum of all category allocations                            |
| **Total Spent**      | Sum of all spending this period                            |

🎯 **Goal:** "To Budget" should be **$0**. If it's positive, you have unassigned income. If it's negative, you've allocated more than you earned.

### Category rows

Each budgeted category shows three numbers:

```
Food                        $600.00 budgeted
████████████░░░░             $450.00 spent
                             $150.00 remaining
```

| Element         | Meaning                                             |
| --------------- | --------------------------------------------------- |
| **Budgeted**    | How much you allocated to this category             |
| **Spent**       | How much you've spent so far this period            |
| **Remaining**   | How much is left (budgeted − spent)                 |
| **Progress bar**| Visual indicator of how much you've used            |

### Progress bar colors

The progress bar uses color to indicate status at a glance:

| Color       | Meaning                                                |
| ----------- | ------------------------------------------------------ |
| **Green**   | Under 80% spent — on track                            |
| **Yellow**  | 80–100% spent — approaching the limit                 |
| **Neutral** | Over 100% — you've spent more than budgeted           |

> ♿ Colors are never used alone to convey information. Screen readers announce the percentage, and the progress bar includes a text label for each state.

> 💬 Finance uses **non-judgmental language**. If you go over budget, it says "You've used 110% of your Food budget" — not "You overspent on food!" The app presents facts and lets you decide what to do about them.

---

## Allocating money to categories

### From the budget screen

1. Tap a category row.
2. Enter or adjust the **budgeted amount**.
3. The "To Budget" counter updates in real time.

### From income

When you record an income transaction, it adds to "To Budget." From there, you distribute it across categories.

### Quick allocation

For common patterns, you can copy last month's budget as a starting point:

1. On the Budget screen, tap the **⋯** menu.
2. Select **Copy Last Month's Budget**.
3. All category allocations from the previous month are applied.
4. Adjust as needed.

---

## Tracking spending against your budget

Every expense transaction you record automatically deducts from the appropriate budget category. You don't need to do anything extra — just record your transactions and the budget stays up to date.

### Checking mid-month

Open the Budget tab anytime to see:

- Which categories have plenty of room left
- Which categories are getting tight
- Whether your overall spending is on pace

### What if I have transactions without a budget?

Transactions in categories you haven't budgeted for still appear in your transaction list and reports — they just won't have a progress bar or remaining amount on the budget screen. You can add a budget for those categories at any time.

---

## Covering overspending

Life happens. Sometimes you spend more than planned in a category. Finance makes it easy to rebalance:

### Steps

1. On the Budget screen, tap the **overspent category** (the one showing a negative remaining amount).
2. Tap **Cover Overspending**.
3. Finance shows other categories that still have money available.
4. Choose a category to take money from and enter the amount.
5. Tap **Save**.

### Example

| Category      | Before cover     | After covering $50 |
| ------------- | ---------------- | -------------------|
| Dining Out    | -$50 remaining   | $0 remaining       |
| Entertainment | $100 remaining   | $50 remaining      |

Both categories update instantly. No money left your accounts — you just reassigned how your budget allocations are distributed.

### When should I cover overspending?

- **Immediately** is ideal — it keeps your budget honest.
- **At your weekly review** works too.
- **At month end** at the latest — uncovered overspending rolls forward as debt (see below).

---

## Budget rollover

At the end of each month, Finance handles leftover budget amounts:

### Positive rollover (money left over)

If you budget $600 for Food but only spend $400, the remaining $200 can carry forward to next month. With rollover enabled, your Food budget next month starts with that $200 plus whatever you allocate.

### Negative rollover (overspending)

If you budgeted $600 for Food but spent $650, the -$50 rolls forward. Next month, your Food category starts $50 in the hole — you need to allocate extra to cover it.

### Configuring rollover

Rollover is configurable per category:

1. Tap a budget category.
2. Toggle **Carry Forward** on or off.

| Setting              | What happens at month end                       |
| -------------------- | ----------------------------------------------- |
| **Carry Forward ON** | Unspent money or debt rolls to the next month   |
| **Carry Forward OFF**| Category resets to $0 each month (fresh start)  |

On the budget screen, rollover amounts are shown as a separate line so you can tell the difference between last month's leftovers and this month's new allocation:

```
Food
  Rollover from last month: +$200.00
  This month's allocation:   $600.00
  ────────────────────────────────────
  Total available:           $800.00
```

---

## Monthly budget review

A monthly review helps you learn from your spending and plan for next month. Here's a suggested routine:

### End-of-month checklist

1. **Check each category.** How close were you to your budget? Which categories ran out? Which had money left over?
2. **Cover any overspending.** Move money from surplus categories to cover deficits.
3. **Review trends.** Go to **Reports → Spending Trends** to see how your spending has changed over the past 3–6 months.
4. **Adjust next month's budget.** If you consistently overspend on Food and underspend on Entertainment, adjust the allocations to match reality.
5. **Celebrate wins.** Stayed under budget this month? Made progress on a goal? Take a moment to notice.

### Reviewing budget vs. actual

The Budget screen shows budget vs. actual for the current month. For historical comparisons, go to **Reports → Budget vs. Actual** which shows side-by-side comparisons for each category across multiple months.

---

## Budget alerts

> 🔔 Budget alerts are **planned for a future release**. When available, you'll be able to receive optional notifications when you approach or exceed budget thresholds.

The planned alert system will include:

- Configurable thresholds (50%, 80%, 100%)
- Non-judgmental language (e.g., "You've used 80% of your Food budget this month")
- Platform-native notifications (opt-in only)
- Dashboard cards as an alternative to push notifications

---

## Tips and best practices

1. **Budget for real life, not ideal life.** If you spend $600 on food every month, don't budget $400 because you "should." Budget $600 and work toward reducing it gradually.

2. **Include an "Unexpected" or "Miscellaneous" category.** Every month has surprises. Having a buffer category prevents constant rebalancing.

3. **Age your money.** The ultimate goal of envelope budgeting is to spend last month's income this month. When you reach that point, you're a full month ahead — financial stress drops dramatically.

4. **Review weekly, adjust monthly.** A quick 5-minute check each week keeps you aware. A full review at month end helps you plan the next month.

5. **Don't budget to zero for fun.** Envelope budgeting works best when you budget for enjoyment too. A "Fun Money" category you spend guilt-free makes the whole system sustainable.

6. **Use the copy feature.** Most months look similar. Copy last month's budget and make small adjustments rather than starting from scratch.

7. **It's okay to go over budget.** The purpose is awareness, not perfection. Cover the overspending, learn from it, and move on.

---

_Next: [Goals](goals.md) · Previous: [Transactions](transactions.md) · Back to [Getting Started](../getting-started.md)_
