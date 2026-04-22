# V2 Feature Specifications — Detailed Product Specs

**Issue:** #1020
**Sprint:** 12 — V2 Feature Prioritization & Specifications
**Priority:** P2 — Medium
**Status:** Complete
**Document Owner:** Product Management
**Date:** 2025-07-30
**Source Issues:** #293, #295, #299, #300, #303
**Related:** [V2 Feature Prioritization Matrix](v2-feature-prioritization-matrix.md) ·
[v1.2 Release Plan](v12-release-plan-v20-roadmap.md)

---

## Executive Summary

This document provides detailed product specifications for the 5 V2 features
identified in the prioritization matrix. Each feature is fully specified with
user stories, technical approach, platform parity requirements, acceptance
criteria, and phased implementation plan. These specs are implementation-ready
for engineering agents.

### Priority Ranking (from v2-feature-prioritization-matrix.md)

| Rank | Issue | Feature                          | Impact | Effort | Score | Phase      |
| ---- | ----- | -------------------------------- | ------ | ------ | ----- | ---------- |
| 1    | #299  | Financial health score           | 4.00   | 2.75   | 1.45  | v2.0-alpha |
| 2    | #295  | Biometric-protected categories   | 3.25   | 2.50   | 1.30  | v2.0-alpha |
| 3    | #293  | Widget support                   | 3.25   | 3.00   | 1.08  | v2.0-beta  |
| 4    | #303  | Custom report builder            | 3.25   | 3.00   | 1.08  | v2.0-beta  |
| 5    | #300  | Collaborative budget negotiation | 3.50   | 4.00   | 0.88  | v2.0       |

---

## Feature 1: Financial Health Score with Benchmarking (#299)

**Priority:** P1 — Must-Have (v2.0-alpha)
**Effort:** Medium (6–8 weeks)
**Agent Types:** KMP (core logic) + backend (benchmarking) + all platforms (UI)

### User Story

As a user, I want to see a single composite score (0–100) that reflects my
overall financial health, so I can track progress and understand which areas
need improvement. Optionally, I want to compare my score to anonymized
benchmarks of users in similar circumstances.

### Specification

#### Score Calculation (On-Device)

| Factor                  | Weight | Calculation                            | Score Range |
| ----------------------- | ------ | -------------------------------------- | ----------- |
| Savings rate            | 30%    | Monthly savings / Monthly income       | 0–100       |
| Debt-to-income ratio    | 25%    | Total debt payments / Monthly income   | 0–100       |
| Emergency fund coverage | 25%    | Savings / Monthly expenses (in months) | 0–100       |
| Budget adherence        | 20%    | Budgets under limit / Total budgets    | 0–100       |

**Composite score** = Sum of (factor score \* weight)

**Score interpretation:**

| Range  | Label      | Color  | Description                    |
| ------ | ---------- | ------ | ------------------------------ |
| 80–100 | Excellent  | Green  | Strong financial health        |
| 60–79  | Good       | Blue   | On track, room for improvement |
| 40–59  | Fair       | Yellow | Attention needed in some areas |
| 20–39  | Needs Work | Orange | Significant improvement needed |
| 0–19   | Critical   | Red    | Immediate action recommended   |

#### Benchmarking (Opt-In, Premium)

- Users can opt in to anonymous benchmarking
- Backend computes k-anonymity aggregates (minimum group size: 50)
- Benchmarks grouped by: income bracket (self-reported) and household size
- Differential privacy: noise added to prevent de-anonymization
- Backend Edge Function computes percentile rank
- Display: "Your score is higher than X% of similar users"

#### Platform UI

| Platform | Score Display               | Benchmark Display          |
| -------- | --------------------------- | -------------------------- |
| iOS      | Circular gauge in SwiftUI   | Percentile bar below score |
| Android  | Circular gauge in Compose   | Percentile bar below score |
| Web      | SVG circular gauge in React | Percentile bar below score |
| Windows  | Circular gauge in WinUI     | Percentile bar below score |

All platforms: dedicated "Health Score" tab or card on dashboard.
Score updates daily (recalculated when transactions change).
Drill-down into each factor with improvement suggestions.

### Acceptance Criteria

