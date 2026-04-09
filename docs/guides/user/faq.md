# Frequently Asked Questions

Answers to common questions about using Finance. If your question isn't here, check the [Troubleshooting guide](troubleshooting.md) or reach out through **Settings → Help → Contact Us**.

---

## Table of Contents

- [General](#general)
- [Accounts](#accounts)
- [Transactions](#transactions)
- [Budgets](#budgets)
- [Goals](#goals)
- [Sync and multi-device](#sync-and-multi-device)
- [Privacy and security](#privacy-and-security)
- [Platform-specific](#platform-specific)
- [Data and export](#data-and-export)
- [Troubleshooting basics](#troubleshooting-basics)

---

## General

### 1. Is Finance free?

Finance is source-available software. Check the current pricing and availability on the App Store, Google Play, Microsoft Store, or the project website.

### 2. Does Finance connect to my bank?

No. Finance uses **manual entry** — you record transactions yourself. This is intentional: it builds spending awareness and means Finance never needs your bank login credentials. Bank connection support may be considered in a future release.

### 3. What platforms does Finance run on?

Finance runs natively on four platforms:

| Platform    | UI Framework     |
| ----------- | ---------------- |
| iOS / iPad  | SwiftUI          |
| Android     | Jetpack Compose  |
| Web (PWA)   | React + TypeScript |
| Windows 11  | Compose Desktop  |

All platforms share the same core logic and data models through Kotlin Multiplatform (KMP).

### 4. Do I need an account to use Finance?

No. Finance works fully offline with no account required. You only need to create an account if you want to sync data across multiple devices.

### 5. What currencies does Finance support?

Finance supports multiple currencies including USD, EUR, GBP, CAD, AUD, and JPY. You set your default currency in **Settings → Preferences → Currency**. All monetary values are stored precisely using integer arithmetic (no floating-point rounding errors).

### 6. Can I use Finance for business expenses?

Finance is designed for personal finance tracking. While you can create categories like "Business" or "Freelance," it does not include business-specific features like invoicing, tax reporting, or multi-entity accounting.

### 7. Is there a dark mode?

Yes. Finance supports multiple themes:

- **System** — follows your device's light/dark setting
- **Light** — always light
- **Dark** — standard dark mode
- **OLED Dark** — true-black background for OLED screens (saves battery)

Set your theme in **Settings → Preferences → Theme**.

---

## Accounts

### 8. How many accounts can I create?

There is no hard limit. Create as many accounts as you need to represent your financial picture.

### 9. Can I track investment accounts?

You can create an Investment-type account and manually update its balance, but Finance does not automatically track stock prices or portfolio performance. Investment account balances contribute to your net worth calculation.

### 10. What happens when I archive an account?

The account is hidden from your main account list and excluded from net worth calculations. All historical transactions are preserved and searchable. You can un-archive at any time. See [Accounts — Archiving](features/accounts.md#archiving-and-un-archiving-accounts).

### 11. Can I delete an account permanently?

Archiving is the recommended approach (it hides the account while preserving history). Permanent deletion is possible but removes all associated transactions — this action is irreversible.

### 12. How do I fix a wrong account balance?

Use the **Adjust Balance** feature on the account detail screen. Finance creates an adjustment transaction for the difference, keeping your transaction history accurate. See [Accounts — Adjusting a balance](features/accounts.md#adjusting-an-account-balance).

---

## Transactions

### 13. How do I record a transaction quickly?

Tap the **+** button from any screen (or press `Ctrl+N` / `⌘+N` on desktop), enter the amount, pick a category, and tap Save. The entire flow takes under 10 seconds. See [Transactions — Quick-entry](features/transactions.md#quick-entry-the-daily-workflow).

### 14. Can I backdate a transaction?

Yes. When creating or editing a transaction, change the date field to any past date. This is useful for recording transactions you forgot to enter.

### 15. Can I split a transaction across multiple categories?

Yes. When creating or editing a transaction, tap **Split** to divide it across 2–10 categories. Each split has its own category and amount, and the totals must match. See [Transactions — Splitting](features/transactions.md#splitting-a-transaction).

### 16. Can I undo a deleted transaction?

Yes, for 10 seconds after deletion. An undo option appears at the bottom of the screen. After 10 seconds, the deletion is finalized (though the data is soft-deleted internally for sync purposes).

### 17. How do I record a refund?

Record it as an **income** transaction in the same category as the original purchase. This credits the category in your budget and increases your account balance.

### 18. What's the difference between a transfer and a transaction?

A **transaction** records money entering or leaving your accounts (income or expense). A **transfer** moves money between two of your own accounts without affecting your budget. See [Transactions — Transfers](features/transactions.md#transfers-between-accounts).

### 19. Does Finance support recurring transactions?

Not yet. Recurring transaction scheduling is planned for a future release. Currently, you record each transaction manually.

---

## Budgets

### 20. What is envelope budgeting?

Envelope budgeting means giving every dollar a job by allocating your income to specific categories before you spend it. When a category's allocation is used up, you either stop spending or move money from another category. See [Budgets](features/budgets.md#how-envelope-budgeting-works).

### 21. What does "To Budget" mean?

"To Budget" is the amount of income you haven't yet assigned to a category. The goal is to reach $0 — meaning every dollar has a purpose. A positive number means you have unallocated income; a negative number means you've budgeted more than you've earned.

### 22. What happens if I overspend in a category?

The category shows a negative remaining amount. You can cover the overspending by moving money from another category. If you don't, the negative amount rolls forward to next month (if rollover is enabled). See [Budgets — Covering overspending](features/budgets.md#covering-overspending).

### 23. Can I copy last month's budget?

Yes. On the Budget screen, tap the **⋯** menu and select **Copy Last Month's Budget**. All allocations are copied, and you can adjust them before saving.

### 24. Does unspent budget money carry forward?

It depends on your rollover setting. With **Carry Forward** enabled for a category, unspent money rolls to the next month. With it disabled, the category resets to $0 each month. See [Budgets — Rollover](features/budgets.md#budget-rollover).

---

## Goals

### 25. How are goals different from budgets?

Budgets manage your **monthly spending** — how much you allocate to each category. Goals track **longer-term savings** — progress toward a target amount like an emergency fund or a vacation. They work together: budget a "Savings" category each month and contribute that money to your goals.

### 26. Can I have multiple goals at the same time?

Yes. There is no limit on the number of active goals. See [Goals — Multiple goals](features/goals.md#multiple-goals).

### 27. What happens when I reach a goal?

Finance marks it as complete with a celebration message. The goal moves to a "Completed" section. Your contribution history is preserved.

### 28. Can I change a goal's target after creating it?

Yes. Open the goal, tap Edit, and change the target amount or deadline. Your progress percentage and projections recalculate instantly.

---

## Sync and multi-device

### 29. How does sync work?

Finance uses **delta sync** — only changes since your last sync are transmitted. When you record a transaction on your phone, it's pushed to the server (encrypted), and your other devices pull the update. The process is automatic and runs in the background.

### 30. Is my data encrypted during sync?

Yes. Finance uses **end-to-end encryption** with AES-256-GCM. Your data is encrypted on your device before it leaves, and only your devices have the keys to decrypt it. The sync server cannot read your financial data.

### 31. Does the app work offline?

Yes. Finance is **offline-first**. All features work without an internet connection. Your data is stored in a local encrypted database. Changes are queued and synced when connectivity returns.

### 32. What happens if I edit the same transaction on two devices while offline?

Finance's conflict resolution handles this automatically. For simple changes, **last-write-wins** applies (the most recent edit is kept). For ambiguous conflicts (both devices changed the amount), you're prompted to choose which version to keep. No data is silently discarded. See [Troubleshooting — Sync conflicts](troubleshooting.md#sync-conflicts).

### 33. Can I use Finance on multiple devices?

Yes. Create an account (Settings → Account → Sign In) and sign in on each device. Your data syncs automatically across all of them — iOS, Android, Web, and Windows.

### 34. How much server storage does sync use?

Minimal. Finance syncs only financial data (transactions, accounts, budgets, goals, categories). There are no images, videos, or large files. Most users' data is well under 10 MB.

---

## Privacy and security

### 35. Does Finance sell my data?

No. Finance **does not sell, share, or monetize your personal data**. Ever.

### 36. What data does Finance collect?

On your device: account names, transactions, budgets, goals, categories, and app preferences. All stored in an encrypted local database. If you enable sync, your email address and encrypted financial data are stored on the server. See [Privacy & Security](privacy-security.md#what-data-is-collected) for the full inventory.

### 37. Can I use Finance without giving it any personal data?

Yes. Use Finance without creating an account (offline-only mode). In this case, no data leaves your device, and Finance has no knowledge of your identity.

### 38. How do I lock the app with biometrics?

Go to **Settings → Security → Biometric Lock** and toggle it on. Finance supports Face ID, Touch ID, fingerprint, Windows Hello, and WebAuthn-compatible methods depending on your platform. See [Privacy & Security](privacy-security.md#biometric-authentication).

### 39. What are passkeys?

Passkeys are a modern, phishing-resistant alternative to passwords. Instead of typing a password, you authenticate with your biometrics or a security key. Passkeys can't be phished or leaked in a data breach. Set one up in **Settings → Security → Passkeys**. See [Privacy & Security](privacy-security.md#passkey-authentication).

---

## Platform-specific

### 40. Can I install the web version as a desktop app?

Yes. In Chrome or Edge, click the install icon (⊕) in the address bar or go to the browser menu → Install app. Finance then runs in its own window with its own icon. See [Platform Tips](platform-tips.md#web-pwa).

### 41. Does Finance have widgets?

Yes, on iOS and Android. Widgets show budget remaining, goal progress, and more — right on your home screen. iOS 17+ widgets support interactive quick-entry. See [Platform Tips](platform-tips.md#ios).

### 42. Does Finance support Apple Watch?

An Apple Watch companion app is planned for a future release.

### 43. What keyboard shortcuts are available on desktop?

On the web and desktop versions: `Ctrl+N` / `⌘+N` for new transaction, `/` for search, `Tab` to navigate, `Enter` to save, `Escape` to cancel. See [Platform Tips — Web](platform-tips.md#web-pwa).

### 44. Does Finance use Material You theming on Android?

Yes. On Android 12+, Finance automatically adapts to your wallpaper-based dynamic color palette while maintaining accessible contrast ratios. See [Platform Tips — Android](platform-tips.md#android).

---

## Data and export

### 45. Can I export my data?

Yes. Go to **Settings → Data → Export** and choose JSON (complete backup) or CSV (tabular format). The export includes accounts, transactions, categories, budgets, and goals.

### 46. Can I import data from another app?

Import functionality is available on the web version. Go to **More → Import** for supported formats.

### 47. How do I delete all my data?

Go to **Settings → Danger Zone → Delete Account**. You'll need to type a confirmation phrase. All local data is deleted, and if you used sync, server-side data is destroyed through crypto-shredding (encryption keys are destroyed, making data permanently unreadable). There is a 30-day grace period before deletion is final.

### 48. Can I back up my data locally?

Yes. Use the export feature (JSON format) to save a complete backup to your device. Keep these exports in a safe location as an additional backup.

---

## Troubleshooting basics

### 49. My balance doesn't match my bank. What do I do?

Use the Adjust Balance feature on the account's detail screen. Finance creates an adjustment transaction for the difference. Then, review recent transactions to find any that were missed or entered incorrectly.

### 50. The app is running slowly. What can I do?

Ensure your device has sufficient storage space. On web, try clearing the browser cache for the Finance site. If the issue persists, see [Troubleshooting — Performance](troubleshooting.md#performance-issues).

### 51. I forgot my password. How do I reset it?

On the sign-in screen, tap **Forgot Password**. A reset link is sent to your email. If you set up a passkey, you can sign in with that instead.

### 52. A feature looks different on another platform. Is that a bug?

Probably not. Finance uses **native UI** on each platform (SwiftUI on iOS, Jetpack Compose on Android, React on web, Compose Desktop on Windows). Features and data are the same everywhere, but the look and feel follows each platform's design language. See [Platform Tips](platform-tips.md).

---

_Still have questions? Check the [Troubleshooting guide](troubleshooting.md) or contact support through **Settings → Help → Contact Us**._

_Back to [Getting Started](getting-started.md)_
