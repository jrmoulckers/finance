# Premium Tier Paywall and Upgrade UX Design Specification

> **Sprint:** 7 — Revenue Foundation
> **Issue:** #793
> **Priority:** P1 — High
> **Date:** 2025-07-27
> **Owner:** Product Management + Design
> **Status:** Complete

---

## Executive Summary

This document specifies the complete premium upgrade user experience for the Finance app. It defines paywall flows, upgrade prompt placements, the free vs. premium feature comparison, subscription management, and the ethical design principles that govern every monetization touchpoint. All designs must pass the "would I be annoyed by this?" test.

---

## Design Principles (Non-Negotiable)

These principles are mandatory for every monetization touchpoint in the Finance app:

### 1. Contextual, Not Interruptive

- Paywalls appear **only** when a user attempts a Premium feature
- Never on app launch, never after completing a free action, never mid-flow
- The user's intent triggers the paywall — we never interrupt with upsells

### 2. Dismissable and Respectful

- Every paywall is dismissable with **one tap** (prominent "Not now" or X button)
- After dismissal, the same paywall does not reappear for **≥30 days**
- Users are never forced to view a paywall more than once per feature per month

### 3. Honest and Transparent

- No countdown timers, no "limited offers," no red urgency colors
- No artificial scarcity ("Only X spots left")
- No guilt-based copy ("You're missing out!")
- Price is always visible and clear — no hidden fees
- Free trial terms in plain language at the top, not buried in fine print

### 4. Free Tier Is Never Diminished

- Free tier is called "Finance" — not "Basic," "Starter," "Limited," or "Lite"
- Free users never see degraded UI, slower performance, or nag screens
- Free features are never removed or paywalled after the user has accessed them

### 5. Easy Cancellation

- Cancel subscription from within the app (not just app store settings)
- No "are you sure?" guilt screens — single confirmation
- Clear communication of what happens after cancellation
- Data is never lost or locked upon downgrade

---

## Premium Tier Definition

### Feature Comparison Table

| Feature                   | Finance (Free) | Finance Premium |
| ------------------------- | -------------- | --------------- |
| **Accounts**              | Unlimited      | Unlimited       |
| **Transactions**          | Unlimited      | Unlimited       |
| **Budgets**               | Up to 5        | Unlimited       |
| **Goals**                 | Up to 3        | Unlimited       |
| **Data export (CSV)**     | ✅             | ✅              |
| **Multi-device sync**     | ✅             | ✅              |
| **Offline support**       | ✅             | ✅              |
| **Biometric auth**        | ✅             | ✅              |
| **Custom reports**        | —              | ✅              |
| **AI categorization**     | —              | ✅ (v1.2)       |
| **NLP transaction input** | —              | ✅ (v1.2)       |
| **Bank connections**      | —              | ✅ (v1.2)       |
| **Receipt OCR**           | —              | ✅ (v1.2)       |
| **Widget customization**  | Basic          | Full            |
| **Priority support**      | —              | ✅              |

### Pricing Structure

| Plan    | Price                     | Billing | Free Trial |
| ------- | ------------------------- | ------- | ---------- |
| Monthly | $4.99/month               | Monthly | 14 days    |
| Annual  | $39.99/year ($3.33/month) | Annual  | 14 days    |

**Competitive context:** YNAB ($14.99/mo), Monarch ($9.99/mo), Copilot ($9.99/mo), Goodbudget (Free/$8/mo)

Finance Premium is positioned as the **most affordable** premium finance app, reflecting the privacy-first, no-server-cost architecture.

---

## Paywall Flow Specifications

### Flow 1: Soft Paywall at Premium Feature Gate

**Trigger:** User taps a feature that requires Premium (e.g., 6th budget, 4th goal, custom report)

```
┌─────────────────────────────────┐
│  [X] Not now                    │
│                                 │
│  🔓 Unlock [Feature Name]      │
│                                 │
│  [Feature Name] is part of      │
│  Finance Premium.               │
│                                 │
│  ┌─────────────────────────┐    │
│  │ Finance vs Premium      │    │
│  │ comparison table         │    │
│  │ (contextual — shows      │    │
│  │  relevant features only) │    │
│  └─────────────────────────┘    │
│                                 │
│  Try Premium free for 14 days   │
│  No credit card required.       │
│                                 │
│  ┌─────────────────────────┐    │
│  │  Start Free Trial        │    │
│  └─────────────────────────┘    │
│                                 │
│  $4.99/month or $39.99/year     │
│  Cancel anytime in Settings.    │
│                                 │
│  Already a subscriber?          │
│  Restore purchase               │
└─────────────────────────────────┘
```

**Key UX Details:**

- "Not now" / X button is **equally prominent** as the CTA — no visual tricks
- Comparison table is **contextual** — shows only features relevant to what the user tried
- Price and cancellation info visible without scrolling
- No auto-scroll, no animation, no delay before the dismiss button appears
- Screen does not reappear for this feature for ≥30 days after dismissal

