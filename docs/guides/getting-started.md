# Getting Started with Finance

Welcome to Finance — a personal finance tracker that respects your privacy, works offline, and takes less than 30 seconds a day to use. 🎉

Whether you want to track spending, build a budget, save for a goal, or just see where your money goes, this guide will walk you through everything you need to get up and running.

---

## Table of Contents

- [What is Finance?](#what-is-finance)
- [Where can I use Finance?](#where-can-i-use-finance)
- [Setting up your account](#setting-up-your-account)
- [Adding your first account](#adding-your-first-account)
- [Creating your first transaction](#creating-your-first-transaction)
- [Setting up a budget](#setting-up-a-budget)
- [Setting a savings goal](#setting-a-savings-goal)
- [Working offline](#working-offline)
- [Syncing across devices](#syncing-across-devices)
- [Tips for daily use](#tips-for-daily-use)
- [Next steps](#next-steps)

---

## What is Finance?

Finance is a personal and family finance tracker built around three ideas:

1. **Your data stays private.** Everything is stored on your device, encrypted. No bank connections required. No one sees your data but you.
2. **It works with your brain.** The app adapts to your comfort level with financial concepts — whether you're just starting out or you're a spreadsheet expert.
3. **30 seconds or less.** Recording a purchase takes three taps. Checking your budget takes a glance. The app fits into your life — not the other way around.

Finance tracks your accounts, transactions, budgets, goals, and spending — all in one place, across all your devices.

---

## Where can I use Finance?

Finance runs natively on four platforms:

| Platform | Details |
| --- | --- |
| 📱 **iOS** | iPhone, iPad, and Mac (native SwiftUI) |
| 🤖 **Android** | Phones and tablets (Jetpack Compose) |
| 🌐 **Web** | Any modern browser — installable as an app (PWA) |
| 🖥️ **Windows** | Windows 11 desktop app |

All platforms share the same core features. Your data syncs seamlessly between them if you choose to enable sync (it's optional).

For platform-specific tips like setting up Face ID or Windows Hello, see the [Platform Guides](./platforms.md).

---

## Setting up your account

When you first open Finance, you'll choose one of two paths:

### Path A: "Just let me in"

One tap and you're in. Finance auto-detects your currency and drops you into a ready-to-use dashboard. No sign-up required — you can start tracking immediately.

> 💡 You can always create an account later when you want to sync across devices.

### Path B: "Personalize my experience"

A quick 30-second setup (skippable at any point):

1. **"How do you feel about your money?"** — This helps Finance choose the right level of detail for you.
2. **Currency + First account** — Set your currency and add your first account in one step.
3. **"What matters most?"** — Pick your top priority (save more, track spending, build a budget, or reduce debt).
4. **"You're ready."** — Your personalized dashboard appears.

### Choosing your experience level

Finance offers three experience tiers — you pick the one that fits you best, and you can change it anytime in Settings:

| Level | Best for | What changes |
| --- | --- | --- |
| 🌱 **Getting Started** | New to budgeting or personal finance | Simpler language, guided prompts, fewer numbers on screen |
| 📊 **Comfortable** | You've tracked finances before | Standard view with all features visible (this is the default) |
| 🧠 **Advanced** | You love spreadsheets and data | Detailed breakdowns, technical terms, power-user shortcuts |

---

## Adding your first account

An "account" in Finance represents any place you keep money — a bank account, a credit card, your wallet, even an investment account.

**To add your first account:**

1. Go to the **Accounts** screen.
2. Tap **Add Account**.
3. Enter a name (e.g., "Chase Checking").
4. Choose the account type:
   - **Checking** — everyday spending account
   - **Savings** — money set aside
   - **Credit Card** — tracks what you owe
   - **Cash** — physical cash on hand
   - **Investment** — brokerage, retirement, etc.
   - **Loan** — mortgage, student loan, car payment
5. Enter your current balance.
6. Tap **Save**.

That's it! Your account appears in your list with its balance. You can add more accounts anytime.

> 💡 Your balance updates automatically as you add transactions. If you need to correct a balance later, Finance creates an "adjustment" transaction so your history stays accurate.

---

## Creating your first transaction

Transactions are the heart of Finance — they record every time money comes in or goes out. The quick-entry feature is designed to take **three taps or less**.

**To add a transaction:**

1. Tap the **+** button (available from any screen).
2. Type the amount (e.g., `4.50`).
3. Choose a category (e.g., "Coffee & Tea").
4. Tap **Save**.

Done! Your account balance and budget update instantly.

**Want to add more detail?** Tap "More details" before saving to add:

- **Payee** — who you paid (e.g., "Starbucks")
- **Date** — defaults to today, but you can change it
- **Notes** — any context you want to remember
- **Tags** — custom labels for extra organization
- **Account** — if you have multiple accounts

> 💡 Finance learns from your habits. After a few entries, it suggests categories based on your recent transactions.

### Other things you can do with transactions

- **Transfer money** between your own accounts (e.g., checking → savings)
- **Split a transaction** across multiple categories (e.g., a grocery run that includes household items)
- **Search and filter** your transaction history by payee, category, date, or amount
- **Edit or delete** any transaction — budgets and balances recalculate automatically

For the full guide, see [Features → Transactions](./features.md#transactions).

---

## Setting up a budget

Finance uses **envelope budgeting** — a method where you give every dollar a job. Think of it like dividing your income into labeled envelopes for different spending categories.

**To create your first budget:**

1. Go to the **Budget** screen.
2. Tap **Set Up Budget** (or Finance will prompt you after your first income entry).
3. Enter your total monthly income.
4. Assign amounts to categories:
   - Food: $600
   - Housing: $1,200
   - Transport: $400
   - Entertainment: $200
   - ...and so on
5. The "To Budget" counter counts down as you assign money. The goal is $0 remaining — every dollar has a job.

**Tracking your budget:**

Each category shows a progress bar:

- 🟢 **Green** — you've used less than 80% of the budget
- 🟡 **Yellow** — you're between 80% and 100%
- The bar keeps going past 100% if you go over — no judgment, just information

> 💡 Finance uses encouraging language, never shaming. Instead of "You overspent!", you'll see something like: _"You've used 110% of your Food plan — want to adjust?"_

**Budget tips:**

- **Rollover**: Unspent money can carry forward to next month (enable per category).
- **Cover overspending**: Move money between categories if one runs over. Go to the overspent category → tap **Cover** → choose a category to move money from.
- **Budget periods**: Monthly is the default. Weekly, bi-weekly, and yearly options are also available.

For the full guide, see [Features → Budgets](./features.md#budgets).

---

## Setting a savings goal

Goals help you save toward something specific — an emergency fund, a vacation, a house down payment, or anything else.

**To set a goal:**

1. Go to the **Goals** screen.
2. Tap **Add Goal**.
3. Enter a name (e.g., "House Down Payment").
4. Set your target amount (e.g., $50,000).
5. Optionally, set a deadline (e.g., December 2028).
6. Tap **Save**.

Finance shows your progress with a visual bar and tells you how much you need to save each month to stay on track.

**Funding your goal:**

- Assign money from your unbudgeted income directly to a goal.
- Move money from budget categories to your goal.
- Each contribution is tracked in your goal's history.

**Milestone celebrations:**

Finance celebrates your progress at 25%, 50%, 75%, and 100%. 🎉

For the full guide, see [Features → Goals](./features.md#goals).

---

## Working offline

Finance is **offline-first**. That means:

- ✅ You can add transactions without internet
- ✅ You can check budgets and balances without internet
- ✅ You can search your history without internet
- ✅ You can do everything the app offers without internet

Your data lives on your device. The internet is only needed if you choose to sync across multiple devices — and even then, everything queues up and syncs automatically when you're back online.

> 💡 This also means your financial data never has to leave your device if you don't want it to.

---

## Syncing across devices

If you use Finance on more than one device (like your phone and your laptop), you can enable cloud sync to keep everything in sync.

**How it works:**

1. Create a Finance account (email or passkey).
2. Sign in on each device.
3. Sync happens automatically in the background.

**What you should know:**

- Sync is **opt-in** — you don't have to use it.
- Your data is **end-to-end encrypted** before it leaves your device. The sync server can't read your financial data.
- If you edit the same transaction on two devices while offline, Finance handles the conflict — usually automatically, but it'll ask you if there's ambiguity.
- A small sync indicator shows the current state: synced, syncing, pending changes, or offline.

Sync is a **premium feature** — the free tier gives you a complete financial tracker on a single device.

---

## Tips for daily use

Finance is designed around a **30-second daily habit**. Here's how people use it:

### ☀️ Morning: Check your snapshot

An optional daily notification tells you yesterday's spending and how your week is going:

> _"Yesterday you spent $47. Your week is on track. ✅"_

### 🏃 During the day: Quick capture

When you buy something, open Finance → tap **+** → enter amount → pick category → done. Three taps, under 10 seconds.

Or use the **home screen widget** to check your remaining budget at a glance.

### 🤔 "Can I afford this?"

Standing in a store? Tap a budget category on the widget to see what's left:

> _"Dining: $67 left this month."_

### 📊 Weekly: Review your spending

An optional weekly summary arrives each week:

> _"This week: $312 spent. Biggest category: Dining ($89). You're $43 under budget."_

### 📅 Monthly: Reflect

A dashboard card shows your monthly picture: income, spending, savings rate, and how things compare to last month.

### 🔥 Streaks

Finance tracks how many days in a row you log something. It's a gentle motivator — and if you skip a day, there's no guilt. Just:

> _"Welcome back! Pick up where you left off."_

---

## Next steps

You're all set! Here are some things to explore next:

- 📖 **[Feature Guide](./features.md)** — Deep dive into every feature: accounts, transactions, budgets, goals, reports, multi-currency, sharing, and more.
- 🔒 **[Privacy & Security](./privacy-security.md)** — Learn how your data is protected.
- 📱 **[Platform Guides](./platforms.md)** — Get the most out of Finance on your specific device.
- ♿ **[Accessibility](./accessibility.md)** — Screen reader support, high contrast, keyboard navigation, and more.
- ❓ **[FAQ & Troubleshooting](./faq.md)** — Answers to common questions.

---

_Finance is non-judgmental, private, and built to fit your life. Welcome aboard._
