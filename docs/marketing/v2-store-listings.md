# v2.0 App Store Listing Updates — All Platforms

> **Issue:** [#1149](https://github.com/jrmoulckers/finance/issues/1149)
> **Status:** PROPOSED — Pending human review
> **Sprint:** v2.0 Launch Campaign
> **Last Updated:** 2025-07-31
> **Author:** Marketing Strategist (AI agent)
> **Related:** [v1.0 Store Listings](final-store-listings.md) · [ASO Research](aso-keyword-research.md) · [v2.0 Launch Messaging](v2-launch-messaging.md) · [Screenshot Spec](screenshot-spec.md)

---

## Table of Contents

1. [Pre-Update Checklist](#1-pre-update-checklist)
2. [iOS App Store Listing (v2.0)](#2-ios-app-store-listing-v20)
3. [Google Play Store Listing (v2.0)](#3-google-play-store-listing-v20)
4. [Microsoft Store Listing (v2.0)](#4-microsoft-store-listing-v20)
5. [What's New — v2.0 Release Notes (All Platforms)](#5-whats-new--v20-release-notes-all-platforms)
6. [Updated Keywords & ASO Strategy](#6-updated-keywords--aso-strategy)
7. [Screenshot Update Plan](#7-screenshot-update-plan)
8. [Character Limit Audit](#8-character-limit-audit)

---

## 1. Pre-Update Checklist

### Before Updating Any Store Listing

- [ ] All v2.0 features are shipped and functional on the platform
- [ ] Screenshots updated to show v2.0 features (health score, widgets, reports, biometric lock)
- [ ] Privacy policy updated to reflect v2.0 data handling (benchmarking opt-in, report sharing)
- [ ] No claims about unshipped features in any listing
- [ ] All privacy claims verified against architecture docs
- [ ] Character limits verified per platform (see § 8)
- [ ] Dark mode screenshots included where required
- [ ] App icon unchanged (no update needed)

---

## 2. iOS App Store Listing (v2.0)

### App Name (30 characters)

```
Finance - Budget Tracker
```

✅ 24/30 characters — unchanged from v1.0

### Subtitle (30 characters)

```
Health Score · Reports · You
```

✅ 27/30 characters

**Rationale:** Surfaces the two biggest new features (Health Score and Reports) while maintaining the personal "You" anchor. Replaces v1.0 subtitle "Private. Offline. Yours." — privacy is now established; v2.0 leads with new capability.

**Alternative subtitle candidates:**

- `Smart Budget · Private Data` (28/30)
- `Score · Reports · Widgets` (25/30)
- `Financial Health, Your Way` (26/30)

### Keywords (100 characters)

```
budget,health score,expense,tracker,report,widget,offline,private,savings,goals,money,ADHD,biometric
```

✅ 99/100 characters

**Changes from v1.0:**

- Added: `health score`, `report`, `widget`, `biometric`
- Removed: `spending`, `envelope`, `plan`, `accessible`, `free` (lower conversion, covered in description)

### Promotional Text (170 characters)

```
NEW in v2.0: Financial Health Score, custom report builder, home screen widgets, and biometric-protected categories. All private. All on your device. Free core forever.
```

✅ 167/170 characters

### Description

```
Finance helps you see where your money goes — and now, understand your overall financial health.

NEW IN v2.0:

📊 FINANCIAL HEALTH SCORE
See your financial health as a single number (0–100). Four factors — savings rate, debt ratio, emergency fund, and budget adherence — give you a clear picture. Calculated entirely on your device. Premium users can opt in to anonymous benchmarks to see how they compare.

🔒 BIOMETRIC-PROTECTED CATEGORIES
Mark sensitive categories (medical, therapy, legal) as biometric-locked. They require Face ID or Touch ID to view. Hand your phone to someone without worry. Protected data stays private — even in shared household budgets.

📱 HOME SCREEN WIDGETS
Check your balance, budget status, and recent transactions from your home screen. Five widget types in small, medium, and large sizes. Data refreshes every 15 minutes from your local encrypted database. No network calls.

📋 CUSTOM REPORT BUILDER
Build the exact financial view you need. Select metrics, date ranges, and chart types. Drag-and-drop components into your report. Export as PDF or CSV. All generated on your device.

🤝 COLLABORATIVE BUDGET NEGOTIATION
Share a household budget? Now everyone gets a voice. Propose changes, discuss in-app, and vote to approve. No more unilateral budget changes.

— EVERYTHING FROM v1.0, PLUS MORE —

• Envelope budgets with rollover
• Quick 3-tap transaction entry (under 30 seconds)
• Savings goals with progress tracking
• Expertise-tiered interface (Getting Started → Comfortable → Advanced)
• AI-powered transaction categorization (on-device)
• Natural language input ("$45 at Target yesterday on groceries")
• Receipt scanning and OCR
• Bank connections (optional, via Plaid)
• Multi-device sync (optional, E2E encrypted)

— PRIVACY ARCHITECTURE —

Your financial data stays on your device, encrypted with AES-256 (SQLCipher). Encryption keys live in the Secure Enclave. No data is uploaded unless you choose multi-device sync. No bank connection is ever required. The codebase is source-available — verify every claim at github.com/jrmoulckers/finance.

— PRICING —

Free forever: accounts, transactions, budgets, goals, widgets, basic analytics.
Premium ($4.99/mo or $39.99/yr): health score benchmarking, report builder, biometric categories, NLP input, receipt scanning, bank connections, unlimited everything.
Family plan available for shared households.

— ACCESSIBILITY —

• WCAG 2.2 AA compliant
• VoiceOver fully supported
• Dynamic Type respected
• Reduced motion mode
• High contrast mode
• Designed with ADHD and cognitive accessibility in mind
```

✅ Within 4000 character limit

---

## 3. Google Play Store Listing (v2.0)

### App Title (30 characters)

```
Finance - Budget Tracker
```

✅ 24/30 characters — unchanged

### Short Description (80 characters)

```
Private budgeting with health scores, custom reports, widgets. No ads. No data selling.
```

✅ Verify at 80 chars — **87 characters, needs trim:**

```
Private budgeting with health scores, reports, widgets. No ads. No data selling.
```

✅ 80/80 characters

### Full Description (4000 characters)

```
Finance helps you see where your money goes — and understand your overall financial health. Private by design. Offline by default. Powerful by choice.

🆕 NEW IN v2.0

📊 Financial Health Score — See your financial health as one number (0–100). Savings rate, debt ratio, emergency fund, and budget adherence. Calculated on your device. Opt-in anonymous benchmarking for premium users.

🔒 Biometric-Protected Categories — Lock sensitive spending behind fingerprint or face recognition. Medical, therapy, legal — categories that require authentication to view. Even in shared budgets, your protected spending stays private.

📱 Home Screen Widgets — Balance, budget status, recent transactions, and spending summary — right on your home screen. Five widget sizes. Data from your local encrypted database.

📋 Custom Report Builder — Drag-and-drop report components: spending by category, income vs. expense, budget progress, net worth trend, and more. Export PDF or CSV. All on-device.

🤝 Collaborative Budgets — Propose budget changes, discuss with household members, vote to approve. Everyone gets a say.

— CORE FEATURES —

• Envelope budgeting with rollover support
• 3-tap transaction entry (under 30 seconds)
• Savings goals with visual progress tracking
• Expertise tiers: Getting Started, Comfortable, Advanced
• AI categorization — learns from your corrections, runs on-device
• Natural language input: "Spent $45 at Target on groceries"
• Receipt scanning with on-device OCR
• Optional bank connections via Plaid
• Multi-device sync with end-to-end encryption
• Dashboard with customizable charts and insights

— PRIVACY FIRST —

Your financial data is encrypted on your device with AES-256 (SQLCipher). Keys stored in Android Keystore (hardware-backed). Nothing uploaded without your explicit choice. No bank connection required. Source-available code at github.com/jrmoulckers/finance.

— FREE CORE, HONEST PREMIUM —

Free: accounts, transactions, budgets, goals, widgets, basic charts.
Premium: health score benchmarking, report builder, biometric categories, NLP input, receipt scanning, bank connections, unlimited accounts and budgets.
No ads. No data selling. No feature walls on shipped v1.0 features.

— ACCESSIBLE —

• TalkBack fully supported
• Material You dynamic theming
• Reduced motion respected
• High contrast mode
• Designed for ADHD and cognitive accessibility
• WCAG 2.2 AA compliant
```

### Google Play Feature Graphic (1024×500)

**Concept:** Health Score gauge at center (showing "78 — Good"), flanked by widget previews and a biometric lock icon. Tagline overlay: "Your finances. Understood."

### Data Safety Section Updates

| Question                    | v2.0 Answer                                                                                       |
| --------------------------- | ------------------------------------------------------------------------------------------------- |
| Does this app collect data? | Yes — only if user opts in to sync or benchmarking                                                |
| Health Score data shared?   | No — calculated on-device. Benchmarking opt-in sends anonymized, aggregated data only             |
| Biometric data collected?   | No — biometric verification handled entirely by Android OS, app never accesses raw biometric data |
| Widget data?                | No collection — widgets read from local database only                                             |

---

## 4. Microsoft Store Listing (v2.0)

### App Name

```
Finance - Budget Tracker
```

### Short Description (256 characters)

```
Private, offline-first budget tracker with Financial Health Score, custom report builder, desktop widgets, and biometric-protected categories. All data encrypted on your device. No ads. No data selling. Free core. Source-available.
```

✅ 232/256 characters

### Description

```
Finance is a native Windows desktop app for tracking your finances — privately, offline, and on your terms.

NEW IN v2.0:

📊 Financial Health Score — A single 0–100 score reflecting your savings rate, debt ratio, emergency fund, and budget adherence. Calculated entirely on your device. Premium users can opt in to privacy-preserving anonymous benchmarks.

🔒 Biometric-Protected Categories — Use Windows Hello (face, fingerprint, or PIN) to lock sensitive spending categories. Medical, legal, therapy expenses stay private until you authenticate.

📱 Windows Widgets — Check your balance, budget status, and recent transactions from Windows Widgets. Powered by Adaptive Cards, refreshed from your local database.

📋 Custom Report Builder — Build drag-and-drop financial reports on a full desktop canvas. Select date ranges, metrics, and chart types. Export as PDF or CSV.

🤝 Collaborative Budget Negotiation — Share budgets with household members. Propose changes, discuss, and vote. Built for families and partners.

CORE FEATURES:
• Envelope budgeting with rollover
• Quick transaction entry
• Savings goals with progress tracking
• Three expertise levels (Getting Started → Comfortable → Advanced)
• AI categorization (on-device)
• Natural language input
• Receipt scanning
• Optional bank connections
• Multi-device sync with E2E encryption

PRIVACY:
All data encrypted with AES-256 (SQLCipher). Keys secured via DPAPI/TPM. No data uploaded without your choice. No bank connection required. Source-available codebase.

PRICING:
Free: complete tracker with accounts, budgets, goals, widgets.
Premium ($4.99/mo): health score benchmarking, reports, biometric categories, NLP input, receipt scanning, bank connections.

ACCESSIBILITY:
• Narrator fully supported
• High contrast themes
• Keyboard navigation throughout
• Reduced motion mode
• WCAG 2.2 AA compliant
```

---

## 5. What's New — v2.0 Release Notes (All Platforms)

### Short Version (For Store "What's New" Fields)

```
v2.0 — Your finances, understood.

NEW:
• Financial Health Score — See your financial health as one number (0–100)
• Custom Report Builder — Build, customize, and export financial reports
• Home Screen Widgets — Balance, budgets, and transactions at a glance
• Biometric-Protected Categories — Lock sensitive spending behind Face ID / fingerprint / Windows Hello
• Collaborative Budget Negotiation — Propose, discuss, and approve budget changes as a household

IMPROVED:
• Faster app launch and navigation
• Updated design tokens across all platforms
• Enhanced accessibility across all features
```

### Long Version (For Blog / Email)

See [v2-beta-transition.md](v2-beta-transition.md) § 5 for the full announcement email and blog post.

---

## 6. Updated Keywords & ASO Strategy

### New Keyword Clusters for v2.0

| Cluster      | Keywords                                                                      | Priority                       |
| ------------ | ----------------------------------------------------------------------------- | ------------------------------ |
| Health Score | `financial health`, `health score`, `money score`, `finance score`            | High — new differentiator      |
| Reports      | `financial report`, `budget report`, `expense report`, `report builder`       | Medium — premium feature       |
| Widgets      | `budget widget`, `finance widget`, `money widget`, `spending widget`          | Medium — drives DAU            |
| Biometric    | `biometric budget`, `private spending`, `secure categories`, `face id budget` | Low volume but high conversion |

### iOS Keywords (Updated — 100 chars)

```
budget,health score,expense,tracker,report,widget,offline,private,savings,goals,money,ADHD,biometric
```

### Google Play — Natural Keyword Integration

The full description naturally includes: `financial health score`, `biometric`, `widget`, `report builder`, `custom report`, `privacy`, `offline`, `budget tracker`, `expense`, `encrypted`. Google Play indexes the full description for search.

---

## 7. Screenshot Update Plan

### Required New Screenshots (All Platforms)

| Order | Screen                                             | Purpose                                                    | Notes                         |
| ----- | -------------------------------------------------- | ---------------------------------------------------------- | ----------------------------- |
| 1     | Dashboard with Health Score                        | Hero shot — shows the score prominently                    | Score value: 72 ("Good")      |
| 2     | Health Score detail view                           | Factor breakdown with improvement tips                     | Show all 4 factors            |
| 3     | Home screen with widget                            | Widget in context on the actual OS home screen             | Platform-specific             |
| 4     | Report builder (desktop) / Report preview (mobile) | Custom report with charts                                  | Show drag-and-drop or result  |
| 5     | Biometric lock prompt                              | Face ID / fingerprint dialog overlaying protected category | Platform-native dialog        |
| 6     | Transaction list with blurred protected entries    | Show biometric lock in action                              | "[Protected]" entries visible |
| 7     | Budget negotiation proposal                        | Household proposal with discussion thread                  | Show collaborative flow       |
| 8     | Quick transaction entry                            | Retained from v1.0 — still a core differentiator           | 3-tap flow                    |

### Screenshot Text Overlays

| Screen | Overlay Text                                  |
| ------ | --------------------------------------------- |
| 1      | "See your financial health at a glance"       |
| 2      | "Understand what drives your score"           |
| 3      | "Check your finances without opening the app" |
| 4      | "Build reports that answer your questions"    |
| 5      | "Sensitive spending stays private"            |
| 6      | "Protected until you say otherwise"           |
| 7      | "Budget together. Fairly."                    |
| 8      | "Add a transaction in under 30 seconds"       |

### Platform-Specific Screenshot Requirements

| Platform        | Count | Sizes                               | Dark Mode   | Notes                    |
| --------------- | ----- | ----------------------------------- | ----------- | ------------------------ |
| iOS             | 8     | 6.7" (required), 6.5", 5.5"         | Required    | Portrait only            |
| Google Play     | 8     | Phone (16:9), 7" tablet, 10" tablet | Recommended | Feature graphic required |
| Microsoft Store | 8     | 1366×768 minimum                    | Optional    | Desktop landscape        |

---

## 8. Character Limit Audit

| Field             | Platform | Limit | v2.0 Draft | Status |
| ----------------- | -------- | ----- | ---------- | ------ |
| App Name          | iOS      | 30    | 24         | ✅     |
| Subtitle          | iOS      | 30    | 27         | ✅     |
| Keywords          | iOS      | 100   | 99         | ✅     |
| Promotional Text  | iOS      | 170   | 167        | ✅     |
| Description       | iOS      | 4000  | ~3200      | ✅     |
| App Title         | Play     | 30    | 24         | ✅     |
| Short Description | Play     | 80    | 80         | ✅     |
| Full Description  | Play     | 4000  | ~3100      | ✅     |
| App Name          | MS Store | 256   | 24         | ✅     |
| Short Description | MS Store | 256   | 232        | ✅     |
| Description       | MS Store | 10000 | ~2800      | ✅     |

---

## Approval Checklist

- [ ] All store listings reviewed for brand voice alignment
- [ ] Character limits verified in actual store submission forms
- [ ] Privacy claims verified against architecture docs
- [ ] No claims about unshipped features
- [ ] Screenshots captured and reviewed (see screenshot-spec.md)
- [ ] Data safety / privacy labels updated per platform
- [ ] Pricing information accurate and current
- [ ] Accessibility claims verified with @accessibility-reviewer
- [ ] All `{{PLACEHOLDER}}` values resolved before submission
