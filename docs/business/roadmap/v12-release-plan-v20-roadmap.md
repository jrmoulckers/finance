# v1.2 Release Planning and v2.0 Roadmap Kickoff

**Issue:** #799
**Sprint:** 10 — Platform Expansion
**Priority:** P2 — Medium
**Status:** Complete
**Document Owner:** Product Management
**Date:** 2025-07-29

---

## Executive Summary

This document covers two planning horizons: the v1.2 release (Weeks 19–25,
targeting the largest feature update since launch) and the v2.0 roadmap kickoff
(6–12 months out). v1.2 bundles bank connections, receipt scanning, family
collaboration, and RASP security hardening. v2.0 candidates are ranked by
business impact using Sprint 6–9 data as input.

---

## Part 1: v1.2 Release Plan

### Release Scope

v1.2 is a major feature release encompassing Sprint 8–10 engineering work:

| Feature                        | Issue | Agent Type        | Status    | Risk Level |
| ------------------------------ | ----- | ----------------- | --------- | ---------- |
| Bank connection API (Plaid)    | #265  | backend + kmp     | Sprint 10 | High       |
| Receipt scanning OCR           | #301  | kmp + ios/android | Sprint 10 | Medium     |
| Family/household collaboration | #270  | backend + kmp     | Sprint 10 | High       |
| Family premium plan            | #339  | backend           | Sprint 10 | Low        |
| RASP security hardening        | #330  | ios/android/win   | Sprint 10 | Medium     |
| Offline backup and restore     | #302  | kmp + backend     | Sprint 10 | Low        |
| Dashboard widgets              | #315  | kmp + platforms   | Sprint 8  | Low        |
| Platform home screen widgets   | #293  | ios/android/win   | Sprint 8  | Low        |
| Internationalization framework | #264  | kmp + platforms   | Sprint 8  | Medium     |
| AI categorization              | #263  | kmp + backend     | Sprint 9  | Medium     |
| NLP transaction input          | #322  | kmp               | Sprint 9  | Medium     |
| Anomaly detection              | #323  | backend + kmp     | Sprint 9  | Medium     |
| Spending predictions           | #324  | kmp               | Sprint 9  | Low        |
| Subscription detection         | #325  | kmp               | Sprint 9  | Low        |
| Financial health score         | #299  | kmp + platforms   | Sprint 9  | Low        |

### Release Timeline

| Week | Phase                        | Key Activities                                     |
| ---- | ---------------------------- | -------------------------------------------------- |
| 19   | Engineering: Sprint 10 start | Bank API integration, OCR, family collab begin     |
| 20   | Engineering: Sprint 10 end   | Feature-complete target for all Sprint 10 items    |
| 21   | Integration testing          | Cross-feature integration, sync stability testing  |
| 22   | Security review              | @security-reviewer audit of bank connections, RASP |
| 23   | v1.2-rc1                     | Release candidate, staged rollout to beta users    |
| 24   | v1.2 production release      | All platforms submitted, phased store rollout      |
| 25   | Marketing push               | Bank + family + AI features marketing campaign     |

### Platform Release Schedule

| Platform | Submission | Expected Approval | Notes                         |
| -------- | ---------- | ----------------- | ----------------------------- |
| iOS      | Week 23    | Week 24           | Bank connection needs review  |
| Android  | Week 23    | Week 23–24        | Staged rollout (10% → 100%)   |
| Web      | Week 24    | Immediate         | CDN deploy, no store review   |
| Windows  | Week 23    | Week 24           | Microsoft Store certification |

### v1.2 Release Notes (Draft)

**Finance v1.2 — Connect, Scan, Share**

**New Features:**

- **Bank Connections (Premium):** Optionally connect your bank to automatically
  import transactions. Powered by Plaid. Completely optional — Finance works
  great without it. Disconnect anytime.
- **Receipt Scanning (Premium):** Point your camera at a receipt. Finance reads
  the amount, date, and merchant. You confirm, done.
- **Family Sharing (Family Plan):** Create a household. Invite your partner or
  family. Share budgets, see combined spending, keep individual accounts private.
- **AI Categorization (Premium):** Transactions are automatically sorted into
  categories. Learns from your corrections. All processing on-device.
- **Smart Insights (Premium):** Spending anomaly alerts, end-of-month balance
  predictions, automatic subscription detection, and a financial health score.
- **Dashboard Widgets:** Customize your dashboard with the information that
  matters to you.
- **Home Screen Widgets:** Quick balance and spending views right on your
  phone's home screen (iOS, Android).
- **Natural Language Input:** Type "Spent $45 at Target yesterday on groceries"
  and Finance parses it automatically.

**Improvements:**

