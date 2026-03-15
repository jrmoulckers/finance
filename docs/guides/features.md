# Feature Guide

A complete guide to everything Finance can do. Each section explains what the feature is, why it's useful, and how to use it.

---

## Table of Contents

- [Accounts](#accounts)
- [Transactions](#transactions)
- [Categories](#categories)
- [Budgets](#budgets)
- [Goals](#goals)
- [Reports & Analytics](#reports--analytics)
- [Multi-Currency](#multi-currency)
- [Data Export](#data-export)
- [Household Sharing](#household-sharing)
- [Experience Levels](#experience-levels)

---

## Accounts

An account represents any place you keep or owe money. Your accounts form the foundation of your financial picture.

### Account types

| Type | What it's for | Examples |
| --- | --- | --- |
| **Checking** | Everyday spending | Chase Checking, Bank of America |
| **Savings** | Money set aside | Emergency fund, vacation savings |
| **Credit Card** | What you owe on cards | Visa, Amex, store cards |
| **Cash** | Physical money on hand | Wallet, cash jar |
| **Investment** | Brokerage and retirement | 401(k), Robinhood, Vanguard |
| **Loan** | Debt you're paying down | Mortgage, student loans, car payment |

### Adding an account

1. Go to **Accounts**.
2. Tap **Add Account**.
3. Enter a name, choose the type, and set the current balance.
4. Tap **Save**.

The account appears in your list, grouped by type: assets (things you own) on top, liabilities (things you owe) below. Your **net worth** — total assets minus total liabilities — appears at the top.

### Managing accounts

- **Edit**: Tap an account to change its name, type, or icon.
- **Archive**: No longer using an account? Archive it instead of deleting it. The history stays searchable, but it's hidden from your main list and excluded from net worth. You can un-archive anytime.
- **Balance adjustments**: You can't directly edit a balance (that would break your history). Instead, Finance creates an "adjustment" transaction to correct it, keeping your records accurate.

> 💡 Each account gets an auto-selected icon based on its type, but you can customize it.

---

## Transactions

Transactions record every time money moves — spending, income, transfers, and everything in between.

### Quick entry (the everyday flow)

This is the action you'll use most — and it's designed for speed:

1. Tap **+** (available from any screen).
2. Enter the amount.
3. Pick a category.
4. Tap **Save**.

Three taps, under 10 seconds. You'll feel a subtle haptic confirmation when it saves.

> 💡 Finance suggests categories based on your recent entries. The more you use it, the smarter the suggestions get.

### Adding more detail

Before saving, tap **More details** to add:

- **Payee** — who you paid or who paid you (e.g., "Amazon", "Employer")
- **Date** — defaults to today; change it for past transactions
- **Notes** — any context (e.g., "Birthday gift for Mom")
- **Tags** — custom labels like "vacation" or "tax-deductible"
- **Account** — which account this transaction belongs to (defaults to your last-used account)

### Editing and deleting

- **Edit**: Tap any transaction to change the amount, category, payee, date, or notes. Budgets and balances recalculate automatically.
- **Delete**: Swipe to delete (with confirmation). An undo option appears for 10 seconds.

### Transfers

To move money between your own accounts:

1. Tap **+** → select **Transfer**.
2. Choose the **from** and **to** accounts.
3. Enter the amount.
4. Tap **Save**.

Transfers create two linked records (one debit, one credit) and don't affect any budget category. They show up in both account histories with a distinct transfer icon.

**Example:** Moving $500 from Checking ($3,000) to Savings ($20,000) → Checking becomes $2,500, Savings becomes $20,500.

### Split transactions

Bought multiple categories of things in one purchase? Split it:

1. Enter the total amount (e.g., $125 at Costco).
2. Tap **Split**.
3. Assign amounts to categories:
   - Groceries: $80
   - Household: $30
   - Personal Care: $15
4. The split must add up to the total.

Split transactions appear as a single entry that expands to show each category's portion.

### Recurring transactions

Set up transactions that repeat on a schedule — subscriptions, bills, paychecks:

1. Create a transaction as usual.
2. Tap **Make Recurring**.
3. Choose a schedule: daily, weekly, bi-weekly, monthly, yearly, or custom.
4. Finance generates future instances automatically.

You can:

- Skip a single instance
- Modify just one occurrence or the entire series
- Set a variable amount (enter the actual amount when it hits)
- Get a notification before upcoming bills

**Example:** A $15/month Netflix subscription on the 1st → it appears automatically each month.

### Search and filter

Find any transaction quickly:

- **Search** by payee name, notes, or amount
- **Filter** by account, category, date range, or amount range
- Search results show matching transactions with a total sum

Search works entirely offline — it queries your local database directly.

---

## Categories

Categories organize your transactions into spending and income groups.

### Default categories

Finance ships with sensible defaults arranged in a hierarchy:

- **Food** → Groceries, Dining Out, Coffee & Tea
- **Transport** → Gas, Public Transit, Ride Share
- **Housing** → Rent/Mortgage, Insurance, Maintenance
- **Utilities** → Electric, Water, Internet, Phone
- **Health** → Medical, Pharmacy, Fitness
- **Personal** → Clothing, Haircare, Personal Care
- **Entertainment** → Streaming, Events, Hobbies
- **Shopping** → General, Electronics, Gifts
- **Education** → Courses, Books, Supplies
- **Income** → Salary, Freelance, Investments

Plus an "Uncategorized" catch-all.

### Custom categories

Create your own categories:

1. Go to **Settings → Categories** (or long-press a category picker).
2. Tap **Add Category**.
3. Enter a name, choose an icon and color, and pick a parent category (or make it top-level).
4. Tap **Save**.

You can nest up to 3 levels deep.

### Editing and organizing

- **Rename or restyle**: Change a category's name, icon, or color anytime.
- **Reorder**: Drag categories to put your most-used ones at the top. A keyboard alternative is available for accessibility.
- **Move**: Reassign a sub-category to a different parent.
- **Delete**: You'll need to reassign any existing transactions to another category first.

### Auto-categorization rules

Finance can learn from your patterns:

- If you categorize a "Starbucks" transaction as "Coffee & Tea," Finance will suggest that category next time you enter a Starbucks transaction.
- Suggestions always ask for confirmation — nothing is silently auto-assigned.
- You can view and edit these rules in **Settings → Category Rules**.

---

## Budgets

Finance uses **envelope budgeting** — a method where every dollar of income gets assigned to a specific category. It's like putting cash into labeled envelopes for each spending area.

### Creating a budget

1. Go to **Budget**.
2. Tap **Set Up Budget** (or Finance prompts you after your first income entry).
3. Enter your monthly income.
4. Assign amounts to each category.
5. The **"To Budget"** counter counts down to $0 — when every dollar has a job, you're set.

> 💡 If you're new to budgeting, Finance suggests a **50/30/20** split as a starting point: 50% needs, 30% wants, 20% savings.

### Tracking progress

Each budget category shows:

- **Budgeted** — how much you assigned
- **Spent** — how much you've used
- **Remaining** — what's left

A progress bar fills as you spend:

- 🟢 **Under 80%** — on track
- 🟡 **80–100%** — getting close
- Past 100% the bar continues — no alarm, just information

Finance uses non-judgmental language. You'll never see "You overspent!" Instead:

> _"You've used 110% of your Food plan — want to adjust?"_

### Budget periods

Monthly is the default, but you can set budgets for different time periods:

- Weekly
- Bi-weekly
- Monthly
- Yearly
- Custom date range

### Rollover

What happens to unspent money at the end of the period?

- **Rollover on** (per category): Unspent money carries forward. If you budgeted $600 for food and only spent $400, next month starts with that $200 plus your new allocation.
- **Rollover off**: Each period starts fresh.
- **Negative rollover**: If you overspend, the debt carries to next month (so you can make up for it).

To enable rollover: tap a budget category → toggle **Rollover**.

### Covering overspending

Went over in one category? Move money from another:

1. Tap the overspent category.
2. Tap **Cover**.
3. Choose a category that has remaining budget.
4. Enter the amount to move.

**Example:** Entertainment has $100 left. Dining is $50 over. Move $50 from Entertainment → both categories balanced.

### Budget alerts

Get a gentle heads-up when you're approaching a limit:

- Configurable thresholds: 50%, 80%, 100%
- Notifications are opt-in and use friendly language:

> _"You've used 80% of your Food budget this month."_

---

## Goals

Goals help you save toward specific targets — whether it's a rainy day fund, a vacation, or a major purchase.

### Setting a goal

1. Go to **Goals**.
2. Tap **Add Goal**.
3. Enter:
   - **Name** — what you're saving for (e.g., "Emergency Fund")
   - **Target amount** — how much you need (e.g., $10,000)
   - **Deadline** (optional) — when you want to reach it
4. Tap **Save**.

If you set a deadline, Finance calculates how much you need to save each month to stay on track.

### Tracking progress

Each goal shows:

- A visual progress bar with percentage
- Amount saved vs. target
- On-track / behind / ahead status (if you set a deadline)
- A projection: _"At this pace, you'll reach your goal by [date]."_

### Funding a goal

Put money toward a goal in two ways:

- **From unbudgeted income**: Assign money from your "To Budget" balance directly to a goal.
- **From budget categories**: Move allocation from a budget category to a goal.

Each contribution appears in the goal's history.

### Milestone celebrations 🎉

Finance celebrates your progress:

- **25%** — "Great start!"
- **50%** — "Halfway there!"
- **75%** — "Almost there!"
- **100%** — "You did it! 🎉"

Milestones are positive and encouraging — never pressuring.

---

## Reports & Analytics

Finance turns your data into clear, actionable insights. All reports are available offline and work with your local data.

### Spending by category

See where your money goes with a visual breakdown:

- A donut chart shows each category's share of spending
- Tap any category to see the individual transactions
- Switch between time periods: this month, last month, or a custom date range
- Total spending for the period appears at the top

The chart uses a **color-blind safe palette** so it's readable for everyone. An accessible list view is also available.

### Spending trends

Track how your spending changes over time:

- A bar or line chart shows monthly totals
- Filter by a specific category or view all spending
- Choose a time range: 3, 6, or 12 months
- A trend indicator shows if spending is going up or down compared to the previous period

**Example:** _"Dining spending is down 12% compared to last month."_

### Income vs. expenses

Compare what comes in to what goes out:

- Side-by-side view of income and expenses
- **Savings rate** — the percentage of income you keep
- Monthly trend over time
- Breakdown by income source

**Example:** Income: $5,000. Expenses: $3,800. Savings: $1,200 (24% savings rate).

### Net worth

Track your overall financial position over time:

- **Net worth** = total assets − total liabilities
- A line chart shows the trend over months and years
- Breakdown by individual account
- Archived accounts are excluded

All report data is also available as tables (not just charts) for accessibility.

---

## Multi-Currency

Finance supports multiple currencies for people who earn, spend, or save in more than one currency.

### Setting your default currency

During setup (or anytime in Settings), choose your primary currency. Finance supports all ISO 4217 currencies and formats amounts with the correct symbol, decimal places, and position.

### Using multiple currencies

- Each account can have its own currency.
- Transactions are recorded in the account's currency.
- Reports and summaries show totals converted to your default currency.

### Exchange rates

Finance handles currency display so you always know what you have in each currency. Multi-currency balances are shown alongside converted values in your default currency.

---

## Data Export

You own your data. Finance makes it easy to take it with you.

### How to export

1. Go to **Settings → Export**.
2. Choose a format:
   - **JSON** — complete export, includes all data (accounts, transactions, categories, budgets, goals)
   - **CSV** — spreadsheet-friendly export of transactions
3. Tap **Export**.
4. The file saves to your device or opens your platform's share sheet.

### What's included

| Format | Includes |
| --- | --- |
| JSON | Accounts, transactions, categories, budgets, goals, plus metadata (export date, record counts, integrity check) |
| CSV | Transaction history with dates, amounts, payees, categories, and notes |

Export is instant — no waiting for an email. The file is generated on your device from your local data.

> 💡 Data export is available on the free tier. It's also how Finance satisfies your legal right to data portability under GDPR and CCPA.

---

## Household Sharing

Share your financial picture with a partner or family — while keeping personal finances private.

> ⚠️ Household sharing is a **premium feature** available with a paid subscription.

### Creating a household

1. Go to **Settings → Household**.
2. Tap **Create Household**.
3. Give it a name (e.g., "Smith Family Finances").

You're the **owner** of the household.

### Inviting members

1. From your household screen, tap **Invite Member**.
2. Enter their email address or share an invite link.
3. They accept the invitation from their Finance app.

Invitations expire after 72 hours for security.

### Roles and permissions

| Role | Can do |
| --- | --- |
| **Owner** | Full control — manage members, edit everything, delete the household |
| **Partner** | Edit shared accounts and budgets, view everything |
| **Member** | Edit their own entries, view shared items |
| **Viewer** | Read-only access to shared items |

The owner can change anyone's role. No one can escalate their own permissions.

### Shared vs. personal

- **Shared accounts and budgets** are visible to all household members
- **Personal accounts** remain private — only you can see them
- Budget categories can be flagged as "shared" (like rent) or "personal" (like hobbies)
- Shared spending rolls up into shared reports

### How it works technically

- Household data syncs through the same encrypted sync system
- Each household has its own encryption key
- Access is enforced server-side — permissions can't be bypassed
- If a member leaves, their access is revoked immediately

---

## Experience Levels

Finance adapts to your comfort level with financial concepts.

### Three levels

| Level | What it means |
| --- | --- |
| 🌱 **Getting Started** | Plain language everywhere. Guided prompts walk you through actions. Advanced features are hidden until you're ready. Proactive tips help you learn. |
| 📊 **Comfortable** | Standard financial terms with plain-language descriptions available on tap. All features visible. This is the default. |
| 🧠 **Advanced** | Traditional finance terminology. Detailed breakdowns. Power-user shortcuts. Raw data access. |

### What changes between levels

- **Terminology** — "Spending plan" vs. "Budget" vs. "Envelope allocation"
- **Visible features** — progressive disclosure based on your level
- **Default views** — simplified summaries vs. detailed breakdowns
- **Notifications** — gentle nudges vs. data-rich alerts
- **Charts** — simple bar charts vs. multi-axis visualizations

### Changing your level

Go to **Settings → Experience Level** and choose a new tier. The change takes effect immediately. You can switch as often as you like.

### Contextual help

No matter which level you choose, every financial concept in the app has an **info tap** (ℹ️). Tap it to see:

- What the concept is
- How it's calculated
- Why it matters

Finance believes in education without condescension. You should never feel lost.

---

_For more help, see the [FAQ](./faq.md) or the [Privacy & Security Guide](./privacy-security.md)._