### Flow 2: Premium Discovery in Settings

**Trigger:** User navigates to Settings → Finance Premium

```
┌─────────────────────────────────┐
│  ← Settings                     │
│                                 │
│  Finance Premium                │
│                                 │
│  Full comparison table:         │
│  ┌─────────────────────────┐    │
│  │ Feature  | Free | Prem. │    │
│  │ ─────────┼──────┼────── │    │
│  │ Budgets  | 5    | ∞     │    │
│  │ Goals    | 3    | ∞     │    │
│  │ Reports  | —    | ✅    │    │
│  │ AI Cat.  | —    | ✅    │    │
│  │ ... etc  | ...  | ...   │    │
│  └─────────────────────────┘    │
│                                 │
│  Plan selection:                │
│  ○ Monthly  $4.99/mo            │
│  ● Annual   $39.99/yr (Save 33%)│
│                                 │
│  ┌─────────────────────────┐    │
│  │  Start 14-Day Free Trial │    │
│  └─────────────────────────┘    │
│                                 │
│  Free trial terms:              │
│  • 14 days free, then billed    │
│  • Cancel anytime before trial  │
│    ends to avoid charges        │
│  • Manage in Settings > Sub.    │
│                                 │
│  Restore purchase               │
└─────────────────────────────────┘
```

### Flow 3: Free Trial Expiration

**Trigger:** 14-day trial expires, user has not converted

```
┌─────────────────────────────────┐
│  [X] Continue with Finance      │
│                                 │
│  Your free trial has ended      │
│                                 │
│  Thanks for trying Premium!     │
│  Here's what you used:          │
│                                 │
│  • Created 8 budgets (5 free)   │
│  • Generated 3 custom reports   │
│  • Used AI categorization       │
│                                 │
│  Keep using Premium features:   │
│                                 │
│  ┌─────────────────────────┐    │
│  │  Subscribe — $4.99/mo    │    │
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │  Annual — $39.99/yr      │    │
│  └─────────────────────────┘    │
│                                 │
│  Your extra budgets and reports │
│  will be read-only on the free  │
│  tier. Nothing is deleted.      │
│                                 │
└─────────────────────────────────┘
```

**Key UX Details:**

- "Continue with Finance" is equally prominent — user is not trapped
- Shows personalized usage data — concrete value, not vague claims
- Explicitly states data is preserved (read-only, not deleted)
- Shown only once. After dismissal, user is on free tier with no further prompts

### Flow 4: Subscription Management

**Trigger:** Settings → Subscription

```
┌─────────────────────────────────┐
│  ← Settings                     │
│                                 │
│  Your Subscription              │
│                                 │
│  Plan: Annual ($39.99/yr)       │
│  Next billing: Aug 15, 2025     │
│  Status: Active                 │
│                                 │
│  ┌─────────────────────────┐    │
│  │  Switch to Monthly       │    │
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │  Cancel Subscription     │    │
│  └─────────────────────────┘    │
│                                 │
│  What happens if I cancel?      │
│  • Premium features become      │
│    read-only at period end      │
│  • Extra budgets/goals are      │
│    preserved but read-only      │
│  • You keep all your data       │
│  • You can re-subscribe anytime │
│                                 │
│  Manage via App Store / Play    │
│  Store: [Open Store Settings]   │
└─────────────────────────────────┘
```

### Flow 5: Cancellation Confirmation

```
┌─────────────────────────────────┐
│                                 │
│  Cancel Premium?                │
│                                 │
│  Your subscription will remain  │
│  active until Aug 15, 2025.     │
│  After that, Premium features   │
│  become read-only.              │
│                                 │
│  ┌─────────────────────────┐    │
│  │  Yes, Cancel              │    │
│  └─────────────────────────┘    │
│  ┌─────────────────────────┐    │
│  │  Keep Premium             │    │
│  └─────────────────────────┘    │
│                                 │
│  Both buttons are equally       │
│  styled — no visual bias.       │
│                                 │
└─────────────────────────────────┘
```

**Key UX Details:**

- Single confirmation — no "are you sure?" guilt chain
- No "reasons for leaving" survey blocking the flow (optional survey after)
- Both buttons visually equal — no making "Keep" more prominent
- Clear communication of what happens and when

---

## Upgrade Prompt Inventory

Every location where a Premium prompt may appear:

