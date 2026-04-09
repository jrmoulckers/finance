---
name: go-to-market
description: >
  Go-to-market strategy, marketing, and launch planning for the Finance app.
  Use for app store optimization, launch communications, content strategy, user
  acquisition, and growth planning.
---

# Go-to-Market Skill

This skill provides actionable guidance for launching and growing the Finance app across all platforms (iOS, Android, Web, Windows).

## App Store Optimization (ASO)

### Title and Subtitle Strategy

| Platform    | Title (30 chars max)     | Subtitle / Short Description (80 chars)                  |
| ----------- | ------------------------ | -------------------------------------------------------- |
| iOS         | Finance — Budget Tracker | Private, offline-first budgeting for you and your family |
| Google Play | Finance — Budget Tracker | Private budgeting & expense tracking — works offline     |
| Microsoft   | Finance                  | Privacy-first budgeting and financial tracking           |

### Keyword Strategy

Target long-tail keywords that combine finance functionality with privacy differentiators:

- **Primary**: budget tracker, expense tracker, personal finance, money manager
- **Differentiators**: private budget app, offline budget tracker, no-cloud budgeting
- **Feature**: family budget, shared finances, goal tracker, bill tracker
- **Platform-specific (iOS)**: Use all 100 keyword characters. Separate with commas, no spaces. Do not repeat words from the title or subtitle — Apple already indexes those.
- **Platform-specific (Android)**: Keywords appear in the full description. Repeat key terms naturally 3–5 times across the description body.

### Screenshot and Preview Requirements

| Platform    | Sizes Required                            | Count | Notes                                         |
| ----------- | ----------------------------------------- | ----- | --------------------------------------------- |
| iOS         | 6.7" (1290×2796), 6.5" (1284×2778), iPad  | 3–10  | First 3 visible without scrolling             |
| Google Play | Phone (1080×1920+), 7" tablet, 10" tablet | 2–8   | First image is the feature graphic (1024×500) |
| Microsoft   | 1366×768 minimum                          | 1–10  | Include desktop window chrome                 |

**Screenshot sequence** (consistent across platforms):

1. Dashboard overview — "Your finances at a glance"
2. Budget tracking — "Stay on top of spending"
3. Goal progress — "Track savings goals"
4. Multi-platform sync — "Works everywhere, even offline"
5. Privacy highlight — "Your data stays on your device"

### Description Copywriting

**Opening line** (most important — visible before "Read more"):

> Track your budget privately. Finance keeps your financial data on your device — no cloud required, no ads, no data selling. Works offline on iOS, Android, Web, and Windows.

**Feature highlights** (use bullet points or short paragraphs):

- 🔒 **Privacy-first** — Your financial data never leaves your device unless you choose to sync
- 📴 **Works offline** — Full functionality without internet, sync when you're ready
- 👨‍👩‍👧 **Family budgeting** — Share budgets with your partner or household
- 🎯 **Goal tracking** — Set savings goals and track progress visually
- 📊 **Insights** — See where your money goes with automatic categorization
- 💻 **Multi-platform** — Native apps for iOS, Android, Windows, and Web

**Privacy-first messaging block** (use in every listing):

> Unlike other finance apps, Finance was built with privacy as the foundation — not an afterthought. Your data is encrypted on your device. We never sell, share, or use your financial information for advertising. You can export or delete your data at any time (GDPR/CCPA compliant).

### Category Selection

| Platform        | Primary Category | Secondary Category |
| --------------- | ---------------- | ------------------ |
| iOS App Store   | Finance          | Productivity       |
| Google Play     | Finance          | —                  |
| Microsoft Store | Personal Finance | Productivity       |
| Web (PWA)       | N/A              | N/A                |

### Rating and Review Strategy

- **In-app prompt timing**: After the user creates their second budget or logs 10+ transactions (demonstrates engagement, avoids prompting unengaged users).
- **Platform API**: Use `SKStoreReviewController` (iOS) and `ReviewManager` (Android) — never use custom dialogs that violate store guidelines.
- **Frequency**: Prompt at most once per 120 days. Never prompt during or after an error.
- **Response**: Reply to every 1–3 star review within 48 hours with a constructive response and support link.
- **Never** incentivize reviews with in-app rewards — this violates store policies.

