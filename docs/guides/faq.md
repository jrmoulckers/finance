# FAQ & Troubleshooting

Answers to the most common questions about Finance. Can't find what you're looking for? See the [Getting Started Guide](./getting-started.md) or the [Feature Guide](./features.md).

---

## Table of Contents

- [General Questions](#general-questions)
- [Privacy & Data](#privacy--data)
- [Sync & Multi-Device](#sync--multi-device)
- [Account & Login](#account--login)
- [Features](#features)
- [Platforms](#platforms)
- [Billing](#billing)
- [Troubleshooting](#troubleshooting)
- [Getting Help](#getting-help)

---

## General Questions

### What is Finance?

Finance is a personal and family finance tracker that helps you manage accounts, budgets, goals, and spending. It's built around three principles: privacy-first, offline-first, and simplicity-first. The app works natively on iOS, Android, Web, and Windows.

### What makes Finance different from other finance apps?

- **Your data stays on your device** — encrypted, offline-first, no bank connections required
- **It adapts to you** — three experience levels so the app matches your comfort with finance
- **30 seconds a day** — quick-entry transactions, widgets, and at-a-glance budgets
- **No judgment** — the app informs and empowers, never shames
- **Native on every platform** — not a web wrapper, but a real native app on iOS, Android, Web, and Windows

### Do I need a bank connection to use Finance?

No. Finance is a **manual tracking app**. You enter transactions yourself — which takes about 3 taps and under 10 seconds. This is a deliberate choice: it keeps your bank credentials off the internet and helps you build awareness of your spending habits.

### Is Finance open source?

Finance is **source-available** under the Business Source License 1.1 (BSL). You can view, fork, and learn from the code. Personal and non-commercial use is always allowed. The code converts to Apache License 2.0 (fully open source) on March 8, 2030.

---

## Privacy & Data

### How is my data stored?

All your financial data is stored **locally on your device**, encrypted at rest using SQLCipher (an industry-standard encrypted database). Nothing leaves your device unless you opt in to cross-device sync.

For more details, see the [Privacy & Security Guide](./privacy-security.md).

### Is my financial data shared with anyone?

**No.** Finance does not sell, share, or monetize your data. Period.

- No ads
- No data brokers
- No third-party analytics tracking your financial behavior
- Analytics and crash reporting are opt-in and contain no personal or financial data

### What happens to my data when I'm offline?

Everything works normally. Finance is built **offline-first**, which means:

- ✅ Add transactions
- ✅ Check budgets and balances
- ✅ Search your history
- ✅ View reports
- ✅ Do literally everything

If you have sync enabled, changes queue up and sync automatically when you're back online.

### How do I export my data?

1. Go to **Settings → Export**.
2. Choose **JSON** (complete export) or **CSV** (spreadsheet-friendly transactions).
3. Tap **Export**.
4. The file saves to your device or your platform's share sheet opens.

Export happens instantly on your device — no waiting for an email. This is available on the free tier.

### How do I delete my account and all my data?

1. Go to **Settings → Delete Account**.
2. Type the confirmation phrase ("DELETE MY DATA").
3. Confirm.

This deletes:
- All local data on the current device
- All synced data on the server (if you used sync)
- Your account credentials

The deletion is permanent after a 30-day grace period. A confirmation email is sent. Finance uses a process called **crypto-shredding** — the encryption keys for your data are destroyed, making the data unreadable even if any encrypted fragments remain.

> 💡 We recommend exporting your data before deleting your account, just in case.

---

## Sync & Multi-Device

### How does sync work?

When you enable sync:

1. You create a Finance account (email or passkey).
2. Sign in on each device.
3. Your data syncs automatically in the background.

Your data is **end-to-end encrypted** before it leaves your device. The sync server stores only encrypted data — it can't read your transactions, balances, or any financial information.

### Sync isn't working — what should I do?

Try these steps in order:

1. **Check your internet connection** — sync requires connectivity.
2. **Check the sync indicator** — look for the small status icon (usually in the top corner or on the Settings screen):
   - 🟢 Green dot = synced
   - 🟡 Yellow dot = changes pending
   - ⚫ Grey dot = offline
   - 🔄 Animated = syncing in progress
3. **Pull to refresh** — on the Accounts or main screen, pull down to trigger a manual sync.
4. **Sign out and back in** — go to **Settings → Account → Sign Out**, then sign in again.
5. **Check for app updates** — make sure you're on the latest version on all devices.

If sync still isn't working after trying these steps, see [Getting Help](#getting-help) below.

### What happens if I edit the same thing on two devices while offline?

Finance handles this automatically in most cases using a "last write wins" approach. If the conflict is ambiguous (for example, you changed the amount on both devices), Finance shows both versions and lets you choose which one to keep. No data is ever silently discarded.

### Can I use Finance without sync?

Absolutely. The free tier is a complete financial tracker on a single device — no account or internet required.

---

## Account & Login

### I forgot my password — how do I recover?

1. On the sign-in screen, tap **Forgot Password**.
2. Enter your email address.
3. Check your email for a password reset link.
4. Follow the link to set a new password.

> ⚠️ Your local data on the current device is unaffected by a password reset. But if you used sync, you'll need to sign in again to resume syncing.

### What is a passkey?

A **passkey** is a modern, password-free way to sign in. Instead of typing a password, you authenticate with your device's biometrics (Face ID, fingerprint, Windows Hello) or a security key.

Passkeys are:

- More secure than passwords (can't be phished or leaked in a data breach)
- Faster to use (just a biometric scan)
- Supported on all Finance platforms

You can set up a passkey in **Settings → Account → Passkey**.

### Do I need to create an account to use Finance?

No. You can use Finance without any account. An account is only needed if you want to sync across multiple devices (a premium feature).

---

## Features

### Can I track accounts in different currencies?

Yes. Each account can have its own currency. Finance supports all ISO 4217 currencies. Reports and summaries convert totals to your default currency.

Set your default currency in **Settings → Currency**.

### Can I share finances with my partner or family?

Yes — with the **Household Sharing** feature (premium). You can:

- Create a shared household
- Invite family members
- Set roles (owner, partner, member, viewer)
- Share specific accounts and budgets while keeping others private

See [Features → Household Sharing](./features.md#household-sharing) for details.

### How do recurring transactions work?

1. Create a transaction as usual.
2. Tap **Make Recurring**.
3. Choose a schedule (daily, weekly, bi-weekly, monthly, yearly, or custom).

Future instances generate automatically. You can skip, edit, or cancel individual occurrences or the whole series. You'll get a notification before upcoming bills.

### What's the difference between archiving and deleting an account?

- **Archive**: Hides the account from your main list but keeps all history. The balance is excluded from net worth. You can un-archive later.
- **Delete transactions**: Individual transactions can be deleted (with undo). The account itself is archived rather than destroyed.

Archiving is recommended for closed accounts so you keep your financial history intact.

---

## Platforms

### Which platforms are supported?

| Platform | Status |
| --- | --- |
| iOS (iPhone, iPad, Mac) | ✅ Available |
| Android (phones, tablets) | ✅ Available |
| Web (any modern browser) | ✅ Available |
| Windows 11 | ✅ Available |

Companion apps for Apple Watch and Wear OS are planned for a future release.

### Can I install the web version as an app?

Yes! The web version is a **Progressive Web App (PWA)**, which means you can install it like a native app:

- **Chrome/Edge**: Click the install icon in the address bar (or the browser menu → "Install app")
- **Safari (macOS)**: Go to File → Add to Dock
- **Mobile browsers**: Use your browser's "Add to Home Screen" option

Once installed, it works offline and launches in its own window.

### Are there keyboard shortcuts on the web and desktop?

Yes! On the web and Windows:

| Shortcut | Action |
| --- | --- |
| `Ctrl+N` | New transaction |
| `/` | Search |
| `Tab` | Navigate through fields and categories |

See [Platform Guides → Web](./platforms.md#web-pwa) and [Platform Guides → Windows](./platforms.md#windows) for more.

---

## Billing

### Is there a free version?

Yes. The **free tier** includes everything you need to track finances on a single device:

- All account types, transactions, budgets, goals, and categories
- All three experience levels
- Contextual help and financial education
- Offline operation
- Data export (JSON and CSV)
- Basic reports (spending by category, monthly trends)
- "Can I Afford This?" budget check widget

### What does premium include?

The premium tier adds:

- **Multi-device cloud sync** (end-to-end encrypted)
- **Household sharing** (partner/family finances with role-based access)
- **AI-powered features**: auto-categorization, suggested budgets, spending forecasts
- **Advanced reports** and custom visualizations
- **Learning paths** (guided financial education modules)
- Priority support

### How much does premium cost?

| Plan | Price |
| --- | --- |
| Monthly | ~$4.99/month |
| Annual | ~$39.99/year (save ~33%) |
| Family | Household sharing (pricing TBD) |

---

## Troubleshooting

### The app is slow or unresponsive

1. **Close and reopen the app** — this clears temporary state.
2. **Check for updates** — make sure you're on the latest version.
3. **Restart your device** — sometimes the simplest fix works.
4. **Check your storage** — if your device is nearly full, performance can suffer.

### A transaction isn't showing up

- **Check the account filter** — are you viewing the right account?
- **Check the date filter** — is the date range set correctly?
- **Pull to refresh** — if you use sync, new transactions from other devices may need a moment.
- **Search for it** — use the search function to find by amount, payee, or notes.

### My budget numbers look wrong

- **Check rollover settings** — if rollover is enabled, last month's balance is included.
- **Check for moved money** — someone may have covered an overspent category by moving budget from another one.
- **Check the budget period** — make sure you're looking at the right month.

### I can't sign in

- **Check your internet connection** — sign-in requires connectivity.
- **Check your email** — make sure you're using the right email address.
- **Try "Forgot Password"** — reset your password via email.
- **Try a passkey** — if you set up a passkey, try biometric sign-in instead.
- **Clear the app cache** — on Android, go to device Settings → Apps → Finance → Clear Cache. On iOS, try reinstalling.

### The app won't install (Web PWA)

- **Use a supported browser** — Chrome, Edge, or another Chromium-based browser works best. Firefox has limited PWA support.
- **Use HTTPS** — PWA installation requires a secure (HTTPS) connection.
- **Try incognito mode** — a browser extension might be interfering.

---

## Getting Help

### How do I report a bug?

If you've found something that isn't working right:

1. Go to **Settings → Help → Report a Bug**.
2. Describe what happened, what you expected to happen, and any steps to reproduce.
3. Finance may include non-sensitive diagnostic info (app version, platform, error code) — no personal or financial data is included.

You can also file an issue on the [GitHub repository](https://github.com/jrmoulckers/finance/issues) if you're comfortable with that.

### How do I request a feature?

We love hearing ideas! You can:

1. Go to **Settings → Help → Feature Request**.
2. Or open a feature request on [GitHub](https://github.com/jrmoulckers/finance/issues).

### How do I contact support?

For questions that aren't answered here, reach out through **Settings → Help → Contact Us**.

---

_Still stuck? The [Getting Started Guide](./getting-started.md) covers the basics, and the [Feature Guide](./features.md) goes deep on every capability._