- [ ] Composite score (0–100) calculated on-device from 4 weighted factors
- [ ] Score displayed with color-coded interpretation on all 4 platforms
- [ ] Drill-down view shows individual factor scores with improvement tips
- [ ] Score recalculates when transactions, budgets, or goals change
- [ ] Opt-in benchmarking with k-anonymity (min group size 50)
- [ ] Differential privacy applied to benchmark aggregates
- [ ] Percentile rank displayed for premium users who opt in
- [ ] Score works offline (on-device calculation, no network needed)
- [ ] Benchmarking clearly labeled as opt-in with privacy explanation
- [ ] Score formula documented and accessible to users in-app

---

## Feature 2: Biometric-Protected Transaction Categories (#295)

**Priority:** P2 — Should-Have (v2.0-alpha)
**Effort:** Small–Medium (4–6 weeks)
**Agent Types:** KMP (logic) + all platforms (biometric APIs + UI)

### User Story

As a user, I want to mark certain spending categories (e.g., medical, therapy,
legal) as "sensitive" so they require biometric authentication to view. This
lets me hand my phone to someone without exposing private spending.

### Specification

#### Category Privacy Settings

- Per-category toggle: "Require biometric to view"
- Settings > Categories > [Category] > Privacy > Biometric Lock
- When locked, transactions in that category show as:
  - List view: blurred amount, merchant replaced with "[Protected]"
  - Charts: category appears as "Protected" with aggregated amount hidden
  - Reports: excluded unless biometrically unlocked
  - Search: transactions in protected categories excluded from results

#### Unlock Behavior

- Tap on blurred transaction or "Protected" category triggers biometric prompt
- Successful auth reveals protected data for the current session
- Session expires after 5 minutes of inactivity or app background
- User can manually re-lock via pull-down or lock button

#### Platform Biometric APIs

| Platform | API                                    | Fallback           |
| -------- | -------------------------------------- | ------------------ |
| iOS      | LocalAuthentication (Face ID/Touch ID) | Device passcode    |
| Android  | BiometricPrompt (fingerprint/face)     | Device PIN/pattern |
| Web      | WebAuthn (FIDO2)                       | Password prompt    |
| Windows  | Windows Hello (face/fingerprint/PIN)   | Windows password   |

#### Shared Household Behavior

- Protected categories are per-user (other household members see their own view)
- Protected transactions excluded from shared budget totals by default
- Owner of a shared budget can see aggregate (not individual) protected amounts

### Acceptance Criteria

- [ ] Per-category biometric lock toggle in category settings
- [ ] Protected transactions show blurred amount and "[Protected]" merchant
- [ ] Charts show "Protected" label for locked categories
- [ ] Biometric unlock reveals data for current session (5-min timeout)
- [ ] Manual re-lock option available
- [ ] Biometric APIs integrated: Face ID, Touch ID, fingerprint, Windows Hello
- [ ] Fallback to device PIN/password if biometric unavailable
- [ ] Protected data excluded from search results until unlocked
- [ ] In shared households, protected data is per-user only
- [ ] Works offline (biometric check is device-local)

---

## Feature 3: Widget Support Across All Platforms (#293)

**Priority:** P2 — Should-Have (v2.0-beta)
**Effort:** Large (8–10 weeks due to 4 platform implementations)
**Agent Types:** All platform agents (native widget frameworks)

### User Story

As a user, I want home screen widgets showing my balance, recent transactions,
and budget status at a glance without opening the app.

### Specification

#### Widget Types

| Widget           | Size   | Content                             | Update Freq |
| ---------------- | ------ | ----------------------------------- | ----------- |
| Balance          | Small  | Total balance across all accounts   | 15 min      |
| Budget Status    | Medium | Top 3 budgets with spend vs limit   | 15 min      |
| Recent Txns      | Medium | Last 5 transactions                 | 15 min      |
| Spending Summary | Large  | Category breakdown (current month)  | 1 hour      |
| Quick Entry      | Small  | Tap to open quick transaction entry | Static      |

#### Platform Implementation

**iOS — WidgetKit:**

- TimelineProvider with 15-minute refresh intervals
- Small, medium, large, extra-large (iPad) sizes
- Shared data via App Group container
- Deep link to relevant screen on tap

**Android — Glance (Jetpack):**

- GlanceAppWidget with Compose-based UI
- WorkManager for periodic data refresh
- Shared data via Room database (same as main app)
- PendingIntent for deep link on tap

**Web — Dashboard Tiles:**

- Pinnable dashboard tiles within PWA
- Service Worker background sync for data freshness
- Responsive tiles: small, medium, large layouts
- Drag-and-drop tile arrangement