## Launch Communication Plan

### Pre-Launch (T-minus 4 weeks)

| Week | Action                                                          | Owner       |
| ---- | --------------------------------------------------------------- | ----------- |
| -4   | Landing page live with email signup                             | Web         |
| -4   | Beta signup form active — target 200 beta testers               | Marketing   |
| -3   | Press kit prepared (logo, screenshots, fact sheet, bios)        | Design      |
| -3   | Draft Product Hunt launch post                                  | Marketing   |
| -2   | Beta build distributed to testers via TestFlight / Play Console | DevOps      |
| -2   | Collect and act on beta feedback (fix critical bugs)            | Engineering |
| -1   | Submit to app stores for review                                 | DevOps      |
| -1   | Schedule social media posts, email blast, blog post             | Marketing   |

### Launch Day Checklist

- [ ] Confirm app is live on all stores
- [ ] Publish blog post: "Introducing Finance"
- [ ] Send email to waitlist subscribers
- [ ] Post on Product Hunt (schedule for 12:01 AM PT for full day visibility)
- [ ] Post on Twitter/X, LinkedIn, Mastodon, Bluesky
- [ ] Post on Reddit: r/personalfinance, r/privacy, r/selfhosted, r/android, r/iphone
- [ ] Submit to Hacker News (Show HN)
- [ ] Monitor crash reports and sync errors — all-hands support for first 48 hours

### Post-Launch (T-plus 1–4 weeks)

| Week | Action                                                       |
| ---- | ------------------------------------------------------------ |
| +1   | Publish "launch retrospective" blog post with real numbers   |
| +1   | Send thank-you email to beta testers                         |
| +2   | First feature-highlight blog post based on most-used feature |
| +2   | Respond to all app store reviews                             |
| +3   | Collect NPS survey from early users                          |
| +4   | Plan next release based on feedback themes                   |

### Status Page and Incident Communication

**Status page** (use a service like Instatus, Statuspage, or a static GitHub Pages site):

- Components: Sync Service, Authentication, Web App, API
- Display current status and uptime percentage

**Incident template**:

```
Title: [Component] — [Brief description]
Status: Investigating | Identified | Monitoring | Resolved

[Timestamp] — We are aware of [issue description]. Users may experience
[impact]. We are actively investigating and will provide updates every
[30 minutes / 1 hour].

[Timestamp] — The issue has been identified as [root cause]. A fix is
being deployed. [Estimated resolution time].

[Timestamp] — The fix has been deployed and we are monitoring. Service
has been restored for all users.
```

## Content Strategy

### Blog Post Calendar

| Priority | Title                                           | Angle                             |
| -------- | ----------------------------------------------- | --------------------------------- |
| 1        | Why We Built Finance                            | Privacy-first origin story        |
| 2        | Your Budget App Shouldn't Need the Internet     | Offline-first architecture        |
| 3        | How Finance Keeps Your Data Private             | Technical deep-dive on encryption |
| 4        | Budgeting for Couples Without Sharing Passwords | Family/household feature          |
| 5        | Finance on Every Screen                         | Multi-platform story              |
| 6        | From Mint to Finance: A Migration Guide         | Competitor migration              |
| 7        | Open Architecture: Export Your Data Anytime     | GDPR, data portability            |

### Privacy and Security Differentiation

**Core messaging pillars** (use consistently across all content):

1. **Your data, your device** — Financial data is stored locally and encrypted. Cloud sync is opt-in, not required.
2. **No ads, no tracking, no data sales** — Revenue comes from premium features, never from user data.
3. **Export and delete anytime** — Full GDPR and CCPA compliance. One-tap data export in JSON or CSV.
4. **Open architecture** — Transparent about what data is collected and how sync works.

### Platform-Specific Content

- **iOS**: Emphasize Apple ecosystem integration, iCloud Keychain, Face ID, Widget support
- **Android**: Emphasize Material You theming, home screen widgets, Wear OS companion
- **Web**: Emphasize no-install access, PWA capabilities, works on Chromebooks and Linux
- **Windows**: Emphasize desktop productivity, Windows Hello, multi-monitor support

### SEO Keywords

