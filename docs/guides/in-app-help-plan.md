# In-App Help Integration Plan

> **Status:** Planning  
> **Purpose:** Define how contextual help, tooltips, FAQ, and documentation integrate into the Finance app experience across all platforms.

---

## Table of Contents

- [Goals](#goals)
- [Strategy overview](#strategy-overview)
- [Tooltip system for financial concepts](#tooltip-system-for-financial-concepts)
- [Link structure: app to docs](#link-structure-app-to-docs)
- [FAQ integration](#faq-integration)
- [Contextual help triggers](#contextual-help-triggers)
- [Feedback mechanism](#feedback-mechanism)
- [Implementation guidance](#implementation-guidance)

---

## Goals

1. **No user should feel lost.** Every financial concept in the app should be explainable in context, without leaving the current screen.
2. **Help should match the user's level.** Content adapts to the user's experience tier (🌱 Getting Started, 📊 Comfortable, 🧠 Advanced).
3. **Help should not be intrusive.** Tooltips and guidance appear when invited, never forced.
4. **External docs are a fallback, not the primary path.** The app should answer 90% of questions in context. External documentation handles the remaining 10% (deep dives, legal details, troubleshooting edge cases).

---

## Strategy overview

In-app help operates in three layers:

```
Layer 1: Contextual tooltips (inline, on-screen)
   ↓ need more?
Layer 2: Help panel / bottom sheet (in-app, deeper explanation)
   ↓ need more?
Layer 3: External documentation (docs site, linked from app)
```

### Layer 1 — Contextual tooltips

Small info icons (ℹ️) next to financial terms and concepts. Tapping opens a brief, plain-language tooltip.

**Examples:**

- Next to "Net Worth": _"Your net worth is everything you own minus everything you owe. It's the big-picture number that shows your overall financial health."_
- Next to "Rollover": _"When rollover is on, any money you didn't spend this month carries forward to next month."_
- Next to "Savings Rate": _"Your savings rate is the percentage of your income that you keep. A higher number means you're saving more."_

### Layer 2 — Help panel

A slide-up panel or bottom sheet with a fuller explanation, examples, and a "Learn more" link to external docs. Triggered by:

- Tapping "Learn more" on a tooltip
- Tapping a "?" icon in the section header
- The help entry in the navigation/settings menu

### Layer 3 — External documentation

Links to the hosted documentation site (or in-app WebView) for:

- Complete feature guides
- Privacy and security details
- FAQ and troubleshooting
- Legal documents (privacy policy, terms of service)

---

## Tooltip system for financial concepts

### Content structure

Each tooltip has a consistent structure:

```
┌─────────────────────────────────────┐
│ [Term]                              │
│                                     │
│ [Plain-language definition]         │
│ [One-sentence "why it matters"]     │
│                                     │
│ [Learn more →]  (optional link)     │
└─────────────────────────────────────┘
```

### Content by experience tier

Tooltips adapt to the user's selected experience level:

| Concept          | 🌱 Getting Started                             | 📊 Comfortable                                                  | 🧠 Advanced                                                                                   |
| ---------------- | ---------------------------------------------- | --------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **Net Worth**    | "Everything you own minus everything you owe." | "Total assets minus total liabilities."                         | "Sum of asset account balances less liability account balances, excluding archived accounts." |
| **Savings Rate** | "How much of your income you keep."            | "Percentage of income not spent."                               | "Net savings ÷ gross income × 100, calculated per period."                                    |
| **Rollover**     | "Unspent budget money carries to next month."  | "Positive or negative balance rolls to the next budget period." | "Residual allocation propagated to the subsequent period as a signed carryforward."           |

### Tooltip inventory (initial set)

Financial concepts that need tooltips at launch:

| Screen       | Concept                           | Tooltip needed |
| ------------ | --------------------------------- | -------------- |
| Accounts     | Net worth                         | ✅             |
| Accounts     | Assets vs. liabilities            | ✅             |
| Transactions | Split transaction                 | ✅             |
| Transactions | Transfer vs. transaction          | ✅             |
| Transactions | Recurring transaction             | ✅             |
| Budget       | Envelope budgeting                | ✅             |
| Budget       | To Budget (remaining)             | ✅             |
| Budget       | Rollover                          | ✅             |
| Budget       | Cover overspending                | ✅             |
| Goals        | Target amount                     | ✅             |
| Goals        | Monthly contribution              | ✅             |
| Goals        | Projected completion              | ✅             |
| Reports      | Spending breakdown                | ✅             |
| Reports      | Savings rate                      | ✅             |
| Reports      | Spending trend                    | ✅             |
| Reports      | Income vs. expenses               | ✅             |
| Settings     | Biometric lock                    | ✅             |
| Settings     | Data export                       | ✅             |
| Settings     | Crypto-shredding (in delete flow) | ✅             |
| Sync         | End-to-end encryption             | ✅             |
| Sync         | Conflict resolution               | ✅             |

### Implementation notes

- Tooltips are stored as structured data (JSON or resource files) so they can be:
  - Updated without app releases (via sync or remote config)
  - Localized for different languages
  - A/B tested for clarity
- Each tooltip has an ID, concept key, and tier-specific content
- The tooltip component is shared across platforms via the KMP design system

---

## Link structure: app to docs

### URL scheme

All in-app links to external documentation follow a consistent pattern:

```
https://docs.finance.example.com/guides/{page}#{section}
```

**Examples:**

- `https://docs.finance.example.com/guides/features#budgets`
- `https://docs.finance.example.com/guides/faq#sync-isnt-working`
- `https://docs.finance.example.com/guides/privacy-security#your-rights`

### Link mapping

| In-app location                      | Link target                                           |
| ------------------------------------ | ----------------------------------------------------- |
| Settings → Help → Getting Started    | `guides/getting-started`                              |
| Settings → Help → Feature Guide      | `guides/features`                                     |
| Settings → Help → FAQ                | `guides/faq`                                          |
| Settings → Help → Privacy & Security | `guides/privacy-security`                             |
| Settings → Help → Accessibility      | `guides/accessibility`                                |
| Tooltip "Learn more" → Budgets       | `guides/features#budgets`                             |
| Tooltip "Learn more" → Goals         | `guides/features#goals`                               |
| Tooltip "Learn more" → Sync          | `guides/getting-started#syncing-across-devices`       |
| Delete account confirmation          | `guides/privacy-security#how-to-exercise-your-rights` |
| Privacy policy link                  | `legal/privacy-policy`                                |

### Opening behavior

- **iOS**: Opens in `SFSafariViewController` (in-app browser) — user stays in the app context
- **Android**: Opens in a Custom Tab (Chrome Custom Tab) — stays in the app context
- **Windows**: Opens in the system default browser
- **Web**: Opens in a new tab (or same-origin navigation for internal docs)

---

## FAQ integration

### In-app FAQ screen

A searchable FAQ screen accessible from **Settings → Help → FAQ** that:

1. Displays the most common questions from [`docs/guides/faq.md`](./faq.md)
2. Lets users search by keyword
3. Groups questions by category (General, Privacy, Sync, Billing, Troubleshooting)
4. Links to the full web FAQ for the complete list

### Contextual FAQ suggestions

Certain screens surface relevant FAQ items proactively:

| Screen / State                | Suggested FAQ                                             |
| ----------------------------- | --------------------------------------------------------- |
| Sync settings (first visit)   | "How does sync work?"                                     |
| Sync error state              | "Sync isn't working — what should I do?"                  |
| Export screen                 | "How do I export my data?"                                |
| Delete account screen         | "How do I delete my account?"                             |
| Offline state (badge visible) | "What happens when I'm offline?"                          |
| Premium feature (locked)      | "Is there a free version?" / "What does premium include?" |
| Login screen                  | "I forgot my password"                                    |

### FAQ content management

- FAQ content is authored in `docs/guides/faq.md` (the single source of truth)
- A subset is bundled into the app for offline access
- The full FAQ is available online via the docs site
- FAQ entries have unique IDs for deep linking (e.g., `faq#sync-isnt-working`)

---

## Contextual help triggers

### When help appears

Help is offered — never forced — at specific moments:

| Trigger                          | Help type              | Content                                                             |
| -------------------------------- | ---------------------- | ------------------------------------------------------------------- |
| First time viewing budget screen | Coach mark / spotlight | "This is your budget. Each category is like an envelope of money."  |
| First time using quick entry     | Guided highlight       | "Tap +, enter amount, pick category. That's it!"                    |
| Overspent a budget category      | Non-judgmental nudge   | "You've used 110% of Food. You can cover it from another category." |
| Goal milestone reached           | Celebration + tip      | "🎉 50% of your goal! At this pace, you'll reach it by [date]."     |
| First time in settings           | Task card              | "Tip: Set up biometric lock to keep your finances private."         |
| After 7 days of use              | Achievement card       | "You've tracked for a week! Here's your first weekly summary."      |

### Dismissal behavior

- All coach marks and tips can be dismissed with a single tap
- Dismissed tips don't reappear
- A "Show tips" toggle in Settings re-enables them
- Tips that have been dismissed are stored locally (per device)

### Onboarding task cards

After onboarding, gentle task cards appear on the dashboard:

- "Add your first account" (if none exist)
- "Set a spending plan" (if no budget exists)
- "Try the quick-entry button"
- "Complete your setup (3/6 done)"

Cards are:

- Non-nagging (appear once, can be dismissed permanently)
- Progress-tracked (show completion state)
- Experience-tier-aware (🌱 users see more guidance)

---

## Feedback mechanism

### In-app feedback flow

Users can provide feedback from any screen:

1. **Settings → Help → Send Feedback** — general feedback form
2. **Settings → Help → Report a Bug** — structured bug report
3. **Settings → Help → Feature Request** — structured feature request
4. **Tooltip → "Was this helpful?"** — quick yes/no on tooltips

### Bug report structure

The bug report form collects:

| Field                        | Required    | Contains personal data?    |
| ---------------------------- | ----------- | -------------------------- |
| Description of the problem   | Yes         | Potentially (user-written) |
| Steps to reproduce           | No          | No                         |
| Expected vs. actual behavior | No          | No                         |
| App version                  | Auto-filled | No                         |
| Platform and OS version      | Auto-filled | No                         |
| Experience tier              | Auto-filled | No                         |
| Screenshot (opt-in)          | No          | Potentially                |

**What is NOT collected:**

- ❌ Financial data (accounts, transactions, balances)
- ❌ Personal identifiers (email, name) unless the user provides them for follow-up
- ❌ Device identifiers or advertising IDs
- ❌ Location data

### Tooltip feedback loop

Each tooltip has an optional "Was this helpful?" prompt:

```
┌─────────────────────────────────────┐
│ Net Worth                           │
│                                     │
│ Everything you own minus everything │
│ you owe.                            │
│                                     │
│ Was this helpful?  👍  👎           │
│ [Learn more →]                      │
└─────────────────────────────────────┘
```

Feedback is aggregated anonymously to identify tooltips that need improvement. No personal data is attached to tooltip feedback.

---

## Implementation guidance

### Priority order

1. **Phase 1** (launch): Tooltip system with initial 20 concepts, Settings → Help links, in-app FAQ screen
2. **Phase 2** (v1.1): Contextual FAQ suggestions, onboarding task cards, coach marks
3. **Phase 3** (v1.2): Feedback mechanism, tooltip feedback loop, remote tooltip content updates

### Technical architecture

```
┌──────────────────────────────────────────────┐
│  KMP Shared Layer                            │
│  ┌──────────────────────────────────────┐    │
│  │  HelpContentProvider                  │    │
│  │  - getTooltip(conceptId, tier) → Tip  │    │
│  │  - getFAQItems(category) → List<FAQ>  │    │
│  │  - getDocLink(topic) → URL            │    │
│  └──────────────────────────────────────┘    │
│                                              │
│  ┌──────────────────────────────────────┐    │
│  │  Tooltip Content (JSON resources)     │    │
│  │  - Tiered content per concept         │    │
│  │  - Localizable strings                │    │
│  └──────────────────────────────────────┘    │
└──────────────────────────────────────────────┘
         │
         │ expect/actual
         ▼
┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
│ iOS Tooltip  │ │ Android      │ │ Web Tooltip  │ │ Windows      │
│ Component    │ │ Tooltip      │ │ Component    │ │ Tooltip      │
│ (SwiftUI)    │ │ (Compose)    │ │ (React)      │ │ (Compose)    │
└──────────────┘ └──────────────┘ └──────────────┘ └──────────────┘
```

### Content guidelines

All help content should follow the product voice:

- **Non-judgmental**: Never make the user feel bad about not knowing something
- **Plain language**: Explain like a knowledgeable friend, not a textbook
- **Actionable**: Tell users what they can do, not just what something is
- **Brief**: Tooltips are 1–2 sentences. Help panels are 2–3 paragraphs max.
- **Tier-appropriate**: Language matches the user's chosen experience level

### Metrics to track

| Metric                             | What it tells us                       |
| ---------------------------------- | -------------------------------------- |
| Tooltip open rate (per concept)    | Which concepts need more explanation   |
| Tooltip "not helpful" rate         | Which explanations need rewriting      |
| FAQ search queries with no results | What topics are missing from FAQ       |
| Help link tap-through rate         | Whether users need deeper content      |
| Coach mark dismissal rate          | Whether guidance is useful or annoying |
| Time to dismiss onboarding cards   | Whether cards are valuable or ignored  |

All metrics are privacy-safe (aggregated counts, no personal data) and only collected if the user has opted in to analytics.

---

_This plan aligns with Finance's product identity: educational without condescension, helpful without being pushy, and respectful of the user's time and autonomy._

_Related documentation: [Feature Guide](./features.md) · [FAQ](./faq.md) · [Product Identity](../design/product-identity.md)_