**Windows — Windows Widgets:**

- Widget Provider via Adaptive Cards
- Background task for data refresh
- Shared data via local SQLite database
- Protocol activation for deep link

#### Data Security

- Widgets display data from local database (no network calls for display)
- If biometric-protected categories exist, those amounts excluded from widgets
- Encrypted data at rest applies to widget data stores
- No sensitive data (account numbers, merchant names) in widget preview

### Acceptance Criteria

- [ ] iOS WidgetKit: small (balance), medium (budget, txns), large (summary)
- [ ] Android Glance: small (balance), medium (budget, txns), large (summary)
- [ ] Web dashboard: pinnable tiles with drag-and-drop arrangement
- [ ] Windows Widgets: Adaptive Cards for all widget types
- [ ] Quick Entry widget on iOS and Android (tap to open entry screen)
- [ ] 15-minute data refresh on mobile widgets
- [ ] Deep link from widget tap to relevant app screen
- [ ] Protected category amounts excluded from widget display
- [ ] Widget data stored encrypted at rest
- [ ] Widgets work offline (read from local database)

---

## Feature 4: Custom Report Builder (#303)

**Priority:** P2 — Should-Have (v2.0-beta, Premium)
**Effort:** Large (8–10 weeks)
**Agent Types:** KMP (report engine) + all platforms (UI) + backend (sharing)

### User Story

As a premium user, I want to create custom financial reports by selecting
metrics, date ranges, and chart types, then export as PDF or share via link.

### Specification

#### Report Components (Drag-and-Drop)

