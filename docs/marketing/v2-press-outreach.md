# v2.0 Press & Media Outreach Plan

> **Issue:** [#1149](https://github.com/jrmoulckers/finance/issues/1149)
> **Status:** PROPOSED — Pending human review
> **Sprint:** v2.0 Launch Campaign
> **Last Updated:** 2025-07-31
> **Author:** Marketing Strategist (AI agent)
> **Related:** [Press Kit](press-kit.md) · [v2.0 Launch Messaging](v2-launch-messaging.md) · [Brand Voice Guide](brand-voice-guide.md)

---

## Table of Contents

1. [Media Strategy Overview](#1-media-strategy-overview)
2. [Press Release — v2.0](#2-press-release--v20)
3. [Target Media List](#3-target-media-list)
4. [Pitch Angles by Outlet Type](#4-pitch-angles-by-outlet-type)
5. [Outreach Timeline](#5-outreach-timeline)
6. [Press FAQ — v2.0 Specific](#6-press-faq--v20-specific)
7. [Embargo & Exclusive Strategy](#7-embargo--exclusive-strategy)
8. [Media Asset Updates](#8-media-asset-updates)

---

## 1. Media Strategy Overview

### v2.0 Press Narrative

v2.0 is a **major feature release**, not a maintenance update. The press angle is:

> "A privacy-first finance app proves that intelligence doesn't require surveillance. Finance v2.0 adds financial health scoring, custom reports, and biometric-protected categories — all computed on-device, none uploaded to servers."

### Key Angles

1. **Privacy + Intelligence:** On-device health scores and reports without cloud dependency
2. **Category-level biometric protection:** A first in personal finance apps
3. **Cross-platform widgets:** Native widgets on iOS, Android, Windows, and Web — rare for any app
4. **Collaborative budgeting:** Budget negotiation workflow for households — no competitor has this
5. **Source-available verification:** Every privacy claim is verifiable in the codebase

### Media Tiers

| Tier   | Description                | Approach                 | Expected Outcome             |
| ------ | -------------------------- | ------------------------ | ---------------------------- |
| Tier 1 | Major tech/finance outlets | Exclusive or embargo     | Feature article or review    |
| Tier 2 | Privacy/security focused   | Direct pitch             | News coverage or mention     |
| Tier 3 | Personal finance blogs     | Review copy + pitch      | App review or comparison     |
| Tier 4 | Developer/tech community   | Show HN, community posts | Discussion and word-of-mouth |

---

## 2. Press Release — v2.0

**FOR IMMEDIATE RELEASE**
_(Human determines distribution timing and details)_

---

### Finance v2.0 Launches Financial Health Score, Custom Reports, and Biometric-Protected Spending — All Computed On-Device

_Privacy-first personal finance app adds intelligence layer without compromising its zero-knowledge architecture_

**[CITY, DATE]** — Finance, the multi-platform personal budget tracker, today released v2.0 — the largest update since the app's launch. The release introduces a Financial Health Score, custom report builder, home screen widgets across all platforms, biometric-protected spending categories, and collaborative budget negotiation for households.

Every new v2.0 feature runs entirely on the user's device. No financial data is uploaded to compute health scores, generate reports, or display widgets. This makes Finance one of the only personal finance apps to offer intelligent financial insights without requiring cloud-based data processing.

"The question we kept hearing was: 'I can see my spending — now help me understand it,'" said [Founder Name]. "With v2.0, you get a Financial Health Score, custom reports, and smart widgets — all without sending a single transaction to our servers. Intelligence and privacy aren't trade-offs."

**v2.0 Key Features:**

- **Financial Health Score (0–100):** A composite score based on four factors: savings rate, debt-to-income ratio, emergency fund coverage, and budget adherence. Calculated on-device from the user's own data. Premium users can opt in to anonymous benchmarking with differential privacy protections.

- **Biometric-Protected Categories:** Users can lock individual spending categories (medical, therapy, legal, etc.) behind Face ID, fingerprint, or Windows Hello. Protected transactions show as blurred in lists and excluded from charts until biometrically unlocked. In shared households, protections are per-person.

- **Cross-Platform Home Screen Widgets:** Five widget types (balance, budget status, recent transactions, spending summary, quick entry) available natively on iOS (WidgetKit), Android (Glance), Windows (Adaptive Cards), and Web (dashboard tiles). All widgets read from the local encrypted database.

- **Custom Report Builder:** Drag-and-drop report components including spending by category, income vs. expense, budget progress, net worth trends, and goal progress. Export as PDF or CSV. All report generation happens on-device.

- **Collaborative Budget Negotiation:** Household members can propose budget changes, discuss in-app, and vote to approve — replacing unilateral budget changes with a transparent workflow.

**Privacy architecture unchanged:** All v2.0 features inherit Finance's existing privacy architecture — AES-256 encryption (SQLCipher), platform-native key storage (Secure Enclave, Android Keystore, DPAPI/TPM, Web Crypto), and optional E2E encrypted sync. The codebase remains source-available under BSL-1.1.

**Pricing:** Free core with all v1.0 features plus widgets. Premium ($4.99/month, $39.99/year) adds health score benchmarking, report builder, biometric categories, and other advanced features. Family plan available.

**Availability:** Finance v2.0 is available now on the [App Store], [Google Play], [Web], and [Microsoft Store].

---

## 3. Target Media List

### Tier 1 — Major Tech/Finance Outlets

| Outlet       | Beat               | Angle                                                | Contact Method           |
| ------------ | ------------------ | ---------------------------------------------------- | ------------------------ |
| The Verge    | Apps / Privacy     | Privacy-first intelligence — on-device health scores | Pitch via tips email     |
| TechCrunch   | Fintech / Apps     | v2.0 as fintech privacy differentiator               | Pitch via tips form      |
| Ars Technica | Privacy / Security | Technical deep dive on on-device computation         | Pitch to security editor |
| Wired        | Privacy            | Biometric-protected spending categories              | Pitch to privacy desk    |
| Fast Company | Design / UX        | ADHD-friendly financial health design                | Pitch to tech editor     |

### Tier 2 — Privacy & Security Focused

| Outlet         | Beat                | Angle                                                  | Contact Method       |
| -------------- | ------------------- | ------------------------------------------------------ | -------------------- |
| Privacy Guides | App recommendations | v2.0 privacy architecture verification                 | Community submission |
| EFF Deeplinks  | Privacy tech        | On-device intelligence as privacy pattern              | Pitch to tech team   |
| RestorePrivacy | App reviews         | Full privacy audit of Finance v2.0                     | Review request       |
| PrivacyTools   | Recommendations     | Source-available finance app with biometric categories | Community submission |

### Tier 3 — Personal Finance & Lifestyle

| Outlet            | Beat             | Angle                                           | Contact Method       |
| ----------------- | ---------------- | ----------------------------------------------- | -------------------- |
| NerdWallet        | Budget apps      | v2.0 review / "best budget apps" update         | Pitch to editorial   |
| The Penny Hoarder | Budgeting        | Financial Health Score as free budgeting tool   | Pitch to apps editor |
| CNET              | Best apps        | v2.0 feature review                             | Pitch to apps team   |
| PCMag             | Software reviews | Windows desktop finance app (underserved niche) | Review request       |
| Wirecutter        | App picks        | Budget app roundup inclusion                    | Pitch to money team  |

### Tier 4 — Developer & Community

| Outlet                    | Audience                 | Angle                                      | Method           |
| ------------------------- | ------------------------ | ------------------------------------------ | ---------------- |
| Hacker News               | Developers               | Show HN: v2.0 with on-device health scores | Direct post      |
| Reddit r/privacy          | Privacy community        | Privacy-first finance app v2.0             | Community post   |
| Reddit r/personalfinance  | Budget community         | Free health score + report builder         | Community post   |
| Reddit r/ADHD             | Neurodivergent community | ADHD-friendly finance app update           | Community post   |
| Kotlin Slack / KotlinConf | KMP developers           | Cross-platform architecture case study     | Community post   |
| Product Hunt              | Product enthusiasts      | v2.0 launch page                           | Scheduled launch |

---

## 4. Pitch Angles by Outlet Type

### For Tech/Privacy Outlets

**Subject:** Finance v2.0: On-device financial health scoring without cloud dependency

**Pitch:**

> Hi [Name],
>
> Finance just shipped v2.0 — the largest update to our privacy-first budget tracker. The headline: we added a Financial Health Score, custom reports, and biometric-protected spending categories, and none of it requires uploading data to a server.
>
> Every computation runs on-device. The health score algorithm is in our source-available codebase. Biometric locks use platform-native hardware (Face ID, fingerprint, Windows Hello). Reports are generated locally.
>
> In a market where most finance apps require bank connections and server-side processing, we think this is a meaningful proof point: intelligence and privacy aren't trade-offs.
>
> Happy to provide a press build, technical deep-dive, or founder interview. [Press kit link]

### For Personal Finance Outlets

**Subject:** Free financial health score — no bank connection needed

**Pitch:**

> Hi [Name],
>
> Finance v2.0 introduces a Financial Health Score (0–100) based on four factors: savings rate, debt ratio, emergency fund, and budget adherence. It's calculated from data you enter — no bank connection required.
>
> The core app remains free: accounts, transactions, budgets, goals, and now home screen widgets. Premium adds benchmarking ("your score vs. similar users"), a custom report builder, and biometric-protected categories.
>
> For readers looking for a YNAB alternative or a way to understand their financial health without connecting their bank, this might be relevant. [App Store link]

### For ADHD / Accessibility Outlets

**Subject:** Finance v2.0: Financial health as one number, not a spreadsheet

**Pitch:**

> Hi [Name],
>
> Finance v2.0 was designed with cognitive accessibility in mind. The new Financial Health Score condenses your financial picture into a single number (0–100) — no information overload. Home screen widgets show key numbers without opening the app. Protected categories reduce the cognitive load of managing sensitive spending.
>
> The app adapts to three expertise levels and never uses judgmental language about spending. We'd welcome your perspective on whether this approach works for your community. [Press kit link]

---

## 5. Outreach Timeline

| Timing       | Activity                                                     | Owner     | Notes                                              |
| ------------ | ------------------------------------------------------------ | --------- | -------------------------------------------------- |
| T-21 days    | Finalize press release and press kit updates                 | Marketing | All copy reviewed                                  |
| T-14 days    | Send embargoed press release to Tier 1 outlets               | Human     | Embargo until launch day                           |
| T-14 days    | Offer exclusive early access to 1–2 Tier 1 outlets           | Human     | Coordinate embargo dates                           |
| T-10 days    | Send press builds to reviewers who accepted                  | Human     | TestFlight, internal track                         |
| T-7 days     | Pitch Tier 2 and Tier 3 outlets (no embargo)                 | Human     | Standard pitch                                     |
| T-3 days     | Finalize Product Hunt page                                   | Human     | Schedule for launch day                            |
| T-1 day      | Confirm all embargoed outlets have published or will publish | Human     | Follow up                                          |
| T-0 (Launch) | Press release goes public; Product Hunt launches; HN post    | Human     | See [v2-launch-day-plan.md](v2-launch-day-plan.md) |
| T+1 day      | Follow up with outlets that didn't respond                   | Human     | Gentle follow-up                                   |
| T+7 days     | Pitch "what we learned" angle to developer outlets           | Human     | Post-launch story                                  |
| T+14 days    | Submit to "best of" roundups and comparison lists            | Human     | NerdWallet, Wirecutter                             |

---

## 6. Press FAQ — v2.0 Specific

### "What's new in v2.0?"

Finance v2.0 introduces five major features: Financial Health Score, biometric-protected categories, cross-platform widgets, a custom report builder, and collaborative budget negotiation. All new features run on-device — no data is uploaded to compute any of them.

### "How is the Financial Health Score calculated?"

It's a weighted composite of four factors: savings rate (30%), debt-to-income ratio (25%), emergency fund coverage (25%), and budget adherence (20%). The formula is documented in-app and in the source code. No proprietary black-box algorithm.

### "What does 'biometric-protected categories' mean?"

Users can mark individual spending categories as requiring biometric authentication (Face ID, fingerprint, Windows Hello) to view. Protected transactions show as blurred until authenticated. This is per-user — in shared households, your protected categories are yours alone.

### "Do widgets send data to your servers?"

No. All widgets read from the local encrypted SQLite database on the device. No network calls are made to display widget content.

### "What's the pricing model?"

Free core (accounts, transactions, budgets, goals, widgets, basic analytics). Premium ($4.99/month or $39.99/year) adds health score benchmarking, report builder, biometric categories, NLP input, receipt scanning, bank connections. Family plan available. No features shipped in v1.0 are moved behind a paywall.

### "Is the code still source-available?"

Yes. The codebase remains under Business Source License 1.1 at github.com/jrmoulckers/finance. Every v2.0 privacy claim is verifiable.

---

## 7. Embargo & Exclusive Strategy

### Recommended Approach

- **Offer one exclusive early review** to a Tier 1 outlet (The Verge or TechCrunch) with a 48-hour head start
- **Embargo the press release** with 2–3 additional Tier 1 outlets, lifting at launch time
- **No embargo for Tier 2–4** — pitch after embargo lifts

### Embargo Terms

- Embargo lifts at [LAUNCH TIME] on [LAUNCH DATE]
- No social media mentions before embargo lift
- Review builds provided under NDA if needed
- Screenshots from press kit only (or app screenshots with permission)

---

## 8. Media Asset Updates

### Press Kit Updates for v2.0

| Asset                  | Status          | Notes                                                 |
| ---------------------- | --------------- | ----------------------------------------------------- |
| Press release          | ✅ Draft in § 2 | Needs human review of quotes and details              |
| Fact sheet             | 🔄 Update       | Add v2.0 features to existing fact sheet              |
| App screenshots (v2.0) | 📋 Needed       | Health score, widgets, report builder, biometric lock |
| App icon               | ✅ No change    | Same icon as v1.0                                     |
| Logo files             | ✅ No change    | Same brand assets                                     |
| Founder bio            | 🔄 Review       | Update with v2.0 context if needed                    |
| Product demo video     | 📋 Needed       | 60-second walkthrough of v2.0 features                |
| Architecture diagram   | 📋 Needed       | On-device computation visual for press                |

### Demo Video Script (60 seconds)

1. **0–10s:** "Finance v2.0 — your finances, understood." (Dashboard with Health Score visible)
2. **10–20s:** Health Score detail view — show 4 factors, improvement tips
3. **20–30s:** Widget on home screen — balance and budget at a glance
4. **30–40s:** Report builder — drag components, preview report
5. **40–50s:** Biometric prompt → protected category reveals
6. **50–60s:** "Private. Powerful. Personal. Download free on every platform."

---

## Approval Checklist

- [ ] Press release reviewed by human (founder quotes, city/date filled in)
- [ ] All factual claims verified against architecture docs
- [ ] Media list reviewed — add personal contacts, remove irrelevant outlets
- [ ] Pitch emails personalized before sending
- [ ] Press builds prepared for each platform (TestFlight, internal track, etc.)
- [ ] Embargo terms agreed with participating outlets
- [ ] Press kit updated with v2.0 assets
- [ ] Demo video produced (or storyboard approved for production)
