# Premium Tier UX Design — Finance

> **Status:** PROPOSED — Pending human review
> **Issue:** #793
> **Priority:** P2
> **Last Updated:** 2025-07-15
> **Platforms:** Web (React/PWA) · iOS (SwiftUI) · Android (Compose) · Windows (WinUI/XAML)

---

## Table of Contents

1. [Overview](#overview)
2. [Design Principles](#design-principles)
3. [Free vs Premium Feature Matrix](#free-vs-premium-feature-matrix)
4. [Paywall Design](#paywall-design)
5. [Upgrade Flow](#upgrade-flow)
6. [Premium Feature Discovery](#premium-feature-discovery)
7. [Token Bindings](#token-bindings)
8. [Accessibility Contract](#accessibility-contract)
9. [Wireframes](#wireframes)
10. [Platform Implementation Notes](#platform-implementation-notes)

---

## Overview

Finance offers a premium tier to sustain development while keeping the core app
free and fully functional. The premium tier follows our **non-judgmental**
design philosophy — it enhances the experience without degrading the free tier.

### Core Commitment

> The free tier of Finance is a complete, usable financial tracking app.
> Premium adds convenience, depth, and delight — never gates essential
> functionality behind payment.

This means:

- ✅ All accounts, transactions, budgets, and basic charts are free
- ✅ Offline-first architecture works identically for free and premium
- ✅ Privacy and encryption are never pay-gated
- ❌ We never degrade the free experience to push upgrades
- ❌ We never use dark patterns, countdown timers, or urgency tactics
- ❌ We never show full-screen interstitials that block app usage

---

## Design Principles

### 1. Transparent Value

Show exactly what premium includes before asking for payment. No hidden fees,
no "unlock to see" content.

### 2. Non-Manipulative

No artificial urgency (countdown timers), social proof pressure ("10,000 users
upgraded!"), or loss framing ("You're missing out!"). Present facts about
features.

### 3. Easy Exit

Cancellation must be as easy as subscription. No retention dark patterns.
Show a simple confirmation with clear end-of-billing-cycle date.

### 4. Graceful Degradation

When premium expires, data is never lost. Premium charts revert to basic views.
Exported data remains accessible. Synced devices continue to work with
free-tier sync limits.

### 5. Respects Cognitive Mode

All premium UI works with cognitive accessibility mode — larger targets,
simplified layouts, no animations, clear language.

---

## Free vs Premium Feature Matrix

```
┌─────────────────────────────────────────────────────────────────────┐
│                    FEATURE COMPARISON                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  CORE (FREE)                          PREMIUM                      │
│  ─────────────                        ───────                       │
│  ✓ Unlimited accounts                 ✓ Everything in Free         │
│  ✓ Unlimited transactions             ✓ Advanced charts & trends   │
│  ✓ Basic budgets (5 categories)       ✓ Unlimited budget categories│
│  ✓ Basic charts (bar, donut)          ✓ Multi-account analytics    │
│  ✓ Manual categorization              ✓ Smart auto-categorization  │
│  ✓ Single-device use                  ✓ Multi-device sync          │
│  ✓ CSV export                         ✓ PDF/Excel export           │
│  ✓ Light & dark themes                ✓ OLED dark + custom themes  │
│  ✓ Privacy & encryption               ✓ Priority support           │
│  ✓ Cognitive accessibility            ✓ Goal tracking (unlimited)  │
│                                       ✓ Recurring transactions     │
│                                       ✓ Bill reminders             │
│                                       ✓ Year-in-review report      │
│                                                                     │
│  FREE: $0 forever                     INDIVIDUAL: $4.99/month or   │
│                                                   $39.99/year      │
│                                       FAMILY: $7.99/month or       │
│                                                $63.99/year         │
│                                       ENTERPRISE: $14.99/month     │
│                                       (14-day free trial)          │
└─────────────────────────────────────────────────────────────────────┘
```

### Feature Detail Table

| Feature                    | Free      | Premium   | Gate Type         |
| -------------------------- | --------- | --------- | ----------------- |
| Accounts                   | Unlimited | Unlimited | None              |
| Transactions               | Unlimited | Unlimited | None              |
| Budget categories          | 5         | Unlimited | Soft (upsell)     |
| Charts: Bar, Donut         | ✅        | ✅        | None              |
| Charts: Line, Trend, Multi | —         | ✅        | Feature gate      |
| Auto-categorization        | —         | ✅        | Feature gate      |
| Multi-device sync          | —         | ✅        | Feature gate      |
| CSV export                 | ✅        | ✅        | None              |
| PDF/Excel export           | —         | ✅        | Feature gate      |
| OLED dark theme            | —         | ✅        | Feature gate      |
| Custom themes              | —         | ✅        | Feature gate      |
| Goal tracking              | 1 goal    | Unlimited | Soft (upsell)     |
| Recurring transactions     | —         | ✅        | Feature gate      |
| Bill reminders             | —         | ✅        | Feature gate      |
| Year-in-review             | —         | ✅        | Feature gate      |
| Privacy & encryption       | ✅        | ✅        | None (NEVER gate) |
| Cognitive accessibility    | ✅        | ✅        | None (NEVER gate) |

### Pricing Tiers

| Tier           | Monthly   | Annual    | Savings | Target Audience                     |
| -------------- | --------- | --------- | ------- | ----------------------------------- |
| **Individual** | $4.99/mo  | $39.99/yr | 33%     | Single user, all features           |
| **Family**     | $7.99/mo  | $63.99/yr | 33%     | Household sharing (up to 5 members) |
| **Enterprise** | $14.99/mo | —         | —       | Teams and organizations             |

All tiers include a **14-day free trial** with no charge until the trial ends.

---

## Paywall Design

### Paywall Screen Layout

The paywall appears when a user taps a premium-gated feature. It is **never**
shown as a blocking interstitial.

```
┌─────────────────────────────────────────────────────────┐
│  ← Back                                                 │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │            [Feature Preview Image]               │    │
│  │         (blurred chart / feature mockup)          │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  Unlock [Feature Name]                                  │
│  ─────────────────────                                  │
│                                                         │
│  [Feature description in plain language - 1-2 lines]    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  What's included in Premium:                      │    │
│  │                                                   │    │
│  │  ✓  Advanced charts & spending trends             │    │
│  │  ✓  Unlimited budget categories                   │    │
│  │  ✓  Multi-device sync                             │    │
│  │  ✓  Smart auto-categorization                     │    │
│  │  ✓  PDF & Excel export                            │    │
│  │  ✓  [3 more features...]                          │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  ○  Monthly    $4.99/month                       │    │
│  │  ●  Yearly     $39.99/year  (Save 33%)           │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │       [ Start 14-Day Free Trial ]                 │    │
│  │         (primary button, full-width)               │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  14-day free trial · Cancel anytime                     │
│  No charge until trial ends                             │
│                                                         │
│  [Restore Purchase]    [Terms]    [Privacy]             │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Paywall Component Spec

| Element         | Token Binding                               | Notes                           |
| --------------- | ------------------------------------------- | ------------------------------- |
| Back button     | `navigation.*`                              | Always present, never hidden    |
| Feature preview | `card.*` + `borderRadius.xl`                | Blurred preview, decorative     |
| Heading         | `typeScale.headline`                        | "Unlock [Feature Name]"         |
| Description     | `typeScale.body`                            | Plain language, 1-2 lines max   |
| Feature list    | `typeScale.label` + `status.positive`       | ✓ checkmarks use semantic green |
| Price selector  | `card.*` + `input.*` (radio)                | Clear active state              |
| CTA button      | `button.primary.*`                          | Full-width, prominent           |
| Fine print      | `typeScale.caption` + `text.secondary`      | Trial terms, cancel policy      |
| Utility links   | `typeScale.caption` + `interactive.default` | Restore, Terms, Privacy         |

### Language Guidelines

| Instead of                         | Use                                          |
| ---------------------------------- | -------------------------------------------- |
| "Upgrade NOW!"                     | "Start free trial"                           |
| "Don't miss out!"                  | "See what Premium includes"                  |
| "Only $4.99/month!"                | "$4.99/month" (state the fact)               |
| "Limited time offer"               | _(Don't use artificial urgency)_             |
| "10,000 users love Premium"        | _(Don't use social proof pressure)_          |
| "You're missing advanced features" | "Advanced charts are available with Premium" |
| "Unlock the full experience"       | "Unlock advanced charts"                     |

---

## Upgrade Flow

### Flow Diagram

```
┌──────────────┐     ┌───────────────┐     ┌──────────────────┐
│ User taps    │     │  Paywall      │     │  Platform IAP    │
│ premium      │────▶│  screen       │────▶│  confirmation    │
│ feature      │     │  (feature     │     │  (Apple/Google/  │
│              │     │   context)    │     │   Microsoft)     │
└──────────────┘     └───────────────┘     └──────────────────┘
                           │                        │
                           │ "Not now"              │ Success
                           ▼                        ▼
                     ┌───────────────┐     ┌──────────────────┐
                     │ Return to     │     │  Success state   │
                     │ previous      │     │  "Welcome to     │
                     │ screen        │     │   Premium!"      │
                     │ (no penalty)  │     │  Feature unlocks │
                     └───────────────┘     │  immediately     │
                                           └──────────────────┘
```

### Step-by-Step

1. **Trigger:** User taps a premium-gated feature (e.g., "Spending Trends" chart)
2. **Context:** Paywall shows with the specific feature as the hero
3. **Pricing:** User selects monthly or yearly plan
4. **CTA:** "Start 14-Day Free Trial" button
5. **IAP:** Native platform purchase sheet appears (StoreKit / Google Play Billing / Microsoft Store)
6. **Success:** Celebration animation + feature unlocks immediately
7. **Decline:** User taps "Back" — returns to previous screen with no penalty
8. **Restore:** "Restore Purchase" link for users who previously subscribed

### Success State

```
┌─────────────────────────────────────────────────────────┐
│                                                         │
│              ✨ Welcome to Premium! ✨                  │
│                                                         │
│  You now have access to:                                │
│                                                         │
│  ✓  Advanced charts & trends                            │
│  ✓  Unlimited budgets                                   │
│  ✓  Multi-device sync                                   │
│  ✓  ...and more                                         │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │       [ Explore Premium Features ]               │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  Your trial ends [date]. You won't be charged           │
│  until then. Cancel anytime in Settings.                │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Cancellation Flow

```
Settings → Subscription → Manage Subscription

┌─────────────────────────────────────────────────────────┐
│  ← Back          Subscription                           │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  Finance Premium                                  │    │
│  │  Yearly · $39.99/year                             │    │
│  │  Next billing: [date]                             │    │
│  │                                                   │    │
│  │  [ Manage in [Platform] Settings ]                │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
│  If you cancel:                                         │
│  • Premium features remain active until [date]          │
│  • Your data is never deleted                           │
│  • You can re-subscribe anytime                         │
│  • Budgets revert to 5-category limit                   │
│  • Advanced charts revert to basic views                │
│                                                         │
│  ─────────────────────────────────────────               │
│                                                         │
│  ⓘ  Cancellation is handled through your device's      │
│     app store. Tap above to manage.                     │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Premium Feature Discovery

### In-App Discovery Points

Premium features are discoverable at the point of use — never through
interstitial pop-ups or banner ads.

| Discovery Point         | Trigger                       | UI Pattern                      |
| ----------------------- | ----------------------------- | ------------------------------- |
| Budget category limit   | User creates 6th category     | Inline upsell below list        |
| Advanced chart          | User navigates to trends tab  | Blurred preview + CTA           |
| Multi-device sync       | User enables sync in settings | Feature gate explanation        |
| Auto-categorization     | Manual categorization screen  | "Auto-categorize" chip (locked) |
| PDF/Excel export        | Export menu                   | Disabled option with lock icon  |
| Settings → Subscription | User opens settings           | Always visible, factual         |

### Inline Upsell Pattern

When a user hits a soft gate (e.g., 5-category budget limit):

```
┌─────────────────────────────────────────────────────────┐
│  Your budgets                                           │
│                                                         │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐                   │
│  │  Food   │ │Transport│ │  Rent   │                   │
│  │  $450   │ │  $200   │ │ $1,200  │                   │
│  └─────────┘ └─────────┘ └─────────┘                   │
│  ┌─────────┐ ┌─────────┐                                │
│  │  Utils  │ │  Fun    │                                │
│  │  $150   │ │  $200   │                                │
│  └─────────┘ └─────────┘                                │
│                                                         │
│  ┌─────────────────────────────────────────────────┐    │
│  │  ⓘ  You've used all 5 free budget categories.   │    │
│  │     Premium includes unlimited categories.       │    │
│  │                                                   │    │
│  │     [ Learn about Premium ]                       │    │
│  └─────────────────────────────────────────────────┘    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Rules for inline upsells:**

- Appear at most **once per session** for the same feature
- Always include a **dismiss** action (X or "Not now")
- Never block the user from completing their current task
- Use `typeScale.label` for the message, `button.secondary` for the CTA
- Persist dismissal for 7 days before showing again

---

## Token Bindings

### Premium Component Tokens

Premium tokens are defined in `packages/design-tokens/tokens/component/premium.json`.
See [token-preview.md](./token-preview.md) for the full token inventory.

| Token Path                    | Value                             | Purpose                  |
| ----------------------------- | --------------------------------- | ------------------------ |
| `premium.badge.background`    | `{semantic.interactive.default}`  | Premium badge background |
| `premium.badge.text`          | `{semantic.text.inverse}`         | Premium badge text       |
| `premium.badge.borderRadius`  | `{borderRadius.full}`             | Pill-shaped badge        |
| `premium.gate.overlayOpacity` | `0.6`                             | Blurred preview overlay  |
| `premium.gate.iconColor`      | `{semantic.text.disabled}`        | Lock icon color          |
| `premium.upsell.background`   | `{semantic.background.secondary}` | Inline upsell background |
| `premium.upsell.border`       | `{semantic.border.default}`       | Inline upsell border     |
| `premium.upsell.borderRadius` | `{borderRadius.lg}`               | Inline upsell rounding   |

### Existing Token Usage

| UI Element         | Token                                    | Notes                        |
| ------------------ | ---------------------------------------- | ---------------------------- |
| Paywall heading    | `typeScale.headline.*`                   | Standard heading             |
| Feature list check | `semantic.status.positive`               | Green checkmark              |
| Price text         | `typeScale.title.*`                      | Prominent price display      |
| CTA button         | `button.primary.*`                       | Standard primary button      |
| Fine print         | `typeScale.caption.*` + `text.secondary` | Muted trial terms            |
| Card containers    | `card.*`                                 | Feature list, price selector |

---

## Accessibility Contract

### Paywall Screen

| Requirement     | Implementation                                             |
| --------------- | ---------------------------------------------------------- |
| Screen title    | `aria-label="Unlock [Feature Name]"` on page               |
| Feature list    | `role="list"` with `role="listitem"` per feature           |
| Price selector  | `role="radiogroup"` with `role="radio"` per option         |
| Selected price  | `aria-checked="true"` on selected option                   |
| CTA button      | `aria-label="Start 14-day free trial for $4.99 per month"` |
| Trial terms     | Readable text, not image                                   |
| Blurred preview | `aria-hidden="true"` (decorative)                          |
| Back button     | `aria-label="Go back"` — always keyboard accessible        |

### Premium Badge

| Requirement | Implementation                                                            |
| ----------- | ------------------------------------------------------------------------- |
| Badge role  | `role="status"` or decorative `aria-hidden="true"`                        |
| Badge text  | "Premium" or "PRO" — readable by screen readers                           |
| Lock icon   | `aria-label="Premium feature"` or `aria-hidden="true"` with adjacent text |

### Cognitive Mode

| Requirement    | Implementation                                 |
| -------------- | ---------------------------------------------- |
| Feature list   | Max 5 items visible, "See all" to expand       |
| Price selector | Larger radio buttons (48px min target)         |
| CTA button     | 48px min height, 24px padding                  |
| Language       | Plain language, no jargon                      |
| Animation      | Success celebration disabled in cognitive mode |

---

## Wireframes

### Mobile Paywall (Portrait)

```
┌──────────────────────────┐
│ ← Back                   │
│                          │
│ ┌──────────────────────┐ │
│ │                      │ │
│ │  [Blurred Chart      │ │
│ │   Preview]           │ │
│ │                      │ │
│ └──────────────────────┘ │
│                          │
│ Unlock Spending          │
│ Trends                   │
│                          │
│ See how your spending    │
│ changes over time with   │
│ interactive line charts. │
│                          │
│ ┌──────────────────────┐ │
│ │ What's in Premium:   │ │
│ │ ✓ Advanced charts    │ │
│ │ ✓ Unlimited budgets  │ │
│ │ ✓ Multi-device sync  │ │
│ │ ✓ Auto-categorize    │ │
│ │ ✓ PDF/Excel export   │ │
│ └──────────────────────┘ │
│                          │
│ ○ Monthly  $4.99/mo     │
│ ● Yearly   $39.99/yr    │
│            Save 33%      │
│                          │
│ ┌──────────────────────┐ │
│ │  Start Free Trial    │ │
│ └──────────────────────┘ │
│                          │
│ 14-day trial · Cancel    │
│ anytime · No charge      │
│ until [date]             │
│                          │
│ Restore · Terms · Privacy│
└──────────────────────────┘
```

### Tablet/Desktop Paywall (Side-by-Side)

```
┌────────────────────────────────────────────────────────────────────┐
│ ← Back                                                             │
│                                                                    │
│ ┌──────────────────────────────┐ ┌───────────────────────────────┐ │
│ │                              │ │                               │ │
│ │                              │ │  Unlock Spending Trends       │ │
│ │                              │ │                               │ │
│ │   [Blurred Chart Preview]    │ │  See how your spending        │ │
│ │                              │ │  changes over time.           │ │
│ │                              │ │                               │ │
│ │                              │ │  What's in Premium:           │ │
│ │                              │ │  ✓ Advanced charts            │ │
│ │                              │ │  ✓ Unlimited budgets          │ │
│ │                              │ │  ✓ Multi-device sync          │ │
│ │                              │ │  ✓ Auto-categorize            │ │
│ │                              │ │  ✓ PDF/Excel export           │ │
│ │                              │ │                               │ │
│ │                              │ │  ○ Monthly  $4.99/mo          │ │
│ │                              │ │  ● Yearly   $39.99/yr        │ │
│ │                              │ │                               │ │
│ │                              │ │  ┌───────────────────────┐    │ │
│ │                              │ │  │  Start Free Trial     │    │ │
│ │                              │ │  └───────────────────────┘    │ │
│ │                              │ │                               │ │
│ │                              │ │  14-day trial · Cancel        │ │
│ │                              │ │  anytime                      │ │
│ └──────────────────────────────┘ └───────────────────────────────┘ │
│                                                                    │
│                    Restore · Terms · Privacy                       │
└────────────────────────────────────────────────────────────────────┘
```

---

## Platform Implementation Notes

### iOS (StoreKit 2)

- Use `StoreKit.Product` for subscription products
- Present native payment sheet via `product.purchase()`
- Verify receipt via `Transaction.currentEntitlements`
- Premium badge uses SF Symbol `crown.fill`
- Lock icon uses SF Symbol `lock.fill`

### Android (Google Play Billing)

- Use `BillingClient` with `ProductType.SUBS`
- Present Google Play purchase flow
- Verify via `Purchase.PurchaseState.PURCHASED`
- Premium badge uses Material Icon `workspace_premium`
- Lock icon uses Material Icon `lock`

### Web (Stripe / Custom)

- Present custom checkout (Stripe Elements or similar)
- Server-side subscription validation
- Premium badge uses custom SVG crown icon
- Lock icon uses Lucide `lock` icon

### Windows (Microsoft Store)

- Use `Windows.Services.Store.StoreContext`
- Present Microsoft Store purchase dialog
- Verify via `StoreProduct.IsInUserCollection`
- Premium badge uses Fluent Icon `Premium`
- Lock icon uses Fluent Icon `LockClosed`

### Cross-Platform Sync

- Premium status syncs via user profile
- Device A purchases → backend marks user as premium → Device B unlocks
- Grace period: 3 days after expiry for sync resolution
- Offline grace: Premium features continue offline even if renewal can't be verified for up to 7 days