- Internationalization framework — more languages coming soon
- Offline backup and restore — export encrypted backups, import on new devices
- RASP security hardening — additional protection against device tampering
- Performance improvements across all platforms

**Privacy Note:** Bank connections are powered by Plaid. When you connect,
Plaid retrieves your transactions securely. Finance never sees your bank
credentials. Your imported transactions are stored locally on your device, just
like manually entered data. You can disconnect at any time. See our updated
privacy policy for details.

### Release Risks and Mitigations

| Risk                                        | Impact | Mitigation                                            |
| ------------------------------------------- | ------ | ----------------------------------------------------- |
| Plaid integration delays (API key, review)  | High   | Start vendor outreach immediately (human-gated)       |
| App store rejection (bank connection scope) | Medium | Pre-submission privacy review, clear data disclosures |
| Family collab RLS complexity                | High   | Extensive multi-user testing, edge case matrix        |
| AI model accuracy below 80% target          | Medium | Ship as "beta" with user feedback loop                |
| Receipt OCR quality variance                | Low    | User confirms/edits all parsed data                   |
| Staged rollout surfaces critical bugs       | Medium | 10% rollout first, 48-hour hold before full release   |

### v1.2 Marketing Campaign Alignment

| Campaign                       | Issue | Status    | Key Message                           |
| ------------------------------ | ----- | --------- | ------------------------------------- |
| Bank connection trust campaign | #813  | Sprint 10 | "Optional. Transparent. Your choice." |
| Receipt scanning marketing     | #815  | Sprint 10 | "Snap. Confirm. Done."                |
| Partnership outreach strategy  | #816  | Sprint 10 | Provider co-marketing opportunities   |
| 90-day growth retrospective    | #817  | Sprint 10 | Data-driven strategy refresh          |
| Family plan messaging          | —     | Planned   | "Share budgets, not passwords."       |
| AI features launch content     | #811  | Sprint 9  | "Smart insights, private by default." |

---

## Part 2: v2.0 Roadmap Kickoff

### Roadmap Philosophy

