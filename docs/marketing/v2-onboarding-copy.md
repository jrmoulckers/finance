# v2.0 Onboarding Flow Copy — New Features

> **Issue:** [#1149](https://github.com/jrmoulckers/finance/issues/1149)
> **Status:** PROPOSED — Pending human review
> **Sprint:** v2.0 Launch Campaign
> **Last Updated:** 2025-07-31
> **Author:** Marketing Strategist (AI agent)
> **Related:** [Onboarding Messaging Audit](onboarding-messaging-audit.md) · [Brand Voice Guide](brand-voice-guide.md) · [V2 Feature Specs](../business/v2-feature-specifications.md) · [UX Principles](../design/ux-principles.md)

---

## Table of Contents

1. [Onboarding Strategy for v2.0](#1-onboarding-strategy-for-v20)
2. [New User Onboarding — v2.0 Welcome](#2-new-user-onboarding--v20-welcome)
3. [Existing User Onboarding — What's New](#3-existing-user-onboarding--whats-new)
4. [Feature-Specific First-Use Copy](#4-feature-specific-first-use-copy)
5. [Empty State Copy — New Features](#5-empty-state-copy--new-features)
6. [Tooltip & Contextual Help Copy](#6-tooltip--contextual-help-copy)
7. [Premium Upgrade Touchpoints](#7-premium-upgrade-touchpoints)
8. [Accessibility Considerations](#8-accessibility-considerations)

---

## 1. Onboarding Strategy for v2.0

### Principles

1. **Don't overwhelm.** v2.0 adds 5 features. Don't show them all at once. Introduce progressively.
2. **Respect existing habits.** Returning users have workflows. Don't disrupt them — enhance them.
3. **Let users discover.** Not every user needs every feature. Surface features when they're relevant.
4. **Free features first.** Lead with what everyone gets (widgets, basic health score). Mention premium naturally.
5. **Adapt to expertise level.** Getting Started users see simpler explanations than Advanced users.

### Onboarding Paths

| User Type                        | Path                                                     | Key Moments                                                    |
| -------------------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| New user (v2.0 first install)    | Standard onboarding + v2.0 features integrated naturally | Welcome → accounts → first transaction → health score teaser   |
| Existing user (updating to v2.0) | "What's New" modal + progressive feature discovery       | What's New → health score on dashboard → widget prompt (day 2) |
| Beta user (transitioning)        | Feature tour (see v2-beta-transition.md § 6)             | Quick tour → new features highlighted in-context               |

### Progressive Disclosure Schedule

| Timing                | Trigger                 | Feature Surfaced                                |
| --------------------- | ----------------------- | ----------------------------------------------- |
| First launch (v2.0)   | App update              | "What's New" summary (3 screens max)            |
| Day 1                 | Dashboard view          | Health Score card appears on dashboard          |
| Day 2                 | App open                | One-time widget suggestion (dismissible)        |
| Day 3–7               | Viewing transactions    | Tooltip: "You can protect sensitive categories" |
| First report view     | Navigating to Reports   | Report builder introduction                     |
| First household setup | Adding household member | Budget negotiation explanation                  |

---

## 2. New User Onboarding — v2.0 Welcome

### Welcome Screen (Updated for v2.0)

**Headline:** See your money clearly.

**Subheadline:** Your finances, your device, your control.

**Body:**

Finance helps you understand where your money goes — privately, offline, and on your terms. All data stays on this device, encrypted.

**Buttons:**

- [Just let me in] — Goes directly to dashboard
- [Personalize my experience] — Starts expertise tier selection

**Privacy line:** All data stays on this device, encrypted with AES-256.

### Expertise Tier Selection (Updated)

**Headline:** How comfortable are you with budgeting?

| Tier            | Label               | Description (v2.0 updated)                                                                                      |
| --------------- | ------------------- | --------------------------------------------------------------------------------------------------------------- |
| Getting Started | "I'm new to this"   | Simple views, guided setup, clear explanations. Your Financial Health Score breaks things down into one number. |
| Comfortable     | "I know the basics" | Full features with helpful context. Custom reports and widgets help you stay on top of things.                  |
| Advanced        | "I'm experienced"   | All features, detailed analytics, full configuration. Report builder, benchmarking, and collaborative budgets.  |

**Footer:** You can change this anytime in Settings.

### First Transaction Prompt (Updated)

**After first transaction is entered:**

> **Nice — you're tracking.**
>
> Keep entering transactions and Finance will start building your Financial Health Score. It takes a few days of data to generate an accurate score.
>
> [Got it]

---

## 3. Existing User Onboarding — What's New

### "What's New" Modal (3 Screens)

**Shown once on first launch after v2.0 update.**

**Screen 1:**

> **Finance v2.0 is here.**
>
> Five new features — all running on your device, all private.
>
> [Show me] [Skip]

**Screen 2:**

> **📊 Financial Health Score**
> See your financial health as one number. Check your dashboard.
>
> **📱 Home Screen Widgets**
> Your finances at a glance — without opening the app.
>
> _These are free for everyone._
>
> [Next]

**Screen 3:**

> **🔒 Biometric Categories** · **📋 Report Builder** · **🤝 Budget Negotiation**
> Protect sensitive spending, build custom reports, and budget collaboratively.
>
> _Available with Premium or Family plan._
>
> [Explore v2.0] [Close]

### Design Notes

- Maximum 3 screens — don't add more
- "Skip" is always available and equally prominent
- No auto-advance — user controls pace
- Screens should feel like a celebration, not a tutorial
- Use the same layout and visual style as v1.0 onboarding

---

## 4. Feature-Specific First-Use Copy

### Financial Health Score — First View

**Trigger:** User opens dashboard for the first time after v2.0 update and has sufficient data.

**Health Score Card (Dashboard):**

> **Your Financial Health Score: {{score}}**
>
> Based on your savings rate, debt ratio, emergency fund, and budget adherence.
>
> [See details] [Dismiss]

**If insufficient data:**

> **Financial Health Score**
>
> We need a bit more data to calculate your score. Keep tracking your income, expenses, and budgets — your score will appear here soon.
>
> [Learn more] [Dismiss]

### Health Score Detail — First View

**Tooltip (one-time):**

> **How your score works**
>
> Four factors, weighted by importance:
> • Savings rate (30%) — income you're saving
> • Debt-to-income (25%) — debt payments vs. income
> • Emergency fund (25%) — months of expenses saved
> • Budget adherence (20%) — budgets you stayed within
>
> Tap any factor to see how to improve it.
>
> [Got it]

### Health Score — Non-Judgmental Language Guide

| Score Range | What We Say                      | What We Never Say                     |
| ----------- | -------------------------------- | ------------------------------------- |
| 80–100      | "Strong financial health"        | "Perfect" / "You're crushing it"      |
| 60–79       | "On track, with room to grow"    | "Almost there" / "Could be better"    |
| 40–59       | "Some areas could use attention" | "Below average" / "Needs improvement" |
| 20–39       | "Opportunity for progress"       | "Poor" / "Failing" / "Bad"            |
| 0–19        | "Every journey starts somewhere" | "Critical" / "Alarming" / "Emergency" |

### Biometric Categories — First Setup

**Trigger:** User navigates to Settings > Categories > taps a category > sees "Biometric Lock" toggle.

**Toggle label:** Require biometric to view

**First-time explanation (shown once):**

> **Protect this category**
>
> Transactions in this category will be blurred until you authenticate with {{biometric_type}}. No one else can see them — even in shared budgets.
>
> Protected transactions show as "[Protected]" in lists and are excluded from charts until you unlock.
>
> [Enable protection] [Not now]

### Widgets — Setup Prompt

**Trigger:** Day 2 of v2.0 usage (not on day 1 — avoid overload).

**Prompt (dismissible, shown once):**

> **📱 Try a Finance widget**
>
> See your balance or budget status on your home screen — without opening the app.
>
> {{platform_specific_instruction}}
>
> [Show me how] [Not now] [Don't show again]

**Platform-specific instructions:**

- **iOS:** "Long-press your home screen > tap + > search for Finance"
- **Android:** "Long-press your home screen > Widgets > Finance"
- **Windows:** "Open Windows Widgets panel > Add widgets > Finance"
- **Web:** "Go to Dashboard > tap the pin icon on any tile"

### Report Builder — First Use

**Trigger:** User navigates to Reports section for the first time.

**If Premium:**

> **Welcome to the Report Builder**
>
> Create custom financial reports by dragging components onto your canvas.
>
> **Try this:** Drag "Spending by Category" and "Budget Progress" to see this month's highlights.
>
> [Start building] [See an example report]

**If Free:**

> **Custom Report Builder**
>
> Build detailed financial reports with drag-and-drop components. Choose your date range, metrics, and chart types. Export as PDF or CSV.
>
> This is a Premium feature.
>
> [Learn about Premium] [Go back]

### Budget Negotiation — First Household Proposal

**Trigger:** User in a shared household navigates to budget negotiation for the first time.

> **Budget Negotiation**
>
> Instead of one person setting budget amounts, everyone in the household can propose and vote on changes.
>
> **How it works:**
>
> 1. Propose a change to any shared budget
> 2. Other members discuss and vote
> 3. Approved changes take effect immediately
>
> [Create first proposal] [Learn more]

---

## 5. Empty State Copy — New Features

### Health Score — No Data Yet

> **Your Financial Health Score will appear here.**
>
> It needs a few things to calculate:
>
> - ✅ At least one account (you have {{account_count}})
> - {{income_status}} Income transactions
> - {{budget_status}} At least one active budget
> - {{goal_status}} A savings goal (optional, but helps)
>
> As you track more, your score gets more accurate.

### Report Builder — No Reports

> **No reports yet.**
>
> Tap "New Report" to build your first custom financial view. Start simple — try a spending breakdown for this month.
>
> [Create first report]

### Widgets — No Widgets Added

> _(This state is shown in the app settings, not on the home screen)_
>
> **Finance widgets available:**
> Balance · Budget Status · Recent Transactions · Spending Summary · Quick Entry
>
> Add them to your home screen for finances at a glance.
>
> [How to add widgets]

### Budget Negotiation — No Proposals

> **No proposals yet.**
>
> Any household member can propose a change to a shared budget. Start a conversation about this month's spending plan.
>
> [Create a proposal]

### Budget Negotiation — Solo User

> **Budget Negotiation is for households.**
>
> Invite a partner or family member to your household to start proposing and voting on budget changes together.
>
> [Invite someone] [Learn more about households]

---

## 6. Tooltip & Contextual Help Copy

### Health Score Tooltips

| Element                 | Tooltip                                                                                                                 |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Score number            | "Your composite financial health score, from 0 (starting out) to 100 (excellent). Recalculates when your data changes." |
| Savings rate factor     | "What percentage of your income you saved this month. Higher is better, but any saving is progress."                    |
| Debt-to-income factor   | "Your monthly debt payments divided by your monthly income. Lower means less of your income goes to debt."              |
| Emergency fund factor   | "How many months of expenses you could cover with savings. A common goal is 3–6 months."                                |
| Budget adherence factor | "How many of your budgets you stayed within this period. Every budget you stick to helps your score."                   |
| Benchmarking (Premium)  | "See where your score falls compared to users in similar situations. Fully anonymous — uses differential privacy."      |

### Biometric Category Tooltips

| Element             | Tooltip                                                                                         |
| ------------------- | ----------------------------------------------------------------------------------------------- |
| Lock toggle         | "When enabled, transactions in this category require {{biometric_type}} to view."               |
| "[Protected]" label | "This transaction is in a biometric-locked category. Tap to authenticate and view."             |
| Blurred amount      | "Amount hidden for privacy. Authenticate to reveal."                                            |
| Session timer       | "Protected data will re-lock after 5 minutes of inactivity or when the app goes to background." |

### Widget Tooltips

| Element        | Tooltip                                                                                            |
| -------------- | -------------------------------------------------------------------------------------------------- |
| Balance widget | "Shows your total balance across all accounts. Updates every 15 minutes from your local database." |
| Budget widget  | "Shows your top 3 budgets by utilization. Green = under budget. Yellow = close. Red = over."       |

---

## 7. Premium Upgrade Touchpoints

### Principles

- **Never block.** Free users can see premium features exist. They can't use them, but they're never gate-blocked mid-task.
- **Never guilt.** No "You're missing out!" or "Upgrade now to unlock your full potential!"
- **Always honest.** State what premium adds. Let the user decide.
- **One mention per session max.** Don't repeatedly surface upgrade prompts.

### Upgrade Touchpoint Copy

**Health Score Benchmarking:**

> **See how you compare**
>
> Premium users can opt in to anonymous benchmarking — see where your score falls among users in similar situations.
>
> [Learn about Premium] [Not now]

**Report Builder (Free user):**

> **Custom reports are a Premium feature.**
>
> Build detailed financial reports with date ranges, metrics, and chart types. Export as PDF.
>
> Free alternative: your dashboard charts show spending and budget summaries.
>
> [See Premium plans] [Stay on Free]

**Biometric Categories (Free user):**

> **Biometric-protected categories are a Premium feature.**
>
> Lock sensitive spending categories behind Face ID or fingerprint authentication.
>
> [See Premium plans] [Stay on Free]

### What We Never Do

- ❌ Pop up upgrade prompts unprompted
- ❌ Show upgrade prompts during negative moments (errors, overspending)
- ❌ Use countdown timers or "limited time" offers
- ❌ Make the "Stay on Free" option less visible than the upgrade option
- ❌ Disable free features to create premium demand
- ❌ Show more than one upgrade prompt per session

---

## 8. Accessibility Considerations

### Screen Reader Copy

All onboarding screens, tooltips, and empty states must be fully accessible:

- Health Score gauge: `aria-label="Financial Health Score: {{score}} out of 100. Rating: {{rating}}."`
- Protected transaction: `aria-label="Protected transaction. Tap to authenticate and view details."`
- Blurred amount: `aria-label="Amount hidden. Biometric authentication required."`
- Widget suggestion: Full text readable by screen reader, including platform instructions

### Reduced Motion

- No animated score reveals or gauge fills
- Score appears immediately at final value
- Widget setup instructions use static images, not GIFs

### Plain Language

All onboarding copy targets Flesch-Kincaid grade 8 or below:

- "See your financial health as one number" (not "composite score derived from weighted factor analysis")
- "Lock categories behind Face ID" (not "biometric authentication gates category visibility")
- "Budget changes need approval" (not "proposals require consensus-based resolution")

### Font Scaling

All onboarding screens must work at 200% font scaling without text truncation or layout breaking.

---

## Approval Checklist

- [ ] All copy reviewed for brand voice (empowering, non-judgmental, clear)
- [ ] Health Score language verified as non-judgmental (see § 4 language guide)
- [ ] Premium touchpoints verified as non-pressuring (no dark patterns)
- [ ] Empty states verified as encouraging, not shaming
- [ ] Accessibility: screen reader labels, reduced motion, font scaling tested
- [ ] Expertise tier adaptations documented for Getting Started vs Advanced
- [ ] Platform-specific widget instructions verified per platform
- [ ] Progressive disclosure schedule coordinated with UX team
- [ ] Copy reviewed by @accessibility-reviewer
