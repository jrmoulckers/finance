# Account Management

Accounts in Finance represent your real-world financial accounts — checking, savings, credit cards, cash wallets, loans, and more. This guide covers everything you can do with accounts.

---

## Table of Contents

- [What is an account?](#what-is-an-account)
- [Account types](#account-types)
- [Creating an account](#creating-an-account)
- [Viewing your accounts](#viewing-your-accounts)
- [Editing an account](#editing-an-account)
- [Adjusting an account balance](#adjusting-an-account-balance)
- [Archiving and un-archiving accounts](#archiving-and-un-archiving-accounts)
- [Transfers between accounts](#transfers-between-accounts)
- [Understanding net worth](#understanding-net-worth)
- [Tips and best practices](#tips-and-best-practices)

---

## What is an account?

An account is a container for your money. Every transaction you record belongs to an account, and the account's balance updates automatically based on your transactions.

Think of it this way: if you could open an app and see the balance of every real financial account you have — checking, savings, credit card, the cash in your wallet — that's what the Accounts screen gives you.

---

## Account types

Finance supports seven account types. The type determines how the account is categorized and whether it counts as an asset or a liability.

| Type            | Category    | Example                                 |
| --------------- | ----------- | --------------------------------------- |
| **Checking**    | Asset       | Chase Checking, Bank of America Primary |
| **Savings**     | Asset       | Emergency Fund, House Down Payment      |
| **Credit Card** | Liability   | Visa, Amex, Store card                  |
| **Cash**        | Asset       | Wallet, Petty cash                      |
| **Investment**  | Asset       | Brokerage account, 401(k) balance       |
| **Loan**        | Liability   | Student loans, Car loan, Mortgage       |
| **Other**       | Configurable| Gift cards, HSA, Prepaid cards          |

**Assets** are things you own (money you have). **Liabilities** are things you owe (money you owe). Your **net worth** is assets minus liabilities.

---

## Creating an account

1. Go to **More → Accounts** (or tap **Add Account** during onboarding).
2. Tap **Add Account** (the + button).
3. Fill in the details:
   - **Name** — a descriptive name (max 50 characters). Examples: "Chase Checking", "Vacation Savings", "Amex Gold".
   - **Type** — select from the list above.
   - **Initial balance** — the current balance of the account right now.
   - **Icon** — an icon is auto-selected based on the account type, but you can change it.
4. Tap **Save**.

The account appears in your list immediately. It's saved to your local database first (so it works offline) and syncs to your other devices when a connection is available.

### How many accounts should I create?

Start with the accounts you use daily — typically your primary checking account and one credit card. You can add more anytime.

Some people track every account down to the penny. Others only track active spending accounts and ignore long-term investments. Both approaches are valid. Finance doesn't judge.

---

## Viewing your accounts

The Accounts screen (under **More → Accounts**) shows all your accounts grouped by type:

```
Assets
  Chase Checking ........... $3,240.00
  Emergency Savings ........ $8,500.00
  Wallet Cash ..............    $45.00
  ─────────────────────────────────────
  Total Assets              $11,785.00

Liabilities
  Amex Gold ............... -$1,200.00
  Student Loan ........... -$18,000.00
  ─────────────────────────────────────
  Total Liabilities        -$19,200.00

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Net Worth                   -$7,415.00
```

Each account row shows:

- **Account name** and icon
- **Current balance** (updated in real time as you enter transactions)
- **Last transaction date** (so you can see which accounts need attention)

> ♿ All balances are announced by screen readers with the correct currency — for example, "Chase Checking, three thousand two hundred forty dollars."

---

## Editing an account

To edit an account's name, type, icon, or notes:

1. Tap the account to open its detail screen.
2. Tap the **Edit** button (pencil icon).
3. Change the fields you want to update.
4. Tap **Save**.

### What you can edit

- ✅ Account name
- ✅ Account type
- ✅ Icon
- ✅ Notes

### What you cannot directly edit

- ❌ **Balance** — the balance is calculated from your transactions. To correct it, use a balance adjustment (see below).

This prevents your balance from ever getting out of sync with your transaction history.

---

## Adjusting an account balance

If your account balance in Finance doesn't match the real balance (maybe you forgot to record some transactions), you can fix it:

1. Open the account.
2. Tap **Adjust Balance**.
3. Enter the **correct current balance**.
4. Finance creates an **adjustment transaction** for the difference.

For example, if Finance shows $3,240 but your bank says $3,180, Finance creates a -$60 adjustment transaction. This keeps your transaction history accurate and auditable.

---

## Archiving and un-archiving accounts

When you close a real-world account (paid off a credit card, closed a bank account), you can archive it in Finance:

1. Open the account.
2. Tap **Archive Account**.
3. Confirm.

### What archiving does

- ✅ Removes the account from your main account list (less clutter)
- ✅ Preserves all historical transactions (you can still search and view them)
- ✅ Excludes the account's balance from your net worth calculation
- ✅ Moves the account to the **Archived** section (visible if you scroll down or filter)

### Un-archiving

Changed your mind? Go to the **Archived** section, open the account, and tap **Un-archive**. It returns to your main list with all history intact.

> 📌 Archiving is a **soft action** — nothing is deleted. It's just hidden from your daily view.

---

## Transfers between accounts

When you move money between your own accounts (e.g., checking to savings), use a **transfer** instead of a regular transaction:

1. On the Transactions screen, tap the **+** button.
2. Select **Transfer** as the transaction type.
3. Choose the **source account** (where the money comes from).
4. Choose the **destination account** (where the money goes).
5. Enter the **amount**.
6. Tap **Save**.

### How transfers work

- Finance creates **two linked transactions** — a debit in the source account and a credit in the destination account.
- Both account balances update immediately.
- Transfers **do not affect any budget category** — moving money between your own accounts isn't spending.
- Transfers are displayed with a distinct transfer icon so you can tell them apart from regular transactions.

### Example

You transfer $500 from Chase Checking to your Emergency Savings:

| Account             | Before    | After      |
| ------------------- | --------- | ---------- |
| Chase Checking      | $3,240.00 | $2,740.00  |
| Emergency Savings   | $8,500.00 | $9,000.00  |
| **Net worth change**| —         | **$0.00**  |

Net worth doesn't change because the money is still yours — it's just in a different place.

---

## Understanding net worth

Your **net worth** is the total of all your asset accounts minus the total of all your liability accounts. It's displayed at the bottom of the Accounts screen and tracked over time in the **Reports → Net Worth** chart.

```
Net Worth = Total Assets − Total Liabilities
```

Net worth is one of the most important numbers in personal finance because it gives you a single-number answer to "How am I doing financially?" over time. Even if your income or spending fluctuates, watching your net worth trend upward month over month means you're building wealth.

### What's included

- ✅ All active (non-archived) accounts
- ❌ Archived accounts are excluded
- ❌ Investment performance (price changes) is not auto-tracked — update investment balances manually if you want them reflected

---

## Tips and best practices

1. **Name accounts clearly.** Use the bank name and account type: "Chase Checking" is more useful than "My Account" when you have multiple accounts.

2. **Start simple.** Track 1–3 accounts at first. Add more as you build the habit.

3. **Reconcile periodically.** Once a week or once a month, compare your Finance balance to your real bank balance. If they differ, use a balance adjustment.

4. **Use the right type.** Setting the correct account type ensures your net worth calculation is accurate (assets vs. liabilities).

5. **Archive, don't delete.** When you close an account, archive it rather than deleting. You keep the history without the clutter.

6. **Credit card tip.** Enter your credit card balance as the amount you currently owe. When you make a payment, record it as a transfer from your checking account to the credit card.

---

_Next: [Transactions](transactions.md) · Back to [Getting Started](../getting-started.md)_