v2.0 should be driven by real user data from Sprints 6–10, not assumptions. The
candidates below are ranked by projected business impact, but final
prioritization requires Sprint 10 business review data (#832) and partnership
economics analysis (#831).

### v2.0 Feature Candidates (Ranked by Business Impact)

| Rank | Feature                            | Business Rationale                                   | Effort | Revenue Impact   |
| ---- | ---------------------------------- | ---------------------------------------------------- | ------ | ---------------- |
| 1    | **Bank connection expansion**      | More providers, more markets = more connected users  | L      | High             |
| 2    | **Investment tracking**            | Top-requested feature in PFM apps, premium upsell    | XL     | High             |
| 3    | **Advanced AI insights**           | Predictions, recommendations, financial coaching     | L      | Medium           |
| 4    | **Custom reporting**               | Power user and enterprise demand, premium feature    | L      | Medium           |
| 5    | **API access for power users**     | Developer community, automation, integrations        | M      | Low–Medium       |
| 6    | **International market expansion** | Localization + local bank support for EU, UK, AU     | XL     | High (long-term) |
| 7    | **Enterprise/team plans**          | Small business market, higher ARPU                   | L      | Medium           |
| 8    | **Bill negotiation service**       | High perceived value, partnership opportunity        | M      | Low              |
| 9    | **Collaborative budgeting tools**  | Extension of family collab with negotiation features | M      | Low              |
| 10   | **Wearable companions**            | Apple Watch, Wear OS — convenience, not core value   | L      | Low              |

### Top 5 Deep Dive

#### 1. Bank Connection Expansion

- **What:** Add MX and/or Finicity as fallback providers. Expand to UK (Open
  Banking), EU (PSD2), Canada, and Australia.
- **Why:** Plaid-only leaves coverage gaps. International expansion requires
  region-specific providers. Bank connections drove the highest retention and
  conversion lift in v1.2.
- **Investment:** 1 engineer, 8–12 weeks per additional provider/region.
- **Revenue:** Each new market is effectively a re-launch opportunity.

#### 2. Investment Tracking

- **What:** Portfolio tracking (stocks, ETFs, crypto, retirement accounts).
  Read-only via Plaid Investments API or manual entry.
- **Why:** #1 feature request in PFM post-bank-connections. Monarch Money and
  Copilot both have this. Premium-only feature.
- **Investment:** 2 engineers, 12–16 weeks. KMP shared models +
  backend + platform UI.
- **Revenue:** Justifies price increase to $7.99/month (premium) or new
  "Pro" tier.

#### 3. Advanced AI Insights

- **What:** Spending forecasts with confidence intervals, AI budget
  recommendations, personalized savings suggestions, cashflow calendar.
- **Why:** Builds on Sprint 9 intelligence layer. Differentiates from
  competitors. High perceived value for premium retention.
- **Investment:** 1 ML engineer + 1 platform engineer, 8–12 weeks.
- **Revenue:** Premium retention driver (reduces churn by est. 15–20%).

#### 4. Custom Reporting

- **What:** User-defined reports with date ranges, category filters, trend
  charts, and PDF/CSV export. Scheduled report delivery via email.
- **Why:** Power users and small businesses need reporting. Currently no way
  to generate custom views of financial data.
- **Investment:** 1 engineer, 6–8 weeks. Report builder UI +
  backend generation.
- **Revenue:** Premium feature. Enterprise plan differentiator.

#### 5. API Access for Power Users

- **What:** REST API for reading/writing transactions, budgets, goals.
  OAuth2 authentication. Webhooks for real-time events.
- **Why:** Developer community, automation (IFTTT, Zapier), CSV import
  alternatives, data portability.
- **Investment:** 1 backend engineer, 8–10 weeks. API design, auth,
  rate limiting, documentation.
- **Revenue:** Premium/Enterprise feature. Low direct revenue but high
  community engagement.

### v2.0 Timeline (Tentative)

| Quarter   | Focus                                        | Milestone  |
| --------- | -------------------------------------------- | ---------- |
| Q1 (v2.0) | Investment tracking + bank expansion (UK/EU) | v2.0-alpha |
| Q2 (v2.0) | Advanced AI + custom reporting               | v2.0-beta  |
| Q3 (v2.0) | API access + enterprise plan + wearables     | v2.0       |

> **Important:** This timeline is aspirational. Actual v2.0 scope and timing
> depend on v1.2 adoption data, revenue performance, and the business case
> analysis (#833).

### v2.0 Pricing Evolution Considerations

| Scenario                      | Individual | Family    | Enterprise | Notes                        |
| ----------------------------- | ---------- | --------- | ---------- | ---------------------------- |
| **Status quo**                | $4.99/mo   | $9.99/mo  | $19.99/mo  | v1.2 pricing                 |
| **Modest increase**           | $6.99/mo   | $12.99/mo | $24.99/mo  | With investment tracking     |
| **New Pro tier**              | $4.99 base | $9.99     | —          | Pro: $9.99 with investing    |
| **Annual-only for new tiers** | —          | —         | —          | Reduces churn, increases LTV |

Pricing changes require A/B testing and sensitivity analysis. No changes before
v1.2 adoption data is available.

---

## Part 3: Post-Launch Retrospective Framework

### Retrospective Scope

Covers Sprints 6–10 (20 weeks, Weeks 11–30 post-launch).

### Retrospective Questions

**What went well?**

- Which features drove the most user engagement?
- Which marketing campaigns had the best ROI?
- Where did engineering estimates prove accurate?
- What sprint planning practices worked?

**What did not go well?**

- Which features underperformed expectations?
- Where did we miss deadlines and why?
- What user feedback surprised us?
- Which technical decisions created unexpected debt?

**What should we change?**

- Sprint cadence (2 weeks still right?)
- Team capacity assumptions
- Testing and QA processes
- Release cadence (per-sprint vs. batched)

### Metrics to Review

| Category  | Metric                   | Target      |
| --------- | ------------------------ | ----------- |
| Growth    | Total users              | Track trend |
| Growth    | DAU/MAU                  | 25%+        |
| Retention | 30-day retention         | 45%+        |
| Revenue   | MRR                      | Track trend |
| Revenue   | Premium conversion       | 5%+         |
| Revenue   | LTV:CAC ratio            | 3:1+        |
| Quality   | Crash-free rate          | 99.5%+      |
| Quality   | App store rating         | 4.5+        |
| Velocity  | Sprint completion rate   | 80%+        |
| Velocity  | Issues closed per sprint | 6+          |

### Retrospective Output

The retrospective should produce:

1. Executive summary of Sprints 6–10 performance
2. Top 5 learnings with evidence
3. Top 5 process improvements for Sprints 11+
4. Updated sprint velocity assumptions
5. Input to v2.0 prioritization (data-backed feature ranking)

---

## Dependencies

- #265 — Bank connection API (v1.2 cornerstone)
- #301 — Receipt scanning OCR
- #270 — Family collaboration
- #813 — Bank connection trust campaign (marketing alignment)
- #831 — Partnership economics (provider decision)
- #832 — Post-launch business review (retro input)
- #833 — v2.0 business case (roadmap validation)
- All Sprint 8–9 engineering work (v1.2 scope)

---

_This document is a living plan. v1.2 timeline adjusts based on Sprint 10
engineering progress. v2.0 roadmap is a kickoff — not a commitment._