| Category   | Target Keywords                                                      |
| ---------- | -------------------------------------------------------------------- |
| Primary    | personal finance app, budget tracker, expense tracker                |
| Long-tail  | private budget app, offline budget tracker, budget app without cloud |
| Comparison | mint alternative, ynab alternative, privacy budget app               |
| Feature    | family budget app, couples budget tracker, savings goal tracker      |
| Platform   | budget app ios, budget app android, budget app windows, budget pwa   |

## User Acquisition Channels

### Organic Channels

| Channel          | Strategy                                                     | Effort | Impact |
| ---------------- | ------------------------------------------------------------ | ------ | ------ |
| ASO              | Optimize listings quarterly, A/B test screenshots            | Medium | High   |
| SEO / Blog       | Publish 2 posts/month targeting long-tail finance keywords   | Medium | Medium |
| Reddit           | Engage authentically in r/personalfinance, r/privacy, r/ynab | Low    | Medium |
| Hacker News      | Show HN launch, technical blog posts on architecture         | Low    | High   |
| Product Hunt     | Time launch for Tuesday–Thursday, prepare a compelling story | Low    | Medium |
| GitHub community | Open-source components, engage with privacy/fintech devs     | Low    | Low    |

### Paid Channels (Budget-Conscious)

| Channel          | Monthly Budget | Strategy                                         |
| ---------------- | -------------- | ------------------------------------------------ |
| Apple Search Ads | $200–500       | Target branded competitor terms + category terms |
| Google Ads (UAC) | $200–500       | Target "budget app" and "expense tracker" terms  |
| Reddit Ads       | $100–200       | Target r/personalfinance, r/privacy              |

**Rules for paid acquisition**:

- Set strict daily budget caps — never allow auto-optimization to exceed limits
- Target CPI (Cost Per Install) below $2.00
- Pause campaigns with CPI above $3.00 after 7 days
- Focus spend on platforms showing organic traction first

### Referral Program Design

- **Mechanic**: Existing user shares a referral code → new user signs up → both get 1 month of premium free
- **Limit**: Maximum 12 referral rewards per user per year
- **Tracking**: Referral codes are generated in-app, tracked via the sync service
- **Messaging**: "Share Finance with a friend — you both get a free month of Premium"
- **Implementation**: Create a `[Marketing] Referral program implementation` issue when ready

### Partnership Opportunities

| Partner Type                     | Approach                                           |
| -------------------------------- | -------------------------------------------------- |
| Financial literacy nonprofits    | Offer free premium access for their communities    |
| Privacy advocacy orgs            | Co-publish content on financial data privacy       |
| Personal finance bloggers        | Provide review copies, affiliate program           |
| University financial aid offices | Free student tier, financial wellness integrations |

## Competitive Positioning

### Key Differentiators

| Feature          | Finance        | Mint          | YNAB          | Monarch       | Copilot (iOS) |
| ---------------- | -------------- | ------------- | ------------- | ------------- | ------------- |
| Privacy-first    | ✅ Local-first | ❌ Cloud      | ❌ Cloud      | ❌ Cloud      | ❌ Cloud      |
| Works offline    | ✅ Full        | ❌            | ❌            | ❌            | ❌            |
| Multi-platform   | ✅ 4 platforms | ✅ Web+Mobile | ✅ Web+Mobile | ✅ Web+Mobile | ❌ iOS only   |
| Open data export | ✅ JSON+CSV    | ⚠️ Limited    | ⚠️ Limited    | ⚠️ Limited    | ⚠️ Limited    |
| No ads           | ✅             | ❌            | ✅            | ✅            | ✅            |
| Family/household | ✅             | ❌            | ✅            | ✅            | ❌            |
| Windows native   | ✅             | ❌            | ❌            | ❌            | ❌            |

### Messaging Matrix

| Audience           | Lead Message                                               | Supporting Proof                       |
| ------------------ | ---------------------------------------------------------- | -------------------------------------- |
| Privacy-conscious  | "Your financial data stays on your device"                 | Local-first architecture, no telemetry |
| Budget beginners   | "Simple budgeting that works even without internet"        | Guided setup, offline-first            |
| YNAB/Mint refugees | "All the budgeting power, none of the data sharing"        | Feature parity + privacy + data import |
| Families/couples   | "Budget together without sharing passwords or bank logins" | Household sync, per-user permissions   |
| Technical users    | "Open architecture, export anytime, your data your rules"  | JSON/CSV export, transparent sync      |