| Component         | Description                          | Chart Options          |
| ----------------- | ------------------------------------ | ---------------------- |
| Spending by Cat   | Category breakdown for date range    | Pie, bar, treemap      |
| Income vs Expense | Net income over time                 | Line, bar              |
| Budget Progress   | Budget utilization across categories | Horizontal bar, gauge  |
| Net Worth Trend   | Assets minus liabilities over time   | Area chart             |
| Goal Progress     | Progress toward financial goals      | Progress bar, timeline |
| Transaction List  | Filtered transaction table           | Table with sorting     |
| Summary Stats     | Total income, expenses, savings rate | Stat cards             |
| Health Score      | Score trend over time (#299)         | Line chart             |

#### Report Building Flow

1. User taps "New Report" in Reports section
2. Selects date range (preset: this month, last month, YTD, custom)
3. Drags components from palette onto canvas
4. Configures each component (category filter, chart type)
5. Previews report
6. Exports as PDF or generates shareable link

#### Export Options

- **PDF:** Generated on-device. Includes header with date, report title, branding
- **CSV:** Raw data behind report components
- **Shareable link (Premium):** Upload encrypted report to backend, generate
  authenticated link with 30-day expiry. Viewer must authenticate.
- **Scheduled reports:** Monthly email delivery (PDF attachment)

#### Platform UI Approach

| Platform | Builder UI                        | Notes                    |
| -------- | --------------------------------- | ------------------------ |
| iOS      | Drag-and-drop stack (SwiftUI)     | Simplified mobile canvas |
| Android  | Drag-and-drop stack (Compose)     | Simplified mobile canvas |
| Web      | Full drag-and-drop canvas (React) | Best builder experience  |
| Windows  | Drag-and-drop canvas (WinUI)      | Desktop-grade builder    |

Mobile platforms use a simplified "stack" builder (vertical list of components)
rather than free-form canvas, optimized for touch interaction.

### Acceptance Criteria

- [ ] Report builder accessible from Reports section (Premium only)
- [ ] At least 8 component types available (per table above)
- [ ] Date range selection: presets + custom range picker
- [ ] Component configuration: category filter, chart type selection
- [ ] Report preview before export
- [ ] PDF export generated on-device with branding
- [ ] CSV export for raw data
- [ ] Shareable link with 30-day expiry and authentication requirement
- [ ] Scheduled monthly email reports (Premium)
- [ ] Mobile: simplified stack builder; Desktop/Web: full canvas builder
- [ ] All report generation happens on-device from local data
- [ ] Shared links use encrypted backend storage

---

## Feature 5: Collaborative Budget Negotiation (#300)

**Priority:** P3 — Nice-to-Have (v2.0, Family plan)
**Effort:** Large (8–12 weeks)
**Agent Types:** KMP + backend (CRDT sync) + all platforms

### User Story

As a household member sharing a budget, I want to propose changes to shared
budgets and have other members review and approve them, rather than one person
making unilateral changes.

### Specification

#### Proposal Workflow

1. **Propose:** Member creates proposal to change budget (amount, category, period)
2. **Notify:** Other household members receive push notification
3. **Discuss:** Comment thread on the proposal (in-app messaging)
4. **Vote:** Members approve or request changes
5. **Resolve:** Owner can accept consensus or override
6. **Apply:** Approved changes take effect immediately

#### Proposal States

| State             | Description                              | Next States            |
| ----------------- | ---------------------------------------- | ---------------------- |
| Draft             | Creator is editing, not yet submitted    | Open, Discarded        |
| Open              | Submitted for review, notifications sent | Approved, Changes Req  |
| Changes Requested | Reviewer requested modifications         | Open (revised), Closed |
| Approved          | All required approvals received          | Applied                |
| Applied           | Budget change has taken effect           | (terminal)             |
| Closed            | Proposal withdrawn or rejected           | (terminal)             |

#### Approval Rules

- **2-person household:** Both must agree (or owner overrides)
- **3+ person household:** Majority approval (or owner overrides)
- **Owner override:** Always available; logged in audit trail
- **Auto-close:** Proposals not acted on within 14 days auto-close
- **Conflict resolution:** Only one open proposal per budget at a time

#### Backend Requirements

- Proposals synced via PowerSync CRDT (conflict-free)
- Comment thread stored as append-only log
- Push notifications for proposal events
- Audit trail for all proposal state transitions

### Acceptance Criteria

- [ ] Household members can create budget change proposals
- [ ] Proposals include: target budget, proposed amount, reason text
- [ ] Push notifications sent to other members on proposal creation
- [ ] Comment thread on each proposal for discussion
- [ ] Approval/rejection voting by household members
- [ ] Owner override option with audit trail
- [ ] Approved proposals automatically update the budget
- [ ] Auto-close proposals inactive for 14 days
- [ ] One active proposal per budget at a time
- [ ] Proposal sync via PowerSync CRDT (conflict-free)
- [ ] Works on all 4 platforms with consistent UI

---

## V2 Implementation Roadmap

### Phase 1: v2.0-alpha (Weeks 1–8)

| Issue | Feature                | Agent Types         | Weeks |
| ----- | ---------------------- | ------------------- | ----- |
| #299  | Financial health score | KMP + backend + all | 1–6   |
| #295  | Biometric categories   | KMP + all platforms | 3–8   |

**Rationale:** Health score is highest priority score (1.45) and creates a
daily engagement loop. Biometric categories leverage existing biometric auth
and are a unique differentiator.

### Phase 2: v2.0-beta (Weeks 9–18)

| Issue | Feature               | Agent Types         | Weeks |
| ----- | --------------------- | ------------------- | ----- |
| #293  | Platform widgets      | All platforms       | 9–16  |
| #303  | Custom report builder | KMP + all platforms | 11–18 |

**Rationale:** Widgets drive DAU through passive engagement. Report builder
serves power users and enterprise, supporting premium retention.

### Phase 3: v2.0 (Weeks 19–24)

| Issue | Feature            | Agent Types         | Weeks |
| ----- | ------------------ | ------------------- | ----- |
| #300  | Budget negotiation | KMP + backend + all | 19–24 |

**Rationale:** Most complex feature with heaviest dependency on household
sharing maturity. Defer to final phase.

---

## Dependency Map

| Feature                 | Depends On                           | Blocks         |
| ----------------------- | ------------------------------------ | -------------- |
| #299 Health score       | Budget and goal data maturity        | #300 (context) |
| #295 Biometric cats     | Existing biometric auth (stable)     | —              |
| #293 Widgets            | Design tokens, local database access | —              |
| #303 Report builder     | Chart libraries per platform         | —              |
| #300 Budget negotiation | Household sharing, PowerSync CRDT    | —              |

---

## Acceptance Criteria Summary

- [x] All 5 V2 features have detailed product specifications
- [x] Each feature has user story, specification, and acceptance criteria
- [x] Priority ranking with Impact/Effort scoring from matrix
- [x] Platform parity requirements defined per feature
- [x] Phased implementation timeline (alpha, beta, release)
- [x] Dependencies between V2 features documented
- [x] Cross-references to v2-feature-prioritization-matrix.md
