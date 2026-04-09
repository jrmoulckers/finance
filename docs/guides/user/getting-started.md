# Getting Started with Finance

Welcome to Finance — a privacy-first financial tracker that helps you understand where your money goes, without the overwhelm. This guide walks you through setup and your first 10 minutes in the app.

---

## Table of Contents

- [What is Finance?](#what-is-finance)
- [Download and install](#download-and-install)
- [First launch: onboarding](#first-launch-onboarding)
- [Create your first account](#create-your-first-account)
- [Record your first transaction](#record-your-first-transaction)
- [Set up your first budget](#set-up-your-first-budget)
- [Create a savings goal](#create-a-savings-goal)
- [Check the dashboard](#check-the-dashboard)
- [Enable sync (optional)](#enable-sync-optional)
- [What's next?](#whats-next)

---

## What is Finance?

Finance is a multi-platform personal finance app built for people who want to know where every dollar goes — without connecting to a bank, without giving up their data, and without spending more time on the app than on their actual finances.

**Key ideas:**

- **Offline-first** — everything works without internet. Your data lives on your device.
- **Manual entry by design** — you record transactions yourself, which builds awareness of spending habits.
- **Envelope budgeting** — every dollar gets a job, inspired by the [YNAB methodology](https://www.ynab.com/the-four-rules).
- **Privacy by default** — your financial data is encrypted on your device. If you enable sync, it's end-to-end encrypted before it leaves.

Finance runs natively on **iOS**, **Android**, **Web (PWA)**, and **Windows**. Your data syncs across all of them when you choose to enable it.

---

## Download and install

| Platform    | How to get it                                                     |
| ----------- | ----------------------------------------------------------------- |
| **iOS**     | Download from the App Store (search "Finance")                    |
| **Android** | Download from Google Play (search "Finance")                      |
| **Web**     | Visit the Finance web app in Chrome, Edge, Safari, or Firefox     |
| **Windows** | Download from the Microsoft Store (search "Finance")              |

### Install the web version as an app

The web version is a Progressive Web App (PWA) — you can install it for a native-like experience:

1. Open Finance in **Chrome** or **Edge**.
2. Click the **install icon** (⊕) in the address bar, or go to the browser menu → **Install app**.
3. Finance now has its own window and icon, just like a regular desktop app.

> 💡 You don't need to create an account to start using Finance. The app works fully offline from the moment you open it. You only need an account if you want to sync data across devices.

---

## First launch: onboarding

When you open Finance for the first time, a short welcome flow introduces the app:

1. **Welcome** — a brief introduction to what Finance does.
2. **Track Everything** — an overview of accounts, budgets, goals, and transactions.
3. **Your Data, Your Device** — how your data is protected (offline-first, encrypted, biometric lock).
4. **Get Started** — a prompt to create your first account.

You can **skip** the onboarding at any time by tapping the Skip link in the top-right corner. You won't be asked to see it again.

> ♿ The entire onboarding flow is accessible to screen readers (VoiceOver, TalkBack, Narrator) and respects your device's reduced-motion setting.

---

## Create your first account

An account in Finance represents a real-world financial account — your checking account, savings account, credit card, cash wallet, or anything else you want to track.

### Steps

1. From the onboarding flow (or later via **More → Accounts → Add Account**), tap **Add Account**.
2. Enter a **name** — for example, "Chase Checking" or "Wallet Cash".
3. Choose the **account type**:
   - Checking
   - Savings
   - Credit Card
   - Cash
   - Investment
   - Loan
   - Other
4. Enter your **current balance** — this is the amount in the account right now.
5. Tap **Save**.

Your account appears in the account list, and Finance knows your starting balance.

### Tips

- **Start with one account.** You can always add more later. Most people start with their primary checking account or cash wallet.
- **The balance doesn't need to be exact.** A rough starting point is fine — you can adjust it later with a balance adjustment transaction.
- **Credit card balances** are entered as the amount you owe (Finance treats it as a liability).

---

## Record your first transaction

This is the action you'll do most often — typically in under 10 seconds.

### Quick-entry flow

1. Tap the **+** button (floating action button on mobile, or press `Ctrl+N` / `⌘+N` on desktop).
2. Enter the **amount** using the numeric keypad (e.g., `4.50` for a coffee).
3. Select a **category** — Finance suggests one based on your recent transactions, or you can pick from the list. Default categories include Food, Transport, Housing, Utilities, Health, Personal, Entertainment, Shopping, Education, and Income.
4. Tap **Save**.

That's it. Your account balance updates, your budget reflects the spend, and the transaction appears in your history.

### More details (optional)

Before saving, you can expand the **More details** section to add:

- **Payee** — who you paid (e.g., "Starbucks")
- **Date** — defaults to today, but you can backdate
- **Notes** — any context you want to remember
- **Account** — defaults to your last-used account

> 🎯 **Goal: 3 taps or less.** The quick-entry flow is designed so the most common action (recording a coffee, lunch, or grocery trip) takes under 10 seconds. Extra details are always optional.

---

## Set up your first budget

Finance uses **envelope budgeting** — you decide in advance how much to spend in each category, like putting cash into envelopes.

### Steps

1. Go to the **Budget** tab (the envelope icon in the bottom navigation bar).
2. If this is your first budget, Finance offers a guided setup based on the **50/30/20 rule** as a starting point:
   - **50%** for needs (housing, food, transport, utilities)
   - **30%** for wants (entertainment, dining out, shopping)
   - **20%** for savings and debt repayment
3. Enter your **monthly income** (or your expected take-home pay).
4. Adjust the suggested allocations for each category to match your reality.
5. Tap **Save**.

### Understanding the budget screen

After setup, the budget screen shows:

| Element                | What it means                                                      |
| ---------------------- | ------------------------------------------------------------------ |
| **To Budget**          | Income not yet assigned to a category. Goal: $0 (every dollar has a job). |
| **Category row**       | Each category shows: amount budgeted, amount spent, and amount remaining. |
| **Progress bar**       | Visual indicator — green means on track, yellow means approaching the limit. |
| **Rollover indicator** | If enabled, unspent money from last month carries forward.         |

### Moving money between categories

Overspent on dining this month? No problem:

1. Tap the overspent category.
2. Tap **Cover Overspending**.
3. Choose a category to take money from (e.g., move $50 from Entertainment to Dining).
4. Both categories update instantly.

> 📖 For full budget details, see [Budgets](features/budgets.md).

---

## Create a savings goal

Goals help you track progress toward something specific — an emergency fund, a vacation, a house down payment.

### Steps

1. Go to **More → Goals → Add Goal**.
2. Enter a **name** (e.g., "Emergency Fund").
3. Set a **target amount** (e.g., $10,000).
4. Optionally set a **deadline** (e.g., December 2026).
5. Tap **Save**.

Finance shows your progress as a percentage, and if you set a deadline, it calculates how much you need to save each month to stay on track.

### Funding a goal

To put money toward a goal:

1. Open the goal.
2. Tap **Add Contribution**.
3. Enter the amount and save.

The goal's progress bar and projection update immediately.

> 📖 For details on goal projections and milestones, see [Goals](features/goals.md).

---

## Check the dashboard

The **Home** tab is your daily snapshot. It answers the question: _"How am I doing?"_

What you see:

- **Today's spending** — how much you've spent so far today.
- **Budget health** — a summary of which categories are on track.
- **Goal progress** — how close you are to your active goals.
- **Recent transactions** — your latest entries.

This is the screen you'll see most often — a quick glance when you open the app.

---

## Enable sync (optional)

If you want your data on multiple devices, you can enable sync:

1. Go to **Settings → Account → Sign In**.
2. Create an account with your email, or sign in with Google or Apple.
3. Sync starts automatically.

**What sync does:**

- Keeps your data in sync across all your devices (iOS, Android, Web, Windows).
- Uses **end-to-end encryption** — the sync server cannot read your financial data.
- Works in the background — you don't need to do anything manually.

**What sync doesn't do:**

- It does not share your data with anyone.
- It does not send your data to third parties.
- It does not require a constant internet connection — the app still works fully offline.

> 🔒 For details on how your data is protected, see [Privacy & Security](privacy-security.md).

---

## What's next?

You're set up! Here's where to go from here:

| Want to…                             | Read this                                       |
| ------------------------------------ | ----------------------------------------------- |
| Manage your accounts                 | [Accounts Guide](features/accounts.md)          |
| Learn about transaction features     | [Transactions Guide](features/transactions.md)  |
| Master budgeting                     | [Budgets Guide](features/budgets.md)            |
| Track savings goals                  | [Goals Guide](features/goals.md)                |
| Explore platform-specific features   | [Platform Tips](platform-tips.md)               |
| Understand privacy protections       | [Privacy & Security](privacy-security.md)       |
| Troubleshoot an issue                | [Troubleshooting](troubleshooting.md)           |
| Find answers to common questions     | [FAQ](faq.md)                                   |

---

_Finance is open-source and developed transparently. Learn more at the [project README](../../../README.md)._
