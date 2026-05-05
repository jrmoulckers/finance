# v2.0 Feature-Specific Marketing Copy

> **Issue:** [#1149](https://github.com/jrmoulckers/finance/issues/1149)
> **Status:** PROPOSED — Pending human review
> **Sprint:** v2.0 Launch Campaign
> **Last Updated:** 2025-07-31
> **Author:** Marketing Strategist (AI agent)
> **Related:** [v2.0 Launch Messaging](v2-launch-messaging.md) · [Brand Voice Guide](brand-voice-guide.md) · [V2 Feature Specs](../business/v2-feature-specifications.md)

---

## Table of Contents

1. [Financial Health Score Copy](#1-financial-health-score-copy)
2. [Biometric-Protected Categories Copy](#2-biometric-protected-categories-copy)
3. [Cross-Platform Widgets Copy](#3-cross-platform-widgets-copy)
4. [Custom Report Builder Copy](#4-custom-report-builder-copy)
5. [Collaborative Budget Negotiation Copy](#5-collaborative-budget-negotiation-copy)
6. [Cross-Feature Summary Copy](#6-cross-feature-summary-copy)

---

## 1. Financial Health Score Copy

### Feature Page / Landing Page

**Headline:** How healthy are your finances?

**Subheadline:** One score. Four factors. Calculated on your device.

**Body:**

Your Financial Health Score gives you a clear, single number (0–100) that reflects your overall financial picture. No guesswork, no information overload — just a straightforward answer to "how am I doing?"

**How it works:**

Your score is based on four factors:

- **Savings rate (30%)** — How much of your income you're saving each month
- **Debt-to-income ratio (25%)** — How your debt payments compare to your income
- **Emergency fund (25%)** — How many months of expenses you have saved
- **Budget adherence (20%)** — How often you stay within your budget limits

Every calculation happens on your device. Your financial data never leaves your phone, tablet, or computer to compute this score.

**Score ranges:**

| Score  | What it means                                    |
| ------ | ------------------------------------------------ |
| 80–100 | Excellent — Strong financial health              |
| 60–79  | Good — On track, room to grow                    |
| 40–59  | Fair — Some areas need attention                 |
| 20–39  | Needs work — Improvement opportunities ahead     |
| 0–19   | Getting started — Every journey begins somewhere |

**Drill into each factor** to see exactly what's driving your score, with specific, actionable suggestions for improvement.

**Premium: See how you compare.** Opt in to anonymous benchmarking. Finance uses differential privacy (k-anonymity with a minimum group size of 50) so your individual data is never identifiable. See where you stand relative to users in similar situations.

### Short Copy Variants

**One-liner (social):**

> Your Financial Health Score: one number, four factors, calculated on your device. No upload required.

**Two-liner (email):**

> See your financial health as a single score (0–100). Savings rate, debt ratio, emergency fund, budget adherence — all calculated locally on your device. No data uploaded. Ever.

**CTA button text:**

- "See my score"
- "Check my financial health"
- "How am I doing?"

### Ad Copy (If Applicable)

**Headline:** Your finances, as one number.
**Body:** Financial Health Score — 0 to 100. Savings, debt, emergency fund, budget adherence. Calculated on your device. Free in Finance v2.0.
**CTA:** Download Free

---

## 2. Biometric-Protected Categories Copy

### Feature Page / Landing Page

**Headline:** Some spending is nobody else's business.

**Subheadline:** Biometric-protected categories keep it that way.

**Body:**

Therapy. Medical bills. Legal expenses. Some spending categories are personal — and Finance v2.0 lets you keep them that way.

Mark any spending category as "biometric-protected." Those transactions require Face ID, fingerprint, or Windows Hello to view. Until you authenticate:

- Transaction amounts are blurred
- Merchant names show as "[Protected]"
- Charts show "Protected" instead of category details
- Search results exclude protected transactions

**Hand your phone to someone.** They see your budget. They don't see your therapy spending.

**Shared households, private spending.** Biometric protections are per-person. In a shared household budget, your partner sees their own view — your protected categories stay yours.

**Unlock when you need to.** Tap a protected entry and authenticate. Data is visible for 5 minutes, then locks again automatically. You can also re-lock manually anytime.

**Your biometrics stay on your device.** Finance uses your device's native biometric hardware — Secure Enclave (iOS), Trusted Execution Environment (Android), Windows Hello (Windows), WebAuthn (Web). Your biometric data never touches our code.

### Short Copy Variants

**One-liner (social):**

> Lock sensitive spending behind Face ID or fingerprint. Medical, therapy, legal — protected until you say otherwise.

**Two-liner (email):**

> Some spending categories are personal. Finance v2.0 lets you lock them behind biometric authentication. Protected transactions stay blurred until you authenticate — even in shared household budgets.

**CTA button text:**

- "Protect my categories"
- "Learn about biometric lock"
- "Keep spending private"

### Scenario Vignettes

**Scenario 1: Shared phone**

> You hand your phone to your partner to check the grocery budget. Your therapy spending? Blurred. Your medical bills? Hidden behind Face ID. They see the shared budget. They don't see your protected categories. That's how it should be.

**Scenario 2: Household budget**

> You and your partner share a budget. You both see shared spending. But your legal expenses are biometric-locked. In the shared budget view, your partner sees the aggregate budget — not the individual protected transactions. Privacy within partnership.

---

## 3. Cross-Platform Widgets Copy

### Feature Page / Landing Page

**Headline:** Your finances, at a glance.

**Subheadline:** Home screen widgets on every platform.

**Body:**

Check your balance, budget status, and recent transactions without opening the app. Finance v2.0 widgets live on your home screen and give you the quick look you need.

**Five widget types:**

| Widget                  | What it shows                      | Size   |
| ----------------------- | ---------------------------------- | ------ |
| **Balance**             | Total balance across all accounts  | Small  |
| **Budget Status**       | Top 3 budgets with spend vs. limit | Medium |
| **Recent Transactions** | Last 5 transactions                | Medium |
| **Spending Summary**    | Category breakdown (current month) | Large  |
| **Quick Entry**         | Tap to add a transaction instantly | Small  |

**Every platform, natively:**

- **iOS:** WidgetKit widgets — small, medium, large, extra-large (iPad)
- **Android:** Glance widgets with Material You theming
- **Windows:** Windows Widgets via Adaptive Cards
- **Web:** Pinnable dashboard tiles with drag-and-drop

**No network calls.** Widgets read from your local encrypted database. Data refreshes every 15 minutes. No server is contacted to display your widget content.

**Biometric protection respected.** If you've marked categories as biometric-protected, those amounts are excluded from widget displays — no sensitive data on your lock screen.

### Short Copy Variants

**One-liner (social):**

> Finance v2.0 widgets: balance, budgets, and transactions on your home screen. Local data. No network calls.

**Two-liner (email):**

> Check your finances without opening the app. Home screen widgets show your balance, budget status, and recent transactions — refreshed every 15 minutes from your local encrypted database. Available on iOS, Android, Windows, and Web.

**CTA button text:**

- "Add a widget"
- "Set up widgets"
- "Finances at a glance"

---

## 4. Custom Report Builder Copy

### Feature Page / Landing Page

**Headline:** Reports that answer your questions.

**Subheadline:** Build custom financial reports. Export on your terms.

**Body:**

Stop scrolling through transactions to find answers. Finance v2.0's report builder lets you create exactly the financial view you need.

**Drag and drop components:**

- Spending by category — pie, bar, or treemap
- Income vs. expense — line or bar chart
- Budget progress — gauge or horizontal bar
- Net worth trend — area chart over time
- Goal progress — timeline and progress bars
- Transaction list — filtered and sortable
- Summary stats — income, expenses, savings rate
- Health score trend — your score over time

**Build it your way:**

1. Choose a date range (this month, last month, year-to-date, or custom)
2. Drag components from the palette onto your report
3. Configure each component — filter by category, choose chart type
4. Preview your report
5. Export as PDF or CSV

**On-device, as always.** Reports are generated on your device from your local database. PDF rendering happens locally. Nothing is uploaded to generate your report.

**Shareable (Premium).** Generate an authenticated, encrypted link to share a report. Links expire in 30 days. Viewer must authenticate.

**Scheduled reports (Premium).** Set up monthly email delivery of your favorite report as a PDF attachment.

### Short Copy Variants

**One-liner (social):**

> Finance v2.0: drag-and-drop report builder. Spending, budgets, net worth — your view, your export, your device.

**Two-liner (email):**

> Build custom financial reports with drag-and-drop components. Spending by category, budget progress, net worth trends, and more. Export as PDF or CSV. All generated on your device from your encrypted local data.

**CTA button text:**

- "Build a report"
- "Create my first report"
- "See my finances clearly"

---

## 5. Collaborative Budget Negotiation Copy

### Feature Page / Landing Page

**Headline:** Budget together. Fairly.

**Subheadline:** Propose, discuss, agree — no more unilateral changes.

**Body:**

Sharing a budget with a partner or family? Finance v2.0 makes it fair. Instead of one person setting budget amounts, everyone gets a voice.

**How it works:**

1. **Propose** — Any household member can suggest a budget change (new amount, new category, new period)
2. **Discuss** — Comment on the proposal in an in-app discussion thread
3. **Vote** — Members approve or request changes
4. **Apply** — Approved proposals take effect immediately

**No more "who changed the grocery budget?"** Every change is tracked. Every proposal has a history. Transparency by default.

**Flexible rules:**

- 2-person household: both must agree (or budget owner overrides)
- 3+ person household: majority vote (or owner overrides)
- Owner override is always available — but it's logged in the audit trail
- Proposals auto-close after 14 days if no action is taken

**Notifications keep everyone in the loop.** Proposal created? Push notification. Vote needed? Push notification. Proposal approved? Everyone knows.

### Short Copy Variants

**One-liner (social):**

> Shared budgets should be democratic. Finance v2.0: propose budget changes, discuss, vote, apply. No more unilateral edits.

**Two-liner (email):**

> Sharing a household budget? Now everyone gets a voice. Propose changes, discuss in-app, vote to approve. Finance v2.0 makes shared budgets fair and transparent.

**CTA button text:**

- "Try collaborative budgets"
- "Budget together"
- "Set up household sharing"

---

## 6. Cross-Feature Summary Copy

### All Features in One Paragraph

> Finance v2.0 adds five major features — all running on your device. A Financial Health Score (0–100) shows where you stand across savings, debt, emergency fund, and budget adherence. Biometric-protected categories keep sensitive spending behind Face ID or fingerprint. Home screen widgets put your balance and budgets on your home screen across every platform. A custom report builder lets you create the exact financial view you need. And collaborative budget negotiation gives every household member a voice. All private. All encrypted. All offline-capable.

### Feature Comparison (v1.0 vs v2.0)

| Capability             | v1.0       | v2.0                        |
| ---------------------- | ---------- | --------------------------- |
| Track spending         | ✅         | ✅                          |
| Envelope budgets       | ✅         | ✅ + rollover               |
| Savings goals          | ✅         | ✅                          |
| Quick entry            | ✅ 3 taps  | ✅ 3 taps                   |
| Privacy & encryption   | ✅ AES-256 | ✅ AES-256 + biometric lock |
| Financial Health Score | —          | ✅ 0–100                    |
| Home screen widgets    | —          | ✅ 5 types, all platforms   |
| Custom reports         | —          | ✅ drag-and-drop            |
| Biometric categories   | —          | ✅ per-category lock        |
| Budget negotiation     | —          | ✅ propose/vote             |

### "Why Upgrade?" Summary

**For free users:** Widgets and basic health score are free. You already benefit from v2.0.

**For premium users:** Health score benchmarking, custom report builder, biometric categories, and scheduled reports make premium even more valuable.

**For family users:** Collaborative budget negotiation transforms shared budgets from "one person decides" to "everyone contributes."

---

## Approval Checklist

- [ ] All feature descriptions verified against v2-feature-specifications.md
- [ ] All privacy claims verified against architecture docs
- [ ] No exaggerated claims — all copy maps to actual shipped functionality
- [ ] Brand voice alignment (empowering, non-judgmental, clear)
- [ ] Health Score language is informational, not judgmental (no "failing")
- [ ] Biometric categories framed as privacy/autonomy, not "hiding"
- [ ] Inclusive language used throughout
- [ ] CTA text is invitational, not pressuring
