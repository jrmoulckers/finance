# Finance User Guide

The complete guide for Finance — your private, offline-first personal and family finance tracker. This page is the single entry point for all user-facing documentation.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Core Concepts](#core-concepts)
- [How-To Recipes](#how-to-recipes)
- [Tips for Daily Use](#tips-for-daily-use)
- [Managing Your Data](#managing-your-data)
- [Platform Quick Reference](#platform-quick-reference)
- [Getting Help](#getting-help)
- [Documentation Map](#documentation-map)

---

## Getting Started

New to Finance? Follow this path:

1. **Read the [Getting Started Guide](./getting-started.md)** — set up your account, add your first account, and record your first transaction. Takes about 5 minutes.
2. **Set your experience level** — Finance adapts to your comfort with financial concepts:
   - 🌱 **Getting Started** — plain language, guided prompts, progressive disclosure
   - 📊 **Comfortable** — standard view with all features (default)
   - 🧠 **Advanced** — detailed breakdowns, technical terms, power-user shortcuts
3. **Explore features** at your own pace — the [Feature Guide](./features.md) covers everything in detail.

> 💡 You can start using Finance immediately — no account sign-up, no bank connection, no internet required. Just open the app and go.

---

## Core Concepts

Finance is built on a few key ideas. Understanding these helps everything else make sense.

### Privacy-first, offline-first

Your financial data lives on your device, encrypted with [SQLCipher](./privacy-security.md#how-your-data-is-protected). The app works fully offline. Cloud sync is optional and end-to-end encrypted — the server never sees your data in plain text. See the [Privacy & Security Guide](./privacy-security.md) for the full story.

### Manual entry by design

Finance is a **manual tracking app** — you enter transactions yourself (about 3 taps, under 10 seconds). No bank login needed. This is deliberate: it builds spending awareness and keeps your bank credentials off the internet.

### Envelope budgeting

Finance uses [envelope budgeting](./features.md#budgets) — every dollar of income gets assigned to a category, like putting cash into labeled envelopes. When an envelope is empty, you've spent your plan for that category.

### Non-judgmental language

Finance informs and encourages — it never shames. If you go over budget, you'll see:

> _"You've used 110% of your Food plan — want to adjust?"_

…not "You overspent!" See the [Accessibility Guide](./accessibility.md#cognitive-accessibility) for more on this design philosophy.

---

## How-To Recipes

Quick step-by-step instructions for common tasks. For full details on any feature, see the [Feature Guide](./features.md).

### Record a purchase

1. Tap **+** (available from any screen).
2. Enter the amount.
3. Pick a category.
4. Tap **Save**.

Done in under 10 seconds.

### Record income

1. Tap **+**.
2. Enter the amount.
3. Choose an income category (e.g., "Salary").
4. Tap **Save**.

Income appears as a positive entry and increases your "To Budget" balance if you use budgets.

### Transfer money between accounts

1. Tap **+** → select **Transfer**.
2. Choose the **from** and **to** accounts.
3. Enter the amount.
4. Tap **Save**.

Transfers create two linked records and don't affect any budget category.

### Split a transaction across categories

1. Enter the total amount (e.g., $125 at Costco).
2. Tap **Split**.
3. Assign amounts to categories (e.g., Groceries $80, Household $30, Personal Care $15).
4. The split must add up to the total.

### Set up a recurring bill or subscription

1. Create a transaction as usual.
2. Tap **Make Recurring**.
3. Choose a schedule (daily, weekly, bi-weekly, monthly, yearly, or custom).
4. Future instances generate automatically.

You can skip, modify, or cancel individual occurrences or the whole series.

### Move money between budget categories

Went over in one category? Move money from another:

1. Tap the overspent category.
2. Tap **Cover**.
3. Choose a category that has remaining budget.
4. Enter the amount to move.

### Export your data

1. Go to **Settings → Export**.
2. Choose **JSON** (complete export) or **CSV** (spreadsheet-friendly transactions).
3. Tap **Export**.
4. The file saves to your device or your platform's share sheet opens.

Export is instant, offline, and free.

### Share finances with a partner or family

> ⚠️ Household sharing is a **premium feature**.

1. Go to **Settings → Household → Create Household**.
2. Invite members by email or invite link.
3. Set roles: Owner, Partner, Member, or Viewer.
4. Choose which accounts and budgets to share — personal items stay private.

See [Features → Household Sharing](./features.md#household-sharing) for details.

### Set up biometric lock

1. Go to **Settings → Security → Biometric Lock**.
2. Toggle it on.
3. Authenticate with your biometric (Face ID, fingerprint, Windows Hello) to confirm.

See the [Privacy & Security Guide](./privacy-security.md#biometric-authentication) for details.

### Delete your account and all data

1. Go to **Settings → Delete Account**.
2. Type the confirmation phrase: `DELETE MY DATA`.
3. Confirm.

All local data is deleted immediately. If you used sync, server-side data is destroyed through [crypto-shredding](./privacy-security.md#crypto-shredding). A 30-day grace period applies. We recommend [exporting your data](#export-your-data) first.

---

## Tips for Daily Use

Finance is designed for a **30-second daily habit**:

| When                    | What                   | How                                                                             |
| ----------------------- | ---------------------- | ------------------------------------------------------------------------------- |
| ☀️ Morning              | Check your snapshot    | An optional daily notification shows yesterday's spending and weekly progress   |
| 🏃 During the day       | Quick capture          | Tap **+** after each purchase — 3 taps, under 10 seconds                        |
| 🤔 "Can I afford this?" | Check remaining budget | Tap a budget category on the home screen widget                                 |
| 📊 Weekly               | Review spending        | An optional weekly summary arrives with your spending breakdown                 |
| 📅 Monthly              | Reflect                | The dashboard shows income, spending, savings rate, and month-over-month trends |

### Widgets

Check your finances without opening the app:

- **Budget remaining** — see spending categories with progress bars
- **Goal progress** — visual tracker for savings goals
- **"Can I Afford This?"** — tap a category to see remaining budget

On iOS 17+, widgets are interactive — tap **+** on a widget to open quick-entry.

### Streaks

Finance tracks consecutive days of logging as a gentle motivator. If you skip a day, there's no guilt — just:

> _"Welcome back! Pick up where you left off."_

---

## Managing Your Data

### What's stored where

| Data                                                        | Location                | Encrypted?                             |
| ----------------------------------------------------------- | ----------------------- | -------------------------------------- |
| All financial data (accounts, transactions, budgets, goals) | Your device             | ✅ SQLCipher (AES-256)                 |
| Sync data (if you opt in)                                   | Cloud server            | ✅ End-to-end encrypted                |
| Authentication tokens                                       | Platform secure storage | ✅ Keychain / Keystore / DPAPI         |
| Analytics (if you opt in)                                   | Analytics service       | No personal or financial data included |

### Data ownership

- You own your data. Always.
- [Export](./features.md#data-export) it anytime in JSON or CSV — free tier, no restrictions.
- [Delete](./privacy-security.md#how-to-exercise-your-rights) everything with one action.
- Finance complies with [GDPR](./privacy-security.md#under-gdpr-european-union) and [CCPA](./privacy-security.md#under-ccpacpra-california) data rights.

### Backup best practices

Finance is offline-first, so your primary data lives on your device. To protect against data loss:

1. **Enable sync** (premium) — your encrypted data is backed up to the cloud automatically.
2. **Export regularly** — periodic JSON exports give you a complete snapshot you can store anywhere.
3. **Keep your device backed up** — your platform's backup system (iCloud, Google, etc.) includes the Finance database.

---

## Platform Quick Reference

Finance runs natively on four platforms. Each has unique capabilities:

| Feature             | iOS                         | Android           | Web         | Windows         |
| ------------------- | --------------------------- | ----------------- | ----------- | --------------- |
| Biometric lock      | Face ID, Touch ID           | Fingerprint, Face | WebAuthn    | Windows Hello   |
| Widgets             | ✅ (interactive on iOS 17+) | ✅ (Material You) | —           | —               |
| Keyboard shortcuts  | —                           | —                 | ✅          | ✅              |
| Quick Settings tile | —                           | ✅                | —           | —               |
| Install as app      | App Store                   | Play Store        | PWA install | Microsoft Store |
| Haptic feedback     | ✅                          | ✅                | —           | —               |
| Dynamic theming     | —                           | ✅ (Material You) | —           | —               |

For the full platform guide, see [Platform Guides](./platforms.md).

### Keyboard shortcuts (Web & Windows)

| Shortcut            | Action                      |
| ------------------- | --------------------------- |
| `Ctrl+N` (or `⌘+N`) | New transaction             |
| `/`                 | Open search                 |
| `Ctrl+E`            | Export data                 |
| `Tab` / `Shift+Tab` | Navigate forward / backward |
| `Escape`            | Cancel / close dialog       |

---

## Getting Help

### In the app

- **ℹ️ Info taps** — every financial concept has an explanation, tailored to your experience level
- **Settings → Help → FAQ** — searchable answers to common questions
- **Settings → Help → Report a Bug** — structured bug report (no financial data included)
- **Settings → Help → Feature Request** — tell us what you'd like to see
- **Settings → Help → Contact Us** — reach the team directly

### In the documentation

| I want to…                     | Read this                                         |
| ------------------------------ | ------------------------------------------------- |
| Understand a feature in depth  | [Feature Guide](./features.md)                    |
| Fix a problem                  | [FAQ & Troubleshooting](./faq.md)                 |
| Learn how my data is protected | [Privacy & Security Guide](./privacy-security.md) |
| Use accessibility features     | [Accessibility Guide](./accessibility.md)         |
| Set up my specific platform    | [Platform Guides](./platforms.md)                 |

---

## Documentation Map

All user-facing documentation at a glance:

```
docs/guides/
├── user-guide.md              ← You are here (this page)
├── getting-started.md         ← First-run setup and walkthrough
├── features.md                ← Complete feature reference
├── faq.md                     ← Common questions and troubleshooting
├── privacy-security.md        ← Data protection, encryption, your rights
├── accessibility.md           ← Screen readers, keyboard nav, cognitive a11y
├── platforms.md               ← iOS, Android, Web, Windows specifics
├── in-app-help-plan.md        ← Contextual help design (internal)
└── onboarding-strategy.md     ← Onboarding flow design (internal)
```

---

_Finance is private, non-judgmental, and built to fit your life. For developer documentation, see the [Documentation Index](../INDEX.md)._
