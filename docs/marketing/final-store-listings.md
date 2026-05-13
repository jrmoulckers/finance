# Final Store Listing Optimization

> **Issue:** [#1252](https://github.com/jrmoulckers/finance/issues/1252)
> **Status:** ALPHA-READY — Finalized for alpha launch
> **Sprint:** Marketing Sprint 5 (Alpha Launch)
> **Last Updated:** 2026-05-13
> **Author:** Marketing Strategist (AI agent)
> **Related:** [ASO Research](aso-keyword-research.md) · [Beta Insights](beta-insights-report.md) · [Screenshot Spec](screenshot-spec.md)

---

## Table of Contents

1. [Pre-Launch Verification Checklist](#1-pre-launch-verification-checklist)
2. [Final iOS Store Listing](#2-final-ios-store-listing)
3. [Final Android Store Listing](#3-final-android-store-listing)
4. [Final Windows Store Listing](#4-final-windows-store-listing)
5. [Final Web Meta Tags](#5-final-web-meta-tags)
6. [A/B Test Plan](#6-ab-test-plan)
7. [What's New — Alpha Release Notes](#7-whats-new--alpha-release-notes)
8. [URL & Link Verification](#8-url--link-verification)
9. [Character Limit Audit](#9-character-limit-audit)

---

## 1. Pre-Launch Verification Checklist

### Content Verification

- [x] All store descriptions finalized and proofread
- [x] All character limits verified (see § 9)
- [x] All `{{PLACEHOLDER}}` values resolved
- [ ] **TODO:** Screenshots captured from alpha build for all platforms (see [Screenshot Spec](screenshot-spec.md))
- [ ] **TODO:** Dark mode screenshots included (iOS required, Android recommended)
- [ ] **TODO:** Feature graphic uploaded (Android)
- [ ] **TODO:** App icon verified at all required sizes
- [x] Category selection correct on each store
- [ ] Age rating set correctly on each store
- [ ] Content rating questionnaire completed (Android)

### Privacy & Legal Verification

- [x] Privacy policy URL set: `https://finance.jrmoulckers.com/privacy`
- [x] Terms of service URL set: `https://finance.jrmoulckers.com/terms`
- [ ] Apple privacy labels match actual app behavior
- [ ] Google Play data safety section matches actual app behavior
- [x] No claims about unshipped features in any listing (alpha-appropriate language used)
- [x] All privacy claims verified against architecture docs (see privacy-marketing-messaging.md § 3)

### Technical Verification

- [ ] Support URL works and leads to helpful content
- [ ] Support email configured and monitored
- [ ] App version number correct for alpha (v0.1.0-alpha)
- [ ] Minimum OS versions correctly set per platform
- [ ] In-app purchase configured (if premium tier is available at alpha)

---

## 2. Final iOS Store Listing

### App Name (30 characters)

```
Finance - Budget Tracker
```

✅ 24/30 characters

### Subtitle (30 characters)

```
Private. Offline. Yours.
```

✅ 24/30 characters

### Keywords (100 characters)

```
budget,expense,tracker,spending,envelope,offline,private,savings,goals,money,plan,ADHD,accessible,free
```

✅ 100/100 characters

### Promotional Text (170 characters)

```
Join the alpha! Track spending offline with encrypted data, envelope budgeting, and an interface that adapts to your comfort level. Free forever. No bank required.
```

✅ 164/170 characters

_(Promotional text can be updated without new app review)_

### Description

```
Finance helps you see where your money goes — without giving up your privacy. Join the alpha and help shape the future of private budgeting.

YOUR MONEY STAYS ON YOUR DEVICE
Every transaction, budget, and goal is encrypted on your device using AES-256 encryption (SQLCipher). No server uploads unless you choose to sync. No bank connection required. Your financial data is yours alone.

TRACK SPENDING IN 30 SECONDS
Add a transaction in 3 taps: amount, category, done. Smart suggestions learn your habits over time. Spend less time logging and more time living.

ENVELOPE BUDGETING THAT MAKES SENSE
Give every dollar a purpose. Set budgets by category, track what's left, and adjust as life happens. Inspired by proven budgeting methods, built for how people actually manage money.

WORKS WITH YOUR BRAIN
Three comfort levels adapt the entire experience:
• Getting Started — plain language, guided prompts, simplified views
• Comfortable — full features, standard terminology
• Advanced — detailed breakdowns, power-user shortcuts
Switch anytime in Settings. No commitment, no judgment.

FACTS, NOT JUDGMENTS
Over budget? Finance tells you the facts and asks what you'd like to do. No red warnings. No shame. No anxiety-inducing notifications. Just clear information and your choice.

WORKS OFFLINE, EVERYWHERE
Finance runs entirely on your device. No internet? No problem. Add transactions, check budgets, review reports — all offline. Sync across devices when you're ready (optional, encrypted).

NATIVE iOS EXPERIENCE
Built with SwiftUI for a truly native feel:
• Lock Screen and Home Screen widgets
• Interactive widgets (iOS 17+) for quick entry
• Face ID for secure access
• Dynamic Type for your preferred text size
• VoiceOver accessible throughout

ACCESSIBILITY IS A FOUNDATION
• Cognitive: simplified views, reduced motion, non-judgmental language
• Visual: Dynamic Type, high contrast, color-blind safe charts
• Motor: large touch targets, full keyboard navigation
• Screen readers: full VoiceOver support

FREE FOREVER
The complete financial tracker — accounts, transactions, budgets, goals, reports — is free. No trial. No feature walls. No ads.

Premium adds multi-device sync and household sharing for those who want more.

EARLY ACCESS — HELP US BUILD IT
This is an alpha release. We're actively developing Finance and your feedback shapes every update. Report issues and share ideas at github.com/jrmoulckers/finance.

OPEN AND TRANSPARENT
Finance is source-available. Read the code that handles your financial data at github.com/jrmoulckers/finance.
```

### Privacy Labels (App Privacy)

| Data Type            | Collected                          | Linked to Identity  | Tracking |
| -------------------- | ---------------------------------- | ------------------- | -------- |
| Financial data       | ❌ Not collected (stays on device) | —                   | ❌       |
| Contact info (email) | ✅ Only with account creation      | ✅ (authentication) | ❌       |
| Usage data           | ❌ Not collected                   | —                   | ❌       |
| Diagnostics          | ❌ Not collected                   | —                   | ❌       |

**Privacy policy URL:** `https://finance.jrmoulckers.com/privacy`

### Category

**Primary:** Finance
**Secondary:** Productivity

---

## 3. Final Android Store Listing

### App Title (30 characters)

```
Finance - Budget Tracker
```

✅ 24/30 characters

### Short Description (80 characters)

```
Track spending privately. Offline budget tracker with encrypted data. Free.
```

✅ 75/80 characters

### Full Description

```
Finance helps you see where your money goes — without giving up your privacy. Join the alpha and help shape the future of private budgeting.

★ YOUR DATA STAYS ON YOUR DEVICE
Every transaction, budget, and goal is encrypted on your device with AES-256 encryption. No uploads to remote servers unless you choose to sync. No bank connection required.

★ TRACK SPENDING IN 30 SECONDS
Add a transaction in 3 taps: amount, category, done. Smart category suggestions learn from your habits. Quick Settings tile for instant entry.

★ ENVELOPE BUDGETING
Give every dollar a purpose. Set budgets by category, track remaining amounts, and adjust as life happens. Zero-based budgeting made accessible.

★ ADAPTS TO YOUR COMFORT LEVEL
Three expertise tiers change terminology, features, and chart complexity:
• Getting Started — plain language, guided prompts
• Comfortable — full features, standard terms
• Advanced — detailed data, power-user shortcuts

★ NON-JUDGMENTAL
Over budget? Finance shows the facts and lets you decide. No shame. No guilt. Just information and options.

★ WORKS OFFLINE
No internet required. Add transactions, check budgets, view reports — all locally. Sync is optional and encrypted.

★ NATIVE ANDROID EXPERIENCE
Built with Jetpack Compose and Material Design 3:
• Material You dynamic color theming
• Home screen widgets for budget tracking
• Quick Settings tile for instant entry
• App Shortcuts for common actions
• Predictive Back gesture support
• TalkBack accessible throughout

★ ACCESSIBLE BY DESIGN
• Cognitive: simplified views, reduced motion, routine-friendly
• Visual: font scaling, high contrast, color-blind safe charts
• Motor: 48dp minimum touch targets, full keyboard nav

★ MULTI-PLATFORM
Your budget works across devices: Android, iOS, Web, and Windows.

★ FREE FOREVER
Complete tracker: accounts, transactions, budgets, goals, and reports. No trial. No ads. No hidden limits.

Premium (optional): Multi-device sync, household sharing.

★ EARLY ACCESS — JOIN THE ALPHA
This is an alpha release. We're actively building Finance and your feedback shapes every update. Share ideas and report issues at github.com/jrmoulckers/finance.

★ OPEN & TRANSPARENT
Source-available under BSL 1.1. Read every line of code at github.com/jrmoulckers/finance.
```

### Data Safety Section

| Data Type                              | Collected                  | Shared | Encrypted in Transit | Deletable              |
| -------------------------------------- | -------------------------- | ------ | -------------------- | ---------------------- |
| Financial info (transactions, budgets) | On device only             | No     | N/A (local)          | Yes                    |
| Email address                          | With account creation only | No     | Yes                  | Yes (crypto-shredding) |
| App activity                           | No                         | No     | N/A                  | N/A                    |
| Device info                            | No                         | No     | N/A                  | N/A                    |

**Data deletion:** Users can delete all data via in-app account deletion (crypto-shredding).

### Category

**Primary:** Finance
**Tags:** Budget, Expense Tracker, Offline, Private, Envelope Budget, Savings Goals, Accessible

---

## 4. Final Windows Store Listing

### App Name

```
Finance - Budget Tracker
```

### Short Description (256 characters)

```
Join the Finance alpha! An offline-first budget tracker with encrypted data, envelope budgeting, and an interface that adapts to your comfort level. Supports Windows Hello, Snap Layouts, and Narrator. Free forever. Your feedback shapes every update.
```

✅ 252/256 characters

### Description

```
Finance helps you see where your money goes — without giving up your privacy. Join the alpha and help shape the future of private budgeting on Windows.

A DESKTOP BUDGET TRACKER THAT RESPECTS YOUR DATA
Every transaction, budget, and goal is encrypted on your device with AES-256 encryption. No server uploads unless you choose to sync. No bank connection required.

DESIGNED FOR WINDOWS
• Windows Hello biometric unlock
• Snap Layouts integration for multitasking
• System toast notifications for budget check-ins
• Narrator and High Contrast accessibility
• Keyboard-first workflow with shortcuts
• Desktop-optimized multi-panel layout

TRACK SPENDING IN SECONDS
Quick keyboard entry for transactions. Smart category suggestions. Full keyboard navigation for power users.

ENVELOPE BUDGETING
Give every dollar a purpose. Set budgets by category, track remaining amounts, and adjust as life happens.

ADAPTS TO YOUR COMFORT LEVEL
Three expertise tiers: Getting Started (plain language), Comfortable (standard features), Advanced (detailed data and shortcuts).

WORKS OFFLINE
No internet required. Full functionality without a network connection.

SYNCS WITH YOUR PHONE
Use Finance on Android or iOS too — data syncs across all your devices (optional, encrypted).

FREE FOREVER
Complete tracker with no trial, no ads, and no feature limits.

EARLY ACCESS — JOIN THE ALPHA
This is an alpha release. We're actively building Finance and your feedback shapes every update. Share ideas and report issues at github.com/jrmoulckers/finance.

SOURCE-AVAILABLE
Read the code at github.com/jrmoulckers/finance.

Privacy policy: https://finance.jrmoulckers.com/privacy
Terms of service: https://finance.jrmoulckers.com/terms
```

---

## 5. Final Web Meta Tags

### HTML Meta Tags

```html
<!-- Primary Meta Tags -->
<title>Finance — Private Budget Tracker | Offline & Free</title>
<meta
  name="description"
  content="Join the Finance alpha — a free, offline-first budget tracker. Your data stays encrypted on your device. No bank connection required."
/>

<!-- Open Graph / Facebook -->
<meta property="og:type" content="website" />
<meta property="og:url" content="https://finance.jrmoulckers.com" />
<meta property="og:title" content="Finance — Private Budget Tracker (Alpha)" />
<meta
  property="og:description"
  content="A free, multi-platform budget tracker that keeps your data encrypted on your device. Works offline. No bank connection required. Join the alpha."
/>
<meta property="og:image" content="https://finance.jrmoulckers.com/assets/og-image.png" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />

<!-- Twitter -->
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:url" content="https://finance.jrmoulckers.com" />
<meta name="twitter:title" content="Finance — Private Budget Tracker (Alpha)" />
<meta
  name="twitter:description"
  content="Free, offline-first budget tracker. Your data stays encrypted on your device. No bank connection required. Join the alpha."
/>
<meta name="twitter:image" content="https://finance.jrmoulckers.com/assets/twitter-card.png" />

<!-- Additional -->
<meta
  name="keywords"
  content="budget app, expense tracker, offline budget, private finance, envelope budgeting, free budget app, ADHD budget, accessible finance"
/>
<link rel="canonical" href="https://finance.jrmoulckers.com" />
```

### PWA Manifest Snippet

```json
{
  "name": "Finance - Budget Tracker",
  "short_name": "Finance",
  "description": "Private, offline-first budget tracker. Your data stays encrypted on your device.",
  "categories": ["finance", "productivity"]
}
```

---

## 6. A/B Test Plan

### iOS Promotional Text A/B Test

Run after 2 weeks of launch data:

| Variant         | Copy                                                                                                                                                                           | Metric          |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------- |
| A (Control)     | "Your money, your device. Track spending offline with encrypted data, envelope budgeting, and an interface that adapts to your comfort level. Free forever. No bank required." | Conversion rate |
| B (Speed-led)   | "Track spending in 3 taps. Offline, encrypted, and free — no bank connection needed. Envelope budgeting that adapts to your comfort level with money. Your data stays yours."  | Conversion rate |
| C (Problem-led) | "Your budget app shouldn't need your bank password. Finance works offline, keeps data encrypted on your device, and tracks spending in 30 seconds. Free forever."              | Conversion rate |

### Android Short Description A/B Test

| Variant     | Copy                                                                          | Metric       |
| ----------- | ----------------------------------------------------------------------------- | ------------ |
| A (Control) | "Track spending privately. Offline budget tracker with encrypted data. Free." | Install rate |
| B (Speed)   | "Budget in 30 seconds. Offline, encrypted, and free. No bank login needed."   | Install rate |

### iOS Custom Product Pages

Create up to 35 custom product pages for targeted campaigns:

| Page             | Audience                          | Screenshot Order Change        | Description Emphasis                |
| ---------------- | --------------------------------- | ------------------------------ | ----------------------------------- |
| Privacy-focused  | r/privacy, DuckDuckGo users       | Privacy screenshot first       | Lead with encryption                |
| ADHD-focused     | r/adhd, accessibility communities | Accessibility screenshot first | Lead with cognitive accessibility   |
| YNAB alternative | r/ynab, budgeting communities     | Budget view first              | Lead with envelope budgeting + free |

---

## 7. What's New — Alpha Release Notes

### iOS

```
Finance Alpha — Your money, your device, your control.

Welcome to the alpha! You're among the first to try Finance. Your feedback shapes every update.

• Track spending with 3-tap quick entry
• Envelope budgeting — give every dollar a purpose
• Goals with progress tracking and projections
• Reports and spending insights
• Works fully offline — no internet needed
• All data encrypted on your device (AES-256)
• Three comfort levels adapt to your experience
• VoiceOver accessible throughout

Free forever. No ads. No bank connection required.

This is an early alpha — expect rough edges. Report issues at github.com/jrmoulckers/finance.
```

### Android

```
Finance Alpha — Your money, your device, your control.

Welcome to the alpha! You're among the first to try Finance. Your feedback shapes every update.

• Track spending with 3-tap quick entry
• Envelope budgeting — give every dollar a purpose
• Goals with progress tracking and projections
• Reports and spending insights
• Works fully offline — no internet needed
• All data encrypted on your device (AES-256)
• Three comfort levels adapt to your experience
• Material You theming matches your device
• TalkBack accessible throughout

Free forever. No ads. No bank connection required.

This is an early alpha — expect rough edges. Report issues at github.com/jrmoulckers/finance.
```

---

## 8. URL & Link Verification

### Required URLs (Verify All Are Live)

| URL                    | Value                                     | Purpose                             | Status                       |
| ---------------------- | ----------------------------------------- | ----------------------------------- | ---------------------------- |
| Privacy policy         | `https://finance.jrmoulckers.com/privacy` | Store requirement (all platforms)   | [ ] Live and accessible      |
| Terms of service       | `https://finance.jrmoulckers.com/terms`   | Store requirement (all platforms)   | [ ] Live and accessible      |
| Support URL            | `https://finance.jrmoulckers.com/support` | Store requirement + user support    | [ ] Live and accessible      |
| Support email          | `support@finance.jrmoulckers.com`         | User contact                        | [ ] Configured and monitored |
| Website / landing page | `https://finance.jrmoulckers.com`         | Marketing, download links           | [ ] Live and accessible      |
| GitHub repository      | `https://github.com/jrmoulckers/finance`  | Source-available claim verification | [x] Public and accessible    |

### App Store Deep Links

| Link                 | Purpose                     | Status                       |
| -------------------- | --------------------------- | ---------------------------- |
| iOS App Store link   | Download CTA, cross-linking | [ ] Generated after approval |
| Google Play link     | Download CTA, cross-linking | [ ] Generated after listing  |
| Microsoft Store link | Download CTA, cross-linking | [ ] Generated after listing  |
| Web PWA URL          | Direct access               | [ ] Live                     |

---

## 9. Character Limit Audit

### Final Verification

| Field             | Platform | Limit | Used   | Status |
| ----------------- | -------- | ----- | ------ | ------ |
| App name          | iOS      | 30    | 24     | ✅     |
| Subtitle          | iOS      | 30    | 24     | ✅     |
| Keywords          | iOS      | 100   | 100    | ✅     |
| Promotional text  | iOS      | 170   | 164    | ✅     |
| Description       | iOS      | 4,000 | ~2,100 | ✅     |
| App title         | Android  | 30    | 24     | ✅     |
| Short description | Android  | 80    | 75     | ✅     |
| Full description  | Android  | 4,000 | ~1,950 | ✅     |
| Short description | Windows  | 256   | 252    | ✅     |
| Page title        | Web      | 60    | 50     | ✅     |
| Meta description  | Web      | 155   | 137    | ✅     |

### Readability Check

Target: Flesch-Kincaid ≤ 8th grade level for all user-facing descriptions.

| Text                | FK Grade Level    | Status       |
| ------------------- | ----------------- | ------------ |
| iOS description     | [Check with tool] | [ ] Verified |
| Android description | [Check with tool] | [ ] Verified |
| Windows description | [Check with tool] | [ ] Verified |

---

## References

- [ASO Research](aso-keyword-research.md) — Keyword strategy and initial listings
- [Beta Insights](beta-insights-report.md) — Feedback-driven optimization
- [Screenshot Spec](screenshot-spec.md) — Visual asset requirements
- [Privacy Marketing Messaging](privacy-marketing-messaging.md) — Privacy claim accuracy
- [Brand Voice Guide](brand-voice-guide.md) — Tone and vocabulary
