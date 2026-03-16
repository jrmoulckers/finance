# App Store Metadata — Ready to Submit

> **Status:** DRAFT — Pending human review
> **Last Updated:** 2025-07-22
> **Purpose:** Copy-paste-ready metadata for all distribution channels in a single file
> **Related:** [App Store Submission Guide](app-store-submission.md) — detailed per-platform requirements, checklists, and review notes

---

## Table of Contents

- [App Identity](#app-identity)
- [Full Description (All Stores)](#full-description-all-stores)
- [Keywords](#keywords)
- [What's New (v0.1.0)](#whats-new-v010)
- [Screenshots Checklist](#screenshots-checklist)
- [Privacy & Data Labels Summary](#privacy--data-labels-summary)
- [Support & Contact](#support--contact)

---

## App Identity

| Field                | Value                                                 |
| -------------------- | ----------------------------------------------------- |
| **App Name**         | Finance                                               |
| **Subtitle / Short** | Private financial tracking                            |
| **Developer Name**   | `[Your Name / Company]`                               |
| **Category**         | Finance / Personal Finance                            |
| **Content Rating**   | 4+ (iOS) · Everyone (Android) · PEGI 3 (Windows/IARC) |
| **Pricing**          | Free (with in-app purchases for Premium tier)         |
| **Bundle ID**        | `com.finance.app`                                     |
| **Default Locale**   | English (US)                                          |

---

## Full Description (All Stores)

> Max 4,000 characters (iOS & Android) · 10,000 characters (Microsoft Store).
> The text below is ~1,900 characters and fits all stores without modification.

```
Take control of your money — privately, on every device.

Finance is a personal finance tracker built for clarity, privacy, and speed. Track accounts, transactions, budgets, and goals across iOS, Android, Windows, and the web — all from a single, beautifully native app on each platform.

YOUR DATA STAYS YOURS
Finance is offline-first. Your financial data is encrypted at rest with SQLCipher (AES-256) and never leaves your device unless you choose to sync. No bank connections required. No third-party data sharing. Signal-level privacy for your finances.

30 SECONDS OR LESS
Add transactions in 3 taps. Widgets show your remaining budget at a glance. Quick-check "Can I Afford This?" from your home screen. Finance is designed around a daily habit that takes less than 30 seconds.

WORKS WITH YOUR BRAIN
Choose your expertise level — Getting Started, Comfortable, or Advanced — and the entire app adapts. Terminology, visible features, chart complexity, and notifications all adjust to your comfort level. Contextual education explains every financial concept with a single tap.

FEATURES
• Account management — Checking, savings, credit cards, cash, investments, loans
• Transaction tracking — Quick entry, recurring transactions, multi-currency support
• Envelope budgeting — Give every dollar a job with flexible spending plans
• Goal tracking — Set savings goals with visual progress and milestone celebrations
• Reports & analytics — Spending trends, category breakdowns, monthly comparisons
• Multi-device sync — Optional encrypted cloud sync across all your devices
• Partner & family sharing — Shared budgets with role-based access (Premium)
• Data export — Export all your data in CSV or JSON at any time

DESIGNED FOR EVERYONE
Finance meets WCAG 2.2 AA accessibility standards. Screen reader support (VoiceOver, TalkBack, Narrator, NVDA), dynamic text sizing, high contrast mode, reduced motion support, and cognitive accessibility (ADHD-friendly design) are built in — not bolted on.

FACTS, NOT JUDGMENTS
Finance observes and informs — it never shames. Over budget? The app offers to help you adjust, not scold. Missed a day of logging? "Welcome back! Pick up where you left off."

FREE FOREVER (CORE)
All core financial tracking features are free, forever. Premium unlocks AI-powered insights, multi-device sync, and household sharing.

Privacy policy: {{PRIVACY_POLICY_URL}}
Terms of service: {{TERMS_OF_SERVICE_URL}}
```

### Platform-Specific Overrides

| Platform | Field             | Limit       | Value                                                                                                         |
| -------- | ----------------- | ----------- | ------------------------------------------------------------------------------------------------------------- |
| iOS      | Subtitle          | 30 chars    | `Private financial tracking` (26 chars ✅)                                                                    |
| iOS      | Promotional text  | 170 chars   | `Track every dollar privately. Offline-first budgeting for individuals, couples, and families.` (93 chars ✅) |
| Android  | Short description | 80 chars    | `Track your money privately. Offline-first budgeting and expense tracking.` (73 chars ✅)                     |
| Windows  | Short description | 1,000 chars | Use the first two paragraphs of the full description above                                                    |

---

## Keywords

### iOS — App Store (100 characters max, comma-separated, no spaces)

```
budget,expense,tracker,money,finance,savings,offline,privacy,spending,goals
```

Character count: 74 ✅

### Android — Google Play (up to 5 tags)

```
budgeting
expense tracker
personal finance
offline
privacy
```

### Windows — Microsoft Store (up to 7 keywords)

```
budgeting
expense tracker
personal finance
offline
privacy
money
savings
```

---

## What's New (v0.1.0)

> Use this as the release notes for the initial submission on every store.

```
Initial release:
- Track accounts, transactions, budgets, and savings goals
- Expertise-tiered UI (Getting Started, Comfortable, Advanced)
- Multi-currency support with 150+ currencies
- Envelope budgeting — give every dollar a job
- Reports and spending trend analysis
- Offline-first with AES-256 encrypted local storage
- Optional end-to-end encrypted cloud sync (Premium)
- Available on iOS, Android, Web, and Windows
```

---

## Screenshots Checklist

Capture all screenshots from a **release build** with realistic sample data. Never use dev builds or mockups.

### Required Screens (in recommended order)

1. **Dashboard** — "See your finances at a glance"
2. **Quick Entry** — "Add transactions in 3 taps"
3. **Budgets** — "Give every dollar a job"
4. **Reports** — "Understand your spending trends"
5. **Goals** — "Track progress toward what matters"

### Dimensions by Platform

| Platform         | Device / Type          | Dimensions (px)    | Required              |
| ---------------- | ---------------------- | ------------------ | --------------------- |
| **iOS (iPhone)** | iPhone 16 Pro Max 6.9" | 1320 × 2868        | ✅ Required           |
| iOS (iPhone)     | iPhone 16 Pro 6.3"     | 1206 × 2622        | Recommended           |
| iOS (iPhone)     | iPhone SE 4.7"         | 750 × 1334         | If supporting SE      |
| **iOS (iPad)**   | iPad Pro 13" (M4)      | 2064 × 2752        | ✅ If supporting iPad |
| iOS (iPad)       | iPad Pro 11" (M4)      | 1668 × 2420        | Falls back to 13"     |
| **Android**      | Phone                  | 1080 × 1920 (16:9) | ✅ Minimum 2          |
| Android          | 7" Tablet              | 1200 × 1920        | Recommended           |
| Android          | 10" Tablet             | 1600 × 2560        | Recommended           |
| Android          | Feature Graphic        | 1024 × 500         | ✅ Required           |
| **Windows**      | Desktop                | 1920 × 1080 (rec.) | ✅ 1–10 required      |
| Windows          | Desktop (minimum)      | 1366 × 768         | Minimum accepted      |
| **Web (PWA)**    | OG Image               | 1200 × 630         | ✅ Social sharing     |

### Screenshot Format Rules

| Store   | Format      | Notes                                 |
| ------- | ----------- | ------------------------------------- |
| iOS     | PNG or JPEG | No alpha channel, portrait preferred  |
| Android | PNG or JPEG | No alpha/transparency, max 8 MB each  |
| Windows | PNG         | Landscape orientation, desktop window |
| Web     | PNG         | OG image for link previews            |

### Screenshot Storage Paths

| Platform | Directory                           |
| -------- | ----------------------------------- |
| iOS      | `apps/ios/Screenshots/`             |
| Android  | `apps/android/screenshots/`         |
| Windows  | `apps/windows/screenshots/desktop/` |
| Web      | `apps/web/public/` (OG image)       |

---

## Privacy & Data Labels Summary

> Full details: [Apple Privacy Labels](../legal/privacy-labels-apple.md) · [Google Data Safety](../legal/data-safety-google-play.md)
>
> ⚠️ These are internal drafts. Verify against the shipping build and any integrated SDKs before submitting to any store.

### Data Collected

| Data Type      | Collected        | Shared | Purpose                  | Notes                      |
| -------------- | ---------------- | ------ | ------------------------ | -------------------------- |
| Email address  | ✅               | ❌     | Account management, auth | Required only for sync     |
| Display name   | ✅ (optional)    | ❌     | Profile personalization  | —                          |
| Financial info | ✅               | ❌     | Core app functionality   | Transactions, budgets, etc |
| Usage data     | ✅ (opt-in only) | ❌     | Analytics                | PII-free                   |
| Crash logs     | ✅ (opt-in only) | ⚠️\*   | Stability monitoring     | \*If Sentry is enabled     |
| Device/OS info | ✅ (opt-in only) | ⚠️\*   | Stability monitoring     | \*If Sentry is enabled     |

### Data NOT Collected

Location · Contacts · Browsing history · Search history · Advertising identifiers · Tracking across apps/websites

### Key Declarations (All Stores)

- ✅ Data encrypted in transit (TLS 1.3)
- ✅ Data encrypted at rest (SQLCipher AES-256)
- ✅ Users can request data deletion
- ✅ Users can export data (JSON/CSV)
- ✅ Data is **not** sold to third parties
- ✅ No advertising or tracking
- ❌ App Tracking Transparency (ATT) not required — Finance does not track

---

## Support & Contact

> ⚠️ Replace all `{{PLACEHOLDER}}` values with real URLs and addresses before submission.
> Privacy policy and terms of service must be **live and publicly accessible** (no auth wall) at submission time.

| Field                  | Value                      | Notes                                          |
| ---------------------- | -------------------------- | ---------------------------------------------- |
| **Support URL**        | `{{SUPPORT_URL}}`          | Help content or contact form                   |
| **Privacy Policy URL** | `{{PRIVACY_POLICY_URL}}`   | Required by all stores; must be public         |
| **Terms of Service**   | `{{TERMS_OF_SERVICE_URL}}` | Required by Apple; recommended for all stores  |
| **Support Email**      | `{{SUPPORT_EMAIL}}`        | Must be monitored — stores forward user issues |
| **Marketing Website**  | `{{WEBSITE_URL}}`          | Landing page with download links               |

---

## Quick Reference

For complete per-platform submission instructions, review checklists, app review notes, and post-submission runbook, see the [App Store Submission Guide](app-store-submission.md).