### Pricing Position

| Tier    | Price       | Includes                                                  |
| ------- | ----------- | --------------------------------------------------------- |
| Free    | $0          | Unlimited accounts, budgets, transactions — single device |
| Premium | $4.99/month | Multi-device sync, household sharing, priority support    |
| Annual  | $39.99/year | Premium features, 33% discount vs monthly                 |

**Position relative to competitors**: Cheaper than YNAB ($14.99/mo), comparable to Monarch ($9.99/mo) but with privacy advantages. Free tier is genuinely usable (not a trial), differentiating from Copilot's subscription-only model.

## Growth Metrics

### North Star Metric

**Monthly Active Users (MAU)** — users who open the app and perform at least one action (view dashboard, log transaction, update budget) within a 30-day window.

### Activation Metric

**First budget created within 7 days** of install. This is the strongest predictor of long-term retention.

Activation funnel:

```
Install → Open app → Create first account → Log first transaction → Create first budget
         (target: 80%)  (target: 60%)        (target: 40%)          (target: 30%)
```

### Retention Cohorts

| Cohort | Target | Red Flag Below |
| ------ | ------ | -------------- |
| D1     | 40%    | 25%            |
| D7     | 25%    | 15%            |
| D30    | 15%    | 8%             |
| D90    | 10%    | 5%             |

### Revenue Metrics

| Metric                     | Target              |
| -------------------------- | ------------------- |
| Free-to-Premium conversion | 5–8% within 90 days |
| ARPU (all users)           | $0.50/month         |
| ARPU (paying users)        | $4.50/month         |
| Churn (monthly premium)    | < 5%/month          |
| LTV (paying user)          | > $50               |

### Instrumentation

Track these events (privacy-respecting, no PII):

- `app_opened` — daily active signal
- `account_created` — activation step
- `transaction_logged` — core engagement
- `budget_created` — activation milestone
- `goal_created` — feature adoption
- `sync_enabled` — premium signal
- `export_completed` — data portability usage
- `referral_shared` — growth loop signal

**Privacy rule**: All analytics must be opt-in, anonymized, and aggregatable. Never track individual financial data. Use privacy-respecting analytics (Plausible, Fathom, or self-hosted PostHog) — never Google Analytics.

## Marketing Issue Templates

Use these formats when creating GitHub issues for marketing work:

### ASO Optimization

```
Title: [Marketing] ASO optimization for [platform]
Labels: marketing, aso
Body:
## Platform
[iOS App Store / Google Play / Microsoft Store]

## Current State
- Current title: ...
- Current subtitle: ...
- Current keyword ranking for top terms: ...

## Proposed Changes
- New title: ...
- New subtitle: ...
- Keyword changes: ...
- Screenshot updates: ...

## Success Criteria
- Improve ranking for [keyword] from position X to Y
- Increase conversion rate from X% to Y%
```

### Launch Announcement

```
Title: [Marketing] Launch announcement draft
Labels: marketing, launch
Body:
## Channel
[Blog / Email / Social / Press Release / Product Hunt]

## Target Audience
[Description of who this announcement is for]

## Key Messages
1. ...
2. ...
3. ...

## Draft
[Link to draft document or inline content]

## Review Checklist
- [ ] Privacy messaging accurate
- [ ] Feature claims verified
- [ ] Platform availability correct
- [ ] Pricing information current
- [ ] Legal review (if press release)
```

### Content Blog Post

```
Title: [Marketing] Content: [topic] blog post
Labels: marketing, content
Body:
## Topic
[Brief description]

## Target Keywords
- Primary: ...
- Secondary: ...

## Outline
1. ...
2. ...
3. ...

## Target Publish Date
[Date]

## Success Criteria
- Organic traffic: X visits within 30 days
- Engagement: average time on page > 3 minutes
```

### General Marketing Task

```
Title: [Marketing] [Brief description]
Labels: marketing
Body:
## Objective
[What this task aims to achieve]

## Context
[Background and motivation]

## Deliverables
- [ ] ...
- [ ] ...

## Timeline
[Target completion date]
```
