# Transactions

Transactions are the heartbeat of Finance. Every time money enters or leaves one of your accounts, you record a transaction. This guide covers all the ways to create, view, edit, search, and manage transactions.

---

## Table of Contents

- [Quick-entry: the daily workflow](#quick-entry-the-daily-workflow)
- [Transaction fields](#transaction-fields)
- [Transaction types](#transaction-types)
- [Viewing your transactions](#viewing-your-transactions)
- [Filtering and searching](#filtering-and-searching)
- [Editing a transaction](#editing-a-transaction)
- [Deleting a transaction](#deleting-a-transaction)
- [Splitting a transaction](#splitting-a-transaction)
- [Transfers between accounts](#transfers-between-accounts)
- [Categories](#categories)
- [Recurring transactions](#recurring-transactions)
- [Tips and best practices](#tips-and-best-practices)

---

## Quick-entry: the daily workflow

Recording a transaction is the action you'll do most. Finance is designed so this takes **under 10 seconds**.

### Steps

1. **Tap the + button** — it's always accessible as a floating action button (FAB) on mobile or via `Ctrl+N` / `⌘+N` on desktop.
2. **Type the amount** — for example, `12.50`. No need to type the currency symbol.
3. **Pick a category** — Finance suggests one based on your recent habits. Tap the suggestion or choose from the list.
4. **Tap Save**.

Done. Your account balance updates, your budget reflects the spend, and you're back to whatever you were doing.

### What happens behind the scenes

- The transaction is saved to your **local encrypted database** immediately.
- The account balance recalculates instantly.
- The budget category's remaining amount decreases.
- If sync is enabled, the transaction is queued and pushed to the server in the background.

> 🎯 **Design goal:** The most common transaction (buying coffee, paying for lunch) should be completable in 3 taps. Extra details are always optional.

---

## Transaction fields

Every transaction has these fields:

| Field        | Required | Description                                          |
| ------------ | :------: | ---------------------------------------------------- |
| **Amount**   | ✅       | How much money (always positive; type determines sign) |
| **Category** | ✅       | What the money was for (e.g., Food > Groceries)      |
| **Account**  | ✅       | Which account the money came from or went to         |
| **Date**     | ✅       | When it happened (defaults to today)                 |
| **Payee**    | ❌       | Who you paid or received money from                  |
| **Notes**    | ❌       | Any context you want to remember                     |
| **Type**     | ✅       | Expense, income, or transfer (auto-detected)         |

The quick-entry flow only asks for **amount** and **category** — everything else is either auto-filled (account defaults to last used, date defaults to today) or optional.

---

## Transaction types

Finance supports three transaction types:

### Expense

Money leaving your account. This is the most common type — groceries, rent, subscriptions, dining.

- Decreases account balance
- Counts against your budget
- Example: $45.00 at a restaurant → debited from your checking account, categorized as "Dining Out"

### Income

Money entering your account — salary, freelance payment, gift, refund.

- Increases account balance
- Adds to your "To Budget" amount
- Example: $3,500 paycheck → credited to your checking account, categorized as "Income > Salary"

### Transfer

Money moving between your own accounts. See [Transfers between accounts](#transfers-between-accounts) below.

---

## Viewing your transactions

The **Transactions** tab shows a chronological list of all your transactions, newest first.

Each row shows:

- **Date** (grouped by day)
- **Payee or description**
- **Category** icon and name
- **Amount** (color-coded: expenses in one color, income in another)

### Running balance

When viewing transactions for a specific account, a **running balance** shows alongside each transaction so you can see your account balance at any point in time.

### Pagination

If you have hundreds or thousands of transactions, the list loads more as you scroll (infinite scroll). Performance stays smooth regardless of how many transactions you have.

---

## Filtering and searching

### Filters

Tap the filter icon on the Transactions screen to narrow the list:

| Filter          | Options                                            |
| --------------- | -------------------------------------------------- |
| **Account**     | Show transactions from a specific account          |
| **Category**    | Show transactions in a specific category           |
| **Date range**  | Show transactions within a date window             |
| **Amount range**| Show transactions above or below a certain amount  |
| **Type**        | Expense only, income only, or transfers only       |

Filters can be combined. For example: "Show me all Food expenses over $50 from my Checking account this month."

### Search

Tap the search icon (or press `/` on desktop) to search across:

- Payee names
- Notes
- Category names
- Amounts

Search results show matching transactions with an **aggregate total** at the bottom — useful for questions like "How much have I spent at Amazon this year?"

> 💡 Search works fully offline. Finance uses your local database, so it's fast even without internet.

---

## Editing a transaction

Made a mistake? Miscategorized something? No problem.

1. Tap the transaction to open its detail screen.
2. Tap **Edit** (pencil icon).
3. Change any field: amount, category, account, payee, date, notes.
4. Tap **Save**.

When you change a transaction:

- Account balances recalculate automatically.
- If you changed the category, both the old and new budget categories update.
- The edit timestamp is recorded for sync purposes.

---

## Deleting a transaction

1. Tap the transaction to open its detail screen.
2. Tap **Delete** (or swipe left on the transaction row on supported platforms).
3. Confirm the deletion.

Deletion effects:

- Account balance recalculates.
- Budget category balance recalculates.
- An **undo option** appears for 10 seconds after deletion — tap it to restore the transaction.

> 📌 Deletions are **soft deletes** internally (a `deleted_at` timestamp, not a hard removal). This allows sync to propagate the deletion to your other devices cleanly.

---

## Splitting a transaction

Sometimes a single purchase covers multiple categories — for example, a Costco run that includes groceries, household supplies, and personal care items.

### Steps

1. Create a new transaction (or edit an existing one).
2. Tap **Split**.
3. Add 2–10 split lines, each with its own **category** and **amount**.
4. The split totals must exactly equal the transaction total.
5. Tap **Save**.

### Example

A $125.00 Costco purchase:

| Split line      | Category          | Amount   |
| --------------- | ----------------- | -------- |
| Line 1          | Food > Groceries  | $80.00   |
| Line 2          | Household         | $30.00   |
| Line 3          | Personal Care     | $15.00   |
| **Total**       |                   | **$125.00** |

Each budget category updates with its share. The transaction appears in your list as a single entry, but you can expand it to see the splits.

> 🧮 If your split amounts don't quite add up due to rounding, Finance allocates the remainder to the last split line using banker's rounding.

---

## Transfers between accounts

Transfers move money between your own accounts. They are not expenses — they don't affect your budget.

### Steps

1. Tap the **+** button.
2. Select **Transfer** as the type.
3. Choose the **from** account and the **to** account.
4. Enter the amount.
5. Tap **Save**.

Finance creates two linked transactions:

- A debit in the source account
- A credit in the destination account

Both appear in their respective account histories with a distinct transfer icon. They're linked, so editing or deleting one updates the other.

### Common use cases

- Paying your credit card bill (transfer from Checking → Credit Card)
- Moving money to savings (transfer from Checking → Savings)
- Reimbursing yourself from cash (transfer from Cash → Checking)

---

## Categories

Categories organize your transactions into meaningful groups so you can see where your money goes.

### Default categories

Finance ships with sensible defaults:

| Top-level    | Example sub-categories                       |
| ------------ | -------------------------------------------- |
| Food         | Groceries, Dining Out, Coffee & Tea          |
| Transport    | Gas, Public Transit, Parking, Rideshare      |
| Housing      | Rent/Mortgage, Maintenance, Insurance        |
| Utilities    | Electric, Water, Internet, Phone             |
| Health       | Doctor, Pharmacy, Gym                        |
| Personal     | Clothing, Haircuts, Personal Care            |
| Entertainment| Streaming, Events, Hobbies                   |
| Shopping     | Online, Electronics, Home Goods              |
| Education    | Courses, Books, Supplies                     |
| Income       | Salary, Freelance, Gifts, Refunds           |

### Custom categories

You can create your own categories and sub-categories:

1. Go to **More → Settings → Categories** (or tap **Manage Categories** from any category picker).
2. Tap **Add Category**.
3. Enter a name, choose a parent (or make it top-level), pick an icon and color.
4. Tap **Save**.

Categories can be up to 3 levels deep. You can reorder them by dragging, and the category picker always shows your most-used categories first.

### Smart suggestions

After a few transactions, Finance starts suggesting categories based on your history. If you always categorize "Starbucks" as "Coffee & Tea," Finance suggests that category automatically next time.

---

## Recurring transactions

> 🔄 Recurring transaction scheduling is **planned for a future release**. Currently, you record each transaction manually.

When available, recurring transactions will let you set up repeating entries (subscriptions, rent, salary) that auto-generate on a schedule.

---

## Tips and best practices

1. **Record transactions immediately.** The best time to log a purchase is right after you make it — while the amount and context are fresh. The quick-entry flow is designed for this.

2. **Use payee names consistently.** Entering "Starbucks" the same way each time helps search and future auto-categorization.

3. **Don't stress about categories.** If you're not sure where something goes, pick "Uncategorized" and fix it later during a weekly review.

4. **Review weekly.** Spend 5 minutes each week scanning your transactions. Correct any miscategorizations, add missing entries, and check that your balance matches your bank.

5. **Use splits for multi-category purchases.** A Walmart or Costco run usually spans multiple categories. Splits keep your budget accurate.

6. **Search is powerful.** Use it to answer questions like "How much did I spend on coffee this month?" or "What was that Amazon order on the 15th?"

7. **Undo is your friend.** Accidentally deleted a transaction? Tap the undo button within 10 seconds to restore it.

---

_Next: [Budgets](budgets.md) · Previous: [Accounts](accounts.md) · Back to [Getting Started](../getting-started.md)_