| Location                   | Trigger                                | Frequency        | Type              |
| -------------------------- | -------------------------------------- | ---------------- | ----------------- |
| Budget creation (6th+)     | User taps "New Budget" with 5 existing | Once per 30 days | Soft paywall      |
| Goal creation (4th+)       | User taps "New Goal" with 3 existing   | Once per 30 days | Soft paywall      |
| Custom report access       | User taps "Reports"                    | Once per 30 days | Soft paywall      |
| AI categorization toggle   | User enables AI in settings            | Once per 30 days | Soft paywall      |
| NLP input mode             | User taps NLP input (v1.2)             | Once per 30 days | Soft paywall      |
| Widget customization       | User tries advanced widget options     | Once per 30 days | Soft paywall      |
| Settings → Finance Premium | User navigates intentionally           | Always available | Full comparison   |
| Trial expiration           | Trial period ends                      | Once (ever)      | Conversion prompt |

### Prompt Rules

1. **Maximum 1 paywall impression per user per day** across all triggers
2. **30-day cooldown per trigger** after dismissal
3. **No prompts during onboarding** (first 7 days after install)
4. **No prompts after a negative experience** (crash, error, sync failure)
5. **Trial expiration prompt shown exactly once** — then user is on free tier

---

## Platform-Specific Considerations

### iOS

- IAP via StoreKit 2
- Subscription management deep-links to iOS Settings
- Must comply with App Store Review Guidelines §3.1 (in-app purchase)
- "Restore Purchase" required and prominent

### Android

- IAP via Google Play Billing Library v6+
- Subscription management via Play Store
- Must comply with Google Play policies on subscriptions
- "Restore Purchase" required for cross-device

### Web

- Stripe checkout for web subscriptions
- Subscription management within the app
- Clear PCI compliance indicators
- Same pricing as mobile (no web markup)

### Windows

- Microsoft Store IAP
- Subscription management via Microsoft Account
- Must comply with Microsoft Store policies
- Cross-platform subscription recognition

### Cross-Platform Subscription Recognition

- A subscription purchased on any platform is recognized on all platforms
- Use backend subscription verification API
- Handle edge cases: family sharing, promo codes, educator discounts

---

## Analytics Events for Paywall

| Event                    | Properties                      | Purpose                      |
| ------------------------ | ------------------------------- | ---------------------------- |
| `paywall_impression`     | trigger, feature, plan_shown    | Measure paywall reach        |
| `paywall_dismissed`      | trigger, feature, time_viewed   | Measure rejection rate       |
| `trial_started`          | plan, trigger, source           | Trial conversion measurement |
| `trial_feature_used`     | feature, day_of_trial           | Trial engagement tracking    |
| `trial_expired`          | features_used_count, plan_shown | Expiration funnel            |
| `subscription_started`   | plan, price, source             | Revenue attribution          |
| `subscription_cancelled` | plan, tenure_days, reason       | Churn analysis               |
| `subscription_renewed`   | plan, price, tenure_months      | Retention measurement        |

---

## Anti-Pattern Checklist

Before any paywall design is shipped, verify it passes ALL of these checks:

- [ ] No countdown timers or urgency indicators
- [ ] No "limited time offer" language
- [ ] No red/orange urgency colors on CTA buttons
- [ ] No artificial scarcity ("Only X spots remaining")
- [ ] No guilt-based copy ("Don't miss out", "You're leaving money on the table")
- [ ] Dismiss button is equally visible and accessible as CTA
- [ ] Free tier is never called "basic," "limited," "starter," or "lite"
- [ ] No confusing toggle/checkbox patterns for auto-renewal
- [ ] Price is visible without scrolling on all screen sizes
- [ ] Cancellation flow has no more than 1 confirmation step
- [ ] No "reasons for leaving" survey blocks the cancellation
- [ ] Trial terms are at the top, not buried
- [ ] Both subscription and dismiss buttons are ADA/WCAG accessible

---

## Acceptance Criteria Summary

- [ ] Paywall designs specified for all 4 platforms following native design patterns
- [ ] Feature comparison table is honest and uses specific quantities (not vague claims)
- [ ] Upgrade prompts pass the "would I be annoyed by this?" test
- [ ] Free trial terms are plain-language and visible without scrolling
- [ ] Subscription management allows easy cancellation (1 confirmation max)
- [ ] No manipulative design patterns used anywhere in the flow
- [ ] Designs reviewed against Product Identity non-judgmental principles
- [ ] Analytics events specified for every paywall interaction
- [ ] Cross-platform subscription recognition flow defined
- [ ] Anti-pattern checklist passed for every paywall screen
- [ ] 30-day cooldown enforced per paywall trigger after dismissal
- [ ] Maximum 1 paywall impression per user per day enforced

---

## Dependencies

| Dependency                 | Issue     | Status  | Impact                                         |
| -------------------------- | --------- | ------- | ---------------------------------------------- |
| Freemium tier gating       | #337      | Open    | Tier definitions must be finalized             |
| Premium IAP implementation | #338      | Open    | Platform agents implement this design          |
| Analytics instrumentation  | #764      | Open    | Paywall analytics require event infrastructure |
| Brand voice guide          | Marketing | Planned | Tone consistency for all paywall copy          |
